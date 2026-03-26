/**
 * orchestrationStore.test.ts — Tests for the MCP orchestration Zustand store
 *
 * Covers: MCP server CRUD, server status, tool registry/cache, workflow CRUD,
 * workflow node/edge management, events/filtering, behavior trees,
 * tool call history, panel toggling, and reset.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useOrchestrationStore } from '../lib/orchestrationStore';
import type {
  MCPServerConfig,
  ServerStatus,
  MCPTool,
  WorkflowNode,
  WorkflowEdge,
  BTNode,
  ToolCallRecord,
} from '../lib/orchestrationStore';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeServer(name = 'test-server'): MCPServerConfig {
  return {
    name,
    url: 'http://localhost:3000',
    apiKey: 'key-123',
    enabled: true,
    healthCheckInterval: 30000,
    timeout: 5000,
    retryPolicy: { maxRetries: 3, backoffMultiplier: 1.5 },
    features: { semanticSearch: true, toolDiscovery: true, resourceManagement: false },
  };
}

function makeToolDef(name = 'compile_holo'): MCPTool {
  return {
    name,
    server: 'test-server',
    description: 'Compile a .holo file',
    parameters: {
      path: { type: 'string', description: 'File path', required: true },
    },
  };
}

function makeNode(id = 'node-1', type: 'agent' | 'tool' = 'agent'): WorkflowNode {
  if (type === 'agent') {
    return {
      id,
      type: 'agent',
      label: 'Brittney',
      position: { x: 100, y: 100 },
      data: { type: 'agent', agentId: 'brittney', systemPrompt: 'You are Brittney', temperature: 0.7, tools: [], maxTokens: 4096 },
    };
  }
  return {
    id,
    type: 'tool',
    label: 'Compile',
    position: { x: 200, y: 100 },
    data: { type: 'tool', server: 'test-server', toolName: 'compile_holo', args: {}, timeout: 30000 },
  };
}

function makeEdge(source = 'node-1', target = 'node-2'): WorkflowEdge {
  return { id: `edge-${source}-${target}`, source, target };
}

function makeBTNode(id = 'bt-1'): BTNode {
  return { id, type: 'sequence', label: 'Root', position: { x: 0, y: 0 }, data: {} };
}

function makeToolCall(id = 'tc-1'): ToolCallRecord {
  return {
    id,
    timestamp: Date.now(),
    toolName: 'compile_holo',
    server: 'test-server',
    args: {},
    duration: 120,
    status: 'success',
    triggeredBy: 'brittney',
  };
}

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  useOrchestrationStore.getState().reset();
});

// ── MCP Server Management ────────────────────────────────────────────────────

describe('orchestrationStore — MCP servers', () => {
  it('addMCPServer registers a new server', () => {
    const { addMCPServer, mcpServers } = useOrchestrationStore.getState();
    addMCPServer(makeServer());
    const servers = useOrchestrationStore.getState().mcpServers;
    expect(servers.has('test-server')).toBe(true);
  });

  it('removeMCPServer deletes the server and its status/tools', () => {
    const store = useOrchestrationStore.getState();
    store.addMCPServer(makeServer());
    store.setServerStatus('test-server', { name: 'test-server', isHealthy: true, lastCheck: new Date(), responseTime: 50, availableTools: 3 });
    store.setMCPTools('test-server', [makeToolDef()]);
    store.removeMCPServer('test-server');

    const state = useOrchestrationStore.getState();
    expect(state.mcpServers.has('test-server')).toBe(false);
    expect(state.serverStatuses.has('test-server')).toBe(false);
    expect(state.mcpTools.has('test-server')).toBe(false);
  });

  it('removeMCPServer clears selectedServer if it was selected', () => {
    const store = useOrchestrationStore.getState();
    store.addMCPServer(makeServer());
    store.selectServer('test-server');
    store.removeMCPServer('test-server');
    expect(useOrchestrationStore.getState().selectedServer).toBeNull();
  });

  it('updateMCPServer patches server config', () => {
    const store = useOrchestrationStore.getState();
    store.addMCPServer(makeServer());
    store.updateMCPServer('test-server', { enabled: false, timeout: 10000 });
    const updated = useOrchestrationStore.getState().mcpServers.get('test-server')!;
    expect(updated.enabled).toBe(false);
    expect(updated.timeout).toBe(10000);
    expect(updated.url).toBe('http://localhost:3000'); // unchanged
  });

  it('updateMCPServer no-ops for unknown server', () => {
    const store = useOrchestrationStore.getState();
    store.updateMCPServer('nonexistent', { enabled: false });
    expect(useOrchestrationStore.getState().mcpServers.size).toBe(0);
  });

  it('selectServer sets the active server', () => {
    const store = useOrchestrationStore.getState();
    store.addMCPServer(makeServer());
    store.selectServer('test-server');
    expect(useOrchestrationStore.getState().selectedServer).toBe('test-server');
  });
});

// ── Tool Registry ────────────────────────────────────────────────────────────

describe('orchestrationStore — tool registry', () => {
  it('setMCPTools registers tools for a server', () => {
    const store = useOrchestrationStore.getState();
    store.setMCPTools('srv', [makeToolDef('tool-a'), makeToolDef('tool-b')]);
    const tools = useOrchestrationStore.getState().mcpTools.get('srv')!;
    expect(tools).toHaveLength(2);
  });

  it('cacheToolMetadata + getToolMetadata round-trips', () => {
    const store = useOrchestrationStore.getState();
    const tool = makeToolDef('cached');
    store.cacheToolMetadata('cached', tool);
    expect(useOrchestrationStore.getState().getToolMetadata('cached')?.name).toBe('cached');
  });

  it('getToolMetadata returns undefined for unknown tool', () => {
    expect(useOrchestrationStore.getState().getToolMetadata('nope')).toBeUndefined();
  });
});

// ── Workflows ────────────────────────────────────────────────────────────────

describe('orchestrationStore — workflows', () => {
  it('createWorkflow returns ID and sets active', () => {
    const id = useOrchestrationStore.getState().createWorkflow('Pipeline', 'Build pipeline');
    expect(typeof id).toBe('string');
    const state = useOrchestrationStore.getState();
    expect(state.workflows.has(id)).toBe(true);
    expect(state.activeWorkflow).toBe(id);
  });

  it('deleteWorkflow removes it and clears active if matching', () => {
    const id = useOrchestrationStore.getState().createWorkflow('Temp', 'Temp');
    useOrchestrationStore.getState().deleteWorkflow(id);
    const state = useOrchestrationStore.getState();
    expect(state.workflows.has(id)).toBe(false);
    expect(state.activeWorkflow).toBeNull();
  });

  it('addWorkflowNode appends a node', () => {
    const id = useOrchestrationStore.getState().createWorkflow('W', 'W');
    useOrchestrationStore.getState().addWorkflowNode(id, makeNode('n1'));
    const wf = useOrchestrationStore.getState().workflows.get(id)!;
    expect(wf.nodes).toHaveLength(1);
    expect(wf.nodes[0].id).toBe('n1');
  });

  it('removeWorkflowNode removes node + connected edges', () => {
    const id = useOrchestrationStore.getState().createWorkflow('W', 'W');
    const store = useOrchestrationStore.getState();
    store.addWorkflowNode(id, makeNode('n1'));
    store.addWorkflowNode(id, makeNode('n2', 'tool'));
    store.addWorkflowEdge(id, makeEdge('n1', 'n2'));
    store.removeWorkflowNode(id, 'n1');
    const wf = useOrchestrationStore.getState().workflows.get(id)!;
    expect(wf.nodes.find((n: WorkflowNode) => n.id === 'n1')).toBeUndefined();
    expect(wf.edges).toHaveLength(0);
  });

  it('updateWorkflowNode patches node data', () => {
    const id = useOrchestrationStore.getState().createWorkflow('W', 'W');
    useOrchestrationStore.getState().addWorkflowNode(id, makeNode('n1'));
    useOrchestrationStore.getState().updateWorkflowNode(id, 'n1', { label: 'Updated' });
    const wf = useOrchestrationStore.getState().workflows.get(id)!;
    expect(wf.nodes[0].label).toBe('Updated');
  });

  it('addWorkflowEdge + removeWorkflowEdge', () => {
    const id = useOrchestrationStore.getState().createWorkflow('W', 'W');
    const edge = makeEdge('a', 'b');
    useOrchestrationStore.getState().addWorkflowEdge(id, edge);
    expect(useOrchestrationStore.getState().workflows.get(id)!.edges).toHaveLength(1);
    useOrchestrationStore.getState().removeWorkflowEdge(id, edge.id);
    expect(useOrchestrationStore.getState().workflows.get(id)!.edges).toHaveLength(0);
  });
});

// ── Events ───────────────────────────────────────────────────────────────────

describe('orchestrationStore — events', () => {
  it('addEvent appends an event', () => {
    useOrchestrationStore.getState().addEvent({
      id: 'e1', topic: 'compile', payload: {}, senderId: 'brittney', timestamp: Date.now(), receivedBy: [],
    });
    expect(useOrchestrationStore.getState().events).toHaveLength(1);
  });

  it('clearEvents empties the list', () => {
    useOrchestrationStore.getState().addEvent({
      id: 'e1', topic: 'compile', payload: {}, senderId: 'brittney', timestamp: Date.now(), receivedBy: [],
    });
    useOrchestrationStore.getState().clearEvents();
    expect(useOrchestrationStore.getState().events).toHaveLength(0);
  });

  it('setEventFilter merges filter', () => {
    useOrchestrationStore.getState().setEventFilter({ topic: 'build' });
    expect(useOrchestrationStore.getState().eventFilter.topic).toBe('build');
    useOrchestrationStore.getState().setEventFilter({ senderId: 'agent-1' });
    const f = useOrchestrationStore.getState().eventFilter;
    expect(f.topic).toBe('build');
    expect(f.senderId).toBe('agent-1');
  });
});

// ── Behavior Trees ───────────────────────────────────────────────────────────

describe('orchestrationStore — behavior trees', () => {
  it('createBehaviorTree initializes empty tree and sets active', () => {
    useOrchestrationStore.getState().createBehaviorTree('bt-main');
    const state = useOrchestrationStore.getState();
    expect(state.behaviorTrees.has('bt-main')).toBe(true);
    expect(state.activeBehaviorTree).toBe('bt-main');
  });

  it('deleteBehaviorTree removes and clears active if matching', () => {
    useOrchestrationStore.getState().createBehaviorTree('bt-x');
    useOrchestrationStore.getState().deleteBehaviorTree('bt-x');
    const state = useOrchestrationStore.getState();
    expect(state.behaviorTrees.has('bt-x')).toBe(false);
    expect(state.activeBehaviorTree).toBeNull();
  });

  it('addBTNode + removeBTNode', () => {
    useOrchestrationStore.getState().createBehaviorTree('bt');
    useOrchestrationStore.getState().addBTNode('bt', makeBTNode('n1'));
    expect(useOrchestrationStore.getState().behaviorTrees.get('bt')!.nodes).toHaveLength(1);
    useOrchestrationStore.getState().removeBTNode('bt', 'n1');
    expect(useOrchestrationStore.getState().behaviorTrees.get('bt')!.nodes).toHaveLength(0);
  });

  it('updateBTNode patches node in tree', () => {
    useOrchestrationStore.getState().createBehaviorTree('bt');
    useOrchestrationStore.getState().addBTNode('bt', makeBTNode('n1'));
    useOrchestrationStore.getState().updateBTNode('bt', 'n1', { label: 'Patched' });
    expect(useOrchestrationStore.getState().behaviorTrees.get('bt')!.nodes[0].label).toBe('Patched');
  });

  it('addBTEdge + removeBTEdge', () => {
    useOrchestrationStore.getState().createBehaviorTree('bt');
    const edge: WorkflowEdge = { id: 'e1', source: 'a', target: 'b' };
    useOrchestrationStore.getState().addBTEdge('bt', edge);
    expect(useOrchestrationStore.getState().behaviorTrees.get('bt')!.edges).toHaveLength(1);
    useOrchestrationStore.getState().removeBTEdge('bt', 'e1');
    expect(useOrchestrationStore.getState().behaviorTrees.get('bt')!.edges).toHaveLength(0);
  });
});

// ── Tool Call History ────────────────────────────────────────────────────────

describe('orchestrationStore — tool call history', () => {
  it('addToolCall appends a record', () => {
    useOrchestrationStore.getState().addToolCall(makeToolCall());
    expect(useOrchestrationStore.getState().toolCallHistory).toHaveLength(1);
  });

  it('updateToolCall patches matching record', () => {
    useOrchestrationStore.getState().addToolCall(makeToolCall('tc-1'));
    useOrchestrationStore.getState().updateToolCall('tc-1', { status: 'error', error: 'timeout' });
    const record = useOrchestrationStore.getState().toolCallHistory[0];
    expect(record.status).toBe('error');
    expect(record.error).toBe('timeout');
  });

  it('clearToolCallHistory empties the list', () => {
    useOrchestrationStore.getState().addToolCall(makeToolCall());
    useOrchestrationStore.getState().clearToolCallHistory();
    expect(useOrchestrationStore.getState().toolCallHistory).toHaveLength(0);
  });
});

// ── Panel UI ─────────────────────────────────────────────────────────────────

describe('orchestrationStore — panel UI', () => {
  it('togglePanel flips the panel state', () => {
    expect(useOrchestrationStore.getState().panelsOpen.mcpConfig).toBe(false);
    useOrchestrationStore.getState().togglePanel('mcpConfig');
    expect(useOrchestrationStore.getState().panelsOpen.mcpConfig).toBe(true);
    useOrchestrationStore.getState().togglePanel('mcpConfig');
    expect(useOrchestrationStore.getState().panelsOpen.mcpConfig).toBe(false);
  });

  it('setPanelOpen sets explicit state', () => {
    useOrchestrationStore.getState().setPanelOpen('behaviorTree', true);
    expect(useOrchestrationStore.getState().panelsOpen.behaviorTree).toBe(true);
    useOrchestrationStore.getState().setPanelOpen('behaviorTree', false);
    expect(useOrchestrationStore.getState().panelsOpen.behaviorTree).toBe(false);
  });
});

// ── Reset ────────────────────────────────────────────────────────────────────

describe('orchestrationStore — reset', () => {
  it('reset clears all state back to initial', () => {
    const store = useOrchestrationStore.getState();
    store.addMCPServer(makeServer());
    store.createWorkflow('W', 'W');
    store.createBehaviorTree('bt');
    store.addEvent({ id: 'e1', topic: 't', payload: {}, senderId: 's', timestamp: 0, receivedBy: [] });
    store.addToolCall(makeToolCall());

    store.reset();
    const state = useOrchestrationStore.getState();
    expect(state.mcpServers.size).toBe(0);
    expect(state.workflows.size).toBe(0);
    expect(state.behaviorTrees.size).toBe(0);
    expect(state.events).toHaveLength(0);
    expect(state.toolCallHistory).toHaveLength(0);
    expect(state.activeWorkflow).toBeNull();
    expect(state.activeBehaviorTree).toBeNull();
  });
});
