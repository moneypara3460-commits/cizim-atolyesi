// Ayakkabı Modelhanesi — kalıp ve model resmi: yeni projede kalıp fotoğrafı (yan + alt) ve model resmi ekleme,
// ölçü, bilinen boyla düzeltme, stampada gerçek ölçekte açılma, model resmi düğmesi, kayıt ve geri alma.
// Çalıştır: node tests/e2e/ayk-kalip.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, launch, createRunner, expect, ROOT } from './lib.mjs';
import { scene, toPNG } from '../fixtures/kalip-sahne.mjs';

const R = createRunner('ayk-kalip');
const { srv, url } = await startServer();
const browser = await launch();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kalip-'));
const F = {
  yan: path.join(dir, 'kalip-yan.png'), alt: path.join(dir, 'kalip-alt.png'), model: path.join(dir, 'model.png'), bos: path.join(dir, 'bos.png'),
};
fs.writeFileSync(F.yan, toPNG(scene({ rx: 130, ry: 50 })));
fs.writeFileSync(F.alt, toPNG(scene({ rx: 128, ry: 46, last: [236, 233, 226], paper: [110, 165, 230] })));
fs.writeFileSync(F.model, toPNG(scene({ w: 400, h: 300, rx: 0, ry: 0, bg: [180, 90, 40] })));
fs.writeFileSync(F.bos, toPNG(scene({ rx: 0, ry: 0 })));

async function open(view) {
  const ctx = await browser.newContext(view || { viewport: { width: 1280, height: 900 } });
  await ctx.route('https://unpkg.com/**', (r) => r.abort());
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(url + 'ayakkabi.html?liste=1'); await p.waitForSelector('[data-page="yeni"]');
  return { ctx, p, errs };
}
const A = (p) => p.evaluate(() => { const v = window.__ayk.S.p?.last?.views || {}; return { yan: v.yan && { length: v.yan.length, height: v.yan.height, at: v.yan.at, k: v.yan.k, scale: v.yan.scale }, alt: v.alt && { length: v.alt.length, at: v.alt.at }, photos: window.__ayk.S.p?.modelRef?.photos.length, hist: window.__ayk.S.hist.length, page: window.__ayk.S.page }; });

