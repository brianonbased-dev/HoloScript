/**
 * @fileoverview Safety Diagnostics Bridge
 *
 * Bridges the parsed HSPlus AST to the compile-time safety pass,
 * converting safety violations into LSP Diagnostic objects for
 * real-time editor feedback.
 *
 * Flow: HSPlusNode[] → EffectASTNode[] → runSafetyPass() → Diagnostic[]
 */

import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver/node.js';
import {
  runSafetyPass,
  type SafetyPassConfig,
  type EffectASTNode,
  type SafetyPassResult,
  type EffectViolation,
  type BudgetDiagnostic,
  type CapabilityRequirement,
  type LinearViolation,
} from '@holoscript/core';

// ---------------------------------------------------------------------------
// AST Bridge: HSPlusNode → EffectASTNode
// ---------------------------------------------------------------------------

/** Minimal shape of an HSPlus AST node for safety analysis. */
interface SafetyASTInput {
  type?: string;
  id?: string;
  name?: string;
  directives?: Array<{ type: string; name?: string }>;
  traits?: Map<string, unknown>;
  children?: SafetyASTInput[];
  body?: SafetyASTInput[] | SafetyASTInput;
  arguments?: SafetyASTInput[];
  method?: string;
  callee?: string;
  loc?: { start?: { line?: number; column?: number } };
  line?: number;
  column?: number;
  [key: string]: unknown;
}

