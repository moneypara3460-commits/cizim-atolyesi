// Mekatronik Mühendisliği — 7. aşama: benzetim. Makine çevriminin zaman çizelgesi (hareket etüdü): her tahrikin hareketleri
// sıralı ya da eşzamanlı; yamuk / üçgen hız profili; çevrim süresi ve saatlik üretim; tüm çevrim boyunca her motorun
// tork – devir yükü (RMS, tepe, devir, atalet oranı); aynı motorun çakışan hareketi ve "birlikte olamaz" kilit denetimi;
// zaman serisi (CSV), çizelge ve hız grafiği, PDF rapor. Saf fonksiyonlar; DOM gerektirmez (tests/meka-sim.test.mjs).
//
// Fizik (temel dinamik; 1. ve 3. aşamadaki eksen hesaplarıyla aynı bağıntılar):
//   ω = 2π·n/60, n = v·k·60 (k: motor devri / birim yol, dev/mm ya da dev/°); α = ω / ta
//   Hızlanma ve yavaşlamada |T| = J_toplam·α + |T_yük| (güvenli taraf: yavaşlamada da yük torku eklenir)
//   Sabit hızda |T| = |T_yük|; hareketsizken |T| = |T_tutma|
//   T_rms = √( Σ T²·Δt / t_çevrim ), tüm çevrim boyunca (bekleme dahil)
// Kısa harekette (v·ta ≥ s) profil üçgendir: ulaşılan hız v' = s / ta.

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const PI = Math.PI;
export const TAHRIK_TUR = { eksen: 'Elektrikli eksen (servo / step motor)', pnomatik: 'Pnömatik silindir', sure: 'Sabit süreli işlem (dolum, kaynak, bekleme…)' };
export const BASLA = { sonra: 'Öncekinden sonra', birlikte: 'Öncekiyle birlikte' };
export const TAHRIK_DEF = { ad: 'Tahrik', tur: 'eksen', birim: 'mm', J: NaN, Tl: 0, Th: 0, k: NaN, Jm: NaN, Tn: NaN, Tmax: NaN, nmax: NaN, SF: 1.5, oranSinir: 10, kaynak: '' };
export const HAREKET_DEF = { ad: 'Hareket', tahrik: null, yol: NaN, v: NaN, ta: NaN, sure: NaN, gecikme: 0, basla: 'sonra', ofset: 0 };

/* ---------- Proje verisi ---------- */
export function simEmpty() { return { tahrikler: [], hareketler: [], kilitler: [], ayar: { vardiya: 8, verim: 85 }, nextId: 1 }; }
const num = (v, d) => (fin(v) ? v : d);
export function simSanitize(o) {
  const S = simEmpty();
  if (!o || typeof o !== 'object') return S;
  const ids = new Set();
  for (const t of Array.isArray(o.tahrikler) ? o.tahrikler.slice(0, 50) : []) {
    if (!t || !fin(t.id) || ids.has(t.id) || !TAHRIK_TUR[t.tur]) continue;
    ids.add(t.id);
    const x = { id: t.id, tur: t.tur, ad: typeof t.ad === 'string' && t.ad ? t.ad.slice(0, 60) : 'Tahrik', birim: t.birim === '°' ? '°' : 'mm', kaynak: typeof t.kaynak === 'string' ? t.kaynak.slice(0, 120) : '' };
    for (const k of ['J', 'Tl', 'Th', 'k', 'Jm', 'Tn', 'Tmax', 'nmax', 'SF', 'oranSinir']) x[k] = num(t[k], TAHRIK_DEF[k]);
    S.tahrikler.push(x);
  }
  const tids = new Set(S.tahrikler.map((t) => t.id));
  for (const h of Array.isArray(o.hareketler) ? o.hareketler.slice(0, 200) : []) {
    if (!h || !fin(h.id) || ids.has(h.id)) continue;
    ids.add(h.id);
    const x = { id: h.id, ad: typeof h.ad === 'string' && h.ad ? h.ad.slice(0, 60) : 'Hareket', tahrik: tids.has(h.tahrik) ? h.tahrik : null, basla: BASLA[h.basla] ? h.basla : 'sonra' };
    for (const k of ['yol', 'v', 'ta', 'sure', 'gecikme', 'ofset']) x[k] = num(h[k], HAREKET_DEF[k]);
    S.hareketler.push(x);
  }
  const hids = new Set(S.hareketler.map((h) => h.id));
  for (const k of Array.isArray(o.kilitler) ? o.kilitler.slice(0, 100) : []) if (Array.isArray(k) && k.length === 2 && k.every((x) => hids.has(x)) && k[0] !== k[1]) S.kilitler.push([k[0], k[1]]);
  S.ayar.vardiya = fin(o.ayar?.vardiya) ? o.ayar.vardiya : 8; S.ayar.verim = fin(o.ayar?.verim) ? o.ayar.verim : 85;
  S.nextId = Math.max(fin(o.nextId) ? o.nextId : 1, ...[...ids].map((i) => i + 1), 1);
  return S;
}
export function tahrikEkle(S, from = {}) { const t = { ...TAHRIK_DEF, id: S.nextId++, ...from }; S.tahrikler.push(t); return t; }
export function hareketEkle(S, from = {}) { const h = { ...HAREKET_DEF, id: S.nextId++, ...from }; S.hareketler.push(h); return h; }

