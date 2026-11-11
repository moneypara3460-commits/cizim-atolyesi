// Temel kalıp blokları (dokuma / konfeksiyon). Ölçüden basitleştirilmiş çizim yöntemi; mm, y aşağı.
// UYARI: Bunlar başlangıç bloklarıdır (temel kalıp). Prova ile doğrulanmadan seri üretime alınmamalı.
// Her takım, parçalarla birlikte dikiş eşleşmelerini (seams) de üretir: kol başı ↔ kol oyuğu, yan dikiş, omuz, yaka, kemer…
import * as C from '../curve.js?v=20261112c';
import * as P from './pattern.js?v=20261112c';

const L = C.line, Q = C.cubic;
const edge = (name, segs, allow = 10, corner = 'miter') => ({ name, segs: Array.isArray(segs) ? segs : [segs], allow, corner });

// Parametreler: [etiket, varsayılan (mm), beden tablosundaki ölçü adı (varsa)]
export const SETS = {
  gomlek: {
    label: 'Gömlek takımı (ön, arka, kol, yaka ayağı, yaka, manşet, cep)',
    params: {
      chest: ['Göğüs çevresi', 960, 'Göğüs çevresi'], ease: ['Göğüs bolluğu', 120], length: ['Beden boyu (arka yaka – etek)', 760],
      neck: ['Boyun çevresi', 390], shoulder: ['Omuz dikiş boyu', 150], armhole: ['Kol oyuğu derinliği (omuzdan)', 230],
      sleeve: ['Kol boyu (manşet hariç)', 560], wrist: ['Bilek çevresi', 180], capEase: ['Kol başı bolluğu (kol başı − kol oyuğu)', 10], pleat: ['Kol ağzı pilesi', 30],
    },
    build: buildShirt,
  },
  etek: {
    label: 'Düz etek takımı (ön, arka, kemer)',
    params: { waist: ['Bel çevresi', 720, 'Bel çevresi'], hip: ['Kalça çevresi', 980, 'Kalça çevresi'], hipEase: ['Kalça bolluğu', 40], hipDepth: ['Bel – kalça yüksekliği', 200], length: ['Etek boyu', 600], overlap: ['Kemer kruvaze payı', 30] },
    build: buildSkirt,
  },
};
export function defaultParams(set, measures = {}) {
  const o = {};
  for (const [k, [, v, src]] of Object.entries(SETS[set].params)) o[k] = src && Number.isFinite(measures[src]) ? measures[src] : v;
  return o;
}

