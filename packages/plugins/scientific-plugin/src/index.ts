/**
 * @holoscript/narupa-plugin v1.0
 * Multi-agent orchestration for VR-based drug discovery
 *
 * @packageDocumentation
 */

import { NarupaProcessManager } from './narupa-process-manager';
import {
  NarupaOrchestrator,
  Task,
  TaskStatus,
  TaskResult,
  HITLCallback,
} from './narupa-orchestrator';
import { NarupaUnityTarget, HoloScriptObject, UnityGenerationOptions } from './narupa-unity-target';
import { DatabaseFetcher, DatabaseQueryConfig, DatabaseQueryResult } from './database-fetcher';
import { NarupaServerConfig, NarupaServerStatus, MolecularDynamicsConfig } from './types';

// Re-export everything
export { NarupaProcessManager } from './narupa-process-manager';
export {
  NarupaOrchestrator,
  Task,
  TaskStatus,
  TaskResult,
  HITLCallback,
} from './narupa-orchestrator';
export { NarupaUnityTarget, HoloScriptObject, UnityGenerationOptions } from './narupa-unity-target';
export { DatabaseFetcher, DatabaseQueryConfig, DatabaseQueryResult } from './database-fetcher';
export { NarupaServerConfig, NarupaServerStatus, MolecularDynamicsConfig } from './types';

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
