// Tekstil ve Moda — proje veri modeli (Aşama 1: ortak altyapı).
// Saf modül: DOM yok, depolama yok; Node testlerinde doğrudan çalışır.
// İç birim mm (uzunluk), g/m² (gramaj), % (oran). Ekranda cm gösterimi arayüzün işidir.
// Dokuma / konfeksiyon ve triko ayrı alt şemalardır (woven, knit); yalnız koleksiyon, ürün, renk, beden,
// malzeme, föy ve revizyon ortaktır. Bkz. docs/TEKSTIL-MIMARI.md

import { createSketch, validateSketch, TEMPLATES } from './drawing.js?v=20261112j';
import { validatePiece, seamCheck, makePiece, edgesFromPoints } from './woven/pattern.js?v=20261112j';
import { buildSet } from './woven/blocks.js?v=20261112j';
import { gradeGroup } from './woven/grade.js?v=20261112j';
import { fromTemplate, validateChart } from './knit/chart.js?v=20261112j';
import { validateSwatch, computePiece, KNIT_PIECES } from './knit/shape.js?v=20261112j';
import { PRESETS, presetEstimated, wovenConsumption, knitStitchTotal, yarnConsumption } from './materials.js?v=20261112j';
import { evaluate as evalMarker, makeMarker } from './woven/marker.js?v=20261112j';
import { fromTemplate as machineFromTemplate, machineStatus } from './knit/machine.js?v=20261112j';
import { drapeVerdict } from './sim3d/drape.js?v=20261112j';
import { templateOps, validateOps, costSheet, orderRequirement } from './production.js?v=20261112j';

export const KIND = 'cizim.textile';
export const SCHEMA = 1;

export const PROJECT_TYPES = {
  woven: { label: 'Dokuma / Konfeksiyon', branches: ['woven'] },
  knit: { label: 'Triko / Örgü', branches: ['knit'] },
  mixed: { label: 'Karma Koleksiyon', branches: ['woven', 'knit'] },
};
export const BRANCHES = { woven: 'Dokuma / Konfeksiyon', knit: 'Triko / Örgü' };

// Ürün türleri dala göre. "diğer" serbest ad ister.
export const PRODUCT_TYPES = {
  woven: { tisort: 'Tişört', gomlek: 'Gömlek', pantolon: 'Pantolon', ceket: 'Ceket', elbise: 'Elbise', etek: 'Etek', mont: 'Mont', diger: 'Diğer' },
  knit: { kazak: 'Kazak', hirka: 'Hırka', suveter: 'Süveter', yelek: 'Yelek', atki: 'Atkı', bere: 'Bere', diger: 'Diğer' },
};

