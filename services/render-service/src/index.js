/**
 * HoloScript Render Service
 *
 * Provides preview generation and sharing endpoints for HoloScript scenes.
 * Designed for X (Twitter) card previews and social sharing.
 *
 * Scene parsing uses @holoscript/core's HoloCompositionParser instead of
 * regex-based extraction for accurate, full-fidelity scene understanding.
 */

import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
import QRCode from 'qrcode';
import { parseHoloScriptCode } from './parseScene.js';

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const PLAYGROUND_URL = process.env.PLAYGROUND_URL || 'http://localhost:3000/playground';

// Middleware
app.use(cors());
app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.text({ type: 'text/plain', limit: '1mb' }));

// =============================================================================
// SCENE CACHE WITH TTL AND MAX ENTRIES (OOM Prevention)
// =============================================================================
const MAX_SCENES = 1000;
const SCENE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

// In-memory store for scenes with TTL tracking
const scenes = new Map();
const sceneTimestamps = new Map(); // Track creation time for TTL

/**
 * Evict expired scenes and enforce max capacity
 */
function cleanupScenes() {
  const now = Date.now();
  let evictedExpired = 0;
  let evictedOverflow = 0;

  // 1. Remove expired scenes
  for (const [id, timestamp] of sceneTimestamps.entries()) {
    if (now - timestamp > SCENE_TTL_MS) {
      scenes.delete(id);
      sceneTimestamps.delete(id);
      evictedExpired++;
    }
  }

  // 2. If still over capacity, remove oldest scenes (LRU)
  if (scenes.size > MAX_SCENES) {
    const sortedByTime = [...sceneTimestamps.entries()].sort((a, b) => a[1] - b[1]);
    const toRemove = sortedByTime.slice(0, scenes.size - MAX_SCENES);
    for (const [id] of toRemove) {
      scenes.delete(id);
      sceneTimestamps.delete(id);
      evictedOverflow++;
    }
  }

  if (evictedExpired > 0 || evictedOverflow > 0) {
    console.log(`[Cleanup] Evicted ${evictedExpired} expired, ${evictedOverflow} overflow. Remaining: ${scenes.size}`);
  }
}

// Run cleanup periodically
setInterval(cleanupScenes, CLEANUP_INTERVAL_MS);

/**
 * Add scene with TTL tracking and capacity enforcement
 */
function addScene(id, scene) {
  // Cleanup before adding to prevent OOM
  if (scenes.size >= MAX_SCENES) {
    cleanupScenes();
  }
  
  // If still at capacity after cleanup, evict oldest
  if (scenes.size >= MAX_SCENES) {
    const oldest = [...sceneTimestamps.entries()].sort((a, b) => a[1] - b[1])[0];
    if (oldest) {
      scenes.delete(oldest[0]);
      sceneTimestamps.delete(oldest[0]);
    }
  }
  
  scenes.set(id, scene);
  sceneTimestamps.set(id, Date.now());
}

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'holoscript-render', 
    version: '2.0.0',
    parser: '@holoscript/core',
    cache: {
      scenes: scenes.size,
      maxScenes: MAX_SCENES,
      ttlHours: SCENE_TTL_MS / (60 * 60 * 1000)
    }
  });
});

// Create a shareable scene
app.post('/share', async (req, res) => {
  try {
    const { code, title, description } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'code is required' });
    }

    const id = generateId();

    addScene(id, {
      code,
      title: title || 'HoloScript Scene',
      description: description || 'Interactive 3D scene built with HoloScript',
      createdAt: new Date().toISOString(),
    });

    const urls = {
      id,
      playground: PLAYGROUND_URL + '?scene=' + id,
      embed: BASE_URL + '/embed/' + id,
      preview: BASE_URL + '/preview/' + id,
      qr: BASE_URL + '/qr/' + id,
      raw: BASE_URL + '/scene/' + id,
    };

    res.json(urls);
  } catch (error) {
    console.error('Share error:', error);
    res.status(500).json({ error: 'Failed to create share link' });
  }
});

