// gjetesi.js — Gjetesi i biznesit (adresa /gjetesi). Niset nga KUSHTET personale (jo nga nen-lloj).
// Per 7 NIVELE:
//   LOGJIKA (gpt-5.5, pa web search): kap NJE ide te madhe brenda fushes/kushteve.
//     - Nese ideja e meparshme doli e MIRE (pak konkurrence) -> fokusohu te fushat TJERA.
//     - Nese doli e DOBET (shume konkurrence) -> mbaje edhe ate fushe ne loje.
//   KERKIMI (gpt-5.4, me web search): a ka konkurrence per kete ide?
//   VLERESIM 1-100: sa i pershtatet kushteve (madhesi + kushtet + konkurrenca).
// 7 ide te ndryshme gjithsej. Pune ne SFOND; ruhet pas cdo niveli (mbijeton nderprerjen).
//
// Wiring te server.js (para app.listen):
//   const { attachGjetesiRoutes } = require('./gjetesi');
//   attachGjetesiRoutes(app, pool, openai);

const crypto = require('crypto');

const MODEL_LOGJIKE = 'gpt-5.5';   // arsyetimi (pa web search)
const MODEL_KERKIM  = 'gpt-5.4';   // verifikimi (me web search)

const NIVELE = 7;

const KUSHTET = `KUSHTET E MIA (strikte — biznesi duhet t'i plotesoje TE GJITHA):

POTENCIALI:
- Fitim i madh + rritje GLOBALE (pa kufij gjeografike) + hapesire e madhe ne treg.
- Fitim i madh ne kohe te shkurter kur te kete arritur produktivitetin (ose fitim i madh ditor ne pjekuri).
- Duhet te jete nje PROJEKT/KATEGORI E MADHE (mbulon nje sektor a kategori te madhe), JO nje vegel e vogel.

NDERTIMI DHE MENAXHIMI:
- I ndertueshem nga NJE person me AI (Claude) + sherbime moderne.
- I automatizueshem ne menaxhim me KODIN PRIVAT te vete aplikacionit qe ndertohet (jo ekip, madje pak edhe pa mua).

KATEGORIA (kufi FIKS — mos dil jashte):
- VETEM sherbime qe ofrojne FUNKSIONIN ose VLEREN si sherbim, ose TE DHENAT, ose NDERMJETESIMIN. Nje nga keto.
- NUK shet produkte (as fizike, as dixhitale, as veshje, as asgje te tille).
- NUK jane programe modifikimi apo sherbime "te uleta".
- Fushat ku ndihem vetja: shkence, filozofi, te dhena, AI, biznese, ndermjetesim, dhe te ngjashme intelektuale.

VLERA QE MUND TE OFROJ (perveç funksionit kryesor):
- Fitimi i parave per klientin (klienti paguan sepse fiton).
- Automatizimi (ia heq klientit punen manuale).
Keto jane vlere e biznesit tim, pervec funksionit/vleres/te dhenave/ndermjetesimit qe ofron.

SHPIRTI (i rendesishem):
- Biznesi duhet te me jape nje lloj vlere si INTELEKTUAL ose mbeshtetes i dickaje qe njerezimi ka nevoje.
- Duhet te jete dicka ku UNE GJEJ VETEN — jo dicka qe behet me zor thjesht sepse ka fitim.

100 = pershtatje maksimale me te gjitha keto; 1 = shume e dobet.`;

function nxjerrObjekt(text) {
  if (!text) throw new Error('Output bosh');
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('Nuk u gjet JSON');
  return JSON.parse(text.slice(s, e + 1));
}

