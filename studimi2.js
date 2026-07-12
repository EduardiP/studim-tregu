// studimi2.js — Studim i thelluar per NJE ide biznesi B2B (adresa /studimi2).
// STRUKTURA:
//   2 NIVELE (2 ide te ndryshme). Cdo nivel thellohet me MAKSIMUM 3 logjikime + 3 kerkime.
//   NIVELI 1:
//     Logjikim 1 (gpt-5.5): gjen llojin e biznesit + nje ide (mbimurim, brenda kushteve).
//     Kerkim 1 (gpt-5.4): gjen VETEM konkurrentet e vertete + DEFEKTET e tyre (i cekët, i shpejtë).
//     Nese konkurrenca eshte shume e dobet -> ndal (u gjet hapesira).
//     Nese ka konkurrence (mesatare/fortë) -> Logjikim 2: rafinon iden duke studjuar defektet -> Kerkim 2.
//     Nese ende ka konkurrence DHE modifikimi ka potencial -> Logjikim 3 -> Kerkim 3.
//     (Maksimum 3 logjikime brenda nje ideje. Te gjitha rafinimet brenda ides se pare.)
//   NIVELI 2: nje ide TJETER (pervec asaj te nivelit 1), po ashtu me deri 3 logjikime+kerkime.
//   VLERESIM 1-100 per cdo nivel (sa i ploteson ideja kushtet).
// Pune ne SFOND (Railway s'e nderpret), ruajtje pas cdo hapi, kerkim i cekët (s'merr orë).
//
// Wiring te server.js (para app.listen):
//   const { attachStudimi2Routes } = require('./studimi2');
//   attachStudimi2Routes(app, pool, openai);

const crypto = require('crypto');

const MODEL_LOGJIKE = 'gpt-5.5';   // arsyetimi (pa web search)
const MODEL_KERKIM  = 'gpt-5.4';   // verifikimi (me web search)

const NIVELE = 2;                  // 2 ide te ndryshme
const MAKS_LOGJIKIME = 3;          // maksimum 3 logjikime (+3 kerkime) per ide

const KUSHTET = `KUSHTET E MIA (strikte — ideja duhet t'i plotesoje TE GJITHA):

LLOJI I BIZNESIT:
- VETEM sherbim per BIZNESE (B2B) — jo per individe.
- Bizneset duhet te kene nevoje per sherbimin VAZHDIMISHT pas ndertimit — abonim qe zgjat SHUME (churn i ulet). Sherbimi behet pjese e punes se tyre, ndaj s'e heqin.

POTENCIALI:
- Fitim i madh + rritje GLOBALE (pa kufij) + hapesire e madhe.
- Fitim i madh ne kohe te shkurter kur te kete arritur pjekurine, pra per shembull biznese qe nxjerrin fitimin me te lart mujor.

NDERTIMI DHE MENAXHIMI:
- I ndertueshem nga NJE person me kod + AI (Claude) dhe me sherbiem te tjera qe nuk kerkon aftesi, me fonde minimale.
- I automatizueshem: pas ndertimit, S'KA nevoje per mua vazhdimisht, pervec nese mudnt e kerkoj gjetjen e bizneseve abonent —  dhe vetem ndonje mirembajtje. Mund te jete edhe nje vegel apo sherbim i vecat, jo domosdoshmerisht platforme e madhe.

MONETIZIMI (pa entitet ligjor):
- Duhet te jete i monetizueshem pa entitet ligjor (Lemon Squeezy / Paddle-friendly) apo pa kerkuar qe te jem fizkisht ne shab apo  pa kerkuar qe te kem bank amerikane, pra Lemon Queezy eshte nje i till por gjtihahtu edhe per te tjera qe plotesosj keto kushte, mjafton teplotesojnketo kushte : UNE shes sherbimin dhe UNE marr parate. Biznesi  NUK mban parate e te tjereve (jo money transmission), NUK eshte me pagesa mes palesh, NUK eshte sherbim njerezor (puna ime personale me dore).
- AI mund te jete VEÇORI (lejohet) apo mjet qe kryen funksione ne biznes, por JO si sherbim kryesor kryesor.

MARKETINGU (i sigurt):
- Duhet te kete nje MARKETPLACE ku sherbimi listohet, qe: (a) me pranon PA entitet ligjor, (b) me lejon te terheq fitimet nga Shqiperia, (c) sjell TRAFIK ORGANIK (kliente te gatshem, pa pasur nevoje te shpenzoj shume per t'i gjetur). 
- OSE nje menyre ku klientet gjenden lehte pa marketing te kushtueshem.

SIGURIA (jo supozim):
- Duhet PROVE apo siguri se ideja funksionon — jo thjesht "ka hapesire" dhe ndertimi dhe puna te bazohet mbi fat 100%. P.sh. ekzistojne biznese qe FITOJNE nga dicka e ngjashme (prove se bizneset paguajne).

100 = ploteson maksimalisht te gjitha keto; 1 = shume e dobet.`;

