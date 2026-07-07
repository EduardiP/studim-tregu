// automatizimet.js — SEKSION I RI (adresa /automatizimet). PA thirrje AI (vetem lexon databazen).
// Merr TE GJITHA boshllëqet e automatizimit nga hapesira_rreshta (kolona='automatizim'),
// te renditura nga nota me e larte te me e ulet, ku secili tregon te cili nen-lloj (dhe term) ben pjese.
//
// Wiring te server.js (para app.listen):
//   const { createAutomatizimetRouter } = require('./automatizimet');
//   app.use('/automatizimet', createAutomatizimetRouter(pool));

const express = require('express');
const path = require('path');

function createAutomatizimetRouter(pool) {
  const router = express.Router();

  router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'automatizimet.html')));

  router.get('/lista', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT r.pershkrim, r.vleresim, r.ekziston,
                s.nendhoj_emri, s.lloj_emri
         FROM hapesira_rreshta r
         JOIN hapesira_studim s ON s.id = r.studim_id
         WHERE r.kolona = 'automatizim'
         ORDER BY r.vleresim DESC, r.id`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

module.exports = { createAutomatizimetRouter };
