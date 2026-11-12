// OCCT işçisi: B-Rep hesapları ana iş parçacığını (ekranı) kilitlemesin diye burada çalışır.
// Mesaj: { id, op, args }  ->  { id, ok, res } | { id, ok: false, err }
import Module from './vendor/occt/replicad_single.js';
import { initOCCT } from './occt.js?v=20261112u';
import { runOp } from './occt-ops.js?v=20261112u';

let K = null, IG = null;
const ready = (async () => { K = await initOCCT(Module, { print: () => {}, printErr: () => {} }); return K; })();

// IGES okuyucu (occt-import-js; ayrı OCCT derlemesi): klasik betik, işçiye bir kez yüklenir
async function iges() {
  if (IG) return IG;
  const base = new URL('./vendor/occt-import/', import.meta.url);
  const code = await (await fetch(new URL('occt-import-js.js', base))).text();
  (0, eval)(code);   // genel kapsamda "occtimportjs" tanımlar
  IG = await self.occtimportjs({ locateFile: (f) => new URL(f, base).href, print: () => {}, printErr: () => {} });
  return IG;
}

self.onmessage = async (e) => {
  const { id, op, args } = e.data || {};
  try {
    await ready;
    const res = await runOp(K, op, args || {}, { iges });
    const tr = [];
    if (res && res.view) for (const k of ['positions', 'normals', 'index', 'lines']) if (res.view[k]) tr.push(res.view[k].buffer);
    if (res && res.part && res.part.tris) for (const k of ['pos', 'nor']) if (res.part.tris[k]) tr.push(res.part.tris[k].buffer);
    self.postMessage({ id, ok: true, res }, tr);
  } catch (err) {
    self.postMessage({ id, ok: false, err: String((err && err.message) || err) });
  } finally {
    if (K) K.free();
  }
};
