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
  traits?: MinimalTrait[];
  state?: { properties?: Array<{ key: string; value?: unknown }> };
  objects?: MinimalObject[];
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

/**
 * True iff the composition would pass the `@verified_view` gate: every data-bound element
 * carries a `@projects` whose node equals its derived binding path and whose root is a
 * declared state key or `@fetch` into-slot, and `@verified_view` is present whenever any
 * binding exists. A binding-free surface is trivially complete (nothing to prove). Parse
 * failure is NOT complete. Callers use this to keep-or-fall-back after enforcement rather
 * than trusting the text transform blindly.
 */
export function isProvenanceComplete(source: string): boolean {
  let parsed: ReturnType<typeof parseHolo> | undefined;
  try {
    parsed = parseHolo(source);
  } catch {
    return false;
  }
  if (!parsed || !parsed.success || !parsed.ast) return false;
  const comp = parsed.ast as unknown as MinimalComposition;

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

  const hasVerifiedView = (comp.traits ?? []).some((t) => t?.name === 'verified_view');
  let anyBinding = false;
  let complete = true;

  const check = (objs: MinimalObject[] | undefined): void => {
    for (const o of objs ?? []) {
      const traits = o.traits ?? [];
      const bindTrait = firstBindingTrait(traits);
      if (bindTrait) {
        const node = derivedProjectionNode(bindTrait.config);
        if (node) {
          anyBinding = true;
          const projects = traits.find((t) => t.name === 'projects');
          const claimed = projects?.config?.node;
          if (typeof claimed !== 'string' || claimed !== node) {
            complete = false;
          } else if (!roots.has(node.split('.')[0])) {
            complete = false;
          }
        }
      }
      check(o.children);
    }
  };
  check(comp.objects);

  if (anyBinding && !hasVerifiedView) complete = false;
  return complete;
}