// 1. ve 3. aşama eksen kartı sonucundan tahrik değerleri (anlık kopya; kart değişirse yeniden alınır)
export function karttanTahrik(tur, r) {
  if (!r || !r.sonuc || !r.giris) throw new Error('Kart hesabı yok ya da hatalı');
  const g = r.giris, s = r.sonuc;
  const ortak = { tur: 'eksen', Jm: g.Jm, Tn: g.Tn, Tmax: g.Tmax, nmax: g.nmax, SF: g.SF, oranSinir: g.oranSinir, J: g.Jm + s.Jref, Tl: s.Tl };
  if (tur === 'vida') return { ...ortak, ad: 'Vidalı eksen', birim: 'mm', Th: s.Thold, k: g.i / g.P, kaynak: 'Vidalı eksen kartı (motor + vida)' };
  if (tur === 'kayis' || tur === 'kremayer') return { ...ortak, ad: tur === 'kayis' ? 'Kayışlı eksen' : 'Kremayer ekseni', birim: 'mm', Th: s.Th, k: g.i / (PI * g.Dp), kaynak: (tur === 'kayis' ? 'Kayışlı' : 'Kremayer') + ' eksen kartı' };
  if (tur === 'tabla') return { ...ortak, ad: 'Döner tabla', birim: '°', Th: 0, k: g.i / 360, kaynak: 'Döner tabla kartı' };
  throw new Error('Bu kart hareket tahriki değil');
}

/* ---------- Tek hareketin profili ---------- */
function profil(h, t) {
  if (t.tur === 'sure') { if (!(fin(h.sure) && h.sure > 0)) throw new Error('süre girilmeli'); return { T: h.sure, ta: 0, tc: h.sure, vp: 0, ucgen: false }; }
  if (!(fin(h.yol) && h.yol > 0)) throw new Error('yol girilmeli');
  if (!(fin(h.v) && h.v > 0)) throw new Error('hız girilmeli');
  if (t.tur === 'pnomatik') { const g = fin(h.gecikme) && h.gecikme >= 0 ? h.gecikme : 0; return { T: g + h.yol / h.v, ta: 0, tc: h.yol / h.v, vp: h.v, ucgen: false, gecikme: g }; }
  if (!(fin(h.ta) && h.ta > 0)) throw new Error('hızlanma süresi girilmeli');
  let vp = h.v, tc, ucgen = false;
  if (h.v * h.ta >= h.yol) { vp = h.yol / h.ta; tc = 0; ucgen = true; } else tc = (h.yol - h.v * h.ta) / h.v;
  return { T: 2 * h.ta + tc, ta: h.ta, tc, vp, ucgen };
}

