// Akıllı Otomatik Montaj Sırası ve Patlatılmış Görünüm — saf hesap modülü (Node'da test edilir: tests/assembly.test.mjs)
//
// 1) Parça tanıma: kullanıcının verdiği isim (en güçlü), standart ölçü tablosu eşleşmesi (rulman 6xxx, metrik cıvata / rondela / somun),
//    şekil kuralları ("olası"). Güven düzeyi her zaman gösterilir; tahmin kesin sonuç gibi sunulmaz.
// 2) Bağlantılar: oyuk silindirlerin (delik) eksenleri boyunca geçtikleri katı parçalar → cıvatalı bağlantı (delik çapı ISO 273 geçiş deliği
//    tablosuyla M ölçüsüne çevrilir; tabloda yoksa ÖLÇÜ BELİRLENEMEDİ, tahmin yok), kaynak planındaki onaylı kaynaklar, eşleşmeler ve
//    geometrik temas. Türü bilinmeyen temaslar kullanıcıya sorulur.
// 3) Montaj sırası: birimler (kaynaklı gruplar birlikte) 6 ana eksende tek tek sökülür (mfgcheck.blocks süpürme testi); her turda serbest olan
//    EN KÜÇÜK birim sökülür; sökme sırasının tersi montaj sırasıdır. Takılma yönü = sökme yönünün tersi. Sökülemeyenler "mümkün değil".
// 4) Patlatma: her birim sökme yönünde, montaj sırasındaki yerine göre uzaklaştırılır (yalnız öteleme; parçaların yönü korunur).

import { Mesh, blocks, interference, minDistance, holeAxis, AXIS_NAME } from './mfgcheck.js?v=20261111b';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const f1 = (v) => String(Math.round(v * 10) / 10).replace('.', ',');
const AX = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/* ---------- standart tablolar ---------- */
// ISO 273 orta seri geçiş deliği → M ölçüsü; kılavuz (diş) matkap çapı → M ölçüsü
export const CLEAR = [[3, 3.4], [4, 4.5], [5, 5.5], [6, 6.6], [8, 9], [10, 11], [12, 13.5], [14, 15.5], [16, 17.5], [20, 22], [24, 26], [30, 33]];
export const TAP = [[3, 2.5], [4, 3.3], [5, 4.2], [6, 5], [8, 6.8], [10, 8.5], [12, 10.2], [16, 14], [20, 17.5], [24, 21]];
// ISO 7089 rondela (iç / dış / kalınlık), ISO 4032 somun yüksekliği, ISO 4762 / 4017 baş yüksekliği ≈ d
export const WASHER = { 3: [3.2, 7, 0.5], 4: [4.3, 9, 0.8], 5: [5.3, 10, 1], 6: [6.4, 12, 1.6], 8: [8.4, 16, 1.6], 10: [10.5, 20, 2], 12: [13, 24, 2.5], 14: [15, 28, 2.5], 16: [17, 30, 3], 20: [21, 37, 3], 24: [25, 44, 4], 30: [31, 56, 4] };
export const NUT_H = { 3: 2.4, 4: 3.2, 5: 4.7, 6: 5.2, 8: 6.8, 10: 8.4, 12: 10.8, 14: 12.8, 16: 14.8, 20: 18, 24: 21.5, 30: 25.6 };
const BOLT_LEN = [6, 8, 10, 12, 16, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 240, 260, 280, 300];
// rulman (iç Ø, dış Ø, genişlik): 60xx / 62xx / 63xx seçilmiş
export const BEARINGS = {
  '6000': [10, 26, 8], '6001': [12, 28, 8], '6002': [15, 32, 9], '6003': [17, 35, 10], '6004': [20, 42, 12], '6005': [25, 47, 12], '6006': [30, 55, 13], '6008': [40, 68, 15], '6010': [50, 80, 16],
  '6200': [10, 30, 9], '6201': [12, 32, 10], '6202': [15, 35, 11], '6203': [17, 40, 12], '6204': [20, 47, 14], '6205': [25, 52, 15], '6206': [30, 62, 16], '6207': [35, 72, 17], '6208': [40, 80, 18], '6210': [50, 90, 20],
  '6300': [10, 35, 11], '6301': [12, 37, 12], '6302': [15, 42, 13], '6303': [17, 47, 14], '6304': [20, 52, 15], '6305': [25, 62, 17], '6306': [30, 72, 19], '6308': [40, 90, 23],
};
export const boltForHole = (d) => {
  for (const [m, c] of CLEAR) if (Math.abs(d - c) <= 0.15) return { m, kind: 'geçiş' };
  for (const [m, t] of TAP) if (Math.abs(d - t) <= 0.1) return { m, kind: 'diş (kılavuz)' };
  for (const [m] of CLEAR) if (Math.abs(d - m) <= 0.05) return { m, kind: 'tam ölçü (boşluksuz)' };
  return null;
};
export const stdBoltLen = (L) => BOLT_LEN.find((x) => x >= L - 1e-9) || Math.ceil(L / 10) * 10;

