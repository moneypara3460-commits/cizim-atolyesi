// Mekatronik Mühendisliği — 4. aşama: makine elektrik donanımı ön tasarımı.
// Yük listesi, devre akımı, koruma (minyatür devre kesici) seçimi, kablo kesiti (akım taşıma kapasitesi + gerilim düşümü
// + TN sisteminde otomatik kesme için çevrim empedansı), 24 V DC güç kaynağı, ana besleme, kablo listesi, klemens planı,
// tek hat şeması. Saf fonksiyonlar; DOM gerektirmez (tests/meka-elek.test.mjs).
//
// Kaynaklar (tablo değerleri iki ayrı kaynakla karşılaştırılarak alındı; uydurma değer yok):
//   [IEC 60204-1]   Tablo 6: PVC yalıtımlı bakır iletken, 40 °C ortam, sürekli işletme, kurulum yöntemi B1 / B2 / C / E akım
//                   taşıma kapasitesi Iz (0,75–50 mm²). Ek D: ortam sıcaklığı düzeltme ve gruplama (demet) katsayıları.
//                   12.5: kaynaktan yüke gerilim düşümü anma geriliminin %5'ini aşmamalı. Tablo 5: makine dışında sabit
//                   güç devresinde çok damarlı kablo en az 0,75 mm². (ABB "Kabel- und Leitungsdimensionierung", 2CDC400027D0104,
//                   DIN EN 60204-1 tablosu ve Kollmorgen akım taşıma tablosu ile karşılaştırıldı.)
//   [IEC 60364-4-43] Aşırı yük koruması: Ib ≤ In ≤ Iz ve I2 ≤ 1,45·Iz (IEC 60898-1 devre kesicide I2 = 1,45·In → kendiliğinden sağlanır).
//   [IEC 60898-1]   Devre kesici ani açma bölgesi üst sınırı: B 5·In, C 10·In, D 20·In.
//   [IEC 60364-4-41] TN sisteminde otomatik kesme: Zs · Ia ≤ U0.
//   [IEC 60364-5-54] Koruma iletkeni kesiti: S ≤ 16 → S; 16 < S ≤ 35 → 16; S > 35 → S/2.
//   [IEC 60228]     Bakır özdirenci 20 °C'de 1/58 Ω·mm²/m; sıcaklık katsayısı 0,00393 1/K; PVC iletken sıcaklığı 70 °C.

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const SQ3 = Math.sqrt(3);
const tf = (v, d = 2) => v.toFixed(d).replace('.', ',');   // metinde Türkçe ondalık

// [S mm², B1, B2, C, E] — A
export const IZ_TABLO = [
  [0.75, 8.6, 8.5, 9.8, 10.4], [1, 10.3, 10.1, 11.7, 12.4], [1.5, 13.5, 13.1, 15.2, 16.1], [2.5, 18.3, 17.4, 21, 22],
  [4, 24, 23, 28, 30], [6, 31, 30, 36, 37], [10, 44, 40, 50, 52], [16, 59, 54, 66, 70], [25, 77, 70, 84, 88],
  [35, 96, 86, 104, 110], [50, 117, 103, 125, 133],
];
export const YONTEMLER = { B1: 'B1 — tek damarlı iletkenler kanal / boru içinde', B2: 'B2 — çok damarlı kablo kanal / boru içinde', C: 'C — çok damarlı kablo duvar / yüzey üzerinde', E: 'E — çok damarlı kablo açık kablo tavasında' };
const YI = { B1: 1, B2: 2, C: 3, E: 4 };
// Ortam sıcaklığı (°C) → katsayı (40 °C taban)
export const KT_TABLO = [[30, 1.15], [35, 1.08], [40, 1], [45, 0.91], [50, 0.82], [55, 0.71], [60, 0.58]];
// Aynı güzergâhta demet hâlinde devre sayısı → katsayı
export const KG_TABLO = [[1, 1], [2, 0.8], [3, 0.7], [4, 0.65], [5, 0.6], [6, 0.57], [8, 0.52], [10, 0.48], [12, 0.45], [14, 0.43]];
// Yaygın devre kesici anma akımları (A) — üretici serisinde olduğunu katalogdan doğrula
export const MCB_SERI = [1, 2, 3, 4, 6, 8, 10, 13, 16, 20, 25, 32, 40, 50, 63];
export const EGRI = { B: 5, C: 10, D: 20 };
export const RHO20 = 1 / 58, ALFA_CU = 0.00393, T_ILETKEN = 70;
export const TURLER = { ac3: '3 faz AC', ac1: '1 faz AC', dc: '24 V DC' };

