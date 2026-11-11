// Hazır örnek projeler: tek dokunuşla yüklenir, özellikleri denemek ve öğrenmek için.
// buildExample(key) -> { parts, nextId, sel, name, tip, anim? }
import { newPart } from './logic.js?v=20261111b';

export const EXAMPLES = [
  { key: 'braket', name: 'L braket', icon: '📐', about: 'Kutu + delikler, pah ve yuvarlama. Teknik resim ve Dayanım için iyi örnek.' },
  { key: 'flans', name: 'Flanş', icon: '⚙️', about: 'Daire üzerinde 6 delik (dairesel dizi), göbek ve mil deliği.' },
  { key: 'kutu', name: 'Menteşeli kutu', icon: '📦', about: 'Kabuk (içi boş) kutu ve menteşeli kapak. Hareket sekmesinde kapağı açıp kapat.' },
  { key: 'mil', name: 'Mil ve burç', icon: '🔩', about: 'Eş merkezli eşleşme: mili sürükle, burcun ekseninde kayar.' },
  { key: 'sac', name: 'Sac U kanal', icon: '⌐', about: 'Sac metal: açınım boyu, düz gösterim, açınım DXF ve büküm uyarısı.' },
  { key: 'masa', name: 'Masa iskeleti', icon: '▦', about: 'Kaynak konstrüksiyon: kesim listesi, ağırlık ve yük testi.' },
  { key: 'dirsek', name: 'Boru dirseği', icon: '⤴', about: 'Süpürme: 90° boru dirseği; malzemeye göre büküm yarıçapı uyarısı.' },
];

export function buildExample(key) {
  let id = 1;
  const P = (type, op, o = {}) => Object.assign(newPart(id++, type, op, null), o);
  const parts = [];
  let tip = '', anim = null;
  switch (key) {
    case 'braket': {
      parts.push(P('box', 'add', { name: 'Taban', w: 80, l: 40, h: 6, r: 0, c: 1 }));
      parts.push(P('box', 'add', { name: 'Dikme', w: 6, l: 40, h: 50, x: -37, y: 6 }));
      parts.push(P('box', 'add', { name: 'Destek', w: 20, l: 6, h: 20, x: -24, y: 6, rz: 0 }));
      for (const z of [-10, 10]) parts.push(P('cylinder', 'sub', { name: 'Taban deliği', d: 6.5, h: 8, x: 20, y: -1, z }));
      parts.push(P('cylinder', 'sub', { name: 'Dikme deliği', d: 8.5, h: 8, x: -41, y: 36, z: 0, rz: -90 }));
      tip = 'Resim sekmesinde teknik resim çıkar; Dayanım sekmesinde malzeme seçip yük testi yap.';
      break;
    }
    case 'flans': {
      parts.push(P('cylinder', 'add', { name: 'Flanş', d: 120, h: 12 }));
      parts.push(P('cylinder', 'add', { name: 'Göbek', d: 56, h: 30, y: 12 }));
      parts.push(P('cylinder', 'sub', { name: 'Mil deliği', d: 30, h: 44, y: -1 }));
      for (let k = 0; k < 6; k++) {
        const a = k / 6 * Math.PI * 2;
        parts.push(P('cylinder', 'sub', { name: 'Cıvata deliği ' + (k + 1), d: 11, h: 14, x: Math.round(45 * Math.cos(a) * 1e4) / 1e4, z: Math.round(45 * Math.sin(a) * 1e4) / 1e4, y: -1 }));
      }
      tip = 'Delikler Ø11, 90 mm daire üzerinde. Resim → ✂ Kesit ile A-A kesitine bak.';
      break;
    }
    case 'kutu': {
      parts.push(P('box', 'add', { name: 'Kutu', w: 120, l: 80, h: 50, color: '#a16207' }));
      parts.push(P('box', 'sub', { name: 'Kutu içi', w: 112, l: 72, h: 50, y: 4 }));
      const lid = P('box', 'add', { name: 'Kapak', w: 120, l: 80, h: 6, y: 50, color: '#ca8a04' });
      lid.parent = 1;
      lid.joint = { type: 'hinge', axis: 'x', pv: [0, 50, -40], val: 0 };
      parts.push(lid);
      anim = { ['j' + lid.id]: { on: true, from: 0, to: -105 } };
      tip = 'Hareket sekmesinde ▶ Oynat: kapak arka kenardaki menteşeden açılıp kapanır. 🎬 ile video kaydet.';
      break;
    }
    case 'mil': {
      parts.push(P('tube', 'add', { name: 'Burç', d: 40, di: 20, h: 30, color: '#64748b' }));
      parts.push(P('box', 'add', { name: 'Gövde', w: 90, l: 60, h: 10, y: -10, color: '#334155' }));
      const shaft = P('cylinder', 'add', { name: 'Mil', d: 19.8, h: 90, x: 70, y: 0, color: '#e2e8f0' });
      shaft.mates = [{ t: 'conc', b: 1, pa: [0, 0, 0], na: [0, 1, 0], pb: [0, 0, 0], nb: [0, 1, 0] }];
      parts.push(shaft);
      tip = 'Mil, burçla eş merkezli eşleşmeli: Konum sekmesinden "Sadece yukarı-aşağı" seçip mili sürükle. Montaj sekmesinde eşleşmeyi gör.';
      break;
    }
    case 'sac': {
      parts.push(P('sheet', 'add', { name: 'U kanal', sh: 'U', sa0: -90, seg: [{ L: 30 }, { a: 90, L: 80 }, { a: 90, L: 30 }], st: 2, sr: 2, sw: 120, sk: 0.44, mat: 'celik' }));
      tip = 'Tür sekmesinde 📄 Düz göster ve ⬇ Açınım DXF. İç büküm yarıçapını 0,5 yapıp parça adının yanındaki ⚠ uyarısını gör.';
      break;
    }
    case 'masa': {
      parts.push(P('frame', 'add', { name: 'Masa iskeleti', fr: 'table', pf: 'k40', fw: 1200, fd: 700, fh: 750, fs: 150, mat: 'celik' }));
      tip = 'Tür sekmesinde kesim listesi; Dayanım sekmesinde masaya yük ver (ör. 150 kg).';
      break;
    }
    case 'dirsek': {
      parts.push(P('sweep', 'add', { name: 'Boru dirseği', prof: 'tube', path: 'arc', d: 33.7, di: 28.5, br: 60, ang: 90, s0: 40, s1: 40, mat: 'celik' }));
      tip = 'Ölçü sekmesinde eğri yarıçapını 30 yap: çelik boru için büküm uyarısı çıkar. Dayanım sekmesinde ayrıntısını gör.';
      break;
    }
    default: return null;
  }
  const ex = EXAMPLES.find((e) => e.key === key);
  return { parts, nextId: id, sel: parts[0].id, name: ex ? ex.name : key, tip, anim };
}

