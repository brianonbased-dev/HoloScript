/**
 * HoloScript instant renderer (zero-build, CDN)
 * ─────────────────────────────────────────────
 * The "instant" template has no build step. At runtime it fetches
 * `src/scene.holo`, parses it with the REAL @holoscript/core parser (loaded from
 * a CDN via the importmap in index.html — the engine-free `/parser` subpath, so
 * it never pulls the optional @holoscript/engine peer), and renders it with
 * Three.js (also CDN). Edit src/scene.holo and refresh to see changes.
 *
 * The render logic mirrors the bundled vite-template renderer; only how the
 * scene is *obtained* differs (fetch + parse here vs. a Vite-plugin global there).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { parseHolo } from '@holoscript/core/parser';

const toRad = (deg) => (deg * Math.PI) / 180;

function asTriple(v, fallback) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'number') return [v, v, v];
  return fallback;
}

// Flatten the core AST into { name, objects: [{ name, traits, ...props }] } —
// identical to the vite plugin's parseScene so both renderers consume one shape.
function flattenScene(source) {
  const result = parseHolo(source);
  if (!result || result.success === false) {
    for (const e of (result && result.errors) || []) {
      console.error(`[holoscript] ${e.message || e}${e.line ? ` (line ${e.line})` : ''}`);
    }
    return { name: 'Untitled', objects: [] };
  }
  const ast = result.ast ?? {};
  const objects = (ast.objects ?? []).map((obj) => {
    const out = {
      name: obj.name,
      traits: (obj.traits ?? []).map((t) => ({ name: t.name, config: t.config ?? {} })),
    };
    for (const prop of obj.properties ?? []) out[prop.key] = prop.value;
    return out;
  });
  return { name: ast.name ?? 'Untitled', objects };
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

const traitOf = (obj, name) => (obj.traits ?? []).find((t) => t.name === name);

async function main() {
  let source = '';
  try {
    source = await (await fetch('src/scene.holo')).text();
  } catch (err) {
    console.error('[holoscript] could not fetch src/scene.holo:', err);
  }
  const scene = flattenScene(source);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const threeScene = new THREE.Scene();
  threeScene.background = new THREE.Color('#0a0a1a');

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 1.6, 3);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, -3);
  controls.enableDamping = true;
  controls.update();

  const animated = [];

  for (const obj of scene.objects) {
    let node;
    if (obj.type === 'ambient_light') {
      node = new THREE.AmbientLight(obj.color ?? '#ffffff', obj.intensity ?? 0.5);
    } else if (obj.type === 'directional_light') {
      node = new THREE.DirectionalLight(obj.color ?? '#ffffff', obj.intensity ?? 1);
    } else if (obj.geometry) {
      const glow = traitOf(obj, 'glowing');
      const material = new THREE.MeshStandardMaterial({
        color: obj.color ?? '#cccccc',
        roughness: 0.6,
        metalness: 0.1,
      });
      if (glow) {
        material.emissive = new THREE.Color(glow.config?.color ?? obj.color ?? '#ffffff');
        material.emissiveIntensity = Number(glow.config?.intensity ?? 1);
      }
      node = new THREE.Mesh(makeGeometry(obj.geometry), material);
      if (glow) animated.push(node);
    }
    if (!node) continue;

    const [px, py, pz] = asTriple(obj.position, [0, 0, 0]);
    node.position.set(px, py, pz);
    if (obj.rotation) {
      const [rx, ry, rz] = asTriple(obj.rotation, [0, 0, 0]);
      node.rotation.set(toRad(rx), toRad(ry), toRad(rz));
    }
    if (obj.scale !== undefined && node.isMesh) {
      const [sx, sy, sz] = asTriple(obj.scale, [1, 1, 1]);
      node.scale.set(sx, sy, sz);
    }
    node.name = obj.name ?? '';
    threeScene.add(node);
  }

  if (!scene.objects.some((o) => o.type === 'ambient_light' || o.type === 'directional_light')) {
    threeScene.add(new THREE.HemisphereLight('#ffffff', '#444466', 1));
  }

  const loading = document.getElementById('loading');
  const fpsEl = document.getElementById('fps');
  let frames = 0;
  let fpsClock = performance.now();
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    for (const node of animated) node.rotation.y += dt * 0.6;
    controls.update();
    renderer.render(threeScene, camera);

    if (loading && !loading.classList.contains('hidden')) loading.classList.add('hidden');
    frames += 1;
    const now = performance.now();
    if (fpsEl && now - fpsClock >= 500) {
      fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsClock))} fps`;
      frames = 0;
      fpsClock = now;
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

main();
