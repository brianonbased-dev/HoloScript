import { logger } from '../logger';
// import { TraitRegistry } from '../traits/TraitRegistry'; // Removed
import type { IExtensionRuntime } from './RuntimeInterface';
import type { HoloExtension, ExtensionContext } from './ExtensionInterface';

export class ExtensionRegistry {
  private extensions: Map<string, HoloExtension> = new Map();
  private runtime: IExtensionRuntime;

  constructor(runtime: IExtensionRuntime) {
    this.runtime = runtime;
  }

  /**
   * Load an extension into the runtime
   */
  public loadExtension(extension: HoloExtension): void {
    if (this.extensions.has(extension.id)) {
      logger.warn(`Extension ${extension.id} is already loaded.`);
      return;
    }

    const context: ExtensionContext = {
      registerTrait: (name, handler) => {
        logger.info(`[Extension:${extension.id}] Registering trait: ${name}`);
        this.runtime.registerTrait(name, handler);
      },
      registerFunction: (name, fn) => {
        logger.info(`[Extension:${extension.id}] Registering function: ${name}`);
        // We need to access the runtime context functions.
        // This assumes HoloScriptRuntime exposes its interpreter context or similar mechanism.
        // For now, we'll assume a method exists or needs to be added.
        this.runtime.registerGlobalFunction(name, fn);
      },
      logger: logger,
    };

    try {
      extension.onLoad(context);
      this.extensions.set(extension.id, extension);
      logger.info(`Extension loaded: ${extension.id} v${extension.version}`);
    } catch (error) {
      logger.error(`Failed to load extension ${extension.id}:`, { error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  /**
   * Unload an extension
   */
  public unloadingExtension(id: string): void {
    const extension = this.extensions.get(id);
    if (!extension) return;

    // In a real system we would track registered items and unregister them.
    // For this MVP, we just call onUnload.
    try {
      const context: ExtensionContext = {
        registerTrait: () => {},
        registerFunction: () => {},
        logger,
      };
      extension.onUnload(context);
    } catch (e) {
      logger.error(`Error unloading extension ${id}`, { error: e instanceof Error ? e.message : String(e) });
    }

    this.extensions.delete(id);
    logger.info(`Extension unloaded: ${id}`);
  }

  public getExtension(id: string): HoloExtension | undefined {
    return this.extensions.get(id);
  }
}
