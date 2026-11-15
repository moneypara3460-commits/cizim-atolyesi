// Yapay zekânın modelden çıkardığı parçaları (project.modelRef.ai) kalıbın üstüne yerleştirip gerçek saya parçalarına çevirir.
// Girdi koordinatları: x topuk arkasından burna mm, y taban çizgisinden yukarı mm (dış yan görünüş).
// Kenar türleri kendiliğinden bulunur: tabana inen kenar = kalıba çekme (montaj), orta çizgi = simetri ekseni,
// üstteki parçanın altında kalan kenar = binme payı, alttaki parçanın üstüne binen kenar = katlama + dikiş, açık kenar = kenar + dikiş.
// Ayrıca isteğe bağlı: astar (ön + arka), kontrfort (topuk sertliği), burun sertliği. İç yan fotoğrafı varsa yan parçaların iç yan eşi.
import * as G from './geom.js?v=20261115g';
import { nextPieceNo } from './model.js?v=20261115g';
import { measure } from './build.js?v=20261115g';
import { lastFrame, guessOrientation, catmull, range, buildPiece, colRange } from './auto.js?v=20261115g';

const TOL = 3.5;               // tabana "değiyor" sayılma mesafesi (mm)
const TOLC = 6;               // orta çizgiye değiyor sayılma mesafesi (yapay zekâ yüksekliği 10 mm aralıklı tablodan okur)
const st = (on, rows = 1) => ({ on, dist: 1.5, rows, gap: 2.5 });
const mid = () => 'mk' + Math.random().toString(36).slice(2, 8);

// noktanın çokgen içinde olup olmadığı (ışın)
export function inside(poly, [x, y]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const area = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };

// mm (x, yükseklik) → kalıp çerçevesi (kanonik: taban altta, y aşağı büyür)
export function mapper(F, ref = null) {
  const { L, top, bot } = F;
  const h = (x) => Math.max(1, bot(x) - top(x));
  if (!ref) return ([x, y]) => { const X = Math.max(0, Math.min(L, x)); return [X, bot(X) - Math.max(0, y)]; };
  // başka bir kalıp görünüşünden (dış yan) gelen ölçüyü bu görünüşe orantıla (iç yan)
  return ([x, y]) => { const X = Math.max(0, Math.min(L, x * L / ref.L)); const xr = Math.max(0, Math.min(ref.L, x)); const v = Math.max(0, y) / Math.max(1, ref.bot(xr) - ref.top(xr)); return [X, bot(X) - v * h(X)]; };
}

// kenarları sınıflandır: her köşe noktası arası parçayı türüne göre grupla
function classify(P, i, all, F) {
  const { L, top, bot, left } = F;
  const sgn = area(P.pts) > 0 ? 1 : -1;   // ekran koordinatında (y aşağı) dış normal yönü için
  const segKind = (a, b) => {
    const near = (q, f) => Math.abs(q[1] - f(q[0])) < TOL;
    if (near(a, bot) && near(b, bot)) return 'montaj';
    if (a[0] > 0.25 * L && b[0] > 0.25 * L && a[1] - top(a[0]) < TOLC && b[1] - top(b[0]) < TOLC) return 'yok';
    if (a[0] < 0.08 * L && b[0] < 0.08 * L && Math.abs(a[0] - left(a[1])) < TOL + 2 && Math.abs(b[0] - left(b[1])) < TOL + 2) return 'arka';
    const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const o = [m[0] + (sgn * dy / l) * 2, m[1] - (sgn * dx / l) * 2];   // 2 mm dışarı
    if (all.some((q, j) => j !== i && q.kind === 'ust' && q.layer > P.layer && inside(q.pts, o))) return 'binme';
    if (all.some((q, j) => j !== i && q.kind === 'ust' && q.layer < P.layer && inside(q.pts, o))) return 'katlama';
    return 'kenar';
  };
  const n = P.pts.length, kinds = [];
  for (let k = 0; k < n; k++) kinds.push(segKind(P.pts[k], P.pts[(k + 1) % n]));
  // aynı türdeki ardışık parçaları birleştir; başlangıcı bir tür değişimine kaydır
  let s0 = kinds.findIndex((k, j) => k !== kinds[(j - 1 + n) % n]);
  if (s0 < 0) s0 = 0;
  const groups = [];
  for (let t = 0; t < n; t++) {
    const k = (s0 + t) % n;
    if (!groups.length || groups[groups.length - 1].kind !== kinds[k]) groups.push({ kind: kinds[k], idx: [k] });
    else groups[groups.length - 1].idx.push(k);
  }
  // tek türlü kapalı parça (ör. üstte duran etiket): iki kenara böl
  if (groups.length === 1) { const k = groups[0].idx, h = Math.max(1, k.length >> 1); groups.splice(0, 1, { kind: groups[0].kind, idx: k.slice(0, h) }, { kind: groups[0].kind, idx: k.slice(h) }); }
  return groups.map((g) => ({ kind: g.kind, pts: g.idx.map((k) => P.pts[k]).concat([P.pts[(g.idx[g.idx.length - 1] + 1) % n]]) }));
}
const NAMES = { montaj: 'Kalıba çekme', yok: 'Orta çizgi (simetri ekseni)', arka: 'Arka dikiş', binme: 'Üstteki parçanın altı', katlama: 'Alttaki parçaya biner', kenar: 'Açık kenar' };
// kenar noktalarını düzelt: tabana / orta çizgiye otursun, diğerleri yumuşak eğri
function shape(e, F, smooth = true) {
  const a = e.pts[0], b = e.pts[e.pts.length - 1];
  if (e.kind === 'montaj') return range(a[0], b[0], 2).map((x) => [x, F.bot(x)]);
  if (e.kind === 'yok') return range(a[0], b[0], 2).map((x) => [x, F.top(x)]);
  return smooth && e.pts.length > 2 ? catmull(e.pts, 8) : e.pts;
}
const kindOf = (k) => (k === 'arka' ? 'dikis' : k);

