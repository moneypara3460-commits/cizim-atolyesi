// Mekatronik Mühendisliği — Mekanizmalar sekmesi: Malta haçı, krank–biyel, dört çubuk, dişli mukavemeti ve basma yayı. Hesaplar meka/malta.js, meka/krank.js, meka/dortcubuk.js, meka/disli.js, meka/yay.js.
// h: { api, getP() → proje (P.mek), changed(), esc, pdfText }
import { maltaSanitize, maltaHesap, maltaDXF, maltaCSV, maltaRapor, MALTA_ORNEK, beta } from './malta.js?v=20261128a';
import { krankSanitize, krankHesap, krankCSV, krankRapor, KRANK_ORNEK, konum, stroktanR } from './krank.js?v=20261128a';
import { dortSanitize, dortHesap, dortCSV, dortRapor, DORT_ORNEK, salinimdanTasarla } from './dortcubuk.js?v=20261128a';
import { disliSanitize, disliHesap, disliRapor, DISLI_ORNEK, MALZEME, KALITE, DARBE } from './disli.js?v=20261128a';
import { yaySanitize, yayHesap, yayRapor, YAY_ORNEK, MALZEME as YAY_MAT, UCLAR, sarimdanR } from './yay.js?v=20261128a';
import { gearOutline } from '../mech.js?v=20261112u';
import { pdfDoc } from '../tx/pdf.js?v=20261112u';

const PI = Math.PI;
export function mekSanitize(o) { const x = o && typeof o === 'object' ? o : {}; return { tur: ['krank', 'dort', 'disli', 'yay'].includes(x.tur) ? x.tur : 'malta', malta: maltaSanitize(x.malta), krank: krankSanitize(x.krank), dort: dortSanitize(x.dort), disli: disliSanitize(x.disli), yay: yaySanitize(x.yay) }; }

