import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** MCP Server Configuration */
export interface MCPServerConfig {
  name: string;
  url: string;
  apiKey: string;
  enabled: boolean;
  healthCheckInterval: number; // ms
  timeout: number; // ms
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
  };
  features: {
    semanticSearch: boolean;
    toolDiscovery: boolean;
    resourceManagement: boolean;
  };
}

/** Server Health Status */
export interface ServerStatus {
  name: string;
  isHealthy: boolean;
  lastCheck: Date;
  responseTime: number; // ms
  availableTools: number;
  errorMessage?: string;
}

/** MCP Tool Metadata */
export interface MCPTool {
  name: string;
  server: string;
  description: string;
  parameters: Record<
    string,
    {
      type: string;
      description: string;
      required: boolean;
      default?: unknown;
    }
  >;
  examples?: Array<{
    description: string;
    args: Record<string, unknown>;
  }>;
}

/** Agent Orchestration Workflow */
export interface AgentWorkflow {
  id: string;
  name: string;
  description: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: Date;
  updatedAt: Date;
}

export type WorkflowNodeType =
  | 'agent'
  | 'tool'
  | 'decision'
  | 'parallel'
  | 'sequential'
  | 'loop'
  | 'merge';

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  position: { x: number; y: number };
  data:
    | AgentNodeData
    | ToolNodeData
    | DecisionNodeData
    | ParallelNodeData
    | SequentialNodeData
    | LoopNodeData
    | MergeNodeData;
}

export interface AgentNodeData {
  type: 'agent';
  agentId: string; // brittney, physics, art-director, animator, sound
  systemPrompt: string;
  temperature: number;
  tools: string[]; // Available MCP tools
  maxTokens: number;
}

export interface ToolNodeData {
  type: 'tool';
  server: string; // MCP server name
  toolName: string;
  args: Record<string, unknown>;
  timeout: number;
}

export interface DecisionNodeData {
  type: 'decision';
  condition: string; // Expression to evaluate
  trueOutput: string; // Node ID if true
  falseOutput: string; // Node ID if false
}

export interface ParallelNodeData {
  type: 'parallel';
  policy: 'require-all' | 'require-one';
  timeout: number;
}

export interface SequentialNodeData {
  type: 'sequential';
  onError: 'abort' | 'skip' | 'retry';
}

export interface LoopNodeData {
  type: 'loop';
  iterableSource: string; // Variable name or expression
  itemVariable: string; // Loop variable name
  maxIterations?: number;
}

export interface MergeNodeData {
  type: 'merge';
  waitForAll: boolean; // true = wait for all inputs, false = proceed on first
  timeout?: number;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
}

/** Agent Event (from AgentEventBus) */
export interface AgentEvent<T = unknown> {
  id: string;
  topic: string;
  payload: T;
  senderId: string;
  timestamp: number;
  receivedBy: string[];
}

/** Behavior Tree Node */
export type BTNodeType =
  | 'sequence'
  | 'selector'
  | 'parallel'
  | 'action'
  | 'condition'
  | 'inverter'
  | 'repeat'
  | 'retry'
  | 'guard'
  | 'timeout';

export interface BTNode {
  id: string;
  type: BTNodeType;
  label: string;
  position: { x: number; y: number };
  children?: string[]; // Child node IDs
  data: BTNodeData;
}

export interface BTNodeData {
  // Composite nodes
  policy?: 'require-all' | 'require-one'; // For parallel

  // Decorator nodes
  maxRepeats?: number; // For repeat
  maxRetries?: number; // For retry
  condition?: string; // For guard
  timeoutMs?: number; // For timeout

  // Leaf nodes
  actionCode?: string; // For action
  conditionCode?: string; // For condition
}

/** Tool Call Record (for visualization) */
export interface ToolCallRecord {
  id: string;
  timestamp: number;
  toolName: string;
  server: string;
  args: Record<string, unknown>;
  result?: unknown;
  error?: string;
  duration: number; // ms
  status: 'pending' | 'running' | 'success' | 'error';
  triggeredBy: string; // Agent ID or user
}

