// Yayın derlemesi: kaynak koddan dist/ klasörünü üretir. Kaynak dosyalara dokunmaz.
//   node tools/build.mjs                 → küçültme (yorumlar silinir, yerel adlar kısaltılır)
//   node tools/build.mjs --obfuscate     → küçültme + kod karıştırma (javascript-obfuscator)
//   node tools/build.mjs --with-tests    → tests/ klasörünü de dist/'e koyar (derlenmiş kodun aynen çalıştığını denemek için)
//
// Kurallar:
//  - vendor/ (OCCT/replicad LGPL-2.1, MediaPipe, Three.js) OLDUĞU GİBİ kopyalanır: lisanslar gereği ayrı dosya kalır,
//    karıştırılmaz ve bizim kodumuzla birleştirilmez.
//  - Dosyalar paketlenmez (tek dosyada birleştirilmez); her dosya ayrı küçültülür. Böylece import yolları,
//    ?v= sürüm ekleri ve Web Worker adresleri (new URL('./x.js', import.meta.url)) değişmeden çalışır.
//  - Dışa açılan adlar (export) korunur; yalnız dosya içindeki yerel adlar değişir.
//  - Kaynak haritası (source map) üretilmez.
// Araçlar: esbuild (+ --obfuscate için javascript-obfuscator). Aranma sırası: BUILD_TOOLS ortam değişkeni
// (node_modules klasörü), ./.build-tools/node_modules, normal Node çözümlemesi.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'dist');
const args = new Set(process.argv.slice(2));
const OBF = args.has('--obfuscate'), WITH_TESTS = args.has('--with-tests');

// Yayına girmeyenler: geliştirme/test/sunucu dosyaları ve kullanılmayan ilk sürüm kalıntıları (kaynakta durur, silinmez)
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'dist', 'docs', 'tools', 'supabase', 'reports', '.e2e-libs', '.build-tools', 'tests', 'mobil', 'cikti']);
const SKIP_FILES = new Set(['App.js', 'viewerHtml.js', 'package.json', 'package-lock.json', '.gitignore', 'README.md', 'SECURITY.md', 'TESTLER.md']);

// Karıştırma düzeyi (CI ölçümü: hesap dosyalarında metin dizisi şifreleme CAM testini ~5 kat yavaşlattı, PDF ikili
// metinlerini bozdu). Bu yüzden:
//  - Arayüz dosyaları (LIGHT): adlar anlamsızlaşır + metinler şifreli diziye taşınır.
//  - Hesap / çıktı dosyaları (geri kalan her şey): yalnız adlar anlamsızlaşır, metinler ve akış olduğu gibi kalır
//    (performans ve PDF / DXF / G-kodu çıktıları birebir aynı).
// Akış bozma (control flow flattening) hiçbir dosyada açılmaz: etkileşimi yavaşlatır, koruması sınırlıdır.
const LIGHT = /^(app\.js|[a-z0-9]+-ui\.js|yeni\/.*|acilis\/.*|hesap\/(?!config\.js).*|tx\/app\.js|tx\/(sketch-ui|knit\/chart-ui|woven\/(marker|pattern)-ui)\.js|ayk\/(app|editor|ai)\.js|hand\/(ui|control|pointer)\.js|scan\/scan-ui\.js|photoimport\.js)$/;

function tools() {
  const bases = [process.env.BUILD_TOOLS, path.join(ROOT, '.build-tools', 'node_modules')].filter(Boolean);
  const load = (name) => {
    for (const b of bases) { try { return createRequire(path.join(b, 'x.js'))(name); } catch { /* sıradaki */ } }
    return createRequire(import.meta.url)(name);
  };
  const esbuild = load('esbuild');
  const obf = OBF ? load('javascript-obfuscator') : null;
  return { esbuild, obf };
}

function walk(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name;
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(r) && !(WITH_TESTS && (r === 'tests' || r === 'supabase'))) continue;
      out.push(...walk(path.join(dir, e.name), r));
    } else if (!SKIP_FILES.has(r)) out.push(r);
  }
  return out;
}

async function main() {
  const { esbuild, obf } = tools();
  fs.rmSync(OUT, { recursive: true, force: true });
  let n = 0, before = 0, after = 0;
  for (const rel of walk(ROOT)) {
    const src = path.join(ROOT, rel), dst = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    // hesap/config.js: yalnız herkese açık ayarlar (PAYWALL, Supabase adresi); olduğu gibi kalır, yayında ayar değiştirilebilsin
    const ours = rel.endsWith('.js') && !rel.startsWith('vendor/') && !rel.startsWith('tests/') && rel !== 'hesap/config.js';
    if (!ours) { fs.copyFileSync(src, dst); continue; }
    const code = fs.readFileSync(src, 'utf8');
    let { code: min } = await esbuild.transform(code, {
      loader: 'js', format: 'esm', target: 'es2022', minify: true, legalComments: 'none', charset: 'utf8',
    });
    if (obf) {
      const light = LIGHT.test(rel);
      min = obf.obfuscate(min, {
        target: rel.includes('worker') ? 'browser-no-eval' : 'browser',
        compact: true, sourceMap: false, selfDefending: false, debugProtection: false, disableConsoleOutput: false,
        renameGlobals: false, identifierNamesGenerator: 'hexadecimal', transformObjectKeys: false,
        stringArray: light, stringArrayEncoding: light ? ['base64'] : [], stringArrayThreshold: 0.75,
        stringArrayWrappersCount: 1, splitStrings: false, numbersToExpressions: false, simplify: true,
        controlFlowFlattening: false, deadCodeInjection: false, unicodeEscapeSequence: false,
        reservedStrings: ['^\\./', '^\\.\\./', '\\?v=', 'import\\.meta'],
      }).getObfuscatedCode();
    }
    fs.writeFileSync(dst, min);
    n++; before += code.length; after += min.length;
  }
  // selection.test.mjs app.js'in KAYNAK metnini okur (derlenmiş kodda yorum/ad yok); kaynakta zaten çalışır
  if (WITH_TESTS) fs.rmSync(path.join(OUT, 'tests', 'selection.test.mjs'), { force: true });
  fs.writeFileSync(path.join(OUT, 'BUILD.txt'), `Çizim Atölyesi yayın derlemesi\n${new Date().toISOString()}\nkarıştırma: ${OBF ? 'açık' : 'kapalı'}\n`);
  console.log(`dist/ hazır: ${n} dosya küçültüldü${OBF ? ' ve karıştırıldı' : ''} (${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
