// 4 / 5 eksen Güvenli Kesim: risk haritası ve kuru çalıştırma (havada deneme). Saf hesap; cam5.js'in CL dizisini kullanır.
// Kırmızı satırlar zaten G-kodunu engeller (çarpışma / eksen sınırı, coll5.js). Bu dosya sarı satırları ve kuru çalıştırmayı ekler.
import { inverse, add, mul } from './kin.js?v=20261112u';
import { stockBox } from './cam5.js?v=20261127a';
import { checkCollisions } from './coll5.js?v=20261127a';

export const ROT_STEP = 15;   // derece: tek ilerlemeli harekette bundan büyük döner eksen değişimi sarı
export const NEAR_ROT = 2, NEAR_LIN = 2;   // sınıra bu kadar yakın (derece / mm) eksen konumu sarı

// Risk haritası: her CL noktası için { lvl: 0 yeşil / 1 sarı / 2 kırmızı, why, slow }.
//   kırmızı: çarpışma (takım, sap, tutucu, iş mili burnu ↔ parça, bağlama, tabla), eksen sınırı / erişilemeyen yön
//   sarı:    takım değişiminden sonraki ilk yaklaşma (boy ofseti) · tek ilerlemeli harekette döner eksenin ROT_STEP°'den
//            fazla dönmesi (kumanda ara noktaları farklı hesaplayabilir; "slow") · eksenin sınırına NEAR_ROT° / NEAR_LIN mm yakınlık
export function risk5(R, safety, job = {}) {
  const n = R.cl.length, out = new Array(n), m = R.machine, rot = m.rot || [], lin = m.lin || { X: [-400, 400], Y: [-250, 250], Z: [-400, 300] };
  const tools = new Map((job.tools || []).map((t) => [t.id, t]));
  for (let i = 0; i < n; i++) out[i] = { lvl: 0, why: '', slow: false };
  const set = (i, lvl, why, slow = false) => { const r = out[i]; if (!r) return; if (lvl > r.lvl) { r.lvl = lvl; r.why = why; } if (slow) r.slow = true; };
  for (const h of (safety && safety.hits) || []) set(h.i, 2, h.k === 'limit' ? `Eksen sınırı / erişilemeyen yön: ${h.obj}` : `${h.comp} ↔ ${h.obj} çarpışıyor${h.k === 'r' ? ' (hızlı harekette)' : ''}`);
  for (let i = 0; i < n; i++) {
    const c = R.cl[i], ax = R.ax[i];
    if (c.tc) { const t = tools.get(c.tool); set(i, 1, `Takım değişiminden sonra ilk yaklaşma: T${t ? t.n : c.tool} boy ofsetini (H${t ? t.n : c.tool}) kontrol et`); }
    if (!ax) continue;
    if (i > 0 && c.k !== 'r' && R.ax[i - 1]) {
      const d = Math.max(0, ...rot.map((r) => Math.abs(ax[r.name] - R.ax[i - 1][r.name])));
      if (d > ROT_STEP) set(i, 1, `Döner eksen tek harekette ${d.toFixed(1)}° dönüyor: kumanda ara noktaları farklı hesaplayabilir, yavaş çalıştır`, true);
    }
    for (const r of rot) {
      if (r.cont || r.max - r.min >= 360) continue;
      const v = ax[r.name];
      if (v - r.min < NEAR_ROT || r.max - v < NEAR_ROT) set(i, 1, `${r.name} ekseni sınırına ${NEAR_ROT}°'den yakın (${v.toFixed(1)}°; sınır ${r.min} / ${r.max})`);
    }
    for (const k of ['X', 'Y', 'Z']) if (ax[k] - lin[k][0] < NEAR_LIN || lin[k][1] - ax[k] < NEAR_LIN) set(i, 1, `${k} ekseni sınırına ${NEAR_LIN} mm'den yakın (${ax[k].toFixed(1)}; sınır ${lin[k][0]} / ${lin[k][1]})`);
  }
  const count = { green: 0, yellow: 0, red: 0 };
  for (const r of out) count[['green', 'yellow', 'red'][r.lvl]]++;
  return { points: out, count };
}

