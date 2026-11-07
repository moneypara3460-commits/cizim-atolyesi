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

// Çizimden (mutlak dünya koordinatları) parça alanları üretir
export function sketchFromDraw(d) {
  const bb = bboxPts(d.pts);
  const cu = (bb.minU + bb.maxU) / 2, cv = (bb.minV + bb.maxV) / 2;
  const base = { type: 'sketch', mode: d.mode, plane: d.plane, h: d.mode === 'revolve' ? 0 : d.h };
  const r4 = (n) => Math.round(n * 1e4) / 1e4 + 0;
  if (d.mode === 'revolve') {
    return { ...base, plane: 'front', x: 0, y: r4(bb.minV), z: 0, pts: d.pts.map(([u, v]) => [r4(u), r4(v - bb.minV)]) };
  }
  if (d.plane === 'top') {
    return { ...base, x: r4(cu), y: 0, z: r4(cv), pts: d.pts.map(([u, v]) => [r4(u - cu), r4(v - cv)]) };
  }
  return { ...base, x: r4(cu), y: r4(bb.minV), z: 0, pts: d.pts.map(([u, v]) => [r4(u - cu), r4(v - bb.minV)]) };
}
// Parçadan çizime (düzenlemek için mutlak koordinatlar)
export function sketchToDraw(p) {
  const x = fin(p.x, 0), y = fin(p.y, 0), z = fin(p.z, 0);
  let pts;
  if (p.mode === 'revolve') pts = p.pts.map(([u, v]) => [u, v + y]);
  else if (p.plane === 'top') pts = p.pts.map(([u, v]) => [u + x, v + z]);
  else pts = p.pts.map(([u, v]) => [u + x, v + y]);
  return { mode: p.mode, plane: p.mode === 'revolve' ? 'front' : p.plane, pts, h: fin(p.h, 20) };
}
export function sketchHeight(p) {
  if (!p.pts || !p.pts.length) return 0;
  if (p.mode !== 'revolve' && p.plane === 'top') return fin(p.h, 0);
  return bboxPts(p.pts).maxV;
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

const clone = (p) => JSON.parse(JSON.stringify(p));

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
    if (axis === 'x') c.pts = p.pts.map(([u, v]) => [-u, v]);
    else if (p.plane === 'top') c.pts = p.pts.map(([u, v]) => [u, -v]);
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
