import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { Brush, Evaluator, ADDITION, SUBTRACTION } from 'three-bvh-csg';
import { MeshBVH } from 'three-mesh-bvh';
import {
  TYPE_LABEL, DEFAULTS, heightOf, signedVolume, newPart, History, toSTLBinary, parseVoice,
  UNITS, toUnit, fromUnit, fmtNum, snap, dist3,
  sketchFromDraw, sketchToDraw, revolveProfile, chamferBoxPoints, cylinderProfile, circlePts,
  duplicatePart, mirrorPart, linearArray, circularArray, quatToEulerXYZ,
  VIEW_DIRS, sectionPlane, fovDistance, sheetLayout, scaleLabel, jpegToPdf,
  cornerCut, coneProfile, ringProfile, cornersAbove, classifyLoops, descendantsOf, wouldCycle, cleanLinks,
  sweepTris, loftTris, frameCalc, frameMembers, miterOK, PROFILES, matById, minBendRadius, minTubeCLR, beamCheck, eulerBuckling, judge, sheetCalc, sheetFlatLines, SHEET_PRESETS, MATERIALS, meshProps, massGrams, bomRows, csvFromRows, dxfFromLayers, packMesh, unpackMesh, VIEW_TO_VIEWER, sheetProject, holeList, viewEdges, chainPolylines, sectionFit, profileArea,
} from './logic.js?v=20261112t';
import { openSketch } from './sketch.js?v=20261112t';
import { to3MF, toSTEP } from './export3d.js?v=20261112t';
import { EXAMPLES, buildExample, GUIDE } from './examples.js?v=20261112t';
import { openCad2D } from './cad2d.js?v=20261112t';
import { openCutOpt } from './cutopt-ui.js?v=20261112t';
import { createMfg } from './mfg-ui.js?v=20261112t';
import { createWeldUI, newPlan as newWeldPlan } from './weld-ui.js?v=20261112t';
import { drawWeldSymbol, METHODS as WELD_METHODS } from './welds.js?v=20261112t';
import { analyzeWeight } from './weight.js?v=20261112t';
import { createWeightUI, fkg } from './weight-ui.js?v=20261112t';
import { createCostUI } from './cost-ui.js?v=20261112t';
import { planReport as weldReport } from './welds.js?v=20261112t';
import { altCons as weldAltCons } from './weld-ui.js?v=20261112t';
import { groupKey } from './cutopt.js?v=20261112t';
import { createAssemblyUI } from './assembly-ui.js?v=20261112t';
import { createSimUI } from './sim-ui.js?v=20261112t';
import { gearOutline, gearDims, centerDistance, COUPLINGS, couplingK, couplingValid, propagate as mechPropagate, rpmToDegPerSec } from './mech.js?v=20261112t';
import { Mesh as CMesh, interference as cInterference, holeAxis as cHoleAxis } from './mfgcheck.js?v=20261112t';
import { createCamUI } from './cam-ui.js?v=20261112t';
import { createCam5UI } from './cam5-ui.js?v=20261112t';
import { createLatheUI } from './lathe-ui.js?v=20261112t';
import { machinePose } from './kin.js?v=20261112t';
import { createOcctUI } from './occt-ui.js?v=20261112t';
import { createFemUI } from './fem-ui.js?v=20261112t';

const APP_VER = '20261112t'; // index.html, app.js ve içe aktarmalardaki ?v= ile aynı olmalı (önbelleği aşmak için)
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
// boş alana dokununca seçim kaldırılır: selOff = seçimi kaldırılan parçanın id'si (sel değişince kendiliğinden geçersiz olur).
// sel değeri korunur (cur() eski davranışla çalışmaya devam eder); yalnızca vurgu ve parça paneli gizlenir.
let selOff = null;
const hasSel = () => !(selOff != null && selOff === sel) && parts.some((p) => p.id === sel);
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
  mgap: 0, mrot: 0, mcenter: true, mtype: 'coinc', mval: 0, mang: 90, mflip: false };                                      // montaj // çoğaltma + yüz ayarları (mm)

const hist = new History();
let weldPlan = null;   // Akıllı Kaynak Planlama: { welds, set, symbols, ver }
let mechData = { cs: [], motor: null };   // Mekanizma: bağıntılar (dişli, kasnak, kremayer, vida, oran) ve motor
let simData = null;   // Geleceğimi Göster: onay, test kurulumu, saklanan alternatifler
let femData = null;   // 📐 Analiz: kurulum (malzeme, ağ, sınır koşulları) ve sonuç özetleri
let asmAnswers = {};   // Montaj planı: kullanıcının bildirdiği bağlantı türleri { 'a-b': 'kaynak' | 'cıvata' | ... }
const snapshot = () => JSON.stringify({ parts, sel, nextId, welds: weldPlan, asm: asmAnswers, sim: simData, mech: mechData, fem: femData, cam5: typeof cam5UI !== 'undefined' ? cam5UI.getCfg() : undefined });
// "Tek parça" ağları (üçgen verisi) geri al geçmişine girmesin diye parçada yalnızca anahtar (mk) durur, veri burada tutulur.
// Kaydederken (otomatik kayıt, proje) veri de dosyaya yazılır.
const meshStore = new Map();
function snapshotSave() {
  const o = { parts, sel, nextId, welds: weldPlan, asm: asmAnswers, sim: simData, mech: mechData, fem: femData, cam5: typeof cam5UI !== 'undefined' ? cam5UI.getCfg() : undefined };   // cam5: 4/5 eksen CNC ayarları
  const ks = [...new Set(parts.flatMap((q) => [q.mk, q.bk]).filter((k) => k && meshStore.has(k)))];   // bk: OCCT B-Rep metni
  if (ks.length) { o.meshes = {}; ks.forEach((k) => { o.meshes[k] = meshStore.get(k); }); }
  return JSON.stringify(o);
}
function restore(s) {
  const o = JSON.parse(s);
  if (o.meshes) for (const k of Object.keys(o.meshes)) meshStore.set(k, o.meshes[k]);
  parts = o.parts; selOff = null; sel = o.sel; nextId = o.nextId; weldPlan = o.welds || null; asmAnswers = o.asm && typeof o.asm === 'object' ? o.asm : {}; simData = o.sim && typeof o.sim === 'object' ? o.sim : null; mechData = o.mech && Array.isArray(o.mech.cs) ? o.mech : { cs: [], motor: null };
  cleanLinks(parts);
  if (typeof cam5UI !== 'undefined') cam5UI.setCfg(o.cam5);
  femData = o.fem && typeof o.fem === 'object' ? o.fem : null;   // eski projelerde yok: varsayılan (3 eksen)
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
const weldSprites = [];
const wgtSprites = [];
const simSprites = [];
const simAnim = { spec: null, mesh: null, ghost: null, base: null, t0: 0 };
function updateLabelScales() {
  const k = 2 * Math.tan(camera.fov * RAD / 2) * 0.045;
  for (const s of labelSprites) s.scale.set(k * s.userData.aspect, k, 1);
  for (const s of msrSprites) s.scale.set(k * s.userData.aspect, k, 1);
  for (const s of weldSprites) s.scale.set(k * 0.8 * s.userData.aspect, k * 0.8, 1);
  for (const s of wgtSprites) s.scale.set(k * 0.8 * s.userData.aspect, k * 0.8, 1);
  for (const s of simSprites) s.scale.set(k * 0.8 * s.userData.aspect, k * 0.8, 1);
}
renderer.setAnimationLoop((now) => {
  if (anim.playing) animTick(now);
  if (asmUI) asmUI.tick(now);
  if (simAnim.spec) simTick(now);
  if (camUI && camUI.playing) camUI.tick();
  controls.update();
  updateInfinite();
  updateLabelScales();
  renderer.render(scene, camera);
  if (modelMesh && settings.edges !== false && !edgesBroken && modelGroup.visible) drawEdges();
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

// Kapalı (r, y) profilini eksen etrafında döndür; keskin köşeler ikilenir, yumuşak eğriler (yuvarlama) pürüzsüz kalır
function latheGeo(prof) {
  const lp = [];
  const n = prof.length;
  prof.forEach((q, i) => {
    lp.push(new THREE.Vector2(q[0], q[1]));
    if (i > 0 && i < n - 1) {
      const a = prof[i - 1], b = prof[i + 1];
      const t1 = Math.atan2(q[1] - a[1], q[0] - a[0]), t2 = Math.atan2(b[1] - q[1], b[0] - q[0]);
      let d = Math.abs(t2 - t1);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d > 35 * RAD) lp.push(new THREE.Vector2(q[0], q[1]));
    }
  });
  return new THREE.LatheGeometry(lp, 64);
}

// kroki çokgenlerinin keskin köşelerini (isteğe bağlı) yuvarla / pahla
function cornerPtsOf(p, pts) {
  const rr = Math.max(pos(p.r), 0), cc = Math.max(pos(p.c), 0);
  if (!(rr > 0.05 || cc > 0.05)) return pts;
  return cornerCut(pts, cornersAbove(pts, 15), rr > 0.05 ? 0 : cc, rr > 0.05 ? rr : 0);
}
function sketchCornerPts(p) { return cornerPtsOf(p, p.pts); }

function sketchGeo(p) {
  const H = Math.max(heightOf(p), 0.01);
  let g;
  if (p.mode === 'revolve') {
    let prof = revolveProfile(p.pts);
    const rr = Math.max(pos(p.r), 0), cc = Math.max(pos(p.c), 0);
    if (rr > 0.05 || cc > 0.05) {
      prof.pop();
      const idx = prof.map((q, i) => (q[0] > 0.06 ? i : -1)).filter((i) => i >= 0);
      prof = cornerCut(prof, idx, rr > 0.05 ? 0 : cc, rr > 0.05 ? rr : 0);
      prof.push(prof[0].slice());
    }
    g = latheGeo(prof);
  } else {
    // birden çok döngü: iç içe olanlar delik (çift-tek kuralı)
    const top = p.plane === 'top';
    const loops = [p.pts, ...(p.more || [])];
    const v2 = (q) => new THREE.Vector2(q[0], top ? -q[1] : q[1]);
    // ExtrudeGeometry delik yönünü yalnızca dış kontur ters ise düzeltir: dış saat yönü, delikler ters olacak şekilde kendimiz ayarlıyoruz
    const orient = (pts, cw) => {
      const v = pts.map(v2);
      return THREE.ShapeUtils.isClockWise(v) === cw ? v : v.reverse();
    };
    const shapes = classifyLoops(loops).map(({ outer, holes }) => {
      const sh = new THREE.Shape(orient(cornerPtsOf(p, outer), true));
      for (const hl of holes) sh.holes.push(new THREE.Path(orient(cornerPtsOf(p, hl), false)));
      return sh;
    });
    g = new THREE.ExtrudeGeometry(shapes, { depth: clamp(p.h), bevelEnabled: false });
    if (top) g.rotateX(-Math.PI / 2);
    else g.translate(0, 0, -clamp(p.h) / 2);
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
    case 'frame': {
      let g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(frameCalc(p).pos), 3));
      try { g = toCreasedNormals(g, 30 * RAD); } catch (e) { g.computeVertexNormals(); }
      return ensureUV(g);
    }
    case 'sheet': {
      const c = sheetCalc(p);
      if (p.flat) return new THREE.BoxGeometry(Math.max(c.flatL, 0.01), c.T, c.W);
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(c.poly.map(([u, v]) => new THREE.Vector2(u, v))), { depth: c.W, bevelEnabled: false, curveSegments: 1 });
      g.computeBoundingBox();
      const bb = g.boundingBox;
      g.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
      g.clearGroups();
      return g;
    }
    case 'sweep':
    case 'loft': {
      const r = p.type === 'sweep' ? sweepTris(p) : loftTris(p);
      let g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(r.pos), 3));
      try { g = toCreasedNormals(g, 40 * RAD); } catch (e) { g.computeVertexNormals(); }
      return ensureUV(g);
    }
    case 'mesh': {
      const m = unpackMesh(meshStore.get(p.mk));
      if (!m) return new THREE.BoxGeometry(1, h, 1); // veri yoksa (bozuk kayıt) önemsiz bir kutu
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
      if (m.nor) g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3)); else g.computeVertexNormals();
      return ensureUV(g);
    }
    case 'cylinder': return cylinderGeo(p, d, h);
    case 'tube': {
      const rr = Math.max(pos(p.r), 0), cc = Math.max(pos(p.c), 0);
      if (rr > 0.05 || cc > 0.05) {
        const di = Math.min(clamp(p.di), d - 0.4);
        const rp = ringProfile(d / 2, di / 2, h, rr > 0.05 ? 0 : cc, rr > 0.05 ? rr : 0);
        const g = latheGeo([...rp, rp[0].slice()]);
        g.translate(0, -h / 2, 0);
        return g;
      }
      return new THREE.CylinderGeometry(d / 2, d / 2, h, 64);
    }
    case 'sphere': return new THREE.SphereGeometry(d / 2, 48, 32);
    case 'cone': {
      const d2 = Math.max(pos(p.d2), d * 0.004, 0.1); // ucu sivri koni de çalışsın
      const rr = Math.max(pos(p.r), 0), cc = Math.max(pos(p.c), 0);
      if (rr > 0.05 || cc > 0.05) {
        const cp0 = coneProfile(d / 2, d2 / 2, h, rr > 0.05 ? 0 : cc, rr > 0.05 ? rr : 0);
        const g = latheGeo([...cp0, cp0[0].slice()]);
        g.translate(0, -h / 2, 0);
        return g;
      }
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
  if (p.type === 'sweep') return clamp(sweepTris(p).h);
  if (p.type === 'sheet') { const c = sheetCalc(p); return p.flat ? c.T : c.h; }
  if (p.type === 'frame') return clamp(frameCalc(p).h);
  return p.type === 'sphere' ? clamp(p.d) : clamp(p.h);
}

