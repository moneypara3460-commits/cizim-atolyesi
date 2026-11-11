// Akıllı kesim optimizasyonu ekranı (tam ekran). Kullanım: openCutOpt({ fromCad: () => parçalar, name, onClose })
// fromCad dönüşü: [{ profile, material, t, label, len, qty }]  (iskelet parçalarının kesim listesi)
import { PROFILES } from './logic.js?v=20261111c';
import { optimizeCuts, groupKey, remnantChanges, cutPlanRows, pdfFromJpegs, EXTRA_PROFILES, CUT_DEFAULTS } from './cutopt.js?v=20261111c';

const KEY = 'cizim:cutopt';
const MATS = ['Çelik', 'Paslanmaz', 'Alüminyum', 'Galvaniz', 'Pirinç'];
const COLORS = ['#0ea5e9', '#f59e0b', '#22c55e', '#e879f9', '#f43f5e', '#14b8a6', '#a78bfa', '#facc15', '#fb923c', '#60a5fa', '#4ade80', '#f472b6'];
const CSS = `
#co { position: fixed; inset: 0; z-index: 40; background: #0b1220; color: #fff; display: flex; flex-direction: column;
      font-family: system-ui, -apple-system, Roboto, sans-serif; }
#co .top { display: flex; gap: 6px; padding: 8px; align-items: center; }
#co .ttl { flex: 2; text-align: center; font-weight: 700; font-size: 16px; }
#co button { font: inherit; color: #fff; background: #1e293b; border: 0; border-radius: 9px; padding: 11px 8px; font-weight: 600; font-size: 14px; }
#co button.on { background: #0284c7; } #co button.ok { background: #15803d; } #co button.danger { background: #7f1d1d; }
#co button:disabled { opacity: .4; }
#co .tabs { display: flex; padding: 0 8px; }
#co .tabs button { flex: 1; background: transparent; border-radius: 0; color: #94a3b8; border-bottom: 2px solid #1e293b; padding: 10px 2px; font-size: 13.5px; }
#co .tabs button.on { color: #fff; border-bottom-color: #38bdf8; }
#co .body { flex: 1; overflow-y: auto; padding: 8px 10px 16px; }
#co .g { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
#co .g > button { flex: 1 1 44%; min-width: 130px; }
#co .h { font-size: 13px; color: #94a3b8; font-weight: 700; margin: 12px 2px 6px; text-transform: uppercase; letter-spacing: .03em; }
#co label.f { flex: 1 1 44%; min-width: 130px; display: block; }
#co label.f.w { flex: 1 0 100%; }
#co label.f span { display: block; font-size: 12px; color: #94a3b8; margin-bottom: 3px; }
#co input, #co select { box-sizing: border-box; width: 100%; font: inherit; font-size: 16px; color: #fff; background: #1e293b; border: 0; border-radius: 9px; padding: 10px; }
#co .card { background: #111a2e; border: 1px solid #1e293b; border-radius: 12px; padding: 10px; margin-bottom: 10px; }
#co .row { display: flex; justify-content: space-between; gap: 8px; padding: 6px 2px; border-top: 1px solid #1e293b; font-size: 14px; }
#co .row:first-child { border-top: 0; }
#co .row span { color: #94a3b8; }
#co .pc { display: flex; align-items: center; gap: 6px; padding: 6px 0; border-top: 1px solid #1e293b; }
#co .pc .nm { flex: 1; font-size: 15px; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
#co .pc .q { min-width: 44px; text-align: center; font-weight: 700; font-size: 16px; }
#co .pc button { padding: 8px 12px; flex: none; }
#co .big { background: #15803d; font-size: 17px; padding: 14px; width: 100%; margin-top: 8px; }
#co .say { background: #052e1a; border: 1px solid #166534; border-radius: 12px; padding: 12px; font-size: 15.5px; line-height: 1.45; margin-bottom: 10px; }
#co .warn { background: #3b0d0d; border: 1px solid #7f1d1d; border-radius: 10px; padding: 9px; font-size: 14px; margin-bottom: 8px; color: #fecaca; }
#co .note { font-size: 13px; color: #94a3b8; line-height: 1.4; margin: 4px 2px 8px; }
#co .bar { display: flex; height: 44px; border-radius: 6px; overflow: hidden; background: #334155; margin: 8px 0 6px; border: 1px solid #475569; }
#co .seg { display: flex; align-items: center; justify-content: center; flex-direction: column; color: #0b1220; font-weight: 800; font-size: 12px; line-height: 1.05;
           border-right: 2px solid #0b1220; overflow: hidden; white-space: nowrap; min-width: 0; }
#co .seg i { font-style: normal; font-weight: 600; font-size: 10px; opacity: .85; }
#co .rest { display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; color: #cbd5e1; overflow: hidden; white-space: nowrap;
            background: repeating-linear-gradient(45deg, #334155 0 6px, #3f4f66 6px 12px); }
#co .rest.keep { background: repeating-linear-gradient(45deg, #14532d 0 6px, #166534 6px 12px); color: #bbf7d0; }
#co .cl { display: flex; flex-wrap: wrap; gap: 4px 10px; font-size: 14px; }
#co .cl b { display: inline-block; min-width: 20px; height: 20px; line-height: 20px; text-align: center; border-radius: 10px; color: #0b1220; font-size: 12px; margin-right: 3px; }
#co .bh { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; }
#co .bh .n { font-weight: 800; font-size: 15px; }
#co .bh .x { background: #0284c7; border-radius: 8px; padding: 2px 8px; font-size: 12.5px; font-weight: 700; }
#co .bh .rm { background: #166534; border-radius: 8px; padding: 2px 8px; font-size: 12.5px; font-weight: 700; }
#co .toast { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); background: #0f172a; border: 1px solid #334155; padding: 10px 14px; border-radius: 10px; font-size: 14px; z-index: 41; max-width: 90vw; }
`;