// ============================================================================
// ZUSTAND STORE
// ============================================================================

interface OrchestrationState {
  // MCP Server Management
  mcpServers: Map<string, MCPServerConfig>;
  serverStatuses: Map<string, ServerStatus>;
  mcpTools: Map<string, MCPTool[]>; // server name → tools
  toolMetadataCache: Map<string, MCPTool>; // tool name → full metadata (lazy loaded)
  selectedServer: string | null;

  // Agent Workflows
  workflows: Map<string, AgentWorkflow>;
  activeWorkflow: string | null;

  // Agent Events (from EventBus)
  events: AgentEvent[];
  eventFilter: {
    topic?: string;
    senderId?: string;
    receiverId?: string;
  };

  // Behavior Trees
  behaviorTrees: Map<string, { nodes: BTNode[]; edges: WorkflowEdge[] }>;
  activeBehaviorTree: string | null;

  // Tool Call History
  toolCallHistory: ToolCallRecord[];

  // UI State
  panelsOpen: {
    mcpConfig: boolean;
    agentOrchestration: boolean;
    behaviorTree: boolean;
    eventMonitor: boolean;
    toolCallGraph: boolean;
    desktopAgentEnsemble: boolean;
  };

  // =========================================================================
  // MCP SERVER ACTIONS
  // =========================================================================

  addMCPServer: (config: MCPServerConfig) => void;
  removeMCPServer: (name: string) => void;
  updateMCPServer: (name: string, config: Partial<MCPServerConfig>) => void;
  setServerStatus: (name: string, status: ServerStatus) => void;
  setMCPTools: (server: string, tools: MCPTool[]) => void;
  cacheToolMetadata: (toolName: string, metadata: MCPTool) => void;
  getToolMetadata: (toolName: string) => MCPTool | undefined;
  selectServer: (name: string | null) => void;

  // =========================================================================
  // WORKFLOW ACTIONS
  // =========================================================================

  createWorkflow: (name: string, description: string) => string; // Returns ID
  deleteWorkflow: (id: string) => void;
  setActiveWorkflow: (id: string | null) => void;
  updateWorkflow: (id: string, updates: Partial<Omit<AgentWorkflow, 'id' | 'createdAt'>>) => void;
  addWorkflowNode: (workflowId: string, node: WorkflowNode) => void;
  removeWorkflowNode: (workflowId: string, nodeId: string) => void;
  updateWorkflowNode: (workflowId: string, nodeId: string, updates: Partial<WorkflowNode>) => void;
  addWorkflowEdge: (workflowId: string, edge: WorkflowEdge) => void;
  removeWorkflowEdge: (workflowId: string, edgeId: string) => void;

  // =========================================================================
  // EVENT ACTIONS
  // =========================================================================

  addEvent: (event: AgentEvent) => void;
  clearEvents: () => void;
  setEventFilter: (filter: Partial<OrchestrationState['eventFilter']>) => void;

  // =========================================================================
  // BEHAVIOR TREE ACTIONS
  // =========================================================================

  createBehaviorTree: (id: string) => void;
  deleteBehaviorTree: (id: string) => void;
  setActiveBehaviorTree: (id: string | null) => void;
  addBTNode: (treeId: string, node: BTNode) => void;
  removeBTNode: (treeId: string, nodeId: string) => void;
  updateBTNode: (treeId: string, nodeId: string, updates: Partial<BTNode>) => void;
  addBTEdge: (treeId: string, edge: WorkflowEdge) => void;
  removeBTEdge: (treeId: string, edgeId: string) => void;

  // =========================================================================
  // TOOL CALL ACTIONS
  // =========================================================================

  addToolCall: (record: ToolCallRecord) => void;
  updateToolCall: (id: string, updates: Partial<ToolCallRecord>) => void;
  clearToolCallHistory: () => void;

  // =========================================================================
  // UI ACTIONS
  // =========================================================================