// Malzeme türleri: kumaş (dokuma / konfeksiyon), iplik (triko), aksesuar (ikisi).
// Alanlar: [anahtar, etiket, birim, tür]. null = bilinmiyor (uydurulmaz).
export const MATERIAL_KINDS = {
  fabric: {
    label: 'Kumaş', branches: ['woven'],
    fields: [
      ['composition', 'Elyaf içeriği', '', 'text'], ['construction', 'Yapı (dokuma / örme kumaş)', '', 'text'],
      ['width', 'En', 'mm', 'num'], ['gsm', 'Gramaj', 'g/m²', 'num'], ['thickness', 'Kalınlık', 'mm', 'num'],
      ['shrinkWarp', 'Çekme (boy)', '%', 'pct'], ['shrinkWeft', 'Çekme (en)', '%', 'pct'],
      ['stretchWarp', 'Esneme (boy)', '%', 'pct'], ['stretchWeft', 'Esneme (en)', '%', 'pct'],
      ['nap', 'Havlı / yönlü', '', 'bool'], ['repeatW', 'Desen raporu en', 'mm', 'num'], ['repeatH', 'Desen raporu boy', 'mm', 'num'],
      ['bendEff', 'Etkin eğilme (benzetim modeli)', 'μN·m', 'num'], ['drapeRef', 'Ölçülen dökümlülük katsayısı (Cusick, referans numune)', '0–1', 'num'], ['drapeRef2', 'İkinci bağımsız ölçüm (başka numune)', '0–1', 'num'],
    ],
    priceUnit: 'm',
  },
  yarn: {
    label: 'İplik', branches: ['knit'],
    fields: [
      ['fiber', 'Elyaf içeriği (ör. %70 yün %30 akrilik)', '', 'text'], ['countSystem', 'Numara sistemi', '', 'count'],
      ['count', 'İplik numarası', '', 'num'], ['ply', 'Kat sayısı', '', 'int'], ['twist', 'Büküm', 'tur/m', 'num'],
      ['twistDir', 'Büküm yönü (S / Z)', '', 'text'],
    ],
    priceUnit: 'kg',
  },
  trim: {
    label: 'Aksesuar', branches: ['woven', 'knit'],
    fields: [['trimType', 'Tür (düğme, fermuar, tela, lastik, dikiş ipliği…)', '', 'text'], ['size', 'Ölçü', '', 'text']],
    priceUnit: 'adet',
  },
};
export const COUNT_SYSTEMS = ['Nm', 'Ne', 'tex', 'dtex', 'den'];
const PRICE_UNITS = ['m', 'm²', 'kg', 'adet', 'top', 'makara'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clone = (o) => JSON.parse(JSON.stringify(o));
const str = (v) => (typeof v === 'string' ? v.trim() : '');

/* ---------- oluşturma ---------- */
export function createProject({ name, type, season = '', brand = '', now = Date.now() } = {}) {
  if (!PROJECT_TYPES[type]) throw new Error('Bilinmeyen proje türü: ' + type);
  if (!str(name)) throw new Error('Proje adı gerekli');
  const p = {
    kind: KIND, schema: SCHEMA, type, id: 'tx' + now.toString(36) + Math.floor(Math.random() * 1e6).toString(36),
    name: str(name), created: now, modified: now, rev: 0, nextId: 1, units: 'mm',
    collection: { season: str(season), brand: str(brand), products: [] },
    library: { colors: [], materials: [] },
    sizeTables: [],
    sketches: [],
    revisions: [],
  };
  if (PROJECT_TYPES[type].branches.includes('woven')) p.woven = emptyBranch('woven');
  if (PROJECT_TYPES[type].branches.includes('knit')) p.knit = emptyBranch('knit');
  return p;
}
// Dal özel alanları: sonraki aşamalarda doldurulur (kalıp, yerleşim / örgü deseni, numune, makine profili)
function emptyBranch(b) { return b === 'woven' ? { pieces: [], markers: [], seams: [] } : { swatches: [], charts: [], pieces: [], machines: [] }; }
const nid = (p, pre) => pre + p.nextId++;

export function addColor(p, { name, code = '', hex = '#888888' }) {
  if (!str(name)) throw new Error('Renk adı gerekli');
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('Renk kodu #RRGGBB olmalı');
  const c = { id: nid(p, 'c'), name: str(name), code: str(code), hex: hex.toLowerCase() };
  p.library.colors.push(c); return c;
}

export function addSizeTable(p, { name, source, sizes = [], measures = {} }) {
  if (!str(name)) throw new Error('Tablo adı gerekli');
  const t = { id: nid(p, 's'), name: str(name), source: str(source), sizes: sizes.map(str).filter(Boolean), measures: clone(measures) };
  p.sizeTables.push(t); return t;
}
// Örnek tablo: kaynağı "örnek" olarak yazılır, standart gibi sunulmaz. Değerler mm.
export function exampleSizeTable(p, branch = 'woven') {
  const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
  const row = (a, step) => Object.fromEntries(sizes.map((s, i) => [s, a + step * (i - 2)]));
  return addSizeTable(p, {
    name: branch === 'knit' ? 'Örnek triko tablosu' : 'Örnek beden tablosu', source: 'Örnek — standart değildir; kendi ölçülerinle değiştir',
    sizes, measures: { 'Göğüs çevresi': row(960, 40), 'Bel çevresi': row(800, 40), 'Kalça çevresi': row(1000, 40), 'Boy': row(1680, 20) },
  });
}

export function addMaterial(p, kind, data = {}) {
  const K = MATERIAL_KINDS[kind];
  if (!K) throw new Error('Bilinmeyen malzeme türü: ' + kind);
  if (!str(data.name)) throw new Error('Malzeme adı gerekli');
  const m = { id: nid(p, 'm'), kind, name: str(data.name), supplier: str(data.supplier), stock: null, price: null, priceUnit: K.priceUnit, estimated: [], props: {} };
  for (const [k] of K.fields) m.props[k] = data.props && k in data.props ? data.props[k] : null;
  if (data.price != null) m.price = data.price;
  if (data.priceUnit) m.priceUnit = data.priceUnit;
  if (data.estimated) m.estimated = [...data.estimated];
  p.library.materials.push(m); return m;
}

const emptyCosting = () => ({ minuteRate: null, efficiency: null, overheadPct: null, marginPct: null, vatPct: null, wastePct: null, currency: 'TL' });
export function addProduct(p, { branch, type, name, modelCode = '', season = '' }) {
  if (!PROJECT_TYPES[p.type].branches.includes(branch)) throw new Error(`${PROJECT_TYPES[p.type].label} projesine ${BRANCHES[branch] || branch} ürünü eklenemez`);
  if (!PRODUCT_TYPES[branch][type]) throw new Error('Bu dalda böyle bir ürün türü yok: ' + type);
  const pr = {
    id: nid(p, 'p'), branch, type, name: str(name) || PRODUCT_TYPES[branch][type], modelCode: str(modelCode), season: str(season),
    colors: [], sizeTable: null, sizes: [], materials: [], techpack: { status: 'taslak', notes: '', ops: [] }, costing: emptyCosting(), order: {},
  };
  p.collection.products.push(pr); return pr;
}
// Ürüne malzeme bağla. role: ana | astar | yardımcı | aksesuar. qty: ürün başına miktar (birimi malzemenin fiyat birimi), bilinmiyorsa null.
export function linkMaterial(p, productId, materialId, role = 'ana', qty = null) {
  const pr = p.collection.products.find((x) => x.id === productId), m = p.library.materials.find((x) => x.id === materialId);
  if (!pr || !m) throw new Error('Ürün ya da malzeme bulunamadı');
  const e = materialRuleError(pr, m, role);
  if (e) throw new Error(e);
  pr.materials.push({ mat: m.id, role, qty }); return pr;
}
function materialRuleError(pr, m, role) {
  if (!MATERIAL_KINDS[m.kind].branches.includes(pr.branch)) return `${MATERIAL_KINDS[m.kind].label} ${BRANCHES[pr.branch]} ürününde kullanılamaz (${m.name})`;
  if (role === 'ana' && m.kind === 'trim') return 'Aksesuar ana malzeme olamaz';
  return '';
}

// Teknik çizim (Aşama 2): ürüne bağlı ya da bağımsız
export function addSketch(p, { name, product = null } = {}) {
  const pr = product ? p.collection.products.find((x) => x.id === product) : null;
  if (product && !pr) throw new Error('Ürün bulunamadı');
  const branch = pr ? pr.branch : PROJECT_TYPES[p.type].branches[0];
  const sk = createSketch({ id: nid(p, 'k'), name: str(name) || (pr ? pr.name + ' teknik çizimi' : 'Teknik çizim'), product, branch });
  p.sketches.push(sk); return sk;
}

// Kalıp (Aşama 3, dokuma): blok takımı ya da serbest parça
// Kesim planı: ürün + beden + ana kumaş için otomatik yerleşim; aynı ürün / bedenin eski planının yerine geçer
export function addMarker(p, { product = null, size = '', fabric, mode = 'single', selvedge = 10, gap = 2, res = 5, patternMatch = false } = {}) {
  if (!p.woven) throw new Error('Bu proje türünde dokuma kalıbı yok');
  const m = p.library.materials.find((x) => x.id === fabric && x.kind === 'fabric'); if (!m) throw new Error('Kumaş bulunamadı');
  const pcs = p.woven.pieces.filter((x) => (x.product ?? null) === product && (x.size ?? '') === size && x.fabric === 'ana');
  if (!pcs.length) throw new Error('Bu ürün / bedende ana kumaş parçası yok');
  const r = makeMarker(pcs, m, { mode, selvedge, gap, res, patternMatch });
  const mk = { ...r.marker, fabric: m.id, product, size, at: Date.now() };
  p.woven.markers = (p.woven.markers || []).filter((x) => !((x.product ?? null) === product && (x.size ?? '') === size)); p.woven.markers.push(mk);
  return { marker: mk, fails: r.fails, warn: r.warn, eval: r.eval };
}
export function addPatternSet(p, set, params, { product = null, size = '' } = {}) {
  if (!p.woven) throw new Error('Bu proje türünde dokuma kalıbı yok');
  const pr = product ? p.collection.products.find((x) => x.id === product) : null;
  if (product && (!pr || pr.branch !== 'woven')) throw new Error('Kalıp yalnız dokuma / konfeksiyon ürününe bağlanır');
  const r = buildSet(set, params, { idPrefix: nid(p, 'w') + '-', product, size });
  p.woven.pieces.push(...r.pieces); p.woven.seams.push(...r.seams);
  return r;
}
export function addPiece(p, { name, points, allow = 10, product = null, size = '' }) {
  if (!p.woven) throw new Error('Bu proje türünde dokuma kalıbı yok');
  const pc = makePiece({ id: nid(p, 'w'), name: str(name) || 'Parça', product, size, edges: edgesFromPoints(points, allow) });
  const xs = points.map((q) => q.p[0]), ys = points.map((q) => q.p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  pc.grain = [[cx, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.25], [cx, Math.min(...ys) + (Math.max(...ys) - Math.min(...ys)) * 0.75]];
  p.woven.pieces.push(pc); return pc;
}

// Grading (Aşama 4): ürün + temel beden grubunu tablodaki hedef bedenlere yayar.
// Hedef bedendeki mevcut parçalar (aynı ürün) yenileriyle değiştirilir. Dönüş: rapor
export function gradeProduct(p, { product = null, base, table: tableId, sizes, method = 'auto', wMeasure, hMeasure }) {
  if (!p.woven) throw new Error('Bu proje türünde dokuma kalıbı yok');
  const table = p.sizeTables.find((t) => t.id === tableId); if (!table) throw new Error('Beden tablosu seçilmedi');
  if (!table.source || !String(table.source).trim()) throw new Error('Beden tablosunun kaynağı yazılmamış: önce kaynağı belirt');
  const same = (pc) => (pc.product ?? null) === (product ?? null);
  const pieces = p.woven.pieces.filter((pc) => same(pc) && (pc.size ?? '') === base);
  if (!pieces.length) throw new Error('Temel bedende kalıp yok: ' + base);
  const ids = new Set(pieces.map((x) => x.id));
  const seams = p.woven.seams.filter((sm) => [...sm.a, ...sm.b].every((r) => ids.has(r.piece)));
  const targets = sizes.filter((z) => z !== base);
  const r = gradeGroup(pieces, seams, { table, base, sizes: targets, method, wMeasure, hMeasure });
  for (const z of targets) {
    const gone = new Set(p.woven.pieces.filter((pc) => same(pc) && pc.size === z).map((pc) => pc.id));
    p.woven.pieces = p.woven.pieces.filter((pc) => !gone.has(pc.id));
    p.woven.seams = p.woven.seams.filter((sm) => ![...sm.a, ...sm.b].some((x) => gone.has(x.piece)));
    p.woven.pieces.push(...r.groups[z].pieces); p.woven.seams.push(...r.groups[z].seams);
  }
  return { report: r.report, sizes: targets, table: table.name, source: table.source };
}

// Triko (Aşama 5): numune, desen, parça
export function addSwatch(p, { name, yarn = null, stitch = 'Düz örgü', st10, row10, washed = false, loopLen = null }) {
  if (!p.knit) throw new Error('Bu proje türünde triko yok');
  const s = { id: nid(p, 'n'), name: str(name) || 'Numune', yarn, stitch: str(stitch), st10, row10, washed: !!washed, loopLen };
  const e = validateSwatch(s); if (e.length) throw new Error(e.join('; '));
  p.knit.swatches.push(s); return s;
}
export function addChart(p, template = 'duz', name = '') {
  if (!p.knit) throw new Error('Bu proje türünde triko yok');
  const ch = fromTemplate(template, { id: nid(p, 'd') }); if (str(name)) ch.name = str(name);
  p.knit.charts.push(ch); return ch;
}
export function addKnitPiece(p, { kind, params = {}, swatch, chart = null, rib = 'rib11', product = null, size = '', name = '' }) {
  if (!p.knit) throw new Error('Bu proje türünde triko yok');
  if (!KNIT_PIECES[kind]) throw new Error('Bilinmeyen triko parçası: ' + kind);
  const pr = product ? p.collection.products.find((x) => x.id === product) : null;
  if (product && (!pr || pr.branch !== 'knit')) throw new Error('Triko parçası yalnız triko ürününe bağlanır');
  if (!p.knit.swatches.some((s) => s.id === swatch)) throw new Error('Numune seçilmedi');
  const o = {}; for (const [k, [, v]] of Object.entries(KNIT_PIECES[kind].params)) o[k] = params[k] ?? v;
  const pc = { id: nid(p, 'tp'), name: str(name) || KNIT_PIECES[kind].label.split(' (')[0], kind, params: o, swatch, chart, rib, product, size };
  knitCompute(p, pc);   // hata varsa eklenmez
  p.knit.pieces.push(pc); return pc;
}
// Triko makine profili (Aşama 8): genel şablondan; kullanıcı marka / model / değerleri girip numuneyle doğrular
export function addMachine(p, template = 'hand-std') {
  if (!p.knit) throw new Error('Bu proje türünde triko yok');
  const m = machineFromTemplate(template, nid(p, 'mk')); p.knit.machines.push(m); return m;
}
export function knitCompute(p, pc) {
  const s = p.knit.swatches.find((x) => x.id === pc.swatch); if (!s) throw new Error('Numune silinmiş');
  const ch = pc.chart ? p.knit.charts.find((x) => x.id === pc.chart) : null;
  return computePiece(pc.kind, pc.params, s, { rep: ch ? (ch.repeat ? ch.repeat.w : ch.w) : 1, ribRep: pc.rib === 'rib22' ? 4 : 2, edge: 1 });
}

// Hazır karttan malzeme (Aşama 6): değerler "örnek", sayısal alanlar tahmini işaretli
export function addPresetMaterial(p, kind, i) {
  const pr = PRESETS[kind]?.[i]; if (!pr) throw new Error('Hazır kart yok');
  return addMaterial(p, kind, { name: pr.name, props: { ...pr.props }, estimated: presetEstimated(kind, pr.props) });
}
// Ürün tüketimi (beden bazında): dokumada kalıptan kumaş metresi, trikoda parçalardan iplik gramı.
// Dönüş: { sizes: { [beden]: { [malzemeId]: { qty (fiyat biriminde), detail } } }, notes, errors }
export function productConsumption(p, productId, opts = {}) {
  const pr = p.collection.products.find((x) => x.id === productId); if (!pr) return null;
  const out = { sizes: {}, notes: [], errors: [] };
  const linkOf = (role, kind) => pr.materials.find((l) => l.role === role && p.library.materials.find((m) => m.id === l.mat)?.kind === kind);
  if (pr.branch === 'woven' && p.woven) {
    const by = {}; for (const pc of p.woven.pieces.filter((x) => x.product === productId)) (by[pc.size ?? ''] = by[pc.size ?? ''] || []).push(pc);
    for (const [z, pcs] of Object.entries(by)) for (const [fab, role] of [['ana', 'ana'], ['astar', 'astar']]) {
      const list = pcs.filter((x) => x.fabric === fab); if (!list.length) continue;
      const l = linkOf(role, 'fabric'); if (!l) { out.errors.push(`${z || '—'}: "${fab}" kumaşlı parça var ama ürüne ${role} kumaş bağlı değil`); continue; }
      const m = p.library.materials.find((x) => x.id === l.mat);
      const mk = fab === 'ana' && m && (p.woven.markers || []).find((x) => x.product === productId && (x.size ?? '') === z && x.fabric === m.id);
      if (mk) {
        // gerçek yerleşim: boy + pastal başı / sonu (2 × 20 mm)
        const ev = evalMarker(list, mk), ok = !ev.issues.some((x) => x.level === 'hata'), sl = (m.props.shrinkWarp ?? 0) / 100, sw = (m.props.shrinkWeft ?? 0) / 100, lengthM = (ev.length / (1 - sl) + 40) / 1000;
        if (!ok) out.errors.push(`${z || '—'}: kayıtlı kesim planında hata var; tüketim varsayımla hesaplandı`);
        else {
          const detail = { lengthM, cutArea: ev.usedArea, weightG: m.props.gsm > 0 ? lengthM * (m.props.width / 1000) * m.props.gsm * ev.layers : null, efficiency: ev.efficiency, marker: true };
          (out.sizes[z] = out.sizes[z] || {})[m.id] = { qty: m.priceUnit === 'm' ? lengthM * ev.layers : m.priceUnit === 'm²' ? lengthM * ev.layers * m.props.width / 1000 : m.priceUnit === 'kg' && detail.weightG ? detail.weightG / 1000 : null, unit: m.priceUnit, detail: { ...detail, lengthM: lengthM * ev.layers }, name: m.name, estimated: (m.estimated || []).includes('width') };
          const note = `${z || '—'}: kesim planından (verim %${(ev.efficiency * 100).toFixed(1).replace('.', ',')}${ev.layers === 2 ? ', katlı serim: kumaş boyu × 2' : ''}, pastal başı / sonu 2 × 2 cm)`;
          if (!out.notes.includes(note)) out.notes.push(note);
          if (sl > 0 && !out.notes.some((n) => n.startsWith('Kesim planı: boy çekmesi'))) out.notes.push(`Kesim planı: boy çekmesi %${m.props.shrinkWarp} kumaş boyuna eklendi`);
          if (sw > 0 && !out.notes.some((n) => n.startsWith('Kesim planı: en çekmesi'))) out.notes.push(`Kesim planı: en çekmesi %${m.props.shrinkWeft} planda yok; kalıp ene göre büyütülmeli ya da kumaş ön çektirilmeli`);
          continue;
        }
      }
      try { const c = wovenConsumption(list, m, opts); (out.sizes[z] = out.sizes[z] || {})[m.id] = { qty: m.priceUnit === 'm' ? c.lengthM : m.priceUnit === 'm²' ? c.lengthM * m.props.width / 1000 : m.priceUnit === 'kg' && c.weightG ? c.weightG / 1000 : null, unit: m.priceUnit, detail: c, name: m.name, estimated: true }; for (const n of c.notes) if (!out.notes.includes(n)) out.notes.push(n); }
      catch (e) { out.errors.push(`${z || '—'}: ${e.message}`); }
    }
  }
  if (pr.branch === 'knit' && p.knit) {
    const l = linkOf('ana', 'yarn'), m = l && p.library.materials.find((x) => x.id === l.mat);
    const by = {}; for (const pc of p.knit.pieces.filter((x) => x.product === productId)) (by[pc.size ?? ''] = by[pc.size ?? ''] || []).push(pc);
    if (Object.keys(by).length && !m) out.errors.push('Triko parçası var ama ürüne ana iplik bağlı değil');
    for (const [z, pcs] of Object.entries(by)) {
      if (!m) break;
      let grams = 0, lengthM = 0, est = false, stitches = 0; const warns = new Set(), methods = new Set();
      for (const pc of pcs) {
        try { const r = knitCompute(p, pc), n = knitStitchTotal(r), sw = p.knit.swatches.find((x) => x.id === pc.swatch), c = yarnConsumption(n, m, sw); grams += c.gramsWithWaste; lengthM += c.lengthM; stitches += n; est = est || c.estimated; if (c.warn) warns.add(c.warn); methods.add(c.method); }
        catch (e) { out.errors.push(`${z || '—'} ${pc.name}: ${e.message}`); }
      }
      (out.sizes[z] = out.sizes[z] || {})[m.id] = { qty: m.priceUnit === 'kg' ? grams / 1000 : m.priceUnit === 'adet' ? null : null, unit: m.priceUnit, grams, lengthM, stitches, name: m.name, estimated: est, detail: { methods: [...methods], warns: [...warns] } };
      for (const w of warns) if (!out.notes.includes(w)) out.notes.push(w);
      for (const w of methods) if (!out.notes.includes(w)) out.notes.push(w);
    }
    if (Object.keys(out.sizes).length) out.notes.push('%5 iplik kaybı eklendi; parça ölçüleri düz örgü ilmek sayısına göre');
  }
  return out;
}

/* ---------- doğrulama ---------- */
// Dönen dizi: { level: 'hata' | 'uyarı', where, msg }. Hata varsa proje "geçersiz", uyarı bilgi amaçlı.
export function validate(p) {
  const out = [], E = (where, msg) => out.push({ level: 'hata', where, msg }), W = (where, msg) => out.push({ level: 'uyarı', where, msg });
  if (!p || typeof p !== 'object') return [{ level: 'hata', where: 'proje', msg: 'Proje verisi yok' }];
  if (p.kind !== KIND) E('proje', 'Tekstil projesi değil');
  if (p.schema !== SCHEMA) E('proje', 'Şema sürümü ' + p.schema + ' (beklenen ' + SCHEMA + ')');
  const T = PROJECT_TYPES[p.type];
  if (!T) { E('proje', 'Bilinmeyen proje türü: ' + p.type); return out; }
  if (!str(p.name)) E('proje', 'Proje adı boş');
  for (const b of ['woven', 'knit']) {
    if (T.branches.includes(b) && !p[b]) E(BRANCHES[b], 'Dal verisi eksik');
    if (!T.branches.includes(b) && p[b]) E(BRANCHES[b], T.label + ' projesinde bu dalın verisi olmamalı');
  }
  const ids = new Set();
  const uniq = (id, where) => { if (ids.has(id)) E(where, 'Yinelenen kimlik ' + id); ids.add(id); };
  const colors = new Map((p.library?.colors || []).map((c) => [c.id, c]));
  for (const c of p.library?.colors || []) { uniq(c.id, 'Renk'); if (!/^#[0-9a-f]{6}$/i.test(c.hex)) E('Renk ' + c.name, 'Renk kodu geçersiz'); }
  const tables = new Map();
  for (const t of p.sizeTables || []) {
    uniq(t.id, 'Beden tablosu'); tables.set(t.id, t);
    const w = 'Beden tablosu ' + t.name;
    if (!str(t.source)) E(w, 'Kaynak yazılmamış (hangi standart / marka / kendi ölçün olduğu belirtilmeli)');
    if (!t.sizes.length) E(w, 'Beden yok');
    if (new Set(t.sizes).size !== t.sizes.length) E(w, 'Aynı beden iki kez yazılmış');
    for (const [mn, row] of Object.entries(t.measures || {})) {
      for (const s of t.sizes) { const v = row?.[s]; if (v == null) W(w, `${mn} / ${s} boş`); else if (!isNum(v) || v <= 0) E(w, `${mn} / ${s} geçersiz değer: ${v}`); }
      // bedenler sıralıysa ölçü de artmalı (azalan değer çoğunlukla yazım hatasıdır)
      const vs = t.sizes.map((s) => row?.[s]).filter(isNum);
      for (let i = 1; i < vs.length; i++) if (vs[i] < vs[i - 1]) { W(w, `${mn}: bedenler büyüdükçe ölçü küçülüyor (sırayı kontrol et)`); break; }
    }
  }
  const mats = new Map();
  for (const m of p.library?.materials || []) {
    uniq(m.id, 'Malzeme'); mats.set(m.id, m);
    const K = MATERIAL_KINDS[m.kind], w = 'Malzeme ' + m.name;
    if (!K) { E(w, 'Bilinmeyen tür ' + m.kind); continue; }
    if (!K.branches.some((b) => T.branches.includes(b))) W(w, `${K.label} bu proje türünde kullanılmaz`);
    if (m.kind === 'fabric') { for (const k of ['drapeRef', 'drapeRef2']) if (m.props[k] != null && !(m.props[k] >= 0 && m.props[k] <= 1)) E(w, 'Dökümlülük katsayısı 0 ile 1 arasında olmalı'); const dv = drapeVerdict(m); if (dv && !dv.verified) (dv.level === 'hata' ? E : W)(w, 'Dökümlülük benzetimi: ' + dv.text); }
    for (const [k, lbl, , kind] of K.fields) {
      const v = m.props?.[k];
      if (v == null || v === '') continue;
      if ((kind === 'num' || kind === 'int' || kind === 'pct') && !isNum(v)) E(w, lbl + ': sayı değil');
      else if ((kind === 'num' || kind === 'int') && v <= 0) E(w, lbl + ': sıfırdan büyük olmalı');
      else if (kind === 'int' && !Number.isInteger(v)) E(w, lbl + ': tam sayı olmalı');
      else if (kind === 'pct' && (v < 0 || v > 100)) E(w, lbl + ': %0–100 arası olmalı');
      else if (kind === 'count' && !COUNT_SYSTEMS.includes(v)) E(w, lbl + ': ' + COUNT_SYSTEMS.join(', ') + ' olmalı');
    }
    if (m.kind === 'yarn' && m.props.count != null && m.props.countSystem == null) E(w, 'İplik numarasının sistemi (Nm, Ne, tex…) yazılmalı');
    if (m.price != null && (!isNum(m.price) || m.price < 0)) E(w, 'Fiyat geçersiz');
    if (!PRICE_UNITS.includes(m.priceUnit)) E(w, 'Fiyat birimi geçersiz: ' + m.priceUnit);
    for (const k of m.estimated || []) if (!K.fields.some((f) => f[0] === k)) E(w, 'Tahmini işaretli alan yok: ' + k);
  }
  for (const pr of p.collection?.products || []) {
    uniq(pr.id, 'Ürün');
    const w = 'Ürün ' + pr.name;
    if (!T.branches.includes(pr.branch)) { E(w, `${BRANCHES[pr.branch] || pr.branch} ürünü ${T.label} projesinde olamaz`); continue; }
    if (!PRODUCT_TYPES[pr.branch]?.[pr.type]) E(w, 'Ürün türü dala uymuyor: ' + pr.type);
    for (const x of validateOps(pr.techpack?.ops)) (x.level === 'hata' ? E : W)(w, x.msg);
    if ((pr.techpack?.ops || []).some((o) => o.est)) W(w, 'Operasyon süreleri şablondan (tahmini): firma zaman etüdüyle değiştir');
    const cg = pr.costing || {};
    for (const [k, l, lo, hi] of [['minuteRate', 'Dakika ücreti', 0, 1e6], ['efficiency', 'Hat verimi', 1, 100], ['overheadPct', 'Genel gider', 0, 500], ['marginPct', 'Kâr payı', -100, 1000], ['vatPct', 'KDV', 0, 100], ['wastePct', 'Fire', 0, 100]])
      if (cg[k] != null && !(Number.isFinite(cg[k]) && cg[k] >= lo && cg[k] <= hi)) E(w, `${l} ${lo}–${hi} aralığında olmalı`);
    for (const [z, q] of Object.entries(pr.order || {})) if (q != null && !(Number.isInteger(q) && q >= 0)) E(w, `Sipariş adedi (${z}) tam sayı olmalı`);
    for (const c of pr.colors) if (!colors.has(c)) E(w, 'Silinmiş renk: ' + c);
    if (pr.sizeTable != null) {
      const t = tables.get(pr.sizeTable);
      if (!t) E(w, 'Beden tablosu bulunamadı');
      else for (const s of pr.sizes) if (!t.sizes.includes(s)) E(w, `${s} bedeni "${t.name}" tablosunda yok`);
    } else if (pr.sizes.length) E(w, 'Beden seçilmiş ama tablo seçilmemiş');
    let main = 0;
    for (const l of pr.materials) {
      const m = mats.get(l.mat);
      if (!m) { E(w, 'Silinmiş malzeme: ' + l.mat); continue; }
      const e = materialRuleError(pr, m, l.role); if (e) E(w, e);
      if (l.role === 'ana') main++;
      if (l.qty != null && (!isNum(l.qty) || l.qty <= 0)) E(w, `${m.name} miktarı geçersiz`);
    }
    if (!main) W(w, pr.branch === 'knit' ? 'Ana iplik seçilmemiş' : 'Ana kumaş seçilmemiş');
    if (!pr.colors.length) W(w, 'Renk seçilmemiş');
    if (!pr.sizes.length) W(w, 'Beden seçilmemiş');
  }
  const prodIds = new Set((p.collection?.products || []).map((x) => x.id));
  if (p.knit) {
    for (const mc of p.knit.machines || []) { uniq(mc.id, 'Makine'); const st = machineStatus(mc); if (st.level === 'hata') E('Makine ' + mc.name, st.text); else if (st.level === 'uyarı') W('Makine ' + mc.name, st.text); }
    for (const s of p.knit.swatches || []) { uniq(s.id, 'Numune'); for (const m of validateSwatch(s)) E('Numune ' + s.name, m); if (!s.washed) W('Numune ' + s.name, 'Yıkanmamış numune: yıkama sonrası ölçü değişebilir'); }
    for (const ch of p.knit.charts || []) { uniq(ch.id, 'Desen'); out.push(...validateChart(ch)); }
    for (const pc of p.knit.pieces || []) {
      uniq(pc.id, 'Triko parçası');
      try { knitCompute(p, pc); } catch (e) { E('Triko parçası ' + pc.name, e.message); }
      if (pc.chart && !(p.knit.charts || []).some((c) => c.id === pc.chart)) E('Triko parçası ' + pc.name, 'Desen silinmiş');
      if (pc.product && !prodIds.has(pc.product)) E('Triko parçası ' + pc.name, 'Bağlı olduğu ürün silinmiş');
    }
  }
  if (p.woven) {
    for (const pc of p.woven.pieces || []) {
      uniq(pc.id, 'Kalıp');
      out.push(...validatePiece(pc));
      if (pc.product && !prodIds.has(pc.product)) E('Kalıp ' + pc.name, 'Bağlı olduğu ürün silinmiş');
    }
    for (const mk of p.woven.markers || []) {
      const pcs = p.woven.pieces.filter((x) => (x.product ?? null) === (mk.product ?? null) && (x.size ?? '') === (mk.size ?? '') && x.fabric === 'ana');
      const w = 'Kesim planı ' + (p.collection.products.find((x) => x.id === mk.product)?.name || '') + ' ' + (mk.size || '');
      if (!p.library.materials.some((x) => x.id === mk.fabric)) { E(w, 'Kumaşı silinmiş'); continue; }
      try { for (const is of evalMarker(pcs, mk).issues) (is.level === 'hata' ? E : W)(w, is.msg); } catch (e) { E(w, e.message); }
    }
    for (const sm of p.woven.seams || []) {
      const r = seamCheck(p.woven.pieces, sm);
      if (r.missing) E('Dikiş eşleşmesi ' + sm.name, 'Eşleşmedeki parça ya da kenar bulunamadı');
      else if (!r.ok) E('Dikiş eşleşmesi ' + sm.name, `Boylar tutmuyor: ${(r.A / 10).toFixed(1)} → ${(r.B / 10).toFixed(1)} cm, beklenen fark ${((sm.ease || 0) / 10).toFixed(1)} cm, sapma ${(r.diff / 10).toFixed(2)} cm (tolerans ${((sm.tol ?? 2) / 10).toFixed(1)} cm)`);
    }
  }
  for (const sk of p.sketches || []) {
    uniq(sk.id, 'Çizim');
    out.push(...validateSketch(sk));
    if (sk.product && !prodIds.has(sk.product)) E('Çizim ' + sk.name, 'Bağlı olduğu ürün silinmiş');
    if (sk.template && TEMPLATES[sk.template.type] && TEMPLATES[sk.template.type].branch !== sk.branch) W('Çizim ' + sk.name, `${TEMPLATES[sk.template.type].label} şablonu ${BRANCHES[TEMPLATES[sk.template.type].branch]} dalına ait; ürün ${BRANCHES[sk.branch]}`);
  }
  return out;
}
export const isValid = (p) => !validate(p).some((x) => x.level === 'hata');

/* ---------- varyant, föy özeti, maliyet ---------- */
export function variants(p, productId) {
  const pr = p.collection.products.find((x) => x.id === productId);
  if (!pr) return [];
  const cs = pr.colors.length ? pr.colors : [null], ss = pr.sizes.length ? pr.sizes : [null];
  return cs.flatMap((c) => ss.map((s) => ({ color: c, size: s, sku: [pr.modelCode || pr.id, c && (p.library.colors.find((x) => x.id === c)?.code || c), s].filter(Boolean).join('-') })));
}
// Malzeme maliyeti: yalnız miktarı VE fiyatı bilinen satırlar toplanır; eksikler ayrıca listelenir (uydurulmaz).
// computed: productConsumption(...).sizes[beden] — elle girilmemiş miktar için hesaplanan tüketim kullanılır (işaretli)
export function materialCost(p, productId, computed = null) {
  const pr = p.collection.products.find((x) => x.id === productId);
  if (!pr) return null;
  let sum = 0; const missing = [], lines = [];
  for (const l of pr.materials) {
    const m = p.library.materials.find((x) => x.id === l.mat);
    if (!m) continue;
    const auto = l.qty == null && computed?.[m.id]?.qty != null ? computed[m.id] : null;
    const qty = l.qty ?? auto?.qty ?? null;
    if (qty == null || m.price == null) { missing.push(m.name + (qty == null ? ' (miktar yok)' : ' (fiyat yok)')); continue; }
    const c = qty * m.price; sum += c; lines.push({ name: m.name, qty, unit: m.priceUnit, price: m.price, cost: c, computed: !!auto, estimated: !!auto?.estimated || (m.estimated || []).length > 0 });
  }
  return { total: sum, lines, missing, complete: !missing.length };
}
export function techpackSummary(p, productId) {
  const pr = p.collection.products.find((x) => x.id === productId);
  if (!pr) return null;
  const t = p.sizeTables.find((x) => x.id === pr.sizeTable);
  return {
    header: { project: p.name, collection: [p.collection.brand, p.collection.season].filter(Boolean).join(' · '), product: pr.name, modelCode: pr.modelCode, branch: BRANCHES[pr.branch], type: PRODUCT_TYPES[pr.branch][pr.type], status: pr.techpack.status, rev: p.rev },
    colors: pr.colors.map((c) => p.library.colors.find((x) => x.id === c)).filter(Boolean),
    sizeTable: t ? { name: t.name, source: t.source, sizes: pr.sizes, measures: Object.fromEntries(Object.entries(t.measures).map(([k, row]) => [k, Object.fromEntries(pr.sizes.map((s) => [s, row[s] ?? null]))])) } : null,
    materials: pr.materials.map((l) => { const m = p.library.materials.find((x) => x.id === l.mat); return m && { name: m.name, kind: MATERIAL_KINDS[m.kind].label, role: l.role, qty: l.qty, unit: m.priceUnit, estimated: m.estimated }; }).filter(Boolean),
    variants: variants(p, productId), cost: materialCost(p, productId), notes: pr.techpack.notes,
    consumption: (() => { const c = productConsumption(p, productId); if (!c) return null; return { ...c, cost: Object.fromEntries(Object.entries(c.sizes).map(([z, v]) => [z, materialCost(p, productId, v)])) }; })(),
    issues: validate(p).filter((x) => x.where === 'Ürün ' + pr.name),
  };
}

// Aşama 10: operasyon şablonu, maliyet kartı (bedene göre), sipariş malzeme ihtiyacı
export function applyOpTemplate(p, productId) {
  const pr = p.collection.products.find((x) => x.id === productId); if (!pr) throw new Error('Ürün yok');
  pr.techpack.ops = templateOps(pr.type).map((o) => ({ id: nid(p, 'op'), ...o })); return pr.techpack.ops;
}
export function addOp(p, productId, { name = '', machine = 'duz', smv = null } = {}) {
  const pr = p.collection.products.find((x) => x.id === productId); if (!pr) throw new Error('Ürün yok');
  const o = { id: nid(p, 'op'), name: str(name) || 'Operasyon', machine, smv, est: false }; pr.techpack.ops.push(o); return o;
}
export function productionSheet(p, productId) {
  const pr = p.collection.products.find((x) => x.id === productId); if (!pr) return null;
  const cons = productConsumption(p, productId) || { sizes: {}, notes: [], errors: [] };
  const sizes = pr.sizes.length ? pr.sizes : Object.keys(cons.sizes);
  const perSize = Object.fromEntries((sizes.length ? sizes : ['']).map((z) => [z, costSheet({ matCost: materialCost(p, productId, cons.sizes[z] || null), ops: pr.techpack.ops, c: pr.costing })]));
  const mats = pr.materials.map((l) => p.library.materials.find((m) => m.id === l.mat)).filter(Boolean);
  const manual = Object.fromEntries(pr.materials.filter((l) => l.qty != null).map((l) => [l.mat, l.qty]));
  const req = orderRequirement({ order: pr.order, consumption: cons.sizes, manual, materials: mats, wastePct: pr.costing.wastePct || 0 });
  return { product: pr, consumption: cons, perSize, requirement: req, opsIssues: validateOps(pr.techpack.ops) };
}
/* ---------- göç ve içe aktarma ---------- */
// Dışarıdan gelen veriyi (yedek dosyası, eski kayıt) güvenle yükler. Daha yeni şema reddedilir.
export function migrate(raw) {
  let p = typeof raw === 'string' ? JSON.parse(raw) : clone(raw);
  if (!p || typeof p !== 'object' || p.kind !== KIND) throw new Error('Bu dosya bir Çizim Atölyesi tekstil projesi değil');
  if (!Number.isInteger(p.schema) || p.schema < 0) throw new Error('Şema sürümü okunamadı');
  if (p.schema > SCHEMA) throw new Error(`Bu proje daha yeni bir sürümle kaydedilmiş (şema ${p.schema}); uygulamayı güncelle`);
  // şema 0 (taslak, adlandırılmamış alanlar) → 1
  if (p.schema === 0) {
    p.library = p.library || { colors: [], materials: [] };
    p.sizeTables = p.sizeTables || [];
    p.collection = p.collection || { season: '', brand: '', products: [] };
    p.revisions = p.revisions || []; p.sketches = p.sketches || [];
    p.schema = 1;
  }
  for (const pr of p.collection?.products || []) { if (!pr.costing) pr.costing = emptyCosting(); if (!pr.order) pr.order = {}; if (!pr.techpack) pr.techpack = { status: 'taslak', notes: '', ops: [] }; if (!Array.isArray(pr.techpack.ops)) pr.techpack.ops = []; }
  if (p.woven && !Array.isArray(p.woven.seams)) p.woven.seams = [];
  if (p.woven && !Array.isArray(p.woven.markers)) p.woven.markers = [];
  p.rev = Number.isInteger(p.rev) ? p.rev : 0;
  if (!Number.isInteger(p.nextId)) {
    const all = [...(p.library?.colors || []), ...(p.library?.materials || []), ...(p.sizeTables || []), ...(p.collection?.products || [])];
    p.nextId = 1 + Math.max(0, ...all.map((x) => +String(x.id).replace(/\D/g, '') || 0));
  }
  return p;
}
