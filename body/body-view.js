// Uygulama içinde 3D vücut: canlı görünüm (ana ekran) ve önden/arkadan kas ısısı resimleri.
// Tek bir resim üretici paylaşılır; telefon için WebGL bağlamı sayısı düşük tutulur.
import * as THREE from "three";
import { OrbitControls } from "../vendor/three/OrbitControls.js";
import { loadBody, buildPositions, fitBody } from "./body-model.js";

const SKIN = new THREE.Color("#d9cdc0");
const SHORTS = new THREE.Color("#2b313a");
const accent = () => new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#DC5A12");

let bodyPromise = null;
export const getBody = () => (bodyPromise ||= loadBody("body/"));

// Ölçülerden model parametreleri (aynı ölçüler için önbellekli)
const fitCache = new Map();
export function paramsFor(body, measures) {
  const key = JSON.stringify(measures);
  if (!fitCache.has(key)) fitCache.set(key, fitBody(body, measures));
  return fitCache.get(key);
}

function material() {
  const mat = new THREE.MeshStandardMaterial({ color: SKIN, roughness: 0.72, metalness: 0 });
  mat.onBeforeCompile = sh => {
    sh.uniforms.shortsColor = { value: SHORTS };
    sh.uniforms.heatColor = { value: accent() };
    mat.userData.shader = sh;
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float shorts;\nattribute float heat;\nvarying float vShorts;\nvarying float vHeat;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvShorts = shorts;\nvHeat = heat;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nuniform vec3 shortsColor;\nuniform vec3 heatColor;\nvarying float vShorts;\nvarying float vHeat;")
      .replace("#include <color_fragment>", `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, shortsColor, step(0.0, vShorts));
        diffuseColor.rgb = mix(diffuseColor.rgb, heatColor, clamp(vHeat, 0.0, 1.0) * 0.88);`);
  };
  return mat;
}

function makeMesh(body) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(body.N * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setIndex(new THREE.BufferAttribute(body.indices, 1));
  g.setAttribute("shorts", new THREE.BufferAttribute(Float32Array.from(body.shorts), 1));
  g.setAttribute("heat", new THREE.BufferAttribute(new Float32Array(body.N), 1).setUsage(THREE.DynamicDrawUsage));
  return new THREE.Mesh(g, material());
}

function setShape(mesh, body, params) {
  const attr = mesh.geometry.attributes.position;
  buildPositions(body, params, attr.array);
  attr.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingSphere();
}

// heat: { kasAnahtarı: 0..1 } — köşelere dağıtılır, sınırlar yumuşak geçer
function setHeat(mesh, body, heat) {
  const attr = mesh.geometry.attributes.heat;
  const keys = body.meta.muscles || [];
  const byId = keys.map(k => (heat && heat[k]) || 0);
  for (let i = 0; i < body.N; i++) attr.array[i] = body.muscle ? byId[body.muscle[i]] : 0;
  attr.needsUpdate = true;
  const sh = mesh.material.userData.shader;
  if (sh) sh.uniforms.heatColor.value = accent();
}

function lights(scene) {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8178, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 1.8); key.position.set(2, 4, 3); scene.add(key);
  const back = new THREE.DirectionalLight(0xffffff, 1.1); back.position.set(-2, 3, -3); scene.add(back);
}

// ---------- Önden / arkadan resim ----------
let snap = null;
function snapRig() {
  if (snap) return snap;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(1);
  const scene = new THREE.Scene();
  lights(scene);
  const camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  snap = { renderer, scene, camera, front: null, back: null };
  return snap;
}

const snapCache = new Map();
export async function snapshot(measures, heat, w = 640, h = 520) {
  const key = JSON.stringify([measures, heat, w, h, getComputedStyle(document.documentElement).getPropertyValue("--accent")]);
  if (snapCache.has(key)) return snapCache.get(key);
  const body = await getBody();
  const r = snapRig();
  if (!r.front) {
    r.front = makeMesh(body); r.back = makeMesh(body);
    r.back.rotation.y = Math.PI;
    r.scene.add(r.front, r.back);
  }
  const p = paramsFor(body, measures);
  for (const m of [r.front, r.back]) { setShape(m, body, p); setHeat(m, body, heat); }
  const height = r.front.geometry.boundingSphere.center.y * 2;
  r.front.position.x = -0.42; r.back.position.x = 0.42;
  r.renderer.setSize(w, h, false);
  r.camera.aspect = w / h;
  r.camera.position.set(0, height * 0.52, height * 2.25);
  r.camera.lookAt(0, height * 0.5, 0);
  r.camera.updateProjectionMatrix();
  r.renderer.render(r.scene, r.camera);
  const url = r.renderer.domElement.toDataURL("image/png");
  snapCache.set(key, url);
  return url;
}

// ---------- Canlı görünüm ----------
export async function mountLive(container, measures, opts = {}) {
  const body = await getBody();
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  lights(scene);
  const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 50);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = !!opts.zoom;
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.2;
  controls.minPolarAngle = controls.maxPolarAngle = Math.PI / 2 - 0.08; // sadece etrafında döndür
  renderer.domElement.addEventListener("pointerdown", () => { controls.autoRotate = false; });

  const mesh = makeMesh(body);
  scene.add(mesh);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.4, 40), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.12 }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.002; scene.add(shadow);

  function update(m, heat) {
    setShape(mesh, body, paramsFor(body, m));
    setHeat(mesh, body, heat);
    const height = mesh.geometry.boundingSphere.center.y * 2;
    controls.target.set(0, height * 0.5, 0);
    camera.position.set(0, height * 0.52, height * 2.35);
    controls.update();
  }
  function resize() {
    const r = container.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();
  update(measures, opts.heat);

  // Görünmezken çizme (pil için)
  let visible = true;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
  io.observe(container);
  renderer.setAnimationLoop(() => {
    if (!visible || document.hidden || container.offsetParent === null) return;
    controls.update();
    renderer.render(scene, camera);
  });
  return {
    update,
    dispose() { renderer.setAnimationLoop(null); ro.disconnect(); io.disconnect(); renderer.dispose(); renderer.domElement.remove(); }
  };
}
