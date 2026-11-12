// Tarayıcı uçtan uca testleri (gerçek uygulama, gerçek kullanıcı etkileşimi): node tests/e2e/run.mjs
// Ortam: Chromium (Playwright), yazılımsal WebGL (SwiftShader). Ekran boyutları EMÜLASYONDUR (gerçek cihaz değildir).
// Çıktı: reports/e2e.json, başarısızlıkta reports/shots/*.png. Ayrıntı: TESTLER.md
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openApp, waitReady, createRunner, expect, ROOT } from './lib.mjs';

const OUT = path.join(ROOT, 'reports'), SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.argv.slice(2);
const R = createRunner('e2e');
const { srv, url } = await startServer();
const browser = await launch();
const NO_GUIDE = () => { try { localStorage.setItem('cizim:guideSeen', '1'); if (!localStorage.getItem('cizim:workspace')) localStorage.setItem('cizim:workspace', 'makine'); } catch (e) { /* */ } };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, dpr: 2 };
const DESK = { viewport: { width: 1366, height: 900 } };
const perf = [];

/* ---------- yardımcılar ---------- */
// E2E_UI=yeni: aynı testler yeni arayüzde (yeni/index.html) koşar; hesap kodu ortak
const UI_PATH = process.env.E2E_UI === 'yeni' ? 'yeni/index.html' : undefined;
// yeni arayüz koşusunda tekstil (ayrı sayfa) ve eski açılış seçimi (yalnız eski arayüzde var) tekrar koşulmaz
const SKIP_YENI = UI_PATH ? ['t-tekstil', 'w-alan'] : [];
async function app(view = DESK) { const a = await openApp(browser, url, { ...view, path: UI_PATH, init: NO_GUIDE }); await waitReady(a.page); return a; }
const act = async (page, a) => { const b = page.locator(`[data-act="${a}"]:visible`).first(); await b.scrollIntoViewIfNeeded(); await b.click(); };
const tab = async (page, k) => {
  // yeni arayüz: sekme önce alttaki / üstteki bölüm düğmesiyle açılır (Tasarım, Analiz, Üretim); telefonda panel kapalıysa açılır
  const m = await page.evaluate((k) => (window.__shell ? window.__shell.modeOf(k) : null), k);
  if (m) {
    if (!(await page.locator(`#tabs [data-act="tab-${k}"]`).isVisible())) { await page.locator(`#nav [data-mode="${m}"]`).click(); await page.waitForTimeout(150); }
    if (await page.evaluate(() => !window.__shell.isDesk() && window.__shell.sheet === 'closed')) { await page.locator('#floats [data-ui="props"]').click(); await page.waitForTimeout(300); }
  }
  const b = page.locator(`#tabs [data-act="tab-${k}"]`); await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(150);
};
const body = (page) => page.locator('#tabbody').innerText();
const chips = (page) => page.locator('#chips .chip').count();
const selChips = (page) => page.locator('#chips .chip.on').count();
async function setK(page, k, v) { const i = page.locator(`#tabbody [data-k="${k}"]`).first(); await i.fill(String(v)); await page.waitForTimeout(250); }
async function waitText(page, sel, re, timeout = 60000) { await page.waitForFunction(([s, r]) => { const el = document.querySelector(s); return el && new RegExp(r).test(el.innerText); }, [sel, re.source], { timeout }); }
async function download(page, fn) { const [d] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), fn()]); const p = await d.path(); return { name: d.suggestedFilename(), text: fs.readFileSync(p, 'utf8'), size: fs.statSync(p).size }; }
async function choose(page, fn, files) { const [fc] = await Promise.all([page.waitForEvent('filechooser', { timeout: 15000 }), fn()]); await fc.setFiles(files); }
async function shot(page, name) { const p = path.join(SHOTS, name.replace(/[^\w-]+/g, '_') + '.png'); try { await page.screenshot({ path: p }); } catch (e) { /* */ } return p; }
const canvasBox = (page) => page.locator('#view canvas').boundingBox();
async function close(a) { try { await a.ctx.close(); } catch (e) { /* */ } }
const tmp = (name, text) => { const p = path.join(OUT, 'tmp_' + name); fs.writeFileSync(p, text); return p; };
// test gövdesi: hata olursa ekran görüntüsü + toplanan sayfa hataları
const T = (title, area, fn, meta = {}) => { if (only.length && !only.some((o) => area.toLowerCase().startsWith(o.toLowerCase()))) return; if (SKIP_YENI.includes(area.toLowerCase())) return; return R.test(title, async () => {
  const a = await app(meta.view || DESK);
  try { expect(!a.net.missing.length, 'Kütüphane dosyası bulunamadı: ' + a.net.missing[0]); await fn(a); expect(!a.net.external.length, 'Dış siteye istek: ' + a.net.external.slice(0, 3).join(', ')); const errs = a.errors.filter((e) => !(meta.allowErr || []).some((re) => re.test(e))); expect(!errs.length, 'Sayfa hataları: ' + errs.slice(0, 3).join(' | ')); }
  catch (e) { e.shot = await shot(a.page, area + '_' + title); throw e; }
  finally { await close(a); }
}, { area }); };

/* ---------- A. 2B CAD ---------- */
await T('2B: dikdörtgen + daire + ölçü çiz, geri al / ileri al, kalıcılık, DXF dışa ve geri içe aktar', 'A-2B', async ({ page }) => {
  await act(page, 'cad2d');
  await page.waitForSelector('#cad');
  const stat = async () => +((await page.locator('#cad-stat').innerText()).match(/Varlık: (\d+)/) || [])[1];
  const n0 = await stat();
  const fld = async (k, v) => { await page.locator(`#cad [data-k="${k}"]`).fill(String(v)); };
  const A = async (a) => { await page.locator(`#cad [data-a="${a}"]`).first().click(); await page.waitForTimeout(60); };
  await A('tool-rect'); await fld('x', 0); await fld('y', 0); await A('in-pt'); await fld('w', 100); await fld('h', 50); await A('in-rect');
  await A('tool-circle'); await fld('x', 50); await fld('y', 25); await A('in-pt'); await fld('d', 20); await A('in-circle');
  await A('tool-dim'); for (const [x, y] of [[0, 0], [100, 0], [50, -15]]) { await fld('x', x); await fld('y', y); await A('in-pt'); }
  const n1 = await stat();
  expect(n1 >= n0 + 3, `varlık sayısı ${n0} → ${n1}`);
  await A('undo'); expect(await stat() === n1 - 1, 'geri al'); await A('redo'); expect(await stat() === n1, 'ileri al');
  await A('tab-file');
  const dxf = await download(page, () => A('f-dxf'));
  expect(/SECTION/.test(dxf.text) && /ENTITIES/.test(dxf.text) && /EOF/.test(dxf.text), 'DXF yapısı');
  expect(/\nCIRCLE\r?\n/.test(dxf.text) && /\nLINE\r?\n/.test(dxf.text), 'DXF çizgi ve daire');
  expect(/\n100(\.0+)?\r?\n/.test(dxf.text) || /\n100\r?\n/.test(dxf.text), 'DXF 100 mm koordinat');
  // kapat-aç: çizim telefonda saklanır
  await A('close'); await page.waitForTimeout(400); await act(page, 'cad2d'); await page.waitForSelector('#cad');
  expect(await stat() === n1, 'yeniden açınca aynı çizim');
  // temizle, DXF'i geri aç
  await A('tab-file'); await A('f-clear'); await A('f-clear'); expect(await stat() === 0, 'temizlendi');
  await choose(page, () => A('f-open'), tmp('a.dxf', dxf.text));
  await page.waitForTimeout(600);
  const n2 = await stat();
  expect(n2 >= 2, 'DXF içe aktarıldı: ' + n2);
  // bozuk DXF: çökmeden reddedilir
  await choose(page, () => A('f-open'), tmp('bozuk.dxf', 'bu bir dxf değil\n\u0000\u0001'));
  await page.waitForTimeout(400);
  expect(await stat() >= 0, 'bozuk DXF sonrası uygulama çalışıyor');
});

/* ---------- B. 3B CAD ---------- */
await T('3B: kutu + ölçü + yuvarlama + oyuk (delik), kaydet, sayfayı yenile, aç', 'B-3B', async ({ page }) => {
  const c0 = await chips(page);
  await act(page, 'add-box'); await page.waitForTimeout(400);
  expect(await chips(page) === c0 + 1, 'kutu eklendi');
  await tab(page, 'dims'); await setK(page, 'w', 120); await setK(page, 'h', 30); await setK(page, 'l', 80); await setK(page, 'r', 4);
  await act(page, 'hole-round'); await page.waitForTimeout(500);
  expect(await chips(page) === c0 + 2, 'delik (oyuk) eklendi');
  expect(/oyuk/.test(await page.locator('#chips').innerText()), 'oyuk çipi');
  await act(page, 'projects'); await page.locator('#pname').fill('e2e-proje'); await act(page, 'dlg-save'); await page.waitForTimeout(300);
  await page.reload(); await waitReady(page);
  await act(page, 'projects'); await page.locator('[data-open="e2e-proje"]').click(); await page.waitForTimeout(800);
  expect(await chips(page) === c0 + 2, 'açılan projede parça sayısı');
  await page.locator('#chips .chip').nth(c0).click(); await tab(page, 'dims');
  expect(+(await page.locator('#tabbody [data-k="w"]').inputValue()) === 120, 'ölçü korundu');
  expect(+(await page.locator('#tabbody [data-k="r"]').inputValue()) === 4, 'yuvarlama korundu');
});

await T('3B: boş alana dokunma seçimi ve paneli temizler; kamera döndürme temizlemez; parçaya dokununca seçilir', 'B-3B', async ({ page }) => {
  await act(page, 'fit'); await page.waitForTimeout(300);
  const b = await canvasBox(page), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  await page.mouse.click(cx, cy); await page.waitForTimeout(200);
  expect(await selChips(page) === 1, 'parçaya tıklayınca seçili');
  // sürükle (kamera döndür): seçim kalır
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 120, cy + 40, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(200);
  expect(await selChips(page) === 1, 'döndürme seçimi kaldırmadı');
  await page.mouse.click(b.x + 8, b.y + 8); await page.waitForTimeout(200);
  expect(await selChips(page) === 0, 'boş alana dokununca seçim kalktı');
  expect(/Seçili parça yok/.test(await body(page)), 'bağlamsal panel temizlendi');
  await act(page, 'fit'); await page.waitForTimeout(300);
  await page.mouse.click(cx, cy); await page.waitForTimeout(200);
  expect(await selChips(page) === 1, 'yeniden seçildi');
  // panel düğmesine dokunmak seçimi kaldırmaz
  await tab(page, 'pos'); expect(await selChips(page) === 1, 'sekme değişimi seçimi korur');
});

/* ---------- C. OCCT ---------- */
await T('OCCT: motor yüklenir, model B-Rep doğrulanır, yuvarlama, STEP dışa → içe, IGES içe, bozuk STEP hatası', 'C-OCCT', async ({ page }) => {
  await tab(page, 'occt');
  const t0 = Date.now();
  await act(page, 'oc-model');
  await waitText(page, '#tabbody', /Geçerli katı|Sorunlu geometri|⚠/, 120000);
  perf.push(['OCCT ilk yükleme + model', Date.now() - t0, 'ms']);
  const tx = await body(page);
  expect(/OCCT yüklü/.test(tx) && /Geçerli katı/.test(tx), 'OCCT geçerli katı: ' + tx.slice(0, 200));
  expect(/düzlem/.test(tx), 'CAM yüz türleri');
  const c0 = await chips(page);
  await page.locator('#tabbody [data-oc="r"]').fill('2'); await page.locator('#tabbody [data-oc="r"]').dispatchEvent('change');
  await act(page, 'oc-fillet'); await page.waitForFunction((n) => document.querySelectorAll('#chips .chip').length > n, c0, { timeout: 60000 });
  const step = await download(page, () => act(page, 'oc-step-out'));
  expect(/^ISO-10303-21;/.test(step.text) && /ADVANCED_FACE/.test(step.text), 'STEP içeriği');
  const c1 = await chips(page);
  await choose(page, () => act(page, 'oc-step-in'), tmp('m.step', step.text));
  await page.waitForFunction((n) => document.querySelectorAll('#chips .chip').length > n, c1, { timeout: 60000 });
  const c2 = await chips(page);
  await choose(page, () => act(page, 'oc-iges-in'), path.join(ROOT, 'tests/fixtures/cube-10mm.igs'));
  await page.waitForFunction((n) => document.querySelectorAll('#chips .chip').length > n, c2, { timeout: 60000 });
  const c3 = await chips(page);
  await choose(page, () => act(page, 'oc-step-in'), tmp('bozuk.step', 'ISO-10303-21;\nBOZUK VERI\n'));
  await waitText(page, '#tabbody', /⚠/, 30000);
  expect(await chips(page) === c3, 'bozuk STEP parça eklemedi');
  // Three.js görünümü: OCCT modeli tekrar kurulur, tessellation sahnede açılıp kapatılır
  await act(page, 'oc-model'); await waitText(page, '#tabbody', /OCCT görüntüsü/, 120000);
  const on0 = /görüntüsü: açık/.test(await body(page));
  await act(page, 'oc-show'); await page.waitForTimeout(300);
  expect(/görüntüsü: açık/.test(await body(page)) !== on0, 'OCCT görüntüsü aç/kapat');
}, { allowErr: [/OCCT|STEP/] });

