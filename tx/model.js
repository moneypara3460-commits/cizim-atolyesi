// Tekstil ve Moda — proje veri modeli (Aşama 1: ortak altyapı).
// Saf modül: DOM yok, depolama yok; Node testlerinde doğrudan çalışır.
// İç birim mm (uzunluk), g/m² (gramaj), % (oran). Ekranda cm gösterimi arayüzün işidir.
// Dokuma / konfeksiyon ve triko ayrı alt şemalardır (woven, knit); yalnız koleksiyon, ürün, renk, beden,
// malzeme, föy ve revizyon ortaktır. Bkz. docs/TEKSTIL-MIMARI.md

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
function emptyBranch(b) { return b === 'woven' ? { pieces: [], markers: [] } : { swatches: [], charts: [], pieces: [], machines: [] }; }
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

export function addProduct(p, { branch, type, name, modelCode = '', season = '' }) {
  if (!PROJECT_TYPES[p.type].branches.includes(branch)) throw new Error(`${PROJECT_TYPES[p.type].label} projesine ${BRANCHES[branch] || branch} ürünü eklenemez`);
  if (!PRODUCT_TYPES[branch][type]) throw new Error('Bu dalda böyle bir ürün türü yok: ' + type);
  const pr = {
    id: nid(p, 'p'), branch, type, name: str(name) || PRODUCT_TYPES[branch][type], modelCode: str(modelCode), season: str(season),
    colors: [], sizeTable: null, sizes: [], materials: [], techpack: { status: 'taslak', notes: '', ops: [] },
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
export function materialCost(p, productId) {
  const pr = p.collection.products.find((x) => x.id === productId);
  if (!pr) return null;
  let sum = 0; const missing = [], lines = [];
  for (const l of pr.materials) {
    const m = p.library.materials.find((x) => x.id === l.mat);
    if (!m) continue;
    if (l.qty == null || m.price == null) { missing.push(m.name + (l.qty == null ? ' (miktar yok)' : ' (fiyat yok)')); continue; }
    const c = l.qty * m.price; sum += c; lines.push({ name: m.name, qty: l.qty, unit: m.priceUnit, price: m.price, cost: c });
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
    issues: validate(p).filter((x) => x.where === 'Ürün ' + pr.name),
  };
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
  p.rev = Number.isInteger(p.rev) ? p.rev : 0;
  if (!Number.isInteger(p.nextId)) {
    const all = [...(p.library?.colors || []), ...(p.library?.materials || []), ...(p.sizeTables || []), ...(p.collection?.products || [])];
    p.nextId = 1 + Math.max(0, ...all.map((x) => +String(x.id).replace(/\D/g, '') || 0));
  }
  return p;
}
