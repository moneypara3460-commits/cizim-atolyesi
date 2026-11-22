// 2B çizim: AutoCAD tarzı klavye komutları — saf çözümleyici (DOM yok, Node'da test edilir).
// Kullanım: yazılan satır → parseLine(satır) → { kind: 'cmd' | 'abs' | 'rel' | 'polar' | 'num' | 'radius' | 'empty' | 'bad' }.

const fold = (s) => String(s ?? '').trim().toLocaleLowerCase('tr-TR')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');

// komut adı → { tool } (araç seçer) ya da { act } (düğme işlemi). AutoCAD kısaltmaları + İngilizce + Türkçe adlar.
export const COMMANDS = [
  { tool: 'line', names: ['l', 'line', 'cizgi'], label: 'Çizgi' },
  { tool: 'circle', names: ['c', 'circle', 'daire', 'cember'], label: 'Daire' },
  { tool: 'arc', names: ['a', 'arc', 'yay'], label: 'Yay' },
  { tool: 'rect', names: ['rec', 'rectang', 'rectangle', 'dikdortgen'], label: 'Dikdörtgen' },
  { tool: 'dim', names: ['dim', 'dli', 'dimlinear', 'dal', 'olcu'], label: 'Ölçü' },
  { tool: 'rdim', names: ['dra', 'ddi', 'dimradius', 'dimdiameter', 'cap', 'yaricap'], label: 'Çap / R ölçüsü' },
  { tool: 'adim', names: ['dan', 'dimangular', 'aci', 'aci olcu'], label: 'Açı ölçüsü' },
  { tool: 'hatch', names: ['h', 'bh', 'hatch', 'tarama', 'tara'], label: 'Tarama' },
  { tool: 'text', names: ['t', 'dt', 'mt', 'text', 'mtext', 'yazi'], label: 'Yazı' },
  { tool: 'select', names: ['sel', 'select', 'sec'], label: 'Seç' },
  { tool: 'trim', names: ['tr', 'trim', 'kirp'], label: 'Kırp' },
  { tool: 'extend', names: ['ex', 'extend', 'uzat'], label: 'Uzat' },
  { tool: 'offset', names: ['o', 'offset', 'ofset'], label: 'Ofset' },
  { tool: 'fillet', names: ['f', 'fillet', 'radyus', 'yuvarla'], label: 'Radyus' },
  { tool: 'move', names: ['m', 'move', 'tasi'], label: 'Taşı' },
  { tool: 'copy', names: ['co', 'cp', 'copy', 'kopyala'], label: 'Kopyala' },
  { tool: 'rotate', names: ['ro', 'rotate', 'dondur'], label: 'Döndür' },
  { tool: 'mirror', names: ['mi', 'mirror', 'ayna'], label: 'Ayna' },
  { tool: 'array', names: ['ar', 'array', 'dizi'], label: 'Dizi' },
  { tool: 'scale', names: ['sc', 'scale', 'olcekle'], label: 'Ölçekle' },
  { tool: 'setdim', names: ['ov', 'olcu ver', 'olcuver', 'setdim'], label: 'Ölçü ver' },
  { tool: 'erase', names: ['e', 'erase', 'sil'], label: 'Sil' },
  { act: 'undo', names: ['u', 'undo', 'geri al', 'geri'], label: 'Geri al' },
  { act: 'redo', names: ['redo', 'yinele', 'ileri al'], label: 'İleri al' },
  { act: 'zfit', names: ['z', 'ze', 'zoom', 'sigdir', 'ekrana sigdir'], label: 'Ekrana sığdır' },
  { act: 'osnap', names: ['os', 'osnap', 'yakala', 'yakalama'], label: 'Uç nokta yakalama aç / kapat' },
  { act: 'ortho', names: ['ortho', 'orto', 'dik'], label: 'Dik (ortho) aç / kapat' },
  { act: 'sel-all', names: ['all', 'tumu', 'tumunu sec'], label: 'Tümünü seç' },
  { act: 'f-3d', names: ['3d', '3b', 'extrude', 'ext', 'ekstruzyon'], label: '3B parça yap' },
  { act: 'f-dxf', names: ['dxf', 'dxfout', 'kaydet', 'save'], label: 'DXF kaydet' },
  { act: 'f-open', names: ['open', 'dxfin', 'ac'], label: 'DXF aç' },
  { act: 'close', names: ['close', 'quit', 'kapat', 'cik'], label: 'Kapat' },
];
const BY_NAME = new Map();
for (const c of COMMANDS) for (const n of c.names) {
  if (BY_NAME.has(n)) throw new Error('2B komut adı çakışıyor: ' + n);
  BY_NAME.set(n, c);
}
export const findCommand = (s) => BY_NAME.get(fold(s)) || null;