/* ---------- D. Montaj ---------- */
await T('Montaj: örnek "Mil ve burç" eşleşmeli montaj, montaj sırası planı, kaydet / aç', 'D-Montaj', async ({ page }) => {
  await act(page, 'guide'); await page.locator('[data-ex="mil"]').click(); await page.waitForTimeout(800);
  expect(await chips(page) >= 2, 'montaj parçaları');
  await tab(page, 'mate'); const m = await body(page); expect(/eş merkez|Eş merkez|eksen|Eşleşme|eşleşme/i.test(m), 'eşleşme paneli');
  await tab(page, 'asm'); await page.waitForTimeout(300);
  const b0 = await body(page);
  if (/as-go/.test(await page.locator('#tabbody').innerHTML())) await act(page, 'as-go');
  await page.waitForTimeout(1500);
  const b1 = await body(page);
  expect(/adım|Adım|sıra|Sıra/.test(b0 + b1), 'montaj sırası');
  await act(page, 'projects'); await page.locator('#pname').fill('e2e-montaj'); await act(page, 'dlg-save'); await page.waitForTimeout(200);
  const n = await chips(page);
  await page.reload(); await waitReady(page); await act(page, 'projects'); await page.locator('[data-open="e2e-montaj"]').click(); await page.waitForTimeout(800);
  expect(await chips(page) === n, 'montaj açıldı');
});

/* ---------- E. Sac metal ---------- */
await T('Sac: U kanal örneği, açınım boyu panelde, açınım DXF boyu açınım boyuna eşit', 'E-Sac', async ({ page }) => {
  await act(page, 'guide'); await page.locator('[data-ex="sac"]').click(); await page.waitForTimeout(800);
  await tab(page, 'dims');
  const tx = await body(page), m = tx.match(/Açınım boyu: ([\d.,]+) mm × ([\d.,]+) mm/);
  expect(m, 'açınım boyu yazısı: ' + tx.slice(0, 300));
  const num = (t) => parseFloat(/,/.test(t) ? t.replace(/\./g, '').replace(',', '.') : t), flatL = num(m[1]), W = num(m[2]);
  await tab(page, 'type');
  const dxf = await download(page, () => act(page, 'sh-dxf'));
  expect(/LINE/.test(dxf.text), 'DXF çizgi');
  // DXF X kapsamı = açınım boyu
  const xs = [], ys = []; const L = dxf.text.split(/\r?\n/).map((s) => s.trim());
  for (let i = 0; i < L.length - 1; i++) { if (L[i] === '10' || L[i] === '11') xs.push(+L[i + 1]); if (L[i] === '20' || L[i] === '21') ys.push(+L[i + 1]); }
  const ex = Math.max(...xs) - Math.min(...xs), ey = Math.max(...ys) - Math.min(...ys);
  expect(Math.abs(Math.max(ex, ey) - Math.max(flatL, W)) < 0.6 && Math.abs(Math.min(ex, ey) - Math.min(flatL, W)) < 0.6, `DXF kapsamı ${ex.toFixed(2)}×${ey.toFixed(2)} ≠ ${flatL}×${W}`);
});

/* ---------- F. Üretim ---------- */
await T('Üretim: 100 mm çelik küp ağırlığı ρV = 7,85 kg; masa iskeleti kesim listesi, kesim optimizasyonu, kaynak ve maliyet panelleri', 'F-Üretim', async ({ page }) => {
  const c = await chips(page);
  for (let i = c - 1; i > 0; i--) { await page.locator('#chips .chip').nth(i).click(); await act(page, 'del'); }
  await page.locator('#chips .chip').first().click();
  await tab(page, 'type'); await act(page, 'type-box'); await tab(page, 'dims');
  await setK(page, 'w', 100); await setK(page, 'h', 100); await setK(page, 'l', 100); await setK(page, 'r', 0); await setK(page, 'c', 0); await setK(page, 'tp', 0);
  await page.waitForTimeout(500);
  await tab(page, 'wgt'); await page.waitForTimeout(800);
  const w = await body(page), kg = w.match(/([\d]+,\d+) kg/);
  expect(kg, 'kg yazısı: ' + w.slice(0, 200));
  const v = parseFloat(kg[1].replace(',', '.'));
  expect(Math.abs(v - 7.85) / 7.85 < 0.01, 'ağırlık ' + v + ' kg (beklenen 7,85)');
  await act(page, 'guide'); await page.locator('[data-ex="masa"]').click(); await page.waitForTimeout(1000);
  await tab(page, 'type');
  const csv = await download(page, () => act(page, 'fr-csv'));
  expect(csv.text.split('\n').length > 3, 'kesim listesi CSV');
  await act(page, 'cut-opt'); await page.waitForTimeout(800);
  const ov = await page.locator('body').innerText();
  expect(/boy|Boy|fire|Fire/.test(ov), 'kesim optimizasyonu ekranı');
  await page.evaluate(() => { for (const id of ['cut', 'cutopt']) document.getElementById(id)?.remove(); });
  await page.reload(); await waitReady(page);
  await tab(page, 'weld'); await act(page, 'wd-detect');
  await waitText(page, '#tabbody', /birleşim|Birleşim/, 60000);
  await page.waitForFunction(() => !/aranıyor/.test(document.querySelector('#tabbody').innerText), null, { timeout: 60000 });
  const wtx = await body(page);
  // masa iskeleti: 4 dikme, 8 kuşak (40×40 kutu) → 16 uç birleşimi, her biri çepeçevre 4 × 40 = 160 mm
  expect(/16 olası kaynak birleşimi/.test(wtx), 'kaynak birleşimi sayısı 16: ' + wtx.slice(0, 300).replace(/\n/g, ' / '));
  expect((wtx.match(/Çepeçevre · 160 mm/g) || []).length === 16, 'her birleşim çepeçevre 160 mm');
  await act(page, 'wd-all'); await page.waitForTimeout(500);
  expect(/Toplam bağlantı uzunluğu\s*2[.,]?560 mm/.test(await body(page)), 'onaylı toplam 16 × 160 = 2560 mm: ' + (await body(page)).match(/Toplam bağlantı uzunluğu[^\n]*\n[^\n]*/)?.[0])
  await tab(page, 'cost'); await page.waitForTimeout(800);
  const ctx = await body(page);
  expect(/₺|TL/.test(ctx) && /\d/.test(ctx), 'maliyet paneli sayı ve para birimi: ' + ctx.slice(0, 200));
});

/* ---------- G. 3 eksen CAM ---------- */
await T('3 eksen CAM: takım yolu, simülasyon, Fanuc G-kodu', 'G-CAM3', async ({ page }) => {
  await tab(page, 'dims'); await setK(page, 'w', 60); await setK(page, 'h', 20); await setK(page, 'l', 40);
  await tab(page, 'cam');
  await act(page, 'c5-mode-3').catch(() => {});
  const t0 = Date.now(); await act(page, 'cn-go');
  await waitText(page, '#tabbody', /G-kodunu indir|⛔|hata/i, 120000);
  perf.push(['3 eksen CAM hesap (60×40×20 kutu)', Date.now() - t0, 'ms']);
  const g = await download(page, () => act(page, 'cn-dl'));
  expect(/^%/.test(g.text) && /G21/.test(g.text) && /M30/.test(g.text), 'G-kodu başı / sonu');
  expect(/G43 Z/.test(g.text) && /\nG1 /.test(g.text), 'takım boyu telafisi ve kesme hareketi');
  await act(page, 'cn-sim'); await page.waitForTimeout(1500);
});

/* ---------- H. CNC torna ---------- */
await T('CNC torna: örnek kademeli mil (9 operasyon), hatasız denetim, 3B simülasyon oynat / durdur / operasyon geçişi, G-kodu ekranda + .nc indir, simülasyon ↔ G-kodu tutarlılığı, OCCT doğrulaması; hatalı parametre uyarısı; freze modu korunur', 'H-Torna', async ({ page }) => {
  await tab(page, 'cam'); await act(page, 'lz-on');
  await page.waitForSelector('#tabbody [data-act="lz-go"]'); await act(page, 'lz-ex');
  let b = await body(page);
  for (const s of ['Makine', 'Ham malzeme ve bağlama', 'Parça geometrisi', 'Takım kütüphanesi', 'Operasyonlar ve işleme parametreleri']) expect(b.includes(s), 'bölüm: ' + s);
  expect(/Bu sürümde yok:.*C ekseni.*Y ekseni.*Canlı/.test(b), 'olmayan yetenekler açıkça yazılı');
  expect(await page.locator('#lz-svg path').count() >= 1, '2B X-Z profil çizimi');
  const t0 = Date.now(); await act(page, 'lz-go');
  await page.waitForSelector('#lz-sum', { timeout: 120000 }); perf.push(['Torna örnek parça: hesap + simülasyon', Date.now() - t0, 'ms']);
  b = await body(page);
  expect(/✅ Hata yok/.test(b) && !/uyarı/.test(await page.locator('#lz-sum').innerText()), 'denetim: ' + (await page.locator('#lz-sum').innerText()));
  expect(/Fazla kesim \(parçaya girme\)\s*yok/.test(b) && /Kalan malzeme\s*yok/.test(b), 'fazla kesim / kalan yok');
  expect(/✅ G-kodu geri okundu: \d+ hareket simülasyonla aynı/.test(b), 'simülasyon ↔ G-kodu');
  const code = await page.locator('#lz-code').innerText();
  expect(/^%\nO2001/.test(code) && /T0101/.test(code) && /G96 S200 M03/.test(code), 'G-kodu ekranda');
  // 3B: dönen ham, takım, yol
  expect(await page.evaluate(() => window.__app.lathe.state().meshes) >= 1, '3B sahne');
  await act(page, 'lz-play'); await page.waitForFunction(() => window.__app.lathe.state().playI > 30, null, { timeout: 30000 });
  await act(page, 'lz-play'); const i1 = await page.evaluate(() => window.__app.lathe.state().playI); await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__app.lathe.state().playI) === i1, 'durdur');
  await act(page, 'lz-opn'); const i2 = await page.evaluate(() => window.__app.lathe.state().playI); expect(i2 > i1, `sonraki operasyon ${i1} → ${i2}`);
  expect(/\d+ \/ \d+/.test(await page.locator('#lz-ro').innerText()), 'konum göstergesi');
  await page.locator('#tabbody [data-lz="speed"]').selectOption('40'); await act(page, 'lz-play');
  await page.waitForFunction(() => { const s = window.__app.lathe.state(); return !s.playing && s.playI === s.moves; }, null, { timeout: 60000 });
  await act(page, 'lz-v-final'); await act(page, 'lz-v-path');
  const dl = await download(page, () => act(page, 'lz-dl-nc'));
  expect(/_torna\.nc$/.test(dl.name) && /\r\nM30\r\n%/.test(dl.text) && /G76 /.test(dl.text), 'indirilen .nc: ' + dl.name);
  // OCCT doğrulaması (gerçek WASM, işçide)
  await act(page, 'lz-occt'); await page.waitForSelector('#lz-occt-ok, [data-lz-issue]', { timeout: 120000 });
  b = await body(page); expect(/Katılar geçerli: evet/.test(b), 'OCCT: ' + b.slice(b.indexOf('OCCT'), b.indexOf('OCCT') + 300));
  // hatalı parametre: ilerleme negatif → hata, indirme engelli
  await page.locator('#tabbody [data-lz="op.2.f"]').fill('-1'); await page.locator('#tabbody [data-lz="op.2.f"]').dispatchEvent('change');
  await act(page, 'lz-go'); await page.waitForSelector('#lz-sum', { timeout: 60000 });
  expect(/⛔/.test(await page.locator('#lz-sum').innerText()) && /İlerleme \(mm\/dev\) pozitif olmalı/.test(await body(page)), 'hatalı ilerleme uyarısı');
  // freze moduna dönüş: 3 eksen paneli çalışır
  await act(page, 'c5-mode-3'); expect(await page.locator('#tabbody [data-act="cn-go"]').count() === 1 && !(await page.locator('#tabbody [data-act="lz-go"]').count()), 'freze moduna dönüldü');
}, { view: PHONE });

