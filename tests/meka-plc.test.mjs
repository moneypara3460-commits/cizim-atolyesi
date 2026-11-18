// Çalıştır: node tests/meka-plc.test.mjs
// Mekatronik 5. aşama — PLC: G/Ç listesi, adres atama, koşul dili, denetimler, IEC 61131-3 ST ve PLCopen XML üretimi.
// PLCopen TC6 v2.01 şeması yerelde varsa (PLCOPEN_XSD ya da /tmp/xsd/bz/plcopen/tc6_xml_v201.xsd) XML xmllint ile doğrulanır.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tagOner, tagHata, adresAta, kosulCoz, plcEmpty, plcSanitize, sinyalEkle, adimEkle, agactanSinyaller, plcCheck, stKod, plcopenXml, gcListesi, gcCSV, adimSemasi, plcRapor, plcOrnek } from '../meka/plc.js';

let fail = 0;
const t = (name, fn) => {
  try { fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
};
const T0 = new Date('2026-11-18T20:00:00Z');

t('Tanımlayıcı kuralları (IEC 61131-3): Türkçe karakter, ardışık / sonda alt çizgi, ayrılmış sözcük, büyük-küçük harf', () => {
  assert.equal(tagHata('B1_Parca_Var'), null);
  assert.match(tagHata('Parça'), /Türkçe/); assert.match(tagHata('1B'), /harf ya da alt çizgi/);
  assert.match(tagHata('A__B'), /ardışık/); assert.match(tagHata('AB_'), /bitemez/);
  assert.match(tagHata('ton'), /ayrılmış/); assert.match(tagHata('Adim'), /ayrılmış/); assert.match(tagHata('x'.repeat(33)), /32/);
  assert.equal(tagOner('Silindir ileri sensörü'), 'Silindir_ileri_sensoru');
  assert.equal(tagOner('2. valf'), 'S_2_valf');
  assert.equal(tagOner('TON'), 'TON_1');
  assert.equal(tagOner('Valf', new Set(['VALF'])), 'Valf_2');
  for (const s of ['Çıkış -- (ana)', '___', 'İŞ ŞÜÖ', 'end_if']) assert.equal(tagHata(tagOner(s)), null, s);
});
t('Adres atama: elle verilen korunur, kalanlar sırayla boş kanala; 8 bit sonra bayt artar', () => {
  const S = [...Array(10)].map((_, i) => ({ id: i + 1, tur: 'DI', adres: i === 1 ? '%IX0.0' : '' })).concat([{ id: 20, tur: 'AI', adres: '' }, { id: 21, tur: 'DO', adres: '' }]);
  const a = adresAta(S);
  assert.equal(a.get(2), '%IX0.0'); assert.equal(a.get(1), '%IX0.1'); assert.equal(a.get(8), '%IX0.7'); assert.equal(a.get(9), '%IX1.0'); assert.equal(a.get(10), '%IX1.1');
  assert.equal(a.get(20), '%IW0'); assert.equal(a.get(21), '%QX0.0');
});
t('Koşul dili: öncelik NOT > AND > OR, parantez, Türkçe karşılıklar, adım süresi; hatalar açık', () => {
  assert.equal(kosulCoz('A AND NOT B OR C').st, 'A AND NOT B OR C');
  assert.equal(kosulCoz('a ve (b veya değil c)').st, 'a AND (b OR NOT c)');
  const z = kosulCoz('B3 AND T>=1,5s'); assert.equal(z.st, 'B3 AND (AdimZaman.ET >= T#1500MS)'); assert.deepEqual(z.zamanlar, [1500]);
  assert.equal(kosulCoz('T >= 500ms').st, '(AdimZaman.ET >= T#500MS)'); assert.equal(kosulCoz('T>=2dk').st, '(AdimZaman.ET >= T#120000MS)');
  assert.deepEqual(kosulCoz('X1 OR x2').adlar, ['X1', 'x2']);
  assert.equal(kosulCoz('FALSE').sabitYanlis, true);
  assert.throws(() => kosulCoz(''), /boş/); assert.throws(() => kosulCoz('(A AND B'), /kapanmamış/); assert.throws(() => kosulCoz('A B'), /AND \/ OR eksik/);
  assert.throws(() => kosulCoz('A AND'), /eksik/); assert.throws(() => kosulCoz('A = 1'), /anlaşılmayan/); assert.throws(() => kosulCoz('A)'), /fazla kapanan/);
  assert.throws(() => kosulCoz('T>=0s'), /1 ms/);
});
t('Örnek dolum istasyonu: denetim temiz; kart / yedek hesabı; kilit sağlanıyor; sıra başa dönüyor', () => {
  const P = plcOrnek(), ch = plcCheck(P);
  assert.equal(ch.uygun, true, ch.kontroller.filter((c) => !c.ok).map((c) => c.metin).join(' | '));
  assert.ok(!ch.kontroller.some((c) => !c.ok && c.duzey === 'uyari'), ch.kontroller.filter((c) => !c.ok).map((c) => c.metin).join(' | '));
  // 4 DI × 1,2 = 4,8 → 5 kanal → 16'lık 1 kart, 12 boş
  assert.deepEqual(ch.moduller.DI, { n: 4, kart: 16, modul: 1, yedek: 12 });
  assert.ok(ch.kontroller.some((c) => c.ok && /Kilit Y1_Silindir_Ileri ⟂ Y2_Silindir_Geri/.test(c.metin)));
});
t('Denetim hataları: bilinmeyen sinyal, analog koşulda, kilit ihlali, ad çakışması, geçersiz adres, ulaşılamayan adım, dönmeyen sıra', () => {
  const P = plcOrnek();
  const [a0, a1, a2] = P.adimlar;
  a0.kosul = 'S1_Baslat AND Yok';
  const ai = sinyalEkle(P, 'AI', { tag: 'Basinc' }); a2.kosul = 'Basinc';
  a1.cikislar.push(P.sinyaller.find((s) => s.tag === 'Y2_Silindir_Geri').id);
  P.sinyaller.push({ id: 99, tur: 'DI', tag: 's1_baslat', aciklama: '', adres: '%IX9', ref: null });
  let k = plcCheck(P).kontroller.filter((c) => !c.ok).map((c) => c.metin).join(' | ');
  for (const re of [/"Yok" adında sinyal yok/, /analog sinyal "Basinc"/, /adım 10 ikisini birlikte/, /birden çok sinyalde/, /%IX9 geçersiz/]) assert.match(k, re);
  assert.throws(() => stKod(P), /Önce hataları düzelt/);
  const Q = plcOrnek(); Q.adimlar[1].sonraki = Q.adimlar[1].id;   // adım 10 kendine döner
  k = plcCheck(Q).kontroller.filter((c) => !c.ok).map((c) => c.metin).join(' | ');
  assert.match(k, /Adım 20 "Dolum süresi" başlangıçtan ulaşılamıyor/); assert.match(k, /geri dönmüyor/);
  assert.ok(ai);
});
t('ST kodu: bildirimler, adım zamanlayıcısı, CASE geçişleri, N eylemleri, yapılandırma (beklenen satırlar birebir)', () => {
  const st = stKod(plcOrnek(), 'Dolum', T0), L = st.split('\r\n');
  for (const line of ['PROGRAM Sira_Ana', 'VAR_EXTERNAL', '  S1_Baslat : BOOL;', '  Adim : INT := 0;', '  AdimZaman : TON;', 'AdimZaman(IN := (Adim = SonAdim), PT := T#24H);', 'SonAdim := Adim;', 'CASE Adim OF',
    '  0: (* Bekle *)', '    IF S1_Baslat AND B1_Parca_Var AND B2_Silindir_Geri THEN', '      Adim := 10;', '  20: (* Dolum süresi *)', '    IF (AdimZaman.ET >= T#2000MS) THEN', '    IF NOT B1_Parca_Var AND (AdimZaman.ET >= T#1000MS) THEN', '      Adim := 0;',
    'ELSE', 'END_CASE;', 'Y1_Silindir_Ileri := (Adim = 10);', 'Y2_Silindir_Geri := (Adim = 30);', 'K1_Konveyor := (Adim = 40);', 'END_PROGRAM', 'CONFIGURATION Config0', '  RESOURCE Res0 ON PLC',
    '      S1_Baslat AT %IX0.0 : BOOL; (* Başlat butonu *)', '      Y1_Silindir_Ileri AT %QX0.0 : BOOL; (* Silindir ileri valf bobini *)', '    TASK AnaGorev(INTERVAL := T#10MS, PRIORITY := 1);', '    PROGRAM Sira WITH AnaGorev : Sira_Ana;', '  END_RESOURCE', 'END_CONFIGURATION'])
    assert.ok(L.includes(line), 'eksik satır: ' + line);
  assert.equal(L.filter((l) => /^ {2}\d+: /.test(l)).length, 5);
  assert.ok(!/\(\*[^)]*\(\*/.test(st.replace(/\*\)/g, ')')), 'iç içe yorum yok');
  // açıklamadaki yorum kapanışı temizlenir
  const P = plcOrnek(); P.sinyaller[0].aciklama = 'kötü *) yorum (* deneme';
  assert.ok(stKod(P, '', T0).includes('S1_Baslat AT %IX0.0 : BOOL; (* kötü  yorum  deneme *)'));
});
t('PLCopen XML: iyi biçimli, ST gövdesi CDATA, G/Ç adresleri; resmî TC6 v2.01 şemasına uygun (şema varsa)', () => {
  const x = plcopenXml(plcOrnek(), 'Dolum & Test', T0);
  assert.ok(x.startsWith('<?xml version="1.0" encoding="utf-8"?>') && x.includes('xmlns="http://www.plcopen.org/xml/tc6_0201"'));
  assert.ok(x.includes('<variable name="B1_Parca_Var" address="%IX0.1"><type><BOOL/></type>') && x.includes('name="Dolum &amp; Test"'));
  assert.ok(x.includes('<![CDATA[(* Adım süresi') && x.includes('creationDateTime="2026-11-18T20:00:00"'));
  const xsd = process.env.PLCOPEN_XSD || '/tmp/xsd/bz/plcopen/tc6_xml_v201.xsd';
  const lint = spawnSync('xmllint', ['--version']);
  const f = path.join(os.tmpdir(), 'meka-plc-test.xml'); fs.writeFileSync(f, x);
  if (lint.status === 0) {
    const wf = spawnSync('xmllint', ['--noout', f], { encoding: 'utf8' }); assert.equal(wf.status, 0, wf.stderr);
    if (fs.existsSync(xsd)) { const v = spawnSync('xmllint', ['--noout', '--schema', xsd, f], { encoding: 'utf8' }); assert.equal(v.status, 0, v.stderr); console.log('      (PLCopen TC6 v2.01 şemasıyla doğrulandı)'); }
    else console.log('      (şema yok: yalnız iyi biçimlilik denetlendi)');
  }
  // boş proje de geçerli XML
  const E = plcEmpty(); sinyalEkle(E, 'AI', { tag: 'Sicaklik' });
  const xe = plcopenXml(E, '', T0); fs.writeFileSync(f, xe);
  if (lint.status === 0 && fs.existsSync(xsd)) assert.equal(spawnSync('xmllint', ['--noout', '--schema', xsd, f]).status, 0);
});
t('Ürün ağacından G/Ç; proje verisi temizliği; listeler, şema ve rapor', () => {
  const P = plcEmpty();
  const items = [{ id: 1, kind: 'sensor', ad: 'Parça sensörü', deger: {} }, { id: 2, kind: 'valf', ad: '5/2 valf', deger: {} }, { id: 3, kind: 'surucu', ad: 'X sürücü', deger: {} }, { id: 4, kind: 'motor', ad: 'X motor', deger: { fren: 1 } }, { id: 5, kind: 'vida', ad: 'Vida', deger: {} }];
  const y = agactanSinyaller(P, items);
  assert.deepEqual(y.map((s) => s.tur + ':' + s.tag), ['DI:Parca_sensoru', 'DO:S_5_2_valf', 'DO:X_surucu_Etkin', 'DI:X_surucu_Hazir', 'DI:X_surucu_Ariza', 'DO:X_motor_Fren']);
  assert.equal(agactanSinyaller(P, items).length, 0);
  for (const s of P.sinyaller) assert.equal(tagHata(s.tag), null);
  const Q = plcSanitize({ ayar: { diKart: 8, yedek: 'x' }, sinyaller: [{ id: 1, tur: 'DI', tag: 'A', adres: ' %ix0.3 ' }, { id: 1, tur: 'DO' }, { id: 2, tur: 'ZZ' }], adimlar: [{ id: 5, ad: 'x', cikislar: [1, 'a'], kosul: 'A' }], kilitler: [[1, 1], [1, 2], 'x'], nextId: 0 });
  assert.equal(Q.ayar.diKart, 8); assert.equal(Q.ayar.yedek, 20); assert.equal(Q.sinyaller.length, 1); assert.equal(Q.sinyaller[0].adres, '%IX0.3');
  assert.deepEqual(Q.adimlar[0].cikislar, [1]); assert.deepEqual(Q.kilitler, [[1, 2]]); assert.equal(Q.nextId, 6);
  const R = plcOrnek(), rows = gcListesi(R);
  assert.deepEqual(rows.map((r) => r.adres).slice(0, 5), ['%IX0.0', '%IX0.1', '%IX0.2', '%IX0.3', '%QX0.0']);
  assert.match(gcCSV(rows), /^﻿Sinyal;Tür;Adres/); assert.match(gcCSV(rows), /Y1_Silindir_Ileri;Dijital çıkış;%QX0\.0;BOOL/);
  const sm = adimSemasi(R); assert.ok(sm.prims.length > 20 && sm.h > 100);
  const L = plcRapor(R, 'Dolum'); assert.ok(L.some((l) => /ADIMLAR/.test(l)) && L.some((l) => /Adım 40/.test(l)) && /UYGUN/.test(L[2]));
});

console.log(fail ? `\n${fail} test BAŞARISIZ` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
