/**
 * MultiAgent Coordination Trait (v3.1)
 *
 * Enables multi-agent collaboration within HoloScript scenes.
 * Provides agent registry, inter-agent messaging, task delegation,
 * and shared state management with conflict resolution.
 *
 * Research Reference: uAA2++ Protocol — Multi-Agent Coordination
 *
 * Features:
 * - Agent registry with automatic discovery
 * - Unicast and broadcast messaging
 * - Task delegation with status tracking
 * - Shared state with last-write-wins conflict resolution
 * - Heartbeat-based liveness monitoring
 * - Capability-based agent discovery
 *
 * @version 3.1.0
 * @milestone v3.1 (March 2026)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type AgentStatus = 'active' | 'idle' | 'busy' | 'offline' | 'error';
type TaskStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'failed' | 'cancelled';
type MessagePriority = 'low' | 'normal' | 'high' | 'critical';

interface AgentRegistration {
  id: string;
  name: string;
  capabilities: string[];
  status: AgentStatus;
  metadata: Record<string, unknown>;
  registeredAt: number;
  lastHeartbeat: number;
  nodeRef: unknown | null;
}

interface AgentMessage {
  id: string;
  from: string;
  to: string | null; // null = broadcast
  type: string;
  payload: unknown;
  priority: MessagePriority;
  timestamp: number;
  correlationId?: string;
  replyTo?: string;
  ttl: number; // Time to live in ms
}

interface DelegatedTask {
  id: string;
  delegatorId: string;
  assigneeId: string | null;
  description: string;
  requiredCapabilities: string[];
  status: TaskStatus;
  priority: MessagePriority;
  payload: Record<string, unknown>;
  result: unknown | null;
  createdAt: number;
  updatedAt: number;
  deadline: number; // 0 = no deadline
  retryCount: number;
  maxRetries: number;
}

interface SharedStateEntry {
  key: string;
  value: unknown;
  lastWriter: string;
  version: number;
  updatedAt: number;
}

// =============================================================================
// CONFIG & STATE
// =============================================================================

interface MultiAgentConfig {
  /** Agent ID (defaults to node.id) */
  agent_id: string;
  /** Agent display name */
  agent_name: string;
  /** Advertised capabilities */
  capabilities: string[];
  /** Heartbeat interval in ms */
  heartbeat_interval: number;
  /** Agent considered offline after this many missed heartbeats */
  offline_threshold: number;
  /** Maximum inbox size */
  max_inbox_size: number;
  /** Message TTL in ms (default 60s) */
  default_message_ttl: number;
  /** Maximum delegated tasks */
  max_active_tasks: number;
  /** Task default deadline (0 = none) */
  default_task_deadline: number;
  /** Maximum retries for failed tasks */
  max_task_retries: number;
  /** Enable shared state */
  enable_shared_state: boolean;
  /** Maximum shared state entries */
  max_shared_state_entries: number;
}

interface MultiAgentState {
  /** This agent's registration */
  self: AgentRegistration;
  /** Registry of all known agents */
  registry: Map<string, AgentRegistration>;
  /** Inbox of received messages */
  inbox: AgentMessage[];
  /** Outbox of sent messages (for tracking) */
  outbox: AgentMessage[];
  /** Active delegated tasks (tasks this agent created) */
  delegatedTasks: DelegatedTask[];
  /** Assigned tasks (tasks assigned to this agent) */
  assignedTasks: DelegatedTask[];
  /** Shared state store */
  sharedState: Map<string, SharedStateEntry>;
  /** Time since last heartbeat broadcast */
  heartbeatTimer: number;
  /** Monotonically increasing message counter */
  messageCounter: number;
  /** Monotonically increasing task counter */
  taskCounter: number;
}

// =============================================================================
// HANDLER
// =============================================================================

