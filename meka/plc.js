// Mekatronik Mühendisliği — 5. aşama: kontrol. PLC giriş / çıkış listesi, adım (sıralama) tasarımı, denetimler ve
// IEC 61131-3 kod iskeleti (Yapılandırılmış Metin, ST) + PLCopen XML (TC6 XML v2.01). Saf fonksiyonlar; DOM gerektirmez
// (tests/meka-plc.test.mjs).
//
// Kaynaklar:
//   [IEC 61131-3]  Tanımlayıcı kuralları (harf / alt çizgi ile başlar; harf, rakam, alt çizgi; ardışık ya da sonda alt çizgi
//                  yok; büyük-küçük harf ayrımı yok), ayrılmış sözcükler, doğrudan adresleme (%IX bayt.bit, %QX, %IW, %QW),
//                  PROGRAM / CONFIGURATION / RESOURCE / TASK yapısı, TON zamanlayıcısı, CASE durum makinesi.
//   [IEC 60848]    GRAFCET: adım – geçiş – eylem; buradaki eylemler "N" (adım etkinken açık) niteleyicisiyle çalışır.
//   [PLCopen TC6]  XML biçimi v2.01 (resmî şemayla doğrulandı: tests/meka-plc.test.mjs, şema yerelde varsa).
// Güvenlik: acil durdurma ve koruyucu kilitleme bu standart PLC programına bırakılmaz (güvenlik rölesi / güvenlik PLC'si,
// 6. aşama). Program bir iskelettir; devreye almadan önce yetkili otomasyon mühendisi tarafından denetlenmeli ve sınanmalıdır.

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

export const SINYAL_TUR = { DI: 'Dijital giriş', DO: 'Dijital çıkış', AI: 'Analog giriş', AO: 'Analog çıkış' };
export const KART_SEC = { DI: [8, 16, 32], DO: [8, 16, 32], AI: [2, 4, 8], AO: [2, 4, 8] };
export const PLC_DEFAULTS = { diKart: 16, doKart: 16, aiKart: 4, aoKart: 2, yedek: 20, cevrim: 10 };
// Programın kendi adları (sinyal adı olarak kullanılamaz)
export const IC_ADLAR = ['Adim', 'SonAdim', 'AdimZaman', 'Sira_Ana', 'Sira', 'Config0', 'Res0', 'AnaGorev', 'PLC'];
// IEC 61131-3 ayrılmış sözcükler ve standart tür / blok adları
export const AYRILMIS = new Set(('ABS ACOS ACTION ADD AND ANY ANY_BIT ANY_DATE ANY_INT ANY_NUM ANY_REAL ARRAY ASIN AT ATAN BOOL BY BYTE CAL CALC CALCN CASE CD CDT CLK CONCAT CONFIGURATION CONSTANT COS CTD CTU CTUD CU CV D DATE DATE_AND_TIME DELETE DINT DIV DO DS DT DWORD ELSE ELSIF EN END_ACTION END_CASE END_CONFIGURATION END_FOR END_FUNCTION END_FUNCTION_BLOCK END_IF END_PROGRAM END_REPEAT END_RESOURCE END_STEP END_STRUCT END_TRANSITION END_TYPE END_VAR END_WHILE ENO EQ ET EXIT EXP EXPT F_EDGE F_TRIG FALSE FIND FOR FROM FUNCTION FUNCTION_BLOCK GE GT IF IN INITIAL_STEP INSERT INT INTERVAL JMP JMPC JMPCN L LD LDN LE LEFT LEN LIMIT LINT LN LOG LREAL LT LWORD MAX MID MIN MOD MOVE MUL MUX N NE NEG NON_RETAIN NOT OF ON OR ORN P PRIORITY PROGRAM PT PV Q Q1 QD QU R R1 R_EDGE R_TRIG READ_ONLY READ_WRITE REAL REPEAT REPLACE RESOURCE RET RETAIN RETC RETCN RETURN RIGHT ROL ROR RS S S1 SD SEL SHL SHR SIN SINGLE SINT SL SQRT SR ST STEP STN STRING STRUCT SUB TAN TASK THEN TIME TIME_OF_DAY TO TOD TOF TON TP TRANSITION TRUE TRUNC TYPE UDINT UINT ULINT UNTIL USINT VAR VAR_ACCESS VAR_CONFIG VAR_EXTERNAL VAR_GLOBAL VAR_IN_OUT VAR_INPUT VAR_OUTPUT VAR_TEMP WHILE WITH WORD WSTRING XOR XORN')
  .split(' ').concat(IC_ADLAR.map((s) => s.toUpperCase())));
export const AD_UZUNLUK = 32;   // taşınabilirlik için sınır (birçok geliştirme ortamı daha uzununu kabul eder)

