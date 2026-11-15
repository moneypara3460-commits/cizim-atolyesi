// Ayakkabı Modelhanesi — proje veri modeli (Aşama 1). Saf modül: DOM ve depolama yok.
// Birim: mm. Koordinat: y aşağı (ekran gibi); DXF'e yazarken y çevrilir.
// Proje şeması sürümlüdür (schema); eski kayıtlar migrate() ile yükseltilir.
import { uid, node, makePath, clone, isP, edges, edgeStarts } from './geom.js?v=20261115g';

export const SCHEMA = 1;
export const KIND = 'cizim.ayakkabi';

/* ---------- sözlükler ---------- */
export const SHOE_TYPES = ['Klasik bağcıklı (Oxford)', 'Derby', 'Makosen / Loafer', 'Spor / Sneaker', 'Bot', 'Çizme', 'Sandalet', 'Babet', 'Terlik', 'Çocuk ayakkabısı', 'Diğer'];
export const METHODS = {
  sementli: 'Sementli (yapıştırma)', strobel: 'Strobel (çevirme dikiş)', goodyear: 'Goodyear', blake: 'Blake', enjeksiyon: 'Enjeksiyon taban', vulkanize: 'Vulkanize', diger: 'Diğer',
};
export const SIDES = { sag: 'Sağ', sol: 'Sol', cift: 'Sağ + sol (çift)' };
export const PIECE_KINDS = ['Ön saya', 'Burun parçası', 'Yan saya', 'Arka saya', 'Dil', 'Saya astarı', 'Takviye', 'Topuk takviyesi', 'Bağcık kuşağı', 'Diğer'];

// Pay türleri: her kenara YALNIZ BİR tür atanır; değerler parça bazında ayrı tutulur → türler karışmaz.
export const ALLOW = {
  dikis:   { name: 'Dikiş payı',          op: 'Ters / kapalı dikişle birleşen kenar (arka dikiş, astar dikişi)' },
  binme:   { name: 'Binme payı',          op: 'Üstteki parçanın altına giren bindirme kenarı (üstten dikilir)' },
  katlama: { name: 'Katlama payı',        op: 'Kenar kıvırma (katlama) ile bitirilen kenar' },
  kenar:   { name: 'Kenar bitirme payı',  op: 'Ham / boyalı / yakmalı bitirilen kenar (çoğunlukla 0)' },
  montaj:  { name: 'Montaj payı',         op: 'Kalıba çekme (lasting) payı — tabana bağlanan alt kenar' },
  yok:     { name: 'Pay yok',             op: 'Net çizgi kesim çizgisidir' },
};
export const ALLOW_KEYS = ['dikis', 'binme', 'katlama', 'kenar', 'montaj'];
export const CORNERS = { miter: 'Sivri (uzatma)', square: 'Dik (bloklu)', bevel: 'Pah' };

