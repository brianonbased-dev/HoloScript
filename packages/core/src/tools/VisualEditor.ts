/**
 * VisualEditor.ts
 *
 * HoloStudio Visual Editor - Foundation
 * Unity/Unreal-style visual editor for creating HoloScript compositions.
 * Drag-and-drop scene builder, property editing, real-time preview.
 */

import type { HoloComposition, HoloObject, HoloTrait } from '../parser/HoloCompositionTypes';

/**
 * Editor configuration
 */
export interface VisualEditorConfig {
  /** Container element for editor UI */
  container?: HTMLElement;
  /** Enable auto-save */
  autoSave?: boolean;
  /** Auto-save interval (ms) */
  autoSaveInterval?: number;
  /** Enable debug mode */
  debug?: boolean;
  /** Enable grid snapping */
  gridSnap?: boolean;
  /** Grid size */
  gridSize?: number;
  /** Enable 3D preview */
  enable3DPreview?: boolean;
  /** Theme (light/dark) */
  theme?: 'light' | 'dark';
}

/**
 * Editor entity (represents a HoloObject in the editor)
 */
export interface EditorEntity {
  /** Unique ID */
  id: string;
  /** Entity name */
  name: string;
  /** Entity type */
  type: 'object' | 'light' | 'camera' | 'group';
  /** Parent entity ID (null for root) */
  parentId: string | null;
  /** Child entity IDs */
  children: string[];
  /** Transform */
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  /** Geometry type */
  geometry?: string;
  /** Material */
  material?: {
    type: string;
    color?: string;
    [key: string]: any;
  };
  /** Applied traits */
  traits: EditorTrait[];
  /** Custom properties */
  properties: Record<string, any>;
  /** Visibility */
  visible: boolean;
  /** Locked (can't be edited) */
  locked: boolean;
  /** Selected in editor */
  selected: boolean;
}

/**
 * Editor trait
 */
export interface EditorTrait {
  /** Trait name */
  name: string;
  /** Trait properties */
  properties?: Record<string, any>;
  /** Trait category */
  category?: string;
}

/**
 * Editor history entry (for undo/redo)
 */
export interface HistoryEntry {
  /** Action type */
  action: 'create' | 'delete' | 'modify' | 'move';
  /** Entity ID */
  entityId: string;
  /** Previous state */
  previousState?: any;
  /** New state */
  newState?: any;
  /** Timestamp */
  timestamp: number;
}

/**
 * Visual Editor for HoloScript
 *
 * Provides Unity/Unreal-style visual editing capabilities.
 */
export class VisualEditor {
  private readonly config: Required<VisualEditorConfig>;
  private entities = new Map<string, EditorEntity>();
  private selectedEntityIds = new Set<string>();
  private composition: HoloComposition | null = null;
  private history: HistoryEntry[] = [];
  private historyIndex = -1;
  private maxHistorySize = 100;
  private autoSaveTimer?: number;
  private container: HTMLElement | null = null;
  private hierarchyPanel: HTMLElement | null = null;
  private propertiesPanel: HTMLElement | null = null;
  private viewportPanel: HTMLElement | null = null;
  private toolbarPanel: HTMLElement | null = null;

  constructor(config: VisualEditorConfig = {}) {
    this.config = {
      container: config.container ?? null,
      autoSave: config.autoSave ?? true,
      autoSaveInterval: config.autoSaveInterval ?? 30000, // 30 seconds
      debug: config.debug ?? false,
      gridSnap: config.gridSnap ?? true,
      gridSize: config.gridSize ?? 1.0,
      enable3DPreview: config.enable3DPreview ?? true,
      theme: config.theme ?? 'dark',
    };

    if (this.config.container) {
      this.initializeUI();
    }

    if (this.config.autoSave) {
      this.startAutoSave();
    }

    if (this.config.debug) {
      console.log('[VisualEditor] Initialized', this.config);
    }
  }