/* ---------- I. 4 / 5 eksen ---------- */
await T('4 eksen: divizör indeksli işlem, çarpışma kontrolü, simülasyon, G-kodu (Fanuc 4. eksen)', 'I-4/5', async ({ page }) => {
  await tab(page, 'dims'); await setK(page, 'w', 60); await setK(page, 'h', 20); await setK(page, 'l', 20);
  await tab(page, 'cam'); await act(page, 'c5-mode-4');
  const t0 = Date.now(); await act(page, 'c5-run');
  await waitText(page, '#tabbody', /Çarpışma ve limit|⚠ /, 120000);
  perf.push(['4 eksen indeksli hesap + çarpışma + simülasyon', Date.now() - t0, 'ms']);
  const tx = await body(page);
  expect(/geçiş/.test(tx) && /Simülasyon/.test(tx), '4 eksen sonuç: ' + tx.slice(0, 300));
  if (/bulunmadı/.test(tx)) { const g = await download(page, () => act(page, 'c5-gcode')); expect(/\bA90\.0\b/.test(g.text) && /G43 H1/.test(g.text), 'A ekseni ve takım boyu'); }
  else throw new Error('varsayılan 4 eksen işinde çarpışma: ' + tx.match(/⛔[^\n]*/));
  await act(page, 'c5-v-machine'); await act(page, 'c5-play'); await page.waitForTimeout(800); await act(page, 'c5-play');
});
await T('5 eksen: 3+2 ve eş zamanlı yüzey işleme, TCP G-kodu (Fanuc G43.4), TCP\'siz kontrolcü reddi', 'I-4/5', async ({ page }) => {
  await tab(page, 'dims'); await setK(page, 'w', 50); await setK(page, 'h', 15); await setK(page, 'l', 40); await setK(page, 'r', 5);
  await tab(page, 'cam'); await act(page, 'c5-mode-5');
  const t0 = Date.now(); await act(page, 'c5-run');
  await waitText(page, '#tabbody', /Çarpışma ve limit/, 180000);
  perf.push(['5 eksen 3+2 + eş zamanlı hesap', Date.now() - t0, 'ms']);
  const tx = await body(page);
  expect(/eş zamanlı döner eksen hareketi/.test(tx), 'eş zamanlı hareket sayısı');
  const sim = +(tx.match(/([\d.]+) eş zamanlı döner eksen/) || [])[1]?.replace(/\./g, '');
  expect(sim > 0, 'eş zamanlı hareket > 0');
  if (!/bulunmadı/.test(tx)) throw new Error('varsayılan 5 eksen işinde çarpışma / limit: ' + (tx.match(/⛔[^\n]*/) || [''])[0]);
  const g = await download(page, () => act(page, 'c5-gcode'));
  expect(/G43\.4 H/.test(g.text) && /\bC-?\d/.test(g.text) && /\bA-?\d/.test(g.text), 'TCP ve döner eksenler');
  await page.locator('#tabbody [data-c5="post"]').selectOption('mach3'); await page.waitForTimeout(300);
  expect(/desteklenmiyor|uygun değil/.test(await body(page)), 'Mach3 5 eksen reddi');
});

/* ---------- J. Mühendislik analizi ---------- */
await T('Analiz: ankastre kiriş statik (FL³/3EI ±3%), ısı enerji dengesi, eski sonuç işareti', 'J-Analiz', async ({ page }) => {
  await tab(page, 'dims'); await setK(page, 'w', 200); await setK(page, 'h', 20); await setK(page, 'l', 20); await setK(page, 'r', 0);
  await tab(page, 'fem');
  await act(page, 'fm-type-static'); await act(page, 'fm-add-ms'); await page.locator('#tabbody [data-fm="ms.0.sel"]').selectOption('-x');
  await act(page, 'fm-add-mf'); await page.locator('#tabbody [data-fm="ml.0.sel"]').selectOption('+x');
  const t0 = Date.now(); await act(page, 'fm-solve');
  await waitText(page, '#tabbody', /En büyük yer değiştirme|⛔/, 180000);
  perf.push(['Statik analiz (orta ağ, ~10 000 eleman)', Date.now() - t0, 'ms']);
  const tx = await body(page), m = tx.match(/En büyük yer değiştirme: ([\d,]+) mm/);
  expect(m, 'sonuç: ' + tx.slice(0, 300));
  const u = parseFloat(m[1].replace(',', '.')), ex = 1000 * 200 ** 3 / (3 * 210000 * (20 * 20 ** 3 / 12));
  expect(Math.abs(u - ex) / ex < 0.03, `sehim ${u} ≠ ${ex.toFixed(4)} (±%3)`);
  expect(/Emniyet katsayısı/.test(tx), 'emniyet katsayısı');
  await act(page, 'fm-type-thermal'); await act(page, 'fm-add-tf'); await page.locator('#tabbody [data-fm="tf.0.sel"]').selectOption('-x');
  await act(page, 'fm-add-tc'); await page.locator('#tabbody [data-fm="tc.0.sel"]').selectOption('+x');
  await act(page, 'fm-solve'); await waitText(page, '#tabbody', /enerji dengesi/, 60000);
  await page.locator('#tabbody [data-fm="ml.0.F"]').count();
  await act(page, 'fm-type-static'); await page.locator('#tabbody [data-fm="ml.0.F"]').fill('2000'); await page.locator('#tabbody [data-fm="ml.0.F"]').dispatchEvent('change'); await page.waitForTimeout(300);
  expect(/ESKİ/.test(await body(page)), 'yük değişince eski sonuç işaretlendi');
});

/* ---------- K. Proje bütünlüğü ---------- */
await T('Proje bütünlüğü: parça + malzeme + OCCT parçası + 5 eksen ayarları + analiz sonucu kaydedilip açılır', 'K-Proje', async ({ page }) => {
  await tab(page, 'dims'); await setK(page, 'w', 80); await setK(page, 'h', 20); await setK(page, 'l', 40);
  await tab(page, 'occt'); await act(page, 'oc-fillet'); await page.waitForFunction(() => document.querySelectorAll('#chips .chip').length >= 2, null, { timeout: 120000 });
  await tab(page, 'cam'); await act(page, 'c5-mode-5'); await page.locator('#tabbody [data-c5="post"]').count();
  await tab(page, 'fem'); await act(page, 'fm-add-ms'); await act(page, 'fm-add-mf'); await page.locator('#tabbody [data-fm="ml.0.sel"]').selectOption('+y');
  await act(page, 'fm-solve'); await waitText(page, '#tabbody', /En büyük yer değiştirme|⛔/, 180000);
  const before = { chips: await page.locator('#chips').innerText(), fem: (await body(page)).match(/En büyük yer değiştirme: [^·]+/)?.[0] };
  await act(page, 'projects'); await page.locator('#pname').fill('e2e-butun'); await act(page, 'dlg-save'); await page.waitForTimeout(300);
  await page.reload(); await waitReady(page);
  await act(page, 'projects'); await page.locator('[data-open="e2e-butun"]').click(); await page.waitForTimeout(1000);
  expect(await page.locator('#chips').innerText() === before.chips, 'parçalar aynı');
  await tab(page, 'cam'); expect(await page.locator('#tabbody [data-act="c5-mode-5"].on').count() === 1, '5 eksen modu korundu');
  await tab(page, 'fem'); const f = await body(page);
  expect(/Yapısal statik · .* · geçerli/.test(f), 'analiz sonucu geçerli olarak açıldı');
  // OCCT parçası B-Rep verisiyle geri geldi: modeli OCCT kurabilir
  await tab(page, 'occt'); await act(page, 'oc-model'); await waitText(page, '#tabbody', /Geçerli katı|Sorunlu/, 120000);
  expect(/Geçerli katı/.test(await body(page)), 'açılan projedeki OCCT parçası geçerli katı');
});

/* ---------- L. Ekran boyutları (EMÜLASYON) ---------- */
for (const [nm, view] of [['telefon 390×844 dokunmatik', PHONE], ['tablet 820×1180 dokunmatik', { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, dpr: 2 }], ['masaüstü 1440×900', { viewport: { width: 1440, height: 900 } }]]) {
  await T(`Ekran (${nm}, emülasyon): açılış süresi, sekmelere erişim, dokunarak seçim, panel kaydırma`, 'L-Ekran', async ({ page }) => {
    const t0 = Date.now(); await page.reload(); await waitReady(page); perf.push(['Açılış (' + nm + ')', Date.now() - t0, 'ms']);
    for (const k of ['dims', 'view', 'calc', 'cam', 'fem']) { await tab(page, k); expect((await body(page)).length > 20, k + ' paneli boş'); }
    await act(page, 'fit'); await page.waitForTimeout(300);
    const b = await canvasBox(page);
    if (view.hasTouch) { await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(200); expect(await selChips(page) === 1, 'dokunarak seçim'); await page.touchscreen.tap(b.x + 6, b.y + 6); await page.waitForTimeout(200); expect(await selChips(page) === 0, 'dokunarak seçimi kaldırma'); }
    const sc = await page.evaluate(() => { const e = document.getElementById('panel') || document.querySelector('#tabbody').parentElement; return e.scrollHeight >= e.clientHeight; });
    expect(sc, 'panel kaydırılabilir');
    const mem = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
    if (mem) perf.push(['JS yığın belleği (' + nm + ')', mem, 'MB']);
  }, { view });
}

/* ---------- sağlamlık ---------- */
await T('Sağlamlık: bozuk otomatik kayıt ve bozuk proje kaydı uygulamayı çökertmez', 'S-Sağlamlık', async ({ page }) => {
  await page.evaluate(() => { localStorage.setItem('cizim:auto', '{bozuk json'); const p = JSON.parse(localStorage.getItem('cizim:projects') || '{}'); p['bozuk'] = { data: '{"parts":"x"}', at: 1 }; p['bozuk2'] = { data: 'null', at: 2 }; localStorage.setItem('cizim:projects', JSON.stringify(p)); });
  await page.reload(); await waitReady(page);
  expect(await chips(page) >= 1, 'bozuk otomatik kayıtla açıldı');
  const before = await page.locator('#chips').innerText();
  await act(page, 'projects');
  const has = await page.locator('[data-open="bozuk"]').count();
  if (has) { await page.locator('[data-open="bozuk"]').click(); await page.waitForTimeout(500); }
  expect(await chips(page) >= 1 && (await page.locator('#chips').innerText()).length > 0, 'bozuk proje açılınca model kaybolmadı');
  void before;
}, { allowErr: [/bozuk|JSON|Unexpected|parts/i] });

/* ---------- performans: büyük model ---------- */
await T('Performans: 40 parçalı model yeniden kurma süresi', 'P-Performans', async ({ page }) => {
  const t0 = Date.now(), each = [];
  for (let i = 0; i < 40; i++) { const t1 = Date.now(); await page.locator('[data-act="add-cylinder"]').first().click(); await page.waitForFunction((n) => document.querySelectorAll('#chips .chip').length >= n, i + 2); each.push(Date.now() - t1); }
  perf.push(['40 silindir ekleme, toplam', Date.now() - t0, 'ms']);
  perf.push(['  ilk 5 ekleme ortalaması', Math.round(each.slice(0, 5).reduce((a, b) => a + b) / 5), 'ms']);
  perf.push(['  son 5 ekleme ortalaması (40 parçalı modelde)', Math.round(each.slice(-5).reduce((a, b) => a + b) / 5), 'ms']);
  expect(await chips(page) >= 41, 'parçalar');
});

