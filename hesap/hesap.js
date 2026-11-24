// Hesabım sayfası: giriş, deneme/abonelik durumu, paketler, Google Play'den satın alma ve geri yükleme.
//   ?bolum=tekstil  : kilitli bölümden gelindi
//   ?geri=<adres>   : erişim varsa "Bölüme dön" bu adrese gider (yalnız aynı site)
import * as S from './session.js';
import * as B from './billing.js';
import { PLANS, SECTION_NAME, ALL_PRODUCTS, productId, productInfo } from './plans.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const bolum = SECTION_NAME[q.get('bolum')] ? q.get('bolum') : null;
const geri = sameSite(q.get('geri'));
const billing = B.billingAvailable();
let period = 'aylik', acc = null, prices = {}, busy = false;

function sameSite(u) {
  if (!u) return null;
  try { const x = new URL(u, location.href); return x.origin === location.origin ? x.href : null; } catch (e) { return null; }
}
const fmtDate = (ms) => new Date(ms).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
let tt = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(tt); tt = setTimeout(() => { el.hidden = true; }, 4000); }
function message(t) { const el = $('msg'); el.textContent = t || ''; el.hidden = !t; }
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

$('google').addEventListener('click', () => {
  // Android uygulamasında giriş sistem tarayıcısında açılır (Google, uygulama içi girişe izin vermez): mobil/kopru.js
  if (window.__mobil && window.__mobil.girisAc) { window.__mobil.girisAc(location.pathname + location.search); return; }
  location.href = S.loginUrl(location.origin + location.pathname + location.search);
});
$('logout').addEventListener('click', () => { S.logout(); location.replace(location.pathname + location.search); });
$('restore').addEventListener('click', () => restore(false));
$('delok').addEventListener('input', (e) => { $('delacc').disabled = e.target.value.trim().toLocaleUpperCase('tr') !== 'SİL'; });
$('delacc').addEventListener('click', async () => {
  const b = $('delacc'); b.disabled = true; b.textContent = 'Siliniyor…';
  try {
    await S.deleteAccount();
    try { localStorage.removeItem('cizim:oturum'); localStorage.removeItem('cizim:erisim'); } catch (e) { /* yok */ }
    toast('Hesabın ve sunucudaki verilerin silindi.');
    setTimeout(() => location.replace(location.pathname + location.search), 1500);
  } catch (e) { b.disabled = false; b.textContent = 'Hesabımı kalıcı olarak sil'; toast('Silinemedi: ' + e.message); }
});
for (const b of document.querySelectorAll('.period button')) {
  b.addEventListener('click', () => {
    period = b.dataset.period;
    for (const x of document.querySelectorAll('.period button')) x.setAttribute('aria-selected', String(x === b));
    renderPlans();
  });
}

async function refresh() {
  try { acc = await S.fetchAccess(); } catch (e) {
    if (e.code === 'auth') { S.logout(); location.replace(location.pathname + location.search); return; }
    acc = null;
  }
  renderState();
}

function renderState() {
  const box = $('state'); box.textContent = '';
  $('manage').hidden = !(acc && acc.subs.length);   // abonelik yoksa yönetilecek bir şey de yok
  if (!acc) { box.append(el('p', 'note warn', 'Durum alınamadı. İnternet bağlantını kontrol edip sayfayı yenile.')); return; }
  if (acc.subs.length) {
    box.append(el('p', null, 'Aboneliklerin:'));
    const ul = el('ul', 'subs');
    for (const s of acc.subs) {
      const info = productInfo(s.product_id);
      const name = info ? `${info.name} · ${info.period === 'yillik' ? 'Yıllık' : 'Aylık'}` : s.product_id;
      ul.append(el('li', null, `${name} — ${s.auto_renewing ? 'yenilenme' : 'bitiş'}: ${fmtDate(s.expires)}`));
    }
    box.append(ul);
  }
  if (acc.onTrial) box.append(el('p', 'note', `Deneme süren devam ediyor: ${acc.trialDaysLeft} gün kaldı (${fmtDate(acc.trialEnd)} tarihine kadar). Bu sürede tüm bölümler açık.`));
  else if (!acc.subs.length) box.append(el('p', 'note warn', 'Deneme süren doldu. Devam etmek için bir paket seç.'));
  const ok = !bolum || acc.sections.includes(bolum);
  message(bolum && !ok ? `${SECTION_NAME[bolum]} bölümünü açmak için bu bölümü içeren bir paket gerekiyor.` : '');
  const back = $('back');
  back.hidden = !(geri && ok);
  if (geri) back.href = geri;
}

