/**
 * Tests for Component Security Scanner
 *
 * Validates detection of XSS, eval, secrets, prototype pollution,
 * and other vulnerability patterns across React, Vue, and Angular.
 */

import { describe, it, expect } from 'vitest';
import {
  scanComponentSource,
  scanBatch,
  formatScanReport,
  detectFramework,
  type ScanResult,
  type SecurityFinding,
} from '../component-security-scanner';

// ============================================================================
// Framework Detection
// ============================================================================

describe('detectFramework', () => {
  it('detects React from imports', () => {
    expect(detectFramework("import React from 'react';", 'App.tsx')).toBe('react');
  });

  it('detects React from hooks', () => {
    expect(detectFramework('const [x, setX] = useState(0);', 'App.tsx')).toBe('react');
  });

  it('detects Vue from template tag', () => {
    expect(detectFramework('<template><div>Hello</div></template>', 'App.vue')).toBe('vue');
  });

  it('detects Vue from file extension', () => {
    expect(detectFramework('export default {}', 'App.vue')).toBe('vue');
  });

  it('detects Angular from @Component', () => {
    expect(detectFramework("@Component({ selector: 'app' })", 'app.component.ts')).toBe('angular');
  });

  it('returns unknown for plain JS', () => {
    expect(detectFramework('const x = 1;', 'util.js')).toBe('unknown');
  });
});

// ============================================================================
// XSS Detection
// ============================================================================

describe('XSS Detection', () => {
  it('detects dangerouslySetInnerHTML in React', () => {
    const source = `
      function Comp({ html }) {
        return <div dangerouslySetInnerHTML={{ __html: html }} />;
      }
    `;
    const result = scanComponentSource(source, 'Comp.tsx');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-XSS-001');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
    expect(finding!.cweId).toBe('CWE-79');
  });

  it('detects v-html in Vue', () => {
    const source = '<template><div v-html="userContent"></div></template>';
    const result = scanComponentSource(source, 'Comp.vue');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-XSS-002');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
  });

  it('detects [innerHTML] in Angular', () => {
    const source = `@Component({
      template: '<div [innerHTML]="content"></div>'
    })`;
    const result = scanComponentSource(source, 'comp.component.ts');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-XSS-003');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
  });

  it('detects direct innerHTML assignment', () => {
    const source = 'element.innerHTML = userInput;';
    const result = scanComponentSource(source, 'util.js');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-XSS-004');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
  });

  it('detects document.write', () => {
    const source = "document.write('<script>alert(1)</script>');";
    const result = scanComponentSource(source, 'legacy.js');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-XSS-005');
    expect(finding).toBeDefined();
  });
});

// ============================================================================
// Eval / Code Injection Detection
// ============================================================================

describe('Eval Detection', () => {
  it('detects eval()', () => {
    const source = "const result = eval('2 + 2');";
    const result = scanComponentSource(source, 'calc.js');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-EVAL-001');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
    expect(finding!.cweId).toBe('CWE-95');
  });

  it('detects new Function()', () => {
    const source = "const fn = new Function('return 42');";
    const result = scanComponentSource(source, 'dynamic.js');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-EVAL-002');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
  });

  it('detects string setTimeout', () => {
    const source = "setTimeout('alert(1)', 1000);";
    const result = scanComponentSource(source, 'timer.js');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-EVAL-003');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
  });

  it('detects string setInterval', () => {
    const source = "setInterval('doWork()', 500);";
    const result = scanComponentSource(source, 'poll.js');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-EVAL-004');
    expect(finding).toBeDefined();
  });
});

// ============================================================================
// URL Scheme Detection
// ============================================================================

describe('URL Scheme Detection', () => {
  it('detects javascript: URLs', () => {
    const source = '<a href="javascript:void(0)">Click</a>';
    const result = scanComponentSource(source, 'Link.tsx');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-URL-001');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
  });

  it('detects data:text/html URLs', () => {
    const source = 'const src = "data:text/html,<script>alert(1)</script>";';
    const result = scanComponentSource(source, 'iframe.js');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-URL-002');
    expect(finding).toBeDefined();
  });
});

// ============================================================================
// Secrets Detection
// ============================================================================

describe('Secrets Detection', () => {
  it('detects hardcoded API keys', () => {
    const source = 'const api_key = "sk-abcdefghijklmnopqrstuvwxyz1234567890";';
    const result = scanComponentSource(source, 'config.ts');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-SECRET-001');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('critical');
    expect(finding!.cweId).toBe('CWE-798');
  });

  it('detects hardcoded passwords', () => {
    const source = 'const password = "SuperSecretPass123!";';
    const result = scanComponentSource(source, 'auth.ts');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-SECRET-002');
    expect(finding).toBeDefined();
  });
});

// ============================================================================
// Prototype Pollution Detection
// ============================================================================

describe('Prototype Pollution Detection', () => {
  it('detects __proto__ access', () => {
    const source = "obj.__proto__['polluted'] = true;";
    const result = scanComponentSource(source, 'util.js');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-PROTO-001');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
  });
});

// ============================================================================
// Insecure Communication
// ============================================================================

describe('Insecure Communication', () => {
  it('detects non-localhost HTTP URLs', () => {
    const source = 'const apiUrl = "http://api.example.com/data";';
    const result = scanComponentSource(source, 'api.ts');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-HTTP-001');
    expect(finding).toBeDefined();
  });

  it('does NOT flag localhost HTTP URLs', () => {
    const source = 'const devUrl = "http://localhost:3000/api";';
    const result = scanComponentSource(source, 'dev.ts');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-HTTP-001');
    expect(finding).toBeUndefined();
  });
});

// ============================================================================
// Insecure postMessage
// ============================================================================

