package com.cizimatolyesi.app;

// Uygulama içi güncelleme (Google Play In-App Updates): Play'de yeni sürüm varsa uygulama içinden güncellenir.
//  - kontrol(): yeni sürüm var mı, önceliği (0-5) ve hangi güncelleme türleri izinli
//  - baslat({ tur: "esnek" | "aninda" }): esnek = arka planda iner, kullanıcı çalışmaya devam eder;
//    aninda = Play'in tam ekran güncelleme ekranı (zorunlu güncelleme için)
//  - tamamla(): esnek güncelleme indikten sonra uygulamayı yeni sürümle yeniden başlatır
// Olay: "durum" { durum: "indiriliyor" | "indirildi" | "hata", yuzde }
// Not: yalnız Google Play'den kurulan uygulamada çalışır (elle kurulan APK'da "yok" döner).
// mobil/hazirla.mjs android adımı bu dosyayı kopyalar, MainActivity'ye kaydeder ve app-update kütüphanesini ekler.

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

@CapacitorPlugin(name = "Guncelleme")
public class Guncelleme extends Plugin {
    private static final int ISTEK = 7301;
    private AppUpdateManager yonetici;
    private InstallStateUpdatedListener dinleyici;

    @Override
    public void load() {
        yonetici = AppUpdateManagerFactory.create(getContext());
        dinleyici = state -> {
            JSObject o = new JSObject();
            int s = state.installStatus();
            if (s == InstallStatus.DOWNLOADING) {
                long top = state.totalBytesToDownload();
                o.put("durum", "indiriliyor");
                o.put("yuzde", top > 0 ? (int) (state.bytesDownloaded() * 100 / top) : 0);
            } else if (s == InstallStatus.DOWNLOADED) {
                o.put("durum", "indirildi");
            } else if (s == InstallStatus.FAILED) {
                o.put("durum", "hata");
            } else {
                return;
            }
            notifyListeners("durum", o);
        };
        yonetici.registerListener(dinleyici);
    }

    @Override
    protected void handleOnDestroy() {
        if (yonetici != null && dinleyici != null) yonetici.unregisterListener(dinleyici);
    }

    @PluginMethod
    public void kontrol(PluginCall call) {
        yonetici.getAppUpdateInfo()
            .addOnSuccessListener(info -> {
                JSObject o = new JSObject();
                int u = info.updateAvailability();
                o.put("var", u == UpdateAvailability.UPDATE_AVAILABLE || u == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS);
                o.put("indirildi", info.installStatus() == InstallStatus.DOWNLOADED);
                o.put("oncelik", info.updatePriority());
                o.put("surumKodu", info.availableVersionCode());
                o.put("esnek", info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
                o.put("aninda", info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
                call.resolve(o);
            })
            .addOnFailureListener(e -> {
                // Play dışından kurulum, Play Store yok vb.: güncelleme yok say
                JSObject o = new JSObject();
                o.put("var", false);
                o.put("hata", e.getMessage());
                call.resolve(o);
            });
    }

    @PluginMethod
    public void baslat(PluginCall call) {
        final int tur = "aninda".equals(call.getString("tur", "esnek")) ? AppUpdateType.IMMEDIATE : AppUpdateType.FLEXIBLE;
        yonetici.getAppUpdateInfo()
            .addOnSuccessListener(info -> {
                if (!info.isUpdateTypeAllowed(tur)) { call.reject("Bu güncelleme türü şu an kullanılamıyor"); return; }
                try {
                    boolean basladi = yonetici.startUpdateFlowForResult(info, getActivity(), AppUpdateOptions.newBuilder(tur).build(), ISTEK);
                    if (basladi) call.resolve(); else call.reject("Güncelleme başlatılamadı");
                } catch (Exception e) {
                    call.reject("Güncelleme başlatılamadı: " + e.getMessage());
                }
            })
            .addOnFailureListener(e -> call.reject("Güncelleme bilgisi alınamadı: " + e.getMessage()));
    }

    @PluginMethod
    public void tamamla(PluginCall call) {
        yonetici.completeUpdate()
            .addOnSuccessListener(v -> call.resolve())
            .addOnFailureListener(e -> call.reject("Güncelleme tamamlanamadı: " + e.getMessage()));
    }
}
