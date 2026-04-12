/**
 * HoloScript Renderer and Sharing Utilities
 *
 * Remote rendering and X platform sharing for AI agents.
 * Includes scene persistence with short UUID URLs and server-side screenshot rendering.
 */

import { randomUUID } from 'crypto';

// =============================================================================
// Scene Persistence Store
// =============================================================================

export interface SceneProvenance {
  /** SHA-256 hex hash of the composition source */
  hash: string;
  /** Auto-classified: original (no imports), remix (imports + own content), curated (imports only) */
  publishMode: 'original' | 'remix' | 'curated';
  /** Tracked imports with their hashes */
  imports: { path: string; hash?: string }[];
}

export interface StoredScene {
  id: string;
  code: string;
  title: string;
  description: string;
  createdAt: number;
  accessCount: number;
  /** Author identifier (@username or freeform) */
  author?: string;
  /** License type */
  license?: string;
  /** Provenance metadata (compiler-generated) */
  provenance?: SceneProvenance;
  /** Cached PNG thumbnail (base64-encoded) */
  thumbnail?: string;
  /** Whether thumbnail generation is in progress */
  thumbnailPending?: boolean;
}

/** In-memory scene store. Replace with Redis/SQLite for production persistence. */
const sceneStore = new Map<string, StoredScene>();

/** Maximum number of cached scenes (LRU eviction) */
const MAX_SCENES = 1000;

/** Generate a short 8-char scene ID from UUID */
function generateShortId(): string {
  return randomUUID().replace(/-/g, '').slice(0, 8);
}

export interface StoreSceneOptions {
  title?: string;
  description?: string;
  author?: string;
  license?: string;
  provenance?: SceneProvenance;
}

/**
 * Store a scene and return a short URL-safe ID.
 */
export function storeScene(
  code: string,
  titleOrOptions?: string | StoreSceneOptions,
  description?: string
): StoredScene {
  // Evict oldest scenes if at capacity
  if (sceneStore.size >= MAX_SCENES) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, scene] of sceneStore) {
      if (scene.createdAt < oldestTime) {
        oldestTime = scene.createdAt;
        oldestKey = key;
      }
    }
    if (oldestKey) sceneStore.delete(oldestKey);
  }

  // Support both legacy (title, description) and new options-object signatures
  const opts: StoreSceneOptions =
    typeof titleOrOptions === 'object' && titleOrOptions !== null
      ? titleOrOptions
      : { title: titleOrOptions, description };

  const id = generateShortId();
  const scene: StoredScene = {
    id,
    code,
    title: opts.title || 'HoloScript Scene',
    description: opts.description || 'Interactive 3D scene built with HoloScript',
    createdAt: Date.now(),
    accessCount: 0,
    author: opts.author,
    license: opts.license,
    provenance: opts.provenance,
  };
  sceneStore.set(id, scene);
  return scene;
}

/**
 * Retrieve a stored scene by short ID.
 */
export function getScene(id: string): StoredScene | null {
  const scene = sceneStore.get(id);
  if (scene) {
    scene.accessCount++;
  }
  return scene || null;
}

/**
 * Find a scene by author username and composition name/id.
 * Used by the registry endpoint to resolve @username/name imports.
 */
export function findSceneByAuthor(username: string, name: string): StoredScene | null {
  for (const scene of sceneStore.values()) {
    if (scene.author === username && (scene.title === name || scene.id === name)) {
      return scene;
    }
  }
  return null;
}

// =============================================================================
// Thumbnail Generation (Playwright headless screenshot)
// =============================================================================

/** In-memory thumbnail cache for scenes without stored thumbnails */
const thumbnailCache = new Map<string, Buffer>();

/**
 * Generate a PNG thumbnail for a scene using Playwright headless browser.
 * Runs async — call after storeScene() to populate the thumbnail field.
 */
export async function generateThumbnail(
  sceneId: string,
  width = 1200,
  height = 630
): Promise<Buffer | null> {
  // Return cached thumbnail if available
  const cached = thumbnailCache.get(sceneId);
  if (cached) return cached;

  const scene = sceneStore.get(sceneId);
  if (!scene) return null;
  if (scene.thumbnail) return Buffer.from(scene.thumbnail, 'base64');

  // Mark as pending to avoid duplicate generation
  if (scene.thumbnailPending) return null;
  scene.thumbnailPending = true;

  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      args: ['--headless', '--disable-gpu', '--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width, height } });

    // Render the scene HTML directly (no network round-trip)
    const html = generateBrowserTemplate(scene.code, scene.title);
    await page.setContent(html, { waitUntil: 'networkidle' });

    // Wait for Three.js to render at least one frame
    await page.waitForTimeout(2000);

    const screenshot = await page.screenshot({ type: 'png' });
    await browser.close();

    // Cache the thumbnail
    const buffer = Buffer.from(screenshot);
    scene.thumbnail = buffer.toString('base64');
    scene.thumbnailPending = false;
    thumbnailCache.set(sceneId, buffer);

    return buffer;
  } catch (err) {
    scene.thumbnailPending = false;
    console.error(`[thumbnail] Failed to generate for scene ${sceneId}:`, err);
    return null;
  }
}

