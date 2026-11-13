// Parmakla kontrol — kamera. Yalnız kullanıcı düğmeye bastığında açılır; görüntü kaydedilmez, hiçbir yere gönderilmez.
// stop(): bütün kamera izleri durdurulur ve video öğesi boşaltılır (kamera ışığı söner).

export function cameraSupported(win = window) {
  return !!(win.isSecureContext && win.navigator && win.navigator.mediaDevices && typeof win.navigator.mediaDevices.getUserMedia === 'function');
}

// Tarayıcı hatası → kullanıcının anlayacağı açıklama
export function cameraErrorText(err, win = window) {
  if (!win.isSecureContext) return 'Kamera yalnız güvenli bağlantıda (https) açılabilir.';
  if (!win.navigator || !win.navigator.mediaDevices || !win.navigator.mediaDevices.getUserMedia) return 'Bu tarayıcı kamerayı desteklemiyor. Güncel Chrome, Edge, Firefox ya da Safari kullanın.';
  const n = err && err.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') return 'Kamera izni verilmedi. Tarayıcının adres çubuğundaki kamera simgesinden izin verip yeniden deneyin.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return 'Bu cihazda kullanılabilir kamera bulunamadı.';
  if (n === 'NotReadableError' || n === 'AbortError' || n === 'TrackStartError') return 'Kamera açılamadı. Başka bir uygulama kamerayı kullanıyor olabilir; onu kapatıp yeniden deneyin.';
  return 'Kamera açılamadı' + (err && err.message ? ': ' + err.message : '.');
}

export class Camera {
  constructor(video) { this.video = video; this.stream = null; this.onEnded = null; }
  get active() { return !!this.stream; }
  get mirror() { return this._mirror !== false; }
  get aspect() { const v = this.video; return v.videoWidth && v.videoHeight ? v.videoWidth / v.videoHeight : 4 / 3; }

  async start() {
    if (this.stream) return;
    if (!cameraSupported(this.video.ownerDocument.defaultView)) throw new Error(cameraErrorText(null, this.video.ownerDocument.defaultView));
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30, max: 30 } } });
    } catch (e) { const x = new Error(cameraErrorText(e)); x.cause = e; throw x; }
    this.stream = stream;
    const track = stream.getVideoTracks()[0];
    const facing = track && track.getSettings ? track.getSettings().facingMode : null;
    this._mirror = facing !== 'environment';              // arka kamera aynalanmaz
    if (track) track.addEventListener('ended', () => { if (this.stream === stream && this.onEnded) this.onEnded(); });   // kamera çıkarıldı / izin geri alındı
    const v = this.video;
    v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = stream;
    try {
      await v.play();
      if (!v.videoWidth) await new Promise((ok, no) => { const t = setTimeout(() => no(new Error('Kameradan görüntü gelmiyor.')), 8000); v.addEventListener('loadeddata', () => { clearTimeout(t); ok(); }, { once: true }); });
    } catch (e) { this.stop(); throw e; }
  }

  stop() {
    const s = this.stream; this.stream = null;
    if (s) for (const t of s.getTracks()) { try { t.stop(); } catch (e) { /* */ } }
    const v = this.video;
    try { v.pause(); } catch (e) { /* */ }
    v.srcObject = null; v.removeAttribute('src');
    try { v.load(); } catch (e) { /* */ }
  }
}
