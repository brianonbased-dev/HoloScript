/**
 * HoloScript starter renderer
 * ───────────────────────────
 * Reads the scene that the Vite plugin (vite.config.js) parsed from
 * `src/scene.holo` with @holoscript/core and injected as
 * `window.__HOLOSCRIPT_SCENE__`, then renders it with Three.js.
 *
 * Scene shape (see vite.config.js → parseScene):
 *   { name, objects: [{ name, traits: [{name, config}], ...inlinedProps }] }
 *
 * Object props the renderer understands:
 *   type     — "ambient_light" | "directional_light" | "text" (a light/label, not a mesh)
 *   geometry — "plane" | "cube" | "sphere" | "cylinder" | "torus" | "cone"
 *   position — [x, y, z]      rotation — [xDeg, yDeg, zDeg]
 *   scale    — [x, y, z] | n  color    — "#rrggbb"
 *   intensity — light strength    content — text label string
 * Traits the renderer reacts to:
 *   @glowing(intensity, color) — emissive material
 * (Interaction traits — @grabbable/@clickable/@hoverable/etc. — are parsed and
 *  available on `obj.traits` for you to wire up; this starter renders them inert.)
 *
 * Edit src/scene.holo and save — the plugin re-parses and the page reloads.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const scene = window.__HOLOSCRIPT_SCENE__ ?? { name: 'Untitled', objects: [] };

// ─── Renderer / camera / scene ────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

const threeScene = new THREE.Scene();
threeScene.background = new THREE.Color('#0a0a0f');

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 1.6, 3);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.2, -3);
controls.enableDamping = true;
controls.update();

// ─── Helpers ──────────────────────────────────────────────
const toRad = (deg) => (deg * Math.PI) / 180;

function asTriple(v, fallback) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'number') return [v, v, v];
  return fallback;
}

function makeGeometry(kind) {
  switch (kind) {
    case 'plane':
      return new THREE.PlaneGeometry(1, 1);
    case 'sphere':
      return new THREE.SphereGeometry(0.5, 32, 16);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
    case 'torus':
      return new THREE.TorusGeometry(0.5, 0.2, 16, 48);
    case 'cone':
      return new THREE.ConeGeometry(0.5, 1, 32);
    case 'cube':
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function trait(obj, name) {
  return (obj.traits ?? []).find((t) => t.name === name);
}

// A spinning torus / glowing orb wants a little life; we gently rotate any
// object that opted into @glowing so the starter scene isn't static.
const animated = [];

function makeText(obj) {
  // Lightweight label: render the string to a canvas texture on a sprite.
  const text = obj.content ?? obj.name ?? '';
  const pad = 24;
  const font = 48;
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = `${font}px Inter, system-ui, sans-serif`;
  const w = Math.ceil(measure.measureText(text).width) + pad * 2;
  const h = font + pad * 2;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.font = `${font}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = obj.color ?? '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, pad, h / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true })
  );
  const s = (typeof obj.scale === 'number' ? obj.scale : 1) * 2;
  sprite.scale.set((w / h) * s, s, 1);
  return sprite;
}

// ─── Build the scene ──────────────────────────────────────
for (const obj of scene.objects) {
  let node;

  if (obj.type === 'ambient_light') {
    node = new THREE.AmbientLight(obj.color ?? '#ffffff', obj.intensity ?? 0.5);
  } else if (obj.type === 'directional_light') {
    node = new THREE.DirectionalLight(obj.color ?? '#ffffff', obj.intensity ?? 1);
  } else if (obj.type === 'text') {
    node = makeText(obj);
  } else if (obj.geometry) {
    const geometry = makeGeometry(obj.geometry);
    const glow = trait(obj, 'glowing');
    const material = new THREE.MeshStandardMaterial({
      color: obj.color ?? '#cccccc',
      roughness: 0.6,
      metalness: 0.1,
    });
    if (glow) {
      material.emissive = new THREE.Color(glow.config?.color ?? obj.color ?? '#ffffff');
      material.emissiveIntensity = Number(glow.config?.intensity ?? 1);
    }
    node = new THREE.Mesh(geometry, material);
    node.castShadow = true;
    node.receiveShadow = true;
    if (glow) animated.push(node);
  }

  if (!node) continue;

  const [px, py, pz] = asTriple(obj.position, [0, 0, 0]);
  node.position.set(px, py, pz);

  if (obj.rotation) {
    const [rx, ry, rz] = asTriple(obj.rotation, [0, 0, 0]);
    node.rotation.set(toRad(rx), toRad(ry), toRad(rz));
  }
  // Lights and sprites size themselves; only meshes take the scene scale.
  if (obj.scale !== undefined && node.isMesh) {
    const [sx, sy, sz] = asTriple(obj.scale, [1, 1, 1]);
    node.scale.set(sx, sy, sz);
  }

  node.name = obj.name ?? '';
  threeScene.add(node);
}

// Ensure there's always at least some light so the scene is never pitch black.
if (!scene.objects.some((o) => o.type === 'ambient_light' || o.type === 'directional_light')) {
  threeScene.add(new THREE.HemisphereLight('#ffffff', '#444466', 1));
}

// ─── VR button (only when the device actually supports immersive-vr) ──
const xrButton = document.getElementById('xr-button');
if (xrButton && navigator.xr?.isSessionSupported) {
  navigator.xr.isSessionSupported('immersive-vr').then((supported) => {
    if (!supported) return;
    xrButton.classList.remove('hidden');
    xrButton.addEventListener('click', async () => {
      const session = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });
      renderer.xr.setSession(session);
    });
  });
}

// ─── Loading overlay + FPS HUD ────────────────────────────
const loading = document.getElementById('loading');
const fpsEl = document.getElementById('fps');
let frames = 0;
let fpsClock = performance.now();

// ─── Render loop ──────────────────────────────────────────
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  for (const node of animated) node.rotation.y += dt * 0.6;
  controls.update();
  renderer.render(threeScene, camera);

  if (loading && !loading.classList.contains('hidden')) {
    loading.classList.add('hidden');
  }
  frames += 1;
  const now = performance.now();
  if (fpsEl && now - fpsClock >= 500) {
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsClock))} fps`;
    frames = 0;
    fpsClock = now;
  }
});

// ─── Resize ───────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
