# Testler

Kalite raporu (özellik durumu, doğrulama toleransları, performans, hatalar): [docs/KALITE-RAPORU.md](docs/KALITE-RAPORU.md)

## Tek komut

| Komut | Ne yapar | Süre (geliştirme sunucusu) |
|---|---|---|
| `npm test` | Bütün Node birim / entegrasyon testleri (gerçek OCCT WASM hariç) | ~2 dk |
| `npm run test:wasm` | Gerçek Open CASCADE WebAssembly çekirdeğiyle B-Rep testleri | ~5 sn |
| `npm run test:unit` | İkisi birlikte | ~2 dk |
| `npm run test:coverage` | Birlikte + satır kapsaması (`reports/coverage.json`); kapsama ölçümü testleri 3–6 kat yavaşlatır | ~5 dk |
| `npm run test:e2e` | Gerçek uygulamayı Chromium'da açıp kullanıcı gibi kullanan uçtan uca senaryolar | ~7 dk |
| `npm run test:perf` | Ağır hesapların süre / bellek ölçümü (eşik yok, bilgi amaçlı) | ~30 sn |
| `npm run test:all` | Birim + E2E | ~9 dk |

`npm` yoksa aynı komutlar doğrudan: `node tests/run-all.mjs`, `node tests/e2e/run.mjs`, `node --expose-gc tests/perf.mjs`.
Tek dosya: `node tests/cam5.test.mjs`. Filtre: `node tests/run-all.mjs fea cam` · `node tests/e2e/run.mjs B C` (senaryo harfi).

Çıkış kodu: herhangi bir test başarısızsa **1**. Atlanan / blokeli testler başarı sayılmaz, raporda ayrı sayılır.

## Gereken

- Node 20 veya üstü (testler Node 22 ile çalıştırıldı).
- E2E için: Playwright + Chromium ve uygulamanın kullandığı üç 3B kütüphanenin yerel kopyası:

```bash
mkdir -p .e2e-libs && cd .e2e-libs && echo '{"name":"e2e-libs","private":true}' > package.json
npm install --legacy-peer-deps three@0.160.0 three-mesh-bvh@0.6.0 three-bvh-csg@0.0.7 playwright
npx playwright install chromium
cd .. && E2E_LIBS=$PWD/.e2e-libs/node_modules PLAYWRIGHT_MODULE=$PWD/.e2e-libs/node_modules/playwright node tests/e2e/run.mjs
```

`E2E_LIBS` verilmezse sayfa kütüphaneleri internetten (unpkg) yükler. Yerel kopya, testleri internetten bağımsız ve tekrarlanabilir yapar; sürümler `index.html` içindeki importmap ile aynıdır.

## Katmanlar

| Katman | Dosyalar | Ne sınanır |
|---|---|---|
| Birim | `tests/*.test.mjs` | Saf hesap modülleri: 2B geometri, DXF, sac açınım, ağırlık, kesim optimizasyonu, kaynak, maliyet, montaj, CAM (3 / 4 / 5 eksen), kinematik, son işlemciler, FEM |
| Entegrasyon | `occt.test.mjs` (gerçek WASM), `selection.test.mjs` (uygulama kodundan çıkarılan gerçek işleyiciler), `cam5.test.mjs` (plan → çarpışma → simülasyon → G-kodu → geri ayrıştırma), `fea2.test.mjs` (ağ → çözücü → sonuç) | Modüllerin birlikte çalışması |
| Uçtan uca | `tests/e2e/run.mjs` (+ `lib.mjs`) | Gerçek sayfa: dokunma / tıklama, dosya indirme, dosya seçici, yenileme, kayıt / açma |
| Regresyon | `robust.test.mjs` ve diğer dosyalardaki "Hata (düzeltildi)" testleri | Daha önce bulunan hataların geri gelmemesi |
| Performans | `tests/perf.mjs`, E2E'deki ⏱ ölçümleri | Süre ve bellek (eşik yok) |
| Sağlamlık | `robust.test.mjs`, E2E "Sağlamlık", bozuk DXF / STEP senaryoları | Bozuk dosya, NaN / Infinity, aşırı büyük girdi, bozuk kayıt |

## Kurallar

- Testler kullanıcı projelerine dokunmaz: E2E her senaryoda **boş, yeni bir tarayıcı profili** açar (telefondaki / tarayıcıdaki kayıtlar okunmaz, yazılmaz). Node testleri dosya sistemine yalnızca `reports/` klasörüne yazar.
- Örnek veriler deterministiktir (sabit ölçüler, rastgele sayı yok). Aynı girdi aynı sonucu verir; bu ayrıca test edilir.
- Uygulanmamış özellik için sahte başarılı test yazılmaz: **blokeli** olarak raporlanır (ör. CNC torna).
- E2E'deki telefon / tablet / masaüstü ölçüleri **emülasyondur** (Chromium cihaz öykünmesi, yazılımsal WebGL). Gerçek telefon testi değildir; gerçek cihaz davranışı (GPU, bellek sınırı, dokunma hassasiyeti, Safari) ayrıca denenmelidir.
- CNC son işlemci varsayımları `docs/cnc5-ornekler/` ve README'deki "4 / 5 eksen CNC" bölümündedir; G-kodu testleri bu varsayımlara göre yazılmıştır, gerçek tezgâhta kuru çalıştırma (havada) yerine geçmez.

## Çıktılar

`reports/` (git'e girmez): `unit.json`, `coverage.json`, `e2e.json` (her senaryo: durum, süre, hata, ekran görüntüsü yolu, ⏱ ölçümler, ortam), `perf.json`, `shots/*.png` (başarısız E2E senaryolarının ekran görüntüsü).

## Sürekli entegrasyon

`.github/workflows/ci.yml` — her push ve PR'da üç ayrı iş:

1. **Birim ve entegrasyon (Node, WASM hariç) + kapsama**
2. **Gerçek OCCT WebAssembly entegrasyonu** (ayrı iş; ayrıca performans ölçümü)
3. **Tarayıcı uçtan uca** (Chromium, emülasyon)

Hiçbir adımda `continue-on-error` yoktur; bir test başarısızsa iş kırmızı olur. Raporlar, günlükler ve ekran görüntüleri başarısız olsa da yüklenir (Actions → çalıştırma → Artifacts).