export const ELEK_DEFAULTS = {
  U3: 400, U1: 230, Udc: 24, Ze: 0.3,             // şebeke: faz arası, faz-nötr, DC; kaynak tarafı çevrim empedansı Ze (Ω, şebeke / trafo verisinden)
  T: 40, yontem: 'C', grup: 1, kGelle: 0,         // kurulum: ortam °C, yöntem, demetteki devre sayısı, elle gruplama katsayısı (0 = tablodan)
  dUmax: 5, Smin: 0.75, ks: 1,                    // gerilim düşümü sınırı %, en küçük kesit mm², eşzamanlılık katsayısı
  psuIn: 0, psuPay: 1.25, psuEta: 0.9, psuLam: 0.95, psuL: 2, psuEgri: 'C',   // 24 V güç kaynağı (katalog): anma akımı (0 = öner), pay, verim, güç katsayısı
  Lana: 10, anaEgri: 'C',                         // ana besleme kablosu boyu m
};
export const YUK_DEFAULT = { ad: 'Yük', tur: 'ac3', giris: 'P', I: NaN, P: NaN, cos: 0.85, eta: 1, L: 10, egri: 'C', In: 0, S: 0, ref: null };

function rec() {
  const steps = [], checks = [];
  return {
    steps, checks,
    s(ad, formul, deger, birim, kaynak) { steps.push({ ad, formul, deger, birim, kaynak }); return deger; },
    c(ok, duzey, metin) { checks.push({ ok, duzey: duzey === 'bilgi' ? 'bilgi' : ok ? 'tamam' : duzey, metin }); return ok; },
  };
}
const uerr = (m) => Object.assign(new Error(m), { user: true });

export function kT(T) {
  if (!fin(T)) throw uerr('Ortam sıcaklığı geçersiz');
  if (T > 60) throw uerr('Ortam sıcaklığı 60 °C üstünde: IEC 60204-1 Ek D tablosu dışında; kablo üreticisinin değerini kullan');
  return (KT_TABLO.find(([t]) => t >= T) || KT_TABLO[0])[1];   // ara değerde bir üst sıcaklık (güvenli taraf)
}
export function kG(n, elle = 0) {
  if (fin(elle) && elle > 0) { if (elle > 1) throw uerr('Gruplama katsayısı 1\'den büyük olamaz'); return elle; }
  if (!fin(n) || n < 1) throw uerr('Demetteki devre sayısı en az 1 olmalı');
  const r = KG_TABLO.find(([k]) => k >= Math.ceil(n));   // ara değerde bir üst devre sayısı (güvenli taraf)
  if (!r) throw uerr('14\'ten fazla devre bir arada: tablo dışı, gruplama katsayısını kablo üreticisinden alıp elle gir');
  return r[1];
}
export const rho70 = () => RHO20 * (1 + ALFA_CU * (T_ILETKEN - 20));
export const peKesit = (S) => (S <= 16 ? S : S <= 35 ? 16 : S / 2);
export const yukGerilim = (tur, g) => (tur === 'ac3' ? g.U3 : tur === 'ac1' ? g.U1 : g.Udc);

