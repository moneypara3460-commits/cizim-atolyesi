// Çalıştır: node tests/hesap.test.mjs
// Abonelik: erişim hesabı (deneme, abonelik, bitiş), internetsiz önbellek kuralı, ürün kimlikleri,
// uygulama ile sunucu fonksiyonunun ürün eşlemesinin aynı olması, veritabanı güvenlik kuralları.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeAccess, cacheAllows } from '../hesap/access.js';
import { PLANS, ALL_PRODUCTS, productInfo, productId } from '../hesap/plans.js';
import * as CFG from '../hesap/config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const DAY = 864e5, NOW = Date.parse('2026-11-14T12:00:00Z');
const iso = (ms) => new Date(ms).toISOString();

t('1. Deneme sürerken tüm bölümler açık, kalan gün yukarı yuvarlanır', () => {
  const a = computeAccess({ trial_ends_at: iso(NOW + 9.2 * DAY), subscriptions: [] }, NOW);
  assert.equal(a.onTrial, true); assert.equal(a.trialDaysLeft, 10);
  assert.deepEqual(a.sections, ['makine', 'tekstil', 'ayakkabi']);
});

t('2. Deneme bitti, abonelik yok: hiçbir bölüm açık değil', () => {
  const a = computeAccess({ trial_ends_at: iso(NOW - 1), subscriptions: [] }, NOW);
  assert.equal(a.onTrial, false); assert.equal(a.trialDaysLeft, 0); assert.deepEqual(a.sections, []);
});

t('3. Tek bölüm aboneliği yalnız o bölümü açar; süresi geçmiş abonelik sayılmaz', () => {
  const a = computeAccess({ trial_ends_at: iso(NOW - DAY), subscriptions: [
    { product_id: 'tek_tekstil_aylik', plan: 'tek', sections: ['tekstil'], expires_at: iso(NOW + 20 * DAY), auto_renewing: true },
    { product_id: 'tek_makine_aylik', plan: 'tek', sections: ['makine'], expires_at: iso(NOW - 1) },
  ] }, NOW);
  assert.deepEqual(a.sections, ['tekstil']); assert.equal(a.subs.length, 1);
  assert.equal(a.until.tekstil, NOW + 20 * DAY);
});

t('4. Atölye üç bölümü açar; bilinmeyen bölüm adı yok sayılır; deneme + abonelikte en geç tarih geçerli', () => {
  const a = computeAccess({ trial_ends_at: iso(NOW + 3 * DAY), subscriptions: [
    { product_id: 'atolye_yillik', plan: 'atolye', sections: ['makine', 'tekstil', 'ayakkabi', 'uzay'], expires_at: iso(NOW + 300 * DAY) },
  ] }, NOW);
  assert.deepEqual(a.sections, ['makine', 'tekstil', 'ayakkabi']);
  assert.equal(a.until.makine, NOW + 300 * DAY); assert.equal(a.until.uzay, undefined);
});

t('5. Bozuk/eksik yanıt çökertmez, erişim vermez', () => {
  for (const x of [null, {}, { trial_ends_at: 'saçma', subscriptions: [{ sections: ['makine'] }] }]) {
    assert.deepEqual(computeAccess(x, NOW).sections, []);
  }
});

t('6. İnternetsiz önbellek: süre içinde ve son kontrol 7 günden yeniyse açar; saat geri alınmışsa açmaz', () => {
  const c = { until: { makine: NOW + 30 * DAY }, checkedAt: NOW - 2 * DAY, trialEnd: 0 };
  assert.equal(cacheAllows(c, 'makine', NOW), true);
  assert.equal(cacheAllows(c, 'tekstil', NOW), false, 'başka bölüm');
  assert.equal(cacheAllows({ ...c, checkedAt: NOW - 8 * DAY }, 'makine', NOW), false, '7 günden eski kontrol');
  assert.equal(cacheAllows({ ...c, until: { makine: NOW - 1 } }, 'makine', NOW), false, 'süre dolmuş');
  assert.equal(cacheAllows({ ...c, checkedAt: NOW + 3 * DAY }, 'makine', NOW), false, 'gelecekte kontrol = saat oynanmış');
  assert.equal(cacheAllows(null, 'makine', NOW), false);
});

