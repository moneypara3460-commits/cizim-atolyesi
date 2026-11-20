// Ayakkabı Modelhanesi: modelin farklı açılardan çekilmiş fotoğraflarından (en çok 6) bütün saya parçalarını çıkarır.
// İstek: POST { images: ["data:image/jpeg;base64,…", …], last: { L, top: [[x, h], …] } }
//   last.L: kalıp boyu (mm), last.top: topuk arkasından x mm'de kalıbın tabandan üst çizgisine yüksekliği (mm)
// Yanıt: { ok, result: { model, confidence, pieces: [{ name, kind, layer, poly: [[x, y]…], holes, holeD, note }] } }
//   x: topuk arkasından burna mm, y: taban (saya-taban birleşim) çizgisinden yukarı mm. Parçalar dış yandan görünüştür.
// Gizli ayarlar: ANTHROPIC_API_KEY (zorunlu), AI_MODEL (isteğe bağlı). Yalnız giriş yapmış kullanıcı (Authorization: Bearer <oturum>). Sınır (public.ai_take_user): abone günde 10; abone olmayan günde 5 (hesap 24 saatten yeniyse 2); abone olmayanların ortak toplamı 150 — aboneler ortak sınırdan etkilenmez.
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

const prompt = (L: number, top: number[][]) => `You are a master shoe pattern maker (modelist). The photos show ONE shoe model from different angles.
The workshop will make this model on a last of length ${Math.round(L)} mm. Height of the last's top line above the sole line at x mm from the heel back:
${top.map(([x, h]) => `x=${Math.round(x)}:${Math.round(h)}`).join(', ')}.
(At the front the last's top line is the instep / vamp centre line. Collars of low shoes are well below it at the back.)

Task: split the UPPER of this model into all its pattern pieces (saya parçaları), exactly like a pattern maker would cut them,
as seen from the OUTSIDE (lateral) side view, drawn on this last. Coordinates in mm: x from heel back (0) to toe tip (${Math.round(L)}),
y = height above the sole line (0 = where upper meets the sole). Points on the centre line use the last's top-line height at that x.
Rules:
- Give the FINISHED visible outline of each piece (no seam allowances; they are added later). Pieces that cross the centre line
  (vamp, toe cap, tongue, front overlays) are half patterns: one edge runs along the centre line.
- Edges that go under the sole must end at y=0. Points ON the centre line must be exactly at the last's top-line height (interpolate the table).
- Lace opening: eyestay / quarter edges along the lacing stay at least 10 mm BELOW the centre line; only pieces that continue across the instep (vamp, toe cap, tongue, front overlays) touch it. Follow the shoe's real design lines closely; use 6-30 points per piece, clockwise.
- layer: 0 for base pieces (vamp, quarter, mesh), 1 for pieces sewn on top of them, 2 for pieces on top of those, etc.
- Include every piece you can see: vamp/mesh, quarters, toe cap, eyestay/lace facing, heel counter cover, collar, tongue,
  side overlays, mudguard, backstay, pull tab. Do not include lining, insole or sole (added automatically).
- Brand logos or trademark shapes: do NOT trace them; give a simple rectangle named "Logo yeri" instead.
- Eyelets: holes as [x, y] centres on the eyelet piece, holeD in mm.
- kind: "ust" for upper pieces, "takviye" only for visible reinforcements.
- name in Turkish shoe-workshop terms (ör. "Ön saya", "Yan saya", "Burun", "Bağcık yeri", "Topuk", "Konç", "Dil", "Çamurluk", "Arka şerit").
Return ONLY JSON, no other text:
{"model": short Turkish description (max 140 chars), "confidence": "high"|"medium"|"low",
 "pieces": [{"name": str, "kind": "ust"|"takviye", "layer": int, "poly": [[x,y],...], "holes": [[x,y],...], "holeD": number, "note": short Turkish}]}`;