const TR = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
// Serbest metinden geçerli bir tanımlayıcı önerir
export function tagOner(s, kullanilan = new Set()) {
  let t = String(s || '').replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR[c]).replace(/[^A-Za-z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  if (!t) t = 'Sinyal';
  if (/^[0-9]/.test(t)) t = 'S_' + t;
  t = t.slice(0, AD_UZUNLUK - 4).replace(/_+$/, '');
  if (AYRILMIS.has(t.toUpperCase())) t = t + '_1';
  let a = t, n = 2;
  while (kullanilan.has(a.toUpperCase())) a = t + '_' + n++;
  return a;
}
// Tanımlayıcı denetimi: hata metni ya da null
export function tagHata(t) {
  if (typeof t !== 'string' || !t) return 'ad boş';
  if (t.length > AD_UZUNLUK) return `${AD_UZUNLUK} karakterden uzun`;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(t)) return 'yalnız İngilizce harf, rakam ve alt çizgi; harf ya da alt çizgiyle başlamalı (Türkçe karakter olmaz)';
  if (/__/.test(t)) return 'ardışık alt çizgi olmaz';
  if (/_$/.test(t)) return 'alt çizgiyle bitemez';
  if (AYRILMIS.has(t.toUpperCase())) return 'IEC 61131-3 ayrılmış sözcüğü ya da programın kendi adı';
  return null;
}
const ADRES_RE = { DI: /^%IX(\d+)\.([0-7])$/, DO: /^%QX(\d+)\.([0-7])$/, AI: /^%IW(\d+)$/, AO: /^%QW(\d+)$/ };
// Adres atama: elle girilenler korunur, diğerleri sırayla boş kanala yerleşir
export function adresAta(sinyaller) {
  const dolu = new Set(), out = new Map();
  for (const s of sinyaller) if (s.adres && ADRES_RE[s.tur]?.test(s.adres)) dolu.add(s.adres);
  const sayac = { DI: 0, DO: 0, AI: 0, AO: 0 };
  const yaz = (tur, k) => (tur === 'DI' ? `%IX${k >> 3}.${k & 7}` : tur === 'DO' ? `%QX${k >> 3}.${k & 7}` : tur === 'AI' ? `%IW${k}` : `%QW${k}`);
  for (const s of sinyaller) {
    if (s.adres) { out.set(s.id, s.adres); continue; }
    let a;
    do a = yaz(s.tur, sayac[s.tur]++); while (dolu.has(a));
    dolu.add(a); out.set(s.id, a);
  }
  return out;
}

/* ---------- Geçiş koşulu ifadesi ----------
   Dil: AND / OR / NOT (ya da VE / VEYA / DEĞİL), parantez, TRUE / FALSE, sinyal adları ve adım süresi: T>=2s, T>=500ms, T>=1,5s, T>=1dk
   Önceliği ST ile aynı: NOT > AND > OR. Çıktı: ST ifadesi + kullanılan adlar. */
export function kosulCoz(metin) {
  const s = String(metin ?? '').trim();
  if (!s) throw new Error('geçiş koşulu boş');
  const toks = [];
  let i = 0;
  while (i < s.length) {
    const r = s.slice(i);
    let m;
    if ((m = /^\s+/.exec(r))) { i += m[0].length; continue; }
    if ((m = /^T\s*>=\s*(\d+(?:[.,]\d+)?)\s*(ms|s|sn|dk|min)?(?![A-Za-z0-9_])/i.exec(r))) {
      const v = Number(m[1].replace(',', '.')), u = (m[2] || 's').toLowerCase();
      const ms = Math.round(v * (u === 'ms' ? 1 : u === 'dk' || u === 'min' ? 60000 : 1000));
      if (!(ms > 0) || ms > 86400000) throw new Error('adım süresi 1 ms ile 24 saat arasında olmalı');
      toks.push({ k: 'zaman', ms }); i += m[0].length; continue;
    }
    if ((m = /^[()]/.exec(r))) { toks.push({ k: m[0] }); i++; continue; }
    if ((m = /^[A-Za-z_çÇğĞıİöÖşŞüÜ][A-Za-z0-9_çÇğĞıİöÖşŞüÜ]*/.exec(r))) {
      const w = m[0], W = w.replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR[c]).toUpperCase();
      if (W === 'AND' || W === 'VE') toks.push({ k: 'AND' });
      else if (W === 'OR' || W === 'VEYA') toks.push({ k: 'OR' });
      else if (W === 'NOT' || W === 'DEGIL') toks.push({ k: 'NOT' });
      else if (W === 'TRUE' || W === 'DOGRU') toks.push({ k: 'sabit', v: 'TRUE' });
      else if (W === 'FALSE' || W === 'YANLIS') toks.push({ k: 'sabit', v: 'FALSE' });
      else toks.push({ k: 'ad', v: w });
      i += w.length; continue;
    }
    throw new Error(`anlaşılmayan işaret: "${r[0]}"`);
  }
  let p = 0;
  const adlar = [], zamanlar = [];
  const bak = () => toks[p], al = (k) => { if (!toks[p] || toks[p].k !== k) throw new Error(k === ')' ? 'kapanmamış parantez' : 'beklenmeyen ifade sonu'); return toks[p++]; };
  function orE() { let a = andE(); while (bak()?.k === 'OR') { p++; a = a + ' OR ' + andE(); } return a; }
  function andE() { let a = notE(); while (bak()?.k === 'AND') { p++; a = a + ' AND ' + notE(); } return a; }
  function notE() {
    const t = bak();
    if (!t) throw new Error('eksik ifade');
    if (t.k === 'NOT') { p++; return 'NOT ' + notE(); }
    if (t.k === '(') { p++; const e = orE(); al(')'); return '(' + e + ')'; }
    if (t.k === 'sabit') { p++; return t.v; }
    if (t.k === 'zaman') { p++; zamanlar.push(t.ms); return `(AdimZaman.ET >= T#${t.ms}MS)`; }
    if (t.k === 'ad') { p++; adlar.push(t.v); return t.v; }
    throw new Error(t.k === ')' ? 'fazla kapanan parantez' : 'eksik işlenen (' + t.k + ' öncesinde)');
  }
  const st = orE();
  if (p < toks.length) throw new Error(toks[p].k === ')' ? 'fazla kapanan parantez' : 'iki işlenen arasında AND / OR eksik');
  return { st, adlar, zamanlar, sabitYanlis: st === 'FALSE' };
}

