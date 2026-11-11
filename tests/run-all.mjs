// Tek komutla birim + entegrasyon testleri: node tests/run-all.mjs [--coverage] [dosya-filtresi...]
// Her test dosyası ayrı süreçte çalışır; biri çökse bile diğerleri çalışır, sonuç gizlenmez.
// occt.test.mjs gerçek OCCT WASM çekirdeğini yükler (entegrasyon); --no-wasm ile ayrı tutulabilir.
// Çıktı: reports/unit.json (+ --coverage ile reports/coverage.json). Çıkış kodu: başarısız varsa 1.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'reports');
const args = process.argv.slice(2);
const cov = args.includes('--coverage'), noWasm = args.includes('--no-wasm'), onlyWasm = args.includes('--only-wasm');
const filt = args.filter((a) => !a.startsWith('--'));
const WASM = new Set(['occt.test.mjs']);
let files = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort();
if (noWasm) files = files.filter((f) => !WASM.has(f));
if (onlyWasm) files = files.filter((f) => WASM.has(f));
if (filt.length) files = files.filter((f) => filt.some((x) => f.includes(x)));
fs.mkdirSync(OUT, { recursive: true });
const covDir = path.join(OUT, '.v8cov');
if (cov) { fs.rmSync(covDir, { recursive: true, force: true }); fs.mkdirSync(covDir, { recursive: true }); }

const rows = [];
for (const f of files) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, ['--max-old-space-size=4096', path.join('tests', f)], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...(cov ? { NODE_V8_COVERAGE: covDir } : {}) }, timeout: 15 * 60 * 1000, maxBuffer: 64 << 20 });
  const out = (r.stdout || '') + (r.stderr || '');
  const ok = (out.match(/^ok\b/gm) || []).length, fail = (out.match(/^FAIL\b/gm) || []).length;
  const crashed = r.status !== 0 && !fail;
  const status = r.status === 0 && !fail ? 'geçti' : 'başarısız';
  rows.push({ file: f, kind: WASM.has(f) ? 'entegrasyon (gerçek OCCT WASM)' : 'birim / entegrasyon (Node)', status, ok, fail: fail + (crashed ? 1 : 0), ms: Date.now() - t0, exit: r.status, signal: r.signal, fails: out.split('\n').filter((l, i, a) => /^FAIL\b/.test(l) || /^FAIL\b/.test(a[i - 1] || '')).slice(0, 20), tail: status === 'geçti' ? undefined : out.split('\n').slice(-25).join('\n') });
  const row = rows[rows.length - 1];
  console.log(`${status === 'geçti' ? 'ok  ' : 'FAIL'}  ${f.padEnd(24)} ${String(ok).padStart(3)} geçti ${String(row.fail).padStart(2)} başarısız  ${(row.ms / 1000).toFixed(1)} sn${crashed ? '  (süreç çöktü: çıkış ' + r.status + (r.signal ? ' ' + r.signal : '') + ')' : ''}`);
  if (status !== 'geçti') console.log(row.fails.join('\n') || row.tail);
}
const tot = rows.reduce((a, r) => ({ ok: a.ok + r.ok, fail: a.fail + r.fail, ms: a.ms + r.ms }), { ok: 0, fail: 0, ms: 0 });
const summary = { at: new Date().toISOString(), node: process.version, files: rows.length, filesFailed: rows.filter((r) => r.status !== 'geçti').length, tests: tot, rows };

if (cov) {
  // V8 kapsama verisinden satır kapsaması (yaklaşık: blok kapsamı → bayt aralığı → satır)
  const per = {};
  for (const f of fs.readdirSync(covDir)) {
    const j = JSON.parse(fs.readFileSync(path.join(covDir, f), 'utf8'));
    for (const s of j.result) {
      if (!s.url.startsWith('file://')) continue;
      const p = fileURLToPath(s.url); const rel = path.relative(ROOT, p);
      if (rel.startsWith('..') || rel.startsWith('tests') || rel.startsWith('vendor') || rel.startsWith('tools') || rel.includes('node_modules')) continue;
      const src = fs.readFileSync(p, 'utf8');
      const e = per[rel] || (per[rel] = { len: src.length, src, hit: new Uint8Array(src.length), seen: new Uint8Array(src.length) });
      // en dış aralık "çalıştı", iç aralıklar sayı=0 ise "çalışmadı"
      // tek süreç içinde: dış aralık önce, iç aralık (sayı=0) üzerine yazar; süreçler arası: VEYA
      const loc = new Uint8Array(e.len);
      for (const fn of s.functions) for (const r of fn.ranges) { const v = r.count > 0 ? 1 : 0; for (let i = r.startOffset; i < Math.min(r.endOffset, e.len); i++) { e.seen[i] = 1; loc[i] = v; } }
      for (let i = 0; i < e.len; i++) if (loc[i]) e.hit[i] = 1;
    }
  }
  const covRows = [];
  for (const [rel, e] of Object.entries(per)) {
    let lines = 0, hitL = 0, st = 0;
    for (let i = 0; i <= e.len; i++) {
      if (i === e.len || e.src[i] === '\n') {
        const ln = e.src.slice(st, i).trim();
        if (ln && !ln.startsWith('//') && ln !== '}' && ln !== '};') { lines++; let h = false; for (let k = st; k < i; k++) if (e.seen[k] && e.hit[k] && !/\s/.test(e.src[k])) { h = true; break; } if (h) hitL++; }
        st = i + 1;
      }
    }
    covRows.push({ file: rel, lines, covered: hitL, pct: +(100 * hitL / Math.max(1, lines)).toFixed(1) });
  }
  covRows.sort((a, b) => a.pct - b.pct);
  summary.coverage = { note: 'Yalnız Node testlerinin yüklediği modüller (tarayıcı arayüz dosyaları E2E ile sınanır, burada yoktur). Satır kapsaması V8 blok kapsamından yaklaşık hesaplanır.', rows: covRows };
  fs.writeFileSync(path.join(OUT, 'coverage.json'), JSON.stringify(summary.coverage, null, 1));
  console.log('\nSatır kapsaması (Node testleri, yaklaşık):');
  for (const r of covRows) console.log(`  ${r.file.padEnd(18)} ${String(r.pct).padStart(5)} %  (${r.covered}/${r.lines})`);
  fs.rmSync(covDir, { recursive: true, force: true });
}
fs.writeFileSync(path.join(OUT, 'unit.json'), JSON.stringify(summary, null, 1));
console.log(`\nToplam: ${rows.length} dosya · ${tot.ok} geçti · ${tot.fail} başarısız · ${(tot.ms / 1000).toFixed(1)} sn`);
process.exit(summary.filesFailed ? 1 : 0);