/* ---------- W. Çalışma alanı seçimi ---------- */
await (async () => { if (only.length && !only.some((o) => 'W-Alan'.toLowerCase().startsWith(o.toLowerCase()))) return; if (SKIP_YENI.includes('w-alan')) return; await R.test('Çalışma alanı: ilk açılışta seçim ekranı; Makine seçilince mevcut uygulama açılır; seçim hatırlanır; Tekstil\'e geçip geri dönülür', async () => {
  const a = await openApp(browser, url, { ...PHONE, init: () => { try { localStorage.setItem('cizim:guideSeen', '1'); } catch (e) { /* */ } } });
  try {
    await a.page.waitForSelector('#ws-pick', { timeout: 30000 });
    await a.page.locator('#ws-pick [data-ws="makine"]').click();
    await waitReady(a.page);
    expect(await a.page.locator('#ws-pick').count() === 0, 'seçim kapandı');
    expect(await chips(a.page) >= 1, 'makine uygulaması çalışıyor');
    await a.page.reload(); await waitReady(a.page);
    expect(await a.page.locator('#ws-pick').count() === 0, 'seçim hatırlandı');
    await act(a.page, 'projects'); await a.page.locator('#ws-tx').click();
    await a.page.waitForURL(/tekstil\.html/); await a.page.waitForSelector('[data-a="create"]');
    // tekstil son seçim olunca ana sayfa tekstile yönlenir; ?ws=makine ile geri dönülür
    await a.page.goto(url + 'index.html'); await a.page.waitForURL(/tekstil\.html/);
    await a.page.locator('#to-mech').click(); await waitReady(a.page);
    expect(/index\.html\?ws=makine/.test(a.page.url()) && await chips(a.page) >= 1, 'makineye dönüldü');
    expect(!a.errors.length, 'sayfa hataları: ' + a.errors.join(' | '));
  } catch (e) { e.shot = await shot(a.page, 'W_alan'); throw e; } finally { await close(a); }
}, { area: 'W-Alan' }); })();

/* ---------- T. Tekstil ve Moda (Aşama 1) ---------- */
async function txApp(view = PHONE) {
  const a = await openApp(browser, url, { ...view, path: 'tekstil.html' });
  await a.page.waitForSelector('[data-a="create"]', { timeout: 30000 });
  return a;
}
const TX = (title, fn, view) => { if (only.length && !only.some((o) => 'T-Tekstil'.toLowerCase().startsWith(o.toLowerCase()))) return; if (SKIP_YENI.includes('t-tekstil')) return; return R.test(title, async () => {
  const a = await txApp(view);
  try { await fn(a); expect(!a.errors.length, 'Sayfa hataları: ' + a.errors.slice(0, 3).join(' | ')); expect(!a.net.external.length, 'Dış siteye istek: ' + a.net.external.slice(0, 3).join(', ')); }
  catch (e) { e.shot = await shot(a.page, 'T_' + title.slice(0, 40)); throw e; } finally { await close(a); }
}, { area: 'T-Tekstil' }); };
const A = (page, a, extra = '') => page.locator(`[data-a="${a}"]${extra}`).first().click();
const txBody = (page) => page.locator('#main').innerText();

await TX('Tekstil: karma koleksiyon — gömlek (dokuma) + kazak (triko), renk, örnek beden tablosu, kumaş / iplik / aksesuar, dal kuralı, föy, revizyon, yenile, aç', async ({ page }) => {
  await A(page, 'type', '[data-v="mixed"]'); await page.waitForSelector('[data-a="type"][data-v="mixed"].on');
  await page.fill('#np-name', 'E2E Kış'); await page.fill('#np-season', 'KŞ27'); await A(page, 'create');
  await page.waitForSelector('[data-a="add-prod"]');
  // renk
  await A(page, 'tab', '[data-v="colors"]'); await page.fill('#nc-name', 'Lacivert'); await page.fill('#nc-code', 'LCV'); await A(page, 'add-color');
  // beden
  await A(page, 'tab', '[data-v="sizes"]'); await A(page, 'add-size-ex');
  expect(/standart değildir/.test(await page.locator('[data-f="sizeTables.0.source"]').inputValue()), 'örnek tablo kaynağı');
  const g = page.locator('[data-f="sizeTables.0.measures.G%C3%B6%C4%9F%C3%BCs%20%C3%A7evresi.M"]');
  expect(await g.inputValue() === '96', 'M göğüs 96 cm (mm saklanır)');
  await g.fill('98,5'); await g.dispatchEvent('change');
  // malzemeler
  await A(page, 'tab', '[data-v="mats"]');
  for (const [k, n] of [['fabric', 'Poplin'], ['yarn', 'Merinos 2/28'], ['trim', 'Düğme 11 mm']]) { await page.selectOption('#nm-kind', k); await page.fill('#nm-name', n); await A(page, 'add-mat'); }
  await page.fill('[data-f="library.materials.0.props.width"]', '150'); await page.locator('[data-f="library.materials.0.props.width"]').dispatchEvent('change');
  await page.fill('[data-f="library.materials.0.price"]', '120'); await page.locator('[data-f="library.materials.0.price"]').dispatchEvent('change');
  await page.fill('[data-f="library.materials.0.props.gsm"]', 'yüz'); await page.locator('[data-f="library.materials.0.props.gsm"]').dispatchEvent('change');
  expect(/Sayı değil/.test(await page.locator('#toast').innerText()), 'geçersiz sayı uyarısı');
  // ürünler
  await A(page, 'tab', '[data-v="col"]');
  await page.selectOption('#ap-branch', 'woven'); await page.selectOption('#ap-type', 'gomlek'); await page.fill('#ap-code', 'GM-1'); await A(page, 'add-prod');
  await page.selectOption('#ap-branch', 'knit'); await page.selectOption('#ap-type', 'kazak'); await page.fill('#ap-code', 'KZ-1'); await A(page, 'add-prod');
  // gömlek: renk, tablo, beden, kumaş
  await A(page, 'tog-color', '[data-i="0"]');
  await page.selectOption('[data-f="collection.products.0.sizeTable"]', { index: 1 });
  for (const s of ['S', 'M', 'L']) await A(page, 'tog-size', `[data-i="0"][data-v="${s}"]`);
  const opts = await page.locator('#lk-mat-0 option').allInnerTexts();
  expect(opts.some((o) => /Poplin/.test(o)) && !opts.some((o) => /Merinos/.test(o)), 'gömleğe iplik önerilmez: ' + opts);
  await page.selectOption('#lk-mat-0', { label: 'Poplin (Kumaş)' }); await A(page, 'link', '[data-i="0"]');
  await page.fill('[data-f="collection.products.0.materials.0.qty"]', '1,6'); await page.locator('[data-f="collection.products.0.materials.0.qty"]').dispatchEvent('change');
  const kopts = await page.locator('#lk-mat-1 option').allInnerTexts();
  expect(kopts.some((o) => /Merinos/.test(o)) && !kopts.some((o) => /Poplin/.test(o)), 'kazağa kumaş önerilmez: ' + kopts);
  expect(/3 varyant/.test(await txBody(page)), 'gömlek 1 renk × 3 beden');
  // föy
  await A(page, 'tab', '[data-v="tp"]');
  const tp = await txBody(page);
  expect(/Teknik föy · Gömlek/.test(tp) && /GM-1/.test(tp) && /98,5/.test(tp) && /1,6 m/.test(tp), 'föy içeriği');
  expect(/Malzeme maliyeti: 192/.test(tp), 'maliyet 1,6 × 120 = 192');
  // doğrulama: kazakta renk / beden / ana iplik uyarıları, hata yok (gsm geçersiz girişi null'a döndü)
  await A(page, 'tab', '[data-v="val"]');
  const v = await txBody(page);
  expect(await page.locator('.issue.hata').count() === 0 && /Ana iplik seçilmemiş/.test(v), 'doğrulama: ' + v.slice(v.indexOf('Dal araçları'), 900).replace(/\n/g, ' / '));
  // revizyon
  await page.fill('#rev-note', 'ilk koleksiyon'); await A(page, 'commit');
  await page.waitForFunction(() => /rev 1/.test(document.querySelector('#main').innerText));
  await page.reload(); await page.waitForSelector('[data-a="open"]');
  expect(/E2E Kış/.test(await txBody(page)) && /Karma Koleksiyon/.test(await txBody(page)), 'proje listede');
  await A(page, 'open'); await page.waitForSelector('[data-a="add-prod"]');
  const b2 = await txBody(page);
  expect(/GM-1/.test(await page.locator('[data-f="collection.products.0.modelCode"]').inputValue()) && /KZ-1/.test(await page.locator('[data-f="collection.products.1.modelCode"]').inputValue()), 'ürünler korundu');
  expect(/3 varyant/.test(b2), 'varyantlar korundu');
  await A(page, 'tab', '[data-v="revs"]'); await page.waitForFunction(() => /ilk koleksiyon/.test(document.querySelector('#main').innerText));
});

await TX('Tekstil: triko projesi yalnız triko araçlarını gösterir; dal araçları "henüz yok" diye işaretli; JSON dışa aktar → içe aktar yeni proje olarak gelir; bozuk JSON reddedilir', async ({ page }) => {
  await A(page, 'type', '[data-v="knit"]'); await page.waitForSelector('[data-a="type"][data-v="knit"].on'); await page.fill('#np-name', 'Triko 1'); await A(page, 'create');
  await page.waitForSelector('[data-a="add-prod"]');
  expect(await page.locator('#ap-branch').count() === 0, 'tek dal: dal seçimi yok');
  const types = await page.locator('#ap-type option').allInnerTexts();
  expect(types.includes('Kazak') && !types.includes('Gömlek'), 'triko türleri: ' + types);
  await A(page, 'tab', '[data-v="mats"]');
  const kinds = await page.locator('#nm-kind option').allInnerTexts();
  expect(kinds.includes('İplik') && !kinds.includes('Kumaş'), 'triko malzemeleri: ' + kinds);
  await A(page, 'tab', '[data-v="tools"]');
  const tl = await txBody(page);
  expect(!/Dokuma kalıbı/.test(tl) && !/Henüz yok/.test(tl) && /Örgü deseni, numune ve ilmek hesabı/.test(tl) && /Üretim föyü/.test(tl), 'dal araçları: ' + tl.slice(0, 300));
  await A(page, 'tab', '[data-v="col"]'); await A(page, 'add-prod');
  const d = await download(page, () => A(page, 'export'));
  const j = JSON.parse(d.text); expect(j.kind === 'cizim.textile' && j.type === 'knit' && j.collection.products.length === 1, 'JSON içeriği');
  await A(page, 'home'); await page.waitForSelector('[data-a="import"]');
  await choose(page, () => A(page, 'import'), tmp('t.json', d.text));
  await page.waitForFunction(() => /içe aktarıldı/.test(document.querySelector('#main').innerText));
  expect((await page.locator('[data-a="open"]').count()) === 2, 'iki proje');
  await choose(page, () => A(page, 'import'), tmp('bozuk.json', '{"parts":[]}'));
  await page.waitForFunction(() => /tekstil projesi değil/.test(document.querySelector('#toast').innerText));
  expect((await page.locator('[data-a="open"]').count()) === 2, 'bozuk dosya proje eklemedi');
  // silme iki dokunuş ister
  await A(page, 'del'); expect((await page.locator('[data-a="open"]').count()) === 2, 'tek dokunuş silmez');
  await A(page, 'del'); await page.waitForFunction(() => document.querySelectorAll('[data-a="open"]').length === 1);
});

