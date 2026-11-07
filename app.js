import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { Brush, Evaluator, ADDITION, SUBTRACTION } from 'three-bvh-csg';
import {
  TYPE_LABEL, DEFAULTS, heightOf, newPart, History, toSTLBinary, parseVoice,
  UNITS, toUnit, fromUnit, fmtNum, snap, dist3,
  sketchFromDraw, sketchToDraw, revolveProfile, chamferBoxPoints, cylinderProfile,
  duplicatePart, mirrorPart, linearArray, circularArray, quatToEulerXYZ,
  VIEW_DIRS, sectionPlane, fovDistance, sheetLayout, scaleLabel, jpegToPdf,
} from './logic.js';
import { openSketch } from './sketch.js';

const $ = (id) => document.getElementById(id);
const RAD = Math.PI / 180;
const clamp = (v) => (isFinite(v) && v > 0 ? Math.min(v, 100000) : 1); // en fazla 100 m
const pos = (v) => (isFinite(v) ? v : 0);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ================= Durum ================= */
const freshParts = () => [
  { id: 1, type: 'box', op: 'add', w: 80, l: 60, h: 40, d: 50, d2: 0, di: 20, r: 0, c: 0, x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 },
];
let parts = freshParts();
let sel = 1;
let nextId = 2;
let projName = 'model';
let tab = 'dims';
const cur = () => parts.find((p) => p.id === sel) || parts[0];

const SETTINGS_KEY = 'cizim:settings';
const settings = { unit: 'mm', snap: 1, drag: 'floor', dim: 'off', ortho: false, move: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'), { move: false }); } catch (e) { /* varsayılan */ }
const saveSettings = () => { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* yoksay */ } };

const section = { on: false, axis: 'x', pos: 0, flip: false };
const cp = { n: 3, dx: 40, dy: 0, dz: 0, cn: 6, ang: 360, touched: false, shape: 'round', fd: 10, fw: 10, fl: 10, depth: 5, es: 3,
  pat: 'single', px: 3, py: 2, sx: 20, sy: 20, pn: 6, pr: 20,            // delik deseni
  wall: 2, openTop: true, openBot: false,                                 // kabuk
  mgap: 0, mrot: 0, mcenter: true };                                      // montaj // çoğaltma + yüz ayarları (mm)

const hist = new History();
const snapshot = () => JSON.stringify({ parts, sel, nextId });
function restore(s) {
  const o = JSON.parse(s);
  parts = o.parts; sel = o.sel; nextId = o.nextId;
  if (!parts.find((p) => p.id === sel)) sel = parts[0].id;
}
const commit = () => hist.push(snapshot());

/* ================= 3D sahne ================= */
const view = $('view');
const msg = $('msg');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f172a);
const camera = new THREE.PerspectiveCamera(settings.ortho ? 1.5 : 45, 1, 1, 10000);
camera.position.set(150, 120, 180);
camera.layers.enable(1); // katman 0 = model, katman 1 = yardımcılar (ızgara, hayalet, etiket...)

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.localClippingEnabled = true;
view.insertBefore(renderer.domElement, view.firstChild);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.4;
controls.zoomSpeed = 0.8;
controls.panSpeed = 0.8;

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const light = new THREE.DirectionalLight(0xffffff, 0.9);
light.position.set(200, 300, 200);
scene.add(light);

// Sonsuz zemin ızgarası (kırmızı çizgi X, mavi çizgi Z)
const gridMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  uniforms: { uCell: { value: 10 }, uFade: { value: 1 }, uFar: { value: 1000 } },
  vertexShader: `
    varying vec3 vPos;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vPos = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }`,
  fragmentShader: `
    varying vec3 vPos;
    uniform float uCell;
    uniform float uFade;
    uniform float uFar;
    float gridLine(vec2 p, float cell) {
      vec2 c = p / cell;
      vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
      return 1.0 - min(min(g.x, g.y), 1.0);
    }
    void main() {
      float minor = gridLine(vPos.xz, uCell) * uFade;
      float major = gridLine(vPos.xz, uCell * 10.0);
      float d = length(vPos - cameraPosition);
      float fade = 1.0 - smoothstep(uFar * 0.15, uFar, d);
      vec2 aw = fwidth(vPos.xz) * 1.5;
      float axX = 1.0 - min(abs(vPos.z) / max(aw.y, 1e-6), 1.0);
      float axZ = 1.0 - min(abs(vPos.x) / max(aw.x, 1e-6), 1.0);
      vec3 col = vec3(0.39, 0.45, 0.55);
      float a = max(minor * 0.35, major * 0.7);
      col = mix(col, vec3(0.94, 0.27, 0.27), axX);
      col = mix(col, vec3(0.23, 0.51, 0.96), axZ);
      a = max(a, max(axX, axZ) * 0.9);
      gl_FragColor = vec4(col, a * fade);
    }`,
});
const gridMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), gridMat);
gridMesh.scale.set(400000, 1, 400000);
gridMesh.frustumCulled = false;
gridMesh.renderOrder = -1;
gridMesh.layers.set(1);
scene.add(gridMesh);

function updateInfinite() {
  const dist = Math.max(camera.position.distanceTo(controls.target), 1);
  // ortografik taklitte (çok dar görüş açısı) ızgara, görünen alana göre ölçeklenir
  const eff = dist * Math.tan(camera.fov * RAD / 2) / Math.tan(22.5 * RAD);
  const e = Math.log10(Math.max(eff, 0.01) / 6);
  const k = Math.floor(e);
  gridMat.uniforms.uCell.value = Math.pow(10, k);
  gridMat.uniforms.uFade.value = 1 - (e - k);
  gridMat.uniforms.uFar.value = dist * 10;
  gridMesh.position.set(controls.target.x, -eff * 0.0004, controls.target.z);
  camera.near = Math.max(0.05, dist / 400);
  camera.far = Math.max(20000, dist * 400);
  camera.updateProjectionMatrix();
}

/* ---- Kenar çizgileri: ekran uzayında (normal + derinlik farkı) ----
   CSG üçgenleri kenarlarda eşleşmediği için geometriden kenar çıkarmak çirkin çizgiler verir;
   bu yüzden model bir kez normal haritası olarak çizilir ve süreksiz yerlere çizgi konur. */
// Derinlik dokusu KULLANMIYORUZ: telefon GPU'larında 16 bit çıkıp çizgileri bozabiliyor.
// Bunun yerine tek bir RGBA8 hedefe yazıyoruz: R,G = normal (oktahedral), B,A = 16 bit doğrusal derinlik
// (modelin kapladığı aralığa sıkıştırılmış). Arka plan = (0,0,0,0).
const rt = new THREE.WebGLRenderTarget(4, 4, {
  minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
});
const normalMat = new THREE.ShaderMaterial({
  clipping: true,
  uniforms: { uDR: { value: new THREE.Vector2(1, 1000) } },
  vertexShader: `
    #include <clipping_planes_pars_vertex>
    varying vec3 vN; varying float vZ;
    void main() {
      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      vZ = -mvPosition.z;
      vN = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * mvPosition;
      #include <clipping_planes_vertex>
    }`,
  fragmentShader: `
    #include <clipping_planes_pars_fragment>
    uniform vec2 uDR;
    varying vec3 vN; varying float vZ;
    void main() {
      #include <clipping_planes_fragment>
      vec3 n = normalize(vN);
      if (!gl_FrontFacing) n = -n;
      vec2 e = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));
      if (n.z < 0.0) e = (1.0 - abs(e.yx)) * vec2(e.x >= 0.0 ? 1.0 : -1.0, e.y >= 0.0 ? 1.0 : -1.0);
      float d = clamp((vZ - uDR.x) / uDR.y, 0.0, 1.0);
      float code = floor(d * 65534.0 + 0.5) + 1.0;
      float hi = floor(code / 256.0);
      float lo = code - hi * 256.0;
      gl_FragColor = vec4(e * 0.5 + 0.5, hi / 255.0, lo / 255.0);
    }`,
});
const edgeMat = new THREE.ShaderMaterial({
  transparent: true, depthTest: false, depthWrite: false,
  uniforms: {
    tN: { value: rt.texture },
    uTexel: { value: new THREE.Vector2(1, 1) }, uTan: { value: new THREE.Vector2(1, 1) },
    uDR: { value: new THREE.Vector2(1, 1000) },
    uCos: { value: Math.cos(35 * RAD) }, uTol: { value: 0.0008 },
    uColor: { value: new THREE.Color(0xf1f5f9) },
  },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: `
    varying vec2 vUv;
    uniform sampler2D tN;
    uniform vec2 uTexel; uniform vec2 uTan; uniform vec2 uDR;
    uniform float uCos; uniform float uTol;
    uniform vec3 uColor;
    // piksel çözümü: x = nesne var mı (1/0), yz = normal xy; derinlik ayrı
    float code(vec4 c) { return floor(c.b * 255.0 + 0.5) * 256.0 + floor(c.a * 255.0 + 0.5); }
    float depthOf(vec4 c) { return uDR.x + (code(c) - 1.0) / 65534.0 * uDR.y; }
    vec3 normalOf(vec4 c) {
      vec2 e = c.rg * 2.0 - 1.0;
      vec3 n = vec3(e, 1.0 - abs(e.x) - abs(e.y));
      if (n.z < 0.0) n.xy = (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
      return normalize(n);
    }
    vec3 ray(vec2 uv) { vec2 p = uv * 2.0 - 1.0; return vec3(p.x * uTan.x, p.y * uTan.y, -1.0); }
    float obj(vec2 uv) { return code(texture2D(tN, uv)) > 0.5 ? 1.0 : 0.0; }
    // CSG üçgenleri arasındaki küçük çatlaklar (tek piksellik boşluk) çizgi sayılmasın
    bool hole(vec2 uv) {
      if (obj(uv) > 0.5) return false;
      float s = obj(uv + vec2(uTexel.x, 0.0)) + obj(uv - vec2(uTexel.x, 0.0)) + obj(uv + vec2(0.0, uTexel.y)) + obj(uv - vec2(0.0, uTexel.y));
      return s >= 3.0;
    }
    float edgeTo(vec4 c0, vec3 n0, float z0, vec2 uv1) {
      vec4 c1 = texture2D(tN, uv1);
      float o0 = code(c0) > 0.5 ? 1.0 : 0.0, o1 = code(c1) > 0.5 ? 1.0 : 0.0;
      if (abs(o0 - o1) > 0.5) return hole(uv1) ? 0.0 : 1.0;
      if (o1 < 0.5) return 0.0;
      vec3 n1 = normalOf(c1);
      if (dot(n0, n1) < uCos) return 1.0;
      float den = dot(n0, ray(uv1));
      if (abs(den) < 0.03) return 0.0;
      float zp = dot(n0, ray(vUv) * z0) / den;
      return abs(depthOf(c1) - zp) > uTol * z0 ? 1.0 : 0.0;
    }
    void main() {
      vec4 c0 = texture2D(tN, vUv);
      vec2 a = vUv + vec2(uTexel.x, 0.0), b = vUv + vec2(0.0, uTexel.y);
      float e = 0.0;
      if (code(c0) < 0.5) {
        if (hole(vUv)) discard;
        e = max(abs(0.0 - obj(a)), abs(0.0 - obj(b)));
      } else {
        vec3 n0 = normalOf(c0);
        float z0 = depthOf(c0);
        e = max(edgeTo(c0, n0, z0, a), edgeTo(c0, n0, z0, b));
      }
      if (e < 0.5) discard;
      gl_FragColor = vec4(uColor, 0.92);
    }`,
});
const edgeScene = new THREE.Scene();
const edgeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), edgeMat);
edgeQuad.frustumCulled = false;
edgeScene.add(edgeQuad);
const edgeCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Kendini sınama: bilinen bir düzlemi normal geçişiyle çizip geri okur. Cihaz derinliği/normali
// yanlış kodluyorsa (bazı telefon GPU'ları) kenar çizgileri otomatik kapanır, ekran bozulmaz.
let edgesBroken = false;
function selfTestEdges() {
  try {
    const t = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const sc = new THREE.Scene();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), normalMat);
    m.position.z = -5;
    sc.add(m);
    const cam = new THREE.PerspectiveCamera(60, 1, 0.5, 50);
    const keep = normalMat.uniforms.uDR.value.clone(), keepClip = normalMat.clippingPlanes;
    normalMat.uniforms.uDR.value.set(1, 10);
    normalMat.clippingPlanes = [];
    renderer.setRenderTarget(t);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(sc, cam);
    renderer.setRenderTarget(null);
    normalMat.uniforms.uDR.value.copy(keep);
    normalMat.clippingPlanes = keepClip;
    const px = new Uint8Array(16);
    renderer.readRenderTargetPixels(t, 1, 1, 2, 2, px);
    t.dispose(); m.geometry.dispose();
    const code = px[2] * 256 + px[3];
    const want = Math.floor(0.4 * 65534 + 0.5) + 1;
    return Math.abs(code - want) <= 3 && Math.abs(px[0] - 128) <= 2 && Math.abs(px[1] - 128) <= 2;
  } catch (e) { return false; }
}

