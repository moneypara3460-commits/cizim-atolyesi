// Bölüm kilidi. Bölüm sayfası şöyle yükler:  <script type="module" src="./hesap/guard.js?b=tekstil"></script>
// PAYWALL kapalıyken hiçbir şey yapmaz. Açıkken erişim yoksa Hesabım sayfasına yönlendirir.
import { PAYWALL } from './config.js';

const bolum = new URL(import.meta.url).searchParams.get('b');
const HOME = new URL('./', import.meta.url).href;
const DAY = 864e5;

if (PAYWALL && bolum) check();

async function check() {
  const S = await import('./session.js');
  const toAccount = () => location.replace(HOME + '?bolum=' + encodeURIComponent(bolum) + '&geri=' + encodeURIComponent(location.href));
  if (S.allowedOffline(bolum)) {
    pill(S.cachedAccess());
    const c = S.cachedAccess();
    if (navigator.onLine !== false && Date.now() - (c.checkedAt || 0) > 6 * 3600e3) {
      // arka planda tazele; abonelik bittiyse yönlendir
      S.fetchAccess().then((a) => { if (!a.sections.includes(bolum)) toAccount(); else pill(S.cachedAccess()); }).catch((e) => { if (e.code === 'auth') toAccount(); });
    }
    return;
  }
  try {
    const a = await S.fetchAccess();
    if (a.sections.includes(bolum)) { pill(S.cachedAccess()); return; }
  } catch (e) { /* giriş yok veya internet yok */ }
  toAccount();
}

// Deneme sürerken küçük bir hatırlatma: "Deneme · 9 gün · Abone ol"
function pill(c) {
  document.getElementById('hesap-pill')?.remove();
  if (!c || !(c.trialEnd > Date.now()) || (c.until?.[bolum] || 0) > c.trialEnd) return;   // ücretli erişim varsa gösterme
  const days = Math.ceil((c.trialEnd - Date.now()) / DAY);
  const a = document.createElement('a');
  a.id = 'hesap-pill';
  a.href = HOME + '?geri=' + encodeURIComponent(location.href);
  a.textContent = `Deneme · ${days} gün · Abone ol`;
  Object.assign(a.style, {
    position: 'fixed', left: '8px', bottom: 'calc(8px + env(safe-area-inset-bottom))', zIndex: 9999,
    padding: '5px 10px', borderRadius: '999px', font: '600 12px/1.2 system-ui, sans-serif',
    background: '#1f5f8b', color: '#fff', textDecoration: 'none', boxShadow: '0 2px 8px #0004', opacity: '.92',
  });
  document.body.appendChild(a);
}
