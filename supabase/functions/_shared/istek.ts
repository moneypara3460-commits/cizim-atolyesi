// Sunucu fonksiyonları için ortak istek yardımcıları.

// İstek gövdesini en çok `max` bayt okuyup JSON'a çevirir. Content-Length başlığına güvenmez (parça parça gönderilen
// isteklerde başlık olmayabilir): akış okunurken sınır aşılınca okuma kesilir. Dönüş: { body } | { status }.
export async function jsonOku(req: Request, max: number): Promise<{ body?: any; status?: number }> {
  const bildirilen = Number(req.headers.get('content-length') || 0);
  if (bildirilen > max) return { status: 413 };
  if (!req.body) return { status: 400 };
  const reader = req.body.getReader();
  const parcalar: Uint8Array[] = [];
  let toplam = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    toplam += value.byteLength;
    if (toplam > max) { try { await reader.cancel(); } catch { /* yok say */ } return { status: 413 }; }
    parcalar.push(value);
  }
  const buf = new Uint8Array(toplam);
  let o = 0;
  for (const p of parcalar) { buf.set(p, o); o += p.byteLength; }
  try { return { body: JSON.parse(new TextDecoder().decode(buf)) }; } catch { return { status: 400 }; }
}

// Authorization: Bearer <oturum> başlığındaki kullanıcıyı Supabase'e sorarak doğrular. Dönüş: kullanıcı kimliği ya da null.
// deno-lint-ignore no-explicit-any
export async function kullanici(req: Request, admin: any): Promise<string | null> {
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!tok) return null;
  const { data, error } = await admin.auth.getUser(tok);
  return error || !data?.user?.id ? null : data.user.id;
}

// Gizli anahtar karşılaştırması (süre farkından anahtar tahmin edilmesin)
export function esitMi(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let fark = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) fark |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return fark === 0;
}