// Get raw scene data
app.get('/scene/:id', (req, res) => {
  const scene = scenes.get(req.params.id);
  if (!scene) {
    return res.status(404).json({ error: 'Scene not found' });
  }
  res.json(scene);
});

// Get scene code as text
app.get('/scene/:id/code', (req, res) => {
  const scene = scenes.get(req.params.id);
  if (!scene) {
    return res.status(404).json({ error: 'Scene not found' });
  }
  res.type('text/plain').send(scene.code);
});

// Get parsed scene data (server-side compiled via @holoscript/core)
app.get('/scene/:id/parsed', (req, res) => {
  const scene = scenes.get(req.params.id);
  if (!scene) {
    return res.status(404).json({ error: 'Scene not found' });
  }
  const parsed = parseHoloScriptCode(scene.code);
  res.json(parsed);
});

// Embeddable HTML with Twitter Card meta tags
app.get('/embed/:id', (req, res) => {
  const scene = scenes.get(req.params.id);
  if (!scene) {
    return res.status(404).send('Scene not found');
  }
  const html = generateEmbedHTML(req.params.id, scene);
  res.type('text/html').send(html);
});

// Preview page
app.get('/preview/:id', (req, res) => {
  const scene = scenes.get(req.params.id);
  if (!scene) {
    return res.status(404).send('Scene not found');
  }
  const html = generatePreviewHTML(req.params.id, scene);
  res.type('text/html').send(html);
});

