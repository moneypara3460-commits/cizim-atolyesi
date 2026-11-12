// 📐 Analiz işçisi: ağ ve çözüm ekranı dondurmasın.
import * as F from './fea.js?v=20261112u';
import * as X from './fea2.js?v=20261112u';
import { runFEM, convStudy } from './fem-run.js?v=20261112u';

self.onmessage = (e) => {
  const { id, op, a } = e.data || {};
  const prog = (text, f) => self.postMessage({ id, prog: { text, f } });
  try {
    if (op === 'run') { const r = runFEM(F, X, a, prog); const tr = r.transfer || []; delete r.transfer; self.postMessage({ id, ok: true, res: r }, tr.filter((b, i) => tr.indexOf(b) === i)); }
    else if (op === 'conv') self.postMessage({ id, ok: true, res: convStudy(F, X, a, prog) });
    else throw new Error('Bilinmeyen işlem: ' + op);
  } catch (err) { self.postMessage({ id, ok: false, err: String((err && err.message) || err) }); }
};
