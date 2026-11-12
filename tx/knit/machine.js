// Triko makine profilleri, uyumluluk kontrolü ve üretim çıktıları (Aşama 8) — saf modül.
//
// Çıktılar yalnız AÇIK ve bu modülde denetlenebilen biçimlerdir:
//   1. Operatör programı (sıra sayacına göre yazılı talimat) — her makinede.
//   2. Delikli kart şeması (ev tipi, kartlı makine) — delik / boş hücre ızgarası.
//   3. knitout (açık iğne düzeyi biçim, CMU) — V yataklı elektronik makine; yerleşik yapısal benzetimle denetlenir.
// Stoll (M1plus / .sin), Shima Seiki (APEX / .dat), Steiger vb. yerel biçimler kapalı ve lisanslıdır: ÜRETİLMEZ.
// Profil, kullanıcı gerçek makinede numune örüp doğrulayana kadar "doğrulanmamış" sayılır; çıktılar "yalnız numune için" başlığı taşır.
import { STITCHES, get, getC, validateChart } from './chart.js?v=20261112h';

export const MACHINE_KINDS = {
  hand: 'Ev tipi el örgü makinesi (tek plaka, isteğe bağlı ribana plakası)',
  vbed: 'Elektronik düz örgü (V yatak, iki plaka)',
};
export const PATTERNING = { none: 'Desen seçimi yok (elle)', punch24: 'Delikli kart, 24 iğne', punch12: 'Delikli kart, 12 iğne', knitout: 'Elektronik (knitout ara biçimi)' };
// Genel şablonlar: gerçek bir makine DEĞİL; sayılar tipik değer, "tahmini" işaretli. Marka / model ve değerler kullanıcıca girilip doğrulanır.
export const MACHINE_TEMPLATES = [
  { key: 'hand-std', label: 'Ev tipi standart (4,5 mm, 200 iğne, 24\'lük kart)', m: { kind: 'hand', pitch: 4.5, needles: 200, beds: 1, carriers: 2, patterning: 'punch24', maxRack: 0, cardMinRows: 36, lace: 'manual', cable: 'manual' } },
  { key: 'hand-bulky', label: 'Ev tipi kalın (9 mm, 110 iğne, 12\'lik kart)', m: { kind: 'hand', pitch: 9, needles: 110, beds: 1, carriers: 2, patterning: 'punch12', maxRack: 0, cardMinRows: 18, lace: 'manual', cable: 'manual' } },
  { key: 'vbed-e7', label: 'V yatak elektronik, E7 (genel)', m: { kind: 'vbed', pitch: 25.4 / 7, needles: 400, beds: 2, carriers: 6, patterning: 'knitout', maxRack: 4, lace: 'auto', cable: 'auto' } },
  { key: 'vbed-e12', label: 'V yatak elektronik, E12 (genel)', m: { kind: 'vbed', pitch: 25.4 / 12, needles: 600, beds: 2, carriers: 8, patterning: 'knitout', maxRack: 4, lace: 'auto', cable: 'auto' } },
];
export function fromTemplate(key, id = 'mc' + Date.now().toString(36)) {
  const t = MACHINE_TEMPLATES.find((x) => x.key === key); if (!t) throw new Error('Makine şablonu yok: ' + key);
  return { id, name: t.label, brand: '', model: '', ...t.m, template: key, estimated: ['pitch', 'needles', 'carriers', 'maxRack', ...(t.m.cardMinRows ? ['cardMinRows'] : [])], verified: null };
}
export const gaugeLabel = (m) => (m.kind === 'vbed' ? `E${(25.4 / m.pitch).toFixed(1).replace(/\.0$/, '').replace('.', ',')}` : `${String(m.pitch).replace('.', ',')} mm iğne aralığı`);
export const cardWidth = (m) => (m.patterning === 'punch24' ? 24 : m.patterning === 'punch12' ? 12 : 0);

