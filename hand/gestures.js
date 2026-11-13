// Parmakla kontrol — saf hesap çekirdeği (DOM yok, kamera yok; Node'da testlenir: tests/hand.test.mjs).
// Girdi: MediaPipe Hand Landmarker'ın 21 el noktası (0..1 normalize x, y). Çıktı: imleç konumu + soyut işaretçi olayları.
// Kaynak fikirler fingermouse (Python) projesinden alındı, kod buraya göre yeniden yazıldı:
//   - parmak birleştirme oranı avuç genişliğine bölünür (kameraya uzaklıktan bağımsız)
//   - giriş / çıkış eşiği ayrı (histerezis): sınırda titreyen el çizgiyi koparmaz
// Buraya özgü ekler: en-boy düzeltmesi, 1€ süzgeci, sıçrama süzgeci, birleştirme anında nişan noktası, dokunma sabitleyici.

/* ---------- 21 el noktası (MediaPipe sırası) ---------- */
export const LM = { WRIST: 0, THUMB_IP: 3, THUMB_TIP: 4, INDEX_MCP: 5, INDEX_PIP: 6, INDEX_TIP: 8, MIDDLE_MCP: 9, MIDDLE_PIP: 10, MIDDLE_TIP: 12, RING_PIP: 14, RING_TIP: 16, PINKY_MCP: 17, PINKY_PIP: 18, PINKY_TIP: 20 };
export const LM_COUNT = 21;
// önizlemede iskelet çizimi için bağlantılar
export const CONNECTIONS = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]];

const px = (p) => (Array.isArray(p) ? p[0] : p.x);
const py = (p) => (Array.isArray(p) ? p[1] : p.y);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 21 nokta, hepsi sonlu sayı mı? (bozuk kare işlenmez)
export function validHand(lm) {
  if (!lm || lm.length !== LM_COUNT) return false;
  for (const p of lm) if (!p || !Number.isFinite(px(p)) || !Number.isFinite(py(p))) return false;
  return true;
}

/* ---------- el ölçüleri ---------- */
// aspect = görüntü genişliği / yüksekliği. Normalize x ve y farklı ölçeklidir; uzaklıklar görüntü yüksekliği biriminde hesaplanır.
export function dist(a, b, aspect = 1) { return Math.hypot((px(a) - px(b)) * aspect, py(a) - py(b)); }

// El boyu: avuç genişliği ile bilek → orta parmak kökü uzaklığının büyüğü (el yan dönünce avuç genişliği küçülür).
export function handSize(lm, aspect = 1) {
  return Math.max(0.02, dist(lm[LM.INDEX_MCP], lm[LM.PINKY_MCP], aspect), dist(lm[LM.WRIST], lm[LM.MIDDLE_MCP], aspect) * 0.75);
}
// başparmak ucu ↔ parmak ucu uzaklığı / el boyu
export function pinchRatio(lm, tip = LM.INDEX_TIP, aspect = 1) { return dist(lm[LM.THUMB_TIP], lm[tip], aspect) / handSize(lm, aspect); }
// parmak açık: ucu bileğe, orta ekleminden belirgin daha uzak
export function extended(lm, tip, pip, aspect = 1) { return dist(lm[LM.WRIST], lm[tip], aspect) > dist(lm[LM.WRIST], lm[pip], aspect) * 1.1; }

export function fingerState(lm, aspect = 1) {
  return {
    index: extended(lm, LM.INDEX_TIP, LM.INDEX_PIP, aspect),
    middle: extended(lm, LM.MIDDLE_TIP, LM.MIDDLE_PIP, aspect),
    ring: extended(lm, LM.RING_TIP, LM.RING_PIP, aspect),
    pinky: extended(lm, LM.PINKY_TIP, LM.PINKY_PIP, aspect),
    pinch: pinchRatio(lm, LM.INDEX_TIP, aspect),
  };
}