// Bir devre: akım → koruma → kesit (akım taşıma, gerilim düşümü, çevrim empedansı)
export function circuit(c0, g0 = ELEK_DEFAULTS) {
  const c = { ...YUK_DEFAULT, ...c0 }, g = { ...ELEK_DEFAULTS, ...g0 };
  if (!TURLER[c.tur]) throw uerr('Bilinmeyen besleme türü');
  if (!YI[g.yontem]) throw uerr('Bilinmeyen kurulum yöntemi');
  if (!EGRI[c.egri]) throw uerr('Bilinmeyen açma eğrisi');
  const U = yukGerilim(c.tur, g);
  for (const [k, v] of [['Gerilim', U], ['Kablo boyu', c.L], ['Gerilim düşümü sınırı', g.dUmax], ['En küçük kesit', g.Smin]]) if (!fin(v) || v <= 0) throw uerr(k + ' sıfırdan büyük olmalı');
  if (c.tur !== 'dc' && !(fin(g.Ze) && g.Ze >= 0)) throw uerr('Kaynak empedansı Ze geçersiz');
  const R = rec();
  // 1) İşletme akımı
  let Ib;
  if (c.giris === 'I') {
    if (!(fin(c.I) && c.I > 0)) throw uerr(c.ad + ': akım girilmedi (katalogdaki şebeke / giriş akımı)');
    Ib = R.s('İşletme akımı Ib', 'katalogdaki giriş akımı', c.I, 'A', 'Katalog');
  } else {
    if (!(fin(c.P) && c.P > 0)) throw uerr(c.ad + ': güç girilmedi');
    const eta = fin(c.eta) && c.eta > 0 && c.eta <= 1 ? c.eta : NaN;
    if (!fin(eta)) throw uerr(c.ad + ': verim 0 ile 1 arasında olmalı');
    if (c.tur === 'dc') Ib = R.s('İşletme akımı Ib', 'Ib = P / (U·η)', c.P / (U * eta), 'A', 'Elektrik');
    else {
      if (!(fin(c.cos) && c.cos > 0 && c.cos <= 1)) throw uerr(c.ad + ': güç katsayısı cos φ 0 ile 1 arasında olmalı');
      Ib = c.tur === 'ac3'
        ? R.s('İşletme akımı Ib', 'Ib = P / (√3·U·cos φ·η)', c.P / (SQ3 * U * c.cos * eta), 'A', 'Elektrik')
        : R.s('İşletme akımı Ib', 'Ib = P / (U·cos φ·η)', c.P / (U * c.cos * eta), 'A', 'Elektrik');
    }
  }
  // 2) Koruma
  let In;
  if (fin(c.In) && c.In > 0) In = R.s('Koruma anma akımı In', 'kullanıcı seçimi', c.In, 'A', 'IEC 60364-4-43');
  else {
    const x = MCB_SERI.find((v) => v >= Ib);
    if (!x) throw uerr(c.ad + ': akım ' + tf(Ib, 1) + ' A, 63 A üstü devre bu ön tasarım aracının kapsamı dışında');
    In = R.s('Koruma anma akımı In', 'Ib\'den büyük en küçük seri değer', x, 'A', 'IEC 60364-4-43');
  }
  R.c(In >= Ib, 'hata', `Koruma akımı In = ${In} A ≥ işletme akımı Ib = ${tf(Ib, 2)} A`);
  // 3) Katsayılar
  const kt = R.s('Ortam sıcaklığı katsayısı kT', 'IEC 60204-1 Ek D, ' + g.T + ' °C', kT(g.T), '', 'IEC 60204-1');
  const kg = R.s('Gruplama katsayısı kG', g.kGelle > 0 ? 'elle girildi' : 'IEC 60204-1 Ek D, ' + g.grup + ' devre demet', kG(g.grup, g.kGelle), '', 'IEC 60204-1');
  const r70 = rho70(), U0 = c.tur === 'ac3' ? g.U3 / SQ3 : g.U1, Ia = EGRI[c.egri] * In;
  const dene = (row) => {
    const S = row[0], Iz = row[YI[g.yontem]], Izd = Iz * kt * kg, Rp = r70 / S;
    const dU = c.tur === 'ac3' ? SQ3 * Ib * c.L * Rp * c.cos : 2 * Ib * c.L * Rp * (c.tur === 'ac1' ? c.cos : 1);
    const Spe = peKesit(S), Zs = c.tur === 'dc' ? null : g.Ze + c.L * (r70 / S + r70 / Spe);
    return { S, Iz, Izd, Rp, dU, dUp: (dU / U) * 100, Spe, Zs, okI: In <= Izd, okU: (dU / U) * 100 <= g.dUmax, okZ: c.tur === 'dc' || Zs * Ia <= U0, okS: S >= g.Smin };
  };
  let row;
  if (fin(c.S) && c.S > 0) {
    row = IZ_TABLO.find((r) => r[0] === c.S);
    if (!row) throw uerr(c.ad + ': ' + c.S + ' mm² tabloda yok (0,75–50 mm² standart kesitler)');
  } else {
    row = IZ_TABLO.find((r) => { const t = dene(r); return t.okI && t.okU && t.okZ && t.okS; });
    if (!row) throw uerr(c.ad + ': 50 mm²\'ye kadar uygun kesit bulunamadı — kabloyu kısalt, kurulum yöntemini ya da korumayı değiştir');
  }
  const t = dene(row);
  R.s('Kesit S', c.S > 0 ? 'kullanıcı seçimi' : 'tüm koşulları sağlayan en küçük kesit', t.S, 'mm²', 'IEC 60204-1');
  R.s('Tablo akım taşıma kapasitesi Iz', 'IEC 60204-1 Tablo 6, yöntem ' + g.yontem, t.Iz, 'A', 'IEC 60204-1');
  R.s('Düzeltilmiş kapasite Iz\'', "Iz' = Iz·kT·kG", t.Izd, 'A', 'IEC 60204-1');
  R.c(t.okI, 'hata', `Aşırı yük koruması In ≤ Iz': ${In} ≤ ${tf(t.Izd, 2)} A (IEC 60898-1 kesicide I2 = 1,45·In ≤ 1,45·Iz')`);
  R.c(t.okS, 'hata', `Kesit ${t.S} mm² ≥ en küçük kesit ${g.Smin} mm²`);
  R.s('Bakır özdirenci (70 °C)', 'ρ70 = ρ20·(1 + α·50)', r70, 'Ω·mm²/m', 'IEC 60228');
  R.s('Gerilim düşümü ΔU', c.tur === 'ac3' ? 'ΔU = √3·Ib·L·ρ70/S·cos φ' : c.tur === 'ac1' ? 'ΔU = 2·Ib·L·ρ70/S·cos φ' : 'ΔU = 2·Ib·L·ρ70/S', t.dU, 'V', 'Elektrik');
  R.s('Gerilim düşümü oranı', 'ΔU / U·100', t.dUp, '%', 'IEC 60204-1');
  R.c(t.okU, 'hata', `Gerilim düşümü %${tf(t.dUp, 2)} ≤ %${String(g.dUmax).replace('.', ',')} (IEC 60204-1 12.5)`);
  if (c.tur !== 'dc') {
    R.s('Koruma iletkeni kesiti', 'IEC 60364-5-54', t.Spe, 'mm²', 'IEC 60364-5-54');
    R.s('Çevrim empedansı Zs', 'Zs = Ze + L·ρ70·(1/S + 1/Spe)', t.Zs, 'Ω', 'IEC 60364-4-41');
    R.s('Ani açma akımı Ia', `Ia = ${EGRI[c.egri]}·In (${c.egri} eğrisi üst sınırı)`, Ia, 'A', 'IEC 60898-1');
    R.c(t.okZ, 'hata', `Otomatik kesme: Zs·Ia = ${tf(t.Zs * Ia, 1)} V ≤ U0 = ${tf(U0, 0)} V`);
  } else R.c(true, 'bilgi', 'DC devre güç kaynağının akım sınırı ve devre koruması ile korunur; SELV / PELV koşulları için güç kaynağı kataloğunu kontrol et');
  if (c.L > 0 && t.dUp > g.dUmax * 0.8 && t.okU) R.c(false, 'uyari', 'Gerilim düşümü sınıra yakın (%80 üstü)');
  const kontroller = R.checks;
  return { tur: 'devre', giris: c, sonuc: { U, Ib, In, Ia, kt, kg, ...t, U0 }, adimlar: R.steps, kontroller, uygun: kontroller.every((k) => k.ok || k.duzey !== 'hata') };
}

