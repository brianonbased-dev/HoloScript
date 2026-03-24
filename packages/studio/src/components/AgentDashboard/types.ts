/**
 * AgentDashboard — Shared Types
 *
 * Type definitions for A2A agent discovery, task management,
 * and x402 economy flows used across all dashboard components.
 */

// =============================================================================
// AGENT TYPES (A2A Agent Card)
// =============================================================================

export type ConnectionStatus = 'online' | 'offline' | 'error';

export interface AgentSkill {
  id: string;
  name: string;
  description?: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  url: string;
  capabilities: string[];
  skills: AgentSkill[];
  status: ConnectionStatus;
  lastActivityAt: number;
  version?: string;
}

// =============================================================================
// TASK TYPES (A2A Task Lifecycle)
// =============================================================================

export type TaskState =
  | 'submitted'
  | 'working'
  | 'input-required'
  | 'completed'
  | 'failed';

export interface TaskArtifact {
  id: string;
  type: 'code' | 'text' | 'json';
  name: string;
  content: string;
  mimeType?: string;
}

export interface TaskMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  timestamp: number;
  artifacts?: TaskArtifact[];
}

export interface Task {
  id: string;
  title: string;
  agentId: string;
  state: TaskState;
  messages: TaskMessage[];
  artifacts: TaskArtifact[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
}

// =============================================================================
// ECONOMY TYPES (x402 Payment Flows)
// =============================================================================

export type TransactionStatus = 'pending' | 'settled' | 'refunded';

export interface Transaction {
  id: string;
  amount: string; // USDC amount as string (decimal precision)
  payer: string;
  recipient: string;
  status: TransactionStatus;
  taskId?: string;
  timestamp: number;
  network: string;
  txHash?: string;
}

export interface SettlementStats {
  totalVolume: string;
  pendingAmount: string;
  settledAmount: string;
  refundedAmount: string;
  transactionCount: number;
}

// =============================================================================
// DASHBOARD PROPS
// =============================================================================

export interface AgentDashboardProps {
  agents: Agent[];
  tasks: Task[];
  transactions: Transaction[];
  settlementStats: SettlementStats;
  onAgentSelect?: (agent: Agent) => void;
  onTaskSelect?: (task: Task) => void;
  className?: string;
}