function makeBrush(p, material) {
  const hgt = partHeight(p);
  if (p.type === 'tube' && !(pos(p.r) > 0.05 || pos(p.c) > 0.05)) {
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
  const badBefore = mateErr > 1e-2;
  const moved = solveMates();
  if (tab === 'mate' && badBefore !== (mateErr > 1e-2) && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#tabbody'))) setTimeout(renderPanel, 0);
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
    rebuildCount++;
    if (typeof scheduleWeightMarker === 'function') scheduleWeightMarker();
    if (simUI && simUI.active) { simUI.invalidate(); if (tab === 'sim') setTimeout(renderPanel, 0); }
    if (camUI && camUI.active) { camUI.invalidate(); if (tab === 'cam') setTimeout(renderPanel, 0); }
    if (typeof cam5UI !== 'undefined' && cam5UI && cam5UI.active) { cam5UI.invalidate(); if (tab === 'cam') setTimeout(renderPanel, 0); }
    if (typeof occtUI !== 'undefined' && occtUI && occtUI.active) { occtUI.invalidate(); if (tab === 'occt') setTimeout(renderPanel, 0); }
    if (asmUI && asmUI.active) { asmUI.invalidate(); if (tab === 'asm') setTimeout(renderPanel, 0); }

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
    if (tab === 'link') drawJointAxis();
    if (moved) syncInputs();
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
    const isSel = hasSel() && p.id === p0.id;
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
  else if (settings.dim === 'part' && hasSel()) {
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
const TABS = [['dims', 'Ölçü'], ['type', 'Tür'], ['pos', 'Konum'], ['rot', 'Döndür'], ['copy', 'Çoğalt'], ['face', 'Yüz'], ['edge', 'Kenar'], ['shell', 'Kabuk'], ['mate', 'Montaj'], ['link', 'Bağ'], ['part', 'Parça'], ['view', 'Görünüm'], ['sheet', 'Resim'], ['anim', 'Hareket'], ['str', 'Dayanım'], ['calc', 'Hesap'], ['wgt', 'Ağırlık'], ['cost', 'Maliyet'], ['mfg', 'Üretim'], ['weld', 'Kaynak'], ['asm', 'Montaj planı'], ['sim', '🔮 Gelecek'], ['fem', '📐 Analiz'], ['cam', '⚙ CNC'], ['occt', '🧱 B-Rep']];

function fieldsFor(p) {
  switch (p.type) {
    case 'box': return [['Genişlik', 'w'], ['Derinlik', 'l'], ['Yükseklik', 'h'], ['Yuvarlama', 'r'], ['Pah', 'c'], ['Eğim °', 'tp', 'deg']];
    case 'cylinder': return [['Çap', 'd'], ['Yükseklik', 'h'], ['Yuvarlama', 'r'], ['Pah', 'c'], ['Eğim °', 'tp', 'deg']];
    case 'sphere': return [['Çap', 'd']];
    case 'cone': return [['Alt çap', 'd'], ['Üst çap', 'd2'], ['Yükseklik', 'h'], ['Yuvarlama', 'r'], ['Pah', 'c']];
    case 'tube': return [['Dış çap', 'd'], ['İç çap', 'di'], ['Yükseklik', 'h'], ['Yuvarlama', 'r'], ['Pah', 'c']];
    case 'sketch': if (p.gear) return [['Modül', 'gm'], ['Diş sayısı', 'gz', 'deg'], ['Kalınlık', 'h'], ['Mil deliği çapı (0 = yok)', 'gb']];
      return p.mode === 'revolve' ? [['Kenar yuvarlama', 'r'], ['Kenar pah', 'c']] : [['Kalınlık', 'h'], ['Köşe yuvarlama', 'r'], ['Köşe pah', 'c']];
    case 'sweep': {
      const prof = p.prof === 'rect' ? [['Profil genişlik', 'w'], ['Profil kalınlık', 'l']] : p.prof === 'tube' ? [['Dış çap', 'd'], ['İç çap', 'di']] : [['Profil çapı', 'd']];
      const path = p.path === 'helix' ? [['Sarım yarıçapı', 'hr'], ['Adım (1 turda yükselme)', 'pitch'], ['Sarım sayısı', 'turns', 'deg']]
        : p.path === 'poly' ? [['Köşe yarıçapı', 'br']]
        : [['Eğri yarıçapı', 'br'], ['Açı °', 'ang', 'deg'], ['Baştaki düz boy', 's0'], ['Sondaki düz boy', 's1']];
      return [...prof, ...path];
    }
    case 'frame': return [['Genişlik (dış)', 'fw'], ...(p.fr === 'rect' ? [] : [['Derinlik (dış)', 'fd']]), ['Yükseklik', 'fh'],
      ...(p.fr === 'table' ? [['Alt kuşak yüksekliği (0 = yok)', 'fs']] : []), ...(p.fr === 'shelf' ? [['Raf sayısı', 'fn', 'deg']] : [])];
    case 'sheet': return [['Sac kalınlığı', 'st'], ['İç büküm yarıçapı', 'sr'], ['Derinlik (en)', 'sw'], ['K faktörü (0–1)', 'sk', 'deg'], ['Başlangıç yönü °', 'sa0', 'deg']];
    case 'loft': return [
      ...(p.ls0 === 'circle' ? [['Alt çap', 'd']] : [['Alt genişlik', 'w'], ['Alt derinlik', 'l']]),
      ...(p.ls1 === 'circle' ? [['Üst çap', 'd2']] : [['Üst genişlik', 'w2'], ['Üst derinlik', 'l2']]),
      ['Yükseklik', 'h'], ['Üst kayma X', 'ox'], ['Üst kayma Z', 'oz'], ['Burulma °', 'tw', 'deg']];
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
    `<button class="chip${q.op === 'sub' && i > 0 ? ' sub' : ''}${q.id === p.id && hasSel() ? ' on' : ''}"${q.hidden ? ' style="opacity:.45"' : ''} data-sel="${q.id}">` +
    `${esc(partName(q, i))}${i > 0 && q.op === 'sub' ? ' (oyuk)' : ''}${q.hidden ? ' ⊘' : ''}${q.parent != null && !q.aux ? ' 🔗' : ''}${bendWarnings(q).length ? ' ⚠' : ''}</button>`).join('');
}

function renderPanel() {
  const p = cur();
  const idx = parts.indexOf(p);
  renderChips();
  $('tabs').innerHTML = TABS.map(([k, l]) => `<button class="tab${tab === k ? ' on' : ''}" data-act="tab-${k}">${l}</button>`).join('');
  let body = '', hint = '';
  const opBtns = idx > 0 ? btn('Birleştir', 'op-add', p.op === 'add') + btn('Oyuk aç', 'op-sub', p.op === 'sub') : '';
  const snapBtns = SNAPS.map((v) => btn(v === 0 ? 'Yapışma yok' : 'Yapış ' + fmtNum(toUnit(v, settings.unit), 3), 'snap-' + v, settings.snap === v)).join('');

  // seçim kaldırılmışken parçaya ait sekmeler parça verisi göstermez
  if (!hasSel() && ['dims', 'type', 'pos', 'rot', 'copy', 'shell', 'part'].includes(tab)) {
    body = '<div class="lbl" style="flex:1 0 100%">Seçili parça yok. Modelde bir parçaya ya da yukarıdaki parça listesinden birine dokun.</div>';
    hint = 'Boş alana dokununca seçim kaldırılır; diğer sekmeler (Yüz, Kenar, Görünüm, Hesap…) tüm modelle çalışmaya devam eder.';
  } else if (tab === 'type') {
    body = p.type === 'frame'
      ? '<div class="lbl h">İskelet</div>' + [['table', 'Masa iskeleti'], ['box', 'Kutu çerçeve'], ['shelf', 'Raf / sehpa'], ['rect', 'Pano çerçeve']].map(([k, l]) => btn(l, 'frt-' + k, p.fr === k)).join('') +
        `<label class="f w2" style="flex:1 0 100%"><span>Profil</span><select data-pf="1">${Object.entries(PROFILES).map(([k, v]) => `<option value="${k}"${p.pf === k ? ' selected' : ''}>${v.name}</option>`).join('')}</select></label>` +
        '<div class="lbl h">Köşe birleşimi</div>' + btn('Alın (90°)', 'frj-butt', p.fj !== 'miter' || !miterOK(p)) + (miterOK(p) ? btn('Gönye (45°)', 'frj-miter', p.fj === 'miter') : '<div class="lbl" style="flex:1 0 100%">Gönye: pano ve kutu çerçevede, kare ya da yuvarlak profille yapılır.</div>') +
        cutListHtml(p) + btn('📋 Kesim listesi (CSV)', 'fr-csv') + btn('✂ Kesim optimizasyonu (6 m boylara böl)', 'cut-opt') + opBtns
      : p.type === 'sheet'
      ? '<div class="lbl h">Hazır profil</div>' + [['L', 'L köşebent'], ['U', 'U kanal'], ['Z', 'Z profil'], ['hat', 'Şapka'], ['C', 'C (dudaklı)']].map(([k, l]) => btn(l, 'shp-' + k, p.sh === k)).join('') +
        '<div class="lbl h">Açınım</div>' + btn(p.flat ? '📐 Bükülmüş göster' : '📄 Düz (açınım) göster', 'sh-flat', p.flat) + btn('⬇ Açınım DXF', 'sh-dxf') + opBtns
      : p.type === 'sweep'
      ? '<div class="lbl h">Profil (kesit şekli)</div>' + btn('Daire', 'prof-circle', p.prof === 'circle') + btn('Dikdörtgen', 'prof-rect', p.prof === 'rect') + btn('Boru (içi boş)', 'prof-tube', p.prof === 'tube') +
        '<div class="lbl h">Yol</div>' + btn('Dirsek / yay', 'path-arc', p.path === 'arc') + btn('Helis (yay, vida)', 'path-helix', p.path === 'helix') + btn('Çok noktalı (boru hattı)', 'path-poly', p.path === 'poly') + opBtns
      : p.type === 'loft'
      ? '<div class="lbl h">Alt şekil</div>' + btn('Dikdörtgen', 'ls0-rect', p.ls0 !== 'circle') + btn('Daire', 'ls0-circle', p.ls0 === 'circle') +
        '<div class="lbl h">Üst şekil</div>' + btn('Dikdörtgen', 'ls1-rect', p.ls1 !== 'circle') + btn('Daire', 'ls1-circle', p.ls1 === 'circle') + opBtns
      : p.type === 'mesh'
      ? opBtns
      : p.type === 'sketch'
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
    if (!edgeSels.length) {
      body = '<div class="lbl" style="flex:1 0 100%">Bir kutunun kenarına dokun (birden çok kenar seçebilirsin).</div>';
      hint = 'Sadece düz kutu parçalarının kenarlarında çalışır (yuvarlama/pahı olmayan). Kenara yakın dokun; sarı çizgi seçileni gösterir.';
    } else {
      body = '<div class="lbl" style="flex:1 0 100%">' + edgeSels.length + ' kenar seçili (aynı kenara tekrar dokunursan kalkar)</div>' +
        cfield('Ölçü (pah boyu / yarıçap)', 'es') + btn('◣ Pah kır', 'edge-chamfer') + btn('◜ Yuvarla', 'edge-fillet') +
        btn('Üst 4 kenar', 'edge-top') + btn('Bu kutunun 12 kenarı', 'edge-all') + btn('Seçimi temizle', 'edge-clear');
      hint = 'Seçili her kenar işlenir. İşlem, kenarlara oyuk parçaları ekler (Parça listesinde görünür); silersen geri gelir. Yuvarlamada iki kenarın birleştiği köşe tam yumuşak olmaz.';
    }
  } else if (tab === 'shell') {
    const el = shellEligible(p);
    body = (el ? cfield('Duvar kalınlığı', 'wall') + btn('Üst açık: ' + (cp.openTop ? 'evet' : 'hayır'), 'shell-top', cp.openTop) + btn('Alt açık: ' + (cp.openBot ? 'evet' : 'hayır'), 'shell-bot', cp.openBot) + btn('🥚 Kabuk yap', 'shell-do')
      : '<div class="lbl" style="flex:1 0 100%">Seçili parça kabuk yapılamaz.</div>');
    hint = el ? 'Seçili parçanın içini boşaltır (iç hacim oyuk parça olarak eklenir; Parça listesinden silersen geri gelir). Kutu, silindir ve küre için; yuvarlama / pah / eğim olmamalı.'
      : 'Kabuk: düz kutu, düz silindir ve küre için. Parçayı üstteki listeden seç.';
  } else if (tab === 'mate') {
    const nm = (m) => { const q = m && parts.find((x) => x.id === m.id); return q ? partName(q, parts.indexOf(q)) : ''; };
    const MT = [['coinc', 'Çakışık'], ['dist', 'Mesafe'], ['par', 'Paralel'], ['ang', 'Açı'], ['conc', 'Eş merkezli']];
    body = '<div class="lbl h">Kalıcı eşleşme türü</div>' + MT.map(([k, l]) => btn(l, 'mt-' + k, cp.mtype === k)).join('') +
      (cp.mtype === 'dist' ? cfield('Mesafe', 'mval') : '') + (cp.mtype === 'ang' ? cfield('Açı °', 'mang', 'deg') : '') +
      (['coinc', 'dist', 'par'].includes(cp.mtype) ? btn('Yön: ' + (cp.mflip ? 'aynı yöne bakar' : 'karşılıklı (yüz yüze)'), 'mt-flip', cp.mflip) : '') +
      '<div class="lbl" style="flex:1 0 100%">1) Hareket edecek parçanın ' + (cp.mtype === 'conc' ? 'yuvarlak yüzüne' : 'yüzüne') + ' dokun' + (mate.a ? ' ✓ ' + esc(nm(mate.a)) : '') + '</div>' +
      '<div class="lbl" style="flex:1 0 100%">2) Bağlanacağı parçanın ' + (cp.mtype === 'conc' ? 'yuvarlak yüzüne / deliğine' : 'yüzüne') + ' dokun' + (mate.b ? ' ✓ ' + esc(nm(mate.b)) : '') + '</div>' +
      btn('➕ Kalıcı eşleşme ekle', 'mate-add') + btn('Seçimi sıfırla', 'mate-reset');
    const all = [];
    parts.forEach((A) => (A.mates || []).forEach((m, i) => all.push([A, m, i])));
    body += '<div class="lbl h">Eşleşmeler (' + all.length + ')</div>';
    const TN = Object.fromEntries(MT);
    for (const [A, m, i] of all) {
      const B = parts.find((x) => x.id === m.b);
      const val = m.t === 'dist' ? `<input type="number" step="any" data-mv="${A.id},${i}" data-u="len" value="${lenVal(m.v)}" style="width:80px;flex:0 0 80px">`
        : m.t === 'ang' ? `<input type="number" step="any" data-mv="${A.id},${i}" data-u="deg" value="${fmtNum(m.v, 2)}" style="width:70px;flex:0 0 70px">` : '';
      body += `<div style="flex:1 0 100%;display:flex;gap:5px;align-items:center;font-size:13px;padding:2px 0"><span style="flex:1">${esc(partName(A, parts.indexOf(A)))} → ${B ? esc(partName(B, parts.indexOf(B))) : '?'}: <b>${TN[m.t]}</b>${m.flip ? ' (aynı yön)' : ''}</span>${val}<button data-act="mdel-${A.id}-${i}" class="danger" style="flex:0 0 auto;padding:8px 10px">Sil</button></div>`;
    }
    if (mateErr > 1e-2) body += '<div class="lbl" style="flex:1 0 100%;color:#f87171">⚠ Eşleşmeler birlikte sağlanamıyor (çelişki var). Son eklenen eşleşmeyi sil.</div>';
    body += '<div class="lbl h">Tek seferlik oturtma</div>' + cfield('Boşluk', 'mgap') + cfield('Yüz çevresinde döndür°', 'mrot', 'deg') +
      btn('Yüz merkezleri: ' + (cp.mcenter ? 'hizala' : 'dokunulan nokta'), 'mate-center', cp.mcenter) + btn('🔗 Yüzü yüze oturt (bir kez)', 'mate-do');
    hint = 'Kalıcı eşleşme: 1. parça, 2. parçaya bağlı kalır; 2. parçayı taşıyınca 1. parça da gelir, 1. parçayı sürüklersen sadece serbest kalan yönde kayar. Çakışık: yüzler yüz yüze aynı düzlemde. Eş merkezli: mil ile delik / boru aynı eksende (parçaların dikey ekseni). Geri al ile döner.';
  } else if (tab === 'link') {
    const cand = parts.filter((q) => q.id !== p.id && !q.aux && !wouldCycle(parts, p.id, q.id));
    const J = p.joint || { type: 'fixed' };
    const kids = parts.filter((q) => q.parent === p.id && !q.aux);
    body = `<label class="f w2" style="flex:1 0 100%"><span>Bağlı olduğu üst parça</span><select data-link="parent"><option value="">— bağsız —</option>` +
      cand.map((q) => `<option value="${q.id}"${p.parent === q.id ? ' selected' : ''}>${esc(partName(q, parts.indexOf(q)))}</option>`).join('') + `</select></label>`;
    if (p.parent != null) {
      body += btn('Sabit', 'jt-fixed', J.type === 'fixed') + btn('Menteşe (döner)', 'jt-hinge', J.type === 'hinge') + btn('Kayar', 'jt-slide', J.type === 'slide');
      if (J.type !== 'fixed') {
        const isH = J.type === 'hinge';
        const R = isH ? 180 : Math.max(50, lastClean && lastClean.boundingBox ? lastClean.boundingBox.getSize(new THREE.Vector3()).length() : 100);
        body += '<div class="lbl" style="flex:1 0 100%">Eksen (üst parçanın ekseni)</div>' +
          btn('X', 'jx-x', J.axis === 'x') + btn('Y', 'jx-y', J.axis === 'y') + btn('Z', 'jx-z', J.axis === 'z') +
          btn(linkPick ? '📍 Modele dokun…' : '📍 Eksen noktasını seç', 'jpick', linkPick) +
          `<label class="f w2" style="flex:1 0 100%"><span data-jl>${isH ? 'Açı' : 'Kayma'}: ${isH ? fmtNum(J.val || 0, 1) + '°' : lenText(J.val || 0)}</span>` +
          `<input type="range" data-j="val" min="${-R}" max="${R}" step="${isH ? 1 : R / 200}" value="${J.val || 0}"></label>` +
          btn('Başlangıca dön', 'jreset');
      }
      body += btn('Bağı kaldır', 'j-unlink');
    }
    if (kids.length) body += `<div class="lbl" style="flex:1 0 100%">Bu parçaya bağlı: ${kids.map((q) => esc(partName(q, parts.indexOf(q)))).join(', ')}</div>`;
    hint = 'Üst parça taşınınca ya da döndürülünce bu parça da onunla birlikte gelir. Menteşe: seçilen eksen etrafında döner; Kayar: eksen boyunca kayar (sarı çizgi eksendir, "Eksen noktasını seç" ile modelde bir noktaya dokunarak menteşe yerini belirle). Delikler, bağlı oldukları parçayla birlikte gider.';
    drawJointAxis();
  } else if (tab === 'sheet') {
    body = btn('📐 Teknik resim oluştur', 'sheet-make') +
      '<div class="lbl" style="flex:1 0 100%">A4 yatay: ön, yan, üst ve izometrik görünüş; ölçek ve genel ölçüler.</div>' +
      (weldPlan && (weldPlan.welds || []).some((w) => w.status === 'approved') ? btn('Kaynak sembolleri: ' + (weldPlan.symbols !== false ? 'açık' : 'kapalı'), 'wd-sym', weldPlan.symbols !== false) + '<div class="lbl" style="flex:1 0 100%">Onaylı kaynaklar (Kaynak sekmesi) resimde ISO 2553 sembolüyle gösterilir: a = boğaz kalınlığı (girilmediyse a?), uzunluk, ○ çepeçevre, kuyrukta yöntem no ve kaynak harfi.</div>' : '');
    hint = 'Resim PNG ya da PDF olarak indirilir. Birim: ' + settings.unit + ' (Görünüm sekmesinden değiştirilir).';
  } else if (tab === 'anim') {
    const ds = animDrivers();
    if (!ds.length) {
      body = '<div class="lbl" style="flex:1 0 100%">Hareket ettirilecek bir şey yok. Önce <b>Bağ</b> sekmesinde menteşe / kayar eklem ya da <b>Montaj</b> sekmesinde mesafe / açı eşleşmesi ekle.</div>';
    } else {
      body = '<div class="lbl h">Hareket edecekler (dokun = aç / kapat)</div>';
      for (const d of ds) {
        const st = anim.cfg[d.key] || (anim.cfg[d.key] = { on: true, from: d.cur, to: d.def });
        body += `<div style="flex:1 0 100%;display:flex;gap:5px;align-items:flex-end">` +
          `<button data-act="an-tog-${d.key}"${st.on ? ' class="on"' : ''} style="flex:2;text-align:left;padding-left:8px">${st.on ? '✓ ' : ''}${esc(d.label)}</button>` +
          `<label class="f"><span>Baş (${d.unit})</span><input type="number" step="any" data-an="${d.key},from" value="${fmtNum(d.unit === '°' ? st.from : toUnit(st.from, settings.unit), 2)}"></label>` +
          `<label class="f"><span>Son (${d.unit})</span><input type="number" step="any" data-an="${d.key},to" value="${fmtNum(d.unit === '°' ? st.to : toUnit(st.to, settings.unit), 2)}"></label></div>`;
      }
      body += '<div class="lbl h">Oynatma</div>' + cfield('Süre (sn)', 'adur', 'deg') +
        btn('Git-gel', 'an-m-pp', anim.mode === 'pp') + btn('Tek yön', 'an-m-once', anim.mode === 'once') + btn('Sürekli döngü', 'an-m-loop', anim.mode === 'loop') +
        (anim.playing ? btn('⏹ Durdur', 'an-stop', true) : btn('▶ Oynat', 'an-play')) +
        btn(anim.rec ? '⏺ Kaydediliyor…' : '🎬 Video kaydet (1 tur)', 'an-rec', !!anim.rec) + btn('↺ Başa al', 'an-reset');
    }
    body += mechPanel();
    hint = 'Hareket etüdü: eklemler ve mesafe / açı eşleşmeleri baştan sona yumuşakça oynar; bağlı parçalar eşleşmelerle birlikte gelir. Video, ekrandaki görünümden WebM olarak kaydedilir (kamerayı önce istediğin açıya getir).';
  } else if (tab === 'str') {
    body = strengthPanel(p);
    hint = 'Hesaplar temel kiriş ve büküm formülleridir (el hesabı): ön kontrol içindir, gerçek sonlu eleman analizi (FEA) değildir. Malzeme değerleri tipik değerlerdir; insan güvenliği ya da yük taşıyan önemli parçalarda bir mühendise onaylat.';
  } else if (tab === 'calc') {
    const mat = MATERIALS.find((m) => m.id === settings.mat) || MATERIALS[0];
    body = '<div class="lbl h">Malzeme</div>' + MATERIALS.map((m) => btn(m.name, 'mat-' + m.id, m.id === mat.id)).join('') +
      '<div class="lbl h">Sonuçlar</div>';
    if (!lastClean || !lastClean.attributes.position.count) {
      body += '<div class="lbl" style="flex:1 0 100%">Önce bir model olmalı.</div>';
    } else {
      const mp = meshProps(lastClean.attributes.position.array);
      const g = massGrams(mp.volume, mat.rho);
      const sz = lastClean.boundingBox.getSize(new THREE.Vector3());
      const row = (k, v) => `<div style="flex:1 0 100%;display:flex;justify-content:space-between;padding:5px 12px;border-top:1px solid #1e293b;font-size:14px"><span style="color:#94a3b8">${k}</span><b>${v}</b></div>`;
      body += row('Hacim', fmtNum(mp.volume / 1000, 2) + ' cm³') +
        row('Yüzey alanı', fmtNum(mp.area / 100, 2) + ' cm²') +
        row('Ağırlık (' + mat.name + ')', g >= 1000 ? fmtNum(g / 1000, 3) + ' kg' : fmtNum(g, 1) + ' g') +
        row('Ağırlık merkezi', mp.centroid ? 'X ' + fmtNum(toUnit(mp.centroid[0], settings.unit), 1) + '  Y ' + fmtNum(toUnit(mp.centroid[1], settings.unit), 1) + '  Z ' + fmtNum(toUnit(mp.centroid[2], settings.unit), 1) : '-') +
        row('Genel ölçü', lenText(sz.x) + ' × ' + lenText(sz.z) + ' × ' + lenText(sz.y));
    }
    body += '<div class="lbl h">Ağırlık ve maliyet</div>' + btn('⚖ Parça parça ağırlık, ağırlık merkezi, denge, kaldırma', 'wg-go') + btn('₺ Üretim maliyeti (hammadde, işçilik, makine, adet)', 'cs-go') + btn('🧩 Montaj sırası ve patlatılmış görünüm', 'as-go-tab') + btn('🔮 Geleceğimi göster (sanal dayanım, titreşim, sıcaklık, ömür testi)', 'sm-go-tab') + btn('⚙ CNC freze: takım yolu ve G-kodu', 'cn-go-tab') + btn('🧱 B-Rep (OCCT): hassas boolean, yuvarlama, STEP / IGES', 'oc-go-tab') + btn('📐 Mühendislik analizi: statik, modal, ısı, burkulma', 'fm-go-tab') +
      '<div class="lbl h">Üretim</div>' + btn('🏭 Üretimi analiz et (çakışma, montaj, kaynak)', 'mfg-go') + btn('✂ Akıllı kesim optimizasyonu (profil boy / fire / maliyet)', 'cut-opt') +
      '<div class="lbl h">Dışa aktar</div>' + btn('📋 Parça listesi (CSV)', 'bom-csv') + btn('📐 DXF (ön / yan / üst)', 'dxf-out') +
      btn('🧊 STEP (SolidWorks, Fusion, FreeCAD)', 'step-out') + btn('🖨 3MF (3B yazıcı)', 'mf-out');
    hint = 'STEP yüzeyli (üçgen yüzlü) katı olarak yazılır: CAD programında açılır, ölçülür, montaja eklenir; ama yüzleri düzgün eğri değil, parametrik özellik ağacı yoktur. Kapalı olmayan modeller yüzey olarak gider. 3MF, Cura / PrusaSlicer / Bambu Studio içindir. Ağırlık tam dolu (içi dolu) katı için hesaplanır; 3B yazıcıda dolgu oranı ve duvar kalınlığı gerçek ağırlığı düşürür. DXF: AutoCAD, FreeCAD gibi programlarda açılır; gizli çizgiler ayrı katmandadır.';
  } else if (tab === 'cost') {
    body = costUI.html();
    hint = 'Maliyet: miktarlar ve süreler modelden hesaplanır, FİYATLARI SEN GİRERSİN (uygulama piyasa fiyatı kullanmaz). Fiyatlar ve saat ücretleri bu cihazda saklanır, her projede kullanılır. Malzemeyi parça başına Ağırlık ya da Dayanım sekmesinden seç; kaynak süresi Kaynak sekmesindeki onaylı plandan gelir.';
  } else if (tab === 'wgt') {
    body = weightUI.html();
    hint = 'Ağırlık her parçanın kendi malzemesi (Dayanım sekmesinde ya da burada seçilir) ve gerçek 3B hacmiyle hesaplanır. Kırmızı-beyaz küre ağırlık merkezidir; kesik çizgi zemine izdüşümü, yeşil / turuncu / kırmızı çizgi destek alanıdır. Model döndürülünce işaret de modelle birlikte döner; parça değişince yeniden hesaplanır.';
  } else if (tab === 'cam') {
    // CNC torna ayrı bir çalışma modu (lathe-ui.js): açıkken 3 / 4 / 5 eksen panelleri gösterilmez
    body = (latheUI.on ? cam5UI.modeBar().replace(/ class="on"/g, '') : cam5UI.modeBar()) + latheUI.modeBtn() + (latheUI.on ? latheUI.html() : cam5UI.mode === '3' ? camUI.html() : cam5UI.html());
    if (latheUI.on) hint = 'CNC torna (2 eksen): takım yolu, simülasyon ve G-kodu aynı hareket listesinden üretilir. Simülasyon fiziksel makine doğrulaması değildir; program hiçbir tezgâhta denenmedi. Kumandada simülasyon ve tek blok ile kontrol et.'; else
    if (cam5UI.mode !== '3') hint = '4 / 5 eksen: takım yolu, makine kinematiği, çarpışma kontrolü ve talaş simülasyonu aynı takım yolu verisinden hesaplanır. Simülasyon fiziksel makine doğrulaması değildir; G-kodu makinede doğrulanmamıştır.'; else
    hint = 'CNC: takım yolları modelin üstten görünen yüzeyinden hesaplanır (3 eksen). Kesme değerleri başlangıç değeridir; ilk parçada makinede düşük ilerlemeyle dene. Program çalıştırmadan önce kumandada simülasyonla kontrol et.';
  } else if (tab === 'fem') {
    body = femUI.html();
    hint = 'Analiz: sonlu elemanlar (küp ağ). Her analizin fiziksel modeli ve yöntemi panelde yazılıdır; çözücü referans problemlerle doğrulanmıştır (rapor). Doğrusal analizdir: temas ve doğrusal olmayan davranış yok. Sonuçlar mühendislik onayı yerine geçmez.';
  } else if (tab === 'occt') {
    body = occtUI.html();
    hint = 'B-Rep: model Open CASCADE (OCCT) çekirdeğiyle tam yüzeyli katı olarak kurulur. Boolean, yuvarlama ve pah sonucu yeni bir parça olur (Geri al ile döner). STEP dışa aktarma tam geometriyi yazar (SolidWorks, Fusion, FreeCAD, CAM programları açar).';
  } else if (tab === 'sim') {
    body = simUI.html();
    hint = 'Geleceğimi Göster: tasarım küp elemanlara bölünüp gerçek sonlu eleman analiziyle (doğrusal-elastik) test edilir; renkler ve şekil değişimi hesaplanan sonuçtan çizilir. Yorulma, aşınma ve yüksek sıcaklık değerleri yaklaşık tahmindir. Sonuçlar profesyonel mühendislik onayının yerine geçmez.';
  } else if (tab === 'asm') {
    body = asmUI.html();
    hint = 'Montaj planı gerçek parça konumlarıyla çalışır. Parça türü adından, standart ölçüden ya da şeklinden tanınır; bilinmeyen bağlantılar sorulur, tahmin edilmez. Patlatılmış görünümde parçalar takılma yönünde uzaklaşır, yönleri korunur.';
  } else if (tab === 'weld') {
    body = weldUI.html();
    hint = 'Kaynak planı: bulunan birleşimler öneridir, sen onaylarsın. Renkler: turuncu köşe, kırmızı alın, mor T kaynağı; soluk = onaylanmamış öneri, sarı = seçili. Sarf ve süre değerleri tahminidir; kaynak ölçüsü ve dayanımı mühendis onayı gerektirir.';
  } else if (tab === 'mfg') {
    body = mfg.html();
    hint = 'Üretilebilirlik kontrolü gerçek geometriyle yapılır ama bir ön kontroldür: kesin hata demek değildir, yapısal dayanımı göstermez. Sonuca dokununca kamera o bölgeye gider; kırmızı kutu problem bölgesi, turuncu parçalar ilgili parçalardır.';
  } else if (tab === 'part') {
    body = `<label class="f w2"><span>Parça adı</span><input type="text" data-k="name" data-t="text" value="${esc(p.name || '')}" placeholder="${esc(partName(p, idx))}"></label>` +
      `<div class="row" style="flex:1 0 100%;padding:0;flex-wrap:wrap">` +
      COLORS.map((c) => `<button class="sw${(p.color || DEFAULT_COLOR) === c ? ' on' : ''}" data-color="${c}" style="background:${c}"></button>`).join('') +
      `<button class="sw${!p.color ? ' on' : ''}" data-color="" style="flex:1 0 60px">Varsayılan</button></div>` +
      btn(p.hidden ? '👁 Göster' : '⊘ Gizle', 'hide') + btn('↑ Yukarı', 'up') + btn('↓ Aşağı', 'down') +
      btn('🧩 Tek parça yap', 'bake') + '<div class="lbl" style="flex:1 0 100%">Tüm görünür parçaları (birleştirme ve oyuklar uygulanmış halde) tek parçaya çevirir. Gizli parçalar atılır, tek renk kalır. Geri al ile döner.</div>';
    hint = 'Gizli parça modele katılmaz. Sıra: 1. parça tabandır; oyuklar kendinden öncekileri keser.';
  } else if (tab === 'view') {
    const sec = section.on ? modelRange(section.axis) : [0, 1];
    const rg = Math.max(sec[1] - sec[0], 0.1);
    body = '<div class="lbl h">Bakış yönü</div>' +
      btn('Üstten', 'view-top') + btn('Önden', 'view-front') + btn('Yandan', 'view-side') + btn('İzometrik', 'view-iso') + btn('Modele sığdır', 'fit') +
      '<div class="lbl h">Ekran</div>' +
      btn('Perspektif: ' + (settings.ortho ? 'yok (ortografik)' : 'var'), 'ortho', settings.ortho) +
      btn('📏 Ölçüm aracı: ' + (measure.on ? 'açık' : 'kapalı'), 'measure', measure.on) +
      btn('Kenar çizgileri: ' + (settings.edges === false || edgesBroken ? 'kapalı' : 'açık'), 'edges', settings.edges !== false && !edgesBroken) +
      '<div class="lbl h">Modelin üstündeki ölçü yazıları</div>' +
      btn('Yok', 'dim-off', settings.dim === 'off') + btn('Tüm model', 'dim-model', settings.dim === 'model') + btn('Her parça', 'dim-part', settings.dim === 'part') +
      '<div class="lbl h">Ölçü birimi</div>' +
      btn('mm', 'unit-mm', settings.unit === 'mm') + btn('cm', 'unit-cm', settings.unit === 'cm') + btn('inç', 'unit-in', settings.unit === 'in') +
      '<div class="lbl h">Kesit (modeli ortadan kesip içini göster)</div>' +
      btn('Kesit: ' + (section.on ? 'açık' : 'kapalı'), 'sec-toggle', section.on) +
      (section.on
        ? btn('X ekseni', 'sec-x', section.axis === 'x') + btn('Y ekseni', 'sec-y', section.axis === 'y') + btn('Z ekseni', 'sec-z', section.axis === 'z') + btn('Ters çevir', 'sec-flip', section.flip) +
          `<label class="f w2" style="flex:1 0 100%"><span data-sl>Kesit konumu: ${lenText(section.pos)}</span>` +
          `<input type="range" data-s="pos" min="${sec[0]}" max="${sec[1]}" step="${rg / 200}" value="${section.pos}"></label>`
        : '');
    hint = 'Ölçüm aracı açıkken modelde iki noktaya dokun, aradaki mesafe yazılır (köşelere yapışır). Perspektif: kapalıyken (ortografik) uzaktaki şeyler küçülmez, ölçü almak için iyidir. Sürüm: ' + APP_VER;
  } else {
    const fl = fieldsFor(p);
    body = fl.map(([l, k, kd]) => field(l, k, p, kd)).join('') + (p.type === 'sketch' && !p.gear ? btn('✎ Krokiyi düzenle', 'sketch-edit') : '') + (p.gear ? gearInfo(p) : '');
    if (p.type === 'sheet') {
      const c = sheetCalc(p);
      body += (p.seg || []).map((sg, i) => '<div class="lbl h">' + (i + 1) + '. kenar</div>' +
        (i > 0 ? `<label class="f"><span>Büküm açısı ° (+ yukarı, − aşağı)</span><input type="number" step="any" data-seg="${i},a" value="${fmtNum(sg.a, 2)}"></label>` : '') +
        `<label class="f"><span>Dış ölçü (${settings.unit})</span><input type="number" step="any" data-seg="${i},L" value="${lenVal(sg.L)}"></label>`).join('') +
        btn('+ Kenar ekle', 'seg-add') + btn('− Son kenarı sil', 'seg-del') +
        `<div class="lbl" style="flex:1 0 100%;font-size:13px;color:${c.ok ? '#cbd5e1' : '#f87171'}">${c.ok ? 'Açınım boyu: <b>' + lenText(c.flatL) + '</b> × ' + lenText(c.W) + ' · ' + c.bends.length + ' büküm' : '⚠ ' + c.err}</div>` +
        bendWarnings(p).map((w) => `<div class="lbl" style="flex:1 0 100%;font-size:13px;color:#f87171">⚠ ${w}</div>`).join('');
    }
    if (p.type === 'sweep' && p.path === 'poly') {
      body += (p.pts || []).map((q, i) => '<div class="lbl h">Yol noktası ' + (i + 1) + '</div>' +
        ['X', 'Y', 'Z'].map((a, k) => `<label class="f"><span>${a} (${settings.unit})</span><input type="number" step="any" data-pt="${i},${k}" value="${lenVal(q[k])}"></label>`).join('')).join('') +
        btn('+ Nokta ekle', 'pt-add') + btn('− Son noktayı sil', 'pt-del');
    }
    if (p.type === 'mesh') body = '<div class="lbl" style="flex:1 0 100%">Tek parça: ölçüleri artık değişmez. Konum ve Döndür sekmeleri çalışır; yeni parça ekleyip birleştirebilir ya da oyabilirsin.</div>';
    hint = (p.type === 'frame' ? 'Konstrüksiyon: ölçüler dış ölçüdür. Dikmeler tam boy, kuşaklar dikmelerin arasına alın (düz) kesimle oturur. Ağırlık çelik (7,85) içindir. ' : p.type === 'sheet' ? 'Sac: ölçüler dış ölçüdür (sanal keskin köşeye kadar). Açınım boyu = düz kısımlar + büküm payları, büküm payı = açı × (R + K × kalınlık). K faktörü malzemeye ve kalıba göre değişir (çelik için 0,3–0,5). ' : p.type === 'sweep' ? 'Süpürme: profil, yol boyunca sürülür (boru, dirsek, yay, vida). Yol Tür sekmesinden seçilir; çok noktalı yolda köşeler Köşe yarıçapı ile yuvarlanır. Eğri yarıçapı profilden küçük olamaz. ' : p.type === 'loft' ? 'Loft: alttaki şekilden üstteki şekle geçiş (kare tabandan yuvarlak ağza gibi). Burulma üst şekli döndürür. ' : '') + 'Ölçüler (' + settings.unit + ')' + (p.type === 'box' || p.type === 'cylinder' ? '. Yuvarlama ve pah birlikte kullanılırsa yuvarlama geçerli olur. Eğim: üst yüz, her yönden yükseklik × tan(eğim) kadar daralır (döküm eğimi).' : '');
  }
  $('tabbody').innerHTML = body;
  $('tabbody').classList.add('grid'); // tüm sekmelerde düğmeler okunur boyutta, satıra en fazla 2 tane
  if (typeof weldGroup !== 'undefined') { weldGroup.visible = tab === 'weld'; if (tab === 'weld') drawWelds(); }
  if (typeof wgtGroup !== 'undefined') drawWeightMarker();
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
    try { localStorage.setItem('cizim:auto', JSON.stringify({ snap: snapshotSave(), projName })); } catch (e) { /* dolu/engelli */ }
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
  if (type === 'frame') p.y = 0;   // iskelet yere otursun
  parts.push(p);
  selOff = null; sel = p.id;
  refreshAll(type === 'frame');
  return p;
}

function removeCur() {
  if (parts.length < 2) { toast('Son parça silinemez'); return false; }
  commit();
  parts.splice(parts.indexOf(cur()), 1);
  cleanLinks(parts);
  selOff = null; sel = parts[0].id;
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
    selOff = null; sel = p.id;
    refreshAll(true);
    toast('Kroki parça olarak eklendi');
  });
}
function open2D() {
  openCad2D({
    onExtrude(draw) {
      commit();
      const p = Object.assign(newPart(nextId++, 'box', 'add', null), sketchFromDraw(draw));
      p.name = '2B çizimden';
      parts.push(p);
      selOff = null; sel = p.id;
      refreshAll(true);
      toast('2B çizim 3B parçaya çevrildi');
    },
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
  selOff = null; sel = list[0].id;
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

/* ---- dışa aktarma: parça listesi (CSV), DXF ---- */
function saveBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
const fileBase = () => (projName || 'model').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_');
function exportBom() {
  const fmt = (v) => fmtNum(toUnit(v, settings.unit), 2).replace('.', ',');
  const rows = bomRows(parts, fmt);
  rows[0][4] = 'Ölçü (' + settings.unit + ')';
  saveBlob(new Blob([csvFromRows(rows)], { type: 'text/csv;charset=utf-8' }), fileBase() + '-parca-listesi.csv');
  toast('Parça listesi indirildi');
}
function cutListHtml(p) {
  const c = frameCalc(p);
  const row = (a, b, c2, k, d) => `<div style="flex:1 0 100%;display:flex;gap:6px;font-size:13px;padding:3px 4px;border-top:1px solid #1e293b"><span style="flex:2">${a}</span><span style="flex:.7;text-align:right">${b}</span><span style="flex:1.2;text-align:right">${c2}</span><span style="flex:1.1;text-align:right">${k}</span><span style="flex:1.2;text-align:right">${d}</span></div>`;
  return '<div class="lbl h">Kesim listesi · ' + esc(c.pr.name) + '</div>' + row('<b>Eleman</b>', '<b>Adet</b>', '<b>Boy</b>', '<b>Kesim</b>', '<b>Toplam</b>') +
    c.cut.map((g) => row(esc(g.role), g.qty, lenText(g.len), g.cut, lenText(g.len * g.qty))).join('') +
    row('<b>Toplam</b>', c.members.length, '', '', '<b>' + lenText(c.totalLen) + '</b>') +
    (c.cut.some((g) => g.cut !== '90°') ? '<div class="lbl" style="flex:1 0 100%">Gönyeli boylar uzun kenardan (dış) ölçüdür; testere payını ayrıca ekle.</div>' : '') +
    `<div class="lbl" style="flex:1 0 100%;font-size:13px">Ağırlık (çelik): <b>${fmtNum(c.kg, 2)} kg</b> · 6 m'lik boydan yaklaşık ${Math.ceil(c.totalLen / 6000 * 1.05)} boy</div>`;
}
/* ---- Akıllı Üretilebilirlik Kontrolü: model hazırlama, 3B işaretleme ---- */
function geoTris(geo) {
  const P = geo.attributes.position, idx = geo.index, total = idx ? idx.count : P.count;
  const start = geo.drawRange.start || 0, count = Math.max(0, Math.min(isFinite(geo.drawRange.count) ? geo.drawRange.count : total - start, total - start));
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { const v = idx ? idx.getX(start + i) : start + i; out[i * 3] = P.getX(v); out[i * 3 + 1] = P.getY(v); out[i * 3 + 2] = P.getZ(v); }
  return out;
}
let rebuildCount = 0;
function mfgModel() {
  const mates = [];
  for (const A of parts) for (const m of A.mates || []) mates.push([A.id, m.b, m.t]);
  let stock = 6000;
  try { stock = Number((JSON.parse(localStorage.getItem('cizim:cutopt') || '{}').set || {}).stock) || 6000; } catch (e) { /* */ }
  return {
    parts: lastBrushes.map(({ p, geo }) => {
      const m = partMat(p);
      return { id: p.id, name: partName(p, parts.indexOf(p)), type: p.type, op: parts.indexOf(p) > 0 && p.op === 'sub' ? 'sub' : 'add', tris: geoTris(geo), p, material: { id: m.id, name: m.name, kind: m.kind }, warnings: bendWarnings(p) };
    }),
    mates, mateErr, stock, hiddenCount: parts.filter((q) => q.hidden).length,
  };
}
const mfgGroup = new THREE.Group();
scene.add(mfgGroup);
const mfgRegionMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false });
const mfgPartMat = new THREE.MeshBasicMaterial({ color: 0xf97316, transparent: true, opacity: 0.35, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
function mfgMark(x) {
  mfgGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  mfgGroup.clear();
  if (!x) return;
  const box = new THREE.Box3();
  for (const id of x.parts || []) {
    const b = lastBrushes.find((q) => q.p.id === id);
    if (!b) continue;
    const g = b.geo.clone();
    mfgGroup.add(new THREE.Mesh(g, mfgPartMat));
    g.computeBoundingBox(); if (!x.box) box.union(g.boundingBox);
  }
  if (x.box) {
    const mn = new THREE.Vector3(...x.box.min), mx = new THREE.Vector3(...x.box.max), c = mn.clone().add(mx).multiplyScalar(0.5);
    const sz = mx.clone().sub(mn).max(new THREE.Vector3(8, 8, 8));
    const m = new THREE.Mesh(new THREE.BoxGeometry(sz.x, sz.y, sz.z), mfgRegionMat);
    m.position.copy(c); m.renderOrder = 999;
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(sz.x, sz.y, sz.z)), new THREE.LineBasicMaterial({ color: 0xef4444, depthTest: false }));
    e.position.copy(c); e.renderOrder = 1000;
    mfgGroup.add(m, e);
    box.setFromCenterAndSize(c, sz.clone().multiplyScalar(2.5).max(new THREE.Vector3(40, 40, 40)));
  }
  if (!box.isEmpty()) fit(box);
}
const mfg = createMfg({
  getModel: mfgModel,
  mark: mfgMark,
  selectPart(id) { if (parts.some((q) => q.id === id)) { selOff = null; sel = id; refreshOverlays(); renderPanel(); toast('Parça seçildi: düzenlemek için Ölçü / Konum sekmesine geç'); } },
  render: () => { if (tab === 'mfg') renderPanel(); },
  toast,
  name: () => projName || 'model',
  version: () => rebuildCount,
  openCutOpt: () => openCutOpt({ name: fileBase(), fromCad: cadCutPieces }),
  snapshot() {
    renderer.render(scene, camera);
    const src = renderer.domElement, c = document.createElement('canvas');
    c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
    return c;
  },
});

/* ---- Akıllı Kaynak Planlama: 3B dikiş gösterimi ---- */
const weldGroup = new THREE.Group();
weldGroup.visible = false;
scene.add(weldGroup);
const WELD_COL = { kose: 0xf97316, alin: 0xef4444, t: 0xa855f7 };
const weldMats = new Map();
const weldMat = (col, op) => { const k = col + ':' + op; if (!weldMats.has(k)) weldMats.set(k, new THREE.MeshBasicMaterial({ color: col, transparent: op < 1, opacity: op, depthWrite: op >= 1 })); return weldMats.get(k); };
function drawWelds() {
  weldGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } });
  weldGroup.clear();
  weldSprites.length = 0;
  if (!weldPlan || !weldPlan.welds) return;
  const bb = lastClean && lastClean.boundingBox, size = bb ? bb.getSize(new THREE.Vector3()).length() : 500;
  const R = Math.max(1.2, size * 0.0025), selId = weldUI.state.sel;
  for (const w of weldPlan.welds) {
    if (w.status === 'rejected' || !w.pos) continue;
    const on = w.id === selId, col = on ? 0xfacc15 : WELD_COL[w.type] || 0x94a3b8, op = w.status === 'approved' || on ? 1 : 0.45, r = on ? R * 1.7 : R;
    const pts = (w.path || [w.pos]).map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    if (pts.length >= 2) {
      const cp = new THREE.CurvePath();
      const n = w.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) cp.add(new THREE.LineCurve3(pts[i], pts[(i + 1) % pts.length]));
      weldGroup.add(new THREE.Mesh(new THREE.TubeGeometry(cp, Math.max(8, n * 6), r, 6, false), weldMat(col, op)));
    } else weldGroup.add(Object.assign(new THREE.Mesh(new THREE.SphereGeometry(r * 3, 12, 8), weldMat(col, op)), { position: pts[0] }));
    const sp = textSprite(w.label + (w.status === 'approved' ? ' ✓' : ''));
    sp.position.set(w.pos[0], w.pos[1], w.pos[2]);
    weldGroup.add(sp); weldSprites.push(sp);
  }
  updateLabelScales();
}
function shot3D() {
  renderer.render(scene, camera);
  const src = renderer.domElement, c = document.createElement('canvas');
  c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);
  return c;
}
const weldUI = createWeldUI({
  getModel: mfgModel,
  getPlan: () => weldPlan,
  setPlan: (p) => { weldPlan = p; },
  commit,
  changed: () => { scheduleSave(); renderPanel(); if (tab !== 'weld') drawWelds(); },
  render: () => { if (tab === 'weld') renderPanel(); else drawWelds(); },
  focus(w) {
    drawWelds();
    if (!w || !w.pos) return;
    const box = new THREE.Box3();
    for (const p of w.path && w.path.length ? w.path : [w.pos]) box.expandByPoint(new THREE.Vector3(p[0], p[1], p[2]));
    const c = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3()).multiplyScalar(3).max(new THREE.Vector3(120, 120, 120));
    fit(new THREE.Box3().setFromCenterAndSize(c, sz));
  },
  toast,
  name: () => projName || 'model',
  parts: () => parts.filter((q) => !q.hidden && !(parts.indexOf(q) > 0 && q.op === 'sub')).map((q) => ({ id: q.id, name: partName(q, parts.indexOf(q)) })),
  bbox: () => (lastClean && lastClean.boundingBox ? { min: lastClean.boundingBox.min.toArray(), max: lastClean.boundingBox.max.toArray() } : null),
  version: () => rebuildCount,
  openSheet: () => makeSheet(false),
  snapshot: shot3D,
});

