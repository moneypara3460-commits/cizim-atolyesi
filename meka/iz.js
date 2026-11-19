// Mekatronik Mühendisliği — 8. aşama: izlenebilirlik. Gereksinim listesi ve doğrulama matrisi (her gereksinim bir
// hesap / benzetim / güvenlik / elektrik / PLC sonucuna bağlanır, durum kendiliğinden çıkar), revizyon ve onay geçmişi
// (her revizyon proje verisinin SHA-256 parmak izini saklar; onaydan sonra değişiklik algılanır), STEP AP242 başlığı
// (ISO 10303-21 kodlaması). Saf fonksiyonlar; DOM gerektirmez (tests/meka-iz.test.mjs).
//
// Kaynaklar: FIPS 180-4 (SHA-256), ISO 10303-21 (STEP dosya biçimi: HEADER bölümü, dizgi kodlaması \X2\…\X0\),
// ISO 10303-242 (AP242, yönetilen model tabanlı 3B mühendislik; OCCT yazıcısı).
// Not: Buradaki onay adları kullanıcının yazdığı metindir; kimlik doğrulamalı elektronik imza değildir.

const fin = (v) => typeof v === 'number' && Number.isFinite(v);

/* ---------- SHA-256 (FIPS 180-4), eşzamanlı ---------- */
const KS = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
export function sha256(text) {
  const msg = new TextEncoder().encode(String(text));
  const L = msg.length, n = ((L + 9 + 63) >> 6) << 6, b = new Uint8Array(n);
  b.set(msg); b[L] = 0x80;
  const dv = new DataView(b.buffer);
  dv.setUint32(n - 8, Math.floor((L * 8) / 2 ** 32)); dv.setUint32(n - 4, (L * 8) >>> 0);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]), W = new Uint32Array(64);
  const r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < n; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = r(W[i - 15], 7) ^ r(W[i - 15], 18) ^ (W[i - 15] >>> 3), s1 = r(W[i - 2], 17) ^ r(W[i - 2], 19) ^ (W[i - 2] >>> 10); W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0; }
    let [a, bb, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = r(e, 6) ^ r(e, 11) ^ r(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + KS[i] + W[i]) >>> 0;
      const S0 = r(a, 2) ^ r(a, 13) ^ r(a, 22), mj = (a & bb) ^ (a & c) ^ (bb & c), t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += bb; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  return [...H].map((x) => x.toString(16).padStart(8, '0')).join('');
}
// Anahtar sırası sabit JSON (aynı veri → aynı parmak izi)
export function kararliJSON(v) {
  if (v === null || typeof v !== 'object') return typeof v === 'number' && !Number.isFinite(v) ? 'null' : JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(kararliJSON).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + kararliJSON(v[k])).join(',') + '}';
}
// Proje parmak izi: izlenebilirlik kaydının kendisi (revizyonlar) hariç tüm Mekatronik verisi
// (hesap kartlarında hangi sekmenin açık olduğu gibi yalnız ekran durumu da sayılmaz)
export function parmakIzi(P) {
  const { iz, ...rest } = P || {};
  if (rest.calc && typeof rest.calc === 'object') { const { kart, ...c } = rest.calc; rest.calc = c; }
  return sha256(kararliJSON({ ...rest, gereksinimler: iz?.gereksinimler || [] }));
}

/* ---------- Gereksinimler ---------- */
export const KAYNAK = { musteri: 'Müşteri', standart: 'Standart / yönetmelik', ic: 'İç tasarım kuralı' };
export const ONCELIK = { zorunlu: 'Zorunlu', istenen: 'İstenen' };
export const OLCUT = {
  elle: 'Elle değerlendirilir (inceleme / test kaydı)',
  cevrim: 'Benzetim: çevrim süresi ≤ hedef (s)',
  adet: 'Benzetim: saatlik üretim ≥ hedef (adet)',
  sim: 'Benzetim: motor yükleri ve kilitler uygun',
  kart: 'Hesap kartı uygun',
  elek: 'Elektrik hesabı uygun',
  plc: 'PLC denetimi hatasız',
  guvIslev: 'Güvenlik işlevi doğrulandı',
  guvTam: 'Güvenlik değerlendirmesi tam (risk, işlevler, IEC 60204-1)',
};
export const DURUM = { karsilandi: 'Karşılandı', karsilanmadi: 'Karşılanmadı', bekliyor: 'Değerlendirilmedi' };

