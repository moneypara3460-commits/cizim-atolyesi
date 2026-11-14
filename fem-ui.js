// 📐 Analiz sekmesi: analiz ağacı (tür → birim → malzeme → ağ → sınır koşulları → çöz) ve sonuç ağacı.
// Hesap fea.js / fea2.js'tedir (işçide). Kurulum ve sonuç özetleri projeyle kaydedilir; sonuç alanları bellekte tutulur.
// api: { parts() → [{ id, name, matId }], items() → [{ id, name, tris }], geoHash(), getFem(), setFem(o), draw(spec), enter(), leave(),
//        render(), toast(m), name(), saveText(text, name) }
import * as X from './fea2.js?v=20261112u';

const V = '20261112u';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 3) => (v == null || !isFinite(v) ? '—' : Math.abs(v) >= 1e5 || (Math.abs(v) < 1e-3 && v !== 0) ? v.toExponential(d - 1).replace('.', ',') : (+v.toPrecision(d + 1)).toLocaleString('tr-TR', { maximumFractionDigits: 6 }));
const FACES = [['-y', 'Alt yüz (−Y)'], ['+y', 'Üst yüz (+Y)'], ['-x', 'Sol yüz (−X)'], ['+x', 'Sağ yüz (+X)'], ['-z', 'Arka yüz (−Z)'], ['+z', 'Ön yüz (+Z)']];
const DIRS = { '-y': [0, -1, 0], '+y': [0, 1, 0], '-x': [-1, 0, 0], '+x': [1, 0, 0], '-z': [0, 0, -1], '+z': [0, 0, 1] };
const TYPES = ['static', 'modal', 'thermal', 'thermalT', 'buckling'];
const VALIDATION = [   // tests/fea2.test.mjs ve tests/fea.test.mjs ölçümleri (bu sürüm)
  ['Çekme çubuğu σ = F/A', '%0,000'], ['Çekme çubuğu uzaması FL/EA', '%0,37'], ['Ankastre kiriş sehimi FL³/3EI', '%0,01'], ['Kiriş eğilme gerilmesi M·c/I', '%0,00'],
  ['Uç momenti sehimi ML²/2EI', '%0,47'], ['Modal 1. frekans (ankastre kiriş)', '%0,09'], ['Modal 2. eğilme frekansı', '%1,06'], ['Isı iletimi (doğrusal, kAΔT/L)', '< %0,001'],
  ['İç ısı üretimi QL²/8k', '< %0,001'], ['Taşınım ucu sıcaklığı', '< %0,001'], ['Zamana bağlı levha soğuması (Fourier)', '%0,81'], ['Euler burkulma yükü π²EI/4L²', '%0,11'],
];
function defaults() {
  return { type: 'static', units: 'mm', density: 'orta', mats: {}, custom: [], mech: { supports: [], loads: [], gravity: false, modes: 4, bmodes: 3 }, therm: { fixed: [], flux: [], conv: [], Q: 0, T0: 20, dur: 60, dt: 1 }, results: [] };
}

function createClient() {
  let w = null, seq = 0, inline = null;
  const pend = new Map();
  function start() {
    if (w || inline) return;
    try {
      w = new Worker(new URL('./fem-worker.js?v=' + V, import.meta.url), { type: 'module' });
      w.onmessage = (e) => { const p = pend.get(e.data.id); if (!p) return; if (e.data.prog) { p.prog && p.prog(e.data.prog); return; } pend.delete(e.data.id); e.data.ok ? p.res(e.data.res) : p.rej(new Error(e.data.err)); };
      w.onerror = () => { for (const p of pend.values()) p.rej(new Error('Analiz işçisi başlatılamadı')); pend.clear(); try { w.terminate(); } catch (x) { /* */ } w = null; inline = load(); };
    } catch (e) { inline = load(); }
  }
  const load = () => Promise.all([import('./fea.js?v=' + V), import('./fem-run.js?v=' + V)]).then(([F, R]) => ({ F, R }));
  async function call(op, a, prog) {
    start();
    if (inline) { const { F, R } = await inline; await new Promise((r) => setTimeout(r, 30)); return op === 'run' ? R.runFEM(F, X, a, (t, f) => prog && prog({ text: t, f })) : R.convStudy(F, X, a, (t, f) => prog && prog({ text: t, f })); }
    return new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej, prog }); w.postMessage({ id, op, a }); });
  }
  return { call };
}