// Katmanlar (A–K + yardımcılar). dash: mm cinsinden desen (boş = düz). DXF adı ASCII.
export const LAYERS = [
  { id: 'kesim',    name: 'Dış kesim çizgisi',                 dxf: 'KESIM',       aci: 7, color: '#f1f5f9', width: 0.35, dash: [] },
  { id: 'net',      name: 'Net stampa çizgisi',                dxf: 'NET',         aci: 8, color: '#64748b', width: 0.18, dash: [] },
  { id: 'dikis',    name: 'Dikiş çizgisi',                     dxf: 'DIKIS',       aci: 4, color: '#22d3ee', width: 0.25, dash: [2, 1.2] },
  { id: 'binme',    name: 'Binme payı çizgisi',                dxf: 'BINME',       aci: 30, color: '#fb923c', width: 0.25, dash: [4, 2] },
  { id: 'montaj',   name: 'Montaj (kalıba çekme) çizgisi',     dxf: 'MONTAJ',      aci: 6, color: '#d946ef', width: 0.25, dash: [6, 2, 1, 2] },
  { id: 'binmeNok', name: 'Binme noktaları',                   dxf: 'BINME_NOKTA', aci: 30, color: '#fdba74', width: 0.25, dash: [] },
  { id: 'centik',   name: 'Çentikler ve eşleştirme işaretleri', dxf: 'CENTIK',     aci: 1, color: '#ff3b30', width: 0.3, dash: [] },
  { id: 'katlama',  name: 'Katlama ve kıvırma çizgileri',      dxf: 'KATLAMA',     aci: 3, color: '#22c55e', width: 0.25, dash: [5, 1.5, 1, 1.5] },
  { id: 'merkez',   name: 'Merkez çizgileri',                  dxf: 'MERKEZ',      aci: 5, color: '#60a5fa', width: 0.18, dash: [8, 2, 2, 2] },
  { id: 'referans', name: 'Referans noktaları',                dxf: 'REFERANS',    aci: 2, color: '#facc15', width: 0.25, dash: [] },
  { id: 'delik',    name: 'Delik ve aksesuar işaretleri',      dxf: 'DELIK',       aci: 140, color: '#a78bfa', width: 0.25, dash: [] },
  { id: 'olcu',     name: 'Ölçülendirme çizgileri',            dxf: 'OLCU',        aci: 9, color: '#cbd5e1', width: 0.15, dash: [] },
  { id: 'yazi',     name: 'Parça numaraları ve açıklamalar',   dxf: 'YAZI',        aci: 7, color: '#e2e8f0', width: 0.2, dash: [] },
  { id: 'yardimci', name: 'Stampa yardımcı çizgileri',         dxf: 'YARDIMCI',    aci: 8, color: '#94a3b8', width: 0.18, dash: [] },
];
export const LAYER = Object.fromEntries(LAYERS.map((l) => [l.id, l]));
export const LINE_TYPES = { duz: { name: 'Düz', dash: [] }, kesik: { name: 'Kesik', dash: [4, 2] }, nokta: { name: 'Noktalı', dash: [0.6, 1.4] }, eksen: { name: 'Eksen (çizgi-nokta)', dash: [8, 2, 2, 2] }, ince: { name: 'Kısa kesik', dash: [2, 1.2] } };
export const MARK_KINDS = {
  centik:   { name: 'Çentik',          layer: 'centik' },
  binme:    { name: 'Binme noktası',   layer: 'binmeNok' },
  delik:    { name: 'Delik',           layer: 'delik' },
  aksesuar: { name: 'Aksesuar işareti', layer: 'delik' },
  referans: { name: 'Referans noktası', layer: 'referans' },
};
export const LINE_KINDS = { katlama: { name: 'Katlama çizgisi', layer: 'katlama' }, kivirma: { name: 'Kıvırma çizgisi', layer: 'katlama' }, merkez: { name: 'Merkez çizgisi', layer: 'merkez' }, dikis: { name: 'Serbest dikiş çizgisi', layer: 'dikis' }, yardimci: { name: 'Yardımcı çizgi', layer: 'yardimci' } };

