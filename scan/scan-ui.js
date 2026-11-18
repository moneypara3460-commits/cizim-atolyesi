// Tarama / ağ içe aktarma penceresi: dosya seç → oku, temizle, ölçekle → "CAD'e çevir" (düzenlenebilir parçalar) ya da "Ağ olarak ekle".
// Kullanım: openScanImport({ addParts(parts, name), addMesh({ pos, x, y, z, h }, name), toast })
// Telefonda internetsiz çalışır; dosya hiçbir yere gönderilmez.
import { parseMesh, ACCEPT, MAX_BYTES } from './mesh-import.js?v=20261118b';
import { prepare, measure, scaleToKnown, simplify, toTris } from './mesh-tools.js?v=20261118b';
import { alignToAxes, fitCAD, describe } from './fit.js?v=20261118b';
import { photoToParts, partsBounds } from './photo-parts.js?v=20261118b';

const FIT_MAX = 200000;    // tanıma için en çok üçgen (üstü sadeleştirilir)
const MESH_MAX = 60000;    // projeye ağ olarak kaydedilecek en çok üçgen (kayıt alanı sınırlı)
const UNITS = [['mm', 1], ['cm', 10], ['m', 1000], ['inç', 25.4]];

const CSS = `
#sc { position: fixed; inset: 0; z-index: 40; background: #0b1220; color: #fff; display: flex; flex-direction: column; overflow: auto;
      font-family: system-ui, -apple-system, Roboto, sans-serif; font-size: 14px; }
#sc .r { display: flex; gap: 6px; padding: 6px 10px 0; align-items: center; flex-wrap: wrap; }
#sc .ttl { flex: 1; text-align: center; font-weight: 700; }
#sc button { font: inherit; color: #fff; background: #1e293b; border: 0; border-radius: 8px; padding: 10px 8px; font-weight: 600; }
#sc button.ok { background: #15803d; } #sc button.on { background: #0284c7; } #sc button.danger { background: #7f1d1d; }
#sc button:disabled { opacity: .45; }
#sc .card { background: #111c31; border: 1px solid #1f2d47; border-radius: 10px; padding: 10px; margin: 8px 10px 0; line-height: 1.45; }
#sc .card b { color: #7dd3fc; } #sc .warn { color: #fbbf24; } #sc .err { color: #fca5a5; } #sc .muted { color: #94a3b8; font-size: 12.5px; }
#sc select, #sc input { font: inherit; background: #0f172a; color: #fff; border: 1px solid #334155; border-radius: 7px; padding: 8px; min-width: 0; }
#sc label { display: flex; align-items: center; gap: 6px; }
#sc .grow { flex: 1; }
#sc .res { white-space: pre-line; }
`;

export function openScanImport(api) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = ACCEPT;
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) open(f, api); };
  inp.click();
}

