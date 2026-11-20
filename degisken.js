// Parametrik model: global değişkenler, denklemler, parça ölçülerinin değişkenlere bağlanması. Saf hesap modülü.
//
// İfade dili (SolidWorks "Denklemler" gibi; eval KULLANILMAZ — kendi ayrıştırıcısı):
//   sayılar: 12  2.5  2,5 (ondalık virgül de olur)   işlemler: + − * / ^ ve parantez   tekli eksi: -L
//   değişken adları: harf / rakam / _ (Türkçe harfler olur), harfle başlar: L, Kalinlik, delik_cap
//   fonksiyonlar (bağımsız değişken ayırıcı ; — Türkçe Excel gibi): sin cos tan asin acos atan (DERECE),
//   sqrt / kok, abs, min(a; b; …), max(a; b; …), round / yuvarla(x [; basamak]), floor / asagi, ceil / yukari, pi
// Değişkenler birbirine başvurabilir (D = L/4); döngü (A = B, B = A) hata verir.

const D2R = Math.PI / 180;
const FN = {
  sin: [1, 1, (x) => Math.sin(x * D2R)], cos: [1, 1, (x) => Math.cos(x * D2R)], tan: [1, 1, (x) => Math.tan(x * D2R)],
  asin: [1, 1, (x) => Math.asin(x) / D2R], acos: [1, 1, (x) => Math.acos(x) / D2R], atan: [1, 1, (x) => Math.atan(x) / D2R],
  sqrt: [1, 1, Math.sqrt], kok: [1, 1, Math.sqrt], abs: [1, 1, Math.abs],
  min: [1, 99, (...a) => Math.min(...a)], max: [1, 99, (...a) => Math.max(...a)],
  round: [1, 2, (x, n = 0) => { const k = 10 ** Math.round(n); return Math.round(x * k) / k; }],
  floor: [1, 1, Math.floor], ceil: [1, 1, Math.ceil],
};
FN.yuvarla = FN.round; FN.asagi = FN.floor; FN.yukari = FN.ceil;
const SABIT = { pi: Math.PI };
const AD_RE = /^[A-Za-zÇĞİÖŞÜçğıöşü_][A-Za-z0-9ÇĞİÖŞÜçğıöşü_]*$/;
export const AYRILMIS = new Set([...Object.keys(FN), ...Object.keys(SABIT)]);

export class IfadeHatasi extends Error {}

function tokenize(s) {
  const t = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][+-]?\d+)?/.exec(s.slice(i));
    if (num) { t.push({ k: 'n', v: Number(num[0].replace(',', '.')) }); i += num[0].length; continue; }
    const id = /^[A-Za-zÇĞİÖŞÜçğıöşü_][A-Za-z0-9ÇĞİÖŞÜçğıöşü_]*/.exec(s.slice(i));
    if (id) { t.push({ k: 'id', v: id[0] }); i += id[0].length; continue; }
    if ('+-*/^();'.includes(c)) { t.push({ k: c }); i++; continue; }
    if (c === '−') { t.push({ k: '-' }); i++; continue; }
    if (c === '×') { t.push({ k: '*' }); i++; continue; }
    throw new IfadeHatasi('Anlaşılmayan işaret: ' + c);
  }
  return t;
}

