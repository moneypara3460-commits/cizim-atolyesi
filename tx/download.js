// Dosya indirme (blob). Bağlantı tıklandıktan hemen sonra kaldırılırsa bazı tarayıcılar dosya adını kaybeder ("download"):
// bağlantı bir süre sayfada kalır, sonra kaldırılır; adres 30 s sonra serbest bırakılır.
// Dosya adı ASCII'ye çevrilir: Türkçe harfli adlarda bazı tarayıcılar adı tamamen düşürüp "download" yazıyor.
const TRMAP = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U' };
export const asciiName = (s) => String(s).replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TRMAP[c]).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w. -]+/g, '_').replace(/\s+/g, '-') || 'dosya';
export function saveBlob(blob, name) {
  name = asciiName(name);
  const u = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = u; a.download = name; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a); a.click();
  setTimeout(() => a.remove(), 1500); setTimeout(() => URL.revokeObjectURL(u), 30000);
}
export const safeName = (s) => asciiName(s);
