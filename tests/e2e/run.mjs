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
async function app(view = DESK) { const a = await openApp(browser, url, { ...view, init: NO_GUIDE }); await waitReady(a.page); return a; }
const act = async (page, a) => { const b = page.locator(`[data-act="${a}"]:visible`).first(); await b.scrollIntoViewIfNeeded(); await b.click(); };
const tab = async (page, k) => { const b = page.locator(`#tabs [data-act="tab-${k}"]`); await b.scrollIntoViewIfNeeded(); await b.click(); await page.waitForTimeout(150); };
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
const T = (title, area, fn, meta = {}) => { if (only.length && !only.some((o) => area.toLowerCase().startsWith(o.toLowerCase()))) return; return R.test(title, async () => {
  const a = await app(meta.view || DESK);
  try { expect(!a.net.missing.length, 'Kütüphane dosyası bulunamadı: ' + a.net.missing[0]); await fn(a); const errs = a.errors.filter((e) => !(meta.allowErr || []).some((re) => re.test(e))); expect(!errs.length, 'Sayfa hataları: ' + errs.slice(0, 3).join(' | ')); }
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
R.blocked('CNC torna CAM (X/Z, çap modu, dış/iç tornalama, kanal, diş, post)', 'Depoda torna modülü yok: 2. görev promptu uygulanmadı (kod kanıtı: torna takım yolu / G-kodu üreten dosya yok). Test yazılmadı; sahte başarı gösterilmez.', 'H-Torna');

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
await (async () => { if (only.length && !only.some((o) => 'W-Alan'.toLowerCase().startsWith(o.toLowerCase()))) return; await R.test('Çalışma alanı: ilk açılışta seçim ekranı; Makine seçilince mevcut uygulama açılır; seçim hatırlanır; Tekstil\'e geçip geri dönülür', async () => {
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
const TX = (title, fn, view) => { if (only.length && !only.some((o) => 'T-Tekstil'.toLowerCase().startsWith(o.toLowerCase()))) return; return R.test(title, async () => {
  const a = await txApp(view);
  try { await fn(a); expect(!a.errors.length, 'Sayfa hataları: ' + a.errors.slice(0, 3).join(' | ')); }
  catch (e) { e.shot = await shot(a.page, 'T_' + title.slice(0, 40)); throw e; } finally { await close(a); }
}, { area: 'T-Tekstil' }); };
const A = (page, a, extra = '') => page.locator(`[data-a="${a}"]${extra}`).first().click();
const txBody = (page) => page.locator('#main').innerText();

await TX('Tekstil: karma koleksiyon — gömlek (dokuma) + kazak (triko), renk, örnek beden tablosu, kumaş / iplik / aksesuar, dal kuralı, föy, revizyon, yenile, aç', async ({ page }) => {
  await A(page, 'type', '[data-v="mixed"]');
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
  await A(page, 'type', '[data-v="knit"]'); await page.fill('#np-name', 'Triko 1'); await A(page, 'create');
  await page.waitForSelector('[data-a="add-prod"]');
  expect(await page.locator('#ap-branch').count() === 0, 'tek dal: dal seçimi yok');
  const types = await page.locator('#ap-type option').allInnerTexts();
  expect(types.includes('Kazak') && !types.includes('Gömlek'), 'triko türleri: ' + types);
  await A(page, 'tab', '[data-v="mats"]');
  const kinds = await page.locator('#nm-kind option').allInnerTexts();
  expect(kinds.includes('İplik') && !kinds.includes('Kumaş'), 'triko malzemeleri: ' + kinds);
  await A(page, 'tab', '[data-v="tools"]');
  const tl = await txBody(page);
  expect(/Triko \/ Örgü/.test(tl) && !/Dokuma \/ Konfeksiyon\n/.test(tl) && (tl.match(/Henüz yok/g) || []).length >= 5, 'dal araçları');
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

await TX('Tekstil ↔ Makine ayrılığı: tekstil kaydı makine projelerine yazmaz; makine projeleri tekstil listesinde görünmez', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('cizim:projects', JSON.stringify({ mak: { data: '{}', at: 1 } })));
  await A(page, 'type', '[data-v="woven"]'); await page.fill('#np-name', 'Ayrı'); await A(page, 'create'); await page.waitForSelector('[data-a="add-prod"]');
  await A(page, 'add-prod'); await page.fill('#rev-note', 'x'); await A(page, 'commit'); await A(page, 'home');
  const st = await page.evaluate(() => ({ p: localStorage.getItem('cizim:projects'), keys: Object.keys(localStorage) }));
  expect(st.p === JSON.stringify({ mak: { data: '{}', at: 1 } }), 'makine projeleri değişmedi');
  expect(!st.keys.some((k) => /tx|tekstil/i.test(k) && k !== 'cizim:workspace'), 'tekstil localStorage kullanmıyor: ' + st.keys);
  expect(!/mak\b/.test(await txBody(page)), 'makine projesi listede yok');
}, { viewport: { width: 1366, height: 900 } });

await browser.close(); srv.close();
const sum = R.summary();
sum.perf = perf; sum.env = { node: process.version, chromium: 'Playwright Chromium / Chrome', webgl: 'SwiftShader (yazılımsal)', devices: 'emülasyon (gerçek cihaz değil)', libs: process.env.E2E_LIBS ? 'yerel kopya (E2E_LIBS)' : 'unpkg (internet)', at: new Date().toISOString() };
fs.writeFileSync(path.join(OUT, 'e2e.json'), JSON.stringify(sum, null, 1));
for (const f of fs.readdirSync(OUT)) if (f.startsWith('tmp_')) fs.unlinkSync(path.join(OUT, f));
console.log('\nÖzet:', JSON.stringify(sum.counts));
for (const [n, v, u] of perf) console.log('  ⏱ ' + n + ': ' + v + ' ' + u);
process.exit(sum.counts['başarısız'] ? 1 : 0);
