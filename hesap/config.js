// Hesap ve abonelik ayarları.
// PAYWALL: false iken hiçbir bölüm kilitlenmez, uygulama bugünkü gibi herkese açık çalışır.
// Google Play'de abonelik ürünleri hazır olunca true yapılır.
export const PAYWALL = false;

// Supabase projesi: CIZIM-ATOLYESI. Yayınlanabilir anahtar herkese açık olabilir;
// veriler satır güvenliğiyle (RLS) korunur, abonelik yalnız sunucu fonksiyonunca yazılır.
export const SUPABASE_URL = 'https://anqfdlahimxdjovecsyk.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_urzQtn-1lE1-obSXF_ivQg_wZbQMRDr';

// İnternetsiz açılışta son doğrulanmış erişim en çok bu kadar gün geçerli sayılır.
export const OFFLINE_DAYS = 7;