export function validateMachine(m) {
  const e = [];
  if (!MACHINE_KINDS[m.kind]) e.push('Makine türü bilinmiyor');
  if (!(m.pitch > 0)) e.push('İğne aralığı / incelik (gauge) girilmeli');
  if (!(Number.isInteger(m.needles) && m.needles >= 10)) e.push('İğne sayısı en az 10 olmalı');
  if (![1, 2].includes(m.beds)) e.push('Plaka sayısı 1 ya da 2');
  if (m.kind === 'vbed' && m.beds !== 2) e.push('V yataklı makinede 2 plaka olur');
  if (!(Number.isInteger(m.carriers) && m.carriers >= 1)) e.push('Besleyici (iplik taşıyıcı) sayısı en az 1');
  if (!PATTERNING[m.patterning]) e.push('Desen seçim türü bilinmiyor');
  if (m.patterning === 'knitout' && m.kind !== 'vbed') e.push('knitout çıktısı yalnız V yataklı elektronik makine için');
  if ((m.patterning === 'punch24' || m.patterning === 'punch12') && m.kind !== 'hand') e.push('Delikli kart yalnız ev tipi makinede');
  if (!(Number.isInteger(m.maxRack) && m.maxRack >= 0)) e.push('Kaydırma (racking) sınırı 0 ya da pozitif tam sayı');
  return e;
}
// Profil durumu: üretime hazır yalnız kullanıcı gerçek makinede doğruladıysa (marka, model, numune kaydı)
export function machineStatus(m) {
  const errs = validateMachine(m);
  if (errs.length) return { ready: false, level: 'hata', text: 'Profil hatalı: ' + errs.join('; ') };
  if (m.verified && m.verified.sig !== machineSig(m)) return { ready: false, level: 'uyarı', text: `DOĞRULANMAMIŞ PROFİL — ${m.verified.date} doğrulamasından sonra makine değerleri değişti; yeniden numune örüp doğrula` };
  if (!m.verified) return { ready: false, level: 'uyarı', text: `DOĞRULANMAMIŞ PROFİL — çıktı yalnız deneme numunesi içindir${m.brand && m.model ? '' : '; marka / model girilmedi'}${m.estimated?.length ? '; tahmini değerler: ' + m.estimated.join(', ') : ''}` };
  return { ready: true, level: 'ok', text: `Kullanıcı doğrulaması: ${m.verified.date} · ${m.verified.note}` };
}
// doğrulanan değerlerin imzası: doğrulamadan sonra değer değişirse profil yeniden doğrulanmamış sayılır
const SIG = ['kind', 'brand', 'model', 'pitch', 'needles', 'beds', 'carriers', 'patterning', 'maxRack', 'cardMinRows', 'lace', 'cable'];
export const machineSig = (m) => SIG.map((k) => String(m[k] ?? '')).join('|');
export function verifyMachine(m, { date, note }) {
  if (!(m.brand && m.model)) throw new Error('Doğrulama için marka ve model gerekli');
  if (!(String(note || '').trim().length >= 5)) throw new Error('Doğrulama notu gerekli (hangi numune örüldü, ne ölçüldü)');
  const e = validateMachine(m); if (e.length) throw new Error(e.join('; '));
  m.verified = { date: date || new Date().toISOString().slice(0, 10), note: String(note).trim(), sig: machineSig(m) }; m.estimated = [];
  return m;
}

/* ---------- desen sırası sınıflandırma (kart makinesi) ---------- */
// Delikli kartta bir sırada iğneler yalnız iki gruba ayrılır (seçili / seçili değil). Taşıyıcı ayarı bütün kart için tektir.
function rowMode(ch, y) {
  const kinds = new Set(), cols = new Set();
  for (let x = 0; x < ch.w; x++) { const c = get(ch, x, y); kinds.add(c); cols.add(getC(ch, x, y)); }
  const only = (...a) => [...kinds].every((k) => a.includes(k));
  if (only('k') && cols.size <= 2) return cols.size === 2 ? 'fairisle' : 'plain';
  if (only('k', 't') && cols.size === 1) return 'tuck';
  if (only('k', 'm') && cols.size === 1) return 'slip';
  return null;
}
const MODE_LABEL = { plain: 'Düz (desen yok)', fairisle: 'Jakar / fair isle (2 renk)', tuck: 'Askı (tuck)', slip: 'Atlama (slip / part)' };

