// Parmakla kontrol uçtan uca testleri: node tests/e2e/hand.mjs   (ayrıntı: TESTLER.md)
// Ortam: Chromium + SAHTE kamera (--use-fake-device-for-media-stream: tarayıcının ürettiği deneme görüntüsü, içinde el yok).
// İki katman:
//   1) Yapay el: algılayıcı yerine 21 noktalı yapay el verilir (tests/hand-fixture.mjs). Kamera açma / kapama, hareket motoru,
//      yapay işaretçi ve uygulamanın gerçek çizim işleyicileri birlikte sınanır. GERÇEK EL / GERÇEK KAMERA DEĞİLDİR.
//   2) Gerçek MediaPipe: vendor/ içindeki kütüphane + model sahte kamera görüntüsüyle çalıştırılır (yüklenme, kare işleme, CSP).
//      Görüntüde el olmadığı için 21 noktanın gerçek elde doğruluğu burada SINANMAZ; gerçek cihazda denenmelidir.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, openApp, waitReady, createRunner, expect, ROOT } from './lib.mjs';

const OUT = path.join(ROOT, 'reports'), SHOTS = path.join(OUT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const only = process.argv.slice(2);
const R = createRunner('e2e-hand');
const { srv, url } = await startServer();
const BASE_ARGS = ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--ignore-gpu-blocklist'];
const camBrowser = await launch({ args: [...BASE_ARGS, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const plainBrowser = await launch();                      // kamera izni verilmeyen tarayıcı
const DESK = { viewport: { width: 1366, height: 900 } };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, dpr: 2 };
const UIS = [['eski', 'index.html'], ['yeni', 'yeni/index.html']];
const HAS_MP = fs.existsSync(path.join(ROOT, 'vendor/mediapipe-models/hand_landmarker.task')) && fs.existsSync(path.join(ROOT, 'vendor/@mediapipe'));

// sayfa açılmadan önce: rehber kapalı + (istenirse) yapay algılayıcı
const INIT_FAKE = () => {
  try { localStorage.setItem('cizim:guideSeen', '1'); if (!localStorage.getItem('cizim:workspace')) localStorage.setItem('cizim:workspace', 'makine'); } catch (e) { /* */ }
  window.__handPose = null; window.__handStat = { load: 0, close: 0, detect: 0 };
  window.__handTracker = { async load() { window.__handStat.load++; }, detect() { window.__handStat.detect++; return window.__handPose ? { landmarks: window.__handPose, handedness: 'Left' } : null; }, close() { window.__handStat.close++; } };
};
const INIT_REAL = () => { try { localStorage.setItem('cizim:guideSeen', '1'); if (!localStorage.getItem('cizim:workspace')) localStorage.setItem('cizim:workspace', 'makine'); } catch (e) { /* */ } };

async function shot(page, name) { const p = path.join(SHOTS, 'hand_' + name.replace(/[^\w-]+/g, '_').slice(0, 80) + '.png'); try { await page.screenshot({ path: p }); } catch (e) { /* */ } return p; }
const T = (title, area, fn, { view = DESK, file = 'index.html', browser = camBrowser, init = INIT_FAKE, ready = true } = {}) => {
  if (only.length && !only.some((o) => area.toLowerCase().startsWith(o.toLowerCase()))) return;
  return R.test(title, async () => {
    const a = await openApp(browser, url, { ...view, path: file, init });
    try {
      if (ready) await waitReady(a.page);
      await a.page.waitForFunction(() => !!window.__hand, null, { timeout: 30000 });
      await a.page.evaluate(async () => {
        const { hand, POSE } = await import('/tests/hand-fixture.mjs');
        const { sensitivityBox } = await import('/hand/gestures.js?v=20261113a');
        // ekran noktası (px) → işaret parmağı ucu o noktaya gelen yapay el (ön kamera: aynalı)
        window.__hp = (sx, sy, pose = 'point') => { const b = sensitivityBox(window.__hand.sens), k = b.x1 - b.x0; return hand({ ...POSE[pose], x: 1 - (b.x0 + sx / innerWidth * k), y: b.y0 + sy / innerHeight * k }); };
        window.__orig = { set: Element.prototype.setPointerCapture, rel: Element.prototype.releasePointerCapture };
      });
      await fn(a);
      expect(!a.net.external.length, 'Dış siteye istek: ' + a.net.external.slice(0, 3).join(', '));
      const errs = a.errors.filter((e) => !/favicon|GPU stall|WebGL: |GL Driver Message|Automatic fallback to software|INFO: Created TensorFlow Lite XNNPACK delegate/i.test(e));
      expect(!errs.length, 'Sayfa hatası: ' + errs.slice(0, 3).join(' || '));
    } catch (e) { e.shot = await shot(a.page, area + '_' + title); throw e; }
    finally { try { await a.ctx.close(); } catch (e) { /* */ } }
  }, { area });
};

/* ---------- yapay el yardımcıları ---------- */
const st = (page) => page.evaluate(() => { const h = window.__hand; return { cam: h.cam, track: h.track, gesture: h.gesture, error: h.error, fps: h.fps, x: h.cursor.x, y: h.cursor.y, visible: h.cursor.visible, down: h.cursor.down, drawing: h.drawing, sens: h.sens, handed: h.handed }; });
async function start(page) {
  await page.locator('#b-hand').click();
  await page.waitForFunction(() => window.__hand.track === 'on' || window.__hand.cam === 'error', null, { timeout: 30000 });
  const s = await st(page); expect(s.track === 'on', 'başlamadı: ' + s.cam + ' / ' + s.error);
}
const pose = (page, x, y, p = 'point') => page.evaluate(([x, y, p]) => { window.__handPose = window.__hp(x, y, p); }, [x, y, p]);
const noHand = (page) => page.evaluate(() => { window.__handPose = null; });
const until = (page, f, arg, msg) => page.waitForFunction(f, arg, { timeout: 8000 }).catch(async () => { throw new Error('zaman aşımı: ' + msg + ' — ' + JSON.stringify(await st(page).catch(() => null))); });
async function moveTo(page, x, y) { await pose(page, x, y); await until(page, ([x, y]) => { const c = window.__hand.cursor; return c.visible && !c.down && Math.hypot(c.x - x, c.y - y) < 2.5; }, [x, y], `imleç ${x},${y}`); }
async function pinch(page, x, y) { await pose(page, x, y, 'pinch'); await until(page, () => window.__hand.cursor.down, null, 'basma'); }
async function unpinch(page, x, y) { await pose(page, x, y); await until(page, () => !window.__hand.cursor.down, null, 'bırakma'); await page.waitForTimeout(80); }
async function tap(page, x, y) { await moveTo(page, x, y); await pinch(page, x, y); await page.waitForTimeout(60); await unpinch(page, x, y); }
async function drag(page, x0, y0, x1, y1, steps = 14) {
  await moveTo(page, x0, y0); await pinch(page, x0, y0);
  for (let i = 1; i <= steps; i++) { await pose(page, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, 'pinch'); await page.waitForTimeout(45); }
  await until(page, ([x, y]) => { const c = window.__hand.cursor; return Math.hypot(c.x - x, c.y - y) < 4; }, [x1, y1], 'sürükleme sonu');
  await unpinch(page, x1, y1);
}
const center = async (loc) => { const b = await loc.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2, b]; };
const chips = (page) => page.locator('#chips .chip').count();
// çizim alanının sağ yarısı (önizleme ve imleç dışında) — görüntü değişti mi?
async function viewShot(page) { await noHand(page); await until(page, () => !window.__hand.cursor.visible, null, 'imleç gizlenmedi'); await page.waitForTimeout(350); const b = await page.locator('#view canvas').boundingBox(); return page.screenshot({ clip: { x: b.x + b.width * 0.45, y: b.y + b.height * 0.25, width: b.width * 0.4, height: b.height * 0.5 } }); }

/* ---------- 1. kamera yaşam döngüsü ---------- */
for (const [ui, file] of UIS) {
  await T(`[${ui}] düğme → kamera açılır, önizleme + durum görünür; kapatınca kamera izleri durur; yeniden açılır`, 'P1-Kamera', async ({ page }) => {
    expect(await page.locator('#b-hand').isVisible(), 'Parmakla kontrol düğmesi görünür');
    expect(await page.evaluate(() => !window.__hand.active && !document.querySelector('#hc-pre video').srcObject), 'sayfa açılışında kamera kapalı');
    expect((await page.evaluate(() => window.__handStat.load)) === 0, 'açılışta algılayıcı yüklenmez');
    await start(page);
    const on = await page.evaluate(() => { const v = document.querySelector('#hc-pre video'); return { w: v.videoWidth, live: v.srcObject.getTracks().map((t) => t.readyState), audio: v.srcObject.getAudioTracks().length, dock: !document.getElementById('hc-dock').hidden, btn: document.getElementById('b-hand').classList.contains('on'), toast: document.getElementById('hc-toast').textContent, patched: Element.prototype.setPointerCapture !== window.__orig.set }; });
    expect(on.w > 0 && on.live.every((s) => s === 'live') && on.audio === 0, 'kamera görüntüsü geliyor, ses istenmedi: ' + JSON.stringify(on));
    expect(on.dock && on.btn && /Parmakla kontrol açık/.test(on.toast), 'önizleme, düğme durumu ve bildirim');
    await page.waitForFunction(() => window.__handStat.detect > 5 && window.__hand.fps > 0, null, { timeout: 10000 });
    expect(/El bekleniyor/.test(await page.locator('#hc-stat').innerText()), 'el yokken durum');
    // el görününce: imleç + önizlemede 21 nokta çizimi
    await moveTo(page, 700, 400);
    const drawn = await page.evaluate(() => { const s = document.querySelector('#hc-pre svg'), b = s.getBoundingClientRect(), cs = [...s.querySelectorAll('circle')].map((c) => c.getBoundingClientRect()); return { n: cs.filter((r) => r.width > 1 && r.left >= b.left - 2 && r.right <= b.right + 2 && r.top >= b.top - 2 && r.bottom <= b.bottom + 2).length, bones: (s.querySelector('path').getAttribute('d') || '').split('M').length - 1, vis: getComputedStyle(s).visibility, lm: window.__hand.landmarks.length, cur: !document.getElementById('hc-cursor').hidden, canvases: document.querySelectorAll('#hc-root canvas').length }; });
    expect(drawn.lm === 21 && drawn.n === 21 && drawn.bones === 21 && drawn.vis === 'visible' && drawn.cur && drawn.canvases === 0, 'önizlemede el iskeleti ve ekranda imleç: ' + JSON.stringify(drawn));
    expect(/İmleç/.test(await page.locator('#hc-stat').innerText()), 'durum: imleç');
    // ayar paneli
    await page.locator('[data-hc="panel"]').click();
    const txt = await page.locator('#hc-panel').innerText();
    expect(/Kamera\s+Açık/.test(txt) && /Çalışıyor/.test(txt) && /Sağ el/.test(txt) && /Hassasiyet/.test(txt) && /Kalibre et/.test(txt) && /Parmakla çizim: AÇIK/.test(txt), 'panel içeriği: ' + txt.replace(/\s+/g, ' ').slice(0, 300));
    // kapat
    const tracks = await page.evaluateHandle(() => document.querySelector('#hc-pre video').srcObject.getTracks());
    await page.locator('#hc-panel [data-hc="camera"]').click();
    const off = await page.evaluate((tr) => ({ ended: tr.every((t) => t.readyState === 'ended'), src: document.querySelector('#hc-pre video').srcObject, dock: document.getElementById('hc-dock').hidden, cur: document.getElementById('hc-cursor').hidden, btn: document.getElementById('b-hand').classList.contains('on'), restored: Element.prototype.setPointerCapture === window.__orig.set && Element.prototype.releasePointerCapture === window.__orig.rel, close: window.__handStat.close, cam: window.__hand.cam }), tracks);
    expect(off.ended && off.src === null, 'kamera izleri durdu, video boşaltıldı');
    expect(off.dock && off.cur && !off.btn && off.cam === 'off', 'önizleme ve imleç gizlendi');
    expect(off.restored && off.close === 1, 'işaretçi yaması geri alındı, algılayıcı kapatıldı');
    const d0 = await page.evaluate(() => window.__handStat.detect); await page.waitForTimeout(400);
    expect((await page.evaluate(() => window.__handStat.detect)) === d0, 'kapalıyken kare işlenmiyor (döngü durdu)');
    // yeniden aç
    await start(page); await moveTo(page, 600, 300);
    expect((await page.evaluate(() => window.__handStat.load)) === 2, 'yeniden açıldı');
    await page.locator('[data-hc="stop"]').click(); expect((await st(page)).cam === 'off', 'dock üzerindeki Kapat');
  }, { file });
}

await T('kamera izni yok / kamera yok: anlaşılır hata, kamera açık kalmaz, uygulama çalışmaya devam eder', 'P1-Kamera', async ({ page }) => {
  const n0 = await chips(page);
  await page.locator('#b-hand').click();
  await page.waitForFunction(() => window.__hand.cam === 'error', null, { timeout: 20000 });
  const s = await st(page); expect(/[Kk]amera/.test(s.error) && s.error.length > 20, 'hata metni: ' + s.error);
  expect(await page.locator('#hc-err').isVisible(), 'hata panelde görünür');
  expect(await page.evaluate(() => !document.querySelector('#hc-pre video').srcObject && document.getElementById('hc-dock').hidden && window.__handStat.load === 0), 'kamera / algılayıcı açılmadı');
  await page.locator('#hc-panel [data-hc="close"]').click();
  await page.locator('[data-act="add-box"]:visible').first().click(); await page.waitForTimeout(300);
  expect(await chips(page) === n0 + 1, 'fare ile kutu eklendi');
}, { browser: plainBrowser });

/* ---------- 2. çizim motoruyla bağlantı ---------- */
for (const [ui, file] of UIS) {
  await T(`[${ui}] 3B sahne: birleştirip sürükleyince görünüm döner; birleştirmeden hareket hiçbir şeyi değiştirmez; düğmeye dokunma kutu ekler`, 'P2-3B', async ({ page }) => {
    await page.locator('[data-act="add-box"]:visible').first().click(); await page.waitForTimeout(400);
    await start(page);
    const [cx, cy, b] = await center(page.locator('#view canvas'));
    const s0 = await viewShot(page);
    await moveTo(page, cx - 100, cy); await moveTo(page, cx + 120, cy + 60);          // yalnız imleç
    const s1 = await viewShot(page); expect(s0.equals(s1), 'birleştirmeden hareket sahneyi değiştirmedi');
    await drag(page, cx - 60, cy + 20, cx + 140, cy - 40);
    const s2 = await viewShot(page); expect(!s1.equals(s2), 'birleştirip sürükleyince görünüm döndü');
    // iki parmak yukarı: yakınlaştırma (tekerlek)
    await moveTo(page, cx, cy); await pose(page, cx, cy + 40, 'two'); await until(page, () => window.__hand.gesture === 'two', null, 'iki parmak');
    for (let i = 1; i <= 8; i++) { await pose(page, cx, cy + 40 - i * 25, 'two'); await page.waitForTimeout(60); }
    const s3 = await viewShot(page); expect(!s2.equals(s3), 'iki parmakla yakınlaştırma');
    // düğmeye parmakla dokunma
    const n0 = await chips(page);
    const [bx, by] = await center(page.locator('[data-act="add-box"]:visible').first());
    await tap(page, bx, by); await page.waitForTimeout(300);
    expect(await chips(page) === n0 + 1, `parmakla "Kutu" düğmesine dokununca parça eklendi (${n0} → ${await chips(page)})`);
    // parmakla çizim kapalı: aynı dokunma hiçbir şey yapmaz
    await page.evaluate(() => window.__hand.setDrawing(false));
    await moveTo(page, bx, by); await pose(page, bx, by, 'pinch'); await page.waitForTimeout(500); await pose(page, bx, by); await page.waitForTimeout(300);
    expect(await chips(page) === n0 + 1 && !(await st(page)).down, 'parmakla çizim kapalıyken basma yok');
    await page.evaluate(() => window.__hand.setDrawing(true));
    // fare çalışmaya devam ediyor
    await noHand(page); await page.locator('[data-act="add-box"]:visible').first().click(); await page.waitForTimeout(300);
    expect(await chips(page) === n0 + 2, 'parmakla kontrol açıkken fare tıklaması çalışıyor');
    void b;
  }, { file });

  await T(`[${ui}] kroki: parmakla dikdörtgen çiz → "Tamam" düğmesine parmakla dokun → modele yeni parça eklenir`, 'P2-Kroki', async ({ page }) => {
    await start(page);
    const n0 = await chips(page);
    await noHand(page); await page.locator('[data-act="sketch-new"]:visible').first().click(); await page.waitForSelector('#sk canvas');
    const [tx, ty] = await center(page.locator('#sk [data-a="tool-rect"]')); await tap(page, tx, ty);
    expect(await page.locator('#sk [data-a="tool-rect"].on').count() === 1, 'dikdörtgen aracı parmakla seçildi');
    const [cx, cy] = await center(page.locator('#sk canvas'));
    const before = await page.locator('#sk canvas').screenshot();
    await drag(page, cx - 110, cy - 70, cx + 90, cy + 60);
    await noHand(page); await page.waitForTimeout(450);
    expect(!before.equals(await page.locator('#sk canvas').screenshot()), 'tuvalde çizim oluştu');
    const [dx, dy] = await center(page.locator('#sk [data-a="done"]')); await tap(page, dx, dy);
    await page.waitForFunction(() => !document.getElementById('sk'), null, { timeout: 8000 });
    await page.waitForFunction((n) => document.querySelectorAll('#chips .chip').length === n + 1, n0, { timeout: 8000 });
  }, { file });

  await T(`[${ui}] 2B çizim: iki parmak dokunuşuyla çizgi çizilir; açık avuç duraklatır (imleç durur, çizim olmaz)`, 'P2-2B', async ({ page }) => {
    await start(page);
    await noHand(page); await page.locator('[data-act="cad2d"]:visible').first().click(); await page.waitForSelector('#cad canvas');
    const stat = async () => +((await page.locator('#cad-stat').innerText()).match(/Varlık: (\d+)/) || [])[1];
    const n0 = await stat();
    const [cx, cy] = await center(page.locator('#cad canvas'));
    await tap(page, cx - 120, cy - 30); await tap(page, cx + 100, cy + 50);
    await noHand(page); await page.waitForTimeout(450);
    const n1 = await stat(); expect(n1 === n0 + 1, `çizgi eklendi (varlık ${n0} → ${n1})`);
    // açık avuç: imleç yerinde kalır, durum "Duraklatıldı"
    await moveTo(page, cx, cy); await pose(page, cx, cy, 'palm'); await until(page, () => window.__hand.gesture === 'palm', null, 'açık avuç');
    const p0 = await st(page);
    for (let i = 1; i <= 6; i++) { await pose(page, cx + i * 30, cy + i * 20, 'palm'); await page.waitForTimeout(50); }
    const p1 = await st(page);
    expect(p1.gesture === 'palm' && Math.hypot(p1.x - p0.x, p1.y - p0.y) < 1 && !p1.down, 'duraklatılmışken imleç oynamadı');
    expect(/Duraklatıldı/.test(await page.locator('#hc-stat').innerText()), 'durum: duraklatıldı');
    await noHand(page); await page.waitForTimeout(450); expect(await stat() === n1, 'duraklatma sırasında çizim olmadı');
  }, { file });
}

await T('telefon ölçüsü (emülasyon), yeni arayüz: düğme görünür, parmakla dokunma kutu ekler, hassasiyet ve kalibrasyon çalışır ve saklanır', 'P3-Ayar', async ({ page }) => {
  await start(page);
  const n0 = await chips(page);
  const [bx, by] = await center(page.locator('#dock [data-act="add-box"]')); await tap(page, bx, by); await page.waitForTimeout(300);
  expect(await chips(page) === n0 + 1, 'telefonda parmakla kutu eklendi');
  // hassasiyet
  await noHand(page); await page.locator('[data-hc="panel"]').click();
  await page.locator('[data-hc="sens+"]').click(); await page.locator('[data-hc="sens+"]').click();
  expect((await st(page)).sens === 7 && (await page.locator('#hc-sens-v').innerText()) === '7', 'hassasiyet 7');
  await moveTo(page, 200, 300);                              // yeni hassasiyetle eşleme tutarlı
  // kalibrasyon: iki köşe
  await page.locator('[data-hc="calib"]').click();
  expect(await page.evaluate(() => window.__hand.calib && window.__hand.calib.step === 1), 'kalibrasyon 1. adım');
  const raw = (x, y, p) => page.evaluate(([x, y, p]) => import('/tests/hand-fixture.mjs').then(({ hand, POSE }) => { window.__handPose = hand({ ...POSE[p], x, y }); }), [x, y, p]);
  await raw(0.7, 0.35, 'point'); await page.waitForTimeout(250); await raw(0.7, 0.35, 'pinch');
  await until(page, () => window.__hand.calib && window.__hand.calib.step === 2, null, 'kalibrasyon 2. adım');
  await raw(0.4, 0.65, 'point'); await page.waitForTimeout(250); await raw(0.4, 0.65, 'pinch');
  await until(page, () => !window.__hand.calib && window.__hand.calibrated, null, 'kalibrasyon bitti');
  expect(await chips(page) === n0 + 1, 'kalibrasyon sırasında sayfaya basma gitmedi');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('cizim:hand')));
  expect(saved.sens === 7 && saved.box && Math.abs(saved.box.x0 - 0.3) < 0.02 && Math.abs(saved.box.x1 - 0.6) < 0.02, 'ayar saklandı: ' + JSON.stringify(saved));
  await raw(0.55, 0.5, 'point'); await page.waitForTimeout(600);   // aynalı: kutunun ortası (0,45) ham görüntüde 0,55
  const c = await st(page); expect(Math.abs(c.x - 195) < 12, 'kalibre alanın ortası ekranın ortasına geliyor: ' + c.x.toFixed(1));
  await noHand(page); await page.locator('[data-hc="panel"]').click(); await page.locator('[data-hc="calib-reset"]').click();
  expect(!(await page.evaluate(() => window.__hand.calibrated)), 'kalibrasyon sıfırlandı');
  // sekme arka plana geçerse basılı işaretçi bırakılır
  await page.locator('[data-hc="close"]').click();
}, { view: PHONE, file: 'yeni/index.html' });

