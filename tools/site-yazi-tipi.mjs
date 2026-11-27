// Tanıtım sitesinin yazı tiplerini siteye gömer: ziyaretçinin tarayıcısı Google'ın yazı tipi sunucusuna gitmez
// (IP adresi Google'a gönderilmez). Yalnız site yayınlanırken (.github/workflows/site.yml) çalışır; depodaki kaynak
// sayfa değişmez. İndirme başarısız olursa sayfa olduğu gibi kalır (site yayını durmaz).
// Kullanım: node tools/site-yazi-tipi.mjs _site/tanitim/index.html
import fs from 'node:fs';
import path from 'node:path';

const CSS_ADRESI = /<link\s+href="(https:\/\/fonts\.googleapis\.com\/css2\?[^"]+)"\s+rel="stylesheet">/;
const ON_BAGLANTI = /<link\s+rel="preconnect"\s+href="https:\/\/fonts\.(googleapis|gstatic)\.com"(\s+crossorigin)?>\s*\n?/g;
// woff2 almak için güncel bir tarayıcı gibi istenir
const TARAYICI = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

// CSS'teki url(...) adreslerini yerel dosya adlarıyla değiştirir. Dönüş: { css, dosyalar: [{ adres, ad }] }
export function yerelCss(css) {
  const dosyalar = [], gorulen = new Map();
  const yeni = css.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g, (_, adres) => {
    if (!gorulen.has(adres)) {
      const uzanti = (adres.match(/\.(woff2|woff|ttf)(?:$|\?)/) || [, 'woff2'])[1];
      const ad = `yt-${String(gorulen.size + 1).padStart(2, '0')}.${uzanti}`;
      gorulen.set(adres, ad); dosyalar.push({ adres, ad });
    }
    return `url(${gorulen.get(adres)})`;
  });
  return { css: yeni, dosyalar };
}

// Sayfadaki Google Fonts bağlantılarını yerel CSS bağlantısıyla değiştirir
export function yerelSayfa(html, cssYolu = 'yazi-tipleri/yazi-tipleri.css') {
  return html.replace(ON_BAGLANTI, '').replace(CSS_ADRESI, `<link href="${cssYolu}" rel="stylesheet">`);
}

async function main() {
  const sayfa = process.argv[2];
  if (!sayfa) throw new Error('kullanım: node tools/site-yazi-tipi.mjs <sayfa.html>');
  const html = fs.readFileSync(sayfa, 'utf8');
  const m = html.match(CSS_ADRESI);
  if (!m) { console.log('Google Fonts bağlantısı yok, değişiklik yapılmadı'); return; }
  const r = await fetch(m[1].replace(/&amp;/g, '&'), { headers: { 'user-agent': TARAYICI } });
  if (!r.ok) throw new Error('yazı tipi CSS alınamadı: ' + r.status);
  const { css, dosyalar } = yerelCss(await r.text());
  if (!dosyalar.length) throw new Error('CSS içinde yazı tipi dosyası yok');
  const klasor = path.join(path.dirname(sayfa), 'yazi-tipleri');
  fs.mkdirSync(klasor, { recursive: true });
  for (const d of dosyalar) {
    const f = await fetch(d.adres, { headers: { 'user-agent': TARAYICI } });
    if (!f.ok) throw new Error(`yazı tipi indirilemedi (${f.status}): ${d.adres}`);
    fs.writeFileSync(path.join(klasor, d.ad), Buffer.from(await f.arrayBuffer()));
  }
  fs.writeFileSync(path.join(klasor, 'yazi-tipleri.css'),
    '/* Google Fonts (SIL Open Font License): Big Shoulders Display, IBM Plex Mono, IBM Plex Sans. Site yayınında gömülür. */\n' + css);
  fs.writeFileSync(sayfa, yerelSayfa(html));
  console.log(`yazı tipleri gömüldü: ${dosyalar.length} dosya → ${klasor}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('UYARI: yazı tipleri gömülemedi, Google bağlantısı kaldı:', e.message); process.exit(0); });
}
