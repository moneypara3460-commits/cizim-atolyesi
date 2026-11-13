// Parmakla kontrol — arayüz: düğme, kamera önizlemesi, ayar paneli, imleç.
// Sayfaya tek <script type="module"> ile eklenir; uygulama koduna (app.js, kroki, 2B çizim, tekstil) dokunmaz.
// Kamera yalnız kullanıcı düğmeye basınca açılır; sayfa açılışında hiçbir şey yüklenmez (MediaPipe dahil).
import { HandControl } from './control.js?v=20261113a';
import { CONNECTIONS, LM } from './gestures.js?v=20261113a';

const V = '20261113a';
const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11.5V5a1.5 1.5 0 0 1 3 0v5.5M12 10V8.5a1.5 1.5 0 0 1 3 0V11M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.8a6 6 0 0 1-4.9-2.6L4.4 15a1.5 1.5 0 0 1 2.4-1.8L9 15.5"/></svg>';
const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (html) e.innerHTML = html; return e; };

const link = el('link', { rel: 'stylesheet', href: new URL('./hand.css?v=' + V, import.meta.url).href });
document.head.appendChild(link);

/* ---------- öğeler ---------- */
const root = el('div', { id: 'hc-root' });
root.innerHTML = `
<div id="hc-cursor" hidden></div>
<div id="hc-dock" data-pos="bl" hidden>
  <div id="hc-pre" title="Önizlemeyi başka köşeye taşı"><video muted playsinline></video><canvas></canvas><div class="wait" hidden></div></div>
  <div id="hc-stat" role="status"><i></i><span></span></div>
  <div class="btns"><button type="button" data-hc="panel">Ayarlar</button><button type="button" data-hc="stop" class="bad">Kapat</button></div>
</div>
<div id="hc-panel" role="dialog" aria-label="Parmakla kontrol" hidden>
  <div class="hd"><h3>Parmakla Kontrol</h3><button type="button" class="sq" data-hc="close" aria-label="Paneli kapat">✕</button></div>
  <p class="err" id="hc-err" hidden></p>
  <p class="msg" id="hc-msg" hidden></p>
  <div class="st">
    <b>Kamera</b><span id="hc-s-cam"></span>
    <b>El algılama</b><span id="hc-s-track"></span>
    <b>Hareket</b><span id="hc-s-gest"></span>
  </div>
  <div class="ln"><button type="button" data-hc="camera" id="hc-b-cam"></button></div>
  <div class="ln"><button type="button" data-hc="draw" id="hc-b-draw" aria-pressed="true"></button></div>
  <div class="ln"><label for="hc-sens">Hassasiyet</label><button type="button" class="sq" data-hc="sens-" aria-label="Hassasiyeti azalt">−</button><input id="hc-sens" type="range" min="1" max="10" step="1"><button type="button" class="sq" data-hc="sens+" aria-label="Hassasiyeti artır">+</button><output id="hc-sens-v"></output></div>
  <div class="ln"><button type="button" data-hc="calib" id="hc-b-calib"></button><button type="button" data-hc="calib-reset" id="hc-b-creset">Sıfırla</button></div>
  <ul>
    <li><b>İşaret parmağı:</b> imleci gezdirir.</li>
    <li><b>Başparmak + işaret parmağını birleştir:</b> çizer / sürükler; ayırınca bırakır. Kısa birleştirme dokunma sayılır.</li>
    <li><b>Açık avuç:</b> duraklatır (imleç durur).</li>
    <li><b>İşaret + orta parmak, yukarı / aşağı:</b> kaydırır, çizim alanında yakınlaştırır.</li>
  </ul>
  <p class="pv">Görüntü yalnız bu cihazda işlenir; kaydedilmez ve hiçbir yere gönderilmez. Fare ve dokunma her zaman çalışmaya devam eder.</p>
</div>
<div id="hc-toast" role="status"></div>`;
document.body.appendChild(root);
if (document.getElementById('dock')) root.classList.add('over-dock');
const $ = (id) => document.getElementById(id);
const cursor = $('hc-cursor'), dock = $('hc-dock'), panel = $('hc-panel'), pre = $('hc-pre');
const video = pre.querySelector('video'), canvas = pre.querySelector('canvas'), wait = pre.querySelector('.wait');

const hc = new HandControl({ video, tracker: window.__handTracker || undefined });   // __handTracker: yalnız testlerde yapay algılayıcı

