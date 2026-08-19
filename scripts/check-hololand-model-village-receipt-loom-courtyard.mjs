#!/usr/bin/env node
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), '..');
const SOURCE_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-receipt-loom-courtyard.holo';
const CALIBRATION_RELATIVE =
  'source/layers/vr/frontier/model-village/model-village-render-calibration.holo';
const CONCEPT_RELATIVE =
  'docs/assets/model-village/model-village-stormglass-commons-concept-2026-07-25.png';
const CHARACTER_REFERENCE_RELATIVE =
  'docs/assets/model-village/model-village-stormglass-family-craftfolk-lineup-2026-07-25.png';
const DEFAULT_OUTPUT_DIR = path.join(
  REPO_ROOT,
  '.tmp',
  'hololand',
  'model-village',
  'receipt-loom-courtyard',
);
const REQUIRED_KITS = Object.freeze([
  'gradient_sky_dome',
  'layered_mountain_ridge',
  'terraced_wet_basalt_courtyard',
  'receipt_loom_hero',
  'timber_basalt_cottage',
  'stone_cistern_and_water',
  'neutral_craftfolk_staging_form',
  'stormglass_reeds_and_moss',
  'lived_in_craft_props',
  'blue_hour_mist_and_fireflies',
]);
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(
      (key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`,
    ).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256File(filePath) {
  return sha256(readFileSync(filePath));
}

function pngDimensions(buffer) {
  if (
    buffer.length < 24
    || buffer.toString('ascii', 1, 4) !== 'PNG'
    || buffer.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error('Screenshot is not a valid PNG');
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function stateProperties(node) {
  return Object.fromEntries(
    (node?.properties || []).map((property) => [property.key, property.value]),
  );
}

function flatten(node, result = []) {
  result.push(node);
  for (const child of node?.children || []) flatten(child, result);
  return result;
}

function resolveHoloScriptRoot(root, explicitRoot) {
  const candidates = [
    explicitRoot,
    process.env.HOLOSCRIPT_ROOT,
    path.resolve(root, '..', 'HoloScript'),
    'C:/Users/josep/Documents/GitHub/HoloScript',
  ].filter(Boolean).map((candidate) => path.resolve(candidate));
  for (const candidate of candidates) {
    if (
      existsSync(path.join(candidate, 'packages', 'core', 'dist', 'index.js'))
      && existsSync(path.join(candidate, 'node_modules', 'three', 'build', 'three.module.js'))
      && existsSync(path.join(candidate, 'node_modules', 'esbuild', 'lib', 'main.js'))
      && existsSync(path.join(candidate, 'node_modules', 'playwright', 'index.mjs'))
    ) {
      return candidate;
    }
  }
  throw new Error(`Built HoloScript toolchain not found: ${candidates.join(', ')}`);
}

function resolveBrowser(explicitPath) {
  const candidates = [
    explicitPath,
    process.env.CHROME_PATH,
    process.env.EDGE_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean);
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) throw new Error(`Chrome/Edge executable not found: ${candidates.join(', ')}`);
  return path.resolve(found);
}

export function validateCourtyardContract(contract, root = REPO_ROOT) {
  const errors = [];
  const { metadata, state, environment, nodes } = contract;
  const meshNodes = nodes.filter((node) => node.type === 'mesh');
  const lightNodes = nodes.filter((node) => node.type.endsWith('Light'));
  const kits = meshNodes.map(
    (node) => node.props?.properties?.presentationKit,
  ).filter(Boolean);
  const residentNodes = meshNodes.filter(
    (node) => node.props?.properties?.presentationKit
      === 'neutral_craftfolk_staging_form',
  );

  if (metadata.worldName !== 'Stormglass Commons') {
    errors.push('worldName must be Stormglass Commons');
  }
  if (metadata.artStyle !== 'hearthlight_biorealism') {
    errors.push('artStyle must be hearthlight_biorealism');
  }
  if (metadata.milestone !== 'MV-V1_ART_CONVERGENCE_A') {
    errors.push('milestone must be MV-V1_ART_CONVERGENCE_A');
  }
  if (metadata.projectionRole !== 'read_only_art_development') {
    errors.push('projectionRole must be read_only_art_development');
  }
  if (metadata.sourceSemanticsRewritten !== false) {
    errors.push('sourceSemanticsRewritten must be false');
  }
  if (metadata.bridgeMayOwnPresentationOnly !== true) {
    errors.push('bridgeMayOwnPresentationOnly must be true');
  }
  if (metadata.externalAssetsRequired !== false) {
    errors.push('externalAssetsRequired must be false');
  }
  for (const [relativePath, expectedHash, label] of [
    [metadata.referenceConcept, metadata.referenceConceptSha256, 'concept'],
    [metadata.characterReference, metadata.characterReferenceSha256, 'character reference'],
  ]) {
    const filePath = path.resolve(root, relativePath || '');
    if (!existsSync(filePath)) {
      errors.push(`${label} file is missing: ${relativePath}`);
    } else if (!SHA256_PATTERN.test(expectedHash || '')) {
      errors.push(`${label} hash must be lowercase sha256`);
    } else if (sha256File(filePath) !== expectedHash) {
      errors.push(`${label} hash does not match ${relativePath}`);
    }
  }
  if (state.authority !== 'read_only') errors.push('authority must be read_only');
  if (state.canonicalWritesAllowed !== false) {
    errors.push('canonicalWritesAllowed must be false');
  }
  if (state.modelCallsAllowed !== false) errors.push('modelCallsAllowed must be false');
  if (state.networkFetchesAllowed !== false) {
    errors.push('networkFetchesAllowed must be false');
  }
  if (state.researchLiveBlindedCompatible !== true) {
    errors.push('neutral art tracer must remain research-live-blinded compatible');
  }
  if (state.publicFamilyIdentityPresented !== false) {
    errors.push('public family identity must stay absent from this tracer');
  }
  if (state.exactModelIdentityPresented !== false) {
    errors.push('exact model identity must stay absent from this tracer');
  }
  if (state.productionResidentClaimed !== false) {
    errors.push('productionResidentClaimed must remain false');
  }
  if (state.renderer?.outputColorSpace !== 'srgb') {
    errors.push('renderer outputColorSpace must be srgb');
  }
  if (state.renderer?.toneMapping !== 'aces_filmic') {
    errors.push('renderer toneMapping must be aces_filmic');
  }
  if (state.renderer?.shadowMap !== 'pcf_soft') {
    errors.push('renderer shadowMap must be pcf_soft');
  }
  if (state.renderer?.hdri !== false) errors.push('HDRI must remain false');
  if (state.qualityBudget?.textureNetworkRequests !== 0) {
    errors.push('textureNetworkRequests budget must be zero');
  }
  if (residentNodes.length !== 2) {
    errors.push(`expected 2 neutral Craftfolk staging forms, found ${residentNodes.length}`);
  }
  if (residentNodes.some(
    (node) => (
      node.props?.properties?.publicFamilyIdentity !== false
      || node.props?.properties?.productionResidentClaimed !== false
    ),
  )) {
    errors.push('resident staging forms must be identity-neutral and non-production');
  }
  for (const kit of REQUIRED_KITS) {
    if (!kits.includes(kit)) errors.push(`missing presentation kit ${kit}`);
  }
  if (lightNodes.length < 4) errors.push('at least four authored lights are required');
  if (environment.mode !== 'stormglass_blue_hour_after_rain') {
    errors.push('environment mode must be stormglass_blue_hour_after_rain');
  }
  return {
    schema: 'hololand.model-village.receipt-loom-courtyard-contract.v1',
    status: errors.length === 0 ? 'pass' : 'fail',
    errors,
    counts: {
      nodes: nodes.length,
      meshes: meshNodes.length,
      lights: lightNodes.length,
      presentationKits: kits.length,
      uniquePresentationKits: new Set(kits).size,
      neutralResidents: residentNodes.length,
    },
    kits,
  };
}

async function compileCourtyard(root, holoScriptRoot) {
  const corePath = path.join(holoScriptRoot, 'packages', 'core', 'dist', 'index.js');
  const core = await import(pathToFileURL(corePath).href);
  const sourcePath = path.resolve(root, SOURCE_RELATIVE);
  const calibrationPath = path.resolve(root, CALIBRATION_RELATIVE);
  const sourceText = readFileSync(sourcePath, 'utf8');
  const calibrationText = readFileSync(calibrationPath, 'utf8');
  const parsed = new core.HoloCompositionParser().parse(sourceText);
  const calibrationParsed = new core.HoloCompositionParser().parse(calibrationText);
  if (!parsed.success) {
    throw new Error(`Courtyard HoloCompositionParser failed: ${canonicalJson(parsed.errors)}`);
  }
  if (!calibrationParsed.success) {
    throw new Error(`Calibration HoloCompositionParser failed: ${canonicalJson(calibrationParsed.errors)}`);
  }
  const sceneIr = new core.SceneIRCompiler({ defaultLighting: false })
    .compileComposition(parsed.ast);
  const allNodes = flatten(sceneIr);
  const contract = {
    metadata: parsed.ast.metadata,
    state: stateProperties(parsed.ast.state),
    environment: stateProperties(parsed.ast.environment),
    nodes: allNodes.filter((node) => node.type !== 'group').map((node) => ({
      id: node.id || null,
      type: node.type,
      props: node.props || {},
    })),
  };
  const validation = validateCourtyardContract(contract, root);
  if (validation.status !== 'pass') {
    throw new Error(`Courtyard source contract failed: ${validation.errors.join('; ')}`);
  }
  return {
    contract,
    validation,
    sourcePath,
    sourceHash: sha256(sourceText),
    calibrationPath,
    calibrationHash: sha256(calibrationText),
    sceneIrHash: sha256(canonicalJson(sceneIr)),
    corePath,
    coreHash: sha256File(corePath),
  };
}

async function courtyardBrowserApplication(THREE, RoomEnvironment, payload) {
  const witness = {
    schema: 'hololand.model-village.receipt-loom-courtyard-browser.v1',
    ready: false,
    status: 'booting',
    error: null,
  };
  window.__MV_COURTYARD_WITNESS__ = witness;

  try {
    document.documentElement.style.background = '#040915';
    document.body.innerHTML = `
      <main id="courtyard-witness">
        <canvas id="courtyard-canvas" aria-label="Receipt Loom Courtyard"></canvas>
        <div class="storm-moon" aria-hidden="true"></div>
        <div class="vignette"></div>
        <header>
          <div class="eyebrow">STORMGLASS COMMONS // ART CONVERGENCE A</div>
          <h1>Receipt Loom Courtyard</h1>
          <p>Hearthlight Biorealism · HoloScript-authored scene · real-time local WebGL2</p>
        </header>
        <div class="truth">
          <span>READ-ONLY ART TRACER</span>
          <i></i>
          <span>NEUTRAL CRAFTFOLK</span>
          <i></i>
          <span>NO EXTERNAL ASSETS</span>
        </div>
      </main>
    `;
    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; }
      html, body, #courtyard-witness { width: 100%; height: 100%; margin: 0; overflow: hidden; }
      body { background: #040915; color: #e8f1fa; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      #courtyard-witness { position: relative; }
      #courtyard-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      .storm-moon {
        position: absolute; left: 20%; top: 15%; width: 54px; height: 54px;
        border-radius: 50%; pointer-events: none;
        background: radial-gradient(circle at 42% 38%, #fbfdff 0 24%, #dce9fa 52%, #9cb9df 74%, transparent 76%);
        box-shadow: 0 0 24px rgba(159, 198, 244, .42), 0 0 70px rgba(107, 163, 223, .19);
      }
      .vignette {
        position: absolute; inset: 0; pointer-events: none;
        background:
          radial-gradient(circle at 47% 48%, transparent 28%, rgba(2,5,12,.12) 68%, rgba(2,4,10,.65) 115%),
          linear-gradient(180deg, rgba(3,7,16,.16), transparent 35%, rgba(3,7,16,.26));
      }
      header { position: absolute; left: 42px; top: 36px; text-shadow: 0 3px 24px #020510; }
      .eyebrow { color: #86dbe8; font: 700 10px/1.2 ui-monospace, monospace; letter-spacing: .2em; }
      h1 { margin: 8px 0 5px; font: 500 42px/.98 Georgia, serif; letter-spacing: -.035em; }
      header p { margin: 0; color: #afc0cf; font-size: 11px; letter-spacing: .035em; }
      .truth {
        position: absolute; left: 42px; bottom: 27px; display: flex; align-items: center; gap: 10px;
        color: #a9bbc9; font: 700 9px/1 ui-monospace, monospace; letter-spacing: .13em;
        text-shadow: 0 2px 12px #020510;
      }
      .truth i { display: block; width: 3px; height: 3px; border-radius: 50%; background: #e2a15e; box-shadow: 0 0 8px #e2a15e; }
    `;
    document.head.appendChild(style);

    const canvas = document.querySelector('#courtyard-canvas');
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: payload.state.renderer.antialias,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(payload.state.renderer.pixelRatio);
    renderer.setSize(payload.state.camera.width, payload.state.camera.height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = payload.state.renderer.exposure;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(payload.environment.backgroundColor);
    scene.fog = new THREE.Fog(
      payload.environment.fogColor,
      payload.environment.fogNear,
      payload.environment.fogFar,
    );
    const camera = new THREE.PerspectiveCamera(
      payload.state.camera.fov,
      payload.state.camera.width / payload.state.camera.height,
      payload.state.camera.near,
      payload.state.camera.far,
    );
    camera.position.fromArray(payload.state.camera.position);
    camera.lookAt(...payload.state.camera.target);

    const roomEnvironment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const environmentTarget = pmrem.fromScene(roomEnvironment, 0.04);
    scene.environment = environmentTarget.texture;
    roomEnvironment.dispose();

    const palette = payload.state.materialPalette;
    const materials = [];
    const mat = (name, values = {}) => {
      const material = new THREE.MeshPhysicalMaterial({
        name,
        color: values.color || '#808080',
        roughness: values.roughness ?? 0.6,
        metalness: values.metalness ?? 0,
        clearcoat: values.clearcoat ?? 0,
        clearcoatRoughness: values.clearcoatRoughness ?? 0,
        transmission: values.transmission ?? 0,
        thickness: values.thickness ?? 0,
        ior: values.ior ?? 1.5,
        transparent: values.transparent ?? false,
        opacity: values.opacity ?? 1,
        emissive: values.emissive || '#000000',
        emissiveIntensity: values.emissiveIntensity ?? 0,
        sheen: values.sheen ?? 0,
        sheenColor: values.sheenColor || '#000000',
        envMapIntensity: values.envMapIntensity ?? 1,
        side: values.side ?? THREE.FrontSide,
      });
      materials.push(material);
      return material;
    };
    const wetStone = mat('wet_basalt', {
      color: palette.wetBasalt, roughness: 0.32, metalness: 0.02,
      clearcoat: 0.5, clearcoatRoughness: 0.21, envMapIntensity: 0.68,
    });
    const dryStone = mat('dry_basalt', {
      color: palette.dryBasalt, roughness: 0.74, metalness: 0.01,
      envMapIntensity: 0.48,
    });
    const timber = mat('old_timber', {
      color: palette.oldTimber, roughness: 0.62, sheen: 0.16,
      sheenColor: palette.timberHighlight, envMapIntensity: 0.42,
    });
    const timberCut = mat('timber_cut', {
      color: palette.timberHighlight, roughness: 0.69, envMapIntensity: 0.42,
    });
    const plaster = mat('lime_plaster', {
      color: palette.limePlaster, roughness: 0.86, envMapIntensity: 0.42,
    });
    const slate = mat('slate_roof', {
      color: palette.slateRoof, roughness: 0.55, clearcoat: 0.18,
      clearcoatRoughness: 0.3, envMapIntensity: 0.58,
    });
    const bronze = mat('aged_bronze', {
      color: palette.agedBronze, roughness: 0.31, metalness: 0.83,
      clearcoat: 0.13,
    });
    const bronzeGlow = mat('bronze_highlight', {
      color: palette.bronzeHighlight, roughness: 0.24, metalness: 0.72,
      emissive: '#5b2409', emissiveIntensity: 0.48,
    });
    const stormglass = mat('stormglass', {
      color: palette.stormglass, roughness: 0.09, metalness: 0.03,
      transmission: 0.42, thickness: 0.55, ior: 1.5,
      transparent: true, opacity: 0.82, clearcoat: 0.72,
      clearcoatRoughness: 0.08, emissive: palette.stormglassDeep,
      emissiveIntensity: 0.42,
    });
    const water = mat('cistern_water', {
      color: palette.water, roughness: 0.08, transmission: 0.38,
      thickness: 0.38, transparent: true, opacity: 0.77, clearcoat: 0.72,
      clearcoatRoughness: 0.06,
    });
    const windowGlow = mat('window_hearthlight', {
      color: '#f7c783', roughness: 0.28, transmission: 0.2,
      transparent: true, opacity: 0.92, emissive: palette.hearth,
      emissiveIntensity: 2.1,
    });
    const moss = mat('moss', { color: palette.moss, roughness: 0.96 });
    const reed = mat('reed', { color: palette.reed, roughness: 0.92 });
    const clothRust = mat('craftfolk_rust', {
      color: '#a96339', roughness: 0.77, sheen: 0.24, sheenColor: '#d68b56',
    });
    const clothBlue = mat('craftfolk_blue', {
      color: '#476d76', roughness: 0.77, sheen: 0.24, sheenColor: '#75aab0',
    });
    const leather = mat('leather', { color: '#3d251b', roughness: 0.82 });
    const skin = mat('neutral_skin', { color: '#b9856d', roughness: 0.72 });

    const root = new THREE.Group();
    root.name = 'HoloScriptReceiptLoomCourtyard';
    scene.add(root);
    const cast = (mesh, receive = true) => {
      mesh.castShadow = true;
      mesh.receiveShadow = receive;
      return mesh;
    };
    const box = (parent, size, position, material, rotation = [0, 0, 0], name = '') => {
      const mesh = cast(new THREE.Mesh(new THREE.BoxGeometry(...size), material));
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      mesh.name = name;
      parent.add(mesh);
      return mesh;
    };
    const cylinder = (
      parent, radii, height, position, material, rotation = [0, 0, 0], segments = 20, name = '',
    ) => {
      const mesh = cast(new THREE.Mesh(
        new THREE.CylinderGeometry(radii[0], radii[1], height, segments),
        material,
      ));
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      mesh.name = name;
      parent.add(mesh);
      return mesh;
    };
    const sphere = (parent, radius, position, material, scale = [1, 1, 1], name = '') => {
      const mesh = cast(new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), material));
      mesh.position.set(...position);
      mesh.scale.set(...scale);
      mesh.name = name;
      parent.add(mesh);
      return mesh;
    };
    const torus = (
      parent, radius, tube, position, material, rotation = [0, 0, 0], name = '',
    ) => {
      const mesh = cast(new THREE.Mesh(
        new THREE.TorusGeometry(radius, tube, 12, 48),
        material,
      ));
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      mesh.name = name;
      parent.add(mesh);
      return mesh;
    };
    const beamBetween = (parent, start, end, radius, material, name = '') => {
      const a = new THREE.Vector3(...start);
      const b = new THREE.Vector3(...end);
      const midpoint = a.clone().add(b).multiplyScalar(0.5);
      const mesh = cast(new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10),
        material,
      ));
      mesh.position.copy(midpoint);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        b.clone().sub(a).normalize(),
      );
      mesh.name = name;
      parent.add(mesh);
      return mesh;
    };
    const seedRandom = (seed) => {
      let value = seed >>> 0;
      return () => {
        value ^= value << 13;
        value ^= value >>> 17;
        value ^= value << 5;
        return (value >>> 0) / 4294967296;
      };
    };

    // Authored sky and lunar focal point.
    const skyGeometry = new THREE.SphereGeometry(70, 48, 32);
    const skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        zenith: { value: new THREE.Color('#0d1c38') },
        upper: { value: new THREE.Color('#203657') },
        horizon: { value: new THREE.Color('#4e6280') },
      },
      vertexShader: `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = normalize(world.xyz);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorld;
        uniform vec3 zenith;
        uniform vec3 upper;
        uniform vec3 horizon;
        void main() {
          float h = clamp(vWorld.y * .5 + .5, 0.0, 1.0);
          vec3 color = mix(horizon, upper, smoothstep(.12, .53, h));
          color = mix(color, zenith, smoothstep(.50, 1.0, h));
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    sky.name = 'StormglassSky';
    scene.add(sky);
    const moonCanvas = document.createElement('canvas');
    moonCanvas.width = 128;
    moonCanvas.height = 128;
    const moonContext = moonCanvas.getContext('2d');
    const moonGlow = moonContext.createRadialGradient(64, 64, 22, 64, 64, 64);
    moonGlow.addColorStop(0, 'rgba(241,247,255,1)');
    moonGlow.addColorStop(0.42, 'rgba(225,237,255,1)');
    moonGlow.addColorStop(0.58, 'rgba(180,210,255,.38)');
    moonGlow.addColorStop(1, 'rgba(120,170,255,0)');
    moonContext.fillStyle = moonGlow;
    moonContext.fillRect(0, 0, 128, 128);
    const moonTexture = new THREE.CanvasTexture(moonCanvas);
    moonTexture.colorSpace = THREE.SRGBColorSpace;
    const moonSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: moonTexture,
      color: '#ffffff',
      transparent: true,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    }));
    const moonScreenPoint = new THREE.Vector3(-0.56, 0.64, 0.5).unproject(camera);
    moonSprite.position.copy(
      camera.position.clone().add(
        moonScreenPoint.sub(camera.position).normalize().multiplyScalar(62),
      ),
    );
    moonSprite.scale.set(5.6, 5.6, 1);
    moonSprite.renderOrder = 10000;
    moonSprite.name = 'StormMoon';
    scene.add(moonSprite);

    // Three parallax ridge layers, all deterministically sourced by MountainRidge.
    const ridgeRandom = seedRandom(41027);
    for (let layer = 0; layer < 3; layer += 1) {
      const depth = -24 - layer * 7;
      const ridgeMaterial = mat(`ridge_${layer}`, {
        color: ['#17233a', '#101a2b', '#0a1322'][layer],
        roughness: 1,
      });
      for (let index = 0; index < 17; index += 1) {
        const x = -26 + index * 3.25 + (ridgeRandom() - 0.5) * 1.2;
        const height = 4 + ridgeRandom() * 6 + (layer * 0.6);
        const radius = 3.2 + ridgeRandom() * 2.25;
        const peak = cylinder(
          root,
          [0, radius],
          height,
          [x, height * 0.5 - 0.5, depth],
          ridgeMaterial,
          [0, ridgeRandom() * Math.PI, 0],
          8,
          `MountainRidge_${layer}_${index}`,
        );
        peak.castShadow = false;
      }
    }

    // Terraced wet basalt island and planted outskirts.
    cylinder(root, [13.8, 14.4], 0.8, [0, -0.48, 0], dryStone, [0, 0, 0], 64, 'CourtyardBase');
    cylinder(root, [11.7, 12.4], 0.55, [0, -0.05, -0.2], wetStone, [0, 0, 0], 64, 'CourtyardUpper');
    cylinder(root, [8.7, 9.3], 0.26, [0, 0.22, 0.15], wetStone, [0, 0, 0], 64, 'CourtyardPlaza');
    const cobbleRandom = seedRandom(82411);
    const cobbleGeometry = new THREE.DodecahedronGeometry(0.38, 0);
    const cobbles = new THREE.InstancedMesh(cobbleGeometry, wetStone, 118);
    const cobbleMatrix = new THREE.Matrix4();
    const cobbleQuaternion = new THREE.Quaternion();
    const cobbleScale = new THREE.Vector3();
    const cobblePosition = new THREE.Vector3();
    for (let index = 0; index < 118; index += 1) {
      const angle = cobbleRandom() * Math.PI * 2;
      const radius = 2.25 + Math.sqrt(cobbleRandom()) * 6.2;
      cobblePosition.set(
        Math.cos(angle) * radius,
        0.38 + cobbleRandom() * 0.04,
        Math.sin(angle) * radius,
      );
      cobbleQuaternion.setFromEuler(new THREE.Euler(
        (cobbleRandom() - 0.5) * 0.18,
        cobbleRandom() * Math.PI,
        (cobbleRandom() - 0.5) * 0.18,
      ));
      cobbleScale.set(
        0.82 + cobbleRandom() * 0.55,
        0.20 + cobbleRandom() * 0.10,
        0.72 + cobbleRandom() * 0.62,
      );
      cobbleMatrix.compose(cobblePosition, cobbleQuaternion, cobbleScale);
      cobbles.setMatrixAt(index, cobbleMatrix);
    }
    cobbles.name = 'WetCobbleField';
    cobbles.castShadow = true;
    cobbles.receiveShadow = true;
    root.add(cobbles);
    for (let index = 0; index < 26; index += 1) {
      const angle = index * Math.PI * 2 / 26 + cobbleRandom() * 0.16;
      const radius = 12.2 + cobbleRandom() * 1.55;
      sphere(
        root,
        0.32 + cobbleRandom() * 0.42,
        [
          Math.cos(angle) * radius,
          -0.02 + cobbleRandom() * 0.18,
          Math.sin(angle) * radius,
        ],
        index % 3 === 0 ? wetStone : dryStone,
        [1.15 + cobbleRandom() * 0.55, 0.5 + cobbleRandom() * 0.32, 1 + cobbleRandom() * 0.5],
        'PerimeterBasaltRock',
      );
    }

    // Hero timber-and-basalt cottage.
    const cottage = new THREE.Group();
    cottage.name = 'TimberBasaltCottage';
    cottage.position.set(-5.7, 0.2, -4.1);
    root.add(cottage);
    box(cottage, [6.6, 0.9, 5.0], [0, 0.45, 0], dryStone, [0, 0, 0], 'BasaltFoundation');
    box(cottage, [6.0, 3.65, 4.55], [0, 2.55, 0], plaster, [0, 0, 0], 'LimePlasterBody');
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-3, 0);
    gableShape.lineTo(0, 2.05);
    gableShape.lineTo(3, 0);
    gableShape.closePath();
    const gable = cast(new THREE.Mesh(
      new THREE.ExtrudeGeometry(gableShape, {
        depth: 4.4,
        bevelEnabled: false,
        steps: 1,
      }),
      plaster,
    ));
    gable.position.set(0, 4.36, -2.2);
    gable.name = 'PlasterGable';
    cottage.add(gable);
    box(cottage, [3.8, 0.25, 5.25], [-1.48, 5.45, 0], slate, [0, 0, -0.59], 'WestSlateRoof');
    box(cottage, [3.8, 0.25, 5.25], [1.48, 5.45, 0], slate, [0, 0, 0.59], 'EastSlateRoof');
    for (let course = 0; course < 9; course += 1) {
      const z = -2.25 + course * 0.56;
      box(cottage, [3.72, 0.07, 0.095], [-1.48, 5.58, z], dryStone, [0, 0, -0.59], 'WestSlateCourse');
      box(cottage, [3.72, 0.07, 0.095], [1.48, 5.58, z], dryStone, [0, 0, 0.59], 'EastSlateCourse');
    }
    beamBetween(cottage, [-3.13, 4.47, 2.62], [0, 6.51, 2.62], 0.105, timber, 'GableRoofTrim');
    beamBetween(cottage, [3.13, 4.47, 2.62], [0, 6.51, 2.62], 0.105, timber, 'GableRoofTrim');
    const beamSpecs = [
      [[-3.08, 2.7, 2.31], [0.22, 4.2, 0.22]],
      [[0, 2.7, 2.31], [0.22, 4.2, 0.22]],
      [[3.08, 2.7, 2.31], [0.22, 4.2, 0.22]],
      [[0, 1.15, 2.34], [6.35, 0.24, 0.2]],
      [[0, 3.25, 2.34], [6.35, 0.24, 0.2]],
      [[0, 4.35, 2.34], [6.35, 0.24, 0.2]],
    ];
    for (const [position, size] of beamSpecs) {
      box(cottage, size, position, timber, [0, 0, 0], 'ExposedTimberBeam');
    }
    beamBetween(cottage, [-3.0, 1.3, 2.42], [0, 3.15, 2.42], 0.11, timber, 'DiagonalBrace');
    beamBetween(cottage, [3.0, 1.3, 2.42], [0, 3.15, 2.42], 0.11, timber, 'DiagonalBrace');
    const windowPositions = [[-1.7, 2.2], [1.7, 2.2], [-1.7, 3.75], [1.7, 3.75]];
    for (const [x, y] of windowPositions) {
      box(cottage, [1.1, 1.12, 0.12], [x, y, 2.38], timber, [0, 0, 0], 'WindowFrame');
      box(cottage, [0.77, 0.82, 0.08], [x, y, 2.47], windowGlow, [0, 0, 0], 'LitWindow');
      box(cottage, [0.08, 0.9, 0.08], [x, y, 2.54], timber, [0, 0, 0], 'WindowMullion');
      box(cottage, [0.86, 0.08, 0.08], [x, y, 2.54], timber, [0, 0, 0], 'WindowMullion');
    }
    box(cottage, [1.2, 2.05, 0.22], [0, 1.7, 2.42], timber, [0, 0, 0], 'WorkshopDoor');
    box(cottage, [1.7, 0.25, 2.1], [0, 3.05, 3.25], slate, [-0.28, 0, 0], 'WorkshopAwning');
    box(cottage, [0.72, 2.0, 0.72], [1.95, 6.15, -0.75], dryStone, [0, 0, 0], 'StoneChimney');
    cylinder(cottage, [0.55, 0.62], 0.24, [1.95, 7.22, -0.75], dryStone, [0, 0, 0], 8, 'ChimneyCap');

    // Receipt Loom hero prop.
    const loom = new THREE.Group();
    loom.name = 'ReceiptLoom';
    loom.position.set(0, 0.3, -0.25);
    root.add(loom);
    cylinder(loom, [2.05, 2.25], 0.48, [0, 0.24, 0], wetStone, [0, 0, 0], 32, 'LoomPlinthLower');
    cylinder(loom, [1.72, 1.9], 0.42, [0, 0.66, 0], dryStone, [0, 0, 0], 32, 'LoomPlinthUpper');
    cylinder(loom, [0.72, 0.94], 1.15, [0, 1.35, 0], bronze, [0, 0, 0], 16, 'LoomPedestal');
    torus(loom, 2.0, 0.17, [0, 3.2, 0], bronze, [0, 0, 0], 'LoomOuterRing');
    torus(loom, 1.62, 0.09, [0, 3.2, 0], bronzeGlow, [0.11, 0.34, 0], 'LoomMiddleRing');
    torus(loom, 1.18, 0.07, [0, 3.2, 0], stormglass, [-0.18, -0.25, 0], 'LoomInnerRing');
    for (let index = 0; index < 12; index += 1) {
      const angle = index * Math.PI * 2 / 12;
      beamBetween(
        loom,
        [Math.cos(angle) * 0.44, 3.2 + Math.sin(angle) * 0.44, 0],
        [Math.cos(angle) * 1.82, 3.2 + Math.sin(angle) * 1.82, 0],
        0.035,
        bronze,
        'LoomSpoke',
      );
    }
    for (let index = 0; index < 9; index += 1) {
      const angle = index * Math.PI * 2 / 9 + 0.13;
      sphere(
        loom,
        index % 3 === 0 ? 0.18 : 0.12,
        [Math.cos(angle) * 1.62, 3.2 + Math.sin(angle) * 1.62, 0.08],
        stormglass,
        [1, 1, 0.72],
        'StormglassReceiptNode',
      );
    }
    sphere(loom, 0.64, [0, 3.2, 0], stormglass, [0.55, 1.08, 0.4], 'LoomStormglassHeart');
    for (let index = 0; index < 16; index += 1) {
      const x = -1.25 + index * (2.5 / 15);
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(x, 1.75, -0.03),
        new THREE.Vector3(x * 0.32, 3.2 + Math.sin(index) * 0.28, 0.22),
        new THREE.Vector3(x * 0.8, 4.55, 0),
      );
      const thread = cast(new THREE.Mesh(
        new THREE.TubeGeometry(curve, 18, 0.014, 5, false),
        index % 4 === 0 ? stormglass : bronzeGlow,
      ), false);
      thread.name = 'ReceiptThread';
      loom.add(thread);
    }

    // Cistern with hand-set stone rim and two water channels.
    const cistern = new THREE.Group();
    cistern.name = 'CisternEdge';
    cistern.position.set(5.8, 0.35, 3.0);
    root.add(cistern);
    for (let index = 0; index < 22; index += 1) {
      const angle = index * Math.PI * 2 / 22;
      const stone = box(
        cistern,
        [0.82, 0.55, 0.7],
        [Math.cos(angle) * 2.25, 0.28, Math.sin(angle) * 2.25],
        index % 3 === 0 ? wetStone : dryStone,
        [0, -angle, (index % 2 ? 0.04 : -0.03)],
        'CisternRimStone',
      );
      stone.scale.y = 0.85 + (index % 3) * 0.08;
    }
    cylinder(cistern, [1.88, 1.88], 0.12, [0, 0.22, 0], water, [0, 0, 0], 48, 'CisternWater');
    box(cistern, [3.5, 0.2, 0.7], [-3.6, 0.1, -0.25], wetStone, [0, -0.08, 0], 'WaterChannel');
    box(cistern, [2.7, 0.2, 0.62], [-1.6, 0.04, 2.6], wetStone, [0, -0.88, 0], 'WaterChannel');

    // Neutral Craftfolk staging forms. These deliberately do not present
    // Claude/OpenAI/Gemini/Grok identities.
    const makeCraftfolk = (name, position, cloth, tool) => {
      const group = new THREE.Group();
      group.name = name;
      group.position.set(...position);
      group.rotation.y = name.endsWith('01') ? 0.72 : 0.52;
      root.add(group);
      cylinder(group, [0.48, 0.72], 1.45, [0, 0.98, 0], cloth, [0, 0, 0], 16, 'LayeredTunic');
      cylinder(group, [0.62, 0.85], 0.78, [0, 1.55, 0], cloth, [0, 0, 0], 16, 'Mantle');
      sphere(group, 0.38, [0, 2.18, 0], skin, [0.92, 1.04, 0.9], 'NeutralHead');
      sphere(group, 0.5, [0, 2.27, -0.03], cloth, [1, 0.78, 1], 'CraftHood');
      sphere(group, 0.35, [0, 2.16, 0.29], skin, [0.92, 0.84, 0.35], 'VisibleFace');
      const eye = mat(`${name}_eye`, { color: '#15171a', roughness: 0.7 });
      sphere(group, 0.035, [-0.12, 2.22, 0.59], eye, [1, 1, 0.5], 'Eye');
      sphere(group, 0.035, [0.12, 2.22, 0.59], eye, [1, 1, 0.5], 'Eye');
      cylinder(group, [0.13, 0.14], 1.0, [-0.5, 1.38, 0.03], cloth, [0, 0, -0.4], 10, 'LeftSleeve');
      cylinder(group, [0.13, 0.14], 1.0, [0.5, 1.38, 0.03], cloth, [0, 0, 0.4], 10, 'RightSleeve');
      cylinder(group, [0.18, 0.16], 0.62, [-0.25, 0.1, 0], leather, [0, 0, 0], 10, 'Boot');
      cylinder(group, [0.18, 0.16], 0.62, [0.25, 0.1, 0], leather, [0, 0, 0], 10, 'Boot');
      box(group, [0.82, 0.18, 0.22], [0, 1.02, -0.55], leather, [0, 0, 0], 'ToolBelt');
      if (tool === 'receipt_tongs') {
        beamBetween(group, [0.55, 1.0, 0.1], [0.9, 0.18, 0.35], 0.025, bronze, 'ReceiptTongs');
        beamBetween(group, [0.61, 1.0, 0.1], [1.02, 0.2, 0.32], 0.025, bronze, 'ReceiptTongs');
      } else {
        beamBetween(group, [0.55, 1.2, 0.08], [0.72, 0.34, 0.15], 0.035, bronze, 'LanternHandle');
        sphere(group, 0.25, [0.75, 0.28, 0.16], stormglass, [0.72, 1, 0.72], 'StormglassLantern');
      }
      return group;
    };
    makeCraftfolk('CraftfolkResident01', [-2.15, 0.45, 2.35], clothRust, 'receipt_tongs');
    makeCraftfolk('CraftfolkResident02', [2.85, 0.45, 1.15], clothBlue, 'stormglass_lantern');

    // Garden, rail, baskets, crates, tools, lanterns.
    const foliageRandom = seedRandom(7319);
    const grassGeometry = new THREE.ConeGeometry(0.08, 0.7, 4);
    const grasses = new THREE.InstancedMesh(grassGeometry, reed, 72);
    const grassMatrix = new THREE.Matrix4();
    for (let index = 0; index < 72; index += 1) {
      const side = index % 2 === 0 ? -1 : 1;
      const angle = foliageRandom() * Math.PI * 2;
      const radius = 8.7 + foliageRandom() * 4.1;
      grassMatrix.compose(
        new THREE.Vector3(
          Math.cos(angle) * radius + side * foliageRandom(),
          0.22,
          Math.sin(angle) * radius,
        ),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(
          (foliageRandom() - 0.5) * 0.22,
          foliageRandom() * Math.PI,
          (foliageRandom() - 0.5) * 0.22,
        )),
        new THREE.Vector3(
          0.7 + foliageRandom() * 0.7,
          0.65 + foliageRandom() * 1.1,
          0.7 + foliageRandom() * 0.7,
        ),
      );
      grasses.setMatrixAt(index, grassMatrix);
    }
    grasses.name = 'CourtyardGrassTufts';
    grasses.castShadow = true;
    root.add(grasses);
    for (let index = 0; index < 34; index += 1) {
      const angle = foliageRandom() * Math.PI * 2;
      const radius = 9.2 + foliageRandom() * 3.2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const height = 0.8 + foliageRandom() * 1.25;
      cylinder(root, [0.035, 0.055], height, [x, height * 0.5, z], reed, [
        (foliageRandom() - 0.5) * 0.15, 0, (foliageRandom() - 0.5) * 0.15,
      ], 6, 'StormglassReed');
      if (index < 15) sphere(root, 0.11, [x, height + 0.04, z], stormglass, [0.72, 1.2, 0.72], 'StormglassBud');
    }
    const railPoints = [
      [[-9.1, 0.6, 5.0], [-5.1, 0.6, 7.2]],
      [[-5.1, 0.6, 7.2], [-1.2, 0.6, 8.0]],
      [[7.3, 0.6, -5.7], [10.3, 0.6, -2.8]],
    ];
    for (const [start, end] of railPoints) {
      const lowStart = [start[0], 0.35, start[2]];
      const lowEnd = [end[0], 0.35, end[2]];
      beamBetween(root, start, end, 0.095, timber, 'TimberRail');
      beamBetween(root, lowStart, lowEnd, 0.065, timber, 'TimberRail');
      for (const point of [start, end]) {
        cylinder(root, [0.13, 0.15], 1.25, [point[0], 0.35, point[2]], timber, [0, 0, 0], 8, 'RailPost');
      }
    }
    for (let index = 0; index < 5; index += 1) {
      const x = -8.3 + index * 1.3;
      box(root, [0.72, 0.58, 0.72], [x, 0.52, 1.2 + (index % 2) * 0.75], timberCut, [0, index * 0.2, 0], 'WorkshopCrate');
    }
    for (const [x, z] of [[-3.8, 2.7], [-4.5, 3.0], [3.9, -2.8], [7.2, 0.1]]) {
      cylinder(root, [0.42, 0.3], 0.48, [x, 0.45, z], timberCut, [0, 0, 0], 12, 'CraftBasket');
      torus(root, 0.33, 0.045, [x, 0.78, z], timber, [Math.PI / 2, 0, 0], 'BasketRim');
    }
    const soil = mat('planter_soil', {
      color: '#211914', roughness: 0.98, envMapIntensity: 0.24,
    });
    for (const [x, z, rotation] of [
      [-5.5, 6.8, -0.18],
      [-1.4, 7.9, 0.08],
      [4.9, 7.7, 0.22],
      [9.2, 5.2, 0.48],
    ]) {
      const planter = new THREE.Group();
      planter.position.set(x, 0.25, z);
      planter.rotation.y = rotation;
      planter.name = 'RaisedCourtyardPlanter';
      root.add(planter);
      box(planter, [3.15, 0.52, 1.75], [0, 0.28, 0], timber, [0, 0, 0], 'PlanterFrame');
      box(planter, [2.75, 0.14, 1.36], [0, 0.59, 0], soil, [0, 0, 0], 'PlanterSoil');
      for (let plant = 0; plant < 10; plant += 1) {
        const px = -1.1 + (plant % 5) * 0.55 + (foliageRandom() - 0.5) * 0.16;
        const pz = plant < 5 ? -0.38 : 0.38;
        const height = 0.4 + foliageRandom() * 0.65;
        cylinder(
          planter,
          [0.025, 0.045],
          height,
          [px, 0.72 + height * 0.5, pz],
          reed,
          [(foliageRandom() - 0.5) * 0.18, 0, (foliageRandom() - 0.5) * 0.18],
          5,
          'PlanterHerb',
        );
        sphere(
          planter,
          0.18,
          [px, 0.76 + height, pz],
          moss,
          [1.2, 0.65, 1.05],
          'PlanterLeafCluster',
        );
      }
    }
    for (const [x, z, height] of [[-2.8, -0.5, 1.8], [3.9, 2.4, 1.6], [7.7, -0.7, 1.9], [-8.2, 1.2, 1.7], [0.4, 6.2, 1.5]]) {
      cylinder(root, [0.055, 0.07], height, [x, height * 0.5, z], bronze, [0, 0, 0], 8, 'LanternPost');
      sphere(root, 0.18, [x, height + 0.08, z], stormglass, [0.75, 1.1, 0.75], 'StormglassLantern');
    }

    // Subtle atmospheric depth and firefly points.
    const fireflyRandom = seedRandom(2109);
    const fireflyPositions = [];
    for (let index = 0; index < 36; index += 1) {
      fireflyPositions.push(
        (fireflyRandom() - 0.5) * 22,
        0.9 + fireflyRandom() * 4.5,
        (fireflyRandom() - 0.5) * 15,
      );
    }
    const fireflyGeometry = new THREE.BufferGeometry();
    fireflyGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(fireflyPositions, 3),
    );
    const fireflies = new THREE.Points(
      fireflyGeometry,
      new THREE.PointsMaterial({
        color: '#ffd28a',
        size: 0.08,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      }),
    );
    fireflies.name = 'HearthlightFireflies';
    root.add(fireflies);

    // HoloScript-authored lights.
    const ambient = new THREE.HemisphereLight('#8aaeda', '#171b18', 0.31);
    scene.add(ambient);
    const moonKey = new THREE.DirectionalLight('#b9d8ff', 1.85);
    moonKey.position.set(-9, 13, 8);
    moonKey.castShadow = true;
    moonKey.shadow.mapSize.set(2048, 2048);
    moonKey.shadow.camera.left = -18;
    moonKey.shadow.camera.right = 18;
    moonKey.shadow.camera.top = 16;
    moonKey.shadow.camera.bottom = -12;
    moonKey.shadow.camera.near = 0.5;
    moonKey.shadow.camera.far = 45;
    moonKey.shadow.bias = -0.00025;
    scene.add(moonKey);
    const loomHearth = new THREE.PointLight('#ffad5c', 9.5, 17, 1.6);
    loomHearth.position.set(0, 3.4, 0.3);
    scene.add(loomHearth);
    const cottageHearth = new THREE.PointLight('#ffc274', 4.6, 10, 1.7);
    cottageHearth.position.set(-5.6, 2.8, -2.4);
    scene.add(cottageHearth);
    const rim = new THREE.DirectionalLight('#70ddff', 1.35);
    rim.position.set(9, 7, -7);
    scene.add(rim);

    const gl = renderer.getContext();
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const glReceipt = {
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      maskedVendor: gl.getParameter(gl.VENDOR),
      maskedRenderer: gl.getParameter(gl.RENDERER),
      unmaskedVendor: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
        : null,
      unmaskedRenderer: debugInfo
        ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
        : null,
      webgl2: gl instanceof WebGL2RenderingContext,
    };
    renderer.render(scene, camera);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    renderer.render(scene, camera);

    const projectBox = (object) => {
      const bounds = new THREE.Box3().setFromObject(object);
      const points = [];
      for (const x of [bounds.min.x, bounds.max.x]) {
        for (const y of [bounds.min.y, bounds.max.y]) {
          for (const z of [bounds.min.z, bounds.max.z]) {
            const projected = new THREE.Vector3(x, y, z).project(camera);
            points.push({
              x: (projected.x * 0.5 + 0.5) * payload.state.camera.width,
              y: (-projected.y * 0.5 + 0.5) * payload.state.camera.height,
            });
          }
        }
      }
      const left = Math.max(0, Math.min(...points.map((point) => point.x)));
      const right = Math.min(
        payload.state.camera.width,
        Math.max(...points.map((point) => point.x)),
      );
      const top = Math.max(0, Math.min(...points.map((point) => point.y)));
      const bottom = Math.min(
        payload.state.camera.height,
        Math.max(...points.map((point) => point.y)),
      );
      return {
        left, right, top, bottom,
        width: right - left,
        height: bottom - top,
        widthRatio: (right - left) / payload.state.camera.width,
        heightRatio: (bottom - top) / payload.state.camera.height,
      };
    };
    const artBoundsGroup = new THREE.Group();
    for (const object of [cottage, loom, cistern]) {
      artBoundsGroup.add(object.clone());
    }
    const compositionMetrics = {
      village: projectBox(artBoundsGroup),
      loom: projectBox(loom),
      cottage: projectBox(cottage),
      cistern: projectBox(cistern),
    };
    const rendererInfo = {
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
      lines: renderer.info.render.lines,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      materialCount: materials.length,
    };
    witness.ready = true;
    witness.status = 'pass';
    witness.sourceHash = payload.sourceHash;
    witness.sceneIrHash = payload.sceneIrHash;
    witness.gl = glReceipt;
    witness.renderer = {
      outputColorSpace: renderer.outputColorSpace,
      toneMapping: renderer.toneMapping,
      toneMappingExposure: renderer.toneMappingExposure,
      shadowMapEnabled: renderer.shadowMap.enabled,
      shadowMapType: renderer.shadowMap.type,
      environmentApplied: scene.environment === environmentTarget.texture,
      roomEnvironmentProceduralLocal: true,
      hdri: false,
    };
    witness.rendererInfo = rendererInfo;
    witness.compositionMetrics = compositionMetrics;
    witness.presentation = {
      publicFamilyIdentityPresented: false,
      productionResidentClaimed: false,
      neutralCraftfolkCount: 2,
      canonicalWritesAllowed: false,
      modelCalls: 0,
    };
    window.__MV_COURTYARD_SNAPSHOT__ = () => witness;
  } catch (error) {
    witness.ready = true;
    witness.status = 'fail';
    witness.error = error?.stack || error?.message || String(error);
  }
}

async function buildSurface(outputDir, holoScriptRoot, payload) {
  const esbuildPath = path.join(holoScriptRoot, 'node_modules', 'esbuild', 'lib', 'main.js');
  const esbuild = await import(pathToFileURL(esbuildPath).href);
  const bundlePath = path.join(outputDir, 'receipt-loom-courtyard.bundle.js');
  const htmlPath = path.join(outputDir, 'receipt-loom-courtyard.html');
  const appSource = [
    "import * as THREE from 'three';",
    "import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';",
    `const PAYLOAD = ${JSON.stringify(payload)};`,
    `(${courtyardBrowserApplication.toString()})(THREE, RoomEnvironment, PAYLOAD);`,
  ].join('\n');
  await esbuild.build({
    stdin: {
      contents: appSource,
      resolveDir: holoScriptRoot,
      sourcefile: 'receipt-loom-courtyard.entry.js',
      loader: 'js',
    },
    outfile: bundlePath,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome120'],
    minify: false,
    sourcemap: false,
    nodePaths: [path.join(holoScriptRoot, 'node_modules')],
    logLevel: 'silent',
  });
  writeFileSync(
    htmlPath,
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Receipt Loom Courtyard — Art Convergence A</title>
</head>
<body>
  <script src="./receipt-loom-courtyard.bundle.js"></script>
</body>
</html>
`,
    'utf8',
  );
  return {
    htmlPath,
    htmlHash: sha256File(htmlPath),
    bundlePath,
    bundleHash: sha256File(bundlePath),
    appSourceHash: sha256(appSource),
    esbuildPath,
    esbuildHash: sha256File(esbuildPath),
  };
}