/* ---------- parça tanıma ---------- */
const NAME_RULES = [
  [/cıvata|civata|bolt|vida|screw/i, 'Cıvata'], [/somun|nut/i, 'Somun'], [/rondela|pul|washer/i, 'Rondela'], [/rulman|bearing/i, 'Rulman'],
  [/\bmil\b|şaft|saft|shaft|aks/i, 'Mil'], [/flanş|flans|flange/i, 'Flanş'], [/\bpim\b|pin|dowel/i, 'Pim'], [/kama|key/i, 'Kama'], [/burç|burc|bush/i, 'Burç'],
];
export const FASTENER_KINDS = new Set(['Cıvata', 'Somun', 'Rondela', 'Pim', 'Kama']);
export function recognize(q) {
  const p = q.p || {}, nm = String(q.name || '');
  for (const [re, kind] of NAME_RULES) if (re.test(nm.replace(/^\d+\.\s*/, ''))) return { kind, conf: 'isim', detail: 'Parça adından' };
  const d = +p.d, h = +p.h, di = +p.di;
  if (q.type === 'tube' && d > 0 && di > 0 && h > 0) {
    for (const [code, [bi, bo, bw]] of Object.entries(BEARINGS)) if (Math.abs(di - bi) <= 0.3 && Math.abs(d - bo) <= 0.3 && Math.abs(h - bw) <= 0.3) return { kind: 'Rulman', conf: 'ölçü', detail: code + ' (' + bi + '×' + bo + '×' + bw + ') ölçüleriyle aynı' };
    for (const [m, [wi, wo, wt]] of Object.entries(WASHER)) if (Math.abs(di - wi) <= 0.3 && Math.abs(d - wo) <= 0.5 && Math.abs(h - wt) <= 0.3) return { kind: 'Rondela', conf: 'ölçü', detail: 'M' + m + ' rondela (ISO 7089) ölçüleriyle aynı', m: +m };
    const mm = CLEAR.find(([m]) => Math.abs(di - m) <= 0.2);
    if (mm && Math.abs(h - NUT_H[mm[0]]) <= 0.6) return { kind: 'Somun', conf: 'şekil', detail: 'M' + mm[0] + ' somun boyutlarında halka (altıgen değil) — olası', m: mm[0] };
    if (h / d <= 0.15) return { kind: 'Rondela', conf: 'şekil', detail: 'ince halka — olası' };
    return { kind: 'Boru / burç', conf: 'şekil', detail: 'içi boş silindir' };
  }
  if (q.type === 'cylinder' && d > 0 && h > 0) {
    const mm = CLEAR.find(([m]) => Math.abs(d - m) <= 0.15);
    if (mm && h / d >= 1.5) return { kind: 'Cıvata', conf: 'şekil', detail: 'M' + mm[0] + ' ölçüsünde ince uzun silindir — olası cıvata / saplama (dişsiz çizilmiş)', m: mm[0] };
    if (h / d >= 4 && d >= 10) return { kind: 'Mil', conf: 'şekil', detail: 'uzun silindir (L/D ' + f1(h / d) + ') — olası mil' };
    if (h / d <= 0.3 && d >= 40) return { kind: 'Flanş / disk', conf: 'şekil', detail: 'yassı disk — olası flanş' };
    if (h / d >= 2 && d < 10) return { kind: 'Pim', conf: 'şekil', detail: 'küçük çaplı silindir — olası pim' };
  }
  const T = { frame: 'Konstrüksiyon (kaynaklı iskelet)', sheet: 'Sac parça', sweep: 'Profil / boru', box: 'Gövde / plaka', cylinder: 'Silindirik parça', cone: 'Konik parça', sphere: 'Küre', mesh: 'Birleştirilmiş parça', loft: 'Geçişli parça', sketch: 'Kroki parçası', revolve: 'Dönel parça' };
  return { kind: T[q.type] || 'Parça', conf: 'tür', detail: '' };
}

