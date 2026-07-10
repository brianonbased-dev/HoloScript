/**
 * enforceVerifiedViewReceipts — Receipt-Bound Surface admission helper (Slice 4 consumer).
 *
 * Agent-authored 2D surfaces (e.g. `generate_semantic_ui` output) must route through the
 * `@verified_view` gate: every data-bound element DECLARES what it renders
 * (`@projects { node }`) and Native2DCompiler proves that claim against the actual binding
 * (VIEW-UNGROUNDED otherwise). Freeform generators emit bindings WITHOUT the paired
 * provenance receipt, so their surfaces silently bypass the whole regime the P.UI-SHIFT
 * suite exists to enforce. This helper makes a composition provenance-COMPLETE at the
 * source level so it ships only if it can prove what it shows:
 *
 *   - for every object carrying a binding trait (`@bind`/`@chart`/`@sparkline`/`@model`)
 *     with no sibling `@projects`, inject `@projects { node: "<state>[.<path>]" }` DERIVED
 *     from that exact binding — the same path Native2DCompiler.resolveProjection re-derives,
 *     so the receipt matches BY CONSTRUCTION and any future binding/receipt drift FALSIFIES
 *     at compile time (this is why it is not theatre: the gate is still an independent check);
 *   - add composition-level `@verified_view` when any binding exists, turning the gate ON.
 *
 * Idempotent. Parse-failure or malformed input is returned UNCHANGED — never silently
 * "completed" into an agreeing-but-empty surface (W.776 lenient-recogniser lesson); the
 * downstream parse/gate then fails loud instead of shipping a lie.
 *
 * Brace matching is string-literal aware. It does not parse comments; generated `.holo`
 * carries none, and any residual mismatch is caught by {@link isProvenanceComplete}, which
 * callers use to keep-or-fall-back rather than trusting the transform blindly.
 *
 * Pairs: PerceiverConsensusReceipt (cross-perceiver contract), Native2DCompiler
 * `@verified_view` gate (resolveProjection).
 */
import { parseHolo } from '../parser/HoloCompositionParser';

/** Binding traits whose bound path Native2DCompiler.resolveProjection re-derives, in order. */
const BINDING_TRAITS: readonly string[] = ['bind', 'chart', 'sparkline', 'model'];

interface MinimalTrait {
  name?: string;
  config?: Record<string, unknown>;
}
interface MinimalObject {
  name?: string;
  traits?: MinimalTrait[];
  children?: MinimalObject[];
}
interface MinimalComposition {
  name?: string;
  traits?: MinimalTrait[];
  state?: { properties?: Array<{ key: string; value?: unknown }> };
  objects?: MinimalObject[];
}

/**
 * The parser is lenient: rootless garbage (`"garbage {{{"`, `"hello world"`) still "succeeds"
 * as an implicit, empty composition (name 'implicit', zero objects/state). A verification tool
 * that reported such input as clean would be the lenient-recogniser lie (W.776). Treat it as
 * unverifiable — while a legitimately-empty NAMED composition stays trivially complete.
 */
function isDegenerateParse(comp: MinimalComposition): boolean {
  const noRealName = !comp.name || comp.name === 'implicit';
  const noObjects = (comp.objects?.length ?? 0) === 0;
  const noState = (comp.state?.properties?.length ?? 0) === 0;
  return noRealName && noObjects && noState;
}

/**
 * Derive the projection node for a binding trait config, mirroring
 * Native2DCompiler.resolveProjection's `actualPath`: `<state>` plus `.<path>` when a
 * non-empty path is present. Returns null when the binding has no usable `state`.
 */
export function derivedProjectionNode(config: Record<string, unknown> | undefined): string | null {
  const state = config?.state;
  if (typeof state !== 'string' || !state) return null;
  const path = config?.path;
  return typeof path === 'string' && path ? `${state}.${path}` : state;
}

function firstBindingTrait(traits: MinimalTrait[]): MinimalTrait | undefined {
  return traits.find((t) => typeof t.name === 'string' && BINDING_TRAITS.includes(t.name));
}

interface InjectionTarget {
  object: string;
  node: string;
}

