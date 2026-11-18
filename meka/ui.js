// Mekatronik Mühendisliği — sekme arayüzü (1. aşama: hesap ve seçim motoru).
// api: { render(), toast(m), name(), saveBlob(blob, name) }
// Girdiler bu cihazda saklanır (cizim:meka). Hesaplar meka/calc.js'te; bu dosya yalnız gösterir.
import { screwAxis, bearingLife, pneumatic, pickCylinder, reportLines, SCREW_DEFAULTS, BEARING_DEFAULTS, PNEU_DEFAULTS, SCREW_MOUNT, ISO281_A1, CYL_ROD, BASLIK, GIRDI_ADI, beltAxis, rackAxis, rotaryTable, gearbox, shaft, BELT_DEFAULTS, RACK_DEFAULTS, TABLE_DEFAULTS, GEARBOX_DEFAULTS, SHAFT_DEFAULTS } from './calc.js?v=20261118f';
import { KINDS, SLOTS, sanitize, addItem, removeItem, itemById, missing, applyLinks, linkChecks, bomRows, bomCSV, libAdd, libSanitize, HESAP_ADI } from './tree.js?v=20261119a';
import { pdfDoc } from '../tx/pdf.js?v=20261112u';
import { createElekUI } from './elec-ui.js?v=20261118f';
import { createPlcUI } from './plc-ui.js?v=20261118g';
import { plcSanitize } from './plc.js?v=20261118g';
import { createGuvUI } from './guv-ui.js?v=20261119a';
import { guvSanitize } from './guv.js?v=20261119a';
import { elekSanitize } from './elec.js?v=20261118f';

const KEY = 'cizim:meka';   // 1. aşamada girdiler burada tutuluyordu (geçiş için okunur)
const LIB = 'cizim:meka-lib';   // bileşen kütüphanesi (bu cihazda)
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 3) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('tr-TR', Math.abs(v) >= 1000 ? { maximumFractionDigits: 0 } : Math.abs(v) >= 1 ? { maximumFractionDigits: d } : { maximumSignificantDigits: 4 }));

