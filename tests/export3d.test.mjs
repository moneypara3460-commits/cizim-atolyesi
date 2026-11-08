// Çalıştır: node tests/export3d.test.mjs
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { indexMesh, isClosedManifold, crc32, zipStore, to3MF, toSTEP } from '../export3d.js';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0]); } };
function boxTris(w, h, d) {
  const x = w / 2, z = d / 2, P = [];
  const quad = (a, b, c, e) => P.push(...a, ...b, ...c, ...a, ...c, ...e);
  quad([-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z]); quad([x, 0, -z], [-x, 0, -z], [-x, h, -z], [x, h, -z]);
  quad([x, 0, z], [x, 0, -z], [x, h, -z], [x, h, z]); quad([-x, 0, -z], [-x, 0, z], [-x, h, z], [-x, h, -z]);
  quad([-x, h, z], [x, h, z], [x, h, -z], [-x, h, -z]); quad([-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]);
  return new Float32Array(P);
}
// STEP yapısını denetle: tüm #ref'ler tanımlı, her kenar iki kez ve zıt yönle kullanılmış
function checkStep(txt) {
  const ents = new Map();
  for (const m of txt.matchAll(/^#(\d+)=(.*);$/gm)) ents.set(+m[1], m[2]);
  for (const [id, body] of ents) for (const r of body.matchAll(/#(\d+)/g)) assert.ok(ents.has(+r[1]), `#${id} -> #${r[1]} tanımsız`);
  const uses = new Map();
  for (const body of ents.values()) {
    const m = body.match(/^ORIENTED_EDGE\('',\*,\*,#(\d+),\.(T|F)\.\)$/);
    if (m) { const u = uses.get(m[1]) || []; u.push(m[2]); uses.set(m[1], u); }
  }
  for (const [e, u] of uses) { assert.equal(u.length, 2, 'kenar #' + e + ' ' + u.length + ' kez'); assert.notEqual(u[0], u[1], 'kenar #' + e + ' aynı yön'); }
  // gerçek sayılarda nokta olmalı (STEP kuralı)
  for (const body of ents.values()) if (/^(CARTESIAN_POINT|DIRECTION)/.test(body)) for (const m of body.matchAll(/\(([-0-9.E,]+)\)/g)) for (const v of m[1].split(',')) if (v) assert.ok(/[.]/.test(v), 'gerçek sayı biçimi: ' + v);
  return ents;
}
t('indexMesh + kapalılık', () => {
  const m = indexMesh(boxTris(10, 6, 4));
  assert.equal(m.V.length, 8); assert.equal(m.T.length, 12);
  assert.ok(isClosedManifold(m.T));
  assert.equal(isClosedManifold(m.T.slice(1)), false);
});
t('crc32 bilinen değer', () => { assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926); });
t('STEP: kapalı kutu katı olarak yazılır, yapı tutarlı', () => {
  const r = toSTEP(boxTris(10, 6, 4), 'Deneme parça ç', new Date(0));
  assert.ok(r.solid && r.faces === 12);
  assert.ok(r.text.startsWith('ISO-10303-21;') && r.text.trim().endsWith('END-ISO-10303-21;'));
  assert.ok(r.text.includes('MANIFOLD_SOLID_BREP') && r.text.includes('CLOSED_SHELL'));
  const ents = checkStep(r.text);
  assert.equal([...ents.values()].filter((b) => b.startsWith('EDGE_CURVE')).length, 18);
  assert.ok(!/[^\x00-\x7f]/.test(r.text), 'ASCII dışı karakter');
  writeFileSync('/tmp/box.step', r.text);
});
t('STEP: açık ağ yüzey modeli olarak yazılır', () => {
  const b = boxTris(10, 6, 4), r = toSTEP(b.subarray(9), 'acik');
  assert.equal(r.solid, false);
  assert.ok(r.text.includes('OPEN_SHELL') && r.text.includes('SHELL_BASED_SURFACE_MODEL'));
});
t('3MF: zip yazılır', () => {
  const z = to3MF(boxTris(10, 6, 4), 'Kutu <1>', '#ff0000');
  assert.equal(z[0], 0x50); assert.equal(z[1], 0x4b);
  writeFileSync('/tmp/box.3mf', z);
  const zz = zipStore([{ name: 'a.txt', data: 'merhaba' }]);
  writeFileSync('/tmp/a.zip', zz);
});
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
