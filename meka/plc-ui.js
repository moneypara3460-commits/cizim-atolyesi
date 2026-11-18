// Mekatronik Mühendisliği — 5. aşama PLC görünümü. Hesap / üretim meka/plc.js'te; bu dosya yalnız gösterir.
// h: { api, getP() → proje (P.plc, P.items), changed(), esc, pdfText }
import { plcSanitize, plcCheck, sinyalEkle, adimEkle, agactanSinyaller, adresAta, tagHata, stKod, plcopenXml, gcListesi, gcCSV, adimSemasi, plcRapor, plcOrnek, SINYAL_TUR, KART_SEC } from './plc.js?v=20261118g';
import { pdfDoc } from '../tx/pdf.js?v=20261112u';

export function createPlcUI(h) {
  const { api, esc } = h;
  let alt = 'gc', kilA = '', kilB = '';
  const Q = () => { const P = h.getP(); if (!P.plc || !P.plc.ayar) P.plc = plcSanitize(P.plc); return P.plc; };
  const sel = (attr, cur, opts) => `<select data-mkp="${attr}">${opts.map(([o, t]) => `<option value="${esc(o)}"${String(o) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const fld = (label, inner) => `<label class="mk-f"><span>${esc(label)}</span>${inner}</label>`;
  const kontrolHtml = (ks) => ks.filter((c) => !c.ok || c.duzey === 'bilgi').map((c) => `<div class="mk-c ${c.ok ? 'i' : c.duzey}">${c.ok ? 'ℹ' : c.duzey === 'hata' ? '✗' : '⚠'} ${esc(c.metin)}</div>`).join('');

  function gcHtml(P, ch) {
    const a = P.ayar, adr = ch.adresler;
    let s = '<div class="mk-card"><div class="mk-g">Kartlar</div><div class="mk-grid">';
    s += fld('Dijital giriş kartı (kanal)', sel('ayar.diKart', a.diKart, KART_SEC.DI.map((v) => [v, v]))) + fld('Dijital çıkış kartı (kanal)', sel('ayar.doKart', a.doKart, KART_SEC.DO.map((v) => [v, v])));
    s += fld('Analog giriş kartı (kanal)', sel('ayar.aiKart', a.aiKart, KART_SEC.AI.map((v) => [v, v]))) + fld('Analog çıkış kartı (kanal)', sel('ayar.aoKart', a.aoKart, KART_SEC.AO.map((v) => [v, v])));
    s += fld('Yedek kanal payı (%)', `<input type="number" inputmode="decimal" step="5" data-mkp="ayar.yedek" value="${a.yedek}">`) + fld('Görev çevrim süresi (ms)', `<input type="number" inputmode="decimal" step="1" data-mkp="ayar.cevrim" value="${a.cevrim}">`);
    s += '</div>';
    for (const [t, m] of Object.entries(ch.moduller)) if (m.n) s += `<div class="mk-r"><span>${esc(SINYAL_TUR[t])}: ${m.n} sinyal</span><b>${m.modul} × ${m.kart} kanal · ${m.yedek} boş</b></div>`;
    s += '</div>';
    s += '<div class="mk-btns"><button data-act="mk-padd-DI">+ Giriş</button><button data-act="mk-padd-DO">+ Çıkış</button><button data-act="mk-padd-AI">+ Analog giriş</button><button data-act="mk-padd-AO">+ Analog çıkış</button><button data-act="mk-pagac">🌳 Ürün ağacından al</button>' + (!P.sinyaller.length && !P.adimlar.length ? '<button data-act="mk-pornek">📋 Örnek yükle</button>' : '') + '</div>';
    if (!P.sinyaller.length) s += '<div class="mk-card mk-n">Henüz sinyal yok. Sensörler, butonlar (giriş) ve valf bobinleri, kontaktörler (çıkış) ekle ya da ürün ağacından al. Örnek, temsilî bir dolum istasyonudur.</div>';
    for (const x of P.sinyaller) {
      const err = tagHata(x.tag);
      s += `<div class="mk-card mk-it" data-sinyal="${x.id}"><div class="mk-grid">`;
      s += fld('Sinyal adı', `<input data-mkp="s.${x.id}.tag" value="${esc(x.tag)}" maxlength="40" autocapitalize="off" spellcheck="false">`);
      s += fld('Tür', sel(`s.${x.id}.tur`, x.tur, Object.entries(SINYAL_TUR)));
      s += fld('Adres (boş = otomatik)', `<input data-mkp="s.${x.id}.adres" value="${esc(x.adres)}" placeholder="${esc(adr.get(x.id) || '')}" autocapitalize="characters" spellcheck="false">`);
      s += fld('Açıklama', `<input data-mkp="s.${x.id}.aciklama" value="${esc(x.aciklama)}" maxlength="120">`);
      s += `</div><div class="mk-r"><span>${esc(x.tur)} · ${esc(adr.get(x.id) || '')}</span><b class="${err ? 'bad' : 'ok'}">${err ? '✗ ' + esc(err) : '✓'}</b></div><div class="mk-btns"><button data-act="mk-pdel-${x.id}" class="mk-dg">🗑 Sil</button></div></div>`;
    }
    return s;
  }
  function adimHtml(P, ch) {
    const DO = P.sinyaller.filter((x) => x.tur === 'DO');
    let s = '<div class="mk-card mk-n">Her adımda işaretli çıkışlar adım etkinken açıktır. Geçiş koşulu sağlanınca sıradaki adıma geçilir; son adımdan başa dönülür. Koşul dili: AND / OR / NOT (VE / VEYA / DEĞİL), parantez, sinyal adları ve adım süresi (ör. <code>B3_Ileri AND T>=2s</code>).</div>';
    s += '<div class="mk-btns"><button data-act="mk-pstep">+ Adım</button></div>';
    P.adimlar.forEach((st, i) => {
      let hata = '';
      const c = ch.cozum.get(st.id);
      if (!c) hata = (ch.kontroller.find((k) => !k.ok && k.metin.startsWith(`Adım ${i * 10} `)) || {}).metin || '';
      s += `<div class="mk-card mk-it" data-adim="${st.id}"><div class="mk-ih"><b>Adım ${i * 10}</b> <i>${i === 0 ? 'başlangıç' : ''}</i></div><div class="mk-grid">`;
      s += fld('Ad', `<input data-mkp="a.${st.id}.ad" value="${esc(st.ad)}" maxlength="60">`);
      s += fld('Geçiş koşulu', `<input data-mkp="a.${st.id}.kosul" value="${esc(st.kosul)}" maxlength="300" autocapitalize="off" spellcheck="false" placeholder="ör. B1 AND T>=2s">`);
      s += fld('Sonraki adım', sel(`a.${st.id}.sonraki`, st.sonraki ?? '', [['', 'Sıradaki (varsayılan)'], ...P.adimlar.map((x, j) => [x.id, 'Adım ' + j * 10 + ' — ' + x.ad])]));
      s += '</div>';
      s += '<div class="mk-g">Açık çıkışlar</div>' + (DO.length ? '<div class="mk-grid">' + DO.map((x) => `<label class="mk-f" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" data-mkp="a.${st.id}.cik.${x.id}"${st.cikislar.includes(x.id) ? ' checked' : ''}> ${esc(x.tag)}</label>`).join('') + '</div>' : '<div class="mk-n">Önce G/Ç listesine çıkış ekle.</div>');
      if (hata) s += `<div class="mk-c hata">✗ ${esc(hata)}</div>`;
      s += `<div class="mk-btns">${i > 0 ? `<button data-act="mk-pup-${st.id}">↑</button>` : ''}${i < P.adimlar.length - 1 ? `<button data-act="mk-pdown-${st.id}">↓</button>` : ''}<button data-act="mk-psdel-${st.id}" class="mk-dg">🗑 Sil</button></div></div>`;
    });
    // kilitler
    s += '<div class="mk-g">Kilitler (birlikte açılamaz)</div><div class="mk-card">';
    const ad = (id) => (P.sinyaller.find((x) => x.id === id) || {}).tag || '?';
    P.kilitler.forEach(([x, y], i) => { s += `<div class="mk-r"><span>${esc(ad(x))} ⟂ ${esc(ad(y))}</span><button data-act="mk-pkdel-${i}" class="mk-dg">Sil</button></div>`; });
    if (DO.length >= 2) {
      const op = [['', '—'], ...DO.map((x) => [x.id, x.tag])];
      s += `<div class="mk-grid">${fld('Çıkış', sel('k.a', kilA, op))}${fld('Çıkış', sel('k.b', kilB, op))}</div><div class="mk-btns"><button data-act="mk-pkadd">+ Kilit ekle</button></div>`;
    } else s += '<div class="mk-n">Kilit için en az iki çıkış gerekir (ör. silindir ileri / geri bobinleri).</div>';
    s += '</div>';
    return s;
  }
  function svg(th) {
    const p = th.prims.map((q) => q.t === 'l' ? `<line x1="${q.x1}" y1="${q.y1}" x2="${q.x2}" y2="${q.y2}"/>` : q.t === 'r' ? `<rect x="${q.x}" y="${q.y}" width="${q.w}" height="${q.h}" fill="none"/>` : `<text x="${q.x}" y="${q.y}" font-size="${q.size}" text-anchor="${q.center ? 'middle' : 'start'}" stroke="none" fill="currentColor">${esc(q.str)}</text>`).join('');
    return `<div class="mk-tbl"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${th.w} ${th.h}" style="width:${Math.max(th.w * 3.2, 320)}px;max-width:none;color:#e2e8f0" stroke="#7dd3fc" stroke-width="0.35">${p}</svg></div>`;
  }
  function kodHtml(P, ch) {
    let s = `<div class="mk-card"><div class="mk-v ${ch.uygun ? 'ok' : 'bad'}">${ch.uygun ? '✓ UYGUN — kod üretilebilir' : '✗ HATALAR VAR — önce düzelt'}</div>${kontrolHtml(ch.kontroller)}</div>`;
    if (P.adimlar.length) s += '<div class="mk-g">Adım şeması</div>' + svg(adimSemasi(P));
    s += '<div class="mk-btns" style="margin-top:8px"><button data-act="mk-pcsv">⬇ G/Ç listesi (CSV)</button>' + (ch.uygun ? '<button data-act="mk-pst">⬇ ST kodu (.st)</button><button data-act="mk-pxml">⬇ PLCopen XML</button>' : '') + '<button data-act="mk-ppdf">⬇ PLC raporu (PDF)</button></div>';
    if (ch.uygun) { try { s += '<div class="mk-g">ST kodu önizleme</div><pre class="mk-pre">' + esc(stKod(P, api.name())) + '</pre>'; } catch (e) { s += `<div class="mk-c hata">${esc(e.message)}</div>`; } }
    return s;
  }
  function html() {
    const P = Q(), ch = plcCheck(P);
    const nH = ch.kontroller.filter((c) => !c.ok && c.duzey === 'hata').length;
    let s = '<style>.mk-pre{white-space:pre;overflow:auto;max-height:340px;font-size:11.5px;background:#0b1220;border:1px solid #1f2d47;border-radius:8px;padding:8px}</style>';
    s += '<div class="mk-tabs">' + [['gc', '🔌 G/Ç listesi (' + P.sinyaller.length + ')'], ['adim', '🪜 Adımlar (' + P.adimlar.length + ')'], ['kod', (nH ? '✗ ' : '✓ ') + 'Denetim ve kod']].map(([k, t]) => `<button data-act="mk-palt-${k}" class="${k === alt ? 'on' : ''}">${t}</button>`).join('') + '</div>';
    s += alt === 'gc' ? gcHtml(P, ch) : alt === 'adim' ? adimHtml(P, ch) : kodHtml(P, ch);
    s += '<div class="mk-card mk-n">IEC 61131-3 kod iskeleti ve PLCopen XML (TC6 v2.01). Acil durdurma ve koruyucu kilitleme standart PLC programına bırakılmaz; güvenlik rölesi / güvenlik PLC\'si ile yapılır. Adresler PLC üreticisine göre değişebilir; program devreye almadan önce yetkili otomasyon mühendisince denetlenip sınanmalıdır.</div>';
    return s;
  }
  function input(el) {
    const p = el.dataset.mkp.split('.'), P = Q();
    if (p[0] === 'k') { if (p[1] === 'a') kilA = el.value; else kilB = el.value; return; }
    if (p[0] === 'ayar') { const v = Number(el.value); if (p[1] in P.ayar && Number.isFinite(v)) P.ayar[p[1]] = v; }
    else if (p[0] === 's') {
      const x = P.sinyaller.find((q) => q.id === Number(p[1])); if (!x) return;
      if (p[2] === 'tag') x.tag = String(el.value).trim().slice(0, 40);
      else if (p[2] === 'tur') { if (SINYAL_TUR[el.value]) { x.tur = el.value; x.adres = ''; if (x.tur !== 'DO') for (const a of P.adimlar) a.cikislar = a.cikislar.filter((i) => i !== x.id); } }
      else if (p[2] === 'adres') x.adres = String(el.value).toUpperCase().replace(/\s/g, '').slice(0, 20);
      else if (p[2] === 'aciklama') x.aciklama = String(el.value).slice(0, 120);
    } else if (p[0] === 'a') {
      const a = P.adimlar.find((q) => q.id === Number(p[1])); if (!a) return;
      if (p[2] === 'ad') a.ad = String(el.value).slice(0, 60);
      else if (p[2] === 'kosul') a.kosul = String(el.value).slice(0, 300);
      else if (p[2] === 'sonraki') a.sonraki = el.value === '' ? null : Number(el.value);
      else if (p[2] === 'cik') { const id = Number(p[3]); a.cikislar = a.cikislar.filter((i) => i !== id); if (el.checked) a.cikislar.push(id); }
    }
    h.changed();
  }
  function pdf(P) {
    const doc = pdfDoc(), T = h.pdfText;
    let pg, y, no = 0;
    const newPage = () => { pg = doc.page(210, 297); no++; y = 281; pg.text(14, 8, 8, T('Çizim Atölyesi - Mekatronik Mühendisliği - PLC - sayfa ' + no)); };
    const wrap = (s, size) => { const out = []; let cur = ''; for (const w of s.split(' ')) { const t = cur ? cur + ' ' + w : w; if (t.length * size * 0.19 > 182 && cur) { out.push(cur); cur = '  ' + w; } else cur = t; } out.push(cur); return out; };
    newPage();
    plcRapor(P, api.name()).forEach((raw, i) => {
      const s = T(raw), size = i === 0 ? 12 : /^[A-ZÇĞİÖŞÜ ()/]+$/.test(s.trim()) && s.trim() ? 10 : 8.5;
      for (const ln of wrap(s, size)) { if (y < 16) newPage(); pg.text(14, y, size, ln); y -= size * 0.5; }
      if (!s.trim()) y -= 1;
    });
    if (P.adimlar.length) {   // adım şeması ayrı sayfa(lar)
      const sm = adimSemasi(P), sc = 1.5, per = Math.floor((297 - 40) / (26 * sc));
      for (let k = 0; k * per < P.adimlar.length; k++) {
        newPage(); pg.text(14, 283, 11, T('ADIM ŞEMASI' + (k ? ' (devam)' : ''))); pg.lineWidth(0.3);
        const y0 = k * per * 26, y1 = y0 + per * 26 + 2;
        for (const q of sm.prims) {
          if (q.donus && per < P.adimlar.length) continue;   // çok sayfada dönüş çizgisi çizilmez (metinle belirtilir)
          const yy = q.t === 'l' ? Math.min(q.y1, q.y2) : q.y;
          if (yy < y0 - 1 || yy >= y1) continue;
          const X = (v) => 20 + v * sc, Y = (v) => 270 - (v - y0) * sc;
          if (q.t === 'l') pg.line(X(q.x1), Y(q.y1), X(q.x2), Y(q.y2));
          else if (q.t === 'r') pg.rect(X(q.x), Y(q.y + q.h), q.w * sc, q.h * sc);
          else pg.text(X(q.x), Y(q.y), q.size * sc * 2.83, T(q.str), 0, q.center);
        }
      }
    }
    return new Blob([doc.build()], { type: 'application/pdf' });
  }
  function act(a) {
    let m;
    const P = Q(), ad = () => api.name() || 'proje';
    if ((m = /^mk-palt-(\w+)$/.exec(a))) { alt = m[1]; api.render(); return true; }
    if ((m = /^mk-padd-(DI|DO|AI|AO)$/.exec(a))) { sinyalEkle(P, m[1]); h.changed(); return true; }
    if ((m = /^mk-pdel-(\d+)$/.exec(a))) { const id = Number(m[1]); P.sinyaller = P.sinyaller.filter((x) => x.id !== id); for (const st of P.adimlar) st.cikislar = st.cikislar.filter((i) => i !== id); P.kilitler = P.kilitler.filter((k) => !k.includes(id)); h.changed(); api.toast('Sinyal silindi'); return true; }
    if (a === 'mk-pagac') { const n = agactanSinyaller(P, h.getP().items || []).length; api.toast(n ? n + ' sinyal ürün ağacından eklendi' : 'Ürün ağacında eklenecek yeni sensör, valf, sürücü ya da frenli motor yok'); h.changed(); return true; }
    if (a === 'mk-pornek') { if (P.sinyaller.length || P.adimlar.length) return true; h.getP().plc = plcOrnek(); h.changed(); api.toast('Örnek yüklendi (temsilî dolum istasyonu)'); return true; }
    if (a === 'mk-pstep') { adimEkle(P, { kosul: '' }); alt = 'adim'; h.changed(); return true; }
    if ((m = /^mk-psdel-(\d+)$/.exec(a))) { const id = Number(m[1]); P.adimlar = P.adimlar.filter((x) => x.id !== id); for (const st of P.adimlar) if (st.sonraki === id) st.sonraki = null; h.changed(); api.toast('Adım silindi'); return true; }
    if ((m = /^mk-p(up|down)-(\d+)$/.exec(a))) { const i = P.adimlar.findIndex((x) => x.id === Number(m[2])), j = m[1] === 'up' ? i - 1 : i + 1; if (i >= 0 && j >= 0 && j < P.adimlar.length) { [P.adimlar[i], P.adimlar[j]] = [P.adimlar[j], P.adimlar[i]]; h.changed(); } return true; }
    if (a === 'mk-pkadd') { const x = Number(kilA), y = Number(kilB); if (!x || !y || x === y) { api.toast('İki farklı çıkış seç'); return true; } if (!P.kilitler.some(([p, q]) => (p === x && q === y) || (p === y && q === x))) P.kilitler.push([x, y]); kilA = kilB = ''; h.changed(); return true; }
    if ((m = /^mk-pkdel-(\d+)$/.exec(a))) { P.kilitler.splice(Number(m[1]), 1); h.changed(); return true; }
    if (a === 'mk-pcsv') { api.saveBlob(new Blob([gcCSV(gcListesi(P))], { type: 'text/csv;charset=utf-8' }), ad() + '_gc_listesi.csv'); api.toast('İndirildi'); return true; }
    if (a === 'mk-pst' || a === 'mk-pxml') {
      try {
        if (a === 'mk-pst') api.saveBlob(new Blob([stKod(P, api.name())], { type: 'text/plain;charset=utf-8' }), ad() + '_plc.st');
        else api.saveBlob(new Blob([plcopenXml(P, api.name())], { type: 'application/xml' }), ad() + '_plcopen.xml');
        api.toast('İndirildi');
      } catch (e) { api.toast(e.message); }
      return true;
    }
    if (a === 'mk-ppdf') { api.saveBlob(pdf(P), ad() + '_plc.pdf'); api.toast('İndirildi'); return true; }
    return false;
  }
  return { html, input, act, adresAta };
}
