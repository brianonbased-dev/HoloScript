/**
 * @holoscript/narupa-plugin v1.0
 * Multi-agent orchestration for VR-based drug discovery
 *
 * @packageDocumentation
 */

import { NarupaProcessManager } from './narupa-process-manager';
import { NarupaOrchestrator, TaskStatus } from './narupa-orchestrator';
import type {
  Task,
  TaskResult,
  HITLCallback,
} from './narupa-orchestrator';
import { NarupaUnityTarget } from './narupa-unity-target';
import type { HoloScriptObject, UnityGenerationOptions } from './narupa-unity-target';
import { DatabaseFetcher } from './database-fetcher';
import type { DatabaseQueryConfig, DatabaseQueryResult } from './database-fetcher';
import type { NarupaServerConfig, NarupaServerStatus, MolecularDynamicsConfig } from './types';

// Re-export everything
export { NarupaProcessManager } from './narupa-process-manager';
export { NarupaOrchestrator, TaskStatus } from './narupa-orchestrator';
export type { Task, TaskResult, HITLCallback } from './narupa-orchestrator';
export { NarupaUnityTarget } from './narupa-unity-target';
export type { HoloScriptObject, UnityGenerationOptions } from './narupa-unity-target';
export { DatabaseFetcher } from './database-fetcher';
export type { DatabaseQueryConfig, DatabaseQueryResult } from './database-fetcher';
export type { NarupaServerConfig, NarupaServerStatus, MolecularDynamicsConfig } from './types';

// Version
export const VERSION = '1.2.0';

// Default exports for convenience
export default {
  NarupaProcessManager,
  NarupaOrchestrator,
  NarupaUnityTarget,
  DatabaseFetcher,
  VERSION,
};
