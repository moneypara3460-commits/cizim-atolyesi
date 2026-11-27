// ⚙ CNC sekmesinde 4 ve 5 eksen modu: makine / kinematik, bağlama, takımlar, işlem ağacı, hesap, simülasyon, G-kodu.
// Ayarlar projeyle birlikte kaydedilir (getCfg / setCfg). Hesap işçide (cam5-worker.js) yapılır.
// api: { model() → { tris }, draw(spec), clear(), render(), toast(m), name(), saveBlob(b, n), changed() }
import { MACHINES, DEFAULT_LIN, validateMachine } from './kin.js?v=20261112u';
import { STRATS, STRAT_LIMITS } from './cam5.js?v=20261127a';
import { POSTS5 } from './post5.js?v=20261127m';
import { COVERAGE } from './coll5.js?v=20261127a';

const V = '20261127a';
// Güvenli Kesim — değerli parça modu: güvenli mesafe en az 15 mm, kuru çalıştırma payı en az 10 mm, ilk geçişler ve riskli satırlar %50
const VAL = { safe: 15, dry: 10, f: 0.5 };
const CHECKS = [['zero', 'İş sıfırını (G54) ve döner eksenlerin 0° konumunu makinede kontrol ettim'], ['tool', 'Her takımın boyunu ölçüp boy tablosuna girdim; taşma boyları programdakiyle aynı'], ['clamp', 'Parça sağlam bağlı; bağlama döner eksenler dönerken hiçbir yere değmiyor'], ['dry', 'Kuru çalıştırma programını havada çalıştırdım, sorun görmedim']];
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 1) => (v == null || !isFinite(v) ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('tr-TR', { maximumFractionDigits: d }));
const clone = (o) => JSON.parse(JSON.stringify(o));
const KT = { '4ax': '4 eksen (döner eksen tablada)', '5ax-tt': 'Tabla-tabla', '5ax-hh': 'Kafa-kafa', '5ax-ht': 'Kafa-tabla' };

function defTools() {
  return [
    { id: 1, n: 1, type: 'flat', d: 6, flute: 20, stickout: 40, holder: { d: 30, len: 60 }, rpm: 8000, feed: 800, plunge: 250 },
    { id: 2, n: 2, type: 'ball', d: 6, flute: 20, stickout: 45, holder: { d: 30, len: 60 }, rpm: 9000, feed: 1000, plunge: 300 },
  ];
}
function defOps(mode) {
  return mode === '4'
    ? [{ type: 'index4', on: true, tool: 1, finishTool: 2, sub: ['rough', 'walls'], angles: [0, 90, 180, 270] }, { type: 'rotary4', on: false, tool: 1, finishTool: 2, sub: ['rough', 'finish'] }]
    : [{ type: 'p32', on: true, tool: 1, finishTool: 2, sub: ['rough', 'walls'], tilts: [[0, 0]] }, { type: 'sim5', on: true, tool: 2, lead: 10, tilt: 0, maxTilt: 50, orient: 'normal' }];
}
export function defaultCfg(mode = '3') {
  const m5 = mode === '5' ? 'tt_AC' : 'vmc4A';
  return { mode, mk: m5, machine: clone(MACHINES[m5]), setup: {}, tools: defTools(), ops: defOps(mode === '5' ? '5' : '4'), spindle: { d: 60, len: 100 }, post: mode === '5' ? 'fanuc_tcp' : 'fanuc4', safe: 5, clear: 3, valuable: false, slowRisk: false, dryClear: 10 };
}
// eğim/dönüş (derece) → takım yönü: dikeyden "eğim" kadar, X'ten "dönüş" yönünde
const dirOf = ([tilt, spin]) => { const t = tilt * Math.PI / 180, s = spin * Math.PI / 180; return [Math.sin(t) * Math.cos(s), Math.sin(t) * Math.sin(s), Math.cos(t)]; };

function createClient() {
  let w = null, seq = 0, inline = null;
  const pend = new Map();
  function start() {
    if (w || inline) return;
    try {
      w = new Worker(new URL('./cam5-worker.js?v=' + V, import.meta.url), { type: 'module' });
      w.onmessage = (e) => { const p = pend.get(e.data.id); if (!p) return; if (e.data.prog) { p.prog && p.prog(e.data.prog); return; } pend.delete(e.data.id); e.data.ok ? p.res(e.data.res) : p.rej(new Error(e.data.err)); };
      w.onerror = () => { const err = new Error('Hesap işçisi başlatılamadı'); for (const p of pend.values()) p.rej(err); pend.clear(); try { w.terminate(); } catch (x) { /* */ } w = null; inline = loadInline(); };
    } catch (e) { inline = loadInline(); }
  }
  function loadInline() {
    return Promise.all([import('./cam5.js?v=' + V), import('./coll5.js?v=' + V), import('./post5.js?v=' + V), import('./cam5-run.js?v=' + V), import('./guvenli5.js?v=' + V)]).then(([a, b, c, d, e]) => ({ a, b, c, d, e, last: null }));
  }
  async function call(op, args, prog) {
    start();
    if (inline) {
      const M = await inline;
      if (op === 'plan') { const r = M.d.runPlan(args.job, { ...M.a, ...M.b, ...M.c, ...M.e }, prog); M.last = r.keep; return r.out; }
      return M.d.runGcode(M.last, args, { ...M.c, ...M.e });
    }
    return new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej, prog }); w.postMessage({ id, op, args }); });
  }
  return { call };
}

