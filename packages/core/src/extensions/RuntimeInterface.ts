/**
 * RuntimeInterface — Minimal interface for extension registration.
 * Extracted to avoid circular dependency between HoloScriptRuntime and ExtensionRegistry.
 *
 * @module extensions/RuntimeInterface
 */

import type { TraitHandler } from '../traits/TraitTypes';

/**
 * Interface defining the runtime methods required by ExtensionRegistry.
 * This allows ExtensionRegistry to depend on an interface instead of the
 * concrete HoloScriptRuntime class, breaking the circular dependency.
 */
export interface IExtensionRuntime {
  /**
   * Register a custom trait from an extension
   */
  registerTrait(name: string, handler: TraitHandler<any>): void;

  /**
   * Register a global function from an extension
   */
  registerGlobalFunction(name: string, fn: Function): void;
}
