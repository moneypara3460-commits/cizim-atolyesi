// Ayakkabı Modelhanesi — uygulama kabuğu: 8 bölüm, otomatik kayıt, geri al / ileri al.
// Hesap ve doğrulama saf modüllerde (geom, model, build, match, export); burada yalnız gösterim ve düzenleme.
// Makine ve Tekstil alanlarının uygulama koduna bağlı değildir (yalnız tekstilin saf eğri / PDF / ofset modüllerini okur).
import * as G from './geom.js?v=20261114s';
import * as M from './model.js?v=20261114s';
import { measure, checkPiece, fmt } from './build.js?v=20261114s';
import * as X from './match.js?v=20261114s';
import * as E from './export.js?v=20261114s';
import { openStore, idbBackend, memoryBackend } from './store.js?v=20261114s';
import { createEditor } from './editor.js?v=20261114s';
import { addSample } from './sample.js?v=20261114s';
import { saveBlob } from '../tx/download.js?v=20261112u';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pn = (s) => { const t = String(s ?? '').trim().replace(',', '.'); if (t === '') return null; const v = Number(t); return Number.isFinite(v) ? v : NaN; };
const f1 = (v) => fmt(v, 1);
const nv = (v) => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(+(+v).toFixed(2)).replace('.', ','));
const date = (t) => new Date(t).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
const opts = (obj, cur) => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
const optsArr = (arr, cur) => arr.map((v) => `<option${v === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
let toastT;
function toast(s) { const el = $('toast'); el.textContent = s; el.style.opacity = 1; clearTimeout(toastT); toastT = setTimeout(() => { el.style.opacity = 0; }, 2800); }

try { localStorage.setItem('cizim:workspace', 'ayakkabi'); } catch (e) { /* gizli sekme */ }

/* ---------- depo ---------- */
let store, storeKind = 'idb';
try { if (!window.indexedDB) throw new Error('yok'); store = openStore(idbBackend()); await store.list(); }
catch (e) { store = openStore(memoryBackend()); storeKind = 'memory'; }

const SKEY = 'cizim:ayk:ayarlar', LKEY = 'cizim:ayk:son';
const DEF_SET = { grid: 5, snapGrid: true, snapNode: true, snapAngle: false, showGrid: true };
let settings = { ...DEF_SET };
try { settings = { ...DEF_SET, ...JSON.parse(localStorage.getItem(SKEY) || '{}') }; } catch (e) { /* */ }
const saveSettings = () => { try { localStorage.setItem(SKEY, JSON.stringify(settings)); } catch (e) { /* */ } };

const PAGES = [
  ['projeler', 'Projelerim'], ['yeni', 'Yeni Ayakkabı Projesi'], ['stampa', 'Stampa Atölyesi'], ['parcalar', 'Saya Parçaları'],
  ['malzeme', 'Malzeme Kütüphanesi'], ['dosyalar', 'Proje Dosyaları'], ['aktar', 'Dışa Aktarma'], ['ayarlar', 'Ayarlar'],
];
const S = { page: 'projeler', p: null, lib: [], hist: [], fut: [], editor: null, pieceSel: null, matForm: null, exp: { paper: 'A4', w: 210, h: 297, landscape: false, margin: 10, overlap: 10, onePerPage: false, pieces: null, sketch: false }, mt: { kind: 'dikis', reverse: true, tol: 0.5 } };
S.lib = await store.materials();

/* ---------- kayıt ---------- */
let saveT = null;
function syncMaterials(p) {
  const used = new Set([p.material, ...p.pieces.map((q) => q.material)].filter(Boolean));
  const keep = new Map(p.materials.map((m) => [m.id, m]));
  p.materials = [...used].map((id) => S.lib.find((m) => m.id === id) || keep.get(id)).filter(Boolean).map((m) => M.makeMaterial(m));
}
function dirty() {
  if (!S.p) return;
  syncMaterials(S.p);
  clearTimeout(saveT); $('saved').textContent = 'kaydediliyor…';
  saveT = setTimeout(async () => { saveT = null; try { await store.put(S.p); $('saved').textContent = storeKind === 'idb' ? 'otomatik kaydedildi' : '⚠ geçici bellek'; } catch (e) { $('saved').textContent = '⚠ kaydedilemedi'; toast('Kaydedilemedi: ' + e.message); } }, 500);
}
async function flush() { if (saveT) { clearTimeout(saveT); saveT = null; if (S.p) { syncMaterials(S.p); await store.put(S.p); } } }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
window.addEventListener('pagehide', () => { flush(); });

/* ---------- geri al / ileri al (proje anlık görüntüleri) ---------- */
const MAXH = 100;
function begin() { if (!S.p) return; S.hist.push(JSON.stringify(S.p)); if (S.hist.length > MAXH) S.hist.shift(); S.fut = []; }
function undoLast() { S.hist.pop(); }
function restoreSnap(json) { S.p = JSON.parse(json); dirty(); S.editor?.refresh(); if (S.page !== 'stampa') render(); }
function undo() { if (!S.hist.length) return toast('Geri alınacak işlem yok'); S.fut.push(JSON.stringify(S.p)); restoreSnap(S.hist.pop()); }
function redo() { if (!S.fut.length) return toast('İleri alınacak işlem yok'); S.hist.push(JSON.stringify(S.p)); restoreSnap(S.fut.pop()); }
// sayfa formlarından değişiklik: geri al noktası + kayıt
function edit(fn, { rerender = true } = {}) { begin(); fn(S.p); dirty(); if (rerender) render(); }

async function openProject(id, page = 'stampa') {
  await flush();
  const p = await store.get(id); if (!p) { toast('Proje bulunamadı'); return; }
  S.p = p; S.hist = []; S.fut = []; S.pieceSel = p.pieces[0]?.id || null; S.exp.pieces = null;
  try { localStorage.setItem(LKEY, id); } catch (e) { /* */ }
  if (S.editor) { S.editor.destroy(); S.editor = null; }
  go(page);
}
async function closeProject() { await flush(); if (S.editor) { S.editor.destroy(); S.editor = null; } S.p = null; try { localStorage.removeItem(LKEY); } catch (e) { /* */ } go('projeler'); }

/* ---------- gezinme ---------- */
function go(page) { S.page = page; render(); window.scrollTo(0, 0); }
function renderNav() {
  $('nav').innerHTML = PAGES.map(([id, name], i) => `<button type="button" data-page="${id}" class="${S.page === id ? 'on' : ''}"><span class="n">${i + 1}</span>${esc(name)}</button>`).join('');
  $('pname').textContent = S.p ? `${S.p.name}${S.p.code ? ' · ' + S.p.code : ''} · No ${S.p.size}` : 'Proje açık değil';
  $('nav').querySelector('.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}
$('nav').addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b) go(b.dataset.page); });
const needProject = () => `<div class="page"><div class="empty"><b>Açık proje yok</b>Önce bir proje aç ya da yeni bir ayakkabı projesi oluştur.<div class="row" style="justify-content:center;margin-top:14px"><button type="button" data-go="projeler">Projelerim</button><button type="button" class="ok" data-go="yeni">Yeni Ayakkabı Projesi</button></div></div></div>`;

async function render() {
  renderNav();
  const main = $('main');
  if (S.page !== 'stampa' && S.editor) { S.editor.destroy(); S.editor = null; }
  const pg = S.page;
  if (pg === 'projeler') { const html = await pageProjects(); if (S.page === pg) main.innerHTML = html; return; }
  if (pg === 'yeni') { main.innerHTML = pageNew(); return; }
  if (pg === 'malzeme') { main.innerHTML = pageMaterials(); return; }
  if (pg === 'ayarlar') { main.innerHTML = pageSettings(); return; }
  if (!S.p) { main.innerHTML = needProject(); return; }
  if (pg === 'stampa') return mountEditor();
  if (pg === 'parcalar') { main.innerHTML = pagePieces(); return; }
  if (pg === 'dosyalar') { const html = await pageFiles(); if (S.page === pg) main.innerHTML = html; return; }
  if (pg === 'aktar') { main.innerHTML = pageExport(); return; }
}

/* ---------- 1. Projelerim ---------- */
async function pageProjects() {
  const list = await store.list();
  let h = `<div class="page"><h2>Projelerim</h2><div class="row"><button type="button" class="ok" data-go="yeni">+ Yeni Ayakkabı Projesi</button><label class="btn" style="margin:0">JSON yedeğinden aç<input type="file" accept=".json,application/json" data-file="import" hidden></label></div>`;
  if (storeKind !== 'idb') h += `<p class="iss">Tarayıcı kalıcı depolamaya izin vermiyor (gizli sekme olabilir): projeler sayfa kapanınca silinir. JSON yedeği indir.</p>`;
  if (!list.length) h += `<div class="empty"><b>Henüz proje yok</b>Yeni bir ayakkabı projesi oluşturarak başla. Projeler bu cihazda otomatik kaydedilir.</div>`;
  else h += '<div class="plist">' + list.map((q) => `<div class="pitem${S.p?.id === q.id ? ' cur' : ''}"><div class="t"><b>${esc(q.name)}</b><span class="small">${esc(q.code || 'kodsuz')} · ${esc(q.shoeType || '')} · No ${esc(q.size || '')} · ${q.pieces} parça · rev ${q.rev || 0} · ${date(q.modified)}</span></div>
    <div class="acts"><button type="button" class="ok" data-open="${esc(q.id)}">Aç</button><button type="button" data-dup="${esc(q.id)}">Kopyala</button><button type="button" class="danger" data-del="${esc(q.id)}">Sil</button></div></div>`).join('') + '</div>';
  return h + '</div>';
}

/* ---------- 2. Yeni proje ---------- */
function projectFields(p, prefix = 'n') {
  return `<div class="grid">
    <label class="wide">Ayakkabı modelinin adı *<input data-${prefix}="name" value="${esc(p.name)}" maxlength="80" required></label>
    <label>Model kodu<input data-${prefix}="code" value="${esc(p.code)}" maxlength="40" placeholder="ör. DRB-2601"></label>
    <label>Ayakkabı türü<select data-${prefix}="shoeType">${optsArr(M.SHOE_TYPES, p.shoeType)}</select></label>
    <label>Sağ / sol<select data-${prefix}="side">${opts(M.SIDES, p.side)}</select></label>
    <label>Temel numara<input data-${prefix}="size" value="${esc(p.size)}" inputmode="decimal" maxlength="10"></label>
    <label>Numara sistemi<select data-${prefix}="sizeSystem">${optsArr(['EU', 'UK', 'US', 'Mondopoint (mm)'], p.sizeSystem)}</select></label>
    <label>Kullanılacak malzeme<select data-${prefix}="material"><option value="">— seçilmedi —</option>${S.lib.map((m) => `<option value="${esc(m.id)}"${m.id === p.material ? ' selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
    <label>Üretim yöntemi<select data-${prefix}="method">${opts(M.METHODS, p.method)}</select></label>
    <label class="wide">Proje açıklaması<textarea data-${prefix}="desc" maxlength="2000">${esc(p.desc)}</textarea></label>
  </div>`;
}
function pageNew() {
  const draft = S.newDraft || (S.newDraft = M.createProject({ name: '', material: 'm-deri' }));
  return `<div class="page"><h2>Yeni Ayakkabı Projesi</h2><div class="card">${projectFields(draft, 'n')}
    <label class="row" style="color:var(--text);font-size:13px"><input type="checkbox" data-n="sample"${S.newSample ? ' checked' : ''}> Örnek stampa ekle (basitleştirilmiş derby: ön saya, yan saya, dil — deneme amaçlı)</label>
    <div class="row"><button type="button" class="ok" data-act="create">Projeyi oluştur ve Stampa Atölyesi'ni aç</button></div>
    <p class="small">Birim milimetredir. Payların otomatik başlangıç değerleri malzeme kalınlığı ve üretim yöntemine göre hesaplanır; parça bazında değiştirilebilir.</p></div></div>`;
}
function readFields(prefix, target) {
  for (const el of $('main').querySelectorAll(`[data-${prefix}]`)) {
    const k = el.dataset[prefix]; if (k === 'sample') continue;
    if (k in target) target[k] = el.value.trim();
  }
  if (target.material === '') target.material = null;
}

/* ---------- 3. Stampa ---------- */
function mountEditor() {
  const main = $('main');
  if (S.editor && main.querySelector('.ed')) { S.editor.refresh(); return; }
  main.innerHTML = '';
  const host = document.createElement('div'); host.className = 'edhost'; host.style.cssText = 'flex:1;min-height:0;display:flex;flex-direction:column'; main.appendChild(host);
  S.editor = createEditor(host, {
    P: () => S.p, settings: () => settings, toast, begin, undoLast, undo, redo,
    changed: () => { dirty(); }, canUndo: () => S.hist.length > 0, canRedo: () => S.fut.length > 0,
    openPiece: (id) => { S.pieceSel = id; go('parcalar'); }, onCtx: (id) => { if (id !== 'stampa') S.pieceSel = id; },
  });
  S.editor.refresh();
  if (S.pieceSel && S.p.pieces.some((q) => q.id === S.pieceSel) && S.openCtx) { S.editor.setCtx(S.pieceSel); }
  S.openCtx = false;
  S.editor.setView(S.p.view);
  if (S.pendingNewPiece) { S.pendingNewPiece = false; host.querySelector('[data-a="newpiece"]').click(); }
}

/* ---------- 4. Saya parçaları ---------- */
function pieceStatus(pc) {
  const iss = checkPiece(pc), e = iss.filter((x) => x.level === 'hata').length, w = iss.length - e;
  return e ? `<span class="badge bad">${e} hata</span>` : w ? `<span class="badge warn">${w} uyarı</span>` : '<span class="badge ok">hazır</span>';
}
function pagePieces() {
  const p = S.p;
  if (S.pieceSel && !p.pieces.some((q) => q.id === S.pieceSel)) S.pieceSel = p.pieces[0]?.id || null;
  if (!S.pieceSel && p.pieces.length) S.pieceSel = p.pieces[0].id;
  let h = `<div class="page"><h2>Saya Parçaları</h2><div class="row"><button type="button" class="ok" data-act="newpiece">+ Yeni parça (stampada çiz)</button>${p.pieces.length ? '' : '<button type="button" data-act="sample">Örnek parçaları ekle</button>'}</div>`;
  if (!p.pieces.length) return h + `<div class="empty"><b>Parça yok</b>Stampa Atölyesi'nde "+ Parça" ile sınır çiz ya da kapalı bir yardımcı çizgiyi parçaya dönüştür.</div></div>`;
  h += '<div class="chips">' + p.pieces.map((pc) => `<button type="button" data-psel="${esc(pc.id)}" class="${pc.id === S.pieceSel ? 'on' : ''}">#${pc.no} ${esc(pc.name)}</button>`).join('') + '</div>';
  const pc = p.pieces.find((q) => q.id === S.pieceSel);
  if (pc) h += pieceDetail(pc);
  h += matchCard();
  return h + '</div>';
}
function pieceDetail(pc) {
  const p = S.p, m = pc.outline.closed ? measure(pc) : null, edges = pc.outline.closed ? G.edges(pc.outline) : [];
  const iss = checkPiece(pc), mat = S.lib.find((x) => x.id === pc.material);
  let h = `<div class="card"><h3>#${pc.no} ${esc(pc.name)} ${pieceStatus(pc)}<span class="sp"></span><button type="button" data-act="editpc">Stampada düzenle</button></h3>
  <div class="grid">
    <label>Parça adı<input data-pc="name" value="${esc(pc.name)}" maxlength="80"></label>
    <label>Kodu<input data-pc="code" value="${esc(pc.code)}" maxlength="40"></label>
    <label>Parça numarası<input data-pc="no" value="${pc.no}" inputmode="numeric"></label>
    <label>Türü<select data-pc="kind">${optsArr(M.PIECE_KINDS, pc.kind)}</select></label>
    <label>Sağ / sol<select data-pc="side">${opts(M.SIDES, pc.side)}</select></label>
    <label>Adet (çift başına)<input data-pc="qty" value="${pc.qty}" inputmode="numeric"></label>
    <label>Malzeme<select data-pc="material"><option value="">— seçilmedi —</option>${S.lib.map((x) => `<option value="${esc(x.id)}"${x.id === pc.material ? ' selected' : ''}>${esc(x.name)} (${nv(x.thickness)} mm)</option>`).join('')}</select></label>
    <label class="wide">Notlar<textarea data-pc="notes" maxlength="1000">${esc(pc.notes)}</textarea></label>
  </div>`;
  if (m) h += `<p class="m">Net ölçü <b>${f1(m.width)} × ${f1(m.height)} mm</b> · net çevre ${f1(m.netPerimeter)} mm · net alan ${f1(m.netArea / 100)} cm² · kesim alanı ${f1(m.cutArea / 100)} cm² · kesim çevresi ${f1(m.cutPerimeter)} mm · ${edges.length} kenar</p>`;
  else h += `<p class="iss">Parçanın sınırı kapalı değil. Stampa Atölyesi'nde sınırı çiz.</p>`;
  for (const x of iss) h += `<p class="iss ${x.level === 'hata' ? 'bad' : ''}">${x.level === 'hata' ? 'Hata' : 'Uyarı'}: ${esc(x.msg)}</p>`;
  h += '</div>';
  // paylar
  h += `<div class="card"><h3>Paylar (mm)<span class="sp"></span><button type="button" data-act="autoallow" title="Otomatik işaretli payları malzeme kalınlığı ve üretim yöntemine göre yeniden hesapla">Otomatik hesapla</button></h3>
  <div class="scroll"><table><tr><th>Pay türü</th><th>Değer</th><th>Otomatik</th><th>Hangi üretim işlemi</th></tr>`;
  for (const k of M.ALLOW_KEYS) h += `<tr><td><b>${esc(M.ALLOW[k].name)}</b></td><td><input class="n" data-allow="${k}" value="${nv(pc.allow[k])}" inputmode="decimal"></td><td><input type="checkbox" data-allowauto="${k}"${pc.allowAuto[k] !== false ? ' checked' : ''}></td><td class="op">${esc(M.ALLOW[k].op)}</td></tr>`;
  h += `</table></div><p class="small">Her kenara yalnız bir pay türü atanır (aşağıdaki kenar tablosu); bir türün değerini değiştirmek diğerlerini etkilemez. Otomatik değerler (${esc(mat ? mat.name + ', ' + nv(mat.thickness) + ' mm' : 'malzeme seçilmedi: 1,2 mm varsayıldı')} · ${esc(M.METHODS[p.method])}) atölye başlangıç değeridir; kendi standardına göre düzelt — elle girilen değer otomatik hesapta korunur.</p></div>`;
  // kenarlar
  if (edges.length) {
    h += `<div class="card"><h3>Kenarlar</h3><p class="small">Kenarlar parça sınırındaki <b>kenar başı</b> düğümlerinde ayrılır (stampada turuncu baklava). Dikiş çizgisi net çizgiden içeri çizilir.</p><div class="scroll"><table>
    <tr><th>#</th><th>Ad</th><th>Uzunluk</th><th>Pay türü</th><th>Pay</th><th>Köşe</th><th>Dikiş</th><th>Mesafe</th><th>Sıra</th><th>Sıra arası</th><th>Baştan / sondan boşluk</th></tr>`;
    edges.forEach((e, i) => {
      const pr = M.edgeProp(pc, e.id);
      h += `<tr><td>${i + 1}</td><td><input data-edge="${e.id}" data-ek="name" value="${esc(pr.name)}" placeholder="kenar ${i + 1}" style="min-width:110px"></td><td>${f1(G.edgeLength(e))}</td>
      <td><select data-edge="${e.id}" data-ek="kind">${Object.entries(M.ALLOW).map(([k, v]) => `<option value="${k}"${pr.kind === k ? ' selected' : ''}>${esc(v.name)}</option>`).join('')}</select></td>
      <td>${nv(M.allowValue(pc, pr.kind))}</td>
      <td><select data-edge="${e.id}" data-ek="corner">${opts(M.CORNERS, pr.corner)}</select></td>
      <td><input type="checkbox" data-edge="${e.id}" data-ek="st.on"${pr.stitch.on ? ' checked' : ''}></td>
      <td><input class="n" data-edge="${e.id}" data-ek="st.dist" value="${nv(pr.stitch.dist)}" inputmode="decimal"></td>
      <td><input class="n" data-edge="${e.id}" data-ek="st.rows" value="${pr.stitch.rows}" inputmode="numeric" style="width:48px"></td>
      <td><input class="n" data-edge="${e.id}" data-ek="st.gap" value="${nv(pr.stitch.gap)}" inputmode="decimal"></td>
      <td style="white-space:nowrap"><input class="n" data-edge="${e.id}" data-ek="st.from" value="${nv(pr.stitch.from)}" inputmode="decimal" style="width:56px"> <input class="n" data-edge="${e.id}" data-ek="st.to" value="${nv(pr.stitch.to)}" inputmode="decimal" style="width:56px"></td></tr>`;
    });
    h += '</table></div></div>';
  }
  // işaretler
  h += `<div class="card"><h3>Teknik işaretler (${pc.marks.length})</h3>`;
  if (!pc.marks.length) h += '<p class="small">Çentik, binme noktası, delik, aksesuar ve referans noktalarını stampada ilgili araçla parçaya dokunarak ekle.</p>';
  else {
    h += '<div class="scroll"><table><tr><th>Tür</th><th>Etiket</th><th>Konum</th><th></th></tr>';
    for (const mk of pc.marks) {
      const ei = mk.edge ? edges.findIndex((e) => e.id === mk.edge) : -1;
      h += `<tr><td>${esc(M.MARK_KINDS[mk.kind]?.name || mk.kind)}</td><td><input data-mk="${esc(mk.id)}" data-mkk="label" value="${esc(mk.label || '')}" style="width:80px"></td><td>${mk.edge ? `kenar ${ei + 1}, baştan <input class="n" data-mk="${esc(mk.id)}" data-mkk="at" value="${nv(mk.at)}" inputmode="decimal"> mm` : `X ${nv(mk.p?.[0])} · Y ${nv(mk.p?.[1])}${mk.d ? ' · Ø' + nv(mk.d) : ''}`}</td><td><button type="button" class="danger" data-delmk="${esc(mk.id)}">Sil</button></td></tr>`;
    }
    h += '</table></div>';
  }
  h += `<p class="small">${pc.lines.length} iç çizgi (katlama, kıvırma, merkez…) · ${pc.dims.length} ölçü · ${pc.texts.length} yazı · otomatik en/boy ölçüsü <label style="display:inline-flex;gap:4px;align-items:center;color:var(--text)"><input type="checkbox" data-pc="autoDims"${pc.autoDims ? ' checked' : ''}> göster</label></p></div>`;
  // kampre / form verme altyapısı
  const f = pc.forming;
  h += `<div class="card"><h3>Modelleme payları ve kampre verisi</h3>
  <p class="small">Bu bilgiler parça bazında saklanır ve dosyalara yazılır. <b>Otomatik kampre, form verme ve açınım hesabı henüz yok</b> (Aşama 5); burada hiçbir hesap yapılmaz, yalnız veri tutulur.</p>
  <div class="grid">
    <label>Ön kampre (mm)<input data-fm="kampre.onMm" value="${nv(f.kampre.onMm)}" inputmode="decimal"></label>
    <label>Arka kampre (mm)<input data-fm="kampre.arkaMm" value="${nv(f.kampre.arkaMm)}" inputmode="decimal"></label>
    <label class="wide">Kampre notu<input data-fm="kampre.not" value="${esc(f.kampre.not)}"></label>
    <label>Ön form verme payı (mm)<input data-fm="onForm.payMm" value="${nv(f.onForm.payMm)}" inputmode="decimal"></label>
    <label>Ön form yöntemi<input data-fm="onForm.yontem" value="${esc(f.onForm.yontem)}" placeholder="ör. sıcak form, buhar"></label>
    <label>Arka form verme payı (mm)<input data-fm="arkaForm.payMm" value="${nv(f.arkaForm.payMm)}" inputmode="decimal"></label>
    <label>Arka form yöntemi<input data-fm="arkaForm.yontem" value="${esc(f.arkaForm.yontem)}" placeholder="ör. soğuk/sıcak topuk formu"></label>
    <label>Malzeme esneme yönü (°, 0 sağ · 90 yukarı)<input data-fm="esneme.yonDeg" value="${nv(f.esneme.yonDeg)}" inputmode="decimal" placeholder="boş: gösterme"></label>
    <label>Malzeme kalınlığı (mm, boş: malzemeden)<input data-fm="kalinlikMm" value="${nv(f.kalinlikMm)}" inputmode="decimal" placeholder="${mat ? nv(mat.thickness) : ''}"></label>
    <label>Kalıba çekme payı (mm)<input data-fm="kalibaCekme.payMm" value="${nv(f.kalibaCekme.payMm)}" inputmode="decimal"></label>
    <label>Gerdirme (%)<input data-fm="kalibaCekme.gerdirmePct" value="${nv(f.kalibaCekme.gerdirmePct)}" inputmode="decimal"></label>
    <label>Çekme yönü<input data-fm="kalibaCekme.yon" value="${esc(f.kalibaCekme.yon)}" placeholder="ör. burundan topuğa"></label>
  </div>
  <h3 style="margin-top:10px">Bölgesel modelleme payları<span class="sp"></span><button type="button" data-act="addreg">+ Bölge</button></h3>`;
  if (f.bolgesel.length) {
    h += '<div class="scroll"><table><tr><th>Bölge</th><th>Pay (mm)</th><th>Not</th><th></th></tr>';
    f.bolgesel.forEach((b, i) => { h += `<tr><td><select data-reg="${i}" data-rk="bolge">${optsArr(M.FORM_REGIONS, b.bolge)}</select></td><td><input class="n" data-reg="${i}" data-rk="payMm" value="${nv(b.payMm)}" inputmode="decimal"></td><td><input data-reg="${i}" data-rk="not" value="${esc(b.not)}"></td><td><button type="button" class="danger" data-delreg="${i}">Sil</button></td></tr>`; });
    h += '</table></div>';
  } else h += '<p class="small">Bölge eklenmedi.</p>';
  h += `</div><div class="card row"><button type="button" data-act="copypc">Parçayı kopyala</button><button type="button" data-act="mirrorpc">Ayna (sağ ↔ sol)</button><button type="button" class="danger" data-act="delpc">Parçayı sil</button></div>`;
  return h;
}
function edgeOptions(pieceId, cur) {
  const pc = S.p.pieces.find((q) => q.id === pieceId); if (!pc || !pc.outline.closed) return '<option value="">—</option>';
  return G.edges(pc.outline).map((e, i) => { const pr = M.edgeProp(pc, e.id); return `<option value="${esc(e.id)}"${e.id === cur ? ' selected' : ''}>${i + 1}. ${esc(pr.name || 'kenar')} (${f1(G.edgeLength(e))} mm, ${esc(M.ALLOW[pr.kind].name)})</option>`; }).join('');
}
function matchCard() {
  const p = S.p, f = S.mt;
  const pcOpts = (cur) => p.pieces.filter((q) => q.outline.closed).map((q) => `<option value="${esc(q.id)}"${q.id === cur ? ' selected' : ''}>#${q.no} ${esc(q.name)}</option>`).join('');
  const closed = p.pieces.filter((q) => q.outline.closed);
  if (!f.pa && closed[0]) f.pa = closed[0].id; if (!f.pb && closed[1]) f.pb = closed[1].id; if (!f.pb && closed[0]) f.pb = closed[0].id;
  let h = `<div class="card"><h3>Parça eşleştirme ve kontrol</h3><p class="small">Birbirine dikilecek ya da bindirilecek kenarları eşle: kenar uzunlukları, çentiklerin ve binme noktalarının karşılıklı konumları karşılaştırılır. Etiketli işaretler (A, B…) etiketle, etiketsizler sırayla eşlenir.</p>`;
  for (const r of X.checkAll(p)) {
    const mt = r.match;
    h += `<div class="card" style="background:#0d1730"><h3>${esc(mt.name || 'Eşleşme')} ${r.ok ? (r.issues.length ? '<span class="badge warn">uyarı</span>' : '<span class="badge ok">uyumlu</span>') : '<span class="badge bad">hatalı</span>'}<span class="sp"></span><button type="button" class="danger" data-delmt="${esc(mt.id)}">Sil</button></h3>
    <p class="m">A: ${esc(X.edgeLabel(p, mt.a))}<br>B: ${esc(X.edgeLabel(p, mt.b))}<br>${esc(X.MATCH_KINDS[mt.kind])} · ${mt.reverse ? 'karşılıklı (ters yön)' : 'aynı yön'} · tolerans ±${nv(mt.tol)} mm${Number.isFinite(r.diff) ? ` · uzunluk farkı <b>${nv(r.diff)} mm</b>` : ''}${r.notches ? ` · ${r.notches.length} çentik, ${r.laps.length} binme noktası çifti` : ''}</p>`;
    for (const x of r.issues) h += `<p class="iss ${x.level === 'hata' ? 'bad' : ''}">${esc(x.msg)}</p>`;
    if ((r.notches?.length || r.laps?.length) && r.issues.some((x) => /konum/.test(x.msg))) h += `<button type="button" data-alignmt="${esc(mt.id)}">B'deki işaretleri A'ya göre hizala</button>`;
    h += '</div>';
  }
  if (closed.length) {
    h += `<div class="grid">
      <label>A parçası<select data-mt="pa">${pcOpts(f.pa)}</select></label><label>A kenarı<select data-mt="ea">${edgeOptions(f.pa, f.ea)}</select></label>
      <label>B parçası<select data-mt="pb">${pcOpts(f.pb)}</select></label><label>B kenarı<select data-mt="eb">${edgeOptions(f.pb, f.eb)}</select></label>
      <label>Tür<select data-mt="kind">${opts(X.MATCH_KINDS, f.kind)}</select></label>
      <label>Tolerans (mm)<input data-mt="tol" value="${nv(f.tol)}" inputmode="decimal"></label>
      <label class="row" style="color:var(--text)"><input type="checkbox" data-mt="reverse"${f.reverse ? ' checked' : ''}> Kenarlar karşılıklı (ters yönde) birleşir</label>
      <label>Ad (isteğe bağlı)<input data-mt="name" value="${esc(f.name || '')}"></label>
    </div><div class="row"><button type="button" class="ok" data-act="addmt">Eşleşme ekle</button></div>`;
  } else h += '<p class="small">Eşleştirme için en az bir kapalı parça gerekir.</p>';
  return h + '</div>';
}

/* ---------- 5. Malzeme kütüphanesi ---------- */
function pageMaterials() {
  const f = S.matForm;
  let h = `<div class="page"><h2>Malzeme Kütüphanesi</h2><p class="small">Kütüphane bütün projelerde ortaktır. Kalınlık ve esneme bilgileri pay önerisinde kullanılır; ileride otomatik kampre ve açınım hesaplarında da kullanılacak. Hazır değerler tahminidir, kendi malzemene göre düzelt.</p>
  <div class="row"><button type="button" class="ok" data-act="newmat">+ Yeni malzeme</button></div>`;
  if (f) h += `<div class="card"><h3>${f.id && S.lib.some((m) => m.id === f.id) ? 'Malzemeyi düzenle' : 'Yeni malzeme'}</h3><div class="grid">
    <label class="wide">Ad<input data-mf="name" value="${esc(f.name)}" maxlength="80"></label>
    <label>Tür<select data-mf="type">${opts(M.MATERIAL_TYPES, f.type)}</select></label>
    <label>Kalınlık (mm)<input data-mf="thickness" value="${nv(f.thickness)}" inputmode="decimal"></label>
    <label>Esneme yönü<select data-mf="stretchDir">${opts(M.STRETCH_DIRS, f.stretchDir)}</select></label>
    <label>Boy yönü esneme (%)<input data-mf="boy" value="${nv(f.stretchPct.boy)}" inputmode="decimal"></label>
    <label>En yönü esneme (%)<input data-mf="en" value="${nv(f.stretchPct.en)}" inputmode="decimal"></label>
    <label class="wide">Açıklama<textarea data-mf="desc" maxlength="500">${esc(f.desc)}</textarea></label></div>
    <div class="row"><button type="button" class="ok" data-act="savemat">Kaydet</button><button type="button" data-act="cancelmat">Vazgeç</button></div></div>`;
  h += '<div class="plist">' + S.lib.map((m) => {
    const used = S.p ? S.p.pieces.filter((q) => q.material === m.id).length + (S.p.material === m.id ? 1 : 0) : 0;
    return `<div class="pitem"><div class="t"><b>${esc(m.name)}</b><span class="small">${esc(M.MATERIAL_TYPES[m.type])} · ${nv(m.thickness)} mm · ${esc(M.STRETCH_DIRS[m.stretchDir])} (boy %${nv(m.stretchPct.boy)}, en %${nv(m.stretchPct.en)})${m.builtin ? ' · hazır' : ''}${used ? ` · bu projede ${used} yerde` : ''}</span>${m.desc ? `<span class="small">${esc(m.desc)}</span>` : ''}</div>
    <div class="acts"><button type="button" data-editmat="${esc(m.id)}">Düzenle</button>${m.builtin ? '' : `<button type="button" class="danger" data-delmat="${esc(m.id)}">Sil</button>`}</div></div>`;
  }).join('') + '</div></div>';
  return h;
}

/* ---------- 6. Proje dosyaları ---------- */
async function pageFiles() {
  const p = S.p, revs = await store.revisions(p.id);
  const pcIss = p.pieces.flatMap((pc) => checkPiece(pc).map((x) => ({ ...x, pc })));
  const mtIss = X.checkAll(p).flatMap((r) => r.issues.map((x) => ({ ...x, mt: r.match })));
  const errs = [...pcIss, ...mtIss, ...M.validateProject(p)].filter((x) => x.level === 'hata').length;
  let h = `<div class="page"><h2>Proje Dosyaları</h2>
  <div class="card"><h3>Proje bilgileri</h3>${projectFields(p, 'pf')}<p class="small">Oluşturma ${date(p.created)} · son değişiklik ${date(p.modified)} · revizyon ${p.rev}</p></div>
  <div class="card"><h3>Proje kontrolü ${errs ? `<span class="badge bad">${errs} hata</span>` : '<span class="badge ok">hata yok</span>'}</h3>
  <p class="m">${p.pieces.length} parça · ${p.matches.length} eşleşme · ${p.sketch.paths.length} yardımcı çizgi · ${p.materials.length} malzeme kaydı</p>`;
  for (const x of [...pcIss, ...mtIss].slice(0, 30)) h += `<p class="iss ${x.level === 'hata' ? 'bad' : ''}">${x.pc ? `#${x.pc.no} ${esc(x.pc.name)}` : esc(x.mt?.name || 'Eşleşme')}: ${esc(x.msg)}</p>`;
  h += `</div><div class="card"><h3>Kayıt ve revizyonlar</h3><p class="small">Her değişiklik bu cihazda otomatik kaydedilir (${storeKind === 'idb' ? 'tarayıcı veritabanı' : '⚠ geçici bellek'}). Revizyon, projenin o anki tam kopyasını saklar (son 30).</p>
  <div class="row"><input data-act-input="revnote" placeholder="Revizyon notu (isteğe bağlı)" style="flex:1;min-width:160px"><button type="button" class="ok" data-act="commit">Revizyon kaydet</button></div>`;
  if (revs.length) h += '<div class="scroll"><table><tr><th>Rev</th><th>Tarih</th><th>Not</th><th></th></tr>' + revs.map((r) => `<tr><td>${r.rev}</td><td>${date(r.at)}</td><td>${esc(r.note)}</td><td><button type="button" data-restore="${r.rev}">Geri yükle</button></td></tr>`).join('') + '</table></div>';
  h += `</div><div class="card"><h3>Yedek dosyası</h3><p class="small">JSON yedeği; proje bilgileri, saya geometrileri, teknik çizgiler, paylar, malzeme bilgileri, katmanlar ve ölçüleri birlikte içerir. Başka cihazda "Projelerim → JSON yedeğinden aç" ile açılır.</p>
  <div class="row"><button type="button" data-act="backup">JSON yedeği indir</button><label class="btn" style="margin:0">JSON yedeğinden aç<input type="file" accept=".json,application/json" data-file="import" hidden></label><button type="button" data-act="close">Projeyi kapat</button></div></div></div>`;
  return h;
}

/* ---------- 7. Dışa aktarma ---------- */
function pageExport() {
  const p = S.p, o = S.exp, closed = p.pieces.filter((q) => q.outline.closed);
  const sel = o.pieces || closed.map((q) => q.id);
  let info = '';
  try { const L = E.pdfLayout(p, { ...o, pieces: sel }); info = `PDF: ${L.pages.length} sayfa (${L.W} × ${L.H} mm, yazdırılabilir alan ${f1(L.pw)} × ${f1(L.ph)} mm)` + (L.pages.some((q) => q.kind === 'tile') ? ' · büyük parçalar döşenerek bölünür' : ''); } catch (e) { info = '⚠ ' + e.message; }
  let h = `<div class="page"><h2>Dışa Aktarma</h2>
  <div class="card"><h3>Parçalar</h3><div class="chips">${closed.map((q) => `<label class="btn" style="margin:0;color:var(--text)"><input type="checkbox" data-xp="${esc(q.id)}"${sel.includes(q.id) ? ' checked' : ''}> #${q.no} ${esc(q.name)}</label>`).join('') || '<span class="small">Kapalı parça yok.</span>'}</div>
  <p class="small">Yalnız görünür katmanlar yazılır (Stampa → Katmanlar ya da Ayarlar). Çıktılar ekrandaki çizimle aynı geometriden üretilir.</p></div>
  <div class="card"><h3>PDF — ölçekli teknik stampa</h3><div class="grid">
    <label>Kâğıt<select data-x="paper">${opts({ A4: 'A4 (210 × 297)', A3: 'A3 (297 × 420)', ozel: 'Özel ölçü' }, o.paper)}</select></label>
    ${o.paper === 'ozel' ? `<label>Genişlik (mm)<input data-x="w" value="${nv(o.w)}" inputmode="decimal"></label><label>Yükseklik (mm)<input data-x="h" value="${nv(o.h)}" inputmode="decimal"></label>` : ''}
    <label>Yön<select data-x="landscape">${opts({ '': 'Dikey', '1': 'Yatay' }, o.landscape ? '1' : '')}</select></label>
    <label>Kenar boşluğu (mm)<input data-x="margin" value="${nv(o.margin)}" inputmode="decimal"></label>
    <label>Döşeme bindirmesi (mm)<input data-x="overlap" value="${nv(o.overlap)}" inputmode="decimal"></label>
    <label class="row" style="color:var(--text)"><input type="checkbox" data-x="onePerPage"${o.onePerPage ? ' checked' : ''}> Her parça ayrı sayfada</label>
  </div><p class="m">${esc(info)}</p>
  <p class="small">Ölçek 1:1. Yazdırırken <b>"Gerçek boyut / %100"</b> seç ("sayfaya sığdır" değil). Her sayfadaki 50 mm kontrol çizgisini cetvelle ölç. Sayfaya sığmayan parça, artı işaretleriyle hizalanan döşeme sayfalarına bölünür.</p>
  <div class="row"><button type="button" class="ok" data-act="pdf">PDF indir</button></div></div>
  <div class="card"><h3>SVG ve DXF</h3>
  <label class="row" style="color:var(--text)"><input type="checkbox" data-x="sketch"${o.sketch ? ' checked' : ''}> Stampa yardımcı çizgilerini de ekle</label>
  <p class="small"><b>SVG:</b> birimi mm, 1:1; her katman ayrı grup (Inkscape / Illustrator katmanı). <b>DXF:</b> R12 (AC1009) ASCII, birim mm; her teknik çizgi kendi katmanında (KESIM, NET, DIKIS, BINME, MONTAJ, BINME_NOKTA, CENTIK, KATLAMA, MERKEZ, REFERANS, DELIK, OLCU, YAZI, YARDIMCI). Bezier eğrileri 0,02 mm toleransla çoklu çizgiye çevrilir; DXF yazıları Türkçe karakter içermez (ASCII).</p>
  <div class="row"><button type="button" data-act="svg">SVG indir</button><button type="button" data-act="dxf">DXF indir</button></div></div></div>`;
  return h;
}

/* ---------- 8. Ayarlar ---------- */
function pageSettings() {
  let h = `<div class="page"><h2>Ayarlar</h2><div class="card"><h3>Çizim alanı</h3><div class="grid">
    <label>Izgara aralığı (mm)<select data-set="grid">${[1, 2, 5, 10].map((v) => `<option value="${v}"${settings.grid === v ? ' selected' : ''}>${v} mm</option>`).join('')}</select></label>
    <label class="row" style="color:var(--text)"><input type="checkbox" data-set="showGrid"${settings.showGrid ? ' checked' : ''}> Izgarayı göster</label>
    <label class="row" style="color:var(--text)"><input type="checkbox" data-set="snapGrid"${settings.snapGrid ? ' checked' : ''}> Izgaraya yakala</label>
    <label class="row" style="color:var(--text)"><input type="checkbox" data-set="snapNode"${settings.snapNode ? ' checked' : ''}> Noktalara yakala</label>
    <label class="row" style="color:var(--text)"><input type="checkbox" data-set="snapAngle"${settings.snapAngle ? ' checked' : ''}> Açı yakalama (15°)</label>
  </div><p class="small">Ölçü birimi milimetredir. Yakınlaştırma yalnız görünümü değiştirir; çizimin gerçek ölçüleri değişmez. Sürüklerken ızgaraya yakalama açıksa taşıma da ızgara adımıyla yapılır.</p></div>`;
  if (S.p) {
    h += `<div class="card"><h3>Katmanlar (bu proje)</h3><div class="scroll"><table><tr><th>Görünür</th><th>Katman</th><th>Renk</th><th>Kalınlık (mm)</th><th>Çizgi türü</th></tr>`;
    for (const L of M.LAYERS) {
      const u = S.p.layers[L.id];
      h += `<tr><td><input type="checkbox" data-ly="${L.id}" data-lk="visible"${u.visible !== false ? ' checked' : ''}></td><td>${esc(L.name)} <span class="small">(${L.dxf})</span></td><td><input type="color" data-ly="${L.id}" data-lk="color" value="${esc(u.color || L.color)}"></td><td><input class="n" data-ly="${L.id}" data-lk="width" value="${nv(u.width ?? L.width)}" inputmode="decimal"></td>
      <td><select data-ly="${L.id}" data-lk="type"><option value="">Varsayılan</option>${opts(Object.fromEntries(Object.entries(M.LINE_TYPES).map(([k, v]) => [k, v.name])), u.type || '')}</select></td></tr>`;
    }
    h += `</table></div><div class="row"><button type="button" data-act="layerreset">Varsayılana dön</button></div><p class="small">Ekranda katman rengi kullanılır. PDF ve SVG beyaz kâğıt için koyu renklerle basılır; bir katmanın rengini değiştirirsen çıktıda da senin rengin kullanılır. Kalınlık ve çizgi türü çıktılara da uygulanır.</p></div>`;
  }
  h += `<div class="card"><h3>Gelecek aşamalar</h3><p class="small">Aşağıdakiler <b>henüz yoktur</b>; proje dosyasında yalnız yerleri ayrılmıştır (ayrıntı: docs/AYAKKABI.md).</p><ul class="future">
    <li><b>Aşama 2</b> — 3D kalıp dosyası yükleme, görüntüleme ve ölçüm</li><li><b>Aşama 3</b> — telefon kamerasıyla kalıp tarama</li><li><b>Aşama 4</b> — fotoğraftan yapay zekâ destekli saya parçası tanıma</li>
    <li><b>Aşama 5</b> — 3D saya yüzeyinin 2D açınımı, kampre hesapları, malzeme telafisi</li><li><b>Aşama 6</b> — grafik tasarım, logo, baskı alanları, 3D önizleme</li><li><b>Aşama 7</b> — otomatik numara serileme (grading)</li><li><b>Aşama 8</b> — kesim yerleşimi ve malzeme optimizasyonu</li></ul></div>
  <div class="card"><h3>Depolama</h3><p class="small">${storeKind === 'idb' ? 'Projeler bu tarayıcının veritabanında ("cizim-ayk") saklanır. Makine ve Tekstil projelerinden ayrıdır.' : '⚠ Kalıcı depolama kullanılamıyor; JSON yedeği indir.'}</p></div></div>`;
  return h;
}

/* ---------- olaylar ---------- */
const main = $('main');
main.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-go]'); if (!t || t.closest('.ed')) return;
  const d = t.dataset;
  if (d.go) return go(d.go);
  if (d.open) return openProject(d.open);
  if (d.dup) { const src = await store.get(d.dup); const imp = await store.importJSON(JSON.stringify(src)); imp.name = src.name + ' (kopya)'; await store.put(imp); toast('Kopyalandı'); return render(); }
  if (d.del) {
    if (t.dataset.arm !== '1') { t.dataset.arm = '1'; t.textContent = 'Emin misin?'; setTimeout(() => { if (t.isConnected) { t.dataset.arm = ''; t.textContent = 'Sil'; } }, 3500); return; }
    await store.remove(d.del); if (S.p?.id === d.del) { S.p = null; S.hist = []; S.fut = []; } toast('Proje silindi'); return render();
  }
  if (d.psel) { S.pieceSel = d.psel; return render(); }
  if (d.delmk) return edit((p) => { const pc = p.pieces.find((q) => q.id === S.pieceSel); pc.marks = pc.marks.filter((m) => m.id !== d.delmk); });
  if (d.delreg) return edit((p) => { p.pieces.find((q) => q.id === S.pieceSel).forming.bolgesel.splice(+d.delreg, 1); });
  if (d.delmt) return edit((p) => { p.matches = p.matches.filter((m) => m.id !== d.delmt); });
  if (d.alignmt) {
    if (t.dataset.arm !== '1') { t.dataset.arm = '1'; t.textContent = "Emin misin? B'deki işaretler taşınacak"; return; }
    return edit((p) => { const n = X.alignMarksFromA(p, p.matches.find((m) => m.id === d.alignmt)); toast(n + ' işaret hizalandı (geri al ile dönebilirsin)'); });
  }
  if (d.editmat) { S.matForm = JSON.parse(JSON.stringify(S.lib.find((m) => m.id === d.editmat))); return render(); }
  if (d.delmat) {
    if (t.dataset.arm !== '1') { t.dataset.arm = '1'; t.textContent = 'Emin misin?'; return; }
    S.lib = S.lib.filter((m) => m.id !== d.delmat); await store.saveMaterials(S.lib); toast('Malzeme kütüphaneden silindi (projelerdeki kayıtlar korunur)'); return render();
  }
  if (d.restore) {
    if (t.dataset.arm !== '1') { t.dataset.arm = '1'; t.textContent = 'Emin misin?'; return; }
    await flush(); S.p = await store.restore(S.p.id, +d.restore); S.hist = []; S.fut = []; toast('Revizyon ' + d.restore + ' geri yüklendi (yeni revizyon olarak)'); return render();
  }
  const a = d.act; if (!a) return;
  const p = S.p, pc = p?.pieces.find((q) => q.id === S.pieceSel);
  if (a === 'create') {
    const dr = S.newDraft; readFields('n', dr);
    if (!dr.name) { main.querySelector('[data-n="name"]').classList.add('bad'); return toast('Model adını gir'); }
    const np = M.createProject(dr);
    if (S.newSample) { const n = addSample(np, np.material); const mat = S.lib.find((m) => m.id === np.material); for (const q of n) { M.refreshAutoAllowances(q, mat, np.method); } }
    syncMaterials(np); await store.commit(np, 'Proje oluşturuldu');
    S.newDraft = null; S.newSample = false; toast('Proje oluşturuldu');
    return openProject(np.id, 'stampa');
  }
  if (a === 'newpiece') { S.pendingNewPiece = true; return go('stampa'); }
  if (a === 'sample') return edit((q) => { const n = addSample(q, q.material); const mat = S.lib.find((m) => m.id === q.material); for (const x of n) M.refreshAutoAllowances(x, mat, q.method); S.pieceSel = n[0].id; });
  if (a === 'editpc') { S.openCtx = true; return go('stampa'); }
  if (a === 'autoallow') return edit(() => { for (const k of M.ALLOW_KEYS) pc.allowAuto[k] = true; M.refreshAutoAllowances(pc, S.lib.find((m) => m.id === pc.material), p.method); toast('Paylar malzeme ve yönteme göre hesaplandı'); });
  if (a === 'addreg') return edit(() => { pc.forming.bolgesel.push({ bolge: M.FORM_REGIONS[0], payMm: null, not: '' }); });
  if (a === 'copypc') return edit((q) => { const c = M.copyPiece(pc, M.nextPieceNo(q)); const b = measure(pc)?.box; M.transformPiece(c, G.moveFn(b ? b.x1 - b.x0 + 30 : 50, 0)); q.pieces.push(c); S.pieceSel = c.id; toast('Kopyalandı: #' + c.no); });
  if (a === 'mirrorpc') return edit(() => { const b = measure(pc)?.box; M.mirrorPiece(pc, b ? (b.x0 + b.x1) / 2 : 0); toast('Aynalandı: ' + M.SIDES[pc.side]); });
  if (a === 'delpc') {
    if (t.dataset.arm !== '1') { t.dataset.arm = '1'; t.textContent = 'Emin misin? Tekrar dokun'; return; }
    return edit((q) => { M.removePiece(q, pc.id); S.pieceSel = q.pieces[0]?.id || null; toast('Parça silindi (geri al: Stampa → ↶)'); });
  }
  if (a === 'addmt') {
    const f = S.mt; if (!f.pa || !f.pb || !f.ea || !f.eb) { readMt(); }
    if (!f.ea || !f.eb) return toast('İki kenarı da seç');
    if (f.pa === f.pb && f.ea === f.eb) return toast('Bir kenar kendisiyle eşlenemez');
    return edit((q) => { q.matches.push(X.makeMatch({ name: f.name, a: { piece: f.pa, edge: f.ea }, b: { piece: f.pb, edge: f.eb }, kind: f.kind, reverse: f.reverse, tol: f.tol })); f.name = ''; toast('Eşleşme eklendi'); });
  }
  if (a === 'newmat') { S.matForm = M.makeMaterial({ name: '', type: 'deri', thickness: 1.2, stretchDir: 'en' }); S.matForm.name = ''; return render(); }
  if (a === 'cancelmat') { S.matForm = null; return render(); }
  if (a === 'savemat') {
    const f = S.matForm, g = (k) => main.querySelector(`[data-mf="${k}"]`).value;
    const m = M.makeMaterial({ id: f.id, name: g('name').trim(), type: g('type'), thickness: pn(g('thickness')), stretchDir: g('stretchDir'), stretchPct: { boy: pn(g('boy')) ?? 0, en: pn(g('en')) ?? 0 }, desc: g('desc'), builtin: f.builtin });
    const errs = M.validateMaterial({ ...m, name: g('name').trim(), thickness: pn(g('thickness')), stretchPct: { boy: pn(g('boy')) ?? 0, en: pn(g('en')) ?? 0 } });
    if (errs.length) return toast(errs.join(' · '));
    const i = S.lib.findIndex((x) => x.id === m.id); if (i >= 0) S.lib[i] = m; else S.lib.push(m);
    await store.saveMaterials(S.lib); S.matForm = null; if (S.p) dirty(); toast('Malzeme kaydedildi'); return render();
  }
  if (a === 'commit') { await flush(); const note = main.querySelector('[data-act-input="revnote"]')?.value || ''; syncMaterials(p); await store.commit(p, note); toast('Revizyon ' + p.rev + ' kaydedildi'); return render(); }
  if (a === 'backup') { await flush(); saveBlob(new Blob([store.exportJSON(p)], { type: 'application/json' }), `${p.name}${p.code ? '-' + p.code : ''}.ayakkabi.json`); return; }
  if (a === 'close') return closeProject();
  if (a === 'layerreset') return edit((q) => { q.layers = M.defaultLayers(); });
  if (a === 'pdf' || a === 'svg' || a === 'dxf') {
    const o = S.exp, pieces = o.pieces || p.pieces.filter((q) => q.outline.closed).map((q) => q.id);
    const base = `${p.name}${p.code ? '-' + p.code : ''}-No${p.size}`;
    try {
      if (a === 'pdf') { const r = E.toPDF(p, { ...o, pieces }); saveBlob(new Blob([r.bytes], { type: 'application/pdf' }), base + '.pdf'); toast(`PDF hazır: ${r.pages} sayfa, ölçek 1:1`); }
      if (a === 'svg') { saveBlob(new Blob([E.toSVG(p, { pieces, sketch: o.sketch })], { type: 'image/svg+xml' }), base + '.svg'); toast('SVG hazır (mm, 1:1)'); }
      if (a === 'dxf') { saveBlob(new Blob([E.toDXF(p, { pieces, sketch: o.sketch })], { type: 'application/dxf' }), base + '.dxf'); toast('DXF hazır (R12, mm, katmanlı)'); }
    } catch (err) { toast('Dışa aktarılamadı: ' + err.message); }
  }
});
function readMt() {
  const f = S.mt;
  for (const el of main.querySelectorAll('[data-mt]')) { const k = el.dataset.mt; f[k] = el.type === 'checkbox' ? el.checked : k === 'tol' ? (pn(el.value) ?? 0.5) : el.value; }
}
main.addEventListener('change', async (e) => {
  const el = e.target; if (el.closest('.ed')) return;
  const d = el.dataset, p = S.p, v = pn(el.value);
  const bad = (msg = 'Geçerli bir sayı gir') => { el.classList.add('bad'); toast(msg); };
  if (d.file === 'import') {
    const file = el.files?.[0]; if (!file) return;
    if (file.size > 30 * 1024 * 1024) return toast('Dosya çok büyük (30 MB üstü)');
    try { const np = await store.importJSON(await file.text()); toast('İçe aktarıldı: ' + np.name); return openProject(np.id, 'parcalar'); } catch (err) { return toast('Açılamadı: ' + err.message); }
  }
  if (d.n !== undefined) { if (d.n === 'sample') S.newSample = el.checked; else S.newDraft[d.n] = el.value; return; }
  if (d.pf !== undefined) {
    const k = d.pf; if (k === 'name' && !el.value.trim()) return bad('Model adı boş olamaz');
    return edit((q) => {
      q[k] = k === 'material' ? (el.value || null) : el.value.trim().slice(0, k === 'desc' ? 2000 : 80);
      if (k === 'material' || k === 'method') { const mat = S.lib.find((m) => m.id === q.material); for (const pc of q.pieces) { if (k === 'material' && !pc.material) pc.material = q.material; M.refreshAutoAllowances(pc, S.lib.find((m) => m.id === pc.material) || mat, q.method); } toast('Otomatik paylar yeniden hesaplandı'); }
    });
  }
  if (d.set) {
    if (d.set === 'grid') settings.grid = +el.value; else settings[d.set] = el.checked;
    saveSettings(); toast('Ayar kaydedildi'); return;
  }
  if (d.ly) {
    const L = M.LAYER[d.ly];
    if (d.lk === 'width' && !(v > 0 && v <= 5)) return bad('Kalınlık 0–5 mm');
    return edit((q) => { const u = q.layers[d.ly]; if (d.lk === 'visible') u.visible = el.checked; else if (d.lk === 'color') u.color = /^#[0-9a-f]{6}$/i.test(el.value) ? el.value : L.color; else if (d.lk === 'width') u.width = v; else if (d.lk === 'type') u.type = el.value || null; }, { rerender: false });
  }
  if (d.x !== undefined) {
    const o = S.exp, k = d.x;
    if (['w', 'h', 'margin', 'overlap'].includes(k)) { if (!Number.isFinite(v) || v < 0 || (k !== 'margin' && k !== 'overlap' && v < 80)) return bad(k === 'w' || k === 'h' ? 'Sayfa kenarı en az 80 mm' : 'Geçerli bir sayı gir'); o[k] = v; }
    else if (k === 'landscape') o.landscape = !!el.value; else if (k === 'onePerPage' || k === 'sketch') o[k] = el.checked; else o[k] = el.value;
    return render();
  }
  if (d.xp) {
    const all = p.pieces.filter((q) => q.outline.closed).map((q) => q.id), cur = new Set(S.exp.pieces || all);
    if (el.checked) cur.add(d.xp); else cur.delete(d.xp);
    S.exp.pieces = all.filter((id) => cur.has(id)); return render();
  }
  if (d.mt) { readMt(); if (d.mt === 'pa') S.mt.ea = null; if (d.mt === 'pb') S.mt.eb = null; return render(); }
  const pc = p?.pieces.find((q) => q.id === S.pieceSel); if (!pc) return;
  if (d.pc) {
    const k = d.pc;
    if (k === 'no' || k === 'qty') { if (!(v >= 1 && v <= 999)) return bad('1–999 arası tam sayı'); return edit(() => { pc[k] = Math.round(v); }); }
    if (k === 'autoDims') return edit(() => { pc.autoDims = el.checked; });
    if (k === 'name' && !el.value.trim()) return bad('Parça adı boş olamaz');
    return edit(() => { pc[k] = k === 'material' ? (el.value || null) : el.value.trim().slice(0, k === 'notes' ? 1000 : 80); if (k === 'material') M.refreshAutoAllowances(pc, S.lib.find((m) => m.id === pc.material), p.method); });
  }
  if (d.allow) { if (!(v >= 0 && v <= 60)) return bad('Pay 0–60 mm arasında olmalı'); return edit(() => { pc.allow[d.allow] = v; pc.allowAuto[d.allow] = false; }); }
  if (d.allowauto) return edit(() => { pc.allowAuto[d.allowauto] = el.checked; if (el.checked) M.refreshAutoAllowances(pc, S.lib.find((m) => m.id === pc.material), p.method); });
  if (d.edge) {
    const k = d.ek;
    if (k === 'name' || k === 'kind' || k === 'corner') return edit(() => M.setEdgeProp(pc, d.edge, { [k]: k === 'name' ? el.value.slice(0, 40) : el.value }));
    const sk = k.slice(3);
    if (sk === 'on') return edit(() => M.setEdgeProp(pc, d.edge, { stitch: { on: el.checked } }));
    const lim = { dist: [0, 30], rows: [1, 4], gap: [0.5, 20], from: [0, 2000], to: [0, 2000] }[sk];
    if (!(v >= lim[0] && v <= lim[1])) return bad(`${lim[0]}–${lim[1]} arası değer gir`);
    return edit(() => M.setEdgeProp(pc, d.edge, { stitch: { [sk]: sk === 'rows' ? Math.round(v) : v } }));
  }
  if (d.mk) {
    const m = pc.marks.find((q) => q.id === d.mk); if (!m) return;
    if (d.mkk === 'label') return edit(() => { m.label = el.value.slice(0, 12); });
    if (!(v >= 0)) return bad(); return edit(() => { m.at = v; });
  }
  if (d.fm) {
    const [a, b] = d.fm.split('.'), isText = /not|yontem|yon$/.test(b || a) && !/yonDeg/.test(b || '');
    if (!isText && el.value.trim() !== '' && !Number.isFinite(v)) return bad();
    return edit(() => { const val = isText ? el.value.slice(0, 300) : (el.value.trim() === '' ? null : v); if (b) pc.forming[a][b] = val; else pc.forming[a] = val; }, { rerender: false });
  }
  if (d.reg !== undefined) {
    const r = pc.forming.bolgesel[+d.reg]; if (!r) return;
    if (d.rk === 'payMm' && el.value.trim() !== '' && !Number.isFinite(v)) return bad();
    return edit(() => { r[d.rk] = d.rk === 'payMm' ? (el.value.trim() === '' ? null : v) : el.value.slice(0, 300); }, { rerender: false });
  }
});
document.addEventListener('keydown', (e) => {
  if (S.page === 'stampa' || !S.p) return;
  if (e.target.matches('input, textarea, select')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
});

/* ---------- başlangıç: son açık proje ---------- */
let last = null; try { last = localStorage.getItem(LKEY); } catch (e) { /* */ }
const q = new URLSearchParams(location.search);
if (last && !q.has('liste') && (await store.get(last))) await openProject(last, 'stampa');
else go('projeler');
window.__ayk = { S, store, M, G, E };   // E2E testleri için (yalnız okuma amaçlı)
