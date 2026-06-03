'use client';

/**
 * HoloSurfaceRenderer — Renders .hsplus UI surface objects as React DOM elements.
 *
 * This is the key component that closes G.ARCH.001: it turns native HoloScript
 * compositions into live, interactive pages. The parser already produces AST nodes
 * with `type: "ui"` and properties like `uiType`, `backgroundColor`, `position`,
 * `width`, `height`, `text`, `fontSize`, etc. This component walks that tree and
 * renders each node as a React element.
 *
 * @see compositions/holodaemon.hsplus — first composition with a full UI surface
 * @see packages/core/src/state/ReactiveState.ts — ExpressionEvaluator for $var
 */

import React, { useMemo, useCallback } from 'react';
import type { HSPlusNode } from '@holoscript/core';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HoloSurfaceState {
  [key: string]: unknown;
}

export interface HoloSurfaceProps {
  /** Root AST nodes to render (typically the UI surface objects from a composition) */
  nodes: HSPlusNode[];
  /** Live state — keys are state variable names, values are current values */
  state: HoloSurfaceState;
  /** Computed values derived from state */
  computed?: Record<string, unknown>;
  /** Template definitions from the composition (name → default properties) */
  templates?: Map<string, Record<string, unknown>>;
  /** Event emitter for button clicks and interactions */
  onEmit?: (event: string, payload?: unknown) => void;
  /** Optional className for the root wrapper */
  className?: string;
}

// ---------------------------------------------------------------------------
// Expression evaluation
// ---------------------------------------------------------------------------

/**
 * Resolves a property value that may contain $stateVar references.
 * Handles:
 *   - Direct $var references: "$qualityScore" → state.qualityScore
 *   - Expressions: "String($qualityPercent) + '%'" → evaluated
 *   - Static values: "#22c55e" → passed through
 */
function resolveValue(
  value: unknown,
  state: HoloSurfaceState,
  computed: Record<string, unknown>
): unknown {
  if (value === null || value === undefined) return value;

  // Arrays: resolve each element (could be a Vector3 tuple or a list of nodes)
  if (Array.isArray(value)) {
    return value.map((v) => resolveValue(v, state, computed));
  }

  // Handle AST objects from the modern parser
  if (value && typeof value === 'object') {
    const obj = value as Record<string, any>;

    // Case 1: Simple reference { __ref: "$var" }
    if ('__ref' in obj && typeof obj.__ref === 'string') {
      const ref = obj.__ref;
      if (ref.startsWith('$')) {
        const varName = ref.slice(1);
        if (varName in computed) return computed[varName];
        return resolveNestedValue(state, varName);
      }
      return ref;
    }

    // Case 2: Binary/Ternary/Call expressions
    if ('type' in obj && ['binary', 'ternary', 'call', 'literal'].includes(obj.type)) {
      return evaluateAST(obj, state, computed);
    }

    // Regular object (like {x,y,z} or Vector3 tuple if not caught as array)
    // Pass through if it's not a known AST node type
    return value;
  }

  // String: check for inline $var or expressions
  if (typeof value === 'string') {
    const str = value as string;

    // Exact $var reference (no expression around it)
    if (/^\$[a-zA-Z_][a-zA-Z0-9_.]*$/.test(str)) {
      const varName = str.slice(1);
      if (varName in computed) return computed[varName];
      return resolveNestedValue(state, varName);
    }

    // String contains $var references or expressions — evaluate
    if (str.includes('$')) {
      return evaluateExpression(str, state, computed);
    }
  }

  return value;
}

