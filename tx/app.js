// Tekstil ve Moda çalışma alanı — arayüz (Aşama 1: ortak proje altyapısı).
// Hesap ve doğrulama tx/model.js'te; burada yalnız gösterim ve düzenleme.
// Makine ve Mühendislik alanının hiçbir dosyasını içe aktarmaz.
import * as M from './model.js?v=20261112c';
import { openStore, idbBackend, memoryBackend } from './store.js?v=20261112c';
import { TEMPLATES, VIEWS } from './drawing.js?v=20261112c';
import { openSketchEditor } from './sketch-ui.js?v=20261112c';
import { SETS, defaultParams } from './woven/blocks.js?v=20261112c';
import { openPatternEditor } from './woven/pattern-ui.js?v=20261112c';
import { validatePiece, seamCheck, measure } from './woven/pattern.js?v=20261112c';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v, d = 1) => (v == null || !Number.isFinite(v) ? '' : String(+v.toFixed(d)).replace('.', ','));
const parseNum = (s) => { const t = String(s).trim().replace(',', '.'); if (t === '') return null; const v = Number(t); return Number.isFinite(v) ? v : NaN; };
const date = (t) => new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
let toastT;
const toast = (s) => { const el = $('toast'); el.textContent = s; el.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = 0; }, 2600); };

// Bu sayfa açıldıysa son seçilen çalışma alanı tekstildir
try { localStorage.setItem('cizim:workspace', 'tekstil'); } catch (e) { /* */ }

let store, storeKind = 'idb';
try { if (!window.indexedDB) throw new Error('yok'); store = openStore(idbBackend()); await store.list(); }
catch (e) { store = openStore(memoryBackend()); storeKind = 'memory'; }

const S = { view: 'home', p: null, tab: 'col', newType: 'woven', fp: null, delArm: null, addKind: null };
// birimler: uzunluk mm saklanır; kumaş eni ve desen raporu cm gösterilir, ölçü tablosu cm gösterilir
const CM_FIELDS = new Set(['width', 'repeatW', 'repeatH']);
const ROLE = { ana: 'Ana', astar: 'Astar', 'yardımcı': 'Yardımcı', aksesuar: 'Aksesuar' };

/* ---------- kayıt ---------- */
let saveT;
function dirty() {
  clearTimeout(saveT); $('saved').textContent = 'kaydediliyor…';
  saveT = setTimeout(async () => { try { await store.put(S.p); $('saved').textContent = 'otomatik kaydedildi'; } catch (e) { $('saved').textContent = '⚠ kaydedilemedi'; toast('Kaydedilemedi: ' + e.message); } }, 400);
}
async function flush() { if (saveT) { clearTimeout(saveT); saveT = null; if (S.p) await store.put(S.p); } }

/* ---------- ana sayfa ---------- */
const TYPE_DESC = { mixed: 'Dokuma ve triko ürünleri aynı koleksiyonda; her ürün kendi dalının kurallarıyla doğrulanır.', knit: 'Kazak, hırka, süveter, yelek, atkı, bere… İplik ve örgü araçları öne çıkar.', woven: 'Gömlek, pantolon, ceket, elbise, etek, mont… Kumaş ve kalıp araçları öne çıkar.' };
async function renderHome() {
  const list = await store.list();
  if (S.view !== 'home') return;   // beklerken projeye geçildiyse eski ana sayfayı çizme
  const T = M.PROJECT_TYPES;
  // yeniden çizimde yazılmış alanlar kaybolmasın (bekleme bittikten sonra, çizimden hemen önce okunur)
  const keep = Object.fromEntries(['np-name', 'np-season', 'np-brand'].map((k) => [k, $(k)?.value || '']));
  $('top').querySelector('h1').textContent = '🧵 Tekstil ve Moda';
  $('saved').textContent = '';
  $('main').innerHTML = `
  ${storeKind === 'memory' ? '<div class="issue hata">Bu tarayıcıda kalıcı depolama (IndexedDB) yok: projeler sayfa kapanınca silinir. JSON olarak dışa aktar.</div>' : ''}
  <div class="card">
    <h3>Yeni proje</h3>
    <div class="row typesel">${Object.entries(T).map(([k, v]) => `<button data-a="type" data-v="${k}" class="${S.newType === k ? 'on' : ''}">${esc(v.label)}</button>`).join('')}</div>
    <div class="small" id="np-desc">${TYPE_DESC[S.newType]}</div>
    <div class="row">
      <label class="f"><span>Proje adı</span><input id="np-name" placeholder="ör. Yaz 2027 gömlekleri"></label>
      <label class="f"><span>Sezon</span><input id="np-season" placeholder="ör. YZ27"></label>
      <label class="f"><span>Marka</span><input id="np-brand"></label>
      <button class="ok" data-a="create">Oluştur</button>
    </div>
  </div>
  <div class="card">
    <h3><span class="sp">Projeler</span><button data-a="import">⬆ JSON içe aktar</button></h3>
    ${list.length ? `<table>${list.map((r) => `<tr><td><b>${esc(r.name)}</b><div class="small">${date(r.modified)} · rev ${r.rev}</div></td>
      <td><span class="badge ${r.type}">${esc(T[r.type]?.label || r.type)}</span></td>
      <td style="text-align:right;white-space:nowrap"><button class="on" data-a="open" data-id="${esc(r.id)}">Aç</button>
      <button class="danger" data-a="del" data-id="${esc(r.id)}">${S.delArm === r.id ? 'Emin misin?' : 'Sil'}</button></td></tr>`).join('')}</table>`
      : '<div class="small">Henüz tekstil projesi yok.</div>'}
    <div class="small" style="margin-top:8px">Tekstil projeleri bu tarayıcıda, makine projelerinden ayrı saklanır. Tarayıcı verisi silinirse projeler de gider; önemli işleri JSON olarak dışa aktar.</div>
  </div>`;
  for (const [k, v] of Object.entries(keep)) if (v) $(k).value = v;
}

