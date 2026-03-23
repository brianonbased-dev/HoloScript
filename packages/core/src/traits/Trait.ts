/**
 * Trait.ts
 *
 * Defines the Trait interface for class-based VR trait implementations.
 * This is distinct from the handler-based TraitHandler<T> in TraitTypes.ts.
 * Class-based traits are used by GrabbableTrait, PressableTrait, SlidableTrait, etc.
 */

import type { TraitContext } from './TraitTypes';

export interface Trait {
  name: string;
  onAttach?(node: Record<string, unknown>, context: TraitContext): void;
  onUpdate?(node: Record<string, unknown>, context: TraitContext, delta: number): void;
  onDetach?(node: Record<string, unknown>, context: TraitContext): void;
  onEvent?(node: Record<string, unknown>, context: TraitContext, event: Record<string, unknown>): void;
}