/* ---- Akıllı Ağırlık ve Ağırlık Merkezi ---- */
// her parçanın kendine ait katısı: parça − (sıralamada kendinden sonra gelen bütün parçalar). Birleştirme sırayla yapıldığı için
// bir noktadaki malzeme, o noktayı kapsayan son parçaya aittir; böylece oyuklar düşülür, iç içe hacim iki kez sayılmaz.
function weightItems() {
  const B = lastBrushes.map(({ p, geo }) => { if (!geo.boundingBox) geo.computeBoundingBox(); return { p, geo, sub: parts.indexOf(p) > 0 && p.op === 'sub', box: geo.boundingBox }; });
  const keep = evaluator.useGroups;
  evaluator.useGroups = false;
  const items = [];
  try {
    B.forEach((b, i) => {
      if (b.sub) return;
      let tris, exact = true;
      try {
        const later = B.slice(i + 1).filter((o) => o.box.intersectsBox(b.box));
        if (!later.length) tris = geoTris(b.geo);
        else {
          let res = new Brush(b.geo.clone()); res.updateMatrixWorld();
          for (const o of later) {
            const ob = new Brush(o.geo.clone()); ob.updateMatrixWorld();
            const nx = evaluator.evaluate(res, ob, SUBTRACTION);
            res.geometry.dispose(); ob.geometry.dispose();
            res = nx; res.updateMatrixWorld();
          }
          tris = geoTris(res.geometry); res.geometry.dispose();
        }
      } catch (err) { tris = geoTris(b.geo); exact = false; }
      const m = partMat(b.p), custom = Number(b.p.rho) > 0 ? Number(b.p.rho) : null;
      items.push({ id: b.p.id, name: partName(b.p, parts.indexOf(b.p)), type: b.p.type, p: b.p, tris, exact, material: { id: m.id, name: m.name, rho: m.rho, kind: m.kind }, rho: custom ?? m.rho, rhoSrc: custom != null ? 'özel' : b.p.mat ? 'malzeme' : 'varsayılan' });
    });
  } finally { evaluator.useGroups = keep; }
  return items;
}
let wgtCache = { key: null, res: null };
function weightCompute() {
  const key = rebuildCount + '|' + (settings.mat || '') + '|' + parts.map((q) => q.id + ':' + (q.mat || '') + ':' + (q.rho || '')).join(',');
  if (wgtCache.key !== key) wgtCache = { key, res: lastBrushes.length ? analyzeWeight(weightItems()) : null };
  return wgtCache.res;
}
const wgtGroup = new THREE.Group();
scene.add(wgtGroup);
const wgtShowLift = { on: false };
let wgtTimer = 0;
function scheduleWeightMarker() { clearTimeout(wgtTimer); if (tab === 'wgt' || settings.cogShow) wgtTimer = setTimeout(drawWeightMarker, 250); }
function drawWeightMarker() {
  wgtGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material && o.material.map) o.material.map.dispose(); });
  wgtGroup.clear();
  wgtSprites.length = 0;
  if (!(tab === 'wgt' || settings.cogShow) || !lastClean) return;
  let R;
  try { R = weightCompute(); } catch (err) { return; }
  if (!R || !R.total.com) return;
  const c = new THREE.Vector3(...R.total.com), size = lastClean.boundingBox.getSize(new THREE.Vector3()).length();
  const r = Math.max(4, size * 0.022);
  // ağırlık merkezi sembolü: dörtte bir boyalı küre (kırmızı / beyaz), her zaman önde
  const red = new THREE.MeshBasicMaterial({ color: 0xdc2626, depthTest: false, depthWrite: false });
  const white = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false });
  for (let k = 0; k < 4; k++) for (let tq = 0; tq < 2; tq++) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 6, k * Math.PI / 2, Math.PI / 2, tq * Math.PI / 2, Math.PI / 2), (k + tq) % 2 ? red : white);
    m.position.copy(c); m.renderOrder = 1001; wgtGroup.add(m);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 1.05, r * 0.08, 6, 32), new THREE.MeshBasicMaterial({ color: 0x111827, depthTest: false }));
  ring.position.copy(c); ring.renderOrder = 1002; wgtGroup.add(ring);
  const lbl = textSprite('AM · ' + fkg(R.total.kg));
  lbl.position.copy(c).add(new THREE.Vector3(0, r * 2.2, 0)); wgtGroup.add(lbl); wgtSprites.push(lbl);
  const Bl = R.balance;
  if (Bl) {
    const floorY = Bl.ymin + 0.5;
    const dl = new THREE.Line(new THREE.BufferGeometry().setFromPoints([c, new THREE.Vector3(c.x, floorY, c.z)]), new THREE.LineDashedMaterial({ color: 0xdc2626, dashSize: r * 0.8, gapSize: r * 0.5, depthTest: false }));
    dl.computeLineDistances(); dl.renderOrder = 1000; wgtGroup.add(dl);
    const cr = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(c.x - r, floorY, c.z), new THREE.Vector3(c.x + r, floorY, c.z), new THREE.Vector3(c.x, floorY, c.z - r), new THREE.Vector3(c.x, floorY, c.z + r)]), new THREE.LineBasicMaterial({ color: 0xdc2626, depthTest: false }));
    cr.renderOrder = 1000; wgtGroup.add(cr);
    if (Bl.hull.length >= 2) {
      const col = { ok: 0x22c55e, care: 0xeab308, high: 0xf97316, tips: 0xef4444, line: 0xef4444 }[Bl.status] || 0x22c55e;
      const hp = Bl.hull.map((q) => new THREE.Vector3(q[0], floorY, q[1]));
      const hl = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(hp), new THREE.LineBasicMaterial({ color: col, depthTest: false }));
      hl.renderOrder = 1000; wgtGroup.add(hl);
    }
    if (Bl.feet.length > 1 && Bl.feet.length <= 12) for (const f of Bl.feet) { const sp = textSprite(fkg(f.kg)); sp.position.set(f.c[0], floorY, f.c[1]); wgtGroup.add(sp); wgtSprites.push(sp); }
  }
  const L = R.lift;
  if (wgtShowLift.on && L) {
    const hook = new THREE.Vector3(c.x, L.points[0].y + L.legs[0].hookHeight, c.z);
    const ym = new THREE.MeshBasicMaterial({ color: 0xfacc15, depthTest: false });
    const segs = [];
    for (const q of L.points) {
      const pnt = new THREE.Vector3(q.x, q.y, q.z);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(r * 0.6, r * 1.4, 12), ym);
      cone.rotation.x = Math.PI; cone.position.copy(pnt).add(new THREE.Vector3(0, r * 0.7, 0)); cone.renderOrder = 1001; wgtGroup.add(cone);
      segs.push(pnt, hook);
      const sp = textSprite(fkg(q.kg)); sp.position.copy(pnt).add(new THREE.Vector3(0, r * 2, 0)); wgtGroup.add(sp); wgtSprites.push(sp);
    }
    const sl = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(segs), new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false }));
    sl.renderOrder = 1000; wgtGroup.add(sl);
  }
  updateLabelScales();
}
const weightUI = createWeightUI({
  compute: weightCompute,
  materials: MATERIALS,
  partMat(id) { const q = parts.find((x) => x.id === id) || {}; const m = partMat(q); return { id: m.id, custom: Number(q.rho) > 0 ? Number(q.rho) : null, src: Number(q.rho) > 0 ? 'özel' : q.mat ? 'malzeme' : 'varsayılan' }; },
  setMat(id, mid) { const q = parts.find((x) => x.id === id); if (!q) return; commit(); q.mat = mid; scheduleSave(); renderPanel(); },
  setRho(id, v) { const q = parts.find((x) => x.id === id); if (!q) return; commit(); if (v == null) delete q.rho; else q.rho = v; scheduleSave(); renderPanel(); },
  focusPart(id) {
    const b = lastBrushes.find((x) => x.p.id === id);
    if (!b) return;
    selOff = null; sel = id; refreshOverlays();
    if (!b.geo.boundingBox) b.geo.computeBoundingBox();
    fit(b.geo.boundingBox.clone().expandByScalar(b.geo.boundingBox.getSize(new THREE.Vector3()).length() * 0.3));
    renderPanel();
  },
  get show3D() { return !!settings.cogShow; },
  set show3D(v) { settings.cogShow = !!v; saveSettings(); },
  get showLift() { return wgtShowLift.on; },
  set showLift(v) { wgtShowLift.on = !!v; },
  render: () => { if (tab === 'wgt') renderPanel(); else drawWeightMarker(); },
  toast,
  name: () => projName || 'model',
  snapshot: shot3D,
});

/* ---- Akıllı Üretim Maliyeti: modelden miktarlar ---- */
function costModel() {
  const R = weightCompute();
  if (!R) return { parts: [] };
  const num = (v) => Math.max(Number(v) || 0, 0);
  const out = { parts: [], sheets: [], profiles: [], holes: [], weld: null, cutCfg: {} };
  for (const r of R.parts) {
    const q = parts.find((x) => x.id === r.id);
    if (!q) continue;
    const m = matById(r.material.id);
    let stock;
    if (q.type === 'box') stock = { kind: 'block', dims: [num(q.w), num(q.l), num(q.h)] };
    else if (q.type === 'cylinder' || q.type === 'cone') stock = { kind: 'bar', D: Math.max(num(q.d), q.type === 'cone' ? num(q.d2) : 0), H: num(q.h) };
    else if (q.type === 'sphere') stock = { kind: 'bar', D: num(q.d), H: num(q.d) };
    else if (q.type === 'tube') stock = { kind: 'pipe', D: num(q.d), Di: num(q.di), H: num(q.h) };
    else if (q.type === 'frame') stock = { kind: 'profile' };
    else if (q.type === 'sheet') { const c = sheetCalc(q); stock = { kind: 'sheet', flatL: c.flatL, W: c.W, T: c.T }; out.sheets.push({ id: q.id, name: r.name, T: c.T, flatL: c.flatL, W: c.W, bends: c.bends.length }); }
    else { const b = lastBrushes.find((x) => x.p.id === q.id); if (b) { if (!b.geo.boundingBox) b.geo.computeBoundingBox(); const sz = b.geo.boundingBox.getSize(new THREE.Vector3()); stock = { kind: 'bbox', dims: [sz.x, sz.z, sz.y] }; } }
    out.parts.push({ id: r.id, name: r.name, type: r.type, cat: r.cat, kg: r.kg || 0, rho: r.rho, material: { id: m.id, name: m.name, rho: r.rho, kind: m.kind, sy: m.sy }, stock });
    if (q.type === 'frame') {
      const c = frameCalc(q), mm = partMat(q), matName = MAT_SHORT[mm.id] || mm.name, key = groupKey(c.pr.name, matName), rho = Number(q.rho) > 0 ? Number(q.rho) : mm.rho;
      for (const g of c.cut) out.profiles.push({ key, profile: c.pr.name, matName, matId: mm.id, label: r.name + ' · ' + g.role, len: g.len, qty: g.qty, kgPerM: profileArea(c.pr) * rho / 1000 });
    }
  }
  // delikler: oyuk silindirler
  const hm = new Map();
  parts.forEach((q, i) => { if (i > 0 && q.op === 'sub' && q.type === 'cylinder' && !q.hidden) { const k = Math.round(num(q.d) * 10) / 10; const o = hm.get(k) || { d: k, depth: 0, count: 0 }; o.count++; o.depth = Math.max(o.depth, num(q.h)); hm.set(k, o); } });
  out.holes = [...hm.values()];
  // kaynak: onaylı plan
  if (weldPlan && (weldPlan.welds || []).some((w) => w.status === 'approved')) {
    const rep = weldReport(weldPlan.welds, weldPlan.set), c0 = rep.cons;
    const alt = weldAltCons(weldPlan);
    out.weld = { approvedN: rep.approved, connLen: rep.connLen, workMin: rep.workMin, wireKg: c0.reduce((s, c) => s + (c.wireM != null || c.rodM != null ? c.needG / 1000 : 0), 0), electrodes: c0.reduce((s, c) => s + (c.electrodes || 0), 0), gasL: c0.reduce((s, c) => s + (c.gasL || 0), 0), alt: alt ? { name: alt.name, workMin: alt.workMin } : null, unsized: rep.unknown.length };
  }
  try { const co = JSON.parse(localStorage.getItem('cizim:cutopt') || '{}'); out.cutCfg = { ...(co.set || {}), prices: co.prices || {} }; } catch (e) { /* */ }
  return out;
}
const costUI = createCostUI({
  model: costModel,
  materials: MATERIALS.map((m) => ({ id: m.id, name: m.name, rho: m.rho, kind: m.kind, sy: m.sy })),
  render: () => { if (tab === 'cost') renderPanel(); },
  toast,
  name: () => projName || 'model',
});

/* ---- Akıllı Montaj Sırası ve 3B Patlatılmış Görünüm ---- */
// parçalar: kendi katısı (sonraki parçalar ve delikler düşülmüş, Ağırlık ile aynı) + oyuk silindirler (delik ekseni için)
let asmItemsCache = { key: null, items: null };
function ownItems() {
  if (asmItemsCache.key !== rebuildCount) asmItemsCache = { key: rebuildCount, items: lastBrushes.length ? weightItems() : [] };
  return asmItemsCache.items;
}
function asmModel() {
  ownItems();
  const solids = asmItemsCache.items.map((it) => ({ id: it.id, name: it.name, type: it.type, op: 'add', tris: it.tris, p: it.p, material: it.material }));
  const holes = lastBrushes.filter(({ p }) => parts.indexOf(p) > 0 && p.op === 'sub').map(({ p, geo }) => ({ id: p.id, name: partName(p, parts.indexOf(p)), type: p.type, op: 'sub', tris: geoTris(geo), p }));
  const mates = [];
  for (const A of parts) for (const m of A.mates || []) mates.push([A.id, m.b, m.t]);
  return { parts: [...solids, ...holes], welds: weldPlan ? weldPlan.welds || [] : [], mates, mateErr };
}
const asmGroup = new THREE.Group();
asmGroup.visible = false;
scene.add(asmGroup);
const ASM_MAT = {
  placed: new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.25, roughness: 0.55 }),
  active: new THREE.MeshStandardMaterial({ color: 0xf97316, metalness: 0.2, roughness: 0.5, emissive: 0x7c2d12, emissiveIntensity: 0.35 }),
  ghost: new THREE.MeshStandardMaterial({ color: 0x64748b, transparent: true, opacity: 0.14, depthWrite: false }),
  sel: new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.2, roughness: 0.45, emissive: 0x713f12, emissiveIntensity: 0.4 }),
};
function asmClear() { asmGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); asmGroup.clear(); }
function asmEnter(res) {
  asmClear();
  const items = asmItemsCache.items || [];
  const edgeM = new THREE.LineBasicMaterial({ color: 0x0b1220 });
  for (const it of items) {
    if (!it.tris || it.tris.length < 9) continue;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(it.tris, 3)); g.computeVertexNormals();
    const node = new THREE.Group(); node.userData.id = it.id;
    const mesh = new THREE.Mesh(g, ASM_MAT.placed); mesh.userData.id = it.id; node.add(mesh);
    try { const eg = new THREE.EdgesGeometry(g, 30); const ln = new THREE.LineSegments(eg, edgeM); ln.userData.edge = true; node.add(ln); } catch (e) { /* kenar çizgisi olmadan */ }
    asmGroup.add(node);
  }
  asmGroup.visible = true; modelGroup.visible = false; ovl.visible = false; wgtGroup.visible = false;
}
function asmLeave() { asmClear(); asmGroup.visible = false; modelGroup.visible = true; ovl.visible = true; wgtGroup.visible = true; }
function asmApply(st, selId) {
  for (const node of asmGroup.children) {
    const s = st.get(node.userData.id) || { off: [0, 0, 0], mode: 'placed' };
    node.position.set(s.off[0], s.off[1], s.off[2]);
    const mesh = node.children[0], ln = node.children[1];
    mesh.material = node.userData.id === selId ? ASM_MAT.sel : ASM_MAT[s.mode] || ASM_MAT.placed;
    mesh.renderOrder = s.mode === 'ghost' ? 2 : 0;
    if (ln) ln.visible = s.mode !== 'ghost';
  }
}
function asmTap(cx, cy) {
  setRay(cx, cy);
  const meshes = asmGroup.children.filter((n) => n.children[0].material !== ASM_MAT.ghost).map((n) => n.children[0]);
  const hit = raycaster.intersectObjects(meshes, false)[0];
  asmUI.select(hit ? hit.object.userData.id : null);
}
var asmUI = createAssemblyUI({   // var: yeniden çizim modül yüklenirken çağrılırsa henüz tanımsız olabilir
  model: asmModel,
  size: () => (lastClean ? lastClean.boundingBox.getSize(new THREE.Vector3()).length() : 500),
  getAnswers: () => asmAnswers,
  setAnswers: (o) => { asmAnswers = o; scheduleSave(); },
  enter: asmEnter,
  leave: asmLeave,
  apply: asmApply,
  focus(ids) {
    const box = new THREE.Box3();
    for (const n of asmGroup.children) if (ids.includes(n.userData.id)) box.expandByObject(n);
    if (!box.isEmpty()) fit(box.clone().expandByScalar(box.getSize(new THREE.Vector3()).length() * 0.4));
  },
  render: () => { if (tab === 'asm') renderPanel(); },
  toast,
  name: () => projName || 'model',
  snapshot: shot3D,
});

