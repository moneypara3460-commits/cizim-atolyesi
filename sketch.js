// Kroki editörü: ekranın üstüne açılan 2D çizim tuvali.
// Çokgen / dikdörtgen / daire çizilir; sonra "kalınlık ver" (ekstrüzyon) ya da "döndür" (devir) yapılır.
// Kullanım: openSketch({ initial, uf, unit, snaps, onDone(draw), onCancel() })
//   draw = { mode:'extrude'|'revolve', plane:'top'|'front', pts:[[u,v],...] (mm), h }
//   top  : u = X, v = Z (ekranda aşağı = +Z)     front: u = X, v = Y (ekranda yukarı = +Y)
//   revolve: her zaman 'front'; dönme ekseni u = 0 çizgisidir, çizim eksenin sağına yapılır.
import { fmtNum, snap, circlePts, rectPts, bboxPts, polyArea, arcPoints, roundedRectPts, pointInPoly, solveCons, freedom, CONS_LABEL } from './logic.js?v=20261111e';

let cssDone = false;
const CSS = `
#sk { position: fixed; inset: 0; z-index: 30; background: #0f172a; color: #fff; display: flex;
      flex-direction: column; font-family: system-ui, -apple-system, Roboto, sans-serif; }
#sk .r { display: flex; gap: 5px; padding: 6px 8px 0; align-items: center; }
#sk button { font: inherit; color: #fff; background: #1e293b; border: 0; border-radius: 8px; padding: 9px 4px;
             font-weight: 600; font-size: 12.5px; flex: 1; min-width: 0; }
#sk button.on { background: #0284c7; }
#sk button.ok { background: #15803d; }
#sk button.danger { background: #7f1d1d; }
#sk button:disabled { opacity: .35; }
#sk .ttl { flex: 2; text-align: center; font-weight: 700; font-size: 15px; }
#sk .hint { font-size: 12px; color: #94a3b8; padding: 5px 10px 0; height: 36px; overflow: hidden; line-height: 15px; }
#sk .hint.err { color: #f87171; }
#sk .cv { position: relative; flex: 1; min-height: 120px; margin-top: 4px; }
#sk canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; display: block; }
#sk .zoom { position: absolute; right: 8px; top: 8px; display: flex; flex-direction: column; gap: 5px; }
#sk .zoom button { width: 40px; flex: none; padding: 8px 0; background: rgba(30,41,59,.9); font-size: 17px; }
#sk label.f { flex: 1 1 70px; display: block; min-width: 0; }
#sk label.f span { display: block; font-size: 11px; color: #94a3b8; margin-bottom: 2px; white-space: nowrap; }
#sk input, #sk select { width: 100%; font: inherit; font-size: 15px; color: #fff; background: #1e293b;
                         border: 0; border-radius: 8px; padding: 7px 9px; }
#sk .r.tools { flex-wrap: wrap; }
#sk .r.tools button { flex: 1 1 30%; }
#sk .bot { padding-bottom: 8px; flex-wrap: wrap; max-height: 34vh; overflow-y: auto; }
#sk .bot button { flex: 1 1 30%; min-width: 90px; padding: 10px 4px; }
#sk .bot .lb { flex: 1 0 100%; font-size: 12px; color: #cbd5e1; font-weight: 700; padding: 4px 2px 0; }
`;

const NICE = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

function orient(a, b, c) { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
function segCross(a, b, c, d) {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  return ((o1 > 1e-9 && o2 < -1e-9) || (o1 < -1e-9 && o2 > 1e-9)) &&
         ((o3 > 1e-9 && o4 < -1e-9) || (o3 < -1e-9 && o4 > 1e-9));
}
// İki döngünün kenarları birbirini kesiyor mu
export function loopsCross(a, b) {
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) if (segCross(p, q, b[j], b[(j + 1) % b.length])) return true;
  }
  return false;
}
// Çokgenin kendini kesip kesmediği
export function selfIntersects(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segCross(a, b, pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}
function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) out.push(p);
  }
  while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= 1e-6) out.pop();
  return out;
}

// Çizimi doğrular; { error } ya da { draw } döner. (Kullanıcı arayüzünden bağımsız, test edilebilir.)
// pts0: tek döngü [[u,v],...] ya da çoklu döngü [[[u,v],...], ...]; çoklu ise en büyük alanlı döngü pts, diğerleri more olur.
export function validateDraw(mode, plane, pts0, h, cons0) {
  const multi = Array.isArray(pts0[0]) && Array.isArray(pts0[0][0]);
  const loops0 = multi ? pts0 : [pts0];
  if (!loops0.length) return { error: 'Önce bir şekil çiz.' };
  const loops = [], consL = [];
  for (const [li, l] of loops0.entries()) {
    const pts = dedupe(l);
    const cl = cons0 && cons0[li] ? cons0[li] : [];
    consL.push(pts.length === l.length ? cl : []); // köşe sayısı değiştiyse kısıtlar geçersiz
    if (pts.length < 3) return { error: 'En az 3 noktalı kapalı bir şekil çiz.' };
    if (Math.abs(polyArea(pts)) < 1e-6) return { error: 'Şeklin alanı sıfır.' };
    if (selfIntersects(pts)) return { error: 'Çizgiler birbirini kesiyor. Noktaları düzelt.' };
    loops.push(pts);
  }
  for (let i = 0; i < loops.length; i++) for (let j = i + 1; j < loops.length; j++) {
    if (loopsCross(loops[i], loops[j])) return { error: 'İki şeklin çizgileri birbirini kesiyor. İç içe ya da ayrı ayrı çiz.' };
  }
  if (mode === 'revolve') {
    if (loops.length > 1) return { error: 'Döndürmede tek şekil olabilir.' };
    const pts = loops[0];
    if (pts.some(([u]) => u < -1e-6)) return { error: 'Döndürmek için şekli dikey eksenin (u = 0) sağına çiz.' };
    const bb = bboxPts(pts);
    if (bb.maxU <= 1e-6 || bb.maxV - bb.minV <= 1e-6) return { error: 'Şekil eksenden uzakta bir yüzey oluşturmalı.' };
    const d = { mode, plane: 'front', pts, h: 0 };
    if (consL[0].length) d.cons = [consL[0]];
    return { draw: d };
  }
  if (!(h > 0)) return { error: 'Kalınlık sıfırdan büyük olmalı.' };
  const order = loops.map((l, i) => i).sort((a, b) => Math.abs(polyArea(loops[b])) - Math.abs(polyArea(loops[a])));
  const draw = { mode: 'extrude', plane, pts: loops[order[0]], h };
  if (loops.length > 1) draw.more = order.slice(1).map((i) => loops[i]);
  if (consL.some((c) => c.length)) draw.cons = order.map((i) => consL[i]);
  return { draw };
}