/* ---------- proje ---------- */
const TABS = [['col', 'Koleksiyon'], ['draw', 'Teknik çizim'], ['pat', 'Kalıp'], ['colors', 'Renkler'], ['sizes', 'Bedenler'], ['mats', 'Malzemeler'], ['tp', 'Föy'], ['val', 'Doğrulama'], ['revs', 'Revizyonlar'], ['tools', 'Dal araçları']];
function render() {
  if (S.view === 'home') return renderHome();
  const p = S.p, T = M.PROJECT_TYPES[p.type];
  const issues = M.validate(p), nErr = issues.filter((x) => x.level === 'hata').length;
  $('top').querySelector('h1').textContent = p.name;
  const tabs = TABS.filter(([k]) => k !== 'pat' || p.woven).map(([k, l]) => `<button data-a="tab" data-v="${k}" class="${S.tab === k ? 'on' : ''}">${l}${k === 'val' && issues.length ? ` (${nErr ? '⛔' + nErr : '⚠' + issues.length})` : ''}</button>`).join('');
  if (S.tab === 'pat' && !p.woven) S.tab = 'col';
  const body = { col: tabCollection, draw: tabDrawings, pat: tabPatterns, colors: tabColors, sizes: tabSizes, mats: tabMaterials, tp: tabTechpack, val: () => tabValidation(issues), revs: tabRevisions, tools: tabTools }[S.tab]();
  $('main').innerHTML = `
  <div class="row noprint">
    <button data-a="home">← Projeler</button>
    <span class="badge ${p.type}" style="flex:0 0 auto">${esc(T.label)}</span>
    <span class="small" style="flex:1 1 80px">rev ${p.rev}</span>
    <button data-a="export">⬇ JSON</button>
  </div>
  <div class="row noprint">
    <label class="f"><span>Proje adı</span><input data-f="name" value="${esc(p.name)}"></label>
    <label class="f" style="flex:2 1 160px"><span>Revizyon notu</span><input id="rev-note" placeholder="ne değişti?"></label>
    <button class="ok" data-a="commit">Revizyon kaydet</button>
  </div>
  <div class="tabs noprint">${tabs}</div>
  <div id="tab">${body}</div>`;
}

