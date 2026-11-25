// Hesap ve abonelik (hesap/): bölüm kilidi, Google ile giriş dönüşü, deneme, Google Play satın alma ve geri yükleme.
// Supabase ve Google Play taklit edilir (internet gerekmez). Kilit açık hali config.js değiştirilerek denenir.
// Çalıştır: node tests/e2e/hesap.mjs
import fs from 'node:fs';
import path from 'node:path';
import { startServer, launch, createRunner, expect, ROOT } from './lib.mjs';
import { SUPABASE_URL } from '../../hesap/config.js';

const R = createRunner('hesap');
const { srv, url } = await startServer();
const browser = await launch();
const DAY = 864e5;
const CFG = fs.readFileSync(path.join(ROOT, 'hesap/config.js'), 'utf8');
const CFG_ON = CFG.replace('export const PAYWALL = false;', 'export const PAYWALL = true;');
if (CFG_ON === CFG) throw new Error('config.js içinde PAYWALL satırı bulunamadı');

// Sahte Supabase: durum test içinden değiştirilir
function fakeBackend(state) {
  return async (route) => {
    const req = route.request(), u = new URL(req.url());
    state.calls.push(u.pathname);
    const ok = (body) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const auth = req.headers()['authorization'] || '';
    if (u.pathname === '/auth/v1/user') return auth === 'Bearer erisim-1' ? ok({ email: 'deniz@ornek.com' }) : route.fulfill({ status: 401, body: '{}' });
    if (u.pathname === '/rest/v1/rpc/my_access') return ok({ trial_ends_at: new Date(Date.now() + state.trialDays * DAY).toISOString(), subscriptions: state.subs });
    if (u.pathname === '/functions/v1/play-verify') {
      const b = JSON.parse(req.postData() || '{}'); state.verified.push(b);
      state.subs = [{ product_id: b.productId, plan: 'atolye', sections: ['makine', 'tekstil', 'ayakkabi'], state: 'SUBSCRIPTION_STATE_ACTIVE', expires_at: new Date(Date.now() + 30 * DAY).toISOString(), auto_renewing: true }];
      return ok({ ok: true });
    }
    if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204 });
    if (u.pathname === '/functions/v1/hesap-sil') { state.deleted = { auth, body: JSON.parse(req.postData() || '{}') }; return ok({ ok: true }); }
    return route.fulfill({ status: 404, body: '{}' });
  };
}

