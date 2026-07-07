// server.js — projekti "studim-tregu"
// Gjeneron TE GJITHA mwnyrat e fitimit / strategjite e marketingut me KERKIM ne internet.

const express = require('express');
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

// ⚠️ Konfirmo emrin e modelit te dashboard-i i OpenAI nese del gabim modeli.
const MODEL = 'gpt-5.5';

const openai = new OpenAI();

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;

if (pool) {
  pool.query(`
    CREATE TABLE IF NOT EXISTS metodat (
      id         SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      lloji      TEXT NOT NULL,
      emri       TEXT NOT NULL,
      kategoria  TEXT,
      pershkrim  TEXT
    );
  `).then(() => console.log('Tabela "metodat" gati.'))
    .catch(e => console.error('Krijimi i tabeles deshtoi:', e.message));
} else {
  console.warn('Kujdes: DATABASE_URL mungon — s\'ruhet dot.');
}

const jobs = {}; // id -> { status, lloji, list, error, progres }

function temaTxt(lloji) {
  return lloji === 'fitim'
    ? 'monetization / revenue / payment models for businesses and products IN GENERAL (software, physical goods, services, content, media, marketplaces, finance, etc.)'
    : 'marketing / distribution / advertising / customer-acquisition strategies IN GENERAL (every channel and business type)';
}

// Hapi 1: merr listen e kategorive
async function merrKategorite(lloji) {
  const r = await openai.responses.create({
    model: MODEL,
    input: [{ role: 'user', content:
      `List the MAIN categories that organize all ${temaTxt(lloji)}.
Give 12-20 broad categories that together cover everything. Output ONLY a JSON array of strings, no markdown. Each string is one category name in Albanian.` }]
  });
  return extractJsonArray(r.output_text);
}

// Hapi 2: per nje kategori, merr te gjitha metodat (me kerkim ne internet)
async function merrMetodat(lloji, kategoria) {
  const r = await openai.responses.create({
    model: MODEL,
    tools: [{ type: 'web_search' }],
    input: [{ role: 'user', content:
      `List ALL ${temaTxt(lloji)} that belong to the category "${kategoria}".
Be exhaustive for THIS category only. Use web_search so nothing modern is missing.
Output ONLY a JSON array, no markdown. Each item:
{"name":"common English name","kategoria":"${kategoria}","pershkrim":"one short line in Albanian"}` }]
  });
  return extractJsonArray(r.output_text);
}

function extractJsonArray(text) {
  if (!text) throw new Error('Output bosh');
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s === -1 || e === -1) throw new Error('Nuk u gjet liste JSON');
  return JSON.parse(text.slice(s, e + 1));
}

// Puna e plote ne sfond
async function bejPunen(id, lloji) {
  try {
    const kategorite = await merrKategorite(lloji);
    jobs[id].progres = `0/${kategorite.length} kategori`;

    const seen = new Set();
    const total = [];
    let i = 0;
    for (const kat of kategorite) {
      i++;
      try {
        const pjesa = await merrMetodat(lloji, kat);
        for (const m of (pjesa || [])) {
          const key = String(m.name || '').trim().toLowerCase();
          if (!key || seen.has(key)) continue;   // hiq dublikatat
          seen.add(key);
          total.push({ name: m.name, kategoria: m.kategoria || kat, pershkrim: m.pershkrim });
        }
      } catch (e) { /* nje kategori deshtoi — vazhdojme me te tjerat */ }
      jobs[id].progres = `${i}/${kategorite.length} kategori`;
    }

    if (pool && total.length) {
      await pool.query('DELETE FROM metodat WHERE lloji=$1', [lloji]); // vetem ky lloj
      for (const m of total) {
        await pool.query(
          'INSERT INTO metodat (lloji, emri, kategoria, pershkrim) VALUES ($1,$2,$3,$4)',
          [lloji, String(m.name || '').slice(0,300), String(m.kategoria || '').slice(0,200), String(m.pershkrim || '').slice(0,1000)]
        );
      }
    }
    jobs[id] = { status: 'gati', lloji, list: total };
  } catch (e) {
    jobs[id] = { status: 'gabim', lloji, error: e.message };
  }
}

app.use(express.json({ limit: '2mb' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.post('/nis/:lloji', (req, res) => {
  const lloji = req.params.lloji;
  if (lloji !== 'fitim' && lloji !== 'marketing') return res.status(400).json({ error: 'Lloj i panjohur.' });
  const id = crypto.randomUUID();
  jobs[id] = { status: 'po_punon', lloji, progres: 'po nis…' };
  bejPunen(id, lloji);
  res.json({ id });
});

app.get('/status/:id', (req, res) => {
  const j = jobs[req.params.id];
  if (!j) return res.json({ status: 'pa_gjetur' });
  res.json(j);
});

app.get('/metodat', async (req, res) => {
  if (!pool) return res.json([]);
  try {
    const r = await pool.query('SELECT id, lloji, emri, kategoria, pershkrim FROM metodat ORDER BY lloji, kategoria, emri');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/fshi/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'S\'ka databaz.' });
  try { await pool.query('DELETE FROM metodat WHERE id=$1', [req.params.id]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
// ===== SEKSIONI I RI: filtri i marketingut (i ndare) =====
const { createMarketingFilterRouter } = require('./marketing-filter');
app.use('/filter', createMarketingFilterRouter(pool, openai, MODEL));
const { createIdeRouter } = require('./ide-biznesi');
app.use('/ide', createIdeRouter(pool, openai, MODEL));
const { createNendhojeRouter } = require('./nendhoje');
app.use('/nendhoje', createNendhojeRouter(pool, openai, MODEL));
const { createNetoRouter } = require('./fitimi-neto');
app.use('/neto', createNetoRouter(pool, openai, MODEL));
const { createPerputhjaRouter } = require('./perputhja');
app.use('/perputhja', createPerputhjaRouter(pool, openai, MODEL));
const { createPerzgjedhjaRouter } = require('./perzgjedhja');
app.use('/perzgjedhja', createPerzgjedhjaRouter(pool, openai, MODEL));
const { attachGrupimRoutes } = require('./grupimi');
attachGrupimRoutes(app, pool, openai);
const { createKategoriaRouter } = require('./kategoria');
app.use('/kategoria', createKategoriaRouter(pool, openai, MODEL));
const { createPerfundimiRouter } = require('./perfundimi');
app.use('/perfundimi', createPerfundimiRouter(pool));
const { attachHapesiraRoutes } = require('./hapesira');
attachHapesiraRoutes(app, pool, openai);
const { createAutomatizimetRouter } = require('./automatizimet');
app.use('/automatizimet', createAutomatizimetRouter(pool));
app.listen(PORT, () => console.log('Po degjon ne portin', PORT));