/* ---------- malzeme ---------- */
// Kalınlıklar atölyelerde yaygın başlangıç değerleridir (tahmini); kullanıcı kendi malzemesine göre düzeltir.
export const DEFAULT_MATERIALS = [
  { id: 'm-deri',    name: 'Deri (sığır, saya)',  type: 'deri',    thickness: 1.4, stretchDir: 'en',         stretchPct: { boy: 8, en: 15 }, desc: 'Sırt bölgesi en az esner; esneme çoğunlukla belden karına doğru.' },
  { id: 'm-suet',    name: 'Süet',                type: 'suet',    thickness: 1.2, stretchDir: 'en',         stretchPct: { boy: 10, en: 18 }, desc: 'Ters yüzü işlenmiş deri; kenar katlamaya uygun değildir, çoğunlukla ham kenar.' },
  { id: 'm-nubuk',   name: 'Nubuk',               type: 'nubuk',   thickness: 1.4, stretchDir: 'en',         stretchPct: { boy: 8, en: 14 }, desc: 'Yüzü zımparalanmış deri.' },
  { id: 'm-suni',    name: 'Suni deri (PU)',      type: 'suni',    thickness: 1.1, stretchDir: 'en',         stretchPct: { boy: 5, en: 12 }, desc: 'Örme / dokuma taban üzeri PU; esneme yönü taban kumaşına bağlı.' },
  { id: 'm-tekstil', name: 'Tekstil (dokuma)',    type: 'tekstil', thickness: 0.8, stretchDir: 'capraz',     stretchPct: { boy: 2, en: 4 },  desc: 'Dokuma kumaş; verev (çapraz) yönde esner.' },
  { id: 'm-orgu',    name: 'Örgü kumaş (mesh / knit)', type: 'orgu', thickness: 1.5, stretchDir: 'iki',      stretchPct: { boy: 25, en: 40 }, desc: 'Örme saya kumaşı; iki yönde esner, takviye ister.' },
  { id: 'm-astar',   name: 'Astar (deri / tekstil)', type: 'astar', thickness: 0.8, stretchDir: 'en',        stretchPct: { boy: 5, en: 10 }, desc: 'Saya astarı; topuk bölgesinde aşınma dayanımı önemli.' },
];
export const MATERIAL_TYPES = { deri: 'Deri', suet: 'Süet', nubuk: 'Nubuk', suni: 'Suni deri', tekstil: 'Tekstil', orgu: 'Örgü kumaş', astar: 'Astar', diger: 'Diğer' };
export const STRETCH_DIRS = { boy: 'Boy yönünde', en: 'En yönünde', capraz: 'Çapraz (verev)', iki: 'İki yönlü', yok: 'Esnemez' };
export function makeMaterial(o = {}) {
  return { id: o.id || uid('m'), name: String(o.name || 'Yeni malzeme').slice(0, 80), type: MATERIAL_TYPES[o.type] ? o.type : 'diger', thickness: num(o.thickness, 1), stretchDir: STRETCH_DIRS[o.stretchDir] ? o.stretchDir : 'yok', stretchPct: { boy: num(o.stretchPct?.boy, 0), en: num(o.stretchPct?.en, 0) }, desc: String(o.desc || '').slice(0, 500), builtin: !!o.builtin };
}
export function validateMaterial(m) {
  const out = [];
  if (!String(m.name || '').trim()) out.push('Malzeme adı boş');
  if (!(m.thickness > 0 && m.thickness <= 20)) out.push('Kalınlık 0–20 mm arasında olmalı');
  for (const k of ['boy', 'en']) if (!(m.stretchPct?.[k] >= 0 && m.stretchPct[k] <= 300)) out.push('Esneme oranı 0–300 % olmalı');
  return out;
}
function num(v, d) { const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : v; return Number.isFinite(n) ? n : d; }

/* ---------- pay önerisi (otomatik) ---------- */
// Atölye başlangıç değerleri (mm). Kural: malzeme kalınlığı t ve üretim yöntemi. Kullanıcı elle değiştirebilir.
export function suggestAllowances(t = 1.2, method = 'sementli') {
  const m = { sementli: 16, strobel: 6, goodyear: 19, blake: 15, enjeksiyon: 15, vulkanize: 15, diger: 15 }[method] ?? 15;
  return {
    dikis: round1(1.2 + 0.6 * t),            // ters dikiş: dikiş mesafesi + kalınlık etkisi
    binme: t > 1.6 ? 10 : 8,                 // bindirme genişliği
    katlama: round1(Math.max(3.5, 2.5 + 1.5 * t)), // katlanan kenar: kalınlık arttıkça artar
    kenar: 0,
    montaj: m,                               // kalıba çekme (yöntem bağımlı)
  };
}
const round1 = (v) => Math.round(v * 10) / 10;

