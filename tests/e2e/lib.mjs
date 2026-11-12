// Tarayıcı uçtan uca test altyapısı: yerel statik sunucu + Playwright (Chromium) + küçük test koşucusu.
// - Uygulama dosyaları depodan sunulur (hiçbir dosya değiştirilmez).
// - Üçüncü taraf 3B kütüphaneler (three, three-mesh-bvh, three-bvh-csg) E2E_LIBS klasöründen verilir
//   (CI: npm ile kurulur; yerelde git kopyası). Böylece testler internetsiz ve deterministik çalışır.
//   E2E_LIBS yoksa istekler unpkg'ye gider (internet gerekir).
// - Her test temiz bir tarayıcı bağlamında (boş localStorage) çalışır: kullanıcı projelerine dokunulmaz.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.igs': 'application/octet-stream', '.step': 'application/octet-stream', '.css': 'text/css' };

export function startServer(root = ROOT) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = path.normalize(path.join(root, decodeURIComponent(u.pathname)));
    if (!p.startsWith(root)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); res.end('yok'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((ok) => srv.listen(0, '127.0.0.1', () => ok({ srv, url: 'http://127.0.0.1:' + srv.address().port + '/' })));
}

// unpkg isteğini yerel kütüphane dosyasına çevir
function libFile(libs, url) {
  const m = url.match(/^https:\/\/unpkg\.com\/(three|three-mesh-bvh|three-bvh-csg)@[^/]+\/(.*)$/);
  if (!m) return null;
  const [, pkg, rest] = m, base = path.join(libs, pkg);
  const cands = [];
  // git kopyası (npm paketi değil): build/ eski ya da yok → kaynak (src/) ES modül olarak kullanılır
  const git = fs.existsSync(path.join(base, '.git')) && pkg !== 'three';
  if (git && rest.startsWith('build/')) cands.push(path.join(base, 'src', rest.slice(6).replace(/^index\.module\.js$/, 'index.js')));
  cands.push(path.join(base, rest));
  return cands.find((c) => fs.existsSync(c)) || null;
}

// playwright: önce normal paket (CI: npm install), yoksa PLAYWRIGHT_MODULE yolu (bu geliştirme ortamında genel kurulum)
async function loadPW() {
  try { return await import('playwright'); } catch (e) {
    const { createRequire } = await import('node:module'); const req = createRequire(import.meta.url);
    for (const p of [process.env.PLAYWRIGHT_MODULE, '/opt/npm-tools/node_modules/playwright']) if (p) { try { return req(p); } catch (x) { /* sıradaki */ } }
    throw new Error('playwright bulunamadı: npm install playwright (bkz. TESTLER.md)');
  }
}
export async function launch(opt = {}) {
  const { chromium } = await loadPW();
  const exe = process.env.CHROME || (fs.existsSync('/usr/bin/google-chrome') && !process.env.CI ? '/usr/bin/google-chrome' : undefined);
  return chromium.launch({ executablePath: exe, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=swiftshader', '--ignore-gpu-blocklist'], ...opt });
}

// yeni bağlam + sayfa; konsol hataları ve sayfa hataları toplanır
export async function openApp(browser, baseUrl, view = {}) {
  const ctx = await browser.newContext({ viewport: view.viewport || { width: 1280, height: 860 }, deviceScaleFactor: view.dpr || 1, isMobile: !!view.isMobile, hasTouch: !!view.hasTouch, acceptDownloads: true });
  const libs = process.env.E2E_LIBS;
  const net = { unpkg: 0, local: 0, missing: [] };
  await ctx.route('https://unpkg.com/**', async (route) => {
    if (!libs) { net.unpkg++; return route.continue(); }
    const f = libFile(libs, route.request().url());
    if (!f) { net.missing.push(route.request().url()); return route.fulfill({ status: 404, body: 'yok' }); }
    net.local++;
    return route.fulfill({ status: 200, contentType: 'text/javascript; charset=utf-8', body: fs.readFileSync(f) });
  });
  // güvenlik: uygulama dış siteye istek atmamalı (kütüphaneler vendor/ içinde)
  net.external = [];
  ctx.on('request', (r) => { const u = r.url(); if (/^https?:\/\//.test(u) && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(u)) net.external.push(u); });
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); logs.push(m.type() + ': ' + m.text()); });
  if (view.init) await ctx.addInitScript(view.init);
  await page.goto(baseUrl + (view.path || 'index.html'));
  return { ctx, page, errors, logs, net };
}

// 3B sahne hazır: kanvas var ve "yükleniyor" yazısı kalktı
export async function waitReady(page, timeout = 60000) {
  await page.waitForFunction(() => { const m = document.getElementById('msg'); const c = document.querySelector('#view canvas'); return c && (!m || m.style.display === 'none' || !m.textContent.trim() || getComputedStyle(m).display === 'none'); }, null, { timeout });
  await page.waitForTimeout(300);
}

/* ---- küçük koşucu: geçti / başarısız / atlandı (sebepli) / çalıştırılamadı ---- */
export function createRunner(name) {
  const res = [];
  return {
    res,
    async test(title, fn, meta = {}) {
      const t0 = Date.now();
      if (meta.skip) { res.push({ title, status: 'atlandı', why: meta.skip, ms: 0, area: meta.area }); console.log('SKIP ', title, '—', meta.skip); return; }
      try { await fn(); res.push({ title, status: 'geçti', ms: Date.now() - t0, area: meta.area }); console.log('ok   ', title, `(${Date.now() - t0} ms)`); }
      catch (e) { res.push({ title, status: 'başarısız', error: String(e && e.stack || e).split('\n').slice(0, 4).join(' | '), ms: Date.now() - t0, area: meta.area, shot: e.shot }); console.log('FAIL ', title, '\n     ', String(e && e.message || e).split('\n')[0], (String(e && e.stack).match(/run\.mjs:\d+/) || [''])[0]); }
    },
    blocked(title, why, area) { res.push({ title, status: 'blokeli', why, area }); console.log('BLOK ', title, '—', why); },
    summary() { const c = {}; for (const r of res) c[r.status] = (c[r.status] || 0) + 1; return { name, counts: c, results: res }; },
  };
}
export function expect(cond, msg) { if (!cond) throw new Error(msg); }