/* ---------- uyumluluk ---------- */
// what: { chart?, piece?: computePiece sonucu, swatch? }. Dönüş: [{ level, msg }]
export function checkCompat(m, { chart = null, piece = null, swatch = null, rib = null } = {}) {
  const out = [], E = (msg) => out.push({ level: 'hata', msg }), W = (msg) => out.push({ level: 'uyarı', msg });
  for (const e of validateMachine(m)) E(e);
  if (out.length) return out;
  if (piece) {
    const maxW = Math.max(piece.castOn || 0, piece.end || 0);
    if (maxW > m.needles) E(`Parça ${maxW} iğne istiyor; makinede ${m.needles} iğne var`);
    else if (maxW > m.needles - 4) W(`Parça ${maxW} iğne: makine sınırına (${m.needles}) çok yakın`);
    if (piece.ribRows > 0 && m.beds < 2) W('Ribana için ikinci plaka (ribana plakası) yok: ribana elle (tığla kaldırma) yapılır ya da ayrı örülür');
  }
  if (swatch && swatch.st10 > 0) {
    const sw = 100 / swatch.st10, r = sw / m.pitch;
    // kaba kural: örgü ilmek genişliği iğne aralığının yaklaşık 0,5–1,1 katı (sıkılık ayarına göre). Kesin değil, numuneyle doğrulanır.
    if (r < 0.5 || r > 1.1) W(`Numune ilmek genişliği ${sw.toFixed(2).replace('.', ',')} mm, iğne aralığı ${gaugeLabel(m)} (oran ${r.toFixed(2).replace('.', ',')}): bu incelikte örülemeyebilir — numuneyi bu makinede ör`);
  }
  if (chart) {
    for (const v of validateChart(chart, { maxColors: m.carriers })) if (v.level === 'hata') E(v.msg);
    const codes = new Set(chart.st), maxCols = Math.max(...[...Array(chart.h).keys()].map((y) => new Set([...Array(chart.w).keys()].filter((x) => get(chart, x, y) !== 'x').map((x) => getC(chart, x, y))).size));
    if (maxCols > m.carriers) E(`Desende bir sırada ${maxCols} renk; makinede ${m.carriers} besleyici var`);
    if (codes.has('p') && m.beds < 2) E('Ters ilmek (•) tek plakada örülemez: ribana plakası ya da elle çevirme gerekir');
    const hasCable = [...codes].some((c) => STITCHES[c]?.cable), hasLace = ['yo', 'k2t', 'ssk'].some((c) => codes.has(c));
    if (hasCable) { const need = Math.max(...[...codes].filter((c) => STITCHES[c]?.cable).map((c) => STITCHES[c].cable / 2)); if (m.cable === 'auto' && need > m.maxRack) E(`Saç örgüsü ${need} iğne kaydırma istiyor; makine sınırı ${m.maxRack}`); else if (m.cable !== 'auto') W('Saç örgüsü bu makinede elle aktarma (transfer aleti) ile yapılır; operatör programında işaretli'); }
    if (hasLace && m.lace !== 'auto') W('Delik / eksiltme bu makinede elle aktarma ile yapılır; operatör programında işaretli');
    if (m.patterning === 'punch24' || m.patterning === 'punch12') {
      const cw = cardWidth(m), rw = chart.repeat ? chart.repeat.w : chart.w;
      if (cw % rw) E(`Kart ${cw} iğne: desen tekrarı genişliği (${rw}) ${cw}'nin böleni olmalı (1, 2, 3, 4, 6, 8, 12${cw === 24 ? ', 24' : ''})`);
      const modes = new Set(); for (let y = 0; y < chart.h; y++) { const md = rowMode(chart, y); if (!md) { if (!hasCable && !hasLace && !codes.has('p')) E(`Sıra ${y + 1}: kartla seçilemeyen karışım (bir sırada yalnız 2 renk, ya da düz + askı, ya da düz + atlama)`); } else modes.add(md); }
      modes.delete('plain'); if (modes.size > 1) E('Kartta tek taşıyıcı ayarı kullanılır; desende ' + [...modes].map((x) => MODE_LABEL[x]).join(' ve ') + ' karışık');
    }
    if (m.patterning === 'none' && [...codes].some((c) => c !== 'k')) W('Makinede desen seçimi yok: desen iğneleri elle seçilir');
  }
  return out;
}

