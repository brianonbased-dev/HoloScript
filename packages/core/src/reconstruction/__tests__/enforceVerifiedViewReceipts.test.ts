/**
 * enforceVerifiedViewReceipts.test.ts — the receipt-completion helper that lets
 * agent-authored 2D surfaces (generate_semantic_ui) route through the @verified_view
 * gate by default.
 *
 * The load-bearing tests are the ROUND-TRIP (enforced source actually compiles clean
 * through the REAL Native2DCompiler gate and emits data-holo-projects) and the FALSIFIER
 * (a source whose @projects lies about its binding is rejected by that same gate). Those
 * prove the injected receipt is not theatre: it is derived from the binding the compiler
 * independently re-derives, so drift FALSIFIES. The rest pin injection/idempotency and the
 * fail-loud contract on malformed input (W.776).
 */
import { describe, it, expect } from 'vitest';
import {
  enforceVerifiedViewReceipts,
  isProvenanceComplete,
  diagnoseVerifiedView,
  derivedProjectionNode,
} from '../enforceVerifiedViewReceipts';
import { parseHolo } from '../../parser/HoloCompositionParser';
import { Native2DCompiler } from '../../compiler/Native2DCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

const react = (source: string): string => {
  const parsed = parseHolo(source);
  expect(parsed.success).toBe(true);
  expect(parsed.ast).toBeTruthy();
  return new Native2DCompiler().compile(
    parsed.ast as HoloComposition,
    '',
    undefined,
    { format: 'react' }
  ) as string;
};

// A generator-shaped surface: two data-bound stat elements, NO @projects, NO @verified_view.
const UNRECEIPTED = `composition "SemanticApp" {
  state {
    metrics: { sessions: 42, errors: 3 }
  }
  object "Root" {
    @layout { flex: "column", gap: "8px" }
    object "Sessions" {
      @text { variant: "h2" }
      @bind { state: "metrics", path: "sessions", fallback: "0" }
    }
    object "Errors" {
      @text { variant: "h2" }
      @bind { state: "metrics", path: "errors", fallback: "0" }
    }
  }
}`;