// QR code endpoint
app.get('/qr/:id', async (req, res) => {
  try {
    const url = PLAYGROUND_URL + '?scene=' + req.params.id;
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: 200,
      margin: 1,
      color: { dark: '#000', light: '#fff' },
    });

    const base64 = qrDataUrl.split(',')[1];
    const buffer = Buffer.from(base64, 'base64');

    res.type('image/png').send(buffer);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// Full WebXR render page
app.get('/render/:id', (req, res) => {
  const scene = scenes.get(req.params.id);
  if (!scene) {
    return res.status(404).send('Scene not found');
  }
  const html = generateRenderHTML(req.params.id, scene);
  res.type('text/html').send(html);
});

// Inline render from query param
app.get('/inline', (req, res) => {
  const code = req.query.code;
  if (!code) {
    return res.status(400).send('code query param required');
  }

  let decodedCode;
  try {
    decodedCode = Buffer.from(code, 'base64').toString('utf8');
  } catch {
    decodedCode = code;
  }

  const html = generateRenderHTML('inline', {
    code: decodedCode,
    title: 'HoloScript Scene',
    description: 'Interactive 3D scene',
  });

  res.type('text/html').send(html);
});

// Playground
app.get('/playground', (req, res) => {
  res.type('text/html').send(generatePlaygroundHTML());
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 HoloScript Render Service running on port ' + PORT);
  console.log('   Base URL: ' + BASE_URL);
  console.log('   Playground: ' + PLAYGROUND_URL);
});

// Helper functions
function generateId() {
  return Math.random().toString(36).substring(2, 10);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateEmbedHTML(id, scene) {
  const title = escapeHtml(scene.title);
  const desc = escapeHtml(scene.description);
  const renderUrl = BASE_URL + '/render/' + id;
  const playUrl = PLAYGROUND_URL + '?scene=' + id;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <meta name="twitter:card" content="player">
  <meta name="twitter:site" content="@HoloScriptDev">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:player" content="${renderUrl}">
  <meta name="twitter:player:width" content="480">
  <meta name="twitter:player:height" content="480">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${desc}">
  <meta property="og:url" content="${playUrl}">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #0a0a0f; color: #fff; font-family: -apple-system, sans-serif;
      display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .container { text-align: center; padding: 2rem; }
    h1 { margin-bottom: 1rem; }
    .cta { display: inline-block; background: #00ffff; color: #000; padding: 1rem 2rem;
      border-radius: 8px; text-decoration: none; font-weight: bold; margin-top: 1rem; }
    .cta:hover { background: #00cccc; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${title}</h1>
    <p>${desc}</p>
    <a href="${playUrl}" class="cta">🎮 Open in HoloScript</a>
  </div>
</body>
</html>`;
}

function generatePreviewHTML(id, scene) {
  const title = escapeHtml(scene.title);

  // Parse HoloScript code server-side using @holoscript/core compiler
  const parsed = parseHoloScriptCode(scene.code);
  const sceneDataJson = JSON.stringify(parsed);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview: ${title}</title>
  <style>
    * { margin: 0; padding: 0; }
    body { background: #0a0a0f; overflow: hidden; }
    canvas { display: block; }
  </style>
</head>
<body>
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.182.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.182.0/examples/jsm/"
    }
  }
  </script>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(5, 3, 5);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.autoRotate = true;
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    // Scene data parsed server-side by @holoscript/core compiler
    const sceneData = ${sceneDataJson};
    renderParsedScene(sceneData, scene);

    /**
     * Render pre-parsed scene objects into the Three.js scene.
     * The parsing was done server-side by @holoscript/core's
     * HoloCompositionParser, so geometry/color/position/traits
     * are already extracted with full fidelity.
     */
    function renderParsedScene(sceneData, threeScene) {
      if (!sceneData || !sceneData.objects || sceneData.objects.length === 0) {
        // Fallback: render a default sphere if no objects were parsed
        const geo = new THREE.SphereGeometry();
        const mat = new THREE.MeshStandardMaterial({
          color: '#00ffff',
          emissive: '#00ffff',
          emissiveIntensity: 0.3,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, 1, 0);
        threeScene.add(mesh);
      } else {
        for (const obj of sceneData.objects) {
          const geo = createGeometry(obj.geometry);
          const matProps = {
            color: obj.color || '#00ffff',
            emissive: obj.color || '#00ffff',
            emissiveIntensity: obj.emissiveIntensity || 0.3,
          };
          if (obj.metalness !== undefined) matProps.metalness = obj.metalness;
          if (obj.roughness !== undefined) matProps.roughness = obj.roughness;
          if (obj.opacity !== undefined) {
            matProps.opacity = obj.opacity;
            matProps.transparent = obj.opacity < 1;
          }
          if (obj.emissive) matProps.emissive = obj.emissive;

          const mat = new THREE.MeshStandardMaterial(matProps);
          const mesh = new THREE.Mesh(geo, mat);

          const pos = obj.position || [0, 1, 0];
          mesh.position.set(pos[0] || 0, pos[1] || 1, pos[2] || 0);

          if (obj.rotation) {
            mesh.rotation.set(obj.rotation[0] || 0, obj.rotation[1] || 0, obj.rotation[2] || 0);
          }
          if (obj.scale) {
            mesh.scale.set(obj.scale[0] || 1, obj.scale[1] || 1, obj.scale[2] || 1);
          }

          threeScene.add(mesh);
        }
      }

      threeScene.add(new THREE.GridHelper(10, 10, 0x444444, 0x222222));
    }

    function createGeometry(type) {
      switch ((type || 'sphere').toLowerCase()) {
        case 'cube': case 'box': return new THREE.BoxGeometry();
        case 'cylinder': return new THREE.CylinderGeometry();
        case 'cone': return new THREE.ConeGeometry();
        case 'torus': return new THREE.TorusGeometry();
        case 'capsule': return new THREE.CapsuleGeometry();
        case 'plane': return new THREE.PlaneGeometry();
        case 'ring': return new THREE.RingGeometry();
        case 'dodecahedron': return new THREE.DodecahedronGeometry();
        case 'icosahedron': return new THREE.IcosahedronGeometry();
        case 'octahedron': return new THREE.OctahedronGeometry();
        case 'tetrahedron': return new THREE.TetrahedronGeometry();
        default: return new THREE.SphereGeometry();
      }
    }

    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
</body>
</html>`;
}

function generateRenderHTML(id, scene) {
  const title = escapeHtml(scene.title);

  // Parse HoloScript code server-side using @holoscript/core compiler
  const parsed = parseHoloScriptCode(scene.code);
  const sceneDataJson = JSON.stringify(parsed);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} | HoloScript</title>
  <style>
    * { margin: 0; padding: 0; }
    body { background: #000; overflow: hidden; }
    canvas { display: block; }
    #info { position: fixed; top: 10px; left: 10px; color: #fff; font-family: monospace;
      font-size: 12px; background: rgba(0,0,0,0.5); padding: 8px; border-radius: 4px; }
  </style>
</head>
<body>
  <div id="info">HoloScript Preview</div>
  <script type="importmap">
  {
    "imports": {
      "three": "https://unpkg.com/three@0.182.0/build/three.module.js",
      "three/addons/": "https://unpkg.com/three@0.182.0/examples/jsm/"
    }
  }
  </script>
  <script type="module">
    import * as THREE from 'three';
    import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
    import { VRButton } from 'three/addons/webxr/VRButton.js';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(3, 2, 3);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.xr.enabled = true;
    document.body.appendChild(renderer.domElement);

    if ('xr' in navigator) {
      document.body.appendChild(VRButton.createButton(renderer));
    }

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    scene.add(new THREE.AmbientLight(0xffffff, 0.4));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(20, 20),
      new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    scene.add(new THREE.GridHelper(20, 20, 0x333333, 0x222222));

    // Scene data parsed server-side by @holoscript/core compiler
    const sceneData = ${sceneDataJson};
    renderParsedScene(sceneData);

    /**
     * Render pre-parsed scene objects into the Three.js scene.
     * The parsing was done server-side by @holoscript/core's
     * HoloCompositionParser, so all properties are pre-extracted.
     */
    function renderParsedScene(sceneData) {
      if (!sceneData || !sceneData.objects || sceneData.objects.length === 0) {
        // Fallback: render a default sphere if no objects were parsed
        const geo = new THREE.SphereGeometry(0.5);
        const mat = new THREE.MeshStandardMaterial({
          color: 0x00ffff,
          emissive: 0x00ffff,
          emissiveIntensity: 0.2,
          metalness: 0.3,
          roughness: 0.7,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(0, 1, 0);
        scene.add(mesh);
        return;
      }

      for (const obj of sceneData.objects) {
        const geo = createGeometry(obj.geometry);
        const matProps = {
          color: obj.color || '#00ffff',
          emissive: obj.emissive || obj.color || '#00ffff',
          emissiveIntensity: obj.emissiveIntensity || 0.2,
          metalness: obj.metalness !== undefined ? obj.metalness : 0.3,
          roughness: obj.roughness !== undefined ? obj.roughness : 0.7,
        };
        if (obj.opacity !== undefined) {
          matProps.opacity = obj.opacity;
          matProps.transparent = obj.opacity < 1;
        }

        const mat = new THREE.MeshStandardMaterial(matProps);
        const mesh = new THREE.Mesh(geo, mat);

        const pos = obj.position || [0, 1, 0];
        mesh.position.set(pos[0] || 0, pos[1] || 1, pos[2] || 0);

        if (obj.rotation) {
          mesh.rotation.set(obj.rotation[0] || 0, obj.rotation[1] || 0, obj.rotation[2] || 0);
        }
        if (obj.scale) {
          mesh.scale.set(obj.scale[0] || 1, obj.scale[1] || 1, obj.scale[2] || 1);
        }

        scene.add(mesh);
      }
    }

    function createGeometry(type) {
      switch ((type || 'sphere').toLowerCase()) {
        case 'cube': case 'box': return new THREE.BoxGeometry();
        case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1);
        case 'cone': return new THREE.ConeGeometry();
        case 'torus': return new THREE.TorusGeometry();
        case 'capsule': return new THREE.CapsuleGeometry();
        case 'plane': return new THREE.PlaneGeometry();
        case 'ring': return new THREE.RingGeometry();
        case 'dodecahedron': return new THREE.DodecahedronGeometry();
        case 'icosahedron': return new THREE.IcosahedronGeometry();
        case 'octahedron': return new THREE.OctahedronGeometry();
        case 'tetrahedron': return new THREE.TetrahedronGeometry();
        default: return new THREE.SphereGeometry();
      }
    }

    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
</body>
</html>`;
}

function generatePlaygroundHTML() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HoloScript Playground</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0f; color: #fff; min-height: 100vh; display: flex; flex-direction: column; }
    header { background: #111; padding: 1rem 2rem; display: flex; justify-content: space-between;
      align-items: center; border-bottom: 1px solid #333; }
    .logo { font-size: 1.5rem; font-weight: bold; color: #00ffff; }
    main { display: flex; flex: 1; }
    .editor { width: 40%; padding: 1rem; border-right: 1px solid #333; }
    textarea { width: 100%; height: calc(100vh - 150px); background: #1a1a1f; color: #00ffff;
      border: 1px solid #333; border-radius: 8px; padding: 1rem; font-family: 'Fira Code', monospace;
      font-size: 14px; resize: none; }
    .preview { flex: 1; display: flex; flex-direction: column; }
    .toolbar { padding: 0.5rem 1rem; background: #111; display: flex; gap: 0.5rem; }
    button { background: #00ffff; color: #000; border: none; padding: 0.5rem 1rem;
      border-radius: 4px; cursor: pointer; font-weight: bold; }
    button:hover { background: #00cccc; }
    button.secondary { background: #333; color: #fff; }
    iframe { flex: 1; border: none; }
  </style>
</head>
<body>
  <header>
    <div class="logo">🎮 HoloScript Playground</div>
    <div><button onclick="shareScene()">📤 Share on X</button></div>
  </header>
  <main>
    <div class="editor">
      <textarea id="code" placeholder="Write HoloScript here...">object "GlowingOrb" @grabbable @glowing {
  geometry: "sphere"
  color: "#00ffff"
  position: [0, 1.5, 0]
}</textarea>
    </div>
    <div class="preview">
      <div class="toolbar">
        <button onclick="runCode()">▶️ Run</button>
        <button class="secondary" onclick="enterVR()">🥽 Enter VR</button>
      </div>
      <iframe id="preview-frame"></iframe>
    </div>
  </main>
  <script>
    function runCode() {
      const code = document.getElementById('code').value;
      const encoded = btoa(code);
      document.getElementById('preview-frame').src = '/inline?code=' + encodeURIComponent(encoded);
    }
    
    async function shareScene() {
      const code = document.getElementById('code').value;
      try {
        const res = await fetch('/share', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, title: 'My HoloScript Scene' }),
        });
        const data = await res.json();
        const tweetUrl = 'https://twitter.com/intent/tweet?text=' + 
          encodeURIComponent('🎮 Check out my HoloScript scene!\\n\\n' + data.playground);
        window.open(tweetUrl, '_blank');
      } catch (e) {
        alert('Failed to share: ' + e.message);
      }
    }
    
    function enterVR() {
      alert('VR mode available in the preview frame!');
    }
    
    setTimeout(runCode, 500);
    
    const params = new URLSearchParams(window.location.search);
    if (params.has('scene')) {
      fetch('/scene/' + params.get('scene') + '/code')
        .then(r => r.text())
        .then(code => {
          document.getElementById('code').value = code;
          runCode();
        });
    }
  </script>
</body>
</html>`;
}
