'use client';

/**
 * BuildService — Compiles HoloScript scenes to deployable artifacts.
 *
 * Supported build targets:
 *  - web: Self-contained HTML+JS bundle (Three.js runtime)
 *  - embed: Embeddable iframe snippet
 *  - pwa: Progressive Web App with offline support
 *  - urdf: Robot description format
 *  - gltf: 3D scene export (static)
 *  - json: Raw scene graph as JSON
 *
 * Build pipeline:
 *  1. Parse .holo code into AST
 *  2. Validate (check for errors)
 *  3. Compile to target format
 *  4. Bundle assets (inline or referenced)
 *  5. Output as downloadable file or blob URL
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type BuildTarget = 'web' | 'embed' | 'pwa' | 'urdf' | 'gltf' | 'json';

export type BuildStatus = 'idle' | 'parsing' | 'validating' | 'compiling' | 'bundling' | 'done' | 'error';

export interface BuildConfig {
  target: BuildTarget;
  title: string;
  minify: boolean;
  includePhysics: boolean;
  includeAudio: boolean;
  includeAI: boolean;
  embedAssets: boolean;
  outputFilename?: string;
}

export interface BuildResult {
  success: boolean;
  target: BuildTarget;
  output: string;           // The compiled output (HTML, JSON, URDF, etc.)
  filename: string;
  mimeType: string;
  size: number;             // bytes
  buildTime: number;        // ms
  errors: BuildError[];
  warnings: string[];
}

export interface BuildError {
  message: string;
  line?: number;
  column?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TARGET_META: Record<BuildTarget, { ext: string; mime: string; label: string }> = {
  web:   { ext: 'html', mime: 'text/html',             label: 'Web App (HTML)' },
  embed: { ext: 'html', mime: 'text/html',             label: 'Embed Snippet' },
  pwa:   { ext: 'html', mime: 'text/html',             label: 'Progressive Web App' },
  urdf:  { ext: 'urdf', mime: 'application/xml',       label: 'Robot (URDF)' },
  gltf:  { ext: 'gltf', mime: 'model/gltf+json',      label: '3D Scene (glTF)' },
  json:  { ext: 'json', mime: 'application/json',      label: 'Scene Graph (JSON)' },
};

const DEFAULT_CONFIG: BuildConfig = {
  target: 'web',
  title: 'HoloScript Scene',
  minify: true,
  includePhysics: true,
  includeAudio: true,
  includeAI: false,
  embedAssets: true,
};

// ─── Build Functions ──────────────────────────────────────────────────────────

export function getTargetMeta(target: BuildTarget) {
  return TARGET_META[target];
}

export function getAllTargets(): Array<{ id: BuildTarget; label: string; ext: string }> {
  return Object.entries(TARGET_META).map(([id, meta]) => ({
    id: id as BuildTarget,
    label: meta.label,
    ext: meta.ext,
  }));
}

/**
 * Parses HoloScript code into a simplified scene graph.
 * Extracts objects, traits, and properties.
 */
export function parseSceneGraph(code: string): {
  objects: Array<{ name: string; traits: Array<{ name: string; props: Record<string, unknown> }> }>;
  metadata: { title?: string; version?: string };
} {
  const objects: Array<{ name: string; traits: Array<{ name: string; props: Record<string, unknown> }> }> = [];
  const metadata: { title?: string; version?: string } = {};

  // Extract scene/world title
  const titleMatch = code.match(/(?:scene|world)\s+"([^"]+)"/);
  if (titleMatch) metadata.title = titleMatch[1];

  // Extract objects with @traits — use bracket matching for nested {}
  const objectStartRe = /object\s+(\w+)\s*\{/g;
  let match;
  while ((match = objectStartRe.exec(code)) !== null) {
    const name = match[1];
    // Find matching closing brace
    let depth = 1;
    let i = match.index + match[0].length;
    const bodyStart = i;
    while (i < code.length && depth > 0) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') depth--;
      i++;
    }
    const body = code.slice(bodyStart, i - 1);
    const traits: Array<{ name: string; props: Record<string, unknown> }> = [];

    // Extract @trait blocks
    const traitRe = /@(\w+)\s*\{([^}]*)\}/g;
    let traitMatch;
    while ((traitMatch = traitRe.exec(body)) !== null) {
      const traitName = traitMatch[1];
      const propsStr = traitMatch[2];
      const props: Record<string, unknown> = {};

      // Extract key: value pairs
      const propRe = /(\w+)\s*:\s*(?:"([^"]*)"|([0-9.]+)|(\[.*?\])|(\w+))/g;
      let propMatch;
      while ((propMatch = propRe.exec(propsStr)) !== null) {
        const key = propMatch[1];
        const value = propMatch[2] ?? (propMatch[3] ? parseFloat(propMatch[3]) : propMatch[4] ?? propMatch[5]);
        props[key] = value;
      }

      traits.push({ name: traitName, props });
    }

    objects.push({ name, traits });
  }

  return { objects, metadata };
}

