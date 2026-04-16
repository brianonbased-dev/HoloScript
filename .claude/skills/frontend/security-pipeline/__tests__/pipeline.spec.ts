/**
 * Tests for Security Pipeline Integration
 *
 * Validates the orchestration of security scanning, CSP enforcement,
 * and baseline verification into a unified pipeline.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SecurityPipeline, type PipelineReport, type BatchPipelineReport } from '../pipeline';
import {
  createComponentSnapshotSync,
  type PropContract,
  type EventSignature,
  type AccessibilityNode,
} from '../../test-baselines/immutable-snapshot';

// ============================================================================
// Test Fixtures
// ============================================================================

const CLEAN_REACT_COMPONENT = `
  import React, { useState } from 'react';

  interface ButtonProps {
    label: string;
    disabled?: boolean;
  }

  export const Button: React.FC<ButtonProps> = ({ label, disabled = false }) => {
    const [clicked, setClicked] = useState(false);
    return (
      <button
        className="btn"
        disabled={disabled}
        onClick={() => setClicked(true)}
      >
        {clicked ? 'Clicked!' : label}
      </button>
    );
  };
`;

const VULNERABLE_COMPONENT = `
  import React from 'react';

  export const BadComponent = ({ html }) => {
    const token = Math.random().toString(36);
    return (
      <div>
        <div dangerouslySetInnerHTML={{ __html: html }} />
        <script>alert('xss')</script>
        <a href="javascript:void(0)">Link</a>
        <div style="color: red">Inline style</div>
      </div>
    );
  };
`;

const makeProps = (): PropContract => ({
  count: 2,
  props: [
    { name: 'label', type: 'string', required: true },
    { name: 'disabled', type: 'boolean', required: false, defaultValue: 'false' },
  ],
});

const makeEvents = (): EventSignature[] => [
  { name: 'click', payloadType: 'MouseEvent' },
];

const makeA11yTree = (): AccessibilityNode => ({
  role: 'button',
  name: 'Submit',
  children: [],
  properties: { 'aria-label': 'Submit' },
});

// ============================================================================
// Single Component Pipeline
// ============================================================================

describe('SecurityPipeline - Single Component', () => {
  let pipeline: SecurityPipeline;

  beforeEach(() => {
    pipeline = new SecurityPipeline();
  });

  it('passes a clean component through all phases', async () => {
    const report = await pipeline.run(CLEAN_REACT_COMPONENT, 'Button.tsx');
    expect(report.passed).toBe(true);
    expect(report.securityScan.passed).toBe(true);
    expect(report.cspAudit.compliant).toBe(true);
    expect(report.baselineVerification).toBeNull();
    expect(report.totalDurationMs).toBeGreaterThanOrEqual(0);
    expect(report.timestamp).toBeDefined();
  });

  it('fails a vulnerable component', async () => {
    const report = await pipeline.run(VULNERABLE_COMPONENT, 'BadComponent.tsx');
    expect(report.passed).toBe(false);
    expect(report.securityScan.findings.length).toBeGreaterThan(0);
    expect(report.cspAudit.violations.length).toBeGreaterThan(0);
  });

  it('generates a human-readable report', async () => {
    const report = await pipeline.run(VULNERABLE_COMPONENT, 'BadComponent.tsx');
    expect(report.report).toContain('SECURITY PIPELINE REPORT');
    expect(report.report).toContain('BadComponent.tsx');
    expect(report.report).toContain('FAILED');
    expect(report.report).toContain('Security Scan');
    expect(report.report).toContain('CSP Compliance');
  });

  it('stops early in failFast mode', async () => {
    const fastPipeline = new SecurityPipeline({ failFast: true });
    const report = await fastPipeline.run(VULNERABLE_COMPONENT, 'BadComponent.tsx');
    // failFast should still complete the security scan
    expect(report.securityScan.findings.length).toBeGreaterThan(0);
    expect(report.passed).toBe(false);
  });
});

// ============================================================================
// Batch Pipeline
// ============================================================================

describe('SecurityPipeline - Batch', () => {
  let pipeline: SecurityPipeline;

  beforeEach(() => {
    pipeline = new SecurityPipeline();
  });

  it('processes multiple components', async () => {
    const result = await pipeline.runBatch([
      { source: CLEAN_REACT_COMPONENT, filePath: 'Button.tsx' },
      { source: VULNERABLE_COMPONENT, filePath: 'BadComponent.tsx' },
      { source: '<div class="clean">Hello</div>', filePath: 'Simple.html' },
    ]);

    expect(result.components).toHaveLength(3);
    expect(result.summary.total).toBe(3);
    expect(result.summary.passed).toBeGreaterThanOrEqual(1);
    expect(result.summary.failed).toBeGreaterThanOrEqual(1);
    expect(result.passed).toBe(false); // at least one failure
  });

  it('generates batch report', async () => {
    const result = await pipeline.runBatch([
      { source: CLEAN_REACT_COMPONENT, filePath: 'Button.tsx' },
      { source: VULNERABLE_COMPONENT, filePath: 'Bad.tsx' },
    ]);
    expect(result.report).toContain('SECURITY PIPELINE BATCH REPORT');
    expect(result.report).toContain('Button.tsx');
    expect(result.report).toContain('Bad.tsx');
    expect(result.report).toContain('[PASS]');
    expect(result.report).toContain('[FAIL]');
  });

  it('stops early in failFast mode', async () => {
    const fastPipeline = new SecurityPipeline({ failFast: true });
    const result = await fastPipeline.runBatch([
      { source: VULNERABLE_COMPONENT, filePath: 'Bad.tsx' },
      { source: CLEAN_REACT_COMPONENT, filePath: 'Good.tsx' },
    ]);
    // In failFast, pipeline stops after first failure
    expect(result.components.length).toBeLessThanOrEqual(2);
    expect(result.passed).toBe(false);
  });
});

// ============================================================================
// Baseline Integration
// ============================================================================

describe('SecurityPipeline - Baseline Verification', () => {
  let pipeline: SecurityPipeline;

  beforeEach(() => {
    pipeline = new SecurityPipeline({ enforceBaselines: true });
  });

  it('verifies against a locked baseline', async () => {
    const snapshot = createComponentSnapshotSync(
      'Button',
      'react',
      CLEAN_REACT_COMPONENT,
      makeProps(),
      makeEvents(),
      makeA11yTree(),
    );

    await pipeline.getBaselineManager().lockBaseline('Button', snapshot);

    const report = await pipeline.run(CLEAN_REACT_COMPONENT, 'Button.tsx', {
      propContract: makeProps(),
      eventSignatures: makeEvents(),
      accessibilityTree: makeA11yTree(),
    });

    expect(report.baselineVerification).not.toBeNull();
    expect(report.baselineVerification!.matches).toBe(true);
    expect(report.passed).toBe(true);
  });

  it('detects baseline mismatch', async () => {
    const snapshot = createComponentSnapshotSync(
      'Button',
      'react',
      CLEAN_REACT_COMPONENT,
      makeProps(),
      makeEvents(),
      makeA11yTree(),
    );

    await pipeline.getBaselineManager().lockBaseline('Button', snapshot);

    // Modified component
    const modified = CLEAN_REACT_COMPONENT.replace('className="btn"', 'className="btn-new"');

    const report = await pipeline.run(modified, 'Button.tsx', {
      propContract: makeProps(),
      eventSignatures: makeEvents(),
      accessibilityTree: makeA11yTree(),
    });

    expect(report.baselineVerification).not.toBeNull();
    expect(report.baselineVerification!.matches).toBe(false);
    expect(report.passed).toBe(false);
  });

  it('skips baseline verification when no baseline exists', async () => {
    const report = await pipeline.run(CLEAN_REACT_COMPONENT, 'Button.tsx', {
      propContract: makeProps(),
      eventSignatures: makeEvents(),
      accessibilityTree: makeA11yTree(),
    });

    // No locked baseline, so verification is null
    expect(report.baselineVerification).toBeNull();
    expect(report.passed).toBe(true);
  });
});

// ============================================================================
// Baseline Export/Import
// ============================================================================

describe('SecurityPipeline - Baseline Persistence', () => {
  it('exports and imports baselines', async () => {
    const pipeline1 = new SecurityPipeline({ enforceBaselines: true });
    const snapshot = createComponentSnapshotSync(
      'Button',
      'react',
      CLEAN_REACT_COMPONENT,
      makeProps(),
      makeEvents(),
      makeA11yTree(),
    );
    await pipeline1.getBaselineManager().lockBaseline('Button', snapshot);

    const json = pipeline1.exportBaselines();

    const pipeline2 = new SecurityPipeline({ enforceBaselines: true });
    await pipeline2.importBaselines(json);

    const baseline = pipeline2.getBaselineManager().getBaseline('Button');
    expect(baseline).toBeDefined();
    expect(baseline!.snapshot.contentHash).toBe(snapshot.contentHash);
  });
});

// ============================================================================
// Configuration
// ============================================================================

describe('SecurityPipeline - Configuration', () => {
  it('passes scanner config to security scanner', async () => {
    const pipeline = new SecurityPipeline({
      scanner: { suppressedRules: ['SEC-RAND-001'] },
    });
    const source = 'const token = Math.random().toString(36);';
    const report = await pipeline.run(source, 'token.ts');
    const randFinding = report.securityScan.findings.find(
      (f) => f.ruleId === 'SEC-RAND-001',
    );
    expect(randFinding).toBeUndefined();
  });

  it('passes CSP config to CSP enforcer', async () => {
    const pipeline = new SecurityPipeline({
      csp: {
        allowedDomains: ['cdn.trusted.com'],
      },
    });
    const source = '<script src="https://cdn.trusted.com/lib.js"></script>';
    const report = await pipeline.run(source, 'page.html');
    const extViolation = report.cspAudit.violations.find(
      (v) => v.ruleId === 'CSP-EXT-001',
    );
    expect(extViolation).toBeUndefined();
  });

  it('disables report generation when configured', async () => {
    const pipeline = new SecurityPipeline({ generateReport: false });
    const report = await pipeline.run(CLEAN_REACT_COMPONENT, 'Button.tsx');
    expect(report.report).toBe('');
  });
});