/* ---- 🔮 Geleceğimi Göster: sanal test ortamı (3B sonuç çizimi) ---- */
const simGroup = new THREE.Group();
simGroup.visible = false;
scene.add(simGroup);
// mavi → camgöbeği → yeşil → sarı → kırmızı
const SIM_STOPS = [[0.114, 0.306, 0.847], [0.024, 0.714, 0.831], [0.133, 0.773, 0.369], [0.918, 0.702, 0.031], [0.937, 0.267, 0.267]];
function simColor(t, out, i) {
  t = Math.min(1, Math.max(0, t)) * (SIM_STOPS.length - 1);
  const k = Math.min(SIM_STOPS.length - 2, Math.floor(t)), f = t - k, a = SIM_STOPS[k], b = SIM_STOPS[k + 1];
  out[i] = a[0] + (b[0] - a[0]) * f; out[i + 1] = a[1] + (b[1] - a[1]) * f; out[i + 2] = a[2] + (b[2] - a[2]) * f;
}
function simClear() {
  simGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
  simGroup.clear(); simSprites.length = 0; simAnim.spec = null; simAnim.mesh = null; simAnim.ghost = null;
}
function simMesh(fe, quads, colors, opts) {
  const g = new THREE.BufferGeometry(), idx = new Uint32Array(quads.length / 4 * 6);
  for (let i = 0, k = 0; i < quads.length; i += 4) { idx[k++] = quads[i]; idx[k++] = quads[i + 1]; idx[k++] = quads[i + 2]; idx[k++] = quads[i]; idx[k++] = quads[i + 2]; idx[k++] = quads[i + 3]; }
  g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(fe.xyz), 3));
  if (colors) g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: colors ? 0xffffff : 0x94a3b8, vertexColors: !!colors, side: THREE.DoubleSide, flatShading: true, metalness: 0.1, roughness: 0.65, ...opts }));
}
function simDraw(spec) {
  simClear();
  const { fe } = spec;
  let colors = null;
  if (spec.val && !spec.before) { colors = new Float32Array(fe.nn * 3); const d = (spec.vmax - spec.vmin) || 1; for (let n = 0; n < fe.nn; n++) simColor((spec.val[n] - spec.vmin) / d, colors, n * 3); }
  const mesh = simMesh(fe, spec.quads, colors);
  simGroup.add(mesh);
  if (spec.ghost && spec.disp) { const gm = simMesh(fe, spec.quads, null, { transparent: true, opacity: 0.18, depthWrite: false, color: 0xe2e8f0 }); gm.renderOrder = 2; simGroup.add(gm); simAnim.ghost = gm; }
  const sz = lastClean ? lastClean.boundingBox.getSize(new THREE.Vector3()).length() : 500;
  if (spec.sup.length) {
    const pts = new Float32Array(spec.sup.length * 3); spec.sup.forEach((n, i) => { pts[i * 3] = fe.xyz[n * 3]; pts[i * 3 + 1] = fe.xyz[n * 3 + 1]; pts[i * 3 + 2] = fe.xyz[n * 3 + 2]; });
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const pm = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x22c55e, size: 7, sizeAttenuation: false, depthTest: false })); pm.renderOrder = 1000; simGroup.add(pm);
  }
  for (const L of spec.loads) {
    const len = sz * 0.16, dir = new THREE.Vector3(...L.dir).normalize(), tip = new THREE.Vector3(...L.p);
    const ar = new THREE.ArrowHelper(dir, tip.clone().addScaledVector(dir, -len), len, 0xef4444, len * 0.3, len * 0.16);
    ar.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 1001; } }); simGroup.add(ar);
    const sp = textSprite(L.label); sp.position.copy(tip).addScaledVector(dir, -len * 1.15); simGroup.add(sp); simSprites.push(sp);
  }
  for (const m of spec.marks) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(Math.max(fe.h * 0.9, sz * 0.008), 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.85 }));
    s.position.set(...m.p); s.renderOrder = 1002; simGroup.add(s);
    const sp = textSprite('⚠ ' + m.label); sp.position.set(m.p[0], m.p[1] + sz * 0.04, m.p[2]); simGroup.add(sp); simSprites.push(sp);
  }
  simAnim.spec = spec; simAnim.mesh = mesh; simAnim.base = Float32Array.from(fe.xyz); simAnim.t0 = performance.now(); simAnim.last = -1;
  simTick(simAnim.t0, true);
  updateLabelScales();
}
function simTick(now, force) {
  const sp = simAnim.spec, mesh = simAnim.mesh;
  if (!sp || !mesh || !sp.disp || sp.before || !sp.scale) return;
  if (sp.anim === 'none' && !force) return;
  const t = (now - simAnim.t0) / 1000;
  const k = sp.anim === 'grow' ? 0.5 - 0.5 * Math.cos(t * 2 * Math.PI / 2.6) : sp.anim === 'osc' ? Math.sin(t * 2 * Math.PI / 1.6) : 1;
  const pos = mesh.geometry.attributes.position, a = pos.array, b = simAnim.base, d = sp.disp, s = k * sp.scale;
  for (let i = 0; i < a.length; i++) a[i] = b[i] + s * d[i];
  pos.needsUpdate = true;
}
function simTap(cx, cy) {
  if (!simAnim.mesh || !simUI.picking) return;
  setRay(cx, cy);
  simAnim.mesh.geometry.computeBoundingSphere(); simAnim.mesh.geometry.computeBoundingBox();
  const hit = raycaster.intersectObject(simAnim.mesh, false)[0];
  if (!hit) { toast('Modelin üstüne dokun'); return; }
  // animasyonla kaymış yüzeyden gerçek (yüklenmemiş) konuma: dokunulan yüzün düğümünün o anki kaymasını çıkar
  const p = hit.point.clone();
  if (hit.face) p.sub(new THREE.Vector3(mesh0(hit.face.a, 0), mesh0(hit.face.a, 1), mesh0(hit.face.a, 2)));
  simUI.tap([p.x, p.y, p.z]);
}
const mesh0 = (n, k) => simAnim.mesh.geometry.attributes.position.array[n * 3 + k] - simAnim.base[n * 3 + k];
function simEnter() { asmGroup.visible = false; simGroup.visible = true; modelGroup.visible = false; ovl.visible = false; wgtGroup.visible = false; }
function simLeave() { simClear(); simGroup.visible = false; modelGroup.visible = true; ovl.visible = true; wgtGroup.visible = true; }
const SIM_HASH_SKIP = new Set(['name', 'hidden']);
var simUI = createSimUI({   // var: yeniden çizim modül yüklenirken çağrılırsa henüz tanımsız olabilir
  info() {
    const vis = parts.filter((q, i) => !q.hidden && (i === 0 || q.op !== 'sub'));
    let kg = null; try { const R = weightCompute(); kg = R ? R.total.kg : null; } catch (e) { kg = null; }
    const sz = lastClean ? lastClean.boundingBox.getSize(new THREE.Vector3()) : new THREE.Vector3();
    return { parts: lastClean ? vis.map((q) => { const m = partMat(q); return { id: q.id, name: partName(q, parts.indexOf(q)), matId: m.id, matName: m.name, chosen: !!q.mat }; }) : [], size: [sz.x, sz.y, sz.z], kg };
  },
  hash() {
    const str = JSON.stringify(parts, (k, v) => (SIM_HASH_SKIP.has(k) ? undefined : v));
    let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(36) + ':' + str.length;
  },
  items: () => ownItems().map((it) => { const q = parts.find((x) => x.id === it.id); return { id: it.id, name: it.name, tris: it.tris, matId: partMat(q || it.p).id }; }),
  materials: MATERIALS,
  setMat(id, mid) { const q = parts.find((x) => x.id === id); if (!q) return; commit(); q.mat = mid; scheduleSave(); renderPanel(); },
  getSim: () => simData,
  setSim(o) { simData = o; scheduleSave(); },
  draw: simDraw,
  enter: simEnter,
  leave: simLeave,
  focus(p, r) { fit(new THREE.Box3(new THREE.Vector3(p[0] - r, p[1] - r, p[2] - r), new THREE.Vector3(p[0] + r, p[1] + r, p[2] + r))); },
  render: () => { if (tab === 'sim') renderPanel(); },
  toast,
  name: () => projName || 'model',
  snapshot: shot3D,
  prices() { try { return (JSON.parse(localStorage.getItem('cizim:cost') || '{}').prices) || {}; } catch (e) { return {}; } },
});

/* ---- 📐 Analiz (fea2.js): Gelecek sekmesinin 3B çizimini paylaşır ---- */
function femTap(cx, cy) {
  if (!simAnim.mesh) { toast('Önce "Ağı oluştur"'); return; }
  setRay(cx, cy);
  simAnim.mesh.geometry.computeBoundingSphere(); simAnim.mesh.geometry.computeBoundingBox();
  const hit = raycaster.intersectObject(simAnim.mesh, false)[0];
  if (!hit) { toast('Modelin üstüne dokun'); return; }
  const p = hit.point.clone();
  if (hit.face) p.sub(new THREE.Vector3(mesh0(hit.face.a, 0), mesh0(hit.face.a, 1), mesh0(hit.face.a, 2)));
  femUI.tap([p.x, p.y, p.z]);
}
var femUI = createFemUI({   // var: yeniden çizim modül yüklenirken çağrılırsa henüz tanımsız olabilir
  parts: () => (lastClean ? parts.filter((q, i) => !q.hidden && (i === 0 || q.op !== 'sub')).map((q) => ({ id: q.id, name: partName(q, parts.indexOf(q)), matId: partMat(q).id })) : []),
  items: () => ownItems().map((it) => ({ id: it.id, name: it.name, tris: it.tris })),
  geoHash: () => simUI && typeof simUI === 'object' ? (() => { const str = JSON.stringify(parts, (k, v) => (SIM_HASH_SKIP.has(k) ? undefined : v)); let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + ':' + str.length; })() : '',
  getFem: () => femData,
  setFem(o) { femData = o; scheduleSave(); },
  draw: simDraw, enter: simEnter, leave: simLeave,
  render: () => { if (tab === 'fem') renderPanel(); },
  toast,
  name: () => (projName || 'model').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_'),
  saveText: (text, name) => saveBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), name),
});

/* ---- ⚙ CNC: takım yolu çizimi ve malzeme kaldırma simülasyonu ---- */
const camGroup = new THREE.Group(); scene.add(camGroup);
const camState = { stock: null, tool: null, key: null };
const M2W = (x, y, z) => new THREE.Vector3(x, z, -y);   // makine → dünya
function camClear() { camGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); camGroup.clear(); camState.stock = null; camState.tool = null; camState.key = null; if (camState.hid) { modelGroup.visible = true; camState.hid = false; } }
const OPCOL = { face: 0x60a5fa, rough: 0x22c55e, walls: 0xf59e0b, finish: 0x38bdf8, drill: 0xa855f7 };
function camDraw(spec) {
  if (spec.mode === 'paths' || camState.key !== spec.mode) camClear();
  camState.key = spec.mode;
  const R = spec.R;
  if (spec.mode === 'paths') {
    if (camState.hid) { modelGroup.visible = true; camState.hid = false; }
    const rap = [];
    for (const op of R.ops) {
      const cut = []; let last = null;
      for (const m of op.moves) {
        if (m.k === 'd') { cut.push(M2W(m.x, m.y, m.r), M2W(m.x, m.y, m.z)); last = [m.x, m.y, m.r]; continue; }
        if (last) (m.k === 'r' ? rap : cut).push(M2W(...last), M2W(m.x, m.y, m.z));
        last = [m.x, m.y, m.z];
      }
      if (cut.length) camGroup.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(cut), new THREE.LineBasicMaterial({ color: OPCOL[op.type] || 0x22c55e, depthTest: false, transparent: true, opacity: 0.9 })));
    }
    if (rap.length) { const l = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(rap), new THREE.LineDashedMaterial({ color: 0xef4444, dashSize: 2, gapSize: 2, depthTest: false, transparent: true, opacity: 0.6 })); l.computeLineDistances(); camGroup.add(l); }
    const s = R.P.stock, bx = new THREE.Box3().setFromPoints([M2W(s.x0, s.y0, s.zBot), M2W(s.x1, s.y1, s.zTop)]);
    camGroup.add(new THREE.Box3Helper(bx, 0x94a3b8));
    // sıfır noktası
    const z0 = R.P.zero, ax = new THREE.AxesHelper(Math.max(10, (s.x1 - s.x0) * 0.15)); ax.position.copy(M2W(z0[0], z0[1], z0[2])); ax.material.depthTest = false; ax.renderOrder = 999; camGroup.add(ax);
    camGroup.children.forEach((o) => { o.renderOrder = o.renderOrder || 990; });
    return;
  }
  // simülasyon: stok yüzeyi (yükseklik ağı)
  modelGroup.visible = false; camState.hid = true;
  const SG = spec.SG, s = R.P.stock;
  if (!camState.stock || camState.stock.userData.SG !== SG) {
    if (camState.stock) { camGroup.remove(camState.stock); camState.stock.geometry.dispose(); }
    const n = SG.nx * SG.ny, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), idx = [];
    for (let j = 0; j < SG.ny; j++) for (let i = 0; i < SG.nx; i++) { const c = i + SG.nx * j; pos[c * 3] = SG.ox + (i + 0.5) * SG.res; pos[c * 3 + 2] = -(SG.oy + (j + 0.5) * SG.res); }
    for (let j = 0; j + 1 < SG.ny; j++) for (let i = 0; i + 1 < SG.nx; i++) { const a = i + SG.nx * j, b = a + 1, c2 = a + SG.nx, d = c2 + 1; if (SG.S[a] === -Infinity || SG.S[b] === -Infinity || SG.S[c2] === -Infinity || SG.S[d] === -Infinity) continue; idx.push(a, c2, b, b, c2, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(idx);
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, metalness: 0.35, roughness: 0.45 }));
    mesh.userData.SG = SG; camState.stock = mesh; camGroup.add(mesh);
  }
  const g = camState.stock.geometry, P = g.attributes.position.array, Cc = g.attributes.color.array, mk = spec.mark;
  for (let c = 0; c < SG.nx * SG.ny; c++) {
    const z = SG.S[c]; P[c * 3 + 1] = z === -Infinity ? s.zBot : z;
    const t = Math.max(0, Math.min(1, (z - s.zBot) / ((s.zTop - s.zBot) || 1)));
    let r = 0.55 + 0.25 * t, gg = 0.6 + 0.25 * t, b = 0.68 + 0.25 * t;
    if (mk && mk[c] === 1) { r = 0.94; gg = 0.27; b = 0.27; } else if (mk && mk[c] === -1) { r = 0.66; gg = 0.33; b = 0.97; }
    Cc[c * 3] = r; Cc[c * 3 + 1] = gg; Cc[c * 3 + 2] = b;
  }
  g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.computeVertexNormals();
  // takım
  if (spec.tool && spec.pos) {
    const t = spec.tool, key = t.type + t.d;
    if (!camState.tool || camState.tool.userData.key !== key) {
      if (camState.tool) { camGroup.remove(camState.tool); camState.tool.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
      const grp = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.6, roughness: 0.3 }), r = t.d / 2, L = Math.max(t.flute || 20, t.d * 3);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 24), mat); body.position.y = (t.type === 'ball' ? r : 0) + L / 2; grp.add(body);
      if (t.type === 'ball') { const sp = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12), mat); sp.position.y = r; grp.add(sp); }
      if (t.type === 'drill') { const cone = new THREE.Mesh(new THREE.ConeGeometry(r, r * 0.6, 24), mat); cone.rotation.x = Math.PI; cone.position.y = r * 0.3; grp.add(cone); body.position.y = r * 0.6 + L / 2; }
      grp.userData.key = key; camState.tool = grp; camGroup.add(grp);
    }
    camState.tool.position.copy(M2W(spec.pos[0], spec.pos[1], spec.pos[2]));
    camState.tool.visible = true;
  } else if (camState.tool) camState.tool.visible = false;
}
var camUI = createCamUI({   // var: yeniden çizim modül yüklenirken çağrılırsa henüz tanımsız olabilir
  model() {
    if (!lastClean) throw new Error('Model yok');
    const tris = geoTris(lastClean);
    const holes = [];
    for (const { p } of lastBrushes) {
      if (!(parts.indexOf(p) > 0 && p.op === 'sub' && p.type === 'cylinder')) continue;
      const H = cHoleAxis(p); if (Math.abs(H.axis[1]) < 0.999) continue;
      holes.push({ x: (H.base[0] + H.top[0]) / 2, z: (H.base[2] + H.top[2]) / 2, d: +p.d, top: Math.max(H.base[1], H.top[1]), bottom: Math.min(H.base[1], H.top[1]) });
    }
    const vis = parts.filter((q) => !q.hidden && q.op !== 'sub');
    const m = vis.length ? partMat(vis[0]) : { id: 'celik' };
    return { tris, holes, matId: m.id };
  },
  draw: camDraw,
  clear: camClear,
  render: () => { if (tab === 'cam') renderPanel(); },
  toast,
  name: () => projName || 'parca',
  saveBlob,
  snapshot: shot3D,
  date: () => new Date().toLocaleDateString('tr-TR'),
});

/* ---- ⚙ 4 / 5 eksen CNC: görüntü ---- */
const c5Group = new THREE.Group(); scene.add(c5Group);
const c5State = { hid: false, R: null, root: null, w: null, path: null, stock: null, tool: null, toolKey: null };
function c5Clear() {
  c5Group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  c5Group.clear();
  Object.assign(c5State, { R: null, root: null, w: null, path: null, stock: null, tool: null, toolKey: null });
  if (c5State.hid) { modelGroup.visible = true; ovl.visible = true; c5State.hid = false; }
}
// W (Z yukarı, iş sıfırı) → sahne (Y yukarı, modelin yeri): cam5.toWorld ile aynı
function c5Build(R) {
  c5Clear();
  const T = R.S.T, root = new THREE.Group();
  root.matrixAutoUpdate = false;
  root.matrix.set(1, 0, 0, -T[0], 0, 0, 1, -T[2], 0, -1, 0, T[1], 0, 0, 0, 1);
  const w = new THREE.Group(); w.matrixAutoUpdate = false; root.add(w);
  // parça
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(R.S.t, 3)); pg.computeVertexNormals();
  w.add(new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.2, roughness: 0.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide })));
  // bağlama
  const fm = new THREE.MeshStandardMaterial({ color: 0x7c3aed, transparent: true, opacity: 0.35 });
  for (const f of R.S.fix) {
    if (f.kind === 'box') { const g = new THREE.BoxGeometry(f.max[0] - f.min[0], f.max[1] - f.min[1], f.max[2] - f.min[2]); const m = new THREE.Mesh(g, fm); m.position.set((f.min[0] + f.max[0]) / 2, (f.min[1] + f.max[1]) / 2, (f.min[2] + f.max[2]) / 2); w.add(m); }
    else if (f.kind === 'cylX') { const g = new THREE.CylinderGeometry(f.r, f.r, f.x1 - f.x0, 40); g.rotateZ(Math.PI / 2); const m = new THREE.Mesh(g, fm); m.position.set((f.x0 + f.x1) / 2, 0, 0); w.add(m); }
    else if (f.kind === 'plane') { const sb = R.S.bounds, s = Math.max(sb.max[0] - sb.min[0], sb.max[1] - sb.min[1]) * 2 + 60; const g = new THREE.PlaneGeometry(s, s); const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x334155, transparent: true, opacity: 0.4, side: THREE.DoubleSide })); m.position.set(0, 0, f.z); w.add(m); }
  }
  // takım yolu: kesme yeşil, dalma mavi, hızlı kırmızı kesik, çarpışma / limit kırmızı kalın
  const cut = [], rap = [], bad = [], P = R.pts, n = R.kinds.length;
  for (let i = 1; i < n; i++) {
    const a = [P[i * 3 - 3], P[i * 3 - 2], P[i * 3 - 1]], b = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    (R.flags[i] ? bad : R.kinds[i] === 0 ? rap : cut).push(...a, ...b);
  }
  const lines = (arr, mat) => { if (!arr.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(arr), 3)); const l = new THREE.LineSegments(g, mat); if (mat.isLineDashedMaterial) l.computeLineDistances(); return l; };
  const path = new THREE.Group();
  for (const l of [lines(cut, new THREE.LineBasicMaterial({ color: 0x22c55e })), lines(rap, new THREE.LineDashedMaterial({ color: 0xef4444, dashSize: 2, gapSize: 2, transparent: true, opacity: 0.6 })), lines(bad, new THREE.LineBasicMaterial({ color: 0xff0000 }))]) if (l) path.add(l);
  w.add(path);
  // talaş sonucu: yüzey vokselleri
  const sp = R.sim.points, sk = R.sim.kinds, col = new Float32Array(sk.length * 3);
  const C3 = [[0.62, 0.65, 0.7], [0.98, 0.55, 0.15], [1, 0.1, 0.1]];
  for (let i = 0; i < sk.length; i++) col.set(C3[sk[i]], i * 3);
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const stock = new THREE.Points(sg, new THREE.PointsMaterial({ size: Math.max(R.sim.h * 1.4, 0.3), vertexColors: true }));
  w.add(stock);
  c5Group.add(root);
  Object.assign(c5State, { R, root, w, path, stock });
  modelGroup.visible = false; ovl.visible = false; c5State.hid = true;
}
function c5Tool(tl, spindle) {
  const g = new THREE.Group(), r = tl.d / 2, fl = tl.flute || tl.d * 3, so = Math.max(tl.stickout || fl + 10, fl), h = tl.holder || { d: 30, len: 60 }, sp = spindle || { d: 60, len: 100 };
  const seg = (a, b, rad, color, op = 1) => { const geo = new THREE.CylinderGeometry(rad, rad, b - a, 24); geo.translate(0, (a + b) / 2, 0); g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, transparent: op < 1, opacity: op }))); };
  seg(tl.type === 'ball' ? r : 0, fl, r, 0xf59e0b);
  if (tl.type === 'ball') { const s = new THREE.SphereGeometry(r, 20, 12); s.translate(0, r, 0); g.add(new THREE.Mesh(s, new THREE.MeshStandardMaterial({ color: 0xf59e0b }))); }
  seg(fl, so, r * 0.95, 0xcbd5e1); seg(so, so + h.len, h.d / 2, 0x64748b, 0.8); seg(so + h.len, so + h.len + sp.len, sp.d / 2, 0x1e293b, 0.5);
  return g;
}
// spec: { view: 'path' | 'stock' | 'machine', R, i, pose?, toolDef, spindle }
function c5Draw(spec) {
  if (c5State.R !== spec.R) c5Build(spec.R);
  const { w, path, stock, root } = c5State, R = spec.R;
  path.visible = spec.view !== 'stock'; stock.visible = spec.view === 'stock';
  // takım
  const key = spec.toolDef ? JSON.stringify(spec.toolDef) : null;
  if (c5State.toolKey !== key) { if (c5State.tool) { root.remove(c5State.tool); c5State.tool.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); } c5State.tool = spec.toolDef ? c5Tool(spec.toolDef, spec.spindle) : null; if (c5State.tool) root.add(c5State.tool); c5State.toolKey = key; }
  const i = Math.min(spec.i || 0, R.kinds.length - 1);
  let tip, axis;
  if (spec.view === 'machine' && spec.pose) {
    const p = spec.pose, m = new THREE.Matrix4();
    m.set(p.R[0][0], p.R[0][1], p.R[0][2], p.t[0], p.R[1][0], p.R[1][1], p.R[1][2], p.t[1], p.R[2][0], p.R[2][1], p.R[2][2], p.t[2], 0, 0, 0, 1);
    w.matrix.copy(m); tip = p.tip; axis = p.axis;
  } else { w.matrix.identity(); tip = [R.pts[i * 3], R.pts[i * 3 + 1], R.pts[i * 3 + 2]]; axis = [R.dirs[i * 3], R.dirs[i * 3 + 1], R.dirs[i * 3 + 2]]; }
  w.matrixWorldNeedsUpdate = true;
  if (c5State.tool) {
    c5State.tool.visible = spec.view !== 'stock';
    c5State.tool.position.set(...tip);
    c5State.tool.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...axis).normalize());
    c5State.tool.traverse((o) => { if (o.material && o.material.color && o.geometry && o.geometry.type !== 'SphereGeometry' && R.flags[i]) o.material.emissive = new THREE.Color(0x660000); else if (o.material && o.material.emissive) o.material.emissive.setHex(0); });
  }
}
var cam5UI = createCam5UI({   // var: yeniden çizim modül yüklenirken çağrılırsa henüz tanımsız olabilir
  model() { if (!lastClean) throw new Error('Model yok'); return { tris: geoTris(lastClean) }; },
  draw: c5Draw, clear: c5Clear, pose: machinePose,
  render: () => { if (tab === 'cam') renderPanel(); },
  toast, saveBlob,
  name: () => (projName || 'parca').replace(/[^\w\-]+/g, '_'),
  changed: () => scheduleSave(),
});