/**
 * Get a scene's thumbnail buffer, or null if not yet generated.
 */
export function getThumbnail(sceneId: string): Buffer | null {
  const cached = thumbnailCache.get(sceneId);
  if (cached) return cached;

  const scene = sceneStore.get(sceneId);
  if (scene?.thumbnail) {
    const buffer = Buffer.from(scene.thumbnail, 'base64');
    thumbnailCache.set(sceneId, buffer);
    return buffer;
  }
  return null;
}

// =============================================================================
// Types
// =============================================================================

interface RenderOptions {
  code: string;
  format?: 'png' | 'gif' | 'mp4' | 'webp';
  resolution?: number[];
  camera?: {
    position?: number[];
    target?: number[];
  };
  duration?: number;
  quality?: 'draft' | 'preview' | 'production';
  skipRemote?: boolean;
}

interface ShareOptions {
  code: string;
  title?: string;
  description?: string;
  platform?: 'x' | 'generic' | 'codesandbox' | 'stackblitz';
  skipRemote?: boolean;
}

interface RenderResult {
  success: boolean;
  url?: string;
  previewUrl?: string;
  embedCode?: string;
  error?: string;
  localPath?: string;
  base64?: string;
}

interface ShareResult {
  playgroundUrl: string;
  embedUrl: string;
  tweetText: string;
  qrCode?: string;
  cardMeta?: Record<string, string>;
}

// Base URL for hosted services (configurable)
const RAILWAY_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN;
const RENDER_SERVICE_URL =
  process.env.HOLOSCRIPT_RENDER_URL ||
  (RAILWAY_DOMAIN ? `https://${RAILWAY_DOMAIN}` : 'http://localhost:3000');
const PLAYGROUND_URL =
  process.env.HOLOSCRIPT_PLAYGROUND_URL ||
  (RAILWAY_DOMAIN ? `https://${RAILWAY_DOMAIN}` : 'http://localhost:3000');

/**
 * Generate a static preview render of HoloScript code
 */
export async function renderPreview(options: RenderOptions): Promise<RenderResult> {
  const {
    code,
    format: _format = 'png',
    resolution = [800, 600],
    camera: _camera = { position: [0, 2, 5], target: [0, 0, 0] },
    duration: _duration = 3000,
    quality: _quality = 'preview',
  } = options;

  // Validate code first
  const validationResult = quickValidate(code);
  if (!validationResult.valid) {
    return {
      success: false,
      error: `Invalid HoloScript code: ${validationResult.errors.join(', ')}`,
    };
  }

  // Check if configured for remote rendering (skip when serving locally to avoid recursion)
  if (!options.skipRemote && RENDER_SERVICE_URL && RENDER_SERVICE_URL !== 'http://localhost:3000') {
    try {
      // Use /share endpoint to store scene and get URLs
      const response = await fetch(`${RENDER_SERVICE_URL}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code,
          title: 'HoloScript Preview',
          description: 'Generated by HoloScript MCP',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        return {
          success: true,
          url: result.preview,
          previewUrl: result.embed,
          embedCode: generateEmbedCode(result.embed, resolution),
        };
      }
    } catch (_error) {
      // Fall through to local/mock rendering
    }
  }

  // Store scene and generate short URL
  const scene = storeScene(code, 'HoloScript Preview');
  const previewUrl = `${PLAYGROUND_URL}/scene/${scene.id}`;
  const thumbnailUrl = `${PLAYGROUND_URL}/api/scene/${scene.id}/thumbnail`;

  // Trigger async thumbnail generation (non-blocking)
  generateThumbnail(scene.id).catch((e) =>
    console.warn(`[renderer] Thumbnail generation failed for scene ${scene.id}: ${(e as Error)?.message ?? e}. Preview will use fallback.`)
  );

  return {
    success: true,
    url: thumbnailUrl,
    previewUrl,
    embedCode: generateEmbedCode(previewUrl, resolution),
    localPath: undefined,
    base64: undefined,
  };
}

/**
 * Create shareable links for X and other platforms
 */
export async function createShareLink(options: ShareOptions): Promise<ShareResult> {
  const {
    code,
    title = 'HoloScript Scene',
    description = 'Interactive 3D scene built with HoloScript',
    platform = 'x',
  } = options;

  // Try to use the remote render service (skip when serving locally to avoid recursion)
  if (!options.skipRemote && RENDER_SERVICE_URL && RENDER_SERVICE_URL !== 'http://localhost:3000') {
    try {
      const response = await fetch(`${RENDER_SERVICE_URL}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code, title, description }),
      });

      if (response.ok) {
        const result = await response.json();
        const playgroundUrl = result.playground;
        const embedUrl = result.embed;

        return {
          playgroundUrl,
          embedUrl,
          tweetText: generateTweetText(title, description, playgroundUrl),
          qrCode: result.qr,
          cardMeta: generateCardMeta(title, description, embedUrl),
        };
      }
    } catch (_error) {
      // Fall through to local generation
    }
  }

  // Store scene and generate short URLs
  const scene = storeScene(code, title, description);
  const playgroundUrl = `${PLAYGROUND_URL}/scene/${scene.id}`;
  const embedUrl = `${PLAYGROUND_URL}/embed/${scene.id}`;

  // Generate X-optimized tweet text
  const tweetText = generateTweetText(title, description, playgroundUrl);

  // Generate QR code data URL (for mobile XR access)
  const qrCode = generateQRCodeDataUrl(playgroundUrl);

  // Generate Twitter Card meta tags (with thumbnail URL)
  const cardMeta = generateCardMeta(title, description, embedUrl, scene.id);

  // Trigger async thumbnail generation
  generateThumbnail(scene.id).catch((e) =>
    console.warn(`[renderer] Thumbnail generation failed for scene ${scene.id}: ${(e as Error)?.message ?? e}. Preview will use fallback.`)
  );

  return {
    playgroundUrl,
    embedUrl,
    tweetText,
    qrCode,
    cardMeta,
  };
}

