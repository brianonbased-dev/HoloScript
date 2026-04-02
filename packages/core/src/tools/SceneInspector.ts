/**
 * SceneInspector.ts
 *
 * Professional scene inspection and debugging tool.
 * Provides Unity/Unreal-style inspector for HoloScript runtime.
 *
 * Features:
 * - Entity hierarchy viewer
 * - Property inspector with live editing
 * - Performance profiler and frame timeline
 * - Physics visualization (forces, collisions, bounds)
 * - Render statistics overlay
 * - Object selection and highlighting
 */

import type { RuntimeRenderer } from '../runtime/RuntimeRenderer';
import type { HoloComposition } from '../parser/HoloCompositionTypes';

export interface InspectorEntity {
  /** Entity ID */
  id: string;
  /** Entity name */
  name: string;
  /** Entity type */
  type: string;
  /** Parent ID (null for root) */
  parentId: string | null;
  /** Children IDs */
  childrenIds: string[];
  /** Transform */
  transform: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: [number, number, number];
  };
  /** Properties */
  properties: Record<string, any>;
  /** Traits */
  traits: string[];
  /** Visibility */
  visible: boolean;
  /** Active in scene */
  active: boolean;
}

export interface PerformanceFrame {
  /** Frame number */
  frameNumber: number;
  /** Frame time (ms) */
  frameTime: number;
  /** FPS */
  fps: number;
  /** Physics time (ms) */
  physicsTime: number;
  /** Render time (ms) */
  renderTime: number;
  /** Sync time (ms) */
  syncTime: number;
  /** Timestamp */
  timestamp: number;
}

export interface SceneStatistics {
  /** Total entities */
  totalEntities: number;
  /** Active entities */
  activeEntities: number;
  /** Visible entities */
  visibleEntities: number;
  /** Total vertices */
  totalVertices: number;
  /** Total triangles */
  totalTriangles: number;
  /** Draw calls */
  drawCalls: number;
  /** Texture memory (MB) */
  textureMemory: number;
  /** Geometry memory (MB) */
  geometryMemory: number;
  /** Current FPS */
  currentFPS: number;
  /** Average FPS (last 60 frames) */
  averageFPS: number;
  /** Min FPS (last 60 frames) */
  minFPS: number;
  /** Max FPS (last 60 frames) */
  maxFPS: number;
}

export interface PhysicsVisualization {
  /** Show collision bounds */
  showBounds: boolean;
  /** Show velocity vectors */
  showVelocity: boolean;
  /** Show force vectors */
  showForces: boolean;
  /** Show contact points */
  showContacts: boolean;
  /** Show center of mass */
  showCenterOfMass: boolean;
}

export interface InspectorConfig {
  /** Enable inspector */
  enabled?: boolean;
  /** Show performance overlay */
  showPerformance?: boolean;
  /** Show hierarchy panel */
  showHierarchy?: boolean;
  /** Show properties panel */
  showProperties?: boolean;
  /** Show statistics panel */
  showStatistics?: boolean;
  /** Performance history size */
  performanceHistorySize?: number;
  /** Update frequency (Hz) */
  updateFrequency?: number;
}

/**
 * Scene Inspector - Professional debugging and development tool
 */
export class SceneInspector {
  private readonly config: Required<InspectorConfig>;
  private composition: HoloComposition | null = null;
  private renderer: RuntimeRenderer | null = null;
  private entities = new Map<string, InspectorEntity>();
  private selectedEntityId: string | null = null;
  private performanceHistory: PerformanceFrame[] = [];
  private currentFrame = 0;
  private lastUpdateTime = 0;
  private physicsVisualization: PhysicsVisualization = {
    showBounds: false,
    showVelocity: false,
    showForces: false,
    showContacts: false,
    showCenterOfMass: false,
  };