  togglePanel: (panel: keyof OrchestrationState['panelsOpen']) => void;
  setPanelOpen: (panel: keyof OrchestrationState['panelsOpen'], open: boolean) => void;

  // =========================================================================
  // UTILITY ACTIONS
  // =========================================================================

  reset: () => void;
  restoreFromStorage: () => void;
}

// ============================================================================
// INITIAL STATE
// ============================================================================

const initialState = {
  mcpServers: new Map<string, MCPServerConfig>(),
  serverStatuses: new Map<string, ServerStatus>(),
  mcpTools: new Map<string, MCPTool[]>(),
  toolMetadataCache: new Map<string, MCPTool>(),
  selectedServer: null,
  workflows: new Map<string, AgentWorkflow>(),
  activeWorkflow: null,
  events: [],
  eventFilter: {},
  behaviorTrees: new Map<string, { nodes: BTNode[]; edges: WorkflowEdge[] }>(),
  activeBehaviorTree: null,
  toolCallHistory: [],
  panelsOpen: {
    mcpConfig: false,
    agentOrchestration: false,
    behaviorTree: false,
    eventMonitor: false,
    toolCallGraph: false,
    desktopAgentEnsemble: false,
  },
};

// ============================================================================
// PERSISTENCE HELPERS
// ============================================================================

/**
 * Restore persisted orchestration state from localStorage.
 * Called during store initialization to recover workflows and behavior trees.
 */
