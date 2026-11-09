// Akıllı Kaynak Planlama — "Kaynak" sekmesi arayüzü.
// api: { getModel(), getPlan(), setPlan(p), commit(), changed(), render(), focus(w|null), toast(m), name(), parts(), bbox(), version(), openSheet(), snapshot()? }
import { detectWelds, mergePlan, setSide, actualLen, planReport, weldSequence, weldSummary, weldAccess, labelOf, fmtMM, WELD_TYPES, SIDES, METHODS, WELD_DEFAULTS, SEQ_TIPS } from './welds.js?v=20261109h';
import { Mesh, minDistance } from './mfgcheck.js?v=20261109h';
import { pdfFromJpegs } from './cutopt.js?v=20261109h';

const TCOL = { kose: '#f97316', alin: '#ef4444', t: '#a855f7' };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r1 = (v) => Math.round(v * 10) / 10;
const f1 = (v) => String(r1(v)).replace('.', ',');
const num = (v) => { const x = parseFloat(String(v).replace(',', '.')); return isFinite(x) ? x : NaN; };
// karşılaştırma: aynı kaynaklar öteki dolgu türüyle (tel ↔ elektrot) yapılsaydı
export function altCons(P) {
  const cur = METHODS[P.set.method] || METHODS.mag, alt = cur.filler === 'electrode' ? 'mag' : 'stick';
  const r = planReport(P.welds.map((w) => ({ ...w, method: null })), { ...P.set, method: alt, dia: null, arcPct: null });
  return r.cons[0] || null;
}
const altText = (c) => !c ? '' : c.electrodes != null ? 'örtülü elektrot Ø' + f1(c.dia) + ' ≈ ' + c.electrodes + ' adet (' + f1(c.electrodeKg) + ' kg)' : 'MIG/MAG teli Ø' + f1(c.dia) + ' ≈ ' + f1(c.needG / 1000) + ' kg (' + f1(c.wireM) + ' m)';
export const newPlan = () => ({ welds: [], set: { ...WELD_DEFAULTS }, symbols: true, ver: null });

