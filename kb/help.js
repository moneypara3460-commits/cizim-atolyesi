// Klavye yardım ekranı (? ya da F1): bölümün bütün tuşları ve komutları, aramayla. Yalnız okunur: tuşlar sabittir.
// Bölüm: { id, title, items: [{ key?, label, cmd?, note? }] } — key: tuş, cmd: yazılı komut
import { normKey, isEditable } from './keys.js?v=20261123a';

const NICE = { ESCAPE: 'Esc', DELETE: 'Delete', ENTER: 'Enter', BACKSPACE: 'Backspace', PAGEDOWN: 'PageDown', PAGEUP: 'PageUp', SPACE: 'Boşluk', CTRL: 'Ctrl', SHIFT: 'Shift', ALT: 'Alt', ARROWUP: '↑', ARROWDOWN: '↓', ARROWLEFT: '←', ARROWRIGHT: '→' };
export const niceKey = (k) => normKey(k).split('+').map((p) => NICE[p] || p).join('+');

const CSS = `
#kbh { position: fixed; inset: 0; z-index: 10050; background: rgba(2,6,23,.86); display: flex; align-items: flex-start; justify-content: center; font-family: system-ui, -apple-system, Roboto, sans-serif; }
#kbh .bx { margin-top: 4vh; width: min(760px, calc(100vw - 20px)); max-height: 92vh; display: flex; flex-direction: column; background: #0f172a; color: #e2e8f0; border: 1px solid #334155; border-radius: 14px; box-shadow: 0 18px 60px #000a; }
#kbh .hd { display: flex; gap: 8px; align-items: center; padding: 12px 12px 8px; }
#kbh .hd b { flex: 1; font-size: 16px; }
#kbh input { flex: 1 1 100%; box-sizing: border-box; font: inherit; font-size: 15px; color: #fff; background: #1e293b; border: 1px solid #475569; border-radius: 9px; padding: 9px 11px; margin: 0 12px 8px; width: calc(100% - 24px); }
#kbh .ls { overflow: auto; padding: 0 12px 10px; }
#kbh h3 { margin: 12px 0 4px; font-size: 12px; letter-spacing: .06em; color: #94a3b8; text-transform: uppercase; }
#kbh .rw { display: flex; gap: 10px; align-items: center; padding: 6px 4px; border-bottom: 1px solid #1e293b; font-size: 14px; }
#kbh .rw .lb { flex: 1; } #kbh .rw .nt { color: #94a3b8; font-size: 12px; }
#kbh kbd { font: 600 12.5px ui-monospace, Menlo, Consolas, monospace; background: #1e293b; border: 1px solid #475569; border-bottom-width: 2px; border-radius: 6px; padding: 2px 7px; white-space: nowrap; }
#kbh button { font: inherit; font-size: 12.5px; font-weight: 600; color: #fff; background: #1e293b; border: 1px solid #334155; border-radius: 7px; padding: 5px 9px; cursor: pointer; }
#kbh .ft { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #1e293b; align-items: center; }
#kbh .ft .msg { flex: 1; font-size: 12.5px; color: #94a3b8; }
`;

export function openHelp({ title = 'Klavye kısayolları', sections } = {}) {
  closeHelp();
  if (!document.getElementById('kbh-css')) { const st = document.createElement('style'); st.id = 'kbh-css'; st.textContent = CSS; document.head.appendChild(st); }
  const root = document.createElement('div');
  root.id = 'kbh'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', title);
  root.innerHTML = `<div class="bx"><div class="hd"><b></b><button type="button" data-h="close">✕ Kapat (Esc)</button></div>
    <input type="search" placeholder="Ara: geri al, çizgi, Ctrl+P…" autocomplete="off" spellcheck="false" aria-label="Kısayol ara">
    <div class="ls"></div><div class="ft"><span class="msg">Bilmediğin bir iş için yukarıya adını yaz. Ayrıntılı anlatım: Kullanma Kılavuzu.</span></div></div>`;
  root.querySelector('b').textContent = title;
  document.body.appendChild(root);
  const q = root.querySelector('input'), ls = root.querySelector('.ls');
  const fold = (s) => String(s || '').toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
  function render() {
    const f = fold(q.value.trim());
    ls.replaceChildren();
    for (const sec of sections) {
      const rows = sec.items.filter((it) => !f || fold([it.label, it.cmd, it.note, it.key && niceKey(it.key)].join(' ')).includes(f));
      if (!rows.length) continue;
      const h = document.createElement('h3'); h.textContent = sec.title; ls.appendChild(h);
      for (const it of rows) {
        const rw = document.createElement('div'); rw.className = 'rw';
        const kb = document.createElement('kbd'); kb.textContent = it.key ? niceKey(it.key) : it.cmd;
        const lb = document.createElement('span'); lb.className = 'lb'; lb.textContent = it.label;
        if (it.note) { const nt = document.createElement('span'); nt.className = 'nt'; nt.textContent = ' · ' + it.note; lb.appendChild(nt); }
        rw.append(kb, lb);
        ls.appendChild(rw);
      }
    }
    if (!ls.children.length) { const p = document.createElement('p'); p.textContent = 'Sonuç yok.'; p.style.color = '#94a3b8'; ls.appendChild(p); }
  }
  const onKey = (e) => {
    if (!root.isConnected) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); closeHelp(); return; }
    // yardım açıkken alttaki ekranlar tuş almaz; arama kutusuna yazı serbest (varsayılan davranış sürer)
    e.stopImmediatePropagation();
  };
  // window yakalama aşaması: sayfanın document dinleyicilerinden önce çalışır
  window.addEventListener('keydown', onKey, true);
  root._off = () => window.removeEventListener('keydown', onKey, true);
  root.addEventListener('click', (e) => {
    if (e.target === root) { closeHelp(); return; }
    const b = e.target.closest('button'); if (b && b.dataset.h === 'close') closeHelp();
  });
  q.addEventListener('input', render);
  render();
  // telefonda klavye kendiliğinden açılıp listeyi kapatmasın: arama kutusuna yalnız fiziksel klavyeli cihazda odaklan
  if (matchMedia('(pointer: fine)').matches) setTimeout(() => q.focus(), 0);
  return root;
}
export function closeHelp() { const o = document.getElementById('kbh'); if (o) { if (o._off) o._off(); o.remove(); } }
export const helpOpen = () => !!document.getElementById('kbh');

// ? ya da F1: yardım (yazı alanı dışında). getArgs() → openHelp argümanları ya da null (o anda yardım yok)
export function installHelpKey(getArgs) {
  const h = (e) => {
    if (helpOpen() || isEditable(e.target)) return;
    if (!(e.key === '?' || e.key === 'F1') || e.ctrlKey || e.metaKey || e.altKey) return;
    const a = getArgs(); if (!a) return;
    e.preventDefault(); e.stopImmediatePropagation(); openHelp(a);
  };
  window.addEventListener('keydown', h, true);
  return () => window.removeEventListener('keydown', h, true);
}

// kb/keys.js bağlamlarından yardım bölümleri (aynı etiketli tekrarlar tek satır)
export function sectionsFromContexts(contexts) {
  return contexts.map((c) => {
    const seen = new Set(), items = [];
    for (const k of c.keys) { const id = k.label + '|' + normKey(k.key); if (seen.has(id)) continue; seen.add(id); items.push({ key: k.key, label: k.label }); }
    return { id: c.id, title: c.title, items };
  });
}
