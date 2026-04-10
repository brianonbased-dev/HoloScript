/**
 * Hierarchy Module
 * Sprint 4 Priority 7 - Hierarchical Agent Orchestration
 *
 * Provides tree-structured agent hierarchies for delegation and supervision.
 */

// Types
export type {
  AgentHierarchy,
  HierarchyMetadata,
  DelegationRule,
  DelegationCondition,
  DelegatedTask,
  TaskStatus,
  TaskResult,
  TaskError,
  EscalationEvent,
  EscalationReason,
  HierarchyEvent,
  HierarchyEventHandler,
  HierarchyConfig,
  HierarchyStats,
} from './HierarchyTypes';

export { DEFAULT_HIERARCHY_CONFIG } from './HierarchyTypes';

// Hierarchy Manager
export {
  HierarchyManager,
  getHierarchyManager,
  resetHierarchyManager,
  type CreateHierarchyOptions,
} from './AgentHierarchy';

// Delegation Engine
export {
  DelegationEngine,
  getDelegationEngine,
  resetDelegationEngine,
  type DelegationEngineOptions,
  type DelegateTaskOptions,
} from './DelegationEngine';
