// Android paketini hazırlar. GitHub Actions'taki "Android" iş akışı çalıştırır (bilgisayar gerekmez).
//   node mobil/hazirla.mjs web      → dist/ (karıştırılmış yayın kopyası) → mobil/www, her sayfaya kopru.js eklenir
//   node mobil/hazirla.mjs android  → "npx cap add android" sonrası Android projesine kamera izni, giriş dönüş
//                                     adresi, sürüm numarası, simgeler ve açılış rengi işlenir
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBIL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(MOBIL, '..');
const WWW = path.join(MOBIL, 'www');
const AND = path.join(MOBIL, 'android');
const SCHEME = 'com.cizimatolyesi.app';
const BG = '#0a1120';

function kopyala(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) kopyala(s, d); else fs.copyFileSync(s, d);
  }
}
function htmller(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) htmller(p, out); else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
function degistir(file, eski, yeni) {
  const s = fs.readFileSync(file, 'utf8');
  if (!s.includes(eski)) throw new Error(`${path.relative(MOBIL, file)}: "${eski.slice(0, 60)}" bulunamadı`);
  fs.writeFileSync(file, s.replace(eski, yeni));
}

function web() {
  const dist = path.join(ROOT, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Önce yayın derlemesi: node tools/build.mjs --obfuscate');
  fs.rmSync(WWW, { recursive: true, force: true });
  kopyala(dist, WWW);
  for (const d of ['tests', 'supabase', 'reports']) fs.rmSync(path.join(WWW, d), { recursive: true, force: true });
  fs.copyFileSync(path.join(MOBIL, 'kopru.js'), path.join(WWW, 'kopru.js'));
  kopyala(path.join(MOBIL, 'sayfalar'), WWW);   // yalnız uygulamada olan sayfalar (giriş ekranı)
  let n = 0;
  for (const f of htmller(WWW)) {
    const s = fs.readFileSync(f, 'utf8');
    if (!/<head>/i.test(s)) continue;
    // Uygulamanın kendi kodundan ÖNCE çalışmalı (indirme ve girişi yakalar); CSP script-src 'self' buna izin verir
    let t = s.replace(/<head>/i, '<head>\n<script src="/kopru.js"></script>');
    // Makine (yeni arayüz) üst çubuğu güvenli alanı hesaba katmıyor: uygulamada içerik durum çubuğunun altına girmesin
    if (path.relative(WWW, f) === path.join('yeni', 'index.html')) t = t.replace(', viewport-fit=cover', '');
    fs.writeFileSync(f, t);
    n++;
  }
  console.log(`www hazır: ${n} sayfaya köprü eklendi`);
}

function android() {
  const man = path.join(AND, 'app/src/main/AndroidManifest.xml');
  // Kamera (el ile kontrol, tarama, fotoğraftan model)
  degistir(man, '<uses-permission android:name="android.permission.INTERNET" />',
    '<uses-permission android:name="android.permission.INTERNET" />\n    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />');
  // Google girişinden dönüş: com.cizimatolyesi.app://giris
  const s = fs.readFileSync(man, 'utf8');
  const i = s.indexOf('</intent-filter>');
  if (i < 0) throw new Error('AndroidManifest: intent-filter yok');
  const ek = `</intent-filter>
            <intent-filter android:autoVerify="false">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${SCHEME}" android:host="giris" />
            </intent-filter>`;
  fs.writeFileSync(man, s.slice(0, i) + ek + s.slice(i + '</intent-filter>'.length));

  // Sesli komut: yerel ses tanıma eklentisi (WebView'da SpeechRecognition yok). Ses tanıma ekranını açabilmek için
  // Android 11+ paket görünürlüğü bildirimi; mikrofonu ses tanıma uygulaması kullanır, bizim izin istememiz gerekmez.
  const ms = fs.readFileSync(man, 'utf8');
  if (!ms.includes('</application>')) throw new Error('AndroidManifest: </application> yok');
  fs.writeFileSync(man, ms.replace('</application>',
    '</application>\n    <queries>\n        <intent>\n            <action android:name="android.speech.action.RECOGNIZE_SPEECH" />\n        </intent>\n    </queries>'));
  const pkt = path.join(AND, 'app/src/main/java/com/cizimatolyesi/app');
  fs.copyFileSync(path.join(MOBIL, 'yerel/SesTanima.java'), path.join(pkt, 'SesTanima.java'));
  const ma = path.join(pkt, 'MainActivity.java');
  const mk = fs.readFileSync(ma, 'utf8');
  const kalip = /public class MainActivity extends BridgeActivity\s*\{\s*\}/;
  if (!kalip.test(mk)) throw new Error('MainActivity beklenen biçimde değil');
  fs.writeFileSync(ma, mk.replace('import com.getcapacitor.BridgeActivity;', 'import android.os.Bundle;\nimport com.getcapacitor.BridgeActivity;')
    .replace(kalip, `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SesTanima.class);   // yerel eklentiler super.onCreate'ten önce kaydedilir
        super.onCreate(savedInstanceState);
    }
}`));

  // Sürüm: versionCode = GitHub çalıştırma numarası (her paket bir öncekinden büyük olmalı)
  const gradle = path.join(AND, 'app/build.gradle');
  const kod = Number(process.env.SURUM_KODU || 1), ad = process.env.SURUM_ADI || '1.0.0';
  let g = fs.readFileSync(gradle, 'utf8');
  g = g.replace(/versionCode\s+\d+/, `versionCode ${kod}`).replace(/versionName\s+"[^"]*"/, `versionName "${ad}"`);
  fs.writeFileSync(gradle, g);

  // Simgeler (mobil/ikon → res) ve açılış ekranı rengi (Capacitor logosu yerine düz uygulama rengi)
  const res = path.join(AND, 'app/src/main/res');
  kopyala(path.join(MOBIL, 'ikon'), res);
  fs.writeFileSync(path.join(res, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n    <color name="cizim_acilis">${BG}</color>\n</resources>\n`);
  const st = path.join(res, 'values/styles.xml');
  const sx = fs.readFileSync(st, 'utf8');
  fs.writeFileSync(st, sx.replace(/@drawable\/splash/g, '@color/cizim_acilis'));
  console.log(`android hazır: sürüm ${ad} (${kod})`);
}

const is = process.argv[2];
if (is === 'web') web();
else if (is === 'android') android();
else { console.error('kullanım: node mobil/hazirla.mjs web|android'); process.exit(1); }
