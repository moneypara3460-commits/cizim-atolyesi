// 4 / 5 eksen G-kodu son işlemcileri (post-processor). cam5.js'in CL dizisini (simülasyonla AYNI veri) kullanır.
// Her post'un yetenekleri açıkça tanımlıdır; desteklenmeyen işlem (ör. TCP'siz kontrolcüye eş zamanlı 5 eksen) ve
// çarpışma / limit ihlali olan yol için G-kodu ÜRETİLMEZ (hata fırlatılır).
// Hiçbir post belirli bir makinede doğrulanmamıştır: program başlığında yazar.
import { fmt, ascii } from './cam.js?v=20261112t';
import { norm, sub } from './kin.js?v=20261112t';

export const POSTS5 = {
  fanuc_tcp: { name: 'Fanuc 30i / 31i-B5 (TCP: G43.4)', rot: [2], p32: true, sim4: false, sim5: true, tcp: true, ext: 'nc', cm: '()',
    note: 'Takım ucu kontrolü (G43.4, 5 eksen seçeneği) gerekir. Program koordinatı tablaya bağlı iş parçası koordinat sistemidir (kumanda parametresi buna ayarlı olmalı). Döner eksen adları / yönleri makineyle aynı olmalı.' },
  siemens: { name: 'Siemens SINUMERIK 840D sl (TRAORI)', rot: [2], p32: true, sim4: false, sim5: true, tcp: true, ext: 'mpf', cm: ';',
    note: 'TRAORI dönüşümü makinede kurulu olmalı (5 eksen seçeneği). Döner eksen konumları doğrudan (A / B / C) yazılır.' },
  linuxcnc: { name: 'LinuxCNC (makine koordinatı, TCP yok)', rot: [1, 2], p32: true, sim4: true, sim5: true, tcp: false, ext: 'ngc', cm: '()',
    note: 'Kinematik bu uygulamada çözülür: dönme merkezleri / pivot boyu gerçek makineyle birebir girilmiş olmalı. İş sıfırı (G54) dönme eksenlerinin sıfır konumunda W orijinidir. Eş zamanlı hareketlerde ters zaman ilerlemesi (G93).' },
  fanuc4: { name: 'Fanuc / Haas 4. eksen (TCP yok)', rot: [1], p32: false, sim4: true, sim5: false, tcp: false, ext: 'nc', cm: '()',
    note: 'İş sıfırının Y ve Z\'si döner eksenin merkezinde olmalı (G54). Eş zamanlı X–A hareketlerinde G93 (ters zaman) kullanılır.' },
  mach3: { name: 'Mach3 / Mach4 (4. eksen)', rot: [1], p32: false, sim4: true, sim5: false, tcp: false, ext: 'tap', cm: '()',
    note: 'Döner eksen derece biriminde ayarlı olmalı. İş sıfırının Y ve Z\'si döner eksenin merkezinde. Eş zamanlı harekette G93.' },
  grbl: { name: 'GRBL (yalnız 3 eksen — döner eksen desteklenmez)', rot: [0], p32: false, sim4: false, sim5: false, tcp: false, ext: 'gcode', cm: '()', note: 'Standart GRBL döner eksen yönetmez; 4 / 5 eksen kodu üretilmez.' },
};

const ROT = (R) => (R.machine.rot || []).map((r) => r.name);
// yetenek ve güvenlik denetimi: [] ise üretilebilir
export function canPost(R, postKey, safety) {
  const P = POSTS5[postKey], e = [];
  if (!P) return ['Bilinmeyen kontrolcü: ' + postKey];
  const nr = ROT(R).length;
  if (!P.rot.includes(nr)) e.push(P.name + ': ' + nr + ' döner eksenli makine için uygun değil');
  const types = new Set(R.passes.map((p) => p.opType));
  if (types.has('p32') && !P.p32) e.push(P.name + ': 3+2 konumlandırmalı işlem desteklenmiyor');
  if (R.simulMoves > 0) {
    if (nr === 1 && !P.sim4) e.push(P.name + ': eş zamanlı 4 eksen hareketi desteklenmiyor');
    if (nr === 2 && !P.sim5) e.push(P.name + ': eş zamanlı 5 eksen hareketi desteklenmiyor (TCP yok)');
  }
  if (R.limitViolations.length) e.push(R.limitViolations.length + ' noktada eksen limiti / erişilemeyen yön');
  if (!safety) e.push('Çarpışma kontrolü yapılmadı');
  else if (!safety.safe) e.push('Çarpışma var (' + safety.hits.length + ' kayıt): G-kodu engellendi');
  if (R.cl.some((c, i) => !R.ax[i])) e.push('Kinematik çözümü olmayan nokta var');
  return e;
}