const r1 = (v) => Math.round(v * 10) / 10;
const fmt = (v) => String(r1(v)).replace('.', ',');
const mm = (v) => fmt(v) + ' mm';
const money = (v) => { try { return '₺' + Number(v).toLocaleString('tr-TR', { maximumFractionDigits: 2 }); } catch (e) { return '₺' + fmt(v); } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9);

export function profileCatalog() {
  const app = Object.entries(PROFILES).map(([id, v]) => ({ id, ...v }));
  const names = new Set(app.map((p) => p.name));
  return [...app, ...EXTRA_PROFILES.filter((p) => !names.has(p.name))];
}

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  s = s && typeof s === 'object' ? s : {};
  return {
    pieces: Array.isArray(s.pieces) ? s.pieces : [],
    set: { ...CUT_DEFAULTS, ...(s.set || {}) },
    prices: s.prices || {},
    remnants: Array.isArray(s.remnants) ? s.remnants : [],
    form: { pf: 'Kutu 40×40×2', mat: 'Çelik', label: '', len: '', qty: '1', other: '', ...(s.form || {}) },
    remForm: { pf: 'Kutu 40×40×2', mat: 'Çelik', len: '', other: '', ...(s.remForm || {}) },
  };
}

export function openCutOpt(opts = {}) {
  if (!document.getElementById('co-css')) { const st = document.createElement('style'); st.id = 'co-css'; st.textContent = CSS; document.head.appendChild(st); }
  const S = load();
  const cat = profileCatalog();
  const tOf = (name) => (cat.find((p) => p.name === name) || {}).t;
  let tab = S.pieces.length ? 'parts' : 'parts', result = null, resultSaved = false, toastT = 0;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ pieces: S.pieces, set: S.set, prices: S.prices, remnants: S.remnants, form: S.form, remForm: S.remForm })); } catch (e) { /* dolu */ } };

  const root = document.createElement('div');
  root.id = 'co';
  root.innerHTML = `<div class="top"><button data-a="close" class="danger">✕ Kapat</button><div class="ttl">✂ Kesim Optimizasyonu</div><button data-a="help" style="flex:none">❓</button></div>
    <div class="tabs" id="co-tabs"></div><div class="body" id="co-body"></div>`;
  document.body.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);
  const toast = (m) => { clearTimeout(toastT); root.querySelector('.toast')?.remove(); const d = document.createElement('div'); d.className = 'toast'; d.textContent = m; root.appendChild(d); toastT = setTimeout(() => d.remove(), 2800); };

  const keyOf = (p) => groupKey(p.profile, p.material);
  const groupsOfPieces = () => {
    const m = new Map();
    for (const p of S.pieces) { const k = keyOf(p); if (!m.has(k)) m.set(k, []); m.get(k).push(p); }
    return m;
  };
  const profSelect = (k, cur) => `<select data-f="${k}">${cat.map((p) => `<option${p.name === cur ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}<option value="__other"${cur === '__other' ? ' selected' : ''}>Diğer (kendim yazarım)…</option></select>`;
  const matSelect = (k, cur) => `<select data-f="${k}">${MATS.map((m) => `<option${m === cur ? ' selected' : ''}>${m}</option>`).join('')}</select>`;
  const inp = (lbl, k, v, type = 'number', w = false, ph = '') => `<label class="f${w ? ' w' : ''}"><span>${lbl}</span><input type="${type}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''} data-f="${k}" value="${esc(v)}" placeholder="${esc(ph)}"></label>`;

  function render() {
    const tabs = [['parts', '1 · Parçalar'], ['set', '2 · Ayarlar'], ['plan', '3 · Kesim planı'], ['rem', '♻ Artık stok']];
    $('co-tabs').innerHTML = tabs.map(([k, l]) => `<button data-a="tab-${k}"${tab === k ? ' class="on"' : ''}>${l}</button>`).join('');
    let h = '';
    if (tab === 'parts') h = partsView();
    else if (tab === 'set') h = setView();
    else if (tab === 'plan') h = planView();
    else h = remView();
    $('co-body').innerHTML = h;
  }

  /* ---------- 1 · Parçalar ---------- */
  function partsView() {
    let h = '';
    const cadN = opts.fromCad ? opts.fromCad().length : 0;
    h += '<div class="h">Çizimden al</div>';
    h += cadN ? `<div class="g"><button data-a="from-cad" class="on">📐 Çizimdeki profilleri al (${cadN} kalem)</button></div><div class="note">Projedeki kaynak konstrüksiyon (profil iskelet) parçalarının kesim listesi otomatik eklenir. Çizimi değiştirirsen tekrar bas: eski çizim satırları yenileriyle değişir, elle eklediklerin kalır.</div>`
      : '<div class="note">Projede profil iskelet (kaynak konstrüksiyon) yok. Parçaları aşağıdan elle ekleyebilirsin.</div>';
    const F = S.form;
    h += '<div class="h">Elle parça ekle</div><div class="g">' +
      `<label class="f w"><span>Profil</span>${profSelect('pf', F.pf)}</label>` +
      (F.pf === '__other' ? inp('Profil adı (ör. Kutu 100×50×3)', 'other', F.other, 'text', true) : '') +
      `<label class="f"><span>Malzeme</span>${matSelect('mat', F.mat)}</label>` + inp('Parça adı', 'label', F.label, 'text', false, 'ör. A, Dikme') +
      inp('Boy (mm)', 'len', F.len) + inp('Adet', 'qty', F.qty) + '<button data-a="add" class="ok">+ Listeye ekle</button></div>';
    const G = groupsOfPieces();
    h += '<div class="h">Kesilecek parçalar</div>';
    if (!G.size) h += '<div class="note">Liste boş. Çizimden al ya da elle ekle. Denemek için:</div><div class="g"><button data-a="sample">Örnek listeyi yükle (A 1800×4, B 1200×6, C 750×8, D 450×8)</button></div>';
    for (const [k, list] of G) {
      const n = list.reduce((s, p) => s + p.qty, 0), L = list.reduce((s, p) => s + p.qty * p.len, 0);
      h += `<div class="card"><div class="bh"><span class="n">${esc(k)}</span><span style="font-size:13px;color:#94a3b8">${n} parça · ${fmt(L / 1000)} m</span></div>`;
      for (const p of list.slice().sort((a, b) => b.len - a.len)) {
        h += `<div class="pc"><div class="nm"><b>${esc(p.label)}</b> · ${mm(p.len)}${p.src === 'cad' ? ' <span style="color:#38bdf8;font-size:12px">📐</span>' : ''}</div>` +
          `<button data-a="dec" data-id="${p.id}">−</button><span class="q">${p.qty}</span><button data-a="inc" data-id="${p.id}">+</button><button data-a="del" data-id="${p.id}" class="danger">🗑</button></div>`;
      }
      h += '</div>';
    }
    if (G.size) h += '<div class="g"><button data-a="clear-list">🗑 Listeyi temizle</button></div>';
    h += `<button class="big" data-a="run"${S.pieces.length ? '' : ' disabled'}>▶ Optimize et</button>`;
    return h;
  }

  /* ---------- 2 · Ayarlar ---------- */
  function setView() {
    const s = S.set;
    let h = '<div class="h">Kesim</div><div class="g">' + inp('Stok boyu (mm)', 's-stock', s.stock) + inp('Testere kesim payı (mm)', 's-kerf', s.kerf) +
      inp('Uç düzeltme payı (mm)', 's-trim', s.trim) + inp('Saklanacak en kısa artık (mm)', 's-minKeep', s.minKeep) + '</div>' +
      '<div class="note">Testere payı her kesimde kaybolan malzemedir (şerit / daire testere ağzı). Uç düzeltme: her boyun başından kesilen (ezik, kirli uç) pay. Bu boydan uzun kalan parçalar fire sayılmaz, artık stoğa döner.</div>' +
      `<div class="g"><button data-a="tg-rem"${s.useRemnants ? ' class="on"' : ''}>♻ Önce elimdeki artıkları kullan: ${s.useRemnants ? 'evet' : 'hayır'}</button></div>`;
    const keys = [...groupsOfPieces().keys()];
    h += '<div class="h">Profil boy fiyatı (₺ / boy)</div>';
    if (!keys.length) h += '<div class="note">Listeye parça ekleyince her profil için fiyat girebilirsin.</div>';
    else h += '<div class="g">' + keys.map((k) => inp(esc(k), 'price:' + k, S.prices[k] ?? '', 'number', true, 'ör. 850')).join('') + '</div><div class="note">Fiyat girilirse toplam malzeme maliyeti hesaplanır. Fiyat ' + mm(s.stock) + ' boy içindir.</div>';
    h += `<button class="big" data-a="run"${S.pieces.length ? '' : ' disabled'}>▶ Optimize et</button>`;
    return h;
  }

  /* ---------- 3 · Kesim planı ---------- */
  function planView() {
    if (!result) return `<div class="note">Henüz optimizasyon yapılmadı.</div><button class="big" data-a="run"${S.pieces.length ? '' : ' disabled'}>▶ Optimize et</button>`;
    const T = result.total;
    let h = '';
    const buy = result.groups.filter((g) => g.stats.bars).map((g) => `<b>${g.stats.bars} adet</b> ${esc(g.key)}`);
    const remU = T.remnantsUsed ? ` Ayrıca elindeki <b>${T.remnantsUsed} artık</b> parça kullanılıyor.` : '';
    h += '<div class="say">' + (buy.length ? `Bu iş için ${fmt(result.settings.stock / 1000)} metrelik profilden ${buy.join(', ')} satın alman yeterli.` : 'Yeni profil almana gerek yok: hepsi elindeki artıklardan çıkıyor.') + remU +
      (T.priced && T.cost ? ` Malzeme maliyeti: <b>${money(T.cost)}</b>.` : '') +
      (result.groups.every((g) => g.stats.optimal) ? ' <br>✅ Daha az profille yapılamaz (teorik en az boy sayısına ulaşıldı).' : '') + '</div>';
    for (const g of result.groups) {
      const s = g.stats;
      for (const e of g.errors) h += `<div class="warn">⚠ ${esc(g.key)} · ${esc(e.label)} ×${e.qty}: ${esc(e.msg)}</div>`;
      h += `<div class="h">${esc(g.key)}</div><div class="card">` +
        [['Parça sayısı', s.pieces], ['Yeni boy (' + mm(g.stock) + ')', s.bars + ' adet'], ...(s.remnantsUsed ? [['Kullanılan artık', s.remnantsUsed + ' adet']] : []),
          ['Satın alınacak uzunluk', fmt(s.buyLen / 1000) + ' m'], ['Kesilen toplam', fmt(s.cutLen / 1000) + ' m'], ['Testere kaybı', mm(s.kerfLoss)],
          ...(s.trimLoss ? [['Uç düzeltme', mm(s.trimLoss)]] : []), ['Stoğa kalan (kullanılabilir)', mm(s.keepLen)], ['Gerçek fire', mm(s.scrapLen)], ['Fire oranı', '%' + fmt(s.scrapPct)],
          ...(s.price ? [['Maliyet (' + money(s.price) + ' / boy)', money(s.cost)]] : [])]
          .map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('') +
        `<div class="note" style="margin-top:8px">${s.optimal ? '✅ En az boy: ' + s.lowerBound + ' (alt sınır). Daha az profille yapılamaz.' : 'Teorik alt sınır ' + s.lowerBound + ' boy; bu plan ' + s.bars + ' boy. Parça boyları alt sınıra izin vermiyor olabilir.'}</div></div>`;
      // renkler: her parça adına bir renk
      const labels = [...new Set(g.bars.flatMap((b) => b.cuts.map((c) => c.label + '|' + c.len)))];
      const col = (c) => COLORS[labels.indexOf(c.label + '|' + c.len) % COLORS.length];
      for (const pt of g.patterns) {
        const b = g.bars[pt.first], last = g.bars[pt.first + pt.count - 1];
        const title = (b.src === 'remnant' ? '♻ Artık ' : 'PROFİL ') + (pt.count > 1 ? b.no + '–' + last.no : b.no) + ' · ' + mm(b.stockLen);
        h += `<div class="card"><div class="bh"><span class="n">${title}</span>${pt.count > 1 ? `<span class="x">${pt.count} boy aynı kesim</span>` : ''}${b.src === 'remnant' ? '<span class="rm">elindeki artık</span>' : ''}</div>`;
        h += '<div class="bar">';
        if (b.trim) h += `<div class="rest" style="width:${b.trim / b.stockLen * 100}%"></div>`;
        b.cuts.forEach((c, i) => {
          const w = c.len / b.stockLen * 100, wide = w > 9;
          h += `<div class="seg" style="width:${w}%;background:${col(c)}" title="${esc(c.label)} ${fmt(c.len)}">${wide ? fmt(c.len) + '<i>' + (i + 1) + (w > 22 ? ' · ' + esc(c.label) : '') + '</i>' : (w > 4 ? i + 1 : '')}</div>`;
        });
        const restW = Math.max(0, 100 - (b.trim + b.cuts.reduce((x, c) => x + c.len, 0)) / b.stockLen * 100);
        h += `<div class="rest${b.restKind === 'keep' ? ' keep' : ''}" style="flex:1;min-width:${restW > 0.3 ? 4 : 0}px">${restW > 8 ? (b.restKind === 'keep' ? 'KALAN ' : 'FİRE ') + fmt(b.rest) : ''}</div></div>`;
        h += '<div class="cl">' + b.cuts.map((c, i) => `<span><b style="background:${col(c)}">${i + 1}</b>${esc(c.label)} ${fmt(c.len)}</span>`).join('') + '</div>';
        h += `<div class="note" style="margin:6px 0 0">${b.rest > 0 ? `Kalan: <b style="color:${b.restKind === 'keep' ? '#86efac' : '#fca5a5'}">${mm(b.rest)} ${b.restKind === 'keep' ? '→ stoğa (kullanılabilir)' : '→ fire'}</b>` : '<b style="color:#86efac">Kalan yok: boy tam kullanıldı</b>'} · testere kaybı ${mm(b.kerfLoss)}${b.trim ? ' · uç ' + mm(b.trim) : ''}</div></div>`;
      }
    }
    const ch = remnantChanges(result);
    h += '<div class="h">Dışa aktar</div><div class="g"><button data-a="pdf" class="ok">📄 PDF kesim planı</button><button data-a="csv">📋 CSV kesim listesi</button></div>';
    h += '<div class="note">PDF yazdırılabilir: her profilin kesim sırası, parça ölçüleri, kalan boy ve malzeme raporu. Operatöre verilebilir.</div>';
    h += `<div class="h">Kesimden sonra</div><div class="g"><button data-a="commit-rem"${resultSaved || (!ch.add.length && !ch.used.length) ? ' disabled' : ''}>♻ Kesimi yaptım: artık stoğunu güncelle (${ch.add.length} eklenir${ch.used.length ? ', ' + ch.used.length + ' kullanıldı' : ''})</button></div>`;
    h += '<div class="note">' + mm(result.settings.minKeep) + '’den uzun kalanlar artık stoğuna eklenir; plana giren artıklar stoktan düşer. Sonraki işte önce bunlar kullanılır.</div>';
    return h;
  }

  /* ---------- ♻ Artık stok ---------- */
  function remView() {
    let h = '<div class="note">Kesimden kalan, işe yarar boydaki profiller. Yeni optimizasyonda (Ayarlar’da açıksa) yeni boy almadan önce bunlar kullanılır.</div>';
    const m = new Map();
    for (const r of S.remnants) { if (!m.has(r.key)) m.set(r.key, []); m.get(r.key).push(r); }
    if (!m.size) h += '<div class="note"><b>Stokta artık yok.</b></div>';
    for (const [k, list] of m) {
      h += `<div class="card"><div class="bh"><span class="n">${esc(k)}</span><span style="font-size:13px;color:#94a3b8">${list.length} adet · ${fmt(list.reduce((s, r) => s + r.len, 0) / 1000)} m</span></div>`;
      for (const r of list.slice().sort((a, b) => b.len - a.len)) {
        h += `<div class="pc"><div class="nm"><b>${mm(r.len)}</b> · ${esc(r.profile)} · ${esc(r.material)}${r.t ? ' · et ' + fmt(r.t) + ' mm' : ''} · <span style="color:${r.len >= S.set.minKeep ? '#86efac' : '#fca5a5'}">${r.len >= S.set.minKeep ? 'kullanılabilir' : 'kısa'}</span>` +
          `<div style="font-size:12px;color:#64748b">${esc(r.from || '')}${r.date ? ' · ' + esc(r.date) : ''}</div></div><button data-a="rem-del" data-id="${r.id}" class="danger">🗑</button></div>`;
      }
      h += '</div>';
    }
    const F = S.remForm;
    h += '<div class="h">Elle artık ekle</div><div class="g">' + `<label class="f w"><span>Profil</span>${profSelect('rpf', F.pf)}</label>` +
      (F.pf === '__other' ? inp('Profil adı', 'rother', F.other, 'text', true) : '') + `<label class="f"><span>Malzeme</span>${matSelect('rmat', F.mat)}</label>` + inp('Boy (mm)', 'rlen', F.len) +
      '<button data-a="rem-add" class="ok">+ Stoğa ekle</button></div>';
    return h;
  }

  /* ---------- işlemler ---------- */
  function run() {
    if (!S.pieces.length) { toast('Önce parça ekle.'); return; }
    const pieces = S.pieces.map((p) => ({ key: keyOf(p), profile: p.profile, material: p.material, t: p.t, label: p.label, len: p.len, qty: p.qty }));
    result = optimizeCuts(pieces, { ...S.set, stock: Number(S.set.stock) || 6000, prices: S.prices, remnants: S.remnants });
    resultSaved = false;
    tab = 'plan'; render(); $('co-body').scrollTop = 0;
  }
  function fromCad() {
    const list = (opts.fromCad && opts.fromCad()) || [];
    if (!list.length) { toast('Çizimde profil iskelet yok.'); return; }
    S.pieces = S.pieces.filter((p) => p.src !== 'cad').concat(list.map((p) => ({ id: uid(), src: 'cad', profile: p.profile, material: p.material, t: p.t ?? tOf(p.profile), label: p.label, len: r1(p.len), qty: p.qty })));
    save(); render(); toast(list.length + ' kalem çizimden alındı.');
  }
  function addPiece() {
    const F = S.form, len = parseFloat(String(F.len).replace(',', '.')), qty = Math.round(parseFloat(F.qty));
    const prof = F.pf === '__other' ? String(F.other || '').trim() : F.pf;
    if (!prof) { toast('Profil adını yaz.'); return; }
    if (!(len > 0)) { toast('Boyu yaz (mm).'); return; }
    if (!(qty > 0)) { toast('Adet en az 1 olmalı.'); return; }
    const label = String(F.label || '').trim() || String.fromCharCode(65 + (S.pieces.length % 26));
    const same = S.pieces.find((p) => p.src !== 'cad' && keyOf(p) === groupKey(prof, F.mat) && p.label === label && p.len === r1(len));
    if (same) same.qty += qty;
    else S.pieces.push({ id: uid(), src: 'hand', profile: prof, material: F.mat, t: tOf(prof), label, len: r1(len), qty });
    F.len = ''; F.label = ''; F.qty = '1';
    save(); render(); toast(label + ' · ' + mm(len) + ' × ' + qty + ' eklendi.');
  }
  function sample() {
    const pr = 'Kutu 40×40×2', m = 'Çelik';
    S.pieces = [['A', 1800, 4], ['B', 1200, 6], ['C', 750, 8], ['D', 450, 8]].map(([label, len, qty]) => ({ id: uid(), src: 'hand', profile: pr, material: m, t: 2, label, len, qty }));
    save(); render();
  }
  function commitRemnants() {
    if (!result || resultSaved) return;
    const ch = remnantChanges(result), today = new Date().toISOString().slice(0, 10);
    S.remnants = S.remnants.filter((r) => !ch.used.includes(r.id)).concat(ch.add.map((r) => ({ id: uid(), ...r, t: r.t ?? tOf(r.profile), date: today })));
    resultSaved = true; save(); render(); toast(ch.add.length + ' artık stoğa eklendi' + (ch.used.length ? ', ' + ch.used.length + ' artık stoktan düştü' : '') + '.');
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 8000);
  }
  const base = () => String(opts.name || 'kesim').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_');
  function exportCSV() {
    const rows = cutPlanRows(result);
    const csv = '﻿' + rows.map((r) => r.map((v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), base() + '-kesim-plani.csv');
    toast('CSV kesim listesi indirildi.');
  }
  async function exportPDF() {
    toast('PDF hazırlanıyor…');
    try {
      const pages = drawReport(result, opts.name || 'Kesim planı');
      const jp = [];
      for (const c of pages) {
        const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.9));
        jp.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: c.width, h: c.height });
      }
      download(new Blob([pdfFromJpegs(jp)], { type: 'application/pdf' }), base() + '-kesim-plani.pdf');
      toast('PDF kesim planı indirildi (' + pages.length + ' sayfa).');
    } catch (e) { toast('PDF oluşturulamadı: ' + e.message); }
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !b.dataset.a) return;
    const a = b.dataset.a, id = b.dataset.id;
    if (a === 'close') { save(); root.remove(); if (opts.onClose) opts.onClose(); return; }
    if (a === 'help') { toast('1) Parçaları çizimden al ya da elle ekle  2) Testere payı ve fiyatı ayarla  3) Optimize et  4) Planı PDF olarak operatöre ver  5) Kesimden sonra artıkları stoğa ekle.'); return; }
    if (a.startsWith('tab-')) { tab = a.slice(4); render(); return; }
    if (a === 'run') { run(); return; }
    if (a === 'from-cad') { fromCad(); return; }
    if (a === 'add') { addPiece(); return; }
    if (a === 'sample') { sample(); return; }
    if (a === 'clear-list') { if (b.dataset.arm) { S.pieces = []; save(); render(); } else { b.dataset.arm = '1'; b.textContent = '⚠ Emin misin? Tekrar bas'; b.classList.add('danger'); } return; }
    const P = S.pieces.find((p) => p.id === id);
    if (a === 'inc' && P) { P.qty++; save(); render(); return; }
    if (a === 'dec' && P) { if (P.qty > 1) P.qty--; save(); render(); return; }
    if (a === 'del' && P) { S.pieces = S.pieces.filter((p) => p !== P); save(); render(); return; }
    if (a === 'tg-rem') { S.set.useRemnants = !S.set.useRemnants; save(); render(); return; }
    if (a === 'pdf') { exportPDF(); return; }
    if (a === 'csv') { exportCSV(); return; }
    if (a === 'commit-rem') { commitRemnants(); return; }
    if (a === 'rem-del') { S.remnants = S.remnants.filter((r) => r.id !== id); save(); render(); return; }
    if (a === 'rem-add') {
      const F = S.remForm, len = parseFloat(String(F.len).replace(',', '.')), prof = F.pf === '__other' ? String(F.other || '').trim() : F.pf;
      if (!prof || !(len > 0)) { toast('Profil ve boy yaz.'); return; }
      S.remnants.push({ id: uid(), key: groupKey(prof, F.mat), profile: prof, material: F.mat, t: tOf(prof), len: r1(len), from: 'Elle eklendi', date: new Date().toISOString().slice(0, 10) });
      F.len = ''; save(); render(); toast('Artık stoğa eklendi.'); return;
    }
  });
  const onField = (e) => {
    const k = e.target.dataset && e.target.dataset.f;
    if (!k) return;
    const v = e.target.value;
    const formMap = { pf: ['form', 'pf'], mat: ['form', 'mat'], label: ['form', 'label'], len: ['form', 'len'], qty: ['form', 'qty'], other: ['form', 'other'], rpf: ['remForm', 'pf'], rmat: ['remForm', 'mat'], rlen: ['remForm', 'len'], rother: ['remForm', 'other'] };
    if (formMap[k]) { S[formMap[k][0]][formMap[k][1]] = v; if ((k === 'pf' || k === 'rpf') && e.type === 'change') render(); save(); return; }
    if (k.startsWith('s-')) { const n = parseFloat(String(v).replace(',', '.')); if (isFinite(n) && n >= 0) S.set[k.slice(2)] = n; save(); return; }
    if (k.startsWith('price:')) { const n = parseFloat(String(v).replace(',', '.')); if (isFinite(n) && n >= 0) S.prices[k.slice(6)] = n; else delete S.prices[k.slice(6)]; save(); }
  };
  root.addEventListener('input', onField);
  root.addEventListener('change', onField);
  root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.dataset && ['len', 'qty', 'label'].includes(e.target.dataset.f)) { e.preventDefault(); addPiece(); } });

  render();
  return { close: () => root.remove(), run, get result() { return result; }, get state() { return S; } };
}

