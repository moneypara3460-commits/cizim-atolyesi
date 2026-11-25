package com.cizimatolyesi.app;

// Google Play abonelikleri (Play Billing Library 8). WebView'da Digital Goods API yok; bu eklenti satın alma
// penceresini açar, fiyatları ve süren abonelikleri okur. Satın almanın doğrulanması ve onaylanması (acknowledge)
// SUNUCUDA yapılır (supabase/functions/play-verify): uygulama yalnız jetonu iletir.
// mobil/hazirla.mjs android adımı bu dosyayı Android projesine kopyalar, MainActivity'ye ve build.gradle'a ekler.

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

@CapacitorPlugin(name = "Odeme")
public class Odeme extends Plugin implements PurchasesUpdatedListener {

    private BillingClient istemci;
    private PluginCall bekleyenSatinAlma;          // satın alma penceresinin sonucu onPurchasesUpdated'a gelir
    private String bekleyenUrun;
    private final List<Object[]> kuyruk = new ArrayList<>();   // { PluginCall, Runnable }
    private boolean baglaniyor = false;

    @Override
    public void load() {
        istemci = BillingClient.newBuilder(getContext())
                .setListener(this)
                .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
                .enableAutoServiceReconnection()
                .build();
    }

    // Google Play'e bağlıyken iş çalıştırır; bağlı değilse bağlanır, olmazsa çağrıyı reddeder
    private synchronized void hazir(PluginCall call, Runnable is) {
        if (istemci.isReady()) { is.run(); return; }
        kuyruk.add(new Object[] { call, is });
        if (baglaniyor) return;
        baglaniyor = true;
        istemci.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult r) {
                List<Object[]> isler;
                synchronized (Odeme.this) { baglaniyor = false; isler = new ArrayList<>(kuyruk); kuyruk.clear(); }
                boolean ok = r.getResponseCode() == BillingClient.BillingResponseCode.OK;
                for (Object[] x : isler) {
                    if (ok) ((Runnable) x[1]).run();
                    else ((PluginCall) x[0]).reject("Google Play ödeme hizmetine bağlanılamadı (" + r.getResponseCode() + ")", hata(r));
                }
            }
            @Override
            public void onBillingServiceDisconnected() {
                synchronized (Odeme.this) { baglaniyor = false; }
            }
        });
    }

    private static String hata(BillingResult r) {
        switch (r.getResponseCode()) {
            case BillingClient.BillingResponseCode.USER_CANCELED: return "IPTAL";
            case BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED: return "ZATEN_VAR";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE: return "URUN_YOK";
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE: return "ODEME_YOK";
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE:
            case BillingClient.BillingResponseCode.NETWORK_ERROR: return "AG";
            default: return "HATA_" + r.getResponseCode();
        }
    }

    private interface DetaySonucu { void al(BillingResult r, List<ProductDetails> liste); }

    private void urunDetay(List<String> kimlikler, DetaySonucu sonuc) {
        List<QueryProductDetailsParams.Product> liste = new ArrayList<>();
        for (String k : kimlikler) {
            liste.add(QueryProductDetailsParams.Product.newBuilder().setProductId(k).setProductType(BillingClient.ProductType.SUBS).build());
        }
        istemci.queryProductDetailsAsync(QueryProductDetailsParams.newBuilder().setProductList(liste).build(),
                (r, sonucNesnesi) -> sonuc.al(r, sonucNesnesi == null ? Collections.emptyList() : sonucNesnesi.getProductDetailsList()));
    }

    // Temel plan teklifi (indirim teklifi değil): offerId'si boş olan
    private static ProductDetails.SubscriptionOfferDetails temelTeklif(ProductDetails d) {
        List<ProductDetails.SubscriptionOfferDetails> t = d.getSubscriptionOfferDetails();
        if (t == null || t.isEmpty()) return null;
        for (ProductDetails.SubscriptionOfferDetails o : t) if (o.getOfferId() == null) return o;
        return t.get(0);
    }

    // { kimlikler: [...] } → { fiyatlar: { urunId: "4.788,00 TL" } }
    @PluginMethod
    public void urunler(PluginCall call) {
        List<String> kimlikler = new ArrayList<>();
        try {
            JSArray a = call.getArray("kimlikler", new JSArray());
            for (int i = 0; i < a.length(); i++) kimlikler.add(a.getString(i));
        } catch (Exception e) { call.reject("Geçersiz ürün listesi"); return; }
        if (kimlikler.isEmpty()) { JSObject o = new JSObject(); o.put("fiyatlar", new JSObject()); call.resolve(o); return; }
        hazir(call, () -> urunDetay(kimlikler, (r, liste) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject("Fiyatlar alınamadı", hata(r)); return; }
            JSObject fiyatlar = new JSObject();
            for (ProductDetails d : liste) {
                ProductDetails.SubscriptionOfferDetails o = temelTeklif(d);
                if (o == null || o.getPricingPhases().getPricingPhaseList().isEmpty()) continue;
                List<ProductDetails.PricingPhase> fazlar = o.getPricingPhases().getPricingPhaseList();
                fiyatlar.put(d.getProductId(), fazlar.get(fazlar.size() - 1).getFormattedPrice());
            }
            JSObject o = new JSObject(); o.put("fiyatlar", fiyatlar); call.resolve(o);
        }));
    }

    // { urun, eskiJeton? } → { jeton, urun }  (eskiJeton: paket değiştirme; Google eski aboneliği kalan süreyle mahsup eder)
    @PluginMethod
    public void satinAl(PluginCall call) {
        String urun = call.getString("urun", "");
        String eski = call.getString("eskiJeton", null);
        if (urun.isEmpty()) { call.reject("Ürün yok"); return; }
        synchronized (this) {
            if (bekleyenSatinAlma != null) { call.reject("Süren bir satın alma var", "MESGUL"); return; }
        }
        hazir(call, () -> urunDetay(Collections.singletonList(urun), (r, liste) -> {
            if (r.getResponseCode() != BillingClient.BillingResponseCode.OK || liste.isEmpty()) { call.reject("Ürün Google Play'de bulunamadı", "URUN_YOK"); return; }
            ProductDetails d = liste.get(0);
            ProductDetails.SubscriptionOfferDetails teklif = temelTeklif(d);
            if (teklif == null) { call.reject("Ürünün etkin planı yok", "URUN_YOK"); return; }
            BillingFlowParams.Builder b = BillingFlowParams.newBuilder().setProductDetailsParamsList(Collections.singletonList(
                    BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(d).setOfferToken(teklif.getOfferToken()).build()));
            if (eski != null && !eski.isEmpty()) {
                b.setSubscriptionUpdateParams(BillingFlowParams.SubscriptionUpdateParams.newBuilder()
                        .setOldPurchaseToken(eski)
                        .setSubscriptionReplacementMode(BillingFlowParams.SubscriptionUpdateParams.ReplacementMode.WITH_TIME_PRORATION)
                        .build());
            }
            synchronized (Odeme.this) { bekleyenSatinAlma = call; bekleyenUrun = urun; }
            getActivity().runOnUiThread(() -> {
                BillingResult br = istemci.launchBillingFlow(getActivity(), b.build());
                if (br.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    PluginCall c;
                    synchronized (Odeme.this) { c = bekleyenSatinAlma; bekleyenSatinAlma = null; bekleyenUrun = null; }
                    if (c != null) c.reject("Satın alma penceresi açılamadı", hata(br));
                }
            });
        }));
    }

    @Override
    public void onPurchasesUpdated(BillingResult r, List<Purchase> satinAlimlar) {
        PluginCall c; String urun;
        synchronized (this) { c = bekleyenSatinAlma; urun = bekleyenUrun; bekleyenSatinAlma = null; bekleyenUrun = null; }
        if (c == null) return;   // bekleyen çağrı yok (ör. Play'den gelen gecikmiş güncelleme): uygulama açılışta geri yükler
        if (r.getResponseCode() != BillingClient.BillingResponseCode.OK || satinAlimlar == null || satinAlimlar.isEmpty()) {
            c.reject(r.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED ? "Vazgeçildi" : "Satın alma tamamlanamadı", hata(r));
            return;
        }
        for (Purchase p : satinAlimlar) {
            if (!p.getProducts().contains(urun)) continue;
            if (p.getPurchaseState() == Purchase.PurchaseState.PENDING) { c.reject("Ödeme onay bekliyor; onaylanınca abonelik kendiliğinden açılır", "BEKLIYOR"); return; }
            JSObject o = new JSObject(); o.put("jeton", p.getPurchaseToken()); o.put("urun", urun);
            c.resolve(o); return;
        }
        c.reject("Satın alma bilgisi gelmedi", "HATA");
    }

    // → { satinAlimlar: [{ urun, jeton, onayli }] }  (bu Google hesabında süren abonelikler)
    @PluginMethod
    public void satinAlimlar(PluginCall call) {
        hazir(call, () -> istemci.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder().setProductType(BillingClient.ProductType.SUBS).build(),
                (r, liste) -> {
                    if (r.getResponseCode() != BillingClient.BillingResponseCode.OK) { call.reject("Abonelikler okunamadı", hata(r)); return; }
                    JSArray a = new JSArray();
                    for (Purchase p : liste) {
                        if (p.getPurchaseState() != Purchase.PurchaseState.PURCHASED) continue;
                        for (String urun : p.getProducts()) {
                            JSObject o = new JSObject();
                            o.put("urun", urun); o.put("jeton", p.getPurchaseToken()); o.put("onayli", p.isAcknowledged());
                            a.put(o);
                        }
                    }
                    JSObject o = new JSObject(); o.put("satinAlimlar", a); call.resolve(o);
                }));
    }
}
