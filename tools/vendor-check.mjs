// Kullanım: node tools/vendor-check.mjs <npm node_modules klasörü> [indirilen model klasörü]
// vendor/ altındaki üçüncü taraf dosyaları npm paketindeki aynı dosyalarla bayt bayt karşılaştırır.
// Ayrıca npm kopyalarını /tmp/vendor-out/ altına (vendor/ düzeninde) yazar: ilk kurulum ve güncelleme için.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = process.argv[2]; if (!NM) { console.error('npm node_modules klasörü gerekli'); process.exit(2); }
export const FILES = [
  ['three', '0.160.0', ['build/three.module.js', 'examples/jsm/controls/OrbitControls.js', 'examples/jsm/geometries/ConvexGeometry.js', 'examples/jsm/math/ConvexHull.js', 'examples/jsm/geometries/RoundedBoxGeometry.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'LICENSE']],
  ['three-mesh-bvh', '0.6.0', ['build/index.module.js', 'LICENSE']],
  ['three-bvh-csg', '0.0.7', ['build/index.module.js', 'LICENSE']],
  // Parmakla kontrol: MediaPipe Hand Landmarker (tarayıcıda WebAssembly). Yalnız SIMD'li derleme alınır.
  ['@mediapipe/tasks-vision', '0.10.33', ['vision_bundle.mjs', 'wasm/vision_wasm_internal.js', 'wasm/vision_wasm_internal.wasm']],
];
// npm paketi olmayan dosyalar (model): <2. argüman klasörü>/<ad> olarak indirilmiş kopya, sabitlenmiş sha256 ile karşılaştırılır.
// sha256 null ise henüz sabitlenmemiştir (ilk kurulum): değer günlüğe yazılır, iş kırmızı olur.
export const MODELS = [
  ['mediapipe-models/hand_landmarker.task', 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', null],
];
const DL = process.argv[3];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
// ilk kurulumda dosyayı günlüğe yaz: küçükler base64, büyükler (> 512 kB) gzip + base64 (@@BEGIN-GZ)
function dump(name, src) {
  const gz = src.length > 512 * 1024, b64 = (gz ? zlib.gzipSync(src, { level: 9 }) : src).toString('base64'), tag = gz ? 'BEGIN-GZ' : 'BEGIN';
  console.log(`@@${tag} ${name}`); for (let i = 0; i < b64.length; i += 8000) console.log('@@' + b64.slice(i, i + 8000)); console.log(`@@END ${name}`);
}
let bad = 0, missing = 0;
for (const [pkg, ver, files] of FILES) {
  const pj = JSON.parse(fs.readFileSync(path.join(NM, pkg, 'package.json'), 'utf8'));
  if (pj.version !== ver) { console.log(`FAIL ${pkg}: npm sürümü ${pj.version}, beklenen ${ver}`); bad++; continue; }
  for (const f of files) {
    const src = fs.readFileSync(path.join(NM, pkg, f));
    const out = path.join('/tmp/vendor-out', `${pkg}@${ver}`, f); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, src);
    const mine = path.join(ROOT, 'vendor', `${pkg}@${ver}`, f);
    if (!fs.existsSync(mine)) {
      // ilk kurulum: dosya günlüğe base64 olarak yazılır (sha256 ile), oradan depoya alınır ve bu iş yeniden karşılaştırır
      console.log(`yok  vendor/${pkg}@${ver}/${f}  sha256 ${sha(src)}  bayt ${src.length}`); missing++;
      dump(`${pkg}@${ver}/${f}`, src);
      continue;
    }
    const a = sha(fs.readFileSync(mine)), b = sha(src);
    if (a !== b) { console.log(`FAIL vendor/${pkg}@${ver}/${f}: sha256 ${a.slice(0, 16)}… ≠ npm ${b.slice(0, 16)}…`); bad++; }
    else console.log(`ok   vendor/${pkg}@${ver}/${f}  sha256 ${a}`);
  }
}
for (const [rel, url, pin] of MODELS) {
  const mine = path.join(ROOT, 'vendor', rel), dl = DL ? path.join(DL, path.basename(rel)) : null;
  const got = dl && fs.existsSync(dl) ? fs.readFileSync(dl) : null;
  if (got) { const out = path.join('/tmp/vendor-out', rel); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, got); }
  if (!fs.existsSync(mine)) { console.log(`yok  vendor/${rel}` + (got ? `  sha256 ${sha(got)}  bayt ${got.length}  (${url})` : '  (indirilen kopya da yok)')); if (got) dump(rel, got); missing++; continue; }
  const a = sha(fs.readFileSync(mine));
  if (!pin) { console.log(`FAIL vendor/${rel}: sha256 sabitlenmemiş (${a})`); bad++; continue; }
  if (a !== pin) { console.log(`FAIL vendor/${rel}: sha256 ${a.slice(0, 16)}… ≠ sabit ${pin.slice(0, 16)}…`); bad++; continue; }
  if (got && sha(got) !== pin) { console.log(`FAIL ${url}: indirilen dosya sabit sha256 ile aynı değil (${sha(got).slice(0, 16)}…)`); bad++; continue; }
  console.log(`ok   vendor/${rel}  sha256 ${a}` + (got ? '' : '  (yalnız sabit değerle karşılaştırıldı; indirilen kopya verilmedi)'));
}
console.log(bad ? `\n${bad} dosya npm paketinden farklı` : missing ? `\n${missing} dosya vendor/ içinde yok` : '\nBütün kopyalar npm paketleriyle aynı');
process.exitCode = bad || missing ? 1 : 0;   // exit() değil: yönlendirilmiş çıktı yarıda kesilmesin
