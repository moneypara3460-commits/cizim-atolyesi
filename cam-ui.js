// CNC sekmesi: takımlar, işlemler, takım yolu hesabı, malzeme kaldırma simülasyonu, G-kodu ve iş kartı.
// api: { model() → { tris, holes, matId, name }, draw(spec), clear(), enter(), leave(), render(), toast(m), name(), saveBlob(b, n), snapshot(), date() }
import * as C from './cam.js?v=20261109k';
import { pdfFromJpegs } from './cutopt.js?v=20261109k';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 1) => (v == null || !isFinite(v) ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('tr-TR', { maximumFractionDigits: d }));
const fmin = (m) => (m < 1 ? Math.round(m * 60) + ' sn' : m < 60 ? Math.floor(m) + ' dk ' + Math.round((m % 1) * 60) + ' sn' : Math.floor(m / 60) + ' sa ' + Math.round(m % 60) + ' dk');
const KEY = 'cizim:cam';
const RESS = { kaba: [0.5, 'Kaba (0,5 mm)'], normal: [0.25, 'Normal (0,25 mm)'], ince: [0.12, 'İnce (0,12 mm)'] };

function defaults() {
  return {
    post: 'fanuc', mk: '', res: 'normal', zero: 'corner', stock: { side: 2, top: 1, bottom: 5 }, safe: 5,
    machine: { maxRpm: 24000, rapid: 5000, toolChange: 10 },
    tools: [
      { id: 1, n: 1, type: 'flat', d: 10, flutes: 3, flute: 30, rpm: 0, feed: 0, plunge: 0 },
      { id: 2, n: 2, type: 'flat', d: 6, flutes: 3, flute: 20, rpm: 0, feed: 0, plunge: 0 },
      { id: 3, n: 3, type: 'ball', d: 6, flutes: 2, flute: 20, rpm: 0, feed: 0, plunge: 0 },
    ],
    ops: [
      { type: 'face', on: true, tool: 1, stepover: 0.7, stepdown: 1 },
      { type: 'rough', on: true, tool: 1, stepdown: 3, stepover: 0.45, allowR: 0.3, allowZ: 0.2 },
      { type: 'walls', on: true, tool: 2, stepdown: 3 },
      { type: 'finish', on: false, tool: 3, stepoverMM: 0.5 },
      { type: 'drill', on: true, tool: 0 },
    ],
  };
}
function load() { try { const o = JSON.parse(localStorage.getItem(KEY) || 'null'); if (o && o.tools && o.ops) return { ...defaults(), ...o }; } catch (e) { /* */ } return defaults(); }

