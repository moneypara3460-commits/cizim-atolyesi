// Paketler ve Google Play ürün kimlikleri. Sunucudaki eşleme: supabase/functions/_shared/google.ts
// Fiyatlar Play Console'da KDV dahil girilir (3.990 + %20 KDV = 4.788 TL); uygulama mağazanın gösterdiği fiyatı kullanır,
// buradakiler mağaza fiyatı alınamazsa gösterilen yedek metindir.
export const SECTIONS = ['makine', 'tekstil', 'ayakkabi'];
export const SECTION_NAME = { makine: 'Makine ve Mühendislik', tekstil: 'Tekstil ve Moda', ayakkabi: 'Ayakkabı Modelhanesi' };

export const PLANS = [
  { id: 'tek_makine', plan: 'tek', name: 'Tek Bölüm · Makine', sections: ['makine'], aylik: '4.788 TL', yillik: '47.880 TL' },
  { id: 'tek_tekstil', plan: 'tek', name: 'Tek Bölüm · Tekstil', sections: ['tekstil'], aylik: '4.788 TL', yillik: '47.880 TL' },
  { id: 'tek_ayakkabi', plan: 'tek', name: 'Tek Bölüm · Ayakkabı', sections: ['ayakkabi'], aylik: '4.788 TL', yillik: '47.880 TL' },
  { id: 'atolye', plan: 'atolye', name: 'Atölye · 3 bölüm', sections: ['makine', 'tekstil', 'ayakkabi'], aylik: '9.588 TL', yillik: '95.880 TL', best: true },
];
export const PERIODS = { aylik: 'Aylık', yillik: 'Yıllık (2 ay bedava)' };

export const productId = (planId, period) => `${planId}_${period}`;
export const ALL_PRODUCTS = PLANS.flatMap((p) => Object.keys(PERIODS).map((per) => productId(p.id, per)));

export function productInfo(id) {
  const m = /^([a-z_]+)_(aylik|yillik)$/.exec(id || '');
  const p = m && PLANS.find((x) => x.id === m[1]);
  return p ? { ...p, period: m[2] } : null;
}
