// 3B görüntüleyici (three.js, isteğe bağlı yüklenir): vücut formu + giysi kabuğu (bolluk renkli) ya da dökülmüş numune.
// Görüntü ÖNİZLEMEDİR: vücut formu basitleştirilmiş, giysi kabuğu kalıp çevrelerinden kurulan elips halkalarıdır (kumaş fiziği yok).
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COL = { ok: 0x22c55e, uyarı: 0xf59e0b, hata: 0xef4444, bilgi: 0x94a3b8 };

export async function open3D({ title, paneHTML, build, onClose }) {
  const root = document.createElement('div'); root.id = 'v3x';
  root.innerHTML = `<style>#v3x{position:fixed;inset:0;z-index:30;background:#0b1222;display:flex;flex-direction:column}#v3x .bar{display:flex;gap:6px;padding:6px;align-items:center;flex:none}#v3x .cv{flex:1;position:relative;min-height:160px}#v3x canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}#v3x .pane{flex:none;max-height:40vh;overflow-y:auto;padding:6px 8px 10px;background:#0f172a;border-top:1px solid #1e293b}#v3x .tag{position:absolute;left:8px;top:6px;font-size:12px;font-weight:700;color:#fbbf24;pointer-events:none}</style>
    <div class="bar"><button data-k="close">✕ Kapat</button><b style="flex:1;font-size:14px">${esc(title)}</b></div><div class="cv"><div class="tag">ÖNİZLEME</div></div><div class="pane">${paneHTML}</div>`;
  document.body.appendChild(root);
  const cv = root.querySelector('.cv'); let stop = () => {}, api = { ready: false };
  root.api = api;
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-k="close"]'); if (b) { stop(); root.remove(); onClose && onClose(); } });
  try {
    const THREE = await import('three'), { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
    const ren = new THREE.WebGLRenderer({ antialias: true }); ren.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); cv.appendChild(ren.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b1222);
    const cam = new THREE.PerspectiveCamera(40, 1, 1, 20000); scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 1.1)); const dl = new THREE.DirectionalLight(0xffffff, 0.8); dl.position.set(1, 2, 1.5); scene.add(dl);
    const ctl = new OrbitControls(cam, ren.domElement); ctl.enableDamping = true;
    const info = build(THREE, scene); cam.position.set(...info.cam); ctl.target.set(...info.target); ctl.update();
    const fit = () => { const r = cv.getBoundingClientRect(); ren.setSize(Math.max(1, r.width), Math.max(1, r.height), false); cam.aspect = Math.max(1, r.width) / Math.max(1, r.height); cam.updateProjectionMatrix(); };
    const ro = new ResizeObserver(fit); ro.observe(cv); fit();
    let raf = 0; const loop = () => { ctl.update(); ren.render(scene, cam); raf = requestAnimationFrame(loop); }; loop();
    stop = () => { cancelAnimationFrame(raf); ro.disconnect(); ren.dispose(); };
    Object.assign(api, { ready: true, meshes: scene.children.filter((o) => o.isMesh).length });
  } catch (e) { cv.innerHTML = `<div class="issue uyarı" style="margin:10px">3B görüntü açılamadı (${esc(e.message)}). Hesap sonuçları aşağıda geçerli.</div>`; Object.assign(api, { ready: false, error: e.message }); }
  return root;
}
// halka dizisinden (her biri {z, a, b}) loft yüzeyi
function loft(THREE, rings, seg = 48) {
  const pos = [], idx = [];
  rings.forEach((r) => { for (let k = 0; k < seg; k++) { const t = (k / seg) * Math.PI * 2; pos.push(r.a * Math.cos(t), r.z, r.b * Math.sin(t)); } });
  for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < seg; k++) { const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = a + seg, d = b + seg; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
}
// vücut + giysi kabuğu. garment: [{ z, a, b, level }]
export function fitScene(body, garment) {
  return (THREE, scene) => {
    scene.add(new THREE.Mesh(loft(THREE, body.rings), new THREE.MeshStandardMaterial({ color: 0xd6c3a8, roughness: 0.8, side: THREE.DoubleSide })));
    const gm = loft(THREE, garment), col = [], seg = 48;
    garment.forEach((r) => { const c = new THREE.Color(COL[r.level] || COL.bilgi); for (let k = 0; k < seg; k++) col.push(c.r, c.g, c.b); });
    gm.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    scene.add(new THREE.Mesh(gm, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.9 })));
    const zc = (body.rings[0].z + body.rings.at(-1).z) / 2; return { cam: [0, zc + 200, 2200], target: [0, zc, 0] };
  };
}
// dökülmüş numune (m → mm)
export function drapeScene(res) {
  return (THREE, scene) => {
    const n = res.pos.x.length, pos = new Float32Array(n * 3); for (let k = 0; k < n; k++) { pos[3 * k] = res.pos.x[k] * 1000; pos[3 * k + 1] = res.pos.z[k] * 1000; pos[3 * k + 2] = res.pos.y[k] * 1000; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setIndex(res.tris); g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x60a5fa, side: THREE.DoubleSide, roughness: 0.85 })));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(90, 90, 5, 48), new THREE.MeshStandardMaterial({ color: 0x475569 })); disc.position.y = -3; scene.add(disc);
    return { cam: [0, 380, 420], target: [0, -40, 0] };
  };
}
