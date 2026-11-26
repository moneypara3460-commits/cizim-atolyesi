// Android Google girişi PKCE ile: dönüş adresine oturum anahtarı değil tek kullanımlık kod gelir; kod yalnız uygulamanın
// sakladığı doğrulayıcıyla anahtara çevrilir. mobil/kopru.js sahte bir Capacitor ortamında çalıştırılır.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createHash, webcrypto } from 'node:crypto';

// Yayın derlemesinde (dist) mobil/ klasörü yoktur: orada test atlanır.
const YOL = new URL('../mobil/kopru.js', import.meta.url);
if (!fs.existsSync(YOL)) { console.log('atlandı: mobil/ bu ağaçta yok'); process.exit(0); }
const KOD = fs.readFileSync(YOL, 'utf8');
const DONUS = 'com.cizimatolyesi.app://giris';

function ortam(cevap) {
  const depo = new Map(), istekler = [], gidilen = [], acilan = [], bildirim = [];
  const document = {
    readyState: 'complete', documentElement: { appendChild() {} }, head: { appendChild() {} }, body: { appendChild() {} },
    createElement: () => { const e = { style: {}, setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {} }; Object.defineProperty(e, 'textContent', { set: (t) => bildirim.push(t) }); return e; },
    addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
  };
  const window = {
    Capacitor: { isNativePlatform: () => true, Plugins: { Browser: { open: (o) => { acilan.push(o.url); return Promise.resolve(); }, close() {} }, App: { addListener() {} } }, registerPlugin: () => null },
    addEventListener() {},
  };
  const ctx = {
    HTMLAnchorElement: function () {}, FileReader: function () {}, window, document, console, URL, URLSearchParams, Blob, Map, Promise, JSON, Math, Date, Number, String, Error, Uint8Array, setTimeout, clearTimeout,
    crypto: webcrypto, TextEncoder, btoa,
    location: { pathname: '/giris.html', search: '?geri=%2Ftekstil.html', hash: '', origin: 'https://localhost', replace: (u) => gidilen.push(u), href: 'https://localhost/giris.html' },
    localStorage: { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => depo.set(k, String(v)), removeItem: (k) => depo.delete(k) },
    sessionStorage: { getItem: () => null, setItem() {} },
    navigator: { userAgent: 'test' },
    fetch: async (url, opts) => { istekler.push({ url, opts }); return { ok: cevap.status === 200, status: cevap.status, json: async () => cevap.body }; },
  };
  ctx.window = Object.assign(window, ctx);
  vm.createContext(ctx);
  vm.runInContext(KOD, ctx);
  return { m: ctx.window.__mobil, depo, istekler, gidilen, acilan, bildirim };
}
const bekle = () => new Promise((r) => setTimeout(r, 20));

test('giriş açılırken kod sorgusu (S256) gönderilir, doğrulayıcı cihazda saklanır', async () => {
  const o = ortam({ status: 200, body: {} });
  await o.m.girisAc('/tekstil.html');
  assert.equal(o.acilan.length, 1);
  const u = new URL(o.acilan[0]);
  assert.equal(u.origin + u.pathname, 'https://anqfdlahimxdjovecsyk.supabase.co/auth/v1/authorize');
  assert.equal(u.searchParams.get('provider'), 'google');
  assert.equal(u.searchParams.get('redirect_to'), DONUS);
  assert.equal(u.searchParams.get('code_challenge_method'), 's256');
  const d = o.depo.get('cizim:pkce');
  assert.match(d, /^[A-Za-z0-9_-]{43}$/, 'doğrulayıcı 32 rastgele bayt (base64url)');
  const beklenen = createHash('sha256').update(d).digest('base64url');
  assert.equal(u.searchParams.get('code_challenge'), beklenen);
  const p = ortam({ status: 200, body: {} });
  await p.m.girisAc('/');
  assert.notEqual(p.depo.get('cizim:pkce'), d, 'her girişte yeni doğrulayıcı');
});

test('dönüşte kod, doğrulayıcıyla anahtara çevrilir; oturum yazılır, doğrulayıcı silinir', async () => {
  const o = ortam({ status: 200, body: { access_token: 'A', refresh_token: 'R', expires_at: 2000000000 } });
  await o.m.girisAc('/tekstil.html');
  const d = o.depo.get('cizim:pkce');
  assert.equal(o.m.donusuIsle(DONUS + '?code=KOD123'), true);
  await bekle();
  assert.equal(o.istekler.length, 1);
  assert.equal(o.istekler[0].url, 'https://anqfdlahimxdjovecsyk.supabase.co/auth/v1/token?grant_type=pkce');
  assert.deepEqual(JSON.parse(o.istekler[0].opts.body), { auth_code: 'KOD123', code_verifier: d });
  assert.ok(o.istekler[0].opts.headers.apikey.startsWith('sb_publishable_'));
  assert.deepEqual(JSON.parse(o.depo.get('cizim:oturum')), { access_token: 'A', refresh_token: 'R', expires_at: 2000000000 });
  assert.equal(o.depo.has('cizim:pkce'), false, 'doğrulayıcı tek kullanımlık');
  assert.deepEqual(o.gidilen, ['/tekstil.html']);
});

test('doğrulayıcı yoksa (giriş bu cihazda başlamadı) kod kullanılmaz; sunucu reddederse oturum yazılmaz', async () => {
  const o = ortam({ status: 200, body: { access_token: 'A', refresh_token: 'R' } });
  assert.equal(o.m.donusuIsle(DONUS + '?code=YABANCI'), true);
  await bekle();
  assert.equal(o.istekler.length, 0, 'sunucuya gidilmez');
  assert.equal(o.depo.has('cizim:oturum'), false);
  assert.ok(o.bildirim.some((t) => /bu cihazda başlatılmadı/.test(t)));
  const p = ortam({ status: 400, body: { error_description: 'invalid flow state' } });
  await p.m.girisAc('/');
  p.m.donusuIsle(DONUS + '?code=ESKI');
  await bekle();
  assert.equal(p.depo.has('cizim:oturum'), false);
  assert.deepEqual(p.gidilen, []);
  assert.ok(p.bildirim.some((t) => /invalid flow state/.test(t)));
});

test('başka adresler dönüş sayılmaz; giriş hatası Türkçe bildirilir', async () => {
  const o = ortam({ status: 200, body: {} });
  assert.equal(o.m.donusuIsle('https://kotu.site/giris?code=X'), false);
  assert.equal(o.m.donusuIsle(DONUS + '?error=access_denied&error_description=iptal'), true);
  assert.ok(o.bildirim.some((t) => /Giriş tamamlanamadı: iptal/.test(t)));
});
