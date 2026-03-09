/**
 * MaterialEditor.ts
 *
 * Material Editor with Live Preview
 * Unity/Substance-style material editing with real-time preview sphere.
 * Supports PBR materials, procedural textures, and visual presets.
 *
 * Uses the unified MaterialDef type from the rendering MaterialLibrary,
 * eliminating duplicate PBR schemas across the codebase.
 */

import type { MaterialDef, MaterialType } from '../rendering/MaterialLibrary';
import {
  hexToRGBA,
  rgbaToHex,
  createDefaultMaterialDef,
} from '../rendering/MaterialLibrary';

// Re-export MaterialDef so existing consumers of MaterialEditor types
// can access the canonical type without changing their imports.
export type { MaterialDef, MaterialType } from '../rendering/MaterialLibrary';
export { hexToRGBA, rgbaToHex, createDefaultMaterialDef } from '../rendering/MaterialLibrary';

/**
 * @deprecated Use MaterialDef from rendering/MaterialLibrary instead.
 * This alias is kept for backward compatibility.
 */
export type Material = MaterialDef;

/**
 * Material preset for the editor UI
 */
export interface MaterialEditorPreset {
  /** Preset name */
  name: string;
  /** Preset category */
  category: string;
  /** Material configuration overrides */
  material: Partial<MaterialDef>;
  /** Preview color (hex string for CSS rendering) */
  previewColor: string;
}

/**
 * @deprecated Use MaterialEditorPreset instead.
 */
export type MaterialPreset = MaterialEditorPreset;

/**
 * Material editor configuration
 */
export interface MaterialEditorConfig {
  /** Container element */
  container?: HTMLElement;
  /** Enable live preview */
  livePreview?: boolean;
  /** Preview resolution */
  previewResolution?: number;
  /** Auto-save */
  autoSave?: boolean;
  /** Debug mode */
  debug?: boolean;
  /** Theme */
  theme?: 'light' | 'dark';
}

/**
 * Material Editor
 *
 * Professional material editing with live preview sphere.
 * All materials use the unified MaterialDef type from the rendering subsystem.
 */
export class MaterialEditor {
  private readonly config: Required<MaterialEditorConfig>;
  private materials = new Map<string, MaterialDef>();
  private currentMaterialId: string | null = null;
  private container: HTMLElement | null = null;
  private previewCanvas: HTMLCanvasElement | null = null;
  private previewRenderer: any = null; // THREE.WebGLRenderer
  private previewScene: any = null; // THREE.Scene
  private previewCamera: any = null; // THREE.Camera
  private previewSphere: any = null; // THREE.Mesh

