// Çalıştır: node tests/meka-step.test.mjs
// Mekatronik 8. aşama — STEP AP242 dışa aktarma GERÇEK OCCT ile: şema, adlandırılmış ürün, geri okumada hacim aynı,
// eski (AP214) dışa aktarma etkilenmez, başlık yeniden yazımından sonra dosya OCCT ile yine okunur.
import assert from 'node:assert/strict';
import Module from '../vendor/occt/replicad_single.js';
import { initOCCT } from '../occt.js';
import { runOp } from '../occt-ops.js';
import { stepBaslik } from '../meka/iz.js';

const K = await initOCCT(Module, { print: () => {}, printErr: () => {} });
let fail = 0;
const t = async (name, fn) => {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
  finally { K.free(); }
};
const descs = [{ type: 'box', w: 40, l: 30, h: 10, x: 0, y: 0, z: 0, op: 'add', name: 'plaka' }, { type: 'cylinder', d: 10, h: 20, x: 0, y: 0, z: 0, op: 'sub', name: 'delik' }];
const V = 40 * 30 * 10 - Math.PI * 25 * 10;   // 11 214,6 mm³

await t('AP242: şema satırı, adlandırılmış ürün, mm birimi; geri okunan hacim = model hacmi', async () => {
  const r = await runOp(K, 'step-ap242', { descs, name: 'Dolum ünitesi' });
  assert.match(r.text, /AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF \{1 0 10303 442/);
  assert.match(r.text, /PRODUCT\('Dolum ünitesi'/); assert.match(r.text, /SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
  assert.ok(Math.abs(r.hacim - V) < 1e-6 * V && Math.abs(r.geriHacim - V) < 1e-6 * V, r.hacim + ' / ' + r.geriHacim);
  assert.equal(r.check.valid, true);
});
await t('Eski STEP dışa aktarma AP214 olarak kalır (genel şema ayarı geri alınır)', async () => {
  await runOp(K, 'step-ap242', { descs, name: 'x' }); K.free();
  const r = await runOp(K, 'step-out', { descs });
  assert.match(r.text, /AUTOMOTIVE_DESIGN \{ 1 0 10303 214/);
});
await t('Başlık yeniden yazıldıktan sonra dosya ASCII, OCCT ile okunur ve hacim aynı', async () => {
  const r = await runOp(K, 'step-ap242', { descs, name: 'Gövde ğüşıöç' }); K.free();
  const out = stepBaslik(r.text, { ad: 'Gövde ğüşıöç', aciklama: 'Rev A — onaylı', yazar: 'Deniz Kuşaklı', kurum: 'Çizim Atölyesi', onay: 'Ayşe' });
  assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(out));
  assert.ok(out.includes("PRODUCT('G\\X2\\00F6\\X0\\vde \\X2\\011F00FC015F013100F600E7\\X0\\'"), out.match(/PRODUCT\('[^']*'/)[0]);
  const back = await runOp(K, 'step-in', { text: out });
  assert.ok(Math.abs(back.props.volume - V) < 1e-6 * V, String(back.props?.volume));
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