/* ---- 🔩 CNC torna (lathe.js + lathe-ui.js): CNC sekmesinde ayrı mod ---- */
const lzGroup = new THREE.Group(); scene.add(lzGroup);
const lzState = { hid: false };
var latheUI = createLatheUI({   // var: yeniden çizim modül yüklenirken çağrılırsa henüz tanımsız olabilir
  THREE, group: lzGroup,
  hideModel(on) { if (on) { modelGroup.visible = false; ovl.visible = false; lzState.hid = true; } else if (lzState.hid) { modelGroup.visible = true; ovl.visible = true; lzState.hid = false; } },
  fit: (box) => fit(box),
  render: () => { if (tab === 'cam') renderPanel(); },
  toast, saveBlob,
  name: () => (projName || 'torna'),
  parts: () => parts,
  occt: (op, args) => occtUI.call(op, args),
});

/* ---- 🧱 B-Rep (OCCT) ---- */
const occtGroup = new THREE.Group(); scene.add(occtGroup);
const occtState = { hid: false };
function occtClear() {
  occtGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  occtGroup.clear();
  if (occtState.hid) { modelGroup.visible = true; ovl.visible = true; occtState.hid = false; }
}
// OCCT ağını Three.js'te göster (model gizlenir; yüzler OCCT yüzlerine göre gruplu, kenarlar gerçek B-Rep kenarları)
function occtDraw(v) {
  occtClear();
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(v.positions, 3));
  if (v.normals && v.normals.length === v.positions.length) g.setAttribute('normal', new THREE.BufferAttribute(v.normals, 3)); else g.computeVertexNormals();
  g.setIndex(new THREE.BufferAttribute(v.index, 1));
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x5eead4, metalness: 0.15, roughness: 0.55, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }));
  occtGroup.add(mesh);
  if (v.lines && v.lines.length) {
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(v.lines, 3));
    occtGroup.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x0f172a })));
  }
  modelGroup.visible = false; ovl.visible = false; occtState.hid = true;
}
const OCCT_PRIM = { box: ['w', 'h', 'l', 'r', 'c', 'tp'], cylinder: ['d', 'h', 'r', 'c', 'tp'], sphere: ['d'], cone: ['d', 'd2', 'h', 'r', 'c'], tube: ['d', 'di', 'h', 'r', 'c'] };
// parça -> OCCT tanımı: temel katılar tam, OCCT'den gelenler B-Rep metniyle, diğerleri dünya koordinatında üçgen listesi
function occtDesc(p) {
  const place0 = { x: pos(p.x), y: pos(p.y), z: pos(p.z), rx: pos(p.rx), ry: pos(p.ry), rz: pos(p.rz) };
  const base = { name: partName(p, parts.indexOf(p)), op: parts.indexOf(p) > 0 && p.op === 'sub' ? 'sub' : 'add' };
  if (p.bk && meshStore.has(p.bk)) return { ...base, ...place0, type: 'brep', brep: meshStore.get(p.bk) };
  const f = OCCT_PRIM[p.type];
  if (f) { const d = { ...base, ...place0, type: p.type }; for (const k of f) d[k] = ['r', 'c', 'tp', 'di', 'd2'].includes(k) ? pos(p[k]) : clamp(p[k]); return d; }
  const g = place(baseGeo(p), p, partHeight(p));
  const t = geoTris(g); g.dispose();
  return { ...base, type: 'tris', pos: t };
}
var occtUI = createOcctUI({   // var: yeniden çizim sırasında çağrılırsa henüz tanımsız olabilir
  descs: () => parts.filter((q) => !q.hidden).map(occtDesc),
  parts: () => parts.filter((q) => !q.hidden).map((q) => ({ id: q.id, name: partName(q, parts.indexOf(q)), get desc() { return occtDesc(q); } })),
  selected: () => (hasSel() ? { id: cur().id, name: partName(cur(), parts.indexOf(cur())), get desc() { return occtDesc(cur()); } } : null),
  meshVolume: () => (lastClean ? Math.abs(signedVolume(geoTris(lastClean))) : null),
  draw: occtDraw,
  clear: occtClear,
  addPart(r, name, hideIds) {
    commit();
    const key = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    meshStore.set(key, packMesh(r.tris.pos, r.tris.nor));
    const m = { id: nextId++, type: 'mesh', op: 'add', ...DEFAULTS, x: r.x, y: r.y, z: r.z, h: r.h, mk: key, name };
    if (r.brep) { const bk = 'b' + key.slice(1); meshStore.set(bk, r.brep); m.bk = bk; }
    for (const q of parts) if (hideIds.includes(q.id)) q.hidden = true;
    parts.push(m); selOff = null; sel = m.id;
    refreshAll(true);
  },
  toast,
  render: () => { if (tab === 'occt') renderPanel(); },
  saveText: (text, name) => saveBlob(new Blob([text], { type: 'application/step' }), name),
  pickFile: (accept) => new Promise((res) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => res(inp.files && inp.files[0] ? inp.files[0] : null);
    inp.click();
  }),
  name: () => (projName || 'model').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_'),
});

// projedeki bütün profil iskeletlerinin kesim listesi → kesim optimizasyonu girdisi
const MAT_SHORT = { celik: 'Çelik', paslanmaz: 'Paslanmaz', aluminyum: 'Alüminyum', al6061: 'Alüminyum', pirinc: 'Pirinç', bakir: 'Bakır', titanyum: 'Titanyum' };
function cadCutPieces() {
  const frames = parts.filter((q) => q.type === 'frame');
  const out = [];
  frames.forEach((q) => {
    const c = frameCalc(q), m = partMat(q);
    const material = MAT_SHORT[m.id] || m.name;
    const who = frames.length > 1 ? partName(q, parts.indexOf(q)) + ' · ' : '';
    for (const g of c.cut) out.push({ profile: c.pr.name, material, t: c.pr.t, label: who + g.role + (g.cut !== '90°' ? ' (' + g.cut + ')' : ''), len: g.len, qty: g.qty });
  });
  return out;
}
function exportCutList(p) {
  const c = frameCalc(p);
  const f = (v) => fmtNum(v, 1).replace('.', ',');
  const rows = [['Profil', 'Eleman', 'Adet', 'Boy (mm, uzun kenar)', 'Kesim', 'Toplam (mm)'], ...c.cut.map((g) => [c.pr.name, g.role, g.qty, f(g.len), g.cut, f(g.len * g.qty)]),
    ['', 'Toplam', c.members.length, '', '', f(c.totalLen)], ['', 'Ağırlık (kg, çelik)', '', '', '', f(c.kg)]];
  saveBlob(new Blob([csvFromRows(rows)], { type: 'text/csv;charset=utf-8' }), fileBase() + '-kesim-listesi.csv');
  toast('Kesim listesi indirildi');
}
function exportFlatDXF(p) {
  const c = sheetCalc(p);
  if (!c.ok) { toast('Açınım hesaplanamadı: ' + c.err); return; }
  const fl = sheetFlatLines(c);
  const dxf = dxfFromLayers([
    { name: 'KONTUR', color: 7, linetype: 'CONTINUOUS', lines: fl.outline },
    { name: 'BUKUM', color: 1, linetype: 'CENTER', lines: fl.bendLines },
  ]);
  saveBlob(new Blob([dxf], { type: 'application/dxf' }), fileBase() + '-' + (p.name || 'sac').replace(/[^\w\-çğıöşüÇĞİÖŞÜ ]+/g, '_') + '-acinim.dxf');
  toast('Açınım DXF indirildi: ' + fmtNum(c.flatL, 2) + ' × ' + fmtNum(c.W, 2) + ' mm, ' + c.bends.length + ' büküm (kırmızı eksen çizgileri)');
}
function exportDXF() {
  if (!lastClean || !lastClean.boundingBox) { toast('Önce bir model olmalı'); return; }
  try {
    const bb = lastClean.boundingBox, size = bb.getSize(new THREE.Vector3()), bbo = bboxObj(bb);
    const gap = Math.max(20, Math.max(size.x, size.y, size.z) * 0.25);
    const boxes = { front: { x: 0, y: 0 }, side: { x: size.x + gap, y: 0 }, top: { x: 0, y: size.y + gap } };
    const bvh = makeBvh();
    const eps = Math.max(0.02, size.length() * 2e-4);
    const vis = [], hid = [], axis = [];
    let skipped = false;
    for (const name of ['front', 'side', 'top']) {
      const r = viewLines(bvh, name, bbo, boxes[name], 1, eps, 2);
      if (!r) { skipped = true; continue; }
      vis.push(...r.vis); hid.push(...r.hid);
      const want = name === 'front' ? 'z' : name === 'side' ? 'x' : 'y';
      for (const h of holeList(parts)) {
        if (h.axis !== want) continue;
        const [cx, cy] = sheetProject(name, h.c, bbo, boxes[name], 1);
        const hw = h.kind === 'round' ? h.d : h.ext[name === 'side' ? 2 : 0], hh = h.kind === 'round' ? h.d : h.ext[name === 'top' ? 2 : 1];
        axis.push([cx - hw / 2 - 3, cy, cx + hw / 2 + 3, cy], [cx, cy - hh / 2 - 3, cx, cy + hh / 2 + 3]);
      }
    }
    const flip = (ls) => ls.filter((l) => Math.hypot(l[2] - l[0], l[3] - l[1]) > 1e-3).map((l) => [l[0], -l[1], l[2], -l[3]]); // DXF'te Y yukarı
    const dxf = dxfFromLayers([
      { name: 'GORUNEN', color: 7, linetype: 'CONTINUOUS', lines: flip(vis) },
      { name: 'GIZLI', color: 1, linetype: 'HIDDEN', lines: flip(hid) },
      { name: 'EKSEN', color: 3, linetype: 'CENTER', lines: flip(axis) },
    ]);
    saveBlob(new Blob([dxf], { type: 'application/dxf' }), fileBase() + '.dxf');
    toast('DXF indirildi (mm)' + (skipped ? ' · bazı görünüşler çok ayrıntılı, atlandı' : ''));
  } catch (err) {
    toast('DXF oluşturulamadı');
  }
}

/* ---- tüm parçaları tek parçaya çevir ---- */
function bakeAll() {
  if (!lastClean || !lastClean.attributes.position.count) { toast('Önce bir model olmalı'); return; }
  if (parts.length === 1 && parts[0].type === 'mesh') { toast('Zaten tek parça'); return; }
  const g = lastClean, bb = g.boundingBox;
  const cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, my = (bb.min.y + bb.max.y) / 2;
  const P = g.attributes.position, N = g.attributes.normal, n = P.count;
  const pos3 = new Float32Array(n * 3), nor3 = N ? new Float32Array(n * 3) : null;
  for (let i = 0; i < n; i++) {
    pos3[i * 3] = P.getX(i) - cx; pos3[i * 3 + 1] = P.getY(i) - my; pos3[i * 3 + 2] = P.getZ(i) - cz;
    if (nor3) { nor3[i * 3] = N.getX(i); nor3[i * 3 + 1] = N.getY(i); nor3[i * 3 + 2] = N.getZ(i); }
  }
  const packed = packMesh(pos3, nor3);
  const vis = parts.filter((q) => !q.hidden);
  const colors = new Set(vis.map((q) => q.color || DEFAULT_COLOR));
  const dropped = parts.length - vis.length;
  commit();
  const key = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  meshStore.set(key, packed);
  const m = { id: nextId++, type: 'mesh', op: 'add', ...DEFAULTS, x: cx, y: bb.min.y, z: cz, h: Math.max(bb.max.y - bb.min.y, 0.001), mk: key, name: projName && projName !== 'model' ? projName : 'Tek parça' };
  if (vis[0] && vis[0].color) m.color = vis[0].color;
  parts = [m]; selOff = null; sel = m.id;
  tab = 'part';
  refreshAll();
  toast('Tek parça oldu' + (colors.size > 1 ? ' (tek renk)' : '') + (dropped ? ' · ' + dropped + ' gizli parça atıldı' : ''));
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
    if (!hasSel()) { /* seçim yokken parça sürüklenmez, sahne döner */ }
    else if (hit && hit.part.id === sel) startDrag(e, hit);
    else {
      // seçili parça başka bir parçanın içinde kalıp görünmeyebilir (kutu içinde kutu, oyuk); yine de üzerinden tutup sürüklenebilsin
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
  carry(p, () => {
    if (settings.drag !== 'up') {
      p.x = snap(drag.x0 + d.x, settings.snap);
      p.z = snap(drag.z0 + d.z, settings.snap);
    }
    if (settings.drag === 'wall' || settings.drag === 'up') p.y = snap(drag.y0 + d.y, settings.snap);
  });
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
  if (tab === 'link' && linkPick) { linkTap(cx, cy); return; }
  if (simUI.active) { simTap(cx, cy); return; }
  if (femUI.active && femUI.picking) { femTap(cx, cy); return; }
  if (asmUI.active) { asmTap(cx, cy); return; }
  const hit = pickAt(cx, cy);
  if (hit && (hit.part.id !== sel || !hasSel())) {
    selOff = null; sel = hit.part.id;
    renderPanel();
    refreshOverlays();
  } else if (!hit && hasSel() && document.elementFromPoint(cx, cy) === renderer.domElement) {
    // 3B görüntüde hiçbir parçaya denk gelmeyen boş noktaya dokunuldu: seçimi kaldır
    selOff = sel;
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
  selOff = null; sel = last.id;
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
      selOff = null; sel = p.id;
      clearFace();
      refreshAll();
      toast(op === 'sub' ? 'Kroki oyuk olarak açıldı' : 'Kroki çıkıntı olarak eklendi');
    },
    onCancel() {},
  });
}

/* ---- kenar seçimi: tek kenara pah / yuvarlama (düz kutu parçaları) ---- */
let edgeSels = []; // [{ id, axis, sa, sb }]  axis: serbest eksen; sa, sb: diğer iki eksenin işareti (-1/+1); birden çok kenar seçilebilir
const edgeKey = (e) => e.id + ':' + e.axis + ':' + e.sa + ':' + e.sb;
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

function drawEdgeSelection() {
  disposeOverlay(faceGroup);
  const pts = [];
  for (const e of edgeSels) {
    const p = parts.find((q) => q.id === e.id);
    if (!p) continue;
    const [e0, e1] = edgeEnds(p, e.axis, e.sa, e.sb).map((v) => toWorld(p, v));
    pts.push(e0, e1);
  }
  if (!pts.length) return;
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false, transparent: true }));
  line.userData.own = true; line.layers.set(1); line.renderOrder = 998;
  faceGroup.add(line);
  const dots = new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color: 0xf43f5e, size: 10, sizeAttenuation: false, depthTest: false, transparent: true }));
  dots.userData.own = true; dots.layers.set(1); dots.renderOrder = 999;
  faceGroup.add(dots);
}
// dokunulan kenar seçilir; aynı kenara tekrar dokunmak seçimi kaldırır (birden çok kenar seçilebilir)
function edgeTap(cx, cy) {
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
    const k = edgeKey(best);
    const i = edgeSels.findIndex((e) => edgeKey(e) === k);
    if (i >= 0) edgeSels.splice(i, 1); else edgeSels.push(best);
    drawEdgeSelection();
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
  return Object.assign(q, dims, { r: 0, c: 0, x: r4(piv.x), y: r4(piv.y), z: r4(piv.z), rx, ry, rz, name, aux: true, parent: p.id, joint: { type: 'fixed', axis: 'y', pv: [0, 0, 0], val: 0 } });
}

function edgeFeature(kind) {
  if (!edgeSels.length) return;
  const AX = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };
  const list = [];
  const label = kind === 'chamfer' ? 'Kenar pahı' : 'Kenar yuvarlama';
  let clipped = false, skipped = 0;
  const prep = [];
  for (const es of edgeSels) {
    const p = parts.find((q) => q.id === es.id);
    if (!p) { skipped++; continue; }
    const { axis, sa, sb } = es;
    const w = clamp(p.w), l = clamp(p.l), h = clamp(p.h);
    const len = { x: w, y: h, z: l }[axis];
    const perp = EDGE_AXES[axis];
    const maxSz = Math.min(...perp.map((a) => ({ x: w, y: h, z: l }[a]))) / 2 - 0.05;
    if (!(maxSz > 0.1)) { skipped++; continue; }
    const sz = Math.min(Math.max(cp.es, 0.1), maxSz);
    if (cp.es > maxSz) clipped = true;
    prep.push({ p, axis, sa, sb, len, perp, sz });
  }
  if (!prep.length) { toast('Seçili kenarlar için kutu çok ince'); return; }
  commit();
  for (const { p, axis, sa, sb, len, perp, sz } of prep) {
    const [e0, e1] = edgeEnds(p, axis, sa, sb);
    const edgeC = e0.clone().add(e1).multiplyScalar(0.5);           // kenar ortası
    const sgn = { [perp[0]]: sa, [perp[1]]: sb };
    // kesici boyutlarını kendi (w,h,l) eksenlerine yaz
    const dimsFor = (freeLen, sq1, sq2) => {
      const o = { x: 0, y: 0, z: 0 };
      o[axis] = freeLen; o[perp[0]] = sq1; o[perp[1]] = sq2;
      return { w: o.x, h: o.y, l: o.z };
    };
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
  }
  for (const q of list) parts.push(q);
  selOff = null; sel = list[0].id;
  edgeSels = [];
  disposeOverlay(faceGroup);
  refreshAll();
  toast((kind === 'chamfer' ? 'Pah kırıldı' : 'Yuvarlandı') + ': ' + prep.length + ' kenar' + (clipped ? ' (ölçü kutuya göre kısıldı)' : '') + (skipped ? ', ' + skipped + ' kenar atlandı' : ''));
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
  selOff = null; sel = cut.id;
  refreshAll();
  toast('Kabuk yapıldı. Not: iç boşluk, sonraki parçalarla çakışmaz; ondan önceki parçaları da keser.');
}

