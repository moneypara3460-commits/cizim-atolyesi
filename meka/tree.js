// Mekatronik Mühendisliği — 2. aşama: ürün ağacı, bileşen kütüphanesi, hesap bağlantıları, parça listesi.
// Saf fonksiyonlar (tests/meka.test.mjs). Üretici verisi uydurulmaz: bileşen değerlerini kullanıcı katalogdan girer;
// kütüphane kullanıcının kendi girdiği bileşenlerdir (cihazda saklanır).

// Bileşen türleri ve katalog alanları: [anahtar, etiket, birim, zorunlu]
export const KINDS = {
  motor: { ad: 'Servo / adım motoru', alanlar: [['Jm', 'Rotor ataleti', 'kg·m²', 1], ['Tn', 'Anma torku', 'N·m', 1], ['Tmax', 'En yüksek tork', 'N·m', 1], ['nmax', 'En yüksek devir', 'dev/dk', 1], ['Pn', 'Anma gücü', 'W'], ['U', 'Besleme gerilimi', 'V'], ['In', 'Anma akımı', 'A'], ['fren', 'Frenli (1 = evet)', ''], ['Pf', 'Fren gücü (24 V)', 'W']] },
  reduktor: { ad: 'Redüktör / kayış kasnak', alanlar: [['i', 'Oran (giriş / çıkış devri)', '', 1], ['eta', 'Verim', '', 1], ['J', 'Girişe göre atalet', 'kg·m²'], ['Tmax', 'İzin verilen en yüksek çıkış torku', 'N·m'], ['T2N', 'Anma çıkış torku', 'N·m'], ['n1max', 'İzin verilen giriş devri', 'dev/dk']] },
  vida: { ad: 'Bilyalı vida', alanlar: [['P', 'Hatve', 'mm', 1], ['d', 'Anma çapı', 'mm', 1], ['dr', 'Diş dibi çapı', 'mm', 1], ['L', 'Yataklar arası boy', 'mm', 1], ['eta', 'Verim', '', 1], ['Ca', 'Dinamik yük sayısı', 'N']] },
  kaplin: { ad: 'Kaplin', alanlar: [['J', 'Atalet', 'kg·m²', 1], ['Tn', 'Anma torku', 'N·m']] },
  rulman: { ad: 'Rulman', alanlar: [['C', 'Dinamik yük sayısı C', 'N', 1], ['C0', 'Statik yük sayısı C0', 'N'], ['makarali', 'Makaralı (1 = evet)', ''], ['d', 'İç çap', 'mm'], ['D', 'Dış çap', 'mm'], ['nlim', 'Sınır devir', 'dev/dk']] },
  silindir: { ad: 'Pnömatik silindir', alanlar: [['D', 'İç çap', 'mm', 1], ['dm', 'Mil çapı', 'mm'], ['strok', 'Strok', 'mm']] },
  valf: { ad: 'Valf', alanlar: [['U', 'Bobin gerilimi', 'V'], ['Qn', 'Anma debisi', 'NL/dk'], ['P', 'Bobin gücü', 'W']] },
  sensor: { ad: 'Sensör', alanlar: [['U', 'Besleme gerilimi', 'V'], ['menzil', 'Algılama mesafesi', 'mm'], ['P', 'Güç tüketimi', 'W']] },
  surucu: { ad: 'Sürücü', alanlar: [['In', 'Sürekli çıkış akımı', 'A'], ['Imax', 'En yüksek akım', 'A'], ['U', 'Besleme gerilimi', 'V'], ['Ig', 'Şebeke giriş akımı', 'A']] },
  diger: { ad: 'Diğer', alanlar: [] },
};
// Hesap kartı → hangi bileşen yuvaları beslenir
export const SLOTS = {
  vida: [['motor', 'motor'], ['vida', 'vida'], ['reduktor', 'reduktor'], ['kaplin', 'kaplin']],
  rulman: [['rulman', 'rulman']],
  pnomatik: [['silindir', 'silindir']],
  kayis: [['motor', 'motor'], ['reduktor', 'reduktor'], ['kaplin', 'kaplin']],
  kremayer: [['motor', 'motor'], ['reduktor', 'reduktor'], ['kaplin', 'kaplin']],
  tabla: [['motor', 'motor'], ['reduktor', 'reduktor'], ['kaplin', 'kaplin']],
  reduktor: [['reduktor', 'reduktor']],
  mil: [],
};

const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v, n = 80) => (typeof v === 'string' ? v.slice(0, n) : '');

export const HESAP_ADI = { vida: 'vidalı eksen', kayis: 'kayışlı eksen', kremayer: 'kremayer ekseni', tabla: 'döner tabla', reduktor: 'redüktör', mil: 'mil', rulman: 'rulman', pnomatik: 'pnömatik' };
export function emptyProject() { const bag = {}; for (const k of Object.keys(SLOTS)) bag[k] = {}; return { items: [], bag, nextId: 1 }; }

