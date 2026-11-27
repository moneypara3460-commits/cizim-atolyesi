// Model fotoğrafını yapay zekâyla okuma (sunucu: supabase/functions/ayk-model-oku). İnternet gerekir.
// Sonuç otomatik parça ayarlarına çevrilir; usta isterse değiştirir.
import { MODELS } from './auto.js?v=20261127a';

export const AI_URL = 'https://anqfdlahimxdjovecsyk.supabase.co/functions/v1/ayk-model-oku';
const KEY = 'sb_publishable_urzQtn-1lE1-obSXF_ivQg_wZbQMRDr';   // yayınlanabilir (herkese açık) anahtar
// Yapay zekâ yalnız Google ile giriş yapmış kullanıcıya çalışır (sunucu oturumu doğrular, sınır hesaba göre)
async function headers() {
  let s = null;
  try { s = await (await import('../hesap/session.js')).validSession(); } catch (e) { s = null; }
  if (!s?.access_token) throw new Error('Yapay zekâ için önce Google ile giriş yap (Ana ekran → Giriş)');
  return { 'content-type': 'application/json', apikey: KEY, authorization: 'Bearer ' + s.access_token };
}

export async function readModelPhoto(img) {
  if (typeof img !== 'string' || !img.startsWith('data:image/')) throw new Error('Model resmi yok');
  const h = await headers();
  let r;
  try {
    r = await fetch(AI_URL, { method: 'POST', headers: h, body: JSON.stringify({ image: img }) });
  } catch (e) { throw new Error('İnternet bağlantısı yok ya da sunucuya ulaşılamadı'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || 'Sunucu hatası (' + r.status + ')');
  return j.result;
}

const CONF = { high: 'yüksek', medium: 'orta', low: 'düşük' };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
// Okuma sonucu → { type, params, summary, warnings }. L: kalıp boyu (mm), arka yükseklik orana göre hesaplanır.
export function toAuto(res, L = 260) {
  const type = MODELS[res?.type] ? res.type : '';
  const params = {};
  const put = (k, v, round = 0) => { const n = num(v); if (n !== null) params[k] = round ? Math.round(n) : +n.toFixed(1); };
  if (type) {
    params.cap = res.cap === true;
    if (MODELS[type].lacing) { put('eyelets', res.eyelets, 1); put('throat', res.throat); put('facing', res.facing); }
    else put('throat', res.throat);
    put('qfront', res.qfront);
    if (params.cap) put('capAt', res.capAt);
    const ratio = num(res.backHeightRatio);
    if (ratio !== null) params.backH = Math.round(ratio * L);
  }
  const warnings = [];
  if (!type) warnings.push('Yapay zekâ bu modeli tanıyamadı: listeden tipi kendin seç (bot, makosen, sandalet ve topuklu şablonları da var) ya da parçaları elle çiz.');
  if (res?.view !== 'side') warnings.push('Fotoğraf yandan çekilmemiş görünüyor: çizgi konumları kaba tahmindir. Ayakkabıyı tam yandan çekmek daha iyi sonuç verir.');
  if (res?.confidence === 'low') warnings.push('Yapay zekâ emin değil: sonucu kontrol et.');
  const bits = [type ? MODELS[type].name : 'Tanınmayan model'];
  if (type) { bits.push(params.cap ? 'burun kapaklı' : 'burun kapaksız'); if (MODELS[type].lacing && params.eyelets != null) bits.push(params.eyelets + ' delik'); }
  const summary = `${bits.join(', ')} · güven: ${CONF[res?.confidence] || 'düşük'}${res?.notes ? ' — ' + String(res.notes).slice(0, 160) : ''}`;
  return { type, params, summary, warnings };
}

/* ---------- Modelin bütün parçalarını çıkarma (sunucu: supabase/functions/ayk-parca-cikar) ---------- */
export const PARTS_URL = 'https://anqfdlahimxdjovecsyk.supabase.co/functions/v1/ayk-parca-cikar';
// resmi küçült (uzun kenar en çok max px, jpeg) — sunucuya giden boyut ve süre düşsün
export async function shrink(img, max = 1100) {
  const im = new Image(); im.src = img; await im.decode();
  const s = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const cv = document.createElement('canvas'); cv.width = Math.round(im.naturalWidth * s); cv.height = Math.round(im.naturalHeight * s);
  cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.82);
}
export async function readModelParts(imgs, last) {
  if (!imgs.length) throw new Error('Model resmi yok');
  const images = [];
  for (const i of imgs.slice(0, 6)) images.push(await shrink(i));
  const h = await headers();
  let r;
  try {
    r = await fetch(PARTS_URL, { method: 'POST', headers: h, body: JSON.stringify({ images, last }) });
  } catch (e) { throw new Error('İnternet bağlantısı yok ya da sunucuya ulaşılamadı'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.ok) throw new Error(j.error || 'Sunucu hatası (' + r.status + ')');
  return j.result;
}
