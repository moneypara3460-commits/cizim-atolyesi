// Ayakkabı Modelhanesi — kalıptan otomatik saya parçaları: yeni projede kalıp fotoğrafı + model tipi →
// proje açılınca parçalar hazır; Saya Parçaları sayfasında önizleme, yön çevirme, ayar değiştirip yeniden oluşturma, geri alma.
// Çalıştır: node tests/e2e/ayk-auto.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer, launch, createRunner, expect, ROOT } from './lib.mjs';
import { scene, toPNG } from '../fixtures/kalip-sahne.mjs';
import { lastView } from '../fixtures/kalip-siluet.mjs';
import { insidePoly } from '../../ayk/geom.js';

const R = createRunner('ayk-auto');
const { srv, url } = await startServer();
const browser = await launch();
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auto-'));
// kalıp yan çizgisi kâğıdın ortasında, burun sağda
const lv = lastView({ L: 262 }), poly = lv.outline.nodes.map((n) => [n.p[0] + (297 - lv.length) / 2, n.p[1] + (210 - lv.height) / 2]);
const FILE = path.join(dir, 'kalip.png');
fs.writeFileSync(FILE, toPNG(scene({ shape: (u, v) => insidePoly(poly, [u, v]) })));

async function open(view, { login = true } = {}) {
  const ctx = await browser.newContext(view || { viewport: { width: 1280, height: 900 } });
  // yapay zekâ yalnız giriş yapmış kullanıcıya çalışır: testte sahte (süresi dolmamış) oturum
  if (login) await ctx.addInitScript(() => localStorage.setItem('cizim:oturum', JSON.stringify({ access_token: 'test-oturum', refresh_token: 'x', expires_at: Math.floor(Date.now() / 1000) + 3600 })));
  await ctx.route('https://unpkg.com/**', (r) => r.abort());
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  await p.goto(url + 'ayakkabi.html?liste=1'); await p.waitForSelector('[data-page="yeni"]');
  return { ctx, p, errs };
}
const state = (p) => p.evaluate(() => {
  const P = window.__ayk.S.p;
  return { names: P.pieces.map((q) => q.name), holes: P.pieces.find((q) => q.name === 'Yan saya')?.marks.filter((m) => m.kind === 'delik').length, auto: P.modelRef.auto, matches: P.matches.length };
});

