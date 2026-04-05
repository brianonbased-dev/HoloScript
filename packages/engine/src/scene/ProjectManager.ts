/**
 * ProjectManager.ts
 *
 * Project-level management: project files, scene references,
 * asset dependency tracking, and build configuration.
 *
 * @module scene
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SceneReference {
  id: string;
  name: string;
  path: string;
  isStartScene: boolean;
  lastModified: number;
}

export interface ProjectAssetRef {
  id: string;
  type: string;
  path: string;
  usedByScenes: string[];
  sizeBytes: number;
}

export interface BuildConfig {
  target: 'development' | 'production' | 'debug';
  optimizeAssets: boolean;
  minifyScripts: boolean;
  bundleAssets: boolean;
  outputDir: string;
}

export interface ProjectFile {
  name: string;
  version: string;
  createdAt: number;
  modifiedAt: number;
  scenes: SceneReference[];
  assets: ProjectAssetRef[];
  buildConfig: BuildConfig;
  settings: Record<string, unknown>;
}

// =============================================================================
// PROJECT MANAGER
// =============================================================================

export class ProjectManager {
  private project: ProjectFile;

  constructor(name: string, version: string = '1.0.0') {
    this.project = {
      name,
      version,
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      scenes: [],
      assets: [],
      buildConfig: {
        target: 'development',
        optimizeAssets: false,
        minifyScripts: false,
        bundleAssets: false,
        outputDir: './dist',
      },
      settings: {},
    };
  }

  // ---------------------------------------------------------------------------
  // Scene Management
  // ---------------------------------------------------------------------------

  addScene(ref: Omit<SceneReference, 'lastModified'>): void {
    this.project.scenes.push({ ...ref, lastModified: Date.now() });
    this.project.modifiedAt = Date.now();
  }

  removeScene(sceneId: string): boolean {
    const idx = this.project.scenes.findIndex((s) => s.id === sceneId);
    if (idx < 0) return false;
    this.project.scenes.splice(idx, 1);
    // Remove scene from asset references
    for (const asset of this.project.assets) {
      asset.usedByScenes = asset.usedByScenes.filter((id) => id !== sceneId);
    }
    this.project.modifiedAt = Date.now();
    return true;
  }

  getScene(sceneId: string): SceneReference | undefined {
    return this.project.scenes.find((s) => s.id === sceneId);
  }

  getScenes(): SceneReference[] {
    return [...this.project.scenes];
  }

  getStartScene(): SceneReference | undefined {
    return this.project.scenes.find((s) => s.isStartScene);
  }

  setStartScene(sceneId: string): boolean {
    for (const s of this.project.scenes) {
      s.isStartScene = s.id === sceneId;
    }
    return this.project.scenes.some((s) => s.id === sceneId);
  }

  // ---------------------------------------------------------------------------
  // Asset Management
  // ---------------------------------------------------------------------------

  addAsset(ref: ProjectAssetRef): void {
    this.project.assets.push(ref);
    this.project.modifiedAt = Date.now();
  }

  removeAsset(assetId: string): boolean {
    const idx = this.project.assets.findIndex((a) => a.id === assetId);
    if (idx < 0) return false;
    this.project.assets.splice(idx, 1);
    this.project.modifiedAt = Date.now();
    return true;
  }

  getAsset(assetId: string): ProjectAssetRef | undefined {
    return this.project.assets.find((a) => a.id === assetId);
  }

  getAssets(): ProjectAssetRef[] {
    return [...this.project.assets];
  }

  /**
   * Find unused assets (not referenced by any scene).
   */
  findUnusedAssets(): ProjectAssetRef[] {
    return this.project.assets.filter((a) => a.usedByScenes.length === 0);
  }

  /**
   * Get total project size in bytes.
   */
  getTotalAssetSize(): number {
    return this.project.assets.reduce((sum, a) => sum + a.sizeBytes, 0);
  }

  // ---------------------------------------------------------------------------
  // Build Config
  // ---------------------------------------------------------------------------

  setBuildConfig(config: Partial<BuildConfig>): void {
    Object.assign(this.project.buildConfig, config);
    this.project.modifiedAt = Date.now();
  }

  getBuildConfig(): BuildConfig {
    return { ...this.project.buildConfig };
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  setSetting(key: string, value: unknown): void {
    this.project.settings[key] = value;
    this.project.modifiedAt = Date.now();
  }

  getSetting<T = unknown>(key: string): T | undefined {
    return this.project.settings[key] as T;
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  serialize(): string {
    return JSON.stringify(this.project, null, 2);
  }

  static deserialize(json: string): ProjectManager {
    const data = JSON.parse(json) as ProjectFile;
    const pm = new ProjectManager(data.name, data.version);
    pm.project = data;
    return pm;
  }

  getProjectFile(): ProjectFile {
    return { ...this.project };
  }
}

