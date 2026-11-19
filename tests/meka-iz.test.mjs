// Çalıştır: node tests/meka-iz.test.mjs
// Mekatronik 8. aşama — izlenebilirlik: SHA-256 (FIPS 180-4 test vektörleri), kararlı JSON, gereksinim değerlendirme,
// revizyon / onay kuralları, ISO 10303-21 dizgi kodlaması ve STEP başlığı.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256, kararliJSON, parmakIzi, izEmpty, izSanitize, gereksinimEkle, degerlendir, matris, matrisCSV, revizyonAc, revizyonOnayla, revizyonSil, revizyonDurum, sonrakiRev, p21Dizgi, p21Kodla, stepBaslik, izRapor } from '../meka/iz.js';
import { simule, simOrnek } from '../meka/sim.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
};
const T0 = new Date('2026-11-19T07:00:00Z');

t('SHA-256: FIPS 180-4 test vektörleri ve Node crypto ile birebir', () => {
  assert.equal(sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  assert.equal(sha256('a'.repeat(1000000)), 'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0');
  for (const s of ['çğıöşü İ', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), '🛡 Güvenlik'] ) assert.equal(sha256(s), createHash('sha256').update(s, 'utf8').digest('hex'), s.slice(0, 10));
});
t('Kararlı JSON: anahtar sırası parmak izini değiştirmez; değer değişince değişir; revizyon kaydı hariç', () => {
  assert.equal(kararliJSON({ b: 1, a: [2, { d: NaN, c: 'x' }] }), '{"a":[2,{"c":"x","d":null}],"b":1}');
  const P1 = { calc: { vida: { m: 10, P: 5 } }, items: [], iz: { gereksinimler: [], revizyonlar: [] } };
  const P2 = { items: [], calc: { vida: { P: 5, m: 10 } }, iz: { revizyonlar: [{ rev: 'A' }], gereksinimler: [] } };
  assert.equal(parmakIzi(P1), parmakIzi(P2));
  assert.notEqual(parmakIzi(P1), parmakIzi({ ...P1, calc: { vida: { m: 10.001, P: 5 } } }));
});
t('Gereksinim değerlendirme: çevrim / adet hedefi benzetimden, kart, güvenlik işlevi, elle; veri yoksa "değerlendirilmedi"', () => {
  const sim = simule(simOrnek());   // çevrim 3,816667 s, saatte 943,2
  const S = { sim, kart: (k) => (k === 'vida' ? { uygun: true } : k === 'mil' ? { uygun: false } : { hata: 'yok' }), elek: { devreler: [1], uygun: false }, plc: { adimSayisi: 0 }, guv: { T: [1], tam: false, F: [{ f: { id: 7, ad: 'Kapak' }, d: { dogrulandi: true, PLr: 'd', PL: 'e' } }] } };
  const d = (o) => degerlendir({ elleDurum: '', kanit: '', ...o }, S).durum;
  assert.equal(d({ olcut: 'cevrim', hedef: 4 }), 'karsilandi'); assert.equal(d({ olcut: 'cevrim', hedef: 3.5 }), 'karsilanmadi');
  assert.equal(d({ olcut: 'adet', hedef: 900 }), 'karsilandi'); assert.equal(d({ olcut: 'adet', hedef: 1000 }), 'karsilanmadi');
  assert.equal(d({ olcut: 'cevrim', hedef: NaN }), 'bekliyor');
  assert.equal(d({ olcut: 'kart', ref: 'vida' }), 'karsilandi'); assert.equal(d({ olcut: 'kart', ref: 'mil' }), 'karsilanmadi'); assert.equal(d({ olcut: 'kart', ref: 'tabla' }), 'bekliyor');
  assert.equal(d({ olcut: 'guvIslev', ref: 7 }), 'karsilandi'); assert.equal(d({ olcut: 'guvIslev', ref: 9 }), 'bekliyor');
  assert.equal(d({ olcut: 'guvTam' }), 'karsilanmadi'); assert.equal(d({ olcut: 'elek' }), 'karsilanmadi'); assert.equal(d({ olcut: 'plc' }), 'bekliyor');
  assert.equal(d({ olcut: 'elle' }), 'bekliyor'); assert.equal(d({ olcut: 'elle', elleDurum: 'karsilandi' }), 'karsilandi');
  assert.match(degerlendir({ olcut: 'cevrim', hedef: 4 }, S).kanit, /çevrim 3.817 s/);
  const Z = izEmpty(); gereksinimEkle(Z, { metin: 'Çevrim ≤ 4 s', olcut: 'cevrim', hedef: 4 }); gereksinimEkle(Z, { metin: 'Kapak', olcut: 'guvIslev', ref: 7 }); gereksinimEkle(Z, { metin: 'İstek', oncelik: 'istenen' });
  const M = matris(Z, S);
  assert.deepEqual(M.say, { karsilandi: 2, karsilanmadi: 0, bekliyor: 1, toplam: 3 }); assert.equal(M.zorunluAcik, 0); assert.equal(M.tamam, true);
  assert.match(matrisCSV(M), /^\ufeffKod;Gereksinim/); assert.match(matrisCSV(M), /GR-001;Çevrim ≤ 4 s;Müşteri;Zorunlu;Benzetim: çevrim süresi ≤ hedef \(s\);4;Karşılandı/);
});
t('Revizyon: açıklamasız açılmaz; dört göz; değişiklik ve karşılanmayan gereksinim onayı engeller; onaylı silinmez', () => {
  const P = { calc: { a: 1 }, iz: izEmpty() }, Z = P.iz, M0 = { say: { karsilandi: 1, karsilanmadi: 0, bekliyor: 0, toplam: 1 } };
  assert.throws(() => revizyonAc(Z, P, M0, { aciklama: ' ' }), /açıklaması/);
  const r = revizyonAc(Z, P, M0, { aciklama: 'İlk yayın', hazirlayan: 'Deniz' }, T0);
  assert.equal(r.rev, 'A'); assert.equal(r.iz, parmakIzi(P)); assert.equal(r.durum, 'taslak');
  assert.throws(() => revizyonAc(Z, P, M0, { aciklama: 'x' }), /henüz onaylanmadı/);
  assert.throws(() => revizyonOnayla(Z, P, M0, { kontrol: 'Ali', onay: 'deniz' }), /dört göz/);
  assert.throws(() => revizyonOnayla(Z, P, M0, { kontrol: '', onay: 'Ayşe' }), /adları/);
  assert.throws(() => revizyonOnayla(Z, P, { say: { ...M0.say, karsilanmadi: 1 } }, { kontrol: 'Ali', onay: 'Ayşe' }), /karşılanmıyor/);
  P.calc.a = 2;
  assert.throws(() => revizyonOnayla(Z, P, M0, { kontrol: 'Ali', onay: 'Ayşe' }), /proje değişti/);
  P.calc.a = 1;
  revizyonOnayla(Z, P, M0, { kontrol: 'Ali', onay: 'Ayşe' }, T0);
  assert.equal(Z.revizyonlar[0].durum, 'onayli'); assert.equal(Z.revizyonlar[0].onayTarih, T0.toISOString());
  assert.throws(() => revizyonSil(Z), /Onaylı revizyon silinemez/);
  let D = revizyonDurum(Z, P); assert.equal(D.onayli.rev, 'A'); assert.equal(D.degisti, false);
  P.calc.a = 3; D = revizyonDurum(Z, P); assert.equal(D.degisti, true);
  assert.equal(sonrakiRev(Z), 'B');
  const r2 = revizyonAc(Z, P, M0, { aciklama: 'Motor değişti', hazirlayan: 'Deniz' }); assert.equal(r2.rev, 'B'); revizyonSil(Z); assert.equal(Z.revizyonlar.length, 1);
  const S = izSanitize(JSON.parse(JSON.stringify({ ...Z, revizyonlar: [...Z.revizyonlar, { rev: 'x1' }, { rev: 'C', iz: 'kısa' }] })));
  assert.equal(S.revizyonlar.length, 2); assert.equal(S.revizyonlar[1].iz, ''); assert.equal(S.revizyonlar[0].durum, 'onayli');
  const L = izRapor(Z, { satir: [], say: M0.say, zorunluAcik: 0, tamam: false }, D, 'Dolum'); assert.ok(L.some((l) => /ONAYDAN SONRA DEĞİŞTİ/.test(l)) && L.some((l) => /Rev A/.test(l)));
});
t('ISO 10303-21 dizgi kodlaması: tırnak, ters bölü, Türkçe (\\X2\\), BMP dışı (\\X4\\)', () => {
  assert.equal(p21Dizgi("Ali'nin \\ dosyası"), "Ali''nin \\\\ dosyas\\X2\\0131\\X0\\");
  assert.equal(p21Dizgi('Gövde ğüş'), 'G\\X2\\00F6\\X0\\vde \\X2\\011F00FC015F\\X0\\');
  assert.equal(p21Dizgi('a🛡b'), 'a\\X4\\0001F6E1\\X0\\b');
  assert.equal(p21Dizgi('x\ny'), 'x y');
  assert.equal(p21Kodla("#7 = PRODUCT('Mil Ø8','x','',(#8));"), "#7 = PRODUCT('Mil \\X2\\00D8\\X0\\8','x','',(#8));");
  assert.equal(p21Kodla("#1 = A('düz''tırnak');"), "#1 = A('d\\X2\\00FC\\X0\\z''t\\X2\\0131\\X0\\rnak');");
});
t('STEP başlığı: proje / revizyon / yazar yazılır, şema ve veri korunur; çıktı tümüyle ASCII', () => {
  const src = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Open CASCADE Model'),'2;1');\nFILE_NAME('Open CASCADE Shape Model','2026-11-19T06:28:00',('Author'),(\n    'Open CASCADE'),'Open CASCADE STEP processor 8.0','Open CASCADE 8.0'\n  ,'Unknown');\nFILE_SCHEMA((\n'AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF {1 0 10303 442 1 1 4 }'\n    ));\nENDSEC;\nDATA;\n#7 = PRODUCT('Dolum ünitesi','Dolum ünitesi','',(#8));\nENDSEC;\nEND-ISO-10303-21;\n";
  const out = stepBaslik(src, { ad: 'Dolum ünitesi', aciklama: 'Rev A, onaylı 2026-11-19', yazar: 'Deniz', kurum: '', onay: 'Ayşe', zaman: T0 });
  assert.ok(out.includes("FILE_DESCRIPTION(('Rev A, onayl\\X2\\0131\\X0\\ 2026-11-19'),'2;1');"));
  assert.ok(out.includes("FILE_NAME('Dolum \\X2\\00FC\\X0\\nitesi','2026-11-19T07:00:00',('Deniz'),(''),'Open CASCADE STEP processor','\\X2\\00C7\\X0\\izim At\\X2\\00F6\\X0\\lyesi','Ay\\X2\\015F\\X0\\e');"));
  assert.ok(/FILE_SCHEMA\(\( 'AP242_MANAGED_MODEL_BASED_3D_ENGINEERING_MIM_LF \{1 0 10303 442 1 1 4 \}' \)\);/.test(out));
  assert.ok(out.includes("#7 = PRODUCT('Dolum \\X2\\00FC\\X0\\nitesi','Dolum \\X2\\00FC\\X0\\nitesi','',(#8));"));
  assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(out), 'yalnız ASCII');
  assert.equal(out.match(/^ENDSEC;$/gm).length, 2);
  assert.throws(() => stepBaslik('DATA;'), /başlığı/);
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
