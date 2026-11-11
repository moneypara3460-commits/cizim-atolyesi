// Triko örgü deseni (şema) — saf modül. Izgara: w ilmek (sütun) × h sıra. Satır 0 = en alt sıra (1. sıra),
// sütun 0 = en sol. Şema ön yüzden (düz yüz) görüldüğü gibidir.
//   chart = { id, name, w, h, st: [kodlar, h*w], col: [renk indeksi, h*w], palette: [{ name, hex }], repeat: { x, y, w, h } | null, notes }
// İlmek kodları ve şema sembolleri aşağıda. Desteklenmeyen kod doğrulamada hata verir (yanlış sonuç üretilmez).
export const STITCHES = {
  k: { label: 'Düz (ön iğne)', sym: '', delta: 0 },
  p: { label: 'Ters (arka iğne)', sym: '•', delta: 0 },
  t: { label: 'Askı (tuck)', sym: 'V', delta: 0 },
  m: { label: 'Atlama (miss / iplik arkada)', sym: '—', delta: 0 },
  yo: { label: 'Delik (iplik atma, +1)', sym: 'O', delta: +1 },
  k2t: { label: 'Sağa eksiltme (2 birlikte, −1)', sym: '/', delta: -1 },
  ssk: { label: 'Sola eksiltme (−1)', sym: '\\', delta: -1 },
  x: { label: 'İlmek yok (şekil dışı)', sym: '', delta: 0 },
  // saç örgüsü: çapraz başlangıç hücresi "c<n><L|R>" (n = toplam genişlik, yarısı yarısıyla çaprazlanır); devam hücreleri "c+"
  c4L: { label: 'Saç örgüsü 2/2 sola', cable: 4, dir: 'L' }, c4R: { label: 'Saç örgüsü 2/2 sağa', cable: 4, dir: 'R' },
  c6L: { label: 'Saç örgüsü 3/3 sola', cable: 6, dir: 'L' }, c6R: { label: 'Saç örgüsü 3/3 sağa', cable: 6, dir: 'R' },
  c2L: { label: 'Çapraz 1/1 sola', cable: 2, dir: 'L' }, c2R: { label: 'Çapraz 1/1 sağa', cable: 2, dir: 'R' },
  'c+': { label: '(saç örgüsü devamı)', sym: '', delta: 0 },
};
const idx = (ch, x, y) => y * ch.w + x;
export const get = (ch, x, y) => ch.st[idx(ch, x, y)];
export const getC = (ch, x, y) => ch.col[idx(ch, x, y)];

export function createChart({ id = 'ch' + Date.now().toString(36), name = 'Desen', w = 24, h = 24, fill = 'k', palette = [{ name: 'Ana renk', hex: '#d4cfc4' }] } = {}) {
  if (!(Number.isInteger(w) && Number.isInteger(h) && w >= 1 && h >= 1 && w <= 400 && h <= 1000)) throw new Error('Desen boyutu 1–400 ilmek × 1–1000 sıra olmalı');
  return { id, name, w, h, st: Array(w * h).fill(fill), col: Array(w * h).fill(0), palette: palette.map((p) => ({ ...p })), repeat: null, notes: '' };
}
// hücreye ilmek koy: saç örgüsünde gerekli devam hücrelerini de yazar
export function setStitch(ch, x, y, code) {
  const S = STITCHES[code]; if (!S) throw new Error('Bilinmeyen ilmek: ' + code);
  if (code === 'c+') throw new Error('Devam hücresi doğrudan konmaz');
  clearCable(ch, x, y);
  if (S.cable) {
    if (x + S.cable > ch.w) throw new Error(`Saç örgüsü ${S.cable} ilmek ister; sağda yer yok`);
    for (let k = 1; k < S.cable; k++) clearCable(ch, x + k, y);
    ch.st[idx(ch, x, y)] = code; for (let k = 1; k < S.cable; k++) ch.st[idx(ch, x + k, y)] = 'c+';
  } else ch.st[idx(ch, x, y)] = code;
}
// bir hücre bir saç örgüsünün parçasıysa bütün çaprazı düz ilmeğe çevir
function clearCable(ch, x, y) {
  const c = get(ch, x, y); if (c !== 'c+' && !STITCHES[c]?.cable) return;
  let x0 = x; while (x0 > 0 && get(ch, x0, y) === 'c+') x0--;
  const n = STITCHES[get(ch, x0, y)]?.cable || 1;
  for (let k = 0; k < n && x0 + k < ch.w; k++) ch.st[idx(ch, x0 + k, y)] = 'k';
}
export function setColor(ch, x, y, c) { if (!(c >= 0 && c < ch.palette.length)) throw new Error('Renk yok'); ch.col[idx(ch, x, y)] = c; }
export function resize(ch, w, h) {
  const n = createChart({ ...ch, w, h, palette: ch.palette });
  for (let y = 0; y < Math.min(h, ch.h); y++) for (let x = 0; x < Math.min(w, ch.w); x++) { n.st[idx(n, x, y)] = get(ch, x, y); n.col[idx(n, x, y)] = getC(ch, x, y); }
  // kesilen saç örgüsü: devamı kalmayan çaprazları düzelt
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = get(n, x, y), S = STITCHES[c]; if (S?.cable && x + S.cable > w) for (let k = 0; k < w - x; k++) n.st[idx(n, x + k, y)] = 'k'; }
  ch.w = w; ch.h = h; ch.st = n.st; ch.col = n.col; if (ch.repeat && (ch.repeat.x + ch.repeat.w > w || ch.repeat.y + ch.repeat.h > h)) ch.repeat = null;
  return ch;
}

