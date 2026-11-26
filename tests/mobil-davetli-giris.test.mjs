// Android giriş ekranı: davetli hesapla (e-posta + şifre) giriş. mobil/kopru.js sahte bir Capacitor ortamında çalıştırılır.
// GEÇİCİ özellik (Google Play inceleme hesabı); kaldırılınca bu test de silinir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const KOD = fs.readFileSync(new URL('../mobil/kopru.js', import.meta.url), 'utf8');
function ortam(cevap) {
  const depo = new Map(), istekler = [], gidilen = [];
  const elemanlar = [];
  const document = {
    readyState: 'complete', documentElement: { appendChild() {} }, head: { appendChild() {} }, body: { appendChild() {} },
    createElement: () => { const e = { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {} }; elemanlar.push(e); return e; },
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
  };
  const window = {
    Capacitor: { isNativePlatform: () => true, Plugins: { Browser: { open() {}, close() {} }, App: { addListener() {} } }, registerPlugin: () => null },
    addEventListener() {},
  };
  const ctx = {
    HTMLAnchorElement: function () {}, FileReader: function () {}, window, document, console, URL, URLSearchParams, Blob, Map, Promise, JSON, Math, Date, Number, String, Error, setTimeout, clearTimeout,
    location: { pathname: '/giris.html', search: '?geri=%2Ftekstil.html', hash: '', origin: 'https://localhost', replace: (u) => gidilen.push(u), href: 'https://localhost/giris.html' },
    localStorage: { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => depo.set(k, String(v)), removeItem: (k) => depo.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {} },
    navigator: { userAgent: 'test' },
    fetch: async (url, opts) => { istekler.push({ url, opts }); return { ok: cevap.status === 200, status: cevap.status, json: async () => cevap.body }; },
  };
  ctx.window = Object.assign(window, ctx);
  vm.createContext(ctx);
  vm.runInContext(KOD, ctx);
  return { m: ctx.window.__mobil, depo, istekler, gidilen };
}

test('doğru şifre: Supabase parola uç noktası çağrılır, oturum yazılır, yalnız uygulama sayfasına dönülür', async () => {
  const o = ortam({ status: 200, body: { access_token: 'A', refresh_token: 'R', expires_at: 2000000000 } });
  assert.equal(typeof o.m.sifreyleGir, 'function');
  await o.m.sifreyleGir('  inceleme@ornek.com ', 'gizli', '/tekstil.html');
  assert.equal(o.istekler.length, 1);
  assert.equal(o.istekler[0].url, 'https://anqfdlahimxdjovecsyk.supabase.co/auth/v1/token?grant_type=password');
  assert.deepEqual(JSON.parse(o.istekler[0].opts.body), { email: 'inceleme@ornek.com', password: 'gizli' });
  assert.ok(o.istekler[0].opts.headers.apikey.startsWith('sb_publishable_'));
  assert.deepEqual(JSON.parse(o.depo.get('cizim:oturum')), { access_token: 'A', refresh_token: 'R', expires_at: 2000000000 });
  assert.deepEqual(o.gidilen, ['/tekstil.html']);
  const p = ortam({ status: 200, body: { access_token: 'A', refresh_token: 'R', expires_in: 3600 } });
  await p.m.sifreyleGir('x@y.z', 's', 'https://kotu.site/');
  assert.deepEqual(p.gidilen, ['/'], 'başka siteye yönlenmez');
});

test('yanlış şifre ve çok deneme: Türkçe hata, oturum yazılmaz, yönlenmez', async () => {
  const o = ortam({ status: 400, body: { error: 'invalid_grant' } });
  await assert.rejects(o.m.sifreyleGir('x@y.z', 'yanlis', '/'), /E-posta ya da şifre yanlış/);
  assert.equal(o.depo.has('cizim:oturum'), false); assert.deepEqual(o.gidilen, []);
  const p = ortam({ status: 429, body: {} });
  await assert.rejects(p.m.sifreyleGir('x@y.z', 's', '/'), /Çok fazla deneme/);
});

test('giriş ekranı: davetli alanları var, Supabase bağlantısına izin verilmiş, Google girişi duruyor', () => {
  const h = fs.readFileSync(new URL('../mobil/sayfalar/giris.html', import.meta.url), 'utf8');
  assert.match(h, /connect-src 'self' https:\/\/anqfdlahimxdjovecsyk\.supabase\.co;/);
  for (const id of ['google', 'd-eposta', 'd-sifre', 'd-gir']) assert.match(h, new RegExp(`id="${id}"`));
  assert.match(h, /type="password"/);
  assert.doesNotMatch(h, /<form/, 'form yok (form-action none)');
});