/* ---------- Proje verisi ---------- */
export function plcEmpty() { return { ayar: { ...PLC_DEFAULTS }, sinyaller: [], adimlar: [], kilitler: [], nextId: 1 }; }
export function plcSanitize(o) {
  const P = plcEmpty();
  if (!o || typeof o !== 'object') return P;
  for (const k of Object.keys(PLC_DEFAULTS)) if (fin(o.ayar?.[k])) P.ayar[k] = o.ayar[k];
  const ids = new Set();
  for (const s of Array.isArray(o.sinyaller) ? o.sinyaller.slice(0, 1000) : []) {
    if (!s || !fin(s.id) || ids.has(s.id) || !SINYAL_TUR[s.tur]) continue;
    P.sinyaller.push({ id: s.id, tag: typeof s.tag === 'string' ? s.tag.slice(0, 64) : '', tur: s.tur, aciklama: typeof s.aciklama === 'string' ? s.aciklama.slice(0, 120) : '', adres: typeof s.adres === 'string' ? s.adres.slice(0, 20).toUpperCase().replace(/\s/g, '') : '', ref: fin(s.ref) ? s.ref : null });
    ids.add(s.id);
  }
  for (const a of Array.isArray(o.adimlar) ? o.adimlar.slice(0, 200) : []) {
    if (!a || !fin(a.id) || ids.has(a.id)) continue;
    P.adimlar.push({ id: a.id, ad: typeof a.ad === 'string' ? a.ad.slice(0, 60) : '', cikislar: Array.isArray(a.cikislar) ? a.cikislar.filter(fin) : [], kosul: typeof a.kosul === 'string' ? a.kosul.slice(0, 300) : '', sonraki: fin(a.sonraki) ? a.sonraki : null });
    ids.add(a.id);
  }
  for (const k of Array.isArray(o.kilitler) ? o.kilitler.slice(0, 200) : []) if (Array.isArray(k) && k.length === 2 && k.every(fin) && k[0] !== k[1]) P.kilitler.push([k[0], k[1]]);
  P.nextId = Math.max(fin(o.nextId) ? o.nextId : 1, ...[...ids].map((i) => i + 1), 1);
  return P;
}
export function sinyalEkle(P, tur, from = {}) {
  const used = new Set(P.sinyaller.map((s) => s.tag.toUpperCase()));
  const s = { id: P.nextId++, tur, tag: tagOner(from.tag || from.aciklama || { DI: 'Giris', DO: 'Cikis', AI: 'Analog_Giris', AO: 'Analog_Cikis' }[tur], used), aciklama: from.aciklama || '', adres: '', ref: from.ref ?? null };
  P.sinyaller.push(s); return s;
}
export function adimEkle(P, from = {}) {
  const a = { id: P.nextId++, ad: from.ad || 'Adım ' + (P.adimlar.length + 1), cikislar: from.cikislar || [], kosul: from.kosul ?? '', sonraki: null };
  P.adimlar.push(a); return a;
}
// Ürün ağacından G/Ç: sensör → DI, valf → DO (bobin), sürücü → DO etkin + DI hazır + DI arıza, frenli motor → DO fren açma
export function agactanSinyaller(P, items) {
  const var_ = new Set(P.sinyaller.map((s) => s.ref).filter((r) => r != null)), yeni = [];
  for (const it of items) {
    if (var_.has(it.id)) continue;
    const ad = it.ad || '';
    if (it.kind === 'sensor') yeni.push(sinyalEkle(P, 'DI', { tag: ad, aciklama: ad, ref: it.id }));
    else if (it.kind === 'valf') yeni.push(sinyalEkle(P, 'DO', { tag: ad, aciklama: ad + ' bobini', ref: it.id }));
    else if (it.kind === 'surucu') {
      yeni.push(sinyalEkle(P, 'DO', { tag: ad + ' Etkin', aciklama: ad + ': etkinleştir', ref: it.id }));
      yeni.push(sinyalEkle(P, 'DI', { tag: ad + ' Hazir', aciklama: ad + ': hazır', ref: it.id }));
      yeni.push(sinyalEkle(P, 'DI', { tag: ad + ' Ariza', aciklama: ad + ': arıza', ref: it.id }));
    } else if (it.kind === 'motor' && it.deger?.fren === 1) yeni.push(sinyalEkle(P, 'DO', { tag: ad + ' Fren', aciklama: ad + ': fren aç', ref: it.id }));
  }
  return yeni;
}

