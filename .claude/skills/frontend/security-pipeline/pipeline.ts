/**
 * Security Pipeline Integration
 *
 * Orchestrates the three security modules into a unified pipeline
 * that runs during component generation:
 *
 * 1. Security Scanner  - Detect XSS, eval, secrets, injection vectors
 * 2. CSP Enforcer      - Validate CSP compliance and generate headers
 * 3. Baseline Snapshots - Lock and verify immutable test baselines
 *
 * Usage:
 *   const pipeline = new SecurityPipeline(config);
 *   const report = await pipeline.run(componentSource, filePath);
 *   if (!report.passed) { ... }
 */

import {
  scanComponentSource,
  formatScanReport,
  type ScanResult,
  type ScannerConfig,
} from '../security-scanner/component-security-scanner';

import {
  auditCSPCompliance,
  formatCSPReport,
  type CSPAuditResult,
  type EnforcerConfig,
} from '../csp-enforcer/csp-enforcer';

import {
  BaselineManager,
  createComponentSnapshotSync,
  type ComponentSnapshot,
  type BaselineDiff,
  type PropContract,
  type EventSignature,
  type AccessibilityNode,
} from '../test-baselines/immutable-snapshot';

// ============================================================================
// Types
// ============================================================================

export interface PipelineConfig {
  /** Security scanner configuration */
  scanner: Partial<ScannerConfig>;
  /** CSP enforcer configuration */
  csp: Partial<EnforcerConfig>;
  /** Whether to enforce baseline verification (requires locked baselines) */
  enforceBaselines: boolean;
  /** Directory for baseline storage */
  baselineDir: string;
  /** Halt pipeline on first failure */
  failFast: boolean;
  /** Generate combined report */
  generateReport: boolean;
}

export interface PipelineReport {
  /** Overall pass/fail */
  passed: boolean;
  /** Component file path */
  filePath: string;
  /** Security scan results */
  securityScan: ScanResult;
  /** CSP audit results */
  cspAudit: CSPAuditResult;
  /** Baseline verification (if baselines exist) */
  baselineVerification: BaselineDiff | null;
  /** Combined human-readable report */
  report: string;
  /** Pipeline execution time in ms */
  totalDurationMs: number;
  /** Timestamp */
  timestamp: string;
}

export interface BatchPipelineReport {
  /** Overall pass/fail for all components */
  passed: boolean;
  /** Individual component reports */
  components: PipelineReport[];
  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    securityFindings: number;
    cspViolations: number;
    baselineFailures: number;
  };
  /** Combined report */
  report: string;
  /** Timestamp */
  timestamp: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  scanner: {},
  csp: {},
  enforceBaselines: false,
  baselineDir: '.test-baselines',
  failFast: false,
  generateReport: true,
};

// ============================================================================
// Security Pipeline
// ============================================================================