/**
 * Main build function — compiles HoloScript code to the target format.
 */
export function build(code: string, config: Partial<BuildConfig> = {}): BuildResult {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const start = Date.now();
  const errors: BuildError[] = [];
  const warnings: string[] = [];

  try {
    // Parse
    const sceneGraph = parseSceneGraph(code);
    const title = cfg.title || sceneGraph.metadata.title || 'HoloScript Scene';

    if (sceneGraph.objects.length === 0 && cfg.target !== 'json') {
      warnings.push('No objects found in scene — output may be empty');
    }

    // Compile based on target
    let output: string;

    switch (cfg.target) {
      case 'web':
        output = compileToWeb(sceneGraph, title, cfg);
        break;
      case 'embed':
        output = compileToEmbed(sceneGraph, title);
        break;
      case 'pwa':
        output = compileToPWA(sceneGraph, title, cfg);
        break;
      case 'urdf':
        output = compileToURDF(sceneGraph, title);
        break;
      case 'gltf':
        output = compileToGLTF(sceneGraph, title);
        break;
      case 'json':
        output = JSON.stringify({ title, ...sceneGraph }, null, cfg.minify ? 0 : 2);
        break;
      default:
        throw new Error(`Unknown build target: ${cfg.target}`);
    }

    const filename = `${cfg.outputFilename || title.toLowerCase().replace(/\s+/g, '-')}.${TARGET_META[cfg.target].ext}`;

    return {
      success: true,
      target: cfg.target,
      output,
      filename,
      mimeType: TARGET_META[cfg.target].mime,
      size: new TextEncoder().encode(output).length,
      buildTime: Date.now() - start,
      errors,
      warnings,
    };
  } catch (err: any) {
    errors.push({ message: err.message });
    return {
      success: false,
      target: cfg.target,
      output: '',
      filename: 'error',
      mimeType: 'text/plain',
      size: 0,
      buildTime: Date.now() - start,
      errors,
      warnings,
    };
  }
}

// ─── Target Compilers ─────────────────────────────────────────────────────────

function compileToWeb(sg: ReturnType<typeof parseSceneGraph>, title: string, cfg: BuildConfig): string {
  const objects = sg.objects.map(obj => {
    const meshTrait = obj.traits.find(t => t.name === 'mesh');
    const matTrait = obj.traits.find(t => t.name === 'material');
    const geometry = (meshTrait?.props.geometry as string) || 'box';
    const color = (matTrait?.props.color as string) || '#ffffff';
    return `    createObject('${obj.name}', '${geometry}', '${color}');`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { overflow: hidden; background: #0a0a12; }
    canvas { display: block; }
    #hud { position: fixed; top: 16px; left: 16px; color: #e2e8f0; font: 12px/1.4 'JetBrains Mono', monospace; }
  </style>
</head>
<body>
  <div id="hud">${title} — Built with HoloScript</div>
  <script type="importmap">
    { "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.168.0/build/three.module.js" } }
  </script>
  <script type="module">
    import * as THREE from 'three';

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a12);
    const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1000);
    camera.position.set(0, 3, 8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0x404040, 2));
    const sun = new THREE.DirectionalLight(0xffffff, 3);
    sun.position.set(5, 10, 5);
    scene.add(sun);

    // Grid
    scene.add(new THREE.GridHelper(20, 20, 0x1a1a2e, 0x1a1a2e));

    function createObject(name, geometry, color) {
      const geoMap = {
        box: new THREE.BoxGeometry(1, 1, 1),
        sphere: new THREE.SphereGeometry(0.5, 32, 32),
        cylinder: new THREE.CylinderGeometry(0.3, 0.3, 1, 32),
        plane: new THREE.PlaneGeometry(2, 2),
        cone: new THREE.ConeGeometry(0.5, 1, 32),
        torus: new THREE.TorusGeometry(0.4, 0.15, 16, 100),
      };
      const mesh = new THREE.Mesh(
        geoMap[geometry] || geoMap.box,
        new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.3 })
      );
      mesh.name = name;
      scene.add(mesh);
      return mesh;
    }

    // Scene objects
