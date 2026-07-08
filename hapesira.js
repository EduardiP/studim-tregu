// hapesira.js — Studimi i HAPESIRES per nen-llojet (logjika 'mbimurim').
// Per cdo nen-lloj:
//   1. Kupto nen-llojin (nga databaza ose kerkim baz).
//   2. LOGJIKA (gpt-5.5, PA web search): arsyeton 'mbimurim' -> gjen MAJEN e hapesires me potencial.
//   3. KERKIMI (gpt-5.4, me web search): verifikon a eshte e zene maja + vleresim 1-100.
//   4. Nese maja e zene -> logjika e dyte (maje me poshte) + kerkim. MAKSIMUM 2 cikle.
// Vetem AUTOMATIZIM (pa monetizim kete raund). Nje nen-lloj ne nje kohe; ruhet pas secilit.
//
// Wiring te server.js (para app.listen):
//   const { attachHapesiraRoutes } = require('./hapesira');
//   attachHapesiraRoutes(app, pool, openai);

const crypto = require('crypto');

const MODEL_LOGJIKE = 'gpt-5.5';   // arsyetimi 'mbimurim' (PA web search — i lire)
const MODEL_KERKIM  = 'gpt-5.4';   // verifikimi ne treg (me web search)

const KUSHTET_IM = `KUSHTET E MIA (per te vleresuar potencialin e nje hapesire, 1-100):
- Fitim ME I LARTE ne kohen ME TE SHKURTER ne pjekuri pa amrr parasysh kohen qe biznesi kerkon per te shkuar aty (kryesori).
- Fitim neto sa me i larte (sa mbetet realisht pas kostove).
- Mundesi AUTOMATIZIMI ne drejtim dhe menaxhim pas ndertimti (pune minimale, pa prani nonstop).
- Potencial per Rritje GLOBALE (pa kufij gjeografike).
- I ndertueshem nga nje person me mjete dhe sherbime moderne (nese afteit e mia nuk e mbulojn), dhe me fonde minimale.
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
    // Pershkrimi i nen-llojit (nga databaza nese ka; perndryshe kerkim baz)
    let pershkrimNen = '';
    try {
      const rp = await pool.query(
        `SELECT hapesira, metrika3 FROM ide_nendhoje WHERE emri=$1 LIMIT 1`, [nendhojEmri]);
      if (rp.rows.length && rp.rows[0].hapesira) pershkrimNen = String(rp.rows[0].hapesira);
    } catch(e) {}
    if (!pershkrimNen) {
      try {
        const rb = await openai.responses.create({
          model: MODEL_KERKIM,
          tools: [{ type: 'web_search' }],
          input: [{ role: 'user', content:
`Ne 3-6 fjali, shpjego shkurt cfare eshte nen-lloji i biznesit "${nendhojEmri}" dhe cfare pune ben. Vetem shpjegim, pa liste.` }]
        });
        pershkrimNen = String(rb.output_text || '').slice(0, 800);
      } catch(e) { pershkrimNen = nendhojEmri; }
    }

    const gjetjet = [];   // {logjika, kerkimi, vleresim}
    let ekluar = '';      // majat e meparshme (te zena) qe s'duhen perseritur

    for (let cikel = 1; cikel <= 2; cikel++) {
      // ---- LOGJIKA (gpt-5.5, PA web search) — gjen majen sipas logjikes 'mbimurim' ----
      let ideja = '';
      try {
        const rl = await openai.responses.create({
          model: MODEL_LOGJIKE,
          input: [{ role: 'user', content:
`${KUSHTET_IM}

Nen-lloji: "${nendhojEmri}".
Cfare eshte: ${pershkrimNen}
${ekluar ? `\nKETO maja jane provuar tashme dhe jane TE ZENA — mos i perserit, mendo nje maje TJETER pak me poshte tyre:\n${ekluar}\n` : ''}
Detyra: perdor LOGJIKE TE FORTE (jo kerkim ne internet fillimisht) per te gjetur MAJEN (aty ku mund te krijohen biznese te medha dhe jo thjshet sherbime plotesuese per kete dhoj biznesi, pra MAJA nenkupton sherbim mbi sherbiemt qe mund te jen rijuar)  e hapesirave me potencial per nje BIZNES TE MADH brenda kesaj fushe. Mendo sipas VLERES/LOGJIKES — per te gjetur hapsira per niche qe mund te jen nej bizens i madh me te ardhura te larta ne kete kategori qe mudn te jet te ndertosh dika mbi ate qe eshte dnertuar deri tani ne kete dhoj  kategorie dhe qe ka potencial — JO sipas "cfare u mungon bizneseve".

