// Google Play Faturalandırma: yalnız Play Store'daki Android uygulamasının (TWA) içinde çalışır.
// Tarayıcıda/bilgisayarda bu API yoktur; orada abonelik Android uygulamasından alınır ve aynı hesapla açılır.
const PLAY = 'https://play.google.com/billing';
let svc = null;

export const billingAvailable = () => typeof window !== 'undefined' && 'getDigitalGoodsService' in window && 'PaymentRequest' in window;

async function service() {
  if (!svc) svc = await window.getDigitalGoodsService(PLAY);
  if (!svc) throw new Error('Google Play faturalandırma bulunamadı');
  return svc;
}

// Mağazanın gösterdiği fiyatlar: { urunId: '4.788,00 ₺' }
export async function storePrices(ids) {
  try {
    const list = await (await service()).getDetails(ids);
    const out = {};
    for (const d of list) {
      const p = d.price;
      out[d.itemId] = p ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: p.currency }).format(Number(p.value)) : '';
    }
    return out;
  } catch (e) { return {}; }
}

// Satın alma penceresini açar. Kullanıcı vazgeçerse AbortError fırlatır.
export async function buy(productId) {
  await service();
  const req = new PaymentRequest(
    [{ supportedMethods: PLAY, data: { sku: productId } }],
    { total: { label: 'Toplam', amount: { currency: 'TRY', value: '0' } } },
  );
  const res = await req.show();
  const token = res.details && (res.details.purchaseToken || res.details.token);
  return { token, complete: (ok) => res.complete(ok ? 'success' : 'fail').catch(() => {}) };
}

// Bu Google hesabında süren satın almalar: [{ itemId, purchaseToken }]
export async function ownedPurchases() {
  return (await service()).listPurchases();
}
