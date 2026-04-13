/**
 * Package Registry
 *
 * Sprint 5 Priority 5: Package Registry MVP
 * Sprint 6 Priority 2: Private Packages & Access Control
 *
 * Provides package management for HoloScript:
 * - Package manifest (package.holo.json)
 * - Registry client for browsing/searching
 * - Dependency resolution
 * - Version management (semver)
 * - Organization-scoped private packages
 * - Access control (read/write/admin permissions)
 * - Token-based authentication
 *
 * @version 2.0.0
 */

/**
 * Semantic version
 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
  build?: string;
}

/**
 * Package dependency
 */
export interface PackageDependency {
  name: string;
  version: string; // Semver range like "^1.0.0", "~2.1", ">=3.0.0"
  optional?: boolean;
  dev?: boolean;
}

/**
 * Package manifest (package.holo.json)
 */
export interface PackageManifest {
  /** Package name (scoped: @scope/name or unscoped) */
  name: string;
  /** Semantic version */
  version: string;
  /** Short description */
  description?: string;
  /** Package keywords for search */
  keywords?: string[];
  /** Author information */
  author?: string | { name: string; email?: string; url?: string };
  /** License identifier (SPDX) */
  license?: string;
  /** Repository URL */
  repository?: string | { type: string; url: string };
  /** Homepage URL */
  homepage?: string;
  /** Bug tracker URL */
  bugs?: string | { url?: string; email?: string };
  /** Main entry point */
  main?: string;
  /** Export map */
  exports?: Record<string, string>;
  /** Dependencies */
  dependencies?: Record<string, string>;
  /** Dev dependencies */
  devDependencies?: Record<string, string>;
  /** Peer dependencies */
  peerDependencies?: Record<string, string>;
  /** HoloScript engine version requirement */
  engines?: {
    holoscript?: string;
    node?: string;
  };
  /** Package type */
  type?: 'library' | 'application' | 'template' | 'trait-pack';
  /** Trait definitions this package provides */
  traits?: string[];
  /** Template definitions this package provides */
  templates?: string[];
  /** Custom metadata */
  holoscript?: {
    minVersion?: string;
    maxVersion?: string;
    platforms?: ('web' | 'vr' | 'ar' | 'mobile')[];
  };
}

/**
 * Package metadata from registry
 */
export interface PackageMetadata extends PackageManifest {
  /** Creation timestamp */
  created: string;
  /** Last modified timestamp */
  modified: string;
  /** All published versions */
  versions: string[];
  /** Download count */
  downloads?: number;
  /** Stars/likes count */
  stars?: number;
  /** Maintainers */
  maintainers?: Array<{ name: string; email?: string }>;
  /** Dist tags (latest, next, etc.) */
  distTags?: Record<string, string>;
  /** Package visibility (public/private) */
  visibility?: PackageVisibility;
  /** Access control list */
  access?: PackageAccess[];
  /** Owner organization for scoped packages */
  organization?: string;
}

/**
 * Search result item
 */
export interface SearchResult {
  name: string;
  version: string;
  description?: string;
  keywords?: string[];
  author?: string;
  modified: string;
  downloads?: number;
  score?: number;
}

// ============================================================================
// Access Control Types (Sprint 6)
// ============================================================================

/**
 * Permission level for package access
 */
export type PackagePermission = 'read' | 'write' | 'admin';

/**
 * Organization membership role
 */
export type OrgRole = 'owner' | 'admin' | 'member';

/**
 * Package visibility
 */
export type PackageVisibility = 'public' | 'private';

/**
 * Organization definition
 */
export interface Organization {
  /** Organization name (without @) */
  name: string;
  /** Display name */
  displayName?: string;
  /** Creation timestamp */
  created: string;
  /** Organization members */
  members: Array<{ userId: string; role: OrgRole }>;
}

/**
 * Access control entry for a package
 */
export interface PackageAccess {
  /** User or organization ID */
  principalId: string;
  /** Whether this is a user or org */
  principalType: 'user' | 'org';
  /** Permission level */
  permission: PackagePermission;
}

/**
 * Authentication token
 */
