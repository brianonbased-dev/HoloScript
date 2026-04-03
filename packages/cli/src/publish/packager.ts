/**
 * Package Bundler
 *
 * Sprint 6 Priority 1: holoscript publish command
 *
 * Creates tarball packages for publishing to the HoloScript registry.
 */

import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join, basename, dirname } from 'path';
import { createGzip } from 'zlib';

// ============================================================================
// Types
// ============================================================================

export interface PackageResult {
  success: boolean;
  tarballPath?: string;
  size?: number;
  files?: string[];
  error?: string;
}

export interface PackagerOptions {
  /** Output directory for tarball */
  output?: string;
  /** Include additional files */
  include?: string[];
  /** Exclude patterns */
  exclude?: string[];
  /** Verbose output */
  verbose?: boolean;
  /** Dry run - don't create tarball */
  dryRun?: boolean;
}

export interface PackageManifest {
  name: string;
  version: string;
  files: FileEntry[];
  totalSize: number;
  createdAt: string;
}

export interface FileEntry {
  path: string;
  size: number;
  mode: number;
}

// ============================================================================
// Packager
// ============================================================================

export class PackagePackager {
  private cwd: string;
  private options: PackagerOptions;

  // Default files to always include
  private static readonly ALWAYS_INCLUDE = [
    'package.json',
    'README.md',
    'README',
    'readme.md',
    'LICENSE',
    'LICENSE.md',
    'license',
    'CHANGELOG.md',
    'CHANGELOG',
  ];

  // Default patterns to exclude
  private static readonly DEFAULT_EXCLUDE = [
    'node_modules',
    '.git',
    '.gitignore',
    '.npmignore',
    '.DS_Store',
    'Thumbs.db',
    '.env',
    '.env.local',
    '.env.*.local',
    '*.log',
    'npm-debug.log*',
    '.nyc_output',
    'coverage',
    '.vscode',
    '.idea',
    '*.tgz',
    '*.tar.gz',
    'test',
    'tests',
    '__tests__',
    '*.test.ts',
    '*.test.js',
    '*.spec.ts',
    '*.spec.js',
  ];

  constructor(cwd: string = process.cwd(), options: PackagerOptions = {}) {
    this.cwd = cwd;
    this.options = options;
  }

