// grupimi.js — SEKSION I RI (nen /perzgjedhja/grupim/*). Tri hapa:
//  1) BASHKIMI: GPT-5.4 studion BIZNESIN real te 36 llojeve te filtruara (perputhje 8-10 & neto 8-9)
//     dhe bashkon VETEM ato identike/pothuajse-identike (dallime te vogla qe mund te behen nen-lloje).
//     Jo bashkim ne baze emri. Ruhet ne grupe_lloje (tabele e re).
//  2) RIVLERESIMI: per cdo term te ri, studimi si /ide (perputhje+metrikat, web search) DHE si /neto (fitim neto).
//  3) NEN-LLOJET (buton 2): per termat e rinj, logjika e /nendhoje. Ruhet ne grupe_nendhoje (tabele e re).
// NUK prek ide_lloje / ide_nendhoje.
//
// Wiring te server.js (para app.listen):
//   const { attachGrupimRoutes } = require('./grupimi');
//   attachGrupimRoutes(app, pool, openai);
 
const crypto = require('crypto');
 
const MODEL_BASHKIM = 'gpt-5.4';   // me i mire se mini, jo me i shtrenjti; per gjykim delikat
const MODEL_STUDIM  = 'gpt-5.5';   // si te /ide dhe /nendhoje (me web search)
const MODEL_NETO    = 'gpt-5.4-mini'; // si te /neto (mini, temperature 0)
 
const KUSHTET_IDE = `KUSHTET E PERDORUESIT (vlereso cdo lloj biznesi kundrejt tyre):
 
1. POTENCIALI I FITIMIT (me i forti): potencial per te ardhurat me te LARTA ne piekuri (tavan + ritem i larte parash kur maturohet). KOHA e ndertimit/rritjes NUK ka rendesi. Anon drejt llojeve GLOBALE (pa kufij gjeografike), sepse kane tavanin me te larte.
2. AUTOMATIZIM: duhet te jete kryesisht i automatizueshem — pune minimale, pa kerkuar prani nonstop te themeluesit.
3. FONDE MINIMALE: realizohet me pak ose aspak fonde, sepse mjetet/sherbimet moderne te gatshme (AI eshte NJE prej tyre, jo i vetmi — edhe no-code, sherbime ekzistuese, platforma) e mbulojne ndertimin.
4. NDERTUESHMERI: nga nje person i vetem me keto mjete moderne, pa ekip.`;
 
const KUSHTET_NEND = `KUSHTET E PERDORUESIT (hierarki):
- KRYESORI (renditesi mbi te gjithe): potencial per fitimin ME TE LARTE ne kohen ME TE SHKURTER ne piekuri. Koha e ndertimit s'ka rendesi; anon nga llojet GLOBALE.
- PAS TIJ, por te detyrueshme: automatizim per themeluesin (menaxhim minimal, pa prani nonstop); i ndertueshem nga nje person me mjete/njohuri moderne; kosto e ulet ndertimi.
- Nen-llojet qe i plotesojne SA ME MIRE te gjitha keto bashke jane me te miret (potenciali pesha kryesore).`;
 
function nxjerrArray(text) {
  if (!text) throw new Error('Output bosh');
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s === -1 || e === -1) throw new Error('Nuk u gjet liste JSON');
  return JSON.parse(text.slice(s, e + 1));
}
function nxjerrObjekt(text) {
  if (!text) throw new Error('Output bosh');
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('Nuk u gjet JSON');
  return JSON.parse(text.slice(s, e + 1));
}
 
