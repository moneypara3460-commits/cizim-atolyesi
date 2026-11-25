// Komut kılavuzu: arama süzgeci ve geri düğmesi. İnternetsiz çalışır.
(function () {
  'use strict';
  var fold = function (s) {
    return String(s || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
  };
  var ara = document.getElementById('ara');
  var icerik = document.getElementById('icerik');
  var yok = document.getElementById('yok');
  var satirlar = Array.prototype.slice.call(icerik.querySelectorAll('tbody tr, p:not(#yok), li'));
  satirlar.forEach(function (el) { el.dataset.k = fold(el.textContent); });

  function suz() {
    var q = fold(ara.value.trim());
    var parcalar = q.split(/\s+/).filter(Boolean);
    var gorunen = 0;
    satirlar.forEach(function (el) {
      var ok = !parcalar.length || parcalar.every(function (p) { return el.dataset.k.indexOf(p) >= 0; });
      el.hidden = !ok;
      if (ok) gorunen++;
    });
    // içinde görünen satır kalmayan tabloları ve başlıkları gizle
    Array.prototype.forEach.call(icerik.querySelectorAll('.tb'), function (tb) {
      tb.hidden = !!parcalar.length && !tb.querySelector('tbody tr:not([hidden])');
    });
    Array.prototype.forEach.call(icerik.querySelectorAll('h2, h3'), function (h) {
      if (!parcalar.length) { h.hidden = false; return; }
      var el = h.nextElementSibling, var_ = false;
      while (el && !/^H[23]$/.test(el.tagName)) {
        if (!el.hidden && el.id !== 'yok') { var_ = true; break; }
        el = el.nextElementSibling;
      }
      h.hidden = !var_;
    });
    yok.hidden = gorunen > 0;
  }
  ara.addEventListener('input', suz);

  document.getElementById('geri').addEventListener('click', function () {
    if (history.length > 1) history.back();
    else location.href = '../index.html';
  });
})();
