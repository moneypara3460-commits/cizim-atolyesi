// Google Play Developer API: servis hesabıyla erişim anahtarı, abonelik sorgulama, onaylama.
// Gizli ayarlar (Supabase → Edge Functions → Secrets):
//   GOOGLE_SERVICE_ACCOUNT : Google Cloud servis hesabının JSON anahtarı (tamamı)
//   PLAY_PACKAGE           : Android uygulamasının paket adı (ör. com.cizimatolyesi.app)

// Ürün kimlikleri: <paket>_<aylik|yillik>. Her ürünün Play Console'da tek temel planı vardır.
const SECTION_PRODUCTS: Record<string, { plan: string; sections: string[] }> = {
  tek_makine: { plan: 'tek', sections: ['makine'] },
  tek_tekstil: { plan: 'tek', sections: ['tekstil'] },
  tek_ayakkabi: { plan: 'tek', sections: ['ayakkabi'] },
  atolye: { plan: 'atolye', sections: ['makine', 'tekstil', 'ayakkabi'] },
};
export function productInfo(productId: string) {
  const m = /^([a-z_]+)_(aylik|yillik)$/.exec(productId || '');
  if (!m || !SECTION_PRODUCTS[m[1]]) return null;
  return { ...SECTION_PRODUCTS[m[1]], period: m[2] };
}

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();
let cached = { token: '', exp: 0 };

async function accessToken(): Promise<string> {
  if (cached.token && cached.exp - 60 > Date.now() / 1000) return cached.token;
  const sa = JSON.parse(Deno.env.get('GOOGLE_SERVICE_ACCOUNT') || '{}');
  if (!sa.client_email || !sa.private_key) throw new Error('GOOGLE_SERVICE_ACCOUNT ayarlı değil');
  const der = Uint8Array.from(atob(sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const iat = Math.floor(Date.now() / 1000);
  const head = b64url(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify({
    iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600,
  })));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + body)));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${b64url(sig)}` }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error('Google erişim anahtarı alınamadı: ' + (j.error || r.status));
  cached = { token: j.access_token, exp: iat + (j.expires_in || 3600) };
  return cached.token;
}

const pkg = () => {
  const p = Deno.env.get('PLAY_PACKAGE');
  if (!p) throw new Error('PLAY_PACKAGE ayarlı değil');
  return encodeURIComponent(p);
};
const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/';

export class PlayError extends Error { constructor(public status: number, msg: string) { super(msg); } }

// purchases.subscriptionsv2.get
export async function getSubscription(purchaseToken: string) {
  const r = await fetch(`${API}${pkg()}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { authorization: 'Bearer ' + await accessToken() } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new PlayError(r.status, j?.error?.message || 'Google Play sorgusu başarısız');
  return j;
}

// purchases.subscriptions.acknowledge (onaylanmayan abonelik 3 gün içinde iade edilir)
export async function acknowledge(productId: string, purchaseToken: string) {
  const r = await fetch(`${API}${pkg()}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: 'POST', headers: { authorization: 'Bearer ' + await accessToken(), 'content-type': 'application/json' }, body: '{}' });
  if (!r.ok) throw new PlayError(r.status, 'Onaylama başarısız');
}

// Google yanıtını tablo satırına çevirir. Tanınmayan ürün → null.
// deno-lint-ignore no-explicit-any
export function toRow(g: any, purchaseToken: string) {
  const li = (g.lineItems || [])[0];
  const info = li && productInfo(li.productId);
  if (!info) return null;
  return {
    purchase_token: purchaseToken,
    product_id: li.productId,
    plan: info.plan,
    sections: info.sections,
    state: String(g.subscriptionState || 'SUBSCRIPTION_STATE_UNSPECIFIED'),
    expires_at: li.expiryTime || null,
    auto_renewing: !!li.autoRenewingPlan?.autoRenewEnabled,
    order_id: g.latestOrderId || null,
    raw: g,
    updated_at: new Date().toISOString(),
  };
}

export const ACTIVE = ['SUBSCRIPTION_STATE_ACTIVE', 'SUBSCRIPTION_STATE_IN_GRACE_PERIOD', 'SUBSCRIPTION_STATE_CANCELED'];