export interface AuthToken {
  /** Token ID */
  id: string;
  /** Hashed token value */
  tokenHash: string;
  /** User who owns this token */
  userId: string;
  /** Token name/label */
  name: string;
  /** Read-only token */
  readonly: boolean;
  /** Scopes this token can access */
  scopes?: string[];
  /** Creation timestamp */
  created: string;
  /** Expiration timestamp */
  expires?: string;
  /** Last used timestamp */
  lastUsed?: string;
}

/**
 * Resolved dependency tree node
 */
export interface ResolvedDependency {
  name: string;
  version: string;
  resolved: string; // Actual resolved version
  dependencies: ResolvedDependency[];
  dev: boolean;
  optional: boolean;
}

/**
 * Installation result
 */
export interface InstallResult {
  installed: Array<{ name: string; version: string }>;
  updated: Array<{ name: string; from: string; to: string }>;
  removed: string[];
  warnings: string[];
  errors: string[];
}

/**
 * Parse semver string
 */
export function parseSemVer(version: string): SemVer | null {
  const match = version.match(
    /^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?(?:\+([a-zA-Z0-9.-]+))?$/
  );
  if (!match) return null;

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4],
    build: match[5],
  };
}

/**
 * Format semver to string
 */
export function formatSemVer(ver: SemVer): string {
  let str = `${ver.major}.${ver.minor}.${ver.patch}`;
  if (ver.prerelease) str += `-${ver.prerelease}`;
  if (ver.build) str += `+${ver.build}`;
  return str;
}

/**
 * Compare two semver versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareSemVer(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;

  // Prerelease versions have lower precedence
  if (a.prerelease && !b.prerelease) return -1;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && b.prerelease) {
    return a.prerelease.localeCompare(b.prerelease);
  }

  return 0;
}

/**
 * Check if version satisfies range
 */
export function satisfiesRange(version: string, range: string): boolean {
  const ver = parseSemVer(version);
  if (!ver) return false;

  // Handle wildcard (must be checked first)
  if (range === '*' || range === 'latest') {
    return true;
  }

  // Handle exact version
  if (
    !range.includes('^') &&
    !range.includes('~') &&
    !range.includes('>') &&
    !range.includes('<')
  ) {
    const rangeVer = parseSemVer(range);
    return rangeVer !== null && compareSemVer(ver, rangeVer) === 0;
  }

  // Handle caret range (^1.2.3 -> >=1.2.3 <2.0.0)
  if (range.startsWith('^')) {
    const rangeVer = parseSemVer(range.slice(1));
    if (!rangeVer) return false;

    if (ver.major !== rangeVer.major) return false;
    if (ver.minor < rangeVer.minor) return false;
    if (ver.minor === rangeVer.minor && ver.patch < rangeVer.patch) return false;
    return true;
  }

  // Handle tilde range (~1.2.3 -> >=1.2.3 <1.3.0)
  if (range.startsWith('~')) {
    const rangeVer = parseSemVer(range.slice(1));
    if (!rangeVer) return false;

    if (ver.major !== rangeVer.major) return false;
    if (ver.minor !== rangeVer.minor) return false;
    if (ver.patch < rangeVer.patch) return false;
    return true;
  }

  // Handle >= range
  if (range.startsWith('>=')) {
    const rangeVer = parseSemVer(range.slice(2));
    if (!rangeVer) return false;
    return compareSemVer(ver, rangeVer) >= 0;
  }

  // Handle > range
  if (range.startsWith('>')) {
    const rangeVer = parseSemVer(range.slice(1));
    if (!rangeVer) return false;
    return compareSemVer(ver, rangeVer) > 0;
  }

  // Handle <= range
  if (range.startsWith('<=')) {
    const rangeVer = parseSemVer(range.slice(2));
    if (!rangeVer) return false;
    return compareSemVer(ver, rangeVer) <= 0;
  }

  // Handle < range
  if (range.startsWith('<')) {
    const rangeVer = parseSemVer(range.slice(1));
    if (!rangeVer) return false;
    return compareSemVer(ver, rangeVer) < 0;
  }

  return false;
}

/**
 * Find best matching version from available versions
 */
export function findBestMatch(versions: string[], range: string): string | null {
  const matching = versions
    .filter((v) => satisfiesRange(v, range))
    .map((v) => ({ version: v, parsed: parseSemVer(v)! }))
    .filter((v) => v.parsed !== null)
    .sort((a, b) => -compareSemVer(a.parsed, b.parsed));

  return matching.length > 0 ? matching[0].version : null;
}

