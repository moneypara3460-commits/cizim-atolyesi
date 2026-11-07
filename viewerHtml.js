// 3D görüntüleyici: WebView / iframe içinde çalışan Three.js + three-bvh-csg sayfası.
// Uygulama (App.js) buraya parça listesini gönderir, sayfa modeli çizer.

const HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; background: #0f172a; }
  canvas { display: block; touch-action: none; }
  #msg { position: absolute; top: 40%; width: 100%; text-align: center; padding: 0 12px;
         box-sizing: border-box; pointer-events: none;
         color: #94a3b8; font-family: sans-serif; font-size: 14px; }
</style>
<script type="importmap">
{ "imports": {
  "three": "https://unpkg.com/three@0.160.0/build/three.module.js",
  "three/addons/": "https://unpkg.com/three@0.160.0/examples/jsm/",
  "three-mesh-bvh": "https://unpkg.com/three-mesh-bvh@0.6.0/build/index.module.js",
  "three-bvh-csg": "https://unpkg.com/three-bvh-csg@0.0.7/build/index.module.js"
} }
</script>
</head>
<body>
<div id="msg">3D yükleniyor... (internet gerekir)</div>
<script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Brush, Evaluator, ADDITION, SUBTRACTION } from 'three-bvh-csg';

const msg = document.getElementById('msg');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 1, 10000);
camera.position.set(150, 120, 180);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const light = new THREE.DirectionalLight(0xffffff, 0.9);
light.position.set(200, 300, 200);
scene.add(light);
scene.add(new THREE.GridHelper(400, 40, 0x475569, 0x1e293b));

const mat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.5, metalness: 0.1 });
const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });

const evaluator = new Evaluator();
evaluator.useGroups = false;

let group = new THREE.Group();
scene.add(group);
let first = true;

function clamp(v) {
  v = Number(v);
  return isFinite(v) && v > 0 ? Math.min(v, 1000) : 1;
}
function pos(v) {
  v = Number(v);
  return isFinite(v) ? v : 0;
}

function fit(box) {
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const m = Math.max(size.x, size.y, size.z, 1);
  const t = Math.tan((camera.fov * Math.PI / 180) / 2);
  let asp = isFinite(camera.aspect) && camera.aspect > 0 ? Math.min(camera.aspect, 1) : 1;
  asp = Math.max(asp, 0.2); // dar ekranda da parça sığsın
  const dist = (m / 2) / (t * asp) * 1.8 + 20;
  const dir = camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(center);
  camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  controls.update();
}

function makeBrush(p) {
  const w = clamp(p.w), l = clamp(p.l), h = clamp(p.h), d = clamp(p.d);
  const geo = p.type === 'cylinder'
    ? new THREE.CylinderGeometry(d / 2, d / 2, h, 64)
    : new THREE.BoxGeometry(w, h, l);
  // konumu geometriye göm: x,z merkez; y parçanın ALT yüzü
  geo.translate(pos(p.x), pos(p.y) + h / 2, pos(p.z));
  const b = new Brush(geo, mat);
  b.updateMatrixWorld();
  return b;
}

// CSG sonucu drawRange kullanır; temiz, bağımsız bir geometriye kopyala
function compact(g) {
  const P = g.attributes.position;
  const N = g.attributes.normal;
  const idx = g.index;
  const total = idx ? idx.count : P.count;
  const start = g.drawRange.start || 0;
  let count = isFinite(g.drawRange.count) ? g.drawRange.count : total - start;
  count = Math.max(0, Math.min(count, total - start));
  const outP = new Float32Array(count * 3);
  const outN = N ? new Float32Array(count * 3) : null;
  for (let i = 0; i < count; i++) {
    const v = idx ? idx.getX(start + i) : start + i;
    outP[i * 3] = P.getX(v); outP[i * 3 + 1] = P.getY(v); outP[i * 3 + 2] = P.getZ(v);
    if (N) { outN[i * 3] = N.getX(v); outN[i * 3 + 1] = N.getY(v); outN[i * 3 + 2] = N.getZ(v); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(outP, 3));
  if (outN) out.setAttribute('normal', new THREE.BufferAttribute(outN, 3));
  else out.computeVertexNormals();
  return out;
}

window.updateParts = function (s) {
  try {
    group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); });
    scene.remove(group);
    group = new THREE.Group();
    scene.add(group);

    let result = null;
    for (const p of s.parts) {
      const b = makeBrush(p);
      if (!result) { result = b; continue; }
      const next = evaluator.evaluate(result, b, p.op === 'sub' ? SUBTRACTION : ADDITION);
      next.updateMatrixWorld();
      result = next;
    }
    if (!result) return;

    const clean = compact(result.geometry);
    clean.computeBoundingBox();
    group.add(new THREE.Mesh(clean, mat));
    group.add(new THREE.LineSegments(new THREE.EdgesGeometry(clean, 30), lineMat));

    msg.style.display = 'none';
    if (first || s.refit) { fit(clean.boundingBox); first = false; }
  } catch (err) {
    msg.style.display = 'block';
    msg.style.color = '#f87171';
    msg.textContent = 'Hata: ' + (err && err.message ? err.message : err);
  }
};

renderer.setAnimationLoop(function () {
  controls.update();
  renderer.render(scene, camera);
});

addEventListener('resize', function () {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.addEventListener('message', function (e) {
  if (e.data && e.data.cmd === 'parts') window.updateParts(e.data.payload);
});

msg.style.display = 'none';
if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('ready');
else parent.postMessage('ready', '*');
</script>
</body>
</html>
`;

export default HTML;