// Rehber konuları: { t: başlık, s: [adımlar] }
export const GUIDE = [
  { t: '1. İlk adımlar', s: [
    'Üstteki "+ Kutu", "+ Silindir"… ile parça ekle; alttaki sekmelerden ölçü, konum, döndürme ayarla.',
    'Ekranı tek parmakla döndür, iki parmakla yaklaştır / kaydır. "Sığdır" modeli ekrana sığdırır.',
    'Parça listesinden (yuvarlak düğmeler) parça seç. "Oyuk aç" ile parça diğerlerinden çıkarılır (delik).',
    '↶ Geri / ↷ İleri her işlemi geri alır. 💾 ile projeyi kaydet, ⬇ STL ile 3B yazıcıya gönder.',
  ] },
  { t: '2. Kroki ve şekiller', s: [
    '✎ Kroki: çokgen, dikdörtgen, daire, yay çiz; "Kalınlık ver" ya da "Döndür" ile 3B parça yap.',
    '📐 Kısıt: kenara dokun → yatay, dikey, ölçü kilidi; iki kenar → paralel, dik, eşit, açı.',
    '⤴ Süpürme (boru, yay, vida), ⏢ Loft (şekilden şekle), ⌐ Sac metal, ▦ Konstrüksiyon özel parçalardır.',
  ] },
  { t: '3. 2B çizim ve kağıttan çizim', s: [
    '📝 2B Çizim: AutoCAD gibi çizgi, daire, yay, ölçü; kırp, uzat, ofset, radyus; katmanlar; DXF aç / kaydet.',
    'Dosya → 📷 Fotoğraftan çizim: kağıda çizdiğin çizimin fotoğrafını çek, köşeleri kontrol et, Analiz et, aktar.',
    '📐 Ölçü ver ile çizgilere gerçek ölçülerini yaz; 🧊 3B ile kapalı şekilleri 3B parçaya çevir.',
  ] },
  { t: '4. Montaj ve hareket', s: [
    'Bağ sekmesi: parçayı başka parçaya bağla (sabit, menteşe, kayar).',
    'Montaj sekmesi: iki yüze dokunup kalıcı eşleşme ekle (çakışık, mesafe, paralel, açı, eş merkezli).',
    'Hareket sekmesi: menteşe / kayar / eşleşme değerlerini oynat, 🎬 ile video kaydet.',
  ] },
  { t: '5. Teknik resim, hesap, dayanım', s: [
    'Resim sekmesi: ön / yan / üst / izometrik ya da kesit, gizli çizgiler, delik ölçüleri; PNG ve PDF.',
    'Hesap sekmesi: malzeme seç, hacim, ağırlık, ağırlık merkezi; parça listesi CSV ve DXF.',
    'Dayanım sekmesi: parçanın malzemesi, büküm sınırı uyarıları, yük testi (en fazla taşıyacağı yük).',
  ] },
];
