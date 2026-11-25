package com.cizimatolyesi.app;

// Yazdır / PDF: uygulama içindeki WebView window.print() desteklemez (düğme hiçbir şey yapmaz).
// Bu eklenti Android'in yazdırma ekranını açar; orada yazıcı ya da "PDF olarak kaydet" seçilebilir.
// mobil/hazirla.mjs android adımı bu dosyayı Android projesine kopyalar ve MainActivity'ye kaydeder.

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Yazici")
public class Yazici extends Plugin {

    @PluginMethod
    public void yazdir(PluginCall call) {
        String ad = call.getString("ad", "Cizim Atolyesi");
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                PrintDocumentAdapter a = getBridge().getWebView().createPrintDocumentAdapter(ad);
                pm.print(ad, a, new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception e) {
                call.reject("Yazdırma ekranı açılamadı: " + e.getMessage());
            }
        });
    }
}