const lastBg = new THREE.Color(0x0f172a);
// derinlik aralığı: modelin kamera ekseni boyunca kapladığı kalınlık (16 bit tam bunu paylaşır)
function setDepthRange() {
  let lo = camera.near, hi = camera.far;
  const bb = lastClean && lastClean.boundingBox;
  if (bb && !bb.isEmpty()) {
    const c = bb.getCenter(new THREE.Vector3());
    const R = bb.getSize(new THREE.Vector3()).length() / 2 + 1;
    const zc = -c.clone().applyMatrix4(camera.matrixWorldInverse).z;
    lo = Math.max(zc - R, camera.near * 0.5);
    hi = Math.max(zc + R, lo + 1);
  }
  edgeMat.uniforms.uDR.value.set(lo, hi - lo);
  normalMat.uniforms.uDR.value.set(lo, hi - lo);
}
function drawEdges() {
  const t = Math.tan(camera.fov * RAD / 2);
  edgeMat.uniforms.uTan.value.set(t * camera.aspect, t);
  setDepthRange();
  camera.layers.disable(1);
  const bg = scene.background;
  scene.background = null;
  camera.updateMatrixWorld();
  scene.overrideMaterial = normalMat;
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.render(scene, camera);
  scene.overrideMaterial = null;
  scene.background = bg;
  camera.layers.enable(1);
  renderer.setRenderTarget(null);
  renderer.setClearColor(lastBg, 1);
  renderer.autoClear = false;
  renderer.render(edgeScene, edgeCam);
  renderer.autoClear = true;
}

/* ---- malzemeler, CSG ---- */
const DEFAULT_COLOR = '#38bdf8';
const matCache = new Map();
function matFor(color) {
  const key = color || DEFAULT_COLOR;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(key), roughness: 0.5, metalness: 0.1 });
    matCache.set(key, m);
    applySectionTo(m);
  }
  return m;
}
const capMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.BackSide });
const ghostMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
const ghostSelMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
const selMat = new THREE.MeshBasicMaterial({
  color: 0xfacc15, transparent: true, opacity: 0.12, depthWrite: false,
  polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
});
const pickMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const selLineMat = new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false, transparent: true, opacity: 0.95 });
const evaluator = new Evaluator();
evaluator.useGroups = false;

let modelMesh = null;
let capMesh = null;
const modelGroup = new THREE.Group();
scene.add(modelGroup);
let ovl = new THREE.Group();
scene.add(ovl);
let lastClean = null;
let lastBrushes = [];   // [{ p, geo }]
let first = true;

function resize() {
  const w = view.clientWidth, h = view.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  const v = renderer.getDrawingBufferSize(new THREE.Vector2());
  rt.setSize(v.x, v.y);
  edgeMat.uniforms.uTexel.value.set(1 / v.x, 1 / v.y);
}
new ResizeObserver(resize).observe(view);
resize();

const labelSprites = [];
const msrSprites = [];
function updateLabelScales() {
  const k = 2 * Math.tan(camera.fov * RAD / 2) * 0.045;
  for (const s of labelSprites) s.scale.set(k * s.userData.aspect, k, 1);
  for (const s of msrSprites) s.scale.set(k * s.userData.aspect, k, 1);
}
renderer.setAnimationLoop(() => {
  controls.update();
  updateInfinite();
  updateLabelScales();
  renderer.render(scene, camera);
  if (modelMesh && settings.edges !== false && !edgesBroken) drawEdges();
});

function fit(box, dirOverride) {
  if (!box || box.isEmpty()) return;
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const m = Math.max(size.x, size.y, size.z, 1);
  const t = Math.tan((camera.fov * RAD) / 2);
  let asp = isFinite(camera.aspect) && camera.aspect > 0 ? Math.min(camera.aspect, 1) : 1;
  asp = Math.max(asp, 0.2);
  const dist = (m / 2) / (t * asp) * 1.8 + 20;
  const dir = dirOverride
    ? dirOverride.clone().normalize()
    : camera.position.clone().sub(controls.target).normalize();
  controls.target.copy(center);
  camera.position.copy(center.clone().add(dir.multiplyScalar(dist)));
  controls.update();
}

function setOrtho(on) {
  settings.ortho = on;
  saveSettings();
  const to = on ? 1.5 : 45;
  if (camera.fov === to) return;
  const dist = camera.position.distanceTo(controls.target);
  const dir = camera.position.clone().sub(controls.target).normalize();
  const nd = fovDistance(dist, camera.fov, to);
  camera.fov = to;
  camera.position.copy(controls.target).addScaledVector(dir, nd);
  camera.updateProjectionMatrix();
  controls.update();
}

function setView(name) {
  const d = VIEW_DIRS[name];
  if (!d) return;
  fit(lastClean ? lastClean.boundingBox : null, new THREE.Vector3(...d));
}

/* ================= Geometri ================= */
const ensureUV = (g) => {
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
};

function cylinderGeo(p, d, h) {
  const rr = Math.max(pos(p.r), 0), c = Math.max(pos(p.c), 0);
  if (rr <= 0.05 && c <= 0.05) {
    const tp = Math.min(Math.max(pos(p.tp), 0), 60);
    if (tp > 0.01) {
      const d2 = Math.max(d - 2 * h * Math.tan(tp * RAD), 0.1);
      return new THREE.CylinderGeometry(d2 / 2, d / 2, h, 64);
    }
    return new THREE.CylinderGeometry(d / 2, d / 2, h, 64);
  }
  const round = rr > 0.05;
  const raw = cylinderProfile(d / 2, h, round ? 0 : c, round ? rr : 0);
  const pts = [];
  raw.forEach(([r, y], i) => {
    pts.push(new THREE.Vector2(r, y));
    // pahta köşeler keskin kalsın: iç noktaları ikiledik (yumuşatma olmasın)
    if (!round && i > 0 && i < raw.length - 1) pts.push(new THREE.Vector2(r, y));
  });
  const g = new THREE.LatheGeometry(pts, 64);
  g.translate(0, -h / 2, 0);
  return g;
}

function sketchGeo(p) {
  const H = Math.max(heightOf(p), 0.01);
  let g;
  if (p.mode === 'revolve') {
    const prof = revolveProfile(p.pts);
    const lp = [];
    // her köşe iki kez: Lathe köşelerde normali yumuşatır, kesin köşeler istiyoruz
    prof.forEach(([r, y], i) => {
      lp.push(new THREE.Vector2(r, y));
      if (i > 0 && i < prof.length - 1) lp.push(new THREE.Vector2(r, y));
    });
    g = new THREE.LatheGeometry(lp, 64);
  } else if (p.plane === 'top') {
    const shape = new THREE.Shape(p.pts.map(([u, v]) => new THREE.Vector2(u, -v)));
    g = new THREE.ExtrudeGeometry(shape, { depth: clamp(p.h), bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
  } else {
    const shape = new THREE.Shape(p.pts.map(([u, v]) => new THREE.Vector2(u, v)));
    g = new THREE.ExtrudeGeometry(shape, { depth: clamp(p.h), bevelEnabled: false });
    g.translate(0, 0, -clamp(p.h) / 2);
  }
  g.clearGroups();
  g.translate(0, -H / 2, 0);
  return g;
}

// Parçanın ham geometrisi (merkezde, döndürülmemiş)
function baseGeo(p) {
  const w = clamp(p.w), l = clamp(p.l), h = clamp(p.h), d = clamp(p.d);
  switch (p.type) {
    case 'sketch': return sketchGeo(p);
    case 'cylinder': return cylinderGeo(p, d, h);
    case 'tube': return new THREE.CylinderGeometry(d / 2, d / 2, h, 64);
    case 'sphere': return new THREE.SphereGeometry(d / 2, 48, 32);
    case 'cone': {
      const d2 = Math.max(pos(p.d2), d * 0.004, 0.1); // ucu sivri koni de çalışsın
      return new THREE.CylinderGeometry(d2 / 2, d / 2, h, 64);
    }
    default: {
      const r = Math.min(Math.max(pos(p.r), 0), Math.min(w, h, l) / 2 - 0.01);
      if (r > 0.05) return new RoundedBoxGeometry(w, h, l, 4, r);
      const tp = Math.min(Math.max(pos(p.tp), 0), 60);
      if (tp > 0.01 && !(pos(p.c) > 0.05)) {
        // eğimli (çekmeli) kutu: alt yüz tam ölçü, üst yüz her yönden h·tan(eğim) kadar küçük
        const inset = Math.min(h * Math.tan(tp * RAD), Math.max(Math.min(w, l) / 2 - 0.05, 0.01));
        const a = w / 2, b = l / 2, ta = a - inset, tb = b - inset;
        const P = [[-a, -h / 2, -b], [a, -h / 2, -b], [a, -h / 2, b], [-a, -h / 2, b],
          [-ta, h / 2, -tb], [ta, h / 2, -tb], [ta, h / 2, tb], [-ta, h / 2, tb]].map((v) => new THREE.Vector3(...v));
        return ensureUV(new ConvexGeometry(P));
      }
      const c = Math.max(pos(p.c), 0);
      if (c > 0.05) {
        const P = chamferBoxPoints(w, l, h, c).map(([x, y, z]) => new THREE.Vector3(x, y - h / 2, z));
        return ensureUV(new ConvexGeometry(P));
      }
      return new THREE.BoxGeometry(w, h, l);
    }
  }
}

// alt orta nokta = (0,0,0) olacak şekilde yerleştir, döndür, konuma taşı
function place(geo, p, hgt) {
  geo.translate(0, hgt / 2, 0);
  const rx = pos(p.rx), ry = pos(p.ry), rz = pos(p.rz);
  if (rx || ry || rz) {
    geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx * RAD, ry * RAD, rz * RAD, 'XYZ')));
  }
  geo.translate(pos(p.x), pos(p.y), pos(p.z));
  return geo;
}

function partHeight(p) {
  if (p.type === 'sketch') return Math.max(heightOf(p), 0.01);
  return p.type === 'sphere' ? clamp(p.d) : clamp(p.h);
}

function makeBrush(p, material) {
  const hgt = partHeight(p);
  if (p.type === 'tube') {
    const d = clamp(p.d);
    const di = Math.min(clamp(p.di), d - 0.4);
    const outer = new Brush(place(baseGeo(p), p, hgt), material);
    outer.updateMatrixWorld();
    const inner = new Brush(place(new THREE.CylinderGeometry(di / 2, di / 2, hgt + 2, 64), p, hgt), material);
    inner.updateMatrixWorld();
    const keep = evaluator.useGroups;
    evaluator.useGroups = false;
    const res = evaluator.evaluate(outer, inner, SUBTRACTION);
    evaluator.useGroups = keep;
    res.material = material;
    res.updateMatrixWorld();
    return res;
  }
  const b = new Brush(place(baseGeo(p), p, hgt), material);
  b.updateMatrixWorld();
  return b;
}

// CSG sonucu drawRange / grup kullanır; temiz, bağımsız bir geometriye kopyala (gruplar korunur)
function compact(g, useGroups) {
  const P = g.attributes.position, N = g.attributes.normal, idx = g.index;
  const total = idx ? idx.count : P.count;
  let ranges;
  if (useGroups && g.groups && g.groups.length) {
    ranges = g.groups.map((gr) => ({ start: gr.start, count: gr.count, mi: gr.materialIndex || 0 }));
  } else {
    const start = g.drawRange.start || 0;
    let count = isFinite(g.drawRange.count) ? g.drawRange.count : total - start;
    count = Math.max(0, Math.min(count, total - start));
    ranges = [{ start, count, mi: 0 }];
  }
  ranges = ranges.map((r) => ({ ...r, count: Math.max(0, Math.min(r.count, total - r.start)) }));
  const sum = ranges.reduce((a, r) => a + r.count, 0);
  const outP = new Float32Array(sum * 3);
  const outN = N ? new Float32Array(sum * 3) : null;
  const out = new THREE.BufferGeometry();
  let o = 0;
  const grouped = !!(useGroups && g.groups && g.groups.length > 0);
  for (const r of ranges) {
    const o0 = o;
    for (let i = 0; i < r.count; i++, o++) {
      const v = idx ? idx.getX(r.start + i) : r.start + i;
      outP[o * 3] = P.getX(v); outP[o * 3 + 1] = P.getY(v); outP[o * 3 + 2] = P.getZ(v);
      if (N) { outN[o * 3] = N.getX(v); outN[o * 3 + 1] = N.getY(v); outN[o * 3 + 2] = N.getZ(v); }
    }
    if (grouped && r.count) out.addGroup(o0, r.count, r.mi);
  }
  out.setAttribute('position', new THREE.BufferAttribute(outP, 3));
  if (outN) out.setAttribute('normal', new THREE.BufferAttribute(outN, 3));
  else out.computeVertexNormals();
  return out;
}

