/**
 * Strict CSP Enforcer for Generated Components
 *
 * Enforces Content Security Policy compliance at the component level.
 * Scans generated components for CSP violations and generates appropriate
 * CSP directives and nonce-based policies.
 *
 * Features:
 * - Detects inline scripts, styles, and event handlers that violate CSP
 * - Generates strict CSP headers with nonce/hash-based allowlists
 * - Validates components against a target CSP policy
 * - Provides automated refactoring suggestions
 * - Supports React, Vue, and Angular generated components
 *
 * Targets:
 * - No 'unsafe-inline' for scripts
 * - No 'unsafe-eval'
 * - Strict source whitelisting
 * - Nonce-based script/style policies where inline is unavoidable
 */

// ============================================================================
// Types
// ============================================================================

export type CSPDirective =
  | 'default-src'
  | 'script-src'
  | 'style-src'
  | 'img-src'
  | 'font-src'
  | 'connect-src'
  | 'frame-src'
  | 'object-src'
  | 'base-uri'
  | 'form-action'
  | 'frame-ancestors'
  | 'worker-src'
  | 'manifest-src'
  | 'media-src';

export type CSPSource =
  | "'self'"
  | "'none'"
  | "'unsafe-inline'"
  | "'unsafe-eval'"
  | "'strict-dynamic'"
  | "'unsafe-hashes'"
  | string; // nonce, hash, or URL

export interface CSPPolicy {
  directives: Record<CSPDirective, CSPSource[]>;
}

export type ViolationSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface CSPViolation {
  /** Rule identifier */
  ruleId: string;
  /** Severity */
  severity: ViolationSeverity;
  /** Which CSP directive is violated */
  directive: CSPDirective;
  /** Human-readable description */
  message: string;
  /** Line number */
  line: number;
  /** The code that causes the violation */
  evidence: string;
  /** How to fix it */
  remediation: string;
  /** Whether this can be resolved with a nonce */
  nonceResolvable: boolean;
}

export interface CSPAuditResult {
  /** Path of audited file */
  filePath: string;
  /** All violations found */
  violations: CSPViolation[];
  /** Violation counts by severity */
  summary: Record<ViolationSeverity, number>;
  /** Whether the component passes the target policy */
  compliant: boolean;
  /** Generated CSP header for this component */
  generatedCSP: string;
  /** Generated nonces (if applicable) */
  nonces: string[];
  /** Recommended CSP policy for the component */
  recommendedPolicy: CSPPolicy;
  /** Audit timestamp */
  timestamp: string;
  /** Audit duration in ms */
  durationMs: number;
}

export interface EnforcerConfig {
  /** Target CSP policy to validate against */
  targetPolicy: CSPPolicy;
  /** Whether to generate nonces for inline scripts/styles */
  generateNonces: boolean;
  /** Allowed external domains */
  allowedDomains: string[];
  /** Whether to fail on any violation */
  strictMode: boolean;
  /** Framework-specific adjustments */
  framework?: 'react' | 'vue' | 'angular';
}

// ============================================================================
// Default Strict CSP Policy
// ============================================================================

