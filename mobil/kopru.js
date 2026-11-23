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

  // ---------- 2) Google ile giriş ----------
  function girisAc(geriDon) {
    try { localStorage.setItem(HEDEF, geriDon || '/hesap/index.html'); } catch (e) { /* yok */ }
    var url = SUPABASE + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(DONUS);
    return P.Browser.open({ url: url, presentationStyle: 'popover' });
  }
  function donusuIsle(url) {
    if (!url || url.indexOf(DONUS) !== 0) return false;
    // Uygulama kapalıyken açılan bağlantı sonraki sayfalarda da "açılış adresi" olarak kalır: bir kez işle
    try { if (sessionStorage.getItem('cizim:islenen-donus') === url) return false; sessionStorage.setItem('cizim:islenen-donus', url); } catch (e) { /* yok */ }
    var i = url.indexOf('#');
    var h = new URLSearchParams(i >= 0 ? url.slice(i + 1) : (url.split('?')[1] || ''));
    try { P.Browser.close(); } catch (e) { /* zaten kapalı */ }
    var hedef = '/hesap/index.html';
    try { hedef = localStorage.getItem(HEDEF) || hedef; localStorage.removeItem(HEDEF); } catch (e) { /* yok */ }
    if (!/^\/[^/]/.test(hedef)) hedef = '/hesap/index.html';   // yalnız uygulama içi adres
    if (h.get('access_token')) {
      var s = {
        access_token: h.get('access_token'),
        refresh_token: h.get('refresh_token'),
        expires_at: Number(h.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(h.get('expires_in') || 3600),
      };
      try { localStorage.setItem(OTURUM, JSON.stringify(s)); } catch (e) { /* yok */ }
      location.replace(hedef);
    } else {
      bildir('Giriş tamamlanamadı: ' + (h.get('error_description') || h.get('error') || 'bilinmeyen hata'));
    }
    return true;
  }
  window.__mobil = { girisAc: girisAc };
  if (P.App) {
    P.App.addListener('appUrlOpen', function (e) { donusuIsle(e && e.url); });
    if (P.App.getLaunchUrl) P.App.getLaunchUrl().then(function (r) { if (r && r.url) donusuIsle(r.url); }).catch(function () { /* yok */ });
  }
})();