function makeOne(P, i, all, F, base, toV, suffix = '', smooth = true, corner = undefined) {
  const groups = classify(P, i, all, F);
  const edges = groups.map((g) => ({
    pts: shape(g, F, smooth), kind: kindOf(g.kind), name: NAMES[g.kind], corner,
    stitch: g.kind === 'katlama' ? st(true, 2) : g.kind === 'kenar' && P.kind === 'ust' ? st(true) : undefined,
  }));
  const half = groups.some((g) => g.kind === 'yok');
  const r = buildPiece({ ...base, name: P.name + suffix, code: 'YZ-' + String(i + 1).padStart(2, '0') + (suffix ? 'i' : ''), kind: P.kind === 'takviye' ? 'Takviye' : 'Diğer',
    qty: suffix ? 1 : base.qty, notes: `Modelden yapay zekâyla çıkarıldı (kat ${P.layer}).${half ? ' Üst kenar orta çizgidir: parça bu çizgiden simetrik açılır.' : ''}${P.note ? ' ' + P.note : ''}` }, edges, toV);
  for (const q of P.holes || []) r.pc.marks.push({ id: mid(), kind: 'delik', p: toV(q).map((v) => +v.toFixed(2)), d: P.holeD || 5, label: '' });
  // yumuşatma keskin köşede düğüm atarsa (kesim çizgisi bozulur) düz çizgilerle yeniden kur
  if (smooth || !corner) { const m = measure(r.pc); if (!m || !(m.cutArea >= m.netArea)) return smooth ? makeOne(P, i, all, F, base, toV, suffix, false) : makeOne(P, i, all, F, base, toV, suffix, false, 'bevel'); }
  return r.pc;
}

// tüm üst parçaların kapladığı alanın üst sınırı (astar ve sertlikler için)
function coverTop(ps, F) {
  const xs = range(0.5, F.L - 0.5, 2), out = [];
  for (const x of xs) {
    let y = Infinity;
    for (const p of ps) { const r = colRange(p.pts, x); if (r) y = Math.min(y, r[0]); }
    out.push([x, Number.isFinite(y) ? Math.max(F.top(x), y) : F.bot(x)]);
  }
  return out;
}

