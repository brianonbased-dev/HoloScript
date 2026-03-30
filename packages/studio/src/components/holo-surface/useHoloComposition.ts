'use client';

/**
 * useHoloComposition — React hook that loads and hydrates a .hsplus composition.
 *
 * Fetches a composition source, parses it with HoloScriptPlusParser, extracts
 * the state/computed/logic/template/UI blocks, and returns everything the
 * HoloSurfaceRenderer needs to render a live page.
 *
 * State is kept in React state (useState) so changes trigger re-renders.
 * The emit() function processes events through the composition's logic {} handlers.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { HoloScriptPlusParser } from '@holoscript/core';
import type { HSPlusNode } from '@holoscript/core';
import type { HoloSurfaceState } from './HoloSurfaceRenderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HoloCompositionResult {
  /** UI surface nodes to render */
  nodes: HSPlusNode[];
  /** Live state object */
  state: HoloSurfaceState;
  /** Computed values derived from state */
  computed: Record<string, unknown>;
  /** Template definitions (name → properties) */
  templates: Map<string, Record<string, unknown>>;
  /** Emit an event into the composition's logic handlers */
  emit: (event: string, payload?: unknown) => void;
  /** Update state directly (for API bridge integration) */
  setState: (updates: Partial<HoloSurfaceState>) => void;
  /** Raw composition source */
  source: string;
  /** Loading state */
  loading: boolean;
  /** Error if parsing/fetching failed */
  error: string | null;
}

interface LogicHandler {
  event: string;
  params: string[];
  body: string;
}

interface ComputedDef {
  name: string;
  expression: string;
}

// ---------------------------------------------------------------------------
// AST extraction helpers
// ---------------------------------------------------------------------------

/** Find all nodes of a given type in the AST (shallow — composition children only) */
function findNodesByType(nodes: HSPlusNode[], type: string): HSPlusNode[] {
  return nodes.filter((n) => {
    const nodeType = n.properties?.type ?? n.type;
    return nodeType === type || n.type === type;
  });
}

/** Extract state block from composition */
function extractState(compositionChildren: HSPlusNode[]): HoloSurfaceState {
  // Look for state blocks — they may be in stateBlock property or as child nodes
  for (const child of compositionChildren) {
    if (child.type === 'state' || child.name === 'state') {
      if (child.stateBlock) return { ...child.stateBlock };
      if (child.body && typeof child.body === 'object')
        return { ...(child.body as Record<string, unknown>) };
      if (child.properties) return { ...child.properties };
    }
    // Also check stateBlock on the composition root
    if (child.stateBlock) return { ...child.stateBlock };
  }
  return {};
}

/** Extract computed definitions from the composition */
function extractComputedDefs(compositionChildren: HSPlusNode[]): ComputedDef[] {
  const defs: ComputedDef[] = [];
  for (const child of compositionChildren) {
    if (child.type === 'computed' || child.name === 'computed') {
      const body = (child.body ?? child.properties ?? {}) as Record<string, unknown>;
      for (const [name, expr] of Object.entries(body)) {
        if (typeof expr === 'string') {
          defs.push({ name, expression: expr });
        }
      }
    }
  }
  return defs;
}

/** Evaluate computed values from their definitions */
function evaluateComputedValues(
  defs: ComputedDef[],
  state: HoloSurfaceState
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const def of defs) {
    try {
      // Replace $var with state lookups
      const transformed = def.expression.replace(
        /\$([a-zA-Z_][a-zA-Z0-9_]*)/g,
        (_, varName) => varName
      );
      const keys = Object.keys(state);
      const values = Object.values(state);
      const fn = new Function(
        ...keys,
        'Math',
        'String',
        'Number',
        'Boolean',
        'Date',
        'JSON',
        'Array',
        `"use strict"; return (${transformed})`
      );
      result[def.name] = fn(...values, Math, String, Number, Boolean, Date, JSON, Array);
    } catch {
      result[def.name] = undefined;
    }
  }
  return result;
}

/** Extract template definitions */
function extractTemplates(compositionChildren: HSPlusNode[]): Map<string, Record<string, unknown>> {
  const templates = new Map<string, Record<string, unknown>>();
  for (const child of compositionChildren) {
    if (child.type === 'template' && child.name) {
      templates.set(child.name, { ...(child.properties ?? {}) });
    }
  }
  return templates;
}

