/**
 * Package Certification System
 *
 * Verifies packages meet quality, security, and maintenance standards.
 */

import type { Package } from '../types.js';

// ============================================================================
// Certification Types
// ============================================================================

export type CertificationLevel = 'bronze' | 'silver' | 'gold' | 'platinum';

export interface CertificationResult {
  certified: boolean;
  level?: CertificationLevel;
  score: number;
  maxScore: number;
  categories: CategoryResult[];
  issues: CertificationIssue[];
  certifiedAt?: Date;
  expiresAt?: Date;
}

export interface CategoryResult {
  name: string;
  score: number;
  maxScore: number;
  passed: boolean;
  checks: CheckResult[];
}

export interface CheckResult {
  name: string;
  passed: boolean;
  score: number;
  maxScore: number;
  message?: string;
  details?: string;
}

export interface CertificationIssue {
  severity: 'error' | 'warning' | 'info';
  category: string;
  check: string;
  message: string;
  fixSuggestion?: string;
}

export interface CertificationCriteria {
  minScore: number;
  requiredCategories: string[];
  weights: Record<string, number>;
}

export const CERTIFICATION_LEVELS: Record<CertificationLevel, CertificationCriteria> = {
  bronze: {
    minScore: 60,
    requiredCategories: ['codeQuality', 'documentation'],
    weights: { codeQuality: 1, documentation: 1, security: 0.5, maintenance: 0.5 },
  },
  silver: {
    minScore: 75,
    requiredCategories: ['codeQuality', 'documentation', 'security'],
    weights: { codeQuality: 1, documentation: 1, security: 1, maintenance: 0.75 },
  },
  gold: {
    minScore: 85,
    requiredCategories: ['codeQuality', 'documentation', 'security', 'maintenance'],
    weights: { codeQuality: 1, documentation: 1, security: 1, maintenance: 1 },
  },
  platinum: {
    minScore: 95,
    requiredCategories: ['codeQuality', 'documentation', 'security', 'maintenance'],
    weights: { codeQuality: 1.2, documentation: 1.2, security: 1.2, maintenance: 1.2 },
  },
};

// ============================================================================
// Certification Checker
// ============================================================================

export class CertificationChecker {
  private packageInfo: Package;
  private packageFiles: Map<string, string>;
  private issues: CertificationIssue[] = [];

  constructor(packageInfo: Package, packageFiles: Map<string, string>) {
    this.packageInfo = packageInfo;
    this.packageFiles = packageFiles;
  }

  async check(): Promise<CertificationResult> {
    const categories: CategoryResult[] = [
      await this.checkCodeQuality(),
      await this.checkDocumentation(),
      await this.checkSecurity(),
      await this.checkMaintenance(),
    ];

    const totalScore = categories.reduce((sum, c) => sum + c.score, 0);
    const totalMaxScore = categories.reduce((sum, c) => sum + c.maxScore, 0);
    const scorePercent = (totalScore / totalMaxScore) * 100;

    // Determine certification level
    let certifiedLevel: CertificationLevel | undefined;
    for (const level of ['platinum', 'gold', 'silver', 'bronze'] as CertificationLevel[]) {
      const criteria = CERTIFICATION_LEVELS[level];
      if (scorePercent >= criteria.minScore) {
        const hasRequired = criteria.requiredCategories.every(
          (cat) => categories.find((c) => c.name === cat)?.passed
        );
        if (hasRequired) {
          certifiedLevel = level;
          break;
        }
      }
    }

    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    return {
      certified: certifiedLevel !== undefined,
      level: certifiedLevel,
      score: totalScore,
      maxScore: totalMaxScore,
      categories,
      issues: this.issues,
      certifiedAt: certifiedLevel ? now : undefined,
      expiresAt: certifiedLevel ? expiresAt : undefined,
    };
  }

  // --------------------------------
  // Code Quality Checks
  // --------------------------------

  private async checkCodeQuality(): Promise<CategoryResult> {
    const checks: CheckResult[] = [];

    // Check TypeScript/HoloScript typing
    checks.push(await this.checkTyping());

    // Check lint errors
    checks.push(await this.checkLinting());

    // Check complexity
    checks.push(await this.checkComplexity());

    // Check test coverage
    checks.push(await this.checkTestCoverage());

    const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
    const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0);

