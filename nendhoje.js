// nendhoje.js — FAZA 2 (adresa /nendhoje). Degezimi & studimi i nen-llojeve.
// KERKIMI A (buton "Gjej nen-llojet"): per TE GJITHA llojet e gjeneruara (nga tabela ide_lloje),
//   i ndare ne pjese (lloj pas lloji) qe Railway te mos shkeputet. Per çdo nen-lloj:
//   emri, kategoria, potenciali(1-10), global, tregu(B2B/C), koha_kulm. Kerkim jo i thelle.
// KERKIMI B (buton "Studjo hapesiren", per nje nen-lloj te zgjedhur nga carousel):
//   vetem nese potenciali 5-10. Fokus VETEM te hapesira, baza "tua bej me te lehte / plveso
//   dicka qe mungon", e pershtatur me llojin; fillon nga automatizim + kosto me e ulet, pa
//   perjashtuar te tjerat nese lejojne; nese lloji s'ka lidhje me automatizim, s'e perfshin.
//   Jep: hapesira(1-10) + metrika e trete (potencial*0.6 + hapesire*0.4) + faktoret.
//
// Wiring te server.js (para app.listen):
//   const { createNendhojeRouter } = require('./nendhoje');
//   app.use('/nendhoje', createNendhojeRouter(pool, openai, MODEL));
 
const express = require('express');
const path = require('path');
const crypto = require('crypto');
 
const MODELI = 'gpt-5.5';
 
const KUSHTET = `KUSHTET E PERDORUESIT (hierarki):
- KRYESORI (renditesi mbi te gjithe): potencial per fitimin ME TE LARTE ne kohen ME TE SHKURTER ne piekuri. Koha e ndertimit s'ka rendesi; anon nga llojet GLOBALE.
- PAS TIJ, por te detyrueshme: automatizim per themeluesin (menaxhim minimal, pa prani nonstop); i ndertueshem nga nje person me mjete/njohuri moderne; kosto e ulet ndertimi.
- Nen-llojet qe i plotesojne SA ME MIRE te gjitha keto bashke jane me te miret (potenciali pesha kryesore).`;
 
function nxjerrArray(text) {
  if (!text) throw new Error('Output bosh');
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s === -1 || e === -1) throw new Error('Nuk u gjet liste JSON');
  return JSON.parse(text.slice(s, e + 1));
}
 
