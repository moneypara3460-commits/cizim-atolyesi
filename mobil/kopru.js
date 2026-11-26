// Çizim Atölyesi — Android köprüsü. YALNIZ Android paketine eklenir (mobil/hazirla.mjs her sayfanın başına koyar);
// web sitesinde yoktur. Tarayıcıda olup uygulama içindeki WebView'da olmayan iki şeyi tamamlar:
//  1) Dosya indirme: WebView <a download> ile blob/data dosyası kaydedemez. Dosya uygulamanın geçici klasörüne
//     yazılır ve Android paylaşım ekranı açılır (Dosyalar'a kaydet, WhatsApp, Drive…).
//  2) Google ile giriş: Google, uygulama içi WebView'da girişe izin vermez. Giriş sistem tarayıcısında açılır,
//     Supabase oturumu com.cizimatolyesi.app://giris adresiyle uygulamaya geri döner.
(function () {
  'use strict';
  // (kopru.js yalnız Android paketinde bulunur; web sitesinde bu kod hiç çalışmaz)
  // 0) Klasör adresleri: uygulamanın yerel sunucusu "yeni/", "hesap/" gibi klasör adreslerinde o klasörün index.html'ini
  //    değil, ana sayfayı verir; göreli stil/kod yolları da bozulur (tasarımsız açılış ekranı). Doğru sayfaya yönlendir.
  if (/\/$/.test(location.pathname) && location.pathname !== '/') {
    location.replace(location.pathname + 'index.html' + location.search + location.hash);
    return;
  }
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var P = C.Plugins || {};
  var SUPABASE = 'https://anqfdlahimxdjovecsyk.supabase.co';   // herkese açık adres (hesap/config.js ile aynı)
  var ANAHTAR = 'sb_publishable_urzQtn-1lE1-obSXF_ivQg_wZbQMRDr';   // herkese açık anahtar (hesap/config.js ile aynı)
  var DONUS = 'com.cizimatolyesi.app://giris';
  var OTURUM = 'cizim:oturum', HEDEF = 'cizim:giris-sonrasi';

  // ---------- 1) Dosya indirme ----------
  var bloblar = new Map();
  var olustur = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (o) {
    var u = olustur(o);
    if (o instanceof Blob) { bloblar.set(u, o); setTimeout(function () { bloblar.delete(u); }, 120000); }
    return u;
  };
  function base64(blob) {
    return new Promise(function (ok, hata) {
      var r = new FileReader();
      r.onload = function () { ok(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { hata(r.error); };
      r.readAsDataURL(blob);
    });
  }
  function bildir(t) {
    var d = document.createElement('div');
    d.textContent = t;
    d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483647;background:#18233a;color:#e6ecf5;padding:10px 14px;border-radius:10px;font:14px system-ui;max-width:90vw';
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 3500);
  }
  function kaydet(blob, ad) {
    var dosya = String(ad || 'dosya').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 120) || 'dosya';
    return base64(blob)
      .then(function (data) { return P.Filesystem.writeFile({ path: dosya, data: data, directory: 'CACHE' }); })
      .then(function (w) { return P.Share.share({ title: dosya, files: [w.uri], dialogTitle: dosya }); })
      .catch(function (e) {
        if (e && /cancel/i.test(String(e.message || e))) return;   // kullanıcı paylaşımı kapattı
        console.error('kaydetme', e);
        bildir('Dosya kaydedilemedi: ' + (e && e.message ? e.message : e));
      });
  }
  var tikla = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var href = this.getAttribute('href') || '';
    if (this.hasAttribute('download') && /^(blob|data):/.test(href)) {
      var ad = this.getAttribute('download') || 'dosya';
      var b = bloblar.get(this.href);
      if (b) kaydet(b, ad);
      else fetch(this.href).then(function (r) { return r.blob(); }).then(function (x) { return kaydet(x, ad); })
        .catch(function (e) { bildir('Dosya kaydedilemedi: ' + e.message); });
      return;
    }
    return tikla.call(this);
  };

  // ---------- 1b) Sesli komut ----------
  // WebView'da tarayıcının ses tanıması (SpeechRecognition) yok. Aynı arayüzle telefonun kendi ses tanıma ekranını
  // açan yerel eklenti (mobil/yerel/SesTanima.java) kullanılır; uygulama kodu (app.js) değişmeden çalışır.
  var sesEklenti = null;
  try { sesEklenti = C.registerPlugin ? C.registerPlugin('SesTanima') : P.SesTanima; } catch (e) { sesEklenti = P.SesTanima || null; }
  if (sesEklenti) {
    var SES_HATA = { SES_YOK: 'bu telefonda ses tanıma yok (Google uygulamasını güncelle)', BOS: 'ses anlaşılamadı, tekrar dene' };
    var SesTanima = function () {
      this.lang = 'tr-TR'; this.interimResults = false; this.maxAlternatives = 1; this.continuous = false;
      this.onresult = null; this.onerror = null; this.onend = null; this._bitti = false;
    };
    SesTanima.prototype._son = function () {
      if (this._bitti) return;
      this._bitti = true;
      if (typeof this.onend === 'function') this.onend({});
    };
    SesTanima.prototype.start = function () {
      var s = this;
      sesEklenti.dinle({ dil: s.lang || 'tr-TR', ipucu: 'Komutunu söyle' }).then(function (r) {
        var metin = String((r && r.metin) || '').trim();
        if (!s._bitti && metin && typeof s.onresult === 'function') {
          s.onresult({ resultIndex: 0, results: [[{ transcript: metin, confidence: 1 }]] });
        }
      }, function (e) {
        var kod = e && e.code;
        if (!s._bitti && kod !== 'IPTAL' && typeof s.onerror === 'function') {
          s.onerror({ error: SES_HATA[kod] || ((e && e.message) || 'bilinmeyen hata') });
        }
      }).then(function () { s._son(); });
    };
    SesTanima.prototype.stop = function () { this._son(); };
    SesTanima.prototype.abort = function () { this._son(); };
    window.SpeechRecognition = SesTanima;
    window.webkitSpeechRecognition = SesTanima;
  }

  // ---------- 1c) Yazdır / PDF ----------
  // WebView window.print() desteklemez; Android'in yazdırma ekranı açılır (yazıcı ya da "PDF olarak kaydet").
  var yazici = null;
  try { yazici = C.registerPlugin ? C.registerPlugin('Yazici') : P.Yazici; } catch (e) { yazici = P.Yazici || null; }
  if (yazici) {
    window.print = function () {
      yazici.yazdir({ ad: document.title || 'Çizim Atölyesi' }).catch(function (e) {
        bildir('Yazdırma açılamadı: ' + ((e && e.message) || e));
      });
    };
  }

  // ---------- 2) Google ile giriş ----------
  // Girişten sonra gidilecek adres: yalnız uygulamanın kendi sayfaları (başka siteye ya da javascript: adresine yönlenmez)
  var UYGULAMA_SAYFALARI = ['/', '/index.html', '/yeni/index.html', '/klasik.html', '/tekstil.html', '/ayakkabi.html', '/hesap/index.html', '/kilavuz/index.html'];
  function guvenliHedef(h) {
    try {
      var u = new URL(String(h || ''), location.origin);
      var i = UYGULAMA_SAYFALARI.indexOf(u.pathname);
      if (u.origin === location.origin && i >= 0) return UYGULAMA_SAYFALARI[i];
    } catch (e) { /* geçersiz adres */ }
    return '/';
  }
  // PKCE: dönüş adresine oturum anahtarı değil, tek kullanımlık bir kod gelir. Kod, yalnız bu uygulamanın sakladığı gizli
  // doğrulayıcıyla anahtara çevrilebilir; aynı dönüş adresini sahiplenen başka bir uygulama kodu yakalasa da işe yaramaz.
  var DOGRULAYICI = 'cizim:pkce';
  function b64url(bytes) {
    var t = ''; for (var i = 0; i < bytes.length; i++) t += String.fromCharCode(bytes[i]);
    return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function girisAc(geriDon) {
    var hedef = guvenliHedef(new URLSearchParams(location.search).get('geri') || geriDon);
    try { localStorage.setItem(HEDEF, hedef); } catch (e) { /* yok */ }
    var rastgele = new Uint8Array(32);
    crypto.getRandomValues(rastgele);
    var dogrulayici = b64url(rastgele);
    try { localStorage.setItem(DOGRULAYICI, dogrulayici); } catch (e) { /* yok */ }
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(dogrulayici)).then(function (oz) {
      var url = SUPABASE + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(DONUS) +
        '&code_challenge=' + b64url(new Uint8Array(oz)) + '&code_challenge_method=s256';
      return P.Browser.open({ url: url, presentationStyle: 'popover' });
    });
  }
  function oturumYaz(j, hedef) {
    var s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Number(j.expires_at) || Math.floor(Date.now() / 1000) + Number(j.expires_in || 3600) };
    try { localStorage.setItem(OTURUM, JSON.stringify(s)); } catch (e) { /* yok */ }
    location.replace(hedef);
  }
  function donusuIsle(url) {
    if (!url || url.indexOf(DONUS) !== 0) return false;
    // Uygulama kapalıyken açılan bağlantı sonraki sayfalarda da "açılış adresi" olarak kalır: bir kez işle
    try { if (sessionStorage.getItem('cizim:islenen-donus') === url) return false; sessionStorage.setItem('cizim:islenen-donus', url); } catch (e) { /* yok */ }
    var i = url.indexOf('#');
    var h = new URLSearchParams(i >= 0 ? url.slice(i + 1) : (url.split('?')[1] || ''));
    try { P.Browser.close(); } catch (e) { /* zaten kapalı */ }
    var kayitli = null;
    try { kayitli = localStorage.getItem(HEDEF); localStorage.removeItem(HEDEF); } catch (e) { /* yok */ }
    var hedef = guvenliHedef(kayitli);
    var kod = new URLSearchParams(url.split('#')[0].split('?')[1] || '').get('code');
    if (kod) {
      var dogrulayici = null;
      try { dogrulayici = localStorage.getItem(DOGRULAYICI); localStorage.removeItem(DOGRULAYICI); } catch (e) { /* yok */ }
      if (!dogrulayici) { bildir('Giriş tamamlanamadı: giriş bu cihazda başlatılmadı, tekrar dene.'); return true; }
      fetch(SUPABASE + '/auth/v1/token?grant_type=pkce', {
        method: 'POST',
        headers: { apikey: ANAHTAR, 'content-type': 'application/json' },
        body: JSON.stringify({ auth_code: kod, code_verifier: dogrulayici }),
      }).then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok || !j.access_token) throw new Error(j.error_description || j.msg || j.error || ('sunucu ' + r.status));
          oturumYaz(j, hedef);
        });
      }).catch(function (e) { bildir('Giriş tamamlanamadı: ' + e.message); });
    } else if (h.get('access_token')) {
      oturumYaz({ access_token: h.get('access_token'), refresh_token: h.get('refresh_token'), expires_at: h.get('expires_at'), expires_in: h.get('expires_in') }, hedef);
    } else {
      bildir('Giriş tamamlanamadı: ' + (h.get('error_description') || h.get('error') || 'bilinmeyen hata'));
    }
    return true;
  }
  // Davetli hesapla giriş (e-posta + şifre). GEÇİCİ: yalnız Google Play inceleme hesabı için (Google girişi incelemecide
  // iki adımlı onaya takılıyor). Yeni e-posta hesabı açılamaz: sunucu reddeder (supabase/migrations/20261126180000_davetli_eposta_girisi.sql).
  function sifreyleGir(eposta, sifre, geriDon) {
    return fetch(SUPABASE + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { apikey: ANAHTAR, 'content-type': 'application/json' },
      body: JSON.stringify({ email: String(eposta || '').trim(), password: String(sifre || '') }),
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok || !j.access_token) {
          var e = new Error(r.status === 400 || r.status === 401 ? 'E-posta ya da şifre yanlış.' : r.status === 429 ? 'Çok fazla deneme yapıldı, biraz bekle.' : 'Giriş yapılamadı (' + r.status + ').');
          throw e;
        }
        var s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600) };
        try { localStorage.setItem(OTURUM, JSON.stringify(s)); } catch (x) { /* yok */ }
        location.replace(guvenliHedef(geriDon));
        return true;
      });
    });
  }
  // Google Play abonelikleri: hesap/billing.js bunu kullanır (mobil/yerel/Odeme.java)
  var odeme = null;
  try { odeme = C.registerPlugin ? C.registerPlugin('Odeme') : P.Odeme; } catch (e) { odeme = P.Odeme || null; }
  window.__mobil = { girisAc: girisAc, sifreyleGir: sifreyleGir, donusuIsle: donusuIsle, odeme: odeme };

  // ---------- 3) Giriş zorunlu ----------
  // Uygulamada her bölüm Google ile girişten sonra açılır (web sitesi açık kalır). Hesap ve tanıtım sayfaları serbest.
  var yol = location.pathname;
  var serbest = /^\/(hesap|tanitim)\//.test(yol) || yol === '/giris.html';
  var oturum = null;
  try { oturum = JSON.parse(localStorage.getItem(OTURUM)); } catch (e) { /* yok */ }
  var girisVar = !!(oturum && oturum.refresh_token);
  var bekleyenDonus = false;
  if (!serbest && !girisVar) {
    // Uygulama giriş dönüş bağlantısıyla soğuk açıldıysa önce onu işle (oturumu yazıp yönlendirir)
    bekleyenDonus = true;
    var yonlendir = function () {
      location.replace('/giris.html?geri=' + encodeURIComponent(yol + location.search + location.hash));
    };
    if (P.App && P.App.getLaunchUrl) {
      P.App.getLaunchUrl().then(function (r) { if (!(r && r.url && donusuIsle(r.url))) yonlendir(); }).catch(yonlendir);
    } else yonlendir();
  }

  // Hesap sayfası (uygulamada): kilit (PAYWALL) açılana kadar paketler gizli; açılış ekranında "Hesabım" görünür
  // (hesap/hesap.js bu stili yalnız ödeme denemesine izinli hesapta kaldırır: hesap/config.js ODEME_DENEYENLER)
  var stil = document.createElement('style');
  stil.id = 'odeme-gizle';
  stil.textContent = '#plans{display:none!important}';
  if (/^\/hesap\//.test(yol)) document.documentElement.appendChild(stil);
  document.addEventListener('DOMContentLoaded', function () {
    var l = document.getElementById('hesap-link');
    if (l) l.hidden = false;
  });
  if (P.App) {
    P.App.addListener('appUrlOpen', function (e) { donusuIsle(e && e.url); });
    if (P.App.getLaunchUrl && !bekleyenDonus) P.App.getLaunchUrl().then(function (r) { if (r && r.url) donusuIsle(r.url); }).catch(function () { /* yok */ });
  }
})();
