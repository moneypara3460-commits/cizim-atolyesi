// Çalıştır: node tests/tx-model.test.mjs
// Tekstil ve Moda — Aşama 1: ortak proje altyapısı (veri modeli, dal kuralları, doğrulama, kayıt, revizyon, göç).
import assert from 'node:assert/strict';
import * as M from '../tx/model.js';
import { openStore, memoryBackend, MAX_REVS } from '../tx/store.js';

let fail = 0;
const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const errs = (p) => M.validate(p).filter((x) => x.level === 'hata');
const T0 = 1762905600000;

t('1. Üç proje türü: yalnız ilgili dal verisi oluşur', () => {
  const w = M.createProject({ name: 'Gömlek', type: 'woven', now: T0 }), k = M.createProject({ name: 'Kazak', type: 'knit', now: T0 }), x = M.createProject({ name: 'Kış', type: 'mixed', now: T0 });
  assert.ok(w.woven && !w.knit); assert.ok(k.knit && !k.woven); assert.ok(x.woven && x.knit);
  for (const p of [w, k, x]) { assert.equal(p.kind, M.KIND); assert.equal(p.schema, M.SCHEMA); assert.deepEqual(errs(p), []); }
  assert.throws(() => M.createProject({ name: 'a', type: 'deri' }), /Bilinmeyen/);
  assert.throws(() => M.createProject({ name: '  ', type: 'woven' }), /adı/);
});

t('2. Dal kuralları: dokuma projesine triko ürünü eklenemez; karma koleksiyonda ikisi de olur; tür dala uymalı', () => {
  const w = M.createProject({ name: 'a', type: 'woven' });
  assert.throws(() => M.addProduct(w, { branch: 'knit', type: 'kazak' }), /eklenemez/);
  assert.throws(() => M.addProduct(w, { branch: 'woven', type: 'kazak' }), /ürün türü yok/);
  const x = M.createProject({ name: 'b', type: 'mixed' });
  M.addProduct(x, { branch: 'woven', type: 'gomlek' }); M.addProduct(x, { branch: 'knit', type: 'kazak' });
  assert.equal(x.collection.products.length, 2); assert.deepEqual(errs(x), []);
  // elle bozulmuş veri de yakalanır
  const k = M.createProject({ name: 'c', type: 'knit' }); k.collection.products.push({ id: 'p9', branch: 'woven', type: 'gomlek', name: 'X', colors: [], sizes: [], materials: [], sizeTable: null, techpack: {} });
  assert.ok(errs(k).some((e) => /projesinde olamaz/.test(e.msg)));
  const y = M.createProject({ name: 'd', type: 'woven' }); y.knit = { swatches: [] };
  assert.ok(errs(y).some((e) => /verisi olmamalı/.test(e.msg)));
});

t('3. Malzeme kuralları: dokuma ürününe iplik, triko ürününe kumaş ana malzeme bağlanamaz; aksesuar ikisinde de yardımcı', () => {
  const x = M.createProject({ name: 'k', type: 'mixed' });
  const g = M.addProduct(x, { branch: 'woven', type: 'gomlek' }), kz = M.addProduct(x, { branch: 'knit', type: 'kazak' });
  const f = M.addMaterial(x, 'fabric', { name: 'Poplin', props: { width: 1500, gsm: 110 } }), y = M.addMaterial(x, 'yarn', { name: 'Yün 2/28', props: { countSystem: 'Nm', count: 28, ply: 2 } }), b = M.addMaterial(x, 'trim', { name: 'Düğme 11 mm' });
  M.linkMaterial(x, g.id, f.id, 'ana', 1.6); M.linkMaterial(x, kz.id, y.id, 'ana', 0.45);
  M.linkMaterial(x, g.id, b.id, 'aksesuar', 8); M.linkMaterial(x, kz.id, b.id, 'aksesuar', 5);
  assert.throws(() => M.linkMaterial(x, g.id, y.id, 'ana'), /kullanılamaz/);
  assert.throws(() => M.linkMaterial(x, kz.id, f.id, 'ana'), /kullanılamaz/);
  assert.throws(() => M.linkMaterial(x, g.id, b.id, 'ana'), /ana malzeme olamaz/);
  assert.deepEqual(errs(x), []);
});

t('4. Malzeme doğrulaması: sayı olmayan, sıfır, %100 üstü, sistemsiz iplik numarası, NaN fiyat yakalanır; boş (bilinmiyor) değer hata değildir', () => {
  const p = M.createProject({ name: 'm', type: 'mixed' });
  M.addMaterial(p, 'fabric', { name: 'Bilinmeyen kumaş' });
  assert.deepEqual(errs(p), [], 'boş alanlar bilinmiyor demektir');
  const bad = M.addMaterial(p, 'fabric', { name: 'Bozuk', props: { width: 0, gsm: 'yüz', shrinkWarp: 120, stretchWeft: -1 } });
  const y = M.addMaterial(p, 'yarn', { name: 'Sistemsiz', props: { count: 28 } });
  y.price = NaN; y.priceUnit = 'litre';
  const e = errs(p).map((x) => x.where + ': ' + x.msg).join('\n');
  for (const re of [/En: sıfırdan büyük/, /Gramaj: sayı değil/, /Çekme \(boy\): %0–100/, /Esneme \(en\): %0–100/, /sistemi/, /Fiyat geçersiz/, /Fiyat birimi/]) assert.match(e, re);
  void bad;
});

