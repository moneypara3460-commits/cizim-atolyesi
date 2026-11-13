// Parmakla kontrol — yönetici: kamera + el algılama + hareket motoru + yapay işaretçi.
// Arayüz (ui.js) bu sınıfı kullanır; durum değişince 'change', her karede 'frame' olayı yayar.
import { HandEngine, boxFromCorners, validBox, LM, GESTURE_LABEL } from './gestures.js?v=20261113a';
import { SyntheticPointer } from './pointer.js?v=20261113a';
import { Camera, cameraSupported, cameraErrorText } from './camera.js?v=20261113a';
import { MediaPipeTracker } from './tracker.js?v=20261113a';

const KEY = 'cizim:hand';
const MIN_FRAME_MS = 25;          // en çok ~30 kare/sn işlenir (işlemci / pil); 60 kare/sn kamerada her kare işlenmez
const MAX_ERRORS = 8;
const SLOW_MS = 120, SLOW_FRAMES = 4;   // ekran kartıyla algılama bu kadar yavaşsa (yazılımsal WebGL, zayıf GPU) işlemciye geçilir

function loadPrefs() {
  try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object') return j; } catch (e) { /* */ }
  return {};
}

export class HandControl extends EventTarget {
  constructor({ video, tracker } = {}) {
    super();
    const p = loadPrefs();
    this.video = video;
    this.camera = new Camera(video);
    this.camera.onEnded = () => this.fail('Kamera bağlantısı kesildi.');
    this.tracker = tracker || new MediaPipeTracker();
    this.engine = new HandEngine();
    this.pointer = new SyntheticPointer(document);
    this.sens = Math.max(1, Math.min(10, Number(p.sens) || 5));
    this.drawing = p.draw !== false;
    this.engine.setSensitivity(this.sens);
    this.engine.setDrawing(this.drawing);
    this.calibSens = Number(p.boxSens) || this.sens;
    if (validBox(p.box)) { this.engine.setSensitivity(this.calibSens); this.engine.setCalibration(p.box); this.engine.setSensitivity(this.sens); }
    // durum
    this.cam = 'off';              // off | starting | on | error
    this.track = 'off';            // off | loading | on | error
    this.error = '';
    this.gesture = 'none'; this.handed = null; this.fps = 0; this.landmarks = null;
    this.cursor = { x: 0, y: 0, visible: false, down: false };
    this.calib = null;             // kalibrasyon sürerken: { step: 1 | 2, a }
    this.gestureHandlers = new Map();
    this.run = 0; this.raf = 0; this.vfc = 0; this.lastDetect = 0; this.lastVideoTime = -1; this.errors = 0; this.fpsT = []; this.wasPinch = false; this.slow = 0; this.seen = 0;
    this.onVisibility = () => { if (document.hidden) this.idle(); };
    this.onPageHide = () => this.stop();
  }

