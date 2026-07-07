// perfundimi.js — SEKSION I RI (adresa /perfundimi). PA thirrje AI (vetem kryqezim tabelash).
// Merr llojet 20/20 nga kategori_pike. Per secilin kontrollon grupe_lloje (versionet e reja te /perzgjedhja):
//  - Nese lloji gjendet brenda 'perberesit' te nje termi te bashkuar -> shfaq TERMIN e bashkuar
//    (me metrikat e reja) + nen-llojet nga grupe_nendhoje. Nese disa 20/20 bien te i njejti term -> nje here.
//  - Nese s'gjendet -> shfaqe si te /kategoria (lloji origjinal nga ide_lloje).
//
// Wiring te server.js (para app.listen):
//   const { createPerfundimiRouter } = require('./perfundimi');
//   app.use('/perfundimi', createPerfundimiRouter(pool));

const express = require('express');
const path = require('path');

function createPerfundimiRouter(pool) {
  const router = express.Router();

  router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'perfundimi.html')));

  router.get('/lloje', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      // 1) Llojet 20/20 nga kategoria (me metrikat e /ide bashke)
      const r20 = await pool.query(
        `SELECT i.emri, i.kategoria, i.note_pershtatje, i.tregu, i.potencial_global,
                i.note_hapesire, i.koha_kulm, i.fitimi_neto
         FROM kategori_pike k JOIN ide_lloje i ON i.emri = k.emri
         WHERE k.pike >= 20
         ORDER BY i.note_pershtatje DESC, i.id`);
      const njezete = r20.rows;

      // 2) Termat e bashkuar nga /perzgjedhja
      let grupe = [];
      try {
        const rg = await pool.query(
          `SELECT emri, kategoria, perberesit, note_pershtatje, tregu, potencial_global,
                  note_hapesire, koha_kulm, fitimi_neto
           FROM grupe_lloje ORDER BY note_pershtatje DESC, id`);
        grupe = rg.rows;
      } catch(e) { grupe = []; }

      // Ndihmes: per nje emer lloji, gjej termin e bashkuar qe e permban (nese eshte bashkuar vertet)
      function gjejGrup(emriLloji) {
        const key = String(emriLloji||'').trim().toLowerCase();
        for (const g of grupe) {
          const pjeset = String(g.perberesit||'').split('|').map(x => x.trim().toLowerCase()).filter(Boolean);
          if (pjeset.includes(key)) {
            return { grup: g, ubashkua: pjeset.length > 1 };
          }
        }
        return null;
      }

      const rezultat = [];
      const grupeShtuar = new Set(); // qe nje term i bashkuar te dale nje here

      for (const lloj of njezete) {
        const gj = gjejGrup(lloj.emri);
        if (gj && gj.ubashkua) {
          // eshte bashkuar -> shfaq termin e bashkuar nje here
          const gemri = gj.grup.emri;
          if (grupeShtuar.has(gemri)) continue; // tashme e shtuam
          grupeShtuar.add(gemri);
          // nen-llojet e ketij termi
          let nen = [];
          try {
            const rn = await pool.query(
              `SELECT emri, kategoria, potenciali, global, tregu, koha_kulm, hapesira, metrika3
               FROM grupe_nendhoje WHERE lloj_emri=$1
               ORDER BY COALESCE(metrika3, potenciali) DESC, potenciali DESC, id`, [gemri]);
            nen = rn.rows;
          } catch(e) { nen = []; }
          rezultat.push({
            tip: 'bashkuar',
            emri: gj.grup.emri, kategoria: gj.grup.kategoria, perberesit: gj.grup.perberesit,
            note_pershtatje: gj.grup.note_pershtatje, tregu: gj.grup.tregu,
            potencial_global: gj.grup.potencial_global, note_hapesire: gj.grup.note_hapesire,
            koha_kulm: gj.grup.koha_kulm, fitimi_neto: gj.grup.fitimi_neto,
            nendhojet: nen
          });
        } else {
          // s'u bashkua -> shfaqe si te /kategoria (origjinal), me nen-llojet nga ide_nendhoje
          let nen = [];
          try {
            const rn = await pool.query(
              `SELECT emri, kategoria, potenciali, global, tregu, koha_kulm, hapesira, metrika3
               FROM ide_nendhoje WHERE lloj_emri=$1
               ORDER BY COALESCE(metrika3, potenciali) DESC, potenciali DESC, id`, [lloj.emri]);
            nen = rn.rows;
          } catch(e) { nen = []; }
          rezultat.push({
            tip: 'origjinal',
            emri: lloj.emri, kategoria: lloj.kategoria,
            note_pershtatje: lloj.note_pershtatje, tregu: lloj.tregu,
            potencial_global: lloj.potencial_global, note_hapesire: lloj.note_hapesire,
            koha_kulm: lloj.koha_kulm, fitimi_neto: lloj.fitimi_neto,
            nendhojet: nen
          });
        }
      }

      res.json(rezultat);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return router;
}

module.exports = { createPerfundimiRouter };
