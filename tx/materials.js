// Kumaş, iplik, aksesuar: numara dönüşümleri, hazır kartlar, tüketim ve gramaj. Saf modül.
// Dokuma (kumaş, alan / en) ve triko (iplik, ilmek boyu / tex) ayrı modellerle hesaplanır; aynı varsayımlara zorlanmaz.
import { cutPolygon, polyArea } from './woven/pattern.js?v=20261112h';

/* ---------- iplik numarası ----------
   tex = g / 1000 m (doğrudan) · dtex = 10 tex · denye (den) = 9 tex
   Nm = m / g (dolaylı) → tex = 1000 / Nm · Ne (pamuk, İngiliz) = 840 yd / lb → tex = 590,5 / Ne */
const NE = 590.5;
export function toTex(value, system) {
  if (!(Number.isFinite(value) && value > 0)) throw new Error('İplik numarası sıfırdan büyük olmalı');
  switch (system) {
    case 'tex': return value; case 'dtex': return value / 10; case 'den': return value / 9;
    case 'Nm': return 1000 / value; case 'Ne': return NE / value;
    default: throw new Error('Bilinmeyen numara sistemi: ' + system);
  }
}
export function fromTex(tex, system) {
  switch (system) {
    case 'tex': return tex; case 'dtex': return tex * 10; case 'den': return tex * 9;
    case 'Nm': return 1000 / tex; case 'Ne': return NE / tex;
    default: throw new Error('Bilinmeyen numara sistemi: ' + system);
  }
}
export const convertCount = (v, from, to) => fromTex(toTex(v, from), to);
// Katlı iplik (eşit katlar): sonuç tex = kat × tek kat tex. Büküm kısalması ihmal (birkaç %): sonuç "yaklaşık"
export const resultantTex = (value, system, ply = 1) => toTex(value, system) * Math.max(1, ply || 1);
export function allCounts(value, system, ply = 1) {
  const t = resultantTex(value, system, ply);
  return { tex: t, dtex: t * 10, den: t * 9, Nm: 1000 / t, Ne: NE / t, ply };
}

/* ---------- hazır kartlar (örnek değerler) ----------
   Piyasadaki tipik değerlerdir; gerçek değer tedarikçinin kartından alınmalı. Bütün sayısal alanlar "tahmini" işaretlenir. */
export const PRESETS = {
  fabric: [
    { name: 'Poplin %100 pamuk', props: { composition: '%100 pamuk', construction: 'dokuma (bez ayağı)', width: 1500, gsm: 110, shrinkWarp: 3, shrinkWeft: 2 } },
    { name: 'Oxford gömleklik', props: { composition: '%100 pamuk', construction: 'dokuma (panama)', width: 1500, gsm: 140, shrinkWarp: 3, shrinkWeft: 2 } },
    { name: 'Denim 12 oz', props: { composition: '%100 pamuk', construction: 'dokuma (dimi 3/1)', width: 1500, gsm: 407, shrinkWarp: 2, shrinkWeft: 2 } },
    { name: 'Keten', props: { composition: '%100 keten', construction: 'dokuma (bez ayağı)', width: 1450, gsm: 180, shrinkWarp: 5, shrinkWeft: 4 } },
    { name: 'Saten polyester', props: { composition: '%100 polyester', construction: 'dokuma (saten)', width: 1500, gsm: 120, shrinkWarp: 1, shrinkWeft: 1 } },
    { name: 'Astar polyester', props: { composition: '%100 polyester', construction: 'dokuma (taffeta)', width: 1500, gsm: 65, shrinkWarp: 1, shrinkWeft: 1 } },
    { name: 'Süprem (jarse) pamuk', props: { composition: '%100 pamuk', construction: 'örme kumaş (tek plaka)', width: 1800, gsm: 160, shrinkWarp: 5, shrinkWeft: 4, stretchWeft: 20 } },
    { name: 'Gabardin', props: { composition: '%65 polyester %35 viskon', construction: 'dokuma (dimi)', width: 1500, gsm: 220, shrinkWarp: 2, shrinkWeft: 1 } },
  ],
  yarn: [
    { name: 'Merinos yün Nm 2/28', props: { fiber: '%100 merinos yün', countSystem: 'Nm', count: 28, ply: 2, twist: 450, twistDir: 'S' } },
    { name: 'Akrilik Nm 2/32', props: { fiber: '%100 akrilik', countSystem: 'Nm', count: 32, ply: 2, twist: 420, twistDir: 'S' } },
    { name: 'Pamuk Ne 20/2', props: { fiber: '%100 pamuk', countSystem: 'Ne', count: 20, ply: 2, twist: 600, twistDir: 'S' } },
    { name: 'Yün-akrilik Nm 2/24', props: { fiber: '%50 yün %50 akrilik', countSystem: 'Nm', count: 24, ply: 2, twist: 400, twistDir: 'S' } },
    { name: 'Kaşmir Nm 2/26', props: { fiber: '%100 kaşmir', countSystem: 'Nm', count: 26, ply: 2, twist: 420, twistDir: 'S' } },
  ],
  trim: [
    { name: 'Düğme 11 mm (gömlek)', props: { trimType: 'düğme', size: '11 mm, 4 delik' } },
    { name: 'Düğme 15 mm (ceket / hırka)', props: { trimType: 'düğme', size: '15 mm' } },
    { name: 'Gizli fermuar 20 cm', props: { trimType: 'fermuar', size: '20 cm' } },
    { name: 'Tela (yapışkan)', props: { trimType: 'tela', size: '90 cm en' } },
    { name: 'Dikiş ipliği polyester 120', props: { trimType: 'dikiş ipliği', size: 'Tex 25' } },
    { name: 'Lastik 3 cm', props: { trimType: 'lastik', size: '30 mm' } },
  ],
};
export const presetEstimated = (kind, props) => Object.keys(props).filter((k) => typeof props[k] === 'number');

