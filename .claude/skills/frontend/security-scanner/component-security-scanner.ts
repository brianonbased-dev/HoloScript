/**
 * Component Security Scanner
 *
 * Automated security analysis for the component generation pipeline.
 * Scans generated components for common security vulnerabilities:
 * - XSS vectors (dangerouslySetInnerHTML, v-html, [innerHTML])
 * - Insecure data binding patterns
 * - Missing input sanitization
 * - Eval/Function constructor usage
 * - Insecure URL schemes (javascript:, data:)
 * - Missing CSRF protections
 * - Hardcoded secrets/tokens
 * - Prototype pollution vectors
 * - Open redirect vulnerabilities
 *
 * Integrates with the frontend skill pipeline to gate component generation.
 */

// ============================================================================
// Types
// ============================================================================

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Framework = 'react' | 'vue' | 'angular' | 'unknown';

export interface SecurityFinding {
  /** Unique rule identifier */
  ruleId: string;
  /** Severity level */
  severity: Severity;
  /** Human-readable description */
  message: string;
  /** Line number (1-indexed) where finding occurs */
  line: number;
  /** Column offset (0-indexed) */
  column: number;
  /** The matched source snippet */
  evidence: string;
  /** Suggested remediation */
  remediation: string;
  /** CWE identifier if applicable */
  cweId?: string;
  /** OWASP category */
  owaspCategory?: string;
}

export interface ScanResult {
  /** Absolute path to scanned file */
  filePath: string;
  /** Detected framework */
  framework: Framework;
  /** All findings */
  findings: SecurityFinding[];
  /** Counts by severity */
  summary: Record<Severity, number>;
  /** Whether the scan passed (no critical/high) */
  passed: boolean;
  /** Scan timestamp */
  timestamp: string;
  /** Scan duration in milliseconds */
  durationMs: number;
}

export interface ScannerConfig {
  /** Severity threshold for failure: findings at or above this severity cause failure */
  failThreshold: Severity;
  /** Rules to suppress (by ruleId) */
  suppressedRules: string[];
  /** Custom patterns to flag (regex string -> severity + message) */
  customPatterns: Array<{
    pattern: string;
    severity: Severity;
    message: string;
    remediation: string;
  }>;
  /** Max file size to scan (bytes). Skip larger files. */
  maxFileSizeBytes: number;
  /** Include info-level findings in output */
  includeInfoFindings: boolean;
}

// ============================================================================
// Severity Ordering
// ============================================================================

const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

function severityAtOrAbove(finding: Severity, threshold: Severity): boolean {
  return SEVERITY_ORDER[finding] >= SEVERITY_ORDER[threshold];
}

// ============================================================================
// Rule Definitions
// ============================================================================

interface SecurityRule {
  id: string;
  severity: Severity;
  pattern: RegExp;
  message: string;
  remediation: string;
  frameworks: Framework[];
  cweId?: string;
  owaspCategory?: string;
}