/* ---------- kampre / form verme altyapısı (Aşama 5 hesapları için veri; burada hesap yok) ---------- */
export const FORM_REGIONS = ['Burun', 'Vamp (ön saya)', 'İç yan', 'Dış yan', 'Topuk', 'Üst ağız (bilek)', 'Dil', 'Diğer'];
export function makeForming(o = {}) {
  return {
    kampre: { onMm: nn(o.kampre?.onMm), arkaMm: nn(o.kampre?.arkaMm), not: str(o.kampre?.not) },   // ön / arka kampre
    onForm: { payMm: nn(o.onForm?.payMm), yontem: str(o.onForm?.yontem), not: str(o.onForm?.not) },  // ön form verme
    arkaForm: { payMm: nn(o.arkaForm?.payMm), yontem: str(o.arkaForm?.yontem), not: str(o.arkaForm?.not) },
    esneme: { yonDeg: nn(o.esneme?.yonDeg), not: str(o.esneme?.not) },   // parça üzerinde ana esneme yönü (derece: 0° sağ, 90° yukarı)
    kalinlikMm: nn(o.kalinlikMm),                                          // boşsa malzemeden
    bolgesel: (o.bolgesel || []).map((b) => ({ bolge: str(b.bolge), payMm: nn(b.payMm), not: str(b.not) })),
    kalibaCekme: { payMm: nn(o.kalibaCekme?.payMm), gerdirmePct: nn(o.kalibaCekme?.gerdirmePct), yon: str(o.kalibaCekme?.yon), not: str(o.kalibaCekme?.not) },
  };
}
const nn = (v) => { const n = num(v, null); return n === null || n === '' ? null : n; };
const str = (v) => String(v ?? '').slice(0, 300);

/* ---------- parça ---------- */
export function makePiece(o = {}) {
  const outline = o.outline || makePath([], true);
  return {
    id: o.id || uid('pc'), no: o.no ?? 1, name: String(o.name || 'Parça').slice(0, 80), code: String(o.code || '').slice(0, 40), kind: o.kind || 'Diğer',
    side: SIDES[o.side] ? o.side : 'cift', qty: Math.max(1, Math.round(num(o.qty, 1))), material: o.material || null,
    outline, edges: o.edges || {}, allow: { ...suggestAllowances(), ...(o.allow || {}) }, allowAuto: { dikis: true, binme: true, katlama: true, kenar: true, montaj: true, ...(o.allowAuto || {}) },
    marks: o.marks || [], lines: o.lines || [], dims: o.dims || [], texts: o.texts || [], notes: String(o.notes || ''),
    forming: makeForming(o.forming || {}), autoDims: o.autoDims ?? true,
  };
}
// kenar özelliği (yoksa varsayılan)
export function edgeProp(pc, edgeId) {
  const e = pc.edges[edgeId] || {};
  return { name: e.name || '', kind: ALLOW[e.kind] ? e.kind : 'kenar', corner: CORNERS[e.corner] ? e.corner : 'miter', stitch: { on: !!e.stitch?.on, dist: num(e.stitch?.dist, 1.5), rows: Math.min(4, Math.max(1, Math.round(num(e.stitch?.rows, 1)))), gap: num(e.stitch?.gap, 2.5), from: num(e.stitch?.from, 0), to: num(e.stitch?.to, 0) } };
}
export function setEdgeProp(pc, edgeId, patch) { const cur = edgeProp(pc, edgeId); pc.edges[edgeId] = { ...cur, ...patch, stitch: { ...cur.stitch, ...(patch.stitch || {}) } }; }
export function allowValue(pc, kind) { return kind === 'yok' ? 0 : Math.max(0, num(pc.allow?.[kind], 0)); }
// otomatik işaretli payları malzeme / yönteme göre yeniden hesapla
export function refreshAutoAllowances(pc, material, method) {
  const s = suggestAllowances(material?.thickness ?? 1.2, method);
  for (const k of ALLOW_KEYS) if (pc.allowAuto[k] !== false) pc.allow[k] = s[k];
}
// kenar başları değişince (düğüm silme vb.) artık olmayan kenar kayıtlarını temizle
export function pruneEdges(pc) {
  const live = new Set(edges(pc.outline).map((e) => e.id));
  for (const k of Object.keys(pc.edges)) if (!live.has(k)) delete pc.edges[k];
  pc.marks = pc.marks.filter((m) => !m.edge || live.has(m.edge));
}

