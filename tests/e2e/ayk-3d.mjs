// Ayakkabı Modelhanesi — 3D kalıp (STL / OBJ): yükleme, birim ve yön bulma, numaraya göre boy denetimi,
// dört görünüşün fotoğrafsız çıkması, yön düzeltme düğmeleri, kayıt / yeniden açma, telefonda kullanım.
// Çalıştır: node tests/e2e/ayk-3d.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, launch, createRunner, expect, ROOT } from './lib.mjs';
import { lastMesh, transform, toSTLBinary, toSTLAscii, toOBJ } from '../fixtures/kalip-3d.mjs';

const R = createRunner('ayk-3d');
const { srv, url } = await startServer();
const browser = await launch();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'k3d-'));
// sentetik kalıp: 40 numara EU için beklenen ≈ 266,7 mm; dosyalarda rastgele döndürülmüş ve kaydırılmış
const base = lastMesh({ L: 265 });
const F = {
  stl: path.join(dir, 'kalip-mm.stl'), stlA: path.join(dir, 'kalip-cm.stl'), obj: path.join(dir, 'kalip-cm.obj'), inch: path.join(dir, 'kalip-inc.stl'), bad: path.join(dir, 'bozuk.stl'),
};
fs.writeFileSync(F.stl, toSTLBinary(transform(base, { rot: [1.1, -0.7, 2.4], move: [30, -12, 8] })));
fs.writeFileSync(F.stlA, toSTLAscii(transform(base, { rot: [0.2, 2.9, -1.0], scale: 0.1 })));
fs.writeFileSync(F.obj, toOBJ(transform(base, { rot: [-1.3, 0.4, 0.6], scale: 0.1 }), { quads: true }));
fs.writeFileSync(F.inch, toSTLBinary(transform(base, { rot: [0.5, 0.5, 0.5], scale: 1 / 25.4 })));
fs.writeFileSync(F.bad, 'bu bir STL dosyası değil');

async function open(view, { noWorker = false } = {}) {
  const ctx = await browser.newContext(view || { viewport: { width: 1280, height: 900 } });
  await ctx.route('https://unpkg.com/**', (r) => r.abort());
  // işçi açılamazsa: 'throw' → kurucu hata verir; 'load' → işçi dosyası yüklenemez (onerror). İkisinde de iş sayfada yapılmalı.
  if (noWorker) await ctx.addInitScript((how) => { const W = window.Worker; window.Worker = function (u, o) { if (/last3d-worker/.test(String(u))) { if (how === 'throw') throw new Error('işçi yok'); return new W(new URL('./yok-boyle-bir-dosya.js', location.href), o); } return new W(u, o); }; }, noWorker);
  const p = await ctx.newPage(); const errs = [], workers = [];
  p.on('worker', (w) => workers.push(w.url()));
  p.workers = workers;
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(url + 'ayakkabi.html?liste=1'); await p.waitForSelector('[data-page="yeni"]');
  return { ctx, p, errs };
}
const clearToast = (p) => p.evaluate(() => { document.getElementById('toast').textContent = ''; });
const click = async (p, sel, re) => { await clearToast(p); await p.click(sel); await toast(p, re); };
const toast = async (p, re) => {
  try { await p.waitForFunction((s) => new RegExp(s).test(document.getElementById('toast').textContent), re.source, { timeout: 30000 }); }
  catch (e) { throw new Error('beklenen bildirim gelmedi: ' + re.source + ' · görünen: ' + (await p.textContent('#toast'))); }
};
const views = (p, mode = 'n') => p.evaluate((m) => {
  const T = m === 'p' ? window.__ayk.S.p : window.__ayk.S.newDraft;
  return Object.fromEntries(Object.entries(T.last.views).map(([k, v]) => [k, v && { L: +v.length.toFixed(2), H: +v.height.toFixed(2), src: v.src || '', n: v.outline.nodes.length }]));
}, mode);
const meshInfo = (p, mode = 'n') => p.evaluate((m) => { const T = m === 'p' ? window.__ayk.S.p : window.__ayk.S.newDraft, s = T.last.mesh; return s && { unit: s.unit, outer: s.outer, m: s.m, L: s.bb[3] - s.bb[0], W: s.bb[4] - s.bb[1], H: s.bb[5] - s.bb[2], open: s.open }; }, mode);
// önizleme tuvali boş değil (kalıp rengi var)
const painted = (p) => p.evaluate(() => {
  const cv = document.querySelector('canvas[data-l3prev]'); if (!cv || !cv.width) return 0;
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0;
  for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 246) + Math.abs(d[i + 1] - 245) + Math.abs(d[i + 2] - 240) > 30) n++;
  return n / (cv.width * cv.height);
});

