/**
 * HoloScript Live Preview Panel
 *
 * Provides a real-time 3D preview of HoloScript scenes in VS Code.
 * Uses a WebView with Three.js for rendering.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { RelayService } from './services/RelayService';

export class HoloScriptPreviewPanel {
  public static currentPanel: HoloScriptPreviewPanel | undefined;
  public static readonly viewType = 'holoscriptPreview';

  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];
  private _currentDocument: vscode.TextDocument | undefined;

  public static createOrShow(extensionUri: vscode.Uri, document?: vscode.TextDocument) {
    const column = vscode.ViewColumn.Beside;

    // If we already have a panel, show it
    if (HoloScriptPreviewPanel.currentPanel) {
      HoloScriptPreviewPanel.currentPanel._panel.reveal(column);
      if (document) {
        HoloScriptPreviewPanel.currentPanel.updateContent(document);
      }
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      HoloScriptPreviewPanel.viewType,
      'HoloScript Preview',
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'node_modules'),
        ],
      }
    );

    HoloScriptPreviewPanel.currentPanel = new HoloScriptPreviewPanel(panel, extensionUri);

    if (document) {
      HoloScriptPreviewPanel.currentPanel.updateContent(document);
    }
  }

  public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    HoloScriptPreviewPanel.currentPanel = new HoloScriptPreviewPanel(panel, extensionUri);
  }

  private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
    this._panel = panel;
    this._extensionUri = extensionUri;

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Update the content based on view state changes
    this._panel.onDidChangeViewState(
      (_e) => {
        if (this._panel.visible) {
          this._update();
        }
      },
      null,
      this._disposables
    );

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      (message) => {
        switch (message.command) {
          case 'error':
            vscode.window.showErrorMessage(message.text);
            return;
          case 'info':
            vscode.window.showInformationMessage(message.text);
            return;
          case 'ready':
            // Webview is ready, send current content
            if (this._currentDocument) {
              this._sendUpdate();
            }
            return;
          case 'transform':
          case 'voice_command':
          case 'inject_asset':
            if (this._currentDocument) {
              RelayService.getInstance().handleMessage(message, this._currentDocument);
            }
            return;
          case 'voice_start':
            vscode.window
              .showInputBox({
                prompt: 'Say a command...',
                placeHolder: "e.g., 'Add a red cube at 0,1,0'",
              })
              .then((text) => {
                if (text && this._currentDocument) {
                  RelayService.getInstance().handleMessage(
                    { type: 'voice_command', text },
                    this._currentDocument
                  );
                }
              });
            return;
        }
      },
      null,
      this._disposables
    );

    // Watch for document changes
    vscode.workspace.onDidChangeTextDocument(
      (e) => {
        if (this._currentDocument && e.document === this._currentDocument) {
          this._sendUpdate();
        }
      },
      null,
      this._disposables
    );
  }

  public updateContent(document: vscode.TextDocument) {
    this._currentDocument = document;
    this._panel.title = `Preview: ${path.basename(document.fileName)}`;
    this._sendUpdate();
  }

  private _sendUpdate() {
    if (!this._currentDocument) return;

    const content = this._currentDocument.getText();
    const fileName = this._currentDocument.fileName;

    this._panel.webview.postMessage({
      command: 'update',
      content,
      fileName,
      isHoloPlus: fileName.endsWith('.hsplus'),
    });
  }

  public dispose() {
    HoloScriptPreviewPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }

  private _update() {
    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    // Use a nonce to only allow specific scripts to be run
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net; img-src ${webview.cspSource} https: data:; connect-src https:;">
  <title>HoloScript Preview</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      overflow: hidden;
      background-color: #1e1e1e;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
    }
    #container {
      width: 100vw;
      height: 100vh;
      position: relative;
    }
    #canvas {
      width: 100%;
      height: 100%;
      display: block;
    }
    #overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      padding: 10px;
      background: linear-gradient(to bottom, rgba(0,0,0,0.7), transparent);
      color: #fff;
      font-size: 12px;
      pointer-events: none;
    }
    #stats {
      position: absolute;
      bottom: 10px;
      left: 10px;
      background: rgba(0,0,0,0.7);
      padding: 8px 12px;
      border-radius: 4px;
      color: #fff;
      font-size: 11px;
      font-family: monospace;
    }
    #toolbar {
      position: absolute;
      top: 10px;
      right: 10px;
      display: flex;
      gap: 8px;
    }
    .toolbar-btn {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 4px;
      color: #fff;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.2s;
      pointer-events: auto;
    }
    .toolbar-btn:hover {
      background: rgba(255,255,255,0.2);
    }
    .toolbar-btn.active {
      background: #007acc;
      border-color: #007acc;
    }
    #error-panel {
      position: absolute;
      bottom: 50px;
      left: 10px;
      right: 10px;
      background: rgba(200, 50, 50, 0.9);
      padding: 12px;
      border-radius: 4px;
      color: #fff;
      font-size: 12px;
      display: none;
    }
    #error-panel.visible {
      display: block;
    }
    #loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: #888;
      font-size: 14px;
      text-align: center;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: #007acc;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 12px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    #asset-browser {
      position: absolute;
      top: 50px;
      right: 10px;
      width: 200px;
      max-height: 400px;
      background: rgba(30, 30, 46, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 8px;
      padding: 10px;
      display: none;
      overflow-y: auto;
      backdrop-filter: blur(10px);
    }
    #asset-browser.visible {
      display: block;
    }
    .asset-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .asset-item {
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
      padding: 8px;
      text-align: center;
      cursor: pointer;
      transition: background 0.2s;
    }
    .asset-item:hover {
      background: rgba(255, 255, 255, 0.15);
    }
    .asset-icon {
      font-size: 24px;
      margin-bottom: 4px;
    }
    .asset-name {
      font-size: 10px;
      color: #ccc;
    }
    .section-title {
      font-size: 11px;
      font-weight: bold;
      color: #888;
      margin: 8px 0 4px;
      text-transform: uppercase;
    }
    #inspector-overlay {
      position: absolute;
      background: rgba(0, 0, 0, 0.8);
      color: #0f0;
      padding: 8px;
      border: 1px solid #0f0;
      border-radius: 4px;
      font-family: monospace;
      font-size: 11px;
      pointer-events: none; /* Let mouse pass through */
      display: none;
      z-index: 100;
      white-space: pre;
    }
  </style>
  <script nonce="${nonce}">
    // Mock Assets Database
    const MOCK_ASSETS = [
      { id: 'cube', name: 'Cube', icon: '📦', type: 'primitive' },
      { id: 'sphere', name: 'Sphere', icon: '⚪', type: 'primitive' },
      { id: 'light', name: 'Point Light', icon: '💡', type: 'light' },
      { id: 'chair', name: 'Modern Chair', icon: '🪑', type: 'model' },
      { id: 'tree', name: 'Pine Tree', icon: '🌲', type: 'model' },
      { id: 'robot', name: 'Bot', icon: '🤖', type: 'npc' }
    ];
  </script>