export function izEmpty() { return { gereksinimler: [], revizyonlar: [], nextId: 1 }; }
const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
export function izSanitize(o) {
  const Z = izEmpty();
  if (!o || typeof o !== 'object') return Z;
  const ids = new Set();
  for (const g of Array.isArray(o.gereksinimler) ? o.gereksinimler.slice(0, 500) : []) {
    if (!g || !fin(g.id) || ids.has(g.id)) continue;
    ids.add(g.id);
    Z.gereksinimler.push({ id: g.id, kod: str(g.kod, 20) || 'GR-' + String(g.id).padStart(3, '0'), metin: str(g.metin, 400), kaynak: KAYNAK[g.kaynak] ? g.kaynak : 'musteri', oncelik: ONCELIK[g.oncelik] ? g.oncelik : 'zorunlu', olcut: OLCUT[g.olcut] ? g.olcut : 'elle', hedef: fin(g.hedef) ? g.hedef : NaN, ref: typeof g.ref === 'string' || fin(g.ref) ? g.ref : '', elleDurum: ['karsilandi', 'karsilanmadi'].includes(g.elleDurum) ? g.elleDurum : '', kanit: str(g.kanit, 300) });
  }
  for (const r of Array.isArray(o.revizyonlar) ? o.revizyonlar.slice(0, 200) : []) {
    if (!r || typeof r !== 'object' || !/^[A-Z]{1,2}$/.test(r.rev)) continue;
    Z.revizyonlar.push({ rev: r.rev, tarih: str(r.tarih, 30), aciklama: str(r.aciklama, 300), hazirlayan: str(r.hazirlayan, 60), kontrol: str(r.kontrol, 60), onay: str(r.onay, 60), durum: r.durum === 'onayli' ? 'onayli' : 'taslak', onayTarih: str(r.onayTarih, 30), iz: /^[0-9a-f]{64}$/.test(r.iz) ? r.iz : '', ozet: r.ozet && typeof r.ozet === 'object' ? { karsilandi: num(r.ozet.karsilandi), karsilanmadi: num(r.ozet.karsilanmadi), bekliyor: num(r.ozet.bekliyor), toplam: num(r.ozet.toplam) } : null });
  }
  Z.nextId = Math.max(fin(o.nextId) ? o.nextId : 1, ...[...ids].map((i) => i + 1), 1);
  return Z;
}
const num = (v) => (fin(v) ? v : 0);
export function gereksinimEkle(Z, from = {}) {
  const id = Z.nextId++;
  const g = { id, kod: 'GR-' + String(id).padStart(3, '0'), metin: '', kaynak: 'musteri', oncelik: 'zorunlu', olcut: 'elle', hedef: NaN, ref: '', elleDurum: '', kanit: '', ...from };
  Z.gereksinimler.push(g); return g;
}