export function openSketch(opts = {}) {
  const uf = opts.uf || 1, unit = opts.unit || 'mm';
  const snaps = opts.snaps || [1, 5, 10, 25];
  const fmt = (v) => fmtNum(v / uf, 2);

  if (!cssDone) {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
    cssDone = true;
  }

  // ---- durum ----
  const init = opts.initial || null;
  const lock = !!opts.lockPlane; // yüz üzerinde kroki: düzlem ve tür sabit (kalınlık ver)
  let mode = init ? init.mode : 'extrude';
  let plane = init ? init.plane : 'top';
  if (mode === 'revolve') plane = 'front';
  let tool = 'poly';
  let arcEnd = null;        // yay aracı: seçilmiş bitiş noktası (orta nokta bekleniyor)
  // birden çok şekil: iç içe olanlar delik olur. shape = etkin şekil (shapes içinde)
  const polyShape = (pts, closed, cons) => ({ kind: 'poly', pts, closed, marks: [], cons: cons || [] });
  let shapes = init ? [init.pts, ...(init.more || [])].map((l, i) => polyShape(l.map((q) => q.slice()), true, init.cons && init.cons[i] ? JSON.parse(JSON.stringify(init.cons[i])) : [])) : [];
  let csel = { edges: [], vtx: null };   // kısıt aracı seçimi (etkin şeklin kenar / köşe numaraları)
  let autoCons = true;                  // çizerken neredeyse yatay / dikey kenara otomatik kısıt
  let shape = shapes.length ? shapes[0] : null;
  let step = snaps.includes(10) ? 10 : snaps[0];
  let thick = init && init.mode === 'extrude' && init.h > 0 ? init.h : 20;
  let hint = '', hintErr = false;
  const V = { s: 3, ox: 100, oy: 100 };

  // ---- arayüz ----
  const root = document.createElement('div');
  root.id = 'sk';
  root.innerHTML = `
    <div class="r">
      <button data-a="cancel" class="danger" style="flex:1">✕ İptal</button>
      <div class="ttl">${lock ? 'Kroki (yüz)' : 'Kroki'}</div>
      <button data-a="done" class="ok" style="flex:1">✓ Tamam</button>
    </div>
    <div class="r">
      <button data-a="plane-top">Üstten (X-Z)</button>
      <button data-a="plane-front">Önden (X-Y)</button>
      <button data-a="mode-extrude">Kalınlık ver</button>
      <button data-a="mode-revolve">Döndür</button>
    </div>
    <div class="r tools">
      <button data-a="tool-poly">Çokgen</button>
      <button data-a="tool-rect">Dikdörtgen</button>
      <button data-a="tool-circle">Daire</button>
      <button data-a="tool-arc">Yay</button>
      <button data-a="tool-select">Seç</button>
      <button data-a="tool-cons">📐 Kısıt</button>
    </div>
    <div class="r">
      <button data-a="back">↶ Nokta</button>
      <button data-a="close">Kapat</button>
      <button data-a="delshape">Şekli sil</button>
      <button data-a="clear" class="danger">Temizle</button>
      <label class="f" style="flex:1.3"><span>Yapışma</span><select data-a="snap"></select></label>
    </div>
    <div class="hint" id="sk-hint"></div>
    <div class="cv">
      <canvas></canvas>
      <div class="zoom">
        <button data-a="zin">+</button><button data-a="zout">−</button><button data-a="zfit">⌖</button>
      </div>
    </div>
    <div class="r bot" id="sk-fields"></div>`;
  document.body.appendChild(root);

  const wrap = root.querySelector('.cv');
  const cv = root.querySelector('canvas');
  const g = cv.getContext('2d');
  const hintEl = root.querySelector('#sk-hint');
  const fieldsEl = root.querySelector('#sk-fields');
  const snapSel = root.querySelector('select[data-a="snap"]');
  snapSel.innerHTML = [0, ...snaps].map((v) =>
    `<option value="${v}"${v === step ? ' selected' : ''}>${v === 0 ? 'Serbest' : fmt(v) + ' ' + unit}</option>`).join('');

  let W = 300, H = 300, dpr = 1;
  const flipV = () => plane === 'front';
  const toWorld = (sx, sy) => [(sx - V.ox) / V.s, flipV() ? (V.oy - sy) / V.s : (sy - V.oy) / V.s];
  const toScreen = (u, v) => [V.ox + u * V.s, flipV() ? V.oy - v * V.s : V.oy + v * V.s];
  const sn = (pt) => {
    let u = snap(pt[0], step), v = snap(pt[1], step);
    if (mode === 'revolve' && u < 0) u = 0;
    return [u, v];
  };

  // ---- şekil yardımcıları ----
  const ptsOf = (s) => {
    if (!s) return null;
    if (s.kind === 'poly') return s.pts;
    if (s.kind === 'rect') return s.cr > 0 ? roundedRectPts(s.a[0], s.a[1], s.b[0], s.b[1], s.cr) : rectPts(s.a[0], s.a[1], s.b[0], s.b[1]);
    if (s.kind === 'circle') return circlePts(s.c[0], s.c[1], s.r, 48);
    return null;
  };
  const shapePts = () => ptsOf(shape);
  const isClosed = (s) => s.kind !== 'poly' || s.closed;
  const allPts = () => shapes.flatMap((s) => ptsOf(s) || []);
  // geçersiz (silinmiş köşeye / kenara bakan) kısıtları at
  function pruneCons(s) {
    if (!s || s.kind !== 'poly' || !s.cons) return;
    const n = s.pts.length;
    const okE = (e) => Number.isInteger(e) && e >= 0 && (s.closed ? e < n : e + 1 < n);
    s.cons = s.cons.filter((c) => (c.t === 'fix' ? c.i >= 0 && c.i < n : okE(c.e) && (c.f === undefined || okE(c.f))));
  }
  // kısıtları çöz; başarısızsa false döner (şekil değişmez)
  function solveShape(s, pinned = []) {
    if (!s || s.kind !== 'poly' || !s.cons || !s.cons.length) return true;
    pruneCons(s);
    const r = solveCons(s.pts, s.cons, pinned);
    if (r.ok) s.pts = r.pts;
    return r.ok;
  }
  function sameCons(a, b) { return a.t === b.t && a.e === b.e && a.f === b.f && a.i === b.i; }
  function addCons(c) {
    if (!shape || shape.kind !== 'poly') return;
    // aynı türden eskisini (ya da h/v karşıtını) kaldır
    shape.cons = shape.cons.filter((d) => !(sameCons(d, c) || (c.e !== undefined && c.f === undefined && d.f === undefined && d.e === c.e &&
      ((c.t === 'len' && d.t === 'len') || ((c.t === 'h' || c.t === 'v') && (d.t === 'h' || d.t === 'v')))) ||
      (c.f !== undefined && d.f !== undefined && ((d.e === c.e && d.f === c.f) || (d.e === c.f && d.f === c.e)) && d.t === c.t)));
    const keep = shape.pts.map((q) => q.slice());
    shape.cons.push(c);
    if (!solveShape(shape)) {
      shape.cons.pop(); shape.pts = keep;
      setHint('Bu kısıt diğerleriyle çelişiyor, eklenmedi.', true); draw(); return false;
    }
    refresh(); return true;
  }
  function autoEdgeCons(s, e) {
    if (!autoCons || !s || s.kind !== 'poly') return;
    const n = s.pts.length, a = s.pts[e], b = s.pts[(e + 1) % n];
    if (!a || !b) return;
    const du = Math.abs(b[0] - a[0]), dv = Math.abs(b[1] - a[1]);
    if (du + dv < 1e-6) return;
    const tol = Math.tan(4 * Math.PI / 180);
    if (dv <= du * tol) { b[1] = a[1]; s.cons.push({ t: 'h', e }); }
    else if (du <= dv * tol) { b[0] = a[0]; s.cons.push({ t: 'v', e }); }
  }
  function removeShape(s) {
    const i = shapes.indexOf(s);
    if (i >= 0) shapes.splice(i, 1);
    if (shape === s) shape = shapes.length ? shapes[Math.min(i, shapes.length - 1)] : null;
    arcEnd = null;
  }

  function defaultView() {
    V.s = Math.max(0.2, Math.min(W, H) / 160);
    V.ox = mode === 'revolve' ? W * 0.2 : W / 2;
    V.oy = plane === 'front' ? H * 0.8 : H / 2;
  }
  function fitView() {
    const pts = allPts();
    if (!pts.length) { defaultView(); return; }
    const bb = bboxPts(pts);
    const bw = Math.max(bb.maxU - bb.minU, 1), bh = Math.max(bb.maxV - bb.minV, 1);
    V.s = Math.max(0.05, Math.min(200, Math.min(W / bw, H / bh) * 0.6));
    const cu = (bb.minU + bb.maxU) / 2, cvv = (bb.minV + bb.maxV) / 2;
    V.ox = W / 2 - cu * V.s;
    V.oy = flipV() ? H / 2 + cvv * V.s : H / 2 - cvv * V.s;
  }
  function resize() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const first = W === 300 && H === 300 && !resize.done;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (first || !resize.done) { resize.done = true; if (init) fitView(); else defaultView(); }
    draw();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(wrap);

  function setHint(m, err) { hint = m; hintErr = !!err; hintEl.textContent = m; hintEl.classList.toggle('err', !!err); }
  function defaultHint() {
    const multi = shapes.length > 1 ? ' (' + shapes.length + ' şekil: iç içe olan delik olur)' : '';
    if (tool === 'select') return 'Bir şekle dokunarak seç; ölçülerini değiştir ya da "Şekli sil".' + multi;
    if (tool === 'cons') {
      if (!shape) return 'Önce bir çokgen çiz, sonra kenarlarına dokunup kısıt ver.';
      if (shape.kind !== 'poly') return 'Kısıtlar çokgende çalışır. Aşağıdan bu şekli kısıtlı çokgene çevirebilirsin.';
      const fr = freedom(shape.pts.length, shape.cons);
      const st = fr === 0 ? '✓ Tam tanımlı' : fr < 0 ? 'Fazla kısıt (' + (-fr) + ')' : 'Serbestlik: ' + fr + (fr <= 2 && !shape.cons.some((c) => c.t === 'fix') ? ' (yeri için bir köşeyi sabitle)' : '');
      return 'Kenara dokun: seç (2 kenar = paralel / dik / eşit / açı). Köşeye dokun: sabitle. ' + st;
    }
    if (tool === 'poly') {
      if (!shape || shape.kind !== 'poly' || shape.closed) return 'Dokunarak nokta ekle. 3+ noktadan sonra ilk noktaya dokun ya da "Kapat". Kapalı şeklin dışına/içine yeni nokta başlarsan yeni şekil olur.' + multi;
      return shape.pts.length + ' nokta. İlk noktaya dokunarak kapat.' + multi;
    }
    if (tool === 'arc') {
      const open = shape && shape.kind === 'poly' && !shape.closed && shape.pts.length;
      if (!open) return 'Yay: başlangıç noktasına dokun (yeni şekil başlar).' + multi;
      if (arcEnd) return 'Şimdi yayın ORTASINDAN geçeceği bir noktaya dokun (yayı şişirir).';
      return 'Yayın BİTİŞ noktasına dokun. İlk noktaya dokunursan şekil kapanır.';
    }
    if (tool === 'rect') return 'Parmağını sürükleyerek dikdörtgen çiz; ölçüleri ve köşe yuvarlamayı aşağıdan yaz. İçine yeni şekil çizersen delik olur.' + multi;
    return 'Merkezden dışarı sürükleyerek daire çiz; çapı aşağıdan yaz. Başka şeklin içine çizersen delik olur.' + multi;
  }

  function updateButtons() {
    const on = (a, v) => { const b = root.querySelector(`[data-a="${a}"]`); if (b) b.classList.toggle('on', !!v); };
    on('plane-top', plane === 'top' && mode !== 'revolve');
    on('plane-front', plane === 'front' && mode !== 'revolve');
    on('mode-extrude', mode === 'extrude');
    on('mode-revolve', mode === 'revolve');
    for (const t of ['poly', 'rect', 'circle', 'arc', 'select', 'cons']) on('tool-' + t, tool === t);
    root.querySelector('[data-a="plane-top"]').disabled = mode === 'revolve' || lock;
    root.querySelector('[data-a="plane-front"]').disabled = mode === 'revolve' || lock;
    root.querySelector('[data-a="mode-extrude"]').disabled = lock;
    root.querySelector('[data-a="mode-revolve"]').disabled = lock;
    root.querySelector('[data-a="close"]').disabled = !(shape && shape.kind === 'poly' && !shape.closed && shape.pts.length >= 3);
    root.querySelector('[data-a="delshape"]').disabled = !shape;
  }

  function renderFields() {
    let h = '';
    const f = (label, id, val) => `<label class="f"><span>${label} (${unit})</span><input type="number" step="any" data-f="${id}" value="${val}"></label>`;
    if (shape && shape.kind === 'rect') {
      h += f('Genişlik', 'rw', fmt(Math.abs(shape.b[0] - shape.a[0]))) + f('Yükseklik', 'rh', fmt(Math.abs(shape.b[1] - shape.a[1]))) + f('Köşe yuv.', 'cr', fmt(shape.cr || 0));
    } else if (shape && shape.kind === 'circle') {
      h += f('Çap', 'cd', fmt(shape.r * 2));
    }
    if (tool === 'cons') h = consFields();
    if (mode === 'extrude' && tool !== 'cons') h += f('Kalınlık', 'th', fmt(thick));
    fieldsEl.innerHTML = h;
  }
  function consFields() {
    const B = (lbl, a, on, dis) => `<button data-a="${a}"${on ? ' class="on"' : ''}${dis ? ' disabled' : ''}>${lbl}</button>`;
    const L = (t) => `<div class="lb">${t}</div>`;
    let h = '';
    if (!shape) return L('Önce bir şekil çiz.');
    if (shape.kind !== 'poly') return L('Bu şekil dikdörtgen / daire.') + B('Kısıtlı çokgene çevir', 'c-topoly');
    const E = csel.edges, has = (t, e, f) => shape.cons.some((c) => c.t === t && c.e === e && (f === undefined || c.f === f || (c.e === f && c.f === e)));
    const len = (e) => { const a = shape.pts[e], b = shape.pts[(e + 1) % shape.pts.length]; return Math.hypot(b[0] - a[0], b[1] - a[1]); };
    if (E.length === 1) {
      const e = E[0];
      h += L('Seçili kenar ' + (e + 1));
      h += B('— Yatay', 'c-h', has('h', e)) + B('| Dikey', 'c-v', has('v', e));
      const lc = shape.cons.find((c) => c.t === 'len' && c.e === e);
      h += `<label class="f" style="flex:1 1 40%"><span>Uzunluk (${unit})</span><input type="number" step="any" data-f="clen" value="${fmt(lc ? lc.L : len(e))}"></label>` + B('📏 Ölçüyü kilitle', 'c-len', !!lc);
    } else if (E.length === 2) {
      const [e, f] = E;
      h += L('Seçili kenarlar ' + (e + 1) + ' ve ' + (f + 1));
      h += B('∥ Paralel', 'c-par', has('par', e, f)) + B('⊥ Dik', 'c-perp', has('perp', e, f)) + B('= Eşit uzunluk', 'c-eq', has('eq', e, f));
      const ac = shape.cons.find((c) => c.t === 'ang' && ((c.e === e && c.f === f) || (c.e === f && c.f === e)));
      h += `<label class="f" style="flex:1 1 40%"><span>Açı (°)</span><input type="number" step="any" data-f="cang" value="${ac ? fmtNum(ac.A, 2) : 90}"></label>` + B('∠ Açıyı kilitle', 'c-ang', !!ac);
    } else if (csel.vtx !== null) {
      const fx = shape.cons.some((c) => c.t === 'fix' && c.i === csel.vtx);
      h += L('Seçili köşe ' + (csel.vtx + 1)) + B(fx ? '🔓 Serbest bırak' : '📌 Sabitle', 'c-fix', fx);
    } else {
      h += L('Bir kenara ya da köşeye dokun.');
    }
    h += L('Genel') + B('Seçimin kısıtlarını sil', 'c-delsel', false, !E.length && csel.vtx === null) + B('Tüm kısıtları sil', 'c-delall', false, !shape.cons.length) +
      B('Otomatik yatay/dikey: ' + (autoCons ? 'açık' : 'kapalı'), 'c-auto', autoCons);
    return h;
  }
  function syncFieldValues() {
    const set = (id, v) => { const el = fieldsEl.querySelector(`[data-f="${id}"]`); if (el && document.activeElement !== el) el.value = v; };
    if (shape && shape.kind === 'rect') { set('rw', fmt(Math.abs(shape.b[0] - shape.a[0]))); set('rh', fmt(Math.abs(shape.b[1] - shape.a[1]))); }
    if (shape && shape.kind === 'circle') set('cd', fmt(shape.r * 2));
  }
  function refresh(full = true) {
    updateButtons();
    if (full) renderFields(); else syncFieldValues();
    setHint(defaultHint(), false);
    draw();
  }

  // ---- çizim ----
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b1220';
    g.fillRect(0, 0, W, H);

    // ızgara
    let gs = NICE[NICE.length - 1];
    for (const n of NICE) if (n * V.s >= 10) { gs = n; break; }
    const [u0, v0] = toWorld(0, 0), [u1, v1] = toWorld(W, H);
    const uMin = Math.min(u0, u1), uMax = Math.max(u0, u1), vMin = Math.min(v0, v1), vMax = Math.max(v0, v1);
    const line = (a, b, c, d) => { g.moveTo(a, b); g.lineTo(c, d); };
    g.lineWidth = 1;
    for (const [mul, col] of [[1, 'rgba(148,163,184,.13)'], [5, 'rgba(148,163,184,.28)']]) {
      g.beginPath(); g.strokeStyle = col;
      const st = gs * mul;
      for (let u = Math.ceil(uMin / st) * st, c = 0; u <= uMax && c < 400; u += st, c++) { const [x] = toScreen(u, 0); line(Math.round(x) + .5, 0, Math.round(x) + .5, H); }
      for (let v = Math.ceil(vMin / st) * st, c = 0; v <= vMax && c < 400; v += st, c++) { const [, y] = toScreen(0, v); line(0, Math.round(y) + .5, W, Math.round(y) + .5); }
      g.stroke();
    }
    // eksenler
    const [ox, oy] = toScreen(0, 0);
    g.lineWidth = 1.5;
    g.beginPath(); g.strokeStyle = '#ef4444'; line(0, oy, W, oy); g.stroke();
    g.beginPath(); g.strokeStyle = plane === 'top' ? '#3b82f6' : '#22c55e';
    if (mode === 'revolve') g.setLineDash([8, 5]);
    line(ox, 0, ox, H); g.stroke(); g.setLineDash([]);
    g.font = '11px system-ui, sans-serif'; g.fillStyle = '#94a3b8';
    g.fillText(lock ? 'U' : 'X', W - 14, oy - 5);
    g.fillText(mode === 'revolve' ? 'dönme ekseni' : (lock ? 'V' : plane === 'top' ? 'Z' : 'Y'), ox + 5, 12);

    // kapalı şekillerin dolgusu: çift-tek kuralı (iç içe olan delik görünür)
    const spOf = (s) => (ptsOf(s) || []).map(([u, v]) => toScreen(u, v));
    g.beginPath();
    for (const s of shapes) {
      if (!isClosed(s)) continue;
      const sp = spOf(s);
      if (sp.length < 3) continue;
      sp.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    }
    g.fillStyle = 'rgba(56,189,248,.22)'; g.fill('evenodd');
    // çizgiler
    for (const s of shapes) {
      const sp = spOf(s);
      if (!sp.length) continue;
      g.beginPath();
      sp.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      if (isClosed(s)) g.closePath();
      g.lineWidth = s === shape ? 2.5 : 1.6;
      g.strokeStyle = s === shape ? '#38bdf8' : '#7aa5c4';
      g.stroke();
    }

    // etkin şeklin ölçüleri ve köşeleri
    const pts = shapePts();
    if (pts && pts.length) {
      const sp = pts.map(([u, v]) => toScreen(u, v));
      const closed = isClosed(shape);
      g.font = '11px system-ui, sans-serif';
      const label = (txt, x, y) => {
        const w = g.measureText(txt).width + 8;
        g.fillStyle = 'rgba(15,23,42,.85)'; g.fillRect(x - w / 2, y - 8, w, 16);
        g.fillStyle = '#e2e8f0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y);
        g.textAlign = 'start'; g.textBaseline = 'alphabetic';
      };
      if (shape.kind === 'circle') {
        const [cx, cy] = toScreen(shape.c[0], shape.c[1]);
        g.beginPath(); g.setLineDash([4, 4]); g.strokeStyle = '#fbbf24'; line(cx, cy, cx + shape.r * V.s, cy); g.stroke(); g.setLineDash([]);
        label('Ø ' + fmt(shape.r * 2), cx + shape.r * V.s / 2, cy - 12);
        g.fillStyle = '#fbbf24'; g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
      } else if (shape.kind === 'rect') {
        const w = Math.abs(shape.b[0] - shape.a[0]), hh = Math.abs(shape.b[1] - shape.a[1]);
        const mnU = Math.min(shape.a[0], shape.b[0]), mnV = Math.min(shape.a[1], shape.b[1]);
        if (w * V.s >= 28) { const [mx, my] = toScreen(mnU + w / 2, mnV); label(fmt(w), mx, my); }
        if (hh * V.s >= 28) { const [mx, my] = toScreen(mnU + w, mnV + hh / 2); label(fmt(hh), mx, my); }
      } else {
        const n = pts.length;
        const m = closed ? n : n - 1;
        if (n <= 60) {
          for (let i = 0; i < m; i++) {
            const a = pts[i], b = pts[(i + 1) % n];
            const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (len * V.s < 28) continue;
            const [mx, my] = toScreen((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
            label(fmt(len), mx, my);
          }
        }
      }
      if (shape.kind === 'poly' && (shape.cons.length || tool === 'cons')) {
        const n = pts.length;
        // seçili kenarlar
        for (const e of csel.edges) {
          if (e >= n) continue;
          const [x0, y0] = toScreen(...pts[e]), [x1, y1] = toScreen(...pts[(e + 1) % n]);
          g.beginPath(); g.lineWidth = 5; g.strokeStyle = 'rgba(249,115,22,.85)'; line(x0, y0, x1, y1); g.stroke();
        }
        // kısıt işaretleri kenarın ortasının biraz dışına
        const sym = { h: '—', v: '|', par: '∥', perp: '⊥', eq: '=', ang: '∠' };
        const badges = new Map();
        const addB = (e, t) => { if (!badges.has(e)) badges.set(e, []); badges.get(e).push(t); };
        shape.cons.forEach((c, k) => {
          if (c.t === 'fix') return;
          if (c.t === 'len') addB(c.e, '🔒' + fmt(c.L));
          else if (c.f !== undefined) { const tag = sym[c.t] + (k + 1) + (c.t === 'ang' ? ' ' + fmtNum(c.A, 1) + '°' : ''); addB(c.e, tag); addB(c.f, tag); }
          else addB(c.e, sym[c.t]);
        });
        const cu = pts.reduce((s0, q) => s0 + q[0], 0) / n, cvv = pts.reduce((s0, q) => s0 + q[1], 0) / n;
        const [cx, cy] = toScreen(cu, cvv);
        for (const [e, tags] of badges) {
          if (e >= n) continue;
          const a = pts[e], b = pts[(e + 1) % n];
          const [mx, my] = toScreen((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
          let nx = mx - cx, ny = my - cy; const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
          const txt = tags.join(' ');
          g.font = 'bold 11px system-ui, sans-serif';
          const w = g.measureText(txt).width + 8, bx = mx + nx * 24, by = my + ny * 24;
          g.fillStyle = 'rgba(120,53,15,.92)'; g.fillRect(bx - w / 2, by - 8, w, 16);
          g.fillStyle = '#fde68a'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, bx, by);
          g.textAlign = 'start'; g.textBaseline = 'alphabetic';
        }
        for (const c of shape.cons) if (c.t === 'fix' && c.i < n) { const [x, y] = toScreen(...pts[c.i]); g.fillStyle = '#f59e0b'; g.fillRect(x - 7, y - 7, 14, 14); }
        if (csel.vtx !== null && csel.vtx < n) { const [x, y] = toScreen(...pts[csel.vtx]); g.beginPath(); g.lineWidth = 3; g.strokeStyle = '#f97316'; g.arc(x, y, 11, 0, 7); g.stroke(); }
      }
      if (shape.kind === 'poly') {
        sp.forEach(([x, y], i) => {
          if (tool === 'arc' && i > 0 && i < sp.length - 1 && sp.length > 12) return; // yay noktalarını kalabalık etme
          g.beginPath();
          const big = i === 0 && !shape.closed && sp.length >= 3;
          g.arc(x, y, big ? 9 : 5, 0, 7);
          g.fillStyle = i === 0 ? '#fbbf24' : '#fff'; g.fill();
        });
        if (arcEnd && !shape.closed && shape.pts.length) {
          const [lx, ly] = toScreen(...shape.pts[shape.pts.length - 1]), [ex, ey] = toScreen(arcEnd[0], arcEnd[1]);
          g.beginPath(); g.setLineDash([5, 4]); g.strokeStyle = '#fbbf24'; line(lx, ly, ex, ey); g.stroke(); g.setLineDash([]);
          g.beginPath(); g.arc(ex, ey, 6, 0, 7); g.fillStyle = '#fbbf24'; g.fill();
        }
      }
    }
  }

  // ---- parmak / fare ----
  const ptrs = new Map();
  let act = null;           // { type:'draw'|'vertex'|'tap'|'arctap'|'select', ... }
  let pinch = null;         // { d, mx, my }

  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  function hitVertex(sx, sy) {
    if (!shape || shape.kind !== 'poly') return -1;
    let best = -1, bd = 20;
    shape.pts.forEach(([u, v], i) => {
      const [x, y] = toScreen(u, v);
      const d = Math.hypot(x - sx, y - sy);
      if (d <= bd) { bd = d; best = i; }
    });
    return best;
  }
  function hitEdge(sx, sy) {
    if (!shape || shape.kind !== 'poly') return -1;
    const p = shape.pts, n = p.length, m = shape.closed ? n : n - 1;
    let best = -1, bd = 16;
    for (let i = 0; i < m; i++) {
      const [x0, y0] = toScreen(...p[i]), [x1, y1] = toScreen(...p[(i + 1) % n]);
      const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((sx - x0) * dx + (sy - y0) * dy) / L2));
      const d = Math.hypot(sx - (x0 + t * dx), sy - (y0 + t * dy));
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function pinchState() {
    const a = [...ptrs.values()];
    return { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) || 1, mx: (a[0][0] + a[1][0]) / 2, my: (a[0][1] + a[1][1]) / 2 };
  }
  function zoomAt(f, mx, my) {
    const ns = Math.max(0.05, Math.min(400, V.s * f));
    const k = ns / V.s;
    V.ox = mx - (mx - V.ox) * k;
    V.oy = my - (my - V.oy) * k;
    V.s = ns;
  }
  function abortDraw() {
    if (act && act.type === 'draw' && act.created) { removeShape(act.created); shape = act.prev || shape; }
  }

  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size === 2) {
      abortDraw();                      // yarım kalan sürüklemeyi iptal et
      act = null;
      pinch = pinchState();
      refresh(false);
      return;
    }
    if (ptrs.size > 2) return;
    const [sx, sy] = local(e);
    if (tool === 'arc') { act = { type: 'arctap', sx, sy, moved: false }; return; }
    const vi = hitVertex(sx, sy);
    if (tool === 'cons') { act = { type: vi >= 0 ? 'vertex' : 'ctap', i: vi, sx, sy, moved: false }; return; }
    if (vi >= 0) { act = { type: 'vertex', i: vi, sx, sy, moved: false }; return; }
    if (tool === 'poly') { act = { type: 'tap', sx, sy, moved: false }; return; }
    if (tool === 'select') { act = { type: 'select', sx, sy, moved: false }; return; }
    const p0 = sn(toWorld(sx, sy));
    act = { type: 'draw', sx, sy, p0, created: null, prev: shape, moved: false };
  });

  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size >= 2 && pinch) {
      const s = pinchState();
      zoomAt(s.d / pinch.d, s.mx, s.my);
      V.ox += s.mx - pinch.mx; V.oy += s.my - pinch.my;
      pinch = s;
      draw();
      return;
    }
    if (!act) return;
    const [sx, sy] = local(e);
    if (Math.hypot(sx - act.sx, sy - act.sy) > 6) act.moved = true;
    if (act.type === 'vertex' && act.moved) {
      shape.pts[act.i] = sn(toWorld(sx, sy));
      if (shape.cons && shape.cons.length) {
        if (!act.keep) act.keep = shape.pts.map((q) => q.slice());
        const r = solveCons(shape.pts, shape.cons, [act.i], 150);
        if (r.ok) { shape.pts = r.pts; act.bad = false; } else act.bad = true;
      }
      draw();
    } else if (act.type === 'draw' && act.moved) {
      const p = sn(toWorld(sx, sy));
      if (!act.created) {
        act.created = tool === 'rect' ? { kind: 'rect', a: act.p0, b: p, cr: 0 } : { kind: 'circle', c: act.p0, r: 0 };
        shapes.push(act.created);
        shape = act.created;
        arcEnd = null;
      }
      if (tool === 'rect') act.created.b = p;
      else act.created.r = Math.hypot(p[0] - act.p0[0], p[1] - act.p0[1]);
      syncFieldValues();
      draw();
    }
  });

  // dokunulan noktadaki şekli bul: önce içinde bulunduğu en küçük şekil, yoksa kenara en yakın olan
  function pickShape(sx, sy) {
    const w = toWorld(sx, sy);
    let best = null, ba = Infinity;
    for (const s of shapes) {
      const p = ptsOf(s);
      if (!p || p.length < 3 || !isClosed(s)) continue;
      if (pointInPoly(w, p)) { const a = Math.abs(polyArea(p)); if (a < ba) { ba = a; best = s; } }
    }
    if (best) return best;
    let bd = 16;
    for (const s of shapes) {
      const p = ptsOf(s);
      if (!p) continue;
      const n = isClosed(s) ? p.length : p.length - 1;
      for (let i = 0; i < n; i++) {
        const [x0, y0] = toScreen(...p[i]), [x1, y1] = toScreen(...p[(i + 1) % p.length]);
        const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((sx - x0) * dx + (sy - y0) * dy) / L2));
        const d = Math.hypot(sx - (x0 + t * dx), sy - (y0 + t * dy));
        if (d < bd) { bd = d; best = s; }
      }
    }
    return best;
  }

  // yay aracı: (başlangıç) -> bitiş -> orta nokta
  function arcTap(sx, sy) {
    let p = sn(toWorld(sx, sy));
    if (!shape || shape.kind !== 'poly' || shape.closed || !shape.pts.length) {
      shape = polyShape([p], false); shape.marks = [0];
      shapes.push(shape); arcEnd = null; refresh(); return;
    }
    const first = shape.pts.length >= 3 ? shape.pts[0] : null;
    if (first) { const [fx, fy] = toScreen(first[0], first[1]); if (Math.hypot(fx - sx, fy - sy) <= 20) p = first.slice(); }
    const last = shape.pts[shape.pts.length - 1];
    if (!arcEnd) {
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1e-6) { setHint('Bitiş noktası başlangıçtan farklı olmalı.', true); return; }
      arcEnd = p; refresh(false); setHint(defaultHint(), false); draw(); return;
    }
    const arc = arcPoints(last, p, arcEnd);
    const endIsFirst = shape.pts.length >= 3 && Math.hypot(arcEnd[0] - shape.pts[0][0], arcEnd[1] - shape.pts[0][1]) < 1e-6;
    shape.marks.push(shape.pts.length);
    shape.pts.push(...arc);
    arcEnd = null;
    if (endIsFirst) { shape.pts.pop(); shape.closed = true; }
    refresh();
  }

  function closeShape(s) {
    s.closed = true;
    autoEdgeCons(s, s.pts.length - 1);
    if (!solveShape(s)) { s.cons = s.cons.filter((c) => !(c.e === s.pts.length - 1 && (c.t === 'h' || c.t === 'v'))); }
  }
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    const [sx, sy] = local(e);
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    const a = act;
    act = null;
    if (!a) return;
    if (a.type === 'arctap') { if (!a.moved) arcTap(sx, sy); return; }
    if (a.type === 'ctap') {
      if (a.moved) return;
      const e = hitEdge(sx, sy);
      if (e >= 0) {
        csel.vtx = null;
        const k = csel.edges.indexOf(e);
        if (k >= 0) csel.edges.splice(k, 1); else { csel.edges.push(e); if (csel.edges.length > 2) csel.edges.shift(); }
      } else {
        const s2 = pickShape(sx, sy);
        if (s2 && s2 !== shape) { shape = s2; arcEnd = null; }
        csel = { edges: [], vtx: null };
      }
      refresh(); return;
    }
    if (a.type === 'vertex' && tool === 'cons' && !a.moved) { csel = { edges: [], vtx: a.i }; refresh(); return; }
    if (a.type === 'vertex' && a.moved && a.bad && a.keep) { shape.pts = a.keep; setHint('Kısıtlar bu konuma izin vermiyor, köşe geri alındı.', true); draw(); updateButtons(); return; }
    if (a.type === 'select') {
      if (!a.moved) { const s = pickShape(sx, sy); if (s) { shape = s; arcEnd = null; } refresh(); }
      return;
    }
    if (a.type === 'tap' && !a.moved) {
      if (!shape || shape.kind !== 'poly' || shape.closed) {
        shape = polyShape([], false);
        shapes.push(shape);
        arcEnd = null;
      }
      shape.marks.push(shape.pts.length);
      shape.pts.push(sn(toWorld(sx, sy)));
      if (shape.pts.length >= 2) autoEdgeCons(shape, shape.pts.length - 2);
      refresh();
    } else if (a.type === 'vertex' && !a.moved) {
      if (a.i === 0 && shape.kind === 'poly' && !shape.closed && shape.pts.length >= 3) { closeShape(shape); refresh(); }
    } else if (a.type === 'vertex') {
      refresh();
    } else if (a.type === 'draw') {
      const s = a.created;
      if (s) {
        const tiny = s.kind === 'rect'
          ? Math.abs(s.b[0] - s.a[0]) < 1e-6 || Math.abs(s.b[1] - s.a[1]) < 1e-6
          : s.r < 1e-6;
        if (tiny) { removeShape(s); shape = a.prev && shapes.includes(a.prev) ? a.prev : shape; }
      }
      refresh();
    }
  }
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', (e) => {
    abortDraw();
    ptrs.delete(e.pointerId); pinch = null; act = null; refresh();
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [sx, sy] = local(e);
    zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, sx, sy);
    draw();
  }, { passive: false });

  // ---- düğmeler ----
  function done() {
    if (!shapes.length) { setHint('Önce bir şekil çiz.', true); return; }
    for (const s of shapes) {
      if (s.kind === 'poly' && !s.closed) {
        if (s.pts.length >= 3) s.closed = true;
        else { shape = s; setHint('Bitmemiş bir şekil var (en az 3 nokta) — tamamla ya da "Şekli sil".', true); refresh(false); setHint('Bitmemiş bir şekil var (en az 3 nokta) — tamamla ya da "Şekli sil".', true); return; }
      }
    }
    const r = validateDraw(mode, plane, shapes.map(ptsOf), thick, shapes.map((s) => (s.kind === 'poly' ? s.cons || [] : [])));
    if (r.error) { setHint(r.error, true); draw(); return; }
    cleanup();
    if (opts.onDone) opts.onDone(r.draw);
  }
  function cleanup() { ro.disconnect(); root.remove(); }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.a) return;
    const a = b.dataset.a;
    if (a === 'cancel') { cleanup(); if (opts.onCancel) opts.onCancel(); return; }
    if (a === 'done') { done(); return; }
    if (a === 'plane-top') { plane = 'top'; defaultViewKeep(); refresh(); return; }
    if (a === 'plane-front') { plane = 'front'; defaultViewKeep(); refresh(); return; }
    if (a === 'mode-extrude') { mode = 'extrude'; refresh(); return; }
    if (a === 'mode-revolve') {
      mode = 'revolve'; plane = 'front';
      if (!shapes.length) defaultView();
      else if (allPts().some(([u]) => u < 0)) setHint('Şekil eksenin solunda; sağına taşı.', true);
      updateButtons(); renderFields(); draw(); return;
    }
    if (a.startsWith('tool-')) { tool = a.slice(5); arcEnd = null; csel = { edges: [], vtx: null }; refresh(); return; }
    if (a.startsWith('c-')) { consAction(a); return; }
    if (a === 'back') {
      if (arcEnd) { arcEnd = null; refresh(); return; }
      if (!shape) return;
      if (shape.kind === 'poly') {
        if (shape.closed) shape.closed = false;
        else if (shape.marks.length) shape.pts.length = Math.min(shape.pts.length, shape.marks.pop());
        else shape.pts.pop();
        if (!shape.pts.length) removeShape(shape); else pruneCons(shape);
      } else removeShape(shape);
      csel = { edges: [], vtx: null };
      refresh(); return;
    }
    if (a === 'close') { if (shape && shape.kind === 'poly' && shape.pts.length >= 3) { closeShape(shape); refresh(); } return; }
    if (a === 'delshape') { if (shape) removeShape(shape); csel = { edges: [], vtx: null }; refresh(); return; }
    if (a === 'clear') { shapes = []; shape = null; arcEnd = null; refresh(); return; }
    if (a === 'zin') { zoomAt(1.4, W / 2, H / 2); draw(); return; }
    if (a === 'zout') { zoomAt(1 / 1.4, W / 2, H / 2); draw(); return; }
    if (a === 'zfit') { fitView(); draw(); return; }
  });
  function consAction(a) {
    if (a === 'c-auto') { autoCons = !autoCons; refresh(); return; }
    if (!shape) return;
    if (a === 'c-topoly' && shape.kind === 'rect') {
      if (shape.cr > 0) { setHint('Köşesi yuvarlatılmış dikdörtgen çevrilemez; önce köşe yuvarlamayı 0 yap.', true); return; }
      const p = rectPts(shape.a[0], shape.a[1], shape.b[0], shape.b[1]);
      const ns = polyShape(p, true, [{ t: 'h', e: 0 }, { t: 'v', e: 1 }, { t: 'h', e: 2 }, { t: 'v', e: 3 }]);
      shapes[shapes.indexOf(shape)] = ns; shape = ns; refresh(); return;
    }
    if (shape.kind !== 'poly') return;
    const E = csel.edges;
    const val = (id) => { const el = fieldsEl.querySelector(`[data-f="${id}"]`); return el ? el.valueAsNumber : NaN; };
    if (a === 'c-h' || a === 'c-v') {
      const t = a.slice(2), e = E[0];
      if (shape.cons.some((c) => c.t === t && c.e === e)) { shape.cons = shape.cons.filter((c) => !(c.t === t && c.e === e)); refresh(); return; }
      addCons({ t, e }); return;
    }
    if (a === 'c-len') {
      const e = E[0];
      if (shape.cons.some((c) => c.t === 'len' && c.e === e)) { shape.cons = shape.cons.filter((c) => !(c.t === 'len' && c.e === e)); refresh(); return; }
      const L = val('clen') * uf;
      if (!(L > 0)) { setHint('Uzunluk sıfırdan büyük olmalı.', true); return; }
      addCons({ t: 'len', e, L }); return;
    }
    if (a === 'c-par' || a === 'c-perp' || a === 'c-eq' || a === 'c-ang') {
      const t = a.slice(2), [e, f] = E;
      const ex = shape.cons.find((c) => c.t === t && ((c.e === e && c.f === f) || (c.e === f && c.f === e)));
      if (ex && t !== 'ang') { shape.cons.splice(shape.cons.indexOf(ex), 1); refresh(); return; }
      if (ex && t === 'ang') { shape.cons.splice(shape.cons.indexOf(ex), 1); refresh(); return; }
      const c = { t, e, f };
      if (t === 'ang') { const A = val('cang'); if (!(A > 0 && A < 180)) { setHint('Açı 0 ile 180 arasında olmalı.', true); return; } c.A = A; }
      addCons(c); return;
    }
    if (a === 'c-fix' && csel.vtx !== null) {
      const i = csel.vtx;
      if (shape.cons.some((c) => c.t === 'fix' && c.i === i)) shape.cons = shape.cons.filter((c) => !(c.t === 'fix' && c.i === i));
      else shape.cons.push({ t: 'fix', i });
      refresh(); return;
    }
    if (a === 'c-delsel') {
      shape.cons = shape.cons.filter((c) => !(c.t === 'fix' ? c.i === csel.vtx : E.includes(c.e) || (c.f !== undefined && E.includes(c.f))));
      refresh(); return;
    }
    if (a === 'c-delall') { shape.cons = []; refresh(); }
  }
  // düzlem değişince eksenlerin yeri değişir; şekil yoksa görünümü sıfırla
  function defaultViewKeep() { if (!shapes.length) defaultView(); else fitView(); }

  root.addEventListener('change', (e) => {
    if (e.target === snapSel) { step = parseFloat(snapSel.value) || 0; }
  });
  root.addEventListener('input', (e) => {
    const id = e.target.dataset && e.target.dataset.f;
    if (!id) return;
    const v = e.target.valueAsNumber * uf;
    if (id === 'cr' && shape && shape.kind === 'rect') { shape.cr = v >= 0 ? v : 0; draw(); return; }
    if ((id === 'clen' || id === 'cang') && shape && shape.kind === 'poly') {
      // kilitli ölçü yazarken canlı güncellenir (SolidWorks'teki ölçüyü değiştirme gibi)
      const E = csel.edges;
      const c = id === 'clen' ? shape.cons.find((q) => q.t === 'len' && q.e === E[0])
        : shape.cons.find((q) => q.t === 'ang' && ((q.e === E[0] && q.f === E[1]) || (q.e === E[1] && q.f === E[0])));
      if (!c) return;
      const nv = id === 'clen' ? v : e.target.valueAsNumber;
      if (!(nv > 0) || (id === 'cang' && !(nv < 180))) return;
      const old = id === 'clen' ? c.L : c.A, keep = shape.pts.map((q) => q.slice());
      if (id === 'clen') c.L = nv; else c.A = nv;
      if (!solveShape(shape)) { if (id === 'clen') c.L = old; else c.A = old; shape.pts = keep; setHint('Bu ölçü diğer kısıtlarla sağlanamıyor.', true); }
      else setHint(defaultHint(), false);
      draw(); return;
    }
    if (!(v > 0)) return;
    if (id === 'th') thick = v;
    else if (shape && shape.kind === 'rect' && (id === 'rw' || id === 'rh')) {
      const sx = shape.b[0] >= shape.a[0] ? 1 : -1, sy = shape.b[1] >= shape.a[1] ? 1 : -1;
      if (id === 'rw') shape.b = [shape.a[0] + sx * v, shape.b[1]];
      if (id === 'rh') shape.b = [shape.b[0], shape.a[1] + sy * v];
    } else if (shape && shape.kind === 'circle' && id === 'cd') shape.r = v / 2;
    draw();
  });

  updateButtons();
  renderFields();
  setHint(defaultHint(), false);
  resize();
  return { close: cleanup };
}