/* ---------- sayfadaki düğme (mevcut tasarıma uygun yere) ---------- */
const buttons = [];
function addButton(b) { b.addEventListener('click', onMain); buttons.push(b); return b; }
const floats = $('floats'), bar = $('bar'), top = $('top');
if (floats) {                                      // yeni arayüz: çizim alanındaki yüzen düğmeler + menü
  floats.appendChild(addButton(el('button', { id: 'b-hand', class: 'ui ib', type: 'button', 'aria-label': 'Parmakla kontrol', title: 'Parmakla kontrol: kamerayla, dokunmadan çiz' }, ICON)));
  const menu = $('menu'), mic = menu && menu.querySelector('[data-act="mic"]');
  if (mic) { const m = addButton(el('button', { class: 'ui trow', type: 'button', id: 'm-hand' }, ICON + 'Parmakla kontrol')); mic.after(m); m.addEventListener('click', () => { const s = $('scrim'); if (s) s.click(); }); }
} else if (bar) {                                  // eski arayüz: üst çubuk
  const b = addButton(el('button', { id: 'b-hand', type: 'button', title: 'Parmakla kontrol: kamerayla, dokunmadan çiz', 'aria-label': 'Parmakla kontrol' }, '🖐'));
  const p = $('b-panel'); if (p && p.parentElement === bar) bar.insertBefore(b, p); else bar.appendChild(b);
} else if (top) {                                  // tekstil sayfası: üst çubuk
  const b = addButton(el('button', { id: 'b-hand', class: 'btn', type: 'button', title: 'Parmakla kontrol: kamerayla, dokunmadan çiz', 'aria-label': 'Parmakla kontrol' }, '🖐'));
  const m = $('to-mech'); if (m && m.parentElement === top) top.insertBefore(b, m); else top.appendChild(b);
}