async function ctxWith({ paywall = true, billing = false, view } = {}) {
  // bypassCSP: yalnız test aracının kendi bekleme kodu için (yeni Playwright sürümleri sıkı CSP'de eval'e takılıyor).
  // Sayfanın güvenlik ayarı değişmez; ayrıca aşağıdaki test CSP'nin sayfada durduğunu doğrular.
  const ctx = await browser.newContext({ ...(view || { viewport: { width: 1280, height: 860 } }), bypassCSP: true });
  const state = { trialDays: 10, subs: [], calls: [], verified: [] };
  if (paywall) await ctx.route('**/hesap/config.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: CFG_ON }));
  await ctx.route(SUPABASE_URL + '/**', fakeBackend(state));
  await ctx.route('https://unpkg.com/**', (r) => r.abort());
  if (billing) {
    // Play Store içindeki uygulamayı taklit: Digital Goods + Payment Request
    await ctx.addInitScript(() => {
      window.getDigitalGoodsService = async () => ({
        getDetails: async (ids) => ids.map((id) => ({ itemId: id, price: { currency: 'TRY', value: id.startsWith('atolye_aylik') ? '9588.00' : '4788.00' } })),
        listPurchases: async () => (window.__owned || []),
      });
      window.PaymentRequest = class {
        constructor(m) { this.sku = m[0].data.sku; }
        async show() { window.__bought = this.sku; return { details: { purchaseToken: 'jeton-' + this.sku }, complete: async (r) => { window.__completed = r; } }; }
      };
    });
  }
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  return { ctx, p, state, errs };
}
const login = (p, extra = '') => p.goto(url + 'hesap/' + extra + '#access_token=erisim-1&refresh_token=yenile-1&expires_in=3600&token_type=bearer');

await R.test('Kilit kapalıyken (varsayılan) bölümler açılır, sunucuya hiç istek gitmez', async () => {
  const { ctx, p, state } = await ctxWith({ paywall: false });
  await p.goto(url + 'ayakkabi.html'); await p.waitForTimeout(600);
  expect(p.url().endsWith('/ayakkabi.html'), 'yönlendirme olmadı: ' + p.url());
  expect(!state.calls.length, 'istek: ' + state.calls);
  await p.goto(url + '?sec=1'); await p.waitForTimeout(300);
  expect(await p.locator('#hesap-link').isHidden(), 'açılışta Hesabım bağlantısı gizli');
  await ctx.close();
});

await R.test('Kilit açık, giriş yok: bölüm Hesabım sayfasına yönlendirir; giriş düğmesi ve paketler görünür, satın alma kapalı', async () => {
  const { ctx, p, errs } = await ctxWith();
  await p.goto(url + 'ayakkabi.html'); await p.waitForURL(/\/hesap\/\?bolum=ayakkabi/);
  expect(decodeURIComponent(p.url()).includes('geri=' + url + 'ayakkabi.html'), 'geri adresi: ' + p.url());
  await p.waitForSelector('#login:not([hidden])');
  expect((await p.textContent('#msg')).includes('Ayakkabı Modelhanesi'), 'bölüm mesajı');
  expect(await p.locator('.card').count() === 4, '4 paket kartı');
  expect(await p.locator('.card button:disabled').count() === 4, 'giriş yokken satın alma kapalı');
  expect(await p.locator('#nobill').isVisible(), 'tarayıcıda "Android uygulamasından alınır" notu');
  // Google girişi Supabase'e gider, dönüş adresi bu sayfa
  let to = '';
  await p.route(SUPABASE_URL + '/auth/v1/authorize**', (r) => { to = r.request().url(); r.fulfill({ status: 200, body: 'ok' }); });
  await p.click('#google'); await p.waitForTimeout(300);
  const tu = new URL(to);
  expect(tu.searchParams.get('provider') === 'google', 'sağlayıcı google');
  expect(tu.searchParams.get('redirect_to').startsWith(url + 'hesap/?bolum=ayakkabi'), 'dönüş adresi: ' + tu.searchParams.get('redirect_to'));
  // makine bölümü (yeni/ alt klasörü) de doğru adrese yönlenir; kilit açıkken açılışta Hesabım bağlantısı görünür
  await p.goto(url + 'yeni/'); await p.waitForURL(/\/hesap\/\?bolum=makine/);
  await p.goto(url + '?sec=1'); await p.waitForSelector('#hesap-link:not([hidden])');
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await R.test('Girişten dönüş: oturum kaydedilir, adres temizlenir, deneme süresi görünür, bölüme dönülür ve deneme rozeti çıkar', async () => {
  const { ctx, p, errs } = await ctxWith();
  await login(p, '?bolum=ayakkabi&geri=' + encodeURIComponent(url + 'ayakkabi.html'));
  await p.waitForSelector('#status:not([hidden])');
  await p.waitForFunction(() => document.querySelector('#state').textContent.includes('gün kaldı'));
  expect(!p.url().includes('access_token'), 'anahtar adres çubuğundan silindi');
  expect((await p.textContent('#who')).includes('deniz@ornek.com'), 'e-posta');
  expect((await p.textContent('#state')).includes('10 gün kaldı'), await p.textContent('#state'));
  expect(await p.locator('#msg').isHidden(), 'erişim varken uyarı yok');
  expect(await p.locator('#restore').isHidden(), 'tarayıcıda geri yükleme düğmesi gizli');
  await p.click('#back'); await p.waitForURL(/ayakkabi\.html$/);
  await p.waitForSelector('#hesap-pill');
  expect((await p.textContent('#hesap-pill')).includes('Deneme · 10 gün'), await p.textContent('#hesap-pill'));
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await R.test('Deneme bitti: bölüm kilitli, uyarı çıkar; başka siteye "geri" bağlantısı kabul edilmez', async () => {
  const { ctx, p, state } = await ctxWith();
  state.trialDays = -1;
  await login(p, '?geri=' + encodeURIComponent('https://kotu.example/'));
  await p.waitForFunction(() => document.querySelector('#state').textContent.includes('Deneme süren doldu'));
  expect(await p.locator('#back').isHidden(), 'dış site geri bağlantısı gizli');
  await p.goto(url + 'ayakkabi.html'); await p.waitForURL(/\/hesap\/\?bolum=ayakkabi/);
  await p.waitForFunction(() => !document.querySelector('#msg').hidden);
  expect((await p.textContent('#msg')).includes('paket gerekiyor'), await p.textContent('#msg'));
  await ctx.close();
});

await R.test('Play Store içinde: mağaza fiyatı görünür, Atölye satın alınır, sunucuda doğrulanır, bölüm açılır; geri yükleme çalışır', async () => {
  const { ctx, p, state, errs } = await ctxWith({ billing: true });
  state.trialDays = -1;
  await login(p, '?bolum=tekstil');
  await p.waitForSelector('#restore:not([hidden])');
  await p.waitForFunction(() => document.querySelector('.card.best .price').textContent.includes('9.588'));
  expect(await p.locator('#nobill').isHidden(), 'uygulama içinde not gizli');
  await p.click('.card.best button');
  await p.waitForFunction(() => document.querySelector('.card.best .own'));
  expect(await p.evaluate(() => window.__bought) === 'atolye_aylik', 'satın alınan ürün');
  expect(await p.evaluate(() => window.__completed) === 'success', 'ödeme penceresi başarıyla kapandı');
  expect(state.verified.some((v) => v.productId === 'atolye_aylik' && v.purchaseToken === 'jeton-atolye_aylik'), 'sunucu doğrulaması: ' + JSON.stringify(state.verified));
  expect((await p.textContent('#state')).includes('Atölye · 3 bölüm · Aylık'), await p.textContent('#state'));
  expect(await p.locator('#msg').isHidden(), 'tekstil artık açık');
  // yalnız aylık paket var (Play TR üst sınırı 40.800 TL): dönem seçimi görünmez
  expect(await p.locator('.period').isHidden(), 'dönem sekmesi gizli');
  // geri yükleme: telefonda süren satın alma sunucuya yeniden bildirilir
  state.verified.length = 0;
  await p.evaluate(() => { window.__owned = [{ itemId: 'tek_makine_aylik', purchaseToken: 'eski-jeton' }, { itemId: 'yabanci_urun', purchaseToken: 'x' }]; });
  await p.click('#restore'); await p.waitForTimeout(400);
  expect(state.verified.length === 1 && state.verified[0].purchaseToken === 'eski-jeton', 'yalnız tanınan ürün geri yüklendi: ' + JSON.stringify(state.verified));
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await R.test('Hesabım sayfası telefonda taşmaz; çıkış oturumu siler', async () => {
  const { ctx, p } = await ctxWith({ view: { viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true } });
  await login(p);
  await p.waitForSelector('#status:not([hidden])');
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(ov <= 1, 'yatay taşma ' + ov);
  await p.click('#logout'); await p.waitForSelector('#login:not([hidden])');
  expect(await p.evaluate(() => localStorage.getItem('cizim:oturum')) === null, 'oturum silindi');
  await ctx.close();
});

await R.test('Hesabımı sil: SİL yazılmadan düğme kapalı; silince sunucuya onaylı istek gider, oturum temizlenir; gizlilik ve hesap silme sayfaları açılır', async () => {
  const { ctx, p, state, errs } = await ctxWith();
  await login(p);
  await p.waitForSelector('#status:not([hidden])');
  await p.click('details.danger summary');
  expect(await p.isDisabled('#delacc'), 'onaysız düğme kapalı');
  await p.fill('#delok', 'sil');
  expect(!(await p.isDisabled('#delacc')), 'küçük harf "sil" de kabul');
  await p.click('#delacc');
  await p.waitForSelector('#login:not([hidden])', { timeout: 10000 });
  expect(state.deleted && state.deleted.auth === 'Bearer erisim-1' && state.deleted.body.onay === 'SİL', 'istek: ' + JSON.stringify(state.deleted));
  expect(await p.evaluate(() => localStorage.getItem('cizim:oturum')) === null, 'oturum silindi');
  for (const pg of ['gizlilik.html', 'hesap-silme.html']) {
    const r = await p.goto(url + 'tanitim/' + pg); expect(r.ok(), pg + ' açılmadı');
    const t = await p.textContent('h1'); expect(/Gizlilik|silme/i.test(t), pg + ': ' + t);
    expect(await p.locator('a[href^="mailto:bakplanla.destek@gmail.com"]').count() > 0, pg + ' iletişim adresi yok');
    const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); expect(ov <= 1, pg + ' taşma ' + ov);
  }
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await R.test('Hesabım sayfasının güvenlik politikası sıkı kalır (eval yok, yalnız kendi sitesi + Supabase)', async () => {
  const html = fs.readFileSync(path.join(ROOT, 'hesap/index.html'), 'utf8');
  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  expect(/script-src 'self';/.test(csp) && !/unsafe-eval/.test(csp), 'script-src: ' + csp);
  expect(csp.includes(`connect-src 'self' ${SUPABASE_URL};`), 'connect-src');
});

await browser.close(); srv.close();
const sum = R.summary(); fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'reports', 'e2e-hesap.json'), JSON.stringify(sum, null, 1));
console.log('\n' + JSON.stringify(sum.counts));
process.exit(sum.counts['başarısız'] ? 1 : 0);