/* ---- bağlantılar ve hareket: üst parça taşınınca alt parçalar gelir; menteşe / kayar eklem ---- */
const POSE_KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz'];
let linkPick = false;
const r4m = (v) => Math.round(v * 1e4) / 1e4 + 0;
const poseM = (p) => new THREE.Matrix4().compose(new THREE.Vector3(pos(p.x), pos(p.y), pos(p.z)), partQuat(p), new THREE.Vector3(1, 1, 1));
function setPoseM(p, M) {
  const v = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  M.decompose(v, q, sc);
  p.x = r4m(v.x); p.y = r4m(v.y); p.z = r4m(v.z);
  [p.rx, p.ry, p.rz] = quatToEulerXYZ([q.x, q.y, q.z, q.w]);
}
const applyWorldDelta = (list, D) => { for (const c of list) setPoseM(c, D.clone().multiply(poseM(c))); };
// p'nin duruşunu mutate() ile değiştir; bütün alt parçalar aynı katı hareketle onunla gelsin
function carry(p, mutate) {
  const kids = descendantsOf(parts, p.id);
  if (!kids.length) { mutate(); return; }
  const before = poseM(p);
  mutate();
  applyWorldDelta(kids, poseM(p).multiply(before.invert()));
}
const AXV = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
// eklemin dünyadaki ekseni ve eksen noktası (üst parçanın çerçevesinde saklanır, üstle birlikte hareket eder)
function jointInfo(c) {
  const par = c.joint && parts.find((q) => q.id === c.parent);
  if (!par) return null;
  const axis = new THREE.Vector3(...AXV[c.joint.axis || 'y']).applyQuaternion(partQuat(par)).normalize();
  const pivot = new THREE.Vector3(...(c.joint.pv || [0, 0, 0])).applyMatrix4(poseM(par));
  return { par, axis, pivot };
}
// eklem değeri + bağıntılarla bağlı eklemler (dişli, kayış, kremayer, vida)
function setJointVal(c, nv) {
  if (!c.joint) return;
  const d = nv - (c.joint.val || 0);
  if (!d) return;
  const cs = mechData.cs.filter((x) => couplingValid(x));
  if (!cs.length) { setJointValRaw(c, nv); return; }
  const { deltas } = mechPropagate(cs, c.id, d);
  for (const [id, dd] of deltas) { const q = id === c.id ? c : parts.find((x) => x.id === id); if (q && q.joint) setJointValRaw(q, (q.joint.val || 0) + dd); }
}
function setJointValRaw(c, nv) {
  const ji = jointInfo(c);
  if (!ji || !c.joint) return;
  const d = nv - (c.joint.val || 0);
  if (!d) return;
  let D;
  if (c.joint.type === 'hinge') {
    D = new THREE.Matrix4().makeTranslation(ji.pivot.x, ji.pivot.y, ji.pivot.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(ji.axis, d * RAD))
      .multiply(new THREE.Matrix4().makeTranslation(-ji.pivot.x, -ji.pivot.y, -ji.pivot.z));
  } else if (c.joint.type === 'slide') {
    D = new THREE.Matrix4().makeTranslation(ji.axis.x * d, ji.axis.y * d, ji.axis.z * d);
  } else return;
  applyWorldDelta([c, ...descendantsOf(parts, c.id)], D);
  c.joint.val = nv;
}
function drawJointAxis() {
  disposeOverlay(faceGroup);
  const c = cur();
  if (!c.joint || c.joint.type === 'fixed') return;
  const ji = jointInfo(c);
  if (!ji) return;
  const L = Math.max(40, lastClean && lastClean.boundingBox ? lastClean.boundingBox.getSize(new THREE.Vector3()).length() * 0.6 : 80);
  const a = ji.pivot.clone().addScaledVector(ji.axis, -L / 2), b = ji.pivot.clone().addScaledVector(ji.axis, L / 2);
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([a, b]), new THREE.LineBasicMaterial({ color: 0xfacc15, depthTest: false, transparent: true }));
  line.userData.own = true; line.layers.set(1); line.renderOrder = 998;
  faceGroup.add(line);
  const dot = new THREE.Points(new THREE.BufferGeometry().setFromPoints([ji.pivot]), new THREE.PointsMaterial({ color: 0xf43f5e, size: 12, sizeAttenuation: false, depthTest: false, transparent: true }));
  dot.userData.own = true; dot.layers.set(1); dot.renderOrder = 999;
  faceGroup.add(dot);
}
function setParent(c, pid) {
  if (pid == null) { if (c.parent == null) return; commit(); delete c.parent; delete c.joint; refreshAll(); return; }
  const par = parts.find((q) => q.id === pid);
  if (!par) return;
  if (wouldCycle(parts, c.id, pid)) { toast('Bir parça kendi altındaki parçaya bağlanamaz.'); renderPanel(); return; }
  commit();
  const inv = poseM(par).invert();
  const pv = new THREE.Vector3(pos(c.x), pos(c.y), pos(c.z)).applyMatrix4(inv);
  c.parent = pid;
  c.joint = { type: 'fixed', axis: 'y', pv: [r4m(pv.x), r4m(pv.y), r4m(pv.z)], val: 0 };
  refreshAll();
  toast('Bağlandı: üst parça hareket edince bu parça da gelir.');
}
function linkAct(act) {
  const c = cur();
  if (act === 'j-unlink') { setParent(c, null); return; }
  if (!c.joint) return;
  if (act === 'jreset') { commit(); setJointVal(c, 0); refreshAll(); return; }
  if (act === 'jpick') { linkPick = !linkPick; renderPanel(); if (linkPick) toast('Menteşe / eksen noktası olacak yere modelde dokun.'); return; }
  commit();
  if (act.startsWith('jt-')) c.joint.type = act.slice(3);
  else c.joint.axis = act.slice(3);
  c.joint.val = 0; // yeni eklem: şu anki duruş başlangıç sayılır
  renderPanel();
  scheduleSave();
}
function linkTap(cx, cy) {
  const c = cur();
  const ji = jointInfo(c);
  setRay(cx, cy);
  const hits = modelMesh ? raycaster.intersectObject(modelMesh, false) : [];
  if (!ji || !hits.length) { toast('Modelin üzerine dokun.'); return; }
  commit();
  const pv = hits[0].point.clone().applyMatrix4(poseM(ji.par).invert());
  c.joint.pv = [r4m(pv.x), r4m(pv.y), r4m(pv.z)];
  c.joint.val = 0;
  linkPick = false;
  renderPanel();
  scheduleSave();
  toast('Eksen noktası belirlendi.');
}
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.wf) { weldUI.input(el, 'change'); return; }
  if (el.dataset && el.dataset.wg) { weightUI.input(el, 'change'); return; }
  if (el.dataset && el.dataset.cf) { costUI.input(el, 'change'); return; }
  if (el.dataset && el.dataset.as) { asmUI.input(el, 'change'); return; }
  if (el.dataset && (el.dataset.cs || el.dataset.cn || el.dataset.ct || el.dataset.co)) { camUI.input(el, 'change'); return; }
  if (el.dataset && el.dataset.oc) { occtUI.input(el); return; }
  if (el.dataset && el.dataset.c5) { cam5UI.input(el, 'change'); return; }
  if (el.dataset && el.dataset.lz) { latheUI.input(el, 'change'); return; }
  if (el.dataset && el.dataset.fm && el.dataset.fm !== 'frame' && !el.dataset.fm.startsWith('me.')) { femUI.input(el); return; }
  if (el.dataset && (el.dataset.sm || el.dataset.sf || el.dataset.sp || el.dataset.sv || el.dataset.st || el.dataset.sl2)) { simUI.input(el, 'change'); return; }
  if (el.dataset && el.dataset.link === 'parent') setParent(cur(), el.value === '' ? null : Number(el.value));
});

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
/* ---- dayanım: malzeme, büküm sınırı, yük testi ---- */
cp.lkg = 100; cp.bsup = 'simple'; cp.bload = 'point'; cp.bax = 'x';
const partMat = (p) => matById(p.mat || settings.mat || 'celik');
// büküm sınırı uyarıları (metin listesi)
function bendWarnings(p) {
  const m = partMat(p), out = [], f = (v) => fmtNum(v, 1);
  if (p.type === 'sheet' && !p.flat) {
    const c = sheetCalc(p), r = minBendRadius(m, c.T);
    if (c.bends.length && c.R < r.R - 1e-6) {
      out.push(m.name + ' ' + f(c.T) + ' mm sac en az ' + f(r.R) + ' mm iç yarıçapla bükülür (şu an ' + f(c.R) + ' mm): dış yüzde çatlar' + (m.kind === 'wood' ? '. Buharla ve bantla bükmede en az ~' + f(r.steam) + ' mm' : '') + '.');
    }
    if (m.kind === 'wood' && c.bends.length) out.push('Ahşap sac gibi keskin bükülmez; bu parça ancak buharla / laminasyonla (ince katmanlar yapıştırılarak) yapılabilir.');
    const minFl = 2.5 * c.T + c.R;
    (p.seg || []).forEach((sg, i) => { if (p.seg.length > 1 && (Number(sg.L) || 0) < minFl - 1e-6) out.push((i + 1) + '. kenar ' + f(sg.L) + ' mm: abkantta tutmaz, en az ~' + f(minFl) + ' mm olmalı.'); });
  }
  if (p.type === 'sweep' && p.path !== 'poly') {
    const D = p.prof === 'rect' ? Math.max(Number(p.w) || 0, Number(p.l) || 0) : Number(p.d) || 0;
    const R = p.path === 'helix' ? Number(p.hr) || 0 : Number(p.br) || 0;
    const r = minTubeCLR(m, D);
    if (D > 0 && R < r.R - 1e-6) out.push(m.name + ' Ø' + f(D) + ' ' + (p.prof === 'tube' ? 'boru' : 'çubuk') + ' en az ' + f(r.R) + ' mm eğri yarıçapıyla bükülür (şu an ' + f(R) + ')' + (r.mandrel ? '; mandrelli büküm makinesiyle ~' + f(r.mandrel) + ' mm' : '') + (r.steam ? '; buharla ~' + f(r.steam) + ' mm' : '') + '. Daha dar bükersen ' + (m.kind === 'wood' ? 'kırılır' : 'ezilir / çatlar') + '.');
  }
  if (p.type === 'sweep' && p.path === 'poly') {
    const D = Number(p.d) || Number(p.w) || 0, r = minTubeCLR(m, D);
    if (D > 0 && (Number(p.br) || 0) < r.R - 1e-6) out.push('Köşe yarıçapı ' + f(p.br) + ' mm, ' + m.name + ' için en az ' + f(r.R) + ' mm olmalı.');
  }
  return out;
}
function strengthPanel(p) {
  const m = partMat(p), f = (v, d = 1) => fmtNum(v, d);
  let h = `<label class="f w2" style="flex:1 0 100%"><span>Bu parçanın malzemesi</span><select data-pmat="1">${MATERIALS.map((x) => `<option value="${x.id}"${x.id === m.id ? ' selected' : ''}>${x.name}</option>`).join('')}</select></label>` +
    `<div class="lbl" style="flex:1 0 100%">E = ${f(m.E)} GPa · ${m.kind === 'wood' ? 'eğilme dayanımı' : 'akma dayanımı'} ${f(m.sy, 0)} MPa${m.A ? ' · uzama %' + m.A : ''}</div>`;
  // büküm
  const bw = bendWarnings(p);
  if (p.type === 'sheet' || p.type === 'sweep') {
    h += '<div class="lbl h">Bükme sınırı</div>';
    if (p.type === 'sheet') { const c = sheetCalc(p), r = minBendRadius(m, c.T); h += `<div class="lbl" style="flex:1 0 100%">En küçük güvenli iç büküm yarıçapı: <b>${f(r.R)} mm</b> (${f(r.ratio)} × kalınlık)${r.steam ? ' · buharla ~' + f(r.steam) + ' mm' : ''}</div>`; }
    h += bw.length ? bw.map((w) => `<div class="lbl" style="flex:1 0 100%;color:#f87171;font-size:13px">⛔ ${w}</div>`).join('') : '<div class="lbl" style="flex:1 0 100%;color:#4ade80;font-size:13px">✅ Bükümler bu malzeme için güvenli.</div>';
  }
  // yük testi
  const res = (title, r, extra = '') => {
    const j = judge(r.sf, r.ratio), col = j.level === 'ok' ? '#4ade80' : j.level === 'warn' ? '#facc15' : '#f87171';
    return `<div style="flex:1 0 100%;border:1px solid ${col};border-radius:8px;padding:6px 8px;margin-top:4px;font-size:13px">` +
      `<b>${title}</b> — <span style="color:${col}">${j.level === 'ok' ? '✅' : j.level === 'warn' ? '⚠' : '⛔'} ${j.text}</span><br>` +
      `Gerilme ${f(r.sigma)} MPa · güvenlik katsayısı <b>${isFinite(r.sf) ? f(r.sf, 2) : '∞'}</b> · esneme (sehim) <b>${f(r.delta, 2)} mm</b><br>` +
      `Taşıyabileceği en fazla yük (2 kat güvenlikle): <b>${f(r.Fmax / 9.81, 0)} kg</b>${extra}</div>`;
  };
  const F = Math.max(Number(cp.lkg) || 0, 0) * 9.81;
  if (p.type === 'frame') {
    const c = frameCalc(p), Fm = frameMembers(p), pr = c.pr;
    const sec = pr.kind === 'round' ? { kind: 'round', d: pr.w, t: pr.t } : { kind: 'rect', b: pr.h, h: pr.w, t: pr.t };
    const span = Math.max(...Fm.members.filter((x) => x.role !== 'Dikme').map((x) => Math.hypot(x.b[0] - x.a[0], x.b[1] - x.a[1], x.b[2] - x.a[2])), 1);
    h += '<div class="lbl h">Yük testi</div>' + cfield('Üstteki toplam yük (kg)', 'lkg', 'deg');
    const rr = beamCheck(span, sec, m, F / 2, 'simple', 'udl');
    h += res('En uzun kuşak (' + lenText(span) + ', yükün yarısı yayılı)', rr);
    const legs = Fm.members.filter((x) => x.role === 'Dikme'), legL = legs.length ? Math.hypot(legs[0].b[1] - legs[0].a[1], 0) : 0;
    if (legs.length) {
      const Pcr = eulerBuckling(legL, sec, m, 1), per = F / legs.length, A = (sec.kind === 'round' ? Math.PI * (sec.d ** 2 - Math.max(sec.d - 2 * sec.t, 0) ** 2) / 4 : sec.b * sec.h - Math.max(sec.b - 2 * sec.t, 0) * Math.max(sec.h - 2 * sec.t, 0));
      const sfB = per > 0 ? Pcr / per : Infinity, sfC = per > 0 ? m.sy * A / per : Infinity, sfL = Math.min(sfB, sfC);
      const col = sfL >= 3 ? '#4ade80' : sfL >= 1.5 ? '#facc15' : '#f87171';
      h += `<div style="flex:1 0 100%;border:1px solid ${col};border-radius:8px;padding:6px 8px;margin-top:4px;font-size:13px"><b>Dikmeler (${legs.length} adet, ${lenText(legL)})</b> — burkulma güvenliği <b style="color:${col}">${isFinite(sfL) ? f(sfL, 1) : '∞'}</b> · en fazla yaklaşık <b>${f(Math.min(Pcr, m.sy * A) * legs.length / 3 / 9.81, 0)} kg</b> (3 kat güvenlikle)</div>`;
    }
    return h;
  }
  let sec = null, L = 0, label = '';
  const ax = cp.bax;
  if (p.type === 'box') {
    const w = Number(p.w) || 0, l = Number(p.l) || 0, hh = Number(p.h) || 0;
    if (ax === 'x') { L = w; sec = { kind: 'rect', b: l, h: hh }; } else if (ax === 'z') { L = l; sec = { kind: 'rect', b: w, h: hh }; } else { L = hh; sec = { kind: 'rect', b: w, h: l }; }
    label = 'Kutu / plaka / kiriş';
  } else if (p.type === 'cylinder' || p.type === 'tube') {
    L = Number(p.h) || 0; const d = Number(p.d) || 0;
    sec = { kind: 'round', d, t: p.type === 'tube' ? Math.max((d - (Number(p.di) || 0)) / 2, 0.01) : 0 };
    label = p.type === 'tube' ? 'Boru (boyu boyunca kiriş)' : 'Mil / çubuk (boyu boyunca kiriş)';
  } else if (p.type === 'sheet' && p.flat) {
    const c = sheetCalc(p); L = c.flatL; sec = { kind: 'rect', b: c.W, h: c.T }; label = 'Düz sac';
  }
  if (!sec) {
    if (p.type !== 'sheet' && p.type !== 'sweep') h += '<div class="lbl" style="flex:1 0 100%">Yük testi kutu, silindir, boru, konstrüksiyon ve düz sac parçalarında yapılır.</div>';
    return h;
  }
  h += '<div class="lbl h">Yük testi — ' + label + '</div>';
  if (p.type === 'box') h += btn('Uzunluk X yönünde', 'sp-bax-x', ax === 'x') + btn('Z yönünde', 'sp-bax-z', ax === 'z') + btn('Y yönünde', 'sp-bax-y', ax === 'y');
  h += btn('İki ucundan dayalı', 'sp-bsup-simple', cp.bsup === 'simple') + btn('Tek ucundan sabit (konsol)', 'sp-bsup-cant', cp.bsup === 'cant') +
    btn(cp.bsup === 'cant' ? 'Yük uçta' : 'Yük ortada', 'sp-bload-point', cp.bload === 'point') + btn('Yük yayılı', 'sp-bload-udl', cp.bload === 'udl') + cfield('Yük (kg)', 'lkg', 'deg');
  if (L > 0 && sec) h += res('Açıklık ' + lenText(L), beamCheck(L, sec, m, F, cp.bsup, cp.bload));
  return h;
}

/* ---- hareket etüdü (animasyon) ---- */
const anim = { playing: false, t0: 0, mode: 'pp', cfg: {}, rec: null, startVals: null };
cp.adur = 3;
// sürülebilen değerler: eklem açısı / kayması, mesafe ve açı eşleşmeleri
function animDrivers() {
  const out = [];
  parts.forEach((c, i) => {
    if (c.joint && (c.joint.type === 'hinge' || c.joint.type === 'slide') && !mechData.cs.some((x) => x.b === c.id && couplingValid(x))) {
      const h = c.joint.type === 'hinge';
      out.push({ key: 'j' + c.id, label: partName(c, i) + (h ? ' · menteşe' : ' · kayar'), unit: h ? '°' : settings.unit, cur: c.joint.val || 0, def: h ? 90 : 50,
        get: () => c.joint.val || 0, set: (v) => setJointVal(c, v) });
    }
    (c.mates || []).forEach((m, k) => {
      if (m.t !== 'dist' && m.t !== 'ang') return;
      const B = parts.find((x) => x.id === m.b);
      out.push({ key: 'm' + c.id + '_' + k, label: partName(c, i) + ' → ' + (B ? partName(B, parts.indexOf(B)) : '?') + (m.t === 'ang' ? ' · açı' : ' · mesafe'), unit: m.t === 'ang' ? '°' : settings.unit,
        cur: pos(m.v), def: m.t === 'ang' ? Math.min(pos(m.v) + 90, 180) : pos(m.v) + 50, get: () => pos(m.v), set: (v) => { m.v = v; } });
    });
  });
  return out;
}
const ease = (x) => x * x * (3 - 2 * x);
function animApply(f) {
  for (const d of animDrivers()) {
    const st = anim.cfg[d.key];
    if (!st || !st.on) continue;
    d.set(st.from + (st.to - st.from) * ease(Math.min(Math.max(f, 0), 1)));
  }
  rebuild(false);
}
function animTick(now) {
  if (anim.motor) {
    if (!anim.t0) anim.t0 = now;
    const t = (now - anim.t0) / 1000, M = anim.motor, c = parts.find((x) => x.id === M.id);
    if (!c || !c.joint) { animStop(false); return; }
    setJointVal(c, M.start + M.rate * t); rebuild(false); drawMechOverlay();
    if (anim.rec && t >= M.recT) animStop(true);
    return;
  }
  const dur = Math.max(pos(cp.adur), 0.2) * 1000;
  if (!anim.t0) anim.t0 = now;
  let u = (now - anim.t0) / dur, f, done = false;
  if (anim.mode === 'once') { f = Math.min(u, 1); done = u >= 1; }
  else if (anim.mode === 'pp') { const k = u % 2; f = k <= 1 ? k : 2 - k; if (anim.rec && u >= 2) { f = 0; done = true; } }
  else { f = u % 1; if (anim.rec && u >= 1) { f = 1; done = true; } }
  animApply(f);
  if (done) animStop(true);
}
function animStart(record, motor) {
  anim.motor = null;
  if (motor) {
    const M = mechData.motor, c = M && parts.find((x) => x.id === M.id);
    if (!c || !c.joint || c.joint.type !== 'hinge' || !(Math.abs(M.rpm) > 0)) { toast('Motor için döner (menteşe) eklem ve devir seç'); return; }
    const rate = rpmToDegPerSec(M.rpm);
    // çok hızlı motor ekranda görünmez: görüntü 1 tur ≥ 2 sn olacak şekilde yavaşlatılır (oranlar korunur)
    const shown = Math.sign(rate) * Math.min(Math.abs(rate), 180);
    anim.motor = { id: c.id, start: c.joint.val || 0, rate: shown, recT: 360 / Math.abs(shown), slowed: Math.abs(rate) > 180 };
  } else {
    const ds = animDrivers().filter((d) => anim.cfg[d.key] && anim.cfg[d.key].on);
    if (!ds.length) { toast('Seçili hareket yok'); return; }
  }
  commit();               // oynatmadan önceki durum geri al ile gelir
  anim.playing = true; anim.t0 = 0;
  if (record) {
    let stream = null, mr = null;
    try {
      stream = renderer.domElement.captureStream(30);
      const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
      const type = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
      mr = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8e6 } : undefined);
    } catch (e) { toast('Bu tarayıcı video kaydını desteklemiyor'); anim.playing = false; return; }
    const chunks = [];
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      const type = mr.mimeType || 'video/webm';
      saveBlob(new Blob(chunks, { type }), fileBase() + '-hareket.' + (type.includes('mp4') ? 'mp4' : 'webm'));
      toast('Video indirildi');
      stream.getTracks().forEach((t) => t.stop());
    };
    mr.start();
    anim.rec = mr;
  }
  renderPanel();
}
function animStop(finished) {
  anim.playing = false; anim.motor = null;
  if (anim.rec) { const r = anim.rec; anim.rec = null; setTimeout(() => { try { r.stop(); } catch (e) { /* */ } }, 150); }
  syncInputs(); scheduleSave(); updateToolbar();
  if (tab === 'anim') renderPanel();
  if (finished) toast('Hareket bitti');
}
function animAct(act) {
  if (act === 'an-play') { animStart(false); return; }
  if (act === 'an-motor') { animStart(false, true); return; }
  if (act === 'an-motor-rec') { if (!anim.rec) { if (anim.playing) animStop(false); animStart(true, true); } return; }
  if (act === 'an-rec') { if (!anim.rec) { if (anim.playing) animStop(false); animStart(true); } return; }
  if (act === 'an-stop') { animStop(false); return; }
  if (act === 'an-reset') { if (anim.playing) animStop(false); commit(); animApply(0); renderPanel(); return; }
  if (act.startsWith('an-m-')) { anim.mode = act.slice(5); renderPanel(); return; }
  if (act.startsWith('an-tog-')) { const st = anim.cfg[act.slice(7)]; if (st) st.on = !st.on; renderPanel(); return; }
}

/* ---- ⚙ Mekanizma: dişli çark, bağıntılar, motor, hareket çarpışma kontrolü ---- */
const r4g = (n) => Math.round(n * 1e4) / 1e4 + 0;
function regenGear(p) {
  p.gm = Math.max(0.2, Number(p.gm) || 2); p.gz = Math.max(6, Math.min(400, Math.round(Number(p.gz) || 20))); p.gb = Math.max(0, Number(p.gb) || 0);
  const d = gearDims(p.gm, p.gz);
  if (p.gb >= 2 * d.rf * 0.95) p.gb = r4g(d.rf * 1.4);
  p.pts = gearOutline(p.gm, p.gz).map(([x, y]) => [r4g(x), r4g(y)]);
  p.more = p.gb > 0 ? [circlePts(0, 0, p.gb / 2, 48).map(([x, y]) => [r4g(x), r4g(y)])] : [];
  p.name = 'Dişli m' + fmtNum(p.gm, 2) + ' z' + p.gz;
}
function addGear(base) {
  commit();
  const p = Object.assign(newPart(nextId++, 'box', 'add', null), { type: 'sketch', mode: 'extrude', plane: 'top', h: 10, x: 0, y: 0, z: 0, gear: true, gm: 2, gz: 20, gb: 10 }, base || {});
  regenGear(p);
  parts.push(p); selOff = null; sel = p.id; refreshAll(true);
  toast('Dişli eklendi: modül ve diş sayısı Ölçü sekmesinden değişir');
  return p;
}
function gearInfo(p) {
  const d = gearDims(p.gm, p.gz);
  return `<div class="lbl" style="flex:1 0 100%;line-height:1.5">Bölüm dairesi Ø${fmtNum(d.dp, 2)} · dış çap Ø${fmtNum(d.da, 2)} · diş dibi Ø${fmtNum(d.df, 2)} · adım ${fmtNum(d.pitch, 2)} mm · basınç açısı 20° (evolvent). İki dişli arası eksen mesafesi = m·(z₁+z₂)/2.</div>` +
    `<label class="f"><span>Eş dişlinin diş sayısı</span><input type="number" step="1" min="6" data-mc="pairz" value="${mechForm.pairz || p.gz * 2}"></label>` +
    `<button data-act="mc-gearpair">⚙ Eş dişliyi ekle (doğru mesafede, dişler kavraşır)</button>` +
    (p.gz < 17 ? '<div class="lbl" style="flex:1 0 100%;color:#fbbf24">⚠ 17\'den az dişte gerçek imalatta diş dibi oyulması (alttan kesilme) olur; profil düzeltmesi gerekir.</div>' : '');
}
const mechForm = { t: 'gear', a: '', b: '', z1: '', z2: '', d1: '', d2: '', m: '', p: '', n: 1, k: 1, rev: false, pairz: '' };
const jointParts = () => parts.filter((q) => q.joint && (q.joint.type === 'hinge' || q.joint.type === 'slide'));
function addGearPair() {
  const g = cur();
  if (!g.gear) return;
  const z2 = Math.max(6, Math.round(Number(mechForm.pairz) || g.gz * 2)), a = centerDistance(g.gm, g.gz, z2);
  const ry = (g.ry || 0) * RAD, dir = new THREE.Vector3(Math.cos(-ry), 0, Math.sin(-ry));
  // eş dişli: g'nin yerel +X yönünde; kavrama için çift diş sayısında yarım diş döndürülür
  const half = z2 % 2 === 0 ? 180 / z2 : 0;
  commit();
  const q = Object.assign(newPart(nextId++, 'box', 'add', null), { type: 'sketch', mode: 'extrude', plane: 'top', h: g.h, x: r4g(g.x + dir.x * a), y: g.y, z: r4g(g.z + dir.z * a), rx: g.rx || 0, ry: r4g((g.ry || 0) + half), rz: g.rz || 0, gear: true, gm: g.gm, gz: z2, gb: g.gb, mat: g.mat });
  regenGear(q); parts.push(q);
  let linked = false;
  if (g.parent != null && g.joint && g.joint.type === 'hinge') {
    const par = parts.find((x) => x.id === g.parent);
    if (par) {
      const pv = new THREE.Vector3(pos(q.x), pos(q.y), pos(q.z)).applyMatrix4(poseM(par).invert());
      q.parent = par.id; q.joint = { type: 'hinge', axis: g.joint.axis, pv: [r4g(pv.x), r4g(pv.y), r4g(pv.z)], val: 0 };
      mechData.cs.push({ id: Date.now(), t: 'gear', a: g.id, b: q.id, z1: g.gz, z2: z2 }); linked = true;
    }
  }
  selOff = null; sel = q.id; refreshAll(true);
  toast(linked ? 'Eş dişli eklendi ve dişli bağıntısı kuruldu: birini döndür, öteki kavrar' : 'Eş dişli eklendi (eksen mesafesi ' + fmtNum(a, 2) + ' mm). Döndürmek için ikisini de Bağ sekmesinde bir gövdeye menteşeyle bağla, sonra Hareket → Mekanizma\'dan dişli bağıntısı ekle.');
}
function mechPanel() {
  const J = jointParts(), nm = (id) => { const q = parts.find((x) => x.id === id); return q ? partName(q, parts.indexOf(q)) : '?'; };
  const typ = (q) => (q.joint.type === 'hinge' ? 'döner' : 'kayar');
  let h = '<div class="lbl h">⚙ Mekanizma: bağıntılar</div>';
  if (J.length < 2) return h + '<div class="lbl" style="flex:1 0 100%">Bağıntı için en az iki eklem gerekir (Bağ sekmesinde menteşe / kayar). Dişli için şekil çubuğundaki <b>⚙ Dişli</b> ile dişli ekle, Ölçü sekmesinde "Eş dişliyi ekle".</div>';
  for (const [i, c] of mechData.cs.entries()) {
    const k = couplingK(c), A = parts.find((x) => x.id === c.a), B = parts.find((x) => x.id === c.b);
    const unitA = A && A.joint && A.joint.type === 'slide' ? 'mm' : '°', unitB = B && B.joint && B.joint.type === 'slide' ? 'mm' : '°';
    h += `<div style="flex:1 0 100%;display:flex;gap:6px;align-items:center;background:#111a2e;border:1px solid #1e293b;border-radius:10px;padding:7px 9px;font-size:13.5px"><span style="flex:1"><b>${esc(COUPLINGS[c.t].name)}</b>: ${esc(nm(c.a))} → ${esc(nm(c.b))}<br><span style="color:#94a3b8">1 ${unitA} → ${fmtNum(k, 4)} ${unitB}${c.t === 'gear' || c.t === 'igear' ? ' · z ' + c.z1 + ' / ' + c.z2 : ''}${!A || !B ? ' · ⚠ eklem yok' : ''}</span></span><button data-act="mc-del-${i}" class="danger" style="flex:0 0 auto;padding:8px 10px">Sil</button></div>`;
  }
  const F = mechForm, opts = (sel2, filt) => '<option value="">— seç —</option>' + J.filter(filt).map((q) => `<option value="${q.id}"${String(sel2) === String(q.id) ? ' selected' : ''}>${esc(partName(q, parts.indexOf(q)))} (${typ(q)})</option>`).join('');
  const T = COUPLINGS[F.t], fromOK = (q) => T.from === 'any' || q.joint.type === T.from, toOK = (q) => T.to === 'any' || q.joint.type === T.to;
  h += `<label class="f w2" style="flex:1 0 100%"><span>Yeni bağıntı türü</span><select data-mc="t">${Object.entries(COUPLINGS).map(([k, v]) => `<option value="${k}"${F.t === k ? ' selected' : ''}>${v.name}</option>`).join('')}</select></label>`;
  h += `<label class="f"><span>Sürücü (1)</span><select data-mc="a">${opts(F.a, fromOK)}</select></label><label class="f"><span>Sürülen (2)</span><select data-mc="b">${opts(F.b, toOK)}</select></label>`;
  const nf = (k, l, st = 'any') => `<label class="f"><span>${l}</span><input type="number" step="${st}" data-mc="${k}" value="${F[k] ?? ''}"></label>`;
  if (F.t === 'gear' || F.t === 'igear') h += nf('z1', 'z₁ (sürücü diş)', 1) + nf('z2', 'z₂ (sürülen diş)', 1);
  if (F.t === 'belt') h += nf('d1', 'd₁ sürücü kasnak çapı') + nf('d2', 'd₂ sürülen kasnak çapı');
  if (F.t === 'rack') h += nf('m', 'Modül') + nf('z1', 'Pinyon diş sayısı', 1);
  if (F.t === 'screw') h += nf('p', 'Vida adımı (mm)') + nf('n', 'Ağız sayısı', 1);
  if (F.t === 'ratio') h += nf('k', 'Oran (Δ2 / Δ1)');
  h += btn((F.rev ? '☑' : '☐') + ' Ters yön', 'mc-rev', F.rev) + btn('+ Bağıntıyı ekle', 'mc-add');
  h += `<div class="lbl" style="flex:1 0 100%">${esc(T.note)} Sürücü dönünce / kayınca sürülen eklem bu oranla hareket eder (Bağ sekmesindeki kaydırıcıda da, oynatmada da). Sürülen eklemin kendi Baş / Son ayarı kullanılmaz.</div>`;
  // motor
  const H = J.filter((q) => q.joint.type === 'hinge'), M = mechData.motor || {};
  h += '<div class="lbl h">Motor (sürekli dönüş)</div>';
  if (!H.length) h += '<div class="lbl" style="flex:1 0 100%">Motor için döner (menteşe) eklem gerekir.</div>';
  else {
    h += `<label class="f"><span>Motor eklemi</span><select data-mc="motor">${'<option value="">— seç —</option>' + H.map((q) => `<option value="${q.id}"${M.id === q.id ? ' selected' : ''}>${esc(partName(q, parts.indexOf(q)))}</option>`).join('')}</select></label>` +
      `<label class="f"><span>Devir (d/dk, − ters)</span><input type="number" step="any" data-mc="rpm" value="${M.rpm ?? 30}"></label>`;
    h += (anim.playing && anim.motor ? btn('⏹ Durdur', 'an-stop', true) : btn('▶ Motorla çalıştır', 'an-motor')) + btn(anim.rec ? '⏺ Kaydediliyor…' : '🎬 Video (1 tur)', 'an-motor-rec', !!anim.rec);
    if (M.id && M.rpm) {
      const rows = [];
      const deg = rpmToDegPerSec(M.rpm), { deltas } = mechPropagate(mechData.cs.filter(couplingValid), M.id, deg);
      for (const [id, dd] of deltas) { const q = parts.find((x) => x.id === id); if (!q || !q.joint || id === M.id) continue; rows.push(esc(partName(q, parts.indexOf(q))) + ': ' + (q.joint.type === 'hinge' ? fmtNum(dd / 6, 2) + ' d/dk' : fmtNum(dd, 2) + ' mm/s')); }
      if (rows.length) h += `<div class="lbl" style="flex:1 0 100%">Motor ${fmtNum(M.rpm, 1)} d/dk iken: ${rows.join(' · ')}</div>`;
      if (Math.abs(deg) > 180) h += '<div class="lbl" style="flex:1 0 100%">Ekranda 30 d/dk\'ya yavaşlatılarak gösterilir (oranlar aynı kalır).</div>';
    }
  }
  // çarpışma
  h += '<div class="lbl h">Hareket sırasında çarpışma kontrolü</div>' + btn(mechCol.busy ? '⏳ Kontrol ediliyor… ' + mechCol.busy : '🔍 Çarpışmaları bul (bir tur)', 'mc-col', false, 'flex:1 0 100%');
  if (mechCol.res) {
    const R = mechCol.res;
    if (!R.hits.length) h += `<div class="lbl" style="flex:1 0 100%;color:#22c55e">🟢 ${R.frames} konumda kontrol edildi: hareket eden parçalar hiçbir parçaya çarpmıyor.</div>`;
    else R.hits.forEach((x, i) => { h += `<button data-act="mc-show-${i}" style="all:unset;box-sizing:border-box;flex:1 0 100%;background:#2a1010;border:1px solid #7f1d1d;border-radius:10px;padding:8px 10px;cursor:pointer;font-size:13.5px"><b style="color:#f87171">🔴 ${esc(x.a)} ↔ ${esc(x.b)}</b><br>${esc(x.at)} · en fazla ${fmtNum(x.depth, 2)} mm batma · ${x.n} konumda${x.atStart ? ' · başlangıçta da çakışıyor' : ''} <span style="color:#94a3b8">(dokun: o konumu göster)</span></button>`; });
    h += `<div class="lbl" style="flex:1 0 100%">${R.frames} konum, ${R.pairs} parça çifti denetlendi. Yalnızca birbirine giren hacimler sayılır; değen yüzeyler (dişlerin teması, mil–delik) çarpışma değildir.</div>`;
  }
  return h;
}
function mechInput(el) {
  const k = el.dataset.mc, v = el.value;
  if (k === 'motor') { mechData.motor = { ...(mechData.motor || { rpm: 30 }), id: v ? Number(v) : null }; scheduleSave(); renderPanel(); return; }
  if (k === 'rpm') { mechData.motor = { ...(mechData.motor || {}), rpm: Number(String(v).replace(',', '.')) || 0 }; scheduleSave(); if (el.type !== 'number' || document.activeElement !== el) renderPanel(); return; }
  mechForm[k] = k === 't' || k === 'a' || k === 'b' ? v : v;
  if (k === 't' || k === 'a' || k === 'b') {
    const A = parts.find((x) => String(x.id) === String(mechForm.a)), B = parts.find((x) => String(x.id) === String(mechForm.b));
    if (A && A.gear && !mechForm.z1) mechForm.z1 = A.gz; if (B && B.gear && !mechForm.z2) mechForm.z2 = B.gz;
    if (A && A.gear && !mechForm.m) mechForm.m = A.gm;
    if (k === 'a' && A && A.gear) { mechForm.z1 = A.gz; mechForm.m = A.gm; } if (k === 'b' && B && B.gear) mechForm.z2 = B.gz;
    renderPanel();
  }
}
function mechAct(act) {
  if (act === 'mc-gearpair') { addGearPair(); return; }
  if (act === 'mc-rev') { mechForm.rev = !mechForm.rev; renderPanel(); return; }
  if (act === 'mc-add') {
    const F = mechForm, a = Number(F.a), b = Number(F.b), num = (x) => Number(String(x).replace(',', '.'));
    if (!a || !b || a === b) { toast('Farklı iki eklem seç'); return; }
    const c = { id: Date.now(), t: F.t, a, b, z1: num(F.z1), z2: num(F.z2), d1: num(F.d1), d2: num(F.d2), m: num(F.m), p: num(F.p), n: num(F.n) || 1, k: num(F.k), rev: !!F.rev };
    if (!couplingValid(c)) { toast('Oran için gereken ölçüleri gir'); return; }
    const test = mechPropagate([...mechData.cs.filter(couplingValid), c], a, 1);
    if (test.conflict) { toast('Bu bağıntı mevcutlarla çelişiyor (kapalı döngü); eklenmedi'); return; }
    commit(); mechData.cs.push(c); scheduleSave(); renderPanel(); toast('Bağıntı eklendi'); return;
  }
  let m = act.match(/^mc-del-(\d+)$/); if (m) { commit(); mechData.cs.splice(+m[1], 1); scheduleSave(); renderPanel(); return; }
  if (act === 'mc-col') { mechCollision(); return; }
  m = act.match(/^mc-show-(\d+)$/); if (m) { mechShow(+m[1]); return; }
}
// her parçanın kendi katısı: parça − sırada sonra gelen oyuklar (diğer parçalar düşülmez: çarpışma görünsün)
function collItems() {
  const B = lastBrushes.map(({ p, geo }) => { if (!geo.boundingBox) geo.computeBoundingBox(); return { p, geo, sub: parts.indexOf(p) > 0 && p.op === 'sub', box: geo.boundingBox }; });
  const keep = evaluator.useGroups; evaluator.useGroups = false;
  const out = [];
  try {
    B.forEach((b, i) => {
      if (b.sub) return;
      let tris;
      try {
        const cuts = B.slice(i + 1).filter((o) => o.sub && o.box.intersectsBox(b.box));
        if (!cuts.length) tris = geoTris(b.geo);
        else { let res = new Brush(b.geo.clone()); res.updateMatrixWorld(); for (const o of cuts) { const ob = new Brush(o.geo.clone()); ob.updateMatrixWorld(); const nx = evaluator.evaluate(res, ob, SUBTRACTION); res.geometry.dispose(); ob.geometry.dispose(); res = nx; res.updateMatrixWorld(); } tris = geoTris(res.geometry); res.geometry.dispose(); }
      } catch (e) { tris = geoTris(b.geo); }
      out.push({ id: b.p.id, name: partName(b.p, parts.indexOf(b.p)), tris, key: b.p.x + ',' + b.p.y + ',' + b.p.z + ',' + b.p.rx + ',' + b.p.ry + ',' + b.p.rz });
    });
  } finally { evaluator.useGroups = keep; }
  return out;
}
const mechCol = { busy: null, res: null, frames: [] };
const mechGroup = new THREE.Group(); scene.add(mechGroup);
function drawMechOverlay() { /* animasyon sırasında çarpışma kutusu gizlenir */ if (mechGroup.children.length && anim.playing) { mechGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); mechGroup.clear(); } }
async function mechCollision() {
  if (mechCol.busy) return;
  const M = mechData.motor, mc = M && M.id && parts.find((x) => x.id === M.id && x.joint);
  const ds = animDrivers().filter((d) => anim.cfg[d.key] && anim.cfg[d.key].on);
  if (!mc && !ds.length) { toast('Önce motor seç ya da Oynatma listesinde bir hareket aç'); return; }
  const snap = snapshot(), N = mc ? 36 : 24, start = mc ? mc.joint.val || 0 : 0;
  const setF = (i) => { if (mc) { setJointVal(mc, start + (360 * i) / N * Math.sign(M.rpm || 1)); rebuild(false); } else animApply(i / (N - 1)); };
  const pairs = new Map(); let base = null, meshCache = new Map(), npairs = 0;
  mechCol.res = null;
  try {
    for (let i = 0; i < N; i++) {
      mechCol.busy = (i + 1) + '/' + N; if (tab === 'anim') renderPanel();
      await new Promise((r) => setTimeout(r, 0));
      setF(i);
      const items = collItems().map((it) => { let m = meshCache.get(it.id + '|' + it.key); if (!m) { m = new CMesh(it.tris); meshCache.set(it.id + '|' + it.key, m); } return { ...it, mesh: m }; });
      if (!base) base = new Map(items.map((it) => [it.id, it.key]));
      for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
        const A = items[a], B = items[b];
        if (base.get(A.id) === A.key && base.get(B.id) === B.key && i > 0) continue;   // ikisi de hareket etmedi
        if (i === 0) npairs++;
        const r = cInterference(A.mesh, B.mesh, [], { samples: 8000 });
        if (r.count > 0 && r.depth > 0.1) {
          const key = A.id + '-' + B.id, x = pairs.get(key) || { a: A.name, b: B.name, depth: 0, n: 0, frame: i, atStart: false, box: r.region };
          x.n++; if (r.depth > x.depth) { x.depth = r.depth; x.frame = i; x.box = r.region; } if (i === 0) x.atStart = true;
          pairs.set(key, x);
        }
      }
      if (meshCache.size > 400) meshCache = new Map();
    }
  } finally {
    restore(snap); mechCol.busy = null; refreshAll();
  }
  const hits = [...pairs.values()].sort((a, b) => b.depth - a.depth).map((x) => ({ ...x, at: mc ? 'motor ' + fmtNum((360 * x.frame) / N, 0) + '° konumunda' : 'hareketin %' + Math.round((x.frame / (N - 1)) * 100) + "'inde" }));
  mechCol.res = { hits, frames: N, pairs: npairs, N, motor: !!mc, start };
  if (tab === 'anim') renderPanel();
  toast(hits.length ? hits.length + ' çarpışma bulundu' : 'Çarpışma yok');
}
function mechShow(i) {
  const R = mechCol.res, x = R && R.hits[i];
  if (!x) return;
  commit();
  const M = mechData.motor, mc = M && parts.find((q) => q.id === M.id && q.joint);
  if (R.motor && mc) { setJointVal(mc, (mc.joint.val || 0) + (360 * x.frame) / R.N * Math.sign(M.rpm || 1)); rebuild(false); } else animApply(x.frame / (R.N - 1));
  mechGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); mechGroup.clear();
  if (x.box) { const bx = new THREE.Box3(new THREE.Vector3(...x.box.min), new THREE.Vector3(...x.box.max)).expandByScalar(1); const hlp = new THREE.Box3Helper(bx, 0xef4444); hlp.material.depthTest = false; hlp.renderOrder = 999; mechGroup.add(hlp); fit(bx.clone().expandByScalar(bx.getSize(new THREE.Vector3()).length() * 2 + 20)); }
  toast('Çarpışma konumu gösteriliyor (Geri al ile önceki duruma dön)');
}