  // Material presets (using unified MaterialDef schema)
  private static readonly PRESETS: MaterialEditorPreset[] = [
    {
      name: 'Concrete',
      category: 'Construction',
      material: {
        materialType: 'standard',
        albedo: { r: 0.502, g: 0.502, b: 0.502, a: 1 },
        metallic: 0.0,
        roughness: 0.9,
      },
      previewColor: '#808080',
    },
    {
      name: 'Metal',
      category: 'Metal',
      material: {
        materialType: 'metal',
        albedo: { r: 0.533, g: 0.533, b: 0.533, a: 1 },
        metallic: 1.0,
        roughness: 0.2,
      },
      previewColor: '#888888',
    },
    {
      name: 'Gold',
      category: 'Metal',
      material: {
        materialType: 'metal',
        albedo: { r: 1.0, g: 0.843, b: 0.0, a: 1 },
        metallic: 1.0,
        roughness: 0.15,
      },
      previewColor: '#ffd700',
    },
    {
      name: 'Copper',
      category: 'Metal',
      material: {
        materialType: 'metal',
        albedo: { r: 0.722, g: 0.451, b: 0.2, a: 1 },
        metallic: 1.0,
        roughness: 0.25,
      },
      previewColor: '#b87333',
    },
    {
      name: 'Chrome',
      category: 'Metal',
      material: {
        materialType: 'metal',
        albedo: { r: 0.8, g: 0.8, b: 0.8, a: 1 },
        metallic: 1.0,
        roughness: 0.05,
      },
      previewColor: '#cccccc',
    },
    {
      name: 'Wood',
      category: 'Natural',
      material: {
        materialType: 'standard',
        albedo: { r: 0.545, g: 0.435, b: 0.278, a: 1 },
        metallic: 0.0,
        roughness: 0.7,
      },
      previewColor: '#8b6f47',
    },
    {
      name: 'Plastic',
      category: 'Synthetic',
      material: {
        materialType: 'physical',
        albedo: { r: 1.0, g: 0.42, b: 0.42, a: 1 },
        metallic: 0.0,
        roughness: 0.4,
      },
      previewColor: '#ff6b6b',
    },
    {
      name: 'Glass',
      category: 'Transparent',
      material: {
        materialType: 'glass',
        albedo: { r: 1.0, g: 1.0, b: 1.0, a: 0.3 },
        metallic: 0.0,
        roughness: 0.0,
        blendMode: 'transparent',
        doubleSided: true,
      },
      previewColor: 'rgba(255, 255, 255, 0.3)',
    },
    {
      name: 'Rubber',
      category: 'Synthetic',
      material: {
        materialType: 'standard',
        albedo: { r: 0.2, g: 0.2, b: 0.2, a: 1 },
        metallic: 0.0,
        roughness: 0.8,
      },
      previewColor: '#333333',
    },
    {
      name: 'Ceramic',
      category: 'Natural',
      material: {
        materialType: 'physical',
        albedo: { r: 0.941, g: 0.941, b: 0.941, a: 1 },
        metallic: 0.0,
        roughness: 0.3,
      },
      previewColor: '#f0f0f0',
    },
    {
      name: 'Neon',
      category: 'Emissive',
      material: {
        materialType: 'emissive',
        albedo: { r: 0.0, g: 1.0, b: 0.0, a: 1 },
        emission: { r: 0.0, g: 1.0, b: 0.0 },
        emissionStrength: 2.0,
      },
      previewColor: '#00ff00',
    },
    {
      name: 'Glow',
      category: 'Emissive',
      material: {
        materialType: 'emissive',
        albedo: { r: 0.376, g: 0.647, b: 0.98, a: 1 },
        emission: { r: 0.376, g: 0.647, b: 0.98 },
        emissionStrength: 1.5,
      },
      previewColor: '#60a5fa',
    },
  ];

  constructor(config: MaterialEditorConfig = {}) {
    this.config = {
      container: config.container ?? null,
      livePreview: config.livePreview ?? true,
      previewResolution: config.previewResolution ?? 512,
      autoSave: config.autoSave ?? true,
      debug: config.debug ?? false,
      theme: config.theme ?? 'dark',
    };

    if (this.config.container) {
      this.initializeUI();
    }

    if (this.config.livePreview) {
      this.initializePreview();
    }

    if (this.config.debug) {
      console.log('[MaterialEditor] Initialized', this.config);
    }
  }

  /**
   * Initialize editor UI
   */
  private initializeUI(): void {
    if (!this.config.container) return;

    this.container = this.config.container;
    this.container.innerHTML = this.generateEditorHTML();

    // Get canvas reference
    this.previewCanvas = this.container.querySelector(
      '#material-preview-canvas'
    ) as HTMLCanvasElement;

    // Attach event listeners
    this.attachEventListeners();

    // Load presets into UI
    this.updatePresetsList();

    if (this.config.debug) {
      console.log('[MaterialEditor] UI initialized');
    }
  }