  /**
   * Create a package tarball
   */
  async pack(): Promise<PackageResult> {
    // Read package.json
    const pkgPath = join(this.cwd, 'package.json');
    if (!existsSync(pkgPath)) {
      return {
        success: false,
        error: 'package.json not found',
      };
    }

    let packageJson: any;
    try {
      packageJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    } catch (err: unknown) {
      return {
        success: false,
        error: `Failed to parse package.json: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    const { name, version } = packageJson;
    if (!name || !version) {
      return {
        success: false,
        error: 'package.json must have name and version fields',
      };
    }

    // Collect files to include
    const files = this.collectFiles(packageJson);

    if (files.length === 0) {
      return {
        success: false,
        error: 'No files to package',
      };
    }

    if (this.options.verbose) {
      console.log(`\x1b[2mCollected ${files.length} files for packaging\x1b[0m`);
    }

    // For dry run, just return the file list
    if (this.options.dryRun) {
      const totalSize = files.reduce((sum, f) => {
        const stat = statSync(join(this.cwd, f));
        return sum + stat.size;
      }, 0);

      return {
        success: true,
        files,
        size: totalSize,
      };
    }

    // Create tarball
    const tarballName = this.getTarballName(name, version);
    const outputDir = this.options.output || this.cwd;

    if (!existsSync(outputDir)) {
      mkdirSync(outputDir, { recursive: true });
    }

    const tarballPath = join(outputDir, tarballName);

    try {
      const size = await this.createTarball(tarballPath, files, name);

      return {
        success: true,
        tarballPath,
        size,
        files,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: `Failed to create tarball: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  /**
   * Get manifest of what would be packaged
   */
  getManifest(): PackageManifest | null {
    const pkgPath = join(this.cwd, 'package.json');
    if (!existsSync(pkgPath)) {
      return null;
    }

    let packageJson: any;
    try {
      packageJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    } catch {
      return null;
    }

    const files = this.collectFiles(packageJson);
    const fileEntries: FileEntry[] = [];
    let totalSize = 0;

    for (const file of files) {
      const fullPath = join(this.cwd, file);
      try {
        const stat = statSync(fullPath);
        fileEntries.push({
          path: file,
          size: stat.size,
          mode: stat.mode,
        });
        totalSize += stat.size;
      } catch {
        // Skip files that can't be stat'd
      }
    }

    return {
      name: packageJson.name,
      version: packageJson.version,
      files: fileEntries,
      totalSize,
      createdAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // File Collection
  // ============================================================================

  private collectFiles(packageJson: any): string[] {
    const files = new Set<string>();

    // 1. Always include certain files
    for (const file of PackagePackager.ALWAYS_INCLUDE) {
      if (existsSync(join(this.cwd, file))) {
        files.add(file);
      }
    }

    // 2. Include files from package.json "files" field
    if (packageJson.files && Array.isArray(packageJson.files)) {
      for (const pattern of packageJson.files) {
        const matched = this.matchPattern(pattern);
        for (const file of matched) {
          files.add(file);
        }
      }
    } else {
      // If no "files" field, include common directories
      const defaultDirs = ['src', 'lib', 'dist', 'build', 'esm', 'cjs'];
      for (const dir of defaultDirs) {
        if (existsSync(join(this.cwd, dir))) {
          const dirFiles = this.walkDir(dir);
          for (const file of dirFiles) {
            files.add(file);
          }
        }
      }
    }

    // 3. Add main entry point
    if (packageJson.main && existsSync(join(this.cwd, packageJson.main))) {
      files.add(packageJson.main);
    }

    // 4. Add types entry point
    if (packageJson.types && existsSync(join(this.cwd, packageJson.types))) {
      files.add(packageJson.types);
    }

    // 5. Add additional includes from options
    if (this.options.include) {
      for (const pattern of this.options.include) {
        const matched = this.matchPattern(pattern);
        for (const file of matched) {
          files.add(file);
        }
      }
    }

    // 6. Filter out excluded files
    const excludePatterns = [...PackagePackager.DEFAULT_EXCLUDE, ...(this.options.exclude || [])];

    const filtered = Array.from(files).filter((file) => {
      return !this.isExcluded(file, excludePatterns);
    });

    return filtered.sort();
  }

  private matchPattern(pattern: string): string[] {
    const files: string[] = [];
    const fullPath = join(this.cwd, pattern);

    if (existsSync(fullPath)) {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        // Recursively collect all files in directory
        const dirFiles = this.walkDir(pattern);
        files.push(...dirFiles);
      } else {
        files.push(pattern);
      }
    }

    // Handle glob patterns (simple implementation)
    if (pattern.includes('*')) {
      const dir = dirname(pattern);
      const filePattern = basename(pattern);
      const regex = new RegExp('^' + filePattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');

      const searchDir = dir === '.' ? this.cwd : join(this.cwd, dir);
      if (existsSync(searchDir)) {
        try {
          const entries = readdirSync(searchDir);
          for (const entry of entries) {
            if (regex.test(entry)) {
              const relativePath = dir === '.' ? entry : join(dir, entry).replace(/\\/g, '/');
              files.push(relativePath);
            }
          }
        } catch {
          // Ignore errors
        }
      }
    }

    return files;
  }

  private walkDir(dir: string): string[] {
    const files: string[] = [];
    const fullDir = join(this.cwd, dir);

    const walk = (currentDir: string, relativePath: string) => {
      try {
        const entries = readdirSync(currentDir);
        for (const entry of entries) {
          const fullPath = join(currentDir, entry);
          const relPath = join(relativePath, entry).replace(/\\/g, '/');
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            walk(fullPath, relPath);
          } else {
            files.push(relPath);
          }
        }
      } catch {
        // Ignore errors
      }
    };

    walk(fullDir, dir);
    return files;
  }

  private isExcluded(file: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
      // Check directory match
      if (file.startsWith(pattern + '/') || file === pattern) {
        return true;
      }

      // Check extension match
      if (pattern.startsWith('*.')) {
        const ext = pattern.slice(1);
        if (file.endsWith(ext)) {
          return true;
        }
      }

      // Check simple glob
      if (pattern.includes('*')) {
        const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
        if (regex.test(file) || regex.test(basename(file))) {
          return true;
        }
      }
    }

    return false;
  }

  // ============================================================================
  // Tarball Creation
  // ============================================================================

  private getTarballName(name: string, version: string): string {
    // Handle scoped packages
    const safeName = name.replace('@', '').replace('/', '-');
    return `${safeName}-${version}.tgz`;
  }

  private async createTarball(
    outputPath: string,
    files: string[],
    packageName: string
  ): Promise<number> {
    // Create a simple tar archive
    // Format: USTAR tar with gzip compression
    const tarBuffer = this.createTarArchive(files, packageName);

    // Compress with gzip
    const gzipBuffer = await this.gzipBuffer(tarBuffer);

    // Write to file
    writeFileSync(outputPath, gzipBuffer);

    return gzipBuffer.length;
  }

  private createTarArchive(files: string[], _packageName: string): Buffer {
    const blocks: Buffer[] = [];

    for (const file of files) {
      const fullPath = join(this.cwd, file);
      const content = readFileSync(fullPath);
      const stat = statSync(fullPath);

      // Create tar header (512 bytes)
      const header = this.createTarHeader(`package/${file}`, content.length, stat.mode, stat.mtime);
      blocks.push(header);

      // Add content (padded to 512 bytes)
      blocks.push(content);
      const padding = 512 - (content.length % 512);
      if (padding < 512) {
        blocks.push(Buffer.alloc(padding, 0));
      }
    }

    // Add two empty blocks to signify end of archive
    blocks.push(Buffer.alloc(1024, 0));

    return Buffer.concat(blocks);
  }

  private createTarHeader(name: string, size: number, mode: number, mtime: Date): Buffer {
    const header = Buffer.alloc(512, 0);

    // Name (100 bytes)
    header.write(name.slice(0, 99), 0, 'utf-8');

    // Mode (8 bytes, octal)
    header.write(((mode || 0o644) & 0o7777).toString(8).padStart(7, '0'), 100, 'utf-8');

    // UID (8 bytes)
    header.write('0000000', 108, 'utf-8');

    // GID (8 bytes)
    header.write('0000000', 116, 'utf-8');

    // Size (12 bytes, octal)
    header.write(size.toString(8).padStart(11, '0'), 124, 'utf-8');

    // Mtime (12 bytes, octal - seconds since epoch)
    const mtimeSecs = Math.floor(mtime.getTime() / 1000);
    header.write(mtimeSecs.toString(8).padStart(11, '0'), 136, 'utf-8');

    // Checksum placeholder (8 spaces)
    header.write('        ', 148, 'utf-8');

    // Type flag (1 byte) - '0' for regular file
    header.write('0', 156, 'utf-8');

    // Link name (100 bytes) - empty for regular files
    // (already zeroed)

    // Magic (6 bytes) - "ustar\0"
    header.write('ustar\x00', 257, 'utf-8');

    // Version (2 bytes)
    header.write('00', 263, 'utf-8');

    // Owner name (32 bytes)
    header.write('holoscript', 265, 'utf-8');

    // Group name (32 bytes)
    header.write('holoscript', 297, 'utf-8');

    // Calculate and write checksum
    let checksum = 0;
    for (let i = 0; i < 512; i++) {
      checksum += header[i];
    }
    header.write(checksum.toString(8).padStart(6, '0') + '\x00 ', 148, 'utf-8');

    return header;
  }

  private async gzipBuffer(buffer: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const gzip = createGzip({ level: 9 });

      gzip.on('data', (chunk) => chunks.push(chunk));
      gzip.on('end', () => resolve(Buffer.concat(chunks)));
      gzip.on('error', reject);

      gzip.write(buffer);
      gzip.end();
    });
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createPackager(cwd?: string, options?: PackagerOptions): PackagePackager {
  return new PackagePackager(cwd, options);
}

export async function packPackage(cwd?: string, options?: PackagerOptions): Promise<PackageResult> {
  const packager = createPackager(cwd, options);
  return packager.pack();
}

export function getPackageManifest(cwd?: string): PackageManifest | null {
  const packager = createPackager(cwd);
  return packager.getManifest();
}