/* ================= Kesit ================= */
let secPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
function applySectionTo(m) {
  m.clippingPlanes = section.on ? [secPlane] : [];
  m.needsUpdate = true;
}
function applySection() {
  const s = sectionPlane(section.axis, section.pos, section.flip);
  secPlane = new THREE.Plane(new THREE.Vector3(...s.normal), s.constant);
  for (const m of matCache.values()) applySectionTo(m);
  for (const m of [capMat, ghostMat, ghostSelMat, selMat, normalMat]) applySectionTo(m);
  normalMat.side = section.on ? THREE.DoubleSide : THREE.FrontSide;
  if (capMesh) capMesh.visible = section.on;
}
function modelRange(axis) {
  if (!lastClean) return [-50, 50];
  const b = lastClean.boundingBox;
  return axis === 'x' ? [b.min.x, b.max.x] : axis === 'z' ? [b.min.z, b.max.z] : [b.min.y, b.max.y];
}

/* ================= CSG + sahne kurma ================= */
function buildResult(useColors) {
  const vis = parts.filter((p) => !p.hidden);
  evaluator.useGroups = useColors;
  const baseColor = vis[0].color;
  const brushes = [];
  let result = null;
  vis.forEach((p, i) => {
    const m = matFor(i > 0 && p.op === 'sub' ? baseColor : p.color);
    const b = makeBrush(p, m);
    brushes.push({ p, geo: b.geometry });
    if (!result) { result = b; return; }
    const next = evaluator.evaluate(result, b, p.op === 'sub' ? SUBTRACTION : ADDITION);
    next.updateMatrixWorld();
    result = next;
  });
  return { result, brushes };
}

function setMsg(text, err) {
  msg.style.display = text ? 'block' : 'none';
  msg.style.color = err ? '#f87171' : '#94a3b8';
  msg.textContent = text || '';
}

let ownedGeos = [];
function rebuild(refit) {
  try {
    ownedGeos.forEach((g) => g.dispose());
    ownedGeos = [];
    modelGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    modelGroup.clear();
    modelMesh = null; capMesh = null;

    const vis = parts.filter((p) => !p.hidden);
    if (!vis.length) { lastClean = null; lastBrushes = []; refreshOverlays(); setMsg('Tüm parçalar gizli', false); return; }

    const useColors = vis.some((p) => p.color);
    let out;
    try {
      out = buildResult(useColors);
    } catch (err) {
      if (!useColors) throw err;
      toast('Renkli birleştirme başarısız oldu; tek renk gösteriliyor');
      out = buildResult(false);
    }
    ownedGeos = out.brushes.map((b) => b.geo);
    lastBrushes = out.brushes;

    const clean = compact(out.result.geometry, useColors);
    if (!clean.attributes.position.count) {
      lastClean = null;
      refreshOverlays();
      setMsg('Model boş: parçalar birbirini tamamen yok etti.', true);
      return;
    }
    clean.computeBoundingBox();
    lastClean = clean;

    let materials = matFor(vis[0].color);
    if (clean.groups.length) {
      const arr = Array.isArray(out.result.material) ? out.result.material : [out.result.material];
      if (clean.groups.some((g) => g.materialIndex >= arr.length || !arr[g.materialIndex])) throw new Error('renk grupları tutarsız');
      materials = arr;
    }
    modelMesh = new THREE.Mesh(clean, materials);
    modelGroup.add(modelMesh);
    capMesh = new THREE.Mesh(clean, capMat);
    capMesh.layers.set(1);
    capMesh.visible = section.on;
    modelGroup.add(capMesh);

    setMsg('', false);
    refreshOverlays();
    if (first || refit) { fit(clean.boundingBox); first = false; }
  } catch (err) {
    setMsg('Hata: ' + (err && err.message ? err.message : err), true);
  }
}

/* ---- yardımcı nesneler: hayalet (oyuk), seçim, ölçü etiketleri ---- */
let pickMeshes = [];
function disposeOverlay(g) {
  g.traverse((o) => {
    if (o.userData.own && o.geometry) o.geometry.dispose();
    if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); }
  });
  g.clear();
}

function textSprite(text) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  g.font = 'bold 34px system-ui, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 28;
  c.width = w; c.height = 56;
  g.font = 'bold 34px system-ui, sans-serif';
  g.fillStyle = 'rgba(15,23,42,0.88)';
  g.beginPath(); g.roundRect(0, 0, w, 56, 12); g.fill();
  g.strokeStyle = '#fbbf24'; g.lineWidth = 3; g.beginPath(); g.roundRect(1.5, 1.5, w - 3, 53, 11); g.stroke();
  g.fillStyle = '#fef3c7'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, 29);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false }));
  s.userData.aspect = w / 56;
  s.renderOrder = 999;
  s.layers.set(1);
  return s;
}

const lenText = (mm) => fmtNum(toUnit(mm, settings.unit), 2) + ' ' + settings.unit;

function addDimLines(group, box) {
  const mn = box.min, mx = box.max;
  const size = box.getSize(new THREE.Vector3());
  const off = Math.max(size.x, size.y, size.z) * 0.12 + 2;
  const tick = off * 0.25;
  const segs = [];
  const labels = [];
  const dim = (a, b, ext, tk, text) => {
    // a-b ölçü çizgisi; ext: a ve b'den çizgiye uzantı; tk: uç çizgisi yönü
    segs.push(a.clone(), b.clone());
    segs.push(a.clone().sub(ext), a.clone());
    segs.push(b.clone().sub(ext), b.clone());
    segs.push(a.clone().addScaledVector(tk, -tick), a.clone().addScaledVector(tk, tick));
    segs.push(b.clone().addScaledVector(tk, -tick), b.clone().addScaledVector(tk, tick));
    labels.push([a.clone().add(b).multiplyScalar(0.5), text]);
  };
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // X (genişlik): ön-alt kenarın dışında
  dim(V3(mn.x, mn.y, mx.z + off), V3(mx.x, mn.y, mx.z + off), V3(0, 0, off), V3(0, 0, 1), lenText(size.x));
  // Z (derinlik): sağ-alt kenarın dışında
  dim(V3(mx.x + off, mn.y, mn.z), V3(mx.x + off, mn.y, mx.z), V3(off, 0, 0), V3(1, 0, 0), lenText(size.z));
  // Y (yükseklik): sol-ön kenarın dışında
  dim(V3(mn.x - off, mn.y, mx.z), V3(mn.x - off, mx.y, mx.z), V3(-off, 0, 0), V3(1, 0, 0), lenText(size.y));
  const geo = new THREE.BufferGeometry().setFromPoints(segs);
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xfbbf24, depthTest: false, transparent: true }));
  lines.userData.own = true;
  lines.renderOrder = 998;
  lines.layers.set(1);
  group.add(lines);
  for (const [p3, t] of labels) {
    const s = textSprite(t);
    s.position.copy(p3);
    group.add(s);
    labelSprites.push(s);
  }
}

function refreshOverlays() {
  disposeOverlay(ovl);
  labelSprites.length = 0;
  pickMeshes = [];
  const p0 = cur();
  for (const { p, geo } of lastBrushes) {
    const isSel = p.id === p0.id;
    const isSub = p.op === 'sub' && parts.indexOf(p) > 0;
    let pick;
    if (isSub && (isSel || !p.aux)) {
      pick = new THREE.Mesh(geo, isSel ? ghostSelMat : ghostMat);
    } else {
      pick = new THREE.Mesh(geo, pickMat);
      pick.visible = false;
    }
    pick.userData.part = p;
    pick.layers.set(1);
    ovl.add(pick);
    pickMeshes.push(pick);
    if (isSel) {
      if (!isSub) {
        const hi = new THREE.Mesh(geo, selMat);
        hi.layers.set(1);
        hi.renderOrder = 5;
        ovl.add(hi);
      }
      // sarı çerçeve: CSG sonucu olan boru için ham dış silindiri kullan (temiz kenarlar)
      const og = p.type === 'tube' ? place(baseGeo(p), p, partHeight(p)) : geo;
      const eg = new THREE.EdgesGeometry(og, 30);
      if (og !== geo) og.dispose();
      const outline = new THREE.LineSegments(eg, selLineMat);
      outline.userData.own = true;
      outline.renderOrder = 500;
      outline.layers.set(1);
      ovl.add(outline);
    }
  }
  // ölçü etiketleri
  if (settings.dim === 'model' && lastClean) addDimLines(ovl, lastClean.boundingBox);
  else if (settings.dim === 'part') {
    const b = partBBox(p0.id);
    if (b) addDimLines(ovl, b);
  }
  applySection();
}

function partBBox(id) {
  const e = lastBrushes.find((b) => b.p.id === id);
  if (!e) return null;
  if (!e.geo.boundingBox) e.geo.computeBoundingBox();
  return e.geo.boundingBox;
}

/* ================= Bildirim ================= */
let toastT;
function toast(m) {
  const t = $('toast');
  t.textContent = m;
  t.style.opacity = 1;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.style.opacity = 0; }, 3800);
}

/* ================= Panel ================= */
const TYPES = ['box', 'cylinder', 'sphere', 'cone', 'tube'];
const COLORS = ['#38bdf8', '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#6366f1', '#a855f7', '#ec4899', '#f1f5f9', '#94a3b8', '#475569'];
const SNAPS = [0, 1, 5, 10, 50];
const TABS = [['dims', 'Ölçü'], ['type', 'Tür'], ['pos', 'Konum'], ['rot', 'Döndür'], ['copy', 'Çoğalt'], ['face', 'Yüz'], ['edge', 'Kenar'], ['shell', 'Kabuk'], ['mate', 'Montaj'], ['part', 'Parça'], ['view', 'Görünüm'], ['sheet', 'Resim']];

function fieldsFor(p) {
  switch (p.type) {
    case 'box': return [['Genişlik', 'w'], ['Derinlik', 'l'], ['Yükseklik', 'h'], ['Yuvarlama', 'r'], ['Pah', 'c'], ['Eğim °', 'tp', 'deg']];
    case 'cylinder': return [['Çap', 'd'], ['Yükseklik', 'h'], ['Yuvarlama', 'r'], ['Pah', 'c'], ['Eğim °', 'tp', 'deg']];
    case 'sphere': return [['Çap', 'd']];
    case 'cone': return [['Alt çap', 'd'], ['Üst çap', 'd2'], ['Yükseklik', 'h']];
    case 'tube': return [['Dış çap', 'd'], ['İç çap', 'di'], ['Yükseklik', 'h']];
    case 'sketch': return p.mode === 'revolve' ? [] : [['Kalınlık', 'h']];
    default: return [];
  }
}

const lenVal = (mm) => (isFinite(mm) ? fmtNum(toUnit(mm, settings.unit), 3) : '');
const btn = (label, act, on) => `<button data-act="${act}"${on ? ' class="on"' : ''}>${label}</button>`;
const field = (label, key, p, kind = 'len') => {
  const v = typeof p[key] === 'number' && isFinite(p[key]) ? (kind === 'deg' ? fmtNum(p[key], 2) : lenVal(p[key])) : '';
  return `<label class="f"><span>${label}${kind === 'len' ? ' (' + settings.unit + ')' : ''}</span><input type="number" step="any" data-k="${key}" data-u="${kind}" value="${v}"></label>`;
};
const cfield = (label, key, kind = 'len') => {
  const v = kind === 'len' ? lenVal(cp[key]) : fmtNum(cp[key], 2);
  return `<label class="f"><span>${label}${kind === 'len' ? ' (' + settings.unit + ')' : ''}</span><input type="number" step="any" data-c="${key}" data-u="${kind}" value="${v}"></label>`;
};

const partName = (q, i) => q.name || (i + 1) + '. ' + TYPE_LABEL[q.type];

function renderChips() {
  const p = cur();
  $('chips').innerHTML = parts.map((q, i) =>
    `<button class="chip${q.op === 'sub' && i > 0 ? ' sub' : ''}${q.id === p.id ? ' on' : ''}"${q.hidden ? ' style="opacity:.45"' : ''} data-sel="${q.id}">` +
    `${esc(partName(q, i))}${i > 0 && q.op === 'sub' ? ' (oyuk)' : ''}${q.hidden ? ' ⊘' : ''}</button>`).join('');
}

