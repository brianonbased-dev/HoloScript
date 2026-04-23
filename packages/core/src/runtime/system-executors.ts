/**
 * System executors — extracted from HoloScriptRuntime (W1-T4 slice 16)
 *
 * Zero-config system-provisioning executors:
 *   - `executeSystem` — dispatches by systemId (Networking / Physics / …)
 *   - `setupNetworking` — networking fabric initialization (logger-only today)
 *   - `setupPhysics` — physics engine initialization (logger-only today)
 *   - `executeCoreConfig` — merges node.properties into environment
 *   - `executeVisualMetadata` — visual-metadata pass-through
 *
 * All five are dispatch-only (called from `executeNode` switch or
 * `executeSystem`). Private methods deleted; dispatch inlines.
 *
 * **Pattern**: minimal-context executor (pattern 4 variant).
 * `executeCoreConfig` takes an `environment` record to mutate;
 * the rest take no runtime state.
 *
 * Behavior is LOCKED by HoloScriptRuntime.characterization.test.ts.
 *
 * **See**: W1-T4 slice 16 (W4-T3 §Wave-1 split backlog)
 *         packages/core/src/HoloScriptRuntime.ts (pre-extraction
 *         LOC 2859-2887 + 3009-3033)
 */

import { logger } from '../logger';
import type {
  CoreConfigNode,
  ExecutionResult,
  HoloScriptValue,
  SystemNode,
  VisualMetadataNode,
} from '../types';

/**
 * Set up the multiplayer networking fabric. Currently logger-only;
 * real initialization of `NetworkingService` lands in a future slice.
 */
export async function setupNetworking(node: SystemNode): Promise<ExecutionResult> {
  const startTime = Date.now();
  logger.info('[Networking] Initializing multiplayer fabric...', node.properties);
  return {
    success: true,
    output: 'Networking system provisioned',
    executionTime: Date.now() - startTime,
  };
}

/**
 * Set up the spatial physics simulation engine. Currently logger-only;
 * real initialization of `PhysicsEngine` lands in a future slice.
 */
export async function setupPhysics(node: SystemNode): Promise<ExecutionResult> {
  const startTime = Date.now();
  logger.info('[Physics] Initializing spatial simulation engine...', node.properties);
  return {
    success: true,
    output: 'Physics system provisioned',
    executionTime: Date.now() - startTime,
  };
}

/**
 * Execute a zero-config `system` AST node. Dispatches by
 * `systemId` to the matching provisioning helper. Unknown ids
 * are logged at warn and return a success envelope (non-recognition
 * is soft-failure — registration is optional).
 */
export async function executeSystem(node: SystemNode): Promise<ExecutionResult> {
  const startTime = Date.now();
  const systemId = node.id;
  const properties = node.properties;

  logger.info(`[Zero-Config] Provisioning system: ${systemId}`, properties);

  switch (systemId) {
    case 'Networking':
      return setupNetworking(node);
    case 'Physics':
      return setupPhysics(node);
    default:
      logger.warn(`[Zero-Config] Unknown system: ${systemId}`);
      return {
        success: true,
        output: `System ${systemId} not recognized, skipping provisioning`,
        executionTime: Date.now() - startTime,
      };
  }
}

/**
 * Execute a zero-config `core` configuration node. Merges
 * `node.properties` into the caller-owned environment record.
 */
export async function executeCoreConfig(
  node: CoreConfigNode,
  environment: Record<string, HoloScriptValue>,
): Promise<ExecutionResult> {
  const startTime = Date.now();
  logger.info('[Zero-Config] Applying core configuration', node.properties);

  for (const [key, value] of Object.entries(node.properties)) {
    environment[key] = value as HoloScriptValue;
  }

  return {
    success: true,
    output: 'Core configuration applied',
    executionTime: Date.now() - startTime,
  };
}

/**
 * Execute a `visual_metadata` AST node. Today a logger-only
 * pass-through; the host is expected to pick up metadata out-of-band.
 */
export async function executeVisualMetadata(node: VisualMetadataNode): Promise<ExecutionResult> {
  logger.info(`[Metadata] Visual metadata processed`, node.properties);
  return { success: true, output: 'Visual metadata applied' };
}