// Proje verisini temizler (bozuk / eski kayıt uygulamayı çökertmesin)
export function sanitize(o) {
  const P = emptyProject();
  if (!o || typeof o !== 'object') return P;
  const ids = new Set();
  for (const it of Array.isArray(o.items) ? o.items.slice(0, 500) : []) {
    if (!it || !KINDS[it.kind] || !fin(it.id) || ids.has(it.id)) continue;
    const deger = {};
    for (const [k] of KINDS[it.kind].alanlar) if (fin(it.deger?.[k])) deger[k] = it.deger[k];
    P.items.push({ id: it.id, kind: it.kind, ad: str(it.ad) || KINDS[it.kind].ad, kod: str(it.kod), uretici: str(it.uretici), adet: fin(it.adet) && it.adet > 0 ? Math.round(it.adet) : 1, partId: fin(it.partId) ? it.partId : null, deger, not: str(it.not, 300) });
    ids.add(it.id);
  }
  for (const t of Object.keys(SLOTS)) for (const [slot] of SLOTS[t]) { const v = o.bag?.[t]?.[slot]; if (ids.has(v)) P.bag[t][slot] = v; }
  P.nextId = Math.max(fin(o.nextId) ? o.nextId : 1, ...P.items.map((i) => i.id + 1), 1);
  // Hesap girdileri, elektrik, PLC, güvenlik ve benzetim verisi burada yalnız taşınır; ui.js her birini kendi
  // temizleme işleviyle (elekSanitize, plcSanitize, guvSanitize, simSanitize, izSanitize) doğrular.
  for (const k of ['calc', 'elek', 'plc', 'guv', 'sim', 'iz']) if (o[k] && typeof o[k] === 'object') P[k] = o[k];
  return P;
}

export function addItem(P, kind, from = null) {
  if (!KINDS[kind]) throw new Error('Bilinmeyen bileşen türü');
  const it = { id: P.nextId++, kind, ad: from?.ad || KINDS[kind].ad, kod: from?.kod || '', uretici: from?.uretici || '', adet: 1, partId: null, deger: { ...(from?.deger || {}) }, not: '' };
  P.items.push(it);
  return it;
}
export function removeItem(P, id) {
  P.items = P.items.filter((i) => i.id !== id);
  for (const t of Object.keys(P.bag)) for (const s of Object.keys(P.bag[t])) if (P.bag[t][s] === id) delete P.bag[t][s];
}
export const itemById = (P, id) => P.items.find((i) => i.id === id) || null;

// Eksik zorunlu katalog alanları
export function missing(it) { return (KINDS[it.kind]?.alanlar || []).filter(([k, , , req]) => req && !fin(it.deger[k])).map(([k, l]) => l); }

// Hesap girdisine bağlı bileşenlerin katalog değerlerini uygular. Dönüş: { giris, kaynak: { alan: 'Bileşen adı' }, eksik: [...] }
export function applyLinks(tur, giris, P) {
  const out = { ...giris }, kaynak = {}, eksik = [];
  const b = P.bag[tur] || {};
  const use = (slot, map) => {
    const it = itemById(P, b[slot]);
    if (!it) return;
    for (const [from, to, f] of map) {
      const v = it.deger[from];
      if (fin(v)) { out[to] = f ? f(v) : v; kaynak[to] = it.ad + (it.kod ? ' (' + it.kod + ')' : ''); }
    }
    for (const m of missing(it)) eksik.push(it.ad + ': ' + m);
  };
  if (tur === 'vida' || tur === 'kayis' || tur === 'kremayer' || tur === 'tabla') {
    use('motor', [['Jm', 'Jm'], ['Tn', 'Tn'], ['Tmax', 'Tmax'], ['nmax', 'nmax']]);
    if (tur === 'vida') use('vida', [['P', 'P'], ['d', 'd'], ['dr', 'dr'], ['L', 'L'], ['eta', 'etaS']]);
    use('reduktor', [['i', 'i'], ['eta', 'etaG']]);
    // kaplin ve redüktör giriş ataleti motor milinde toplanır
    const k = itemById(P, b.kaplin), r = itemById(P, b.reduktor);
    const Jk = k && fin(k.deger.J) ? k.deger.J : null, Jr = r && fin(r.deger.J) ? r.deger.J : null;
    if (Jk != null || Jr != null) { out.Jc = (Jk || 0) + (Jr || 0); kaynak.Jc = [k && Jk != null ? k.ad : '', r && Jr != null ? r.ad : ''].filter(Boolean).join(' + '); }
    if (k) for (const m of missing(k)) eksik.push(k.ad + ': ' + m);
    const m = itemById(P, b.motor);
    if (m && m.deger.fren === 1) { out.tutma = 'fren'; kaynak.tutma = m.ad; }
  } else if (tur === 'reduktor') {
    use('reduktor', [['i', 'i'], ['eta', 'eta'], ['T2N', 'T2N'], ['Tmax', 'T2max'], ['n1max', 'n1max']]);
  } else if (tur === 'rulman') {
    use('rulman', [['C', 'C'], ['makarali', 'tip', (v) => (v === 1 ? 'makarali' : 'bilyali')]]);
  } else if (tur === 'pnomatik') {
    use('silindir', [['D', 'D'], ['strok', 'strok']]);
  }
  return { giris: out, kaynak, eksik };
}

