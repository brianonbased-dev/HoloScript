/**
 * AgentDashboard — Barrel Export
 *
 * Provides the Agent Dashboard component suite for visualizing
 * A2A agents, task lifecycles, and x402 economy flows.
 */

export { AgentDashboard } from './AgentDashboard';
export { AgentCard } from './AgentCard';
export { TaskFlowView } from './TaskFlowView';
export { EconomyPanel } from './EconomyPanel';

export type {
  Agent,
  AgentSkill,
  ConnectionStatus,
  Task,
  TaskState,
  TaskMessage,
  TaskArtifact,
  Transaction,
  TransactionStatus,
  SettlementStats,
  AgentDashboardProps,
} from './types';

export type { AgentCardProps } from './AgentCard';
export type { TaskFlowViewProps } from './TaskFlowView';
export type { EconomyPanelProps } from './EconomyPanel';