function attachGjetesiRoutes(app, pool, openai) {
  const jobs = {}; // run -> { status, faza, progres }

  if (pool) {
    pool.query(`
      CREATE TABLE IF NOT EXISTS gjetesi_ide (
        id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(),
        run TEXT,
        niveli INT,
        ideja TEXT,
        fusha TEXT,
        konkurrenca TEXT,
        vleresim INT
      );
    `).catch(e => console.error('Init gjetesi tabela:', e.message));
  }

  // LOGJIKA: kap NJE ide te re (gpt-5.5, pa web search)
  async function logjiko(nivel, dhenat) {
    const { idete_meparshme, fusha_te_mira, fusha_te_dobeta } = dhenat;
    const rl = await openai.responses.create({
      model: MODEL_LOGJIKE,
      input: [{ role: 'user', content:
`${KUSHTET}

Detyra: perdor LOGJIKE TE FORTE (jo kerkim ne internet) per te gjetur NJE ide biznesi te vetme, te madhe (nje kategori/sektor i madh, jo vegel), qe i pershtatet TE GJITHA kushteve me siper — sidomos shpirtit (ku gjej veten, vlere intelektuale). Perpiqu ta PERSOSESH ate nje ide (jo disa te cekëta).

${idete_meparshme ? `IDETE QE TASHME JANE PROPOZUAR (mos i perserit — jep nje TJETER, te ndryshme):\n${idete_meparshme}\n` : ''}
${fusha_te_mira ? `FUSHA QE TASHME DHANE NJE IDE TE MIRE (largohu prej tyre — eksploro fusha TJERA):\n${fusha_te_mira}\n` : ''}
${fusha_te_dobeta ? `FUSHA QE DHANE IDE TE DOBET (mund t'i provosh serish, bashke me te reja):\n${fusha_te_dobeta}\n` : ''}

Jep NJE ide te vetme, si pershkrim i qarte (4-8 fjali): cfare eshte biznesi, cfare funksioni/vlere ofron, pse i pershtatet kushteve, dhe ne cilen FUSHE ben pjese (shkence/filozofi/te dhena/AI/biznese/ndermjetesim/etj).

Ktheji VETEM si JSON, pa markdown:
{"ideja":"pershkrimi i plote i ides","fusha":"fusha kryesore ku ben pjese"}` }]
    });
    const o = nxjerrObjekt(rl.output_text);
    return { ideja: String(o.ideja||'').trim(), fusha: String(o.fusha||'').trim() };
  }

  // KERKIMI: a ka konkurrence (gpt-5.4, me web search, i cekët)
  async function verifiko(ideja) {
    const rk = await openai.responses.create({
      model: MODEL_KERKIM,
      tools: [{ type: 'web_search' }],
      input: [{ role: 'user', content:
`${KUSHTET}

Ideja e biznesit qe po verifikojme:
${ideja}

Detyra (KERKIM I SHPEJTE — mos hyr thelle, 1-3 kerkime mjaftojne):
1. Kerko VETEM lojtaret KRYESORE qe e mbulojne realisht kete ide (nese ka). Mos liso çdo konkurrent — vetem kryesoret. Nese pas 1-3 kerkimesh s'gjen konkurrent kryesor, ndalo.
2. Cakto "ka_konkurrent": true nese ka te pakten nje lojtar kryesor qe e mbulon; false nese s'ka.
3. Jep VLERESIM 1-100 sa i pershtatet kjo ide TE GJITHA kushteve te mia: madhesia/potenciali, kategoria e lejuar, ndertueshmeria nga nje person, shpirti (fushat intelektuale ku gjej veten), dhe KONKURRENCA (sa e zene). Nese e zene nga lojtare te medhenj, vleresim i ulet.

Ktheji VETEM si JSON, pa markdown:
{"konkurrenca":"","ka_konkurrent":true,"vleresim":0}` }]
    });
    const o = nxjerrObjekt(rk.output_text);
    return {
      konkurrenca: String(o.konkurrenca||'').slice(0,2000),
      ka_konkurrent: o.ka_konkurrent !== false,
      vleresim: Math.round(Number(o.vleresim)||0)
    };
  }

  async function bejGjetjen(run) {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      await pool.query('DELETE FROM gjetesi_ide WHERE run=$1', [run]).catch(()=>{});

      const idete = [];        // pershkrimet e ideve te meparshme
      const fushaMira = [];    // fushat qe dhane ide te mire
      const fushaDobeta = [];  // fushat qe dhane ide te dobet

      for (let nivel = 1; nivel <= NIVELE; nivel++) {
        jobs[run].faza = `Niveli ${nivel}/${NIVELE}: po logjikon…`;
        jobs[run].progres = `${nivel-1}/${NIVELE} ide`;

        // LOGJIKA
        let ideja, fusha;
        try {
          const r = await logjiko(nivel, {
            idete_meparshme: idete.length ? idete.map((x,i)=>`${i+1}. ${x}`).join('\n') : '',
            fusha_te_mira: fushaMira.length ? fushaMira.join(', ') : '',
            fusha_te_dobeta: fushaDobeta.length ? fushaDobeta.join(', ') : ''
          });
          ideja = r.ideja; fusha = r.fusha;
        } catch(e) {
          // logjika deshtoi -> ruaj arsyen dhe vazhdo
          await ruaj(run, nivel, `(logjika deshtoi: ${e.message})`, '', '', 0);
          continue;
        }
        if (!ideja) { await ruaj(run, nivel, '(logjika s\'ktheu ide)', fusha, '', 0); continue; }

        // KERKIMI
        jobs[run].faza = `Niveli ${nivel}/${NIVELE}: po verifikon…`;
        let konkurrenca = '', vleresim = 0, kaKonkurrent = true;
        try {
          const v = await verifiko(ideja);
          konkurrenca = v.konkurrenca; vleresim = v.vleresim; kaKonkurrent = v.ka_konkurrent;
        } catch(e) { konkurrenca = `(verifikimi deshtoi: ${e.message})`; vleresim = 0; }

        // RUAJ menjehere (mbijeton nderprerjen)
        await ruaj(run, nivel, ideja, fusha, konkurrenca, vleresim);

        // Perditeso shenimet per nivelin tjeter
        idete.push(ideja);
        if (fusha) {
          if (kaKonkurrent) { if (!fushaDobeta.includes(fusha)) fushaDobeta.push(fusha); }
          else { if (!fushaMira.includes(fusha)) fushaMira.push(fusha); }
        }
        jobs[run].progres = `${nivel}/${NIVELE} ide`;
      }

      jobs[run] = { status: 'gati' };
    } catch (e) {
      jobs[run] = { status: 'gabim', error: e.message };
    }
  }

  async function ruaj(run, nivel, ideja, fusha, konkurrenca, vleresim) {
    await pool.query(
      `INSERT INTO gjetesi_ide (run, niveli, ideja, fusha, konkurrenca, vleresim)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [run, nivel, String(ideja||'').slice(0,3000), String(fusha||'').slice(0,300),
       String(konkurrenca||'').slice(0,2000), Math.round(Number(vleresim)||0)]);
  }

  // ---- Rruget ----
  app.get('/gjetesi', (req, res) => res.sendFile(require('path').join(__dirname, 'gjetesi.html')));

  app.post('/gjetesi/nis', (req, res) => {
    const run = crypto.randomUUID();
    jobs[run] = { status: 'po_punon', faza: 'po nis…', progres: `0/${NIVELE} ide` };
    bejGjetjen(run); // ne sfond — s'e presim
    res.json({ run });
  });

  app.get('/gjetesi/status/:run', (req, res) => res.json(jobs[req.params.run] || { status: 'pa_gjetur' }));

  // Rezultatet e nje run (ose te fundit)
  app.get('/gjetesi/rezultat/:run', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT niveli, ideja, fusha, konkurrenca, vleresim FROM gjetesi_ide
         WHERE run=$1 ORDER BY vleresim DESC, niveli`, [req.params.run]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  // Run-i i fundit (per te ngarkuar kur hapet faqja)
  app.get('/gjetesi/fundit', async (req, res) => {
    if (!pool) return res.json({ run: null, rows: [] });
    try {
      const rr = await pool.query('SELECT run FROM gjetesi_ide ORDER BY created_at DESC LIMIT 1');
      if (!rr.rows.length) return res.json({ run: null, rows: [] });
      const run = rr.rows[0].run;
      const r = await pool.query(
        `SELECT niveli, ideja, fusha, konkurrenca, vleresim FROM gjetesi_ide
         WHERE run=$1 ORDER BY vleresim DESC, niveli`, [run]);
      res.json({ run, rows: r.rows });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return { };
}

module.exports = { attachGjetesiRoutes };
