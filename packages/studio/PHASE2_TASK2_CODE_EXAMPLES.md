# Phase 2 Task 2: Code Examples

## Behavior Tree Decorator Nodes

### Example: RepeatNode Component

```typescript
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
```

### Example: Creating a Retry Node

```typescript
const handleAddRetry = () => {
  const node: BTNode = {
    id: `ret_${Date.now()}`,
    type: 'retry',
    label: 'Retry',
    position: { x: 400, y: 100 },
    data: { maxRetries: 3 },
  };
  setNodes((ns) => [...ns, { id: node.id, type: node.type, position: node.position, data: node }]);
  addBTNode(treeId, node);
};
```

### Example: Toolbar Button

```typescript
<button
  onClick={handleAddTimeout}
  className="rounded bg-red-500/20 px-2 py-1 text-[9px] text-red-400 hover:bg-red-500/30"
  title="Time-limited execution"
>
  Timeout
</button>
```

## Workflow Control Nodes

### Example: DecisionNode Component

```typescript
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
```

### Example: Creating a Loop Node

```typescript
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
  }
};
```

### Example: Toolbar with Icons

```typescript
<button
  onClick={handleAddParallel}
  className="rounded bg-emerald-500/20 px-2 py-1 text-[9px] text-emerald-400 hover:bg-emerald-500/30"
  title="Concurrent execution"
>
  <Layers className="inline h-3 w-3 mr-0.5" />
  Parallel
</button>
```

## TypeScript Type Definitions

### Extended BTNodeType

```typescript
export type BTNodeType =
  | 'sequence'
  | 'selector'
  | 'parallel'
  | 'action'
  | 'condition'
  | 'inverter' // NEW
  | 'repeat' // NEW
  | 'retry' // NEW
  | 'guard' // NEW
  | 'timeout'; // NEW
```

### Extended WorkflowNodeType

```typescript
export type WorkflowNodeType =
  | 'agent'
  | 'tool'
  | 'decision'
  | 'parallel'
  | 'sequential'
  | 'loop' // NEW
  | 'merge'; // NEW
```

### New Data Interfaces

```typescript
export interface LoopNodeData {
  type: 'loop';
  iterableSource: string; // Variable name or expression
  itemVariable: string; // Loop variable name
  maxIterations?: number;
}

export interface MergeNodeData {
  type: 'merge';
  waitForAll: boolean; // true = wait for all inputs
  timeout?: number;
}

export interface BTNodeData {
  // Composite nodes
  policy?: 'require-all' | 'require-one';

  // Decorator nodes
  maxRepeats?: number; // For repeat
  maxRetries?: number; // For retry (NEW)
  condition?: string; // For guard
  timeoutMs?: number; // For timeout (NEW)

  // Leaf nodes
  actionCode?: string;
  conditionCode?: string;
}
```

## Node Type Registry Updates

### Behavior Tree

```typescript
const nodeTypes: NodeTypes = {
  sequence: SequenceNode,
  action: ActionNode,
  inverter: InverterNode, // NEW
  repeat: RepeatNode, // NEW
  retry: RetryNode, // NEW
  guard: GuardNode, // NEW
  timeout: TimeoutNode, // NEW
};
```

### Workflow

```typescript
const nodeTypes: NodeTypes = {
  agent: AgentNode,
  tool: ToolNode,
  decision: DecisionNode, // NEW
  loop: LoopNode, // NEW
  parallel: ParallelNode, // NEW
  merge: MergeNode, // NEW
};
```

## Usage Examples

### Creating a Complete Behavior Tree with Decorators

```typescript
// Root sequence
const rootSequence = {
  id: 'root',
  type: 'sequence',
  label: 'Root Sequence',
  position: { x: 100, y: 50 },
  data: {},
};

// Retry decorator wrapping an action
const retryNode = {
  id: 'retry_1',
  type: 'retry',
  label: 'Retry API Call',
  position: { x: 100, y: 150 },
  data: { maxRetries: 3 },
};

// Guard for conditional execution
const guardNode = {
  id: 'guard_1',
  type: 'guard',
  label: 'Check Prerequisites',
  position: { x: 300, y: 150 },
  data: { condition: 'hasPermission === true' },
};

// Timeout for long operations
const timeoutNode = {
  id: 'timeout_1',
  type: 'timeout',
  label: 'Timeout Upload',
  position: { x: 500, y: 150 },
  data: { timeoutMs: 10000 },
};
```

### Creating a Complete Workflow with Control Flow

```typescript
// Agent node
const agent = {
  id: 'agent_1',
  type: 'agent',
  label: 'Brittney',
  position: { x: 100, y: 100 },
  data: {
    type: 'agent',
    agentId: 'brittney',
    systemPrompt: 'Process incoming data',
    temperature: 0.7,
    tools: [],
    maxTokens: 2048,
  },
};

// Decision for branching
const decision = {
  id: 'decision_1',
  type: 'decision',
  label: 'Check Result',
  position: { x: 300, y: 100 },
  data: {
    type: 'decision',
    condition: 'result.success === true',
    trueOutput: 'loop_1',
    falseOutput: 'agent_error',
  },
};

// Loop for batch processing
const loop = {
  id: 'loop_1',
  type: 'loop',
  label: 'Process Items',
  position: { x: 500, y: 100 },
  data: {
    type: 'loop',
    iterableSource: 'result.items',
    itemVariable: 'item',
    maxIterations: 100,
  },
};

// Merge to synchronize parallel branches
const merge = {
  id: 'merge_1',
  type: 'merge',
  label: 'Combine Results',
  position: { x: 700, y: 100 },
  data: {
    type: 'merge',
    waitForAll: true,
    timeout: 30000,
  },
};
```

---

**File**: PHASE2_TASK2_CODE_EXAMPLES.md
**Date**: 2026-02-28
