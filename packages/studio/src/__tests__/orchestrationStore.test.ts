import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useOrchestrationStore } from '../lib/orchestrationStore';

describe('Orchestration Store', () => {
  beforeEach(() => {
    // Reset state before each test
    useOrchestrationStore.getState().reset();
    vi.clearAllMocks();
  });

  it('should initialize with correct default state', () => {
    const state = useOrchestrationStore.getState();
    expect(state.mcpServers.size).toBe(0);
    expect(state.workflows.size).toBe(0);
    expect(state.events.length).toBe(0);
    expect(state.toolCallHistory.length).toBe(0);
    expect(state.panelsOpen.agentOrchestration).toBe(false);
  });

  it('should add and remove MCP servers', () => {
    const store = useOrchestrationStore.getState();
    const config = {
      name: 'test-server',
      url: 'http://localhost:1234',
      apiKey: 'test-key',
      enabled: true,
      healthCheckInterval: 5000,
      timeout: 10000,
      retryPolicy: { maxRetries: 3, backoffMultiplier: 2 },
      features: { semanticSearch: true, toolDiscovery: true, resourceManagement: true },
    };

    store.addMCPServer(config);
    expect(useOrchestrationStore.getState().mcpServers.get('test-server')).toEqual(config);

    store.removeMCPServer('test-server');
    expect(useOrchestrationStore.getState().mcpServers.has('test-server')).toBe(false);
  });

  it('should add and update tool calls', () => {
    const store = useOrchestrationStore.getState();
    const toolCall = {
      id: 'tool-1',
      timestamp: Date.now(),
      toolName: 'myTool',
      server: 'myServer',
      args: {},
      duration: 100,
      status: 'pending' as const,
      triggeredBy: 'agent-1',
    };

    store.addToolCall(toolCall);
    expect(useOrchestrationStore.getState().toolCallHistory).toHaveLength(1);
    expect(useOrchestrationStore.getState().toolCallHistory[0].id).toBe('tool-1');

    store.updateToolCall('tool-1', { status: 'success', result: { ok: true } });
    const updated = useOrchestrationStore.getState().toolCallHistory[0];
    expect(updated.status).toBe('success');
    expect(updated.result).toEqual({ ok: true });

    store.clearToolCallHistory();
    expect(useOrchestrationStore.getState().toolCallHistory).toHaveLength(0);
  });

  it('should manage workflows', () => {
    const store = useOrchestrationStore.getState();
    
    // Create Workflow
    const wId = store.createWorkflow('My Workflow', 'Testing workflow creation');
    expect(wId).toBeDefined();

    const stateAfterCreate = useOrchestrationStore.getState();
    expect(stateAfterCreate.workflows.has(wId)).toBe(true);
    expect(stateAfterCreate.activeWorkflow).toBe(wId);
    
    const workflow = stateAfterCreate.workflows.get(wId)!;
    expect(workflow.name).toBe('My Workflow');
    expect(workflow.description).toBe('Testing workflow creation');

    // Update Workflow
    store.updateWorkflow(wId, { name: 'Updated Workflow' });
    expect(useOrchestrationStore.getState().workflows.get(wId)!.name).toBe('Updated Workflow');

    // Remove Workflow
    store.deleteWorkflow(wId);
    expect(useOrchestrationStore.getState().workflows.has(wId)).toBe(false);
    expect(useOrchestrationStore.getState().activeWorkflow).toBeNull();
  });

  it('should manage UI panels toggle state', () => {
    const store = useOrchestrationStore.getState();
    
    store.togglePanel('agentOrchestration');
    expect(useOrchestrationStore.getState().panelsOpen.agentOrchestration).toBe(true);

    store.setPanelOpen('agentOrchestration', false);
    expect(useOrchestrationStore.getState().panelsOpen.agentOrchestration).toBe(false);
  });
});