const IMG = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;
const N = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Yalnız POST' });
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) return json(503, { error: 'Yapay zekâ okuması henüz açılmadı (anahtar ayarlanmadı).' });
  // önce oturum (girişsiz istek gövdeyi okutmasın), sonra gövde akış okunurken boyut sınırıyla
  const uid = await kullanici(req, admin);
  if (!uid) return json(401, { error: 'Yapay zekâ için önce Google ile giriş yap.' });
  const okunan = await jsonOku(req, 9_000_000);
  if (okunan.status === 413) return json(413, { error: 'Resimler çok büyük' });
  if (!okunan.body || typeof okunan.body !== 'object') return json(400, { error: 'Geçersiz istek' });
  const body: { images?: unknown; last?: { L?: unknown; top?: unknown } } = okunan.body;
  const imgs = (Array.isArray(body.images) ? body.images : []).slice(0, 6).map((s) => (typeof s === 'string' ? IMG.exec(s) : null));
  if (!imgs.length || imgs.some((m) => !m || m[2].length > 2_000_000)) return json(400, { error: 'Model resimleri okunamadı (jpeg/png/webp, her biri en çok ~1,5 MB)' });
  const L = N(body.last?.L, 120, 450);
  const top = (Array.isArray(body.last?.top) ? body.last!.top as unknown[] : []).slice(0, 30)
    .map((q) => (Array.isArray(q) ? [N(q[0], 0, 450), N(q[1], 0, 400)] : [null, null])).filter((q) => q[0] !== null && q[1] !== null) as number[][];
  if (!L || top.length < 5) return json(400, { error: 'Kalıp bilgisi eksik' });

  const { data: allowed, error: le } = await admin.rpc('ai_take_user', { p_uid: uid, p_kind: 'parca', p_paid_limit: 10, p_trial_limit: 5, p_new_limit: 2, p_global: 150 });
  if (le) { console.error(le); return json(500, { error: 'Sınır kontrolü yapılamadı' }); }
  if (!allowed) return json(429, { error: 'Bugünkü parça çıkarma sınırına ulaşıldı, yarın tekrar dene.' });

  let r: Response;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('AI_MODEL') || 'claude-sonnet-5-5', max_tokens: 8000,
        messages: [{ role: 'user', content: [
          ...imgs.map((m) => ({ type: 'image', source: { type: 'base64', media_type: m![1], data: m![2] } })),
          { type: 'text', text: prompt(L, top) },
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
  const pt = (q: unknown) => (Array.isArray(q) && N(q[0], -10, L + 10) !== null && N(q[1], -10, 600) !== null ? [N(q[0], -10, L + 10), N(q[1], -10, 600)] : null);
  const pieces = (Array.isArray(p.pieces) ? p.pieces : []).slice(0, 40).map((x: Record<string, unknown>) => ({
    name: typeof x?.name === 'string' ? x.name.replace(/[<>]/g, '').slice(0, 40) : 'Parça',
    kind: x?.kind === 'takviye' ? 'takviye' : 'ust',
    layer: Math.round(N(x?.layer, 0, 9) ?? 0),
    poly: (Array.isArray(x?.poly) ? x.poly : []).map(pt).filter(Boolean).slice(0, 60),
    holes: (Array.isArray(x?.holes) ? x.holes : []).map(pt).filter(Boolean).slice(0, 24),
    holeD: N(x?.holeD, 2, 12) ?? 5,
    note: typeof x?.note === 'string' ? x.note.replace(/[<>]/g, '').slice(0, 120) : '',
  })).filter((x: { poly: unknown[] }) => x.poly.length >= 3);
  if (!pieces.length) return json(502, { error: 'Yapay zekâ parça çıkaramadı. Modeli yandan da çeken net resimler ekle.' });
  return json(200, { ok: true, result: {
    model: typeof p.model === 'string' ? p.model.replace(/[<>]/g, '').slice(0, 160) : '',
    confidence: ['high', 'medium', 'low'].includes(p.confidence as string) ? p.confidence : 'low', pieces,
  } });
});
