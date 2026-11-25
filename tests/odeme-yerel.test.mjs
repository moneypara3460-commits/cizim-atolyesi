// Android uygulamasında Google Play ödemesi: hesap/billing.js ↔ yerel eklenti (window.__mobil.odeme) sözleşmesi
// ve Play ürün tanımları (tools/play-urunler.mjs; yalnız kaynak ağaçta).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const cagrilar = [];
let satinAlSonucu = { jeton: 'jt-yeni', urun: 'atolye_aylik' };
let sahip = [];
globalThis.window = {
  __mobil: {
    odeme: {
      urunler: async (a) => { cagrilar.push(['urunler', a]); return { fiyatlar: { tek_makine_aylik: '₺4.788,00' } }; },
      satinAlimlar: async () => { cagrilar.push(['satinAlimlar']); return { satinAlimlar: sahip }; },
      satinAl: async (a) => { cagrilar.push(['satinAl', a]); if (satinAlSonucu instanceof Error) throw satinAlSonucu; return satinAlSonucu; },
    },
  },
};
const B = await import('../hesap/billing.js');

test('yerel eklenti varken ödeme kullanılabilir ve fiyatlar eklentiden gelir', async () => {
  assert.equal(B.billingAvailable(), true);
  const f = await B.storePrices(['tek_makine_aylik']);
  assert.deepEqual(f, { tek_makine_aylik: '₺4.788,00' });
  assert.deepEqual(cagrilar.at(-1), ['urunler', { kimlikler: ['tek_makine_aylik'] }]);
});

test('süren satın almalar hesap sayfasının beklediği biçime çevrilir', async () => {
  sahip = [{ urun: 'tek_makine_aylik', jeton: 'jt-1', onayli: true }];
  assert.deepEqual(await B.ownedPurchases(), [{ itemId: 'tek_makine_aylik', purchaseToken: 'jt-1' }]);
});

test('başka paket sürüyorsa eski jetonla paket değişikliği istenir; aynı paket için istenmez', async () => {
  sahip = [{ urun: 'tek_makine_aylik', jeton: 'jt-eski' }];
  satinAlSonucu = { jeton: 'jt-yeni', urun: 'atolye_aylik' };
  const r = await B.buy('atolye_aylik');
  assert.equal(r.token, 'jt-yeni');
  assert.deepEqual(cagrilar.at(-1), ['satinAl', { urun: 'atolye_aylik', eskiJeton: 'jt-eski' }]);
  sahip = [];
  await B.buy('atolye_aylik');
  assert.deepEqual(cagrilar.at(-1), ['satinAl', { urun: 'atolye_aylik' }]);
});

test('vazgeçme AbortError olur (hesap sayfası sessiz geçer); diğer kodlar Türkçe açıklama verir', async () => {
  satinAlSonucu = Object.assign(new Error('Vazgeçildi'), { code: 'IPTAL' });
  await assert.rejects(B.buy('tek_makine_aylik'), (e) => e.name === 'AbortError');
  satinAlSonucu = Object.assign(new Error('x'), { code: 'URUN_YOK' });
  await assert.rejects(B.buy('tek_makine_aylik'), /henüz satışta değil/);
});

const URETICI = new URL('../tools/play-urunler.mjs', import.meta.url);
const kaynak = fs.existsSync(URETICI);
(kaynak ? test : test.skip)('Play ürün tanımları: 8 ürün, kimlik, süre ve KDV dahil TL fiyat hesap/plans.js ile aynı', async () => {
  const { urunTanimi } = await import(URETICI.href);
  const { PLANS, PERIODS, productId } = await import('../hesap/plans.js');
  const hepsi = PLANS.flatMap((p) => Object.keys(PERIODS).map((d) => [p, d, urunTanimi(p, d)]));
  assert.equal(hepsi.length, 8);
  for (const [p, d, u] of hepsi) {
    assert.equal(u.productId, productId(p.id, d));
    const bp = u.basePlans[0];
    assert.equal(bp.basePlanId, 'temel');
    assert.equal(bp.autoRenewingBasePlanType.billingPeriodDuration, d === 'aylik' ? 'P1M' : 'P1Y');
    assert.equal(bp.regionalConfigs[0].price.currencyCode, 'TRY');
    assert.equal(bp.regionalConfigs[0].price.units, String(p[d]).replace(/[^\d]/g, ''));
    assert.ok(u.listings[0].title.length <= 55 && u.listings[0].description.length <= 80);
    assert.ok(u.listings[0].benefits.every((b) => b && b.length <= 40));
  }
  assert.equal(hepsi.find(([, , u]) => u.productId === 'atolye_aylik')[2].basePlans[0].regionalConfigs[0].price.units, '9588');
});