export function createWeldUI(api) {
  const S = { filter: 'all', open: null, sel: null, showSet: false, busy: false, dirty: false, add: { a: '', b: '', type: 'kose', len: '', size: '' }, bulk: '' };
  const plan = () => { let p = api.getPlan(); if (!p) { p = newPlan(); api.setPlan(p); } p.set = { ...WELD_DEFAULTS, ...(p.set || {}) }; return p; };
  const find = (id) => plan().welds.find((w) => w.id === id);

  async function detect() {
    if (S.busy) return;
    const model = api.getModel();
    if (!model || !model.parts.length) { api.toast('Önce bir model olmalı'); return; }
    S.busy = true; api.render();
    await new Promise((r) => setTimeout(r, 30));
    try {
      const found = detectWelds(model);
      // torç erişimi (üretilebilirlik çekirdeği): her öneri için
      const meshes = model.parts.filter((q) => q.op !== 'sub' && q.tris.length >= 9).map((q) => new Mesh(q.tris));
      for (let i = 0; i < found.length; i++) { found[i].acc = weldAccess(found[i], meshes); if (i % 8 === 7) await new Promise((r) => setTimeout(r, 0)); }
      api.commit();
      const P = plan();
      P.welds = mergePlan(found, P.welds);
      P.ver = api.version();
      api.changed();
      api.toast(found.length ? found.length + ' olası kaynak birleşimi bulundu' : 'Kaynaklanacak temas bulunamadı');
    } catch (e) { api.toast('Tespit yapılamadı: ' + e.message); }
    S.busy = false; api.render();
  }

  function html() {
    const P = plan(), W = P.welds, rep = planReport(W, P.set);
    let h = '<div class="lbl h">Akıllı Kaynak Planlama</div>';
    h += `<button data-act="wd-detect" style="flex:1 0 100%;font-size:16px;padding:14px;background:#15803d"${S.busy ? ' disabled' : ''}>${S.busy ? '⏳ Birleşimler aranıyor…' : W.length ? '🔄 Yeniden tespit et (onaylar korunur)' : '🔍 KAYNAK BİRLEŞİMLERİNİ BUL'}</button>`;
    if (!W.length) return h + note('İskelet (konstrüksiyon) birleşimleri ve birbirine değen metal parçalar (sac–profil, profil–profil) taranır. Bulunanlar <b>öneri</b> olarak gelir: her temas kaynak demek değildir; sen onaylarsın, düzenlersin ya da silersin. Elle de kaynak ekleyebilirsin.') + addHtml();
    if (P.ver != null && api.version() !== P.ver) h += `<div style="flex:1 0 100%;background:#3a2506;border:1px solid #b45309;border-radius:10px;padding:8px;font-size:13.5px;color:#fde68a">⚠ Model tespitten sonra değişti; kaynak yerleri eski olabilir. Yeniden tespit et (onayların ve girdiğin ölçüler korunur).</div>`;
    // özet
    h += `<div style="flex:1 0 100%;background:#111a2e;border:1px solid #1e293b;border-radius:12px;padding:10px">` +
      `<div style="font-size:14.5px;line-height:1.45">${esc(weldSummary(W, rep))}</div>` +
      row('Tespit edilen / elle eklenen', rep.detected + ' / ' + rep.manual) + row('✓ Onaylı', rep.approved) + row('Öneri (bekliyor)', rep.proposed) + (rep.rejected ? row('Silinen', rep.rejected) : '') +
      row('Toplam bağlantı uzunluğu', fmtMM(rep.connLen)) + (rep.actualLen < rep.connLen - 0.5 ? row('Gerçek kaynak (aralıklı dahil)', fmtMM(rep.actualLen)) : '') +
      Object.entries(rep.byType).map(([k, v]) => row('· ' + WELD_TYPES[k.replace('-a', '')] + (k.endsWith('-a') ? ' (aralıklı)' : ''), v.count + ' adet · ' + fmtMM(v.len))).join('') + '</div>';
    // sarf
    h += '<div class="lbl h">Sarf malzemesi (tahmini)</div>';
    if (!rep.approved) h += note('Onaylı kaynak yok. Kartlardan onayla ya da "Tümünü onayla".');
    else if (!rep.cons.length) h += note('⚠ Onaylı kaynakların hiçbirinde kaynak ölçüsü (a / s) girilmedi; sarf hesaplanamadı. Ölçüyü kartlarda ya da aşağıdaki "Ölçüsü boş olanlara uygula" ile gir.');
    for (const c of rep.cons) {
      h += `<div style="flex:1 0 100%;background:#111a2e;border:1px solid #1e293b;border-radius:12px;padding:10px">` + `<div style="font-weight:800;margin-bottom:4px">${esc(c.name)} · Ø${f1(c.dia)} mm</div>` +
        row('Yığılan kaynak metali', f1(c.depositG) + ' g') +
        (c.wireM != null ? row('Kaynak teli', f1(c.needG / 1000) + ' kg ≈ ' + f1(c.wireM) + ' m') : '') +
        (c.rodM != null ? row('TIG dolgu çubuğu', f1(c.needG) + ' g ≈ ' + c.rods + ' adet (1 m)') : '') +
        (c.electrodes != null ? row('Elektrot', '≈ ' + c.electrodes + ' adet (' + P.set.rodLen + ' mm) · ' + f1(c.electrodeKg) + ' kg') : '') +
        (c.gasL ? row('Koruyucu gaz', '≈ ' + Math.round(c.gasL) + ' L') : '') +
        row('Ark süresi', f1(c.arcMin) + ' dk') + row('Tahmini iş süresi (puntalama, temizlik dahil)', f1(c.workMin) + ' dk') + '</div>';
    }
    if (rep.cons.length) { const ac = altCons(P); if (ac) h += note('Karşılaştırma — aynı kaynaklar ' + altText(ac) + ' ile yapılsaydı.'); }
    if (rep.unknown.length) h += note('⚠ Ölçüsü girilmeyen onaylı kaynaklar (' + rep.unknown.join(', ') + ') sarf hesabına <b>katılmadı</b>. Değerler tahminidir: yöntem, pozisyon, ağız hazırlığı ve kaynakçıya göre değişir.');
    else if (rep.cons.length) h += note('Değerler tahminidir (kesin tüketim değildir): kesit alanı, ' + P.set.reinf + '% fazla dolgu, yöntem verimi ve ' + P.set.loss + '% kayıp payıyla hesaplandı.');
    h += btn(S.showSet ? '⚙ Ayarları gizle' : '⚙ Yöntem ve sarf ayarları', 'wd-set', S.showSet) + btn('✓ Önerilerin tümünü onayla', 'wd-all') + btn('📄 PDF kaynak raporu', 'wd-pdf') +
      btn('📐 Teknik resmi aç', 'wd-sheet') + btn('Resimde semboller: ' + (P.symbols !== false ? 'açık' : 'kapalı'), 'wd-sym', P.symbols !== false);
    if (S.showSet) h += setHtml(P);
    // liste
    const cnt = (st) => W.filter((w) => w.status === st).length;
    h += '<div class="lbl h">Kaynaklar</div>' + btn('Tümü (' + W.filter((w) => w.status !== 'rejected').length + ')', 'wd-f-all', S.filter === 'all') + btn('Öneri (' + cnt('proposed') + ')', 'wd-f-proposed', S.filter === 'proposed') +
      btn('✓ Onaylı (' + cnt('approved') + ')', 'wd-f-approved', S.filter === 'approved') + btn('🗑 Silinen (' + cnt('rejected') + ')', 'wd-f-rejected', S.filter === 'rejected');
    const list = W.filter((w) => (S.filter === 'all' ? w.status !== 'rejected' : w.status === S.filter));
    if (!list.length) h += note('Bu filtrede kaynak yok.');
    for (const w of list) h += cardHtml(w, P);
    h += addHtml();
    // sıra
    const seq = weldSequence(W, api.bbox());
    h += '<div class="lbl h">Önerilen kaynak sırası</div>';
    if (!seq.length) h += note('Sıra, onaylı kaynaklardan oluşturulur.');
    let n = 0;
    for (const g of seq) {
      h += `<div style="flex:1 0 100%;font-size:14px;padding:6px 2px;border-top:1px solid #1e293b"><b>${esc(g.name)}</b><div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:5px">` +
        g.welds.map((w) => `<button data-act="wd-show-${esc(w.id)}" style="flex:0 0 auto;min-width:0;padding:6px 9px;font-size:13px;background:${TCOL[w.type]}33;border:1px solid ${TCOL[w.type]}">${++n}. ${esc(w.label)}</button>`).join('') + '</div></div>';
    }
    if (seq.length) h += SEQ_TIPS.map((t) => note('• ' + t)).join('');
    h += note('⚠ Bu sistem kaynak ölçüsünü ya da dayanımını <b>onaylamaz</b>. Kaynak boyutu, boğaz kalınlığı, malzeme uyumu ve yapısal yeterlilik mühendislik değerlendirmesi gerektirir.');
    return h;
  }
  function setHtml(P) {
    const s = P.set, M = METHODS[s.method] || METHODS.mag;
    return '<div class="lbl h">Varsayılan yöntem</div>' + Object.entries(METHODS).map(([k, m]) => btn(m.name, 'wd-m-' + k, s.method === k)).join('') +
      inp((M.filler === 'electrode' ? 'Elektrot' : M.filler === 'rod' ? 'Dolgu çubuğu' : 'Tel') + ' çapı (mm, boş = ' + f1(M.dia) + ')', 'set:dia', s.dia ?? '') +
      inp('Kayıp payı (%)', 'set:loss', s.loss) + inp('Fazla dolgu / takviye (%)', 'set:reinf', s.reinf) +
      inp('Ark süresi oranı (%, boş = ' + Math.round(M.arc * 100) + ')', 'set:arcPct', s.arcPct ?? '') +
      (M.filler === 'electrode' ? inp('Elektrot boyu (mm)', 'set:rodLen', s.rodLen) + inp('Atılan uç (mm)', 'set:stub', s.stub) : '') +
      '<div class="lbl h">Ölçüsü boş olanlara uygula</div>' + inp('Kaynak ölçüsü a / s (mm)', 'bulk', S.bulk) + btn('Onaylı ve öneri kaynaklara uygula', 'wd-bulk') +
      note('Ölçüyü sen girersin; uygulama kendiliğinden bir ölçü kabul etmez. Yaygın pratik: köşe kaynağında a ≤ 0,7 × ince parçanın kalınlığı (öneri, onay değildir).');
  }
  function cardHtml(w, P) {
    const col = TCOL[w.type] || '#94a3b8', on = S.sel === w.id, open = S.open === w.id, L = actualLen(w);
    const st = w.status === 'approved' ? '<span style="color:#86efac">✓ onaylı</span>' : w.status === 'rejected' ? '<span style="color:#fca5a5">silindi</span>' : '<span style="color:#fde68a">öneri</span>';
    const sizeTxt = Number(w.size) > 0 ? (w.type === 'alin' ? 's' : 'a') + f1(w.size) : '<span style="color:#fca5a5">ölçü yok</span>';
    let h = `<div style="flex:1 0 100%;background:${on ? '#1c2540' : '#111a2e'};border:1px solid ${on ? col : '#1e293b'};border-left:5px solid ${col};border-radius:12px;padding:8px 10px;${w.status === 'rejected' ? 'opacity:.55' : ''}">` +
      `<button data-act="wd-show-${esc(w.id)}" style="all:unset;display:block;width:100%;cursor:pointer">` +
      `<div style="display:flex;justify-content:space-between;gap:6px;align-items:baseline"><span style="font-weight:800;font-size:16px"><span style="display:inline-block;min-width:26px;text-align:center;background:${col};color:#0b1220;border-radius:6px;padding:0 5px;margin-right:6px">${esc(w.label)}</span>${esc(WELD_TYPES[w.type])}</span><span style="font-size:12.5px">${st}</span></div>` +
      `<div style="font-size:12.5px;color:#94a3b8;margin:4px 0">${esc(w.where || (w.manual ? 'Elle eklendi' : ''))}</div>` +
      `<div style="font-size:14px">${SIDES[w.side] || ''} · ${w.mode === 'aralikli' ? 'aralıklı ' + L.n + '×' + f1(w.stitch) + ' (bağlantı ' + fmtMM(L.conn) + ', kaynak ' + fmtMM(L.actual) + ')' : fmtMM(w.len)} · ${sizeTxt}${w.method ? ' · ' + esc(METHODS[w.method].name) : ''}</div>` +
      (w.acc && w.acc.okFrac === 0 ? '<div style="font-size:12.5px;color:#fbbf24;margin-top:3px">⚠ Torç erişimi zor (Üretim kontrolüyle aynı ölçüt)</div>' : '') + '</button>' +
      `<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">` +
      (w.status !== 'approved' ? sbtn('✓ Onayla', 'wd-ok-' + w.id, '#15803d') : sbtn('↺ Öneriye al', 'wd-un-' + w.id)) +
      sbtn(open ? '▲ Kapat' : '✏ Düzenle', 'wd-ed-' + w.id) +
      (w.status === 'rejected' ? sbtn('↺ Geri getir', 'wd-un-' + w.id) : sbtn('🗑 Sil', 'wd-del-' + w.id, '#7f1d1d')) + '</div>';
    if (open) {
      const t = w.t ? Math.min(w.t, 99) : null;
      h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' +
        sel('Kaynak türü', 'type', w, Object.entries(WELD_TYPES)) + sel('Dikiş', 'mode', w, [['surekli', 'Sürekli'], ['aralikli', 'Aralıklı']]) +
        sel('Kaynak tarafı', 'side', w, Object.entries(SIDES)) + sel('Yöntem', 'method', w, [['', 'Varsayılan (' + METHODS[P.set.method].name + ')'], ...Object.entries(METHODS).map(([k, m]) => [k, m.name])]) +
        winp('Bağlantı uzunluğu (mm)' + (w.lenEdited ? ' ✎' : ' (oto)'), 'len', w) + winp((w.type === 'alin' ? 'Kaynak ölçüsü s' : 'Boğaz kalınlığı a') + ' (mm)', 'size', w, 'girilmedi') +
        (w.mode === 'aralikli' ? winp('Dikiş boyu l (mm)', 'stitch', w) + winp('Dikiş arası e (mm)', 'pitch', w) : '') + '</div>' +
        (w.lenEdited && w.lens ? sbtn('↺ Uzunluğu otomatiğe al (' + fmtMM(w.lens[w.side] || w.lens.cevre) + ')', 'wd-auto-' + w.id) : '') +
        (t ? note('Bilgi: ince parça et kalınlığı ~' + f1(t) + ' mm → yaygın üst sınır a ≈ ' + f1(0.7 * t) + ' mm. Bu bir öneridir, ölçü onayı değildir.') : note('Parça kalınlığı bilinmiyor; ölçüyü çizim / şartnameye göre gir.'));
    }
    return h + '</div>';
  }
  function addHtml() {
    const ps = api.parts();
    const opt = (v) => `<option value="">— seç —</option>` + ps.map((q) => `<option value="${q.id}"${String(q.id) === String(v) ? ' selected' : ''}>${esc(q.name)}</option>`).join('');
    return '<div class="lbl h">+ Elle kaynak ekle</div>' +
      `<label class="f"><span>1. parça</span><select data-wf="add:a">${opt(S.add.a)}</select></label><label class="f"><span>2. parça</span><select data-wf="add:b">${opt(S.add.b)}</select></label>` +
      `<label class="f"><span>Tür</span><select data-wf="add:type">${Object.entries(WELD_TYPES).map(([k, l]) => `<option value="${k}"${S.add.type === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>` +
      inp('Uzunluk (mm)', 'add:len', S.add.len) + inp('Ölçü a / s (mm, boş = bilinmiyor)', 'add:size', S.add.size) + btn('+ Kaynak ekle', 'wd-add') +
      note('Kaynak, iki parçanın birbirine en yakın noktasına konur. Aynı parçanın kendi içinde (ör. iskelet) ek kaynak için iki kez aynı parçayı seç.');
  }
  const btn = (l, a, on, extra = '') => `<button data-act="${a}"${on ? ' class="on"' : ''} ${extra}>${l}</button>`;
  const sbtn = (l, a, bg) => `<button data-act="${esc(a)}" style="flex:1 1 30%;min-width:90px;padding:9px 4px;font-size:13px${bg ? ';background:' + bg : ''}">${l}</button>`;
  const note = (t) => `<div class="lbl" style="flex:1 0 100%;font-size:13px;line-height:1.4">${t}</div>`;
  const row = (k, v) => `<div style="display:flex;justify-content:space-between;gap:8px;padding:4px 0;border-top:1px solid #1e293b;font-size:14px"><span style="color:#94a3b8">${k}</span><b style="text-align:right">${v}</b></div>`;
  const inp = (l, k, v) => `<label class="f"><span>${l}</span><input type="number" step="any" inputmode="decimal" data-wf="${k}" value="${esc(v)}"></label>`;
  const winp = (l, k, w, ph = '') => `<label class="f"><span>${l}</span><input type="number" step="any" inputmode="decimal" data-wf="${k}" data-wid="${esc(w.id)}" value="${w[k] == null ? '' : esc(w[k])}" placeholder="${ph}"></label>`;
  const sel = (l, k, w, opts) => `<label class="f"><span>${l}</span><select data-wf="${k}" data-wid="${esc(w.id)}">${opts.map(([v, t]) => `<option value="${v}"${String(w[k] ?? '') === v ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;

  function act(a) {
    const P = plan();
    if (a === 'wd-detect') { detect(); return true; }
    if (a === 'wd-set') { S.showSet = !S.showSet; api.render(); return true; }
    if (a === 'wd-all') { api.commit(); let n = 0; for (const w of P.welds) if (w.status === 'proposed') { w.status = 'approved'; n++; } api.changed(); api.toast(n + ' kaynak onaylandı'); return true; }
    if (a === 'wd-pdf') { exportPDF(); return true; }
    if (a === 'wd-sheet') { api.openSheet(); return true; }
    if (a === 'wd-sym') { api.commit(); P.symbols = P.symbols === false; api.changed(); api.toast('Teknik resimde kaynak sembolleri ' + (P.symbols ? 'açık' : 'kapalı')); return true; }
    if (a.startsWith('wd-f-')) { S.filter = a.slice(5); api.render(); return true; }
    if (a.startsWith('wd-m-')) { api.commit(); P.set.method = a.slice(5); P.set.dia = null; api.changed(); return true; }
    if (a === 'wd-bulk') {
      const v = num(S.bulk);
      if (!(v > 0)) { api.toast('Önce ölçüyü yaz'); return true; }
      api.commit(); let n = 0; for (const w of P.welds) if (w.status !== 'rejected' && !(Number(w.size) > 0)) { w.size = v; n++; }
      api.changed(); api.toast(n + ' kaynağa ' + f1(v) + ' mm ölçü girildi'); return true;
    }
    if (a === 'wd-add') { addManual(); return true; }
    const m = a.match(/^wd-(show|ok|un|ed|del|auto)-(.+)$/);
    if (!m) return false;
    const w = find(m[2]);
    if (!w) return true;
    if (m[1] === 'show') { S.sel = w.id; api.focus(w); api.render(); return true; }
    if (m[1] === 'ed') { S.open = S.open === w.id ? null : w.id; S.sel = w.id; api.focus(w); api.render(); return true; }
    api.commit();
    if (m[1] === 'ok') w.status = 'approved';
    else if (m[1] === 'un') w.status = 'proposed';
    else if (m[1] === 'del') { if (w.manual) P.welds = P.welds.filter((x) => x !== w); else w.status = 'rejected'; if (S.sel === w.id) S.sel = null; }
    else if (m[1] === 'auto') { w.lenEdited = false; setSide(w, w.side); }
    api.changed();
    return true;
  }
  function addManual() {
    const P = plan(), a = Number(S.add.a), b = Number(S.add.b), L = num(S.add.len), sz = num(S.add.size);
    if (!a || !b) { api.toast('İki parçayı seç'); return; }
    if (!(L > 0)) { api.toast('Kaynak uzunluğunu yaz'); return; }
    const model = api.getModel(), qa = model.parts.find((q) => q.id === a), qb = model.parts.find((q) => q.id === b);
    if (!qa || !qb) { api.toast('Parça bulunamadı (gizli olabilir)'); return; }
    let pos;
    if (a === b) { const M = new Mesh(qa.tris); pos = M.box.min.map((v, k) => (v + M.box.max[k]) / 2); }
    else { const d = minDistance(new Mesh(qa.tris), new Mesh(qb.tris), 1e6); pos = d.p || new Mesh(qa.tris).box.min; if (d.d > 5) api.toast('Uyarı: parçalar ' + f1(d.d) + ' mm uzakta; kaynak en yakın noktaya kondu'); }
    api.commit();
    const id = 'm' + Date.now().toString(36);
    P.welds.push({ id, key: id, manual: true, status: 'approved', src: 'manual', parts: a === b ? [a] : [a, b], partNames: a === b ? [qa.name] : [qa.name, qb.name], where: 'Elle: ' + qa.name + (a === b ? '' : ' ↔ ' + qb.name), type: S.add.type, side: 'tek', len: L, lenEdited: true, size: sz > 0 ? sz : null, mode: 'surekli', stitch: 50, pitch: 100, method: null, pos, path: [pos], material: qa.material, label: labelOf(P.welds.length) });
    P.welds.forEach((w, i) => { w.label = labelOf(i); });
    S.add.len = ''; S.add.size = ''; S.sel = id;
    api.changed(); api.focus(P.welds[P.welds.length - 1]);
  }
  function input(el, type) {
    const k = el.dataset.wf, P = plan();
    if (k.startsWith('add:')) { S.add[k.slice(4)] = el.value; return; }
    if (k === 'bulk') { S.bulk = el.value; return; }
    if (!S.dirty) { api.commit(); S.dirty = true; }
    if (k.startsWith('set:')) {
      const f = k.slice(4), v = num(el.value);
      P.set[f] = el.value === '' && (f === 'dia' || f === 'arcPct') ? null : isFinite(v) && v >= 0 ? v : P.set[f];
    } else {
      const w = find(el.dataset.wid);
      if (!w) return;
      if (k === 'side') setSide(w, el.value);
      else if (k === 'type' || k === 'mode') w[k] = el.value;
      else if (k === 'method') w.method = el.value || null;
      else if (k === 'len') { const v = num(el.value); if (v > 0) { w.len = v; w.lenEdited = true; } }
      else if (k === 'size') { const v = num(el.value); w.size = v > 0 ? v : null; }
      else { const v = num(el.value); if (v > 0) w[k] = v; }
    }
    if (type === 'change' || el.tagName === 'SELECT') { S.dirty = false; api.changed(); }
  }

  async function exportPDF() {
    const P = plan(), rep = planReport(P.welds, P.set);
    if (!P.welds.length) { api.toast('Önce kaynak birleşimlerini bul'); return; }
    api.toast('PDF hazırlanıyor…');
    try {
      let shot = null;
      try { shot = api.snapshot ? api.snapshot() : null; } catch (e) { shot = null; }
      const pages = drawReport(P, rep, weldSequence(P.welds, api.bbox()), api.name(), shot);
      const jp = [];
      for (const c of pages) { const b = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); jp.push({ jpeg: new Uint8Array(await b.arrayBuffer()), w: c.width, h: c.height }); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([pdfFromJpegs(jp)], { type: 'application/pdf' }));
      a.download = String(api.name() || 'model').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '-kaynak-plani.pdf';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
      api.toast('PDF kaynak raporu indirildi (' + pages.length + ' sayfa)');
    } catch (e) { api.toast('PDF oluşturulamadı: ' + e.message); }
  }

  return { html, act, input, detect, get state() { return S; } };
}

/* ---------- PDF ---------- */
export function drawReport(P, rep, seq, title, shot) {
  const Wd = 1240, Hd = 1754, M = 70, pages = [];
  let g, y;
  const newPage = () => { const c = document.createElement('canvas'); c.width = Wd; c.height = Hd; g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, Wd, Hd); pages.push(c); y = M; g.fillStyle = '#64748b'; g.font = '20px sans-serif'; g.textAlign = 'right'; g.fillText('Çizim Atölyesi · Kaynak planı · sayfa ' + pages.length, Wd - M, Hd - 36); g.textAlign = 'left'; };
  const need = (h) => { if (y + h > Hd - 90) newPage(); };
  const font = (s, b) => { g.font = (b ? 'bold ' : '') + s + 'px sans-serif'; };
  const wrap = (txt, x, maxW, size, color = '#0f172a', bold = false) => {
    font(size, bold); g.fillStyle = color; const lh = size * 1.35; let line = '';
    for (const w of String(txt).split(/\s+/)) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { need(lh); g.fillText(line, x, y); y += lh; line = w; } else line = t; }
    if (line) { need(lh); g.fillText(line, x, y); y += lh; }
  };
  const kv = (k, v) => { need(42); font(25); g.fillStyle = '#334155'; g.fillText(k, M, y); font(25, true); g.fillStyle = '#0f172a'; g.textAlign = 'right'; g.fillText(v, Wd - M, y); g.textAlign = 'left'; g.strokeStyle = '#e2e8f0'; g.beginPath(); g.moveTo(M, y + 12); g.lineTo(Wd - M, y + 12); g.stroke(); y += 40; };
  newPage();
  font(46, true); g.fillStyle = '#0f172a'; g.fillText('KAYNAK PLANI', M, y + 30); y += 70;
  font(24); g.fillStyle = '#475569'; g.fillText(title + ' · ' + new Date().toLocaleString('tr-TR'), M, y); y += 46;
  wrap(weldSummary(P.welds, rep), M, Wd - 2 * M, 25); y += 14;
  kv('Toplam kaynak noktası (onaylı / tespit + elle)', rep.approved + ' / ' + (rep.detected + rep.manual));
  for (const [k, v] of Object.entries(rep.byType)) kv('  ' + WELD_TYPES[k.replace('-a', '')] + (k.endsWith('-a') ? ' (aralıklı)' : ''), v.count + ' adet · ' + fmtMM(v.len) + (k.endsWith('-a') ? ' (gerçek ' + fmtMM(v.actual) + ')' : ''));
  kv('Toplam bağlantı uzunluğu', fmtMM(rep.connLen));
  if (rep.actualLen < rep.connLen - 0.5) kv('Gerçek kaynak uzunluğu (aralıklı dahil)', fmtMM(rep.actualLen));
  for (const c of rep.cons) {
    kv(c.name + ' · Ø' + f1(c.dia), f1(c.depositG) + ' g kaynak metali');
    if (c.wireM != null) kv('  Tahmini kaynak teli', f1(c.needG / 1000) + ' kg ≈ ' + f1(c.wireM) + ' m');
    if (c.rodM != null) kv('  Tahmini dolgu çubuğu', f1(c.needG) + ' g ≈ ' + c.rods + ' adet');
    if (c.electrodes != null) kv('  Tahmini elektrot', '≈ ' + c.electrodes + ' adet · ' + f1(c.electrodeKg) + ' kg');
    if (c.gasL) kv('  Tahmini gaz', '≈ ' + Math.round(c.gasL) + ' L');
    kv('  Ark süresi / tahmini iş süresi', f1(c.arcMin) + ' / ' + f1(c.workMin) + ' dk');
  }
  if (rep.cons.length) { const ac = altCons(P); if (ac) kv('Karşılaştırma (öteki yöntemle)', altText(ac)); }
  if (!rep.cons.length) wrap('Sarf hesabı yapılamadı: onaylı kaynaklarda ölçü (a / s) girilmedi.', M, Wd - 2 * M, 22, '#b45309');
  if (rep.unknown.length) wrap('Ölçüsü girilmediği için sarf hesabına katılmayanlar: ' + rep.unknown.join(', '), M, Wd - 2 * M, 22, '#b45309');
  if (shot) { y += 16; const sw = Wd - 2 * M, sh = Math.min(520, sw * shot.height / shot.width); need(sh + 10); const k = Math.min(sw / shot.width, sh / shot.height); g.fillStyle = '#0b1220'; g.fillRect(M, y, sw, sh); g.drawImage(shot, M + (sw - shot.width * k) / 2, y + (sh - shot.height * k) / 2, shot.width * k, shot.height * k); y += sh + 20; }
  // tablo
  y += 20; need(80); font(32, true); g.fillStyle = '#0f172a'; g.fillText('Kaynak listesi', M, y); y += 40;
  const cols = [[M, 'No'], [M + 70, 'Tür'], [M + 260, 'Taraf / dikiş'], [M + 520, 'Uzunluk'], [M + 720, 'Ölçü'], [M + 830, 'Yöntem'], [M + 990, 'Durum']];
  font(20, true); g.fillStyle = '#475569'; for (const [x, t] of cols) g.fillText(t, x, y); y += 30;
  for (const w of P.welds) {
    need(64);
    const L = actualLen(w), col = TCOL[w.type];
    g.fillStyle = col; g.fillRect(M, y - 20, 50, 26); font(19, true); g.fillStyle = '#fff'; g.fillText(w.label, M + 6, y);
    font(19); g.fillStyle = '#0f172a';
    g.fillText(WELD_TYPES[w.type], M + 70, y);
    g.fillText((SIDES[w.side] || '') + (w.mode === 'aralikli' ? ' · ' + L.n + '×' + f1(w.stitch) + '(' + f1(w.pitch) + ')' : ''), M + 260, y);
    g.fillText(w.mode === 'aralikli' ? f1(L.actual) + ' / ' + f1(L.conn) : f1(w.len), M + 520, y);
    g.fillStyle = Number(w.size) > 0 ? '#0f172a' : '#b45309'; g.fillText(Number(w.size) > 0 ? (w.type === 'alin' ? 's' : 'a') + f1(w.size) : 'girilmedi', M + 720, y);
    g.fillStyle = '#0f172a'; g.fillText(w.method ? String(METHODS[w.method].iso) : 'vars.', M + 830, y);
    g.fillStyle = w.status === 'approved' ? '#166534' : w.status === 'rejected' ? '#991b1b' : '#b45309'; g.fillText(w.status === 'approved' ? 'onaylı' : w.status === 'rejected' ? 'silindi' : 'öneri', M + 990, y);
    y += 26; font(17); g.fillStyle = '#64748b'; g.fillText(String(w.where || '').slice(0, 110), M + 70, y); y += 32;
  }
  // sıra
  y += 16; need(80); font(32, true); g.fillStyle = '#0f172a'; g.fillText('Önerilen kaynak sırası', M, y); y += 42;
  let n = 0;
  for (const grp of seq) { need(70); wrap(grp.name, M, Wd - 2 * M, 24, '#0f172a', true); wrap(grp.welds.map((w) => (++n) + '. ' + w.label).join('   '), M + 20, Wd - 2 * M - 20, 22, '#334155'); y += 6; }
  y += 10; for (const t of SEQ_TIPS) wrap('• ' + t, M, Wd - 2 * M, 20, '#475569');
  y += 16; wrap('Önemli: Bu plan kaynak ölçüsünü, boğaz kalınlığını, malzeme uyumunu ya da yapısal yeterliliği onaylamaz; bunlar mühendislik değerlendirmesi gerektirir. Ölçüsü girilmeyen kaynaklar "girilmedi" olarak bırakılmıştır. Sarf ve süre değerleri tahminidir.', M, Wd - 2 * M, 20, '#991b1b');
  return pages;
}
