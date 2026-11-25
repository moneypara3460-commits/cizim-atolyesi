package com.cizimatolyesi.app;

// Sesli komut: uygulama içindeki WebView tarayıcının ses tanıma özelliğini (SpeechRecognition) desteklemez.
// Bu eklenti telefonun kendi ses tanıma ekranını (Google) açar ve duyulan metni web koduna döndürür.
// Mikrofonu ses tanıma uygulaması kullanır; bu yüzden Çizim Atölyesi'nin mikrofon izni istemesi gerekmez.
// mobil/hazirla.mjs android adımı bu dosyayı Android projesine kopyalar ve MainActivity'ye kaydeder.

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

@CapacitorPlugin(name = "SesTanima")
public class SesTanima extends Plugin {

    @PluginMethod
    public void dinle(PluginCall call) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        String dil = call.getString("dil", "tr-TR");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, dil);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, dil);
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, call.getString("ipucu", "Dinliyorum…"));
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        try {
            startActivityForResult(call, i, "sonuc");
        } catch (ActivityNotFoundException e) {
            call.reject("Bu telefonda ses tanıma yok", "SES_YOK");
        }
    }

    @ActivityCallback
    private void sonuc(PluginCall call, ActivityResult r) {
        if (call == null) return;
        if (r.getResultCode() != Activity.RESULT_OK || r.getData() == null) {
            call.reject("Vazgeçildi", "IPTAL");
            return;
        }
        ArrayList<String> m = r.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        if (m == null || m.isEmpty() || m.get(0) == null || m.get(0).trim().isEmpty()) {
            call.reject("Ses anlaşılamadı", "BOS");
            return;
        }
        JSObject o = new JSObject();
        o.put("metin", m.get(0));
        call.resolve(o);
    }
}