  /**
   * Initialize editor UI
   */
  private initializeUI(): void {
    if (!this.config.container) return;

    this.container = this.config.container;
    this.container.innerHTML = this.generateEditorHTML();

    // Get panel references
    this.hierarchyPanel = this.container.querySelector('.editor-hierarchy') as HTMLElement;
    this.propertiesPanel = this.container.querySelector('.editor-properties') as HTMLElement;
    this.viewportPanel = this.container.querySelector('.editor-viewport') as HTMLElement;
    this.toolbarPanel = this.container.querySelector('.editor-toolbar') as HTMLElement;

    // Attach event listeners
    this.attachEventListeners();

    if (this.config.debug) {
      console.log('[VisualEditor] UI initialized');
    }
  }

  /**
   * Generate editor HTML
   */
  private generateEditorHTML(): string {
    const theme = this.config.theme === 'dark' ? 'editor-dark' : 'editor-light';

    return `
      <div class="holostudio-editor ${theme}">
        <!-- Toolbar -->
        <div class="editor-toolbar">
          <div class="toolbar-section">
            <button class="toolbar-btn" data-action="new" title="New Composition">
              <span class="icon">📄</span> New
            </button>
            <button class="toolbar-btn" data-action="open" title="Open Composition">
              <span class="icon">📁</span> Open
            </button>
            <button class="toolbar-btn" data-action="save" title="Save Composition">
              <span class="icon">💾</span> Save
            </button>
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn" data-action="undo" title="Undo">
              <span class="icon">↶</span>
            </button>
            <button class="toolbar-btn" data-action="redo" title="Redo">
              <span class="icon">↷</span>
            </button>
          </div>
          <div class="toolbar-section">
            <button class="toolbar-btn" data-action="play" title="Preview">
              <span class="icon">▶</span> Preview
            </button>
          </div>
        </div>

        <!-- Main Content -->
        <div class="editor-content">
          <!-- Left Sidebar: Hierarchy -->
          <div class="editor-panel editor-hierarchy">
            <div class="panel-header">
              <h3>Hierarchy</h3>
              <button class="panel-btn" data-action="add-entity" title="Add Entity">+</button>
            </div>
            <div class="panel-content" id="hierarchy-content">
              <!-- Populated dynamically -->
            </div>
          </div>

          <!-- Center: Viewport -->
          <div class="editor-panel editor-viewport">
            <div class="panel-header">
              <h3>Viewport</h3>
              <div class="viewport-controls">
                <button class="panel-btn" data-action="grid-toggle" title="Toggle Grid">
                  <span class="icon">⊞</span>
                </button>
                <button class="panel-btn" data-action="gizmo-toggle" title="Toggle Gizmo">
                  <span class="icon">⊹</span>
                </button>
              </div>
            </div>
            <div class="panel-content viewport-content" id="viewport-content">
              <canvas id="editor-canvas"></canvas>
              <div class="viewport-overlay">
                <div class="viewport-stats">
                  <div>Entities: <span id="entity-count">0</span></div>
                  <div>Selected: <span id="selected-count">0</span></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Sidebar: Properties -->
          <div class="editor-panel editor-properties">
            <div class="panel-header">
              <h3>Properties</h3>
            </div>
            <div class="panel-content" id="properties-content">
              <div class="no-selection">
                <p>No entity selected</p>
                <p class="hint">Select an entity in the Hierarchy or Viewport</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom Panel: Asset Library & Traits -->
        <div class="editor-bottom">
          <div class="panel-header">
            <h3>Traits & Assets</h3>
          </div>
          <div class="panel-content traits-library">
            <!-- Populated dynamically -->
          </div>
        </div>
      </div>

      <style>
        .holostudio-editor {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
          overflow: hidden;
        }

        .editor-dark {
          background: #1a1a1a;
          color: #e0e0e0;
        }

        .editor-light {
          background: #f5f5f5;
          color: #333;
        }

        /* Toolbar */
        .editor-toolbar {
          display: flex;
          gap: 20px;
          padding: 10px 15px;
          background: rgba(0, 0, 0, 0.3);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .toolbar-section {
          display: flex;
          gap: 5px;
        }

        .toolbar-btn {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 6px 12px;
          background: rgba(96, 165, 250, 0.1);
          border: 1px solid rgba(96, 165, 250, 0.3);
          border-radius: 6px;
          color: #60a5fa;
          cursor: pointer;
          font-size: 13px;
          transition: all 0.2s;
        }

        .toolbar-btn:hover {
          background: rgba(96, 165, 250, 0.2);
          border-color: rgba(96, 165, 250, 0.5);
        }

        .icon {
          font-size: 16px;
        }

        /* Main Content */
        .editor-content {
          display: flex;
          flex: 1;
          gap: 1px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.05);
        }

        .editor-panel {
          display: flex;
          flex-direction: column;
          background: rgba(30, 30, 30, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .editor-hierarchy {
          width: 250px;
          flex-shrink: 0;
        }

        .editor-viewport {
          flex: 1;
          min-width: 0;
        }

        .editor-properties {
          width: 300px;
          flex-shrink: 0;
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

        .panel-btn {
          padding: 4px 8px;
          background: rgba(96, 165, 250, 0.1);
          border: 1px solid rgba(96, 165, 250, 0.3);
          border-radius: 4px;
          color: #60a5fa;
          cursor: pointer;
          font-size: 14px;
        }

        .panel-btn:hover {
          background: rgba(96, 165, 250, 0.2);
        }

        .panel-content {
          flex: 1;
          overflow-y: auto;
          padding: 10px;
        }

        /* Viewport */
        .viewport-content {
          position: relative;
          padding: 0;
        }

        #editor-canvas {
          width: 100%;
          height: 100%;
          display: block;
        }

        .viewport-overlay {
          position: absolute;
          top: 10px;
          left: 10px;
          pointer-events: none;
        }

        .viewport-stats {
          background: rgba(0, 0, 0, 0.7);
          padding: 8px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-family: 'Courier New', monospace;
        }

        .viewport-stats div {
          margin-bottom: 3px;
        }

        .viewport-controls {
          display: flex;
          gap: 5px;
        }

        /* Properties Panel */
        .no-selection {
          text-align: center;
          padding: 40px 20px;
          color: #888;
        }

        .no-selection .hint {
          font-size: 12px;
          margin-top: 10px;
        }

        /* Bottom Panel */
        .editor-bottom {
          height: 200px;
          background: rgba(30, 30, 30, 0.95);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        .traits-library {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
          gap: 10px;
        }
      </style>
    `;
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    if (!this.container) return;

    // Toolbar actions
    this.container.querySelectorAll('[data-action]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const action = (e.currentTarget as HTMLElement).getAttribute('data-action');
        this.handleAction(action);
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      this.handleKeyboardShortcut(e);
    });
  }

  /**
   * Handle toolbar action
   */
  private handleAction(action: string | null): void {
    if (!action) return;

    switch (action) {
      case 'new':
        this.createNewComposition();
        break;
      case 'save':
        this.saveComposition();
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
      case 'add-entity':
        this.addEntity();
        break;
      case 'play':
        this.previewComposition();
        break;
      default:
        if (this.config.debug) {
          console.log('[VisualEditor] Unhandled action:', action);
        }
    }
  }

  /**
   * Handle keyboard shortcut
   */
  private handleKeyboardShortcut(e: KeyboardEvent): void {
    const isCtrl = e.ctrlKey || e.metaKey;

    if (isCtrl && e.key === 's') {
      e.preventDefault();
      this.saveComposition();
    } else if (isCtrl && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        this.redo();
      } else {
        this.undo();
      }
    } else if (e.key === 'Delete') {
      e.preventDefault();
      this.deleteSelectedEntities();
    }
  }

  /**
   * Create new composition
   */
  public createNewComposition(): void {
    this.composition = {
      name: 'Untitled',
      objects: [],
      traits: [],
      settings: {},
    };

    this.entities.clear();
    this.selectedEntityIds.clear();
    this.history = [];
    this.historyIndex = -1;

    this.updateHierarchy();
    this.updateProperties();

    if (this.config.debug) {
      console.log('[VisualEditor] New composition created');
    }
  }

  /**
   * Load composition
   */
  public loadComposition(composition: HoloComposition): void {
    this.composition = composition;
    this.entities.clear();
    this.selectedEntityIds.clear();

    // Convert HoloObjects to EditorEntities
    let entityIndex = 0;
    for (const obj of composition.objects || []) {
      const entity = this.holoObjectToEntity(obj, entityIndex++);
      this.entities.set(entity.id, entity);
    }

    this.updateHierarchy();
    this.updateProperties();

    if (this.config.debug) {
      console.log('[VisualEditor] Composition loaded:', composition.name);
    }
  }

  /**
   * Convert HoloObject to EditorEntity
   */
  private holoObjectToEntity(obj: HoloObject, index: number): EditorEntity {
    return {
      id: `entity_${index}`,
      name: obj.name || `Object ${index}`,
      type: 'object',
      parentId: null,
      children: [],
      transform: {
        position: obj.position ? [obj.position[0], obj.position[1], obj.position[2]] : [0, 0, 0],
        rotation: obj.rotation ? [obj.rotation[0], obj.rotation[1], obj.rotation[2]] : [0, 0, 0],
        scale: obj.scale ? [obj.scale[0], obj.scale[1], obj.scale[2]] : [1, 1, 1],
      },
      geometry: obj.geometry,
      material: obj.material,
      traits: (obj.traits || []).map((t) => ({
        name: t.name,
        properties: t.properties,
        category: this.getTraitCategory(t.name),
      })),
      properties: obj.properties || {},
      visible: true,
      locked: false,
      selected: false,
    };
  }

  /**
   * Get trait category
   */
  private getTraitCategory(traitName: string): string {
    if (traitName.startsWith('physics')) return 'Physics';
    if (traitName.startsWith('render')) return 'Rendering';
    if (['grabbable', 'climbable', 'teleport'].includes(traitName)) return 'VR';
    return 'General';
  }

  /**
   * Save composition
   */
  public saveComposition(): HoloComposition | null {
    if (!this.composition) return null;

    // Convert EditorEntities back to HoloObjects
    const objects: HoloObject[] = [];

    for (const entity of this.entities.values()) {
      const obj: HoloObject = {
        name: entity.name,
        position: entity.transform.position,
        rotation: entity.transform.rotation,
        scale: entity.transform.scale,
        geometry: entity.geometry,
        material: entity.material,
        traits: entity.traits.map((t) => ({
          name: t.name,
          properties: t.properties,
        })),
        properties: entity.properties,
      };

      objects.push(obj);
    }

    this.composition.objects = objects;

    if (this.config.debug) {
      console.log('[VisualEditor] Composition saved:', this.composition);
    }

    return this.composition;
  }

  /**
   * Export composition as .holo code
   */
  public exportToCode(): string {
    if (!this.composition) return '';

    let code = `composition "${this.composition.name}" {\n`;

    for (const entity of this.entities.values()) {
      code += `  object "${entity.name}" {\n`;

      // Traits
      for (const trait of entity.traits) {
        if (trait.properties && Object.keys(trait.properties).length > 0) {
          const propsStr = Object.entries(trait.properties)
            .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
            .join(', ');
          code += `    @${trait.name}(${propsStr})\n`;
        } else {
          code += `    @${trait.name}\n`;
        }
      }

      // Properties
      if (entity.geometry) {
        code += `    geometry: "${entity.geometry}"\n`;
      }

      code += `    position: [${entity.transform.position.join(', ')}]\n`;

      if (entity.transform.rotation.some((r) => r !== 0)) {
        code += `    rotation: [${entity.transform.rotation.join(', ')}]\n`;
      }

      if (entity.transform.scale.some((s) => s !== 1)) {
        code += `    scale: [${entity.transform.scale.join(', ')}]\n`;
      }

      if (entity.material) {
        code += `    material: ${JSON.stringify(entity.material)}\n`;
      }

      code += `  }\n`;
    }

    code += `}\n`;

    return code;
  }

  /**
   * Add new entity
   */
  public addEntity(type: 'box' | 'sphere' | 'cylinder' | 'plane' = 'box'): EditorEntity {
    const id = `entity_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const entity: EditorEntity = {
      id,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${this.entities.size + 1}`,
      type: 'object',
      parentId: null,
      children: [],
      transform: {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      },
      geometry: type,
      material: {
        type: 'standard',
        color: '#888888',
      },
      traits: [],
      properties: {},
      visible: true,
      locked: false,
      selected: false,
    };

    this.entities.set(id, entity);
    this.addToHistory('create', id, undefined, entity);
    this.updateHierarchy();

    if (this.config.debug) {
      console.log('[VisualEditor] Entity added:', entity.name);
    }

    return entity;
  }

  /**
   * Delete selected entities
   */
  public deleteSelectedEntities(): void {
    for (const id of this.selectedEntityIds) {
      const entity = this.entities.get(id);
      if (entity && !entity.locked) {
        this.addToHistory('delete', id, entity, undefined);
        this.entities.delete(id);
      }
    }

    this.selectedEntityIds.clear();
    this.updateHierarchy();
    this.updateProperties();

    if (this.config.debug) {
      console.log('[VisualEditor] Deleted entities');
    }
  }

  /**
   * Select entity
   */
  public selectEntity(id: string, multiSelect = false): void {
    if (!multiSelect) {
      // Deselect all
      for (const entity of this.entities.values()) {
        entity.selected = false;
      }
      this.selectedEntityIds.clear();
    }

    const entity = this.entities.get(id);
    if (entity) {
      entity.selected = true;
      this.selectedEntityIds.add(id);
      this.updateProperties();
    }
  }

  /**
   * Update entity property
   */
  public updateEntityProperty(id: string, path: string, value: any): void {
    const entity = this.entities.get(id);
    if (!entity || entity.locked) return;

    const previousState = { ...entity };

    // Parse property path (e.g., "transform.position.0")
    const keys = path.split('.');
    let target: any = entity;

    for (let i = 0; i < keys.length - 1; i++) {
      target = target[keys[i]];
    }

    target[keys[keys.length - 1]] = value;

    this.addToHistory('modify', id, previousState, entity);
    this.updateProperties();

    if (this.config.debug) {
      console.log('[VisualEditor] Property updated:', path, '=', value);
    }
  }

  /**
   * Add history entry
   */
  private addToHistory(
    action: HistoryEntry['action'],
    entityId: string,
    previousState?: any,
    newState?: any
  ): void {
    // Remove entries after current index (if we've undone)
    this.history = this.history.slice(0, this.historyIndex + 1);

    // Add new entry
    this.history.push({
      action,
      entityId,
      previousState,
      newState,
      timestamp: Date.now(),
    });

    this.historyIndex++;

    // Limit history size
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
      this.historyIndex--;
    }
  }

  /**
   * Undo last action
   */
  public undo(): void {
    if (this.historyIndex < 0) return;

    const entry = this.history[this.historyIndex];

    if (entry.action === 'create') {
      // Remove entity
      this.entities.delete(entry.entityId);
    } else if (entry.action === 'delete') {
      // Restore entity
      this.entities.set(entry.entityId, entry.previousState);
    } else if (entry.action === 'modify') {
      // Restore previous state
      this.entities.set(entry.entityId, entry.previousState);
    }

    this.historyIndex--;
    this.updateHierarchy();
    this.updateProperties();

    if (this.config.debug) {
      console.log('[VisualEditor] Undo:', entry.action);
    }
  }

  /**
   * Redo last undone action
   */
  public redo(): void {
    if (this.historyIndex >= this.history.length - 1) return;

    this.historyIndex++;
    const entry = this.history[this.historyIndex];

    if (entry.action === 'create') {
      // Re-add entity
      this.entities.set(entry.entityId, entry.newState);
    } else if (entry.action === 'delete') {
      // Re-delete entity
      this.entities.delete(entry.entityId);
    } else if (entry.action === 'modify') {
      // Re-apply new state
      this.entities.set(entry.entityId, entry.newState);
    }

    this.updateHierarchy();
    this.updateProperties();

    if (this.config.debug) {
      console.log('[VisualEditor] Redo:', entry.action);
    }
  }

  /**
   * Update hierarchy panel
   */
  private updateHierarchy(): void {
    if (!this.hierarchyPanel) return;

    const content = this.hierarchyPanel.querySelector('#hierarchy-content');
    if (!content) return;

    let html = '<div class="hierarchy-list">';

    for (const entity of this.entities.values()) {
      const selectedClass = entity.selected ? 'selected' : '';
      const visibleIcon = entity.visible ? '👁' : '🚫';
      const lockedIcon = entity.locked ? '🔒' : '';

      html += `
        <div class="hierarchy-item ${selectedClass}" data-entity-id="${entity.id}">
          <span class="entity-icon">${this.getEntityIcon(entity.type)}</span>
          <span class="entity-name">${entity.name}</span>
          <span class="entity-status">${visibleIcon} ${lockedIcon}</span>
        </div>
      `;
    }

    html += '</div>';
    content.innerHTML = html;

    // Update stats
    const entityCount = document.getElementById('entity-count');
    const selectedCount = document.getElementById('selected-count');
    if (entityCount) entityCount.textContent = this.entities.size.toString();
    if (selectedCount) selectedCount.textContent = this.selectedEntityIds.size.toString();
  }

  /**
   * Get entity icon
   */
  private getEntityIcon(type: string): string {
    const icons: Record<string, string> = {
      object: '📦',
      light: '💡',
      camera: '📷',
      group: '📁',
    };
    return icons[type] || '📦';
  }

  /**
   * Update properties panel
   */
  private updateProperties(): void {
    if (!this.propertiesPanel) return;

    const content = this.propertiesPanel.querySelector('#properties-content');
    if (!content) return;

    if (this.selectedEntityIds.size === 0) {
      content.innerHTML = `
        <div class="no-selection">
          <p>No entity selected</p>
          <p class="hint">Select an entity in the Hierarchy or Viewport</p>
        </div>
      `;
      return;
    }

    // Show properties for first selected entity
    const entityId = Array.from(this.selectedEntityIds)[0];
    const entity = this.entities.get(entityId);

    if (!entity) return;

    let html = `
      <div class="properties-inspector">
        <div class="property-group">
          <h4>Transform</h4>
          <div class="property-row">
            <label>Position</label>
            <div class="vector3-input">
              <input type="number" value="${entity.transform.position[0]}" step="0.1" data-property="transform.position.0">
              <input type="number" value="${entity.transform.position[1]}" step="0.1" data-property="transform.position.1">
              <input type="number" value="${entity.transform.position[2]}" step="0.1" data-property="transform.position.2">
            </div>
          </div>
          <div class="property-row">
            <label>Rotation</label>
            <div class="vector3-input">
              <input type="number" value="${entity.transform.rotation[0]}" step="1" data-property="transform.rotation.0">
              <input type="number" value="${entity.transform.rotation[1]}" step="1" data-property="transform.rotation.1">
              <input type="number" value="${entity.transform.rotation[2]}" step="1" data-property="transform.rotation.2">
            </div>
          </div>
          <div class="property-row">
            <label>Scale</label>
            <div class="vector3-input">
              <input type="number" value="${entity.transform.scale[0]}" step="0.1" data-property="transform.scale.0">
              <input type="number" value="${entity.transform.scale[1]}" step="0.1" data-property="transform.scale.1">
              <input type="number" value="${entity.transform.scale[2]}" step="0.1" data-property="transform.scale.2">
            </div>
          </div>
        </div>

        <div class="property-group">
          <h4>Traits</h4>
          <div class="traits-list">
            ${entity.traits.map((t) => `<div class="trait-badge">${t.name}</div>`).join('')}
          </div>
          <button class="add-trait-btn">+ Add Trait</button>
        </div>
      </div>

      <style>
        .properties-inspector {
          padding: 10px;
        }

        .property-group {
          margin-bottom: 20px;
          padding: 10px;
          background: rgba(0, 0, 0, 0.2);
          border-radius: 6px;
        }

        .property-group h4 {
          margin: 0 0 10px 0;
          font-size: 13px;
          color: #60a5fa;
        }

        .property-row {
          margin-bottom: 10px;
        }

        .property-row label {
          display: block;
          font-size: 12px;
          margin-bottom: 5px;
          color: #94a3b8;
        }

        .vector3-input {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 5px;
        }

        .vector3-input input {
          padding: 5px;
          background: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 4px;
          color: #fff;
          font-size: 12px;
        }

        .traits-list {
          display: flex;
          flex-wrap: wrap;
          gap: 5px;
          margin-bottom: 10px;
        }

        .trait-badge {
          padding: 4px 8px;
          background: rgba(96, 165, 250, 0.2);
          border: 1px solid rgba(96, 165, 250, 0.4);
          border-radius: 12px;
          font-size: 11px;
          color: #60a5fa;
        }

        .add-trait-btn {
          width: 100%;
          padding: 6px;
          background: rgba(34, 197, 94, 0.1);
          border: 1px solid rgba(34, 197, 94, 0.3);
          border-radius: 4px;
          color: #4ade80;
          cursor: pointer;
          font-size: 12px;
        }

        .add-trait-btn:hover {
          background: rgba(34, 197, 94, 0.2);
        }

        .hierarchy-list {
          padding: 5px;
        }

        .hierarchy-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          margin-bottom: 2px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 13px;
        }

        .hierarchy-item:hover {
          background: rgba(96, 165, 250, 0.1);
        }

        .hierarchy-item.selected {
          background: rgba(96, 165, 250, 0.3);
        }

        .entity-icon {
          font-size: 14px;
        }

        .entity-name {
          flex: 1;
        }

        .entity-status {
          font-size: 11px;
        }
      </style>
    `;

    content.innerHTML = html;
  }

  /**
   * Preview composition
   */
  public previewComposition(): void {
    const composition = this.saveComposition();
    if (!composition) return;

    if (this.config.debug) {
      console.log('[VisualEditor] Preview:', composition);
    }

    // Emit preview event
    this.container?.dispatchEvent(
      new CustomEvent('holostudio:preview', {
        detail: { composition },
      })
    );
  }

  /**
   * Start auto-save
   */
  private startAutoSave(): void {
    if (typeof window === 'undefined') return;

    this.autoSaveTimer = window.setInterval(() => {
      this.saveComposition();
      if (this.config.debug) {
        console.log('[VisualEditor] Auto-saved');
      }
    }, this.config.autoSaveInterval);
  }

  /**
   * Stop auto-save
   */
  public stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = undefined;
    }
  }

  /**
   * Dispose editor
   */
  public dispose(): void {
    this.stopAutoSave();
    this.entities.clear();
    this.selectedEntityIds.clear();
    this.history = [];

    if (this.config.debug) {
      console.log('[VisualEditor] Disposed');
    }
  }

  /**
   * Get all entities
   */
  public getEntities(): EditorEntity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Get selected entities
   */
  public getSelectedEntities(): EditorEntity[] {
    return Array.from(this.selectedEntityIds)
      .map((id) => this.entities.get(id)!)
      .filter(Boolean);
  }

  /**
   * Get composition
   */
  public getComposition(): HoloComposition | null {
    return this.saveComposition();
  }
}