/* ---------- bağlantılar ---------- */
// delik ekseni boyunca katı parçaların kesildiği aralıklar
function holeHosts(H, solids, M) {
  const step = Math.max(Math.min(H.h / 200, 1), 0.2), out = new Map();
  const ring = (s, r, k) => { const a = norm(Math.abs(H.axis[0]) < 0.9 ? cross(H.axis, [1, 0, 0]) : cross(H.axis, [0, 1, 0])), b = cross(H.axis, a); const ang = k * Math.PI / 2; return add(add(H.base, mul(H.axis, s)), add(mul(a, r * Math.cos(ang)), mul(b, r * Math.sin(ang)))); };
  for (let s = -0.05 * H.h; s <= 1.05 * H.h; s += step) {
    for (const q of solids) {
      const m = M(q), inBox = (pnt) => m.box && pnt[0] >= m.box.min[0] - 1e-6 && pnt[0] <= m.box.max[0] + 1e-6 && pnt[1] >= m.box.min[1] - 1e-6 && pnt[1] <= m.box.max[1] + 1e-6 && pnt[2] >= m.box.min[2] - 1e-6 && pnt[2] <= m.box.max[2] + 1e-6;
      const c0 = add(H.base, mul(H.axis, s));
      if (inBox(c0) && m.contains(c0)) continue;   // eksen dolu: bu parçada delik yok
      const hit = [0, 1, 2, 3].some((k) => { const pnt = ring(s, H.r * 1.08 + 0.3, k); return m.box && pnt[0] >= m.box.min[0] - 1e-6 && pnt[0] <= m.box.max[0] + 1e-6 && pnt[1] >= m.box.min[1] - 1e-6 && pnt[1] <= m.box.max[1] + 1e-6 && pnt[2] >= m.box.min[2] - 1e-6 && pnt[2] <= m.box.max[2] + 1e-6 && m.contains(pnt); });
      if (!hit) continue;
      const o = out.get(q.id) || { q, s0: s, s1: s }; o.s0 = Math.min(o.s0, s); o.s1 = Math.max(o.s1, s); out.set(q.id, o);
    }
  }
  return [...out.values()].map((o) => ({ ...o, t: o.s1 - o.s0 + step })).sort((a, b) => a.s0 - b.s0);
}
export function analyzeAssembly(model, opts = {}) {
  const parts = (model.parts || []).filter((q) => q.tris && q.tris.length >= 9);
  const solids = parts.filter((q) => q.op !== 'sub'), holes = parts.filter((q) => q.op === 'sub' && q.type === 'cylinder' && +q.p.d > 0);
  const mesh = new Map(parts.map((q) => [q.id, new Mesh(q.tris)]));
  const M = (q) => mesh.get(q.id);
  const name = (q) => q.name || '#' + q.id;
  const answers = opts.answers || {};
  const info = new Map(solids.map((q) => [q.id, { ...recognize(q), id: q.id, name: name(q) }]));
  const conns = [], fasteners = [], problems = [], questions = [];
  const pairKey = (a, b) => Math.min(a, b) + '-' + Math.max(a, b);
  const linked = new Set();
  // kaynaklı bağlantılar (Kaynak sekmesindeki onaylı plan)
  for (const w of model.welds || []) if (w.status === 'approved' && w.parts && w.parts.length === 2) { const k = pairKey(...w.parts); if (!linked.has(k)) { linked.add(k); conns.push({ kind: 'kaynak', a: w.parts[0], b: w.parts[1], text: 'Kaynak ' + (w.label || '') }); } }
  // eşleşmeler (Montaj sekmesi)
  for (const [a, b, t] of model.mates || []) { const k = pairKey(a, b); conns.push({ kind: 'eşleşme', a, b, text: 'Eşleşme (' + t + ')' }); }
  // delikler → cıvatalı bağlantı
  for (const hq of holes) {
    const H = holeAxis(hq.p), d = 2 * H.r, hosts = holeHosts(H, solids.filter((q) => !FASTENER_KINDS.has(info.get(q.id).kind)), M);
    if (!hosts.length) continue;
    const std = boltForHole(d);
    // delikte duran cıvata parçası (eş eksenli silindir)
    const inHole = solids.filter((q) => { const r = info.get(q.id); if (r.kind !== 'Cıvata' && r.kind !== 'Pim') return false; const B = holeAxis(q.p); const ang = Math.acos(Math.min(1, Math.abs(dot(B.axis, H.axis)))) * 180 / Math.PI; const off = len(cross(sub(B.base, H.base), H.axis)); return off < H.r && (ang < 2 || off < H.r * 0.5); });
    for (const b of inHole) { const B = holeAxis(b.p), ang = Math.acos(Math.min(1, Math.abs(dot(B.axis, H.axis)))) * 180 / Math.PI; if (ang >= 2) problems.push({ sev: 'warn', title: 'Yanlış yönlendirilmiş parça', text: name(b) + ' delik eksenine göre ' + f1(ang) + '° eğik duruyor; deliğe takılamaz.', parts: [b.id, hq.id] }); }
    const grip = hosts.reduce((s, x) => s + x.t, 0);
    const F = { hole: hq.id, holeName: name(hq), d, hosts: hosts.map((x) => x.q.id), hostNames: hosts.map((x) => name(x.q)), grip, std, present: inHole.map((q) => q.id), axis: H.axis, at: add(H.base, mul(H.axis, hosts[0].s0)) };
    if (hosts.length >= 2) {
      for (let i = 0; i + 1 < hosts.length; i++) { const k = pairKey(hosts[i].q.id, hosts[i + 1].q.id); linked.add(k); conns.push({ kind: 'cıvata', a: hosts[i].q.id, b: hosts[i + 1].q.id, text: name(hq) + (std ? ' · M' + std.m : ' · Ø' + f1(d)) }); }
      if (std) {
        const m = std.m, w = WASHER[m], nutH = NUT_H[m];
        if (std.kind === 'diş (kılavuz)') { F.bolt = { m, len: stdBoltLen(grip - hosts[hosts.length - 1].t + w[2] + 1.5 * m), note: 'son parça dişli: somunsuz' }; F.items = [{ what: 'Cıvata M' + m + '×' + F.bolt.len, n: 1 }, { what: 'Rondela M' + m + ' (ISO 7089)', n: 1 }]; }
        else { const L = grip + 2 * w[2] + nutH + 2 * 1.25; F.bolt = { m, len: stdBoltLen(L) }; F.items = [{ what: 'Cıvata M' + m + '×' + F.bolt.len, n: 1 }, { what: 'Rondela M' + m + ' (ISO 7089)', n: 2 }, { what: 'Somun M' + m + ' (ISO 4032)', n: 1 }]; }
      }
    } else if (std && std.kind === 'diş (kılavuz)') { F.single = true; F.items = []; F.note = 'tek parçada dişli delik: bağlanacak parça belirlenemedi'; }
    else { F.single = true; F.items = []; F.note = 'tek parçayı kesen delik: bağlantı yok ya da karşı parça modelde değil'; }
    F.status = !std ? 'ölçü belirlenemedi' : F.present.length ? 'mevcut' : F.single ? 'bağlantı belirsiz' : 'EKSİK';
    fasteners.push(F);
  }
  // temas eden ama bağlantı türü bilinmeyen çiftler → kullanıcıya sor
  const geo = solids.filter((q) => !FASTENER_KINDS.has(info.get(q.id).kind));
  for (let i = 0; i < geo.length; i++) for (let j = i + 1; j < geo.length; j++) {
    const a = geo[i], b = geo[j], k = pairKey(a.id, b.id);
    if (linked.has(k)) continue;
    const A = M(a), B = M(b), gap = minDistance(A, B, 0.2);
    if (gap.d > 0.05) continue;
    const ans = answers[k];
    if (ans && ans !== 'yok') { conns.push({ kind: ans, a: a.id, b: b.id, text: 'Kullanıcı: ' + ans }); linked.add(k); }
    else if (!ans) questions.push({ key: k, a: a.id, b: b.id, text: name(a) + ' ile ' + name(b) + ' birbirine değiyor ama nasıl bağlandığı modelde yok.', options: ['kaynak', 'cıvata', 'geçme / yapıştırma', 'yok'] });
  }
  // birimler: kaynaklı / kullanıcı "kaynak" dediği gruplar birlikte; cıvatalı parçalar ayrı birim
  const par = new Map(solids.map((q) => [q.id, q.id])), find = (x) => { while (par.get(x) !== x) x = par.get(x); return x; };
  for (const c of conns) if (c.kind === 'kaynak' && par.has(c.a) && par.has(c.b)) par.set(find(c.a), find(c.b));
  const um = new Map();
  for (const q of solids) { const r = find(q.id); if (!um.has(r)) um.set(r, []); um.get(r).push(q); }
  const units = [...um.values()].map((list) => ({ ids: list.map((q) => q.id), list, vol: list.reduce((s, q) => s + M(q).volume(), 0) }));
  // çakışmalar (montaj birimleri arasında)
  for (let i = 0; i < units.length; i++) for (let j = i + 1; j < units.length; j++) for (const a of units[i].list) for (const b of units[j].list) {
    const it = interference(M(a), M(b), holes.map(M));
    if (it.depth > 0.2) problems.push({ sev: 'crit', title: 'Parçalar çakışıyor', text: name(a) + ' ile ' + name(b) + ' ~' + f1(it.span || it.depth) + ' mm iç içe; bu haliyle takılamaz.', parts: [a.id, b.id], box: it.region });
  }
  // montaj sırası: her turda serbest olan en küçük birim sökülür
  for (const u of units) { const bs = u.list.map((q) => M(q).box).filter(Boolean); u.minY = Math.min(...bs.map((b) => b.min[1])); u.area = Math.max(...bs.map((b) => (b.max[0] - b.min[0]) * (b.max[2] - b.min[2]))); u.fastener = u.list.every((q) => FASTENER_KINDS.has(info.get(q.id).kind)); }
  // taban: bağlantı elemanı olmayan, en altta duran (eşitse taban alanı en büyük) birim
  const baseU = units.slice().sort((a, b) => (a.fastener - b.fastener) || (Math.round(a.minY) - Math.round(b.minY)) || (b.area - a.area))[0];
  const left = units.slice(), removed = [];
  const meshes = (u) => u.list.map(M);
  const DIR_ORDER = [2, 0, 1, 4, 5, 3];   // önce yukarı, en son aşağı
  // delikteki cıvata/pim çıkmadan geçtiği parçalar sökülemez (ince parçalar ızgarada kaçabilir)
  const pinned = (u) => fasteners.some((F) => F.present.length && F.hosts.some((id) => u.ids.includes(id)) && left.some((o) => o !== u && F.present.some((id) => o.ids.includes(id))));
  const freeDir = (u) => { if (pinned(u)) return -1; for (const ai of DIR_ORDER) { if (left.every((o) => o === u || !meshes(u).some((P) => meshes(o).some((Q) => blocks(P, Q, ai))))) return ai; } return -1; };
  while (left.length > 1) {
    // en üstteki serbest birim önce sökülür (eşitse küçük olan) → takılırken alttan üste
    const cand = left.filter((u) => u !== baseU).map((u) => ({ u, ai: freeDir(u) })).filter((x) => x.ai >= 0).sort((a, b) => (Math.round(b.u.minY) - Math.round(a.u.minY)) || (a.u.vol - b.u.vol));
    if (!cand.length) break;
    const { u, ai } = cand[0];
    removed.push({ u, ai });
    left.splice(left.indexOf(u), 1);
  }
  const stuck = left.length > 1 ? left : [];
  if (stuck.length) problems.push({ sev: 'crit', title: 'Fiziksel olarak mümkün olmayan montaj', text: stuck.map((u) => u.list.map(name).join('+')).join(', ') + ' altı ana yönün hiçbirinde birbirine çarpmadan takılamıyor. Döndürerek takma denenmedi; parçalardan biri sonradan kaynaklanıyor ya da bölünebiliyorsa bilgi ver.', parts: stuck.flatMap((u) => u.ids) });
  // montaj adımları: taban (ya da takılı kalan grup) önce, sonra sökme sırasının tersi
  const steps = [];
  const baseUnits = (stuck.length ? stuck : left).slice().sort((a, b) => (b === baseU) - (a === baseU));
  baseUnits.forEach((u, i) => steps.push({ unit: u, ai: -1, base: i === 0 }));
  for (const r of removed.slice().reverse()) steps.push({ unit: r.u, ai: r.ai });
  // bağlantı elemanları: bütün tutturduğu parçalar yerleştikten sonraki adıma eklenir
  const placedAt = new Map();
  steps.forEach((s, i) => s.unit.ids.forEach((id) => placedAt.set(id, i)));
  for (const F of fasteners) if (F.items && F.items.length) { const k = Math.max(...F.hosts.map((id) => placedAt.get(id) ?? 0)); (steps[k].fasten = steps[k].fasten || []).push(F); }
  const out = steps.map((s, i) => {
    const touching = conns.filter((c) => s.unit.ids.includes(c.a) || s.unit.ids.includes(c.b)).map((c) => (s.unit.ids.includes(c.a) ? c.b : c.a)).filter((id) => (placedAt.get(id) ?? 99) < i);
    const onto = [...new Set(touching)].map((id) => info.get(id) && info.get(id).name).filter(Boolean);
    const insert = s.ai >= 0 ? AXIS_NAME[s.ai ^ 1] : null;
    return {
      n: i + 1, ids: s.unit.ids, names: s.unit.list.map(name), base: !!s.base, ai: s.ai, dir: s.ai >= 0 ? AX[s.ai] : [0, 0, 0], insert, onto, fasten: s.fasten || [],
      text: s.base ? 'Taban: ' + s.unit.list.map(name).join(' + ') + ' montaj tezgâhına yerleştirilir' + (s.unit.list.length > 1 ? ' (kaynaklı grup)' : '') + '.' :
        s.unit.list.map(name).join(' + ') + ' ' + insert + ' yönünde takılır' + (onto.length ? '; oturduğu / bağlandığı parça: ' + onto.join(', ') : '') + '.',
    };
  });
  // erişim: bağlantı elemanı alanı (cıvata başı / somun) — bağlantı noktası sonradan takılan bir parçanın içinde kalıyorsa
  for (const F of fasteners) {
    if (!F.items || !F.items.length || !F.bolt) continue;
    const k = Math.max(...F.hosts.map((id) => placedAt.get(id) ?? 0));
    const H = { base: F.at, axis: F.axis }, m = F.bolt.m;
    for (const [s, sg, what] of [[-0.6 * m, -1, 'cıvata başı'], [F.grip + 0.6 * m, 1, 'somun']]) {
      const pnt = add(H.base, mul(H.axis, s));
      const blk = solids.find((q) => !F.hosts.includes(q.id) && !F.present.includes(q.id) && M(q).contains(pnt));
      if (blk) { const later = (placedAt.get(blk.id) ?? 0) > k; problems.push({ sev: 'warn', title: 'Erişilemeyen montaj noktası', text: F.holeName + ' (M' + m + ') ' + what + ' tarafı ' + name(blk) + ' ile kapalı' + (later ? '; ' + name(blk) + ' sonra takıldığı için önce bu cıvata sıkılmalı (sıra buna göre).' : '; anahtar / lokma giremez.'), parts: [F.hole, blk.id] }); }
    }
  }
  if (model.mateErr > 1e-2) problems.push({ sev: 'warn', title: 'Yanlış yönlendirilmiş / yerleşmemiş parçalar', text: 'Montaj sekmesindeki eşleşmeler aynı anda sağlanamıyor (sapma ~' + f1(model.mateErr) + '); bazı parçalar istenen konumda / yönde değil.', parts: [] });
  // bağlantı elemanı listesi (BOM)
  const bom = new Map();
  for (const F of fasteners) for (const it of F.items || []) { const o = bom.get(it.what) || { what: it.what, need: 0, present: 0 }; o.need += it.n; if (F.present.length && /Cıvata/.test(it.what)) o.present += Math.min(F.present.length, it.n); bom.set(it.what, o); }
  const recognizedFasteners = solids.filter((q) => FASTENER_KINDS.has(info.get(q.id).kind) || info.get(q.id).kind === 'Rulman').map((q) => info.get(q.id));
  return {
    parts: solids.map((q) => ({ ...info.get(q.id), step: (placedAt.get(q.id) ?? -1) + 1, vol: M(q).volume(), box: M(q).box })),
    conns, fasteners, bom: [...bom.values()], recognizedFasteners, steps: out, problems, questions, stuck: stuck.map((u) => u.ids),
    holes: holes.length, units: units.length,
  };
}

