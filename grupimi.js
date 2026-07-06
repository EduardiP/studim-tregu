// grupimi.js — /perzgjedhja/grupim/*. Tri hapa, me KUSHTET IDENTIKE me /ide dhe /neto:
//  1) BASHKIMI: GPT-5.4 bashkon vetem termat IDENTIKE/pothuajse-identike (studion biznesin, jo emrin).
//  2) RIVLERESIMI I POTENCIALIT: prompt IDENTIK me /ide (bllok KUSHTET i plote + web search, gpt-5.5).
//  3) FITIMI NETO: prompt IDENTIK me /neto (TE GJITHE termat BASHKE ne nje liste, mini + temperature 0).
// Butoni "Bashko" FSHIN te vjetrat dhe gjeneron te rejat. NUK prek ide_lloje / ide_nendhoje.
//
// Wiring te server.js (para app.listen):
//   const { attachGrupimRoutes } = require('./grupimi');
//   attachGrupimRoutes(app, pool, openai);
 
const crypto = require('crypto');
 
const MODEL_BASHKIM = 'gpt-5.4';        // per bashkimin delikat
const MODEL_IDE     = 'gpt-5.5';        // si /ide (me web search)
const MODEL_NETO    = 'gpt-5.4-mini';   // si /neto (mini, temperature 0)
 
