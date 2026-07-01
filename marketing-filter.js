// marketing-filter.js — SEKSION I RI, i ndare nga pjesa ekzistuese.
// Filtron metodat e marketingut te ruajtura (lloji='marketing') ne 3 nivele:
//   NIVELI 1: po/jo/ndoshta per te gjitha (logjike, PA kerkim, grupe te medha). Te treja ruhen.
//   NIVELI 2: vetem "po"-te — vleresim me logjike (PA kerkim): kohe, funksionim, potencial, kombinim.
//   NIVELI 3: 10 me te mirat — kerkim i matur ne internet (jo shterues) per saktesim.
// Rezultatet ruhen ne tabela te reja; s'prekin tabelen 'metodat'.
//
// Wiring te server.js-i ekzistues:
//   const { createMarketingFilterRouter } = require('./marketing-filter');
//   app.use('/filter', createMarketingFilterRouter(pool, openai, MODEL));
// Pastaj hap:  <linku-yt>/filter
 
const express = require('express');
const crypto = require('crypto');
 
// ---- Kushtet e tua (te ngulitura ketu; ndryshoji lirisht) ----
const KUSHTET = `PROFILI I BIZNESIT:
- Model: dropshipping / print-on-demand (produktet vijne nga Printify, listohen ne dyqanin Shopify; fitim me komision per shitje).
- Nisha: permbajtje qesharake/meme, stil vintage, me dizajne te krijuara me AI; moderne.
- Sinjali kryesor i klientit: blerES individE nga SHBA (B2C).
 
KUFIZIME TE FORTA (nese nje metode i kerkon keto, ajo NUK funksionon per tani):
- NUK ka entitet ligjor te regjistruar.
- NUK ka llogari bankare amerikane.
- Buxhet i vogel: ~100-150 USD/muaj.
- Duhet te jete kryesisht FALAS ose me kosto te ulet.
- Duhet te jete i AUTOMATIZUESHEM (pa pune manuale nonstop).
 
PREFERENCA:
- Pranohen edhe metoda qe sjellin klientE me vonese (jo vetem te menjEhershme), nese jane te qendrueshme.
- Vlere e larte per metoda qe punojne ne sfond me nderhyrje minimale.
- Mund te shtohet kod (app lidhet me API te Printify/Shopify).`;
 
function grupo(arr, madhesia) {
  const out = [];
  for (let i = 0; i < arr.length; i += madhesia) out.push(arr.slice(i, i + madhesia));
  return out;
}
 
function nxjerrJson(text, hapDaka = '[', mbyllDaka = ']') {
  if (!text) throw new Error('Output bosh');
  const s = text.indexOf(hapDaka), e = text.lastIndexOf(mbyllDaka);
  if (s === -1 || e === -1) throw new Error('Nuk u gjet JSON');
  return JSON.parse(text.slice(s, e + 1));
}
 
