/**
 * WorkspaceManager — HoloScript monorepo workspace management
 *
 * Manages `holoscript.workspace.json` configuration, resolves composition
 * imports across workspace members, and provides build ordering via
 * dependency graph.
 *
 * Part of HoloScript v5.9 "Developer Portal".
 *
 * @version 1.0.0
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve, relative, dirname } from 'path';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Workspace configuration file format (holoscript.workspace.json).
 */
export interface WorkspaceConfig {
  /** Workspace name */
  name: string;
  /** Workspace version */
  version: string;
  /** Member packages (glob patterns or paths) */
  members: string[];
  /** Shared settings */
  settings?: {
    /** Default compiler target */
    defaultTarget?: string;
    /** Shared trait imports */
    sharedTraits?: string[];
    /** Environment variables */
    env?: Record<string, string>;
  };
}

/**
 * A resolved workspace member.
 */
export interface WorkspaceMember {
  /** Member name */
  name: string;
  /** Absolute path to member root */
  path: string;
  /** Relative path from workspace root */
  relativePath: string;
  /** Composition files found */
  compositions: string[];
  /** Dependencies on other members */
  dependencies: string[];
  /** Whether this member has a package.json */
  hasPackageJson: boolean;
}

/**
 * Build order result.
 */
export interface BuildOrder {
  /** Ordered groups — members in each group can be built in parallel */
  groups: string[][];
  /** Total members */
  total: number;
  /** Whether there are circular dependencies */
  hasCycles: boolean;
  /** Cycle details if any */
  cycles?: string[][];
}

/**
 * Import resolution result.
 */
export interface ImportResolution {
  /** The resolved absolute file path */
  resolvedPath: string;
  /** The member this import belongs to */
  memberName: string;
  /** Whether the import was found */
  found: boolean;
}

// =============================================================================
// WORKSPACE MANAGER
// =============================================================================

export class WorkspaceManager {
  private root: string;
  private config: WorkspaceConfig | null = null;
  private members: Map<string, WorkspaceMember> = new Map();

  constructor(root?: string) {
    this.root = root ?? process.cwd();
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize a new workspace configuration.
   */
  init(name: string, members: string[] = ['packages/*']): WorkspaceConfig {
    const config: WorkspaceConfig = {
      name,
      version: '1.0.0',
      members,
      settings: {
        defaultTarget: 'r3f',
        sharedTraits: [],
      },
    };

    const configPath = join(this.root, 'holoscript.workspace.json');
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    this.config = config;
    this.resolveMembers();

    return config;
  }

  /**
   * Load an existing workspace configuration.
   */
  load(): WorkspaceConfig | null {
    const configPath = join(this.root, 'holoscript.workspace.json');
    if (!existsSync(configPath)) {
      return null;
    }

    try {
      const raw = readFileSync(configPath, 'utf-8');
      this.config = JSON.parse(raw) as WorkspaceConfig;
      this.resolveMembers();
      return this.config;
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // MEMBER RESOLUTION
  // ===========================================================================

  private resolveMembers(): void {
    this.members.clear();
    if (!this.config) return;

    for (const pattern of this.config.members) {
      // Simple glob: "packages/*" → list directories in packages/
      if (pattern.endsWith('/*')) {
        const baseDir = join(this.root, pattern.slice(0, -2));
        if (existsSync(baseDir) && statSync(baseDir).isDirectory()) {
          const entries = readdirSync(baseDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory() && !entry.name.startsWith('.')) {
              this.addMember(join(baseDir, entry.name));
            }
          }
        }
      } else {
        // Direct path
        const memberPath = resolve(this.root, pattern);
        if (existsSync(memberPath) && statSync(memberPath).isDirectory()) {
          this.addMember(memberPath);
        }
      }
    }
  }

  private addMember(memberPath: string): void {
    const name = this.getMemberName(memberPath);
    const compositions = this.findCompositions(memberPath);
    const dependencies = this.findDependencies(memberPath, compositions);
    const hasPackageJson = existsSync(join(memberPath, 'package.json'));

    this.members.set(name, {
      name,
      path: memberPath,
      relativePath: relative(this.root, memberPath),
      compositions,
      dependencies,
      hasPackageJson,
    });
  }

  private getMemberName(memberPath: string): string {
    const pkgPath = join(memberPath, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (pkg.name) return pkg.name;
      } catch {
        // Fall through to directory name
      }
    }
    return memberPath.split(/[/\\]/).pop() || 'unknown';
  }

  private findCompositions(dir: string, maxDepth = 3): string[] {
    const results: string[] = [];
    this.walkDir(dir, maxDepth, (filePath) => {
      const ext = filePath.split('.').pop();
      if (ext === 'holo' || ext === 'hs' || ext === 'hsplus') {
        results.push(filePath);
      }
    });
    return results;
  }

  private findDependencies(memberPath: string, compositions: string[]): string[] {
    const deps = new Set<string>();

    for (const comp of compositions) {
      try {
        const code = readFileSync(comp, 'utf-8');
        // Match import patterns: import "member-name/file" or use "member-name:trait"
        const importRegex = /import\s+["']([^"']+)["']/g;
        let match;
        while ((match = importRegex.exec(code)) !== null) {
          const importPath = match[1];
          // If it starts with a member name (not relative path)
          if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
            const memberRef = importPath.split('/')[0];
            if (memberRef !== this.getMemberName(memberPath)) {
              deps.add(memberRef);
            }
          }
        }
      } catch {
        // Skip unreadable files
      }
    }

    return [...deps];
  }

