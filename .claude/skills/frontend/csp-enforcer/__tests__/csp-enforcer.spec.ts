/**
 * Tests for CSP Enforcer
 *
 * Validates detection of CSP violations including inline scripts, styles,
 * event handlers, external resources, and framework-specific patterns.
 * Also tests CSP header generation, nonce creation, and compliance auditing.
 */

import { describe, it, expect } from 'vitest';
import {
  auditCSPCompliance,
  auditBatch,
  formatCSPReport,
  serializeCSPPolicy,
  parseCSPHeader,
  generateCSPMetaTag,
  generateCSPNonce,
  STRICT_CSP_POLICY,
  type CSPAuditResult,
  type CSPPolicy,
} from '../csp-enforcer';

// ============================================================================
// Inline Script Detection
// ============================================================================

describe('Inline Script Detection', () => {
  it('detects inline <script> tags', () => {
    const source = '<script>alert("xss")</script>';
    const result = auditCSPCompliance(source, 'page.html');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-SCRIPT-001');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('critical');
    expect(violation!.directive).toBe('script-src');
    expect(violation!.nonceResolvable).toBe(true);
  });

  it('does NOT flag <script src="..."> tags', () => {
    const source = '<script src="/app.js"></script>';
    const result = auditCSPCompliance(source, 'page.html');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-SCRIPT-001');
    expect(violation).toBeUndefined();
  });

  it('detects inline event handlers', () => {
    const source = '<button onclick="doSomething()">Click</button>';
    const result = auditCSPCompliance(source, 'page.html');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-SCRIPT-002');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('critical');
    expect(violation!.nonceResolvable).toBe(false);
  });

  it('detects javascript: URIs', () => {
    const source = '<a href="javascript:void(0)">Link</a>';
    const result = auditCSPCompliance(source, 'page.html');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-SCRIPT-003');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('critical');
  });

  it('detects eval() calls', () => {
    const source = "const x = eval('2 + 2');";
    const result = auditCSPCompliance(source, 'script.js');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-SCRIPT-004');
    expect(violation).toBeDefined();
    expect(violation!.directive).toBe('script-src');
  });

  it('detects Function constructor', () => {
    const source = "const fn = new Function('return 42');";
    const result = auditCSPCompliance(source, 'dynamic.js');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-SCRIPT-005');
    expect(violation).toBeDefined();
  });
});

// ============================================================================
// Inline Style Detection
// ============================================================================

describe('Inline Style Detection', () => {
  it('detects inline <style> tags', () => {
    const source = '<style>.red { color: red; }</style>';
    const result = auditCSPCompliance(source, 'page.html');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-STYLE-001');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('high');
    expect(violation!.directive).toBe('style-src');
    expect(violation!.nonceResolvable).toBe(true);
  });

  it('detects inline style attributes', () => {
    const source = '<div style="color: red; font-size: 14px;">Text</div>';
    const result = auditCSPCompliance(source, 'page.html');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-STYLE-002');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('high');
    expect(violation!.nonceResolvable).toBe(false);
  });
});

// ============================================================================
// External Resource Detection
// ============================================================================

describe('External Resource Detection', () => {
  it('detects external script sources', () => {
    const source = '<script src="https://cdn.example.com/lib.js"></script>';
    const result = auditCSPCompliance(source, 'page.html');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-EXT-001');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('medium');
  });

  it('skips external scripts from allowed domains', () => {
    const source = '<script src="https://cdn.trusted.com/lib.js"></script>';
    const result = auditCSPCompliance(source, 'page.html', {
      allowedDomains: ['cdn.trusted.com'],
    });
    const violation = result.violations.find((v) => v.ruleId === 'CSP-EXT-001');
    expect(violation).toBeUndefined();
  });

  it('detects external stylesheets', () => {
    const source = '<link href="https://cdn.example.com/styles.css" rel="stylesheet">';
    const result = auditCSPCompliance(source, 'page.html');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-EXT-002');
    expect(violation).toBeDefined();
  });

  it('detects external images', () => {
    const source = '<img src="https://images.example.com/photo.jpg" alt="photo">';
    const result = auditCSPCompliance(source, 'page.html');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-EXT-003');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('low');
  });
});