// sayı: Türkçe ondalık virgül yalnız koordinat ayırıcı olarak kullanılmıyorsa geçer ("2,5" tek sayı)
const N = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)';
const RE_PAIR = new RegExp(`^(@?)\\s*(${N})\\s*[,;]\\s*(${N})$`);
const RE_POLAR = new RegExp(`^(@?)\\s*(${N})\\s*<\\s*(${N})$`);
const RE_NUM = new RegExp(`^(${N})$`);

// "2,5" → 2.5 (tek sayı); "10,5,20" gibi üç parçalı yazımlar reddedilir
const decimalComma = (s) => (/^[-+]?\d+,\d+$/.test(s) ? s.replace(',', '.') : s);

export function parseLine(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return { kind: 'empty' };
  // koordinat: x,y · x;y · @dx,dy  (Türkçe kullanıcı "10,5;20" yazarsa ; ayırıcıdır, virgül ondalık)
  if (s.includes(';')) {
    const m = s.replace(/,/g, '.').match(RE_PAIR);
    if (m) return { kind: m[1] ? 'rel' : 'abs', x: +m[2], y: +m[3] };
  }
  let m = s.match(RE_PAIR);
  // "2,5": nokta beklenirken (2, 5) koordinatı, sayı beklenirken 2,5 (alt) — hangisi olduğuna komut karar verir
  if (m) return { kind: m[1] ? 'rel' : 'abs', x: +m[2], y: +m[3], ...(/^[-+]?\d+,\d+$/.test(s) ? { alt: +decimalComma(s) } : {}) };
  m = s.replace(/,/g, '.').match(RE_POLAR);
  if (m) return { kind: 'polar', rel: !!m[1], len: +m[2], ang: +m[3] };
  const one = decimalComma(s);
  m = one.match(RE_NUM);
  if (m) return { kind: 'num', v: +m[1] };
  // R5 / R 2,5 → yarıçap · Ø12 / D8 → çap (harf + sayı; REC, DIM gibi komutlar sayı içermediği için karışmaz)
  m = s.match(/^([rRdDø⌀Ø])\s*(\S+)$/);
  if (m) {
    const n = decimalComma(m[2]).match(RE_NUM);
    if (n) return /^[rR]$/.test(m[1]) ? { kind: 'radius', v: +n[1] } : { kind: 'num', v: +n[1] };
  }
  const c = findCommand(s);
  if (c) return { kind: 'cmd', cmd: c };
  return { kind: 'bad', text: s };
}

// Doğrudan mesafe girişi: son noktadan imlecin yönünde L kadar (imleç yoksa / aynı yerdeyse varsayılan açı)
export function directPoint(base, aimP, len, fallbackDeg = 0, ortho = false) {
  let dx = aimP ? aimP[0] - base[0] : 0, dy = aimP ? aimP[1] - base[1] : 0;
  if (!(Math.hypot(dx, dy) > 1e-9)) { const a = fallbackDeg * Math.PI / 180; dx = Math.cos(a); dy = Math.sin(a); }
  if (ortho) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0; }
  const L = Math.hypot(dx, dy);
  return [base[0] + dx / L * len, base[1] + dy / L * len];
}

// kutupsal: (taban) + L·(cos A, sin A), açı derece, saat yönü tersi +
export const polarPoint = (base, len, deg) => {
  const a = deg * Math.PI / 180;
  return [base[0] + len * Math.cos(a), base[1] + len * Math.sin(a)];
};

// klavye olayı → yazılabilir karakter mi (komut satırına eklenir)
export const isTypingKey = (e) => !e.ctrlKey && !e.metaKey && !e.altKey && typeof e.key === 'string' && e.key.length === 1 && e.key !== ' ';
