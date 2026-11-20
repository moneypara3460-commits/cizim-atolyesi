// Kroki serbest eğrisi (spline). Saf hesap modülü; ölçüler mm.
//
// Çokgen şeklin köşeleri kontrol noktasıdır; "eğri noktası" işaretli köşede çizgi o noktadan YUMUŞAK geçer
// (iki yanındaki eğri parçaları aynı teğetle birleşir), işaretsiz köşe sivri kalır. Bir kenarın iki ucundan
// biri eğri noktasıysa o kenar kübik Hermite eğrisi olur; ikisi de sivri köşeyse kenar düz kalır.
//
// Teğetler (Catmull-Rom yöntemi): eğri noktasında teğet = (p[k+1] − p[k−1]) / 2; büyüklüğü o parçanın kiriş boyunu
// geçmeyecek şekilde sınırlanır (komşu kenarlar çok farklı uzunlukta olduğunda ilmek yapmasın). Sivri köşede teğet
// kenarın kendisi (eğri o uçta kenar doğrultusunda başlar).
// Kaynaklar: Catmull & Rom (1974) "A class of local interpolating splines"; kübik Hermite taban fonksiyonları
// h00 = 2t³ − 3t² + 1, h10 = t³ − 2t² + t, h01 = −2t³ + 3t², h11 = t³ − t² (Foley, van Dam vd., Computer Graphics).

const hyp = (x, y) => Math.hypot(x, y);
const unit = (x, y) => { const l = hyp(x, y); return l > 1e-12 ? [x / l, y / l] : [0, 0]; };

// k köşesindeki teğet (L: bu parçanın kiriş boyu)
function tangent(pts, closed, smooth, k, side, L) {
  const n = pts.length, p = pts[k];
  const prev = closed || k > 0 ? pts[(k - 1 + n) % n] : null, next = closed || k < n - 1 ? pts[(k + 1) % n] : null;
  if (smooth.has(k) && prev && next) {
    const tx = (next[0] - prev[0]) / 2, ty = (next[1] - prev[1]) / 2, m = hyp(tx, ty);
    const s = m > L ? L / m : 1;
    return [tx * s, ty * s];
  }
  // sivri köşe ya da açık ucun eğri noktası: parçanın kendi kenarı yönünde, kiriş boyunda
  const q = side > 0 ? next : prev;
  if (!q) return [0, 0];
  const d = side > 0 ? unit(q[0] - p[0], q[1] - p[1]) : unit(p[0] - q[0], p[1] - q[1]);
  return [d[0] * L, d[1] * L];
}

// Bir kenar eğri mi? (uçlarından biri eğri noktası)
export function egriKenar(sm, n, e, closed = true) {
  if (!sm || !sm.length) return false;
  const s = sm instanceof Set ? sm : new Set(sm);
  return s.has(e) || s.has(closed ? (e + 1) % n : e + 1);
}

// Kenar başına örnek sayısı: kiriş boyuna ve dönüş açısına göre (en az 4, en çok 48 parça)
function segCount(L, t0, t1, step) {
  const turn = Math.acos(Math.max(-1, Math.min(1, t0[0] * t1[0] + t0[1] * t1[1])));
  return Math.max(4, Math.min(48, Math.ceil(L / step) + Math.ceil(turn / (Math.PI / 24))));
}

// Kontrol noktalarından (pts) çizilecek noktalar. sm: eğri noktası köşe numaraları.
// Dönüş: { pts: genişletilmiş noktalar, idx: her kontrol noktasının çıktıdaki sırası }
export function egriNoktalari(pts, closed, sm, step = 2) {
  const n = pts.length;
  const smooth = new Set((sm || []).filter((i) => Number.isInteger(i) && i >= 0 && i < n));
  if (!smooth.size || n < 2) return { pts: pts.map((q) => [q[0], q[1]]), idx: pts.map((_, i) => i) };
  const out = [], idx = [];
  const m = closed ? n : n - 1;
  for (let e = 0; e < m; e++) {
    const a = pts[e], b = pts[(e + 1) % n];
    idx.push(out.length); out.push([a[0], a[1]]);
    if (!smooth.has(e) && !smooth.has((e + 1) % n)) continue;            // düz kenar
    const L = hyp(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-9) continue;
    const T0 = tangent(pts, closed, smooth, e, +1, L), T1 = tangent(pts, closed, smooth, (e + 1) % n, -1, L);
    const k = segCount(L, unit(T0[0], T0[1]), unit(T1[0], T1[1]), step);
    for (let j = 1; j < k; j++) {
      const t = j / k, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      out.push([h00 * a[0] + h10 * T0[0] + h01 * b[0] + h11 * T1[0], h00 * a[1] + h10 * T0[1] + h01 * b[1] + h11 * T1[1]]);
    }
  }
  if (!closed) { idx.push(out.length); out.push([pts[n - 1][0], pts[n - 1][1]]); }
  return { pts: out, idx };
}

// Eğri noktası listesini köşe silme / kırpma sonrası temizle (sıralı, tekrarsız, aralıkta)
export function egriTemizle(sm, n) {
  return [...new Set((sm || []).filter((i) => Number.isInteger(i) && i >= 0 && i < n))].sort((a, b) => a - b);
}