// Tüm sistem: DC yükler → 24 V güç kaynağı → AC devreler (güç kaynağı dahil) → faz dengesi → ana besleme
export function elekSystem(E) {
  const g = { ...ELEK_DEFAULTS, ...(E?.ayar || {}) }, yukler = Array.isArray(E?.yukler) ? E.yukler : [];
  const out = { ayar: g, devreler: [], hatalar: [], dc: null, ana: null, fazlar: [0, 0, 0], kontroller: [] };
  const ks = fin(g.ks) && g.ks > 0 && g.ks <= 1 ? g.ks : 1;
  let no = 0;
  const ekle = (c, ozel) => {
    no++;
    const d = { no, F: '-F' + no, W: '-W' + no, c: { ...YUK_DEFAULT, ...c }, ozel: ozel || null };
    try { d.r = circuit(d.c, g); } catch (e) { d.hata = e.message; out.hatalar.push(e.message); }
    out.devreler.push(d); return d;
  };
  const dcYuk = yukler.filter((c) => c.tur === 'dc'), acYuk = yukler.filter((c) => c.tur !== 'dc');
  // 24 V DC
  if (dcYuk.length) {
    const ds = dcYuk.map((c) => ekle(c));
    const top = ds.reduce((a, d) => a + (d.r ? d.r.sonuc.Ib : 0), 0) * ks, gerek = top * (fin(g.psuPay) && g.psuPay >= 1 ? g.psuPay : 1);
    const Inom = fin(g.psuIn) && g.psuIn > 0 ? g.psuIn : gerek;
    const kon = [];
    if (fin(g.psuIn) && g.psuIn > 0) kon.push({ ok: g.psuIn >= gerek, duzey: g.psuIn >= gerek ? 'tamam' : 'hata', metin: `24 V güç kaynağı ${String(g.psuIn).replace(".", ",")} A ≥ gereken ${tf(gerek, 2)} A (toplam ${tf(top, 2)} A × pay ${String(g.psuPay).replace(".", ",")})` });
    else kon.push({ ok: false, duzey: 'uyari', metin: `Güç kaynağı anma akımı girilmedi: en az ${tf(gerek, 2)} A'lik bir model seçip katalog değerini gir` });
    const eta = fin(g.psuEta) && g.psuEta > 0 && g.psuEta <= 1 ? g.psuEta : 0.9, lam = fin(g.psuLam) && g.psuLam > 0 && g.psuLam <= 1 ? g.psuLam : 0.95;
    const Iin = (g.Udc * Inom) / (eta * g.U1 * lam);
    const ps = ekle({ ad: '-G1 24 V güç kaynağı (giriş)', tur: 'ac1', giris: 'I', I: Iin, cos: lam, eta: 1, L: g.psuL, egri: g.psuEgri }, 'psu');
    out.dc = { toplam: top, gerek, Inom, Iin, eta, lam, kontroller: kon, devre: ps.no };
    out.kontroller.push(...kon);
  }
  acYuk.forEach((c) => ekle(c));
  // Faz dağılımı: 3 faz her faza, 1 faz yükler sırayla L1, L2, L3 (en az yüklü faza)
  for (const d of out.devreler) {
    if (!d.r || d.c.tur === 'dc') continue;
    const I = d.r.sonuc.Ib;
    if (d.c.tur === 'ac3') { for (let k = 0; k < 3; k++) out.fazlar[k] += I; d.faz = 'L1 L2 L3'; }
    else { const k = out.fazlar.indexOf(Math.min(...out.fazlar)); out.fazlar[k] += I; d.faz = 'L' + (k + 1); }
  }
  const Imax = Math.max(...out.fazlar) * ks;
  if (Imax > 0) {
    const notr = out.devreler.some((d) => d.c.tur === 'ac1');
    try {
      out.ana = circuit({ ad: 'Ana besleme', tur: 'ac3', giris: 'I', I: Imax, cos: 1, L: g.Lana, egri: g.anaEgri }, g);
      out.ana.notr = notr;
      const fz = out.fazlar.map((v) => v * ks), ort = (fz[0] + fz[1] + fz[2]) / 3;
      out.dengesizlik = ort > 0 ? ((Math.max(...fz) - ort) / ort) * 100 : 0;
      if (out.dengesizlik > 10) out.kontroller.push({ ok: false, duzey: 'uyari', metin: `Faz yükleri dengesiz (%${tf(out.dengesizlik, 0)}): 1 faz yükleri fazlara yeniden dağıtılabilir` });
    } catch (e) { out.hatalar.push('Ana besleme: ' + e.message); }
  }
  out.uygun = !out.hatalar.length && out.devreler.every((d) => d.r && d.r.uygun) && (!out.ana || out.ana.uygun) && out.kontroller.every((k) => k.ok || k.duzey !== 'hata');
  return out;
}