// Değerlendirme: S = durum kaynağı { sim, kart(k), elek, plc, guv } (UI hesaplar; burada saf kalır)
export function degerlendir(g, S) {
  const sonuc = (durum, kanit) => ({ durum, kanit });
  try {
    switch (g.olcut) {
      case 'elle': return g.elleDurum ? sonuc(g.elleDurum, g.kanit || 'elle işaretlendi') : sonuc('bekliyor', 'inceleme / test kaydı bekleniyor');
      case 'cevrim': case 'adet': {
        if (!fin(g.hedef) || g.hedef <= 0) return sonuc('bekliyor', 'hedef değer girilmedi');
        const s = S.sim;
        if (!s || !s.olaylar?.length) return sonuc('bekliyor', 'benzetimde hareket yok');
        if (g.olcut === 'cevrim') return sonuc(s.tcyc <= g.hedef ? 'karsilandi' : 'karsilanmadi', `çevrim ${s.tcyc.toFixed(3)} s, hedef ≤ ${g.hedef} s`);
        return sonuc(s.adetSaat >= g.hedef ? 'karsilandi' : 'karsilanmadi', `saatte ${s.adetSaat.toFixed(1)} adet, hedef ≥ ${g.hedef}`);
      }
      case 'sim': { const s = S.sim; if (!s || !s.olaylar?.length) return sonuc('bekliyor', 'benzetimde hareket yok'); return sonuc(s.uygun ? 'karsilandi' : 'karsilanmadi', s.uygun ? 'benzetim denetimleri hatasız' : 'benzetimde hata var'); }
      case 'kart': {
        if (!g.ref) return sonuc('bekliyor', 'hesap kartı seçilmedi');
        const r = S.kart(g.ref);
        if (!r || r.hata) return sonuc('bekliyor', 'kart hesabı yapılamıyor: ' + (r?.hata || 'veri yok'));
        return sonuc(r.uygun ? 'karsilandi' : 'karsilanmadi', r.uygun ? 'kart uygun' : 'kartta sınır aşımı var');
      }
      case 'elek': { const e = S.elek; if (!e || !e.devreler?.length) return sonuc('bekliyor', 'elektrik yükü yok'); return sonuc(e.uygun ? 'karsilandi' : 'karsilanmadi', e.uygun ? 'tüm devreler uygun' : 'elektrik hesabında hata var'); }
      case 'plc': { const p = S.plc; if (!p || !p.adimSayisi) return sonuc('bekliyor', 'PLC adımı yok'); return sonuc(p.uygun ? 'karsilandi' : 'karsilanmadi', p.uygun ? 'PLC denetimi hatasız' : 'PLC denetiminde hata var'); }
      case 'guvIslev': {
        const f = (S.guv?.F || []).find((x) => String(x.f.id) === String(g.ref));
        if (!f) return sonuc('bekliyor', 'güvenlik işlevi seçilmedi');
        return sonuc(f.d.dogrulandi ? 'karsilandi' : 'karsilanmadi', `${f.f.ad}: PLr ${f.d.PLr || '—'}, PL ${f.d.PL || '—'}`);
      }
      case 'guvTam': { const o = S.guv; if (!o || !o.T.length) return sonuc('bekliyor', 'risk değerlendirmesi yok'); return sonuc(o.tam ? 'karsilandi' : 'karsilanmadi', o.tam ? 'güvenlik değerlendirmesi tam' : 'güvenlikte eksik / hata var'); }
      default: return sonuc('bekliyor', 'bilinmeyen ölçüt');
    }
  } catch (e) { return sonuc('bekliyor', 'değerlendirilemedi: ' + e.message); }
}
export function matris(Z, S) {
  const satir = Z.gereksinimler.map((g) => ({ g, ...degerlendir(g, S) }));
  const say = { karsilandi: 0, karsilanmadi: 0, bekliyor: 0, toplam: satir.length };
  for (const r of satir) say[r.durum]++;
  const zorunluAcik = satir.filter((r) => r.g.oncelik === 'zorunlu' && r.durum !== 'karsilandi').length;
  return { satir, say, zorunluAcik, tamam: satir.length > 0 && zorunluAcik === 0 && say.karsilanmadi === 0 };
}
const csvq = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function matrisCSV(M) {
  return '\ufeff' + [['Kod', 'Gereksinim', 'Kaynak', 'Öncelik', 'Doğrulama ölçütü', 'Hedef', 'Durum', 'Kanıt'].join(';'), ...M.satir.map((r) => [r.g.kod, r.g.metin, KAYNAK[r.g.kaynak], ONCELIK[r.g.oncelik], OLCUT[r.g.olcut], fin(r.g.hedef) ? String(r.g.hedef).replace('.', ',') : '', DURUM[r.durum], r.kanit].map(csvq).join(';'))].join('\r\n');
}

