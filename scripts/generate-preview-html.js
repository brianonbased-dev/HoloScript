#!/usr/bin/env node
/**
 * generate-preview-html.js
 *
 * Generates self-contained HTML files with interactive Three.js 3D previews
 * from HoloScript+ (.hsplus) source files. Used by the GitHub Action workflow
 * to create embeddable 3D scene previews for PR comments.
 *
 * Usage:
 *   node scripts/generate-preview-html.js <input.hsplus> [output.html]
 *   node scripts/generate-preview-html.js --batch <file1.hsplus> <file2.hsplus> --outdir <dir>
 *
 * The generated HTML is fully self-contained: Three.js is loaded from CDN,
 * and the HoloScript parser + renderer are inlined. No build step required.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Lightweight HoloScript Parser (mirrors packages/preview-component/src/engine/parser.ts)
// ---------------------------------------------------------------------------

const COLOR_MAP = {
  red: 0xe53935,
  green: 0x43a047,
  blue: 0x1e88e5,
  yellow: 0xfdd835,
  cyan: 0x00acc1,
  magenta: 0xd81b60,
  white: 0xfafafa,
  black: 0x212121,
  gray: 0x757575,
  grey: 0x757575,
  purple: 0x8e24aa,
  orange: 0xfb8c00,
  pink: 0xf06292,
  gold: 0xffc107,
  silver: 0xbdbdbd,
  bronze: 0xcd7f32,
  copper: 0xb87333,
  teal: 0x00897b,
  indigo: 0x5c6bc0,
  lime: 0xc0ca33,
  coral: 0xff7043,
  navy: 0x283593,
  sky: 0x4fc3f7,
  forest: 0x2e7d32,
  rose: 0xec407a,
  ice: 0xe1f5fe,
  lava: 0xff5722,
  neon: 0x39ff14,
  plasma: 0xff073a,
  hologram: 0x00fff7,
  energy: 0xffea00,
  crystal: 0xb3e5fc,
  nebula: 0x7b1fa2,
};
const DEFAULT_COLOR = 0x4a9eff;

const SKYBOX_GRADIENTS = {
  sunset: [0xffd27f, 0xff6b6b, 0x1a0a3e],
  night: [0x0a0a1a, 0x0f0f2a, 0x1a1a3e],
  nebula: [0x7b1fa2, 0x4a148c, 0x0a0a1a],
  sky: [0x87ceeb, 0x4fc3f7, 0xffffff],
  underwater: [0x006994, 0x003d5b, 0x001524],
  void: [0x0a0a0f, 0x0a0a0f, 0x0a0a0f],
  cyberpunk: [0x0d0221, 0x1a0a3e, 0x7b1fa2],
};

function resolveColor(colorStr) {
  if (!colorStr) return DEFAULT_COLOR;
  const cleaned = colorStr.toLowerCase().replace(/['"#]/g, '');
  if (/^[0-9a-f]{6}$/.test(cleaned)) return parseInt(cleaned, 16);
  return COLOR_MAP[cleaned] ?? DEFAULT_COLOR;
}

function extractBraces(str, startIdx) {
  let depth = 0,
    start = -1;
  for (let i = startIdx; i < str.length; i++) {
    if (str[i] === '{') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (str[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) return str.slice(start, i);
    }
  }
  return '';
}

function parseVec3(props, key, def) {
  const arr = props.match(new RegExp(key + '\\s*:\\s*\\[([^\\]]+)\\]'));
  const obj = props.match(
    new RegExp(
      key +
        '\\s*:\\s*\\{\\s*x\\s*:\\s*([\\d.-]+)\\s*,\\s*y\\s*:\\s*([\\d.-]+)\\s*,\\s*z\\s*:\\s*([\\d.-]+)\\s*\\}'
    )
  );
  if (arr) {
    const p = arr[1].split(',').map((n) => parseFloat(n.trim()) || def[0]);
    return [p[0] ?? def[0], p[1] ?? def[1], p[2] ?? def[2]];
  }
  if (obj) return [parseFloat(obj[1]), parseFloat(obj[2]), parseFloat(obj[3])];
  return def;
}

function parseHoloScript(source) {
  const objects = [];
  const environment = {};

  // Environment
  const envMatch = source.match(/environment\s*[:{]\s*\{([^}]+)\}/);
  if (envMatch) {
    const envBody = envMatch[1];
    const skybox = envBody.match(/skybox\s*:\s*['"]([^'"]+)['"]/);
    if (skybox) environment.skybox = skybox[1].toLowerCase();
    const bg = envBody.match(/background(?:Color)?\s*:\s*['"]?#?([\w]+)['"]?/);
    if (bg && !skybox) environment.background = bg[1];
  }

  // Templates (resolve 'using' references)
  const templates = {};
  const templatePattern = /template\s+["']([\w_]+)["']\s*\{/g;
  let tmatch;
  while ((tmatch = templatePattern.exec(source)) !== null) {
    templates[tmatch[1]] = extractBraces(source, tmatch.index);
  }

  // Objects
  const orbPattern =
    /(?:orb|object(?:\[\])?|button|slider)\s+["']?([\w_]+)["']?(?:\s+using\s+["']([\w_]+)["'])?(?:\s+@[\w]+)*\s*\{/g;
  let match;
  while ((match = orbPattern.exec(source)) !== null) {
    const name = match[1];
    const templateName = match[2];
    let props = extractBraces(source, match.index);
    if (!props) continue;

    // Merge template properties (template first, object overrides)
    if (templateName && templates[templateName]) {
      props = templates[templateName] + '\n' + props;
    }

    const colorMatch = props.match(/color\s*:\s*["']?#?([\w]+)["']?/);
    const geoMatch = props.match(/(?:geometry|model)\s*:\s*['"](\w+)['"]/);
    const typeMatch = props.match(/type\s*:\s*['"](\w+)['"]/);
    const matMatch = props.match(/material\s*:\s*['"](\w+)['"]/);
    const animMatch = props.match(/animate\s*:\s*['"](\w+)['"]/);
    const animSpeedMatch = props.match(/animSpeed\s*:\s*([\d.]+)/);

    objects.push({
      name,
      geometry: geoMatch
        ? geoMatch[1].toLowerCase()
        : typeMatch
          ? typeMatch[1].toLowerCase()
          : 'cube',
      position: parseVec3(props, 'position', [0, 0, 0]),
      rotation: parseVec3(props, 'rotation', [0, 0, 0]).map((r) => (r * Math.PI) / 180),
      scale: parseVec3(props, 'scale', [1, 1, 1]),
      color: resolveColor(colorMatch?.[1]),
      material: matMatch ? matMatch[1].toLowerCase() : 'standard',
      glow: /glow\s*:\s*true/i.test(props),
      animate: animMatch ? animMatch[1].toLowerCase() : undefined,
      animSpeed: animSpeedMatch ? parseFloat(animSpeedMatch[1]) : 1,
    });
  }

  return { objects, environment };
}

// ---------------------------------------------------------------------------
// HTML Template Generator
// ---------------------------------------------------------------------------

function generatePreviewHTML(source, fileName, options = {}) {
  const parsed = parseHoloScript(source);
  const objectCount = parsed.objects.length;
  const sceneJSON = JSON.stringify(parsed);

  // Determine background color for the environment
  let bgColor = '0x1a1a2e';
  if (parsed.environment.background) {
    const resolved = resolveColor(parsed.environment.background);
    bgColor = '0x' + resolved.toString(16).padStart(6, '0');
  }

  const commitSha = options.commitSha || 'unknown';
  const prNumber = options.prNumber || '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HoloScript Preview: ${fileName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0d1117;
      color: #c9d1d9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      overflow: hidden;
      height: 100vh;
    }
    #header {
      position: fixed; top: 0; left: 0; right: 0; z-index: 100;
      background: rgba(13, 17, 23, 0.92);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid #30363d;
      padding: 10px 20px;
      display: flex; align-items: center; gap: 16px;
    }
    #header .logo {
      display: flex; align-items: center; gap: 8px;
      font-weight: 600; font-size: 15px; color: #58a6ff;
    }
    #header .logo svg { width: 22px; height: 22px; }
    #header .file-name {
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 13px; color: #8b949e;
      background: rgba(110, 118, 129, 0.1);
      padding: 4px 10px; border-radius: 6px;
    }
    #header .stats {
      margin-left: auto; font-size: 12px; color: #8b949e;
      display: flex; gap: 14px;
    }
    #header .stats span { display: flex; align-items: center; gap: 4px; }
    #toolbar {
      position: fixed; top: 52px; right: 16px; z-index: 100;
      display: flex; gap: 6px; padding: 8px 0;
    }
    #toolbar button {
      background: rgba(110, 118, 129, 0.15);
      border: 1px solid rgba(110, 118, 129, 0.3);
      border-radius: 6px; color: #c9d1d9;
      padding: 5px 12px; cursor: pointer;
      font-size: 12px; font-family: inherit;
      transition: all 0.15s;
    }
    #toolbar button:hover { background: rgba(110, 118, 129, 0.3); }
    #toolbar button.active { background: #1f6feb; border-color: #1f6feb; color: #fff; }
    #canvas-container {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    }
    canvas { width: 100%; height: 100%; display: block; }
    #code-panel {
      position: fixed; bottom: 0; left: 0; right: 0;
      max-height: 40vh; z-index: 100;
      background: rgba(13, 17, 23, 0.95);
      backdrop-filter: blur(12px);
      border-top: 1px solid #30363d;
      transform: translateY(100%);
      transition: transform 0.3s ease;
      overflow: auto;
    }
    #code-panel.open { transform: translateY(0); }
    #code-panel pre {
      padding: 16px 20px;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
      font-size: 13px; line-height: 1.5;
      color: #c9d1d9; white-space: pre-wrap; word-break: break-all;
    }
    .kw { color: #ff7b72; }
    .str { color: #a5d6ff; }
    .num { color: #79c0ff; }
    .trait { color: #d2a8ff; }
    .comment { color: #8b949e; font-style: italic; }
    .name { color: #7ee787; }
    #watermark {
      position: fixed; bottom: 12px; left: 16px; z-index: 50;
      font-size: 11px; color: rgba(139, 148, 158, 0.5);
    }
    #watermark a { color: rgba(88, 166, 255, 0.5); text-decoration: none; }
    #loading {
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      text-align: center; z-index: 200;
    }
    #loading .spinner {
      width: 40px; height: 40px; margin: 0 auto 16px;
      border: 3px solid #30363d; border-top-color: #58a6ff;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="loading">
    <div class="spinner"></div>
    <div>Loading HoloScript Preview...</div>
  </div>

  <div id="header">
    <div class="logo">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 2L2 7l10 5 10-5-10-5z"/>
        <path d="M2 17l10 5 10-5"/>
        <path d="M2 12l10 5 10-5"/>
      </svg>
      HoloScript Preview
    </div>
    <span class="file-name">${fileName}</span>
    <div class="stats">
      <span title="Objects in scene">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.5l6 3.5v6l-6 3.5L2 11V5l6-3.5z"/></svg>
        ${objectCount} objects
      </span>
      <span title="Commit SHA">${commitSha.substring(0, 7)}</span>
    </div>
  </div>

  <div id="toolbar">
    <button id="btn-reset" title="Reset camera (R)">Reset</button>
    <button id="btn-wire" title="Toggle wireframe (W)">Wire</button>
    <button id="btn-grid" title="Toggle grid (G)" class="active">Grid</button>
    <button id="btn-axes" title="Toggle axes (A)" class="active">Axes</button>
    <button id="btn-code" title="Toggle source code (C)">Code</button>
  </div>

  <div id="canvas-container">
    <canvas id="preview-canvas"></canvas>
  </div>

  <div id="code-panel">
    <pre>${highlightHoloScript(source)}</pre>
  </div>

  <div id="watermark">
    HoloScript 3D Preview &middot; PR #${prNumber} &middot;
    <a href="https://github.com/brianonbased-dev/HoloScript" target="_blank">github.com/brianonbased-dev/HoloScript</a>
  </div>

  <script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"
    }
  }
  </script>

  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

    // Scene data parsed from HoloScript
    const sceneData = ${sceneJSON};

    // Skybox gradients
    const SKYBOX_GRADIENTS = ${JSON.stringify(SKYBOX_GRADIENTS)};

    // Color map for inline resolution
    const COLOR_MAP = ${JSON.stringify(COLOR_MAP)};
    const DEFAULT_COLOR = ${DEFAULT_COLOR};

    function resolveColorHex(colorStr) {
      if (!colorStr) return DEFAULT_COLOR;
      const cleaned = colorStr.toLowerCase().replace(/['"#]/g, '');
      if (/^[0-9a-f]{6}$/.test(cleaned)) return parseInt(cleaned, 16);
      return COLOR_MAP[cleaned] ?? DEFAULT_COLOR;
    }

    // Scene setup
    const canvas = document.getElementById('preview-canvas');
    const container = document.getElementById('canvas-container');
    const clock = new THREE.Clock();

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(${bgColor});
    scene.fog = new THREE.Fog(${bgColor}, 15, 60);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(8, 6, 8);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // Environment
    if (sceneData.environment.skybox) {
      const gradient = SKYBOX_GRADIENTS[sceneData.environment.skybox];
      if (gradient) {
        const cvs = document.createElement('canvas');
        cvs.width = 2; cvs.height = 512;
        const ctx = cvs.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 512);
        grad.addColorStop(0, '#' + gradient[0].toString(16).padStart(6, '0'));
        grad.addColorStop(0.5, '#' + gradient[1].toString(16).padStart(6, '0'));
        grad.addColorStop(1, '#' + gradient[2].toString(16).padStart(6, '0'));
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2, 512);
        const texture = new THREE.CanvasTexture(cvs);
        texture.mapping = THREE.EquirectangularReflectionMapping;
        scene.background = texture;
      }
    }

    // Lighting
    scene.add(new THREE.HemisphereLight(0x87ceeb, 0x3d3d5c, 0.6));
    const keyLight = new THREE.DirectionalLight(0xfff5e6, 2.0);
    keyLight.position.set(5, 10, 5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x8ec8ff, 0.8);
    fillLight.position.set(-5, 3, -5);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
    rimLight.position.set(0, 5, -10);
    scene.add(rimLight);

    // Grid & axes
    const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x333333);
    scene.add(gridHelper);
    const axesHelper = new THREE.AxesHelper(5);
    scene.add(axesHelper);

    // Shadow-receiving ground
    const groundGeo = new THREE.PlaneGeometry(100, 100);
    const groundMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Geometry factory
    function createGeometry(type) {
      switch (type) {
        case 'sphere': case 'orb': return new THREE.SphereGeometry(0.5, 32, 32);
        case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        case 'cone': return new THREE.ConeGeometry(0.5, 1, 32);
        case 'torus': case 'ring': return new THREE.TorusGeometry(0.4, 0.15, 16, 48);
        case 'plane': return new THREE.PlaneGeometry(1, 1);
        case 'torusknot': return new THREE.TorusKnotGeometry(0.3, 0.1, 100, 16);
        case 'dodecahedron': return new THREE.DodecahedronGeometry(0.5);
        case 'icosahedron': return new THREE.IcosahedronGeometry(0.5);
        case 'octahedron': return new THREE.OctahedronGeometry(0.5);
        case 'tetrahedron': return new THREE.TetrahedronGeometry(0.5);
        case 'capsule': return new THREE.CapsuleGeometry(0.3, 0.6, 8, 16);
        case 'diamond': case 'crystal': { const g = new THREE.OctahedronGeometry(0.5); g.scale(1, 1.5, 1); return g; }
        case 'hexagon': return new THREE.CylinderGeometry(0.5, 0.5, 0.2, 6);
        case 'pyramid': return new THREE.ConeGeometry(0.5, 1, 4);
        case 'star': return new THREE.DodecahedronGeometry(0.4, 0);
        case 'cube': default: return new THREE.BoxGeometry(1, 1, 1);
      }
    }

    // Material factory
    function createMaterial(type, color, glow) {
      switch (type) {
        case 'glass': return new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: 0.3, roughness: 0, metalness: 0, transmission: 0.9, thickness: 0.5 });
        case 'hologram': return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, wireframe: true });
        case 'neon': return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5 });
        case 'chrome': case 'metal': return new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 1, roughness: 0.1 });
        case 'matte': return new THREE.MeshLambertMaterial({ color });
        case 'wireframe': return new THREE.MeshBasicMaterial({ color, wireframe: true });
        default: return new THREE.MeshStandardMaterial({ color, metalness: 0.3, roughness: 0.6, emissive: glow ? color : 0x000000, emissiveIntensity: glow ? 0.3 : 0 });
      }
    }

    // Build scene objects
    const meshes = [];
    const animatedObjects = [];

    for (const obj of sceneData.objects) {
      const geometry = createGeometry(obj.geometry);
      const material = createMaterial(obj.material, obj.color, obj.glow);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(obj.position[0], obj.position[1], obj.position[2]);
      mesh.scale.set(obj.scale[0], obj.scale[1], obj.scale[2]);
      mesh.rotation.set(obj.rotation[0], obj.rotation[1], obj.rotation[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = obj.name;
      scene.add(mesh);
      meshes.push(mesh);

      if (obj.animate) {
        animatedObjects.push({
          mesh, type: obj.animate,
          speed: obj.animSpeed ?? 1,
          amplitude: 0.3, radius: 1,
          originalY: obj.position[1],
          originalPos: { x: obj.position[0], y: obj.position[1], z: obj.position[2] },
        });
      }
    }

    // Hide loading
    document.getElementById('loading').style.display = 'none';

    // Animation loop
    let wireframeMode = false;
    function animate() {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const elapsed = clock.getElapsedTime();

      for (const item of animatedObjects) {
        const { mesh, type, speed, amplitude, radius, originalY, originalPos } = item;
        const t = elapsed * speed;
        switch (type) {
          case 'spin': mesh.rotation.y += delta * speed * 2; break;
          case 'float': mesh.position.y = originalY + Math.sin(t * 2) * amplitude; break;
          case 'pulse': { const s = 1 + Math.sin(t * 3) * 0.15; mesh.scale.set(s, s, s); break; }
          case 'orbit': mesh.position.x = originalPos.x + Math.cos(t) * radius; mesh.position.z = originalPos.z + Math.sin(t) * radius; break;
          case 'bob': mesh.position.y = originalY + Math.sin(t * 4) * amplitude * 0.5; break;
          case 'sway': mesh.rotation.z = Math.sin(t * 2) * amplitude; break;
          case 'flicker': if (mesh.material.emissiveIntensity !== undefined) mesh.material.emissiveIntensity = 0.5 + Math.random() * 0.5; break;
          case 'rainbow': if (mesh.material.color) mesh.material.color.setHSL((t * 0.1) % 1, 0.8, 0.5); break;
        }
      }
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Resize handler
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // Toolbar
    const btnReset = document.getElementById('btn-reset');
    const btnWire = document.getElementById('btn-wire');
    const btnGrid = document.getElementById('btn-grid');
    const btnAxes = document.getElementById('btn-axes');
    const btnCode = document.getElementById('btn-code');
    const codePanel = document.getElementById('code-panel');

    btnReset.addEventListener('click', () => {
      camera.position.set(8, 6, 8);
      controls.reset();
    });

    btnWire.addEventListener('click', () => {
      wireframeMode = !wireframeMode;
      btnWire.classList.toggle('active', wireframeMode);
      meshes.forEach(m => { if (m.material) m.material.wireframe = wireframeMode; });
    });

    btnGrid.addEventListener('click', () => {
      gridHelper.visible = !gridHelper.visible;
      btnGrid.classList.toggle('active', gridHelper.visible);
    });

    btnAxes.addEventListener('click', () => {
      axesHelper.visible = !axesHelper.visible;
      btnAxes.classList.toggle('active', axesHelper.visible);
    });

    btnCode.addEventListener('click', () => {
      codePanel.classList.toggle('open');
      btnCode.classList.toggle('active', codePanel.classList.contains('open'));
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.key.toLowerCase()) {
        case 'r': btnReset.click(); break;
        case 'w': btnWire.click(); break;
        case 'g': btnGrid.click(); break;
        case 'a': btnAxes.click(); break;
        case 'c': btnCode.click(); break;
      }
    });
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Syntax Highlighting for Code Panel
// ---------------------------------------------------------------------------

function highlightHoloScript(source) {
  return (
    source
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Comments
      .replace(/(\/\/[^\n]*)/g, '<span class="comment">$1</span>')
      // Traits (@keyword)
      .replace(/(@\w+)/g, '<span class="trait">$1</span>')
      // Keywords
      .replace(
        /\b(composition|environment|template|object|orb|module|function|let|const|export|import|if|else|for|while|return|emit|state|action|using)\b/g,
        '<span class="kw">$1</span>'
      )
      // Strings
      .replace(/(["'][^"']*["'])/g, '<span class="str">$1</span>')
      // Numbers
      .replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>')
  );
}

// ---------------------------------------------------------------------------
// CLI Entry Point
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
HoloScript Preview HTML Generator

Usage:
  node generate-preview-html.js <input.hsplus> [output.html] [--sha <commit>] [--pr <number>]
  node generate-preview-html.js --batch <file1.hsplus> [file2.hsplus ...] --outdir <dir> [--sha <commit>] [--pr <number>]

Options:
  --sha <commit>   Commit SHA to display in the preview header
  --pr <number>    PR number to display in the watermark
  --outdir <dir>   Output directory for batch mode
  --batch          Enable batch mode (process multiple files)
  --help, -h       Show this help message
`);
    process.exit(0);
  }

  const batchMode = args.includes('--batch');
  const shaIdx = args.indexOf('--sha');
  const prIdx = args.indexOf('--pr');
  const outdirIdx = args.indexOf('--outdir');

  const commitSha = shaIdx !== -1 ? args[shaIdx + 1] : process.env.GITHUB_SHA || 'local';
  const prNumber = prIdx !== -1 ? args[prIdx + 1] : process.env.PR_NUMBER || '';

  if (batchMode) {
    const outdir = outdirIdx !== -1 ? args[outdirIdx + 1] : './preview-output';
    const files = args.filter((a, i) => {
      if (a.startsWith('--')) return false;
      if (i > 0 && ['--sha', '--pr', '--outdir'].includes(args[i - 1])) return false;
      return a.endsWith('.hsplus') || a.endsWith('.hs') || a.endsWith('.holo');
    });

    if (files.length === 0) {
      console.error('Error: No .hsplus files specified for batch mode');
      process.exit(1);
    }

    fs.mkdirSync(outdir, { recursive: true });

    const manifest = { files: [], generated: new Date().toISOString(), commitSha, prNumber };

    for (const file of files) {
      if (!fs.existsSync(file)) {
        console.warn(`Warning: File not found: ${file}`);
        continue;
      }

      const source = fs.readFileSync(file, 'utf-8');
      const baseName = path.basename(file, path.extname(file));
      const outputFile = path.join(outdir, `${baseName}.html`);
      const fileName = path.basename(file);

      const html = generatePreviewHTML(source, fileName, { commitSha, prNumber });
      fs.writeFileSync(outputFile, html);

      // Parse to get object count for manifest
      const parsed = parseHoloScript(source);
      manifest.files.push({
        source: file,
        output: outputFile,
        fileName,
        objectCount: parsed.objects.length,
        url: `${baseName}.html`,
      });

      console.log(`Generated: ${outputFile} (${parsed.objects.length} objects)`);
    }

    // Write manifest
    const manifestPath = path.join(outdir, 'manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\nManifest: ${manifestPath}`);
    console.log(`Total files: ${manifest.files.length}`);
  } else {
    // Single file mode
    const inputFile = args.find(
      (a) =>
        !a.startsWith('--') && (a.endsWith('.hsplus') || a.endsWith('.hs') || a.endsWith('.holo'))
    );
    if (!inputFile) {
      console.error('Error: No input file specified');
      process.exit(1);
    }

    if (!fs.existsSync(inputFile)) {
      console.error(`Error: File not found: ${inputFile}`);
      process.exit(1);
    }

    const source = fs.readFileSync(inputFile, 'utf-8');
    const fileName = path.basename(inputFile);

    // Determine output file
    let outputFile = args.find((a, i) => {
      if (a.startsWith('--')) return false;
      if (i > 0 && ['--sha', '--pr', '--outdir'].includes(args[i - 1])) return false;
      return a.endsWith('.html');
    });
    if (!outputFile) {
      outputFile = path.basename(inputFile, path.extname(inputFile)) + '.html';
    }

    const html = generatePreviewHTML(source, fileName, { commitSha, prNumber });
    fs.writeFileSync(outputFile, html);

    const parsed = parseHoloScript(source);
    console.log(`Generated: ${outputFile} (${parsed.objects.length} objects)`);
  }
}

main();