function restorePersistedState() {
  const restored: Partial<OrchestrationState> = {};

  // Skip restoration during SSR
  if (typeof window === 'undefined') {
    return restored;
  }

  try {
    // Restore workflows
    const savedWorkflows = localStorage.getItem('holoscript-workflows');
    if (savedWorkflows) {
      const parsed = JSON.parse(savedWorkflows);
      restored.workflows = new Map(parsed);
    }

    // Restore behavior trees
    const savedBehaviorTrees = localStorage.getItem('holoscript-behavior-trees');
    if (savedBehaviorTrees) {
      const parsed = JSON.parse(savedBehaviorTrees);
      restored.behaviorTrees = new Map(parsed);
    }

    // Restore active workflow ID
    const savedActiveWorkflow = localStorage.getItem('holoscript-active-workflow');
    if (savedActiveWorkflow) {
      restored.activeWorkflow = savedActiveWorkflow;
    }

    // Restore active behavior tree ID
    const savedActiveBehaviorTree = localStorage.getItem('holoscript-active-behavior-tree');
    if (savedActiveBehaviorTree) {
      restored.activeBehaviorTree = savedActiveBehaviorTree;
    }
  } catch (error) {
    console.error('[OrchestrationPersistence] Failed to restore state:', error);
  }

  return restored;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

export const useOrchestrationStore = create<OrchestrationState>()(
  devtools(
    (set, get) => ({
      ...initialState,
      // Apply persisted state on initialization
      ...restorePersistedState(),

      // MCP SERVER ACTIONS
      addMCPServer: (config) =>
        set((state) => {
          const newServers = new Map(state.mcpServers);
          newServers.set(config.name, config);
          return { mcpServers: newServers };
        }),

      removeMCPServer: (name) =>
        set((state) => {
          const newServers = new Map(state.mcpServers);
          newServers.delete(name);
          const newStatuses = new Map(state.serverStatuses);
          newStatuses.delete(name);
          const newTools = new Map(state.mcpTools);
          newTools.delete(name);
          return {
            mcpServers: newServers,
            serverStatuses: newStatuses,
            mcpTools: newTools,
            selectedServer: state.selectedServer === name ? null : state.selectedServer,
          };
        }),

      updateMCPServer: (name, updates) =>
        set((state) => {
          const server = state.mcpServers.get(name);
          if (!server) return state;
          const newServers = new Map(state.mcpServers);
          newServers.set(name, { ...server, ...updates });
          return { mcpServers: newServers };
        }),

      setServerStatus: (name, status) =>
        set((state) => {
          const newStatuses = new Map(state.serverStatuses);
          newStatuses.set(name, status);
          return { serverStatuses: newStatuses };
        }),

      setMCPTools: (server, tools) =>
        set((state) => {
          const newTools = new Map(state.mcpTools);
          newTools.set(server, tools);
          return { mcpTools: newTools };
        }),

      cacheToolMetadata: (toolName, metadata) =>
        set((state) => {
          const newCache = new Map(state.toolMetadataCache);
          newCache.set(toolName, metadata);
          return { toolMetadataCache: newCache };
        }),

      getToolMetadata: (toolName) => {
        const state = get();
        return state.toolMetadataCache.get(toolName);
      },

      selectServer: (name) => set({ selectedServer: name }),

      // WORKFLOW ACTIONS
      createWorkflow: (name, description) => {
        const id = `workflow_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
        const workflow: AgentWorkflow = {
          id,
          name,
          description,
          nodes: [],
          edges: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        set((state) => {
          const newWorkflows = new Map(state.workflows);
          newWorkflows.set(id, workflow);
          return { workflows: newWorkflows, activeWorkflow: id };
        });
        return id;
      },

      deleteWorkflow: (id) =>
        set((state) => {
          const newWorkflows = new Map(state.workflows);
          newWorkflows.delete(id);
          return {
            workflows: newWorkflows,
            activeWorkflow: state.activeWorkflow === id ? null : state.activeWorkflow,
          };
        }),

      setActiveWorkflow: (id) => set({ activeWorkflow: id }),

      updateWorkflow: (id, updates) =>
        set((state) => {
          const workflow = state.workflows.get(id);
          if (!workflow) return state;
          const newWorkflows = new Map(state.workflows);
          newWorkflows.set(id, { ...workflow, ...updates, updatedAt: new Date() });
          return { workflows: newWorkflows };
        }),

      addWorkflowNode: (workflowId, node) =>
        set((state) => {
          const workflow = state.workflows.get(workflowId);
          if (!workflow) return state;
          const newWorkflows = new Map(state.workflows);
          newWorkflows.set(workflowId, {
            ...workflow,
            nodes: [...workflow.nodes, node],
            updatedAt: new Date(),
          });
          return { workflows: newWorkflows };
        }),

      removeWorkflowNode: (workflowId, nodeId) =>
        set((state) => {
          const workflow = state.workflows.get(workflowId);
          if (!workflow) return state;
          const newWorkflows = new Map(state.workflows);
          newWorkflows.set(workflowId, {
            ...workflow,
            nodes: workflow.nodes.filter((n) => n.id !== nodeId),
            edges: workflow.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
            updatedAt: new Date(),
          });
          return { workflows: newWorkflows };
        }),

      updateWorkflowNode: (workflowId, nodeId, updates) =>
        set((state) => {
          const workflow = state.workflows.get(workflowId);
          if (!workflow) return state;
          const newWorkflows = new Map(state.workflows);
          newWorkflows.set(workflowId, {
            ...workflow,
            nodes: workflow.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)),
            updatedAt: new Date(),
          });
          return { workflows: newWorkflows };
        }),

      addWorkflowEdge: (workflowId, edge) =>
        set((state) => {
          const workflow = state.workflows.get(workflowId);
          if (!workflow) return state;
          const newWorkflows = new Map(state.workflows);
          newWorkflows.set(workflowId, {
            ...workflow,
            edges: [...workflow.edges, edge],
            updatedAt: new Date(),
          });
          return { workflows: newWorkflows };
        }),

      removeWorkflowEdge: (workflowId, edgeId) =>
        set((state) => {
          const workflow = state.workflows.get(workflowId);
          if (!workflow) return state;
          const newWorkflows = new Map(state.workflows);
          newWorkflows.set(workflowId, {
            ...workflow,
            edges: workflow.edges.filter((e) => e.id !== edgeId),
            updatedAt: new Date(),
          });
          return { workflows: newWorkflows };
        }),

      // EVENT ACTIONS
      addEvent: (event) =>
        set((state) => ({
          events: [...state.events.slice(-999), event], // Keep last 1000 events
        })),

      clearEvents: () => set({ events: [] }),

      setEventFilter: (filter) =>
        set((state) => ({
          eventFilter: { ...state.eventFilter, ...filter },
        })),

      // BEHAVIOR TREE ACTIONS
      createBehaviorTree: (id) =>
        set((state) => {
          const newTrees = new Map(state.behaviorTrees);
          newTrees.set(id, { nodes: [], edges: [] });
          return { behaviorTrees: newTrees, activeBehaviorTree: id };
        }),

      deleteBehaviorTree: (id) =>
        set((state) => {
          const newTrees = new Map(state.behaviorTrees);
          newTrees.delete(id);
          return {
            behaviorTrees: newTrees,
            activeBehaviorTree: state.activeBehaviorTree === id ? null : state.activeBehaviorTree,
          };
        }),

      setActiveBehaviorTree: (id) => set({ activeBehaviorTree: id }),

      addBTNode: (treeId, node) =>
        set((state) => {
          const tree = state.behaviorTrees.get(treeId);
          if (!tree) return state;
          const newTrees = new Map(state.behaviorTrees);
          newTrees.set(treeId, {
            ...tree,
            nodes: [...tree.nodes, node],
          });
          return { behaviorTrees: newTrees };
        }),

      removeBTNode: (treeId, nodeId) =>
        set((state) => {
          const tree = state.behaviorTrees.get(treeId);
          if (!tree) return state;
          const newTrees = new Map(state.behaviorTrees);
          newTrees.set(treeId, {
            ...tree,
            nodes: tree.nodes.filter((n) => n.id !== nodeId),
            edges: tree.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
          });
          return { behaviorTrees: newTrees };
        }),

      updateBTNode: (treeId, nodeId, updates) =>
        set((state) => {
          const tree = state.behaviorTrees.get(treeId);
          if (!tree) return state;
          const newTrees = new Map(state.behaviorTrees);
          newTrees.set(treeId, {
            ...tree,
            nodes: tree.nodes.map((n) => (n.id === nodeId ? { ...n, ...updates } : n)),
          });
          return { behaviorTrees: newTrees };
        }),

      addBTEdge: (treeId, edge) =>
        set((state) => {
          const tree = state.behaviorTrees.get(treeId);
          if (!tree) return state;
          const newTrees = new Map(state.behaviorTrees);
          newTrees.set(treeId, {
            ...tree,
            edges: [...tree.edges, edge],
          });
          return { behaviorTrees: newTrees };
        }),

      removeBTEdge: (treeId, edgeId) =>
        set((state) => {
          const tree = state.behaviorTrees.get(treeId);
          if (!tree) return state;
          const newTrees = new Map(state.behaviorTrees);
          newTrees.set(treeId, {
            ...tree,
            edges: tree.edges.filter((e) => e.id !== edgeId),
          });
          return { behaviorTrees: newTrees };
        }),

      // TOOL CALL ACTIONS
      addToolCall: (record) =>
        set((state) => ({
          toolCallHistory: [...state.toolCallHistory.slice(-999), record], // Keep last 1000
        })),

      updateToolCall: (id, updates) =>
        set((state) => ({
          toolCallHistory: state.toolCallHistory.map((r) =>
            r.id === id ? { ...r, ...updates } : r
          ),
        })),

      clearToolCallHistory: () => set({ toolCallHistory: [] }),

      // UI ACTIONS
      togglePanel: (panel) =>
        set((state) => ({
          panelsOpen: {
            ...state.panelsOpen,
            [panel]: !state.panelsOpen[panel],
          },
        })),

      setPanelOpen: (panel, open) =>
        set((state) => ({
          panelsOpen: {
            ...state.panelsOpen,
            [panel]: open,
          },
        })),

      // UTILITY
      reset: () => set(initialState),

      // Manually restore persisted state from localStorage (useful for debugging)
      restoreFromStorage: () => {
        const restored = restorePersistedState();
        set(restored);
      },
    }),
    { name: 'orchestration-store' }
  )
);
