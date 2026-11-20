// Tek fotoğraftan TAHMİNİ 3B model (Photo-to-CAD Mod A): parçanın fotoğrafından temel şekillerle (kutu, silindir, koni, boru,
// küre, sabit kesitli kroki) ve deliklerle kaba bir model çıkarır. Ölçüler tahmindir; kullanıcı bilinen bir ölçü verirse
// uygulama bütün modeli o ölçüye göre ölçekler (scan/photo-parts.js).
// İstek: POST { image: "data:image/jpeg;base64,…", hint?: "kısa açıklama", known?: { mm: 80 } }
// Yanıt: { ok, result: { kind, confidence, notes, view, parts: [{ type, op, axis, w, h, l, d, d2, di, x, y, z, r, c, pts }] } }
// Gizli ayarlar: ANTHROPIC_API_KEY (zorunlu), AI_MODEL (isteğe bağlı). Yalnız giriş yapmış kullanıcı.
// Sınır (public.ai_take_user): abone günde 10; abone olmayan günde 5 (hesap 24 saatten yeniyse 2); abone olmayanların ortak toplamı 100.
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

const prompt = (hint: string, known: number | null) => `You are an expert mechanical designer. The photo shows ONE physical part (machined, cast, printed or sheet part).
Build a simple CAD model of it from primitive solids so a workshop can start drawing it. ${known ? `Its LONGEST overall dimension is ${known} mm.` : 'No dimension is known: estimate realistic sizes in mm from context (bolts, hands, tables, typical parts).'}${hint ? `\nUser note: ${hint}` : ''}
Coordinate system (mm): Y is up, the part rests on the floor y = 0, centred at x = 0, z = 0. X to the right, Z towards the viewer.
Allowed parts (op "add" builds material, op "sub" removes it, e.g. holes, pockets, slots):
- {"type":"box","op":..,"w":X size,"h":Y size,"l":Z size,"x":centre x,"y":BOTTOM y,"z":centre z,"r":edge fillet radius (all edges, optional),"c":edge chamfer (all edges, optional)}
- {"type":"cylinder","op":..,"axis":"x"|"y"|"z","d":diameter,"h":length,"x","y","z": centre of its START face; it extends from there in the +axis direction}
- {"type":"cone","op":..,"axis":..,"d":start diameter,"d2":end diameter,"h":length,"x","y","z": centre of start face}
- {"type":"tube","op":"add","axis":..,"d":outer diameter,"di":inner diameter,"h":length,"x","y","z": centre of start face}
- {"type":"sphere","op":"add","d":diameter,"x","y":BOTTOM y,"z"}
- {"type":"sketch","op":..,"pts":[[x,z],...] polygon in the XZ plane (absolute, counter-clockwise, 3-40 points),"y":BOTTOM y,"h":height} for constant-section shapes (L, T, wedge outlines seen from above)
Rules: use as few parts as possible (max 30). Through holes: make the "sub" cylinder 2 mm longer than the material on both sides. Only model what is visible; do not invent hidden features.
Return ONLY JSON, no other text:
{"kind":"prizmatik"|"torna"|"sac"|"karma"|"diger","confidence":"high"|"medium"|"low","view":"one short Turkish phrase: which side the photo shows","notes":"short Turkish summary (max 160 chars)","parts":[...]}`;

const IMG = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const N = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);
const TYPES = ['box', 'cylinder', 'cone', 'tube', 'sphere', 'sketch'];