// opt: { program, date, name, rapidFeed, allowUnsafe (yalnız test), maxRotSpeed (der/dk) }
export function gcode5(R, job, postKey, safety, opt = {}) {
  const P = POSTS5[postKey], errs = canPost(R, postKey, safety);
  if (!opt.allowUnsafe && errs.length) throw new Error('G-kodu üretilemez: ' + errs.join('; '));
  if (!P) throw new Error('Bilinmeyen kontrolcü');
  const L = [], sie = postKey === 'siemens', fan = postKey === 'fanuc_tcp' || postKey === 'fanuc4';
  const c = (t) => (P.cm === ';' ? '; ' + ascii(t).slice(0, 76) : '(' + ascii(t).slice(0, 70) + ')');
  const rn = ROT(R), tools = new Map(job.tools.map((t) => [t.id, t]));
  const rapidF = opt.rapidFeed || 5000, rotSp = opt.maxRotSpeed || 3600;
  const A = (v) => fmt(v);
  if (!sie) L.push('%');
  if (fan) L.push('O' + String(opt.program || 5001).padStart(4, '0') + ' ' + c(job.name || 'CIZIM ATOLYESI 5X'));
  else L.push(c(job.name || 'CIZIM ATOLYESI 5X'));
  L.push(c('CIZIM ATOLYESI CAM ' + (rn.length + 3) + ' EKSEN - ' + (opt.date || '')));
  L.push(c('KONTROLCU: ' + P.name));
  L.push(c('MAKINE: ' + (R.machine.name || R.machine.type) + ' - ' + (R.machine.rot || []).map((r) => r.name + ' EKSEN [' + r.axis.join(' ') + '] ' + r.min + '/' + r.max).join(', ')));
  L.push(c('DOGRULANMAMIS PROGRAM: makinede ilk kullanimdan once kumanda simulasyonu, tek blok ve dusuk ilerleme ile kontrol edin'));
  L.push(c('IS SIFIRI G54 = parca cercevesi orijini, doner eksenler 0 derecede'));
  if (P.tcp) L.push(c('TCP: X Y Z takim ucu, parca koordinatinda'));
  else L.push(c('X Y Z ' + rn.join(' ') + ' makine eksen degerleri (kinematik uygulamada cozuldu)'));
  for (const t of job.tools) L.push(c('T' + t.n + ' D' + fmt(t.d) + (t.type === 'ball' ? ' KURESEL' : ' PARMAK') + ' KESME BOYU ' + fmt(t.flute) + ' TASMA ' + fmt(t.stickout || 0)));
  L.push(sie ? 'G17 G90 G94 G71' : 'G21 G17 G40 G49 G80 G90 G94' + (postKey === 'linuxcnc' ? ' G64 P0.01' : ''));
  let feedMode = 94, last = null, lastG = null, lastF = null, tcpOn = false, toolNow = null;
  const word = (k, v, prev) => (prev == null || Math.abs(v - prev) > 5e-4 ? k + A(v) : '');
  const motion = (g, vals, fword) => {
    const w = [];
    if (g !== lastG) w.push('G' + g);
    for (const [k, v] of vals) { const s = word(k, v, last ? last[k] : null); if (s) w.push(s); }
    if (!w.some((x) => !x.startsWith('G'))) return;
    if (fword) w.push(fword);
    L.push(w.join(' '));
    lastG = g;
    last = last || {}; for (const [k, v] of vals) last[k] = v;
  };
  const vals = (i) => {
    const ax = R.ax[i], cl = R.cl[i];
    const xyz = P.tcp ? [['X', cl.p[0]], ['Y', cl.p[1]], ['Z', cl.p[2]]] : [['X', ax.X], ['Y', ax.Y], ['Z', ax.Z]];
    return xyz.concat(rn.map((n) => [n, ax[n]]));
  };
  const endTool = () => {
    if (tcpOn) { L.push(sie ? 'TRAFOOF' : 'G49'); tcpOn = false; }
    L.push('M9'); L.push('M5');
    L.push(sie ? 'G0 SUPA Z0' : fan ? 'G91 G28 Z0.0' : 'G53 G0 Z0.0');
    if (!sie && fan) L.push('G90');
  };
  for (let i = 0; i < R.cl.length; i++) {
    const cl = R.cl[i], t = tools.get(cl.tool);
    if (cl.tool !== toolNow) {
      if (toolNow != null) endTool();
      toolNow = cl.tool; last = null; lastG = null; lastF = null;
      L.push(c('T' + t.n + ' ' + (t.type === 'ball' ? 'KURESEL' : 'PARMAK') + ' D' + fmt(t.d)));
      L.push(sie ? 'T' + t.n + ' D1 M6' : 'T' + t.n + ' M6');
      L.push('S' + Math.round(t.rpm || 1000) + ' M3');
      L.push('G54');
      if (feedMode !== 94) { L.push('G94'); feedMode = 94; }
      // döner eksenler Z en üstteyken konumlanır, sonra takım boyu / TCP açılır, sonra ilk noktaya
      const ax = R.ax[i];
      if (rn.length) { L.push('G0 ' + rn.map((n) => n + A(ax[n])).join(' ')); }
      if (P.tcp) { L.push(sie ? 'TRAORI' : 'G43.4 H' + t.n); tcpOn = true; }
      const v0 = vals(i);
      if (P.tcp) { L.push('G0 X' + A(v0[0][1]) + ' Y' + A(v0[1][1])); L.push('G0 Z' + A(v0[2][1])); }
      else { L.push('G0 X' + A(v0[0][1]) + ' Y' + A(v0[1][1])); L.push((sie ? 'G0 Z' : 'G43 H' + t.n + ' Z') + A(v0[2][1])); }
      last = Object.fromEntries(v0.map(([k, v]) => [k, v])); lastG = 0;
      L.push('M8');
      continue;
    }
    const prev = R.ax[i - 1], ax = R.ax[i];
    const rotCh = rn.some((n) => Math.abs(ax[n] - prev[n]) > 5e-4);
    const lenTip = norm(sub(cl.p, R.cl[i - 1].p)), dAng = Math.max(0, ...rn.map((n) => Math.abs(ax[n] - prev[n])));
    if (cl.k === 'r' && !rotCh) {
      if (feedMode !== 94 && !P.tcp) { L.push('G94'); feedMode = 94; lastF = null; }
      motion(0, vals(i));
      continue;
    }
    // ilerlemeli hareket (hızlı bağlantıda döner eksen değişiyorsa da: hızlı ilerlemeyle doğrusal enterpolasyon)
    const f = cl.k === 'r' ? rapidF : (cl.f || 100);
    if (rotCh && !P.tcp) {
      if (feedMode !== 93) { L.push('G93'); feedMode = 93; lastF = null; }
      const tMin = Math.max(lenTip / f, dAng / rotSp, 1e-5);
      const F = Math.min(99999, 1 / tMin);
      motion(1, vals(i), 'F' + fmt(F));
      lastF = null;
    } else {
      if (feedMode !== 94) { L.push('G94'); feedMode = 94; lastF = null; }
      const fw = Math.round(f) !== lastF ? 'F' + Math.round(f) : '';
      const before = L.length;
      motion(1, vals(i), fw);
      if (L.length > before && fw) lastF = Math.round(f);
    }
  }
  if (toolNow != null) endTool();
  if (feedMode !== 94) L.push('G94');
  L.push('M30');
  if (!sie) L.push('%');
  return L.join('\n') + '\n';
}