/* ---------- Denetim ---------- */
const adimNo = (i) => i * 10;
export function plcCheck(P) {
  const k = [], add = (ok, duzey, metin) => k.push({ ok, duzey: ok ? (duzey === 'bilgi' ? 'bilgi' : 'tamam') : duzey, metin });
  const S = P.sinyaller, byId = new Map(S.map((s) => [s.id, s])), byTag = new Map();
  // adlar
  for (const s of S) {
    const h = tagHata(s.tag);
    if (h) add(false, 'hata', `Sinyal "${s.tag || '(adsız)'}": ${h}`);
    const u = s.tag.toUpperCase();
    if (byTag.has(u)) add(false, 'hata', `"${s.tag}" adı birden çok sinyalde (IEC 61131-3'te büyük-küçük harf ayrımı yoktur)`); else byTag.set(u, s);
  }
  // adresler
  const adr = adresAta(S), seen = new Map();
  for (const s of S) {
    if (s.adres && !ADRES_RE[s.tur].test(s.adres)) add(false, 'hata', `"${s.tag}" adresi ${s.adres} geçersiz (${s.tur} için örnek: ${{ DI: '%IX0.0', DO: '%QX0.0', AI: '%IW0', AO: '%QW0' }[s.tur]})`);
    const a = adr.get(s.id);
    if (seen.has(a)) add(false, 'hata', `${a} adresi iki sinyalde: ${seen.get(a)} ve ${s.tag}`); else seen.set(a, s.tag);
  }
  // kart sayısı
  const a = P.ayar, kart = { DI: a.diKart, DO: a.doKart, AI: a.aiKart, AO: a.aoKart }, moduller = {};
  for (const t of Object.keys(SINYAL_TUR)) {
    const n = S.filter((s) => s.tur === t).length, kap = kart[t];
    if (!KART_SEC[t].includes(kap)) { add(false, 'hata', `${SINYAL_TUR[t]} kartı kanal sayısı ${KART_SEC[t].join(' / ')} olmalı`); continue; }
    const gerek = Math.ceil(n * (1 + (fin(a.yedek) && a.yedek > 0 ? a.yedek : 0) / 100));
    moduller[t] = { n, kart: kap, modul: n ? Math.ceil(gerek / kap) : 0, yedek: n ? Math.ceil(gerek / kap) * kap - n : 0 };
    // elle verilen adres kart sınırını aşıyorsa uyar
    const enYuksek = Math.max(-1, ...S.filter((s) => s.tur === t).map((s) => { const m = ADRES_RE[t].exec(adr.get(s.id)); return !m ? -1 : t === 'DI' || t === 'DO' ? Number(m[1]) * 8 + Number(m[2]) : Number(m[1]); }));
    if (n && enYuksek >= moduller[t].modul * kap) add(false, 'uyari', `${SINYAL_TUR[t]}: en yüksek adres ${moduller[t].modul} kartın kapsamı dışında; kart sayısını ya da adresleri kontrol et`);
  }
  // adımlar
  const A = P.adimlar;
  if (!A.length) add(false, 'uyari', 'Henüz adım yok: kod yalnız G/Ç bildirimleriyle üretilir');
  const cozum = new Map();
  A.forEach((st, i) => {
    let c = null;
    try { c = kosulCoz(st.kosul); cozum.set(st.id, c); } catch (e) { add(false, 'hata', `Adım ${adimNo(i)} "${st.ad}": koşul — ${e.message}`); }
    if (c) {
      for (const ad of c.adlar) {
        const s = byTag.get(ad.toUpperCase());
        if (!s) add(false, 'hata', `Adım ${adimNo(i)}: koşuldaki "${ad}" adında sinyal yok`);
        else if (s.tur === 'AI' || s.tur === 'AO') add(false, 'hata', `Adım ${adimNo(i)}: analog sinyal "${ad}" koşulda doğrudan kullanılamaz`);
        else if (s.tag !== ad) add(false, 'uyari', `Adım ${adimNo(i)}: "${ad}" yazımı sinyal adı "${s.tag}" ile aynı değil (IEC'de geçerli, okunabilirlik için düzelt)`);
      }
      if (c.sabitYanlis) add(false, 'hata', `Adım ${adimNo(i)} "${st.ad}": koşul her zaman yanlış — sıra burada kilitlenir`);
      if (c.st === 'TRUE' && !st.cikislar.length) add(false, 'uyari', `Adım ${adimNo(i)} "${st.ad}": koşulsuz geçiş ve çıkış yok (boş adım)`);
    }
    for (const id of st.cikislar) { const s = byId.get(id); if (!s) add(false, 'hata', `Adım ${adimNo(i)}: silinmiş bir çıkışa bağlı`); else if (s.tur !== 'DO') add(false, 'hata', `Adım ${adimNo(i)}: "${s.tag}" dijital çıkış değil`); }
    if (st.sonraki != null && !A.some((x) => x.id === st.sonraki)) add(false, 'hata', `Adım ${adimNo(i)}: sonraki adım silinmiş`);
  });
  if (A.length && A[0].cikislar.length) add(false, 'uyari', 'Başlangıç adımında çıkış açık: enerji verildiğinde bu çıkışlar hemen çalışır');
  // ulaşılabilirlik: başlangıçtan her adıma, her adımdan başlangıca
  if (A.length) {
    const nxt = (i) => { const st = A[i]; const j = st.sonraki != null ? A.findIndex((x) => x.id === st.sonraki) : (i + 1) % A.length; return j < 0 ? (i + 1) % A.length : j; };
    const ul = new Set([0]); let c = 0;
    for (;;) { c = nxt(c); if (ul.has(c)) break; ul.add(c); }
    A.forEach((st, i) => { if (!ul.has(i)) add(false, 'uyari', `Adım ${adimNo(i)} "${st.ad}" başlangıçtan ulaşılamıyor (hiçbir geçiş buraya gelmiyor)`); });
    if (c !== 0) add(false, 'uyari', `Sıra başlangıç adımına geri dönmüyor (adım ${adimNo(c)} döngüsünde kalır)`);
  }
  // kilitler: aynı adımda iki çıkış birlikte açılamaz
  for (const [x, y] of P.kilitler) {
    const sx = byId.get(x), sy = byId.get(y);
    if (!sx || !sy) { add(false, 'hata', 'Kilit listesinde silinmiş bir sinyal var'); continue; }
    const bad = A.map((st, i) => (st.cikislar.includes(x) && st.cikislar.includes(y) ? adimNo(i) : null)).filter((v) => v != null);
    add(!bad.length, 'hata', `Kilit ${sx.tag} ⟂ ${sy.tag}: ` + (bad.length ? 'adım ' + bad.join(', ') + ' ikisini birlikte açıyor' : 'hiçbir adımda birlikte açık değil'));
  }
  // kullanılmayanlar
  const kulDO = new Set(A.flatMap((st) => st.cikislar)), kulDI = new Set([...cozum.values()].flatMap((c) => c.adlar.map((x) => x.toUpperCase())));
  for (const s of S) {
    if (s.tur === 'DO' && A.length && !kulDO.has(s.id)) add(false, 'uyari', `Çıkış "${s.tag}" hiçbir adımda açılmıyor (programda sürekli kapalı)`);
    if (s.tur === 'DI' && A.length && !kulDI.has(s.tag.toUpperCase())) add(true, 'bilgi', `Giriş "${s.tag}" sırada kullanılmıyor`);
  }
  add(true, 'bilgi', 'Acil durdurma ve koruyucu kilitleme bu programa bırakılmaz: güvenlik rölesi ya da güvenlik PLC\'si ile yapılır (6. aşama)');
  return { kontroller: k, adresler: adr, moduller, cozum, uygun: k.every((c) => c.ok || c.duzey !== 'hata') };
}

