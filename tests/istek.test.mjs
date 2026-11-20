// Çalıştır: node tests/istek.test.mjs
// Sunucu fonksiyonlarının ortak istek yardımcıları (supabase/functions/_shared/istek.ts) ve güvenlik sıralaması.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { jsonOku, kullanici, esitMi } from '../supabase/functions/_shared/istek.ts';

const tests = [];
const t = (name, fn) => tests.push([name, fn]);
const req = (body, headers = {}) => new Request('http://x/', { method: 'POST', body, headers });
// Content-Length başlığı olmadan parça parça gelen gövde
const akis = (parcalar) => new Request('http://x/', {
  method: 'POST', duplex: 'half',
  body: new ReadableStream({ start(c) { for (const p of parcalar) c.enqueue(new TextEncoder().encode(p)); c.close(); } }),
});

t('jsonOku: geçerli gövde okunur', async () => {
  const r = await jsonOku(req(JSON.stringify({ a: 1 })), 100);
  assert.deepEqual(r.body, { a: 1 });
});
t('jsonOku: bildirilen boyut sınırı aşıyorsa okumadan 413', async () => {
  const r = await jsonOku(req('{}', { 'content-length': '5000000' }), 1000);
  assert.equal(r.status, 413);
});
t('jsonOku: başlıksız akışta sınır aşılınca okuma kesilir (413)', async () => {
  const r = await jsonOku(akis(['{"a":"', 'x'.repeat(600), 'x'.repeat(600), '"}']), 1000);
  assert.equal(r.status, 413);
  const ok = await jsonOku(akis(['{"a":', '2}']), 1000);
  assert.deepEqual(ok.body, { a: 2 });
});
t('jsonOku: bozuk JSON ve boş gövde 400', async () => {
  assert.equal((await jsonOku(req('{bozuk'), 100)).status, 400);
  assert.equal((await jsonOku(new Request('http://x/', { method: 'POST' }), 100)).status, 400);
});
t('kullanici: başlık yoksa Supabase hiç sorulmaz; geçersiz oturum null; geçerli oturum kimlik', async () => {
  let sor = 0;
  const admin = { auth: { getUser: async (tok) => { sor++; return tok === 'iyi' ? { data: { user: { id: 'u1' } }, error: null } : { data: null, error: { message: 'x' } }; } } };
  assert.equal(await kullanici(req('{}'), admin), null); assert.equal(sor, 0);
  assert.equal(await kullanici(req('{}', { authorization: 'Bearer kotu' }), admin), null);
  assert.equal(await kullanici(req('{}', { authorization: 'Bearer iyi' }), admin), 'u1');
});
t('esitMi: aynı / farklı / farklı uzunluk', () => {
  assert.ok(esitMi('gizli-anahtar', 'gizli-anahtar'));
  assert.ok(!esitMi('gizli-anahtar', 'gizli-anahtaR'));
  assert.ok(!esitMi('gizli', 'gizli-anahtar'));
  assert.ok(!esitMi('', 'x'));
});

// Kaynak sıralaması: güvenlik denetimleri işten ÖNCE gelmeli (sunucu kodu burada çalıştırılamadığı için metinden denetlenir)
const src = (f) => readFileSync(new URL('../supabase/functions/' + f + '/index.ts', import.meta.url), 'utf8');
t('yapay zekâ fonksiyonları: oturum denetimi gövde okumadan önce, sınır denetimi Anthropic çağrısından önce', () => {
  for (const f of ['ayk-model-oku', 'foto-model', 'ayk-parca-cikar']) {
    const s = src(f), a = s.indexOf('kullanici(req'), b = s.indexOf('jsonOku(req'), c = s.indexOf("rpc('ai_take_user'"), d = s.indexOf('api.anthropic.com');
    assert.ok(a > 0 && b > a && c > b && d > c, f + ' sıralama ' + [a, b, c, d]);
    assert.ok(!s.includes('req.json()'), f + ': sınırsız gövde okuma kalmamalı');
  }
});
t('play-verify: oturum → boyut sınırlı gövde → günlük sınır → Google; kayıt yalnız aynı kullanıcıya güncellenir', () => {
  const s = src('play-verify');
  const i = (k) => s.indexOf(k);
  assert.ok(i('kullanici(req') > 0 && i('jsonOku(req') > i('kullanici(req') && i("rpc('istek_al'") > i('jsonOku(req') && i('getSubscription(token)') > i("rpc('istek_al'"));
  assert.ok(!s.includes('upsert('), 'koşulsuz upsert kalmamalı');
  assert.ok(/\.update\(\{ \.\.\.row, user_id: userId \}\)\s*\.eq\('purchase_token', token\)\.eq\('user_id', userId\)/.test(s), 'güncelleme kullanıcıya bağlı');
  assert.ok(i('linkedPurchaseToken) {') > i(".insert({ ...row"), 'eski jeton ancak kayıt başarılıysa geçersiz sayılır');
});
t('güvenlik nöbetçisi: deneme e-postası anahtar ister', () => {
  const s = src('guvenlik-nobetci');
  assert.ok(/if \(test\) \{[\s\S]*NOBETCI_ANAHTAR[\s\S]*esitMi\(req\.headers\.get\('x-nobetci-anahtar'\)[\s\S]*403/.test(s));
  assert.ok(s.indexOf("rpc('guvenlik_rapor'") > s.indexOf('NOBETCI_ANAHTAR'), 'anahtar denetimi rapordan önce');
});

let fail = 0;
for (const [name, fn] of tests) {
  try { await fn(); console.log('ok   ', name); }
  catch (e) { fail++; console.log('FAIL ', name, '\n     ', String(e.message || e).split('\n').slice(0, 3).join(' / ')); }
}
if (fail) { console.log(fail + ' test başarısız'); process.exit(1); }
console.log('Hepsi geçti');
