// Uygulama, Google Play'den aldığı satın alma jetonunu buraya gönderir.
// Jeton Google'a sorulur; geçerliyse abonelik bu kullanıcıya yazılır ve gerekiyorsa onaylanır.
// İstek: POST { productId, purchaseToken }  (Authorization: kullanıcının oturum anahtarı)
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { acknowledge, ACTIVE, getSubscription, PlayError, productInfo, toRow } from '../_shared/google.ts';

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

  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const { data: u, error: ue } = await admin.auth.getUser(jwt);
  if (ue || !u?.user) return json(401, { error: 'Oturum geçersiz' });
  const userId = u.user.id;

  let body: { productId?: unknown; purchaseToken?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: 'Geçersiz istek' }); }
  const productId = typeof body.productId === 'string' ? body.productId : '';
  const token = typeof body.purchaseToken === 'string' ? body.purchaseToken : '';
  if (!productInfo(productId) || !token || token.length > 4096) return json(400, { error: 'Eksik veya hatalı ürün/jeton' });

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

  // Paket yükseltme/düşürme: eski jeton artık geçersiz
  if (g.linkedPurchaseToken) {
    await admin.from('subscriptions').update({ superseded: true, updated_at: row.updated_at })
      .eq('purchase_token', g.linkedPurchaseToken).eq('user_id', userId);
  }
  const { error: we } = await admin.from('subscriptions').upsert({ ...row, user_id: userId }, { onConflict: 'purchase_token' });
  if (we) { console.error(we); return json(500, { error: 'Kayıt yapılamadı' }); }

  if (g.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && ACTIVE.includes(row.state)) {
    try { await acknowledge(row.product_id, token); } catch (e) { console.error('onay', e); }   // bildirim gelince tekrar denenir
  }
  return json(200, { ok: true, product_id: row.product_id, sections: row.sections, state: row.state, expires_at: row.expires_at });
});
