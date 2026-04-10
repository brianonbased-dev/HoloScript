import type { TraitHandler } from '../traits/TraitTypes';
import type { logger } from '../logger';

export interface ExtensionContext {
  /**
   * Register a new trait handler
   */
  registerTrait(name: string, handler: TraitHandler): void;

  /**
   * Register a global function
   */
  registerFunction(name: string, fn: Function): void;

  /**
   * Access to the runtime logger
   */
  logger: typeof logger;
}

export interface HoloExtension {
  /**
   * Unique identifier for the extension (e.g., "com.example.my-extension")
   */
  id: string;

  /**
   * Semantic version string
   */
  version: string;

  /**
   * Called when the extension is loaded
   */
  onLoad(context: ExtensionContext): void;

  /**
   * Called when the extension is unloaded
   */
  onUnload(context: ExtensionContext): void;
}