function asSafetyASTInput(value: unknown): SafetyASTInput | undefined {
  return typeof value === 'object' && value !== null
    ? (value as SafetyASTInput)
    : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Extract EffectASTNodes from the parsed HSPlus AST.
 *
 * The parser produces HSPlusNode with:
 * - directives[].type === 'trait' → trait names (without @)
 * - traits: Map<VRTraitName, unknown> → pre-processed traits
 * - children: HSPlusNode[] → nested definitions
 *
 * The safety pass expects EffectASTNode with:
 * - traits: string[] → trait names (with @ prefix)
 * - calls: string[] → built-in function names
 */
export function extractEffectNodes(ast: unknown): EffectASTNode[] {
  const nodes: EffectASTNode[] = [];
  const root = asSafetyASTInput(ast);
  if (!root) return nodes;

  function extractTraits(node: SafetyASTInput): string[] {
    const traits: string[] = [];

    // Source 1: directives array (type === 'trait')
    if (Array.isArray(node.directives)) {
      for (const candidate of node.directives as unknown[]) {
        const directive = asSafetyASTInput(candidate);
        const directiveName = stringValue(directive?.name);
        if (directive?.type === 'trait' && directiveName) {
          const name = directiveName.startsWith('@') ? directiveName : `@${directiveName}`;
          traits.push(name);
        }
      }
    }

    // Source 2: pre-processed traits Map
    if (node.traits instanceof Map) {
      for (const [traitName] of node.traits) {
        if (typeof traitName !== 'string') continue;
        const name = `@${traitName}`;
        if (!traits.includes(name)) {
          traits.push(name);
        }
      }
    }

    return traits;
  }

  function extractCalls(node: SafetyASTInput): string[] {
    const calls: string[] = [];
    const visited = new Set<object>();

    function walkForCalls(value: unknown) {
      const n = asSafetyASTInput(value);
      if (!n || visited.has(n)) return;
      visited.add(n);

      // function_call nodes
      if (n.type === 'function_call' || n.type === 'call_expression') {
        const name = stringValue(n.name) ?? stringValue(n.callee) ?? stringValue(n.id);
        if (name) calls.push(name);
      }

      // method property
      const method = stringValue(n.method);
      if (method) {
        calls.push(method);
      }

      // Recurse into children, body, arguments
      if (Array.isArray(n.children)) {
        for (const child of n.children) walkForCalls(child);
      }
      if (Array.isArray(n.body)) {
        for (const stmt of n.body) walkForCalls(stmt);
      }
      if (asSafetyASTInput(n.body) && !Array.isArray(n.body)) {
        walkForCalls(n.body);
      }
      if (Array.isArray(n.arguments)) {
        for (const arg of n.arguments) walkForCalls(arg);
      }
    }

    walkForCalls(node);
    return calls;
  }

  const visited = new Set<object>();

  function visit(value: unknown) {
    const node = asSafetyASTInput(value);
    if (!node || visited.has(node)) return;
    visited.add(node);

    const traits = extractTraits(node);
    const calls = extractCalls(node);
    const loc = asSafetyASTInput(node.loc);
    const start = asSafetyASTInput(loc?.start);

    // Only create an EffectASTNode if there are traits or calls to analyze
    if (traits.length > 0 || calls.length > 0) {
      const effectNode: EffectASTNode = {
        type: stringValue(node.type) ?? 'unknown',
        name: stringValue(node.id) ?? stringValue(node.name) ?? '<anonymous>',
        traits,
        calls,
        line: numberValue(start?.line) ?? numberValue(node.line),
        column: numberValue(start?.column) ?? numberValue(node.column),
      };

      // Don't recurse children into EffectASTNode.children --
      // the safety pass handles flat arrays. Recursion would
      // double-count effects from nested nodes.
      nodes.push(effectNode);
    }

    // Continue visiting child nodes at the AST level
    if (Array.isArray(node.children)) {
      for (const child of node.children) visit(child);
    }
  }

  // The AST root has either .children or .body
  const topLevel = root.children || root.body || [];
  if (Array.isArray(topLevel)) {
    for (const node of topLevel) visit(node);
  } else {
    visit(topLevel);
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// Diagnostic Conversion
// ---------------------------------------------------------------------------

function effectViolationToDiag(v: EffectViolation): Diagnostic {
  const line = (v.source?.line || 1) - 1;
  const col = v.source?.column || 0;

  return {
    severity:
      v.severity === 'error'
        ? DiagnosticSeverity.Error
        : v.severity === 'warning'
          ? DiagnosticSeverity.Warning
          : DiagnosticSeverity.Information,
    range: {
      start: { line, character: col },
      end: { line, character: col + 30 },
    },
    message: v.message,
    source: 'holoscript-safety',
    code: `effect:${v.effect}`,
  };
}

function budgetDiagToDiag(d: BudgetDiagnostic): Diagnostic {
  return {
    severity:
      d.severity === 'error'
        ? DiagnosticSeverity.Error
        : d.severity === 'warning'
          ? DiagnosticSeverity.Warning
          : DiagnosticSeverity.Information,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    message: d.message,
    source: 'holoscript-safety',
    code: `budget:${d.category}`,
  };
}

/**
 * Convert a missing capability requirement into an LSP diagnostic error.
 *
 * Creates a diagnostic error message for when a HoloScript composition requires
 * a capability that is not available in the current platform or context.
 *
 * @param cap - The missing capability requirement containing scope and reason
 * @returns A diagnostic error positioned at the start of the document
 *
 * @example
 * ```typescript
 * const cap = { scope: 'handTracking', reason: 'Required for grab interactions' };
 * const diag = missingCapToDiag(cap);
 * // Returns diagnostic: "Missing capability 'handTracking': Required for grab interactions"
 * ```
 */
function missingCapToDiag(cap: CapabilityRequirement): Diagnostic {
  return {
    severity: DiagnosticSeverity.Error,
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 1 },
    },
    message: `Missing capability '${cap.scope}': ${cap.reason}`,
    source: 'holoscript-safety',
    code: `capability:${cap.scope}`,
  };
}

function linearViolationToDiag(v: LinearViolation): Diagnostic {
  const line = (v.location?.line || 1) - 1;
  const col = v.location?.column || 0;

  return {
    severity: v.severity === 'error' ? DiagnosticSeverity.Error : DiagnosticSeverity.Warning,
    range: {
      start: { line, character: col },
      end: { line, character: col + 30 },
    },
    message: v.message,
    source: 'holoscript-safety',
    code: `linear:${v.kind}`,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SafetyDiagnosticConfig {
  targetPlatforms: string[];
  trustLevel: string;
  enabled: boolean;
}

const DEFAULT_CONFIG: SafetyDiagnosticConfig = {
  targetPlatforms: ['quest3', 'webgpu'],
  trustLevel: 'basic',
  enabled: true,
};

/**
 * Run the compile-time safety pass on a parsed AST and return LSP diagnostics.
 *
 * This is the single entry point for the LSP server to call.
 */
export function runSafetyDiagnostics(
  ast: unknown,
  uri: string,
  config?: Partial<SafetyDiagnosticConfig>
): Diagnostic[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  if (!cfg.enabled) return [];

  try {
    const effectNodes = extractEffectNodes(ast);
    if (effectNodes.length === 0) return [];

    const result = runSafetyPass(effectNodes, {
      moduleId: uri,
      targetPlatforms: cfg.targetPlatforms,
      trustLevel: cfg.trustLevel,
    });

    const diagnostics: Diagnostic[] = [];

    // Effect violations
    for (const v of result.report.effects.violations) {
      diagnostics.push(effectViolationToDiag(v));
    }

    // Budget diagnostics (only errors and warnings, skip info)
    for (const d of result.report.budget.diagnostics) {
      if (d.severity === 'info') continue;
      diagnostics.push(budgetDiagToDiag(d));
    }

    // Missing capabilities
    for (const cap of result.report.capabilities.missing) {
      diagnostics.push(missingCapToDiag(cap));
    }

    // Linear type violations
    for (const v of result.report.linear.violations) {
      diagnostics.push(linearViolationToDiag(v));
    }

    return diagnostics;
  } catch (err) {
    console.error(
      `[Safety] Diagnostic pass failed for ${uri}: ${err instanceof Error ? err.message : err}`
    );
    return [];
  }
}
