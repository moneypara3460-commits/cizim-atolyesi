// Güvenlik politikası (CSP) GERÇEKTEN uygulanırken uçtan uca: node tests/e2e/csp.mjs
// Diğer uçtan uca testler test aracı için CSP'yi atlar (bypassCSP); bu dosya atlamaz. Her sayfada:
//   - politika metinden kod çalıştırmaya ('unsafe-eval') izin vermez ve bu gerçekten engellenir,
//   - 3B çekirdek (OCCT, ayrı işçide) yüklenir ve çalışır,
//   - gerçek MediaPipe el algılama (sahte kamerayla) başlar ve kare işler,
//   - hiçbir politika ihlali (securitypolicyviolation) ve sayfa hatası olmaz.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, createRunner, expect, ROOT } from './lib.mjs';

const only = process.argv.slice(2);
const R = createRunner('e2e-csp');
const { srv, url } = await startServer();
const browser = await launch({ args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const HAS_MP = fs.existsSync(path.join(ROOT, 'vendor/mediapipe-models/hand_landmarker.task')) && fs.existsSync(path.join(ROOT, 'vendor/@mediapipe'));
const PAGES = [['klasik.html', true], ['yeni/index.html', true], ['tekstil.html', false], ['ayakkabi.html', false]];
const libFile = (root, u) => { const m = /^https:\/\/unpkg\.com\/(.+?)(\?.*)?$/.exec(u); if (!m) return null; const f = path.join(root, m[1]); return fs.existsSync(f) ? f : null; };

const poll = async (page, fn, arg, ms, msg) => {   // waitForFunction metinden kod çalıştırır (CSP engeller); yoklama ile bekle
  const t0 = Date.now();
  for (;;) {
    const v = await page.evaluate(fn, arg).catch(() => null);
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error('zaman aşımı: ' + msg);
    await page.waitForTimeout(250);
  }
};

for (const [file, occt] of PAGES) {
  if (only.length && !only.some((o) => file.includes(o))) continue;
  await R.test(`[${file}] CSP uygulanırken: eval engelli, ${occt ? '3B çekirdek (OCCT) çalışır, ' : ''}el algılama başlar, ihlal yok`, async () => {
    const ctx = await browser.newContext({ bypassCSP: false, viewport: { width: 1280, height: 860 } });
    const libs = process.env.E2E_LIBS;
    await ctx.route('https://unpkg.com/**', async (route) => {
      const f = libs && libFile(libs, route.request().url());
      return f ? route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: fs.readFileSync(f) }) : route.continue();
    });
    await ctx.route('**/__csp_eval_deneme.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript',
      body: "try { window.__evalSonuc = new Function('return 7')() === 7 ? 'izinli' : '?'; } catch (e) { window.__evalSonuc = 'engelli'; }" }));
    await ctx.addInitScript(() => {
      try { localStorage.setItem('cizim:guideSeen', '1'); if (!localStorage.getItem('cizim:workspace')) localStorage.setItem('cizim:workspace', 'makine'); } catch (e) { /* */ }
      window.__cspv = [];
      document.addEventListener('securitypolicyviolation', (e) => window.__cspv.push(e.violatedDirective + ' ' + (e.blockedURI || '') + ' ' + (e.sourceFile || '') + ':' + (e.lineNumber || '')));
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy|EvalError|unsafe-eval/i.test(m.text())) errors.push('console: ' + m.text()); });
    try {
      await page.goto(url + file);
      await poll(page, () => document.readyState === 'complete' && !!window.__hand, null, 60000, 'sayfa yüklenmedi');
      if (occt) await poll(page, () => !!(window.__app && document.querySelector('#view canvas')), null, 60000, 'uygulama (3B sahne) açılmadı');
      const csp = await page.evaluate(() => (document.querySelector('meta[http-equiv="Content-Security-Policy"]') || {}).content || '');
      expect(/script-src[^;]*'wasm-unsafe-eval'/.test(csp) && !/'unsafe-eval'/.test(csp), 'politika: ' + csp);
      // Deneme betiği sayfanın kendi kaynağından (aynı adres) yüklenir: tarayıcı ona sayfanın politikasını uygular.
      // (page.evaluate ile çalışan kod politikadan muaftır, onunla denenemez.)
      const ev = await page.evaluate(() => new Promise((res) => {
        const s = document.createElement('script'); s.src = '/__csp_eval_deneme.js';
        s.onload = () => res(window.__evalSonuc || '?'); s.onerror = () => res('yüklenemedi');
        document.head.appendChild(s);
      }));
      expect(ev === 'engelli', 'metinden kod çalıştırma engellenmeli: ' + ev);
      await page.evaluate(() => { window.__cspv = []; });   // yukarıdaki bilerek yapılan deneme ihlali sayılmasın
      if (occt) {
        const r = await page.evaluate(() => new Promise((res) => {
          const w = new Worker(new URL('occt-worker.js', document.baseURI.replace(/yeni\/[^/]*$/, '')), { type: 'module' });
          const to = setTimeout(() => res({ err: 'zaman aşımı' }), 120000);
          w.onmessage = (e) => { clearTimeout(to); w.terminate(); res(e.data); };
          w.onerror = (e) => { clearTimeout(to); res({ err: 'işçi hatası: ' + (e.message || '') }); };
          w.postMessage({ id: 1, op: 'model', args: { descs: [{ type: 'box', w: 20, h: 10, d: 30, x: 0, y: 0, z: 0, op: 'add' }] } });
        }));
        expect(r && r.ok, '3B çekirdek: ' + JSON.stringify(r).slice(0, 200));
      }
      if (HAS_MP) {
        await page.evaluate(() => { window.__hand.start(); });
        const s = await poll(page, () => { const h = window.__hand; return (h.track === 'on' && h.fps >= 1) || h.cam === 'error' || h.track === 'error' ? { track: h.track, cam: h.cam, err: h.error, fps: h.fps, d: h.delegate } : null; }, null, 180000, 'el algılama başlamadı');
        expect(s.track === 'on', 'el algılama: ' + JSON.stringify(s));
        await page.evaluate(() => window.__hand.stop());
      }
      const v = await page.evaluate(() => window.__cspv);
      expect(!v.length, 'politika ihlali: ' + v.join(' | '));
      expect(!errors.length, 'sayfa hatası: ' + errors.slice(0, 3).join(' | '));
    } finally { await ctx.close(); }
  }, { area: 'CSP' });
}

await browser.close(); srv.close();
const sum = R.summary();
fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'reports', 'e2e-csp.json'), JSON.stringify(sum, null, 2));
console.log('\nÖzet:', JSON.stringify(sum.counts));
process.exit(sum.counts['başarısız'] ? 1 : 0);
