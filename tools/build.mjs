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
const SKIP_DIRS = new Set(['.git', '.github', 'node_modules', 'dist', 'docs', 'tools', 'supabase', 'reports', '.e2e-libs', '.build-tools', 'tests']);
const SKIP_FILES = new Set(['App.js', 'viewerHtml.js', 'package.json', 'package-lock.json', '.gitignore', 'README.md', 'SECURITY.md', 'TESTLER.md']);

// Ağır hesap dosyaları: karıştırmada akış bozma kapalı (performans korunur), yalnız ad/metin gizleme
const HEAVY = /^(cam5?|cam5-worker|coll5|post5|lathe|fea2?|fea-worker|fem-worker|fem-run|cutopt|photo2d|occt|occt-ops|occt-worker|export3d|weight|mfgcheck|sketch|cad2d|cad2d-geom|kin|mech|welds|scan\/.*|tx\/sim3d\/.*|tx\/woven\/(marker|pattern|grade)|ayk\/(last|geom|auto|build|match)|hand\/tracker)\.js$/;

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
      const heavy = HEAVY.test(rel);
      min = obf.obfuscate(min, {
        target: rel.includes('worker') ? 'browser-no-eval' : 'browser',
        compact: true, sourceMap: false, selfDefending: false, debugProtection: false, disableConsoleOutput: false,
        renameGlobals: false, identifierNamesGenerator: 'hexadecimal', transformObjectKeys: false,
        stringArray: true, stringArrayEncoding: ['base64'], stringArrayThreshold: heavy ? 0.5 : 0.8,
        stringArrayWrappersCount: 1, splitStrings: false, numbersToExpressions: false, simplify: true,
        controlFlowFlattening: !heavy, controlFlowFlatteningThreshold: 0.25, deadCodeInjection: false,
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
