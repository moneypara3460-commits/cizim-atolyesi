// Akıllı Üretilebilirlik Kontrolü — "Üretim" sekmesinin arayüzü.
// app.js sekme gövdesini html() ile alır, data-act="mfg-..." düğmelerini act() ile buraya yollar.
// api: { getModel(), mark(issue|null), selectPart(id), render(), toast(m), name(), snapshot()?, openCutOpt() }
import { analyzeModel } from './mfgcheck.js?v=20261111e';
import { pdfFromJpegs } from './cutopt.js?v=20261111e';

const SEV = { crit: { dot: '🔴', name: 'KRİTİK', col: '#ef4444', bg: '#3b0d0d' }, warn: { dot: '🟠', name: 'UYARI', col: '#f59e0b', bg: '#3a2506' }, tip: { dot: '🟢', name: 'ÖNERİ', col: '#22c55e', bg: '#052e1a' } };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const keyOf = (x) => x.title + '|' + x.desc;

export function createMfg(api) {
  const S = { running: false, prog: 0, progText: '', result: null, filter: 'all', mode: 'auto', resolved: new Set(), active: null, at: null, err: '' };
  const counts = () => {
    const live = (S.result ? S.result.issues : []).filter((x) => !S.resolved.has(keyOf(x)));
    return { crit: live.filter((x) => x.sev === 'crit').length, warn: live.filter((x) => x.sev === 'warn').length, tip: live.filter((x) => x.sev === 'tip').length };
  };

  async function run() {
    if (S.running) return;
    let model;
    try { model = api.getModel(); } catch (e) { S.err = 'Model okunamadı: ' + e.message; api.render(); return; }
    if (!model || !model.parts.length) { S.err = 'Önce bir model olmalı (görünür parça yok).'; api.render(); return; }
    S.running = true; S.err = ''; S.prog = 0; S.progText = 'Başlıyor'; S.active = null; api.mark(null); api.render();
    const t0 = performance.now();
    try {
      S.result = await analyzeModel(model, {
        mode: S.mode,
        tick: () => new Promise((r) => setTimeout(r, 0)),
        onProgress: (f, txt) => {
          S.prog = f; S.progText = txt;
          const bar = document.getElementById('mfg-bar'), tx = document.getElementById('mfg-ptxt');
          if (bar) bar.style.width = Math.round(f * 100) + '%';
          if (tx) tx.textContent = txt + ' (%' + Math.round(f * 100) + ')';
        },
      });
      S.result.ms = Math.round(performance.now() - t0);
      S.ver = api.version ? api.version() : 0;
      S.at = new Date();
      // önceki analizde çözüldü işaretlenenler: hâlâ duruyorsa işaret kalsın
      const now = new Set(S.result.issues.map(keyOf));
      S.resolved = new Set([...S.resolved].filter((k) => now.has(k)));
    } catch (e) { S.err = 'Analiz yarıda kaldı: ' + (e && e.message ? e.message : e); }
    S.running = false;
    api.render();
  }

  function html() {
    let h = '<div class="lbl h">Akıllı Üretilebilirlik Kontrolü</div>';
    h += `<button data-act="mfg-run" class="on" style="flex:1 0 100%;font-size:16px;padding:14px;background:#15803d"${S.running ? ' disabled' : ''}>${S.running ? '⏳ Analiz ediliyor…' : S.result ? '🔄 Yeniden analiz et' : '🏭 ÜRETİMİ ANALİZ ET'}</button>`;
    h += btn('Parçalar: ' + (S.mode === 'auto' ? 'otomatik' : 'her parça ayrı'), 'mfg-mode', S.mode === 'separate') + btn('✂ Kesim optimizasyonu', 'mfg-cut');
    h += note(S.mode === 'auto' ? 'Otomatik: profil, sac, boru ve eşleşmeli / bağlı parçalar ayrı üretilir sayılır; iç içe basit parçalar (kutu, silindir…) uygulamada birleşip tek gövde olduğu için çakışma sayılmaz.' : 'Her parça ayrı: bütün iç içe geçmeler çakışma sayılır.');
    if (S.running) {
      h += `<div style="flex:1 0 100%;padding:4px 2px"><div style="height:10px;background:#1e293b;border-radius:6px;overflow:hidden"><div id="mfg-bar" style="height:100%;width:${Math.round(S.prog * 100)}%;background:#22c55e;transition:width .2s"></div></div>` +
        `<div id="mfg-ptxt" style="font-size:13px;color:#94a3b8;margin-top:5px">${esc(S.progText)} (%${Math.round(S.prog * 100)})</div></div>`;
      return h;
    }
    if (S.err) h += `<div style="flex:1 0 100%;color:#f87171;font-size:14px;padding:4px">⚠ ${esc(S.err)}</div>`;
    if (!S.result) return h + note('Model; çakışma, boşluk, montaj sırası, kaynak erişimi, delik / cıvata alanı ve profil ölçüleri açısından gerçek geometriyle incelenir. Sonuçlara dokununca kamera o bölgeye gider ve bölge kırmızıyla işaretlenir.');
    const R = S.result, c = counts();
    if (api.version && api.version() !== S.ver) h += `<div style="flex:1 0 100%;background:#3a2506;border:1px solid #b45309;border-radius:10px;padding:8px;font-size:13.5px;color:#fde68a">⚠ Model analizden sonra değişti; sonuçlar eski olabilir. Yeniden analiz et.</div>`;
    h += `<div style="flex:1 0 100%;background:#111a2e;border:1px solid #1e293b;border-radius:12px;padding:10px;margin-top:4px">` +
      `<div style="font-weight:800;font-size:15px;margin-bottom:6px">ÜRETİLEBİLİRLİK ANALİZİ</div>` +
      row('Kontrol edilen parça', R.partCount) + row('🔴 Kritik problem', c.crit) + row('🟠 Üretim uyarısı', c.warn) + row('🟢 İyileştirme önerisi', c.tip) +
      (S.resolved.size ? row('✓ Çözüldü işaretli', S.resolved.size) : '') +
      `<div style="font-size:14px;line-height:1.45;margin-top:8px;color:#e2e8f0">${esc(R.summary)}</div>` +
      `<div style="font-size:12px;color:#64748b;margin-top:6px">${S.at ? S.at.toLocaleTimeString('tr-TR') : ''} · ${R.ms} ms</div></div>`;
    h += btn('Tümü (' + R.issues.length + ')', 'mfg-f-all', S.filter === 'all') + btn('🔴 Kritik (' + c.crit + ')', 'mfg-f-crit', S.filter === 'crit') +
      btn('🟠 Uyarı (' + c.warn + ')', 'mfg-f-warn', S.filter === 'warn') + btn('🟢 Öneri (' + c.tip + ')', 'mfg-f-tip', S.filter === 'tip');
    const list = R.issues.filter((x) => S.filter === 'all' || x.sev === S.filter);
    if (!list.length) h += note(R.issues.length ? 'Bu filtrede sonuç yok.' : '✅ Kontrol edilen alanlarda problem bulunmadı. Aşağıda hangi kontrollerin yapıldığını görebilirsin.');
    for (const x of list) {
      const sv = SEV[x.sev], done = S.resolved.has(keyOf(x)), on = S.active === x.id;
      const names = (x.partNames || []).join(', ');
      h += `<div style="flex:1 0 100%;background:${on ? sv.bg : '#111a2e'};border:1px solid ${on ? sv.col : '#1e293b'};border-left:5px solid ${sv.col};border-radius:12px;padding:8px 10px;margin-top:6px;${done ? 'opacity:.5' : ''}">` +
        `<button data-act="mfg-show-${x.id}" style="all:unset;display:block;width:100%;cursor:pointer"><div style="font-size:11.5px;font-weight:800;color:${sv.col};letter-spacing:.04em">${sv.dot} ${sv.name} · ${esc(x.cat)}${done ? ' · ✓ ÇÖZÜLDÜ' : ''}</div>` +
        `<div style="font-weight:800;font-size:15px;margin:3px 0">${esc(x.title)}</div>` +
        (names ? `<div style="font-size:12.5px;color:#94a3b8;margin-bottom:4px">Parça: ${esc(names)}</div>` : '') +
        `<div style="font-size:14px;line-height:1.4;color:#e2e8f0">${esc(x.desc)}</div>` +
        `<div style="font-size:13.5px;line-height:1.4;color:#86efac;margin-top:5px">💡 ${esc(x.fix)}</div>` +
        (x.box ? `<div style="font-size:12px;color:#64748b;margin-top:4px">Konum: X ${f0((x.box.min[0] + x.box.max[0]) / 2)} · Y ${f0((x.box.min[1] + x.box.max[1]) / 2)} · Z ${f0((x.box.min[2] + x.box.max[2]) / 2)} mm</div>` : '') + '</button>' +
        `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">` +
        (x.box || (x.parts && x.parts.length) ? `<button data-act="mfg-show-${x.id}" style="flex:1 1 30%;min-width:90px;padding:9px 4px;font-size:13px">🎯 Göster</button>` : '') +
        (x.parts && x.parts.length ? `<button data-act="mfg-sel-${x.id}" style="flex:1 1 30%;min-width:90px;padding:9px 4px;font-size:13px">☝ Parçayı seç</button>` : '') +
        `<button data-act="mfg-done-${x.id}" style="flex:1 1 30%;min-width:90px;padding:9px 4px;font-size:13px${done ? ';background:#15803d' : ''}">${done ? '↺ Geri al' : '✓ Çözüldü'}</button></div></div>`;
    }
    h += '<div class="lbl h">Yapılan kontroller</div>';
    for (const cv of R.coverage) {
      const ic = cv.status === 'ok' ? '✅' : cv.status === 'partial' ? '⚠️' : '⏭';
      h += `<div style="flex:1 0 100%;font-size:13px;line-height:1.4;padding:5px 2px;border-top:1px solid #1e293b"><b>${ic} ${esc(cv.name)}</b>${cv.status === 'skip' ? ' <span style="color:#f59e0b">(yapılmadı)</span>' : cv.status === 'partial' ? ' <span style="color:#f59e0b">(kısmen)</span>' : ''}<br><span style="color:#94a3b8">${esc(cv.detail)}</span></div>`;
    }
    h += '<div class="lbl h">Rapor</div>' + btn('📄 PDF rapor', 'mfg-pdf') + btn('İşareti temizle', 'mfg-clear', false, S.active ? '' : 'disabled');
    return h;
  }
  const btn = (l, a, on, extra = '') => `<button data-act="${a}"${on ? ' class="on"' : ''} ${extra}>${l}</button>`;
  const note = (t) => `<div class="lbl" style="flex:1 0 100%;font-size:13px;line-height:1.4">${t}</div>`;
  const row = (k, v) => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-top:1px solid #1e293b;font-size:14px"><span style="color:#94a3b8">${k}</span><b>${v}</b></div>`;
  const f0 = (v) => String(Math.round(v));

  function act(a) {
    if (a === 'mfg-run') { run(); return true; }
    if (a === 'mfg-mode') { S.mode = S.mode === 'auto' ? 'separate' : 'auto'; api.render(); return true; }
    if (a === 'mfg-cut') { api.openCutOpt(); return true; }
    if (a.startsWith('mfg-f-')) { S.filter = a.slice(6); api.render(); return true; }
    if (a === 'mfg-clear') { S.active = null; api.mark(null); api.render(); return true; }
    if (a === 'mfg-pdf') { exportPDF(); return true; }
    const m = a.match(/^mfg-(show|sel|done)-(\d+)$/);
    if (m && S.result) {
      const x = S.result.issues.find((i) => i.id === +m[2]);
      if (!x) return true;
      if (m[1] === 'show') { S.active = x.id; api.mark(x); api.render(); }
      else if (m[1] === 'sel') { S.active = x.id; api.mark(x); api.selectPart(x.parts[0]); }
      else { const k = keyOf(x); if (S.resolved.has(k)) S.resolved.delete(k); else S.resolved.add(k); api.render(); }
      return true;
    }
    return false;
  }

  async function exportPDF() {
    if (!S.result) return;
    api.toast('PDF hazırlanıyor…');
    try {
      let shot = null;
      try { shot = api.snapshot ? api.snapshot() : null; } catch (e) { shot = null; }
      const pages = drawReport(S.result, api.name(), S.resolved, shot);
      const jp = [];
      for (const c of pages) { const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); jp.push({ jpeg: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height }); }
      const blob = new Blob([pdfFromJpegs(jp)], { type: 'application/pdf' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = String(api.name() || 'model').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '-uretilebilirlik.pdf';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      api.toast('PDF rapor indirildi (' + pages.length + ' sayfa)');
    } catch (e) { api.toast('PDF oluşturulamadı: ' + e.message); }
  }

  return { html, act, run, get state() { return S; } };
}

/* ---------- PDF raporu (A4 tuval sayfaları) ---------- */
export function drawReport(R, title, resolved = new Set(), shot = null) {
  const W = 1240, H = 1754, M = 70, pages = [];
  let g, y;
  const newPage = () => {
    const c = document.createElement('canvas'); c.width = W; c.height = H; g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); pages.push(c); y = M;
    g.fillStyle = '#64748b'; g.font = '20px sans-serif'; g.textAlign = 'right'; g.fillText('Çizim Atölyesi · Üretilebilirlik analizi · sayfa ' + pages.length, W - M, H - 36); g.textAlign = 'left';
  };
  const font = (s, b) => { g.font = (b ? 'bold ' : '') + s + 'px sans-serif'; };
  const wrap = (txt, x, maxW, size, color = '#0f172a', bold = false, lh = 1.35) => {
    font(size, bold); g.fillStyle = color;
    const words = String(txt).split(/\s+/); let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (g.measureText(t).width > maxW && line) { need(size * lh); g.fillText(line, x, y); y += size * lh; line = w; } else line = t;
    }
    if (line) { need(size * lh); g.fillText(line, x, y); y += size * lh; }
  };
  const need = (h) => { if (y + h > H - 90) newPage(); };
  newPage();
  font(46, true); g.fillStyle = '#0f172a'; g.fillText('ÜRETİLEBİLİRLİK ANALİZİ', M, y + 30); y += 70;
  font(24); g.fillStyle = '#475569'; g.fillText(title + ' · ' + new Date().toLocaleString('tr-TR'), M, y); y += 50;
  const live = R.issues.filter((x) => !resolved.has(x.title + '|' + x.desc));
  const n = (s) => live.filter((x) => x.sev === s).length;
  for (const [k, v, col] of [['Kontrol edilen parça', R.partCount, '#0f172a'], ['Kritik problem', n('crit'), '#dc2626'], ['Üretim uyarısı', n('warn'), '#d97706'], ['İyileştirme önerisi', n('tip'), '#16a34a'], ...(resolved.size ? [['Çözüldü işaretli', resolved.size, '#64748b']] : [])]) {
    font(28); g.fillStyle = '#334155'; g.fillText(k, M, y); font(28, true); g.fillStyle = col; g.textAlign = 'right'; g.fillText(String(v), W - M, y); g.textAlign = 'left';
    g.strokeStyle = '#e2e8f0'; g.beginPath(); g.moveTo(M, y + 14); g.lineTo(W - M, y + 14); g.stroke(); y += 46;
  }
  y += 16; font(30, true); g.fillStyle = '#0f172a'; g.fillText('Genel sonuç', M, y); y += 40;
  wrap(R.summary, M, W - 2 * M, 26, '#0f172a');
  if (shot) {
    y += 20;
    const sw = W - 2 * M, sh = Math.min(560, sw * shot.height / shot.width);
    need(sh + 10);
    const k = Math.min(sw / shot.width, sh / shot.height), dw = shot.width * k, dh = shot.height * k;
    g.fillStyle = '#0b1220'; g.fillRect(M, y, sw, sh); g.drawImage(shot, M + (sw - dw) / 2, y + (sh - dh) / 2, dw, dh); y += sh + 20;
  }
  const COL = { crit: '#dc2626', warn: '#d97706', tip: '#16a34a' }, NAME = { crit: 'KRİTİK', warn: 'UYARI', tip: 'ÖNERİ' };
  y += 20; need(60); font(32, true); g.fillStyle = '#0f172a'; g.fillText('Bulgular', M, y); y += 46;
  if (!R.issues.length) wrap('Kontrol edilen alanlarda problem bulunmadı.', M, W - 2 * M, 26);
  R.issues.forEach((x, i) => {
    const done = resolved.has(x.title + '|' + x.desc);
    need(170);
    const y0 = y - 30;
    font(20, true); g.fillStyle = COL[x.sev]; g.fillText((i + 1) + '. ' + NAME[x.sev] + ' · ' + x.cat + (done ? ' · ÇÖZÜLDÜ' : ''), M + 22, y); y += 34;
    wrap(x.title, M + 22, W - 2 * M - 30, 27, '#0f172a', true);
    if (x.partNames && x.partNames.length) wrap('Parça: ' + x.partNames.join(', '), M + 22, W - 2 * M - 30, 21, '#475569');
    wrap(x.desc, M + 22, W - 2 * M - 30, 23, '#1e293b');
    wrap('Öneri: ' + x.fix, M + 22, W - 2 * M - 30, 23, '#166534');
    if (x.box) wrap('Konum: X ' + Math.round((x.box.min[0] + x.box.max[0]) / 2) + ' · Y ' + Math.round((x.box.min[1] + x.box.max[1]) / 2) + ' · Z ' + Math.round((x.box.min[2] + x.box.max[2]) / 2) + ' mm', M + 22, W - 2 * M - 30, 20, '#64748b');
    g.fillStyle = COL[x.sev]; g.fillRect(M, Math.max(y0, M - 10), 8, Math.max(20, y - Math.max(y0, M - 10) - 10));
    y += 22;
  });
  y += 10; need(80); font(32, true); g.fillStyle = '#0f172a'; g.fillText('Yapılan kontroller', M, y); y += 44;
  for (const cv of R.coverage) {
    need(70);
    wrap((cv.status === 'ok' ? '✔ ' : cv.status === 'partial' ? '◐ ' : '✘ ') + cv.name + (cv.status === 'skip' ? ' (yapılmadı)' : cv.status === 'partial' ? ' (kısmen)' : ''), M, W - 2 * M, 24, cv.status === 'ok' ? '#166534' : '#b45309', true);
    wrap(cv.detail, M + 24, W - 2 * M - 24, 21, '#475569'); y += 8;
  }
  y += 10; wrap('Not: Bu analiz geometrik bir üretim ön kontrolüdür. Yapısal dayanım, kaynak dikiş kalitesi ve toleranslar kapsam dışındadır; sonuçlar mühendislik onayının yerine geçmez.', M, W - 2 * M, 20, '#64748b');
  return pages;
}
