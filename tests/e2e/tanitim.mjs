// Tanıtım sitesi (tanitim/): üst menüden bölüm açma, adres (#), geri tuşu, eski bağlantılar, taşma, sayfa hatası.
// Çalıştır: node tests/e2e/tanitim.mjs
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, createRunner, expect, ROOT } from './lib.mjs';

const R = createRunner('tanitim');
const { srv, url } = await startServer();
const browser = await launch();
const PANELS = ['ana', 'makine', 'tekstil', 'ayakkabi', 'guven', 'hakkinda', 'sss'];
for (const [name, view] of [['bilgisayar', { viewport: { width: 1280, height: 860 } }], ['telefon', { viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true }]]) {
  await R.test(`Tanıtım (${name}): menüden her bölüm tek başına açılır, adres değişir, geri tuşu ve eski bağlantılar çalışır, taşma ve hata yok`, async () => {
    const ctx = await browser.newContext(view);
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());   // yazı tipi dış sitesi testte kapalı
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('response', (r) => { if (r.status() >= 400 && r.url().startsWith(url)) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
    await p.goto(url + 'tanitim/'); await p.waitForSelector('.tabs a');
    const open = () => p.evaluate(() => [...document.querySelectorAll('[data-panel]')].filter((x) => !x.hidden).map((x) => x.dataset.panel));
    expect(JSON.stringify(await open()) === '["ana"]', 'ilk açılışta yalnız ana sayfa');
    for (const id of PANELS) {
      await p.click(`.tabs a[href="#${id}"]`); await p.waitForTimeout(150);
      expect(JSON.stringify(await open()) === JSON.stringify([id]), id + ' tek başına açıldı: ' + await open());
      if (id !== 'ana') expect(p.url().endsWith('#' + id), 'adres #' + id);   // açık olan ana sayfaya dokunmak adresi değiştirmez, başa döner
      expect(await p.locator(`.tabs a[href="#${id}"]`).getAttribute('aria-current') === 'page', 'etkin sekme işaretli');
      const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); expect(ov <= 1, id + ' yatay taşma ' + ov);
    }
    await p.goBack(); await p.waitForTimeout(150); expect(JSON.stringify(await open()) === '["hakkinda"]', 'geri tuşu bir önceki bölüm (Sorular → Hakkında)');
    await p.goto(url + 'tanitim/#moduller'); await p.waitForTimeout(150); expect(JSON.stringify(await open()) === '["makine"]', 'eski #moduller bağlantısı makineyi açar');
    await p.goto(url + 'tanitim/#yok'); await p.waitForTimeout(150); expect(JSON.stringify(await open()) === '["ana"]', 'bilinmeyen adres ana sayfa');
    // kartlardaki "Ayrıntılar" ilgili bölümü açar
    await p.click('.wcard.ayk a[href="#ayakkabi"]'); await p.waitForTimeout(150); expect(JSON.stringify(await open()) === '["ayakkabi"]', 'kart bağlantısı');
    // görseller yüklendi
    for (const id of PANELS) { await p.click(`.tabs a[href="#${id}"]`); await p.waitForTimeout(50); }
    const broken = await p.evaluate(() => [...document.images].filter((i) => i.complete && !i.naturalWidth).map((i) => i.getAttribute('src')));
    expect(!broken.length, 'kırık görsel: ' + broken);
    expect(!errs.length, errs.join(' | '));
    await ctx.close();
  });
}
await R.test('Tanıtım: JavaScript kapalıyken bütün bölümler görünür', async () => {
  const ctx = await browser.newContext({ javaScriptEnabled: false }); await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const p = await ctx.newPage(); await p.goto(url + 'tanitim/');
  expect(await p.locator('[data-panel]:visible').count() === PANELS.length, 'hepsi görünür');
  await ctx.close();
});
await browser.close(); srv.close();
const sum = R.summary(); fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'reports', 'e2e-tanitim.json'), JSON.stringify(sum, null, 1));
console.log('\n' + JSON.stringify(sum.counts));
process.exit(sum.counts['başarısız'] ? 1 : 0);
