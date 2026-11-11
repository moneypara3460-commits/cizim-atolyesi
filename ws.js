// Çalışma alanı seçimi: Makine ve Mühendislik (bu sayfa) ya da Tekstil ve Moda (tekstil.html).
// Makine uygulamasının (app.js) hiçbir koduna dokunmaz; yalnız ilk açılışta bir seçim katmanı gösterir
// ve projeler penceresine "Tekstil ve Moda" bağlantısı ekler. Son seçim hatırlanır.
const KEY = 'cizim:workspace';
const q = new URLSearchParams(location.search).get('ws');
let ws = null;
try { ws = localStorage.getItem(KEY); } catch (e) { /* */ }
if (q === 'makine') { try { localStorage.setItem(KEY, 'makine'); } catch (e) { /* */ } ws = 'makine'; }
if (ws === 'tekstil' && q !== 'makine') location.replace('tekstil.html');

const link = document.createElement('a');
link.href = 'tekstil.html'; link.id = 'ws-tx'; link.textContent = '🧵 Tekstil ve Moda çalışma alanına geç';
link.style.cssText = 'display:block;margin-top:10px;padding:10px;border-radius:8px;background:#312e81;color:#fff;text-align:center;font-weight:600;text-decoration:none;font-size:13px';
document.getElementById('dbox')?.appendChild(link);

if (!ws) {
  const o = document.createElement('div');
  o.id = 'ws-pick';
  o.style.cssText = 'position:fixed;inset:0;z-index:50;background:#0f172a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;font-family:system-ui,-apple-system,Roboto,sans-serif;color:#fff';
  const btn = 'width:100%;max-width:380px;padding:22px 16px;border:0;border-radius:14px;color:#fff;font:inherit;font-size:17px;font-weight:700;text-align:left;cursor:pointer';
  o.innerHTML = `<div style="font-size:20px;font-weight:700">Çizim Atölyesi</div><div style="color:#94a3b8;font-size:14px;margin-bottom:6px">Hangi alanda çalışacaksın?</div>
    <button data-ws="makine" style="${btn};background:#0c4a6e">⚙ Makine ve Mühendislik<div style="font-weight:400;font-size:13px;color:#bae6fd;margin-top:4px">2B / 3B CAD, montaj, sac, üretim, CNC, analiz</div></button>
    <button data-ws="tekstil" style="${btn};background:#312e81">🧵 Tekstil ve Moda<div style="font-weight:400;font-size:13px;color:#c7d2fe;margin-top:4px">Dokuma / konfeksiyon ve triko: koleksiyon, beden, malzeme, föy</div></button>
    <div style="color:#64748b;font-size:12px">Seçimin hatırlanır; Projeler (💾) penceresinden diğer alana geçebilirsin.</div>`;
  o.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ws]'); if (!b) return;
    try { localStorage.setItem(KEY, b.dataset.ws); } catch (er) { /* */ }
    if (b.dataset.ws === 'tekstil') location.href = 'tekstil.html'; else o.remove();
  });
  document.body.appendChild(o);
}
