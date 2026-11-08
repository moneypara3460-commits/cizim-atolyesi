// Çalıştır: node tests/examples.test.mjs
import assert from 'node:assert/strict';
import { EXAMPLES, buildExample, GUIDE } from '../examples.js';
import { heightOf, sheetCalc, frameCalc, sweepTris, cleanLinks, TYPE_LABEL } from '../logic.js';

let fail = 0;
const t = (name, fn) => { try { fn(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message.split('\n')[0]); } };

for (const e of EXAMPLES) {
  t('örnek: ' + e.name, () => {
    const ex = buildExample(e.key);
    assert.ok(ex && ex.parts.length >= 1);
    const ids = new Set(ex.parts.map((p) => p.id));
    assert.equal(ids.size, ex.parts.length, 'id tekrar');
    assert.ok(ex.nextId > Math.max(...ids));
    assert.ok(ids.has(ex.sel));
    assert.equal(ex.parts[0].op, 'add');
    for (const p of ex.parts) {
      assert.ok(TYPE_LABEL[p.type], 'tür ' + p.type);
      assert.ok(heightOf(p) > 0, p.name + ' yükseklik');
      for (const k of ['x', 'y', 'z', 'rx', 'ry', 'rz']) assert.ok(Number.isFinite(p[k]), p.name + ' ' + k);
      if (p.parent != null) assert.ok(ids.has(p.parent));
      for (const m of p.mates || []) assert.ok(ids.has(m.b));
    }
    const copy = JSON.parse(JSON.stringify(ex.parts));
    cleanLinks(copy);
    assert.equal(copy.filter((p) => p.parent != null).length, ex.parts.filter((p) => p.parent != null).length, 'bağ silinmemeli');
    assert.ok(ex.tip.length > 10);
  });
}
t('sac, masa, dirsek örnekleri geçerli hesaplanır', () => {
  assert.ok(sheetCalc(buildExample('sac').parts[0]).ok);
  assert.equal(frameCalc(buildExample('masa').parts[0]).members.length, 12);
  assert.ok(sweepTris(buildExample('dirsek').parts[0]).pos.length > 0);
});
t('rehber konuları dolu', () => { assert.ok(GUIDE.length >= 5 && GUIDE.every((g) => g.s.length >= 3)); });
console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
