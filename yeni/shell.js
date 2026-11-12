// Yeni arayüz kabuğu. app.js'ye ve hesap modüllerine dokunmaz: yalnızca sayfadaki düzeni yönetir
// (bölümler, alt panel, araçlar, menü, komut arama). Uygulama düğmeleri aynı data-act değerleriyle çalışır.
const $ = (id) => document.getElementById(id);
const appEl = $('app');
const tabsEl = $('tabs');
const chipsEl = $('chips');

/* ---------- bölümler ve sekmeler ---------- */
const MODES = {
  tasarim: ['dims', 'type', 'pos', 'rot', 'copy', 'face', 'edge', 'shell', 'mate', 'link', 'part', 'view', 'sheet', 'anim', 'occt'],
  analiz: ['fem', 'sim', 'str', 'wgt'],
  uretim: ['cam', 'mfg', 'cost', 'weld', 'asm', 'calc'],
};
const TAB_MODE = {};
for (const [m, ks] of Object.entries(MODES)) for (const k of ks) TAB_MODE[k] = m;
const FIRST = { tasarim: 'dims', analiz: 'fem', uretim: 'cam' };
const MODE_NAME = { tasarim: 'Tasarım', analiz: 'Analiz', uretim: 'Üretim' };
const TAB_LABEL = {
  dims: 'Ölçü', type: 'Tür', pos: 'Konum', rot: 'Döndür', copy: 'Çoğalt', face: 'Yüz', edge: 'Kenar', shell: 'Kabuk', mate: 'Montaj',
  link: 'Bağ', part: 'Parça', view: 'Görünüm', sheet: 'Teknik resim', anim: 'Hareket', occt: 'B-Rep',
  fem: 'FEA analizi', sim: 'Sanal test', str: 'Dayanım', wgt: 'Ağırlık',
  cam: 'CNC', mfg: 'Üretilebilirlik', cost: 'Maliyet', weld: 'Kaynak', asm: 'Montaj sırası', calc: 'Hesap ve dışa aktarma',
};
let mode = 'tasarim';
const isDesk = () => matchMedia('(min-width: 1000px)').matches;
const currentTab = () => { const b = tabsEl.querySelector('.tab.on'); return b ? b.dataset.act.slice(4) : null; };
const clickTab = (k) => { const b = tabsEl.querySelector(`[data-act="tab-${k}"]`); if (b) b.click(); };

function setSheet(s) { appEl.dataset.sheet = s; }
function sheet() { return appEl.dataset.sheet; }