describe('PostMessage Detection', () => {
  it('detects wildcard postMessage origin', () => {
    const source = 'window.postMessage(data, "*");';
    const result = scanComponentSource(source, 'iframe-bridge.ts');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-MSG-001');
    expect(finding).toBeDefined();
  });
});

// ============================================================================
// Math.random Detection
// ============================================================================

describe('Insecure Randomness Detection', () => {
  it('detects Math.random() usage', () => {
    const source = 'const token = Math.random().toString(36);';
    const result = scanComponentSource(source, 'token.ts');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-RAND-001');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('medium');
  });
});

// ============================================================================
// Configuration & Suppression
// ============================================================================

describe('Scanner Configuration', () => {
  it('suppresses findings by ruleId', () => {
    const source = "const result = eval('2 + 2');";
    const result = scanComponentSource(source, 'calc.js', {
      suppressedRules: ['SEC-EVAL-001'],
    });
    const finding = result.findings.find((f) => f.ruleId === 'SEC-EVAL-001');
    expect(finding).toBeUndefined();
  });

  it('respects failThreshold configuration', () => {
    const source = 'const token = Math.random().toString(36);';

    // Default threshold is 'high', medium should pass
    const passResult = scanComponentSource(source, 'token.ts', { failThreshold: 'high' });
    expect(passResult.passed).toBe(true);

    // Critical threshold means everything passes except critical
    const critResult = scanComponentSource(source, 'token.ts', { failThreshold: 'critical' });
    expect(critResult.passed).toBe(true);

    // Medium threshold means medium findings cause failure
    const failResult = scanComponentSource(source, 'token.ts', { failThreshold: 'medium' });
    expect(failResult.passed).toBe(false);
  });

  it('supports custom patterns', () => {
    const source = 'const x = unsafeOperation();';
    const result = scanComponentSource(source, 'custom.ts', {
      customPatterns: [
        {
          pattern: 'unsafeOperation\\(\\)',
          severity: 'high',
          message: 'Custom unsafe operation detected',
          remediation: 'Replace with safeOperation()',
        },
      ],
    });
    const finding = result.findings.find((f) => f.ruleId.startsWith('CUSTOM-'));
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('high');
  });

  it('skips files exceeding maxFileSizeBytes', () => {
    const source = 'x'.repeat(100);
    const result = scanComponentSource(source, 'big.js', { maxFileSizeBytes: 50 });
    expect(result.findings).toHaveLength(0);
  });
});

// ============================================================================
// Batch Scanning
// ============================================================================

describe('Batch Scanning', () => {
  it('scans multiple components', () => {
    const results = scanBatch([
      { source: "eval('test');", filePath: 'a.js' },
      { source: 'const x = 1;', filePath: 'b.js' },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].findings.length).toBeGreaterThan(0);
    expect(results[1].findings).toHaveLength(0);
  });
});

// ============================================================================
// Report Formatting
// ============================================================================

describe('Report Formatting', () => {
  it('generates a readable report', () => {
    const results = scanBatch([
      { source: "eval('1'); const api_key = 'sk-1234567890abcdefghij';", filePath: 'bad.js' },
      { source: 'const x = 1;', filePath: 'good.js' },
    ]);
    const report = formatScanReport(results);
    expect(report).toContain('COMPONENT SECURITY SCAN REPORT');
    expect(report).toContain('bad.js');
    expect(report).toContain('[CRIT]');
    expect(report).toContain('Files scanned:   2');
  });
});

// ============================================================================
// Clean Code Detection (no false positives)
// ============================================================================

describe('Clean Code (no false positives)', () => {
  it('passes clean React component', () => {
    const source = `
      import React, { useState } from 'react';

      interface Props {
        name: string;
      }

      export const Greeting: React.FC<Props> = ({ name }) => {
        const [count, setCount] = useState(0);
        return (
          <div>
            <h1>Hello, {name}</h1>
            <button onClick={() => setCount(c => c + 1)}>
              Clicked {count} times
            </button>
          </div>
        );
      };
    `;
    const result = scanComponentSource(source, 'Greeting.tsx');
    expect(result.passed).toBe(true);
    expect(result.findings.filter((f) => f.severity === 'critical')).toHaveLength(0);
    expect(result.findings.filter((f) => f.severity === 'high')).toHaveLength(0);
  });

  it('passes clean Vue component', () => {
    const source = `
      <template>
        <div>
          <h1>{{ title }}</h1>
          <p v-text="description"></p>
        </div>
      </template>
      <script setup lang="ts">
      import { ref } from 'vue';
      const title = ref('Hello');
      const description = ref('A safe component');
      </script>
    `;
    const result = scanComponentSource(source, 'Safe.vue');
    expect(result.passed).toBe(true);
  });
});

// ============================================================================
// Summary / Metadata
// ============================================================================

describe('Scan Result Metadata', () => {
  it('includes correct summary counts', () => {
    const source = `
      eval('1');
      element.innerHTML = userInput;
      const token = Math.random().toString(36);
    `;
    const result = scanComponentSource(source, 'mixed.js');
    expect(result.summary.critical).toBeGreaterThanOrEqual(1);
    expect(result.summary.medium).toBeGreaterThanOrEqual(1);
    expect(result.timestamp).toBeDefined();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.framework).toBe('unknown');
  });

  it('provides line/column for findings', () => {
    const source = "line1\nline2\nconst x = eval('test');";
    const result = scanComponentSource(source, 'loc.js');
    const finding = result.findings.find((f) => f.ruleId === 'SEC-EVAL-001');
    expect(finding).toBeDefined();
    expect(finding!.line).toBe(3);
    expect(finding!.column).toBeGreaterThanOrEqual(0);
  });
});