/* ---------- Revizyonlar ---------- */
export const sonrakiRev = (Z) => { const n = Z.revizyonlar.length; return n < 26 ? String.fromCharCode(65 + n) : String.fromCharCode(64 + Math.floor(n / 26)) + String.fromCharCode(65 + (n % 26)); };
export function revizyonAc(Z, P, M, { aciklama = '', hazirlayan = '' } = {}, simdi = new Date()) {
  const son = Z.revizyonlar[Z.revizyonlar.length - 1];
  if (son && son.durum === 'taslak') throw new Error(`Rev ${son.rev} henüz onaylanmadı: önce onu onayla ya da sil`);
  if (!String(aciklama).trim()) throw new Error('Revizyon açıklaması (ne değişti) yazılmalı');
  const r = { rev: sonrakiRev(Z), tarih: simdi.toISOString(), aciklama: String(aciklama).slice(0, 300), hazirlayan: String(hazirlayan).slice(0, 60), kontrol: '', onay: '', durum: 'taslak', onayTarih: '', iz: parmakIzi(P), ozet: { ...M.say } };
  Z.revizyonlar.push(r); return r;
}
export function revizyonOnayla(Z, P, M, { kontrol, onay }, simdi = new Date()) {
  const r = Z.revizyonlar[Z.revizyonlar.length - 1];
  if (!r || r.durum !== 'taslak') throw new Error('Onaylanacak taslak revizyon yok');
  const h = r.hazirlayan.trim(), k = String(kontrol || '').trim(), o = String(onay || '').trim();
  if (!h || !k || !o) throw new Error('Hazırlayan, kontrol eden ve onaylayan adları yazılmalı');
  if (o.toLocaleLowerCase('tr') === h.toLocaleLowerCase('tr')) throw new Error('Onaylayan, hazırlayandan farklı kişi olmalı (dört göz ilkesi)');
  if (parmakIzi(P) !== r.iz) throw new Error('Revizyon açıldıktan sonra proje değişti: revizyonu sil ve yeniden aç');
  if (M.say.karsilanmadi > 0) throw new Error(`${M.say.karsilanmadi} gereksinim karşılanmıyor: onaylanamaz`);
  r.kontrol = k.slice(0, 60); r.onay = o.slice(0, 60); r.durum = 'onayli'; r.onayTarih = simdi.toISOString();
  return r;
}
export function revizyonSil(Z) {
  const r = Z.revizyonlar[Z.revizyonlar.length - 1];
  if (!r) throw new Error('Revizyon yok');
  if (r.durum === 'onayli') throw new Error('Onaylı revizyon silinemez (geçmiş korunur); değişiklik için yeni revizyon aç');
  Z.revizyonlar.pop(); return r;
}
export function revizyonDurum(Z, P) {
  const onayli = [...Z.revizyonlar].reverse().find((r) => r.durum === 'onayli') || null;
  const taslak = Z.revizyonlar.find((r) => r.durum === 'taslak') || null;
  const iz = parmakIzi(P);
  return { onayli, taslak, iz, degisti: onayli ? onayli.iz !== iz : null, taslakDegisti: taslak ? taslak.iz !== iz : null };
}

/* ---------- STEP (ISO 10303-21) ---------- */
// Dizgi kodlaması: ' → '', \ → \\, ASCII dışı → \X2\hhhh…\X0\ (UTF-16, büyük harf onaltılık); BMP dışı → \X4\
export function p21Dizgi(s) {
  let out = '', buf2 = '', buf4 = '';
  const flush = () => { if (buf2) { out += '\\X2\\' + buf2 + '\\X0\\'; buf2 = ''; } if (buf4) { out += '\\X4\\' + buf4 + '\\X0\\'; buf4 = ''; } };
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x20 && cp <= 0x7e) { flush(); out += ch === "'" ? "''" : ch === '\\' ? '\\\\' : ch; }
    else if (cp < 0x20 || cp === 0x7f) { flush(); out += ' '; }
    else if (cp <= 0xffff) { if (buf4) flush(); buf2 += cp.toString(16).toUpperCase().padStart(4, '0'); }
    else { if (buf2) flush(); buf4 += cp.toString(16).toUpperCase().padStart(8, '0'); }
  }
  flush();
  return out;
}
// OCCT çıktısındaki dizgilerde ASCII dışı karakterleri kodlar (dizgi dışında ASCII dışı karakter olmaz)
export function p21Kodla(text) {
  return text.replace(/'((?:[^']|'')*)'/g, (m, inner) => (/[^\x20-\x7e]/.test(inner) ? "'" + p21Dizgi(inner.replace(/''/g, "'").replace(/\\\\/g, '\\')) + "'" : m));
}
// HEADER bölümünü proje / revizyon bilgisiyle yeniden yazar; FILE_SCHEMA olduğu gibi kalır
export function stepBaslik(text, { ad = 'model', aciklama = '', yazar = '', kurum = '', onay = '', zaman = new Date() } = {}) {
  const h0 = text.indexOf('HEADER;'), h1 = text.indexOf('ENDSEC;', h0);
  if (h0 < 0 || h1 < 0) throw new Error('STEP başlığı bulunamadı');
  const head = text.slice(h0, h1), sm = /FILE_SCHEMA\s*\(\s*\([\s\S]*?\)\s*\)\s*;/.exec(head);
  if (!sm) throw new Error('STEP şema satırı bulunamadı');
  const q = (s) => "'" + p21Dizgi(s) + "'";
  const zs = zaman.toISOString().replace(/\.\d+Z$/, '');
  const yeni = 'HEADER;\n' +
    `FILE_DESCRIPTION((${q(aciklama || ad)}),'2;1');\n` +
    `FILE_NAME(${q(ad)},'${zs}',(${q(yazar)}),(${q(kurum)}),'Open CASCADE STEP processor',${q('Çizim Atölyesi')},${q(onay)});\n` +
    sm[0].replace(/\s+/g, ' ') + '\n';
  return p21Kodla(text.slice(0, h0) + yeni + text.slice(h1));
}

