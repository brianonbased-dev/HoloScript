/**
 * HotReloadPipeline — file watcher → incremental parse → scene diff → live update.
 *
 * Orchestrates:
 *   1. HoloFileWatcher detects .holo file changes on disk.
 *   2. HoloCompositionParser parses the new file contents.
 *   3. SceneDiffer computes the minimal ASTMutation[] between old and new AST.
 *   4. Mutations are applied to the StudioBridge (editor state) and/or
 *      pushed to a preview renderer via LiveUpdateProtocol.
 *
 * Usage (server / Node context):
 *   const pipeline = new HotReloadPipeline(bridge, filePath);
 *   pipeline.start();
 *   pipeline.onLiveUpdate = (msg) => ws.send(serializeMessage(msg));
 *
 * Usage (browser / client-side with File System Access API):
 *   const pipeline = new HotReloadPipeline(bridge);
 *   pipeline.loadFromString(initialCode);
 *   // On user code edit:
 *   pipeline.processCodeUpdate(newCode);
 *
 * @package @holoscript/studio
 */

import type { HoloComposition, HoloParseResult } from '../../parser/HoloCompositionTypes';
import type { StudioBridge, ASTMutation } from '../StudioBridge';
import { HoloFileWatcher } from './HoloFileWatcher';
import { diffScenes } from './SceneDiffer';
import {
  createMutationBatch,
  createFullScene,
  type LiveUpdateMessage,
  type MutationBatchMessage,
} from './LiveUpdateProtocol';

export interface HotReloadPipelineOptions {
  /** Path to the .holo file to watch (Node only) */
  filePath?: string;
  /** Initial source code (browser fallback) */
  initialCode?: string;
  /** Debounce ms for file watcher (default: 300) */
  debounceMs?: number;
  /** If true, apply mutations to the StudioBridge automatically (default: true) */
  autoApplyToBridge?: boolean;
  /** If true, fall back to full-scene push when mutation count exceeds threshold (default: true) */
  fullSceneFallbackThreshold?: boolean;
  /** Maximum mutations before falling back to full scene push (default: 500) */
  maxMutationsBeforeFallback?: number;
}

export interface PipelineParseResult {
  ast: HoloComposition | null;
  errors: string[];
}

/**
 * Callback for delivering live-update messages to the preview renderer.
 */
export type LiveUpdateHandler = (message: LiveUpdateMessage) => void;

export class HotReloadPipeline {
  private bridge: StudioBridge;
  private options: Required<Omit<HotReloadPipelineOptions, 'filePath' | 'initialCode'>> &
    Pick<HotReloadPipelineOptions, 'filePath' | 'initialCode'>;
  private watcher: HoloFileWatcher | null = null;
  private lastAST: HoloComposition | null = null;
  private lastCode = '';
  private _onLiveUpdate: LiveUpdateHandler | null = null;
  private parseCache = new Map<string, PipelineParseResult>();

  constructor(bridge: StudioBridge, options: HotReloadPipelineOptions = {}) {
    this.bridge = bridge;
    this.options = {
      debounceMs: options.debounceMs ?? 300,
      autoApplyToBridge: options.autoApplyToBridge ?? true,
      fullSceneFallbackThreshold: options.fullSceneFallbackThreshold ?? true,
      maxMutationsBeforeFallback: options.maxMutationsBeforeFallback ?? 500,
      filePath: options.filePath,
      initialCode: options.initialCode,
    };
  }

  /** Set the handler that receives live-update messages for the preview. */
  set onLiveUpdate(handler: LiveUpdateHandler | null) {
    this._onLiveUpdate = handler;
  }

  get onLiveUpdate(): LiveUpdateHandler | null {
    return this._onLiveUpdate;
  }

  /**
   * Start the pipeline.
   * In Node: starts the file watcher if filePath is provided.
   * In browser: no-op unless you call processCodeUpdate manually.
   */
  start(): void {
    if (this.options.filePath && typeof window === 'undefined') {
      this.watcher = new HoloFileWatcher(this.options.filePath, {
        debounceMs: this.options.debounceMs,
        onChange: async (filePath, event) => {
          if (event === 'deleted') {
            this.pushError('File deleted: ' + filePath);
            return;
          }
          try {
            const fs = await import('fs/promises');
            const code = await fs.readFile(filePath, 'utf-8');
            await this.processCodeUpdate(code);
          } catch (err) {
            this.pushError(err instanceof Error ? err.message : String(err));
          }
        },
        onError: (err) => this.pushError(err.message),
      });
      this.watcher.start();
    }

    if (this.options.initialCode) {
      this.processCodeUpdate(this.options.initialCode);
    }
  }

