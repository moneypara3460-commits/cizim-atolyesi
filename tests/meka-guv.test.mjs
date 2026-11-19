// Çalıştır: node tests/meka-guv.test.mjs
// Mekatronik 6. aşama — güvenlik. Beklenen değerler kaynaklardaki örneklerden ve elle hesaptan (yorumlarda).
import assert from 'node:assert/strict';
import { plr, fOner, pfhPL, mttfd, guvEmpty, guvSanitize, tehlikeEkle, fonkEkle, altEkle, tehlikeDegerlendir, fonkDegerlendir, guvOzet, riskCSV, guvRapor, guvOrnek, KONTROL } from '../meka/guv.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
};
const near = (a, b, rel) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${a} ≉ ${b}`);

t('ISO 13849-1 Ek A risk grafiği: 8 birleşim (a … e)', () => {
  const beklenen = { S1F1P1: 'a', S1F1P2: 'b', S1F2P1: 'b', S1F2P2: 'c', S2F1P1: 'c', S2F1P2: 'd', S2F2P1: 'd', S2F2P2: 'e' };
  for (const [k, v] of Object.entries(beklenen)) assert.equal(plr(k.slice(0, 2), k.slice(2, 4), k.slice(4)).plr, v, k);
  assert.throws(() => plr('S2', '', 'P1'), /seçilmeli/);
});
t('2023: düşük olasılık indirimi yalnız gerekçeyle ve bir seviye; PLr a altına inmez', () => {
  assert.deepEqual(plr('S2', 'F2', 'P2', true, 'Yılda bir kez bakımda, iki kişi'), { temel: 'e', plr: 'd', indirim: true, gerekceEksik: false });
  const g = plr('S2', 'F2', 'P2', true, ''); assert.equal(g.plr, 'e'); assert.equal(g.gerekceEksik, true);
  assert.equal(plr('S1', 'F1', 'P1', true, 'yeterince uzun gerekçe').plr, 'a');
});
t('F önerisi: 15 dakikada birden sık ya da çalışma süresinin %5\'inden (1/20) fazla → F2', () => {
  assert.equal(fOner(10, null), 'F2'); assert.equal(fOner(30, 2), 'F1'); assert.equal(fOner(60, 6), 'F2'); assert.equal(fOner(15, 5), 'F1'); assert.equal(fOner(null, null), null);
});
t('Tablo 2 PFHD → PL sınırları', () => {
  assert.equal(pfhPL(9.99e-8), 'e'); assert.equal(pfhPL(1e-7), 'd'); assert.equal(pfhPL(9.99e-7), 'd'); assert.equal(pfhPL(1e-6), 'c');
  assert.equal(pfhPL(2.99e-6), 'c'); assert.equal(pfhPL(3e-6), 'b'); assert.equal(pfhPL(1e-5), 'a'); assert.equal(pfhPL(1e-4), '-'); assert.equal(pfhPL(5e-9), 'e'); assert.equal(pfhPL(0), null);
});
t('Ek C MTTFD: 220 gün × 8 saat, 1 çevrim/saat → nop 1760; B10D 26 400 → 150 yıl, T10D 15 yıl (üretici sertifikası örneği)', () => {
  const r = mttfd({ B10d: 26400, dop: 220, hop: 8, tcycle: 3600 });
  near(r.nop, 1760, 1e-12); near(r.MTTFd, 150, 1e-12); near(r.T10d, 15, 1e-12); assert.equal(r.seviye, 'yüksek'); assert.equal(r.varsayim, false);
  near(mttfd({ B10d: 1.1e6, dop: 220, hop: 8, tcycle: 3600 }).MTTFd, 6250, 1e-12);
  const b = mttfd({ B10: 13200, dop: 220, hop: 8, tcycle: 3600 }); near(b.B10d, 26400, 1e-12); assert.equal(b.varsayim, true);
  assert.equal(mttfd({ B10d: 20000, dop: 250, hop: 16, tcycle: 10 }).seviye, 'yetersiz (3 yıldan az)');   // nop 1 440 000 → 0,139 yıl
  assert.throws(() => mttfd({ dop: 220, hop: 8, tcycle: 1 }), /B10D/); assert.throws(() => mttfd({ B10d: 1, dop: 400, hop: 8, tcycle: 1 }), /1–366/);
});
t('Güvenlik işlevi: seri alt sistemlerde PFHD toplanır; üç PL e cihaz → PL d; en düşük alt sistem sınırı', () => {
  const G = guvEmpty(), f = fonkEkle(G, { guvenliDurum: 'durur' });
  tehlikeEkle(G, { S: 'S2', F: 'F2', P: 'P1', aciklama: 'x', koruyucu: 'kapak', fonk: [f.id] });   // PLr d
  for (const r of ['giris', 'mantik', 'cikis']) altEkle(G, f, { rol: r, ad: r, PL: 'e', PFH: 4e-8 });
  let d = fonkDegerlendir(f, G);
  near(d.PFH, 1.2e-7, 1e-12); assert.equal(d.plToplam, 'd'); assert.equal(d.PL, 'd'); assert.equal(d.PLr, 'd'); assert.equal(d.dogrulandi, true);
  // ışık perdesi PL c (2,5e-6) + PL e + PL d → toplam 2,615e-6 → c; en düşük c → c < PLr d
  const H = guvEmpty(), g = fonkEkle(H, { guvenliDurum: 'durur' });
  tehlikeEkle(H, { S: 'S2', F: 'F1', P: 'P2', aciklama: 'x', koruyucu: 'k', fonk: [g.id] });
  altEkle(H, g, { rol: 'giris', PL: 'c', PFH: 2.5e-6 }); altEkle(H, g, { rol: 'mantik', PL: 'e', PFH: 1.5e-8 }); altEkle(H, g, { rol: 'cikis', PL: 'd', PFH: 1e-7 });
  d = fonkDegerlendir(g, H);
  near(d.PFH, 2.615e-6, 1e-9); assert.equal(d.PL, 'c'); assert.equal(d.dogrulandi, false); assert.equal(d.uygun, false);
  assert.ok(d.kontroller.some((c) => !c.ok && /Ulaşılan PL c ≥ gereken PLr d/.test(c.metin)));
  // en düşük PL sınırı: PFH toplamı e aralığında olsa da bir alt sistem PL d ise işlev d
  const K = guvEmpty(), h = fonkEkle(K, { guvenliDurum: 'x' });
  altEkle(K, h, { rol: 'giris', PL: 'd', PFH: 2e-8 }); altEkle(K, h, { rol: 'mantik', PL: 'e', PFH: 1e-9 }); altEkle(K, h, { rol: 'cikis', PL: 'e', PFH: 1e-9 });
  assert.equal(fonkDegerlendir(h, K).PL, 'd');
  const Z = guvEmpty(), z = fonkEkle(Z, { guvenliDurum: 'x' });
  altEkle(Z, z, { rol: 'giris', PL: 'a', PFH: 6e-5 }); altEkle(Z, z, { rol: 'cikis', PL: 'a', PFH: 6e-5 });
  const dz = fonkDegerlendir(z, Z); assert.equal(dz.PL, null); assert.ok(dz.kontroller.some((c) => !c.ok && /hiçbir PL/.test(c.metin)));
});
t('Tutarsız üretici verisi, eksik veri ve bağlı tehlike yok uyarıları', () => {
  const G = guvEmpty(), f = fonkEkle(G);
  altEkle(G, f, { rol: 'giris', ad: 'Anahtar', PL: 'e', PFH: 5e-7 });   // 5e-7 PL d aralığı → PL e ile tutarsız
  altEkle(G, f, { rol: 'mantik', ad: 'Röle' });                          // veri yok
  const d = fonkDegerlendir(f, G), m = d.kontroller.filter((c) => !c.ok).map((c) => c.metin).join(' | ');
  assert.match(m, /Anahtar.*tutarsız/); assert.match(m, /Röle.*girilmedi/); assert.match(m, /bağlı tehlike yok/); assert.match(m, /Çıkış.*tanımlanmadı/); assert.match(m, /Güvenli durum/);
  assert.equal(d.PL, null); assert.equal(d.dogrulandi, false);
});
t('ISO 12100: önlemsiz tehlike hata; S2\'de yalnız kullanım bilgisi hata, S1\'de uyarı; risk tahmini eksik hata', () => {
  const a = tehlikeDegerlendir({ S: 'S2', F: 'F1', P: 'P1', aciklama: 'x', tasarim: '', koruyucu: '', bilgi: '', fonk: [], dusuk: false, gerekce: '' });
  assert.equal(a.uygun, false); assert.ok(a.kontroller.some((c) => /önlemi yok/.test(c.metin)));
  const b = tehlikeDegerlendir({ S: 'S2', F: 'F1', P: 'P1', aciklama: 'x', tasarim: '', koruyucu: '', bilgi: 'etiket', fonk: [], dusuk: false, gerekce: '' });
  assert.equal(b.uygun, false); assert.ok(b.kontroller.some((c) => c.duzey === 'hata' && /yerine geçmez/.test(c.metin)));
  const c = tehlikeDegerlendir({ S: 'S1', F: 'F1', P: 'P1', aciklama: 'x', tasarim: '', koruyucu: '', bilgi: 'etiket', fonk: [], dusuk: false, gerekce: '' });
  assert.equal(c.uygun, true); assert.ok(c.kontroller.some((k) => k.duzey === 'uyari'));
  assert.equal(tehlikeDegerlendir({ S: '', F: '', P: '', aciklama: 'x', tasarim: 'a', koruyucu: '', bilgi: '', fonk: [], dusuk: false, gerekce: '' }).uygun, false);
});
t('Örnek: tehlikeler ve işlevler kurulu, alt sistem verisi boş → doğrulanmadı (uydurma veri yok); kontrol listesi; temizlik ve rapor', () => {
  const G = guvOrnek(), O = guvOzet(G);
  assert.equal(O.T.length, 4); assert.equal(O.F.length, 2);
  assert.equal(O.F[0].d.PLr, 'd'); assert.equal(O.F[1].d.PLr, 'c');
  assert.ok(G.fonksiyonlar.every((f) => f.altsistemler.every((a) => !a.PL && !Number.isFinite(a.PFH))));
  assert.equal(O.uygun, false); assert.equal(O.tam, false);
  assert.equal(O.sayi.bos, KONTROL.length);
  // veriler girilince ve liste işaretlenince tamam
  for (const f of G.fonksiyonlar) for (const a of f.altsistemler) { a.PL = 'e'; a.PFH = 2e-8; }
  for (const [m] of KONTROL) G.kontrol[m] = { durum: 'uygun', not: '' };
  const O2 = guvOzet(G);
  assert.equal(O2.uygun, true, O2.F.flatMap((x) => x.d.kontroller).filter((c) => !c.ok).map((c) => c.metin).join(' | ') + O2.kontroller.map((c) => c.metin).join(' | '));
  assert.ok(O2.kontroller.every((c) => c.ok) || O2.kontroller.every((c) => c.duzey !== 'hata'));
  G.kontrol['10.7'] = { durum: 'degil', not: 'zemin sarı değil' };
  assert.equal(guvOzet(G).uygun, false);
  const S = guvSanitize(JSON.parse(JSON.stringify({ ...G, tehlikeler: [...G.tehlikeler, { id: 999, tur: 'zz', S: 'S9', fonk: [1, 12345] }], kontrol: { ...G.kontrol, '99': { durum: 'uygun' } } })));
  assert.equal(S.tehlikeler.length, 5); assert.equal(S.tehlikeler[4].tur, 'mekanik'); assert.equal(S.tehlikeler[4].S, ''); assert.deepEqual(S.tehlikeler[4].fonk, [1]);
  assert.ok(!('99' in S.kontrol)); assert.equal(S.fonksiyonlar[0].altsistemler[0].PFH, 2e-8);
  assert.match(riskCSV(G), /^\ufeffNo;Tehlike türü/); assert.match(riskCSV(G), /S2;F2;P1;d;hayır;d/);
  const L = guvRapor(G, 'Dolum'); assert.ok(L.some((l) => /GÜVENLİK İŞLEVLERİ/.test(l)) && L.some((l) => /SISTEMA/.test(l)));
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