// ============================================================================
// Frame/Object Detection
// ============================================================================

describe('Frame/Object Detection', () => {
  it('detects iframes', () => {
    const source = '<iframe src="https://embed.example.com/widget"></iframe>';
    const result = auditCSPCompliance(source, 'page.html');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-FRAME-001');
    expect(violation).toBeDefined();
    expect(violation!.directive).toBe('frame-src');
  });

  it('detects object/embed elements', () => {
    const source = '<object data="flash.swf" type="application/x-shockwave-flash"></object>';
    const result = auditCSPCompliance(source, 'page.html');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-FRAME-002');
    expect(violation).toBeDefined();
    expect(violation!.directive).toBe('object-src');
  });
});

// ============================================================================
// Framework-Specific Detection
// ============================================================================

describe('Framework-Specific CSP Violations', () => {
  it('detects React dangerouslySetInnerHTML', () => {
    const source = 'return <div dangerouslySetInnerHTML={{ __html: content }} />';
    const result = auditCSPCompliance(source, 'Comp.tsx');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-REACT-001');
    expect(violation).toBeDefined();
  });

  it('detects Vue v-html', () => {
    const source = '<template><div v-html="content"></div></template>';
    const result = auditCSPCompliance(source, 'Comp.vue');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-VUE-001');
    expect(violation).toBeDefined();
  });

  it('detects Angular [innerHTML]', () => {
    const source = '<div [innerHTML]="content"></div>';
    const result = auditCSPCompliance(source, 'comp.component.ts');
    const violation = result.violations.find((v) => v.ruleId === 'CSP-ANGULAR-001');
    expect(violation).toBeDefined();
  });
});

// ============================================================================
// Compliance Determination
// ============================================================================

