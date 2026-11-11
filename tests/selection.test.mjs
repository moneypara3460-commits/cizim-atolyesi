// Çalıştır: node tests/selection.test.mjs
// 3B görünümde boş alana dokununca seçimin kaldırılması (app.js).
// app.js tarayıcıda Three.js ile çalıştığı için Node'da yüklenemez; bu test app.js'teki GERÇEK
// onTap / onPointerEnd / renderChips / hasSel kodunu kaynak dosyadan çıkarıp sahte (stub) bağımlılıklarla çalıştırır.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
function grab(startRe) {
  const m = src.match(startRe);
  if (!m) throw new Error('bulunamadı: ' + startRe);
  let i = src.indexOf('{', m.index), depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error('kapanmadı');
}
const code = [
  src.match(/const hasSel = [^\n]+/)[0],
  grab(/function onTap\(cx, cy\)/),
  grab(/function onPointerEnd\(e\)/),
  grab(/function renderChips\(\)/),
].join('\n');

function world() {
  const canvas = { tag: 'canvas' }, uiButton = { tag: 'button' };
  const W = {
    parts: [{ id: 1 }, { id: 2 }, { id: 3 }], sel: 1, selOff: null, tab: 'dims',
    measure: { on: false }, simUI: { active: false }, asmUI: { active: false }, linkPick: false, drag: null, tap: null,
    renderer: { domElement: canvas },
    hitAt: new Map(),          // "x,y" -> parça id (modelde dokunulan parça)
    elAt: new Map(),           // "x,y" -> ekrandaki öğe (varsayılan: tuval)
    calls: [], chips: '',
  };
  const env = {
    pickAt: (x, y) => { const id = W.hitAt.get(x + ',' + y); return id ? { part: W.parts.find((p) => p.id === id) } : null; },
    renderPanel: () => W.calls.push('panel'), refreshOverlays: () => W.calls.push('ovl'),
    measureTap: () => W.calls.push('measure'), faceTap: () => W.calls.push('face'), edgeTap: () => W.calls.push('edge'),
    mateTap: () => W.calls.push('mate'), linkTap: () => W.calls.push('link'), simTap: () => W.calls.push('sim'), asmTap: () => W.calls.push('asm'),
    endDrag: () => {}, cur: () => W.parts.find((p) => p.id === W.sel) || W.parts[0],
    partName: (q, i) => 'P' + (i + 1), esc: (s) => s, bendWarnings: () => [],
    $: () => ({ set innerHTML(v) { W.chips = v; } }),
    document: { elementFromPoint: (x, y) => W.elAt.get(x + ',' + y) || canvas },
    performance: { now: () => 0 },
  };
  // değişkenler W üzerinden okunup yazılsın diye with() kapsamı
  const fn = new Function('W', 'env', `with (env) { with (W) { ${code}; return { onTap, onPointerEnd, renderChips, hasSel }; } }`);
  return { W, api: fn(W, env), uiButton };
}
const selectedChips = (W) => (W.chips.match(/class="chip[^"]*\bon\b/g) || []).length;

let fail = 0;
const t = (name, f) => { try { f(); console.log('ok   ', name); } catch (e) { fail++; console.log('FAIL ', name, '\n     ', e.message); } };

t('1) parça seçiliyken boş alana dokun: seçim, vurgu ve panel kalkar', () => {
  const { W, api } = world();
  assert.ok(api.hasSel());
  api.onTap(5, 5);
  assert.equal(api.hasSel(), false);
  assert.deepEqual(W.calls, ['panel', 'ovl']);
  api.renderChips(); assert.equal(selectedChips(W), 0, 'hiçbir çip seçili görünmemeli (parts[0] dahil)');
});

t('2) A seçiliyken B parçasına dokun: seçim B\'ye geçer', () => {
  const { W, api } = world();
  W.hitAt.set('10,10', 2);
  api.onTap(10, 10);
  assert.equal(W.sel, 2); assert.ok(api.hasSel());
  api.renderChips(); assert.equal(selectedChips(W), 1);
});