/* ---------- kalıp ve model resmi ---------- */
// Kalıp: yan ve alt (taban) görünüşünün fotoğraftan çıkarılmış ölçülü çizgisi + düzeltilmiş fotoğraf.
// view: { img: data:image/jpeg…, k: mm başına piksel, w, h: görüntü pikseli, paper, outline: kapalı yol (mm, sol üst 0,0),
//         imgAt: görüntünün çizgiye göre konumu (mm), at: stampadaki konum (mm), length, height, sens, scale }
export const LAST_VIEWS = { yan: 'Kalıp dış yan görünüşü', ic: 'Kalıp iç yan görünüşü', alt: 'Kalıp alt görünüşü (taban)', ust: 'Kalıp üst görünüşü' };
export const PAPER_SIZES = { A4: 'A4 (297 × 210 mm)', A3: 'A3 (420 × 297 mm)', MAT: 'Kesim matı (10 mm kareli, kâğıtsız)' };
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const fin = (v, d = null) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : d);
export function makeLastView(v) {
  if (!v || typeof v.img !== 'string' || !IMG_RE.test(v.img) || !okPath(v.outline) || v.outline.nodes.length < 3) return null;
  return {
    img: v.img, k: fin(v.k, 3) > 0 ? +v.k : 3, w: Math.max(1, Math.round(fin(v.w, 1))), h: Math.max(1, Math.round(fin(v.h, 1))),
    paper: PAPER_SIZES[v.paper] ? v.paper : 'A4', outline: { ...v.outline, closed: true },
    imgAt: isP(v.imgAt) ? v.imgAt : [0, 0], at: isP(v.at) ? v.at : [0, 0],
    length: fin(v.length, 0), height: fin(v.height, 0), sens: Math.max(-5, Math.min(5, Math.round(fin(v.sens, 0)))), scale: fin(v.scale, 1) > 0 ? +v.scale : 1,
  };
}
export function makeLast(o = {}) {
  const L = fin(o.lengthMm);
  return {
    name: String(o.name || '').slice(0, 80), lengthMm: L > 0 && L < 600 ? L : null, paper: PAPER_SIZES[o.paper] ? o.paper : 'A4',
    views: Object.fromEntries(Object.keys(LAST_VIEWS).map((id) => [id, makeLastView(o.views?.[id])])),
  };
}
export const MAX_MODEL_PHOTOS = 6;
// Kalıptan otomatik parça ayarları (hesap ayk/auto.js'de). pieceIds: bu ayarla oluşturulmuş parçalar (yeniden oluşturulunca değiştirilir)
export const AUTO_TYPES = ['derby', 'oxford', 'loafer', 'spor'];
export function makeAuto(a = {}) {
  const params = {};
  if (a && a.params && typeof a.params === 'object') for (const [k, v] of Object.entries(a.params).slice(0, 16)) if (/^[a-zA-Z]{1,12}$/.test(k) && (typeof v === 'boolean' || Number.isFinite(v))) params[k] = v;
  return {
    type: AUTO_TYPES.includes(a?.type) ? a.type : '',
    flipX: typeof a?.flipX === 'boolean' ? a.flipX : null, flipY: typeof a?.flipY === 'boolean' ? a.flipY : null,
    params, pieceIds: Array.isArray(a?.pieceIds) ? a.pieceIds.filter((x) => typeof x === 'string').slice(0, 20) : [],
  };
}
export function makeModelRef(o = {}) {
  return {
    photos: (Array.isArray(o.photos) ? o.photos : []).filter((ph) => ph && typeof ph.img === 'string' && IMG_RE.test(ph.img)).slice(0, MAX_MODEL_PHOTOS)
      .map((ph) => ({ id: typeof ph.id === 'string' ? ph.id.slice(0, 40) : uid('ph'), img: ph.img, name: String(ph.name || '').slice(0, 80) })),
    note: String(o.note || '').slice(0, 500),
    auto: makeAuto(o.auto),
    ai: makeAiParts(o.ai),
  };
}
// görünüşler varsayılan olarak alt alta yerleşir (fotoğraflar üst üste binmesin: aralarında 15 mm)
export function placeLastViews(last) {
  let prev = null;
  for (const id of Object.keys(LAST_VIEWS)) {
    const v = last.views[id]; if (!v) continue;
    if (prev && v.at[0] === 0 && v.at[1] === 0) v.at = [prev.at[0], +(prev.at[1] + prev.imgAt[1] + prev.h / prev.k + 15 - v.imgAt[1]).toFixed(3)];
    prev = v;
  }
  return last;
}
// Yapay zekânın modelden çıkardığı parçalar (hesap ayk/aiparts.js). Koordinatlar kalıba göre yüzde:
// x: topuk arkasından burna mm, y: taban çizgisinden yukarı mm (dış yan görünüş).
const AI_KINDS = ['ust', 'astar', 'takviye'];
export function makeAiParts(o) {
  if (!o || !Array.isArray(o.pieces) || !o.pieces.length) return null;
  const num = (v, lo, hi) => (Number.isFinite(+v) ? Math.max(lo, Math.min(hi, +v)) : null);
  const pt = (q) => (Array.isArray(q) && num(q[0], -10, 460) !== null && num(q[1], -10, 600) !== null ? [+num(q[0], -10, 460).toFixed(2), +num(q[1], -10, 600).toFixed(2)] : null);
  const pieces = o.pieces.slice(0, 40).map((p) => ({
    name: String(p?.name || 'Parça').replace(/[<>]/g, '').slice(0, 40),
    kind: AI_KINDS.includes(p?.kind) ? p.kind : 'ust',
    layer: Math.round(num(p?.layer, 0, 9) ?? 0),
    poly: (Array.isArray(p?.poly) ? p.poly : []).map(pt).filter(Boolean).slice(0, 60),
    holes: (Array.isArray(p?.holes) ? p.holes : []).map(pt).filter(Boolean).slice(0, 24),
    holeD: num(p?.holeD, 2, 12) ?? 5,
    note: String(p?.note || '').replace(/[<>]/g, '').slice(0, 120),
  })).filter((p) => p.poly.length >= 3);
  if (!pieces.length) return null;
  return {
    pieces, model: String(o.model || '').replace(/[<>]/g, '').slice(0, 160),
    confidence: ['high', 'medium', 'low'].includes(o.confidence) ? o.confidence : 'low',
    pieceIds: Array.isArray(o.pieceIds) ? o.pieceIds.filter((x) => typeof x === 'string').slice(0, 120) : [],
    flipX: typeof o.flipX === 'boolean' ? o.flipX : null, flipY: typeof o.flipY === 'boolean' ? o.flipY : null,
    lining: o.lining !== false, stiff: o.stiff !== false,
  };
}

