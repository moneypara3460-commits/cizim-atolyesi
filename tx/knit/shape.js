// Triko numune (gauge), ölçü ↔ ilmek dönüşümü, sıra sıra şekillendirme (eksiltme / artırma) ve parça hesabı. Saf modül.
//   swatch = { id, name, yarn, stitch, st10, row10, washed, loopLen }  (st10 / row10: 10 cm'deki ilmek / sıra)

export function validateSwatch(s) {
  const e = [];
  if (!(Number.isFinite(s?.st10) && s.st10 > 0 && s.st10 <= 200)) e.push('10 cm\'deki ilmek sayısı 0–200 olmalı');
  if (!(Number.isFinite(s?.row10) && s.row10 > 0 && s.row10 <= 400)) e.push('10 cm\'deki sıra sayısı 0–400 olmalı');
  if (s?.loopLen != null && !(Number.isFinite(s.loopLen) && s.loopLen > 0)) e.push('İlmek boyu geçersiz');
  return e;
}
export const stitchesFor = (mm, s) => (mm / 100) * s.st10;
export const rowsFor = (mm, s) => (mm / 100) * s.row10;
export const widthOf = (st, s) => (st / s.st10) * 100;
export const heightOf = (rows, s) => (rows / s.row10) * 100;
// Genişliğe en yakın ilmek sayısı; desen tekrarı (rep) ve kenar ilmekleri (edge, her yan) korunur: (n − 2·edge) % rep === 0
export function fitStitches(mm, s, { rep = 1, edge = 0 } = {}) {
  const raw = stitchesFor(mm, s);
  const k = Math.max(1, Math.round((raw - 2 * edge) / rep)), n = k * rep + 2 * edge;
  return { n, raw, width: widthOf(n, s), diff: widthOf(n, s) - mm };
}
export const fitRows = (mm, s, mult = 1) => { const n = Math.max(mult, Math.round(rowsFor(mm, s) / mult) * mult); return { n, height: heightOf(n, s) }; };

// Şekillendirme planı: `count` ilmek (her yandan) `rows` sıra içinde eksiltilir / artırılır.
// Klasik eşit dağıtım: aralıklar a ve a+1 sıra; "her a sırada 1 × p, her a+1 sırada 1 × q".
export function spread(count, rows) {
  if (count <= 0) return { steps: [], rows: 0 };
  if (rows < count) throw new Error(`${count} değişim için en az ${count} sıra gerekir (var: ${rows})`);
  const a = Math.floor(rows / count), extra = rows - a * count;   // extra adet aralık a+1
  const steps = []; let r = 0;
  for (let i = 0; i < count; i++) { const gap = i < extra ? a + 1 : a; r += gap; steps.push(r); }
  return { steps, groups: [extra ? { every: a + 1, times: extra } : null, { every: a, times: count - extra }].filter(Boolean), rows };
}
export const describeSpread = (sp, verb) => sp.groups.map((g) => `her ${g.every}. sırada 1 ${verb} × ${g.times}`).join(', ');

