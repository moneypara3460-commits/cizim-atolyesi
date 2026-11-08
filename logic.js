// Saf mantık: 3D kütüphanesi gerektirmez, Node'da test edilebilir.
// - parça varsayılanları, geri al / yinele geçmişi
// - binary STL yazıcı
// - Türkçe sesli komut çözücü (kural tabanlı, yapay zekâ kullanmaz)

export const TYPE_LABEL = {
  box: 'Kutu',
  cylinder: 'Silindir',
  sphere: 'Küre',
  cone: 'Koni',
  tube: 'Boru',
  sketch: 'Kroki',
  mesh: 'Tek parça',
};

export const DEFAULTS = {
  w: 30, l: 30, h: 20, d: 30, d2: 0, di: 20, r: 0,
  x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0, c: 0,
};

const fin = (v, fallback) => (typeof v === 'number' && isFinite(v) ? v : fallback);

// Parçanın yüksekliği (küre için çap)
export function heightOf(p) {
  if (p.type === 'sketch') return sketchHeight(p);
  return p.type === 'sphere' ? fin(p.d, 0) : fin(p.h, 0);
}

// Yeni parça. base = ilk (taban) parça; varsayılan konumu ona göre ayarlanır.
export function newPart(id, type, op, base) {
  const p = { id, type, op, ...DEFAULTS };
  if (type === 'cone') p.h = 30;
  if (type === 'tube') { p.d = 30; p.di = 20; p.h = 20; }
  if (!base) return p;

  const bh = heightOf(base) || 40;
  const bx = fin(base.x, 0), by = fin(base.y, 0), bz = fin(base.z, 0);
  p.x = bx;
  p.z = bz;
  if (op === 'sub') {
    // delik: tabanı iki uçtan 1 mm aşsın (yüzey çakışması olmasın)
    p.d = 20; p.w = 20; p.l = 20;
    p.h = bh + 2;
    p.y = by - 1;
    if (type === 'sphere') p.y = by + bh / 2 - p.d / 2;
  } else {
    // ekleme: tabanın üstüne otursun
    p.y = by + bh;
  }
  return p;
}

// Geri al / yinele geçmişi (anlık görüntü = JSON metni)
export class History {
  constructor(limit = 100) {
    this.undoStack = [];
    this.redoStack = [];
    this.limit = limit;
  }
  push(snap) {
    if (this.undoStack.length && this.undoStack[this.undoStack.length - 1] === snap) return;
    this.undoStack.push(snap);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }
  undo(current) {
    if (!this.undoStack.length) return null;
    this.redoStack.push(current);
    return this.undoStack.pop();
  }
  redo(current) {
    if (!this.redoStack.length) return null;
    this.undoStack.push(current);
    return this.redoStack.pop();
  }
  get canUndo() { return this.undoStack.length > 0; }
  get canRedo() { return this.redoStack.length > 0; }
}

// Binary STL. pos: her 9 sayı bir üçgen (x,y,z × 3). zUp: Y-yukarı -> Z-yukarı (yazıcı dilimleyicileri için)
export function toSTLBinary(pos, zUp = true) {
  const tri = Math.floor(pos.length / 9);
  const buf = new ArrayBuffer(84 + tri * 50);
  const dv = new DataView(buf);
  const header = 'Cizim Atolyesi STL (mm)';
  for (let i = 0; i < header.length; i++) dv.setUint8(i, header.charCodeAt(i));
  dv.setUint32(80, tri, true);
  const vert = (i) => (zUp ? [pos[i], -pos[i + 2], pos[i + 1]] : [pos[i], pos[i + 1], pos[i + 2]]);
  let o = 84;
  for (let t = 0; t < tri; t++) {
    const a = vert(t * 9), b = vert(t * 9 + 3), c = vert(t * 9 + 6);
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    for (const n of [nx, ny, nz]) { dv.setFloat32(o, n, true); o += 4; }
    for (const p of [a, b, c]) for (const n of p) { dv.setFloat32(o, n, true); o += 4; }
    dv.setUint16(o, 0, true); o += 2;
  }
  return new Uint8Array(buf);
}

/* ---------------- Türkçe sesli komut ---------------- */

const ONES = new Map([['sıfır', 0], ['bir', 1], ['iki', 2], ['üç', 3], ['dört', 4], ['beş', 5], ['altı', 6], ['yedi', 7], ['sekiz', 8], ['dokuz', 9]]);
const TENS = new Map([['on', 10], ['yirmi', 20], ['otuz', 30], ['kırk', 40], ['elli', 50], ['altmış', 60], ['yetmiş', 70], ['seksen', 80], ['doksan', 90]]);

// "yirmi beş" -> "25" (tek başına "bir" sayı sayılmaz: "bir silindir")
function wordsToNumbers(t) {
  const tokens = t.split(' ');
  const out = [];
  let i = 0;
  while (i < tokens.length) {
    const w = tokens[i];
    const starter = TENS.has(w) || (ONES.has(w) && w !== 'bir') || w === 'yüz';
    if (!starter) { out.push(w); i++; continue; }
    let cur = 0, started = false;
    while (i < tokens.length) {
      const k = tokens[i];
      if (k === 'yüz') cur = (cur || 1) * 100;
      else if (TENS.has(k)) cur += TENS.get(k);
      else if (ONES.has(k) && (k !== 'bir' || started)) cur += ONES.get(k);
      else break;
      started = true;
      i++;
    }
    out.push(String(cur));
  }
  return out.join(' ');
}