/* ---------- proje ---------- */
export function defaultLayers() { return Object.fromEntries(LAYERS.map((l) => [l.id, { visible: true, color: l.color, width: l.width, type: null }])); }
export function createProject(o = {}, now = Date.now()) {
  return {
    kind: KIND, schema: SCHEMA, id: o.id || 'ay' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    name: String(o.name || 'Yeni model').slice(0, 80), code: String(o.code || '').slice(0, 40), shoeType: o.shoeType || SHOE_TYPES[0],
    side: SIDES[o.side] ? o.side : 'cift', size: String(o.size ?? '40').slice(0, 10), sizeSystem: o.sizeSystem || 'EU',
    material: o.material || null, method: METHODS[o.method] ? o.method : 'sementli', desc: String(o.desc || '').slice(0, 2000),
    created: now, modified: now, rev: 0, revisions: [],
    layers: defaultLayers(), sketch: { paths: [] }, pieces: [], matches: [], materials: [],
    view: null,
    last: makeLast(o.last), modelRef: makeModelRef(o.modelRef),
    // Gelecek aşamalar için ayrılmış alanlar. Bu aşamada hiçbiri hesaplanmaz / gösterilmez (bkz. docs/AYAKKABI.md).
    future: { last3d: null, scan: null, photoAI: null, unfold: null, graphics: [], grading: null, nesting: null },
  };
}
export function nextPieceNo(p) { return p.pieces.reduce((m, q) => Math.max(m, q.no || 0), 0) + 1; }

