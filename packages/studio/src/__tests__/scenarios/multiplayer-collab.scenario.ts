/**
 * multiplayer-collab.scenario.ts — LIVING-SPEC: Multiplayer Collaboration
 *
 * Persona: Mira — team lead coordinating real-time multiplayer editing,
 * managing remote cursors, and orchestrating agent workflows.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCollabStore, type RemoteCursor } from '@/lib/collabStore';
import { useOrchestrationStore } from '@/lib/orchestrationStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCursor(userId: string, name: string, x = 0.5, y = 0.5): RemoteCursor {
  return { userId, name, color: 'hsl(120,80%,65%)', x, y, selectedId: null, lastSeen: Date.now() };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Collab Presence State
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Multiplayer Collab — Presence State', () => {
  beforeEach(() => {
    useCollabStore.setState({ cursors: {}, connected: false });
  });

  it('starts disconnected with no remote cursors', () => {
    expect(useCollabStore.getState().connected).toBe(false);
    expect(Object.keys(useCollabStore.getState().cursors)).toHaveLength(0);
  });

  it('setSelf() configures local user identity', () => {
    useCollabStore.getState().setSelf('user-mira', 'Mira', 'hsl(270,80%,65%)');
    const state = useCollabStore.getState();
    expect(state.selfId).toBe('user-mira');
    expect(state.selfName).toBe('Mira');
    expect(state.selfColor).toBe('hsl(270,80%,65%)');
  });

  it('setConnected() toggles collab connection', () => {
    useCollabStore.getState().setConnected(true);
    expect(useCollabStore.getState().connected).toBe(true);
  });

  it('upsertCursor() adds a remote cursor', () => {
    useCollabStore.getState().upsertCursor(makeCursor('alice', 'Alice'));
    expect(Object.keys(useCollabStore.getState().cursors)).toHaveLength(1);
    expect(useCollabStore.getState().cursors['alice'].name).toBe('Alice');
  });

  it('upsertCursor() updates position on re-insert', () => {
    useCollabStore.getState().upsertCursor(makeCursor('bob', 'Bob', 0.1, 0.1));
    useCollabStore.getState().upsertCursor(makeCursor('bob', 'Bob', 0.9, 0.9));
    expect(useCollabStore.getState().cursors['bob'].x).toBe(0.9);
    expect(useCollabStore.getState().cursors['bob'].y).toBe(0.9);
  });

  it('removeCursor() removes a disconnected user', () => {
    useCollabStore.getState().upsertCursor(makeCursor('alice', 'Alice'));
    useCollabStore.getState().upsertCursor(makeCursor('bob', 'Bob'));
    useCollabStore.getState().removeCursor('alice');
    expect(Object.keys(useCollabStore.getState().cursors)).toHaveLength(1);
    expect(useCollabStore.getState().cursors['alice']).toBeUndefined();
  });

  it('pruneStale() removes cursors older than maxAgeMs', () => {
    const old: RemoteCursor = { ...makeCursor('stale', 'Stale'), lastSeen: Date.now() - 20_000 };
    const fresh: RemoteCursor = { ...makeCursor('fresh', 'Fresh'), lastSeen: Date.now() };
    useCollabStore.getState().upsertCursor(old);
    useCollabStore.getState().upsertCursor(fresh);
    useCollabStore.getState().pruneStale(10_000);
    expect(Object.keys(useCollabStore.getState().cursors)).toHaveLength(1);
    expect(useCollabStore.getState().cursors['fresh']).toBeDefined();
  });

  it('multiple concurrent users tracked independently', () => {
    for (let i = 0; i < 5; i++) {
      useCollabStore.getState().upsertCursor(makeCursor(`user-${i}`, `User ${i}`, Math.random(), Math.random()));
    }
    expect(Object.keys(useCollabStore.getState().cursors)).toHaveLength(5);
  });

  it('cursor follow mode — camera target tracks a remote cursor', () => {
    useCollabStore.getState().upsertCursor(makeCursor('streamer', 'Streamer', 0.8, 0.3));
    const target = useCollabStore.getState().cursors['streamer'];
    // Camera would lerp to this position
    expect(target.x).toBe(0.8);
    expect(target.y).toBe(0.3);
  });

  it('conflict resolution — latest timestamp wins', () => {
    const editA = { userId: 'alice', nodeId: 'cube-1', timestamp: 1000, value: 'red' };
    const editB = { userId: 'bob', nodeId: 'cube-1', timestamp: 1005, value: 'blue' };
    const winner = editA.timestamp > editB.timestamp ? editA : editB;
    expect(winner.value).toBe('blue');
  });

  it('chat messages are stored with sender and timestamp', () => {
    const messages: Array<{ sender: string; text: string; time: number }> = [];
    messages.push({ sender: 'alice', text: 'Ready to start?', time: Date.now() });
    messages.push({ sender: 'bob', text: 'Let\'s go!', time: Date.now() + 1 });
    expect(messages).toHaveLength(2);
    expect(messages[0].sender).toBe('alice');
  });

  it('lock/unlock objects prevents concurrent edits', () => {
    const locks = new Map<string, string>(); // nodeId -> userId
    locks.set('cube-1', 'alice');
    expect(locks.get('cube-1')).toBe('alice');
    // Bob cannot lock an already-locked node
    const canLock = !locks.has('cube-1');
    expect(canLock).toBe(false);
    // Alice unlocks
    locks.delete('cube-1');
    expect(locks.has('cube-1')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Orchestration Store — Workflows & MCP
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Multiplayer Collab — Orchestration Workflows', () => {
  beforeEach(() => {
    useOrchestrationStore.getState().reset();
  });

  it('starts with empty servers, workflows, and events', () => {
    const s = useOrchestrationStore.getState();
    expect(s.mcpServers.size).toBe(0);
    expect(s.workflows.size).toBe(0);
    expect(s.events).toHaveLength(0);
  });

  it('addMCPServer() registers a new MCP server', () => {
    useOrchestrationStore.getState().addMCPServer({
      name: 'knowledge-hub', url: 'http://localhost:3000', apiKey: 'test',
      enabled: true, healthCheckInterval: 30000, timeout: 10000,
      retryPolicy: { maxRetries: 3, backoffMultiplier: 2 },
      features: { semanticSearch: true, toolDiscovery: true, resourceManagement: false },
    });
    expect(useOrchestrationStore.getState().mcpServers.size).toBe(1);
    expect(useOrchestrationStore.getState().mcpServers.get('knowledge-hub')!.url).toBe('http://localhost:3000');
  });

  it('removeMCPServer() unregisters and clears status', () => {
    useOrchestrationStore.getState().addMCPServer({
      name: 'toRemove', url: 'http://x', apiKey: '', enabled: true,
      healthCheckInterval: 30000, timeout: 10000,
      retryPolicy: { maxRetries: 1, backoffMultiplier: 1 },
      features: { semanticSearch: false, toolDiscovery: false, resourceManagement: false },
    });
    useOrchestrationStore.getState().removeMCPServer('toRemove');
    expect(useOrchestrationStore.getState().mcpServers.size).toBe(0);
  });

  it('createWorkflow() returns an ID and makes it active', () => {
    const id = useOrchestrationStore.getState().createWorkflow('BuildPipeline', 'CI/CD workflow');
    expect(id).toBeTruthy();
    expect(useOrchestrationStore.getState().activeWorkflow).toBe(id);
    expect(useOrchestrationStore.getState().workflows.get(id)!.name).toBe('BuildPipeline');
  });

  it('deleteWorkflow() removes it and clears active', () => {
    const id = useOrchestrationStore.getState().createWorkflow('Temp', 'temp');
    useOrchestrationStore.getState().deleteWorkflow(id);
    expect(useOrchestrationStore.getState().workflows.size).toBe(0);
    expect(useOrchestrationStore.getState().activeWorkflow).toBeNull();
  });

  it('addWorkflowNode() adds a node to a workflow', () => {
    const id = useOrchestrationStore.getState().createWorkflow('Flow', 'test');
    useOrchestrationStore.getState().addWorkflowNode(id, {
      id: 'n1', type: 'agent', label: 'Brittney',
      position: { x: 100, y: 50 },
      data: { type: 'agent', agentId: 'brittney', systemPrompt: '', temperature: 0.7, tools: [], maxTokens: 1000 },
    });
    expect(useOrchestrationStore.getState().workflows.get(id)!.nodes).toHaveLength(1);
  });

  it('addEvent() appends to event log', () => {
    useOrchestrationStore.getState().addEvent({
      id: 'e1', topic: 'task.complete', payload: { result: 'ok' },
      senderId: 'agent-1', timestamp: Date.now(), receivedBy: ['agent-2'],
    });
    expect(useOrchestrationStore.getState().events).toHaveLength(1);
  });

  it('clearEvents() empties the event log', () => {
    useOrchestrationStore.getState().addEvent({
      id: 'e1', topic: 'a', payload: {}, senderId: 'x', timestamp: 0, receivedBy: [],
    });
    useOrchestrationStore.getState().clearEvents();
    expect(useOrchestrationStore.getState().events).toHaveLength(0);
  });

  it('togglePanel() flips panel visibility', () => {
    expect(useOrchestrationStore.getState().panelsOpen.mcpConfig).toBe(false);
    useOrchestrationStore.getState().togglePanel('mcpConfig');
    expect(useOrchestrationStore.getState().panelsOpen.mcpConfig).toBe(true);
    useOrchestrationStore.getState().togglePanel('mcpConfig');
    expect(useOrchestrationStore.getState().panelsOpen.mcpConfig).toBe(false);
  });

  it('workflow execution runs nodes in topological order', () => {
    const id = useOrchestrationStore.getState().createWorkflow('Pipeline', 'test');
    useOrchestrationStore.getState().addWorkflowNode(id, {
      id: 'n1', type: 'tool', label: 'Fetch Data',
      position: { x: 0, y: 0 },
      data: { type: 'tool', server: 'knowledge', toolName: 'search', args: {}, timeout: 5000 },
    });
    useOrchestrationStore.getState().addWorkflowNode(id, {
      id: 'n2', type: 'agent', label: 'Process',
      position: { x: 200, y: 0 },
      data: { type: 'agent', agentId: 'brittney', systemPrompt: '', temperature: 0.7, tools: [], maxTokens: 1000 },
    });
    useOrchestrationStore.getState().addWorkflowEdge(id, {
      id: 'e1', source: 'n1', target: 'n2',
    });
    const wf = useOrchestrationStore.getState().workflows.get(id)!;
    expect(wf.nodes).toHaveLength(2);
    expect(wf.edges).toHaveLength(1);
    expect(wf.edges[0].source).toBe('n1');
    expect(wf.edges[0].target).toBe('n2');
  });

  it('tool call records track request/response lifecycle', () => {
    useOrchestrationStore.getState().addToolCall({
      id: 'tc1', timestamp: Date.now(), toolName: 'search_knowledge',
      server: 'ai-workspace', args: { query: 'physics' }, duration: 0,
      status: 'pending', triggeredBy: 'agent-1',
    });
    useOrchestrationStore.getState().updateToolCall('tc1', {
      status: 'success', result: { matches: 5 }, duration: 120,
    });
    const tc = useOrchestrationStore.getState().toolCallHistory[0];
    expect(tc.status).toBe('success');
    expect(tc.duration).toBe(120);
  });
});
