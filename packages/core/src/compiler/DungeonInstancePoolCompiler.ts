/**
 * @fileoverview Dungeon Instance Pool Compiler (BRIDGE target — P2.6)
 * @module @holoscript/core/compiler
 *
 * PURPOSE:
 * Compile `dungeon_instance` blocks into a self-contained, server-authoritative
 * InstancePool manager: instanced content (a dungeon/raid) spun up on demand, one
 * live instance per party, capped at max_instances, released on a reset timer.
 * Completion emits a RECEIPT sealed against the dungeon + instance + party — the
 * "receipt-sealed instanced content" claim — and (optionally) sets a quest flag.
 *
 * Each dungeon's `completion_quest` is COMPILE-VALIDATED against the composition's
 * declared quests: an undeclared quest is a compile error (the same typed-predicate
 * guarantee as world_layer phasing), not a runtime surprise.
 *
 * OUTPUT: a TypeScript module exporting DUNGEON_REGISTRY + a DungeonInstancePool
 * class (RoomClass-agnostic — the integrator wires room create/dispose to the
 * pool's request/release). Runs in-process alongside the Colyseus server.
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes.js';
import { CompilerBase, type CompilerToken } from './CompilerBase';

export const DUNGEON_COMPLETION_RECEIPT_SCHEMA = 'holoscript.mmo-dungeon-completion.v1';

export interface DungeonInstanceConfig {
  name: string;
  maxInstances: number;
  partySize: number;
  resetTimer: number;
  completionQuest: string;
  npcs: string[];
  objects: string[];
}

export interface DungeonInstanceCompilationResult {
  success: boolean;
  code: string;
  dungeons: DungeonInstanceConfig[];
  warnings: string[];
  errors: string[];
}

export class DungeonInstancePoolCompiler extends CompilerBase {
  protected readonly compilerName = 'DungeonInstancePoolCompiler';

  protected override getRequiredCapability(): string {
    return '/compile/gamedev/dungeon-instance';
  }

  private errors: string[] = [];
  private warnings: string[] = [];

  // Accept (and ignore) factory options for ExportManager parity; no tunables yet.
  constructor(_options: Record<string, unknown> = {}) {
    super();
  }

  override compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): DungeonInstanceCompilationResult {
    this.validateCompilerAccess(agentToken as CompilerToken, outputPath);
    this.errors = [];
    this.warnings = [];

    const dungeons = this.buildDungeons(composition);
    if (dungeons.length === 0 && (composition.dungeonInstances ?? []).length === 0) {
      this.warnings.push('No dungeon_instance blocks found — emitting an empty instance pool.');
    }

    const code = this.emit(dungeons);
    return {
      success: this.errors.length === 0,
      code,
      dungeons,
      warnings: [...this.warnings],
      errors: [...this.errors],
    };
  }

  /** Lower + quest-validate dungeon_instance blocks. */
  private buildDungeons(composition: HoloComposition): DungeonInstanceConfig[] {
    const declaredQuests = new Set((composition.quests ?? []).map((q) => q.name));
    const out: DungeonInstanceConfig[] = [];
    for (const d of composition.dungeonInstances ?? []) {
      if (d.completionQuest && !declaredQuests.has(d.completionQuest)) {
        this.errors.push(
          `dungeon_instance '${d.name}' references unknown completion_quest "${d.completionQuest}". ` +
            `Declare a quest block with that name (compile-validated).`
        );
        continue;
      }
      out.push({
        name: d.name,
        maxInstances: d.maxInstances > 0 ? d.maxInstances : 1,
        partySize: d.partySize > 0 ? d.partySize : 1,
        resetTimer: d.resetTimer >= 0 ? d.resetTimer : 0,
        completionQuest: d.completionQuest ?? '',
        npcs: Array.isArray(d.npcs) ? d.npcs.slice() : [],
        objects: Array.isArray(d.objects) ? d.objects.slice() : [],
      });
    }
    return out;
  }

  private registryObject(dungeons: DungeonInstanceConfig[]): Record<string, Omit<DungeonInstanceConfig, 'name'>> {
    const obj: Record<string, Omit<DungeonInstanceConfig, 'name'>> = {};
    for (const d of dungeons) {
      const { name, ...rest } = d;
      obj[name] = rest;
    }
    return obj;
  }

  private emit(dungeons: DungeonInstanceConfig[]): string {
    return [
      `/**`,
      ` * @generated DungeonInstancePoolCompiler — server-authoritative instance pool`,
      ` * Receipt-sealed completion. DO NOT EDIT — regenerate via HoloScript.`,
      ` */`,
      ``,
      `export const DUNGEON_COMPLETION_RECEIPT_SCHEMA = '${DUNGEON_COMPLETION_RECEIPT_SCHEMA}';`,
      ``,
      `export const DUNGEON_REGISTRY: Record<string, {`,
      `  maxInstances: number; partySize: number; resetTimer: number;`,
      `  completionQuest: string; npcs: string[]; objects: string[];`,
      `}> = ${JSON.stringify(this.registryObject(dungeons), null, 2)};`,
      ``,
      `export interface DungeonInstance {`,
      `  id: string; dungeonId: string; party: string[]; createdTick: number; completed: boolean;`,
      `}`,
      ``,
      `export interface DungeonCompletionReceipt {`,
      `  schema: string; dungeonId: string; instanceId: string;`,
      `  party: string[]; completionQuest: string; tick: number;`,
      `}`,
      ``,
      `/**`,
      ` * Server-authoritative dungeon instance pool. RoomClass-agnostic: the caller`,
      ` * wires room create/dispose to requestInstance / releaseInstance. The tick`,
      ` * source is injected so completion receipts are stamped with the room clock.`,
      ` */`,
      `export class DungeonInstancePool {`,
      `  private instances = new Map<string, DungeonInstance>();`,
      `  private seq = 0;`,
      `  constructor(private readonly now: () => number = () => 0) {}`,
      ``,
      `  /** Live (non-completed) instances for a dungeon. */`,
      `  liveCount(dungeonId: string): number {`,
      `    let n = 0;`,
      `    this.instances.forEach((i) => { if (i.dungeonId === dungeonId && !i.completed) n++; });`,
      `    return n;`,
      `  }`,
      ``,
      `  /** Request an instance for a party. Null if the pool is full or party too large. */`,
      `  requestInstance(dungeonId: string, party: string[]): DungeonInstance | null {`,
      `    const cfg = DUNGEON_REGISTRY[dungeonId];`,
      `    if (!cfg) return null;`,
      `    if (party.length > cfg.partySize) return null;`,
      `    if (this.liveCount(dungeonId) >= cfg.maxInstances) return null;`,
      `    const id = \`\${dungeonId}#\${++this.seq}\`;`,
      `    const inst: DungeonInstance = { id, dungeonId, party: [...party], createdTick: this.now(), completed: false };`,
      `    this.instances.set(id, inst);`,
      `    return inst;`,
      `  }`,
      ``,
      `  /** Mark an instance complete → emit a sealed completion receipt. */`,
      `  completeInstance(instanceId: string): DungeonCompletionReceipt | null {`,
      `    const inst = this.instances.get(instanceId);`,
      `    if (!inst || inst.completed) return null;`,
      `    inst.completed = true;`,
      `    const cfg = DUNGEON_REGISTRY[inst.dungeonId];`,
      `    const receipt: DungeonCompletionReceipt = {`,
      `      schema: DUNGEON_COMPLETION_RECEIPT_SCHEMA,`,
      `      dungeonId: inst.dungeonId, instanceId,`,
      `      party: [...inst.party], completionQuest: cfg?.completionQuest ?? '', tick: this.now(),`,
      `    };`,
      `    this.onCompletion(receipt);`,
      `    return receipt;`,
      `  }`,
      ``,
      `  /** Release an instance slot (call on empty / after reset_timer). */`,
      `  releaseInstance(instanceId: string): boolean {`,
      `    return this.instances.delete(instanceId);`,
      `  }`,
      ``,
      `  /** Instances eligible for release: completed, or empty past reset_timer (seconds). */`,
      `  reapStale(tickRate: number): string[] {`,
      `    const released: string[] = [];`,
      `    this.instances.forEach((i) => {`,
      `      const cfg = DUNGEON_REGISTRY[i.dungeonId];`,
      `      const ageSec = (this.now() - i.createdTick) / Math.max(1, tickRate);`,
      `      if (i.completed || (cfg && cfg.resetTimer > 0 && ageSec > cfg.resetTimer)) {`,
      `        this.instances.delete(i.id);`,
      `        released.push(i.id);`,
      `      }`,
      `    });`,
      `    return released;`,
      `  }`,
      ``,
      `  /** Override to persist completion receipts to a TrustLedger / NDJSON sink. */`,
      `  protected onCompletion(receipt: DungeonCompletionReceipt): void { void receipt; }`,
      `}`,
      ``,
    ].join('\n');
  }
}

export default DungeonInstancePoolCompiler;