/* ---------- Rapor ---------- */
export function izRapor(Z, M, RD, proje = '') {
  const L = ['ÇİZİM ATÖLYESİ — MEKATRONİK MÜHENDİSLİĞİ İZLENEBİLİRLİK RAPORU', 'Gereksinimler, doğrulama matrisi ve revizyon geçmişi' + (proje ? ' · ' + proje : '')];
  L.push('Sonuç: ' + (M.tamam ? 'TÜM ZORUNLU GEREKSİNİMLER KARŞILANDI' : `AÇIK: ${M.zorunluAcik} zorunlu gereksinim karşılanmadı / değerlendirilmedi`), '');
  L.push('ÖZET', `  Toplam ${M.say.toplam} · karşılandı ${M.say.karsilandi} · karşılanmadı ${M.say.karsilanmadi} · değerlendirilmedi ${M.say.bekliyor}`);
  L.push(`  Proje parmak izi (SHA-256): ${RD.iz}`);
  if (RD.onayli) L.push(`  Son onaylı revizyon: ${RD.onayli.rev} (${RD.onayli.onayTarih.slice(0, 10)}) — ${RD.degisti ? 'ONAYDAN SONRA DEĞİŞTİ' : 'değişmedi'}`);
  else L.push('  Onaylı revizyon yok');
  L.push('', 'DOĞRULAMA MATRİSİ');
  for (const r of M.satir) L.push(`  ${r.g.kod} [${ONCELIK[r.g.oncelik]}] ${r.g.metin || '—'}`, `     ölçüt: ${OLCUT[r.g.olcut]}${fin(r.g.hedef) ? ' · hedef ' + r.g.hedef : ''} · kaynak: ${KAYNAK[r.g.kaynak]} → ${DURUM[r.durum].toUpperCase()} (${r.kanit})`);
  L.push('', 'REVİZYON GEÇMİŞİ');
  if (!Z.revizyonlar.length) L.push('  —');
  for (const r of Z.revizyonlar) L.push(`  Rev ${r.rev} · ${r.tarih.slice(0, 10)} · ${r.durum === 'onayli' ? 'ONAYLI ' + r.onayTarih.slice(0, 10) : 'TASLAK'} · ${r.aciklama}`, `     hazırlayan: ${r.hazirlayan || '—'} · kontrol: ${r.kontrol || '—'} · onay: ${r.onay || '—'} · parmak izi ${r.iz.slice(0, 16)}…`);
  L.push('', 'Parmak izi, Mekatronik proje verisinin (hesap kartları, ürün ağacı, elektrik, PLC, güvenlik, benzetim, gereksinimler) SHA-256 özetidir; tek bir değer değişse bile değişir. Onay adları kullanıcının yazdığı metindir, kimlik doğrulamalı elektronik imza değildir.');
  return L;
}