export const STRICT_CSP_POLICY: CSPPolicy = {
  directives: {
    'default-src': ["'none'"],
    'script-src': ["'self'"],
    'style-src': ["'self'"],
    'img-src': ["'self'", 'data:', 'https:'],
    'font-src': ["'self'"],
    'connect-src': ["'self'"],
    'frame-src': ["'none'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'media-src': ["'self'"],
  },
};

// ============================================================================
// CSP Violation Rules
// ============================================================================

interface CSPRule {
  id: string;
  severity: ViolationSeverity;
  directive: CSPDirective;
  pattern: RegExp;
  message: string;
  remediation: string;
  nonceResolvable: boolean;
}

const CSP_RULES: CSPRule[] = [
  // --- Inline Scripts ---
  {
    id: 'CSP-SCRIPT-001',
    severity: 'critical',
    directive: 'script-src',
    pattern: /<script(?![^>]*\bsrc=)[^>]*>/gi,
    message: 'Inline <script> tag violates script-src CSP directive',
    remediation: 'Move inline scripts to external .js files, or add a nonce attribute: <script nonce="{{nonce}}">',
    nonceResolvable: true,
  },
  {
    id: 'CSP-SCRIPT-002',
    severity: 'critical',
    directive: 'script-src',
    pattern: /\bon\w+\s*=\s*["'][^"']*["']/gi,
    message: 'Inline event handler attribute violates script-src CSP directive',
    remediation: 'Replace inline event handlers (onclick, onmouseover, etc.) with addEventListener() calls in external scripts.',
    nonceResolvable: false,
  },
  {
    id: 'CSP-SCRIPT-003',
    severity: 'critical',
    directive: 'script-src',
    pattern: /\bhref\s*=\s*["']javascript:/gi,
    message: 'javascript: URI in href violates script-src CSP directive',
    remediation: 'Replace javascript: URIs with proper event handlers. Use <button> with onClick instead of <a href="javascript:...">.',
    nonceResolvable: false,
  },
  {
    id: 'CSP-SCRIPT-004',
    severity: 'critical',
    directive: 'script-src',
    pattern: /\beval\s*\(/g,
    message: 'eval() requires unsafe-eval in script-src CSP directive',
    remediation: 'Remove eval() calls. Use JSON.parse() for JSON, or refactor to avoid dynamic code execution.',
    nonceResolvable: false,
  },
  {
    id: 'CSP-SCRIPT-005',
    severity: 'critical',
    directive: 'script-src',
    pattern: /\bnew\s+Function\s*\(/g,
    message: 'Function constructor requires unsafe-eval in script-src CSP directive',
    remediation: 'Replace Function constructor with static function definitions or object lookups.',
    nonceResolvable: false,
  },

  // --- Inline Styles ---
  {
    id: 'CSP-STYLE-001',
    severity: 'high',
    directive: 'style-src',
    pattern: /<style(?![^>]*\bsrc=)[^>]*>/gi,
    message: 'Inline <style> tag violates style-src CSP directive',
    remediation: 'Move inline styles to external .css files, or add a nonce attribute: <style nonce="{{nonce}}">',
    nonceResolvable: true,
  },
  {
    id: 'CSP-STYLE-002',
    severity: 'high',
    directive: 'style-src',
    pattern: /\bstyle\s*=\s*["'][^"']+["']/gi,
    message: 'Inline style attribute violates style-src CSP directive',
    remediation: 'Move inline styles to CSS classes in external stylesheets. Use className in React or :class in Vue.',
    nonceResolvable: false,
  },

  // --- External Resources ---
  {
    id: 'CSP-EXT-001',
    severity: 'medium',
    directive: 'script-src',
    pattern: /<script[^>]+src\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi,
    message: 'External script source must be whitelisted in script-src CSP directive',
    remediation: 'Add the script domain to the CSP script-src directive, or host the script on your own domain.',
    nonceResolvable: true,
  },
  {
    id: 'CSP-EXT-002',
    severity: 'medium',
    directive: 'style-src',
    pattern: /<link[^>]+href\s*=\s*["'](https?:\/\/[^"']+\.css)["'][^>]*>/gi,
    message: 'External stylesheet must be whitelisted in style-src CSP directive',
    remediation: 'Add the stylesheet domain to the CSP style-src directive, or host the CSS on your own domain.',
    nonceResolvable: false,
  },
  {
    id: 'CSP-EXT-003',
    severity: 'low',
    directive: 'img-src',
    pattern: /<img[^>]+src\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi,
    message: 'External image source should be whitelisted in img-src CSP directive',
    remediation: 'Add the image domain to the CSP img-src directive.',
    nonceResolvable: false,
  },

  // --- Frame/Object ---
  {
    id: 'CSP-FRAME-001',
    severity: 'high',
    directive: 'frame-src',
    pattern: /<iframe[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi,
    message: 'iframe source must be whitelisted in frame-src CSP directive',
    remediation: 'Add the iframe source domain to frame-src, or remove the iframe if not needed.',
    nonceResolvable: false,
  },
  {
    id: 'CSP-FRAME-002',
    severity: 'high',
    directive: 'object-src',
    pattern: /<(?:object|embed|applet)\b/gi,
    message: 'object/embed/applet elements violate object-src CSP directive',
    remediation: 'Remove <object>, <embed>, and <applet> elements. Use <img>, <video>, or <canvas> instead.',
    nonceResolvable: false,
  },

  // --- Base URI ---
  {
    id: 'CSP-BASE-001',
    severity: 'medium',
    directive: 'base-uri',
    pattern: /<base[^>]+href\s*=\s*["']([^"']+)["'][^>]*>/gi,
    message: '<base> tag modifies document base URI, which must comply with base-uri CSP directive',
    remediation: 'Remove <base> tag or ensure the href matches the base-uri CSP directive.',
    nonceResolvable: false,
  },

  // --- Form Action ---
  {
    id: 'CSP-FORM-001',
    severity: 'medium',
    directive: 'form-action',
    pattern: /<form[^>]+action\s*=\s*["'](https?:\/\/[^"']+)["'][^>]*>/gi,
    message: 'External form action must be whitelisted in form-action CSP directive',
    remediation: 'Add the form action domain to form-action CSP directive, or use same-origin form submission.',
    nonceResolvable: false,
  },

  // --- Framework-Specific ---
  {
    id: 'CSP-REACT-001',
    severity: 'high',
    directive: 'script-src',
    pattern: /dangerouslySetInnerHTML\s*=\s*\{/g,
    message: 'dangerouslySetInnerHTML may conflict with strict CSP if content contains scripts',
    remediation: 'Sanitize HTML content with DOMPurify before injection. Ensure no <script> tags are included in the HTML.',
    nonceResolvable: false,
  },
  {
    id: 'CSP-VUE-001',
    severity: 'high',
    directive: 'script-src',
    pattern: /v-html\s*=\s*["']/g,
    message: 'v-html may inject content that conflicts with strict CSP',
    remediation: 'Use v-text for plain text, or sanitize HTML with DOMPurify before using v-html.',
    nonceResolvable: false,
  },
  {
    id: 'CSP-ANGULAR-001',
    severity: 'high',
    directive: 'script-src',
    pattern: /\[innerHTML\]\s*=\s*["']/g,
    message: 'Angular [innerHTML] binding may inject content that conflicts with strict CSP',
    remediation: 'Use Angular DomSanitizer.bypassSecurityTrustHtml() with caution, or use [textContent] for plain text.',
    nonceResolvable: false,
  },
];

// ============================================================================
// Nonce Generation
// ============================================================================

/**
 * Generate a cryptographically random nonce for CSP.
 */
export function generateCSPNonce(): string {
  // Node.js
  if (typeof globalThis !== 'undefined' && typeof (globalThis as any).process !== 'undefined') {
    try {
      const crypto = require('crypto');
      return crypto.randomBytes(16).toString('base64');
    } catch {
      // Fallback
    }
  }

  // Browser
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array));
  }

  throw new Error('No crypto implementation available for nonce generation');
}

// ============================================================================
// CSP Header Serialization
// ============================================================================

/**
 * Serialize a CSP policy object into a valid Content-Security-Policy header string.
 */
export function serializeCSPPolicy(policy: CSPPolicy): string {
  const parts: string[] = [];
  for (const [directive, sources] of Object.entries(policy.directives)) {
    if (sources.length > 0) {
      parts.push(`${directive} ${sources.join(' ')}`);
    }
  }
  return parts.join('; ');
}

/**
 * Parse a CSP header string into a policy object.
 */
export function parseCSPHeader(header: string): CSPPolicy {
  const directives: Record<string, string[]> = {};
  const parts = header.split(';').map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    const tokens = part.split(/\s+/);
    const directive = tokens[0] as CSPDirective;
    const sources = tokens.slice(1);
    directives[directive] = sources;
  }

  return { directives: directives as Record<CSPDirective, CSPSource[]> };
}

// ============================================================================
// CSP Auditor
// ============================================================================

const DEFAULT_CONFIG: EnforcerConfig = {
  targetPolicy: STRICT_CSP_POLICY,
  generateNonces: true,
  allowedDomains: [],
  strictMode: true,
};

/**
 * Audit a component source against a CSP policy.
 */
export function auditCSPCompliance(
  source: string,
  filePath: string,
  config: Partial<EnforcerConfig> = {},
): CSPAuditResult {
  const startTime = performance.now();
  const mergedConfig: EnforcerConfig = { ...DEFAULT_CONFIG, ...config };
  const violations: CSPViolation[] = [];
  const nonces: string[] = [];
  const lines = source.split('\n');

  for (const rule of CSP_RULES) {
    // Reset regex
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = rule.pattern.exec(source)) !== null) {
      const { line } = offsetToLineColumn(source, match.index);
      const evidenceLine = lines[line - 1]?.trim() ?? match[0];

      // Check if external URL is in allowed domains
      if (match[1] && mergedConfig.allowedDomains.length > 0) {
        try {
          const url = new URL(match[1]);
          if (mergedConfig.allowedDomains.some((d) => url.hostname === d || url.hostname.endsWith('.' + d))) {
            continue; // Allowed domain, skip violation
          }
        } catch {
          // Not a valid URL, proceed with violation
        }
      }

      violations.push({
        ruleId: rule.id,
        severity: rule.severity,
        directive: rule.directive,
        message: rule.message,
        line,
        evidence: evidenceLine.length > 120 ? evidenceLine.slice(0, 120) + '...' : evidenceLine,
        remediation: rule.remediation,
        nonceResolvable: rule.nonceResolvable,
      });

      // Generate nonce for resolvable violations
      if (rule.nonceResolvable && mergedConfig.generateNonces) {
        try {
          const nonce = generateCSPNonce();
          nonces.push(nonce);
        } catch {
          // Nonce generation not available
        }
      }
    }
  }

  // Build summary
  const summary: Record<ViolationSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const v of violations) {
    summary[v.severity]++;
  }

  // Determine compliance
  const compliant = mergedConfig.strictMode
    ? violations.length === 0
    : violations.filter((v) => v.severity === 'critical' || v.severity === 'high').length === 0;

  // Generate recommended CSP
  const recommendedPolicy = generateRecommendedPolicy(violations, nonces, mergedConfig);
  const generatedCSP = serializeCSPPolicy(recommendedPolicy);

  return {
    filePath,
    violations,
    summary,
    compliant,
    generatedCSP,
    nonces,
    recommendedPolicy,
    timestamp: new Date().toISOString(),
    durationMs: Math.round(performance.now() - startTime),
  };
}

/**
 * Audit multiple components in batch.
 */
export function auditBatch(
  components: Array<{ source: string; filePath: string }>,
  config: Partial<EnforcerConfig> = {},
): CSPAuditResult[] {
  return components.map((c) => auditCSPCompliance(c.source, c.filePath, config));
}

/**
 * Format audit results as a human-readable report.
 */
export function formatCSPReport(results: CSPAuditResult[]): string {
  const lines: string[] = [];
  const totalViolations = results.reduce((sum, r) => sum + r.violations.length, 0);
  const compliantCount = results.filter((r) => r.compliant).length;

  lines.push('============================================================');
  lines.push('  CSP COMPLIANCE AUDIT REPORT');
  lines.push('============================================================');
  lines.push('');
  lines.push(`Files audited:     ${results.length}`);
  lines.push(`Total violations:  ${totalViolations}`);
  lines.push(`Compliant:         ${compliantCount}/${results.length}`);
  lines.push('');

  for (const result of results) {
    if (result.violations.length === 0 && result.compliant) {
      lines.push(`  [PASS] ${result.filePath}`);
      continue;
    }

    lines.push('------------------------------------------------------------');
    lines.push(`File: ${result.filePath}`);
    lines.push(`Status: ${result.compliant ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
    lines.push(`Violations: ${result.violations.length}`);
    lines.push('------------------------------------------------------------');

    const sorted = [...result.violations].sort(
      (a, b) => severityOrder(b.severity) - severityOrder(a.severity),
    );

    for (const v of sorted) {
      const icon =
        v.severity === 'critical'
          ? '[CRIT]'
          : v.severity === 'high'
            ? '[HIGH]'
            : v.severity === 'medium'
              ? '[MED] '
              : '[LOW] ';
      lines.push(`  ${icon} ${v.ruleId} (line ${v.line}) [${v.directive}]`);
      lines.push(`         ${v.message}`);
      lines.push(`         Evidence: ${v.evidence}`);
      lines.push(`         Fix: ${v.remediation}`);
      if (v.nonceResolvable) {
        lines.push('         [Nonce-resolvable: add nonce attribute to resolve]');
      }
      lines.push('');
    }

    if (result.generatedCSP) {
      lines.push('  Recommended CSP Header:');
      lines.push(`  ${result.generatedCSP}`);
      lines.push('');
    }
  }

  lines.push('============================================================');
  lines.push('  CSP HEADER TEMPLATE');
  lines.push('============================================================');
  lines.push('');

  // Merge all recommended policies into a single suggestion
  const merged = mergeRecommendedPolicies(results.map((r) => r.recommendedPolicy));
  lines.push('Content-Security-Policy:');
  lines.push(`  ${serializeCSPPolicy(merged)}`);
  lines.push('');

  lines.push('============================================================');
  lines.push(`  Audit completed at ${new Date().toISOString()}`);
  lines.push('============================================================');

  return lines.join('\n');
}

// ============================================================================
// CSP Meta Tag Generator
// ============================================================================

/**
 * Generate an HTML <meta> tag for CSP.
 * Note: Some directives (frame-ancestors, sandbox, report-uri) are not
 * supported in meta tags.
 */
export function generateCSPMetaTag(policy: CSPPolicy): string {
  const unsupportedInMeta: CSPDirective[] = ['frame-ancestors'];
  const filteredDirectives: Record<string, CSPSource[]> = {};

  for (const [dir, sources] of Object.entries(policy.directives)) {
    if (!unsupportedInMeta.includes(dir as CSPDirective)) {
      filteredDirectives[dir] = sources;
    }
  }

  const filteredPolicy: CSPPolicy = { directives: filteredDirectives as Record<CSPDirective, CSPSource[]> };
  const content = serializeCSPPolicy(filteredPolicy);
  return `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttr(content)}">`;
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

function severityOrder(severity: ViolationSeverity): number {
  const order: Record<ViolationSeverity, number> = {
    critical: 4,
    high: 3,
    medium: 2,
    low: 1,
  };
  return order[severity];
}

function escapeHtmlAttr(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function generateRecommendedPolicy(
  violations: CSPViolation[],
  nonces: string[],
  config: EnforcerConfig,
): CSPPolicy {
  // Start with the strict base
  const policy: CSPPolicy = JSON.parse(JSON.stringify(config.targetPolicy));

  // Add nonces for nonce-resolvable violations
  if (config.generateNonces && nonces.length > 0) {
    const nonceDirectives: CSPDirective[] = ['script-src', 'style-src'];
    for (const directive of nonceDirectives) {
      const directiveViolations = violations.filter(
        (v) => v.directive === directive && v.nonceResolvable,
      );
      if (directiveViolations.length > 0 && nonces.length > 0) {
        const nonceSources = nonces.map((n) => `'nonce-${n}'`);
        if (policy.directives[directive]) {
          policy.directives[directive] = [
            ...policy.directives[directive].filter((s) => s !== "'unsafe-inline'"),
            ...nonceSources,
          ];
        }
      }
    }
  }

  // Add allowed domains
  for (const domain of config.allowedDomains) {
    for (const directive of ['script-src', 'style-src', 'img-src', 'connect-src', 'font-src'] as CSPDirective[]) {
      if (policy.directives[directive] && !policy.directives[directive].includes(domain)) {
        policy.directives[directive].push(domain);
      }
    }
  }

  return policy;
}

function mergeRecommendedPolicies(policies: CSPPolicy[]): CSPPolicy {
  if (policies.length === 0) return STRICT_CSP_POLICY;

  const merged: CSPPolicy = JSON.parse(JSON.stringify(policies[0]));

  for (let i = 1; i < policies.length; i++) {
    for (const [directive, sources] of Object.entries(policies[i].directives)) {
      if (!merged.directives[directive as CSPDirective]) {
        merged.directives[directive as CSPDirective] = [];
      }
      for (const source of sources) {
        if (!merged.directives[directive as CSPDirective].includes(source)) {
          merged.directives[directive as CSPDirective].push(source);
        }
      }
    }
  }

  return merged;
}

// ============================================================================
// Exports for pipeline integration
// ============================================================================

export { CSP_RULES, DEFAULT_CONFIG };