/* ---------- 1. operatör programı ---------- */
// İğne konumu: ortadan sola L, sağa R (ev tipi makinelerdeki gibi). n iğnenin solda ⌊n/2⌋, sağda kalanı.
export const needleSpan = (n) => { const l = Math.floor(n / 2); return { L: l, R: n - l, text: `L${l} – R${n - l}` }; };
export function operatorProgram(m, { piece, chart = null, swatch = null, name = 'Parça', rib = 'rib11' }) {
  const st = machineStatus(m), lines = [], issues = checkCompat(m, { chart, piece, swatch });
  lines.push(`${name} — operatör programı`, `Makine: ${m.name}${m.brand ? ' · ' + m.brand + ' ' + m.model : ''} · ${gaugeLabel(m)} · ${m.needles} iğne · ${m.beds} plaka`);
  lines.push(st.ready ? st.text : '*** ' + st.text + ' ***');
  if (swatch) lines.push(`Numune: ${swatch.name}, ${swatch.st10} ilmek × ${swatch.row10} sıra / 10 cm. Sıkılık ayarı numunedeki ayarla aynı olmalı.`);
  for (const i of issues) lines.push((i.level === 'hata' ? 'HATA: ' : 'Uyarı: ') + i.msg);
  if (issues.some((i) => i.level === 'hata')) return { lines, ok: false, issues };
  const sp = needleSpan(piece.castOn); lines.push('', `Çalışan iğneler: ${sp.text} (${piece.castOn} iğne). Sıra sayacı (RC) 000.`);
  if (chart) {
    const md = new Set([...Array(chart.h).keys()].map((y) => rowMode(chart, y)).filter((x) => x && x !== 'plain'));
    const cw = cardWidth(m);
    lines.push(`Desen: ${chart.name} (${chart.repeat ? chart.repeat.w + '×' + chart.repeat.h : chart.w + '×' + chart.h} tekrar)${cw ? ` · delikli kart (${cw} iğne), taşıyıcı ayarı: ${[...md].map((x) => MODE_LABEL[x]).join(', ') || 'düz'}` : ''}`);
    if (md.has('fairisle')) lines.push(`Besleyici A: ${chart.palette[0]?.name || 'renk 1'}; besleyici B: ${chart.palette[1]?.name || 'renk 2'} (kart deliği → B rengi).`);
  }
  let rc = 0; const row = (a, b, t) => lines.push(`RC ${String(a).padStart(3, '0')}–${String(b).padStart(3, '0')}: ${t}`);
  if (piece.ribRows) { row(1, piece.ribRows, m.beds >= 2 ? `Ribana ${rib === 'rib22' ? '2×2' : '1×1'} (ribana plakası, iğne düzeni ${rib === 'rib22' ? '2 ön / 2 arka' : '1 ön / 1 arka'})` : `Ribana: tek plakada elle (her ${rib === 'rib22' ? '3. ve 4.' : '2.'} ilmeği tığla ters kaldır) ya da ribanayı ayrı ör`); rc = piece.ribRows; }
  if (piece.kind === 'kol') {
    let last = rc;
    for (const r of piece.steps || []) { if (r - 1 > last) row(last + 1, r - 1, 'düz'); row(r, r, 'her iki yanda 1 iğne artır (boş iğneyi çalışma konumuna al, komşu ilmeği aktar)'); last = r; }
    if (piece.rows > last) row(last + 1, piece.rows, `düz (${piece.end} iğne)`);
    lines.push(`RC ${piece.rows}: ilmekleri kapat. Sonda ${piece.end} iğne (${needleSpan(piece.end).text}).`);
  } else if (piece.kind === 'beden') {
    const nd = piece.rows - (piece.plan.find((x) => /Ön yaka/.test(x.text))?.from ?? piece.rows + 1) + 1, arm = piece.plan.find((x) => /Kol oyuğu/.test(x.text));
    if (arm) { row(rc + 1, arm.from - 1, 'düz'); lines.push(`RC ${String(arm.from).padStart(3, '0')}: iki kenara kol oyuğu işareti (renkli iplik) koy.`); rc = arm.from - 1; }
    const nf = piece.rows - nd + 1;
    row(rc + 1, nf - 1, 'düz');
    lines.push(`RC ${String(nf).padStart(3, '0')}: ön yakada ortadaki ${piece.neckSt} iğneyi (${needleSpan(piece.neckSt).text}) bekleme konumuna al (arka parçada düz devam). Her omuz ${piece.shoulderSt} iğne; omuzları ayrı ayrı ${nd} sıra ör.`);
    lines.push(`RC ${piece.rows}: omuzları atık iplikle çıkar ya da kapat.`);
  } else {
    row(rc + 1, piece.rows - (piece.ribRows || 0), 'desenle'); if (piece.ribRows) row(piece.rows - piece.ribRows + 1, piece.rows, 'ribana'); lines.push(`RC ${piece.rows}: kapat.`);
  }
  if (chart && [...new Set(chart.st)].some((c) => STITCHES[c]?.cable || ['yo', 'k2t', 'ssk'].includes(c)) && (m.cable !== 'auto' || m.lace !== 'auto')) lines.push('', 'Elle aktarmalar: desen şemasındaki saç örgüsü / delik hücrelerinde, o sıradan önce aktarma aletiyle yapılır (şema PDF\'i ile birlikte kullan).');
  lines.push('', 'Bu program hesapla üretilmiştir; ilk parçada ölçü ve sıra sayısını numuneyle karşılaştır.');
  return { lines, ok: true, issues };
}

