// server.js — projekti "studim-tregu"
// Dy deget: TE GJITHA mwnyrat e fitimit dhe TE GJITHA metodat e marketingut.
// "Gjenero" dhe "Ruaj" jane DY hapa te ndare: ruhet vetem ajo qe lejon ti.
// Cdo opsion ruhet si NJESI me vete (rresht), qe te aksesohet individualisht
// me vone per kombinim.
 
const express = require('express');
const path = require('path');
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
 
// Prompt-et — TE GJITHA mundesite, ne pergjithesi, pa asnje kusht
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
 
app.use(express.json({ limit: '2mb' }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
 
// HAPI 1 — vetem GJENERO (pa ruajtur). Kthen listen qe ta shohesh.
app.post('/gjenero/:lloji', async (req, res) => {
  const lloji = req.params.lloji;
  if (lloji !== 'fitim' && lloji !== 'marketing') return res.status(400).json({ error: 'Lloj i panjohur.' });
  let raw = null, list = null, errMsg = null;
  try {
    const r = await openai.responses.create({
      model: MODEL,
      tools: [{ type: 'web_search' }],
      input: [{ role: 'user', content: methodPrompt(lloji) }]
    });
    raw = r.output_text;
    list = extractJsonArray(raw);
  } catch (e) { errMsg = 'Deshtoi: ' + e.message; }
  res.json({ lloji, list, raw, error: errMsg });
});
 
// HAPI 2 — RUAJ vetem ate qe lejon ti (lista vjen nga faqja kur klikon butonin).
// Cdo opsion ruhet si rresht me vete. "replace=true" pastron te vjetrat e atij lloji.
app.post('/ruaj/:lloji', async (req, res) => {
  const lloji = req.params.lloji;
  if (lloji !== 'fitim' && lloji !== 'marketing') return res.status(400).json({ error: 'Lloj i panjohur.' });
  if (!pool) return res.status(500).json({ error: "DATABASE_URL mungon — s'ruhet dot." });
 
  const list = (req.body && req.body.list) || [];
  const replace = !!(req.body && req.body.replace);
  if (!Array.isArray(list) || !list.length) return res.status(400).json({ error: 'Asgjë për të ruajtur.' });
 
  try {
    if (replace) await pool.query('DELETE FROM metodat WHERE lloji=$1', [lloji]);
    let n = 0;
    for (const m of list) {
      await pool.query(
        'INSERT INTO metodat (lloji, emri, kategoria, pershkrim) VALUES ($1,$2,$3,$4)',
        [lloji, String(m.name || m.emri || '').slice(0, 300), String(m.kategoria || '').slice(0, 200), String(m.pershkrim || '').slice(0, 1000)]
      );
      n++;
    }
    res.json({ ruajtur: n });
  } catch (e) {
    res.status(500).json({ error: 'Ruajtja deshtoi: ' + e.message });
  }
});
 
// Lexo metodat e ruajtura (secila e aksesueshme me vete per kombinim te ardhshem)
app.get('/metodat', async (req, res) => {
  if (!pool) return res.json([]);
  try {
    const r = await pool.query('SELECT id, lloji, emri, kategoria, pershkrim FROM metodat ORDER BY lloji, kategoria, emri');
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
 
// (Opsionale) Fshi nje opsion te vetem te ruajtur, sipas id-se
app.post('/fshi/:id', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'S\'ka databaz.' });
  try {
    await pool.query('DELETE FROM metodat WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
 
app.listen(PORT, () => console.log('Po degjon ne portin', PORT));
