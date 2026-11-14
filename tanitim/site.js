// Tanıtım sitesi: üst menüden seçilen bölüm açılır (adres #makine gibi değişir; geri tuşu çalışır, bağlantı paylaşılabilir).
// JavaScript kapalıysa bütün bölümler alt alta görünür.
const panels = [...document.querySelectorAll('[data-panel]')];
const tabs = [...document.querySelectorAll('.tabs a')];
const names = new Set(panels.map((p) => p.dataset.panel));
// eski bağlantılar (#akis, #moduller…) ilgili bölüme gider
const ALIAS = { akis: 'makine', moduller: 'makine', durum: 'guven', neden: 'hakkinda', hikaye: 'hakkinda', kimler: 'ana', atolyeler: 'ana', '': 'ana' };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const BASE = document.title;

function countUp(root) {
  for (const el of root.querySelectorAll('[data-count]')) {
    const to = +el.dataset.count;
    if (reduced || !to) { el.textContent = to; continue; }
    const t0 = performance.now(), dur = 1300;
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(to * e); if (k < 1) requestAnimationFrame(step); };
    el.textContent = '0'; requestAnimationFrame(step);
  }
}
const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }, { threshold: 0.12 }) : null;
function reveal(root) {
  const els = root.querySelectorAll('.reveal, .step, .mod, .who>div, .trust>div, .faq>div, .limits li, .tex li, .ws dl>div');
  els.forEach((el, i) => {
    el.classList.add('reveal'); el.classList.remove('in');
    el.style.transitionDelay = Math.min(i % 6, 5) * 60 + 'ms';
    if (io && !reduced) io.observe(el); else el.classList.add('in');
  });
}
function show(name, { scroll = true } = {}) {
  if (name in ALIAS && !names.has(name)) name = ALIAS[name];
  if (!names.has(name)) name = 'ana';
  for (const p of panels) {
    const on = p.dataset.panel === name;
    p.hidden = !on;
    if (on) { p.classList.remove('enter'); void p.offsetWidth; p.classList.add('enter'); reveal(p); countUp(p); document.title = name === 'ana' ? BASE : p.dataset.title + ' · ' + BASE; }
  }
  for (const t of tabs) {
    const on = t.getAttribute('href') === '#' + name;
    t.setAttribute('aria-current', on ? 'page' : 'false');
    if (on) t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced ? 'auto' : 'smooth' });
  }
  if (scroll) window.scrollTo({ top: 0, behavior: 'auto' });
}
const fromHash = () => decodeURIComponent(location.hash.slice(1));
window.addEventListener('hashchange', () => show(fromHash()));
// aynı sekmeye tekrar dokununca başa dön
for (const t of tabs) t.addEventListener('click', (e) => { if (t.getAttribute('href') === location.hash || (t.getAttribute('href') === '#ana' && !location.hash)) { e.preventDefault(); show(t.getAttribute('href').slice(1)); } });
document.documentElement.classList.add('js');
show(fromHash(), { scroll: false });