/** Extract UI surface nodes (objects with type: "ui" or uiType) */
function extractUINodes(compositionChildren: HSPlusNode[]): HSPlusNode[] {
  return compositionChildren.filter((child) => {
    const type = child.properties?.type ?? child.type;
    const uiType = child.properties?.uiType;
    return type === 'ui' || uiType === 'panel' || uiType === 'text' || uiType === 'button';
  });
}

/** Extract logic event handlers */
function extractLogicHandlers(compositionChildren: HSPlusNode[]): LogicHandler[] {
  const handlers: LogicHandler[] = [];
  for (const child of compositionChildren) {
    if (child.type === 'logic' || child.name === 'logic') {
      const body = child.body as { eventHandlers?: LogicHandler[] } | undefined;
      if (body?.eventHandlers) {
        handlers.push(...body.eventHandlers);
      }
    }
  }
  return handlers;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useHoloComposition(sourceUrl: string): HoloCompositionResult {
  const [source, setSource] = useState('');
  const [state, setStateInternal] = useState<HoloSurfaceState>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Parsed artifacts — stable across renders
  const [nodes, setNodes] = useState<HSPlusNode[]>([]);
  const [computedDefs, setComputedDefs] = useState<ComputedDef[]>([]);
  const [templates, setTemplates] = useState<Map<string, Record<string, unknown>>>(new Map());
  const logicHandlersRef = useRef<LogicHandler[]>([]);

  // Fetch and parse composition
  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await fetch(sourceUrl);
        const data = await res.json();
        const code = data.code ?? data.source ?? '';

        if (!mounted) return;
        setSource(code);

        if (!code) {
          setLoading(false);
          return;
        }

        // Parse
        const parser = new HoloScriptPlusParser();
        const result = parser.parse(code);

        if (!result.success || !result.ast) {
          setError('Failed to parse composition');
          setLoading(false);
          return;
        }

        // The AST root should be a composition node
        const root = result.ast.root ?? result.ast.body?.[0];
        const children = root?.children ?? result.ast.body ?? [];

        // Extract blocks
        const extractedState = extractState(children);
        const extractedComputed = extractComputedDefs(children);
        const extractedTemplates = extractTemplates(children);
        const extractedUI = extractUINodes(children);
        const extractedLogic = extractLogicHandlers(children);

        if (mounted) {
          setStateInternal(extractedState);
          setComputedDefs(extractedComputed);
          setTemplates(extractedTemplates);
          setNodes(extractedUI);
          logicHandlersRef.current = extractedLogic;
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load composition');
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [sourceUrl]);

  // Compute values whenever state changes
  const computed = useMemo(
    () => evaluateComputedValues(computedDefs, state),
    [computedDefs, state]
  );

  // setState: merge updates into state
  const setState = useCallback((updates: Partial<HoloSurfaceState>) => {
    setStateInternal((prev) => ({ ...prev, ...updates }));
  }, []);

  // emit: process events through logic handlers, then call external handler
  const emit = useCallback(
    (event: string, payload?: unknown) => {
      // Find matching logic handlers
      for (const handler of logicHandlersRef.current) {
        if (handler.event === event) {
          try {
            // Execute the handler body with state context
            // The handler body references $var for state updates
            // For now, we support simple $var = value assignments
            const body = handler.body;
            if (typeof body === 'string') {
              // Extract $var = expr assignments
              const assignments = body.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*([^;\n]+)/g);
              if (assignments) {
                const updates: Partial<HoloSurfaceState> = {};
                for (const assignment of assignments) {
                  const match = assignment.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)/);
                  if (match) {
                    const [, varName, expr] = match;
                    try {
                      // Evaluate the expression
                      const payloadObj = payload as Record<string, unknown> | undefined;
                      const context = { ...state, ...computed, event: payloadObj };
                      const transformed = expr.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, v) => v);
                      // Also replace event.field with event?.field
                      const withEvent = transformed.replace(
                        /event\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
                        'event?.$1'
                      );
                      const keys = Object.keys(context);
                      const values = Object.values(context);
                      const fn = new Function(...keys, `"use strict"; return (${withEvent})`);
                      updates[varName] = fn(...values);
                    } catch {
                      // Skip failed expressions
                    }
                  }
                }
                if (Object.keys(updates).length > 0) {
                  setState(updates);
                }
              }
            }
          } catch {
            // Handler execution failed — skip
          }
        }
      }
    },
    [state, computed, setState]
  );

  return {
    nodes,
    state,
    computed,
    templates,
    emit,
    setState,
    source,
    loading,
    error,
  };
}