// Özyinelemeli ayrıştırıcı → ağaç { n } | { v: ad } | { op, a, b } | { neg } | { fn, args }
export function ayristir(s) {
  if (typeof s !== 'string' || !s.trim()) throw new IfadeHatasi('Boş ifade');
  if (s.length > 500) throw new IfadeHatasi('İfade çok uzun');
  const t = tokenize(s);
  let p = 0;
  const peek = () => t[p], eat = (k) => { if (!t[p] || t[p].k !== k) throw new IfadeHatasi(k === ')' ? 'Kapanmayan parantez' : 'Beklenen: ' + k); return t[p++]; };
  function expr() { let a = term(); while (peek() && (peek().k === '+' || peek().k === '-')) { const op = t[p++].k; a = { op, a, b: term() }; } return a; }
  function term() { let a = unary(); while (peek() && (peek().k === '*' || peek().k === '/')) { const op = t[p++].k; a = { op, a, b: unary() }; } return a; }
  function unary() { if (peek() && peek().k === '-') { p++; return { neg: unary() }; } if (peek() && peek().k === '+') { p++; return unary(); } return power(); }
  function power() { const a = atom(); if (peek() && peek().k === '^') { p++; return { op: '^', a, b: unary() }; } return a; }   // sağdan birleşir
  function atom() {
    const x = t[p++];
    if (!x) throw new IfadeHatasi('İfade yarım kaldı');
    if (x.k === 'n') return { n: x.v };
    if (x.k === '(') { const e = expr(); eat(')'); return e; }
    if (x.k === 'id') {
      const ad = x.v.toLowerCase();
      if (peek() && peek().k === '(') {
        if (!FN[ad]) throw new IfadeHatasi('Bilinmeyen fonksiyon: ' + x.v);
        p++;
        const args = [];
        if (!(peek() && peek().k === ')')) { args.push(expr()); while (peek() && peek().k === ';') { p++; args.push(expr()); } }
        eat(')');
        const [lo, hi] = FN[ad];
        if (args.length < lo || args.length > hi) throw new IfadeHatasi(x.v + ': ' + (lo === hi ? lo : lo + '–' + hi) + ' değer alır (ayırıcı ;)');
        return { fn: ad, args };
      }
      if (SABIT[ad] !== undefined) return { n: SABIT[ad] };
      return { v: x.v };
    }
    throw new IfadeHatasi('Beklenmeyen: ' + x.k);
  }
  const e = expr();
  if (p < t.length) throw new IfadeHatasi(t[p].k === ')' ? 'Fazla kapanan parantez' : 'Fazladan ifade: ' + (t[p].v ?? t[p].k));
  return e;
}

// ağaçtaki değişken adları
export function adlar(ag, out = new Set()) {
  if (ag.v !== undefined) out.add(ag.v);
  if (ag.a) adlar(ag.a, out); if (ag.b) adlar(ag.b, out); if (ag.neg) adlar(ag.neg, out);
  if (ag.args) ag.args.forEach((x) => adlar(x, out));
  return out;
}

export function hesapla(ag, env) {
  if (ag.n !== undefined) return ag.n;
  if (ag.v !== undefined) { if (!(ag.v in env)) throw new IfadeHatasi('Tanımsız değişken: ' + ag.v); return env[ag.v]; }
  if (ag.neg) return -hesapla(ag.neg, env);
  if (ag.fn) return FN[ag.fn][2](...ag.args.map((x) => hesapla(x, env)));
  const a = hesapla(ag.a, env), b = hesapla(ag.b, env);
  switch (ag.op) {
    case '+': return a + b; case '-': return a - b; case '*': return a * b;
    case '/': if (b === 0) throw new IfadeHatasi('Sıfıra bölme'); return a / b;
    case '^': return a ** b;
  }
  throw new IfadeHatasi('?');
}

// Tek ifade, verilen değerlerle. Dönüş: { deger } | { hata }
export function ifadeDegeri(s, env = {}) {
  try {
    const v = hesapla(ayristir(String(s)), env);
    if (!Number.isFinite(v)) return { hata: 'Sonuç sayı değil' };
    return { deger: v };
  } catch (e) { return { hata: e instanceof IfadeHatasi ? e.message : 'Hesaplanamadı' }; }
}

export const adGecerli = (ad) => typeof ad === 'string' && AD_RE.test(ad) && !AYRILMIS.has(ad.toLowerCase());

