/**
 * ImportResolver.ts
 *
 * Module resolution system for HoloScript.
 * Resolves import paths to file locations, supporting:
 * - Relative imports: import { Vec3 } from "./math"
 * - Package imports: import { Vec3 } from "@holoscript/std"
 * - Bare imports: import { TreeTemplate } from "forest-pack"
 *
 * @version 4.2.0
 */

export interface ResolvedModule {
  /** Absolute path to the resolved file */
  path: string;
  /** Module format: .holo, .hsplus, .hs, .ts, .js */
  format: string;
  /** Whether this is a package import */
  isPackage: boolean;
  /** Package name if applicable */
  packageName?: string;
  /** Exported symbols (if known from type declarations) */
  exports?: string[];
}

export interface ImportResolverOptions {
  /** Root directory for relative imports */
  rootDir: string;
  /** Additional search paths for bare imports */
  modulePaths?: string[];
  /** Package map overrides (package name → path) */
  packageMap?: Record<string, string>;
}

// Built-in package registry
const BUILTIN_PACKAGES: Record<string, { path: string; exports: string[] }> = {
  '@holoscript/std': {
    path: '@holoscript/std',
    exports: [
      // Types
      'Vec2',
      'Vec3',
      'Vec4',
      'Quat',
      'Mat4',
      'Color',
      'Range',
      // Math
      'PI',
      'TAU',
      'EPSILON',
      'clamp',
      'lerp',
      'smoothstep',
      'degToRad',
      'radToDeg',
      // Spatial (v4.2)
      'Vec3',
      'Quaternion',
      'Transform',
      'Ray',
      'AABB',
      'distance',
      // Physics (v4.2)
      'ColliderConfig',
      'RigidbodyConfig',
      'createBoxCollider',
      'createSphereCollider',
      'createCapsuleCollider',
      'createRigidbody',
      // Materials (v4.2)
      'PBRMaterial',
      'UnlitMaterial',
      'MATERIAL_PRESETS',
      'createPBRMaterial',
      // Events (v4.2)
      'EventBus',
      'EventHandler',
      // Collections
      'List',
      'HoloMap',
      'HoloSet',
      'SpatialGrid',
      'PriorityQueue',
      // String
      'capitalize',
      'camelCase',
      'slugify',
      // Time
      'now',
      'sleep',
      'Stopwatch',
      'FrameTimer',
      'DateTime',
      // Utilities
      'print',
      'assert',
      'clone',
      'equals',
      'pipe',
      'compose',
    ],
  },
  '@holoscript/std/spatial': {
    path: '@holoscript/std/spatial',
    exports: [
      'Vec3',
      'Quaternion',
      'Transform',
      'Ray',
      'AABB',
      'distance',
      'lerp',
      'clamp',
      'degToRad',
      'radToDeg',
    ],
  },
  '@holoscript/std/physics': {
    path: '@holoscript/std/physics',
    exports: [
      'ColliderConfig',
      'RigidbodyConfig',
      'ForceFieldConfig',
      'JointConfig',
      'createBoxCollider',
      'createSphereCollider',
      'createRigidbody',
    ],
  },
  '@holoscript/std/materials': {
    path: '@holoscript/std/materials',
    exports: [
      'PBRMaterial',
      'UnlitMaterial',
      'MATERIAL_PRESETS',
      'createPBRMaterial',
      'TextureMapType',
    ],
  },
  '@holoscript/std/events': {
    path: '@holoscript/std/events',
    exports: ['EventBus', 'EventHandler'],
  },
};

// Supported file extensions in resolution order
const EXTENSIONS = ['.hsplus', '.holo', '.hs', '.ts', '.js'];

export class ImportResolver {
  private rootDir: string;
  private modulePaths: string[];
  private packageMap: Record<string, string>;
  private cache: Map<string, ResolvedModule | null> = new Map();

  constructor(options: ImportResolverOptions) {
    this.rootDir = options.rootDir;
    this.modulePaths = options.modulePaths || [];
    this.packageMap = options.packageMap || {};
  }

  /**
   * Resolve an import specifier to a module location.
   *
   * @param specifier - The import path (e.g. "./math", "@holoscript/std")
   * @param fromFile - The file containing the import statement
   * @returns Resolved module info, or null if not found
   */
  resolve(specifier: string, fromFile: string): ResolvedModule | null {
    const cacheKey = `${fromFile}::${specifier}`;
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey) || null;

    let result: ResolvedModule | null = null;

    // 1. Check built-in packages
    if (BUILTIN_PACKAGES[specifier]) {
      const pkg = BUILTIN_PACKAGES[specifier];
      result = {
        path: pkg.path,
        format: '.ts',
        isPackage: true,
        packageName: specifier,
        exports: pkg.exports,
      };
    }

    // 2. Check package map overrides
    else if (this.packageMap[specifier]) {
      result = {
        path: this.packageMap[specifier],
        format: this.getExtension(this.packageMap[specifier]),
        isPackage: true,
        packageName: specifier,
      };
    }

    // 3. Check if scoped package (@scope/name)
    else if (specifier.startsWith('@')) {
      // Unknown scoped package — mark as external
      result = {
        path: specifier,
        format: '.ts',
        isPackage: true,
        packageName: specifier,
      };
    }

    // 4. Relative import
    else if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const resolved = this.resolveRelative(specifier, fromFile);
      if (resolved) result = resolved;
    }

    // 5. Bare import — search module paths
    else {
      for (const searchPath of [this.rootDir, ...this.modulePaths]) {
        const resolved = this.resolveRelative(`./${specifier}`, searchPath + '/index.ts');
        if (resolved) {
          result = resolved;
          break;
        }
      }
    }

    this.cache.set(cacheKey, result);
    return result;
  }

  /** Get all known package names */
  getKnownPackages(): string[] {
    return [...Object.keys(BUILTIN_PACKAGES), ...Object.keys(this.packageMap)];
  }

  /** Get exports for a specific package */
  getPackageExports(packageName: string): string[] {
    return BUILTIN_PACKAGES[packageName]?.exports || [];
  }

  /** Clear resolution cache */
  clearCache(): void {
    this.cache.clear();
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private resolveRelative(specifier: string, fromFile: string): ResolvedModule | null {
    // In a real implementation, this would use fs.existsSync etc.
    // For now, return a synthetic result
    const basePath = fromFile.replace(/[/\\][^/\\]+$/, '');
    const cleanSpec = specifier.replace(/^\.\//, '');

    for (const ext of EXTENSIONS) {
      const candidatePath = `${basePath}/${cleanSpec}${ext}`;
      return {
        path: candidatePath,
        format: ext,
        isPackage: false,
      };
    }
    return null;
  }

  private getExtension(path: string): string {
    const match = path.match(/\.\w+$/);
    return match ? match[0] : '.ts';
  }
}