/** Recursively evaluate an AST expression node */
function evaluateAST(
  node: Record<string, any>,
  state: HoloSurfaceState,
  computed: Record<string, unknown>
): unknown {
  switch (node.type) {
    case 'literal':
      return node.value;

    case 'binary': {
      const left = resolveValue(node.left, state, computed) as any;
      const right = resolveValue(node.right, state, computed) as any;
      switch (node.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
        case '%':
          return left % right;
        case '==':
          return left == right;
        case '!=':
          return left != right;
        case '>':
          return left > right;
        case '<':
          return left < right;
        case '>=':
          return left >= right;
        case '<=':
          return left <= right;
        case '&&':
          return left && right;
        case '||':
          return left || right;
        default:
          return undefined;
      }
    }

    case 'ternary': {
      const condition = resolveValue(node.condition, state, computed);
      return condition
        ? resolveValue(node.trueValue, state, computed)
        : resolveValue(node.falseValue, state, computed);
    }

    case 'call': {
      // Basic support for String(), Number(), and method calls on state vars
      const callee = node.callee as string;
      const args = Array.isArray(node.args)
        ? node.args.map((a: any) => resolveValue(a, state, computed))
        : [resolveValue(node.args, state, computed)];

      if (callee === 'String') return String(args[0]);
      if (callee === 'Number') return Number(args[0]);
      if (callee === 'Boolean') return Boolean(args[0]);

      // Handle method calls like $var.toFixed(2)
      if (callee.includes('.')) {
        const parts = callee.split('.');
        const methodName = parts.pop()!;
        const targetRef = parts.join('.');
        const targetValue = resolveValue({ __ref: targetRef }, state, computed) as any;
        if (targetValue && typeof targetValue[methodName] === 'function') {
          return targetValue[methodName](...args);
        }
      }
      return undefined;
    }

    default:
      return undefined;
  }
}

/** Resolve dotted paths like "agents.filter(...)" from state */
function resolveNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** Evaluate an expression string with $var references replaced by state values */
function evaluateExpression(
  expr: string,
  state: HoloSurfaceState,
  computed: Record<string, unknown>
): unknown {
  try {
    // Build context: merge state + computed, prefix-stripped
    const context: Record<string, unknown> = { ...state, ...computed };

    // Replace $varName with context lookups
    const transformed = expr.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, varName) => varName);

    const contextKeys = Object.keys(context);
    const contextValues = Object.values(context);

    const fn = new Function(
      ...contextKeys,
      'Math',
      'String',
      'Number',
      'Boolean',
      'Date',
      'JSON',
      'Array',
      `"use strict"; return (${transformed})`
    );

    return fn(...contextValues, Math, String, Number, Boolean, Date, JSON, Array);
  } catch {
    // Expression failed — return the raw string
    return expr;
  }
}

// ---------------------------------------------------------------------------
// Node renderer
// ---------------------------------------------------------------------------