const kesitYaz = (S) => String(S).replace('.', ',');
const DAMAR = { ac3: ['L1', 'L2', 'L3', 'PE'], ac1: ['L', 'N', 'PE'], dc: ['+24V', '0V'] };
export function kabloTip(tur, S, notr = false) {
  const d = tur === 'ac3' && notr ? 5 : DAMAR[tur].length;
  return tur === 'dc' ? `${d}x${kesitYaz(S)}` : `${d}G${kesitYaz(S)}`;
}
// Kablo listesi
export function kabloListesi(sys) {
  const rows = [];
  if (sys.ana) rows.push({ kablo: '-W0', hedef: 'Şebeke → -Q1 ana şalter', tip: kabloTip('ac3', sys.ana.sonuc.S, sys.ana.notr), S: sys.ana.sonuc.S, L: sys.ana.giris.L, koruma: 'ana ' + sys.ana.giris.egri + sys.ana.sonuc.In, Ib: sys.ana.sonuc.Ib, dUp: sys.ana.sonuc.dUp });
  for (const d of sys.devreler) if (d.r) rows.push({ kablo: d.W, hedef: d.c.ad, tip: kabloTip(d.c.tur, d.r.sonuc.S), S: d.r.sonuc.S, L: d.c.L, koruma: d.F + ' ' + d.c.egri + d.r.sonuc.In, Ib: d.r.sonuc.Ib, dUp: d.r.sonuc.dUp });
  return rows;
}
// Klemens planı: -X1 AC güç, -X2 24 V DC. Güç kaynağı panoda olduğundan dış klemense çıkmaz.
export function klemensPlani(sys) {
  const rows = [], n = { X1: 0, X2: 0 };
  for (const d of sys.devreler) {
    if (!d.r || d.ozel === 'psu') continue;
    const blok = d.c.tur === 'dc' ? 'X2' : 'X1';
    for (const dm of DAMAR[d.c.tur]) rows.push({ klemens: '-' + blok + ':' + ++n[blok], potansiyel: dm === 'PE' ? 'PE' : d.c.tur === 'dc' ? dm : dm === 'N' ? 'N' : d.c.tur === 'ac1' ? d.faz : dm, kaynak: dm === 'PE' ? 'PE bara' : d.c.tur === 'dc' ? (dm === '0V' ? '-G1 0V' : d.F) : dm === 'N' ? 'N bara' : d.F, kablo: d.W, damar: dm, hedef: d.c.ad, S: d.r.sonuc.S });
  }
  return rows;
}
const csvq = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const nTR = (v, d = 2) => (fin(v) ? v.toFixed(d).replace('.', ',') : '');
export function kabloCSV(rows) {
  return '\ufeff' + [['Kablo', 'Hedef', 'Kablo tipi', 'Kesit (mm²)', 'Boy (m)', 'Koruma', 'Akım Ib (A)', 'Gerilim düşümü (%)'].join(';'), ...rows.map((r) => [r.kablo, r.hedef, r.tip, kesitYaz(r.S), nTR(r.L, 1), r.koruma, nTR(r.Ib), nTR(r.dUp)].map(csvq).join(';'))].join('\r\n');
}
export function klemensCSV(rows) {
  return '\ufeff' + [['Klemens', 'Potansiyel', 'Kaynak', 'Kablo', 'Damar', 'Hedef', 'Kesit (mm²)'].join(';'), ...rows.map((r) => [r.klemens, r.potansiyel, r.kaynak, r.kablo, r.damar, r.hedef, kesitYaz(r.S)].map(csvq).join(';'))].join('\r\n');
}