t('7. Ürün kimlikleri: 4 paket × 2 dönem = 8 ürün, ayrıştırma doğru', () => {
  assert.equal(ALL_PRODUCTS.length, 8);
  assert.equal(new Set(ALL_PRODUCTS).size, 8);
  assert.equal(productInfo('tek_makine_aylik').sections[0], 'makine');
  assert.equal(productInfo('atolye_yillik').period, 'yillik');
  for (const bad of ['', 'atolye', 'atolye_haftalik', 'isletme_aylik', 'tek_aylik', 'TEK_MAKINE_AYLIK']) assert.equal(productInfo(bad), null, bad);
  for (const p of PLANS) assert.ok(/^[a-z_]+$/.test(productId(p.id, 'aylik')) && productId(p.id, 'aylik').length <= 40, 'Play ürün kimliği kuralı');
});

t('8. Uygulama ile sunucu fonksiyonu aynı ürün → bölüm eşlemesini kullanır', () => {
  const src = fs.readFileSync(path.join(ROOT, 'supabase/functions/_shared/google.ts'), 'utf8');
  const server = {};
  for (const m of src.matchAll(/^\s*([a-z_]+): \{ plan: '([a-z]+)', sections: \[([^\]]*)\] \}/gm)) {
    server[m[1]] = { plan: m[2], sections: [...m[3].matchAll(/'([a-z]+)'/g)].map((x) => x[1]) };
  }
  const client = Object.fromEntries(PLANS.map((p) => [p.id, { plan: p.plan, sections: p.sections }]));
  assert.deepEqual(server, client);
});

t('9. Veritabanı: iki tablo da satır güvenliğiyle korunur, kullanıcı yalnız okur; deneme süresi sunucuda 14 gün', () => {
  const sql = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261114170000_abonelik_temel.sql'), 'utf8');
  for (const tb of ['profiles', 'subscriptions']) assert.match(sql, new RegExp(`alter table public\\.${tb} enable row level security`));
  assert.equal((sql.match(/create policy/g) || []).length, 2);
  assert.equal((sql.match(/for select to authenticated/g) || []).length, 2, 'yalnız okuma kuralı');
  assert.doesNotMatch(sql, /for (insert|update|delete|all)/, 'kullanıcıya yazma izni yok');
  assert.match(sql, /trial_ends_at timestamptz not null default \(now\(\) \+ interval '14 days'\)/);
  assert.match(sql, /revoke execute on function public\.my_access\(\) from public, anon/);
});

t('10. Kilit varsayılan olarak kapalı; ayarlar doğru proje adresini gösterir; gizli anahtar yok', () => {
  assert.equal(CFG.PAYWALL, false);
  assert.match(CFG.SUPABASE_URL, /^https:\/\/[a-z]+\.supabase\.co$/);
  assert.match(CFG.SUPABASE_KEY, /^sb_publishable_/);
  const all = fs.readdirSync(path.join(ROOT, 'hesap')).map((f) => fs.readFileSync(path.join(ROOT, 'hesap', f), 'utf8')).join('\n');
  assert.doesNotMatch(all, /service_role|sb_secret_|PRIVATE KEY/);
});

t('11. Bölüm sayfaları kilidi yükler ve Supabase adresine bağlanma izni verir', () => {
  for (const [f, b] of [['yeni/index.html', 'makine'], ['klasik.html', 'makine'], ['tekstil.html', 'tekstil'], ['ayakkabi.html', 'ayakkabi']]) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.match(h, new RegExp(`hesap/guard\\.js\\?b=${b}&`), f);
    assert.ok(h.includes(`connect-src 'self' ${CFG.SUPABASE_URL};`), f + ' CSP');
    assert.ok(h.indexOf('hesap/guard.js') < h.indexOf('type="module" src="./' + (f === 'yeni/index.html' ? 'shell' : f === 'tekstil.html' ? 'tx/app' : f === 'ayakkabi.html' ? 'ayk/app' : 'app') + '.js'), f + ' kilit önce yüklenir');
  }
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + (e.stack || e).toString().split('\n').slice(0, 4).join('\n     ')); }
}
console.log(`\n${tests.length - fail}/${tests.length} geçti`);
process.exit(fail ? 1 : 0);
