// Mekatronik Mühendisliği — Eksantrik (kam) tasarımı görünümü. Hesap meka/kam.js'te; bu dosya yalnız gösterir.
// h: { api, getP() → proje (P.kam), changed(), esc, pdfText }
import { kamSanitize, kamHesap, kamDXF, kamCSV, kamGcode, kamRapor, KAM_ORNEK, KAM_ORNEK2, KAM_ORNEK3, KAM_ORNEK4, YASALAR, delikPts, kamaOlcu } from './kam.js?v=20261127c';
import { pdfDoc } from '../tx/pdf.js?v=20261112u';

const SABLON = [['mk-qornek', 'Poşet kaynak çenesi', KAM_ORNEK], ['mk-qornek2', 'Kesme bıçağı kolu (kanallı)', KAM_ORNEK2], ['mk-qornek3', 'Hızlı transfer itici (çift disk)', KAM_ORNEK3], ['mk-qornek4', 'Dolum başlığı iniş (tambur)', KAM_ORNEK4]];
const TIP_ACIK = {
  disk: 'Dış profilli diskte kolu yay ya da ağırlık diske bastırır; hızlanınca kol diskten kalkmasın diye yay hesabı yapılır.',
  kanal: 'Kanallı diskte makara bir oluğun içinde gider: kol diskten kalkamaz, yay gerekmez. Yüksek devirde ve ağır kolda tercih edilir.',
  konjuge: 'Çift diskte aynı mile iki disk takılır; kolun iki makarası var: biri ileri iter, öbürü geri getirir. Yay gerekmez, çok hızlı makinelerde kullanılır. İki disk aynı kama kanalıyla, aynı açıda takılır.',
  tambur: 'Tambur (silindirik) eksantrikte kanal bir silindirin yüzeyindedir; kol silindirin ekseni boyunca ileri geri gider. Uzun stroklu, mile paralel hareketler için (dolum başlığı, iniş–kalkış).',
};