// Bağlı bileşenlerin hesaba göre ek kontrolleri (hesap sonucuyla)
export function linkChecks(tur, r, P) {
  const out = [], b = P.bag[tur] || {};
  if (!r || r.hata) return out;
  const red = itemById(P, b.reduktor);
  if (['vida', 'kayis', 'kremayer', 'tabla'].includes(tur) && red && fin(red.deger.Tmax)) {
    // redüktör çıkış torku = motor torku × i × η
    const Tout = r.sonuc.Tpk * r.giris.i * r.giris.etaG;
    out.push({ ok: Tout <= red.deger.Tmax, duzey: 'hata', metin: `Redüktör çıkışında tepe tork ${Tout.toFixed(2)} N·m, izin verilen ${red.deger.Tmax} N·m (${red.ad})` });
  }
  const kap = itemById(P, b.kaplin);
  if (['vida', 'kayis', 'kremayer', 'tabla'].includes(tur) && kap && fin(kap.deger.Tn)) out.push({ ok: r.sonuc.Tpk <= kap.deger.Tn, duzey: 'hata', metin: `Kaplinden geçen tepe tork ${r.sonuc.Tpk.toFixed(2)} N·m, kaplin anma torku ${kap.deger.Tn} N·m (${kap.ad})` });
  const ru = itemById(P, b.rulman);
  if (tur === 'rulman' && ru && fin(ru.deger.nlim)) out.push({ ok: r.giris.n <= ru.deger.nlim, duzey: 'hata', metin: `Devir ${r.giris.n} dev/dk, rulman sınır devri ${ru.deger.nlim} dev/dk (${ru.ad})` });
  if (tur === 'rulman' && ru && fin(ru.deger.C0)) {
    const P0 = Math.max(r.giris.Fr, 0.6 * r.giris.Fr + 0.5 * r.giris.Fa);   // bilyalı radyal rulman için ISO 76 yaklaşık eşdeğer statik yük
    if (ru.deger.makarali !== 1) out.push({ ok: ru.deger.C0 / P0 >= 1, duzey: 'uyari', metin: `Statik güvenlik s0 = C0 / P0 = ${(ru.deger.C0 / P0).toFixed(2)} (≥ 1 normal çalışma; darbeli yükte üretici değeri esas) — P0 = max(Fr, 0,6·Fr + 0,5·Fa)` });
  }
  return out;
}

// Parça listesi (BOM): türe göre sıralı, model parçasıyla ve hesap durumuyla
export function bomRows(P, partName = () => '', calcStatus = {}) {
  const usedBy = (id) => Object.entries(P.bag).filter(([, s]) => Object.values(s).includes(id)).map(([t]) => t);
  const order = Object.keys(KINDS);
  return [...P.items].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.id - b.id).map((it, i) => {
    const used = usedBy(it.id);
    const st = used.map((t) => calcStatus[t]).filter((v) => v != null);
    return {
      no: i + 1, tur: KINDS[it.kind].ad, ad: it.ad, kod: it.kod, uretici: it.uretici, adet: it.adet,
      parca: it.partId != null ? partName(it.partId) || '(silinmiş parça)' : '',
      hesap: used.length ? used.map((t) => HESAP_ADI[t] || t).join(', ') : '',
      durum: !used.length ? '—' : st.includes(false) ? 'UYGUN DEĞİL' : st.length ? 'uygun' : '—',
      eksik: missing(it).join(', '),
    };
  });
}
export function bomCSV(rows) {
  const head = ['No', 'Tür', 'Ad', 'Ürün kodu', 'Üretici', 'Adet', 'Model parçası', 'Hesap', 'Durum', 'Eksik katalog bilgisi'];
  const q = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return '\ufeff' + [head, ...rows.map((r) => [r.no, r.tur, r.ad, r.kod, r.uretici, r.adet, r.parca, r.hesap, r.durum, r.eksik])].map((l) => l.map(q).join(';')).join('\r\n') + '\r\n';
}

// Kütüphane (cihazda): aynı kod + tür tekrar eklenmez, günceller
export function libAdd(lib, it) {
  const e = { kind: it.kind, ad: it.ad, kod: it.kod, uretici: it.uretici, deger: { ...it.deger } };
  const i = lib.findIndex((x) => x.kind === e.kind && ((e.kod && x.kod === e.kod) || (!e.kod && x.ad === e.ad)));
  if (i >= 0) lib[i] = e; else lib.push(e);
  return lib;
}
export function libSanitize(a) { return (Array.isArray(a) ? a : []).filter((x) => x && KINDS[x.kind]).slice(0, 1000).map((x) => sanitize({ items: [{ ...x, id: 1 }] }).items[0]).map(({ id, adet, partId, not, ...r }) => r); }
