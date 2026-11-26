// Android uygulamasının giriş ekranı. Girişi köprü (kopru.js) yapar: sistem tarayıcısında Google, dönüşte oturum.
(function () {
  'use strict';
  var b = document.getElementById('google'), d = document.getElementById('durum');
  var q = new URLSearchParams(location.search);
  function yaz(t, hata) { d.textContent = t; d.hidden = !t; d.classList.toggle('hata', !!hata); }
  if (q.get('hata')) yaz('Giriş tamamlanamadı: ' + q.get('hata'), true);
  b.addEventListener('click', function () {
    var m = window.__mobil;
    if (!m || !m.girisAc) { yaz('Giriş şu an açılamadı. Uygulamayı kapatıp yeniden aç.', true); return; }
    b.disabled = true;
    yaz('Google girişi tarayıcıda açılıyor…');
    Promise.resolve(m.girisAc(q.get('geri') || '/')).catch(function (e) { yaz('Tarayıcı açılamadı: ' + (e && e.message || e), true); })
      .then(function () { setTimeout(function () { b.disabled = false; }, 2500); });
  });
  // Davetli hesap (e-posta + şifre): yalnız Google Play inceleme hesabı; yeni kayıt yok (kopru.js sifreyleGir)
  var de = document.getElementById('d-eposta'), ds = document.getElementById('d-sifre'), dg = document.getElementById('d-gir');
  function davetliGir() {
    var m = window.__mobil;
    if (!m || !m.sifreyleGir) { yaz('Giriş şu an açılamadı. Uygulamayı kapatıp yeniden aç.', true); return; }
    if (!de.value.trim() || !ds.value) { yaz('E-posta ve şifreyi yaz.', true); return; }
    dg.disabled = true; yaz('Giriş yapılıyor…');
    m.sifreyleGir(de.value, ds.value, q.get('geri') || '/').catch(function (e) {
      yaz((e && e.message) || 'Giriş yapılamadı.', true); dg.disabled = false;
    });
  }
  dg.addEventListener('click', davetliGir);
  ds.addEventListener('keydown', function (e) { if (e.key === 'Enter') davetliGir(); });
})();
