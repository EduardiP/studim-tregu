// fitimi-neto.js — vleresim i FITIMIT NETO per llojet e ruajtura te ide_lloje.
// Model MINI (me i mencur se nano, i lire), TEMPERATURE 0 (i qendrueshem).
// Rrjedha: "Llogarit" -> shfaq rezultatin PA e ruajtur. "Ruaj" -> fshin te vjetrat, ruan te rejat.

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const MODELI = 'gpt-5.4-mini';

function createNetoRouter(pool, openai, MODEL) {
  const router = express.Router();
  const jobs = {};

  router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'neto.html')));

  if (pool) {
    pool.query(`ALTER TABLE ide_lloje ADD COLUMN IF NOT EXISTS fitimi_neto INT;`).catch(()=>{});
    pool.query(`ALTER TABLE ide_lloje ADD COLUMN IF NOT EXISTS neto_arsye TEXT;`).catch(()=>{});
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
`Ke nje liste llojesh biznesi. Per SECILIN, jep nje vleresim te FITIMIT NETO 1-10 — sa mbetet REALISHT ne xhep pas zbritjes se: shpenzimeve operative, kostos se fitimit te klientit (CAC), taksave, kostos se mirembajtjes/infrastruktures/compute, dhe cdo kostoje tjeter tipike per ate model. Bazohu ne marzhet tipike te njohura (software me abonim = marzh shume i larte; AI-agent = marzh i larte por compute e ul pak; marketplace = marzh me i ulet nga operimi/moderimi; media = varet nga trafiku; direktori = marzh i mire por kerkon audience).

10 = fitim neto shume i larte (thuajse cdo dollar hyres mbetet), 1 = shume i ulet.

Lista:
${lista}

Ktheji VETEM si JSON array me te njejtin RENDIT, pa markdown. Cdo element:
{"n": 1, "fitimi_neto": 0, "arsye": "nje rresht shqip pse ky fitim neto"}` }]
      });

      const txt = resp.output_text || '';
      const s = txt.indexOf('['), e = txt.lastIndexOf(']');
      if (s === -1 || e === -1) throw new Error('Nuk u gjet JSON');
      const arr = JSON.parse(txt.slice(s, e+1));

      const rezultat = [];
      for (const item of arr) {
        const idx = (Number(item.n)||0) - 1;
        if (idx < 0 || idx >= llojet.length) continue;
        rezultat.push({
          id: llojet[idx].id,
          emri: llojet[idx].emri,
          kategoria: llojet[idx].kategoria,
          tregu: llojet[idx].tregu,
          potencial_global: llojet[idx].potencial_global,
          fitimi_neto: Number(item.fitimi_neto)||0,
          arsye: String(item.arsye||'').slice(0,600)
        });
      }
      rezultat.sort((a,b)=>b.fitimi_neto - a.fitimi_neto);
      jobs[run] = { status: 'gati', rezultat };
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

  router.post('/ruaj/:run', async (req, res) => {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      const j = jobs[req.params.run];
      if (!j || j.status !== 'gati' || !j.rezultat) throw new Error('S\'ka rezultat për të ruajtur.');
      await pool.query('UPDATE ide_lloje SET fitimi_neto=NULL, neto_arsye=NULL');
      for (const x of j.rezultat) {
        await pool.query('UPDATE ide_lloje SET fitimi_neto=$1, neto_arsye=$2 WHERE id=$3',
          [x.fitimi_neto, x.arsye, x.id]);
      }
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/lloje', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT emri, kategoria, tregu, potencial_global, note_pershtatje, note_hapesire, fitimi_neto, neto_arsye
         FROM ide_lloje WHERE fitimi_neto IS NOT NULL ORDER BY fitimi_neto DESC, id`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

module.exports = { createNetoRouter };
