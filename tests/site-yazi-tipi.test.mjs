// Tanıtım sitesinde yazı tiplerinin siteye gömülmesi (tools/site-yazi-tipi.mjs): ağ olmadan, örnek CSS ve gerçek sayfayla.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { yerelCss, yerelSayfa } from '../tools/site-yazi-tipi.mjs';

test('CSS içindeki Google adresleri yerel dosya adlarına çevrilir; aynı dosya bir kez indirilir', () => {
  const css = `@font-face { font-family: 'IBM Plex Sans'; src: url(https://fonts.gstatic.com/s/ibmplexsans/v19/a.woff2) format('woff2'); unicode-range: U+0100-024F; }
@font-face { font-family: 'IBM Plex Sans'; src: url(https://fonts.gstatic.com/s/ibmplexsans/v19/b.woff2) format('woff2'); }
@font-face { font-family: 'IBM Plex Sans'; src: url(https://fonts.gstatic.com/s/ibmplexsans/v19/a.woff2) format('woff2'); }`;
  const r = yerelCss(css);
  assert.equal(r.dosyalar.length, 2);
  assert.deepEqual(r.dosyalar.map((d) => d.ad), ['yt-01.woff2', 'yt-02.woff2']);
  assert.doesNotMatch(r.css, /gstatic/);
  assert.equal((r.css.match(/url\(yt-01\.woff2\)/g) || []).length, 2);
  assert.match(r.css, /unicode-range: U\+0100-024F/, 'Türkçe harf aralığı korunur');
});

test('gerçek tanıtım sayfasında Google bağlantıları yerel CSS ile değişir, başka bir şey değişmez', () => {
  const html = fs.readFileSync(new URL('../tanitim/index.html', import.meta.url), 'utf8');
  assert.match(html, /fonts\.googleapis\.com\/css2/, 'kaynak sayfa Google Fonts kullanıyor (yayında gömülür)');
  const yeni = yerelSayfa(html);
  assert.doesNotMatch(yeni, /fonts\.(googleapis|gstatic)\.com/);
  assert.match(yeni, /<link href="yazi-tipleri\/yazi-tipleri\.css" rel="stylesheet">/);
  const kalan = (s) => s.replace(/<link[^>]*(fonts|yazi-tipleri)[^>]*>\s*/g, '');
  assert.equal(kalan(yeni), kalan(html), 'yalnız yazı tipi bağlantıları değişti');
});