// p noktasından v yönünde, ham parçayı e kadar büyütülmüş hâlinden çıkış parametresi (dışarıdaysa 0)
function exitParam(st, p, v, e) {
  const sb = stockBox(st);
  if (st.kind === 'cyl') {
    const R = st.r + e, x0 = sb.min[0] - e, x1 = sb.max[0] + e;
    if (p[0] < x0 || p[0] > x1 || p[1] * p[1] + p[2] * p[2] > R * R) return 0;
    let t = Infinity;
    const a = v[1] * v[1] + v[2] * v[2];
    if (a > 1e-12) { const b = p[1] * v[1] + p[2] * v[2], c = p[1] * p[1] + p[2] * p[2] - R * R; t = Math.min(t, (-b + Math.sqrt(Math.max(0, b * b - a * c))) / a); }
    if (v[0] > 1e-12) t = Math.min(t, (x1 - p[0]) / v[0]); else if (v[0] < -1e-12) t = Math.min(t, (x0 - p[0]) / v[0]);
    return Math.max(0, t);
  }
  for (let k = 0; k < 3; k++) if (p[k] < sb.min[k] - e || p[k] > sb.max[k] + e) return 0;
  let t = Infinity;
  for (let k = 0; k < 3; k++) { if (v[k] > 1e-12) t = Math.min(t, (sb.max[k] + e - p[k]) / v[k]); else if (v[k] < -1e-12) t = Math.min(t, (sb.min[k] - e - p[k]) / v[k]); }
  return Math.max(0, t);
}

// Kuru çalıştırma: bütün takım yolu (bağlantı hareketleri dahil) her noktada kendi takım ekseni boyunca aynı d kadar geri
// çekilir. d, kesen her noktada takım ucu ham parçanın (takım yarıçapı + clear) büyütülmüş hâlinin dışına çıkacak kadardır:
// uç ve onun üstündeki bütün takım ekseni hamdan en az clear uzakta kalır. Kaydırılmış yol için ters kinematik ve çarpışma
// kontrolü (bağlama, tabla, iş mili burnu, bitmiş parça) yeniden yapılır; sınır aşımı ya da çarpışma varsa program verilmez.
export function dryShift5(R, job, clear = 10) {
  const c = Math.max(1, +clear || 10), tools = new Map(job.tools.map((t) => [t.id, t]));
  let d = c;
  for (const q of R.cl) {
    if (q.k === 'r') continue;
    const t = tools.get(q.tool), e = (t ? t.d / 2 : 0) + c;
    d = Math.max(d, exitParam(R.S.stock, q.p, q.v, e) + 1e-3);
  }
  const cl = R.cl.map((q) => ({ ...q, p: add(q.p, mul(q.v, d)) }));
  const ax = [], bad = [];
  let prev = null;
  for (let i = 0; i < cl.length; i++) { const r = inverse(R.machine, cl[i].p, cl[i].v, prev); ax.push(r.ax); if (!r.ok) bad.push({ i, why: r.why }); if (r.ax) prev = r.ax; }
  const R2 = { ...R, cl, ax, limitViolations: bad };
  const safety = checkCollisions(R2, job);
  let why = '';
  if (bad.length) why = `kaydırılmış yol eksen sınırını aşıyor (${bad.length} nokta, ilki: ${bad[0].why}); kuru çalıştırma payını küçült`;
  else if (!safety.safe) { const h = safety.hits[0]; why = `kaydırılmış yolda ${h.comp} ↔ ${h.obj} çarpışıyor; kuru çalıştırma payını değiştir`; }
  return { R: R2, d, clear: c, safety, ok: !why, why };
}
