// Mekatronik Mühendisliği — 4. aşama elektrik görünümü. Hesaplar meka/elec.js'te; bu dosya yalnız gösterir.
// h: { api, getP() → proje (P.elek, P.items), changed(), esc, nf, pdfText }
import { elekSystem, elekSanitize, yukEkle, agactanYukler, bagliDeger, kabloListesi, klemensPlani, kabloCSV, klemensCSV, kabloTip, tekHat, elekRapor, YONTEMLER, TURLER, EGRI } from './elec.js?v=20261118f';
import { pdfDoc } from '../tx/pdf.js?v=20261112u';

const AYAR_ALAN = [
  ['Şebeke', [['U3', 'Faz arası gerilim', 'V', 1], ['U1', 'Faz – nötr gerilimi', 'V', 1], ['Udc', 'Kumanda gerilimi (DC)', 'V', 1], ['Ze', 'Kaynak çevrim empedansı Ze (şebeke / trafo verisi)', 'Ω', 0.01], ['Lana', 'Ana besleme kablosu boyu', 'm', 1], ['anaEgri', 'Ana koruma eğrisi']]],
  ['Kablo döşeme', [['yontem', 'Kurulum yöntemi'], ['T', 'Ortam sıcaklığı', '°C', 1], ['grup', 'Aynı kanalda / demette devre sayısı', '', 1], ['kGelle', 'Gruplama katsayısı elle (0 = tablodan)', '', 0.01], ['Smin', 'En küçük kesit', 'mm²', 0.25], ['dUmax', 'Gerilim düşümü sınırı (IEC 60204-1: %5)', '%', 0.5], ['ks', 'Eşzamanlılık katsayısı (1 = hepsi aynı anda)', '', 0.05]]],
  ['24 V güç kaynağı (katalog)', [['psuIn', 'Anma çıkış akımı (0 = öner)', 'A', 0.5], ['psuPay', 'Akım payı', '×', 0.05], ['psuEta', 'Verim', '', 0.01], ['psuLam', 'Güç katsayısı λ', '', 0.01], ['psuL', 'Besleme kablosu boyu', 'm', 0.5], ['psuEgri', 'Koruma eğrisi']]],
];
const EGRI_SEC = Object.keys(EGRI).map((k) => [k, k + ' eğrisi']);

