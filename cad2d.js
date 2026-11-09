// 2B Çizim (AutoCAD tarzı) — tam ekran çizim alanı.
// Kullanım: openCad2D({ onExtrude(draw), onClose() })  draw: kroki biçimi (sketch.js / validateDraw)
import { fmtNum } from './logic.js?v=20261109i';
import { validateDraw } from './sketch.js?v=20261109i';
import {
  arcFrom3, trimEntity, extendEntity, offsetEntity, filletLines, transformEntity, moveFn, rotateFn, mirrorFn,
  stretchToLength, setRadius, matchDims, applyDims, findHatchRegion, hatchSegs, pointInPoly, rdimParts, rdimText, angDimFrom, adimParts, adimText, adimTextPos, mapPoints, arrayRect, arrayPolar, snapPoints, nearestOn, closedLoops, toDXF, parseDXF, dimLine, dimParts, dimText, arcSpan, arcEnds, entBBox, dist, normA, ACI,
} from './cad2d-geom.js?v=20261109i';
import { openPhotoImport } from './photoimport.js?v=20261109i';

const KEY = 'cizim:2d';
const CSS = `
#cad { position: fixed; inset: 0; z-index: 35; background: #0b1220; color: #fff; display: flex; flex-direction: column;
       font-family: system-ui, -apple-system, Roboto, sans-serif; }
#cad .r { display: flex; gap: 5px; padding: 5px 8px 0; align-items: center; flex-wrap: wrap; }
#cad button { font: inherit; color: #fff; background: #1e293b; border: 0; border-radius: 8px; padding: 9px 4px;
              font-weight: 600; font-size: 13px; flex: 1; min-width: 0; }
#cad .tools button { flex: 1 1 22%; min-width: 72px; white-space: nowrap; font-size: 12.5px; }
#cad button.on { background: #0284c7; }
#cad button.ok { background: #15803d; }
#cad button.danger { background: #7f1d1d; }
#cad button:disabled { opacity: .35; }
#cad .tab { background: transparent; color: #94a3b8; border-radius: 0; border-bottom: 2px solid #1e293b; }
#cad .tab.on { background: transparent; color: #fff; border-bottom-color: #38bdf8; }
#cad .ttl { flex: 2; text-align: center; font-weight: 700; font-size: 15px; }
#cad .hint { font-size: 12px; color: #94a3b8; padding: 4px 10px 0; min-height: 30px; line-height: 15px; }
#cad .hint.err { color: #f87171; }
#cad .cv { position: relative; flex: 1; min-height: 140px; margin-top: 4px; }
#cad canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; display: block; }
#cad .zoom { position: absolute; right: 8px; top: 8px; display: flex; flex-direction: column; gap: 5px; }
#cad .zoom button { width: 42px; flex: none; padding: 8px 0; background: rgba(30,41,59,.9); font-size: 17px; }
#cad .stat { position: absolute; left: 8px; bottom: 6px; font-size: 12px; color: #cbd5e1; background: rgba(15,23,42,.85);
             padding: 3px 8px; border-radius: 6px; pointer-events: none; }
#cad label.f { flex: 1 1 28%; display: block; min-width: 80px; }
#cad label.f span { display: block; font-size: 11px; color: #94a3b8; margin-bottom: 2px; white-space: nowrap; }
#cad input, #cad select { box-sizing: border-box; width: 100%; font: inherit; font-size: 15px; color: #fff; background: #1e293b; border: 0; border-radius: 8px; padding: 7px 9px; }
#cad .bot { padding-bottom: 8px; max-height: 30vh; overflow-y: auto; }
#cad .bot > button { flex: 1 1 44%; min-width: 130px; white-space: normal; line-height: 1.25; }
#cad .lb { flex: 1 0 100%; font-size: 12px; color: #cbd5e1; font-weight: 700; padding: 3px 2px 0; }
#cad .ly { flex: 1 0 100%; display: flex; gap: 5px; align-items: center; }
#cad .ly .sw { width: 22px; height: 22px; border-radius: 5px; flex: none; }
#cad .ly .nm { flex: 2; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#cad .ly button { flex: 0 0 auto; padding: 8px 10px; }
`;
const TOOLS = {
  draw: [['line', '╱ Çizgi'], ['circle', '◯ Daire'], ['arc', '◠ Yay'], ['rect', '▭ Dikdörtgen'], ['dim', '↔ Ölçü'], ['rdim', '⌀ Çap / R'], ['adim', '∠ Açı ölçü'], ['hatch', '▨ Tarama'], ['text', 'A Yazı'], ['select', '☝ Seç']],
  edit: [['trim', '✂ Kırp'], ['extend', '⇥ Uzat'], ['offset', '⇉ Ofset'], ['fillet', '◜ Radyus'], ['move', '✥ Taşı'], ['copy', '⧉ Kopyala'], ['rotate', '⟳ Döndür'], ['mirror', '⇋ Ayna'], ['array', '▦ Dizi'], ['setdim', '📐 Ölçü ver'], ['scale', '📏 Ölçekle'], ['erase', '🗑 Sil'], ['select', '☝ Seç']],
};
const HINTS = {
  line: ['Başlangıç noktasına dokun (ya da X, Y yaz).', 'Sonraki noktaya dokun ya da uzunluk ve açı yaz. Zincir devam eder; "Bitir" ile durdur.'],
  circle: ['Merkeze dokun.', 'Çapı yaz ya da çember üstündeki bir noktaya dokun.'],
  arc: ['Yayın başlangıç noktası.', 'Yayın üzerinden geçeceği ara nokta.', 'Yayın bitiş noktası.'],
  rect: ['İlk köşe.', 'Karşı köşeye dokun ya da genişlik ve yükseklik yaz.'],
  dim: ['Ölçünün ilk noktası (uç noktaya yapışır).', 'İkinci nokta.', 'Ölçü çizgisinin yerine dokun.'],
  text: ['Yazıyı aşağıya yaz, sonra koyacağın yere dokun.'],
  select: ['Varlıklara dokunarak seç / bırak. Boşta sürükle = kaydır. Seçilenler Taşı, Kopyala, Döndür, Ayna, Sil ile işlenir.'],
  trim: ['Silinecek parçaya dokun: kesişimler arasındaki bölüm silinir (AutoCAD hızlı kırp).'],
  extend: ['Uzatılacak çizginin / yayın ucuna yakın dokun: en yakın sınıra kadar uzar.'],
  offset: ['Mesafeyi yaz, ofsetlenecek varlığa dokun.', 'Hangi tarafa? O tarafa dokun.'],
  fillet: ['Yarıçapı yaz (0 = keskin köşe), birinci çizgiye dokun.', 'İkinci çizgiye dokun (korunacak tarafından).'],
  move: ['Taşıma: temel noktaya dokun.', 'Hedef noktaya dokun (ya da dX, dY yaz).'],
  copy: ['Kopyalama: temel noktaya dokun.', 'Hedef noktalara dokun (birden çok kopya). Bitince başka araca geç.'],
  rotate: ['Döndürme merkezine dokun.', 'Açıyı yazıp "Döndür"e bas.'],
  mirror: ['Ayna ekseninin ilk noktası.', 'Ayna ekseninin ikinci noktası.'],
  erase: ['Silinecek varlığa dokun (taramayı silmek için içine dokun).'],
  rdim: ['Ölçülecek daireye ya da yaya dokun.', 'Ölçü yazısının yerine dokun (Ø çap / R yarıçap aşağıdan değişir).'],
  adim: ['Açının birinci çizgisine dokun.', 'İkinci çizgiye dokun.', 'Ölçünün yerine dokun: hangi açı bölgesine dokunursan o açı ölçülür (ör. 60° ya da 120°).'],
  hatch: ['Taranacak kapalı alanın içine dokun (içteki delikler boş kalır). Açıyı ve aralığı aşağıdan ayarla.'],
  array: ['Önce Seç ile çoğaltılacakları seç. Dikdörtgen: satır / sütun ve aralıkları yaz, Uygula. Dairesel: adet ve açıyı yaz, sonra merkeze dokun.'],
  setdim: ['Ölçüsünü vereceğin çizgiye (değişecek ucuna yakın), daireye ya da yaya dokun.', 'Ölçüyü yaz, "Uygula"ya bas. Çizgide, dokunduğun uç tarafındaki her şey birlikte kayar (esnet).'],
  autodim: ['Okunan ölçüleri kontrol et: turuncu çizgi hangi yazının hangi çizgiye gittiğini gösterir.'],
  scale: ['Ölçüsünü bildiğin bir çizgiye / daireye dokun.', 'Gerçek ölçüsünü yaz ve "Ölçekle"ye bas: bütün çizim o oranda büyür / küçülür.'],
};
const LT_DASH = { CONTINUOUS: [], HIDDEN: [6, 4], CENTER: [14, 4, 3, 4] };
const LT_NAME = { CONTINUOUS: 'Sürekli', HIDDEN: 'Gizli (kesik)', CENTER: 'Eksen' };
const ACI_LIST = [7, 1, 2, 3, 4, 5, 6, 30, 8];
const NICE = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];