function nxjerrObjekt(text) {
  if (!text) throw new Error('Output bosh');
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('Nuk u gjet JSON');
  return JSON.parse(text.slice(s, e + 1));
}

function attachStudimi2Routes(app, pool, openai) {
  const jobs = {}; // run -> { status, faza, progres }

  if (pool) {
    pool.query(`
      CREATE TABLE IF NOT EXISTS studimi2_hapa (
        id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(),
        run TEXT,
        niveli INT,            -- 1 ose 2 (cila ide)
        logjikimi INT,         -- 1,2,3 brenda nivelit
        ideja TEXT,            -- pershkrimi i ides ne kete hap
        lloji TEXT,            -- lloji i biznesit
        konkurrenca TEXT,      -- konkurrentet e vertete + defektet
        forca_konkurrences TEXT, -- 'dobet' | 'mesatare' | 'forte'
        vleresim INT           -- 1-100
      );
    `).catch(e => console.error('Init studimi2 tabela:', e.message));
  }

  // ---- LOGJIKIMI 1 (fillestar): lloji i biznesit + ide me mbimurim ----
  async function logjikoFillestar(idete_e_tjera) {
    const rl = await openai.responses.create({
      model: MODEL_LOGJIKE,
      input: [{ role: 'user', content:
`${KUSHTET}

Detyra (LOGJIKIM I FORTE, pa kerkim ne internet):
1. Se pari, mendo cilat LLOJE biznesesh (B2B) i pershtaten me se miri TE GJITHA kushteve te mia — sidomos ku bizneset kane nevoje VAZHDIMISHT per sherbimin (abonim qe zgjat shume).
2. Zgjill lojin me te mir ne baz te kushteve te mia dhe te logjieks tende per te kuptuar cili dhoj apo kategori sherbimi eshte me i miri, gjej NJE ide te vetme sherbimi/vegle B2B me potencial te larte qe mund te ket iden e "Mbimurimit". MBIMURIM = mos ndertosh dicka qe dikush e ka ndertuar tashme; mendo si duhet te funksionoje biznesi im sipas kushteve, dhe gjej nje hapesire qe ka potencial edhe pse ndoshta askush s'e ka bere ende, OSE dicka ku sherbimet ekzistuese kane DEFEKTE (automatizim i dobet, kosto e larte, vonesa, kan defekte en sherbim etje etj) qe une mund t'i zgjidh per te qene me unik.
${idete_e_tjera ? `\nMOS propozo keto ide (jane studjuar tashme):\n${idete_e_tjera}\n` : ''}
Jep NJE ide te vetme, te qarte (5-9 fjali): cfare eshte sherbimi, cilit lloj biznesi i sherben, pse bizneset do te kene nevoje VAZHDIMISHT, si i ploteson kushtet (monetizim pa entitet, marketplace me trafik, ndertim nga nje person, etj.).

Ktheji VETEM si JSON, pa markdown:
{"lloji":"lloji i biznesit","ideja":"pershkrimi i plote i ides"}` }]
    });
    const o = nxjerrObjekt(rl.output_text);
    return { lloji: String(o.lloji||'').trim(), ideja: String(o.ideja||'').trim() };
  }

  // ---- LOGJIKIMI i rafinimit: studion defektet e konkurrenteve, modifikon iden ----
  async function logjikoRafinim(lloji, idejaAktuale, konkurrenca) {
    const rl = await openai.responses.create({
      model: MODEL_LOGJIKE,
      input: [{ role: 'user', content:
`${KUSHTET}

Lloji i biznesit: "${lloji}".
Ideja aktuale:
${idejaAktuale}

Kerkimi gjeti keta konkurrente te vertete dhe DEFEKTET e tyre:
${konkurrenca}

Detyra (LOGJIKIM I FORTE, pa kerkim):
Studio DEFEKTET e konkurrenteve (automatizim i dobet, kosto e larte, vonesa, mungese permiresimi, etj.) dhe MODIFIKO iden time qe te jete me UNIKE — duke zgjidhur ato defekte ose duke mbuluar nje hapesire qe ata s'e mbulojne ose dhe duke dnryshuar funksionimin e ides per te mbuluar dicka qe nuk e mbuljn ata si funksion biznesi. Pra Ndrysho disa funksione nese duhet, POR qendro brenda hapesirave me POTENCIAL TE LARTE (jo dicka te vogel pa vlere). Modifikimi duhet te mbetet brenda te gjitha kushteve te mia.

Ne fund, thuaj a mbetet HAPESIRE E KONSIDERUESHME per nje biznes te tille pas modifikimit (jo dicka e vogel pa potencial).

Ktheji VETEM si JSON, pa markdown:
{"ideja":"ideja e modifikuar e plote","ka_hapesire_te_konsiderueshme":true}` }]
    });
    const o = nxjerrObjekt(rl.output_text);
    return {
      ideja: String(o.ideja||'').trim(),
      ka_hapesire: o.ka_hapesire_te_konsiderueshme !== false
    };
  }

  // ---- KERKIMI: vetem konkurrentet e vertete + defektet + forca + vleresim ----
  async function kerko(lloji, ideja) {
    const rk = await openai.responses.create({
      model: MODEL_KERKIM,
      tools: [{ type: 'web_search' }],
      input: [{ role: 'user', content:
`${KUSHTET}

Lloji: "${lloji}".
Ideja qe po verifikojme:
${ideja}

Detyra (KERKIM I SHPEJTE — SHUME E RENDESISHME: mos hy thelleper cdo ide te mundhme vetem ato qe mund te mbulojn qart ekte ide timen.):
1. Gjej VETEM konkurrentet e VERTETE — ata qe bejne PIKERISHT dicka te tille. MOS liso çdo ide te mundshme apo te larget ne treg; vetem lojtaret e verte qe e mbulojne kete ide konkretisht. Nese pas 1-3 kerkimesh s'gjen konkurrent te vertete, ndalo.
2. Per konkurrentet qe gjen, trego DEFEKTET e tyre nese duken (automatizim i dobet, kosto e larte, vonesa, sherbim i papermiresuar, ankesa perdoruesish, mungesa te tjera per nej sherbim te tille etj etj) — keto me ndihmojne t'i permiresoj.
3. Cakto forcen e konkurrences: "dobet" (pothuajse s'ka konkurrent te vertete), "mesatare" (ka disa por me defekte/te fragmentuar), "forte" (e mbuluar mire nga lojtare te medhenj).
4. Jep VLERESIM 1-100 sa i ploteson kjo ide TE GJITHA kushtet e mia (potenciali, B2B me abonim afatgjate, kerkes epr te qen te abonuar vazhdimisht, ndertim nga nje person, monetizim pa entitet, marketplace me trafik, prova qe funksionon), duke marre parasysh konkurrencen etj etj.

Ktheji VETEM si JSON, pa markdown:
{"konkurrenca":"konkurrentet e vertete + defektet e tyre","forca":"dobet|mesatare|forte","vleresim":0}` }]
    });
    const o = nxjerrObjekt(rk.output_text);
    return {
      konkurrenca: String(o.konkurrenca||'').slice(0,2500),
      forca: String(o.forca||'mesatare').toLowerCase().trim(),
      vleresim: Math.round(Number(o.vleresim)||0)
    };
  }

  async function ruaj(run, niveli, logjikimi, ideja, lloji, konkurrenca, forca, vleresim) {
    await pool.query(
      `INSERT INTO studimi2_hapa (run, niveli, logjikimi, ideja, lloji, konkurrenca, forca_konkurrences, vleresim)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [run, niveli, logjikimi, String(ideja||'').slice(0,3500), String(lloji||'').slice(0,300),
       String(konkurrenca||'').slice(0,2500), String(forca||''), Math.round(Number(vleresim)||0)]);
  }

  // Studion NJE nivel (nje ide, deri 3 logjikime+kerkime). Kthen pershkrimin e ides per ta perjashtuar ne nivelin tjeter.
  async function studjoNivel(run, niveli, idete_e_tjera) {
    // Logjikimi 1 (fillestar)
    jobs[run].faza = `Niveli ${niveli}: logjikimi 1…`;
    const f = await logjikoFillestar(idete_e_tjera);
    let lloji = f.lloji, ideja = f.ideja;
    if (!ideja) { await ruaj(run, niveli, 1, '(logjika s\'ktheu ide)', lloji, '', '', 0); return ''; }

    // Kerkimi 1
    jobs[run].faza = `Niveli ${niveli}: kerkimi 1…`;
    let k = await kerko(lloji, ideja);
    await ruaj(run, niveli, 1, ideja, lloji, k.konkurrenca, k.forca, k.vleresim);

    // Nese konkurrenca eshte SHUME E DOBET -> ndal (u gjet hapesira)
    if (k.forca === 'dobet') return ideja;

    // Rafinime (logjikim 2, 3) — vetem nese ka konkurrence mesatare/forte
    for (let lg = 2; lg <= MAKS_LOGJIKIME; lg++) {
      jobs[run].faza = `Niveli ${niveli}: logjikimi ${lg} (rafinim)…`;
      const r = await logjikoRafinim(lloji, ideja, k.konkurrenca);
      ideja = r.ideja;

      // Nese modifikimi s'jep hapesire te konsiderueshme -> ndal kete nivel (do provohet ide tjeter ne nivelin pasues)
      if (!r.ka_hapesire) {
        await ruaj(run, niveli, lg, ideja + '\n\n(Modifikimi s\'jep hapesire te konsiderueshme — ndalohet ky nivel.)', lloji, k.konkurrenca, k.forca, k.vleresim);
        return ideja;
      }

      jobs[run].faza = `Niveli ${niveli}: kerkimi ${lg}…`;
      k = await kerko(lloji, ideja);
      await ruaj(run, niveli, lg, ideja, lloji, k.konkurrenca, k.forca, k.vleresim);

      // Nese tani konkurrenca u be e dobet -> u gjet hapesira, ndal
      if (k.forca === 'dobet') return ideja;
    }
    return ideja;
  }

  async function bejStudimin(run) {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      await pool.query('DELETE FROM studimi2_hapa WHERE run=$1', [run]).catch(()=>{});

      const idete = []; // pershkrimet e ideve te studjuara (per t'i perjashtuar)
      for (let niveli = 1; niveli <= NIVELE; niveli++) {
        jobs[run].progres = `Niveli ${niveli-0}/${NIVELE}`;
        const ideja = await studjoNivel(run, niveli, idete.length ? idete.map((x,i)=>`${i+1}. ${x}`).join('\n\n') : '');
        if (ideja) idete.push(ideja);
      }
      jobs[run] = { status: 'gati' };
    } catch (e) {
      jobs[run] = { status: 'gabim', error: e.message };
    }
  }

  // ---- Rruget ----
  app.get('/studimi2', (req, res) => res.sendFile(require('path').join(__dirname, 'studimi2.html')));

  app.post('/studimi2/nis', (req, res) => {
    const run = crypto.randomUUID();
    jobs[run] = { status: 'po_punon', faza: 'po nis…', progres: '' };
    bejStudimin(run); // sfond
    res.json({ run });
  });

  app.get('/studimi2/status/:run', (req, res) => res.json(jobs[req.params.run] || { status: 'pa_gjetur' }));

  app.get('/studimi2/rezultat/:run', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT niveli, logjikimi, ideja, lloji, konkurrenca, forca_konkurrences, vleresim
         FROM studimi2_hapa WHERE run=$1 ORDER BY niveli, logjikimi`, [req.params.run]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/studimi2/fundit', async (req, res) => {
    if (!pool) return res.json({ run: null, rows: [] });
    try {
      const rr = await pool.query('SELECT run FROM studimi2_hapa ORDER BY created_at DESC LIMIT 1');
      if (!rr.rows.length) return res.json({ run: null, rows: [] });
      const run = rr.rows[0].run;
      const r = await pool.query(
        `SELECT niveli, logjikimi, ideja, lloji, konkurrenca, forca_konkurrences, vleresim
         FROM studimi2_hapa WHERE run=$1 ORDER BY niveli, logjikimi`, [run]);
      res.json({ run, rows: r.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return { };
}

module.exports = { attachStudimi2Routes };
