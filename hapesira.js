// hapesira.js — SEKSION I RI. Studimi i HAPESIRES per nen-llojet e nje termi te /perfundimi.
// Per cdo nen-lloj, TRE hapa:
//   Hapi 1 (gpt-5.4, web search): bizneset/nichet reale qe mbulojne kete nen-lloj sot (pa ekzagjerim).
//   Hapi 2 (gpt-5.4, web search): menyrat e monetizimit qe behen sot ne platforma te tilla.
//   Hapi 3 (gpt-5.5, web search): HAPESIRAT per automatizim + monetizim, krahasuar me hapat 1 & 2,
//     si BOSHLLEK (jo ide biznesi), me verifikim nese ekziston sherbim qe s'u rendit.
// Nje nen-lloj ne nje kohe; sapo mbaron -> RUHET, pastaj tjetri. Nese nje hap deshton, vazhdon.
//
// Wiring te server.js (para app.listen):
//   const { attachHapesiraRoutes } = require('./hapesira');
//   attachHapesiraRoutes(app, pool, openai);

const crypto = require('crypto');

const MODEL_BIZ  = 'gpt-5.4';   // bizneset/nichet
const MODEL_MON  = 'gpt-5.4';   // monetizimi
const MODEL_HAP  = 'gpt-5.5';   // hapesirat (me i forti)

const KUSHTET_IM = `KUSHTET E MIA (per te vleresuar potencialin e nje hapesire, 1-100):
- Fitim ME I LARTE ne kohen ME TE SHKURTER ne piekuri (kryesori).
- Fitim neto sa me i larte (sa mbetet realisht pas kostove).
- Mundesi AUTOMATIZIMI (pune minimale, pa prani nonstop).
- Rritje GLOBALE (pa kufij gjeografike).
- I ndertueshem nga nje person me mjete moderne, me fonde minimale.
100 = hapesire me potencial maksimal per keto kushte; 1 = shume e dobet.`;

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