/* ---------- hazır desenler ---------- */
export const TEMPLATES = {
  duz: { label: 'Düz örgü (süprem)', w: 12, h: 12, make: () => (x, y) => 'k' },
  ters: { label: 'Ters örgü', w: 12, h: 12, make: () => () => 'p' },
  rib11: { label: 'Ribana 1×1', w: 12, h: 8, make: () => (x) => (x % 2 ? 'p' : 'k'), repeat: [2, 1] },
  rib22: { label: 'Ribana 2×2', w: 16, h: 8, make: () => (x) => (x % 4 < 2 ? 'k' : 'p'), repeat: [4, 1] },
  sac22: { label: 'Saç örgüsü 2/2 (ters zemin)', w: 8, h: 8, repeat: [8, 8], cells: (ch) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) ch.st[idx(ch, x, y)] = x < 2 || x > 5 ? 'p' : 'k'; setStitch(ch, 2, 3, 'c4R'); } },
  sac33: { label: 'Saç örgüsü 3/3 (ters zemin)', w: 10, h: 10, repeat: [10, 10], cells: (ch) => { for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) ch.st[idx(ch, x, y)] = x < 2 || x > 7 ? 'p' : 'k'; setStitch(ch, 2, 4, 'c6L'); } },
  baklava: { label: 'Jakar baklava (2 renk)', w: 12, h: 12, repeat: [12, 12], palette: [{ name: 'Zemin', hex: '#e7e1d4' }, { name: 'Motif', hex: '#1e3a8a' }], cells: (ch) => { for (let y = 0; y < 12; y++) for (let x = 0; x < 12; x++) ch.col[idx(ch, x, y)] = Math.abs(x - 5.5) + Math.abs(y - 5.5) <= 4 && Math.abs(x - 5.5) + Math.abs(y - 5.5) >= 2 ? 1 : 0; } },
  ajur: { label: 'Ajur (delik) — dengeli', w: 10, h: 4, repeat: [10, 4], cells: (ch) => { for (let x = 0; x < 10; x += 5) { setStitch(ch, x + 1, 1, 'k2t'); setStitch(ch, x + 2, 1, 'yo'); setStitch(ch, x + 3, 3, 'yo'); setStitch(ch, x + 4, 3, 'ssk'); } } },
  milano: { label: 'Askılı (yarım milano)', w: 8, h: 4, repeat: [2, 2], make: () => (x, y) => (y % 2 === 1 && x % 2 === 0 ? 't' : 'k') },
};
export function fromTemplate(key, o = {}) {
  const T = TEMPLATES[key]; if (!T) throw new Error('Bilinmeyen desen: ' + key);
  const ch = createChart({ name: T.label, w: T.w, h: T.h, palette: T.palette, ...o });
  if (T.make) { const f = T.make(); for (let y = 0; y < ch.h; y++) for (let x = 0; x < ch.w; x++) ch.st[idx(ch, x, y)] = f(x, y); }
  if (T.cells) T.cells(ch);
  if (T.repeat) ch.repeat = { x: 0, y: 0, w: T.repeat[0], h: T.repeat[1] };
  return ch;
}
// tekrarı bir alana yay: alan genişliği × yüksekliği (ilmek × sıra), tekrar ortalanır
export function tile(ch, W, H) {
  const r = ch.repeat || { x: 0, y: 0, w: ch.w, h: ch.h };
  const out = createChart({ name: ch.name + ` (${W}×${H})`, w: W, h: H, palette: ch.palette });
  const ox = Math.floor((W % r.w) / 2);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const sx = r.x + (((x - ox) % r.w) + r.w) % r.w, sy = r.y + (y % r.h);
    out.st[idx(out, x, y)] = get(ch, sx, sy); out.col[idx(out, x, y)] = getC(ch, sx, sy);
  }
  // kenarda bölünen saç örgüsü düz ilmeğe çevrilir (raporlanır)
  let cut = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const c = get(out, x, y), S = STITCHES[c];
    if (S?.cable) { let ok = x + S.cable <= W; for (let k = 1; ok && k < S.cable; k++) ok = get(out, x + k, y) === 'c+'; if (!ok) { cut++; out.st[idx(out, x, y)] = 'k'; } }
    if (c === 'c+' && (x === 0 || (get(out, x - 1, y) !== 'c+' && !STITCHES[get(out, x - 1, y)]?.cable))) out.st[idx(out, x, y)] = 'k';
  }
  return { chart: out, cutCables: cut };
}

