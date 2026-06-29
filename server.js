// server.js — truri i projektit "studim-tregu"
// Pret pyetjen nga faqja, thwrret OpenAI-n (me kerkim ne internet),
// e ruan pergjigjen ne PostgreSQL, dhe ta kthen ne faqe.
 
const express = require('express');
const path = require('path');
const OpenAI = require('openai');
const { Pool } = require('pg');
 
const app = express();
const PORT = process.env.PORT || 3000;
 
// ⚠️ KONFIRMO emrin e modelit te dashboard-i i OpenAI nese te del gabim modeli.
// gpt-5.5 ben kerkim ne internet permes Responses API.
const MODEL = 'gpt-5.5';
 
const openai = new OpenAI(); // lexon OPENAI_API_KEY nga environment
 
// Databaza: nese DATABASE_URL mungon, app-i prap punon, por s'i ruan pergjigjet.
const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : null;
 
if (pool) {
  pool.query(`
    CREATE TABLE IF NOT EXISTS studime (
      id          SERIAL PRIMARY KEY,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      context     TEXT NOT NULL,
      search_used BOOLEAN NOT NULL,
      raw_answer  TEXT,
      parsed      JSONB,
      error       TEXT
    );
  `).then(() => console.log('Tabela "studime" gati.'))
    .catch(e => console.error('Krijimi i tabeles deshtoi:', e.message));
} else {
  console.warn('Kujdes: DATABASE_URL mungon — pergjigjet nuk do ruhen.');
}
 
const SYSTEM_PROMPT = `You are a rigorous market research analyst.
 
HARD RULES:
- Base every factual claim on current evidence you find with the web_search tool. If web search is unavailable or you cannot find evidence, explicitly mark that claim as "no evidence".
- Do NOT give generic startup advice, platitudes, or training-data boilerplate. Generic answers are a failure of this task.
- Cite a source URL for every market-size, demand, or saturation claim.
 
OBJECTIVE (read carefully):
The user does NOT want speed to launch or speed to first revenue. The user wants the HIGHEST SUSTAINED REVENUE RATE once the business is mature — a high ceiling and high revenue velocity at scale — even if the path to maturity is long. Do NOT penalize long build time or long ramp time. The ONE constraint is the user's runway: they must survive financially during the ramp, so weigh "ramp survivability given budget".
A business with a compounding growth engine (network effects, virality, marketplace dynamics) is strongly preferred, because that is what turns a model into a millions-per-month business.
 
TASK:
Compare these business model categories for this specific user: SaaS, Shopify/marketplace app, physical product / e-commerce, information product, service/agency. You may add a category if evidence supports it.
For each, research and score 1-5 on:
  ceiling, velocity, growth_engine, saturation (1=brutally saturated, 5=wide open), fit, survivability.
Then rank the categories and pick ONE top category, with evidence-based reasoning.
 
OUTPUT:
Respond with ONLY valid JSON — no markdown fences, no text before or after.
Write all human-readable text fields in Albanian. Use exactly this shape:
{
  "summary": "2-3 sentence verdict in Albanian",
  "top_pick": "category name",
  "categories": [
    {"name":"","scores":{"ceiling":0,"velocity":0,"growth_engine":0,"saturation":0,"fit":0,"survivability":0},"rationale":"Albanian, with concrete evidence","sources":["https://..."]}
  ]
}`;
 
function extractJson(text) {
  if (!text) throw new Error('Output bosh');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('Nuk u gjet JSON');
  return JSON.parse(text.slice(start, end + 1));
}
 
app.use(express.json({ limit: '1mb' }));
 
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
 
app.post('/run', async (req, res) => {
  const context = ((req.body && req.body.context) || '').trim();
  const useSearch = !(req.body && req.body.useSearch === false);
  if (!context) return res.status(400).json({ error: 'Konteksti mungon.' });
 
  let raw = null, parsed = null, errMsg = null;
  try {
    const response = await openai.responses.create({
      model: MODEL,
      tools: useSearch ? [{ type: 'web_search' }] : [],
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: context }
      ]
    });
    raw = response.output_text;
    try { parsed = extractJson(raw); }
    catch (e) { errMsg = "Outputi s'ishte JSON: " + e.message; }
  } catch (e) {
    errMsg = 'Thirrja e OpenAI deshtoi: ' + e.message;
  }
 
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO studime (context, search_used, raw_answer, parsed, error)
         VALUES ($1,$2,$3,$4,$5)`,
        [context, useSearch, raw, parsed ? JSON.stringify(parsed) : null, errMsg]
      );
    } catch (e) {
      console.error('Ruajtja deshtoi:', e.message);
      errMsg = (errMsg ? errMsg + ' | ' : '') + 'Ruajtja ne DB deshtoi.';
    }
  }
 
  return res.json({ parsed, raw, error: errMsg });
});
 
app.get('/history', async (req, res) => {
  if (!pool) return res.json([]);
  try {
    const r = await pool.query(
      `SELECT id, created_at, search_used, parsed->>'top_pick' AS top_pick
       FROM studime ORDER BY created_at DESC LIMIT 20`
    );
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
 
app.listen(PORT, () => console.log('Po degjon ne portin', PORT));
