'use client';

/**
 * AgentOrchestrationGraphEditor - Visual node graph for wiring AI agents
 *
 * Extends NodeGraphEditor patterns for AI agent workflows.
 * Supports AgentNode, ToolNode, DecisionNode, ParallelNode, SequentialNode.
 */

import { useCallback, useState, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  addEdge,
  BackgroundVariant,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Play,
  Save,
  Workflow,
  X,
  GitBranch,
  Repeat,
  Layers,
  GitMerge,
  BookTemplate,
  Undo,
  Redo,
  History,
} from 'lucide-react';
import { useOrchestrationStore } from '@/lib/orchestrationStore';
import type {
  WorkflowNode,
  AgentNodeData,
  ToolNodeData,
  DecisionNodeData,
  LoopNodeData,
  ParallelNodeData,
  MergeNodeData,
} from '@/lib/orchestrationStore';
import { TemplateBrowserPanel } from './TemplateBrowserPanel';
import {
  useOrchestrationHistory,
  useOrchestrationKeyboardShortcuts,
} from '@/hooks/useOrchestrationHistory';
import {
  trackWorkflowNodeAdded,
  trackWorkflowSaved,
  trackPanelOpened,
  trackPanelClosed,
  recordPanelOpenTime,
  getPanelDuration,
  trackUndoPerformed,
  trackRedoPerformed,
} from '@/lib/analytics/orchestration';
import { CollaborationToolbar } from '@/components/collaboration/CollaborationToolbar';
import { UserCursors } from '@/components/collaboration/UserCursor';
import { usePresence } from '@/hooks/usePresence';
import type { User } from '@/lib/collaboration/types';
import { VersionControlPanel } from '@/components/versionControl/VersionControlPanel';

// Node component for Agent nodes
function AgentNode({ data }: { data: AgentNodeData }) {
  return (
    <div className="rounded-xl border border-blue-500 bg-studio-panel px-3 py-2 min-w-[140px]">
      <div className="text-[10px] font-bold text-blue-400 mb-1">🤖 AGENT</div>
      <div className="text-[11px] text-studio-text font-semibold">{data.agentId}</div>
      <div className="text-[9px] text-studio-muted mt-1">Tools: {data.tools.length}</div>
    </div>
  );
}

// Node component for Tool nodes
function ToolNode({ data }: { data: ToolNodeData }) {
  return (
    <div className="rounded-xl border border-purple-500 bg-studio-panel px-3 py-2 min-w-[140px]">
      <div className="text-[10px] font-bold text-purple-400 mb-1">🔧 TOOL</div>
      <div className="text-[11px] text-studio-text font-semibold">{data.toolName}</div>
      <div className="text-[9px] text-studio-muted mt-1">{data.server}</div>
    </div>
  );
}

// Node component for Decision nodes
function DecisionNode({ data }: { data: DecisionNodeData }) {
  return (
    <div className="rounded-xl border border-amber-500 bg-studio-panel px-3 py-2 min-w-[140px]">
      <div className="flex items-center gap-1 mb-1">
        <GitBranch className="h-3 w-3 text-amber-400" />
        <div className="text-[10px] font-bold text-amber-400">DECISION</div>
      </div>
      <div className="text-[11px] text-studio-text font-semibold">If/Else</div>
      {data.condition && (
        <div className="text-[9px] text-studio-muted mt-1 truncate max-w-[120px]">
          {data.condition}
        </div>
      )}
    </div>
  );
}

// Node component for Loop nodes
function LoopNode({ data }: { data: LoopNodeData }) {
  return (
    <div className="rounded-xl border border-indigo-500 bg-studio-panel px-3 py-2 min-w-[140px]">
      <div className="flex items-center gap-1 mb-1">
        <Repeat className="h-3 w-3 text-indigo-400" />
        <div className="text-[10px] font-bold text-indigo-400">LOOP</div>
      </div>
      <div className="text-[11px] text-studio-text font-semibold">For Each</div>
      {data.iterableSource && (
        <div className="text-[9px] text-studio-muted mt-1 truncate max-w-[120px]">
          {data.itemVariable} in {data.iterableSource}
        </div>
      )}
    </div>
  );
}

