// Mekatronik Mühendisliği — Mekanizmalar sekmesi: Malta haçı ve krank–biyel. Hesaplar meka/malta.js, meka/krank.js.
// h: { api, getP() → proje (P.mek), changed(), esc, pdfText }
import { maltaSanitize, maltaHesap, maltaDXF, maltaCSV, maltaRapor, MALTA_ORNEK, beta } from './malta.js?v=20261128a';
import { krankSanitize, krankHesap, krankCSV, krankRapor, KRANK_ORNEK, konum, stroktanR } from './krank.js?v=20261128a';
import { pdfDoc } from '../tx/pdf.js?v=20261112u';

const PI = Math.PI;
export function mekSanitize(o) { const x = o && typeof o === 'object' ? o : {}; return { tur: x.tur === 'krank' ? 'krank' : 'malta', malta: maltaSanitize(x.malta), krank: krankSanitize(x.krank) }; }

export function createMekUI(h) {
  const { api, esc } = h;
  let aci = 30, hedefStrok = '';
  const Q = () => { const P = h.getP(); if (!P.mek || !P.mek.malta) P.mek = mekSanitize(P.mek); return P.mek; };
  const tr = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
  const num = (attr, v, step = 'any') => `<input type="number" inputmode="decimal" step="${step}" data-mkm="${attr}" value="${Number.isFinite(v) ? v : ''}">`;
  const fld = (label, inner, birim = '') => `<label class="mk-f"><span>${esc(label)}</span>${inner}${birim ? `<i>${esc(birim)}</i>` : ''}</label>`;
  const sel = (attr, cur, opts) => `<select data-mkm="${attr}">${opts.map(([o, t]) => `<option value="${esc(o)}"${String(o) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const kont = (ks) => ks.map((c) => `<div class="mk-c ${c.ok ? (c.duzey === 'bilgi' ? 'i' : 'ok') : c.duzey}">${c.ok ? (c.duzey === 'bilgi' ? 'ℹ' : '✓') : c.duzey === 'hata' ? '✗' : '⚠'} ${esc(c.metin)}</div>`).join('');
  const rot = (p, t) => [p[0] * Math.cos(t) - p[1] * Math.sin(t), p[0] * Math.sin(t) + p[1] * Math.cos(t)];
  const pth = (pts, f = (p) => p, k0 = 1) => pts.filter((_, k) => k % k0 === 0).map((p, k) => { const q = f(p); return (k ? 'L' : 'M') + q[0].toFixed(2) + ' ' + (-q[1]).toFixed(2); }).join('') + 'Z';
  function grafik(rows, key, ad, birim, renk, xkey = 'deg') {
    const ys = rows.map((q) => q[key]), mx = Math.max(...ys), mn = Math.min(...ys, 0), span = mx - mn || 1, W = 330, H = 62;
    const pts = rows.filter((_, k) => k % 3 === 0).map((q) => `${(q[xkey] / 360 * W).toFixed(1)},${(H - (q[key] - mn) / span * H).toFixed(1)}`).join(' ');
    const y0 = H - (0 - mn) / span * H, xa = aci / 360 * W;
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
  function raporPdf(lines) {
    const doc = pdfDoc(), T = h.pdfText; let p = doc.page(210, 297), y = 283;
    for (const raw of lines) { const s = T(raw), size = /^[A-ZÇĞİÖŞÜ ()—–-]+$/.test(s.trim()) && s.trim() ? 10 : 8.5; for (let k = 0; k < Math.max(1, s.length); k += 120) { if (y < 16) { p = doc.page(210, 297); y = 283; } p.text(14, y, size, (k ? '     ' : '') + s.slice(k, k + 120)); y -= size * 0.5; } }
    return new Blob([doc.build()], { type: 'application/pdf' });
  }

  function html() {
    const M = Q();
    let s = `<div class="mk-tabs"><button data-act="mk-mtur-malta" class="${M.tur === 'malta' ? 'on' : ''}">✚ Malta haçı</button><button data-act="mk-mtur-krank" class="${M.tur === 'krank' ? 'on' : ''}">⟳ Krank–biyel</button></div>`;
    return s + (M.tur === 'krank' ? krankHtml(M.krank) : maltaHtml(M.malta));
  }
  function input(el) {
    const M = Q(), k = el.dataset.mkm, v = Number(String(el.value).replace(',', '.'));
    if (k === 'aci') { aci = Number.isFinite(v) ? v : 0; api.render(); return; }
    if (k === 'hedef') { hedefStrok = el.value; return; }
    const [grp, f] = k.split('.');
    if (!M[grp] || !(f in M[grp])) return;
    if (typeof M[grp][f] === 'string') M[grp][f] = el.value; else if (Number.isFinite(v)) M[grp][f] = v;
    Object.assign(M, mekSanitize(M));
    h.changed();
  }
  function act(a) {
    let m;
    const M = Q(), ad = (x) => (api.name() || 'proje') + x;
    if ((m = /^mk-mtur-(malta|krank)$/.exec(a))) { M.tur = m[1]; aci = 30; h.changed(); return true; }
    if (a === 'mk-mornek') { M.malta = MALTA_ORNEK(); h.changed(); api.toast('Şablon yüklendi (temsilî değerler)'); return true; }
    if (a === 'mk-mkornek') { M.krank = KRANK_ORNEK(); h.changed(); api.toast('Şablon yüklendi (temsilî değerler)'); return true; }
    if (a === 'mk-mstrok') {
      const H = Number(String(hedefStrok).replace(',', '.')), R = stroktanR(H, M.krank.l, M.krank.e);
      if (R == null) { api.toast('Bu biyel boyu ve kaçıklıkla bu strok olmaz: biyeli uzat'); return true; }
      M.krank.r = Math.round(R * 1000) / 1000; h.changed(); api.toast('Krank yarıçapı ' + tr(M.krank.r, 3) + ' mm'); return true;
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
