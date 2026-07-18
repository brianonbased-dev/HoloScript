/**
 * Epistemic<T> — first-class ignorance as a value (language-architecture.md roadmap, inventiveness #1).
 *
 * WHY THIS EXISTS (D.129 — drop a human-shaped assumption): mainstream languages force you to model
 * "I don't know this value" with `null` / `Option<T>` / a sentinel — all of which conflate ABSENCE
 * with UNKNOWN-WHY and let you silently forget to handle the gap (`null` flows anywhere a `T` flows).
 * Honest abstention is already HoloMeaning's signature primitive at the query layer (MeaningResolution)
 * and inside the IR (three-state opacity). Epistemic<T> lifts it to a VALUE: a thing that is either
 * KNOWN (carries a T) or honestly UNKNOWN, and — critically — the unknown branch carries WHY, in the
 * SAME MeaningGapReason vocabulary the resolvers use. So an unknown VALUE and an unresolvable QUERY
 * speak one honesty language, and the type system makes ignoring the gap a COMPILE ERROR, not a
 * runtime surprise.
 *
 * THE GUARANTEE: `Epistemic<T>` is not assignable to `T`. You cannot pass it where a `T` is expected;
 * to obtain a `T` you must call a combinator that forces you to handle the unknown case (`orElse` with
 * a fallback, or the explicitly-named, greppable escape hatch `requireKnown`). "Unknown-handling is
 * compile-checked" falls out of the discriminated union — no extra machinery.
 *
 * This is the SEMANTIC CORE that a future surface `@unknown` field annotation lowers to (that surface
 * syntax lives in the Rust/WASM grammar — its own toolchain-gated slice; see the RFC
 * research/2026-07-17_first-class-ignorance-rfc.md). Distinct from Option (present/absent, no reason)
 * and Result (ok/error): the unknown here is a typed EPISTEMIC state, not a failure.
 */

import type { MeaningGapReason, MeaningResolution, MeaningStructuredGap } from './contract';

/** A value that is either known (carries a T) or honestly unknown with a typed epistemic reason. */
export type Epistemic<T> =
  | { readonly known: true; readonly value: T }
  | { readonly known: false; readonly reason: MeaningGapReason; readonly gap?: MeaningStructuredGap };

/** Wrap a known value. */
export function known<T>(value: T): Epistemic<T> {
  return { known: true, value };
}

/** Declare a value unknown, with a typed epistemic reason (and optionally a family-scoped gap). */
export function unknown<T = never>(reason: MeaningGapReason, gap?: MeaningStructuredGap): Epistemic<T> {
  return gap === undefined ? { known: false, reason } : { known: false, reason, gap };
}

/** Type guard: narrows to the known branch (so `.value` is reachable). */
export function isKnown<T>(e: Epistemic<T>): e is { known: true; value: T } {
  return e.known;
}

/**
 * Transform a known value; propagate an unknown UNCHANGED (reason + gap preserved). The workhorse:
 * you can compute over an Epistemic without ever asserting the value is present.
 */
export function map<T, U>(e: Epistemic<T>, fn: (value: T) => U): Epistemic<U> {
  return e.known ? { known: true, value: fn(e.value) } : e;
}

/** Chain a computation that itself may be unknown; the first unknown short-circuits. */
export function flatMap<T, U>(e: Epistemic<T>, fn: (value: T) => Epistemic<U>): Epistemic<U> {
  return e.known ? fn(e.value) : e;
}

/**
 * Combine two epistemic values; the result is unknown iff EITHER is unknown (the first unknown's
 * reason wins). This is the property that makes silent combination impossible — you cannot pair a
 * known with an unknown and get a usable pair.
 */
export function both<A, B>(a: Epistemic<A>, b: Epistemic<B>): Epistemic<readonly [A, B]> {
  if (!a.known) return a;
  if (!b.known) return b;
  return { known: true, value: [a.value, b.value] as const };
}

/** Extract a T by supplying an explicit fallback for the unknown case — the safe unwrap. */
export function orElse<T>(e: Epistemic<T>, fallback: T): T {
  return e.known ? e.value : fallback;
}

/**
 * The EXPLICIT escape hatch: assert the value is known, throwing if it is not. Named `requireKnown`
 * (never a silent `!` or cast) precisely so an audit can grep every place code claims knowledge it
 * cannot prove — the honest analog of a non-null assertion.
 */
export function requireKnown<T>(e: Epistemic<T>, context?: string): T {
  if (e.known) return e.value;
  const where = context ? ` (${context})` : '';
  throw new Error(`requireKnown${where}: value is unknown — reason "${e.reason}"${e.gap ? `, gap "${e.gap.code}"` : ''}`);
}

/**
 * Bridge the query world to the value world: a resolver's answer IS an epistemic value. `resolved`
 * ⇒ known(answer); `unresolvable` ⇒ unknown(reason, gap). Lets a resolution flow into any
 * Epistemic pipeline with no translation — one honesty vocabulary across queries and values.
 */
export function fromResolution<A>(resolution: MeaningResolution<A>): Epistemic<A> {
  if (resolution.status === 'resolved' && resolution.answer !== undefined) {
    return { known: true, value: resolution.answer };
  }
  return unknown<A>(resolution.reason ?? 'underdetermined', resolution.gap);
}

// Compile-time proof of the core guarantee, checked by this package's dts build (tsc): Epistemic<T>
// is NOT assignable to T, so it can never be used where a bare T is expected without unwrapping. Pure
// types, zero runtime footprint. If a future edit makes Epistemic<T> assignable to T, the conditional
// yields 'broken', which violates the `extends 'ok'` bound and fails the build. (A `@ts-expect-error`
// in the test file would NOT catch this — vitest's esbuild skips type-checking, W.860.)
type AssertOk<X extends 'ok'> = X;
export type EpistemicNotAssignableToT = AssertOk<Epistemic<number> extends number ? 'broken' : 'ok'>;