/* ---------- dokuma: kumaş tüketimi ----------
   Kesim alanı (pay dahil) × adet (katlı kesilen parça 2 kat) → çekme payıyla büyütülür → kumaş enine ve yerleşim verimine bölünür.
   Yerleşim yapılmadan önce verim varsayımdır (varsayılan %80); Aşama 7'deki gerçek yerleşim bunun yerini alır. */
export function wovenConsumption(pieces, fabric, { efficiency = 0.8, extra = 0.03 } = {}) {
  const pr = fabric?.props || {}, notes = [];
  if (!(pr.width > 0)) throw new Error(`${fabric?.name || 'Kumaş'}: en bilinmiyor; tüketim hesaplanamaz`);
  if (!(efficiency > 0 && efficiency <= 1)) throw new Error('Yerleşim verimi 0–1 arası olmalı');
  let area = 0; const per = [];
  for (const pc of pieces) {
    const a = polyArea(cutPolygon(pc).pts) * (pc.fold != null ? 2 : 1) * pc.qty;
    per.push({ name: pc.name, area: a }); area += a;
  }
  const sl = (pr.shrinkWarp ?? 0) / 100, sw = (pr.shrinkWeft ?? 0) / 100;
  if (pr.shrinkWarp == null || pr.shrinkWeft == null) notes.push('çekme oranı bilinmiyor: 0 alındı');
  const shrunk = area / ((1 - sl) * (1 - sw));
  const lengthMM = shrunk / (pr.width * efficiency) * (1 + extra);
  const est = new Set(fabric.estimated || []);
  if (['width', 'shrinkWarp', 'shrinkWeft'].some((k) => est.has(k))) notes.push('kumaş kartında tahmini değer var');
  notes.push(`yerleşim verimi %${Math.round(efficiency * 100)} varsayıldı (gerçek yerleşim Aşama 7)`, `%${Math.round(extra * 100)} uç / kesim kaybı`);
  return { cutArea: area, shrunkArea: shrunk, lengthM: lengthMM / 1000, weightG: pr.gsm > 0 ? (lengthMM / 1000) * (pr.width / 1000) * pr.gsm : null, garmentFabricG: pr.gsm > 0 ? area / 1e6 * pr.gsm : null, per, notes, estimated: true };
}

/* ---------- triko: ilmek sayısı, iplik boyu, gramaj ---------- */
// Parça sonucundan (shape.computePiece) toplam ilmek sayısı
export function knitStitchTotal(r) {
  if (r.kind === 'kol') { let n = r.castOn, sum = 0; const inc = new Set(r.steps); for (let row = 1; row <= r.rows; row++) { if (inc.has(row)) n += 2; sum += n; } return sum; }
  if (r.kind === 'beden') { const neckRows = r.rows - (r.plan.at(-1).from - 1); return r.castOn * (r.rows - neckRows) + 2 * r.shoulderSt * neckRows; }
  return r.castOn * r.rows;
}
// İlmek boyu (mm), öncelik: numunede ölçülen > tartılan numune > numune sıklığından geometrik tahmin.
// Geometrik tahmin (Munden, tek plaka düz örgü, kuru gevşemiş): ks = sıra/cm × ilmek/cm × l² ≈ 19 (l cm) → l = √(ks / S).
// Ribana, saç örgüsü gibi yapılarda katsayı farklıdır: sonuç "tahmini" işaretlenir.
export const KS = 19;
export function loopLength(swatch, tex) {
  if (swatch?.loopLen > 0) return { l: swatch.loopLen, method: 'numunede ölçülen ilmek boyu', estimated: false };
  if (swatch?.weightG > 0 && swatch?.wSt > 0 && swatch?.wRows > 0 && tex > 0) return { l: (swatch.weightG / tex * 1e6) / (swatch.wSt * swatch.wRows), method: 'tartılan numuneden', estimated: false };
  if (swatch?.st10 > 0 && swatch?.row10 > 0) { const S = (swatch.st10 / 10) * (swatch.row10 / 10); return { l: Math.sqrt(KS / S) * 10, method: `tahmini: numune sıklığından (düz örgü, ks ≈ ${KS}) — numunede ilmek boyunu ölç ya da numuneyi tart`, estimated: true }; }
  throw new Error('Numune sıklığı bilinmiyor: ilmek boyu hesaplanamaz');
}
// Sıkılık faktörü TF = √tex / l (mm). Tek plaka için olağan aralık yaklaşık 1,0–2,0; dışında numune ile iplik uyumsuz olabilir
export const tightness = (tex, l) => Math.sqrt(tex) / l;
export function yarnConsumption(stitches, yarn, swatch, { waste = 0.05 } = {}) {
  const pr = yarn?.props || {};
  if (pr.count == null || !pr.countSystem) throw new Error(`${yarn?.name || 'İplik'}: numara bilinmiyor`);
  const tex = resultantTex(pr.count, pr.countSystem, pr.ply || 1);
  const L = loopLength(swatch, tex);
  const lengthM = stitches * L.l / 1000, grams = lengthM * tex / 1000, tf = tightness(tex, L.l);
  const warn = tf < 1 || tf > 2 ? `sıkılık faktörü ${tf.toFixed(2)}: numune sıklığı bu iplik numarasıyla uyumsuz görünüyor (olağan ~1,0–2,0)` : '';
  return { stitches, tex, loop: L.l, method: L.method, lengthM, grams, gramsWithWaste: grams * (1 + waste), waste, tf, warn, estimated: L.estimated || (yarn.estimated || []).includes('count') };
}