/* ---------- ana işlem ---------- */
// Dönen: { pieces, frame } — projeye eklemez.
export function generateAi(project, ai, { material = null, flipX, flipY } = {}) {
  const view = project.last?.views?.yan;
  if (!view) throw new Error('Önce kalıbın dış yan görünüşü fotoğrafını ekle.');
  if (!ai?.pieces?.length) throw new Error('Yapay zekâ parça bulamadı.');
  const or = typeof flipX === 'boolean' && typeof flipY === 'boolean' ? { flipX, flipY } : guessOrientation(view);
  const F = lastFrame(view, or.flipX, or.flipY), map = mapper(F);
  // yön: ekran koordinatında saat yönü (otomatik parçalarla aynı; paylar dışa açılır)
  const cw = (pts) => (area(pts) < 0 ? pts.slice().reverse() : pts);
  const all = ai.pieces.map((p) => ({ ...p, pts: cw(p.poly.map(map)), holes: (p.holes || []).map(map) })).filter((p) => Math.abs(area(p.pts)) > 20);
  const pieces = [], base = { side: 'cift', qty: 2, material };
  let no = nextPieceNo(project);
  const push = (pc) => { pc.no = no++; pieces.push(pc); };
  all.forEach((P, i) => push(makeOne(P, i, all, F, base, F.toV)));

  // iç yan: tabana inen ve orta çizgiye değmeyen parçaların (yan saya gibi) iç yan eşi
  const iv = project.last?.views?.ic;
  if (iv) {
    const o2 = guessOrientation(iv), F2 = lastFrame(iv, o2.flipX, o2.flipY), map2 = mapper(F2, F);
    const all2 = ai.pieces.map((p) => ({ ...p, pts: cw(p.poly.map(map2)), holes: (p.holes || []).map(map2) })).filter((p) => Math.abs(area(p.pts)) > 20);
    all2.forEach((P, i) => {
      const g = classify(all[i] || P, i, all, F);
      if (!g.some((e) => e.kind === 'montaj') || g.some((e) => e.kind === 'yok')) return;
      const pc = makeOne(P, i, all2, F2, base, F2.toV, ' (iç yan)');
      pieces[i].name += ' (dış yan)'; pieces[i].qty = 1;
      push(pc);
    });
  }

  const ust = all.filter((p) => p.kind === 'ust');
  if (ust.length && ai.lining !== false) {
    // ASTAR: kaplanan alanın üst sınırından 2 mm aşağı; ön ve arka astar, ön astar arka astarın üstüne 10 mm biner
    const ct = coverTop(ust, F).map(([x, y]) => [x, Math.min(F.bot(x) - 8, y + (y - F.top(x) < TOL ? 0 : 2))]);
    const xs = 0.58 * F.L, ov = 10;
    const topAt = (a, b) => ct.filter(([x]) => x >= a && x <= b);
    const frontTop = topAt(xs - ov, F.L - 0.6), backTop = topAt(0.5, xs);
    const nb = (x) => [x, F.bot(x)];
    const center = (pts) => pts.length > 1 && pts.every(([x, y]) => y - F.top(x) < TOL);
    const fr = buildPiece({ ...base, no: 0, name: 'Ön astar', code: 'AS-01', kind: 'Astar', notes: 'Kendiliğinden: üst parçaların kapladığı alandan. Arka astarın üstüne 10 mm biner.' }, [
      { pts: frontTop, kind: center(frontTop.slice(Math.floor(frontTop.length * 0.4))) ? 'yok' : 'kenar', name: 'Üst kenar / orta çizgi' },
      { pts: range(F.L - 0.6, xs - ov, 2).map((x) => nb(x)), kind: 'montaj', name: 'Kalıba çekme' },
      { pts: [nb(xs - ov), frontTop[0]], kind: 'katlama', name: 'Arka astara biner', stitch: st(true) },
    ], F.toV);
    push(fr.pc);
    const bk = buildPiece({ ...base, no: 0, name: 'Arka astar', code: 'AS-02', kind: 'Astar', notes: 'Kendiliğinden: topuk ve yanları kaplar.' }, [
      { pts: backTop, kind: 'kenar', name: 'Üst ağız' },
      { pts: [backTop[backTop.length - 1], nb(xs)], kind: 'binme', name: 'Ön astarın altı' },
      { pts: range(xs, 0.6, 2).map((x) => nb(x)), kind: 'montaj', name: 'Kalıba çekme' },
      { pts: [nb(0.6), backTop[0]], kind: 'dikis', name: 'Arka dikiş' },
    ], F.toV);
    push(bk.pc);
  }
  if (ust.length && ai.stiff !== false) {
    const ct = coverTop(ust, F);
    // KONTRFORT: topukta, üst ağızdan 8 mm aşağıdan başlayıp kalıbın %30'unda tabana iner
    const xk = 0.3 * F.L, back = ct.filter(([x]) => x < 0.06 * F.L).map(([, y]) => y);
    const y0 = Math.min(Math.min(...back, F.bot(0.05 * F.L) - 40) + 8, F.bot(0.05 * F.L) - 25);
    const hk = F.bot(xk * 0.5) - y0;
    const curve = catmull([[F.left(y0) + 0.5, y0], [0.12 * F.L, y0 + 0.08 * hk], [0.22 * F.L, y0 + 0.45 * hk], [xk, F.bot(xk)]], 10);
    const kf = buildPiece({ ...base, no: 0, name: 'Kontrfort (topuk sertliği)', code: 'SR-01', kind: 'Takviye', notes: 'Kendiliğinden. Kenarları inceltilir (tıraşlanır); dikiş yok.' }, [
      { pts: curve, kind: 'kenar', name: 'Tıraşlı kenar' },
      { pts: range(xk, 0.6, 2).map((x) => [x, F.bot(x)]), kind: 'montaj', name: 'Kalıba çekme' },
      { pts: [[0.6, F.bot(0.6)], [F.left(y0) + 0.5, y0]], kind: 'yok', name: 'Arka (dikişsiz, ortadan katlanır)' },
    ], F.toV);
    push(kf.pc);
    // BURUN SERTLİĞİ: burun ucundan %18 geriye, orta çizgiden tabana
    const xb = 0.82 * F.L, xb2 = xb + 0.03 * F.L;
    const bc = catmull([[xb, F.top(xb)], [xb + 0.01 * F.L, (F.top(xb) + F.bot(xb2)) / 2], [xb2, F.bot(xb2)]], 10);
    const bs = buildPiece({ ...base, no: 0, name: 'Burun sertliği', code: 'SR-02', kind: 'Takviye', notes: 'Kendiliğinden. Üst kenar orta çizgidir; kenarlar inceltilir.' }, [
      { pts: range(xb, F.L - 0.6, 2).map((x) => [x, F.top(x)]), kind: 'yok', name: 'Orta çizgi (simetri ekseni)' },
      { pts: range(F.L - 0.6, xb2, 2).map((x) => [x, F.bot(x)]), kind: 'montaj', name: 'Kalıba çekme' },
      { pts: bc.slice().reverse(), kind: 'kenar', name: 'Tıraşlı kenar' },
    ], F.toV);
    push(bs.pc);
  }
  addNotches(pieces);
  return { pieces, frame: { flipX: !!or.flipX, flipY: !!or.flipY, L: F.L } };
}

