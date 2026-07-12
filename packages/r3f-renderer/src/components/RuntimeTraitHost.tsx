/**
 * RuntimeTraitHost — render-path host that ticks compiled HoloScript trait behavior.
 *
 * Wraps a node's children and, every frame, advances each bound trait handler via
 * `tickTraits` (onUpdate). This is the seam that turns hand-written bespoke
 * `useFrame` sim-coupling into GENERIC, compiler-emittable behavior: a `.holo`
 * trait with an `onUpdate` (morphogen / turgor / meristem) runs here without any
 * hand-authored renderer. Lifecycle: `attachTraits` on mount, `detachTraits` on
 * unmount, `tickTraits` (delta-clamped) each frame.
 *
 * Thin glue over the pure `traitRuntime` functions (which carry the tested logic).
 *
 * @cites I.007, plan §0.7 / task_1780467909796_0qfk
 */
import { useEffect } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { TraitContext, HSPlusNode } from '@holoscript/core';
import {
  attachTraits,
  tickTraits,
  detachTraits,
  DEFAULT_MAX_DELTA,
  type RuntimeTraitBinding,
} from '../runtime/traitRuntime';

export interface RuntimeTraitHostProps {
  /** The node whose traits run (passed to every handler call). */
  node: HSPlusNode;
  /** Trait handler + config bindings to tick each frame. */
  traits: ReadonlyArray<RuntimeTraitBinding>;
  /** Shared trait context (state bag + subsystem adapters). */
  context: TraitContext;
  /** Per-frame delta clamp in seconds (default {@link DEFAULT_MAX_DELTA}). */
  maxDelta?: number;
  children?: ReactNode;
}

export function RuntimeTraitHost({
  node,
  traits,
  context,
  maxDelta = DEFAULT_MAX_DELTA,
  children,
}: RuntimeTraitHostProps): ReactElement {
  useEffect(() => {
    attachTraits(node, traits, context);
    return () => detachTraits(node, traits, context);
  }, [node, traits, context]);

  useFrame((_, delta) => {
    tickTraits(node, traits, context, delta, maxDelta);
  });

  return <>{children}</>;
}
