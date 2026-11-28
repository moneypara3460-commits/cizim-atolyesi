// Mekatronik Mühendisliği — makine çevrim (zamanlama) diyagramı görünümü. Hesap meka/cevrim.js'te.
// h: { api, getP() → proje (P.cevrim, P.kam), changed(), esc, pdfText, toKam() → eksantrik sekmesini aç }
import { cevrimSanitize, cevrimHesap, cevrimCSV, cevrimRapor, oneriYazi, CEVRIM_ORNEK, ADIM } from './cevrim.js?v=20261128a';
import { YASALAR, kamSanitize } from './kam.js?v=20261127c';
import { pdfDoc } from '../tx/pdf.js?v=20261112u';

const RENK = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#34d399', '#fb923c', '#60a5fa', '#f87171', '#e879f9', '#2dd4bf', '#facc15'];
const RGB = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

export function createCevrimUI(h) {
  const { api, esc } = h;
  let aci = 0, acik = 0;
  const Q = () => { const P = h.getP(); if (!P.cevrim || !Array.isArray(P.cevrim.ist)) P.cevrim = cevrimSanitize(P.cevrim); return P.cevrim; };
  const tr = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
  const num = (attr, v, step = 'any', w = '') => `<input type="number" inputmode="decimal" step="${step}" data-mkt="${attr}" value="${Number.isFinite(v) ? v : ''}"${w ? ` style="${w}"` : ''}>`;
  const fld = (label, inner, birim = '') => `<label class="mk-f"><span>${esc(label)}</span>${inner}${birim ? `<i>${esc(birim)}</i>` : ''}</label>`;
  const sel = (attr, cur, opts) => `<select data-mkt="${attr}">${opts.map(([o, t]) => `<option value="${esc(String(o))}"${String(o) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;

  // diyagram: her istasyon bir şerit, konum 0–strok normalize; çarpışan / sıra hatalı açılar kırmızı bant
  function diyagram(r) {
    const W = 340, lane = 46, top = 16, H = top + r.c.ist.length * lane + 14, xs = (a) => (a / 360 * W).toFixed(1);
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-60 -2 ${W + 66} ${H + 4}" style="width:100%;display:block;font:9px system-ui">`;
    for (let a = 0; a <= 360; a += 30) s += `<line x1="${xs(a)}" y1="${top - 4}" x2="${xs(a)}" y2="${H - 12}" stroke="#1e293b"/>` + (a % 90 === 0 ? `<text x="${xs(a)}" y="${top - 6}" fill="#94a3b8" text-anchor="middle">${a}°</text>` : '');
    // kırmızı bantlar
    for (const x of r.sonuc) {
      if (x.ok || !r.yol[x.k.a] || !r.yol[x.k.b]) continue;
      const bad = new Uint8Array(r.N), ya = r.yol[x.k.a], yb = r.yol[x.k.b], ta = ya.smax * x.k.esikA / 100, tb = yb.smax * x.k.esikB / 100;
      for (let i = 0; i < r.N; i++) { const A = ya.y[i] > ta, B = yb.y[i] > tb; bad[i] = x.k.tur === 'ayri' ? A && B : B && !A; }
      let i = 0; while (i < r.N) { if (!bad[i]) { i++; continue; } let j = i; while (j < r.N && bad[j]) j++; const y0 = top + Math.min(x.k.a, x.k.b) * lane, y1 = top + (Math.max(x.k.a, x.k.b) + 1) * lane; s += `<rect x="${xs(i * r.ADIM)}" y="${y0}" width="${Math.max(1.5, (j - i) * r.ADIM / 360 * W).toFixed(1)}" height="${y1 - y0}" fill="#ef4444" fill-opacity="0.28"/>`; i = j; }
    }
    r.c.ist.forEach((st, k) => {
      const y0 = top + k * lane, yb = y0 + lane - 8, hh = lane - 14, yol = r.yol[k], col = RENK[k % RENK.length];
      const pts = []; for (let i = 0; i < r.N; i += 4) pts.push(`${xs(i * r.ADIM)},${(yb - (yol.smax > 0 ? yol.y[i] / yol.smax : 0) * hh).toFixed(1)}`);
      pts.push(`${W},${(yb - (yol.smax > 0 ? yol.y[0] / yol.smax : 0) * hh).toFixed(1)}`);
      s += `<line x1="0" y1="${yb}" x2="${W}" y2="${yb}" stroke="#334155"/><polyline points="${pts.join(' ')}" fill="none" stroke="${col}" stroke-width="1.8"/>`;
      s += `<text x="-4" y="${yb - hh / 2 + 3}" fill="${col}" text-anchor="end">${esc(st.ad.slice(0, 11))}</text>`;
    });
    s += `<line x1="${xs(aci)}" y1="${top - 4}" x2="${xs(aci)}" y2="${H - 12}" stroke="#f59e0b" stroke-width="1.2"/>`;
    s += `<text x="${W}" y="${H}" fill="#94a3b8" text-anchor="end">bir çevrim ${tr(r.msTur, 0)} ms</text></svg>`;
    return '<div class="mk-tbl">' + s + '</div>';
  }
  function html() {
    const C = Q();
    let s = '<div class="mk-card"><b>⏲ Makine çevrim diyagramı</b> — Aynı milin sürdüğü bütün istasyonlar tek çizelgede: hangisi ne zaman ileri gidiyor, birbirine çarpıyor mu.';
    s += '<div class="mk-n">Ana mil bir tur döner = bir çevrim. Her istasyonun hareketini açıya göre yaz; kuralları gir ("bıçak çene kapalıyken insin", "film çene açıkken çekilsin"). Çakışma varsa uygulama gösterir ve istasyonu kaç derece kaydırman gerektiğini söyler.</div>';
    s += '<div class="mk-btns"><button data-act="mk-tornek">📋 Şablon: Dikey poşet makinesi (VFFS)</button><button data-act="mk-tkam">⚙ Eksantrik tasarımından istasyon ekle</button></div>';
    s += '<div class="mk-grid">' + fld('Ana mil devri', num('n', C.n, 1), 'çevrim/dk') + '</div></div>';
    const r = cevrimHesap(C);
    if (!r.hata) {
      s += `<div class="mk-card"><b>Çizelge</b> ${r.sonuc.length ? (r.uygun ? '<span class="mk-c ok">✓ Kurallar sağlanıyor</span>' : '<span class="mk-c hata">✗ Çakışma var</span>') : ''}` + diyagram(r);
      s += `<label class="mk-f"><span>Açı: ${Math.round(aci)}° · ${tr(aci * r.msDer, 0)} ms</span><input type="range" min="0" max="359" step="1" data-mkt="aci" value="${Math.round(aci)}"></label>`;
      const i0 = Math.round(aci / ADIM) % r.N;
      s += '<div class="mk-s">' + r.c.ist.map((st, k) => `<span style="color:${RENK[k % RENK.length]}">${esc(st.ad)}: <b>${tr(r.yol[k].y[i0], 1)} ${esc(st.birim)}</b></span>`).join(' · ') + '</div></div>';
    }
    // istasyonlar
    s += '<div class="mk-card"><b>İstasyonlar</b>';
    C.ist.forEach((st, k) => {
      const col = RENK[k % RENK.length];
      s += `<div style="border-left:4px solid ${col};padding:4px 8px;margin:6px 0;background:#0b1220;border-radius:8px">`;
      s += `<div class="mk-btns"><button data-act="mk-tac-${k}" style="flex:1;text-align:left">${acik === k ? '▾' : '▸'} ${k + 1}. ${esc(st.ad)} <i style="color:#94a3b8">faz ${tr(st.faz, 1)}°</i></button><button data-act="mk-tdel-${k}" class="mk-dg">🗑</button></div>`;
      if (acik === k) {
        s += '<div class="mk-grid">' + fld('Ad', `<input type="text" data-mkt="i.${k}.ad" value="${esc(st.ad)}" maxlength="40">`) + fld('Birim', sel(`i.${k}.birim`, st.birim, [['mm', 'mm (giden)'], ['°', '° (dönen kol)']])) + fld('Hareket eğrisi', sel(`i.${k}.yasa`, st.yasa, Object.entries(YASALAR).map(([a, b]) => [a, b.ad]))) + fld('Faz (kaydırma)', num(`i.${k}.faz`, st.faz, 1), '°') + '</div>';
        st.plan.forEach((p, i) => {
          const prev = st.plan[i - 1], tur = !prev ? 'başlangıç' : Math.abs(p[1] - prev[1]) < 1e-9 ? 'bekle' : p[1] > prev[1] ? 'ileri ↑' : 'geri ↓';
          s += `<div class="mk-grid">${fld((i + 1) + '. açı', num(`p.${k}.${i}.0`, p[0], 1), '°')}${fld('konum', num(`p.${k}.${i}.1`, p[1], 0.5), st.birim)}<div class="mk-f"><span>${esc(tur)}</span>${st.plan.length > 2 ? `<button data-act="mk-tpdel-${k}-${i}" class="mk-dg">🗑</button>` : ''}</div></div>`;
        });
        s += `<div class="mk-btns"><button data-act="mk-tpadd-${k}">+ Satır ekle</button><button data-act="mk-ttokam-${k}">⚙ Bu istasyonun eksantriğini tasarla</button></div>`;
      }
      s += '</div>';
    });
    s += '<div class="mk-btns"><button data-act="mk-tadd">+ İstasyon ekle</button></div></div>';
    // kurallar
    const opts = C.ist.map((st, k) => [k, (k + 1) + '. ' + st.ad]);
    s += '<div class="mk-card"><b>Kurallar</b><div class="mk-n">"İleride" = istasyon, strokunun eşik yüzdesinden fazla ilerlemiş. Pay: arada bırakılacak en az açı (parça boyu, esneme ve boşluklar için).</div>';
    C.kural.forEach((k, i) => {
      s += `<div style="padding:4px 0;border-top:1px solid #1e293b"><div class="mk-grid">${fld('A', sel(`k.${i}.a`, k.a, opts))}${fld('Kural', sel(`k.${i}.tur`, k.tur, [['ayri', 'A ile B aynı anda ileride olmasın'], ['icinde', 'B yalnız A ilerideyken ileri gitsin']]))}${fld('B', sel(`k.${i}.b`, k.b, opts))}</div>`;
      s += `<div class="mk-grid">${fld('A eşiği', num(`k.${i}.esikA`, k.esikA, 1), '%')}${fld('B eşiği', num(`k.${i}.esikB`, k.esikB, 1), '%')}${fld('Pay', num(`k.${i}.pay`, k.pay, 1), '°')}<div class="mk-f"><span>&nbsp;</span><button data-act="mk-tkdel-${i}" class="mk-dg">🗑</button></div></div></div>`;
    });
    s += `<div class="mk-btns"><button data-act="mk-tkadd"${C.ist.length < 2 ? ' disabled' : ''}>+ Kural ekle</button></div></div>`;
    if (r.hata) return s + `<div class="mk-card"><div class="mk-c hata">✗ ${esc(r.hata)}</div></div>`;
    s += '<div class="mk-card"><b>Sonuç</b>';
    if (!r.sonuc.length) s += '<div class="mk-c i">ℹ Kural girilmedi: çizelge gösteriliyor, çakışma denetlenmiyor.</div>';
    r.sonuc.forEach((x, i) => {
      s += `<div class="mk-c ${x.ok ? 'ok' : x.duzey}">${x.ok ? '✓' : x.duzey === 'hata' ? '✗' : '⚠'} ${esc(x.metin)}</div>`;
      if (x.oneri) {
        s += `<div class="mk-n">Öneri: ${esc(oneriYazi(x, r.c))}</div><div class="mk-btns">`;
        if (x.oneri.geciktir != null) s += `<button data-act="mk-tap-${i}-g">↻ ${tr(x.oneri.geciktir, 1)}° geciktir</button>`;
        if (x.oneri.oneAl != null) s += `<button data-act="mk-tap-${i}-o">↺ ${tr(x.oneri.oneAl, 1)}° öne al</button>`;
        s += '</div>';
      }
    });
    s += '<div class="mk-btns"><button data-act="mk-tpdf">📄 Çevrim diyagramı PDF</button><button data-act="mk-tcsv">⬇ Açı – konum tablosu (CSV)</button></div>';
    s += '<div class="mk-n">Faz, istasyonun eksantriğinin mile kaç derece döndürülerek takılacağıdır (kama kanalı 0° çizgisinden o kadar kaydırılır). Gerçek parça boyu, esneme ve boşluklar hesapta yok: makineyi önce yavaş devirde, elle çevirerek dene.</div></div>';
    return s;
  }
  function input(el) {
    const C = Q(), k = el.dataset.mkt, v = Number(String(el.value).replace(',', '.'));
    if (k === 'aci') { aci = Number.isFinite(v) ? v : 0; api.render(); return; }
    let m;
    if (k === 'n') { if (v > 0) C.n = v; }
    else if ((m = /^i\.(\d+)\.(ad|birim|yasa|faz)$/.exec(k))) { const st = C.ist[+m[1]]; if (!st) return; if (m[2] === 'faz') { if (Number.isFinite(v)) st.faz = ((v % 360) + 360) % 360; } else st[m[2]] = String(el.value).slice(0, 40); }
    else if ((m = /^p\.(\d+)\.(\d+)\.([01])$/.exec(k))) { const p = C.ist[+m[1]]?.plan[+m[2]]; if (p && Number.isFinite(v)) p[+m[3]] = v; }
    else if ((m = /^k\.(\d+)\.(a|b|tur|esikA|esikB|pay)$/.exec(k))) { const q = C.kural[+m[1]]; if (!q) return; if (m[2] === 'tur') q.tur = el.value; else if (Number.isFinite(v)) q[m[2]] = v; }
    Object.assign(C, cevrimSanitize(C));
    h.changed();
  }
  function pdf(r) {
    const doc = pdfDoc(), T = h.pdfText, ad = api.name() || '';
    const pg = doc.page(297, 210), x0 = 52, W = 230, lane = Math.min(30, 150 / Math.max(1, r.c.ist.length)), yTop = 182;
    pg.text(14, 200, 12, T('MAKİNE ÇEVRİM DİYAGRAMI' + (ad ? ' · ' + ad : '')));
    pg.text(14, 194, 8, T(`Ana mil ${r.c.n} çevrim/dk · bir çevrim ${r.msTur.toFixed(0)} ms · yatay: ana mil açısı (0–360°), her şerit: istasyon konumu (0 – strok)`));
    pg.lineWidth(0.1); pg.color(0.75, 0.75, 0.75);
    for (let a = 0; a <= 360; a += 30) { const x = x0 + a / 360 * W; pg.line(x, yTop + 2, x, yTop - r.c.ist.length * lane); if (a % 90 === 0) { pg.color(0, 0, 0); pg.text(x - 3, yTop + 3, 7, T(a + '°')); pg.color(0.75, 0.75, 0.75); } }
    r.c.ist.forEach((st, k) => {
      const yb = yTop - (k + 1) * lane + 3, hh = lane - 7, yol = r.yol[k], [cr, cg, cb] = RGB(RENK[k % RENK.length]);
      pg.color(0.5, 0.5, 0.5); pg.lineWidth(0.15); pg.line(x0, yb, x0 + W, yb);
      pg.color(cr * 0.75, cg * 0.75, cb * 0.75); pg.lineWidth(0.45);
      let px = null, py = null;
      for (let i = 0; i <= r.N; i += 4) { const ii = i % r.N, x = x0 + i * r.ADIM / 360 * W, y = yb + (yol.smax > 0 ? yol.y[ii] / yol.smax : 0) * hh; if (px != null) pg.line(px, py, x, y); px = x; py = y; }
      pg.color(0, 0, 0); pg.text(14, yb + hh / 2, 7.5, T(st.ad.slice(0, 18))); pg.text(14, yb + hh / 2 - 3.5, 6, T(`${yol.smax} ${st.birim} · faz ${st.faz}°`));
    });
    pg.color(0, 0, 0);
    let p2 = doc.page(210, 297), y = 283;
    for (const raw of cevrimRapor(r, ad)) { const s = T(raw), size = /^[A-ZÇĞİÖŞÜ ()—-]+$/.test(s.trim()) && s.trim() ? 10 : 8.5; for (let k = 0; k < Math.max(1, s.length); k += 120) { if (y < 16) { p2 = doc.page(210, 297); y = 283; } p2.text(14, y, size, (k ? '     ' : '') + s.slice(k, k + 120)); y -= size * 0.5; } }
    return new Blob([doc.build()], { type: 'application/pdf' });
  }
  function act(a) {
    let m;
    const C = Q(), P = h.getP(), dosya = () => (api.name() || 'proje') + '_cevrim';
    if (a === 'mk-tornek') { P.cevrim = CEVRIM_ORNEK(); acik = 0; aci = 0; h.changed(); api.toast('Şablon yüklendi (temsilî değerler)'); return true; }
    if (a === 'mk-tkam') {
      const K = kamSanitize(P.kam);
      C.ist.push({ ad: 'Eksantrik ' + (C.ist.length + 1), birim: K.izleyici === 'salinim' ? '°' : 'mm', yasa: K.yasa, faz: 0, plan: K.plan.map((p) => p.slice()) });
      acik = C.ist.length - 1; Object.assign(C, cevrimSanitize(C)); h.changed(); api.toast('Eksantrik sekmesindeki hareket istasyon olarak eklendi'); return true;
    }
    if (a === 'mk-tadd') { C.ist.push({ ad: 'İstasyon ' + (C.ist.length + 1), birim: 'mm', yasa: 'mods', faz: 0, plan: [[0, 0], [90, 0], [180, 20], [270, 20], [360, 0]] }); acik = C.ist.length - 1; Object.assign(C, cevrimSanitize(C)); h.changed(); return true; }
    if ((m = /^mk-tac-(\d+)$/.exec(a))) { acik = acik === +m[1] ? -1 : +m[1]; api.render(); return true; }
    if ((m = /^mk-tdel-(\d+)$/.exec(a))) {
      const k = +m[1]; C.ist.splice(k, 1);
      C.kural = C.kural.filter((q) => q.a !== k && q.b !== k).map((q) => ({ ...q, a: q.a > k ? q.a - 1 : q.a, b: q.b > k ? q.b - 1 : q.b }));
      acik = -1; h.changed(); return true;
    }
    if ((m = /^mk-tpadd-(\d+)$/.exec(a))) { const L = C.ist[+m[1]]?.plan; if (L) { const last = L[L.length - 1], prev = L[L.length - 2]; L.splice(L.length - 1, 0, [Math.round((prev[0] + last[0]) / 2), prev[1]]); h.changed(); } return true; }
    if ((m = /^mk-tpdel-(\d+)-(\d+)$/.exec(a))) { const L = C.ist[+m[1]]?.plan; if (L && L.length > 2) { L.splice(+m[2], 1); h.changed(); } return true; }
    if (a === 'mk-tkadd') { if (C.ist.length >= 2) { C.kural.push({ a: 0, b: 1, tur: 'ayri', esikA: 10, esikB: 10, pay: 5 }); h.changed(); } return true; }
    if ((m = /^mk-tkdel-(\d+)$/.exec(a))) { C.kural.splice(+m[1], 1); h.changed(); return true; }
    if ((m = /^mk-ttokam-(\d+)$/.exec(a))) {
      const st = C.ist[+m[1]]; if (!st) return true;
      P.kam = kamSanitize({ ...kamSanitize(P.kam), plan: st.plan.map((p) => p.slice()), yasa: st.yasa, izleyici: st.birim === '°' ? 'salinim' : 'oteleme', kamTur: kamSanitize(P.kam).kamTur === 'tambur' && st.birim === '°' ? 'disk' : kamSanitize(P.kam).kamTur });
      if (h.toKam) h.toKam();
      h.changed();
      api.toast(`"${st.ad}" hareketi Eksantrik sekmesine aktarıldı` + (st.faz ? ` · diski mile ${st.faz}° döndürerek tak (kama kanalını 0° çizgisinden ${st.faz}° kaydır)` : ''));
      return true;
    }
    const r = cevrimHesap(C);
    if ((m = /^mk-tap-(\d+)-([go])$/.exec(a))) {
      const x = r.sonuc && r.sonuc[+m[1]]; if (!x || !x.oneri) return true;
      const st = C.ist[x.k.b], d = m[2] === 'g' ? x.oneri.geciktir : -x.oneri.oneAl;
      st.faz = ((st.faz + d) % 360 + 360) % 360; h.changed(); api.toast(`${st.ad}: faz ${st.faz}°`); return true;
    }
    if (/^mk-t(pdf|csv)$/.test(a) && r.hata) { api.toast(r.hata); return true; }
    if (a === 'mk-tpdf') { api.saveBlob(pdf(r), dosya() + '.pdf'); api.toast('İndirildi'); return true; }
    if (a === 'mk-tcsv') { api.saveBlob(new Blob([cevrimCSV(r)], { type: 'text/csv;charset=utf-8' }), dosya() + '.csv'); api.toast('İndirildi'); return true; }
    return false;
  }
  return { html, input, act };
}