function createMarketingFilterRouter(pool, openai, MODEL) {
  const router = express.Router();
  const path = require('path');
  router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'filter.html')));
  const jobs = {}; // id -> { status, faza, progres, error }


  // Tabelat e reja (te ndara nga 'metodat')
  if (pool) {
    pool.query(`
      CREATE TABLE IF NOT EXISTS filter_nivel1 (
        id SERIAL PRIMARY KEY, run TEXT, created_at TIMESTAMPTZ DEFAULT now(),
        emri TEXT, kategoria TEXT, vendim TEXT, arsye TEXT
      );
      CREATE TABLE IF NOT EXISTS filter_rezultat (
        id SERIAL PRIMARY KEY, run TEXT, created_at TIMESTAMPTZ DEFAULT now(),
        emri TEXT, kategoria TEXT,
        kohe TEXT, funksionim INT, potencial INT,
        kombinim TEXT, thelluar BOOLEAN DEFAULT false, sqarim TEXT
      );
    `).catch(e => console.error('Init filter tabela:', e.message));
  }
 
  // ---------- NIVELI 1: po/jo/ndoshta (logjike, pa kerkim) ----------
  async function nivel1(run) {
    const r = await pool.query("SELECT emri, kategoria FROM metodat WHERE lloji='marketing' ORDER BY id");
    const metodat = r.rows;
    const grupet = grupo(metodat, 60); // ~60 per thirrje, vetem emrat
    let i = 0;
    for (const grup of grupet) {
      i++;
      const lista = grup.map((m, idx) => `${idx + 1}. ${m.emri}`).join('\n');
      const resp = await openai.responses.create({
        model: MODEL,
        input: [{ role: 'user', content:
`${KUSHTET}
 
Poshte eshte nje liste metodash marketingu. Per SECILEN, vendos me LOGJIKEN tende (PA kerkim ne internet) nese eshte e perdorshme per kete biznes me keto kufizime:
- "po"      = mund ta perdore realisht tani
- "jo"      = perplaset me nje kufizim te forte (entitet, banke amerikane, buxhet i madh, pune manuale nonstop)
- "ndoshta" = jo direkt, por ka nje kend alternativ qe mund ta bente te perdorshme
 
Lista:
${lista}
 
Ktheji VETEM si JSON array, pa markdown. Cdo element:
{"emri":"<emri i sakte>","vendim":"po|jo|ndoshta","arsye":"nje rresht i shkurter shqip"}` }]
      });
      let vleresimet = [];
      try { vleresimet = nxjerrJson(resp.output_text); } catch (e) { vleresimet = []; }
      const byName = {};
      for (const v of vleresimet) byName[String(v.emri || '').trim().toLowerCase()] = v;
      for (const m of grup) {
        const v = byName[String(m.emri).trim().toLowerCase()] || { vendim: 'ndoshta', arsye: 's\'u vleresua' };
        await pool.query(
          'INSERT INTO filter_nivel1 (run, emri, kategoria, vendim, arsye) VALUES ($1,$2,$3,$4,$5)',
          [run, m.emri, m.kategoria, v.vendim || 'ndoshta', v.arsye || '']
        );
      }
      jobs[run].progres = `Niveli 1: ${i}/${grupet.length} grupe`;
    }
  }
 
  // ---------- NIVELI 2: vetem "po"-te, vleresim me logjike (pa kerkim) ----------
  async function nivel2(run) {
    const r = await pool.query("SELECT emri, kategoria FROM filter_nivel1 WHERE run=$1 AND vendim='po' ORDER BY id", [run]);
    const pot = r.rows;
    const grupet = grupo(pot, 25);
    let i = 0;
    for (const grup of grupet) {
      i++;
      const lista = grup.map((m, idx) => `${idx + 1}. ${m.emri} (${m.kategoria})`).join('\n');
      const resp = await openai.responses.create({
        model: MODEL,
        input: [{ role: 'user', content:
`${KUSHTET}
 
Vlereso me LOGJIKE (PA kerkim ne internet) secilen metode marketingu me poshte, per kete biznes:
${lista}
 
Per secilen jep:
- kohe: "shpejt" ose "vonese"  (a sjell klientE shpejt apo me kohe)
- funksionim: 1-5  (sa mund te funksionoje realisht me keto kufizime)
- potencial: 1-5   (sa klientE mund te sjelle ne maje)
- kombinim: nje fjali e shkurter si kombinohet konkretisht me kete biznes (nisha meme/vintage, POD, pa entitet)
 
Ktheji VETEM si JSON array, pa markdown. Cdo element:
{"emri":"<emri i sakte>","kohe":"shpejt|vonese","funksionim":0,"potencial":0,"kombinim":"shqip"}` }]
      });
      let vleresimet = [];
      try { vleresimet = nxjerrJson(resp.output_text); } catch (e) { vleresimet = []; }
      for (const v of vleresimet) {
        const kat = (grup.find(g => String(g.emri).trim().toLowerCase() === String(v.emri || '').trim().toLowerCase()) || {}).kategoria || '';
        await pool.query(
          `INSERT INTO filter_rezultat (run, emri, kategoria, kohe, funksionim, potencial, kombinim)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [run, v.emri, kat, v.kohe || '', Number(v.funksionim) || 0, Number(v.potencial) || 0, v.kombinim || '']
        );
      }
      jobs[run].progres = `Niveli 2: ${i}/${grupet.length} grupe`;
    }
  }
 
  // ---------- NIVELI 3: 10 me te mirat — kerkim i matur ne internet ----------
  async function nivel3(run) {
    const r = await pool.query(
      `SELECT id, emri, kategoria FROM filter_rezultat WHERE run=$1
       ORDER BY (funksionim + potencial) DESC, potencial DESC LIMIT 10`, [run]);
    const top = r.rows;
    let i = 0;
    for (const m of top) {
      i++;
      try {
        const resp = await openai.responses.create({
          model: MODEL,
          tools: [{ type: 'web_search' }],
          input: [{ role: 'user', content:
`${KUSHTET}
 
Bej nje kerkim TE SHKURTER e te synuar ne internet (jo shterues, disa burime mjaftojne) per metoden e marketingut: "${m.emri}".
Sakteso KONKRETISHT si mund ta perdore ky biznes (nisha meme/vintage POD, blerES nga SHBA, PA entitet ligjor, PA banke amerikane, buxhet ~100-150 USD/muaj, i automatizueshem).
Jep nje paragraf te shkurter, praktik: cfare hapash konkrete, cfare veglash, cfare kufizimesh reale duke pasur parasysh mungesen e entitetit/bankes.
Ktheje VETEM si JSON objekt, pa markdown:
{"sqarim":"paragraf i shkurter shqip me hapa konkrete"}` }]
        });
        let obj = {};
        try { obj = nxjerrJson(resp.output_text, '{', '}'); } catch (e) { obj = { sqarim: '' }; }
        await pool.query('UPDATE filter_rezultat SET thelluar=true, sqarim=$1 WHERE id=$2', [obj.sqarim || '', m.id]);
      } catch (e) { /* kalo tek tjetra */ }
      jobs[run].progres = `Niveli 3: ${i}/${top.length} metoda`;
    }
  }
 
  async function bejGjithcka(run) {
    try {
      jobs[run].faza = 'niveli1'; await nivel1(run);
      jobs[run].faza = 'niveli2'; await nivel2(run);
      jobs[run].faza = 'niveli3'; await nivel3(run);
      jobs[run] = { status: 'gati', run };
    } catch (e) {
      jobs[run] = { status: 'gabim', error: e.message };
    }
  }
 
  // Nis procesin
  router.post('/nis', (req, res) => {
    if (!pool) return res.status(500).json({ error: 'S\'ka databaz.' });
    const run = crypto.randomUUID();
    jobs[run] = { status: 'po_punon', faza: 'nis', progres: 'po nis…' };
    bejGjithcka(run);
    res.json({ run });
  });
 
  router.get('/status/:run', (req, res) => {
    const j = jobs[req.params.run];
    if (!j) return res.json({ status: 'pa_gjetur' });
    res.json(j);
  });
 
  // Rezultatet finale (renditur nga me e mira)
  router.get('/rezultat/:run', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT emri, kategoria, kohe, funksionim, potencial, kombinim, thelluar, sqarim
         FROM filter_rezultat WHERE run=$1
         ORDER BY (funksionim + potencial) DESC, potencial DESC`, [req.params.run]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
 
  // Nivel 1 i plote (po/jo/ndoshta) per shqyrtim me vone
  router.get('/nivel1/:run', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        'SELECT emri, kategoria, vendim, arsye FROM filter_nivel1 WHERE run=$1 ORDER BY vendim, kategoria, emri',
        [req.params.run]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
 
  return router;
}
 
module.exports = { createMarketingFilterRouter };