t('5. Beden tablosu: kaynak zorunlu; tabloda olmayan beden, yinelenen beden, geçersiz ölçü hata; azalan ölçü uyarı', () => {
  const p = M.createProject({ name: 's', type: 'woven' });
  const ex = M.exampleSizeTable(p);
  assert.match(ex.source, /standart değildir/);
  assert.equal(ex.measures['Göğüs çevresi'].M, 960); assert.equal(ex.measures['Göğüs çevresi'].XL, 1040);
  const t1 = M.addSizeTable(p, { name: 'Marka A', source: '', sizes: ['S', 'M', 'M'], measures: { Göğüs: { S: 900, M: 'x' } } });
  const pr = M.addProduct(p, { branch: 'woven', type: 'gomlek' }); pr.sizeTable = ex.id; pr.sizes = ['M', '3XL'];
  const e = errs(p).map((x) => x.msg).join('\n');
  assert.match(e, /Kaynak yazılmamış/); assert.match(e, /iki kez/); assert.match(e, /geçersiz değer: x/); assert.match(e, /3XL bedeni/);
  const t2 = M.addSizeTable(p, { name: 'Ters', source: 'kendi ölçüm', sizes: ['S', 'M'], measures: { Bel: { S: 800, M: 700 } } });
  assert.ok(M.validate(p).some((x) => x.level === 'uyarı' && /küçülüyor/.test(x.msg)));
  void t1; void t2;
});

t('6. Varyantlar ve malzeme maliyeti: renk × beden; eksik miktar / fiyat toplanmaz, ayrıca listelenir', () => {
  const p = M.createProject({ name: 'v', type: 'woven' });
  const c1 = M.addColor(p, { name: 'Beyaz', code: 'BYZ', hex: '#ffffff' }), c2 = M.addColor(p, { name: 'Lacivert', code: 'LCV', hex: '#1e2a4a' });
  const ts = M.exampleSizeTable(p);
  const pr = M.addProduct(p, { branch: 'woven', type: 'gomlek', modelCode: 'GM-01' });
  pr.colors = [c1.id, c2.id]; pr.sizeTable = ts.id; pr.sizes = ['S', 'M', 'L'];
  const v = M.variants(p, pr.id);
  assert.equal(v.length, 6); assert.equal(v[0].sku, 'GM-01-BYZ-S'); assert.equal(v[5].sku, 'GM-01-LCV-L');
  const f = M.addMaterial(p, 'fabric', { name: 'Poplin', price: 120 }), b = M.addMaterial(p, 'trim', { name: 'Düğme', price: 1.5 }), tl = M.addMaterial(p, 'trim', { name: 'Tela' });
  M.linkMaterial(p, pr.id, f.id, 'ana', 1.6); M.linkMaterial(p, pr.id, b.id, 'aksesuar', 8); M.linkMaterial(p, pr.id, tl.id, 'yardımcı', 0.2);
  const c = M.materialCost(p, pr.id);
  assert.ok(Math.abs(c.total - (1.6 * 120 + 8 * 1.5)) < 1e-9); assert.equal(c.complete, false); assert.deepEqual(c.missing, ['Tela (fiyat yok)']);
  assert.throws(() => M.addColor(p, { name: 'x', hex: 'kırmızı' }), /RRGGBB/);
});

t('7. Föy özeti: başlık, renkler, seçili bedenlerin ölçüleri, malzemeler (tahmini işaretiyle), varyant, maliyet, ürüne ait sorunlar', () => {
  const p = M.createProject({ name: 'Kış 27', type: 'knit', season: 'KŞ27', brand: 'Atölye' });
  const ts = M.exampleSizeTable(p, 'knit');
  const y = M.addMaterial(p, 'yarn', { name: 'Merinos', props: { countSystem: 'Nm', count: 28, ply: 2 }, estimated: ['twist'], price: 900, priceUnit: 'kg' });
  const pr = M.addProduct(p, { branch: 'knit', type: 'kazak', modelCode: 'KZ-7' }); pr.sizeTable = ts.id; pr.sizes = ['S', 'M'];
  M.linkMaterial(p, pr.id, y.id, 'ana', null);
  const s = M.techpackSummary(p, pr.id);
  assert.equal(s.header.collection, 'Atölye · KŞ27'); assert.equal(s.header.branch, 'Triko / Örgü'); assert.equal(s.header.type, 'Kazak');
  assert.deepEqual(Object.keys(s.sizeTable.measures['Göğüs çevresi']), ['S', 'M']);
  assert.deepEqual(s.materials[0].estimated, ['twist']);
  assert.deepEqual(s.cost.missing, ['Merinos (miktar yok)']);
  assert.ok(s.issues.some((x) => /Renk seçilmemiş/.test(x.msg)));
});

