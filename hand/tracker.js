// Parmakla kontrol — el algılama bağdaştırıcısı: MediaPipe Hand Landmarker (21 el noktası), tarayıcıda WebAssembly ile.
// Model ve kütüphane depodaki vendor/ kopyalarından yüklenir (dış siteden kod / model indirilmez); görüntü cihazdan çıkmaz.
// Başka bir algılayıcı (ör. yerel Android / Windows eklentisi) aynı arayüzle yazılabilir: { load(), detect(video, tMs) → { landmarks, handedness } | null, close() }.

export const MP_VERSION = '0.10.33';
const BASE = new URL(`../vendor/@mediapipe/tasks-vision@${MP_VERSION}/`, import.meta.url).href;
const MODEL = new URL('../vendor/mediapipe-models/hand_landmarker.task', import.meta.url).href;

export class MediaPipeTracker {
  constructor() { this.lm = null; this.delegate = null; this.lastTs = -1; }

  async load() {
    if (this.lm) return;
    let mp;
    try { mp = await import(BASE + 'vision_bundle.mjs'); }
    catch (e) { const x = new Error('El algılama kütüphanesi yüklenemedi (vendor/@mediapipe).'); x.cause = e; throw x; }
    const files = { wasmLoaderPath: BASE + 'wasm/vision_wasm_internal.js', wasmBinaryPath: BASE + 'wasm/vision_wasm_internal.wasm' };
    const opts = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 1,
      minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.55, minTrackingConfidence: 0.55,
    });
    let err = null;
    for (const d of ['GPU', 'CPU']) {                       // ekran kartı hızlandırması yoksa işlemciye düş
      try { this.lm = await mp.HandLandmarker.createFromOptions(files, opts(d)); this.delegate = d; return; }
      catch (e) { err = e; }
    }
    const x = new Error('El algılama modeli başlatılamadı' + (err && err.message ? ': ' + err.message : '.')); x.cause = err; throw x;
  }

  // Video karesinde el ara. Zaman damgası kesin artan olmalı.
  detect(video, tMs) {
    if (!this.lm || !video.videoWidth) return null;
    const ts = Math.max(Math.round(tMs), this.lastTs + 1); this.lastTs = ts;
    const r = this.lm.detectForVideo(video, ts);
    if (!r || !r.landmarks || !r.landmarks.length) return null;
    const h = r.handedness && r.handedness[0] && r.handedness[0][0];
    return { landmarks: r.landmarks[0], handedness: h ? h.categoryName : null, score: h ? h.score : null };
  }

  close() {
    if (this.lm) { try { this.lm.close(); } catch (e) { /* */ } }
    this.lm = null; this.lastTs = -1;
  }
}