/* ---------- Çevrim benzetimi ---------- */
export function simule(S) {
  const k = [], add = (ok, duzey, metin) => k.push({ ok, duzey: ok ? (duzey === 'bilgi' ? 'bilgi' : 'tamam') : duzey, metin });
  const T = new Map(S.tahrikler.map((t) => [t.id, t]));
  const olaylar = [];
  let prev = null;
  S.hareketler.forEach((h, i) => {
    const t = T.get(h.tahrik);
    if (!t) { add(false, 'hata', `Hareket ${i + 1} "${h.ad}": tahrik seçilmedi`); return; }
    let p;
    try { p = profil(h, t); } catch (e) { add(false, 'hata', `Hareket ${i + 1} "${h.ad}": ${e.message}`); return; }
    const ofs = fin(h.ofset) && h.ofset > 0 ? h.ofset : 0;
    const bas = (prev ? (h.basla === 'birlikte' ? prev.bas : prev.bit) : 0) + ofs;
    const o = { h, t, p, bas, bit: bas + p.T, no: i + 1 };
    if (t.tur === 'eksen') {
      const n = p.vp * t.k * 60, w = (2 * PI * n) / 60, a = w / p.ta;
      o.n = n; o.alpha = a; o.Tacc = t.J * a + Math.abs(t.Tl);
      if (p.ucgen) add(true, 'bilgi', `Hareket ${i + 1} "${h.ad}": kısa hareket, üçgen profil (ulaşılan hız ${p.vp.toFixed(1)} ${t.birim}/s)`);
    }
    olaylar.push(o); prev = o;
  });
  const tcyc = olaylar.length ? Math.max(...olaylar.map((o) => o.bit)) : 0;
  // aynı tahrikte çakışma, kilitler
  for (const t of S.tahrikler) {
    const os = olaylar.filter((o) => o.t === t).sort((a, b) => a.bas - b.bas);
    for (let i = 1; i < os.length; i++) if (os[i].bas < os[i - 1].bit - 1e-9) add(false, 'hata', `"${t.ad}" aynı anda iki hareket yapıyor: ${os[i - 1].no} ve ${os[i].no} çakışıyor (${os[i].bas.toFixed(2)} s < ${os[i - 1].bit.toFixed(2)} s)`);
  }
  const byH = new Map(olaylar.map((o) => [o.h.id, o]));
  for (const [x, y] of S.kilitler) {
    const a = byH.get(x), b = byH.get(y);
    if (!a || !b) continue;
    const ust = Math.min(a.bit, b.bit) - Math.max(a.bas, b.bas);
    add(!(ust > 1e-9), 'hata', `Kilit "${a.h.ad}" ⟂ "${b.h.ad}": ` + (ust > 1e-9 ? `${ust.toFixed(2)} s birlikte çalışıyor` : 'zamanda çakışmıyor'));
  }
  // motor yükü (tüm çevrim)
  const motorlar = [];
  for (const t of S.tahrikler.filter((x) => x.tur === 'eksen')) {
    const os = olaylar.filter((o) => o.t === t);
    if (!os.length) { add(false, 'uyari', `"${t.ad}" çevrimde hiç kullanılmıyor`); continue; }
    const eksik = ['J', 'k', 'Jm', 'Tn', 'Tmax', 'nmax', 'SF'].filter((f) => !(fin(t[f]) && t[f] > 0));
    if (eksik.length) { add(false, 'hata', `"${t.ad}": motor / mekanizma değeri eksik (${eksik.join(', ')}) — eksen kartından al ya da katalogdan gir`); continue; }
    let e = 0, hareket = 0, tepe = 0, nmax = 0;
    for (const o of os) { e += o.Tacc ** 2 * 2 * o.p.ta + t.Tl ** 2 * o.p.tc; hareket += o.p.T; tepe = Math.max(tepe, o.Tacc); nmax = Math.max(nmax, o.n); }
    const bos = Math.max(0, tcyc - hareket); e += t.Th ** 2 * bos;
    const rms = Math.sqrt(e / tcyc), oran = (t.J - t.Jm) / t.Jm;
    const m = { t, rms, tepe, nmax, oran, bos, gorev: hareket / tcyc };
    motorlar.push(m);
    add(nmax <= t.nmax, 'hata', `"${t.ad}": en yüksek motor devri ${nmax.toFixed(0)} ≤ ${t.nmax} dev/dk`);
    add(rms * t.SF <= t.Tn, 'hata', `"${t.ad}": çevrim RMS torku × güvenlik ${rms.toFixed(3)} × ${t.SF} = ${(rms * t.SF).toFixed(3)} ≤ anma ${t.Tn} N·m`);
    add(tepe <= t.Tmax, 'hata', `"${t.ad}": tepe tork ${tepe.toFixed(3)} ≤ motor en yüksek ${t.Tmax} N·m`);
    if (tepe <= t.Tmax && tepe > 0.8 * t.Tmax) add(false, 'uyari', `"${t.ad}": tepe tork motor sınırının %${Math.round((100 * tepe) / t.Tmax)}'i (sürücü akım sınırını kontrol et)`);
    if (oran > t.oranSinir) add(false, 'uyari', `"${t.ad}": atalet oranı ${oran.toFixed(1)} : 1 > hedef ${t.oranSinir} : 1`);
  }
  if (!olaylar.length) add(false, 'uyari', 'Henüz hareket yok');
  const a = S.ayar, adet = tcyc > 0 ? 3600 / tcyc : 0;
  return { olaylar, tcyc, adetSaat: adet, adetVardiya: adet * num(a.vardiya, 8) * (num(a.verim, 85) / 100), motorlar, kontroller: k, uygun: k.every((c) => c.ok || c.duzey !== 'hata') };
}