// Değişken listesini çöz: [{ ad, ifade }] → { deger: { ad: sayı }, hata: { ad: ileti }, satir: [satır hatası | ''], sira: [ad…] }
// Aynı ad iki kez yazılırsa ilk tanım geçerlidir; hata yalnız sonraki satırda (satir) görünür.
export function degiskenleriCoz(liste) {
  const deger = {}, hata = {}, ag = {}, sira = [], satir = [], ozel = {};
  const seen = new Set();
  for (const [i, d] of (Array.isArray(liste) ? liste : []).entries()) {
    const ad = d && d.ad;
    if (!adGecerli(ad)) { ozel[i] = ad ? 'Geçersiz ad (harfle başlamalı; harf, rakam, _; fonksiyon adı olamaz)' : 'Ad boş'; if (ad) hata[ad] = ozel[i]; continue; }
    if (seen.has(ad)) { ozel[i] = 'Aynı ad iki kez (ilk satır geçerli)'; continue; }
    seen.add(ad);
    try { ag[ad] = ayristir(String(d.ifade ?? '')); } catch (e) { hata[ad] = e.message; }
  }
  // derinlik öncelikli sıralama; döngü bulunursa döngüdekilere hata
  const durum = {};
  const ziyaret = (ad, yol) => {
    if (durum[ad] === 2) return;
    if (durum[ad] === 1) { const i = yol.indexOf(ad); for (const x of yol.slice(i)) hata[x] = 'Döngü: ' + [...yol.slice(i), ad].join(' → '); return; }
    durum[ad] = 1;
    for (const b of adlar(ag[ad])) if (ag[b]) ziyaret(b, [...yol, ad]);
    durum[ad] = 2; sira.push(ad);
  };
  for (const ad of Object.keys(ag)) ziyaret(ad, []);
  for (const ad of sira) {
    if (hata[ad]) continue;
    const eksik = [...adlar(ag[ad])].find((b) => !(b in deger));
    if (eksik) { hata[ad] = hata[eksik] ? 'Bağlı olduğu ' + eksik + ' hatalı' : 'Tanımsız değişken: ' + eksik; continue; }
    try { const v = hesapla(ag[ad], deger); if (Number.isFinite(v)) deger[ad] = v; else hata[ad] = 'Sonuç sayı değil'; }
    catch (e) { hata[ad] = e.message; }
  }
  (Array.isArray(liste) ? liste : []).forEach((d, i) => { satir[i] = ozel[i] || (d && hata[d.ad]) || ''; });
  return { deger, hata, satir, sira };
}

// Parçaların bağlı alanlarını hesapla: p.eq = { alan: ifade }. Dönüş: [{ id, alan, deger } | { id, alan, hata }]
export function bagliAlanlar(parts, deger) {
  const out = [];
  for (const p of parts || []) {
    if (!p || !p.eq || typeof p.eq !== 'object') continue;
    for (const [alan, ifade] of Object.entries(p.eq)) {
      const r = ifadeDegeri(ifade, deger);
      out.push(r.hata ? { id: p.id, alan, hata: r.hata } : { id: p.id, alan, deger: r.deger });
    }
  }
  return out;
}

// Proje kaydından gelen değişken listesini temizle
export function degiskenSan(liste) {
  if (!Array.isArray(liste)) return [];
  return liste.slice(0, 200).filter((d) => d && typeof d.ad === 'string').map((d) => ({ ad: d.ad.slice(0, 40), ifade: String(d.ifade ?? '').slice(0, 500) }));
}

/* ================= Varyantlar (SolidWorks "Konfigürasyon") ve tasarım tablosu ================= */
// Varyant: { ad, deg: { değişkenAdı: ifade }, gizli: [parça id] }. deg'de boş / olmayan değişken ana ifadesini kullanır.
// Durum: { aktif: -1 (Ana) | varyant sırası, ana: { gizli: [...] }, list: [varyant…] }
export const ANA = 'Ana';

export function varyantDegiskenleri(liste, v) {
  if (!v || !v.deg) return liste || [];
  return (liste || []).map((d) => {
    const x = v.deg[d.ad];
    return typeof x === 'string' && x.trim() ? { ad: d.ad, ifade: x } : d;
  });
}

const idler = (a) => (Array.isArray(a) ? [...new Set(a.filter((x) => Number.isInteger(x)))].slice(0, 2000) : []);
export function varyantSan(o) {
  const r = { aktif: -1, ana: { gizli: [] }, list: [] };
  if (!o || typeof o !== 'object') return r;
  r.ana.gizli = idler(o.ana && o.ana.gizli);
  if (Array.isArray(o.list)) {
    const adlarim = new Set([ANA.toLowerCase()]);
    for (const v of o.list.slice(0, 100)) {
      if (!v || typeof v.ad !== 'string' || !v.ad.trim()) continue;
      const ad = v.ad.trim().slice(0, 40);
      if (adlarim.has(ad.toLowerCase())) continue;
      adlarim.add(ad.toLowerCase());
      const deg = {};
      if (v.deg && typeof v.deg === 'object') for (const [k, x] of Object.entries(v.deg).slice(0, 200)) if (typeof k === 'string' && k.length <= 40 && (typeof x === 'string' || typeof x === 'number')) deg[k] = String(x).slice(0, 500);
      r.list.push({ ad, deg, gizli: idler(v.gizli) });
    }
  }
  if (Number.isInteger(o.aktif) && o.aktif >= 0 && o.aktif < r.list.length) r.aktif = o.aktif;
  return r;
}

