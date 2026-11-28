// Ayakkabı Modelhanesi: model fotoğrafından model tipi ve saya çizgisi konumlarını tahmin eder (Claude görsel okuma).
// İstek: POST { image: "data:image/jpeg;base64,…" }  →  { ok, result: { type, cap, eyelets, throat, facing, qfront, capAt, backHeightRatio, strapAt, strapWRatio, view, confidence, notes } }
// Tipler uygulamadaki şablonlarla aynı (ayk/auto.js MODELS): derby, oxford, loafer, spor, bot, makosen, sandalet, topuklu; diğerleri "diger".
// Gizli ayarlar: ANTHROPIC_API_KEY (zorunlu), AI_MODEL (isteğe bağlı, varsayılan claude-sonnet-5-5)
// Yalnız giriş yapmış kullanıcı (Authorization: Bearer <oturum>). Kötüye kullanım sınırı (public.ai_take_user): abone günde 20; abone olmayan günde 10 (hesap 24 saatten yeniyse 3); abone olmayanların ortak toplamı 300 — aboneler ortak sınırdan etkilenmez.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { jsonOku, kullanici } from '../_shared/istek.ts';

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

const PROMPT = `You are an expert shoe pattern maker (modelist). Look at the photo of a shoe model that a pattern maker wants to produce.
Return ONLY a JSON object, no other text, with these keys:
{"type": "derby" | "oxford" | "loafer" | "spor" | "bot" | "makosen" | "sandalet" | "topuklu" | "diger",
 "cap": boolean (true if there is a separate toe cap piece),
 "eyelets": integer (number of lace eyelets on ONE side, 0 if no laces),
 "throat": number (where the lacing opening ends and the vamp begins, as % of shoe length measured from the heel back, typically 55-70),
 "facing": number (where the lacing opening starts near the ankle, % from heel back, typically 38-50),
 "qfront": number (where the front edge of the quarter meets the sole, % from heel back, typically 40-65),
 "capAt": number (where the toe cap line crosses the top of the shoe, % from heel back, typically 75-90),
 "backHeightRatio": number (height of the upper at the heel back divided by shoe length; typically 0.18-0.30, boots 0.35-0.45),
 "strapAt": number (sandal only: center of the front strap across the foot, % from heel back, typically 60-80; null for other types),
 "strapWRatio": number (sandal only: width of that front strap divided by shoe length, typically 0.05-0.14; null for other types),
 "view": "side" | "other",
 "confidence": "high" | "medium" | "low",
 "notes": short description of the model in Turkish, at most 140 characters}
Definitions: derby = quarters (eyelet tabs) sewn on top of the vamp, open lacing; oxford = closed lacing, quarters under the vamp;
loafer = no laces, slip-on with a separate vamp/mask; spor = sneaker / athletic shoe;
bot = ankle boot that covers the ankle, usually laced (shaft above the ankle bone);
makosen = moccasin / driving shoe with a U-shaped apron (önlük) stitched on top of the vamp, no laces;
sandalet = open sandal: a front strap across the foot, a heel counter and an ankle strap, toes visible;
topuklu = women's high-heel pump / stiletto with a one-piece upper and a high heel (heel clearly higher than 4 cm);
diger = anything else (knee-high boot, slipper, clog, mule...). Laced boot → bot, not derby. Low pump with a high heel → topuklu, not loafer.
If the photo is not a side view, still estimate and set "view" to "other". If you cannot see a shoe, use type "diger" and confidence "low".`;

const NUM = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
// Model yanıtını güvenli biçime getir (yalnız beklenen alanlar, sınırlar içinde)
function clean(o: Record<string, unknown>) {
  const types = ['derby', 'oxford', 'loafer', 'spor', 'bot', 'makosen', 'sandalet', 'topuklu', 'diger'];
  return {
    type: types.includes(o.type as string) ? o.type : 'diger',
    cap: o.cap === true,
    eyelets: Math.round(NUM(o.eyelets, 0, 12) ?? 0),
    throat: NUM(o.throat, 40, 85), facing: NUM(o.facing, 25, 65), qfront: NUM(o.qfront, 30, 80), capAt: NUM(o.capAt, 65, 95),
    backHeightRatio: NUM(o.backHeightRatio, 0.12, 0.6),
    strapAt: o.type === 'sandalet' ? NUM(o.strapAt, 50, 90) : null, strapWRatio: o.type === 'sandalet' ? NUM(o.strapWRatio, 0.03, 0.2) : null,
    view: o.view === 'side' ? 'side' : 'other',
    confidence: ['high', 'medium', 'low'].includes(o.confidence as string) ? o.confidence : 'low',
    notes: typeof o.notes === 'string' ? o.notes.replace(/[<>]/g, '').slice(0, 160) : '',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Yalnız POST' });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json(503, { error: 'Yapay zekâ okuması henüz açılmadı (anahtar ayarlanmadı).' });

  // önce oturum (girişsiz istek gövdeyi okutmasın), sonra gövde akış okunurken boyut sınırıyla
  const uid = await kullanici(req, admin);
  if (!uid) return json(401, { error: 'Yapay zekâ için önce Google ile giriş yap.' });
  const okunan = await jsonOku(req, 4_000_000);
  if (okunan.status === 413) return json(413, { error: 'Resim çok büyük' });
  if (!okunan.body || typeof okunan.body !== 'object') return json(400, { error: 'Geçersiz istek' });
  const body: { image?: unknown } = okunan.body;
  const m = typeof body.image === 'string' ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image) : null;
  if (!m || m[2].length > 3_500_000) return json(400, { error: 'Resim okunamadı (jpeg/png/webp, en çok ~2,5 MB)' });

  const { data: allowed, error: le } = await admin.rpc('ai_take_user', { p_uid: uid, p_kind: 'model', p_paid_limit: 20, p_trial_limit: 10, p_new_limit: 3, p_global: 300 });
  if (le) { console.error(le); return json(500, { error: 'Sınır kontrolü yapılamadı' }); }
  if (!allowed) return json(429, { error: 'Bugünkü okuma sınırına ulaşıldı, yarın tekrar dene.' });

  let r: Response;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('AI_MODEL') || 'claude-sonnet-5-5', max_tokens: 600,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: PROMPT },
        ] }],
      }),
    });
  } catch (e) { console.error(e); return json(502, { error: 'Yapay zekâ servisine ulaşılamadı' }); }
  const out = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('anthropic', r.status, out?.error?.type); return json(502, { error: 'Yapay zekâ servisi yanıt vermedi (' + r.status + ')' }); }
  const text = (out.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
  const j = /\{[\s\S]*\}/.exec(text);
  if (!j) return json(502, { error: 'Yapay zekâ yanıtı anlaşılamadı' });
  let parsed: Record<string, unknown>;
  try { parsed = JSON.parse(j[0]); } catch { return json(502, { error: 'Yapay zekâ yanıtı anlaşılamadı' }); }
  return json(200, { ok: true, result: clean(parsed) });
});