/* ---------- PDF sayfaları (A4, tuvalde çizilir) ---------- */
export function drawReport(result, title) {
  const W = 1240, H = 1754, M = 70, pages = [];
  let c, g, y;
  const newPage = () => {
    c = document.createElement('canvas'); c.width = W; c.height = H; g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); pages.push(c); y = M;
    g.fillStyle = '#64748b'; g.font = '20px sans-serif'; g.textAlign = 'right';
    g.fillText('Çizim Atölyesi · Kesim planı · sayfa ' + pages.length, W - M, H - 36); g.textAlign = 'left';
  };
  const need = (h) => { if (y + h > H - 80) newPage(); };
  const text = (s, x, size = 26, bold = false, color = '#0f172a', align = 'left') => { g.font = (bold ? 'bold ' : '') + size + 'px sans-serif'; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); g.textAlign = 'left'; };
  newPage();
  text('KESİM PLANI', M, 46, true); y += 40;
  text(title + ' · ' + new Date().toLocaleDateString('tr-TR') + ' · stok ' + fmt(result.settings.stock) + ' mm · testere payı ' + fmt(result.settings.kerf) + ' mm' + (result.settings.trim ? ' · uç ' + fmt(result.settings.trim) + ' mm' : ''), M, 24, false, '#475569'); y += 50;
  // genel rapor
  const T = result.total;
  text('MALZEME RAPORU', M, 30, true); y += 14;
  const rows = [['Toplam parça', T.pieces + ' adet'], ['Satın alınacak boy', T.bars + ' adet'], ...(T.remnantsUsed ? [['Kullanılan artık', T.remnantsUsed + ' adet']] : []),
    ['Satın alınacak uzunluk', fmt(T.buyLen / 1000) + ' m'], ['Kesilen toplam', fmt(T.cutLen / 1000) + ' m'], ['Testere kaybı', mm(T.kerfLoss)],
    ['Stoğa kalan (kullanılabilir)', mm(T.keepLen)], ['Gerçek fire', mm(T.scrapLen)], ...(T.cost ? [['Malzeme maliyeti', money(T.cost)]] : [])];
  for (const [k, v] of rows) { y += 38; g.strokeStyle = '#e2e8f0'; g.beginPath(); g.moveTo(M, y + 12); g.lineTo(W - M, y + 12); g.stroke(); text(k, M, 26, false, '#334155'); text(v, W - M, 26, true, '#0f172a', 'right'); }
  y += 50;
  for (const grp of result.groups) {
    const s = grp.stats;
    need(160);
    g.fillStyle = '#0f172a'; g.fillRect(M, y, W - 2 * M, 54); y += 37;
    text(grp.key, M + 16, 28, true, '#fff');
    text(s.bars + ' boy' + (s.remnantsUsed ? ' + ' + s.remnantsUsed + ' artık' : '') + ' · fire %' + fmt(s.scrapPct) + (s.price ? ' · ' + money(s.cost) : ''), W - M - 16, 24, false, '#cbd5e1', 'right');
    y += 40;
    for (const e of grp.errors) { need(40); text('⚠ ' + e.label + ' ×' + e.qty + ': ' + e.msg, M, 22, false, '#b91c1c'); y += 34; }
    const labels = [...new Set(grp.bars.flatMap((b) => b.cuts.map((x) => x.label + '|' + x.len)))];
    const col = (x) => COLORS[labels.indexOf(x.label + '|' + x.len) % COLORS.length];
    for (const pt of grp.patterns) {
      const b = grp.bars[pt.first], last = grp.bars[pt.first + pt.count - 1];
      const listLines = Math.ceil(b.cuts.length / 3);
      need(150 + listLines * 34);
      y += 34;
      text((b.src === 'remnant' ? 'ARTIK ' : 'PROFİL ') + (pt.count > 1 ? b.no + '–' + last.no : b.no) + ' · ' + fmt(b.stockLen) + ' mm', M, 28, true);
      if (pt.count > 1) text('× ' + pt.count + ' boy aynı kesim', W - M, 26, true, '#0369a1', 'right');
      y += 16;
      const bx = M, bw = W - 2 * M, bh = 64, k = bw / b.stockLen;
      let x = bx;
      g.fillStyle = '#e2e8f0'; g.fillRect(bx, y, bw, bh);
      if (b.trim) { g.fillStyle = '#94a3b8'; g.fillRect(x, y, b.trim * k, bh); x += b.trim * k; }
      b.cuts.forEach((cu, i) => {
        const w = cu.len * k;
        g.fillStyle = col(cu); g.fillRect(x, y, w, bh);
        g.strokeStyle = '#0f172a'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w, y - 6); g.lineTo(x + w, y + bh + 6); g.stroke();
        g.save(); g.beginPath(); g.rect(x, y, w, bh); g.clip();
        g.fillStyle = '#0f172a'; g.textAlign = 'center';
        if (w > 70) { g.font = 'bold 26px sans-serif'; g.fillText(fmt(cu.len), x + w / 2, y + 30); g.font = '18px sans-serif'; g.fillText((i + 1) + ' · ' + cu.label, x + w / 2, y + 54); }
        else { g.font = 'bold 22px sans-serif'; g.fillText(String(i + 1), x + w / 2, y + 40); }
        g.restore(); g.textAlign = 'left';
        x += w + result.settings.kerf * k;
      });
      if (b.rest > 0) { g.fillStyle = b.restKind === 'keep' ? '#bbf7d0' : '#fecaca'; g.fillRect(x, y, bx + bw - x, bh); if (bx + bw - x > 120) { g.fillStyle = '#0f172a'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.fillText((b.restKind === 'keep' ? 'KALAN ' : 'FİRE ') + fmt(b.rest), (x + bx + bw) / 2, y + 40); g.textAlign = 'left'; } }
      g.strokeStyle = '#0f172a'; g.lineWidth = 2; g.strokeRect(bx, y, bw, bh);
      y += bh + 34;
      b.cuts.forEach((cu, i) => {
        const cx = M + (i % 3) * (bw / 3);
        if (i && i % 3 === 0) y += 34;
        g.fillStyle = col(cu); g.beginPath(); g.arc(cx + 14, y - 8, 14, 0, 7); g.fill();
        g.fillStyle = '#0f172a'; g.font = 'bold 18px sans-serif'; g.textAlign = 'center'; g.fillText(String(i + 1), cx + 14, y - 2); g.textAlign = 'left';
        const tx = cu.label + '  ' + fmt(cu.len) + ' mm', room = bw / 3 - 46;
        let fs = 24; g.font = fs + 'px sans-serif';
        while (fs > 14 && g.measureText(tx).width > room) { fs -= 1; g.font = fs + 'px sans-serif'; }
        g.fillText(tx, cx + 36, y, room);
      });
      y += 36;
      text((b.rest > 0 ? 'Kalan: ' + fmt(b.rest) + ' mm → ' + (b.restKind === 'keep' ? 'STOĞA (kullanılabilir)' : 'fire') : 'Kalan yok: boy tam kullanıldı') + '   ·   testere kaybı ' + fmt(b.kerfLoss) + ' mm', M, 22, false, b.restKind === 'keep' ? '#166534' : '#991b1b');
      y += 12;
    }
    y += 30;
  }
  return pages;
}