/* ---------- 2. delikli kart ---------- */
// Dönüş: { width, rows, cells: rows × width (true = delik), mode, notes }. Satır 0 = kartın ilk okunan sırası = desenin 1. sırası.
export function punchCard(m, chart) {
  const cw = cardWidth(m); if (!cw) throw new Error('Bu makinede delikli kart yok');
  const issues = checkCompat(m, { chart }).filter((x) => x.level === 'hata'); if (issues.length) throw new Error(issues.map((x) => x.msg).join('; '));
  const r = chart.repeat || { x: 0, y: 0, w: chart.w, h: chart.h };
  const modes = new Set(); for (let y = r.y; y < r.y + r.h; y++) { const md = rowMode(chart, y); if (md && md !== 'plain') modes.add(md); }
  const mode = [...modes][0] || 'plain';
  const reps = Math.max(1, Math.ceil((m.cardMinRows || 0) / r.h)), rows = r.h * reps, cells = [];
  for (let k = 0; k < rows; k++) {
    const y = r.y + (k % r.h), line = [];
    for (let i = 0; i < cw; i++) {
      const x = r.x + (i % r.w), c = get(chart, x, y);
      line.push(mode === 'fairisle' ? getC(chart, x, y) === 1 : mode === 'tuck' ? c !== 't' : mode === 'slip' ? c !== 'm' : false);
    }
    cells.push(line);
  }
  const notes = [
    `Taşıyıcı ayarı: ${MODE_LABEL[mode]}`,
    mode === 'fairisle' ? 'Delik = B besleyicisi (2. renk), boş = A besleyicisi' : mode === 'tuck' ? 'Delik = düz örer, boş = askı (tuck)' : mode === 'slip' ? 'Delik = düz örer, boş = atlar (slip)' : 'Desen yok: kart gerekmez',
    `Desen tekrarı ${r.w} × ${r.h}; kart ${cw} iğne × ${rows} sıra${reps > 1 ? ` (tekrar ${reps} kez; en az ${m.cardMinRows} sıra${m.estimated?.includes('cardMinRows') ? ', tahmini — kılavuzdan doğrula' : ''})` : ''}`,
    'Kart makinenin arkasından (ters yüzden) okunur ve okuma ile örme arasında sıra farkı olabilir: başlangıç sırasını ve yönünü makine kılavuzuna göre ayarla; asimetrik desende ilk numunede yönü kontrol et.',
    'Fiziksel kart ölçüleri (delik çapı, aralık, kenar delikleri) makineye özeldir: bu şema delik konumlarını gösterir, kesim şablonu olarak kullanmadan önce gerçek kartla karşılaştır.',
  ];
  return { width: cw, rows, cells, mode, notes, status: machineStatus(m) };
}

