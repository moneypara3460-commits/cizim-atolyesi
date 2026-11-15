// Ayakkabı Modelhanesi — parça eşleştirme ve kontrol. Saf modül.
// Eşleşme: iki parçanın birer kenarı birbirine dikilir / bindirilir.
//   match = { id, name, a:{ piece, edge }, b:{ piece, edge }, reverse, kind:'dikis'|'binme', tol }
//   reverse: true ise B kenarı ters yönde eşlenir (çoğu dikişte kenarlar karşılıklı ters yürür).
// Kontroller: kenar uzunluk farkı, çentik sayısı ve konumları, binme noktası konumları (etiketle ya da sırayla eşlenir).
import * as G from './geom.js?v=20261115g';
import { uid } from './geom.js?v=20261115g';
import { edgeProp } from './model.js?v=20261115g';

export const MATCH_KINDS = { dikis: 'Dikiş (yan yana)', binme: 'Binme (üst üste)' };
export function makeMatch(o = {}) { return { id: o.id || uid('mt'), name: String(o.name || '').slice(0, 60), a: o.a, b: o.b, reverse: o.reverse ?? true, kind: MATCH_KINDS[o.kind] ? o.kind : 'dikis', tol: Number.isFinite(o.tol) ? o.tol : 0.5 }; }

function edgeOf(project, ref) {
  const pc = project.pieces.find((q) => q.id === ref?.piece); if (!pc) return null;
  const e = G.edges(pc.outline).find((q) => q.id === ref.edge); if (!e) return null;
  return { pc, e, len: G.edgeLength(e) };
}
export function edgeLabel(project, ref) {
  const x = edgeOf(project, ref); if (!x) return '—';
  const idx = G.edges(x.pc.outline).findIndex((q) => q.id === ref.edge), nm = edgeProp(x.pc, ref.edge).name;
  return `#${x.pc.no} ${x.pc.name} · ${nm || 'kenar ' + (idx + 1)}`;
}
// kenardaki işaret konumları (mm, kenar başından)
const marksOn = (pc, edgeId, kind) => pc.marks.filter((m) => m.kind === kind && m.edge === edgeId).map((m) => ({ id: m.id, at: m.at || 0, label: m.label || '' })).sort((p, q) => p.at - q.at);

function pairMarks(A, B, LA, LB, rev, tol, kindName, out) {
  const bPos = (m) => (rev ? LB - m.at : m.at);
  const Bs = B.map((m) => ({ ...m, pos: bPos(m) })).sort((p, q) => p.pos - q.pos);
  const labeled = A.length && A.every((m) => m.label) && Bs.every((m) => m.label);
  const pairs = [];
  if (labeled) {
    for (const m of A) { const o = Bs.find((q) => q.label === m.label); if (o) pairs.push([m, o]); else out.push({ level: 'hata', msg: `${kindName} "${m.label}" karşı kenarda yok` }); }
    for (const o of Bs) if (!A.some((m) => m.label === o.label)) out.push({ level: 'hata', msg: `${kindName} "${o.label}" yalnız ikinci kenarda var` });
  } else {
    if (A.length !== Bs.length) out.push({ level: 'hata', msg: `${kindName} sayısı farklı: ${A.length} ↔ ${Bs.length}` });
    for (let i = 0; i < Math.min(A.length, Bs.length); i++) pairs.push([A[i], Bs[i]]);
  }
  // konum: uzunluklar farklıysa oransal konum karşılaştırılır (dikişte bolluk dağıtımı), fark mm olarak raporlanır
  const res = [];
  for (const [m, o] of pairs) {
    const da = m.at, db = o.pos * (LB > 0 ? LA / LB : 1), diff = da - db;
    res.push({ a: m.id, b: o.id, label: m.label || o.label, atA: da, atB: o.pos, diff });
    if (Math.abs(diff) > tol) out.push({ level: Math.abs(diff) > 3 * tol ? 'hata' : 'uyarı', msg: `${kindName}${m.label ? ' "' + m.label + '"' : ''} konum farkı ${diff.toFixed(2).replace('.', ',')} mm` });
  }
  return res;
}
export function checkMatch(project, mt) {
  const out = [], A = edgeOf(project, mt.a), B = edgeOf(project, mt.b);
  if (!A || !B) return { ok: false, issues: [{ level: 'hata', msg: 'Eşleşmedeki parça ya da kenar silinmiş' }] };
  if (A.pc.id === B.pc.id && mt.a.edge === mt.b.edge) return { ok: false, issues: [{ level: 'hata', msg: 'Bir kenar kendisiyle eşlenemez' }] };
  const diff = A.len - B.len, tol = mt.tol ?? 0.5;
  if (Math.abs(diff) > tol) out.push({ level: Math.abs(diff) > 2 + tol ? 'hata' : 'uyarı', msg: `Kenar uzunluk farkı ${diff.toFixed(2).replace('.', ',')} mm (A ${A.len.toFixed(2).replace('.', ',')} · B ${B.len.toFixed(2).replace('.', ',')})` });
  const notches = pairMarks(marksOn(A.pc, mt.a.edge, 'centik'), marksOn(B.pc, mt.b.edge, 'centik'), A.len, B.len, mt.reverse, tol, 'Çentik', out);
  const laps = pairMarks(marksOn(A.pc, mt.a.edge, 'binme'), marksOn(B.pc, mt.b.edge, 'binme'), A.len, B.len, mt.reverse, tol, 'Binme noktası', out);
  // pay türü uyumu (karıştırma uyarısı)
  const ka = edgeProp(A.pc, mt.a.edge).kind, kb = edgeProp(B.pc, mt.b.edge).kind;
  if (mt.kind === 'binme' && ka !== 'binme' && kb !== 'binme') out.push({ level: 'uyarı', msg: 'Binme eşleşmesi ama iki kenarda da binme payı tanımlı değil' });
  if (mt.kind === 'dikis' && (ka === 'montaj' || kb === 'montaj')) out.push({ level: 'uyarı', msg: 'Montaj (kalıba çekme) kenarı dikiş eşleşmesinde' });
  return { ok: !out.some((x) => x.level === 'hata'), lenA: A.len, lenB: B.len, diff, notches, laps, issues: out };
}
export function checkAll(project) { return project.matches.map((m) => ({ match: m, ...checkMatch(project, m) })); }
// İki kenarın uzunlukları farklıysa: B kenarındaki işaretleri A'daki karşılıklarına göre (oransal) taşı — yalnız öneri, kullanıcı onaylar
export function alignMarksFromA(project, mt) {
  const A = edgeOf(project, mt.a), B = edgeOf(project, mt.b); if (!A || !B) return 0;
  const r = checkMatch(project, mt); let n = 0;
  for (const p of [...(r.notches || []), ...(r.laps || [])]) {
    const m = B.pc.marks.find((q) => q.id === p.b); if (!m) continue;
    const pos = p.atA * (B.len / A.len); m.at = mt.reverse ? B.len - pos : pos; n++;
  }
  return n;
}