await R.test('Yeni proje: kalıp fotoğrafı + "Derby" seçilince proje açıldığında saya parçaları hazır', async () => {
  const { ctx, p, errs } = await open();
  await p.click('[data-page="yeni"]');
  await p.fill('[data-n="name"]', 'Otomatik derby'); await p.dispatchEvent('[data-n="name"]', 'change');
  await p.selectOption('[data-lst="type"]', 'derby');
  await p.waitForFunction(() => /yan görünüşü<\/b> fotoğrafı gerekli/.test(document.querySelector('.lastcard').innerHTML));
  await p.setInputFiles('[data-lfile="yan"]', FILE);
  await p.waitForSelector('.lview[data-lview="yan"] .lprev svg');
  await p.waitForFunction(() => /hazır gelir/.test(document.querySelector('.lastcard').textContent));
  const t = await p.textContent('.lview[data-lview="yan"]');
  expect(/boy 26[12],\d mm/.test(t), 'kalıp boyu ~262: ' + t);
  await p.click('[data-act="create"]'); await p.waitForSelector('.ed canvas');
  await p.waitForFunction(() => /saya parçası kalıptan çıkarıldı/.test(document.getElementById('toast').textContent));
  const s = await state(p);
  expect(JSON.stringify(s.names) === JSON.stringify(['Ön saya', 'Yan saya', 'Dil']), 'parçalar: ' + s.names);
  expect(s.holes === 5 && s.matches === 1 && s.auto.pieceIds.length === 3 && s.auto.flipX === false, JSON.stringify(s));
  const bad = await p.evaluate(async () => { const B = await import('./ayk/build.js?v=20261114u'); return window.__ayk.S.p.pieces.flatMap((q) => B.checkPiece(q).filter((i) => i.level === 'hata').map((i) => q.name + ': ' + i.msg)); });
  expect(!bad.length, bad.join(' | '));
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await R.test('Saya Parçaları: önizleme, yön çevirme, ayar değiştirip yeniden oluşturma (eskiler değişir), geri alma; telefonda taşma yok', async () => {
  const { ctx, p, errs } = await open({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await p.click('[data-page="yeni"]'); await p.fill('[data-n="name"]', 'Spor deneme'); await p.dispatchEvent('[data-n="name"]', 'change');
  await p.setInputFiles('[data-lfile="yan"]', FILE); await p.waitForSelector('.lview[data-lview="yan"] .lprev svg');
  await p.click('[data-act="create"]'); await p.waitForSelector('.ed canvas');
  await p.click('[data-page="parcalar"]'); await p.waitForSelector('.autocard [data-au]');
  await p.selectOption('.autocard [data-au]', 'spor');
  await p.waitForSelector('.autocard .aprev svg text');
  expect((await p.locator('.autocard .aprev svg text').allTextContents()).join(',') === 'Ön saya,Yan saya,Dil,Burun kapağı,Topuk takviyesi', 'önizleme parçaları');
  await p.click('[data-act="aurun"]'); await p.waitForFunction(() => window.__ayk.S.p.pieces.length === 5);
  // elle eklenmiş bir parça yeniden oluşturmada kalmalı
  await p.evaluate(() => { const S = window.__ayk.S; S.p.pieces.push({ ...JSON.parse(JSON.stringify(S.p.pieces[2])), id: 'elle1', name: 'Elle parça', no: 99 }); });
  // ayar: delik 7, burun kapağı kapalı → yeniden oluştur
  await p.fill('[data-aup="eyelets"]', '7'); await p.dispatchEvent('[data-aup="eyelets"]', 'change');
  await p.uncheck('[data-aup="cap"]'); await p.waitForTimeout(150);
  await p.fill('[data-aup="backH"]', '500'); await p.dispatchEvent('[data-aup="backH"]', 'change');
  expect(await p.locator('[data-aup="backH"].bad').count() === 1, 'sınır dışı değer reddedildi');
  await p.click('[data-act="aurun"]');
  await p.waitForFunction(() => !window.__ayk.S.p.pieces.some((q) => q.name === 'Burun kapağı'));
  let s = await state(p);
  expect(s.names.length === 5 && s.names.includes('Elle parça') && s.holes === 7, 'yeniden oluşturma: ' + JSON.stringify(s.names) + ' delik ' + s.holes);
  // yön çevirme önizlemeyi ve parçaları ters çevirir
  await p.click('[data-act="auflipx"]'); await p.waitForFunction(() => window.__ayk.S.p.modelRef.auto.flipX === true);
  // geri al → çevirme öncesi
  await p.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })));
  await p.waitForFunction(() => window.__ayk.S.p.modelRef.auto.flipX === false);
  await p.evaluate(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true })));
  await p.waitForFunction(() => window.__ayk.S.p.pieces.some((q) => q.name === 'Burun kapağı'));
  s = await state(p);
  expect(s.holes === 6, 'geri al: önceki parçalar geri geldi (6 delik): ' + s.holes);
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); expect(ov <= 1, 'yatay taşma ' + ov);
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await R.test('Numara ve Kesim: numara tablosu, yerleştirme (çakışmasız), DXF indirme; telefonda taşma yok', async () => {
  const { ctx, p, errs } = await open({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
  await p.click('[data-page="yeni"]'); await p.fill('[data-n="name"]', 'Seri deneme'); await p.dispatchEvent('[data-n="name"]', 'change');
  await p.setInputFiles('[data-lfile="yan"]', FILE); await p.waitForSelector('.lview[data-lview="yan"] .lprev svg');
  await p.click('[data-act="create"]'); await p.waitForSelector('.ed canvas');
  await p.click('[data-page="parcalar"]'); await p.waitForSelector('.autocard [data-au]');
  await p.selectOption('.autocard [data-au]', 'derby'); await p.waitForSelector('.autocard .aprev svg text');
  await p.click('[data-act="aurun"]'); await p.waitForFunction(() => window.__ayk.S.p.pieces.length === 3);
  await p.click('[data-page="numara"]'); await p.waitForSelector('table.tbl tbody tr');
  const rows = await p.locator('table.tbl tbody tr').count();
  expect(rows === 5, 'taban ±2 numara: ' + rows);
  await p.fill('[data-nk="w"]', '1400'); await p.dispatchEvent('[data-nk="w"]', 'change');
  await p.click('[data-act="nkrun"]'); await p.waitForSelector('.nestprev svg', { timeout: 60000 });
  const m = await p.locator('.page p.m').first().innerText();
  expect(/çakışma yok/.test(m) && !/sığmadı/.test(m), 'yerleşim: ' + m);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act="nkdxf"]')]);
  expect(/-kesim\.dxf$/.test(dl.suggestedFilename()), 'dxf adı ' + dl.suggestedFilename());
  const ov = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth); expect(ov <= 1, 'yatay taşma ' + ov);
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await R.test('Model resminden yapay zekâ okuması: tip ve ayarlar uygulanır, parçalar oluşur; hata anlaşılır gösterilir', async () => {
  const { ctx, p, errs } = await open();
  let calls = 0, mode = 'ok';
  await ctx.route('https://anqfdlahimxdjovecsyk.supabase.co/functions/v1/ayk-model-oku', async (r) => {
    calls++;
    const body = JSON.parse(r.request().postData() || '{}');
    if (!/^data:image\/jpeg;base64,/.test(body.image || '')) return r.fulfill({ status: 400, contentType: 'application/json', body: '{"error":"resim yok"}' });
    if (mode === 'kapali') return r.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: 'Yapay zekâ okuması henüz açılmadı (anahtar ayarlanmadı).' }) });
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, result: { type: 'oxford', cap: true, eyelets: 4, throat: 63, facing: 45, qfront: 50, capAt: 84, backHeightRatio: 0.23, view: 'side', confidence: 'medium', notes: 'Siyah burun kapaklı oxford' } }) });
  });
  await p.click('[data-page="yeni"]'); await p.fill('[data-n="name"]', 'YZ oxford'); await p.dispatchEvent('[data-n="name"]', 'change');
  await p.setInputFiles('[data-lfile="yan"]', FILE); await p.waitForSelector('.lview[data-lview="yan"] .lprev svg');
  await p.setInputFiles('[data-mfile]', FILE); await p.waitForSelector('.mthumb');
  // yeni projede: resimden tip bulunur
  await p.click('[data-act="airead"]');
  await p.waitForFunction(() => /Oxford.*burun kapaklı, 4 delik · güven: orta/.test(document.querySelector('.ainote')?.textContent || ''));
  expect(await p.inputValue('[data-lst="type"]') === 'oxford', 'model tipi seçildi');
  await p.click('[data-act="create"]'); await p.waitForSelector('.ed canvas');
  await p.waitForFunction(() => window.__ayk.S.p.pieces.length === 4);
  let s = await state(p);
  expect(s.names.includes('Burun kapağı') && s.holes === 4 && s.auto.params.backH === 60, JSON.stringify(s));
  // Saya Parçaları: servis kapalıyken anlaşılır mesaj, parçalar bozulmaz
  await p.click('[data-page="parcalar"]'); await p.waitForSelector('.autocard [data-act="airead"]');
  mode = 'kapali';
  await p.click('.autocard [data-act="airead"]');
  await p.waitForFunction(() => /henüz açılmadı/.test(document.getElementById('toast').textContent));
  s = await state(p); expect(s.names.length === 4, 'parçalar değişmedi');
  expect(calls === 2, 'istek sayısı ' + calls);
  const real = errs.filter((e) => !/status of 503/.test(e));   // 503 bu testte bilerek döndürülüyor
  expect(!real.length, real.join(' | '));
  await ctx.close();
});

