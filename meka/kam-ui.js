// Mekatronik Mühendisliği — Eksantrik (kam) tasarımı görünümü. Hesap meka/kam.js'te; bu dosya yalnız gösterir.
// h: { api, getP() → proje (P.kam), changed(), esc, pdfText }
import { kamSanitize, kamHesap, kamDXF, kamCSV, kamGcode, kamRapor, KAM_ORNEK, YASALAR } from './kam.js?v=20261127a';
import { pdfDoc } from '../tx/pdf.js?v=20261112u';

export function createKamUI(h) {
  const { api, esc } = h;
  let aci = 0;
  const Q = () => { const P = h.getP(); if (!P.kam || !Array.isArray(P.kam.plan)) P.kam = kamSanitize(P.kam); return P.kam; };
  const tr = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
  const num = (attr, v, step = 'any') => `<input type="number" inputmode="decimal" step="${step}" data-mkq="${attr}" value="${Number.isFinite(v) ? v : ''}">`;
  const fld = (label, inner, birim = '') => `<label class="mk-f"><span>${esc(label)}</span>${inner}${birim ? `<i>${esc(birim)}</i>` : ''}</label>`;
  const sel = (attr, cur, opts) => `<select data-mkq="${attr}">${opts.map(([o, t]) => `<option value="${esc(o)}"${String(o) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const kont = (ks) => ks.map((c) => `<div class="mk-c ${c.ok ? (c.duzey === 'bilgi' ? 'i' : 'ok') : c.duzey}">${c.ok ? (c.duzey === 'bilgi' ? 'ℹ' : '✓') : c.duzey === 'hata' ? '✗' : '⚠'} ${esc(c.metin)}</div>`).join('');

  // disk + makara (seçili açıda), kam ekseni sabit; disk dönmüş çizilir
  function diskSvg(r) {
    const g = r.g, sg = g.yon === 'cw' ? 1 : -1, th = aci * Math.PI / 180, c = Math.cos(-sg * th), s = Math.sin(-sg * th);
    const rot = (p) => [c * p[0] - s * p[1], s * p[0] + c * p[1]];
    const i = Math.round(aci / 360 * r.rows.length) % r.rows.length, st = r.rows[i].s;
    const Rmax = Math.max(...r.prof.map((p) => Math.hypot(p[0], p[1]))), top = r.d + r.smax + r.Rr * 2 + 8, W = Rmax + 8, V = `${-W} ${-top} ${2 * W} ${top + W}`;
    const path = r.prof.filter((_, k) => k % 4 === 0).map((p, k) => { const q = rot(p); return (k ? 'L' : 'M') + q[0].toFixed(2) + ' ' + (-q[1]).toFixed(2); }).join('') + 'Z';
    const fy = -(r.d + st), fx = g.e, ref = rot([0, g.Rb * 0.9]);
    return `<div class="mk-tbl"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${V}" style="width:100%;max-width:340px;display:block;margin:auto">
<path d="${path}" fill="#0ea5e9" fill-opacity="0.25" stroke="#7dd3fc" stroke-width="${(W / 150).toFixed(2)}"/>
${g.delik > 0 ? `<circle r="${g.delik / 2}" fill="#0f172a" stroke="#7dd3fc" stroke-width="${(W / 150).toFixed(2)}"/>` : ''}
<line x1="0" y1="0" x2="${ref[0].toFixed(2)}" y2="${(-ref[1]).toFixed(2)}" stroke="#f59e0b" stroke-width="${(W / 120).toFixed(2)}"/>
<rect x="${fx - r.Rr * 0.35}" y="${-top}" width="${r.Rr * 0.7}" height="${top + fy}" fill="#64748b"/>
<circle cx="${fx}" cy="${fy}" r="${r.Rr}" fill="#334155" stroke="#e2e8f0" stroke-width="${(W / 150).toFixed(2)}"/>
<circle r="${W / 60}" fill="#f59e0b"/></svg></div>`;
  }
  // s, v, a grafikleri (0–360°), seçili açı işaretli
  function grafik(r, key, ad, birim, renk) {
    const ys = r.rows.map((q) => q[key]), mx = Math.max(...ys), mn = Math.min(...ys, 0), span = mx - mn || 1, W = 330, H = 70;
    const pts = r.rows.filter((_, k) => k % 4 === 0).map((q) => `${(q.deg / 360 * W).toFixed(1)},${(H - (q[key] - mn) / span * H).toFixed(1)}`).join(' ');
    const y0 = H - (0 - mn) / span * H, xa = aci / 360 * W;
    return `<div class="mk-s"><b>${esc(ad)}</b> <i>en büyük ${tr(mx, 2)} · en küçük ${tr(Math.min(...ys), 2)} ${esc(birim)}</i><svg viewBox="-2 -4 ${W + 4} ${H + 8}" style="width:100%;display:block"><line x1="0" y1="${y0}" x2="${W}" y2="${y0}" stroke="#334155"/><polyline points="${pts}" fill="none" stroke="${renk}" stroke-width="1.5"/><line x1="${xa}" y1="0" x2="${xa}" y2="${H}" stroke="#f59e0b"/></svg></div>`;
  }
  function html() {
    const K = Q();
    let s = '<div class="mk-card"><b>⚙ Eksantrik (kam) tasarımı</b> — Dönen milden zamanlı itme hareketi: paketleme, dolum, montaj makineleri için.<div class="mk-n">Ana mil bir tur döner, eksantrik diske yaslanan makaralı kol istediğin açıda, istediğin kadar ileri gider, bekler, geri gelir. Hareketi yaz, diskin şeklini uygulama çizsin.</div><div class="mk-btns"><button data-act="mk-qornek">📋 Şablon: Poşet kaynak çenesi</button></div></div>';
    // hareket planı
    s += '<div class="mk-card"><b>1. Hareket planı</b><div class="mk-n">Her satır: diskin açısı ve o açıda kolun konumu (0 = en geri). Strok aynı kalırsa kol bekler, artarsa ileri itilir, azalırsa geri gelir. İlk satır 0°, son satır 360° olmalı.</div>';
    K.plan.forEach((p, i) => {
      const prev = K.plan[i - 1], tur = !prev ? 'başlangıç' : Math.abs(p[1] - prev[1]) < 1e-9 ? 'bekle' : p[1] > prev[1] ? 'it ↑' : 'geri gel ↓';
      s += `<div class="mk-grid">${fld((i + 1) + '. açı', num(`p.${i}.0`, p[0], 1), '°')}${fld('kol konumu', num(`p.${i}.1`, p[1], 0.5), 'mm')}<div class="mk-f"><span>${esc(tur)}</span>${K.plan.length > 2 ? `<button data-act="mk-qdel-${i}" class="mk-dg">🗑</button>` : ''}</div></div>`;
    });
    s += '<div class="mk-btns"><button data-act="mk-qadd">+ Satır ekle</button></div>';
    s += fld('Hareket eğrisi', sel('yasa', K.yasa, Object.entries(YASALAR).map(([k, v]) => [k, v.ad]))) + '<div class="mk-n">Normal çoğu makineye uygundur. Yüksek devirde "Yumuşak", çok hızlı ve titreşime hassas makinede "En yumuşak" seç (vuruntu ve aşınma azalır).</div></div>';
    // ölçüler
    s += '<div class="mk-card"><b>2. Disk ve makara</b><div class="mk-grid">' + fld('Temel daire yarıçapı (disk en küçük yarıçap)', num('Rb', K.Rb, 1), 'mm') + fld('Makara çapı', num('Dr', K.Dr, 1), 'mm') + fld('Kaçıklık (kol ekseni ile disk merkezi arası)', num('e', K.e, 0.5), 'mm') + fld('Dönüş yönü', sel('yon', K.yon, [['ccw', 'Saat yönünün tersi'], ['cw', 'Saat yönü']])) + fld('Mil deliği çapı', num('delik', K.delik, 1), 'mm') + fld('Disk kalınlığı', num('kalinlik', K.kalinlik, 1), 'mm') + fld('Devir (dakikada çevrim)', num('n', K.n, 1), 'çevrim/dk') + '</div></div>';
    s += '<div class="mk-card"><b>3. Kol ve yay (isteğe bağlı)</b><div class="mk-n">Girersen kolun diskten kalkıp kalkmadığı (zıplama) ve mil torku hesaplanır.</div><div class="mk-grid">' + fld('Kol + makara kütlesi', num('m', K.m, 0.1), 'kg') + fld('Yay sertliği', num('k', K.k, 0.1), 'N/mm') + fld('Yay ön yükü (en geride)', num('F0', K.F0, 1), 'N') + fld('Kol konumu', sel('dikey', K.dikey ? '1' : '0', [['1', 'Düşey (ağırlık diske bastırır)'], ['0', 'Yatay']])) + '</div></div>';
    const r = kamHesap(K);
    if (r.hata) return s + `<div class="mk-card"><div class="mk-c hata">✗ ${esc(r.hata)}</div></div>`;
    s += `<div class="mk-card"><b>4. Sonuç</b> ${r.uygun ? '<span class="mk-c ok">✓ Uygun</span>' : '<span class="mk-c hata">✗ Düzeltilmeli</span>'}`;
    s += diskSvg(r) + `<label class="mk-f"><span>Disk açısı: ${Math.round(aci)}° · kol ${tr(r.rows[Math.round(aci / 360 * r.rows.length) % r.rows.length].s, 1)} mm</span><input type="range" min="0" max="359" step="1" data-mkq="aci" value="${Math.round(aci)}"></label>`;
    s += kont(r.kontroller);
    s += `<div class="mk-s">En yüksek hız <b>${tr(r.vMax, 3)} m/s</b> · ivme <b>+${tr(r.aMax, 2)} / ${tr(r.aMin, 2)} m/s²</b>${r.Nmin != null ? ` · en düşük temas kuvveti <b>${tr(r.Nmin, 1)} N</b> · mil torku <b>${tr(Math.abs(r.Tmax), 2)} N·m</b>` : ''}</div>`;
    s += grafik(r, 's', 'Kol konumu', 'mm', '#7dd3fc') + grafik(r, 'v', 'Hız', 'm/s', '#86efac') + grafik(r, 'a', 'İvme', 'm/s²', '#fca5a5') + grafik(r, 'phi', 'Basınç açısı', '°', '#fde68a');
    s += '</div>';
    s += `<div class="mk-card"><b>5. Üret</b><div class="mk-grid">${fld('Freze çapı', num('takim', K.takim, 1), 'mm')}${fld('Devir', num('devir', K.devir, 100), 'dev/dk')}${fld('İlerleme', num('ilerleme', K.ilerleme, 10), 'mm/dk')}${fld('Kademe derinliği', num('kademe', K.kademe, 0.5), 'mm')}</div>`;
    s += '<div class="mk-btns"><button data-act="mk-qdxf">⬇ DXF indir (lazer / tel erozyon)</button><button data-act="mk-qnc">⬇ CNC\'de kes (G-kodu)</button><button data-act="mk-qpdf">📄 Teknik resim PDF</button><button data-act="mk-qcsv">⬇ Açı – strok tablosu (CSV)</button></div>';
    s += '<div class="mk-n">G-kodu dış konturu keser (sıfır: disk merkezi, Z0 üst yüz). Mil deliği ve kama kanalı ayrıca delinir / raybalanır. İlk çalıştırma: kumanda simülasyonu, tek blok ve düşük ilerleme.</div></div>';
    return s;
  }
  function input(el) {
    const K = Q(), k = el.dataset.mkq, v = Number(String(el.value).replace(',', '.'));
    if (k === 'aci') { aci = Number.isFinite(v) ? v : 0; api.render(); return; }
    let m;
    if ((m = /^p\.(\d+)\.([01])$/.exec(k))) { const p = K.plan[Number(m[1])]; if (p && Number.isFinite(v)) p[Number(m[2])] = v; }
    else if (k === 'yasa' || k === 'yon') K[k] = el.value;
    else if (k === 'dikey') K.dikey = el.value === '1';
    else if (k in K && Number.isFinite(v)) K[k] = v;
    h.changed();
  }
  function pdf(r) {
    const doc = pdfDoc(), T = h.pdfText, g = r.g, ad = api.name() || '';
    // 1. sayfa: teknik resim (sığarsa 1:1)
    const pg = doc.page(210, 297), Rmax = Math.max(...r.prof.map((p) => Math.hypot(p[0], p[1]))), sc = Math.min(1, 85 / Rmax), cx = 105, cy = 170;
    pg.text(14, 285, 12, T('EKSANTRİK (KAM) DİSKİ — TEKNİK RESİM' + (ad ? ' · ' + ad : '')));
    pg.text(14, 279, 8, T(`Ölçek ${sc === 1 ? '1:1' : '1:' + (1 / sc).toFixed(2).replace('.', ',')} · ölçüler mm · kalınlık ${g.kalinlik} mm · mil deliği Ø${g.delik} · dönüş ${g.yon === 'cw' ? 'saat yönü' : 'saat yönünün tersi'}`));
    pg.lineWidth(0.35);
    for (let i = 0; i < r.prof.length; i += 2) { const a = r.prof[i], b = r.prof[(i + 2) % r.prof.length]; pg.line(cx + a[0] * sc, cy + a[1] * sc, cx + b[0] * sc, cy + b[1] * sc); }
    const circ = (R) => { for (let i = 0; i < 120; i++) { const a = i / 120 * 2 * Math.PI, b = (i + 1) / 120 * 2 * Math.PI; pg.line(cx + R * sc * Math.cos(a), cy + R * sc * Math.sin(a), cx + R * sc * Math.cos(b), cy + R * sc * Math.sin(b)); } };
    if (g.delik > 0) circ(g.delik / 2);
    pg.lineWidth(0.15); circ(g.Rb);
    pg.line(cx - Rmax * sc - 5, cy, cx + Rmax * sc + 5, cy); pg.line(cx, cy - Rmax * sc - 5, cx, cy + Rmax * sc + 5);
    pg.text(cx + 1.5, cy + g.Rb * sc + 2, 7, T('0° (kol bu yönde)'));
    pg.text(14, 70, 8, T('Profil koordinatları DXF ve CSV dosyasındadır (0,25° adım). Temel daire ince çizgiyle gösterilmiştir.'));
    // 2. sayfa: rapor
    let p2 = doc.page(210, 297), y = 283;
    for (const raw of kamRapor(r, ad)) { const s = T(raw), size = /^[A-ZÇĞİÖŞÜ ()—-]+$/.test(s.trim()) && s.trim() ? 10 : 8.5; if (y < 16) { p2 = doc.page(210, 297); y = 283; } p2.text(14, y, size, s.slice(0, 120)); y -= size * 0.5; }
    return new Blob([doc.build()], { type: 'application/pdf' });
  }
  function act(a) {
    let m;
    const K = Q(), ad = () => (api.name() || 'proje') + '_eksantrik';
    if (a === 'mk-qornek') { h.getP().kam = KAM_ORNEK(); aci = 0; h.changed(); api.toast('Şablon yüklendi (temsilî değerler)'); return true; }
    if (a === 'mk-qadd') { const L = K.plan, last = L[L.length - 1], prev = L[L.length - 2]; L.splice(L.length - 1, 0, [Math.round((prev[0] + last[0]) / 2), prev[1]]); h.changed(); return true; }
    if ((m = /^mk-qdel-(\d+)$/.exec(a))) { if (K.plan.length > 2) K.plan.splice(Number(m[1]), 1); h.changed(); return true; }
    const r = kamHesap(K);
    if (/^mk-q(dxf|nc|pdf|csv)$/.test(a) && r.hata) { api.toast(r.hata); return true; }
    if (a === 'mk-qdxf') { api.saveBlob(new Blob([kamDXF(r, api.name() || 'EKSANTRIK')], { type: 'application/dxf' }), ad() + '.dxf'); api.toast('İndirildi'); return true; }
    if (a === 'mk-qcsv') { api.saveBlob(new Blob([kamCSV(r)], { type: 'text/csv;charset=utf-8' }), ad() + '.csv'); api.toast('İndirildi'); return true; }
    if (a === 'mk-qnc') { const G = kamGcode(r); if (G.hata) { api.toast(G.hata); return true; } api.saveBlob(new Blob([G.kod], { type: 'text/plain' }), ad() + '.nc'); api.toast(`İndirildi · ham parça en az Ø${Math.ceil(G.stok)} mm`); return true; }
    if (a === 'mk-qpdf') { api.saveBlob(pdf(r), ad() + '.pdf'); api.toast('İndirildi'); return true; }
    return false;
  }
  return { html, input, act };
}