// yalnız beklenen alanlar, sınırlar içinde (yapay zekâ yanıtı güvenilmez girdidir)
function clean(p: Record<string, unknown>) {
  const parts = (Array.isArray(p.parts) ? p.parts : []).slice(0, 30).map((q: Record<string, unknown>) => {
    if (!q || !TYPES.includes(q.type as string)) return null;
    const o: Record<string, unknown> = { type: q.type, op: q.op === 'sub' ? 'sub' : 'add', axis: ['x', 'y', 'z'].includes(q.axis as string) ? q.axis : 'y' };
    for (const k of ['w', 'h', 'l', 'd', 'd2', 'di']) { const v = N(q[k], 0, 5000); if (v !== null) o[k] = v; }
    for (const k of ['x', 'y', 'z']) o[k] = N(q[k], -5000, 5000) ?? 0;
    for (const k of ['r', 'c']) { const v = N(q[k], 0, 500); if (v) o[k] = v; }
    if (q.type === 'sketch') {
      const pts = (Array.isArray(q.pts) ? q.pts : []).slice(0, 40).map((t) => (Array.isArray(t) ? [N(t[0], -5000, 5000), N(t[1], -5000, 5000)] : null)).filter((t) => t && t[0] !== null && t[1] !== null);
      if (pts.length < 3) return null;
      o.pts = pts;
    }
    return o;
  }).filter(Boolean);
  const txt = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[<>]/g, '').slice(0, n) : '');
  return {
    kind: ['prizmatik', 'torna', 'sac', 'karma', 'diger'].includes(p.kind as string) ? p.kind : 'diger',
    confidence: ['high', 'medium', 'low'].includes(p.confidence as string) ? p.confidence : 'low',
    view: txt(p.view, 80), notes: txt(p.notes, 200), parts,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Yalnız POST' });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json(503, { error: 'Yapay zekâ henüz açılmadı (anahtar ayarlanmadı).' });
  // önce oturum (girişsiz istek gövdeyi okutmasın), sonra gövde akış okunurken boyut sınırıyla
  const uid = await kullanici(req, admin);
  if (!uid) return json(401, { error: 'Yapay zekâ için önce Google ile giriş yap.' });
  const okunan = await jsonOku(req, 4_000_000);
  if (okunan.status === 413) return json(413, { error: 'Resim çok büyük' });
  if (!okunan.body || typeof okunan.body !== 'object') return json(400, { error: 'Geçersiz istek' });
  const body: { image?: unknown; hint?: unknown; known?: { mm?: unknown } } = okunan.body;
  const m = typeof body.image === 'string' ? IMG.exec(body.image) : null;
  if (!m || m[2].length > 3_500_000) return json(400, { error: 'Resim okunamadı (jpeg/png/webp, en çok ~2,5 MB)' });
  const hint = typeof body.hint === 'string' ? body.hint.replace(/[<>]/g, '').slice(0, 200) : '';
  const known = N(body.known?.mm, 1, 5000);

  const { data: allowed, error: le } = await admin.rpc('ai_take_user', { p_uid: uid, p_kind: 'foto', p_paid_limit: 10, p_trial_limit: 5, p_new_limit: 2, p_global: 100 });
  if (le) { console.error(le); return json(500, { error: 'Sınır kontrolü yapılamadı' }); }
  if (!allowed) return json(429, { error: 'Bugünkü fotoğraftan model sınırına ulaşıldı, yarın tekrar dene.' });

  let r: Response;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('AI_MODEL') || 'claude-sonnet-5-5', max_tokens: 4000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: prompt(hint, known) },
        ] }],
      }),
    });
  } catch (e) { console.error(e); return json(502, { error: 'Yapay zekâ servisine ulaşılamadı' }); }
  const out = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('anthropic', r.status, out?.error?.type); return json(502, { error: 'Yapay zekâ servisi yanıt vermedi (' + r.status + ')' }); }
  const text = (out.content || []).filter((c: { type: string }) => c.type === 'text').map((c: { text: string }) => c.text).join('');
  const j = /\{[\s\S]*\}/.exec(text);
  if (!j) return json(502, { error: 'Yapay zekâ yanıtı anlaşılamadı' });
  let p: Record<string, unknown>;
  try { p = JSON.parse(j[0]); } catch { return json(502, { error: 'Yapay zekâ yanıtı anlaşılamadı' }); }
  const res = clean(p);
  if (!res.parts.some((q) => (q as { op: string }).op === 'add')) return json(502, { error: 'Fotoğraftan model çıkarılamadı. Parçayı yakından, düz ışıkta ve tek başına çek.' });
  return json(200, { ok: true, result: res });
});
