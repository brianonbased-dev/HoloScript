/**
 * Security Enforcer
 *
 * Validates HoloScript compositions and source code against security policies.
 * Performs static analysis for vulnerability patterns and policy violations.
 *
 * @version 9.0.0
 * @Sprint Sprint 9: Security Hardening
 */

import type { SecurityPolicy } from './SecurityPolicy';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Severity level for security violations.
 */
export type ViolationSeverity = 'error' | 'warning' | 'info';

/**
 * Category of security violation.
 */
export type ViolationCategory =
  | 'object_count'
  | 'trait_depth'
  | 'disallowed_trait'
  | 'network_access'
  | 'code_injection'
  | 'dangerous_api'
  | 'script_injection'
  | 'prototype_pollution';

/**
 * A single security violation found during scanning.
 */
export interface SecurityViolation {
  /** Machine-readable violation category */
  category: ViolationCategory;
  /** Severity level */
  severity: ViolationSeverity;
  /** Human-readable description */
  message: string;
  /** Line number where the violation was found (1-based), if applicable */
  line?: number;
  /** Column number where the violation was found (1-based), if applicable */
  column?: number;
}

/**
 * Result of a security scan or validation.
 */
export interface SecurityScanResult {
  /** Whether all checks passed with no errors */
  passed: boolean;
  /** List of violations found */
  violations: SecurityViolation[];
}

/**
 * Minimal AST node interface for composition validation.
 * Compatible with HoloScript parser output.
 */
export interface ASTNode {
  type: string;
  name?: string;
  traits?: string[];
  children?: ASTNode[];
  [key: string]: unknown;
}

/**
 * Import declaration for network validation.
 */
export interface ImportDeclaration {
  /** The source module or URL */
  source: string;
  /** Named imports */
  specifiers?: string[];
}

// =============================================================================
// COMPOSITION VALIDATION
// =============================================================================

/**
 * Validate an AST composition against a security policy.
 *
 * Checks:
 * - Maximum object count
 * - Maximum trait nesting depth
 * - Disallowed traits
 */
export function validateComposition(
  ast: ASTNode | ASTNode[],
  policy: SecurityPolicy
): SecurityScanResult {
  const violations: SecurityViolation[] = [];
  const nodes = Array.isArray(ast) ? ast : [ast];

  // Count total objects
  const objectCount = countObjects(nodes);
  if (objectCount > policy.code.maxObjectCount) {
    violations.push({
      category: 'object_count',
      severity: 'error',
      message: `Object count ${objectCount} exceeds maximum of ${policy.code.maxObjectCount}`,
    });
  }

  // Check trait depth
  const maxDepth = measureMaxTraitDepth(nodes);
  if (maxDepth > policy.code.maxTraitDepth) {
    violations.push({
      category: 'trait_depth',
      severity: 'error',
      message: `Trait nesting depth ${maxDepth} exceeds maximum of ${policy.code.maxTraitDepth}`,
    });
  }

  // Check disallowed traits
  if (policy.code.disallowedTraits.length > 0) {
    const disallowed = new Set(policy.code.disallowedTraits.map((t) => t.toLowerCase()));
    collectDisallowedTraitViolations(nodes, disallowed, violations);
  }

  return {
    passed: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
  };
}

/**
 * Recursively count all object-type nodes in the AST.
 */
function countObjects(nodes: ASTNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.type === 'object' || node.type === 'ObjectDeclaration') {
      count++;
    }
    if (node.children) {
      count += countObjects(node.children);
    }
  }
  return count;
}

/**
 * Measure the maximum trait nesting depth across all nodes.
 */
function measureMaxTraitDepth(nodes: ASTNode[], currentDepth: number = 0): number {
  let max = currentDepth;
  for (const node of nodes) {
    const traitCount = node.traits?.length ?? 0;
    const nodeDepth = currentDepth + traitCount;
    if (nodeDepth > max) {
      max = nodeDepth;
    }
    if (node.children) {
      const childMax = measureMaxTraitDepth(node.children, nodeDepth);
      if (childMax > max) {
        max = childMax;
      }
    }
  }
  return max;
}

/**
 * Collect violations for disallowed traits found in the AST.
 */
function collectDisallowedTraitViolations(
  nodes: ASTNode[],
  disallowed: Set<string>,
  violations: SecurityViolation[]
): void {
  for (const node of nodes) {
    if (node.traits) {
      for (const trait of node.traits) {
        const normalized = trait.toLowerCase();
        if (disallowed.has(normalized)) {
          violations.push({
            category: 'disallowed_trait',
            severity: 'error',
            message: `Disallowed trait "${trait}" found on object "${node.name ?? 'unknown'}"`,
          });
        }
      }
    }
    if (node.children) {
      collectDisallowedTraitViolations(node.children, disallowed, violations);
    }
  }
}

// =============================================================================
// IMPORT VALIDATION
// =============================================================================

/**
 * Validate import declarations against network policy.
 *
 * Checks that URL-based imports only reference allowed hosts.
 */
