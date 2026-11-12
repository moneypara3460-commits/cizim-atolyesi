// Kullanım: node tools/vendor-check.mjs <npm node_modules klasörü>
// vendor/ altındaki üçüncü taraf dosyaları npm paketindeki aynı dosyalarla bayt bayt karşılaştırır.
// Ayrıca npm kopyalarını /tmp/vendor-out/ altına (vendor/ düzeninde) yazar: ilk kurulum ve güncelleme için.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NM = process.argv[2]; if (!NM) { console.error('npm node_modules klasörü gerekli'); process.exit(2); }
export const FILES = [
  ['three', '0.160.0', ['build/three.module.js', 'examples/jsm/controls/OrbitControls.js', 'examples/jsm/geometries/ConvexGeometry.js', 'examples/jsm/math/ConvexHull.js', 'examples/jsm/geometries/RoundedBoxGeometry.js', 'examples/jsm/utils/BufferGeometryUtils.js', 'LICENSE']],
  ['three-mesh-bvh', '0.6.0', ['build/index.module.js', 'LICENSE']],
  ['three-bvh-csg', '0.0.7', ['build/index.module.js', 'LICENSE']],
];
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
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
      const b64 = src.toString('base64'); console.log(`@@BEGIN ${pkg}@${ver}/${f}`); for (let i = 0; i < b64.length; i += 8000) console.log('@@' + b64.slice(i, i + 8000)); console.log(`@@END ${pkg}@${ver}/${f}`);
      continue;
    }
    const a = sha(fs.readFileSync(mine)), b = sha(src);
    if (a !== b) { console.log(`FAIL vendor/${pkg}@${ver}/${f}: sha256 ${a.slice(0, 16)}… ≠ npm ${b.slice(0, 16)}…`); bad++; }
    else console.log(`ok   vendor/${pkg}@${ver}/${f}  sha256 ${a}`);
  }
}
console.log(bad ? `\n${bad} dosya npm paketinden farklı` : missing ? `\n${missing} dosya vendor/ içinde yok` : '\nBütün kopyalar npm paketleriyle aynı');
process.exitCode = bad || missing ? 1 : 0;   // exit() değil: yönlendirilmiş çıktı yarıda kesilmesin
