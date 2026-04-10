/**
 * HoloScript Package Certification System
 *
 * Automated verification program for high-quality packages.
 * Certified packages receive a badge and are featured in the registry.
 */

/**
 * Certification check categories
 */
export type CheckCategory = 'code_quality' | 'documentation' | 'security' | 'maintenance';

/**
 * Check result status
 */
export type CheckStatus = 'passed' | 'failed' | 'warning' | 'skipped';

/**
 * Individual check result
 */
export interface CheckResult {
  id: string;
  name: string;
  category: CheckCategory;
  status: CheckStatus;
  message: string;
  details?: Record<string, unknown>;
  required: boolean;
}

/**
 * Overall certification result
 */
export interface CertificationResult {
  packageName: string;
  packageVersion: string;
  timestamp: string;
  certified: boolean;
  score: number;
  maxScore: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  checks: CheckResult[];
  summary: {
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
  expiresAt?: string;
  certificateId?: string;
}

/**
 * Package manifest for certification
 */
export interface PackageManifest {
  name: string;
  version: string;
  description?: string;
  author?: string | { name: string; email?: string };
  license?: string;
  repository?: string | { url: string };
  readme?: string;
  changelog?: string;
  keywords?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  holoscript?: {
    traits?: string[];
    minVersion?: string;
  };
}

/**
 * Package files for analysis
 */
export interface PackageFiles {
  manifest: PackageManifest;
  readme?: string;
  changelog?: string;
  license?: string;
  sourceFiles: Array<{ path: string; content: string }>;
  testFiles: Array<{ path: string; content: string }>;
}

/**
 * Certification configuration
 */
export interface CertificationConfig {
  requiredCoverage: number;
  maxComplexity: number;
  requireChangelog: boolean;
  requireLicense: boolean;
  allowedLicenses: string[];
  securityAuditRequired: boolean;
}

/**
 * Default certification configuration
 */
export const DEFAULT_CERTIFICATION_CONFIG: CertificationConfig = {
  requiredCoverage: 80,
  maxComplexity: 20,
  requireChangelog: true,
  requireLicense: true,
  allowedLicenses: ['MIT', 'Apache-2.0', 'BSD-3-Clause', 'ISC', 'MPL-2.0'],
  securityAuditRequired: true,
};

/**
 * Certification Checker for HoloScript packages
 */
export class CertificationChecker {
  private config: CertificationConfig;

  constructor(config: Partial<CertificationConfig> = {}) {
    this.config = { ...DEFAULT_CERTIFICATION_CONFIG, ...config };
  }

  /**
   * Run all certification checks on a package
   */
  async certify(files: PackageFiles): Promise<CertificationResult> {
    const checks: CheckResult[] = [];

    // Run all check categories
    checks.push(...this.checkCodeQuality(files));
    checks.push(...this.checkDocumentation(files));
    checks.push(...this.checkSecurity(files));
    checks.push(...this.checkMaintenance(files));

    // Calculate results
    const summary = this.calculateSummary(checks);
    const { score, maxScore, grade } = this.calculateScore(checks);
    const certified = this.isCertified(checks, grade);

    const result: CertificationResult = {
      packageName: files.manifest.name,
      packageVersion: files.manifest.version,
      timestamp: new Date().toISOString(),
      certified,
      score,
      maxScore,
      grade,
      checks,
      summary,
    };

    if (certified) {
      result.certificateId = this.generateCertificateId(files.manifest);
      result.expiresAt = this.calculateExpiryDate();
    }

    return result;
  }

  /**
   * Code quality checks
   */
  private checkCodeQuality(files: PackageFiles): CheckResult[] {
    const results: CheckResult[] = [];

    // Check: TypeScript/HoloScript typed
    results.push(this.checkTyped(files));

    // Check: No lint errors
    results.push(this.checkLinting(files));

    // Check: Complexity score
    results.push(this.checkComplexity(files));

    // Check: Test coverage
    results.push(this.checkTestCoverage(files));

    // Check: No console.log in production code
    results.push(this.checkNoConsoleLogs(files));

    return results;
  }

  /**
   * Documentation checks
   */
  private checkDocumentation(files: PackageFiles): CheckResult[] {
    const results: CheckResult[] = [];

    // Check: README exists and has content
    results.push(this.checkReadme(files));

    // Check: README has examples
    results.push(this.checkReadmeExamples(files));

    // Check: Changelog maintained
    results.push(this.checkChangelog(files));

    // Check: License clear
    results.push(this.checkLicense(files));

    // Check: Package description
    results.push(this.checkDescription(files));

    return results;
  }

