// Google Play Developer API v3 ortak yardımcıları (dış paket yok): servis hesabıyla giriş ve istek.
import crypto from 'node:crypto';

export const PAKET = 'com.cizimatolyesi.app';
export const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PAKET;
export const YUKLE = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PAKET;

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export async function erisimAnahtari(sa) {
  const simdi = Math.floor(Date.now() / 1000);
  const bas = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const govde = b64url(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token', iat: simdi, exp: simdi + 3600,
  }));
  const imza = b64url(crypto.sign('RSA-SHA256', Buffer.from(bas + '.' + govde), sa.private_key));
  const r = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: bas + '.' + govde + '.' + imza }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('Google girişi başarısız: ' + (j.error_description || j.error || r.status));
  return j.access_token;
}

export async function istek(anahtar, yontem, url, govde, tur = 'application/json') {
  const r = await fetch(url, {
    method: yontem,
    headers: { Authorization: 'Bearer ' + anahtar, ...(govde ? { 'Content-Type': tur } : {}) },
    body: govde ? (tur === 'application/json' ? JSON.stringify(govde) : govde) : undefined,
  });
  const metin = await r.text();
  let j = null; try { j = metin ? JSON.parse(metin) : {}; } catch { j = { ham: metin }; }
  if (!r.ok) throw new Error(`${yontem} ${url.replace(/\?.*/, '')} → ${r.status}: ${(j.error && j.error.message) || metin.slice(0, 300)}`);
  return j;
}