// alan tanımları: [anahtar, etiket, birim, adım]
const F_SCREW = [
  ['Yük', [['m', 'Taşınan kütle', 'kg', 0.1], ['mu', 'Kılavuz sürtünme katsayısı μ', '', 0.001], ['aci', 'Eğim (0 yatay, 90 düşey)', '°', 1], ['Fdis', 'Dış kuvvet (işlem kuvveti)', 'N', 1]]],
  ['Bilyalı vida', [['P', 'Hatve', 'mm', 1], ['d', 'Vida çapı', 'mm', 1], ['dr', 'Diş dibi çapı (katalog)', 'mm', 0.1], ['L', 'Yataklar arası boy', 'mm', 1], ['mount', 'Yataklama'], ['etaS', 'Vida verimi ηv', '', 0.01]]],
  ['Aktarma', [['i', 'Oran (motor devri / vida devri)', '', 0.1], ['etaG', 'Redüktör / kayış verimi', '', 0.01], ['Jc', 'Kaplin ataleti', 'kg·m²', 0.000001]]],
  ['Hareket', [['strok', 'Strok', 'mm', 1], ['v', 'En yüksek hız', 'm/s', 0.01], ['ta', 'Hızlanma = yavaşlama süresi', 's', 0.01], ['td', 'Bekleme süresi', 's', 0.1], ['tutma', 'Beklemede yükü tutan']]],
  ['Motor (katalogdan)', [['Jm', 'Rotor ataleti', 'kg·m²', 0.000001], ['Tn', 'Anma torku', 'N·m', 0.01], ['Tmax', 'En yüksek tork', 'N·m', 0.01], ['nmax', 'En yüksek devir', 'dev/dk', 100], ['SF', 'Güvenlik katsayısı (RMS)', '', 0.1], ['oranSinir', 'İzin verilen atalet oranı', ': 1', 1]]],
];
const F_BEAR = [['Rulman', [['tip', 'Tip'], ['C', 'Dinamik yük sayısı C (katalog)', 'N', 100], ['Fr', 'Radyal yük Fr', 'N', 10], ['Fa', 'Eksenel yük Fa', 'N', 10], ['X', 'X katsayısı', '', 0.01], ['Y', 'Y katsayısı', '', 0.01], ['n', 'Devir', 'dev/dk', 10], ['guv', 'Güvenilirlik'], ['hedef', 'Hedef ömür', 'saat', 1000]]]];
const F_MOTOR = ['Motor (katalogdan)', [['Jm', 'Rotor ataleti', 'kg·m²', 0.000001], ['Tn', 'Anma torku', 'N·m', 0.01], ['Tmax', 'En yüksek tork', 'N·m', 0.01], ['nmax', 'En yüksek devir', 'dev/dk', 100], ['SF', 'Güvenlik katsayısı (RMS)', '', 0.1], ['oranSinir', 'İzin verilen atalet oranı', ': 1', 1]]];
const F_LIN = (kayis) => [
  ['Yük', [['m', 'Taşınan kütle', 'kg', 0.1], ['mu', 'Kılavuz sürtünme katsayısı μ', '', 0.001], ['aci', 'Eğim (0 yatay, 90 düşey)', '°', 1], ['Fdis', 'Dış kuvvet (işlem kuvveti)', 'N', 1]]],
  [kayis ? 'Triger kayış ve kasnaklar' : 'Kremayer ve pinyon', [['Dp', kayis ? 'Kasnak bölüm çapı' : 'Pinyon bölüm çapı (modül × diş sayısı)', 'mm', 0.1], ['Jp', kayis ? 'Kasnak ataleti (her biri; tahrik + avara)' : 'Pinyon ataleti', 'kg·m²', 0.000001], ...(kayis ? [['mb', 'Kayış kütlesi', 'kg', 0.01]] : []), ['eta', 'Verim η', '', 0.01], ['Fizin', kayis ? 'Kayışın izin verilen çekme kuvveti (katalog)' : 'İzin verilen teğetsel kuvvet (katalog)', 'N', 10]]],
  ['Aktarma', [['i', 'Oran (motor devri / ' + (kayis ? 'kasnak' : 'pinyon') + ' devri)', '', 0.1], ['etaG', 'Redüktör verimi', '', 0.01], ['Jc', 'Kaplin + redüktör giriş ataleti', 'kg·m²', 0.000001]]],
  ['Hareket', [['strok', 'Strok', 'mm', 1], ['v', 'En yüksek hız', 'm/s', 0.01], ['ta', 'Hızlanma = yavaşlama süresi', 's', 0.01], ['td', 'Bekleme süresi', 's', 0.1], ['tutma', 'Beklemede yükü tutan']]],
  F_MOTOR,
];
const F_TABLE = [
  ['Tabla ve yük', [['M', 'Tabla kütlesi (dolu disk)', 'kg', 0.1], ['Dt', 'Tabla çapı', 'mm', 1], ['Jek', 'Fikstür + parça ataleti', 'kg·m²', 0.0001], ['Tsur', 'Tabla yatağı sürtünme torku', 'N·m', 0.1]]],
  ['İndeksleme', [['aci', 'Bir adımda dönüş açısı', '°', 1], ['tm', 'Hareket süresi', 's', 0.01], ['ka', 'Hızlanma payı (ta / t_hareket, en çok 0,5)', '', 0.01], ['td', 'Bekleme (işlem) süresi', 's', 0.1]]],
  ['Aktarma', [['i', 'Redüktör oranı', '', 1], ['etaG', 'Redüktör verimi', '', 0.01], ['Jc', 'Kaplin + redüktör giriş ataleti', 'kg·m²', 0.000001]]],
  F_MOTOR,
];
const F_GEAR = [
  ['Uygulamanın istediği (eksen / tabla hesabından)', [['T2rms', 'Sürekli (RMS) çıkış torku', 'N·m', 0.1], ['T2tepe', 'Tepe çıkış torku', 'N·m', 0.1], ['n2', 'Çıkış devri', 'dev/dk', 1], ['n1', 'Motor devri', 'dev/dk', 100], ['fs', 'Servis katsayısı fs (katalog tablosundan)', '', 0.05]]],
  ['Redüktör (katalogdan)', [['i', 'Oran', '', 1], ['T2N', 'Anma çıkış torku', 'N·m', 1], ['T2max', 'En yüksek çıkış torku', 'N·m', 1], ['n1max', 'İzin verilen giriş devri', 'dev/dk', 100], ['eta', 'Verim', '', 0.01]]],
];
const F_SHAFT = [
  ['Yükleme', [['durum', 'Yükleme durumu'], ['F', 'Kuvvet (bileşke)', 'N', 10], ['L', 'Yataklar arası / konsol boyu', 'mm', 1], ['a', 'Yükün sol yatağa uzaklığı', 'mm', 1], ['T', 'İletilen tork', 'N·m', 0.1]]],
  ['Mil ve malzeme', [['d', 'Mil çapı', 'mm', 0.5], ['E', 'Elastisite modülü (çelik 210 000)', 'MPa', 1000], ['Re', 'Akma dayanımı Re (malzeme)', 'MPa', 5], ['Sgerek', 'İstenen statik güvenlik', '', 0.1]]],
  ['Sınırlar', [['yIzin', 'İzin verilen sehim (0 = kontrol yok)', 'mm', 0.01], ['tIzin', 'İzin verilen yatak eğimi (0 = kontrol yok)', 'rad', 0.0001]]],
];
const F_PNEU = [['Silindir', [['D', 'İç çap (standart)'], ['strok', 'Strok', 'mm', 1], ['p', 'Çalışma basıncı', 'bar', 0.5], ['yuk', 'Yük', 'N', 10], ['yon', 'Kuvvet yönü'], ['dinamik', 'Yük tipi'], ['cevrim', 'Çevrim sayısı', '/dk', 1]]]];

