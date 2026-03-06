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
} from '@holoscript/core';

// ---------------------------------------------------------------------------
// AST Bridge: HSPlusNode → EffectASTNode
// ---------------------------------------------------------------------------

/**
 * Extract EffectASTNodes from the parsed HSPlus AST.
 *
 * The parser produces HSPlusNode with:
 * - directives[].type === 'trait' → trait names (without @)
 * - traits: Map<VRTraitName, any> → pre-processed traits
 * - children: HSPlusNode[] → nested definitions
 *
 * The safety pass expects EffectASTNode with:
 * - traits: string[] → trait names (with @ prefix)
 * - calls: string[] → built-in function names
 */
export function extractEffectNodes(ast: any): EffectASTNode[] {
  const nodes: EffectASTNode[] = [];

  function extractTraits(node: any): string[] {
    const traits: string[] = [];

    // Source 1: directives array (type === 'trait')
    if (Array.isArray(node.directives)) {
      for (const d of node.directives) {
        if (d.type === 'trait' && d.name) {
          const name = d.name.startsWith('@') ? d.name : `@${d.name}`;
          traits.push(name);
        }
      }
    }

    // Source 2: pre-processed traits Map
    if (node.traits instanceof Map) {
      for (const [traitName] of node.traits) {
        const name = `@${traitName}`;
        if (!traits.includes(name)) {
          traits.push(name);
        }
      }
    }

    return traits;
  }

  function extractCalls(node: any): string[] {
    const calls: string[] = [];

    function walkForCalls(n: any) {
      if (!n) return;

      // function_call nodes
      if (n.type === 'function_call' || n.type === 'call_expression') {
        const name = n.name || n.callee || n.id;
        if (typeof name === 'string') calls.push(name);
      }

      // method property
      if (n.method && typeof n.method === 'string') {
        calls.push(n.method);
      }

      // Recurse into children, body, arguments
      if (Array.isArray(n.children)) {
        for (const child of n.children) walkForCalls(child);
      }
      if (Array.isArray(n.body)) {
        for (const stmt of n.body) walkForCalls(stmt);
      }
      if (n.body && typeof n.body === 'object' && !Array.isArray(n.body)) {
        walkForCalls(n.body);
      }
      if (Array.isArray(n.arguments)) {
        for (const arg of n.arguments) walkForCalls(arg);
      }
    }

    walkForCalls(node);
    return calls;
  }

  function visit(node: any) {
    if (!node || typeof node !== 'object') return;

    const traits = extractTraits(node);
    const calls = extractCalls(node);

    // Only create an EffectASTNode if there are traits or calls to analyze
    if (traits.length > 0 || calls.length > 0) {
      const effectNode: EffectASTNode = {
        type: node.type || 'unknown',
        name: node.id || node.name || '<anonymous>',
        traits,
        calls,
        line: node.loc?.start?.line || node.line,
        column: node.loc?.start?.column || node.column,
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
  const topLevel = ast?.children || ast?.body || [];
  if (Array.isArray(topLevel)) {
    for (const node of topLevel) visit(node);
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
    severity: v.severity === 'error'
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
    severity: d.severity === 'error'
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
  ast: any,
  uri: string,
  config?: Partial<SafetyDiagnosticConfig>,
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

    return diagnostics;
  } catch (err) {
    console.error(
      `[Safety] Diagnostic pass failed for ${uri}: ${err instanceof Error ? err.message : err}`,
    );
    return [];
  }
}
