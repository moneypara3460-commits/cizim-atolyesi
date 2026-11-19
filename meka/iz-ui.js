// Mekatronik Mühendisliği — 8. aşama izlenebilirlik görünümü. Hesap meka/iz.js'te; bu dosya yalnız gösterir.
// h: { api, getP() → Mekatronik projesi, changed(), esc, pdfText, kaynak() → { sim, kart(k), elek, plc, guv }, kartlar: [[k, ad]] }
import { izSanitize, gereksinimEkle, matris, matrisCSV, revizyonAc, revizyonOnayla, revizyonSil, revizyonDurum, sonrakiRev, stepBaslik, izRapor, KAYNAK, ONCELIK, OLCUT, DURUM } from './iz.js?v=20261119c';
import { pdfDoc } from '../tx/pdf.js?v=20261112u';

export function createIzUI(h) {
  const { api, esc } = h;
  let alt = 'ger', yeni = { aciklama: '', hazirlayan: '' }, onay = { kontrol: '', onay: '' }, stepBusy = false;
  const Z = () => { const P = h.getP(); if (!P.iz || !Array.isArray(P.iz.gereksinimler)) P.iz = izSanitize(P.iz); return P.iz; };
  const sel = (attr, cur, opts) => `<select data-mkz="${attr}">${opts.map(([o, t]) => `<option value="${esc(o)}"${String(o) === String(cur) ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const txt = (attr, v, n = 300, ph = '') => `<input data-mkz="${attr}" value="${esc(v)}" maxlength="${n}" placeholder="${esc(ph)}">`;
  const fld = (label, inner) => `<label class="mk-f"><span>${esc(label)}</span>${inner}</label>`;
  const renk = { karsilandi: 'ok', karsilanmadi: 'bad', bekliyor: 'i' };
  function durumBandi(RD) {
    if (!RD.onayli) return '<div class="mk-c uyari">⚠ Onaylı revizyon yok</div>';
    return RD.degisti ? `<div class="mk-c hata">✗ Rev ${esc(RD.onayli.rev)} onaylandıktan sonra proje değişti: yeni revizyon aç</div>` : `<div class="mk-c i">✓ Proje, onaylı Rev ${esc(RD.onayli.rev)} ile aynı (${esc(RD.onayli.onayTarih.slice(0, 10))})</div>`;
  }
  function gerHtml(z, M, S) {
    let s = '<div class="mk-card mk-n">Her gereksinimi yaz ve nasıl doğrulanacağını seç: benzetim hedefi, hesap kartı, elektrik, PLC, güvenlik ya da elle (inceleme / test kaydı). Durum, ilgili sonuçtan kendiliğinden çıkar.</div>';
    s += '<div class="mk-btns"><button data-act="mk-zadd">+ Gereksinim</button></div>';
    const guvF = h.getP().guv?.fonksiyonlar || [];
    M.satir.forEach(({ g, durum, kanit }) => {
      s += `<div class="mk-card mk-it" data-gereksinim="${g.id}"><div class="mk-ih"><b>${esc(g.kod)}</b> <i class="${renk[durum]}">${esc(DURUM[durum])}</i></div><div class="mk-grid">`;
      s += fld('Kod', txt(`g.${g.id}.kod`, g.kod, 20)) + fld('Gereksinim', txt(`g.${g.id}.metin`, g.metin, 400, 'ör. Çevrim süresi en çok 4 s olmalı'));
      s += fld('Kaynak', sel(`g.${g.id}.kaynak`, g.kaynak, Object.entries(KAYNAK))) + fld('Öncelik', sel(`g.${g.id}.oncelik`, g.oncelik, Object.entries(ONCELIK)));
      s += fld('Doğrulama ölçütü', sel(`g.${g.id}.olcut`, g.olcut, Object.entries(OLCUT)));
      if (g.olcut === 'cevrim' || g.olcut === 'adet') s += fld(g.olcut === 'cevrim' ? 'Hedef çevrim süresi (s)' : 'Hedef saatlik üretim (adet)', `<input type="number" inputmode="decimal" step="any" data-mkz="g.${g.id}.hedef" value="${Number.isFinite(g.hedef) ? g.hedef : ''}">`);
      if (g.olcut === 'kart') s += fld('Hesap kartı', sel(`g.${g.id}.ref`, g.ref, [['', '— seç —'], ...h.kartlar]));
      if (g.olcut === 'guvIslev') s += fld('Güvenlik işlevi', sel(`g.${g.id}.ref`, g.ref, [['', '— seç —'], ...guvF.map((f) => [f.id, f.ad])]));
      if (g.olcut === 'elle') s += fld('Elle durum', sel(`g.${g.id}.elleDurum`, g.elleDurum, [['', 'Değerlendirilmedi'], ['karsilandi', 'Karşılandı'], ['karsilanmadi', 'Karşılanmadı']])) + fld('Kanıt (test / inceleme kaydı)', txt(`g.${g.id}.kanit`, g.kanit, 300, 'ör. Test raporu T-012, 18.11.2026'));
      s += `</div><div class="mk-r"><span>Kanıt</span><b>${esc(kanit)}</b></div><div class="mk-btns"><button data-act="mk-zdel-${g.id}" class="mk-dg">🗑 Sil</button></div></div>`;
    });
    void S;
    return s;
  }
  function revHtml(z, M, RD) {
    let s = durumBandi(RD) + `<div class="mk-card"><div class="mk-r"><span>Proje parmak izi (SHA-256)</span><b style="font-family:monospace;font-size:11px">${esc(RD.iz.slice(0, 16))}…</b></div><div class="mk-n">Parmak izi Mekatronik verisinin tamamından hesaplanır; tek bir değer değişse bile değişir. Onay adları yazılan metindir, kimlik doğrulamalı elektronik imza değildir.</div></div>`;
    if (RD.taslak) {
      const r = RD.taslak;
      s += `<div class="mk-card"><div class="mk-g">Rev ${esc(r.rev)} — taslak</div><div class="mk-r"><span>${esc(r.aciklama)}</span><b>${esc(r.hazirlayan || '—')}</b></div>${RD.taslakDegisti ? '<div class="mk-c hata">✗ Taslak açıldıktan sonra proje değişti: taslağı sil ve yeniden aç</div>' : ''}`;
      s += `<div class="mk-grid">${fld('Kontrol eden', txt('o.kontrol', onay.kontrol, 60))}${fld('Onaylayan (hazırlayandan farklı)', txt('o.onay', onay.onay, 60))}</div><div class="mk-btns"><button data-act="mk-zonay">✓ Onayla</button><button data-act="mk-zrevsil" class="mk-dg">Taslağı sil</button></div></div>`;
    } else {
      s += `<div class="mk-card"><div class="mk-g">Yeni revizyon: Rev ${esc(sonrakiRev(z))}</div><div class="mk-grid">${fld('Ne değişti', txt('y.aciklama', yeni.aciklama, 300, 'ör. İlk yayın / motor değişti'))}${fld('Hazırlayan', txt('y.hazirlayan', yeni.hazirlayan, 60))}</div><div class="mk-btns"><button data-act="mk-zrev">+ Revizyon aç</button></div></div>`;
    }
    s += '<div class="mk-g">Revizyon geçmişi</div>';
    if (!z.revizyonlar.length) s += '<div class="mk-card mk-n">Henüz revizyon yok.</div>';
    for (const r of [...z.revizyonlar].reverse()) s += `<div class="mk-card"><div class="mk-ih"><b>Rev ${esc(r.rev)}</b> <i class="${r.durum === 'onayli' ? 'ok' : 'i'}">${r.durum === 'onayli' ? 'Onaylı ' + esc(r.onayTarih.slice(0, 10)) : 'Taslak'}</i></div><div class="mk-r"><span>${esc(r.aciklama)}</span><b>${esc(r.tarih.slice(0, 10))}</b></div><div class="mk-r"><span>Hazırlayan · kontrol · onay</span><b>${esc(r.hazirlayan || '—')} · ${esc(r.kontrol || '—')} · ${esc(r.onay || '—')}</b></div>${r.ozet ? `<div class="mk-r"><span>Gereksinimler (karşılanan / toplam)</span><b>${r.ozet.karsilandi} / ${r.ozet.toplam}</b></div>` : ''}</div>`;
    return s;
  }
  function ozetHtml(z, M, RD) {
    let s = `<div class="mk-card"><div class="mk-v ${M.tamam && RD.onayli && !RD.degisti ? 'ok' : 'bad'}">${M.tamam ? '✓ ZORUNLU GEREKSİNİMLER KARŞILANDI' : '✗ AÇIK GEREKSİNİM VAR'}</div>`;
    s += `<div class="mk-r"><span>Karşılandı / karşılanmadı / değerlendirilmedi</span><b>${M.say.karsilandi} / ${M.say.karsilanmadi} / ${M.say.bekliyor}</b></div><div class="mk-r"><span>Açık zorunlu gereksinim</span><b>${M.zorunluAcik}</b></div>` + durumBandi(RD) + '</div>';
    s += '<div class="mk-btns"><button data-act="mk-zcsv">⬇ İzlenebilirlik matrisi (CSV)</button><button data-act="mk-zpdf">⬇ İzlenebilirlik raporu (PDF)</button></div>';
    s += `<div class="mk-g">STEP AP242</div><div class="mk-card mk-n">Model, OCCT çekirdeğiyle tam B-Rep katı olarak ISO 10303-242 (AP242) biçiminde yazılır: ürün adı proje adı, başlıkta revizyon, hazırlayan ve onaylayan bulunur. Dosya yazıldıktan sonra geri okunup hacmi karşılaştırılır.</div><div class="mk-btns"><button data-act="mk-zstep"${stepBusy ? ' disabled' : ''}>${stepBusy ? '⏳ STEP yazılıyor…' : '⬇ STEP AP242 (model)'}</button></div>`;
    return s;
  }
  function html() {
    const z = Z(), M = matris(z, h.kaynak()), RD = revizyonDurum(z, h.getP());
    let s = '<div class="mk-tabs">' + [['ger', '📋 Gereksinimler (' + z.gereksinimler.length + ')'], ['rev', '🔏 Revizyonlar (' + z.revizyonlar.length + ')'], ['ozet', (M.tamam ? '✓ ' : '✗ ') + 'Matris ve STEP']].map(([k, t]) => `<button data-act="mk-zalt-${k}" class="${k === alt ? 'on' : ''}">${t}</button>`).join('') + '</div>';
    s += alt === 'rev' ? revHtml(z, M, RD) : alt === 'ozet' ? ozetHtml(z, M, RD) : gerHtml(z, M);
    return s;
  }
  function input(el) {
    const p = el.dataset.mkz.split('.'), z = Z();
    if (p[0] === 'y') { yeni[p[1]] = String(el.value).slice(0, 300); return; }
    if (p[0] === 'o') { onay[p[1]] = String(el.value).slice(0, 60); return; }
    if (p[0] === 'g') {
      const g = z.gereksinimler.find((x) => x.id === Number(p[1])); if (!g) return;
      const f = p[2];
      if (f === 'hedef') { const v = Number(String(el.value).replace(',', '.')); g.hedef = el.value === '' || !Number.isFinite(v) ? NaN : v; }
      else if (f === 'kaynak' && KAYNAK[el.value]) g.kaynak = el.value;
      else if (f === 'oncelik' && ONCELIK[el.value]) g.oncelik = el.value;
      else if (f === 'olcut' && OLCUT[el.value]) { g.olcut = el.value; g.ref = ''; }
      else if (f === 'elleDurum') g.elleDurum = ['karsilandi', 'karsilanmadi'].includes(el.value) ? el.value : '';
      else if (f === 'ref') g.ref = el.value;
      else if (f === 'kod') g.kod = String(el.value).slice(0, 20) || g.kod;
      else if (f === 'metin' || f === 'kanit') g[f] = String(el.value).slice(0, f === 'metin' ? 400 : 300);
    }
    h.changed();
  }
  function pdf() {
    const z = Z(), M = matris(z, h.kaynak()), RD = revizyonDurum(z, h.getP());
    const doc = pdfDoc(), T = h.pdfText;
    let pg, y, no = 0;
    const newPage = () => { pg = doc.page(210, 297); no++; y = 281; pg.text(14, 8, 8, T('Çizim Atölyesi - Mekatronik Mühendisliği - İzlenebilirlik - sayfa ' + no)); };
    const wrap = (s, size) => { const out = []; let cur = ''; for (const w of s.split(' ')) { const t = cur ? cur + ' ' + w : w; if (t.length * size * 0.19 > 182 && cur) { out.push(cur); cur = '     ' + w; } else cur = t; } out.push(cur); return out; };
    newPage();
    izRapor(z, M, RD, api.name()).forEach((raw, i) => {
      const s = T(raw), size = i === 0 ? 12 : /^[A-ZÇĞİÖŞÜ ]+$/.test(s.trim()) && s.trim() ? 10 : 8.5;
      for (const ln of wrap(s, size)) { if (y < 16) newPage(); pg.text(14, y, size, ln); y -= size * 0.5; }
      if (!s.trim()) y -= 1;
    });
    return new Blob([doc.build()], { type: 'application/pdf' });
  }
  async function step() {
    const descs = api.descs ? api.descs() : [];
    if (!descs.length) { api.toast('Modelde parça yok: önce Tasarım\'da model çiz'); return; }
    if (!api.occt) { api.toast('B-Rep çekirdeği bu ekranda yok'); return; }
    stepBusy = true; api.render();
    try {
      const z = Z(), RD = revizyonDurum(z, h.getP()), son = z.revizyonlar[z.revizyonlar.length - 1];
      const r = await api.occt('step-ap242', { descs, name: api.name() || 'model' });
      const aciklama = son ? `Rev ${son.rev} ${son.durum === 'onayli' ? 'onaylı ' + son.onayTarih.slice(0, 10) : 'taslak'}${RD.degisti ? ' (onaydan sonra değişti)' : ''}: ${son.aciklama}` : 'Revizyon yok';
      const text = stepBaslik(r.text, { ad: api.name() || 'model', aciklama, yazar: son?.hazirlayan || '', kurum: '', onay: son?.durum === 'onayli' ? son.onay : '' });
      api.saveBlob(new Blob([text], { type: 'application/step' }), (api.name() || 'model') + (son ? '_rev' + son.rev : '') + '_AP242.step');
      const fark = r.hacim > 0 ? Math.abs(r.geriHacim - r.hacim) / r.hacim : 1;
      api.toast('STEP AP242 indirildi' + (fark < 1e-6 ? ' · geri okuma hacmi aynı' : ' · UYARI: geri okunan hacim farklı') + (r.check.valid ? '' : ' · geometri doğrulamadan geçmedi') + (r.skipped.length ? ' · ' + r.skipped.length + ' parça atlandı' : ''));
    } catch (e) { api.toast('STEP yazılamadı: ' + (e.message || e)); }
    finally { stepBusy = false; api.render(); }
  }
  function act(a) {
    let m;
    const z = Z(), ad = () => api.name() || 'proje';
    const dene = (f, ok) => { try { f(); if (ok) api.toast(ok); h.changed(); } catch (e) { api.toast(e.message); api.render(); } };
    if ((m = /^mk-zalt-(\w+)$/.exec(a))) { alt = m[1]; api.render(); return true; }
    if (a === 'mk-zadd') { gereksinimEkle(z); alt = 'ger'; h.changed(); return true; }
    if ((m = /^mk-zdel-(\d+)$/.exec(a))) { z.gereksinimler = z.gereksinimler.filter((g) => g.id !== Number(m[1])); h.changed(); api.toast('Gereksinim silindi'); return true; }
    if (a === 'mk-zrev') { dene(() => { const M = matris(z, h.kaynak()); revizyonAc(z, h.getP(), M, yeni); yeni = { aciklama: '', hazirlayan: yeni.hazirlayan }; }, 'Revizyon açıldı (taslak)'); return true; }
    if (a === 'mk-zonay') { dene(() => { const M = matris(z, h.kaynak()); revizyonOnayla(z, h.getP(), M, onay); onay = { kontrol: '', onay: '' }; }, 'Revizyon onaylandı'); return true; }
    if (a === 'mk-zrevsil') { dene(() => revizyonSil(z), 'Taslak silindi'); return true; }
    if (a === 'mk-zcsv') { api.saveBlob(new Blob([matrisCSV(matris(z, h.kaynak()))], { type: 'text/csv;charset=utf-8' }), ad() + '_izlenebilirlik.csv'); api.toast('İndirildi'); return true; }
    if (a === 'mk-zpdf') { api.saveBlob(pdf(), ad() + '_izlenebilirlik.pdf'); api.toast('İndirildi'); return true; }
    if (a === 'mk-zstep') { if (!stepBusy) step(); return true; }
    return false;
  }
  return { html, input, act };
}
