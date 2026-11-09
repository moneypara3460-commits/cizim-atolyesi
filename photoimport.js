// Kağıttan çizim: fotoğraf seç -> kağıt köşeleri -> analiz -> 2B varlıklar.
// Kullanım: openPhotoImport(file, { onDone(ents, info), onCancel() })
import { toGray, findPaperQuad, warpGray, vectorize } from './photo2d.js?v=20261109f';
import { arcSpan } from './cad2d-geom.js?v=20261109f';

const CSS = `
#ph { position: fixed; inset: 0; z-index: 40; background: #0b1220; color: #fff; display: flex; flex-direction: column;
      font-family: system-ui, -apple-system, Roboto, sans-serif; }
#ph .r { display: flex; gap: 5px; padding: 5px 8px 0; align-items: center; flex-wrap: wrap; }
#ph button { font: inherit; color: #fff; background: #1e293b; border: 0; border-radius: 8px; padding: 9px 4px; font-weight: 600; font-size: 13px; flex: 1; min-width: 0; }
#ph button.on { background: #0284c7; } #ph button.ok { background: #15803d; } #ph button.danger { background: #7f1d1d; }
#ph button:disabled { opacity: .35; }
#ph .ttl { flex: 2; text-align: center; font-weight: 700; font-size: 15px; }
#ph .hint { font-size: 12px; color: #94a3b8; padding: 4px 10px 0; min-height: 30px; line-height: 15px; }
#ph .hint.err { color: #f87171; }
#ph .cv { position: relative; flex: 1; min-height: 160px; margin-top: 4px; }
#ph canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; display: block; }
#ph label.s { flex: 1 1 45%; display: block; font-size: 11px; color: #94a3b8; }
#ph label.s input { width: 100%; }
#ph .bot { padding-bottom: 8px; }
`;

