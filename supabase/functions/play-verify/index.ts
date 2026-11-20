// Uygulama, Google Play'den aldığı satın alma jetonunu buraya gönderir.
// Jeton Google'a sorulur; geçerliyse abonelik bu kullanıcıya yazılır ve gerekiyorsa onaylanır.
// İstek: POST { productId, purchaseToken }  (Authorization: kullanıcının oturum anahtarı)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { acknowledge, ACTIVE, getSubscription, PlayError, productInfo, toRow } from '../_shared/google.ts';
import { jsonOku, kullanici } from '../_shared/istek.ts';

// Kötüye kullanım sınırı: kullanıcı başına günde 20 doğrulama, bütün kullanıcılar için günde 5000 (Google API kotası korunur).
const GUNLUK_KISI = 20, GUNLUK_TOPLAM = 5000;

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

  const userId = await kullanici(req, admin);
  if (!userId) return json(401, { error: 'Oturum geçersiz' });

  const okunan = await jsonOku(req, 16_384);
  if (!okunan.body || typeof okunan.body !== 'object') return json(okunan.status === 413 ? 413 : 400, { error: 'Geçersiz istek' });
  const body: { productId?: unknown; purchaseToken?: unknown } = okunan.body;
  const productId = typeof body.productId === 'string' ? body.productId : '';
  const token = typeof body.purchaseToken === 'string' ? body.purchaseToken : '';
  if (!productInfo(productId) || !token || token.length > 4096) return json(400, { error: 'Eksik veya hatalı ürün/jeton' });

  const { data: izin, error: ie } = await admin.rpc('istek_al', { p_tur: 'playdog', p_uid: userId, p_limit: GUNLUK_KISI, p_global: GUNLUK_TOPLAM });
  if (ie) { console.error(ie); return json(500, { error: 'Sınır kontrolü yapılamadı' }); }
  if (!izin) return json(429, { error: 'Bugün çok fazla doğrulama denendi, yarın tekrar dene.' });

  // Jeton başka bir hesaba yazılmışsa reddet (bir satın alma tek hesabı açar)
  const { data: prev } = await admin.from('subscriptions').select('user_id').eq('purchase_token', token).maybeSingle();
  if (prev && prev.user_id !== userId) return json(409, { error: 'Bu satın alma başka bir hesaba bağlı' });

  let g;
  try { g = await getSubscription(token); } catch (e) {
    if (e instanceof PlayError && e.status >= 400 && e.status < 500) return json(400, { error: 'Google Play bu satın almayı tanımadı' });
    console.error(e); return json(502, { error: 'Google Play şu an yanıt vermiyor, biraz sonra tekrar dene' });
  }
  const row = toRow(g, token);
  if (!row) return json(400, { error: 'Tanınmayan ürün' });

  // Yarışsız kayıt: önce eklenir; jeton zaten varsa YALNIZ bu kullanıcıya aitse güncellenir. İki hesap aynı jetonu aynı anda
  // gönderse bile jeton ilk yazana kalır (yukarıdaki kontrol ile bu yazma arasında başkası yazamaz).
  const { error: ie2 } = await admin.from('subscriptions').insert({ ...row, user_id: userId });
  if (ie2) {
    if (ie2.code !== '23505') { console.error(ie2); return json(500, { error: 'Kayıt yapılamadı' }); }
    const { data: up, error: ue2 } = await admin.from('subscriptions').update({ ...row, user_id: userId })
      .eq('purchase_token', token).eq('user_id', userId).select('id');
    if (ue2) { console.error(ue2); return json(500, { error: 'Kayıt yapılamadı' }); }
    if (!up || !up.length) return json(409, { error: 'Bu satın alma başka bir hesaba bağlı' });
  }
  // Paket yükseltme/düşürme: eski jeton artık geçersiz (yalnız bu kullanıcının kaydı; kayıt başarılı olduktan sonra)
  if (g.linkedPurchaseToken) {
    await admin.from('subscriptions').update({ superseded: true, updated_at: row.updated_at })
      .eq('purchase_token', g.linkedPurchaseToken).eq('user_id', userId);
  }

  if (g.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && ACTIVE.includes(row.state)) {
    try { await acknowledge(row.product_id, token); } catch (e) { console.error('onay', e); }   // bildirim gelince tekrar denenir
  }
  return json(200, { ok: true, product_id: row.product_id, sections: row.sections, state: row.state, expires_at: row.expires_at });
});