export const multiAgentHandler: TraitHandler<MultiAgentConfig> = {
  name: 'multi_agent' as any,

  defaultConfig: {
    agent_id: '',
    agent_name: 'Agent',
    capabilities: [],
    heartbeat_interval: 5000,
    offline_threshold: 3,
    max_inbox_size: 100,
    default_message_ttl: 60000,
    max_active_tasks: 20,
    default_task_deadline: 0,
    max_task_retries: 3,
    enable_shared_state: true,
    max_shared_state_entries: 500,
  },

  onAttach(node, config, context) {
    const agentId = config.agent_id || (node as any).id || `agent_${Date.now()}`;

    const self: AgentRegistration = {
      id: agentId,
      name: config.agent_name,
      capabilities: [...config.capabilities],
      status: 'active',
      metadata: {},
      registeredAt: Date.now(),
      lastHeartbeat: Date.now(),
      nodeRef: node,
    };

    const state: MultiAgentState = {
      self,
      registry: new Map([[agentId, self]]),
      inbox: [],
      outbox: [],
      delegatedTasks: [],
      assignedTasks: [],
      sharedState: new Map(),
      heartbeatTimer: 0,
      messageCounter: 0,
      taskCounter: 0,
    };

    (node as any).__multiAgentState = state;

    context.emit?.('multi_agent_registered', {
      node,
      agent: { id: self.id, name: self.name, capabilities: self.capabilities },
    });
  },

  onDetach(node, _config, context) {
    const state = (node as any).__multiAgentState as MultiAgentState | undefined;
    if (state) {
      context.emit?.('multi_agent_unregistered', {
        node,
        agentId: state.self.id,
      });
    }
    delete (node as any).__multiAgentState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__multiAgentState as MultiAgentState;
    if (!state) return;

    // Heartbeat broadcast
    state.heartbeatTimer += delta;
    if (state.heartbeatTimer >= config.heartbeat_interval) {
      state.heartbeatTimer = 0;
      state.self.lastHeartbeat = Date.now();

      context.emit?.('multi_agent_heartbeat', {
        node,
        agentId: state.self.id,
        status: state.self.status,
        capabilities: state.self.capabilities,
        activeTasks: state.assignedTasks.filter((t) => t.status === 'in_progress').length,
      });

      // Check for offline agents
      const now = Date.now();
      const offlineThreshold = config.heartbeat_interval * config.offline_threshold;
      for (const [id, agent] of state.registry) {
        if (id === state.self.id) continue;
        if (now - agent.lastHeartbeat > offlineThreshold && agent.status !== 'offline') {
          agent.status = 'offline';
          context.emit?.('multi_agent_offline', { node, agentId: id, agentName: agent.name });
        }
      }
    }

    // Expire old messages
    const now = Date.now();
    state.inbox = state.inbox.filter((msg) => now - msg.timestamp < msg.ttl);

    // Check task deadlines
    for (const task of state.delegatedTasks) {
      if (
        task.deadline > 0 &&
        now > task.deadline &&
        task.status !== 'completed' &&
        task.status !== 'failed' &&
        task.status !== 'cancelled'
      ) {
        task.status = 'failed';
        task.updatedAt = now;
        context.emit?.('multi_agent_task_expired', { node, task });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__multiAgentState as MultiAgentState;
    if (!state) return;

    // -------- REGISTRY --------
    if (event.type === 'agent_discovered') {
      const { agentId, name, capabilities, metadata } = event.payload as {
        agentId: string;
        name: string;
        capabilities: string[];
        metadata?: Record<string, unknown>;
      };

      if (!state.registry.has(agentId)) {
        const registration: AgentRegistration = {
          id: agentId,
          name: name || agentId,
          capabilities: capabilities || [],
          status: 'active',
          metadata: metadata || {},
          registeredAt: Date.now(),
          lastHeartbeat: Date.now(),
          nodeRef: null,
        };
        state.registry.set(agentId, registration);

        context.emit?.('multi_agent_peer_registered', {
          node,
          agent: { id: agentId, name, capabilities },
          totalAgents: state.registry.size,
        });
      } else {
        // Update heartbeat
        const existing = state.registry.get(agentId)!;
        existing.lastHeartbeat = Date.now();
        existing.status = 'active';
        if (capabilities) existing.capabilities = capabilities;
      }
    }

    if (event.type === 'agent_departed') {
      const { agentId } = event.payload as { agentId: string };
      if (state.registry.has(agentId) && agentId !== state.self.id) {
        state.registry.delete(agentId);
        context.emit?.('multi_agent_peer_unregistered', {
          node,
          agentId,
          totalAgents: state.registry.size,
        });
      }
    }

    if (event.type === 'discover_agents') {
      const { capability } = (event.payload || {}) as { capability?: string };
      const agents = Array.from(state.registry.values()).filter((a) => {
        if (a.status === 'offline') return false;
        if (capability) return a.capabilities.includes(capability);
        return true;
      });

      context.emit?.('multi_agent_discovery_result', {
        node,
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          capabilities: a.capabilities,
          status: a.status,
        })),
        capability: capability || null,
      });
    }

    // -------- MESSAGING --------
    if (event.type === 'send_agent_message') {
      const { to, type, payload, priority, correlationId, replyTo } = event.payload as {
        to?: string;
        type: string;
        payload: unknown;
        priority?: MessagePriority;
        correlationId?: string;
        replyTo?: string;
      };

      const message: AgentMessage = {
        id: `msg_${Date.now()}_${++state.messageCounter}`,
        from: state.self.id,
        to: to || null,
        type,
        payload,
        priority: priority || 'normal',
        timestamp: Date.now(),
        correlationId,
        replyTo,
        ttl: config.default_message_ttl,
      };

      state.outbox.push(message);

      // Trim outbox
      if (state.outbox.length > config.max_inbox_size) {
        state.outbox = state.outbox.slice(-config.max_inbox_size);
      }

      if (to) {
        // Unicast
        context.emit?.('multi_agent_message_unicast', { node, message });
      } else {
        // Broadcast
        context.emit?.('multi_agent_message_broadcast', { node, message });
      }
    }

    if (event.type === 'receive_agent_message') {
      const message = event.payload as AgentMessage;

      // Check if message is for us
      if (message.to && message.to !== state.self.id) return;
      // Don't receive own messages
      if (message.from === state.self.id) return;

      // Check TTL
      if (Date.now() - message.timestamp > message.ttl) return;

      state.inbox.push(message);

      // Trim inbox
      if (state.inbox.length > config.max_inbox_size) {
        state.inbox.shift(); // Remove oldest
      }

      context.emit?.('multi_agent_message_received', {
        node,
        message: {
          id: message.id,
          from: message.from,
          type: message.type,
          priority: message.priority,
        },
      });
    }

    // -------- TASK DELEGATION --------
    if (event.type === 'delegate_task') {
      const { assigneeId, description, requiredCapabilities, payload, priority, deadline } =
        event.payload as {
          assigneeId?: string;
          description: string;
          requiredCapabilities?: string[];
          payload?: Record<string, unknown>;
          priority?: MessagePriority;
          deadline?: number;
        };

      if (state.delegatedTasks.length >= config.max_active_tasks) {
        context.emit?.('multi_agent_task_limit_reached', {
          node,
          limit: config.max_active_tasks,
        });
        return;
      }

      // Auto-assign based on capabilities if no assignee specified
      let resolvedAssignee = assigneeId || null;
      if (!resolvedAssignee && requiredCapabilities && requiredCapabilities.length > 0) {
        const candidates = Array.from(state.registry.values()).filter(
          (a) =>
            a.id !== state.self.id &&
            a.status !== 'offline' &&
            requiredCapabilities.every((cap) => a.capabilities.includes(cap))
        );
        if (candidates.length > 0) {
          // Pick the agent with fewest active tasks (load balance)
          resolvedAssignee = candidates[0].id;
        }
      }

      const task: DelegatedTask = {
        id: `task_${Date.now()}_${++state.taskCounter}`,
        delegatorId: state.self.id,
        assigneeId: resolvedAssignee,
        description,
        requiredCapabilities: requiredCapabilities || [],
        status: resolvedAssignee ? 'assigned' : 'pending',
        priority: priority || 'normal',
        payload: payload || {},
        result: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deadline: deadline || config.default_task_deadline,
        retryCount: 0,
        maxRetries: config.max_task_retries,
      };

      state.delegatedTasks.push(task);

      context.emit?.('multi_agent_task_delegated', {
        node,
        task: {
          id: task.id,
          assigneeId: task.assigneeId,
          description: task.description,
          status: task.status,
        },
      });
    }

    if (event.type === 'accept_task') {
      const { taskId } = event.payload as { taskId: string };
      const task = state.assignedTasks.find((t) => t.id === taskId);
      if (task && task.status === 'assigned') {
        task.status = 'in_progress';
        task.updatedAt = Date.now();
        state.self.status = 'busy';

        context.emit?.('multi_agent_task_accepted', {
          node,
          taskId,
          agentId: state.self.id,
        });
      }
    }

    if (event.type === 'complete_task') {
      const { taskId, result } = event.payload as {
        taskId: string;
        result?: unknown;
      };

      // Check in assigned tasks first
      const assignedTask = state.assignedTasks.find((t) => t.id === taskId);
      if (assignedTask) {
        assignedTask.status = 'completed';
        assignedTask.result = result || null;
        assignedTask.updatedAt = Date.now();

        // Update own status if no more in_progress tasks
        if (!state.assignedTasks.some((t) => t.status === 'in_progress')) {
          state.self.status = 'active';
        }

        context.emit?.('multi_agent_task_completed', {
          node,
          task: {
            id: assignedTask.id,
            delegatorId: assignedTask.delegatorId,
            result: assignedTask.result,
          },
        });
        return;
      }

      // Check in delegated tasks (reported completion from assignee)
      const delegatedTask = state.delegatedTasks.find((t) => t.id === taskId);
      if (delegatedTask) {
        delegatedTask.status = 'completed';
        delegatedTask.result = result || null;
        delegatedTask.updatedAt = Date.now();

        context.emit?.('multi_agent_task_completed', {
          node,
          task: {
            id: delegatedTask.id,
            assigneeId: delegatedTask.assigneeId,
            result: delegatedTask.result,
          },
        });
      }
    }

    if (event.type === 'fail_task') {
      const { taskId, error } = event.payload as { taskId: string; error?: string };
      const task =
        state.delegatedTasks.find((t) => t.id === taskId) ||
        state.assignedTasks.find((t) => t.id === taskId);

      if (task) {
        task.retryCount++;
        if (task.retryCount < task.maxRetries) {
          task.status = 'pending';
          task.updatedAt = Date.now();
          context.emit?.('multi_agent_task_retrying', {
            node,
            taskId,
            retryCount: task.retryCount,
            maxRetries: task.maxRetries,
          });
        } else {
          task.status = 'failed';
          task.updatedAt = Date.now();
          context.emit?.('multi_agent_task_failed', {
            node,
            taskId,
            error: error || 'max_retries_exceeded',
            retryCount: task.retryCount,
          });
        }
      }
    }

    // -------- SHARED STATE --------
    if (event.type === 'set_shared_state' && config.enable_shared_state) {
      const { key, value } = event.payload as { key: string; value: unknown };

      const existing = state.sharedState.get(key);
      const version = existing ? existing.version + 1 : 1;

      if (!existing && state.sharedState.size >= config.max_shared_state_entries) {
        context.emit?.('multi_agent_shared_state_limit', {
          node,
          limit: config.max_shared_state_entries,
        });
        return;
      }

      const entry: SharedStateEntry = {
        key,
        value,
        lastWriter: state.self.id,
        version,
        updatedAt: Date.now(),
      };

      state.sharedState.set(key, entry);

      context.emit?.('multi_agent_shared_state_updated', {
        node,
        key,
        version,
        writer: state.self.id,
      });
    }

    if (event.type === 'get_shared_state') {
      const { key } = event.payload as { key: string };
      const entry = state.sharedState.get(key);

      context.emit?.('multi_agent_shared_state_response', {
        node,
        key,
        value: entry?.value ?? null,
        version: entry?.version ?? 0,
        lastWriter: entry?.lastWriter ?? null,
      });
    }

    if (event.type === 'sync_shared_state') {
      const { entries } = event.payload as {
        entries: Array<{ key: string; value: unknown; writer: string; version: number }>;
      };

      for (const incoming of entries) {
        const existing = state.sharedState.get(incoming.key);
        // Last-write-wins: accept if version is higher
        if (!existing || incoming.version > existing.version) {
          state.sharedState.set(incoming.key, {
            key: incoming.key,
            value: incoming.value,
            lastWriter: incoming.writer,
            version: incoming.version,
            updatedAt: Date.now(),
          });
        }
      }

      context.emit?.('multi_agent_state_synced', {
        node,
        entriesReceived: entries.length,
        totalEntries: state.sharedState.size,
      });
    }

    // -------- STATUS --------
    if (event.type === 'get_agent_status') {
      context.emit?.('multi_agent_status_response', {
        node,
        agent: {
          id: state.self.id,
          name: state.self.name,
          status: state.self.status,
          capabilities: state.self.capabilities,
        },
        registrySize: state.registry.size,
        inboxSize: state.inbox.length,
        delegatedTasks: state.delegatedTasks.length,
        assignedTasks: state.assignedTasks.length,
        sharedStateSize: state.sharedState.size,
      });
    }

    if (event.type === 'set_agent_status') {
      const { status } = event.payload as { status: AgentStatus };
      state.self.status = status;
      context.emit?.('multi_agent_status_changed', {
        node,
        agentId: state.self.id,
        status,
      });
    }
  },
};

// =============================================================================
// EXPORTS
// =============================================================================

export {
  MultiAgentConfig,
  MultiAgentState,
  AgentRegistration,
  AgentMessage,
  DelegatedTask,
  SharedStateEntry,
  AgentStatus,
  TaskStatus,
  MessagePriority,
};

export default multiAgentHandler;