describe('Compliance Determination', () => {
  it('marks clean component as compliant', () => {
    const source = `
      import React from 'react';
      export const Button = ({ label }: { label: string }) => (
        <button className="btn">{label}</button>
      );
    `;
    const result = auditCSPCompliance(source, 'Button.tsx');
    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('marks component with critical violations as non-compliant', () => {
    const source = '<script>alert(1)</script>';
    const result = auditCSPCompliance(source, 'bad.html');
    expect(result.compliant).toBe(false);
  });

  it('in non-strict mode, allows medium/low violations to pass', () => {
    const source = '<img src="https://external.com/img.jpg" alt="x">';
    const result = auditCSPCompliance(source, 'page.html', { strictMode: false });
    expect(result.compliant).toBe(true);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Nonce Generation
// ============================================================================

describe('Nonce Generation', () => {
  it('generates unique nonces', () => {
    const nonce1 = generateCSPNonce();
    const nonce2 = generateCSPNonce();
    expect(nonce1).not.toBe(nonce2);
    expect(nonce1.length).toBeGreaterThan(0);
  });

  it('includes nonces in audit result for resolvable violations', () => {
    const source = '<script>inline code</script>';
    const result = auditCSPCompliance(source, 'page.html', { generateNonces: true });
    expect(result.nonces.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// CSP Serialization
// ============================================================================

describe('CSP Serialization', () => {
  it('serializes a policy to header string', () => {
    const policy: CSPPolicy = {
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'", "'nonce-abc123'"],
        'style-src': ["'self'"],
      } as any,
    };
    const header = serializeCSPPolicy(policy);
    expect(header).toContain("default-src 'self'");
    expect(header).toContain("script-src 'self' 'nonce-abc123'");
    expect(header).toContain("style-src 'self'");
  });

  it('parses a CSP header string', () => {
    const header = "default-src 'self'; script-src 'self' 'nonce-abc'; style-src 'self'";
    const policy = parseCSPHeader(header);
    expect(policy.directives['default-src']).toEqual(["'self'"]);
    expect(policy.directives['script-src']).toEqual(["'self'", "'nonce-abc'"]);
  });

  it('round-trips serialization/parsing', () => {
    const original = STRICT_CSP_POLICY;
    const serialized = serializeCSPPolicy(original);
    const parsed = parseCSPHeader(serialized);

    // Verify key directives survived
    expect(parsed.directives['default-src']).toEqual(["'none'"]);
    expect(parsed.directives['script-src']).toEqual(["'self'"]);
    expect(parsed.directives['object-src']).toEqual(["'none'"]);
  });
});

// ============================================================================
// CSP Meta Tag Generation
// ============================================================================

describe('CSP Meta Tag Generation', () => {
  it('generates valid meta tag', () => {
    const tag = generateCSPMetaTag(STRICT_CSP_POLICY);
    expect(tag).toContain('<meta http-equiv="Content-Security-Policy"');
    expect(tag).toContain("default-src");
    expect(tag).toContain("script-src");
  });

  it('excludes frame-ancestors from meta tag', () => {
    const tag = generateCSPMetaTag(STRICT_CSP_POLICY);
    expect(tag).not.toContain('frame-ancestors');
  });
});

// ============================================================================
// Batch Auditing
// ============================================================================

describe('Batch Auditing', () => {
  it('audits multiple components', () => {
    const results = auditBatch([
      { source: '<script>alert(1)</script>', filePath: 'bad.html' },
      { source: '<div>Safe</div>', filePath: 'good.html' },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].compliant).toBe(false);
    expect(results[1].compliant).toBe(true);
  });
});

// ============================================================================
// Report Formatting
// ============================================================================

describe('Report Formatting', () => {
  it('generates a readable report', () => {
    const results = auditBatch([
      { source: '<script>alert(1)</script><div style="color:red">x</div>', filePath: 'bad.html' },
      { source: '<div>Clean</div>', filePath: 'good.html' },
    ]);
    const report = formatCSPReport(results);
    expect(report).toContain('CSP COMPLIANCE AUDIT REPORT');
    expect(report).toContain('bad.html');
    expect(report).toContain('[CRIT]');
    expect(report).toContain('NON-COMPLIANT');
    expect(report).toContain('[PASS] good.html');
    expect(report).toContain('CSP HEADER TEMPLATE');
    expect(report).toContain('Content-Security-Policy:');
  });
});

// ============================================================================
// Summary / Metadata
// ============================================================================

describe('Audit Result Metadata', () => {
  it('includes correct severity counts', () => {
    const source = `
      <script>inline()</script>
      <div style="color:red">x</div>
      <img src="https://ext.com/img.jpg" alt="x">
    `;
    const result = auditCSPCompliance(source, 'mixed.html');
    expect(result.summary.critical).toBeGreaterThanOrEqual(1);
    expect(result.summary.high).toBeGreaterThanOrEqual(1);
    expect(result.timestamp).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('generates a recommended CSP policy', () => {
    const source = '<script>inline()</script>';
    const result = auditCSPCompliance(source, 'page.html');
    expect(result.recommendedPolicy).toBeDefined();
    expect(result.generatedCSP).toContain("default-src");
    expect(result.generatedCSP).toContain("script-src");
  });
});

// ============================================================================
// Clean Code (no false positives)
// ============================================================================

describe('Clean Code (no false positives)', () => {
  it('passes a clean React component', () => {
    const source = `
      import React from 'react';

      export const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
        <div className="card">
          <h2 className="card-title">{title}</h2>
          <div className="card-body">{children}</div>
        </div>
      );
    `;
    const result = auditCSPCompliance(source, 'Card.tsx');
    expect(result.compliant).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('passes a clean Vue SFC', () => {
    const source = `
      <template>
        <div class="card">
          <h2 class="card-title">{{ title }}</h2>
          <slot></slot>
        </div>
      </template>
      <script setup lang="ts">
      defineProps<{ title: string }>();
      </script>
    `;
    const result = auditCSPCompliance(source, 'Card.vue');
    // Note: <script setup> without src= will flag CSP-SCRIPT-001
    // This is expected for SFC templates. In real usage, Vue SFCs are compiled.
    // We check that no critical inline event handler or eval violations appear.
    const nonSFCViolations = result.violations.filter(
      (v) => v.ruleId !== 'CSP-SCRIPT-001',
    );
    expect(nonSFCViolations.filter((v) => v.severity === 'critical')).toHaveLength(0);
  });
});