export function createMekUI(h) {
  const { api, esc } = h;
  let aci = 30, hedefStrok = '', hedefPsi = '', hedefR = '';
  const Q = () => { const P = h.getP(); if (!P.mek || !P.mek.malta || !P.mek.dort || !P.mek.disli || !P.mek.yay) P.mek = mekSanitize(P.mek); return P.mek; };
  const tr = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
  const num = (attr, v, step = 'any') => `<input type="number" inputmode="decimal" step="${step}" data-mkm="${attr}" value="${Number.isFinite(v) ? v : ''}">`;
  const fld = (label, inner, birim = '') => `<label class="mk-f"><span>${esc(label)}</span>${inner}${birim ? `<i>${esc(birim)}</i>` : ''}</label>`;
  const sel = (attr, cur, opts) => `<select data-mkm="${attr}">${opts.map(([o, t]) => `<option value="${esc(o)}"${String(o) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const kont = (ks) => ks.map((c) => `<div class="mk-c ${c.ok ? (c.duzey === 'bilgi' ? 'i' : 'ok') : c.duzey}">${c.ok ? (c.duzey === 'bilgi' ? 'ℹ' : '✓') : c.duzey === 'hata' ? '✗' : '⚠'} ${esc(c.metin)}</div>`).join('');
  const rot = (p, t) => [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t)];
  const pth = (pts, f = (p) => p, k0 = 1) => pts.filter((_, k) => k % k0 === 0).map((p, k) => { const q = f(p); return (k ? 'L' : 'M') + q[0].toFixed(2) + ' ' + (-q[1]).toFixed(2); }).join('') + 'Z';
  function grafik(rows, key, ad, birim, renk, xkey = 'deg', sifir = true) {
    const ys = rows.map((q) => q[key]), mx = Math.max(...ys), mn = sifir ? Math.min(...ys, 0) : Math.min(...ys), span = mx - mn || 1, W = 330, H = 62;
    const pts = rows.filter((_, k) => k % 3 === 0).map((q) => `${(q[xkey] / 360 * W).toFixed(1)},${(H - (q[key] - mn) / span * H).toFixed(1)}`).join(' ');
    const y0 = sifir ? H - (0 - mn) / span * H : H, xa = aci / 360 * W;
    return `<div class="mk-s"><b>${esc(ad)}</b> <i>en büyük ${tr(mx, 2)} · en küçük ${tr(Math.min(...ys), 2)} ${esc(birim)}</i><svg viewBox="-2 -4 ${W + 4} ${H + 8}" style="width:100%;display:block"><line x1="0" y1="${y0}" x2="${W}" y2="${y0}" stroke="#334155"/><polyline points="${pts}" fill="none" stroke="${renk}" stroke-width="1.5"/><line x1="${xa}" y1="0" x2="${xa}" y2="${H}" stroke="#f59e0b"/></svg></div>`;
  }

  const grafikX = (rows, key, ad, birim, renk, ax) => { const save = aci; aci = ax; const out = grafik(rows, key, ad, birim, renk, 'x'); aci = save; return out; };
  /* ---------------- Malta haçı ---------------- */
  function maltaSvg(r) {
    const g = r.g, phi = ((aci + 180) % 360 - 180) * PI / 180, ic = Math.abs(phi) <= r.alfa, th = ic ? -beta(phi, r.lam) : (phi > 0 ? -PI / r.z : PI / r.z);
    const pin = [g.a - r.r * Math.cos(phi), -r.r * Math.sin(phi)], W = r.Ro + g.a + r.Rd + 10, sw = (W / 300).toFixed(2);
    const x0 = -r.Ro - 6, x1 = g.a + Math.max(r.Rd, r.r + r.rp) + 6, y = Math.max(r.Ro, r.r + r.rp) + 6;
    let s = `<path d="${pth(r.tek, (p) => rot(p, th))}" fill="#0ea5e9" fill-opacity="0.25" stroke="#7dd3fc" stroke-width="${sw}"/>`;
    if (g.delik > 0) s += `<circle r="${g.delik / 2}" fill="#0f172a" stroke="#7dd3fc" stroke-width="${sw}"/>`;
    s += `<path d="${pth(r.disk, (p) => { const q = rot(p, PI + phi); return [q[0] + g.a, q[1]]; }, 3)}" fill="#a855f7" fill-opacity="0.25" stroke="#c4b5fd" stroke-width="${sw}"/>`;
    s += `<line x1="${g.a}" y1="0" x2="${pin[0].toFixed(2)}" y2="${(-pin[1]).toFixed(2)}" stroke="#64748b" stroke-width="${(r.rp * 0.9).toFixed(2)}" stroke-linecap="round"/>`;
    s += `<circle cx="${pin[0].toFixed(2)}" cy="${(-pin[1]).toFixed(2)}" r="${r.rp}" fill="#f59e0b"/><circle cx="${g.a}" cy="0" r="${(W / 90).toFixed(2)}" fill="#e2e8f0"/><circle r="${(W / 90).toFixed(2)}" fill="#e2e8f0"/>`;
    return `<div class="mk-tbl"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${(-y).toFixed(1)} ${(x1 - x0).toFixed(1)} ${(2 * y).toFixed(1)}" style="width:100%;max-width:360px;display:block;margin:auto">${s}</svg></div><div class="mk-n">Mavi: teker · mor: kilit diski · turuncu: pim. Krank ${ic ? '<b>tekeri çeviriyor</b>' : 'boşta, teker <b>kilitli bekliyor</b>'} (teker ${tr(-th * 180 / PI, 1)}°).</div>`;
  }
  function maltaHtml(M) {
    let s = '<div class="mk-card"><b>✚ Malta haçı (Geneva)</b> — Sürekli dönen milden adım adım dönme: döner tabla, dolum ve montaj makineleri.<div class="mk-n">Krank her turda tekeri bir yuva kadar çevirir, sonra kilit diski tekeri tutar. Yuva sayısını ve mil arası mesafeyi gir, teker ve kilit diskinin şeklini uygulama çizsin.</div><div class="mk-btns"><button data-act="mk-mornek">📋 Şablon: Döner dolum tablası</button></div></div>';
    s += '<div class="mk-card"><b>Ölçüler</b><div class="mk-grid">' + fld('Yuva sayısı (istasyon)', num('malta.z', M.z, 1), 'adet') + fld('Mil merkezleri arası', num('malta.a', M.a, 1), 'mm') + fld('Pim çapı', num('malta.dp', M.dp, 1), 'mm') + fld('Yuva boşluğu', num('malta.bosluk', M.bosluk, 0.05), 'mm')
      + fld('Kilit payı (pim ile kilit diski arası et)', num('malta.kilit', M.kilit, 0.5), 'mm') + fld('Teker mil deliği', num('malta.delik', M.delik, 1), 'mm') + fld('Krank mil deliği', num('malta.kDelik', M.kDelik, 1), 'mm') + fld('Kalınlık', num('malta.kalinlik', M.kalinlik, 1), 'mm')
      + fld('Krank devri', num('malta.n', M.n, 1), 'd/dk') + fld('Teker + yük ataleti (isteğe bağlı)', num('malta.J', M.J, 0.01), 'kg·m²') + '</div></div>';
    const r = maltaHesap(M);
    if (r.hata) return s + `<div class="mk-card"><div class="mk-c hata">✗ ${esc(r.hata)}</div></div>`;
    s += `<div class="mk-card"><b>Sonuç</b> ${r.uygun ? '<span class="mk-c ok">✓ Uygun</span>' : '<span class="mk-c hata">✗ Düzeltilmeli</span>'}` + maltaSvg(r);
    s += `<label class="mk-f"><span>Krank açısı: ${Math.round(aci)}°</span><input type="range" min="0" max="359" step="1" data-mkm="aci" value="${Math.round(aci)}"></label>`;
    s += `<div class="mk-s">Adım <b>${tr(360 / r.z, 1)}°</b> · döndürme <b>${tr(r.adimSn * 1000, 0)} ms</b> · bekleme <b>${tr(r.bekleSn * 1000, 0)} ms</b> · krank yarıçapı <b>${tr(r.r, 2)} mm</b> · teker dış çapı <b>Ø${tr(2 * r.Ro, 1)} mm</b> · en büyük teker hızı <b>${tr(r.w2max, 2)} rad/s</b>${r.g.J > 0 ? ` · krank torku en çok <b>${tr(r.Tmax, 2)} N·m</b>` : ''}</div>`;
    s += kont(r.kontroller);
    // grafikler krankın bekleme ortasından (pim tekerin tam karşısında) başlar: teker açısı tek bir adım gibi okunur
    const rows = r.rows.map((q) => { const x = q.phi * 180 / PI + 180, b = q.ic ? (q.beta + PI / r.z) * 180 / PI : q.phi > 0 ? 360 / r.z : 0; return { ...q, x, b }; }).sort((p, q) => p.x - q.x);
    const ax = (aci + 180) % 360;
    s += grafikX(rows, 'b', 'Teker açısı (bu adımda)', '°', '#7dd3fc', ax) + grafikX(rows, 'w2', 'Teker hızı', 'rad/s', '#86efac', ax) + grafikX(rows, 'a2', 'Teker ivmesi', 'rad/s²', '#fca5a5', ax);
    s += '<div class="mk-n">Grafiklerde yatay eksen krank açısıdır; ortadaki 180° pimin yuvada en derinde olduğu an.</div></div>';
    s += '<div class="mk-card"><b>Üret</b><div class="mk-btns"><button data-act="mk-mdxf">⬇ DXF indir (lazer / tel erozyon)</button><button data-act="mk-mpdf">📄 Teknik resim ve rapor (PDF)</button><button data-act="mk-mcsv">⬇ Açı tablosu (CSV)</button></div>';
    s += '<div class="mk-n">DXF\'te teker, kilit diski ve pim birlikte, gerçek mil arası mesafede çizilir. Yuva ve kilit yayı iç köşeler içerir: tel erozyon ya da lazer önerilir, frezede takım çapı yuva genişliğinden küçük olmalı. Kilit diski ve krank kolu aynı mile, pim kilit diskinin oyuğuna bakacak şekilde takılır.</div></div>';
    return s;
  }
  function maltaPdf(r) {
    const doc = pdfDoc(), T = h.pdfText, g = r.g, ad = api.name() || '';
    const pg = doc.page(297, 210), span = r.Ro + g.a + Math.max(r.Rd, r.r + r.rp), sc = Math.min(1, 250 / span, 160 / (2 * r.Ro)), cx = 20 + r.Ro * sc, cy = 100;
    pg.text(14, 200, 12, T('MALTA HAÇI (GENEVA) — TEKNİK RESİM' + (ad ? ' · ' + ad : '')));
    pg.text(14, 194, 8, T(`Ölçek ${sc === 1 ? '1:1' : '1:' + (1 / sc).toFixed(2).replace('.', ',')} · z = ${r.z} · mil arası ${g.a} mm · pim Ø${g.dp} · teker Ø${(2 * r.Ro).toFixed(2)} · krank yarıçapı ${r.r.toFixed(2)} · kalınlık ${g.kalinlik} mm`));
    const L = (a, b) => pg.line(cx + a[0] * sc, cy + a[1] * sc, cx + b[0] * sc, cy + b[1] * sc);
    const poly = (pts, f = (p) => p) => { for (let i = 0; i < pts.length; i++) L(f(pts[i]), f(pts[(i + 1) % pts.length])); };
    const circ = (x, y, R) => { const pts = []; for (let i = 0; i < 72; i++) pts.push([x + R * Math.cos(i * PI / 36), y + R * Math.sin(i * PI / 36)]); poly(pts); };
    pg.lineWidth(0.35); poly(r.tek); if (g.delik > 0) circ(0, 0, g.delik / 2);
    poly(r.disk, (p) => { const q = rot(p, PI); return [q[0] + g.a, q[1]]; }); if (g.kDelik > 0) circ(g.a, 0, g.kDelik / 2); circ(g.a - r.r, 0, r.rp);
    pg.lineWidth(0.15); L([-r.Ro - 5, 0], [g.a + r.Rd + 5, 0]); L([0, -r.Ro - 5], [0, r.Ro + 5]); L([g.a, -r.Rd - 5], [g.a, r.Rd + 5]);
    pg.text(cx - 6, cy - r.Ro * sc - 8, 7, T('Teker')); pg.text(cx + g.a * sc - 8, cy - Math.max(r.Rd, r.r) * sc - 8, 7, T('Kilit diski + pim'));
    let p2 = doc.page(210, 297), y = 283;
    for (const raw of maltaRapor(r, ad)) { const s = T(raw), size = /^[A-ZÇĞİÖŞÜ ()—-]+$/.test(s.trim()) && s.trim() ? 10 : 8.5; for (let k = 0; k < Math.max(1, s.length); k += 120) { if (y < 16) { p2 = doc.page(210, 297); y = 283; } p2.text(14, y, size, (k ? '     ' : '') + s.slice(k, k + 120)); y -= size * 0.5; } }
    return new Blob([doc.build()], { type: 'application/pdf' });
  }

  /* ---------------- Krank–biyel ---------------- */
  function krankSvg(r) {
    const g = r.g, sg = g.yon === 'cw' ? -1 : 1, th = sg * aci * PI / 180, k = konum(th, g.r, g.l, g.e);
    const C = [g.r * Math.cos(th), g.r * Math.sin(th)], S = [k.x, g.e], bw = Math.max(12, g.r * 0.5), sw = ((r.xOn + g.r) / 300).toFixed(2);
    const x0 = -g.r - 10, x1 = r.xOn + bw + 10, y0 = Math.min(-g.r, g.e - bw) - 10, y1 = Math.max(g.r, g.e + bw) + 10;
    let s = `<line x1="${x0}" y1="${(-(g.e - bw / 2)).toFixed(2)}" x2="${x1}" y2="${(-(g.e - bw / 2)).toFixed(2)}" stroke="#334155"/><line x1="${x0}" y1="${(-(g.e + bw / 2)).toFixed(2)}" x2="${x1}" y2="${(-(g.e + bw / 2)).toFixed(2)}" stroke="#334155"/>`;
    s += `<circle r="${g.r}" fill="none" stroke="#334155" stroke-dasharray="3 3"/>`;
    s += `<line x1="0" y1="0" x2="${C[0].toFixed(2)}" y2="${(-C[1]).toFixed(2)}" stroke="#a855f7" stroke-width="${(bw * 0.35).toFixed(2)}" stroke-linecap="round"/>`;
    s += `<line x1="${C[0].toFixed(2)}" y1="${(-C[1]).toFixed(2)}" x2="${S[0].toFixed(2)}" y2="${(-S[1]).toFixed(2)}" stroke="#64748b" stroke-width="${(bw * 0.3).toFixed(2)}" stroke-linecap="round"/>`;
    s += `<rect x="${(S[0] - bw / 2).toFixed(2)}" y="${(-S[1] - bw / 2).toFixed(2)}" width="${bw}" height="${bw}" fill="#0ea5e9" fill-opacity="0.4" stroke="#7dd3fc" stroke-width="${sw}"/>`;
    s += `<circle r="${(bw * 0.18).toFixed(2)}" fill="#e2e8f0"/><circle cx="${C[0].toFixed(2)}" cy="${(-C[1]).toFixed(2)}" r="${(bw * 0.15).toFixed(2)}" fill="#f59e0b"/>`;
    s += `<line x1="${r.xArka.toFixed(2)}" y1="${(-(g.e + bw / 2 + 4)).toFixed(2)}" x2="${r.xOn.toFixed(2)}" y2="${(-(g.e + bw / 2 + 4)).toFixed(2)}" stroke="#f59e0b" stroke-width="${sw}"/>`;
    return `<div class="mk-tbl"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${(-y1).toFixed(1)} ${(x1 - x0).toFixed(1)} ${(y1 - y0).toFixed(1)}" style="width:100%;display:block">${s}</svg></div>`;
  }
  function krankHtml(K) {
    let s = '<div class="mk-card"><b>⟳ Krank–biyel</b> — Dönen milden ileri–geri doğrusal hareket: itici, pres, pompa, kesme kolu.<div class="mk-n">Krank döner, biyel sürgüyü iter ve çeker. Ölçüleri gir; strok, hız, ivme, biyel kuvveti ve gereken motor torku çıksın.</div><div class="mk-btns"><button data-act="mk-mkornek">📋 Şablon: Kutu itici</button></div></div>';
    s += '<div class="mk-card"><b>Ölçüler</b><div class="mk-grid">' + fld('Krank yarıçapı', num('krank.r', K.r, 0.5), 'mm') + fld('Biyel boyu (iki pim merkezi arası)', num('krank.l', K.l, 1), 'mm') + fld('Kaçıklık (kızak ekseni ile krank mili arası)', num('krank.e', K.e, 0.5), 'mm')
      + fld('Devir', num('krank.n', K.n, 1), 'd/dk') + fld('Dönüş yönü', sel('krank.yon', K.yon, [['ccw', 'Saat yönünün tersi'], ['cw', 'Saat yönü']])) + '</div>';
    s += '<div class="mk-grid">' + fld('İstenen strok (krank yarıçapını bul)', `<input type="number" inputmode="decimal" step="1" data-mkm="hedef" value="${esc(String(hedefStrok))}">`, 'mm') + '<div class="mk-f"><span>&nbsp;</span><button data-act="mk-mstrok">Krank yarıçapını hesapla</button></div></div></div>';
    s += '<div class="mk-card"><b>Yük (isteğe bağlı)</b><div class="mk-n">Girersen biyel kuvveti, kızağa yan yük ve gereken krank torku hesaplanır.</div><div class="mk-grid">' + fld('Sürgü + yük kütlesi', num('krank.m', K.m, 0.1), 'kg') + fld('Dış kuvvet (harekete ters)', num('krank.F', K.F, 1), 'N') + fld('Kuvvet ne zaman', sel('krank.yuk', K.yuk, [['ileri', 'Yalnız ileri giderken (itme)'], ['geri', 'Yalnız geri gelirken'], ['hep', 'İki yönde (sürtünme gibi)']])) + '</div></div>';
    const r = krankHesap(K);
    if (r.hata) return s + `<div class="mk-card"><div class="mk-c hata">✗ ${esc(r.hata)}</div></div>`;
    const q = r.rows[Math.round(aci * 2) % r.rows.length];
    s += `<div class="mk-card"><b>Sonuç</b> ${r.uygun ? '<span class="mk-c ok">✓ Uygun</span>' : '<span class="mk-c hata">✗ Düzeltilmeli</span>'}` + krankSvg(r);
    s += `<label class="mk-f"><span>Krank açısı: ${Math.round(aci)}° · sürgü ${tr(q.xs, 1)} mm</span><input type="range" min="0" max="359" step="1" data-mkm="aci" value="${Math.round(aci)}"></label>`;
    s += `<div class="mk-s">Strok <b>${tr(r.H, 2)} mm</b> · en yüksek hız <b>${tr(r.vMax, 3)} m/s</b> · ivme <b>+${tr(r.aMax, 2)} / ${tr(r.aMin, 2)} m/s²</b> · biyel açısı en çok <b>${tr(r.phiMax, 1)}°</b>${r.g.m > 0 || r.g.F > 0 ? ` · krank torku en çok <b>${tr(r.Tmax, 2)} N·m</b> · ortalama güç <b>${tr(r.Port, 1)} W</b> · biyel kuvveti en çok <b>${tr(r.Fbiy, 0)} N</b>` : ''}</div>`;
    s += kont(r.kontroller);
    s += grafik(r.rows, 'xs', 'Sürgü konumu (arka ölü noktadan)', 'mm', '#7dd3fc') + grafik(r.rows, 'v', 'Hız', 'm/s', '#86efac') + grafik(r.rows, 'a', 'İvme', 'm/s²', '#fca5a5');
    if (r.g.m > 0 || r.g.F > 0) s += grafik(r.rows, 'T', 'Krank torku', 'N·m', '#fde68a');
    s += '<div class="mk-btns"><button data-act="mk-mkpdf">📄 Rapor (PDF)</button><button data-act="mk-mkcsv">⬇ Açı tablosu (CSV)</button></div></div>';
    return s;
  }

  /* ---------------- Dört çubuk ---------------- */
  function dortSvg(r) {
    const g = r.g, q = r.rows[Math.round(aci * 2) % r.rows.length];
    let x0 = Math.min(0, g.d), x1 = Math.max(0, g.d), y0 = 0, y1 = 0;
    for (const z of r.rows) for (const p of [z.A, z.B, z.P]) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const m = Math.max(x1 - x0, y1 - y0) * 0.06 + 4, sw = ((x1 - x0) / 300).toFixed(2), bw = Math.max(4, Math.min(g.a, g.c) * 0.18);
    const P = (p) => `${p[0].toFixed(2)} ${(-p[1]).toFixed(2)}`;
    let s = `<path d="${r.rows.filter((_, k) => k % 3 === 0).map((z, k) => (k ? 'L' : 'M') + P(z.P)).join('')}Z" fill="none" stroke="#f59e0b" stroke-opacity="0.6" stroke-dasharray="3 2" stroke-width="${sw}"/>`;
    if (!r.sinif.ciftKrank) { const R = g.c, t0 = r.th4Min * PI / 180, t1 = r.th4Max * PI / 180; s += `<path d="M${P([g.d + R * Math.cos(t0), R * Math.sin(t0)])}A${R} ${R} 0 0 0 ${P([g.d + R * Math.cos(t1), R * Math.sin(t1)])}" fill="none" stroke="#7dd3fc" stroke-opacity="0.5" stroke-dasharray="2 2" stroke-width="${sw}"/>`; }
    s += `<circle r="${g.a}" fill="none" stroke="#a855f7" stroke-opacity="0.45" stroke-dasharray="3 3" stroke-width="${sw}"/>`;
    s += `<line x1="0" y1="0" x2="${g.d}" y2="0" stroke="#334155" stroke-width="${(bw * 0.4).toFixed(2)}" stroke-dasharray="4 3"/>`;
    s += `<path d="M${P(q.A)}L${P(q.B)}L${P(q.P)}Z" fill="#64748b" fill-opacity="0.35" stroke="#94a3b8" stroke-width="${(bw * 0.5).toFixed(2)}" stroke-linejoin="round"/>`;
    s += `<line x1="0" y1="0" x2="${q.A[0].toFixed(2)}" y2="${(-q.A[1]).toFixed(2)}" stroke="#a855f7" stroke-width="${bw.toFixed(2)}" stroke-linecap="round"/>`;
    s += `<line x1="${g.d}" y1="0" x2="${q.B[0].toFixed(2)}" y2="${(-q.B[1]).toFixed(2)}" stroke="#0ea5e9" stroke-width="${bw.toFixed(2)}" stroke-linecap="round"/>`;
    for (const p of [[0, 0], [g.d, 0], q.A, q.B]) s += `<circle cx="${p[0].toFixed(2)}" cy="${(-p[1]).toFixed(2)}" r="${(bw * 0.35).toFixed(2)}" fill="#e2e8f0"/>`;
    s += `<circle cx="${q.P[0].toFixed(2)}" cy="${(-q.P[1]).toFixed(2)}" r="${(bw * 0.5).toFixed(2)}" fill="#f59e0b"/>`;
    return `<div class="mk-tbl"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${(x0 - m).toFixed(1)} ${(-y1 - m).toFixed(1)} ${(x1 - x0 + 2 * m).toFixed(1)} ${(y1 - y0 + 2 * m).toFixed(1)}" style="width:100%;max-width:380px;display:block;margin:auto">${s}</svg></div><div class="mk-n">Mor: krank · gri: biyel · mavi: sarkaç · turuncu: biyel üstündeki nokta ve izlediği yol. Geçiş açısı şu an ${tr(q.mu, 1)}°.</div>`;
  }
  function dortHtml(D) {
    let s = '<div class="mk-card"><b>⧖ Dört çubuk</b> — Dönen milden salınım ya da özel bir yol: poşet açma kolu, tutucu, besleme parmağı, silecek.<div class="mk-n">Krank döner, biyel sarkacı ileri–geri sallar. Biyelin üstündeki bir nokta da kapalı bir yol çizer; makinede parça taşımak için o yol kullanılır.</div><div class="mk-btns"><button data-act="mk-mdornek">📋 Şablon: Poşet açma kolu</button></div></div>';
    s += '<div class="mk-card"><b>Çubuklar</b><div class="mk-grid">' + fld('Krank (döner kol)', num('dort.a', D.a, 0.5), 'mm') + fld('Biyel (ara kol)', num('dort.b', D.b, 0.5), 'mm') + fld('Sarkaç (sallanan kol)', num('dort.c', D.c, 0.5), 'mm') + fld('Sabit (iki mil arası)', num('dort.d', D.d, 0.5), 'mm')
      + fld('Biyel noktası: krank piminden uzaklık', num('dort.p', D.p, 1), 'mm') + fld('Biyel noktası: biyele göre açı', num('dort.q', D.q, 1), '°')
      + fld('Devir', num('dort.n', D.n, 1), 'd/dk') + fld('Dönüş yönü', sel('dort.yon', D.yon, [['ccw', 'Saat yönünün tersi'], ['cw', 'Saat yönü']])) + fld('Montaj', sel('dort.montaj', D.montaj, [['acik', 'Açık'], ['capraz', 'Çapraz']])) + '</div>';
    s += '<div class="mk-grid">' + fld('İstenen sarkaç salınımı (krank ve biyeli bul)', `<input type="number" inputmode="decimal" step="1" data-mkm="hedefPsi" value="${esc(String(hedefPsi))}">`, '°') + '<div class="mk-f"><span>&nbsp;</span><button data-act="mk-mdtasar">Krank ve biyeli hesapla</button></div></div><div class="mk-n">Sarkaç ve sabit ölçüsü kalır; gidiş ve dönüş eşit sürer.</div></div>';
    s += '<div class="mk-card"><b>Yük (isteğe bağlı)</b><div class="mk-n">Girersen gereken krank torku hesaplanır.</div><div class="mk-grid">' + fld('Sarkaç + yük ataleti (sarkaç miline göre)', num('dort.J', D.J, 0.001), 'kg·m²') + fld('Sarkaca ters yük torku', num('dort.M', D.M, 0.1), 'N·m') + '</div></div>';
    const r = dortHesap(D);
    if (r.hata) return s + `<div class="mk-card"><div class="mk-c hata">✗ ${esc(r.hata)}</div></div>`;
    const q = r.rows[Math.round(aci * 2) % r.rows.length];
    s += `<div class="mk-card"><b>Sonuç</b> ${r.uygun ? '<span class="mk-c ok">✓ Uygun</span>' : '<span class="mk-c hata">✗ Düzeltilmeli</span>'}` + dortSvg(r);
    s += `<label class="mk-f"><span>Krank açısı: ${Math.round(aci)}° · sarkaç ${tr(q.th4, 1)}°</span><input type="range" min="0" max="359" step="1" data-mkm="aci" value="${Math.round(aci)}"></label>`;
    s += `<div class="mk-s">${r.sinif.ciftKrank ? 'Sarkaç tam döner' : `Salınım <b>${tr(r.salinim, 1)}°</b> · zaman oranı <b>${tr(r.oran, 3)}</b>`} · geçiş açısı <b>${tr(r.muMin, 1)}°–${tr(r.muMax, 1)}°</b> · sarkaç hızı en çok <b>${tr(r.w4Max, 2)} rad/s</b> · nokta hızı en çok <b>${tr(r.vPMax, 3)} m/s</b>${r.g.J > 0 || r.g.M > 0 ? ` · krank torku en çok <b>${tr(r.Tmax, 2)} N·m</b> · ortalama güç <b>${tr(r.Port, 1)} W</b>` : ''}</div>`;
    s += kont(r.kontroller);
    s += grafik(r.rows, 'th4', 'Sarkaç açısı', '°', '#7dd3fc', 'deg', false) + grafik(r.rows, 'w4', 'Sarkaç hızı', 'rad/s', '#86efac') + grafik(r.rows, 'a4', 'Sarkaç ivmesi', 'rad/s²', '#fca5a5') + grafik(r.rows, 'mu', 'Geçiş açısı', '°', '#c4b5fd', 'deg', false);
    if (r.g.J > 0 || r.g.M > 0) s += grafik(r.rows, 'T', 'Krank torku', 'N·m', '#fde68a');
    s += '<div class="mk-btns"><button data-act="mk-mdpdf">📄 Rapor (PDF)</button><button data-act="mk-mdcsv">⬇ Açı tablosu (CSV)</button><button data-act="mk-mddxf">⬇ Nokta yolu (DXF)</button></div><div class="mk-n">DXF\'te mil merkezleri ve biyel noktasının yolu gerçek ölçüde çizilir; kılavuz, kam ya da çarpışma kontrolü için çizimine alabilirsin.</div></div>';
    return s;
  }
  function dortDXF(r) {
    const g = r.g, f = (v) => (Math.round(v * 1e4) / 1e4).toString(), L = ['0', 'SECTION', '2', 'ENTITIES'];
    for (const [x, y] of [[0, 0], [g.d, 0]]) L.push('0', 'CIRCLE', '8', 'MIL', '10', f(x), '20', f(y), '30', '0', '40', f(Math.max(2, g.a * 0.1)));
    L.push('0', 'LWPOLYLINE', '8', 'NOKTA_YOLU', '90', String(r.rows.length), '70', '1');
    for (const q of r.rows) L.push('10', f(q.Px), '20', f(q.Py));
    L.push('0', 'ENDSEC', '0', 'EOF');
    return L.join('\r\n') + '\r\n';
  }

  /* ---------------- Dişli mukavemeti ---------------- */
  function disliSvg(r) {
    const g = r.g, o1 = gearOutline(g.m, g.z1), o2 = gearOutline(g.m, g.z2), a = r.a, R2 = r.d2 / 2 + g.m, R1 = r.d1 / 2 + g.m;
    // küçük çarkın dişi +x'e bakar; büyük çark yarım adım döndürülür ki ona bakan yerde diş boşluğu olsun
    const t2 = PI + PI / g.z2, sw = ((a + R1 + R2) / 300).toFixed(2);
    const p1 = pth(o1), p2 = pth(o2, (p) => { const q = rot(p, t2); return [q[0] + a, q[1]]; });
    const x0 = -R1 - 4, w = a + R1 + R2 + 8, y = Math.max(R1, R2) + 4;
    return `<div class="mk-tbl"><svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0.toFixed(1)} ${(-y).toFixed(1)} ${w.toFixed(1)} ${(2 * y).toFixed(1)}" style="width:100%;max-width:380px;display:block;margin:auto"><path d="${p2}" fill="#0ea5e9" fill-opacity="0.25" stroke="#7dd3fc" stroke-width="${sw}"/><path d="${p1}" fill="#a855f7" fill-opacity="0.3" stroke="#c4b5fd" stroke-width="${sw}"/><circle r="${(r.d1 / 2).toFixed(2)}" fill="none" stroke="#f59e0b" stroke-opacity="0.5" stroke-dasharray="2 2" stroke-width="${sw}"/><circle cx="${a.toFixed(2)}" r="${(r.d2 / 2).toFixed(2)}" fill="none" stroke="#f59e0b" stroke-opacity="0.5" stroke-dasharray="2 2" stroke-width="${sw}"/></svg></div><div class="mk-n">Mor: küçük çark (pinyon, z ${g.z1}) · mavi: büyük çark (z ${g.z2}) · kesikli: bölüm daireleri. Eksen mesafesi ${tr(a, 1)} mm.</div>`;
  }
  const bar = (ad, sig, lim, S, Smin) => { const oran = Math.min(1, sig / lim), renk = S >= Smin ? '#86efac' : S >= 1 ? '#fde68a' : '#fca5a5';
    return `<div class="mk-s"><b>${esc(ad)}</b> <i>${tr(sig, 0)} / ${tr(lim, 0)} MPa · emniyet <b style="color:${renk}">${tr(S, 2)}</b></i><div style="height:8px;background:#1e293b;border-radius:4px;overflow:hidden"><div style="width:${(oran * 100).toFixed(1)}%;height:100%;background:${renk}"></div></div></div>`; };
  function disliHtml(G) {
    const mats = Object.entries(MALZEME).map(([k, v]) => [k, v.ad]);
    let s = '<div class="mk-card"><b>⚙ Dişli mukavemeti</b> — Düz dişli çiftinin yüke dayanıp dayanmadığı: diş kırılması ve yüzey ezilmesi (pitting).<div class="mk-n">Modülü, diş sayılarını, genişliği ve yükü gir. Emniyet düşükse uygulama yeten en küçük standart modülü önerir.</div><div class="mk-btns"><button data-act="mk-mgornek">📋 Şablon: Konveyör redüktörü 1. kademe</button></div></div>';
    s += '<div class="mk-card"><b>Dişliler</b><div class="mk-grid">' + fld('Modül', num('disli.m', G.m, 0.25), 'mm') + fld('Diş genişliği', num('disli.b', G.b, 1), 'mm') + fld('Küçük çark diş sayısı', num('disli.z1', G.z1, 1), 'adet') + fld('Büyük çark diş sayısı', num('disli.z2', G.z2, 1), 'adet')
      + fld('Küçük çark malzemesi', sel('disli.mat1', G.mat1, mats)) + fld('Büyük çark malzemesi', sel('disli.mat2', G.mat2, mats)) + '</div>';
    if (G.mat1 === 'ozel' || G.mat2 === 'ozel') s += '<div class="mk-grid">' + (G.mat1 === 'ozel' ? fld('Küçük çark σHlim', num('disli.H1', G.H1, 10), 'MPa') + fld('Küçük çark σFlim', num('disli.F1', G.F1, 10), 'MPa') : '') + (G.mat2 === 'ozel' ? fld('Büyük çark σHlim', num('disli.H2', G.H2, 10), 'MPa') + fld('Büyük çark σFlim', num('disli.F2', G.F2, 10), 'MPa') : '') + '</div>';
    s += '<div class="mk-n">Malzeme değerleri tipiktir; sertifikadaki değer farklıysa "Elle gir"i seç.</div></div>';
    s += '<div class="mk-card"><b>Yük</b><div class="mk-grid">' + fld('Küçük çark torku', num('disli.T1', G.T1, 0.1), 'N·m') + fld('Küçük çark devri', num('disli.n1', G.n1, 10), 'd/dk')
      + fld('ya da güç gir (torku hesaplar)', '<input type="number" inputmode="decimal" step="0.1" data-mkm="gucKW" value="">', 'kW')
      + fld('Çalışma şekli (darbe)', sel('disli.KA', G.KA, DARBE)) + fld('Dişli kalitesi', sel('disli.Qv', G.Qv, KALITE.map(([q, t]) => [q, `${t} (Qv ${q})`]))) + fld('Yük dağılım katsayısı', num('disli.KB', G.KB, 0.05))
      + fld('İstenen yüzey emniyeti', num('disli.SHmin', G.SHmin, 0.05)) + fld('İstenen kırılma emniyeti', num('disli.SFmin', G.SFmin, 0.05)) + '</div></div>';
    const r = disliHesap(G);
    if (r.hata) return s + `<div class="mk-card"><div class="mk-c hata">✗ ${esc(r.hata)}</div></div>`;
    s += `<div class="mk-card"><b>Sonuç</b> ${r.uygun ? '<span class="mk-c ok">✓ Uygun</span>' : '<span class="mk-c hata">✗ Düzeltilmeli</span>'}` + disliSvg(r);
    s += bar('Yüzey ezilmesi (iki çark)', r.sH, r.Hlim, r.SH, G.SHmin) + bar('Diş kırılması — küçük çark', r.sF1, 2 * r.F1lim, r.SF1, G.SFmin) + bar('Diş kırılması — büyük çark', r.sF2, 2 * r.F2lim, r.SF2, G.SFmin);
    s += `<div class="mk-s">Güç <b>${tr(r.P, 2)} kW</b> · oran <b>1:${tr(r.u, 2)}</b> · çıkış <b>${tr(r.n2, 0)} d/dk, ${tr(r.T2, 1)} N·m</b> · çevre kuvveti <b>${tr(r.Ft, 0)} N</b> · çevre hızı <b>${tr(r.v, 2)} m/s</b> · kavrama oranı <b>${tr(r.ea, 2)}</b> · taşınabilecek tork <b>${tr(r.Tmax, 1)} N·m</b></div>`;
    s += kont(r.kontroller);
    s += '<div class="mk-btns">' + (r.mOner != null && r.mOner !== G.m ? `<button data-act="mk-mgmod">Modülü ${tr(r.mOner, 2)} yap</button>` : '') + '<button data-act="mk-mgpdf">📄 Hesap raporu (PDF)</button></div>';
    s += '<div class="mk-n">Düz dişli, 20° basınç açısı, profil kaydırmasız, çelik–çelik; ISO 6336\'nın sadeleştirilmiş biçimi, uzun ömür için. Ön boyutlandırmadır: üretimden önce tam hesap ya da dişli üreticisinin onayı gerekir.</div></div>';
    return s;
  }

  /* ---------------- Basma yayı ---------------- */
  function yaySvg(r) {
    const g = r.g, H = 150, sk = (H - 26) / g.L0, W = g.D * sk + g.d * sk, cw = Math.max(W, 40) + 34;
    const bir = (L, x, ad, F) => {
      const h = L * sk, y0 = H - 6, xs = x + (cw - W) / 2, tw = Math.max(1, g.d * sk), N = Math.max(2, Math.round(g.nt * 2));
      let p = `M${xs.toFixed(1)} ${y0.toFixed(1)}`;
      for (let i = 1; i <= N; i++) { const yy = y0 - (h - tw) * i / N - tw / 2 * (i === N ? 1 : 0); p += `L${(i % 2 ? xs + W : xs).toFixed(1)} ${yy.toFixed(1)}`; }
      return `<line x1="${x + 6}" y1="${y0 + 3}" x2="${x + cw - 6}" y2="${y0 + 3}" stroke="#475569" stroke-width="3"/><line x1="${x + 6}" y1="${(y0 - h - 3).toFixed(1)}" x2="${x + cw - 6}" y2="${(y0 - h - 3).toFixed(1)}" stroke="#475569" stroke-width="3"/><path d="${p}" fill="none" stroke="#7dd3fc" stroke-width="${tw.toFixed(1)}" stroke-linejoin="round"/><text x="${x + cw / 2}" y="12" fill="#e2e8f0" font-size="10" text-anchor="middle">${ad}</text><text x="${x + cw / 2}" y="${H + 8}" fill="#94a3b8" font-size="9" text-anchor="middle">${tr(L, 1)} mm${F != null ? ' · ' + tr(F, 0) + ' N' : ''}</text>`;
    };
    const sv = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${3 * cw} ${H + 12}" style="width:100%;max-width:380px;display:block;margin:auto">${bir(g.L0, 0, 'Serbest', null)}${bir(g.L1, cw, 'Montaj', r.F1)}${bir(g.L2, 2 * cw, 'En kısa', r.F2)}</svg>`;
    // kuvvet–boy doğrusu
    const X = (L) => 30 + (g.L0 - L) / (g.L0 - r.Lc) * 310, Y = (F) => 110 - F / r.Fc * 95, pt = (L, F, c, ad) => `<circle cx="${X(L).toFixed(1)}" cy="${Y(F).toFixed(1)}" r="3.5" fill="${c}"/><text x="${X(L).toFixed(1)}" y="${(Y(F) - 7).toFixed(1)}" fill="${c}" font-size="9" text-anchor="middle">${ad}</text>`;
    const gr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 128" style="width:100%;max-width:380px;display:block;margin:auto"><line x1="30" y1="110" x2="345" y2="110" stroke="#475569"/><line x1="30" y1="10" x2="30" y2="110" stroke="#475569"/><rect x="${X(r.Ln).toFixed(1)}" y="10" width="${(X(r.Lc) - X(r.Ln)).toFixed(1)}" height="100" fill="#fca5a5" fill-opacity="0.15"/><line x1="${X(g.L0)}" y1="${Y(0)}" x2="${X(r.Lc).toFixed(1)}" y2="${Y(r.Fc).toFixed(1)}" stroke="#86efac" stroke-width="2"/>${pt(g.L1, r.F1, '#fde68a', 'F₁')}${pt(g.L2, r.F2, '#fdba74', 'F₂')}${pt(r.Lc, r.Fc, '#fca5a5', 'blok')}<text x="32" y="124" fill="#94a3b8" font-size="9">boy ${tr(g.L0, 0)} mm → ${tr(r.Lc, 1)} mm</text><text x="34" y="18" fill="#94a3b8" font-size="9">${tr(r.Fc, 0)} N</text></svg>`;
    return `<div class="mk-tbl">${sv}</div><div class="mk-tbl">${gr}</div><div class="mk-n">Grafik: kuvvet–boy doğrusu. Kırmızı bant sarımların birbirine çok yaklaştığı bölge; yay oraya kadar sıkıştırılmamalı.</div>`;
  }
  function yayHtml(Y) {
    const mats = Object.entries(YAY_MAT).map(([k, v]) => [k, v.ad]);
    let s = '<div class="mk-card"><b>🌀 Basma yayı</b> — Helisel basma yayı seçimi: yay sabiti, kuvvetler, gerilme, yorulma, burkulma.<div class="mk-n">Tel çapını, sarım çapını, sarım sayısını ve üç boyu gir: serbest boy, takılınca kaldığı boy (montaj) ve en çok sıkıştığı boy.</div><div class="mk-btns"><button data-act="mk-myornek">📋 Şablon: Ambalaj makinesi kapak yayı</button></div></div>';
    s += '<div class="mk-card"><b>Yay</b><div class="mk-grid">' + fld('Tel çapı', num('yay.d', Y.d, 0.1), 'mm') + fld('Ortalama sarım çapı', num('yay.D', Y.D, 0.5), 'mm') + fld('Aktif sarım', num('yay.n', Y.n, 0.5), 'adet') + fld('Toplam sarım', num('yay.nt', Y.nt, 0.5), 'adet')
      + fld('Serbest boy', num('yay.L0', Y.L0, 0.5), 'mm') + fld('Montaj boyu', num('yay.L1', Y.L1, 0.5), 'mm') + fld('En kısa çalışma boyu', num('yay.L2', Y.L2, 0.5), 'mm') + fld('Malzeme', sel('yay.mat', Y.mat, mats)) + '</div>';
    if (Y.mat === 'ozel') s += '<div class="mk-grid">' + fld('Çekme dayanımı R_m', num('yay.Rm', Y.Rm, 10), 'MPa') + fld('Kayma modülü G', num('yay.G', Y.G, 500), 'MPa') + '</div>';
    s += '<div class="mk-n">Uçları kapalı ve taşlanmış yay varsayılır (toplam sarım ≈ aktif + 2). Ortalama çap = dış çap − tel çapı.</div>';
    s += '<div class="mk-grid">' + fld('İstenen yay sabiti (aktif sarımı bul)', `<input type="number" inputmode="decimal" step="0.1" data-mkm="hedefR" value="${esc(String(hedefR))}">`, 'N/mm') + '<div class="mk-f"><span>&nbsp;</span><button data-act="mk-mydn">Sarım sayısını hesapla</button></div></div></div>';
    s += '<div class="mk-card"><b>Çalışma</b><div class="mk-grid">' + fld('Uçların oturuşu', sel('yay.uc', Y.uc, UCLAR)) + fld('Yük şekli', sel('yay.dinamik', Y.dinamik, [['evet', 'Sürekli ileri–geri (yorulma)'], ['hayir', 'Statik / az tekrarlı']]))
      + (Y.dinamik === 'evet' ? fld('Çalışma hızı', num('yay.f', Y.f, 1), 'çevrim/dk') + fld('Tel yüzeyi', sel('yay.bilye', Y.bilye, [['hayir', 'Bilyesiz'], ['evet', 'Bilyeli dövülmüş (shot peened)']])) : '') + '</div></div>';
    const r = yayHesap(Y);
    if (r.hata) return s + `<div class="mk-card"><div class="mk-c hata">✗ ${esc(r.hata)}</div></div>`;
    s += `<div class="mk-card"><b>Sonuç</b> ${r.uygun ? '<span class="mk-c ok">✓ Uygun</span>' : '<span class="mk-c hata">✗ Düzeltilmeli</span>'}` + yaySvg(r);
    s += `<div class="mk-s">Yay sabiti <b>${tr(r.R, 2)} N/mm</b> · montajda <b>${tr(r.F1, 1)} N</b> · en kısa boyda <b>${tr(r.F2, 1)} N</b> · dış çap <b>${tr(r.Da, 1)} mm</b>, iç çap <b>${tr(r.Di, 1)} mm</b> · blok boyu <b>${tr(r.Lc, 1)} mm</b> · R_m <b>${tr(r.Rm, 0)} MPa</b> · kütle <b>${tr(r.kutle, 1)} g</b></div>`;
    s += bar('Statik gerilme (en kısa boy)', r.t2, r.tzul, r.ns, 1) + (Y.dinamik === 'evet' && Number.isFinite(r.nf) ? bar('Yorulma (gerilme genliği)', r.ta, r.ta * r.nf, r.nf, 1.3) : '');
    s += kont(r.kontroller);
    s += '<div class="mk-btns"><button data-act="mk-mypdf">📄 Hesap raporu (PDF)</button></div><div class="mk-n">EN 13906-1 ve Shigley yöntemleri. R_m tel çapına göre yaklaşık en düşük değerdir, tel sertifikasından doğrula. Ön boyutlandırmadır; seri üretimden önce yay üreticisinin onayı gerekir.</div></div>';
    return s;
  }
  function raporPdf(lines) {
    const doc = pdfDoc(), T = h.pdfText; let p = doc.page(210, 297), y = 283;
    for (const raw of lines) { const s = T(raw), size = /^[A-ZÇĞİÖŞÜ ()—–-]+$/.test(s.trim()) && s.trim() ? 10 : 8.5; for (let k = 0; k < Math.max(1, s.length); k += 120) { if (y < 16) { p = doc.page(210, 297); y = 283; } p.text(14, y, size, (k ? '     ' : '') + s.slice(k, k + 120)); y -= size * 0.5; } }
    return new Blob([doc.build()], { type: 'application/pdf' });
  }

  function html() {
    const M = Q();
    let s = `<div class="mk-tabs"><button data-act="mk-mtur-malta" class="${M.tur === 'malta' ? 'on' : ''}">✚ Malta haçı</button><button data-act="mk-mtur-krank" class="${M.tur === 'krank' ? 'on' : ''}">⟳ Krank–biyel</button><button data-act="mk-mtur-dort" class="${M.tur === 'dort' ? 'on' : ''}">⧖ Dört çubuk</button><button data-act="mk-mtur-disli" class="${M.tur === 'disli' ? 'on' : ''}">⚙ Dişli</button><button data-act="mk-mtur-yay" class="${M.tur === 'yay' ? 'on' : ''}">🌀 Yay</button></div>`;
    return s + (M.tur === 'krank' ? krankHtml(M.krank) : M.tur === 'dort' ? dortHtml(M.dort) : M.tur === 'disli' ? disliHtml(M.disli) : M.tur === 'yay' ? yayHtml(M.yay) : maltaHtml(M.malta));
  }
  function input(el) {
    const M = Q(), k = el.dataset.mkm, v = Number(String(el.value).replace(',', '.'));
    if (k === 'aci') { aci = Number.isFinite(v) ? v : 0; api.render(); return; }
    if (k === 'hedef') { hedefStrok = el.value; return; }
    if (k === 'hedefPsi') { hedefPsi = el.value; return; }
    if (k === 'hedefR') { hedefR = el.value; return; }
    if (k === 'gucKW') { if (v > 0 && M.disli.n1 > 0) { M.disli.T1 = Math.round(v * 60000 / (2 * PI * M.disli.n1) * 100) / 100; h.changed(); } return; }
    const [grp, f] = k.split('.');
    if (!M[grp] || !(f in M[grp])) return;
    if (typeof M[grp][f] === 'string') M[grp][f] = el.value; else if (Number.isFinite(v)) M[grp][f] = v;
    Object.assign(M, mekSanitize(M));
    h.changed();
  }
  function act(a) {
    let m;
    const M = Q(), ad = (x) => (api.name() || 'proje') + x;
    if ((m = /^mk-mtur-(malta|krank|dort|disli|yay)$/.exec(a))) { M.tur = m[1]; aci = 30; h.changed(); return true; }
    if (a === 'mk-mornek') { M.malta = MALTA_ORNEK(); h.changed(); api.toast('Şablon yüklendi (temsilî değerler)'); return true; }
    if (a === 'mk-mkornek') { M.krank = KRANK_ORNEK(); h.changed(); api.toast('Şablon yüklendi (temsilî değerler)'); return true; }
    if (a === 'mk-mstrok') {
      const H = Number(String(hedefStrok).replace(',', '.')), R = stroktanR(H, M.krank.l, M.krank.e);
      if (R == null) { api.toast('Bu biyel boyu ve kaçıklıkla bu strok olmaz: biyeli uzat'); return true; }
      M.krank.r = Math.round(R * 1000) / 1000; h.changed(); api.toast('Krank yarıçapı ' + tr(M.krank.r, 3) + ' mm'); return true;
    }
    if (a === 'mk-myornek') { M.yay = YAY_ORNEK(); h.changed(); api.toast('Şablon yüklendi (temsilî değerler)'); return true; }
    if (a === 'mk-mydn') {
      const Rh = Number(String(hedefR).replace(',', '.')), Y = M.yay, G = Y.mat === 'ozel' ? Y.G : YAY_MAT[Y.mat].G;
      if (!(Rh > 0 && Y.d > 0 && Y.D > Y.d)) { api.toast('Yay sabitini, tel ve sarım çapını gir'); return true; }
      const n = Math.max(2, Math.round(sarimdanR(G, Y.d, Y.D, Rh) * 2) / 2); Y.n = n; Y.nt = n + 2; h.changed();
      api.toast(tr(n, 1) + ' aktif sarım · yay sabiti ' + tr(G * Y.d ** 4 / (8 * Y.D ** 3 * n), 2) + ' N/mm'); return true;
    }
    if (a === 'mk-mypdf') { const r = yayHesap(M.yay); if (r.hata) { api.toast(r.hata); return true; } api.saveBlob(raporPdf(yayRapor(r, api.name() || '')), ad('_yay.pdf')); api.toast('İndirildi'); return true; }
    if (a === 'mk-mgornek') { M.disli = DISLI_ORNEK(); h.changed(); api.toast('Şablon yüklendi (temsilî değerler)'); return true; }
    if (a === 'mk-mgmod') { const r = disliHesap(M.disli); if (r.mOner != null) { M.disli.m = r.mOner; h.changed(); api.toast('Modül ' + tr(r.mOner, 2)); } else api.toast('Standart modüllerle yetmiyor: genişliği ya da malzemeyi değiştir'); return true; }
    if (a === 'mk-mgpdf') { const r = disliHesap(M.disli); if (r.hata) { api.toast(r.hata); return true; } api.saveBlob(raporPdf(disliRapor(r, api.name() || '')), ad('_disli.pdf')); api.toast('İndirildi'); return true; }
    if (a === 'mk-mdornek') { M.dort = DORT_ORNEK(); h.changed(); api.toast('Şablon yüklendi (temsilî değerler)'); return true; }
    if (a === 'mk-mdtasar') {
      const t = salinimdanTasarla(Number(String(hedefPsi).replace(',', '.')), M.dort.c, M.dort.d);
      if (!t) { api.toast('Salınım 0° ile 180° arasında, sabit ölçü de sarkaçtan uzun olmalı'); return true; }
      M.dort.a = Math.round(t.a * 1000) / 1000; M.dort.b = Math.round(t.b * 1000) / 1000; h.changed(); api.toast('Krank ' + tr(M.dort.a, 2) + ' mm · biyel ' + tr(M.dort.b, 2) + ' mm'); return true;
    }
    if (/^mk-md(pdf|csv|dxf)$/.test(a)) {
      const r = dortHesap(M.dort); if (r.hata) { api.toast(r.hata); return true; }
      if (a === 'mk-mdpdf') api.saveBlob(raporPdf(dortRapor(r, api.name() || '')), ad('_dort_cubuk.pdf'));
      else if (a === 'mk-mdcsv') api.saveBlob(new Blob([dortCSV(r)], { type: 'text/csv;charset=utf-8' }), ad('_dort_cubuk.csv'));
      else api.saveBlob(new Blob([dortDXF(r)], { type: 'application/dxf' }), ad('_dort_cubuk.dxf'));
      api.toast('İndirildi'); return true;
    }
    if (/^mk-m(dxf|pdf|csv)$/.test(a)) {
      const r = maltaHesap(M.malta); if (r.hata) { api.toast(r.hata); return true; }
      if (a === 'mk-mdxf') api.saveBlob(new Blob([maltaDXF(r, api.name() || 'MALTA')], { type: 'application/dxf' }), ad('_malta.dxf'));
      if (a === 'mk-mpdf') api.saveBlob(maltaPdf(r), ad('_malta.pdf'));
      if (a === 'mk-mcsv') api.saveBlob(new Blob([maltaCSV(r)], { type: 'text/csv;charset=utf-8' }), ad('_malta.csv'));
      api.toast('İndirildi'); return true;
    }
    if (/^mk-mk(pdf|csv)$/.test(a)) {
      const r = krankHesap(M.krank); if (r.hata) { api.toast(r.hata); return true; }
      if (a === 'mk-mkpdf') api.saveBlob(raporPdf(krankRapor(r, api.name() || '')), ad('_krank_biyel.pdf'));
      else api.saveBlob(new Blob([krankCSV(r)], { type: 'text/csv;charset=utf-8' }), ad('_krank_biyel.csv'));
      api.toast('İndirildi'); return true;
    }
    return false;
  }
  return { html, input, act };
}
