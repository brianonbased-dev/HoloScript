/**
 * NPCManager — Hololand service-layer auto-wire for AI NPC traits.
 *
 * Source: research/2026-05-20-hololand-ai-npc-v1.md (task_1779337565758_tequ)
 * Auto-detects objects tagged @ai_npc_brain or @caveman_drive during world load
 * and attaches the matching production trait handlers.
 *
 * Hardware seat (grok-hardware / grok1-x402) deliverable during room marathon.
 * No new core trait logic — pure integration surface for Hololand world orchestrator + uaa2.
 */

import { ainpcBrainHandler, type AINPCBrainConfig } from '../traits/AINPCBrainTrait';
import { CavemanDriveTrait } from '../traits/CavemanDriveTrait';

export interface NPCWireContext {
  emit?: (event: string, payload: any) => void;
  runtime?: any;
  worldId?: string;
}

export interface NPCObject {
  id: string;
  tags?: string[];
  directives?: Array<{ name: string; config?: any }>;
  // Hololand object node shape (minimal)
  [key: string]: unknown;
}

/**
 * Scan a loaded world/scene and auto-attach the two v1 NPC traits.
 * Call this from Hololand world loader / uaa2 Hololand build path on manifest or .hsplus parse.
 */
export function autoWireNPCs(objects: NPCObject[], context: NPCWireContext = {}): {
  wired: Array<{ id: string; trait: string }>;
  skipped: string[];
} {
  const wired: Array<{ id: string; trait: string }> = [];
  const skipped: string[] = [];

  for (const obj of objects) {
    const tags = (obj.tags || []).map(t => t.toLowerCase());
    const directives = (obj.directives || []).map(d => d.name.toLowerCase());

    const hasAINPC = tags.includes('ai_npc_brain') || directives.includes('ai_npc_brain');
    const hasCaveman = tags.includes('caveman_drive') || directives.includes('caveman_drive');

    if (hasAINPC) {
      const cfg: Partial<AINPCBrainConfig> = obj.directives?.find(d => d.name.toLowerCase() === 'ai_npc_brain')?.config || {};
      try {
        ainpcBrainHandler.onAttach?.(obj as any, { ...ainpcBrainHandler.defaultConfig, ...cfg } as AINPCBrainConfig, context as any);
        wired.push({ id: obj.id, trait: 'ai_npc_brain' });
      } catch (e) {
        skipped.push(`${obj.id}:ai_npc_brain:${(e as Error).message}`);
      }
    }

    if (hasCaveman) {
      try {
        const caveman = new CavemanDriveTrait();
        caveman.onAttach?.(obj as any);
        wired.push({ id: obj.id, trait: 'caveman_drive' });
      } catch (e) {
        skipped.push(`${obj.id}:caveman_drive:${(e as Error).message}`);
      }
    }
  }

  context.emit?.('npc_manager_wire_complete', {
    worldId: context.worldId,
    wiredCount: wired.length,
    skippedCount: skipped.length,
  });

  return { wired, skipped };
}

/**
 * Convenience: register the two NPC handlers with a VRTraitSystem / runtime if present.
 * Idempotent — safe to call on every world load.
 */
export function registerNPCTraits(traitSystem?: { register?: (name: string, handler: any) => void }): void {
  if (traitSystem?.register) {
    traitSystem.register('ai_npc_brain', ainpcBrainHandler);
    traitSystem.register('caveman_drive', CavemanDriveTrait);
  }
}

export const NPCManager = {
  autoWireNPCs,
  registerNPCTraits,
};

export default NPCManager;