/* ---------- 3. knitout ---------- */
// Desteklenen: düz (ön), ters (arka plaka), askı, atlama, saç örgüsü (aktarma + kaydırma), 1 sırada en çok besleyici kadar renk (yüzen jakar).
// Desteklenmeyen (açık hata): delik / eksiltme (yo, k2t, ssk), ilmek yok (x).
export function knitout(m, chart, { width = null, rows = null, name = 'Panel' } = {}) {
  if (m.patterning !== 'knitout') throw new Error('knitout yalnız V yataklı elektronik makine profili için');
  const unsup = ['yo', 'k2t', 'ssk', 'x'].filter((c) => chart.st.includes(c)); if (unsup.length) throw new Error('knitout çıktısında desteklenmiyor: ' + unsup.map((c) => STITCHES[c].label).join(', '));
  const issues = checkCompat(m, { chart }).filter((x) => x.level === 'hata'); if (issues.length) throw new Error(issues.map((x) => x.msg).join('; '));
  const r = chart.repeat || { x: 0, y: 0, w: chart.w, h: chart.h };
  const W = width || chart.w, H = rows || chart.h;
  if (W > m.needles - 2) throw new Error(`Panel ${W} iğne; makinede ${m.needles}`);
  // panel hücresi: desen tekrarı döşenir (tekrar yoksa desenin kendisi)
  const cell = (x, y) => { const xx = chart.repeat ? r.x + (x % r.w) : x % chart.w, yy = chart.repeat ? r.y + (y % r.h) : y % chart.h; return { s: get(chart, xx, yy), c: getC(chart, xx, yy) }; };
  // tekrar sınırında saç örgüsü kesilmesin
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const q = cell(x, y); if (STITCHES[q.s]?.cable && x + STITCHES[q.s].cable > W) throw new Error(`Panel genişliği saç örgüsünü kesiyor (sıra ${y + 1}, ilmek ${x + 1}); genişliği tekrarın katı yap`); }
  const st = machineStatus(m), N = (x) => x + 1, o = [];
  o.push(';!knitout-2', `;;Machine: ${m.brand || 'bilinmiyor'} ${m.model || ''}`.trim(), `;;Gauge: ${(25.4 / m.pitch).toFixed(1)}`, `;;Carriers: ${[...Array(m.carriers).keys()].map((i) => i + 1).join(' ')}`, ';;Position: Center');
  o.push(`; Çizim Atölyesi — ${name} · ${W} iğne × ${H} sıra · ${chart.name}`, `; ${st.ready ? st.text : 'DOĞRULANMAMIŞ: ' + st.text}`, '; Açık ara biçim: makine yazılımına (ör. knitout → makine dönüştürücüsü) aktarılmalı; bu uygulama makinede denemedi.');
  const used = [...new Set([...Array(H).keys()].flatMap((y) => [...Array(W).keys()].map((x) => cell(x, y).c)))].sort((a, b) => a - b);
  const car = (c) => c + 1, dir = {}, bed = Array(W).fill('f'); let rack = 0;
  const setRack = (v) => { if (v !== rack) { o.push(`rack ${v}`); rack = v; } };
  const pass = (c, fn) => { const d = dir[c] === '-' ? '+' : '-'; dir[c] = d; const xs = [...Array(W).keys()]; if (d === '-') xs.reverse(); for (const x of xs) fn(x, d); };
  // başlangıç: 1. besleyiciyle ön plakada tek-çift askılı başlangıç + 1 düz sıra
  const c0 = used[0]; o.push(`in ${car(c0)}`, '; başlangıç');
  pass(c0, (x, d) => { if (x % 2 === 0) o.push(`tuck ${d} f${N(x)} ${car(c0)}`); });
  pass(c0, (x, d) => { if (x % 2 === 1) o.push(`tuck ${d} f${N(x)} ${car(c0)}`); });
  pass(c0, (x, d) => o.push(`knit ${d} f${N(x)} ${car(c0)}`));
  const inn = new Set([c0]);
  for (let y = 0; y < H; y++) {
    o.push(`; sıra ${y + 1}`);
    // saç örgüleri: grubu arka plakaya al, kaydırarak çaprazla ön plakaya geri ver
    for (let x = 0; x < W; x++) {
      const S = STITCHES[cell(x, y).s]; if (!S?.cable) continue;
      const h = S.cable / 2, L = [...Array(h).keys()].map((k) => x + k), R = [...Array(h).keys()].map((k) => x + h + k);
      setRack(0); for (const i of [...L, ...R]) { if (bed[i] === 'f') o.push(`xfer f${N(i)} b${N(i)}`); bed[i] = 'b'; }
      // sağa (R): sol grup üstte → önce sol grup ön plakaya geçer; sola (L) tersi. f(n) ↔ b(n − rack)
      const moveL = () => { setRack(h); for (const i of L) o.push(`xfer b${N(i)} f${N(i + h)}`); }, moveR = () => { setRack(-h); for (const i of R) o.push(`xfer b${N(i)} f${N(i - h)}`); };
      if (S.dir === 'R') { moveL(); moveR(); } else { moveR(); moveL(); }
      setRack(0); for (const i of [...L, ...R]) bed[i] = 'f';
    }
    // plaka değişimi (ters ilmek arka plakada örülür)
    setRack(0);
    for (let x = 0; x < W; x++) { const want = cell(x, y).s === 'p' ? 'b' : 'f'; if (bed[x] !== want) { o.push(`xfer ${bed[x]}${N(x)} ${want}${N(x)}`); bed[x] = want; } }
    // her renk ayrı geçiş; diğer rengin iğneleri atlanır (yüzen jakar)
    const colors = [...new Set([...Array(W).keys()].map((x) => cell(x, y).c))].sort((a, b) => a - b);
    for (const c of colors) {
      if (!inn.has(c)) { o.push(`in ${car(c)}`); inn.add(c); }
      pass(c, (x, d) => { const q = cell(x, y); if (q.c !== c) return; if (q.s === 'm') return; o.push(`${q.s === 't' ? 'tuck' : 'knit'} ${d} ${bed[x]}${N(x)} ${car(c)}`); });
    }
  }
  // bitiş: ön plakaya topla, besleyicileri çıkar, düşür (bağlama / kapama makine programında)
  setRack(0); for (let x = 0; x < W; x++) if (bed[x] === 'b') { o.push(`xfer b${N(x)} f${N(x)}`); bed[x] = 'f'; }
  for (const c of [...inn].sort()) o.push(`out ${car(c)}`);
  for (let x = 0; x < W; x++) o.push(`drop f${N(x)}`);
  return { text: o.join('\n') + '\n', width: W, rows: H, carriers: [...inn].map(car), status: st };
}