  /**
   * Generate editor HTML
   */
  private generateEditorHTML(): string {
    const theme = this.config.theme === 'dark' ? 'material-editor-dark' : 'material-editor-light';

    return `
      <div class="material-editor ${theme}">
        <!-- Preview Panel -->
        <div class="preview-panel">
          <div class="panel-header">
            <h3>Preview</h3>
            <div class="preview-controls">
              <button class="preview-btn" data-action="rotate" title="Rotate">🔄</button>
              <button class="preview-btn" data-action="reset" title="Reset View">↻</button>
            </div>
          </div>
          <div class="preview-content">
            <canvas id="material-preview-canvas"></canvas>
          </div>
        </div>

        <!-- Properties Panel -->
        <div class="properties-panel">
          <div class="panel-header">
            <h3>Material Properties</h3>
          </div>
          <div class="properties-content">
            <div class="property-group">
              <label>Material Type</label>
              <select id="material-type" class="property-select">
                <option value="standard">Standard</option>
                <option value="physical">Physical</option>
                <option value="metal">Metal</option>
                <option value="glass">Glass</option>
                <option value="emissive">Emissive</option>
                <option value="toon">Toon</option>
              </select>
            </div>

            <div class="property-group">
              <label>
                Base Color
                <span class="value-display" id="color-value">#888888</span>
              </label>
              <input type="color" id="base-color" class="color-input" value="#888888">
            </div>

            <div class="property-group">
              <label>
                Metalness
                <span class="value-display" id="metalness-value">0.5</span>
              </label>
              <input type="range" id="metalness" min="0" max="1" step="0.01" value="0.5" class="property-slider">
            </div>

            <div class="property-group">
              <label>
                Roughness
                <span class="value-display" id="roughness-value">0.5</span>
              </label>
              <input type="range" id="roughness" min="0" max="1" step="0.01" value="0.5" class="property-slider">
            </div>

            <div class="property-group">
              <label>
                Opacity
                <span class="value-display" id="opacity-value">1.0</span>
              </label>
              <input type="range" id="opacity" min="0" max="1" step="0.01" value="1.0" class="property-slider">
            </div>

            <div class="property-group" id="emissive-group" style="display: none;">
              <label>
                Emissive Color
                <span class="value-display" id="emissive-color-value">#00ff00</span>
              </label>
              <input type="color" id="emissive-color" class="color-input" value="#00ff00">
            </div>

            <div class="property-group" id="emissive-intensity-group" style="display: none;">
              <label>
                Emissive Intensity
                <span class="value-display" id="emissive-intensity-value">1.0</span>
              </label>
              <input type="range" id="emissive-intensity" min="0" max="5" step="0.1" value="1.0" class="property-slider">
            </div>

            <div class="property-group">
              <button id="save-material-btn" class="action-btn">Save Material</button>
            </div>
          </div>
        </div>

        <!-- Presets Panel -->
        <div class="presets-panel">
          <div class="panel-header">
            <h3>Material Presets</h3>
          </div>
          <div class="presets-content" id="presets-list">
            <!-- Populated dynamically -->
          </div>
        </div>
      </div>

      <style>
        .material-editor {
          display: grid;
          grid-template-columns: 1fr 350px;
          grid-template-rows: 1fr 200px;
          gap: 1px;
          width: 100%;
          height: 100%;
          background: rgba(255, 255, 255, 0.05);
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
        }

        .material-editor-dark {
          background: #1a1a1a;
          color: #e0e0e0;
        }

        .material-editor-light {
          background: #f5f5f5;
          color: #333;
        }

        .preview-panel {
          grid-column: 1;
          grid-row: 1 / 3;
          display: flex;
          flex-direction: column;
          background: rgba(30, 30, 30, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .properties-panel {
          grid-column: 2;
          grid-row: 1;
          display: flex;
          flex-direction: column;
          background: rgba(30, 30, 30, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .presets-panel {
          grid-column: 2;
          grid-row: 2;
          display: flex;
          flex-direction: column;
          background: rgba(30, 30, 30, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 10px 15px;
          background: rgba(0, 0, 0, 0.2);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .panel-header h3 {
          margin: 0;
          font-size: 14px;
          font-weight: 600;
          color: #60a5fa;
        }

        .preview-controls {
          display: flex;
          gap: 5px;
        }

        .preview-btn {
          padding: 4px 8px;
          background: rgba(96, 165, 250, 0.1);
          border: 1px solid rgba(96, 165, 250, 0.3);
          border-radius: 4px;
          color: #60a5fa;
          cursor: pointer;
          font-size: 14px;
        }

        .preview-btn:hover {
          background: rgba(96, 165, 250, 0.2);
        }

        .preview-content {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
          padding: 20px;
        }

        #material-preview-canvas {
          max-width: 100%;
          max-height: 100%;
          border-radius: 8px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
        }

        .properties-content {
          flex: 1;
          overflow-y: auto;
          padding: 15px;
        }

        .property-group {
          margin-bottom: 20px;
        }

        .property-group label {
          display: block;
          font-size: 13px;
          margin-bottom: 8px;
          color: #cbd5e0;
          font-weight: 500;
        }

        .value-display {
          float: right;
          color: #60a5fa;
          font-size: 12px;
          font-weight: 600;
        }

        .property-slider {
          width: 100%;
          height: 6px;
          border-radius: 3px;
          background: rgba(96, 165, 250, 0.2);
          outline: none;
          -webkit-appearance: none;
        }

        .property-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #60a5fa;
          cursor: pointer;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
        }

        .property-select {
          width: 100%;
          padding: 8px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          color: #fff;
          font-size: 13px;
        }

        .color-input {
          width: 100%;
          height: 40px;
          padding: 0;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          background: transparent;
          cursor: pointer;
        }

        .action-btn {
          width: 100%;
          padding: 10px;
          background: rgba(34, 197, 94, 0.2);
          border: 1px solid rgba(34, 197, 94, 0.4);
          border-radius: 6px;
          color: #4ade80;
          cursor: pointer;
          font-size: 13px;
          font-weight: 500;
          transition: all 0.2s;
        }

        .action-btn:hover {
          background: rgba(34, 197, 94, 0.3);
          border-color: rgba(34, 197, 94, 0.6);
        }

        .presets-content {
          padding: 10px;
          overflow-y: auto;
        }

        .presets-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 10px;
        }

        .preset-card {
          padding: 10px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }

        .preset-card:hover {
          background: rgba(96, 165, 250, 0.1);
          border-color: rgba(96, 165, 250, 0.3);
        }

        .preset-color {
          width: 100%;
          height: 50px;
          border-radius: 4px;
          margin-bottom: 8px;
          border: 1px solid rgba(255, 255, 255, 0.2);
        }

        .preset-name {
          font-size: 11px;
          color: #94a3b8;
        }
      </style>
    `;
  }