export function createCam5UI(api) {
  let cfg = defaultCfg('3');
  const client = createClient();
  const S = { R: null, busy: null, err: null, view: 'path', i: 0, play: false, raf: 0, code: null, codeLv: null, stale: false, checks: {} };
  const dryClear = () => Math.max(cfg.dryClear || 10, cfg.valuable ? VAL.dry : 1);
  const blockReason = () => { if (!cfg.valuable || !S.R) return ''; const miss = CHECKS.filter(([k]) => !S.checks[k]); return miss.length ? 'Değerli parça modu: indirmeden önce kesim öncesi kontrol listesini işaretle (' + miss.length + ' eksik).' : ''; };
  const gopt = () => ({ date: new Date().toLocaleDateString('tr-TR'), slowRisk: !!cfg.slowRisk, ...(cfg.valuable ? { valuable: true, firstPass: VAL.f } : {}) });
  const changed = () => { S.R = null; S.code = null; S.codeLv = null; S.checks = {}; S.stale = true; api.clear(); api.changed && api.changed(); };
  const render = () => api.render();

  function job() {
    const m = { ...clone(cfg.machine), lin: cfg.machine.lin || DEFAULT_LIN };
    const ops = cfg.ops.map((o) => (o.type === 'p32' ? { ...o, dirs: (o.tilts || [[0, 0]]).map(dirOf) } : o));
    return { tris: api.model().tris, machine: m, setup: cfg.setup, tools: cfg.tools, ops, spindle: cfg.spindle, safe: cfg.valuable ? Math.max(cfg.safe, VAL.safe) : cfg.safe, clear: cfg.clear, name: api.name() };
  }
  async function compute() {
    if (S.busy) return;
    const errs = validateMachine({ ...cfg.machine, lin: cfg.machine.lin || DEFAULT_LIN });
    if (errs.length) { S.err = 'Makine ayarı hatalı: ' + errs.join('; '); render(); return; }
    let j; try { j = job(); } catch (e) { S.err = e.message; render(); return; }
    S.busy = 'Hesaplanıyor'; S.err = null; S.R = null; S.code = null; render();
    try {
      S.R = await client.call('plan', { job: j }, (p) => { S.busy = p.step + ' (%' + Math.round(p.f * 100) + ')'; render(); });
      S.stale = false; S.i = 0; S.view = 'path'; draw();
    } catch (e) { S.err = String(e.message || e); }
    S.busy = null; render();
  }
  function draw() {
    if (!S.R) { api.clear(); return; }
    const R = S.R, i = Math.min(S.i, R.kinds.length - 1), toolDef = cfg.tools.find((t) => t.id === R.tool[i]) || null;
    let pose = null;
    if (S.view === 'machine' && api.pose) { const a = R.ax, ax = { X: a[i * 6], Y: a[i * 6 + 1], Z: a[i * 6 + 2], A: a[i * 6 + 3], B: a[i * 6 + 4], C: a[i * 6 + 5] }; pose = api.pose(R.machine, ax); }
    api.draw({ view: S.view, R, i, pose, toolDef, spindle: cfg.spindle });
  }
  function stopPlay() { S.play = false; if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; }
  function playLoop() {
    if (!S.play || !S.R) return;
    const n = S.R.kinds.length, step = Math.max(1, Math.round(n / 600));
    S.i = Math.min(n - 1, S.i + step);
    draw(); updateReadout();
    if (S.i >= n - 1) { stopPlay(); render(); return; }
    S.raf = requestAnimationFrame(playLoop);
  }
  function readout() {
    if (!S.R) return '';
    const i = S.i, a = S.R.ax, n = S.R.kinds.length;
    const nm = ['X', 'Y', 'Z', 'A', 'B', 'C'], used = ['X', 'Y', 'Z', ...S.R.rot];
    const vals = used.map((k) => k + ' ' + nf(a[i * 6 + nm.indexOf(k)], 3)).join('  ');
    const f = S.R.flags[i];
    return `<b>${i + 1} / ${n}</b> · ${['hızlı', 'kesme', 'dalma'][S.R.kinds[i]]} · T${S.R.tool[i]}<br><span style="font-family:monospace">${vals}</span>` + (f & 1 ? ' <b style="color:#f87171">ÇARPIŞMA</b>' : '') + (f & 2 ? ' <b style="color:#f87171">LİMİT</b>' : '');
  }
  function updateReadout() { const el = document.getElementById('c5-ro'); if (el) el.innerHTML = readout(); const sl = document.querySelector('[data-c5="pos"]'); if (sl) sl.value = S.i; }

  // ---- arayüz ----
  const btn = (l, a, on, st = '') => `<button data-act="${a}"${on ? ' class="on"' : ''}${st ? ' style="' + st + '"' : ''}${S.busy ? ' disabled' : ''}>${l}</button>`;
  const num = (label, key, val, step = 'any') => `<label class="f"><span>${label}</span><input type="number" step="${step}" inputmode="decimal" data-c5="${key}" value="${val ?? ''}"></label>`;
  const lbl = (t, st = '') => `<div class="lbl" style="flex:1 0 100%;${st}">${t}</div>`;
  function modeBar() { return '<div class="lbl h">CNC çalışma modu</div>' + btn('3 eksen', 'c5-mode-3', cfg.mode === '3') + btn('4 eksen', 'c5-mode-4', cfg.mode === '4') + btn('5 eksen', 'c5-mode-5', cfg.mode === '5'); }
  function html() {
    let h = '';
    const m = cfg.machine, keys = Object.keys(MACHINES).filter((k) => (cfg.mode === '4' ? MACHINES[k].type === '4ax' : MACHINES[k].type.startsWith('5ax')));
    h += '<div class="lbl h">Makine ve kinematik</div>' +
      `<label class="f w2"><span>Makine</span><select data-c5="mk">${keys.map((k) => `<option value="${k}"${cfg.mk === k ? ' selected' : ''}>${esc(MACHINES[k].name)}</option>`).join('')}</select></label>` +
      lbl(`Tür: <b>${KT[m.type] || m.type}</b> · döner eksenler: ${m.rot.map((r) => `${r.name} (${r.head ? 'kafada' : m.type === '5ax-hh' ? 'kafada' : 'tablada'}, yön ${r.axis.join(' ')})`).join(', ')}`);
    m.rot.forEach((r, k) => {
      h += num(r.name + ' en az (°)', 'rmin.' + k, r.min) + num(r.name + ' en çok (°)', 'rmax.' + k, r.max);
      if (r.center && !r.head && m.type !== '5ax-hh') h += num(r.name + ' merkez X', 'rc.' + k + '.0', r.center[0]) + num(r.name + ' merkez Y', 'rc.' + k + '.1', r.center[1]) + num(r.name + ' merkez Z', 'rc.' + k + '.2', r.center[2]);
    });
    if (m.type === '5ax-hh' || m.type === '5ax-ht') h += num('Pivot boyu: uçtan dönme merkezine (mm)', 'pivot', m.pivot);
    const L = m.lin || DEFAULT_LIN;
    for (const k of ['X', 'Y', 'Z']) h += num(k + ' en az', 'lin.' + k + '.0', L[k][0]) + num(k + ' en çok', 'lin.' + k + '.1', L[k][1]);
    h += num('İş mili burnu çapı', 'sp.d', cfg.spindle.d) + num('İş mili burnu boyu', 'sp.len', cfg.spindle.len);
    h += lbl('Merkezler iş sıfırına göre (döner eksenler 0°\'deyken). Makinenizin gerçek ölçülerini girin; TCP\'siz kontrolcülerde G-kodu bu ölçülerle hesaplanır.', 'font-size:12px;color:#94a3b8');

    const st = cfg.setup;
    h += '<div class="lbl h">Bağlama ve ham parça</div>';
    if (m.type === '4ax' && m.mount === 'chuck') h += num('Ham çap payı (yarıçapta)', 'st.stockSide', st.stockSide ?? 2) + num('Aynada tutma boyu', 'st.grip', st.grip ?? 20) + num('Ayna yüzü – parça arası', 'st.gap', st.gap ?? 25) + num('Ayna çapı', 'st.chuckD', st.chuckD ?? 100) + num('Ayna boyu', 'st.chuckL', st.chuckL ?? 60) + btn('Punta: ' + (st.tail ? 'var' : 'yok'), 'c5-tail', !!st.tail) + lbl('Ham parça: silindir (A ekseninde). Parça ekseni dönme ekseninde, sol ucu X0.', 'font-size:12px;color:#94a3b8');
    else h += num('Yan pay', 'st.stockSide', st.stockSide ?? 2) + num('Üst pay', 'st.stockTop', st.stockTop ?? 1) + num('Alt pay (bağlama)', 'st.stockBottom', st.stockBottom ?? 5) + num('Mengene çene tutma yüksekliği', 'st.clampH', st.clampH ?? Math.max(1, (st.stockBottom ?? 5) - 2)) + num('Mengene yüksekliği', 'st.viseH', st.viseH ?? 40) + lbl('Ham parça: kutu. Parça tabanı Z0, ortası X0 Y0 (döner tabla merkezi).', 'font-size:12px;color:#94a3b8');

    h += '<div class="lbl h">Takımlar</div>';
    cfg.tools.forEach((t, k) => {
      h += `<label class="f"><span>T${t.n} türü</span><select data-c5="t.${k}.type"><option value="flat"${t.type === 'flat' ? ' selected' : ''}>Düz parmak</option><option value="ball"${t.type === 'ball' ? ' selected' : ''}>Küresel uç</option></select></label>` +
        num('T' + t.n + ' çap', 't.' + k + '.d', t.d) + num('Kesme boyu', 't.' + k + '.flute', t.flute) + num('Taşma (tutucudan)', 't.' + k + '.stickout', t.stickout) + num('Tutucu çapı', 't.' + k + '.hd', t.holder.d) + num('Tutucu boyu', 't.' + k + '.hl', t.holder.len) + num('Devir', 't.' + k + '.rpm', t.rpm) + num('İlerleme mm/dk', 't.' + k + '.feed', t.feed);
    });
    h += btn('+ Takım', 'c5-tadd') + (cfg.tools.length > 1 ? btn('− Son takım', 'c5-tdel') : '');

    const topt = (sel) => cfg.tools.map((t) => `<option value="${t.id}"${t.id === +sel ? ' selected' : ''}>T${t.n} Ø${t.d} ${t.type === 'ball' ? 'küresel' : 'düz'}</option>`).join('');
    h += '<div class="lbl h">İşlemler (operasyon ağacı)</div>';
    cfg.ops.forEach((o, k) => {
      const s = STRATS[o.type];
      h += `<div class="lbl" style="flex:1 0 100%;font-weight:600">${k + 1}. ${esc(s.name)} ${s.sim ? '· <span style="color:#fbbf24">eş zamanlı</span>' : '· konumlandırmalı'}</div>` + btn(o.on === false ? '○ Kapalı' : '● Açık', 'c5-on-' + k, o.on !== false) + btn('✕ Sil', 'c5-del-' + k);
      h += `<label class="f"><span>${o.type === 'sim5' ? 'Takım (küresel)' : 'Kaba / ana takım'}</span><select data-c5="o.${k}.tool">${topt(o.tool)}</select></label>`;
      if (o.type !== 'sim5') h += `<label class="f"><span>İnce takım</span><select data-c5="o.${k}.finishTool">${topt(o.finishTool ?? o.tool)}</select></label>`;
      if (o.type === 'index4') h += `<label class="f w2"><span>Açılar (°, virgülle)</span><input type="text" data-c5="o.${k}.angles" value="${esc((o.angles || []).join(', '))}"></label>`;
      if (o.type === 'p32') h += `<label class="f w2"><span>Yönler: eğim°/dönüş° (; ile)</span><input type="text" data-c5="o.${k}.tilts" value="${esc((o.tilts || []).map((x) => x.join('/')).join('; '))}"></label>` + num('En çok derinlik (0 = kesme boyu)', 'o.' + k + '.maxDepth', o.maxDepth || 0);
      if (o.type === 'index4' || o.type === 'p32') h += ['rough', 'walls', 'finish'].map((x) => btn((o.sub || []).includes(x) ? '☑ ' + { rough: 'Kaba', walls: 'Duvar / taban', finish: '3B ince' }[x] : '☐ ' + { rough: 'Kaba', walls: 'Duvar / taban', finish: '3B ince' }[x], 'c5-sub-' + k + '-' + x, (o.sub || []).includes(x))).join('');
      if (o.type === 'rotary4') h += ['rough', 'finish'].map((x) => btn(((o.sub || []).includes(x) ? '☑ ' : '☐ ') + (x === 'rough' ? 'Döner kaba' : 'Döner ince'), 'c5-sub-' + k + '-' + x, (o.sub || []).includes(x))).join('') + num('Kaba kademe (mm)', 'o.' + k + '.stepdown', o.stepdown || '') + num('İnce adım (mm)', 'o.' + k + '.finishStepover', o.finishStepover || '');
      if (o.type === 'sim5') h += num('Adım (mm)', 'o.' + k + '.stepover', o.stepover || '') + num('Lead° (ilerleme yönüne)', 'o.' + k + '.lead', o.lead ?? 10) + num('Tilt° (yana)', 'o.' + k + '.tilt', o.tilt ?? 0) + num('Dikeyden en çok eğim°', 'o.' + k + '.maxTilt', o.maxTilt ?? 50) +
        `<label class="f"><span>Takım yönü</span><select data-c5="o.${k}.orient"><option value="normal"${o.orient !== 'fixed' ? ' selected' : ''}>Yüzey normali + lead/tilt</option><option value="fixed"${o.orient === 'fixed' ? ' selected' : ''}>Dikeyden sabit lead/tilt</option></select></label>`;
      h += lbl('Sınır: ' + esc(STRAT_LIMITS[o.type]), 'font-size:12px;color:#94a3b8');
    });
    for (const [k, s] of Object.entries(STRATS)) if ((s.axes === 4) === (cfg.mode === '4')) h += btn('+ ' + s.name.split('(')[0].trim(), 'c5-add-' + k);

    h += '<div class="lbl h">Hesap</div>' + btn('▶ Takım yolu + çarpışma + simülasyon', 'c5-run', false, 'flex:1 0 100%');
    if (S.busy) h += lbl('⏳ ' + esc(S.busy), 'color:#fbbf24');
    if (S.err) h += lbl('⚠ ' + esc(S.err), 'color:#f87171');
    if (S.stale && !S.R && !S.busy) h += lbl('Ayar değişti: yeniden hesapla.', 'color:#94a3b8');
    const R = S.R;
    if (R) {
      const st2 = R.stats;
      h += lbl(`${R.passes.length} geçiş · ${R.kinds.length} nokta · ${R.simulMoves} eş zamanlı döner eksen hareketi · kesme ${nf(st2.lFeed / 1000, 2)} m · ~${nf(st2.minutes, 1)} dk`);
      for (const w of R.warn) h += lbl((w.sev === 'crit' ? '⛔ ' : w.sev === 'warn' ? '⚠ ' : 'ℹ ') + esc(w.t), 'font-size:13px;color:' + (w.sev === 'crit' ? '#f87171' : w.sev === 'warn' ? '#fbbf24' : '#cbd5e1'));
      h += '<div class="lbl h">Çarpışma ve limit kontrolü</div>';
      h += R.coll.safe ? lbl('✓ Modellenen bileşenlerde çarpışma ve eksen limiti ihlali bulunmadı.', 'color:#4ade80') : lbl(`⛔ ${R.coll.n} kayıt: ` + Object.entries(R.coll.groups).map(([k, n]) => esc(k) + ' (' + n + ')').join(', ') + '. G-kodu engellendi.', 'color:#f87171');
      h += lbl('Kontrol edilen: ' + COVERAGE.checked.join('; ') + '.', 'font-size:12px;color:#cbd5e1') + lbl('Kontrol EDİLMEYEN: ' + COVERAGE.notChecked.join('; ') + '.', 'font-size:12px;color:#fbbf24');
      h += '<div class="lbl h">Simülasyon</div>' +
        lbl(`Voksel ${nf(R.sim.h, 2)} mm · kaldırılan ${nf(R.sim.removedVol / 1000, 1)} cm³ · kalan fazla malzeme ${nf(R.sim.leftVol / 1000, 2)} cm³ (%${nf(R.sim.leftPct, 1)}, bağlama payı hariç) · parçaya dalma ${nf(R.sim.gougeVol / 1000, 3)} cm³`) +
        btn('Takım yolu', 'c5-v-path', S.view === 'path') + btn('Talaş sonucu', 'c5-v-stock', S.view === 'stock') + btn('Makine hareketi', 'c5-v-machine', S.view === 'machine') +
        btn(S.play ? '⏸ Dur' : '▶ Oynat', 'c5-play', S.play) + btn('⏮ Başa', 'c5-rew') +
        `<label class="f w2"><span>Konum</span><input type="range" min="0" max="${R.kinds.length - 1}" value="${S.i}" data-c5="pos"></label><div id="c5-ro" class="lbl" style="flex:1 0 100%">${readout()}</div>` +
        lbl('Renkler: gri = parça yüzeyi, turuncu = kalan fazla malzeme, kırmızı = parçaya dalma. Simülasyon fiziksel makine doğrulaması değildir.', 'font-size:12px;color:#94a3b8');
      h += '<div class="lbl h">G-kodu</div>' + `<label class="f w2"><span>Kontrolcü</span><select data-c5="post">${Object.entries(POSTS5).map(([k, p]) => `<option value="${k}"${cfg.post === k ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>`;
      const pe = R.posts[cfg.post] || [];
      h += lbl(esc(POSTS5[cfg.post].note), 'font-size:12px;color:#94a3b8');
      if (pe.length) h += pe.map((e) => lbl('⛔ ' + esc(e), 'color:#f87171;font-size:13px')).join('');
      // Güvenli Kesim
      h += '<div class="lbl h">🛡 Güvenli Kesim</div>';
      h += btn((cfg.valuable ? '☑' : '☐') + ' 💎 Değerli parça modu', 'c5-val', !!cfg.valuable, 'flex:1 0 100%;font-weight:700');
      if (cfg.valuable) h += lbl('<b>Değerli parça modu açık:</b> güvenli mesafe en az ' + VAL.safe + ' mm, kuru çalıştırma payı en az ' + VAL.dry + ' mm; her işlemin ilk geçişi ve bütün riskli (sarı) satırlar %50 ilerlemeyle; çarpışma varken ve kesim öncesi kontrol listesi işaretlenmeden G-kodu indirilmez. Program daha uzun sürer.', 'font-size:13px');
      if (R.risk) {
        const rc = R.risk.count;
        h += lbl(`Kırmızı (hata): <b style="color:${rc.red ? '#f87171' : '#4ade80'}">${rc.red} nokta</b> · Sarı (dikkat): <b style="color:${rc.yellow ? '#fbbf24' : '#4ade80'}">${rc.yellow} nokta</b> · Yeşil: ${rc.green.toLocaleString('tr-TR')} nokta`, 'font-size:14px');
        if (R.risk.list.length) h += `<div id="c5-risk" style="flex:1 0 100%;max-height:200px;overflow:auto;font-size:12.5px;line-height:1.4">${R.risk.list.slice(0, 40).map(([i, l, w]) => `<div style="border-left:4px solid ${l === 2 ? '#ef4444' : '#eab308'};padding:3px 8px;margin:3px 0;background:#0b1220;border-radius:6px"><b>Nokta ${i + 1}</b> (konum kaydırıcısında)<br>${esc(w)}</div>`).join('')}${R.risk.list.length > 40 ? `<div style="color:#94a3b8">… ${R.risk.count.red + R.risk.count.yellow - 40} nokta daha</div>` : ''}</div>`;
        h += cfg.valuable ? lbl('Değerli parça modunda riskli satırlarda ilerleme her zaman %50.', 'font-size:12px;color:#94a3b8') : btn((cfg.slowRisk ? '☑' : '☐') + ' Riskli (sarı) kesme satırlarında ilerlemeyi %50 düşür', 'c5-slow', !!cfg.slowRisk, 'flex:1 0 100%');
        h += lbl('Kırmızı: çarpışma ve eksen sınırı (G-kodu zaten engellenir). Sarı: takım değişiminden sonraki ilk yaklaşma (boy ofseti), tek harekette döner eksenin 15°\'den fazla dönmesi, eksen sınırına 2 mm / 2°\'den yakınlık. Makine gövdesi, kapak ve beşik gövdesi haritada yoktur; onlar için kuru çalıştırmayı kullan.', 'font-size:12px;color:#94a3b8');
      }
      if (cfg.valuable) { h += '<div class="lbl h">Kesim öncesi kontrol (değerli parça)</div>'; h += CHECKS.map(([k, t]) => btn((S.checks[k] ? '☑ ' : '☐ ') + t, 'c5-chk-' + k, !!S.checks[k], 'flex:1 0 100%;text-align:left;font-size:13.5px')).join(''); }
      const blocked = blockReason();
      if (blocked) h += lbl('⛔ ' + esc(blocked), 'color:#f87171;font-size:13px');
      h += btn('⬇ G-kodu indir', 'c5-gcode', false, pe.length || blocked ? 'opacity:.5' : '') + btn('👁 İlk satırlar', 'c5-peek');
      h += btn('🌬 Kuru çalıştırma programı (havada)', 'c5-dry', false, pe.length ? 'opacity:.5' : '') + num('Kuru çalıştırma payı (mm)', 'dryClear', dryClear());
      h += lbl('<b>Kuru çalıştırma:</b> aynı program, bütün yol her noktada kendi takım ekseni boyunca geri çekilmiş hâli. Takım ham parçanın en az ' + nf(dryClear(), 0) + ' mm uzağından geçer, hiçbir yere kesmez; soğutma kapalı. Kaydırılmış yol için kinematik ve çarpışma kontrolü yeniden yapılır: eksen sınırı aşılırsa ya da bir yere çarpıyorsa program verilmez.', 'font-size:12px;color:#94a3b8');
      if (S.code) { const COL = ['transparent', 'rgba(234,179,8,.18)', 'rgba(239,68,68,.28)']; h += `<pre id="c5-code" style="flex:1 0 100%;max-height:220px;overflow:auto;font-size:11px;background:#0b1220;padding:6px;border-radius:8px">${S.code.split('\n').map((l, i) => (S.codeLv && S.codeLv[i] ? `<span style="background:${COL[S.codeLv[i]]}">${esc(l)}</span>` : esc(l))).join('\n')}</pre>`; }
      h += lbl('⚠ Eksen yönleri, dönme merkezleri, takım boyları ve kontrolcü ayarları makinenizle karşılaştırılmalı; ilk çalıştırma kumanda simülasyonu, tek blok ve düşük ilerlemeyle, yetkin operatör kontrolünde yapılmalı.', 'color:#fbbf24;font-size:12px');
    }
    return h;
  }

  function setMode(md) {
    if (md === cfg.mode) return;
    const keepTools = cfg.tools, sp = cfg.spindle;
    if (md === '3') cfg.mode = '3';
    else { cfg = { ...defaultCfg(md), tools: keepTools, spindle: sp }; }
    stopPlay(); changed();
  }
  function act(a) {
    if (!a.startsWith('c5-')) return false;
    if (a.startsWith('c5-mode-')) { setMode(a.slice(8)); render(); return true; }
    if (S.busy) return true;
    if (a === 'c5-run') { stopPlay(); compute(); return true; }
    if (a === 'c5-tail') { cfg.setup.tail = !cfg.setup.tail; changed(); render(); return true; }
    if (a === 'c5-tadd') { const id = Math.max(...cfg.tools.map((t) => t.id)) + 1; cfg.tools.push({ ...clone(cfg.tools[cfg.tools.length - 1]), id, n: id }); changed(); render(); return true; }
    if (a === 'c5-tdel') { const t = cfg.tools.pop(); for (const o of cfg.ops) { if (o.tool === t.id) o.tool = cfg.tools[0].id; if (o.finishTool === t.id) o.finishTool = cfg.tools[0].id; } changed(); render(); return true; }
    let m;
    if ((m = a.match(/^c5-on-(\d+)$/))) { const o = cfg.ops[+m[1]]; o.on = o.on === false; changed(); render(); return true; }
    if ((m = a.match(/^c5-del-(\d+)$/))) { cfg.ops.splice(+m[1], 1); changed(); render(); return true; }
    if ((m = a.match(/^c5-sub-(\d+)-(\w+)$/))) { const o = cfg.ops[+m[1]], s = new Set(o.sub || []); s.has(m[2]) ? s.delete(m[2]) : s.add(m[2]); o.sub = [...s]; changed(); render(); return true; }
    if ((m = a.match(/^c5-add-(\w+)$/))) { const d = defOps(cfg.mode === '4' ? '4' : '5').find((o) => o.type === m[1]) || { type: m[1], tool: cfg.tools[0].id }; cfg.ops.push({ ...clone(d), on: true }); changed(); render(); return true; }
    if (a.startsWith('c5-v-')) { S.view = a.slice(5); draw(); render(); return true; }
    if (a === 'c5-play') { if (S.play) stopPlay(); else { if (S.R && S.i >= S.R.kinds.length - 1) S.i = 0; S.play = true; if (S.view === 'stock') S.view = 'path'; playLoop(); } render(); return true; }
    if (a === 'c5-rew') { stopPlay(); S.i = 0; draw(); render(); return true; }
    if (a === 'c5-val') { cfg.valuable = !cfg.valuable; changed(); render(); api.toast(cfg.valuable ? 'Değerli parça modu açık: takım yolunu yeniden hesapla' : 'Değerli parça modu kapalı'); return true; }
    if (a === 'c5-slow') { cfg.slowRisk = !cfg.slowRisk; S.code = null; api.changed && api.changed(); render(); return true; }
    if ((m = a.match(/^c5-chk-(\w+)$/))) { S.checks[m[1]] = !S.checks[m[1]]; render(); return true; }
    if (a === 'c5-dry') {
      const pe = S.R ? S.R.posts[cfg.post] : ['Önce hesapla'];
      if (pe && pe.length) { api.toast('Kuru çalıştırma engellendi: ' + pe[0]); return true; }
      S.busy = 'Kuru çalıştırma yolu denetleniyor'; render();
      client.call('gcode', { post: cfg.post, opt: { date: new Date().toLocaleDateString('tr-TR'), dryRun: { clear: dryClear() }, program: 5002 } }).then((r) => {
        api.saveBlob(new Blob([r.text], { type: 'text/plain' }), api.name() + '_' + cfg.post + '_KURU.' + POSTS5[cfg.post].ext);
        api.toast('Kuru çalıştırma programı indirildi: yol takım ekseni boyunca ' + nf(r.dry.d, 1) + ' mm geri çekildi');
      }).catch((e) => { S.err = e.message; api.toast(e.message); }).finally(() => { S.busy = null; render(); });
      return true;
    }
    if (a === 'c5-gcode' || a === 'c5-peek') {
      const pe = S.R ? S.R.posts[cfg.post] : ['Önce hesapla'];
      if (pe && pe.length && a === 'c5-gcode') { api.toast('G-kodu engellendi: ' + pe[0]); return true; }
      if (a === 'c5-gcode' && blockReason()) { api.toast(blockReason()); render(); return true; }
      S.busy = 'G-kodu yazılıyor'; render();
      client.call('gcode', { post: cfg.post, opt: { ...gopt(), allowUnsafe: a === 'c5-peek' } }).then((r) => {
        if (a === 'c5-peek') { const pre = pe.length ? ['(ÖNİZLEME — ÜRETİME UYGUN DEĞİL: ' + pe[0] + ')'] : []; S.code = pre.concat(r.text.split('\n').slice(0, 60)).join('\n'); S.codeLv = (pre.length ? [0] : []).concat(r.lv.slice(0, 60)); }
        else { api.saveBlob(new Blob([r.text], { type: 'text/plain' }), api.name() + '_' + cfg.post + '.' + POSTS5[cfg.post].ext); api.toast('G-kodu indirildi (doğrulanmamış program)'); }
      }).catch((e) => { S.err = e.message; }).finally(() => { S.busy = null; render(); });
      return true;
    }
    return true;
  }
  function input(el, type) {
    const k = el.dataset.c5, v = el.value, n = parseFloat(v);
    if (k === 'pos') { stopPlay(); S.i = Math.max(0, Math.min((S.R ? S.R.kinds.length : 1) - 1, +v | 0)); if (S.view === 'stock') S.view = 'path'; draw(); updateReadout(); return; }
    if (type === 'input' && el.tagName !== 'SELECT') return;   // sayılar değişince (change) uygula
    const p = k.split('.');
    if (k === 'mk') { cfg.mk = v; cfg.machine = clone(MACHINES[v]); }
    else if (k === 'post') { cfg.post = v; render(); return; }
    else if (k === 'dryClear') { if (n >= 1) cfg.dryClear = n; render(); return; }
    else if (k === 'pivot') { if (n > 0) cfg.machine.pivot = n; }
    else if (p[0] === 'rmin' || p[0] === 'rmax') { if (Number.isFinite(n)) cfg.machine.rot[+p[1]][p[0] === 'rmin' ? 'min' : 'max'] = n; }
    else if (p[0] === 'rc') { if (Number.isFinite(n)) cfg.machine.rot[+p[1]].center[+p[2]] = n; }
    else if (p[0] === 'lin') { cfg.machine.lin = clone(cfg.machine.lin || DEFAULT_LIN); if (Number.isFinite(n)) cfg.machine.lin[p[1]][+p[2]] = n; }
    else if (p[0] === 'sp') { if (n > 0) cfg.spindle[p[1]] = n; }
    else if (p[0] === 'st') { if (Number.isFinite(n) && n >= 0) cfg.setup[p[1]] = n; }
    else if (p[0] === 't') { const t = cfg.tools[+p[1]]; if (p[2] === 'type') t.type = v; else if (p[2] === 'hd') { if (n > 0) t.holder.d = n; } else if (p[2] === 'hl') { if (n > 0) t.holder.len = n; } else if (n > 0) t[p[2]] = n; }
    else if (p[0] === 'o') {
      const o = cfg.ops[+p[1]], f = p[2];
      if (f === 'tool' || f === 'finishTool') o[f] = +v;
      else if (f === 'angles') o.angles = v.split(/[,;\s]+/).map(Number).filter(Number.isFinite);
      else if (f === 'tilts') o.tilts = v.split(';').map((s) => s.split('/').map(Number)).filter((x) => x.length === 2 && x.every(Number.isFinite));
      else if (f === 'orient') o.orient = v;
      else if (Number.isFinite(n)) o[f] = n;
    }
    changed(); render();
  }
  return {
    html, modeBar, act, input,
    get mode() { return cfg.mode; },
    getCfg: () => clone(cfg),
    setCfg(c) { stopPlay(); S.R = null; S.code = null; cfg = c && c.mode ? { ...defaultCfg(c.mode), ...clone(c) } : defaultCfg('3'); api.clear(); },
    leave() { stopPlay(); api.clear(); },
    invalidate() { if (S.R) { stopPlay(); S.R = null; S.code = null; S.stale = true; api.clear(); } },
    get active() { return !!S.R; },
  };
}