/* ---------- gömlek ---------- */
function bodice(o, back) {
  const W = (o.chest + o.ease) / 4, nw = o.neck / 6 + 5, nd = back ? 20 : o.neck / 6 + 15, drop = back ? 35 : 45;
  const sx = nw + Math.sqrt(o.shoulder ** 2 - drop ** 2), AD = o.armhole, Lh = o.length;
  const SP = [sx, drop], UA = [W, AD];
  // kol oyuğu: ön daha oyuk, arka daha düz
  const arm = back ? Q(SP, [sx - 6, drop + (AD - drop) * 0.55], [W - 40, AD - 4], UA) : Q(SP, [sx - 14, drop + (AD - drop) * 0.5], [W - 30, AD], UA);
  const neck = edge('yaka', back ? Q([0, nd], [nw * 0.5, nd], [nw - 5, nd * 0.45], [nw, 0]) : Q([0, nd], [nw * 0.55, nd], [nw, nd * 0.45], [nw, 0]));
  const common = [neck, edge('omuz', L([nw, 0], SP)), edge('kol oyuğu', arm), edge('yan dikiş', L(UA, [W, Lh]))];
  // ön: ön ortadan 2,5 cm düğme patı uzatması; arka: arka orta kumaş katında
  const edges = back
    ? [...common, edge('etek', L([W, Lh], [0, Lh]), 15), edge('arka orta', L([0, Lh], [0, nd]), 0)]
    : [...common, edge('etek', L([W, Lh], [-25, Lh]), 15), edge('ön pat', L([-25, Lh], [-25, nd]), 10), edge('pat üstü', L([-25, nd], [0, nd]), 10)];
  const pc = P.makePiece({ name: back ? 'Arka beden' : 'Ön beden', qty: back ? 1 : 2, pair: !back, fold: back ? 5 : null, edges, grain: [[W / 2, AD + 40], [W / 2, Lh - 80]] });
  if (!back) { for (let k = 0; k < 6; k++) pc.marks.push({ kind: 'düğme', p: [0, nd + 20 + k * ((Lh - nd - 120) / 5)], label: '' }); pc.lines.push({ path: C.polyPath([[0, nd], [0, Lh]]), kind: 'orta çizgi' }); }
  pc.notches.push({ edge: 2, at: P.edgeLength(edges[2]) * 0.5, kind: back ? 'çift' : 'tek' });
  return { pc, W, AD, SP, nd, nw };
}
function sleeve(o, armLen) {
  // kol başı yüksekliği kol oyuğu derinliğinin ~%60'ı; pazu genişliği, kol başı eğrisi uzunluğu (iki yarım) = kol oyuğu + bolluk olacak şekilde çözülür
  const CH = o.armhole * 0.6, target = armLen + o.capEase, cuffW = o.wrist + 40 + o.pleat;   // manşet boyu (bilek + 40 bolluk/kruvaze) + pile
  const cap = (bw) => [Q([-bw, CH], [-bw * 0.55, CH - 6], [-bw * 0.42, 0], [0, 0]), Q([0, 0], [bw * 0.42, 0], [bw * 0.55, CH - 6], [bw, CH])];
  const capLen = (bw) => cap(bw).reduce((a, s) => a + C.segLength(s), 0);
  let lo = 50, hi = 400;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (capLen(m) < target) lo = m; else hi = m; }
  const bw = (lo + hi) / 2, SL = o.sleeve, cw = cuffW / 2;
  const pc = P.makePiece({ name: 'Kol', qty: 2, pair: true, edges: [
    edge('kol başı', cap(bw)), edge('kol altı (arka)', L([bw, CH], [cw, SL])), edge('kol ağzı', L([cw, SL], [-cw, SL])), edge('kol altı (ön)', L([-cw, SL], [-bw, CH])),
  ], grain: [[0, CH + 30], [0, SL - 60]] });
  pc.notches.push({ edge: 0, at: capLen(bw) / 2, kind: 'T' });
  pc.lines.push({ path: C.polyPath([[-bw, CH], [bw, CH]]), kind: 'yerleşim' });
  return { pc, bw, CH, cuffW };
}
function buildShirt(o) {
  const F = bodice(o, false), B = bodice(o, true);
  const armLen = P.edgeLength(F.pc.edges[2]) + P.edgeLength(B.pc.edges[2]);
  const S = sleeve(o, armLen);
  const neckHalf = P.edgeLength(F.pc.edges[0]) + P.edgeLength(B.pc.edges[0]);
  // yaka ayağı: arka ortada katlı, boy = yarım yaka çizgisi + pat (25); yükseklik 30
  const sL = neckHalf + 25;
  const stand = P.makePiece({ name: 'Yaka ayağı', qty: 2, fold: 3, edges: [
    edge('alt (bedene)', L([0, 30], [sL, 30])), edge('uç', Q([sL, 30], [sL + 6, 18], [sL - 2, 4], [sL - 14, 0])), edge('üst (yakaya)', L([sL - 14, 0], [0, 0])), edge('arka orta', L([0, 0], [0, 30]), 0),
  ], grain: [[20, 15], [sL - 40, 15]], fabric: 'ana' });
  const cL = neckHalf - 14 + 25;   // yaka: yaka ayağının üst kenarıyla aynı boy
  const collar = P.makePiece({ name: 'Yaka', qty: 2, fold: 3, edges: [
    edge('alt (yaka ayağına)', L([0, 45], [cL, 45])), edge('uç', L([cL, 45], [cL + 15, 0])), edge('dış kenar', L([cL + 15, 0], [0, 0])), edge('arka orta', L([0, 0], [0, 45]), 0),
  ], grain: [[20, 22], [cL - 40, 22]] });
  const cuffLen = o.wrist + 40;
  const cuff = P.makePiece({ name: 'Manşet', qty: 2, edges: [
    edge('üst (kola)', L([0, 0], [cuffLen, 0])), edge('uç', L([cuffLen, 0], [cuffLen, 120])), edge('alt', L([cuffLen, 120], [0, 120])), edge('uç', L([0, 120], [0, 0])),
  ], grain: [[20, 30], [cuffLen - 20, 30]], lines: [{ path: C.polyPath([[0, 60], [cuffLen, 60]]), kind: 'katlama' }], marks: [{ kind: 'iliK', p: [cuffLen - 15, 30], label: '' }, { kind: 'düğme', p: [15, 30], label: '' }] });
  const pocket = P.makePiece({ name: 'Göğüs cebi', qty: 1, edges: [
    edge('ağız', L([0, 0], [120, 0]), 30), edge('yan', L([120, 0], [120, 120])), edge('dip (sağ)', L([120, 120], [60, 140])), edge('dip (sol)', L([60, 140], [0, 120])), edge('yan', L([0, 120], [0, 0])),
  ], grain: [[60, 20], [60, 110]], lines: [{ path: C.polyPath([[0, 0], [120, 0]]), kind: 'katlama' }] });
  // yan yana yerleştir
  const place = (pc, dx, dy) => P.translatePiece(pc, dx, dy);
  const pieces = [place(F.pc, 60, 60), place(B.pc, 60 + F.W + 120, 60), place(S.pc, 60 + F.W * 2 + 240 + S.bw, 60), place(stand, 60, 60 + o.length + 120), place(collar, 60, 60 + o.length + 260), place(cuff, 60 + sL + 120, 60 + o.length + 120), place(pocket, 60 + sL + cuffLen + 220, 60 + o.length + 120)];
  const [f, b, s, st, co, cu] = pieces;
  const r = (pc, e, k) => ({ piece: pc.id, edge: e, ...(k ? { k } : {}) });
  const seams = [
    { name: 'Omuz (ön ↔ arka)', a: [r(f, 1)], b: [r(b, 1)], ease: 0, tol: 1 },
    { name: 'Yan dikiş (ön ↔ arka)', a: [r(f, 3)], b: [r(b, 3)], ease: 0, tol: 1 },
    { name: 'Kol oyuğu ↔ kol başı (bolluk)', a: [r(f, 2), r(b, 2)], b: [r(s, 0)], ease: o.capEase, tol: 2 },
    { name: 'Kol altı (ön ↔ arka)', a: [r(s, 3)], b: [r(s, 1)], ease: 0, tol: 1 },
    { name: 'Yaka çizgisi ↔ yaka ayağı (pat payı 2,5 cm)', a: [r(f, 0), r(b, 0)], b: [r(st, 0)], ease: 25, tol: 2 },
    { name: 'Yaka ayağı ↔ yaka', a: [r(st, 2)], b: [r(co, 0)], ease: 0, tol: 2 },
    { name: 'Kol ağzı ↔ manşet (pile)', a: [r(cu, 0)], b: [r(s, 2)], ease: o.pleat, tol: 2 },
  ];
  return { pieces, seams, note: 'Basitleştirilmiş gömlek temel kalıbı: kol başı eğrisi kol oyuğu + bolluk olacak şekilde hesaplandı; prova gerekir.' };
}

