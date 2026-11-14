// Model fotoğrafını yapay zekâyla okuma (sunucu: supabase/functions/ayk-model-oku). İnternet gerekir.
// Sonuç otomatik parça ayarlarına çevrilir; usta isterse değiştirir.
import { MODELS } from './auto.js?v=20261114u';

export const AI_URL = 'https://anqfdlahimxdjovecsyk.supabase.co/functions/v1/ayk-model-oku';
const KEY = 'sb_publishable_urzQtn-1lE1-obSXF_ivQg_wZbQMRDr';   // yayınlanabilir (herkese açık) anahtar

export async function readModelPhoto(img) {
  if (typeof img !== 'string' || !img.startsWith('data:image/')) throw new Error('Model resmi yok');
  let r;
  try {
    r = await fetch(AI_URL, { method: 'POST', headers: { 'content-type': 'application/json', apikey: KEY }, body: JSON.stringify({ image: img }) });
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
  if (!type) warnings.push('Bu model için hazır şablon yok (bot, sandalet, topuklu vb.): parçaları elle çiz ya da en yakın tipi seç.');
  if (res?.view !== 'side') warnings.push('Fotoğraf yandan çekilmemiş görünüyor: çizgi konumları kaba tahmindir. Ayakkabıyı tam yandan çekmek daha iyi sonuç verir.');
  if (res?.confidence === 'low') warnings.push('Yapay zekâ emin değil: sonucu kontrol et.');
  const bits = [type ? MODELS[type].name : 'Tanınmayan model'];
  if (type) { bits.push(params.cap ? 'burun kapaklı' : 'burun kapaksız'); if (MODELS[type].lacing && params.eyelets != null) bits.push(params.eyelets + ' delik'); }
  const summary = `${bits.join(', ')} · güven: ${CONF[res?.confidence] || 'düşük'}${res?.notes ? ' — ' + String(res.notes).slice(0, 160) : ''}`;
  return { type, params, summary, warnings };
}
