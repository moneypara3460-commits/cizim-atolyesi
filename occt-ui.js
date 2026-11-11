// 🧱 B-Rep sekmesi: OCCT (Open CASCADE) çekirdeğiyle hassas katı modelleme.
// api: { descs() → [parça tanımı], parts() → [{id, name, desc}], selected() → {id, name, desc} | null,
//        meshVolume() → mm³ | null, draw(view), clear(), addPart(part, name, hideIds), toast(m), render(),
//        saveText(text, name), pickFile(accept) → Promise<File|null>, name() }
const V = '20261111b';
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 1) => (v == null || !isFinite(v) ? '—' : (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('tr-TR', { maximumFractionDigits: d }));
const FT = { Plane: 'düzlem', Cylinder: 'silindir', Cone: 'koni', Sphere: 'küre', Torus: 'torus', BSplineSurface: 'serbest (B-spline)', BezierSurface: 'Bezier', SurfaceOfRevolution: 'dönel', SurfaceOfExtrusion: 'çekme', OffsetSurface: 'ofset', OtherSurface: 'diğer' };
const ET = { Line: 'doğru', Circle: 'daire / yay', Ellipse: 'elips', BSplineCurve: 'B-spline', BezierCurve: 'Bezier', OtherCurve: 'diğer' };
const WHICH = [['all', 'Tüm kenarlar'], ['top', 'Üst kenarlar'], ['bottom', 'Alt kenarlar'], ['vertical', 'Dikey kenarlar'], ['circular', 'Dairesel kenarlar']];

// ---- işçi istemcisi (işçi yoksa ana iş parçacığında çalışır) ----
function createClient() {
  let w = null, seq = 0, inline = null;
  const pend = new Map();
  function start() {
    if (w || inline) return;
    try {
      w = new Worker(new URL('./occt-worker.js?v=' + V, import.meta.url), { type: 'module' });
      w.onmessage = (e) => { const p = pend.get(e.data.id); if (!p) return; pend.delete(e.data.id); e.data.ok ? p.res(e.data.res) : p.rej(new Error(e.data.err)); };
      w.onerror = (e) => { const err = new Error('OCCT işçisi başlatılamadı' + (e && e.message ? ': ' + e.message : '')); for (const p of pend.values()) p.rej(err); pend.clear(); try { w.terminate(); } catch (x) { /* */ } w = null; inline = inline || startInline(); };
    } catch (e) { w = null; inline = startInline(); }
  }
  function startInline() {
    return (async () => {
      const [{ default: Module }, { initOCCT }, { runOp }] = await Promise.all([import('./vendor/occt/replicad_single.js'), import('./occt.js?v=' + V), import('./occt-ops.js?v=' + V)]);
      const K = await initOCCT(Module, { print: () => {}, printErr: () => {} });
      return { K, runOp };
    })();
  }
  async function call(op, args, transfer) {
    start();
    if (inline) {
      const { K, runOp } = await inline;
      try { return await runOp(K, op, args); } finally { K.free(); }
    }
    return new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); w.postMessage({ id, op, args }, transfer || []); });
  }
  return { call };
}