/* ---------- Kod üretimi ---------- */
const yorum = (s) => String(s ?? '').replace(/\(\*|\*\)/g, '').replace(/[\r\n]+/g, ' ').trim();
// Program gövdesi (ST ve PLCopen XML'de ortak)
function govde(P, ch) {
  const S = P.sinyaller, A = P.adimlar, L = [];
  L.push('(* Adım süresi: adım değişince sıfırlanır, sonra sayar *)');
  L.push('AdimZaman(IN := (Adim = SonAdim), PT := T#24H);', 'SonAdim := Adim;', '');
  if (A.length) {
    L.push('CASE Adim OF');
    A.forEach((st, i) => {
      const j = st.sonraki != null && A.some((x) => x.id === st.sonraki) ? A.findIndex((x) => x.id === st.sonraki) : (i + 1) % A.length;
      L.push(`  ${adimNo(i)}: (* ${yorum(st.ad)} *)`);
      L.push(`    IF ${ch.cozum.get(st.id).st} THEN`, `      Adim := ${adimNo(j)};`, '    END_IF;');
    });
    L.push('ELSE', '  Adim := 0;', 'END_CASE;', '');
  }
  const DO = S.filter((s) => s.tur === 'DO');
  if (DO.length) {
    L.push('(* Çıkışlar: yalnız ilgili adım etkinken açık (GRAFCET "N" eylemi) *)');
    for (const s of DO) {
      const ad = A.map((st, i) => (st.cikislar.includes(s.id) ? `(Adim = ${adimNo(i)})` : null)).filter(Boolean);
      L.push(`${s.tag} := ${ad.length ? ad.join(' OR ') : 'FALSE'};`);
    }
  }
  return L;
}
export function stKod(P, proje = '', tarih = new Date()) {
  const ch = plcCheck(P);
  if (!ch.uygun) throw Object.assign(new Error('Önce hataları düzelt: ' + ch.kontroller.filter((c) => !c.ok && c.duzey === 'hata').map((c) => c.metin).slice(0, 3).join(' · ')), { user: true });
  const S = P.sinyaller, A = P.adimlar, adr = ch.adresler, tip = (t) => (t === 'DI' || t === 'DO' ? 'BOOL' : 'INT');
  const dig = S.filter((s) => s.tur === 'DI' || s.tur === 'DO');
  const L = [];
  L.push(`(* Çizim Atölyesi — Mekatronik Mühendisliği — IEC 61131-3 Yapılandırılmış Metin (ST) iskeleti *)`);
  L.push(`(* Proje: ${yorum(proje) || '-'} · üretildi: ${tarih.toISOString().slice(0, 10)} *)`);
  L.push('(* UYARI: Acil durdurma ve koruyucu kilitleme bu programda değildir; güvenlik rölesi / güvenlik PLC\'si ile yapılır. *)');
  L.push('(* Devreye almadan önce yetkili otomasyon mühendisi tarafından denetlenmeli ve sınanmalıdır. *)', '');
  L.push('PROGRAM Sira_Ana');
  if (dig.length) { L.push('VAR_EXTERNAL'); for (const s of dig) L.push(`  ${s.tag} : BOOL;`); L.push('END_VAR'); }
  L.push('VAR', '  Adim : INT := 0;', '  SonAdim : INT := -1;', '  AdimZaman : TON;', 'END_VAR', '');
  L.push(...govde(P, ch));
  L.push('END_PROGRAM', '');
  L.push('CONFIGURATION Config0', '  RESOURCE Res0 ON PLC');
  if (S.length) { L.push('    VAR_GLOBAL'); for (const s of S) L.push(`      ${s.tag} AT ${adr.get(s.id)} : ${tip(s.tur)};${s.aciklama ? ' (* ' + yorum(s.aciklama) + ' *)' : ''}`); L.push('    END_VAR'); }
  L.push(`    TASK AnaGorev(INTERVAL := T#${Math.max(1, Math.round(P.ayar.cevrim || 10))}MS, PRIORITY := 1);`, '    PROGRAM Sira WITH AnaGorev : Sira_Ana;', '  END_RESOURCE', 'END_CONFIGURATION', '');
  return L.join('\r\n');
}
const xe = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// PLCopen TC6 XML v2.01: program gövdesi ST, G/Ç kaynak (resource) genel değişkenleri olarak
export function plcopenXml(P, proje = '', tarih = new Date()) {
  stKod(P, proje, tarih);   // denetimden geçer (hata varsa durur)
  const ch = plcCheck(P), kod = govde(P, ch).join('\n');
  const S = P.sinyaller, adr = ch.adresler, dig = S.filter((s) => s.tur === 'DI' || s.tur === 'DO');
  const dt = tarih.toISOString().replace(/\.\d+Z$/, '');
  const v = (s, adres) => `<variable name="${xe(s.tag)}"${adres ? ` address="${xe(adres)}"` : ''}><type>${s.tur === 'DI' || s.tur === 'DO' ? '<BOOL/>' : '<INT/>'}</type>${s.aciklama && adres ? `<documentation><xhtml:p>${xe(yorum(s.aciklama))}</xhtml:p></documentation>` : ''}</variable>`;
  const X = [];
  X.push('<?xml version="1.0" encoding="utf-8"?>');
  X.push('<project xmlns="http://www.plcopen.org/xml/tc6_0201" xmlns:xhtml="http://www.w3.org/1999/xhtml">');
  X.push(`  <fileHeader companyName="Çizim Atölyesi" productName="Çizim Atölyesi Mekatronik" productVersion="5" creationDateTime="${dt}"/>`);
  X.push(`  <contentHeader name="${xe(proje || 'proje')}" modificationDateTime="${dt}"><coordinateInfo><fbd><scaling x="1" y="1"/></fbd><ld><scaling x="1" y="1"/></ld><sfc><scaling x="1" y="1"/></sfc></coordinateInfo></contentHeader>`);
  X.push('  <types><dataTypes/><pous>');
  X.push('    <pou name="Sira_Ana" pouType="program"><interface>');
  if (dig.length) X.push('      <externalVars>' + dig.map((s) => v(s)).join('') + '</externalVars>');
  X.push('      <localVars><variable name="Adim"><type><INT/></type><initialValue><simpleValue value="0"/></initialValue></variable><variable name="SonAdim"><type><INT/></type><initialValue><simpleValue value="-1"/></initialValue></variable><variable name="AdimZaman"><type><derived name="TON"/></type></variable></localVars>');
  X.push('    </interface><body><ST><xhtml:p><![CDATA[' + kod.replace(/]]>/g, ']]]]><![CDATA[>') + ']]></xhtml:p></ST></body></pou>');
  X.push('  </pous></types>');
  X.push('  <instances><configurations><configuration name="Config0"><resource name="Res0">');
  X.push(`    <task name="AnaGorev" interval="T#${Math.max(1, Math.round(P.ayar.cevrim || 10))}MS" priority="1"><pouInstance name="Sira" typeName="Sira_Ana"/></task>`);
  if (S.length) X.push('    <globalVars>' + S.map((s) => v(s, adr.get(s.id))).join('') + '</globalVars>');
  X.push('  </resource></configuration></configurations></instances>');
  X.push('</project>', '');
  return X.join('\n');
}