  /**
   * Initialize 3D preview
   */
  private initializePreview(): void {
    if (!this.previewCanvas || typeof (window as any).THREE === 'undefined') return;

    const THREE = (window as any).THREE;

    // Scene
    this.previewScene = new THREE.Scene();
    this.previewScene.background = null; // Transparent

    // Camera
    this.previewCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.previewCamera.position.set(0, 0, 5);

    // Renderer
    this.previewRenderer = new THREE.WebGLRenderer({
      canvas: this.previewCanvas,
      alpha: true,
      antialias: true,
    });
    this.previewRenderer.setSize(this.config.previewResolution, this.config.previewResolution);
    this.previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Sphere geometry
    const geometry = new THREE.SphereGeometry(1.5, 64, 64);

    // Default material
    const material = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.5,
      roughness: 0.5,
    });

    this.previewSphere = new THREE.Mesh(geometry, material);
    this.previewScene.add(this.previewSphere);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.previewScene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 5, 5);
    this.previewScene.add(directionalLight);

    const rimLight = new THREE.DirectionalLight(0x60a5fa, 0.5);
    rimLight.position.set(-5, 0, -5);
    this.previewScene.add(rimLight);

    // Start animation loop
    this.animatePreview();

    if (this.config.debug) {
      console.log('[MaterialEditor] Preview initialized');
    }
  }

  /**
   * Animate preview sphere
   */
  private animatePreview(): void {
    if (!this.previewRenderer || !this.previewScene || !this.previewCamera) return;

    const animate = () => {
      requestAnimationFrame(animate);

      // Rotate sphere
      if (this.previewSphere) {
        this.previewSphere.rotation.y += 0.005;
      }

      this.previewRenderer.render(this.previewScene, this.previewCamera);
    };

    animate();
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    if (!this.container) return;

    // Material type
    const typeSelect = this.container.querySelector('#material-type') as HTMLSelectElement;
    typeSelect?.addEventListener('change', (e) => {
      const type = (e.target as HTMLSelectElement).value;
      this.updateMaterialType(type);
    });

    // Base color
    const colorInput = this.container.querySelector('#base-color') as HTMLInputElement;
    colorInput?.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      document.getElementById('color-value')!.textContent = color;
      this.updatePreviewMaterial({ color });
    });

    // Metalness
    const metalnessInput = this.container.querySelector('#metalness') as HTMLInputElement;
    metalnessInput?.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById('metalness-value')!.textContent = value.toFixed(2);
      this.updatePreviewMaterial({ metalness: value });
    });

    // Roughness
    const roughnessInput = this.container.querySelector('#roughness') as HTMLInputElement;
    roughnessInput?.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById('roughness-value')!.textContent = value.toFixed(2);
      this.updatePreviewMaterial({ roughness: value });
    });

    // Opacity
    const opacityInput = this.container.querySelector('#opacity') as HTMLInputElement;
    opacityInput?.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById('opacity-value')!.textContent = value.toFixed(2);
      this.updatePreviewMaterial({ opacity: value, transparent: value < 1.0 });
    });

    // Emissive color
    const emissiveColorInput = this.container.querySelector('#emissive-color') as HTMLInputElement;
    emissiveColorInput?.addEventListener('input', (e) => {
      const color = (e.target as HTMLInputElement).value;
      document.getElementById('emissive-color-value')!.textContent = color;
      this.updatePreviewMaterial({ emissive: color });
    });

    // Emissive intensity
    const emissiveIntensityInput = this.container.querySelector(
      '#emissive-intensity'
    ) as HTMLInputElement;
    emissiveIntensityInput?.addEventListener('input', (e) => {
      const value = parseFloat((e.target as HTMLInputElement).value);
      document.getElementById('emissive-intensity-value')!.textContent = value.toFixed(1);
      this.updatePreviewMaterial({ emissiveIntensity: value });
    });

    // Save button
    const saveBtn = this.container.querySelector('#save-material-btn') as HTMLButtonElement;
    saveBtn?.addEventListener('click', () => {
      this.saveMaterial();
    });
  }

  /**
   * Update material type
   */
  private updateMaterialType(type: string): void {
    // Show/hide emissive controls
    const emissiveGroup = document.getElementById('emissive-group');
    const emissiveIntensityGroup = document.getElementById('emissive-intensity-group');

    if (type === 'emissive') {
      if (emissiveGroup) emissiveGroup.style.display = 'block';
      if (emissiveIntensityGroup) emissiveIntensityGroup.style.display = 'block';
    } else {
      if (emissiveGroup) emissiveGroup.style.display = 'none';
      if (emissiveIntensityGroup) emissiveIntensityGroup.style.display = 'none';
    }

    if (this.config.debug) {
      console.log('[MaterialEditor] Material type changed:', type);
    }
  }

  /**
   * Update preview material (THREE.js sphere).
   * Accepts hex color strings for THREE.js Color.set() compatibility.
   */
  private updatePreviewMaterial(params: any): void {
    if (!this.previewSphere) return;

    const material = this.previewSphere.material;

    if (params.color !== undefined) {
      material.color.set(params.color);
    }

    if (params.metalness !== undefined) {
      material.metalness = params.metalness;
    }

    if (params.roughness !== undefined) {
      material.roughness = params.roughness;
    }

    if (params.opacity !== undefined) {
      material.opacity = params.opacity;
    }

    if (params.transparent !== undefined) {
      material.transparent = params.transparent;
    }

    if (params.emissive !== undefined) {
      material.emissive.set(params.emissive);
    }

    if (params.emissiveIntensity !== undefined) {
      material.emissiveIntensity = params.emissiveIntensity;
    }

    material.needsUpdate = true;
  }

  /**
   * Save current material.
   * Returns a fully-formed MaterialDef (the unified PBR type).
   */
  public saveMaterial(): MaterialDef {
    const id = `material_${Date.now()}`;
    const material: MaterialDef = this.getCurrentMaterial();
    material.id = id;

    this.materials.set(id, material);

    if (this.config.debug) {
      console.log('[MaterialEditor] Material saved:', material);
    }

    return material;
  }

  /**
   * Get current material configuration from the editor UI.
   * Reads hex color values from DOM inputs and converts to RGBA objects
   * for the unified MaterialDef type.
   */
  public getCurrentMaterial(): MaterialDef {
    const typeSelect = document.getElementById('material-type') as HTMLSelectElement;
    const colorInput = document.getElementById('base-color') as HTMLInputElement;
    const metalnessInput = document.getElementById('metalness') as HTMLInputElement;
    const roughnessInput = document.getElementById('roughness') as HTMLInputElement;
    const opacityInput = document.getElementById('opacity') as HTMLInputElement;
    const emissiveColorInput = document.getElementById('emissive-color') as HTMLInputElement;
    const emissiveIntensityInput = document.getElementById(
      'emissive-intensity'
    ) as HTMLInputElement;

    const materialType = (typeSelect?.value as MaterialType) || 'standard';
    const colorHex = colorInput?.value || '#888888';
    const albedo = hexToRGBA(colorHex);
    const opacity = parseFloat(opacityInput?.value || '1.0');
    albedo.a = opacity;

    const material: MaterialDef = createDefaultMaterialDef('', 'Custom Material', materialType);
    material.albedo = albedo;
    material.metallic = parseFloat(metalnessInput?.value || '0.5');
    material.roughness = parseFloat(roughnessInput?.value || '0.5');

    if (opacity < 1.0) {
      material.blendMode = 'transparent';
    }

    if (materialType === 'emissive') {
      const emissiveHex = emissiveColorInput?.value || '#00ff00';
      const emissiveRgba = hexToRGBA(emissiveHex);
      material.emission = { r: emissiveRgba.r, g: emissiveRgba.g, b: emissiveRgba.b };
      material.emissionStrength = parseFloat(emissiveIntensityInput?.value || '1.0');
    }

    return material;
  }

  /**
   * Load a MaterialDef into the editor UI.
   * Converts RGBA objects back to hex strings for DOM color inputs.
   */
  public loadMaterial(material: MaterialDef): void {
    this.currentMaterialId = material.id;

    // Convert MaterialDef colors to hex for the UI
    const colorHex = rgbaToHex(material.albedo);
    const emissiveHex = rgbaToHex(material.emission);

    // Update UI
    const typeSelect = document.getElementById('material-type') as HTMLSelectElement;
    const colorInput = document.getElementById('base-color') as HTMLInputElement;
    const metalnessInput = document.getElementById('metalness') as HTMLInputElement;
    const roughnessInput = document.getElementById('roughness') as HTMLInputElement;
    const opacityInput = document.getElementById('opacity') as HTMLInputElement;
    const emissiveColorInput = document.getElementById('emissive-color') as HTMLInputElement;
    const emissiveIntensityInput = document.getElementById(
      'emissive-intensity'
    ) as HTMLInputElement;

    if (typeSelect) typeSelect.value = material.materialType || 'standard';
    if (colorInput) colorInput.value = colorHex;
    if (metalnessInput) metalnessInput.value = material.metallic.toString();
    if (roughnessInput) roughnessInput.value = material.roughness.toString();
    if (opacityInput) opacityInput.value = (material.albedo.a ?? 1.0).toString();

    if (emissiveColorInput) {
      emissiveColorInput.value = emissiveHex;
    }

    if (emissiveIntensityInput) {
      emissiveIntensityInput.value = material.emissionStrength.toString();
    }

    // Update value displays
    document.getElementById('color-value')!.textContent = colorHex;
    document.getElementById('metalness-value')!.textContent = material.metallic.toFixed(2);
    document.getElementById('roughness-value')!.textContent = material.roughness.toFixed(2);
    document.getElementById('opacity-value')!.textContent = (material.albedo.a ?? 1.0).toFixed(2);

    if (material.emissionStrength > 0) {
      document.getElementById('emissive-color-value')!.textContent = emissiveHex;
      document.getElementById('emissive-intensity-value')!.textContent =
        material.emissionStrength.toFixed(1);
    }

    // Update material type visibility
    this.updateMaterialType(material.materialType || 'standard');

    // Update preview (using hex for THREE.js compatibility)
    this.updatePreviewMaterial({
      color: colorHex,
      metalness: material.metallic,
      roughness: material.roughness,
      opacity: material.albedo.a ?? 1.0,
      transparent: material.blendMode === 'transparent',
      emissive: emissiveHex,
      emissiveIntensity: material.emissionStrength,
    });

    if (this.config.debug) {
      console.log('[MaterialEditor] Material loaded:', material.name);
    }
  }

  /**
   * Load a preset by name.
   * Merges preset overrides with default MaterialDef values.
   */
  public loadPreset(presetName: string): void {
    const preset = MaterialEditor.PRESETS.find((p) => p.name === presetName);
    if (!preset) return;

    // Create a full MaterialDef from the preset overrides
    const material: MaterialDef = {
      ...createDefaultMaterialDef(
        `preset_${presetName.toLowerCase()}`,
        presetName,
        preset.material.materialType
      ),
      ...preset.material,
      id: `preset_${presetName.toLowerCase()}`,
      name: presetName,
    };

    this.loadMaterial(material);

    if (this.config.debug) {
      console.log('[MaterialEditor] Preset loaded:', presetName);
    }
  }

  /**
   * Update presets list
   */
  private updatePresetsList(): void {
    const presetsList = document.getElementById('presets-list');
    if (!presetsList) return;

    let html = '<div class="presets-grid">';

    for (const preset of MaterialEditor.PRESETS) {
      html += `
        <div class="preset-card" data-preset="${preset.name}">
          <div class="preset-color" style="background: ${preset.previewColor};"></div>
          <div class="preset-name">${preset.name}</div>
        </div>
      `;
    }

    html += '</div>';
    presetsList.innerHTML = html;

    // Attach preset click handlers
    presetsList.querySelectorAll('.preset-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        const presetName = (e.currentTarget as HTMLElement).getAttribute('data-preset');
        if (presetName) {
          this.loadPreset(presetName);
        }
      });
    });
  }

  /**
   * Get all materials (returns unified MaterialDef objects)
   */
  public getMaterials(): MaterialDef[] {
    return Array.from(this.materials.values());
  }

  /**
   * Get presets
   */
  public static getPresets(): MaterialEditorPreset[] {
    return MaterialEditor.PRESETS;
  }

  /**
   * Dispose editor
   */
  public dispose(): void {
    if (this.previewRenderer) {
      this.previewRenderer.dispose();
      this.previewRenderer = null;
    }

    this.materials.clear();

    if (this.config.debug) {
      console.log('[MaterialEditor] Disposed');
    }
  }
}
