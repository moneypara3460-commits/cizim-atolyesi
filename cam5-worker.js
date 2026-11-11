// Çok eksenli CAM işçisi: takım yolu + kinematik + çarpışma + talaş simülasyonu ekranı dondurmasın.
import { plan5, stats5 } from './cam5.js?v=20261111e';
import { checkCollisions, simulate5 } from './coll5.js?v=20261111e';
import { gcode5, canPost, POSTS5 } from './post5.js?v=20261111e';
import { runPlan } from './cam5-run.js?v=20261111e';

let last = null;
self.onmessage = (e) => {
  const { id, op, args } = e.data || {};
  try {
    if (op === 'plan') {
      const r = runPlan(args.job, { plan5, stats5, checkCollisions, simulate5, canPost, POSTS5 }, (p) => self.postMessage({ id, prog: p }));
      last = r.keep;
      self.postMessage({ id, ok: true, res: r.out }, r.transfer);
    } else if (op === 'gcode') {
      if (!last) throw new Error('Önce takım yolunu hesapla');
      const text = gcode5(last.R, last.job, args.post, last.safety, args.opt || {});
      self.postMessage({ id, ok: true, res: { text } });
    } else throw new Error('Bilinmeyen işlem: ' + op);
  } catch (err) { self.postMessage({ id, ok: false, err: String((err && err.message) || err) }); }
};