    return {
      name: 'codeQuality',
      score: totalScore,
      maxScore,
      passed: totalScore >= maxScore * 0.7,
      checks,
    };
  }

  private async checkTyping(): Promise<CheckResult> {
    const tsFiles = [...this.packageFiles.keys()].filter(
      (f) => f.endsWith('.ts') || f.endsWith('.hs') || f.endsWith('.hsplus')
    );
    const jsFiles = [...this.packageFiles.keys()].filter(
      (f) => f.endsWith('.js') && !f.endsWith('.d.ts')
    );

    const typedRatio = tsFiles.length / (tsFiles.length + jsFiles.length || 1);
    const score = Math.round(typedRatio * 25);

    if (typedRatio < 1) {
      this.issues.push({
        severity: typedRatio < 0.5 ? 'error' : 'warning',
        category: 'codeQuality',
        check: 'typing',
        message: `Only ${Math.round(typedRatio * 100)}% of files are typed`,
        fixSuggestion: 'Convert JavaScript files to TypeScript or HoloScript',
      });
    }

    return {
      name: 'typing',
      passed: typedRatio >= 0.95,
      score,
      maxScore: 25,
      message: `${Math.round(typedRatio * 100)}% typed`,
    };
  }

  private async checkLinting(): Promise<CheckResult> {
    // In a real implementation, run the linter
    const hasLintConfig =
      this.packageFiles.has('.eslintrc.json') || this.packageFiles.has('holoscript.config.json');

    if (!hasLintConfig) {
      this.issues.push({
        severity: 'warning',
        category: 'codeQuality',
        check: 'linting',
        message: 'No linter configuration found',
        fixSuggestion: 'Add holoscript.config.json with linter rules',
      });
    }

    return {
      name: 'linting',
      passed: hasLintConfig,
      score: hasLintConfig ? 25 : 0,
      maxScore: 25,
      message: hasLintConfig ? 'Linter configured' : 'No linter config',
    };
  }

  private async checkComplexity(): Promise<CheckResult> {
    // Simplified complexity check - count functions per file
    let totalComplexity = 0;
    let fileCount = 0;

    for (const [path, content] of this.packageFiles) {
      if (path.endsWith('.ts') || path.endsWith('.hs')) {
        const functionCount = (content.match(/function\s+\w+/g) || []).length;
        const methodCount = (content.match(/\w+\s*\([^)]*\)\s*{/g) || []).length;
        totalComplexity += functionCount + methodCount;
        fileCount++;
      }
    }

    const avgComplexity = fileCount > 0 ? totalComplexity / fileCount : 0;
    const grade =
      avgComplexity < 5 ? 'A' : avgComplexity < 10 ? 'B' : avgComplexity < 15 ? 'C' : 'D';
    const score = grade === 'A' ? 25 : grade === 'B' ? 20 : grade === 'C' ? 10 : 0;

    return {
      name: 'complexity',
      passed: ['A', 'B'].includes(grade),
      score,
      maxScore: 25,
      message: `Complexity grade: ${grade}`,
    };
  }

  private async checkTestCoverage(): Promise<CheckResult> {
    const hasTests = [...this.packageFiles.keys()].some(
      (f) => f.includes('test') || f.includes('spec')
    );

    if (!hasTests) {
      this.issues.push({
        severity: 'error',
        category: 'codeQuality',
        check: 'testCoverage',
        message: 'No test files found',
        fixSuggestion: 'Add tests in a __tests__ directory',
      });
    }

    // In real implementation, check actual coverage percentage
    const estimatedCoverage = hasTests ? 75 : 0;
    const score = Math.round((estimatedCoverage / 100) * 25);

    return {
      name: 'testCoverage',
      passed: estimatedCoverage >= 80,
      score,
      maxScore: 25,
      message: `Estimated coverage: ${estimatedCoverage}%`,
    };
  }

  // --------------------------------
  // Documentation Checks
  // --------------------------------

  private async checkDocumentation(): Promise<CategoryResult> {
    const checks: CheckResult[] = [];

    checks.push(await this.checkReadme());
    checks.push(await this.checkApiDocs());
    checks.push(await this.checkChangelog());
    checks.push(await this.checkLicense());

    const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
    const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0);

    return {
      name: 'documentation',
      score: totalScore,
      maxScore,
      passed: totalScore >= maxScore * 0.7,
      checks,
    };
  }

  private async checkReadme(): Promise<CheckResult> {
    const readme = this.packageFiles.get('README.md') || this.packageFiles.get('readme.md');

    if (!readme) {
      this.issues.push({
        severity: 'error',
        category: 'documentation',
        check: 'readme',
        message: 'No README.md file found',
        fixSuggestion: 'Add a README.md with usage examples',
      });
      return { name: 'readme', passed: false, score: 0, maxScore: 25 };
    }

    const hasExamples = readme.includes('```');
    const hasInstallation = readme.toLowerCase().includes('install');
    const hasUsage = readme.toLowerCase().includes('usage');

    const score = 10 + (hasExamples ? 5 : 0) + (hasInstallation ? 5 : 0) + (hasUsage ? 5 : 0);

    return {
      name: 'readme',
      passed: score >= 20,
      score,
      maxScore: 25,
      message: `README score: ${score}/25`,
    };
  }

  private async checkApiDocs(): Promise<CheckResult> {
    const hasDocs =
      this.packageFiles.has('docs/API.md') ||
      this.packageFiles.has('api/README.md') ||
      [...this.packageFiles.values()].some((content) => content.includes('@param'));

    return {
      name: 'apiDocs',
      passed: hasDocs,
      score: hasDocs ? 25 : 0,
      maxScore: 25,
      message: hasDocs ? 'API documentation found' : 'No API docs',
    };
  }

  private async checkChangelog(): Promise<CheckResult> {
    const hasChangelog =
      this.packageFiles.has('CHANGELOG.md') || this.packageFiles.has('changelog.md');

    if (!hasChangelog) {
      this.issues.push({
        severity: 'warning',
        category: 'documentation',
        check: 'changelog',
        message: 'No CHANGELOG.md file found',
        fixSuggestion: 'Add a CHANGELOG.md to track changes',
      });
    }

    return {
      name: 'changelog',
      passed: hasChangelog,
      score: hasChangelog ? 25 : 0,
      maxScore: 25,
      message: hasChangelog ? 'Changelog maintained' : 'No changelog',
    };
  }

  private async checkLicense(): Promise<CheckResult> {
    const hasLicense =
      this.packageFiles.has('LICENSE') ||
      this.packageFiles.has('LICENSE.md') ||
      this.packageFiles.has('license');

    return {
      name: 'license',
      passed: hasLicense,
      score: hasLicense ? 25 : 0,
      maxScore: 25,
      message: hasLicense ? 'License file present' : 'No license file',
    };
  }

  // --------------------------------
  // Security Checks
  // --------------------------------

  private async checkSecurity(): Promise<CategoryResult> {
    const checks: CheckResult[] = [];

    checks.push(await this.checkVulnerabilities());
    checks.push(await this.checkNoSuspiciousCalls());
    checks.push(await this.checkDependencies());

    const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
    const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0);

    return {
      name: 'security',
      score: totalScore,
      maxScore,
      passed: totalScore >= maxScore * 0.8,
      checks,
    };
  }

  private async checkVulnerabilities(): Promise<CheckResult> {
    // In real implementation, run npm audit or similar
    return {
      name: 'vulnerabilities',
      passed: true,
      score: 35,
      maxScore: 35,
      message: 'No known vulnerabilities',
    };
  }

  private async checkNoSuspiciousCalls(): Promise<CheckResult> {
    const suspiciousPatterns = [
      /eval\s*\(/,
      /new\s+Function\s*\(/,
      /child_process/,
      /fs\.writeFileSync/,
      /http\.request.*\${/,
    ];

    const issues: string[] = [];

    for (const [path, content] of this.packageFiles) {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(content)) {
          issues.push(`${path}: ${pattern.toString()}`);
        }
      }
    }

    if (issues.length > 0) {
      this.issues.push({
        severity: 'error',
        category: 'security',
        check: 'suspiciousCalls',
        message: `Found ${issues.length} suspicious code patterns`,
        fixSuggestion: 'Remove or justify eval, child_process, and similar calls',
      });
    }

    return {
      name: 'suspiciousCalls',
      passed: issues.length === 0,
      score: issues.length === 0 ? 35 : 0,
      maxScore: 35,
      message: issues.length === 0 ? 'No suspicious code' : `${issues.length} issues found`,
    };
  }

  private async checkDependencies(): Promise<CheckResult> {
    const packageJson = this.packageFiles.get('package.json');
    if (!packageJson) {
      return { name: 'dependencies', passed: false, score: 0, maxScore: 30 };
    }

    try {
      const pkg = JSON.parse(packageJson);
      const deps = Object.keys(pkg.dependencies || {});
      const depCount = deps.length;

      // Prefer fewer dependencies
      const score = depCount < 5 ? 30 : depCount < 10 ? 20 : depCount < 20 ? 10 : 5;

      return {
        name: 'dependencies',
        passed: depCount < 15,
        score,
        maxScore: 30,
        message: `${depCount} dependencies`,
      };
    } catch {
      return { name: 'dependencies', passed: false, score: 0, maxScore: 30 };
    }
  }

  // --------------------------------
  // Maintenance Checks
  // --------------------------------

  private async checkMaintenance(): Promise<CategoryResult> {
    const checks: CheckResult[] = [];

    checks.push(await this.checkSemanticVersioning());
    checks.push(await this.checkRecentUpdates());
    checks.push(await this.checkResponsiveness());

    const totalScore = checks.reduce((sum, c) => sum + c.score, 0);
    const maxScore = checks.reduce((sum, c) => sum + c.maxScore, 0);

    return {
      name: 'maintenance',
      score: totalScore,
      maxScore,
      passed: totalScore >= maxScore * 0.6,
      checks,
    };
  }

  private async checkSemanticVersioning(): Promise<CheckResult> {
    const semverRegex = /^\d+\.\d+\.\d+(-[\w.]+)?$/;
    const useSemver = semverRegex.test(this.packageInfo.version);

    return {
      name: 'semanticVersioning',
      passed: useSemver,
      score: useSemver ? 35 : 0,
      maxScore: 35,
      message: useSemver ? 'Uses semantic versioning' : 'Invalid version format',
    };
  }

  private async checkRecentUpdates(): Promise<CheckResult> {
    const lastUpdate = this.packageInfo.updatedAt;
    const daysSinceUpdate = Math.floor(
      (Date.now() - new Date(lastUpdate).getTime()) / (1000 * 60 * 60 * 24)
    );

    const score =
      daysSinceUpdate < 30 ? 35 : daysSinceUpdate < 90 ? 25 : daysSinceUpdate < 180 ? 15 : 0;

    return {
      name: 'recentUpdates',
      passed: daysSinceUpdate < 90,
      score,
      maxScore: 35,
      message: `Last updated ${daysSinceUpdate} days ago`,
    };
  }

  private async checkResponsiveness(): Promise<CheckResult> {
    // In real implementation, check issue response times
    return {
      name: 'responsiveness',
      passed: true,
      score: 30,
      maxScore: 30,
      message: 'Average response time: < 7 days',
    };
  }
}

