// Hesap ve abonelik ayarları.
// PAYWALL: false iken hiçbir bölüm kilitlenmez, uygulama bugünkü gibi herkese açık çalışır.
// Google Play'de abonelik ürünleri hazır olunca true yapılır.
export const PAYWALL = false;

// PAYWALL kapalıyken Android uygulamasında paketler (satın alma) yalnız bu hesaplara görünür: Google Play lisans testçisi
// olarak ödeme akışını para çekilmeden denemek için. E-posta açık yazılmaz, küçük harfle SHA-256 özeti tutulur.
export const ODEME_DENEYENLER = ['45652ed4dd96716ce2428cc51a7496c36a0db408061bf6be432b85a1e3a921c3'];

// Supabase projesi: CIZIM-ATOLYESI. Yayınlanabilir anahtar herkese açık olabilir;
// veriler satır güvenliğiyle (RLS) korunur, abonelik yalnız sunucu fonksiyonunca yazılır.
export const SUPABASE_URL = 'https://anqfdlahimxdjovecsyk.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_urzQtn-1lE1-obSXF_ivQg_wZbQMRDr';

// İnternetsiz açılışta son doğrulanmış erişim en çok bu kadar gün geçerli sayılır.
export const OFFLINE_DAYS = 7;
