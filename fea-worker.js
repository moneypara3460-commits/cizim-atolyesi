// "Geleceğimi Göster" hesap işçisi: sonlu eleman çözümleri arayüzü dondurmadan arka planda çalışır.
import { solveStatic, solveModal } from './fea.js?v=20261112t';

self.onmessage = (ev) => {
  const { id, cmd, a } = ev.data;
  const onProgress = (it, res) => self.postMessage({ id, progress: { it, res } });
  try {
    let r;
    if (cmd === 'static') r = solveStatic(a.fe, a.mats, a.bc, { onProgress, tol: a.tol });
    else if (cmd === 'modal') r = solveModal(a.fe, a.mats, a.bc, { onProgress, modes: a.modes || 3 });
    else throw new Error('bilinmeyen komut ' + cmd);
    if (r) delete r.uFull;
    self.postMessage({ id, result: r });
  } catch (e) { self.postMessage({ id, error: e.message || String(e) }); }
};
