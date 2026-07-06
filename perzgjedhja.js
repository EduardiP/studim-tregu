// perzgjedhja.js — FAQE E RE (adresa /perzgjedhja). Filtron llojet: perputhje 8-10 DHE fitim neto 8-9.
// Shfaq vetem llojet fillimisht; klik -> nen-llojet e atij lloji me te gjitha metrikat. PA kosto.

const express = require('express');
const path = require('path');

function createPerzgjedhjaRouter(pool, openai, MODEL) {
  const router = express.Router();

  router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'perzgjedhja.html')));

  router.get('/llojet', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT id, emri, kategoria, note_pershtatje, tregu, potencial_global, note_hapesire, koha_kulm, fitimi_neto, neto_arsye
         FROM ide_lloje
         WHERE note_pershtatje >= 8 AND note_pershtatje <= 10
           AND fitimi_neto >= 8 AND fitimi_neto <= 9
         ORDER BY note_pershtatje DESC, fitimi_neto DESC, id`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  router.get('/nendhoje/:llojEmri', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT id, lloj_emri, kategoria, emri, potenciali, global, tregu, koha_kulm,
                hapesira, metrika3, faktoret, studiuar
         FROM ide_nendhoje WHERE lloj_emri=$1
         ORDER BY COALESCE(metrika3, potenciali) DESC, potenciali DESC, id`,
        [req.params.llojEmri]);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

module.exports = { createPerzgjedhjaRouter };