/* ---------- triko parçaları (ölçüler mm, düz serili) ---------- */
export const KNIT_PIECES = {
  beden: {
    label: 'Beden (ön / arka, düşük omuz)',
    params: { width: ['Genişlik (yarım göğüs + bolluk)', 520], length: ['Boy', 650], ribH: ['Ribana yüksekliği', 60], armhole: ['Kol oyuğu derinliği', 220], neckW: ['Yaka genişliği', 180], neckD: ['Yaka derinliği (ön)', 80] },
  },
  kol: {
    label: 'Kol (manşetten koltuğa artırma)',
    params: { cuffW: ['Manşet genişliği', 200], upperW: ['Pazu genişliği', 380], length: ['Kol boyu (ribana dahil)', 560], ribH: ['Ribana yüksekliği', 60] },
  },
  atki: { label: 'Atkı', params: { width: ['En', 280], length: ['Boy', 1600], ribH: ['Uç ribanası', 40] } },
};
// Parça hesabı: ilmek / sıra sayıları ve sıra sıra plan. rep = desen tekrarı genişliği, ribRep = ribana tekrarı (2×2 → 4)
export function computePiece(kind, o, s, { rep = 1, ribRep = 2, edge = 1 } = {}) {
  const sw = validateSwatch(s); if (sw.length) throw new Error(sw.join('; '));
  const mul = Math.max(rep, ribRep) % Math.min(rep, ribRep) === 0 ? Math.max(rep, ribRep) : rep * ribRep;   // ikisine de uyan tekrar
  const plan = [], R = (mm) => fitRows(mm, s).n;
  if (kind === 'beden') {
    const W = fitStitches(o.width, s, { rep: mul, edge }), rib = R(o.ribH), total = R(o.length), arm = R(o.armhole);
    const neck = fitStitches(o.neckW, s, { rep: 1 }).n, nd = R(o.neckD);
    const bodyRows = total - rib;
    if (bodyRows < arm + 2) throw new Error('Boy, ribana + kol oyuğu için kısa');
    plan.push({ from: 1, to: rib, text: `${W.n} ilmek ribana (${rib} sıra)` });
    plan.push({ from: rib + 1, to: total - arm, text: `${W.n} ilmek düz devam` });
    plan.push({ from: total - arm + 1, to: total - nd, text: `Kol oyuğu işareti (düşük omuz: eksiltme yok); ${W.n} ilmek` });
    // düşük omuz: omuz = beden genişliği; yaka ortada, iki omuz eşit
    if (neck >= W.n - 2) throw new Error('Yaka, beden genişliğinden geniş');
    const shoulderEach = Math.floor((W.n - neck) / 2);
    plan.push({ from: total - nd + 1, to: total, text: `Ön yaka: ortadaki ${W.n - 2 * shoulderEach} ilmek kapatılır / bekletilir, her omuzda ${shoulderEach} ilmek kalır` });
    return { kind, castOn: W.n, rows: total, ribRows: rib, width: W.width, widthDiff: W.diff, plan, shoulderSt: shoulderEach, neckSt: W.n - 2 * shoulderEach, mult: mul };
  }
  if (kind === 'kol') {
    const c = fitStitches(o.cuffW, s, { rep: mul, edge }), u = fitStitches(o.upperW, s, { rep: mul, edge }), rib = R(o.ribH), total = R(o.length);
    const inc = (u.n - c.n) / 2;
    if (inc < 0) throw new Error('Pazu genişliği manşetten küçük');
    const avail = total - rib - Math.min(10, Math.floor((total - rib) * 0.1));   // son ~%10 düz
    const sp = spread(inc, avail);
    plan.push({ from: 1, to: rib, text: `${c.n} ilmek ribana (${rib} sıra)` });
    if (inc) plan.push({ from: rib + 1, to: rib + avail, text: `Her iki yanda ${describeSpread(sp, 'artır')} → ${u.n} ilmek` });
    plan.push({ from: rib + avail + 1, to: total, text: `${u.n} ilmek düz, kapat` });
    return { kind, castOn: c.n, end: u.n, rows: total, ribRows: rib, perSide: inc, steps: sp.steps.map((r) => r + rib), groups: sp.groups || [], plan, mult: mul, widthDiff: u.diff };
  }
  if (kind === 'atki') {
    const W = fitStitches(o.width, s, { rep: mul, edge }), rib = R(o.ribH), total = R(o.length);
    plan.push({ from: 1, to: rib, text: `${W.n} ilmek ribana` }, { from: rib + 1, to: total - rib, text: 'Desenle devam' }, { from: total - rib + 1, to: total, text: 'Ribana, kapat' });
    return { kind, castOn: W.n, rows: total, ribRows: rib, width: W.width, widthDiff: W.diff, plan, mult: mul };
  }
  throw new Error('Bilinmeyen triko parçası: ' + kind);
}
// Bedenlere göre ilmek sayıları: ölçüler beden tablosundan; tekrarlar korunur
export function gradeKnit(kind, baseParams, s, table, sizes, opts = {}) {
  return sizes.map((z) => {
    const o = { ...baseParams };
    const chest = table?.measures?.['Göğüs çevresi']?.[z];
    if (kind === 'beden' && Number.isFinite(chest)) o.width = chest / 2 + (opts.ease ?? 40);
    if (kind === 'kol' && Number.isFinite(chest)) o.upperW = baseParams.upperW * (chest / (table.measures['Göğüs çevresi'][opts.base] || chest));
    try { const r = computePiece(kind, o, s, opts); return { size: z, ok: true, ...r }; } catch (e) { return { size: z, ok: false, error: e.message }; }
  });
}
