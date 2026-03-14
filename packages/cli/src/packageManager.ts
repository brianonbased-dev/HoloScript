/**
 * HoloScript Package Manager
 *
 * Manages HoloScript packages for projects, similar to npm but
 * with HoloScript-specific package resolution and validation.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { spawn, SpawnOptions } from 'child_process';

// ============================================================================
// Types
// ============================================================================

export interface PackageJson {
  name?: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  holoscript?: HoloScriptConfig;
}

export interface HoloScriptConfig {
  packages?: string[];
  registry?: string;
}

export interface PackageInfo {
  name: string;
  version: string;
  description?: string;
  homepage?: string;
  isHoloScriptPackage: boolean;
}

export interface AddOptions {
  dev?: boolean;
  verbose?: boolean;
}

export interface RemoveOptions {
  verbose?: boolean;
}

export interface ListOptions {
  verbose?: boolean;
  json?: boolean;
}

// ============================================================================
// Package Manager
// ============================================================================

export class PackageManager {
  private cwd: string;
  private packageJsonPath: string;

  // Official HoloScript packages
  private static readonly HOLOSCRIPT_PACKAGES = [
    '@holoscript/core',
    '@holoscript/std',
    '@holoscript/runtime',
    '@holoscript/network',
    '@holoscript/fs',
    '@holoscript/linter',
    '@holoscript/formatter',
    '@holoscript/test',
    '@holoscript/llm',
    '@holoscript/lsp',
    '@holoscript/cli',
    '@holoscript/commerce',
    '@holoscript/infinityassistant',
  ];

  constructor(cwd: string = process.cwd()) {
    this.cwd = cwd;
    this.packageJsonPath = join(cwd, 'package.json');
  }

  // ============================================================================
  // Add Packages
  // ============================================================================

  async add(packages: string[], options: AddOptions = {}): Promise<boolean> {
    if (packages.length === 0) {
      console.error('\x1b[31mError: No packages specified.\x1b[0m');
      console.log('Usage: holoscript add <package...> [--dev]');
      return false;
    }

    // Validate package names
    const validated = await this.validatePackages(packages, options.verbose);
    if (validated.length === 0) {
      console.error('\x1b[31mNo valid packages to install.\x1b[0m');
      return false;
    }

    // Determine package manager
    const pm = this.detectPackageManager();
    if (options.verbose) {
      console.log(`\x1b[2mUsing ${pm} to install packages\x1b[0m`);
    }

    // Build install command
    const args = this.buildInstallArgs(pm, validated, options.dev);
    if (options.verbose) {
      console.log(`\x1b[2mRunning: ${pm} ${args.join(' ')}\x1b[0m`);
    }

    // Display what we're installing
    console.log('\x1b[36mInstalling packages:\x1b[0m');
    for (const pkg of validated) {
      const isOfficial = PackageManager.HOLOSCRIPT_PACKAGES.includes(pkg);
      const badge = isOfficial ? '\x1b[32m[official]\x1b[0m' : '';
      console.log(`  • ${pkg} ${badge}`);
    }
    console.log('');

    // Run install
    const success = await this.runCommand(pm, args, options.verbose);

    if (success) {
      console.log('\n\x1b[32m✓ Packages installed successfully!\x1b[0m');
      this.printUsageHint(validated);
    }

    return success;
  }

  // ============================================================================
  // Remove Packages
  // ============================================================================

  async remove(packages: string[], options: RemoveOptions = {}): Promise<boolean> {
    if (packages.length === 0) {
      console.error('\x1b[31mError: No packages specified.\x1b[0m');
      console.log('Usage: holoscript remove <package...>');
      return false;
    }

    // Check if packages are installed
    const pkgJson = this.readPackageJson();
    if (!pkgJson) {
      console.error('\x1b[31mError: No package.json found in current directory.\x1b[0m');
      return false;
    }

    const installed = new Set([
      ...Object.keys(pkgJson.dependencies || {}),
      ...Object.keys(pkgJson.devDependencies || {}),
    ]);

    const toRemove = packages.filter((pkg) => {
      if (!installed.has(pkg)) {
        console.warn(`\x1b[33mWarning: ${pkg} is not installed.\x1b[0m`);
        return false;
      }
      return true;
    });

    if (toRemove.length === 0) {
      console.error('\x1b[31mNo installed packages to remove.\x1b[0m');
      return false;
    }

    const pm = this.detectPackageManager();
    const args = this.buildRemoveArgs(pm, toRemove);

    console.log('\x1b[36mRemoving packages:\x1b[0m');
    for (const pkg of toRemove) {
      console.log(`  • ${pkg}`);
    }
    console.log('');

    const success = await this.runCommand(pm, args, options.verbose);

    if (success) {
      console.log('\n\x1b[32m✓ Packages removed successfully!\x1b[0m');
    }

    return success;
  }

  // ============================================================================
  // List Packages
  // ============================================================================

  list(options: ListOptions = {}): void {
    const pkgJson = this.readPackageJson();
    if (!pkgJson) {
      console.error('\x1b[31mError: No package.json found in current directory.\x1b[0m');
      return;
    }

    const deps = pkgJson.dependencies || {};
    const devDeps = pkgJson.devDependencies || {};

    // Filter to HoloScript-related packages
    const holoPackages = Object.entries(deps)
      .filter(([name]) => name.startsWith('@holoscript/') || name === 'holoscript')
      .map(([name, version]) => ({ name, version, dev: false }));

    const holoDevPackages = Object.entries(devDeps)
      .filter(([name]) => name.startsWith('@holoscript/') || name === 'holoscript')
      .map(([name, version]) => ({ name, version, dev: true }));

    const allPackages = [...holoPackages, ...holoDevPackages];

    if (options.json) {
      console.log(JSON.stringify(allPackages, null, 2));
      return;
    }

    if (allPackages.length === 0) {
      console.log('\x1b[33mNo HoloScript packages installed.\x1b[0m');
      console.log('Run \x1b[36mholoscript add @holoscript/std\x1b[0m to get started.');
      return;
    }

    console.log('\x1b[36mHoloScript Packages:\x1b[0m\n');

    // Dependencies
    if (holoPackages.length > 0) {
      console.log('\x1b[1mDependencies:\x1b[0m');
      for (const { name, version } of holoPackages) {
        const isOfficial = PackageManager.HOLOSCRIPT_PACKAGES.includes(name);
        const badge = isOfficial ? ' \x1b[32m[official]\x1b[0m' : '';
        console.log(`  ${name}@${version}${badge}`);
      }
      console.log('');
    }

    // Dev Dependencies
    if (holoDevPackages.length > 0) {
      console.log('\x1b[1mDev Dependencies:\x1b[0m');
      for (const { name, version } of holoDevPackages) {
        const isOfficial = PackageManager.HOLOSCRIPT_PACKAGES.includes(name);
        const badge = isOfficial ? ' \x1b[32m[official]\x1b[0m' : '';
        console.log(`  ${name}@${version}${badge}`);
      }
      console.log('');
    }

    console.log(`\x1b[2mTotal: ${allPackages.length} package(s)\x1b[0m`);
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private async validatePackages(packages: string[], verbose?: boolean): Promise<string[]> {
    const validated: string[] = [];

    for (const pkg of packages) {
      // Expand shorthand names
      const fullName = this.expandPackageName(pkg);

      if (verbose) {
        console.log(`\x1b[2mValidating ${fullName}...\x1b[0m`);
      }

      // Check if it's an official package or exists on npm
      const isOfficial = PackageManager.HOLOSCRIPT_PACKAGES.includes(fullName);

      if (isOfficial) {
        validated.push(fullName);
      } else if (fullName.startsWith('@holoscript/')) {
        console.warn(`\x1b[33mWarning: ${fullName} is not an official HoloScript package.\x1b[0m`);
        validated.push(fullName);
      } else {
        validated.push(fullName);
      }
    }

    return validated;
  }

  private expandPackageName(pkg: string): string {
    // Support shorthand: "std" → "@holoscript/std"
    if (!pkg.startsWith('@') && !pkg.includes('/')) {
      const potential = `@holoscript/${pkg}`;
      if (PackageManager.HOLOSCRIPT_PACKAGES.includes(potential)) {
        return potential;
      }
    }
    return pkg;
  }

  private detectPackageManager(): 'npm' | 'pnpm' | 'yarn' | 'bun' {
    // Check for lock files
    if (existsSync(join(this.cwd, 'pnpm-lock.yaml'))) return 'pnpm';
    if (existsSync(join(this.cwd, 'yarn.lock'))) return 'yarn';
    if (existsSync(join(this.cwd, 'bun.lockb'))) return 'bun';
    if (existsSync(join(this.cwd, 'package-lock.json'))) return 'npm';

    // Default to npm
    return 'npm';
  }

  private buildInstallArgs(pm: string, packages: string[], dev?: boolean): string[] {
    switch (pm) {
      case 'pnpm':
        return ['add', ...(dev ? ['-D'] : []), ...packages];
      case 'yarn':
        return ['add', ...(dev ? ['--dev'] : []), ...packages];
      case 'bun':
        return ['add', ...(dev ? ['--dev'] : []), ...packages];
      default:
        return ['install', ...(dev ? ['--save-dev'] : ['--save']), ...packages];
    }
  }

  private buildRemoveArgs(pm: string, packages: string[]): string[] {
    switch (pm) {
      case 'pnpm':
        return ['remove', ...packages];
      case 'yarn':
        return ['remove', ...packages];
      case 'bun':
        return ['remove', ...packages];
      default:
        return ['uninstall', ...packages];
    }
  }

  private runCommand(cmd: string, args: string[], verbose?: boolean): Promise<boolean> {
    return new Promise((resolve) => {
      const spawnOptions: SpawnOptions = {
        cwd: this.cwd,
        stdio: verbose ? 'inherit' : 'pipe',
        shell: process.platform === 'win32',
      };

      const proc = spawn(cmd, args, spawnOptions);

      let stderr = '';
      if (!verbose && proc.stderr) {
        proc.stderr.on('data', (data) => {
          stderr += data.toString();
        });
      }

      proc.on('close', (code) => {
        if (code !== 0) {
          if (!verbose && stderr) {
            console.error(`\x1b[31m${stderr}\x1b[0m`);
          }
          console.error(`\x1b[31mCommand failed with exit code ${code}\x1b[0m`);
          resolve(false);
        } else {
          resolve(true);
        }
      });

      proc.on('error', (err) => {
        console.error(`\x1b[31mFailed to run ${cmd}: ${err.message}\x1b[0m`);
        resolve(false);
      });
    });
  }

  private readPackageJson(): PackageJson | null {
    try {
      const content = readFileSync(this.packageJsonPath, 'utf-8');
      return JSON.parse(content);
    } catch {
      return null;
    }
  }

  private printUsageHint(packages: string[]): void {
    console.log('\n\x1b[2mUsage hints:\x1b[0m');

    for (const pkg of packages) {
      if (pkg === '@holoscript/std' || pkg === 'std') {
        console.log(`  import { Vec3, Color, Timer } from '@holoscript/std';`);
      } else if (pkg === '@holoscript/network' || pkg === 'network') {
        console.log(`  import { Server, Client, Room } from '@holoscript/network';`);
      } else if (pkg === '@holoscript/test' || pkg === 'test') {
        console.log(`  import { describe, it, expect } from '@holoscript/test';`);
      } else if (pkg === '@holoscript/fs' || pkg === 'fs') {
        console.log(`  import { readFile, writeFile } from '@holoscript/fs';`);
      } else if (pkg === '@holoscript/linter' || pkg === 'linter') {
        console.log(`  import { createLinter, LintEngine } from '@holoscript/linter';`);
      }
    }
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function add(packages: string[], options?: AddOptions): Promise<boolean> {
  const pm = new PackageManager();
  return pm.add(packages, options);
}

export async function remove(packages: string[], options?: RemoveOptions): Promise<boolean> {
  const pm = new PackageManager();
  return pm.remove(packages, options);
}

/**
 * List all HoloScript packages installed in the current project
 * 
 * Scans the project's package.json and displays all installed packages that 
 * start with "@holoscript/" or are named "holoscript". Shows dependencies 
 * and devDependencies separately, with [official] badges for verified packages.
 * 
 * @param {ListOptions} [options] - Formatting options
 * @param {boolean} [options.verbose] - Show verbose output (currently unused)
 * @param {boolean} [options.json] - Output as JSON instead of formatted text
 * 
 * @example
 * // Show formatted list of packages
 * list();
 * 
 * @example
 * // Output as JSON for programmatic use
 * list({ json: true });
 */
export function list(options?: ListOptions): void {
  const pm = new PackageManager();
  pm.list(options);
}
