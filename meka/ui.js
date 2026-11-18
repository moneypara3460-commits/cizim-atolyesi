// Mekatronik Mühendisliği — sekme arayüzü (1. aşama: hesap ve seçim motoru).
// api: { render(), toast(m), name(), saveBlob(blob, name) }
// Girdiler bu cihazda saklanır (cizim:meka). Hesaplar meka/calc.js'te; bu dosya yalnız gösterir.
import { screwAxis, bearingLife, pneumatic, pickCylinder, reportLines, SCREW_DEFAULTS, BEARING_DEFAULTS, PNEU_DEFAULTS, SCREW_MOUNT, ISO281_A1, CYL_ROD, BASLIK } from './calc.js?v=20261118c';
import { pdfDoc } from '../tx/pdf.js?v=20261112u';

const KEY = 'cizim:meka';
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
const F_PNEU = [['Silindir', [['D', 'İç çap (standart)'], ['strok', 'Strok', 'mm', 1], ['p', 'Çalışma basıncı', 'bar', 0.5], ['yuk', 'Yük', 'N', 10], ['yon', 'Kuvvet yönü'], ['dinamik', 'Yük tipi'], ['cevrim', 'Çevrim sayısı', '/dk', 1]]]];

const SEL = {
  mount: Object.entries(SCREW_MOUNT).map(([k, v]) => [k, v.ad]),
  tutma: [['motor', 'Motor (tork harcar)'], ['fren', 'Fren']],
  tip: [['bilyali', 'Bilyalı (p = 3)'], ['makarali', 'Makaralı (p = 10/3)']],
  guv: Object.keys(ISO281_A1).map((k) => [k, '%' + k]),
  D: Object.keys(CYL_ROD).map((k) => [k, 'Ø' + k + ' (' + (k <= 25 ? 'ISO 6432' : 'ISO 15552') + ', mil Ø' + CYL_ROD[k] + ')']),
  yon: [['itme', 'İtme'], ['cekme', 'Çekme']],
  dinamik: [['1', 'Hareketli yük (%70 sınırı)'], ['0', 'Sıkma / statik (%85 sınırı)']],
};
const SAMPLE = {   // test projesi: paketleme makinesi dolum ünitesi (temsilî değerler; gerçek katalogla değiştir)
  vida: { ...SCREW_DEFAULTS, m: 18, aci: 90, mu: 0.005, Fdis: 150, P: 10, d: 16, dr: 13.2, L: 450, mount: 'sabit-mesnetli', strok: 200, v: 0.3, ta: 0.12, td: 0.8, tutma: 'motor', i: 1, etaG: 1, Jm: 0.00012, Tn: 1.27, Tmax: 3.8, nmax: 3000 },
  rulman: { ...BEARING_DEFAULTS, C: 9950, Fr: 1200, n: 1800, guv: 95, hedef: 20000 },
  pnomatik: { ...PNEU_DEFAULTS, D: 32, strok: 80, p: 6, yuk: 250, cevrim: 30 },
};

