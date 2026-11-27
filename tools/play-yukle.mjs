// İmzalı AAB'yi Google Play'e yükler (Google Play Developer API v3). Dış paket kullanmaz.
// Varsayılan kanal "internal" (dahili test: Google incelemesi yok, dakikalar içinde testçide).
// Kapalı teste / üretime taşıma Play Console'dan elle yapılır (servis hesabının üretim izni yok).
//
// Kullanım: node tools/play-yukle.mjs <dosya.aab> [kanal]
// Ortam:    PLAY_SERVICE_JSON  servis hesabı anahtarı (JSON metni)
//           SURUM_NOTU         isteğe bağlı sürüm notu (Türkçe)
import fs from 'node:fs';
import { erisimAnahtari, istek, API, YUKLE } from './play-api.mjs';

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
  // Uygulama içi güncelleme önceliği (0-5): 4-5 = zorunlu güncelleme (mobil/yerel/Guncelleme.java)
  const oncelik = Math.max(0, Math.min(5, Number(process.env.GUNCELLEME_ONCELIK) || 0));
  await istek(anahtar, 'PUT', `${API}/edits/${edit.id}/tracks/${kanal}`, {
    track: kanal,
    releases: [{ name: process.env.SURUM_ADI || String(paket.versionCode), versionCodes: [String(paket.versionCode)], status: 'completed', inAppUpdatePriority: oncelik,
      releaseNotes: [{ language: 'tr-TR', text: not }] }],
  });
  await istek(anahtar, 'POST', `${API}/edits/${edit.id}:commit`);
  console.log(`tamam: sürüm ${paket.versionCode} → ${kanal} kanalı`);
}

main().catch((e) => { console.error('Play yüklemesi başarısız:', e.message); process.exit(1); });
