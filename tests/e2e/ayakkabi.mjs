// Ayakkabı Modelhanesi — uçtan uca (gerçek Chromium, kullanıcı gibi tıklar). Çalıştır: node tests/e2e/ayakkabi.mjs
// İndirilen PDF / SVG / DXF dosyalarının gerçek ölçüsü dosya dışarıda işlenerek doğrulanır:
//   PDF → pdftoppm 254 dpi (10 piksel = 1 mm) · SVG → rsvg-convert 254 dpi · DXF → kendi okuyucumuz + uygulamanın DXF okuyucusu.
// Araç yoksa (pdftoppm / rsvg-convert / python3+PIL) o ölçüm "atlandı" olarak raporlanır, başarı sayılmaz.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startServer, launch, createRunner, expect, ROOT } from './lib.mjs';
import { parseDXF } from '../../cad2d-geom.js';

const R = createRunner('ayakkabi');
const OUT = path.join(ROOT, 'reports'); fs.mkdirSync(OUT, { recursive: true });
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ayk-e2e-'));
const has = (cmd, args = ['--version']) => { try { execFileSync(cmd, args, { stdio: 'ignore' }); return true; } catch (e) { return e.code !== 'ENOENT'; } };
const HAS_PDF = has('pdftoppm', ['-v']), HAS_SVG = has('rsvg-convert'), HAS_PIL = (() => { try { execFileSync('python3', ['-c', 'import PIL']); return true; } catch (e) { return false; } })();
// yeşil (#00ff00) piksellerin sınır kutusu (piksel)
const PYBOX = 'import sys\nfrom PIL import Image\nim=Image.open(sys.argv[1]).convert("RGB");w,h=im.size;px=im.load();xs=[];ys=[]\nfor y in range(h):\n  for x in range(w):\n    r,g,b=px[x,y]\n    if g>150 and r<110 and b<110: xs.append(x);ys.append(y)\nprint(min(xs),min(ys),max(xs),max(ys)) if xs else print("yok")';
const greenBox = (png) => { const s = execFileSync('python3', ['-c', PYBOX, png], { encoding: 'utf8' }).trim(); if (s === 'yok') throw new Error('yeşil kesim çizgisi bulunamadı'); const [x0, y0, x1, y1] = s.split(' ').map(Number); return { w: x1 - x0, h: y1 - y0 }; };