// === Helper Functions ===

function quickValidate(code: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Basic syntax checks
  if (!code.trim()) {
    errors.push('Empty code');
  }

  // Check for balanced braces
  const openBraces = (code.match(/{/g) || []).length;
  const closeBraces = (code.match(/}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push('Unbalanced braces');
  }

  // Check for common typos
  if (code.includes('geomety:') || code.includes('geomtry:')) {
    errors.push("Typo: 'geomety' should be 'geometry'");
  }
  if (code.includes('positon:')) {
    errors.push("Typo: 'positon' should be 'position'");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function _generatePlaygroundUrl(code: string, title: string, platform: string): string {
  // Compress code for URL
  const compressed = compressCode(code);

  // Platform-specific URLs
  switch (platform) {
    case 'codesandbox':
      return generateCodeSandboxUrl(code, title);
    case 'stackblitz':
      return generateStackBlitzUrl(code, title);
    default:
      return `${PLAYGROUND_URL}?code=${compressed}&title=${encodeURIComponent(title)}`;
  }
}

function _generateEmbedUrl(code: string): string {
  const compressed = compressCode(code);
  return `${PLAYGROUND_URL}/embed?code=${compressed}`;
}

function compressCode(code: string): string {
  // Base64 encoding is sufficient for most use cases
  // LZ-string compression could reduce URL length by ~50% but adds dependency
  // For very large scenes, consider using stored scene IDs instead
  return encodeURIComponent(Buffer.from(code).toString('base64'));
}

function generateCodeSandboxUrl(code: string, title: string): string {
  // CodeSandbox API format
  const files = {
    'index.html': {
      content: generateBrowserTemplate(code, title),
    },
    'scene.holo': {
      content: code,
    },
    'package.json': {
      content: JSON.stringify(
        {
          name: title.toLowerCase().replace(/\s+/g, '-'),
          main: 'index.html',
          dependencies: {
            '@hololand/three-adapter': 'latest',
            three: 'latest',
          },
        },
        null,
        2
      ),
    },
  };

  const parameters = encodeURIComponent(Buffer.from(JSON.stringify({ files })).toString('base64'));
  return `https://codesandbox.io/api/v1/sandboxes/define?parameters=${parameters}`;
}

function generateStackBlitzUrl(code: string, title: string): string {
  // StackBlitz URL format
  const project = {
    title,
    description: 'HoloScript Scene',
    template: 'html',
    files: {
      'index.html': generateBrowserTemplate(code, title),
      'scene.holo': code,
    },
  };

  const params = new URLSearchParams({
    title: project.title,
    description: project.description,
  });

  return `https://stackblitz.com/fork/github/holoscript/playground-template?${params}`;
}

function generateTweetText(title: string, description: string, url: string): string {
  // Optimize for X's character limit
  const maxDescLength = 200 - title.length - url.length - 20;
  const truncatedDesc =
    description.length > maxDescLength
      ? description.substring(0, maxDescLength - 3) + '...'
      : description;

  return `🎮 ${title}

${truncatedDesc}

Try it in VR/AR: ${url}

#HoloScript #VR #XR #Metaverse #3D`;
}

function generateQRCodeDataUrl(url: string): string {
  // Simple QR code generation placeholder
  // In production, use a library like 'qrcode'
  // For now, return a service URL
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
}

function generateCardMeta(
  title: string,
  description: string,
  embedUrl: string,
  sceneId?: string
): Record<string, string> {
  const meta: Record<string, string> = {
    'og:title': title,
    'og:description': description,
    'og:type': 'website',
    'og:url': embedUrl,
    'twitter:title': title,
    'twitter:description': description,
    'twitter:player': embedUrl,
    'twitter:player:width': '800',
    'twitter:player:height': '600',
  };

  if (sceneId) {
    const thumbnailUrl = `${PLAYGROUND_URL}/api/scene/${sceneId}/thumbnail`;
    meta['og:image'] = thumbnailUrl;
    meta['og:image:width'] = '1200';
    meta['og:image:height'] = '630';
    meta['twitter:card'] = 'summary_large_image';
    meta['twitter:image'] = thumbnailUrl;
  } else {
    meta['twitter:card'] = 'player';
  }

  return meta;
}

function generateEmbedCode(previewUrl: string, resolution: number[]): string {
  const [width, height] = resolution;
  return `<iframe 
  src="${previewUrl}" 
  width="${width}" 
  height="${height}" 
  frameborder="0" 
  allowfullscreen 
  allow="xr-spatial-tracking"
></iframe>`;
}

export function generateBrowserTemplate(code: string, title: string, sceneId?: string): string {
  const thumbnailUrl = sceneId ? `${PLAYGROUND_URL}/api/scene/${sceneId}/thumbnail` : undefined;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>

  <!-- OpenGraph -->
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="Interactive 3D scene built with HoloScript">
  <meta property="og:type" content="website">${thumbnailUrl ? `\n  <meta property="og:image" content="${thumbnailUrl}">` : ''}${sceneId ? `\n  <meta property="og:url" content="${PLAYGROUND_URL}/scene/${sceneId}">` : ''}

  <!-- Twitter Card -->
  <meta name="twitter:card" content="${thumbnailUrl ? 'summary_large_image' : 'player'}">
  <meta name="twitter:title" content="${escapeHtml(title)}">${thumbnailUrl ? `\n  <meta name="twitter:image" content="${thumbnailUrl}">` : ''}
  <meta name="twitter:player" content="${PLAYGROUND_URL}/embed">
  <meta name="twitter:player:width" content="800">
  <meta name="twitter:player:height" content="600">
  
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      background: #000; 
      display: flex; 
      justify-content: center; 
      align-items: center;
      min-height: 100vh;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    #container { 
      width: 100%; 
      height: 100vh; 
    }
    #loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #fff;
      font-size: 1.5rem;
    }
    #vr-button {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: #4a9eff;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 1rem;
      cursor: pointer;
    }
    #vr-button:hover { background: #3a8eff; }
    #vr-button:disabled { background: #666; cursor: not-allowed; }
  </style>
</head>
<body>
  <div id="container"></div>
  <div id="loading">Loading HoloScript scene...</div>
  <button id="vr-button" disabled>Enter VR</button>
  
  <script type="module">
    import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
    import { VRButton } from 'https://unpkg.com/three@0.160.0/examples/jsm/webxr/VRButton.js';
    
    // HoloScript code embedded
    const holoCode = \`${escapeBackticks(code)}\`;
    
    // Initialize Three.js scene
    const container = document.getElementById('container');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.xr.enabled = true;
    container.appendChild(renderer.domElement);
    
    // Add VR button if supported
    if ('xr' in navigator) {
      navigator.xr.isSessionSupported('immersive-vr').then(supported => {
        const vrButton = document.getElementById('vr-button');
        if (supported) {
          vrButton.disabled = false;
          container.appendChild(VRButton.createButton(renderer));
        } else {
          vrButton.textContent = 'VR Not Supported';
        }
      });
    }
    
    // Basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 10, 5);
    scene.add(directionalLight);
    
    // Default skybox
    scene.background = new THREE.Color(0x1a1a2e);
    
    camera.position.set(0, 1.6, 5);
    
    // Hide loading
    document.getElementById('loading').style.display = 'none';
    
    // Parse HoloScript and create objects
    const sceneObjects = [];
    
    function parseHoloCode(code) {
      const objects = [];
      // Match object definitions: object "name" @traits { ... }
      const objectRegex = /(?:object|orb|cube|sphere|box|plane)\\s+["']?([\\w-]+)["']?\\s*([^{]*)\\{([^}]*)\\}/gi;
      let match;
      
      while ((match = objectRegex.exec(code)) !== null) {
        const name = match[1];
        const traitsStr = match[2] || '';
        const propsStr = match[3] || '';
        
        const obj = { name, traits: [], props: {} };
        
        // Extract traits (@grabbable, @collidable, etc.)
        const traitMatches = traitsStr.match(/@\\w+/g);
        if (traitMatches) obj.traits = traitMatches;
        
        // Extract geometry
        const geoMatch = propsStr.match(/geometry:\\s*["']?(\\w+)["']?/i);
        obj.props.geometry = geoMatch ? geoMatch[1] : 'sphere';
        
        // Extract position
        const posMatch = propsStr.match(/position:\\s*\\[([^\\]]+)\\]/i);
        if (posMatch) {
          obj.props.position = posMatch[1].split(',').map(n => parseFloat(n.trim()));
        }
        
        // Extract color
        const colorMatch = propsStr.match(/color:\\s*["']?([#\\w]+)["']?/i);
        if (colorMatch) obj.props.color = colorMatch[1];
        
        // Extract scale
        const scaleMatch = propsStr.match(/scale:\\s*([\\d.]+|\\[[^\\]]+\\])/i);
        if (scaleMatch) {
          const val = scaleMatch[1];
          if (val.startsWith('[')) {
            obj.props.scale = val.slice(1, -1).split(',').map(n => parseFloat(n.trim()));
          } else {
            const s = parseFloat(val);
            obj.props.scale = [s, s, s];
          }
        }
        
        objects.push(obj);
      }
      
      return objects;
    }
    
    function createGeometry(type) {
      switch (type?.toLowerCase()) {
        case 'sphere': case 'orb': return new THREE.SphereGeometry(0.5, 32, 32);
        case 'cube': case 'box': return new THREE.BoxGeometry(1, 1, 1);
        case 'plane': return new THREE.PlaneGeometry(2, 2);
        case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        case 'cone': return new THREE.ConeGeometry(0.5, 1, 32);
        case 'torus': return new THREE.TorusGeometry(0.4, 0.15, 16, 48);
        default: return new THREE.SphereGeometry(0.5, 32, 32);
      }
    }
    
    function colorToHex(color) {
      if (!color) return 0x00ffff;
      if (typeof color === 'number') return color;
      if (color.startsWith('#')) return parseInt(color.slice(1), 16);
      const colors = { red: 0xff0000, green: 0x00ff00, blue: 0x0000ff, yellow: 0xffff00, 
                       cyan: 0x00ffff, magenta: 0xff00ff, white: 0xffffff, black: 0x000000,
                       orange: 0xffa500, purple: 0x800080, pink: 0xffc0cb };
      return colors[color.toLowerCase()] || 0x00ffff;
    }
    
    // Parse and create objects from HoloScript
    const parsedObjects = parseHoloCode(holoCode);
    
    for (const obj of parsedObjects) {
      const geometry = createGeometry(obj.props.geometry);
      const color = colorToHex(obj.props.color);
      const material = new THREE.MeshStandardMaterial({ 
        color: color,
        emissive: color,
        emissiveIntensity: 0.2
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = obj.name;
      
      if (obj.props.position) {
        mesh.position.set(...obj.props.position);
      }
      if (obj.props.scale) {
        mesh.scale.set(...obj.props.scale);
      }
      
      scene.add(mesh);
      sceneObjects.push(mesh);
    }
    
    // If no objects parsed, create default placeholder
    if (sceneObjects.length === 0) {
      const geometry = new THREE.SphereGeometry(0.5, 32, 32);
      const material = new THREE.MeshStandardMaterial({ 
        color: 0x00ffff, 
        emissive: 0x00ffff,
        emissiveIntensity: 0.3
      });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.set(0, 1, -2);
      scene.add(sphere);
      sceneObjects.push(sphere);
    }
    
    // Animation - rotate all objects gently
    function animate() {
      for (const obj of sceneObjects) {
        obj.rotation.y += 0.005;
      }
      renderer.setAnimationLoop(render);
    }
    
    function render() {
      renderer.render(scene, camera);
    }
    
    animate();
    
    // Handle resize
    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeBackticks(str: string): string {
  return str.replace(/`/g, '\\`').replace(/\$/g, '\\$');
}