export function normalize(text) {
  let t = String(text).toLocaleLowerCase('tr').replace(/[!?;:]+/g, ' ');
  t = t.replace(/(\d)\s*,\s*(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim();
  t = wordsToNumbers(t);
  // birimler: her şey mm'ye çevrilir
  t = t.replace(/(\d+(?:\.\d+)?)\s*(?:santimetre|santim|cm)(?![a-zçğıöşü])/g, (_, n) => String(parseFloat(n) * 10));
  t = t.replace(/(\d+(?:\.\d+)?)\s*(?:milimetre|milim|mm)(?![a-zçğıöşü])/g, '$1');
  return t;
}

const L = 'a-zçğıöşü';
const NUM = '(\\d+(?:\\.\\d+)?)';

// "50 çapında" (sayı önde) ya da "çap 50" / "çapı 50 olan" (sayı arkada)
function grab(t, stem) {
  let m = t.match(new RegExp(`${NUM}\\s*(${stem}[${L}]*?(?:nda|nde))(?![${L}])`));
  if (m) return { v: parseFloat(m[1]), text: m[0] };
  m = t.match(new RegExp(`(${stem}[${L}]*\\s*(?:olarak\\s*|olan\\s*)?${NUM})`));
  if (m) return { v: parseFloat(m[2]), text: m[1] };
  return null;
}

const POSITIONAL = {
  box: ['w', 'l', 'h'],
  cylinder: ['d', 'h'],
  sphere: ['d'],
  tube: ['d', 'di', 'h'],
};

function parseDims(t0, type, sub) {
  let t = t0;
  const dims = {};
  const take = (stem, key) => {
    const g = grab(t, stem);
    if (!g) return;
    if (dims[key] === undefined) dims[key] = g.v;
    t = t.replace(g.text, ' ');
  };
  take('dış\\s*çap', 'd');
  take('iç\\s*çap', 'di');
  take('alt\\s*çap', 'd');
  take('üst\\s*çap', 'd2');
  take('çap', 'd');
  take('yüksek', 'h');
  take('geniş', 'w');
  take('derin', 'l');
  take('kenar', 'w');

  if (!Object.keys(dims).length) {
    const nums = [...t.matchAll(/\d+(?:\.\d+)?/g)].map((m) => parseFloat(m[0]));
    const order = type === 'cone' ? (nums.length >= 3 ? ['d', 'd2', 'h'] : ['d', 'h']) : POSITIONAL[type];
    nums.slice(0, order.length).forEach((n, i) => { dims[order[i]] = n; });
  }
  if (type === 'box' && dims.w !== undefined && dims.l === undefined && sub) dims.l = dims.w;
  return dims;
}

const SET_STEMS = [
  ['dış\\s*çap', 'd'], ['iç\\s*çap', 'di'], ['üst\\s*çap', 'd2'], ['alt\\s*çap', 'd'],
  ['çap', 'd'], ['yüksek', 'h'], ['geniş', 'w'], ['derin', 'l'],
];
const SET_VERB = '(?:yap|olsun|ayarla|değiştir)';
const SHAPES = [
  ['box', /kutu|küp|dikdörtgen/],
  ['cylinder', /silindir/],
  ['sphere', /küre/],
  ['cone', /koni/],
  ['tube', /boru/],
];

// Metni komut listesine çevirir. Tanımazsa [{cmd:'unknown'}].
export function parseVoice(text) {
  const t = normalize(text);
  const tok = t.split(' ');
  const has = (w) => tok.includes(w);
  const firstNum = (t.match(/\d+(?:\.\d+)?/) || [null])[0];
  const n = firstNum === null ? null : parseFloat(firstNum);

  if (t.includes('geri al') || has('geri')) return [{ cmd: 'undo' }];
  if (t.includes('ileri al') || has('yinele') || has('tekrarla')) return [{ cmd: 'redo' }];
  if (/sığdır|ortala/.test(t)) return [{ cmd: 'fit' }];
  if (has('stl') || has('indir') || t.includes('dışa aktar')) return [{ cmd: 'export' }];
  if (has('kaydet')) return [{ cmd: 'save' }];
  if (has('sil') || has('kaldır')) return [{ cmd: 'delete' }];

  if (has('üstten')) return [{ cmd: 'view', view: 'top' }];
  if (has('önden')) return [{ cmd: 'view', view: 'front' }];
  if (has('yandan')) return [{ cmd: 'view', view: 'side' }];
  if (has('izometrik') || has('iso')) return [{ cmd: 'view', view: 'iso' }];
  if (has('aynala') || has('ayna') || has('simetri')) {
    const am = t.match(/(?:^|\s)([xz])(?:'[a-zçğıöşü]*)?(?=\s|$)/);
    return [{ cmd: 'mirror', axis: am ? am[1] : 'x' }];
  }
  if (has('kopyala') || has('çoğalt') || has('kopya')) {
    const cm = t.match(/(\d+)\s*(?:tane|adet|kez|kere)/);
    return [{ cmd: 'copy', count: cm ? parseInt(cm[1], 10) : 1 }];
  }

  if (/döndür|çevir/.test(t) && n !== null) {
    const ax = t.match(/(?:^|\s)([xyz])(?:'[a-zçğıöşü]*)?(?=\s|$)/);
    return [{ cmd: 'rotate', axis: ax ? ax[1] : 'y', deg: n }];
  }
  if (/yuvarla/.test(t) && n !== null && !/delik/.test(t)) {
    return [{ cmd: 'set', key: 'r', value: n }];
  }
  if (/(?:^|\s)pah/.test(t) && n !== null) {
    return [{ cmd: 'set', key: 'c', value: n }];
  }
  for (const [stem, key] of SET_STEMS) {
    const m = t.match(new RegExp(`${stem}[${L}]*\\s*${NUM}\\s*${SET_VERB}`));
    if (m) return [{ cmd: 'set', key, value: parseFloat(m[1]) }];
  }
  const mp = t.match(new RegExp(`(?:^|\\s)([xyz])(?:'[${L}]*)?\\s*${NUM}\\s*${SET_VERB}`));
  if (mp) return [{ cmd: 'set', key: mp[1], value: parseFloat(mp[2]) }];

  const sub = /delik|oyuk|çukur|çıkar/.test(t);
  let type = null;
  for (const [ty, re] of SHAPES) if (re.test(t)) { type = ty; break; }
  if (!type && sub) type = /kare/.test(t) ? 'box' : 'cylinder';
  if (type) {
    return [{ cmd: 'add', type, op: sub ? 'sub' : 'add', dims: parseDims(t, type, sub) }];
  }
  return [{ cmd: 'unknown' }];
}

/* ---------------- Birimler, yapışma ---------------- */

export const UNITS = { mm: 1, cm: 10, in: 25.4 };
export const toUnit = (mm, u) => mm / (UNITS[u] || 1);
export const fromUnit = (v, u) => v * (UNITS[u] || 1);
export function fmtNum(v, dec = 2) {
  if (!isFinite(v)) return '0';
  const f = 10 ** dec;
  return String(Math.round(v * f) / f + 0);
}
// v değerini step ızgarasına yapıştırır (step<=0 ise dokunmaz)
export function snap(v, step) {
  if (!(step > 0)) return v;
  return Math.round(Math.round(v / step) * step * 1e6) / 1e6 + 0;
}
export const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* ---------------- Kroki ---------------- */
// Kroki parçası: { type:'sketch', mode:'extrude'|'revolve', plane:'top'|'front', pts:[[u,v],...], h }
// Saklanan noktalar parça merkezine göredir:
//   üstten ekstrüzyon : u,v = (x,z) merkezden;  parça x,z = kroki sınır kutusu merkezi, y = 0
//   önden ekstrüzyon  : u merkezden, v tabandan; kalınlık h (z'de ortalanır); x = merkez, y = taban
//   döndürme          : u = eksene uzaklık, v tabandan; x = z = 0, y = taban

export function circlePts(cx, cy, r, n = 48) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}
export function rectPts(x1, y1, x2, y2) {
  return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];
}
export function bboxPts(pts) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  for (const [u, v] of pts) {
    if (u < a) a = u; if (u > b) b = u;
    if (v < c) c = v; if (v > d) d = v;
  }
  return { minU: a, maxU: b, minV: c, maxV: d };
}
export function polyArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

// Çizimden (mutlak dünya koordinatları) parça alanları üretir. d.more = ek döngüler (delikler / ek şekiller)
export function sketchFromDraw(d) {
  const more = d.mode === 'revolve' ? [] : (d.more || []);
  const bb = bboxPts([...d.pts, ...more.flat()]);
  const cu = (bb.minU + bb.maxU) / 2, cv = (bb.minV + bb.maxV) / 2;
  const base = { type: 'sketch', mode: d.mode, plane: d.plane, h: d.mode === 'revolve' ? 0 : d.h };
  const r4 = (n) => Math.round(n * 1e4) / 1e4 + 0;
  const withMore = (o, f) => { if (more.length) o.more = more.map((l) => l.map(f)); return o; };
  if (d.mode === 'revolve') {
    return { ...base, plane: 'front', x: 0, y: r4(bb.minV), z: 0, pts: d.pts.map(([u, v]) => [r4(u), r4(v - bb.minV)]) };
  }
  if (d.plane === 'top') {
    const f = ([u, v]) => [r4(u - cu), r4(v - cv)];
    return withMore({ ...base, x: r4(cu), y: 0, z: r4(cv), pts: d.pts.map(f) }, f);
  }
  const f = ([u, v]) => [r4(u - cu), r4(v - bb.minV)];
  return withMore({ ...base, x: r4(cu), y: r4(bb.minV), z: 0, pts: d.pts.map(f) }, f);
}
// Parçadan çizime (düzenlemek için mutlak koordinatlar)
export function sketchToDraw(p) {
  const x = fin(p.x, 0), y = fin(p.y, 0), z = fin(p.z, 0);
  let f;
  if (p.mode === 'revolve') f = ([u, v]) => [u, v + y];
  else if (p.plane === 'top') f = ([u, v]) => [u + x, v + z];
  else f = ([u, v]) => [u + x, v + y];
  const d = { mode: p.mode, plane: p.mode === 'revolve' ? 'front' : p.plane, pts: p.pts.map(f), h: fin(p.h, 20) };
  if (p.mode !== 'revolve' && p.more && p.more.length) d.more = p.more.map((l) => l.map(f));
  return d;
}
export function sketchHeight(p) {
  if (!p.pts || !p.pts.length) return 0;
  if (p.mode !== 'revolve' && p.plane === 'top') return fin(p.h, 0);
  const all = p.mode !== 'revolve' && p.more ? [...p.pts, ...p.more.flat()] : p.pts;
  return bboxPts(all).maxV;
}
// Nokta çokgenin içinde mi (çift-tek kuralı)
export function pointInPoly(pt, poly) {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
// Döngüleri dış şekil / delik olarak ayır: iç içe derinliği çift olan dış, tek olan en yakın kapsayanın deliği
export function classifyLoops(loops) {
  const n = loops.length;
  const area = loops.map((l) => Math.abs(polyArea(l)));
  const depth = new Array(n).fill(0), parent = new Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = -1;
    for (let j = 0; j < n; j++) {
      if (j === i || !(area[j] > area[i]) || !pointInPoly(loops[i][0], loops[j])) continue;
      depth[i]++;
      if (best < 0 || area[j] < area[best]) best = j;
    }
    parent[i] = best;
  }
  const outers = [];
  for (let i = 0; i < n; i++) if (depth[i] % 2 === 0) outers.push({ outer: loops[i], holes: [], i });
  for (let i = 0; i < n; i++) {
    if (depth[i] % 2 === 0) continue;
    const o = outers.find((q) => q.i === parent[i]);
    if (o) o.holes.push(loops[i]);
  }
  return outers.map(({ outer, holes }) => ({ outer, holes }));
}
// Döndürme profili: (yarıçap, y) noktaları, saat yönünün tersi, kapalı
export function revolveProfile(pts) {
  let prof = pts.map(([u, v]) => [Math.max(Math.abs(u), 0.05), v]);
  if (polyArea(prof) < 0) prof = prof.reverse();
  prof.push(prof[0].slice());
  return prof;
}

/* ---------------- Pah / yuvarlama ---------------- */

// Kutunun 12 kenarına pah: 6 yüzün küçülmüş köşeleri (24 nokta). x,z ortada, y 0..h
export function chamferBoxPoints(w, l, h, c) {
  const m = Math.max(0, Math.min(c, Math.min(w, l, h) / 2 - 0.01));
  const hw = w / 2, hl = l / 2;
  const P = [];
  for (const s of [-1, 1]) {
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      P.push([s * hw, h / 2 + a * (h / 2 - m), b * (hl - m)]);   // ±X yüzleri
      P.push([a * (hw - m), h / 2 + s * (h / 2), b * (hl - m)]); // ±Y yüzleri
      P.push([a * (hw - m), h / 2 + b * (h / 2 - m), s * hl]);   // ±Z yüzleri
    }
  }
  return P;
}
// Silindir kesiti (yarıçap, y): dönel; yuvarlama r varsa yay, yoksa c ile pah. CCW.
export function cylinderProfile(radius, h, c = 0, rr = 0, seg = 8) {
  const R = radius, H = h;
  const e = Math.max(0, Math.min(rr > 0 ? rr : c, R - 0.01, H / 2 - 0.01));
  const pts = [[0, 0]];
  if (e <= 0) {
    pts.push([R, 0], [R, H]);
  } else if (rr > 0) {
    for (let i = 0; i <= seg; i++) { // alt kenar: merkez (R-e, e), açı -90 -> 0
      const a = -Math.PI / 2 + (i / seg) * (Math.PI / 2);
      pts.push([R - e + e * Math.cos(a), e + e * Math.sin(a)]);
    }
    for (let i = 0; i <= seg; i++) { // üst kenar: merkez (R-e, H-e), açı 0 -> 90
      const a = (i / seg) * (Math.PI / 2);
      pts.push([R - e + e * Math.cos(a), H - e + e * Math.sin(a)]);
    }
  } else {
    pts.push([R - e, 0], [R, e], [R, H - e], [R - e, H]);
  }
  pts.push([0, H]);
  return pts;
}

/* ---------------- Dönme (Euler XYZ <-> kuaterniyon) ---------------- */

const D2R = Math.PI / 180;
const r4 = (n) => Math.round(n * 1e4) / 1e4 + 0;
export function eulerToQuat(rx, ry, rz) {
  const c1 = Math.cos(rx * D2R / 2), c2 = Math.cos(ry * D2R / 2), c3 = Math.cos(rz * D2R / 2);
  const s1 = Math.sin(rx * D2R / 2), s2 = Math.sin(ry * D2R / 2), s3 = Math.sin(rz * D2R / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}
export function quatMul(a, b) { // a * b ; [x,y,z,w]
  return [
    a[0] * b[3] + a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ];
}
export function quatToEulerXYZ(q) { // derece
  const [x, y, z, w] = q;
  const m11 = 1 - 2 * (y * y + z * z), m12 = 2 * (x * y - z * w), m13 = 2 * (x * z + y * w);
  const m22 = 1 - 2 * (x * x + z * z), m23 = 2 * (y * z - x * w);
  const m32 = 2 * (y * z + x * w), m33 = 1 - 2 * (x * x + y * y);
  const ey = Math.asin(Math.max(-1, Math.min(1, m13)));
  let ex, ez;
  if (Math.abs(m13) < 0.9999999) { ex = Math.atan2(-m23, m33); ez = Math.atan2(-m12, m11); }
  else { ex = Math.atan2(m32, m22); ez = 0; }
  let e = [ex / D2R, ey / D2R, ez / D2R];
  // aynı dönmenin eşdeğer yazımı (x+180, 180-y, z+180) daha sade ise onu seç
  const wrap = (a) => { while (a > 180 + 1e-9) a -= 360; while (a < -180 - 1e-9) a += 360; return a; };
  const alt = [wrap(e[0] + 180), wrap((e[1] >= 0 ? 180 : -180) - e[1]), wrap(e[2] + 180)];
  if (Math.abs(alt[0]) + Math.abs(alt[2]) + 1e-6 < Math.abs(e[0]) + Math.abs(e[2])) e = alt;
  return e.map(r4);
}

/* ---------------- Çoğaltma: kopya, ayna, dizi ---------------- */

const clone = (p) => { const c = JSON.parse(JSON.stringify(p)); delete c.parent; delete c.joint; return c; };

// ---- bağlantılar (üst / alt parça): parça.parent = üst parçanın id'si ----
// id'nin bütün alt (torun dahil) parçaları
export function descendantsOf(parts, id) {
  const out = [];
  const walk = (i) => { for (const q of parts) if (q.parent === i && !out.includes(q)) { out.push(q); walk(q.id); } };
  walk(id);
  return out;
}
// child'ı parent'a bağlamak döngü yapar mı (kendisine ya da kendi altına bağlanamaz)
export function wouldCycle(parts, childId, parentId) {
  if (childId === parentId) return true;
  return descendantsOf(parts, childId).some((q) => q.id === parentId);
}
// var olmayan üst parçaya işaret eden bağları temizle
export function cleanLinks(parts) {
  const ids = new Set(parts.map((q) => q.id));
  for (const q of parts) if (q.parent != null && (!ids.has(q.parent) || q.parent === q.id)) { delete q.parent; delete q.joint; }
}

export function duplicatePart(p, id, dx = 10, dz = 10) {
  const c = clone(p);
  c.id = id;
  c.x = fin(p.x, 0) + dx;
  c.z = fin(p.z, 0) + dz;
  if (c.name) c.name = c.name + ' kopya';
  return c;
}

// Aynalama: axis 'x' -> x = bx düzlemine göre, 'z' -> z = bz düzlemine göre
export function mirrorPart(p, id, axis, bx = 0, bz = 0) {
  const c = clone(p);
  c.id = id;
  if (axis === 'z') {
    c.z = 2 * bz - fin(p.z, 0);
    c.rx = r4(-fin(p.rx, 0)); c.ry = r4(-fin(p.ry, 0));
  } else {
    c.x = 2 * bx - fin(p.x, 0);
    c.ry = r4(-fin(p.ry, 0)); c.rz = r4(-fin(p.rz, 0));
  }
  if (p.type === 'sketch' && p.mode !== 'revolve') {
    const fx = ([u, v]) => [-u, v], fz = ([u, v]) => [u, -v];
    if (axis === 'x') { c.pts = p.pts.map(fx); if (p.more) c.more = p.more.map((l) => l.map(fx)); }
    else if (p.plane === 'top') { c.pts = p.pts.map(fz); if (p.more) c.more = p.more.map((l) => l.map(fz)); }
  }
  if (c.name) c.name = c.name + ' ayna';
  return c;
}

// Doğrusal dizi: n kopya (orijinal hariç), k. kopya k*(dx,dy,dz) kadar ötede
export function linearArray(p, startId, n, dx, dy, dz) {
  const out = [];
  for (let k = 1; k <= n; k++) {
    const c = clone(p);
    c.id = startId + k - 1;
    c.x = r4(fin(p.x, 0) + k * dx);
    c.y = r4(fin(p.y, 0) + k * dy);
    c.z = r4(fin(p.z, 0) + k * dz);
    if (c.name) c.name = c.name + ' ' + (k + 1);
    out.push(c);
  }
  return out;
}

// Dairesel dizi: Y ekseni etrafında (cx,cz) merkezli; count = orijinal dahil toplam adet
export function circularArray(p, startId, count, cx, cz, totalDeg = 360) {
  const out = [];
  if (count < 2) return out;
  const step = totalDeg >= 360 ? totalDeg / count : totalDeg / (count - 1);
  const q0 = eulerToQuat(fin(p.rx, 0), fin(p.ry, 0), fin(p.rz, 0));
  for (let k = 1; k < count; k++) {
    const th = k * step * D2R;
    const dx = fin(p.x, 0) - cx, dz = fin(p.z, 0) - cz;
    const c = clone(p);
    c.id = startId + k - 1;
    c.x = r4(cx + dx * Math.cos(th) + dz * Math.sin(th));
    c.z = r4(cz - dx * Math.sin(th) + dz * Math.cos(th));
    const qy = eulerToQuat(0, k * step, 0);
    const [rx, ry, rz] = quatToEulerXYZ(quatMul(qy, q0));
    c.rx = rx; c.ry = ry; c.rz = rz;
    if (c.name) c.name = c.name + ' ' + (k + 1);
    out.push(c);
  }
  return out;
}

/* ---------------- Görünüm ---------------- */

export const VIEW_DIRS = {
  top: [0, 1, 0.0001], front: [0, 0, 1], side: [1, 0, 0], iso: [1, 0.8, 1],
};
// Kesit düzlemi (THREE.Plane: normal·p + constant >= 0 olan taraf kalır)
export function sectionPlane(axis, pos, flip = false) {
  const e = axis === 'x' ? [1, 0, 0] : axis === 'z' ? [0, 0, 1] : [0, 1, 0];
  return flip
    ? { normal: e, constant: -pos }
    : { normal: e.map((v) => (v === 0 ? 0 : -v)), constant: pos };
}
// Ortografik taklidi: fov değişince aynı görüntü boyutu için mesafe çarpanı
export function fovDistance(dist, fromDeg, toDeg) {
  return dist * Math.tan(fromDeg * D2R / 2) / Math.tan(toDeg * D2R / 2);
}

/* ---------------- Yay, yuvarlak köşeli dikdörtgen ---------------- */

// A'dan M üzerinden B'ye giden 3 noktalı yay; A hariç, B dahil noktalar döner
export function arcPoints(a, m, b, segDeg = 6) {
  const [ax, ay] = a, [bx, by] = m, [cx, cy] = b;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return [b.slice()];
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const a0 = Math.atan2(ay - uy, ax - ux), am = Math.atan2(by - uy, bx - ux), a1 = Math.atan2(cy - uy, cx - ux);
  const TAU = Math.PI * 2;
  const norm = (t) => { while (t < 0) t += TAU; while (t >= TAU) t -= TAU; return t; };
  const ccw = norm(a1 - a0), mid = norm(am - a0);
  const sweep = mid <= ccw ? ccw : ccw - TAU;
  const r = Math.hypot(ax - ux, ay - uy);
  const n = Math.max(2, Math.ceil(Math.abs(sweep) / (segDeg * Math.PI / 180)));
  const out = [];
  for (let i = 1; i < n; i++) {
    const t = a0 + (sweep * i) / n;
    out.push([ux + r * Math.cos(t), uy + r * Math.sin(t)]);
  }
  out.push(b.slice());
  return out;
}

// Köşeleri yarıçap r ile yuvarlatılmış dikdörtgen (r = kısa kenarın yarısı ise hap/oval)
export function roundedRectPts(x1, y1, x2, y2, r, seg = 8) {
  const minx = Math.min(x1, x2), maxx = Math.max(x1, x2), miny = Math.min(y1, y2), maxy = Math.max(y1, y2);
  const rr = Math.min(Math.max(r, 0), (maxx - minx) / 2, (maxy - miny) / 2);
  if (rr < 1e-6) return rectPts(minx, miny, maxx, maxy);
  const out = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= seg; i++) {
      const t = a0 + (i / seg) * (Math.PI / 2);
      out.push([cx + rr * Math.cos(t), cy + rr * Math.sin(t)]);
    }
  };
  corner(minx + rr, miny + rr, Math.PI);
  corner(maxx - rr, miny + rr, Math.PI * 1.5);
  corner(maxx - rr, maxy - rr, 0);
  corner(minx + rr, maxy - rr, Math.PI / 2);
  return out;
}

/* ---------------- Teknik resim: ölçek, yerleşim, PDF ---------------- */

// standart ölçekler (kağıt / gerçek): 10:1 ... 1:1000
export const NICE_SCALES = [10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01, 0.005, 0.002, 0.001];
export function pickScale(raw) {
  for (const s of NICE_SCALES) if (s <= raw) return s;
  return NICE_SCALES[NICE_SCALES.length - 1];
}
export function scaleLabel(s) {
  return s >= 1 ? Math.round(s) + ':1' : '1:' + Math.round(1 / s);
}

// A4 yatay (297 x 210 mm). W = X boyu, H = Y (yükseklik), D = Z boyu (mm, gerçek ölçü).
// Üçüncü açı: ön görünüş sol üstte, sağdakini sağ yan, altta üst görünüş, sağ altta izometrik.
export function sheetLayout(W, H, D) {
  const SW = 297, SH = 210, M = 10, TB = 22, DM = 14, GAP = 26;
  const area = { x: M, y: M + 7, w: SW - 2 * M, h: SH - 2 * M - TB - 7 }; // üstte görünüş adları için 7 mm
  W = Math.max(W, 0.001); H = Math.max(H, 0.001); D = Math.max(D, 0.001);
  const raw = Math.min((area.w - DM - GAP) / (W + D), (area.h - GAP) / (H + D));
  const scale = pickScale(raw);
  const x1 = area.x + DM, y1 = area.y;
  const front = { x: x1, y: y1, w: W * scale, h: H * scale };
  const side = { x: x1 + front.w + GAP, y: y1, w: D * scale, h: H * scale };
  const top = { x: x1, y: y1 + front.h + GAP, w: W * scale, h: D * scale };
  const ix = side.x, iy = top.y;
  const iso = { x: ix, y: iy, w: Math.max(area.x + area.w - ix, 10), h: Math.max(area.y + area.h - iy, 10) };
  return { sheet: { w: SW, h: SH }, area, scale, front, side, top, iso, titleBlock: { x: M, y: SH - M - TB, w: SW - 2 * M, h: TB } };
}

// Tek bir JPEG'i A4 yatay (842 x 595 pt) sayfaya yerleştiren en küçük PDF.
export function jpegToPdf(jpeg, wPx, hPx) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let len = 0;
  const push = (b) => { const u = typeof b === 'string' ? enc.encode(b) : b; chunks.push(u); len += u.length; };
  const obj = (n, body) => { offsets[n] = len; push(`${n} 0 obj\n`); push(body); push('\nendobj\n'); };
  const PW = 842, PH = 595;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`);
  offsets[4] = len;
  push(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  push('\nendstream\nendobj\n');
  const content = `q ${PW} 0 0 ${PH} 0 0 cm /Im0 Do Q`;
  obj(5, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  const xref = len;
  let x = 'xref\n0 6\n0000000000 65535 f \n';
  for (let i = 1; i <= 5; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/* ---------------- Tek parça (pişirilmiş ağ) ---------------- */

// Üçgen listesini (konum: Float32 x3, normal: Float32 x3 ya da null) tek metne paketler: "n|base64".
// Konum 4 bayt, normal 1 bayt (−127..127) tutulur.
export function packMesh(pos, nor) {
  const n = Math.floor(pos.length / 3);
  const bytes = new Uint8Array(n * 12 + n * 3);
  bytes.set(new Uint8Array(pos.buffer, pos.byteOffset, n * 12), 0);
  const nb = new Int8Array(bytes.buffer, n * 12, n * 3);
  if (nor) for (let i = 0; i < n * 3; i++) nb[i] = Math.max(-127, Math.min(127, Math.round(nor[i] * 127)));
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return n + '|' + btoa(bin) + (nor ? '' : '|0');
}
// packMesh'in tersi: { pos: Float32Array, nor: Float32Array | null }; bozuk metinde null
export function unpackMesh(str) {
  try {
    const [ns, b64, flag] = String(str).split('|');
    const n = parseInt(ns, 10);
    if (!(n > 0) || n % 3 !== 0) return null;
    const bin = atob(b64);
    if (bin.length !== n * 15) return null;
    const buf = new ArrayBuffer(bin.length);
    const u = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    const pos = new Float32Array(buf, 0, n * 3);
    let nor = null;
    if (flag !== '0') {
      const nb = new Int8Array(buf, n * 12, n * 3);
      nor = new Float32Array(n * 3);
      for (let i = 0; i < n * 3; i++) nor[i] = nb[i] / 127;
    }
    return { pos, nor };
  } catch (e) { return null; }
}

/* ---------------- Teknik resim: gizli çizgi, delik ölçüsü, kesit yerleşimi ---------------- */

// Bakan gözün yönü (modelden göze doğru) — ön / yan / üst görünüş
export const VIEW_TO_VIEWER = { front: [0, 0, 1], side: [1, 0, 0], top: [0, 1, 0] };

// Model (dünya) noktasını kağıt mm'sine çevirir. bb = { min:[x,y,z], max:[x,y,z] }, box = görünüşün kağıttaki kutusu
export function sheetProject(view, p, bb, box, s) {
  if (view === 'front') return [box.x + (p[0] - bb.min[0]) * s, box.y + (bb.max[1] - p[1]) * s];
  if (view === 'side') return [box.x + (bb.max[2] - p[2]) * s, box.y + (bb.max[1] - p[1]) * s];
  return [box.x + (p[0] - bb.min[0]) * s, box.y + (p[2] - bb.min[2]) * s]; // üst: ekranın üstü = -Z
}

// THREE'nin 'XYZ' Euler sırasıyla (R = Rx·Ry·Rz) derece cinsinden döndürme
export function rotXYZ(v, rx = 0, ry = 0, rz = 0) {
  let [x, y, z] = v;
  const c = (d) => Math.cos(d * D2R), n = (d) => Math.sin(d * D2R);
  if (rz) { const a = x * c(rz) - y * n(rz), b = x * n(rz) + y * c(rz); x = a; y = b; }
  if (ry) { const a = x * c(ry) + z * n(ry), b = -x * n(ry) + z * c(ry); x = a; z = b; }
  if (rx) { const a = y * c(rx) - z * n(rx), b = y * n(rx) + z * c(rx); y = a; z = b; }
  return [x, y, z];
}
// vektör bir dünya eksenine paralelse 'x' | 'y' | 'z', değilse null
export function axisKey(v, tol = 1e-3) {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (!(l > 1e-9)) return null;
  const a = v.map((q) => Math.abs(q) / l);
  if (a[0] > 1 - tol) return 'x';
  if (a[1] > 1 - tol) return 'y';
  if (a[2] > 1 - tol) return 'z';
  return null;
}

// Eksene paralel yuvarlak / kare delikler (oyuk olan silindir ve kutular).
// Dönüş: { id, kind:'round'|'rect', axis, c:[x,y,z] (orta nokta), d (yuvarlak), ext:[ex,ey,ez] (kare), len }
export function holeList(parts) {
  const out = [];
  const num = (v, d = 0) => (isFinite(Number(v)) ? Number(v) : d);
  parts.forEach((p, i) => {
    if (i === 0 || p.hidden || p.op !== 'sub') return;
    if (p.type !== 'cylinder' && p.type !== 'box') return;
    const rx = num(p.rx), ry = num(p.ry), rz = num(p.rz);
    const ax = rotXYZ([0, 1, 0], rx, ry, rz);
    const key = axisKey(ax);
    if (!key) return;
    const h = Math.max(num(p.h, 1), 0.01);
    const c = [num(p.x) + ax[0] * h / 2, num(p.y) + ax[1] * h / 2, num(p.z) + ax[2] * h / 2];
    if (p.type === 'cylinder') {
      out.push({ id: p.id, kind: 'round', axis: key, c, d: Math.max(num(p.d, 1), 0.01), len: h });
      return;
    }
    const u = rotXYZ([Math.max(num(p.w, 1), 0.01), 0, 0], rx, ry, rz), v = rotXYZ([0, 0, Math.max(num(p.l, 1), 0.01)], rx, ry, rz);
    if (!axisKey(u) || !axisKey(v)) return; // kendi ekseni etrafında eğik kare delik: etiketleme yok
    out.push({ id: p.id, kind: 'rect', axis: key, c, ext: [0, 1, 2].map((k) => Math.abs(u[k]) + Math.abs(v[k])), len: h });
  });
  return out;
}

// Üçgen listesinden (düz Float32Array, 9 sayı = 1 üçgen) belirli bir bakış yönü için çizgi adayları:
// keskin kenarlar (yüzler arası açı > creaseDeg) + siluet kenarları (biri göze bakan, diğeri bakmayan yüz).
// dir: modelden göze doğru birim vektör. Dönüş: [[x1,y1,z1,x2,y2,z2], ...]
export function viewEdges(pos, dir, creaseDeg = 35) {
  const nTri = Math.floor(pos.length / 9);
  const q = 1000;
  const ids = new Map(), V = [];
  const vid = (x, y, z) => {
    const k = Math.round(x * q) + ',' + Math.round(y * q) + ',' + Math.round(z * q);
    let id = ids.get(k);
    if (id === undefined) { id = V.length; ids.set(k, id); V.push([x, y, z]); }
    return id;
  };
  const dl = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const d = [dir[0] / dl, dir[1] / dl, dir[2] / dl];
  const cosC = Math.cos(creaseDeg * D2R);
  const edges = new Map();
  const N = [];
  for (let t = 0; t < nTri; t++) {
    const o = t * 9;
    const a = vid(pos[o], pos[o + 1], pos[o + 2]), b = vid(pos[o + 3], pos[o + 4], pos[o + 5]), c = vid(pos[o + 6], pos[o + 7], pos[o + 8]);
    if (a === b || b === c || a === c) continue;
    const ux = pos[o + 3] - pos[o], uy = pos[o + 4] - pos[o + 1], uz = pos[o + 5] - pos[o + 2];
    const vx = pos[o + 6] - pos[o], vy = pos[o + 7] - pos[o + 1], vz = pos[o + 8] - pos[o + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const nl = Math.hypot(nx, ny, nz);
    if (!(nl > 1e-12)) continue;
    const fi = N.length;
    N.push([nx / nl, ny / nl, nz / nl]);
    for (const [e0, e1] of [[a, b], [b, c], [c, a]]) {
      const k = e0 < e1 ? e0 + '_' + e1 : e1 + '_' + e0;
      let e = edges.get(k);
      if (!e) { e = { a: Math.min(e0, e1), b: Math.max(e0, e1), f: [] }; edges.set(k, e); }
      e.f.push(fi);
    }
  }
  const out = [];
  const eps = 1e-6;
  for (const e of edges.values()) {
    if (e.f.length < 2) continue;
    let draw = e.f.length > 2;
    if (!draw) {
      const n1 = N[e.f[0]], n2 = N[e.f[1]];
      if (n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2] < cosC) draw = true;
      else {
        const s1 = n1[0] * d[0] + n1[1] * d[1] + n1[2] * d[2], s2 = n2[0] * d[0] + n2[1] * d[1] + n2[2] * d[2];
        draw = (s1 > eps && s2 < -eps) || (s1 < -eps && s2 > eps);
      }
    }
    if (draw) out.push([...V[e.a], ...V[e.b]]);
  }
  return out;
}

// 2B kısa parçaları uç uca bağlayıp çok noktalı çizgilere çevirir (kesik çizgi deseni kesintisiz aksın diye).
// segs: [[x1,y1,x2,y2], ...]  Dönüş: [[ [x,y], [x,y], ... ], ...]
export function chainPolylines(segs, tol = 1e-3) {
  const key = (x, y) => Math.round(x / tol) + ',' + Math.round(y / tol);
  const list = segs.filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) > tol);
  const at = new Map();
  list.forEach((s, i) => {
    for (const k of [key(s[0], s[1]), key(s[2], s[3])]) {
      if (!at.has(k)) at.set(k, []);
      at.get(k).push(i);
    }
  });
  const used = new Array(list.length).fill(false);
  const extend = (line, front) => {
    for (;;) {
      const tip = front ? line[0] : line[line.length - 1];
      const cand = (at.get(key(tip[0], tip[1])) || []).find((i) => !used[i]);
      if (cand === undefined) return;
      used[cand] = true;
      const s = list[cand];
      const sameStart = key(s[0], s[1]) === key(tip[0], tip[1]);
      const next = sameStart ? [s[2], s[3]] : [s[0], s[1]];
      if (front) line.unshift(next); else line.push(next);
    }
  };
  const lines = [];
  list.forEach((s, i) => {
    if (used[i]) return;
    used[i] = true;
    const line = [[s[0], s[1]], [s[2], s[3]]];
    extend(line, false);
    extend(line, true);
    lines.push(line);
  });
  return lines;
}

// Kesit görünüşü: verilen boşluğa (kağıt mm) sığan standart ölçek ve kutu. D = yatay boyut, H = dikey boyut.
export function sectionFit(slot, D, H) {
  const raw = Math.min((slot.w - 14) / Math.max(D, 0.001), (slot.h - 14) / Math.max(H, 0.001));
  const scale = pickScale(raw);
  return { scale, box: { x: slot.x + 10, y: slot.y + 3, w: D * scale, h: H * scale } };
}

/* ---------------- Genel köşe pahı / yuvarlaması (2B çokgen) ---------------- */

// pts: [[x,y],...]; corners: pahlanacak/yuvarlanacak köşe indeksleri; rr > 0 ise yuvarlama (yarıçap), yoksa c kadar pah.
// closed=false ise uçlar (0 ve son) değişmez. Dönüş: yeni nokta listesi (sıra korunur).
export function cornerCut(pts, corners, c, rr, seg = 8, closed = true) {
  const n = pts.length;
  const set = new Set(corners);
  const out = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const edgeEnd = !closed && (i === 0 || i === n - 1);
    if (!set.has(i) || edgeEnd || (!(rr > 0) && !(c > 0))) { out.push(p.slice()); continue; }
    const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    if (la < 1e-9 || lb < 1e-9) { out.push(p.slice()); continue; }
    const u = [(a[0] - p[0]) / la, (a[1] - p[1]) / la], v = [(b[0] - p[0]) / lb, (b[1] - p[1]) / lb];
    const cs = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]));
    const th = Math.acos(cs);                      // iki kenar arasındaki açı (π = düz)
    if (th > Math.PI - 0.01 || th < 0.01) { out.push(p.slice()); continue; }
    const half = Math.tan(th / 2);
    const maxT = 0.45 * Math.min(la, lb);
    let t = rr > 0 ? rr / half : c;
    t = Math.min(t, maxT);
    const A = [p[0] + u[0] * t, p[1] + u[1] * t], B = [p[0] + v[0] * t, p[1] + v[1] * t];
    if (!(rr > 0)) { out.push(A, B); continue; }
    const rad = t * half;                          // sıkıştırılmış tangent uzunluğuna göre yarıçap
    const bx = u[0] + v[0], by = u[1] + v[1], bl = Math.hypot(bx, by);
    const dc = rad / Math.sin(th / 2);
    const C = [p[0] + (bx / bl) * dc, p[1] + (by / bl) * dc];
    const a0 = Math.atan2(A[1] - C[1], A[0] - C[0]);
    let sw = Math.atan2(B[1] - C[1], B[0] - C[0]) - a0;
    while (sw > Math.PI) sw -= Math.PI * 2;
    while (sw < -Math.PI) sw += Math.PI * 2;
    const k = Math.max(2, Math.ceil(seg * Math.abs(sw) / (Math.PI / 2)));
    for (let j = 0; j <= k; j++) {
      const ang = a0 + sw * (j / k);
      out.push([C[0] + rad * Math.cos(ang), C[1] + rad * Math.sin(ang)]);
    }
  }
  return out;
}

// Koni / kesik koni profili (yarıçap, y): kapalı, saat yönünün tersi. Alt ve üst dış kenar pahlanır / yuvarlanır.
export function coneProfile(r1, r2, h, c = 0, rr = 0) {
  const base = [[0, 0], [r1, 0], [Math.max(r2, 0.001), h], [0, h]];
  return cornerCut(base, rr > 0 || c > 0 ? [1, 2] : [], c, rr);
}
// Boru kesiti (halka): dış r_o, iç r_i; dört köşe de işlenir
export function ringProfile(ro, ri, h, c = 0, rr = 0) {
  const base = [[ri, 0], [ro, 0], [ro, h], [ri, h]];
  const e = Math.min((ro - ri) / 2, h / 2) - 0.01;
  return cornerCut(base, [0, 1, 2, 3], Math.min(c, Math.max(e, 0)), Math.min(rr, Math.max(e, 0)));
}

// Dönüş açısı (derece) en az `deg` olan köşelerin indeksleri (kapalı çokgen); dairesel çokgenlerin küçük kırıklarını eler
export function cornersAbove(pts, deg = 15) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i + n - 1) % n], p = pts[i], b = pts[(i + 1) % n];
    const t1 = Math.atan2(p[1] - a[1], p[0] - a[0]), t2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
    let d = Math.abs(t2 - t1);
    if (d > Math.PI) d = Math.PI * 2 - d;
    if (d * 180 / Math.PI >= deg) out.push(i);
  }
  return out;
}