// Konum, ölçek ve dönmeden bağımsız 42 boyutlu özellik vektörü (ileride öğretilen özel hareketler için).
export function gestureFeatures(lm, aspect = 1) {
  const wx = px(lm[0]) * aspect, wy = py(lm[0]);
  const s = handSize(lm, aspect);
  const ang = Math.atan2(py(lm[LM.MIDDLE_MCP]) - wy, px(lm[LM.MIDDLE_MCP]) * aspect - wx);
  const c = Math.cos(-ang), sn = Math.sin(-ang), out = [];
  for (const p of lm) { const dx = (px(p) * aspect - wx) / s, dy = (py(p) - wy) / s; out.push(dx * c - dy * sn, dx * sn + dy * c); }
  return out;
}

/* ---------- süzgeçler ---------- */
// Giriş eşiği < çıkış eşiği: değer ikisinin arasında gidip gelirken durum değişmez.
export class Hysteresis {
  constructor(enter, exit) { if (!(enter < exit)) throw new Error('giriş eşiği çıkış eşiğinden küçük olmalı'); this.enter = enter; this.exit = exit; this.active = false; }
  update(v) { if (this.active && v > this.exit) this.active = false; else if (!this.active && v < this.enter) this.active = true; return this.active; }
  reset() { this.active = false; }
}

