/**
 * .hsplus example-freshness gaps — parser regression tests.
 *
 * Locks the grammar surface behind the A-009 .hsplus clusters (board task
 * task_1781066132329_ee2a; sibling of the .hs clusters fixed in f6ea18096):
 *
 *   - HSP300: state-machine transition shorthand as a property value:
 *       on_event: -> "target" [guard(expr)] [action(name)]
 *     used by 18 examples inside @state_machine { states: { ... } } blocks
 *   - HSP001: bare-identifier template names (template InteractiveButton {)
 *   - HSP001: wildcard import alias (@import * as NS from "./path.hsplus")
 *
 * All three were strictly-more-permissive fixes: each construct previously
 * always produced a parse error.
 */
import { describe, it, expect } from 'vitest';
import { parse } from '../../parser/HoloScriptPlusParser';

interface AnyNode {
  type?: string;
  children?: AnyNode[];
  properties?: Record<string, unknown>;
  directives?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

function parseOk(source: string): AnyNode {
  const result = parse(source);
  expect(
    result.success,
    `expected clean parse, got: ${(result.errors ?? [])
      .slice(0, 3)
      .map((e: { message?: string }) => e.message)
      .join(' | ')}`
  ).toBe(true);
  return result.ast as AnyNode;
}

/** Depth-first search for the first node of a given type anywhere in the AST. */
function findNode(root: AnyNode | undefined, type: string): AnyNode | undefined {
  if (!root) return undefined;
  if (root.type === type) return root;
  const kids = [
    ...((root.children ?? []) as AnyNode[]),
    ...((root.body as AnyNode[] | undefined) ?? []),
  ];
  for (const c of kids) {
    const hit = findNode(c, type);
    if (hit) return hit;
  }
  return undefined;
}

/** Recursively find the first value (at any depth) under the given key. */
function findValue(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== 'object') return undefined;
  const rec = obj as Record<string, unknown>;
  if (key in rec) return rec[key];
  for (const v of Object.values(rec)) {
    const hit = findValue(v, key);
    if (hit !== undefined) return hit;
  }
  return undefined;
}

// ============================================================================
// HSP300 cluster: transition shorthand in @state_machine config
// ============================================================================

describe('.hsplus transition shorthand (HSP300 cluster)', () => {
  it('parses a bare transition: on_event: -> "target"', () => {
    const ast = parseOk(`
object "agent" {
  @state_machine {
    initial: "patrolling"
    states: {
      patrolling: {
        on_anomaly_detected: -> "analyzing"
      }
    }
  }
}
`);
    const transition = findValue(ast, 'on_anomaly_detected') as Record<string, unknown>;
    expect(transition).toBeDefined();
    expect(transition.type).toBe('transition');
    expect(transition.target).toBe('analyzing');
  });

  it('parses transition with action modifier: -> "target" action(name)', () => {
    const ast = parseOk(`
object "agent" {
  @state_machine {
    states: {
      patrolling: {
        on_anomaly_detected: -> "analyzing" action(begin_analysis)
      }
    }
  }
}
`);
    const transition = findValue(ast, 'on_anomaly_detected') as Record<string, unknown>;
    expect(transition.type).toBe('transition');
    expect(transition.target).toBe('analyzing');
    expect(transition.action).toEqual({ __ref: 'begin_analysis' });
  });

  it('parses transition with guard expression: -> "target" guard(state.credits >= 10)', () => {
    const ast = parseOk(`
object "agent" {
  @state_machine {
    states: {
      analyzing: {
        on_analysis_complete: -> "mitigating" guard(state.credits >= 10)
      }
    }
  }
}
`);
    const transition = findValue(ast, 'on_analysis_complete') as Record<string, unknown>;
    expect(transition.type).toBe('transition');
    expect(transition.target).toBe('mitigating');
    expect(transition.guard).toBeDefined();
  });

  it('parses transition with both guard and action modifiers', () => {
    const ast = parseOk(`
object "agent" {
  @state_machine {
    states: {
      mitigating: {
        on_mitigation_done: -> "reporting" guard(state.ready) action(on_mitigated)
      }
    }
  }
}
`);
    const transition = findValue(ast, 'on_mitigation_done') as Record<string, unknown>;
    expect(transition.target).toBe('reporting');
    expect(transition.guard).toBeDefined();
    expect(transition.action).toEqual({ __ref: 'on_mitigated' });
  });

  it('parses inline single-line states with semicolons', () => {
    const ast = parseOk(`
object "npc" {
  @state_machine {
    initial: "guarding"
    states: {
      guarding: { on_visitor_approaches: -> "storytelling"; on_restoration_needed: -> "restoring" }
    }
  }
}
`);
    const t1 = findValue(ast, 'on_visitor_approaches') as Record<string, unknown>;
    const t2 = findValue(ast, 'on_restoration_needed') as Record<string, unknown>;
    expect(t1.target).toBe('storytelling');
    expect(t2.target).toBe('restoring');
  });

  it('does not break arrow functions: => is still a function, not a transition', () => {
    const ast = parseOk(`
object "agent" {
  @state_machine {
    states: {
      idle: { on_go: -> "running" }
    }
    actions: {
      begin: () => { state.count += 1; }
    }
  }
}
`);
    const begin = findValue(ast, 'begin') as Record<string, unknown>;
    expect(begin.type).toBe('arrow_function');
    const transition = findValue(ast, 'on_go') as Record<string, unknown>;
    expect(transition.type).toBe('transition');
  });
});

// ============================================================================
// HSP001 cluster: bare-identifier template names
// ============================================================================

describe('.hsplus bare-identifier template names (HSP001 cluster)', () => {
  it('parses template with unquoted identifier name', () => {
    const ast = parseOk(`
template InteractiveButton {
  geometry: "cylinder"
  color: "#4ecdc4"

  @clickable
  @glowing
}
`);
    const tpl = findNode(ast, 'template');
    expect(tpl).toBeDefined();
    expect(tpl?.name).toBe('InteractiveButton');
  });

  it('still parses template with quoted string name', () => {
    const ast = parseOk(`
template "BasicCube" {
  geometry: "box"
}
`);
    const tpl = findNode(ast, 'template');
    expect(tpl).toBeDefined();
    expect(tpl?.name).toBe('BasicCube');
  });
});

// ============================================================================
// HSP001 cluster: wildcard import alias
// ============================================================================

describe('.hsplus wildcard import (@import * as NS from "...")', () => {
  it('parses wildcard import with namespace alias before from', () => {
    const ast = parseOk(`
@import * as UiKit from "./components/ui.hsplus"

composition "App" {
  object "btn" {
    geometry: "box"
  }
}
`);
    const directives = (ast.directives ?? []) as Array<Record<string, unknown>>;
    const imp = directives.find((d) => d.type === 'import');
    expect(imp).toBeDefined();
    expect(imp?.isWildcard).toBe(true);
    expect(imp?.alias).toBe('UiKit');
    expect(imp?.path).toBe('./components/ui.hsplus');
  });

  it('still parses plain and aliased imports', () => {
    const ast = parseOk(`
@import "./utils/game.hsplus"
@import "./utils/game.hsplus" as GameUtils

composition "App" {
  object "x" { geometry: "box" }
}
`);
    const imports = ((ast.directives ?? []) as Array<Record<string, unknown>>).filter(
      (d) => d.type === 'import'
    );
    expect(imports.length).toBe(2);
    expect(imports[0].alias).toBe('game');
    expect(imports[1].alias).toBe('GameUtils');
  });
});