// Tek hat şeması: çizim ilkelleri (mm, y aşağı). { t:'l', x1,y1,x2,y2 } | { t:'r', x,y,w,h } | { t:'s', x,y,size,str,center }
export function tekHat(sys) {
  const P = [], L = (x1, y1, x2, y2) => P.push({ t: 'l', x1, y1, x2, y2 }), Rc = (x, y, w, h) => P.push({ t: 'r', x, y, w, h }), S = (x, y, size, str, center = true) => P.push({ t: 's', x, y, size, str: String(str), center });
  const kisa = (s, n = 16) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  const ac = sys.devreler.filter((d) => d.r && d.c.tur !== 'dc'), dc = sys.devreler.filter((d) => d.r && d.c.tur === 'dc');
  const dx = 34, x0 = 30, W = Math.max(x0 + Math.max(ac.length, dc.length, 1) * dx + 10, 120);
  const g = sys.ayar;
  // Şebeke ve ana şalter
  S(12, 8, 3, `${g.U3} V 3~ ${sys.ana?.notr ? '+N ' : ''}+PE`, false);
  L(18, 11, 18, 18); Rc(13, 18, 10, 8); S(18, 23, 2.6, '-Q1'); S(26, 23, 2.4, sys.ana ? 'ana ' + sys.ana.giris.egri + sys.ana.sonuc.In + ' A' : '', false);
  if (sys.ana) S(26, 15, 2.2, '-W0 ' + kabloTip('ac3', sys.ana.sonuc.S, sys.ana.notr), false);
  L(18, 26, 18, 32); L(18, 32, W - 6, 32);   // AC bara
  ac.forEach((d, i) => {
    const x = x0 + i * dx + dx / 2;
    L(x, 32, x, 38); Rc(x - 5, 38, 10, 8); S(x, 43, 2.6, d.F); S(x + 6, 42, 2.3, d.c.egri + d.r.sonuc.In + ' A', false);
    L(x, 46, x, 62); S(x + 1, 56, 2.1, d.W, false); S(x + 1, 59, 2.1, kabloTip(d.c.tur, d.r.sonuc.S), false);
    Rc(x - 15, 62, 30, 12); S(x, 67, 2.4, kisa(d.c.ad)); S(x, 71.5, 2.2, (d.faz || '') + ' · ' + tf(d.r.sonuc.Ib, 2) + ' A');
  });
  if (dc.length) {
    const psu = sys.devreler.find((d) => d.ozel === 'psu');
    const px = psu ? x0 + ac.indexOf(psu) * dx + dx / 2 : x0;
    L(px, 74, px, 84); S(px + 2, 80, 2.3, '+24 V', false); L(18, 84, W - 6, 84);   // DC bara
    S(12, 82, 2.6, 'DC', false);
    dc.forEach((d, i) => {
      const x = x0 + i * dx + dx / 2;
      L(x, 84, x, 90); Rc(x - 5, 90, 10, 8); S(x, 95, 2.6, d.F); S(x + 6, 94, 2.3, d.c.egri + d.r.sonuc.In + ' A', false);
      L(x, 98, x, 112); S(x + 1, 106, 2.1, d.W, false); S(x + 1, 109, 2.1, kabloTip('dc', d.r.sonuc.S), false);
      Rc(x - 15, 112, 30, 12); S(x, 117, 2.4, kisa(d.c.ad)); S(x, 121.5, 2.2, tf(d.r.sonuc.Ib, 2) + ' A');
    });
  }
  return { w: W, h: dc.length ? 128 : 78, prims: P };
}

