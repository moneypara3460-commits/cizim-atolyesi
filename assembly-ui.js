// Akıllı Otomatik Montaj Sırası ve 3B Patlatılmış Görünüm — "Montaj planı" sekmesi arayüzü.
// api: { model() → analyzeAssembly girdisi, size() → model köşegeni (mm), getAnswers(), setAnswers(o), enter(res), leave(),
//        apply(stateMap, selId), focus(ids), render(), toast(m), name(), snapshot()? }
import { analyzeAssembly, explodeOffsets, animState } from './assembly.js?v=20261111b';
import { pdfFromJpegs } from './cutopt.js?v=20261111b';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f0 = (v) => Math.round(v).toLocaleString('tr-TR');
const f1 = (v) => (Math.round(v * 10) / 10).toLocaleString('tr-TR');
const CONF = { isim: 'parça adından', 'ölçü': 'ölçüden (standart tablo)', 'şekil': 'şekilden (tahmin)', 'tür': 'parça türünden' };
const ST_COL = { mevcut: '#22c55e', 'EKSİK': '#f97316', 'ölçü belirlenemedi': '#eab308', 'bağlantı belirsiz': '#94a3b8' };
const STEP_MS = 1400, HOLD_MS = 600;

export function createAssemblyUI(api) {
  const S = { res: null, err: null, view: false, mode: 'step', k: 0, t: 1, playing: false, explode: 0.6, sel: null, open: {}, last: 0, hold: 0 };
  let offs = null;

  function run() {
    let model;
    try { model = api.model(); } catch (e) { S.err = e.message; S.res = null; return; }
    if (!model.parts.filter((q) => q.op !== 'sub').length) { S.err = 'Önce bir model olmalı (görünür katı parça yok).'; S.res = null; return; }
    try { S.res = analyzeAssembly(model, { answers: api.getAnswers() }); S.err = null; } catch (e) { S.err = 'Montaj analizi yapılamadı: ' + e.message; S.res = null; return; }
    offs = explodeOffsets(S.res, api.size(), 1);
    if (S.k >= S.res.steps.length) S.k = 0;
  }
  function stateMap() {
    const R = S.res; if (!R) return new Map();
    if (S.mode === 'explode') { const m = new Map(); for (const s of R.steps) for (const id of s.ids) { const o = offs.get(id) || [0, 0, 0]; m.set(id, { off: o.map((v) => v * S.explode), mode: 'placed' }); } return m; }
    return animState(R, offs, S.k, S.t);
  }
  const push = () => { if (S.view && S.res) api.apply(stateMap(), S.sel); };
  function start() {
    run();
    if (!S.res) { api.render(); return; }
    S.view = true; S.mode = 'step'; S.k = 0; S.t = 1; S.playing = false; S.sel = null;
    api.enter(S.res); push(); api.render();
    if (S.res.questions.length) api.toast(S.res.questions.length + ' bağlantı için bilgi gerekiyor (aşağıda)');
  }
  function stop() { S.view = false; S.playing = false; api.leave(); }
  // animasyon: her kare çağrılır (app döngüsü)
  function tick(now) {
    if (!S.view || !S.playing || !S.res) { S.last = now; return; }
    const dt = Math.min(100, now - (S.last || now)); S.last = now;
    if (S.hold > 0) { S.hold -= dt; if (S.hold <= 0) { if (S.k + 1 < S.res.steps.length) { S.k++; S.t = 0; api.render(); } else { S.playing = false; api.render(); } } push(); return; }
    S.t = Math.min(1, S.t + dt / STEP_MS);
    if (S.t >= 1) S.hold = HOLD_MS;
    push();
  }
  function go(k, animate) { if (!S.res) return; S.mode = 'step'; S.k = Math.max(0, Math.min(S.res.steps.length - 1, k)); S.t = animate ? 0 : 1; S.hold = 0; push(); api.render(); }

  /* ---------- panel ---------- */
  function html() {
    let h = '<div class="lbl h">Akıllı Montaj Sırası ve Patlatılmış Görünüm</div>';
    if (!S.view || !S.res) {
      if (S.err) h += note('⚠ ' + esc(S.err));
      h += `<button data-act="as-go" style="flex:1 0 100%;font-size:17px;font-weight:800;padding:14px;background:#16a34a;color:#fff;border-color:#16a34a">▶ MONTAJ SIRASINI BAŞLAT</button>`;
      h += note('Tek dokunuşla: parçalar tanınır (cıvata, somun, mil, rulman, flanş…), bağlantılar ve delikler bulunur, çarpışmasız montaj sırası çıkarılır, 3B patlatılmış görünüm ve adım adım animasyon açılır. Kaynak sekmesinde onaylanan kaynaklar birlikte hareket eden grup sayılır.');
      return h;
    }
    const R = S.res, st = R.steps[S.k];
    // seçili parça
    if (S.sel != null) h += partCard(S.sel);
    // görünüm
    h += `<div style="flex:1 0 100%;display:flex;gap:6px">${btn('🎬 Adım adım', 'as-mode-step', S.mode === 'step', 'flex:1')}${btn('💥 Patlatılmış', 'as-mode-exp', S.mode === 'explode', 'flex:1')}${btn('✕ Kapat', 'as-close', false, 'flex:0 0 auto')}</div>`;
    if (S.mode === 'explode') {
      h += `<label class="f" style="flex:1 0 100%"><span>Patlatma miktarı: %${Math.round(S.explode * 100)}</span><input type="range" min="0" max="100" step="1" data-as="explode" value="${Math.round(S.explode * 100)}"></label>`;
      h += note('Her parça kendi takılma ekseni boyunca, gerçek konumundan uzaklaşır; yönü değişmez. Parmakla döndür / yakınlaştır, parçaya dokun: bilgisi açılır.');
    } else {
      h += `<div style="flex:1 0 100%;display:flex;gap:6px">${btn('⏮', 'as-restart', false, 'flex:1;font-size:18px')}${btn('◀', 'as-prev', false, 'flex:1;font-size:18px')}${btn(S.playing ? '⏸' : '▶', 'as-play', S.playing, 'flex:1.4;font-size:18px')}${btn('▶▶', 'as-next', false, 'flex:1;font-size:18px')}</div>`;
      h += card(`<div style="display:flex;justify-content:space-between;align-items:baseline"><b style="font-size:17px">Adım ${st.n} / ${R.steps.length}</b><span style="font-size:12.5px;color:#94a3b8">${st.base ? 'taban' : esc(st.insert || '')}</span></div>` +
        `<div style="font-size:14.5px;margin:6px 0">${esc(st.text)}</div>` +
        (st.fasten.length ? '<div style="font-size:13.5px;color:#fbbf24">🔩 Bu adımda sıkılacak: ' + st.fasten.map((F) => esc(F.holeName) + ' → ' + (F.bolt ? 'M' + F.bolt.m + '×' + F.bolt.len : '—') + ' (' + F.items.map((x) => x.n + '× ' + esc(x.what.replace(/ \(.*\)/, ''))).join(', ') + ')').join('; ') + '</div>' : '') +
        `<div style="height:6px;background:#1e293b;border-radius:3px;margin-top:8px"><div style="height:100%;width:${((S.k + S.t) / R.steps.length) * 100}%;background:#22c55e;border-radius:3px"></div></div>`);
      h += note('Turuncu: şu an takılan parça · gri: yerinde · soluk: henüz takılmamış (patlatılmış konumda). Parçaya dokun: bilgisi açılır.');
    }
    // sorular
    if (R.questions.length) {
      h += '<div class="lbl h" style="color:#fbbf24">❓ Bilgi gerekiyor (' + R.questions.length + ')</div>';
      R.questions.forEach((q, i) => {
        h += card(`<div style="font-size:14px;margin-bottom:6px">${esc(q.text)} Nasıl bağlı?</div><div style="display:flex;gap:6px;flex-wrap:wrap">` + q.options.map((o, j) => btn(esc(o), 'as-q-' + i + '-' + j, false, 'flex:1 1 40%')).join('') + '</div>');
      });
      h += note('Cevaplar projeye kaydedilir. "kaynak": iki parça tek grup olarak takılır; "cıvata" / "geçme": ayrı adımda; "yok": sadece değiyor, bağlantı yok. Bilinmeyen bağlantı tahmin edilmez.');
    }
    // sorunlar
    const P = R.problems;
    h += '<div class="lbl h">Montaj kontrolü</div>';
    if (!P.length) h += card('<div style="color:#22c55e;font-weight:700">🟢 Çakışma, yön, erişim ya da sıra sorunu bulunmadı.</div>');
    else P.forEach((p, i) => { h += `<button data-act="as-pr-${i}" style="all:unset;box-sizing:border-box;flex:1 0 100%;background:#111a2e;border:1px solid ${p.sev === 'crit' ? '#7f1d1d' : '#78350f'};border-radius:12px;padding:10px;cursor:pointer"><b style="color:${p.sev === 'crit' ? '#f87171' : '#fbbf24'}">${p.sev === 'crit' ? '🔴' : '🟠'} ${esc(p.title)}</b><div style="font-size:13.5px;margin-top:4px">${esc(p.text)}</div></button>`; });
    // adımlar
    h += '<div class="lbl h">Montaj sırası (' + R.steps.length + ' adım)</div>';
    h += R.steps.map((s, i) => `<button data-act="as-st-${i}" style="all:unset;box-sizing:border-box;flex:1 0 100%;background:${i === S.k && S.mode === 'step' ? '#1e3a2a' : '#111a2e'};border:1px solid #1e293b;border-radius:10px;padding:8px 10px;cursor:pointer;font-size:14px"><b>${s.n}.</b> ${esc(s.text)}${s.fasten.length ? ' <span style="color:#fbbf24">· ' + s.fasten.length + ' cıvata</span>' : ''}</button>`).join('');
    // bağlantı elemanları
    h += '<div class="lbl h">Bağlantı elemanları</div>';
    if (R.bom.length) h += card(R.bom.map((b) => row(esc(b.what), b.need + ' adet' + (b.present ? ' · modelde ' + b.present : ''), b.present >= b.need ? '#22c55e' : '#f97316')).join(''));
    if (R.fasteners.length) h += card(R.fasteners.map((F) => row(esc(F.holeName) + ' · Ø' + f1(F.d) + ' · ' + esc(F.hostNames.join(' + ') || '—') + (F.hosts.length >= 2 ? ' · sıkma boyu ' + f1(F.grip) + ' mm' : ''), esc(F.status) + (F.bolt ? ' · M' + F.bolt.m + '×' + F.bolt.len : ''), ST_COL[F.status])).join('') +
      R.fasteners.filter((F) => F.note).map((F) => `<div style="font-size:12.5px;color:#94a3b8;margin-top:4px">${esc(F.holeName)}: ${esc(F.note)}</div>`).join(''));
    if (!R.fasteners.length) h += note('Modelde delik (oyuk silindir) yok; cıvatalı bağlantı bulunmadı.');
    if (R.recognizedFasteners.length) h += card('<div style="font-size:13px;color:#94a3b8;margin-bottom:4px">Modelde çizili bağlantı elemanı / rulman</div>' + R.recognizedFasteners.map((x) => row(esc(x.name), esc(x.kind) + (x.detail ? ' · ' + esc(x.detail) : ''))).join(''));
    h += note('Ölçüler ISO 273 geçiş deliği (orta seri) ve ISO 7089 / 4032 tablolarından; delik bu tabloda yoksa ölçü tahmin edilmez ("ölçü belirlenemedi"). Cıvata boyu = sıkma boyu + 2 rondela + somun + 2 diş payı, standart boya yuvarlanır.');
    // parçalar
    h += '<div class="lbl h">Parçalar (' + R.parts.length + ')</div>';
    h += R.parts.slice().sort((a, b) => a.step - b.step).map((p) => `<button data-act="as-p-${p.id}" style="all:unset;box-sizing:border-box;flex:1 0 100%;display:flex;justify-content:space-between;gap:8px;background:${S.sel === p.id ? '#3b2f0b' : '#111a2e'};border:1px solid #1e293b;border-radius:10px;padding:8px 10px;cursor:pointer;font-size:14px"><span><b>${esc(p.name)}</b><br><span style="font-size:12.5px;color:#94a3b8">${esc(p.kind)}${p.detail ? ' · ' + esc(p.detail) : ''} · ${esc(CONF[p.conf] || '')}</span></span><b>Adım ${p.step || '—'}</b></button>`).join('');
    h += btn('📄 PDF montaj raporu', 'as-pdf', false, 'flex:1 0 100%') + btn('↻ Yeniden analiz et', 'as-go', false, 'flex:1 0 100%');
    h += note('Montaj sırası gerçek geometriyle bulunur: her adımda parça altı ana yönden biriyle diğerlerine çarpmadan çıkabiliyor mu bakılır (sökme sırasının tersi = montaj sırası). Döndürerek takma, esnek parçalar ve takım/el boşluğu yaklaşık değerlendirilir; sonuç bir ön plandır, üretim öncesi kontrol edilmelidir.');
    return h;
  }
  function partCard(id) {
    const R = S.res, p = R.parts.find((x) => x.id === id);
    if (!p) return '';
    const b = p.box, conns = R.conns.filter((c) => c.a === id || c.b === id).map((c) => { const o = R.parts.find((x) => x.id === (c.a === id ? c.b : c.a)); return (o ? o.name : '#') + ' (' + c.kind + ')'; });
    const fs = R.fasteners.filter((F) => F.hosts.includes(id) || F.present.includes(id));
    const pr = R.problems.filter((x) => x.parts.includes(id));
    return `<div style="flex:1 0 100%;background:#2a2108;border:1px solid #a16207;border-radius:12px;padding:10px">` +
      `<div style="display:flex;justify-content:space-between;gap:8px"><b style="font-size:16px">${esc(p.name)}</b><button data-act="as-unsel" style="all:unset;cursor:pointer;color:#fbbf24;font-weight:700">✕</button></div>` +
      row('Tanıma', esc(p.kind) + (p.detail ? ' · ' + esc(p.detail) : '')) + row('Kaynak', esc(CONF[p.conf] || p.conf)) +
      row('Montaj adımı', p.step ? p.step + ' / ' + R.steps.length : '—') +
      (b ? row('Boyut (X × Z × Y)', f0(b.max[0] - b.min[0]) + ' × ' + f0(b.max[2] - b.min[2]) + ' × ' + f0(b.max[1] - b.min[1]) + ' mm') : '') +
      row('Hacim', f1(p.vol / 1000) + ' cm³') +
      (conns.length ? row('Bağlı olduğu', esc(conns.join(', '))) : '') +
      (fs.length ? row('Delik / cıvata', fs.map((F) => esc(F.holeName) + ' ' + esc(F.status)).join(', ')) : '') +
      pr.map((x) => `<div style="font-size:13px;color:${x.sev === 'crit' ? '#f87171' : '#fbbf24'};margin-top:4px">⚠ ${esc(x.title)}</div>`).join('') +
      (p.conf === 'şekil' ? '<div style="font-size:12.5px;color:#94a3b8;margin-top:4px">Tür şekilden tahmin edildi; parça adına "cıvata", "mil", "rulman"… yazarsan kesinleşir.</div>' : '') + '</div>';
  }
  const btn = (l, a, on, st = '') => `<button data-act="${a}"${on ? ' class="on"' : ''}${st ? ' style="' + st + '"' : ''}>${l}</button>`;
  const note = (t) => `<div class="lbl" style="flex:1 0 100%;font-size:13px;line-height:1.4">${t}</div>`;
  const card = (inner) => `<div style="flex:1 0 100%;background:#111a2e;border:1px solid #1e293b;border-radius:12px;padding:10px">${inner}</div>`;
  const row = (k, v, col) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid #1e293b;font-size:14px"><span style="color:#94a3b8">${k}</span><b style="text-align:right${col ? ';color:' + col : ''}">${v}</b></div>`;

  function act(a) {
    if (a === 'as-go') { start(); return true; }
    if (!S.res) return a.startsWith('as-');
    if (a === 'as-close') { stop(); api.render(); return true; }
    if (a === 'as-mode-step') { S.mode = 'step'; push(); api.render(); return true; }
    if (a === 'as-mode-exp') { S.mode = 'explode'; S.playing = false; push(); api.render(); return true; }
    if (a === 'as-play') { if (S.mode !== 'step') S.mode = 'step'; if (!S.playing && S.k >= S.res.steps.length - 1 && S.t >= 1) { S.k = 0; S.t = 0; } else if (!S.playing && S.t >= 1 && S.k + 1 < S.res.steps.length) { S.k++; S.t = 0; } S.playing = !S.playing; S.hold = 0; S.last = 0; push(); api.render(); return true; }
    if (a === 'as-next') { S.playing = false; if (S.k + 1 < S.res.steps.length) { go(S.k + 1, true); S.playing = true; S.oneShot = true; S.hold = 0; S.last = 0; } else go(S.k, false); return true; }
    if (a === 'as-prev') { S.playing = false; go(S.k - 1, false); return true; }
    if (a === 'as-restart') { S.playing = false; go(0, false); return true; }
    if (a === 'as-unsel') { S.sel = null; push(); api.render(); return true; }
    if (a === 'as-pdf') { exportPDF(); return true; }
    let m = a.match(/^as-st-(\d+)$/); if (m) { S.playing = false; go(+m[1], true); S.playing = true; S.oneShot = true; return true; }
    m = a.match(/^as-p-(\d+)$/); if (m) { select(+m[1], true); return true; }
    m = a.match(/^as-pr-(\d+)$/); if (m) { const p = S.res.problems[+m[1]]; if (p && p.parts.length) { S.sel = p.parts[0]; push(); api.focus(p.parts); api.render(); } return true; }
    m = a.match(/^as-q-(\d+)-(\d+)$/); if (m) { const q = S.res.questions[+m[1]]; if (q) { const A = { ...api.getAnswers(), [q.key]: q.options[+m[2]] }; api.setAnswers(A); const keep = S.mode; run(); S.mode = keep; api.enter(S.res); push(); api.toast('Kaydedildi: ' + q.options[+m[2]]); api.render(); } return true; }
    return false;
  }
  function input(el, type) {
    if (el.dataset.as === 'explode') { S.explode = Math.max(0, Math.min(1, (+el.value || 0) / 100)); push(); if (type === 'change') api.render(); else { const s = el.closest('label') && el.closest('label').querySelector('span'); if (s) s.textContent = 'Patlatma miktarı: %' + Math.round(S.explode * 100); } }
  }
  function select(id, focus) { if (!S.res) return; S.sel = S.sel === id && !focus ? null : id; push(); if (focus) api.focus([id]); api.render(); }

  // tek adım oynatma (sonraki / adıma dokunma): adım bitince durur
  const tick0 = tick;
  function tickWrap(now) {
    const k0 = S.k;
    tick0(now);
    if (S.oneShot && (S.hold > 0 || S.k !== k0)) { S.playing = false; S.oneShot = false; S.hold = 0; if (S.k !== k0) { S.k = k0; S.t = 1; push(); } api.render(); }
    else if (!S.playing) S.oneShot = false;
  }

  async function exportPDF() {
    if (!S.res) return;
    api.toast('PDF hazırlanıyor…');
    try {
      let shot = null;
      try { if (api.snapshot) { const keep = { mode: S.mode, ex: S.explode }; S.mode = 'explode'; S.explode = 1; push(); shot = api.snapshot(); S.mode = keep.mode; S.explode = keep.ex; push(); } } catch (e) { shot = null; }
      const pages = drawReport(S.res, api.name(), shot);
      const jp = [];
      for (const c of pages) { const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); jp.push({ jpeg: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height }); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([pdfFromJpegs(jp)], { type: 'application/pdf' }));
      a.download = String(api.name() || 'model').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '-montaj-raporu.pdf';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      api.toast('PDF montaj raporu indirildi (' + pages.length + ' sayfa)');
    } catch (e) { api.toast('PDF oluşturulamadı: ' + e.message); }
  }
  return {
    html, act, input, tick: tickWrap, select, stop, start,
    get active() { return S.view && !!S.res; }, get state() { return S; },
    invalidate() { if (S.view) { stop(); S.res = null; } },
  };
}

