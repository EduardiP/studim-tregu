// kategoria.js — SEKSION I RI (adresa /kategoria).
// Merr te gjitha llojet nga ide_lloje dhe u jep nje note 1-20 sa i perkasin
// KATEGORISE "platforme-sherbim" (paguan per funksionin; s'shet asgje).
// Nje thirrje e vetme, GPT-5.4 Mini, temperature 0, pa web search.
// Butoni "Gjej" FSHIN te vjetrat dhe gjeneron te reja. Ruan ne tabele te re kategori_pike.
// Shfaq noten 1-20 + TE GJITHA metrikat e /ide (perputhje, hapesire, fitim neto, treg, global, kulm).
//
// Wiring te server.js (para app.listen):
//   const { createKategoriaRouter } = require('./kategoria');
//   app.use('/kategoria', createKategoriaRouter(pool, openai, MODEL));
 
const express = require('express');
const path = require('path');
const crypto = require('crypto');
 
const MODELI = 'gpt-5.4-mini';
 
const KUSHTI = `Jam duke kerkuar nje KATEGORI specifike biznesi. Per cdo lloj biznesi, vleresoje sa i perket kesaj kategorie.
 
KATEGORIA qe kerkoj (kushti):
Biznesi duhet te jete nje PLATFORME qe ofron nje FUNKSION si sherbim, ku:
1. Vlera eshte VETE FUNKSIONI/MEKANIZMI i platformes — jo nje produkt qe shitet.
2. Perdoruesit paguajne per te PERDORUR platformen (me abonim ose me pagese per perdorim/API), JO per te blere dicka.
3. Biznesi NUK shet asgje — as produkte fizike, as produkte dixhitale (kurse, template, media, asete, IP per shitje), as sherbime fizike/njerezore.
4. Funksioni i platformes i mundeson perdoruesit te arrije dicka permes saj. Kryesisht keto: (a) te LIDHET me dike/dicka, (b) te KRIJOJE dicka, (c) te AKSESOJE te dhena/informacion — POR mund te kete edhe funksione te tjera te ngjashme qe s'jane ne kete liste. Mos u kufizo vetem te keto tri; nese funksioni eshte i nje natyre te ngjashme (vlera te vete mekanizmi i platformes, jo te shitja), perfshije.
 
CFARE NUK HYN: cdo gje qe SHET nje produkt (fizik ose dixhital — perfshire kurse, template, media, asete, IP per shitje) dhe cdo sherbim qe kryhet nga njerez (jo nga platforma).
 
Gjyko sipas dhojit te BIZNESIT REAL (cfare ofron, kush paguan, per cfare paguan), JO vetem sipas titullit. Nese titulli s'e shpjegon qarte, kupto vete cfare biznesi eshte.`;
 
function createKategoriaRouter(pool, openai, MODEL) {
  const router = express.Router();
  const jobs = {};
 
  router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'kategoria.html')));
 
  if (pool) {
    pool.query(`
      CREATE TABLE IF NOT EXISTS kategori_pike (
        id SERIAL PRIMARY KEY, run TEXT, created_at TIMESTAMPTZ DEFAULT now(),
        emri TEXT, pike INT, arsye TEXT
      );
    `).catch(e => console.error('Init kategori_pike:', e.message));
  }
 
  async function llogarit(run) {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      const r = await pool.query('SELECT id, emri, kategoria, tregu, potencial_global FROM ide_lloje ORDER BY id');
      const llojet = r.rows;
      if (!llojet.length) throw new Error('S\'ka lloje te ruajtura te /ide.');
 
      const lista = llojet.map((l,i) => `${i+1}. ${l.emri} (${l.tregu||''}, global: ${l.potencial_global||''})`).join('\n');
 
      const resp = await openai.responses.create({
        model: MODELI,
        temperature: 0,
        input: [{ role: 'user', content:
`${KUSHTI}
 
Me poshte eshte lista e llojeve. Per SECILIN, jep nje note 1-20 sa i ngjan/perket kesaj kategorie (20 = plotesisht brenda kategorise; 1 = aspak).
 
Lista:
${lista}
 
Ktheji VETEM si JSON array me te njejtin RENDIT, pa markdown. Cdo element:
{"n": 1, "pike": 0, "arsye": "nje rresht shqip pse kjo note"}` }]
      });
 
      const txt = resp.output_text || '';
      const s = txt.indexOf('['), e = txt.lastIndexOf(']');
      if (s === -1 || e === -1) throw new Error('Nuk u gjet JSON');
      const arr = JSON.parse(txt.slice(s, e+1));
 
      // FSHI te vjetrat, ruaj te rejat
      await pool.query('DELETE FROM kategori_pike');
      for (const item of arr) {
        const idx = (Number(item.n)||0) - 1;
        if (idx < 0 || idx >= llojet.length) continue;
        await pool.query(
          'INSERT INTO kategori_pike (run, emri, pike, arsye) VALUES ($1,$2,$3,$4)',
          [run, llojet[idx].emri, Math.round(Number(item.pike)||0), String(item.arsye||'').slice(0,600)]);
      }
      jobs[run] = { status: 'gati' };
    } catch (e) {
      jobs[run] = { status: 'gabim', error: e.message };
    }
  }
 
  router.post('/nis', (req, res) => {
    const run = crypto.randomUUID();
    jobs[run] = { status: 'po_punon' };
    llogarit(run);
    res.json({ run });
  });
  router.get('/status/:run', (req, res) => res.json(jobs[req.params.run] || { status: 'pa_gjetur' }));
 
  // Rezultati: bashkon noten e re me TE GJITHA metrikat e /ide
  router.get('/lloje', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT i.emri, i.kategoria, i.note_pershtatje, i.tregu, i.potencial_global,
                i.note_hapesire, i.koha_kulm, i.fitimi_neto, i.arsye AS ide_arsye,
                k.pike, k.arsye AS kat_arsye
         FROM ide_lloje i
         LEFT JOIN kategori_pike k ON k.emri = i.emri
         ORDER BY COALESCE(k.pike, -1) DESC, i.note_pershtatje DESC, i.id`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
 
  return router;
}
 
module.exports = { createKategoriaRouter };