function collectTargets(
  objects: MinimalObject[] | undefined,
  out: InjectionTarget[],
  flags: { anyBinding: boolean }
): void {
  for (const o of objects ?? []) {
    const traits = o.traits ?? [];
    const bindTrait = firstBindingTrait(traits);
    if (bindTrait) {
      const node = derivedProjectionNode(bindTrait.config);
      if (node) {
        flags.anyBinding = true;
        const hasProjects = traits.some((t) => t.name === 'projects');
        if (!hasProjects && typeof o.name === 'string' && o.name) {
          out.push({ object: o.name, node });
        }
      }
    }
    collectTargets(o.children, out, flags);
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Given the index just past an opening `{`, return the index of its matching `}`,
 * skipping over double-quoted string literals (so a `{`/`}` inside a string does not
 * unbalance the count). Returns -1 if unbalanced.
 */
function matchBrace(source: string, bodyStart: number): number {
  let depth = 1;
  let inString = false;
  for (let i = bodyStart; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === '\\') {
        i++; // skip escaped char
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Inject `@projects { node }` as the last direct child of `object "<name>" { ... }`.
 * Position-tolerant (traits may appear in any order). Skips a block that already contains
 * `@projects` (idempotent / conservative). Injects into the first structurally-matching
 * block; duplicate-name mismatches are caught downstream by {@link isProvenanceComplete}.
 */
function injectProjectsIntoObject(source: string, objectName: string, node: string): string {
  const re = new RegExp(`object\\s+"${escapeRegExp(objectName)}"\\s*\\{`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const bodyStart = m.index + m[0].length;
    const close = matchBrace(source, bodyStart);
    if (close < 0) return source; // malformed — leave untouched
    const body = source.slice(bodyStart, close);
    if (body.includes('@projects')) {
      // already has a receipt somewhere in this block; move on to next same-named block
      re.lastIndex = close;
      continue;
    }
    const lineStart = source.lastIndexOf('\n', close - 1) + 1;
    const braceIndent = source.slice(lineStart, close).match(/^[ \t]*/)?.[0] ?? '';
    const innerIndent = braceIndent + '  ';
    const injection = `${innerIndent}@projects { node: "${node}" }\n`;
    return source.slice(0, lineStart) + injection + source.slice(lineStart);
  }
  return source; // object not found in source (shouldn't happen for a parsed name)
}

/** Insert composition-level `@verified_view` as the first trait inside the composition body. */
function injectVerifiedView(source: string): string {
  const m = /composition(?:\s+"[^"]*")?\s*\{/.exec(source);
  if (!m) return source;
  const insertAt = m.index + m[0].length;
  return `${source.slice(0, insertAt)}\n  @verified_view${source.slice(insertAt)}`;
}

/**
 * Make an agent-authored 2D composition provenance-complete for the `@verified_view` gate:
 * inject the derived `@projects` receipt for every unreceipted binding and turn the gate on.
 * Returns the source UNCHANGED when it cannot be parsed, has no data bindings, or is already
 * complete (idempotent).
 */
export function enforceVerifiedViewReceipts(source: string): string {
  let parsed: ReturnType<typeof parseHolo> | undefined;
  try {
    parsed = parseHolo(source);
  } catch {
    return source;
  }
  if (!parsed || !parsed.success || !parsed.ast) return source;
  const comp = parsed.ast as unknown as MinimalComposition;

  const targets: InjectionTarget[] = [];
  const flags = { anyBinding: false };
  collectTargets(comp.objects, targets, flags);

  const hasVerifiedView = (comp.traits ?? []).some((t) => t?.name === 'verified_view');
  const needVerifiedView = flags.anyBinding && !hasVerifiedView;

  if (targets.length === 0 && !needVerifiedView) return source;

  let out = source;
  for (const t of targets) out = injectProjectsIntoObject(out, t.object, t.node);
  if (needVerifiedView) out = injectVerifiedView(out);
  return out;
}

/** Why a surface would fail the `@verified_view` gate — mirrors resolveProjection's checks. */
export type VerifiedViewViolationReason =
  | 'missing-projects' // a data-bound element under the gate declares no @projects receipt
  | 'mismatched-node' // @projects.node names a different path than the actual binding
  | 'hallucinated-root' // @projects.node's root is not a declared state key / @fetch slot
  | 'projects-without-binding' // @projects on an element with no data binding (a lie by construction)
  | 'no-verified-view'; // the surface binds data but never opts into the gate

export interface VerifiedViewViolation {
  /** Object name (or '(composition)' for the surface-level gate violation). */
  element: string;
  /** The claimed or derived node in question (null when not applicable). */
  node: string | null;
  reason: VerifiedViewViolationReason;
  /** Human-readable explanation for the authoring agent. */
  detail: string;
}

export interface VerifiedViewDiagnosis {
  /** False when the source could not be parsed (a diagnosis cannot be trusted). */
  parsed: boolean;
  /** Whether the surface binds any data (a binding-free surface is trivially complete). */
  hasBindings: boolean;
  /** Whether composition-level `@verified_view` is present. */
  verifiedViewOn: boolean;
  /** True iff the surface would pass the gate: no violations. */
  complete: boolean;
  /** Every violation found — collected, NOT throw-on-first (that is the value over compiling). */
  violations: VerifiedViewViolation[];
}

const UNPARSEABLE: VerifiedViewDiagnosis = {
  parsed: false,
  hasBindings: false,
  verifiedViewOn: false,
  complete: false,
  violations: [],
};

/**
 * Diagnose an agent-authored 2D surface against the `@verified_view` gate, collecting EVERY
 * provenance violation (the compiler throws on the first — this reports all of them, which is
 * the value for an agent fixing a surface). Violations mirror Native2DCompiler.resolveProjection:
 * a `@projects` that names a different path than its binding, a hallucinated state root, a
 * `@projects` on an unbound element, a data-bound element with no receipt, or a surface that
 * binds data without opting into `@verified_view`. A binding-free surface is complete (nothing
 * to prove). Parse failure yields `{ parsed: false, complete: false }` — never a false "clean".
 */
export function diagnoseVerifiedView(source: string): VerifiedViewDiagnosis {
  let parsed: ReturnType<typeof parseHolo> | undefined;
  try {
    parsed = parseHolo(source);
  } catch {
    return UNPARSEABLE;
  }
  if (!parsed || !parsed.success || !parsed.ast) return UNPARSEABLE;
  const comp = parsed.ast as unknown as MinimalComposition;
  if (isDegenerateParse(comp)) return UNPARSEABLE;

  const roots = new Set<string>((comp.state?.properties ?? []).map((p) => p.key));
  const scanFetch = (objs: MinimalObject[] | undefined): void => {
    for (const o of objs ?? []) {
      for (const t of o.traits ?? []) {
        if (t.name === 'fetch') {
          const into = (t.config as { into?: unknown } | undefined)?.into;
          roots.add(typeof into === 'string' && into ? into : 'data');
        }
      }
      scanFetch(o.children);
    }
  };
  scanFetch(comp.objects);

  const verifiedViewOn = (comp.traits ?? []).some((t) => t?.name === 'verified_view');
  const violations: VerifiedViewViolation[] = [];
  let hasBindings = false;

  const walk = (objs: MinimalObject[] | undefined): void => {
    for (const o of objs ?? []) {
      const traits = o.traits ?? [];
      const el = typeof o.name === 'string' && o.name ? o.name : 'element';
      const bindTrait = firstBindingTrait(traits);
      const node = bindTrait ? derivedProjectionNode(bindTrait.config) : null;
      const projectsTrait = traits.find((t) => t.name === 'projects');
      const claimedRaw = projectsTrait?.config?.node;
      const claimed = typeof claimedRaw === 'string' ? claimedRaw : null;

      if (node) {
        hasBindings = true;
        if (!projectsTrait) {
          violations.push({
            element: el,
            node,
            reason: 'missing-projects',
            detail: `renders "${node}" but declares no @projects receipt`,
          });
        } else if (claimed !== node) {
          violations.push({
            element: el,
            node: claimed,
            reason: 'mismatched-node',
            detail: `claims to project "${claimed ?? ''}" but is bound to "${node}"`,
          });
        } else if (!roots.has(node.split('.')[0])) {
          violations.push({
            element: el,
            node,
            reason: 'hallucinated-root',
            detail: `projects "${node}" but no state node "${node.split('.')[0]}" exists`,
          });
        }
      } else if (projectsTrait) {
        violations.push({
          element: el,
          node: claimed,
          reason: 'projects-without-binding',
          detail: `claims to project "${claimed ?? ''}" but has no data binding`,
        });
      }
      walk(o.children);
    }
  };
  walk(comp.objects);

  if (hasBindings && !verifiedViewOn) {
    violations.push({
      element: '(composition)',
      node: null,
      reason: 'no-verified-view',
      detail: 'surface binds data but does not declare composition-level @verified_view',
    });
  }

  return { parsed: true, hasBindings, verifiedViewOn, complete: violations.length === 0, violations };
}

/**
 * True iff the composition would pass the `@verified_view` gate (no violations). A binding-free
 * surface is trivially complete; parse failure is NOT complete. Callers use this to
 * keep-or-fall-back after enforcement rather than trusting the text transform blindly.
 */
export function isProvenanceComplete(source: string): boolean {
  return diagnoseVerifiedView(source).complete;
}