function attachHapesiraRoutes(app, pool, openai) {
  const jobs = {}; // run -> { status, faza, progres, error }

  if (pool) {
    pool.query(`
      CREATE TABLE IF NOT EXISTS hapesira_studim (
        id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ DEFAULT now(),
        lloj_emri TEXT,               -- termi (nga /perfundimi) qe po studiohet
        nendhoj_emri TEXT,            -- nen-lloji
        pershkrim_kryesor TEXT,       -- permbledhja e nen-llojit
        vleresim_pergjithshem INT,    -- 1-100 per gjithe nen-llojin
        biznese TEXT,                 -- lista e bizneseve/nicheve te gjetura (tekst)
        monetizim TEXT                -- menyrat e monetizimit te gjetura (tekst)
      );
      CREATE TABLE IF NOT EXISTS hapesira_rreshta (
        id SERIAL PRIMARY KEY, studim_id INT,
        kolona TEXT,                  -- 'automatizim' ose 'monetizim'
        pershkrim TEXT,               -- cfare eshte hapesira / cfare niche
        vleresim INT,                 -- 1-100
        ekziston TEXT                 -- verifikim: a ka sherbim qe e mbulon (qe s'u rendit)
      );
    `).catch(e => console.error('Init hapesira tabela:', e.message));
  }

  // Merr nen-llojet e nje termi: nga grupe_nendhoje (te bashkuar) ose ide_nendhoje (origjinal)
  async function merrNendhojet(llojEmri) {
    // Provo se pari te bashkuarit
    let r = await pool.query('SELECT emri FROM grupe_nendhoje WHERE lloj_emri=$1 ORDER BY id', [llojEmri]);
    if (r.rows.length) return r.rows.map(x => x.emri);
    // Perndryshe origjinalet
    r = await pool.query('SELECT emri FROM ide_nendhoje WHERE lloj_emri=$1 ORDER BY id', [llojEmri]);
    return r.rows.map(x => x.emri);
  }

  async function studjoNjeNendhoj(llojEmri, nendhojEmri) {
    // --- Hapi 1: bizneset/nichet ---
    let biznese = '';
    try {
      const r1 = await openai.responses.create({
        model: MODEL_BIZ,
        tools: [{ type: 'web_search' }],
        input: [{ role: 'user', content:
`Bej nje kerkim TE MATUR ne internet dhe nxirr bizneset dhe NICHET reale qe mbulojne sot nen-llojin e biznesit "${nendhojEmri}". MOS ekzagjero numrin — jep vetem ato qe mbulojne MJAFTUESHEM te gjitha nichet kryesore (jo liste te fryre). Per secilin, nje rresht: emri + cfare mbulon.
Ktheje si tekst i shkurter, nje biznes/niche per rresht.` }]
      });
      biznese = String(r1.output_text || '').slice(0, 4000);
    } catch(e) { biznese = '(s\'u gjeten)'; }

    // --- Hapi 2: monetizimi ---
    let monetizim = '';
    try {
      const r2 = await openai.responses.create({
        model: MODEL_MON,
        tools: [{ type: 'web_search' }],
        input: [{ role: 'user', content:
`Nen-lloji: "${nendhojEmri}".
Fillimisht, kupto QELLIMIN KRYESOR te ketij nen-lloji — cfare pune BAZE ben ky biznes per klientin e vet (p.sh. nese eshte "gjetje klientesh", qellimi eshte t'i sjelle klientit KLIENTE TE RINJ).
Pastaj bej nje kerkim TE MATUR ne internet dhe nxirr menyrat se si biznese te tilla i SJELLIN OSE i KURSEJNE PARA KLIENTIT te tyre permes ketij qellimi kryesor — pra si e ndihmojne klientin te FITOJE me shume para (me shume shitje/kliente, te ardhura me te larta) ose te KURSEJE para (kosto me te ulet). MOS liso menyrat si faturon biznesi klientin (abonim, komision, pay-per-lead) — ato s'na interesojne. Na intereson vetem SI I VJEN PARA KLIENTIT.
Ktheje si tekst i shkurter, nje menyre per rresht.` }]
      });
      monetizim = String(r2.output_text || '').slice(0, 4000);
    } catch(e) { monetizim = '(s\'u gjeten)'; }

    // --- Hapi 3: hapesirat (automatizim + monetizim) ---
    let pershkrimKryesor = '', vleresimPergj = 0, rreshta = [];
    try {
      const r3 = await openai.responses.create({
        model: MODEL_HAP,
        tools: [{ type: 'web_search' }],
        input: [{ role: 'user', content:
`${KUSHTET_IM}

Nen-lloji: "${nendhojEmri}".

BIZNESET/NICHET reale qe ekzistojne sot (nga kerkimi):
${biznese}

MENYRAT e MONETIZIMIT qe perdoren sot:
${monetizim}

Detyra: gjej HAPESIRAT (boshllëqet) ne DY drejtime. POR SE PARI, kupto QELLIMIN KRYESOR te ketij nen-lloji — cfare pune BAZE ben ky biznes per klientin (p.sh. nese eshte "gjetje klientesh", qellimi eshte t'i sjelle klientit KLIENTE TE RINJ). Te dyja hapesirat duhet te jene DREJTPERDREJT te kjo pune kryesore, JO te vegla teknike anesore (p.sh. per nje biznes qe gjen kliente: mos jep boshllëqe si "kontroll ligjor i email-eve", "mbrojtje nga spam", "verifikim teknik" — keto jane anesore; jep boshllëqe te VETE gjetja e klienteve: si te gjenden me shume/me te mire kliente).

1. AUTOMATIZIM: te VETE puna kryesore e nen-llojit, gjej cfare mund te AUTOMATIZOHET qe bizneset ekzistuese ENDE nuk e permbushin. Mos u kufizo te ankesat — studio cfare njerezit e bejne ENDE MANUALISHT ne piken kryesore te punes. Hapesira kryesore = ku POTHUAJSE ASNJE biznes s'ka automatizim ende; pastaj ato qe pak a shume mbulohen. NUK pranohen boshllëqe te vegla teknike periferike — vetem te qellimi kryesor.

2. VLERE PER KLIENTIN: gjej cfare menyre e re per t'i SJELLE OSE KURSYER PARA KLIENTIT (me shume shitje/te ardhura, ose kosto me te ulet) nuk e ofrojne ende bizneset ekzistuese. Kjo eshte strategjia qe e ben KLIENTIN te fitoje para. NUK ka te bej me si faturon ti klientin (jo abonim, jo komision, jo pay-per-lead) — ka te bej me SI I VJEN PARA KLIENTIT permes ketij sherbimi.

RREGULLA:
- Jep secilen hapesire si BOSHLLEK (cfare mund te mbuloje nje biznes), JO si ide biznesi e gatshme. Vetem boshlleku, i logjikuar sakte.
- Per secilen hapesire jep nje pershkrim: cfare eshte, dhe cfare NICHE mund te jete (nese e ke te qarte).
- Per SECILEN hapesire, bej nje kerkim te shpejte ne internet: a ekziston tashme ndonje sherbim qe e mbulon kete, qe MUND te mos jete ne listen e bizneseve me siper? Shkruaje te fusha "ekziston" (ose "jo" nese s'gjete).
- Vlereso secilen hapesire 1-100 sipas KUSHTEVE TE MIA me siper (potenciali per mua).

Jep gjithashtu:
- pershkrim_kryesor: nje-dy fjali per gjithe nen-llojin (ku qendron mundesia kryesore).
- vleresim_pergjithshem: 1-100 per gjithe nen-llojin (sa me shume dhe sa me te larta hapesirat, aq me i larte).

Ktheji VETEM si JSON, pa markdown:
{"pershkrim_kryesor":"","vleresim_pergjithshem":0,"hapesirat":[{"kolona":"automatizim","pershkrim":"","vleresim":0,"ekziston":""},{"kolona":"monetizim","pershkrim":"","vleresim":0,"ekziston":""}]}` }]
      });
      const o = nxjerrObjekt(r3.output_text);
      pershkrimKryesor = String(o.pershkrim_kryesor||'').slice(0,1500);
      vleresimPergj = Math.round(Number(o.vleresim_pergjithshem)||0);
      rreshta = Array.isArray(o.hapesirat) ? o.hapesirat : [];
    } catch(e) { /* hapi 3 deshtoi */ }

    // --- Ruaj ---
    const ins = await pool.query(
      `INSERT INTO hapesira_studim (lloj_emri, nendhoj_emri, pershkrim_kryesor, vleresim_pergjithshem, biznese, monetizim)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [llojEmri, nendhojEmri, pershkrimKryesor, vleresimPergj, biznese.slice(0,4000), monetizim.slice(0,4000)]);
    const sid = ins.rows[0].id;
    for (const h of rreshta) {
      await pool.query(
        `INSERT INTO hapesira_rreshta (studim_id, kolona, pershkrim, vleresim, ekziston)
         VALUES ($1,$2,$3,$4,$5)`,
        [sid, String(h.kolona||'').slice(0,40), String(h.pershkrim||'').slice(0,2000),
         Math.round(Number(h.vleresim)||0), String(h.ekziston||'').slice(0,600)]);
    }
  }

  async function bejStudimin(run, llojEmri) {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      const nendhojet = await merrNendhojet(llojEmri);
      if (!nendhojet.length) throw new Error('Ky term s\'ka nen-lloje te ruajtura.');

      // Fshi studimin e vjeter per kete term
      const old = await pool.query('SELECT id FROM hapesira_studim WHERE lloj_emri=$1', [llojEmri]);
      for (const row of old.rows) {
        await pool.query('DELETE FROM hapesira_rreshta WHERE studim_id=$1', [row.id]);
      }
      await pool.query('DELETE FROM hapesira_studim WHERE lloj_emri=$1', [llojEmri]);

      jobs[run].progres = `0/${nendhojet.length} nën-lloje`;
      let i = 0;
      for (const nd of nendhojet) {
        i++;
        jobs[run].faza = `Po studion: ${nd}`;
        try { await studjoNjeNendhoj(llojEmri, nd); } catch(e) { /* nje nen-lloj deshtoi — vazhdo */ }
        jobs[run].progres = `${i}/${nendhojet.length} nën-lloje`;
      }
      jobs[run] = { status: 'gati' };
    } catch (e) {
      jobs[run] = { status: 'gabim', error: e.message };
    }
  }

  // Studio VETEM nje nen-lloj (fshin vetem studimin e vjeter te ATIJ nen-lloji)
  async function bejNjeNendhoj(run, llojEmri, nendhojEmri) {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      // Fshi studimin e vjeter vetem te ketij nen-lloji
      const old = await pool.query(
        'SELECT id FROM hapesira_studim WHERE lloj_emri=$1 AND nendhoj_emri=$2', [llojEmri, nendhojEmri]);
      for (const row of old.rows) {
        await pool.query('DELETE FROM hapesira_rreshta WHERE studim_id=$1', [row.id]);
      }
      await pool.query('DELETE FROM hapesira_studim WHERE lloj_emri=$1 AND nendhoj_emri=$2', [llojEmri, nendhojEmri]);

      jobs[run].faza = `Po studion: ${nendhojEmri}`;
      await studjoNjeNendhoj(llojEmri, nendhojEmri);
      jobs[run] = { status: 'gati' };
    } catch (e) {
      jobs[run] = { status: 'gabim', error: e.message };
    }
  }

  // ---- Rruget ----
  app.post('/perfundimi/hapesira/nis', (req, res) => {
    const llojEmri = String((req.body && req.body.lloj) || '').trim();
    const nendhojEmri = String((req.body && req.body.nendhoj) || '').trim();
    if (!llojEmri) return res.status(400).json({ error: 'Mungon lloji.' });
    const run = crypto.randomUUID();
    jobs[run] = { status: 'po_punon', faza: 'po nis…', progres: '' };
    if (nendhojEmri) {
      // Studio vetem kete nen-lloj
      bejNjeNendhoj(run, llojEmri, nendhojEmri);
    } else {
      // Studio te gjithe (si me pare)
      bejStudimin(run, llojEmri);
    }
    res.json({ run });
  });

  app.get('/perfundimi/hapesira/status/:run', (req, res) => res.json(jobs[req.params.run] || { status: 'pa_gjetur' }));

  // Rezultati per nje term: nen-llojet me hapesirat e tyre
  app.get('/perfundimi/hapesira/:llojEmri', async (req, res) => {
    if (!pool) return res.json([]);
    try {
      const rS = await pool.query(
        `SELECT id, nendhoj_emri, pershkrim_kryesor, vleresim_pergjithshem
         FROM hapesira_studim WHERE lloj_emri=$1 ORDER BY vleresim_pergjithshem DESC, id`,
        [req.params.llojEmri]);
      const out = [];
      for (const s of rS.rows) {
        const rR = await pool.query(
          `SELECT kolona, pershkrim, vleresim, ekziston FROM hapesira_rreshta
           WHERE studim_id=$1 ORDER BY vleresim DESC, id`, [s.id]);
        out.push({
          nendhoj_emri: s.nendhoj_emri,
          pershkrim_kryesor: s.pershkrim_kryesor,
          vleresim_pergjithshem: s.vleresim_pergjithshem,
          automatizim: rR.rows.filter(x => x.kolona === 'automatizim'),
          monetizim: rR.rows.filter(x => x.kolona === 'monetizim')
        });
      }
      res.json(out);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return { };
}

module.exports = { attachHapesiraRoutes };
