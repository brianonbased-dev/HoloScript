/**
 * Global JSX augmentation for React Three Fiber v9 intrinsic elements.
 *
 * Why this file exists:
 *
 * R3F v9 ships its IntrinsicElements augmentation as
 * `declare module 'react/jsx-runtime' { namespace JSX { ... } }` and
 * relies on the consumer's tsc loading that module's namespace when
 * `jsx: react-jsx` is set. In practice, studio's strict tsc does not
 * pick up that scoped augmentation reliably under all build pipelines —
 * raw `tsc --noEmit` (used by deploy-railway pre-flight) reports
 * hundreds of "Property 'mesh' does not exist on type 'JSX.IntrinsicElements'"
 * false positives across every R3F-using component.
 *
 * The mirror at packages/visualizer-client/src/vite-env.d.ts does the
 * same explicit global augmentation; copying the pattern here gets
 * studio's intrinsics resolving against R3F's `ThreeElements` regardless
 * of which JSX namespace the build pipeline ends up consulting.
 *
 * This is the same shape R3F's own jsx-runtime augmentation declares,
 * just lifted to global JSX so it's findable via either resolution path.
 */
import type { ThreeElements } from '@react-three/fiber';

// React 19 + R3F v9 augmentation interaction:
// - studio sets `jsx: "react-jsx"` so TS resolves <mesh> against
//   `react/jsx-runtime`'s JSX namespace
// - R3F v9.5.0 ships `declare module 'react' { namespace JSX { ... } }`,
//   which doesn't reach `react/jsx-runtime`'s namespace under React 19's
//   nested `declare namespace React { namespace JSX { ... } }` shape
// - Augmenting both `react` and `react/jsx-runtime` here covers every
//   resolution path consumers might hit.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare module 'react/jsx-dev-runtime' {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

declare global {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}

// styled-jsx <style jsx>{`...`}</style> support — Next.js ships it but
// the auto-include via package.json `types` doesn't fire under our
// strict tsc config. Mirroring styled-jsx@5/global.d.ts inline.
declare module 'react' {
  interface StyleHTMLAttributes<T> extends HTMLAttributes<T> {
    jsx?: boolean;
    global?: boolean;
  }
}

// `@holoscript/platform` has dts disabled in its tsup config (mid-flight
// Vec3 migration — see packages/platform/tsup.config.ts). Studio doesn't
// actually consume platform at runtime — `next.config.js` replaces it
// with an empty module via NormalModuleReplacementPlugin and the turbo
// resolveAlias `'@holoscript/platform': false`. This ambient stub lets
// raw `tsc --noEmit` runs (deploy pre-flight) succeed without the d.ts.
declare module '@holoscript/platform' {
  const platform: Record<string, unknown>;
  export = platform;
}