// Sunucuya gönderilecek kalıp bilgisi: boy ve her 10 mm'de üst çizginin tabandan yüksekliği
export function lastInfo(view, or = guessOrientation(view)) {
  const F = lastFrame(view, or.flipX, or.flipY);
  const top = range(0, F.L, Math.max(10, F.L / 26)).map((x) => [+x.toFixed(0), +(F.bot(x) - F.top(x)).toFixed(0)]);
  return { L: +F.L.toFixed(1), top };
}

// Parçalar arası hizalama işaretleri: üstteki parçanın alttakine binen kenarına (katlama) çentik konur;
// alttaki parçada aynı yer kenardaysa çentik, parçanın içindeyse binme noktası olur. Aynı harf iki parçada da yazar.
export function addNotches(pieces) {
  let k = 0;
  const letter = () => { const a = 'ABCDEFGHIJKLMNOPRSTUVYZ'; const s = a[k % a.length] + (k >= a.length ? Math.floor(k / a.length) + 1 : ''); k++; return s; };
  for (const Q of pieces) {
    for (const e of G.edges(Q.outline)) {
      if (Q.edges?.[e.id]?.kind !== 'katlama') continue;
      const L = G.edgeLength(e); if (L < 15) continue;
      for (const f of L < 60 ? [0.5] : [1 / 3, 2 / 3]) {
        const at = +(L * f).toFixed(2), p = G.pointOnEdge(e, at).p;
        let best = null;
        for (const P of pieces) {
          if (P === Q || P.kind === 'Astar' || P.kind === 'Takviye') continue;
          const loc = G.locateOnEdges(P.outline, p);
          if (loc && loc.d < 3 && P.edges?.[loc.edge]?.kind !== 'montaj' && (!best || loc.d < best.loc.d)) best = { P, loc, edge: true };
          else if (!best && G.insidePoly(P.outline.nodes.map((n) => n.p), p)) best = { P, edge: false };
        }
        if (!best) continue;
        const lb = letter();
        Q.marks.push({ id: mid(), kind: 'centik', edge: e.id, at, label: lb, depth: 3 });
        if (best.edge) best.P.marks.push({ id: mid(), kind: 'centik', edge: best.loc.edge, at: +best.loc.at.toFixed(2), label: lb, depth: 3 });
        else best.P.marks.push({ id: mid(), kind: 'binme', p: p.map((v) => +v.toFixed(2)), d: 1.2, label: lb });
      }
    }
  }
  return pieces;
}
