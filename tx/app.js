// Tekstil ve Moda çalışma alanı — arayüz (Aşama 1: ortak proje altyapısı).
// Hesap ve doğrulama tx/model.js'te; burada yalnız gösterim ve düzenleme.
// Makine ve Mühendislik alanının hiçbir dosyasını içe aktarmaz.
import * as M from './model.js?v=20261112k';
import { openStore, idbBackend, memoryBackend } from './store.js?v=20261112k';
import { TEMPLATES, VIEWS } from './drawing.js?v=20261112k';
import { openSketchEditor } from './sketch-ui.js?v=20261112k';
import { SETS, defaultParams } from './woven/blocks.js?v=20261112k';
import { openPatternEditor } from './woven/pattern-ui.js?v=20261112k';
import { validatePiece, seamCheck, measure } from './woven/pattern.js?v=20261112k';
import { sizeTable as gradeTable } from './woven/grade.js?v=20261112k';
import { TEMPLATES as KTPL, validateChart } from './knit/chart.js?v=20261112k';
import { KNIT_PIECES, gradeKnit, widthOf } from './knit/shape.js?v=20261112k';
import { openChartEditor } from './knit/chart-ui.js?v=20261112k';
import { PRESETS, allCounts } from './materials.js?v=20261112k';
import { openMarkerEditor } from './woven/marker-ui.js?v=20261112k';
import * as MC from './knit/machine.js?v=20261112k';
import * as FIT from './sim3d/fit.js?v=20261112k';
import * as DR from './sim3d/drape.js?v=20261112k';
import { open3D, fitScene, drapeScene } from './sim3d/view3d.js?v=20261112k';
import { OP_MACHINES, OP_TEMPLATES, opsSummary } from './production.js?v=20261112k';
import { productionPDF } from './production-pdf.js?v=20261112k';
import { writeAAMA } from './woven/dxf-aama.js?v=20261112k';
import { saveBlob, safeName } from './download.js?v=20261112k';

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
const TABS = [['col', 'Koleksiyon'], ['draw', 'Teknik çizim'], ['pat', 'Kalıp'], ['knit', 'Örgü'], ['colors', 'Renkler'], ['sizes', 'Bedenler'], ['mats', 'Malzemeler'], ['tp', 'Föy'], ['val', 'Doğrulama'], ['revs', 'Revizyonlar'], ['tools', 'Dal araçları']];
// Yeniden çizimde odaktaki alan (ve imleç) korunur: telefonda bir alandan ötekine geçerken klavye kapanmasın
function render() {
  const ae = document.activeElement, key = ae && ae !== document.body ? (ae.dataset?.f ? `[data-f="${ae.dataset.f}"]` : ae.id ? '#' + CSS.escape(ae.id) : null) : null;
  let sel = null; try { sel = key && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null; } catch (e) { sel = null; }
  renderNow();
  if (key && document.activeElement !== ae) { const el = document.querySelector(key); if (el && el !== ae) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(...sel); } catch (e) { /* seçim desteklenmiyor */ } } }
}
let renderT = null;
// alan değişiminden sonraki ertelenmiş çizim: kaydedilmemiş geçici alanlar (data-f'siz, id'li) yazılan değeri korur
const deferRender = () => {
  clearTimeout(renderT);
  renderT = setTimeout(() => {
    const keep = new Map(); document.querySelectorAll('#main input[id]:not([data-f]), #main textarea[id]:not([data-f])').forEach((el) => { if (el.type !== 'checkbox' && el.type !== 'file') keep.set(el.id, el.value); });
    render();
    for (const [id, v] of keep) { const el = document.getElementById(id); if (el && el.value !== v) el.value = v; }
  }, 0);
};
function renderNow() {
  if (S.view === 'home') return renderHome();
  const p = S.p, T = M.PROJECT_TYPES[p.type];
  const issues = M.validate(p), nErr = issues.filter((x) => x.level === 'hata').length;
  $('top').querySelector('h1').textContent = p.name;
  const tabs = TABS.filter(([k]) => (k !== 'pat' || p.woven) && (k !== 'knit' || p.knit)).map(([k, l]) => `<button data-a="tab" data-v="${k}" class="${S.tab === k ? 'on' : ''}">${l}${k === 'val' && issues.length ? ` (${nErr ? '⛔' + nErr : '⚠' + issues.length})` : ''}</button>`).join('');
  if ((S.tab === 'pat' && !p.woven) || (S.tab === 'knit' && !p.knit)) S.tab = 'col';
  const body = { col: tabCollection, draw: tabDrawings, pat: tabPatterns, knit: tabKnit, colors: tabColors, sizes: tabSizes, mats: tabMaterials, tp: tabTechpack, val: () => tabValidation(issues), revs: tabRevisions, tools: tabTools }[S.tab]();
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
    <div class="row"><button class="ok" data-a="add-pattern">Oluştur ve aç</button><button data-a="dxf-in">⬆ DXF (AAMA) içe aktar</button></div>
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
      <div class="small">${bad ? `⛔ ${bad} parçada hata` : '✅ parçalar geçerli'} · ${sms.length ? (sBad ? `⛔ ${sBad} / ${sms.length} dikiş eşleşmesi tutmuyor` : `✅ ${sms.length} dikiş eşleşmesi tutuyor`) : 'dikiş eşleşmesi yok'}${pcs[0].gradedFrom ? ` · ${esc(pcs[0].gradedFrom.base)} bedeninden yayıldı (${esc(pcs[0].gradedFrom.how)})` : ''}</div>
      ${(() => { const mk = (p.woven.markers || []).find((x) => (x.product ?? '') === pid && (x.size ?? '') === sz); return mk ? `<div class="small">✂ Kesim planı: boy ${num(mk.length / 10)} cm · verim %${num(mk.efficiency * 100)} · ${mk.mode === 'folded' ? 'katlı' : 'açık en'}</div>` : ''; })()}
      <div class="row noprint"><button data-a="fit3d" data-v="${esc(key)}">🧍 3B önizleme</button><button data-a="marker-open" data-v="${esc(key)}">✂ Kumaş yerleşimi</button><button data-a="dxf-out" data-v="${esc(key)}">⬇ DXF (AAMA)</button>${pcs[0].gradedFrom ? '' : `<button data-a="grade-open" data-v="${esc(key)}">📐 Bedenlere yay (grading)</button>`}</div>
      ${S.gradeKey === key ? gradeForm(pid, sz) : ''}</div>`;
  }
  h += `<div class="card noprint"><h3>Boş kalıp grubu aç</h3><div class="row"><label class="f"><span>Ürün</span><select id="pe-prod">${prods.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}<option value="">— ürüne bağlı değil —</option></select></label><label class="f"><span>Beden</span><input id="pe-size" placeholder="ör. M"></label><button data-a="open-pattern-new">Aç</button></div>
    <div class="small">Editörde "Yeni parça" ile köşe / eğri noktalarına dokunarak parça çizilir.</div></div>`;
  return h;
}
function tabKnit() {
  const p = S.p, K = p.knit, prods = p.collection.products.filter((x) => x.branch === 'knit'), yarns = p.library.materials.filter((m) => m.kind === 'yarn');
  let h = `<div class="card"><h3>Numuneler (gauge)</h3><div class="small">Bütün ilmek / sıra hesapları numuneye dayanır. Numuneyi yıkayıp kurutduktan sonra 10 cm'deki ilmek ve sıra sayısını ölç; yıkanmamış numune "uyarı" verir.</div>
    ${K.swatches.map((s, i) => `<div class="row"><label class="f"><span>Ad</span><input data-f="knit.swatches.${i}.name" value="${esc(s.name)}"></label>
      <label class="f"><span>İplik</span><select data-f="knit.swatches.${i}.yarn" data-t="ref"><option value="">—</option>${yarns.map((y) => `<option value="${y.id}" ${y.id === s.yarn ? 'selected' : ''}>${esc(y.name)}</option>`).join('')}</select></label>
      <label class="f"><span>İlmek / 10 cm</span><input data-f="knit.swatches.${i}.st10" data-t="num" inputmode="decimal" value="${num(s.st10)}"></label>
      <label class="f"><span>Sıra / 10 cm</span><input data-f="knit.swatches.${i}.row10" data-t="num" inputmode="decimal" value="${num(s.row10)}"></label>
      <label class="small"><input type="checkbox" data-a="sw-wash" data-i="${i}" ${s.washed ? 'checked' : ''}> yıkanmış</label></div>
      <div class="row"><label class="f"><span>İlmek boyu (mm, ölçülen)</span><input data-f="knit.swatches.${i}.loopLen" data-t="num" inputmode="decimal" value="${num(s.loopLen, 2)}" placeholder="bilinmiyor"></label>
      <label class="f"><span>Numune ağırlığı (g)</span><input data-f="knit.swatches.${i}.weightG" data-t="num" inputmode="decimal" value="${num(s.weightG, 2)}" placeholder="—"></label>
      <label class="f"><span>Tartılan numune ilmek</span><input data-f="knit.swatches.${i}.wSt" data-t="num" inputmode="numeric" value="${num(s.wSt, 0)}" placeholder="—"></label>
      <label class="f"><span>… sıra</span><input data-f="knit.swatches.${i}.wRows" data-t="num" inputmode="numeric" value="${num(s.wRows, 0)}" placeholder="—"></label></div>`).join('') || '<div class="small">Numune yok.</div>'}
    <div class="row noprint"><label class="f"><span>Ad</span><input id="ns-name" placeholder="ör. Merinos düz"></label><label class="f"><span>İlmek / 10 cm</span><input id="ns-st" inputmode="decimal" placeholder="ör. 28"></label><label class="f"><span>Sıra / 10 cm</span><input id="ns-row" inputmode="decimal" placeholder="ör. 38"></label><button class="ok" data-a="add-swatch">+ Numune</button></div></div>`;
  h += `<div class="card"><h3>Örgü desenleri</h3><div class="row noprint"><label class="f"><span>Başlangıç</span><select id="nk-tpl">${Object.entries(KTPL).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('')}</select></label><label class="f"><span>Ad</span><input id="nk-name"></label><button class="ok" data-a="add-chart">Oluştur ve aç</button></div>
    ${K.charts.map((c, i) => { const v = validateChart(c), e = v.filter((x) => x.level === 'hata').length; return `<div class="row"><span style="flex:3 1 160px"><b>${esc(c.name)}</b><div class="small">${c.w} ilmek × ${c.h} sıra${c.repeat ? ` · tekrar ${c.repeat.w}×${c.repeat.h}` : ''}${c.palette.length > 1 ? ` · ${c.palette.length} renk` : ''} · ${e ? `⛔ ${e} hata` : v.length ? `⚠ ${v.length} uyarı` : '✅'}</div></span><button class="on" data-a="open-chart" data-i="${i}">Aç</button><button class="danger" data-a="del-chart" data-i="${i}">${S.delArm === c.id ? 'Emin misin?' : 'Sil'}</button></div>`; }).join('') || '<div class="small">Desen yok.</div>'}</div>`;
  const kind = S.kpKind && KNIT_PIECES[S.kpKind] ? S.kpKind : 'beden';
  h += `<div class="card noprint"><h3>Triko parçası (ilmek hesabı)</h3><div class="row">
    <label class="f"><span>Parça</span><select id="kp-kind">${Object.entries(KNIT_PIECES).map(([k, v]) => `<option value="${k}" ${k === kind ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
    <label class="f"><span>Ürün</span><select id="kp-prod">${prods.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}<option value="">— bağlı değil —</option></select></label>
    <label class="f"><span>Beden</span><input id="kp-size" placeholder="ör. M"></label>
    <label class="f"><span>Numune</span><select id="kp-sw">${K.swatches.map((s) => `<option value="${s.id}">${esc(s.name)} (${num(s.st10)} / ${num(s.row10)})</option>`).join('')}</select></label>
    <label class="f"><span>Desen (tekrar korunur)</span><select id="kp-ch"><option value="">— yok —</option>${K.charts.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
    <label class="f"><span>Ribana</span><select id="kp-rib"><option value="rib11">1×1</option><option value="rib22">2×2</option></select></label></div>
    <div class="row">${Object.entries(KNIT_PIECES[kind].params).map(([k, [lbl, v]]) => `<label class="f"><span>${esc(lbl)} (cm)</span><input data-kp="${k}" inputmode="decimal" value="${num(v / 10)}"></label>`).join('')}</div>
    <div class="row"><button class="ok" data-a="add-kpiece" ${K.swatches.length ? '' : 'disabled'}>Hesapla ve ekle</button></div>${K.swatches.length ? '' : '<div class="small">Önce numune ekle.</div>'}</div>`;
  h += tabMachines();
  K.pieces.forEach((pc, i) => {
    let r = null, err = ''; try { r = M.knitCompute(p, pc); } catch (e) { err = e.message; }
    const pr = p.collection.products.find((x) => x.id === pc.product), sw = K.swatches.find((x) => x.id === pc.swatch);
    h += `<div class="card"><h3><span class="sp">${esc(pc.name)}${pr ? ' · ' + esc(pr.name) : ''}${pc.size ? ' · Beden ' + esc(pc.size) : ''}</span>${pc.kind === 'beden' && !err ? `<button data-a="kfit3d" data-i="${i}">🧍 3B</button>` : ''}<button class="danger" data-a="del-kpiece" data-i="${i}">${S.delArm === pc.id ? 'Emin misin?' : 'Sil'}</button></h3>`;
    if (err) h += `<div class="issue hata">⛔ ${esc(err)}</div>`;
    else {
      h += `<div class="small">Numune ${esc(sw.name)}: ${num(sw.st10)} ilmek × ${num(sw.row10)} sıra / 10 cm${sw.washed ? '' : ' · ⚠ yıkanmamış'} · ilmek sayısı ${r.mult} ve 2 kenar ilmeğine uyduruldu</div>
        <div class="row"><b>Başlangıç: ${r.castOn} ilmek</b><b>${r.rows} sıra</b>${r.end ? `<b>Sonda: ${r.end} ilmek</b>` : ''}<span class="small">Genişlik farkı ${r.widthDiff >= 0 ? '+' : ''}${num(r.widthDiff / 10, 2)} cm</span></div>
        <table>${r.plan.map((x) => `<tr><td class="small">${x.from}–${x.to}. sıra</td><td>${esc(x.text)}</td></tr>`).join('')}</table>`;
      const tb = p.sizeTables.find((t) => t.measures['Göğüs çevresi'] && t.sizes.includes(pc.size));
      if (tb && pc.kind !== 'atki') {
        const ch = pc.chart ? K.charts.find((c) => c.id === pc.chart) : null;
        const gr = gradeKnit(pc.kind, pc.params, sw, tb, tb.sizes, { rep: ch ? (ch.repeat ? ch.repeat.w : ch.w) : 1, ribRep: pc.rib === 'rib22' ? 4 : 2, edge: 1, base: pc.size });
        h += `<div class="small" style="margin-top:6px">Bedenlere göre (${esc(tb.name)}, göğüs çevresinden; desen tekrarı korunur):</div><div class="scroll"><table><tr><th></th>${gr.map((g) => `<th>${esc(g.size)}</th>`).join('')}</tr>
          <tr><td>Başlangıç ilmeği</td>${gr.map((g) => `<td>${g.ok ? g.castOn : '⛔'}</td>`).join('')}</tr>${pc.kind === 'kol' ? `<tr><td>Pazu ilmeği</td>${gr.map((g) => `<td>${g.ok ? g.end : '—'}</td>`).join('')}</tr>` : ''}
          <tr><td>Genişlik (cm)</td>${gr.map((g) => `<td>${g.ok ? num(widthOf(g.end || g.castOn, sw) / 10) : '—'}</td>`).join('')}</tr></table></div>`;
      }
    }
    h += '</div>';
  });
  return h;
}
// Aşama 8: makine profilleri ve üretim çıktıları
// Aşama 9: fiziksel dökümlülük benzetimi (model) ve referansla karşılaştırma
const drapeSig = DR.drapeSig, drapeVerdict = DR.drapeVerdict;
function drapeCard(m, i) {
  const v = drapeVerdict(m), sm = m.sim;
  return `<div class="card" style="background:#0b1730;margin-top:6px"><b>Dökümlülük benzetimi (fiziksel model)</b>
    <div class="small">Cusick düzeni (30 cm numune, 18 cm disk), XPBD kütle-kısıt modeli. "Etkin eğilme" modelin parametresidir (KES / Peirce ölçümüyle birebir aynı değil); referans numunenin ölçülen katsayısıyla kalibre edilir. Öz-çarpışma yok.</div>
    ${sm ? `<div class="row"><b>Katsayı ${num(sm.dc, 2)}</b><span class="small">${sm.nodes} dalga · eğilme ${num(sm.bend, 2)} μN·m${sm.calibrated ? ' (kalibre)' : ''} · ${sm.ms} ms</span></div><div class="issue ${v.level === 'ok' ? '' : v.level}">${v.level === 'ok' ? '✅' : v.level === 'hata' ? '⛔' : '⚠'} ${esc(v.text)}</div>` : ''}
    <div class="row noprint"><button data-a="drape-run" data-i="${i}">▶ Benzet</button><button data-a="drape-cal" data-i="${i}" ${m.props.drapeRef != null ? '' : 'disabled'}>⚙ Ölçüme kalibre et</button>${sm ? `<button data-a="drape-view" data-i="${i}">🧊 3B gör</button>` : ''}</div></div>`;
}
let lastDrape = null;
function tabMachines() {
  const p = S.p, K = p.knit;
  let h = `<div class="card"><h3>Örgü makineleri</h3><div class="small">Şablonlar genel tipik değerlerdir, gerçek bir makine değildir. Kendi makinenin marka / modelini ve değerlerini gir, o makinede numune örüp sonucu doğrula. Doğrulanmamış profilin bütün çıktıları "yalnız numune için" başlığı taşır. Stoll, Shima Seiki, Steiger yerel program biçimleri kapalı / lisanslıdır ve üretilmez; elektronik makine için açık <b>knitout</b> ara biçimi verilir.</div>`;
  K.machines.forEach((m, i) => {
    const f = `knit.machines.${i}`, st = MC.machineStatus(m), nI = (k, lbl, d = 0) => `<label class="f"><span>${lbl}${m.estimated?.includes(k) ? ' (tahmini)' : ''}</span><input data-f="${f}.${k}" data-t="num" inputmode="decimal" value="${num(m[k], d)}"></label>`;
    h += `<div class="card" style="background:#0b1730"><div class="row"><label class="f"><span>Ad</span><input data-f="${f}.name" value="${esc(m.name)}"></label><label class="f"><span>Marka</span><input data-f="${f}.brand" value="${esc(m.brand)}"></label><label class="f"><span>Model</span><input data-f="${f}.model" value="${esc(m.model)}"></label><button class="danger" data-a="del-machine" data-i="${i}">${S.delArm === m.id ? 'Emin misin?' : 'Sil'}</button></div>
      <div class="small">${esc(MC.MACHINE_KINDS[m.kind])} · ${esc(MC.gaugeLabel(m))} · ${esc(MC.PATTERNING[m.patterning])}</div>
      <div class="row">${nI('pitch', 'İğne aralığı (mm)', 3)}${nI('needles', 'İğne sayısı')}<label class="f"><span>Plaka</span><select data-f="${f}.beds" data-t="num">${[1, 2].map((v) => `<option ${m.beds === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>${nI('carriers', 'Besleyici')}${nI('maxRack', 'En çok kaydırma (iğne)')}${m.cardMinRows != null ? nI('cardMinRows', 'Kart en az sıra') : ''}</div>
      <div class="issue ${st.level === 'ok' ? '' : st.level}">${st.level === 'ok' ? '✅' : st.level === 'hata' ? '⛔' : '⚠'} ${esc(st.text)}</div>
      ${st.ready ? '' : `<div class="row noprint"><label class="f" style="flex:3 1 200px"><span>Doğrulama notu (hangi numune örüldü, ne ölçüldü)</span><input id="mv-note-${i}" placeholder="ör. 28/38 düz numune örüldü, 10 cm ölçü tuttu"></label><button class="ok" data-a="mc-verify" data-i="${i}">Makinede doğrulandı</button></div>`}</div>`;
  });
  h += `<div class="row noprint"><label class="f"><span>Şablon</span><select id="nm-mtpl">${MC.MACHINE_TEMPLATES.map((t) => `<option value="${t.key}">${esc(t.label)}</option>`).join('')}</select></label><button class="ok" data-a="add-machine">+ Makine</button></div></div>`;
  if (!K.machines.length) return h;
  const R = S.mo || {};
  h += `<div class="card"><h3>Makine çıktısı</h3><div class="row">
    <label class="f"><span>Makine</span><select id="mo-mc">${K.machines.map((m) => `<option value="${m.id}" ${R.mc === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
    <label class="f"><span>Triko parçası</span><select id="mo-pc"><option value="">—</option>${K.pieces.map((x) => `<option value="${x.id}" ${R.pc === x.id ? 'selected' : ''}>${esc(x.name)}${x.size ? ' · ' + esc(x.size) : ''}</option>`).join('')}</select></label>
    <label class="f"><span>Desen</span><select id="mo-ch"><option value="">—</option>${K.charts.map((c) => `<option value="${c.id}" ${R.ch === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
    <div class="row"><label class="f"><span>knitout panel eni (iğne)</span><input id="mo-w" inputmode="numeric" placeholder="desen eni"></label><label class="f"><span>… sıra</span><input id="mo-h" inputmode="numeric" placeholder="desen boyu"></label></div>
    <div class="row noprint"><button data-a="mo-check">Uyumluluk</button><button data-a="mo-prog">⬇ Operatör programı</button><button data-a="mo-card">⬇ Delikli kart (SVG)</button><button data-a="mo-knitout">⬇ knitout (.k)</button></div>
    ${R.html || ''}</div>`;
  return h;
}
function moSel() {
  const p = S.p, K = p.knit, m = K.machines.find((x) => x.id === $('mo-mc').value), pc = K.pieces.find((x) => x.id === $('mo-pc').value) || null;
  const ch = K.charts.find((x) => x.id === $('mo-ch').value) || (pc && pc.chart ? K.charts.find((x) => x.id === pc.chart) : null);
  S.mo = { mc: m?.id, pc: pc?.id, ch: ch?.id };
  return { m, pc, ch, piece: pc ? M.knitCompute(p, pc) : null, swatch: pc ? K.swatches.find((x) => x.id === pc.swatch) : null };
}
const issuesHTML = (list) => list.map((x) => `<div class="issue ${x.level}">${x.level === 'hata' ? '⛔' : '⚠'} ${esc(x.msg)}</div>`).join('') || '<div class="small">✅ Uyumsuzluk bulunmadı.</div>';
function saveText(text, name, type = 'text/plain') { saveBlob(new Blob([text], { type: type + ';charset=utf-8' }), safeName(name)); }
function cardSVG(c) {
  const s = 8, W = c.width * s + 40, H = c.rows * s + 60;
  let o = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica, Arial">\n<text x="4" y="12" font-size="9">Delikli kart şeması · ${c.width} iğne × ${c.rows} sıra · ${c.status.ready ? 'doğrulanmış profil' : 'DOĞRULANMAMIŞ — yalnız numune'}</text>\n<text x="4" y="24" font-size="7">${c.notes[1]}</text>\n`;
  for (let k = 0; k < c.rows; k++) { const y = 40 + (c.rows - 1 - k) * s; o += `<text x="2" y="${y + 6}" font-size="5">${k + 1}</text>`; for (let i = 0; i < c.width; i++) o += `<rect x="${20 + i * s}" y="${y}" width="${s}" height="${s}" fill="none" stroke="#bbb" stroke-width="0.3"/>${c.cells[k][i] ? `<circle cx="${20 + i * s + s / 2}" cy="${y + s / 2}" r="${s * 0.32}" fill="#000"/>` : ''}`; }
  return o + '\n</svg>\n';
}
function openChart(i) { const p = S.p, ch = p.knit.charts[i]; openChartEditor(ch, { toast, meta: { project: p.name }, onChange: (closed) => { dirty(); if (closed) render(); } }); }

function gradeForm(pid, base) {
  const p = S.p, tbls = p.sizeTables.filter((t) => t.sizes.includes(base));
  if (!tbls.length) return `<div class="issue uyarı">"${esc(base || '—')}" bedeni hiçbir beden tablosunda yok. Bedenler sekmesinde bu bedeni içeren bir tablo oluştur (kişiye özel ölçü için tabloya kişinin adıyla bir sütun ekle).</div>`;
  const t = tbls.find((x) => x.id === S.gradeTable) || tbls[0], meas = Object.keys(t.measures);
  const tg = S.gradeSizes || t.sizes.filter((z) => z !== base);
  let h = `<div class="card" style="background:#0b1730"><div class="row"><label class="f"><span>Beden tablosu</span><select id="gr-table">${tbls.map((x) => `<option value="${x.id}" ${x.id === t.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
    <label class="f"><span>Yöntem</span><select id="gr-method"><option value="auto">Blok parçası: ölçüden kural; diğerleri orantılı</option><option value="proportional">Hepsi orantılı (en / boy ölçüsü)</option></select></label></div>
    <div class="small">Kaynak: ${esc(t.source) || '⚠ yazılmamış'} · temel beden <b>${esc(base)}</b></div>
    <div class="small">Hedef bedenler</div><div class="chips">${t.sizes.filter((z) => z !== base).map((z) => `<button data-a="gr-size" data-v="${esc(z)}" class="${tg.includes(z) ? 'on' : ''}">${esc(z)}</button>`).join('')}</div>
    <div class="row"><label class="f"><span>Orantılı: en ölçüsü</span><select id="gr-w">${meas.map((m) => `<option ${m === 'Göğüs çevresi' ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
    <label class="f"><span>Orantılı: boy ölçüsü</span><select id="gr-h"><option value="">— boy değişmesin —</option>${meas.map((m) => `<option>${esc(m)}</option>`).join('')}</select></label></div>
    <div class="row"><button class="ok" data-a="grade-run" data-v="${esc(pid)}|${esc(base)}">Yay</button><button data-a="grade-close">Kapat</button></div>
    <div class="small">Hedef bedendeki mevcut kalıplar (bu ürün) yenisiyle değiştirilir. Temel bedendeki pay, çıt, pens, işaret ve notlar taşınır; pens genişliği sabit kalır. Tek evrensel beden standardı yoktur: kullanılan tablo yukarıda.</div>`;
  if (S.gradeResult && S.gradeResult.key === pid + '|' + base) {
    const R = S.gradeResult, sizesAll = [base, ...R.sizes], by = {};
    for (const z of sizesAll) by[z] = p.woven.pieces.filter((pc) => (pc.product ?? '') === pid && pc.size === z);
    const tb = gradeTable(by);
    h += `<h3 style="margin-top:8px">Sonuç</h3>${R.report.length ? R.report.map((x) => `<div class="issue ${x.level}">${x.level === 'hata' ? '⛔' : '⚠'} ${esc(x.size)} · ${esc(x.piece)}: ${esc(x.msg)}</div>`).join('') : '<div class="small">✅ Bütün bedenlerde parçalar geçerli, dikiş eşleşmeleri tutuyor.</div>'}
      <div class="scroll"><table><tr><th>Parça</th><th>Ölçü (cm)</th>${tb.sizes.map((z) => `<th>${esc(z)}</th>`).join('')}</tr>${tb.rows.map((r) => `<tr><td>${esc(r.piece)}</td><td>${esc(r.item)}</td>${r.vals.map((v) => `<td>${v == null ? '—' : num(v / 10)}</td>`).join('')}</tr>`).join('')}</table></div>`;
  }
  return h + '</div>';
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
    <div class="small">Bilmediğin değeri boş bırak (uydurulmaz). Değer ölçülmediyse "tahmini" işaretle; hesaplarda ve föyde öyle gösterilir.</div>
    <div class="row"><select id="nm-preset">${kinds.map(([k, K]) => `<optgroup label="${K.label}">${PRESETS[k].map((x, j) => `<option value="${k}:${j}">${esc(x.name)}</option>`).join('')}</optgroup>`).join('')}</select><button data-a="add-preset">+ Hazır karttan</button></div>
    <div class="small">Hazır kartlar piyasadaki tipik değerlerdir ve "tahmini" işaretli gelir; tedarikçinin teknik kartıyla değiştir.</div></div>`;
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
      }).join('')}</div>${m.kind === 'fabric' ? drapeCard(m, i) : ''}${m.kind === 'yarn' && m.props.count > 0 && m.props.countSystem ? (() => { try { const c = allCounts(m.props.count, m.props.countSystem, m.props.ply || 1); return `<div class="small">Sonuç numara${c.ply > 1 ? ` (${c.ply} kat, büküm kısalması hariç)` : ''}: ${num(c.tex, 1)} tex · ${num(c.dtex, 0)} dtex · ${num(c.den, 0)} den · Nm ${num(c.Nm, 2)} · Ne ${num(c.Ne, 2)} · ${num(1000 / c.tex, 1)} m/g</div>`; } catch (e) { return ''; } })() : ''}</div>`;
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
    <button data-a="print">🖨 Yazdır / PDF</button><button class="ok" data-a="prod-pdf" data-v="${pr.id}">⬇ Üretim föyü PDF</button></div>
  <div class="card"><h3><span class="sp">Teknik föy · ${esc(H.product)}</span><span class="badge">${esc(H.status)}</span></h3>
    <table><tr><th>Proje</th><td>${esc(H.project)}</td><th>Koleksiyon</th><td>${esc(H.collection) || '—'}</td></tr>
    <tr><th>Model kodu</th><td>${esc(H.modelCode) || '—'}</td><th>Dal / tür</th><td>${esc(H.branch)} · ${esc(H.type)}</td></tr>
    <tr><th>Revizyon</th><td>${H.rev}</td><th>Tarih</th><td>${date(Date.now())}</td></tr></table></div>
  <div class="card"><h3>Renkler</h3>${s.colors.map((c) => `<span class="sw" style="background:${c.hex}"></span> ${esc(c.name)} ${c.code ? '(' + esc(c.code) + ')' : ''}`).join(' · ') || '<span class="small">yok</span>'}</div>
  <div class="card"><h3>Ölçü tablosu (cm)</h3>${mt ? `<div class="small">${esc(mt.name)} — kaynak: ${esc(mt.source) || '⚠ yazılmamış'}</div><div class="scroll"><table><tr><th></th>${mt.sizes.map((z) => `<th>${esc(z)}</th>`).join('')}</tr>${Object.entries(mt.measures).map(([k, row]) => `<tr><td>${esc(k)}</td>${mt.sizes.map((z) => `<td>${row[z] == null ? '—' : num(row[z] / 10)}</td>`).join('')}</tr>`).join('')}</table></div>` : '<span class="small">Beden tablosu seçilmemiş</span>'}</div>
  <div class="card"><h3>Malzeme listesi</h3><table><tr><th>Malzeme</th><th>Tür</th><th>Kullanım</th><th>Miktar</th></tr>${s.materials.map((m) => `<tr><td>${esc(m.name)}${m.estimated.length ? ' <span class="badge">tahmini değer var</span>' : ''}</td><td>${m.kind}</td><td>${ROLE[m.role] || m.role}</td><td>${m.qty == null ? 'bilinmiyor' : num(m.qty, 3) + ' ' + m.unit}</td></tr>`).join('')}</table>
    <div class="small" style="margin-top:6px">Malzeme maliyeti: ${num(s.cost.total, 2)}${s.cost.complete ? '' : ' — <b>eksik</b>: ' + esc(s.cost.missing.join(', '))}. İşçilik ve genel giderler bu aşamada yok (Aşama 10).</div></div>
  ${s.consumption && (Object.keys(s.consumption.sizes).length || s.consumption.errors.length) ? `<div class="card"><h3>Tüketim ve malzeme maliyeti (bedene göre, hesaplanan)</h3>
    ${s.consumption.errors.map((e) => `<div class="issue hata">⛔ ${esc(e)}</div>`).join('')}
    <div class="scroll"><table><tr><th>Beden</th><th>Malzeme</th><th>Tüketim</th><th>Maliyet</th></tr>${Object.entries(s.consumption.sizes).map(([z, mats]) => Object.values(mats).map((c, k) => `<tr><td>${k ? '' : esc(z || '—')}</td><td>${esc(c.name)}${c.estimated ? ' <span class="badge">tahmini</span>' : ''}</td><td>${c.grams != null ? `${num(c.grams, 0)} g (${num(c.lengthM, 0)} m iplik, ${c.stitches} ilmek)` : `${num(c.detail.lengthM, 2)} m kumaş · kesim alanı ${num(c.detail.cutArea / 1e6, 2)} m²${c.detail.weightG ? ` · ${num(c.detail.weightG, 0)} g` : ''}`}</td><td>${k ? '' : (() => { const mc = s.consumption.cost[z]; return mc ? `${num(mc.total, 2)}${mc.complete ? '' : ' <b>eksik</b>'}` : '—'; })()}</td></tr>`).join('')).join('')}</table></div>
    <div class="small">Varsayımlar: ${esc(s.consumption.notes.join(' · '))}. Ürüne elle girilen miktar varsa o kullanılır; yoksa bu hesap.</div></div>` : ''}
  ${productionCards(pr, i)}
  <div class="card"><h3>Varyantlar (${s.variants.length})</h3><div class="small">${s.variants.map((v) => esc(v.sku)).join(' · ')}</div></div>
  <div class="card"><h3>Üretim notları</h3><textarea data-f="collection.products.${i}.techpack.notes" rows="4">${esc(pr.techpack.notes)}</textarea></div>
  ${s.issues.length ? `<div class="card"><h3>Bu ürünün sorunları</h3>${s.issues.map((x) => `<div class="issue ${x.level}">${x.level === 'hata' ? '⛔' : '⚠'} ${esc(x.msg)}</div>`).join('')}</div>` : ''}`;
}

// Aşama 10: operasyon listesi, maliyet kartı, sipariş ve malzeme ihtiyacı
function productionCards(pr, i) {
  const p = S.p, sh = M.productionSheet(p, pr.id), f = `collection.products.${i}`, os = opsSummary(pr.techpack.ops), cur = pr.costing.currency || 'TL';
  let h = `<div class="card"><h3>Operasyon listesi (dikim / örgü sırası)</h3><div class="small">Süreler dakika (SMV). Şablon süreleri genel kaba değerlerdir ve "tahmini" işaretlidir; firmanın zaman etüdüyle değiştir (değiştirdiğin süre tahmini olmaktan çıkar).</div>
    <div class="scroll"><table><tr><th>#</th><th>Operasyon</th><th>Makine</th><th>Dk</th><th></th></tr>${pr.techpack.ops.map((o, k) => `<tr><td>${k + 1}</td><td><input data-f="${f}.techpack.ops.${k}.name" value="${esc(o.name)}" style="min-width:150px"></td>
      <td><select data-f="${f}.techpack.ops.${k}.machine">${Object.entries(OP_MACHINES).map(([m, l]) => `<option value="${m}" ${m === o.machine ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></td>
      <td><input data-f="${f}.techpack.ops.${k}.smv" data-t="num" inputmode="decimal" value="${num(o.smv, 2)}" style="width:64px" data-op-est="${i}.${k}">${o.est ? ' <span class="small">tahmini</span>' : ''}</td>
      <td style="white-space:nowrap"><button data-a="op-up" data-v="${i}.${k}" ${k ? '' : 'disabled'}>↑</button><button class="danger" data-a="op-del" data-v="${i}.${k}">×</button></td></tr>`).join('')}</table></div>
    <div class="row"><b>Toplam ${num(os.total, 2)} dk</b>${os.missing ? `<span class="issue uyarı">⚠ ${os.missing} operasyonun süresi yok</span>` : ''}</div>
    <div class="row noprint"><button data-a="op-add" data-v="${pr.id}">+ Operasyon</button>${OP_TEMPLATES[pr.type] ? `<button data-a="op-tpl" data-v="${pr.id}">${pr.techpack.ops.length ? 'Şablonla değiştir' : 'Şablondan doldur'} (${esc(M.PRODUCT_TYPES[pr.branch][pr.type])})</button>` : '<span class="small">Bu tür için şablon yok, elle ekle.</span>'}</div></div>`;
  const cI = (k, lbl, ph) => `<label class="f"><span>${lbl}</span><input data-f="${f}.costing.${k}" data-t="num" inputmode="decimal" value="${num(pr.costing[k], 2)}" placeholder="${ph}"></label>`;
  const szs = Object.keys(sh.perSize), lbs = sh.perSize[szs[0]].lines.map((l) => l.label), miss = [...new Set(szs.flatMap((z) => sh.perSize[z].missing))];
  h += `<div class="card"><h3>Maliyet kartı (${esc(cur)}, bedene göre)</h3><div class="row">${cI('minuteRate', `Dakika ücreti (${esc(cur)} / dk)`, 'işçilik + makine')}${cI('efficiency', 'Hat verimi (%)', 'ör. 70')}${cI('overheadPct', 'Genel gider (%)', 'ör. 25')}${cI('marginPct', 'Kâr (%)', 'ör. 40')}${cI('vatPct', 'KDV (%)', 'isteğe bağlı')}</div>
    <div class="scroll"><table><tr><th>Kalem</th>${szs.map((z) => `<th>${esc(z || '—')}</th>`).join('')}</tr>${lbs.map((lb, k) => `<tr><td>${esc(lb)}${sh.perSize[szs[0]].lines[k].note ? `<div class="small">${esc(sh.perSize[szs[0]].lines[k].note)}</div>` : ''}</td>${szs.map((z) => { const v = sh.perSize[z].lines[k].value; return `<td>${v == null ? '<span class="small">—</span>' : num(v, 2)}</td>`; }).join('')}</tr>`).join('')}</table></div>
    ${miss.length ? `<div class="issue uyarı">⚠ Hesaplanmayan kalemler var — eksik: ${esc(miss.join('; '))}</div>` : ''}${szs.some((z) => sh.perSize[z].estimated) ? '<div class="small">Maliyette tahmini değerler var (hesaplanan tüketim, şablon süreleri ya da tahmini malzeme kartı).</div>' : ''}</div>`;
  const sizes = pr.sizes.length ? pr.sizes : szs.filter(Boolean);
  h += `<div class="card"><h3>Sipariş ve malzeme ihtiyacı</h3>${sizes.length ? `<div class="row">${sizes.map((z) => `<label class="f"><span>${esc(z)} adet</span><input data-f="${f}.order.${encodeURIComponent(z)}" data-t="num" inputmode="numeric" value="${num(pr.order[z], 0)}" style="width:70px"></label>`).join('')}${cI('wastePct', 'Fire (%)', 'ör. 3')}</div>` : '<div class="small">Önce ürüne beden seç (Koleksiyon) ya da kalıp ekle.</div>'}
    ${sh.requirement.lines.length && sh.requirement.units ? `<div class="scroll"><table><tr><th>Malzeme</th><th>Net</th><th>Fire dahil</th><th>Tutar</th></tr>${sh.requirement.lines.map((l) => `<tr><td>${esc(l.name)}</td><td>${num(l.net, 2)} ${esc(l.unit)}</td><td><b>${num(l.qty, 2)} ${esc(l.unit)}</b></td><td>${l.cost == null ? '—' : num(l.cost, 2)}</td></tr>`).join('')}</table></div><div class="small">${sh.requirement.units} adet · toplam malzeme ${sh.requirement.total == null ? '— (eksik fiyat / tüketim)' : num(sh.requirement.total, 2) + ' ' + esc(cur)}</div>` : ''}
    ${sh.requirement.problems.filter((x) => !/sipariş adedi/.test(x) || sizes.length).map((x) => `<div class="issue uyarı">⚠ ${esc(x)}</div>`).join('')}</div>`;
  return h;
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
    return `<div class="card">✅ Teknik çizim (Aşama 2): "Teknik çizim" sekmesi. ✅ Üretim föyü, operasyon listesi, maliyet kartı, sipariş ve malzeme ihtiyacı (Aşama 10): "Föy" sekmesi.${br.includes('woven') ? ' ✅ Dokuma kalıbı (Aşama 3), beden yayma / grading (Aşama 4) ve kumaş yerleşimi / kesim planı (Aşama 7), 3B önizleme (Aşama 9): "Kalıp" sekmesi. ✅ Kumaş dökümlülük benzetimi (Aşama 9): "Malzemeler" sekmesi.' : ''}${br.includes('knit') ? ' ✅ Örgü deseni, numune ve ilmek hesabı (Aşama 5), makine profili ve üretim çıktısı (Aşama 8), 3B önizleme (Aşama 9): "Örgü" sekmesi.' : ''}</div><div class="small">Aşağıdaki araçlar henüz uygulanmadı. Hangi aşamada geleceği yazılı; şu an kullanılabilir gibi gösterilmez.</div>` +
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
  if (el.dataset.opEst) { const [pi, k] = el.dataset.opEst.split('.').map(Number), o = S.p.collection.products[pi]?.techpack.ops[k]; if (o) o.est = false; }
  dirty();
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.id === 'ap-branch') { S.addBranch = el.value; return render(); }
  if (el.id === 'fp-sel') { S.fp = el.value; return render(); }
  if (el.id === 'pt-set') { S.patSet = el.value; return render(); }
  if (el.id === 'pt-table') { S.patTable = el.value; S.patSize = null; return render(); }
  if (el.id === 'pt-size') { S.patSize = el.value; return render(); }
  if (el.id === 'kp-kind') { S.kpKind = el.value; return render(); }
  if (el.id === 'gr-table') { S.gradeTable = el.value; S.gradeSizes = null; return render(); }
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
  dirty(); deferRender();   // odak yeni alana geçtikten sonra çiz, odağı koru
});

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-a]');
  if (!b) return;
  const a = b.dataset.a, p = S.p, i = +b.dataset.i;
  if (!['del', 'del-prod', 'del-sketch', 'del-pattern', 'del-chart', 'del-kpiece', 'del-machine'].includes(a)) S.delArm = null;
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
      case 'dxf-in': {
        const prod = $('pt-prod')?.value || null, size = ($('pt-size')?.value ?? $('pt-size-free')?.value ?? '').trim();
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.dxf,application/dxf,text/plain';
        inp.onchange = async () => { try { const r = M.importDXF(p, await inp.files[0].text(), { product: prod, size }); dirty(); render(); toast(`${r.pieces.length} parça (${r.units})${r.warnings.length ? ' · ⚠ ' + r.warnings.join('; ') : ''}`); } catch (er) { toast('⚠ ' + er.message); } };
        inp.click(); return;
      }
      case 'dxf-out': {
        const [pid, sz] = b.dataset.v.split('|'), pcs = p.woven.pieces.filter((x) => (x.product ?? '') === pid && (x.size ?? '') === sz), pr = p.collection.products.find((x) => x.id === pid);
        saveText(writeAAMA(pcs), `kalip-${pr?.modelCode || pr?.name || 'parca'}-${sz || ''}.dxf`, 'application/dxf'); toast(`${pcs.length} parça DXF (AAMA, mm) — Gerber / Lectra gibi programlarda denenmedi`); return;
      }
      case 'import': {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
        inp.onchange = async () => { try { const q = await store.importJSON(await inp.files[0].text()); toast('İçe aktarıldı: ' + q.name); render(); } catch (er) { toast('⚠ ' + er.message); } };
        inp.click(); return;
      }
      case 'home': await flush(); S.view = 'home'; S.p = null; return render();
      case 'tab': S.tab = b.dataset.v; if (S.tab === 'revs') revCache = null; return render();
      case 'export': {
        await flush();
        saveBlob(new Blob([store.exportJSON(p)], { type: 'application/json' }), p.name + '.tekstil.json'); return;
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
      case 'drape-run': case 'drape-cal': {
        const m = p.library.materials[i], gsm = m.props.gsm; if (!(gsm > 0)) throw new Error('Önce gramajı gir');
        if (S.busy) throw new Error('Benzetim sürüyor, bekle');
        let bend = m.props.bendEff, calibrated = false; const t0 = Date.now(); S.busy = true; b.disabled = true;
        try {
          if (a === 'drape-cal') { const c = await DR.calibrateBendAsync({ gsm, target: m.props.drapeRef, onStep: (k, n) => toast(`Kalibre ediliyor… ${k}/${n}`) }); bend = Math.round(c.bend * 100) / 100; m.props.bendEff = bend; calibrated = true; }
          else if (!(bend > 0)) { bend = 10; m.props.bendEff = bend; m.estimated = [...new Set([...(m.estimated || []), 'bendEff'])]; }
          else calibrated = !!(m.sim && m.sim.calibrated && m.sim.bend === bend);
          toast('Benzetim hesaplanıyor…'); await new Promise((r) => setTimeout(r, 0));
        } finally { S.busy = false; }
        const r = DR.simulateDrape({ gsm, bend }); lastDrape = { id: m.id, r };
        m.sim = { dc: r.dc, nodes: r.nodes, bend, calibrated, settled: r.settled, ms: Date.now() - t0, at: Date.now(), sig: drapeSig(m) };
        toast(`Dökümlülük katsayısı ${num(r.dc, 2)}${r.settled ? '' : ' (tam durulmadı)'}`); break;
      }
      case 'drape-view': { const m = p.library.materials[i]; const r = lastDrape && lastDrape.id === m.id ? lastDrape.r : DR.simulateDrape({ gsm: m.props.gsm, bend: m.sim.bend }); lastDrape = { id: m.id, r };
        const v = drapeVerdict(m); await open3D({ title: 'Dökümlülük · ' + m.name, paneHTML: `<div class="small">Katsayı ${num(r.dc, 2)} · ${r.nodes} dalga · ${r.particles} parçacık</div><div class="issue ${v.level === 'ok' ? '' : v.level}">${esc(v.text)}</div>`, build: drapeScene(r) }); return; }
      case 'fit3d': {
        const [pid, sz] = b.dataset.v.split('|'), pr = p.collection.products.find((x) => x.id === pid);
        const pcs = p.woven.pieces.filter((x) => (x.product ?? '') === pid && (x.size ?? '') === sz && x.fabric === 'ana');
        const tb = (pr && p.sizeTables.find((t) => t.id === pr.sizeTable && t.sizes.includes(sz))) || p.sizeTables.find((t) => t.sizes.includes(sz));
        const meas = tb ? Object.fromEntries(Object.entries(tb.measures).map(([k, row]) => [k, row[sz]])) : {};
        const rep = FIT.fitReport(pcs, null, meas), body = FIT.bodyForm(meas), rings = FIT.garmentRings(pcs, rep, body);
        const pane = `<div class="small">Vücut: ${tb ? esc(tb.name) + ' · ' + esc(sz) + (tb.source ? ' · kaynak: ' + esc(tb.source) : '') : '⚠ beden tablosu yok, varsayılan ölçüler'} · ${esc(body.assumptions)}</div>
          <table><tr><th>Düzey</th><th>Giysi</th><th>Vücut</th><th>Bolluk</th><th></th></tr>${rep.map((r) => `<tr><td>${esc(r.label)}</td><td>${num(r.garment / 10)} cm</td><td>${r.bodyM ? num(r.bodyM / 10) + ' cm' : '—'}</td><td>${r.ease != null ? (r.ease >= 0 ? '+' : '') + num(r.ease / 10) + ' cm' : '—'}</td><td class="small">${r.level === 'hata' ? '⛔' : r.level === 'uyarı' ? '⚠' : r.level === 'ok' ? '✅' : ''} ${esc(r.status)}${r.note ? ' (' + esc(r.note) + ')' : ''}</td></tr>`).join('')}</table>
          <div class="small">Giysi çevresi kalıbın dikiş çizgisinden ölçüldü (pat ve pens hariç). Renk: yeşil uygun, sarı çok dar / bol, kırmızı vücuttan dar. Bu bir <b>önizlemedir</b>: kumaşın düşüşü, kırışıklık ve gerilim hesaplanmaz; prova gerekir.</div>`;
        const root = await open3D({ title: `3B önizleme · ${pr?.name || ''} ${sz}`, paneHTML: pane, build: fitScene(body, rings) }); root.api.report = rep; return;
      }
      case 'kfit3d': {
        const pc = p.knit.pieces[i], r = M.knitCompute(p, pc), sw = p.knit.swatches.find((x) => x.id === pc.swatch), pr = p.collection.products.find((x) => x.id === pc.product);
        const tb = (pr && p.sizeTables.find((t) => t.id === pr.sizeTable && t.sizes.includes(pc.size))) || p.sizeTables.find((t) => t.sizes.includes(pc.size));
        const meas = tb ? Object.fromEntries(Object.entries(tb.measures).map(([k, row]) => [k, row[pc.size]])) : {};
        const wmm = widthOf(r.castOn, sw), rep = FIT.knitFitReport(wmm, meas), body = FIT.bodyForm(meas), len = (r.rows / sw.row10) * 100, c = rep[0];
        const ring = (z, g) => ({ z, girth: g, level: c.level, ...FIT.ellipseAxes(Math.max(g, 100)) }), zc = body.rings[2].z;
        const pane = `<div class="small">Vücut: ${tb ? esc(tb.name) + ' · ' + esc(pc.size) : '⚠ beden tablosu yok'} · ${esc(body.assumptions)}</div><table><tr><td>Göğüs</td><td>giysi ${num(c.garment / 10)} cm</td><td>vücut ${c.bodyM ? num(c.bodyM / 10) + ' cm' : '—'}</td><td>${c.ease != null ? (c.ease >= 0 ? '+' : '') + num(c.ease / 10) + ' cm' : '—'}</td><td class="small">${esc(c.status)}</td></tr></table><div class="small">Genişlik numuneden (${num(sw.st10)} ilmek / 10 cm); örgünün esnemesi ve ağırlıkla uzaması hesaplanmaz. Önizlemedir.</div>`;
        const root = await open3D({ title: `3B önizleme · ${pc.name} ${pc.size || ''}`, paneHTML: pane, build: fitScene(body, [ring(body.rings[1].z, c.garment * 0.92), ring(zc, c.garment), ring(body.rings[1].z - len, c.garment)]) }); root.api.report = rep; return;
      }
      case 'op-tpl': M.applyOpTemplate(p, b.dataset.v); break;
      case 'op-add': M.addOp(p, b.dataset.v); break;
      case 'op-del': { const [pi, k] = b.dataset.v.split('.').map(Number); p.collection.products[pi].techpack.ops.splice(k, 1); break; }
      case 'op-up': { const [pi, k] = b.dataset.v.split('.').map(Number), o = p.collection.products[pi].techpack.ops; [o[k - 1], o[k]] = [o[k], o[k - 1]]; break; }
      case 'prod-pdf': { const pr = p.collection.products.find((x) => x.id === b.dataset.v), r = productionPDF(p, pr.id); saveBlob(new Blob([r.bytes], { type: 'application/pdf' }), 'uretim-foyu-' + (pr.modelCode || pr.name) + '.pdf'); toast(`${r.pages} sayfa`); return; }
      case 'add-machine': M.addMachine(p, $('nm-mtpl').value); break;
      case 'del-machine': { const m = p.knit.machines[i]; if (S.delArm !== m.id) { S.delArm = m.id; return render(); } p.knit.machines.splice(i, 1); S.delArm = null; break; }
      case 'mc-verify': MC.verifyMachine(p.knit.machines[i], { note: $('mv-note-' + i).value }); toast('Profil doğrulandı olarak işaretlendi'); break;
      case 'mo-check': { const q = moSel(); if (!q.m) throw new Error('Makine seç'); S.mo.html = `<div class="small"><b>${esc(q.m.name)}</b>: ${esc(MC.machineStatus(q.m).text)}</div>` + issuesHTML(MC.checkCompat(q.m, { chart: q.ch, piece: q.piece, swatch: q.swatch })); return render(); }
      case 'mo-prog': { const q = moSel(); if (!q.piece) throw new Error('Triko parçası seç'); const pcx = p.knit.pieces.find((x) => x.id === S.mo.pc); const r = MC.operatorProgram(q.m, { piece: q.piece, chart: q.ch, swatch: q.swatch, name: pcx.name + (pcx.size ? ' · ' + pcx.size : ''), rib: pcx.rib });
        S.mo.html = `<pre class="small" style="white-space:pre-wrap">${esc(r.lines.join('\n'))}</pre>`; saveText(r.lines.join('\n') + '\n', `program-${pcx.name}-${pcx.size || ''}.txt`); if (!r.ok) toast('⚠ Uyumsuzluk var: program üretilmedi, nedenler dosyada'); return render(); }
      case 'mo-card': { const q = moSel(); if (!q.ch) throw new Error('Desen seç'); const c = MC.punchCard(q.m, q.ch); S.mo.html = c.notes.map((n) => `<div class="small">• ${esc(n)}</div>`).join('') + `<div class="issue ${c.status.ready ? '' : 'uyarı'}">${esc(c.status.text)}</div>`; saveText(cardSVG(c), `kart-${q.ch.name}.svg`, 'image/svg+xml'); return render(); }
      case 'mo-knitout': { const q = moSel(); if (!q.ch) throw new Error('Desen seç'); const w = parseInt($('mo-w').value, 10) || null, hh = parseInt($('mo-h').value, 10) || null;
        const k = MC.knitout(q.m, q.ch, { width: w, rows: hh, name: q.ch.name }), sim = MC.simulateKnitout(k.text, q.m);
        S.mo.html = `<div class="${sim.ok ? 'small' : 'issue hata'}">${sim.ok ? '✅' : '⛔'} Yapısal benzetim: ${k.width} iğne × ${k.rows} sıra, ${sim.ops} komut, besleyici ${k.carriers.join(', ')}${sim.ok ? '; aktarma hizası, kaydırma sınırı, ilmek kaybı denetlendi' : ': ' + esc(sim.errors.slice(0, 3).join('; '))}</div>${sim.warnings.map((x) => `<div class="issue uyarı">⚠ ${esc(x)}</div>`).join('')}<div class="small">Yapısal benzetim komut dizisinin tutarlılığını denetler; iplik gerilimi, ilmek çekme, makinenin kendi kuralları denetlenmez. Makinede denenmeden üretime alma.</div><div class="issue ${k.status.ready ? '' : 'uyarı'}">${esc(k.status.text)}</div>`;
        if (sim.ok) saveText(k.text, `${q.ch.name}.k`); return render(); }
      case 'add-swatch': M.addSwatch(p, { name: $('ns-name').value, st10: parseNum($('ns-st').value), row10: parseNum($('ns-row').value) }); break;
      case 'sw-wash': p.knit.swatches[i].washed = b.checked; dirty(); return;
      case 'add-chart': { const ch = M.addChart(p, $('nk-tpl').value, $('nk-name').value); dirty(); render(); openChart(p.knit.charts.indexOf(ch)); return; }
      case 'open-chart': openChart(i); return;
      case 'del-chart': { const c = p.knit.charts[i]; if (p.knit.pieces.some((x) => x.chart === c.id)) throw new Error('Bu desen bir triko parçasında kullanılıyor'); if (S.delArm !== c.id) { S.delArm = c.id; return render(); } p.knit.charts.splice(i, 1); S.delArm = null; break; }
      case 'add-kpiece': {
        const kind = $('kp-kind').value, params = {};
        for (const inp of document.querySelectorAll('[data-kp]')) { const v = parseNum(inp.value); if (v == null || Number.isNaN(v) || v <= 0) throw new Error(KNIT_PIECES[kind].params[inp.dataset.kp][0] + ': geçerli bir cm değeri gir'); params[inp.dataset.kp] = Math.round(v * 100) / 10; }
        M.addKnitPiece(p, { kind, params, swatch: $('kp-sw').value, chart: $('kp-ch').value || null, rib: $('kp-rib').value, product: $('kp-prod').value || null, size: $('kp-size').value.trim() }); break;
      }
      case 'del-kpiece': { const pc = p.knit.pieces[i]; if (S.delArm !== pc.id) { S.delArm = pc.id; return render(); } p.knit.pieces.splice(i, 1); S.delArm = null; break; }
      case 'marker-open': {
        const [pid, sz] = b.dataset.v.split('|'), pr = p.collection.products.find((x) => x.id === pid);
        const linked = pr ? pr.materials.map((l) => p.library.materials.find((m) => m.id === l.mat)).filter((m) => m && m.kind === 'fabric') : [];
        const fabrics = linked.length ? linked : p.library.materials.filter((m) => m.kind === 'fabric');
        if (!fabrics.length) throw new Error('Önce Malzemeler sekmesinden kumaş ekle (en bilgisiyle)');
        const ex = (p.woven.markers || []).find((x) => (x.product ?? '') === pid && (x.size ?? '') === sz);
        openMarkerEditor(p, { product: pid || null, size: sz, fabrics, initial: ex || null, toast, meta: { project: p.name, product: pr?.name },
          onSave: (m) => { p.woven.markers = (p.woven.markers || []).filter((x) => !((x.product ?? '') === pid && (x.size ?? '') === sz)); p.woven.markers.push(m); dirty(); },
          onChange: (closed) => { if (closed) render(); } });
        return;
      }
      case 'grade-open': S.gradeKey = S.gradeKey === b.dataset.v ? null : b.dataset.v; S.gradeSizes = null; S.gradeResult = null; return render();
      case 'grade-close': S.gradeKey = null; return render();
      case 'gr-size': {
        const [, base] = S.gradeKey.split('|'), t = p.sizeTables.find((x) => x.id === ($('gr-table')?.value)) ;
        const cur = S.gradeSizes || t.sizes.filter((z) => z !== base), v = b.dataset.v;
        S.gradeSizes = cur.includes(v) ? cur.filter((z) => z !== v) : [...cur, v]; return render();
      }
      case 'grade-run': {
        const [pid, base] = b.dataset.v.split('|'), t = p.sizeTables.find((x) => x.id === $('gr-table').value);
        const sizes = (S.gradeSizes || t.sizes.filter((z) => z !== base)).filter((z) => t.sizes.includes(z));
        if (!sizes.length) throw new Error('Hedef beden seç');
        const r = M.gradeProduct(p, { product: pid || null, base, table: t.id, sizes, method: $('gr-method').value, wMeasure: $('gr-w').value, hMeasure: $('gr-h').value || '__yok__' });
        S.gradeResult = { key: pid + '|' + base, ...r }; dirty(); toast(`${r.sizes.length} beden üretildi${r.report.some((x) => x.level === 'hata') ? ' — hatalar var' : ''}`); return render();
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
      case 'add-preset': { const [k, j] = $('nm-preset').value.split(':'); M.addPresetMaterial(p, k, +j); break; }
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
