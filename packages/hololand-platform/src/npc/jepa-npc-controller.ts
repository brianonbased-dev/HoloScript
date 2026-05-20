/**
 * JEPANPCController — Action-Conditioned NPC Brain for HoloLand (V-JEPA 2-AC)
 *
 * This is the production-ready wiring of JEPAPredictor into HoloLand NPCs.
 *
 * Every control step:
 *   1. NPC senses current world state (as string or embedding source)
 *   2. Considers a set of candidate actions
 *   3. Calls the sovereign JEPAPredictor via the adapter
 *   4. Receives chosen action + predicted next-state embedding + anchored receipt
 *   5. Emits the receipt so it can be shown in the World Build Cockpit trust gate
 *      and published to the agent's public HoloMesh profile (D.055)
 *
 * This makes HoloLand NPCs first-class action-conditioned world model agents.
 * It directly proves D.050: HoloLand is a live AI Lab testbed, not just a trait file.
 *
 * Used by: AINPCBrainTrait, HoloLand NPC runtime, creator NPCs, etc.
 */

import {
  planAndAnchorNPCAction,
  type NPCControlInput,
  type NPCControlOutput,
  type WorldModelReceipt,
} from './jepa-predictor-adapter';

export interface JEPANPCStepResult extends NPCControlOutput {
  /** The receipt is ready to be displayed in the cockpit gate and published publicly */
  receipt: WorldModelReceipt;
}

export type ReceiptEmitter = (receipt: WorldModelReceipt, meta: { worldId: string; npcId?: string }) => void;

export interface JEPANPCControllerOptions {
  /** Optional callback when a receipt is produced (for cockpit + public profile) */
  onReceipt?: ReceiptEmitter;
  /** Optional NPC identifier for receipt metadata */
  npcId?: string;
  /** Pre-instantiated sovereign JEPAPredictor (required) */
  predictor: any; // JEPAPredictor from @holoscript/core

  /** Enable durable state across restarts using the persistence layer */
  persistKey?: string;           // e.g. "npc:guard-01"
  persistBackend?: 'memory' | 'file';
}

/**
 * Production controller for HoloLand NPCs powered by the sovereign JEPAPredictor.
 *
 * Typical usage in a real NPC brain:
 *
 * const controller = new JEPANPCController({
 *   npcId: 'my-npc-42',
 *   persistKey: 'npc:guard-01',
 *   persistBackend: 'file'   // survives process restarts
 * });
 *
 * setInterval(() => {
 *   const state = getCurrentWorldStateAsString();
 *   const actions = getAvailableActions();
 *   const result = controller.step(state, actions, world.id);
 *   applyAction(result.chosenAction);
 *   console.log('NPC memory:', controller.getMemory());
 * }, 100);
 */
export class JEPANPCController {
  private readonly onReceipt?: ReceiptEmitter;
  private readonly npcId?: string;
  private readonly predictor: any;

  // Durable NPC memory (goals, last action, step count, etc.)
  private memory: Record<string, unknown> = {
    stepCount: 0,
    lastAction: null,
    lastPredicted: null,
    lastWorldId: null,
  };
  private readonly persistKey?: string;
  private readonly persistBackend: 'memory' | 'file';

  constructor(options: JEPANPCControllerOptions) {
    this.onReceipt = options.onReceipt;
    this.npcId = options.npcId;
    this.predictor = options.predictor;
    this.persistKey = options.persistKey;
    this.persistBackend = options.persistBackend || 'memory';

    if (this.persistKey) {
      this.loadPersistentMemory();
    }
  }

  private getPersistFile(): string | null {
    if (!this.persistKey) return null;
    const safe = this.persistKey.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `research/hololand-persist/npc-${safe}.json`; // or .holo-persist in real deployments
  }

  private loadPersistentMemory() {
    if (this.persistBackend !== 'file') return;
    const fp = this.getPersistFile();
    if (!fp) return;
    try {
      const fs = require('fs');
      if (fs.existsSync(fp)) {
        const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
        this.memory = { ...this.memory, ...raw };
      }
    } catch {}
  }

  private savePersistentMemory() {
    if (this.persistBackend !== 'file' || !this.persistKey) return;
    const fp = this.getPersistFile();
    if (!fp) return;
    try {
      const fs = require('fs');
      const dir = fp.split('/').slice(0, -1).join('/');
      if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fp, JSON.stringify(this.memory, null, 2), 'utf8');
    } catch {}
  }

  /**
   * One control step of an action-conditioned JEPA-powered NPC.
   */
  step(
    currentState: string,
    candidateActions: string[],
    worldId: string
  ): JEPANPCStepResult {
    const input: NPCControlInput = {
      currentState,
      candidateActions,
      worldId,
    };

    const output = planAndAnchorNPCAction(input, (state, actions) => this.predictor.plan(state, actions));

    // Emit receipt for the cockpit trust gate and public profile
    if (this.onReceipt) {
      this.onReceipt(output.receipt, {
        worldId,
        npcId: this.npcId,
      });
    }

    // Update and persist durable memory
    this.memory.stepCount = (this.memory.stepCount as number) + 1;
    this.memory.lastAction = output.chosenAction;
    this.memory.lastPredicted = Array.from(output.predictedEmbedding || []);
    this.memory.lastWorldId = worldId;
    this.savePersistentMemory();

    return {
      ...output,
      receipt: output.receipt,
    };
  }

  /** Read the current durable memory of this NPC (useful for cockpit, debugging, or higher brain layers) */
  getMemory(): Readonly<Record<string, unknown>> {
    return { ...this.memory };
  }

  /**
   * Convenience: create a controller that automatically publishes receipts
   * to the HoloLand World Build Cockpit trust gate (if the gate is listening).
   *
   * In a real deployment the cockpit would subscribe to a receipt bus.
   * This is a simple in-process emitter for demos and tests.
   */
  static withCockpitEmission(options: JEPANPCControllerOptions = {}): JEPANPCController {
    return new JEPANPCController({
      ...options,
      onReceipt: (receipt, meta) => {
        // In production this would go to the actual receipt bus / cockpit UI
        console.log('[HoloLand NPC Receipt] → Cockpit trust gate', {
          world: meta.worldId,
          npc: meta.npcId,
          receiptType: receipt.solverType,
        });
        // Also allow external listeners
        if (options.onReceipt) options.onReceipt(receipt, meta);
      },
    });
  }
}

export default JEPANPCController;