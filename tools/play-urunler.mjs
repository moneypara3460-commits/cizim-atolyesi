// Google Play'de 8 abonelik ürününü açar / günceller (Google Play Developer API v3, monetization.subscriptions).
// Kaynak: hesap/plans.js (ürün kimlikleri ve fiyatlar). Her ürünün tek temel planı vardır ("temel"): aylık 1 ay, yıllık 1 yıl,
// otomatik yenilenir, yalnız Türkiye'de satılır (fiyat KDV dahil TRY). Ücretsiz deneme teklifi EKLENMEZ
// (7 günlük deneme uygulamanın kendi sunucusunda: profiles.trial_ends_at).
// Var olan ürüne dokunmaz (fiyat değişikliği Play Console'dan bilerek yapılır); --guncelle verilirse başlık/açıklamayı günceller.
//
// Kullanım: PLAY_SERVICE_JSON=... node tools/play-urunler.mjs [--guncelle] [--dene]
//   --dene: Google'a yazmadan ne yapacağını yazar
import { PLANS, PERIODS, productId } from '../hesap/plans.js';
import { erisimAnahtari, istek, API } from './play-api.mjs';

const BOLGE = 'TR';
const SURE = { aylik: 'P1M', yillik: 'P1Y' };
const TL = (s) => String(s).replace(/[^\d]/g, '');   // '4.788 TL' → '4788'

export function urunTanimi(plan, donem) {
  const id = productId(plan.id, donem);
  const ad = plan.plan === 'atolye' ? 'Atölye (3 bölüm)' : plan.name.replace('Tek Bölüm · ', '') + ' bölümü';
  return {
    packageName: 'com.cizimatolyesi.app',
    productId: id,
    listings: [{
      languageCode: 'tr-TR',
      title: `${ad} · ${donem === 'aylik' ? 'Aylık' : 'Yıllık'}`.slice(0, 55),
      benefits: plan.sections.map((b) => ({ makine: 'Makine ve Mühendislik', tekstil: 'Tekstil ve Moda', ayakkabi: 'Ayakkabı Modelhanesi' }[b])).slice(0, 4),
      description: (plan.plan === 'atolye' ? 'Makine, Tekstil ve Ayakkabı bölümlerinin hepsi' : plan.name.replace('Tek Bölüm · ', '') + ' bölümünün bütün araçları').slice(0, 80),
    }],
    basePlans: [{
      basePlanId: 'temel',
      autoRenewingBasePlanType: {
        billingPeriodDuration: SURE[donem],
        gracePeriodDuration: 'P7D',
        resubscribeState: 'RESUBSCRIBE_STATE_ACTIVE',
        prorationMode: 'SUBSCRIPTION_PRORATION_MODE_CHARGE_ON_NEXT_BILLING_DATE',
        legacyCompatible: true,
      },
      regionalConfigs: [{ regionCode: BOLGE, newSubscriberAvailability: true, price: { currencyCode: 'TRY', units: TL(plan[donem]), nanos: 0 } }],
    }],
  };
}

async function main() {
  const guncelle = process.argv.includes('--guncelle'), dene = process.argv.includes('--dene');
  const urunler = PLANS.flatMap((p) => Object.keys(PERIODS).map((d) => urunTanimi(p, d)));
  if (dene) { for (const u of urunler) console.log(u.productId, u.basePlans[0].regionalConfigs[0].price.units, 'TRY', u.listings[0].title); return; }
  const ham = process.env.PLAY_SERVICE_JSON;
  if (!ham) throw new Error('PLAY_SERVICE_JSON yok');
  const anahtar = await erisimAnahtari(JSON.parse(ham));
  const surum = 'regionsVersion.version=2022/02';
  for (const u of urunler) {
    let var_ = null;
    try { var_ = await istek(anahtar, 'GET', `${API}/subscriptions/${u.productId}`); } catch (e) { if (!/→ 404/.test(e.message)) throw e; }
    if (!var_) {
      await istek(anahtar, 'POST', `${API}/subscriptions?productId=${u.productId}&${surum}`, u);
      console.log('açıldı:', u.productId);
    } else if (guncelle) {
      await istek(anahtar, 'PATCH', `${API}/subscriptions/${u.productId}?updateMask=listings&${surum}`, { packageName: u.packageName, productId: u.productId, listings: u.listings });
      console.log('güncellendi:', u.productId);
    } else console.log('zaten var:', u.productId);
    const plan = (var_ && var_.basePlans || []).find((b) => b.basePlanId === 'temel');
    if (!plan || plan.state !== 'ACTIVE') {
      await istek(anahtar, 'POST', `${API}/subscriptions/${u.productId}/basePlans/temel:activate`, { packageName: u.packageName, productId: u.productId, basePlanId: 'temel' });
      console.log('  temel plan etkin:', u.productId);
    }
  }
  console.log('tamam: 8 abonelik ürünü hazır');
}

if (process.argv[1] && process.argv[1].endsWith('play-urunler.mjs')) {
  main().catch((e) => { console.error('Ürün işlemi başarısız:', e.message); process.exit(1); });
}