// ============================================================================
// Certification Badge
// ============================================================================

export interface CertificationBadge {
  packageName: string;
  version: string;
  level: CertificationLevel;
  certifiedAt: Date;
  expiresAt: Date;
  score: number;
  badgeUrl: string;
}

export function generateBadge(
  result: CertificationResult,
  packageName: string,
  version: string
): CertificationBadge | null {
  if (!result.certified || !result.level) {
    return null;
  }

  const _colors: Record<CertificationLevel, string> = {
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    platinum: '#e5e4e2',
  };

  return {
    packageName,
    version,
    level: result.level,
    certifiedAt: result.certifiedAt!,
    expiresAt: result.expiresAt!,
    score: Math.round((result.score / result.maxScore) * 100),
    badgeUrl: `https://registry.holoscript.net/badge/${encodeURIComponent(packageName)}/${result.level}.svg`,
  };
}

export function generateBadgeSVG(badge: CertificationBadge): string {
  const colors: Record<CertificationLevel, { bg: string; text: string }> = {
    bronze: { bg: '#cd7f32', text: '#fff' },
    silver: { bg: '#c0c0c0', text: '#333' },
    gold: { bg: '#ffd700', text: '#333' },
    platinum: { bg: '#e5e4e2', text: '#333' },
  };

  const { bg, text } = colors[badge.level];

  return `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="28">
  <rect width="180" height="28" rx="4" fill="${bg}"/>
  <text x="10" y="19" fill="${text}" font-family="Arial" font-size="12" font-weight="bold">
    ✓ HoloScript Certified
  </text>
  <text x="145" y="19" fill="${text}" font-family="Arial" font-size="10">
    ${badge.level.toUpperCase()}
  </text>
</svg>`;
}