</head>
<body>
  <div id="container">
    <canvas id="canvas"></canvas>
    <div id="overlay">
      <span id="file-name">No file loaded</span>
    </div>
    <div id="inspector-overlay"></div>
    <div id="asset-browser">
      <div class="section-title">Result</div>
      <div class="asset-grid" id="asset-grid">
        <!-- Injected via JS -->
      </div>
    </div>
    <div id="toolbar">
      <button class="toolbar-btn" id="btn-reset" title="Reset Camera">🎥 Reset</button>
      <button class="toolbar-btn" id="btn-wireframe" title="Toggle Wireframe">🔲 Wire</button>
      <button class="toolbar-btn" id="btn-grid" title="Toggle Grid">📐 Grid</button>
      <button class="toolbar-btn" id="btn-axes" title="Toggle Axes">📊 Axes</button>
      <button class="toolbar-btn" id="btn-edit" title="Toggle Director Mode">🎬 Edit Mode</button>
      <button class="toolbar-btn" id="btn-voice" title="Voice Command">🎤 Voice</button>
      <button class="toolbar-btn" id="btn-assets" title="Asset Browser">📦 Assets</button>
      <div style="width: 1px; background: rgba(255,255,255,0.2); margin: 0 4px;"></div>
      <button class="toolbar-btn" id="btn-pause" title="Pause/Play">⏸️</button>
      <button class="toolbar-btn" id="btn-step" title="Step Frame">⏭️</button>
    </div>
    <div id="stats">
      <div>Objects: <span id="stat-objects">0</span></div>
      <div>FPS: <span id="stat-fps">0</span></div>
    </div>
    <div id="error-panel"></div>
    <div id="loading">
      <div class="spinner"></div>
      Initializing 3D Preview...
    </div>
  </div>

  <script nonce="${nonce}">
    // Import Three.js from CDN
    const scriptLoader = document.createElement('script');
    scriptLoader.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js';
    scriptLoader.onload = initPreview;
    document.head.appendChild(scriptLoader);

    const vscode = acquireVsCodeApi();
    
    let scene, camera, renderer, controls, transformControl;
    let gridHelper, axesHelper;
    let objects = [];
    let animatedObjects = []; // Objects with built-in animations
    let particleSystems = []; // Particle emitters
    let wireframeMode = false;
    let showGrid = true;
    let showAxes = true;
    let editMode = false;
    let frameCount = 0;
    let lastTime = performance.now();
    let clock; // THREE.Clock for animations
    let gltfLoader; // For loading .glb/.gltf models
    let fontLoader; // For 3D text
    let defaultFont; // Cached font

    function initPreview() {
      // Load OrbitControls
      const orbitScript = document.createElement('script');
      orbitScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js';
      orbitScript.onload = () => {
        // Load TransformControls
        const transformScript = document.createElement('script');
        transformScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/TransformControls.js';
        transformScript.onload = () => {
          // Load GLTFLoader for .glb/.gltf models
          const gltfScript = document.createElement('script');
          gltfScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js';
          gltfScript.onload = () => {
            // Load FontLoader for 3D text
            const fontScript = document.createElement('script');
            fontScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/FontLoader.js';
            fontScript.onload = () => {
              // Load TextGeometry
              const textGeoScript = document.createElement('script');
              textGeoScript.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/geometries/TextGeometry.js';
              textGeoScript.onload = setupScene;
              document.head.appendChild(textGeoScript);
            };
            document.head.appendChild(fontScript);
          };
          document.head.appendChild(gltfScript);
        };
        document.head.appendChild(transformScript);
      };
      document.head.appendChild(orbitScript);
    }

    function setupScene() {
      const canvas = document.getElementById('canvas');
      const container = document.getElementById('container');

      // Broadcaster for Director Mode
      function broadcastTransform(object) {
        if (!object.name) return;
        vscode.postMessage({
          command: 'transform',
          id: object.name,
          position: [object.position.x, object.position.y, object.position.z],
          rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
          scale: [object.scale.x, object.scale.y, object.scale.z]
        });
      }

      // Clock for animations
      clock = new THREE.Clock();

      // Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e);
      scene.fog = new THREE.Fog(0x1a1a2e, 10, 50);

      // Camera
      camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 1000);
      camera.position.set(5, 5, 5);

      // Renderer with enhanced settings
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setSize(container.clientWidth, container.clientHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.9;
      renderer.physicallyCorrectLights = true;

      // Controls
      controls = new THREE.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.minDistance = 1;
      controls.maxDistance = 100;

      // Transform Controls (Director Mode)
      if (THREE.TransformControls) {
        transformControl = new THREE.TransformControls(camera, renderer.domElement);
        transformControl.addEventListener('dragging-changed', function (event) {
          controls.enabled = !event.value;
        });
        transformControl.addEventListener('mouseUp', function () {
          if (transformControl.object) {
            broadcastTransform(transformControl.object);
          }
        });
        scene.add(transformControl);
      }

      // Raycaster for selection
      const raycaster = new THREE.Raycaster();
      const mouse = new THREE.Vector2();

      function onMouseClick(event) {
        if (!editMode) return;
        
        // Calculate mouse position in normalized device coordinates
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);

        // Intersect objects (filter out helpers)
        const intersects = raycaster.intersectObjects(objects, true);
        
        if (intersects.length > 0) {
          // Find the root object (handle grouped meshes)
          let target = intersects[0].object;
          while (target.parent && target.parent !== scene && !objects.includes(target)) {
             target = target.parent;
          }
          
          if (objects.includes(target)) {
            transformControl.attach(target);
            document.getElementById('file-name').textContent = \`Selected: \${target.name}\`;
          }
        } else {
          transformControl.detach();
          document.getElementById('file-name').textContent = 'No selection';
        }
      }

      window.addEventListener('click', onMouseClick);
      
      // Inspector Hover Logic (Phase 5)
      window.addEventListener('mousemove', (event) => {
        const inspector = document.getElementById('inspector-overlay');
        
        if (!window.isPaused) {
          inspector.style.display = 'none';
          return;
        }

        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersects = raycaster.intersectObjects(objects, true);

        if (intersects.length > 0) {
          let target = intersects[0].object;
          // Traverse up to find root valid object
          while (target.parent && target.parent !== scene && !objects.includes(target)) {
             target = target.parent;
          }

          if (objects.includes(target)) {
             const pos = target.position;
             const rot = target.rotation;
             const scale = target.scale;
             
             inspector.style.display = 'block';
             inspector.style.left = (event.clientX + 10) + 'px';
             inspector.style.top = (event.clientY + 10) + 'px';
             inspector.innerHTML = \`Please wait...\`; // Temp
             inspector.innerText = 
               \`Object: \${target.name || 'Unnamed'}\\n\` +
               \`Pos: [\${pos.x.toFixed(2)}, \${pos.y.toFixed(2)}, \${pos.z.toFixed(2)}]\\n\` +
               \`Rot: [\${rot.x.toFixed(2)}, \${rot.y.toFixed(2)}, \${rot.z.toFixed(2)}]\\n\` +
               \`Scale: [\${scale.x.toFixed(2)}, \${scale.y.toFixed(2)}, \${scale.z.toFixed(2)}]\`;
             return;
          }
        }
        
        inspector.style.display = 'none';
      });

      // Clean up listener on dispose needed later? For simplicity we just add it once.

      // Grid
      gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x333333);
      scene.add(gridHelper);

      // Axes
      axesHelper = new THREE.AxesHelper(5);
      scene.add(axesHelper);

      // Hemisphere light (sky/ground ambient)
      const hemiLight = new THREE.HemisphereLight(0x87CEEB, 0x3d3d5c, 0.4);
      scene.add(hemiLight);

      // Key light (main directional)
      const keyLight = new THREE.DirectionalLight(0xfff5e6, 1.0);
      keyLight.position.set(5, 10, 5);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.width = 2048;
      keyLight.shadow.mapSize.height = 2048;
      keyLight.shadow.camera.near = 0.1;
      keyLight.shadow.camera.far = 50;
      keyLight.shadow.camera.left = -15;
      keyLight.shadow.camera.right = 15;
      keyLight.shadow.camera.top = 15;
      keyLight.shadow.camera.bottom = -15;
      keyLight.shadow.bias = -0.0005;
      scene.add(keyLight);

      // Fill light (softer, opposite side)
      const fillLight = new THREE.DirectionalLight(0x8ec8ff, 0.4);
      fillLight.position.set(-5, 3, -5);
      scene.add(fillLight);

      // Rim light (back lighting for depth)
      const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
      rimLight.position.set(0, 5, -10);
      scene.add(rimLight);

      // Create procedural environment map for reflections
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      pmremGenerator.compileEquirectangularShader();
      const envScene = new THREE.Scene();
      envScene.background = new THREE.Color(0x2a2a4a);
      const envTexture = pmremGenerator.fromScene(envScene, 0.04).texture;
      scene.environment = envTexture;

      // Ground plane (visible dark floor)
      const groundGeometry = new THREE.PlaneGeometry(100, 100);
      const groundMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x0f0f1a, 
        roughness: 0.8,
        metalness: 0.2
      });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      // Initialize GLTF loader for .glb/.gltf models
      if (THREE.GLTFLoader) {
        gltfLoader = new THREE.GLTFLoader();
      }

      // Initialize Font loader and load default font
      if (THREE.FontLoader) {
        fontLoader = new THREE.FontLoader();
        fontLoader.load('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/fonts/helvetiker_regular.typeface.json', (font) => {
          defaultFont = font;
        });
      }

      // Hide loading
      document.getElementById('loading').style.display = 'none';

      // Setup toolbar events
      document.getElementById('btn-reset').addEventListener('click', resetCamera);
      document.getElementById('btn-wireframe').addEventListener('click', toggleWireframe);
      document.getElementById('btn-grid').addEventListener('click', toggleGrid);
      document.getElementById('btn-axes').addEventListener('click', toggleAxes);
      document.getElementById('btn-edit').addEventListener('click', toggleEditMode);
      document.getElementById('btn-assets').addEventListener('click', toggleAssetBrowser);
      document.getElementById('btn-voice').addEventListener('click', () => {
        vscode.postMessage({ command: 'voice_start' });
      });

      // Debugger Controls (Phase 5)
      let isPaused = false;
      let stepOnce = false;

      document.getElementById('btn-pause').addEventListener('click', () => {
        isPaused = !isPaused;
        document.getElementById('btn-pause').textContent = isPaused ? '▶️' : '⏸️';
        document.getElementById('btn-step').disabled = !isPaused;
      });

      document.getElementById('btn-step').addEventListener('click', () => {
        if (isPaused) stepOnce = true;
      });
      
      // Initialize Asset Browser
      const assetGrid = document.getElementById('asset-grid');
      MOCK_ASSETS.forEach(asset => {
        const item = document.createElement('div');
        item.className = 'asset-item';
        item.innerHTML = \`
          <div class="asset-icon">\${asset.icon}</div>
          <div class="asset-name">\${asset.name}</div>
        \`;
        item.onclick = () => {
          vscode.postMessage({ 
            command: 'inject_asset', 
            assetId: asset.id,
            assetType: asset.type 
          });
        };
        assetGrid.appendChild(item);
      });

      // Handle resize
      window.addEventListener('resize', onWindowResize);

      // Start animation
      // animate(); // Move animate call inside to capture variables scope if needed, 
      // but animate is defined outside. We need to modify animate() separately or pass flags.
      // Better approach: modify existing animate() to check isPaused.
      // Since animate() is defined outside initPreview(), we need to make isPaused global or accessible.
      // Let's attach them to window or move animate inside.
      // For now, let's assume we modify animate() below.
      
      window.isPaused = false;
      window.stepOnce = false;
      document.getElementById('btn-pause').onclick = () => {
        window.isPaused = !window.isPaused;
        document.getElementById('btn-pause').textContent = window.isPaused ? '▶️' : '⏸️';
      };
      document.getElementById('btn-step').onclick = () => {
        if (window.isPaused) window.stepOnce = true;
      };

      animate();

      // Notify extension we're ready
      vscode.postMessage({ command: 'ready' });
    }

    function animate() {
      requestAnimationFrame(animate);

      // Debugger: Pause/Step Logic
      const isPaused = window.isPaused;
      const stepOnce = window.stepOnce;
      
      if (isPaused && !stepOnce) {
        controls.update();
        renderer.render(scene, camera);
        return; // Skip physics/animations
      }
      
      if (stepOnce) {
        window.stepOnce = false; // Reset single step
      }
      
      const elapsed = clock.getElapsedTime();
      const delta = clock.getDelta();
      
      // Update animated objects
      animatedObjects.forEach(item => {
        const mesh = item.mesh;
        const anim = item.animation;
        
        switch (anim.type) {
          case 'spin':
          case 'rotate':
            mesh.rotation.y += (anim.speed || 1) * 0.02;
            break;
          case 'float':
          case 'hover':
            mesh.position.y = item.baseY + Math.sin(elapsed * (anim.speed || 1)) * (anim.amplitude || 0.3);
            break;
          case 'pulse':
          case 'breathe':
            const scale = 1 + Math.sin(elapsed * (anim.speed || 2)) * (anim.amplitude || 0.1);
            mesh.scale.setScalar(item.baseScale * scale);
            break;
          case 'orbit':
            const angle = elapsed * (anim.speed || 1);
            const radius = anim.radius || 2;
            mesh.position.x = item.baseX + Math.cos(angle) * radius;
            mesh.position.z = item.baseZ + Math.sin(angle) * radius;
            break;
          case 'sway':
            mesh.rotation.z = Math.sin(elapsed * (anim.speed || 1)) * (anim.amplitude || 0.1);
            break;
          case 'bob':
            mesh.position.y = item.baseY + Math.abs(Math.sin(elapsed * (anim.speed || 2))) * (anim.amplitude || 0.5);
            break;
          case 'flicker':
            if (mesh.material.emissive) {
              mesh.material.emissiveIntensity = 0.3 + Math.random() * 0.7;
            }
            break;
          case 'rainbow':
            mesh.material.color.setHSL((elapsed * (anim.speed || 0.1)) % 1, 0.8, 0.5);
            break;
        }
      });
      
      // Update particle systems
      particleSystems.forEach(particles => {
        const positions = particles.geometry.attributes.position.array;
        const velocities = particles.userData.velocities;
        for (let i = 0; i < positions.length / 3; i++) {
          positions[i * 3] += velocities[i * 3];
          positions[i * 3 + 1] += velocities[i * 3 + 1];
          positions[i * 3 + 2] += velocities[i * 3 + 2];
          // Reset particles that go too high
          if (positions[i * 3 + 1] > 3) {
            positions[i * 3] = (Math.random() - 0.5) * 2;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = (Math.random() - 0.5) * 2;
          }
        }
        particles.geometry.attributes.position.needsUpdate = true;
      });
      
      controls.update();
      renderer.render(scene, camera);
      
      // FPS counter
      frameCount++;
      const now = performance.now();
      if (now - lastTime >= 1000) {
        document.getElementById('stat-fps').textContent = frameCount;
        frameCount = 0;
        lastTime = now;
      }
    }

    function onWindowResize() {
      const container = document.getElementById('container');
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    }

    function resetCamera() {
      camera.position.set(5, 5, 5);
      controls.target.set(0, 0, 0);
      controls.update();
    }

    function toggleWireframe() {
      wireframeMode = !wireframeMode;
      objects.forEach(obj => {
        if (obj.material) {
          obj.material.wireframe = wireframeMode;
        }
      });
      document.getElementById('btn-wireframe').classList.toggle('active', wireframeMode);
    }

    function toggleGrid() {
      showGrid = !showGrid;
      gridHelper.visible = showGrid;
      document.getElementById('btn-grid').classList.toggle('active', showGrid);
    }

    function toggleAxes() {
      showAxes = !showAxes;
      axesHelper.visible = showAxes;
      document.getElementById('btn-axes').classList.toggle('active', showAxes);
    }

    function toggleEditMode() {
      editMode = !editMode;
      document.getElementById('btn-edit').classList.toggle('active', editMode);
      
      if (!editMode) {
        if (transformControl) transformControl.detach();
        document.getElementById('file-name').textContent = 'Review Mode';
      } else {
        document.getElementById('file-name').textContent = 'Director Mode: Click objects to move';
      }
    }

    function toggleAssetBrowser() {
      const browser = document.getElementById('asset-browser');
      browser.classList.toggle('visible');
      document.getElementById('btn-assets').classList.toggle('active', browser.classList.contains('visible'));
    }

    function clearScene() {
      objects.forEach(obj => {
        scene.remove(obj);
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(m => m.dispose());
          } else {
            obj.material.dispose();
          }
        }
      });
      objects = [];
      animatedObjects = []; // Clear animation tracking
      particleSystems = []; // Clear particle systems
      scene.fog = null; // Clear fog
      scene.background = new THREE.Color(0x1a1a2e); // Reset to default background
    }

    // Helper to convert color names/hex to Three.js color
    function getColorValue(colorStr) {
      if (!colorStr) return 0x1a1a2e;
      colorStr = colorStr.toLowerCase().replace('#', '');
      if (colorStr.match(/^[0-9a-f]{6}$/i)) {
        return parseInt(colorStr, 16);
      }
      const colorNames = {
        red: 0xe53935, green: 0x43a047, blue: 0x1e88e5,
        yellow: 0xfdd835, cyan: 0x00acc1, magenta: 0xd81b60,
        white: 0xfafafa, black: 0x212121, gray: 0x757575,
        purple: 0x8e24aa, orange: 0xfb8c00, pink: 0xf06292,
        navy: 0x283593, midnight: 0x1a237e, sky: 0x4fc3f7
      };
      return colorNames[colorStr] || 0x1a1a2e;
    }

    // Apply skybox/environment background
    function applySkybox(skyboxType) {
      switch (skyboxType) {
        case 'sunset':
        case 'dusk':
          scene.background = createGradientTexture(0xffd27f, 0xff6b6b, 0x1a0a3e);
          break;
        case 'night':
        case 'midnight':
        case 'stars':
          scene.background = createStarfield();
          break;
        case 'space':
        case 'nebula':
          scene.background = createNebula();
          break;
        case 'sky':
        case 'day':
        case 'daytime':
          scene.background = createGradientTexture(0x87ceeb, 0x4fc3f7, 0xffffff);
          break;
        case 'overcast':
        case 'cloudy':
          scene.background = createGradientTexture(0x9e9e9e, 0xbdbdbd, 0xe0e0e0);
          break;
        case 'underwater':
        case 'ocean':
          scene.background = createGradientTexture(0x006994, 0x003d5b, 0x001524);
          scene.fog = new THREE.FogExp2(0x003d5b, 0.05);
          break;
        case 'forest':
        case 'jungle':
          scene.background = createGradientTexture(0x2e7d32, 0x1b5e20, 0x0d3010);
          scene.fog = new THREE.FogExp2(0x1b5e20, 0.03);
          break;
        case 'void':
        case 'dark':
          scene.background = new THREE.Color(0x0a0a0f);
          break;
        case 'neon':
        case 'cyberpunk':
          scene.background = createGradientTexture(0x0d0221, 0x1a0a3e, 0x7b1fa2);
          break;
        default:
          // Try to use as a color
          scene.background = new THREE.Color(getColorValue(skyboxType));
      }
    }

    // Create gradient texture for skybox
    function createGradientTexture(topColor, midColor, bottomColor) {
      const canvas = document.createElement('canvas');
      canvas.width = 2;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      const gradient = ctx.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, '#' + topColor.toString(16).padStart(6, '0'));
      gradient.addColorStop(0.5, '#' + midColor.toString(16).padStart(6, '0'));
      gradient.addColorStop(1, '#' + bottomColor.toString(16).padStart(6, '0'));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 2, 512);
      const texture = new THREE.CanvasTexture(canvas);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      return texture;
    }

    // Create procedural starfield
    function createStarfield() {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      
      // Dark gradient background
      const gradient = ctx.createLinearGradient(0, 0, 0, 512);
      gradient.addColorStop(0, '#0a0a1a');
      gradient.addColorStop(0.5, '#0f0f2a');
      gradient.addColorStop(1, '#1a1a3e');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1024, 512);
      
      // Add stars
      for (let i = 0; i < 500; i++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 512;
        const size = Math.random() * 2;
        const brightness = Math.random() * 0.8 + 0.2;
        ctx.fillStyle = 'rgba(255, 255, 255, ' + brightness + ')';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      return texture;
    }

    // Create procedural nebula
    function createNebula() {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 512;
      const ctx = canvas.getContext('2d');
      
      // Deep space gradient
      const gradient = ctx.createRadialGradient(512, 256, 50, 512, 256, 512);
      gradient.addColorStop(0, '#7b1fa2');
      gradient.addColorStop(0.3, '#4a148c');
      gradient.addColorStop(0.6, '#1a0a3e');
      gradient.addColorStop(1, '#0a0a1a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 1024, 512);
      
      // Add nebula clouds
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 512;
        const radius = Math.random() * 100 + 50;
        const hue = Math.random() * 60 + 260; // Purple to pink
        const cloudGradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        cloudGradient.addColorStop(0, 'hsla(' + hue + ', 70%, 50%, 0.2)');
        cloudGradient.addColorStop(1, 'transparent');
        ctx.fillStyle = cloudGradient;
        ctx.fillRect(0, 0, 1024, 512);
      }
      
      // Add stars
      for (let i = 0; i < 300; i++) {
        const x = Math.random() * 1024;
        const y = Math.random() * 512;
        const size = Math.random() * 1.5;
        ctx.fillStyle = 'rgba(255, 255, 255, ' + (Math.random() * 0.6 + 0.4) + ')';
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
      
      const texture = new THREE.CanvasTexture(canvas);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      return texture;
    }

    function parseAndRender(content, isHoloPlus) {
      clearScene();
      const errorPanel = document.getElementById('error-panel');
      errorPanel.classList.remove('visible');

      try {
        // Helper to extract brace-balanced content
        function extractBalancedBraces(str, startIdx) {
          let depth = 0;
          let start = -1;
          for (let i = startIdx; i < str.length; i++) {
            if (str[i] === '{') {
              if (depth === 0) start = i + 1;
              depth++;
            } else if (str[i] === '}') {
              depth--;
              if (depth === 0) return str.slice(start, i);
            }
          }
          return '';
        }

        // Parse spatial_group and group positions for offset
        const groupOffsets = {};
        const groupPattern = /(?:spatial_group|group)\\s+["']?([\\w_]+)["']?\\s*\\{/g;
        let groupMatch;
        while ((groupMatch = groupPattern.exec(content)) !== null) {
          const groupName = groupMatch[1];
          const groupContent = extractBalancedBraces(content, groupMatch.index);
          const posMatch = groupContent.match(/position\\s*:\\s*\\[([^\\]]+)\\]/);
          groupOffsets[groupName] = posMatch 
            ? posMatch[1].split(',').map(n => parseFloat(n.trim()) || 0)
            : [0, 0, 0];
        }

        // Parse templates to inherit geometry
        const templates = {};
        const templatePattern = /template\\s+["']([\\w_]+)["']\\s*\\{/g;
        let templateMatch;
        while ((templateMatch = templatePattern.exec(content)) !== null) {
          const templateName = templateMatch[1];
          const templateContent = extractBalancedBraces(content, templateMatch.index);
          const geoMatch = templateContent.match(/(?:model|geometry)\\s*:\\s*["']([\\w]+)["']/);
          const scaleMatch = templateContent.match(/scale\\s*:\\s*(?:\\[([^\\]]+)\\]|([\\d.]+))/);
          templates[templateName] = {
            geometry: geoMatch ? geoMatch[1].toLowerCase() : 'cube',
            scale: scaleMatch 
              ? (scaleMatch[1] ? scaleMatch[1].split(',').map(n => parseFloat(n.trim()) || 1) : [parseFloat(scaleMatch[2])])
              : [1, 1, 1]
          };
        }

        // Parse environment/skybox settings
        const envPattern = /environment\\s*\\{([^}]+)\\}/;
        const envMatch = content.match(envPattern);
        if (envMatch) {
          const envContent = envMatch[1];
          const skyboxMatch = envContent.match(/skybox\\s*:\\s*["']([^"']+)["']/);
          const ambientMatch = envContent.match(/ambient_light\\s*:\\s*([\\d.]+)/);
          const fogMatch = envContent.match(/fog\\s*:\\s*["']([^"']+)["']/);
          const fogDensityMatch = envContent.match(/fog_density\\s*:\\s*([\\d.]+)/);
          
          if (skyboxMatch) {
            const skyboxType = skyboxMatch[1].toLowerCase();
            applySkybox(skyboxType);
          }
          if (ambientMatch) {
            const intensity = parseFloat(ambientMatch[1]) || 0.3;
            // Update hemisphere light intensity
            scene.traverse((obj) => {
              if (obj.isHemisphereLight) obj.intensity = intensity;
            });
          }
          if (fogMatch) {
            const fogColor = getColorValue(fogMatch[1]);
            const density = fogDensityMatch ? parseFloat(fogDensityMatch[1]) : 0.02;
            scene.fog = new THREE.FogExp2(fogColor, density);
          }
        }

        // Also parse standalone skybox: property
        const standaloneSkybox = content.match(/skybox\\s*:\\s*["']([^"']+)["']/);
        if (standaloneSkybox && !envMatch) {
          applySkybox(standaloneSkybox[1].toLowerCase());
        }

        // Enhanced pattern to match objects (handles @traits, object[], nested braces)
        // Matches: orb name, object name, object Name @trait1 @trait2, object[] Name @trait, button, slider
        const orbPattern = /(?:orb|object(?:\\[\\])?|button|slider)\\s+["']?([\\w_]+)["']?(?:\\s+using\\s+["']([\\w_]+)["'])?(?:\\s+@[\\w]+)*\\s*\\{/g;
        let match;
        let count = 0;

        while ((match = orbPattern.exec(content)) !== null) {
          const name = match[1];
          const usingTemplate = match[2];
          const props = extractBalancedBraces(content, match.index);

          // Check if inside a spatial_group for position offset
          let groupOffset = [0, 0, 0];
          for (const [groupName, offset] of Object.entries(groupOffsets)) {
            const groupIdx = content.indexOf('spatial_group "' + groupName + '"');
            if (groupIdx !== -1 && groupIdx < match.index) {
              const groupEnd = content.indexOf('}', content.indexOf('{', groupIdx));
              if (match.index < groupEnd || groupEnd === -1) {
                groupOffset = offset;
              }
            }
          }

          // Parse position - supports array [x,y,z], object { x: 0, y: 1, z: 2 }, and localPosition fallback
          const posArrayMatch = props.match(/position\\s*:\\s*\\[([^\\]]+)\\]/);
          const posObjMatch = props.match(/position\\s*:\\s*\\{\\s*x\\s*:\\s*([\\d.-]+)\\s*,\\s*y\\s*:\\s*([\\d.-]+)\\s*,\\s*z\\s*:\\s*([\\d.-]+)\\s*\\}/);
          const localPosObjMatch = props.match(/localPosition\\s*:\\s*\\{\\s*x\\s*:\\s*([\\d.-]+)\\s*,\\s*y\\s*:\\s*([\\d.-]+)\\s*,\\s*z\\s*:\\s*([\\d.-]+)\\s*\\}/);
          let position;
          if (posArrayMatch) {
            position = posArrayMatch[1].split(',').map((n, i) => (parseFloat(n.trim()) || 0) + groupOffset[i]);
          } else if (posObjMatch) {
            position = [
              (parseFloat(posObjMatch[1]) || 0) + groupOffset[0],
              (parseFloat(posObjMatch[2]) || 0) + groupOffset[1],
              (parseFloat(posObjMatch[3]) || 0) + groupOffset[2]
            ];
          } else if (localPosObjMatch) {
            position = [
              (parseFloat(localPosObjMatch[1]) || 0) + groupOffset[0],
              (parseFloat(localPosObjMatch[2]) || 0) + groupOffset[1],
              (parseFloat(localPosObjMatch[3]) || 0) + groupOffset[2]
            ];
          } else {
            position = groupOffset.slice();
          }

          // Parse scale (supports single number, [x,y,z] array, { x, y, z } object, or size: fallback)
          const scaleMatchArr = props.match(/scale\\s*:\\s*\\[([^\\]]+)\\]/);
          const scaleMatchNum = props.match(/scale\\s*:\\s*([\\d.]+)/);
          const scaleMatchObj = props.match(/scale\\s*:\\s*\\{\\s*x\\s*:\\s*([\\d.-]+)\\s*,\\s*y\\s*:\\s*([\\d.-]+)\\s*,\\s*z\\s*:\\s*([\\d.-]+)\\s*\\}/);
          const sizeMatchArr = props.match(/size\\s*:\\s*\\[([^\\]]+)\\]/);
          const sizeMatchObj = props.match(/size\\s*:\\s*\\{\\s*width\\s*:\\s*([\\d.-]+)\\s*,\\s*(?:depth|height)\\s*:\\s*([\\d.-]+)\\s*\\}/);
          let scale;
          if (scaleMatchArr) {
            scale = scaleMatchArr[1].split(',').map(n => parseFloat(n.trim()) || 1);
          } else if (scaleMatchObj) {
            scale = [
              parseFloat(scaleMatchObj[1]) || 1,
              parseFloat(scaleMatchObj[2]) || 1,
              parseFloat(scaleMatchObj[3]) || 1
            ];
          } else if (scaleMatchNum) {
            const s = parseFloat(scaleMatchNum[1]) || 1;
            scale = [s, s, s];
          } else if (sizeMatchArr) {
            const dims = sizeMatchArr[1].split(',').map(n => parseFloat(n.trim()) || 1);
            scale = [dims[0] || 1, 0.1, dims[1] || dims[0] || 1]; // size: [width, depth] → flat plane
          } else if (sizeMatchObj) {
            scale = [parseFloat(sizeMatchObj[1]) || 1, 0.1, parseFloat(sizeMatchObj[2]) || 1];
          } else if (usingTemplate && templates[usingTemplate]) {
            const ts = templates[usingTemplate].scale;
            scale = ts.length === 1 ? [ts[0], ts[0], ts[0]] : ts;
          } else {
            scale = [1, 1, 1];
          }

          // Parse rotation (supports [x,y,z] array or { x, y, z } object notation)
          const rotMatchArr = props.match(/rotation\\s*:\\s*\\[([^\\]]+)\\]/);
          const rotMatchObj = props.match(/rotation\\s*:\\s*\\{\\s*x\\s*:\\s*([\\d.-]+)\\s*,\\s*y\\s*:\\s*([\\d.-]+)\\s*,\\s*z\\s*:\\s*([\\d.-]+)\\s*\\}/);
          let rotation;
          if (rotMatchArr) {
            rotation = rotMatchArr[1].split(',').map(n => (parseFloat(n.trim()) || 0) * Math.PI / 180);
          } else if (rotMatchObj) {
            rotation = [
              (parseFloat(rotMatchObj[1]) || 0) * Math.PI / 180,
              (parseFloat(rotMatchObj[2]) || 0) * Math.PI / 180,
              (parseFloat(rotMatchObj[3]) || 0) * Math.PI / 180
            ];
          } else {
            rotation = [0, 0, 0];
          }

          // Parse color - expanded palette
          const colorMatch = props.match(/color\\s*:\\s*["']?#?([\\w]+)["']?/);
          let color = 0x4a9eff;
          if (colorMatch) {
            const colorStr = colorMatch[1];
            if (colorStr.match(/^[0-9a-f]{6}$/i)) {
              color = parseInt(colorStr, 16);
            } else {
              const colorNames = {
                // Primary
                red: 0xe53935, green: 0x43a047, blue: 0x1e88e5,
                yellow: 0xfdd835, cyan: 0x00acc1, magenta: 0xd81b60,
                // Neutrals
                white: 0xfafafa, black: 0x212121, gray: 0x757575, grey: 0x757575,
                silver: 0xbdbdbd, charcoal: 0x424242,
                // Warm tones
                orange: 0xfb8c00, coral: 0xff7043, salmon: 0xf48fb1,
                gold: 0xffc107, bronze: 0xcd7f32, copper: 0xb87333,
                brown: 0x795548, tan: 0xd4a574, beige: 0xc8ad7f, terracotta: 0xe2725b, clay: 0xb66a50, sienna: 0xa0522d,
                // Cool tones
                purple: 0x8e24aa, violet: 0x7e57c2, indigo: 0x5c6bc0,
                navy: 0x283593, teal: 0x00897b, aqua: 0x4dd0e1,
                turquoise: 0x26c6da, mint: 0x80cbc4, lime: 0xc0ca33,
                // Nature
                forest: 0x2e7d32, olive: 0x827717, sage: 0x9ccc65,
                sky: 0x4fc3f7, ocean: 0x0277bd, midnight: 0x1a237e,
                sand: 0xd7ccc8, stone: 0x8d6e63, slate: 0x607d8b,
                // Metals
                steel: 0x78909c, chrome: 0xe0e0e0, brass: 0xc9a227,
                platinum: 0xe5e4e2, rust: 0xb7410e, titanium: 0x878681,
                // Fantasy / Sci-fi
                neon: 0x39ff14, plasma: 0xff073a, hologram: 0x00fff7,
                energy: 0xffea00, void: 0x0d0221, nebula: 0x7b1fa2,
                crystal: 0xb3e5fc, lava: 0xff5722, ice: 0xe1f5fe,
                // Materials
                wood: 0x8d6e63, leather: 0x795548, fabric: 0x9e9d9e,
                glass: 0xe3f2fd, marble: 0xf5f5f5, obsidian: 0x1c1c1c,
                // UI colors
                success: 0x4caf50, warning: 0xff9800, error: 0xf44336,
                info: 0x2196f3, primary: 0x3f51b5, secondary: 0x9c27b0,
                // Pink/rose variants
                pink: 0xf06292, rose: 0xec407a, blush: 0xf8bbd0,
                hotpink: 0xff69b4, fuchsia: 0xc51162
              };
              color = colorNames[colorStr.toLowerCase()] || color;
            }
          }

          // Parse model/geometry type (support 'model', 'geometry', and 'type' properties)
          // Also check for .glb/.gltf file paths
          const modelPathMatch = props.match(/(?:model|src)\\s*:\\s*["']([^"']+\.(?:glb|gltf))["']/i);
          const modelMatch = props.match(/(?:model|geometry)\\s*:\\s*["']([\\w]+)["']/);
          const typeMatch = props.match(/type\\s*:\\s*["']([\\w]+)["']/);
          const textMatch = props.match(/text\\s*:\\s*["']([^"']+)["']/);
          let modelType = 'cube';
          let modelPath = null;
          let textContent = textMatch ? textMatch[1] : null;
          
          if (modelPathMatch) {
            modelPath = modelPathMatch[1];
            modelType = 'glb'; // Special marker for GLB loading
          } else if (modelMatch) {
            modelType = modelMatch[1].toLowerCase();
          } else if (typeMatch) {
            // Map type values to geometry types
            const typeValue = typeMatch[1].toLowerCase();
            const typeMap = {
              plane: 'plane', environment: 'sphere', directional: 'cone',
              ambient: 'sphere', audio: 'sphere', panel: 'cube',
              text: 'text', label: 'text', particles: 'particles', emitter: 'particles'
            };
            modelType = typeMap[typeValue] || typeValue;
          } else if (textContent) {
            modelType = 'text';
          } else if (usingTemplate && templates[usingTemplate]) {
            modelType = templates[usingTemplate].geometry;
          }

          // Handle GLB/GLTF model loading
          if (modelType === 'glb' && gltfLoader && modelPath) {
            // Create placeholder while loading
            const placeholder = new THREE.Mesh(
              new THREE.BoxGeometry(0.5, 0.5, 0.5),
              new THREE.MeshBasicMaterial({ color: 0x888888, wireframe: true })
            );
            placeholder.position.set(position[0], position[1], position[2]);
            placeholder.name = name + '_loading';
            scene.add(placeholder);
            objects.push(placeholder);
            
            // Try to load the model (will fail for relative paths, but shows intent)
            try {
              gltfLoader.load(modelPath, (gltf) => {
                scene.remove(placeholder);
                const model = gltf.scene;
                model.position.set(position[0], position[1], position[2]);
                model.scale.set(scale[0], scale[1], scale[2]);
                model.rotation.set(rotation[0], rotation[1], rotation[2]);
                model.name = name;
                model.traverse((child) => {
                  if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                  }
                });
                scene.add(model);
                objects.push(model);
              }, undefined, (error) => {
                // Keep placeholder on error
              });
            } catch (e) {
              void e; // GLB load failed, using placeholder
            }
            count++;
            continue; // Skip normal geometry creation
          }

          // Handle 3D Text
          if (modelType === 'text' && textContent && defaultFont) {
            const textGeo = new THREE.TextGeometry(textContent, {
              font: defaultFont,
              size: 0.3,
              height: 0.05,
              curveSegments: 12,
              bevelEnabled: true,
              bevelThickness: 0.01,
              bevelSize: 0.005,
              bevelSegments: 3
            });
            textGeo.center();
            
            const textMat = new THREE.MeshStandardMaterial({
              color,
              metalness: metalness,
              roughness: roughness,
              emissive: emissiveColor,
              emissiveIntensity
            });
            
            const textMesh = new THREE.Mesh(textGeo, textMat);
            textMesh.position.set(position[0], position[1], position[2]);
            textMesh.scale.set(scale[0], scale[1], scale[2]);
            textMesh.rotation.set(rotation[0], rotation[1], rotation[2]);
            textMesh.castShadow = true;
            textMesh.name = name;
            scene.add(textMesh);
            objects.push(textMesh);
            count++;
            continue;
          }

          // Handle Particle systems
          if (modelType === 'particles' || modelType === 'emitter') {
            const particleCountMatch = props.match(/count\\s*:\\s*(\\d+)/);
            const particleCount = particleCountMatch ? parseInt(particleCountMatch[1]) : 100;
            
            const particlesGeo = new THREE.BufferGeometry();
            const positions = new Float32Array(particleCount * 3);
            const velocities = new Float32Array(particleCount * 3);
            
            for (let i = 0; i < particleCount; i++) {
              positions[i * 3] = (Math.random() - 0.5) * 2;
              positions[i * 3 + 1] = Math.random() * 2;
              positions[i * 3 + 2] = (Math.random() - 0.5) * 2;
              velocities[i * 3] = (Math.random() - 0.5) * 0.02;
              velocities[i * 3 + 1] = Math.random() * 0.02 + 0.01;
              velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.02;
            }
            particlesGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            const particlesMat = new THREE.PointsMaterial({
              color,
              size: 0.05,
              transparent: true,
              opacity: 0.8,
              blending: THREE.AdditiveBlending
            });
            
            const particles = new THREE.Points(particlesGeo, particlesMat);
            particles.position.set(position[0], position[1], position[2]);
            particles.name = name;
            particles.userData.velocities = velocities;
            scene.add(particles);
            objects.push(particles);
            particleSystems.push(particles);
            count++;
            continue;
          }

          // Create geometry based on model type - expanded library
          let geometry;
          switch (modelType) {
            // === BASIC PRIMITIVES ===
            case 'sphere':
            case 'orb':
              geometry = new THREE.SphereGeometry(0.5, 64, 64);
              break;
            case 'cylinder':
              geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 48);
              break;
            case 'cone':
              geometry = new THREE.ConeGeometry(0.5, 1, 48);
              break;
            case 'torus':
            case 'ring':
            case 'donut':
              geometry = new THREE.TorusGeometry(0.4, 0.15, 24, 64);
              break;
            case 'plane':
            case 'quad':
              geometry = new THREE.PlaneGeometry(1, 1, 4, 4);
              break;
            case 'cube':
            case 'box':
              geometry = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
              break;

            // === ADVANCED SHAPES ===
            case 'capsule':
            case 'pill':
              geometry = new THREE.CapsuleGeometry(0.3, 0.6, 16, 32);
              break;
            case 'icosahedron':
            case 'gem':
            case 'crystal':
              geometry = new THREE.IcosahedronGeometry(0.5, 0);
              break;
            case 'octahedron':
            case 'diamond':
              geometry = new THREE.OctahedronGeometry(0.5, 0);
              break;
            case 'dodecahedron':
              geometry = new THREE.DodecahedronGeometry(0.5, 0);
              break;
            case 'tetrahedron':
            case 'pyramid':
              geometry = new THREE.TetrahedronGeometry(0.5, 0);
              break;
            case 'torusknot':
            case 'knot':
            case 'pretzel':
              geometry = new THREE.TorusKnotGeometry(0.3, 0.1, 128, 32);
              break;

            // === ARCHITECTURAL ===
            case 'column':
            case 'pillar':
              geometry = new THREE.CylinderGeometry(0.3, 0.35, 2, 24);
              break;
            case 'pedestal':
            case 'platform':
              geometry = new THREE.CylinderGeometry(0.6, 0.5, 0.2, 32);
              break;
            case 'ramp':
            case 'wedge':
              // Create wedge using extrude
              const wedgeShape = new THREE.Shape();
              wedgeShape.moveTo(0, 0);
              wedgeShape.lineTo(1, 0);
              wedgeShape.lineTo(1, 0.5);
              wedgeShape.lineTo(0, 0);
              geometry = new THREE.ExtrudeGeometry(wedgeShape, { depth: 1, bevelEnabled: false });
              geometry.center();
              break;
            case 'arch':
              // Half torus for archway
              geometry = new THREE.TorusGeometry(0.5, 0.1, 16, 32, Math.PI);
              break;
            case 'stairs':
            case 'steps':
              // Create stepped geometry
              const stepsGroup = new THREE.BufferGeometry();
              const stepGeos = [];
              for (let i = 0; i < 4; i++) {
                const step = new THREE.BoxGeometry(1, 0.2, 0.25);
                step.translate(0, i * 0.2 + 0.1, i * 0.25);
                stepGeos.push(step);
              }
              geometry = THREE.BufferGeometryUtils ? 
                THREE.BufferGeometryUtils.mergeBufferGeometries(stepGeos) :
                stepGeos[0]; // Fallback
              break;

            // === ORGANIC / NATURAL ===
            case 'rock':
            case 'boulder':
              geometry = new THREE.IcosahedronGeometry(0.5, 1);
              // Distort vertices for rocky look
              const rockPos = geometry.attributes.position;
              for (let i = 0; i < rockPos.count; i++) {
                rockPos.setXYZ(i,
                  rockPos.getX(i) * (0.8 + Math.random() * 0.4),
                  rockPos.getY(i) * (0.8 + Math.random() * 0.4),
                  rockPos.getZ(i) * (0.8 + Math.random() * 0.4)
                );
              }
              geometry.computeVertexNormals();
              break;
            case 'tree':
            case 'pine':
              // Simple cone tree
              geometry = new THREE.ConeGeometry(0.5, 1.5, 8);
              break;
            case 'leaf':
              // Flat oval
              geometry = new THREE.SphereGeometry(0.5, 16, 8);
              geometry.scale(1, 0.1, 0.6);
              break;

            // === TECH / SCI-FI ===
            case 'hexagon':
            case 'hex':
              geometry = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 6);
              break;
            case 'prism':
              geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 3);
              break;
            case 'star':
              // 5-pointed star using lathe
              const starPts = [];
              for (let i = 0; i < 11; i++) {
                const r = i % 2 === 0 ? 0.5 : 0.25;
                starPts.push(new THREE.Vector2(
                  Math.cos(i * Math.PI / 5) * r,
                  Math.sin(i * Math.PI / 5) * r
                ));
              }
              const starShape = new THREE.Shape(starPts);
              geometry = new THREE.ExtrudeGeometry(starShape, { depth: 0.2, bevelEnabled: false });
              geometry.center();
              break;
            case 'portal':
            case 'gate':
              // Flat ring with hole
              geometry = new THREE.RingGeometry(0.3, 0.5, 32);
              break;
            case 'disc':
            case 'coin':
              geometry = new THREE.CylinderGeometry(0.5, 0.5, 0.05, 48);
              break;
            case 'antenna':
            case 'rod':
              geometry = new THREE.CylinderGeometry(0.03, 0.03, 2, 8);
              break;

            // === FURNITURE / PROPS ===
            case 'table':
              // Flat top
              geometry = new THREE.BoxGeometry(1.5, 0.1, 1);
              break;
            case 'chair':
            case 'seat':
              geometry = new THREE.BoxGeometry(0.5, 0.1, 0.5);
              break;
            case 'button':
            case 'switch':
              geometry = new THREE.CylinderGeometry(0.15, 0.18, 0.08, 32);
              break;
            case 'lever':
            case 'handle':
              geometry = new THREE.CapsuleGeometry(0.05, 0.4, 8, 16);
              break;
            case 'screen':
            case 'display':
            case 'monitor':
              geometry = new THREE.BoxGeometry(1.6, 0.9, 0.05);
              break;

            // === WEAPONS / TOOLS ===
            case 'sword':
            case 'blade':
              const swordShape = new THREE.Shape();
              swordShape.moveTo(0, 0);
              swordShape.lineTo(0.05, 0);
              swordShape.lineTo(0.03, 1);
              swordShape.lineTo(0, 1.1);
              swordShape.lineTo(-0.03, 1);
              swordShape.lineTo(-0.05, 0);
              geometry = new THREE.ExtrudeGeometry(swordShape, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01 });
              geometry.center();
              break;
            case 'shield':
              geometry = new THREE.SphereGeometry(0.5, 32, 16, 0, Math.PI);
              geometry.scale(1, 1.2, 0.2);
              break;
            case 'wand':
            case 'staff':
              geometry = new THREE.CylinderGeometry(0.02, 0.04, 1, 8);
              break;

            // === CREATIVE / DECORATIVE ===
            case 'heart':
              const heartShape = new THREE.Shape();
              heartShape.moveTo(0, 0);
              heartShape.bezierCurveTo(0, -0.3, -0.5, -0.3, -0.5, 0);
              heartShape.bezierCurveTo(-0.5, 0.3, 0, 0.6, 0, 0.9);
              heartShape.bezierCurveTo(0, 0.6, 0.5, 0.3, 0.5, 0);
              heartShape.bezierCurveTo(0.5, -0.3, 0, -0.3, 0, 0);
              geometry = new THREE.ExtrudeGeometry(heartShape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05 });
              geometry.center();
              geometry.rotateX(Math.PI);
              break;
              
            case 'arrow':
            case 'pointer':
              const arrowShape = new THREE.Shape();
              arrowShape.moveTo(0, 0.5);
              arrowShape.lineTo(0.3, 0);
              arrowShape.lineTo(0.1, 0);
              arrowShape.lineTo(0.1, -0.5);
              arrowShape.lineTo(-0.1, -0.5);
              arrowShape.lineTo(-0.1, 0);
              arrowShape.lineTo(-0.3, 0);
              arrowShape.lineTo(0, 0.5);
              geometry = new THREE.ExtrudeGeometry(arrowShape, { depth: 0.1, bevelEnabled: false });
              geometry.center();
              break;
              
            case 'cross':
            case 'plus':
              const crossShape = new THREE.Shape();
              crossShape.moveTo(-0.15, 0.5);
              crossShape.lineTo(0.15, 0.5);
              crossShape.lineTo(0.15, 0.15);
              crossShape.lineTo(0.5, 0.15);
              crossShape.lineTo(0.5, -0.15);
              crossShape.lineTo(0.15, -0.15);
              crossShape.lineTo(0.15, -0.5);
              crossShape.lineTo(-0.15, -0.5);
              crossShape.lineTo(-0.15, -0.15);
              crossShape.lineTo(-0.5, -0.15);
              crossShape.lineTo(-0.5, 0.15);
              crossShape.lineTo(-0.15, 0.15);
              crossShape.lineTo(-0.15, 0.5);
              geometry = new THREE.ExtrudeGeometry(crossShape, { depth: 0.2, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02 });
              geometry.center();
              break;
              
            case 'moon':
            case 'crescent':
              const moonShape = new THREE.Shape();
              moonShape.absarc(0, 0, 0.5, 0, Math.PI * 2, false);
              const moonHole = new THREE.Path();
              moonHole.absarc(0.2, 0, 0.4, 0, Math.PI * 2, true);
              moonShape.holes.push(moonHole);
              geometry = new THREE.ExtrudeGeometry(moonShape, { depth: 0.15, bevelEnabled: false });
              geometry.center();
              break;
              
            case 'gear':
            case 'cog':
              const gearShape = new THREE.Shape();
              const teeth = 8;
              for (let i = 0; i < teeth * 2; i++) {
                const angle = (i / (teeth * 2)) * Math.PI * 2;
                const r = i % 2 === 0 ? 0.5 : 0.35;
                if (i === 0) {
                  gearShape.moveTo(r * Math.cos(angle), r * Math.sin(angle));
                } else {
                  gearShape.lineTo(r * Math.cos(angle), r * Math.sin(angle));
                }
              }
              const gearHole = new THREE.Path();
              gearHole.absarc(0, 0, 0.1, 0, Math.PI * 2, true);
              gearShape.holes.push(gearHole);
              geometry = new THREE.ExtrudeGeometry(gearShape, { depth: 0.15, bevelEnabled: false });
              geometry.center();
              break;
              
            case 'spring':
            case 'coil':
              // Helix/spring using tube
              const springCurve = new THREE.Curve();
              springCurve.getPoint = function(t) {
                const angle = t * Math.PI * 6;
                return new THREE.Vector3(
                  Math.cos(angle) * 0.3,
                  t - 0.5,
                  Math.sin(angle) * 0.3
                );
              };
              geometry = new THREE.TubeGeometry(springCurve, 64, 0.05, 8, false);
              break;
              
            case 'spiral':
            case 'helix':
              const spiralCurve = new THREE.Curve();
              spiralCurve.getPoint = function(t) {
                const angle = t * Math.PI * 4;
                const radius = 0.1 + t * 0.4;
                return new THREE.Vector3(
                  Math.cos(angle) * radius,
                  t * 0.5 - 0.25,
                  Math.sin(angle) * radius
                );
              };
              geometry = new THREE.TubeGeometry(spiralCurve, 64, 0.03, 8, false);
              break;
              
            case 'wave':
            case 'sine':
              const waveCurve = new THREE.Curve();
              waveCurve.getPoint = function(t) {
                return new THREE.Vector3(
                  t - 0.5,
                  Math.sin(t * Math.PI * 3) * 0.2,
                  0
                );
              };
              geometry = new THREE.TubeGeometry(waveCurve, 64, 0.05, 8, false);
              break;
              
            case 'ring2d':
            case 'hoop':
              geometry = new THREE.RingGeometry(0.3, 0.5, 32);
              break;
              
            case 'tube':
            case 'pipe':
              geometry = new THREE.TubeGeometry(
                new THREE.LineCurve3(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, 0.5, 0)),
                1, 0.3, 32, false
              );
              break;
              
            case 'cylinder_hollow':
            case 'ring3d':
              // Hollow cylinder using lathe
              const hollowPts = [
                new THREE.Vector2(0.3, -0.5),
                new THREE.Vector2(0.5, -0.5),
                new THREE.Vector2(0.5, 0.5),
                new THREE.Vector2(0.3, 0.5),
                new THREE.Vector2(0.3, -0.5)
              ];
              geometry = new THREE.LatheGeometry(hollowPts, 32);
              break;
              
            case 'bowl':
            case 'cup':
              const bowlPts = [];
              for (let i = 0; i <= 10; i++) {
                const t = i / 10;
                bowlPts.push(new THREE.Vector2(
                  0.2 + Math.sin(t * Math.PI * 0.5) * 0.3,
                  t * 0.5 - 0.25
                ));
              }
              geometry = new THREE.LatheGeometry(bowlPts, 32);
              break;
              
            case 'vase':
            case 'bottle':
              const vasePts = [];
              for (let i = 0; i <= 20; i++) {
                const t = i / 20;
                const r = 0.1 + Math.sin(t * Math.PI) * 0.2 + (t > 0.8 ? (t - 0.8) * 0.5 : 0);
                vasePts.push(new THREE.Vector2(r, t - 0.5));
              }
              geometry = new THREE.LatheGeometry(vasePts, 32);
              break;
              
            case 'egg':
            case 'oval':
              geometry = new THREE.SphereGeometry(0.5, 32, 32);
              geometry.scale(0.8, 1.2, 0.8);
              break;
              
            case 'pill':
            case 'lozenge':
              geometry = new THREE.CapsuleGeometry(0.2, 0.6, 16, 32);
              break;
              
            case 'droplet':
            case 'teardrop':
              const dropPts = [];
              for (let i = 0; i <= 20; i++) {
                const t = i / 20;
                const r = Math.sin(t * Math.PI) * (1 - t * 0.5) * 0.3;
                dropPts.push(new THREE.Vector2(r, t - 0.3));
              }
              geometry = new THREE.LatheGeometry(dropPts, 32);
              break;
              
            case 'lightning':
            case 'bolt':
              const boltShape = new THREE.Shape();
              boltShape.moveTo(0.1, 0.5);
              boltShape.lineTo(-0.2, 0.1);
              boltShape.lineTo(0, 0.1);
              boltShape.lineTo(-0.1, -0.5);
              boltShape.lineTo(0.2, -0.1);
              boltShape.lineTo(0, -0.1);
              boltShape.lineTo(0.1, 0.5);
              geometry = new THREE.ExtrudeGeometry(boltShape, { depth: 0.1, bevelEnabled: false });
              geometry.center();
              break;
              
            case 'explosion':
            case 'burst':
              geometry = new THREE.IcosahedronGeometry(0.5, 0);
              const burstPos = geometry.attributes.position;
              for (let i = 0; i < burstPos.count; i++) {
                const mult = 0.5 + Math.random() * 1.0;
                burstPos.setXYZ(i,
                  burstPos.getX(i) * mult,
                  burstPos.getY(i) * mult,
                  burstPos.getZ(i) * mult
                );
              }
              geometry.computeVertexNormals();
              break;
              
            case 'snowflake':
            case 'flake':
              const flakeShape = new THREE.Shape();
              const arms = 6;
              for (let i = 0; i < arms; i++) {
                const angle = (i / arms) * Math.PI * 2;
                const nextAngle = ((i + 0.5) / arms) * Math.PI * 2;
                flakeShape.lineTo(Math.cos(angle) * 0.5, Math.sin(angle) * 0.5);
                flakeShape.lineTo(Math.cos(nextAngle) * 0.15, Math.sin(nextAngle) * 0.15);
              }
              geometry = new THREE.ExtrudeGeometry(flakeShape, { depth: 0.05, bevelEnabled: false });
              geometry.center();
              break;

            // === DEFAULT (rounded box) ===
            default:
              // Beveled box for more professional look
              const boxShape = new THREE.Shape();
              const bevel = 0.08;
              boxShape.moveTo(-0.5 + bevel, -0.5);
              boxShape.lineTo(0.5 - bevel, -0.5);
              boxShape.quadraticCurveTo(0.5, -0.5, 0.5, -0.5 + bevel);
              boxShape.lineTo(0.5, 0.5 - bevel);
              boxShape.quadraticCurveTo(0.5, 0.5, 0.5 - bevel, 0.5);
              boxShape.lineTo(-0.5 + bevel, 0.5);
              boxShape.quadraticCurveTo(-0.5, 0.5, -0.5, 0.5 - bevel);
              boxShape.lineTo(-0.5, -0.5 + bevel);
              boxShape.quadraticCurveTo(-0.5, -0.5, -0.5 + bevel, -0.5);
              geometry = new THREE.ExtrudeGeometry(boxShape, { 
                depth: 1, 
                bevelEnabled: true, 
                bevelThickness: 0.05, 
                bevelSize: 0.05, 
                bevelSegments: 3 
              });
              geometry.center();
          }

          // Parse glow/emissive properties
          const glowMatch = props.match(/glow\\s*:\\s*(true|false)/i);
          const emissiveMatch = props.match(/emissive\\s*:\\s*["']?#?([\\w]+)["']?/);
          const isGlowing = glowMatch && glowMatch[1].toLowerCase() === 'true';
          const emissiveIntensityMatch = props.match(/emissiveIntensity\\s*:\\s*([\\d.]+)/);
          const emissiveIntensity = emissiveIntensityMatch ? parseFloat(emissiveIntensityMatch[1]) : (isGlowing ? 0.5 : 0);
          
          // Parse metallic/roughness from code
          const metallicMatch = props.match(/(?:metallic|metalness)\\s*:\\s*([\\d.]+)/);
          const roughnessMatch = props.match(/roughness\\s*:\\s*([\\d.]+)/);
          const metalness = metallicMatch ? parseFloat(metallicMatch[1]) : 0.1;
          const roughness = roughnessMatch ? parseFloat(roughnessMatch[1]) : 0.4;

          // Parse material type
          const materialTypeMatch = props.match(/material\\s*:\\s*["']([\\w]+)["']/);
          const materialType = materialTypeMatch ? materialTypeMatch[1].toLowerCase() : 'standard';
          
          // Parse opacity/transparency
          const opacityMatch = props.match(/opacity\\s*:\\s*([\\d.]+)/);
          const transparentMatch = props.match(/transparent\\s*:\\s*(true|false)/i);
          const opacity = opacityMatch ? parseFloat(opacityMatch[1]) : 1;
          const isTransparent = (transparentMatch && transparentMatch[1].toLowerCase() === 'true') || opacity < 1 || materialType === 'glass' || materialType === 'hologram';

          // Determine emissive color
          let emissiveColor = 0x000000;
          if (isGlowing) {
            emissiveColor = color; // Use object color as emissive
          } else if (emissiveMatch) {
            const emStr = emissiveMatch[1];
            emissiveColor = emStr.match(/^[0-9a-f]{6}$/i) ? parseInt(emStr, 16) : 0x000000;
          }

          // Create material based on material type
          let material;
          switch (materialType) {
            case 'glass':
            case 'crystal':
            case 'transparent':
              material = new THREE.MeshPhysicalMaterial({
                color,
                roughness: 0.05,
                metalness: 0,
                transmission: 0.9,
                thickness: 0.5,
                transparent: true,
                opacity: opacity,
                envMapIntensity: 1.5,
                clearcoat: 1.0,
                clearcoatRoughness: 0.1,
                ior: 1.5,
                wireframe: wireframeMode
              });
              break;
              
            case 'hologram':
            case 'holographic':
              material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.6,
                wireframe: true,
                side: THREE.DoubleSide
              });
              // Add inner solid core
              const innerMat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.2
              });
              const innerMesh = new THREE.Mesh(geometry.clone(), innerMat);
              innerMesh.scale.setScalar(0.95);
              scene.add(innerMesh);
              objects.push(innerMesh);
              break;
              
            case 'toon':
            case 'cartoon':
              const toonColors = new Uint8Array([0, 80, 160, 255]);
              const toonGradient = new THREE.DataTexture(toonColors, toonColors.length, 1, THREE.LuminanceFormat);
              toonGradient.needsUpdate = true;
              material = new THREE.MeshToonMaterial({
                color,
                gradientMap: toonGradient,
                wireframe: wireframeMode
              });
              break;
              
            case 'neon':
            case 'glow':
              material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.9
              });
              // Add glow halo
              const glowMat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.3,
                side: THREE.BackSide
              });
              const glowMesh = new THREE.Mesh(geometry.clone(), glowMat);
              glowMesh.scale.setScalar(1.15);
              scene.add(glowMesh);
              objects.push(glowMesh);
              break;
              
            case 'matte':
            case 'diffuse':
              material = new THREE.MeshLambertMaterial({
                color,
                emissive: emissiveColor,
                emissiveIntensity,
                wireframe: wireframeMode
              });
              break;
              
            case 'shiny':
            case 'plastic':
              material = new THREE.MeshPhongMaterial({
                color,
                shininess: 100,
                specular: 0xffffff,
                emissive: emissiveColor,
                emissiveIntensity,
                wireframe: wireframeMode
              });
              break;
              
            case 'metal':
            case 'metallic':
              material = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.1,
                metalness: 1.0,
                emissive: emissiveColor,
                emissiveIntensity,
                envMapIntensity: 2.0,
                wireframe: wireframeMode
              });
              break;
              
            case 'mirror':
            case 'chrome':
              material = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                roughness: 0.0,
                metalness: 1.0,
                envMapIntensity: 3.0,
                wireframe: wireframeMode
              });
              break;
              
            case 'velvet':
            case 'fabric':
              material = new THREE.MeshStandardMaterial({
                color,
                roughness: 0.9,
                metalness: 0.0,
                emissive: emissiveColor,
                emissiveIntensity,
                wireframe: wireframeMode
              });
              break;
              
            case 'wireframe':
            case 'wire':
              material = new THREE.MeshBasicMaterial({
                color,
                wireframe: true,
                transparent: true,
                opacity: 0.8
              });
              break;
              
            case 'xray':
              material = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.3,
                depthWrite: false,
                side: THREE.DoubleSide
              });
              break;
              
            case 'fresnel':
            case 'rim':
              // Simulate fresnel with two materials
              material = new THREE.MeshStandardMaterial({
                color: 0x000000,
                roughness: 0.5,
                metalness: 0.5,
                emissive: color,
                emissiveIntensity: 0.2,
                wireframe: wireframeMode
              });
              break;
              
            case 'gradient':
              // Create a simple vertical gradient
              const canvas = document.createElement('canvas');
              canvas.width = 2;
              canvas.height = 256;
              const ctx = canvas.getContext('2d');
              const gradient = ctx.createLinearGradient(0, 0, 0, 256);
              gradient.addColorStop(0, '#' + color.toString(16).padStart(6, '0'));
              gradient.addColorStop(1, '#000000');
              ctx.fillStyle = gradient;
              ctx.fillRect(0, 0, 2, 256);
              const gradientTexture = new THREE.CanvasTexture(canvas);
              material = new THREE.MeshBasicMaterial({
                map: gradientTexture,
                transparent: isTransparent,
                opacity,
                wireframe: wireframeMode
              });
              break;
              
            default: // 'standard' or unrecognized
              material = new THREE.MeshStandardMaterial({
                color,
                roughness,
                metalness,
                emissive: emissiveColor,
                emissiveIntensity,
                transparent: isTransparent,
                opacity,
                envMapIntensity: 1.0,
                wireframe: wireframeMode
              });
          }

          // Create mesh
          const mesh = new THREE.Mesh(geometry, material);
          mesh.position.set(position[0], position[1], position[2]);
          mesh.scale.set(scale[0], scale[1], scale[2]);
          mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.name = name;

          scene.add(mesh);
          objects.push(mesh);
          
          // Parse animation properties
          const animateMatch = props.match(/animate\\s*:\\s*["']([\\w]+)["']/);
          const animSpeedMatch = props.match(/animSpeed\\s*:\\s*([\\d.]+)/);
          const animAmplitudeMatch = props.match(/animAmplitude\\s*:\\s*([\\d.]+)/);
          const animRadiusMatch = props.match(/animRadius\\s*:\\s*([\\d.]+)/);
          
          if (animateMatch) {
            animatedObjects.push({
              mesh,
              baseY: position[1],
              baseX: position[0],
              baseZ: position[2],
              baseScale: scale[0],
              animation: {
                type: animateMatch[1].toLowerCase(),
                speed: animSpeedMatch ? parseFloat(animSpeedMatch[1]) : 1,
                amplitude: animAmplitudeMatch ? parseFloat(animAmplitudeMatch[1]) : 0.3,
                radius: animRadiusMatch ? parseFloat(animRadiusMatch[1]) : 2
              }
            });
          }
          
          count++;
        }

        document.getElementById('stat-objects').textContent = count;
      } catch (error) {
        errorPanel.textContent = 'Parse error: ' + error.message;
        errorPanel.classList.add('visible');
      }
    }

    // Handle messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'update':
          document.getElementById('file-name').textContent = message.fileName.split(/[\./]/).pop();
          parseAndRender(message.content, message.isHoloPlus);
          break;
      }
    });
  </script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