  /**
   * Stop the pipeline and release resources.
   */
  stop(): void {
    if (this.watcher) {
      this.watcher.stop();
      this.watcher = null;
    }
    this.parseCache.clear();
  }

  /**
   * Process a code update (browser or programmatic entry point).
   * Parses the code, diffs against the last known AST, applies mutations,
   * and pushes live-update messages.
   */
  async processCodeUpdate(code: string): Promise<PipelineParseResult> {
    // Skip if code is identical
    if (code === this.lastCode) {
      return { ast: this.lastAST, errors: [] };
    }
    this.lastCode = code;

    const parsed = await this.parseCode(code);
    if (!parsed.ast) {
      this.pushError(parsed.errors.join('; '));
      return parsed;
    }

    // First load: no previous AST → push full scene
    if (!this.lastAST) {
      this.lastAST = parsed.ast;
      if (this.options.autoApplyToBridge) {
        this.bridge.reset(parsed.ast);
      }
      this.pushFullScene(parsed.ast);
      return parsed;
    }

    // Diff and apply
    const { mutations, affectedObjectNames } = diffScenes(this.lastAST, parsed.ast);

    if (mutations.length === 0) {
      // No structural change (e.g. whitespace-only edit)
      return parsed;
    }

    // Fallback to full scene if mutation count is excessive
    const useFallback =
      this.options.fullSceneFallbackThreshold &&
      mutations.length > this.options.maxMutationsBeforeFallback;

    if (useFallback) {
      this.lastAST = parsed.ast;
      if (this.options.autoApplyToBridge) {
        this.bridge.reset(parsed.ast);
      }
      this.pushFullScene(parsed.ast);
      return parsed;
    }

    // Apply mutations to bridge
    if (this.options.autoApplyToBridge) {
      for (const m of mutations) {
        this.bridge.apply(m);
      }
    }

    // Push live update
    const msg = createMutationBatch(mutations, affectedObjectNames);
    this._onLiveUpdate?.(msg);

    this.lastAST = parsed.ast;
    return parsed;
  }

  /**
   * Load from a string without producing live-update messages
   * (useful for initial hydration).
   */
  loadFromString(code: string): PipelineParseResult {
    this.lastCode = code;
    const parsed = this.parseCodeSync(code);
    if (parsed.ast) {
      this.lastAST = parsed.ast;
      if (this.options.autoApplyToBridge) {
        this.bridge.reset(parsed.ast);
      }
    }
    return parsed;
  }

  /**
   * Manually push a live-update message (for external integrations).
   */
  pushMessage(msg: LiveUpdateMessage): void {
    this._onLiveUpdate?.(msg);
  }

  /** Get the last successfully parsed AST. */
  getLastAST(): HoloComposition | null {
    return this.lastAST;
  }

  // -----------------------------------------------------------------------
  // Internal
  // -----------------------------------------------------------------------

  private async parseCode(code: string): Promise<PipelineParseResult> {
    return this.parseCodeSync(code);
  }

  private parseCodeSync(code: string): PipelineParseResult {
    // Use cache for identical code
    const cached = this.parseCache.get(code);
    if (cached) return cached;

    try {
      // Lazy-import @holoscript/core to avoid bundling issues in non-Node contexts
      const { HoloCompositionParser } = require('@holoscript/core');
      const parser = new HoloCompositionParser();
      const result: HoloParseResult = parser.parse(code);

      if (result.errors && result.errors.length > 0) {
        const errors = result.errors.map((e: string | { message: string }) =>
          typeof e === 'string' ? e : e.message || String(e)
        );
        const res: PipelineParseResult = { ast: null, errors };
        this.parseCache.set(code, res);
        return res;
      }

      const ast = (result.ast ?? result) as HoloComposition;
      const res: PipelineParseResult = { ast, errors: [] };
      this.parseCache.set(code, res);
      return res;
    } catch (err) {
      const res: PipelineParseResult = {
        ast: null,
        errors: [err instanceof Error ? err.message : String(err)],
      };
      this.parseCache.set(code, res);
      return res;
    }
  }

  private pushFullScene(ast: HoloComposition): void {
    this._onLiveUpdate?.(createFullScene(ast));
  }

  private pushError(message: string): void {
    this._onLiveUpdate?.({
      type: 'error',
      message,
    });
  }
}

export default HotReloadPipeline;