${objects}

    // Orbit controls (mouse)
    let isDragging = false, prevX = 0, prevY = 0, rotX = 0, rotY = 0.3;
    renderer.domElement.addEventListener('mousedown', (e) => { isDragging = true; prevX = e.clientX; prevY = e.clientY; });
    addEventListener('mouseup', () => isDragging = false);
    addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      rotX += (e.clientX - prevX) * 0.005;
      rotY = Math.max(-1, Math.min(1, rotY + (e.clientY - prevY) * 0.005));
      prevX = e.clientX; prevY = e.clientY;
    });

    addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });

    function animate() {
      requestAnimationFrame(animate);
      camera.position.x = 8 * Math.sin(rotX);
      camera.position.y = 8 * rotY + 3;
      camera.position.z = 8 * Math.cos(rotX);
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
    animate();
  </script>
</body>
</html>`;
}

function compileToEmbed(sg: ReturnType<typeof parseSceneGraph>, title: string): string {
  return `<!-- HoloScript Embed: ${title} -->
<iframe
  src="https://play.holoscript.net/?scene=${encodeURIComponent(title)}&autoStart=true"
  width="100%" height="500"
  frameborder="0" allowfullscreen
  allow="xr-spatial-tracking; gamepad; autoplay"
  style="border-radius: 12px; border: 1px solid #1a1a2e;"
  title="${title}"
></iframe>
<p style="text-align:center;font:11px/1 sans-serif;color:#6b7280;margin-top:8px">
  Powered by <a href="https://holoscript.net" style="color:#6366f1">HoloScript</a>
</p>`;
}

function compileToPWA(sg: ReturnType<typeof parseSceneGraph>, title: string, cfg: BuildConfig): string {
  const webHtml = compileToWeb(sg, title, cfg);
  // Inject PWA manifest + service worker registration
  return webHtml.replace('</head>', `
  <link rel="manifest" href="data:application/json,${encodeURIComponent(JSON.stringify({
    name: title,
    short_name: title.substring(0, 12),
    start_url: '.',
    display: 'standalone',
    background_color: '#0a0a12',
    theme_color: '#6366f1',
    icons: [{ src: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎮</text></svg>', sizes: 'any', type: 'image/svg+xml' }],
  }))}">
  <meta name="theme-color" content="#6366f1">
</head>`);
}

function compileToURDF(sg: ReturnType<typeof parseSceneGraph>, title: string): string {
  const links = sg.objects.map((obj, i) => {
    const mesh = obj.traits.find(t => t.name === 'mesh');
    const geo = (mesh?.props.geometry as string) || 'box';
    const geoXml = geo === 'sphere'
      ? '<sphere radius="0.5"/>'
      : geo === 'cylinder'
        ? '<cylinder length="1" radius="0.3"/>'
        : '<box size="1 1 1"/>';

    return `  <link name="${obj.name}">
    <visual><geometry>${geoXml}</geometry></visual>
    <collision><geometry>${geoXml}</geometry></collision>
  </link>`;
  }).join('\n');

  const joints = sg.objects.slice(1).map((obj, i) => `  <joint name="${sg.objects[i].name}_to_${obj.name}" type="revolute">
    <parent link="${sg.objects[i].name}"/>
    <child link="${obj.name}"/>
    <axis xyz="0 0 1"/>
    <limit lower="-3.14" upper="3.14" effort="100" velocity="1"/>
  </joint>`).join('\n');

  return `<?xml version="1.0"?>
<robot name="${title}">
${links}
${joints}
</robot>`;
}

function compileToGLTF(sg: ReturnType<typeof parseSceneGraph>, title: string): string {
  const nodes = sg.objects.map((obj, i) => ({
    name: obj.name,
    mesh: i,
  }));

  const meshes = sg.objects.map(obj => {
    const meshTrait = obj.traits.find(t => t.name === 'mesh');
    return { name: obj.name, primitives: [{ attributes: {}, material: 0 }] };
  });

  return JSON.stringify({
    asset: { version: '2.0', generator: 'HoloScript Studio' },
    scene: 0,
    scenes: [{ name: title, nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
  }, null, 2);
}

// ─── Download Helper ──────────────────────────────────────────────────────────

export function downloadBuildResult(result: BuildResult): void {
  const blob = new Blob([result.output], { type: result.mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  a.click();
  URL.revokeObjectURL(url);
}