// Rapor satırları
export function elekRapor(sys, proje = '') {
  const n = (v, d = 3) => (fin(v) ? (Math.abs(v) >= 1000 || Math.abs(v) < 0.001 && v !== 0 ? v.toPrecision(5) : String(Number(v.toFixed(d)))).replace('.', ',') : '—');
  const L = ['ÇİZİM ATÖLYESİ — MEKATRONİK MÜHENDİSLİĞİ ELEKTRİK HESAP RAPORU', 'Elektrik donanımı (IEC 60204-1)' + (proje ? ' · ' + proje : ''), 'Sonuç: ' + (sys.uygun ? 'UYGUN (sınır aşımı yok)' : 'UYGUN DEĞİL — aşağıdaki hatalara bak'), ''];
  const g = sys.ayar;
  L.push('GENEL VERİLER', `  Şebeke ${g.U3} V 3~ / ${g.U1} V 1~ (TN), DC ${g.Udc} V; kaynak empedansı Ze = ${n(g.Ze)} Ω`, `  Ortam ${g.T} °C, kurulum yöntemi ${YONTEMLER[g.yontem] || g.yontem}, demette ${g.grup} devre${g.kGelle > 0 ? ' (gruplama katsayısı elle ' + n(g.kGelle) + ')' : ''}`, `  Gerilim düşümü sınırı %${n(g.dUmax)}, en küçük kesit ${n(g.Smin)} mm², eşzamanlılık katsayısı ${n(g.ks)}`, '');
  if (sys.hatalar.length) { L.push('GİRİŞ HATALARI'); for (const h of sys.hatalar) L.push('  ✗ ' + h); L.push(''); }
  if (sys.dc) L.push('24 V DC GÜÇ KAYNAĞI', `  Toplam DC akım = ${n(sys.dc.toplam)} A (eşzamanlılık dahil); gereken = ${n(sys.dc.gerek)} A`, `  Hesapta kullanılan anma akımı ${n(sys.dc.Inom)} A; giriş akımı = Udc·In / (η·U1·λ) = ${n(sys.dc.Iin)} A`, '');
  const devreYaz = (baslik, r) => {
    L.push(baslik);
    r.adimlar.forEach((s, i) => L.push(`  ${i + 1}. ${s.ad}: ${s.formul} = ${n(s.deger, 4)} ${s.birim}  [${s.kaynak}]`));
    for (const c of r.kontroller) L.push('  ' + (c.ok ? (c.duzey === 'bilgi' ? 'ℹ' : '✓') : c.duzey === 'hata' ? '✗ HATA' : '⚠ UYARI') + ' ' + c.metin);
    L.push('');
  };
  for (const d of sys.devreler) {
    const b = `DEVRE ${d.F} / ${d.W} — ${d.c.ad} (${TURLER[d.c.tur]}${d.faz ? ', ' + d.faz : ''})`;
    if (d.r) devreYaz(b, d.r); else L.push(b, '  ✗ ' + d.hata, '');
  }
  if (sys.ana) devreYaz(`ANA BESLEME -Q1 / -W0 — faz akımları L1 ${n(sys.fazlar[0], 2)} · L2 ${n(sys.fazlar[1], 2)} · L3 ${n(sys.fazlar[2], 2)} A (× ${n(g.ks)})`, sys.ana);
  if (sys.kontroller.length) { L.push('SİSTEM KONTROLLERİ'); for (const c of sys.kontroller) L.push('  ' + (c.ok ? '✓' : c.duzey === 'hata' ? '✗ HATA' : '⚠ UYARI') + ' ' + c.metin); L.push(''); }
  L.push('KABLO LİSTESİ');
  for (const r of kabloListesi(sys)) L.push(`  ${r.kablo}  ${r.tip}  ${n(r.L, 1)} m  ${r.koruma}  Ib ${n(r.Ib, 2)} A  ΔU %${n(r.dUp, 2)}  → ${r.hedef}`);
  L.push('', 'KLEMENS PLANI');
  for (const r of klemensPlani(sys)) L.push(`  ${r.klemens}  ${r.potansiyel}  ← ${r.kaynak}  ${r.kablo}/${r.damar}  ${String(r.S).replace('.', ',')} mm²  → ${r.hedef}`);
  L.push('', 'KAYNAKLAR');
  for (const [k, v] of Object.entries(KAYNAK_E)) L.push('  [' + k + '] ' + v);
  L.push('', 'Varsayımlar: kablo PVC yalıtımlı bakır (iletken 70 °C), 40 °C tabanlı IEC 60204-1 Tablo 6 değerleri üç yüklü iletken içindir (1 faz ve DC için güvenli taraftadır); gerilim düşümünde iletken reaktansı ihmal edildi (küçük kesitlerde etkisi azdır); koruma iletkeni faz ile aynı kablodadır; 1 faz yükler en az yüklü faza dağıtılır, akımlar aritmetik toplanır (güvenli taraf).');
  L.push('Bu rapor ön tasarım hesabıdır. Devre kesici, güç kaynağı ve kablo üreticinin güncel kataloğuyla, tesisat yetkili elektrik mühendisi onayıyla kesinleştirilmelidir. Motor yol alma akımı, sürücü kaçak akımı (RCD seçimi), kısa devre kesme kapasitesi, koruma seçiciliği (selektivite) ve EMC bu hesabın kapsamında değildir.');
  return L;
}
export const KAYNAK_E = {
  'IEC 60204-1': 'Makine elektrik donanımı: Tablo 6 akım taşıma kapasitesi, Ek D düzeltme katsayıları, 12.5 gerilim düşümü, Tablo 5 en küçük kesit',
  'IEC 60364-4-43': 'Aşırı akım koruması: Ib ≤ In ≤ Iz, I2 ≤ 1,45·Iz',
  'IEC 60364-4-41': 'Elektrik çarpmasına karşı koruma, TN sisteminde otomatik kesme: Zs·Ia ≤ U0',
  'IEC 60364-5-54': 'Koruma iletkeni kesiti',
  'IEC 60898-1': 'Minyatür devre kesici ani açma bölgeleri (B, C, D)',
  'IEC 60228': 'Bakır iletken özdirenci',
  Elektrik: 'Temel devre bağıntıları (Ohm yasası, AC güç)',
  Katalog: 'Kullanıcının girdiği üretici katalog değeri',
};