/* ---------- etek ---------- */
function buildSkirt(o) {
  const half = (back) => {
    // ön ve arka yan dikiş eğrileri aynı biçimde (boyları eşit): bel ve kalça farkı ±5 mm birlikte kayar
    const dart = 20, dl = back ? 130 : 90;
    const Wq = o.waist / 4 + dart + (back ? -5 : 5), Hq = (o.hip + o.hipEase) / 4 + (back ? -5 : 5), HD = o.hipDepth, Lh = o.length;
    const dx = Wq * 0.5, a = [dx - dart / 2, 0], b = [dx + dart / 2, 0], apex = [dx, dl];
    const pc = P.makePiece({ name: back ? 'Etek arka' : 'Etek ön', qty: 1, fold: 3, edges: [
      edge('bel', [L([0, 0], a), L(a, b), L(b, [Wq, 0])]),
      edge('yan dikiş', [Q([Wq, 0], [Wq + 15, HD * 0.35], [Hq, HD * 0.65], [Hq, HD]), L([Hq, HD], [Hq, Lh])]),
      edge('etek ucu', L([Hq, Lh], [0, Lh]), 40),
      edge(back ? 'arka orta' : 'ön orta', L([0, Lh], [0, 0]), 0),
    ], grain: [[Hq / 2, HD + 20], [Hq / 2, Lh - 60]], darts: [{ a, b, apex }] });
    pc.notches.push({ edge: 1, at: C.segLength(pc.edges[1].segs[0]), kind: back ? 'çift' : 'tek' });
    return pc;
  };
  const f = half(false), b = half(true);
  const bandL = o.waist + o.overlap;
  const band = P.makePiece({ name: 'Kemer', qty: 1, edges: [edge('alt (eteğe)', L([0, 80], [bandL, 80])), edge('uç', L([bandL, 80], [bandL, 0])), edge('üst', L([bandL, 0], [0, 0])), edge('uç', L([0, 0], [0, 80]))],
    grain: [[30, 40], [bandL - 30, 40]], lines: [{ path: C.polyPath([[0, 40], [bandL, 40]]), kind: 'katlama' }], marks: [{ kind: 'iliK', p: [15, 20], label: '' }, { kind: 'düğme', p: [bandL - 15, 20], label: '' }] });
  const pieces = [P.translatePiece(f, 60, 60), P.translatePiece(b, 60 + (o.hip + o.hipEase) / 4 + 140, 60), P.translatePiece(band, 60, 60 + o.length + 120)];
  const r = (pc, e, k) => ({ piece: pc.id, edge: e, ...(k ? { k } : {}) });
  const [F, B, K] = pieces;
  return { pieces, seams: [
    { name: 'Yan dikiş (ön ↔ arka)', a: [r(F, 1)], b: [r(B, 1)], ease: 0, tol: 2 },
    { name: 'Bel (2 × ön + 2 × arka, pens kapalı) ↔ kemer (kruvaze)', a: [r(F, 0, 2), r(B, 0, 2)], b: [r(K, 0)], ease: o.overlap, tol: 2 },
  ], note: 'Basitleştirilmiş düz etek temel kalıbı (ön ve arka katlı, birer pens); prova gerekir.' };
}

// Takımı projeye uygun nesneler olarak üret (kimlikler ön ekle)
export function buildSet(set, params, { idPrefix = '', product = null, size = '' } = {}) {
  const S = SETS[set]; if (!S) throw new Error('Bilinmeyen blok takımı: ' + set);
  const o = {};
  for (const [k, [lbl, v]] of Object.entries(S.params)) { const x = params?.[k] ?? v; if (!Number.isFinite(x) || x < 0 || (x === 0 && !['capEase', 'pleat', 'overlap', 'hipEase'].includes(k))) throw new Error(`${lbl} geçersiz: ${x}`); o[k] = x; }
  const r = S.build(o);
  const ids = {};
  r.pieces.forEach((pc, i) => { const nid = idPrefix + 'pc' + (i + 1); ids[pc.id] = nid; pc.id = nid; pc.product = product; pc.size = size; });
  r.seams = r.seams.map((sm, i) => ({ id: idPrefix + 'sm' + (i + 1), ...sm, a: sm.a.map((x) => ({ ...x, piece: ids[x.piece] })), b: sm.b.map((x) => ({ ...x, piece: ids[x.piece] })) }));
  r.params = o;
  return r;
}