  get supported() { return cameraSupported(); }
  get active() { return this.cam === 'on' || this.cam === 'starting'; }
  get calibrated() { return !!this.engine.calib; }
  get gestureText() { return this.calib ? (this.calib.step === 1 ? 'Kalibrasyon: sol üst köşe' : 'Kalibrasyon: sağ alt köşe') : GESTURE_LABEL[this.gesture] || ''; }
  emit(type = 'change') { this.dispatchEvent(new Event(type)); }
  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ sens: this.sens, draw: this.drawing, box: this.engine.calib || null, boxSens: this.engine.calib ? this.engine.calibSens : null })); } catch (e) { /* gizli sekme vb.: ayar yalnız bu oturumda geçerli */ }
  }

  /* ---- aç / kapat ---- */
  async start() {
    if (this.active) return;
    const run = ++this.run;
    this.error = ''; this.cam = 'starting'; this.track = 'off'; this.emit();
    try {
      await this.camera.start();                       // izin burada istenir; izin yoksa hiçbir şey yüklenmez
      if (run !== this.run) { this.camera.stop(); return; }
      this.cam = 'on'; this.track = 'loading'; this.emit();
      await this.tracker.load();
      if (run !== this.run) return;
      this.track = 'on';
      this.engine.reset(); this.errors = 0; this.lastVideoTime = -1; this.fpsT = []; this.slow = 0; this.seen = 0;
      this.pointer.install();
      document.addEventListener('visibilitychange', this.onVisibility);
      window.addEventListener('pagehide', this.onPageHide);
      this.emit();
      this.schedule(run);
    } catch (e) {
      if (run !== this.run) return;
      this.fail(e && e.message ? e.message : cameraErrorText(e));
    }
  }

  // Her şeyi durdur: döngü, kamera izleri, model, işaretçi yaması. Yeniden start() ile açılabilir.
  stop() {
    this.run++;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.vfc && this.video.cancelVideoFrameCallback) this.video.cancelVideoFrameCallback(this.vfc);
    this.raf = 0; this.vfc = 0;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('pagehide', this.onPageHide);
    this.idle();
    this.pointer.uninstall();
    this.tracker.close();
    this.camera.stop();
    this.engine.reset();
    this.cam = 'off'; this.track = 'off'; this.gesture = 'none'; this.handed = null; this.fps = 0; this.landmarks = null; this.calib = null;
    this.cursor = { x: 0, y: 0, visible: false, down: false };
    this.emit(); this.emit('frame');
  }
  fail(msg) { this.stop(); this.cam = 'error'; this.error = msg; this.emit(); }

  // basılı işaretçiyi bırak (sekme arka plana geçti, kalibrasyon başladı vb.)
  idle() {
    const ev = []; this.engine.release(ev);
    for (const e of ev) this.apply(e);
    if (this.pointer.down) this.pointer.release(this.pointer.x, this.pointer.y);
    this.cursor.down = false;
  }

  /* ---- ayarlar ---- */
  setDrawing(on) { this.drawing = !!on; this.engine.setDrawing(this.drawing); if (!this.drawing) this.idle(); this.save(); this.emit(); }
  setSensitivity(s) { this.sens = Math.max(1, Math.min(10, Math.round(Number(s) || 5))); this.engine.setSensitivity(this.sens); this.save(); this.emit(); }
  onGesture(id, fn) { this.gestureHandlers.set(id, fn); }

  // Kalibrasyon: kullanıcı rahat çalıştığı alanın sol üst, sonra sağ alt köşesinde parmaklarını birleştirir.
  startCalibration() { if (this.track !== 'on') return; this.idle(); this.calib = { step: 1, a: null }; this.wasPinch = true; this.emit(); }
  cancelCalibration() { this.calib = null; this.emit(); }
  resetCalibration() { this.calib = null; this.engine.setCalibration(null); this.save(); this.emit(); }

  /* ---- kare döngüsü ---- */
  schedule(run) {
    const tick = () => { if (run !== this.run) return; this.frame(performance.now()); this.schedule(run); };
    // yeni kamera karesi geldiğinde çalış (aynı kare iki kez işlenmez); destek yoksa ekran yenilemesiyle
    if (this.video.requestVideoFrameCallback && !document.hidden) this.vfc = this.video.requestVideoFrameCallback(tick);
    else this.raf = requestAnimationFrame(tick);
  }
  frame(now) {
    if (document.hidden || this.track !== 'on') return;
    if (now - this.lastDetect < MIN_FRAME_MS) return;
    const v = this.video;
    if (!this.video.requestVideoFrameCallback) { if (v.currentTime === this.lastVideoTime) return; this.lastVideoTime = v.currentTime; }
    this.lastDetect = now;
    let res = null;
    try { res = this.tracker.detect(v, now); this.errors = 0; }
    catch (e) { if (++this.errors >= MAX_ERRORS) { this.fail('El algılama durdu: ' + (e && e.message ? e.message : 'bilinmeyen hata')); return; } }
    const cost = performance.now() - now; this.lastDetect = performance.now();   // sonraki kare, algılama bittikten sonra sayılır (arayüz nefes alsın)
    if (this.tracker.delegate === 'GPU' && this.slow >= 0) {
      this.slow = cost > SLOW_MS ? this.slow + 1 : 0; this.seen++;
      if (this.slow >= SLOW_FRAMES) { this.toCpu(); return; }
      if (this.seen > 40) this.slow = -1;                   // yeterince hızlı: denetim biter
    }
    this.fpsT.push(now); while (this.fpsT.length && now - this.fpsT[0] > 1000) this.fpsT.shift();
    this.fps = this.fpsT.length;
    this.feed(res ? res.landmarks : null, now, res ? res.handedness : null);
  }

  // Ekran kartıyla algılama çok yavaş: modeli işlemciyle (WebAssembly) yeniden kur. Kamera açık kalır.
  async toCpu() {
    const run = this.run; this.slow = -1;
    this.idle(); this.track = 'loading'; this.emit();
    try { this.tracker.close(); await this.tracker.load('CPU'); }
    catch (e) { if (run === this.run) this.fail(e && e.message ? e.message : 'El algılama başlatılamadı.'); return; }
    if (run !== this.run) return;
    this.engine.reset(); this.fpsT = []; this.track = 'on'; this.emit();
  }

  // Bir karenin el noktalarını işle. (Algılayıcıdan gelir; testler de aynı kapıdan yapay el verir.)
  feed(landmarks, now = performance.now(), handedness = null) {
    this.landmarks = landmarks || null;
    // MediaPipe el etiketini aynalanmış görüntüye göre verir; kamera karesi aynalanmadan işlendiği için etiket ters çevrilir
    this.handed = landmarks ? (handedness === 'Left' ? 'Sağ el' : handedness === 'Right' ? 'Sol el' : 'El') : null;
    const view = { w: window.innerWidth, h: window.innerHeight, aspect: this.camera.aspect, mirror: this.camera.mirror };
    if (this.calib) { this.calibrate(landmarks, now, view); this.emit('frame'); return; }
    const r = this.engine.update(landmarks, now, view);
    for (const e of r.events) this.apply(e);
    const g = this.gesture;
    this.gesture = r.gesture; this.cursor = { x: r.x, y: r.y, visible: r.visible, down: r.down };
    if (g !== this.gesture) this.emit();
    this.emit('frame');
  }
  apply(e) {
    const p = this.pointer;
    if (e.type === 'move') p.move(e.x, e.y);
    else if (e.type === 'down') p.press(e.x, e.y);
    else if (e.type === 'up') p.release(e.x, e.y);
    else if (e.type === 'cancel') p.cancel();
    else if (e.type === 'scroll') p.scroll(e.x, e.y, e.dir);
    else if (e.type === 'gesture') { const fn = this.gestureHandlers.get(e.id); if (fn) { try { fn(e); } catch (x) { console.error(x); } } }
  }
  calibrate(lm, now, view) {
    // motoru çizim kapalı çalıştır: imleç gezer, sayfaya basma gitmez; birleştirme anı köşe olarak alınır
    const draw = this.engine.drawing; this.engine.drawing = false;
    const r = this.engine.update(lm, now, view); this.engine.drawing = draw;
    for (const e of r.events) if (e.type === 'move') this.pointer.move(e.x, e.y);
    this.gesture = r.gesture; this.cursor = { x: r.x, y: r.y, visible: r.visible, down: false };
    const pin = !!lm && this.engine.pinch.active && this.engine.pinchSince !== null && now - this.engine.pinchSince >= 120;
    if (pin && !this.wasPinch) {
      // köşe: parmaklar açıkken nişan alınan son nokta yerine doğrudan işaret parmağı ucu (ham kamera koordinatı)
      const tip = [lm[LM.INDEX_TIP].x, lm[LM.INDEX_TIP].y];
      if (this.calib.step === 1) { this.calib = { step: 2, a: tip }; this.emit(); }
      else {
        const box = boxFromCorners(this.calib.a, tip, view.mirror);
        this.calib = null;
        if (box) { this.engine.setCalibration(box); this.save(); this.note = 'Kalibrasyon kaydedildi.'; }
        else this.note = 'Alan çok dar: iki köşe arasını daha geniş tutup yeniden deneyin.';
        this.emit(); this.emit('note');
      }
    }
    this.wasPinch = pin;
  }
}