function paintMode() {
  appEl.dataset.mode = mode;
  tabsEl.dataset.mode = mode;
  for (const b of document.querySelectorAll('#nav [data-mode]')) {
    if (b.dataset.mode === mode) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  updateTitles();
}

function setMode(m, { pickTab = true, open = true } = {}) {
  if (!MODES[m]) return;
  mode = m;
  paintMode();
  if (pickTab && TAB_MODE[currentTab()] !== m) clickTab(FIRST[m]);
  if (!isDesk() && open) {
    if (m !== 'tasarim') { if (sheet() === 'closed') setSheet('half'); }
    else setSheet(selected() ? (sheet() === 'full' ? 'full' : 'half') : 'closed');
  }
}

// sekme şeridi her yeniden çizildiğinde: bölüm etiketi, sade adlar, etkin sekmenin bölümüne geçiş
function onTabs() {
  for (const b of tabsEl.querySelectorAll('.tab')) {
    const k = b.dataset.act.slice(4);
    b.dataset.m = TAB_MODE[k] || 'tasarim';
    const ord = MODES[b.dataset.m].indexOf(k); if (ord >= 0 && b.style.order !== String(ord)) b.style.order = String(ord);
    if (TAB_LABEL[k] && b.textContent !== TAB_LABEL[k]) b.textContent = TAB_LABEL[k];
  }
  const k = currentTab(), m = TAB_MODE[k];
  if (m && m !== mode) { mode = m; paintMode(); if (!isDesk() && m !== 'tasarim' && sheet() === 'closed') setSheet('half'); }
  const on = tabsEl.querySelector('.tab.on');
  if (on) { const l = on.offsetLeft, r = l + on.offsetWidth; if (l < tabsEl.scrollLeft || r > tabsEl.scrollLeft + tabsEl.clientWidth) tabsEl.scrollLeft = l - 12; }
  updateTitles();
}
new MutationObserver(onTabs).observe(tabsEl, { childList: true });

/* ---------- parça seçimi ---------- */
let lastTap = 0;
const selected = () => chipsEl.querySelector('.chip.on');
const cleanName = (s) => String(s || '').replace(/\s*(\(oyuk\)|⊘|🔗|⚠)/gu, '').trim();
let lastSel = null;
function onChips() {
  const s = selected(), key = s ? s.dataset.sel : null;
  if (key !== lastSel && Date.now() - lastTap < 900 && !isDesk() && mode === 'tasarim') {
    if (key) { if (sheet() === 'closed') setSheet('half'); } else setSheet('closed');
  }
  lastSel = key;
  if (s) { const l = s.offsetLeft, r = l + s.offsetWidth; if (!isDesk() && (l < chipsEl.scrollLeft || r > chipsEl.scrollLeft + chipsEl.clientWidth)) chipsEl.scrollLeft = l - 10; }
  updateTitles();
}
new MutationObserver(onChips).observe(chipsEl, { childList: true });
$('view').addEventListener('pointerup', () => { lastTap = Date.now(); }, true);
chipsEl.addEventListener('click', () => { lastTap = Date.now(); }, true);

/* ---------- başlıklar ---------- */
function projectName() {
  try { const a = JSON.parse(localStorage.getItem('cizim:auto') || 'null'); if (a && a.projName) return a.projName; } catch (e) { /* */ }
  return 'Model';
}
function updateTitles() {
  const n = chipsEl.querySelectorAll('.chip').length, s = selected(), sn = s ? cleanName(s.textContent) : '';
  const name = projectName();
  $('t-name').textContent = name;
  $('t-sub').textContent = n ? `${n} parça${sn ? ' · ' + sn + ' seçili' : ''}` : 'Boş proje';
  const k = currentTab();
  if (mode === 'tasarim') {
    $('sh-name').textContent = sn || name;
    $('sh-sub').textContent = sn ? (TAB_LABEL[k] || 'Özellikler') : (n ? 'Bir parçaya dokun, ölçüleri açılsın' : 'Bir şekil ekleyerek başla');
  } else {
    $('sh-name').textContent = MODE_NAME[mode];
    $('sh-sub').textContent = TAB_LABEL[k] || '';
  }
  $('sh-del').hidden = !(mode === 'tasarim' && s);
  document.title = name === 'Model' ? 'Çizim Atölyesi' : name + ' · Çizim Atölyesi';
}
setInterval(updateTitles, 2500);

/* ---------- menü, araçlar, panel ---------- */
function closeAll() { appEl.classList.remove('tools-open', 'menu-open'); }
function openPalette() {
  closeAll(); appEl.classList.add('pal-open');
  const q = $('pal-q'); q.value = ''; renderPalette(); setTimeout(() => q.focus(), 0);
}
function closePalette() { appEl.classList.remove('pal-open'); }
const UI = {
  menu: () => { appEl.classList.toggle('menu-open'); appEl.classList.remove('tools-open'); },
  tools: () => { appEl.classList.add('tools-open'); appEl.classList.remove('menu-open'); },
  close: () => { closeAll(); closePalette(); },
  search: openPalette,
  props: () => setSheet(sheet() === 'closed' ? 'half' : 'closed'),
  'sheet-cycle': () => setSheet(sheet() === 'half' ? 'full' : 'half'),
  'sheet-close': () => setSheet('closed'),
};
window.addEventListener('click', (e) => {
  const u = e.target.closest('[data-ui]');
  if (u && UI[u.dataset.ui]) { e.stopPropagation(); e.preventDefault(); UI[u.dataset.ui](); return; }
  const m = e.target.closest('#nav [data-mode]');
  if (m && m.dataset.mode !== 'tekstil') {
    e.stopPropagation(); e.preventDefault();
    const was = mode;
    setMode(m.dataset.mode);
    if (!isDesk() && was === m.dataset.mode && m.dataset.mode !== 'tasarim') setSheet(sheet() === 'closed' ? 'half' : sheet());
    return;
  }
  // araç ya da menü düğmesi uygulamaya gider; açık listeyi kapat
  if (e.target.closest('#tools [data-act], #menu [data-act], #menu a')) setTimeout(closeAll, 0);
}, true);

// alt paneli parmakla sürükleyerek büyüt / küçült / kapat
let dragY = null;
$('sheethead').addEventListener('pointerdown', (e) => { if (isDesk() || (e.target.closest('button') && !e.target.closest('.grab'))) return; dragY = e.clientY; });
window.addEventListener('pointerup', (e) => {
  if (dragY == null) return;
  const dy = e.clientY - dragY; dragY = null;
  if (dy > 50) setSheet(sheet() === 'full' ? 'half' : 'closed');
  else if (dy < -50) setSheet('full');
});
window.addEventListener('pointercancel', () => { dragY = null; });

/* ---------- komut arama ---------- */
const C = (grp, title, sub, kw, run, icon, tag) => ({ grp, title, sub, kw, run, icon, tag });
const T = (k, title, sub, kw, icon) => C(MODE_NAME[TAB_MODE[k]], title, sub, kw, { tab: k }, icon);
const CMDS = [
  C('Tasarım', 'Kutu ekle', 'Dikdörtgen prizma, blok', 'kutu prizma blok plaka', { act: 'add-box' }, 'cube'),
  C('Tasarım', 'Silindir ekle', 'Mil, disk, flanş tabanı', 'silindir mil disk yuvarlak', { act: 'add-cylinder' }, 'cyl'),
  C('Tasarım', 'Küre ekle', '', 'küre top bilye', { act: 'add-sphere' }, 'sphere'),
  C('Tasarım', 'Koni ekle', 'Koni ya da kesik koni', 'koni huni', { act: 'add-cone' }, 'cone'),
  C('Tasarım', 'Boru ekle', 'İçi boş silindir', 'boru tüp', { act: 'add-tube' }, 'tube'),
  C('Tasarım', 'Kroki çiz', '2B şekil çiz, kalınlık ver ya da döndür', 'kroki sketch ekstrüzyon döndür profil çiz', { act: 'sketch-new' }, 'pen'),
  C('Tasarım', 'Süpürme', 'Profili bir yol boyunca süpür', 'süpürme sweep dirsek yol', { act: 'add-sweep' }, 'sweep'),
  C('Tasarım', 'Loft', 'İki kesit arasında geçiş', 'loft geçiş', { act: 'add-loft' }, 'loft'),
  C('Tasarım', 'Sac metal', 'Bükümlü sac, açınım', 'sac metal büküm açınım', { act: 'add-sheet' }, 'sheet'),
  C('Tasarım', 'Konstrüksiyon', 'Profil iskelet, kaynaklı çerçeve', 'konstrüksiyon profil iskelet kaynak çerçeve masa', { act: 'add-frame' }, 'frame'),
  C('Tasarım', 'Dişli çark', 'Evolvent düz dişli', 'dişli çark gear', { act: 'add-gear' }, 'gear'),
  C('Tasarım', 'Yuvarlak delik aç', 'Seçili parçaya delik', 'delik matkap yuvarlak', { act: 'hole-round' }, 'hole'),
  C('Tasarım', 'Kare delik aç', '', 'delik kare cep', { act: 'hole-square' }, 'sqhole'),
  C('Tasarım', '2B çizim', 'AutoCAD tarzı çizim, DXF', '2b çizim dxf autocad', { act: 'cad2d' }, 'draw'),
  T('dims', 'Ölçüler', 'Seçili parçanın boyutları', 'ölçü boyut çap yükseklik genişlik', 'ruler'),
  T('type', 'Tür değiştir', 'Parçanın şeklini değiştir', 'tür şekil', 'cube'),
  T('pos', 'Konum', 'X, Y, Z konumu', 'konum yer taşı', 'move'),
  T('rot', 'Döndür', 'X°, Y°, Z° döndürme', 'döndür açı', 'rotate'),
  T('copy', 'Çoğalt, dizi, ayna', '', 'çoğalt kopya dizi ayna', 'copy'),
  T('face', 'Yüze işlem', 'Yüze delik, çıkıntı, kroki, desen', 'yüz delik çıkıntı desen', 'hole'),
  T('edge', 'Kenar yuvarlama ve pah', '', 'kenar yuvarlama pah radyus', 'edge'),
  T('shell', 'Kabuk', 'İçini boşalt', 'kabuk boşalt et kalınlığı', 'shell'),
  T('mate', 'Montaj eşleşmeleri', 'Yüzü yüze, eş merkez', 'montaj eşleşme mate', 'link'),
  T('link', 'Bağ ve eklemler', 'Menteşe, kayar eklem', 'bağ menteşe eklem kayar', 'link'),
  T('part', 'Parça ayarları', 'Renk, gizle, ad', 'parça renk gizle', 'stack'),
  T('view', 'Görünüm', 'Kesit, ölçüm, birim', 'görünüm kesit ölçüm birim', 'eye'),
  T('sheet', 'Teknik resim', 'Ölçülü görünüşler, PDF', 'teknik resim pdf görünüş kesit', 'doc'),
  T('anim', 'Hareket etüdü', 'Mekanizmayı oynat', 'hareket animasyon mekanizma', 'play'),
  T('occt', 'B-Rep hassas katı', 'STEP, IGES, kesin Boolean', 'brep b-rep step iges occt katı', 'cube'),
  C('Tasarım', 'Ekrana sığdır', '', 'sığdır yakınlaştır görünüm', { act: 'fit' }, 'fit'),
  C('Tasarım', 'Taşı (sürükle)', 'Parçayı sürükleyerek taşı', 'taşı sürükle', { act: 'move' }, 'move'),
  C('Tasarım', 'Seçili parçayı sil', '', 'sil kaldır', { act: 'del' }, 'trash'),
  C('Tasarım', 'Geri al', '', 'geri al undo', { act: 'undo' }, 'undo'),
  C('Tasarım', 'İleri al', '', 'ileri al redo', { act: 'redo' }, 'redo'),
  T('fem', 'Mühendislik analizi (FEA)', 'Gerilme, frekans, ısı, burkulma', 'fea analiz gerilme sehim frekans ısı burkulma sonlu eleman', 'chart'),
  T('sim', 'Sanal test', 'Dayanım, titreşim, ömür, öneriler', 'sanal test gelecek ömür yorulma', 'wave'),
  T('str', 'Dayanım uyarıları', '', 'dayanım büküm uyarı', 'chart'),
  T('wgt', 'Ağırlık ve ağırlık merkezi', '', 'ağırlık kütle kg merkez', 'weight'),
  T('cam', 'CNC freze', '3 eksen takım yolu, simülasyon, G-kodu', 'cnc freze g-kodu gkod takım yolu cam 3 eksen', 'cnc'),
  C('Üretim', 'CNC torna', '11 operasyon, simülasyon, Fanuc G-kodu', 'cnc torna lathe mil vida g-kodu', { lathe: true }, 'lathe', 'Torna'),
  T('mfg', 'Üretilebilirlik kontrolü', '', 'üretilebilirlik üretim kontrol', 'check'),
  T('cost', 'Maliyet', '', 'maliyet fiyat para', 'coin'),
  T('weld', 'Kaynak planı', '', 'kaynak dikiş', 'flame'),
  T('asm', 'Montaj sırası', 'Patlatılmış görünüm, montaj adımları', 'montaj sırası patlatılmış', 'stack'),
  T('calc', 'Hesap ve dışa aktarma', 'Hacim, STEP, 3MF', 'hesap dışa aktar step 3mf hacim', 'calc'),
  C('Üretim', 'STL indir', '3B yazıcı için', 'stl indir yazıcı 3b baskı', { act: 'stl' }, 'download'),
  ...[['braket', 'L braket', 'Delik, pah, yuvarlama'], ['flans', 'Flanş', 'Daire üzerinde delikler, göbek'], ['kutu', 'Menteşeli kutu', 'Kabuk ve menteşe'],
    ['mil', 'Mil ve burç', 'Eş merkezli montaj'], ['sac', 'Sac U kanal', 'Sac metal açınımı'], ['masa', 'Masa iskeleti', 'Konstrüksiyon, kaynak'],
    ['dirsek', 'Boru dirseği', 'Süpürme']].map(([k, t, s]) => C('Örnekler', t + ' örneğini aç', s, 'örnek ' + t, { ex: k }, 'folder')),
  C('Uygulama', 'Projeler', 'Kaydet, aç, yeni proje', 'proje kaydet aç yeni dosya', { act: 'projects' }, 'folder'),
  C('Uygulama', 'Rehber ve örnekler', '', 'rehber yardım örnek nasıl', { act: 'guide' }, 'help'),
  C('Uygulama', 'Sesli komut', '', 'ses mikrofon konuş', { act: 'mic' }, 'mic'),
  C('Uygulama', 'Tekstil ve Moda', 'Kalıp, kesim planı, triko', 'tekstil moda kalıp giysi triko kumaş', { href: '../tekstil.html' }, 'scissors'),
  C('Uygulama', 'Eski arayüze dön', '', 'eski arayüz', { href: '../index.html?ws=makine' }, 'back'),
];
const DEFAULT = ['Kutu ekle', 'Silindir ekle', 'Kroki çiz', 'Yuvarlak delik aç', 'Mühendislik analizi (FEA)', 'CNC freze', 'CNC torna', 'Teknik resim', 'Flanş örneğini aç', 'Projeler'];

const norm1 = (c) => c.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
const norm = (s) => [...String(s)].map(norm1).join('');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function highlight(title, q) {
  if (!q) return esc(title);
  const chars = [...title], map = []; let n = '';
  chars.forEach((c, i) => { const x = norm1(c); for (let j = 0; j < x.length; j++) map.push(i); n += x; });
  const at = n.indexOf(q);
  if (at < 0) return esc(title);
  const a = map[at], b = map[at + q.length - 1] + 1;
  return esc(chars.slice(0, a).join('')) + '<mark>' + esc(chars.slice(a, b).join('')) + '</mark>' + esc(chars.slice(b).join(''));
}
let palItems = [], palSel = 0;
function renderPalette() {
  const q = norm($('pal-q').value.trim());
  let list;
  if (!q) list = DEFAULT.map((t) => CMDS.find((c) => c.title === t)).filter(Boolean);
  else {
    list = CMDS.map((c) => {
      const t = norm(c.title), k = norm(c.kw + ' ' + c.sub);
      let s = 0;
      if (t.startsWith(q)) s = 4; else if (t.split(/\s+/).some((w) => w.startsWith(q))) s = 3; else if (t.includes(q)) s = 2;
      else if (k.split(/\s+/).some((w) => w.startsWith(q))) s = 1.5; else if (k.includes(q)) s = 1;
      return [s, c];
    }).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]).map(([, c]) => c).slice(0, 14);
  }
  palItems = list; palSel = 0;
  const box = $('pal-list');
  if (!list.length) { box.innerHTML = `<div class="pal-empty">“${esc($('pal-q').value)}” için sonuç yok. Başka bir kelime dene: delik, CNC, analiz, kalıp…</div>`; return; }
  // arama varken en iyi eşleşme en üstte (Enter onu çalıştırır); bölüm adı sağdaki etikette
  const groups = [[q ? 'SONUÇLAR' : 'SIK KULLANILANLAR', list]];
  let i = 0;
  box.innerHTML = groups.map(([g, xs]) => `<div class="pal-h">${esc(g)}</div>` + xs.map((c) => {
    const idx = i++;
    const tag = c.tag || c.grp;
    return `<button class="ui pal-it" role="option" data-i="${idx}" aria-selected="${idx === 0}"><span class="pal-ic"><svg><use href="#i-${c.icon}"/></svg></span>` +
      `<span class="pal-t"><b>${highlight(c.title, q)}</b>${c.sub ? `<small>${esc(c.sub)}</small>` : ''}</span>${tag ? `<span class="pal-tag">${esc(tag)}</span>` : ''}</button>`;
  }).join('')).join('');
}
function movePal(d) {
  if (!palItems.length) return;
  palSel = (palSel + d + palItems.length) % palItems.length;
  for (const b of $('pal-list').querySelectorAll('.pal-it')) b.setAttribute('aria-selected', String(Number(b.dataset.i) === palSel));
  const cur = $('pal-list').querySelector(`[data-i="${palSel}"]`); if (cur) cur.scrollIntoView({ block: 'nearest' });
}
const clickAct = (a) => { const b = [...document.querySelectorAll(`[data-act="${a}"]`)].find((x) => x.offsetParent) || document.querySelector(`[data-act="${a}"]`); if (b) b.click(); };
function waitFor(sel, cb, ms = 4000) {
  const t0 = Date.now();
  const tick = () => { const el = document.querySelector(sel); if (el) cb(el); else if (Date.now() - t0 < ms) setTimeout(tick, 60); };
  tick();
}
function showTab(k) {
  const m = TAB_MODE[k] || 'tasarim';
  mode = m; paintMode();
  clickTab(k);
  if (!isDesk()) setSheet(sheet() === 'full' ? 'full' : 'half');
}
function runCmd(c) {
  closePalette();
  const r = c.run;
  if (r.act) clickAct(r.act);
  else if (r.tab) showTab(r.tab);
  else if (r.ex) { clickAct('guide'); waitFor(`[data-ex="${r.ex}"]`, (el) => el.click()); }
  else if (r.lathe) { showTab('cam'); waitFor('#tabbody [data-act="lz-on"]', (el) => el.click()); }
  else if (r.href) location.href = r.href;
}
$('pal-list').addEventListener('click', (e) => { const b = e.target.closest('.pal-it'); if (b) { e.stopPropagation(); runCmd(palItems[Number(b.dataset.i)]); } });
$('pal-q').addEventListener('input', renderPalette);
$('palette').addEventListener('click', (e) => { if (e.target.id === 'palette') closePalette(); });
document.addEventListener('keydown', (e) => {
  const open = appEl.classList.contains('pal-open');
  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (open) closePalette(); else openPalette(); return; }
  if (open) {
    if (e.key === 'ArrowDown') { e.preventDefault(); movePal(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); movePal(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (palItems[palSel]) runCmd(palItems[palSel]); }
    else if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
    e.stopPropagation();
    return;
  }
  if (e.key === 'Escape' && (appEl.classList.contains('menu-open') || appEl.classList.contains('tools-open'))) closeAll();
}, true);

// testler ve ileride başka modüller için küçük bir kapı
window.__shell = { setMode, showTab, setSheet, openPalette, closePalette, modeOf: (k) => TAB_MODE[k] || 'tasarim', isDesk, get mode() { return mode; }, get sheet() { return sheet(); } };
paintMode();