// eski / dış kayıtları güvenli biçime getir (bozuk alanlar atılır, proje açılır)
export function migrate(input) {
  const p = typeof input === 'string' ? JSON.parse(input) : clone(input);
  if (!p || p.kind !== KIND) throw new Error('Bu dosya bir Ayakkabı Modelhanesi projesi değil');
  if ((p.schema || 0) > SCHEMA) throw new Error('Proje daha yeni bir sürümle kaydedilmiş (şema ' + p.schema + ')');
  const base = createProject({ ...p, id: p.id }, p.created || Date.now());
  const out = { ...base, ...p, schema: SCHEMA };
  out.layers = { ...defaultLayers(), ...(p.layers || {}) };
  for (const id of Object.keys(out.layers)) if (!LAYER[id]) delete out.layers[id];
  out.sketch = { paths: (p.sketch?.paths || []).filter(okPath) };
  out.pieces = (p.pieces || []).filter((q) => q && okPath(q.outline)).map((q) => makePiece(q));
  out.matches = (p.matches || []).filter((m) => m && m.a && m.b);
  out.materials = (p.materials || []).map(makeMaterial);
  out.future = { ...base.future, ...(p.future || {}) };
  out.last = makeLast(p.last); out.modelRef = makeModelRef(p.modelRef);
  return out;
}
const okPath = (np) => np && Array.isArray(np.nodes) && np.nodes.every((n) => n && isP(n.p) && (!n.i || isP(n.i)) && (!n.o || isP(n.o)));

/* ---------- proje doğrulaması (parça geometrisi ayrı: match.js) ---------- */
export function validateProject(p) {
  const out = [];
  if (!String(p.name || '').trim()) out.push({ level: 'hata', msg: 'Proje adı boş' });
  const codes = new Map();
  for (const q of p.pieces) { if (q.code) { if (codes.has(q.code)) out.push({ level: 'uyarı', msg: `Parça kodu tekrar ediyor: ${q.code}` }); codes.set(q.code, 1); } }
  return out;
}
export { edgeStarts, node };

/* ---------- parça işlemleri (editör ve parça sayfası ortak) ---------- */
import { transform as tfPath, cloneNew, rp as roundP } from './geom.js?v=20261115g';
// afin dönüşüm: sınır, iç çizgiler, serbest işaretler, ölçüler, yazılar. Kenar üzerindeki işaretler kenarla birlikte gider.
export function transformPiece(pc, f) {
  tfPath(pc.outline, f);
  for (const l of pc.lines) tfPath(l.path, f);
  for (const m of pc.marks) if (!m.edge && isP(m.p)) m.p = roundP(f(m.p));
  for (const d of pc.dims) { if (isP(d.a)) d.a = roundP(f(d.a)); if (isP(d.b)) d.b = roundP(f(d.b)); }
  for (const t of pc.texts) if (isP(t.p)) t.p = roundP(f(t.p));
  return pc;
}
// aynada kenar yönü tersine döner: ölçü ötelemesinin işareti de döner
export function mirrorPiece(pc, x0) {
  transformPiece(pc, (p) => [2 * x0 - p[0], p[1]]);
  for (const d of pc.dims) d.off = -(d.off ?? 6);
  if (pc.side === 'sag') pc.side = 'sol'; else if (pc.side === 'sol') pc.side = 'sag';
  if (Number.isFinite(pc.forming?.esneme?.yonDeg)) pc.forming.esneme.yonDeg = 180 - pc.forming.esneme.yonDeg;
  return pc;
}
// yeni kimliklerle kopya (kenar özellikleri ve kenar işaretleri yeni düğüm kimliklerine taşınır)
export function copyPiece(pc, no) {
  const c = clone(pc), map = {};
  c.id = uid('pc'); c.no = no; c.outline = cloneNew(pc.outline, map);
  c.edges = Object.fromEntries(Object.entries(pc.edges).filter(([k]) => map[k]).map(([k, v]) => [map[k], clone(v)]));
  c.marks = pc.marks.map((m) => ({ ...clone(m), id: uid('mk'), edge: m.edge ? map[m.edge] : undefined }));
  c.lines = pc.lines.map((l) => ({ ...clone(l), id: uid('ln'), path: cloneNew(l.path) }));
  c.code = pc.code ? pc.code + '-K' : ''; c.name = pc.name + ' (kopya)';
  return c;
}
export function removePiece(project, id) {
  project.pieces = project.pieces.filter((q) => q.id !== id);
  project.matches = project.matches.filter((m) => m.a?.piece !== id && m.b?.piece !== id);
}
