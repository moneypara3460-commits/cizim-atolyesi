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
})();
