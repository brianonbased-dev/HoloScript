/**
 * Pre-Publish Validator
 *
 * Sprint 6 Priority 1: holoscript publish command
 *
 * Validates packages before publishing to the HoloScript registry.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

// ============================================================================
// Types
// ============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  file?: string;
  line?: number;
  fix?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  file?: string;
}

export interface ValidatorOptions {
  /** Skip test validation */
  skipTests?: boolean;
  /** Skip lint checks */
  skipLint?: boolean;
  /** Allow console.log in code */
  allowConsole?: boolean;
  /** Check for unused dependencies */
  checkDeps?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

export interface PackageJson {
  name?: string;
  version?: string;
  description?: string;
  main?: string;
  types?: string;
  files?: string[];
  keywords?: string[];
  author?: string | { name?: string; email?: string; url?: string };
  license?: string;
  repository?: string | { type?: string; url?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  holoscript?: {
    traits?: string[];
    templates?: string[];
    runtime?: string;
  };
  scripts?: Record<string, string>;
  private?: boolean;
}

// ============================================================================
// Validator
// ============================================================================

export class PublishValidator {
  private cwd: string;
  private options: ValidatorOptions;
  private packageJson: PackageJson | null = null;

  constructor(cwd: string = process.cwd(), options: ValidatorOptions = {}) {
    this.cwd = cwd;
    this.options = options;
  }