export function createMekaUI(api) {
  const S = load();
  function load() {
    try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && j.vida && j.rulman && j.pnomatik) return { kart: j.kart || 'vida', vida: { ...SCREW_DEFAULTS, ...j.vida }, rulman: { ...BEARING_DEFAULTS, ...j.rulman }, pnomatik: { ...PNEU_DEFAULTS, ...j.pnomatik } }; } catch (e) { /* */ }
    return { kart: 'vida', vida: { ...SAMPLE.vida }, rulman: { ...SAMPLE.rulman }, pnomatik: { ...SAMPLE.pnomatik } };
  }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* gizli sekme */ } };
  const run = (k) => { try { return k === 'vida' ? screwAxis(S.vida) : k === 'rulman' ? bearingLife(S.rulman) : pneumatic({ ...S.pnomatik, d: null, dinamik: !!S.pnomatik.dinamik }); } catch (e) { return { hata: e.message }; } };

  function field(k, [key, label, unit, step]) {
    const v = S[k][key];
    if (SEL[key]) {
      const cur = key === 'dinamik' ? (v ? '1' : '0') : String(v);
      return `<label class="mk-f"><span>${esc(label)}</span><select data-mk="${k}.${key}">${SEL[key].map(([o, t]) => `<option value="${o}"${o === cur ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>`;
    }
    return `<label class="mk-f"><span>${esc(label)}${unit ? ' <i>(' + esc(unit) + ')</i>' : ''}</span><input type="number" inputmode="decimal" step="${step || 'any'}" data-mk="${k}.${key}" value="${v}"></label>`;
  }
  function results(k, r) {
    if (r.hata) return `<div class="mk-card mk-err">⚠ ${esc(r.hata)}</div>`;
    const s = r.sonuc, rows = k === 'vida'
      ? [['Motor devri', nf(s.nM, 0) + ' dev/dk'], ['Vida devri / kritik devir', nf(s.nS, 0) + ' / ' + nf(s.nc, 0) + ' dev/dk'], ['En büyük eksenel kuvvet / burkulma', nf(s.Fmax, 0) + ' / ' + nf(s.Pk, 0) + ' N'],
        ['Yük torku (sabit hız)', nf(s.Tl) + ' N·m'], ['Hızlanma torku', nf(s.Tacc) + ' N·m'], ['En yüksek tork', nf(s.Tpk) + ' N·m'], ['RMS tork', nf(s.Trms) + ' N·m'], ['Atalet oranı', nf(s.ratio, 2) + ' : 1'], ['Çevrim süresi', nf(s.tcyc, 2) + ' s']]
      : k === 'rulman'
        ? [['Eşdeğer yük P', nf(s.P, 0) + ' N'], ['L10', nf(s.L10, 1) + ' milyon devir'], ['L10h', nf(s.L10h, 0) + ' saat'], ['Güvenilirliğe göre (a1 = ' + s.a1 + ')', nf(s.Lnm, 0) + ' saat']]
        : [['İtme kuvveti (teorik)', nf(s.Fi, 0) + ' N'], ['Çekme kuvveti (teorik)', nf(s.Fc, 0) + ' N'], ['Yük oranı', '%' + nf(s.oran * 100, 0)], ['Hava (çevrim başına)', nf(s.Vcyc, 3) + ' NL'], ['Hava tüketimi', nf(s.Q, 1) + ' NL/dk']];
    let h = `<div class="mk-card"><div class="mk-v ${r.uygun ? 'ok' : 'bad'}">${r.uygun ? '✓ UYGUN' : '✗ UYGUN DEĞİL'}</div>` + rows.map(([a, b]) => `<div class="mk-r"><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('') + '</div>';
    h += '<div class="mk-card">' + r.kontroller.map((c) => `<div class="mk-c ${c.ok ? (c.duzey === 'bilgi' ? 'i' : 'ok') : c.duzey}">${c.ok ? (c.duzey === 'bilgi' ? 'ℹ' : '✓') : c.duzey === 'hata' ? '✗' : '⚠'} ${esc(c.metin)}</div>`).join('') + '</div>';
    if (k === 'pnomatik' && !r.uygun) { const p = pickCylinder(S.pnomatik.yuk, S.pnomatik.p, S.pnomatik.yon, !!S.pnomatik.dinamik); h += `<div class="mk-card">💡 ${p ? 'Uygun en küçük standart silindir: <b>Ø' + p.D + ' / mil Ø' + p.d + '</b> (' + p.std + ')' : 'Bu basınçta Ø125\'e kadar uygun standart silindir yok: basıncı artır ya da çift silindir kullan.'}</div>`; }
    h += '<details class="mk-card"><summary>Hesap adımları (formül ve kaynak)</summary>' + r.adimlar.map((a, i) => `<div class="mk-s">${i + 1}. ${esc(a.ad)}<br><code>${esc(a.formul)}</code> = <b>${esc(nf(a.deger, 4))}</b> ${esc(a.birim)} <i>[${esc(a.kaynak)}]</i></div>`).join('') + '</details>';
    return h;
  }
  function html() {
    const k = S.kart, defs = k === 'vida' ? F_SCREW : k === 'rulman' ? F_BEAR : F_PNEU;
    let h = '<style>' + CSS + '</style><div class="mk"><div class="lbl h">Mekatronik Mühendisliği · Hesap ve seçim</div>';
    h += '<div class="mk-tabs">' + [['vida', '⚙ Eksen: motor + vida'], ['rulman', '◎ Rulman ömrü'], ['pnomatik', '⇆ Pnömatik silindir']].map(([a, t]) => `<button data-act="mk-k-${a}" class="${a === k ? 'on' : ''}">${t}</button>`).join('') + '</div>';
    h += `<div class="mk-card mk-t">${esc(BASLIK[k])}</div>`;
    for (const [g, fs] of defs) h += `<div class="mk-g">${esc(g)}</div><div class="mk-grid">` + fs.map((f) => field(k, f)).join('') + '</div>';
    h += results(k, run(k));
    h += `<div class="mk-btns"><button data-act="mk-pdf">📄 Hesap raporu (PDF)</button><button data-act="mk-ornek">↺ Örnek değerler (dolum ünitesi)</button></div>`;
    h += '<div class="mk-card mk-n">Ön tasarım hesabıdır. Motor, vida ve rulman değerlerini üreticinin güncel kataloğundan gir; seçim yetkili mühendis onayıyla kesinleşir. Örnek değerler temsilîdir, gerçek ürün değeri değildir.</div></div>';
    return h;
  }
  function input(el) {
    const [k, key] = (el.dataset.mk || '').split('.');
    if (!S[k] || !(key in S[k] || SEL[key])) return;
    if (SEL[key]) S[k][key] = key === 'dinamik' ? el.value === '1' : ['D', 'guv'].includes(key) ? Number(el.value) : el.value;
    else { const v = Number(String(el.value).replace(',', '.')); S[k][key] = el.value === '' ? NaN : v; }
    save(); api.render();
  }
  function act(a) {
    if (a.startsWith('mk-k-')) { S.kart = a.slice(5); save(); api.render(); return true; }
    if (a === 'mk-ornek') { S[S.kart] = { ...SAMPLE[S.kart] }; save(); api.render(); api.toast('Örnek değerler yüklendi (temsilî)'); return true; }
    if (a === 'mk-pdf') {
      const r = run(S.kart);
      if (r.hata) { api.toast('Önce girişleri düzelt: ' + r.hata); return true; }
      api.saveBlob(reportPdf(reportLines(r, api.name())), (api.name() || 'proje') + '_mekatronik_' + S.kart + '.pdf');
      api.toast('Hesap raporu indirildi');
      return true;
    }
    return false;
  }
  return { html, input, act, get state() { return S; } };
}

// PDF'e yazılabilir metin (yerleşik yazı tipinde olmayan işaretler okunur karşılıklarıyla)
const PDF_MAP = { 'μ': 'mu', 'η': 'eta', 'λ': 'lambda', 'α': 'alfa', 'θ': 'teta', 'π': 'pi', 'ω': 'omega', 'Σ': 'toplam', '√': 'kok', '≤': '<=', '≥': '>=', '✓': '[OK]', '✗': '[X]', '⚠': '[!]', 'ℹ': '[i]', '→': '->', '′': "'", '−': '-', '⁰': '^0', '¹': '^1', '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9', 'Ø': 'Ø' };
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
.mk-err{color:#fca5a5}.mk-n{color:#94a3b8;font-size:12.5px}.mk-btns{display:flex;gap:6px;flex-wrap:wrap}.mk-btns button{flex:1 1 auto;padding:10px;border-radius:9px;border:0;background:#1e293b;color:inherit;font:inherit;font-weight:600}`;
