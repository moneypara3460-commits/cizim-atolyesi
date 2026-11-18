// Mekatronik Mühendisliği — 6. aşama güvenlik görünümü. Değerlendirme meka/guv.js'te; bu dosya yalnız gösterir.
// h: { api, getP() → proje (P.guv), changed(), esc, pdfText }
import { guvSanitize, guvOzet, tehlikeEkle, fonkEkle, altEkle, plr, fOner, mttfd, riskCSV, guvRapor, guvOrnek, TEHLIKE_TUR, YASAM_FAZ, S_AD, F_AD, P_AD, ROL, DURDURMA, KONTROL, KONTROL_DURUM, PL_SIRA, PL_ARALIK } from './guv.js?v=20261119a';
import { pdfDoc } from '../tx/pdf.js?v=20261112u';

export function createGuvUI(h) {
  const { api, esc } = h;
  let alt = 'risk';
  const yard = { aralik: NaN, pay: NaN, B10d: NaN, B10: NaN, dop: 220, hop: 8, tcycle: NaN };   // yardımcı hesaplar (projeye kaydedilmez)
  const Q = () => { const P = h.getP(); if (!P.guv || !Array.isArray(P.guv.tehlikeler)) P.guv = guvSanitize(P.guv); return P.guv; };
  const sel = (attr, cur, opts) => `<select data-mky="${attr}">${opts.map(([o, t]) => `<option value="${esc(o)}"${String(o) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const txt = (attr, v, n = 300, ph = '') => `<input data-mky="${attr}" value="${esc(v)}" maxlength="${n}" placeholder="${esc(ph)}">`;
  const num = (attr, v, step = 'any', ph = '') => `<input type="number" inputmode="decimal" step="${step}" data-mky="${attr}" value="${Number.isFinite(v) ? v : ''}" placeholder="${esc(ph)}">`;
  const fld = (label, inner) => `<label class="mk-f"><span>${esc(label)}</span>${inner}</label>`;
  const kont = (ks) => ks.filter((c) => !c.ok || c.duzey === 'bilgi').map((c) => `<div class="mk-c ${c.ok ? 'i' : c.duzey}">${c.ok ? 'ℹ' : c.duzey === 'hata' ? '✗' : '⚠'} ${esc(c.metin)}</div>`).join('');
  const UST = '⁰¹²³⁴⁵⁶⁷⁸⁹';
  const exp = (v) => { if (!Number.isFinite(v)) return '—'; const [m, e] = v.toExponential(2).split('e'); const n = Number(e); return m.replace('.', ',') + '×10' + (n < 0 ? '⁻' : '') + String(Math.abs(n)).split('').map((d) => UST[d]).join(''); };

  function riskHtml(G, O) {
    let s = '<div class="mk-card mk-n">ISO 12100: makinenin tüm yaşam döngüsünde (taşıma, çalışma, ayar, temizlik, bakım…) tehlikeleri listele, riski tahmin et (S, F, P) ve önce tasarımla, sonra koruyucu önlemle azalt; kullanım bilgisi bunların yerine geçmez. PLr, risk bir güvenlik işleviyle (ör. kapak kilitlemesi) azaltılacaksa o işlevin gereken seviyesidir.</div>';
    s += '<div class="mk-btns"><button data-act="mk-yadd-t">+ Tehlike</button>' + (!G.tehlikeler.length && !G.fonksiyonlar.length ? '<button data-act="mk-yornek">📋 Örnek yükle</button>' : '') + '</div>';
    // F yardımcı
    const fo = fOner(yard.aralik, yard.pay);
    s += `<div class="mk-card"><div class="mk-g">F seçimi için yardımcı</div><div class="mk-grid">${fld('Maruz kalma aralığı (dakikada bir)', num('y.aralik', yard.aralik, 1))}${fld('Toplam maruz kalma payı (çalışma süresinin %)', num('y.pay', yard.pay, 0.5))}</div><div class="mk-n">${fo ? 'Öneri: <b>' + fo + '</b> (15 dakikada birden sık ya da %5\'ten (1/20) fazla ise F2)' : 'Değer girersen F önerisi çıkar; veri yoksa en kötü durum olarak F2 seç.'}</div></div>`;
    O.T.forEach(({ t, d }, i) => {
      s += `<div class="mk-card mk-it" data-tehlike="${t.id}"><div class="mk-ih"><b>Tehlike ${i + 1}</b> <i>${d.r ? 'PLr ' + d.r.plr + (d.r.indirim ? ' (indirimli, grafik ' + d.r.temel + ')' : '') : 'risk tahmini eksik'}</i></div><div class="mk-grid">`;
      s += fld('Tür', sel(`t.${t.id}.tur`, t.tur, Object.entries(TEHLIKE_TUR))) + fld('Yaşam döngüsü evresi', sel(`t.${t.id}.faz`, t.faz, Object.entries(YASAM_FAZ)));
      s += fld('Bölge / parça', txt(`t.${t.id}.bolge`, t.bolge, 80)) + fld('Tehlike ve olası zarar', txt(`t.${t.id}.aciklama`, t.aciklama));
      s += fld('Yaralanma ağırlığı (S)', sel(`t.${t.id}.S`, t.S, [['', '—'], ...Object.entries(S_AD)])) + fld('Maruz kalma (F)', sel(`t.${t.id}.F`, t.F, [['', '—'], ...Object.entries(F_AD)])) + fld('Kaçınma olasılığı (P)', sel(`t.${t.id}.P`, t.P, [['', '—'], ...Object.entries(P_AD)]));
      s += `<label class="mk-f" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" style="flex:none;width:20px;height:20px" data-mky="t.${t.id}.dusuk"${t.dusuk ? ' checked' : ''}> Tehlikeli olayın olasılığı düşük (PLr bir seviye düşer, gerekçe zorunlu)</label>`;
      if (t.dusuk) s += fld('Düşük olasılık gerekçesi', txt(`t.${t.id}.gerekce`, t.gerekce, 300, 'ör. teknoloji kanıtlanmış, kaza kaydı yok…'));
      s += '</div><div class="mk-g">Risk azaltma (üç adım)</div><div class="mk-grid">';
      s += fld('1. Doğası gereği güvenli tasarım', txt(`t.${t.id}.tasarim`, t.tasarim)) + fld('2. Koruyucu önlem (muhafaza, kilitleme…)', txt(`t.${t.id}.koruyucu`, t.koruyucu)) + fld('3. Kullanım bilgisi (uyarı, eğitim)', txt(`t.${t.id}.bilgi`, t.bilgi));
      s += '</div>';
      if (G.fonksiyonlar.length) s += '<div class="mk-g">Bu riski azaltan güvenlik işlevleri</div><div class="mk-grid">' + G.fonksiyonlar.map((f) => `<label class="mk-f" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" style="flex:none;width:20px;height:20px" data-mky="t.${t.id}.fonk.${f.id}"${t.fonk.includes(f.id) ? ' checked' : ''}> ${esc(f.ad)}</label>`).join('') + '</div>';
      s += kont(d.kontroller) + `<div class="mk-btns"><button data-act="mk-ydel-t-${t.id}" class="mk-dg">🗑 Sil</button></div></div>`;
    });
    return s;
  }
  function islevHtml(G, O) {
    let s = '<div class="mk-card mk-n">ISO 13849-1: her güvenlik işlevi giriş (algılama), mantık ve çıkış alt sistemlerinden oluşur. Alt sistemlerin PL ve PFHD değerlerini üreticinin güvenlik verisinden (sertifika / katalog) gir; seri alt sistemlerin PFHD değerleri toplanır ve işlevin PL\'si en düşük alt sistem PL\'sini aşamaz. Bileşenlerden (MTTFD, DCavg, kategori) PL hesabı için IFA SISTEMA kullanılmalıdır.</div>';
    s += '<div class="mk-btns"><button data-act="mk-yadd-f">+ Güvenlik işlevi</button></div>';
    O.F.forEach(({ f, d }) => {
      s += `<div class="mk-card mk-it" data-islev="${f.id}"><div class="mk-v ${d.dogrulandi ? 'ok' : 'bad'}">${d.dogrulandi ? '✓ DOĞRULANDI' : '✗ DOĞRULANMADI'} · PLr ${d.PLr || '—'} · PL ${d.PL || '—'}</div><div class="mk-grid">`;
      s += fld('Ad', txt(`f.${f.id}.ad`, f.ad, 80)) + fld('Tetikleyen olay', txt(`f.${f.id}.tetik`, f.tetik, 200)) + fld('Güvenli durum', txt(`f.${f.id}.guvenliDurum`, f.guvenliDurum, 200)) + fld('Durdurma kategorisi', sel(`f.${f.id}.durdurma`, f.durdurma, Object.entries(DURDURMA)));
      s += '</div>';
      for (const a of f.altsistemler) {
        s += `<div class="mk-card" data-alt="${a.id}"><div class="mk-grid">`;
        s += fld('Rol', sel(`a.${f.id}.${a.id}.rol`, a.rol, Object.entries(ROL))) + fld('Cihaz', txt(`a.${f.id}.${a.id}.ad`, a.ad, 80, 'ör. kapak emniyet anahtarı'));
        s += fld('PL (üretici)', sel(`a.${f.id}.${a.id}.PL`, a.PL, [['', '—'], ...PL_SIRA.map((p) => [p, 'PL ' + p])])) + fld('PFHD (1/saat, üretici; ör. 2,5e-8)', `<input data-mky="a.${f.id}.${a.id}.PFH" value="${Number.isFinite(a.PFH) ? esc(String(a.PFH).replace('.', ',')) : ''}" inputmode="text" autocapitalize="off" spellcheck="false" placeholder="ör. 2,5e-8">`);
        s += fld('Kategori (bilgi)', sel(`a.${f.id}.${a.id}.kategori`, a.kategori, [['', '—'], ...['B', '1', '2', '3', '4'].map((k) => [k, 'Kategori ' + k])])) + fld('Veri kaynağı', txt(`a.${f.id}.${a.id}.kaynak`, a.kaynak, 120, 'ör. üretici sertifikası no'));
        s += `</div><div class="mk-btns"><button data-act="mk-ydel-a-${f.id}-${a.id}" class="mk-dg">Alt sistemi sil</button></div></div>`;
      }
      if (d.PFH != null) s += `<div class="mk-r"><span>Toplam PFHD</span><b>${esc(exp(d.PFH))} 1/saat → PL ${esc(d.plToplam)}</b></div>`;
      s += kont(d.kontroller) + `<div class="mk-btns"><button data-act="mk-yadd-a-${f.id}">+ Alt sistem</button><button data-act="mk-ydel-f-${f.id}" class="mk-dg">🗑 İşlevi sil</button></div></div>`;
    });
    s += `<div class="mk-card"><div class="mk-g">PL – PFHD aralıkları (ISO 13849-1 Tablo 2)</div>${PL_SIRA.map((p) => `<div class="mk-r"><span>PL ${p}</span><b>${esc(PL_ARALIK[p])}</b></div>`).join('')}</div>`;
    // MTTFD yardımcı
    let m = null, me = '';
    try { if (Number.isFinite(yard.B10d) || Number.isFinite(yard.B10)) m = mttfd(yard); } catch (e) { me = e.message; }
    s += `<div class="mk-card"><div class="mk-g">MTTFD yardımcı hesabı (ISO 13849-1 Ek C)</div><div class="mk-grid">${fld('B10D (çevrim, üretici)', num('y.B10d', yard.B10d, 1000))}${fld('ya da B10 (B10D = 2·B10 varsayılır)', num('y.B10', yard.B10, 1000))}${fld('Yılda çalışma günü', num('y.dop', yard.dop, 1))}${fld('Günde çalışma saati', num('y.hop', yard.hop, 1))}${fld('İki çalışma arası süre (s)', num('y.tcycle', yard.tcycle, 1))}</div>`;
    if (m) s += `<div class="mk-r"><span>Yıllık çalışma sayısı nop</span><b>${esc(Math.round(m.nop).toLocaleString('tr-TR'))}</b></div><div class="mk-r"><span>MTTFD</span><b>${esc(m.MTTFd.toLocaleString('tr-TR', { maximumFractionDigits: 1 }))} yıl · ${esc(m.seviye)}</b></div><div class="mk-r"><span>T10D (değiştirme süresi)</span><b>${esc(m.T10d.toLocaleString('tr-TR', { maximumFractionDigits: 1 }))} yıl</b></div>${m.varsayim ? '<div class="mk-c uyari">⚠ B10D bilinmediği için 2·B10 varsayıldı</div>' : ''}<div class="mk-n">Seviyeler: düşük 3–10, orta 10–30, yüksek 30–100 yıl. Bu değer tek bileşenindir; PL için SISTEMA ile kanal / kategori / DCavg / CCF değerlendirmesi gerekir. Bileşen T10D süresinden önce değiştirilmelidir.</div>`;
    else if (me) s += `<div class="mk-c hata">⚠ ${esc(me)}</div>`;
    s += '</div>';
    return s;
  }
  function listeHtml(G, O) {
    let s = `<div class="mk-card mk-n">IEC 60204-1 (makine elektrik donanımı) maddelerine göre kontrol. Uygun ${O.sayi.uygun} · uygun değil ${O.sayi.degil} · uygulanamaz ${O.sayi.yok} · kontrol edilmedi ${O.sayi.bos}</div>`;
    for (const x of O.ks) {
      s += `<div class="mk-card" data-madde="${esc(x.m)}"><div class="mk-ih"><b>${esc(x.m)}</b> ${esc(x.metin)}</div><div class="mk-grid">${fld('Durum', sel(`k.${x.m}.durum`, x.durum, Object.entries(KONTROL_DURUM)))}${fld('Not', txt(`k.${x.m}.not`, x.not, 200))}</div>${x.durum === 'degil' ? '<div class="mk-c hata">✗ Uygun değil: düzeltilmeden makine devreye alınmamalı</div>' : ''}</div>`;
    }
    return s;
  }
  function raporHtml(G, O) {
    let s = `<div class="mk-card"><div class="mk-v ${O.tam ? 'ok' : 'bad'}">${O.tam ? '✓ TAMAM' : O.uygun ? '⚠ EKSİKLER VAR' : '✗ UYGUN DEĞİL'}</div>`;
    s += `<div class="mk-r"><span>Tehlike kaydı</span><b>${O.T.length} · hatalı ${O.T.filter((x) => !x.d.uygun).length}</b></div><div class="mk-r"><span>Güvenlik işlevi</span><b>${O.F.length} · doğrulanan ${O.F.filter((x) => x.d.dogrulandi).length}</b></div><div class="mk-r"><span>IEC 60204-1 listesi</span><b>${O.sayi.uygun + O.sayi.yok} / ${O.ks.length} tamam${O.sayi.degil ? ' · ' + O.sayi.degil + ' uygun değil' : ''}</b></div>`;
    s += kont(O.kontroller) + '</div>';
    s += '<div class="mk-btns"><button data-act="mk-ycsv">⬇ Risk kaydı (CSV)</button><button data-act="mk-ypdf">⬇ Güvenlik raporu (PDF)</button></div>';
    s += '<div class="mk-card mk-n">Bu rapor yetkin kişilerce yapılan risk değerlendirmesinin, doğrulamanın ve geçerli kılmanın yerine geçmez; CE uygunluğu için yetkili güvenlik mühendisinin onayı gerekir.</div>';
    return s;
  }
  function html() {
    const G = Q(), O = guvOzet(G);
    let s = '<div class="mk-tabs">' + [['risk', '⚠ Riskler (' + G.tehlikeler.length + ')'], ['islev', '🛡 Güvenlik işlevleri (' + G.fonksiyonlar.length + ')'], ['liste', '☑ IEC 60204-1'], ['rapor', (O.tam ? '✓ ' : '✗ ') + 'Özet ve rapor']].map(([k, t]) => `<button data-act="mk-yalt-${k}" class="${k === alt ? 'on' : ''}">${t}</button>`).join('') + '</div>';
    s += alt === 'risk' ? riskHtml(G, O) : alt === 'islev' ? islevHtml(G, O) : alt === 'liste' ? listeHtml(G, O) : raporHtml(G, O);
    return s;
  }
  const sayi = (v) => { const x = Number(String(v).replace(',', '.')); return v === '' || !Number.isFinite(x) ? NaN : x; };
  function input(el) {
    const p = el.dataset.mky.split('.'), G = Q();
    if (p[0] === 'y') { yard[p[1]] = sayi(el.value); api.render(); return; }
    if (p[0] === 't') {
      const t = G.tehlikeler.find((x) => x.id === Number(p[1])); if (!t) return;
      if (p[2] === 'fonk') { const id = Number(p[3]); t.fonk = t.fonk.filter((x) => x !== id); if (el.checked) t.fonk.push(id); }
      else if (p[2] === 'dusuk') t.dusuk = !!el.checked;
      else if (['tur', 'faz', 'S', 'F', 'P'].includes(p[2])) t[p[2]] = el.value;
      else if (p[2] in t) t[p[2]] = String(el.value).slice(0, p[2] === 'bolge' ? 80 : 300);
    } else if (p[0] === 'f') {
      const f = G.fonksiyonlar.find((x) => x.id === Number(p[1])); if (!f) return;
      if (p[2] in f && p[2] !== 'altsistemler') f[p[2]] = String(el.value).slice(0, p[2] === 'ad' ? 80 : 200);
    } else if (p[0] === 'a') {
      const f = G.fonksiyonlar.find((x) => x.id === Number(p[1])), a = f?.altsistemler.find((x) => x.id === Number(p[2])); if (!a) return;
      if (p[3] === 'PFH') { const v = sayi(el.value); a.PFH = v > 0 ? v : NaN; }
      else if (p[3] in a) a[p[3]] = String(el.value).slice(0, 120);
    } else if (p[0] === 'k') {
      const m = p.slice(1, -1).join('.'), f = p[p.length - 1];
      if (!KONTROL.some(([x]) => x === m)) return;
      const cur = G.kontrol[m] || { durum: '', not: '' };
      if (f === 'durum' && KONTROL_DURUM[el.value] !== undefined) cur.durum = el.value; else if (f === 'not') cur.not = String(el.value).slice(0, 200);
      G.kontrol[m] = cur;
    }
    h.changed();
  }
  function pdf(G) {
    const doc = pdfDoc(), T = h.pdfText;
    let pg, y, no = 0;
    const newPage = () => { pg = doc.page(210, 297); no++; y = 281; pg.text(14, 8, 8, T('Çizim Atölyesi - Mekatronik Mühendisliği - Güvenlik - sayfa ' + no)); };
    const wrap = (s, size) => { const out = []; let cur = ''; for (const w of s.split(' ')) { const t = cur ? cur + ' ' + w : w; if (t.length * size * 0.19 > 182 && cur) { out.push(cur); cur = '     ' + w; } else cur = t; } out.push(cur); return out; };
    newPage();
    guvRapor(G, api.name()).forEach((raw, i) => {
      const s = T(raw), size = i === 0 ? 12 : /^[A-ZÇĞİÖŞÜ0-9 ()\-.]+$/.test(s.trim()) && s.trim() && !/^\d/.test(s.trim()) ? 10 : 8.5;
      for (const ln of wrap(s, size)) { if (y < 16) newPage(); pg.text(14, y, size, ln); y -= size * 0.5; }
      if (!s.trim()) y -= 1;
    });
    return new Blob([doc.build()], { type: 'application/pdf' });
  }
  function act(a) {
    let m;
    const G = Q(), ad = () => api.name() || 'proje';
    if ((m = /^mk-yalt-(\w+)$/.exec(a))) { alt = m[1]; api.render(); return true; }
    if (a === 'mk-yadd-t') { tehlikeEkle(G); h.changed(); return true; }
    if (a === 'mk-yadd-f') { fonkEkle(G); alt = 'islev'; h.changed(); return true; }
    if ((m = /^mk-yadd-a-(\d+)$/.exec(a))) { const f = G.fonksiyonlar.find((x) => x.id === Number(m[1])); if (f) { altEkle(G, f); h.changed(); } return true; }
    if ((m = /^mk-ydel-t-(\d+)$/.exec(a))) { G.tehlikeler = G.tehlikeler.filter((x) => x.id !== Number(m[1])); h.changed(); api.toast('Tehlike silindi'); return true; }
    if ((m = /^mk-ydel-f-(\d+)$/.exec(a))) { const id = Number(m[1]); G.fonksiyonlar = G.fonksiyonlar.filter((x) => x.id !== id); for (const t of G.tehlikeler) t.fonk = t.fonk.filter((x) => x !== id); h.changed(); api.toast('Güvenlik işlevi silindi'); return true; }
    if ((m = /^mk-ydel-a-(\d+)-(\d+)$/.exec(a))) { const f = G.fonksiyonlar.find((x) => x.id === Number(m[1])); if (f) { f.altsistemler = f.altsistemler.filter((x) => x.id !== Number(m[2])); h.changed(); } return true; }
    if (a === 'mk-yornek') { if (G.tehlikeler.length || G.fonksiyonlar.length) return true; h.getP().guv = guvOrnek(); h.changed(); api.toast('Örnek yüklendi (temsilî; cihaz PL / PFHD değerleri boş — üreticiden gir)'); return true; }
    if (a === 'mk-ycsv') { api.saveBlob(new Blob([riskCSV(G)], { type: 'text/csv;charset=utf-8' }), ad() + '_risk_kaydi.csv'); api.toast('İndirildi'); return true; }
    if (a === 'mk-ypdf') { api.saveBlob(pdf(G), ad() + '_guvenlik.pdf'); api.toast('İndirildi'); return true; }
    return false;
  }
  return { html, input, act, _plr: plr };
}