await T('tekstil sayfası: düğme var, kamera açılıp kapanır, sayfa hatası yok', 'P4-Tekstil', async ({ page }) => {
  expect(await page.locator('#b-hand').isVisible(), 'düğme');
  await start(page); await moveTo(page, 600, 400);
  await page.locator('[data-hc="stop"]').click();
  expect((await st(page)).cam === 'off' && await page.evaluate(() => !document.querySelector('#hc-pre video').srcObject), 'kapandı');
}, { file: 'tekstil.html', ready: false });

/* ---------- 3. gerçek MediaPipe (sahte kamera görüntüsü; el yok) ---------- */
if (!only.length || only.some((o) => 'p5-mediapipe'.startsWith(o.toLowerCase()))) {
  if (!HAS_MP) R.blocked('gerçek MediaPipe Hand Landmarker: yüklenir ve kamera karelerini işler', 'vendor/@mediapipe ve vendor/mediapipe-models depoda yok', 'P5-MediaPipe');
  else for (const [ui, file] of UIS) {
    await T(`[${ui}] gerçek MediaPipe Hand Landmarker: depodaki kopyadan yüklenir, kamera karelerini işler, kapatınca serbest bırakılır`, 'P5-MediaPipe', async ({ page }) => {
      const t0 = Date.now();
      await page.locator('#b-hand').click();
      await page.waitForFunction(() => window.__hand.track === 'on' || window.__hand.cam === 'error', null, { timeout: 120000 });
      const s = await st(page); expect(s.track === 'on', 'başlamadı: ' + s.error);
      // yazılımsal WebGL'de ekran kartı yolu çok yavaştır: uygulama kendiliğinden işlemciye (WebAssembly) geçer; ikisi de kabul
      await page.waitForFunction(() => window.__hand.track === 'on' && window.__hand.fps >= 2, null, { timeout: 150000 });
      await page.waitForTimeout(3000);
      const r = await page.evaluate(() => ({ fps: window.__hand.fps, delegate: window.__hand.tracker.delegate, g: window.__hand.gesture, lm: window.__hand.landmarks, cam: window.__hand.cam, track: window.__hand.track, err: window.__hand.error }));
      console.log(`       MediaPipe hazır: ${Date.now() - t0} ms, ${r.fps} kare/sn, ${r.delegate} (yazılımsal ortam; gerçek cihaz hızı değildir)`);
      expect(r.cam === 'on' && r.track === 'on' && r.fps >= 2, 'kareler işleniyor: ' + JSON.stringify(r));
      expect(r.lm === null || r.lm.length === 21, 'el bulunursa 21 nokta döner (deneme görüntüsünde el beklenmez)');
      await page.locator('[data-hc="stop"]').click();
      expect(await page.evaluate(() => window.__hand.tracker.lm === null && !document.querySelector('#hc-pre video').srcObject), 'model ve kamera serbest bırakıldı');
      await page.locator('#b-hand').click();
      await page.waitForFunction(() => window.__hand.track === 'on' && window.__hand.fps >= 1, null, { timeout: 150000 });
      await page.locator('[data-hc="stop"]').click();
      expect((await st(page)).cam === 'off', 'yeniden açılıp kapandı');
    }, { file, init: INIT_REAL });
  }
}

await camBrowser.close(); await plainBrowser.close(); srv.close();
const sum = R.summary();
sum.env = { node: process.version, chromium: 'Playwright Chromium / Chrome', camera: 'sahte (tarayıcının deneme görüntüsü)', hand: 'yapay 21 nokta (gerçek el değil)', mediapipe: HAS_MP ? 'depodaki kopya' : 'yok' };
fs.writeFileSync(path.join(OUT, 'e2e-hand.json'), JSON.stringify(sum, null, 1));
console.log('\nÖzet:', JSON.stringify(sum.counts));
process.exit(sum.counts['başarısız'] ? 1 : 0);