  constructor(config: InspectorConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      showPerformance: config.showPerformance ?? true,
      showHierarchy: config.showHierarchy ?? true,
      showProperties: config.showProperties ?? true,
      showStatistics: config.showStatistics ?? true,
      performanceHistorySize: config.performanceHistorySize ?? 300,
      updateFrequency: config.updateFrequency ?? 10, // 10 Hz
    };
  }

  /**
   * Initialize inspector with composition
   */
  public initialize(composition: HoloComposition, renderer?: RuntimeRenderer): void {
    this.composition = composition;
    this.renderer = renderer || null;

    // Build entity hierarchy from composition
    this.buildEntityHierarchy();

    console.log('[SceneInspector] Initialized with', this.entities.size, 'entities');
  }

  /**
   * Build entity hierarchy from composition
   */
  private buildEntityHierarchy(): void {
    if (!this.composition) return;

    this.entities.clear();

    // Add entities from composition
    for (const obj of this.composition.objects || []) {
      const getProp = (key: string) => obj.properties?.find((p) => p.key === key)?.value;
      const pos = getProp('position') as number[] | undefined;
      const rot = getProp('rotation') as number[] | undefined;
      const scl = getProp('scale') as number[] | undefined;

      const inspectorEntity: InspectorEntity = {
        id: obj.name,
        name: obj.name,
        type: obj.type || 'entity',
        parentId: null, // HoloScript doesn't have hierarchy yet, all root-level
        childrenIds: [],
        transform: {
          position: pos ? [pos[0], pos[1], pos[2]] as any : [0, 0, 0],
          rotation: rot ? [rot[0], rot[1], rot[2]] as any : [0, 0, 0],
          scale: scl ? [scl[0], scl[1], scl[2]] as any : [1, 1, 1],
        },
        properties: this.extractProperties(obj),
        traits: obj.traits?.map((t: any) => t.name) || [],
        visible: true,
        active: true,
      };

      this.entities.set(inspectorEntity.id, inspectorEntity);
    }
  }

  /**
   * Extract properties from entity
   */
  private extractProperties(entity: any): Record<string, any> {
    const props: Record<string, any> = {};

    // Extract basic properties
    for (const prop of entity.properties || []) {
      if (['geometry', 'material'].includes(prop.key)) {
        props[prop.key] = prop.value;
      }
    }

    // Extract trait properties
    for (const trait of entity.traits || []) {
      if (trait.config) {
        props[trait.name] = trait.config;
      }
    }

    return props;
  }

  /**
   * Update inspector (call per frame)
   */
  public update(deltaTime: number): void {
    if (!this.config.enabled) return;

    this.currentFrame++;

    // Update performance data
    const now = performance.now();
    if (now - this.lastUpdateTime >= 1000 / this.config.updateFrequency) {
      this.recordPerformanceFrame(deltaTime);
      this.lastUpdateTime = now;
    }
  }

  /**
   * Record performance frame
   */
  private recordPerformanceFrame(deltaTime: number): void {
    const stats = this.renderer?.getStatistics();

    const frame: PerformanceFrame = {
      frameNumber: this.currentFrame,
      frameTime: deltaTime * 1000, // Convert to ms
      fps: stats?.fps || 0,
      physicsTime: 0, // Would come from physics engine
      renderTime: deltaTime * 1000 * 0.6, // Estimate
      syncTime: deltaTime * 1000 * 0.1, // Estimate
      timestamp: performance.now(),
    };

    this.performanceHistory.push(frame);

    // Keep history size limited
    if (this.performanceHistory.length > this.config.performanceHistorySize) {
      this.performanceHistory.shift();
    }
  }

  /**
   * Get entity hierarchy (for tree view)
   */
  public getEntityHierarchy(): InspectorEntity[] {
    return Array.from(this.entities.values());
  }

  /**
   * Get entity by ID
   */
  public getEntity(id: string): InspectorEntity | undefined {
    return this.entities.get(id);
  }

  /**
   * Select entity
   */
  public selectEntity(id: string): void {
    if (this.entities.has(id)) {
      this.selectedEntityId = id;
      console.log('[SceneInspector] Selected entity:', id);
    }
  }

  /**
   * Get selected entity
   */
  public getSelectedEntity(): InspectorEntity | null {
    return this.selectedEntityId ? this.entities.get(this.selectedEntityId) || null : null;
  }

  /**
   * Update entity property (live editing)
   */
  public updateEntityProperty(id: string, path: string, value: any): boolean {
    const entity = this.entities.get(id);
    if (!entity) return false;

    // Parse property path (e.g., "transform.position.0")
    const parts = path.split('.');
    let target: any = entity;

    for (let i = 0; i < parts.length - 1; i++) {
      target = target[parts[i]];
      if (!target) return false;
    }

    // Set value
    const lastKey = parts[parts.length - 1];
    target[lastKey] = value;

    console.log('[SceneInspector] Updated', id, path, '=', value);

    // TODO: Apply change to runtime (would need executor reference)

    return true;
  }

  /**
   * Get scene statistics
   */
  public getStatistics(): SceneStatistics {
    const rendererStats = this.renderer?.getStatistics();

    // Calculate FPS stats from history
    const recentFrames = this.performanceHistory.slice(-60);
    const fpsList = recentFrames.map((f) => f.fps).filter((fps) => fps > 0);

    const averageFPS = fpsList.length > 0 ? fpsList.reduce((a, b) => a + b, 0) / fpsList.length : 0;
    const minFPS = fpsList.length > 0 ? Math.min(...fpsList) : 0;
    const maxFPS = fpsList.length > 0 ? Math.max(...fpsList) : 0;

    return {
      totalEntities: this.entities.size,
      activeEntities: Array.from(this.entities.values()).filter((e) => e.active).length,
      visibleEntities: Array.from(this.entities.values()).filter((e) => e.visible).length,
      totalVertices: 0, // Would come from renderer
      totalTriangles: rendererStats?.triangles || 0,
      drawCalls: rendererStats?.drawCalls || 0,
      textureMemory: (rendererStats?.memoryUsage?.textures || 0) / (1024 * 1024),
      geometryMemory: (rendererStats?.memoryUsage?.geometries || 0) / (1024 * 1024),
      currentFPS: rendererStats?.fps || 0,
      averageFPS: Math.round(averageFPS),
      minFPS: Math.round(minFPS),
      maxFPS: Math.round(maxFPS),
    };
  }

  /**
   * Get performance history
   */
  public getPerformanceHistory(): PerformanceFrame[] {
    return this.performanceHistory;
  }

  /**
   * Toggle physics visualization
   */
  public togglePhysicsVisualization(type: keyof PhysicsVisualization): void {
    this.physicsVisualization[type] = !this.physicsVisualization[type];
    console.log(
      '[SceneInspector] Physics visualization:',
      type,
      '=',
      this.physicsVisualization[type]
    );
  }

  /**
   * Get physics visualization settings
   */
  public getPhysicsVisualization(): PhysicsVisualization {
    return { ...this.physicsVisualization };
  }

  /**
   * Generate HTML for inspector UI
   */
  public generateInspectorHTML(): string {
    const stats = this.getStatistics();
    const selectedEntity = this.getSelectedEntity();

    return `
      <div class="scene-inspector" style="position: absolute; top: 0; right: 0; width: 400px; height: 100vh; background: rgba(0, 0, 0, 0.9); color: #fff; font-family: monospace; font-size: 12px; overflow-y: auto; z-index: 1000;">

        <!-- Header -->
        <div style="padding: 15px; border-bottom: 2px solid #4ecdc4; background: #1a1a2e;">
          <h2 style="margin: 0; color: #4ecdc4;">🔍 Scene Inspector</h2>
          <div style="color: #aaa; margin-top: 5px;">Frame: ${this.currentFrame}</div>
        </div>

        <!-- Statistics Panel -->
        ${
          this.config.showStatistics
            ? `
        <div style="padding: 15px; border-bottom: 1px solid #333;">
          <h3 style="margin: 0 0 10px 0; color: #ffd93d;">📊 Statistics</h3>
          <div style="line-height: 1.6;">
            <div>Entities: ${stats.totalEntities} (${stats.activeEntities} active)</div>
            <div>FPS: ${stats.currentFPS} (avg: ${stats.averageFPS}, min: ${stats.minFPS})</div>
            <div>Draw Calls: ${stats.drawCalls}</div>
            <div>Triangles: ${stats.totalTriangles.toLocaleString()}</div>
            <div>Memory: ${(stats.textureMemory + stats.geometryMemory).toFixed(1)} MB</div>
          </div>
        </div>
        `
            : ''
        }

        <!-- Hierarchy Panel -->
        ${
          this.config.showHierarchy
            ? `
        <div style="padding: 15px; border-bottom: 1px solid #333;">
          <h3 style="margin: 0 0 10px 0; color: #95e1d3;">🌳 Hierarchy</h3>
          <div style="max-height: 300px; overflow-y: auto;">
            ${this.getEntityHierarchy()
              .map(
                (entity) => `
              <div
                data-entity-id="${entity.id}"
                style="padding: 5px; margin: 2px 0; background: ${this.selectedEntityId === entity.id ? '#4ecdc4' : '#2a2a3e'}; cursor: pointer; border-radius: 4px;"
                onclick="window.inspectorSelectEntity('${entity.id}')"
              >
                <div style="font-weight: bold;">${entity.name}</div>
                <div style="color: #aaa; font-size: 10px;">${entity.type} · ${entity.traits.join(', ')}</div>
              </div>
            `
              )
              .join('')}
          </div>
        </div>
        `
            : ''
        }

        <!-- Properties Panel -->
        ${
          this.config.showProperties && selectedEntity
            ? `
        <div style="padding: 15px; border-bottom: 1px solid #333;">
          <h3 style="margin: 0 0 10px 0; color: #ff6b6b;">⚙️ Properties</h3>
          <div style="line-height: 1.8;">
            <div style="color: #4ecdc4; margin-bottom: 10px; font-size: 14px; font-weight: bold;">${selectedEntity.name}</div>

            <div style="margin: 10px 0;">
              <div style="color: #ffd93d;">Transform:</div>
              <div style="margin-left: 10px;">
                <div>Position: ${selectedEntity.transform.position.map((v) => v.toFixed(2)).join(', ')}</div>
                <div>Rotation: ${selectedEntity.transform.rotation.map((v) => v.toFixed(2)).join(', ')}</div>
                <div>Scale: ${selectedEntity.transform.scale.map((v) => v.toFixed(2)).join(', ')}</div>
              </div>
            </div>

            <div style="margin: 10px 0;">
              <div style="color: #ffd93d;">Traits:</div>
              <div style="margin-left: 10px;">${selectedEntity.traits.join(', ') || 'None'}</div>
            </div>

            <div style="margin: 10px 0;">
              <div style="color: #ffd93d;">Properties:</div>
              <div style="margin-left: 10px;">
                ${Object.entries(selectedEntity.properties)
                  .map(
                    ([key, value]) => `
                  <div>${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}</div>
                `
                  )
                  .join('')}
              </div>
            </div>
          </div>
        </div>
        `
            : ''
        }

        <!-- Performance Graph -->
        ${
          this.config.showPerformance
            ? `
        <div style="padding: 15px;">
          <h3 style="margin: 0 0 10px 0; color: #95e1d3;">⚡ Performance</h3>
          <canvas id="performance-graph" width="370" height="100" style="background: #1a1a2e; border-radius: 4px;"></canvas>
        </div>
        `
            : ''
        }

      </div>

      <script>
        // Entity selection handler
        window.inspectorSelectEntity = function(entityId) {
          console.log('Selected entity:', entityId);
          // Would call inspector.selectEntity(entityId) and refresh UI
        };

        // Render performance graph
        ${
          this.config.showPerformance
            ? `
        (function() {
          const canvas = document.getElementById('performance-graph');
          if (!canvas) return;

          const ctx = canvas.getContext('2d');
          const history = ${JSON.stringify(this.performanceHistory.slice(-60))};

          // Clear canvas
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // Draw graph
          const maxFPS = 60;
          const width = canvas.width;
          const height = canvas.height;

          ctx.strokeStyle = '#4ecdc4';
          ctx.lineWidth = 2;
          ctx.beginPath();

          history.forEach((frame, i) => {
            const x = (i / history.length) * width;
            const y = height - (frame.fps / maxFPS) * height;

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          });

          ctx.stroke();

          // Draw 60 FPS line
          ctx.strokeStyle = '#ffd93d';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(width, 0);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw labels
          ctx.fillStyle = '#fff';
          ctx.font = '10px monospace';
          ctx.fillText('60 FPS', 5, 10);
          ctx.fillText('0 FPS', 5, height - 5);
        })();
        `
            : ''
        }
      </script>
    `;
  }

  /**
   * Enable/disable inspector
   */
  public setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  /**
   * Get configuration
   */
  public getConfig(): InspectorConfig {
    return { ...this.config };
  }
}