// Node component for Parallel nodes
function ParallelNode({ data }: { data: ParallelNodeData }) {
  return (
    <div className="rounded-xl border border-emerald-500 bg-studio-panel px-3 py-2 min-w-[140px]">
      <div className="flex items-center gap-1 mb-1">
        <Layers className="h-3 w-3 text-emerald-400" />
        <div className="text-[10px] font-bold text-emerald-400">PARALLEL</div>
      </div>
      <div className="text-[11px] text-studio-text font-semibold">Concurrent</div>
      <div className="text-[9px] text-studio-muted mt-1">
        {data.policy === 'require-all' ? 'Wait All' : 'First One'}
      </div>
    </div>
  );
}

// Node component for Merge nodes
function MergeNode({ data }: { data: MergeNodeData }) {
  return (
    <div className="rounded-xl border border-teal-500 bg-studio-panel px-3 py-2 min-w-[140px]">
      <div className="flex items-center gap-1 mb-1">
        <GitMerge className="h-3 w-3 text-teal-400" />
        <div className="text-[10px] font-bold text-teal-400">MERGE</div>
      </div>
      <div className="text-[11px] text-studio-text font-semibold">Join Inputs</div>
      <div className="text-[9px] text-studio-muted mt-1">
        {data.waitForAll ? 'Wait All' : 'First Input'}
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
  decision: DecisionNode,
  loop: LoopNode,
  parallel: ParallelNode,
  merge: MergeNode,
};

interface AgentOrchestrationGraphEditorProps {
  workflowId: string;
  onClose: () => void;
}

export function AgentOrchestrationGraphEditor({
  workflowId,
  onClose,
}: AgentOrchestrationGraphEditorProps) {
  const workflow = useOrchestrationStore((s) => s.workflows.get(workflowId));
  const updateWorkflow = useOrchestrationStore((s) => s.updateWorkflow);
  const addWorkflowNode = useOrchestrationStore((s) => s.addWorkflowNode);
  const addWorkflowEdge = useOrchestrationStore((s) => s.addWorkflowEdge);

  const [nodes, setNodes, onNodesChange] = useNodesState(
    workflow?.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data })) ||
      []
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(workflow?.edges || []);
  const [showTemplateBrowser, setShowTemplateBrowser] = useState(false);
  const [showVersionControl, setShowVersionControl] = useState(false);

  // Mock current user (in production, this would come from auth)
  const currentUser: User = {
    id: `user_${Date.now()}`,
    name: 'You',
    email: 'user@example.com',
    color: '#3b82f6', // blue-500
  };

  // Get presence for user cursors
  const { users: remoteUsers } = usePresence();

  // Undo/Redo history
  const history = useOrchestrationHistory(
    () => ({ nodes, edges }),
    (snapshot) => {
      setNodes(snapshot.nodes);
      setEdges(snapshot.edges);
    },
    { debounceMs: 500 } // Debounce to avoid excessive snapshots while dragging
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
    recordPanelOpenTime('workflow_editor');
    trackPanelOpened('workflow_editor');

    return () => {
      const duration = getPanelDuration('workflow_editor');
      trackPanelClosed('workflow_editor', duration);
    };
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      const edge = { ...connection, id: `edge_${Date.now()}`, animated: true };
      setEdges((eds) => addEdge(edge, eds));
      if (workflow) {
        addWorkflowEdge(workflow.id, edge as any);
      }
    },
    [setEdges, workflow, addWorkflowEdge]
  );

  const handleAddAgent = () => {
    const node: WorkflowNode = {
      id: `agent_${Date.now()}`,
      type: 'agent',
      label: 'Brittney',
      position: { x: 100, y: 100 },
      data: {
        type: 'agent',
        agentId: 'brittney',
        systemPrompt: 'You are a helpful AI assistant.',
        temperature: 0.7,
        tools: [],
        maxTokens: 2048,
      },
    };
    setNodes((ns) => [
      ...ns,
      { id: node.id, type: node.type, position: node.position, data: node.data },
    ]);
    if (workflow) {
      addWorkflowNode(workflow.id, node);
      trackWorkflowNodeAdded(workflow.id, 'agent');
    }
  };

  const handleAddDecision = () => {
    const node: WorkflowNode = {
      id: `decision_${Date.now()}`,
      type: 'decision',
      label: 'Decision',
      position: { x: 200, y: 100 },
      data: {
        type: 'decision',
        condition: 'result.success === true',
        trueOutput: '',
        falseOutput: '',
      },
    };
    setNodes((ns) => [
      ...ns,
      { id: node.id, type: node.type, position: node.position, data: node.data },
    ]);
    if (workflow) {
      addWorkflowNode(workflow.id, node);
      trackWorkflowNodeAdded(workflow.id, 'decision');
    }
  };

  const handleAddLoop = () => {
    const node: WorkflowNode = {
      id: `loop_${Date.now()}`,
      type: 'loop',
      label: 'Loop',
      position: { x: 300, y: 100 },
      data: {
        type: 'loop',
        iterableSource: 'items',
        itemVariable: 'item',
        maxIterations: 100,
      },
    };
    setNodes((ns) => [
      ...ns,
      { id: node.id, type: node.type, position: node.position, data: node.data },
    ]);
    if (workflow) {
      addWorkflowNode(workflow.id, node);
      trackWorkflowNodeAdded(workflow.id, 'loop');
    }
  };

  const handleAddParallel = () => {
    const node: WorkflowNode = {
      id: `parallel_${Date.now()}`,
      type: 'parallel',
      label: 'Parallel',
      position: { x: 400, y: 100 },
      data: {
        type: 'parallel',
        policy: 'require-all',
        timeout: 30000,
      },
    };
    setNodes((ns) => [
      ...ns,
      { id: node.id, type: node.type, position: node.position, data: node.data },
    ]);
    if (workflow) {
      addWorkflowNode(workflow.id, node);
      trackWorkflowNodeAdded(workflow.id, 'parallel');
    }
  };

  const handleAddMerge = () => {
    const node: WorkflowNode = {
      id: `merge_${Date.now()}`,
      type: 'merge',
      label: 'Merge',
      position: { x: 500, y: 100 },
      data: {
        type: 'merge',
        waitForAll: true,
        timeout: 30000,
      },
    };
    setNodes((ns) => [
      ...ns,
      { id: node.id, type: node.type, position: node.position, data: node.data },
    ]);
    if (workflow) {
      addWorkflowNode(workflow.id, node);
      trackWorkflowNodeAdded(workflow.id, 'merge');
    }
  };

  const handleSave = () => {
    if (workflow) {
      updateWorkflow(workflow.id, { nodes: nodes as any, edges: edges as any });
      trackWorkflowSaved(workflow.id, nodes.length, edges.length);
    }
  };

  const handleRevertWorkflow = (revertedWorkflow: any) => {
    // Update nodes and edges from reverted workflow
    setNodes(
      revertedWorkflow.nodes.map((n: any) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: n.data,
      }))
    );
    setEdges(revertedWorkflow.edges);

    // Update workflow in store
    if (workflow) {
      updateWorkflow(workflow.id, {
        nodes: revertedWorkflow.nodes,
        edges: revertedWorkflow.edges,
        metadata: revertedWorkflow.metadata,
      });
    }
  };

  if (!workflow) {
    return (
      <div className="flex h-full items-center justify-center text-studio-muted">
        Workflow not found
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
            console.log(`[WorkflowEditor] Loaded template: ${templateId} (${type})`);
            setShowTemplateBrowser(false);
          }}
        />
      )}

      {/* Version Control */}
      {showVersionControl && (
        <VersionControlPanel
          workflow={workflow}
          onClose={() => setShowVersionControl(false)}
          onRevert={handleRevertWorkflow}
        />
      )}

      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5 overflow-x-auto">
        <Workflow className="h-4 w-4 text-studio-accent flex-shrink-0" />
        <span className="text-[12px] font-semibold flex-shrink-0">{workflow.name}</span>

        {/* Collaboration toolbar */}
        <div className="ml-2 flex-shrink-0">
          <CollaborationToolbar workflowId={workflowId} currentUser={currentUser} />
        </div>

        <div className="ml-auto flex gap-1 flex-shrink-0">
          <button
            onClick={() => setShowTemplateBrowser(true)}
            className="rounded bg-studio-accent/20 px-2 py-1 text-[9px] text-studio-accent hover:bg-studio-accent/30"
            title="Browse Templates"
          >
            <BookTemplate className="inline h-3 w-3 mr-0.5" />
            Templates
          </button>
          <button
            onClick={handleAddAgent}
            className="rounded bg-blue-500/20 px-2 py-1 text-[9px] text-blue-400 hover:bg-blue-500/30"
            title="Add Agent Node"
          >
            + Agent
          </button>
          <button
            onClick={handleAddDecision}
            className="rounded bg-amber-500/20 px-2 py-1 text-[9px] text-amber-400 hover:bg-amber-500/30"
            title="If/else branching"
          >
            <GitBranch className="inline h-3 w-3 mr-0.5" />
            Decision
          </button>
          <button
            onClick={handleAddLoop}
            className="rounded bg-indigo-500/20 px-2 py-1 text-[9px] text-indigo-400 hover:bg-indigo-500/30"
            title="For-each iteration"
          >
            <Repeat className="inline h-3 w-3 mr-0.5" />
            Loop
          </button>
          <button
            onClick={handleAddParallel}
            className="rounded bg-emerald-500/20 px-2 py-1 text-[9px] text-emerald-400 hover:bg-emerald-500/30"
            title="Concurrent execution"
          >
            <Layers className="inline h-3 w-3 mr-0.5" />
            Parallel
          </button>
          <button
            onClick={handleAddMerge}
            className="rounded bg-teal-500/20 px-2 py-1 text-[9px] text-teal-400 hover:bg-teal-500/30"
            title="Wait for all inputs"
          >
            <GitMerge className="inline h-3 w-3 mr-0.5" />
            Merge
          </button>
        </div>
        <button
          onClick={() => {
            history.undo();
            trackUndoPerformed('workflow_editor', history.currentIndex);
          }}
          disabled={!history.canUndo}
          className="rounded bg-studio-surface px-2 py-1 text-[9px] hover:bg-studio-border disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          title="Undo (Ctrl+Z)"
        >
          <Undo className="inline h-3 w-3" />
        </button>
        <button
          onClick={() => {
            history.redo();
            trackRedoPerformed('workflow_editor', history.currentIndex);
          }}
          disabled={!history.canRedo}
          className="rounded bg-studio-surface px-2 py-1 text-[9px] hover:bg-studio-border disabled:opacity-30 disabled:cursor-not-allowed flex-shrink-0"
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo className="inline h-3 w-3" />
        </button>
        <button
          onClick={handleSave}
          className="rounded bg-studio-accent px-2 py-1 text-[9px] text-white hover:opacity-90 flex-shrink-0"
        >
          <Save className="inline h-3 w-3 mr-1" />
          Save
        </button>
        <button
          onClick={() => setShowVersionControl(!showVersionControl)}
          className={`rounded px-2 py-1 text-[9px] flex-shrink-0 ${
            showVersionControl
              ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-studio-surface text-studio-muted hover:bg-studio-border'
          }`}
          title="Version Control"
        >
          <History className="inline h-3 w-3 mr-1" />
          Versions
        </button>
        <button
          onClick={onClose}
          className="rounded p-1 text-studio-muted hover:text-studio-text flex-shrink-0"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* React Flow Canvas */}
      <div className="flex-1 relative">
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
          <Controls className="!bg-studio-panel !border-studio-border !text-studio-text" />
          <MiniMap nodeColor="#6366f1" maskColor="rgba(10,10,18,0.8)" />
        </ReactFlow>

        {/* Remote user cursors overlay */}
        <UserCursors users={remoteUsers} />
      </div>
    </div>
  );
}