// 1€ süzgeci (Casiez ve ark.): yavaş harekette güçlü yumuşatma (titreme gider), hızlı harekette az gecikme.
export class OneEuro {
  constructor(minCutoff = 1, beta = 0.006, dCutoff = 1) { this.minCutoff = minCutoff; this.beta = beta; this.dCutoff = dCutoff; this.reset(); }
  reset() { this.x = null; this.dx = 0; this.t = null; }
  static alpha(cutoff, dt) { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau / dt); }
  filter(v, tMs) {
    if (this.x === null || this.t === null) { this.x = v; this.dx = 0; this.t = tMs; return v; }
    const dt = clamp((tMs - this.t) / 1000, 0.001, 0.2); this.t = tMs;
    const d = (v - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * (d - this.dx);
    this.x += OneEuro.alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
}

/* ---------- kamera → ekran eşlemesi ---------- */
// Hassasiyet 1..10: büyük değer = küçük el hareketi ekranın tamamını dolaşır (kullanılan kamera alanı küçülür).
export function sensitivityBox(sens) {
  const s = clamp(Number(sens) || 5, 1, 10), size = 0.9 - (s - 1) * (0.55 / 9);   // 0.90 → 0.35
  return { x0: 0.5 - size / 2, y0: 0.5 - size / 2, x1: 0.5 + size / 2, y1: 0.5 + size / 2 };
}
// Kutuyu merkezi etrafında ölçekle (kalibrasyon kutusu + hassasiyet birlikte kullanılırken).
export function scaleBox(b, k) {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, w = (b.x1 - b.x0) * k / 2, h = (b.y1 - b.y0) * k / 2;
  return { x0: cx - w, y0: cy - h, x1: cx + w, y1: cy + h };
}
export function validBox(b) { return !!b && [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite) && b.x1 - b.x0 >= 0.08 && b.y1 - b.y0 >= 0.08; }
// Normalize kamera noktası → ekran pikseli. mirror: ön kamera (ayna görüntüsü; el sağa gidince imleç sağa gider).
export function mapPoint(x, y, box, vw, vh, mirror = true) {
  const xm = mirror ? 1 - x : x;
  return [clamp((xm - box.x0) / (box.x1 - box.x0), 0, 1) * vw, clamp((y - box.y0) / (box.y1 - box.y0), 0, 1) * vh];
}

/* ---------- hareket tanımları (modüler) ---------- */
// Her hareket: { id, label, test(ctx) → boolean }. ctx = { lm, aspect, f: fingerState, features() }.
// Yerleşikler aşağıda; yenisi engine.addGesture({ id, label, test, holdMs }) ile eklenir, tutulunca { type: 'gesture', id } olayı çıkar.
export const PALM_MIN_PINCH = 0.6;
export const BUILTIN = {
  palm: { id: 'palm', label: 'Açık avuç', test: ({ f }) => f.index && f.middle && f.ring && f.pinky && f.pinch > PALM_MIN_PINCH },
  two: { id: 'two', label: 'İki parmak', test: ({ f }) => f.index && f.middle && !f.ring && !f.pinky },
  point: { id: 'point', label: 'İşaret parmağı', test: ({ f }) => f.index },
};

export const DEFAULTS = {
  pinchEnter: 0.28, pinchExit: 0.42,   // birleştirme / ayırma eşiği (el boyuna oran)
  preZone: 0.62,                       // bu oranın üstünde parmaklar açık sayılır: nişan noktası burada kaydedilir
  preZoneMs: 500,                      // birleştirme bu süre içinde gelirse çizim nişan noktasından başlar
  pinchOnMs: 40, pinchOffMs: 90,       // çizim başlatma / bitirme için gereken kararlı süre (kopmayı önler)
  palmMs: 160, twoMs: 120,             // açık avuç / iki parmak için gereken kararlı süre
  lostMs: 300,                         // el bu kadar süre görünmezse basılı işaretçi bırakılır
  tapSlop: 12,                         // px: basıldıktan sonra bu kadar oynama dokunma sayılır (imleç yerinde kalır)
  jump: 0.35, jumpFrames: 2,           // ekran köşegeninin oranı: tek karede daha büyük sıçrama en çok bu kadar kare yok sayılır
  offAbsorb: 0.5,                      // imleç kayması, el hareketinin bu oranı kadar erir
  scrollStep: 0.035,                   // iki parmakla dikey hareket: her adımda bir tekerlek çentiği
  minCutoff: 1, beta: 0.006,
};

/* ---------- motor ---------- */
// update(lm | null, tMs, view) → { events, x, y, visible, down, gesture, paused }
//   view = { w, h (ekran px), aspect (kamera en / boy), mirror }
//   events: { type: 'move' | 'down' | 'up' | 'cancel', x, y } | { type: 'scroll', x, y, dir: ±1 } | { type: 'gesture', id }
export class HandEngine {
  constructor(opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.sens = 5; this.calib = null; this.calibSens = 5;
    this.drawing = true;                // false: imleç gezer ama birleştirme basmaz
    this.custom = [];
    this.pinch = new Hysteresis(this.o.pinchEnter, this.o.pinchExit);
    this.fx = new OneEuro(this.o.minCutoff, this.o.beta); this.fy = new OneEuro(this.o.minCutoff, this.o.beta);
    this.reset();
  }
  reset() {
    this.pinch.reset(); this.fx.reset(); this.fy.reset();
    this.down = false; this.gesture = 'none'; this.visible = false;
    this.x = 0; this.y = 0; this.off = [0, 0];
    this.raw = null; this.ps = null; this.skipped = 0; this.lostAt = null;
    this.pinchSince = null; this.openSince = null; this.cand = null; this.candSince = 0; this.mode = 'idle';
    this.aim = null; this.downAt = null; this.sticky = false; this.scrollY = null; this.scrollAcc = 0;
    this.fired = null;
  }
  setSensitivity(s) { this.sens = clamp(Number(s) || 5, 1, 10); }
  setCalibration(box) { if (validBox(box)) { this.calib = { ...box }; this.calibSens = this.sens; } else this.calib = null; }
  setDrawing(on) { this.drawing = !!on; }
  addGesture(g) { if (!g || !g.id || typeof g.test !== 'function') throw new Error('hareket: { id, test } gerekli'); this.custom = this.custom.filter((c) => c.id !== g.id).concat([{ holdMs: 400, label: g.id, ...g }]); }
  removeGesture(id) { this.custom = this.custom.filter((c) => c.id !== id); }
  box() {
    if (!this.calib) return sensitivityBox(this.sens);
    const a = sensitivityBox(this.sens), b = sensitivityBox(this.calibSens);
    return scaleBox(this.calib, (a.x1 - a.x0) / (b.x1 - b.x0));
  }

  // basılı işaretçiyi bırak (el kayboldu, duraklatıldı, kamera kapandı)
  release(events, cancel = false) {
    if (this.down) { events.push({ type: cancel ? 'cancel' : 'up', x: this.x, y: this.y }); this.down = false; }
    this.pinch.reset(); this.pinchSince = null; this.openSince = null; this.downAt = null; this.sticky = false; this.aim = null;
  }

  update(lm, tMs, view) {
    const ev = [], o = this.o;
    const out = () => ({ events: ev, x: this.x, y: this.y, visible: this.visible, down: this.down, gesture: this.gesture, paused: this.gesture === 'palm' });
    if (!validHand(lm)) {
      if (this.lostAt === null) this.lostAt = tMs;
      if (tMs - this.lostAt >= o.lostMs && this.gesture !== 'lost') {
        this.release(ev); this.fx.reset(); this.fy.reset(); this.raw = null; this.ps = null; this.off = [0, 0]; this.scrollY = null; this.cand = null; this.mode = 'idle'; this.fired = null;
        this.gesture = 'lost'; this.visible = false;
      }
      return out();
    }
    this.lostAt = null; this.visible = true;
    const aspect = view.aspect || 4 / 3, f = fingerState(lm, aspect);
    const ctx = { lm, aspect, f, features: () => gestureFeatures(lm, aspect) };

    /* --- birleştirme (histerezis + kararlı süre) --- */
    const pin = this.pinch.update(f.pinch);
    if (pin) { this.openSince = null; if (this.pinchSince === null) this.pinchSince = tMs; } else { this.pinchSince = null; if (this.openSince === null) this.openSince = tMs; }
    const wantDown = this.drawing && pin && tMs - this.pinchSince >= o.pinchOnMs;
    const wantUp = !pin && tMs - this.openSince >= o.pinchOffMs;

    /* --- el duruşu: kararlı kalınca kip değişir --- */
    const pose = BUILTIN.palm.test(ctx) ? 'palm' : BUILTIN.two.test(ctx) ? 'two' : BUILTIN.point.test(ctx) ? 'point' : 'idle';
    if (pose !== this.cand) { this.cand = pose; this.candSince = tMs; }
    const need = pose === 'palm' ? o.palmMs : pose === 'two' ? o.twoMs : 0;
    if (tMs - this.candSince >= need) this.mode = pose;
    if (pin || this.down) this.mode = this.down || wantDown ? 'pinch' : this.mode === 'palm' || this.mode === 'two' ? 'point' : this.mode;

    /* --- ham konum → ekran, sıçrama süzgeci, yumuşatma --- */
    const tip = lm[LM.INDEX_TIP];
    let [rx, ry] = mapPoint(px(tip), py(tip), this.box(), view.w, view.h, view.mirror !== false);
    if (this.raw && Math.hypot(rx - this.raw[0], ry - this.raw[1]) > o.jump * Math.hypot(view.w, view.h) && this.skipped < o.jumpFrames) {
      this.skipped++; [rx, ry] = this.raw;                     // tek karelik yanlış algılama: önceki konum korunur
    } else { if (this.skipped) { this.fx.reset(); this.fy.reset(); } this.skipped = 0; this.raw = [rx, ry]; }
    let sx = this.fx.filter(rx, tMs), sy = this.fy.filter(ry, tMs);
    // süzgeci ham konuma oturt: basma / bırakma anında süzgecin gecikmesi sonradan imleç kayması olarak görünmesin
    const snap = () => { this.fx.reset(); this.fy.reset(); sx = this.fx.filter(rx, tMs); sy = this.fy.filter(ry, tMs); };

    /* --- imleç: kayma (off) duraklatma / basma anlarında sürekliliği sağlar --- */
    const moving = this.mode === 'point' || this.mode === 'pinch';
    const first = this.gesture === 'none' || this.gesture === 'lost';
    let cx = this.x, cy = this.y;
    if (first) { this.off = [0, 0]; cx = sx; cy = sy; }
    else if (moving) {
      if (this.down && !pin) this.off = [this.x - sx, this.y - sy];   // parmaklar açılıyor: bırakma kesinleşene dek imleç durur (çizgi sonunda çengel olmaz)
      else if (!this.down) {
        // kayma, elin hareketi kadar erir: el dururken imleç kendiliğinden kaymaz
        const n = Math.hypot(this.off[0], this.off[1]), m = this.ps ? Math.hypot(sx - this.ps[0], sy - this.ps[1]) : 0;
        if (n > 0) { const r = Math.max(0, n - o.offAbsorb * m) / n; this.off = [this.off[0] * r, this.off[1] * r]; }
      }
      cx = sx + this.off[0]; cy = sy + this.off[1];
    } else this.off = [this.x - sx, this.y - sy];   // duraklatma / kaydırma / yumruk: imleç durur, dönüşte sıçramaz
    this.ps = [sx, sy];
    cx = clamp(cx, 0, view.w); cy = clamp(cy, 0, view.h);

    /* --- basma --- */
    if (!this.down && wantDown && moving) {
      // parmaklar kapanırken işaret parmağı ucu kayar: çizim, parmaklar açıkken nişan alınan son noktadan başlar
      if (this.aim && tMs - this.aim.t <= o.preZoneMs) { cx = this.aim.x; cy = this.aim.y; }
      snap(); this.off = [cx - sx, cy - sy];
      if (first || Math.hypot(cx - this.x, cy - this.y) >= 0.5) ev.push({ type: 'move', x: cx, y: cy });
      this.x = cx; this.y = cy; this.down = true; this.downAt = [cx, cy]; this.sticky = true;
      ev.push({ type: 'down', x: cx, y: cy });
    }
    if (this.down && this.sticky) {
      // dokunma sabitleyici: küçük oynama yok sayılır (dokunma tam basılan noktada kalır); eşik aşılınca imleç parmağı izler
      if (Math.hypot(cx - this.downAt[0], cy - this.downAt[1]) <= o.tapSlop) { cx = this.downAt[0]; cy = this.downAt[1]; }
      else this.sticky = false;
    }
    if (Math.hypot(cx - this.x, cy - this.y) >= 0.5 || (first && !this.down)) { this.x = cx; this.y = cy; ev.push({ type: 'move', x: cx, y: cy }); }
    if (this.down && (wantUp || !this.drawing)) { this.release(ev); snap(); this.off = [this.x - sx, this.y - sy]; }
    if (!this.down && moving && f.pinch > o.preZone) this.aim = { x: this.x, y: this.y, t: tMs };

    /* --- iki parmak: dikey hareket → kaydırma / yakınlaştırma çentikleri --- */
    if (this.mode === 'two' && !this.down) {
      const yy = (py(lm[LM.INDEX_TIP]) + py(lm[LM.MIDDLE_TIP])) / 2;
      if (this.scrollY !== null && Math.abs(yy - this.scrollY) < 0.4) {
        this.scrollAcc += yy - this.scrollY;
        while (Math.abs(this.scrollAcc) >= o.scrollStep) { const dir = Math.sign(this.scrollAcc); this.scrollAcc -= dir * o.scrollStep; ev.push({ type: 'scroll', x: this.x, y: this.y, dir }); }
      }
      this.scrollY = yy;
    } else { this.scrollY = null; this.scrollAcc = 0; }

    /* --- özel hareketler: tutulunca bir kez tetiklenir --- */
    if (this.custom.length && !this.down) {
      const hit = this.custom.find((g) => { try { return !!g.test(ctx); } catch (e) { return false; } });
      if (!hit) this.fired = null;
      else if (!this.fired || this.fired.id !== hit.id) this.fired = { id: hit.id, t: tMs, done: false };
      else if (!this.fired.done && tMs - this.fired.t >= hit.holdMs) { this.fired.done = true; ev.push({ type: 'gesture', id: hit.id }); }
    }

    this.gesture = this.down ? 'pinch' : this.mode === 'pinch' ? 'point' : this.mode;
    return out();
  }
}

/* ---------- kalibrasyon: iki köşe → kullanılan kamera alanı ---------- */
// a, b: kullanıcının sol üst ve sağ alt köşede parmak birleştirdiği andaki işaret parmağı ucu (normalize, ham).
export function boxFromCorners(a, b, mirror = true) {
  const ax = mirror ? 1 - a[0] : a[0], bx = mirror ? 1 - b[0] : b[0];
  const box = { x0: Math.min(ax, bx), y0: Math.min(a[1], b[1]), x1: Math.max(ax, bx), y1: Math.max(a[1], b[1]) };
  return validBox(box) ? box : null;
}

export const GESTURE_LABEL = { none: 'El bekleniyor', lost: 'El bekleniyor', point: 'İmleç', pinch: 'Çizim', palm: 'Duraklatıldı (açık avuç)', two: 'Kaydırma (iki parmak)', idle: 'Bekliyor' };
