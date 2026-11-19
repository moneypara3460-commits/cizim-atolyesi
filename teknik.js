// Teknik resim yardımcıları: genel tolerans (ISO 2768-1), delik geçme toleransı (ISO 286 H), yüzey pürüzlülüğü (Ra),
// delik yazıları (diş / kademe / havşa) ve resimdeki parça listesi. Saf hesap modülü; ölçüler mm.
//
// Kaynaklar (19.11.2026, her tablo en az iki kaynakla karşılaştırıldı):
// - ISO 2768-1 Tablo 1 (doğrusal ölçüler): IS 2102 (Part 1):1993 (ISO 2768-1 ile özdeş), AmesWeb, Wevolver, Star Rapid.
// - ISO 286-1 Tablo 1 IT6…IT11 (µm, 500 mm'ye kadar): Wikipedia "IT Grade" (ISO 286 Tablo 1'den), Wevolver (IT6–IT8 ≤ 30),
//   GlobalSpec / Engineering Drawing for Manufacture (≤ 10), ISO 286 Tablo 1 kopyası (180–315), RoyMech (40 mm: IT6 16, IT7 25).
//   H deliğinde alt sapma EI = 0, üst sapma ES = IT (ISO 286-1 temel sapma H).
// - Ra dizisi (ISO 1302 N1…N12): Ceratizit, Xometry, Keyence, Machinery's Handbook 31. baskı Tablo 4.

export const GENEL_TOL_SINIF = { f: 'ince (f)', m: 'orta (m)', c: 'kaba (c)', v: 'çok kaba (v)' };
// [üst sınır (dahil), f, m, c, v] — alt sınır bir önceki satırın üst sınırı (ilk satır 0,5)
const T2768 = [
  [3, 0.05, 0.1, 0.2, null], [6, 0.05, 0.1, 0.3, 0.5], [30, 0.1, 0.2, 0.5, 1], [120, 0.15, 0.3, 0.8, 1.5],
  [400, 0.2, 0.5, 1.2, 2.5], [1000, 0.3, 0.8, 2, 4], [2000, 0.5, 1.2, 3, 6], [4000, null, 2, 4, 8],
];
const COL = { f: 1, m: 2, c: 3, v: 4 };
// ± sapma (mm); tabloda yoksa null (0,5 mm altı, 4000 mm üstü, f için 2000 üstü, v için 3 ve altı)
export function genelTol(sinif, olcu) {
  if (!COL[sinif] || !(olcu >= 0.5)) return null;
  for (const r of T2768) if (olcu <= r[0]) return r[COL[sinif]];
  return null;
}

// ISO 286-1 IT (µm): [üst sınır (dahil), IT6, IT7, IT8, IT9, IT10, IT11]
const IT = [
  [3, 6, 10, 14, 25, 40, 60], [6, 8, 12, 18, 30, 48, 75], [10, 9, 15, 22, 36, 58, 90], [18, 11, 18, 27, 43, 70, 110],
  [30, 13, 21, 33, 52, 84, 130], [50, 16, 25, 39, 62, 100, 160], [80, 19, 30, 46, 74, 120, 190], [120, 22, 35, 54, 87, 140, 220],
  [180, 25, 40, 63, 100, 160, 250], [250, 29, 46, 72, 115, 185, 290], [315, 32, 52, 81, 130, 210, 320], [400, 36, 57, 89, 140, 230, 360],
  [500, 40, 63, 97, 155, 250, 400],
];
export const GECME = ['H6', 'H7', 'H8', 'H9', 'H10', 'H11'];
export function itDeger(derece, d) {
  const k = derece - 5;
  if (!(k >= 1 && k <= 6) || !(d > 0) || d > 500) return null;
  for (const r of IT) if (d <= r[0]) return r[k];
  return null;
}
// H deliği: { es, ei } mm ya da null
export function hSapma(sinif, d) {
  const m = /^H(\d{1,2})$/.exec(String(sinif || ''));
  if (!m) return null;
  const it = itDeger(+m[1], d);
  return it == null ? null : { es: it / 1000, ei: 0 };
}

