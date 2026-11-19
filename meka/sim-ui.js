// Mekatronik Mühendisliği — 7. aşama benzetim görünümü. Hesap meka/sim.js'te; bu dosya yalnız gösterir.
// h: { api, getP() → proje (P.sim, P.calc), changed(), esc, pdfText, kart(k) → eksen kartı hesap sonucu }
import { simSanitize, simule, tahrikEkle, hareketEkle, karttanTahrik, cizelge, seriCSV, simRapor, simOrnek, TAHRIK_TUR, BASLA } from './sim.js?v=20261119b';
import { pdfDoc } from '../tx/pdf.js?v=20261112u';

const KARTLAR = [['vida', 'Vidalı eksen'], ['kayis', 'Kayışlı eksen'], ['kremayer', 'Kremayer'], ['tabla', 'Döner tabla']];

export function createSimUI(h) {
  const { api, esc } = h;
  let alt = 'cevrim', kilA = '', kilB = '', zaman = 0;
  const Q = () => { const P = h.getP(); if (!P.sim || !Array.isArray(P.sim.tahrikler)) P.sim = simSanitize(P.sim); return P.sim; };
  const sel = (attr, cur, opts) => `<select data-mks="${attr}">${opts.map(([o, t]) => `<option value="${esc(o)}"${String(o) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const num = (attr, v, step = 'any') => `<input type="number" inputmode="decimal" step="${step}" data-mks="${attr}" value="${Number.isFinite(v) ? v : ''}">`;
  const fld = (label, inner) => `<label class="mk-f"><span>${esc(label)}</span>${inner}</label>`;
  const tr = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d).replace('.', ',') : '—');
  const kont = (ks) => ks.filter((c) => !c.ok || c.duzey === 'bilgi').map((c) => `<div class="mk-c ${c.ok ? 'i' : c.duzey}">${c.ok ? 'ℹ' : c.duzey === 'hata' ? '✗' : '⚠'} ${esc(c.metin)}</div>`).join('');
  function svg(c) {
    const p = c.prims.map((q) => q.t === 'l' ? `<line x1="${q.x1.toFixed(2)}" y1="${q.y1.toFixed(2)}" x2="${q.x2.toFixed(2)}" y2="${q.y2.toFixed(2)}"/>` : q.t === 'r' ? `<rect x="${q.x.toFixed(2)}" y="${q.y}" width="${q.w.toFixed(2)}" height="${q.h}" fill="#0ea5e9" fill-opacity="0.35"/>` : `<text x="${q.x.toFixed(2)}" y="${q.y.toFixed(2)}" font-size="${q.size}" text-anchor="${q.center ? 'middle' : 'start'}" stroke="none" fill="currentColor">${esc(q.str)}</text>`).join('');
    return `<div class="mk-tbl"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.w} ${c.h}" style="width:100%;min-width:330px;color:#e2e8f0" stroke="#7dd3fc" stroke-width="0.3">${p}</svg></div>`;
  }
  function tahrikHtml(S) {
    let s = '<div class="mk-card mk-n">Her motor, silindir ya da sabit süreli işlem bir tahriktir. Elektrikli eksen değerlerini hesap kartından tek dokunuşla al (kartın o anki sonucu kopyalanır) ya da katalogdan gir.</div>';
    s += '<div class="mk-btns">' + KARTLAR.map(([k, ad]) => `<button data-act="mk-skart-${k}">⤵ ${esc(ad)} kartından</button>`).join('') + '<button data-act="mk-sadd-eksen">+ Eksen (elle)</button><button data-act="mk-sadd-pnomatik">+ Pnömatik silindir</button><button data-act="mk-sadd-sure">+ Sabit süreli işlem</button></div>';
    for (const t of S.tahrikler) {
      s += `<div class="mk-card mk-it" data-tahrik="${t.id}"><div class="mk-ih"><b>${esc(t.ad)}</b> <i>${esc(TAHRIK_TUR[t.tur])}</i></div><div class="mk-grid">`;
      s += fld('Ad', `<input data-mks="t.${t.id}.ad" value="${esc(t.ad)}" maxlength="60">`);
      if (t.tur === 'eksen') {
        s += fld('Birim', sel(`t.${t.id}.birim`, t.birim, [['mm', 'mm (doğrusal)'], ['°', '° (döner)']]));
        s += fld('Toplam atalet J (motor dahil, motor milinde)', num(`t.${t.id}.J`, t.J, 0.00001) + '<i>kg·m²</i>') + fld('Yük torku (motorda)', num(`t.${t.id}.Tl`, t.Tl, 0.01) + '<i>N·m</i>') + fld('Beklemede tutma torku', num(`t.${t.id}.Th`, t.Th, 0.01) + '<i>N·m</i>');
        s += fld(`k: motor devri / ${t.birim}`, num(`t.${t.id}.k`, t.k, 0.0001) + `<i>dev/${esc(t.birim)}</i>`);
        s += fld('Motor rotor ataleti Jm', num(`t.${t.id}.Jm`, t.Jm, 0.000001) + '<i>kg·m²</i>') + fld('Anma torku Tn', num(`t.${t.id}.Tn`, t.Tn, 0.01) + '<i>N·m</i>') + fld('En yüksek tork', num(`t.${t.id}.Tmax`, t.Tmax, 0.01) + '<i>N·m</i>') + fld('En yüksek devir', num(`t.${t.id}.nmax`, t.nmax, 100) + '<i>dev/dk</i>') + fld('Güvenlik katsayısı (RMS)', num(`t.${t.id}.SF`, t.SF, 0.1)) + fld('İzin verilen atalet oranı', num(`t.${t.id}.oranSinir`, t.oranSinir, 1));
      }
      s += `</div>${t.kaynak ? `<div class="mk-n">Kaynak: ${esc(t.kaynak)}</div>` : ''}<div class="mk-btns"><button data-act="mk-sdel-t-${t.id}" class="mk-dg">🗑 Sil</button></div></div>`;
    }
    return s;
  }
  function hareketHtml(S) {
    let s = '<div class="mk-card mk-n">Hareketler sırayla çalışır. "Öncekiyle birlikte" seçilirse önceki hareketle aynı anda başlar; ofset ile geciktirilebilir.</div>';
    s += '<div class="mk-btns"><button data-act="mk-sadd-h">+ Hareket</button></div>';
    S.hareketler.forEach((x, i) => {
      const t = S.tahrikler.find((d) => d.id === x.tahrik);
      s += `<div class="mk-card mk-it" data-hareket="${x.id}"><div class="mk-ih"><b>${i + 1}. ${esc(x.ad)}</b></div><div class="mk-grid">`;
      s += fld('Ad', `<input data-mks="h.${x.id}.ad" value="${esc(x.ad)}" maxlength="60">`) + fld('Tahrik', sel(`h.${x.id}.tahrik`, x.tahrik ?? '', [['', '— seç —'], ...S.tahrikler.map((d) => [d.id, d.ad])]));
      if (i > 0) s += fld('Başlangıç', sel(`h.${x.id}.basla`, x.basla, Object.entries(BASLA)));
      s += fld('Ofset (gecikme)', num(`h.${x.id}.ofset`, x.ofset, 0.01) + '<i>s</i>');
      if (t?.tur === 'sure') s += fld('Süre', num(`h.${x.id}.sure`, x.sure, 0.1) + '<i>s</i>');
      else if (t) {
        const b = t.tur === 'pnomatik' ? 'mm' : t.birim;
        s += fld(t.tur === 'pnomatik' ? 'Strok' : 'Yol', num(`h.${x.id}.yol`, x.yol, 1) + `<i>${esc(b)}</i>`) + fld(t.tur === 'pnomatik' ? 'Ortalama piston hızı (katalog)' : 'En yüksek hız', num(`h.${x.id}.v`, x.v, 1) + `<i>${esc(b)}/s</i>`);
        s += t.tur === 'pnomatik' ? fld('Valf + tepki gecikmesi', num(`h.${x.id}.gecikme`, x.gecikme, 0.01) + '<i>s</i>') : fld('Hızlanma = yavaşlama süresi', num(`h.${x.id}.ta`, x.ta, 0.01) + '<i>s</i>');
      }
      s += `</div><div class="mk-btns">${i > 0 ? `<button data-act="mk-sup-${x.id}">↑</button>` : ''}${i < S.hareketler.length - 1 ? `<button data-act="mk-sdown-${x.id}">↓</button>` : ''}<button data-act="mk-sdel-h-${x.id}" class="mk-dg">🗑 Sil</button></div></div>`;
    });
    s += '<div class="mk-g">Kilitler (zamanda çakışamaz)</div><div class="mk-card">';
    const ad = (id) => (S.hareketler.find((x) => x.id === id) || {}).ad || '?';
    S.kilitler.forEach(([x, y], i) => { s += `<div class="mk-r"><span>${esc(ad(x))} ⟂ ${esc(ad(y))}</span><button data-act="mk-skdel-${i}" class="mk-dg">Sil</button></div>`; });
    if (S.hareketler.length >= 2) { const op = [['', '—'], ...S.hareketler.map((x, i) => [x.id, i + 1 + '. ' + x.ad])]; s += `<div class="mk-grid">${fld('Hareket', sel('k.a', kilA, op))}${fld('Hareket', sel('k.b', kilB, op))}</div><div class="mk-btns"><button data-act="mk-skadd">+ Kilit ekle</button></div>`; }
    else s += '<div class="mk-n">Kilit için en az iki hareket gerekir (ör. tabla dönerken itici ileri çıkmamalı).</div>';
    return s + '</div>';
  }
  function cevrimHtml(S) {
    const sim = simule(S);
    let s = `<div class="mk-card"><div class="mk-v ${sim.uygun ? 'ok' : 'bad'}">${sim.uygun ? '✓ UYGUN' : '✗ UYGUN DEĞİL'}</div>`;
    s += `<div class="mk-r"><span>Çevrim süresi</span><b>${tr(sim.tcyc, 3)} s</b></div><div class="mk-r"><span>Saatte</span><b>${tr(sim.adetSaat, 1)} adet</b></div><div class="mk-r"><span>Vardiyada (${tr(S.ayar.vardiya, 1)} saat, %${tr(S.ayar.verim, 0)} verim)</span><b>${Math.floor(sim.adetVardiya)} adet</b></div>`;
    s += `<div class="mk-grid">${fld('Vardiya süresi', num('a.vardiya', S.ayar.vardiya, 0.5) + '<i>saat</i>')}${fld('Toplam verim (duruşlar dahil)', num('a.verim', S.ayar.verim, 1) + '<i>%</i>')}</div>`;
    for (const m of sim.motorlar) s += `<div class="mk-r"><span>${esc(m.t.ad)}: RMS / tepe tork · devir</span><b>${tr(m.rms, 3)} / ${tr(m.tepe, 3)} N·m · ${tr(m.nmax, 0)} dev/dk</b></div>`;
    s += kont(sim.kontroller) + '</div>';
    if (sim.olaylar.length) {
      s += '<div class="mk-g">Zaman çizelgesi ve hız grafikleri</div>' + svg(cizelge(sim, S));
      // anlık durum
      const t = Math.min(zaman, sim.tcyc);
      s += `<div class="mk-card"><div class="mk-g">Çevrimde an: ${tr(t, 2)} s</div><input type="range" min="0" max="${sim.tcyc}" step="${(sim.tcyc / 200).toFixed(4)}" value="${t}" data-mks="z" style="width:100%">`;
      for (const o of sim.olaylar) { const on = t >= o.bas && t <= o.bit; if (on) s += `<div class="mk-r"><span>${o.no}. ${esc(o.h.ad)}</span><b>%${tr(((t - o.bas) / o.p.T) * 100, 0)}</b></div>`; }
      s += '</div>';
      s += '<div class="mk-btns"><button data-act="mk-scsv">⬇ Zaman serisi (CSV)</button><button data-act="mk-spdf">⬇ Benzetim raporu (PDF)</button></div>';
    }
    s += '<div class="mk-card mk-n">Ön tasarım benzetimi: hızlanma ve yavaşlamada tork güvenli tarafta (J·α + |T_yük|) hesaplanır; sürtünmenin yöne göre değişimi, esneklik, titreşim ve ısınma modellenmez. Motor ve sürücü üreticinin boyutlandırma yazılımıyla kesinleştirilmelidir.</div>';
    return s;
  }
  function html() {
    const S = Q();
    let s = '<div class="mk-tabs">' + [['cevrim', '⏱ Çevrim'], ['hareket', '↔ Hareketler (' + S.hareketler.length + ')'], ['tahrik', '⚙ Tahrikler (' + S.tahrikler.length + ')']].map(([k, t]) => `<button data-act="mk-salt-${k}" class="${k === alt ? 'on' : ''}">${t}</button>`).join('') + '</div>';
    if (!S.tahrikler.length && !S.hareketler.length) s += '<div class="mk-btns"><button data-act="mk-sornek">📋 Örnek yükle</button></div><div class="mk-card mk-n">Önce tahrikleri (motorlu eksen, silindir, sabit süreli işlem), sonra çevrimin hareketlerini sırayla ekle. Örnek temsilî bir dolum istasyonudur.</div>';
    s += alt === 'tahrik' ? tahrikHtml(S) : alt === 'hareket' ? hareketHtml(S) : cevrimHtml(S);
    return s;
  }
  const sayi = (v) => { const x = Number(String(v).replace(',', '.')); return v === '' || !Number.isFinite(x) ? NaN : x; };
  function input(el) {
    const p = el.dataset.mks.split('.'), S = Q();
    if (p[0] === 'z') { zaman = sayi(el.value) || 0; api.render(); return; }
    if (p[0] === 'k') { if (p[1] === 'a') kilA = el.value; else kilB = el.value; return; }
    if (p[0] === 'a') { const v = sayi(el.value); if (Number.isFinite(v) && v > 0) S.ayar[p[1]] = p[1] === 'verim' ? Math.min(v, 100) : Math.min(v, 24); }
    else if (p[0] === 't') {
      const t = S.tahrikler.find((x) => x.id === Number(p[1])); if (!t) return;
      if (p[2] === 'ad') t.ad = String(el.value).slice(0, 60) || 'Tahrik';
      else if (p[2] === 'birim') t.birim = el.value === '°' ? '°' : 'mm';
      else if (p[2] in t) t[p[2]] = sayi(el.value);
    } else if (p[0] === 'h') {
      const x = S.hareketler.find((q) => q.id === Number(p[1])); if (!x) return;
      if (p[2] === 'ad') x.ad = String(el.value).slice(0, 60) || 'Hareket';
      else if (p[2] === 'tahrik') x.tahrik = el.value === '' ? null : Number(el.value);
      else if (p[2] === 'basla') x.basla = BASLA[el.value] ? el.value : 'sonra';
      else if (p[2] in x) x[p[2]] = sayi(el.value);
    }
    h.changed();
  }
  function pdf(S) {
    const doc = pdfDoc(), T = h.pdfText, sim = simule(S);
    let pg, y, no = 0;
    const newPage = (w = 210, hh = 297) => { pg = doc.page(w, hh); no++; y = hh - 16; pg.text(14, 8, 8, T('Çizim Atölyesi - Mekatronik Mühendisliği - Benzetim - sayfa ' + no)); return hh; };
    if (sim.olaylar.length) {
      const c = cizelge(sim, S), H = newPage(297, 210), sc = Math.min(1.6, 269 / c.w, (H - 30) / c.h), ox = 14, oy = H - 22;
      pg.text(14, H - 14, 12, T('ZAMAN ÇİZELGESİ VE HIZ GRAFİKLERİ' + (api.name() ? ' · ' + api.name() : '')));
      pg.lineWidth(0.25);
      for (const q of c.prims) {
        if (q.t === 'l') pg.line(ox + q.x1 * sc, oy - q.y1 * sc, ox + q.x2 * sc, oy - q.y2 * sc);
        else if (q.t === 'r') pg.rect(ox + q.x * sc, oy - (q.y + q.h) * sc, q.w * sc, q.h * sc);
        else pg.text(ox + q.x * sc, oy - q.y * sc, q.size * sc * 2.83, T(q.str), 0, q.center);
      }
    }
    newPage();
    const wrap = (s, size) => { const out = []; let cur = ''; for (const w of s.split(' ')) { const t = cur ? cur + ' ' + w : w; if (t.length * size * 0.19 > 182 && cur) { out.push(cur); cur = '     ' + w; } else cur = t; } out.push(cur); return out; };
    simRapor(S, api.name()).forEach((raw, i) => {
      const s = T(raw), size = i === 0 ? 12 : /^[A-ZÇĞİÖŞÜ ()]+$/.test(s.trim()) && s.trim() ? 10 : 8.5;
      for (const ln of wrap(s, size)) { if (y < 16) newPage(); pg.text(14, y, size, ln); y -= size * 0.5; }
      if (!s.trim()) y -= 1;
    });
    return new Blob([doc.build()], { type: 'application/pdf' });
  }
  function act(a) {
    let m;
    const S = Q(), ad = () => api.name() || 'proje';
    if ((m = /^mk-salt-(\w+)$/.exec(a))) { alt = m[1]; api.render(); return true; }
    if (a === 'mk-sornek') { if (S.tahrikler.length || S.hareketler.length) return true; h.getP().sim = simOrnek(); alt = 'cevrim'; h.changed(); api.toast('Örnek yüklendi (temsilî değerler)'); return true; }
    if ((m = /^mk-skart-(vida|kayis|kremayer|tabla)$/.exec(a))) {
      try { tahrikEkle(S, karttanTahrik(m[1], h.kart(m[1]))); alt = 'tahrik'; h.changed(); api.toast('Kart değerleri alındı'); }
      catch (e) { api.toast('Önce ' + KARTLAR.find((k) => k[0] === m[1])[1] + ' kartını hatasız doldur'); }
      return true;
    }
    if ((m = /^mk-sadd-(eksen|pnomatik|sure)$/.exec(a))) { tahrikEkle(S, { tur: m[1], ad: { eksen: 'Eksen', pnomatik: 'Silindir', sure: 'İşlem' }[m[1]] }); alt = 'tahrik'; h.changed(); return true; }
    if (a === 'mk-sadd-h') { hareketEkle(S, { tahrik: S.tahrikler[0]?.id ?? null }); alt = 'hareket'; h.changed(); return true; }
    if ((m = /^mk-sdel-t-(\d+)$/.exec(a))) { const id = Number(m[1]); S.tahrikler = S.tahrikler.filter((x) => x.id !== id); for (const x of S.hareketler) if (x.tahrik === id) x.tahrik = null; h.changed(); api.toast('Tahrik silindi'); return true; }
    if ((m = /^mk-sdel-h-(\d+)$/.exec(a))) { const id = Number(m[1]); S.hareketler = S.hareketler.filter((x) => x.id !== id); S.kilitler = S.kilitler.filter((k) => !k.includes(id)); h.changed(); api.toast('Hareket silindi'); return true; }
    if ((m = /^mk-s(up|down)-(\d+)$/.exec(a))) { const i = S.hareketler.findIndex((x) => x.id === Number(m[2])), j = m[1] === 'up' ? i - 1 : i + 1; if (i >= 0 && j >= 0 && j < S.hareketler.length) { [S.hareketler[i], S.hareketler[j]] = [S.hareketler[j], S.hareketler[i]]; h.changed(); } return true; }
    if (a === 'mk-skadd') { const x = Number(kilA), y = Number(kilB); if (!x || !y || x === y) { api.toast('İki farklı hareket seç'); return true; } if (!S.kilitler.some(([p, q]) => (p === x && q === y) || (p === y && q === x))) S.kilitler.push([x, y]); kilA = kilB = ''; h.changed(); return true; }
    if ((m = /^mk-skdel-(\d+)$/.exec(a))) { S.kilitler.splice(Number(m[1]), 1); h.changed(); return true; }
    if (a === 'mk-scsv') { api.saveBlob(new Blob([seriCSV(simule(S), S)], { type: 'text/csv;charset=utf-8' }), ad() + '_benzetim.csv'); api.toast('İndirildi'); return true; }
    if (a === 'mk-spdf') { api.saveBlob(pdf(S), ad() + '_benzetim.pdf'); api.toast('İndirildi'); return true; }
    return false;
  }
  return { html, input, act };
}