// knitout yapısal benzetimi: sözdizimi, besleyici giriş / çıkış, iğne aralığı, kaydırma sınırı, aktarma hizası,
// boş iğneye örme / ilmek kaybı. Dönüş: { ok, errors, warnings, ops, rowsOut: [{ row, ops: Map(needle → {op, bed, car}) }] }
export function simulateKnitout(text, m) {
  const errors = [], warnings = [], loops = new Map(), inC = new Set(), rowsOut = []; let rack = 0, ops = 0, row = null, castOn = true, header = false;
  const lines = text.split('\n');
  const parseN = (s) => { const q = /^([fb])(-?\d+)$/.exec(s); return q ? { bed: q[1], n: +q[2], key: q[1] + q[2] } : null; };
  const range = (nd, ln) => { if (nd.n < 1 || nd.n > m.needles) errors.push(`${ln}. satır: iğne ${nd.key} makine dışında (1–${m.needles})`); };
  lines.forEach((raw, i) => {
    const ln = i + 1, s = raw.trim(); if (!s) return;
    if (i === 0) { header = s === ';!knitout-2'; if (!header) errors.push('Başlık ";!knitout-2" değil'); return; }
    if (s.startsWith(';')) { const q = /^; sıra (\d+)$/.exec(s); if (q) { row = { row: +q[1], ops: new Map() }; rowsOut.push(row); castOn = false; } return; }
    const t = s.split(/\s+/), op = t[0]; ops++;
    if (op === 'in' || op === 'out') { const c = t[1]; if (!(+c >= 1 && +c <= m.carriers)) errors.push(`${ln}: besleyici ${c} yok`); if (op === 'in') { if (inC.has(c)) errors.push(`${ln}: besleyici ${c} zaten içeride`); inC.add(c); } else { if (!inC.has(c)) errors.push(`${ln}: besleyici ${c} içeride değil`); inC.delete(c); } return; }
    if (op === 'rack') { rack = +t[1]; if (!Number.isInteger(rack) || Math.abs(rack) > m.maxRack) errors.push(`${ln}: kaydırma ${t[1]} sınır dışı (±${m.maxRack})`); return; }
    if (op === 'knit' || op === 'tuck' || op === 'miss') {
      const d = t[1], nd = parseN(t[2] || ''), c = t[3];
      if (!['+', '-'].includes(d) || !nd || !c) { errors.push(`${ln}: sözdizimi: ${s}`); return; }
      range(nd, ln); if (!inC.has(c)) errors.push(`${ln}: besleyici ${c} içeride değil`);
      if (rack !== 0 && op !== 'miss') warnings.push(`${ln}: kaydırılmış plakada örme`);
      const had = loops.get(nd.key) || 0;
      if (op === 'knit') { if (!had && !castOn) errors.push(`${ln}: boş iğnede örme (${nd.key}) — ilmek kaybı ya da hatalı aktarma`); loops.set(nd.key, 1); }
      if (op === 'tuck') loops.set(nd.key, had + 1);
      if (row && op !== 'miss') row.ops.set(nd.n, { op, bed: nd.bed, car: c });
      return;
    }
    if (op === 'xfer') {
      const a = parseN(t[1] || ''), b = parseN(t[2] || ''); if (!a || !b || a.bed === b.bed) { errors.push(`${ln}: aktarma sözdizimi: ${s}`); return; }
      range(a, ln); range(b, ln);
      const fN = a.bed === 'f' ? a.n : b.n, bN = a.bed === 'b' ? a.n : b.n; if (bN !== fN - rack) errors.push(`${ln}: aktarma hizasız (kaydırma ${rack}: f${fN} karşısı b${fN - rack})`);
      const had = loops.get(a.key) || 0; if (!had) errors.push(`${ln}: boş iğneden aktarma (${a.key})`);
      loops.set(b.key, (loops.get(b.key) || 0) + had); loops.set(a.key, 0); return;
    }
    if (op === 'drop') { const a = parseN(t[1] || ''); if (!a) errors.push(`${ln}: sözdizimi`); else loops.set(a.key, 0); return; }
    errors.push(`${ln}: bilinmeyen komut "${op}"`);
  });
  if (inC.size) errors.push('Sonda içeride kalan besleyici: ' + [...inC].join(', '));
  const left = [...loops.values()].reduce((a, v) => a + v, 0); if (left) warnings.push(`Sonda ${left} ilmek iğnede (düşürülmemiş)`);
  return { ok: !errors.length, errors, warnings, ops, rowsOut };
}