export class SecurityPipeline {
  private config: PipelineConfig;
  private baselineManager: BaselineManager;

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
    this.baselineManager = new BaselineManager(this.config.baselineDir);
  }

  /**
   * Run the full security pipeline on a single component.
   */
  async run(
    source: string,
    filePath: string,
    baselineContext?: {
      propContract: PropContract;
      eventSignatures: EventSignature[];
      accessibilityTree: AccessibilityNode;
    },
  ): Promise<PipelineReport> {
    const startTime = performance.now();
    const timestamp = new Date().toISOString();

    // Phase 1: Security Scan
    const securityScan = scanComponentSource(source, filePath, this.config.scanner);

    if (this.config.failFast && !securityScan.passed) {
      return this.buildReport(filePath, securityScan, this.emptyCSPResult(filePath), null, startTime, timestamp);
    }

    // Phase 2: CSP Audit
    const cspAudit = auditCSPCompliance(source, filePath, this.config.csp);

    if (this.config.failFast && !cspAudit.compliant) {
      return this.buildReport(filePath, securityScan, cspAudit, null, startTime, timestamp);
    }

    // Phase 3: Baseline Verification (optional)
    let baselineVerification: BaselineDiff | null = null;
    if (this.config.enforceBaselines && baselineContext) {
      const currentSnapshot = createComponentSnapshotSync(
        this.extractComponentName(filePath),
        this.detectFramework(source, filePath),
        source,
        baselineContext.propContract,
        baselineContext.eventSignatures,
        baselineContext.accessibilityTree,
      );

      const componentName = this.extractComponentName(filePath);
      const existingBaseline = this.baselineManager.getBaseline(componentName);

      if (existingBaseline) {
        baselineVerification = this.baselineManager.verifyBaseline(componentName, currentSnapshot);
      }
    }

    return this.buildReport(filePath, securityScan, cspAudit, baselineVerification, startTime, timestamp);
  }

  /**
   * Run the pipeline on multiple components in batch.
   */
  async runBatch(
    components: Array<{
      source: string;
      filePath: string;
      baselineContext?: {
        propContract: PropContract;
        eventSignatures: EventSignature[];
        accessibilityTree: AccessibilityNode;
      };
    }>,
  ): Promise<BatchPipelineReport> {
    const reports: PipelineReport[] = [];

    for (const comp of components) {
      const report = await this.run(comp.source, comp.filePath, comp.baselineContext);
      reports.push(report);

      if (this.config.failFast && !report.passed) {
        break;
      }
    }

    const passed = reports.every((r) => r.passed);
    const summary = {
      total: reports.length,
      passed: reports.filter((r) => r.passed).length,
      failed: reports.filter((r) => !r.passed).length,
      securityFindings: reports.reduce((sum, r) => sum + r.securityScan.findings.length, 0),
      cspViolations: reports.reduce((sum, r) => sum + r.cspAudit.violations.length, 0),
      baselineFailures: reports.filter(
        (r) => r.baselineVerification && !r.baselineVerification.matches,
      ).length,
    };

    const combinedReport = this.config.generateReport
      ? this.formatBatchReport(reports, summary)
      : '';

    return {
      passed,
      components: reports,
      summary,
      report: combinedReport,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get the baseline manager for direct baseline operations.
   */
  getBaselineManager(): BaselineManager {
    return this.baselineManager;
  }

  /**
   * Import baselines from a manifest JSON.
   */
  async importBaselines(manifestJson: string): Promise<void> {
    await this.baselineManager.importManifest(manifestJson);
  }

  /**
   * Export baselines as a manifest JSON.
   */
  exportBaselines(): string {
    return this.baselineManager.exportManifest();
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private buildReport(
    filePath: string,
    securityScan: ScanResult,
    cspAudit: CSPAuditResult,
    baselineVerification: BaselineDiff | null,
    startTime: number,
    timestamp: string,
  ): PipelineReport {
    const passed =
      securityScan.passed &&
      cspAudit.compliant &&
      (baselineVerification === null || baselineVerification.matches);

    const report = this.config.generateReport
      ? this.formatSingleReport(filePath, securityScan, cspAudit, baselineVerification, passed)
      : '';

    return {
      passed,
      filePath,
      securityScan,
      cspAudit,
      baselineVerification,
      report,
      totalDurationMs: Math.round(performance.now() - startTime),
      timestamp,
    };
  }

  private emptyCSPResult(filePath: string): CSPAuditResult {
    return {
      filePath,
      violations: [],
      summary: { critical: 0, high: 0, medium: 0, low: 0 },
      compliant: true,
      generatedCSP: '',
      nonces: [],
      recommendedPolicy: { directives: {} as any },
      timestamp: new Date().toISOString(),
      durationMs: 0,
    };
  }

  private extractComponentName(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/');
    const fileName = parts[parts.length - 1] || 'Unknown';
    return fileName.replace(/\.(tsx?|jsx?|vue|component\.ts)$/, '');
  }

  private detectFramework(source: string, filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'vue') return 'vue';
    if (source.includes('@Component') || source.includes('@NgModule')) return 'angular';
    if (source.includes("from 'react'") || source.includes('from "react"') || ext === 'tsx' || ext === 'jsx') return 'react';
    return 'unknown';
  }

  private formatSingleReport(
    filePath: string,
    securityScan: ScanResult,
    cspAudit: CSPAuditResult,
    baselineVerification: BaselineDiff | null,
    passed: boolean,
  ): string {
    const lines: string[] = [];
    lines.push('================================================================');
    lines.push('  SECURITY PIPELINE REPORT');
    lines.push('================================================================');
    lines.push('');
    lines.push(`File:    ${filePath}`);
    lines.push(`Status:  ${passed ? 'PASSED' : 'FAILED'}`);
    lines.push('');

    // Security Scan Summary
    lines.push('--- Security Scan ---');
    lines.push(`  Status:   ${securityScan.passed ? 'PASS' : 'FAIL'}`);
    lines.push(`  Findings: ${securityScan.findings.length}`);
    if (securityScan.findings.length > 0) {
      lines.push(`  Critical: ${securityScan.summary.critical}`);
      lines.push(`  High:     ${securityScan.summary.high}`);
      lines.push(`  Medium:   ${securityScan.summary.medium}`);
      lines.push(`  Low:      ${securityScan.summary.low}`);
    }
    lines.push('');

    // CSP Audit Summary
    lines.push('--- CSP Compliance ---');
    lines.push(`  Status:     ${cspAudit.compliant ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
    lines.push(`  Violations: ${cspAudit.violations.length}`);
    if (cspAudit.generatedCSP) {
      lines.push(`  CSP Header: ${cspAudit.generatedCSP.slice(0, 80)}...`);
    }
    lines.push('');

    // Baseline Verification Summary
    if (baselineVerification) {
      lines.push('--- Baseline Verification ---');
      lines.push(`  Status:  ${baselineVerification.matches ? 'MATCHED' : 'MISMATCH'}`);
      lines.push(`  Summary: ${baselineVerification.summary}`);
      lines.push('');
    }

    lines.push('================================================================');
    return lines.join('\n');
  }

  private formatBatchReport(
    reports: PipelineReport[],
    summary: BatchPipelineReport['summary'],
  ): string {
    const lines: string[] = [];
    lines.push('================================================================');
    lines.push('  SECURITY PIPELINE BATCH REPORT');
    lines.push('================================================================');
    lines.push('');
    lines.push(`Total Components:    ${summary.total}`);
    lines.push(`Passed:              ${summary.passed}`);
    lines.push(`Failed:              ${summary.failed}`);
    lines.push(`Security Findings:   ${summary.securityFindings}`);
    lines.push(`CSP Violations:      ${summary.cspViolations}`);
    lines.push(`Baseline Failures:   ${summary.baselineFailures}`);
    lines.push('');

    for (const report of reports) {
      const icon = report.passed ? '[PASS]' : '[FAIL]';
      const details: string[] = [];
      if (report.securityScan.findings.length > 0)
        details.push(`${report.securityScan.findings.length} security`);
      if (report.cspAudit.violations.length > 0)
        details.push(`${report.cspAudit.violations.length} CSP`);
      if (report.baselineVerification && !report.baselineVerification.matches)
        details.push('baseline mismatch');

      lines.push(`  ${icon} ${report.filePath}${details.length > 0 ? ' (' + details.join(', ') + ')' : ''}`);
    }

    lines.push('');
    lines.push('================================================================');
    lines.push(`  Pipeline completed at ${new Date().toISOString()}`);
    lines.push('================================================================');
    return lines.join('\n');
  }
}
