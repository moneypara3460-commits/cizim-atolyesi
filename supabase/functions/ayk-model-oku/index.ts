// Ayakkabı Modelhanesi: model fotoğrafından model tipi ve saya çizgisi konumlarını tahmin eder (Claude görsel okuma).
// İstek: POST { image: "data:image/jpeg;base64,…" }  →  { ok, result: { type, cap, eyelets, throat, facing, qfront, capAt, backHeightRatio, view, confidence, notes } }
// Gizli ayarlar: ANTHROPIC_API_KEY (zorunlu), AI_MODEL (isteğe bağlı, varsayılan claude-sonnet-5-5)
// Kötüye kullanım sınırı: kişi (IP) başına günde 20, toplam günde 300 okuma (public.ai_take).
import { createClient } from 'jsr:@supabase/supabase-js@2';

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
{"type": "derby" | "oxford" | "loafer" | "spor" | "diger",
 "cap": boolean (true if there is a separate toe cap piece),
 "eyelets": integer (number of lace eyelets on ONE side, 0 if no laces),
 "throat": number (where the lacing opening ends and the vamp begins, as % of shoe length measured from the heel back, typically 55-70),
 "facing": number (where the lacing opening starts near the ankle, % from heel back, typically 38-50),
 "qfront": number (where the front edge of the quarter meets the sole, % from heel back, typically 40-65),
 "capAt": number (where the toe cap line crosses the top of the shoe, % from heel back, typically 75-90),
 "backHeightRatio": number (height of the shoe at the heel back divided by shoe length, typically 0.18-0.30),
 "view": "side" | "other",
 "confidence": "high" | "medium" | "low",
 "notes": short description of the model in Turkish, at most 140 characters}
Definitions: derby = quarters (eyelet tabs) sewn on top of the vamp, open lacing; oxford = closed lacing, quarters under the vamp;
loafer = no laces, slip-on; spor = sneaker / athletic shoe; diger = anything else (boot, sandal, heel...).
If the photo is not a side view, still estimate and set "view" to "other". If you cannot see a shoe, use type "diger" and confidence "low".`;

const NUM = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
// Model yanıtını güvenli biçime getir (yalnız beklenen alanlar, sınırlar içinde)
function clean(o: Record<string, unknown>) {
  const types = ['derby', 'oxford', 'loafer', 'spor', 'diger'];
  return {
    type: types.includes(o.type as string) ? o.type : 'diger',
    cap: o.cap === true,
    eyelets: Math.round(NUM(o.eyelets, 0, 12) ?? 0),
    throat: NUM(o.throat, 40, 85), facing: NUM(o.facing, 25, 65), qfront: NUM(o.qfront, 30, 80), capAt: NUM(o.capAt, 65, 95),
    backHeightRatio: NUM(o.backHeightRatio, 0.12, 0.45),
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

  const len = Number(req.headers.get('content-length') || 0);
  if (len > 4_000_000) return json(413, { error: 'Resim çok büyük' });
  let body: { image?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: 'Geçersiz istek' }); }
  const m = typeof body.image === 'string' ? /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(body.image) : null;
  if (!m || m[2].length > 3_500_000) return json(400, { error: 'Resim okunamadı (jpeg/png/webp, en çok ~2,5 MB)' });

  const who = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'bilinmiyor';
  const { data: allowed, error: le } = await admin.rpc('ai_take', { p_who: 'ip:' + who, p_limit: 20, p_global: 300 });
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