function defaultDoc() {
  return {
    ents: [], nextId: 1, cur: '0',
    layers: [
      { name: '0', aci: 7, lt: 'CONTINUOUS' },
      { name: 'Ölçü', aci: 2, lt: 'CONTINUOUS' },
      { name: 'Eksen', aci: 1, lt: 'CENTER' },
      { name: 'Gizli', aci: 4, lt: 'HIDDEN' },
    ],
  };
}

export function openCad2D(opts = {}) {
  if (!document.getElementById('cad-css')) {
    const st = document.createElement('style'); st.id = 'cad-css'; st.textContent = CSS; document.head.appendChild(st);
  }
  let doc;
  try { doc = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { doc = null; }
  if (!doc || !Array.isArray(doc.ents) || !Array.isArray(doc.layers)) doc = defaultDoc();
  const undoS = [], redoS = [];
  const snap = () => JSON.stringify(doc);
  const commit = () => { undoS.push(snap()); if (undoS.length > 80) undoS.shift(); redoS.length = 0; };
  let saveT = 0;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(KEY, snap()); } catch (e) { /* dolu */ } }, 300); };

  let tab = 'draw', tool = 'line';
  let pts = [];               // etkin komutun topladığı noktalar
  let pickA = null;           // ofset / radyus için seçilen varlık
  let pickB = null;           // açı ölçüsünün ikinci çizgisi
  let sel = new Set();        // seçili id'ler
  let auto = null;           // fotoğraftan okunan ölçüler: { added, tents, texts, matches }
  let osnap = true, ortho = false, grid = 1, clearArm = false;
  let aim = null;             // { p, k } parmak altındaki (yakalanmış) nokta
  const F = { dv: '', adddim: '1', real: '', kf: '2', len: '', ang: '0', x: '0', y: '0', d: '20', w: '40', h: '20', off: '5', rad: '5', rot: '90', txt: 'Yazı', th: '5', dx: '0', dy: '0', thick: '10', keep: '1', nl: '', hang: '45', hsp: '3', rdia: '1', amode: 'rect', arows: '2', acols: '3', adx: '20', ady: '20', an: '6', aang: '360', arot: '1' };
  const V = { s: 3, ox: 0, oy: 0 };

  const root = document.createElement('div');
  root.id = 'cad';
  root.innerHTML = `
    <div class="r">
      <button data-a="close" class="danger" style="flex:1">✕ Kapat</button>
      <div class="ttl">2B Çizim</div>
      <button data-a="undo" style="flex:.7">↶</button><button data-a="redo" style="flex:.7">↷</button><button data-a="f-3d" class="ok" style="flex:.9">🧊 3B</button>
    </div>
    <div class="r" id="cad-tabs"></div>
    <div class="r tools" id="cad-tools"></div>
    <div class="hint" id="cad-hint"></div>
    <div class="cv"><canvas></canvas>
      <div class="zoom"><button data-a="zin">+</button><button data-a="zout">−</button><button data-a="zfit">⌖</button></div>
      <div class="stat" id="cad-stat"></div>
    </div>
    <div class="r bot" id="cad-fields"></div>`;
  document.body.appendChild(root);
  const wrap = root.querySelector('.cv'), cv = root.querySelector('canvas');
  let g = cv.getContext('2d');
  const $ = (id) => root.querySelector('#' + id);
  let W = 300, H = 300, dpr = 1;

  const toS = (p) => [V.ox + p[0] * V.s, V.oy - p[1] * V.s];
  const toW = (sx, sy) => [(sx - V.ox) / V.s, (V.oy - sy) / V.s];
  const layerOf = (name) => doc.layers.find((l) => l.name === name) || doc.layers[0];
  const visible = (e) => !layerOf(e.layer).hidden;
  const editable = (e) => visible(e) && !layerOf(e.layer).locked;
  const fmt = (v) => fmtNum(v, 2);
  const num = (k) => { const v = parseFloat(String(F[k]).replace(',', '.')); return isFinite(v) ? v : NaN; };

  function addEnt(e) { e.id = doc.nextId++; e.layer = e.layer || doc.cur; doc.ents.push(e); return e; }
  function replaceEnt(old, list) {
    const i = doc.ents.indexOf(old);
    if (i < 0) return;
    const rep = list.map((e, k) => ({ ...e, id: k === 0 ? old.id : doc.nextId++, layer: old.layer }));
    doc.ents.splice(i, 1, ...rep);
  }
  let snapCache = null, snapVer = -1, ver = 0;
  const changed = () => { ver++; save(); };

  /* ---------- görünüm ---------- */
  function fit() {
    const bbs = doc.ents.filter(visible).map(entBBox).filter(Boolean);
    if (!bbs.length) { V.s = Math.max(0.5, Math.min(W, H) / 120); V.ox = W / 2; V.oy = H / 2; return; }
    const minX = Math.min(...bbs.map((b) => b.minX)), maxX = Math.max(...bbs.map((b) => b.maxX));
    const minY = Math.min(...bbs.map((b) => b.minY)), maxY = Math.max(...bbs.map((b) => b.maxY));
    const bw = Math.max(maxX - minX, 1), bh = Math.max(maxY - minY, 1);
    V.s = Math.max(0.01, Math.min(500, Math.min(W / bw, H / bh) * 0.8));
    V.ox = W / 2 - (minX + maxX) / 2 * V.s; V.oy = H / 2 + (minY + maxY) / 2 * V.s;
  }
  function resize() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const first = !resize.done;
    if (!first) { V.ox += (r.width - W) / 2; V.oy += (r.height - H) / 2; } // görüntünün ortası yerinde kalsın
    W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    if (first) { resize.done = true; fit(); }
    draw();
  }
  const ro = new ResizeObserver(resize); ro.observe(wrap);
  function zoomAt(f, mx, my) {
    const ns = Math.max(0.005, Math.min(2000, V.s * f)), k = ns / V.s;
    V.ox = mx - (mx - V.ox) * k; V.oy = my - (my - V.oy) * k; V.s = ns;
  }

  /* ---------- yakalama ---------- */
  function snapAt(sx, sy) {
    let w = toW(sx, sy);
    const base = pts.length ? pts[pts.length - 1] : null;
    if (osnap) {
      if (snapVer !== ver) { snapCache = snapPoints(doc.ents.filter(visible)); snapVer = ver; }
      let best = null, bd = 22;
      const pri = { end: 0, int: 0, cen: 1, mid: 2, quad: 3 };
      for (const c of snapCache) {
        const [x, y] = toS(c.p), d = Math.hypot(x - sx, y - sy);
        if (d < bd - 4 || (d < bd + 4 && best && pri[c.k] < pri[best.k])) { best = c; bd = Math.min(bd, d); }
      }
      if (best) return { p: best.p.slice(), k: best.k };
    }
    if (ortho && base && ['line', 'move', 'copy', 'mirror', 'dim'].includes(tool)) {
      if (Math.abs(w[0] - base[0]) >= Math.abs(w[1] - base[1])) w = [w[0], base[1]]; else w = [base[0], w[1]];
    }
    if (grid > 0) w = [Math.round(w[0] / grid) * grid, Math.round(w[1] / grid) * grid];
    if (ortho && base && ['line', 'move', 'copy', 'mirror', 'dim'].includes(tool)) {
      if (Math.abs(w[0] - base[0]) >= Math.abs(w[1] - base[1])) w[1] = base[1]; else w[0] = base[0];
    }
    return { p: w, k: 'grid' };
  }
  function hitEnt(sx, sy, filter = editable) {
    const w = toW(sx, sy);
    let best = null, bd = 16;
    // geometri isteyen komutlar tarama / ölçü / yazıyı seçmesin
    const geoOnly = ['trim', 'extend', 'offset', 'fillet', 'setdim', 'scale', 'rdim', 'adim'].includes(tool);
    for (const e of doc.ents) {
      if (!filter(e)) continue;
      if (geoOnly && !(e.t === 'line' || e.t === 'circle' || e.t === 'arc')) continue;
      let d;
      if (e.t === 'circle') d = Math.abs(dist(w, e.c) - e.r) * V.s;
      else if (e.t === 'text') { const b = entBBox(e); d = w[0] >= b.minX && w[0] <= b.maxX && w[1] >= b.minY && w[1] <= b.maxY ? 0 : 99; }
      else if (e.t === 'hatch') { d = dist(nearestOn(e, w).p, w) * V.s + 4; if (pointInPoly(e.loops[0], w) && !e.loops.slice(1).some((l) => pointInPoly(l, w))) d = Math.min(d, 12); }
      else d = dist(nearestOn(e, w).p, w) * V.s;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  /* ---------- çizim ---------- */
  function strokeEnt(e, color, width, dash) {
    g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash || []);
    if (e.t === 'line') { const a = toS(e.a), b = toS(e.b); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); }
    else if (e.t === 'circle') { const c = toS(e.c); g.beginPath(); g.arc(c[0], c[1], e.r * V.s, 0, Math.PI * 2); g.stroke(); }
    else if (e.t === 'arc') { const c = toS(e.c); g.beginPath(); g.arc(c[0], c[1], e.r * V.s, -e.a0, -(e.a0 + arcSpan(e)), true); g.stroke(); }
    else if (e.t === 'dim') {
      g.setLineDash([]);
      for (const s of dimParts(e)) { g.beginPath(); g.moveTo(...toS(s[0])); g.lineTo(...toS(s[1])); g.stroke(); }
      const dl = dimLine(e), m = toS([(dl.a[0] + dl.b[0]) / 2, (dl.a[1] + dl.b[1]) / 2]);
      let ang = -Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0]);
      if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
      const hpx = Math.max(10, (e.h || 3.5) * V.s);
      g.save(); g.translate(m[0], m[1]); g.rotate(ang);
      g.font = `${Math.min(hpx, 60)}px system-ui, sans-serif`; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'bottom';
      g.fillText(dimText(e), 0, -2); g.restore();
    } else if (e.t === 'hatch' || e.t === 'rdim' || e.t === 'adim') {
      if (e.t === 'hatch') { g.lineWidth = Math.max(0.8, width * 0.6); g.globalAlpha = 0.85; }
      else g.setLineDash([]);
      const segs = e.t === 'hatch' ? hatchSegs(e) : e.t === 'rdim' ? rdimParts(e) : adimParts(e);
      g.beginPath();
      for (const sg of segs) { g.moveTo(...toS(sg[0])); g.lineTo(...toS(sg[1])); }
      g.stroke(); g.globalAlpha = 1;
      if (e.t !== 'hatch') {
        const hpx = Math.max(10, (e.h || 3.5) * V.s), tx = e.t === 'rdim' ? rdimText(e) : adimText(e), q = toS(e.t === 'rdim' ? e.p : adimTextPos(e));
        g.font = `${Math.min(hpx, 60)}px system-ui, sans-serif`; g.fillStyle = color;
        g.textAlign = e.t === 'rdim' ? (e.p[0] >= e.c[0] ? 'left' : 'right') : 'center'; g.textBaseline = e.t === 'rdim' ? 'bottom' : 'middle';
        g.fillText(tx, q[0] + (e.t === 'rdim' ? (e.p[0] >= e.c[0] ? 3 : -3) : 0), q[1] - (e.t === 'rdim' ? 2 : 0));
      }
    } else if (e.t === 'text') {
      const p = toS(e.p), hpx = Math.max(6, (e.h || 5) * V.s);
      g.font = `${Math.min(hpx, 200)}px system-ui, sans-serif`; g.fillStyle = color; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
      g.fillText(e.s, p[0], p[1]);
    }
    g.setLineDash([]);
  }
  function previewEnts() {
    const p = aim ? aim.p : null, P = pts;
    if (!p) return [];
    switch (tool) {
      case 'line': return P.length ? [{ t: 'line', a: P[P.length - 1], b: p }] : [];
      case 'circle': return P.length ? [{ t: 'circle', c: P[0], r: Math.max(dist(P[0], p), 1e-6) }] : [];
      case 'arc': if (P.length === 1) return [{ t: 'line', a: P[0], b: p }]; if (P.length === 2) { const a = arcFrom3(P[0], P[1], p); return a ? [a] : []; } return [];
      case 'rect': return P.length ? rectLines(P[0], p) : [];
      case 'dim': if (P.length === 1) return [{ t: 'line', a: P[0], b: p }]; if (P.length === 2) return [{ t: 'dim', a: P[0], b: P[1], off: dimOff(P[0], P[1], p) }]; return [];
      case 'move': case 'copy': if (P.length === 1) return selected().map((e) => transformEntity(e, moveFn(p[0] - P[0][0], p[1] - P[0][1]))); return [];
      case 'mirror': if (P.length === 1 && dist(P[0], p) > 1e-9) return selected().map((e) => transformEntity(e, mirrorFn(P[0], p), 'mirror')); return [];
    }
    return [];
  }
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, W, H);
    // ızgara
    let gs = NICE[NICE.length - 1];
    for (const n of NICE) if (n * V.s >= 12) { gs = n; break; }
    const [u0, v1] = toW(0, 0), [u1, v0] = toW(W, H);
    g.lineWidth = 1;
    for (const [mul, col] of [[1, 'rgba(148,163,184,.10)'], [5, 'rgba(148,163,184,.22)']]) {
      const st = gs * mul; g.beginPath(); g.strokeStyle = col;
      for (let x = Math.ceil(u0 / st) * st, c = 0; x <= u1 && c < 500; x += st, c++) { const sx = Math.round(toS([x, 0])[0]) + 0.5; g.moveTo(sx, 0); g.lineTo(sx, H); }
      for (let y = Math.ceil(v0 / st) * st, c = 0; y <= v1 && c < 500; y += st, c++) { const sy = Math.round(toS([0, y])[1]) + 0.5; g.moveTo(0, sy); g.lineTo(W, sy); }
      g.stroke();
    }
    const o = toS([0, 0]);
    g.lineWidth = 1.2; g.beginPath(); g.strokeStyle = 'rgba(239,68,68,.6)'; g.moveTo(0, o[1]); g.lineTo(W, o[1]); g.stroke();
    g.beginPath(); g.strokeStyle = 'rgba(34,197,94,.6)'; g.moveTo(o[0], 0); g.lineTo(o[0], H); g.stroke();
    // varlıklar
    for (const e of doc.ents) {
      if (!visible(e)) continue;
      const L = layerOf(e.layer);
      const col = ACI[L.aci] || '#f1f5f9';
      strokeEnt(e, sel.has(e.id) ? '#fbbf24' : col, sel.has(e.id) ? 2.6 : 1.6, (LT_DASH[L.lt] || []));
    }
    if (pickA) strokeEnt(pickA, '#f97316', 3.5);
    if (pickB) strokeEnt(pickB, '#f97316', 3.5);
    if (tool === 'autodim' && auto) for (const m of auto.matches) {
      const e = auto.added[m.ei], t = auto.texts[m.ti];
      if (!e || !doc.ents.includes(e)) continue;
      strokeEnt(e, m.on ? '#fb923c' : '#64748b', 3);
      const tp = toS(t.p), np = toS(nearestOn(e, t.p).p);
      g.strokeStyle = m.on ? '#fb923c' : '#64748b'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(...tp); g.lineTo(...np); g.stroke(); g.setLineDash([]);
    }
    for (const e of previewEnts()) strokeEnt(e, '#38bdf8', 1.6, [5, 4]);
    // toplanan noktalar
    for (const p of pts) { const s = toS(p); g.fillStyle = '#fbbf24'; g.beginPath(); g.arc(s[0], s[1], 4, 0, 7); g.fill(); }
    // nişan + yakalama işareti
    if (aim) {
      const s = toS(aim.p);
      g.strokeStyle = 'rgba(226,232,240,.55)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(s[0] - 30, s[1]); g.lineTo(s[0] + 30, s[1]); g.moveTo(s[0], s[1] - 30); g.lineTo(s[0], s[1] + 30); g.stroke();
      if (aim.k !== 'grid') {
        g.strokeStyle = '#22c55e'; g.lineWidth = 2; g.beginPath();
        if (aim.k === 'end') g.rect(s[0] - 7, s[1] - 7, 14, 14);
        else if (aim.k === 'mid') { g.moveTo(s[0], s[1] - 8); g.lineTo(s[0] + 8, s[1] + 6); g.lineTo(s[0] - 8, s[1] + 6); g.closePath(); }
        else if (aim.k === 'cen') g.arc(s[0], s[1], 7, 0, 7);
        else if (aim.k === 'int') { g.moveTo(s[0] - 7, s[1] - 7); g.lineTo(s[0] + 7, s[1] + 7); g.moveTo(s[0] + 7, s[1] - 7); g.lineTo(s[0] - 7, s[1] + 7); }
        else { g.moveTo(s[0], s[1] - 8); g.lineTo(s[0] + 8, s[1]); g.lineTo(s[0], s[1] + 8); g.lineTo(s[0] - 8, s[1]); g.closePath(); }
        g.stroke();
      }
      // büyüteç: parmağın altını büyütüp yukarıda gösterir
      if (down) {
        const R = 56, Z = 2.2, lx = Math.min(Math.max(s[0], R + 4), W - R - 4), ly = s[1] - 110 < R + 4 ? s[1] + 110 : s[1] - 110;
        g.save(); g.beginPath(); g.arc(lx, ly, R, 0, 7); g.clip();
        g.drawImage(cv, (s[0] - R / Z) * dpr, (s[1] - R / Z) * dpr, (2 * R / Z) * dpr, (2 * R / Z) * dpr, lx - R, ly - R, 2 * R, 2 * R);
        g.restore();
        g.strokeStyle = '#38bdf8'; g.lineWidth = 2; g.beginPath(); g.arc(lx, ly, R, 0, 7); g.stroke();
        g.fillStyle = '#ef4444'; g.beginPath(); g.arc(lx, ly, 2.5, 0, 7); g.fill();
      }
    }
    // durum satırı
    const kName = { end: 'uç nokta', mid: 'orta nokta', cen: 'merkez', int: 'kesişim', quad: 'çeyrek', grid: '' };
    let st = aim ? 'X ' + fmt(aim.p[0]) + '  Y ' + fmt(aim.p[1]) + (aim.k !== 'grid' ? '  · ' + kName[aim.k] : '') : 'Varlık: ' + doc.ents.length + (sel.size ? '  · Seçili: ' + sel.size : '');
    if (aim && pts.length && ['line', 'move', 'copy', 'dim', 'rect'].includes(tool)) {
      const b = pts[pts.length - 1], d = dist(b, aim.p), a = Math.atan2(aim.p[1] - b[1], aim.p[0] - b[0]) * 180 / Math.PI;
      st += tool === 'rect' ? '  · ' + fmt(Math.abs(aim.p[0] - b[0])) + ' × ' + fmt(Math.abs(aim.p[1] - b[1])) : '  · L ' + fmt(d) + '  ∠ ' + fmt(a) + '°';
    }
    if (aim && tool === 'circle' && pts.length) st += '  · Ø ' + fmt(2 * dist(pts[0], aim.p));
    $('cad-stat').textContent = st + '   [Katman: ' + doc.cur + ']';
  }

  /* ---------- yardımcılar ---------- */
  const selected = () => doc.ents.filter((e) => sel.has(e.id) && editable(e));
  function rectLines(a, b) {
    return [{ t: 'line', a: [a[0], a[1]], b: [b[0], a[1]] }, { t: 'line', a: [b[0], a[1]], b: [b[0], b[1]] },
      { t: 'line', a: [b[0], b[1]], b: [a[0], b[1]] }, { t: 'line', a: [a[0], b[1]], b: [a[0], a[1]] }];
  }
  function dimOff(a, b, p) {
    const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d) || 1;
    return ((p[0] - a[0]) * -d[1] + (p[1] - a[1]) * d[0]) / L;
  }
  function setHint(m, err) { $('cad-hint').textContent = m; $('cad-hint').classList.toggle('err', !!err); }
  function hintNow() { const h = HINTS[tool] || ['']; return h[Math.min(pts.length + (pickA && ['offset', 'fillet', 'rdim', 'adim'].includes(tool) ? 1 : 0) + (pickB ? 1 : 0), h.length - 1)]; }
  function reset() { pts = []; pickA = null; pickB = null; }
  const dimLayer = () => (doc.layers.some((l) => l.name === 'Ölçü') ? 'Ölçü' : doc.cur);
  // çap / yarıçap ölçüsünü şeklin dışına, sağ üste koyar
  function autoRdim(e, hh) { const k = 0.7071; return { t: 'rdim', c: e.c.slice(), r: e.r, p: [e.c[0] + e.r * k + hh * 3, e.c[1] + e.r * k + hh * 3], dia: e.t === 'circle', h: hh, layer: dimLayer() }; }

  /* ---------- komutlar ---------- */
  function placePoint(p) {
    switch (tool) {
      case 'line':
        if (!pts.length) { pts = [p]; break; }
        if (dist(pts[pts.length - 1], p) < 1e-9) break;
        commit(); addEnt({ t: 'line', a: pts[pts.length - 1].slice(), b: p.slice() }); changed();
        pts.push(p);
        break;
      case 'circle':
        if (!pts.length) { pts = [p]; break; }
        if (dist(pts[0], p) < 1e-9) break;
        commit(); addEnt({ t: 'circle', c: pts[0].slice(), r: dist(pts[0], p) }); changed(); reset();
        break;
      case 'arc': {
        pts.push(p);
        if (pts.length < 3) break;
        const a = arcFrom3(pts[0], pts[1], pts[2]);
        if (!a) { setHint('Üç nokta bir doğru üzerinde; yay olmaz.', true); pts.pop(); return; }
        commit(); addEnt(a); changed(); reset();
        break;
      }
      case 'rect':
        if (!pts.length) { pts = [p]; break; }
        if (Math.abs(p[0] - pts[0][0]) < 1e-9 || Math.abs(p[1] - pts[0][1]) < 1e-9) break;
        commit(); for (const l of rectLines(pts[0], p)) addEnt(l); changed(); reset();
        break;
      case 'dim':
        pts.push(p);
        if (pts.length === 2 && dist(pts[0], pts[1]) < 1e-9) { pts.pop(); break; }
        if (pts.length < 3) break;
        commit(); addEnt({ t: 'dim', a: pts[0], b: pts[1], off: dimOff(pts[0], pts[1], p), h: 3.5, layer: doc.layers.some((l) => l.name === 'Ölçü') ? 'Ölçü' : doc.cur }); changed(); reset();
        break;
      case 'text': {
        const s = String(F.txt || '').trim();
        if (!s) { setHint('Önce aşağıya yazıyı yaz.', true); return; }
        commit(); addEnt({ t: 'text', p, h: num('th') > 0 ? num('th') : 5, s }); changed();
        break;
      }
      case 'move': case 'copy':
        if (!sel.size) { setHint('Önce Seç aracıyla varlıkları seç.', true); return; }
        if (!pts.length) { pts = [p]; break; }
        doMove(p[0] - pts[0][0], p[1] - pts[0][1]);
        break;
      case 'rotate':
        if (!sel.size) { setHint('Önce Seç aracıyla varlıkları seç.', true); return; }
        pts = [p];
        break;
      case 'mirror':
        if (!sel.size) { setHint('Önce Seç aracıyla varlıkları seç.', true); return; }
        if (!pts.length) { pts = [p]; break; }
        if (dist(pts[0], p) < 1e-9) break;
        commit();
        { const f = mirrorFn(pts[0], p), list = selected();
          const out = list.map((e) => addEnt({ ...transformEntity(e, f, 'mirror'), layer: e.layer }));
          if (F.keep === '0') doc.ents = doc.ents.filter((e) => !list.includes(e));
          sel = new Set(out.map((e) => e.id)); }
        changed(); reset();
        break;
      case 'array': {
        if (!sel.size) { setHint('Önce Seç aracıyla çoğaltılacakları seç.', true); return; }
        const n = Math.round(num('an')), A = num('aang') * Math.PI / 180;
        if (!(n >= 2 && n <= 500) || !A) { setHint('Adet 2–500 arası, açı sıfırdan farklı olmalı.', true); return; }
        commit();
        const list = selected();
        for (const en of arrayPolar(list, n, A, p, F.arot === '1')) addEnt({ ...en, layer: en.layer });
        changed(); refresh(); setHint(n + ' adet dairesel dizi yapıldı. Başka merkeze dokunarak tekrar dizebilirsin.');
        return;
      }
      case 'offset':
        if (!pickA) return;
        { const d = num('off');
          if (!(d > 0)) { setHint('Ofset mesafesi sıfırdan büyük olmalı.', true); return; }
          const o = offsetEntity(pickA, d, p);
          if (!o) { setHint('Bu tarafa ofset yapılamaz (yarıçap sıfırın altına iner).', true); return; }
          commit(); addEnt({ ...o, layer: pickA.layer }); changed(); pickA = null; }
        break;
    }
    refresh();
  }
  function doMove(dx, dy) {
    commit();
    const list = selected();
    if (tool === 'move') { for (const e of list) Object.assign(e, transformEntity(e, moveFn(dx, dy))); reset(); }
    else for (const e of list) addEnt({ ...transformEntity(e, moveFn(dx, dy)), layer: e.layer });
    changed(); refresh();
  }
  function pickCommand(sx, sy) {
    const w = toW(sx, sy);
    if (tool === 'select') {
      const e = hitEnt(sx, sy, visible);
      if (e) { if (sel.has(e.id)) sel.delete(e.id); else sel.add(e.id); }
      else sel.clear();
      refresh(); return;
    }
    if (tool === 'offset' && pickA) { placePoint(snapAt(sx, sy).p); return; }
    if (tool === 'hatch') {
      const loops = findHatchRegion(doc.ents.filter(visible), w);
      if (!loops) { setHint('Burası kapalı bir alan değil. Çizgilerin uçları birbirine değmeli (uç nokta yakalama).', true); return; }
      const sp = num('hsp'), ang = num('hang');
      if (!(sp > 0) || !isFinite(ang)) { setHint('Aralık sıfırdan büyük olmalı.', true); return; }
      commit(); addEnt({ t: 'hatch', loops, ang: ang * Math.PI / 180, sp }); changed(); refresh();
      setHint('Tarandı' + (loops.length > 1 ? ' (' + (loops.length - 1) + ' delik boş bırakıldı)' : '') + '. Başka alana dokunarak devam et.');
      return;
    }
    if (tool === 'rdim' && pickA) {
      commit(); addEnt({ t: 'rdim', c: pickA.c.slice(), r: pickA.r, p: w, dia: F.rdia === '1', h: 3.5, layer: dimLayer() });
      changed(); reset(); refresh(); return;
    }
    if (tool === 'adim' && pickB) {
      const a = angDimFrom(pickA, pickB, w);
      if (!a) { setHint('Bu iki çizgi paralel; açı ölçülemez.', true); reset(); refresh(); return; }
      commit(); addEnt({ ...a, h: 3.5, layer: dimLayer() }); changed(); reset(); refresh(); return;
    }
    const e = hitEnt(sx, sy);
    if (!e) { setHint('Orada varlık yok; çizginin üstüne dokun.', true); return; }
    const others = doc.ents.filter(visible);
    if (tool === 'setdim') {
      if (!(e.t === 'line' || e.t === 'circle' || e.t === 'arc')) { setHint('Çizgi, daire ya da yaya dokun.', true); return; }
      pickA = e; pickA._p = w; F.dv = fmt(e.t === 'line' ? dist(e.a, e.b) : e.t === 'circle' ? 2 * e.r : e.r); refresh(); return;
    }
    if (tool === 'scale') {
      if (!(e.t === 'line' || e.t === 'circle' || e.t === 'arc')) { setHint('Çizgi, daire ya da yaya dokun.', true); return; }
      pickA = e; F.real = fmt(scaleRef(e)); refresh(); return;
    }
    if (tool === 'rdim') {
      if (!(e.t === 'circle' || e.t === 'arc')) { setHint('Daireye ya da yaya dokun.', true); return; }
      pickA = e; F.rdia = e.t === 'circle' ? '1' : '0'; refresh(); return;
    }
    if (tool === 'adim') {
      if (e.t !== 'line') { setHint('Açı iki çizgi arasında ölçülür; çizgiye dokun.', true); return; }
      if (!pickA) { pickA = e; refresh(); return; }
      if (e === pickA) return;
      pickB = e; refresh(); return;
    }
    if (tool === 'erase') { commit(); doc.ents.splice(doc.ents.indexOf(e), 1); sel.delete(e.id); changed(); refresh(); return; }
    if (tool === 'trim') {
      const r = trimEntity(e, others, w);
      if (r === null) { setHint('Bu varlık burada kırpılamıyor (en az iki kesişim gerekir).', true); return; }
      commit(); replaceEnt(e, r); changed(); refresh(); return;
    }
    if (tool === 'extend') {
      const r = extendEntity(e, others, w);
      if (!r) { setHint('Uzatılacak bir sınır bulunamadı (çizgi / yay doğrultusunda başka varlık yok).', true); return; }
      commit(); replaceEnt(e, [r]); changed(); refresh(); return;
    }
    if (tool === 'offset') { pickA = e; refresh(); return; }
    if (tool === 'fillet') {
      if (e.t !== 'line') { setHint('Radyus iki çizgi arasında yapılır.', true); return; }
      if (!pickA) { pickA = e; pickA._p = w; refresh(); return; }
      if (e === pickA) return;
      const r = filletLines(pickA, e, Math.max(num('rad') || 0, 0), pickA._p, w);
      delete pickA._p;
      if (!r) { setHint('Bu çizgiler arasında radyus yapılamıyor (paralel ya da yarıçap çok büyük).', true); pickA = null; refresh(); return; }
      commit();
      replaceEnt(pickA, [r.l1]); replaceEnt(e, [r.l2]);
      if (r.arc) addEnt({ ...r.arc, layer: pickA.layer });
      changed(); pickA = null; refresh();
    }
  }

  /* ---------- arayüz ---------- */
  const B = (lbl, a, on, extra = '') => `<button data-a="${a}"${on ? ' class="on"' : ''} ${extra}>${lbl}</button>`;
  const In = (lbl, k, type = 'number') => `<label class="f"><span>${lbl}</span><input type="${type}" ${type === 'number' ? 'step="any" inputmode="decimal"' : ''} data-k="${k}" value="${String(F[k]).replace(/"/g, '&quot;')}"></label>`;
  function renderTabs() {
    $('cad-tabs').innerHTML = [['draw', 'Çiz'], ['edit', 'Düzenle'], ['layer', 'Katman'], ['file', 'Dosya']].map(([k, l]) => `<button class="tab${tab === k ? ' on' : ''}" data-a="tab-${k}">${l}</button>`).join('');
    $('cad-tools').innerHTML = TOOLS[tab] ? TOOLS[tab].map(([k, l]) => B(l, 'tool-' + k, tool === k)).join('') : '';
  }
  function renderFields() {
    let h = '';
    if (tab === 'layer') {
      h += '<div class="lb">Katmanlar (dokun = etkin katman)</div>';
      for (const L of doc.layers) {
        h += `<div class="ly"><span class="sw" style="background:${ACI[L.aci] || '#fff'}"></span>` +
          `<button class="nm${doc.cur === L.name ? ' on' : ''}" data-a="ly-cur" data-n="${encodeURIComponent(L.name)}" style="flex:2;text-align:left;padding-left:8px">${L.name.replace(/</g, '&lt;')}</button>` +
          `<button data-a="ly-col" data-n="${encodeURIComponent(L.name)}">🎨</button>` +
          `<button data-a="ly-lt" data-n="${encodeURIComponent(L.name)}">${LT_NAME[L.lt] || 'Sürekli'}</button>` +
          `<button data-a="ly-vis" data-n="${encodeURIComponent(L.name)}">${L.hidden ? '🚫' : '👁'}</button>` +
          `<button data-a="ly-lock" data-n="${encodeURIComponent(L.name)}">${L.locked ? '🔒' : '🔓'}</button></div>`;
      }
      h += In('Yeni katman adı', 'nl', 'text') + B('+ Katman ekle', 'ly-add') + B('Seçilenleri etkin katmana taşı', 'ly-move', false, sel.size ? '' : 'disabled');
    } else if (tab === 'file') {
      h += '<div class="lb">Dosya</div>' + B('⬇ DXF kaydet', 'f-dxf') + B('📂 DXF aç', 'f-open') + B('🖼 PNG kaydet', 'f-png') +
        '<div class="lb">Kağıttan çizim: el çiziminin fotoğrafını çek, çizgiler otomatik tanınsın</div>' + B('📷 Fotoğraftan çizim', 'f-photo') +
        '<div class="lb">3B parçaya çevir (kapalı şekiller kalınlık alır; iç içe olan delik olur)</div>' + In('Kalınlık (mm)', 'thick') + B('🧊 3B parça yap', 'f-3d') +
        '<div class="lb">Çizim</div>' + B(clearArm ? '⚠ Emin misin? Tekrar bas' : '🗑 Tümünü temizle', 'f-clear', false, clearArm ? 'class="danger"' : '');
    } else {
      if (tool === 'line') h += (pts.length ? In('Uzunluk', 'len') + In('Açı °', 'ang') + B('Ekle', 'in-line') + B('Bitir', 'end') + B('Kapat', 'in-close', false, pts.length >= 3 ? '' : 'disabled') : In('X', 'x') + In('Y', 'y') + B('Nokta koy', 'in-pt'));
      else if (tool === 'circle') h += pts.length ? In('Çap', 'd') + B('Ekle', 'in-circle') : In('X', 'x') + In('Y', 'y') + B('Merkez koy', 'in-pt');
      else if (tool === 'rect') h += pts.length ? In('Genişlik', 'w') + In('Yükseklik', 'h') + B('Ekle', 'in-rect') : In('X', 'x') + In('Y', 'y') + B('Köşe koy', 'in-pt');
      else if (tool === 'arc' || tool === 'dim') h += In('X', 'x') + In('Y', 'y') + B('Nokta koy', 'in-pt');
      else if (tool === 'text') h += In('Yazı', 'txt', 'text') + In('Yükseklik', 'th');
      else if (tool === 'offset') h += In('Ofset mesafesi', 'off');
      else if (tool === 'hatch') h += In('Açı °', 'hang') + In('Aralık (mm)', 'hsp') + B('45°', 'hp-45') + B('0°', 'hp-0') + B('Çapraz kafes', 'hp-x');
      else if (tool === 'rdim') h += B('Ø Çap', 'rd-1', F.rdia === '1') + B('R Yarıçap', 'rd-0', F.rdia !== '1');
      else if (tool === 'array') {
        h += B('▦ Dikdörtgen', 'am-rect', F.amode === 'rect') + B('◎ Dairesel', 'am-polar', F.amode === 'polar');
        if (!sel.size) h += '<div class="lb" style="color:#fca5a5">Önce ☝ Seç ile çoğaltılacak varlıkları seç.</div>';
        if (F.amode === 'rect') h += In('Satır', 'arows') + In('Sütun', 'acols') + In('Sütun aralığı X', 'adx') + In('Satır aralığı Y', 'ady') + B('✓ Uygula', 'in-arect', false, sel.size ? '' : 'disabled');
        else h += In('Adet (asıl dahil)', 'an') + In('Toplam açı °', 'aang') + B('Döndürerek: ' + (F.arot === '1' ? 'evet' : 'hayır'), 'tg-arot', F.arot === '1') + '<div class="lb">Sonra dizinin merkezine dokun.</div>';
      }
      else if (tool === 'fillet') h += In('Yarıçap (0 = keskin)', 'rad');
      else if (tool === 'autodim') {
        if (!auto || !auto.matches.length) h += '<div class="lb">Eşlenecek ölçü yok.</div>';
        else {
          h += '<div class="lb">Okunan ölçüler (dokun = aç / kapat). İlk ve en uzun çizgi ölçeği belirler, diğerleri esnetilir.</div>';
          auto.matches.forEach((m, i) => {
            const e = auto.added[m.ei];
            const what = m.kind === 'len' ? 'çizgi' : m.kind === 'dia' ? 'daire (çap)' : 'yay (yarıçap)';
            h += B((m.on ? '✓ ' : '✕ ') + auto.texts[m.ti].s + ' → ' + what + ' (şu an ' + fmt(m.kind === 'len' ? dist(e.a, e.b) : m.kind === 'dia' ? 2 * e.r : e.r) + ')', 'ad-' + i, m.on);
          });
          const un = auto.texts.filter((t, i) => !auto.matches.some((m) => m.ti === i));
          if (un.length) h += '<div class="lb" style="color:#fca5a5">Eşlenemeyen: ' + un.map((t) => t.s).join(', ') + ' (Ölçü ver ile elle girebilirsin)</div>';
          h += B('✓ Ölçüleri uygula', 'ad-apply') + B('Vazgeç', 'ad-cancel');
        }
      }
      else if (tool === 'setdim') h += pickA ? '<div class="lb">Şu an: ' + fmt(pickA.t === 'line' ? dist(pickA.a, pickA.b) : pickA.t === 'circle' ? 2 * pickA.r : pickA.r) + ' mm (' + (pickA.t === 'line' ? 'uzunluk' : pickA.t === 'circle' ? 'çap' : 'yarıçap') + ')</div>' +
        In(pickA.t === 'line' ? 'Uzunluk (mm)' : pickA.t === 'circle' ? 'Çap (mm)' : 'Yarıçap (mm)', 'dv') + B('✓ Uygula', 'in-setdim') + B('Ölçü yazısı ekle: ' + (F.adddim === '1' ? 'evet' : 'hayır'), 'tg-adddim', F.adddim === '1') : '';
      else if (tool === 'scale') h += pickA ? '<div class="lb">Şu an: ' + fmt(scaleRef(pickA)) + ' mm (' + (pickA.t === 'line' ? 'uzunluk' : 'çap') + ')</div>' + In('Gerçek ölçü (mm)', 'real') + B('📏 Ölçekle', 'in-scale') : In('ya da katsayı (ör. 2 = iki kat)', 'kf') + B('Katsayıyla ölçekle', 'in-scalek');
      else if (tool === 'move' || tool === 'copy') h += pts.length ? In('dX', 'dx') + In('dY', 'dy') + B('Uygula', 'in-move') : '';
      else if (tool === 'rotate') h += In('Açı ° (saat yönü tersi +)', 'rot') + B('⟳ Döndür', 'in-rot', false, pts.length && sel.size ? '' : 'disabled') + B('Kopyasını döndür', 'in-rotc', false, pts.length && sel.size ? '' : 'disabled');
      else if (tool === 'mirror') h += B(F.keep === '0' ? 'Aslını sil: evet' : 'Aslını sil: hayır', 'keep', F.keep === '0');
      else if (tool === 'select') h += B('Tümünü seç', 'sel-all') + B('Seçimi bırak', 'sel-none', false, sel.size ? '' : 'disabled') + B('Seçileni sil', 'sel-del', false, sel.size ? '' : 'disabled');
      if (pts.length || pickA) h += B('✕ Komutu iptal', 'cancel-cmd');
      h += '<div class="lb">Yardımcılar</div>' + B('Yakalama: ' + (osnap ? 'açık' : 'kapalı'), 'osnap', osnap) + B('Orto: ' + (ortho ? 'açık' : 'kapalı'), 'ortho', ortho) +
        `<label class="f"><span>Izgara adımı</span><select data-k="grid">${[0, 0.5, 1, 5, 10].map((v) => `<option value="${v}"${v === grid ? ' selected' : ''}>${v === 0 ? 'Serbest' : v + ' mm'}</option>`).join('')}</select></label>`;
    }
    $('cad-fields').innerHTML = h;
  }
  function refresh() {
    renderTabs(); renderFields();
    if (tab === 'layer') setHint('Etkin katman yeni çizimlerin gideceği katmandır. 👁 gizle, 🔒 kilitle (kilitli katman düzenlenmez).');
    else if (tab === 'file') setHint('DXF: AutoCAD, LibreCAD, FreeCAD ile açılır. Çizim telefonda otomatik saklanır.');
    else setHint(hintNow());
    const ub = root.querySelector('[data-a="undo"]'), rb = root.querySelector('[data-a="redo"]');
    ub.disabled = !undoS.length; rb.disabled = !redoS.length;
    draw();
  }

  /* ---------- dokunma ---------- */
  const ptrs = new Map();
  let pinch = null, down = null, panning = null;
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const pointTools = ['line', 'circle', 'arc', 'rect', 'dim', 'text', 'move', 'copy', 'rotate', 'mirror'];
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size === 2) {
      const a = [...ptrs.values()];
      pinch = { d: Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) || 1, mx: (a[0][0] + a[1][0]) / 2, my: (a[0][1] + a[1][1]) / 2 };
      down = null; aim = null; panning = null; draw(); return;
    }
    if (ptrs.size > 2) return;
    const [sx, sy] = local(e);
    down = { sx, sy, moved: false };
    const wantsPoint = pointTools.includes(tool) || (tool === 'offset' && pickA) || (tool === 'array' && F.amode === 'polar' && sel.size > 0);
    if (wantsPoint) { aim = snapAt(sx, sy); draw(); }
    else panning = { sx, sy, ox: V.ox, oy: V.oy };
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    ptrs.set(e.pointerId, local(e));
    if (ptrs.size >= 2 && pinch) {
      const a = [...ptrs.values()];
      const d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]) || 1, mx = (a[0][0] + a[1][0]) / 2, my = (a[0][1] + a[1][1]) / 2;
      zoomAt(d / pinch.d, mx, my); V.ox += mx - pinch.mx; V.oy += my - pinch.my;
      pinch = { d, mx, my }; draw(); return;
    }
    if (!down) return;
    const [sx, sy] = local(e);
    if (Math.hypot(sx - down.sx, sy - down.sy) > 6) down.moved = true;
    if (panning) { if (down.moved) { V.ox = panning.ox + sx - panning.sx; V.oy = panning.oy + sy - panning.sy; draw(); } return; }
    aim = snapAt(sx, sy); draw();
  });
  function up(e) {
    if (!ptrs.has(e.pointerId)) return;
    const [sx, sy] = local(e);
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    const d = down; down = null;
    if (!d) { draw(); return; }
    if (panning) { panning = null; if (!d.moved) pickCommand(sx, sy); else draw(); return; }
    const a = aim || snapAt(sx, sy);
    aim = null;
    placePoint(a.p);
  }
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); pinch = null; down = null; aim = null; panning = null; draw(); });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const [sx, sy] = local(e); zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, sx, sy); draw(); }, { passive: false });

  /* ---------- düğmeler ---------- */
  function close() { ro.disconnect(); clearTimeout(saveT); try { localStorage.setItem(KEY, snap()); } catch (e) { /* */ } root.remove(); if (opts.onClose) opts.onClose(); }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function exportPNG() {
    const bbs = doc.ents.filter(visible).map(entBBox).filter(Boolean);
    if (!bbs.length) { setHint('Çizim boş.', true); return; }
    const minX = Math.min(...bbs.map((b) => b.minX)), maxX = Math.max(...bbs.map((b) => b.maxX)), minY = Math.min(...bbs.map((b) => b.minY)), maxY = Math.max(...bbs.map((b) => b.maxY));
    const keep = { ...V, W, H, dpr };
    const PW = 2400, PH = Math.round(PW * Math.max(maxY - minY, 1) / Math.max(maxX - minX, 1));
    const ph = Math.min(Math.max(PH, 600), 4000);
    const c2 = document.createElement('canvas'); c2.width = PW; c2.height = ph;
    const g0 = g, sel0 = sel, aim0 = aim;
    g = c2.getContext('2d'); sel = new Set(); aim = null;
    W = PW; H = ph; dpr = 1;
    V.s = Math.min(PW / Math.max(maxX - minX, 1), ph / Math.max(maxY - minY, 1)) * 0.9;
    V.ox = PW / 2 - (minX + maxX) / 2 * V.s; V.oy = ph / 2 + (minY + maxY) / 2 * V.s;
    try { draw(); } finally {
      g = g0; sel = sel0; aim = aim0;
      Object.assign(V, { s: keep.s, ox: keep.ox, oy: keep.oy }); W = keep.W; H = keep.H; dpr = keep.dpr;
    }
    c2.toBlob((b) => { if (b) download(b, 'cizim.png'); }, 'image/png');
    draw();
  }
  function to3D() {
    const ents = doc.ents.filter(visible);
    const loops = closedLoops(ents);
    if (!loops.length) { setHint('Kapalı şekil bulunamadı. Çizgilerin uçları birbirine değmeli (uç nokta yakalamayı kullan).', true); return; }
    const th = num('thick');
    if (!(th > 0)) { setHint('Kalınlık sıfırdan büyük olmalı.', true); return; }
    // en büyük alanlı döngü dış kontur; ona değmeyen ayrık şekiller de ayrı döngü olarak gider (validateDraw iç içeyi delik yapar)
    const pts2 = loops.map((l) => l.map(([x, y]) => [x, -y])); // üstten kroki: ekranda aşağı = +Z
    const r = validateDraw('extrude', 'top', pts2, th);
    if (r.error) { setHint('3B yapılamadı: ' + r.error, true); return; }
    if (opts.onExtrude) { close(); opts.onExtrude(r.draw); }
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.a) return;
    const a = b.dataset.a;
    if (a !== 'f-clear') clearArm = false;
    if (a === 'close') { close(); return; }
    if (a === 'undo' || a === 'redo') {
      const from = a === 'undo' ? undoS : redoS, to = a === 'undo' ? redoS : undoS;
      if (!from.length) return;
      to.push(snap()); doc = JSON.parse(from.pop()); reset(); sel.clear(); changed(); refresh(); return;
    }
    if (a.startsWith('tab-')) { tab = a.slice(4); if (TOOLS[tab] && !TOOLS[tab].some(([k]) => k === tool)) tool = TOOLS[tab][0][0]; reset(); refresh(); return; }
    if (a.startsWith('tool-')) { tool = a.slice(5); reset(); refresh(); return; }
    if (a === 'zin') { zoomAt(1.4, W / 2, H / 2); draw(); return; }
    if (a === 'zout') { zoomAt(1 / 1.4, W / 2, H / 2); draw(); return; }
    if (a === 'zfit') { fit(); draw(); return; }
    if (a === 'osnap') { osnap = !osnap; refresh(); return; }
    if (a === 'ortho') { ortho = !ortho; refresh(); return; }
    if (a === 'keep') { F.keep = F.keep === '0' ? '1' : '0'; refresh(); return; }
    if (a === 'cancel-cmd' || a === 'end') { reset(); refresh(); return; }
    if (a === 'in-pt') { const x = num('x'), y = num('y'); if (isFinite(x) && isFinite(y)) placePoint([x, y]); return; }
    if (a === 'in-line') {
      const L = num('len'), A = num('ang') * Math.PI / 180, b0 = pts[pts.length - 1];
      if (!(L > 0) || !isFinite(A)) { setHint('Uzunluk ve açı yaz.', true); return; }
      placePoint([b0[0] + L * Math.cos(A), b0[1] + L * Math.sin(A)]); return;
    }
    if (a === 'in-close' && pts.length >= 3) { placePoint(pts[0].slice()); reset(); refresh(); return; }
    if (a === 'in-circle') { const d = num('d'); if (d > 0) placePoint([pts[0][0] + d / 2, pts[0][1]]); return; }
    if (a === 'in-rect') { const w = num('w'), h = num('h'); if (w > 0 && h > 0) placePoint([pts[0][0] + w, pts[0][1] + h]); return; }
    if (a === 'in-move') { const dx = num('dx'), dy = num('dy'); if (isFinite(dx) && isFinite(dy)) doMove(dx, dy); return; }
    if (a === 'in-rot' || a === 'in-rotc') {
      const ang = num('rot') * Math.PI / 180;
      if (!isFinite(ang) || !pts.length) return;
      commit();
      const f = rotateFn(pts[0], ang), list = selected();
      if (a === 'in-rot') for (const en of list) Object.assign(en, transformEntity(en, f));
      else sel = new Set(list.map((en) => addEnt({ ...transformEntity(en, f), layer: en.layer }).id));
      changed(); reset(); refresh(); return;
    }
    if (a === 'sel-all') { sel = new Set(doc.ents.filter(editable).map((x) => x.id)); refresh(); return; }
    if (a === 'sel-none') { sel.clear(); refresh(); return; }
    if (a === 'sel-del') { commit(); doc.ents = doc.ents.filter((x) => !(sel.has(x.id) && editable(x))); sel.clear(); changed(); refresh(); return; }
    // katmanlar
    const L = b.dataset.n ? doc.layers.find((l) => l.name === decodeURIComponent(b.dataset.n)) : null;
    if (a === 'ly-cur' && L) { doc.cur = L.name; save(); refresh(); return; }
    if (a === 'ly-col' && L) { commit(); L.aci = ACI_LIST[(ACI_LIST.indexOf(L.aci) + 1) % ACI_LIST.length]; changed(); refresh(); return; }
    if (a === 'ly-lt' && L) { commit(); const k = Object.keys(LT_NAME); L.lt = k[(k.indexOf(L.lt || 'CONTINUOUS') + 1) % k.length]; changed(); refresh(); return; }
    if (a === 'ly-vis' && L) { commit(); L.hidden = !L.hidden; if (L.hidden && doc.cur === L.name) setHint('Etkin katman gizlendi; yeni çizimler görünmez olacak.', true); changed(); refresh(); return; }
    if (a === 'ly-lock' && L) { commit(); L.locked = !L.locked; changed(); refresh(); return; }
    if (a === 'ly-add') {
      const n = String(F.nl || '').trim();
      if (!n || doc.layers.some((l) => l.name === n)) { setHint(n ? 'Bu adda katman var.' : 'Katman adı yaz.', true); return; }
      commit(); doc.layers.push({ name: n, aci: ACI_LIST[doc.layers.length % ACI_LIST.length], lt: 'CONTINUOUS' }); doc.cur = n; F.nl = ''; changed(); refresh(); return;
    }
    if (a === 'ly-move') { commit(); for (const x of doc.ents) if (sel.has(x.id)) x.layer = doc.cur; changed(); refresh(); return; }
    // dosya
    if (a === 'f-dxf') { download(new Blob([toDXF(doc.ents, doc.layers)], { type: 'application/dxf' }), 'cizim.dxf'); setHint('DXF kaydedildi (mm).'); return; }
    if (a === 'f-png') { exportPNG(); return; }
    if (a === 'f-open') { fileIn.click(); return; }
    if (a === 'f-3d') { to3D(); return; }
    if (a === 'f-photo') { photoIn.click(); return; }
    if (a.startsWith('ad-') && auto) {
      if (a === 'ad-cancel') { auto = null; tool = 'setdim'; refresh(); return; }
      if (a === 'ad-apply') {
        const ms = auto.matches.filter((m) => m.on);
        if (!ms.length) { setHint('Uygulanacak ölçü seçili değil.', true); return; }
        commit();
        // eşleşen varlıkların doc içindeki yerleri
        const idx = auto.added.map((e) => doc.ents.indexOf(e));
        const sub = idx.map((i) => doc.ents[i]);
        const out = applyDims(doc.ents, ms.map((m) => ({ ...m, ei: idx[m.ei] })));
        doc.ents = out;
        // ölçü çizgileri: eşlenen çizgilere ölçü ekle; okunan yazıları kaldır
        const tIds = new Set(auto.tents.filter((t, i) => ms.some((m) => m.ti === i)).map((t) => t.id));
        doc.ents = doc.ents.filter((e) => !tIds.has(e.id));
        const bbs = doc.ents.map(entBBox).filter(Boolean);
        const size = (Math.max(...bbs.map((b) => b.maxX)) - Math.min(...bbs.map((b) => b.minX))) || 100;
        const cx = (Math.min(...bbs.map((b) => b.minX)) + Math.max(...bbs.map((b) => b.maxX))) / 2, cy = (Math.min(...bbs.map((b) => b.minY)) + Math.max(...bbs.map((b) => b.maxY))) / 2;
        const hh = Math.max(2.5, size * 0.025), ly = doc.layers.some((l) => l.name === 'Ölçü') ? 'Ölçü' : doc.cur;
        for (const m of ms) {
          const e = doc.ents.find((x) => x.id === sub[m.ei].id);
          if (!e) continue;
          if (e.t === 'line') {
            const d = [e.b[0] - e.a[0], e.b[1] - e.a[1]], L = Math.hypot(...d), n = [-d[1] / L, d[0] / L];
            const mm = [(e.a[0] + e.b[0]) / 2 - cx, (e.a[1] + e.b[1]) / 2 - cy];
            addEnt({ t: 'dim', a: e.a.slice(), b: e.b.slice(), off: (mm[0] * n[0] + mm[1] * n[1] >= 0 ? 1 : -1) * Math.max(hh * 3, size * 0.06), h: hh, layer: ly });
          } else addEnt(autoRdim(e, hh));
        }
        auto = null; tool = 'setdim';
        changed(); fit(); refresh();
        setHint(ms.length + ' ölçü uygulandı. Kalanları 📐 Ölçü ver ile düzeltebilir, 🧊 3B ile parçaya çevirebilirsin.');
        return;
      }
      const i = +a.slice(3); if (auto.matches[i]) { auto.matches[i].on = !auto.matches[i].on; refresh(); } return;
    }
    if (a.startsWith('hp-')) { if (a === 'hp-x') { F.hang = String((parseFloat(F.hang) || 45) + 90); } else F.hang = a.slice(3); refresh(); if (a === 'hp-x') setHint('Açı 90° çevrildi: aynı alana bir kez daha dokununca çapraz kafes olur.'); return; }
    if (a === 'rd-1' || a === 'rd-0') { F.rdia = a.slice(3); refresh(); return; }
    if (a === 'am-rect' || a === 'am-polar') { F.amode = a.slice(3); refresh(); return; }
    if (a === 'tg-arot') { F.arot = F.arot === '1' ? '0' : '1'; refresh(); return; }
    if (a === 'in-arect') {
      const r = Math.round(num('arows')), c = Math.round(num('acols')), dx = num('adx'), dy = num('ady');
      if (!(r >= 1 && c >= 1 && r * c >= 2 && r * c <= 2000) || !isFinite(dx) || !isFinite(dy)) { setHint('Satır × sütun 2–2000 arası olmalı.', true); return; }
      commit();
      for (const en of arrayRect(selected(), r, c, dx, dy)) addEnt({ ...en, layer: en.layer });
      changed(); refresh(); setHint(r + ' × ' + c + ' dizi yapıldı.'); return;
    }
    if (a === 'tg-adddim') { F.adddim = F.adddim === '1' ? '0' : '1'; refresh(); return; }
    if (a === 'in-setdim') {
      const v = num('dv'), e = pickA;
      if (!e || !(v > 0)) { setHint('Ölçü sıfırdan büyük olmalı.', true); return; }
      const idx = doc.ents.indexOf(e);
      if (idx < 0) { reset(); refresh(); return; }
      const w0 = e._p; delete e._p;
      let out;
      if (e.t === 'line') {
        const moveB = !w0 || dist(w0, e.b) <= dist(w0, e.a);
        // yalnızca düzenlenebilir varlıklar esner; kilitli / gizli katmanlar yerinde kalır
        const ed = doc.ents.filter(editable), res = stretchToLength(ed, e, v, moveB);
        if (!res) { setHint('Bu çizgiye ölçü verilemiyor.', true); return; }
        const map = new Map(ed.map((x, i) => [x, res[i]]));
        out = doc.ents.map((x) => map.get(x) || x);
      } else if (e.t === 'circle') { out = doc.ents.map((x) => (x === e ? { ...x, r: v / 2 } : x)); }
      else { out = setRadius(doc.ents, e, v); }
      if (!out) return;
      commit();
      doc.ents = out;
      const ne = doc.ents[idx];
      if (F.adddim === '1') {
        const bbs = doc.ents.map(entBBox).filter(Boolean);
        const cx = (Math.min(...bbs.map((b) => b.minX)) + Math.max(...bbs.map((b) => b.maxX))) / 2, cy = (Math.min(...bbs.map((b) => b.minY)) + Math.max(...bbs.map((b) => b.maxY))) / 2;
        const size = Math.max(...bbs.map((b) => b.maxX)) - Math.min(...bbs.map((b) => b.minX)) || 100;
        const ly = doc.layers.some((l) => l.name === 'Ölçü') ? 'Ölçü' : doc.cur, hh = Math.max(2.5, size * 0.025);
        if (ne.t === 'line') {
          // ölçüyü şeklin dışına koy
          const d = [ne.b[0] - ne.a[0], ne.b[1] - ne.a[1]], L = Math.hypot(...d), n = [-d[1] / L, d[0] / L];
          const m = [(ne.a[0] + ne.b[0]) / 2 - cx, (ne.a[1] + ne.b[1]) / 2 - cy];
          const off = (m[0] * n[0] + m[1] * n[1] >= 0 ? 1 : -1) * Math.max(hh * 3, size * 0.06);
          doc.ents = doc.ents.filter((x) => !(x.t === 'dim' && ((dist(x.a, e.a) < 1e-6 && dist(x.b, e.b) < 1e-6) || (dist(x.a, ne.a) < 1e-6 && dist(x.b, ne.b) < 1e-6))));
          addEnt({ t: 'dim', a: ne.a.slice(), b: ne.b.slice(), off, h: hh, layer: ly });
        } else {
          doc.ents = doc.ents.filter((x) => !(x.t === 'rdim' && dist(x.c, ne.c) < 1e-6));
          addEnt(autoRdim(ne, hh));
        }
      }
      changed(); reset(); refresh(); setHint('Ölçü verildi. Başka bir çizgiye dokunarak devam et.'); return;
    }
    if (a === 'in-scale' || a === 'in-scalek') {
      let f;
      if (a === 'in-scale') { const real = num('real'), curv = pickA ? scaleRef(pickA) : 0; if (!(real > 0) || !(curv > 0)) { setHint('Gerçek ölçüyü yaz.', true); return; } f = real / curv; }
      else { f = num('kf'); if (!(f > 0)) { setHint('Katsayı sıfırdan büyük olmalı.', true); return; } }
      commit();
      doc.ents = doc.ents.map((en) => scaleEnt(en, f));
      reset(); changed(); fit(); refresh(); setHint('Çizim ' + fmtNum(f, 4) + ' kat ölçeklendi.'); return;
    }
    if (a === 'f-clear') {
      if (!clearArm) { clearArm = true; refresh(); return; }
      clearArm = false; commit(); doc.ents = []; sel.clear(); reset(); changed(); refresh(); return;
    }
  });
  function scaleRef(e) { return e.t === 'line' ? dist(e.a, e.b) : 2 * e.r; }
  function scaleEnt(e, f) {
    const o = mapPoints(e, (p) => [p[0] * f, p[1] * f]);
    if (o.r) o.r *= f;
    if (o.sp) o.sp *= f;
    if (o.t === 'dim') o.off *= f;
    if (o.t === 'text') o.h = (o.h || 5) * f;
    return o;
  }
  const photoIn = document.createElement('input');
  photoIn.type = 'file'; photoIn.accept = 'image/*';
  photoIn.addEventListener('change', () => {
    const f = photoIn.files && photoIn.files[0];
    photoIn.value = '';
    if (f) importPhoto(f);
  });
  function importPhoto(f) {
    openPhotoImport(f, {
      onDone(ents, info) {
        commit();
        const added = ents.map((en) => addEnt({ ...en }));
        const texts = info.texts || [];
        if (texts.length && !doc.layers.some((l) => l.name === 'Okunan ölçü')) doc.layers.push({ name: 'Okunan ölçü', aci: 30, lt: 'CONTINUOUS' });
        const tents = texts.map((t) => addEnt({ t: 'text', p: [t.p[0] - t.h * 0.3 * t.s.length, t.p[1] - t.h / 2], h: t.h, s: t.s, layer: 'Okunan ölçü' }));
        changed(); fit();
        tab = 'edit'; reset();
        if (texts.length) {
          const m = matchDims(added, texts);
          auto = { added, tents, texts, matches: m.map((x) => ({ ...x, on: true })) };
          tool = 'autodim';
          refresh();
          setHint(ents.length + ' varlık ve ' + texts.length + ' ölçü rakamı (' + texts.map((t) => t.s).join(', ') + ') okundu. ' + m.length + ' tanesi çizgilere eşlendi: kontrol et, yanlışı kapat, "Ölçüleri uygula"ya bas.');
          return;
        }
        tool = 'scale';
        refresh();
        setHint(ents.length + ' varlık eklendi. Ölçüyü düzeltmek için ölçüsünü bildiğin bir çizgiye dokun (Ölçekle). Fazlalıkları Sil / Kırp ile temizle; bitince 🧊 3B.' + (info.paper === 'f' ? ' (Serbest kağıt: ölçek tahmini.)' : ''));
      },
    });
  }
  const fileIn = document.createElement('input');
  fileIn.type = 'file'; fileIn.accept = '.dxf,application/dxf,text/plain';
  fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    f.text().then((txt) => {
      const r = parseDXF(txt);
      if (!r.ents.length) { setHint('DXF içinde okunabilir çizgi / daire / yay bulunamadı.', true); return; }
      commit();
      for (const L of r.layers) if (!doc.layers.some((l) => l.name === L.name)) doc.layers.push(L);
      for (const en of r.ents) { if (!doc.layers.some((l) => l.name === en.layer)) doc.layers.push({ name: en.layer, aci: 7, lt: 'CONTINUOUS' }); addEnt(en); }
      changed(); fit(); refresh();
      const sk = Object.entries(r.skipped).map(([k, v]) => k + ' ×' + v).join(', ');
      setHint(r.ents.length + ' varlık açıldı.' + (sk ? ' Okunamayanlar: ' + sk : ''));
    }).catch(() => setHint('Dosya okunamadı.', true));
    fileIn.value = '';
  });
  root.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.k;
    if (!k) return;
    if (k === 'grid') { grid = parseFloat(e.target.value) || 0; return; }
    F[k] = e.target.value;
  });
  root.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.k === 'grid') grid = parseFloat(e.target.value) || 0; });

  refresh();
  resize();
  return { close, importPhoto, get doc() { return doc; }, get view() { return { ...V }; } };
}