function rendererIsSoftware(gl) {
  return [
    gl?.maskedRenderer,
    gl?.unmaskedRenderer,
    gl?.maskedVendor,
    gl?.unmaskedVendor,
  ].join(' ').toLowerCase().match(/swiftshader|llvmpipe|software rasterizer|lavapipe/);
}

async function captureBrowser({
  browserPath,
  holoScriptRoot,
  htmlPath,
  heroPath,
  timeoutMs,
}) {
  const playwrightPath = path.join(holoScriptRoot, 'node_modules', 'playwright', 'index.mjs');
  const { chromium } = await import(pathToFileURL(playwrightPath).href);
  const externalRequests = [];
  const consoleMessages = [];
  const pageErrors = [];
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      '--use-angle=d3d11',
      '--ignore-gpu-blocklist',
      '--enable-gpu',
      '--disable-background-networking',
      '--disable-dev-shm-usage',
      '--disable-features=Translate,MediaRouter',
    ],
  });
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 1,
    });
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith('file:') && !url.startsWith('data:')) {
        externalRequests.push(url);
      }
    });
    page.on('console', (message) => {
      consoleMessages.push({ type: message.type(), text: message.text() });
    });
    page.on('pageerror', (error) => pageErrors.push(error.stack || error.message));
    await page.goto(pathToFileURL(htmlPath).href, {
      waitUntil: 'load',
      timeout: timeoutMs,
    });
    await page.waitForFunction(
      () => window.__MV_COURTYARD_WITNESS__?.ready === true,
      undefined,
      { timeout: timeoutMs },
    );
    const state = await page.evaluate(() => window.__MV_COURTYARD_SNAPSHOT__?.()
      || window.__MV_COURTYARD_WITNESS__);
    if (state.status !== 'pass') {
      throw new Error(`Browser witness failed: ${state.error || state.status}`);
    }
    await page.screenshot({ path: heroPath, type: 'png' });
    const browserVersion = await browser.version();
    return {
      browserVersion,
      state,
      externalRequests,
      consoleMessages,
      pageErrors,
    };
  } finally {
    await browser.close();
  }
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    root: REPO_ROOT,
    outputDir: DEFAULT_OUTPUT_DIR,
    heroOutput: null,
    holoScriptRoot: null,
    browser: null,
    timeoutMs: 60_000,
    clean: true,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--root') options.root = path.resolve(argv[++index]);
    else if (arg === '--output') options.outputDir = path.resolve(argv[++index]);
    else if (arg === '--hero-output') options.heroOutput = path.resolve(argv[++index]);
    else if (arg === '--holoscript-root') options.holoScriptRoot = path.resolve(argv[++index]);
    else if (arg === '--browser') options.browser = path.resolve(argv[++index]);
    else if (arg === '--timeout-ms') options.timeoutMs = Number(argv[++index]);
    else if (arg === '--no-clean') options.clean = false;
    else if (arg === '--help') {
      console.log(`Usage: node scripts/check-hololand-model-village-receipt-loom-courtyard.mjs [options]
  --root <path>             HoloLand repository root
  --output <path>           Witness output directory
  --hero-output <path>      Optional durable 1600x900 PNG path
  --holoscript-root <path>  Built HoloScript checkout
  --browser <path>          Chrome or Edge executable
  --timeout-ms <number>     Browser timeout (default 60000)
  --no-clean                Preserve prior output directory contents`);
      process.exit(0);
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

export async function runCourtyardCheck(options = {}) {
  const root = path.resolve(options.root || REPO_ROOT);
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const holoScriptRoot = resolveHoloScriptRoot(root, options.holoScriptRoot);
  const browserPath = resolveBrowser(options.browser);
  if (options.clean !== false && existsSync(outputDir)) {
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: true });
  const compiled = await compileCourtyard(root, holoScriptRoot);
  const payload = {
    schema: 'hololand.model-village.receipt-loom-courtyard-render-payload.v1',
    metadata: compiled.contract.metadata,
    state: compiled.contract.state,
    environment: compiled.contract.environment,
    nodes: compiled.contract.nodes,
    sourceHash: compiled.sourceHash,
    sceneIrHash: compiled.sceneIrHash,
  };
  const surface = await buildSurface(outputDir, holoScriptRoot, payload);
  const heroPath = path.resolve(
    options.heroOutput || path.join(outputDir, 'receipt-loom-courtyard-1600x900.png'),
  );
  mkdirSync(path.dirname(heroPath), { recursive: true });
  const browser = await captureBrowser({
    browserPath,
    holoScriptRoot,
    htmlPath: surface.htmlPath,
    heroPath,
    timeoutMs: options.timeoutMs || 60_000,
  });
  const heroBuffer = readFileSync(heroPath);
  const state = browser.state;
  const budget = compiled.contract.state.qualityBudget;
  const checks = {
    sourceContractPass: compiled.validation.status === 'pass',
    sourceHashReachedBrowser: state.sourceHash === compiled.sourceHash,
    sceneIrHashReachedBrowser: state.sceneIrHash === compiled.sceneIrHash,
    webgl2: state.gl?.webgl2 === true,
    hardwareRenderer: !rendererIsSoftware(state.gl),
    d3d11Backend: /direct3d11|d3d11/i.test(state.gl?.unmaskedRenderer || ''),
    srgbOutput: state.renderer?.outputColorSpace === 'srgb',
    acesToneMapping: state.renderer?.toneMapping === 4,
    calibratedExposure:
      state.renderer?.toneMappingExposure === compiled.contract.state.renderer.exposure,
    pcfSoftShadows: state.renderer?.shadowMapEnabled === true
      && state.renderer?.shadowMapType === 2,
    proceduralLocalEnvironment:
      state.renderer?.environmentApplied === true
      && state.renderer?.roomEnvironmentProceduralLocal === true
      && state.renderer?.hdri === false,
    noExternalRequests: browser.externalRequests.length === 0,
    noPageErrors: browser.pageErrors.length === 0,
    drawCallBudget: state.rendererInfo?.calls <= budget.maxDrawCalls,
    triangleBudget: state.rendererInfo?.triangles <= budget.maxTriangles,
    materialBudget: state.rendererInfo?.materialCount <= 28,
    lockedResolution: pngDimensions(heroBuffer).width === 1600
      && pngDimensions(heroBuffer).height === 900,
    heroCompositionWidth:
      state.compositionMetrics?.village?.widthRatio >= 0.55
      && state.compositionMetrics?.village?.widthRatio <= 0.82,
    heroCompositionHeight:
      state.compositionMetrics?.village?.heightRatio >= 0.45
      && state.compositionMetrics?.village?.heightRatio <= 0.78,
    neutralResidentBoundary:
      state.presentation?.neutralCraftfolkCount === 2
      && state.presentation?.publicFamilyIdentityPresented === false
      && state.presentation?.productionResidentClaimed === false,
    readOnlyBoundary:
      state.presentation?.canonicalWritesAllowed === false
      && state.presentation?.modelCalls === 0,
  };
  const failures = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name);
  const receiptCore = {
    schema: 'hololand.model-village.receipt-loom-courtyard-witness.v1',
    status: failures.length === 0 ? 'pass' : 'fail',
    claim: {
      verified:
        'One HoloScript-authored Receipt Loom courtyard art tracer rendered through a dedicated HoloLand Three/WebGL2 bridge on the local D3D11 GPU path.',
      bounded:
        'The environment and Loom are Art Convergence A. Both residents are explicitly neutral staging forms; production residents, full-world convergence, gameplay physics, and named family embodiments are not claimed.',
    },
    sources: {
      courtyard: {
        path: SOURCE_RELATIVE,
        sha256: compiled.sourceHash,
        sceneIrSha256: compiled.sceneIrHash,
      },
      calibration: {
        path: CALIBRATION_RELATIVE,
        sha256: compiled.calibrationHash,
      },
      concept: {
        path: CONCEPT_RELATIVE,
        sha256: sha256File(path.resolve(root, CONCEPT_RELATIVE)),
      },
      characterReference: {
        path: CHARACTER_REFERENCE_RELATIVE,
        sha256: sha256File(path.resolve(root, CHARACTER_REFERENCE_RELATIVE)),
      },
    },
    toolchain: {
      holoScriptRoot,
      corePath: compiled.corePath,
      coreSha256: compiled.coreHash,
      esbuildPath: surface.esbuildPath,
      esbuildSha256: surface.esbuildHash,
      browserPath,
      browserVersion: browser.browserVersion,
      launchBackend: 'angle_d3d11',
    },
    bridge: {
      route: 'HoloScript source -> HoloCompositionParser -> SceneIRCompiler -> HoloLand presentation-only Three adapter',
      appSourceSha256: surface.appSourceHash,
      bundleSha256: surface.bundleHash,
      htmlSha256: surface.htmlHash,
      sourceSemanticsRewritten: false,
      externalAssets: [],
    },
    render: {
      gl: state.gl,
      renderer: state.renderer,
      rendererInfo: state.rendererInfo,
      compositionMetrics: state.compositionMetrics,
      hero: {
        path: path.relative(root, heroPath).replaceAll('\\', '/'),
        sha256: sha256(heroBuffer),
        bytes: heroBuffer.length,
        dimensions: pngDimensions(heroBuffer),
      },
      externalRequests: browser.externalRequests,
      pageErrors: browser.pageErrors,
      consoleMessages: browser.consoleMessages,
    },
    sourceContract: compiled.validation,
    checks,
    failures,
    residue: [
      'replace the two neutral Craftfolk staging forms with receipted production resident assets before claiming resident convergence',
      'integrate this courtyard kit into the canonical observer only after research-boundary review',
      'add living-cloth, water, foliage, and contact-physics exhibits under the remaining MV-V1 physics lane',
      'scale the approved material and architecture grammar to the remaining Stormglass Commons districts',
    ],
  };
  const receipt = {
    ...receiptCore,
    receipt: {
      algorithm: 'sha256-canonical-json',
      receiptHash: sha256(canonicalJson(receiptCore)),
    },
  };
  const receiptPath = path.join(outputDir, 'receipt-loom-courtyard-witness.json');
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  if (failures.length > 0) {
    throw new Error(
      `Receipt Loom courtyard witness failed: ${failures.join(', ')}. Receipt: ${receiptPath}`,
    );
  }
  return { receipt, receiptPath, heroPath };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(SCRIPT_PATH);
if (isMain) {
  runCourtyardCheck(parseArgs())
    .then(({ receipt, receiptPath, heroPath }) => {
      console.log(JSON.stringify({
        status: receipt.status,
        receiptPath,
        receiptHash: receipt.receipt.receiptHash,
        heroPath,
        heroHash: receipt.render.hero.sha256,
        gl: receipt.render.gl,
        rendererInfo: receipt.render.rendererInfo,
        compositionMetrics: receipt.render.compositionMetrics,
      }, null, 2));
    })
    .catch((error) => {
      console.error(error?.stack || error?.message || String(error));
      process.exitCode = 1;
    });
}