/**
 * Validate package name
 */
export function validatePackageName(name: string): { valid: boolean; error?: string } {
  if (!name || name.length === 0) {
    return { valid: false, error: 'Package name cannot be empty' };
  }

  if (name.length > 214) {
    return { valid: false, error: 'Package name cannot exceed 214 characters' };
  }

  // Check for scoped package
  if (name.startsWith('@')) {
    const parts = name.split('/');
    if (parts.length !== 2) {
      return { valid: false, error: 'Scoped package must have format @scope/name' };
    }
  }

  // Check for invalid characters
  const validPattern = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
  if (!validPattern.test(name)) {
    return { valid: false, error: 'Package name contains invalid characters' };
  }

  return { valid: true };
}

/**
 * Validate package manifest
 */
export function validateManifest(manifest: Partial<PackageManifest>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Required fields
  if (!manifest.name) {
    errors.push('Missing required field: name');
  } else {
    const nameValidation = validatePackageName(manifest.name);
    if (!nameValidation.valid) {
      errors.push(nameValidation.error!);
    }
  }

  if (!manifest.version) {
    errors.push('Missing required field: version');
  } else {
    const ver = parseSemVer(manifest.version);
    if (!ver) {
      errors.push(`Invalid version format: ${manifest.version}`);
    }
  }

  // Validate dependencies
  if (manifest.dependencies) {
    for (const [name, range] of Object.entries(manifest.dependencies)) {
      const nameVal = validatePackageName(name);
      if (!nameVal.valid) {
        errors.push(`Invalid dependency name: ${name}`);
      }
      // Basic range validation
      if (!range || typeof range !== 'string') {
        errors.push(`Invalid version range for dependency: ${name}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Package Registry Client (MVP - in-memory storage)
 */
export class PackageRegistry {
  private packages: Map<string, PackageMetadata> = new Map();
  private packageVersions: Map<string, Map<string, PackageManifest>> = new Map();

  constructor(private baseUrl = 'https://registry.holoscript.net') {}

  /**
   * Publish a package
   */
  async publish(manifest: PackageManifest): Promise<{ success: boolean; error?: string }> {
    const validation = validateManifest(manifest);
    if (!validation.valid) {
      return { success: false, error: validation.errors.join(', ') };
    }

    const existingMeta = this.packages.get(manifest.name);
    const existingVersions = this.packageVersions.get(manifest.name) || new Map();

    // Check if version already exists
    if (existingVersions.has(manifest.version)) {
      return { success: false, error: `Version ${manifest.version} already exists` };
    }

    // Store version
    existingVersions.set(manifest.version, manifest);
    this.packageVersions.set(manifest.name, existingVersions);

    // Update metadata
    const now = new Date().toISOString();
    const metadata: PackageMetadata = {
      ...manifest,
      created: existingMeta?.created || now,
      modified: now,
      versions: Array.from(existingVersions.keys()),
      downloads: existingMeta?.downloads || 0,
      stars: existingMeta?.stars || 0,
      distTags: {
        ...existingMeta?.distTags,
        latest: manifest.version,
      },
    };

    this.packages.set(manifest.name, metadata);

    return { success: true };
  }

  /**
   * Get package metadata
   */
  async getPackage(name: string): Promise<PackageMetadata | null> {
    return this.packages.get(name) || null;
  }

  /**
   * Get specific version
   */
  async getVersion(name: string, version: string): Promise<PackageManifest | null> {
    const versions = this.packageVersions.get(name);
    if (!versions) return null;

    // Handle dist tags
    if (version === 'latest') {
      const meta = this.packages.get(name);
      if (meta?.distTags?.latest) {
        version = meta.distTags.latest;
      }
    }

    return versions.get(version) || null;
  }

  /**
   * Search packages
   */
  async search(query: string, options: { limit?: number } = {}): Promise<SearchResult[]> {
    const limit = options.limit || 20;
    const queryLower = query.toLowerCase();
    const results: SearchResult[] = [];

    for (const [name, meta] of this.packages) {
      let score = 0;

      // Name match (highest priority)
      if (name.toLowerCase().includes(queryLower)) {
        score += 100;
        if (name.toLowerCase() === queryLower) {
          score += 50;
        }
      }

      // Description match
      if (meta.description?.toLowerCase().includes(queryLower)) {
        score += 30;
      }

      // Keyword match
      if (meta.keywords?.some((k) => k.toLowerCase().includes(queryLower))) {
        score += 20;
      }

      if (score > 0) {
        results.push({
          name: meta.name,
          version: meta.version,
          description: meta.description,
          keywords: meta.keywords,
          author: typeof meta.author === 'string' ? meta.author : meta.author?.name,
          modified: meta.modified,
          downloads: meta.downloads,
          score,
        });
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => (b.score || 0) - (a.score || 0));

    return results.slice(0, limit);
  }

  /**
   * List all packages
   */
  async list(options: { limit?: number; offset?: number } = {}): Promise<SearchResult[]> {
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    const results = Array.from(this.packages.values())
      .slice(offset, offset + limit)
      .map((meta) => ({
        name: meta.name,
        version: meta.version,
        description: meta.description,
        keywords: meta.keywords,
        author: typeof meta.author === 'string' ? meta.author : meta.author?.name,
        modified: meta.modified,
        downloads: meta.downloads,
      }));

    return results;
  }

  /**
   * Resolve dependencies for a package
   */
  async resolveDependencies(
    dependencies: Record<string, string>,
    _options: { includeDev?: boolean } = {}
  ): Promise<ResolvedDependency[]> {
    const resolved: ResolvedDependency[] = [];
    const visited = new Set<string>();

    const resolve = async (
      deps: Record<string, string>,
      isDev: boolean
    ): Promise<ResolvedDependency[]> => {
      const result: ResolvedDependency[] = [];

      for (const [name, range] of Object.entries(deps)) {
        const key = `${name}@${range}`;
        if (visited.has(key)) continue;
        visited.add(key);

        const meta = await this.getPackage(name);
        if (!meta) {
          continue; // Package not found
        }

        const bestVersion = findBestMatch(meta.versions, range);
        if (!bestVersion) {
          continue; // No matching version
        }

        const manifest = await this.getVersion(name, bestVersion);
        if (!manifest) continue;

        // Recursively resolve sub-dependencies
        const subDeps = manifest.dependencies ? await resolve(manifest.dependencies, false) : [];

        result.push({
          name,
          version: range,
          resolved: bestVersion,
          dependencies: subDeps,
          dev: isDev,
          optional: false,
        });
      }

      return result;
    };

    resolved.push(...(await resolve(dependencies, false)));

    return resolved;
  }

  /**
   * Create a new package manifest
   */
  createManifest(name: string, version = '1.0.0'): PackageManifest {
    return {
      name,
      version,
      description: '',
      keywords: [],
      license: 'MIT',
      type: 'library',
      dependencies: {},
      devDependencies: {},
    };
  }

  /**
   * Increment version
   */
  incrementVersion(version: string, type: 'major' | 'minor' | 'patch'): string {
    const ver = parseSemVer(version);
    if (!ver) return version;

    switch (type) {
      case 'major':
        ver.major++;
        ver.minor = 0;
        ver.patch = 0;
        break;
      case 'minor':
        ver.minor++;
        ver.patch = 0;
        break;
      case 'patch':
        ver.patch++;
        break;
    }

    ver.prerelease = undefined;
    return formatSemVer(ver);
  }

  /**
   * Get count of registered packages
   */
  getPackageCount(): number {
    return this.packages.size;
  }

  /**
   * Clear all packages (for testing)
   */
  clear(): void {
    this.packages.clear();
    this.packageVersions.clear();
    this.organizations.clear();
    this.tokens.clear();
  }

  // ============================================================================
  // Access Control (Sprint 6)
  // ============================================================================

  private organizations: Map<string, Organization> = new Map();
  private tokens: Map<string, AuthToken> = new Map();

  /**
   * Create an organization
   */
  async createOrganization(
    name: string,
    ownerId: string,
    displayName?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (this.organizations.has(name)) {
      return { success: false, error: `Organization @${name} already exists` };
    }

    const org: Organization = {
      name,
      displayName,
      created: new Date().toISOString(),
      members: [{ userId: ownerId, role: 'owner' }],
    };

    this.organizations.set(name, org);
    return { success: true };
  }

  /**
   * Get an organization
   */
  async getOrganization(name: string): Promise<Organization | null> {
    return this.organizations.get(name) || null;
  }

  /**
   * Add member to organization
   */
  async addOrgMember(
    orgName: string,
    userId: string,
    role: OrgRole,
    requesterId: string
  ): Promise<{ success: boolean; error?: string }> {
    const org = this.organizations.get(orgName);
    if (!org) {
      return { success: false, error: `Organization @${orgName} not found` };
    }

    // Check requester has admin/owner access
    const requester = org.members.find((m) => m.userId === requesterId);
    if (!requester || requester.role === 'member') {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Check if user already member
    const existingIdx = org.members.findIndex((m) => m.userId === userId);
    if (existingIdx >= 0) {
      org.members[existingIdx].role = role;
    } else {
      org.members.push({ userId, role });
    }

    return { success: true };
  }

  /**
   * Remove member from organization
   */
  async removeOrgMember(
    orgName: string,
    userId: string,
    requesterId: string
  ): Promise<{ success: boolean; error?: string }> {
    const org = this.organizations.get(orgName);
    if (!org) {
      return { success: false, error: `Organization @${orgName} not found` };
    }

    // Check requester has admin/owner access
    const requester = org.members.find((m) => m.userId === requesterId);
    if (!requester || requester.role === 'member') {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Cannot remove last owner
    const owners = org.members.filter((m) => m.role === 'owner');
    const targetMember = org.members.find((m) => m.userId === userId);
    if (targetMember?.role === 'owner' && owners.length <= 1) {
      return { success: false, error: 'Cannot remove the last owner' };
    }

    org.members = org.members.filter((m) => m.userId !== userId);
    return { success: true };
  }

  /**
   * Grant access to a package
   */
  async grantAccess(
    packageName: string,
    principalId: string,
    principalType: 'user' | 'org',
    permission: PackagePermission,
    requesterId: string
  ): Promise<{ success: boolean; error?: string }> {
    const pkg = this.packages.get(packageName);
    if (!pkg) {
      return { success: false, error: `Package ${packageName} not found` };
    }

    // Check requester has admin access
    if (!this.hasPermission(pkg, requesterId, 'admin')) {
      return { success: false, error: 'Insufficient permissions' };
    }

    // Initialize access list if needed
    if (!pkg.access) {
      pkg.access = [];
    }

    // Update or add access entry
    const existingIdx = pkg.access.findIndex(
      (a) => a.principalId === principalId && a.principalType === principalType
    );
    if (existingIdx >= 0) {
      pkg.access[existingIdx].permission = permission;
    } else {
      pkg.access.push({ principalId, principalType, permission });
    }

    return { success: true };
  }

  /**
   * Revoke access to a package
   */
  async revokeAccess(
    packageName: string,
    principalId: string,
    requesterId: string
  ): Promise<{ success: boolean; error?: string }> {
    const pkg = this.packages.get(packageName);
    if (!pkg) {
      return { success: false, error: `Package ${packageName} not found` };
    }

    // Check requester has admin access
    if (!this.hasPermission(pkg, requesterId, 'admin')) {
      return { success: false, error: 'Insufficient permissions' };
    }

    if (pkg.access) {
      pkg.access = pkg.access.filter((a) => a.principalId !== principalId);
    }

    return { success: true };
  }

  /**
   * List access for a package
   */
  async listAccess(packageName: string): Promise<PackageAccess[]> {
    const pkg = this.packages.get(packageName);
    return pkg?.access || [];
  }

  /**
   * Check if user has permission on package
   */
  hasPermission(
    pkg: PackageMetadata,
    userId: string,
    requiredPermission: PackagePermission
  ): boolean {
    // Public packages: read access for everyone
    if (requiredPermission === 'read' && pkg.visibility !== 'private') {
      return true;
    }

    // Check direct access
    const directAccess = pkg.access?.find(
      (a) => a.principalType === 'user' && a.principalId === userId
    );
    if (directAccess) {
      return this.permissionSatisfies(directAccess.permission, requiredPermission);
    }

    // Check org access for scoped packages
    if (pkg.organization) {
      const org = this.organizations.get(pkg.organization);
      if (org) {
        const member = org.members.find((m) => m.userId === userId);
        if (member) {
          if (member.role === 'owner') return true;
          if (member.role === 'admin' && requiredPermission !== 'admin') return true;
          if (member.role === 'member' && requiredPermission === 'read') return true;
        }
      }
    }

    // Check org-level access grants
    const orgAccess = pkg.access?.filter((a) => a.principalType === 'org') || [];
    for (const access of orgAccess) {
      const org = this.organizations.get(access.principalId);
      if (org?.members.some((m) => m.userId === userId)) {
        if (this.permissionSatisfies(access.permission, requiredPermission)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Check if granted permission satisfies required permission
   */
  private permissionSatisfies(granted: PackagePermission, required: PackagePermission): boolean {
    const levels: Record<PackagePermission, number> = {
      read: 1,
      write: 2,
      admin: 3,
    };
    return levels[granted] >= levels[required];
  }

  /**
   * Set package visibility
   */
  async setVisibility(
    packageName: string,
    visibility: PackageVisibility,
    requesterId: string
  ): Promise<{ success: boolean; error?: string }> {
    const pkg = this.packages.get(packageName);
    if (!pkg) {
      return { success: false, error: `Package ${packageName} not found` };
    }

    if (!this.hasPermission(pkg, requesterId, 'admin')) {
      return { success: false, error: 'Insufficient permissions' };
    }

    pkg.visibility = visibility;
    return { success: true };
  }

  /**
   * Create an authentication token
   */
  async createToken(
    userId: string,
    name: string,
    options: { readonly?: boolean; scopes?: string[]; expiresInDays?: number } = {}
  ): Promise<{ success: boolean; token?: string; tokenId?: string; error?: string }> {
    const tokenValue = this.generateTokenValue();
    const tokenHash = this.hashToken(tokenValue);
    const tokenId = this.generateTokenId();

    const token: AuthToken = {
      id: tokenId,
      tokenHash,
      userId,
      name,
      readonly: options.readonly || false,
      scopes: options.scopes,
      created: new Date().toISOString(),
      expires: options.expiresInDays
        ? new Date(Date.now() + options.expiresInDays * 86400000).toISOString()
        : undefined,
    };

    this.tokens.set(tokenId, token);

    return { success: true, token: tokenValue, tokenId };
  }

  /**
   * Revoke a token
   */
  async revokeToken(
    tokenId: string,
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    const token = this.tokens.get(tokenId);
    if (!token) {
      return { success: false, error: 'Token not found' };
    }

    if (token.userId !== userId) {
      return { success: false, error: 'Insufficient permissions' };
    }

    this.tokens.delete(tokenId);
    return { success: true };
  }

  /**
   * Validate a token
   */
  async validateToken(tokenValue: string): Promise<{
    valid: boolean;
    userId?: string;
    readonly?: boolean;
    scopes?: string[];
  }> {
    const tokenHash = this.hashToken(tokenValue);

    for (const token of this.tokens.values()) {
      if (token.tokenHash === tokenHash) {
        // Check expiration
        if (token.expires && new Date(token.expires) < new Date()) {
          return { valid: false };
        }

        // Update last used
        token.lastUsed = new Date().toISOString();

        return {
          valid: true,
          userId: token.userId,
          readonly: token.readonly,
          scopes: token.scopes,
        };
      }
    }

    return { valid: false };
  }

  /**
   * List user's tokens
   */
  async listTokens(userId: string): Promise<Array<Omit<AuthToken, 'tokenHash'>>> {
    const userTokens: Array<Omit<AuthToken, 'tokenHash'>> = [];

    for (const token of this.tokens.values()) {
      if (token.userId === userId) {
        const { tokenHash: _, ...rest } = token;
        userTokens.push(rest);
      }
    }

    return userTokens;
  }

  /**
   * Generate a random token value
   */
  private generateTokenValue(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = 'hst_'; // HoloScript Token prefix
    for (let i = 0; i < 32; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate a token ID
   */
  private generateTokenId(): string {
    return 'tok_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  /**
   * Simple hash function for tokens (in production, use crypto)
   */
  private hashToken(token: string): string {
    let hash = 0;
    for (let i = 0; i < token.length; i++) {
      const char = token.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}

/**
 * Create a new package registry client
 */
export function createPackageRegistry(baseUrl?: string): PackageRegistry {
  return new PackageRegistry(baseUrl);
}

/**
 * Global default registry instance
 */
export const defaultRegistry = createPackageRegistry();

export default PackageRegistry;