  /**
   * Security checks
   */
  private checkSecurity(files: PackageFiles): CheckResult[] {
    const results: CheckResult[] = [];

    // Check: No known vulnerabilities in dependencies
    results.push(this.checkVulnerabilities(files));

    // Check: No suspicious network calls
    results.push(this.checkNetworkCalls(files));

    // Check: Safe dependency tree
    results.push(this.checkDependencyTree(files));

    // Check: No eval or dangerous patterns
    results.push(this.checkDangerousPatterns(files));

    return results;
  }

  /**
   * Maintenance checks
   */
  private checkMaintenance(files: PackageFiles): CheckResult[] {
    const results: CheckResult[] = [];

    // Check: Semantic versioning
    results.push(this.checkSemver(files));

    // Check: Repository link
    results.push(this.checkRepository(files));

    // Check: Author information
    results.push(this.checkAuthor(files));

    return results;
  }

  // Individual check implementations

  private checkTyped(files: PackageFiles): CheckResult {
    const tsFiles = files.sourceFiles.filter(
      (f) => f.path.endsWith('.ts') || f.path.endsWith('.tsx')
    );
    const jsFiles = files.sourceFiles.filter(
      (f) => f.path.endsWith('.js') || f.path.endsWith('.jsx')
    );
    const holoFiles = files.sourceFiles.filter(
      (f) => f.path.endsWith('.holo') || f.path.endsWith('.hsplus')
    );

    const totalFiles = tsFiles.length + jsFiles.length + holoFiles.length;
    const typedFiles = tsFiles.length + holoFiles.length;
    const typedPercentage = totalFiles > 0 ? (typedFiles / totalFiles) * 100 : 100;

    return {
      id: 'code_typed',
      name: 'TypeScript/HoloScript Typed',
      category: 'code_quality',
      status: typedPercentage === 100 ? 'passed' : typedPercentage >= 80 ? 'warning' : 'failed',
      message:
        typedPercentage === 100
          ? 'All source files are typed'
          : `${typedPercentage.toFixed(0)}% of files are typed (${typedFiles}/${totalFiles})`,
      details: { typedPercentage, typedFiles, totalFiles },
      required: true,
    };
  }

  private checkLinting(files: PackageFiles): CheckResult {
    // Simulate lint check - in production, run actual linter
    const lintErrors: Array<{ file: string; line: number; message: string }> = [];

    for (const file of files.sourceFiles) {
      // Check for common issues
      if (file.content.includes('var ')) {
        lintErrors.push({
          file: file.path,
          line: file.content.split('\n').findIndex((l) => l.includes('var ')) + 1,
          message: 'Use const or let instead of var',
        });
      }
    }

    return {
      id: 'code_linting',
      name: 'No Lint Errors',
      category: 'code_quality',
      status: lintErrors.length === 0 ? 'passed' : 'failed',
      message:
        lintErrors.length === 0
          ? 'No lint errors found'
          : `${lintErrors.length} lint error(s) found`,
      details: { errors: lintErrors.slice(0, 10) },
      required: true,
    };
  }

