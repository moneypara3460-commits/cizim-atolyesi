// Açılış ekranı: çizim animasyonu → Makine / Tekstil / Ayakkabı seçimi. Son seçim hatırlanır.
//   ?sec=1            : doğrudan seçim (bölüm içindeki "Ana ekran" buraya döner)
//   ?ws=makine|tekstil|ayakkabi: eski bağlantılar (index.html?ws=makine) — seçimi kaydedip o bölüme gider
const KEY = 'cizim:workspace';
const TARGET = { makine: 'yeni/', tekstil: 'tekstil.html', ayakkabi: 'ayakkabi.html' };
const NAME = { makine: 'Makine ve Mühendislik', tekstil: 'Tekstil ve Moda', ayakkabi: 'Ayakkabı Modelhanesi' };
const SPLASH_MS = 1500, GO_MS = 2300;

const q = new URLSearchParams(location.search);
const get = (k = KEY) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (v, k = KEY) => { try { localStorage.setItem(k, v); } catch (e) { /* gizli sekme: seçim yalnız bu açılış için */ } };
// Görülen kapılar: yeni bir atölye eklenince, son seçim hatırlansa bile seçim ekranı bir kez açılır ve yeni kapı "YENİ" diye işaretlenir.
// Bu kayıttan önce gelen kullanıcılar Makine ve Tekstil'i görmüştü.
const SEEN_KEY = 'cizim:kapilar';
const ALL = Object.keys(TARGET);
const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const app = document.getElementById('app');
const go = (ws) => location.replace(TARGET[ws]);

let last = get();
if (!TARGET[last]) last = null;
const seen = (get(SEEN_KEY) || (last ? 'makine,tekstil' : '')).split(',').filter(Boolean);
const unseen = ALL.filter((w) => !seen.includes(w));
for (const d of document.querySelectorAll('.door')) {
  d.querySelector('.last').hidden = d.dataset.ws !== last;
  const nw = d.querySelector('.new'); if (nw) nw.hidden = !(seen.length && unseen.includes(d.dataset.ws));
}

function showPick() {
  clearTimeout(timer);
  app.dataset.stage = 'pick';
  set(ALL.join(','), SEEN_KEY);   // kapılar görüldü
}

document.addEventListener('click', (e) => {
  const d = e.target.closest('.door');
  if (d) { e.preventDefault(); set(d.dataset.ws); go(d.dataset.ws); return; }
  if (e.target.closest('#other')) showPick();
});

let timer = 0;
const legacy = q.get('ws');
if (TARGET[legacy]) { set(legacy); go(legacy); }
else if (q.has('sec')) showPick();
else if (last && !unseen.length) {
  // hatırlanan bölüm: kısa açılıştan sonra oraya geç; istersen "Başka bölüm seç"
  const g = document.getElementById('going'), o = document.getElementById('other');
  g.textContent = NAME[last] + ' açılıyor…'; g.hidden = false; o.hidden = false;
  timer = setTimeout(() => go(last), reduced ? 900 : GO_MS);
} else timer = setTimeout(showPick, reduced ? 300 : SPLASH_MS);
