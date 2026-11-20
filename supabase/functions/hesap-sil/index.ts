// Çizim Atölyesi: kullanıcının hesabını ve sunucudaki bütün verisini siler (Google Play hesap silme şartı).
// İstek: POST, Authorization: Bearer <oturum>, gövde { onay: "SİL" }  →  { ok: true }
// Silinmeden önce e-postanın SHA-256 özeti deneme_kullanildi'ya yazılır (deneme tekrarlanmasın).
// Silinenler: auth kullanıcısı (profiles ve subscriptions bağlı olduğu için birlikte silinir).
// Kullanım sayaçları silinmez, kimliksiz "<tür>:_silinen" satırına aktarılır (hesap_sayac_devret): ortak günlük sınır
// silme döngüsüyle sıfırlanamaz, silinen kişinin kimliği de kalmaz. Güvenlik olaylarındaki kimlik de silinir.
// Google Play aboneliği buradan iptal edilemez: kullanıcı Google Play'den iptal eder (sayfada yazar).
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { jsonOku } from '../_shared/istek.ts';

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Yalnız POST' });
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: ud, error: ue } = tok ? await admin.auth.getUser(tok) : { data: null, error: true };
  if (ue || !ud?.user?.id) return json(401, { error: 'Önce giriş yap.' });
  const g = await jsonOku(req, 1024);
  if (g.status === 413) return json(413, { error: 'İstek çok büyük.' });
  if (g.body?.onay !== 'SİL') return json(400, { error: 'Onay eksik.' });
  const uid = ud.user.id;
  // aynı Google hesabıyla yeniden girişte deneme tekrar başlamasın: e-postanın yalnız özeti saklanır
  const mail = (ud.user.email || '').toLowerCase();
  if (mail) {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(mail));
    const h = [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const { error: e0 } = await admin.from('deneme_kullanildi').upsert({ email_hash: h }, { onConflict: 'email_hash' });
    if (e0) { console.error(e0); return json(500, { error: 'Silme yapılamadı, tekrar dene.' }); }
  }
  const { error: e1 } = await admin.rpc('hesap_sayac_devret', { p_uid: uid });
  if (e1) { console.error(e1); return json(500, { error: 'Silme yapılamadı, tekrar dene.' }); }
  const { error: e2 } = await admin.auth.admin.deleteUser(uid);
  if (e2) { console.error(e2); return json(500, { error: 'Silme yapılamadı, tekrar dene.' }); }
  console.log('hesap silindi', uid);
  return json(200, { ok: true });
});