function createNendhojeRouter(pool, openai, MODEL) {
  const router = express.Router();
  const jobsA = {}; // run -> { status, progres, error }
  const jobsB = {}; // run -> { status, error }
 
  router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'nendhoje.html')));
 
  if (pool) {
    pool.query(`
      CREATE TABLE IF NOT EXISTS ide_nendhoje (
        id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(),
        lloj_emri TEXT, kategoria TEXT, emri TEXT,
        potenciali INT, global TEXT, tregu TEXT, koha_kulm TEXT,
        -- nga kerkimi B:
        hapesira INT, metrika3 REAL, faktoret TEXT, studiuar BOOLEAN DEFAULT false
      );
    `).catch(e => console.error('Init ide_nendhoje:', e.message));
  }
 
  // ===== KERKIMI A: per nje lloj, nxirr nen-llojet (jo i thelle) =====
  async function nenllojetPerLloj(llojEmri) {
    const r = await openai.responses.create({
      model: MODELI,
      tools: [{ type: 'web_search' }],
      input: [{ role: 'user', content:
`${KUSHTET}
 
Merr llojin e biznesit "${llojEmri}". Bej nje kerkim TE SHKURTER e te matur (jo te thelle, pa ekzagjerim) dhe nxirr nen-llojet reale qe ka ky lloj. Grupoji sipas kategorive natyrale qe i gjen VETE (mos imponoj nje ndarje fikse). Vetem nen-lloje reale, pa dublikata, pa e fryre numrin.
 
Per SECILIN nen-lloj jep:
- emri: emri i nen-llojit
- kategoria: kategoria natyrale ku ben pjese
- potenciali: 1-10 (sa perputhet me kushtin kryesor + te tjerat; potenciali fitimi me i lart ne kohen me te shkurter, pesha kryesore)
- global: "po" ose "jo"
- tregu: "B2B" | "B2C" | "B2B2C" | "marketplace" | tjeter
- koha_kulm: vleresim i perafert kohor per te arritur kulmin e fitimit (p.sh. "6-18 muaj", "1-3 vjet") — informacion
 
Ktheji VETEM si JSON array, pa markdown. Cdo element:
{"emri":"","kategoria":"","potenciali":0,"global":"","tregu":"","koha_kulm":""}` }]
    });
    return nxjerrArray(r.output_text);
  }
 
  async function bejA(run) {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      const rL = await pool.query('SELECT emri FROM ide_lloje ORDER BY note_pershtatje DESC, id');
      const llojet = rL.rows.map(x => x.emri);
      if (!llojet.length) throw new Error('S\'ka lloje. Gjenero te /ide se pari.');
 
      await pool.query('DELETE FROM ide_nendhoje'); // fillojme te paster
      jobsA[run].progres = `0/${llojet.length} lloje`;
 
      let i = 0;
      for (const llojEmri of llojet) {
        i++;
        try {
          const nen = await nenllojetPerLloj(llojEmri);
          for (const m of (nen || [])) {
            await pool.query(
              `INSERT INTO ide_nendhoje (lloj_emri, kategoria, emri, potenciali, global, tregu, koha_kulm)
               VALUES ($1,$2,$3,$4,$5,$6,$7)`,
              [llojEmri, String(m.kategoria||'').slice(0,200), String(m.emri||'').slice(0,300),
               Number(m.potenciali)||0, String(m.global||'').slice(0,10),
               String(m.tregu||'').slice(0,60), String(m.koha_kulm||'').slice(0,80)]
            );
          }
        } catch (e) { /* nje lloj deshtoi — vazhdo */ }
        jobsA[run].progres = `${i}/${llojet.length} lloje`;
      }
      jobsA[run] = { status: 'gati' };
    } catch (e) {
      jobsA[run] = { status: 'gabim', error: e.message };
    }
  }
 
  // ===== KERKIMI B: studjo hapesiren per nje nen-lloj =====
  async function bejB(run, id) {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      const rN = await pool.query('SELECT * FROM ide_nendhoje WHERE id=$1', [id]);
      if (!rN.rows.length) throw new Error('Nen-lloji s\'u gjet.');
      const nd = rN.rows[0];
 
      if ((Number(nd.potenciali)||0) < 5) {
        jobsB[run] = { status: 'gabim', error: 'Potenciali < 5 — nuk studiohet.' };
        return;
      }
 
      const r = await openai.responses.create({
        model: MODELI,
        tools: [{ type: 'web_search' }],
        input: [{ role: 'user', content:
`${KUSHTET}
 
Nen-lloji: "${nd.emri}" (lloji: "${nd.lloj_emri}", kategoria: "${nd.kategoria}", tregu: ${nd.tregu}, global: ${nd.global}).
Potenciali eshte matur tashme (${nd.potenciali}/10) — MOS e rimat.
 
Bej nje kerkim TE MATUR (jo te thelle, pa kosto te tmerrshme) dhe fokusohu VETEM te HAPESIRA/boshlleku, mbi bazen: "ku mund t'i bej dikujt jeten ose punen dukshem ME TE LEHTE, ose te plotesoj dicka qe mungon" — e pershtatur me kete lloj biznesi.
 
Fokusi fillon nga AUTOMATIZIMI dhe KOSTOJA ME E ULET se konkurrenca, pa perjashtuar faktore te tjere (efikasitet, kohe, akses, cilesi, besueshmeri, ose çdo faktor qe do te bente dike ta perdorte/paguante) NESE lloji i lejon. POR nese ky lloj biznesi s'ka lidhje me automatizimin, MOS e perfshi automatizimin — pershtat faktoret me ate qe ka kuptim per kete lloj. Llogarit me logjike ku ka me shume kerkese per ate qe mungon.
 
Ktheji VETEM si JSON, pa markdown:
{"hapesira": 0, "faktoret": "faktoret kryesore qe krijojne hapesiren, shkurt ne shqip", "arsye": "nje-dy rreshta pse kjo note hapesire"}` }]
      });
 
      const txt = r.output_text || '';
      const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
      if (s === -1 || e === -1) throw new Error('Nuk u gjet JSON');
      const obj = JSON.parse(txt.slice(s, e + 1));
 
      const hap = Number(obj.hapesira) || 0;
      const pot = Number(nd.potenciali) || 0;
      const metrika3 = Math.round((pot * 0.6 + hap * 0.4) * 10) / 10;
 
      await pool.query(
        `UPDATE ide_nendhoje SET hapesira=$1, metrika3=$2, faktoret=$3, studiuar=true WHERE id=$4`,
        [hap, metrika3, String(obj.faktoret||'').slice(0,1000) + (obj.arsye ? ' — ' + String(obj.arsye).slice(0,500) : ''), id]
      );
      jobsB[run] = { status: 'gati' };
    } catch (e) {
      jobsB[run] = { status: 'gabim', error: e.message };
    }
  }
 
  // ===== Rrugët =====
  router.post('/nisA', (req, res) => {
    const run = crypto.randomUUID();
    jobsA[run] = { status: 'po_punon', progres: 'po nis…' };
    bejA(run);
    res.json({ run });
  });
  router.get('/statusA/:run', (req, res) => res.json(jobsA[req.params.run] || { status: 'pa_gjetur' }));
 
  router.post('/nisB/:id', (req, res) => {
    const run = crypto.randomUUID();
    jobsB[run] = { status: 'po_punon' };
    bejB(run, req.params.id);
    res.json({ run });
  });
  router.get('/statusB/:run', (req, res) => res.json(jobsB[req.params.run] || { status: 'pa_gjetur' }));
 
  // Te gjitha nen-llojet (per listen poshte dhe per carousel)
  router.get('/nendhoje', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query(
        `SELECT id, lloj_emri, kategoria, emri, potenciali, global, tregu, koha_kulm,
                hapesira, metrika3, faktoret, studiuar
         FROM ide_nendhoje
         ORDER BY COALESCE(metrika3, potenciali) DESC, potenciali DESC, id`);
      res.json(r.rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
 
  // Llojet (per carousel — nivel i pare)
  router.get('/llojet', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const r = await pool.query('SELECT DISTINCT lloj_emri FROM ide_nendhoje ORDER BY lloj_emri');
      res.json(r.rows.map(x => x.lloj_emri));
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
 
  return router;
}
 
module.exports = { createNendhojeRouter };