export function createKamUI(h) {
  const { api, esc } = h;
  let aci = 0;
  const Q = () => { const P = h.getP(); if (!P.kam || !Array.isArray(P.kam.plan)) P.kam = kamSanitize(P.kam); return P.kam; };
  const tr = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
  const num = (attr, v, step = 'any') => `<input type="number" inputmode="decimal" step="${step}" data-mkq="${attr}" value="${Number.isFinite(v) ? v : ''}">`;
  const fld = (label, inner, birim = '') => `<label class="mk-f"><span>${esc(label)}</span>${inner}${birim ? `<i>${esc(birim)}</i>` : ''}</label>`;
  const sel = (attr, cur, opts) => `<select data-mkq="${attr}">${opts.map(([o, t]) => `<option value="${esc(o)}"${String(o) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const kont = (ks) => ks.map((c) => `<div class="mk-c ${c.ok ? (c.duzey === 'bilgi' ? 'i' : 'ok') : c.duzey}">${c.ok ? (c.duzey === 'bilgi' ? 'ℹ' : '✓') : c.duzey === 'hata' ? '✗' : '⚠'} ${esc(c.metin)}</div>`).join('');
  const satir = (r) => r.rows[Math.round(aci / 360 * r.rows.length) % r.rows.length];
  const g0 = (v) => Math.ceil(v);

  // disk(ler) + makara(lar) seçili açıda; kam ekseni sabit, disk dönmüş çizilir
  function diskSvg(r) {
    const g = r.g, sg = g.yon === 'cw' ? 1 : -1, th = aci * Math.PI / 180, c = Math.cos(-sg * th), s = Math.sin(-sg * th);
    const rot = (p) => [c * p[0] - s * p[1], s * p[0] + c * p[1]], q = satir(r);
    const Rd = r.Rdis, xs = [-Rd, Rd], ys = [-Rd, Rd];
    for (const o of r.rows) { xs.push(o.bx - r.Rr, o.bx + r.Rr); ys.push(o.by + r.Rr, o.by - r.Rr); if (r.konj) { xs.push(o.b2x - r.Rr, o.b2x + r.Rr); ys.push(o.b2y - r.Rr, o.b2y + r.Rr); } }
    if (r.sal) { xs.push(r.A[0] + 8); ys.push(-8, 8); } else if (r.konj) xs.push(Math.max(Rd, ...r.rows.map((o) => o.bx)) + r.Rr + 8); else ys.push(Math.max(...r.rows.map((o) => o.by)) + r.Rr * 2 + 8);
    const x0 = Math.min(...xs) - 6, x1 = Math.max(...xs) + 6, y0 = Math.min(...ys) - 6, y1 = Math.max(...ys) + 6, W = Math.max(x1 - x0, y1 - y0), sw = (W / 300).toFixed(2);
    const path = (pts, k0 = 4) => pts.filter((_, k) => k % k0 === 0).map((p, k) => { const o = rot(p); return (k ? 'L' : 'M') + o[0].toFixed(2) + ' ' + (-o[1]).toFixed(2); }).join('') + 'Z';
    const b0 = Math.hypot(r.rows[0].bx, r.rows[0].by), u = [r.rows[0].bx / b0, r.rows[0].by / b0], r0 = rot([u[0] * g.Rb * 0.9, u[1] * g.Rb * 0.9]);
    let d = '';
    if (r.konj) d += `<path d="${path(r.ik.prof)}" fill="#a855f7" fill-opacity="0.18" stroke="#c4b5fd" stroke-width="${sw}" stroke-dasharray="${(W / 80).toFixed(2)} ${(W / 160).toFixed(2)}"/>`;
    if (r.kanal) d += `<circle r="${Rd}" fill="#0ea5e9" fill-opacity="0.25" stroke="#7dd3fc" stroke-width="${sw}"/><path d="${path(r.prof2)}" fill="#0f172a" stroke="#7dd3fc" stroke-width="${sw}"/><path d="${path(r.prof)}" fill="#0c3a55" stroke="#7dd3fc" stroke-width="${sw}"/>`;
    else d += `<path d="${path(r.prof)}" fill="#0ea5e9" fill-opacity="0.25" stroke="#7dd3fc" stroke-width="${sw}"/>`;
    if (g.delik > 0) d += `<path d="${path(delikPts(g.delik, u, g.kama), 1)}" fill="#0f172a" stroke="#7dd3fc" stroke-width="${sw}"/>`;
    d += `<line x1="0" y1="0" x2="${r0[0].toFixed(2)}" y2="${(-r0[1]).toFixed(2)}" stroke="#f59e0b" stroke-width="${(W / 200).toFixed(2)}"/>`;
    const kol = `stroke="#64748b" stroke-width="${(r.Rr * 0.6).toFixed(2)}" stroke-linecap="round"`;
    if (r.sal) {
      d += `<line x1="${r.A[0]}" y1="0" x2="${q.bx.toFixed(2)}" y2="${(-q.by).toFixed(2)}" ${kol}/>`;
      if (r.konj) d += `<line x1="${r.A[0]}" y1="0" x2="${q.b2x.toFixed(2)}" y2="${(-q.b2y).toFixed(2)}" ${kol}/>`;
      d += `<circle cx="${r.A[0]}" cy="0" r="${(W / 60).toFixed(2)}" fill="#e2e8f0"/>`;
    } else if (r.konj) {
      // çatal: iki makarayı birleştiren gövde diskin yanından geçer
      const xr = Math.max(Rd, ...r.rows.map((o) => o.bx)) + r.Rr + 4;
      d += `<path d="M${q.bx.toFixed(2)} ${(-q.by).toFixed(2)} L${xr.toFixed(2)} ${(-q.by).toFixed(2)} L${xr.toFixed(2)} ${(-q.b2y).toFixed(2)} L${q.b2x.toFixed(2)} ${(-q.b2y).toFixed(2)}" fill="none" ${kol}/>`;
    } else d += `<rect x="${(q.bx - r.Rr * 0.35).toFixed(2)}" y="${(-y1).toFixed(2)}" width="${(r.Rr * 0.7).toFixed(2)}" height="${Math.max(0, y1 - q.by).toFixed(2)}" fill="#64748b"/>`;
    d += `<circle cx="${q.bx.toFixed(2)}" cy="${(-q.by).toFixed(2)}" r="${r.Rr}" fill="#334155" stroke="#e2e8f0" stroke-width="${sw}"/>`;
    if (r.konj) d += `<circle cx="${q.b2x.toFixed(2)}" cy="${(-q.b2y).toFixed(2)}" r="${r.Rr}" fill="#3b2a55" stroke="#c4b5fd" stroke-width="${sw}"/>`;
    d += `<circle r="${(W / 120).toFixed(2)}" fill="#f59e0b"/>`;
    return `<div class="mk-tbl"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${(-y1).toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}" style="width:100%;max-width:340px;display:block;margin:auto">${d}</svg></div>`
      + (r.konj ? '<div class="mk-n">Mavi: 1. disk (ileri iter) · mor kesik çizgi: 2. disk (geri getirir), aynı milde arkada.</div>' : '');
  }
  // tambur: silindir yüzeyinin açınımı (düz serilmiş), kanal ve makara
  function tamburSvg(r) {
    const W = 2 * Math.PI * r.Ro, H = r.Lc, q = satir(r), x = aci / 360 * W, sw = (W / 400).toFixed(2);
    const band = r.fl1.filter((_, k) => k % 4 === 0).map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ' ' + (H - p[1]).toFixed(1)).join('') + r.fl2.filter((_, k) => k % 4 === 0).reverse().map((p) => 'L' + p[0].toFixed(1) + ' ' + (H - p[1]).toFixed(1)).join('') + 'Z';
    return `<div class="mk-tbl"><svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 ${(W + 8).toFixed(1)} ${(H + 8).toFixed(1)}" style="width:100%;display:block">
<rect width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="#0ea5e9" fill-opacity="0.25" stroke="#7dd3fc" stroke-width="${sw}"/><path d="${band}" fill="#0f172a" stroke="#7dd3fc" stroke-width="${sw}"/>
<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${H}" stroke="#f59e0b" stroke-width="${sw}" stroke-dasharray="4 3"/><circle cx="${x.toFixed(1)}" cy="${(H - r.x0 - q.s).toFixed(1)}" r="${r.Rr}" fill="#334155" stroke="#e2e8f0" stroke-width="${sw}"/></svg></div>
<div class="mk-n">Silindirin yüzeyi düz serilmiş hâli (açınım): yatay = silindirin çevresi (0° → 360°), dikey = silindir boyu. Turuncu çizgi seçili açı.</div>`;
  }
  function grafik(r, key, ad, birim, renk) {
    const ys = r.rows.map((q) => q[key]), mx = Math.max(...ys), mn = Math.min(...ys, 0), span = mx - mn || 1, W = 330, H = 70;
    const pts = r.rows.filter((_, k) => k % 4 === 0).map((q) => `${(q.deg / 360 * W).toFixed(1)},${(H - (q[key] - mn) / span * H).toFixed(1)}`).join(' ');
    const y0 = H - (0 - mn) / span * H, xa = aci / 360 * W;
    return `<div class="mk-s"><b>${esc(ad)}</b> <i>en büyük ${tr(mx, 2)} · en küçük ${tr(Math.min(...ys), 2)} ${esc(birim)}</i><svg viewBox="-2 -4 ${W + 4} ${H + 8}" style="width:100%;display:block"><line x1="0" y1="${y0}" x2="${W}" y2="${y0}" stroke="#334155"/><polyline points="${pts}" fill="none" stroke="${renk}" stroke-width="1.5"/><line x1="${xa}" y1="0" x2="${xa}" y2="${H}" stroke="#f59e0b"/></svg></div>`;
  }
  function html() {
    const K = Q();
    let s = '<div class="mk-card"><b>⚙ Eksantrik (kam) tasarımı</b> — Dönen milden zamanlı itme hareketi: paketleme, dolum, montaj makineleri için.<div class="mk-n">Ana mil bir tur döner, eksantrik diske yaslanan makaralı kol istediğin açıda, istediğin kadar ileri gider, bekler, geri gelir. Hareketi yaz, diskin şeklini uygulama çizsin.</div><div class="mk-btns">' + SABLON.map(([a, t]) => `<button data-act="${a}">📋 Şablon: ${esc(t)}</button>`).join('') + '</div></div>';
    const tb = K.kamTur === 'tambur', sal = K.izleyici === 'salinim' && !tb, kanal = K.kamTur === 'kanal', konj = K.kamTur === 'konjuge', bir = sal ? '°' : 'mm', kmo = K.delik > 0 ? kamaOlcu(K.delik) : null;
    s += '<div class="mk-card"><b>Tip</b><div class="mk-grid">' + fld('Eksantrik', sel('kamTur', K.kamTur, [['disk', 'Dış profilli disk (yayla bastırılır)'], ['kanal', 'Kanallı / oluklu disk (yay gerekmez)'], ['konjuge', 'Çift disk (biri iter, biri geri getirir)'], ['tambur', 'Tambur / silindirik (mile paralel hareket)']]))
      + (tb ? '' : fld('Kol', sel('izleyici', K.izleyici, [['oteleme', 'Düz giden (kızakta)'], ['salinim', 'Sallanan (milden dönen kol)']]))) + '</div>';
    s += '<div class="mk-n">' + esc(TIP_ACIK[K.kamTur]) + ' ' + (sal ? 'Sallanan kolda kol bir milden döner; hareket planındaki değerler kolun açısıdır (derece).' : tb ? 'Hareket planındaki değerler kolun silindir boyunca yoludur (mm).' : 'Düz giden kolda hareket planındaki değerler kolun yoludur (mm).') + '</div></div>';
    // hareket planı
    s += '<div class="mk-card"><b>1. Hareket planı</b><div class="mk-n">Her satır: ' + (tb ? 'silindirin' : 'diskin') + ' açısı ve o açıda kolun ' + (sal ? 'açısı' : 'konumu') + ' (0 = en geri). Strok aynı kalırsa kol bekler, artarsa ileri itilir, azalırsa geri gelir. İlk satır 0°, son satır 360° olmalı.</div>';
    K.plan.forEach((p, i) => {
      const prev = K.plan[i - 1], tur = !prev ? 'başlangıç' : Math.abs(p[1] - prev[1]) < 1e-9 ? 'bekle' : p[1] > prev[1] ? 'it ↑' : 'geri gel ↓';
      s += `<div class="mk-grid">${fld((i + 1) + '. açı', num(`p.${i}.0`, p[0], 1), '°')}${fld(sal ? 'kol açısı' : 'kol konumu', num(`p.${i}.1`, p[1], 0.5), bir)}<div class="mk-f"><span>${esc(tur)}</span>${K.plan.length > 2 ? `<button data-act="mk-qdel-${i}" class="mk-dg">🗑</button>` : ''}</div></div>`;
    });
    s += '<div class="mk-btns"><button data-act="mk-qadd">+ Satır ekle</button></div>';
    s += fld('Hareket eğrisi', sel('yasa', K.yasa, Object.entries(YASALAR).map(([k, v]) => [k, v.ad]))) + '<div class="mk-n">Normal çoğu makineye uygundur. Yüksek devirde "Yumuşak", çok hızlı ve titreşime hassas makinede "En yumuşak" seç (vuruntu ve aşınma azalır).</div></div>';
    // ölçüler
    s += `<div class="mk-card"><b>2. ${tb ? 'Silindir' : konj ? 'Diskler' : 'Disk'} ve makara</b><div class="mk-grid">`;
    if (tb) s += fld('Silindir dış çapı', num('Dc', K.Dc, 1), 'mm') + fld('Makara çapı (= kanal genişliği)', num('Dr', K.Dr, 1), 'mm') + fld('Kanal derinliği', num('kanalDerin', K.kanalDerin, 0.5), 'mm') + fld('Kanalın iki yanındaki et (boy payı)', num('kenar', K.kenar, 1), 'mm');
    else {
      s += fld('Temel daire yarıçapı (disk en küçük yarıçap)', num('Rb', K.Rb, 1), 'mm') + fld('Makara çapı', num('Dr', K.Dr, 1), 'mm');
      s += sal ? fld('Kol mili ile disk mili arası', num('C', K.C, 1), 'mm') + fld('Kol boyu (kol milinden makara merkezine)', num('L', K.L, 1), 'mm') : fld('Kaçıklık (kol ekseni ile disk merkezi arası)', num('e', K.e, 0.5), 'mm');
      if (konj && !sal) s += fld('İki makara arası (0 = otomatik)', num('Dk', K.Dk, 1), 'mm');
      s += fld('Dönüş yönü', sel('yon', K.yon, [['ccw', 'Saat yönünün tersi'], ['cw', 'Saat yönü']])) + fld(konj ? 'Disk kalınlığı (her biri)' : 'Disk kalınlığı', num('kalinlik', K.kalinlik, 1), 'mm');
      if (kanal) s += fld('Kanal derinliği', num('kanalDerin', K.kanalDerin, 0.5), 'mm') + fld('Kanal dışındaki et (dış çap payı)', num('kenar', K.kenar, 1), 'mm');
    }
    s += fld('Mil deliği çapı', num('delik', K.delik, 1), 'mm') + fld('Kama kanalı', sel('kama', K.kama ? '1' : '0', [['0', 'Yok'], ['1', kmo ? `DIN 6885 (${kmo.b} mm genişlik, ${String(kmo.t2).replace('.', ',')} mm derinlik)` : 'DIN 6885 (bu çapa yok)']])) + fld('Devir (dakikada çevrim)', num('n', K.n, 1), 'çevrim/dk') + '</div>';
    if (konj && sal) s += '<div class="mk-n">İkinci kol birinciyle aynı milde, ona göre aynalı (simetrik) durur.</div>';
    s += '</div>';
    const kapali = kanal || konj || tb;
    s += '<div class="mk-card"><b>3. Kol ve yay (isteğe bağlı)</b><div class="mk-n">' + (kapali ? `Girersen ${konj ? 'yükün öbür diske geçtiği' : 'makaranın kanalın öbür yanağına geçtiği'} yerler (vuruntu) ve mil torku hesaplanır.` : 'Girersen kolun diskten kalkıp kalkmadığı (zıplama) ve mil torku hesaplanır.') + (sal ? ' Sallanan kolda kütle ve yay makaranın olduğu noktaya göre girilir.' : '') + '</div><div class="mk-grid">'
      + fld(sal ? 'Kol + makara kütlesi (makara noktasına indirgenmiş)' : 'Kol + makara kütlesi', num('m', K.m, 0.1), 'kg') + fld('Yay sertliği', num('k', K.k, 0.1), 'N/mm') + fld('Yay ön yükü (en geride)', num('F0', K.F0, 1), 'N')
      + (sal ? '' : fld('Kol konumu', sel('dikey', K.dikey ? '1' : '0', [['1', tb ? 'Düşey (ağırlık kolu aşağı çeker)' : 'Düşey (ağırlık diske bastırır)'], ['0', 'Yatay']]))) + '</div></div>';
    const r = kamHesap(K);
    if (r.hata) return s + `<div class="mk-card"><div class="mk-c hata">✗ ${esc(r.hata)}</div></div>`;
    s += `<div class="mk-card"><b>4. Sonuç</b> ${r.uygun ? '<span class="mk-c ok">✓ Uygun</span>' : '<span class="mk-c hata">✗ Düzeltilmeli</span>'}`;
    s += (tb ? tamburSvg(r) : diskSvg(r)) + `<label class="mk-f"><span>${tb ? 'Silindir' : 'Disk'} açısı: ${Math.round(aci)}° · kol ${tr(satir(r).s, 1)} ${bir}</span><input type="range" min="0" max="359" step="1" data-mkq="aci" value="${Math.round(aci)}"></label>`;
    s += kont(r.kontroller);
    s += `<div class="mk-s">En yüksek ${sal ? 'makara hızı' : 'hız'} <b>${tr(r.vMax, 3)} m/s</b> · ivme <b>+${tr(r.aMax, 2)} / ${tr(r.aMin, 2)} m/s²</b>${r.Nmin != null ? ` · ${r.kapali ? `en büyük temas kuvveti <b>${tr(r.Nmax, 1)} N</b>` : `en düşük temas kuvveti <b>${tr(r.Nmin, 1)} N</b>`} · mil torku <b>${tr(Math.abs(r.Tmax), 2)} N·m</b>` : ''}${tb ? ` · silindir boyu <b>${tr(r.Lc, 1)} mm</b>` : r.kanal || r.konj ? ` · dış çap <b>Ø${tr(2 * r.Rdis, 1)} mm</b>` : ''}</div>`;
    s += grafik(r, 's', sal ? 'Kol açısı' : 'Kol konumu', bir, '#7dd3fc') + grafik(r, 'v', sal ? 'Makara hızı' : 'Hız', 'm/s', '#86efac') + grafik(r, 'a', sal ? 'Makara ivmesi' : 'İvme', 'm/s²', '#fca5a5') + grafik(r, 'phi', konj ? 'Basınç açısı (1. disk)' : tb ? 'Basınç açısı (kanal dibinde)' : 'Basınç açısı', '°', '#fde68a');
    if (konj) s += grafik(r, 'phi2', 'Basınç açısı (2. disk)', '°', '#c4b5fd');
    s += '</div>';
    s += `<div class="mk-card"><b>5. Üret</b><div class="mk-grid">${fld(tb ? 'Freze çapı (makara çapına eşit olmalı)' : 'Freze çapı', num('takim', K.takim, 1), 'mm')}${fld('Devir', num('devir', K.devir, 100), 'dev/dk')}${fld('İlerleme', num('ilerleme', K.ilerleme, 10), 'mm/dk')}${fld('Kademe derinliği', num('kademe', K.kademe, 0.5), 'mm')}</div>`;
    s += '<div class="mk-btns">' + (tb ? '<button data-act="mk-qdxf">⬇ DXF indir (açınım: silindire sarıp işaretle)</button><button data-act="mk-qnc">⬇ CNC\'de kes (4. eksen G-kodu)</button>'
      : `<button data-act="mk-qdxf">⬇ DXF indir (lazer / tel erozyon${konj ? ', iki disk' : ''})</button>` + (konj ? '<button data-act="mk-qnc">⬇ CNC\'de kes: 1. disk</button><button data-act="mk-qnc2">⬇ CNC\'de kes: 2. disk</button>' : '<button data-act="mk-qnc">⬇ CNC\'de kes (G-kodu)</button>'))
      + '<button data-act="mk-qpdf">📄 Teknik resim PDF</button><button data-act="mk-qcsv">⬇ Açı – strok tablosu (CSV)</button></div>';
    const not = tb ? 'G-kodu 4. eksenli (döner tablalı) freze içindir: silindir ekseni makinenin X\'i, dönme A ekseni; takım ekseni silindirin eksenini kesmeli. Freze çapı makara çapına eşit olmalı (kanal yanakları tek geçişte doğru çıkar). Sıfır: X0 sol alın yüzü, Z0 silindirin üst yüzeyi, A0 = 0° işareti. Mil deliği ve kama kanalı ayrıca işlenir.'
      : kanal ? 'G-kodu kanalı açar: merkezden kesen parmak frezeyle rampayla iner, takım makaradan küçükse yanaklara doğru ek turlar atar. Freze kanal genişliğinden (makara çapı) büyük olamaz. Dış çap tornada, mil deliği ve kama kanalı ayrıca işlenir. Sıfır: disk merkezi, Z0 üst yüz.'
        : 'G-kodu dış konturu keser. Mil deliği ve kama kanalı ayrıca işlenir (kama kanalı 0° çizgisi yönünde).' + (konj ? ' İki disk aynı açıda bağlanır: kama kanalları aynı hizada olmalı.' : '') + ' Sıfır: disk merkezi, Z0 üst yüz.';
    s += '<div class="mk-n">' + esc(not) + ' İlk çalıştırma: kumanda simülasyonu, tek blok ve düşük ilerleme.</div></div>';
    return s;
  }
  function input(el) {
    const K = Q(), k = el.dataset.mkq, v = Number(String(el.value).replace(',', '.'));
    if (k === 'aci') { aci = Number.isFinite(v) ? v : 0; api.render(); return; }
    let m;
    if ((m = /^p\.(\d+)\.([01])$/.exec(k))) { const p = K.plan[Number(m[1])]; if (p && Number.isFinite(v)) p[Number(m[2])] = v; }
    else if (k === 'yasa' || k === 'yon' || k === 'kamTur' || k === 'izleyici') { K[k] = el.value; Object.assign(K, kamSanitize(K)); if (k === 'kamTur' && K.kamTur === 'tambur') K.takim = K.Dr; }
    else if (k === 'dikey' || k === 'kama') K[k] = el.value === '1';
    else if (k in K && Number.isFinite(v)) K[k] = v;
    h.changed();
  }
  function pdf(r) {
    const doc = pdfDoc(), T = h.pdfText, g = r.g, ad = api.name() || '', kmo = g.delik > 0 && g.kama ? kamaOlcu(g.delik) : null;
    const delikYazi = `mil deliği Ø${g.delik}${kmo ? ` + kama kanalı ${kmo.b} × ${String(kmo.t2).replace('.', ',')} (DIN 6885)` : ''}`;
    if (r.tambur) {
      // açınım (yatay sayfa)
      const pg = doc.page(297, 210), W = 2 * Math.PI * r.Ro, sc = Math.min(1, 265 / W, 140 / r.Lc), ox = 16, oy = 40;
      pg.text(14, 198, 12, T('TAMBUR (SİLİNDİRİK) EKSANTRİK — YÜZEY AÇINIMI' + (ad ? ' · ' + ad : '')));
      pg.text(14, 192, 8, T(`Ölçek ${sc === 1 ? '1:1' : '1:' + (1 / sc).toFixed(2).replace('.', ',')} · silindir Ø${g.Dc} × ${r.Lc.toFixed(1)} mm · kanal ${g.Dr} mm genişlik, ${g.kanalDerin} mm derinlik · ${delikYazi}`));
      pg.lineWidth(0.35);
      const L = (a, b) => pg.line(ox + a[0] * sc, oy + a[1] * sc, ox + b[0] * sc, oy + b[1] * sc);
      L([0, 0], [W, 0]); L([W, 0], [W, r.Lc]); L([W, r.Lc], [0, r.Lc]); L([0, r.Lc], [0, 0]);
      for (const f of [r.fl1, r.fl2]) for (let i = 0; i + 2 < f.length; i += 2) L(f[i], f[i + 2]);
      pg.lineWidth(0.15); for (let i = 0; i + 2 < r.center.length; i += 4) L(r.center[i], r.center[i + 2]);
      for (let a = 0; a <= 360; a += 90) { const x = a / 360 * W; L([x, -3], [x, 0]); pg.text(ox + x * sc - 2, oy - 7, 7, T(a + '°')); }
      pg.text(14, 22, 8, T('Yatay: dış yüzey çevresi (0° → 360°), dikey: silindir boyu (alt kenar = sol alın yüzü). Kâğıda 1:1 basılıp silindire sarılarak işaretlenebilir.'));
    } else {
      const disk = (prof, baslik, ikinci = false) => {
        const pg = doc.page(210, 297), Rmax = r.Rdis, sc = Math.min(1, 85 / Rmax), cx = 105, cy = 170;
        pg.text(14, 285, 12, T(baslik + (ad ? ' · ' + ad : '')));
        pg.text(14, 279, 8, T(`Ölçek ${sc === 1 ? '1:1' : '1:' + (1 / sc).toFixed(2).replace('.', ',')} · ölçüler mm · kalınlık ${g.kalinlik} mm${r.kanal ? ` · kanal ${g.Dr} mm genişlik, ${g.kanalDerin} mm derinlik · dış çap Ø${(2 * r.Rdis).toFixed(1)}` : ''} · ${delikYazi} · dönüş ${g.yon === 'cw' ? 'saat yönü' : 'saat yönünün tersi'}`));
        pg.lineWidth(0.35);
        const L = (a, b) => pg.line(cx + a[0] * sc, cy + a[1] * sc, cx + b[0] * sc, cy + b[1] * sc);
        const kapaliCiz = (pts, k = 2) => { for (let i = 0; i < pts.length; i += k) L(pts[i], pts[(i + k) % pts.length]); };
        const circ = (R) => { const pts = []; for (let i = 0; i < 120; i++) pts.push([R * Math.cos(i / 120 * 2 * Math.PI), R * Math.sin(i / 120 * 2 * Math.PI)]); kapaliCiz(pts, 1); };
        kapaliCiz(prof);
        if (r.kanal) { kapaliCiz(r.prof2); circ(r.Rdis); }
        const b0 = Math.hypot(r.rows[0].bx, r.rows[0].by), u = [r.rows[0].bx / b0, r.rows[0].by / b0];
        if (g.delik > 0) kapaliCiz(delikPts(g.delik, u, g.kama), 1);
        pg.lineWidth(0.15); if (!ikinci) circ(g.Rb);
        pg.line(cx - Rmax * sc - 5, cy, cx + Rmax * sc + 5, cy); pg.line(cx, cy - Rmax * sc - 5, cx, cy + Rmax * sc + 5);
        L([0, 0], [u[0] * g.Rb, u[1] * g.Rb]); pg.text(cx + u[0] * g.Rb * sc + 1.5, cy + u[1] * g.Rb * sc + 2, 7, T(ikinci ? '0° (1. makara bu yönde; kama kanalı aynı hizada)' : '0° (makara bu yönde)'));
        if (r.sal && r.A[0] * sc < 100) { const R = 2 / sc, pts = []; for (let i = 0; i < 24; i++) pts.push([r.A[0] + R * Math.cos(i / 24 * 2 * Math.PI), R * Math.sin(i / 24 * 2 * Math.PI)]); kapaliCiz(pts, 1); pg.text(cx + r.A[0] * sc + 2, cy + 2, 7, T(`kol mili (${g.C} mm)`)); }
        pg.text(14, 70, 8, T('Profil koordinatları DXF ve CSV dosyasındadır (0,25° adım).' + (ikinci ? '' : ' Temel daire ince çizgiyle gösterilmiştir.')));
      };
      if (r.konj) { disk(r.prof, 'ÇİFT DİSKLİ EKSANTRİK — 1. DİSK (İLERİ İTER)'); disk(r.ik.prof, 'ÇİFT DİSKLİ EKSANTRİK — 2. DİSK (GERİ GETİRİR)', true); } else disk(r.prof, (r.kanal ? 'KANALLI ' : '') + 'EKSANTRİK (KAM) DİSKİ — TEKNİK RESİM');
    }
    // rapor
    let p2 = doc.page(210, 297), y = 283;
    for (const raw of kamRapor(r, ad)) {
      const s = T(raw), size = /^[A-ZÇĞİÖŞÜ ()—-]+$/.test(s.trim()) && s.trim() ? 10 : 8.5;
      for (let k = 0; k < Math.max(1, s.length); k += 120) { if (y < 16) { p2 = doc.page(210, 297); y = 283; } p2.text(14, y, size, (k ? '     ' : '') + s.slice(k, k + 120)); y -= size * 0.5; }
    }
    return new Blob([doc.build()], { type: 'application/pdf' });
  }
  function act(a) {
    let m;
    const K = Q(), ad = () => (api.name() || 'proje') + '_eksantrik';
    const sb = SABLON.find((x) => x[0] === a);
    if (sb) { h.getP().kam = sb[2](); aci = 0; h.changed(); api.toast('Şablon yüklendi (temsilî değerler)'); return true; }
    if (a === 'mk-qadd') { const L = K.plan, last = L[L.length - 1], prev = L[L.length - 2]; L.splice(L.length - 1, 0, [Math.round((prev[0] + last[0]) / 2), prev[1]]); h.changed(); return true; }
    if ((m = /^mk-qdel-(\d+)$/.exec(a))) { if (K.plan.length > 2) K.plan.splice(Number(m[1]), 1); h.changed(); return true; }
    const r = kamHesap(K);
    if (/^mk-q(dxf|nc|nc2|pdf|csv)$/.test(a) && r.hata) { api.toast(r.hata); return true; }
    if (a === 'mk-qdxf') { api.saveBlob(new Blob([kamDXF(r, api.name() || 'EKSANTRIK')], { type: 'application/dxf' }), ad() + (r.tambur ? '_acinim' : '') + '.dxf'); api.toast('İndirildi'); return true; }
    if (a === 'mk-qcsv') { api.saveBlob(new Blob([kamCSV(r)], { type: 'text/csv;charset=utf-8' }), ad() + '.csv'); api.toast('İndirildi'); return true; }
    if (a === 'mk-qnc' || a === 'mk-qnc2') {
      const d2 = a === 'mk-qnc2', G = kamGcode(r, d2 ? { disk: 2 } : {});
      if (G.hata) { api.toast(G.hata); return true; }
      api.saveBlob(new Blob([G.kod], { type: 'text/plain' }), ad() + (r.konj ? (d2 ? '_disk2' : '_disk1') : '') + '.nc');
      api.toast(r.tambur ? `İndirildi · silindir Ø${g0(G.stok)} × ${g0(G.boy)} mm` : r.kanal ? `İndirildi · disk Ø${g0(G.stok)} mm, her kademede ${G.tur} tur` : `İndirildi · ham parça en az Ø${g0(G.stok)} mm`);
      return true;
    }
    if (a === 'mk-qpdf') { api.saveBlob(pdf(r), ad() + '.pdf'); api.toast('İndirildi'); return true; }
    return false;
  }
  return { html, input, act };
}
