// Supabase oturumu (Google ile giriş) ve sunucu çağrıları. Dış kütüphane yok; fetch ile REST.
import { SUPABASE_URL as U, SUPABASE_KEY as K, OFFLINE_DAYS } from './config.js';
import { computeAccess, cacheAllows } from './access.js';

const SK = 'cizim:oturum', AK = 'cizim:erisim';
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* gizli sekme */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* yok */ } },
};

export const loginUrl = (returnTo) =>
  `${U}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(returnTo)}`;

// Google girişinden dönüşte adres çubuğundaki #access_token=… bilgisini alır ve adresi temizler.
export function takeSessionFromHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const err = h.get('error_description') || h.get('error');
  if (!h.get('access_token')) return err ? { error: err } : null;
  const s = {
    access_token: h.get('access_token'),
    refresh_token: h.get('refresh_token'),
    expires_at: Number(h.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(h.get('expires_in') || 3600),
  };
  store.set(SK, s);
  history.replaceState(null, '', location.pathname + location.search);
  return s;
}

export const getSession = () => store.get(SK);

async function refresh(s) {
  const r = await fetch(`${U}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: K, 'content-type': 'application/json' },
    body: JSON.stringify({ refresh_token: s.refresh_token }),
  });
  if (!r.ok) {
    if (r.status >= 400 && r.status < 500) store.del(SK);   // yenileme anahtarı geçersiz: yeniden giriş
    throw Object.assign(new Error('Oturum yenilenemedi'), { code: r.status < 500 ? 'auth' : 'net' });
  }
  const j = await r.json();
  const n = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600) };
  store.set(SK, n);
  return n;
}

export async function validSession() {
  let s = getSession();
  if (!s || !s.access_token) return null;
  if (s.expires_at - 60 < Date.now() / 1000) s = await refresh(s);
  return s;
}

async function call(path, opts = {}) {
  const s = await validSession();
  if (!s) throw Object.assign(new Error('Giriş gerekli'), { code: 'auth' });
  const r = await fetch(U + path, {
    ...opts,
    headers: { apikey: K, authorization: 'Bearer ' + s.access_token, 'content-type': 'application/json', ...(opts.headers || {}) },
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || j.msg || j.message || 'Sunucu hatası (' + r.status + ')'), { status: r.status, code: r.status === 401 ? 'auth' : 'srv' });
  return j;
}

export const getUser = () => call('/auth/v1/user');

export async function fetchAccess() {
  const a = await call('/rest/v1/rpc/my_access', { method: 'POST', body: '{}' });
  const acc = computeAccess(a);
  store.set(AK, { until: acc.until, trialEnd: acc.trialEnd, checkedAt: Date.now() });
  return acc;
}

export const cachedAccess = () => store.get(AK);
export const allowedOffline = (bolum) => cacheAllows(cachedAccess(), bolum, Date.now(), OFFLINE_DAYS);

export const verifyPurchase = (productId, purchaseToken) =>
  call('/functions/v1/play-verify', { method: 'POST', body: JSON.stringify({ productId, purchaseToken }) });

export function logout() {
  const s = getSession();
  store.del(SK); store.del(AK);
  if (s) fetch(`${U}/auth/v1/logout`, { method: 'POST', headers: { apikey: K, authorization: 'Bearer ' + s.access_token } }).catch(() => {});
}