/* ---------- patlatma ---------- */
// her adım kendi sökme yönünde, montajdaki sırasına göre uzaklaşır. f: 0 (toplu) … 1 (tam patlatılmış)
export function explodeOffsets(res, size, f = 1) {
  const gap = Math.max(size * 0.12, 20), off = new Map();
  const counter = new Map();
  for (const s of res.steps) {
    if (s.base || s.ai < 0) { for (const id of s.ids) off.set(id, [0, 0, 0]); continue; }
    const c = (counter.get(s.ai) || 0) + 1; counter.set(s.ai, c);
    const d = mul(s.dir, gap * c * f);
    for (const id of s.ids) off.set(id, d);
  }
  // bağlantı elemanları (ayrı parça olarak çizilmişse) kendi adımlarındaki yönle
  return off;
}
// animasyon: k. adımın parçası patlatılmış konumdan yerine (t: 0 … 1); öncekiler yerinde, sonrakiler patlatılmış (hayalet)
export function animState(res, offsets, k, t) {
  const st = new Map();
  res.steps.forEach((s, i) => {
    for (const id of s.ids) {
      const o = offsets.get(id) || [0, 0, 0];
      if (i < k) st.set(id, { off: [0, 0, 0], mode: 'placed' });
      else if (i === k) { const e = 1 - (1 - t) * (1 - t) * (1 - t); st.set(id, { off: mul(o, 1 - e), mode: 'active' }); }
      else st.set(id, { off: o, mode: 'ghost' });
    }
  });
  return st;
}