// Bir hareketin t anındaki hızı (birim/s) — grafik ve zaman serisi için
export function hizAn(o, t) {
  const x = t - o.bas, p = o.p;
  if (x < 0 || x > p.T) return 0;
  if (o.t.tur === 'sure') return 0;
  if (o.t.tur === 'pnomatik') return x < (p.gecikme || 0) ? 0 : p.vp;
  if (x < p.ta) return (p.vp * x) / p.ta;
  if (x <= p.ta + p.tc) return p.vp;
  return Math.max(0, (p.vp * (p.T - x)) / p.ta);
}
export function zamanSerisi(sim, S, adim = 0) {
  const dt = adim > 0 ? adim : Math.max(sim.tcyc / 400, 0.001), rows = [];
  for (let t = 0; t <= sim.tcyc + 1e-9; t += dt) {
    const r = { t };
    for (const d of S.tahrikler) r[d.id] = sim.olaylar.filter((o) => o.t.id === d.id).reduce((s, o) => s + hizAn(o, t), 0);
    rows.push(r);
  }
  return { dt, rows };
}
const csvq = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const tr = (v, d) => v.toFixed(d).replace('.', ',');
export function seriCSV(sim, S) {
  const { rows } = zamanSerisi(sim, S), D = S.tahrikler.filter((d) => d.tur !== 'sure');
  const aktif = (t) => sim.olaylar.filter((o) => t >= o.bas && t <= o.bit).map((o) => o.no).join(' ');
  return '\ufeff' + [['Zaman (s)', ...D.map((d) => `${d.ad} hız (${d.tur === 'pnomatik' ? 'mm' : d.birim}/s)`), 'Etkin hareketler (no)'].map(csvq).join(';'), ...rows.map((r) => [tr(r.t, 4), ...D.map((d) => tr(r[d.id], 3)), aktif(r.t)].join(';'))].join('\r\n');
}
// Zaman çizelgesi (Gantt) + tahrik başına hız grafiği: çizim ilkelleri (mm, y aşağı)
export function cizelge(sim, S) {
  const P = [], L = (x1, y1, x2, y2) => P.push({ t: 'l', x1, y1, x2, y2 }), R = (x, y, w, h) => P.push({ t: 'r', x, y, w, h }), Tx = (x, y, size, str, center = false) => P.push({ t: 's', x, y, size, str: String(str), center });
  const W = 170, x0 = 38, gw = W - x0 - 9, tc = sim.tcyc || 1, X = (t) => x0 + (t / tc) * gw;
  const kisa = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  let y = 4;
  Tx(2, y + 3, 2.6, 'Çevrim ' + tr(sim.tcyc, 2) + ' s'); y += 6;
  // zaman ekseni
  L(x0, y, x0 + gw, y);
  for (let i = 0; i <= 5; i++) { const t = (tc * i) / 5; L(X(t), y - 1, X(t), y + 1); Tx(X(t), y + 4, 2, tr(t, 2), true); }
  y += 7;
  for (const o of sim.olaylar) {
    Tx(2, y + 3, 2.2, kisa(o.no + '. ' + o.h.ad, 22));
    R(X(o.bas), y, Math.max(0.6, X(o.bit) - X(o.bas)), 4);
    y += 6;
  }
  y += 3;
  // hız grafikleri
  for (const d of S.tahrikler.filter((x) => x.tur !== 'sure')) {
    const os = sim.olaylar.filter((o) => o.t.id === d.id);
    if (!os.length) continue;
    const vmax = Math.max(...os.map((o) => o.p.vp), 1e-9), H = 12;
    Tx(2, y + 3, 2.2, kisa(d.ad, 18)); Tx(2, y + 6.5, 1.9, 'en çok ' + tr(vmax, 0) + ' ' + d.birim + '/s');
    L(x0, y + H, x0 + gw, y + H); L(x0, y, x0, y + H);
    const N = 240; let px = X(0), py = y + H;
    for (let i = 1; i <= N; i++) { const t = (tc * i) / N, v = os.reduce((s, o) => s + hizAn(o, t), 0), qx = X(t), qy = y + H - (v / vmax) * H; L(px, py, qx, qy); px = qx; py = qy; }
    y += H + 5;
  }
  return { w: W, h: y + 2, prims: P };
}
export function simRapor(S, proje = '') {
  const sim = simule(S), L = ['ÇİZİM ATÖLYESİ — MEKATRONİK MÜHENDİSLİĞİ BENZETİM RAPORU', 'Hareket etüdü ve çevrim süresi' + (proje ? ' · ' + proje : ''), 'Sonuç: ' + (sim.uygun ? 'UYGUN (sınır aşımı yok)' : 'UYGUN DEĞİL — aşağıdaki hatalara bak'), ''];
  L.push('ÇEVRİM', `  Çevrim süresi ${tr(sim.tcyc, 3)} s · saatte ${tr(sim.adetSaat, 1)} adet · vardiyada (${S.ayar.vardiya} saat, %${S.ayar.verim} verim) ${Math.floor(sim.adetVardiya)} adet`, '');
  L.push('TAHRİKLER');
  for (const t of S.tahrikler) L.push(`  ${t.ad} (${TAHRIK_TUR[t.tur]})` + (t.tur === 'eksen' ? `: J toplam ${t.J} kg·m², T yük ${t.Tl} N·m, T tutma ${t.Th} N·m, k ${t.k} dev/${t.birim}; motor Jm ${t.Jm}, Tn ${t.Tn}, Tmax ${t.Tmax} N·m, nmax ${t.nmax} dev/dk, güvenlik ${t.SF}` : '') + (t.kaynak ? ' — kaynak: ' + t.kaynak : ''));
  L.push('', 'HAREKETLER (ZAMAN ÇİZELGESİ)');
  for (const o of sim.olaylar) L.push(`  ${o.no}. ${o.h.ad} — ${o.t.ad}: ${tr(o.bas, 3)} → ${tr(o.bit, 3)} s (${tr(o.p.T, 3)} s)` + (o.t.tur === 'eksen' ? `; yol ${o.h.yol} ${o.t.birim}, hız ${tr(o.p.vp, 1)} ${o.t.birim}/s, ta ${o.p.ta} s${o.p.ucgen ? ' (üçgen profil)' : ''}; motor ${tr(o.n, 0)} dev/dk, α ${tr(o.alpha, 1)} rad/s², hızlanma torku ${tr(o.Tacc, 3)} N·m` : o.t.tur === 'pnomatik' ? `; strok ${o.h.yol} mm, ortalama hız ${o.h.v} mm/s, gecikme ${o.p.gecikme} s` : ''));
  L.push('', 'MOTOR YÜKÜ (TÜM ÇEVRİM)');
  for (const m of sim.motorlar) L.push(`  ${m.t.ad}: RMS ${tr(m.rms, 3)} N·m · tepe ${tr(m.tepe, 3)} N·m · en yüksek devir ${tr(m.nmax, 0)} dev/dk · atalet oranı ${tr(m.oran, 2)} : 1 · hareket payı %${tr(m.gorev * 100, 0)}`);
  L.push('', 'DENETİMLER');
  for (const c of sim.kontroller) L.push('  ' + (c.ok ? (c.duzey === 'bilgi' ? 'ℹ' : '✓') : c.duzey === 'hata' ? '✗ HATA' : '⚠ UYARI') + ' ' + c.metin);
  L.push('', 'YÖNTEM', '  ω = 2π·n/60, n = v·k·60, α = ω/ta; hızlanma ve yavaşlamada |T| = J·α + |T_yük| (güvenli taraf), sabit hızda |T_yük|, beklemede |T_tutma|; T_rms = √(Σ T²·Δt / t_çevrim).',
    '  Eksen değerleri 1. / 3. aşama kartlarından anlık kopyadır; kart değişirse yeniden alınmalıdır. Pnömatik süre = gecikme + strok / ortalama hız (silindir ve valf kataloğundan).',
    '', 'Bu benzetim ön tasarım hesabıdır: sürtünmenin yöne göre değişimi, esneklik, titreşim, sürücü akım döngüsü ve ısınma modellenmez; motor ve sürücü üreticinin boyutlandırma yazılımıyla kesinleştirilmelidir.');
  return L;
}