export function validateImports(
  imports: ImportDeclaration[],
  policy: SecurityPolicy
): SecurityScanResult {
  const violations: SecurityViolation[] = [];

  // If wildcard is in allowed hosts, everything is allowed
  if (policy.network.allowedHosts.includes('*')) {
    return { passed: true, violations: [] };
  }

  const allowedSet = new Set(policy.network.allowedHosts.map((h) => h.toLowerCase()));

  for (const imp of imports) {
    // Only check URL-based imports
    if (isUrl(imp.source)) {
      try {
        const url = new URL(imp.source);
        const hostname = url.hostname.toLowerCase();
        if (!allowedSet.has(hostname)) {
          violations.push({
            category: 'network_access',
            severity: 'error',
            message: `Import from disallowed host "${hostname}": ${imp.source}`,
          });
        }
      } catch {
        violations.push({
          category: 'network_access',
          severity: 'warning',
          message: `Could not parse import URL: ${imp.source}`,
        });
      }
    }
  }

  return {
    passed: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
  };
}

/**
 * Check if a string looks like a URL.
 */
function isUrl(source: string): boolean {
  return /^https?:\/\//.test(source) || /^wss?:\/\//.test(source);
}

// =============================================================================
// VULNERABILITY SCANNING
// =============================================================================

/**
 * Dangerous patterns to scan for in source code.
 * Each pattern has a regex, a category, a severity, and a description.
 */
interface VulnerabilityPattern {
  pattern: RegExp;
  category: ViolationCategory;
  severity: ViolationSeverity;
  message: string;
}

const VULNERABILITY_PATTERNS: VulnerabilityPattern[] = [
  // Code injection via eval
  {
    pattern: /\beval\s*\(/g,
    category: 'code_injection',
    severity: 'error',
    message: 'Use of eval() detected - potential code injection vulnerability',
  },
  // Code injection via Function constructor
  {
    pattern: /\bnew\s+Function\s*\(/g,
    category: 'code_injection',
    severity: 'error',
    message: 'Use of new Function() detected - potential code injection vulnerability',
  },
  // innerHTML assignment (XSS)
  {
    pattern: /\.innerHTML\s*=/g,
    category: 'script_injection',
    severity: 'error',
    message: 'Direct innerHTML assignment detected - potential XSS vulnerability',
  },
  // outerHTML assignment (XSS)
  {
    pattern: /\.outerHTML\s*=/g,
    category: 'script_injection',
    severity: 'warning',
    message: 'Direct outerHTML assignment detected - potential XSS vulnerability',
  },
  // document.write (XSS)
  {
    pattern: /\bdocument\.write\s*\(/g,
    category: 'script_injection',
    severity: 'error',
    message: 'Use of document.write() detected - potential XSS vulnerability',
  },
  // Script tag injection
  {
    pattern: /<script[\s>]/gi,
    category: 'script_injection',
    severity: 'error',
    message: 'Script tag detected in code - potential script injection',
  },
  // Event handler injection
  {
    pattern: /\bon\w+\s*=\s*["']/g,
    category: 'script_injection',
    severity: 'warning',
    message: 'Inline event handler detected - potential script injection',
  },
  // setTimeout/setInterval with string argument
  {
    pattern: /\b(setTimeout|setInterval)\s*\(\s*["'`]/g,
    category: 'code_injection',
    severity: 'warning',
    message: 'setTimeout/setInterval with string argument detected - potential code injection',
  },
  // Prototype pollution
  {
    pattern: /__proto__/g,
    category: 'prototype_pollution',
    severity: 'error',
    message: '__proto__ access detected - potential prototype pollution',
  },
  // Constructor prototype pollution
  {
    pattern: /\bconstructor\s*\[\s*["']prototype["']\s*\]/g,
    category: 'prototype_pollution',
    severity: 'error',
    message: 'constructor.prototype access detected - potential prototype pollution',
  },
  // Dangerous process/child_process usage
  {
    pattern: /\brequire\s*\(\s*["']child_process["']\s*\)/g,
    category: 'dangerous_api',
    severity: 'error',
    message: 'child_process import detected - potential command execution vulnerability',
  },
  // exec/execSync
  {
    pattern: /\b(exec|execSync|spawn|spawnSync)\s*\(/g,
    category: 'dangerous_api',
    severity: 'warning',
    message: 'Process execution function detected - review for command injection',
  },
];

/**
 * Scan source code for common vulnerability patterns.
 *
 * Performs regex-based static analysis to detect:
 * - eval() and new Function() usage
 * - innerHTML/document.write XSS vectors
 * - Script tag injection
 * - Prototype pollution patterns
 * - Dangerous API usage (child_process, exec)
 */
export function scanForVulnerabilities(code: string): SecurityScanResult {
  const violations: SecurityViolation[] = [];
  const lines = code.split('\n');

  for (const vulnPattern of VULNERABILITY_PATTERNS) {
    // Reset regex state
    vulnPattern.pattern.lastIndex = 0;

    // Search line by line for accurate line numbers
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      vulnPattern.pattern.lastIndex = 0;
      const match = vulnPattern.pattern.exec(line);
      if (match) {
        violations.push({
          category: vulnPattern.category,
          severity: vulnPattern.severity,
          message: vulnPattern.message,
          line: i + 1,
          column: match.index + 1,
        });
      }
    }
  }

  return {
    passed: violations.filter((v) => v.severity === 'error').length === 0,
    violations,
  };
}