// Yeni varyant adı: "Varyant 1", "Varyant 2"…
export function yeniVaryantAdi(list) {
  const var_ = new Set((list || []).map((v) => v.ad.toLowerCase()));
  let k = 1; while (var_.has(('Varyant ' + k).toLowerCase())) k++;
  return 'Varyant ' + k;
}

// Tasarım tablosu → CSV (ayırıcı ; — Türkçe Excel; ondalık virgül ifade içinde aynen kalır). İlk satır Ana.
const hucre = (s) => { s = String(s ?? ''); return /[;"\r\n]/.test(s) || /^[=+\-@]/.test(s) ? '"' + (/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""') + '"' : s; };
export function tabloCsv(vars, durum) {
  const ad = (vars || []).map((d) => d.ad);
  const satirlar = [['Varyant', ...ad], [ANA, ...(vars || []).map((d) => d.ifade)]];
  for (const v of (durum && durum.list) || []) satirlar.push([v.ad, ...ad.map((a) => (v.deg && v.deg[a]) || '')]);
  return '﻿' + satirlar.map((r) => r.map(hucre).join(';')).join('\r\n') + '\r\n';
}

function csvSatirlar(text) {
  const out = []; let row = [], cell = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  const sep = (() => { const ilk = s.split(/\r?\n/)[0] || ''; return ilk.includes(';') ? ';' : ilk.includes('\t') ? '\t' : ','; })();
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && cell === '') { q = true; continue; }
    if (c === sep) { row.push(cell); cell = ''; continue; }
    if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; continue; }
    cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim() !== ''));
}

// CSV → { vars: yeni değişken listesi, list: varyantlar } | { hata }. Var olan varyantların bastırma (gizli) bilgisi adla korunur.
export function csvTablo(text, vars, durum) {
  if (typeof text !== 'string' || text.length > 500000) return { hata: 'Dosya okunamadı ya da çok büyük' };
  const r = csvSatirlar(text);
  if (r.length < 2) return { hata: 'Tabloda başlık ve en az bir satır olmalı' };
  const bas = r[0].map((x) => x.trim().replace(/^'/, ''));
  const sut = bas.slice(1);
  if (!sut.length) return { hata: 'Tabloda değişken sütunu yok' };
  for (const a of sut) if (!adGecerli(a)) return { hata: 'Geçersiz değişken adı: ' + (a || '(boş)') };
  if (new Set(sut).size !== sut.length) return { hata: 'Aynı değişken iki sütunda' };
  const temiz = (x) => String(x ?? '').trim().replace(/^'(?=[=+\-@])/, '');
  const yeniVars = (vars || []).map((d) => ({ ...d }));
  for (const a of sut) if (!yeniVars.some((d) => d.ad === a)) yeniVars.push({ ad: a, ifade: '0' });
  const eski = new Map(((durum && durum.list) || []).map((v) => [v.ad.toLowerCase(), v]));
  const list = [], gor = new Set();
  for (const row of r.slice(1, 102)) {
    const ad = temiz(row[0]).slice(0, 40);
    if (!ad) return { hata: 'Adı boş satır var' };
    if (gor.has(ad.toLowerCase())) return { hata: 'Aynı varyant adı iki kez: ' + ad };
    gor.add(ad.toLowerCase());
    if (ad.toLowerCase() === ANA.toLowerCase()) {
      sut.forEach((a, j) => { const x = temiz(row[j + 1]); if (x) yeniVars.find((d) => d.ad === a).ifade = x.slice(0, 500); });
      continue;
    }
    const deg = {};
    sut.forEach((a, j) => { const x = temiz(row[j + 1]); if (x) deg[a] = x.slice(0, 500); });
    list.push({ ad, deg, gizli: (eski.get(ad.toLowerCase()) || {}).gizli || [] });
  }
  return { vars: yeniVars, list };
}
