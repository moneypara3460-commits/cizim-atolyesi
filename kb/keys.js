// Ortak klavye köprüsü: bir ekranın (kök öğe) düğmelerine tuşla basmak.
// Her ekran bir tuş listesi verir: { key: 'CTRL+Z', label: 'Geri al', press: { k: 'undo' } } ya da { run(root) }.
// Düğmeye basmak, kullanıcının dokunmasıyla aynı yoldan geçer; ekranın kendi kodu değişmez.
// Yardım ekranı (?) ve kısayol değiştirme aynı listeleri kullanır (kb/help.js).

const MOD_ORDER = ['CTRL', 'ALT', 'SHIFT'];
export function keyName(e) {
  let k = String(e.key || '');
  if (!k) return '';
  if (k === ' ') k = 'SPACE';
  else if (k.length === 1) k = k.toLocaleUpperCase('tr-TR') === 'İ' ? 'I' : k.toUpperCase();
  else k = k.toUpperCase();
  const mods = [];
  if (e.ctrlKey || e.metaKey) mods.push('CTRL');
  if (e.altKey) mods.push('ALT');
  // Shift yalnız harf olmayan tuşlarda ve Ctrl'li kısayollarda ayrı sayılır ("?" zaten Shift'lidir)
  if (e.shiftKey && (k.length > 1 || mods.length) && !['SHIFT', 'CONTROL', 'ALT', 'META'].includes(k)) mods.push('SHIFT');
  return [...MOD_ORDER.filter((m) => mods.includes(m)), k].join('+');
}
export const normKey = (s) => String(s).toUpperCase().replace(/\s+/g, '').split('+').sort((a, b) => {
  const ia = MOD_ORDER.indexOf(a), ib = MOD_ORDER.indexOf(b);
  return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
}).join('+');

export function isEditable(t) {
  if (!t) return false;
  const tag = String(t.tagName || '').toLowerCase();
  return t.isContentEditable === true || tag === 'input' || tag === 'textarea' || tag === 'select';
}

const visible = (b) => !b.disabled && !b.hidden && (b.offsetParent !== null || getComputedStyle(b).position === 'fixed');
// kök içinde data-k (ya da data-a) = k, isteğe bağlı data-v = v olan, görünen ilk düğme; nth: aynı türden n'inci
export function findBtn(root, { k, v, a, nth, sel: css }) {
  if (!root) return null;
  const sel = css || (a != null ? `[data-a="${a}"]` : `[data-k="${k}"]` + (v != null ? `[data-v="${v}"]` : ''));
  const list = [...root.querySelectorAll(sel)].filter(visible);
  return nth != null ? list[nth] || null : list[0] || null;
}
export function press(root, spec) {
  const b = findBtn(root, spec);
  if (!b) return false;
  b.click();
  return true;
}

// Kullanıcının değiştirdiği tuşlar: { "<ekran>:<eski tuş>": "<yeni tuş>" } (kb/help.js yazar)
const OVR_KEY = 'cizim:kisayol';
export function loadOverrides() { try { return JSON.parse(localStorage.getItem(OVR_KEY) || '{}') || {}; } catch (e) { return {}; } }
export function saveOverrides(o) { try { localStorage.setItem(OVR_KEY, JSON.stringify(o)); } catch (e) { /* */ } }
export const effectiveKey = (screen, key, ovr = loadOverrides()) => normKey(ovr[screen + ':' + normKey(key)] || key);

// contexts: [{ id, title, root: () => öğe | null, keys: [...], pass? }] — ilk etkin bağlam tuşu alır (üstteki ekran önce).
// pass: bu bağlamda olmayan tuş alttaki bağlama geçer (ör. ayakkabı çizim ekranında sayfa tuşları).
// Tuşta when(root, e): false dönerse tuş bu bağlamda yok sayılır (ör. ekranın kendi işleyicisine bırakılır).
export function installKeys(contexts, { onUnhandled, blocked } = {}) {
  const handler = (e) => {
    if (isEditable(e.target)) {
      if (e.key === 'Escape') { e.target.blur(); e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (blocked && blocked()) return;
    const name = keyName(e);
    if (!name || ['CONTROL', 'SHIFT', 'ALT', 'META'].includes(name.split('+').pop())) return;
    const ovr = loadOverrides();
    for (const c of contexts) {
      const root = c.root();
      if (!root) continue;
      const hit = c.keys.find((x) => effectiveKey(c.id, x.key, ovr) === name && (!x.when || x.when(root, e)));
      if (!hit && c.pass) continue;
      if (!hit) { if (onUnhandled && onUnhandled(e, c, root, name)) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
      if (e.repeat && !hit.repeat) { e.preventDefault(); return; }
      let ok;
      if (hit.run) ok = hit.run(root, e) !== false;
      else if (Array.isArray(hit.press)) ok = hit.press.some((p) => press(root, p));
      else ok = press(root, hit.press);
      if (ok || hit.always) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
  };
  document.addEventListener('keydown', handler, true);
  return () => document.removeEventListener('keydown', handler, true);
}

// Esc zinciri: önce "vazgeç" düğmesi, sonra seç aracı, en son ekranı kapat
export const escChain = (selTool = 'sel') => (root) => {
  if (press(root, { k: 'cancel' })) return true;
  const selBtn = findBtn(root, { k: 'tool', v: selTool });
  if (selBtn && !selBtn.classList.contains('on')) { selBtn.click(); return true; }
  return press(root, { k: 'close' });
};