/* ---------- istatistik ve doğrulama ---------- */
export function rowStats(ch, y) {
  let delta = 0; const counts = {}, colors = new Set();
  let live = 0;
  for (let x = 0; x < ch.w; x++) { const c = get(ch, x, y); counts[c] = (counts[c] || 0) + 1; delta += STITCHES[c]?.delta || 0; if (c !== 'x') { live++; colors.add(getC(ch, x, y)); } }
  // her rengin en uzun atlama (float) boyu: rengin sırada kullanıldığı aralıkta, o rengin olmadığı ardışık ilmekler
  const floats = {};
  for (const c of colors) {
    let first = -1, last = -1; for (let x = 0; x < ch.w; x++) if (get(ch, x, y) !== 'x' && getC(ch, x, y) === c) { if (first < 0) first = x; last = x; }
    let run = 0, mx = 0; for (let x = first; x <= last; x++) { if (get(ch, x, y) !== 'x' && getC(ch, x, y) !== c) { run++; mx = Math.max(mx, run); } else run = 0; }
    floats[c] = mx;
  }
  // atlama (miss) ilmeklerinin oluşturduğu ip uzunluğu
  let mrun = 0, mmax = 0; for (let x = 0; x < ch.w; x++) { if (get(ch, x, y) === 'm') { mrun++; mmax = Math.max(mmax, mrun); } else mrun = 0; }
  return { delta, counts, colors: [...colors], floats, missRun: mmax, live };
}
// opts: { maxFloat: en uzun izin verilen atlama ipliği (ilmek), maxColors: sırada en çok renk, maxTuck: aynı iğnede üst üste askı }
export function validateChart(ch, { maxFloat = 7, maxColors = 2, maxTuck = 4 } = {}) {
  const out = [], W = 'Desen ' + (ch?.name || ''), E = (m) => out.push({ level: 'hata', where: W, msg: m }), Wn = (m) => out.push({ level: 'uyarı', where: W, msg: m });
  if (!ch || !Array.isArray(ch.st) || ch.st.length !== ch.w * ch.h || ch.col.length !== ch.w * ch.h) { E('Desen verisi bozuk'); return out; }
  const unknown = new Set(ch.st.filter((c) => !STITCHES[c])); if (unknown.size) E('Desteklenmeyen ilmek kodu: ' + [...unknown].join(', ') + ' (yanlış talimat üretilmemesi için reddedildi)');
  if (ch.col.some((c) => !(Number.isInteger(c) && c >= 0 && c < ch.palette.length))) E('Paletde olmayan renk');
  for (let y = 0; y < ch.h; y++) {
    const r = `Sıra ${y + 1}`;
    for (let x = 0; x < ch.w; x++) {
      const c = get(ch, x, y), S = STITCHES[c];
      if (S?.cable) { for (let k = 1; k < S.cable; k++) if (x + k >= ch.w || get(ch, x + k, y) !== 'c+') { E(`${r}, ilmek ${x + 1}: saç örgüsü eksik (${S.cable} ilmek gerekir)`); break; } }
      if (c === 'c+') { let x0 = x; while (x0 > 0 && get(ch, x0, y) === 'c+') x0--; const A = STITCHES[get(ch, x0, y)]; if (!A?.cable || x - x0 >= A.cable) E(`${r}, ilmek ${x + 1}: başı olmayan saç örgüsü devamı`); }
    }
    const s = rowStats(ch, y);
    if (s.delta) Wn(`${r}: ilmek sayısı ${s.delta > 0 ? '+' : ''}${s.delta} değişiyor (delik / eksiltme dengesiz) — bilinçli şekillendirme değilse düzelt`);
    if (s.colors.length > maxColors) Wn(`${r}: ${s.colors.length} renk — ${maxColors}'den fazla renk için arka bağlamalı makine jakarı gerekir`);
    for (const [c, f] of Object.entries(s.floats)) if (f > maxFloat) Wn(`${r}: "${ch.palette[c].name}" rengi ${f} ilmek atlıyor (en çok ${maxFloat}): uzun atlama ipliği takılır, bağlama gerekir`);
    if (s.missRun > maxFloat) Wn(`${r}: ${s.missRun} ilmek üst üste atlama — iplik arkada uzun kalır`);
    if (s.live === 0) Wn(`${r}: hiç ilmek yok`);
  }
  for (let x = 0; x < ch.w; x++) { let run = 0, mx = 0; for (let y = 0; y < ch.h; y++) { run = get(ch, x, y) === 't' ? run + 1 : 0; mx = Math.max(mx, run); } if (mx > maxTuck) Wn(`İlmek ${x + 1}: ${mx} sıra üst üste askı (en çok ${maxTuck}) — iğnede ilmek birikir`); }
  if (ch.repeat) { const r = ch.repeat; if (r.w < 1 || r.h < 1 || r.x < 0 || r.y < 0 || r.x + r.w > ch.w || r.y + r.h > ch.h) E('Tekrar alanı desen dışında'); }
  return out;
}