// ---- G-kodu okuyucu (testler ve tutarlılık denetimi için): hareket satırları → eksen değerleri ----
export function parseMotion(text) {
  const out = [], st = { X: null, Y: null, Z: null, A: null, B: null, C: null };
  let g = null, mode = 94, tcp = false;
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\(.*?\)/g, '').replace(/;.*$/, '').trim();
    if (!line) continue;
    if (/\bG93\b/.test(line)) mode = 93;
    if (/\bG94\b/.test(line)) mode = 94;
    if (/\bG43\.4\b|\bTRAORI\b/.test(line)) tcp = true;
    if (/\bG49\b|\bTRAFOOF\b/.test(line)) tcp = false;
    if (/\bG53\b|\bG28\b|SUPA/.test(line)) continue;   // makine sıfırına dönüş: parça çerçevesi dışında
    const gm = line.match(/\bG0?([01])\b(?!\.)/); if (gm) g = +gm[1];
    let moved = false;
    for (const m of line.matchAll(/\b([XYZABC])(-?\d+(?:\.\d+)?)/g)) { st[m[1]] = +m[2]; moved = true; }
    if (moved && g != null) out.push({ g, mode, tcp, ...st, F: (line.match(/\bF(-?\d+(?:\.\d+)?)/) || [])[1] != null ? +line.match(/\bF(-?\d+(?:\.\d+)?)/)[1] : null, line });
  }
  return out;
}
