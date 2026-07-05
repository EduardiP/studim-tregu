// perputhja.js — merr nje pershkrim ideje, e krahason me llojet dhe nen-llojet e ruajtura,
// perjashton ato pa lidhje, kthen VETEM perputhjet e mira me note 1-10. Model i lire, pa search.

const express = require('express');
const path = require('path');

const MODEL_LIRE = 'gpt-5.4-nano';

function createPerputhjaRouter(pool, openai, MODEL) {
  const router = express.Router();

  router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'perputhja.html')));

  router.post('/gjej', async (req, res) => {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      const ideja = String((req.body && req.body.ideja) || '').trim();
      if (!ideja) return res.status(400).json({ error: 'Shkruaj idenë së pari.' });

      const rL = await pool.query('SELECT emri, kategoria FROM ide_lloje ORDER BY id');
      let nen = [];
      try { const rN = await pool.query('SELECT emri, kategoria, lloj_emri FROM ide_nendhoje ORDER BY id'); nen = rN.rows; } catch(e){}

      const llojetTxt = rL.rows.map((l,i)=>`L${i+1}. ${l.emri} [${l.kategoria||''}]`).join('\n');
      const nenTxt = nen.map((n,i)=>`N${i+1}. ${n.emri} [lloj: ${n.lloj_emri||''}]`).join('\n');

      const resp = await openai.responses.create({
        model: MODEL_LIRE,
        input: [{ role: 'user', content:
`Kam nje IDE biznesi. Me poshte ke nje liste LLOJESH dhe NEN-LLOJESH biznesi te njohura.
Detyra: gjej me cilat perputhet ideja ime.

RREGULLA:
- Fillimisht PERJASHTO ato qe nuk perputhen ose perputhen dobet — MOS i nxjerr fare.
- Nga ato qe MBETEN (perputhen mire ose shume mire), jep secilit nje note 1-10 sa perputhet me idene time (10 = perputhje shume e forte).
- Rendit nga me e larta te me e uleta. Perfshi vetem note >= 6.

IDEJA IME:
"${ideja}"

LLOJET:
${llojetTxt}

NEN-LLOJET:
${nenTxt || '(asnje)'}

Ktheji VETEM si JSON, pa markdown:
{"perputhjet":[{"tipi":"lloj|nen-lloj","emri":"","note":0,"pse":"nje rresht shqip"}]}` }]
      });

      const txt = resp.output_text || '';
      const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
      if (s === -1 || e === -1) throw new Error('Nuk u gjet JSON');
      const obj = JSON.parse(txt.slice(s, e+1));
      const lista = (obj.perputhjet || []).sort((a,b)=>(Number(b.note)||0)-(Number(a.note)||0));
      res.json({ perputhjet: lista });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createPerputhjaRouter };
