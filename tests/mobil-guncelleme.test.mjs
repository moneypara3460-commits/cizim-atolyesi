// Android uygulama içi güncelleme: mobil/kopru.js sahte bir Capacitor ortamında, sahte Guncelleme eklentisiyle çalıştırılır.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Yayın derlemesinde (dist) mobil/ klasörü yoktur: orada test atlanır.
const YOL = new URL('../mobil/kopru.js', import.meta.url);
if (!fs.existsSync(YOL)) { console.log('atlandı: mobil/ bu ağaçta yok'); process.exit(0); }
const KOD = fs.readFileSync(YOL, 'utf8');

function ortam(bilgi, { depo = new Map(), oturum = new Map() } = {}) {
  const cagri = { kontrol: 0, baslat: [], tamamla: 0 }, dinleyiciler = {};
  const eklenti = {
    kontrol: async () => { cagri.kontrol++; return bilgi; },
    baslat: async (o) => { cagri.baslat.push(o.tur); },
    tamamla: async () => { cagri.tamamla++; },
    addListener: (ad, f) => { dinleyiciler[ad] = f; },
  };
  const govde = [];
  const eleman = () => {
    const e = { style: {}, children: [], olay: {}, id: '', textContent: '', type: '',
      setAttribute() {}, appendChild(c) { this.children.push(c); return c; },
      addEventListener(ad, f) { this.olay[ad] = f; }, remove() { const i = govde.indexOf(this); if (i >= 0) govde.splice(i, 1); } };
    return e;
  };
  const document = {
    readyState: 'complete', documentElement: { appendChild(c) { govde.push(c); } }, head: { appendChild() {} },
    body: { appendChild(c) { govde.push(c); return c; } },
    createElement: eleman, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [],
    getElementById: (id) => govde.find((e) => e.id === id) || null,
  };
  const window = {
    Capacitor: { isNativePlatform: () => true, Plugins: { Browser: { open() {}, close() {} }, App: { addListener() {} } },
      registerPlugin: (ad) => (ad === 'Guncelleme' ? eklenti : null) },
    addEventListener() {},
  };
  const ctx = {
    HTMLAnchorElement: function () {}, FileReader: function () {}, window, document, console, URL, URLSearchParams, Blob, Map, Promise, JSON, Math, Date, Number, String, Error, setTimeout, clearTimeout,
    location: { pathname: '/yeni/index.html', search: '', hash: '', origin: 'https://localhost', replace() {}, href: 'https://localhost/yeni/index.html' },
    localStorage: { getItem: (k) => (depo.has(k) ? depo.get(k) : null), setItem: (k, v) => depo.set(k, String(v)), removeItem: (k) => depo.delete(k) },
    sessionStorage: { getItem: (k) => (oturum.has(k) ? oturum.get(k) : null), setItem: (k, v) => oturum.set(k, String(v)) },
    navigator: { userAgent: 'test' },
    fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }),
  };
  ctx.window = Object.assign(window, ctx);
  vm.createContext(ctx);
  vm.runInContext(KOD, ctx);
  const serit = () => govde.find((e) => e.id === 'cizim-guncelleme') || null;
  const metin = () => { const s = serit(); return s ? s.children[0].textContent : null; };
  const dugme = (ad) => { const s = serit(); return s && s.children.slice(1).find((b) => b.textContent === ad); };
  return { cagri, dinleyiciler, depo, oturum, serit, metin, dugme };
}
const bekle = (ms = 30) => new Promise((r) => setTimeout(r, ms));

test('güncelleme yoksa şerit çıkmaz; aynı oturumda Play\'e bir kez sorulur', async () => {
  const o = ortam({ var: false });
  await bekle();
  assert.equal(o.cagri.kontrol, 1);
  assert.equal(o.serit(), null);
  const p = ortam({ var: false }, { oturum: o.oturum });   // aynı oturumda başka sayfa
  await bekle();
  assert.equal(p.cagri.kontrol, 0);
});

test('normal güncelleme: şerit çıkar; Güncelle esnek indirmeyi başlatır, inince Yeniden başlat tamamlar', async () => {
  const o = ortam({ var: true, oncelik: 2, esnek: true, aninda: true });
  await bekle();
  assert.match(o.metin(), /yeni sürümü var/);
  o.dugme('Güncelle').olay.click();
  await bekle();
  assert.deepEqual(o.cagri.baslat, ['esnek']);
  o.dinleyiciler.durum({ durum: 'indirildi' });
  assert.match(o.metin(), /indirildi/);
  o.dugme('Yeniden başlat').olay.click();
  await bekle();
  assert.equal(o.cagri.tamamla, 1);
});

test('"Sonra" 24 saat erteler; süre dolunca yeniden sorulur', async () => {
  const o = ortam({ var: true, oncelik: 0, esnek: true, aninda: true });
  await bekle();
  o.dugme('Sonra').olay.click();
  assert.equal(o.serit(), null);
  assert.ok(Number(o.depo.get('cizim:guncelleme-ertele')) > 0);
  const p = ortam({ var: true, oncelik: 0, esnek: true, aninda: true }, { depo: o.depo });
  await bekle();
  assert.equal(p.serit(), null, 'ertelenmiş');
  o.depo.set('cizim:guncelleme-ertele', String(Date.now() - 25 * 3600 * 1000));
  const r = ortam({ var: true, oncelik: 0, esnek: true, aninda: true }, { depo: o.depo });
  await bekle();
  assert.match(r.metin(), /yeni sürümü var/);
});

test('öncelik 4-5: zorunlu (anında) güncelleme; ertelense bile sorulur; vazgeçilirse kullanım engellenir', async () => {
  const depo = new Map([['cizim:guncelleme-ertele', String(Date.now())]]);
  const o = ortam({ var: true, oncelik: 5, esnek: true, aninda: true }, { depo });
  await bekle(1000);
  assert.deepEqual(o.cagri.baslat, ['aninda']);
  assert.match(o.metin(), /artık kullanılamıyor/);
  assert.equal(o.serit().style.top, '0', 'tam ekran');
  assert.ok(!o.dugme('Sonra'), 'vazgeçme düğmesi yok');
});

test('daha önce inmiş güncelleme varsa doğrudan "Yeniden başlat" gösterilir', async () => {
  const o = ortam({ var: false, indirildi: true });
  await bekle();
  assert.match(o.metin(), /indirildi/);
});