describe('enforceVerifiedViewReceipts — injection', () => {
  it('injects @projects derived from @bind for every unreceipted binding', () => {
    const out = enforceVerifiedViewReceipts(UNRECEIPTED);
    expect(out).toContain('@projects { node: "metrics.sessions" }');
    expect(out).toContain('@projects { node: "metrics.errors" }');
  });

  it('turns the gate ON: adds composition-level @verified_view when a binding exists', () => {
    const out = enforceVerifiedViewReceipts(UNRECEIPTED);
    expect(out).toMatch(/composition\s+"SemanticApp"\s*\{\s*\n\s*@verified_view/);
  });

  it('derives node from @chart / @sparkline / @model, path optional', () => {
    expect(derivedProjectionNode({ state: 'metrics', path: 'sessions' })).toBe('metrics.sessions');
    expect(derivedProjectionNode({ state: 'series' })).toBe('series');
    expect(derivedProjectionNode({ path: 'x' })).toBeNull();
    expect(derivedProjectionNode(undefined)).toBeNull();

    const chart = `composition "C" {
  state { series: { points: [1, 2, 3] } }
  object "Root" {
    object "Trend" {
      @chart { state: "series", path: "points" }
    }
  }
}`;
    expect(enforceVerifiedViewReceipts(chart)).toContain('@projects { node: "series.points" }');
  });

  it('is idempotent: a second pass changes nothing', () => {
    const once = enforceVerifiedViewReceipts(UNRECEIPTED);
    const twice = enforceVerifiedViewReceipts(once);
    expect(twice).toBe(once);
  });

  it('leaves an already-complete surface unchanged', () => {
    const complete = enforceVerifiedViewReceipts(UNRECEIPTED);
    expect(enforceVerifiedViewReceipts(complete)).toBe(complete);
  });

  it('leaves a binding-free surface unchanged (nothing to prove)', () => {
    const staticUi = `composition "Static" {
  object "Root" {
    object "Title" { @text { variant: "h3", content: "Hello" } }
  }
}`;
    expect(enforceVerifiedViewReceipts(staticUi)).toBe(staticUi);
  });

  it('returns malformed / unparseable input UNCHANGED — never silently completed (W.776)', () => {
    const junk = 'this is not holoscript at all {{{';
    expect(enforceVerifiedViewReceipts(junk)).toBe(junk);
  });
});

describe('enforceVerifiedViewReceipts — round-trip through the REAL @verified_view gate', () => {
  it('enforced output compiles clean and emits data-holo-projects for each binding', () => {
    const out = enforceVerifiedViewReceipts(UNRECEIPTED);
    const markup = react(out);
    expect(markup).toContain('data-holo-projects="metrics.sessions"');
    expect(markup).toContain('data-holo-projects="metrics.errors"');
  });

  it('FALSIFIER: a surface whose @projects lies about its binding is rejected (VIEW-UNGROUNDED)', () => {
    // Same shape, but the receipt claims "metrics.errors" while the element is bound to sessions.
    const lying = `composition "Liar" {
  @verified_view
  state { metrics: { sessions: 42, errors: 3 } }
  object "Root" {
    object "Sessions" {
      @text { variant: "h2" }
      @bind { state: "metrics", path: "sessions" }
      @projects { node: "metrics.errors" }
    }
  }
}`;
    expect(() => react(lying)).toThrow(/VIEW-UNGROUNDED/);
  });

  it('the generate_semantic_ui heuristic shape (decorative @2d_canvas/@semantic_layout + bindings) compiles clean', () => {
    // Pins the exact surface generate_semantic_ui emits: Semantic2D decorative traits
    // alongside data-bound stat readouts. Proves "routes through the gate" is not a claim.
    const heuristic = `composition "SemanticApp" {
  @2d_canvas { projection: "flat-semantic" }
  @verified_view
  state {
    metrics: { sessions: 0, errors: 0 }
  }
  object "Root" {
    @semantic_layout { flow: "column" }
    @layout { flex: "column", gap: "8px" }
    object "Title" { @text { variant: "h3", content: "Dashboard" } }
    object "Sessions" {
      @text { variant: "h2" }
      @bind { state: "metrics", path: "sessions", fallback: "0" }
      @projects { node: "metrics.sessions" }
    }
    object "Errors" {
      @text { variant: "h2" }
      @bind { state: "metrics", path: "errors", fallback: "0" }
      @projects { node: "metrics.errors" }
    }
  }
}`;
    expect(enforceVerifiedViewReceipts(heuristic)).toBe(heuristic); // already complete
    const markup = react(heuristic);
    expect(markup).toContain('data-holo-projects="metrics.sessions"');
    expect(markup).toContain('data-holo-projects="metrics.errors"');
  });

  it('a hostile description title (quotes/newlines/backslashes) sanitizes to a gate-passing surface', () => {
    // Mirrors generate_semantic_ui's title sanitizer: strip the chars that would break the
    // string literal, so an untrusted description can never produce unparseable .holo.
    const sanitize = (d: string): string =>
      d.replace(/["\\\r\n]/g, ' ').trim().slice(0, 80) || 'Semantic surface';
    const title = sanitize('Dash "board"\n rm -rf \\ <script>');
    const surface = `composition "SemanticApp" {
  @verified_view
  state { metrics: { sessions: 0 } }
  object "Root" {
    object "Title" { @text { variant: "h3", content: "${title}" } }
    object "Sessions" {
      @text { variant: "h2" }
      @bind { state: "metrics", path: "sessions", fallback: "0" }
      @projects { node: "metrics.sessions" }
    }
  }
}`;
    expect(title).not.toContain('"');
    expect(isProvenanceComplete(surface)).toBe(true);
    expect(react(surface)).toContain('data-holo-projects="metrics.sessions"');
  });

  it('FALSIFIER: @projects on a hallucinated state node is rejected', () => {
    const hallucinated = `composition "Ghost" {
  @verified_view
  state { metrics: { sessions: 42 } }
  object "Root" {
    object "Sessions" {
      @text { variant: "h2" }
      @bind { state: "metrics", path: "sessions" }
      @projects { node: "revenue.total" }
    }
  }
}`;
    expect(() => react(hallucinated)).toThrow(/VIEW-UNGROUNDED/);
  });
});

describe('isProvenanceComplete', () => {
  it('false before enforcement, true after', () => {
    expect(isProvenanceComplete(UNRECEIPTED)).toBe(false);
    expect(isProvenanceComplete(enforceVerifiedViewReceipts(UNRECEIPTED))).toBe(true);
  });

  it('false when a binding carries a mismatched @projects node', () => {
    const mismatch = `composition "M" {
  @verified_view
  state { metrics: { sessions: 42 } }
  object "Root" {
    object "S" { @bind { state: "metrics", path: "sessions" } @projects { node: "metrics.errors" } }
  }
}`;
    expect(isProvenanceComplete(mismatch)).toBe(false);
  });

  it('false when @verified_view is missing but bindings exist', () => {
    const noGate = `composition "N" {
  state { metrics: { sessions: 42 } }
  object "Root" {
    object "S" { @bind { state: "metrics", path: "sessions" } @projects { node: "metrics.sessions" } }
  }
}`;
    expect(isProvenanceComplete(noGate)).toBe(false);
  });

  it('true for a binding-free surface (nothing to prove); false for unparseable input', () => {
    const staticUi = `composition "Static" { object "Root" { object "T" { @text { content: "hi" } } } }`;
    expect(isProvenanceComplete(staticUi)).toBe(true);
    expect(isProvenanceComplete('not holoscript {{{')).toBe(false);
  });
});

describe('diagnoseVerifiedView — collect ALL violations (the compiler throws on the first)', () => {
  it('reports every ungrounded element in one pass, not just the first', () => {
    // Three distinct violations: mismatched (claim ≠ binding), missing (no receipt),
    // hallucinated (receipt matches its binding, but the binding's root isn't real state)
    // — plus the surface-level no-verified-view.
    const messy = `composition "Messy" {
  state { metrics: { sessions: 42, errors: 3 } }
  object "Root" {
    object "A" { @bind { state: "metrics", path: "sessions" } @projects { node: "metrics.errors" } }
    object "B" { @bind { state: "metrics", path: "errors" } }
    object "C" { @bind { state: "revenue", path: "q4" } @projects { node: "revenue.q4" } }
  }
}`;
    const d = diagnoseVerifiedView(messy);
    expect(d.parsed).toBe(true);
    expect(d.hasBindings).toBe(true);
    expect(d.complete).toBe(false);
    const byReason = Object.fromEntries(d.violations.map((v) => [v.reason, v]));
    expect(byReason['mismatched-node'].element).toBe('A');
    expect(byReason['missing-projects'].element).toBe('B');
    expect(byReason['hallucinated-root'].element).toBe('C');
    expect(byReason['no-verified-view']).toBeTruthy(); // binds data, no @verified_view
    expect(d.violations.length).toBe(4);
  });

  it('flags @projects on an element with no binding (a lie by construction)', () => {
    const lie = `composition "L" {
  @verified_view
  state { metrics: { sessions: 42 } }
  object "Root" {
    object "Ghost" { @text { content: "hi" } @projects { node: "metrics.sessions" } }
  }
}`;
    const d = diagnoseVerifiedView(lie);
    expect(d.violations.some((v) => v.reason === 'projects-without-binding')).toBe(true);
  });

  it('a fully honest verified surface has zero violations', () => {
    const clean = enforceVerifiedViewReceipts(UNRECEIPTED);
    const d = diagnoseVerifiedView(clean);
    expect(d.complete).toBe(true);
    expect(d.violations).toEqual([]);
    expect(d.verifiedViewOn).toBe(true);
  });

  it('unparseable input reports parsed:false, complete:false (never a false clean)', () => {
    const d = diagnoseVerifiedView('garbage {{{');
    expect(d.parsed).toBe(false);
    expect(d.complete).toBe(false);
  });

  it('isProvenanceComplete delegates to diagnoseVerifiedView', () => {
    expect(isProvenanceComplete(UNRECEIPTED)).toBe(diagnoseVerifiedView(UNRECEIPTED).complete);
  });
});