  private checkComplexity(files: PackageFiles): CheckResult {
    // Calculate cyclomatic complexity (simplified)
    let totalComplexity = 0;
    let functionCount = 0;

    for (const file of files.sourceFiles) {
      // Count complexity indicators
      const ifCount = (file.content.match(/\bif\s*\(/g) || []).length;
      const forCount = (file.content.match(/\bfor\s*\(/g) || []).length;
      const whileCount = (file.content.match(/\bwhile\s*\(/g) || []).length;
      const caseCount = (file.content.match(/\bcase\s+/g) || []).length;
      const ternaryCount = (file.content.match(/\?.*:/g) || []).length;
      const andOrCount = (file.content.match(/&&|\|\|/g) || []).length;

      const fileComplexity =
        ifCount + forCount + whileCount + caseCount + ternaryCount + andOrCount;
      totalComplexity += fileComplexity;

      // Count functions
      functionCount += (file.content.match(/function\s+\w+|=>\s*{|\w+\s*\([^)]*\)\s*{/g) || [])
        .length;
    }

    const avgComplexity = functionCount > 0 ? totalComplexity / functionCount : 0;
    const grade =
      avgComplexity <= 5 ? 'A' : avgComplexity <= 10 ? 'B' : avgComplexity <= 20 ? 'C' : 'D';

    return {
      id: 'code_complexity',
      name: 'Complexity Score',
      category: 'code_quality',
      status: grade === 'A' || grade === 'B' ? 'passed' : grade === 'C' ? 'warning' : 'failed',
      message: `Complexity grade: ${grade} (avg: ${avgComplexity.toFixed(1)})`,
      details: { grade, avgComplexity, totalComplexity, functionCount },
      required: true,
    };
  }

  private checkTestCoverage(files: PackageFiles): CheckResult {
    // Check if tests exist
    const hasTests = files.testFiles.length > 0;
    const testFileCount = files.testFiles.length;
    const sourceFileCount = files.sourceFiles.length;

    // Estimate coverage based on test/source ratio (simplified)
    const estimatedCoverage = hasTests
      ? Math.min(100, (testFileCount / Math.max(sourceFileCount, 1)) * 100 * 2)
      : 0;

    return {
      id: 'code_coverage',
      name: 'Test Coverage',
      category: 'code_quality',
      status:
        estimatedCoverage >= this.config.requiredCoverage
          ? 'passed'
          : estimatedCoverage >= 50
            ? 'warning'
            : 'failed',
      message: hasTests
        ? `Estimated coverage: ${estimatedCoverage.toFixed(0)}% (${testFileCount} test files)`
        : 'No test files found',
      details: { estimatedCoverage, testFileCount, sourceFileCount },
      required: true,
    };
  }

  private checkNoConsoleLogs(files: PackageFiles): CheckResult {
    const consoleLogs: Array<{ file: string; line: number }> = [];

    for (const file of files.sourceFiles) {
      // Skip test files
      if (file.path.includes('.test.') || file.path.includes('.spec.')) continue;

      const lines = file.content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes('console.log') && !line.trim().startsWith('//')) {
          consoleLogs.push({ file: file.path, line: index + 1 });
        }
      });
    }

    return {
      id: 'code_no_console',
      name: 'No Console.log in Production',
      category: 'code_quality',
      status: consoleLogs.length === 0 ? 'passed' : 'warning',
      message:
        consoleLogs.length === 0
          ? 'No console.log statements found'
          : `${consoleLogs.length} console.log statement(s) found`,
      details: { locations: consoleLogs.slice(0, 10) },
      required: false,
    };
  }

  private checkReadme(files: PackageFiles): CheckResult {
    const hasReadme = !!files.readme && files.readme.trim().length > 0;
    const readmeLength = files.readme?.length || 0;
    const hasMinContent = readmeLength >= 200;

    return {
      id: 'doc_readme',
      name: 'README Exists',
      category: 'documentation',
      status: hasReadme && hasMinContent ? 'passed' : hasReadme ? 'warning' : 'failed',
      message: hasReadme
        ? hasMinContent
          ? 'README exists with sufficient content'
          : 'README exists but is too short'
        : 'README not found',
      details: { readmeLength },
      required: true,
    };
  }

  private checkReadmeExamples(files: PackageFiles): CheckResult {
    const readme = files.readme || '';
    const hasCodeBlocks = /```[\s\S]*?```/.test(readme);
    const codeBlockCount = (readme.match(/```/g) || []).length / 2;

    return {
      id: 'doc_examples',
      name: 'README Has Examples',
      category: 'documentation',
      status: hasCodeBlocks && codeBlockCount >= 1 ? 'passed' : 'warning',
      message: hasCodeBlocks
        ? `Found ${codeBlockCount} code example(s)`
        : 'No code examples found in README',
      details: { codeBlockCount },
      required: false,
    };
  }

  private checkChangelog(files: PackageFiles): CheckResult {
    const hasChangelog = !!files.changelog && files.changelog.trim().length > 0;

    if (!this.config.requireChangelog) {
      return {
        id: 'doc_changelog',
        name: 'Changelog Maintained',
        category: 'documentation',
        status: hasChangelog ? 'passed' : 'skipped',
        message: hasChangelog ? 'Changelog exists' : 'Changelog not required',
        required: false,
      };
    }

    return {
      id: 'doc_changelog',
      name: 'Changelog Maintained',
      category: 'documentation',
      status: hasChangelog ? 'passed' : 'failed',
      message: hasChangelog ? 'Changelog exists' : 'Changelog not found',
      required: true,
    };
  }

  private checkLicense(files: PackageFiles): CheckResult {
    const hasLicense = !!files.license && files.license.trim().length > 0;
    const manifestLicense = files.manifest.license;

    const isAllowedLicense =
      manifestLicense && this.config.allowedLicenses.includes(manifestLicense);

    return {
      id: 'doc_license',
      name: 'License Clear',
      category: 'documentation',
      status: hasLicense && isAllowedLicense ? 'passed' : hasLicense ? 'warning' : 'failed',
      message: hasLicense
        ? isAllowedLicense
          ? `License: ${manifestLicense}`
          : `License ${manifestLicense} not in allowed list`
        : 'LICENSE file not found',
      details: { license: manifestLicense, allowed: this.config.allowedLicenses },
      required: true,
    };
  }

  private checkDescription(files: PackageFiles): CheckResult {
    const description = files.manifest.description || '';
    const hasDescription = description.length >= 20;

    return {
      id: 'doc_description',
      name: 'Package Description',
      category: 'documentation',
      status: hasDescription ? 'passed' : 'warning',
      message: hasDescription
        ? 'Package has description'
        : 'Package description missing or too short',
      details: { descriptionLength: description.length },
      required: false,
    };
  }

  private checkVulnerabilities(files: PackageFiles): CheckResult {
    // Simulate vulnerability check - in production, use npm audit or similar
    const knownVulnerableDeps: string[] = [];

    const deps = {
      ...files.manifest.dependencies,
      ...files.manifest.devDependencies,
    };

    // Check against known vulnerable patterns (simplified)
    const vulnerablePatterns = ['lodash@<4.17.21', 'minimist@<1.2.6'];
    for (const [name, version] of Object.entries(deps || {})) {
      for (const pattern of vulnerablePatterns) {
        if (pattern.startsWith(name)) {
          knownVulnerableDeps.push(`${name}@${version}`);
        }
      }
    }

    return {
      id: 'security_vulnerabilities',
      name: 'No Known Vulnerabilities',
      category: 'security',
      status: knownVulnerableDeps.length === 0 ? 'passed' : 'failed',
      message:
        knownVulnerableDeps.length === 0
          ? 'No known vulnerabilities detected'
          : `${knownVulnerableDeps.length} vulnerable dependency(s) found`,
      details: { vulnerableDeps: knownVulnerableDeps },
      required: true,
    };
  }

  private checkNetworkCalls(files: PackageFiles): CheckResult {
    const suspiciousPatterns = [
      /fetch\s*\(\s*['"`]http:\/\//,
      /XMLHttpRequest/,
      /\.ajax\s*\(/,
      /new\s+WebSocket\s*\(\s*['"`]ws:\/\//,
    ];

    const suspiciousCalls: Array<{ file: string; pattern: string }> = [];

    for (const file of files.sourceFiles) {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(file.content)) {
          suspiciousCalls.push({ file: file.path, pattern: pattern.toString() });
        }
      }
    }

    return {
      id: 'security_network',
      name: 'No Suspicious Network Calls',
      category: 'security',
      status: suspiciousCalls.length === 0 ? 'passed' : 'warning',
      message:
        suspiciousCalls.length === 0
          ? 'No suspicious network calls detected'
          : `${suspiciousCalls.length} potentially unsafe network call(s) found`,
      details: { suspiciousCalls: suspiciousCalls.slice(0, 5) },
      required: false,
    };
  }

  private checkDependencyTree(files: PackageFiles): CheckResult {
    const deps = files.manifest.dependencies || {};
    const depCount = Object.keys(deps).length;
    const maxDeps = 50;

    return {
      id: 'security_deps',
      name: 'Safe Dependency Tree',
      category: 'security',
      status: depCount <= maxDeps ? 'passed' : 'warning',
      message:
        depCount <= maxDeps
          ? `${depCount} direct dependencies`
          : `High dependency count: ${depCount} (recommended: <${maxDeps})`,
      details: { depCount, maxDeps },
      required: false,
    };
  }

  private checkDangerousPatterns(files: PackageFiles): CheckResult {
    const dangerousPatterns = [
      { pattern: /\beval\s*\(/, name: 'eval()' },
      { pattern: /new\s+Function\s*\(/, name: 'new Function()' },
      { pattern: /document\.write\s*\(/, name: 'document.write()' },
      { pattern: /innerHTML\s*=/, name: 'innerHTML assignment' },
    ];

    const found: Array<{ file: string; pattern: string; line: number }> = [];

    for (const file of files.sourceFiles) {
      const lines = file.content.split('\n');
      for (const { pattern, name } of dangerousPatterns) {
        lines.forEach((line, index) => {
          if (pattern.test(line) && !line.trim().startsWith('//')) {
            found.push({ file: file.path, pattern: name, line: index + 1 });
          }
        });
      }
    }

    return {
      id: 'security_patterns',
      name: 'No Dangerous Patterns',
      category: 'security',
      status: found.length === 0 ? 'passed' : 'failed',
      message:
        found.length === 0
          ? 'No dangerous code patterns detected'
          : `${found.length} dangerous pattern(s) found`,
      details: { patterns: found.slice(0, 10) },
      required: true,
    };
  }

  private checkSemver(files: PackageFiles): CheckResult {
    const version = files.manifest.version;
    const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?(\+[\w.]+)?$/;
    const isValidSemver = semverRegex.test(version);

    return {
      id: 'maint_semver',
      name: 'Semantic Versioning',
      category: 'maintenance',
      status: isValidSemver ? 'passed' : 'failed',
      message: isValidSemver
        ? `Version ${version} follows semver`
        : `Version ${version} does not follow semver`,
      details: { version },
      required: true,
    };
  }

  private checkRepository(files: PackageFiles): CheckResult {
    const repo = files.manifest.repository;
    const hasRepo = !!repo;
    const repoUrl = typeof repo === 'string' ? repo : repo?.url;

    return {
      id: 'maint_repository',
      name: 'Repository Link',
      category: 'maintenance',
      status: hasRepo ? 'passed' : 'warning',
      message: hasRepo ? `Repository: ${repoUrl}` : 'No repository link in package.json',
      details: { repository: repoUrl },
      required: false,
    };
  }

  private checkAuthor(files: PackageFiles): CheckResult {
    const author = files.manifest.author;
    const hasAuthor = !!author;
    const authorName = typeof author === 'string' ? author : author?.name;

    return {
      id: 'maint_author',
      name: 'Author Information',
      category: 'maintenance',
      status: hasAuthor ? 'passed' : 'warning',
      message: hasAuthor ? `Author: ${authorName}` : 'No author information',
      details: { author: authorName },
      required: false,
    };
  }

  // Helper methods

  private calculateSummary(checks: CheckResult[]): CertificationResult['summary'] {
    return {
      passed: checks.filter((c) => c.status === 'passed').length,
      failed: checks.filter((c) => c.status === 'failed').length,
      warnings: checks.filter((c) => c.status === 'warning').length,
      skipped: checks.filter((c) => c.status === 'skipped').length,
    };
  }

  private calculateScore(checks: CheckResult[]): {
    score: number;
    maxScore: number;
    grade: CertificationResult['grade'];
  } {
    let score = 0;
    let maxScore = 0;

    for (const check of checks) {
      if (check.status === 'skipped') continue;

      const weight = check.required ? 10 : 5;
      maxScore += weight;

      if (check.status === 'passed') {
        score += weight;
      } else if (check.status === 'warning') {
        score += weight * 0.5;
      }
    }

    const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;
    const grade: CertificationResult['grade'] =
      percentage >= 90
        ? 'A'
        : percentage >= 80
          ? 'B'
          : percentage >= 70
            ? 'C'
            : percentage >= 60
              ? 'D'
              : 'F';

    return { score, maxScore, grade };
  }

  private isCertified(checks: CheckResult[], grade: CertificationResult['grade']): boolean {
    // Must pass all required checks and have grade B or better
    const requiredPassed = checks
      .filter((c) => c.required)
      .every((c) => c.status === 'passed' || c.status === 'warning');

    return requiredPassed && (grade === 'A' || grade === 'B');
  }

  private generateCertificateId(manifest: PackageManifest): string {
    const timestamp = Date.now();
    const hash = this.simpleHash(`${manifest.name}:${manifest.version}:${timestamp}`);
    return `CERT-${hash.toUpperCase()}`;
  }

  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36).substring(0, 8);
  }

  private calculateExpiryDate(): string {
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    return expiry.toISOString();
  }
}

/**
 * Create a certification checker instance
 */
export function createCertificationChecker(
  config?: Partial<CertificationConfig>
): CertificationChecker {
  return new CertificationChecker(config);
}