function attachGrupimRoutes(app, pool, openai) {
  const jobs = {}; // run -> { status, faza, progres, error }
 
  if (pool) {
    pool.query(`
      CREATE TABLE IF NOT EXISTS grupe_lloje (
        id SERIAL PRIMARY KEY, run TEXT, created_at TIMESTAMPTZ DEFAULT now(),
        emri TEXT, kategoria TEXT,
        perberesit TEXT,          -- emrat origjinale te bashkuar (te ndare me ' | ')
        note_pershtatje INT, tregu TEXT, potencial_global TEXT,
        note_hapesire INT, koha_kulm TEXT, arsye TEXT,
        fitimi_neto INT, neto_arsye TEXT
      );
      CREATE TABLE IF NOT EXISTS grupe_nendhoje (
        id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(),
        lloj_emri TEXT, kategoria TEXT, emri TEXT,
        potenciali INT, global TEXT, tregu TEXT, koha_kulm TEXT,
        hapesira INT, metrika3 REAL, faktoret TEXT, studiuar BOOLEAN DEFAULT false
      );
    `).catch(e => console.error('Init grupe tabela:', e.message));
  }
 
  // ---------- HAPI 1+2: bashkim (GPT-5.4) pastaj rivleresim (/ide + /neto) ----------
  async function bejGrupim(run) {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      // Merr llojet e filtruara: perputhje 8-10 DHE neto 8-9
      const r = await pool.query(
        `SELECT emri, kategoria, tregu, potencial_global FROM ide_lloje
         WHERE note_pershtatje BETWEEN 8 AND 10 AND fitimi_neto BETWEEN 8 AND 9
         ORDER BY note_pershtatje DESC, id`);
      const llojet = r.rows;
      if (!llojet.length) throw new Error('S\'ka lloje qe kalojne filtrin (8-10 & 8-9).');
 
      jobs[run].faza = 'Po bashkon llojet identike…';
 
      const lista = llojet.map((l,i)=>`${i+1}. ${l.emri}  [kategoria: ${l.kategoria||''}; tregu: ${l.tregu||''}]`).join('\n');
 
      const resp = await openai.responses.create({
        model: MODEL_BASHKIM,
        input: [{ role: 'user', content:
`Me poshte ke nje liste LLOJESH biznesi. Detyra jote: bashko VETEM ato qe jane IDENTIKE ose POTHUAJSE IDENTIKE ne thelbin e biznesit.
 
SI TE GJYKOSH (kritike):
- Mos gjyko sipas EMRIT/titullit. Studio BIZNESIN REAL te secilit: (a) cfare prodhon/ofron, (b) kujt ia shet, (c) si fiton para. Nese termi i dhene s'e shpjegon qarte, kupto vete cfare biznesi eshte para se te vendosesh.
- Bashko dy ose me shume VETEM nese pergjigjet per (a)+(b)+(c) jane ne thelb TE NJEJTA — pra jane e njejta gje me terma te ndryshem. Dallime te VOGLA (qe do te dilnin gjithsesi si nen-lloje me vone) lejohen brenda nje grupi.
- MOS bashko lloje qe kane nje dallim REAL ne biznes (klient tjeter, model fitimi tjeter, koncept tjeter madhesie si SaaS vs Micro-SaaS). Keto MBETEN te ndara.
- Nese nje lloj s'ka asnje identik, mbetet VET (grup me nje element). Nuk eshte qellim te ulet numri — vetem te heqim perseritjet e verteta.
 
Per SECILIN grup jep nje EMER te ri perfaqesues (i qarte, ne shqip) dhe listen e emrave origjinale qe perben grupin (saktesisht si ne liste).
 
LLOJET:
${lista}
 
Ktheji VETEM si JSON array, pa markdown. Cdo element eshte nje grup:
{"emri_ri":"emri perfaqesues","kategoria":"kategoria e pergjithshme","perberesit":["emri origjinal 1","emri origjinal 2"]}
Nese nje lloj mbetet vet, ktheje si grup me nje perberes te vetem.` }]
      });
 
      const grupet = nxjerrArray(resp.output_text);
      if (!grupet.length) throw new Error('AI s\'ktheu grupe.');
 
      // Pastro tabelat e reja (fillojme te paster)
      await pool.query('DELETE FROM grupe_nendhoje');
      await pool.query('DELETE FROM grupe_lloje');
 
      jobs[run].faza = 'Po rivlereson (potencial + hapesire + fitim neto)…';
      jobs[run].progres = `0/${grupet.length} terma`;
 
      let i = 0;
      for (const g of grupet) {
        i++;
        const emriRi = String(g.emri_ri || g.emri || '').slice(0,300);
        const kategoria = String(g.kategoria || '').slice(0,200);
        const perberesit = Array.isArray(g.perberesit) ? g.perberesit.join(' | ') : String(g.perberesit||'');
 
        // --- Rivleresimi si /ide (me web search) ---
        let np=0, tregu='', pg='', nh=0, kk='', arsye='';
        try {
          const ri = await openai.responses.create({
            model: MODEL_STUDIM,
            tools: [{ type: 'web_search' }],
            input: [{ role: 'user', content:
`${KUSHTET_IDE}
 
Vlereso llojin e biznesit "${emriRi}" (perfshin: ${perberesit}). Bej nje kerkim TE MATUR e te synuar ne internet (disa burime, jo shterues).
 
Jep:
- note_pershtatje: 1-10, sa perputhet ky lloj me MUA sipas kushteve (10 = perputhja me e mire; mat pershtatjen me mua, JO cilesine e pergjithshme)
- tregu: "B2B" | "B2C" | "B2B2C" | "marketplace" | tjeter e shkurter
- potencial_global: "shume i larte" | "i larte" | "mesatar" | "i ulet"
- note_hapesire: 1-10, sa HAPESIRE ka tregu per nje sherbim TE RI te hyje duke plotesuar kushtet (10 = shume vend; i mbingopur = note e ulet)
- koha_kulm: vleresim kohor per te arritur kulmin e fitimit ne rastin ME TE MIRE (p.sh. "6-18 muaj") — vetem informacion
- arsye: nje-dy rreshta shqip
 
Ktheji VETEM si JSON, pa markdown:
{"note_pershtatje":0,"tregu":"","potencial_global":"","note_hapesire":0,"koha_kulm":"","arsye":""}` }]
          });
          const o = nxjerrObjekt(ri.output_text);
          np = Number(o.note_pershtatje)||0; tregu = String(o.tregu||'').slice(0,60);
          pg = String(o.potencial_global||'').slice(0,60); nh = Number(o.note_hapesire)||0;
          kk = String(o.koha_kulm||'').slice(0,80); arsye = String(o.arsye||'').slice(0,1000);
        } catch(e) { /* nje term deshtoi ne /ide — vazhdo me neto */ }
 
        // --- Fitimi neto si /neto (mini, temperature 0) ---
        let fneto=0, narsye='';
        try {
          const rn = await openai.responses.create({
            model: MODEL_NETO,
            temperature: 0,
            input: [{ role: 'user', content:
`Jep nje vleresim te FITIMIT NETO 1-10 per llojin e biznesit "${emriRi}" — sa mbetet REALISHT ne xhep pas zbritjes se shpenzimeve operative, CAC, taksave, mirembajtjes/infrastruktures/compute, dhe cdo kostoje tjeter tipike. Bazohu ne marzhet tipike te njohura (software me abonim = marzh shume i larte; AI-agent = i larte por compute e ul pak; marketplace = me i ulet nga operimi; media = varet nga trafiku; direktori = i mire por kerkon audience).
10 = fitim neto shume i larte, 1 = shume i ulet.
 
Ktheji VETEM si JSON, pa markdown:
{"fitimi_neto":0,"arsye":"nje rresht shqip"}` }]
          });
          const on = nxjerrObjekt(rn.output_text);
          fneto = Number(on.fitimi_neto)||0; narsye = String(on.arsye||'').slice(0,600);
        } catch(e) { /* neto deshtoi — vazhdo */ }
 
        await pool.query(
          `INSERT INTO grupe_lloje (run, emri, kategoria, perberesit, note_pershtatje, tregu, potencial_global, note_hapesire, koha_kulm, arsye, fitimi_neto, neto_arsye)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [run, emriRi, kategoria, perberesit.slice(0,1000), np, tregu, pg, nh, kk, arsye, fneto, narsye]);
 
        jobs[run].progres = `${i}/${grupet.length} terma`;
      }
 
      jobs[run] = { status: 'gati' };
    } catch (e) {
      jobs[run] = { status: 'gabim', error: e.message };
    }
  }
 
  // ---------- HAPI 3: nen-llojet per termat e rinj (si /nendhoje kerkimi A) ----------
  async function bejNendhoje(run) {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      const rL = await pool.query('SELECT emri FROM grupe_lloje ORDER BY note_pershtatje DESC, id');
      const llojet = rL.rows.map(x=>x.emri);
      if (!llojet.length) throw new Error('S\'ka terma te bashkuar. Bej grupimin se pari.');
 
      await pool.query('DELETE FROM grupe_nendhoje');
      jobs[run].progres = `0/${llojet.length} terma`;
 
      let i = 0;
      for (const llojEmri of llojet) {
        i++;
        try {
          const r = await openai.responses.create({
            model: MODEL_STUDIM,
            tools: [{ type: 'web_search' }],
            input: [{ role: 'user', content:
`${KUSHTET_NEND}
 
Merr llojin e biznesit "${llojEmri}". Bej nje kerkim TE SHKURTER e te matur (jo te thelle) dhe nxirr nen-llojet reale qe ka ky lloj. Grupoji sipas kategorive natyrale qe i gjen VETE. Vetem nen-lloje reale, pa dublikata, pa e fryre numrin.
 
Per SECILIN nen-lloj jep:
- emri, kategoria
- potenciali: 1-10 (potenciali fitimi me i lart ne kohen me te shkurter, pesha kryesore)
- global: "po" ose "jo"
- tregu: "B2B" | "B2C" | "B2B2C" | "marketplace" | tjeter
- koha_kulm: p.sh. "6-18 muaj" — informacion
 
Ktheji VETEM si JSON array, pa markdown. Cdo element:
{"emri":"","kategoria":"","potenciali":0,"global":"","tregu":"","koha_kulm":""}` }]
          });
          const nen = nxjerrArray(r.output_text);
          for (const m of (nen || [])) {
            await pool.query(
              `INSERT INTO grupe_nendhoje (lloj_emri, kategoria, emri, potenciali, global, tregu, koha_kulm)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [llojEmri, String(m.kategoria||'').slice(0,200), String(m.emri||'').slice(0,300),
               Number(m.potenciali)||0, String(m.global||'').slice(0,10),
               String(m.tregu||'').slice(0,60), String(m.koha_kulm||'').slice(0,80)]);
          }
        } catch (e) { /* nje term deshtoi — vazhdo */ }
        jobs[run].progres = `${i}/${llojet.length} terma`;
      }
      jobs[run] = { status: 'gati' };
    } catch (e) {
      jobs[run] = { status: 'gabim', error: e.message };
    }
  }
 
  // ---------- Rruget ----------
  app.post('/perzgjedhja/grupim/nis', (req, res) => {
    const run = crypto.randomUUID();
    jobs[run] = { status: 'po_punon', faza: 'po nis…' };
    bejGrupim(run);
    res.json({ run });
  });
  app.get('/perzgjedhja/grupim/status/:run', (req, res) => res.json(jobs[req.params.run] || { status: 'pa_gjetur' }));
 
  app.post('/perzgjedhja/grupim/nendhoje/nis', (req, res) => {
    const run = crypto.randomUUID();
    jobs[run] = { status: 'po_punon', faza: 'po nis…' };
    bejNendhoje(run);
    res.json({ run });
  });
  app.get('/perzgjedhja/grupim/nendhoje/status/:run', (req, res) => res.json(jobs[req.params.run] || { status: 'pa_gjetur' }));
 
  // Te dhenat e grupeve
  app.get('/perzgjedhja/grupim/llojet', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT emri, kategoria, perberesit, note_pershtatje, tregu, potencial_global, note_hapesire, koha_kulm, fitimi_neto, neto_arsye
         FROM grupe_lloje ORDER BY note_pershtatje DESC, fitimi_neto DESC, id`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  app.get('/perzgjedhja/grupim/nendhoje/:llojEmri', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT lloj_emri, kategoria, emri, potenciali, global, tregu, koha_kulm, hapesira, metrika3, faktoret, studiuar
         FROM grupe_nendhoje WHERE lloj_emri=$1
         ORDER BY COALESCE(metrika3, potenciali) DESC, potenciali DESC, id`, [req.params.llojEmri]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
}
 
module.exports = { attachGrupimRoutes };
 