/* ---------- PDF ---------- */
export function drawReport(R, title, shot) {
  const W = 1240, H = 1754, M = 70, pages = [];
  let g, y;
  const newPage = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); pages.push(c); y = M; g.fillStyle = '#64748b'; g.font = '20px sans-serif'; g.textAlign = 'right'; g.fillText('Çizim Atölyesi · Montaj raporu · sayfa ' + pages.length, W - M, H - 36); g.textAlign = 'left'; };
  const need = (h) => { if (y + h > H - 90) newPage(); };
  const font = (s, b) => { g.font = (b ? 'bold ' : '') + s + 'px sans-serif'; };
  const wrap = (txt, x, maxW, size, color = '#0f172a', bold = false) => { font(size, bold); g.fillStyle = color; const lh = size * 1.35; let line = ''; for (const w of String(txt).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { need(lh); g.fillText(line, x, y); y += lh; line = w; } else line = t; } if (line) { need(lh); g.fillText(line, x, y); y += lh; } };
  const kv = (k, v, col = '#0f172a') => { need(40); font(22); g.fillStyle = '#334155'; let kk = String(k); while (g.measureText(kk).width > 760 && kk.length > 4) kk = kk.slice(0, -2); g.fillText(kk === String(k) ? kk : kk + '…', M, y); font(22, true); g.fillStyle = col; g.textAlign = 'right'; g.fillText(String(v), W - M, y); g.textAlign = 'left'; g.strokeStyle = '#e2e8f0'; g.beginPath(); g.moveTo(M, y + 12); g.lineTo(W - M, y + 12); g.stroke(); y += 38; };
  const head = (t) => { y += 18; need(70); font(32, true); g.fillStyle = '#0f172a'; g.fillText(t, M, y); y += 42; };
  newPage();
  font(46, true); g.fillStyle = '#0f172a'; g.fillText('MONTAJ RAPORU', M, y + 30); y += 70;
  font(24); g.fillStyle = '#475569'; g.fillText(title + ' · ' + new Date().toLocaleString('tr-TR'), M, y); y += 50;
  kv('Parça', R.parts.length); kv('Montaj adımı', R.steps.length); kv('Delik / cıvatalı bağlantı', R.fasteners.length);
  kv('Sorun', R.problems.length ? R.problems.length + ' (' + R.problems.filter((p) => p.sev === 'crit').length + ' kritik)' : 'yok', R.problems.length ? '#b45309' : '#166534');
  if (R.questions.length) kv('Cevap bekleyen bağlantı', R.questions.length, '#b45309');
  if (shot) { y += 14; const sw = W - 2 * M, sh = Math.min(560, sw * shot.height / shot.width); need(sh + 10); const k = Math.min(sw / shot.width, sh / shot.height); g.fillStyle = '#0b1220'; g.fillRect(M, y, sw, sh); g.drawImage(shot, M + (sw - shot.width * k) / 2, y + (sh - shot.height * k) / 2, shot.width * k, shot.height * k); y += sh + 30; wrap('Patlatılmış görünüm', M, W - 2 * M, 18, '#64748b'); }
  head('Montaj talimatı');
  for (const s of R.steps) {
    wrap(s.n + '. ' + s.text, M, W - 2 * M, 23, '#0f172a', true);
    for (const F of s.fasten) wrap('   • ' + F.holeName + ': ' + (F.bolt ? 'M' + F.bolt.m + '×' + F.bolt.len + ' — ' : '') + F.items.map((x) => x.n + '× ' + x.what).join(', ') + (F.status === 'EKSİK' ? ' (modelde yok, tedarik edilecek)' : ''), M, W - 2 * M, 20, '#334155');
    y += 6;
  }
  head('Parça listesi');
  font(19, true); g.fillStyle = '#475569'; const cols = [M, M + 470, M + 900]; ['Parça', 'Tanıma', 'Adım'].forEach((t, i) => g.fillText(t, cols[i], y)); y += 30;
  for (const p of R.parts.slice().sort((a, b) => a.step - b.step)) { need(32); font(19); g.fillStyle = '#0f172a'; g.fillText(String(p.name).slice(0, 38), cols[0], y); g.fillText(String(p.kind + (p.detail ? ' · ' + p.detail : '')).slice(0, 36), cols[1], y); g.fillText(String(p.step || '—'), cols[2], y); y += 30; }
  head('Bağlantı elemanları');
  if (R.bom.length) for (const b of R.bom) kv(b.what, b.need + ' adet' + (b.present ? ' (modelde ' + b.present + ')' : ''), b.present >= b.need ? '#166534' : '#b45309');
  else wrap('Standart ölçüsü belirlenen bağlantı elemanı yok.', M, W - 2 * M, 20, '#475569');
  for (const F of R.fasteners) kv(F.holeName + ' · Ø' + f1(F.d) + ' · ' + (F.hostNames.join(' + ') || '—'), F.status + (F.bolt ? ' · M' + F.bolt.m + '×' + F.bolt.len : ''), F.status === 'mevcut' ? '#166534' : '#b45309');
  if (R.problems.length) { head('Montaj sorunları'); for (const p of R.problems) wrap((p.sev === 'crit' ? '🔴 ' : '🟠 ') + p.title + ': ' + p.text, M, W - 2 * M, 21, p.sev === 'crit' ? '#991b1b' : '#b45309'); }
  if (R.questions.length) { head('Bilinmeyen bağlantılar'); for (const q of R.questions) wrap('? ' + q.text, M, W - 2 * M, 21, '#b45309'); }
  y += 10; wrap('Bu rapor geometriden çıkarılan bir ön montaj planıdır. Sıkma torkları, tolerans / geçme ölçüleri ve iş güvenliği ayrıca belirlenmelidir. Şekilden tanınan parça türleri tahmindir.', M, W - 2 * M, 19, '#991b1b');
  return pages;
}