/* ---- kalıcı eşleşmeler (mate) ---- */
// Her eşleşme hareket eden parçada (A) saklanır: { t, b (referans parça id), pa, na (A'nın yerel çerçevesinde yüz noktası / normali), pb, nb, v, flip }
let mateErr = 0;
const V3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
function rotAbout(A, q, c) {
  const D = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeRotationFromQuaternion(q)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
  carry(A, () => setPoseM(A, D.multiply(poseM(A))));
}
function shiftBy(A, d) { carry(A, () => { A.x = r4m(pos(A.x) + d.x); A.y = r4m(pos(A.y) + d.y); A.z = r4m(pos(A.z) + d.z); }); }
// tek eşleşmeyi bir adım uygula; dönüş: kalan hata
function mateStep(A, m) {
  const B = parts.find((x) => x.id === m.b);
  if (!B || B === A) return 0;
  const qA = partQuat(A), qB = partQuat(B);
  let err = 0;
  if (m.t === 'conc') {
    const up = new THREE.Vector3(0, 1, 0);
    let aA = up.clone().applyQuaternion(qA), aB = up.clone().applyQuaternion(qB);
    const oA = new THREE.Vector3(pos(A.x), pos(A.y), pos(A.z)), oB = new THREE.Vector3(pos(B.x), pos(B.y), pos(B.z));
    const tgt = aA.dot(aB) >= 0 ? aB : aB.clone().negate();
    const ang = aA.angleTo(tgt);
    if (ang > 1e-6) { rotAbout(A, new THREE.Quaternion().setFromUnitVectors(aA, tgt), oA); err = Math.max(err, ang * 10); }
    const oA2 = new THREE.Vector3(pos(A.x), pos(A.y), pos(A.z));
    const foot = oB.clone().addScaledVector(aB, oA2.clone().sub(oB).dot(aB));
    const d = foot.sub(oA2);
    if (d.length() > 1e-6) { shiftBy(A, d); err = Math.max(err, d.length()); }
    return err;
  }
  let nA = V3(m.na).applyQuaternion(qA).normalize();
  const nB = V3(m.nb).applyQuaternion(qB).normalize();
  let pA = V3(m.pa).applyMatrix4(poseM(A));
  const pB = V3(m.pb).applyMatrix4(poseM(B));
  // dönüş
  let target = null;
  if (m.t === 'coinc' || m.t === 'dist') target = m.flip ? nB.clone() : nB.clone().negate();
  else if (m.t === 'par') target = m.flip ? nB.clone() : (nA.dot(nB) >= 0 ? nB.clone() : nB.clone().negate());
  if (target) {
    const ang = nA.angleTo(target);
    if (ang > 1e-6) { rotAbout(A, new THREE.Quaternion().setFromUnitVectors(nA, target), pA); err = Math.max(err, ang * 10); }
  } else if (m.t === 'ang') {
    const want = Math.min(Math.max(pos(m.v), 0), 180) * RAD, cur = nA.angleTo(nB);
    let k = nA.clone().cross(nB);
    if (k.length() < 1e-9) { k = new THREE.Vector3(1, 0, 0).cross(nA); if (k.length() < 1e-6) k = new THREE.Vector3(0, 0, 1).cross(nA); }
    k.normalize();
    const phi = cur - want;
    if (Math.abs(phi) > 1e-6) { rotAbout(A, new THREE.Quaternion().setFromAxisAngle(k, phi), pA); err = Math.max(err, Math.abs(phi) * 10); }
    return err;
  }
  if (m.t === 'coinc' || m.t === 'dist') {
    pA = V3(m.pa).applyMatrix4(poseM(A));
    const gap = m.t === 'dist' ? pos(m.v) : 0;
    const off = pA.clone().sub(pB).dot(nB);
    const sgn = m.flip ? -1 : 1; // aynı yönde bakan yüzlerde mesafe karşı yöne ölçülür
    const delta = gap * sgn - off;
    if (Math.abs(delta) > 1e-6) { shiftBy(A, nB.clone().multiplyScalar(delta)); err = Math.max(err, Math.abs(delta)); }
  }
  return err;
}
// tüm eşleşmeleri yinelemeli çöz; bir şey hareket ettiyse true
function solveMates() {
  const list = [];
  for (const A of parts) if (A.mates && A.mates.length) for (const m of A.mates) list.push([A, m]);
  if (!list.length) { mateErr = 0; return false; }
  let moved = false, err = 0;
  for (let it = 0; it < 40; it++) {
    err = 0;
    for (const [A, m] of list) err = Math.max(err, mateStep(A, m));
    if (err > 1e-4) moved = true;
    if (err < 1e-4) break;
  }
  // son hata (bir tur daha ölç, değiştirmeden)
  mateErr = err;
  return moved;
}
function mateAdd() {
  if (!mate.a || !mate.b) { toast('Önce iki yüze dokun (1. hareket eden, 2. bağlanacağı).'); return; }
  const A = parts.find((q) => q.id === mate.a.id), B = parts.find((q) => q.id === mate.b.id);
  if (!A || !B) return;
  if (descendantsOf(parts, A.id).includes(B)) { toast('Referans parça, hareket eden parçanın alt parçası olamaz.'); return; }
  const invA = poseM(A).invert(), invB = poseM(B).invert();
  const qiA = partQuat(A).invert(), qiB = partQuat(B).invert();
  const pa = (cp.mcenter ? mate.a.center : mate.a.point).clone().applyMatrix4(invA), pb = (cp.mcenter ? mate.b.center : mate.b.point).clone().applyMatrix4(invB);
  const na = mate.a.normal.clone().applyQuaternion(qiA), nb = mate.b.normal.clone().applyQuaternion(qiB);
  const r = (v) => [v.x, v.y, v.z].map((x) => Math.round(x * 1e5) / 1e5);
  const m = { t: cp.mtype, b: B.id, pa: r(pa), na: r(na), pb: r(pb), nb: r(nb) };
  if (cp.mtype === 'dist') m.v = pos(cp.mval);
  if (cp.mtype === 'ang') m.v = pos(cp.mang);
  if (cp.mflip && ['coinc', 'dist', 'par'].includes(cp.mtype)) m.flip = true;
  commit();
  (A.mates = A.mates || []).push(m);
  mate.a = mate.b = null;
  disposeOverlay(faceGroup);
  selOff = null; sel = A.id;
  refreshAll();
  toast(mateErr > 1e-2 ? 'Eşleşme eklendi ama diğerleriyle çelişiyor' : 'Eşleşme eklendi');
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
  carry(A, () => {
    A.x = r4(np.x); A.y = r4(np.y); A.z = r4(np.z);
    [A.rx, A.ry, A.rz] = quatToEulerXYZ([newQ.x, newQ.y, newQ.z, newQ.w]);
  });
  selOff = null; sel = A.id;
  mate.a = mate.b = null;
  disposeOverlay(faceGroup);
  refreshAll();
  toast('Parça yüzü yüze birleştirildi');
}

/* ---- teknik resim: ön / yan / üst / izometrik (ya da kesit), ölçü, delik ölçüsü, gizli çizgi, PNG + PDF ---- */
let sheetCut = false; // sağ alttaki kutuda izometrik yerine kesit görünüşü
// Görünüş çizgileri: modelin keskin + siluet kenarları, bakan gözden ışın atılarak görünen / gizli diye ayrılır.
// Dönüş: { vis:[[x1,y1,x2,y2],...], hid:[...] } (kağıt koordinatı) ya da çok ayrıntılıysa null
function viewLines(bvh, view, bbo, box, s, eps, piece = 3) {
  const dir = VIEW_TO_VIEWER[view];
  const segs = viewEdges(lastClean.attributes.position.array, dir);
  const dv = new THREE.Vector3(...dir).normalize();
  let pieces = 0;
  const cnt = segs.map((e) => { const n = Math.max(1, Math.ceil(Math.hypot(e[3] - e[0], e[4] - e[1], e[5] - e[2]) * s / piece)); pieces += n; return n; });
  if (pieces > 40000) return null;
  const ray = new THREE.Ray(new THREE.Vector3(), dv);
  const vis = [], hid = [];
  segs.forEach((e, i) => {
    const n = cnt[i];
    const at = (t) => sheetProject(view, [e[0] + (e[3] - e[0]) * t, e[1] + (e[4] - e[1]) * t, e[2] + (e[5] - e[2]) * t], bbo, box, s);
    let run = -1, start = 0;
    const flush = (k0, k1, h) => { const A = at(k0 / n), B = at(k1 / n); (h ? hid : vis).push([A[0], A[1], B[0], B[1]]); };
    for (let k = 0; k < n; k++) {
      const tm = (k + 0.5) / n;
      ray.origin.set(e[0] + (e[3] - e[0]) * tm + dv.x * eps, e[1] + (e[4] - e[1]) * tm + dv.y * eps, e[2] + (e[5] - e[2]) * tm + dv.z * eps);
      const h = bvh.raycastFirst(ray, THREE.DoubleSide) ? 1 : 0;
      if (run < 0) { run = h; start = k; } else if (h !== run) { flush(start, k, run); run = h; start = k; }
    }
    flush(start, n, run);
  });
  return { vis, hid };
}
function makeBvh() {
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lastClean.attributes.position.array), 3));
  return new MeshBVH(pg);
}
const bboxObj = (bb) => ({ min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] });
// Yalnızca gizli kenarlar, kesik çizgi desenin akması için uç uca bağlı çok noktalı çizgiler olarak
function hiddenLines(bvh, view, bb, box, s, eps) {
  const r = viewLines(bvh, view, bboxObj(bb), box, s, eps);
  return r ? chainPolylines(r.hid) : null;
}

