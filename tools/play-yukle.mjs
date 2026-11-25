// İmzalı AAB'yi Google Play'e yükler (Google Play Developer API v3). Dış paket kullanmaz.
// Varsayılan kanal "internal" (dahili test: Google incelemesi yok, dakikalar içinde testçide).
// Kapalı teste / üretime taşıma Play Console'dan elle yapılır (servis hesabının üretim izni yok).
//
// Kullanım: node tools/play-yukle.mjs <dosya.aab> [kanal]
// Ortam:    PLAY_SERVICE_JSON  servis hesabı anahtarı (JSON metni)
//           SURUM_NOTU         isteğe bağlı sürüm notu (Türkçe)
import fs from 'node:fs';
import crypto from 'node:crypto';

const PAKET = 'com.cizimatolyesi.app';
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + PAKET;
const YUKLE = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/' + PAKET;

const b64url = (b) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function erisimAnahtari(sa) {
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

async function istek(anahtar, yontem, url, govde, tur = 'application/json') {
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

async function main() {
  const [dosya, kanal = 'internal'] = process.argv.slice(2);
  if (!dosya || !fs.existsSync(dosya)) throw new Error('AAB dosyası yok: ' + dosya);
  if (!['internal', 'alpha'].includes(kanal)) throw new Error('Yalnız test kanalları: internal | alpha');
  const ham = process.env.PLAY_SERVICE_JSON;
  if (!ham) throw new Error('PLAY_SERVICE_JSON ortam değişkeni yok');
  const sa = JSON.parse(ham);

  const anahtar = await erisimAnahtari(sa);
  const edit = await istek(anahtar, 'POST', API + '/edits', {});
  console.log('düzenleme açıldı:', edit.id);
  const paket = await istek(anahtar, 'POST', `${YUKLE}/edits/${edit.id}/bundles?uploadType=media`, fs.readFileSync(dosya), 'application/octet-stream');
  console.log('paket yüklendi: sürüm kodu', paket.versionCode);
  const not = (process.env.SURUM_NOTU || 'Yeni sürüm').trim().slice(0, 480);
  await istek(anahtar, 'PUT', `${API}/edits/${edit.id}/tracks/${kanal}`, {
    track: kanal,
    releases: [{ name: process.env.SURUM_ADI || String(paket.versionCode), versionCodes: [String(paket.versionCode)], status: 'completed',
      releaseNotes: [{ language: 'tr-TR', text: not }] }],
  });
  await istek(anahtar, 'POST', `${API}/edits/${edit.id}:commit`);
  console.log(`tamam: sürüm ${paket.versionCode} → ${kanal} kanalı`);
}

main().catch((e) => { console.error('Play yüklemesi başarısız:', e.message); process.exit(1); });