export function createCamUI(api) {
  let cfg = load();
  const S = { R: null, err: null, busy: null, view: 'paths', sim: null, simPlay: false, speed: 40, code: null, model: null, res: null };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) { /* */ } };
  const mk = () => cfg.mk || (S.model ? C.matKeyFor(S.model.matId) : 'celik');
  const fillCut = (t, force) => { if (force || !(t.rpm > 0) || !(t.feed > 0)) { const s = C.suggestCut(mk(), t, cfg.machine.maxRpm); t.rpm = s.rpm; t.feed = s.feed; t.plunge = s.plunge; } };
  const invalidate = () => { S.R = null; S.code = null; S.sim = null; S.simPlay = false; S.res = null; api.clear(); };

  /* ---------- hesap ---------- */
  async function compute() {
    let M;
    try { M = api.model(); } catch (e) { S.err = e.message; api.render(); return; }
    if (!M || !M.tris || M.tris.length < 9) { S.err = 'Önce bir model çiz.'; api.render(); return; }
    S.model = M;
    // delikler için matkap takımları (standart matkaba yuvarlanır)
    const drills = [...new Set(M.holes.filter((h) => h.d <= 13.01).map((h) => C.nearestDrill(h.d)))];
    for (const d of drills) if (!cfg.tools.some((t) => t.type === 'drill' && Math.abs(t.d - d) < 0.051)) { const id = Math.max(0, ...cfg.tools.map((t) => t.id)) + 1; cfg.tools.push({ id, n: Math.max(0, ...cfg.tools.map((t) => t.n)) + 1, type: 'drill', d, flutes: 2, flute: Math.max(30, d * 8), rpm: 0, feed: 0, plunge: 0 }); }
    for (const t of cfg.tools) fillCut(t);
    save();
    const tools = cfg.tools.map((t) => ({ ...t }));
    const ops = [];
    for (const o of cfg.ops) {
      if (o.type === 'drill') { if (o.on) for (const t of tools.filter((x) => x.type === 'drill')) ops.push({ type: 'drill', on: true, tool: t.id }); continue; }
      ops.push({ ...o, stepover: o.type === 'finish' ? (o.stepoverMM || 0.5) : o.stepover });
    }
    const job = { tris: M.tris, holes: M.holes, stock: cfg.stock, zero: cfg.zero, res: RESS[cfg.res][0], safe: cfg.safe, tools, ops, name: api.name(), rapid: cfg.machine.rapid, toolChange: cfg.machine.toolChange };
    S.busy = 'Takım yolları hesaplanıyor…'; S.err = null; api.render();
    await new Promise((r) => setTimeout(r, 30));
    try {
      const t0 = performance.now();
      S.R = C.plan(job); S.job = job; S.ms = performance.now() - t0;
      S.code = C.gcode(S.R, job, cfg.post, { date: api.date(), lineNumbers: cfg.post === 'fanuc' && cfg.lineNumbers });
      // tam simülasyon (kalan malzeme / dalma kontrolü)
      const SG = C.simGrid(S.R); C.simulate(S.R, SG, { op: 0, mv: 0 }); S.res = C.residual(S.R, SG, 0.1); S.finalSG = SG;
      S.sim = null; S.view = 'paths';
    } catch (e) { S.err = 'Hesaplanamadı: ' + e.message; S.R = null; }
    S.busy = null; draw(); api.render();
  }
  function draw() {
    if (!S.R) { api.clear(); return; }
    if (S.view === 'paths') api.draw({ mode: 'paths', R: S.R });
    else api.draw({ mode: 'sim', R: S.R, SG: S.sim ? S.sim.SG : S.finalSG, tool: S.sim ? S.sim.tool : null, pos: S.sim ? S.sim.st.prev : null, mark: !S.sim || S.sim.done ? S.res.mark : null });
  }
  function simStart() {
    if (!S.R) return;
    const SG = C.simGrid(S.R);
    S.sim = { SG, st: { op: 0, mv: 0 }, done: false, tool: S.R.ops[0] && S.R.ops[0].tool };
    S.view = 'sim'; S.simPlay = true; draw(); api.render();
  }
  function tick() {
    if (!S.simPlay || !S.sim) return;
    const done = C.simulate(S.R, S.sim.SG, S.sim.st, S.speed);
    const op = S.R.ops[Math.min(S.sim.st.op, S.R.ops.length - 1)]; S.sim.tool = op && op.tool;
    if (done) { S.sim.done = true; S.simPlay = false; api.render(); }
    draw();
  }

  /* ---------- panel ---------- */
  const btn = (l, a, on, st = '') => `<button data-act="${a}"${on ? ' class="on"' : ''}${st ? ' style="' + st + '"' : ''}>${l}</button>`;
  const note = (t) => `<div class="lbl" style="flex:1 0 100%;font-size:13px;line-height:1.4">${t}</div>`;
  const card = (inner, bc = '#1e293b') => `<div style="flex:1 0 100%;background:#111a2e;border:1px solid ${bc};border-radius:12px;padding:10px">${inner}</div>`;
  const row = (k, v, col) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid #1e293b;font-size:14px"><span style="color:#94a3b8">${k}</span><b style="text-align:right${col ? ';color:' + col : ''}">${v}</b></div>`;
  const num = (k, l, v, st = 'any', w = '1 1 30%') => `<label class="f" style="flex:${w}"><span>${l}</span><input type="number" inputmode="decimal" step="${st}" data-cn="${k}" value="${v ?? ''}"></label>`;
  function html() {
    let h = '<div class="lbl h">⚙ CNC freze — takım yolu ve G-kodu</div>';
    if (S.busy) return h + card('⏳ ' + esc(S.busy));
    if (S.err) h += `<div style="flex:1 0 100%;background:#3b0d0d;border:1px solid #7f1d1d;border-radius:12px;padding:10px;font-size:14px">⚠ ${esc(S.err)}</div>`;
    h += `<label class="f" style="flex:1 1 55%"><span>Kumanda (post-processor)</span><select data-cs="post">${Object.entries(C.POSTS).map(([k, v]) => `<option value="${k}"${cfg.post === k ? ' selected' : ''}>${v.name}</option>`).join('')}</select></label>`;
    h += `<label class="f" style="flex:1 1 40%"><span>İşlenen malzeme</span><select data-cs="mk"><option value=""${!cfg.mk ? ' selected' : ''}>Modelden (${esc(C.CUT_DATA[mk()].name)})</option>${Object.entries(C.CUT_DATA).map(([k, v]) => `<option value="${k}"${cfg.mk === k ? ' selected' : ''}>${v.name}</option>`).join('')}</select></label>`;
    h += '<div class="lbl h">Stok (ham parça) ve sıfır noktası</div>';
    h += num('stock.side', 'Yan pay (mm)', cfg.stock.side) + num('stock.top', 'Üst pay (mm)', cfg.stock.top) + num('stock.bottom', 'Alt bağlama payı (mm)', cfg.stock.bottom);
    if (S.R) { const s = S.R.P.stock; h += note('Stok: ' + nf(s.x1 - s.x0) + ' × ' + nf(s.y1 - s.y0) + ' × ' + nf(s.zTop - s.zBot) + ' mm (X × Y × Z). Mengeneye alt bağlama payından tutturulur; parça bu paydan ayrılmadan işlenir, sonra kesilip alınır.'); }
    h += `<div style="flex:1 0 100%;display:flex;gap:6px">${btn('Üst ön-sol köşe', 'cn-z-corner', cfg.zero === 'corner', 'flex:1;font-size:13px')}${btn('Üst yüz ortası', 'cn-z-center', cfg.zero === 'center', 'flex:1;font-size:13px')}${btn('Alt ön-sol köşe', 'cn-z-bottom', cfg.zero === 'bottom', 'flex:1;font-size:13px')}</div>`;
    h += note('Sıfır (G54) makinede stokta bu noktaya alınır. X sağa, Y makineden uzağa (çizimdeki arka yön), Z yukarı. Güvenli yükseklik: stok üstünden ' + cfg.safe + ' mm.');
    h += `<div style="flex:1 0 100%;display:flex;gap:6px">${Object.entries(RESS).map(([k, [, l]]) => btn(l, 'cn-r-' + k, cfg.res === k, 'flex:1;font-size:13px')).join('')}</div>`;
    h += note('Hesap hassasiyeti (yükseklik haritası adımı): duvarlara bu adımın yarısı kadar güvenli pay kalır; ince seçenek daha yavaş hesaplar.');
    // takımlar
    h += '<div class="lbl h">Takımlar</div>';
    for (const t of cfg.tools) {
      h += `<div style="flex:1 0 100%;background:#111a2e;border:1px solid #1e293b;border-radius:12px;padding:8px;display:flex;flex-wrap:wrap;gap:6px">` +
        `<div style="flex:1 0 100%;display:flex;justify-content:space-between;align-items:center"><b>T${t.n} · ${esc(C.TOOL_TYPES[t.type])} Ø${nf(t.d, 2)}</b><button data-act="cn-td-${t.id}" style="all:unset;cursor:pointer;color:#f87171;font-weight:700;padding:0 6px">✕</button></div>` +
        `<label class="f" style="flex:1 1 45%"><span>Tür</span><select data-ct="${t.id}.type">${Object.entries(C.TOOL_TYPES).map(([k, v]) => `<option value="${k}"${t.type === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>` +
        tnum(t, 'n', 'T no', 1) + tnum(t, 'd', 'Çap (mm)') + tnum(t, 'flutes', 'Ağız', 1) + tnum(t, 'flute', 'Kesme boyu') + tnum(t, 'rpm', 'Devir (d/dk)', 1) + tnum(t, 'feed', 'İlerleme (mm/dk)', 1) + tnum(t, 'plunge', 'Dalma (mm/dk)', 1) +
        btn('Önerilen kesme değerleri', 'cn-ts-' + t.id, false, 'flex:1 0 100%;font-size:13px') + '</div>';
    }
    h += btn('+ Takım ekle', 'cn-tadd', false, 'flex:1 0 100%');
    h += note('Önerilen değerler karbür takım için katalog başlangıç değerleridir (Vc, diş başı ilerleme); makinenin rijitliğine, takım boyuna ve bağlamaya göre ilk parçada düşük başla. Makine en yüksek devri: ' + cfg.machine.maxRpm + ' d/dk.');
    // işlemler
    h += '<div class="lbl h">İşlemler (sırayla)</div>';
    const topts = (sel, types) => cfg.tools.filter((t) => types.includes(t.type)).map((t) => `<option value="${t.id}"${sel === t.id ? ' selected' : ''}>T${t.n} ${C.TOOL_TYPES[t.type]} Ø${nf(t.d, 2)}</option>`).join('');
    cfg.ops.forEach((o, i) => {
      h += `<div style="flex:1 0 100%;background:${o.on ? '#0f2a1a' : '#111a2e'};border:1px solid ${o.on ? '#166534' : '#1e293b'};border-radius:12px;padding:8px;display:flex;flex-wrap:wrap;gap:6px">` +
        btn((o.on ? '☑ ' : '☐ ') + (i + 1) + '. ' + C.OP_NAMES[o.type], 'cn-op-' + i, o.on, 'flex:1 0 100%;text-align:left;font-weight:700');
      if (o.on && o.type !== 'drill') h += `<label class="f" style="flex:1 0 100%"><span>Takım</span><select data-co="${i}.tool">${topts(o.tool, o.type === 'finish' ? ['ball', 'flat'] : ['flat'])}</select></label>`;
      if (o.on && o.type === 'face') h += onum(i, 'stepdown', 'Paso derinliği (mm)', o.stepdown) + onum(i, 'stepover', 'Yan adım (× çap)', o.stepover);
      if (o.on && o.type === 'rough') h += onum(i, 'stepdown', 'Paso derinliği (mm)', o.stepdown) + onum(i, 'stepover', 'Yan adım (× çap)', o.stepover) + onum(i, 'allowR', 'Yan pay (mm)', o.allowR) + onum(i, 'allowZ', 'Taban payı (mm)', o.allowZ);
      if (o.on && o.type === 'walls') h += onum(i, 'stepdown', 'Paso derinliği (mm)', o.stepdown);
      if (o.on && o.type === 'finish') h += onum(i, 'stepoverMM', 'Yan adım (mm)', o.stepoverMM);
      if (o.on && o.type === 'drill') h += note('Modeldeki dik yuvarlak delikler (oyuk silindirler) standart matkapla delinir; derin delikte (> 3·Ø) gagalama (G83). Ø13 mm üstü kaba boşaltmayla açılır.');
      h += '</div>';
    });
    h += note('Kaba boşaltma Z seviyelerinde modelin etrafından içten dışa ofset konturlarla malzemeyi alır, yan / taban payı bırakır. Duvar ince işleme her seviyede payı sıfırla son konturu çeker. 3B ince işleme eğik ve kavisli yüzeyler içindir (küresel uç; yan adım küçüldükçe yüzey düzgünleşir, süre uzar).');
    h += `<button data-act="cn-go" style="flex:1 0 100%;font-size:17px;font-weight:800;padding:14px;background:#16a34a;color:#fff;border-color:#16a34a">▶ TAKIM YOLLARINI HESAPLA</button>`;
    if (!S.R) return h;
    // sonuç
    const R = S.R, st = R.stats, rs = S.res;
    h += '<div class="lbl h">Sonuç</div>';
    h += card(row('Tahmini işleme süresi', fmin(st.minutes)) + row('Kesme yolu / hızlı yol', nf(st.lFeed / 1000, 2) + ' m / ' + nf(st.lRapid / 1000, 2) + ' m') + row('İşlem / takım değişimi', R.ops.length + ' / ' + new Set(R.ops.map((o) => o.tool.n)).size) + row('G-kodu', S.code.split('\n').length.toLocaleString('tr-TR') + ' satır') +
      row('Kalan malzeme (simülasyon)', rs ? '%' + nf(rs.leftPct, 2) + (rs.leftMax > 0.1 ? ' · en fazla ' + nf(rs.leftMax, 2) + ' mm' : '') : '—', rs && rs.leftPct > 0.5 ? '#eab308' : '#22c55e') +
      row('Modele dalma (gouge)', rs ? (rs.gouge ? rs.gouge + ' nokta · ' + nf(rs.gougeMax, 2) + ' mm' : 'yok') : '—', rs && rs.gouge ? '#ef4444' : '#22c55e'));
    h += R.ops.map((o) => row(esc(o.name) + ' · T' + o.tool.n + ' Ø' + nf(o.tool.d, 2), o.moves.length.toLocaleString('tr-TR') + ' hareket' + (o.info.levels ? ' · ' + o.info.levels + ' seviye' : '') + (o.info.holes ? ' · ' + o.info.holes + ' delik' : ''))).join('');
    for (const w of R.warn) h += `<div style="flex:1 0 100%;background:${w.sev === 'crit' ? '#3b0d0d' : w.sev === 'warn' ? '#2a2108' : '#0f1d33'};border-radius:10px;padding:8px 10px;font-size:13.5px">${w.sev === 'crit' ? '🔴' : w.sev === 'warn' ? '🟠' : '💡'} ${esc(w.t)}</div>`;
    if (rs && rs.leftPct > 0.05) h += note('Kalan malzeme: düz uçlu frezenin giremediği iç köşeler (köşe yarıçapı = takım yarıçapı), paylar ve küresel uç izleri. Simülasyon görünümünde kırmızı işaretlidir. Daha küçük çaplı takımla ek bir duvar işlemi kalanı azaltır.');
    h += '<div class="lbl h">3B görünüm</div>';
    h += `<div style="flex:1 0 100%;display:flex;gap:6px">${btn('Takım yolları', 'cn-v-paths', S.view === 'paths', 'flex:1')}${btn('İşlenmiş parça', 'cn-v-final', S.view === 'sim' && !S.sim, 'flex:1')}${btn(S.sim && S.simPlay ? '⏸ Durdur' : S.sim && !S.sim.done ? '▶ Devam' : '▶ Simülasyon', 'cn-sim', !!S.simPlay, 'flex:1')}</div>`;
    if (S.sim) h += `<label class="f" style="flex:1 0 100%"><span>Simülasyon hızı: ${S.speed} hareket / kare</span><input type="range" min="1" max="400" step="1" data-cs="speed" value="${S.speed}"></label>` + note(S.sim.done ? 'Simülasyon bitti: kırmızı = kalan malzeme, mor = modele dalma (olmamalı).' : 'İşlem ' + (Math.min(S.sim.st.op + 1, R.ops.length)) + ' / ' + R.ops.length + ': ' + esc((R.ops[S.sim.st.op] || R.ops[R.ops.length - 1]).name));
    else h += note(S.view === 'paths' ? 'Mavi / yeşil / turuncu: kesme hareketleri (işleme göre), kırmızı: hızlı hareket, mor: delme. Döndür / yakınlaştır.' : 'Bütün işlemlerden sonra stok: gri işlenmiş yüzey, kırmızı kalan malzeme.');
    // G-kodu
    h += '<div class="lbl h">G-kodu</div>';
    h += `<pre style="flex:1 0 100%;max-height:220px;overflow:auto;background:#0b1220;border:1px solid #1e293b;border-radius:10px;padding:8px;font-size:11.5px;line-height:1.35;margin:0">${esc(S.code.split('\n').slice(0, 60).join('\n'))}${S.code.split('\n').length > 60 ? '\n…' : ''}</pre>`;
    h += btn((cfg.lineNumbers ? '☑' : '☐') + ' Satır numarası (N)', 'cn-ln', !!cfg.lineNumbers, 'flex:1 1 45%') + btn('⬇ G-kodunu indir (.' + C.POSTS[cfg.post].ext + ')', 'cn-dl', false, 'flex:1 1 50%;font-weight:700') + btn('📄 İş kartı (PDF)', 'cn-pdf', false, 'flex:1 0 100%');
    h += note('<b>USB belleğe aktarma:</b> Android\'de USB belleği OTG adaptörüyle tak, indirilen dosyayı Dosyalar uygulamasından USB\'ye kopyala. iPhone\'da Dosyalar uygulamasında "Paylaş → Dosyalara kaydet" ile USB sürücüyü seç. Makinede programı açmadan önce kumandada simülasyon / grafik kontrolü yap ve ilk çalıştırmada ilerleme hızını düşük tut (feed override).');
    h += note('⚠ Takım yolları modelin geometrisinden hesaplanır; bağlama aparatı (mengene, pabuç), takım tutucu ve makine sınırları bilinmez. İlk çalıştırmayı havada (Z yukarı kaydırılmış) ya da tek blok modunda yap. Yanlış sıfır / takım boyu en sık kaza sebebidir.');
    return h;
  }
  const tnum = (t, k, l, st = 'any') => `<label class="f" style="flex:1 1 30%"><span>${l}</span><input type="number" inputmode="decimal" step="${st}" data-ct="${t.id}.${k}" value="${t[k] ?? ''}"></label>`;
  const onum = (i, k, l, v) => `<label class="f" style="flex:1 1 45%"><span>${l}</span><input type="number" inputmode="decimal" step="any" data-co="${i}.${k}" value="${v ?? ''}"></label>`;

  function act(a) {
    if (!a.startsWith('cn-')) return false;
    if (S.busy) return true;
    if (a === 'cn-go') { compute(); return true; }
    let m = a.match(/^cn-z-(\w+)$/); if (m) { cfg.zero = m[1]; save(); if (S.R) recode(); api.render(); return true; }
    m = a.match(/^cn-r-(\w+)$/); if (m) { cfg.res = m[1]; save(); invalidate(); api.render(); return true; }
    m = a.match(/^cn-op-(\d+)$/); if (m) { const o = cfg.ops[+m[1]]; o.on = !o.on; save(); invalidate(); api.render(); return true; }
    m = a.match(/^cn-td-(\d+)$/); if (m) { if (cfg.tools.length <= 1) return true; cfg.tools = cfg.tools.filter((t) => t.id !== +m[1]); for (const o of cfg.ops) if (o.tool === +m[1]) o.tool = (cfg.tools.find((t) => t.type !== 'drill') || cfg.tools[0]).id; save(); invalidate(); api.render(); return true; }
    m = a.match(/^cn-ts-(\d+)$/); if (m) { const t = cfg.tools.find((x) => x.id === +m[1]); if (t) { fillCut(t, true); save(); invalidate(); api.render(); const s = C.suggestCut(mk(), t, cfg.machine.maxRpm); if (s.capped) api.toast('Devir makine sınırına göre kısıldı'); } return true; }
    if (a === 'cn-tadd') { const id = Math.max(0, ...cfg.tools.map((t) => t.id)) + 1; const t = { id, n: Math.max(0, ...cfg.tools.map((x) => x.n)) + 1, type: 'flat', d: 4, flutes: 2, flute: 12, rpm: 0, feed: 0, plunge: 0 }; fillCut(t, true); cfg.tools.push(t); save(); api.render(); return true; }
    if (a === 'cn-v-paths') { S.view = 'paths'; S.sim = null; S.simPlay = false; draw(); api.render(); return true; }
    if (a === 'cn-v-final') { S.view = 'sim'; S.sim = null; S.simPlay = false; draw(); api.render(); return true; }
    if (a === 'cn-sim') { if (!S.sim || S.sim.done) simStart(); else { S.simPlay = !S.simPlay; api.render(); } return true; }
    if (a === 'cn-ln') { cfg.lineNumbers = !cfg.lineNumbers; save(); recode(); api.render(); return true; }
    if (a === 'cn-dl') { download(); return true; }
    if (a === 'cn-pdf') { pdf(); return true; }
    return true;
  }
  function recode() { if (S.R) { S.R.P.zero = zeroOf(S.R.P.stock); S.code = C.gcode(S.R, { ...S.job, zero: cfg.zero }, cfg.post, { date: api.date(), lineNumbers: cfg.post === 'fanuc' && cfg.lineNumbers }); S.job.zero = cfg.zero; } }
  const zeroOf = (s) => (cfg.zero === 'center' ? [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2, s.zTop] : cfg.zero === 'bottom' ? [s.x0, s.y0, s.zBot] : [s.x0, s.y0, s.zTop]);
  function input(el, type) {
    const d = el.dataset, v = el.value, nv = parseFloat(String(v).replace(',', '.'));
    if (d.cs === 'speed') { S.speed = Math.max(1, +v || 1); if (type === 'change') api.render(); return; }
    if (d.cs) { cfg[d.cs] = v; save(); if (d.cs === 'post') recode(); if (d.cs === 'mk') { for (const t of cfg.tools) fillCut(t, true); invalidate(); } api.render(); return; }
    if (type !== 'change') return;
    if (d.cn) { const [a, b] = d.cn.split('.'); if (isFinite(nv) && nv >= 0) { cfg[a][b] = nv; save(); invalidate(); api.render(); } return; }
    if (d.ct) { const [id, k] = d.ct.split('.'), t = cfg.tools.find((x) => x.id === +id); if (!t) return; if (k === 'type') t.type = v; else if (isFinite(nv) && nv > 0) t[k] = k === 'n' || k === 'flutes' ? Math.round(nv) : nv; save(); invalidate(); api.render(); return; }
    if (d.co) { const [i, k] = d.co.split('.'), o = cfg.ops[+i]; if (!o) return; if (k === 'tool') o.tool = +v; else if (isFinite(nv) && nv > 0) o[k] = nv; save(); invalidate(); api.render(); }
  }
  function download() {
    if (!S.code) return;
    const name = String(api.name() || 'parca').replace(/[^\w\-]+/g, '_').slice(0, 40) || 'parca';
    api.saveBlob(new Blob([S.code.replace(/\n/g, cfg.post === 'grbl' ? '\n' : '\r\n')], { type: 'text/plain' }), name + '.' + C.POSTS[cfg.post].ext);
    api.toast('G-kodu indirildi: USB belleğe kopyalayıp makineye tak');
  }
  async function pdf() {
    if (!S.R) return;
    api.toast('İş kartı hazırlanıyor…');
    try {
      const keep = S.view; S.view = 'paths'; draw(); let shot = null; try { shot = api.snapshot(); } catch (e) { shot = null; } S.view = keep; draw();
      const pages = drawCard(S.R, cfg, api.name(), shot, S.res, S.code);
      const jp = [];
      for (const c of pages) { const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); jp.push({ jpeg: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height }); }
      api.saveBlob(new Blob([pdfFromJpegs(jp)], { type: 'application/pdf' }), String(api.name() || 'parca').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '-cnc-is-karti.pdf');
      api.toast('İş kartı indirildi');
    } catch (e) { api.toast('PDF oluşturulamadı: ' + e.message); }
  }
  return { html, act, input, tick, draw, get active() { return !!S.R; }, get playing() { return S.simPlay; }, get state() { return S; }, invalidate() { if (S.R) { invalidate(); } }, leave() { S.simPlay = false; api.clear(); } };
}

/* ---------- iş kartı (setup sheet) ---------- */
export function drawCard(R, cfg, title, shot, rs, code) {
  const W = 1240, H = 1754, M = 70, pages = [];
  let g, y;
  const newPage = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); pages.push(c); y = M; g.fillStyle = '#64748b'; g.font = '20px sans-serif'; g.textAlign = 'right'; g.fillText('Çizim Atölyesi · CNC iş kartı · sayfa ' + pages.length, W - M, H - 36); g.textAlign = 'left'; };
  const need = (h) => { if (y + h > H - 90) newPage(); };
  const font = (s, b) => { g.font = (b ? 'bold ' : '') + s + 'px sans-serif'; };
  const kv = (k, v, col = '#0f172a') => { need(40); font(22); g.fillStyle = '#334155'; g.fillText(String(k), M, y); font(22, true); g.fillStyle = col; g.textAlign = 'right'; g.fillText(String(v), W - M, y); g.textAlign = 'left'; g.strokeStyle = '#e2e8f0'; g.beginPath(); g.moveTo(M, y + 12); g.lineTo(W - M, y + 12); g.stroke(); y += 38; };
  const head = (t) => { y += 18; need(70); font(32, true); g.fillStyle = '#0f172a'; g.fillText(t, M, y); y += 42; };
  const wrap = (txt, size = 20, color = '#334155') => { font(size); g.fillStyle = color; const lh = size * 1.35; let line = ''; for (const w of String(txt).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > W - 2 * M && line) { need(lh); g.fillText(line, M, y); y += lh; line = w; } else line = t; } if (line) { need(lh); g.fillText(line, M, y); y += lh; } };
  const s = R.P.stock, st = R.stats;
  newPage();
  font(44, true); g.fillStyle = '#0f172a'; g.fillText('CNC İŞ KARTI', M, y + 30); y += 64;
  font(24); g.fillStyle = '#475569'; g.fillText(title + ' · ' + new Date().toLocaleString('tr-TR'), M, y); y += 46;
  kv('Kumanda / program', C.POSTS[cfg.post].name);
  kv('Stok (X × Y × Z)', nf(s.x1 - s.x0) + ' × ' + nf(s.y1 - s.y0) + ' × ' + nf(s.zTop - s.zBot) + ' mm');
  kv('Sıfır noktası (G54)', cfg.zero === 'center' ? 'stok üst yüz ortası' : cfg.zero === 'bottom' ? 'stok alt ön-sol köşe' : 'stok üst yüz ön-sol köşe');
  kv('Alt bağlama payı', nf(cfg.stock.bottom) + ' mm (mengeneye buradan tutturulur)');
  kv('Tahmini süre', fmin(st.minutes)); kv('G-kodu satırı', code.split('\n').length.toLocaleString('tr-TR'));
  if (rs) { kv('Kalan malzeme', '%' + nf(rs.leftPct, 2)); kv('Modele dalma', rs.gouge ? rs.gouge + ' nokta' : 'yok', rs.gouge ? '#991b1b' : '#166534'); }
  if (shot) { y += 10; const sw = W - 2 * M, sh = Math.min(520, sw * shot.height / shot.width); need(sh + 40); const k = Math.min(sw / shot.width, sh / shot.height); g.fillStyle = '#0b1220'; g.fillRect(M, y, sw, sh); g.drawImage(shot, M + (sw - shot.width * k) / 2, y + (sh - shot.height * k) / 2, shot.width * k, shot.height * k); y += sh + 30; }
  head('Takım listesi');
  const used = [...new Map(R.ops.map((o) => [o.tool.n, o.tool])).values()];
  for (const t of used) kv('T' + t.n + ' · ' + C.TOOL_TYPES[t.type] + ' Ø' + nf(t.d, 2) + ' · ' + (t.flutes || '-') + ' ağız · kesme boyu ' + nf(t.flute) + ' mm', 'S' + t.rpm + ' · F' + t.feed + ' · dalma F' + t.plunge);
  head('İşlem sırası');
  R.ops.forEach((o, i) => kv((i + 1) + '. ' + o.name + ' — T' + o.tool.n, o.moves.length + ' hareket' + (o.info.levels ? ' · ' + o.info.levels + ' seviye' : '') + (o.info.holes ? ' · ' + o.info.holes + ' delik' : '')));
  if (R.warn.length) { head('Uyarılar'); for (const w of R.warn) wrap('• ' + w.t, 20, w.sev === 'crit' ? '#991b1b' : '#b45309'); }
  head('Kontrol listesi');
  for (const t of ['Stoğu mengeneye alt bağlama payından sağlam bağla, paralel altlık kullan.', 'G54 sıfırını iş kartındaki noktaya al (kenar bulucu / prob).', 'Her takımın boyunu ölç (H / takım boyu tablosu).', 'Programı kumandada grafik simülasyonla kontrol et.', 'İlk çalıştırmada ilerleme düşük (feed override) ve tek blok; soğutma sıvısını kontrol et.', 'Kesme değerleri katalog başlangıç değeridir; titreşim / ses varsa düşür.']) wrap('☐ ' + t, 20, '#0f172a');
  y += 10; wrap('Takım yolları modelden otomatik hesaplanmıştır; bağlama aparatı, takım tutucu ve makine sınırları dikkate alınmamıştır. Sorumluluk operatöre aittir.', 18, '#991b1b');
  return pages;
}