/* ---------- Listeler, şema, rapor ---------- */
export function gcListesi(P) {
  const adr = adresAta(P.sinyaller), sira = { DI: 0, DO: 1, AI: 2, AO: 3 };
  return P.sinyaller.map((s) => ({ tag: s.tag, tur: s.tur, turAd: SINYAL_TUR[s.tur], adres: adr.get(s.id), tip: s.tur === 'DI' || s.tur === 'DO' ? 'BOOL' : 'INT', aciklama: s.aciklama, elle: !!s.adres }))
    .sort((a, b) => sira[a.tur] - sira[b.tur] || a.adres.localeCompare(b.adres, 'en', { numeric: true }));
}
const csvq = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function gcCSV(rows) {
  return '\ufeff' + [['Sinyal', 'Tür', 'Adres', 'Veri tipi', 'Açıklama', 'Adres kaynağı'].join(';'), ...rows.map((r) => [r.tag, r.turAd, r.adres, r.tip, r.aciklama, r.elle ? 'elle' : 'otomatik'].map(csvq).join(';'))].join('\r\n');
}
// Adım şeması (GRAFCET benzeri): çizim ilkelleri mm, y aşağı
export function adimSemasi(P) {
  const A = P.adimlar, byId = new Map(P.sinyaller.map((s) => [s.id, s])), prims = [];
  const L = (x1, y1, x2, y2) => prims.push({ t: 'l', x1, y1, x2, y2 }), R = (x, y, w, h) => prims.push({ t: 'r', x, y, w, h }), T = (x, y, size, str, center = false) => prims.push({ t: 's', x, y, size, str: String(str), center });
  const kisa = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const dy = 26, x = 20;
  A.forEach((st, i) => {
    const y = 6 + i * dy;
    R(x - 7, y, 14, 10); if (i === 0) R(x - 6, y + 1, 12, 8);   // başlangıç adımı çift çerçeve
    T(x, y + 6.5, 3, adimNo(i), true);
    const cik = st.cikislar.map((id) => byId.get(id)?.tag).filter(Boolean);
    if (cik.length) { L(x + 7, y + 5, x + 12, y + 5); R(x + 12, y + 1, 70, 8); T(x + 14, y + 6.3, 2.4, kisa(cik.join(', '), 48)); }
    T(x + 9, y - 1, 2.2, kisa(st.ad, 40));
    L(x, y + 10, x, y + dy);
    L(x - 4, y + 17, x + 4, y + 17); T(x + 6, y + 18, 2.3, kisa(st.kosul || '—', 56));
  });
  if (A.length) {   // son adımdan başlangıca dönüş
    const yb = 6 + A.length * dy;
    const n0 = prims.length;
    L(x, yb, x, yb + 2); L(x, yb + 2, x - 12, yb + 2); L(x - 12, yb + 2, x - 12, 2); L(x - 12, 2, x, 2); L(x, 2, x, 6);
    for (let i = n0; i < prims.length; i++) prims[i].donus = true;
    T(x - 11, yb + 6, 2.2, 'Adım ' + adimNo(A.length - 1) + ' → ' + adimNo(0) + ' (ayrı "sonraki" seçimi olan adımlar koda göre atlar)');
  }
  return { w: 110, h: 14 + A.length * dy, prims };
}
export function plcRapor(P, proje = '') {
  const ch = plcCheck(P), L = ['ÇİZİM ATÖLYESİ — MEKATRONİK MÜHENDİSLİĞİ KONTROL (PLC) RAPORU', 'IEC 61131-3 · GRAFCET (IEC 60848)' + (proje ? ' · ' + proje : ''), 'Sonuç: ' + (ch.uygun ? 'UYGUN (hata yok)' : 'UYGUN DEĞİL — aşağıdaki hatalara bak'), ''];
  L.push('G/Ç ÖZETİ');
  for (const [t, m] of Object.entries(ch.moduller)) if (m.n) L.push(`  ${SINYAL_TUR[t]}: ${m.n} sinyal · ${m.kart} kanallı kart × ${m.modul} · boş kanal ${m.yedek} (istenen yedek %${P.ayar.yedek})`);
  L.push('', 'G/Ç LİSTESİ');
  for (const r of gcListesi(P)) L.push(`  ${r.adres}  ${r.tag} : ${r.tip}  ${r.aciklama ? '— ' + r.aciklama : ''}${r.elle ? ' (elle adres)' : ''}`);
  L.push('', 'ADIMLAR (SIRA)');
  const byId = new Map(P.sinyaller.map((s) => [s.id, s]));
  P.adimlar.forEach((st, i) => {
    const j = st.sonraki != null && P.adimlar.some((x) => x.id === st.sonraki) ? P.adimlar.findIndex((x) => x.id === st.sonraki) : (i + 1) % P.adimlar.length;
    L.push(`  Adım ${adimNo(i)}${i === 0 ? ' (başlangıç)' : ''}: ${st.ad}`, `     açık çıkışlar: ${st.cikislar.map((id) => byId.get(id)?.tag || '?').join(', ') || '—'}`, `     geçiş koşulu: ${st.kosul || '—'}  → adım ${adimNo(j)}`);
  });
  if (P.kilitler.length) { L.push('', 'KİLİTLER (birlikte açılamaz)'); for (const [x, y] of P.kilitler) L.push(`  ${byId.get(x)?.tag || '?'} ⟂ ${byId.get(y)?.tag || '?'}`); }
  L.push('', 'DENETİMLER');
  for (const c of ch.kontroller) L.push('  ' + (c.ok ? (c.duzey === 'bilgi' ? 'ℹ' : '✓') : c.duzey === 'hata' ? '✗ HATA' : '⚠ UYARI') + ' ' + c.metin);
  L.push('', 'KAYNAKLAR', '  [IEC 61131-3] Programlanabilir denetleyiciler — programlama dilleri (tanımlayıcılar, adresleme, ST, yapılandırma)', '  [IEC 60848] GRAFCET sıralı işlev şeması dili', '  [PLCopen TC6] XML değişim biçimi v2.01');
  L.push('', 'Bu rapor ve üretilen kod iskelettir. Adresler PLC üreticisine göre değişebilir; analog kanalların ölçeklemesi, arıza / el modu ve yeniden başlatma davranışı kullanıcı tarafından eklenmelidir. Devreye almadan önce yetkili otomasyon mühendisi denetler ve sınar.');
  return L;
}