function renderNode(
  node: HSPlusNode,
  state: HoloSurfaceState,
  computed: Record<string, unknown>,
  templates: Map<string, Record<string, unknown>>,
  onEmit: (event: string, payload?: unknown) => void,
  key: string
): React.ReactNode {
  const props = node.properties ?? {};

  // Merge template defaults if using "X"
  const templateRef = props.__templateRef as string | undefined;
  const templateDefaults = templateRef ? (templates.get(templateRef) ?? {}) : {};
  const merged = { ...templateDefaults, ...props };

  const uiType = resolveValue(merged.uiType ?? merged.type, state, computed) as string;

  // Skip non-UI nodes (behavior trees, logic blocks, etc.)
  if (
    uiType !== 'panel' &&
    uiType !== 'text' &&
    uiType !== 'button' &&
    uiType !== 'input' &&
    uiType !== 'progress' &&
    uiType !== 'ui' &&
    uiType !== 'list' &&
    uiType !== 'repeat' &&
    uiType !== 'image' &&
    uiType !== 'icon'
  ) {
    return null;
  }

  // Conditional visibility — `visible`/`show`/`if` gates whether the node renders
  // at all. Lets a composition express loading/empty/populated states natively
  // (e.g. visible: $showEmpty) instead of branching in the host TSX.
  const visibleRaw = merged.visible ?? merged.show ?? merged.if;
  if (visibleRaw !== undefined) {
    const isVisible = resolveValue(visibleRaw, state, computed);
    if (!isVisible) return null;
  }

  // Resolve all properties
  const width = resolveValue(merged.width, state, computed) as number | undefined;
  const height = resolveValue(merged.height, state, computed) as number | undefined;
  const position = resolveValue(merged.position, state, computed) as [number, number] | undefined;
  const bgColor = resolveValue(merged.backgroundColor, state, computed) as string | undefined;
  const borderColor = resolveValue(merged.borderColor, state, computed) as string | undefined;
  const cornerRadius = resolveValue(merged.cornerRadius, state, computed) as number | undefined;
  const padding = resolveValue(merged.padding, state, computed) as number | undefined;
  const text = resolveValue(merged.text, state, computed);
  const fontSize = resolveValue(merged.fontSize, state, computed) as number | undefined;
  const fontWeight = resolveValue(merged.fontWeight, state, computed) as string | undefined;
  const color = resolveValue(merged.color, state, computed) as string | undefined;
  const onClick = merged.onClick as string | undefined;

  // Build inline styles
  const style: React.CSSProperties = {};

  if (width !== undefined) style.width = width;
  if (height !== undefined) style.height = height;
  if (bgColor) style.backgroundColor = bgColor;
  if (borderColor) {
    style.borderWidth = 1;
    style.borderStyle = 'solid';
    style.borderColor = borderColor;
  }
  if (cornerRadius !== undefined) style.borderRadius = cornerRadius;
  if (padding !== undefined) style.padding = padding;
  if (fontSize !== undefined) style.fontSize = fontSize;
  if (fontWeight) style.fontWeight = fontWeight;
  if (color) style.color = color;

  // Position: use absolute within parent if specified
  if (position && Array.isArray(position) && position.length >= 2) {
    style.position = 'absolute';
    style.left = position[0];
    style.top = position[1];
  }

  // Flow layout — `direction`/`layout: "row"|"column"` opt a node into flexbox so
  // children stack (lists), sit in a row (cards), grow (`grow: 1`), and space out
  // (`gap`). This is the layout half of the native-body keystone: lists need
  // vertical flow with gaps, rows need horizontal flow — neither is expressible
  // with absolute positioning alone, and every page body reuses both.
  const layoutVal = resolveValue(merged.display ?? merged.layout, state, computed) as
    | string
    | undefined;
  const direction = resolveValue(merged.direction ?? merged.flexDirection, state, computed) as
    | string
    | undefined;
  const dir = direction ?? (layoutVal === 'row' || layoutVal === 'column' ? layoutVal : undefined);
  if (layoutVal === 'flex' || dir) {
    style.display = 'flex';
    if (dir) style.flexDirection = dir as React.CSSProperties['flexDirection'];
  } else if (layoutVal) {
    style.display = layoutVal as React.CSSProperties['display'];
  }
  const gap = resolveValue(merged.gap, state, computed) as number | undefined;
  if (gap !== undefined) style.gap = gap;
  const justify = resolveValue(merged.justify ?? merged.justifyContent, state, computed) as
    | string
    | undefined;
  if (justify) style.justifyContent = justify;
  const align = resolveValue(merged.align ?? merged.alignItems, state, computed) as
    | string
    | undefined;
  if (align) style.alignItems = align;
  const grow = resolveValue(merged.grow ?? merged.flexGrow, state, computed) as number | undefined;
  if (grow !== undefined) style.flexGrow = grow;
  const margin = resolveValue(merged.margin, state, computed) as number | undefined;
  if (margin !== undefined) style.margin = margin;
  const marginTop = resolveValue(merged.marginTop, state, computed) as number | undefined;
  if (marginTop !== undefined) style.marginTop = marginTop;
  const marginBottom = resolveValue(merged.marginBottom, state, computed) as number | undefined;
  if (marginBottom !== undefined) style.marginBottom = marginBottom;
  const textAlign = resolveValue(merged.textAlign, state, computed) as string | undefined;
  if (textAlign) style.textAlign = textAlign as React.CSSProperties['textAlign'];

  // Leaf + iteration node types — handled before the generic child pass.

  // image — bind src/alt from state, render an <img>.
  if (uiType === 'image') {
    const src = resolveValue(merged.src ?? merged.source, state, computed) as string | undefined;
    const alt = resolveValue(merged.alt ?? merged.text, state, computed);
    return (
      <img key={key} style={style} data-holo-node={node.name} src={src ?? ''} alt={String(alt ?? '')} />
    );
  }

  // icon — render a marker span carrying the icon name (host CSS/font maps it).
  if (uiType === 'icon') {
    const iconName = resolveValue(merged.name ?? merged.icon ?? merged.text, state, computed);
    return (
      <span
        key={key}
        style={style}
        data-holo-node={node.name}
        data-holo-icon={String(iconName ?? '')}
        aria-hidden="true"
      />
    );
  }

  // list / repeat — iterate a state/computed array, rendering this node's children
  // as the per-item template. Each item's own fields are merged into the row's
  // state (so `$name` resolves to item.name), plus `$item` and `$index`. A row's
  // emit defaults its payload to the item, so `onClick: "open"` → onEmit('open', item).
  if (uiType === 'list' || uiType === 'repeat') {
    const sourceRaw = merged.items ?? merged.each ?? merged.source ?? merged.data;
    const arr = resolveValue(sourceRaw, state, computed);
    const items = Array.isArray(arr) ? arr : [];
    const rowTemplate = node.children ?? [];
    if (!style.position) style.position = 'relative';
    return (
      <div key={key} style={style} data-holo-node={node.name} data-holo-list>
        {items.map((item, idx) => {
          const itemObj =
            item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
          const itemState: HoloSurfaceState = { ...state, ...itemObj, item, index: idx };
          const rowEmit = (event: string, payload?: unknown) =>
            onEmit(event, payload === undefined ? item : payload);
          return (
            <React.Fragment key={`${key}-i${idx}`}>
              {rowTemplate.map((child, ci) =>
                renderNode(
                  child,
                  itemState,
                  computed,
                  templates,
                  rowEmit,
                  `${key}-i${idx}-${child.name ?? ci}`
                )
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  }

  // Render children
  const children = (node.children ?? []).map((child, i) =>
    renderNode(child, state, computed, templates, onEmit, `${key}-${child.name ?? i}`)
  );

  // Render based on uiType
  switch (uiType) {
    case 'text':
      return (
        <span key={key} style={style} data-holo-node={node.name}>
          {String(text ?? '')}
        </span>
      );

    case 'button':
      return (
        <button
          key={key}
          style={style}
          data-holo-node={node.name}
          onClick={() => {
            if (onClick) onEmit(onClick);
          }}
        >
          {String(text ?? '')}
          {children}
        </button>
      );

    case 'input':
      return (
        <input
          key={key}
          style={style}
          data-holo-node={node.name}
          value={String(text ?? '')}
          readOnly
        />
      );

    case 'panel':
    case 'ui':
    default:
      // Panels need relative positioning to contain absolute children
      if (!style.position) {
        style.position = 'relative';
      }
      return (
        <div key={key} style={style} data-holo-node={node.name}>
          {children}
        </div>
      );
  }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function HoloSurfaceRenderer({
  nodes,
  state,
  computed: computedProps = {},
  templates: templatesProp,
  onEmit,
  className,
}: HoloSurfaceProps) {
  const templates = useMemo(
    () => templatesProp ?? new Map<string, Record<string, unknown>>(),
    [templatesProp]
  );

  const emit = useCallback(
    (event: string, payload?: unknown) => {
      if (onEmit) onEmit(event, payload);
    },
    [onEmit]
  );

  return (
    <div className={className} data-holo-surface>
      {nodes.map((node, i) =>
        renderNode(node, state, computedProps, templates, emit, node.name ?? `root-${i}`)
      )}
    </div>
  );
}
