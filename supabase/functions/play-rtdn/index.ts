// Google Play gerçek zamanlı bildirimleri (RTDN): yenileme, iptal, iade, askıya alma.
// Google Cloud Pub/Sub "push" aboneliği şu adrese gönderir:
//   https://<proje>.supabase.co/functions/v1/play-rtdn?k=<RTDN_SECRET>
// Gizli ayar: RTDN_SECRET (uzun rastgele metin). JWT doğrulaması kapalıdır; kimlik ?k= ile denetlenir.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { acknowledge, ACTIVE, getSubscription, toRow } from '../_shared/google.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function sameText(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('POST', { status: 405 });
  const k = new URL(req.url).searchParams.get('k') || '';
  if (!sameText(k, Deno.env.get('RTDN_SECRET') || '')) return new Response('yetkisiz', { status: 401 });

  let note;
  try {
    const env = await req.json();
    note = JSON.parse(atob(env?.message?.data || ''));
  } catch { return new Response('ok'); }   // bozuk ileti: tekrar gönderilmesin

  const sn = note?.subscriptionNotification;
  if (!sn?.purchaseToken) return new Response('ok');   // test bildirimi vb.
  const token: string = sn.purchaseToken;

  const { data: prev } = await admin.from('subscriptions').select('user_id').eq('purchase_token', token).maybeSingle();
  if (!prev) return new Response('ok');   // henüz uygulama doğrulamadı; uygulama açılınca play-verify yazar

  try {
    const g = await getSubscription(token);
    const row = toRow(g, token);
    if (!row) return new Response('ok');
    if (g.linkedPurchaseToken) {
      await admin.from('subscriptions').update({ superseded: true, updated_at: row.updated_at })
        .eq('purchase_token', g.linkedPurchaseToken).eq('user_id', prev.user_id);
    }
    await admin.from('subscriptions').update(row).eq('purchase_token', token);
    if (g.acknowledgementState === 'ACKNOWLEDGEMENT_STATE_PENDING' && ACTIVE.includes(row.state)) await acknowledge(row.product_id, token);
  } catch (e) {
    console.error(e);
    return new Response('tekrar dene', { status: 500 });   // Pub/Sub yeniden gönderir
  }
  return new Response('ok');
});