async function open(file, api) {
  if (file.size > MAX_BYTES) { api.toast('Dosya çok büyük (en çok 150 MB)'); return; }
  if (!document.getElementById('sc-css')) { const st = document.createElement('style'); st.id = 'sc-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div');
  root.id = 'sc';
  root.innerHTML = `
    <div class="r"><button data-a="close" class="danger" style="flex:0 0 auto">✕ Kapat</button><div class="ttl">Tarama / ağ içe aktar</div></div>
    <div class="card" id="sc-info">Okunuyor: ${esc(file.name)}…</div>
    <div class="card" id="sc-set" style="display:none">
      <div class="r" style="padding:0">
        <label>Dosya birimi <select data-s="unit">${UNITS.map(([n, v]) => `<option value="${v}">${n}</option>`).join('')}</select></label>
        <label><input type="checkbox" data-s="align" checked> Eksenlere hizala</label>
      </div>
      <div class="r" style="padding:6px 0 0">
        <label class="grow">Bilinen ölçü <select data-s="kax"><option value="0">Genişlik (X)</option><option value="1">Yükseklik (Y)</option><option value="2">Derinlik (Z)</option></select></label>
        <input data-s="kval" type="number" inputmode="decimal" min="0" step="0.1" placeholder="mm" style="width:90px">
        <button data-a="known">Ölçekle</button>
      </div>
      <div class="muted" style="margin-top:6px">Tarama uygulamaları ölçüyü çoğu zaman tam bilmez. Parçanın bir ölçüsünü kumpasla ölç, buraya yaz: bütün model o ölçüye göre büyütülür / küçültülür.</div>
      <div class="r" style="padding:6px 0 0">
        <label>Ölçü yuvarlama <select data-s="snap"><option value="0.1">0,1 mm</option><option value="0.5">0,5 mm</option><option value="1">1 mm</option><option value="0">yok</option></select></label>
      </div>
    </div>
    <div class="r" id="sc-btns" style="display:none">
      <button data-a="fit" class="on grow">🧱 CAD'e çevir</button>
      <button data-a="mesh" class="grow">△ Ağ olarak ekle</button>
    </div>
    <div class="card res" id="sc-res" style="display:none"></div>
    <div class="r" id="sc-add" style="display:none;padding-bottom:12px"><button data-a="addcad" class="ok grow">✓ Düzenlenebilir parça olarak ekle</button></div>
    <div class="card muted">Desteklenen: STL, OBJ, PLY, GLB. Telefonla taramak için ücretsiz tarama uygulamalarından (ör. Polycam, KIRI Engine, RealityScan) ağı STL / OBJ / GLB olarak dışa aktar. Parlak metal parçalar iyi taranmaz: üzerine ince mat sprey (tarama spreyi) sık. Dosya telefonda işlenir, hiçbir yere gönderilmez.</div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);
  const S = { unit: 1, align: true, snap: 0.1 };
  let raw = null, mesh = null, fitR = null, fmt = '';

  const close = () => root.remove();
  const tick = () => new Promise((r) => setTimeout(r, 30));
  const nf = (v, d = 1) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('tr-TR');

  function info() {
    const m = measure(mesh);
    $('sc-info').innerHTML = `<b>${esc(file.name)}</b> · ${fmt}<br>` +
      `Boyut: <b>${nf(m.size[0])} × ${nf(m.size[1])} × ${nf(m.size[2])} mm</b> (X × Y × Z)<br>` +
      `${m.tris.toLocaleString('tr-TR')} üçgen · ${m.closed ? 'kapalı (su geçirmez)' : '<span class="warn">açık ağ: ' + m.openEdges + ' boş kenar (taramada görünmeyen yüzler)</span>'}` +
      (m.closed ? ` · hacim ${nf(m.volume / 1000, 2)} cm³` : '') +
      (raw.notes.length ? `<br><span class="muted">${raw.notes.map(esc).join(' · ')}</span>` : '');
  }
  async function rebuild() {
    $('sc-res').style.display = 'none'; $('sc-add').style.display = 'none'; fitR = null;
    $('sc-info').textContent = 'Hazırlanıyor…'; await tick();
    const p = prepare(raw.tris, { unit: S.unit, maxTris: FIT_MAX });
    raw.notes = [...raw.baseNotes, ...p.notes];
    mesh = p.mesh;
    if (S.align) mesh = alignToAxes(mesh).mesh;
    info();
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    await tick();
    const r = parseMesh(bytes, file.name);
    fmt = r.note;
    raw = { tris: r.tris, baseNotes: r.dropped ? [r.dropped + ' bozuk üçgen atıldı'] : [], notes: [] };
    if (r.format === 'glb') { root.querySelector('[data-s="unit"]').value = '1'; }
    await rebuild();
    $('sc-set').style.display = ''; $('sc-btns').style.display = '';
  } catch (e) {
    $('sc-info').innerHTML = '<span class="err">' + esc(e.user ? e.message : 'Dosya okunamadı: ' + (e.message || e)) + '</span>';
    return;
  }

  root.addEventListener('change', async (ev) => {
    const k = ev.target.dataset.s;
    if (k === 'unit') { S.unit = Number(ev.target.value); await rebuild(); }
    else if (k === 'align') { S.align = ev.target.checked; await rebuild(); }
    else if (k === 'snap') { S.snap = Number(ev.target.value); if (fitR) runFit(); }
  });
  root.addEventListener('click', async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'close') { close(); return; }
    if (a === 'known') {
      const v = Number(String(root.querySelector('[data-s="kval"]').value).replace(',', '.'));
      if (!(v > 0)) { api.toast('Bilinen ölçüyü mm olarak yaz'); return; }
      const r = scaleToKnown(mesh, Number(root.querySelector('[data-s="kax"]').value), v);
      mesh = r.mesh; raw.notes.push('bilinen ölçüye göre ×' + nf(r.factor, 4) + ' ölçeklendi');
      info(); $('sc-res').style.display = 'none'; $('sc-add').style.display = 'none'; fitR = null;
      return;
    }
    if (a === 'fit') { await runFit(); return; }
    if (a === 'addcad' && fitR?.ok) {
      api.addParts(fitR.parts, partName(file.name), { minX: measure(mesh).min[0] });
      api.toast('✓ ' + describe(fitR));
      close();
      return;
    }
    if (a === 'mesh') {
      let m = mesh, note = '';
      if (m.F.length / 3 > MESH_MAX) { m = simplify(m, MESH_MAX).mesh; note = ' (kayıt için ' + MESH_MAX.toLocaleString('tr-TR') + ' üçgene sadeleştirildi)'; }
      const ms = measure(m), pos = toTris(m), h = Math.max(ms.size[1], 1e-3);
      const cx = (ms.min[0] + ms.max[0]) / 2, cz = (ms.min[2] + ms.max[2]) / 2, my = (ms.min[1] + ms.max[1]) / 2;
      for (let i = 0; i < pos.length; i += 3) { pos[i] -= cx; pos[i + 1] -= my; pos[i + 2] -= cz; }
      api.addMesh({ pos, x: cx, y: ms.min[1], z: cz, h, minX: ms.min[0] }, partName(file.name) + ' (ağ)');
      api.toast('Ağ olarak eklendi: ölçüleri düzenlenemez' + note);
      close();
    }
  });

  async function runFit() {
    $('sc-res').style.display = ''; $('sc-res').textContent = 'Yüzeyler inceleniyor…'; $('sc-add').style.display = 'none';
    await tick();
    try {
      const m = S.align ? mesh : alignToAxes(mesh).mesh;
      fitR = fitCAD(m, { snap: S.snap });
    } catch (e) { fitR = { ok: false, reason: 'Tanıma başarısız: ' + (e.message || e) }; }
    const q = fitR.quality;
    if (fitR.ok) {
      $('sc-res').innerHTML = `<b>Tanındı:</b> ${esc(describe(fitR))}\n` +
        `<span class="muted">Açıklanan yüzey %${Math.round(q.coverage * 100)}` + (q.volErr != null ? ` · hacim farkı %${nf(q.volErr * 100)}` : '') + `</span>` +
        (fitR.notes.length ? '\n<span class="warn">' + fitR.notes.map(esc).join('\n') + '</span>' : '') +
        `\n<span class="muted">Eklenen parçalar gerçek ölçülü katıdır: ölçüleri değiştirilir, B-Rep / STEP, teknik resim, CNC sekmelerinde kullanılır. Ölçüleri kumpasla doğrula.</span>`;
      $('sc-add').style.display = '';
    } else {
      $('sc-res').innerHTML = '<span class="warn">' + esc(fitR.reason) + '</span>';
    }
  }
}

const partName = (n) => (n || 'Tarama').replace(/\.[^.]+$/, '').slice(0, 40) || 'Tarama';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- Tek fotoğraftan TAHMİNİ model (yapay zekâ, internet gerekir) ---------- */
// Kullanım: openPhotoModel({ addParts(parts, name, ext), toast })
export const PHOTO_URL = 'https://anqfdlahimxdjovecsyk.supabase.co/functions/v1/foto-model';
const PUB_KEY = 'sb_publishable_urzQtn-1lE1-obSXF_ivQg_wZbQMRDr';   // yayınlanabilir (herkese açık) anahtar

async function aiHeaders() {
  let s = null;
  try { s = await (await import('../hesap/session.js')).validSession(); } catch (e) { s = null; }
  if (!s?.access_token) throw new Error('Yapay zekâ için önce Google ile giriş yap (Ana ekran → Giriş)');
  return { 'content-type': 'application/json', apikey: PUB_KEY, authorization: 'Bearer ' + s.access_token };
}
// Resim dosyası doğrudan bit eşleme olarak çözülür (sayfaya adres / HTML olarak girmez)
async function shrinkImg(bmp, max = 1200) {
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * s); cv.height = Math.round(bmp.height * s);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.85);
}

export function openPhotoModel(api) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => { const f = inp.files && inp.files[0]; if (f) photoDialog(f, api); };
  inp.click();
}

async function photoDialog(file, api) {
  if (!document.getElementById('sc-css')) { const st = document.createElement('style'); st.id = 'sc-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div');
  root.id = 'sc';
  root.innerHTML = `
    <div class="r"><button data-a="close" class="danger" style="flex:0 0 auto">✕ Kapat</button><div class="ttl">Fotoğraftan tahmini model</div></div>
    <div class="card" style="text-align:center"><canvas id="sc-img" style="max-width:100%;max-height:38vh;border-radius:8px"></canvas></div>
    <div class="card">
      <div class="r" style="padding:0">
        <label class="grow">Bilinen en uzun ölçü <input data-s="known" type="number" inputmode="decimal" min="0" step="0.1" placeholder="mm (önerilir)" style="width:120px"></label>
      </div>
      <div class="r" style="padding:6px 0 0"><input data-s="hint" class="grow" maxlength="200" placeholder="Not (isteğe bağlı): ör. alüminyum flanş, 4 delikli"></div>
      <div class="muted" style="margin-top:6px">Yapay zekâ parçayı temel şekillerle kabaca modeller. Ölçüler <b>tahmindir</b>: en uzun ölçüyü kumpasla ölçüp yazarsan model o ölçüye göre ölçeklenir. Fotoğraf sunucuya gönderilir, işlendikten sonra saklanmaz. Giriş gerekir, günlük hakkı sınırlıdır.</div>
    </div>
    <div class="r"><button data-a="guess" class="on grow">🔮 Tahmin et</button></div>
    <div class="card res" id="sc-res" style="display:none"></div>
    <div class="r" id="sc-add" style="display:none;padding-bottom:12px"><button data-a="addguess" class="ok grow">✓ Tahmini parçaları ekle</button></div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);
  let bmp = null;
  try { bmp = await createImageBitmap(file); } catch (e) { bmp = null; }
  if (!bmp) { root.remove(); api.toast('Resim açılamadı'); return; }
  { const cv = $('sc-img'), k = Math.min(1, 900 / Math.max(bmp.width, bmp.height)); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); }
  let out = null, busy = false;
  const close = () => { try { bmp.close(); } catch (e) { /* */ } root.remove(); };
  root.addEventListener('click', async (ev) => {
    const a = ev.target.closest('[data-a]')?.dataset.a;
    if (!a) return;
    if (a === 'close') { close(); return; }
    if (a === 'guess' && !busy) {
      busy = true; $('sc-add').style.display = 'none'; $('sc-res').style.display = ''; $('sc-res').textContent = 'Yapay zekâ fotoğrafı inceliyor (10–40 sn)…';
      const known = Number(String(root.querySelector('[data-s="known"]').value).replace(',', '.')) || null;
      const hint = root.querySelector('[data-s="hint"]').value.trim();
      try {
        const image = await shrinkImg(bmp);
        const h = await aiHeaders();
        let r;
        try { r = await fetch(PHOTO_URL, { method: 'POST', headers: h, body: JSON.stringify({ image, hint, known: known ? { mm: known } : undefined }) }); }
        catch (e) { throw new Error('İnternet bağlantısı yok ya da sunucuya ulaşılamadı'); }
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.ok) throw new Error(j.error || 'Sunucu hatası (' + r.status + ')');
        out = photoToParts(j.result, known);
        if (!out.ok) throw new Error('Fotoğraftan model çıkarılamadı.');
        const add = out.parts.filter((p) => p.op === 'add').length, sub = out.parts.length - add;
        const bb = partsBounds(out.parts);
        const conf = { high: 'yüksek', medium: 'orta', low: 'düşük' }[j.result.confidence] || 'düşük';
        $('sc-res').innerHTML = `<b>TAHMİNİ model:</b> ${add} katı${sub ? ', ' + sub + ' boşluk / delik' : ''} · yaklaşık ${nf2(bb.size[0])} × ${nf2(bb.size[1])} × ${nf2(bb.size[2])} mm · güven: ${conf}` +
          (j.result.notes ? `\n${esc(j.result.notes)}` : '') + (j.result.view ? `\n<span class="muted">Görünüş: ${esc(j.result.view)}</span>` : '') +
          `\n<span class="warn">${out.notes.map(esc).join('\n')}</span>\n<span class="muted">Bu bir başlangıç modelidir; ölçüleri ve delik yerlerini mutlaka kontrol et.</span>`;
        $('sc-add').style.display = '';
      } catch (e) {
        $('sc-res').innerHTML = '<span class="err">' + esc(e.message || String(e)) + '</span>';
      } finally { busy = false; }
      return;
    }
    if (a === 'addguess' && out?.ok) {
      api.addParts(out.parts, 'Tahmini ' + partName(file.name), { minX: partsBounds(out.parts).min[0] });
      api.toast('Tahmini model eklendi: ölçüleri kontrol et');
      close();
    }
  });
}
const nf2 = (v) => (Math.round(v * 10) / 10).toLocaleString('tr-TR');