// Örnek (temsilî): pnömatik itici ile dolum istasyonu
export function plcOrnek() {
  const P = plcEmpty();
  const s = (tur, tag, aciklama) => sinyalEkle(P, tur, { tag, aciklama });
  s('DI', 'S1_Baslat', 'Başlat butonu');
  s('DI', 'B1_Parca_Var', 'Parça var sensörü');
  s('DI', 'B2_Silindir_Geri', 'Silindir geri konum sensörü');
  s('DI', 'B3_Silindir_Ileri', 'Silindir ileri konum sensörü');
  const y1 = s('DO', 'Y1_Silindir_Ileri', 'Silindir ileri valf bobini');
  const y2 = s('DO', 'Y2_Silindir_Geri', 'Silindir geri valf bobini');
  const m1 = s('DO', 'K1_Konveyor', 'Konveyör kontaktörü');
  adimEkle(P, { ad: 'Bekle', kosul: 'S1_Baslat AND B1_Parca_Var AND B2_Silindir_Geri' });
  adimEkle(P, { ad: 'Parçayı it', cikislar: [y1.id], kosul: 'B3_Silindir_Ileri' });
  adimEkle(P, { ad: 'Dolum süresi', kosul: 'T>=2s' });
  adimEkle(P, { ad: 'Silindir geri', cikislar: [y2.id], kosul: 'B2_Silindir_Geri' });
  adimEkle(P, { ad: 'Parçayı taşı', cikislar: [m1.id], kosul: 'NOT B1_Parca_Var AND T>=1s' });
  P.kilitler.push([y1.id, y2.id]);
  return P;
}