// Örnek (temsilî): dolum istasyonu çevrimi
export function simOrnek() {
  const S = simEmpty();
  const ek = tahrikEkle(S, { ad: 'Kayışlı taşıma ekseni', tur: 'eksen', birim: 'mm', J: 0.0004, Tl: 0.26, Th: 0, k: 1 / (PI * 50), Jm: 0.00012, Tn: 1.27, Tmax: 3.8, nmax: 3000, SF: 1.5, oranSinir: 10, kaynak: 'temsilî değerler' });
  const sil = tahrikEkle(S, { ad: 'İtici silindir', tur: 'pnomatik' });
  const dol = tahrikEkle(S, { ad: 'Dolum', tur: 'sure' });
  const h1 = hareketEkle(S, { ad: 'Parçayı istasyona taşı', tahrik: ek.id, yol: 400, v: 600, ta: 0.15 });
  const h2 = hareketEkle(S, { ad: 'İtici ileri', tahrik: sil.id, yol: 80, v: 250, gecikme: 0.03 });
  hareketEkle(S, { ad: 'Dolum', tahrik: dol.id, sure: 2 });
  hareketEkle(S, { ad: 'İtici geri', tahrik: sil.id, yol: 80, v: 300, gecikme: 0.03 });
  hareketEkle(S, { ad: 'Taşıyıcı geri dön', tahrik: ek.id, yol: 400, v: 800, ta: 0.15, basla: 'birlikte' });
  S.kilitler.push([h1.id, h2.id]);
  return S;
}
