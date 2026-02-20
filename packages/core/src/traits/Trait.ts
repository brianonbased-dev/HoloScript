/**
 * Trait.ts
 *
 * Defines the Trait interface for class-based VR trait implementations.
 * This is distinct from the handler-based TraitHandler<T> in TraitTypes.ts.
 * Class-based traits are used by GrabbableTrait, PressableTrait, SlidableTrait, etc.
 */

import type { TraitContext } from './VRTraitSystem';

export interface Trait {
  name: string;
  onAttach?(node: any, context: TraitContext): void;
  onUpdate?(node: any, context: TraitContext, delta: number): void;
  onDetach?(node: any, context: TraitContext): void;
  onEvent?(node: any, context: TraitContext, event: any): void;
}