export function openPhotoImport(file, opts = {}) {
  if (!document.getElementById('ph-css')) { const st = document.createElement('style'); st.id = 'ph-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div');
  root.id = 'ph';
  root.innerHTML = `
    <div class="r"><button data-a="cancel" class="danger">✕ İptal</button><div class="ttl">Kağıttan çizim</div><button data-a="ok" class="ok" disabled>✓ Çizime aktar</button></div>
    <div class="r"><button data-a="pa-p">A4 dikey</button><button data-a="pa-l">A4 yatay</button><button data-a="pa-f">Serbest</button><button data-a="auto">⌖ Köşeleri bul</button></div>
    <div class="hint" id="ph-hint">Fotoğraf yükleniyor…</div>
    <div class="cv"><canvas></canvas></div>
    <div class="r bot">
      <label class="s">Mürekkep hassasiyeti <span id="ph-v1"></span><input type="range" min="0.04" max="0.35" step="0.01" data-s="sens"></label>
      <label class="s">Düzgünleştirme <span id="ph-v2"></span><input type="range" min="0.003" max="0.025" step="0.001" data-s="tol"></label>
      <label class="s">Küçük işaretleri at (yazı, leke) <span id="ph-v3"></span><input type="range" min="0.005" max="0.08" step="0.005" data-s="minSpan"></label>
      <label class="s" style="display:flex;align-items:flex-end;gap:5px"><button data-a="view" style="flex:1">👁 Fotoğraf / sonuç</button></label>
      <button data-a="num" style="flex:1 0 100%">🔢 Ölçü rakamlarını oku: açık</button>
      <button data-a="run" class="on" style="flex:1 0 100%;padding:12px">🔍 Analiz et</button>
    </div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);
  const cv = root.querySelector('canvas'), g = cv.getContext('2d'), wrap = root.querySelector('.cv');
  const S = { sens: 0.15, tol: 0.008, minSpan: 0.025, readNum: true };
  let paper = 'p', quad = null, img = null, src = null, sw = 0, sh = 0, result = null, warped = null, showResult = false, W = 300, H = 300, dpr = 1;
  const setHint = (m, err) => { $('ph-hint').textContent = m; $('ph-hint').classList.toggle('err', !!err); };
  const syncUI = () => {
    root.querySelectorAll('[data-s]').forEach((el) => { el.value = S[el.dataset.s]; });
    $('ph-v1').textContent = Math.round(S.sens * 100) + '%'; $('ph-v2').textContent = (S.tol * 100).toFixed(1) + '%'; $('ph-v3').textContent = (S.minSpan * 100).toFixed(1) + '%';
    for (const k of ['p', 'l', 'f']) root.querySelector(`[data-a="pa-${k}"]`).classList.toggle('on', paper === k);
    root.querySelector('[data-a="ok"]').disabled = !(result && result.ents.length);
    const nb = root.querySelector('[data-a="num"]'); nb.textContent = '🔢 Ölçü rakamlarını oku: ' + (S.readNum ? 'açık' : 'kapalı'); nb.classList.toggle('on', S.readNum);
  };

  // görüntüyü yükle (en fazla 1600 px)
  const url = URL.createObjectURL(file);
  img = new Image();
  img.onload = () => {
    const k = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    sw = Math.max(1, Math.round(img.naturalWidth * k)); sh = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = sw; c.height = sh;
    const cg = c.getContext('2d'); cg.drawImage(img, 0, 0, sw, sh);
    src = { canvas: c, gray: toGray(cg.getImageData(0, 0, sw, sh).data, sw, sh) };
    URL.revokeObjectURL(url);
    autoQuad();
    resize();
  };
  img.onerror = () => { setHint('Fotoğraf açılamadı.', true); };
  img.src = url;

  function autoQuad() {
    // küçük kopyada kağıdı ara
    const k = Math.min(1, 400 / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const cg = c.getContext('2d'); cg.drawImage(src.canvas, 0, 0, w, h);
    const q = findPaperQuad(toGray(cg.getImageData(0, 0, w, h).data, w, h), w, h);
    if (q) {
      quad = q.map(([x, y]) => [x / k, y / k]);
      const e1 = Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]), e2 = Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]);
      paper = e1 > e2 * 1.1 ? 'l' : 'p';
      setHint('Kağıt bulundu. Köşeler doğru değilse sarı noktaları sürükle, sonra "Analiz et".');
    } else {
      const m = 0.04;
      quad = [[sw * m, sh * m], [sw * (1 - m), sh * m], [sw * (1 - m), sh * (1 - m)], [sw * m, sh * (1 - m)]];
      setHint('Kağıt kenarı bulunamadı. Sarı noktaları kağıdın dört köşesine sürükle (ya da çizimin çevresine), sonra "Analiz et".');
    }
    result = null; showResult = false; syncUI(); draw();
  }

  // ekran yerleşimi
  let view = { s: 1, ox: 0, oy: 0 };
  function layout(iw, ih) { const s = Math.min(W / iw, H / ih) * 0.94; view = { s, ox: (W - iw * s) / 2, oy: (H - ih * s) / 2 }; }
  function resize() {
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    draw();
  }
  const ro = new ResizeObserver(resize); ro.observe(wrap);

  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#0b1220'; g.fillRect(0, 0, W, H);
    if (!src) return;
    if (showResult && result && warped) {
      layout(warped.w, warped.h);
      g.globalAlpha = 0.35; g.drawImage(warped.canvas, view.ox, view.oy, warped.w * view.s, warped.h * view.s); g.globalAlpha = 1;
      // varlıklar (mm -> warped piksel)
      const k = 1 / result.mmPerPx;
      const P = (p) => [view.ox + p[0] * k * view.s, view.oy + (warped.h - 1 - p[1] * k) * view.s];
      g.strokeStyle = '#38bdf8'; g.lineWidth = 2.2;
      for (const e of result.ents) {
        g.beginPath();
        if (e.t === 'line') { g.moveTo(...P(e.a)); g.lineTo(...P(e.b)); }
        else if (e.t === 'circle') { const c = P(e.c); g.arc(c[0], c[1], e.r * k * view.s, 0, Math.PI * 2); }
        else if (e.t === 'arc') { const c = P(e.c); g.arc(c[0], c[1], e.r * k * view.s, -e.a0, -(e.a0 + arcSpan(e)), true); }
        g.stroke();
      }
      // okunan ölçü rakamları
      g.font = 'bold 13px system-ui'; g.textAlign = 'left'; g.textBaseline = 'bottom';
      for (const t of result.texts || []) {
        const b = t.box, x0 = view.ox + b.minX * view.s, y0 = view.oy + b.minY * view.s, w0 = (b.maxX - b.minX + 1) * view.s, h0 = (b.maxY - b.minY + 1) * view.s;
        g.strokeStyle = '#fb923c'; g.lineWidth = 2; g.strokeRect(x0 - 2, y0 - 2, w0 + 4, h0 + 4);
        const lab = t.s; const tw = g.measureText(lab).width + 8;
        g.fillStyle = '#fb923c'; g.fillRect(x0 - 2, y0 - 20, tw, 17); g.fillStyle = '#111'; g.fillText(lab, x0 + 2, y0 - 5);
      }
      g.fillStyle = '#fbbf24';
      for (const e of result.ents) for (const p of e.t === 'line' ? [e.a, e.b] : []) { const s = P(p); g.beginPath(); g.arc(s[0], s[1], 3, 0, 7); g.fill(); }
      return;
    }
    layout(sw, sh);
    g.drawImage(src.canvas, view.ox, view.oy, sw * view.s, sh * view.s);
    if (!quad) return;
    const Q = quad.map(([x, y]) => [view.ox + x * view.s, view.oy + y * view.s]);
    g.fillStyle = 'rgba(56,189,248,.12)'; g.strokeStyle = '#38bdf8'; g.lineWidth = 2;
    g.beginPath(); Q.forEach((p, i) => (i ? g.lineTo(...p) : g.moveTo(...p))); g.closePath(); g.fill(); g.stroke();
    Q.forEach(([x, y], i) => {
      g.beginPath(); g.arc(x, y, 13, 0, 7); g.fillStyle = 'rgba(250,204,21,.85)'; g.fill();
      g.fillStyle = '#111'; g.font = 'bold 11px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), x, y);
    });
    // sürüklerken büyüteç
    if (drag !== null) {
      const [x, y] = Q[drag], R = 60, Z = 2.5, lx = Math.min(Math.max(x, R + 4), W - R - 4), ly = y - 120 < R + 4 ? y + 120 : y - 120;
      g.save(); g.beginPath(); g.arc(lx, ly, R, 0, 7); g.clip();
      const qx = quad[drag][0], qy = quad[drag][1], rr = R / (Z * view.s);
      g.drawImage(src.canvas, qx - rr, qy - rr, rr * 2, rr * 2, lx - R, ly - R, 2 * R, 2 * R);
      g.restore(); g.strokeStyle = '#facc15'; g.lineWidth = 2; g.beginPath(); g.arc(lx, ly, R, 0, 7); g.stroke();
      g.strokeStyle = '#ef4444'; g.beginPath(); g.moveTo(lx - 8, ly); g.lineTo(lx + 8, ly); g.moveTo(lx, ly - 8); g.lineTo(lx, ly + 8); g.stroke();
    }
  }

  // köşe sürükleme
  let drag = null;
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', (e) => {
    if (showResult || !quad) return;
    const [x, y] = local(e);
    let best = null, bd = 34;
    quad.forEach(([qx, qy], i) => { const d = Math.hypot(view.ox + qx * view.s - x, view.oy + qy * view.s - y); if (d < bd) { bd = d; best = i; } });
    if (best === null) return;
    drag = best; cv.setPointerCapture(e.pointerId); draw();
  });
  cv.addEventListener('pointermove', (e) => {
    if (drag === null) return;
    const [x, y] = local(e);
    quad[drag] = [Math.min(Math.max((x - view.ox) / view.s, 0), sw - 1), Math.min(Math.max((y - view.oy) / view.s, 0), sh - 1)];
    result = null; syncUI(); draw();
  });
  const end = () => { if (drag !== null) { drag = null; draw(); } };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

  function run() {
    if (!src || !quad) return;
    setHint('Analiz ediliyor…');
    setTimeout(() => {
      try {
        const t0 = performance.now();
        const e1 = (Math.hypot(quad[1][0] - quad[0][0], quad[1][1] - quad[0][1]) + Math.hypot(quad[2][0] - quad[3][0], quad[2][1] - quad[3][1])) / 2;
        const e2 = (Math.hypot(quad[3][0] - quad[0][0], quad[3][1] - quad[0][1]) + Math.hypot(quad[2][0] - quad[1][0], quad[2][1] - quad[1][1])) / 2;
        const ratio = paper === 'p' ? 210 / 297 : paper === 'l' ? 297 / 210 : Math.max(e1, 1) / Math.max(e2, 1);
        const M = 1000;
        const ow = ratio >= 1 ? M : Math.round(M * ratio), oh = ratio >= 1 ? Math.round(M / ratio) : M;
        const gray = warpGray(src.gray, sw, sh, quad, ow, oh);
        const mmW = paper === 'p' ? 210 : paper === 'l' ? 297 : 200;
        const mmPerPx = mmW / ow;
        const r = vectorize(gray, ow, oh, { mmPerPx, sens: S.sens, tol: S.tol, minSpan: S.minSpan, readNumbers: S.readNum });
        // düzeltilmiş görüntüyü göstermek için tuvale aktar
        const c = document.createElement('canvas'); c.width = ow; c.height = oh;
        const id = c.getContext('2d').createImageData(ow, oh);
        for (let i = 0; i < gray.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = gray[i]; id.data[i * 4 + 3] = 255; }
        c.getContext('2d').putImageData(id, 0, 0);
        warped = { canvas: c, w: ow, h: oh };
        result = { ents: r.ents, texts: r.texts || [], mmPerPx, stats: r.stats };
        showResult = true;
        const n = (t) => r.ents.filter((e) => e.t === t).length;
        setHint(r.ents.length
          ? `Bulundu: ${n('line')} çizgi, ${n('arc')} yay, ${n('circle')} daire${result.texts.length ? ', ölçü rakamları: ' + result.texts.map((t) => t.s).join(', ') : ''} (${Math.round(performance.now() - t0)} ms). Fazla çizgi varsa hassasiyeti düşür / küçük işaret sınırını artır. ${paper === 'f' ? 'Ölçek tahmini: genişlik 200 mm — aktardıktan sonra Ölçekle ile düzelt.' : 'Ölçek A4 kağıda göre.'}`
          : 'Çizgi bulunamadı. Hassasiyeti artır ya da köşeleri kontrol et.', !r.ents.length);
      } catch (err) { setHint('Analiz hatası: ' + (err && err.message ? err.message : err), true); }
      syncUI(); draw();
    }, 30);
  }

  function close() { ro.disconnect(); root.remove(); }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.a) return;
    const a = b.dataset.a;
    if (a === 'cancel') { close(); if (opts.onCancel) opts.onCancel(); return; }
    if (a === 'ok') { if (result && result.ents.length) { close(); opts.onDone && opts.onDone(result.ents, { paper, stats: result.stats, texts: result.texts }); } return; }
    if (a === 'num') { S.readNum = !S.readNum; syncUI(); if (result) run(); return; }
    if (a.startsWith('pa-')) { paper = a.slice(3); result = null; showResult = false; syncUI(); draw(); return; }
    if (a === 'auto') { if (src) autoQuad(); return; }
    if (a === 'run') { run(); return; }
    if (a === 'view') { if (result) { showResult = !showResult; draw(); } return; }
  });
  root.addEventListener('input', (e) => {
    const k = e.target.dataset && e.target.dataset.s;
    if (!k) return;
    S[k] = parseFloat(e.target.value); syncUI();
  });
  root.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.s && result) run(); });
  syncUI();
  return { close };
}