await R.test('Yeni proje: ikili STL (mm, eğik duruyor) → yön ve birim bulunur, 40 numaraya uyar, dört görünüş fotoğrafsız çıkar; derby parçaları hazır', async () => {
  const { ctx, p, errs } = await open();
  await p.click('[data-page="yeni"]');
  await p.fill('[data-n="name"]', '3D derby'); await p.dispatchEvent('[data-n="name"]', 'change');
  await p.setInputFiles('[data-l3file]', F.stl);
  await toast(p, /3D kalıp yüklendi: boy 26[67],\d mm/);
  const mi = await meshInfo(p);
  expect(mi.unit === 'mm' && Math.abs(mi.L - 267) < 1.5 && mi.open === 0, JSON.stringify(mi));
  const v = await views(p);
  for (const id of ['yan', 'ic', 'alt', 'ust']) expect(v[id] && v[id].src === '3d' && Math.abs(v[id].L - mi.L) < 0.6, id + ': ' + JSON.stringify(v[id]));
  expect(Math.abs(v.yan.H - mi.H) < 0.6 && Math.abs(v.alt.H - mi.W) < 0.6, 'yükseklik / genişlik: ' + JSON.stringify(v));
  expect(await p.locator('.lview .lprev svg image').count() === 4, 'dört görünüşün resmi');
  expect(await p.locator('[data-lsens]').count() === 0, '3D görünüşte ayırma hassasiyeti yok');
  const sz = await p.textContent('[data-l3size]');
  expect(/✓ Numara 40 \(EU\): beklenen kalıp boyu ≈ 266,7 mm/.test(sz) && /numarayla uyumlu/.test(sz), sz);
  await p.waitForFunction(() => document.querySelector('canvas[data-l3prev]')?.width > 0);
  expect((await painted(p)) > 0.08, 'önizleme boş');
  await p.selectOption('[data-lst="type"]', 'derby');
  await p.waitForFunction(() => /hazır gelir/.test(document.querySelector('.lastcard').textContent));
  await p.click('[data-act="create"]'); await p.waitForSelector('.ed canvas');
  await toast(p, /saya parçası kalıptan çıkarıldı/);
  const names = await p.evaluate(() => window.__ayk.S.p.pieces.map((q) => q.name));
  expect(JSON.stringify(names) === JSON.stringify(['Ön saya', 'Yan saya', 'Dil']), 'parçalar: ' + names);
  expect(await p.evaluate(() => !!window.__ayk.S.p.last.mesh && window.__ayk.S.p.last.views.yan.src === '3d'), 'oluşan projede 3D kalıp ve görünüşler');
  expect(p.workers.some((u) => /last3d-worker\.js/.test(u)), 'ağır iş arka plan işçisinde yapılmalı: ' + p.workers);
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await R.test('Proje Dosyaları: birim, yön düğmeleri, dış/iç yan; kaydedilip yeniden açılınca 3D kalıp yerinde', async () => {
  const { ctx, p, errs } = await open();
  await p.click('[data-page="yeni"]'); await p.fill('[data-n="name"]', '3D ayar'); await p.dispatchEvent('[data-n="name"]', 'change');
  await p.click('[data-act="create"]'); await p.waitForSelector('.ed canvas');
  await p.click('[data-page="dosyalar"]'); await p.waitForSelector('.lastcard [data-l3file]', { state: 'attached' });
  await p.setInputFiles('[data-l3file]', F.stl); await toast(p, /3D kalıp yüklendi/);
  const v0 = await views(p, 'p'), m0 = await meshInfo(p, 'p');
  // yanlış birim → numara denetimi uyarır ve doğru birimi söyler; geri alınca düzelir
  await clearToast(p); await p.selectOption('[data-l3unit]', 'cm'); await toast(p, /Birim santimetre yapıldı/);
  await p.waitForFunction(() => /⚠/.test(document.querySelector('[data-l3size]')?.textContent || ''));
  const sz = await p.textContent('[data-l3size]');
  expect(/⚠/.test(sz) && /birim ya da numara yanlış/.test(sz) && /milimetre seçilirse uyar/.test(sz), sz);
  expect(Math.abs((await meshInfo(p, 'p')).L - 10 * m0.L) < 1, 'cm: 10 kat');
  await clearToast(p); await p.selectOption('[data-l3unit]', 'mm'); await toast(p, /Birim milimetre yapıldı/);
  const mb = await meshInfo(p, 'p'); expect(Math.abs(mb.L - m0.L) < 0.05, 'mm geri: ' + JSON.stringify([m0, mb]));
  // burun / topuk çevir: boy aynı, kalıp ters döner (iki kez çevirince ilk hâline gelir)
  const yanFirst = await p.evaluate(() => window.__ayk.S.p.last.views.yan.outline.nodes[0].p.join(','));
  await click(p, '[data-l3="toe"]', /yeniden çıkarıldı/);
  const v1 = await views(p, 'p');
  expect(Math.abs(v1.yan.L - v0.yan.L) < 0.3 && Math.abs(v1.yan.H - v0.yan.H) < 0.3, 'çevirince ölçü aynı');
  await click(p, '[data-l3="toe"]', /yeniden çıkarıldı/);
  expect(await p.evaluate(() => window.__ayk.S.p.last.views.yan.outline.nodes[0].p.join(',')) === yanFirst, 'iki kez çevirince ilk hâl');
  await click(p, '[data-l3="side"]', /yeniden çıkarıldı/);
  expect((await meshInfo(p, 'p')).outer === -m0.outer, 'dış yan değişti');
  await click(p, '[data-l3="side"]', /yeniden çıkarıldı/);
  // 90° döndür: yükseklik ile genişlik yer değiştirir; 4 kez döndürünce ilk hâl
  await click(p, '[data-l3="rot"]', /yeniden çıkarıldı/);
  const m1 = await meshInfo(p, 'p');
  expect(Math.abs(m1.H - m0.W) < 0.2 && Math.abs(m1.W - m0.H) < 0.2, '90°: ' + JSON.stringify([m0, m1]));
  for (let i = 0; i < 3; i++) await click(p, '[data-l3="rot"]', /yeniden çıkarıldı/);
  const m2 = await meshInfo(p, 'p');
  expect(Math.abs(m2.H - m0.H) < 0.2 && Math.abs(m2.W - m0.W) < 0.2, '360°');
  // önizleme parmakla döner
  await p.waitForTimeout(200); const cvs = p.locator('canvas[data-l3prev]'); await cvs.scrollIntoViewIfNeeded(); const box = await cvs.boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down();
  await p.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 20, { steps: 6 }); await p.mouse.up();
  expect((await painted(p)) > 0.05, 'döndürünce önizleme boş');
  // kayıt ve yeniden açma
  await p.waitForTimeout(1200);
  await p.reload(); await p.waitForSelector('[data-open]');
  await p.click('[data-open]'); await p.waitForSelector('.ed canvas');
  await p.click('[data-page="dosyalar"]'); await p.waitForSelector('canvas[data-l3prev]');
  const back = await meshInfo(p, 'p');
  expect(back && Math.abs(back.L - m0.L) < 0.05 && back.unit === 'mm', 'yeniden açılınca: ' + JSON.stringify(back));
  expect((await views(p, 'p')).yan.src === '3d', 'görünüş kaydı');
  await click(p, '[data-l3="rm"]', /3D kalıp kaldırıldı/);
  expect(!(await meshInfo(p, 'p')) && (await views(p, 'p')).yan, 'kalıp gitti, görünüş duruyor');
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await R.test('Yazı biçimli STL (cm), OBJ (cm, dörtgen yüz, eksi sıra) ve inç STL: birim numaraya göre bulunur; bozuk dosya hata vermeden reddedilir; telefonda taşma yok', async () => {
  const { ctx, p, errs } = await open({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await p.click('[data-page="yeni"]');
  for (const [file, unit] of [[F.stlA, 'cm'], [F.obj, 'cm'], [F.inch, 'in']]) {
    await clearToast(p); await p.setInputFiles('[data-l3file]', file); await toast(p, /3D kalıp yüklendi/);
    const mi = await meshInfo(p);
    expect(mi.unit === unit && Math.abs(mi.L - 267) < 1.5, path.basename(file) + ': ' + JSON.stringify(mi));
  }
  await clearToast(p); await p.setInputFiles('[data-l3file]', F.bad); await toast(p, /3D kalıp işlenemedi: STL dosyası okunamadı/);
  expect((await meshInfo(p)).unit === 'in', 'bozuk dosya eski kalıbı silmedi');
  // parmakla çevirme (dokunma)
  const box = await p.locator('canvas[data-l3prev]').boundingBox();
  await p.touchscreen.tap(box.x + 20, box.y + 20);
  const over = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(over <= 1, 'yatay taşma: ' + over);
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await R.test('Arka plan işçisi açılamazsa (eski tarayıcı) iş sayfada yapılır', async () => {
  for (const how of ['throw', 'load']) {
    const { ctx, p, errs } = await open(undefined, { noWorker: how });
    await p.click('[data-page="yeni"]');
    await clearToast(p); await p.setInputFiles('[data-l3file]', F.stl); await toast(p, /3D kalıp yüklendi/);
    const mi = await meshInfo(p);
    expect(Math.abs(mi.L - 267) < 1.5 && (await views(p)).yan?.src === '3d', how + ': ' + JSON.stringify(mi));
    await click(p, '[data-l3="toe"]', /yeniden çıkarıldı/);
    expect(!errs.filter((e) => !/yok-boyle-bir-dosya|404/.test(e)).length, how + ': ' + errs.join(' | '));
    await ctx.close();
  }
});

await browser.close(); srv.close(); fs.rmSync(dir, { recursive: true, force: true });
const sum = R.summary(); fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'reports', 'e2e-ayk-3d.json'), JSON.stringify(sum, null, 1));
console.log('\n' + JSON.stringify(sum.counts));
process.exit(sum.counts['başarısız'] ? 1 : 0);
