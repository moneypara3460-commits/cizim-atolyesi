// Komut kılavuzu sayfasını üretir: docs/KILAVUZ-GIRIS.md + docs/KISAYOLLAR.md → kilavuz/index.html
// Kaynak tek yerde (docs/) kalır; sayfa üretilip depoya konur (web sitesi ve Android paketi aynı dosyayı kullanır).
// Kullanım: node tools/kilavuz.mjs          (yazar)
//           node tools/kilavuz.mjs --check  (güncel değilse hata verir; testler kullanır)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KAYNAK = ['docs/KILAVUZ-GIRIS.md', 'docs/KISAYOLLAR.md'];
const HEDEF = path.join(KOK, 'kilavuz/index.html');

const kac = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// satır içi: `kod`, **kalın**, *eğik*, [metin](bağlantı) → yalnız metin (kılavuz dışı belgelere bağlanmaz)
function satir(s) {
  const parcalar = s.split(/(`[^`]*`)/);
  return parcalar.map((p) => {
    if (/^`[^`]*`$/.test(p)) return '<code>' + kac(p.slice(1, -1)) + '</code>';
    let t = kac(p);
    t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    t = t.replace(/(^|[\s(·])\*([^*\s][^*]*)\*/g, '$1<i>$2</i>');
    return t;
  }).join('');
}
export function kimlik(baslik) {
  return baslik.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
// "Tablo hücresi" ayırma: \| kaçışını korur
const hucreler = (r) => r.replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));

export function mdHtml(md) {
  const sat = md.replace(/\r/g, '').split('\n');
  const out = [];
  let i = 0;
  while (i < sat.length) {
    const s = sat[i];
    if (!s.trim()) { i++; continue; }
    const h = /^(#{1,3})\s+(.*)$/.exec(s);
    if (h) {
      const n = h[1].length, metin = h[2].trim();
      out.push(`<h${n} id="${kimlik(metin)}">${satir(metin)}</h${n}>`);
      i++; continue;
    }
    if (s.trim().startsWith('|')) {
      const tablo = [];
      while (i < sat.length && sat[i].trim().startsWith('|')) tablo.push(sat[i++].trim());
      const [bas, , ...govde] = tablo;
      out.push('<div class="tb"><table><thead><tr>' + hucreler(bas).map((c) => `<th>${satir(c)}</th>`).join('') + '</tr></thead><tbody>'
        + govde.map((r) => '<tr>' + hucreler(r).map((c) => `<td>${satir(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (/^[-*]\s+/.test(s)) {
      const ls = [];
      while (i < sat.length && /^[-*]\s+/.test(sat[i])) ls.push(sat[i++].replace(/^[-*]\s+/, ''));
      out.push('<ul>' + ls.map((l) => `<li>${satir(l)}</li>`).join('') + '</ul>');
      continue;
    }
    const pg = [];
    while (i < sat.length && sat[i].trim() && !/^(#{1,3}\s|\||[-*]\s)/.test(sat[i].trim())) pg.push(sat[i++].trim());
    out.push(`<p>${satir(pg.join(' '))}</p>`);
  }
  return out.join('\n');
}

export function uret() {
  const [giris, kisayol] = KAYNAK.map((f) => fs.readFileSync(path.join(KOK, f), 'utf8'));
  // KISAYOLLAR.md: ilk başlık ve geliştiriciye yönelik giriş paragrafı yerine kısa bir bölüm başlığı
  const govde = kisayol.replace(/^# .*\n[\s\S]*?(?=\n## )/, '## Bütün komutlar ve tuşlar\n\nBölümlere göre bütün yazılı komutlar ve klavye tuşları. Tuşlar sabittir, herkes için aynıdır.\n')
    .replace(/\nEski sürümde kaydedilmiş[^\n]*\n?/, '\n');
  const icerik = mdHtml(giris) + '\n' + mdHtml(govde);
  const bolumler = [...icerik.matchAll(/<h2 id="([^"]+)">(.*?)<\/h2>/g)].map((m) => `<a href="#${m[1]}">${m[2].replace(/<[^>]+>/g, '')}</a>`).join('');
  return `<!DOCTYPE html>
<!-- ÜRETİLMİŞ DOSYA: elle değiştirme. Kaynak docs/KILAVUZ-GIRIS.md + docs/KISAYOLLAR.md → node tools/kilavuz.mjs -->
<html lang="tr">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0f172a">
<title>Komut kılavuzu · Çizim Atölyesi</title>
<link rel="stylesheet" href="kilavuz.css">
</head>
<body>
<header id="ust">
  <button type="button" id="geri" aria-label="Geri">← Geri</button>
  <input type="search" id="ara" placeholder="Ara: delik, pah, G kodu, çentik…" autocomplete="off" spellcheck="false" aria-label="Kılavuzda ara">
</header>
<nav id="bolumler" aria-label="Bölümler">${bolumler}</nav>
<main id="icerik">
${icerik}
<p id="yok" hidden>Aradığın kelimeyle eşleşen komut yok. Başka bir kelime dene.</p>
</main>
<script src="kilavuz.js"></script>
</body>
</html>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const html = uret();
  if (process.argv.includes('--check')) {
    const eski = fs.existsSync(HEDEF) ? fs.readFileSync(HEDEF, 'utf8') : '';
    if (eski !== html) { console.error('kilavuz/index.html güncel değil: node tools/kilavuz.mjs'); process.exit(1); }
    console.log('kılavuz güncel');
  } else {
    fs.mkdirSync(path.dirname(HEDEF), { recursive: true });
    fs.writeFileSync(HEDEF, html);
    console.log('yazıldı: kilavuz/index.html');
  }
}