export function createFemUI(api) {
  const client = createClient();
  const S = { busy: null, err: null, view: null, live: new Map(), sel: null, field: null, defo: 'auto', mode: 0, frame: 0, pick: null, conv: null, showRep: false, lab: false, matEdit: null };
  const D = () => { let o = api.getFem(); if (!o) { o = defaults(); api.setFem(o); } const d = defaults(); for (const k of Object.keys(d)) if (o[k] == null) o[k] = d[k]; fixPressure(o); return o; };
  // Basınç yükünün değeri 'pv' alanında tutulur. 'p' alanı her yükte "dokunarak seçilen nokta" ([x, y, z]) içindir.
  // Eski kayıtlarda basınç değeri 'p' alanındaydı ve nokta seçimiyle çakışıyordu: sayı ise 'pv'ye taşınır.
  function fixPressure(o) {
    for (const L of (o.mech && o.mech.loads) || []) if (L && L.type === 'pressure' && !Array.isArray(L.p) && L.pv == null) { L.pv = Number.isFinite(+L.p) ? +L.p : 1; delete L.p; }
  }
  const save = () => api.setFem(D());
  const U = () => D().units;
  const disp = (q, v) => X.toDisp(U(), q, v), inp = (q, v) => X.fromDisp(U(), q, v), un = (q) => X.unitOf(U(), q);
  const lib = () => [...X.libraryMaterials(), ...D().custom];
  const matOf = (id) => lib().find((m) => m.id === id) || lib()[0];
  const partMats = () => api.parts().map((p) => ({ ...p, mat: matOf(D().mats[p.id] || p.matId) }));
  const reqFor = (t) => [...X.REQUIRED[t], ...(t === 'static' ? ['sy'] : []), ...(t === 'static' && D().mech.gravity ? ['rho'] : [])];
  const render = () => api.render();
  const prog = (p) => { if (S.busy) S.busy = p.text + (p.f != null ? ' (%' + Math.round(p.f * 100) + ')' : ''); const el = document.getElementById('fembusy'); if (el) el.textContent = '⏳ ' + S.busy; };

  // ---- girdileri iç birimlerde topla ----
  function inputs(type) {
    const o = D(), pm = partMats();
    const ids = [...new Set(pm.map((p) => p.mat.id))];
    const items = api.items().filter((x) => x.tris && x.tris.length >= 9).map((x) => { const p = pm.find((q) => q.id === x.id); return { id: x.id, name: x.name, tris: x.tris, mat: ids.indexOf(p ? p.mat.id : ids[0]) }; });
    const mats = ids.map((id) => matOf(id));
    const sel = (b) => (b.face || !Array.isArray(b.p) ? { face: b.face || '+y' } : { p: b.p, r: b.r });
    let setup;
    if (type === 'thermal' || type === 'thermalT') {
      const t = o.therm;
      setup = { fixed: t.fixed.map((b) => ({ sel: sel(b), T: b.T })), flux: t.flux.map((b) => ({ sel: sel(b), q: b.q })), conv: t.conv.map((b) => ({ sel: sel(b), h: b.h, Tinf: b.Tinf })), Q: t.Q || 0 };
      if (type === 'thermalT') setup.transient = { T0: t.T0, dt: t.dt, steps: Math.max(1, Math.round(t.dur / t.dt)), save: Math.max(1, Math.round(t.dur / t.dt / 40)) };
    } else {
      const m = o.mech;
      setup = { supports: m.supports.map(sel), loads: type === 'modal' ? [] : m.loads.map((L) => (L.type === 'force' ? { type: 'force', sel: sel(L), F: L.F, dir: DIRS[L.dir] } : L.type === 'pressure' ? { type: 'pressure', sel: sel(L), p: L.pv } : { type: 'moment', sel: sel(L), M: L.M })), gravity: type === 'static' && !!m.gravity };
    }
    return { items, mats, setup, ids };
  }
  function check(type) {
    const e = [], { mats, setup, items } = inputs(type);
    if (!items.length) e.push('Görünür katı parça yok.');
    for (const m of mats) { const miss = X.missingProps(m, reqFor(type).filter((k) => k !== 'sy')); if (miss.length) e.push(`"${m.name}" malzemesinde eksik: ${miss.map((k) => X.PROP_DEFS.find((d) => d[0] === k)[1]).join(', ')}.`); const v = X.validateMaterial(m); if (v.length) e.push(`"${m.name}": ${v.join('; ')}`); }
    if (['static', 'modal', 'buckling'].includes(type) && !setup.supports.length) e.push('Mesnet (sabit sınır) tanımlı değil.');
    if ((type === 'static' || type === 'buckling') && !setup.loads.length && !setup.gravity) e.push('Yük tanımlı değil.');
    if (type === 'buckling' && setup.gravity) e.push('Burkulmada öz ağırlık referans yüke katılmaz.');
    if (type === 'thermal' && !setup.fixed.length && !setup.conv.length) e.push('Kararlı durum için sabit sıcaklık ya da taşınım sınırı gerekir.');
    if (type === 'thermalT' && !(D().therm.dt > 0 && D().therm.dur > 0)) e.push('Süre ve zaman adımı > 0 olmalı.');
    if (type === 'thermalT' && D().therm.dur / D().therm.dt > 2000) e.push('En fazla 2000 zaman adımı.');
    return e;
  }
  const keyOf = (type) => { const { mats, setup, ids } = inputs(type); return X.inputKey(api.geoHash(), mats.map((m) => [m.id, m.props]), { type, setup, ids, modes: D().mech.modes, bmodes: D().mech.bmodes }, D().density); };

  async function solve(type) {
    const errs = check(type);
    if (errs.length) { S.err = 'Çözülemez: ' + errs.join(' '); render(); return; }
    const { items, mats, setup } = inputs(type);
    S.busy = 'Hazırlanıyor'; S.err = null; render();
    try {
      const r = await client.call('run', { type, items, mats: mats.map(X.solverMat), target: X.DENSITY[D().density][0], setup, modes: type === 'buckling' ? D().mech.bmodes : D().mech.modes }, prog);
      if (r.error) { S.err = '⛔ ' + r.text; if (r.mesh) S.view = r; return; }
      const id = 'r' + Date.now().toString(36), o = D();
      const rec = summarize(type, r, mats, setup, id);
      o.results.unshift(rec); o.results = o.results.slice(0, 12); save();
      S.live.set(id, r); S.sel = id; S.view = r; S.field = null; S.mode = 0; S.frame = 0; enter(); draw();
    } catch (e) { S.err = String(e.message || e); } finally { S.busy = null; render(); }
  }
  // sonuç özeti (projeye kaydedilir; birimler iç birimdir: mm, N, MPa, °C, W)
  function summarize(type, r, mats, setup, id) {
    const R = r.res, sm = {};
    if (type === 'static') Object.assign(sm, { maxU: R.maxU, vmax: R.vmax, vEx: R.vEx, p995: R.p995, fos: R.fosEx, fosAll: R.fosAll, reaction: R.reaction, eqErr: R.eqErr });
    if (type === 'modal') Object.assign(sm, { f: R.modes.map((m) => m.f), massKg: R.massKg });
    if (type === 'thermal') Object.assign(sm, { tmin: R.tmin, tmax: R.tmax, heat: R.heat });
    if (type === 'thermalT') Object.assign(sm, { tmin: R.tmin, tmax: R.tmax, tEnd: R.frames[R.frames.length - 1].t, frames: R.frames.length });
    if (type === 'buckling') Object.assign(sm, { lambda: R.modes.map((m) => m.lambda) });
    return {
      id, type, at: Date.now(), key: keyOf(type), units: 'mm, N, MPa, °C, W', density: D().density,
      mesh: { ne: r.mesh.ne, nn: r.mesh.nn, h: r.mesh.h, thinPct: r.mesh.thinPct, parts: r.mesh.parts },
      mats: mats.map((m) => ({ id: m.id, name: m.name, props: Object.fromEntries(Object.entries(m.props).filter(([, v]) => v).map(([k, v]) => [k, [v.v, v.st, v.src]])) })),
      setup, summary: sm, warn: R.warn || [],
    };
  }

  // ---- 3B görüntü ----
  function enter() { if (!S.lab) { api.enter(); S.lab = true; } }
  function exit() { if (S.lab) { api.leave(); S.lab = false; } }
  function size(v) { let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; for (let n = 0; n < v.nn; n++) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], v.xyz[n * 3 + k]); mx[k] = Math.max(mx[k], v.xyz[n * 3 + k]); } return Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]); }
  const fields = (type) => (type === 'static' ? [['u', 'Yer değiştirme |u|'], ['ux', 'uX'], ['uy', 'uY'], ['uz', 'uZ'], ['vm', 'von Mises gerilmesi'], ['util', 'Kullanım oranı σvm/σy']] : type === 'thermal' ? [['T', 'Sıcaklık'], ['q', 'Isı akısı |q|']] : []);
  function draw() {
    const r = S.view; if (!r || !r.view) return;
    const v = r.view, fe = { xyz: v.xyz, nn: v.nn, h: v.h }, rec = D().results.find((x) => x.id === S.sel), type = rec ? rec.type : 'mesh';
    const spec = { fe, quads: v.quads, val: null, vmin: 0, vmax: 1, disp: null, scale: 0, anim: 'none', ghost: false, before: false, sup: (r.marks && r.marks.sup) || [], loads: ((r.marks && r.marks.loads) || []).map((L) => ({ p: L.p, dir: L.dir, label: L.kind === 'moment' ? 'M' : L.kind === 'pressure' ? 'p' : 'F' })), marks: [], unit: '' };
    const R = r.res, sz = size(v);
    let legend = null; S.scaleNote = null;
    if (R && type === 'static') {
      const f = S.field || 'vm', u = R.u, val = new Float32Array(v.nn);
      if (f === 'vm') for (let n = 0; n < v.nn; n++) val[n] = R.vm[n];
      else if (f === 'util') { if (!R.fos) { S.field = 'vm'; return draw(); } for (let n = 0; n < v.nn; n++) val[n] = 1 / R.fos[n]; }
      else for (let n = 0; n < v.nn; n++) val[n] = f === 'u' ? Math.hypot(u[n * 3], u[n * 3 + 1], u[n * 3 + 2]) : u[n * 3 + 'xyz'.indexOf(f[1])];
      let mn = Infinity, mx = -Infinity; for (const x of val) { if (x < mn) mn = x; if (x > mx) mx = x; }
      if (f === 'vm') mx = R.p995 > 0 ? Math.max(R.p995, mn + 1e-12) : mx;   // renk ölçeği %99,5'te kesilir (tekil tepe rengi yutmasın)
      spec.val = val; spec.vmin = mn; spec.vmax = mx;
      const q = f === 'vm' ? 'S' : f === 'util' ? null : 'L';
      legend = { min: q ? disp(q, mn) : mn, max: q ? disp(q, mx) : mx, unit: q ? un(q) : '–', cut: f === 'vm' ? 'renk ölçeği %99,5 değerinde kesildi; en büyük ' + nf(disp('S', R.vmax)) + ' ' + un('S') : null };
      setDefo(spec, u, R.maxU, sz);
    } else if (R && (type === 'modal' || type === 'buckling')) {
      const m = R.modes[Math.min(S.mode, R.modes.length - 1)], val = new Float32Array(v.nn);
      for (let n = 0; n < v.nn; n++) val[n] = Math.hypot(m.phi[n * 3], m.phi[n * 3 + 1], m.phi[n * 3 + 2]);
      spec.val = val; spec.vmin = 0; spec.vmax = 1; spec.disp = m.phi; spec.scale = S.defo === 'off' ? 0 : sz * 0.08; spec.anim = type === 'modal' ? 'osc' : 'none'; spec.ghost = true;
      legend = { min: 0, max: 1, unit: 'göreli (mod şeklinin genliği keyfidir, gerçek yer değiştirme değildir)' };
      S.scaleNote = 'Mod şekli normalize edildi (en büyük 1); çizimde boyutun %8\'i kadar gösteriliyor.';
    } else if (R && type === 'thermal') {
      const f = S.field || 'T', val = f === 'T' ? R.T : R.q;
      let mn = Infinity, mx = -Infinity; for (const x of val) { if (x < mn) mn = x; if (x > mx) mx = x; }
      spec.val = val; spec.vmin = mn; spec.vmax = mx > mn ? mx : mn + 1e-9;
      legend = f === 'T' ? { min: disp('T', mn), max: disp('T', mx), unit: un('T') } : { min: disp('q', mn), max: disp('q', mx), unit: un('q') };
    } else if (R && type === 'thermalT') {
      const fr = R.frames[Math.min(S.frame, R.frames.length - 1)];
      spec.val = fr.T; spec.vmin = R.tmin; spec.vmax = R.tmax > R.tmin ? R.tmax : R.tmin + 1e-9;
      legend = { min: disp('T', R.tmin), max: disp('T', R.tmax), unit: un('T'), cut: 't = ' + nf(fr.t) + ' s (tüm zamanlar için aynı ölçek)' };
    }
    S.legend = legend;
    api.draw(spec);
  }
  function setDefo(spec, u, maxU, sz) {
    if (S.defo === 'off' || !(maxU > 0)) { S.scaleNote = 'Şekil değişimi gösterilmiyor.'; return; }
    const k = S.defo === 'real' ? 1 : sz * 0.05 / maxU;
    spec.disp = u; spec.scale = k; spec.anim = 'none'; spec.ghost = true;
    S.scaleNote = S.defo === 'real' ? 'Şekil değişimi GERÇEK ölçekte (×1).' : `Şekil değişimi ×${nf(k, 3)} BÜYÜTÜLDÜ (görsel). Gerçek en büyük yer değiştirme: ${nf(disp('L', maxU))} ${un('L')}.`;
  }

  // ---- arayüz ----
  const btn = (l, a, on, st = '') => `<button data-act="${a}"${on ? ' class="on"' : ''}${st ? ' style="' + st + '"' : ''}${S.busy ? ' disabled' : ''}>${l}</button>`;
  const lbl = (t, st = '') => `<div class="lbl" style="flex:1 0 100%;${st}">${t}</div>`;
  const num = (label, key, val) => `<label class="f"><span>${label}</span><input type="number" step="any" inputmode="decimal" data-fm="${key}" value="${val == null || !isFinite(val) ? '' : +(+val).toPrecision(8)}"></label>`;
  const faceSel = (key, b) => `<label class="f"><span>Yer</span><select data-fm="${key}">${FACES.map(([k, l]) => `<option value="${k}"${b.face === k ? ' selected' : ''}>${l}</option>`).join('')}<option value="pt"${Array.isArray(b.p) ? ' selected' : ''}>${Array.isArray(b.p) ? 'Nokta (' + b.p.map((x) => x.toFixed(1)).join(', ') + ')' : 'Dokunarak nokta seç'}</option></select></label>`;
  function legendHtml() {
    const L = S.legend; if (!L) return '';
    return `<div style="flex:1 0 100%"><div style="height:12px;border-radius:6px;background:linear-gradient(90deg,#1d4ed8,#06b6d4,#22c55e,#eab308,#ef4444)"></div><div style="display:flex;justify-content:space-between;font-size:12.5px;color:#94a3b8;margin-top:2px"><span>en az ${nf(L.min)} ${esc(L.unit)}</span><span>en çok ${nf(L.max)} ${esc(L.unit)}</span></div>${L.cut ? `<div style="font-size:12px;color:#94a3b8">${esc(L.cut)}</div>` : ''}</div>`;
  }
  function html() {
    const o = D(), t = o.type, A = X.ANALYSES[t];
    let h = '<div class="lbl h">1 · Analiz türü</div>' + TYPES.map((k) => btn(X.ANALYSES[k].name, 'fm-type-' + k, t === k)).join('') +
      '<button disabled style="opacity:.45">Doğrusal olmayan — yok</button><button disabled style="opacity:.45">Temas — yok</button>' +
      lbl(`<b>Model:</b> ${esc(A.physics)}<br><b>Yöntem:</b> ${esc(A.method)}`, 'font-size:12px;color:#cbd5e1') +
      lbl(`Doğrusal olmayan analiz ve temas desteklenmiyor: ${esc(X.ANALYSES.nonlinear.method)} Montaj: ${esc(X.BOND_NOTE)}`, 'font-size:11.5px;color:#94a3b8');
    h += '<div class="lbl h">2 · Birimler</div>' + Object.entries(X.UNIT_SYSTEMS).map(([k, u]) => btn(u.name, 'fm-units-' + k, o.units === k)).join('') + lbl('Çözücü her zaman mm, N, MPa, °C, W ile hesaplar; girişler ve sonuçlar seçilen sisteme dönüştürülür.', 'font-size:12px;color:#94a3b8');
    // malzemeler
    const pm = partMats();
    h += '<div class="lbl h">3 · Malzemeler</div>';
    if (!pm.length) h += lbl('Görünür parça yok.');
    for (const p of pm) h += `<label class="f w2"><span>${esc(p.name)}</span><select data-fm="mat.${p.id}">${lib().map((m) => `<option value="${m.id}"${p.mat.id === m.id ? ' selected' : ''}>${esc(m.name)}${m.custom ? ' (özel)' : ''}</option>`).join('')}</select></label>`;
    const used = [...new Map(pm.map((p) => [p.mat.id, p.mat])).values()];
    for (const m of used) {
      const miss = X.missingProps(m, reqFor(t));
      h += `<div style="flex:1 0 100%;font-size:12px;background:#0b1220;border-radius:8px;padding:6px"><b>${esc(m.name)}</b>${m.aniso ? ' <span style="color:#fbbf24">· yönlü malzeme, izotrop kabul (yaklaşık)</span>' : ''}<table style="width:100%;border-collapse:collapse;margin-top:3px">` +
        X.PROP_DEFS.map(([k, nm, u]) => { const pv = m.props[k]; return `<tr><td style="color:#94a3b8">${nm}</td><td style="text-align:right">${pv ? nf(pv.v) + ' ' + u : '<span style="color:#f87171">yok</span>'}</td><td style="color:${pv && pv.st === 'standart' ? '#4ade80' : pv && pv.st === 'kullanıcı' ? '#fbbf24' : '#94a3b8'};padding-left:6px">${pv ? pv.st : ''}</td></tr>`; }).join('') + '</table>' +
        `<div style="color:#64748b;margin-top:2px">Kaynak: ${esc([...new Set(Object.values(m.props).filter(Boolean).map((x) => x.src))].join(' · '))}. "tipik" değerler belirli bir parti için doğrulanmış değildir.</div>` +
        (miss.length ? `<div style="color:#f87171">Bu analiz için eksik: ${miss.join(', ')}</div>` : '') + '</div>';
    }
    h += btn('+ Özel malzeme', 'fm-matnew');
    if (S.matEdit) {
      const e = S.matEdit;
      h += `<label class="f w2"><span>Ad</span><input type="text" data-fm="me.name" value="${esc(e.name)}"></label>` + X.PROP_DEFS.map(([k, nm, u]) => num(nm + ' (' + u + ')', 'me.' + k, e[k])).join('') + btn('Kaydet', 'fm-matsave') + btn('Vazgeç', 'fm-matcancel');
    }
    // ağ
    h += '<div class="lbl h">4 · Ağ (mesh)</div>' + Object.entries(X.DENSITY).map(([k, d]) => btn(d[1], 'fm-dens-' + k, o.density === k)).join('') + btn('▦ Ağı oluştur / göster', 'fm-mesh');
    if (S.view && S.view.mesh) {
      const M = S.view.mesh;
      h += lbl(`${M.ne.toLocaleString('tr-TR')} eleman · ${M.nn.toLocaleString('tr-TR')} düğüm · eleman boyu ${nf(disp('L', M.h))} ${un('L')}. ${esc(M.shape)}`, 'font-size:12.5px') + M.parts.map((p) => lbl(`${esc(p.name)}: ${p.cells} eleman, hacim hatası %${nf(p.err * 100, 2)}`, 'font-size:12px;color:' + (p.poor ? '#f87171' : '#94a3b8'))).join('');
      for (const w of M.warn) h += lbl((w.sev === 'crit' ? '⛔ ' : '⚠ ') + esc(w.t), 'font-size:12.5px;color:' + (w.sev === 'crit' ? '#f87171' : '#fbbf24'));
    }
    // sınır koşulları
    h += '<div class="lbl h">5 · Sınır koşulları ve yükler</div>';
    if (S.pick) h += lbl('👆 Modelde bir noktaya dokun (önce "Ağı oluştur").', 'color:#fbbf24');
    if (t === 'thermal' || t === 'thermalT') {
      const T = o.therm;
      T.fixed.forEach((b, i) => { h += lbl('Sabit sıcaklık ' + (i + 1), 'font-weight:600') + faceSel('tf.' + i + '.sel', b) + num('T (' + un('T') + ')', 'tf.' + i + '.T', disp('T', b.T)) + btn('✕', 'fm-del-tf-' + i); });
      T.flux.forEach((b, i) => { h += lbl('Isı akısı ' + (i + 1) + ' (pozitif = parçaya giren)', 'font-weight:600') + faceSel('tq.' + i + '.sel', b) + num('q (' + un('q') + ')', 'tq.' + i + '.q', disp('q', b.q)) + btn('✕', 'fm-del-tq-' + i); });
      T.conv.forEach((b, i) => { h += lbl('Taşınım ' + (i + 1), 'font-weight:600') + faceSel('tc.' + i + '.sel', b) + num('h (' + un('h') + ')', 'tc.' + i + '.h', disp('h', b.h)) + num('T∞ (' + un('T') + ')', 'tc.' + i + '.Tinf', disp('T', b.Tinf)) + btn('✕', 'fm-del-tc-' + i); });
      h += btn('+ Sabit sıcaklık', 'fm-add-tf') + btn('+ Isı akısı', 'fm-add-tq') + btn('+ Taşınım', 'fm-add-tc') + num('Hacimsel ısı üretimi (' + un('Q') + ')', 'tQ', disp('Q', T.Q || 0));
      if (t === 'thermalT') h += num('Başlangıç sıcaklığı (' + un('T') + ')', 'tT0', disp('T', T.T0)) + num('Süre (s)', 'tdur', T.dur) + num('Zaman adımı (s)', 'tdt', T.dt);
    } else {
      const M = o.mech;
      M.supports.forEach((b, i) => { h += lbl('Mesnet ' + (i + 1) + ' (tam sabit: ux = uy = uz = 0)', 'font-weight:600') + faceSel('ms.' + i + '.sel', b) + btn('✕', 'fm-del-ms-' + i); });
      if (t !== 'modal') M.loads.forEach((L, i) => {
        h += lbl({ force: 'Kuvvet', pressure: 'Basınç (pozitif = yüzeye bastırır)', moment: 'Moment (seçimin ağırlık merkezi etrafında)' }[L.type] + ' ' + (i + 1), 'font-weight:600') + faceSel('ml.' + i + '.sel', L);
        if (L.type === 'force') h += num('F (' + un('F') + ')', 'ml.' + i + '.F', disp('F', L.F)) + `<label class="f"><span>Yön</span><select data-fm="ml.${i}.dir">${Object.keys(DIRS).map((k) => `<option value="${k}"${L.dir === k ? ' selected' : ''}>${k.toUpperCase()}</option>`).join('')}</select></label>`;
        if (L.type === 'pressure') h += num('p (' + un('P') + ')', 'ml.' + i + '.pv', disp('P', L.pv));
        if (L.type === 'moment') h += ['X', 'Y', 'Z'].map((a, k) => num('M' + a + ' (' + un('M') + ')', 'ml.' + i + '.M' + k, disp('M', L.M[k]))).join('');
        h += btn('✕', 'fm-del-ml-' + i);
      });
      h += btn('+ Mesnet', 'fm-add-ms') + (t !== 'modal' ? btn('+ Kuvvet', 'fm-add-mf') + btn('+ Basınç', 'fm-add-mp') + btn('+ Moment', 'fm-add-mm') : '');
      if (t === 'static') h += btn('Öz ağırlık: ' + (M.gravity ? 'açık (−Y)' : 'kapalı'), 'fm-grav', M.gravity);
      if (t === 'modal') h += num('Mod sayısı', 'mmodes', M.modes);
      if (t === 'buckling') h += num('Burkulma modu sayısı', 'bmodes', M.bmodes) + lbl('Yükler REFERANS yüktür: kritik yük = λ × referans yük.', 'font-size:12px;color:#94a3b8');
    }
    // çöz
    const errs = check(t);
    h += '<div class="lbl h">6 · Çöz</div>' + btn('▶ ' + A.name + ' çöz', 'fm-solve', false, 'flex:1 0 100%' + (errs.length ? ';opacity:.6' : '')) + btn('📈 Ağ yakınsama çalışması (3 ağ)', 'fm-conv');
    for (const e of errs) h += lbl('• ' + esc(e), 'font-size:12.5px;color:#fbbf24');
    if (S.busy) h += `<div id="fembusy" class="lbl" style="flex:1 0 100%;color:#fbbf24">⏳ ${esc(S.busy)}</div>`;
    if (S.err) h += lbl(esc(S.err), 'color:#f87171');
    if (S.conv) h += convHtml();
    // sonuç ağacı
    h += '<div class="lbl h">7 · Sonuçlar</div>';
    if (!o.results.length) h += lbl('Henüz sonuç yok.');
    for (const r of o.results) {
      const valid = r.key === keyOf(r.type), live = S.live.has(r.id);
      h += btn(`${S.sel === r.id ? '▸ ' : ''}${X.ANALYSES[r.type].name} · ${new Date(r.at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} · ${valid ? (live ? 'geçerli' : 'geçerli (alan yok, yeniden çöz)') : 'ESKİ (girdi değişti)'}`, 'fm-res-' + r.id, S.sel === r.id, 'flex:1 0 100%;text-align:left;' + (valid ? '' : 'color:#f87171'));
    }
    const rec = o.results.find((r) => r.id === S.sel);
    if (rec) h += resultHtml(rec);
    return h;
  }
  function convHtml() {
    const C = S.conv;
    if (C.error) return lbl('⛔ ' + esc(C.text), 'color:#f87171');
    let h = lbl('<b>Ağ yakınsama</b> (' + C.rows.map((r) => r.ne.toLocaleString('tr-TR') + ' eleman / h ' + nf(disp('L', r.h)) + ' ' + un('L')).join(' → ') + ')');
    for (const m of C.metrics) {
      const q = m.unit === 'mm' ? 'L' : m.unit === 'MPa' ? 'S' : m.unit === '°C' ? 'T' : null;
      h += lbl(`${esc(m.name)}: ${m.vals.map((v) => nf(q ? disp(q, v) : v)).join(' → ')} ${q ? un(q) : esc(m.unit)} · son değişim %${nf(m.changes[m.changes.length - 1] * 100, 2)} — ${m.converged ? '<span style="color:#4ade80">yakınsadı (< %3)</span>' : m.diverging ? '<span style="color:#f87171">yakınsamıyor (tekil gerilme olabilir: bu değere güvenme)</span>' : '<span style="color:#fbbf24">henüz yakınsamadı: daha ince ağ gerekir</span>'}`, 'font-size:12.5px');
    }
    return h;
  }
  function resultHtml(rec) {
    const sm = rec.summary, valid = rec.key === keyOf(rec.type);
    let h = '';
    if (!valid) h += lbl('⛔ Bu sonuç ESKİ: geometri, malzeme, yük / mesnet ya da ağ ayarı değişti. Yeniden çöz.', 'color:#f87171');
    if (rec.type === 'static') {
      h += lbl(`En büyük yer değiştirme: <b>${nf(disp('L', sm.maxU))} ${un('L')}</b> · en büyük von Mises: <b>${nf(disp('S', sm.vmax))} ${un('S')}</b> (mesnet / yük komşuluğu hariç ${nf(disp('S', sm.vEx))}) · %99,5: ${nf(disp('S', sm.p995))} ${un('S')}`) +
        lbl(sm.fos != null ? `Emniyet katsayısı (akma / von Mises, komşuluk hariç): <b>${nf(sm.fos, 3)}</b> · tüm elemanlarda en küçük: ${nf(sm.fosAll, 3)}. Yalnız doğrusal-elastik bölgede ve malzeme değerleri doğruysa geçerlidir.` : 'Emniyet katsayısı hesaplanmadı (akma dayanımı eksik).') +
        lbl(`Mesnet tepkisi: ${sm.reaction.map((v) => nf(disp('F', v))).join(' / ')} ${un('F')} (X / Y / Z) · denge hatası %${nf(sm.eqErr * 100, 2)}`, 'font-size:12.5px;color:#94a3b8');
    } else if (rec.type === 'modal') h += lbl('Doğal frekanslar: ' + sm.f.map((f, i) => `${i + 1}. <b>${nf(f, 4)} Hz</b>`).join(' · ') + ` · model kütlesi ${nf(sm.massKg)} kg`);
    else if (rec.type === 'thermal') h += lbl(`Sıcaklık: ${nf(disp('T', sm.tmin))} … <b>${nf(disp('T', sm.tmax))} ${un('T')}</b> · giren ısı ${nf(sm.heat.inflow)} W · enerji dengesi hatası %${nf(sm.heat.balanceErr * 100, 3)}`);
    else if (rec.type === 'thermalT') h += lbl(`Sıcaklık aralığı ${nf(disp('T', sm.tmin))} … ${nf(disp('T', sm.tmax))} ${un('T')} · ${sm.frames} kayıt, son zaman ${nf(sm.tEnd)} s`);
    else if (rec.type === 'buckling') h += lbl('Kritik yük katsayıları: ' + sm.lambda.map((l, i) => `λ${i + 1} = <b>${nf(l, 4)}</b>`).join(' · ') + '. Kritik yük = λ × referans yük. Doğrusal (ideal geometri) değerdir; gerçek taşıma kapasitesi daha düşüktür.', '');
    for (const w of rec.warn) h += lbl((w.sev === 'crit' ? '⛔ ' : w.sev === 'warn' ? '⚠ ' : 'ℹ ') + esc(w.t), 'font-size:12.5px;color:' + (w.sev === 'crit' ? '#f87171' : w.sev === 'warn' ? '#fbbf24' : '#94a3b8'));
    const live = S.live.get(rec.id);
    if (live && valid) {
      const R = live.res;
      const fl = fields(rec.type);
      if (fl.length) h += fl.filter(([k]) => k !== 'util' || R.fos).map(([k, l]) => btn(l, 'fm-field-' + k, (S.field || fl[rec.type === 'static' ? 4 : 0][0]) === k)).join('');
      if (R.modes) h += R.modes.map((m, i) => btn((rec.type === 'modal' ? nf(m.f, 4) + ' Hz' : 'λ ' + nf(m.lambda, 4)), 'fm-mode-' + i, S.mode === i)).join('');
      if (R.frames) h += `<label class="f w2"><span>Zaman: ${nf(R.frames[Math.min(S.frame, R.frames.length - 1)].t)} s</span><input type="range" min="0" max="${R.frames.length - 1}" value="${S.frame}" data-fm="frame"></label>`;
      if (rec.type === 'static' || R.modes) h += btn('Şekil: büyütülmüş', 'fm-defo-auto', S.defo === 'auto') + (rec.type === 'static' ? btn('Şekil: gerçek (×1)', 'fm-defo-real', S.defo === 'real') : '') + btn('Şekil: kapalı', 'fm-defo-off', S.defo === 'off');
      h += legendHtml() + (S.scaleNote ? lbl(esc(S.scaleNote), 'font-size:12px;color:#fbbf24') : '');
    } else if (valid) h += btn('↻ Alanları görmek için yeniden çöz', 'fm-resolve');
    h += btn(S.showRep ? '▾ Raporu gizle' : '▸ Rapor (yöntem, varsayımlar, ağ, doğrulama)', 'fm-rep', S.showRep) + btn('⬇ Raporu indir (.txt)', 'fm-repdl') + btn('🗑 Sonucu sil', 'fm-rdel');
    if (S.showRep) h += `<pre style="flex:1 0 100%;white-space:pre-wrap;font-size:11.5px;background:#0b1220;padding:8px;border-radius:8px;max-height:320px;overflow:auto">${esc(report(rec))}</pre>`;
    return h;
  }
  function report(rec) {
    const A = X.ANALYSES[rec.type], sm = rec.summary, L = [];
    L.push('ÇİZİM ATÖLYESİ — ' + A.name.toUpperCase() + ' RAPORU', new Date(rec.at).toLocaleString('tr-TR'), '');
    L.push('DURUM: ' + (rec.key === keyOf(rec.type) ? 'girdiler değişmedi (geçerli)' : 'ESKİ — girdiler değişti'));
    L.push('', 'FİZİKSEL MODEL: ' + A.physics, 'SAYISAL YÖNTEM: ' + A.method, 'ÇIKTILAR: ' + A.outputs, 'BAĞLANTI: ' + X.BOND_NOTE, '');
    L.push('AĞ: ' + rec.mesh.ne + ' eleman, ' + rec.mesh.nn + ' düğüm, eleman boyu ' + rec.mesh.h.toFixed(3) + ' mm, yoğunluk "' + rec.density + '"');
    for (const p of rec.mesh.parts) L.push('  ' + p.name + ': ' + p.cells + ' eleman, hacim hatası %' + (p.err * 100).toFixed(2));
    L.push('', 'MALZEMELER (değer / durum / kaynak):');
    for (const m of rec.mats) { L.push('  ' + m.name); for (const [k, [v, st, src]] of Object.entries(m.props)) L.push('    ' + k + ' = ' + v + ' ' + (X.PROP_DEFS.find((d) => d[0] === k) || ['', '', ''])[2] + ' [' + st + '] ' + src); }
    L.push('', 'SINIR KOŞULLARI (iç birimler mm, N, MPa, °C, W): ' + JSON.stringify(rec.setup));
    L.push('', 'SONUÇLAR (iç birimler): ' + JSON.stringify(sm, (k, v) => (typeof v === 'number' ? +v.toPrecision(6) : v)));
    L.push('', 'UYARILAR:'); for (const w of rec.warn) L.push('  - ' + w.t); if (!rec.warn.length) L.push('  yok');
    L.push('', 'DOĞRULAMA (analitik referans problemleri, tests/fea2.test.mjs, bu sürümde ölçülen bağıl hata):'); for (const [n, e] of VALIDATION) L.push('  ' + n + ': ' + e);
    L.push('', 'VARSAYIMLAR VE SINIRLAR:', '  - Doğrusal analiz: akmayı aşan bölgelerde sonuç geçersiz; doğrusal olmayan analiz ve temas yok.', '  - Voksel ağ: eğri yüzeyler basamaklı; yüzey gerilmeleri ve keskin köşe / mesnet / nokta yük çevresi yaklaşık (tekil olabilir).', '  - Malzeme değerleri "tipik" ise belirli parti için doğrulanmamıştır.', '  - Bu rapor mühendislik onayı yerine geçmez; kritik parçalar yetkin mühendis tarafından doğrulanmalıdır.');
    return L.join('\n');
  }

  // ---- olaylar ----
  function addBC(kind) {
    const o = D(), f = { face: '+y' };
    if (kind === 'ms') o.mech.supports.push({ face: '-y' });
    if (kind === 'mf') o.mech.loads.push({ ...f, type: 'force', F: 1000, dir: '-y' });
    if (kind === 'mp') o.mech.loads.push({ ...f, type: 'pressure', pv: 1 });
    if (kind === 'mm') o.mech.loads.push({ face: '+x', type: 'moment', M: [0, 0, 1e5] });
    if (kind === 'tf') o.therm.fixed.push({ face: '-y', T: 100 });
    if (kind === 'tq') o.therm.flux.push({ ...f, q: 1e-3 });
    if (kind === 'tc') o.therm.conv.push({ ...f, h: 10e-6, Tinf: 20 });
    save();
  }
  function listOf(k) { const o = D(); return { ms: o.mech.supports, ml: o.mech.loads, tf: o.therm.fixed, tq: o.therm.flux, tc: o.therm.conv }[k]; }
  function act(a) {
    if (!a.startsWith('fm-')) return false;
    if (S.busy) return true;
    let m;
    if ((m = a.match(/^fm-type-(\w+)$/))) { D().type = m[1]; save(); render(); return true; }
    if ((m = a.match(/^fm-units-(\w+)$/))) { D().units = m[1]; save(); draw(); render(); return true; }
    if ((m = a.match(/^fm-dens-(\w+)$/))) { D().density = m[1]; save(); render(); return true; }
    if ((m = a.match(/^fm-add-(\w+)$/))) { addBC(m[1]); render(); return true; }
    if ((m = a.match(/^fm-del-(\w+)-(\d+)$/))) { listOf(m[1]).splice(+m[2], 1); save(); render(); return true; }
    if (a === 'fm-grav') { D().mech.gravity = !D().mech.gravity; save(); render(); return true; }
    if (a === 'fm-solve') { solve(D().type); return true; }
    if (a === 'fm-mesh') { meshOnly(); return true; }
    if (a === 'fm-conv') { conv(); return true; }
    if ((m = a.match(/^fm-res-(\w+)$/))) { S.sel = m[1]; S.field = null; S.mode = 0; S.frame = 0; const live = S.live.get(m[1]); if (live) { S.view = live; enter(); draw(); } render(); return true; }
    if ((m = a.match(/^fm-field-(\w+)$/))) { S.field = m[1]; draw(); render(); return true; }
    if ((m = a.match(/^fm-mode-(\d+)$/))) { S.mode = +m[1]; draw(); render(); return true; }
    if ((m = a.match(/^fm-defo-(\w+)$/))) { S.defo = m[1]; draw(); render(); return true; }
    if (a === 'fm-rep') { S.showRep = !S.showRep; render(); return true; }
    if (a === 'fm-repdl') { const rec = D().results.find((r) => r.id === S.sel); if (rec) api.saveText(report(rec), api.name() + '_' + rec.type + '_rapor.txt'); return true; }
    if (a === 'fm-rdel') { const o = D(); o.results = o.results.filter((r) => r.id !== S.sel); S.live.delete(S.sel); S.sel = null; save(); render(); return true; }
    if (a === 'fm-resolve') { const rec = D().results.find((r) => r.id === S.sel); if (rec) { D().type = rec.type; solve(rec.type); } return true; }
    if (a === 'fm-matnew') { S.matEdit = { name: 'Özel malzeme' }; render(); return true; }
    if (a === 'fm-matcancel') { S.matEdit = null; render(); return true; }
    if (a === 'fm-matsave') {
      const e = S.matEdit, m = X.customMaterial('u' + Date.now().toString(36), e.name || 'Özel', e), v = X.validateMaterial(m);
      if (v.length) { api.toast(v[0]); return true; }
      D().custom.push(m); save(); S.matEdit = null; render(); return true;
    }
    return true;
  }
  async function meshOnly() {
    const { items, mats } = inputs(D().type);
    if (!items.length) { S.err = 'Görünür katı parça yok.'; render(); return; }
    S.busy = 'Ağ oluşturuluyor'; S.err = null; render();
    try { const r = await client.call('run', { type: 'mesh', items, mats: mats.map(X.solverMat), target: X.DENSITY[D().density][0] }, prog); if (r.error) S.err = '⛔ ' + r.text; S.view = r; S.sel = null; enter(); draw(); }
    catch (e) { S.err = e.message; } finally { S.busy = null; render(); }
  }
  async function conv() {
    const t = D().type;
    if (t === 'thermalT') { S.err = 'Ağ yakınsama çalışması zamana bağlı analiz için yok (zaman adımı ayrıca etkiler).'; render(); return; }
    const errs = check(t); if (errs.length) { S.err = 'Çözülemez: ' + errs.join(' '); render(); return; }
    const { items, mats, setup } = inputs(t);
    S.busy = 'Yakınsama çalışması'; S.err = null; S.conv = null; render();
    try { S.conv = await client.call('conv', { type: t, items, mats: mats.map(X.solverMat), target: X.DENSITY[D().density][0], setup, modes: t === 'buckling' ? D().mech.bmodes : D().mech.modes }, prog); }
    catch (e) { S.err = e.message; } finally { S.busy = null; render(); }
  }
  function input(el) {
    const k = el.dataset.fm, v = el.value, n = parseFloat(String(v).replace(',', '.')), o = D(), p = k.split('.');
    if (k === 'frame') { S.frame = +v; draw(); const L = document.querySelector('[data-fm="frame"]'); if (L && L.previousElementSibling) { const R = S.live.get(S.sel); if (R) L.previousElementSibling.textContent = 'Zaman: ' + nf(R.res.frames[S.frame].t) + ' s'; } return; }
    if (p[0] === 'mat') { o.mats[p[1]] = v; save(); render(); return; }
    if (p[0] === 'me') { S.matEdit[p[1]] = p[1] === 'name' ? v : (v === '' ? '' : n); return; }
    if (p[0] === 'tQ') { if (Number.isFinite(n)) o.therm.Q = inp('Q', n); }
    else if (p[0] === 'tT0') { if (Number.isFinite(n)) o.therm.T0 = inp('T', n); }
    else if (p[0] === 'tdur') { if (n > 0) o.therm.dur = n; }
    else if (p[0] === 'tdt') { if (n > 0) o.therm.dt = n; }
    else if (p[0] === 'mmodes') { if (n >= 1 && n <= 10) o.mech.modes = Math.round(n); }
    else if (p[0] === 'bmodes') { if (n >= 1 && n <= 6) o.mech.bmodes = Math.round(n); }
    else {
      const it = listOf(p[0])[+p[1]], f = p[2];
      if (!it) return;
      if (f === 'sel') { if (v === 'pt') { S.pick = { list: p[0], i: +p[1] }; if (!S.view) meshOnly(); render(); return; } delete it.p; delete it.r; it.face = v; }
      else if (f === 'dir') it.dir = v;
      else if (Number.isFinite(n)) {
        if (p[0] === 'tf' && f === 'T') it.T = inp('T', n);
        else if (p[0] === 'tq') it.q = inp('q', n);
        else if (p[0] === 'tc') it[f] = f === 'h' ? inp('h', n) : inp('T', n);
        else if (p[0] === 'ml') { if (f === 'F') it.F = Math.abs(inp('F', n)); else if (f === 'pv') it.pv = inp('P', n); else if (f.startsWith('M')) it.M[+f[1]] = inp('M', n); }
      }
    }
    save(); render();
  }
  function tap(p) {
    if (!S.pick) return;
    const it = listOf(S.pick.list)[S.pick.i];
    if (it) { delete it.face; it.p = p.map((x) => +x.toFixed(3)); it.r = Math.max(2, (S.view && S.view.mesh ? S.view.mesh.h * 1.5 : 3)); }
    S.pick = null; save(); api.toast('Nokta seçildi'); render();
  }
  return {
    html, act, input, tap, draw,
    exit() { exit(); },
    get active() { return S.lab; },
    get picking() { return !!S.pick; },
    invalidate() { /* sonuçlar anahtarla eskir; alanlar bellekte kalır */ },
  };
}
