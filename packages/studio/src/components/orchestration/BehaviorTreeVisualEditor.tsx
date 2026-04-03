'use client';

/**
 * BehaviorTreeVisualEditor - Visual behavior tree designer
 *
 * Provides node-based editing for behavior trees.
 * Supports Sequence, Selector, Parallel, Action, Condition nodes.
 */

import { useCallback, useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  BackgroundVariant,
  type Connection,
  type NodeTypes,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { GitBranch, X, Save, Plus, BookTemplate, Undo, Redo } from 'lucide-react';
import { useOrchestrationStore } from '@/lib/orchestrationStore';
import type { BTNode, WorkflowEdge } from '@/lib/orchestrationStore';
import { TemplateBrowserPanel } from './TemplateBrowserPanel';
import {
  useOrchestrationHistory,
  useOrchestrationKeyboardShortcuts,
} from '@/hooks/useOrchestrationHistory';
import { logger } from '@/lib/logger';
import {
  trackBehaviorTreeNodeAdded,
  trackPanelOpened,
  trackPanelClosed,
  recordPanelOpenTime,
  getPanelDuration,
  trackUndoPerformed,
  trackRedoPerformed,
} from '@/lib/analytics/orchestration';

function SequenceNode({ data }: { data: any }) {
  return (
    <div className="rounded-xl border border-green-500 bg-studio-panel px-3 py-2 min-w-[120px]">
      <div className="text-[10px] font-bold text-green-400 mb-1">→ SEQUENCE</div>
      <div className="text-[11px] text-studio-text">{data.label}</div>
    </div>
  );
}

function ActionNode({ data }: { data: any }) {
  return (
    <div className="rounded-xl border border-yellow-500 bg-studio-panel px-3 py-2 min-w-[120px]">
      <div className="text-[10px] font-bold text-yellow-400 mb-1">⚡ ACTION</div>
      <div className="text-[11px] text-studio-text">{data.label}</div>
    </div>
  );
}

function InverterNode({ data }: { data: any }) {
  return (
    <div className="rounded-xl border-2 border-pink-500 bg-studio-panel px-3 py-2 min-w-[120px]">
      <div className="text-[10px] font-bold text-pink-400 mb-1">↻ INVERTER</div>
      <div className="text-[11px] text-studio-text">{data.label}</div>
    </div>
  );
}

function RepeatNode({ data }: { data: any }) {
  return (
    <div className="rounded-xl border-2 border-purple-500 bg-studio-panel px-3 py-2 min-w-[120px]">
      <div className="text-[10px] font-bold text-purple-400 mb-1">🔁 REPEAT</div>
      <div className="text-[11px] text-studio-text">{data.label}</div>
      {data.data?.maxRepeats && (
        <div className="text-[9px] text-studio-muted mt-1">Max: {data.data.maxRepeats}</div>
      )}
    </div>
  );
}

function RetryNode({ data }: { data: any }) {
  return (
    <div className="rounded-xl border-2 border-cyan-500 bg-studio-panel px-3 py-2 min-w-[120px]">
      <div className="text-[10px] font-bold text-cyan-400 mb-1">⟳ RETRY</div>
      <div className="text-[11px] text-studio-text">{data.label}</div>
      {data.data?.maxRetries && (
        <div className="text-[9px] text-studio-muted mt-1">Max: {data.data.maxRetries}</div>
      )}
    </div>
  );
}

function GuardNode({ data }: { data: any }) {
  return (
    <div className="rounded-xl border-2 border-orange-500 bg-studio-panel px-3 py-2 min-w-[120px]">
      <div className="text-[10px] font-bold text-orange-400 mb-1">🛡️ GUARD</div>
      <div className="text-[11px] text-studio-text">{data.label}</div>
      {data.data?.condition && (
        <div className="text-[9px] text-studio-muted mt-1 truncate max-w-[100px]">
          {data.data.condition}
        </div>
      )}
    </div>
  );
}

function TimeoutNode({ data }: { data: any }) {
  return (
    <div className="rounded-xl border-2 border-red-500 bg-studio-panel px-3 py-2 min-w-[120px]">
      <div className="text-[10px] font-bold text-red-400 mb-1">⏱️ TIMEOUT</div>
      <div className="text-[11px] text-studio-text">{data.label}</div>
      {data.data?.timeoutMs && (
        <div className="text-[9px] text-studio-muted mt-1">{data.data.timeoutMs}ms</div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  sequence: SequenceNode,
  action: ActionNode,
  inverter: InverterNode,
  repeat: RepeatNode,
  retry: RetryNode,
  guard: GuardNode,
  timeout: TimeoutNode,
};

interface BehaviorTreeVisualEditorProps {
  treeId: string;
  onClose: () => void;
}

export function BehaviorTreeVisualEditor({ treeId, onClose }: BehaviorTreeVisualEditorProps) {
  const tree = useOrchestrationStore((s) => s.behaviorTrees.get(treeId));
  const addBTNode = useOrchestrationStore((s) => s.addBTNode);
  const addBTEdge = useOrchestrationStore((s) => s.addBTEdge);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    tree?.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n })) || []
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(tree?.edges || []);
  const [showTemplateBrowser, setShowTemplateBrowser] = useState(false);

  // Undo/Redo history
  const history = useOrchestrationHistory(
    () => ({ nodes, edges }),
    (snapshot) => {
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
    },
    { debounceMs: 500 }
  );

  // Keyboard shortcuts
  useOrchestrationKeyboardShortcuts({
    onUndo: history.undo,
    onRedo: history.redo,
    enabled: true,
  });

  // Push snapshot when nodes or edges change
  useEffect(() => {
    history.pushSnapshot({ nodes, edges });
  }, [nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  // Track panel open/close
  useEffect(() => {
    recordPanelOpenTime('behavior_tree_editor');
    trackPanelOpened('behavior_tree_editor');

    return () => {
      const duration = getPanelDuration('behavior_tree_editor');
      trackPanelClosed('behavior_tree_editor', duration);
    };
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge = { ...connection, id: `edge_${Date.now()}`, type: 'smoothstep' };
      setEdges((eds) => addEdge(edge, eds));
      if (tree) {
        addBTEdge(treeId, edge as unknown as WorkflowEdge);
      }
    },
    [setEdges, tree, addBTEdge, treeId]
  );

  const handleAddSequence = () => {
    const node: BTNode = {
      id: `seq_${Date.now()}`,
      type: 'sequence',
      label: 'Sequence',
      position: { x: 100, y: 100 },
      data: {},
    };
    setNodes((ns) => [
      ...ns,
      { id: node.id, type: node.type, position: node.position, data: node },
    ]);
    addBTNode(treeId, node);
    trackBehaviorTreeNodeAdded(treeId, 'sequence');
  };

  const handleAddInverter = () => {
    const node: BTNode = {
      id: `inv_${Date.now()}`,
      type: 'inverter',
      label: 'Inverter',
      position: { x: 200, y: 100 },
      data: {},
    };
    setNodes((ns) => [
      ...ns,
      { id: node.id, type: node.type, position: node.position, data: node },
    ]);
    addBTNode(treeId, node);
    trackBehaviorTreeNodeAdded(treeId, 'inverter');
  };

  const handleAddRepeat = () => {
    const node: BTNode = {
      id: `rep_${Date.now()}`,
      type: 'repeat',
      label: 'Repeat N',
      position: { x: 300, y: 100 },
      data: { maxRepeats: 3 },
    };
    setNodes((ns) => [
      ...ns,
      { id: node.id, type: node.type, position: node.position, data: node },
    ]);
    addBTNode(treeId, node);
    trackBehaviorTreeNodeAdded(treeId, 'repeat');
  };

  const handleAddRetry = () => {
    const node: BTNode = {
      id: `ret_${Date.now()}`,
      type: 'retry',
      label: 'Retry',
      position: { x: 400, y: 100 },
      data: { maxRetries: 3 },
    };
    setNodes((ns) => [
      ...ns,
      { id: node.id, type: node.type, position: node.position, data: node },
    ]);
    addBTNode(treeId, node);
    trackBehaviorTreeNodeAdded(treeId, 'retry');
  };

  const handleAddGuard = () => {
    const node: BTNode = {
      id: `grd_${Date.now()}`,
      type: 'guard',
      label: 'Guard',
      position: { x: 500, y: 100 },
      data: { condition: 'true' },
    };
    setNodes((ns) => [
      ...ns,
      { id: node.id, type: node.type, position: node.position, data: node },
    ]);
    addBTNode(treeId, node);
    trackBehaviorTreeNodeAdded(treeId, 'guard');
  };

  const handleAddTimeout = () => {
    const node: BTNode = {
      id: `tim_${Date.now()}`,
      type: 'timeout',
      label: 'Timeout',
      position: { x: 600, y: 100 },
      data: { timeoutMs: 5000 },
    };
    setNodes((ns) => [
      ...ns,
      { id: node.id, type: node.type, position: node.position, data: node },
    ]);
    addBTNode(treeId, node);
    trackBehaviorTreeNodeAdded(treeId, 'timeout');
  };

  if (!tree) {
    return (
      <div className="flex h-full items-center justify-center text-studio-muted">
        Tree not found
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-studio-panel">
      {/* Template Browser */}
      {showTemplateBrowser && (
        <TemplateBrowserPanel
          onClose={() => setShowTemplateBrowser(false)}
          onLoadTemplate={(templateId, type) => {
            logger.debug(`[BehaviorTreeEditor] Loaded template: ${templateId} (${type})`);
            setShowTemplateBrowser(false);
          }}
        />
      )}

      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <GitBranch className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Behavior Tree</span>
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => setShowTemplateBrowser(true)}
            className="rounded bg-studio-accent/20 px-2 py-1 text-[9px] text-studio-accent hover:bg-studio-accent/30"
            title="Browse Templates"
          >
            <BookTemplate className="inline h-3 w-3 mr-0.5" />
            Templates
          </button>
          <button
            onClick={handleAddSequence}
            className="rounded bg-green-500/20 px-2 py-1 text-[9px] text-green-400 hover:bg-green-500/30"
            title="Add Sequence Node"
          >
            <Plus className="inline h-3 w-3 mr-1" />
            Sequence
          </button>
          <button
            onClick={handleAddInverter}
            className="rounded bg-pink-500/20 px-2 py-1 text-[9px] text-pink-400 hover:bg-pink-500/30"
            title="Inverts child result"
          >
            Inverter
          </button>
          <button
            onClick={handleAddRepeat}
            className="rounded bg-purple-500/20 px-2 py-1 text-[9px] text-purple-400 hover:bg-purple-500/30"
            title="Repeat child N times"
          >
            Repeat N
          </button>
          <button
            onClick={handleAddRetry}
            className="rounded bg-cyan-500/20 px-2 py-1 text-[9px] text-cyan-400 hover:bg-cyan-500/30"
            title="Retry on failure"
          >
            Retry
          </button>
          <button
            onClick={handleAddGuard}
            className="rounded bg-orange-500/20 px-2 py-1 text-[9px] text-orange-400 hover:bg-orange-500/30"
            title="Conditional execution"
          >
            Guard
          </button>
          <button
            onClick={handleAddTimeout}
            className="rounded bg-red-500/20 px-2 py-1 text-[9px] text-red-400 hover:bg-red-500/30"
            title="Time-limited execution"
          >
            Timeout
          </button>
        </div>
        <button
          onClick={() => {
            history.undo();
            trackUndoPerformed('behavior_tree_editor', history.currentIndex);
          }}
          disabled={!history.canUndo}
          className="rounded bg-studio-surface px-2 py-1 text-[9px] hover:bg-studio-border disabled:opacity-30 disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
        >
          <Undo className="inline h-3 w-3" />
        </button>
        <button
          onClick={() => {
            history.redo();
            trackRedoPerformed('behavior_tree_editor', history.currentIndex);
          }}
          disabled={!history.canRedo}
          className="rounded bg-studio-surface px-2 py-1 text-[9px] hover:bg-studio-border disabled:opacity-30 disabled:cursor-not-allowed"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo className="inline h-3 w-3" />
        </button>
        <button onClick={onClose} className="rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background color="#1e1e2e" variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls className="!bg-studio-panel !border-studio-border" />
          <MiniMap nodeColor="#22c55e" maskColor="rgba(10,10,18,0.8)" />
        </ReactFlow>
      </div>
    </div>
  );
}