await R.test('Yeni proje: kalıp yan + alt fotoğrafı ve model resmi eklenir, ölçü görünür, bilinen boyla düzeltilir', async () => {
  const { ctx, p, errs } = await open();
  await p.click('[data-page="yeni"]');
  await p.fill('[data-n="name"]', 'Kalıplı derby');
  await p.dispatchEvent('[data-n="name"]', 'change');
  // kâğıtta kalıp yoksa anlaşılır uyarı, proje bozulmaz
  await p.setInputFiles('[data-lfile="yan"]', F.bos);
  await p.waitForFunction(() => /kalıp bulunamadı/i.test(document.getElementById('toast').textContent));
  expect(await p.locator('.lview[data-lview="yan"] .lprev').count() === 0, 'hatalı fotoğraf eklenmedi');
  await p.setInputFiles('[data-lfile="yan"]', F.yan);
  await p.waitForSelector('.lview[data-lview="yan"] .lprev svg path');
  const t1 = await p.textContent('.lview[data-lview="yan"]');
  expect(/boy 2(59|60),\d mm/.test(t1) && /yükseklik (99|100),\d mm/.test(t1), 'ölçü: ' + t1);
  await p.setInputFiles('[data-lfile="alt"]', F.alt);
  await p.waitForSelector('.lview[data-lview="alt"] .lprev svg');
  expect(/genişlik (91|92),\d mm/.test(await p.textContent('.lview[data-lview="alt"]')), 'alt görünüş genişliği');
  // bilinen boy: her iki görünüş de 268 mm'ye ölçeklenir
  await p.fill('[data-lst="lengthMm"]', '268'); await p.dispatchEvent('[data-lst="lengthMm"]', 'change');
  await p.waitForFunction(() => /boy 268,0 mm/.test(document.querySelector('.lview[data-lview="yan"]').textContent));
  expect(/×1,03\d düzeltildi/.test(await p.textContent('.lview[data-lview="yan"]')), 'düzeltme oranı yazıyor');
  // saçma boy reddedilir
  await p.fill('[data-lst="lengthMm"]', '5'); await p.dispatchEvent('[data-lst="lengthMm"]', 'change');
  expect(await p.locator('[data-lst="lengthMm"].bad').count() === 1, 'geçersiz boy işaretlendi');
  await p.fill('[data-lst="lengthMm"]', '268'); await p.dispatchEvent('[data-lst="lengthMm"]', 'change');
  await p.fill('[data-lst="name"]', 'K-41'); await p.dispatchEvent('[data-lst="name"]', 'change');
  await p.setInputFiles('[data-mfile]', [F.model, F.model]);
  await p.waitForFunction(() => document.querySelectorAll('.mthumb').length === 2);
  await p.click('.mthumb button'); await p.waitForFunction(() => document.querySelectorAll('.mthumb').length === 1);
  // proje oluştur → stampa
  await p.click('[data-act="create"]'); await p.waitForSelector('.ed canvas'); await p.waitForTimeout(400);
  const a = await A(p);
  expect(Math.abs(a.yan.length - 268) < 0.01 && Math.abs(a.alt.length - 268) < 0.01, 'kalıp boyu 268: ' + JSON.stringify(a));
  expect(a.alt.at[1] > a.yan.height + 30, 'alt görünüş yanın altında');
  expect(a.photos === 1, 'model resmi projede');
  expect(await p.evaluate(() => window.__ayk.S.p.last.name) === 'K-41', 'kalıp adı');
  // model resmi düğmesi
  await p.click('.ayk-model .am-t');
  await p.waitForFunction(() => { const b = document.querySelector('.ayk-model .am-b'); return b && !b.hidden && b.querySelector('img').naturalWidth > 0; });
  await p.click('.ayk-model [data-am="x"]');
  // stampada kalıp gerçek ölçekte çizilir: ekranın ortasında sarı (referans) piksel var
  const yellow = await p.evaluate(() => {
    const c = document.querySelector('.ed canvas'), g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data; let n = 0;
    for (let i = 0; i < d.length; i += 16) if (d[i] > 200 && d[i + 1] > 170 && d[i + 2] < 90) n++; return n;
  });
  expect(yellow > 200, 'kalıp çizgisi çizildi: ' + yellow);
  // kayıt: yeniden yüklenince kalıp ve resim duruyor
  await p.waitForTimeout(800); await p.goto(url + 'ayakkabi.html'); await p.waitForSelector('.ed canvas'); await p.waitForTimeout(300);
  const b = await A(p);
  expect(Math.abs(b.yan.length - 268) < 0.01 && b.photos === 1, 'kayıt korundu: ' + JSON.stringify(b));
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await R.test('Proje dosyaları: kalıp görünüşü kaldırılır ve geri alınır; hassasiyet ayarı çizgiyi yeniden çıkarır; telefonda taşma yok', async () => {
  const { ctx, p, errs } = await open({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true });
  await p.click('[data-page="yeni"]'); await p.fill('[data-n="name"]', 'Telefon kalıp'); await p.dispatchEvent('[data-n="name"]', 'change');
  await p.setInputFiles('[data-lfile="yan"]', F.yan); await p.waitForSelector('.lview[data-lview="yan"] .lprev svg');
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); expect(ov <= 1, 'yatay taşma ' + ov);
  await p.click('[data-act="create"]'); await p.waitForSelector('.ed canvas');
  await p.click('[data-page="dosyalar"]'); await p.waitForSelector('.lastcard .lprev');
  const n0 = await p.evaluate(() => window.__ayk.S.p.last.views.yan.outline.nodes.length);
  await p.evaluate(() => { const r = document.querySelector('[data-lsens="yan"]'); r.value = '4'; r.dispatchEvent(new Event('change', { bubbles: true })); });
  await p.waitForFunction(() => window.__ayk.S.p.last.views.yan.sens === 4);
  const v = await p.evaluate(() => window.__ayk.S.p.last.views.yan);
  expect(Math.abs(v.length - 260) < 2.5 && v.outline.nodes.length > 10, 'yeniden çıkarıldı: ' + v.length + ' / ' + n0);
  await p.click('[data-lrm="yan"]'); await p.waitForFunction(() => window.__ayk.S.p.last.views.yan === null);
  // geri al (stampadaki ↶ ile aynı geçmiş): görünüş ve fotoğraf geri gelir
  await p.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })));
  await p.waitForFunction(() => window.__ayk.S.p.last.views.yan && window.__ayk.S.p.last.views.yan.img.startsWith('data:image/jpeg'));
  const ov2 = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); expect(ov2 <= 1, 'dosyalar sayfası taşma ' + ov2);
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await browser.close(); srv.close(); fs.rmSync(dir, { recursive: true, force: true });
const sum = R.summary(); fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'reports', 'e2e-ayk-kalip.json'), JSON.stringify(sum, null, 1));
console.log('\n' + JSON.stringify(sum.counts));
process.exit(sum.counts['başarısız'] ? 1 : 0);
