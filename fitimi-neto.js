// fitimi-neto.js — shtese e vogel (adresa /neto). Merr llojet e ruajtura te tabela ide_lloje,
// vlereson FITIMIN NETO (sa mbetet ne xhep pas shpenzimeve/taksave/kostove) me nje metrike 1-10,
// dhe i rendit rishtas. Model i LIRE (gpt-5.4-nano), PA web search, NJE thirrje e vetme.

const express = require('express');
const path = require('path');
const crypto = require('crypto');

const MODEL_LIRE = 'gpt-5.4-nano';

function createNetoRouter(pool, openai, MODEL) {
  const router = express.Router();
  const jobs = {};

  router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'neto.html')));

  if (pool) {
    pool.query(`ALTER TABLE ide_lloje ADD COLUMN IF NOT EXISTS fitimi_neto INT;`).catch(()=>{});
    pool.query(`ALTER TABLE ide_lloje ADD COLUMN IF NOT EXISTS neto_arsye TEXT;`).catch(()=>{});
  }

  async function bejNeto(run) {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      const r = await pool.query('SELECT id, emri, kategoria, tregu, potencial_global FROM ide_lloje ORDER BY id');
      const llojet = r.rows;
      if (!llojet.length) throw new Error('S\'ka lloje te ruajtura te /ide.');

      const lista = llojet.map((l,i) => `${i+1}. ${l.emri} (${l.tregu||''}, global: ${l.potencial_global||''})`).join('\n');

      const resp = await openai.responses.create({
        model: MODEL_LIRE,
        input: [{ role: 'user', content:
`Ke nje liste llojesh biznesi. Per SECILIN, jep nje vleresim te FITIMIT NETO 1-10 — pra sa mbetet REALISHT ne xhep pas zbritjes se: shpenzimeve operative, kostos se fitimit te klientit (CAC), taksave, kostos se mirembajtjes/infrastruktures, dhe cdo kostoje tjeter tipike per ate model biznesi. Bazohu ne marzhet tipike te njohura te secilit model (p.sh. software me abonim ka marzh shume te larte; marketplace ka marzh me te ulet sepse ka kosto operimi/moderimi; media varet nga trafiku; etj.).

10 = fitim neto shume i larte (thuajse cdo dollar hyres mbetet), 1 = fitim neto shume i ulet (shumica shkon ne kosto).

Lista:
${lista}

Ktheji VETEM si JSON array me te njejtin RENDIT si lista, pa markdown. Cdo element:
{"n": 1, "fitimi_neto": 0, "arsye": "nje rresht shqip pse ky fitim neto"}` }]
      });

      const txt = resp.output_text || '';
      const s = txt.indexOf('['), e = txt.lastIndexOf(']');
      if (s === -1 || e === -1) throw new Error('Nuk u gjet JSON');
      const arr = JSON.parse(txt.slice(s, e+1));

      for (const item of arr) {
        const idx = (Number(item.n)||0) - 1;
        if (idx < 0 || idx >= llojet.length) continue;
        await pool.query('UPDATE ide_lloje SET fitimi_neto=$1, neto_arsye=$2 WHERE id=$3',
          [Number(item.fitimi_neto)||0, String(item.arsye||'').slice(0,600), llojet[idx].id]);
      }
      jobs[run] = { status: 'gati' };
    } catch (e) {
      jobs[run] = { status: 'gabim', error: e.message };
    }
  }

  router.post('/nis', (req, res) => {
    const run = crypto.randomUUID();
    jobs[run] = { status: 'po_punon' };
    bejNeto(run);
    res.json({ run });
  });
  router.get('/status/:run', (req, res) => res.json(jobs[req.params.run] || { status: 'pa_gjetur' }));

  router.get('/lloje', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT emri, kategoria, tregu, potencial_global, note_pershtatje, note_hapesire, fitimi_neto, neto_arsye
         FROM ide_lloje ORDER BY COALESCE(fitimi_neto,0) DESC, note_pershtatje DESC, id`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

module.exports = { createNetoRouter };