const SECURITY_RULES: SecurityRule[] = [
  // --- XSS ---
  {
    id: 'SEC-XSS-001',
    severity: 'critical',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{/g,
    message: 'Usage of dangerouslySetInnerHTML introduces XSS risk',
    remediation: 'Use a sanitization library (DOMPurify) or render text content instead. If absolutely required, sanitize with DOMPurify.sanitize() before injection.',
    frameworks: ['react'],
    cweId: 'CWE-79',
    owaspCategory: 'A03:2021-Injection',
  },
  {
    id: 'SEC-XSS-002',
    severity: 'critical',
    pattern: /v-html\s*=\s*["']/g,
    message: 'Usage of v-html introduces XSS risk',
    remediation: 'Use v-text for plain text or sanitize input with DOMPurify before using v-html.',
    frameworks: ['vue'],
    cweId: 'CWE-79',
    owaspCategory: 'A03:2021-Injection',
  },
  {
    id: 'SEC-XSS-003',
    severity: 'critical',
    pattern: /\[innerHTML\]\s*=\s*["']/g,
    message: 'Usage of [innerHTML] binding introduces XSS risk',
    remediation: 'Use Angular DomSanitizer or render text content with [textContent] instead.',
    frameworks: ['angular'],
    cweId: 'CWE-79',
    owaspCategory: 'A03:2021-Injection',
  },
  {
    id: 'SEC-XSS-004',
    severity: 'high',
    pattern: /\.innerHTML\s*=(?!=)/g,
    message: 'Direct DOM innerHTML assignment introduces XSS risk',
    remediation: 'Use textContent for text, or createElement/appendChild for structured content. If HTML is required, sanitize with DOMPurify.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-79',
    owaspCategory: 'A03:2021-Injection',
  },
  {
    id: 'SEC-XSS-005',
    severity: 'high',
    pattern: /document\.write\s*\(/g,
    message: 'document.write() can introduce XSS vulnerabilities and blocks page rendering',
    remediation: 'Use DOM manipulation methods (createElement, appendChild) instead of document.write().',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-79',
    owaspCategory: 'A03:2021-Injection',
  },

  // --- Eval / Code Injection ---
  {
    id: 'SEC-EVAL-001',
    severity: 'critical',
    pattern: /\beval\s*\(/g,
    message: 'Usage of eval() enables arbitrary code execution',
    remediation: 'Replace eval() with safer alternatives: JSON.parse() for JSON, Function constructor (with extreme caution), or refactor to avoid dynamic code execution entirely.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-95',
    owaspCategory: 'A03:2021-Injection',
  },
  {
    id: 'SEC-EVAL-002',
    severity: 'critical',
    pattern: /new\s+Function\s*\(/g,
    message: 'Function constructor enables arbitrary code execution similar to eval()',
    remediation: 'Refactor to avoid dynamic code generation. Use template literals, object lookups, or other patterns instead.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-95',
    owaspCategory: 'A03:2021-Injection',
  },
  {
    id: 'SEC-EVAL-003',
    severity: 'high',
    pattern: /setTimeout\s*\(\s*["'`]/g,
    message: 'String argument to setTimeout() is evaluated like eval()',
    remediation: 'Pass a function reference instead of a string: setTimeout(() => { ... }, delay)',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-95',
    owaspCategory: 'A03:2021-Injection',
  },
  {
    id: 'SEC-EVAL-004',
    severity: 'high',
    pattern: /setInterval\s*\(\s*["'`]/g,
    message: 'String argument to setInterval() is evaluated like eval()',
    remediation: 'Pass a function reference instead of a string: setInterval(() => { ... }, delay)',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-95',
    owaspCategory: 'A03:2021-Injection',
  },

  // --- Insecure URL Schemes ---
  {
    id: 'SEC-URL-001',
    severity: 'critical',
    pattern: /["'`]javascript\s*:/gi,
    message: 'javascript: URL scheme enables script execution',
    remediation: 'Remove javascript: URLs. Use onClick handlers for interactivity, or use "#" with event.preventDefault().',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-79',
    owaspCategory: 'A03:2021-Injection',
  },
  {
    id: 'SEC-URL-002',
    severity: 'medium',
    pattern: /["'`]data\s*:\s*text\/html/gi,
    message: 'data: URL with text/html MIME type can execute scripts',
    remediation: 'Avoid data: URLs with text/html. Use blob: URLs with proper Content-Type for legitimate use cases.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-79',
    owaspCategory: 'A03:2021-Injection',
  },

  // --- Secrets / Hardcoded Credentials ---
  {
    id: 'SEC-SECRET-001',
    severity: 'critical',
    pattern: /(?:api[_-]?key|apikey|secret[_-]?key|access[_-]?token|auth[_-]?token|private[_-]?key)\s*[:=]\s*["'`][A-Za-z0-9+/=_-]{16,}/gi,
    message: 'Potential hardcoded secret or API key detected',
    remediation: 'Move secrets to environment variables. Use process.env.VARIABLE_NAME or import from a .env file that is gitignored.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-798',
    owaspCategory: 'A07:2021-Identification and Authentication Failures',
  },
  {
    id: 'SEC-SECRET-002',
    severity: 'high',
    pattern: /(?:password|passwd|pwd)\s*[:=]\s*["'`][^"'`]{4,}/gi,
    message: 'Potential hardcoded password detected',
    remediation: 'Never hardcode passwords. Use environment variables, secrets managers, or secure vaults.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-798',
    owaspCategory: 'A07:2021-Identification and Authentication Failures',
  },

  // --- Prototype Pollution ---
  {
    id: 'SEC-PROTO-001',
    severity: 'high',
    pattern: /\.__proto__\s*[=\[]/g,
    message: 'Direct __proto__ access can lead to prototype pollution',
    remediation: 'Use Object.create(null) for dictionary objects. Validate keys before dynamic property assignment. Use Object.freeze() on prototypes.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-1321',
    owaspCategory: 'A03:2021-Injection',
  },
  {
    id: 'SEC-PROTO-002',
    severity: 'medium',
    pattern: /Object\.assign\s*\(\s*(?:Object\.prototype|{})\s*,/g,
    message: 'Object.assign on prototype or empty object with user input may cause prototype pollution',
    remediation: 'Validate and sanitize all keys before assignment. Use structuredClone() or a deep clone library instead.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-1321',
    owaspCategory: 'A03:2021-Injection',
  },

  // --- Open Redirect ---
  {
    id: 'SEC-REDIR-001',
    severity: 'medium',
    pattern: /(?:window\.location|location\.href|location\.assign|location\.replace)\s*=\s*(?!["'`](?:\/|https?:\/\/))/g,
    message: 'Dynamic URL assignment may enable open redirect attacks',
    remediation: 'Validate redirect URLs against a whitelist of allowed domains. Use URL constructor to parse and verify the hostname.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-601',
    owaspCategory: 'A01:2021-Broken Access Control',
  },

  // --- Insecure Randomness ---
  {
    id: 'SEC-RAND-001',
    severity: 'medium',
    pattern: /Math\.random\s*\(\s*\)/g,
    message: 'Math.random() is not cryptographically secure',
    remediation: 'For security-sensitive operations (tokens, IDs, nonces), use crypto.getRandomValues() or crypto.randomUUID() instead.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-338',
    owaspCategory: 'A02:2021-Cryptographic Failures',
  },

  // --- Insecure Communication ---
  {
    id: 'SEC-HTTP-001',
    severity: 'medium',
    pattern: /["'`]http:\/\/(?!localhost|127\.0\.0\.1)/g,
    message: 'Insecure HTTP URL detected (non-localhost)',
    remediation: 'Use HTTPS for all external communication to prevent man-in-the-middle attacks.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-319',
    owaspCategory: 'A02:2021-Cryptographic Failures',
  },

  // --- Unsafe Deserialization ---
  {
    id: 'SEC-DESER-001',
    severity: 'high',
    pattern: /JSON\.parse\s*\(\s*(?:window\.location|document\.(?:URL|referrer)|location\.(?:search|hash))/g,
    message: 'Parsing untrusted URL data as JSON without validation',
    remediation: 'Validate and sanitize URL parameters before JSON.parse(). Use try-catch and schema validation (zod, yup).',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-502',
    owaspCategory: 'A08:2021-Software and Data Integrity Failures',
  },

  // --- Missing Security Headers (for SSR) ---
  {
    id: 'SEC-HDR-001',
    severity: 'low',
    pattern: /res\.(?:send|render)\s*\(/g,
    message: 'Server response without explicit security headers',
    remediation: 'Ensure security headers are set via middleware (helmet.js): X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-693',
    owaspCategory: 'A05:2021-Security Misconfiguration',
  },

  // --- Unsafe Regex ---
  {
    id: 'SEC-REGEX-001',
    severity: 'medium',
    pattern: /new\s+RegExp\s*\(\s*(?!["'`])/g,
    message: 'Dynamic RegExp construction with user input may cause ReDoS',
    remediation: 'Escape user input before constructing RegExp: new RegExp(input.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")). Or use static patterns.',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-1333',
    owaspCategory: 'A03:2021-Injection',
  },

  // --- Insecure postMessage ---
  {
    id: 'SEC-MSG-001',
    severity: 'medium',
    pattern: /\.postMessage\s*\([^)]*,\s*["'`]\*["'`]\s*\)/g,
    message: 'postMessage with wildcard "*" origin allows any domain to receive the message',
    remediation: 'Specify the exact target origin instead of "*": window.postMessage(data, "https://trusted-domain.com")',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-345',
    owaspCategory: 'A01:2021-Broken Access Control',
  },
  {
    id: 'SEC-MSG-002',
    severity: 'medium',
    pattern: /addEventListener\s*\(\s*["'`]message["'`]\s*,\s*(?:function|\()\s*(?:\w+)\s*(?:\)|=>)\s*\{(?:(?!\.origin).)*\}/gs,
    message: 'Message event listener without origin validation',
    remediation: 'Always validate event.origin before processing message data: if (event.origin !== "https://trusted-domain.com") return;',
    frameworks: ['react', 'vue', 'angular', 'unknown'],
    cweId: 'CWE-345',
    owaspCategory: 'A01:2021-Broken Access Control',
  },
];

// ============================================================================
// Framework Detection
// ============================================================================

function detectFramework(source: string, filePath: string): Framework {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';

  if (ext === 'vue' || source.includes('<template>') || source.includes('defineComponent')) {
    return 'vue';
  }

  if (source.includes('@Component') || source.includes('@NgModule') || ext === 'component.ts') {
    return 'angular';
  }

  if (
    source.includes('import React') ||
    source.includes("from 'react'") ||
    source.includes('from "react"') ||
    source.includes('useState') ||
    source.includes('useEffect') ||
    ext === 'tsx' ||
    ext === 'jsx'
  ) {
    return 'react';
  }

  return 'unknown';
}

// ============================================================================
// Scanner Implementation
// ============================================================================

const DEFAULT_CONFIG: ScannerConfig = {
  failThreshold: 'high',
  suppressedRules: [],
  customPatterns: [],
  maxFileSizeBytes: 5 * 1024 * 1024, // 5MB
  includeInfoFindings: false,
};

/**
 * Scan a single component source string for security vulnerabilities.
 */
export function scanComponentSource(
  source: string,
  filePath: string,
  config: Partial<ScannerConfig> = {},
): ScanResult {
  const startTime = performance.now();
  const mergedConfig: ScannerConfig = { ...DEFAULT_CONFIG, ...config };
  const framework = detectFramework(source, filePath);
  const findings: SecurityFinding[] = [];
  const lines = source.split('\n');

  // Skip oversized files
  const sourceBytes = new TextEncoder().encode(source).length;
  if (sourceBytes > mergedConfig.maxFileSizeBytes) {
    return buildResult(filePath, framework, [], mergedConfig, startTime);
  }

  // Run built-in rules
  for (const rule of SECURITY_RULES) {
    if (mergedConfig.suppressedRules.includes(rule.id)) continue;
    if (!rule.frameworks.includes(framework) && !rule.frameworks.includes('unknown')) continue;

    // Reset regex state
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rule.pattern.exec(source)) !== null) {
      const { line, column } = offsetToLineColumn(source, match.index);
      const evidenceLine = lines[line - 1]?.trim() ?? match[0];

      findings.push({
        ruleId: rule.id,
        severity: rule.severity,
        message: rule.message,
        line,
        column,
        evidence: evidenceLine.length > 120 ? evidenceLine.slice(0, 120) + '...' : evidenceLine,
        remediation: rule.remediation,
        cweId: rule.cweId,
        owaspCategory: rule.owaspCategory,
      });
    }
  }

  // Run custom patterns
  for (const custom of mergedConfig.customPatterns) {
    try {
      const regex = new RegExp(custom.pattern, 'g');
      let match: RegExpExecArray | null;
      while ((match = regex.exec(source)) !== null) {
        const { line, column } = offsetToLineColumn(source, match.index);
        const evidenceLine = lines[line - 1]?.trim() ?? match[0];

        findings.push({
          ruleId: 'CUSTOM-' + custom.pattern.slice(0, 20).replace(/\W/g, '_'),
          severity: custom.severity,
          message: custom.message,
          line,
          column,
          evidence: evidenceLine.length > 120 ? evidenceLine.slice(0, 120) + '...' : evidenceLine,
          remediation: custom.remediation,
        });
      }
    } catch {
      // Invalid regex in custom pattern, skip silently
    }
  }

  return buildResult(filePath, framework, findings, mergedConfig, startTime);
}

/**
 * Scan multiple component sources in batch.
 */
export function scanBatch(
  components: Array<{ source: string; filePath: string }>,
  config: Partial<ScannerConfig> = {},
): ScanResult[] {
  return components.map((c) => scanComponentSource(c.source, c.filePath, config));
}

/**
 * Format scan results as a human-readable report string.
 */
export function formatScanReport(results: ScanResult[]): string {
  const lines: string[] = [];
  const totalFindings = results.reduce((sum, r) => sum + r.findings.length, 0);
  const failedScans = results.filter((r) => !r.passed);

  lines.push('============================================================');
  lines.push('  COMPONENT SECURITY SCAN REPORT');
  lines.push('============================================================');
  lines.push('');
  lines.push(`Files scanned:   ${results.length}`);
  lines.push(`Total findings:  ${totalFindings}`);
  lines.push(`Passed:          ${results.length - failedScans.length}`);
  lines.push(`Failed:          ${failedScans.length}`);
  lines.push('');

  for (const result of results) {
    if (result.findings.length === 0) continue;

    lines.push('------------------------------------------------------------');
    lines.push(`File: ${result.filePath}`);
    lines.push(`Framework: ${result.framework}  |  Status: ${result.passed ? 'PASS' : 'FAIL'}`);
    lines.push('------------------------------------------------------------');

    const sorted = [...result.findings].sort(
      (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
    );

    for (const f of sorted) {
      const icon =
        f.severity === 'critical'
          ? '[CRIT]'
          : f.severity === 'high'
            ? '[HIGH]'
            : f.severity === 'medium'
              ? '[MED] '
              : f.severity === 'low'
                ? '[LOW] '
                : '[INFO]';
      lines.push(`  ${icon} ${f.ruleId} (line ${f.line})`);
      lines.push(`         ${f.message}`);
      lines.push(`         Evidence: ${f.evidence}`);
      lines.push(`         Fix: ${f.remediation}`);
      if (f.cweId) {
        lines.push(`         CWE: ${f.cweId}  OWASP: ${f.owaspCategory ?? 'N/A'}`);
      }
      lines.push('');
    }
  }

  lines.push('============================================================');
  lines.push(`  Scan completed at ${new Date().toISOString()}`);
  lines.push('============================================================');

  return lines.join('\n');
}

// ============================================================================
// Helpers
// ============================================================================

function offsetToLineColumn(
  source: string,
  offset: number,
): { line: number; column: number } {
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < offset && i < source.length; i++) {
    if (source[i] === '\n') {
      line++;
      lastNewline = i;
    }
  }
  return { line, column: offset - lastNewline - 1 };
}

function buildResult(
  filePath: string,
  framework: Framework,
  findings: SecurityFinding[],
  config: ScannerConfig,
  startTime: number,
): ScanResult {
  // Filter info findings if not requested
  const filtered = config.includeInfoFindings
    ? findings
    : findings.filter((f) => f.severity !== 'info');

  const summary: Record<Severity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
  };
  for (const f of filtered) {
    summary[f.severity]++;
  }

  const passed = !filtered.some((f) => severityAtOrAbove(f.severity, config.failThreshold));

  return {
    filePath,
    framework,
    findings: filtered,
    summary,
    passed,
    timestamp: new Date().toISOString(),
    durationMs: Math.round(performance.now() - startTime),
  };
}

// ============================================================================
// Exports for pipeline integration
// ============================================================================

export { SECURITY_RULES, detectFramework, SEVERITY_ORDER };
