/**
 * Marketplace → Spatial Agent deployment bridge.
 *
 * Connects the Studio marketplace acquisition flow (AgentMarketplaceTab's
 * `onAgentInstalled` callback / MarketplaceClient.installAgent) to the engine's
 * `SpatialAgentService`. After access validation + billing happen in the
 * marketplace client, the acquired uAAL program is handed here and spawned as a
 * live `SpatialCognitiveAgent` in the active ECS world.
 *
 * This is the studio half of task "SpatialAgentService: lifecycle + tickAll
 * adapter over vm-bridge (G5 join)" — it carries NO render surface (pure TS
 * glue), so it is outside the `.holo`→`.tsx` render-surface freeze.
 */

import { VMBridge, VM } from '@holoscript/engine';

type ECSWorld = VM.ECSWorld;
type SpatialAgentService = VMBridge.SpatialAgentService;
type RegisteredAgent = VMBridge.RegisteredAgent;

/**
 * The result shape emitted by `AgentMarketplaceTab.onAgentInstalled`.
 * Mirrors `VMBridge.MarketplaceInstallResult` so the studio call site does not
 * need to import the engine type directly.
 */
export interface InstalledAgentResult {
  templateId: string;
  templateName: string;
  program: string;
  programType: 'intent' | 'bytecode';
  config: { cognitiveHz: number; capabilities: string[] };
}

/**
 * Deploy a marketplace-acquired agent template into a running spatial world.
 *
 * @param service  The SpatialAgentService bound to the active ECS world.
 * @param result   The `onAgentInstalled` payload from the marketplace tab.
 * @returns        The registered agent record (id, body entity, etc).
 */
export function deployInstalledAgent(
  service: SpatialAgentService,
  result: InstalledAgentResult
): RegisteredAgent {
  const config = VMBridge.spawnConfigFromMarketplaceInstall(result);
  return service.spawnAgent(config);
}

/**
 * Convenience factory: build a SpatialAgentService for an ECS world. Studio can
 * hold one service per active scene and pass it to {@link deployInstalledAgent}.
 */
export function createSpatialAgentService(
  world: ECSWorld,
  defaultCognitiveHz = 2
): SpatialAgentService {
  return new VMBridge.SpatialAgentService(world, { defaultCognitiveHz });
}