await TX('Tekstil teknik çizim: gömlek şablonu, simetrik çizgi, eğri, ölçü, yazı, detay, seçim / taşıma, geri al, katman, PNG / SVG / PDF, kaydet ve yeniden aç', async ({ page }) => {
  await page.fill('#np-name', 'Çizim E2E'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
  await page.selectOption('#ap-type', 'gomlek'); await page.fill('#ap-code', 'GM-9'); await A(page, 'add-prod');
  await A(page, 'tab', '[data-v="draw"]'); await A(page, 'add-sketch');
  await page.waitForSelector('#skx canvas');
  const K = (k, v) => page.locator(`#skx [data-k="${k}"]${v ? `[data-v="${v}"]` : ''}`).first().click();
  expect(await page.locator('#skx-tpl').inputValue() === 'gomlek', 'ürün türüne uygun şablon seçili');
  await page.fill('#skx [data-tp="chestW"]', '55'); await K('apply-tpl');
  await page.waitForFunction(() => /Göğüs/.test(document.querySelector('#skx .pane').innerText));
  expect(/Göğüs genişliği.*\n?.*55/.test(await page.locator('#skx .pane').innerText()), 'ölçü tablosunda 55 cm');
  const box = await page.locator('#skx canvas').boundingBox();
  const tap = (fx, fy) => page.touchscreen.tap(box.x + box.width * fx, box.y + box.height * fy);
  // simetrik çizgi (sayıyla iki nokta)
  await K('tog', 'sym'); await K('tool', 'line');
  for (const [x, y] of [['5', '30'], ['20', '30']]) { await page.fill('#skx-x', x); await page.fill('#skx-y', y); await K('add-pt'); }
  await K('finish'); await K('tool', 'sel');
  expect(/Uzunluk: 15 cm \(her yarı\)/.test(await page.locator('#skx .pane').innerText()), 'çizgi seçili, uzunluk 15 cm');
  await K('tog', 'sym');
  // eğri (dokunarak)
  await K('tool', 'curve'); for (const [x, y] of [[0.3, 0.75], [0.5, 0.8], [0.7, 0.75]]) await tap(x, y); await K('finish');
  // ölçü, yazı, detay
  await K('tool', 'dim'); await tap(0.25, 0.85); await tap(0.75, 0.85);
  await K('tool', 'text'); await page.fill('#skx-text', 'Çift dikiş 6 mm'); await page.locator('#skx-text').dispatchEvent('change'); await tap(0.6, 0.2);
  await K('tool', 'detail'); await K('pick-detail', 'cep-yama'); await tap(0.35, 0.5);
  // seç ve sayıyla kaydır, geri al / ileri al
  await K('tool', 'sel');
  expect(/1 seçili/.test(await page.locator('#skx .st').innerText()), 'yeni detay seçili');
  await page.fill('#skx-dx', '2'); await K('move');
  const undoOn = await page.locator('#skx [data-k="undo"]').isEnabled(); expect(undoOn, 'geri al etkin');
  await K('undo'); await K('redo');
  // boş alana dokun: seçim kalkar, şablon / katman / çıktı paneli görünür
  await tap(0.97, 0.03); await page.waitForSelector('#skx [data-k="lay-add"]');
  await K('lay-add'); expect((await page.locator('#skx [data-k="lay-act"]').count()) === 3, 'üç katman (şablon, çizim, yeni)');
  // çıktılar
  const svg = await download(page, () => K('svg'));
  expect(/width="[\d.]+mm"/.test(svg.text) && /Çift dikiş 6 mm/.test(svg.text) && /Göğüs 55,0 cm/.test(svg.text), 'SVG');
  const pdf = await download(page, () => K('pdf'));
  expect(/^%PDF-1\.4/.test(pdf.text) && /\(\\326l\\347ek 1:10\)/.test(pdf.text) && /%%EOF/.test(pdf.text), 'PDF ölçek 1:10');
  const png = await download(page, () => K('png'));
  expect(png.size > 5000 && png.text.slice(1, 4) === 'PNG', 'PNG ' + png.size);
  // arka görünüşe geç; kapat; yenile; aç
  await K('view', 'back'); await K('close');
  await page.waitForFunction(() => /Ön \d+ · Arka \d+/.test(document.querySelector('#main').innerText));
  const c1 = (await txBody(page)).match(/Ön (\d+) · Arka (\d+)/);
  await page.waitForTimeout(600); await page.reload(); await A(page, 'open'); await A(page, 'tab', '[data-v="draw"]');
  const c2 = (await txBody(page)).match(/Ön (\d+) · Arka (\d+)/);
  expect(c1 && c2 && c1[0] === c2[0] && +c1[1] >= 18, 'çizim kaydedildi: ' + (c1 && c1[0]) + ' / ' + (c2 && c2[0]));
  await A(page, 'open-sketch'); await page.waitForSelector('#skx canvas');
  expect(await page.locator('#skx [data-k="apply-tpl"]').innerText() === 'Şablonu yeniden uygula', 'şablon bilgisi korundu');
  // şablonu yeniden uygulamak kullanıcının çizdiklerini silmez (onlar "Çizim" katmanında)
  await page.fill('#skx [data-tp="length"]', '80'); await K('apply-tpl'); await K('close');
  await page.waitForFunction(() => /Ön \d+ · Arka \d+/.test(document.querySelector('#main').innerText));
  const c3 = (await txBody(page)).match(/Ön (\d+) · Arka (\d+)/);
  expect(c3[0] === c2[0], 'yeniden uygulamada öğe kaybı yok: ' + c3[0] + ' / ' + c2[0]);
});

await TX('Tekstil kalıp: beden tablosundan gömlek bloğu, 7 dikiş eşleşmesi tutar, kenar payı / çıt, sayıyla yeni parça, 1:1 PDF ve SVG, kaydet ve yeniden aç', async ({ page }) => {
  await page.fill('#np-name', 'Kalıp E2E'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
  await page.selectOption('#ap-type', 'gomlek'); await A(page, 'add-prod');
  await A(page, 'tab', '[data-v="sizes"]'); await A(page, 'add-size-ex');
  await A(page, 'tab', '[data-v="pat"]'); await page.selectOption('#pt-table', { index: 1 }); await page.waitForSelector('#pt-size');
  await page.selectOption('#pt-size', 'L');
  expect(await page.locator('[data-pt="chest"]').inputValue() === '100', 'göğüs çevresi tablodan (L = 100 cm)');
  await A(page, 'add-pattern'); await page.waitForSelector('#pkx canvas');
  const K = (k, v) => page.locator(`#pkx [data-k="${k}"]${v != null ? `[data-v="${v}"]` : ''}`).first().click();
  const pane = () => page.locator('#pkx .pane').innerText();
  expect(((await pane()).match(/✅/g) || []).length === 7 && !/⛔/.test(await pane()), 'yedi eşleşme tutuyor');
  // ön bedeni seç (kenar listesinden), yan dikiş payını 2 cm yap, ortasına çıt
  const box = await page.locator('#pkx canvas').boundingBox();
  await page.touchscreen.tap(box.x + box.width * 0.17, box.y + box.height * 0.5);
  await page.waitForFunction(() => /Kesim adedi/.test(document.querySelector('#pkx .pane').innerText));
  expect(await page.locator('#pkx [data-p="name"]').inputValue() === 'Ön beden', 'ön beden seçili');
  const before = (await pane()).match(/kesim alanı ([\d,]+) dm²/)[1];
  await K('edge', 3); await page.fill('#pkx [data-e="allow"]', '2'); await page.locator('#pkx [data-e="allow"]').dispatchEvent('change');
  await K('notch-mid'); expect(await page.locator('#pkx [data-n]').count() === 1, 'çıt eklendi');
  await K('unedge'); const after = (await pane()).match(/kesim alanı ([\d,]+) dm²/)[1];
  expect(parseFloat(after.replace(',', '.')) > parseFloat(before.replace(',', '.')), `pay artınca kesim alanı arttı ${before} → ${after}`);
  // yeni parça: sayıyla 4 köşe (roba benzeri dikdörtgen 40 × 12 cm)
  await K('tool', 'new');
  for (const [x, y] of [['0', '-30'], ['40', '-30'], ['40', '-18'], ['0', '-18']]) { await page.fill('#pk-x', x); await page.fill('#pk-y', y); await K('new-pt'); }
  await page.fill('#pk-name', 'Roba'); await K('new-finish');
  await page.waitForFunction(() => /Kesim adedi/.test(document.querySelector('#pkx .pane').innerText));
  expect(/Dikiş alanı 4,80 dm²/.test(await pane()) && /Kontur kapalı/.test(await pane()), 'yeni parça 40 × 12 = 4,80 dm², geçerli');
  // geri al / ileri al
  await K('undo'); await K('redo');
  // çıktılar (seçimi kaldır → grup paneli)
  await page.touchscreen.tap(box.x + box.width * 0.98, box.y + box.height * 0.02);
  await page.waitForSelector('#pkx [data-k="pdf"]');
  const pdf = await download(page, () => K('pdf'));
  expect(/^%PDF-1\.4/.test(pdf.text) && /%%EOF/.test(pdf.text) && /10 × 10 cm kontrol karesi/.test(pdf.text.replace(/\\327/g, '×')), 'PDF');
  expect(/\d+ sayfa/.test(await page.locator('#toast').innerText()), 'sayfa sayısı bildirildi');
  const svg = await download(page, () => K('svg')); expect(/width="[\d.]+mm"/.test(svg.text) && /Roba/.test(svg.text), 'SVG');
  await K('close');
  await page.waitForFunction(() => /8 parça/.test(document.querySelector('#main').innerText));
  expect(/✅ parçalar geçerli/.test(await txBody(page)) && /✅ 7 dikiş eşleşmesi tutuyor/.test(await txBody(page)), 'grup özeti');
  await page.waitForTimeout(600); await page.reload(); await A(page, 'open'); await A(page, 'tab', '[data-v="pat"]');
  expect(/8 parça/.test(await txBody(page)) && /Beden L/.test(await txBody(page)), 'kalıp kaydedildi');
  await A(page, 'tab', '[data-v="val"]'); expect(await page.locator('.issue.hata').count() === 0, 'doğrulamada hata yok');
});

await TX('Tekstil kalıp araçları (dokunarak): etek bloğuna pens ekle → bel eşleşmesi bozulur, geri al; kemeri böl ve geri birleştir (alan korunur); dikiş eşle', async ({ page }) => {
  await page.fill('#np-name', 'Etek E2E'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
  await page.selectOption('#ap-type', 'etek'); await A(page, 'add-prod');
  await A(page, 'tab', '[data-v="pat"]'); await page.selectOption('#pt-set', 'etek'); await page.waitForSelector('[data-pt="waist"]');
  await page.fill('#pt-size-free', 'M'); await A(page, 'add-pattern'); await page.waitForSelector('#pkx canvas');
  const K = (k, v) => page.locator(`#pkx [data-k="${k}"]${v != null ? `[data-v="${v}"]` : ''}`).first().click();
  const pane = () => page.locator('#pkx .pane').innerText();
  const tapW = async (p) => { const q = await page.evaluate((w) => document.getElementById('pkx').api.toScreen(w), p); await page.touchscreen.tap(q[0], q[1]); };
  const pieces = () => page.evaluate(() => document.getElementById('pkx').api.pieces().map((pc) => ({ name: pc.name, darts: pc.darts.length, edges: pc.edges.map((e) => [e.segs[0].a, e.segs.at(-1).b, e.name]) })));
  expect(((await pane()).match(/✅/g) || []).length === 2, 'iki eşleşme tutuyor');
  // ön bel çizgisi y = 60, x 60 … 60 + 205; pens ağzı 30–45 mm, ucu 80 mm aşağıda
  await K('tool', 'dart'); await tapW([90, 60]); await tapW([105, 60]); await tapW([97.5, 140]);
  expect((await pieces()).find((p) => p.name === 'Etek ön').darts === 2, 'ikinci pens eklendi');
  await K('tool', 'sel'); { const bx = await page.locator('#pkx canvas').boundingBox(); await page.touchscreen.tap(bx.x + bx.width - 4, bx.y + 4); }
  await page.waitForSelector('#pkx [data-k="pdf"]');
  expect(/⛔/.test(await pane()) && /sapma -?3,00 cm/.test(await pane()), 'pens ağzı 2 × 1,5 cm bel eşleşmesini bozdu: ' + (await pane()).match(/sapma [^\n]*/g));
  await K('undo'); expect(!/⛔/.test(await pane()), 'geri alınınca tutuyor');
  // kemer: (60, 780) – (810, 860); x = 435'ten böl
  await tapW([435, 800]); await page.waitForFunction(() => /Kemer/.test(document.querySelector('#pkx [data-p="name"]')?.value || ''));
  const area0 = (await pane()).match(/Dikiş alanı ([\d,]+) dm²/)[1];
  await K('tool', 'split'); await tapW([435, 740]); await tapW([435, 900]);
  let ps = await pieces(); expect(ps.length === 4 && ps.filter((p) => /Kemer/.test(p.name)).length === 2, 'kemer ikiye bölündü');
  // birleştir: bölme kenarına iki kez dokun (önce bir parçanın, sonra diğerinin kenarı)
  await K('tool', 'merge'); await tapW([435, 820]); await tapW([435, 820]);
  ps = await pieces(); expect(ps.length === 3, 'yeniden tek kemer: ' + ps.map((p) => p.name).join(', '));
  await K('tool', 'sel'); await tapW([200, 820]);
  await page.waitForFunction(() => /Kemer/.test(document.querySelector('#pkx [data-p="name"]')?.value || ''));
  expect((await pane()).match(/Dikiş alanı ([\d,]+) dm²/)[1] === area0, 'alan korundu ' + area0);
  // dikiş eşle: etek ön yan dikiş ↔ etek arka yan dikiş (yeni eşleşme)
  const ed = (await pieces()); const fr = ed.find((p) => p.name === 'Etek ön').edges[1], bk = ed.find((p) => p.name === 'Etek arka').edges[1];
  const mid = (e) => [(e[0][0] + e[1][0]) / 2, (e[0][1] + e[1][1]) / 2 + 150];
  await K('tool', 'seam'); await tapW(mid(fr)); await K('side', 'b'); await tapW(mid(bk));
  await page.fill('#pk-sname', 'Yan dikiş (elle)'); await K('seam-save');
  await page.waitForFunction(() => /Yan dikiş \(elle\)/.test(document.querySelector('#pkx .pane').innerText));
  expect(((await pane()).match(/✅/g) || []).length === 2 && /Yan dikiş \(elle\)/.test(await pane()), 'elle eşleşme eklendi (kemer bölünüp birleşince eski bel eşleşmesi kaldırıldı)');
  await K('close');
});

await TX('Tekstil grading: M bedeni gömlek bloğu 6 bedene yayılır, sonuç ve karşılaştırma tablosu, beden yuvası, doğrulama temiz', async ({ page }) => {
  await page.fill('#np-name', 'Grading E2E'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
  await page.selectOption('#ap-type', 'gomlek'); await A(page, 'add-prod');
  await A(page, 'tab', '[data-v="sizes"]'); await A(page, 'add-size-ex');
  await A(page, 'tab', '[data-v="pat"]'); await page.selectOption('#pt-table', { index: 1 }); await page.waitForSelector('#pt-size');
  await page.selectOption('#pt-size', 'M'); await A(page, 'add-pattern'); await page.waitForSelector('#pkx canvas');
  await page.locator('#pkx [data-k="close"]').click();
  await A(page, 'grade-open'); await page.waitForSelector('[data-a="grade-run"]');
  expect((await page.locator('[data-a="gr-size"].on').count()) === 5, 'beş hedef beden seçili');
  await A(page, 'grade-run');
  await page.waitForFunction(() => /Bütün bedenlerde parçalar geçerli/.test(document.querySelector('#main').innerText));
  const b = await txBody(page);
  const wr = await page.evaluate(() => [...document.querySelectorAll('#main tr')].map((r) => [...r.cells].map((c) => c.innerText)).find((c) => c[0] === 'Arka beden' && c[1] === 'Genişlik'));
  expect(wr && wr.slice(2).join(' ') === '27 25 26 28 29 30', 'arka genişlik M, XS, S, L, XL, XXL (cm): ' + wr);
  const cards = (b.match(/Beden (XS|S|M|L|XL|XXL)\b/g) || []).length;
  expect(cards >= 6, 'altı beden grubu: ' + cards);
  expect(/blok ölçüsünden \(eğriler yeniden çizildi\)/.test(b), 'yöntem yazılı');
  // L grubunu aç, beden yuvası
  await page.locator('[data-a="open-pattern"]').nth(3).click(); await page.waitForSelector('#pkx canvas');
  await page.locator('#pkx [data-k="nest"]').click();
  expect(await page.locator('#pkx [data-k="nest"].on').count() === 1, 'beden yuvası açık');
  expect(((await page.locator('#pkx .pane').innerText()).match(/✅/g) || []).length === 7, 'L bedeninde 7 eşleşme tutuyor');
  await page.locator('#pkx [data-k="close"]').click();
  await A(page, 'tab', '[data-v="val"]'); expect(await page.locator('.issue.hata').count() === 0, 'doğrulama temiz');
});

await TX('Tekstil triko: numune, desen editöründe dokunarak boyama / saç örgüsü / jakar rengi, kontrol uyarıları, PDF / talimat / CSV, ilmek hesabı ve bedenler, kaydet ve aç', async ({ page }) => {
  await A(page, 'type', '[data-v="knit"]'); await page.waitForSelector('[data-a="type"][data-v="knit"].on');
  await page.fill('#np-name', 'Triko E2E'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
  await A(page, 'add-prod');
  await A(page, 'tab', '[data-v="sizes"]'); await A(page, 'add-size-ex');
  await A(page, 'tab', '[data-v="knit"]');
  await page.fill('#ns-name', 'Merinos'); await page.fill('#ns-st', '28'); await page.fill('#ns-row', '38'); await A(page, 'add-swatch');
  await A(page, 'sw-wash');
  await page.selectOption('#nk-tpl', 'duz'); await page.fill('#nk-name', 'Deneme'); await A(page, 'add-chart'); await page.waitForSelector('#kcx canvas');
  const K = (k, v) => page.locator(`#kcx [data-k="${k}"]${v != null ? `[data-v="${v}"]` : ''}`).first().click();
  const cell = async (x, y) => { const q = await page.evaluate(([a, b]) => document.getElementById('kcx').api.cell(a, b), [x, y]); await page.touchscreen.tap(q[0], q[1]); };
  const pane = () => page.locator('#kcx .pane').innerText();
  // ters ilmek boya, saç örgüsü koy, delik ekle (dengesiz) → uyarı, sonra eksiltme ile dengele
  await K('stitch', 'p'); await cell(0, 0); await cell(11, 0);
  await K('stitch', 'c4R'); await cell(4, 5);
  expect(/Saç örgüleri tam/.test(await pane()), 'saç örgüsü geçerli');
  await K('stitch', 'yo'); await cell(2, 2);
  expect(/Sıra 3: ilmek sayısı \+1/.test(await pane()), 'delik uyarısı');
  await K('stitch', 'k2t'); await cell(3, 2);
  expect(!/Sıra 3: ilmek sayısı/.test(await pane()), 'eksiltme ile dengelendi');
  // jakar rengi: uzun atlama uyarısı
  await K('add-color'); await cell(0, 8); await cell(11, 8);
  expect(/rengi 10 ilmek atlıyor/.test(await pane()), 'uzun atlama uyarısı: ' + (await pane()).slice(0, 300));
  await K('undo'); expect(!/ilmek atlıyor/.test(await pane()), 'geri al');
  // tekrar alanı ve boyut
  await K('tool', 'repeat'); await cell(0, 0); await cell(5, 5);
  expect(/Tekrar: 6 ilmek × 6 sıra/.test(await pane()), 'tekrar alanı');
  const pdf = await download(page, () => K('pdf')); expect(/^%PDF-1\.4/.test(pdf.text) && /%%EOF/.test(pdf.text), 'şema PDF');
  const txt = await download(page, () => K('txt')); expect(/^1\. sıra \(ön yüz, sağdan sola\): 1 ters( \(Ana renk\))?, 10 düz( \(Ana renk\))?, 1 ters/.test(txt.text), 'talimat: ' + txt.text.split('\n')[0]);
  const csv = await download(page, () => K('csv')); expect(csv.text.split('\n')[1].startsWith('12;'), 'CSV');
  await K('close');
  // parça: 2×2 ribanalı beden, desen tekrarı 6 → ilmek sayısı 12'nin katı + 2
  await page.selectOption('#kp-ch', { index: 1 }); await page.selectOption('#kp-rib', 'rib22'); await page.fill('#kp-size', 'M'); await A(page, 'add-kpiece');
  await page.waitForFunction(() => /Başlangıç: \d+ ilmek/.test(document.querySelector('#main').innerText));
  const b = await txBody(page), n = +b.match(/Başlangıç: (\d+) ilmek/)[1];
  expect((n - 2) % 12 === 0 && Math.abs(n - 145.6) <= 6, 'ilmek sayısı tekrara uydu: ' + n);
  expect(/Bedenlere göre/.test(b) && /Başlangıç ilmeği/.test(b), 'beden tablosu');
  await page.waitForTimeout(600); await page.reload(); await A(page, 'open'); await A(page, 'tab', '[data-v="knit"]');
  expect(new RegExp(`Başlangıç: ${n} ilmek`).test(await txBody(page)) && /12 ilmek × 12 sıra · tekrar 6×6/.test(await txBody(page)), 'kaydedildi');
  await A(page, 'tab', '[data-v="val"]'); expect(await page.locator('.issue.hata').count() === 0, 'doğrulamada hata yok');
});

await TX('Tekstil malzeme / tüketim: hazır kart (poplin, merinos), numara dönüşümü, kalıptan kumaş metresi, trikodan iplik gramı, bedene göre maliyet föyde', async ({ page }) => {
  await A(page, 'type', '[data-v="mixed"]'); await page.waitForSelector('[data-a="type"][data-v="mixed"].on');
  await page.fill('#np-name', 'Tüketim E2E'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
  await page.selectOption('#ap-branch', 'woven'); await page.selectOption('#ap-type', 'gomlek'); await A(page, 'add-prod');
  await page.selectOption('#ap-branch', 'knit'); await page.selectOption('#ap-type', 'kazak'); await A(page, 'add-prod');
  await A(page, 'tab', '[data-v="mats"]');
  await page.selectOption('#nm-preset', 'fabric:0'); await A(page, 'add-preset');
  await page.selectOption('#nm-preset', 'yarn:0'); await A(page, 'add-preset');
  expect(/71,4 tex · 714 dtex · 643 den · Nm 14 · Ne 8,27/.test(await txBody(page)), 'Nm 2/28 dönüşümü');
  for (const [i, v] of [[0, '120'], [1, '900']]) { await page.fill(`[data-f="library.materials.${i}.price"]`, v); await page.locator(`[data-f="library.materials.${i}.price"]`).dispatchEvent('change'); }
  await A(page, 'tab', '[data-v="col"]');
  await A(page, 'link', '[data-i="0"]'); await A(page, 'link', '[data-i="1"]');
  await A(page, 'tab', '[data-v="pat"]'); await page.fill('#pt-size-free', 'M'); await A(page, 'add-pattern'); await page.waitForSelector('#pkx canvas'); await page.locator('#pkx [data-k="close"]').click();
  await A(page, 'tab', '[data-v="knit"]'); await page.fill('#ns-name', 'N'); await page.fill('#ns-st', '28'); await page.fill('#ns-row', '38'); await A(page, 'add-swatch');
  await page.fill('#kp-size', 'M'); await A(page, 'add-kpiece');
  await A(page, 'tab', '[data-v="tp"]');
  let b = await txBody(page);
  const m = b.match(/([\d,]+) m kumaş/); expect(m && +m[1].replace(',', '.') > 1 && +m[1].replace(',', '.') < 2.5, 'gömlek kumaş metresi: ' + (m && m[1]));
  expect(/tahmini/.test(b) && /yerleşim verimi %80 varsayıldı/.test(b), 'varsayımlar yazılı');
  await page.selectOption('#fp-sel', { index: 1 }); await page.waitForFunction(() => /Teknik föy · Kazak/.test(document.querySelector('#main').innerText));
  b = await txBody(page);
  expect(/\d+ g \(\d+ m iplik, \d+ ilmek\)/.test(b) && /sıkılık faktörü/.test(b), 'iplik gramı ve uyumsuz numune uyarısı');
});

await TX('Tekstil kesim planı: gömlek kalıbı + poplin, otomatik yerleşim, elle sürükleyince çakışma hatası, geri yerleştirme, kaydet, föyde plan boyundan tüketim, PDF', async ({ page }) => {
  await A(page, 'type', '[data-v="woven"]'); await page.waitForSelector('[data-a="type"][data-v="woven"].on');
  await page.fill('#np-name', 'Kesim E2E'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
  await page.selectOption('#ap-type', 'gomlek'); await A(page, 'add-prod');
  await A(page, 'tab', '[data-v="mats"]'); await page.selectOption('#nm-preset', 'fabric:0'); await A(page, 'add-preset');
  await page.fill('[data-f="library.materials.0.price"]', '100'); await page.locator('[data-f="library.materials.0.price"]').dispatchEvent('change');
  await A(page, 'tab', '[data-v="col"]'); await A(page, 'link', '[data-i="0"]');
  await A(page, 'tab', '[data-v="pat"]'); await page.fill('#pt-size-free', 'M'); await A(page, 'add-pattern'); await page.waitForSelector('#pkx canvas'); await page.locator('#pkx [data-k="close"]').click();
  await A(page, 'marker-open'); await page.waitForSelector('#mkx canvas');
  const K = (k) => page.locator(`#mkx [data-k="${k}"]`).first().click();
  const ev = () => page.evaluate(() => { const e = document.getElementById('mkx').api.evaluate(); return e && { L: e.length, eff: e.efficiency, err: e.issues.filter((x) => x.level === 'hata').map((x) => x.msg), n: e.pieceCount }; });
  await K('auto'); await page.waitForFunction(() => document.getElementById('mkx').api.marker());
  let e = await ev();
  expect(e.err.length === 0 && e.eff > 0.6 && e.L > 1000 && e.L < 1600, `otomatik: boy ${e.L} verim ${e.eff} hata ${e.err}`);
  const pane = await page.locator('#mkx .pane').innerText();
  expect(/Kısıtlar/.test(pane) && /kullanılabilir/.test(pane) && /operatör kontrol/.test(pane), 'kısıtlar ve operatör kontrolü yazılı');
  // ilk parçayı ikinci parçanın üstüne sürükle → çakışma hatası
  const pos = await page.evaluate(() => {
    const api = document.getElementById('mkx').api, e = api.evaluate();
    const bb = (q) => { const xs = q.pts.map((p) => p[0]), ys = q.pts.map((p) => p[1]); return { w: Math.max(...xs) - Math.min(...xs), c: [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] }; };
    const big = e.polys.map(bb).sort((a, b) => b.w - a.w);
    return [api.toScreen(big[0].c), api.toScreen(big[1].c)];
  });
  await page.mouse.move(pos[0][0], pos[0][1]); await page.mouse.down(); await page.mouse.move((pos[0][0] + pos[1][0]) / 2, (pos[0][1] + pos[1][1]) / 2, { steps: 4 }); await page.mouse.move(pos[1][0], pos[1][1], { steps: 4 }); await page.mouse.up();
  e = await ev(); expect(e.err.some((m) => /üst üste/.test(m)), 'elle sürükleme çakışma hatası: ' + e.err);
  expect(/⛔/.test(await page.locator('#mkx .st').innerText()), 'durum çubuğunda hata');
  await K('auto'); await page.waitForFunction(() => document.getElementById('mkx').api.evaluate().issues.every((x) => x.level !== 'hata'));
  e = await ev(); const L = e.L;
  const dl = await download(page, () => K('pdf'));
  expect(/^kesim-plani-Gomlek-M\.pdf$/.test(dl.name) && dl.text.startsWith('%PDF-') && /1:\d+/.test(dl.text), 'PDF indirildi: ' + dl.name + ' ' + dl.size + ' B');
  await K('save'); await K('close');
  let b = await txBody(page); expect(/✂ Kesim planı: boy [\d,]+ cm · verim %[\d,]+ · açık en/.test(b), 'kalıp kartında plan özeti');
  await A(page, 'tab', '[data-v="tp"]'); b = await txBody(page);
  expect(/kesim planından \(verim %/.test(b), 'föy: tüketim kesim planından');
  const want = ((L / 0.97 + 40) / 1000).toFixed(2).replace('.', ',');
  expect(b.includes(want + ' m kumaş'), `plan boyu + boy çekmesi + pastal başı = ${want} m: ` + (b.match(/[\d,]+ m kumaş/) || [])[0]);
  expect(/en çekmesi %2 planda yok/.test(b), 'en çekmesi uyarısı');
  await A(page, 'tab', '[data-v="val"]'); expect(await page.locator('.issue.hata').count() === 0, 'doğrulama temiz');
  // kaydet, sayfayı yenile, aç: plan duruyor
  await page.fill('#rev-note', 'plan'); await A(page, 'commit'); await page.waitForFunction(() => /rev 1/.test(document.querySelector('#main').innerText));
  await page.reload(); await page.waitForSelector('[data-a="open"]'); await A(page, 'open'); await page.waitForSelector('[data-a="add-prod"]');
  await A(page, 'tab', '[data-v="pat"]'); expect(/✂ Kesim planı: boy/.test(await txBody(page)), 'yenileme sonrası plan kayıtlı');
});

await TX('Tekstil triko makinesi: ev tipi şablon doğrulanmamış uyarısı, uyumluluk, operatör programı, delikli kart, V yatak knitout + yapısal benzetim, doğrulama ve değer değişince düşmesi', async ({ page }) => {
  await A(page, 'type', '[data-v="knit"]'); await page.waitForSelector('[data-a="type"][data-v="knit"].on');
  await page.fill('#np-name', 'Makine E2E'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]'); await A(page, 'add-prod');
  await A(page, 'tab', '[data-v="knit"]');
  await page.fill('#ns-name', 'N'); await page.fill('#ns-st', '28'); await page.fill('#ns-row', '38'); await A(page, 'add-swatch');
  await page.selectOption('#kp-kind', 'kol'); await page.waitForSelector('[data-kp="cuffW"]'); await page.fill('#kp-size', 'M'); await A(page, 'add-kpiece');
  await page.selectOption('#nk-tpl', 'baklava'); await page.fill('#nk-name', 'Baklava'); await A(page, 'add-chart'); await page.waitForSelector('#kcx canvas'); await page.locator('#kcx [data-k="close"]').click();
  await page.selectOption('#nm-mtpl', 'hand-std'); await A(page, 'add-machine');
  let b = await txBody(page); expect(/DOĞRULANMAMIŞ PROFİL/.test(b) && /tahmini değerler/.test(b), 'şablon doğrulanmamış');
  await page.selectOption('#mo-pc', { index: 1 }); await A(page, 'mo-check'); b = await txBody(page);
  expect(/ribana plakası/.test(b), 'tek plaka ribana uyarısı');
  const prog = await download(page, () => A(page, 'mo-prog'));
  expect(/\*\*\* DOĞRULANMAMIŞ/.test(prog.text) && (prog.text.match(/her iki yanda 1 iğne artır/g) || []).length > 5 && /RC \d{3}/.test(prog.text), 'operatör programı');
  await page.selectOption('#mo-ch', { label: 'Baklava' }); await page.selectOption('#mo-pc', ''); const card = await download(page, () => A(page, 'mo-card'));
  expect(/<svg/.test(card.text) && (card.text.match(/<circle/g) || []).length > 20 && /DOĞRULANMAMIŞ/.test(card.text), 'delikli kart');
  expect(/Jakar \/ fair isle/.test(await txBody(page)), 'kart modu yazılı');
  // V yatak: knitout
  await page.selectOption('#nm-mtpl', 'vbed-e7'); await A(page, 'add-machine');
  await page.selectOption('#mo-mc', { index: 1 }); await page.selectOption('#mo-ch', { label: 'Baklava' }); await page.fill('#mo-w', '24'); await page.fill('#mo-h', '24');
  const k = await download(page, () => A(page, 'mo-knitout'));
  expect(k.text.startsWith(';!knitout-2') && /knit [+-] f\d+ 2/.test(k.text), 'knitout iki besleyici');
  b = await txBody(page); expect(/✅ Yapısal benzetim: 24 iğne × 24 sıra/.test(b) && /Makinede denenmeden üretime alma/.test(b), 'benzetim sonucu: ' + (b.match(/Yapısal benzetim[^\n]*/) || [])[0]);
  // ev tipinde knitout yok
  await page.selectOption('#mo-mc', { index: 0 }); await A(page, 'mo-knitout'); await page.waitForFunction(() => /yalnız V yataklı/.test(document.getElementById('toast').innerText));
  // doğrula → hazır; değer değişince düşer
  await page.fill('[data-f="knit.machines.0.brand"]', 'Marka'); await page.fill('[data-f="knit.machines.0.model"]', 'KH-1'); await A(page, 'tab', '[data-v="knit"]');
  await page.fill('#mv-note-0', '28/38 düz numune örüldü, ölçü tuttu'); await A(page, 'mc-verify', '[data-i="0"]');
  b = await txBody(page); expect(/Kullanıcı doğrulaması: \d{4}-\d\d-\d\d · 28\/38/.test(b), 'doğrulandı: ' + (await page.locator('#toast').innerText()) + ' | ' + (b.match(/.*PROFİL.*/g) || []).join(' / '));
  await page.fill('[data-f="knit.machines.0.needles"]', '180'); await A(page, 'tab', '[data-v="knit"]');
  expect(/doğrulamasından sonra makine değerleri değişti/.test(await txBody(page)), 'değer değişince doğrulama düştü');
  await A(page, 'tab', '[data-v="val"]'); expect(await page.locator('.issue.hata').count() === 0, 'doğrulamada hata yok');
});

await TX('Tekstil 3B: gömlek kalıbından 3B önizleme (bolluk tablosu, ÖNİZLEME etiketi, WebGL sahne), kazak 3B; kumaş dökümlülük benzetimi DOĞRULANMAMIŞ → ölçüme kalibre → ikinci ölçümle uyumlu', async ({ page }) => {
  await A(page, 'type', '[data-v="mixed"]'); await page.waitForSelector('[data-a="type"][data-v="mixed"].on');
  await page.fill('#np-name', '3B E2E'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
  await page.selectOption('#ap-branch', 'woven'); await page.selectOption('#ap-type', 'gomlek'); await A(page, 'add-prod');
  await A(page, 'tab', '[data-v="sizes"]'); await A(page, 'add-size-ex');
  await A(page, 'tab', '[data-v="pat"]'); await page.selectOption('#pt-table', { index: 1 }); await page.waitForSelector('#pt-size'); await page.selectOption('#pt-size', 'M');
  await A(page, 'add-pattern'); await page.waitForSelector('#pkx canvas'); await page.locator('#pkx [data-k="close"]').click();
  await A(page, 'fit3d'); await page.waitForSelector('#v3x');
  await page.waitForFunction(() => { const a = document.getElementById('v3x').api; return a.ready || a.error; });
  const api = await page.evaluate(() => { const a = document.getElementById('v3x').api; return { ready: a.ready, meshes: a.meshes, rep: a.report.map((r) => [r.label, Math.round(r.garment), r.bodyM, r.level]) }; });
  expect(api.ready && api.meshes === 2, '3B sahne (vücut + giysi kabuğu): ' + JSON.stringify(api));
  const pane = await page.locator('#v3x .pane').innerText();
  expect(/ÖNİZLEME/.test(await page.locator('#v3x .tag').innerText()) && /önizlemedir/.test(pane) && /kaynak:/.test(pane), 'önizleme etiketi ve ölçü kaynağı');
  const ch = api.rep.find((r) => r[0] === 'Göğüs'); expect(ch && ch[2] > 0 && ch[1] > ch[2] && ch[3] === 'ok', 'göğüs bolluğu uygun: ' + JSON.stringify(ch));
  await page.locator('#v3x [data-k="close"]').click();
  // triko 3B
  await A(page, 'tab', '[data-v="col"]'); await page.selectOption('#ap-branch', 'knit'); await page.selectOption('#ap-type', 'kazak'); await A(page, 'add-prod');
  await A(page, 'tab', '[data-v="knit"]'); await page.fill('#ns-name', 'N'); await page.fill('#ns-st', '28'); await page.fill('#ns-row', '38'); await A(page, 'add-swatch');
  await page.selectOption('#kp-prod', { index: 0 }); await page.fill('#kp-size', 'M'); await A(page, 'add-kpiece');
  await A(page, 'kfit3d'); await page.waitForSelector('#v3x'); await page.waitForFunction(() => { const a = document.getElementById('v3x').api; return a.ready || a.error; });
  expect(/Göğüs/.test(await page.locator('#v3x .pane').innerText()) && await page.evaluate(() => document.getElementById('v3x').api.ready), 'triko 3B');
  await page.locator('#v3x [data-k="close"]').click();
  // dökümlülük
  await A(page, 'tab', '[data-v="mats"]'); await page.selectOption('#nm-preset', 'fabric:0'); await A(page, 'add-preset');
  await A(page, 'drape-run', '[data-i="0"]'); await page.waitForFunction(() => /Katsayı \d/.test(document.querySelector('#main').innerText), null, { timeout: 90000 });
  let b = await txBody(page); expect(/DOĞRULANMAMIŞ — ölçülmüş dökümlülük/.test(b), 'ölçümsüz: doğrulanmamış');
  await page.fill('[data-f="library.materials.0.props.drapeRef"]', '0,55'); await page.locator('[data-f="library.materials.0.props.drapeRef"]').dispatchEvent('change');
  await page.waitForSelector('[data-a="drape-cal"]:not([disabled])'); await A(page, 'drape-cal', '[data-i="0"]');
  await page.waitForFunction(() => /\(kalibre\)/.test(document.querySelector('#main').innerText), null, { timeout: 240000 });
  b = await txBody(page); expect(/Kalibre edildi: eğilme rijitliği bu ölçümden uyduruldu/.test(b), 'aynı ölçüme kalibre: bağımsız değil');
  const dc = +(b.match(/Katsayı ([\d,]+)/)[1].replace(',', '.')); expect(Math.abs(dc - 0.55) <= 0.03, 'kalibre katsayı ' + dc);
  await page.fill('[data-f="library.materials.0.props.drapeRef2"]', '0,57'); await page.locator('[data-f="library.materials.0.props.drapeRef2"]').dispatchEvent('change');
  await page.waitForFunction(() => /Referans numuneyle uyumlu/.test(document.querySelector('#main').innerText));
  await A(page, 'drape-view', '[data-i="0"]'); await page.waitForSelector('#v3x'); await page.waitForFunction(() => { const a = document.getElementById('v3x').api; return a.ready || a.error; });
  expect(await page.evaluate(() => document.getElementById('v3x').api.ready), 'dökümlü numune 3B');
  await page.locator('#v3x [data-k="close"]').click();
});

await TX('Tekstil üretim föyü: gömlek şablon operasyonları (tahmini), süre düzeltilince tahmini kalkar, eksik girdi uyarısı, maliyet kartı elle hesapla aynı, sipariş ve malzeme ihtiyacı, üretim föyü PDF', async ({ page }) => {
  await A(page, 'type', '[data-v="woven"]'); await page.waitForSelector('[data-a="type"][data-v="woven"].on');
  await page.fill('#np-name', 'Föy E2E'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
  await page.selectOption('#ap-type', 'gomlek'); await A(page, 'add-prod');
  await A(page, 'tab', '[data-v="mats"]'); await page.selectOption('#nm-preset', 'fabric:0'); await A(page, 'add-preset');
  await page.fill('[data-f="library.materials.0.price"]', '100'); await page.locator('[data-f="library.materials.0.price"]').dispatchEvent('change');
  await A(page, 'tab', '[data-v="col"]'); await A(page, 'link', '[data-i="0"]');
  await A(page, 'tab', '[data-v="pat"]'); await page.fill('#pt-size-free', 'M'); await A(page, 'add-pattern'); await page.waitForSelector('#pkx canvas'); await page.locator('#pkx [data-k="close"]').click();
  await A(page, 'tab', '[data-v="tp"]'); await A(page, 'op-tpl');
  let b = await txBody(page); expect((b.match(/tahmini/g) || []).length >= 16 && /Toplam [\d,]+ dk/.test(b), 'şablon 16 operasyon tahmini');
  expect(/Hesaplanmayan kalemler var — eksik: .*dakika ücreti/.test(b), 'eksik girdi uyarısı');
  // ilk operasyon süresini düzelt → tahmini kalkar
  await page.fill('[data-f="collection.products.0.techpack.ops.0.smv"]', '2'); await page.locator('[data-f="collection.products.0.techpack.ops.0.smv"]').dispatchEvent('change');
  await page.waitForFunction(() => !document.querySelector('[data-f="collection.products.0.techpack.ops.0.smv"]').parentElement.innerText.includes('tahmini'));
  const total = +(await txBody(page)).match(/Toplam ([\d,]+) dk/)[1].replace(',', '.');
  for (const [k, v] of [['minuteRate', '3'], ['efficiency', '75'], ['overheadPct', '20'], ['marginPct', '50']]) { await page.fill(`[data-f="collection.products.0.costing.${k}"]`, v); await page.locator(`[data-f="collection.products.0.costing.${k}"]`).dispatchEvent('change'); }
  await page.waitForFunction(() => !/Hesaplanmayan kalemler/.test(document.querySelector('#main').innerText));
  const cells = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#main tr')].filter((r) => r.cells.length === 2).map((r) => [r.cells[0].innerText.split('\n')[0], r.cells[1].innerText])));
  const nv = (s) => +String(s).replace(/\./g, '').replace(',', '.');
  const labour = total * 3 / 0.75; expect(Math.abs(nv(cells['İşçilik']) - labour) < 0.02, `işçilik ${cells['İşçilik']} ≈ ${labour}`);
  const cost = (nv(cells['Malzeme']) + labour) * 1.2; expect(Math.abs(nv(cells['Birim maliyet']) - cost) < 0.05 && Math.abs(nv(cells['Satış fiyatı (KDV hariç)']) - cost * 1.5) < 0.05, 'maliyet zinciri: ' + JSON.stringify(cells));
  // sipariş
  await page.fill('[data-f="collection.products.0.order.M"]', '200'); await page.locator('[data-f="collection.products.0.order.M"]').dispatchEvent('change');
  await page.fill('[data-f="collection.products.0.costing.wastePct"]', '3'); await page.locator('[data-f="collection.products.0.costing.wastePct"]').dispatchEvent('change');
  await page.waitForFunction(() => /200 adet · toplam malzeme/.test(document.querySelector('#main').innerText));
  const pdf = await download(page, () => A(page, 'prod-pdf'));
  expect(pdf.text.startsWith('%PDF-') && /Operasyon listesi/.test(pdf.text) && /tahmini/.test(pdf.text), 'üretim föyü PDF ' + pdf.size + ' B');
  await A(page, 'tab', '[data-v="val"]'); expect(await page.locator('.issue.hata').count() === 0 && /Operasyon süreleri şablondan/.test(await txBody(page)), 'doğrulama: tahmini süre uyarısı, hata yok');
});

await TX('Tekstil DXF (AAMA): gömlek kalıbı DXF dışa → yeni ürüne içe aktar; 7 parça, alanlar aynı, ölçü / pay korunur; bozuk DXF açık hata', async ({ page }) => {
  await A(page, 'type', '[data-v="woven"]'); await page.waitForSelector('[data-a="type"][data-v="woven"].on');
  await page.fill('#np-name', 'DXF E2E'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
  await page.selectOption('#ap-type', 'gomlek'); await A(page, 'add-prod'); await page.fill('#ap-name', 'Kopya'); await page.selectOption('#ap-type', 'gomlek'); await A(page, 'add-prod');
  await A(page, 'tab', '[data-v="pat"]'); await page.selectOption('#pt-prod', { index: 0 }); await page.fill('#pt-size-free', 'M'); await A(page, 'add-pattern'); await page.waitForSelector('#pkx canvas'); await page.locator('#pkx [data-k="close"]').click();
  const dxf = await download(page, () => A(page, 'dxf-out'));
  expect(/AC1009/.test(dxf.text) && (dxf.text.match(/\n0\nBLOCK\n/g) || []).length === 7 && /\.dxf$/.test(dxf.name), 'DXF indirildi: ' + dxf.name);
  const fsx = await import('node:fs'), pth = '/tmp/e2e-kalip.dxf'; fsx.writeFileSync(pth, dxf.text);
  await page.selectOption('#pt-prod', { index: 1 }); await page.fill('#pt-size-free', 'L');
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), A(page, 'dxf-in')]); await fc.setFiles(pth);
  await page.waitForFunction(() => /7 parça \(mm\)/.test(document.getElementById('toast').innerText));
  const b = await txBody(page); expect((b.match(/Beden L/g) || []).length >= 1, 'içe aktarılan grup (L)');
  await A(page, 'tab', '[data-v="val"]'); expect(await page.locator('.issue.hata').count() === 0, 'doğrulama temiz');
  fsx.writeFileSync('/tmp/e2e-bozuk.dxf', 'bozuk\ndosya\n');
  await A(page, 'tab', '[data-v="pat"]'); const [fc2] = await Promise.all([page.waitForEvent('filechooser'), A(page, 'dxf-in')]); await fc2.setFiles('/tmp/e2e-bozuk.dxf');
  await page.waitForFunction(() => /⚠ DXF bozuk/.test(document.getElementById('toast').innerText));
});

for (const [dev, view] of [['telefon', null], ['tablet', { viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, dpr: 2 }], ['masaüstü', { viewport: { width: 1366, height: 900 } }]]) {
  await TX(`Tekstil temel akış (${dev}): karma proje, her sekme taşmasız açılır, çizim / kalıp / desen editörleri açılıp kapanır, föy PDF iner`, async ({ page }) => {
    await A(page, 'type', '[data-v="mixed"]'); await page.waitForSelector('[data-a="type"][data-v="mixed"].on');
    await page.fill('#np-name', 'Cihaz ' + dev); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
    await page.selectOption('#ap-branch', 'woven'); await page.selectOption('#ap-type', 'gomlek'); await A(page, 'add-prod');
    const over = () => page.evaluate(() => document.scrollingElement.scrollWidth - window.innerWidth);
    for (const tab of ['col', 'draw', 'pat', 'knit', 'colors', 'sizes', 'mats', 'tp', 'val', 'revs', 'tools']) { await A(page, 'tab', `[data-v="${tab}"]`); await page.waitForSelector(`[data-a="tab"][data-v="${tab}"].on`); const o = await over(); expect(o <= 1, `${tab} sekmesi yatay taşma ${o} px`); }
    await A(page, 'tab', '[data-v="draw"]'); await A(page, 'add-sketch'); await page.waitForSelector('#skx canvas, #sk canvas, canvas'); await page.locator('[data-k="close"]').first().click();
    await A(page, 'tab', '[data-v="pat"]'); await page.fill('#pt-size-free', 'M'); await A(page, 'add-pattern'); await page.waitForSelector('#pkx canvas'); expect((await over()) <= 1, 'kalıp editörü taşmasız'); await page.locator('#pkx [data-k="close"]').click();
    await A(page, 'tab', '[data-v="knit"]'); await page.selectOption('#nk-tpl', 'sac22'); await A(page, 'add-chart'); await page.waitForSelector('#kcx canvas'); await page.locator('#kcx [data-k="close"]').click();
    await A(page, 'tab', '[data-v="tp"]'); const pdf = await download(page, () => A(page, 'prod-pdf')); expect(pdf.text.startsWith('%PDF-'), 'föy PDF');
  }, view || undefined);
}

await TX('Tekstil ↔ Makine ayrılığı: tekstil kaydı makine projelerine yazmaz; makine projeleri tekstil listesinde görünmez', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('cizim:projects', JSON.stringify({ mak: { data: '{}', at: 1 } })));
  await A(page, 'type', '[data-v="woven"]'); await page.waitForSelector('[data-a="type"][data-v="woven"].on'); await page.fill('#np-name', 'Ayrı'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
  await A(page, 'add-prod'); await page.fill('#rev-note', 'x'); await A(page, 'commit'); await A(page, 'home');
  const st = await page.evaluate(() => ({ p: localStorage.getItem('cizim:projects'), keys: Object.keys(localStorage) }));
  expect(st.p === JSON.stringify({ mak: { data: '{}', at: 1 } }), 'makine projeleri değişmedi');
  expect(!st.keys.some((k) => /tx|tekstil/i.test(k) && k !== 'cizim:workspace'), 'tekstil localStorage kullanmıyor: ' + st.keys);
  expect(!/mak\b/.test(await txBody(page)), 'makine projesi listede yok');
}, { viewport: { width: 1366, height: 900 } });

await browser.close(); srv.close();
const sum = R.summary();
sum.perf = perf; sum.env = { node: process.version, chromium: 'Playwright Chromium / Chrome', webgl: 'SwiftShader (yazılımsal)', devices: 'emülasyon (gerçek cihaz değil)', libs: process.env.E2E_LIBS ? 'yerel kopya (E2E_LIBS)' : 'unpkg (internet)', at: new Date().toISOString() };
sum.ui = UI_PATH ? 'yeni' : 'eski';
fs.writeFileSync(path.join(OUT, UI_PATH ? 'e2e-yeni.json' : 'e2e.json'), JSON.stringify(sum, null, 1));
for (const f of fs.readdirSync(OUT)) if (f.startsWith('tmp_')) fs.unlinkSync(path.join(OUT, f));
console.log('\nÖzet:', JSON.stringify(sum.counts));
for (const [n, v, u] of perf) console.log('  ⏱ ' + n + ': ' + v + ' ' + u);
process.exit(sum.counts['başarısız'] ? 1 : 0);
