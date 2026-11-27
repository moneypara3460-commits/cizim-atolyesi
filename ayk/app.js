// Ayakkabı Modelhanesi — uygulama kabuğu: 8 bölüm, otomatik kayıt, geri al / ileri al.
// Hesap ve doğrulama saf modüllerde (geom, model, build, match, export); burada yalnız gösterim ve düzenleme.
// Makine ve Tekstil alanlarının uygulama koduna bağlı değildir (yalnız tekstilin saf eğri / PDF / ofset modüllerini okur).
import * as G from './geom.js?v=20261119c';
import * as M from './model.js?v=20261127a';
import { measure, checkPiece, fmt, netPolygon } from './build.js?v=20261119c';
import * as X from './match.js?v=20261119c';
import * as E from './export.js?v=20261119c';
import { openStore, idbBackend, memoryBackend } from './store.js?v=20261119c';
import { createEditor } from './editor.js?v=20261119c';
import { addSample } from './sample.js?v=20261119c';
import * as LST from './last.js?v=20261119c';
import * as AUTO from './auto.js?v=20261127a';
import * as GR from './grade.js?v=20261127b';
import * as NE from './nest.js?v=20261127b';
import * as AI from './ai.js?v=20261127a';
import * as AIP from './aiparts.js?v=20261119c';
import * as L3 from './last3d.js?v=20261119c';
import { run as l3run } from './last3d-worker.js?v=20261119c';
import { saveBlob } from '../tx/download.js?v=20261112u';
import { installKeys, findBtn, press } from '../kb/keys.js?v=20261123a';
import { installHelpKey, sectionsFromContexts } from '../kb/help.js?v=20261123a';

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
  ['malzeme', 'Malzeme Kütüphanesi'], ['dosyalar', 'Proje Dosyaları'], ['numara', 'Numara ve Kesim'], ['aktar', 'Dışa Aktarma'], ['ayarlar', 'Ayarlar'],
];
const S = { page: 'projeler', p: null, lib: [], hist: [], fut: [], editor: null, pieceSel: null, matForm: null, exp: { paper: 'A4', w: 210, h: 297, landscape: false, margin: 10, overlap: 10, onePerPage: false, pieces: null, sketch: false }, mt: { kind: 'dikis', reverse: true, tol: 0.5 }, nk: { from: null, to: null, step: 1, system: null, dL: null, dG: null, pairs: {}, w: 1200, h: 800, defects: '', gap: 2, free: false, out: null } };
S.lib = await store.materials();

