// Google Play Faturalandırma. İki yol:
//  1) Android uygulaması (Capacitor): yerel eklenti mobil/yerel/Odeme.java — window.__mobil.odeme (mobil/kopru.js)
//  2) Play'den kurulmuş TWA/Chrome: Digital Goods API + PaymentRequest
// Tarayıcıda/bilgisayarda ikisi de yoktur; orada abonelik Android uygulamasından alınır ve aynı hesapla açılır.
// Satın alma SUNUCUDA doğrulanır ve onaylanır (supabase/functions/play-verify); burada yalnız jeton alınır.
const PLAY = 'https://play.google.com/billing';
let svc = null;

const yerel = () => (typeof window !== 'undefined' && window.__mobil && window.__mobil.odeme) || null;
const dg = () => typeof window !== 'undefined' && 'getDigitalGoodsService' in window && 'PaymentRequest' in window;

export const billingAvailable = () => !!yerel() || dg();

async function service() {
  if (!svc) svc = await window.getDigitalGoodsService(PLAY);
  if (!svc) throw new Error('Google Play faturalandırma bulunamadı');
  return svc;
}

// Eklenti hata kodları → kullanıcının anlayacağı açıklama (vazgeçme AbortError olur)
const YEREL_HATA = {
  ZATEN_VAR: 'Bu paket zaten bu Google hesabında var. "Satın alımları geri yükle"ye dokun.',
  URUN_YOK: 'Bu paket Google Play\'de henüz satışta değil.',
  ODEME_YOK: 'Bu cihazda Google Play ödemesi kullanılamıyor (Play Store güncel ve giriş yapılmış olmalı).',
  AG: 'Google Play\'e ulaşılamadı, internet bağlantını kontrol et.',
  BEKLIYOR: 'Ödeme onay bekliyor; onaylanınca abonelik kendiliğinden açılır.',
  MESGUL: 'Süren bir satın alma var, biraz bekle.',
};
function yerelHata(e) {
  const kod = e && e.code;
  if (kod === 'IPTAL') { const a = new Error('Vazgeçildi'); a.name = 'AbortError'; return a; }
  return new Error(YEREL_HATA[kod] || (e && e.message) || 'Google Play hatası');
}

// Mağazanın gösterdiği fiyatlar: { urunId: '4.788,00 ₺' }
export async function storePrices(ids) {
  try {
    if (yerel()) return (await yerel().urunler({ kimlikler: ids })).fiyatlar || {};
    const list = await (await service()).getDetails(ids);
    const out = {};
    for (const d of list) {
      const p = d.price;
      out[d.itemId] = p ? new Intl.NumberFormat('tr-TR', { style: 'currency', currency: p.currency }).format(Number(p.value)) : '';
    }
    return out;
  } catch (e) { return {}; }
}

// Bu Google hesabında süren satın almalar: [{ itemId, purchaseToken }]
export async function ownedPurchases() {
  if (yerel()) {
    try {
      const r = await yerel().satinAlimlar();
      return (r.satinAlimlar || []).map((p) => ({ itemId: p.urun, purchaseToken: p.jeton }));
    } catch (e) { throw yerelHata(e); }
  }
  return (await service()).listPurchases();
}

// Satın alma penceresini açar. Kullanıcı vazgeçerse AbortError fırlatır.
// Hesapta başka bir paket sürüyorsa Google paket değişikliği yapar (eski abonelik kalan süreyle mahsup edilir).
export async function buy(productId) {
  if (yerel()) {
    let eskiJeton = null;
    try {
      const sahip = await ownedPurchases();
      const eski = sahip.find((p) => p.itemId !== productId);
      if (eski) eskiJeton = eski.purchaseToken;
    } catch (e) { /* okunamazsa yeni abonelik olarak dene */ }
    try {
      const r = await yerel().satinAl({ urun: productId, ...(eskiJeton ? { eskiJeton } : {}) });
      return { token: r.jeton, complete: () => {} };   // onaylama sunucuda (play-verify)
    } catch (e) { throw yerelHata(e); }
  }
  await service();
  const req = new PaymentRequest(
    [{ supportedMethods: PLAY, data: { sku: productId } }],
    { total: { label: 'Toplam', amount: { currency: 'TRY', value: '0' } } },
  );
  const res = await req.show();
  const token = res.details && (res.details.purchaseToken || res.details.token);
  return { token, complete: (ok) => res.complete(ok ? 'success' : 'fail').catch(() => {}) };
}
