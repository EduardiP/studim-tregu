// ide-biznesi.js — SEKSION I RI, i pavarur (adresa /ide). HAPI 1: gjetja e llojit te biznesit.
// Kerkim i MATUR, i ndare ne 2 hapa qe te mos kete timeout:
//   A) kerkim i shpejte -> kategorite kryesore te llojeve qe perputhen me kushtet.
//   B) per secilen kategori, kerkim i matur -> llojet brenda saj me 6 te dhena.
// Vetem llojet qe perputhen, pa dublikata, vetem llojet (jo nen-llojet). Ruhet ne databaz.
//
// Wiring te server.js (para app.listen):
//   const { createIdeRouter } = require('./ide-biznesi');
//   app.use('/ide', createIdeRouter(pool, openai, MODEL));
 
const express = require('express');
const path = require('path');
const crypto = require('crypto');
 
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
 
// Modeli i mire per vendim te rendesishem (ndryshoje nese emri s'ekziston te OpenAI).
const MODELI = 'gpt-5.5';
 
function nxjerrArray(text) {
  if (!text) throw new Error('Output bosh');
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s === -1 || e === -1) throw new Error('Nuk u gjet liste JSON');
  return JSON.parse(text.slice(s, e + 1));
}
 
function createIdeRouter(pool, openai, MODEL) {
  const router = express.Router();
  const jobs = {}; // run -> { status, progres, list, error }
 
  router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'ide.html')));
 
  if (pool) {
    pool.query(`
      CREATE TABLE IF NOT EXISTS ide_lloje (
        id SERIAL PRIMARY KEY, run TEXT, created_at TIMESTAMPTZ DEFAULT now(),
        emri TEXT, kategoria TEXT,
        note_pershtatje INT, tregu TEXT, potencial_global TEXT,
        note_hapesire INT, koha_kulm TEXT, arsye TEXT
      );
    `).catch(e => console.error('Init ide_lloje:', e.message));
  }
 
  // HAPI A — kategorite kryesore (kerkim i shpejte)
  async function merrKategorite() {
    const r = await openai.responses.create({
      model: MODELI,
      tools: [{ type: 'web_search' }],
      input: [{ role: 'user', content:
`${KUSHTET}
 
Bej nje kerkim TE SHKURTER ne internet dhe nxirr KATEGORITE kryesore (te gjera) te llojeve moderne te biznesit qe perputhen me kushtet e mesiperme. 8-14 kategori qe mbulojne spektrin e gjere, pa paragjykim.
Ktheji VETEM si JSON array stringjesh (emra kategorish ne shqip), pa markdown.` }]
    });
    return nxjerrArray(r.output_text);
  }
 
  // HAPI B — per nje kategori, llojet me 6 te dhena (kerkim i matur)
  async function merrLlojet(kategoria) {
    const r = await openai.responses.create({
      model: MODELI,
      tools: [{ type: 'web_search' }],
      input: [{ role: 'user', content:
`${KUSHTET}
 
Bej nje kerkim TE MATUR e te synuar ne internet (disa burime, jo shterues) dhe nxirr llojet reale te biznesit brenda kategorise "${kategoria}" qe PERPUTHEN me kushtet. Vetem lloje kryesore, pa dublikata.
 
Per SECILIN lloj jep:
- emri
- note_pershtatje: 1-10, sa perputhet ky lloj me MUA sipas kushteve (10 = perputhja me e mire; kjo mat pershtatjen me mua, JO cilesine e pergjithshme)
- tregu: "B2B" | "B2C" | "B2B2C" | "marketplace" | tjeter e shkurter
- potencial_global: "shume i larte" | "i larte" | "mesatar" | "i ulet"
- note_hapesire: 1-10, sa HAPESIRE ka tregu per nje sherbim TE RI te hyje duke plotesuar kushtet (10 = shume vend; nese eshte i suksesshem por i mbingopur = note e ulet)
- koha_kulm: vleresim kohor sa duhet, ne rastin ME TE MIRE, per te arritur kulmin e fitimit (p.sh. "3-6 muaj", "1-2 vjet") — kjo eshte VETEM informacion, jo kusht
- arsye: nje-dy rreshta shqip
 
Ktheji VETEM si JSON array, pa markdown. Cdo element:
{"emri":"","note_pershtatje":0,"tregu":"","potencial_global":"","note_hapesire":0,"koha_kulm":"","arsye":""}` }]
    });
    return nxjerrArray(r.output_text);
  }
 
  async function bejPunen(run) {
    try {
      const kategorite = await merrKategorite();
      jobs[run].progres = `0/${kategorite.length} kategori`;
 
      const seen = new Set();
      const total = [];
      let i = 0;
      for (const kat of kategorite) {
        i++;
        try {
          const llojet = await merrLlojet(kat);
          for (const m of (llojet || [])) {
            const key = String(m.emri || '').trim().toLowerCase();
            if (!key || seen.has(key)) continue; // pa dublikata
            seen.add(key);
            total.push({ ...m, kategoria: kat });
          }
        } catch (e) { /* nje kategori deshtoi — vazhdo */ }
        jobs[run].progres = `${i}/${kategorite.length} kategori`;
      }
 
      total.sort((a, b) => (Number(b.note_pershtatje)||0) - (Number(a.note_pershtatje)||0));
 
      if (pool && total.length) {
        await pool.query('DELETE FROM ide_lloje'); // pastro te vjetrat (vetem kjo tabele)
        for (const m of total) {
          await pool.query(
            `INSERT INTO ide_lloje (run, emri, kategoria, note_pershtatje, tregu, potencial_global, note_hapesire, koha_kulm, arsye)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [run, String(m.emri||'').slice(0,300), String(m.kategoria||'').slice(0,200),
             Number(m.note_pershtatje)||0, String(m.tregu||'').slice(0,60),
             String(m.potencial_global||'').slice(0,60), Number(m.note_hapesire)||0,
             String(m.koha_kulm||'').slice(0,80), String(m.arsye||'').slice(0,1000)]
          );
        }
      }
      jobs[run] = { status: 'gati', list: total };
    } catch (e) {
      jobs[run] = { status: 'gabim', error: e.message };
    }
  }
 
  router.post('/nis', (req, res) => {
    const run = crypto.randomUUID();
    jobs[run] = { status: 'po_punon', progres: 'po nis…' };
    bejPunen(run);
    res.json({ run });
  });
 
  router.get('/status/:run', (req, res) => {
    const j = jobs[req.params.run];
    if (!j) return res.json({ status: 'pa_gjetur' });
    res.json(j);
  });
 
  router.get('/lloje', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT emri, kategoria, note_pershtatje, tregu, potencial_global, note_hapesire, koha_kulm, arsye
         FROM ide_lloje ORDER BY note_pershtatje DESC, id`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
 
  return router;
}
 
module.exports = { createIdeRouter };