function renderPlans() {
  const cards = $('cards'); cards.textContent = '';
  const logged = !!S.getSession();
  for (const p of PLANS) {
    const pid = productId(p.id, period);
    const c = el('div', 'card' + (p.best ? ' best' : ''));
    if (p.best) c.append(el('span', 'tag', 'En avantajlı'));
    c.append(el('h3', null, p.name));
    const price = el('div', 'price', prices[pid] || p[period]);
    price.append(el('small', null, period === 'yillik' ? ' / yıl' : ' / ay'));
    c.append(price);
    c.append(el('div', 'muted small', p.sections.map((s) => SECTION_NAME[s]).join(' + ')));
    const owned = !!acc?.subs.some((s) => s.product_id.startsWith(p.id + '_'));
    if (owned) c.append(el('div', 'own', '✓ Aboneliğin var'));
    const b = el('button', 'btn' + (p.best ? ' primary' : ''), !logged ? 'Önce giriş yap' : owned ? 'Abonesin' : 'Abone ol');
    b.type = 'button';
    b.disabled = !billing || !logged || owned;
    b.addEventListener('click', () => purchase(pid));
    c.append(b);
    cards.append(c);
  }
  $('nobill').hidden = billing;
}

async function purchase(pid) {
  if (busy) return; busy = true;
  try {
    const r = await B.buy(pid);
    if (!r.token) throw new Error('Google Play satın alma bilgisini vermedi');
    try {
      await S.verifyPurchase(pid, r.token);
      r.complete(true);
    } catch (e) { r.complete(false); throw e; }
    await refresh(); renderPlans();
    toast('Abonelik açıldı, teşekkürler!');
  } catch (e) {
    if (e && e.name === 'AbortError') return;   // kullanıcı vazgeçti
    toast('Satın alma tamamlanamadı: ' + (e.message || e) + '. Ödeme alındıysa "Satın alımları geri yükle"ye dokun.');
  } finally { busy = false; }
}

async function restore(silent) {
  if (!billing) return;
  try {
    const list = await B.ownedPurchases();
    let n = 0;
    for (const p of list || []) {
      if (!productInfo(p.itemId)) continue;
      try { await S.verifyPurchase(p.itemId, p.purchaseToken); n++; } catch (e) { if (!silent) toast(e.message); }
    }
    if (n) { await refresh(); renderPlans(); }
    if (!silent) toast(n ? `${n} abonelik geri yüklendi.` : 'Bu Google hesabında abonelik bulunamadı.');
  } catch (e) { if (!silent) toast('Geri yükleme yapılamadı: ' + e.message); }
}

async function init() {
  const h = S.takeSessionFromHash();
  if (h && h.error) message('Giriş yapılamadı: ' + h.error);
  $('plans').hidden = false;
  if (!S.getSession()) {
    $('login').hidden = false;
    if (bolum && !(h && h.error)) message(`${SECTION_NAME[bolum]} bölümünü açmak için giriş yap.`);
    renderPlans();
    return;
  }
  $('status').hidden = false;
  $('restore').hidden = !billing;
  try { const u = await S.getUser(); $('who').textContent = u.email ? 'Giriş: ' + u.email : ''; } catch (e) {
    if (e.code === 'auth') { S.logout(); location.replace(location.pathname + location.search); return; }
  }
  await refresh();
  if (billing) { prices = await B.storePrices(ALL_PRODUCTS); await restore(true); }
  renderPlans();
}
init();
