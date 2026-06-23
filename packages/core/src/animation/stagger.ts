/**
 * Stagger — per-child animation timing distribution.
 *
 * `stagger N` on a container offsets each subsequent direct child's animation
 * start by `index * N`, producing the classic "ripple" where children animate
 * in sequence instead of all at once (the anime.js `stagger()` effect, native).
 *
 * The HoloScript `.holo`/R3F animation channel is `__animatedTransform`: a
 * `{ prop, target, edge0, edge1, from, to }` smoothstep window over a normalized
 * driver (e.g. `developmentalTime ∈ [0,1]`). Staggering ripples each child's
 * window by shifting its `edge0`/`edge1`. The math is split into pure helpers so
 * it is reusable (the same offsets feed the AnimationEngine `delay` field) and
 * unit-testable independently of the compiler and renderer.
 */

/** A node carrying animation channels in `props.__animatedTransform`. */
export interface StaggerableNode {
  props?: Record<string, unknown>;
}

/**
 * Compute per-index stagger offsets: `[from, from+step, from+2*step, …]`.
 *
 * @param count number of children to distribute over
 * @param step  offset added per index — driver units for `__animatedTransform`
 *              windows, or seconds for the AnimationEngine `delay` field
 * @param from  offset applied to the first child (default 0)
 * @returns array of length `count` (empty when `count <= 0`)
 */
export function staggerOffsets(count: number, step: number, from = 0): number[] {
  if (count <= 0) return [];
  return Array.from({ length: count }, (_, i) => from + i * step);
}

/**
 * Offset each child's `__animatedTransform` window (`edge0`/`edge1`) by its
 * stagger offset, in place. Children with no animation channels are left
 * untouched — a stagger over a mix of animated and static children ripples only
 * the animated ones. No-op when `step` is falsy or there are no children.
 *
 * @param children direct children, in order; index drives the offset
 * @param step     per-index offset in the driver's units (matches edge0/edge1)
 * @param from     offset of the first child (default 0)
 */
export function applyStaggerToChildren(
  children: StaggerableNode[],
  step: number,
  from = 0
): void {
  if (!step || children.length === 0) return;
  const offsets = staggerOffsets(children.length, step, from);
  children.forEach((child, i) => {
    const channels = child.props?.__animatedTransform;
    if (!Array.isArray(channels)) return;
    const delta = offsets[i];
    for (const ch of channels as Array<Record<string, unknown>>) {
      if (typeof ch.edge0 === 'number') ch.edge0 = ch.edge0 + delta;
      if (typeof ch.edge1 === 'number') ch.edge1 = ch.edge1 + delta;
    }
  });
}

/**
 * Default entrance channel: a scale-in (0→1) over the first 40% of the driver,
 * leaving headroom for stagger offsets to shift the window without pushing late
 * children past the driver's end. `target` is the timeline driver it reads.
 */
export function defaultEntranceChannel(target: string): Record<string, unknown> {
  return { prop: 'scaleUniform', target, edge0: 0, edge1: 0.4, from: 0, to: 1 };
}

/**
 * Synthesize a default entrance `__animatedTransform` on each BARE `@animated`
 * child (`props.animated === true`) that has no animation channels yet — so a
 * stagger has something to ripple and a driver can play it. Left untouched:
 * non-animated children, CONFIGURED `@animated { … }` (whose `props.animated`
 * is the config object, not `true`, so e.g. `pulse`/`idle` are not overridden),
 * and children that already carry `__animatedTransform`. Returns the count
 * synthesized. Mutates in place; pure over node shape (no compiler/renderer dep).
 */
export function synthesizeEntranceChannels(children: StaggerableNode[], target: string): number {
  let count = 0;
  for (const child of children) {
    const props = child.props;
    if (!props) continue;
    if (props.animated !== true) continue;
    if (Array.isArray(props.__animatedTransform)) continue;
    props.__animatedTransform = [defaultEntranceChannel(target)];
    count += 1;
  }
  return count;
}