function tabCollection() {
  const p = S.p, T = M.PROJECT_TYPES[p.type];
  const br = T.branches;
  const S0 = S.addBranch && br.includes(S.addBranch) ? S.addBranch : br[0];
  const types = M.PRODUCT_TYPES[S0];
  let h = `<div class="card"><h3>Koleksiyon</h3><div class="row">
    <label class="f"><span>Marka</span><input data-f="collection.brand" value="${esc(p.collection.brand)}"></label>
    <label class="f"><span>Sezon</span><input data-f="collection.season" value="${esc(p.collection.season)}"></label></div></div>
  <div class="card noprint"><h3>Ürün ekle</h3><div class="row">
    ${br.length > 1 ? `<label class="f"><span>Dal</span><select id="ap-branch">${br.map((b) => `<option value="${b}" ${b === S0 ? 'selected' : ''}>${M.BRANCHES[b]}</option>`).join('')}</select></label>` : ''}
    <label class="f"><span>Tür</span><select id="ap-type">${Object.entries(types).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
    <label class="f"><span>Ad</span><input id="ap-name" placeholder="boş: tür adı"></label>
    <label class="f"><span>Model kodu</span><input id="ap-code" placeholder="ör. GM-001"></label>
    <button class="ok" data-a="add-prod">Ekle</button></div></div>`;
  if (!p.collection.products.length) h += '<div class="small">Henüz ürün yok.</div>';
  p.collection.products.forEach((pr, i) => {
    const f = (k) => `collection.products.${i}.${k}`;
    const tbl = p.sizeTables.find((t) => t.id === pr.sizeTable);
    const usable = p.library.materials.filter((m) => M.MATERIAL_KINDS[m.kind].branches.includes(pr.branch));
    h += `<div class="card"><h3><span class="badge ${pr.branch}">${M.BRANCHES[pr.branch]}</span><span class="sp">${esc(pr.name)}</span>
      <button class="danger" data-a="del-prod" data-i="${i}">${S.delArm === pr.id ? 'Emin misin?' : 'Sil'}</button></h3>
      <div class="row">
        <label class="f"><span>Ad</span><input data-f="${f('name')}" value="${esc(pr.name)}"></label>
        <label class="f"><span>Tür</span><select data-f="${f('type')}">${Object.entries(M.PRODUCT_TYPES[pr.branch]).map(([k, v]) => `<option value="${k}" ${k === pr.type ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="f"><span>Model kodu</span><input data-f="${f('modelCode')}" value="${esc(pr.modelCode)}"></label>
        <label class="f"><span>Sezon</span><input data-f="${f('season')}" value="${esc(pr.season)}" placeholder="${esc(p.collection.season)}"></label>
      </div>
      <div class="small">Renkler</div>
      <div class="chips">${p.library.colors.map((c) => `<button data-a="tog-color" data-i="${i}" data-v="${c.id}" class="${pr.colors.includes(c.id) ? 'on' : ''}"><span class="sw" style="background:${c.hex}"></span> ${esc(c.name)}</button>`).join('') || '<span class="small">Renkler sekmesinden renk ekle.</span>'}</div>
      <div class="row"><label class="f"><span>Beden tablosu</span><select data-f="${f('sizeTable')}" data-t="ref"><option value="">— seçilmedi —</option>${p.sizeTables.map((t) => `<option value="${t.id}" ${t.id === pr.sizeTable ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label></div>
      ${tbl ? `<div class="chips">${tbl.sizes.map((s) => `<button data-a="tog-size" data-i="${i}" data-v="${esc(s)}" class="${pr.sizes.includes(s) ? 'on' : ''}">${esc(s)}</button>`).join('')}</div>` : ''}
      <div class="small" style="margin-top:8px">Malzemeler (miktar ürün başına, malzemenin fiyat birimiyle)</div>
      <table>${pr.materials.map((l, j) => { const m = p.library.materials.find((x) => x.id === l.mat); return `<tr><td>${esc(m ? m.name : '⚠ silinmiş')}<div class="small">${m ? M.MATERIAL_KINDS[m.kind].label : ''}</div></td>
        <td><select data-f="${f('materials')}.${j}.role">${Object.entries(ROLE).map(([k, v]) => `<option value="${k}" ${k === l.role ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
        <td><input data-f="${f('materials')}.${j}.qty" data-t="num" value="${num(l.qty, 3)}" placeholder="bilinmiyor" inputmode="decimal"></td><td class="small">${m ? m.priceUnit : ''}</td>
        <td><button class="danger" data-a="unlink" data-i="${i}" data-j="${j}">×</button></td></tr>`; }).join('')}</table>
      ${usable.length ? `<div class="row"><select id="lk-mat-${i}">${usable.map((m) => `<option value="${m.id}">${esc(m.name)} (${M.MATERIAL_KINDS[m.kind].label})</option>`).join('')}</select>
        <select id="lk-role-${i}">${Object.entries(ROLE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select><button data-a="link" data-i="${i}">Bağla</button></div>`
        : `<div class="small">Malzemeler sekmesinden ${pr.branch === 'knit' ? 'iplik' : 'kumaş'} ekle.</div>`}
      <div class="small" style="margin-top:6px">${M.variants(p, pr.id).length} varyant (renk × beden)</div>
    </div>`;
  });
  return h;
}

function tabDrawings() {
  const p = S.p, prs = p.collection.products;
  let h = `<div class="card noprint"><h3>Yeni teknik çizim</h3><div class="row">
    <label class="f"><span>Ürün</span><select id="nd-prod">${prs.map((x) => `<option value="${x.id}">${esc(x.name)} (${M.BRANCHES[x.branch]})</option>`).join('')}<option value="">— ürüne bağlı değil —</option></select></label>
    <label class="f"><span>Ad</span><input id="nd-name" placeholder="boş: ürün adı"></label><button class="ok" data-a="add-sketch">Oluştur ve aç</button></div>
    <div class="small">Ön, arka ve yan görünüş; çizgi, eğri, nokta, ölçü, yazı, simetri, hizalama, katman, detay kütüphanesi ve giysi şablonları. Çıktı: PNG, SVG (1:1 mm), PDF föy sayfası.</div></div>`;
  if (!p.sketches.length) return h + '<div class="small">Henüz teknik çizim yok.</div>';
  p.sketches.forEach((sk, i) => {
    const pr = prs.find((x) => x.id === sk.product);
    const counts = Object.entries(VIEWS).map(([v, l]) => [l, sk.views[v].layers.reduce((a, L) => a + L.ents.length, 0)]).filter(([, n]) => n).map(([l, n]) => `${l} ${n}`).join(' · ');
    h += `<div class="card"><h3><span class="badge ${sk.branch}">${M.BRANCHES[sk.branch]}</span><span class="sp">${esc(sk.name)}</span>
      <button class="on" data-a="open-sketch" data-i="${i}">Aç</button><button class="danger" data-a="del-sketch" data-i="${i}">${S.delArm === sk.id ? 'Emin misin?' : 'Sil'}</button></h3>
      <div class="small">${pr ? 'Ürün: ' + esc(pr.name) : sk.product ? '⚠ ürün silinmiş' : 'Ürüne bağlı değil'}${sk.template ? ' · Şablon: ' + esc(TEMPLATES[sk.template.type]?.label) : ''} · ${counts || 'boş'}</div></div>`;
  });
  return h;
}
function openSketch(i) {
  const p = S.p, sk = p.sketches[i], pr = p.collection.products.find((x) => x.id === sk.product);
  openSketchEditor(sk, {
    toast, sizeTables: p.sizeTables, productType: pr?.type,
    meta: { project: p.name, collection: [p.collection.brand, p.collection.season].filter(Boolean).join(' · '), product: pr?.name, code: pr?.modelCode, branch: M.BRANCHES[sk.branch], rev: p.rev },
    onChange: (closed) => { dirty(); if (closed) render(); },
  });
}

function tabPatterns() {
  const p = S.p, prods = p.collection.products.filter((x) => x.branch === 'woven');
  const set = S.patSet && SETS[S.patSet] ? S.patSet : 'gomlek';
  const tbl = p.sizeTables.find((t) => t.id === S.patTable) || null;
  const size = tbl && tbl.sizes.includes(S.patSize) ? S.patSize : tbl ? tbl.sizes[Math.floor(tbl.sizes.length / 2)] : '';
  const meas = tbl ? Object.fromEntries(Object.entries(tbl.measures).map(([k, row]) => [k, row[size]])) : {};
  const prm = defaultParams(set, meas);
  let h = `<div class="card noprint"><h3>Temel kalıp bloğu oluştur</h3><div class="row">
    <label class="f"><span>Takım</span><select id="pt-set">${Object.entries(SETS).map(([k, v]) => `<option value="${k}" ${k === set ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
    <label class="f"><span>Ürün</span><select id="pt-prod">${prods.map((x) => `<option value="${x.id}">${esc(x.name)}${x.modelCode ? ' (' + esc(x.modelCode) + ')' : ''}</option>`).join('')}<option value="">— ürüne bağlı değil —</option></select></label>
    <label class="f"><span>Beden tablosu</span><select id="pt-table"><option value="">— yok (varsayılan ölçüler) —</option>${p.sizeTables.map((t) => `<option value="${t.id}" ${tbl && t.id === tbl.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>
    ${tbl ? `<label class="f"><span>Beden</span><select id="pt-size">${tbl.sizes.map((z) => `<option ${z === size ? 'selected' : ''}>${esc(z)}</option>`).join('')}</select></label>` : `<label class="f"><span>Beden adı</span><input id="pt-size-free" placeholder="ör. M"></label>`}</div>
    <div class="row">${Object.entries(SETS[set].params).map(([k, [lbl, , src]]) => `<label class="f"><span>${esc(lbl)} (cm)${src && Number.isFinite(meas[src]) ? ' · tablodan' : ''}</span><input data-pt="${k}" inputmode="decimal" value="${num(prm[k] / 10)}"></label>`).join('')}</div>
    <div class="row"><button class="ok" data-a="add-pattern">Oluştur ve aç</button></div>
    <div class="small">Basitleştirilmiş temel bloklardır: ölçülerden çizilir, dikiş eşleşmeleri (kol başı ↔ kol oyuğu bolluğu, yan dikiş, omuz, yaka, kemer) otomatik kontrol edilir. Seri üretimden önce prova ile doğrulanmalı.</div></div>`;
  const groups = new Map();
  for (const pc of p.woven.pieces) { const key = (pc.product ?? '') + '|' + (pc.size ?? ''); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(pc); }
  if (!groups.size) h += '<div class="small">Henüz kalıp yok. Blok oluştur ya da boş bir grup açıp parçayı kendin çiz.</div>';
  for (const [key, pcs] of groups) {
    const [pid, sz] = key.split('|'), pr = p.collection.products.find((x) => x.id === pid);
    const ids = new Set(pcs.map((x) => x.id)), sms = p.woven.seams.filter((sm) => [...sm.a, ...sm.b].some((r) => ids.has(r.piece)));
    const bad = pcs.filter((x) => validatePiece(x).some((i) => i.level === 'hata')).length, sBad = sms.filter((sm) => !seamCheck(p.woven.pieces, sm).ok).length;
    let area = 0; for (const x of pcs) { try { area += measure(x).cutArea * x.qty; } catch (e) { /* */ } }
    h += `<div class="card"><h3><span class="sp">${esc(pr ? pr.name : pid ? '⚠ silinmiş ürün' : 'Ürüne bağlı değil')}${sz ? ' · Beden ' + esc(sz) : ''}</span>
      <button class="on" data-a="open-pattern" data-v="${esc(key)}">Aç</button><button class="danger" data-a="del-pattern" data-v="${esc(key)}">${S.delArm === 'pat:' + key ? 'Emin misin?' : 'Sil'}</button></h3>
      <div class="small">${pcs.length} parça (${pcs.map((x) => esc(x.name)).join(', ')}) · toplam kesim alanı ${(area / 1e4).toFixed(1)} dm² (adetle)</div>
      <div class="small">${bad ? `⛔ ${bad} parçada hata` : '✅ parçalar geçerli'} · ${sms.length ? (sBad ? `⛔ ${sBad} / ${sms.length} dikiş eşleşmesi tutmuyor` : `✅ ${sms.length} dikiş eşleşmesi tutuyor`) : 'dikiş eşleşmesi yok'}</div></div>`;
  }
  h += `<div class="card noprint"><h3>Boş kalıp grubu aç</h3><div class="row"><label class="f"><span>Ürün</span><select id="pe-prod">${prods.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}<option value="">— ürüne bağlı değil —</option></select></label><label class="f"><span>Beden</span><input id="pe-size" placeholder="ör. M"></label><button data-a="open-pattern-new">Aç</button></div>
    <div class="small">Editörde "Yeni parça" ile köşe / eğri noktalarına dokunarak parça çizilir.</div></div>`;
  return h;
}
function openPattern(product, size) {
  const p = S.p, pr = p.collection.products.find((x) => x.id === product);
  openPatternEditor(p, { product: product || null, size: size || '', title: (pr ? pr.name : 'Kalıp') + (size ? ' · ' + size : ''), toast,
    meta: { project: p.name, product: pr?.name, size }, onChange: (closed) => { dirty(); if (closed) render(); } });
}

function tabColors() {
  const p = S.p;
  return `<div class="card noprint"><h3>Renk ekle</h3><div class="row">
    <label class="f"><span>Ad</span><input id="nc-name" placeholder="ör. Lacivert"></label>
    <label class="f"><span>Kod (Pantone, firma kodu…)</span><input id="nc-code"></label>
    <label class="f" style="flex:0 0 70px"><span>Renk</span><input id="nc-hex" type="color" value="#334155"></label>
    <button class="ok" data-a="add-color">Ekle</button></div>
    <div class="small">Ekrandaki renk yaklaşıktır; üretimde renk kodu ve onaylı numune esas alınır.</div></div>
  ${p.library.colors.map((c, i) => `<div class="card"><div class="row">
    <label class="f" style="flex:0 0 70px"><span>Renk</span><input type="color" data-f="library.colors.${i}.hex" value="${c.hex}"></label>
    <label class="f"><span>Ad</span><input data-f="library.colors.${i}.name" value="${esc(c.name)}"></label>
    <label class="f"><span>Kod</span><input data-f="library.colors.${i}.code" value="${esc(c.code)}"></label>
    <button class="danger" data-a="del-color" data-i="${i}">Sil</button></div></div>`).join('') || '<div class="small">Renk yok.</div>'}`;
}

function tabSizes() {
  const p = S.p;
  let h = `<div class="card noprint"><h3>Beden tablosu ekle</h3>
    <div class="small">Tek bir evrensel beden standardı yoktur. Kendi ölçünü, markanın tablosunu ya da kullandığın standardı yaz; kaynağı zorunludur.</div>
    <div class="row"><button class="ok" data-a="add-size">+ Boş tablo</button><button data-a="add-size-ex">+ Örnek tablo (değiştirilmek üzere)</button></div></div>`;
  p.sizeTables.forEach((t, i) => {
    const f = `sizeTables.${i}`;
    h += `<div class="card"><h3><span class="sp">${esc(t.name)}</span><button class="danger" data-a="del-size" data-i="${i}">Sil</button></h3>
      <div class="row"><label class="f"><span>Ad</span><input data-f="${f}.name" value="${esc(t.name)}"></label>
      <label class="f" style="flex:2 1 200px"><span>Kaynak / standart (zorunlu)</span><input data-f="${f}.source" value="${esc(t.source)}" class="${t.source.trim() ? '' : 'bad'}" placeholder="ör. Marka A 2026 tablosu, kendi ölçüm"></label></div>
      <div class="row"><label class="f"><span>Bedenler (virgülle)</span><input data-f="${f}.sizes" data-t="list" value="${esc(t.sizes.join(', '))}"></label></div>
      <div class="scroll"><table><tr><th>Ölçü (cm)</th>${t.sizes.map((s) => `<th>${esc(s)}</th>`).join('')}<th></th></tr>
      ${Object.entries(t.measures).map(([mn, row]) => `<tr><td style="min-width:130px"><input data-a-rename="${i}" data-old="${esc(mn)}" value="${esc(mn)}"></td>${t.sizes.map((s) => `<td><input data-f="${f}.measures.${encodeURIComponent(mn)}.${encodeURIComponent(s)}" data-t="cm" value="${num(row[s] / 10)}" inputmode="decimal"></td>`).join('')}<td><button class="danger" data-a="del-meas" data-i="${i}" data-v="${esc(mn)}">×</button></td></tr>`).join('')}
      </table></div>
      <div class="row"><input id="nm-${i}" placeholder="yeni ölçü adı (ör. Kol boyu)"><button data-a="add-meas" data-i="${i}">+ Ölçü</button></div></div>`;
  });
  return h;
}

function tabMaterials() {
  const p = S.p, br = M.PROJECT_TYPES[p.type].branches;
  const kinds = Object.entries(M.MATERIAL_KINDS).filter(([, K]) => K.branches.some((b) => br.includes(b)));
  let h = `<div class="card noprint"><h3>Malzeme ekle</h3><div class="row">
    <select id="nm-kind">${kinds.map(([k, K]) => `<option value="${k}">${K.label}</option>`).join('')}</select>
    <input id="nm-name" placeholder="ad (ör. Poplin %100 pamuk)"><button class="ok" data-a="add-mat">Ekle</button></div>
    <div class="small">Bilmediğin değeri boş bırak (uydurulmaz). Değer ölçülmediyse "tahmini" işaretle; hesaplarda ve föyde öyle gösterilir.</div></div>`;
  p.library.materials.forEach((m, i) => {
    const K = M.MATERIAL_KINDS[m.kind], f = `library.materials.${i}`;
    h += `<div class="card"><h3><span class="badge">${K.label}</span><span class="sp">${esc(m.name)}</span><button class="danger" data-a="del-mat" data-i="${i}">Sil</button></h3>
      <div class="row"><label class="f"><span>Ad</span><input data-f="${f}.name" value="${esc(m.name)}"></label>
      <label class="f"><span>Tedarikçi</span><input data-f="${f}.supplier" value="${esc(m.supplier)}"></label>
      <label class="f"><span>Birim fiyat</span><input data-f="${f}.price" data-t="num" value="${num(m.price, 2)}" inputmode="decimal" placeholder="bilinmiyor"></label>
      <label class="f"><span>Fiyat birimi</span><select data-f="${f}.priceUnit">${['m', 'm²', 'kg', 'adet', 'top', 'makara'].map((u) => `<option ${u === m.priceUnit ? 'selected' : ''}>${u}</option>`).join('')}</select></label>
      <label class="f"><span>Stok</span><input data-f="${f}.stock" data-t="num" value="${num(m.stock, 2)}" inputmode="decimal"></label></div>
      <div class="row">${K.fields.map(([k, lbl, unit, kind]) => {
        const v = m.props[k], est = m.estimated.includes(k), cm = CM_FIELDS.has(k);
        const u = cm ? 'cm' : unit;
        const inp = kind === 'bool' ? `<select data-f="${f}.props.${k}" data-t="bool"><option value="" ${v == null ? 'selected' : ''}>bilinmiyor</option><option value="1" ${v === true ? 'selected' : ''}>evet</option><option value="0" ${v === false ? 'selected' : ''}>hayır</option></select>`
          : kind === 'count' ? `<select data-f="${f}.props.${k}" data-t="ref"><option value="">—</option>${M.COUNT_SYSTEMS.map((c) => `<option ${c === v ? 'selected' : ''}>${c}</option>`).join('')}</select>`
          : kind === 'text' ? `<input data-f="${f}.props.${k}" data-t="textnull" value="${esc(v ?? '')}">`
          : `<input data-f="${f}.props.${k}" data-t="${cm ? 'cm' : 'num'}" value="${v == null ? '' : num(cm ? v / 10 : v, 3)}" inputmode="decimal" placeholder="bilinmiyor">`;
        const estBox = kind === 'num' || kind === 'pct' || kind === 'int' ? `<label class="small"><input type="checkbox" data-a="est" data-i="${i}" data-v="${k}" ${est ? 'checked' : ''}> tahmini</label>` : '';
        return `<label class="f"><span>${esc(lbl)}${u ? ' (' + u + ')' : ''}</span>${inp}${estBox}</label>`;
      }).join('')}</div></div>`;
  });
  return h + (p.library.materials.length ? '' : '<div class="small">Malzeme yok.</div>');
}

function tabTechpack() {
  const p = S.p, prs = p.collection.products;
  if (!prs.length) return '<div class="small">Föy için önce ürün ekle.</div>';
  const pr = prs.find((x) => x.id === S.fp) || prs[0];
  const i = prs.indexOf(pr), s = M.techpackSummary(p, pr.id), H = s.header;
  const mt = s.sizeTable;
  return `<div class="row noprint"><select id="fp-sel">${prs.map((x) => `<option value="${x.id}" ${x.id === pr.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
    <select data-f="collection.products.${i}.techpack.status"><option value="taslak" ${pr.techpack.status === 'taslak' ? 'selected' : ''}>Taslak</option><option value="numune" ${pr.techpack.status === 'numune' ? 'selected' : ''}>Numune</option><option value="onaylı" ${pr.techpack.status === 'onaylı' ? 'selected' : ''}>Onaylı</option></select>
    <button data-a="print">🖨 Yazdır / PDF</button></div>
  <div class="card"><h3><span class="sp">Teknik föy · ${esc(H.product)}</span><span class="badge">${esc(H.status)}</span></h3>
    <table><tr><th>Proje</th><td>${esc(H.project)}</td><th>Koleksiyon</th><td>${esc(H.collection) || '—'}</td></tr>
    <tr><th>Model kodu</th><td>${esc(H.modelCode) || '—'}</td><th>Dal / tür</th><td>${esc(H.branch)} · ${esc(H.type)}</td></tr>
    <tr><th>Revizyon</th><td>${H.rev}</td><th>Tarih</th><td>${date(Date.now())}</td></tr></table></div>
  <div class="card"><h3>Renkler</h3>${s.colors.map((c) => `<span class="sw" style="background:${c.hex}"></span> ${esc(c.name)} ${c.code ? '(' + esc(c.code) + ')' : ''}`).join(' · ') || '<span class="small">yok</span>'}</div>
  <div class="card"><h3>Ölçü tablosu (cm)</h3>${mt ? `<div class="small">${esc(mt.name)} — kaynak: ${esc(mt.source) || '⚠ yazılmamış'}</div><div class="scroll"><table><tr><th></th>${mt.sizes.map((z) => `<th>${esc(z)}</th>`).join('')}</tr>${Object.entries(mt.measures).map(([k, row]) => `<tr><td>${esc(k)}</td>${mt.sizes.map((z) => `<td>${row[z] == null ? '—' : num(row[z] / 10)}</td>`).join('')}</tr>`).join('')}</table></div>` : '<span class="small">Beden tablosu seçilmemiş</span>'}</div>
  <div class="card"><h3>Malzeme listesi</h3><table><tr><th>Malzeme</th><th>Tür</th><th>Kullanım</th><th>Miktar</th></tr>${s.materials.map((m) => `<tr><td>${esc(m.name)}${m.estimated.length ? ' <span class="badge">tahmini değer var</span>' : ''}</td><td>${m.kind}</td><td>${ROLE[m.role] || m.role}</td><td>${m.qty == null ? 'bilinmiyor' : num(m.qty, 3) + ' ' + m.unit}</td></tr>`).join('')}</table>
    <div class="small" style="margin-top:6px">Malzeme maliyeti: ${num(s.cost.total, 2)}${s.cost.complete ? '' : ' — <b>eksik</b>: ' + esc(s.cost.missing.join(', '))}. İşçilik ve genel giderler bu aşamada yok (Aşama 10).</div></div>
  <div class="card"><h3>Varyantlar (${s.variants.length})</h3><div class="small">${s.variants.map((v) => esc(v.sku)).join(' · ')}</div></div>
  <div class="card"><h3>Üretim notları</h3><textarea data-f="collection.products.${i}.techpack.notes" rows="4">${esc(pr.techpack.notes)}</textarea></div>
  ${s.issues.length ? `<div class="card"><h3>Bu ürünün sorunları</h3>${s.issues.map((x) => `<div class="issue ${x.level}">${x.level === 'hata' ? '⛔' : '⚠'} ${esc(x.msg)}</div>`).join('')}</div>` : ''}`;
}

function tabValidation(issues) {
  if (!issues.length) return '<div class="card">✅ Sorun bulunmadı.</div>';
  return `<div class="small">⛔ hata: veri tutarsız, düzeltilmeli. ⚠ uyarı: eksik bilgi.</div>` + issues.map((x) => `<div class="issue ${x.level}">${x.level === 'hata' ? '⛔' : '⚠'} <b>${esc(x.where)}</b>: ${esc(x.msg)}</div>`).join('');
}

let revCache = null;
function tabRevisions() {
  if (!revCache) { store.revisions(S.p.id).then((r) => { revCache = r; if (S.tab === 'revs') render(); }); return '<div class="small">Yükleniyor…</div>'; }
  if (!revCache.length) return '<div class="small">Henüz revizyon yok. "Revizyon kaydet" ile projenin o anki hâli saklanır; otomatik kayıt revizyon açmaz.</div>';
  return `<table>${[...revCache].reverse().map((r) => `<tr><td><b>rev ${r.rev}</b><div class="small">${date(r.at)}</div></td><td>${esc(r.note) || '<span class="small">not yok</span>'}${r.valid ? '' : ' <span class="badge">hatalı</span>'}</td>
    <td style="text-align:right">${r.rev === S.p.rev ? '<span class="small">güncel</span>' : `<button data-a="restore" data-v="${r.rev}">Geri dön</button>`}</td></tr>`).join('')}</table>
    <div class="small">Geri dönmek yeni bir revizyon oluşturur; geçmiş silinmez. Proje başına son 30 revizyon saklanır.</div>`;
}

function tabTools() {
  const br = M.PROJECT_TYPES[S.p.type].branches;
  const rows = [];
  if (br.includes('woven')) rows.push(['Dokuma / Konfeksiyon', [['Beden büyütme (grading)', 4], ['Kumaş yerleşimi ve kesim planı', 7], ['3B giysi', 9]]]);
  if (br.includes('knit')) rows.push(['Triko / Örgü', [ ['İlmek ve örgü deseni (düz, ters, ribana, saç örgüsü, jakar)', 5], ['Numune, ilmek / sıra yoğunluğu', 5], ['Bedene göre ilmek sayıları', 4], ['Makine profili ve üretim çıktısı', 8], ['3B triko', 9]]]);
  return `<div class="card">✅ Teknik çizim (Aşama 2): "Teknik çizim" sekmesi.${br.includes('woven') ? ' ✅ Dokuma kalıbı (Aşama 3): "Kalıp" sekmesi.' : ''}</div><div class="small">Aşağıdaki araçlar henüz uygulanmadı. Hangi aşamada geleceği yazılı; şu an kullanılabilir gibi gösterilmez.</div>` +
    rows.map(([t, items]) => `<div class="card"><h3>${t}</h3>${items.map(([n, a]) => `<div class="row"><span>${esc(n)}</span><span class="badge" style="flex:0 0 auto">Henüz yok · Aşama ${a}</span></div>`).join('')}</div>`).join('');
}

/* ---------- düzenleme ---------- */
function setPath(obj, path, val) {
  const ks = path.split('.').map(decodeURIComponent);
  let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null) o[ks[i]] = {}; o = o[ks[i]]; }
  o[ks.at(-1)] = val;
}
function readInput(el) {
  const t = el.dataset.t, v = el.value;
  if (t === 'num') return parseNum(v);
  if (t === 'cm') { const x = parseNum(v); return x == null || Number.isNaN(x) ? x : Math.round(x * 100) / 10; }
  if (t === 'bool') return v === '' ? null : v === '1';
  if (t === 'ref') return v === '' ? null : v;
  if (t === 'textnull') return v.trim() === '' ? null : v.trim();
  if (t === 'list') return [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))];
  return v;
}
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!S.p || !el.dataset.f) return;
  const v = readInput(el);
  el.classList.toggle('bad', typeof v === 'number' && Number.isNaN(v));
  setPath(S.p, el.dataset.f, Number.isNaN(v) ? NaN : v);
  dirty();
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'ap-branch') { S.addBranch = el.value; return render(); }
  if (el.id === 'fp-sel') { S.fp = el.value; return render(); }
  if (el.id === 'pt-set') { S.patSet = el.value; return render(); }
  if (el.id === 'pt-table') { S.patTable = el.value; S.patSize = null; return render(); }
  if (el.id === 'pt-size') { S.patSize = el.value; return render(); }
  if (el.dataset.aRename !== undefined) {
    const t = S.p.sizeTables[+el.dataset.aRename], nm = el.value.trim(), old = el.dataset.old;
    if (nm && nm !== old && !(nm in t.measures)) { t.measures = Object.fromEntries(Object.entries(t.measures).map(([k, v]) => [k === old ? nm : k, v])); dirty(); }
    return render();
  }
  if (!S.p || !el.dataset.f) return;
  // NaN kalıcı veriye yazılmaz: geçersiz giriş eski değere döner
  const v = readInput(el);
  if (typeof v === 'number' && Number.isNaN(v)) { toast('Sayı değil: "' + el.value + '"'); setPath(S.p, el.dataset.f, null); }
  // ürün türü / beden tablosu değişince seçili bedenler tabloda yoksa temizlenir
  const m = el.dataset.f.match(/^collection\.products\.(\d+)\.sizeTable$/);
  if (m) { const pr = S.p.collection.products[+m[1]], t = S.p.sizeTables.find((x) => x.id === pr.sizeTable); pr.sizes = t ? pr.sizes.filter((s) => t.sizes.includes(s)) : []; }
  dirty(); render();
});

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a, p = S.p, i = +b.dataset.i;
  if (a !== 'del' && a !== 'del-prod' && a !== 'del-sketch' && a !== 'del-pattern') S.delArm = null;
  try {
    switch (a) {
      // tür seçimi yerinde güncellenir (yeniden çizim yok: yazılan proje adı kaybolmaz)
      case 'type': S.newType = b.dataset.v; document.querySelectorAll('[data-a="type"]').forEach((x) => x.classList.toggle('on', x.dataset.v === S.newType)); $('np-desc').textContent = TYPE_DESC[S.newType]; return;
      case 'create': {
        const np = M.createProject({ name: $('np-name').value, type: S.newType, season: $('np-season').value, brand: $('np-brand').value });
        await store.put(np);
        try { navigator.storage?.persist?.(); } catch (er) { /* */ }
        S.p = np; S.view = 'proj'; S.tab = 'col'; revCache = null; toast('Proje oluşturuldu'); return render();
      }
      case 'open': S.p = await store.get(b.dataset.id); S.view = 'proj'; S.tab = 'col'; revCache = null; return render();
      case 'del':
        if (S.delArm !== b.dataset.id) { S.delArm = b.dataset.id; return render(); }
        await store.remove(b.dataset.id); S.delArm = null; toast('Silindi'); return render();
      case 'import': {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = async () => { try { const q = await store.importJSON(await inp.files[0].text()); toast('İçe aktarıldı: ' + q.name); render(); } catch (er) { toast('⚠ ' + er.message); } };
        inp.click(); return;
      }
      case 'home': await flush(); S.view = 'home'; S.p = null; return render();
      case 'tab': S.tab = b.dataset.v; if (S.tab === 'revs') revCache = null; return render();
      case 'export': {
        await flush();
        const url = URL.createObjectURL(new Blob([store.exportJSON(p)], { type: 'application/json' }));
        const l = document.createElement('a'); l.href = url; l.download = p.name.replace(/[^\wçğıöşüÇĞİÖŞÜ -]+/g, '_') + '.tekstil.json'; l.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000); return;
      }
      case 'commit': clearTimeout(saveT); saveT = null; await store.commit(p, $('rev-note').value); revCache = null; toast('Revizyon ' + p.rev + ' kaydedildi'); $('saved').textContent = 'rev ' + p.rev; return render();
      case 'restore': S.p = await store.restore(p.id, +b.dataset.v); revCache = null; toast('Rev ' + b.dataset.v + ' geri yüklendi (yeni rev ' + S.p.rev + ')'); return render();
      case 'add-prod': {
        const br = M.PROJECT_TYPES[p.type].branches, branch = $('ap-branch') ? $('ap-branch').value : br[0];
        M.addProduct(p, { branch, type: $('ap-type').value, name: $('ap-name').value, modelCode: $('ap-code').value }); break;
      }
      case 'del-prod': {
        const pr = p.collection.products[i];
        if (S.delArm !== pr.id) { S.delArm = pr.id; return render(); }
        p.collection.products.splice(i, 1); S.delArm = null; break;
      }
      case 'tog-color': case 'tog-size': {
        const pr = p.collection.products[i], arr = a === 'tog-color' ? pr.colors : pr.sizes, v = b.dataset.v, k = arr.indexOf(v);
        if (k >= 0) arr.splice(k, 1); else arr.push(v);
        if (a === 'tog-size') { const t = p.sizeTables.find((x) => x.id === pr.sizeTable); pr.sizes = t.sizes.filter((s) => pr.sizes.includes(s)); }
        break;
      }
      case 'link': M.linkMaterial(p, p.collection.products[i].id, $('lk-mat-' + i).value, $('lk-role-' + i).value, null); break;
      case 'unlink': p.collection.products[i].materials.splice(+b.dataset.j, 1); break;
      case 'add-sketch': { const sk = M.addSketch(p, { name: $('nd-name').value, product: $('nd-prod').value || null }); dirty(); render(); openSketch(p.sketches.indexOf(sk)); return; }
      case 'open-sketch': openSketch(i); return;
      case 'del-sketch': { const sk = p.sketches[i]; if (S.delArm !== sk.id) { S.delArm = sk.id; return render(); } p.sketches.splice(i, 1); S.delArm = null; break; }
      case 'add-pattern': {
        const set = $('pt-set').value, params = {};
        for (const inp of document.querySelectorAll('[data-pt]')) { const v = parseNum(inp.value); if (v == null || Number.isNaN(v) || v < 0) throw new Error(SETS[set].params[inp.dataset.pt][0] + ': geçerli bir cm değeri gir'); params[inp.dataset.pt] = Math.round(v * 100) / 10; }
        const size = $('pt-size') ? $('pt-size').value : $('pt-size-free').value.trim();
        const product = $('pt-prod').value || null;
        M.addPatternSet(p, set, params, { product, size }); dirty(); render(); openPattern(product, size); return;
      }
      case 'open-pattern': { const [pid, sz] = b.dataset.v.split('|'); openPattern(pid, sz); return; }
      case 'open-pattern-new': openPattern($('pe-prod').value, $('pe-size').value.trim()); return;
      case 'del-pattern': {
        const key = b.dataset.v; if (S.delArm !== 'pat:' + key) { S.delArm = 'pat:' + key; return render(); }
        const [pid, sz] = key.split('|'), gone = new Set(p.woven.pieces.filter((x) => (x.product ?? '') === pid && (x.size ?? '') === sz).map((x) => x.id));
        p.woven.pieces = p.woven.pieces.filter((x) => !gone.has(x.id)); p.woven.seams = p.woven.seams.filter((sm) => ![...sm.a, ...sm.b].some((r) => gone.has(r.piece))); S.delArm = null; break;
      }
      case 'add-color': M.addColor(p, { name: $('nc-name').value, code: $('nc-code').value, hex: $('nc-hex').value }); break;
      case 'del-color': {
        const c = p.library.colors[i]; let n = 0;
        for (const pr of p.collection.products) { const k = pr.colors.indexOf(c.id); if (k >= 0) { pr.colors.splice(k, 1); n++; } }
        p.library.colors.splice(i, 1); if (n) toast(`Renk ${n} üründen de çıkarıldı`); break;
      }
      case 'add-size': M.addSizeTable(p, { name: 'Beden tablosu ' + (p.sizeTables.length + 1), source: '', sizes: ['S', 'M', 'L'], measures: { 'Göğüs çevresi': {} } }); break;
      case 'add-size-ex': M.exampleSizeTable(p, p.type === 'knit' ? 'knit' : 'woven'); break;
      case 'del-size': {
        const t = p.sizeTables[i], users = p.collection.products.filter((pr) => pr.sizeTable === t.id);
        if (users.length) { toast('Bu tablo ' + users.map((u) => u.name).join(', ') + ' tarafından kullanılıyor; önce ürünlerden kaldır'); return; }
        p.sizeTables.splice(i, 1); break;
      }
      case 'add-meas': { const nm = $('nm-' + i).value.trim(); const t = p.sizeTables[i]; if (!nm) return toast('Ölçü adı yaz'); if (nm in t.measures) return toast('Bu ölçü zaten var'); t.measures[nm] = {}; break; }
      case 'del-meas': delete p.sizeTables[i].measures[b.dataset.v]; break;
      case 'add-mat': M.addMaterial(p, $('nm-kind').value, { name: $('nm-name').value }); break;
      case 'del-mat': {
        const m = p.library.materials[i], users = p.collection.products.filter((pr) => pr.materials.some((l) => l.mat === m.id));
        if (users.length) { toast('Bu malzeme ' + users.map((u) => u.name).join(', ') + ' ürününde kullanılıyor; önce üründen kaldır'); return; }
        p.library.materials.splice(i, 1); break;
      }
      case 'est': { const m = p.library.materials[i], k = b.dataset.v, j = m.estimated.indexOf(k); if (j >= 0) m.estimated.splice(j, 1); else m.estimated.push(k); dirty(); return; }
      case 'print': window.print(); return;
      default: return;
    }
    dirty(); render();
  } catch (er) { toast('⚠ ' + er.message); }
});
window.addEventListener('pagehide', () => { if (saveT && S.p) { clearTimeout(saveT); store.put(S.p); } });

render();