t('3) kamera döndürme (parmak kaydı) seçimi kaldırmaz', () => {
  const { W, api } = world();
  W.tap = { x: 5, y: 5, t: 0, moved: true };     // pointermove 8 px'ten fazla kaydı
  api.onPointerEnd({ type: 'pointerup', isPrimary: true, clientX: 50, clientY: 5 });
  assert.ok(api.hasSel()); assert.deepEqual(W.calls, []);
  // iki parmak (yakınlaştırma) ikinci parmağı: isPrimary değil
  W.tap = { x: 5, y: 5, t: 0, moved: false };
  api.onPointerEnd({ type: 'pointerup', isPrimary: false, clientX: 5, clientY: 5 });
  assert.ok(api.hasSel());
  // iptal edilen dokunuş
  W.tap = { x: 5, y: 5, t: 0, moved: false };
  api.onPointerEnd({ type: 'pointercancel', isPrimary: true, clientX: 5, clientY: 5 });
  assert.ok(api.hasSel());
});

t('4) kısa dokunuş (kaymadan) boş alanda seçimi kaldırır', () => {
  const { W, api } = world();
  W.tap = { x: 5, y: 5, t: 0, moved: false };
  api.onPointerEnd({ type: 'pointerup', isPrimary: true, clientX: 5, clientY: 5 });
  assert.equal(api.hasSel(), false);
});

t('5) seçim kalktıktan sonra parçaya dokun: doğru parça seçilir (aynı parça da olsa)', () => {
  const { W, api } = world();
  api.onTap(5, 5);
  W.hitAt.set('7,7', 1);                         // daha önce seçili olan parçanın kendisi
  api.onTap(7, 7);
  assert.equal(W.sel, 1); assert.ok(api.hasSel());
  api.onTap(5, 5); W.hitAt.set('8,8', 3); api.onTap(8, 8);
  assert.equal(W.sel, 3); assert.ok(api.hasSel());
});

t('arayüz öğesinin üstüne düşen dokunuş seçimi kaldırmaz', () => {
  const { W, api, uiButton } = world();
  W.elAt.set('5,5', uiButton);
  api.onTap(5, 5);
  assert.ok(api.hasSel()); assert.deepEqual(W.calls, []);
});

t('özel araç modları kendi akışında kalır (boş alan seçimi kaldırmaz)', () => {
  for (const [setup, want] of [
    [(W) => { W.measure.on = true; }, 'measure'], [(W) => { W.tab = 'face'; }, 'face'], [(W) => { W.tab = 'edge'; }, 'edge'],
    [(W) => { W.tab = 'mate'; }, 'mate'], [(W) => { W.tab = 'link'; W.linkPick = true; }, 'link'],
    [(W) => { W.simUI.active = true; }, 'sim'], [(W) => { W.asmUI.active = true; }, 'asm'],
  ]) {
    const { W, api } = world();
    setup(W);
    api.onTap(5, 5);
    assert.deepEqual(W.calls, [want], want);
    assert.ok(api.hasSel(), want);
  }
});

t('başka bir yoldan farklı parça seçilince (sel değişince) seçim kendiliğinden geri gelir', () => {
  const { W, api } = world();
  api.onTap(5, 5);
  W.selOff = null; W.sel = 2;                    // app.js'te her "sel =" ataması selOff'u da sıfırlar
  assert.ok(api.hasSel());
});

t('app.js: her seçim ataması seçimi yeniden etkinleştirir', () => {
  const lines = src.split('\n').filter((l) => /\bsel = /.test(l) && !/^let sel = /.test(l) && !/\)\s*sel = parts\[0\]\.id;/.test(l));
  for (const l of lines) assert.match(l, /selOff = null; sel = /, l.trim());
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
