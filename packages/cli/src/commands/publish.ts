/**
 * holoscript publish command
 *
 * Sprint 6 Priority 1: CLI publish command
 *
 * Entry point for `holoscript publish` — orchestrates validation, packaging,
 * and registry upload. Supports --dry-run, --tag, --access, and --verbose flags.
 */

import { PublishValidator } from '../publish/validator.js';
import { PackagePackager } from '../publish/packager.js';
import { PackagePublisher } from '../publish/publisher.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PublishCommandOptions {
  cwd?: string;
  dryRun?: boolean;
  tag?: string;
  access?: 'public' | 'restricted';
  verbose?: boolean;
  skipTests?: boolean;
  allowConsole?: boolean;
  force?: boolean;
  token?: string;
  registry?: string;
}

export interface PublishCommandResult {
  success: boolean;
  dryRun: boolean;
  packageName?: string;
  version?: string;
  errors: string[];
  warnings: string[];
  /** Only present on dry-run */
  fileCount?: number;
  /** Only present on dry-run */
  totalSize?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// PublishCommand
// ─────────────────────────────────────────────────────────────────────────────

export class PublishCommand {
  private cwd: string;
  private opts: PublishCommandOptions;

  constructor(opts: PublishCommandOptions = {}) {
    this.cwd = opts.cwd ?? process.cwd();
    this.opts = opts;
  }

  async run(): Promise<PublishCommandResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Validate
    const validator = new PublishValidator(this.cwd, {
      skipTests: this.opts.skipTests,
      allowConsole: this.opts.allowConsole,
      verbose: this.opts.verbose,
    });
    const validation = await validator.validate();

    for (const w of validation.warnings) warnings.push(w.message);

    if (!validation.valid) {
      for (const e of validation.errors) errors.push(`[${e.code}] ${e.message}`);
      return { success: false, dryRun: !!this.opts.dryRun, errors, warnings };
    }

    const pkgJson = validator.getPackageJson();
    const packageName = pkgJson?.name;
    const version = pkgJson?.version;

    // 2. Dry-run: just pack and return file list
    if (this.opts.dryRun) {
      const packager = new PackagePackager(this.cwd, { dryRun: true, verbose: this.opts.verbose });
      const packResult = await packager.pack();
      if (!packResult.success) {
        return {
          success: false,
          dryRun: true,
          errors: [packResult.error ?? 'pack failed'],
          warnings,
        };
      }
      return {
        success: true,
        dryRun: true,
        packageName,
        version,
        errors,
        warnings,
        fileCount: packResult.files?.length ?? 0,
        totalSize: packResult.size ?? 0,
      };
    }

    // 3. Full publish
    const publisher = new PackagePublisher(this.cwd, {
      token: this.opts.token,
      registry: this.opts.registry,
      tag: this.opts.tag,
      access: this.opts.access === 'restricted' ? 'restricted' : 'public',
      force: this.opts.force,
      verbose: this.opts.verbose,
      skipTests: this.opts.skipTests,
      allowConsole: this.opts.allowConsole,
    });
    const result = await publisher.publish();

    return {
      success: result.success,
      dryRun: false,
      packageName: result.packageName ?? packageName,
      version: result.version ?? version,
      errors: result.errors ?? errors,
      warnings: result.warnings ?? warnings,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Factory helper used by tests & CLI entry point
// ─────────────────────────────────────────────────────────────────────────────

export function createPublishCommand(opts?: PublishCommandOptions): PublishCommand {
  return new PublishCommand(opts);
}