  /**
   * Run all pre-publish validations
   */
  async validate(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Load package.json first
    const pkgJsonResult = this.validatePackageJson();
    errors.push(...pkgJsonResult.errors);
    warnings.push(...pkgJsonResult.warnings);

    if (this.packageJson) {
      // Check if package is marked private
      if (this.packageJson.private) {
        errors.push({
          code: 'E_PRIVATE_PACKAGE',
          message: 'Package is marked as private and cannot be published',
          file: 'package.json',
          fix: 'Remove "private": true from package.json or use --force',
        });
      }

      // Validate package name
      const nameResult = this.validatePackageName();
      errors.push(...nameResult.errors);
      warnings.push(...nameResult.warnings);

      // Validate version
      const versionResult = this.validateVersion();
      errors.push(...versionResult.errors);
      warnings.push(...versionResult.warnings);

      // Check required fields
      const fieldsResult = this.validateRequiredFields();
      errors.push(...fieldsResult.errors);
      warnings.push(...fieldsResult.warnings);
    }

    // Check for README
    const readmeResult = this.validateReadme();
    errors.push(...readmeResult.errors);
    warnings.push(...readmeResult.warnings);

    // Check for LICENSE
    const licenseResult = this.validateLicense();
    errors.push(...licenseResult.errors);
    warnings.push(...licenseResult.warnings);

    // Validate HoloScript files
    const holoResult = await this.validateHoloScriptFiles();
    errors.push(...holoResult.errors);
    warnings.push(...holoResult.warnings);

    // Check for console.log
    if (!this.options.allowConsole) {
      const consoleResult = this.checkConsoleStatements();
      errors.push(...consoleResult.errors);
      warnings.push(...consoleResult.warnings);
    }

    // Check for unused dependencies
    if (this.options.checkDeps) {
      const depsResult = await this.checkUnusedDependencies();
      warnings.push(...depsResult.warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  // ============================================================================
  // Individual Validators
  // ============================================================================

  private validatePackageJson(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const pkgPath = join(this.cwd, 'package.json');

    if (!existsSync(pkgPath)) {
      errors.push({
        code: 'E_NO_PACKAGE_JSON',
        message: 'No package.json found in current directory',
        fix: 'Run "npm init" or "holoscript init" to create package.json',
      });
      return { valid: false, errors, warnings };
    }

    try {
      const content = readFileSync(pkgPath, 'utf-8');
      this.packageJson = JSON.parse(content);
    } catch (err: unknown) {
      errors.push({
        code: 'E_INVALID_PACKAGE_JSON',
        message: `Failed to parse package.json: ${err instanceof Error ? err.message : String(err)}`,
        file: 'package.json',
        fix: 'Ensure package.json is valid JSON',
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validatePackageName(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!this.packageJson?.name) {
      errors.push({
        code: 'E_NO_NAME',
        message: 'Package name is required',
        file: 'package.json',
        fix: 'Add "name" field to package.json',
      });
      return { valid: false, errors, warnings };
    }

    const name = this.packageJson.name;

    // Check name format
    const validNameRegex = /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;
    if (!validNameRegex.test(name)) {
      errors.push({
        code: 'E_INVALID_NAME',
        message: `Package name "${name}" is invalid`,
        file: 'package.json',
        fix: 'Package names must be lowercase and can contain hyphens, underscores, and dots',
      });
    }

    // Check name length
    if (name.length > 214) {
      errors.push({
        code: 'E_NAME_TOO_LONG',
        message: 'Package name must be 214 characters or less',
        file: 'package.json',
      });
    }

    // Check for reserved names
    const reserved = ['node_modules', '__proto__', 'constructor', 'prototype'];
    if (reserved.includes(name)) {
      errors.push({
        code: 'E_RESERVED_NAME',
        message: `"${name}" is a reserved name`,
        file: 'package.json',
      });
    }

    // Recommend @holoscript scope for official packages
    if (!name.startsWith('@') && !name.startsWith('holoscript-')) {
      warnings.push({
        code: 'W_UNSCOPED_NAME',
        message: 'Consider using a scoped package name (e.g., @yourorg/package-name)',
        file: 'package.json',
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateVersion(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    if (!this.packageJson?.version) {
      errors.push({
        code: 'E_NO_VERSION',
        message: 'Package version is required',
        file: 'package.json',
        fix: 'Add "version" field to package.json (e.g., "1.0.0")',
      });
      return { valid: false, errors, warnings };
    }

    const version = this.packageJson.version;

    // Check semver format
    const semverRegex =
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
    if (!semverRegex.test(version)) {
      errors.push({
        code: 'E_INVALID_VERSION',
        message: `Version "${version}" is not valid semver`,
        file: 'package.json',
        fix: 'Use semantic versioning format: MAJOR.MINOR.PATCH (e.g., 1.0.0)',
      });
    }

    // Warn about 0.x versions
    if (version.startsWith('0.')) {
      warnings.push({
        code: 'W_UNSTABLE_VERSION',
        message: 'Version 0.x indicates unstable API',
        file: 'package.json',
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateRequiredFields(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const pkg = this.packageJson!;

    // Require description
    if (!pkg.description) {
      warnings.push({
        code: 'W_NO_DESCRIPTION',
        message: 'Missing description field',
        file: 'package.json',
      });
    }

    // Require main entry point
    if (!pkg.main && !pkg.types) {
      warnings.push({
        code: 'W_NO_MAIN',
        message: 'Missing main or types field - package may not be importable',
        file: 'package.json',
      });
    }

    // Require keywords for discoverability
    if (!pkg.keywords || pkg.keywords.length === 0) {
      warnings.push({
        code: 'W_NO_KEYWORDS',
        message: 'Missing keywords - package will be hard to discover',
        file: 'package.json',
      });
    } else if (!pkg.keywords.includes('holoscript')) {
      warnings.push({
        code: 'W_MISSING_KEYWORD',
        message: 'Consider adding "holoscript" keyword for discoverability',
        file: 'package.json',
      });
    }

    // Require author
    if (!pkg.author) {
      warnings.push({
        code: 'W_NO_AUTHOR',
        message: 'Missing author field',
        file: 'package.json',
      });
    }

    // Require repository
    if (!pkg.repository) {
      warnings.push({
        code: 'W_NO_REPOSITORY',
        message: 'Missing repository field',
        file: 'package.json',
      });
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateReadme(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const readmeNames = ['README.md', 'README', 'readme.md', 'readme', 'README.txt'];
    const hasReadme = readmeNames.some((name) => existsSync(join(this.cwd, name)));

    if (!hasReadme) {
      errors.push({
        code: 'E_NO_README',
        message: 'No README file found',
        fix: 'Create a README.md file describing your package',
      });
    } else {
      // Check README content
      const readmePath = readmeNames.find((name) => existsSync(join(this.cwd, name)));
      if (readmePath) {
        const content = readFileSync(join(this.cwd, readmePath), 'utf-8');
        if (content.trim().length < 100) {
          warnings.push({
            code: 'W_SHORT_README',
            message: 'README is very short - consider adding more documentation',
            file: readmePath,
          });
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private validateLicense(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const licenseNames = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'license.md'];
    const hasLicense = licenseNames.some((name) => existsSync(join(this.cwd, name)));

    if (!hasLicense) {
      // Check if license is in package.json
      if (this.packageJson?.license) {
        warnings.push({
          code: 'W_NO_LICENSE_FILE',
          message: `License "${this.packageJson.license}" specified but no LICENSE file found`,
        });
      } else {
        errors.push({
          code: 'E_NO_LICENSE',
          message: 'No LICENSE file found',
          fix: 'Create a LICENSE file or add "license" field to package.json',
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private async validateHoloScriptFiles(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Find all HoloScript files
    const holoFiles = this.findFiles(['.hs', '.hsplus', '.holo']);

    if (holoFiles.length === 0) {
      warnings.push({
        code: 'W_NO_HOLO_FILES',
        message: 'No HoloScript files found in package',
      });
      return { valid: true, errors, warnings };
    }

    // Validate each file
    for (const file of holoFiles) {
      try {
        const content = readFileSync(file, 'utf-8');

        // Dynamic import to avoid circular deps
        const { HoloCompositionParser, HoloScriptCodeParser } = await import('@holoscript/core');

        const isHolo = file.endsWith('.holo');
        let parseResult: any;

        if (isHolo) {
          const parser = new HoloCompositionParser();
          parseResult = parser.parse(content);
        } else {
          const parser = new HoloScriptCodeParser();
          parseResult = parser.parse(content);
        }

        if (!parseResult.success || parseResult.errors?.length > 0) {
          const fileErrors = parseResult.errors || [];
          for (const err of fileErrors.slice(0, 5)) {
            // Limit to 5 errors per file
            errors.push({
              code: 'E_PARSE_ERROR',
              message: err.message || String(err),
              file: file.replace(this.cwd + '/', ''),
              line: err.line || err.loc?.line,
            });
          }
        }
      } catch (err: unknown) {
        errors.push({
          code: 'E_FILE_READ_ERROR',
          message: `Failed to validate ${file}: ${err instanceof Error ? err.message : String(err)}`,
          file: file.replace(this.cwd + '/', ''),
        });
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private checkConsoleStatements(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const jsFiles = this.findFiles(['.js', '.ts', '.mjs', '.mts']);

    for (const file of jsFiles) {
      // Skip test files and node_modules
      if (file.includes('node_modules') || file.includes('.test.') || file.includes('.spec.')) {
        continue;
      }

      try {
        const content = readFileSync(file, 'utf-8');
        const lines = content.split('\n');

        lines.forEach((line, index) => {
          // Check for console.log, console.error, console.warn etc.
          const consoleMatch = line.match(/console\.(log|error|warn|info|debug)\s*\(/);
          if (consoleMatch) {
            // Skip if it's commented out
            const trimmed = line.trim();
            if (trimmed.startsWith('//') || trimmed.startsWith('*')) {
              return;
            }

            errors.push({
              code: 'E_CONSOLE_STATEMENT',
              message: `console.${consoleMatch[1]}() found in production code`,
              file: file.replace(this.cwd + '/', ''),
              line: index + 1,
              fix: 'Remove console statements or use a logger instead',
            });
          }
        });
      } catch {
        // Ignore read errors
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private async checkUnusedDependencies(): Promise<ValidationResult> {
    const warnings: ValidationWarning[] = [];

    if (!this.packageJson?.dependencies) {
      return { valid: true, errors: [], warnings };
    }

    const deps = Object.keys(this.packageJson.dependencies);
    const allFiles = this.findFiles(['.js', '.ts', '.mjs', '.mts', '.hs', '.hsplus', '.holo']);
    const usedDeps = new Set<string>();

    for (const file of allFiles) {
      try {
        const content = readFileSync(file, 'utf-8');

        // Check for imports
        for (const dep of deps) {
          if (content.includes(`'${dep}'`) || content.includes(`"${dep}"`)) {
            usedDeps.add(dep);
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    // Find unused
    for (const dep of deps) {
      if (!usedDeps.has(dep)) {
        warnings.push({
          code: 'W_UNUSED_DEP',
          message: `Dependency "${dep}" appears to be unused`,
          file: 'package.json',
        });
      }
    }

    return { valid: true, errors: [], warnings };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private findFiles(extensions: string[]): string[] {
    const files: string[] = [];

    const walk = (dir: string) => {
      try {
        const entries = readdirSync(dir);
        for (const entry of entries) {
          // Skip common ignored directories
          if (
            entry === 'node_modules' ||
            entry === '.git' ||
            entry === 'dist' ||
            entry === 'build' ||
            entry === 'coverage'
          ) {
            continue;
          }

          const fullPath = join(dir, entry);
          const stat = statSync(fullPath);

          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (extensions.some((ext) => entry.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      } catch {
        // Ignore errors
      }
    };

    walk(this.cwd);
    return files;
  }

  /**
   * Get the loaded package.json
   */
  getPackageJson(): PackageJson | null {
    return this.packageJson;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export function createPublishValidator(cwd?: string, options?: ValidatorOptions): PublishValidator {
  return new PublishValidator(cwd, options);
}

export async function validateForPublish(
  cwd?: string,
  options?: ValidatorOptions
): Promise<ValidationResult> {
  const validator = createPublishValidator(cwd, options);
  return validator.validate();
}
