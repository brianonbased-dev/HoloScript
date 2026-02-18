export interface PackageVersion {
  version: string;
  description?: string;
  author?: string;
  tags?: string[];
  /** Semver ranges of peer deps */
  peerDependencies?: Record<string, string>;
  /** ISO timestamp */
  publishedAt: string;
  /** Checksum of package contents */
  checksum: string;
}

export interface PackageManifest {
  name: string;
  description?: string;
  author?: string;
  license?: string;
  versions: PackageVersion[];
  /** Latest stable version */
  latest: string;
  /** Total download count */
  downloads: number;
  tags?: string[];
}