const { srv, url } = await startServer();
const browser = await launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, acceptDownloads: true });
const external = []; ctx.on('request', (r) => { const u = r.url(); if (/^https?:/.test(u) && !u.startsWith(url)) external.push(u); });
const page = await ctx.newPage();
page.on('response', (r) => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
const errors = []; page.on('pageerror', (e) => errors.push(String(e.message || e))); page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const A = () => page.evaluate(() => { const S = window.__ayk.S; return JSON.parse(JSON.stringify({ p: S.p, page: S.page })); });
const view = () => page.evaluate(() => ({ ...window.__ayk.S.editor.S.view }));
// dünya (mm) → ekran (sayfa pikseli)
async function scr(p) { const v = await view(), b = await page.locator('.ed canvas').boundingBox(); return [b.x + b.width / 2 + (p[0] - v.cx) * v.k, b.y + b.height / 2 + (p[1] - v.cy) * v.k]; }
const near = (a, b, tol, m) => expect(Math.abs(a - b) <= tol, `${m}: ${a} ≉ ${b} (±${tol})`);
const bbox = (np) => { const xs = np.nodes.map((n) => n.p[0]), ys = np.nodes.map((n) => n.p[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
async function download(sel) { const [d] = await Promise.all([page.waitForEvent('download'), page.click(sel)]); const f = path.join(TMP, d.suggestedFilename()); await d.saveAs(f); return f; }
const shot = (n) => page.screenshot({ path: path.join(OUT, 'ayk-' + n + '.png') });

await R.test('Açılış: üç bölüm, Ayakkabı Modelhanesi açılır ve seçim hatırlanır', async () => {
  await page.goto(url + '?sec=1');
  await page.waitForSelector('.door.ayakkabi', { state: 'visible' });
  expect(await page.locator('.door').count() === 3, 'üç kapı');
  await page.click('.door.ayakkabi'); await page.waitForURL(/ayakkabi\.html/); await page.waitForSelector('#nav button');
  expect(await page.evaluate(() => localStorage.getItem('cizim:workspace')) === 'ayakkabi', 'seçim hatırlandı');
  expect((await page.locator('#nav button').count()) === 8, '8 bölüm');
  expect(await page.locator('.empty').isVisible(), 'boş proje listesi');
});

await R.test('Yeni proje oluşturma (bilgiler kaydedilir) ve Stampa Atölyesi açılır', async () => {
  await page.click('[data-page="yeni"]');
  await page.fill('[data-n="name"]', 'Test Derby'); await page.fill('[data-n="code"]', 'TD-1'); await page.fill('[data-n="size"]', '41');
  await page.selectOption('[data-n="shoeType"]', 'Derby'); await page.selectOption('[data-n="side"]', 'sag'); await page.selectOption('[data-n="method"]', 'strobel');
  await page.fill('[data-n="desc"]', 'Deneme açıklaması');
  await page.click('[data-act="create"]'); await page.waitForSelector('.ed canvas'); await page.waitForTimeout(300);
  const { p, page: pg } = await A();
  expect(pg === 'stampa', 'stampa açıldı'); expect(p.name === 'Test Derby' && p.code === 'TD-1' && p.size === '41' && p.shoeType === 'Derby' && p.side === 'sag' && p.method === 'strobel' && p.desc === 'Deneme açıklaması', 'proje bilgileri ' + JSON.stringify([p.name, p.code, p.size, p.method]));
});

await R.test('Ölçü girerek saya parçası çizimi: 200 × 100 mm dikdörtgen tam ölçüde', async () => {
  await page.click('[data-a="newpiece"]');
  const add = async (o) => { for (const [k, v] of Object.entries(o)) await page.fill(`[data-o="${k}"]`, String(v)); await page.click('[data-a="numadd"]'); };
  await add({ X: 0, Y: 0 }); await add({ L: 200, A: 0 }); await add({ L: 100, A: -90 }); await add({ L: 200, A: 180 });
  await page.click('[data-a="close"]'); await page.waitForTimeout(200);
  const { p } = await A(), pc = p.pieces[0];
  expect(pc && pc.outline.closed && pc.outline.nodes.length === 4, 'kapalı 4 noktalı sınır');
  const b = bbox(pc.outline); near(b.w, 200, 1e-6, 'en'); near(b.h, 100, 1e-6, 'boy'); near(b.x0, 0, 1e-6, 'x0');
  expect(pc.outline.nodes.every((n) => n.brk), 'köşeler kenar başı');
  await shot('parca');
});

await R.test('Fareyle milimetre hassasiyetinde çizim (ızgara yakalama) ve yakınlaştırma ölçüyü değiştirmez', async () => {
  await page.selectOption('.ed-ctx', 'stampa');
  await page.click('[data-tool="cizgi"]');
  for (const q of [[0, 150.3], [150.4, 149.8]]) { const s = await scr(q); await page.mouse.click(s[0], s[1]); }
  await page.click('[data-a="finish"]');
  let { p } = await A(); const np = p.sketch.paths[0];
  expect(np && np.nodes.length === 2, 'iki noktalı yardımcı çizgi');
  expect(JSON.stringify(np.nodes.map((n) => n.p)) === '[[0,150],[150,150]]', 'ızgaraya oturdu: ' + JSON.stringify(np.nodes.map((n) => n.p)));
  const k0 = (await view()).k;
  await page.click('[data-a="zin"]'); await page.click('[data-a="zin"]'); await page.click('[data-a="zout"]');
  expect((await view()).k > k0, 'yakınlaştı');
  ({ p } = await A()); expect(JSON.stringify(p.sketch.paths[0].nodes.map((n) => n.p)) === '[[0,150],[150,150]]', 'mm değişmedi');
  await page.click('[data-a="fit"]');
});

await R.test('Nokta ekleme, bölme, birleştirme ve Bezier (stampa)', async () => {
  let p;
  // nokta ekle: yardımcı düz çizginin ortası
  await page.click('[data-tool="nokta"]'); let s = await scr([75, 150]); await page.mouse.click(s[0], s[1]);
  ({ p } = await A()); expect(p.sketch.paths[0].nodes.length === 3, 'nokta eklendi');
  // böl: ortadaki düğüm
  await page.click('[data-tool="bol"]'); s = await scr([75, 150]); await page.mouse.click(s[0], s[1]);
  ({ p } = await A()); expect(p.sketch.paths.length === 2, 'iki çizgiye bölündü: ' + p.sketch.paths.length);
  // birleştir: iki parçanın ortak uçları
  await page.click('[data-tool="birlestir"]');
  const first = p.sketch.paths.find((q) => q.nodes[0].p[0] === 0 && q.nodes[0].p[1] === 150), second = p.sketch.paths.find((q) => q.nodes[0].p[0] === 75);
  expect(first && second, 'bölünmüş parçalar');
  s = await scr([75, 150]);
  await page.mouse.click(s[0] - 3, s[1]);   // ilk çizginin sonu (aynı yerde iki uç var: en yakın)
  await page.mouse.click(s[0] + 3, s[1]);
  ({ p } = await A());
  expect(p.sketch.paths.length === 1 && p.sketch.paths[0].nodes.length === 3, 'birleşti: ' + p.sketch.paths.map((q) => q.nodes.length));
  expect(JSON.stringify(p.sketch.paths[0].nodes.map((n) => n.p)) === '[[0,150],[75,150],[150,150]]', 'tek çizgi, ortak nokta tek düğüm');
  await page.click('[data-tool="bezier"]');
  const a = await scr([10, 125]), b = await scr([110, 125]);
  await page.mouse.move(a[0], a[1]); await page.mouse.down(); await page.mouse.move(a[0] + 40, a[1] - 40, { steps: 5 }); await page.mouse.up();
  await page.mouse.move(b[0], b[1]); await page.mouse.down(); await page.mouse.move(b[0] + 40, b[1] + 40, { steps: 5 }); await page.mouse.up();
  await page.click('[data-a="finish"]');
  ({ p } = await A()); const np = p.sketch.paths.at(-1);
  expect(np && np.nodes[0].o && np.nodes[1].i, 'tutamaçlı Bezier');
  await page.click('[data-tool="sec"]');
});

await R.test('Parça düzenleme: kenar türü ve dikiş payı (5 mm) → kesim alanı 210 × 110', async () => {
  await page.click('[data-page="parcalar"]'); await page.waitForSelector('[data-allow="dikis"]');
  for (const sel of await page.locator('select[data-ek="kind"]').all()) await sel.selectOption('dikis');
  await page.fill('[data-allow="dikis"]', '5'); await page.press('[data-allow="dikis"]', 'Tab'); await page.waitForTimeout(150);
  const area = await page.evaluate(async () => { const { measure } = await import('./ayk/build.js?v=20261114s'); return measure(window.__ayk.S.p.pieces[0]).cutArea; });
  near(area, 210 * 110, 1e-6, 'kesim alanı');
  const { p } = await A(); expect(p.pieces[0].allowAuto.dikis === false, 'elle girilen pay otomatikten çıktı');
  await page.fill('[data-pc="name"]', 'Ön saya'); await page.press('[data-pc="name"]', 'Tab');
  await page.selectOption('[data-pc="material"]', 'm-suet');
  await page.waitForTimeout(150);
  const q = (await A()).p.pieces[0]; expect(q.name === 'Ön saya' && q.material === 'm-suet', 'ad ve malzeme');
});

await R.test('Binme payı ve dikiş çizgisi: üst kenar binme 8, dikiş 1,5 mm içeride; türler karışmaz', async () => {
  await page.locator('select[data-ek="kind"]').first().selectOption('binme');
  await page.fill('[data-allow="binme"]', '8'); await page.press('[data-allow="binme"]', 'Tab');
  await page.locator('input[data-ek="st.on"]').first().check(); await page.waitForTimeout(150);
  const r = await page.evaluate(async () => { const B = await import('./ayk/build.js?v=20261114s'); const pc = window.__ayk.S.p.pieces[0]; const it = B.pieceItems(pc); const m = B.measure(pc); return { cb: m.cutBox, stitch: it.filter((x) => x.layer === 'dikis').map((x) => x.pts), binme: it.filter((x) => x.layer === 'binme').length }; });
  near(r.cb.y0, -8, 1e-9, 'üstte binme 8'); near(r.cb.x0, -5, 1e-9, 'solda dikiş 5'); near(r.cb.y1, 105, 1e-9, 'altta dikiş 5');
  expect(r.stitch.length === 1 && r.stitch[0].every((q) => Math.abs(q[1] - 1.5) < 1e-9), 'dikiş çizgisi y = 1,5');
  expect(r.binme === 1, 'binme çizgisi katmanı');
});

await R.test('Çentik ekleme (stampada kenara dokunarak) ve işaretin kenarda kayması', async () => {
  await page.click('[data-page="stampa"]'); await page.waitForSelector('.ed canvas');
  const { p } = await A(); await page.selectOption('.ed-ctx', p.pieces[0].id);
  await page.click('[data-tool="centik"]'); await page.fill('[data-o="label"]', 'A'); await page.press('[data-o="label"]', 'Tab');
  const s = await scr([100, 0]); await page.mouse.click(s[0], s[1] + 1);
  const pc = (await A()).p.pieces[0], m = pc.marks.find((q) => q.kind === 'centik');
  expect(m && m.edge === pc.outline.nodes[0].id && m.label === 'A', 'çentik üst kenarda: ' + JSON.stringify(m));
  near(m.at, 100, 1.5, 'konum');
  await page.click('[data-tool="binme"]'); const s2 = await scr([60, 0]); await page.mouse.click(s2[0], s2[1]);
  expect((await A()).p.pieces[0].marks.some((q) => q.kind === 'binme' && q.edge), 'binme noktası kenarda');
  await page.click('[data-tool="delik"]'); const s3 = await scr([150, 50]); await page.mouse.click(s3[0], s3[1]);
  const d = (await A()).p.pieces[0].marks.find((q) => q.kind === 'delik'); expect(d && d.p[0] === 150 && d.p[1] === 50 && d.d === 4, 'delik ' + JSON.stringify(d));
  await page.click('[data-tool="sec"]'); await shot('isaretler');
});

await R.test('Katmanları açıp kapatma (ekran ve dışa aktarma)', async () => {
  await page.click('[data-a="layers"]'); await page.waitForSelector('[data-ly="dikis"]');
  await page.uncheck('[data-ly="dikis"]'); await page.waitForTimeout(100);
  expect((await A()).p.layers.dikis.visible === false, 'dikiş katmanı kapalı');
  const dxf = await page.evaluate(async () => (await import('./ayk/export.js?v=20261114s')).toDXF(window.__ayk.S.p));
  expect(!/\r\nDIKIS\r\n/.test(dxf) && /\r\nKESIM\r\n/.test(dxf), 'DXF\'te dikiş yok');
  await page.check('[data-ly="dikis"]'); await page.click('.ed-layers [data-a="layers"]');
  expect((await A()).p.layers.dikis.visible === true, 'yeniden açıldı');
});

await R.test('Taşı, döndür, geri al / ileri al', async () => {
  await page.fill('[data-i="mvx"]', '10'); await page.fill('[data-i="mvy"]', '0'); await page.click('[data-a="move"]');
  near(bbox((await A()).p.pieces[0].outline).x0, 10, 1e-9, 'taşındı');
  await page.click('[data-a="undo"]'); near(bbox((await A()).p.pieces[0].outline).x0, 0, 1e-9, 'geri alındı');
  await page.click('[data-a="redo"]'); near(bbox((await A()).p.pieces[0].outline).x0, 10, 1e-9, 'ileri alındı');
  await page.click('[data-a="rot"][data-v="90"]'); const b = bbox((await A()).p.pieces[0].outline); near(b.w, 100, 1e-6, 'döndü'); near(b.h, 200, 1e-6, 'döndü');
  await page.click('[data-a="undo"]'); await page.click('[data-a="undo"]');
  const b2 = bbox((await A()).p.pieces[0].outline); near(b2.w, 200, 1e-6, 'geri'); near(b2.x0, 0, 1e-9, 'geri');
});

await R.test('Parça kopyalama, eşleştirme kontrolü ve parça silme', async () => {
  await page.click('[data-a="copypc"]'); await page.waitForTimeout(100);
  expect((await A()).p.pieces.length === 2, 'kopya');
  await page.click('[data-page="parcalar"]'); await page.waitForSelector('[data-mt="pa"]');
  const { p } = await A();
  await page.selectOption('[data-mt="pa"]', p.pieces[0].id); await page.selectOption('[data-mt="ea"]', p.pieces[0].outline.nodes[0].id);
  await page.selectOption('[data-mt="pb"]', p.pieces[1].id); await page.selectOption('[data-mt="eb"]', p.pieces[1].outline.nodes[0].id);
  await page.selectOption('[data-mt="kind"]', 'binme'); await page.uncheck('[data-mt="reverse"]');   // kopya: kenarlar aynı yönde
  await page.click('[data-act="addmt"]'); await page.waitForTimeout(150);
  const r = await page.evaluate(async () => { const X = await import('./ayk/match.js?v=20261114s'); return X.checkAll(window.__ayk.S.p).map((x) => ({ ok: x.ok, diff: x.diff, n: x.notches.length, iss: x.issues })); });
  expect(r.length === 1 && r[0].ok && Math.abs(r[0].diff) < 1e-9 && r[0].n === 1, 'eşleşme uyumlu ' + JSON.stringify(r));
  expect(await page.locator('.badge.ok', { hasText: 'uyumlu' }).count() === 1, 'arayüzde uyumlu');
  // kopyadaki çentiği kaydır → konum hatası gösterilir
  await page.click(`[data-psel="${p.pieces[1].id}"]`); await page.fill('input[data-mkk="at"] >> nth=0', '96'); await page.press('input[data-mkk="at"] >> nth=0', 'Tab'); await page.waitForTimeout(150);
  expect(await page.locator('.iss', { hasText: 'konum farkı' }).count() >= 1, 'konum farkı gösterildi');
  await page.click('[data-act="delpc"]'); await page.click('[data-act="delpc"]'); await page.waitForTimeout(150);
  const q = (await A()).p; expect(q.pieces.length === 1 && q.matches.length === 0, 'parça ve eşleşmesi silindi');
});

await R.test('Kaydet ve yeniden aç: sayfa yeniden yüklenince proje kaldığı yerden açılır', async () => {
  await page.waitForTimeout(900);   // otomatik kayıt
  const before = (await A()).p;
  await page.reload(); await page.waitForSelector('.ed canvas'); await page.waitForTimeout(300);
  const after = (await A()).p;
  expect(after.id === before.id && after.name === 'Test Derby', 'aynı proje');
  expect(JSON.stringify(after.pieces) === JSON.stringify(before.pieces), 'parçalar birebir');
  expect(after.pieces[0].marks.length === 3 && after.pieces[0].allow.dikis === 5 && after.sketch.paths.length === 2, 'işaretler, paylar, yardımcı çizgiler');
  // revizyon + JSON yedek
  await page.click('[data-page="dosyalar"]'); await page.waitForSelector('[data-act="commit"]');
  await page.fill('[data-act-input="revnote"]', 'ilk revizyon'); await page.click('[data-act="commit"]'); await page.waitForSelector('[data-restore]');
  const f = await download('[data-act="backup"]'); const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  expect(j.kind === 'cizim.ayakkabi' && j.pieces.length === 1 && j.materials.some((m) => m.id === 'm-suet'), 'JSON yedek içeriği');
});

await R.test('Malzeme kütüphanesi: yeni malzeme ekle (kalınlık, esneme yönü, açıklama)', async () => {
  await page.click('[data-page="malzeme"]'); await page.click('[data-act="newmat"]');
  await page.fill('[data-mf="name"]', 'Rugan'); await page.fill('[data-mf="thickness"]', '1,1'); await page.selectOption('[data-mf="stretchDir"]', 'boy'); await page.fill('[data-mf="desc"]', 'parlak');
  await page.click('[data-act="savemat"]'); await page.waitForTimeout(150);
  const lib = await page.evaluate(() => window.__ayk.S.lib.map((m) => [m.name, m.thickness, m.stretchDir]));
  expect(lib.length === 8 && lib.some((m) => m[0] === 'Rugan' && m[1] === 1.1 && m[2] === 'boy'), JSON.stringify(lib));
});

// çıktı ölçümü: kesim çizgisini saf yeşile boya, diğer renkli katmanları kapat
await R.test('Dışa aktarma için kesim katmanı rengi (Ayarlar → Katmanlar)', async () => {
  await page.click('[data-page="ayarlar"]'); await page.waitForSelector('[data-ly="kesim"][data-lk="color"]');
  await page.locator('[data-ly="kesim"][data-lk="color"]').fill('#00ff00'); await page.waitForTimeout(100);
  expect((await A()).p.layers.kesim.color === '#00ff00', 'renk');
});

await R.test('PDF dışa aktarma: A3 yatay, gerçek ölçü 1:1 (kesim 210 × 113 mm: 200 + 2×5 dikiş, 100 + 8 binme + 5 dikiş; ±0,4 mm)', async () => {
  await page.click('[data-page="aktar"]'); await page.selectOption('[data-x="paper"]', 'A3'); await page.selectOption('[data-x="landscape"]', '1');
  const f = await download('[data-act="pdf"]');
  const info = execFileSync('pdfinfo', [f], { encoding: 'utf8' });
  expect(/Pages:\s+1\b/.test(info) && /1190\.55 x 841\.89 pts/.test(info), 'A3 yatay tek sayfa: ' + info.split('\n').filter((l) => /Pages|Page size/.test(l)).join(' '));
  if (!HAS_PDF || !HAS_PIL) throw Object.assign(new Error('pdftoppm / PIL yok: piksel ölçümü yapılamadı'), { skip: true });
  execFileSync('pdftoppm', ['-r', '254', '-png', '-singlefile', f, path.join(TMP, 'pdf')]);
  const b = greenBox(path.join(TMP, 'pdf.png'));
  near(b.w / 10, 210, 0.4, 'PDF en (mm)'); near(b.h / 10, 113, 0.4, 'PDF boy (mm)');
}, { area: 'pdf' });

await R.test('PDF sayfalama: A4 dikeyde parça sığmayınca döşenir', async () => {
  await page.selectOption('[data-x="paper"]', 'A4'); await page.selectOption('[data-x="landscape"]', '');
  const f = await download('[data-act="pdf"]');
  const n = +/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [f], { encoding: 'utf8' }))[1];
  expect(n >= 2, 'döşeme sayfası: ' + n);
  expect(fs.readFileSync(f, 'latin1').includes('Kontrol: 50 mm'), 'ölçek kontrol çizgisi');
});

await R.test('SVG dışa aktarma: mm birimi, gerçek ölçü (kesim 210 × 113 mm, ±0,4 mm)', async () => {
  const f = await download('[data-act="svg"]'); const s = fs.readFileSync(f, 'utf8');
  expect(/width="[\d.]+mm"/.test(s) && /inkscape:groupmode="layer"/.test(s), 'mm ve katmanlar');
  if (!HAS_SVG || !HAS_PIL) throw new Error('rsvg-convert / PIL yok: piksel ölçümü yapılamadı');
  execFileSync('rsvg-convert', ['-d', '254', '-p', '254', '-b', 'white', '-o', path.join(TMP, 'svg.png'), f]);
  const b = greenBox(path.join(TMP, 'svg.png'));
  near(b.w / 10, 210, 0.4, 'SVG en (mm)'); near(b.h / 10, 113, 0.4, 'SVG boy (mm)');
});

await R.test('DXF dışa aktarma: R12, katmanlar ayrı, KESIM 210 × 113 mm; uygulamanın DXF okuyucusu açar', async () => {
  const f = await download('[data-act="dxf"]'); const s = fs.readFileSync(f, 'utf8');
  expect(s.includes('AC1009') && s.trim().endsWith('EOF'), 'R12');
  for (const L of ['KESIM', 'NET', 'DIKIS', 'BINME', 'CENTIK', 'BINME_NOKTA', 'DELIK', 'OLCU', 'YAZI']) expect(new RegExp('\\r\\n8\\r\\n' + L + '\\r\\n').test(s), 'katman ' + L);
  const ents = parseDXF(s).ents.filter((e) => e.layer === 'KESIM');
  const xs = ents.flatMap((e) => [e.a[0], e.b[0]]), ys = ents.flatMap((e) => [e.a[1], e.b[1]]);
  near(Math.max(...xs) - Math.min(...xs), 210, 1e-6, 'DXF en'); near(Math.max(...ys) - Math.min(...ys), 113, 1e-6, 'DXF boy');
  near(Math.max(...ys), 8, 1e-6, 'y yukarı (binme payı üstte)');
});

await R.test('Parça silme (stampadan) ve geri alma', async () => {
  await page.click('[data-page="stampa"]'); await page.waitForSelector('.ed canvas');
  const id = (await A()).p.pieces[0].id; await page.selectOption('.ed-ctx', id);
  await page.click('[data-a="delpc"]'); await page.click('[data-a="delpc"]');
  expect((await A()).p.pieces.length === 0, 'silindi');
  await page.click('[data-a="undo"]'); expect((await A()).p.pieces.length === 1, 'geri geldi');
});

await R.test('Sayfa hatası yok, dış siteye istek yok', async () => {
  expect(!errors.length, 'hatalar: ' + errors.join(' | '));
  expect(!external.length, 'dış istek: ' + external.join(', '));
});

// telefon: dokunmatik çizim
await R.test('Telefon (390 × 844, dokunmatik): proje oluştur, dokunarak kapalı çizgi çiz, parçaya dönüştür', async () => {
  const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const m = await mctx.newPage(); const errs = []; m.on('pageerror', (e) => errs.push(String(e.message)));
  await m.goto(url + 'ayakkabi.html'); await m.waitForSelector('#nav button');
  await m.click('[data-page="yeni"]'); await m.fill('[data-n="name"]', 'Telefon'); await m.click('[data-act="create"]'); await m.waitForSelector('.ed canvas');
  await m.click('[data-tool="cizgi"]');
  const b = await m.locator('.ed canvas').boundingBox();
  const pts = [[b.x + 60, b.y + 80], [b.x + 260, b.y + 90], [b.x + 200, b.y + 230]];
  for (const q of pts) await m.touchscreen.tap(q[0], q[1]);
  await m.touchscreen.tap(pts[0][0], pts[0][1]);   // ilk noktaya dokun: kapanır
  await m.waitForTimeout(150);
  let p = await m.evaluate(() => JSON.parse(JSON.stringify(window.__ayk.S.p)));
  expect(p.sketch.paths.length === 1 && p.sketch.paths[0].closed && p.sketch.paths[0].nodes.length === 3, 'kapalı üçgen: ' + JSON.stringify(p.sketch.paths.map((q) => [q.closed, q.nodes.length])));
  await m.click('[data-a="topiece"]'); await m.waitForTimeout(150);
  p = await m.evaluate(() => JSON.parse(JSON.stringify(window.__ayk.S.p)));
  expect(p.pieces.length === 1 && p.pieces[0].outline.closed, 'parçaya dönüştü');
  const ov = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(ov <= 1, 'yatay taşma yok: ' + ov);
  await m.setViewportSize({ width: 320, height: 700 }); await m.waitForTimeout(150);
  const ov2 = await m.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(ov2 <= 1, '320 piksel genişlikte yatay taşma yok: ' + ov2);
  await m.setViewportSize({ width: 390, height: 844 });
  expect(await m.locator('.ed-tools').isVisible(), 'araç çubuğu görünür');
  await m.screenshot({ path: path.join(OUT, 'ayk-telefon.png') });
  expect(!errs.length, errs.join(' | '));
  await mctx.close();
});

await browser.close(); srv.close();
const sum = R.summary(); fs.writeFileSync(path.join(OUT, 'e2e-ayakkabi.json'), JSON.stringify(sum, null, 1));
console.log('\n' + JSON.stringify(sum.counts));
process.exit(sum.counts['başarısız'] ? 1 : 0);
