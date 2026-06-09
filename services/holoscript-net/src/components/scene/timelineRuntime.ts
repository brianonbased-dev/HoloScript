/**
 * timelineRuntime — a generic, trait-agnostic bridge between a compiled `.holo`
 * `timeline` block and the compiled meshes that consume its animated values.
 *
 * A `<TimelineDriver>` (rendered for every `Timeline` node the R3FCompiler emits)
 * interpolates each `animate "<target>" { value: ... }` keyframe track every frame
 * and writes the current value here; consuming meshes read it by target name in
 * their own `useFrame`. This is what lets growth/animation be DECLARED in `.holo`
 * and PLAYED by generic runtime, instead of hand-keyframed in a React component.
 *
 * Module-level (not React context) on purpose: both producer and consumer read/write
 * inside `useFrame`, so a shared mutable store avoids per-frame re-render churn and
 * the one-frame sibling-order lag is irrelevant.
 */
const values = new Map<string, number>();

/** A TimelineDriver publishes the current value of an animated target. */
export function setTimelineValue(target: string, value: number): void {
  values.set(target, value);
}

/** A consumer reads an animated target, falling back if no timeline drives it
 *  (e.g. the mesh is rendered standalone with no `timeline` block present). */
export function getTimelineValue(target: string, fallback: number): number {
  const v = values.get(target);
  return v === undefined ? fallback : v;
}

/** Clear a target (driver unmount) so a stale value can't pin a later render. */
export function clearTimelineValue(target: string): void {
  values.delete(target);
}