/* ---------- kayıt ---------- */
let saveT = null;
function syncMaterials(p) {
  const used = new Set([p.material, ...p.pieces.map((q) => q.material)].filter(Boolean));
  const keep = new Map(p.materials.map((m) => [m.id, m]));
  p.materials = [...used].map((id) => S.lib.find((m) => m.id === id) || keep.get(id)).filter(Boolean).map((m) => M.makeMaterial(m));
}
function dirty() {
  if (S.nk) S.nk.out = null;   // parça değişince eski kesim yerleşimi geçersiz
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
// Fotoğraflar (kalıp, model) her anlık görüntüde tekrar saklanmaz: ortak havuzda bir kez tutulur, görüntüde yalnız anahtarı durur.
const IMGS = new Map();
function imgKey(v) {
  let h = 2166136261; for (let i = 0; i < v.length; i += 7) h = Math.imul(h ^ v.charCodeAt(i), 16777619);
  const k = '\u00a7img:' + v.length + ':' + (h >>> 0).toString(36) + ':' + v.slice(-16);
  IMGS.set(k, v); return k;
}
const snap = (p) => JSON.stringify(p, (k, v) => (typeof v === 'string' && v.length > 1000 && v.startsWith('data:image/') ? imgKey(v) : v));
const unsnap = (j) => JSON.parse(j, (k, v) => (typeof v === 'string' && v.startsWith('\u00a7img:') ? (IMGS.get(v) ?? '') : v));
function begin() { if (!S.p) return; S.hist.push(snap(S.p)); if (S.hist.length > MAXH) S.hist.shift(); S.fut = []; }
function undoLast() { S.hist.pop(); }
function restoreSnap(json) { S.p = unsnap(json); dirty(); S.editor?.refresh(); if (S.page !== 'stampa') render(); }
function undo() { if (!S.hist.length) return toast('Geri alınacak işlem yok'); S.fut.push(snap(S.p)); restoreSnap(S.hist.pop()); }
function redo() { if (!S.fut.length) return toast('İleri alınacak işlem yok'); S.hist.push(snap(S.p)); restoreSnap(S.fut.pop()); }
// sayfa formlarından değişiklik: geri al noktası + kayıt
function edit(fn, { rerender = true } = {}) { begin(); fn(S.p); dirty(); if (rerender) render(); }

async function openProject(id, page = 'stampa') {
  await flush();
  const p = await store.get(id); if (!p) { toast('Proje bulunamadı'); return; }
  S.p = p; S.hist = []; S.fut = []; S.pieceSel = p.pieces[0]?.id || null; S.exp.pieces = null;
  Object.assign(S.nk, { from: null, to: null, system: null, dL: null, dG: null, pairs: {}, out: null });   // numara / kesim: başka projeden kalmasın
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
  // Odaktaki kutu, sayfa değiştirilirken kaldırılınca tarayıcı "change" olayını çizimin ortasında tetikler (iç içe çizim hatası).
  // Önce odağı bırak: bekleyen değer varsa şimdi kaydedilir, sonra sayfa güvenle yeniden çizilir.
  const ae = document.activeElement;
  if (ae && ae !== document.body && $('main').contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) ae.blur();
  renderNav();
  const main = $('main');
  if (S.page !== 'stampa' && S.editor) { S.editor.destroy(); S.editor = null; }
  const pg = S.page;
  if (pg === 'projeler') { const html = await pageProjects(); if (S.page === pg) main.innerHTML = html; return; }
  if (pg === 'yeni') { main.innerHTML = pageNew(); drawL3(); return; }
  if (pg === 'malzeme') { main.innerHTML = pageMaterials(); return; }
  if (pg === 'ayarlar') { main.innerHTML = pageSettings(); return; }
  if (!S.p) { main.innerHTML = needProject(); return; }
  if (pg === 'stampa') return mountEditor();
  if (pg === 'parcalar') { main.innerHTML = pagePieces(); return; }
  if (pg === 'dosyalar') { const html = await pageFiles(); if (S.page === pg) { main.innerHTML = html; drawL3(); } return; }
  if (pg === 'aktar') { main.innerHTML = pageExport(); return; }
  if (pg === 'numara') { main.innerHTML = pageGrade(); return; }
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
    </div>${lastCard(draft, 'n')}<div class="card">
    <label class="row" style="color:var(--text);font-size:13px"><input type="checkbox" data-n="sample"${S.newSample ? ' checked' : ''}> Örnek stampa ekle (basitleştirilmiş derby: ön saya, yan saya, dil — deneme amaçlı)</label>
    <div class="row"><button type="button" class="ok" data-act="create">Projeyi oluştur ve Stampa Atölyesi'ni aç</button></div>
    <p class="small">Birim milimetredir. Payların otomatik başlangıç değerleri malzeme kalınlığı ve üretim yöntemine göre hesaplanır; parça bazında değiştirilebilir.</p></div></div>`;
}
/* ---------- kalıp ve model resmi (yeni proje + proje dosyaları) ---------- */
function lastSvg(v) {
  const x = v.imgAt[0], y = v.imgAt[1], w = v.w / v.k, h = v.h / v.k;
  const d = 'M' + v.outline.nodes.map((n) => n.p.map((c) => +c.toFixed(2)).join(' ')).join('L') + 'Z';
  return `<svg viewBox="${f1(x).replace(',', '.')} ${f1(y).replace(',', '.')} ${f1(w).replace(',', '.')} ${f1(h).replace(',', '.')}" role="img" aria-label="Kalıp çizgisi"><image href="${esc(v.img)}" x="${x}" y="${y}" width="${w}" height="${h}" preserveAspectRatio="none"/><path d="${d}" fill="none" stroke="#facc15" stroke-width="${+(Math.max(w, h) / 250).toFixed(2)}"/></svg>`;
}
// 3D kalıp (STL / OBJ) kutusu
const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '') + f1(Math.abs(v));
function last3dHtml(p) {
  const m = p.last.mesh;
  let h = `<div class="l3d"><b>3D kalıp dosyası (STL / OBJ)</b>`;
  if (!m) return h + `<p class="small">Kalıbın 3D taraması ya da çizimi varsa yükle: dört görünüş fotoğrafsız, tam ölçüsünde çıkar.</p>
    <div class="row"><label class="btn">3D kalıp yükle<input type="file" accept=".stl,.obj" data-l3file="1" hidden></label>${S.lbusy === '3d' ? '<span class="small">işleniyor…</span>' : ''}</div></div>`;
  const d = { length: m.bb[3] - m.bb[0], width: m.bb[4] - m.bb[1], height: m.bb[5] - m.bb[2] };
  const sc = L3.sizeCheck(d.length, p.size, p.sizeSystem, m.unit);
  h += `<canvas class="l3prev" data-l3prev="1" aria-label="3D kalıp önizlemesi (parmakla çevrilir)"></canvas>
    <p class="small">${esc(m.name || 'kalıp')} · ${m.m.toLocaleString('tr-TR')} üçgen${m.inTris > m.m ? ` (dosyada ${m.inTris.toLocaleString('tr-TR')}; sadeleştirildi)` : ''} · boy <b>${f1(d.length)}</b> × genişlik <b>${f1(d.width)}</b> × yükseklik <b>${f1(d.height)}</b> mm</p>
    ${m.open ? `<p class="small warn">⚠ Yüzeyde ${m.open.toLocaleString('tr-TR')} açık kenar var (model kapalı değil). Görünüşler yine çıkar.</p>` : ''}
    <p class="small${sc && sc.level !== 'ok' ? ' warn' : ''}" data-l3size="1">${sc ? `${sc.level === 'ok' ? '✓' : '⚠'} Numara ${esc(p.size)} (${esc(p.sizeSystem)}): beklenen kalıp boyu ≈ ${f1(sc.expected)} mm (${esc(sc.how)}); fark ${sgn(sc.diff)} mm — ${esc(sc.msg)}.` : 'Numara girilmemiş ya da okunamadı: boy denetimi yapılmadı.'}</p>
    <div class="grid"><label>Dosyanın birimi<select data-l3unit="1">${opts(Object.fromEntries(Object.entries(L3.UNIT_NAMES).map(([k, v]) => [k, v + ' (' + k + ')'])), m.unit)}</select></label></div>
    <div class="row"><button type="button" data-l3="toe">↔ Burun / topuk çevir</button><button type="button" data-l3="sole">↕ Taban / üst çevir</button><button type="button" data-l3="rot">⟳ 90° döndür</button><button type="button" data-l3="side">Dış / iç yanı değiştir</button>${S.lbusy === '3d' ? '<span class="small">işleniyor…</span>' : ''}</div>
    <div class="row"><label class="btn">Başka 3D kalıp<input type="file" accept=".stl,.obj" data-l3file="1" hidden></label><button type="button" class="danger" data-l3="rm">3D kalıbı kaldır</button></div>
    <p class="small">Önizleme önce dış yanı gösterir; parmakla çevirebilirsin. Yön (taban altta, konç topuk tarafında) yanlış bulunduysa düğmelerle düzelt: dört görünüş yeniden çıkar. İç / dış yan tahmindir (burun ucunun kaçıklığından): görünüşlere bakıp gerekirse değiştir.</p></div>`;
  return h;
}
const l3cache = { key: null, mesh: null };
function meshOf(st) {
  const key = st.bb.join(',') + '|' + st.idx.length + '|' + st.pos;   // nicemleme kutuya görelidir: ölçek değişince pos aynı kalabilir
  if (l3cache.key !== key) { l3cache.mesh = L3.decodeMesh(st); l3cache.key = key; }
  return l3cache.mesh;
}
// önizleme: parmakla çevrilir (yaw: z ekseni etrafında, pitch: yükseklik açısı)
const l3view = { yaw: 2.2, pitch: 0.35 };
function drawL3() {
  const cv = document.querySelector('canvas[data-l3prev]'); if (!cv) return;
  const T = lastTarget(cv.closest('.lastcard')?.dataset.lmode); if (!T?.last?.mesh) return;
  try {
    const m = meshOf(T.last.mesh), dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(200, Math.min(900, Math.round((cv.clientWidth || 320) * dpr))), H = Math.round(W * 0.5);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const { yaw, pitch } = l3view, c = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
    const f = [-c[0], -c[1], -c[2]], zf = f[2], u = [-zf * f[0], -zf * f[1], 1 - zf * f[2]];
    const r = L3.render(m, { f, u }, { fit: { w: W, h: H }, margin: 10, bg: [246, 245, 240] });
    cv.getContext('2d').putImageData(new ImageData(r.rgba, W, H), 0, 0);
  } catch (err) { /* önizleme çizilemezse sayfa çalışmaya devam eder */ }
}
let l3drag = null, l3raf = 0;
document.addEventListener('pointerdown', (e) => { const cv = e.target.closest?.('canvas[data-l3prev]'); if (!cv) return; l3drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture?.(e.pointerId); });
document.addEventListener('pointermove', (e) => {
  if (!l3drag) return;
  l3view.yaw -= (e.clientX - l3drag.x) * 0.012; l3view.pitch = Math.max(-1.45, Math.min(1.45, l3view.pitch + (e.clientY - l3drag.y) * 0.012));
  l3drag = { x: e.clientX, y: e.clientY };
  if (!l3raf) l3raf = requestAnimationFrame(() => { l3raf = 0; drawL3(); });
});
document.addEventListener('pointerup', () => { l3drag = null; });
document.addEventListener('pointercancel', () => { l3drag = null; });
// ağır iş arka planda (işçi açılamazsa sayfada)
let l3w = null, l3seq = 0; const l3wait = new Map();
function l3call(op, args, transfer = []) {   // girdi kopyalanır (aktarılmaz): işçi düşerse sayfada yeniden kullanılabilsin
  try {
    if (!l3w) {
      l3w = new Worker(new URL('./last3d-worker.js?v=20261119c', import.meta.url), { type: 'module' });
      l3w.onmessage = (e) => { const w = l3wait.get(e.data.id); if (!w) return; l3wait.delete(e.data.id); e.data.ok ? w.res(e.data.out) : w.rej(new Error(e.data.error)); };
      // işçi açılamazsa (eski tarayıcı) bekleyen işler sayfada yapılır
      l3w.onerror = (e) => { e.preventDefault?.(); l3w = 'yok'; for (const w of l3wait.values()) { try { w.res(l3run(w.op, w.args)); } catch (err) { w.rej(err); } } l3wait.clear(); };
    }
    if (l3w === 'yok') throw new Error('işçi yok');
    const id = ++l3seq;
    return new Promise((res, rej) => { l3wait.set(id, { res, rej, op, args }); l3w.postMessage({ id, op, args }, transfer); });
  } catch (err) { return new Promise((res) => setTimeout(res, 0)).then(() => l3run(op, args)); }
}
function putViews(last, views) {
  for (const [id, r] of Object.entries(views)) {
    last.views[id] = M.makeLastView({ img: rgbaToJpeg(r.rec.rgba, r.rec.w, r.rec.h, 0.85), k: r.rec.k, w: r.rec.w, h: r.rec.h, paper: last.paper, outline: r.outline, imgAt: r.imgAt, at: [0, 0], length: r.length, height: r.height, sens: 0, scale: 1, src: '3d' });
    fixScale(last, id);
  }
  M.placeLastViews(last);
}
function putMesh(last, enc, meta) { last.mesh = M.makeLast({ mesh: { ...enc, ...meta } }).mesh; if (!last.mesh) throw new Error('3D kalıp kaydedilemedi'); }
async function onLast3d(el, mode, act) {
  const T = lastTarget(mode); if (!T) return;
  const busy = async () => { S.lbusy = '3d'; render(); await new Promise((r) => setTimeout(r, 30)); };
  const done = () => { S.lbusy = null; renderSoon(); };
  try {
    if (act === 'file') {
      const file = el.files?.[0]; if (!file) return;
      if (!/\.(stl|obj)$/i.test(file.name || '')) return toast('Yalnız STL ya da OBJ dosyası yüklenebilir');
      if (file.size > 150 * 1024 * 1024) return toast('Dosya çok büyük (150 MB üstü)');
      await busy();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = await l3call('prepare', { name: file.name, bytes, expectedMm: L3.expectedLength(T.size, T.sizeSystem)?.mm });
      applyLast(mode, (q) => { putMesh(q.last, r.enc, { ...r.meta, name: String(file.name).slice(0, 80) }); putViews(q.last, r.views); });
      Object.assign(l3view, { yaw: r.meta.outer * 2.2, pitch: 0.35 });   // önizleme dış yandan
      done();
      return toast(`3D kalıp yüklendi: boy ${f1(r.dims.length)} mm${r.unitSure ? '' : ` · birim tahmini: ${L3.UNIT_NAMES[r.meta.unit]} (yanlışsa değiştir)`}`);
    }
    const st = T.last.mesh; if (!st) return;
    if (act === 'rm') return applyLast(mode, (q) => { q.last.mesh = null; toast('3D kalıp kaldırıldı (görünüşler duruyor)'); });
    const meta = { name: st.name, unit: st.unit, inTris: st.inTris, outer: st.outer, open: st.open }, enc = { n: st.n, m: st.m, bb: st.bb, pos: st.pos, idx: st.idx, i32: st.i32 };
    let args;
    if (act === 'unit') {
      const u = el.value; if (!L3.UNITS[u] || u === st.unit) return;
      args = { enc, outer: st.outer, act, factor: L3.UNITS[u] / L3.UNITS[st.unit] }; meta.unit = u;
    } else if (['toe', 'sole', 'rot', 'side'].includes(act)) args = { enc, outer: st.outer, act };
    else return;
    await busy();
    const r = await l3call('views', args);
    applyLast(mode, (q) => { putMesh(q.last, r.enc, { ...meta, outer: r.outer }); putViews(q.last, r.views); });
    if (act === 'side' || act === 'toe') Object.assign(l3view, { yaw: r.outer * 2.2, pitch: 0.35 });
    done();
    return toast(act === 'unit' ? `Birim ${L3.UNIT_NAMES[meta.unit]} yapıldı: boy ${f1(r.enc.bb[3] - r.enc.bb[0])} mm` : 'Görünüşler 3D kalıptan yeniden çıkarıldı');
  } catch (err) { done(); toast('3D kalıp işlenemedi: ' + err.message); }
}
function lastCard(p, mode) {
  const L = p.last, mr = p.modelRef;
  let h = `<div class="card lastcard" data-lmode="${mode}"><h3>Kalıp ve model resmi</h3>
  <p class="small">Kalıbın fotoğrafını eklersen kalıp çizgisi Stampa Atölyesi'nde gerçek ölçüsünde açılır. Model resmi çizerken ekranın köşesinde durur.</p>
  <div class="grid"><label>Kalıp adı / kodu<input data-lst="name" value="${esc(L.name)}" maxlength="80" placeholder="ör. K-41 sivri burun"></label>
  <label>Bilinen kalıp boyu (mm)<input data-lst="lengthMm" value="${nv(L.lengthMm)}" inputmode="decimal" placeholder="ör. 268"></label>
  <label>Fotoğraftaki kâğıt<select data-lst="paper">${opts(M.PAPER_SIZES, L.paper)}</select></label></div>${last3dHtml(p)}`;
  for (const [id, title] of Object.entries(M.LAST_VIEWS)) {
    const v = L.views[id];
    h += `<div class="lview" data-lview="${id}"><b>${title}</b>`;
    if (v) h += `<div class="lprev">${lastSvg(v)}</div><p class="small">Ölçülen: boy <b>${f1(v.length)} mm</b> · ${id === 'alt' ? 'genişlik' : 'yükseklik'} <b>${f1(v.height)} mm</b>${Math.abs(v.scale - 1) > 1e-6 ? ` · bilinen boya göre ×${fmt(v.scale, 3)} düzeltildi` : ''}</p>
      <div class="row">${v.src === '3d' ? '<span class="small">3D kalıptan çıkarıldı</span>' : `<label class="small">Ayırma hassasiyeti <input type="range" min="-5" max="5" step="1" value="${v.sens}" data-lsens="${id}"></label>`}<button type="button" class="danger" data-lrm="${id}">Kaldır</button></div>`;
    h += `<div class="row"><label class="btn">${v ? 'Yeni fotoğraf' : 'Fotoğraf çek / seç'}<input type="file" accept="image/*" data-lfile="${id}" hidden></label>${S.lbusy === id ? '<span class="small">işleniyor…</span>' : ''}</div></div>`;
  }
  h += `<details class="small"><summary>Kalıp fotoğrafı nasıl çekilir?</summary><ol>
    <li><b>Kesim matı ile (kâğıtsız):</b> "Fotoğraftaki kâğıt"tan <b>Kesim matı</b>'nı seç. Kalıbı kareli matın üstüne koy; ölçek matın 10 mm karelerinden bulunur. Dört fotoğraf çek: dış yan, iç yan, alt (taban), üst. Kalıp eğik dursa da düzeltilir.</li>
    <li>Kalıbı A4 kâğıdın üstüne koy (büyük numaralarda A3): yan görünüş için yan yatır, alt görünüş için tabanı kâğıda gelsin.</li>
    <li>Kâğıdı kâğıttan koyu bir masaya koy; kâğıdın <b>dört köşesi</b> fotoğrafta görünsün.</li>
    <li>Kalıp beyaz ya da açık renkliyse renkli (ör. mavi) kâğıt kullan.</li>
    <li>Telefonu tam tepeden tut; 60–80 cm yukarıdan çekip yakınlaştır. Yakından çekince kalıbın yüksekliği ölçüyü büyütür.</li>
    <li>Kalıbın gerçek boyunu biliyorsan "Bilinen kalıp boyu"na yaz: ölçü ona göre düzeltilir.</li></ol></details>
  ${mode === 'n' ? `<label class="wide">Model tipi — saya parçaları kalıptan otomatik çıkarılsın<select data-lst="type">${opts({ '': 'Seçmedim (parçaları kendim çizeceğim)', ...Object.fromEntries(Object.entries(AUTO.MODELS).map(([k, v]) => [k, v.name])) }, mr.auto.type)}</select></label>
  ${mr.photos.length ? `<div class="row"><button type="button" data-act="airead" data-mode="n"${S.aiBusy ? ' disabled' : ''}>${S.aiBusy ? 'Okunuyor…' : '🤖 Model resminden tipi ve çizgileri bul'}</button></div>` : ''}${aiNoteHtml()}
  <p class="small">${mr.auto.type ? (L.views.yan ? '✓ Proje oluşunca saya parçaları bu kalıbın ölçüsünde hazır gelir. Sonra "Saya Parçaları" sayfasından ayarlayıp yeniden oluşturabilirsin.' : '⚠ Otomatik parça için kalıbın <b>yan görünüşü</b> fotoğrafı gerekli.') : 'Model tipi seçersen ön saya, yan saya, dil gibi parçalar kalıptan kendiliğinden çizilir.'}</p>` : ''}
  <h3 style="margin-top:14px">Yapılacak modelin resmi</h3>
  <div class="mthumbs">${mr.photos.map((ph) => `<div class="mthumb"><img src="${esc(ph.img)}" alt="${esc(ph.name || 'Model resmi')}"><button type="button" data-mrm="${esc(ph.id)}" aria-label="Kaldır">×</button></div>`).join('')}</div>
  <div class="row">${mr.photos.length < M.MAX_MODEL_PHOTOS ? `<label class="btn">Model resmi ekle<input type="file" accept="image/*" multiple data-mfile="1" hidden></label>` : ''}<span class="small">${mr.photos.length}/${M.MAX_MODEL_PHOTOS} resim · önden, arkadan, üstten ve iki yandan 5–6 resim en iyi sonucu verir</span>${S.lbusy === 'model' ? '<span class="small">işleniyor…</span>' : ''}</div>
  <label class="wide">Model notu<textarea data-lst="note" maxlength="500" placeholder="ör. burun kapaklı derby, 5 delik">${esc(mr.note)}</textarea></label></div>`;
  return h;
}
// fotoğrafı küçültüp piksellerini al (çok büyük fotoğraflar işlem süresini uzatır)
async function loadImageData(file, max) {
  if (!/^image\//.test(file.type || 'image/')) throw new Error('resim dosyası değil');
  if (file.size > 40 * 1024 * 1024) throw new Error('dosya çok büyük (40 MB üstü)');
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s)), h = Math.max(1, Math.round(bmp.height * s));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(bmp, 0, 0, w, h); bmp.close?.();
  return { cv, rgba: c.getImageData(0, 0, w, h).data, w, h };
}
function rgbaToJpeg(rgba, w, h, q = 0.82) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0);
  return cv.toDataURL('image/jpeg', q);
}
async function imgToRgba(src, w, h) {
  const im = new Image(); im.src = src; await im.decode();
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(im, 0, 0, w, h);
  return c.getImageData(0, 0, w, h).data;
}
// bilinen kalıp boyuna göre ölçek (yan ve alt görünüşün boyu kalıp boyuna eşittir)
function fixScale(last, id) {
  const v = last.views[id]; if (!v) return;
  const raw = v.length / v.scale, want = last.lengthMm ? last.lengthMm / raw : 1;
  last.views[id] = M.makeLastView(LST.scaleView(v, want / v.scale));
}
function viewFrom(r, sens, paper, at = [0, 0]) {
  return M.makeLastView({ img: rgbaToJpeg(r.rec.rgba, r.rec.w, r.rec.h), k: r.rec.k, w: r.rec.w, h: r.rec.h, paper, outline: r.outline, imgAt: r.imgAt, at, length: r.length, height: r.height, sens, scale: 1 });
}
function lastTarget(mode) { return mode === 'p' ? S.p : S.newDraft; }
// Sayfa bir sonraki adımda yeniden çizilir: odaktaki kutu kaldırılırken tetiklenen ikinci "change" iç içe çizim yapmasın.
let lastRT = 0;
const renderSoon = () => { clearTimeout(lastRT); lastRT = setTimeout(render, 0); };
function applyLast(mode, fn) { if (mode === 'p') edit(fn, { rerender: false }); else fn(S.newDraft); renderSoon(); }
async function onLastChange(el, mode) {
  const d = el.dataset, T = lastTarget(mode); if (!T) return;
  if (d.lst) {
    const k = d.lst;
    if (k === 'lengthMm') {
      const v = pn(el.value);
      if (v !== null && !(v >= 50 && v <= 500)) { el.classList.add('bad'); return toast('Kalıp boyu 50–500 mm arasında olmalı'); }
      return applyLast(mode, (q) => { q.last.lengthMm = v; for (const id of Object.keys(M.LAST_VIEWS)) fixScale(q.last, id); toast(v ? 'Kalıp ölçüsü bilinen boya göre düzeltildi' : 'Ölçek düzeltmesi kaldırıldı'); });
    }
    if (k === 'note') return applyLast(mode, (q) => { q.modelRef.note = el.value.slice(0, 500); });
    if (k === 'type') return applyLast(mode, (q) => { q.modelRef.auto = M.makeAuto({ ...q.modelRef.auto, type: el.value, params: {} }); });
    if (k === 'paper') return applyLast(mode, (q) => { q.last.paper = M.PAPER_SIZES[el.value] ? el.value : 'A4'; });
    return applyLast(mode, (q) => { q.last.name = el.value.trim().slice(0, 80); });
  }
  if (d.lfile) {
    const file = el.files?.[0]; if (!file) return;
    const id = d.lfile; S.lbusy = id; renderSoon();
    try {
      const { rgba, w, h } = await loadImageData(file, 1600);
      const r = T.last.paper === 'MAT' ? LST.analyzeMat(rgba, w, h) : LST.analyzeLast(rgba, w, h, { paper: T.last.paper });
      if (!r.ok) { S.lbusy = null; renderSoon(); return toast(r.error); }
      const view = viewFrom(r, 0, T.last.paper);
      S.lbusy = null;
      applyLast(mode, (q) => { q.last.views[id] = view; fixScale(q.last, id); M.placeLastViews(q.last); });
      toast(r.warnings[0] || `Kalıp çizgisi çıkarıldı: ${f1(lastTarget(mode).last.views[id].length)} mm`);
    } catch (err) { S.lbusy = null; renderSoon(); toast('Fotoğraf işlenemedi: ' + err.message); }
    return;
  }
  if (d.lsens !== undefined) {
    const id = d.lsens, v = T.last.views[id]; if (!v) return;
    const sens = Math.max(-5, Math.min(5, Math.round(+el.value || 0)));
    try {
      const k0 = v.k * v.scale, rgba = await imgToRgba(v.img, v.w, v.h);
      const r = LST.analyzeRectified({ rgba, w: v.w, h: v.h, k: k0, ...(v.paper === 'MAT' ? LST.matOptions(rgba, v.w, v.h, sens) : {}) }, v.paper === 'MAT' ? 0 : sens);
      if (!r.ok) { renderSoon(); return toast(r.error); }
      const nv2 = M.makeLastView({ ...viewFrom(r, sens, v.paper, v.at), img: v.img });
      applyLast(mode, (q) => { q.last.views[id] = nv2; fixScale(q.last, id); });
      toast(`Kalıp çizgisi yeniden çıkarıldı: ${f1(lastTarget(mode).last.views[id].length)} mm`);
    } catch (err) { toast('Yeniden işlenemedi: ' + err.message); }
    return;
  }
  if (d.mfile) {
    const room = M.MAX_MODEL_PHOTOS - T.modelRef.photos.length;
    const files = [...(el.files || [])].slice(0, Math.max(0, room)); if (!files.length) return toast('En çok ' + M.MAX_MODEL_PHOTOS + ' model resmi eklenebilir');
    S.lbusy = 'model'; renderSoon();
    const add = [];
    for (const f of files) {
      try { const { cv } = await loadImageData(f, 1280); add.push({ id: G.uid('ph'), img: cv.toDataURL('image/jpeg', 0.8), name: String(f.name || '').slice(0, 80) }); }
      catch (err) { toast('Eklenemedi: ' + (f.name || '') + ' — ' + err.message); }
    }
    S.lbusy = null;
    if (!add.length) return renderSoon();
    applyLast(mode, (q) => { q.modelRef = M.makeModelRef({ ...q.modelRef, photos: [...q.modelRef.photos, ...add] }); });
    toast(add.length + ' model resmi eklendi');
  }
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
  modelPeek(host);
  if (S.pendingNewPiece) { S.pendingNewPiece = false; host.querySelector('[data-a="newpiece"]').click(); }
}

// Stampada model resmi: köşede küçük düğme; dokununca resim açılır, birden çoksa ileri / geri
function modelPeek(host) {
  const ph = S.p?.modelRef?.photos || []; if (!ph.length) return;
  host.style.position = 'relative';
  const box = document.createElement('div'); box.className = 'ayk-model';
  box.innerHTML = `<button type="button" class="am-t">🖼 Model</button><div class="am-b" hidden><img alt="Model resmi"><div class="am-r">${ph.length > 1 ? '<button type="button" data-am="-1" aria-label="Önceki">‹</button><span></span><button type="button" data-am="1" aria-label="Sonraki">›</button>' : '<span></span>'}<button type="button" data-am="x">Kapat</button></div></div>`;
  let i = 0;
  const b = box.querySelector('.am-b'), img = box.querySelector('img'), lab = box.querySelector('.am-r span');
  const show = () => { img.src = ph[i].img; lab.textContent = ph.length > 1 ? `${i + 1}/${ph.length}` : ''; };
  box.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.classList.contains('am-t')) { b.hidden = !b.hidden; show(); return; }
    if (t.dataset.am === 'x') { b.hidden = true; return; }
    i = (i + +t.dataset.am + ph.length) % ph.length; show();
  });
  host.appendChild(box);
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
  h += autoCard(p);
  if (!p.pieces.length) return h + `<div class="empty"><b>Parça yok</b>Stampa Atölyesi'nde "+ Parça" ile sınır çiz ya da kapalı bir yardımcı çizgiyi parçaya dönüştür.</div></div>`;
  h += '<div class="chips">' + p.pieces.map((pc) => `<button type="button" data-psel="${esc(pc.id)}" class="${pc.id === S.pieceSel ? 'on' : ''}">#${pc.no} ${esc(pc.name)}</button>`).join('') + '</div>';
  const pc = p.pieces.find((q) => q.id === S.pieceSel);
  if (pc) h += pieceDetail(pc);
  h += matchCard();
  return h + '</div>';
}
/* ---------- modelden bütün parçalar (yapay zekâ) ---------- */
async function aiParts() {
  const T = S.p; if (!T || S.aiBusy) return;
  if (!T.last.views.yan) return toast('Önce kalıbın dış yan fotoğrafını ekle (Proje Dosyaları)');
  if (!T.modelRef.photos.length) return toast('Önce model resimlerini ekle (Proje Dosyaları)');
  S.aiBusy = true; renderSoon();
  try {
    const a = T.modelRef.ai, or = a && a.flipX !== null ? { flipX: a.flipX, flipY: a.flipY } : AUTO.guessOrientation(T.last.views.yan);
    const res = await AI.readModelParts(T.modelRef.photos.map((ph) => ph.img), AIP.lastInfo(T.last.views.yan, or));
    S.aiBusy = false;
    let n = 0;
    try {
      edit((q) => { q.modelRef.ai = M.makeAiParts({ ...res, flipX: or.flipX, flipY: or.flipY, lining: a ? a.lining : true, stiff: a ? a.stiff : true }); n = runAiParts(q).pieces.length; });
      toast(`${n} parça modelden çıkarıldı. Kontrol et, gerekirse çizgileri Stampa Atölyesi'nde düzelt.`);
    } catch (err) { undoLast(); renderSoon(); toast('Parçalar oluşturulamadı: ' + err.message); }
  } catch (err) { S.aiBusy = false; renderSoon(); toast('Parçalar çıkarılamadı: ' + err.message); }
}
// Önceki otomatik (şablon ya da yapay zekâ) parçaların yerine yenilerini koyar. Hata fırlatabilir.
function runAiParts(q) {
  const a = q.modelRef.ai;
  const r = AIP.generateAi({ last: q.last, pieces: q.pieces }, a, { material: q.material, flipX: a.flipX ?? undefined, flipY: a.flipY ?? undefined });
  const old = new Set([...a.pieceIds, ...q.modelRef.auto.pieceIds]);
  q.pieces = q.pieces.filter((pc) => !old.has(pc.id));
  q.matches = q.matches.filter((mt) => !old.has(mt.a?.piece) && !old.has(mt.b?.piece));
  let no = M.nextPieceNo(q);
  const mat = S.lib.find((m) => m.id === q.material);
  for (const pc of r.pieces) { pc.no = no++; M.refreshAutoAllowances(pc, mat, q.method); }
  q.pieces.push(...r.pieces);
  q.modelRef.auto = M.makeAuto({ ...q.modelRef.auto, pieceIds: [] });
  q.modelRef.ai = M.makeAiParts({ ...a, flipX: r.frame.flipX, flipY: r.frame.flipY, pieceIds: r.pieces.map((pc) => pc.id) });
  return r;
}
function aiCard(p) {
  const a = p.modelRef.ai, ok = p.last?.views?.yan && p.modelRef.photos.length;
  let h = `<div class="card autocard"><h3>🤖 Modelden bütün saya parçaları</h3>
  <p class="small">Kalıbın fotoğrafları ve modelin farklı açılardan 5–6 resmi yeterli: yapay zekâ modelin kendi çizgilerinden bütün parçaları çıkarır, kalıbın ölçüsüne oturtur; paylar, dikiş çizgileri, bağcık delikleri, astar, kontrfort ve burun sertliği kendiliğinden eklenir. İç yan fotoğrafı varsa yan parçaların iç yan eşi de çıkar. Sonuç bir başlangıçtır: çizgileri Stampa Atölyesi'nde parmakla düzeltebilirsin.</p>`;
  if (!ok) return h + `<p class="small warn">⚠ Gerekenler: ${p.last?.views?.yan ? '' : 'kalıbın dış yan fotoğrafı, '}${p.modelRef.photos.length ? '' : 'model resimleri, '}"Proje Dosyaları → Kalıp ve model resmi"nden ekle.</p></div>`;
  h += `<div class="row"><button type="button" class="primary" data-act="aiparts"${S.aiBusy ? ' disabled' : ''}>${S.aiBusy ? 'Parçalar çıkarılıyor… (1 dakika sürebilir)' : a ? '🤖 Resimlerden yeniden çıkar' : '🤖 Bütün parçaları modelden çıkar'}</button></div>`;
  if (a) {
    h += `<p class="small"><b>${a.pieces.length} parça okundu</b>${a.model ? ' — ' + esc(a.model) : ''} · güven: ${({ high: 'yüksek', medium: 'orta', low: 'düşük' })[a.confidence]}</p>
    <div class="row"><label class="row" style="font-size:13px"><input type="checkbox" data-aiopt="lining"${a.lining ? ' checked' : ''}> Astar ekle</label><label class="row" style="font-size:13px"><input type="checkbox" data-aiopt="stiff"${a.stiff ? ' checked' : ''}> Kontrfort ve burun sertliği ekle</label></div>
    <div class="row"><button type="button" data-act="airun">Parçaları yeniden oluştur (resim okumadan)</button><button type="button" data-act="aiflip">↔ Burun yönünü çevir</button><button type="button" data-act="aiflipy">↕ Tabanı çevir</button></div>
    <p class="small">Kalıba çekme payı (mor) tabanda, ön saya burunda olmalı; değilse yönü çevir.</p>`;
  }
  return h + '</div>';
}
/* ---------- kalıptan otomatik parçalar ---------- */
function aiNoteHtml() {
  const n = S.aiNote; if (!n || n.pid !== (S.p?.id || 'yeni')) return '';
  return `<div class="ainote"><b>Resimden okunan:</b> ${esc(n.summary)}${n.warnings.map((w) => `<br><span class="warn">⚠ ${esc(w)}</span>`).join('')}</div>`;
}
async function aiRead(mode) {
  const T = mode === 'p' ? S.p : S.newDraft; if (!T || S.aiBusy) return;
  const ph = T.modelRef.photos[0]; if (!ph) return toast('Önce model resmi ekle');
  S.aiBusy = true; renderSoon();
  try {
    const res = await AI.readModelPhoto(ph.img);
    const L = T.last.views.yan?.length || 260;
    const out = AI.toAuto(res, L);
    S.aiNote = { pid: mode === 'p' ? S.p.id : 'yeni', summary: out.summary, warnings: out.warnings };
    S.aiBusy = false;
    if (!out.type) { renderSoon(); return toast('Model tanınmadı: ' + out.summary); }
    if (mode === 'p') {
      try {
        edit((q) => { q.modelRef.auto = M.makeAuto({ ...q.modelRef.auto, type: out.type, flipX: q.modelRef.auto.flipX, flipY: q.modelRef.auto.flipY, params: out.params }); if (q.last.views.yan) runAuto(q); });
        toast(T.last.views.yan ? 'Resimden okundu, parçalar oluşturuldu: ' + AUTO.MODELS[out.type].name : 'Resimden okundu: ' + AUTO.MODELS[out.type].name);
      } catch (err) { undoLast(); renderSoon(); toast('Parçalar çıkarılamadı: ' + err.message); }
    } else {
      applyLast('n', (q) => { q.modelRef.auto = M.makeAuto({ ...q.modelRef.auto, type: out.type, params: out.params }); });
      toast('Resimden okundu: ' + AUTO.MODELS[out.type].name);
    }
  } catch (err) { S.aiBusy = false; renderSoon(); toast('Resim okunamadı: ' + err.message); }
}
// Projeye ekler (önceki otomatik parçaların yerine). Hata fırlatabilir.
function runAuto(q) {
  const a = q.modelRef.auto;
  const r = AUTO.generate({ last: q.last, pieces: [] }, { type: a.type, flipX: a.flipX ?? undefined, flipY: a.flipY ?? undefined, params: a.params, material: q.material });
  const old = new Set([...a.pieceIds, ...(q.modelRef.ai?.pieceIds || [])]);
  if (q.modelRef.ai) q.modelRef.ai.pieceIds = [];
  q.pieces = q.pieces.filter((pc) => !old.has(pc.id));
  q.matches = q.matches.filter((mt) => !old.has(mt.a?.piece) && !old.has(mt.b?.piece));
  let no = M.nextPieceNo(q);
  const mat = S.lib.find((m) => m.id === q.material);
  for (const pc of r.pieces) { pc.no = no++; M.refreshAutoAllowances(pc, mat, q.method); }
  q.pieces.push(...r.pieces); q.matches.push(...r.matches);
  q.modelRef.auto = M.makeAuto({ type: r.type, flipX: r.frame.flipX, flipY: r.frame.flipY, params: r.params, pieceIds: r.pieces.map((pc) => pc.id) });
  return r;
}
function autoPreview(p) {
  const a = p.modelRef.auto, v = p.last.views.yan;
  let r;
  try { r = AUTO.generate({ last: p.last, pieces: [] }, { type: a.type, flipX: a.flipX ?? undefined, flipY: a.flipY ?? undefined, params: a.params }); } catch (err) { return { html: `<p class="small warn">⚠ ${esc(err.message)}</p>` }; }
  const pts = v.outline.nodes.map((n) => [n.p[0] + v.at[0], n.p[1] + v.at[1]]);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const pad = 30, P = (q) => q.map((c) => +c.toFixed(1)).join(' ');
  const cols = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f97316'];
  let svg = `<svg viewBox="${x0 - pad} ${y0 - pad} ${x1 - x0 + 2 * pad} ${y1 - y0 + 2 * pad}" role="img" aria-label="Otomatik parça önizlemesi"><path d="M${pts.map(P).join('L')}Z" fill="#e5e7eb" stroke="#9ca3af" stroke-width="0.8"/>`;
  r.pieces.forEach((pc, i) => {
    const net = netPolygon(pc); let cx = 0, cy = 0; for (const [x, y] of net) { cx += x; cy += y; } cx /= net.length; cy /= net.length;
    svg += `<path d="M${net.map(P).join('L')}Z" fill="${cols[i % cols.length]}" fill-opacity="0.18" stroke="${cols[i % cols.length]}" stroke-width="1"/>`;
    svg += `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="7" text-anchor="middle" fill="#111827">${esc(pc.name)}</text>`;
    for (const m of pc.marks) if (m.kind === 'delik' && m.p) svg += `<circle cx="${m.p[0]}" cy="${m.p[1]}" r="${(m.d || 4) / 2}" fill="none" stroke="#111827" stroke-width="0.5"/>`;
  });
  return { html: svg + '</svg>', r };
}
function autoCard(p) {
  return aiCard(p) + tplCard(p);
}
function tplCard(p) {
  if (!p.last?.views?.yan) return `<div class="card autocard"><h3>Hazır şablonla parçalar (Derby, Oxford, Loafer, Spor, Bot, Makosen, Sandalet, Topuklu)</h3><p class="small">Kalıbın yan görünüşü fotoğrafını "Proje Dosyaları → Kalıp ve model resmi"nden eklersen ön saya, yan saya, dil gibi parçalar kalıp ölçüsünde kendiliğinden çıkarılır.</p><div class="row"><button type="button" data-go="dosyalar">Kalıp fotoğrafı ekle</button></div></div>`;
  const a = p.modelRef.auto;
  let h = `<div class="card autocard"><h3>Hazır şablonla parçalar (Derby, Oxford, Loafer, Spor, Bot, Makosen, Sandalet, Topuklu)</h3><div class="grid"><label>Model tipi<select data-au="type">${opts({ '': 'Seç…', ...Object.fromEntries(Object.entries(AUTO.MODELS).map(([k, v]) => [k, v.name])) }, a.type)}</select></label></div>`;
  if (p.modelRef.photos.length) h += `<div class="row"><button type="button" data-act="airead" data-mode="p"${S.aiBusy ? ' disabled' : ''}>${S.aiBusy ? 'Okunuyor…' : '🤖 Model resminden oku ve parçaları oluştur'}</button></div>${aiNoteHtml()}`;
  else h += `<p class="small">Model resmi eklersen (Proje Dosyaları) yapay zekâ model tipini ve çizgi konumlarını resimden tahmin edebilir.</p>`;
  if (!a.type) return h + `<p class="small">Bir model tipi seç: parçalar kalıbın yan çizgisine göre çizilir.</p></div>`;
  const pv = autoPreview(p), m = AUTO.MODELS[a.type], L = p.last.views.yan.length;
  const P = AUTO.cleanParams(a.type, a.params, L);
  h += `<div class="aprev">${pv.html}</div><div class="row"><button type="button" data-act="auflipx">↔ Burun yönünü çevir</button><button type="button" data-act="auflipy">↕ Tabanı çevir</button></div>
  <p class="small">Önizlemede ön saya burun tarafında, yan saya topuk tarafında olmalı; değilse yönü çevir.</p><div class="grid">`;
  for (const [k, d] of Object.entries(AUTO.PARAMS)) {
    if (!AUTO.paramShown(a.type, k)) continue;
    if (k === 'capAt' && !P.cap) continue;
    if (d.unit === 'bool') h += `<label class="row" style="font-size:13px"><input type="checkbox" data-aup="${k}"${P[k] ? ' checked' : ''}> ${esc(d.name)}</label>`;
    else h += `<label>${esc(d.name)} (${d.unit === '%' ? '% kalıp boyu' : d.unit})<input data-aup="${k}" value="${nv(P[k])}" inputmode="decimal"></label>`;
  }
  h += `</div><div class="row"><button type="button" class="ok" data-act="aurun">${a.pieceIds.length ? 'Parçaları yeniden oluştur' : 'Parçaları oluştur'}</button><button type="button" data-act="aureset">Varsayılan ayarlar</button></div>
  <p class="small">${a.pieceIds.length ? 'Yeniden oluşturunca bu kartla çıkarılan önceki parçalar silinir; elle eklediğin parçalar kalır. İstemezsen ↶ ile geri al.' : 'Parçalar yarım kalıptır: "Orta çizgi" kenarı simetri eksenidir. Paylar malzemeye göre otomatik verilir.'} Bu çizgiler başlangıç noktasıdır; usta kontrolü gerekir.</p></div>`;
  return h;
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
  ${lastCard(p, 'p')}
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

/* ---------- Numara serisi ve kesim yerleşimi ---------- */
function nkState() {
  const p = S.p, o = S.nk, base = pn(p.size);
  const sys = GR.SYSTEMS[o.system || p.sizeSystem] ? (o.system || p.sizeSystem) : 'EU';
  if (o.from === null && Number.isFinite(base)) { o.from = base - 2; o.to = base + 2; }
  return { o, base, sys, S0: GR.SYSTEMS[sys] };
}
function nkSizes() { const { o } = nkState(); return Number.isFinite(o.from) && Number.isFinite(o.to) ? GR.sizeList(o.from, o.to, o.step || 1) : []; }
const nkOpt = () => { const { o, sys } = nkState(); return { system: sys, ...(o.dL > 0 ? { dL: o.dL } : {}), ...(o.dG > 0 ? { dG: o.dG } : {}) }; };
function parseDefects(txt) { const out = []; for (const ln of String(txt || '').split(/\n|;/)) { const n = ln.trim().split(/[\s,]+/).map((v) => pn(v)); if (n.length >= 3 && n.slice(0, 3).every((v) => Number.isFinite(v) && v >= 0)) out.push({ x: n[0], y: n[1], r: n[2] }); } return out; }
function pageGrade() {
  const p = S.p, { o, base, sys, S0 } = nkState(), closed = p.pieces.filter((q) => q.outline.closed);
  let h = `<div class="page"><h2>Numara ve Kesim</h2>`;
  if (!closed.length) return h + `<div class="empty"><b>Kapalı parça yok</b>Önce Saya Parçaları ya da Stampa'da parçaları çiz.</div></div>`;
  if (!Number.isFinite(base)) return h + `<div class="card"><p>Taban numara sayı olmalı (şu an "${esc(p.size)}"). Proje bilgilerinden numarayı düzelt (ör. 40).</p></div></div>`;
  const sizes = nkSizes();
  h += `<div class="card"><h3>Numara serisi</h3><div class="grid">
    <label>Numara sistemi<select data-nk="system">${opts(Object.fromEntries(Object.entries(GR.SYSTEMS).map(([k, v]) => [k, v.name])), sys)}</select></label>
    <label>Taban numara<input value="${esc(p.size)}" disabled></label>
    <label>En küçük<input data-nk="from" value="${nv(o.from)}" inputmode="decimal"></label>
    <label>En büyük<input data-nk="to" value="${nv(o.to)}" inputmode="decimal"></label>
    <label>Adım<select data-nk="step">${opts({ 1: '1 numara', 0.5: 'Yarım numara' }, String(o.step || 1))}</select></label>
    <label>Boy artışı / numara (mm)<input data-nk="dL" value="${nv(o.dL || S0.dL)}" inputmode="decimal"></label>
    <label>Çevre artışı / numara (mm)<input data-nk="dG" value="${nv(o.dG || S0.dG)}" inputmode="decimal"></label>
  </div>`;
  try {
    const tbl = GR.sizeTable(p, sizes, nkOpt()), show = closed.slice(0, 5);
    h += `<div style="overflow-x:auto"><table class="tbl"><thead><tr><th>No</th><th>Boy ×</th><th>Yükseklik ×</th>${show.map((q) => `<th>#${q.no} ${esc(q.name)}<br><span class="small">boy × en mm</span></th>`).join('')}</tr></thead><tbody>${tbl.map((r) => `<tr${r.size === base ? ' style="font-weight:700"' : ''}><td>${nv(r.size)}</td><td>${(r.f.sx * 100).toFixed(1)}%</td><td>${(r.f.sy * 100).toFixed(1)}%</td>${show.map((q) => { const d = r.dims.find((x) => x.id === q.id); return `<td>${d ? f1(d.w) + ' × ' + f1(d.h) : '–'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
  } catch (e) { h += `<p class="m">⚠ ${esc(e.message)}</p>`; }
  h += `<p class="small">Orantılı seri: boy kalıp boyu yönünde numara başına ${nv(o.dL || S0.dL)} mm, yükseklik çevre artışıyla (${nv(o.dG || S0.dG)} mm) büyür. Paylar, dikiş aralığı ve delik çapları mm olarak aynı kalır. Firmanın kalıp serisi farklıysa artışları değiştir; gerçek kalıp serisiyle kontrol et.</p></div>`;
  // kesim
  h += `<div class="card"><h3>Kesim yerleşimi (deri / plaka)</h3><div class="grid">
    ${sizes.map((s) => `<label>No ${nv(s)} · çift<input data-nkp="${s}" value="${nv(o.pairs[s] ?? 1)}" inputmode="numeric"></label>`).join('')}
    <label>Deri / plaka boyu (mm)<input data-nk="w" value="${nv(o.w)}" inputmode="decimal"></label>
    <label>Deri / plaka eni (mm)<input data-nk="h" value="${nv(o.h)}" inputmode="decimal"></label>
    <label>Bıçak / kesim payı (mm)<input data-nk="gap" value="${nv(o.gap)}" inputmode="decimal"></label>
    <label class="row" style="color:var(--text)"><input type="checkbox" data-nk="free"${o.free ? ' checked' : ''}> 90° döndürmeye izin ver (deri yönü önemsizse)</label>
  </div>
  <label class="wide">Kusurlu bölgeler (her satır: x y yarıçap, mm; sol üst köşeden)<textarea data-nk="defects" rows="3" placeholder="300 250 40">${esc(o.defects)}</textarea></label>
  <div class="row"><button type="button" class="ok" data-act="nkrun">Yerleştir</button></div>
  <p class="small">Parçalar kesim çizgisiyle (paylar dahil) yerleşir. Varsayılan: parça boyu deri boyuna (sırt çizgisine) paralel, yalnız 0° / 180°. Çift parçaların yarısı sol ayak için ayna kesilir; orta çizgili yarım parçalar açılarak tam kesilir. Yerleşim iyi bir başlangıçtır, en iyi (optimum) değildir.</p>`;
  const r = o.out;
  if (r) {
    if (r.error) h += `<p class="m">⚠ ${esc(r.error)}</p>`;
    else {
      h += `<p class="m"><b>${r.L.placed.length}</b> parça yerleşti${r.L.unplaced.length ? `, <b style="color:#f87171">${r.L.unplaced.length} parça sığmadı</b>` : ''} · kullanılan boy ${f1(r.L.used)} mm · kullanım %${(r.L.util * 100).toFixed(1)}${r.bad.length ? ' · <b style="color:#f87171">doğrulama hatası: ' + r.bad.length + '</b>' : ' · çakışma yok'}</p>`;
      for (const w of r.warn) h += `<p class="small" style="color:#fbbf24">⚠ ${esc(w)}</p>`;
      if (r.L.unplaced.length) h += `<p class="small">Sığmayanlar: ${esc([...new Set(r.L.unplaced.map((u) => '#' + u.no + ' ' + u.name + ' No ' + u.size))].join(', '))}. Daha büyük deri gir ya da çift sayısını azalt.</p>`;
      h += `<div class="nestprev" style="background:#fff;border-radius:8px;overflow:auto">${NE.nestSVG(r.L).replace(/width="[\d.]+mm" height="[\d.]+mm"/, 'width="100%"')}</div>
      <div class="row"><button type="button" data-act="nkdxf">DXF indir (kesim)</button><button type="button" data-act="nksvg">SVG indir</button></div>
      <p class="small">DXF: KESIM katmanında kesim çizgileri, YAZI'da parça no · numara (S = sol ayak / ayna), PLAKA ve KUSUR katmanları; birim mm.</p>`;
    }
  }
  return h + '</div></div>';
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
  h += `<div class="card"><h3>Gelecek aşamalar</h3><p class="small">Aşağıdakiler <b>henüz yoktur</b> (belirtilen kısımlar hariç); proje dosyasında yalnız yerleri ayrılmıştır (ayrıntı: docs/AYAKKABI.md).</p><ul class="future">
    <li><b>Aşama 2</b> — 3D kalıp dosyası yükleme, görüntüleme ve ölçüm</li><li><b>Aşama 3</b> — telefon kamerasıyla 3D kalıp tarama. <i>Şu an var olan:</i> kalıbın kâğıt üstünde çekilmiş fotoğrafından ölçülü yan ve alt çizgisi (Proje → Kalıp ve model resmi)</li><li><b>Aşama 4</b> — fotoğraftan yapay zekâ destekli saya parçası tanıma</li>
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
  if (d.l3) return onLast3d(t, t.closest('.lastcard')?.dataset.lmode, d.l3);
  if (d.lrm || d.mrm) {
    const mode = t.closest('.lastcard')?.dataset.lmode;
    if (d.lrm) return applyLast(mode, (q) => { q.last.views[d.lrm] = null; toast(M.LAST_VIEWS[d.lrm] + ' kaldırıldı'); });
    return applyLast(mode, (q) => { q.modelRef.photos = q.modelRef.photos.filter((ph) => ph.id !== d.mrm); toast('Model resmi kaldırıldı'); });
  }
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
    let msg = 'Proje oluşturuldu';
    if (np.modelRef.auto.type) {
      if (!np.last.views.yan) msg = 'Proje oluşturuldu. Kalıp yan fotoğrafı olmadığı için parçalar çıkarılmadı.';
      else try { const r = runAuto(np); msg = `Proje oluşturuldu: ${r.pieces.length} saya parçası kalıptan çıkarıldı (${AUTO.MODELS[r.type].name})`; } catch (err) { msg = 'Proje oluşturuldu, parçalar çıkarılamadı: ' + err.message; }
    }
    syncMaterials(np); await store.commit(np, 'Proje oluşturuldu');
    S.newDraft = null; S.newSample = false; toast(msg);
    return openProject(np.id, 'stampa');
  }
  if (a === 'newpiece') { S.pendingNewPiece = true; return go('stampa'); }
  if (a === 'auflipx' || a === 'auflipy') return edit((q) => {
    const au = q.modelRef.auto, g = (au.flipX === null || au.flipY === null) ? AUTO.guessOrientation(q.last.views.yan) : null;
    if (g) { au.flipX = g.flipX; au.flipY = g.flipY; }
    if (a === 'auflipx') au.flipX = !au.flipX; else au.flipY = !au.flipY;
  });
  if (a === 'aureset') return edit((q) => { q.modelRef.auto.params = {}; });
  if (a === 'airead') return aiRead(t.dataset.mode === 'p' ? 'p' : 'n');
  if (a === 'aiparts') return aiParts();
  if (a === 'airun' || a === 'aiflip' || a === 'aiflipy') {
    try {
      let n = 0;
      edit((q) => { if (a !== 'airun') { const ai = q.modelRef.ai, g = AUTO.guessOrientation(q.last.views.yan); ai.flipX = ai.flipX ?? g.flipX; ai.flipY = ai.flipY ?? g.flipY; if (a === 'aiflip') ai.flipX = !ai.flipX; else ai.flipY = !ai.flipY; } n = runAiParts(q).pieces.length; });
      return toast(`${n} parça yeniden oluşturuldu`);
    } catch (err) { undoLast(); return toast('Parçalar oluşturulamadı: ' + err.message); }
  }
  if (a === 'aurun') {
    try {
      let n = 0;
      edit((q) => { const r = runAuto(q); n = r.pieces.length; S.pieceSel = r.pieces[0]?.id || S.pieceSel; });
      return toast(`${n} saya parçası kalıptan çıkarıldı`);
    } catch (err) { undoLast(); return toast('Parçalar çıkarılamadı: ' + err.message); }
  }
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
  if (a === 'nkrun') {
    const o = S.nk;
    try {
      const sizes = nkSizes().filter((sz) => (o.pairs[sz] ?? 1) > 0);
      if (!sizes.length) throw new Error('En az bir numarada çift sayısı 1 ya da üstü olmalı');
      const lists = sizes.map((sz) => NE.instances([GR.gradeProject(p, sz, nkOpt())], o.pairs[sz] ?? 1));
      const list = lists.flatMap((x) => x.list), warn = [...new Set(lists.flatMap((x) => x.warn))];
      if (list.length > 400) throw new Error(list.length + ' parça: tek seferde en çok 400 parça yerleştirilir; çift sayısını azalt');
      toast('Yerleştiriliyor…'); await new Promise((r) => setTimeout(r, 30));
      const L = NE.nest(list, { w: o.w, h: o.h, defects: parseDefects(o.defects) }, { res: 2, gap: o.gap, free: o.free });
      o.out = { L, warn, bad: NE.verify(L) };
    } catch (err) { o.out = { error: err.message }; }
    return render();
  }
  if (a === 'nkdxf' || a === 'nksvg') {
    const L = S.nk.out?.L; if (!L) return;
    const base = `${p.name}${p.code ? '-' + p.code : ''}-kesim`;
    if (a === 'nkdxf') saveBlob(new Blob([NE.nestDXF(L)], { type: 'application/dxf' }), base + '.dxf');
    else saveBlob(new Blob([NE.nestSVG(L)], { type: 'image/svg+xml' }), base + '.svg');
    return toast(a === 'nkdxf' ? 'Kesim DXF hazır (mm)' : 'Kesim SVG hazır (mm, 1:1)');
  }
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
  if (d.l3file || d.l3unit) return onLast3d(el, el.closest('.lastcard')?.dataset.lmode, d.l3file ? 'file' : 'unit');
  if (d.lst || d.lfile || d.lsens !== undefined || d.mfile) return onLastChange(el, el.closest('.lastcard')?.dataset.lmode);
  if (d.aiopt) return edit((q) => { q.modelRef.ai[d.aiopt] = el.checked; try { runAiParts(q); } catch (err) { toast(err.message); } });
  if (d.au) return edit((q) => { q.modelRef.auto = M.makeAuto({ ...q.modelRef.auto, type: el.value, params: {} }); });
  if (d.aup) {
    const def = AUTO.PARAMS[d.aup]; if (!def) return;
    if (def.unit === 'bool') return edit((q) => { q.modelRef.auto.params[d.aup] = el.checked; });
    const v = pn(el.value);
    if (v === null || v < def.min || v > def.max) { el.classList.add('bad'); return toast(`${def.name}: ${def.min}–${def.max} arası olmalı`); }
    return edit((q) => { q.modelRef.auto.params[d.aup] = v; });
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
  if (d.nk !== undefined) {
    const o = S.nk, k = d.nk;
    if (k === 'system') { o.system = el.value; o.dL = null; o.dG = null; }
    else if (k === 'step') o.step = +el.value || 1;
    else if (k === 'free') o.free = el.checked;
    else if (k === 'defects') o.defects = el.value.slice(0, 4000);
    else { if (!Number.isFinite(v) || v < 0 || (k === 'w' || k === 'h' ? v < 50 || v > 6000 : false) || (k === 'gap' && v > 20) || ((k === 'from' || k === 'to') && (v < 10 || v > 60))) return bad(k === 'w' || k === 'h' ? '50–6000 mm' : k === 'gap' ? '0–20 mm' : k === 'from' || k === 'to' ? 'Numara 10–60 arası' : 'Geçerli bir sayı gir'); o[k] = v; }
    o.out = null; return render();
  }
  if (d.nkp !== undefined) { if (!Number.isInteger(v) || v < 0 || v > 50) return bad('Çift sayısı 0–50'); S.nk.pairs[d.nkp] = v; S.nk.out = null; return render(); }
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

/* ---------- klavye (docs/KISAYOLLAR.md · 5. bölüm) ---------- */
// Stampa çizim ekranı: araç harfleri; çizim alanındayken Esc / Enter / Delete / Ctrl+Z ekranın kendi işleyicisinde kalır.
const notCanvas = (_r, e) => !(e.target && e.target.tagName === 'CANVAS');
const toolKey = (key, id, label) => ({ key, label, press: { sel: `[data-tool="${id}"]` } });
export const AYK_KEYS = [
  { id: 'ayk-stampa', title: 'Stampa çizim ekranı', root: () => document.querySelector('.ed'), pass: true, keys: [
    toolKey('V', 'sec', 'Seç'), toolKey('L', 'cizgi', 'Çizgi'), toolKey('E', 'egri', 'Eğri'), toolKey('B', 'bezier', 'Bezier'), toolKey('S', 'serbest', 'Serbest çizim'),
    toolKey('N', 'nokta', 'Nokta ekle'), toolKey('X', 'sil', 'Nokta sil'), toolKey('K', 'bol', 'Böl'), toolKey('J', 'birlestir', 'Birleştir'),
    toolKey('G', 'kenar', 'Kenar başı'), toolKey('C', 'centik', 'Çentik'), toolKey('M', 'binme', 'Binme noktası'), toolKey('H', 'delik', 'Delik'),
    toolKey('A', 'aksesuar', 'Aksesuar'), toolKey('R', 'referans', 'Referans'), toolKey('D', 'olcu', 'Ölçü'), toolKey('T', 'yazi', 'Yazı'),
    { key: 'P', label: 'Yeni saya parçası', press: { a: 'newpiece' } },
    { key: 'CTRL+D', label: 'Parçayı kopyala', press: { a: 'copypc' } },
    { key: 'ENTER', label: 'Çizgiyi bitir', press: { a: 'finish' }, when: notCanvas },
    { key: 'SHIFT+ENTER', label: 'Çizgiyi kapat', press: [{ sel: '.ed-opts [data-a="close"]' }, { a: 'closepath' }] },
    { key: 'DELETE', label: 'Seçileni sil', press: { a: 'delsel' }, when: notCanvas },
    { key: 'ESCAPE', label: 'Vazgeç → Seç', when: notCanvas, run: (root) => press(root, { a: 'cancel' }) || press(root, { sel: '[data-tool="sec"]:not(.on)' }) },
    { key: 'F', label: 'Ortala', press: { a: 'fit' } }, { key: '+', label: 'Yakınlaştır', press: { a: 'zin' }, repeat: true }, { key: '-', label: 'Uzaklaştır', press: { a: 'zout' }, repeat: true },
    { key: 'CTRL+Z', label: 'Geri al', press: { a: 'undo' }, repeat: true, when: notCanvas }, { key: 'CTRL+Y', label: 'İleri al', press: { a: 'redo' }, repeat: true, when: notCanvas },
    { key: 'CTRL+SHIFT+Z', label: 'İleri al', press: { a: 'redo' }, repeat: true, when: notCanvas },
  ] },
  { id: 'ayk-sayfa', title: 'Ayakkabı sayfaları', root: () => document.getElementById('nav'), keys: [
    ...PAGES.map(([id, name], i) => ({ key: String(i + 1), label: name, run: () => { if (S.page !== id) go(id); } })),
    { key: 'PAGEDOWN', label: 'Sonraki sayfa', run: () => go(PAGES[(PAGES.findIndex(([k]) => k === S.page) + 1) % PAGES.length][0]) },
    { key: 'PAGEUP', label: 'Önceki sayfa', run: () => go(PAGES[(PAGES.findIndex(([k]) => k === S.page) - 1 + PAGES.length) % PAGES.length][0]) },
    { key: 'CTRL+S', label: 'Kaydet', run: () => { flush().then(() => toast(S.p ? 'Kaydedildi' : 'Açık proje yok')); } },
  ] },
];
installKeys(AYK_KEYS);
installHelpKey(() => { const act = AYK_KEYS.filter((c) => c.root()), rest = AYK_KEYS.filter((c) => !c.root()); return { title: 'Klavye kısayolları · Ayakkabı', sections: sectionsFromContexts([...act, ...rest]) }; });
window.__aykKeys = AYK_KEYS;

/* ---------- başlangıç: son açık proje ---------- */
let last = null; try { last = localStorage.getItem(LKEY); } catch (e) { /* */ }
const q = new URLSearchParams(location.search);
if (last && !q.has('liste') && (await store.get(last))) await openProject(last, 'stampa');
else go('projeler');
window.__ayk = { S, store, M, G, E };   // E2E testleri için (yalnız okuma amaçlı)