const SEL = {
  mount: Object.entries(SCREW_MOUNT).map(([k, v]) => [k, v.ad]),
  tutma: [['motor', 'Motor (tork harcar)'], ['fren', 'Fren']],
  tip: [['bilyali', 'Bilyalı (p = 3)'], ['makarali', 'Makaralı (p = 10/3)']],
  guv: Object.keys(ISO281_A1).map((k) => [k, '%' + k]),
  D: Object.keys(CYL_ROD).map((k) => [k, 'Ø' + k + ' (' + (k <= 25 ? 'ISO 6432' : 'ISO 15552') + ', mil Ø' + CYL_ROD[k] + ')']),
  yon: [['itme', 'İtme'], ['cekme', 'Çekme']],
  dinamik: [['1', 'Hareketli yük (%70 sınırı)'], ['0', 'Sıkma / statik (%85 sınırı)']],
  durum: [['iki-mesnet', 'İki yatak arası tekil yük'], ['konsol', 'Konsol (ankastre), uçta yük']],
};
const SAMPLE = {   // test projesi: paketleme makinesi dolum ünitesi (temsilî değerler; gerçek katalogla değiştir)
  vida: { ...SCREW_DEFAULTS, m: 18, aci: 90, mu: 0.005, Fdis: 150, P: 10, d: 16, dr: 13.2, L: 450, mount: 'sabit-mesnetli', strok: 200, v: 0.3, ta: 0.12, td: 0.8, tutma: 'motor', i: 1, etaG: 1, Jm: 0.00012, Tn: 1.27, Tmax: 3.8, nmax: 3000 },
  rulman: { ...BEARING_DEFAULTS, C: 9950, Fr: 1200, n: 1800, guv: 95, hedef: 20000 },
  pnomatik: { ...PNEU_DEFAULTS, D: 32, strok: 80, p: 6, yuk: 250, cevrim: 30 },
  kayis: { ...BELT_DEFAULTS },
  kremayer: { ...RACK_DEFAULTS },
  tabla: { ...TABLE_DEFAULTS },
  reduktor: { ...GEARBOX_DEFAULTS },
  mil: { ...SHAFT_DEFAULTS, d: 25 },
};
const CARDS = [['vida', '⚙ Vidalı eksen', SCREW_DEFAULTS], ['kayis', '➰ Kayışlı eksen', BELT_DEFAULTS], ['kremayer', '⚙ Kremayer', RACK_DEFAULTS], ['tabla', '◴ Döner tabla', TABLE_DEFAULTS], ['reduktor', '⚙ Redüktör', GEARBOX_DEFAULTS], ['mil', '━ Mil', SHAFT_DEFAULTS], ['rulman', '◎ Rulman', BEARING_DEFAULTS], ['pnomatik', '⇆ Pnömatik', PNEU_DEFAULTS]];
const DEFS = { vida: () => F_SCREW, kayis: () => F_LIN(true), kremayer: () => F_LIN(false), tabla: () => F_TABLE, reduktor: () => F_GEAR, mil: () => F_SHAFT, rulman: () => F_BEAR, pnomatik: () => F_PNEU };
const RUN = { vida: screwAxis, kayis: beltAxis, kremayer: rackAxis, tabla: rotaryTable, reduktor: gearbox, mil: shaft, rulman: bearingLife, pnomatik: (g) => pneumatic({ ...g, d: null, dinamik: !!g.dinamik }) };

