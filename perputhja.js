// perputhja.js — merr nje pershkrim ideje, e krahason me llojet + nen-llojet e ruajtura.
// Kthen: LLOJET ku ideja ben pjese (me note orientimi), dhe per secilin NEN-LLOJET qe
// perputhen me idene (note >= 6, te tjerat hiqen). Emra te paster, PA kode. Model i lire, pa search.

const express = require('express');
const path = require('path');

const MODEL_LIRE = 'gpt-5.4-mini';

function createPerputhjaRouter(pool, openai, MODEL) {
  const router = express.Router();

  router.get('/', (req, res) => res.sendFile(path.join(__dirname, 'perputhja.html')));

  router.post('/gjej', async (req, res) => {
    try {
      if (!pool) throw new Error("S'ka databaz.");
      const ideja = String((req.body && req.body.ideja) || '').trim();
      if (!ideja) return res.status(400).json({ error: 'Shkruaj idenë së pari.' });

      const rL = await pool.query('SELECT emri FROM ide_lloje ORDER BY id');
      let nen = [];
      try { const rN = await pool.query('SELECT emri, lloj_emri FROM ide_nendhoje ORDER BY id'); nen = rN.rows; } catch(e){}

      const perLloj = {};
      for (const n of nen) {
        const L = n.lloj_emri || '(pa lloj)';
        if (!perLloj[L]) perLloj[L] = [];
        perLloj[L].push(n.emri);
      }
      let struktura = '';
      for (const L of rL.rows.map(x=>x.emri)) {
        struktura += `\nLLOJI: ${L}\n`;
        const subs = perLloj[L] || [];
        if (subs.length) struktura += subs.map(s=>`   - ${s}`).join('\n') + '\n';
        else struktura += '   (pa nen-lloje te ruajtura)\n';
      }

      const resp = await openai.responses.create({
        model: MODEL_LIRE,
        temperature: 0,
        input: [{ role: 'user', content:
`Kam nje IDE biznesi. Me poshte ke LLOJET e biznesit dhe nen NE SECILIN, nen-llojet e tij.

Detyra:
1) Gjej LLOJET me te cilat ideja ime ben pjese/ka lidhje. Jep secilit nje note ORIENTIMI 1-10 (sa i ngjashem eshte lloji me idene). Lloji sherben vetem per orientim.
2) Per secilin lloj te perzgjedhur, gjej NEN-LLOJET e TIJ qe perputhen me idene time. PERJASHTO ato qe nuk perputhen ose perputhen dobet — perfshi vetem note >= 6. Jep secilit nen-lloj nje note 1-10.
3) Perdor VETEM emrat e plote (ashtu si jane dhene). MOS shto kode, numra, ID apo etiketa. MOS grumbullo shume emra bashke.

IDEJA IME:
"${ideja}"

STRUKTURA (lloje me nen-llojet e tyre):
${struktura}

Ktheji VETEM si JSON, pa markdown:
{"llojet":[{"lloji":"emri i plote i llojit","note":0,"nendhojet":[{"emri":"emri i plote i nen-llojit","note":0,"pse":"nje rresht shqip"}]}]}
Perfshi vetem lloje qe kane te pakten nje nen-lloj me note >= 6 OSE qe vete perputhen qarte. Rendit sipas notes se llojit zbritese.` }]
      });

      const txt = resp.output_text || '';
      const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
      if (s === -1 || e === -1) throw new Error('Nuk u gjet JSON');
      const obj = JSON.parse(txt.slice(s, e+1));
      let llojet = (obj.llojet || []);
      llojet.sort((a,b)=>(Number(b.note)||0)-(Number(a.note)||0));
      for (const L of llojet) {
        L.nendhojet = (L.nendhojet || [])
          .filter(n => (Number(n.note)||0) >= 6)
          .sort((a,b)=>(Number(b.note)||0)-(Number(a.note)||0));
      }
      res.json({ llojet });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createPerputhjaRouter };