// ===== KUSHTET IDENTIKE me /ide (kopjuar fjale-per-fjale) =====
const KUSHTET = `KUSHTET E PERDORUESIT (vlereso çdo lloj biznesi kundrejt tyre):
 
1. POTENCIALI I FITIMIT (me i forti): potencial per te ardhurat me te LARTA ne piekuri (tavan + ritem i larte parash kur maturohet). KOHA e ndertimit/rritjes NUK ka rendesi. Anon drejt llojeve GLOBALE (pa kufij gjeografike), sepse kane tavanin me te larte.
2. AUTOMATIZIM: duhet te jete kryesisht i automatizueshem — pune minimale, pa kerkuar prani nonstop te themeluesit.
3. FONDE MINIMALE: realizohet me pak ose aspak fonde, sepse mjetet/sherbimet moderne te gatshme (AI eshte NJE prej tyre, jo i vetmi — edhe no-code, sherbime ekzistuese, platforma) e mbulojne ndertimin. Sa me shume e mbulon mjeti, aq me mire; nese nuk ka mjete te tilla dhe kerkon shume para, ul pershtatshmerine.
4. NDERTUESHMERI: nga nje person i vetem me keto mjete moderne, pa ekip.
 
UDHEZIME:
- Hapesire SA ME E GJERE, pa paragjykim — te gjitha llojet moderne reale qe ekzistojne sot. Mos u kufizo te te zakonshmet (dyqane), mos anoj drejt SaaS-it apo asnje lloji te vetem. Perfshi edhe modele ku te tjeret paguajne per te qene/reklamuar te platforma e perdoruesit, marketplace, media e monetizuar, etj.
- VETEM llojet qe perputhen realisht me kushtet — jo çdo lloj. Ato qe s'perputhen, mos i perfshi.
- PA dublikata — nese dy jane ne thelb e njejta gje, jep NJE te vetem. Ndarje vetem nese jane vertet dege te ndryshme.
- Vetem LLOJET kryesore, JO nen-llojet.`;
 
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
  const jobs = {};
 
  if (pool) {
    pool.query(`
      CREATE TABLE IF NOT EXISTS grupe_lloje (
        id SERIAL PRIMARY KEY, run TEXT, created_at TIMESTAMPTZ DEFAULT now(),
        emri TEXT, kategoria TEXT, perberesit TEXT,
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
 
  // ---- HAPI B i /ide (kopjuar): vlereso nje lloj brenda kategorise se tij ----
  async function vleresoPotencial(emriRi, kategoria, perberesit) {
    const r = await openai.responses.create({
      model: MODEL_IDE,
      tools: [{ type: 'web_search' }],
      input: [{ role: 'user', content:
`${KUSHTET}
 
Bej nje kerkim TE MATUR e te synuar ne internet (disa burime, jo shterues) dhe vleresoje llojin e biznesit "${emriRi}" (kategoria: "${kategoria}"; perfshin keto qe u bashkuan: ${perberesit}) kundrejt kushteve.
 
Jep:
- note_pershtatje: 1-10, sa perputhet ky lloj me MUA sipas kushteve (10 = perputhja me e mire; kjo mat pershtatjen me mua, JO cilesine e pergjithshme)
- tregu: "B2B" | "B2C" | "B2B2C" | "marketplace" | tjeter e shkurter
- potencial_global: "shume i larte" | "i larte" | "mesatar" | "i ulet"
- note_hapesire: 1-10, sa HAPESIRE ka tregu per nje sherbim TE RI te hyje duke plotesuar kushtet (10 = shume vend; nese eshte i suksesshem por i mbingopur = note e ulet)
- koha_kulm: vleresim kohor sa duhet, ne rastin ME TE MIRE, per te arritur kulmin e fitimit (p.sh. "3-6 muaj", "1-2 vjet") — kjo eshte VETEM informacion, jo kusht
- arsye: nje-dy rreshta shqip
 
Ktheji VETEM si JSON, pa markdown:
{"note_pershtatje":0,"tregu":"","potencial_global":"","note_hapesire":0,"koha_kulm":"","arsye":""}` }]
    });
    return nxjerrObjekt(r.output_text);
  }
 
  // ---- HAPI 1+2: bashkim, pastaj potencial (nje nga nje si /ide), pastaj fitim neto (te gjithe bashke si /neto) ----
  async function bejGrupim(run) {
    try {
      if (!pool) throw new Error("S'ka databaz.");
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
 
      // FSHI te vjetrat, fillo te paster
      await pool.query('DELETE FROM grupe_nendhoje');
      await pool.query('DELETE FROM grupe_lloje');
 
      jobs[run].faza = 'Po vlereson potencialin (si /ide)…';
      jobs[run].progres = `0/${grupet.length} terma`;
 
      // Ruaj termat + potencialin nje-nga-nje (si /ide, brenda kategorise)
      const ruajtur = [];
      let i = 0;
      for (const g of grupet) {
        i++;
        const emriRi = String(g.emri_ri || g.emri || '').slice(0,300);
        const kategoria = String(g.kategoria || '').slice(0,200);
        const perberesit = Array.isArray(g.perberesit) ? g.perberesit.join(' | ') : String(g.perberesit||'');
 
        let np=0, tregu='', pg='', nh=0, kk='', arsye='';
        try {
          const o = await vleresoPotencial(emriRi, kategoria, perberesit);
          np = Number(o.note_pershtatje)||0; tregu = String(o.tregu||'').slice(0,60);
          pg = String(o.potencial_global||'').slice(0,60); nh = Number(o.note_hapesire)||0;
          kk = String(o.koha_kulm||'').slice(0,80); arsye = String(o.arsye||'').slice(0,1000);
        } catch(e) { /* nje term deshtoi — vazhdo */ }
 
        const ins = await pool.query(
          `INSERT INTO grupe_lloje (run, emri, kategoria, perberesit, note_pershtatje, tregu, potencial_global, note_hapesire, koha_kulm, arsye)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
          [run, emriRi, kategoria, perberesit.slice(0,1000), np, tregu, pg, nh, kk, arsye]);
        ruajtur.push({ id: ins.rows[0].id, emri: emriRi, tregu, potencial_global: pg });
        jobs[run].progres = `${i}/${grupet.length} terma`;
      }
 
      // FITIMI NETO — TE GJITHE termat BASHKE ne nje liste (IDENTIK me /neto)
      jobs[run].faza = 'Po llogarit fitimin neto (si /neto)…';
      try {
        const listaNeto = ruajtur.map((l,idx) => `${idx+1}. ${l.emri} (${l.tregu||''}, global: ${l.potencial_global||''})`).join('\n');
        const rn = await openai.responses.create({
          model: MODEL_NETO,
          temperature: 0,
          input: [{ role: 'user', content:
`Ke nje liste llojesh biznesi. Per SECILIN, jep nje vleresim te FITIMIT NETO 1-10 — sa mbetet REALISHT ne xhep pas zbritjes se: shpenzimeve operative, kostos se fitimit te klientit (CAC), taksave, kostos se mirembajtjes/infrastruktures/compute, dhe cdo kostoje tjeter tipike per ate model. Bazohu ne marzhet tipike te njohura (software me abonim = marzh shume i larte; AI-agent = marzh i larte por compute e ul pak; marketplace = marzh me i ulet nga operimi/moderimi; media = varet nga trafiku; direktori = marzh i mire por kerkon audience).
 
10 = fitim neto shume i larte (thuajse cdo dollar hyres mbetet), 1 = shume i ulet.
 
Lista:
${listaNeto}
 
Ktheji VETEM si JSON array me te njejtin RENDIT, pa markdown. Cdo element:
{"n": 1, "fitimi_neto": 0, "arsye": "nje rresht shqip pse ky fitim neto"}` }]
        });
        const arr = nxjerrArray(rn.output_text);
        for (const item of arr) {
          const idx = (Number(item.n)||0) - 1;
          if (idx < 0 || idx >= ruajtur.length) continue;
          await pool.query('UPDATE grupe_lloje SET fitimi_neto=$1, neto_arsye=$2 WHERE id=$3',
            [Number(item.fitimi_neto)||0, String(item.arsye||'').slice(0,600), ruajtur[idx].id]);
        }
      } catch(e) { /* neto deshtoi — vazhdo */ }
 
      jobs[run] = { status: 'gati' };
    } catch (e) {
      jobs[run] = { status: 'gabim', error: e.message };
    }
  }
 
  // ---- Nen-llojet per termat e rinj (si /nendhoje kerkimi A) ----
  const KUSHTET_NEND = `KUSHTET E PERDORUESIT (hierarki):
- KRYESORI (renditesi mbi te gjithe): potencial per fitimin ME TE LARTE ne kohen ME TE SHKURTER ne piekuri. Koha e ndertimit s'ka rendesi; anon nga llojet GLOBALE.
- PAS TIJ, por te detyrueshme: automatizim per themeluesin (menaxhim minimal, pa prani nonstop); i ndertueshem nga nje person me mjete/njohuri moderne; kosto e ulet ndertimi.
- Nen-llojet qe i plotesojne SA ME MIRE te gjitha keto bashke jane me te miret (potenciali pesha kryesore).`;
 
  async function bejNendhoje(run) {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      const rL = await pool.query('SELECT emri FROM grupe_lloje ORDER BY note_pershtatje DESC, id');
      const llojet = rL.rows.map(x=>x.emri);
      if (!llojet.length) throw new Error('S\'ka terma. Bej bashkimin se pari.');
      await pool.query('DELETE FROM grupe_nendhoje');
      jobs[run].progres = `0/${llojet.length} terma`;
      let i = 0;
      for (const llojEmri of llojet) {
        i++;
        try {
          const r = await openai.responses.create({
            model: MODEL_IDE,
            tools: [{ type: 'web_search' }],
            input: [{ role: 'user', content:
`${KUSHTET_NEND}
 
Merr llojin e biznesit "${llojEmri}". Bej nje kerkim TE SHKURTER e te matur (jo te thelle, pa ekzagjerim) dhe nxirr nen-llojet reale qe ka ky lloj. Grupoji sipas kategorive natyrale qe i gjen VETE. Vetem nen-lloje reale, pa dublikata, pa e fryre numrin.
 
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
        } catch (e) { /* vazhdo */ }
        jobs[run].progres = `${i}/${llojet.length} terma`;
      }
      jobs[run] = { status: 'gati' };
    } catch (e) {
      jobs[run] = { status: 'gabim', error: e.message };
    }
  }
 
  // ---- Rruget ----
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
 