// api: { render(), toast(m), name(), saveBlob(blob, name), parts() → [{ id, name }], changed() (kaydet + geri al noktası), focusPart(id) }
export function createMekaUI(api) {
  // Proje verisi (projeyle kaydedilir): ürün ağacı + bağlar + hesap girdileri. Kütüphane bu cihazda.
  let P = fresh(null);
  let view = 'hesap', editId = null;
  let lib = []; try { lib = libSanitize(JSON.parse(localStorage.getItem(LIB) || '[]')); } catch (e) { lib = []; }
  const saveLib = () => { try { localStorage.setItem(LIB, JSON.stringify(lib)); } catch (e) { /* */ } };
  function fresh(o) {
    const Q = sanitize(o);
    let old = null; try { old = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { old = null; }   // 1. aşama: girdiler cihazdaydı
    const c = Q.calc && typeof Q.calc === 'object' ? Q.calc : old && old.vida ? old : null;
    Q.calc = { kart: CARDS.some(([k]) => k === c?.kart) ? c.kart : 'vida' };
    for (const [k, , D] of CARDS) Q.calc[k] = { ...D, ...(c?.[k] && typeof c[k] === 'object' ? c[k] : SAMPLE[k]) };
    Q.elek = elekSanitize(Q.elek);
    Q.plc = plcSanitize(Q.plc);
    Q.guv = guvSanitize(Q.guv);
    return Q;
  }
  const C = () => P.calc;
  const changed = () => { if (api.changed) api.changed(); api.render(); };
  const linked = (k) => applyLinks(k, C()[k], P);
  const run = (k) => {
    try {
      const g = linked(k).giris;
      const r = RUN[k](g);
      const extra = linkChecks(k, r, P).map((c) => ({ ...c, duzey: c.ok ? 'tamam' : c.duzey }));
      r.kontroller = [...r.kontroller, ...extra];
      r.uygun = r.kontroller.every((c) => c.ok || c.duzey !== 'hata');
      return r;
    } catch (e) { return { hata: e.message }; }
  };
  const guv = createGuvUI({ api, getP: () => P, changed: () => changed(), esc, pdfText });
  const plc = createPlcUI({ api, getP: () => P, changed: () => changed(), esc, pdfText });
  const elek = createElekUI({ api, getP: () => P, changed: () => changed(), esc, nf, pdfText });
  const partName = (id) => (api.parts ? (api.parts().find((q) => q.id === id) || {}).name : '') || '';

  function field(k, [key, label, unit, step], kaynak = {}) {
    const v = C()[k][key];
    const src = kaynak[key];
    if (src) {   // bağlı bileşenden geliyor: salt okunur
      const shown = SEL[key] ? (SEL[key].find(([o]) => o === String(linked(k).giris[key])) || [, linked(k).giris[key]])[1] : nf(linked(k).giris[key], 6);
      return `<label class="mk-f"><span>${esc(label)}${unit ? ' <i>(' + esc(unit) + ')</i>' : ''}</span><div class="mk-lk" title="${esc(src)}">🔗 ${esc(shown)} <i>${esc(src)}</i></div></label>`;
    }
    if (SEL[key]) {
      const cur = key === 'dinamik' ? (v ? '1' : '0') : String(v);
      return `<label class="mk-f"><span>${esc(label)}</span><select data-mk="${k}.${key}">${SEL[key].map(([o, t]) => `<option value="${o}"${o === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    }
    return `<label class="mk-f"><span>${esc(label)}${unit ? ' <i>(' + esc(unit) + ')</i>' : ''}</span><input type="number" inputmode="decimal" step="${step || 'any'}" data-mk="${k}.${key}" value="${Number.isFinite(v) ? v : ''}"></label>`;
  }
  function results(k, r) {
    if (r.hata) return `<div class="mk-card mk-err">⚠ ${esc(r.hata)}</div>`;
    const s = r.sonuc, rows = k === 'vida'
      ? [['Motor devri', nf(s.nM, 0) + ' dev/dk'], ['Vida devri / kritik devir', nf(s.nS, 0) + ' / ' + nf(s.nc, 0) + ' dev/dk'], ['En büyük eksenel kuvvet / burkulma', nf(s.Fmax, 0) + ' / ' + nf(s.Pk, 0) + ' N'],
        ['Yük torku (sabit hız)', nf(s.Tl) + ' N·m'], ['Hızlanma torku', nf(s.Tacc) + ' N·m'], ['En yüksek tork', nf(s.Tpk) + ' N·m'], ['RMS tork', nf(s.Trms) + ' N·m'], ['Atalet oranı', nf(s.ratio, 2) + ' : 1'], ['Çevrim süresi', nf(s.tcyc, 2) + ' s']]
      : k === 'kayis' || k === 'kremayer'
        ? [['Motor devri', nf(s.nM, 0) + ' dev/dk'], [k === 'kayis' ? 'Kayış kuvveti (en büyük)' : 'Teğetsel kuvvet (en büyük)', nf(s.Fmax, 0) + ' N'], ['Yük torku', nf(s.Tl) + ' N·m'], ['Hızlanma torku', nf(s.Tacc) + ' N·m'], ['En yüksek tork', nf(s.Tpk) + ' N·m'], ['RMS tork', nf(s.Trms) + ' N·m'], ['Atalet oranı', nf(s.ratio, 2) + ' : 1'], ['Çevrim süresi', nf(s.tcyc, 2) + ' s']]
      : k === 'tabla'
        ? [['Tabla + yük ataleti', nf(s.JT, 5) + ' kg·m²'], ['Tabla en yüksek hızı', nf(s.nT, 1) + ' dev/dk'], ['Motor devri', nf(s.nM, 0) + ' dev/dk'], ['Hızlanma torku', nf(s.Tacc) + ' N·m'], ['En yüksek tork', nf(s.Tpk) + ' N·m'], ['RMS tork', nf(s.Trms) + ' N·m'], ['Atalet oranı', nf(s.ratio, 2) + ' : 1']]
      : k === 'reduktor'
        ? [['Gereken oran', nf(s.iGer, 2)], ['Giriş devri', nf(s.n1, 0) + ' dev/dk'], ['Sürekli tork × fs', nf(s.T2s, 1) + ' N·m'], ['Motordan istenen tepe tork', nf(s.T1) + ' N·m']]
      : k === 'mil'
        ? [['Yatak tepkileri', nf(s.R1, 0) + (s.R2 != null ? ' / ' + nf(s.R2, 0) : '') + ' N'], ['En büyük moment', nf(s.M / 1000, 2) + ' N·m'], ['En büyük sehim', nf(s.y, 4) + ' mm'], ['Yatak / uç eğimi', nf(Math.max(s.t1, s.t2 ?? 0), 5) + ' rad'], ['Eğilme / burulma gerilmesi', nf(s.sb, 1) + ' / ' + nf(s.tau, 1) + ' MPa'], ['von Mises', nf(s.sv, 1) + ' MPa'], ['Statik güvenlik', nf(s.S, 2)]]
      : k === 'rulman'
        ? [['Eşdeğer yük P', nf(s.P, 0) + ' N'], ['L10', nf(s.L10, 1) + ' milyon devir'], ['L10h', nf(s.L10h, 0) + ' saat'], ['Güvenilirliğe göre (a1 = ' + s.a1 + ')', nf(s.Lnm, 0) + ' saat']]
        : [['İtme kuvveti (teorik)', nf(s.Fi, 0) + ' N'], ['Çekme kuvveti (teorik)', nf(s.Fc, 0) + ' N'], ['Yük oranı', '%' + nf(s.oran * 100, 0)], ['Hava (çevrim başına)', nf(s.Vcyc, 3) + ' NL'], ['Hava tüketimi', nf(s.Q, 1) + ' NL/dk']];
    let h = `<div class="mk-card"><div class="mk-v ${r.uygun ? 'ok' : 'bad'}">${r.uygun ? '✓ UYGUN' : '✗ UYGUN DEĞİL'}</div>` + rows.map(([a, b]) => `<div class="mk-r"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('') + '</div>';
    h += '<div class="mk-card">' + r.kontroller.map((c) => `<div class="mk-c ${c.ok ? (c.duzey === 'bilgi' ? 'i' : 'ok') : c.duzey}">${c.ok ? (c.duzey === 'bilgi' ? 'ℹ' : '✓') : c.duzey === 'hata' ? '✗' : '⚠'} ${esc(c.metin)}</div>`).join('') + '</div>';
    if (k === 'pnomatik' && !r.uygun) { const g = linked('pnomatik').giris, p = pickCylinder(g.yuk, g.p, g.yon, !!g.dinamik); h += `<div class="mk-card">💡 ${p ? 'Uygun en küçük standart silindir: <b>Ø' + p.D + ' / mil Ø' + p.d + '</b> (' + p.std + ')' : 'Bu basınçta Ø125\'e kadar uygun standart silindir yok: basıncı artır ya da çift silindir kullan.'}</div>`; }
    h += '<details class="mk-card"><summary>Hesap adımları (formül ve kaynak)</summary>' + r.adimlar.map((a, i) => `<div class="mk-s">${i + 1}. ${esc(a.ad)}<br><code>${esc(a.formul)}</code> = <b>${esc(nf(a.deger, 4))}</b> ${esc(a.birim)} <i>[${esc(a.kaynak)}]</i></div>`).join('') + '</details>';
    return h;
  }
  function slotsHtml(k) {
    const sl = SLOTS[k] || [];
    let h = '<div class="mk-g">Bağlı bileşenler (ürün ağacından)</div><div class="mk-grid">';
    for (const [slot, kind] of sl) {
      const cur = P.bag[k][slot];
      h += `<label class="mk-f"><span>${esc(KINDS[kind].ad)}</span><select data-mkb="${k}.${slot}"><option value="">— elle gir —</option>${P.items.filter((it) => it.kind === kind).map((it) => `<option value="${it.id}"${it.id === cur ? ' selected' : ''}>${esc(it.ad + (it.kod ? ' · ' + it.kod : ''))}</option>`).join('')}</select></label>`;
    }
    h += '</div>';
    const e = linked(k).eksik;
    if (e.length) h += `<div class="mk-card mk-c uyari">⚠ Bağlı bileşende eksik katalog bilgisi: ${esc(e.join('; '))}. Ürün ağacından tamamla (eksik alan için hesapta girilen değer kullanılıyor).</div>`;
    return h;
  }
  function hesapHtml() {
    const k = C().kart, defs = DEFS[k](), kaynak = linked(k).kaynak;
    let h = '<div class="mk-tabs">' + CARDS.map(([a, t]) => `<button data-act="mk-k-${a}" class="${a === k ? 'on' : ''}">${t}</button>`).join('') + '</div>';
    h += `<div class="mk-card mk-t">${esc(BASLIK[k])}</div>`;
    if ((SLOTS[k] || []).length) h += slotsHtml(k);
    for (const [g, fs] of defs) h += `<div class="mk-g">${esc(g)}</div><div class="mk-grid">` + fs.map((f) => field(k, f, kaynak)).join('') + '</div>';
    h += results(k, run(k));
    h += `<div class="mk-btns"><button data-act="mk-pdf">📄 Hesap raporu (PDF)</button><button data-act="mk-ornek">↺ Örnek değerler (dolum ünitesi)</button></div>`;
    return h;
  }
  function itemHtml(it) {
    const K = KINDS[it.kind], miss = missing(it);
    if (editId !== it.id) {
      const used = Object.entries(P.bag).filter(([, sl]) => Object.values(sl).includes(it.id)).map(([t]) => HESAP_ADI[t] || t);
      return `<div class="mk-card mk-it"><div class="mk-ih"><b>${esc(it.ad)}</b> <i>${esc(K.ad)}${it.kod ? ' · ' + esc(it.kod) : ''}${it.uretici ? ' · ' + esc(it.uretici) : ''} · ${it.adet} adet</i></div>` +
        `<div class="mk-im">${it.partId != null ? '🔗 ' + esc(partName(it.partId) || '(silinmiş parça)') : 'Model parçasına bağlı değil'}${used.length ? ' · hesap: ' + esc(used.join(', ')) : ''}${miss.length ? ' · <span class="mk-c uyari">⚠ eksik: ' + esc(miss.join(', ')) + '</span>' : ''}</div>` +
        `<div class="mk-btns"><button data-act="mk-ed-${it.id}">✎ Düzenle</button>${it.partId != null ? `<button data-act="mk-go-${it.id}">◎ Parçayı göster</button>` : ''}<button data-act="mk-lib-${it.id}">⭳ Kütüphaneye kaydet</button><button data-act="mk-del-${it.id}" class="mk-dg">🗑 Sil</button></div></div>`;
    }
    const inp = (f, v, lab, type = 'text') => `<label class="mk-f"><span>${esc(lab)}</span><input ${type === 'number' ? 'type="number" inputmode="decimal" step="any"' : 'type="text" maxlength="80"'} data-mki="${it.id}.${f}" value="${esc(v ?? '')}"></label>`;
    let h = `<div class="mk-card mk-it on"><div class="mk-ih"><b>${esc(K.ad)}</b> — katalog bilgileri</div><div class="mk-grid">` +
      inp('ad', it.ad, 'Ad') + inp('kod', it.kod, 'Ürün kodu') + inp('uretici', it.uretici, 'Üretici') + inp('adet', it.adet, 'Adet', 'number') +
      `<label class="mk-f"><span>Model parçası</span><select data-mki="${it.id}.partId"><option value="">— bağlı değil —</option>${(api.parts ? api.parts() : []).map((q) => `<option value="${q.id}"${q.id === it.partId ? ' selected' : ''}>${esc(q.name)}</option>`).join('')}</select></label></div>`;
    if (K.alanlar.length) h += '<div class="mk-g">Katalog değerleri (üreticiden)</div><div class="mk-grid">' + K.alanlar.map(([k, l, u, req]) => `<label class="mk-f"><span>${esc(l)}${u ? ' <i>(' + esc(u) + ')</i>' : ''}${req ? ' <b class="mk-req">*</b>' : ''}</span><input type="number" inputmode="decimal" step="any" data-mki="${it.id}.deger.${k}" value="${Number.isFinite(it.deger[k]) ? it.deger[k] : ''}"></label>`).join('') + '</div>';
    h += `<label class="mk-f"><span>Not</span><input type="text" maxlength="300" data-mki="${it.id}.not" value="${esc(it.not)}"></label>`;
    h += `<div class="mk-btns"><button data-act="mk-ed-0">✓ Tamam</button></div><div class="mk-n">* hesap için zorunlu. Değerleri üreticinin güncel kataloğundan gir.</div></div>`;
    return h;
  }
  function agacHtml() {
    let h = '<div class="mk-g">Bileşen ekle</div><div class="mk-btns">' + Object.entries(KINDS).map(([k, v]) => `<button data-act="mk-add-${k}">+ ${esc(v.ad)}</button>`).join('') + '</div>';
    if (lib.length) h += `<div class="mk-g">Kütüphaneden ekle</div><div class="mk-grid"><label class="mk-f"><span>Kayıtlı bileşen (${lib.length})</span><select data-mkl="1"><option value="">— seç —</option>${lib.map((x, i) => `<option value="${i}">${esc(KINDS[x.kind].ad + ': ' + x.ad + (x.kod ? ' · ' + x.kod : ''))}</option>`).join('')}</select></label></div>`;
    if (!P.items.length) return h + '<div class="mk-card mk-n">Ürün ağacı boş. Makinedeki motor, redüktör, vida, rulman, silindir, valf, sensör ve sürücüleri ekle; her birini çizimdeki parçaya ve hesaplara bağla.</div>';
    const groups = Object.keys(KINDS).map((k) => [k, P.items.filter((it) => it.kind === k)]).filter(([, l]) => l.length);
    for (const [k, l] of groups) h += `<div class="mk-g">${esc(KINDS[k].ad)} (${l.reduce((s, it) => s + it.adet, 0)})</div>` + l.map(itemHtml).join('');
    return h;
  }
  function status() { const o = {}; for (const [k] of CARDS) { const has = Object.keys(P.bag[k] || {}).length; if (has) { const r = run(k); o[k] = r.hata ? false : r.uygun; } } return o; }
  function listeHtml() {
    const rows = bomRows(P, partName, status());
    if (!rows.length) return '<div class="mk-card mk-n">Parça listesi ürün ağacından oluşur. Önce Ürün ağacı sekmesinden bileşen ekle.</div>';
    let h = '<div class="mk-card mk-tbl"><table><tr><th>No</th><th>Bileşen</th><th>Kod</th><th>Adet</th><th>Parça</th><th>Durum</th></tr>' +
      rows.map((r) => `<tr><td>${r.no}</td><td>${esc(r.ad)}<br><i>${esc(r.tur)}${r.uretici ? ' · ' + esc(r.uretici) : ''}</i></td><td>${esc(r.kod)}</td><td>${r.adet}</td><td>${esc(r.parca)}</td><td class="${r.durum === 'UYGUN DEĞİL' ? 'bad' : r.durum === 'uygun' ? 'ok' : ''}">${esc(r.durum)}${r.eksik ? '<br><i>eksik: ' + esc(r.eksik) + '</i>' : ''}</td></tr>`).join('') + '</table></div>';
    h += '<div class="mk-btns"><button data-act="mk-csv">⬇ Parça listesi (CSV / Excel)</button><button data-act="mk-bompdf">📄 Parça listesi + bütün hesaplar (PDF)</button></div>';
    return h;
  }
  function kutHtml() {
    if (!lib.length) return '<div class="mk-card mk-n">Kütüphane boş. Ürün ağacındaki bir bileşende "Kütüphaneye kaydet" de: katalog bilgileri bu cihazda saklanır, sonraki projelerde tek dokunuşla eklenir.</div>';
    return lib.map((x, i) => `<div class="mk-card mk-it"><div class="mk-ih"><b>${esc(x.ad)}</b> <i>${esc(KINDS[x.kind].ad)}${x.kod ? ' · ' + esc(x.kod) : ''}${x.uretici ? ' · ' + esc(x.uretici) : ''}</i></div><div class="mk-im">${KINDS[x.kind].alanlar.filter(([k]) => Number.isFinite(x.deger[k])).map(([k, l, u]) => esc(l) + ' ' + esc(nf(x.deger[k], 6)) + (u ? ' ' + esc(u) : '')).join(' · ') || '—'}</div><div class="mk-btns"><button data-act="mk-luse-${i}">+ Projeye ekle</button><button data-act="mk-ldel-${i}" class="mk-dg">🗑 Kütüphaneden sil</button></div></div>`).join('');
  }
  function html() {
    let h = '<style>' + CSS + '</style><div class="mk"><div class="lbl h">Mekatronik Mühendisliği</div>';
    h += '<div class="mk-tabs mk-top">' + [['hesap', '🧮 Hesaplar'], ['agac', '🌳 Ürün ağacı (' + P.items.length + ')'], ['liste', '📋 Parça listesi'], ['elek', '⚡ Elektrik (' + P.elek.yukler.length + ')'], ['plc', '🖥 PLC (' + P.plc.sinyaller.length + ')'], ['guv', '🛡 Güvenlik (' + P.guv.tehlikeler.length + ')'], ['kut', '📚 Kütüphane (' + lib.length + ')']].map(([a, t]) => `<button data-act="mk-v-${a}" class="${a === view ? 'on' : ''}">${t}</button>`).join('') + '</div>';
    h += view === 'guv' ? guv.html() : view === 'plc' ? plc.html() : view === 'elek' ? elek.html() : view === 'agac' ? agacHtml() : view === 'liste' ? listeHtml() : view === 'kut' ? kutHtml() : hesapHtml();
    h += '<div class="mk-card mk-n">Ön tasarım hesabıdır. Motor, vida ve rulman değerlerini üreticinin güncel kataloğundan gir; seçim yetkili mühendis onayıyla kesinleşir. Örnek değerler temsilîdir, gerçek ürün değeri değildir.</div></div>';
    return h;
  }
  function input(el) {
    const d = el.dataset;
    if (d.mke) { elek.input(el); return; }
    if (d.mkp) { plc.input(el); return; }
    if (d.mky) { guv.input(el); return; }
    if (d.mk) {
      const [k, key] = d.mk.split('.');
      if (!C()[k] || !(key in C()[k] || SEL[key])) return;
      if (SEL[key]) C()[k][key] = key === 'dinamik' ? el.value === '1' : ['D', 'guv'].includes(key) ? Number(el.value) : el.value;
      else { const v = Number(String(el.value).replace(',', '.')); C()[k][key] = el.value === '' ? NaN : v; }
      changed(); return;
    }
    if (d.mkb) { const [k, slot] = d.mkb.split('.'); if (el.value) P.bag[k][slot] = Number(el.value); else delete P.bag[k][slot]; changed(); return; }
    if (d.mkl) { const x = lib[Number(el.value)]; if (x) { const it = addItem(P, x.kind, x); editId = it.id; view = 'agac'; api.toast('Kütüphaneden eklendi: ' + it.ad); changed(); } return; }
    if (d.mki) {
      const [id, f, sub] = d.mki.split('.'), it = itemById(P, Number(id));
      if (!it) return;
      if (f === 'deger') { const v = Number(String(el.value).replace(',', '.')); if (el.value === '' || !Number.isFinite(v)) delete it.deger[sub]; else it.deger[sub] = v; }
      else if (f === 'adet') { const v = Math.round(Number(el.value)); it.adet = v > 0 ? v : 1; }
      else if (f === 'partId') it.partId = el.value === '' ? null : Number(el.value);
      else it[f] = String(el.value).slice(0, f === 'not' ? 300 : 80) || (f === 'ad' ? KINDS[it.kind].ad : '');
      changed();
    }
  }
  function act(a) {
    let m;
    if ((m = /^mk-v-(\w+)$/.exec(a))) { view = m[1]; api.render(); return true; }
    if (/^mk-e/.test(a) && elek.act(a)) return true;
    if (/^mk-p/.test(a) && plc.act(a)) return true;
    if (/^mk-y/.test(a) && guv.act(a)) return true;
    if ((m = /^mk-k-(\w+)$/.exec(a))) { C().kart = m[1]; changed(); return true; }
    if (a === 'mk-ornek') { const k = C().kart; C()[k] = { ...SAMPLE[k] }; changed(); api.toast('Örnek değerler yüklendi (temsilî)'); return true; }
    if ((m = /^mk-add-(\w+)$/.exec(a))) { const it = addItem(P, m[1]); editId = it.id; changed(); return true; }
    if ((m = /^mk-ed-(\d+)$/.exec(a))) { editId = Number(m[1]) || null; api.render(); return true; }
    if ((m = /^mk-del-(\d+)$/.exec(a))) { removeItem(P, Number(m[1])); if (editId === Number(m[1])) editId = null; changed(); api.toast('Bileşen silindi'); return true; }
    if ((m = /^mk-go-(\d+)$/.exec(a))) { const it = itemById(P, Number(m[1])); if (it && it.partId != null && api.focusPart) api.focusPart(it.partId); return true; }
    if ((m = /^mk-lib-(\d+)$/.exec(a))) { const it = itemById(P, Number(m[1])); if (it) { libAdd(lib, it); saveLib(); api.toast('Kütüphaneye kaydedildi (bu cihazda)'); api.render(); } return true; }
    if ((m = /^mk-luse-(\d+)$/.exec(a))) { const x = lib[Number(m[1])]; if (x) { const it = addItem(P, x.kind, x); editId = it.id; view = 'agac'; changed(); } return true; }
    if ((m = /^mk-ldel-(\d+)$/.exec(a))) { lib.splice(Number(m[1]), 1); saveLib(); api.render(); return true; }
    if (a === 'mk-csv') { api.saveBlob(new Blob([bomCSV(bomRows(P, partName, status()))], { type: 'text/csv;charset=utf-8' }), (api.name() || 'proje') + '_parca_listesi.csv'); api.toast('Parça listesi indirildi'); return true; }
    if (a === 'mk-pdf' || a === 'mk-bompdf') {
      const kinds = a === 'mk-pdf' ? [C().kart] : CARDS.map(([k]) => k).filter((k) => Object.keys(P.bag[k] || {}).length || k === C().kart);
      const lines = [];
      if (a === 'mk-bompdf') {
        lines.push('ÇİZİM ATÖLYESİ — MEKATRONİK MÜHENDİSLİĞİ PARÇA LİSTESİ', api.name() || '', '');
        for (const r of bomRows(P, partName, status())) lines.push(`${r.no}. ${r.ad} — ${r.tur}${r.kod ? ' · ' + r.kod : ''}${r.uretici ? ' · ' + r.uretici : ''} · ${r.adet} adet${r.parca ? ' · parça: ' + r.parca : ''}${r.hesap ? ' · hesap: ' + r.hesap + ' (' + r.durum + ')' : ''}${r.eksik ? ' · EKSİK: ' + r.eksik : ''}`);
        lines.push('');
      }
      for (const k of kinds) {
        const r = run(k);
        if (r.hata) { api.toast('Önce girişleri düzelt: ' + r.hata); return true; }
        const L = reportLines(r, api.name());
        const src = linked(k).kaynak;
        if (Object.keys(src).length) { const at = L.indexOf('HESAP ADIMLARI'); L.splice(at, 0, 'KATALOGDAN GELEN DEĞERLER', ...Object.entries(src).map(([f, n]) => '  ' + ((GIRDI_ADI[f] || [f])[0]) + ' ← ' + n), ''); }
        lines.push(...L, '');
      }
      api.saveBlob(reportPdf(lines), (api.name() || 'proje') + (a === 'mk-pdf' ? '_mekatronik_' + C().kart : '_mekatronik_tum') + '.pdf');
      api.toast('Rapor indirildi');
      return true;
    }
    return false;
  }
  return {
    html, input, act,
    get state() { return C(); },
    getProject: () => JSON.parse(JSON.stringify(P)),
    setProject: (o) => { P = fresh(o); editId = null; },
  };
}

// PDF'e yazılabilir metin (yerleşik yazı tipinde olmayan işaretler okunur karşılıklarıyla)
const PDF_MAP = { 'Ω': 'Ohm', 'ρ': 'ro', 'Δ': 'Delta', 'φ': 'fi', 'μ': 'mu', 'η': 'eta', 'λ': 'lambda', 'α': 'alfa', 'θ': 'teta', 'π': 'pi', 'ω': 'omega', 'Σ': 'toplam', '√': 'kok', '≤': '<=', '≥': '>=', '✓': '[OK]', '✗': '[X]', '⚠': '[!]', 'ℹ': '[i]', '→': '->', '←': '<-', '⟂': '<>', '⁻': '^-', '′': "'", '−': '-', '⁰': '^0', '¹': '^1', '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9', 'Ø': 'Ø' };
export const pdfText = (s) => String(s).replace(/[²³·]/g, (c) => ({ '²': '^2', '³': '^3', '·': '*' }[c])).replace(/[^\u0000-\u00ff\u011e\u011f\u0130\u0131\u015e\u015f\u2026\u2014\u2013]/g, (c) => PDF_MAP[c] ?? '?');
export function reportPdf(lines) {
  const doc = pdfDoc(), W = 210, H = 297, X = 14, maxW = W - 2 * X;
  let pg = null, y = 0, no = 0;
  const newPage = () => { pg = doc.page(W, H); no++; y = H - 16; pg.text(X, 8, 8, pdfText('Çizim Atölyesi - Mekatronik Mühendisliği - sayfa ' + no)); };
  const wrap = (s, size) => { const out = []; let cur = ''; for (const w of s.split(' ')) { const t = cur ? cur + ' ' + w : w; if (t.length * size * 0.19 > maxW && cur) { out.push(cur); cur = '  ' + w; } else cur = t; } out.push(cur); return out; };
  newPage();
  lines.forEach((raw, i) => {
    const s = pdfText(raw), size = i === 0 ? 12 : /^[A-ZÇĞİÖŞÜ ]+$/.test(s.trim()) && s.trim() ? 10 : 8.5;
    for (const ln of wrap(s, size)) { if (y < 16) newPage(); pg.text(X, y, size, ln); y -= size * 0.5; }
    if (!s.trim()) y -= 1;
  });
  return new Blob([doc.build()], { type: 'application/pdf' });
}

const CSS = `.mk{display:block;flex:1 0 100%;width:100%;min-width:0;box-sizing:border-box}.mk *{box-sizing:border-box}.mk-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}.mk-tabs button{flex:1 1 auto;padding:9px 8px;border-radius:9px;border:1px solid #334155;background:#0f172a;color:inherit;font:inherit;font-weight:600}
.mk-tabs button.on{background:#0284c7;border-color:#0284c7;color:#fff}.mk-card{background:rgba(15,23,42,.55);border:1px solid #1f2d47;border-radius:10px;padding:9px 10px;margin:7px 0;font-size:13.5px;line-height:1.45}
.mk-t{font-weight:700}.mk-g{font-weight:700;font-size:12.5px;color:#7dd3fc;margin:10px 0 2px;text-transform:uppercase;letter-spacing:.03em}.mk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.mk-f{display:flex;flex-direction:column;gap:3px;font-size:12.5px}.mk-f i{color:#94a3b8;font-style:normal}.mk-f input,.mk-f select{font:inherit;font-size:14px;padding:7px;border-radius:7px;border:1px solid #334155;background:#0b1220;color:inherit;min-width:0}
.mk-v{font-weight:800;font-size:16px;margin-bottom:4px}.mk-v.ok{color:#22c55e}.mk-v.bad{color:#ef4444}.mk-r{display:flex;justify-content:space-between;gap:8px;border-top:1px solid #1e293b;padding:3px 0}
.mk-c{padding:3px 0}.mk-c.hata{color:#fca5a5;font-weight:600}.mk-c.uyari{color:#fde68a}.mk-c.i{color:#94a3b8}.mk-c.ok{color:#86efac}.mk-s{padding:4px 0;border-top:1px solid #1e293b;font-size:12.5px}.mk-s code{font-size:12px}
.mk-err{color:#fca5a5}.mk-lk{padding:7px;border:1px dashed #0284c7;border-radius:7px;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mk-lk i{color:#94a3b8;font-style:normal;font-size:12px}.mk-it.on{border-color:#0284c7}.mk-ih i{color:#94a3b8;font-style:normal;font-size:12.5px}.mk-im{font-size:12.5px;color:#cbd5e1;margin:4px 0}.mk-dg{background:#7f1d1d!important}.mk-req{color:#f97316}.mk-top button{font-size:13px}.mk-tbl{overflow-x:auto}.mk-tbl table{border-collapse:collapse;width:100%;font-size:12.5px}.mk-tbl th,.mk-tbl td{border-top:1px solid #1e293b;padding:4px;text-align:left;vertical-align:top}.mk-tbl i{color:#94a3b8;font-style:normal}.mk-tbl .bad{color:#fca5a5;font-weight:700}.mk-tbl .ok{color:#86efac}.mk-n{color:#94a3b8;font-size:12.5px}.mk-btns{display:flex;gap:6px;flex-wrap:wrap}.mk-btns button{flex:1 1 auto;padding:10px;border-radius:9px;border:0;background:#1e293b;color:inherit;font:inherit;font-weight:600}`;