function renderPanel() {
  const p = cur();
  const idx = parts.indexOf(p);
  renderChips();
  $('tabs').innerHTML = TABS.map(([k, l]) => `<button class="tab${tab === k ? ' on' : ''}" data-act="tab-${k}">${l}</button>`).join('');
  let body = '', hint = '';
  const opBtns = idx > 0 ? btn('Birleştir', 'op-add', p.op === 'add') + btn('Oyuk aç', 'op-sub', p.op === 'sub') : '';
  const snapBtns = SNAPS.map((v) => btn(v === 0 ? 'Yapışma yok' : 'Yapış ' + fmtNum(toUnit(v, settings.unit), 3), 'snap-' + v, settings.snap === v)).join('');

  if (tab === 'type') {
    body = p.type === 'sketch'
      ? btn('✎ Krokiyi düzenle', 'sketch-edit') + opBtns
      : TYPES.map((t) => btn(TYPE_LABEL[t], 'type-' + t, p.type === t)).join('') + opBtns;
    hint = 'Seçili parçanın türü' + (idx > 0 ? ' ve birleştirme / oyuk durumu' : '');
  } else if (tab === 'pos') {
    body = field('X (sağ-sol)', 'x', p) + field('Y (alt)', 'y', p) + field('Z (ön-arka)', 'z', p) +
      btn('✋ Parmakla taşı: ' + (settings.move ? 'AÇIK' : 'kapalı'), 'move', settings.move) +
      btn('Yer düzlemi', 'drag-floor', settings.drag === 'floor') + btn('Dikey düzlem', 'drag-wall', settings.drag === 'wall') + btn('⬍ Sadece yukarı-aşağı', 'drag-up', settings.drag === 'up') +
      snapBtns;
    hint = 'Y parçanın alt yüzüdür. Taşı açıkken seçili parçayı sürükle; kapalıyken sahne döner. Yukarı-aşağı çekmek için "Sadece yukarı-aşağı" seç.';
  } else if (tab === 'rot') {
    body = field('X°', 'rx', p, 'deg') + field('Y°', 'ry', p, 'deg') + field('Z°', 'rz', p, 'deg');
    hint = 'Derece; parçanın alt orta noktası etrafında döner.';
  } else if (tab === 'copy') {
    if (!cp.touched) { const b = partBBox(p.id); if (b) cp.dx = Math.round(b.getSize(new THREE.Vector3()).x + 10); }
    body = btn('Kopyala', 'copy-dup') + btn('Ayna X', 'copy-mx') + btn('Ayna Z', 'copy-mz') +
      '<div class="lbl" style="flex:1 0 100%">Doğrusal dizi</div>' +
      cfield('Kopya sayısı', 'n', 'num') + cfield('Aralık X', 'dx') + cfield('Aralık Y', 'dy') + cfield('Aralık Z', 'dz') +
      btn('Doğrusal dizi yap', 'copy-lin') +
      '<div class="lbl" style="flex:1 0 100%">Dairesel dizi (1. parçanın ortası etrafında)</div>' +
      cfield('Toplam adet', 'cn', 'num') + cfield('Açı°', 'ang', 'num') + btn('Dairesel dizi yap', 'copy-circ');
    hint = 'Ayna: 1. parçanın orta düzlemine göre. Seçili parçanın kopyaları eklenir.';
  } else if (tab === 'face') {
    if (!face) {
      body = '<div class="lbl" style="flex:1 0 100%">Modelde bir yüze dokun.</div>';
      hint = 'Dokunduğun yüz sarı renkte işaretlenir; delik, çıkıntı ya da kroki o yüze dik oluşur.';
    } else {
      body = btn('○ Yuvarlak', 'fshape-round', cp.shape === 'round') + btn('□ Kare', 'fshape-square', cp.shape === 'square') +
        (cp.shape === 'round' ? cfield('Çap', 'fd') : cfield('Genişlik', 'fw') + cfield('Derinlik (yatay)', 'fl')) +
        cfield('Derinlik / yükseklik', 'depth') +
        '<div class="lbl" style="flex:1 0 100%">Desen (delik / çıkıntı için)</div>' +
        btn('Tek', 'pat-single', cp.pat === 'single') + btn('Izgara', 'pat-grid', cp.pat === 'grid') + btn('Daire', 'pat-circ', cp.pat === 'circ') +
        (cp.pat === 'grid' ? cfield('Sütun', 'px', 'num') + cfield('Satır', 'py', 'num') + cfield('Aralık 1', 'sx') + cfield('Aralık 2', 'sy') : '') +
        (cp.pat === 'circ' ? cfield('Adet', 'pn', 'num') + cfield('Daire yarıçapı', 'pr') : '') +
        btn('⬇ Delik aç', 'face-hole') + btn('⬆ Çıkıntı ekle', 'face-boss') +
        '<div class="lbl" style="flex:1 0 100%">Bu yüze kroki çiz (kalınlık = derinlik / yükseklik)</div>' +
        btn('✎ Kroki → oyuk', 'face-sk-cut') + btn('✎ Kroki → çıkıntı', 'face-sk-boss');
      hint = 'Delik / çıkıntı dokunduğun noktada oluşur (desende dokunduğun nokta merkezdir). Sonra Konum sekmesinden ince ayar yapabilirsin.';
    }
  } else if (tab === 'edge') {
    if (!edgeSel) {
      body = '<div class="lbl" style="flex:1 0 100%">Bir kutunun kenarına dokun.</div>';
      hint = 'Sadece düz kutu parçalarının kenarlarında çalışır (yuvarlama/pahı olmayan). Kenara yakın dokun; sarı çizgi seçileni gösterir.';
    } else {
      body = cfield('Ölçü (pah boyu / yarıçap)', 'es') + btn('◣ Pah kır', 'edge-chamfer') + btn('◜ Yuvarla', 'edge-fillet');
      hint = 'Seçili kenar tek başına işlenir. İşlem, kenara bir oyuk parçası ekler (Parça listesinde görünür); silersen geri gelir.';
    }
  } else if (tab === 'shell') {
    const el = shellEligible(p);
    body = (el ? cfield('Duvar kalınlığı', 'wall') + btn('Üst açık: ' + (cp.openTop ? 'evet' : 'hayır'), 'shell-top', cp.openTop) + btn('Alt açık: ' + (cp.openBot ? 'evet' : 'hayır'), 'shell-bot', cp.openBot) + btn('🥚 Kabuk yap', 'shell-do')
      : '<div class="lbl" style="flex:1 0 100%">Seçili parça kabuk yapılamaz.</div>');
    hint = el ? 'Seçili parçanın içini boşaltır (iç hacim oyuk parça olarak eklenir; Parça listesinden silersen geri gelir). Kutu, silindir ve küre için; yuvarlama / pah / eğim olmamalı.'
      : 'Kabuk: düz kutu, düz silindir ve küre için. Parçayı üstteki listeden seç.';
  } else if (tab === 'mate') {
    const nm = (m) => { const q = m && parts.find((x) => x.id === m.id); return q ? partName(q, parts.indexOf(q)) : ''; };
    body = '<div class="lbl" style="flex:1 0 100%">1) Hareket edecek parçanın yüzüne dokun' + (mate.a ? ' ✓ ' + esc(nm(mate.a)) : '') + '</div>' +
      '<div class="lbl" style="flex:1 0 100%">2) Yapışacağı yüze dokun (başka parça)' + (mate.b ? ' ✓ ' + esc(nm(mate.b)) : '') + '</div>' +
      cfield('Boşluk', 'mgap') + cfield('Yüz çevresinde döndür°', 'mrot', 'deg') +
      btn('Yüz merkezleri: ' + (cp.mcenter ? 'hizala' : 'dokunulan nokta'), 'mate-center', cp.mcenter) +
      btn('🔗 Yüzü yüze birleştir', 'mate-do') + btn('Sıfırla', 'mate-reset');
    hint = 'Birinci yüz, ikinci yüze yüzü yüze oturur ve parça döner. Düz olmayan yüzlerde dokunduğun noktanın yüzü kullanılır. Geri al ile döner.';
  } else if (tab === 'sheet') {
    body = btn('📐 Teknik resim oluştur', 'sheet-make') +
      '<div class="lbl" style="flex:1 0 100%">A4 yatay: ön, yan, üst ve izometrik görünüş; ölçek ve genel ölçüler.</div>';
    hint = 'Resim PNG ya da PDF olarak indirilir. Birim: ' + settings.unit + ' (Görünüm sekmesinden değiştirilir).';
  } else if (tab === 'part') {
    body = `<label class="f w2"><span>Parça adı</span><input type="text" data-k="name" data-t="text" value="${esc(p.name || '')}" placeholder="${esc(partName(p, idx))}"></label>` +
      `<div class="row" style="flex:1 0 100%;padding:0;flex-wrap:wrap">` +
      COLORS.map((c) => `<button class="sw${(p.color || DEFAULT_COLOR) === c ? ' on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('') +
      `<button class="sw${!p.color ? ' on' : ''}" data-color="" style="flex:1 0 60px">Varsayılan</button></div>` +
      btn(p.hidden ? '👁 Göster' : '⊘ Gizle', 'hide') + btn('↑ Yukarı', 'up') + btn('↓ Aşağı', 'down');
    hint = 'Gizli parça modele katılmaz. Sıra: 1. parça tabandır; oyuklar kendinden öncekileri keser.';
  } else if (tab === 'view') {
    const sec = section.on ? modelRange(section.axis) : [0, 1];
    const rg = Math.max(sec[1] - sec[0], 0.1);
    body = btn('Üst', 'view-top') + btn('Ön', 'view-front') + btn('Yan', 'view-side') + btn('İzo', 'view-iso') + btn('Sığdır', 'fit') +
      btn('Ortografik: ' + (settings.ortho ? 'açık' : 'kapalı'), 'ortho', settings.ortho) +
      btn('📏 Ölçüm', 'measure', measure.on) +
      btn('Kenar çizgisi: ' + (settings.edges === false || edgesBroken ? 'kapalı' : 'açık'), 'edges', settings.edges !== false && !edgesBroken) +
      btn('Etiket yok', 'dim-off', settings.dim === 'off') + btn('Model ölçüsü', 'dim-model', settings.dim === 'model') + btn('Parça ölçüsü', 'dim-part', settings.dim === 'part') +
      btn('mm', 'unit-mm', settings.unit === 'mm') + btn('cm', 'unit-cm', settings.unit === 'cm') + btn('inç', 'unit-in', settings.unit === 'in') +
      btn('Kesit: ' + (section.on ? 'açık' : 'kapalı'), 'sec-toggle', section.on) +
      (section.on
        ? btn('X', 'sec-x', section.axis === 'x') + btn('Y', 'sec-y', section.axis === 'y') + btn('Z', 'sec-z', section.axis === 'z') + btn('Ters çevir', 'sec-flip', section.flip) +
          `<label class="f w2" style="flex:1 0 100%"><span data-sl>Kesit konumu: ${lenText(section.pos)}</span>` +
          `<input type="range" data-s="pos" min="${sec[0]}" max="${sec[1]}" step="${rg / 200}" value="${section.pos}"></label>`
        : '');
    hint = 'Ölçüm: açıkken iki noktaya dokun (köşelere yapışır). Kesit: modeli ortadan kes.';
  } else {
    const fl = fieldsFor(p);
    body = fl.map(([l, k, kd]) => field(l, k, p, kd)).join('') + (p.type === 'sketch' ? btn('✎ Krokiyi düzenle', 'sketch-edit') : '');
    hint = 'Ölçüler (' + settings.unit + ')' + (p.type === 'box' || p.type === 'cylinder' ? '. Yuvarlama ve pah birlikte kullanılırsa yuvarlama geçerli olur. Eğim: üst yüz, her yönden yükseklik × tan(eğim) kadar daralır (döküm eğimi).' : '');
  }
  $('tabbody').innerHTML = body;
  $('tabhint').textContent = hint;
  $('b-move').classList.toggle('on', settings.move);
}

function syncInputs() {
  const p = cur();
  document.querySelectorAll('#tabbody input[data-k]').forEach((el) => {
    if (document.activeElement === el || el.dataset.t === 'text') return;
    const v = p[el.dataset.k];
    el.value = el.dataset.u === 'deg' ? fmtNum(v, 2) : lenVal(v);
  });
}

function updateToolbar() {
  $('b-undo').disabled = !hist.canUndo;
  $('b-redo').disabled = !hist.canRedo;
}

let saveT;
function scheduleSave() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    try { localStorage.setItem('cizim:auto', JSON.stringify({ snap: snapshot(), projName })); } catch (e) { /* dolu/engelli */ }
  }, 500);
}

function refreshAll(refit) {
  renderPanel();
  rebuild(!!refit);
  updateToolbar();
  scheduleSave();
}

/* ================= İşlemler ================= */
function addPart(type, op, dims) {
  commit();
  const p = newPart(nextId++, type, op, parts[0]);
  if (dims) Object.assign(p, dims);
  parts.push(p);
  sel = p.id;
  refreshAll();
  return p;
}

function removeCur() {
  if (parts.length < 2) { toast('Son parça silinemez'); return false; }
  commit();
  parts.splice(parts.indexOf(cur()), 1);
  sel = parts[0].id;
  refreshAll();
  return true;
}

function doUndo() {
  const s = hist.undo(snapshot());
  if (!s) { toast('Geri alınacak bir şey yok'); return false; }
  restore(s); refreshAll(); return true;
}
function doRedo() {
  const s = hist.redo(snapshot());
  if (!s) { toast('İleri alınacak bir şey yok'); return false; }
  restore(s); refreshAll(); return true;
}

function exportSTL() {
  if (!lastClean) { toast('Dışa aktarılacak model yok'); return; }
  const bytes = toSTLBinary(lastClean.attributes.position.array, true);
  const blob = new Blob([bytes], { type: 'model/stl' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (projName || 'model').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '.stl';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('STL indirildi (' + Math.floor(bytes.length / 50) + ' üçgen)');
}

/* ---- kroki ---- */
function sketchEditor(initial, onDone) {
  openSketch({ initial, uf: UNITS[settings.unit], unit: settings.unit, snaps: [1, 5, 10, 25], onDone, onCancel() {} });
}
function newSketch() {
  sketchEditor(null, (draw) => {
    commit();
    const p = Object.assign(newPart(nextId++, 'box', 'add', null), sketchFromDraw(draw));
    parts.push(p);
    sel = p.id;
    refreshAll(true);
    toast('Kroki parça olarak eklendi');
  });
}
function editSketch() {
  const p = cur();
  if (p.type !== 'sketch') return;
  sketchEditor(sketchToDraw(p), (draw) => {
    commit();
    const f = sketchFromDraw(draw);
    const keep = { x: p.x, y: p.y, z: p.z };
    if (draw.mode === 'revolve') { delete f.x; delete f.z; }
    else if (draw.plane === 'top') { delete f.y; }
    else { delete f.z; }
    Object.assign(p, f);
    if (draw.mode === 'revolve') { p.x = keep.x; p.z = keep.z; }
    refreshAll();
    toast('Kroki güncellendi');
  });
}

/* ---- çoğaltma ---- */
function sizeOf(p) {
  const b = partBBox(p.id);
  return b ? b.getSize(new THREE.Vector3()) : new THREE.Vector3(40, 40, 40);
}
function addCopies(list, msgText) {
  if (!list.length) { toast('Kopya oluşturulamadı'); return; }
  commit();
  for (const q of list) parts.push(q);
  nextId = Math.max(...list.map((q) => q.id)) + 1;
  sel = list[0].id;
  refreshAll();
  toast(msgText || list.length + ' parça eklendi');
}
function doDup(count = 1) {
  const p = cur();
  const gap = sizeOf(p).x + 10;
  if (count <= 1) addCopies([duplicatePart(p, nextId, gap, 0)], 'Kopyalandı');
  else addCopies(linearArray(p, nextId, Math.min(count, 40), gap, 0, 0));
}
function doMirror(axis) {
  const p = cur(), b = parts[0];
  const q = mirrorPart(p, nextId, axis, pos(b.x), pos(b.z));
  const same = axis === 'x' ? Math.abs(q.x - p.x) < 1e-6 : Math.abs(q.z - p.z) < 1e-6;
  if (same) { toast('Parça zaten ayna düzleminin üstünde; önce yana taşı'); return; }
  addCopies([q], 'Ayna kopyası eklendi');
}
function doLinear() {
  const n = Math.round(cp.n);
  if (!(n >= 1 && n <= 40)) { toast('Kopya sayısı 1 ile 40 arasında olmalı'); return; }
  addCopies(linearArray(cur(), nextId, n, cp.dx, cp.dy, cp.dz));
}
function doCircular() {
  const n = Math.round(cp.cn);
  if (!(n >= 2 && n <= 41)) { toast('Toplam adet 2 ile 41 arasında olmalı'); return; }
  const b = parts[0];
  addCopies(circularArray(cur(), nextId, n, pos(b.x), pos(b.z), cp.ang || 360));
}

/* ---- parça yönetimi ---- */
function moveCur(dir) {
  const i = parts.indexOf(cur()), j = i + dir;
  if (j < 0 || j >= parts.length) return;
  commit();
  [parts[i], parts[j]] = [parts[j], parts[i]];
  if (parts[0].op === 'sub') { parts[0].op = 'add'; toast('Tabana gelen parça artık oyuk değil, katı oldu'); }
  refreshAll();
}

/* ---- taşıma (sürükleme) + dokunma ---- */
const raycaster = new THREE.Raycaster();
raycaster.layers.enableAll();
const ndc = new THREE.Vector2();
function setRay(cx, cy) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
// Ekrandaki noktada görünen parça: modelin görünür yüzeyiyle çakışan ya da önündeki (hayalet) yüzey
function pickAt(cx, cy) {
  if (!pickMeshes.length) return null;
  setRay(cx, cy);
  let dm = Infinity;
  if (modelMesh) {
    const mh = raycaster.intersectObject(modelMesh, false);
    if (mh.length) dm = mh[0].distance;
  }
  const hits = raycaster.intersectObjects(pickMeshes, false);
  const eps = 0.05 + (isFinite(dm) ? dm * 1e-4 : 0);
  for (const h of hits) if (h.distance <= dm + eps) return { part: h.object.userData.part, point: h.point };
  return null;
}

let tap = null, drag = null, dragRaf = 0;
function startDrag(e, hit) {
  controls.enabled = false;
  const plane = new THREE.Plane();
  if (settings.drag === 'wall' || settings.drag === 'up') {
    const n = camera.position.clone().sub(hit.point);
    n.y = 0;
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    plane.setFromNormalAndCoplanarPoint(n.normalize(), hit.point);
  } else {
    plane.set(new THREE.Vector3(0, 1, 0), -hit.point.y);
  }
  const p = hit.part;
  drag = { id: p.id, plane, start: hit.point.clone(), x0: pos(p.x), y0: pos(p.y), z0: pos(p.z), started: false, pid: e.pointerId };
}
function endDrag() {
  controls.enabled = true;
  drag = null;
}

view.addEventListener('pointerdown', (e) => {
  if (!e.isPrimary) { if (drag) endDrag(); tap = null; return; }
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  tap = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false };
  if (settings.move && !measure.on) {
    const hit = pickAt(e.clientX, e.clientY);
    if (hit && hit.part.id === sel) startDrag(e, hit);
    else if (cur().op === 'sub') {
      // oyuk parça modelin içinde kalıp görünmeyebilir; yine de üzerinden tutup sürüklenebilsin
      setRay(e.clientX, e.clientY);
      const own = raycaster.intersectObjects(pickMeshes.filter((m) => m.userData.part && m.userData.part.id === sel), false);
      if (own.length) startDrag(e, { part: own[0].object.userData.part, point: own[0].point });
    }
  }
}, true);

window.addEventListener('pointermove', (e) => {
  if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap.moved = true;
  if (!drag || e.pointerId !== drag.pid) return;
  setRay(e.clientX, e.clientY);
  const pt = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(drag.plane, pt)) return;
  if (!drag.started) {
    if (!tap || !tap.moved) return;
    commit();
    drag.started = true;
    updateToolbar();
  }
  const p = parts.find((q) => q.id === drag.id);
  if (!p) return;
  const d = pt.sub(drag.start);
  if (settings.drag !== 'up') {
    p.x = snap(drag.x0 + d.x, settings.snap);
    p.z = snap(drag.z0 + d.z, settings.snap);
  }
  if (settings.drag === 'wall' || settings.drag === 'up') p.y = snap(drag.y0 + d.y, settings.snap);
  if (!dragRaf) {
    dragRaf = requestAnimationFrame(() => { dragRaf = 0; rebuild(false); syncInputs(); scheduleSave(); });
  }
});

function onPointerEnd(e) {
  if (drag && e.pointerId === drag.pid) endDrag();
  if (!tap || !e.isPrimary) return;
  const t = tap;
  tap = null;
  if (e.type === 'pointerup' && !t.moved && performance.now() - t.t < 600) onTap(e.clientX, e.clientY);
}
window.addEventListener('pointerup', onPointerEnd);
window.addEventListener('pointercancel', onPointerEnd);

function onTap(cx, cy) {
  if (measure.on) { measureTap(cx, cy); return; }
  if (tab === 'face') { faceTap(cx, cy); return; }
  if (tab === 'edge') { edgeTap(cx, cy); return; }
  if (tab === 'mate') { mateTap(cx, cy); return; }
  const hit = pickAt(cx, cy);
  if (hit && hit.part.id !== sel) {
    sel = hit.part.id;
    renderPanel();
    refreshOverlays();
  }
}

/* ---- ölçüm aracı ---- */
const measure = { on: false, pts: [] };
const msrGroup = new THREE.Group();
scene.add(msrGroup);

function renderMeasure() {
  disposeOverlay(msrGroup);
  msrSprites.length = 0;
  const el = $('measure');
  if (!measure.on) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  const pts = measure.pts;
  if (pts.length === 0) { el.textContent = '📏 Birinci noktaya dokun'; return; }
  const pg = new THREE.BufferGeometry().setFromPoints(pts);
  const dots = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xf43f5e, size: 11, sizeAttenuation: false, depthTest: false, transparent: true }));
  dots.userData.own = true; dots.renderOrder = 997; dots.layers.set(1);
  msrGroup.add(dots);
  if (pts.length === 1) { el.textContent = '📏 İkinci noktaya dokun'; return; }
  const [a, b] = pts;
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xf43f5e, depthTest: false, transparent: true }));
  line.userData.own = true; line.renderOrder = 996; line.layers.set(1);
  msrGroup.add(line);
  const d = dist3([a.x, a.y, a.z], [b.x, b.y, b.z]);
  const s = textSprite(lenText(d));
  s.position.copy(a.clone().add(b).multiplyScalar(0.5));
  msrGroup.add(s);
  msrSprites.push(s);
  const dd = (v) => fmtNum(toUnit(Math.abs(v), settings.unit), 2);
  el.textContent = '📏 ' + lenText(d) + '  ·  Δx ' + dd(b.x - a.x) + '  Δy ' + dd(b.y - a.y) + '  Δz ' + dd(b.z - a.z);
}

function measureTap(cx, cy) {
  if (!modelMesh) return;
  setRay(cx, cy);
  const hits = raycaster.intersectObject(modelMesh, false);
  if (!hits.length) return;
  const h = hits[0];
  let pt = h.point.clone();
  // en yakın köşeye yapış (22 px)
  const P = modelMesh.geometry.attributes.position;
  const rect = renderer.domElement.getBoundingClientRect();
  let best = 22;
  for (const i of [h.face.a, h.face.b, h.face.c]) {
    const v = new THREE.Vector3().fromBufferAttribute(P, i);
    const s = v.clone().project(camera);
    const sx = (s.x * 0.5 + 0.5) * rect.width + rect.left, sy = (-s.y * 0.5 + 0.5) * rect.height + rect.top;
    const dpx = Math.hypot(sx - cx, sy - cy);
    if (dpx < best) { best = dpx; pt = v; }
  }
  if (measure.pts.length >= 2) measure.pts = [];
  measure.pts.push(pt);
  renderMeasure();
}

function setMeasure(on) {
  measure.on = on;
  measure.pts = [];
  renderMeasure();
  if (on) toast('Ölçüm: iki noktaya dokun. Köşelere otomatik yapışır.');
}

/* ---- yüz seçimi: yüze delik / çıkıntı / kroki ---- */
let face = null; // { point, normal }
const faceGroup = new THREE.Group();
scene.add(faceGroup);
function clearFace() {
  face = null;
  disposeOverlay(faceGroup);
}
// modelde, verilen düzlemdeki (nokta + normal) üçgenler; bb verilirse yalnız o kutunun içindekiler
function faceRegion(n, point, bb) {
  const P = modelMesh.geometry.attributes.position;
  const out = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), tn = new THREE.Vector3();
  const cen = new THREE.Vector3();
  let area = 0;
  const lim = bb ? bb.clone().expandByScalar(0.06) : null;
  for (let i = 0; i + 2 < P.count; i += 3) {
    a.fromBufferAttribute(P, i); b.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
    tn.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
    const ar = tn.length() / 2;
    if (ar < 1e-6) continue;
    tn.normalize();
    if (tn.dot(n) > 0.999 && Math.abs(a.clone().sub(point).dot(n)) < 0.02) {
      if (lim && !(lim.containsPoint(a) && lim.containsPoint(b) && lim.containsPoint(c))) continue;
      out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      cen.add(a.clone().add(b).add(c).multiplyScalar(ar / 3));
      area += ar;
    }
  }
  return { out, center: area > 0 ? cen.multiplyScalar(1 / area) : null };
}
function regionMesh(out, color, opacity) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  }));
  m.userData.own = true; m.layers.set(1); m.renderOrder = 6;
  return m;
}
function faceTap(cx, cy) {
  if (!modelMesh) return;
  setRay(cx, cy);
  const hits = raycaster.intersectObject(modelMesh, false);
  disposeOverlay(faceGroup);
  if (!hits.length) { face = null; renderPanel(); return; }
  const h = hits[0];
  const n = h.face.normal.clone().normalize();
  face = { point: h.point.clone(), normal: n };
  // aynı düzlemdeki üçgenleri sarı göster
  faceGroup.add(regionMesh(faceRegion(n, h.point, null).out, 0xfacc15, 0.55));
  const dot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([h.point]),
    new THREE.PointsMaterial({ color: 0xf43f5e, size: 11, sizeAttenuation: false, depthTest: false, transparent: true }));
  dot.userData.own = true; dot.layers.set(1); dot.renderOrder = 997;
  faceGroup.add(dot);
  renderPanel();
}
// yüze oturan parça: yerel Y ekseni yüzün dışa bakan normali; inward = yüzeyin içine doğru kayma (mm)
function faceTransform(localX, localZ, inward) {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), face.normal);
  const p = face.point.clone().add(new THREE.Vector3(localX, 0, localZ).applyQuaternion(q)).addScaledVector(face.normal, -inward);
  const [rx, ry, rz] = quatToEulerXYZ([q.x, q.y, q.z, q.w]);
  const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
  return { x: r4(p.x), y: r4(p.y), z: r4(p.z), rx, ry, rz };
}
// desen: dokunulan noktaya göre yüz düzlemindeki (yerel X, Z) kaymalar
function faceOffsets() {
  if (cp.pat === 'grid') {
    const nx = Math.max(1, Math.min(20, Math.round(cp.px))), ny = Math.max(1, Math.min(20, Math.round(cp.py)));
    const out = [];
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push([(i - (nx - 1) / 2) * cp.sx, (j - (ny - 1) / 2) * cp.sy]);
    return out;
  }
  if (cp.pat === 'circ') {
    const n = Math.max(2, Math.min(60, Math.round(cp.pn)));
    return Array.from({ length: n }, (_, i) => [cp.pr * Math.cos((i / n) * Math.PI * 2), cp.pr * Math.sin((i / n) * Math.PI * 2)]);
  }
  return [[0, 0]];
}
function faceFeature(op) {
  if (!face) return;
  const depth = Math.max(cp.depth, 0.1);
  const round = cp.shape === 'round';
  const dims = round ? { d: Math.max(cp.fd, 0.1) } : { w: Math.max(cp.fw, 0.1), l: Math.max(cp.fl, 0.1) };
  // delik: yüzeyin dışına 1 mm taşar; çıkıntı: yüzeyin 0,5 mm içinden başlar (birleşsin)
  const inward = op === 'sub' ? depth : 0.5;
  const h = op === 'sub' ? depth + 1 : depth + 0.5;
  const offs = faceOffsets();
  if (offs.length > 64) { toast('Desen en fazla 64 parça olabilir'); return; }
  commit();
  let last = null;
  for (const [ox, oz] of offs) {
    const p = newPart(nextId++, round ? 'cylinder' : 'box', op, null);
    Object.assign(p, dims, { h, r: 0, c: 0 }, faceTransform(ox, oz, inward));
    if (offs.length > 1) p.name = (op === 'sub' ? 'Desen deliği ' : 'Desen çıkıntısı ') + (parts.length + 1);
    parts.push(p);
    last = p;
  }
  sel = last.id;
  clearFace();
  refreshAll();
  toast((op === 'sub' ? 'Delik açıldı' : 'Çıkıntı eklendi') + (offs.length > 1 ? ' (' + offs.length + ' adet)' : ''));
}
function faceSketch(op) {
  if (!face) return;
  const f = { point: face.point.clone(), normal: face.normal.clone() };
  openSketch({
    initial: null, uf: UNITS[settings.unit], unit: settings.unit, snaps: [1, 5, 10, 25], lockPlane: true,
    onDone(draw) {
      const sk = sketchFromDraw(draw);
      const h = sk.h;
      const saved = face;
      face = f;
      const inward = op === 'sub' ? h : 0.5;
      const t = faceTransform(sk.x, sk.z, inward);
      face = saved;
      commit();
      const p = Object.assign(newPart(nextId++, 'box', op, null), sk, { h: op === 'sub' ? h + 1 : h + 0.5 }, t);
      parts.push(p);
      sel = p.id;
      clearFace();
      refreshAll();
      toast(op === 'sub' ? 'Kroki oyuk olarak açıldı' : 'Kroki çıkıntı olarak eklendi');
    },
    onCancel() {},
  });
}

/* ---- kenar seçimi: tek kenara pah / yuvarlama (düz kutu parçaları) ---- */
let edgeSel = null; // { id, axis, sa, sb }  axis: serbest eksen; sa, sb: diğer iki eksenin işareti (-1/+1)
const EDGE_AXES = { x: ['y', 'z'], y: ['x', 'z'], z: ['x', 'y'] };
const boxEligible = (p) => p.type === 'box' && !p.hidden && !(p.r > 0.05) && !(p.c > 0.05) && !(p.tp > 0.01);
const partQuat = (p) => new THREE.Quaternion().setFromEuler(new THREE.Euler(pos(p.rx) * RAD, pos(p.ry) * RAD, pos(p.rz) * RAD, 'XYZ'));
// parça yerel koordinatı: alt-orta nokta orijin; x = genişlik, y = yükseklik (0..h), z = derinlik
function edgeEnds(p, axis, sa, sb) {
  const w = clamp(p.w), l = clamp(p.l), h = clamp(p.h);
  const half = { x: w / 2, z: l / 2 };
  const pt = (t) => {
    const v = { x: 0, y: h / 2, z: 0 };
    const [a1, a2] = EDGE_AXES[axis];
    const set = (a, sgn) => { v[a] = a === 'y' ? (sgn > 0 ? h : 0) : sgn * half[a]; };
    set(a1, sa); set(a2, sb);
    v[axis] = axis === 'y' ? h / 2 + t * h / 2 : t * half[axis];
    return new THREE.Vector3(v.x, v.y, v.z);
  };
  return [pt(-1), pt(1)];
}
const toWorld = (p, v) => v.clone().applyQuaternion(partQuat(p)).add(new THREE.Vector3(pos(p.x), pos(p.y), pos(p.z)));

function edgeTap(cx, cy) {
  disposeOverlay(faceGroup);
  edgeSel = null;
  if (!modelMesh) { renderPanel(); return; }
  setRay(cx, cy);
  const hits = raycaster.intersectObject(modelMesh, false);
  if (!hits.length) { renderPanel(); return; }
  const hp = hits[0].point;
  const r = renderer.domElement.getBoundingClientRect();
  const scr = (v) => { const s = v.clone().project(camera); return [(s.x * 0.5 + 0.5) * r.width + r.left, (-s.y * 0.5 + 0.5) * r.height + r.top]; };
  let best = null, bd = 28;
  for (const p of parts) {
    if (!boxEligible(p)) continue;
    const near = Math.min(clamp(p.w), clamp(p.l), clamp(p.h)) * 0.35 + 3;
    for (const axis of ['x', 'y', 'z']) {
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
        const [e0, e1] = edgeEnds(p, axis, sa, sb).map((v) => toWorld(p, v));
        // 3B yakınlık: dokunulan nokta bu kenara yakın olmalı (arkadaki kenarlar seçilmesin)
        const seg = new THREE.Line3(e0, e1);
        const cp3 = seg.closestPointToPoint(hp, true, new THREE.Vector3());
        if (cp3.distanceTo(hp) > near) continue;
        const [x0, y0] = scr(e0), [x1, y1] = scr(e1);
        const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((cx - x0) * dx + (cy - y0) * dy) / L2));
        const d = Math.hypot(cx - (x0 + t * dx), cy - (y0 + t * dy));
        if (d < bd) { bd = d; best = { id: p.id, axis, sa, sb }; }
      }
    }
  }
  if (best) {
    edgeSel = best;
    const p = parts.find((q) => q.id === best.id);
    const [e0, e1] = edgeEnds(p, best.axis, best.sa, best.sb).map((v) => toWorld(p, v));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([e0, e1]), new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false, transparent: true }));
    line.userData.own = true; line.layers.set(1); line.renderOrder = 998;
    faceGroup.add(line);
    const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints([e0, e1]), new THREE.PointsMaterial({ color: 0xf43f5e, size: 10, sizeAttenuation: false, depthTest: false, transparent: true }));
    dots.userData.own = true; dots.layers.set(1); dots.renderOrder = 999;
    faceGroup.add(dots);
  } else {
    toast('Yakında uygun bir kutu kenarı yok. Kenara daha yakın dokun.');
  }
  renderPanel();
}

// yerel (kutu çerçevesi) merkezli bir kesici parça kur: size = [w,h,l] (kendi eksenleri), extra = ek dönme (kuaterniyon)
function cutterPart(p, op, type, dims, localCenter, extraQ, name) {
  const qc = partQuat(p).multiply(extraQ);
  const worldCenter = toWorld(p, localCenter);
  const hc = dims.h;
  const piv = worldCenter.clone().addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(qc), -hc / 2);
  const [rx, ry, rz] = quatToEulerXYZ([qc.x, qc.y, qc.z, qc.w]);
  const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
  const q = newPart(nextId++, type, op, null);
  return Object.assign(q, dims, { r: 0, c: 0, x: r4(piv.x), y: r4(piv.y), z: r4(piv.z), rx, ry, rz, name, aux: true });
}

function edgeFeature(kind) {
  if (!edgeSel) return;
  const p = parts.find((q) => q.id === edgeSel.id);
  if (!p) return;
  const { axis, sa, sb } = edgeSel;
  const w = clamp(p.w), l = clamp(p.l), h = clamp(p.h);
  const len = { x: w, y: h, z: l }[axis];
  const perp = EDGE_AXES[axis];
  const maxSz = Math.min(...perp.map((a) => ({ x: w, y: h, z: l }[a]))) / 2 - 0.05;
  const sz = Math.min(Math.max(cp.es, 0.1), maxSz);
  if (!(maxSz > 0.1)) { toast('Kutu bu kenar için çok ince'); return; }
  if (cp.es > maxSz) toast('Ölçü kutuya göre büyük; ' + fmtNum(toUnit(sz, settings.unit), 2) + ' ' + settings.unit + ' yapıldı');
  const [e0, e1] = edgeEnds(p, axis, sa, sb);
  const edgeC = e0.clone().add(e1).multiplyScalar(0.5);           // kenar ortası
  const sgn = { [perp[0]]: sa, [perp[1]]: sb };
  const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  const list = [];
  const label = kind === 'chamfer' ? 'Kenar pahı' : 'Kenar yuvarlama';
  // kesici boyutlarını kendi (w,h,l) eksenlerine yaz
  const dimsFor = (freeLen, sq1, sq2) => {
    const o = { x: 0, y: 0, z: 0 };
    o[axis] = freeLen; o[perp[0]] = sq1; o[perp[1]] = sq2;
    return { w: o.x, h: o.y, l: o.z };
  };
  commit();
  if (kind === 'chamfer') {
    const sd = sz * Math.SQRT2;
    const extra = new THREE.Quaternion().setFromAxisAngle(AX[axis], Math.PI / 4);
    list.push(cutterPart(p, 'sub', 'box', dimsFor(len + 2, sd, sd), edgeC, extra, label));
  } else {
    // 1) köşeyi kare olarak oy  2) aynı yere yarıçaplı silindiri geri ekle
    const sqc = edgeC.clone();
    const cylc = edgeC.clone();
    for (const a of perp) {
      // dışa doğru işaret: y için üst yüz +, alt yüz -; x,z için işaretin kendisi. İçeri yönü tersi.
      const out = sgn[a];
      sqc[a] += -out * (sz / 2 - 0.5);   // kare: dışarı 1 mm taşar, içeri sz kadar
      cylc[a] += -out * sz;              // silindir ekseni: köşeden sz kadar içeride
    }
    list.push(cutterPart(p, 'sub', 'box', dimsFor(len + 2, sz + 1, sz + 1), sqc, new THREE.Quaternion(), label));
    // silindir: kendi y ekseni serbest eksene hizalanmalı
    const q = new THREE.Quaternion();
    if (axis === 'x') q.setFromAxisAngle(AX.z, -Math.PI / 2);
    else if (axis === 'z') q.setFromAxisAngle(AX.x, Math.PI / 2);
    list.push(cutterPart(p, 'add', 'cylinder', { d: sz * 2, h: len, w: 10, l: 10 }, cylc, q, label + ' (dolgu)'));
  }
  for (const q of list) parts.push(q);
  sel = list[0].id;
  edgeSel = null;
  disposeOverlay(faceGroup);
  refreshAll();
  toast(kind === 'chamfer' ? 'Kenar pah kırıldı' : 'Kenar yuvarlandı');
}

/* ---- kabuk: parçanın içini boşalt ---- */
const shellEligible = (p) => !p.hidden && p.op !== 'sub' &&
  ((p.type === 'box' && !(p.r > 0.05) && !(p.c > 0.05) && !(p.tp > 0.01)) ||
   (p.type === 'cylinder' && !(p.r > 0.05) && !(p.c > 0.05) && !(p.tp > 0.01)) ||
   p.type === 'sphere');
function shellFeature() {
  const p = cur();
  if (!shellEligible(p)) { toast('Bu parça kabuk yapılamaz'); return; }
  const t = Math.max(cp.wall, 0.1);
  const id = new THREE.Quaternion();
  let cut;
  if (p.type === 'sphere') {
    const d = clamp(p.d) - 2 * t;
    if (!(d > 0.2)) { toast('Duvar kalınlığı küre için çok büyük'); return; }
    cut = cutterPart(p, 'sub', 'sphere', { d, h: d }, new THREE.Vector3(0, clamp(p.d) / 2, 0), id, 'Kabuk (iç boşluk)');
  } else {
    const h = clamp(p.h);
    const yb = cp.openBot ? -1 : t, yt = cp.openTop ? h + 1 : h - t;
    if (!(yt - yb > 0.2)) { toast('Duvar kalınlığı yüksekliğe göre çok büyük'); return; }
    const c = new THREE.Vector3(0, (yb + yt) / 2, 0);
    if (p.type === 'box') {
      const w = clamp(p.w) - 2 * t, l = clamp(p.l) - 2 * t;
      if (!(w > 0.2 && l > 0.2)) { toast('Duvar kalınlığı kutu için çok büyük'); return; }
      cut = cutterPart(p, 'sub', 'box', { w, l, h: yt - yb }, c, id, 'Kabuk (iç boşluk)');
    } else {
      const d = clamp(p.d) - 2 * t;
      if (!(d > 0.2)) { toast('Duvar kalınlığı silindir için çok büyük'); return; }
      cut = cutterPart(p, 'sub', 'cylinder', { d, h: yt - yb, w: 10, l: 10 }, c, id, 'Kabuk (iç boşluk)');
    }
  }
  commit();
  parts.push(cut);
  sel = cut.id;
  refreshAll();
  toast('Kabuk yapıldı. Not: iç boşluk, sonraki parçalarla çakışmaz; ondan önceki parçaları da keser.');
}

/* ---- montaj: iki yüzü yüze oturt ---- */
const mate = { a: null, b: null };
function mateTap(cx, cy) {
  if (!modelMesh) return;
  const hit = pickAt(cx, cy);
  setRay(cx, cy);
  const hits = raycaster.intersectObject(modelMesh, false);
  if (!hit || !hits.length) { toast('Bir parçanın yüzüne dokun.'); return; }
  const h = hits[0];
  const n = h.face.normal.clone().normalize();
  const reg = faceRegion(n, h.point, partBBox(hit.part.id));
  const entry = { id: hit.part.id, normal: n, point: h.point.clone(), center: reg.center || h.point.clone(), tris: reg.out };
  if (mate.a && mate.b) { mate.a = mate.b = null; disposeOverlay(faceGroup); }
  if (!mate.a) {
    mate.a = entry;
    faceGroup.add(regionMesh(entry.tris, 0xfacc15, 0.6));
  } else {
    if (entry.id === mate.a.id) { toast('İkinci yüz başka bir parçada olmalı.'); return; }
    mate.b = entry;
    faceGroup.add(regionMesh(entry.tris, 0x22c55e, 0.6));
  }
  renderPanel();
}
function mateApply() {
  if (!mate.a || !mate.b) { toast('Önce iki yüz seç.'); return; }
  const A = parts.find((q) => q.id === mate.a.id);
  if (!A) { toast('Parça bulunamadı'); return; }
  const nA = mate.a.normal, nB = mate.b.normal;
  const pA = cp.mcenter ? mate.a.center : mate.a.point;
  const pB = cp.mcenter ? mate.b.center : mate.b.point;
  const q1 = new THREE.Quaternion().setFromUnitVectors(nA, nB.clone().negate());
  const q = new THREE.Quaternion().setFromAxisAngle(nB, pos(cp.mrot) * RAD).multiply(q1);
  const newQ = q.clone().multiply(partQuat(A));
  const np = pB.clone().add(new THREE.Vector3(pos(A.x), pos(A.y), pos(A.z)).sub(pA).applyQuaternion(q)).addScaledVector(nB, pos(cp.mgap));
  commit();
  const r4 = (v) => Math.round(v * 1e4) / 1e4 + 0;
  A.x = r4(np.x); A.y = r4(np.y); A.z = r4(np.z);
  [A.rx, A.ry, A.rz] = quatToEulerXYZ([newQ.x, newQ.y, newQ.z, newQ.w]);
  sel = A.id;
  mate.a = mate.b = null;
  disposeOverlay(faceGroup);
  refreshAll();
  toast('Parça yüzü yüze birleştirildi');
}

/* ---- teknik resim: ön / yan / üst / izometrik, ölçü çizgileri, PNG + PDF ---- */
function makeSheet() {
  if (!lastClean || !lastClean.boundingBox) { toast('Önce bir model olmalı'); return; }
  const bb = lastClean.boundingBox;
  const size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
  const L = sheetLayout(size.x, size.y, size.z);
  const K = 6; // kağıt mm başına piksel
  const cv = document.createElement('canvas');
  cv.width = Math.round(L.sheet.w * K); cv.height = Math.round(L.sheet.h * K);
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);

  const saved = {
    pos: camera.position.clone(), quat: camera.quaternion.clone(), up: camera.up.clone(),
    fov: camera.fov, near: camera.near, far: camera.far, aspect: camera.aspect, pr: renderer.getPixelRatio(),
    color: edgeMat.uniforms.uColor.value.clone(),
  };
  const R = size.length() / 2;
  const shot = (box, dir, up, ppm) => {
    const pad = 4;
    const VW = Math.max(16, Math.round(box.w * K + 2 * pad)), VH = Math.max(16, Math.round(box.h * K + 2 * pad));
    renderer.setPixelRatio(1);
    renderer.setSize(VW, VH, false);
    rt.setSize(VW, VH);
    edgeMat.uniforms.uTexel.value.set(1 / VW, 1 / VH);
    camera.fov = 1.5; camera.aspect = VW / VH;
    const dist = (VH / (2 * ppm)) / Math.tan(camera.fov * RAD / 2);
    camera.position.copy(ctr).addScaledVector(dir.clone().normalize(), dist);
    camera.up.copy(up);
    camera.lookAt(ctr);
    camera.near = Math.max(dist - R - 10, 1); camera.far = dist + R + 10;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    renderer.setRenderTarget(null);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    drawEdges();
    g.drawImage(renderer.domElement, 0, 0, VW, VH, box.x * K - pad, box.y * K - pad, VW, VH);
  };
  try {
    edgeMat.uniforms.uColor.value.set(0x111111);
    const ppm = L.scale * K;
    shot(L.front, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), ppm);
    shot(L.side, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), ppm);
    shot(L.top, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), ppm);
    const ippm = Math.min(L.iso.w, L.iso.h) * K / (2 * R * 1.15);
    shot(L.iso, new THREE.Vector3(1, 0.8, 1), new THREE.Vector3(0, 1, 0), ippm);
  } finally {
    edgeMat.uniforms.uColor.value.copy(saved.color);
    camera.position.copy(saved.pos); camera.up.copy(saved.up); camera.quaternion.copy(saved.quat);
    camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far; camera.aspect = saved.aspect;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    renderer.setPixelRatio(saved.pr);
    resize();
  }

  // --- 2B: çerçeve, ölçü çizgileri, yazılar ---
  const mm = (v) => v * K;
  const num = (v) => fmtNum(toUnit(v, settings.unit), 2);
  g.strokeStyle = '#111'; g.fillStyle = '#111'; g.lineWidth = 2;
  g.strokeRect(mm(10), mm(10), mm(L.sheet.w - 20), mm(L.sheet.h - 20));
  const tb = L.titleBlock;
  g.strokeRect(mm(tb.x), mm(tb.y), mm(tb.w), mm(tb.h));
  const font = (mmSize, bold) => { g.font = (bold ? 'bold ' : '') + Math.round(mm(mmSize)) + 'px system-ui, Arial, sans-serif'; };
  font(5, true); g.textBaseline = 'middle';
  g.textAlign = 'left'; g.fillText(projName || 'model', mm(tb.x + 4), mm(tb.y + 7));
  font(3.4, false);
  g.fillText('Ölçek: ' + scaleLabel(L.scale) + '   Birim: ' + settings.unit + '   Üçüncü açı', mm(tb.x + 4), mm(tb.y + 15));
  g.textAlign = 'right';
  g.fillText(new Date().toLocaleDateString('tr-TR') + '   Çizim Atölyesi', mm(tb.x + tb.w - 4), mm(tb.y + 15));
  g.fillText('Genel ölçü: ' + num(size.x) + ' × ' + num(size.z) + ' × ' + num(size.y), mm(tb.x + tb.w - 4), mm(tb.y + 7));
  g.lineWidth = 1.2;
  const arrow = (x, y, dx, dy) => {
    const a = mm(2.2), b = mm(0.8);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x - dx * a - dy * b, y - dy * a + dx * b); g.lineTo(x - dx * a + dy * b, y - dy * a - dx * b); g.closePath(); g.fill();
  };
  const hdim = (x1, x2, yBox, off, v) => {           // yatay ölçü: yBox'tan off kadar aşağıda
    const y = yBox + off;
    g.beginPath(); g.moveTo(mm(x1), mm(yBox + 1.5)); g.lineTo(mm(x1), mm(y + 1.5)); g.moveTo(mm(x2), mm(yBox + 1.5)); g.lineTo(mm(x2), mm(y + 1.5));
    g.moveTo(mm(x1), mm(y)); g.lineTo(mm(x2), mm(y)); g.stroke();
    arrow(mm(x1), mm(y), -1, 0); arrow(mm(x2), mm(y), 1, 0);
    font(3.4, false); g.textAlign = 'center'; g.fillText(num(v), mm((x1 + x2) / 2), mm(y - 2.2));
  };
  const vdim = (y1, y2, xBox, off, v) => {           // dikey ölçü: xBox'tan off kadar sağda (negatif = solda)
    const x = xBox + off, sg = off < 0 ? -1 : 1;
    g.beginPath(); g.moveTo(mm(xBox + sg * 1.5), mm(y1)); g.lineTo(mm(x + sg * 1.5), mm(y1)); g.moveTo(mm(xBox + sg * 1.5), mm(y2)); g.lineTo(mm(x + sg * 1.5), mm(y2));
    g.moveTo(mm(x), mm(y1)); g.lineTo(mm(x), mm(y2)); g.stroke();
    arrow(mm(x), mm(y1), 0, -1); arrow(mm(x), mm(y2), 0, 1);
    g.save(); g.translate(mm(x - 2.2), mm((y1 + y2) / 2)); g.rotate(-Math.PI / 2); font(3.4, false); g.textAlign = 'center'; g.fillText(num(v), 0, 0); g.restore();
  };
  const f = L.front, sd = L.side, tp = L.top;
  hdim(f.x, f.x + f.w, f.y + f.h, 7, size.x);
  vdim(f.y, f.y + f.h, f.x, -7, size.y);
  vdim(tp.y, tp.y + tp.h, tp.x + tp.w, 7, size.z);
  hdim(sd.x, sd.x + sd.w, sd.y + sd.h, 7, size.z);
  font(3.2, true); g.textAlign = 'left';
  g.fillText('Önden', mm(f.x), mm(f.y - 1)); g.fillText('Sağdan', mm(sd.x), mm(sd.y - 1));
  g.fillText('Üstten', mm(tp.x), mm(tp.y - 1)); g.fillText('İzometrik (ölçeksiz)', mm(L.iso.x), mm(L.iso.y - 1));

  showSheet(cv);
}
function showSheet(cv) {
  let o = $('sheetov');
  if (o) o.remove();
  o = document.createElement('div');
  o.id = 'sheetov';
  o.style.cssText = 'position:fixed;inset:0;z-index:40;background:#0f172a;display:flex;flex-direction:column;font-family:system-ui,sans-serif';
  o.innerHTML = '<div style="display:flex;gap:6px;padding:8px"><button data-sh="close" style="flex:1;background:#7f1d1d">✕ Kapat</button>' +
    '<button data-sh="png" style="flex:1">⬇ PNG</button><button data-sh="pdf" style="flex:1">⬇ PDF</button><button data-sh="zoom" style="flex:1">🔍 Büyüt</button></div>' +
    '<div id="sheetsc" style="flex:1;overflow:auto;background:#1e293b;touch-action:pan-x pan-y pinch-zoom"></div>';
  o.querySelectorAll('button').forEach((b) => { b.style.cssText += ';font:inherit;font-weight:600;color:#fff;border:0;border-radius:8px;padding:10px 4px;background:' + (b.style.background || '#1e293b') + ';background-color:' + (b.dataset.sh === 'close' ? '#7f1d1d' : '#0369a1'); });
  const sc = o.querySelector('#sheetsc');
  cv.style.cssText = 'width:100%;height:auto;display:block;background:#fff';
  sc.appendChild(cv);
  document.body.appendChild(o);
  let big = false;
  const name = (projName || 'model').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '-teknik-resim';
  const save = (blob, ext) => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name + '.' + ext;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
  o.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const a = b.dataset.sh;
    if (a === 'close') o.remove();
    else if (a === 'zoom') { big = !big; cv.style.width = big ? '250%' : '100%'; b.textContent = big ? '🔍 Küçült' : '🔍 Büyüt'; }
    else if (a === 'png') cv.toBlob((bl) => { if (bl) { save(bl, 'png'); toast('PNG indirildi'); } }, 'image/png');
    else if (a === 'pdf') {
      const b64 = cv.toDataURL('image/jpeg', 0.92).split(',')[1];
      const bin = atob(b64), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      save(new Blob([jpegToPdf(u, cv.width, cv.height)], { type: 'application/pdf' }), 'pdf');
      toast('PDF indirildi');
    }
  });
}

/* ================= Projeler ================= */
function loadProjects() {
  try { return JSON.parse(localStorage.getItem('cizim:projects') || '{}'); } catch (e) { return {}; }
}
function storeProjects(all) {
  try { localStorage.setItem('cizim:projects', JSON.stringify(all)); return true; } catch (e) { toast('Kaydedilemedi (tarayıcı belleği dolu ya da kapalı)'); return false; }
}
function saveProject(name) {
  const all = loadProjects();
  all[name] = { data: snapshot(), at: Date.now() };
  if (storeProjects(all)) { projName = name; scheduleSave(); toast('Kaydedildi: ' + name); }
}
function renderDialog() {
  const all = loadProjects();
  const names = Object.keys(all).sort((a, b) => all[b].at - all[a].at);
  $('pname').value = projName;
  $('plist').innerHTML = names.length
    ? names.map((n) => `<div class="pi"><span>${esc(n)}<small>${new Date(all[n].at).toLocaleString('tr-TR')}</small></span>` +
        `<button data-open="${esc(n)}">Aç</button><button class="danger" data-delp="${esc(n)}">Sil</button></div>`).join('')
    : '<div class="small">Henüz kayıtlı proje yok.</div>';
}
const openDialog = () => { renderDialog(); $('dlg').classList.add('open'); };
const closeDialog = () => $('dlg').classList.remove('open');

/* ================= Olaylar ================= */
function afterSettings() {
  saveSettings();
  renderPanel();
  refreshOverlays();
  renderMeasure();
}

document.addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t) return;
  if (t.closest('#sk')) return; // kroki editörü kendi düğmelerini yönetir

  if (t.dataset.sel) { sel = Number(t.dataset.sel); renderPanel(); refreshOverlays(); return; }
  if (t.dataset.color !== undefined) { commit(); cur().color = t.dataset.color || undefined; refreshAll(); return; }
  if (t.dataset.open) {
    const all = loadProjects(), pr = all[t.dataset.open];
    if (pr) { commit(); restore(pr.data); projName = t.dataset.open; closeDialog(); refreshAll(true); toast('Açıldı: ' + projName); }
    return;
  }
  if (t.dataset.delp) {
    const all = loadProjects();
    delete all[t.dataset.delp];
    storeProjects(all);
    renderDialog();
    return;
  }

  const act = t.dataset.act;
  if (!act) return;
  const p = cur();

  if (act.startsWith('add-')) { addPart(act.slice(4), 'add'); return; }
  if (act.startsWith('tab-')) { tab = act.slice(4); if (tab !== 'face' && tab !== 'edge' && tab !== 'mate') clearFace();
    if (tab !== 'mate') { mate.a = null; mate.b = null; } renderPanel(); return; }
  if (act === 'edge-chamfer') { edgeFeature('chamfer'); return; }
  if (act === 'edge-fillet') { edgeFeature('fillet'); return; }
  if (act.startsWith('fshape-')) { cp.shape = act.slice(7); renderPanel(); return; }
  if (act.startsWith('pat-')) { cp.pat = act.slice(4); renderPanel(); return; }
  if (act === 'shell-top') { cp.openTop = !cp.openTop; renderPanel(); return; }
  if (act === 'shell-bot') { cp.openBot = !cp.openBot; renderPanel(); return; }
  if (act === 'shell-do') { shellFeature(); return; }
  if (act === 'mate-center') { cp.mcenter = !cp.mcenter; renderPanel(); return; }
  if (act === 'mate-do') { mateApply(); return; }
  if (act === 'mate-reset') { mate.a = mate.b = null; disposeOverlay(faceGroup); renderPanel(); return; }
  if (act === 'sheet-make') { makeSheet(); return; }
  if (act === 'edges') { settings.edges = settings.edges === false; afterSettings(); return; }
  if (act === 'face-hole') { faceFeature('sub'); return; }
  if (act === 'face-boss') { faceFeature('add'); return; }
  if (act === 'face-sk-cut') { faceSketch('sub'); return; }
  if (act === 'face-sk-boss') { faceSketch('add'); return; }
  if (act === 'hole-round') { addPart('cylinder', 'sub'); return; }
  if (act === 'hole-square') { addPart('box', 'sub'); return; }
  if (act === 'sketch-new') { newSketch(); return; }
  if (act === 'sketch-edit') { editSketch(); return; }
  if (act.startsWith('type-')) { commit(); p.type = act.slice(5); refreshAll(); return; }
  if (act === 'op-add') { commit(); p.op = 'add'; refreshAll(); return; }
  if (act === 'op-sub') { commit(); p.op = 'sub'; refreshAll(); return; }
  if (act === 'fit') { fit(lastClean ? lastClean.boundingBox : null); return; }
  if (act === 'del') { removeCur(); return; }
  if (act === 'undo') { doUndo(); return; }
  if (act === 'redo') { doRedo(); return; }
  if (act === 'stl') { exportSTL(); return; }
  if (act === 'mic') { toggleMic(); return; }
  if (act === 'projects') { openDialog(); return; }
  if (act === 'dlg-close') { closeDialog(); return; }
  if (act === 'dlg-save') { saveProject(($('pname').value || '').trim() || 'model'); renderDialog(); return; }
  if (act === 'dlg-new') {
    commit();
    parts = freshParts(); sel = 1; nextId = 2; projName = 'model';
    closeDialog(); refreshAll(true);
    return;
  }
  if (act === 'panel') {
    const w = $('panelwrap');
    const hidden = w.style.display === 'none';
    w.style.display = hidden ? '' : 'none';
    $('b-panel').textContent = hidden ? '▲' : '▼';
    return;
  }

  // çoğaltma
  if (act === 'copy-dup') { doDup(1); return; }
  if (act === 'copy-mx') { doMirror('x'); return; }
  if (act === 'copy-mz') { doMirror('z'); return; }
  if (act === 'copy-lin') { doLinear(); return; }
  if (act === 'copy-circ') { doCircular(); return; }
  // parça yönetimi
  if (act === 'hide') { commit(); p.hidden = !p.hidden; refreshAll(); return; }
  if (act === 'up') { moveCur(-1); return; }
  if (act === 'down') { moveCur(1); return; }
  // görünüm
  if (act.startsWith('view-')) { setView(act.slice(5)); return; }
  if (act === 'ortho') { setOrtho(!settings.ortho); renderPanel(); return; }
  if (act === 'measure') { setMeasure(!measure.on); renderPanel(); return; }
  if (act.startsWith('dim-')) { settings.dim = act.slice(4); afterSettings(); return; }
  if (act.startsWith('unit-')) { settings.unit = act.slice(5); afterSettings(); return; }
  if (act.startsWith('snap-')) { settings.snap = Number(act.slice(5)); afterSettings(); return; }
  if (act.startsWith('drag-')) { settings.drag = act.slice(5); afterSettings(); return; }
  if (act === 'move') {
    settings.move = !settings.move;
    renderPanel();
    toast(settings.move ? 'Taşı açık: seçili parçayı parmakla sürükle. Dokunarak başka parça seç.' : 'Taşı kapalı: sürükleme sahneyi döndürür.');
    return;
  }
  // kesit
  if (act === 'sec-toggle') {
    section.on = !section.on;
    if (section.on) { const [a, b] = modelRange(section.axis); section.pos = (a + b) / 2; }
    applySection(); renderPanel();
    return;
  }
  if (act.startsWith('sec-') && 'xyz'.includes(act.slice(4)) && act.length === 5) {
    section.axis = act.slice(4);
    const [a, b] = modelRange(section.axis); section.pos = (a + b) / 2;
    applySection(); renderPanel();
    return;
  }
  if (act === 'sec-flip') { section.flip = !section.flip; applySection(); renderPanel(); return; }
});

// Yazarken paneli yeniden çizme (klavye kapanmasın); sadece modeli güncelle
let lastKey = '', lastAt = 0;
document.addEventListener('input', (e) => {
  const el = e.target;
  const d = el.dataset || {};
  if (d.s) {
    section.pos = el.valueAsNumber;
    applySection();
    const sl = document.querySelector('[data-sl]');
    if (sl) sl.textContent = 'Kesit konumu: ' + lenText(section.pos);
    return;
  }
  if (d.c) {
    const v = el.valueAsNumber;
    if (isFinite(v)) cp[d.c] = d.u === 'len' ? fromUnit(v, settings.unit) : v;
    if (['n', 'dx', 'dy', 'dz', 'cn', 'ang'].includes(d.c)) cp.touched = true;
    return;
  }
  const k = d.k;
  if (!k) return;
  const key = cur().id + '.' + k, now = Date.now();
  if (key !== lastKey || now - lastAt > 1500) { commit(); updateToolbar(); }
  lastKey = key; lastAt = now;
  if (d.t === 'text') { cur()[k] = el.value; renderChips(); scheduleSave(); return; }
  cur()[k] = d.u === 'deg' ? el.valueAsNumber : fromUnit(el.valueAsNumber, settings.unit);
  rebuild(false);
  scheduleSave();
});

/* ================= Sesli komut ================= */
function describe(c) {
  if (c.cmd === 'add') return TYPE_LABEL[c.type] + (c.op === 'sub' ? ' oyuğu' : '') + ' eklendi';
  if (c.cmd === 'set') return 'ölçü değişti';
  if (c.cmd === 'rotate') return c.axis.toUpperCase() + ' ekseninde ' + c.deg + '° döndürüldü';
  if (c.cmd === 'copy') return 'kopyalandı';
  if (c.cmd === 'mirror') return c.axis.toUpperCase() + ' yönünde aynalandı';
  if (c.cmd === 'view') return 'görünüm değişti';
  return 'tamam';
}

function applyCommands(cmds, heard) {
  for (const c of cmds) {
    let ok = true;
    switch (c.cmd) {
      case 'undo': ok = doUndo(); break;
      case 'redo': ok = doRedo(); break;
      case 'fit': fit(lastClean ? lastClean.boundingBox : null); break;
      case 'export': exportSTL(); return;
      case 'save': saveProject(projName || 'model'); return;
      case 'delete': ok = removeCur(); break;
      case 'add': addPart(c.type, c.op, c.dims); break;
      case 'set': commit(); cur()[c.key] = c.value; refreshAll(); break;
      case 'rotate': commit(); cur()['r' + c.axis] = c.deg; refreshAll(); break;
      case 'copy': doDup(c.count); break;
      case 'mirror': doMirror(c.axis); break;
      case 'view': setView(c.view); break;
      default:
        toast('Anlayamadım: "' + heard + '"');
        return;
    }
    if (ok) toast('🎤 "' + heard + '" → ' + describe(c));
  }
}

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function toggleMic() {
  if (!SR) { toast('Bu tarayıcıda sesli komut yok. Chrome kullan.'); return; }
  if (rec) { rec.stop(); return; }
  rec = new SR();
  rec.lang = 'tr-TR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = (e) => {
    const text = e.results[0][0].transcript;
    applyCommands(parseVoice(text), text);
  };
  rec.onerror = (e) => {
    toast(e.error === 'not-allowed' ? 'Mikrofon izni verilmedi' : 'Ses hatası: ' + e.error);
  };
  rec.onend = () => { rec = null; $('b-mic').classList.remove('rec'); };
  $('b-mic').classList.add('rec');
  toast('Dinliyorum... örnek: "elli milimetre çapında silindir ekle"');
  try { rec.start(); } catch (err) { rec = null; $('b-mic').classList.remove('rec'); }
}

/* ================= Başlangıç ================= */
try {
  const a = JSON.parse(localStorage.getItem('cizim:auto') || 'null');
  if (a && a.snap) { restore(a.snap); projName = a.projName || 'model'; }
} catch (e) { /* bozuk kayıt: varsayılanla devam */ }

// test / hata ayıklama için küçük kanca (arayüzü etkilemez)
window.__app = { edgeMat, selfTestEdges, get edgesBroken() { return edgesBroken; }, applyCommands, parseVoice, get parts() { return parts; }, get lastClean() { return lastClean; }, get modelMesh() { return modelMesh; }, settings, section, measure, rebuild, refreshAll, THREE, camera };

renderPanel();
updateToolbar();
rebuild(true);
edgesBroken = !selfTestEdges();
if (edgesBroken) toast('Bu cihazda kenar çizgisi doğru çizilemiyor; kapatıldı (Görünüm sekmesinden denenebilir).');
