/**
 * timelineRuntime — module-level bridge between the baked timeline keyframes and
 * the meshes that read animated values (stem rise, leaf unfurl, petal bloom).
 * Mirrors the v1 generic runtime (services/holoscript-net) but standalone — both
 * producer (TimelineDriver) and consumers read/write inside useFrame, so a shared
 * mutable store avoids per-frame re-render churn.
 */
const values = new Map<string, number>();

export function setTimelineValue(target: string, value: number): void {
  values.set(target, value);
}

export function getTimelineValue(target: string, fallback: number): number {
  const v = values.get(target);
  return v === undefined ? fallback : v;
}

export function clearTimelineValue(target: string): void {
  values.delete(target);
}

const smoothstepClamp = (x: number): number => {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
};

export const smoothstep = (e0: number, e1: number, x: number): number =>
  smoothstepClamp((x - e0) / (e1 - e0));

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