export function createElekUI(h) {
  const { api, esc, nf } = h;
  const p2 = (v) => (Number.isFinite(v) ? v.toFixed(2).replace('.', ',') : '—');
  const E = () => { const P = h.getP(); if (!P.elek || !P.elek.ayar) P.elek = elekSanitize(P.elek); return P.elek; };
  const items = () => h.getP().items || [];
  const hesapla = () => {
    const e = E(), bag = e.yukler.map((y) => bagliDeger(y, items()));
    return { sys: elekSystem({ ayar: e.ayar, yukler: bag.map((b) => b.y) }), bag };
  };
  const sel = (attr, cur, opts) => `<select data-mke="${attr}">${opts.map(([o, t]) => `<option value="${esc(o)}"${o === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const num = (attr, v, step) => `<input type="number" inputmode="decimal" step="${step || 'any'}" data-mke="${attr}" value="${Number.isFinite(v) ? v : ''}">`;
  const fld = (label, unit, inner) => `<label class="mk-f"><span>${esc(label)}${unit ? ' <i>(' + esc(unit) + ')</i>' : ''}</span>${inner}</label>`;

  function ayarHtml() {
    const a = E().ayar;
    return '<div class="mk-card">' + AYAR_ALAN.map(([g, fs]) => `<div class="mk-g">${esc(g)}</div><div class="mk-grid">` + fs.map(([k, l, u, st]) => fld(l, u,
      k === 'yontem' ? sel('ayar.yontem', a.yontem, Object.entries(YONTEMLER)) : /Egri$/.test(k) ? sel('ayar.' + k, a[k], EGRI_SEC) : num('ayar.' + k, a[k], st))).join('') + '</div>').join('') + '</div>';
  }
  function yukHtml(y, b, d) {
    const k = b.kaynak, id = y.id, lk = (f, v, u) => `<div class="mk-lk" title="${esc(k[f])}">🔗 ${esc(nf(v, 4))} ${esc(u)} <i>${esc(k[f])}</i></div>`;
    let s = `<div class="mk-card mk-it" data-yuk="${id}"><div class="mk-grid">`;
    s += fld('Ad', '', `<input data-mke="y.${id}.ad" value="${esc(y.ad)}" maxlength="60">`);
    s += fld('Besleme', '', sel(`y.${id}.tur`, y.tur, Object.entries(TURLER)));
    s += fld('Giriş', '', sel(`y.${id}.giris`, y.giris, [['P', 'Güç (W)'], ['I', 'Akım (A, katalog)']]));
    s += y.giris === 'I' ? fld('Akım', 'A', k.I ? lk('I', b.y.I, 'A') : num(`y.${id}.I`, y.I, 0.1)) : fld(y.tur === 'dc' ? 'Güç tüketimi' : 'Güç (mil gücüyse verimi gir)', 'W', k.P ? lk('P', b.y.P, 'W') : num(`y.${id}.P`, y.P, 10));
    if (y.tur !== 'dc') s += fld('cos φ', '', num(`y.${id}.cos`, y.cos, 0.01));
    if (y.giris === 'P') s += fld('Verim η', '', num(`y.${id}.eta`, y.eta, 0.01));
    s += fld('Kablo boyu', 'm', num(`y.${id}.L`, y.L, 1));
    s += fld('Koruma eğrisi', '', sel(`y.${id}.egri`, y.egri, EGRI_SEC));
    s += fld('Koruma In (0 = otomatik)', 'A', num(`y.${id}.In`, y.In, 1));
    s += fld('Kesit (0 = otomatik)', 'mm²', num(`y.${id}.S`, y.S, 0.25));
    s += '</div>';
    if (d && d.r) {
      const r = d.r.sonuc;
      s += `<div class="mk-r"><span>${esc(d.F)} · ${esc(d.W)} ${esc(kabloTip(y.tur, r.S))}${d.faz ? ' · ' + esc(d.faz) : ''}</span><b class="${d.r.uygun ? 'ok' : 'bad'}">${d.r.uygun ? '✓' : '✗'} Ib ${esc(nf(r.Ib, 2))} A · ${esc(y.egri + r.In)} A · ΔU %${esc(p2(r.dUp))}${r.Zs != null ? ' · Zs ' + esc(nf(r.Zs, 3)) + ' Ω' : ''}</b></div>`;
      for (const c of d.r.kontroller.filter((c) => !c.ok)) s += `<div class="mk-c ${c.duzey}">${c.duzey === 'hata' ? '✗' : '⚠'} ${esc(c.metin)}</div>`;
    } else if (d && d.hata) s += `<div class="mk-c hata">⚠ ${esc(d.hata)}</div>`;
    s += `<div class="mk-btns"><button data-act="mk-edel-${id}" class="mk-dg">🗑 Sil</button></div></div>`;
    return s;
  }
  function svg(th) {
    const p = th.prims.map((q) => q.t === 'l' ? `<line x1="${q.x1}" y1="${q.y1}" x2="${q.x2}" y2="${q.y2}"/>` : q.t === 'r' ? `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="none"/>` : `<text x="${q.x}" y="${q.y}" font-size="${q.size}" text-anchor="${q.center ? 'middle' : 'start'}" stroke="none" fill="currentColor">${esc(q.str)}</text>`).join('');
    return `<div class="mk-tbl"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${th.w} ${th.h}" style="width:${Math.max(th.w * 3, 320)}px;max-width:none;color:#e2e8f0" stroke="#7dd3fc" stroke-width="0.35">${p}</svg></div>`;
  }
  function html() {
    const e = E(), { sys, bag } = hesapla();
    let s = '<div class="mk-g">Şebeke, kablo döşeme ve güç kaynağı</div>' + ayarHtml();
    s += `<div class="mk-g">Elektrik yükleri (${e.yukler.length})</div><div class="mk-btns"><button data-act="mk-eadd-ac3">+ 3 faz yük</button><button data-act="mk-eadd-ac1">+ 1 faz yük</button><button data-act="mk-eadd-dc">+ 24 V yük</button><button data-act="mk-eagac">🌳 Ürün ağacından al</button></div>`;
    if (!e.yukler.length) s += '<div class="mk-card mk-n">Henüz yük yok. Sürücü, valf, sensör ve motor freni gibi yükleri ekle ya da ürün ağacından al; değerleri üreticinin kataloğundan gir.</div>';
    e.yukler.forEach((y, i) => { const d = sys.devreler.find((q) => !q.ozel && q.c.id === y.id); s += yukHtml(y, bag[i], d); });
    if (e.yukler.length) {
      s += `<div class="mk-g">Sonuç</div><div class="mk-card"><div class="mk-v ${sys.uygun ? 'ok' : 'bad'}">${sys.uygun ? '✓ UYGUN' : '✗ UYGUN DEĞİL'}</div>`;
      if (sys.dc) s += `<div class="mk-r"><span>24 V toplam akım / gereken güç kaynağı</span><b>${esc(nf(sys.dc.toplam, 2))} / ${esc(nf(sys.dc.gerek, 2))} A</b></div><div class="mk-r"><span>Güç kaynağı giriş akımı</span><b>${esc(nf(sys.dc.Iin, 3))} A</b></div>`;
      s += `<div class="mk-r"><span>Faz akımları L1 / L2 / L3</span><b>${sys.fazlar.map((v) => esc(nf(v, 2))).join(' / ')} A</b></div>`;
      if (sys.ana) s += `<div class="mk-r"><span>Ana koruma -Q1 / besleme -W0</span><b>${esc(sys.ana.giris.egri + sys.ana.sonuc.In)} A · ${esc(kabloTip('ac3', sys.ana.sonuc.S, sys.ana.notr))} · ΔU %${esc(p2(sys.ana.sonuc.dUp))}</b></div>`;
      for (const c of [...sys.kontroller, ...(sys.ana ? sys.ana.kontroller : [])].filter((c) => !c.ok)) s += `<div class="mk-c ${c.duzey}">${c.duzey === 'hata' ? '✗' : '⚠'} ${esc(c.metin)}</div>`;
      for (const m of sys.hatalar) s += `<div class="mk-c hata">⚠ ${esc(m)}</div>`;
      s += '</div><div class="mk-g">Tek hat şeması</div>' + svg(tekHat(sys));
      s += '<div class="mk-btns" style="margin-top:8px"><button data-act="mk-ekablo">⬇ Kablo listesi (CSV)</button><button data-act="mk-eklemens">⬇ Klemens planı (CSV)</button><button data-act="mk-epdf">⬇ Elektrik raporu (PDF)</button></div>';
    }
    s += '<div class="mk-card mk-n">Kablo kesiti IEC 60204-1 Tablo 6 (PVC, bakır, 0,75–50 mm²) ve Ek D katsayılarıyla; koruma IEC 60364-4-43, otomatik kesme IEC 60364-4-41 (TN). Motor yol alma akımı, RCD seçimi, kısa devre kesme kapasitesi ve EMC kapsam dışıdır; tesisat yetkili elektrik mühendisi onayıyla kesinleşir.</div>';
    return s;
  }
  function input(el) {
    const p = el.dataset.mke.split('.'), e = E();
    if (p[0] === 'ayar') {
      const k = p[1];
      if (!(k in e.ayar)) return;
      if (typeof e.ayar[k] === 'string') e.ayar[k] = el.value;
      else { const v = Number(String(el.value).replace(',', '.')); e.ayar[k] = el.value === '' || !Number.isFinite(v) ? NaN : v; }
    } else if (p[0] === 'y') {
      const y = e.yukler.find((q) => q.id === Number(p[1])), f = p[2];
      if (!y) return;
      if (f === 'ad') y.ad = String(el.value).slice(0, 60) || 'Yük';
      else if (f === 'tur') { if (TURLER[el.value]) y.tur = el.value; }
      else if (f === 'giris') y.giris = el.value === 'I' ? 'I' : 'P';
      else if (f === 'egri') { if (EGRI[el.value]) y.egri = el.value; }
      else if (['I', 'P', 'cos', 'eta', 'L', 'In', 'S'].includes(f)) { const v = Number(String(el.value).replace(',', '.')); y[f] = el.value === '' || !Number.isFinite(v) ? (f === 'In' || f === 'S' ? 0 : NaN) : v; }
    }
    h.changed();
  }
  function pdf(sys) {
    const doc = pdfDoc(), T = h.pdfText;
    let pg, y, no = 0;
    const newPage = (w = 210, hh = 297) => { pg = doc.page(w, hh); no++; y = hh - 16; pg.text(14, 8, 8, T('Çizim Atölyesi - Mekatronik Mühendisliği - Elektrik - sayfa ' + no)); return hh; };
    // 1. sayfa: tek hat şeması (yatay A4, sığmazsa ölçeklenir)
    const th = tekHat(sys), W = 297, H = newPage(297, 210), sc = Math.min(1.6, (W - 28) / th.w, (H - 40) / th.h), ox = 14, oy = H - 24;
    pg.text(14, H - 14, 12, T('TEK HAT ŞEMASI' + (api.name() ? ' · ' + api.name() : '')));
    pg.lineWidth(0.3);
    for (const q of th.prims) {
      if (q.t === 'l') pg.line(ox + q.x1 * sc, oy - q.y1 * sc, ox + q.x2 * sc, oy - q.y2 * sc);
      else if (q.t === 'r') pg.rect(ox + q.x * sc, oy - (q.y + q.h) * sc, q.w * sc, q.h * sc);
      else pg.text(ox + q.x * sc, oy - q.y * sc, q.size * sc * 2.83, T(q.str), 0, q.center);
    }
    // sonraki sayfalar: hesap raporu
    newPage();
    const wrap = (s, size) => { const out = []; let cur = ''; for (const w of s.split(' ')) { const t = cur ? cur + ' ' + w : w; if (t.length * size * 0.19 > 182 && cur) { out.push(cur); cur = '  ' + w; } else cur = t; } out.push(cur); return out; };
    elekRapor(sys, api.name()).forEach((raw, i) => {
      const s = T(raw), size = i === 0 ? 12 : /^[A-ZÇĞİÖŞÜ ]+$/.test(s.trim()) && s.trim() ? 10 : 8.5;
      for (const ln of wrap(s, size)) { if (y < 16) newPage(); pg.text(14, y, size, ln); y -= size * 0.5; }
      if (!s.trim()) y -= 1;
    });
    return new Blob([doc.build()], { type: 'application/pdf' });
  }
  function act(a) {
    let m;
    const ad = () => api.name() || 'proje';
    if ((m = /^mk-eadd-(ac3|ac1|dc)$/.exec(a))) { yukEkle(E(), m[1]); h.changed(); return true; }
    if ((m = /^mk-edel-(\d+)$/.exec(a))) { const e = E(); e.yukler = e.yukler.filter((y) => y.id !== Number(m[1])); h.changed(); api.toast('Yük silindi'); return true; }
    if (a === 'mk-eagac') { const n = agactanYukler(E(), items()).length; api.toast(n ? n + ' yük ürün ağacından eklendi; eksik katalog değerlerini gir' : 'Ürün ağacında eklenecek yeni sürücü, valf, sensör ya da frenli motor yok'); h.changed(); return true; }
    if (a === 'mk-ekablo' || a === 'mk-eklemens' || a === 'mk-epdf') {
      const { sys } = hesapla();
      if (a === 'mk-ekablo') api.saveBlob(new Blob([kabloCSV(kabloListesi(sys))], { type: 'text/csv;charset=utf-8' }), ad() + '_kablo_listesi.csv');
      else if (a === 'mk-eklemens') api.saveBlob(new Blob([klemensCSV(klemensPlani(sys))], { type: 'text/csv;charset=utf-8' }), ad() + '_klemens_plani.csv');
      else api.saveBlob(pdf(sys), ad() + '_elektrik.pdf');
      api.toast('İndirildi'); return true;
    }
    return false;
  }
  return { html, input, act };
}
