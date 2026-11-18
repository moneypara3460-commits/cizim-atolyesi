// Tek fotoğraftan tahmini model (Mod A): sunucunun (supabase/functions/foto-model) temizlenmiş yanıtını uygulama parçalarına
// çevirir, bilinen ölçüye göre ölçekler. Saf fonksiyonlar (tests/scan.test.mjs). Ölçüler TAHMİNDİR; parça adları bunu söyler.

const r2 = (v) => Math.round(v * 100) / 100;

// yanıttaki eksen gösterimi → uygulamanın yerleşimi (parça tabanı = ekseninin başlangıcı, +Y yönünde uzanır)
// x ekseni: rz = -90 (+Y → +X); z ekseni: rx = +90 (+Y → +Z)
function place(q, o) {
  if (q.type === 'box' || q.type === 'sphere' || q.type === 'sketch') return o;
  if (q.axis === 'x') { o.rz = -90; } else if (q.axis === 'z') { o.rx = 90; }
  return o;
}

// Sınır kutusu (yaklaşık; ölçekleme ve yan yana koyma için)
export function partsBounds(parts) {
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  const add = (x, y, z) => { const p = [x, y, z]; for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } };
  for (const q of parts) {
    if (q.op === 'sub') continue;
    if (q.type === 'box') { add(q.x - q.w / 2, q.y, q.z - q.l / 2); add(q.x + q.w / 2, q.y + q.h, q.z + q.l / 2); continue; }
    if (q.type === 'sphere') { add(q.x - q.d / 2, q.y, q.z - q.d / 2); add(q.x + q.d / 2, q.y + q.d, q.z + q.d / 2); continue; }
    if (q.type === 'sketch') { for (const [u, v] of q.pts) { add(u, q.y, v); add(u, q.y + q.h, v); } continue; }
    const R = Math.max(q.d || 0, q.d2 || 0) / 2, L = q.h || 0;
    const ax = q.axis || 'y';
    if (ax === 'y') { add(q.x - R, q.y, q.z - R); add(q.x + R, q.y + L, q.z + R); }
    else if (ax === 'x') { add(q.x, q.y - R, q.z - R); add(q.x + L, q.y + R, q.z + R); }
    else { add(q.x - R, q.y - R, q.z); add(q.x + R, q.y + R, q.z + L); }
  }
  return { min: mn, max: mx, size: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}

// Yanıt → { parts, scale, notes, describe }. known: bilinen en uzun ölçü (mm) ya da null
export function photoToParts(res, known = null) {
  const src = (res && Array.isArray(res.parts) ? res.parts : []).filter((q) => q && q.type);
  const notes = [];
  if (!src.some((q) => q.op !== 'sub')) return { parts: [], scale: 1, notes: ['Modelde katı parça yok'], ok: false };
  let s = 1;
  const bb = partsBounds(src);
  const longest = Math.max(...bb.size);
  if (known > 0 && longest > 0) { s = known / longest; if (Math.abs(s - 1) > 0.01) notes.push('Bilinen ölçüye göre ×' + r2(s) + ' ölçeklendi.'); }
  else notes.push('Ölçü bilinmiyor: boyutlar fotoğraftan tahmin edildi. Bir ölçüyü kumpasla doğrulayıp modeli ölçekle.');
  // zemine otur, ortala
  const cy = bb.min[1], cx = (bb.min[0] + bb.max[0]) / 2, cz = (bb.min[2] + bb.max[2]) / 2;
  const parts = [];
  for (const q of src) {
    const o = { type: q.type, op: q.op === 'sub' ? 'sub' : 'add', x: r2((q.x - (q.type === 'sketch' ? 0 : cx)) * s), y: r2((q.y - cy) * s), z: r2((q.z - (q.type === 'sketch' ? 0 : cz)) * s) };
    for (const k of ['w', 'h', 'l', 'd', 'd2', 'di', 'r', 'c']) if (q[k] > 0) o[k] = r2(q[k] * s);
    if (q.type === 'tube' && !(o.di < o.d)) { o.type = 'cylinder'; delete o.di; }
    if (q.type === 'cone' && o.d2 == null) o.d2 = 0;
    if (q.type === 'sketch') {
      // kroki: noktalar merkeze göre (uygulama kuralı), parça x / z = sınır kutusu merkezi
      const P = q.pts.map(([u, v]) => [(u - cx) * s, (v - cz) * s]);
      let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
      for (const [u, v] of P) { a = Math.min(a, u); b = Math.max(b, u); c = Math.min(c, v); d = Math.max(d, v); }
      const mu = (a + b) / 2, mv = (c + d) / 2;
      Object.assign(o, { mode: 'extrude', plane: 'top', x: r2(mu), z: r2(mv), pts: P.map(([u, v]) => [r2(u - mu), r2(v - mv)]) });
    }
    if (!(['box', 'sketch'].includes(o.type) ? o.h > 0 : o.d > 0)) continue;   // ölçüsüz parça atlanır
    parts.push(place(q, o));
  }
  if (res.confidence === 'low') notes.push('Yapay zekâ emin değil: modeli dikkatle kontrol et.');
  return { parts, scale: s, notes, ok: parts.some((p) => p.op === 'add') };
}