t('8. Depo: otomatik kayıt revizyon açmaz; revizyon kaydı tam kopya saklar, eski revizyona dönüş yeni revizyon olur', async () => {
  const S = openStore(memoryBackend());
  const p = M.createProject({ name: 'Rev', type: 'woven', now: T0 });
  await S.put(p, { now: T0 }); assert.equal(p.rev, 0);
  M.addColor(p, { name: 'Ekru', hex: '#efe6d2' }); await S.commit(p, 'renk', { now: T0 + 1 });
  M.addProduct(p, { branch: 'woven', type: 'etek' }); await S.commit(p, 'etek', { now: T0 + 2 });
  const q = await S.get(p.id); assert.equal(q.rev, 2); assert.equal(q.collection.products.length, 1);
  const rs = await S.revisions(p.id); assert.deepEqual(rs.map((r) => [r.rev, r.note]), [[1, 'renk'], [2, 'etek']]);
  const r = await S.restore(p.id, 1, { now: T0 + 3 });
  assert.equal(r.rev, 3); assert.equal(r.collection.products.length, 0); assert.equal(r.library.colors.length, 1);
  assert.equal((await S.revisions(p.id)).length, 3, 'geçmiş silinmedi');
  for (let i = 0; i < MAX_REVS + 5; i++) await S.commit(r, 'r' + i);
  assert.equal((await S.revisions(p.id)).length, MAX_REVS);
  await assert.rejects(S.restore(p.id, 1), /bulunamadı/);
  assert.equal((await S.list()).length, 1);
  await S.remove(p.id); assert.equal((await S.list()).length, 0); assert.equal(await S.get(p.id), null);
});

t('9. Dışa / içe aktarma: tüm veri korunur, yeni kimlik alır, var olan projenin üstüne yazmaz', async () => {
  const S = openStore(memoryBackend());
  const p = M.createProject({ name: 'Yedek', type: 'mixed' });
  const c = M.addColor(p, { name: 'Bordo', hex: '#6d1a2a' }); const ts = M.exampleSizeTable(p);
  const g = M.addProduct(p, { branch: 'woven', type: 'ceket' }); g.colors = [c.id]; g.sizeTable = ts.id; g.sizes = ['M'];
  M.addProduct(p, { branch: 'knit', type: 'hirka' });
  await S.commit(p, 'ilk');
  const txt = S.exportJSON(p), q = await S.importJSON(txt);
  assert.notEqual(q.id, p.id); assert.equal((await S.list()).length, 2);
  const strip = (o) => { const z = JSON.parse(JSON.stringify(o)); for (const k of ['id', 'name', 'rev', 'modified', 'revisions']) delete z[k]; return z; };
  assert.deepEqual(strip(q), strip(p));
  assert.equal((await S.get(p.id)).name, 'Yedek');
});

t('10. Göç ve bozuk dosya: tekstil olmayan / bozuk / daha yeni şema reddedilir; şema 0 yükseltilir', () => {
  assert.throws(() => M.migrate('{bozuk'), SyntaxError);
  assert.throws(() => M.migrate({ parts: [] }), /tekstil projesi değil/);
  assert.throws(() => M.migrate({ kind: M.KIND, schema: 99 }), /daha yeni/);
  assert.throws(() => M.migrate({ kind: M.KIND, schema: 'x' }), /okunamadı/);
  const p = M.migrate({ kind: M.KIND, schema: 0, type: 'woven', id: 'a', name: 'Eski', woven: { pieces: [] }, library: { colors: [{ id: 'c7', name: 'x', hex: '#000000' }], materials: [] } });
  assert.equal(p.schema, 1); assert.equal(p.nextId, 8); assert.deepEqual(p.collection.products, []);
  assert.deepEqual(errs(p), []);
  const c = M.addColor(p, { name: 'y', hex: '#111111' }); assert.equal(c.id, 'c8', 'kimlik çakışmaz');
});

t('11. Makine projeleri ile ayrılık: tekstil modülleri makine dosyalarını içe aktarmaz', async () => {
  const fs = await import('node:fs');
  for (const f of ['tx/model.js', 'tx/store.js']) {
    const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
    const imps = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
    assert.ok(imps.every((i) => i.startsWith('./')), f + ' yalnız tx/ içinden içe aktarır: ' + imps);
    assert.ok(!/cizim:projects|cizim:auto/.test(src), f + ' makine kayıtlarına dokunmaz');
  }
});

for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message).split('\n')[0]); }
}
console.log(fail ? `\n${fail} test başarısız` : '\nTüm testler geçti');
process.exit(fail ? 1 : 0);