export function createOcctUI(api) {
  const client = createClient();
  const S = { state: 'off', loadMs: null, busy: null, err: null, model: null, showing: false, last: null, a: null, b: null, r: 2, which: 'all', lastNote: null };
  let gen = 0;
  const render = () => api.render();

  async function run(label, op, args, then) {
    if (S.busy) return;
    S.busy = label; S.err = null; render();
    const my = ++gen;
    try {
      if (S.state !== 'on') { S.state = 'loading'; render(); const r = await client.call('init', {}); S.loadMs = r.loadMs; S.state = 'on'; }
      const res = await client.call(op, args);
      if (my === gen) await then(res);
    } catch (e) {
      if (S.state === 'loading') S.state = 'off';
      S.err = String(e.message || e);
    } finally { S.busy = null; render(); }
  }

  function checkHtml(c, meshV) {
    if (!c) return '';
    const ok = c.valid && c.solids > 0 && !c.problems.length;
    let h = `<div class="lbl" style="flex:1 0 100%;color:${ok ? '#4ade80' : '#f87171'};font-weight:600">${ok ? '✓ Geçerli katı' : '⚠ Sorunlu geometri'}</div>`;
    h += `<div class="lbl" style="flex:1 0 100%">${c.solids} katı · ${c.shells} kabuk · ${c.faces} yüz · ${c.edges} kenar · ${c.vertices} köşe</div>`;
    h += `<div class="lbl" style="flex:1 0 100%">Hacim (OCCT, tam): <b>${nf(c.volume / 1000, 3)} cm³</b>` + (meshV != null && meshV > 0 ? ` · ekrandaki ağ: ${nf(meshV / 1000, 3)} cm³ (fark %${nf(Math.abs(c.volume - meshV) / meshV * 100, 2)})` : '') + '</div>';
    for (const p of c.problems) h += `<div class="lbl" style="flex:1 0 100%;color:#f87171">• ${esc(p)}</div>`;
    return h;
  }
  function camHtml(m) {
    if (!m) return '';
    const ft = Object.entries(m.faceTypes).map(([k, n]) => `${n} ${FT[k] || k}`).join(', ');
    const et = Object.entries(m.edgeTypes).map(([k, n]) => `${n} ${ET[k] || k}`).join(', ');
    let h = '<div class="lbl h">CAM için geometri</div>' +
      `<div class="lbl" style="flex:1 0 100%">Yüzler: ${esc(ft)}</div><div class="lbl" style="flex:1 0 100%">Kenarlar: ${esc(et)}</div>`;
    if (m.cylinders.length) h += `<div class="lbl" style="flex:1 0 100%">Silindirik yüzeyler (delik / mil): ${m.cylinders.map((c) => 'Ø' + nf(c.d, 3) + (c.n > 1 ? ' ×' + c.n : '') + ' (' + (Math.abs(c.axis[1]) > 0.999 ? 'dikey' : Math.abs(c.axis[0]) > 0.999 ? 'X ekseni' : Math.abs(c.axis[2]) > 0.999 ? 'Z ekseni' : 'eğik') + ')').join(', ')}</div>`;
    h += `<div class="lbl" style="flex:1 0 100%">${m.planes} düzlem yüzün ${m.axisPlanes} tanesi eksenlere dik (tek bağlamada işlenebilir yüzeyler).</div>`;
    return h;
  }

  function html() {
    const btn = (l, a, on, st = '') => `<button data-act="${a}"${on ? ' class="on"' : ''}${st ? ' style="' + st + '"' : ''}${S.busy ? ' disabled' : ''}>${l}</button>`;
    const parts = api.parts();
    const opt = (sel) => parts.map((p) => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
    if (S.a == null || !parts.some((p) => p.id === S.a)) S.a = parts[0] ? parts[0].id : null;
    if (S.b == null || !parts.some((p) => p.id === S.b) || S.b === S.a) S.b = (parts.find((p) => p.id !== S.a) || {}).id ?? null;
    let h = '<div class="lbl h">Geometri motoru: Open CASCADE (OCCT)</div>';
    h += `<div class="lbl" style="flex:1 0 100%">${S.state === 'on' ? '✓ OCCT yüklü' + (S.loadMs ? ' (' + nf(S.loadMs / 1000, 1) + ' sn)' : '') : S.state === 'loading' ? '⏳ OCCT yükleniyor… (ilk sefer 10–25 MB indirilir, sonra önbellekten)' : 'OCCT henüz yüklenmedi. İlk işlemde otomatik yüklenir (10–25 MB, internet gerekir; Wi-Fi önerilir).'}</div>`;
    if (S.busy) h += `<div class="lbl" style="flex:1 0 100%;color:#fbbf24">⏳ ${esc(S.busy)}…</div>`;
    if (S.err) h += `<div class="lbl" style="flex:1 0 100%;color:#f87171">⚠ ${esc(S.err)}</div>`;
    if (S.lastNote) h += `<div class="lbl" style="flex:1 0 100%;color:#fbbf24">${esc(S.lastNote)}</div>`;

    h += '<div class="lbl h">Model (B-Rep)</div>' + btn('🧱 Modeli OCCT ile kur ve doğrula', 'oc-model') +
      (S.model ? btn(S.showing ? '👁 OCCT görüntüsü: açık' : '👁 OCCT görüntüsü: kapalı', 'oc-show', S.showing) : '');
    if (S.model) {
      h += checkHtml(S.model.check, S.model.meshV);
      if (S.model.skipped && S.model.skipped.length) h += `<div class="lbl" style="flex:1 0 100%;color:#fbbf24">Atlanan parça: ${S.model.skipped.map((s) => esc(s.name || '?') + ' (' + esc(s.why) + ')').join(', ')}</div>`;
      if (S.model.approx) h += `<div class="lbl" style="flex:1 0 100%;color:#94a3b8">${S.model.approx} parça (kroki, süpürme, sac, iskelet, ağ) tam karşılığı olmadığından üçgen yüzlü B-Rep'e çevrildi; kutu, silindir, küre, koni, boru ve OCCT ile üretilen parçalar tam (analitik) yüzeylidir.</div>`;
      h += camHtml(S.model.cam);
    }

    h += '<div class="lbl h">Boolean (hassas)</div>';
    if (parts.length < 2) h += '<div class="lbl" style="flex:1 0 100%">İki parça gerekir.</div>';
    else {
      h += `<label class="f"><span>A parçası</span><select data-oc="a">${opt(S.a)}</select></label><label class="f"><span>B parçası</span><select data-oc="b">${opt(S.b)}</select></label>` +
        btn('∪ Birleştir (A + B)', 'oc-fuse') + btn('− Çıkar (A − B)', 'oc-cut') + btn('∩ Kesişim (A ∩ B)', 'oc-common') +
        '<div class="lbl" style="flex:1 0 100%">Sonuç yeni bir parça olur; A ve B gizlenir (Parça sekmesinden geri açılır, Geri al ile döner).</div>';
    }

    const sel = api.selected();
    h += '<div class="lbl h">Yuvarlama / pah (seçili parça)</div>';
    if (!sel) h += '<div class="lbl" style="flex:1 0 100%">Önce bir parça seç.</div>';
    else {
      h += `<div class="lbl" style="flex:1 0 100%">Seçili: <b>${esc(sel.name)}</b></div>` +
        `<label class="f"><span>Ölçü (mm)</span><input type="number" step="any" inputmode="decimal" data-oc="r" value="${S.r}"></label>` +
        `<label class="f"><span>Kenarlar</span><select data-oc="which">${WHICH.map(([k, l]) => `<option value="${k}"${S.which === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` +
        btn('◜ Yuvarla (fillet)', 'oc-fillet') + btn('◸ Pah kır (chamfer)', 'oc-chamfer') + btn('🩺 Doğrula ve onar', 'oc-fix');
    }

    h += '<div class="lbl h">Dosya</div>' +
      btn('⬇ STEP dışa aktar (tam B-Rep)', 'oc-step-out') + btn('⬆ STEP içe aktar', 'oc-step-in') + btn('⬆ IGES içe aktar', 'oc-iges-in') +
      '<button disabled style="opacity:.5">⬇ IGES dışa aktar (henüz yok)</button>' +
      '<div class="lbl" style="flex:1 0 100%;font-size:12px;color:#94a3b8">IGES dışa aktarma: kullanılan OCCT derlemesinde IGES yazıcısı yok; özel derleme gerekiyor. STEP (AP214) bütün CAD / CAM programlarında açılır, onu kullan. IGES içe aktarma ayrı bir OCCT okuyucusuyla yapılır; yüzeyler üçgenlere bölünüp katıya dikilir.</div>';
    return h;
  }

  function showModel() { if (S.model && S.model.view) { api.draw(S.model.view); S.showing = true; } }

  function act(a) {
    if (!a.startsWith('oc-')) return false;
    if (S.busy) return true;
    if (a === 'oc-model') {
      const descs = api.descs();
      if (!descs.length) { api.toast('Modelde parça yok'); return true; }
      run('Model B-Rep olarak kuruluyor', 'model', { descs }, async (r) => {
        S.model = { ...r, meshV: api.meshVolume(), approx: descs.filter((d) => d.type === 'tris').length };
        showModel();
        api.toast(r.check.valid ? 'OCCT: geçerli katı · ' + r.check.faces + ' yüz' : 'OCCT: geometride sorun var, ayrıntı panelde');
      });
      return true;
    }
    if (a === 'oc-show') { if (S.showing) { api.clear(); S.showing = false; } else showModel(); render(); return true; }
    if (a === 'oc-fuse' || a === 'oc-cut' || a === 'oc-common') {
      const parts = api.parts(), A = parts.find((p) => p.id === S.a), B = parts.find((p) => p.id === S.b);
      if (!A || !B || A.id === B.id) { api.toast('İki farklı parça seç'); return true; }
      const op = a.slice(3), nm = { fuse: '∪', cut: '−', common: '∩' }[op];
      run('Boolean hesaplanıyor', 'bool', { a: A.desc, b: B.desc, op }, async (r) => {
        afterPart(r, `${A.name} ${nm} ${B.name}`, [A.id, B.id]);
      });
      return true;
    }
    if (a === 'oc-fillet' || a === 'oc-chamfer' || a === 'oc-fix') {
      const sel = api.selected();
      if (!sel) { api.toast('Önce bir parça seç'); return true; }
      if (a === 'oc-fix') { run('Doğrulanıyor', 'fix', { desc: sel.desc }, async (r) => afterPart(r, sel.name + ' (onarıldı)', [sel.id])); return true; }
      const r0 = +S.r;
      if (!(r0 > 0)) { api.toast('Ölçü 0\'dan büyük olmalı'); return true; }
      const kind = a === 'oc-chamfer' ? 'chamfer' : 'fillet';
      run(kind === 'fillet' ? 'Kenarlar yuvarlanıyor' : 'Pah kırılıyor', 'edge', { desc: sel.desc, kind, r: r0, which: S.which }, async (r) => {
        afterPart(r, sel.name + (kind === 'fillet' ? ' R' : ' pah ') + r0, [sel.id]);
      });
      return true;
    }
    if (a === 'oc-step-out') {
      const descs = api.descs();
      if (!descs.length) { api.toast('Modelde parça yok'); return true; }
      run('STEP yazılıyor', 'step-out', { descs }, async (r) => {
        api.saveText(r.text, api.name() + '.step');
        api.toast('STEP indirildi' + (r.check.valid ? '' : ' (uyarı: geometri doğrulamadan geçmedi)') + (r.skipped.length ? ' · ' + r.skipped.length + ' parça atlandı' : ''));
      });
      return true;
    }
    if (a === 'oc-step-in' || a === 'oc-iges-in') {
      const iges = a === 'oc-iges-in';
      api.pickFile(iges ? '.igs,.iges,.IGS,.IGES' : '.step,.stp,.STEP,.STP').then(async (f) => {
        if (!f) return;
        const args = iges ? { bytes: new Uint8Array(await f.arrayBuffer()) } : { text: await f.text() };
        const base = f.name.replace(/\.[^.]+$/, '');
        run(iges ? 'IGES okunuyor' : 'STEP okunuyor', iges ? 'iges-in' : 'step-in', args, async (r) => afterPart(r, base, []));
      });
      return true;
    }
    return true;
  }
  function afterPart(r, name, hideIds) {
    S.lastNote = r.note || null;
    if (!r.part) { api.toast('Sonuç alınamadı'); return; }
    api.addPart(r.part, name, hideIds);
    S.model = null; S.showing = false; api.clear();
    const c = r.check;
    api.toast(c ? (c.valid && c.solids ? '✓ ' : '⚠ ') + name + ' · ' + nf(c.volume / 1000, 2) + ' cm³' : name + ' eklendi');
  }
  function input(el) {
    const k = el.dataset.oc;
    if (k === 'a' || k === 'b') { S[k] = Number(el.value); render(); }
    else if (k === 'r') S.r = el.value;
    else if (k === 'which') S.which = el.value;
  }
  return {
    html, act, input,
    leave() { if (S.showing) { api.clear(); S.showing = false; } },
    invalidate() { if (S.model) { S.model = null; if (S.showing) { api.clear(); S.showing = false; } } },
    get active() { return S.showing || !!S.model; },
  };
}
