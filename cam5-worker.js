// Çok eksenli CAM işçisi: takım yolu + kinematik + çarpışma + talaş simülasyonu ekranı dondurmasın.
import { plan5, stats5 } from './cam5.js?v=20261127a';
import { checkCollisions, simulate5 } from './coll5.js?v=20261127a';
import { gcode5, canPost, POSTS5 } from './post5.js?v=20261127m';
import { runPlan, runGcode } from './cam5-run.js?v=20261127a';
import { risk5, dryShift5 } from './guvenli5.js?v=20261127a';

let last = null;
self.onmessage = (e) => {
  const { id, op, args } = e.data || {};
  try {
    if (op === 'plan') {
      const r = runPlan(args.job, { plan5, stats5, checkCollisions, simulate5, canPost, POSTS5, risk5 }, (p) => self.postMessage({ id, prog: p }));
      last = r.keep;
      self.postMessage({ id, ok: true, res: r.out }, r.transfer);
    } else if (op === 'gcode') {
      self.postMessage({ id, ok: true, res: runGcode(last, args, { gcode5, dryShift5 }) });
    } else throw new Error('Bilinmeyen işlem: ' + op);
  } catch (err) { self.postMessage({ id, ok: false, err: String((err && err.message) || err) }); }
};