export const RA = [0.025, 0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.3, 12.5, 25, 50];   // N1 … N12
export const nSinifi = (ra) => { const i = RA.indexOf(+ra); return i < 0 ? '' : 'N' + (i + 1); };

const tf = (v, d = 3) => String(Math.round(v * 10 ** d) / 10 ** d).replace('.', ',');
const sapmaYaz = (s) => '(+' + tf(s.es) + ' / 0)';

// Deliğin resim yazısı (satırlar). p: parça (delik sihirbazından p.hole, elle verilen p.fit); num: ölçü metni
export function delikYazisi(p, num = (v) => tf(v, 2)) {
  const h = p && p.hole, out = [];
  const fit = p && p.fit && hSapma(p.fit, +p.d) ? ' ' + p.fit + ' ' + sapmaYaz(hSapma(p.fit, +p.d)) : '';
  const der = (boydan, L) => (boydan ? ' boydan boya' : ' ↧' + num(L));
  if (!h) { out.push('Ø' + num(+p.d) + fit); return out; }
  const L = h.boydan ? 0 : h.derinlik;
  if (h.tur === 'klavuz' && h.thread) {
    const th = h.thread;
    out.push(th.olcu + (th.kaba ? '' : '×' + tf(th.adim)) + '-' + th.sinif + der(th.boydan, th.boy));
    out.push('Ø' + num(h.d) + der(h.boydan, L));
  } else if (h.tur === 'kademe') {
    out.push('Ø' + num(h.d) + fit + der(h.boydan, L));
    const kd = h.kademe || {};
    out.push('⌴ Ø' + num(kd.d || 0) + ' ↧' + num(kd.der || 0));
  } else if (h.tur === 'havsa') {
    out.push('Ø' + num(h.d) + fit + der(h.boydan, L));
    out.push('⌵ Ø' + num((h.havsa || {}).d || 0) + ' × 90°');
  } else {
    out.push('Ø' + num(h.d) + fit + der(h.boydan, L));
  }
  return out;
}

// Resimdeki parça listesi: görünür, birleşen (oyuk değil), yardımcı olmayan parçalar; aynı ad + tür + ölçü + malzeme
// tek satırda adetle. dims(p) ölçü metni, matName(p) malzeme adı. Dönüş: [{ poz, ad, adet, malzeme, olcu, ids }]
export function resimParcaListesi(parts, dims, matName) {
  const rows = [], idx = new Map();
  parts.forEach((p, i) => {
    if (!p || p.hidden || p.aux || (i > 0 && p.op === 'sub')) return;
    const ad = p.name || '', olcu = dims(p), malzeme = matName(p);
    const key = [ad, p.type, olcu, malzeme].join('|');
    if (idx.has(key)) { const r = rows[idx.get(key)]; r.adet++; r.ids.push(p.id); return; }
    idx.set(key, rows.length);
    rows.push({ poz: rows.length + 1, ad, tur: p.type, adet: 1, malzeme, olcu, ids: [p.id] });
  });
  return rows;
}

// Delik tablosu (resim): delik sihirbazıyla açılan delikler, aynı yazıya sahip olanlar adetle
export function delikTablosu(parts, num) {
  const rows = [], idx = new Map();
  for (const p of parts) {
    if (!p || p.hidden || p.aux || p.op !== 'sub' || !(p.hole || p.fit)) continue;
    const y = delikYazisi(p, num).join('  ');
    if (idx.has(y)) { rows[idx.get(y)].adet++; continue; }
    idx.set(y, rows.length);
    rows.push({ harf: String.fromCharCode(65 + (rows.length % 26)), yazi: y, adet: 1 });
  }
  return rows;
}