  private walkDir(dir: string, depth: number, callback: (path: string) => void): void {
    if (depth <= 0) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(dir, entry.name);
        if (entry.isFile()) {
          callback(fullPath);
        } else if (
          entry.isDirectory() &&
          !entry.name.startsWith('.') &&
          entry.name !== 'node_modules'
        ) {
          this.walkDir(fullPath, depth - 1, callback);
        }
      }
    } catch {
      // Skip
    }
  }

  // ===========================================================================
  // BUILD ORDER
  // ===========================================================================

  /**
   * Compute build order based on dependency graph.
   * Returns parallel groups — each group can be built concurrently.
   */
  getBuildOrder(): BuildOrder {
    const inDegree = new Map<string, number>();
    const adj = new Map<string, string[]>();

    for (const [name] of this.members) {
      inDegree.set(name, 0);
      adj.set(name, []);
    }

    for (const [name, member] of this.members) {
      for (const dep of member.dependencies) {
        if (this.members.has(dep)) {
          adj.get(dep)!.push(name);
          inDegree.set(name, (inDegree.get(name) || 0) + 1);
        }
      }
    }

    // Kahn's algorithm with parallel grouping
    const groups: string[][] = [];
    const processed = new Set<string>();
    const remaining = new Map(inDegree);

    while (processed.size < this.members.size) {
      const group = [...remaining.entries()].filter(([, deg]) => deg === 0).map(([name]) => name);

      if (group.length === 0) {
        // Cycle detected
        const cycles = this.detectCycles();
        return {
          groups,
          total: this.members.size,
          hasCycles: true,
          cycles,
        };
      }

      groups.push(group);

      for (const name of group) {
        processed.add(name);
        remaining.delete(name);
        for (const dependent of adj.get(name) || []) {
          if (remaining.has(dependent)) {
            remaining.set(dependent, remaining.get(dependent)! - 1);
          }
        }
      }
    }

    return {
      groups,
      total: this.members.size,
      hasCycles: false,
    };
  }

  private detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();

    const dfs = (name: string, path: string[]): void => {
      if (stack.has(name)) {
        const cycleStart = path.indexOf(name);
        if (cycleStart >= 0) {
          cycles.push(path.slice(cycleStart).concat(name));
        }
        return;
      }
      if (visited.has(name)) return;

      visited.add(name);
      stack.add(name);

      const member = this.members.get(name);
      if (member) {
        for (const dep of member.dependencies) {
          if (this.members.has(dep)) {
            dfs(dep, [...path, name]);
          }
        }
      }

      stack.delete(name);
    };

    for (const [name] of this.members) {
      dfs(name, []);
    }

    return cycles;
  }

  // ===========================================================================
  // IMPORT RESOLUTION
  // ===========================================================================

  /**
   * Resolve a composition import path.
   */
  resolveImport(importPath: string, fromFile: string): ImportResolution {
    // Relative import
    if (importPath.startsWith('.')) {
      const dir = dirname(fromFile);
      const resolved = resolve(dir, importPath);
      const candidates = [resolved, `${resolved}.holo`, `${resolved}.hs`];

      for (const candidate of candidates) {
        if (existsSync(candidate)) {
          const memberName = this.findMemberForFile(candidate);
          return { resolvedPath: candidate, memberName: memberName || '', found: true };
        }
      }

      return { resolvedPath: resolved, memberName: '', found: false };
    }

    // Member-based import: "member-name/path/to/file"
    const parts = importPath.split('/');
    const memberName = parts[0];
    const member = this.members.get(memberName);

    if (!member) {
      return { resolvedPath: '', memberName, found: false };
    }

    const subPath = parts.slice(1).join('/');
    const candidates = [
      join(member.path, subPath),
      join(member.path, `${subPath}.holo`),
      join(member.path, `${subPath}.hs`),
      join(member.path, 'src', subPath),
      join(member.path, 'src', `${subPath}.holo`),
    ];

    for (const candidate of candidates) {
      if (existsSync(candidate)) {
        return { resolvedPath: candidate, memberName, found: true };
      }
    }

    return { resolvedPath: '', memberName, found: false };
  }

  private findMemberForFile(filePath: string): string | undefined {
    for (const [name, member] of this.members) {
      if (filePath.startsWith(member.path)) {
        return name;
      }
    }
    return undefined;
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Get all workspace members.
   */
  getMembers(): WorkspaceMember[] {
    return [...this.members.values()];
  }

  /**
   * Get a member by name.
   */
  getMember(name: string): WorkspaceMember | undefined {
    return this.members.get(name);
  }

  /**
   * Get workspace configuration.
   */
  getConfig(): WorkspaceConfig | null {
    return this.config;
  }

  /**
   * Get workspace root path.
   */
  getRoot(): string {
    return this.root;
  }

  /**
   * Get workspace info summary.
   */
  getInfo(): {
    name: string;
    version: string;
    root: string;
    memberCount: number;
    totalCompositions: number;
    members: Array<{ name: string; path: string; compositions: number; dependencies: string[] }>;
  } {
    const config = this.config || { name: 'unnamed', version: '0.0.0' };
    let totalComps = 0;
    const memberInfo = [...this.members.values()].map((m) => {
      totalComps += m.compositions.length;
      return {
        name: m.name,
        path: m.relativePath,
        compositions: m.compositions.length,
        dependencies: m.dependencies,
      };
    });

    return {
      name: config.name,
      version: config.version,
      root: this.root,
      memberCount: this.members.size,
      totalCompositions: totalComps,
      members: memberInfo,
    };
  }
}