function makeSheet(cut) {
  if (!lastClean || !lastClean.boundingBox) { toast('Önce bir model olmalı'); return; }
  if (typeof cut === 'boolean') sheetCut = cut;
  const bb = lastClean.boundingBox;
  const size = bb.getSize(new THREE.Vector3()), ctr = bb.getCenter(new THREE.Vector3());
  const L = sheetLayout(size.x, size.y, size.z);
  const K = 6; // kağıt mm başına piksel
  const cv = document.createElement('canvas');
  cv.width = Math.round(L.sheet.w * K); cv.height = Math.round(L.sheet.h * K);
  const g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, cv.width, cv.height);
  const mm = (v) => v * K;

  // kesit: X ekseninde, kullanıcı kesit açıksa onun konumunda, yoksa ortada; sağdan bakılır (x ≤ konum kalır)
  const sec = sheetCut ? sectionFit(L.iso, size.z, size.y) : null;
  const secX = Math.min(Math.max(section.on && section.axis === 'x' ? section.pos : ctr.x, bb.min.x), bb.max.x);
  const keepSec = { on: section.on, axis: section.axis, pos: section.pos, flip: section.flip };

  const saved = {
    pos: camera.position.clone(), quat: camera.quaternion.clone(), up: camera.up.clone(),
    fov: camera.fov, near: camera.near, far: camera.far, aspect: camera.aspect, pr: renderer.getPixelRatio(),
    color: edgeMat.uniforms.uColor.value.clone(),
  };
  const R = size.length() / 2;
  const shot = (box, dir, up, ppm, hatch) => {
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
    if (!hatch) return;
    // kesilen yüzey: kesit düzleminden görünen iç (arka) yüzler = kesit alanı; 45° taramayla doldurulur
    const tmp = new THREE.Scene();
    const cm = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide });
    cm.clippingPlanes = [secPlane];
    tmp.add(new THREE.Mesh(lastClean, cm));
    renderer.setRenderTarget(null);
    renderer.setClearColor(0xffffff, 1);
    renderer.clear();
    renderer.render(tmp, camera);
    const mk = document.createElement('canvas'); mk.width = VW; mk.height = VH;
    const mg = mk.getContext('2d');
    mg.drawImage(renderer.domElement, 0, 0, VW, VH, 0, 0, VW, VH);
    const id = mg.getImageData(0, 0, VW, VH), px = id.data;
    for (let i = 0; i < px.length; i += 4) { const dark = px[i] < 128; px[i] = px[i + 1] = px[i + 2] = 0; px[i + 3] = dark ? 255 : 0; }
    mg.putImageData(id, 0, 0);
    const hc = document.createElement('canvas'); hc.width = VW; hc.height = VH;
    const hg = hc.getContext('2d');
    hg.strokeStyle = '#555'; hg.lineWidth = 1.2;
    const sp = mm(2.6);
    for (let k = -VH; k < VW + VH; k += sp) { hg.beginPath(); hg.moveTo(k, VH); hg.lineTo(k + VH, 0); hg.stroke(); }
    hg.globalCompositeOperation = 'destination-in';
    hg.drawImage(mk, 0, 0);
    g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(hc, box.x * K - pad, box.y * K - pad); g.restore();
    cm.dispose();
  };
  try {
    edgeMat.uniforms.uColor.value.set(0x111111);
    const ppm = L.scale * K;
    shot(L.front, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), ppm);
    shot(L.side, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), ppm);
    shot(L.top, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, -1), ppm);
    if (sec) {
      section.on = true; section.axis = 'x'; section.pos = secX; section.flip = false;
      applySection();
      shot(sec.box, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), sec.scale * K, true);
    } else {
      const ippm = Math.min(L.iso.w, L.iso.h) * K / (2 * R * 1.15);
      shot(L.iso, new THREE.Vector3(1, 0.8, 1), new THREE.Vector3(0, 1, 0), ippm);
    }
  } finally {
    if (sec) { section.on = keepSec.on; section.axis = keepSec.axis; section.pos = keepSec.pos; section.flip = keepSec.flip; applySection(); }
    edgeMat.uniforms.uColor.value.copy(saved.color);
    camera.position.copy(saved.pos); camera.up.copy(saved.up); camera.quaternion.copy(saved.quat);
    camera.fov = saved.fov; camera.near = saved.near; camera.far = saved.far; camera.aspect = saved.aspect;
    camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    renderer.setPixelRatio(saved.pr);
    resize();
  }

  // --- 2B: çerçeve, ölçü çizgileri, yazılar ---
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
  g.fillText('Üstten', mm(tp.x), mm(tp.y - 1));
  if (sec) {
    const sb = sec.box;
    g.fillText('A-A kesiti (ölçek ' + scaleLabel(sec.scale) + ')', mm(sb.x), mm(L.iso.y - 1));
    hdim(sb.x, sb.x + sb.w, sb.y + sb.h, 7, size.z);
    vdim(sb.y, sb.y + sb.h, sb.x, -7, size.y);
    // kesit düzlemi işareti (önden görünüşte)
    const cx = f.x + (secX - bb.min.x) * L.scale;
    g.save();
    g.lineWidth = 1.6; g.setLineDash([mm(8), mm(1.5), mm(1.5), mm(1.5)]);
    g.beginPath(); g.moveTo(mm(cx), mm(f.y - 4)); g.lineTo(mm(cx), mm(f.y + f.h + 4)); g.stroke();
    g.setLineDash([]); g.lineWidth = 2.4;
    for (const [yy, up] of [[f.y - 4, -1], [f.y + f.h + 4, 1]]) {   // ucu sağa (bakış yönüne) dönük kısa ok
      g.beginPath(); g.moveTo(mm(cx), mm(yy)); g.lineTo(mm(cx + 5), mm(yy)); g.stroke();
      arrow(mm(cx + 5), mm(yy), 1, 0);
      font(4, true); g.textAlign = 'center'; g.fillText('A', mm(cx), mm(yy + up * 3));
    }
    g.restore();
  } else {
    g.fillText('İzometrik (ölçeksiz)', mm(L.iso.x), mm(L.iso.y - 1));
  }

  // --- gizli çizgiler (kesik) ve delik ölçüleri; hata olursa resmin geri kalanı yine verilir ---
  const views = [['front', f], ['side', sd], ['top', tp]];
  try {
    const bvh = makeBvh();
    const eps = Math.max(0.02, size.length() * 2e-4);
    g.save();
    g.strokeStyle = '#333'; g.lineWidth = 1.5; g.setLineDash([mm(2), mm(1)]);
    let tooMany = false;
    for (const [name, box] of views) {
      const lines = hiddenLines(bvh, name, bb, box, L.scale, eps);
      if (!lines) { tooMany = true; continue; }
      for (const ln of lines) {
        g.beginPath(); g.moveTo(mm(ln[0][0]), mm(ln[0][1]));
        for (let i = 1; i < ln.length; i++) g.lineTo(mm(ln[i][0]), mm(ln[i][1]));
        g.stroke();
      }
    }
    g.restore();
    if (tooMany) toast('Model çok ayrıntılı: bazı görünüşlerde gizli çizgi çizilmedi');
  } catch (err) {
    toast('Gizli çizgiler çizilemedi');
  }
  try {
    const holes = holeList(parts);
    const bbo = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
    const inside = (c, pad) => c[0] >= bb.min.x - pad && c[0] <= bb.max.x + pad && c[1] >= bb.min.y - pad && c[1] <= bb.max.y + pad && c[2] >= bb.min.z - pad && c[2] <= bb.max.z + pad;
    const horiz = { front: 0, side: 2, top: 0 }, vert = { front: 1, side: 1, top: 2 };
    g.save();
    g.lineWidth = 1.1; g.strokeStyle = '#111'; g.fillStyle = '#111';
    for (const [name, box] of views) {
      const want = name === 'front' ? 'z' : name === 'side' ? 'x' : 'y';
      let shown = 0;
      for (const h of holes) {
        if (h.axis !== want || shown >= 6 || !inside(h.c, 0.5)) continue;
        shown++;
        const [cx, cy] = sheetProject(name, h.c, bbo, box, L.scale);
        let hw, hh, label;
        if (h.kind === 'round') { hw = hh = h.d * L.scale; label = 'Ø' + num(h.d); }
        else { hw = h.ext[horiz[name]] * L.scale; hh = h.ext[vert[name]] * L.scale; label = '□ ' + num(h.ext[horiz[name]]) + ' × ' + num(h.ext[vert[name]]); }
        // eksen çizgileri (nokta-tire)
        g.save(); g.lineWidth = 0.9; g.setLineDash([mm(5), mm(1), mm(1), mm(1)]);
        g.beginPath();
        g.moveTo(mm(cx - hw / 2 - 2.5), mm(cy)); g.lineTo(mm(cx + hw / 2 + 2.5), mm(cy));
        g.moveTo(mm(cx), mm(cy - hh / 2 - 2.5)); g.lineTo(mm(cx), mm(cy + hh / 2 + 2.5));
        g.stroke(); g.restore();
        // gösterme çizgisi: kutunun dışına doğru, omuz + yazı
        const right = cx >= box.x + box.w / 2 ? 1 : -1;
        const px = cx + right * hw / 2 * 0.7071, py = cy - hh / 2 * 0.7071;
        const ex = px + right * 5, ey = py - 5;
        g.beginPath(); g.moveTo(mm(px), mm(py)); g.lineTo(mm(ex), mm(ey)); g.lineTo(mm(ex + right * 3), mm(ey)); g.stroke();
        arrow(mm(px), mm(py), -right * 0.7071, 0.7071);
        font(3.4, true); g.textAlign = right > 0 ? 'left' : 'right';
        g.fillText(label, mm(ex + right * 4), mm(ey));
      }
    }
    g.restore();
  } catch (err) { /* delik ölçüsü eklenemezse resim yine de gösterilir */ }
  try { drawSheetWelds(g, views, bb, L, K); } catch (err) { /* kaynak sembolü çizilemezse resim yine de gösterilir */ }

  showSheet(cv, sheetCut);
}
// teknik resim: onaylı kaynakların ISO 2553 sembolleri, kaynağın en iyi göründüğü görünüşte
function drawSheetWelds(g, views, bb, L, K) {
  if (!weldPlan || weldPlan.symbols === false) return;
  const ws = (weldPlan.welds || []).filter((w) => w.status === 'approved' && w.pos);
  if (!ws.length) return;
  const bbo = { min: [bb.min.x, bb.min.y, bb.min.z], max: [bb.max.x, bb.max.y, bb.max.z] };
  const drop = { front: 2, side: 0, top: 1 };                     // görünüşte kaybolan eksen
  const used = [];
  const vmap = new Map(views);
  for (const w of ws) {
    const pts = w.path && w.path.length ? w.path : [w.pos];
    // dikişin en geniş göründüğü görünüş
    let best = null, bs = -1;
    for (const [name] of views) {
      if (!drop.hasOwnProperty(name)) continue;
      const ax = [0, 1, 2].filter((k) => k !== drop[name]);
      const spread = ax.reduce((s, k) => s + Math.max(...pts.map((p) => p[k])) - Math.min(...pts.map((p) => p[k])), 0);
      if (spread > bs + 1e-6) { bs = spread; best = name; }
    }
    const box = vmap.get(best);
    if (!box) continue;
    const [cx, cy] = sheetProject(best, w.pos, bbo, box, L.scale);
    const dir = cx < box.x + box.w / 2 ? -1 : 1;
    for (let tries = 0; tries < 6; tries++) {
      const rise = 7 + tries * 6;
      const r = { x0: Math.min(cx, cx + dir * 58), x1: Math.max(cx, cx + dir * 58), y0: cy - rise - 4, y1: cy - rise + 4 };
      if (tries < 5 && used.some((u) => r.x0 < u.x1 && r.x1 > u.x0 && r.y0 < u.y1 && r.y1 > u.y0)) continue;
      used.push(r);
      drawWeldSymbol(g, cx * K, cy * K, K, w, dir, weldPlan.set && weldPlan.set.method, rise);
      break;
    }
  }
}
function showSheet(cv, cutMode) {
  let o = $('sheetov');
  if (o) o.remove();
  o = document.createElement('div');
  o.id = 'sheetov';
  o.style.cssText = 'position:fixed;inset:0;z-index:40;background:#0f172a;display:flex;flex-direction:column;font-family:system-ui,sans-serif';
  o.innerHTML = '<div style="display:flex;gap:6px;padding:8px"><button data-sh="close" style="flex:1;background:#7f1d1d">✕ Kapat</button>' +
    '<button data-sh="png" style="flex:1">⬇ PNG</button><button data-sh="pdf" style="flex:1">⬇ PDF</button><button data-sh="zoom" style="flex:1">🔍 Büyüt</button>' +
    '<button data-sh="mode" style="flex:1">' + (cutMode ? '🧊 İzometrik' : '✂ Kesit') + '</button></div>' +
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
    else if (a === 'mode') { o.remove(); makeSheet(!cutMode); }
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
  all[name] = { data: snapshotSave(), at: Date.now() };
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

  if (t.dataset.sel) { selOff = null; sel = Number(t.dataset.sel); renderPanel(); refreshOverlays(); return; }
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
  if (act === 'mfg-go') { tab = 'mfg'; renderPanel(); mfg.run(); return; }
  if (act && act.startsWith('mfg-') && mfg.act(act)) return;
  if (act && act.startsWith('wd-') && weldUI.act(act)) return;
  if (act === 'wg-go') { tab = 'wgt'; renderPanel(); return; }
  if (act && act.startsWith('wg-') && weightUI.act(act)) return;
  if (act === 'cs-go') { tab = 'cost'; renderPanel(); return; }
  if (act === 'sm-go-tab') { tab = 'sim'; renderPanel(); return; }
  if (act === 'cn-go-tab') { tab = 'cam'; renderPanel(); return; }
  if (act === 'oc-go-tab') { tab = 'occt'; renderPanel(); return; }
  if (act === 'fm-go-tab') { tab = 'fem'; renderPanel(); return; }
  if (act && act.startsWith('fm-') && femUI.act(act)) return;
  if (act && act.startsWith('oc-') && occtUI.act(act)) return;
  if (act === 'lz-on') { camUI.leave(); cam5UI.leave(); }
  if (act && act.startsWith('lz-') && latheUI.act(act)) return;
  if (act && act.startsWith('c5-mode-')) latheUI.setOn(false);
  if (act && act.startsWith('c5-') && cam5UI.act(act)) return;
  if (act && act.startsWith('cn-') && camUI.act(act)) return;
  if (act && act.startsWith('sm-') && simUI.act(act)) return;
  if (act === 'as-go-tab') { tab = 'asm'; renderPanel(); asmUI.start(); return; }
  if (act && act.startsWith('as-') && asmUI.act(act)) return;
  if (act && act.startsWith('cs-') && costUI.act(act)) return;
  if (!act) return;
  const p = cur();

  if (act === 'add-gear') { addGear(); return; }
  if (act.startsWith('mc-')) { mechAct(act); return; }
  if (act.startsWith('add-')) { addPart(act.slice(4), 'add'); return; }
  if (act.startsWith('tab-')) { tab = act.slice(4); if (tab !== 'asm' && asmUI.active) asmUI.stop(); if (tab !== 'sim' && simUI.active) simUI.exit(); if (tab !== 'fem' && femUI.active) femUI.exit(); if (tab !== 'cam') { camUI.leave(); cam5UI.leave(); latheUI.leave(); } else latheUI.enter(); if (tab !== 'occt') occtUI.leave(); if (tab !== 'face' && tab !== 'edge' && tab !== 'mate' && tab !== 'link') clearFace();
    linkPick = false;
    if (tab !== 'mate') { mate.a = null; mate.b = null; }
    if (tab !== 'edge') edgeSels = []; renderPanel(); return; }
  if (act === 'edge-clear') { edgeSels = []; disposeOverlay(faceGroup); renderPanel(); return; }
  if (act === 'edge-all' || act === 'edge-top') {
    const last = edgeSels[edgeSels.length - 1];
    const q = last && parts.find((x) => x.id === last.id);
    if (!q) return;
    const add = (e) => { if (!edgeSels.some((s) => edgeKey(s) === edgeKey(e))) edgeSels.push(e); };
    for (const axis of ['x', 'y', 'z']) for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
      const perp = EDGE_AXES[axis];
      const yi = perp.indexOf('y');
      if (act === 'edge-top' && !(axis !== 'y' && (yi === 0 ? sa : sb) === 1)) continue;
      add({ id: q.id, axis, sa, sb });
    }
    drawEdgeSelection(); renderPanel();
    return;
  }
  if (act === 'edge-chamfer') { edgeFeature('chamfer'); return; }
  if (act === 'edge-fillet') { edgeFeature('fillet'); return; }
  if (act.startsWith('fshape-')) { cp.shape = act.slice(7); renderPanel(); return; }
  if (act.startsWith('pat-')) { cp.pat = act.slice(4); renderPanel(); return; }
  if (act === 'shell-top') { cp.openTop = !cp.openTop; renderPanel(); return; }
  if (act === 'shell-bot') { cp.openBot = !cp.openBot; renderPanel(); return; }
  if (act === 'shell-do') { shellFeature(); return; }
  if (act === 'mate-center') { cp.mcenter = !cp.mcenter; renderPanel(); return; }
  if (act.startsWith('mt-')) { if (act === 'mt-flip') cp.mflip = !cp.mflip; else cp.mtype = act.slice(3); renderPanel(); return; }
  if (act === 'mate-add') { mateAdd(); return; }
  if (act.startsWith('mdel-')) {
    const [, aid, idx] = act.split('-'), A = parts.find((x) => x.id === Number(aid));
    if (A && A.mates) { commit(); A.mates.splice(Number(idx), 1); if (!A.mates.length) delete A.mates; refreshAll(); }
    return;
  }
  if (act === 'mate-do') { mateApply(); return; }
  if (act === 'mate-reset') { mate.a = mate.b = null; disposeOverlay(faceGroup); renderPanel(); return; }
  if (act.startsWith('jt-') || act.startsWith('jx-') || act === 'jpick' || act === 'jreset' || act === 'j-unlink') { linkAct(act); return; }
  if (act.startsWith('an-')) { animAct(act); return; }
  if (act.startsWith('sp-')) { const [, k, v] = act.split('-'); cp[k] = v; renderPanel(); return; }
  if (act.startsWith('mat-')) { settings.mat = act.slice(4); saveSettings(); renderPanel(); return; }
  if (act === 'bom-csv') { exportBom(); return; }
  if (act === 'dxf-out') { exportDXF(); return; }
  if (act === 'step-out' || act === 'mf-out') {
    if (!lastClean) { toast('Önce bir model olmalı'); return; }
    const posArr = lastClean.attributes.position.array, tris = posArr.length / 9;
    if (act === 'mf-out') {
      const col = (parts.find((q) => !q.hidden) || {}).color || '#38bdf8';
      saveBlob(new Blob([to3MF(posArr, projName || 'model', col)], { type: 'model/3mf' }), fileBase() + '.3mf');
      toast('3MF indirildi (' + tris + ' üçgen, mm)');
      return;
    }
    if (tris > 60000) { toast('Model çok ayrıntılı (' + tris + ' üçgen); STEP dosyası çok büyük olur. Yuvarlamaları azaltıp dene.'); return; }
    toast('STEP hazırlanıyor…');
    setTimeout(() => {
      try {
        const r = toSTEP(posArr, projName || 'model');
        saveBlob(new Blob([r.text], { type: 'application/step' }), fileBase() + '.step');
        toast('STEP indirildi: ' + r.faces + ' yüz, ' + (r.solid ? 'katı' : 'yüzey modeli (model tam kapalı değil)'));
      } catch (e) { toast('STEP oluşturulamadı'); }
    }, 30);
    return;
  }
  if (act === 'bake') { bakeAll(); return; }
  if (act === 'sheet-make') { makeSheet(false); return; }
  if (act === 'edges') { settings.edges = settings.edges === false; afterSettings(); return; }
  if (act === 'face-hole') { faceFeature('sub'); return; }
  if (act === 'face-boss') { faceFeature('add'); return; }
  if (act === 'face-sk-cut') { faceSketch('sub'); return; }
  if (act === 'face-sk-boss') { faceSketch('add'); return; }
  if (act === 'hole-round') { addPart('cylinder', 'sub'); return; }
  if (act === 'hole-square') { addPart('box', 'sub'); return; }
  if (act === 'sketch-new') { newSketch(); return; }
  if (act === 'cad2d') { open2D(); return; }
  if (act === 'sketch-edit') { editSketch(); return; }
  if (act.startsWith('frt-')) { commit(); p.fr = act.slice(4); refreshAll(); return; }
  if (act === 'fr-csv') { exportCutList(p); return; }
  if (act === 'cut-opt') { openCutOpt({ name: fileBase(), fromCad: cadCutPieces }); return; }
  if (act.startsWith('frj-')) { commit(); p.fj = act.slice(4); refreshAll(); return; }
  if (act.startsWith('shp-')) { commit(); Object.assign(p, JSON.parse(JSON.stringify(SHEET_PRESETS[act.slice(4)]))); refreshAll(); return; }
  if (act === 'sh-flat') { commit(); p.flat = !p.flat; refreshAll(); return; }
  if (act === 'sh-dxf') { exportFlatDXF(p); return; }
  if (act === 'seg-add' && p.seg) { commit(); p.seg.push({ a: 90, L: 30 }); p.sh = 'custom'; refreshAll(); return; }
  if (act === 'seg-del' && p.seg && p.seg.length > 1) { commit(); p.seg.pop(); p.sh = 'custom'; refreshAll(); return; }
  if (act.startsWith('prof-')) { commit(); p.prof = act.slice(5); refreshAll(); return; }
  if (act.startsWith('path-')) { commit(); p.path = act.slice(5); refreshAll(); return; }
  if (act.startsWith('ls0-') || act.startsWith('ls1-')) { commit(); p[act.slice(0, 3)] = act.slice(4); refreshAll(); return; }
  if (act === 'pt-add' && p.pts) { commit(); const e = p.pts[p.pts.length - 1]; p.pts.push([e[0] + 20, e[1], e[2]]); refreshAll(); return; }
  if (act === 'pt-del' && p.pts && p.pts.length > 2) { commit(); p.pts.pop(); refreshAll(); return; }
  if (act.startsWith('type-')) { commit(); p.type = act.slice(5); refreshAll(); return; }
  if (act === 'op-add') { commit(); p.op = 'add'; refreshAll(); return; }
  if (act === 'op-sub') { commit(); p.op = 'sub'; refreshAll(); return; }
  if (act === 'fit') { fit(lastClean ? lastClean.boundingBox : null); return; }
  if (act === 'del') { if (!hasSel()) { toast('Önce silinecek parçayı seç'); return; } removeCur(); return; }
  if (act === 'undo') { doUndo(); return; }
  if (act === 'redo') { doRedo(); return; }
  if (act === 'stl') { exportSTL(); return; }
  if (act === 'mic') { toggleMic(); return; }
  if (act === 'projects') { openDialog(); return; }
  if (act === 'guide') { openGuide(); return; }
  if (act === 'tip-close') { const el = $('tipcard'); if (el) el.style.display = 'none'; return; }
  if (act === 'dlg-close') { closeDialog(); return; }
  if (act === 'dlg-save') { saveProject(($('pname').value || '').trim() || 'model'); renderDialog(); return; }
  if (act === 'dlg-new') {
    commit();
    parts = freshParts(); selOff = null; sel = 1; nextId = 2; projName = 'model'; weldPlan = null; asmAnswers = {}; simData = null; femData = null; mechData = { cs: [], motor: null };
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
  if (d.wf) { weldUI.input(el, 'input'); return; }
  if (d.wg) { if (d.wg === 'mat') weightUI.input(el, 'change'); return; }
  if (d.cf) return;   // maliyet girdileri değişince (change) işlenir
  if (d.as) { asmUI.input(el, 'input'); return; }
  if (d.cs === 'speed') { camUI.input(el, 'input'); return; }
  if (d.c5) { if (d.c5 === 'pos') cam5UI.input(el, 'input'); return; }
  if (d.lz) { if (d.lz === 'speed') latheUI.input(el, 'input'); return; }
  if (d.fm) { if (d.fm === 'frame' || d.fm.startsWith('me.')) femUI.input(el); return; }
  if (d.cs || d.cn || d.ct || d.co) return;   // CNC: değişince işlenir
  if (d.sf || d.sv || d.st) { simUI.input(el, 'input'); return; }
  if (d.sm || d.sp || d.sl2) return;   // değişince (change) işlenir
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
    if (d.c === 'lkg' && tab === 'str') { clearTimeout(window.__lkgT); window.__lkgT = setTimeout(() => { const ae = document.activeElement; renderPanel(); const ne = document.querySelector('#tabbody input[data-c="lkg"]'); if (ne && ae && ae.dataset && ae.dataset.c === 'lkg') { ne.focus(); const v = ne.value; ne.value = ''; ne.value = v; } }, 600); }
    return;
  }
  if (d.j === 'val') {
    const c = cur();
    if (!c.joint || !isFinite(el.valueAsNumber)) return;
    const key = c.id + '.jval', now = Date.now();
    if (key !== lastKey || now - lastAt > 1500) { commit(); updateToolbar(); }
    lastKey = key; lastAt = now;
    setJointVal(c, el.valueAsNumber);
    rebuild(false);
    const isH = c.joint.type === 'hinge';
    const jl = document.querySelector('[data-jl]');
    if (jl) jl.textContent = (isH ? 'Açı: ' + fmtNum(c.joint.val, 1) + '°' : 'Kayma: ' + lenText(c.joint.val));
    scheduleSave();
    return;
  }
  if (d.seg) {
    const [si, key] = d.seg.split(','), c = cur(), v = el.valueAsNumber;
    if (!c.seg || !c.seg[+si] || !isFinite(v)) return;
    const skey = c.id + '.seg' + d.seg, snow = Date.now();
    if (skey !== lastKey || snow - lastAt > 1500) { commit(); updateToolbar(); }
    lastKey = skey; lastAt = snow;
    c.seg[+si][key] = key === 'L' ? fromUnit(v, settings.unit) : v;
    c.sh = 'custom';
    rebuild(false);
    const info = document.querySelector('#tabbody .lbl:last-of-type');
    const sc = sheetCalc(c);
    if (info) { info.innerHTML = sc.ok ? 'Açınım boyu: <b>' + lenText(sc.flatL) + '</b> × ' + lenText(sc.W) + ' · ' + sc.bends.length + ' büküm' : '⚠ ' + sc.err; info.style.color = sc.ok ? '#cbd5e1' : '#f87171'; }
    scheduleSave();
    return;
  }
  if (d.pmat) { commit(); cur().mat = el.value; refreshAll(); return; }
  if (d.pf) { commit(); cur().pf = el.value; refreshAll(); return; }
  if (d.mc) { mechInput(el); return; }
  if (d.an) {
    const [key, which] = d.an.split(','), st = anim.cfg[key], dd = animDrivers().find((x) => x.key === key);
    if (!st || !dd || !isFinite(el.valueAsNumber)) return;
    st[which] = dd.unit === '°' ? el.valueAsNumber : fromUnit(el.valueAsNumber, settings.unit);
    return;
  }
  if (d.mv) {
    const [aid, idx] = d.mv.split(',').map(Number), A = parts.find((x) => x.id === aid), m = A && A.mates && A.mates[idx];
    if (!m || !isFinite(el.valueAsNumber)) return;
    const mkey = 'mv' + d.mv, mnow = Date.now();
    if (mkey !== lastKey || mnow - lastAt > 1500) { commit(); updateToolbar(); }
    lastKey = mkey; lastAt = mnow;
    m.v = d.u === 'len' ? fromUnit(el.valueAsNumber, settings.unit) : el.valueAsNumber;
    rebuild(false); scheduleSave();
    return;
  }
  if (d.pt) {
    const [pi, ax] = d.pt.split(',').map(Number), c = cur();
    if (!c.pts || !c.pts[pi] || !isFinite(el.valueAsNumber)) return;
    const pkey = c.id + '.pt' + d.pt, pnow = Date.now();
    if (pkey !== lastKey || pnow - lastAt > 1500) { commit(); updateToolbar(); }
    lastKey = pkey; lastAt = pnow;
    c.pts[pi][ax] = fromUnit(el.valueAsNumber, settings.unit);
    rebuild(false);
    scheduleSave();
    return;
  }
  const k = d.k;
  if (!k) return;
  const key = cur().id + '.' + k, now = Date.now();
  if (key !== lastKey || now - lastAt > 1500) { commit(); updateToolbar(); }
  lastKey = key; lastAt = now;
  if (d.t === 'text') { cur()[k] = el.value; renderChips(); scheduleSave(); return; }
  const setv = () => { cur()[k] = d.u === 'deg' ? el.valueAsNumber : fromUnit(el.valueAsNumber, settings.unit); };
  if (POSE_KEYS.includes(k)) carry(cur(), setv); else setv();
  if (cur().gear && (k === 'gm' || k === 'gz' || k === 'gb')) regenGear(cur());
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
      case 'delete': ok = hasSel() ? removeCur() : (toast('Önce silinecek parçayı seç'), false); break;
      case 'add': addPart(c.type, c.op, c.dims); break;
      case 'set': commit(); if (POSE_KEYS.includes(c.key)) carry(cur(), () => { cur()[c.key] = c.value; }); else cur()[c.key] = c.value; refreshAll(); break;
      case 'rotate': commit(); carry(cur(), () => { cur()['r' + c.axis] = c.deg; }); refreshAll(); break;
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

/* ================= Rehber ve örnek projeler ================= */
function loadExample(key) {
  const ex = buildExample(key);
  if (!ex) return;
  commit();
  parts = ex.parts; nextId = ex.nextId; selOff = null; sel = ex.sel; projName = ex.name; weldPlan = null; asmAnswers = {}; simData = null; femData = null; mechData = { cs: [], motor: null };
  cleanLinks(parts);
  if (ex.anim) Object.assign(anim.cfg, ex.anim);
  tab = 'dims';
  refreshAll(true);
  showTip('📘 ' + ex.name, ex.tip);
}
function showTip(title, text) {
  let el = $('tipcard');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tipcard';
    el.style.cssText = 'position:absolute;left:8px;right:8px;top:8px;z-index:5;background:rgba(15,23,42,.94);border:1px solid #0284c7;border-radius:10px;padding:8px 36px 8px 10px;font-size:13px;line-height:1.35;color:#e2e8f0';
    view.appendChild(el);
  }
  el.innerHTML = `<b style="color:#7dd3fc">${esc(title)}</b><br>${esc(text)}<button data-act="tip-close" style="position:absolute;right:4px;top:4px;flex:none;width:28px;padding:4px 0;background:#1e293b">✕</button>`;
  el.style.display = 'block';
}
function openGuide() {
  let o = $('guideov');
  if (o) o.remove();
  o = document.createElement('div');
  o.id = 'guideov';
  o.style.cssText = 'position:fixed;inset:0;z-index:45;background:#0f172a;color:#e2e8f0;overflow-y:auto;font-family:system-ui,sans-serif;padding:10px 12px 24px';
  o.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><div style="flex:1;font-weight:800;font-size:18px">❓ Rehber</div>' +
    '<button data-g="close" style="flex:none;padding:9px 14px;background:#7f1d1d">✕ Kapat</button></div>' +
    '<div style="font-size:13px;color:#94a3b8;margin-bottom:8px">Bir örneğe dokun: proje yüklenir ve ne deneyeceğin yazar. Önceki çalışman ↶ Geri ile geri gelir.</div>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:12px">' +
    EXAMPLES.map((e) => `<button data-ex="${e.key}" style="text-align:left;padding:10px;background:#1e293b;border-radius:10px;display:block;white-space:normal"><div style="font-size:15px;font-weight:800">${e.icon} ${esc(e.name)}</div><div style="font-size:11.5px;font-weight:400;color:#94a3b8;margin-top:3px">${esc(e.about)}</div></button>`).join('') +
    '</div>' +
    GUIDE.map((g) => `<div style="background:#111c33;border:1px solid #1e293b;border-radius:10px;padding:9px 11px;margin-bottom:8px"><div style="font-weight:800;margin-bottom:4px;color:#7dd3fc">${esc(g.t)}</div>` +
      g.s.map((x) => `<div style="font-size:13px;line-height:1.4;margin:3px 0">• ${esc(x)}</div>`).join('') + '</div>').join('') +
    '<div style="font-size:12px;color:#64748b;margin-top:6px">Her sekmenin altındaki gri yazı o sekmenin kısa açıklamasıdır.</div>';
  o.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.g === 'close') { o.remove(); return; }
    if (b.dataset.ex) { o.remove(); loadExample(b.dataset.ex); }
  });
  document.body.appendChild(o);
  try { localStorage.setItem('cizim:guideSeen', '1'); } catch (e) { /* */ }
}

/* ================= Başlangıç ================= */
try {
  const a = JSON.parse(localStorage.getItem('cizim:auto') || 'null');
  if (a && a.snap) { restore(a.snap); projName = a.projName || 'model'; }
} catch (e) { /* bozuk kayıt: varsayılanla devam */ }

// test / hata ayıklama için küçük kanca (arayüzü etkilemez)
window.__app = { get lathe() { return latheUI; }, edgeMat, selfTestEdges, get edgesBroken() { return edgesBroken; }, applyCommands, parseVoice, get parts() { return parts; }, get lastClean() { return lastClean; }, get modelMesh() { return modelMesh; }, settings, section, measure, rebuild, refreshAll, THREE, camera };

renderPanel();
updateToolbar();
rebuild(true);
edgesBroken = !selfTestEdges();
try { if (!localStorage.getItem('cizim:guideSeen')) setTimeout(openGuide, 600); } catch (e) { /* */ }
if (edgesBroken) toast('Bu cihazda kenar çizgisi doğru çizilemiyor; kapatıldı (Görünüm sekmesinden denenebilir).');