// Proje verisi temizliği
export function elekSanitize(o) {
  const E = { ayar: { ...ELEK_DEFAULTS }, yukler: [], nextId: 1 };
  if (!o || typeof o !== 'object') return E;
  for (const k of Object.keys(ELEK_DEFAULTS)) {
    const v = o.ayar?.[k];
    if (typeof ELEK_DEFAULTS[k] === 'number' ? fin(v) : typeof v === 'string' && ((k === 'yontem' && YI[v]) || (k.endsWith('gri') && EGRI[v]))) E.ayar[k] = v;
  }
  const ids = new Set();
  for (const y of Array.isArray(o.yukler) ? o.yukler.slice(0, 200) : []) {
    if (!y || !fin(y.id) || ids.has(y.id) || !TURLER[y.tur]) continue;
    const c = { id: y.id, ad: typeof y.ad === 'string' && y.ad ? y.ad.slice(0, 60) : 'Yük', tur: y.tur, giris: y.giris === 'I' ? 'I' : 'P', egri: EGRI[y.egri] ? y.egri : 'C', ref: fin(y.ref) ? y.ref : null };
    for (const k of ['I', 'P', 'cos', 'eta', 'L', 'In', 'S']) c[k] = fin(y[k]) ? y[k] : YUK_DEFAULT[k];
    E.yukler.push(c); ids.add(y.id);
  }
  E.nextId = Math.max(fin(o.nextId) ? o.nextId : 1, ...E.yukler.map((y) => y.id + 1), 1);
  return E;
}
export function yukEkle(E, tur, from = {}) {
  const ad = { ac3: '3 faz yük', ac1: '1 faz yük', dc: '24 V yük' }[tur];
  const y = { ...YUK_DEFAULT, id: E.nextId++, ad, tur, cos: tur === 'dc' ? 1 : YUK_DEFAULT.cos, L: tur === 'dc' ? 5 : 10, ...from };
  E.yukler.push(y); return y;
}
// Ürün ağacından elektrik yüküne: sürücü (şebeke giriş akımı), valf bobini, sensör, motor freni. Değer yoksa boş bırakılır (uydurulmaz).
export function agactanYukler(E, items) {
  const var_ = new Set(E.yukler.map((y) => y.ref).filter((r) => r != null));
  const yeni = [];
  for (const it of items) {
    if (var_.has(it.id)) continue;
    const U = it.deger?.U;
    if (it.kind === 'surucu') yeni.push(yukEkle(E, fin(U) && U <= 60 ? 'dc' : fin(U) && U < 300 ? 'ac1' : 'ac3', { ad: it.ad, giris: 'I', ref: it.id }));
    else if (it.kind === 'valf' || it.kind === 'sensor') yeni.push(yukEkle(E, 'dc', { ad: it.ad, giris: 'P', ref: it.id }));
    else if (it.kind === 'motor' && it.deger?.fren === 1) yeni.push(yukEkle(E, 'dc', { ad: it.ad + ' freni', giris: 'P', ref: it.id }));
  }
  return yeni;
}
// Ürün ağacındaki katalog değerini yüke uygula (bağlı alanlar salt okunur gösterilir)
export function bagliDeger(y, items) {
  if (y.ref == null) return { y, kaynak: {} };
  const it = items.find((i) => i.id === y.ref);
  if (!it) return { y, kaynak: {} };
  const out = { ...y }, kaynak = {};
  const al = (f, v) => { if (fin(v)) { out[f] = v; kaynak[f] = it.ad; } };
  if (it.kind === 'surucu') al('I', it.deger.Ig);
  else if (it.kind === 'valf' || it.kind === 'sensor') al('P', it.deger.P);
  else if (it.kind === 'motor') al('P', it.deger.Pf);
  return { y: out, kaynak };
}