/* ---------- çıktılar ---------- */
// Yazılı talimat. flat: gidiş-dönüş (tek sıralar ön yüz sağdan sola; çift sıralar arka yüz soldan sağa, düz / ters yer değiştirir)
export function instructions(ch, { flat = true } = {}) {
  const lines = [], swap = { k: 'p', p: 'k' };
  const name = (c) => ({ k: 'düz', p: 'ters', t: 'askı', m: 'atla', yo: 'iplik at', k2t: '2 birlikte düz', ssk: 'sola eksilt', x: '—' }[c] || STITCHES[c]?.label);
  for (let y = 0; y < ch.h; y++) {
    const ws = flat && y % 2 === 1, xs = [...Array(ch.w).keys()]; if (!ws) xs.reverse();
    const seq = [];
    for (const x of xs) {
      let c = get(ch, x, y); if (c === 'c+' || c === 'x') continue;
      if (ws && swap[c]) c = swap[c];
      const label = STITCHES[c]?.cable ? STITCHES[c].label : name(c), col = ch.palette.length > 1 ? ` (${ch.palette[getC(ch, x, y)].name})` : '';
      const lab = label + col;
      if (seq.length && seq.at(-1).lab === lab) seq.at(-1).n++; else seq.push({ lab, n: 1 });
    }
    lines.push(`${y + 1}. sıra (${ws ? 'arka yüz, soldan sağa' : flat ? 'ön yüz, sağdan sola' : 'sağdan sola'}): ` + seq.map((s) => `${s.n} ${s.lab}`).join(', '));
  }
  return lines;
}
export function toCSV(ch) {
  const rows = ['sira;' + [...Array(ch.w).keys()].map((x) => 'i' + (x + 1)).join(';')];
  for (let y = ch.h - 1; y >= 0; y--) rows.push(`${y + 1};` + [...Array(ch.w).keys()].map((x) => get(ch, x, y) + (ch.palette.length > 1 ? ':' + getC(ch, x, y) : '')).join(';'));
  return rows.join('\n') + '\n';
}