Mendimi "MBIMURIM" (ndertim mbi ate qe eshte ndertuar): supozo qe bizneset ekzistuese kane automatizuar tashme gjerat BAZE dhe te PJESSHME te kesaj fushe. Ti mendo nje shkalle ME TE LARTE — automatizimin MBI ATE QE ESHTE NDERTUAR nga qe mund te jet nga fillimi deri en fund i asaj kategorie ose nje pjes e konsiderueshme e asaj kategrorie qe mund te mo jet nxen akoma nga bizenset aktuale te asaj kategorie. P.sh. nese te tjere automatizojne krijimin e reklamave ose pergjigjet ndaj klienteve, ti mendo automatizimin e GJITHE ciklit ose automatizim ne dicka qe ende ata nuk e kan automatizuar.

Hapesira duhet:
- Te jete nje POTENCIAL I MADH per nje apo disa ide biznesi brenda fushes se nen-llojit (jo thjesht nje vegel apo mjet brena asaj kategoie), qe mbulon nje pjese te madhe te asaj kategorie.
- Te kete potencial per SHUME te ardhura brenda nje kohe te shkurter (kur biznesi te ket shkuar ne piken ku jep frytet nese kerkon koh).
- Te automatizohet (pervec se ai dhoj biznesi qe ndertoeht aty dueht te jet i automatizueshem ne menaxhim duhet te jet edhe vet sherbimi automatizim per klientin nese ai ben dicka ende me pun manuale edhe nese nuk ankohen por thejsht askush nuk ka pas iden se mund te automatizohet).
- Te ndertohet nga nje person me mjete si Claude/AI, pa fonde te medha.
- Biznesi qe mund te ndertohet ne ate hapsir te madhe duhet te jete BRENDA fushes se ketij nen-lloji.

Jep VETEM majen (hapesiren me potencialin me te larte per kete cikel), si nje pershkrim i qarte i boshllekut. 3-6 fjali. Pa JSON, pa liste — vetem hapesira e logjikuar.` }]
        });
        ideja = String(rl.output_text || '').trim().slice(0, 1500);
      } catch(e) { ideja = ''; }
      if (!ideja) break;

      // ---- KERKIMI (gpt-5.4, ME web search) — a eshte e zene kjo maje? ----
      let konkurrenca = '', vleresim = 0;
      try {
        const rk = await openai.responses.create({
          model: MODEL_KERKIM,
          tools: [{ type: 'web_search' }],
          input: [{ role: 'user', content:
`${KUSHTET_IM}

Hapesira (e logjikuar) qe po verifikojme, brenda fushes "${nendhojEmri}":
${ideja}

Detyra:
1. Bej nje kerkim ne internet: a ekziston tashme ndonje biznes/sherbim qe e MBULON kete hapesire? Jep emrat konkrete qe gjen (nese ka), dhe trego a e mbulojne PLOTESISHT apo vetem pjeserisht.
2. Jep nje VLERESIM 1-100 sa perputhet kjo hapesire me KUSHTET E MIA me siper per nje biznes me POTENCIAL, duke marre parasysh: (a) MADHESINE e hapesires (sa i madh mund te behet biznesi qe zhvillohet aty), (b) kushtet e mia, (c) KONKURRENCEN qe gjete (sa e zene eshte). Nese eshte plotesisht e zene nga lojtare te medhenj, vleresimi duhet te jete i ulet.

Ktheji VETEM si JSON, pa markdown:
{"konkurrenca":"","e_zene_plotesisht":true,"vleresim":0}` }]
        });
        const o = nxjerrObjekt(rk.output_text);
        konkurrenca = String(o.konkurrenca||'').slice(0,1500);
        vleresim = Math.round(Number(o.vleresim)||0);
        gjetjet.push({ logjika: ideja, kerkimi: konkurrenca, vleresim });
        // Nese s'eshte e zene plotesisht -> kjo eshte hapesira reale, ndal
        if (o.e_zene_plotesisht === false) break;
        // Ndryshe, shenoje si te zene dhe vazhdo te maja tjeter
        ekluar += `- ${ideja}\n`;
      } catch(e) {
        gjetjet.push({ logjika: ideja, kerkimi: '(verifikimi deshtoi)', vleresim: 0 });
        break;
      }
    }

    // --- Ruaj ---
    const vleresimPergj = gjetjet.length ? Math.max(...gjetjet.map(g => g.vleresim||0)) : 0;
    const ins = await pool.query(
      `INSERT INTO hapesira_studim (lloj_emri, nendhoj_emri, pershkrim_kryesor, vleresim_pergjithshem, biznese, monetizim)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [llojEmri, nendhojEmri, pershkrimNen.slice(0,1500), vleresimPergj, '', '']);
    const sid = ins.rows[0].id;
    for (const g of gjetjet) {
      await pool.query(
        `INSERT INTO hapesira_rreshta (studim_id, kolona, pershkrim, vleresim, ekziston)
         VALUES ($1,$2,$3,$4,$5)`,
        [sid, 'automatizim', g.logjika.slice(0,2000), Math.round(g.vleresim)||0, (g.kerkimi||'').slice(0,1500)]);
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