/* ---------- davranış ---------- */
let toastT = 0;
function toast(s, ms = 4200) { const t = $('hc-toast'); t.textContent = s; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
function openPanel(on = true) { panel.hidden = !on; paint(); }

// Düğme: kapalıyken kamerayı açıp başlatır; açıkken ayar panelini gösterir.
async function onMain() {
  if (hc.active) { openPanel(panel.hidden); return; }
  await startAll();
}
let wasOn = false;
async function startAll() {
  if (!hc.supported) { openPanel(true); }
  await hc.start();
  if (hc.cam === 'error') openPanel(true);
}
function stopAll() { const on = hc.active; hc.stop(); if (on) toast('Parmakla kontrol kapandı; kamera kapatıldı.'); }

root.addEventListener('click', (e) => {
  const b = e.target.closest('[data-hc]'); if (!b) { if (e.target.closest('#hc-pre')) cyclePos(); return; }
  const a = b.dataset.hc;
  if (a === 'panel') openPanel(panel.hidden);
  else if (a === 'close') openPanel(false);
  else if (a === 'stop') stopAll();
  else if (a === 'camera') { if (hc.active) stopAll(); else startAll(); }
  else if (a === 'draw') hc.setDrawing(!hc.drawing);
  else if (a === 'sens-') hc.setSensitivity(hc.sens - 1);
  else if (a === 'sens+') hc.setSensitivity(hc.sens + 1);
  else if (a === 'calib') { if (hc.calib) hc.cancelCalibration(); else { hc.startCalibration(); openPanel(false); toast('Kalibrasyon: elini rahat çalıştığın alanın SOL ÜST köşesine götür ve parmaklarını birleştir.', 7000); } }
  else if (a === 'calib-reset') { hc.resetCalibration(); toast('Kalibrasyon sıfırlandı.'); }
});
$('hc-sens').addEventListener('input', (e) => hc.setSensitivity(e.target.value));
const POS = ['bl', 'br', 'tr', 'tl'];
function cyclePos() { dock.dataset.pos = POS[(POS.indexOf(dock.dataset.pos) + 1) % POS.length]; }

const CAM_TEXT = { off: 'Kapalı', starting: 'Açılıyor… (izin bekleniyor)', on: 'Açık', error: 'Hata' };
const TRACK_TEXT = { off: 'Kapalı', loading: 'Model yükleniyor…', on: 'Çalışıyor', error: 'Hata' };
function paint() {
  const on = hc.active;
  for (const b of buttons) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
  dock.hidden = !on;
  pre.classList.toggle('mirror', hc.camera.mirror);
  wait.hidden = hc.track === 'on'; wait.textContent = hc.cam === 'starting' ? 'Kamera izni bekleniyor…' : hc.track === 'loading' ? 'El algılama yükleniyor…' : '';
  const g = hc.gesture, st = $('hc-stat');
  st.dataset.s = hc.track !== 'on' ? 'off' : g === 'pinch' ? 'draw' : g === 'palm' || hc.calib ? 'pause' : hc.landmarks ? 'on' : 'off';
  st.querySelector('span').textContent = hc.track !== 'on' ? (wait.textContent || 'Kapalı') : hc.gestureText;
  $('hc-s-cam').textContent = CAM_TEXT[hc.cam] || '';
  $('hc-s-track').textContent = (TRACK_TEXT[hc.track] || '') + (hc.track === 'on' ? ` · ${hc.fps} kare/sn` + (hc.handed ? ' · ' + hc.handed : '') : '');
  $('hc-s-gest').textContent = hc.track === 'on' ? hc.gestureText : '—';
  $('hc-b-cam').textContent = on ? 'Kamerayı kapat' : 'Kamerayı aç ve başlat'; $('hc-b-cam').classList.toggle('bad', on); $('hc-b-cam').classList.toggle('on', !on);
  $('hc-b-draw').textContent = hc.drawing ? 'Parmakla çizim: AÇIK' : 'Parmakla çizim: KAPALI (yalnız imleç)'; $('hc-b-draw').classList.toggle('on', hc.drawing); $('hc-b-draw').setAttribute('aria-pressed', String(hc.drawing));
  $('hc-sens').value = String(hc.sens); $('hc-sens-v').textContent = String(hc.sens);
  $('hc-b-calib').textContent = hc.calib ? 'Kalibrasyondan vazgeç' : hc.calibrated ? 'Yeniden kalibre et' : 'Kalibre et'; $('hc-b-calib').disabled = hc.track !== 'on';
  $('hc-b-creset').disabled = !hc.calibrated;
  const err = $('hc-err'); err.hidden = !hc.error; err.textContent = hc.error;
  const msg = $('hc-msg'); msg.hidden = hc.supported || !!hc.error; if (!msg.hidden) msg.textContent = window.isSecureContext ? 'Bu tarayıcı kamerayı desteklemiyor.' : 'Kamera yalnız güvenli bağlantıda (https) açılabilir.';
  if (hc.track === 'on' && !wasOn) toast('Parmakla kontrol açık. İşaret parmağınla imleci gezdir; başparmağınla birleştirince çizer.', 6000);
  wasOn = hc.track === 'on';
  if (hc.calib && hc.calib.step === 2 && paint.step !== 2) toast('Şimdi SAĞ ALT köşeye götür ve parmaklarını birleştir.', 7000);
  paint.step = hc.calib ? hc.calib.step : 0;
}

/* ---------- her kare: imleç + önizlemede 21 nokta ---------- */
let lastStat = 0;
function frame() {
  const c = hc.cursor;
  cursor.hidden = !(hc.track === 'on' && c.visible);
  if (!cursor.hidden) { cursor.style.transform = `translate(${c.x}px, ${c.y}px)`; cursor.dataset.g = hc.calib ? 'calib' : hc.gesture; }
  if (dock.hidden) return;
  const w = pre.clientWidth, h = pre.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  const g = canvas.getContext('2d'); g.clearRect(0, 0, canvas.width, canvas.height);
  const lm = hc.landmarks;
  if (lm) {
    // video "cover" ile kırpılır: aynı dönüşüm noktalara uygulanır
    const va = hc.camera.aspect, ca = w / h, sx = va > ca ? va / ca : 1, sy = va > ca ? 1 : ca / va;
    const P = (p) => { const x = hc.camera.mirror ? 1 - p.x : p.x; return [((x - 0.5) * sx + 0.5) * canvas.width, ((p.y - 0.5) * sy + 0.5) * canvas.height]; };
    g.lineWidth = 1.5 * dpr; g.strokeStyle = '#4ed7af'; g.beginPath();
    for (const [a, b] of CONNECTIONS) { const A = P(lm[a]), B = P(lm[b]); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); }
    g.stroke();
    for (let i = 0; i < lm.length; i++) { const q = P(lm[i]), big = i === LM.THUMB_TIP || i === LM.INDEX_TIP; g.fillStyle = big ? (hc.gesture === 'pinch' ? '#f0a43a' : '#fff') : '#4ed7af'; g.beginPath(); g.arc(q[0], q[1], (big ? 3.2 : 1.8) * dpr, 0, 6.2832); g.fill(); }
  }
  const now = performance.now(); if (now - lastStat > 500) { lastStat = now; paint(); }
}

hc.addEventListener('change', paint);
hc.addEventListener('frame', frame);
hc.addEventListener('note', () => { if (hc.note) toast(hc.note); });
paint();

// testler ve ileride eklenecek özel hareketler için: window.__hand.engine.addGesture(...), window.__hand.onGesture(id, fn)
window.__hand = hc;