await R.test('Kesim matı fotoğrafı + modelden bütün parçalar (yapay zekâ): parçalar, astar, sertlikler oluşur; yeniden oluşturma ve seçenekler', async () => {
  const { ctx, p, errs } = await open();
  const MAT = path.join(ROOT, 'tests/fixtures/kalip-mat-yan.jpg');   // gerçek kalıp, yeşil kareli kesim matı üstünde
  let sent = null;
  await ctx.route('https://anqfdlahimxdjovecsyk.supabase.co/functions/v1/ayk-parca-cikar', async (r) => {
    if (r.request().headers()['authorization'] !== 'Bearer test-oturum') return r.fulfill({ status: 401, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"error":"oturum yok"}' });
    sent = JSON.parse(r.request().postData() || '{}');
    const L = sent.last.L, H = (x) => { const T = sent.last.top; for (let i = 1; i < T.length; i++) if (x <= T[i][0]) { const f = (x - T[i - 1][0]) / (T[i][0] - T[i - 1][0] || 1); return T[i - 1][1] + f * (T[i][1] - T[i - 1][1]); } return T[T.length - 1][1]; };
    const pieces = [
      { name: 'Ön saya', kind: 'ust', layer: 0, poly: [[0.55 * L, H(0.55 * L)], [0.8 * L, H(0.8 * L)], [L - 2, H(L - 2)], [L - 2, 0], [0.55 * L, 0]] },
      { name: 'Yan saya', kind: 'ust', layer: 0, poly: [[0, 0], [0, 0.7 * H(2)], [0.3 * L, 0.6 * H(0.3 * L)], [0.56 * L, H(0.56 * L) - 12], [0.56 * L, 0]] },
      { name: 'Bağcık yeri', kind: 'ust', layer: 1, poly: [[0.35 * L, H(0.35 * L) - 10], [0.56 * L, H(0.56 * L) - 10], [0.56 * L, H(0.56 * L) - 28], [0.36 * L, H(0.36 * L) - 30]], holes: [[0.42 * L, H(0.42 * L) - 19], [0.5 * L, H(0.5 * L) - 19]], holeD: 5 },
    ];
    return r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: true, result: { model: 'Spor ayakkabı', confidence: 'medium', pieces } }) });
  });
  await p.click('[data-page="yeni"]'); await p.fill('[data-n="name"]', 'Ümit spor'); await p.dispatchEvent('[data-n="name"]', 'change');
  await p.selectOption('[data-lst="paper"]', 'MAT');
  await p.setInputFiles('[data-lfile="yan"]', MAT); await p.waitForSelector('.lview[data-lview="yan"] .lprev svg');
  await p.fill('[data-lst="lengthMm"]', '268'); await p.dispatchEvent('[data-lst="lengthMm"]', 'change');
  await p.setInputFiles('[data-mfile]', [MAT, MAT]); await p.waitForSelector('.mthumb');
  await p.click('[data-act="create"]'); await p.waitForSelector('.ed canvas');
  await p.click('[data-page="parcalar"]'); await p.waitForSelector('[data-act="aiparts"]');
  await p.click('[data-act="aiparts"]');
  await p.waitForFunction(() => window.__ayk.S.p.pieces.length >= 7, null, { timeout: 30000 });
  expect(sent && sent.images.length === 2 && Math.abs(sent.last.L - 268) < 1.5, 'gönderilen: ' + (sent && sent.images.length + ' resim, L=' + sent.last.L));
  let names = await p.evaluate(() => window.__ayk.S.p.pieces.map((q) => q.name));
  for (const n of ['Ön saya', 'Yan saya', 'Bağcık yeri', 'Ön astar', 'Arka astar', 'Kontrfort (topuk sertliği)', 'Burun sertliği']) expect(names.includes(n), n + ' yok: ' + names);
  // seçenek: astarı kapat → parçalar yeniden oluşur (sunucuya yeni istek yok)
  sent = null;
  await p.uncheck('[data-aiopt="lining"]');
  await p.waitForFunction(() => !window.__ayk.S.p.pieces.some((q) => q.name === 'Ön astar'));
  expect(sent === null, 'seçenek değişince sunucuya gidilmedi');
  names = await p.evaluate(() => window.__ayk.S.p.pieces.map((q) => q.name));
  expect(names.length === 5, 'astarsız 5 parça: ' + names);
  await p.click('[data-page="stampa"]'); await p.waitForTimeout(400);
  await p.screenshot({ path: path.join(ROOT, 'reports', 'ayk-yz-parcalar.png') });
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await R.test('Giriş yapılmamışsa yapay zekâ isteği sunucuya hiç gitmez, anlaşılır mesaj çıkar', async () => {
  const { ctx, p, errs } = await open(undefined, { login: false });
  let calls = 0;
  await ctx.route('https://anqfdlahimxdjovecsyk.supabase.co/functions/v1/**', (r) => { calls++; return r.abort(); });
  await p.click('[data-page="yeni"]'); await p.fill('[data-n="name"]', 'girişsiz'); await p.dispatchEvent('[data-n="name"]', 'change');
  await p.setInputFiles('[data-lfile="yan"]', FILE); await p.waitForSelector('.lview[data-lview="yan"] .lprev svg');
  await p.setInputFiles('[data-mfile]', FILE); await p.waitForSelector('.mthumb');
  await p.click('[data-act="airead"]');
  await p.waitForFunction(() => /Google ile giriş yap/.test(document.getElementById('toast').textContent));
  const csp = await p.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  expect(/'wasm-unsafe-eval'/.test(csp) && !/'unsafe-eval'/.test(csp), 'ayakkabı sayfası CSP: ' + csp);
  expect(calls === 0, 'sunucuya istek gitti: ' + calls);
  expect(!errs.length, errs.join(' | '));
  await ctx.close();
});

await browser.close(); srv.close(); fs.rmSync(dir, { recursive: true, force: true });
const sum = R.summary(); fs.mkdirSync(path.join(ROOT, 'reports'), { recursive: true }); fs.writeFileSync(path.join(ROOT, 'reports', 'e2e-ayk-auto.json'), JSON.stringify(sum, null, 1));
console.log('\n' + JSON.stringify(sum.counts));
process.exit(sum.counts['başarısız'] ? 1 : 0);
