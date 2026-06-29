// server.js — projekti "studim-tregu"
// Gjeneron TE GJITHA mwnyrat e fitimit / strategjite e marketingut (me kerkim ne internet),
// e bwn nw SFOND qw te mos e presw Railway, e RUAN automatikisht te plote kur mbaron,
// dhe faqja e merr pastaj. Fshirja prek vetem te njejtin lloj.
 
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
      lloji      TEXT NOT NULL,        -- 'fitim' ose 'marketing'
      emri       TEXT NOT NULL,
      kategoria  TEXT,
      pershkrim  TEXT
    );
  `).then(() => console.log('Tabela "metodat" gati.'))
    .catch(e => console.error('Krijimi i tabeles deshtoi:', e.message));
} else {
  console.warn('Kujdes: DATABASE_URL mungon — s\'ruhet dot.');
}
 
// Kujtesa e perkohshme e "puneve" ne sfond (job-eve)
const jobs = {}; // id -> { status:'po_punon'|'gati'|'gabim', lloji, list, error }
 
function methodPrompt(lloji) {
  if (lloji === 'fitim') {
    return `List ALL monetization / revenue / payment models that exist for businesses and products IN GENERAL — across software, physical goods, services, content, media, marketplaces, etc.
Be EXHAUSTIVE and organized by category. Do NOT restrict to any specific business type, budget, geography, or constraint — list every model that exists. Use web_search so nothing modern is missing.
Output ONLY a JSON array (no markdown, no text around it). Each item:
{"name":"common English name","kategoria":"category","pershkrim":"one short line in Albanian"}`;
  }
  return `List ALL marketing / distribution / advertising / customer-acquisition strategies that exist IN GENERAL — across every channel and every type of business.
Be EXHAUSTIVE and organized by category. Do NOT restrict to any specific business, budget, geography, or constraint — list every strategy that exists. Use web_search so nothing modern is missing.
Output ONLY a JSON array (no markdown, no text around it). Each item:
{"name":"common English name","kategoria":"category","pershkrim":"one short line in Albanian"}`;
}
 
function extractJsonArray(text) {
  if (!text) throw new Error('Output bosh');
  const s = text.indexOf('['), e = text.lastIndexOf(']');
  if (s === -1 || e === -1) throw new Error('Nuk u gjet liste JSON');
  return JSON.parse(text.slice(s, e + 1));
}
 
// Puna ne sfond: kerko -> ruaj te plote -> shenoje 'gati'
async function bejPunen(id, lloji) {
  try {
    const r = await openai.responses.create({
      model: MODEL,
      tools: [{ type: 'web_search' }],   // kerkimi ne internet i ndezur
      input: [{ role: 'user', content: methodPrompt(lloji) }]
    });
    const list = extractJsonArray(r.output_text);
 
    if (pool && Array.isArray(list)) {
      // fshi vetem te njejtin lloj, pastaj ruaj te renat
      await pool.query('DELETE FROM metodat WHERE lloji=$1', [lloji]);
      for (const m of list) {
        await pool.query(
          'INSERT INTO metodat (lloji, emri, kategoria, pershkrim) VALUES ($1,$2,$3,$4)',
          [lloji, String(m.name || '').slice(0, 300), String(m.kategoria || '').slice(0, 200), String(m.pershkrim || '').slice(0, 1000)]
        );
      }
    }
    jobs[id] = { status: 'gati', lloji, list };
  } catch (e) {
    jobs[id] = { status: 'gabim', lloji, error: e.message };
  }
}
 
app.use(express.json({ limit: '2mb' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
 
// NIS punen ne sfond, kthe menjehere nje id (Railway s'pret gjate)
app.post('/nis/:lloji', (req, res) => {
  const lloji = req.params.lloji;
  if (lloji !== 'fitim' && lloji !== 'marketing') return res.status(400).json({ error: 'Lloj i panjohur.' });
  const id = crypto.randomUUID();
  jobs[id] = { status: 'po_punon', lloji };
  bejPunen(id, lloji); // nuk e presim — punon ne sfond
  res.json({ id });
});
 
// KONTROLLO statusin e nje pune
app.get('/status/:id', (req, res) => {
  const j = jobs[req.params.id];
  if (!j) return res.json({ status: 'pa_gjetur' });
  res.json(j);
});
 
// Lexo metodat e ruajtura (secila e aksesueshme me vete)
app.get('/metodat', async (req, res) => {
  if (!pool) return res.json([]);
  try {
    const r = await pool.query('SELECT id, lloji, emri, kategoria, pershkrim FROM metodat ORDER BY lloji, kategoria, emri');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
 
// Fshi nje opsion te vetem te ruajtur
app.post('/fshi/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'S\'ka databaz.' });
  try {
    await pool.query('DELETE FROM metodat WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
 
app.listen(PORT, () => console.log('Po degjon ne portin', PORT));
