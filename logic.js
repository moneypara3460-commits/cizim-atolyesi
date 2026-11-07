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
};

export const DEFAULTS = {
  w: 30, l: 30, h: 20, d: 30, d2: 0, di: 20, r: 0,
  x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0,
};

const fin = (v, fallback) => (typeof v === 'number' && isFinite(v) ? v : fallback);

// Parçanın yüksekliği (küre için çap)
export function heightOf(p) {
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

  if (/döndür|çevir/.test(t) && n !== null) {
    const ax = t.match(/(?:^|\s)([xyz])(?:'[a-zçğıöşü]*)?(?=\s|$)/);
    return [{ cmd: 'rotate', axis: ax ? ax[1] : 'y', deg: n }];
  }
  if (/yuvarla/.test(t) && n !== null && !/delik/.test(t)) {
    return [{ cmd: 'set', key: 'r', value: n }];
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
