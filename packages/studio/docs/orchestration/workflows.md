# Agent Workflow Guide

**Build visual AI workflows with drag-and-drop node graphs**

The Agent Orchestration Graph Editor enables you to design complex multi-agent workflows using an intuitive visual interface. Connect AI agents, external tools, and control flow nodes to create powerful automation pipelines.

---

## Table of Contents

- [What Are Agent Workflows?](#what-are-agent-workflows)
- [Visual Workflow Builder](#visual-workflow-builder)
- [Creating Your First Workflow](#creating-your-first-workflow)
- [Node Types](#node-types)
- [Connecting Nodes](#connecting-nodes)
- [Executing Workflows](#executing-workflows)
- [Exporting Workflows](#exporting-workflows)
- [Best Practices](#best-practices)
- [Examples](#examples)

---

## What Are Agent Workflows?

Agent workflows are **directed graphs** that define how AI agents process information, call tools, and coordinate with each other. Each workflow consists of:

- **Nodes** - Individual processing units (agents, tools, decision points)
- **Edges** - Connections that define data flow between nodes
- **Data** - Information passed through the workflow during execution

Workflows enable you to:
- Chain multiple AI agent calls together
- Integrate external tools via MCP servers
- Create conditional branching logic
- Run parallel agent tasks
- Build complex automation pipelines

---

## Visual Workflow Builder

### Opening the Editor

**Keyboard Shortcut:** `Ctrl+Shift+W`

**Or via UI:**
1. Click the "Workflow" icon in the toolbar
2. Select or create a workflow from the list

### Interface Overview

```
┌────────────────────────────────────────────────────────┐
│  [Workflow] Scene Generation Pipeline     [+Agent] [Save] [×] │
├────────────────────────────────────────────────────────┤
│                                                        │
│   ┌─────────┐        ┌─────────┐        ┌─────────┐  │
│   │ Agent   │───────▶│ Tool    │───────▶│ Agent   │  │
│   │ Brittney│        │ analyze │        │ Review  │  │
│   └─────────┘        └─────────┘        └─────────┘  │
│                                                        │
│   ┌─────────┐        ┌─────────┐                      │
│   │Decision │───┬───▶│ Agent   │                      │
│   │ Branch  │   │    │ Path A  │                      │
│   └─────────┘   └───▶│ Agent   │                      │
│                       │ Path B  │                      │
│                       └─────────┘                      │
│                                                        │
├────────────────────────────────────────────────────────┤
│  [MiniMap]  [Background Grid]  [Zoom Controls]        │
└────────────────────────────────────────────────────────┘
```

**Components:**
- **Header** - Workflow name and action buttons
- **Canvas** - Main editing area with infinite scroll
- **MiniMap** - Bird's-eye view of entire workflow (bottom-right)
- **Controls** - Zoom, pan, and fit view controls (bottom-left)
- **Background** - Dotted grid for alignment

---

## Creating Your First Workflow

### Step 1: Add Your First Agent Node

1. Click the **"+ Agent"** button in the header
2. A new agent node appears on the canvas
3. Click the node to select it

### Step 2: Configure the Agent

Agent nodes display:
- **Type indicator:** 🤖 AGENT
- **Agent ID:** Name of the agent (e.g., "brittney")
- **Tool count:** Number of tools available to this agent

**Configuration properties:**
```typescript
{
  agentId: 'brittney',
  systemPrompt: 'You are a helpful AI assistant.',
  temperature: 0.7,
  tools: [],
  maxTokens: 2048
}
```

### Step 3: Add a Tool Node

Tool nodes connect to MCP servers to execute external functions.

1. From the "+ Agent" dropdown, select "+ Tool"
2. Choose a tool from your connected MCP servers
3. The tool node shows:
   - **Type indicator:** 🔧 TOOL
   - **Tool name:** Function name
   - **Server:** Source MCP server

### Step 4: Connect the Nodes

1. Click and drag from a node's **output handle** (right edge)
2. Drop on another node's **input handle** (left edge)
3. An animated edge appears showing data flow

### Step 5: Save the Workflow

Click **"Save"** in the header. Your workflow auto-saves to localStorage every 2 seconds.

---

## Node Types

### 1. Agent Node

**Purpose:** Execute AI agent inference

**Properties:**
- `agentId` - Agent identifier (e.g., "brittney", "claude-opus")
- `systemPrompt` - Instructions for the agent
- `temperature` - Randomness (0.0-1.0)
- `tools` - Array of tool names available to agent
- `maxTokens` - Maximum output length

**Visual Appearance:**
```
┌─────────────────┐
│ 🤖 AGENT        │
│ brittney        │
│ Tools: 3        │
└─────────────────┘
```

**Use Cases:**
- Natural language processing
- Code generation
- Content creation
- Decision making

---

### 2. Tool Node

**Purpose:** Execute external tool calls via MCP

**Properties:**
- `toolName` - Name of the MCP tool
- `server` - MCP server hosting the tool
- `args` - Arguments to pass to the tool

**Visual Appearance:**
```
┌─────────────────┐
│ 🔧 TOOL         │
│ search_knowledge│
│ semantic-search │
└─────────────────┘
```

**Use Cases:**
- File system operations
- API calls
- Database queries
- External service integration

---

### 3. Decision Node

**Purpose:** Conditional branching based on data

**Properties:**
- `condition` - JavaScript expression to evaluate
- `trueOutput` - Node to execute if true
- `falseOutput` - Node to execute if false

**Visual Appearance:**
```
┌─────────────────┐
│ 🔀 DECISION     │
│ if quality > 0.8│
└─────────────────┘
```

**Use Cases:**
- Quality thresholds
- Error handling
- Multi-path workflows
- A/B testing

---

### 4. Loop Node

**Purpose:** Iterate over data arrays

**Properties:**
- `iterations` - Number of loops (or until condition)
- `loopBody` - Nodes to execute in each iteration
- `breakCondition` - Optional early exit condition

**Visual Appearance:**
```
┌─────────────────┐
│ 🔁 LOOP         │
│ for each item   │
└─────────────────┘
```

**Use Cases:**
- Batch processing
- Recursive refinement
- Multi-step validation

---

### 5. Parallel Node

**Purpose:** Execute multiple branches simultaneously

**Properties:**
- `branches` - Array of node paths to execute
- `mergeStrategy` - How to combine results (all, any, first)

**Visual Appearance:**
```
┌─────────────────┐
│ ⚡ PARALLEL     │
│ 3 branches      │
└─────────────────┘
```

**Use Cases:**
- Multi-agent review
- Parallel tool calls
- Race conditions
- Redundant processing

---

### 6. Merge Node

**Purpose:** Combine outputs from multiple nodes

**Properties:**
- `mergeType` - Strategy (concat, object, reduce)
- `inputs` - Nodes to merge

**Visual Appearance:**
```
┌─────────────────┐
│ 🔗 MERGE        │
│ combine results │
└─────────────────┘
```

**Use Cases:**
- Consensus from multiple agents
- Combining tool outputs
- Aggregating parallel results

---

## Connecting Nodes and Data Flow

### Edge Types

**Animated Edges** - Show active data flow during execution

**Edge Properties:**
```typescript
{
  id: 'edge_1234',
  source: 'agent_1',
  target: 'tool_2',
  animated: true
}
```

### Data Flow Rules

1. **Left to Right** - Data flows from output handles (right) to input handles (left)
2. **Type Matching** - Agent outputs can connect to any input
3. **Multi-Input** - Nodes can have multiple incoming edges (merged by default)
4. **Multi-Output** - Nodes can have multiple outgoing edges (data is cloned)

### Example Data Flow

```
Input → Agent → Tool → Agent → Output
  "Generate   "Validate  "Refine
   scene"      output"    result"
```

Data at each step:
1. User prompt: `"Create a futuristic city"`
2. Agent output: `{ scene: "...", objects: [...] }`
3. Tool output: `{ valid: true, suggestions: [...] }`
4. Final output: `{ scene: "...", refined: true }`

---

## Executing Workflows

### Manual Execution

1. Click the "▶ Run" button (if available)
2. Execution follows the directed graph from start nodes
3. Watch real-time progress:
   - **Event Monitor** (`Ctrl+E`) - Agent communication
   - **Tool Call Graph** (`Ctrl+Shift+T`) - Tool execution

### Programmatic Execution

```typescript
import { useOrchestrationStore } from '@/lib/orchestrationStore';

const executeWorkflow = async (workflowId: string, input: any) => {
  const workflow = useOrchestrationStore.getState().workflows.get(workflowId);

  // Execute workflow logic here
  // (Implementation depends on your runtime engine)
};
```

### Monitoring Execution

**Event Monitor** shows agent messages:
```
12:30:45.123  agent.started     brittney → none
12:30:46.456  tool.called       search_knowledge → semantic-search
12:30:47.789  agent.completed   brittney → [final output]
```

**Tool Call Graph** shows performance:
```
Tool: search_knowledge
Server: semantic-search
Duration: 234ms
Status: ✓ Success
```

---

## Exporting Workflows

### Export as JSON

**Use Case:** Share workflows, version control, backup

```typescript
import { downloadWorkflowJSON } from '@/lib/exporters';

const workflow = workflows.get('workflow_123');
downloadWorkflowJSON(workflow);
```

**Output:** `Scene Pipeline-workflow_123.json`

```json
{
  "id": "workflow_123",
  "name": "Scene Generation Pipeline",
  "nodes": [...],
  "edges": [...],
  "createdAt": "2026-02-28T10:00:00.000Z"
}
```

### Export as TypeScript

**Use Case:** Import workflows into code, type-safe integration

```typescript
import { downloadWorkflowTS } from '@/lib/exporters';

downloadWorkflowTS(workflow);
```

**Output:** `Scene Pipeline-workflow_123.ts`

```typescript
import { AgentWorkflow } from '@/lib/orchestrationStore';

export const workflow_123Workflow: AgentWorkflow = {
  id: 'workflow_123',
  name: 'Scene Generation Pipeline',
  // ...
};
```

---

## Best Practices

### 1. Start Simple

Begin with linear workflows (A → B → C) before adding branches and loops.

### 2. Use Descriptive Names

Name nodes clearly: "Scene Generator", not "Agent 1"

### 3. Limit Node Complexity

Keep individual agent prompts focused. Use multiple agents instead of one complex prompt.

### 4. Test Incrementally

Test each node individually before connecting the full workflow.

### 5. Handle Errors

Add decision nodes to check for errors and route to fallback paths.

### 6. Document Your Workflow

Use the workflow description field to explain purpose and expected inputs.

### 7. Monitor Performance

Check the Tool Call Graph for slow operations and optimize.

### 8. Version Control

Export workflows as JSON and commit to Git for history tracking.

---

## Examples

### Example: Scene Optimizer Workflow

**Goal:** Generate and optimize 3D scenes through multi-agent pipeline

**Workflow Structure:**

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│ User Prompt │────▶│ Brittney     │────▶│ Art         │
│             │     │ (Generator)  │     │ Director    │
└─────────────┘     └──────────────┘     └─────────────┘
                                                │
                                                ▼
                    ┌──────────────┐     ┌─────────────┐
                    │ Shader Agent │◀────│ Decision:   │
                    │              │     │ Quality OK? │
                    └──────────────┘     └─────────────┘
                           │                    │
                           ▼                    ▼
                    ┌──────────────┐     ┌─────────────┐
                    │ Physics      │     │ Retry with  │
                    │ Agent        │     │ Feedback    │
                    └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ Final Scene  │
                    └──────────────┘
```

**Node Configuration:**

1. **Brittney (Generator)**
   - System Prompt: "Generate detailed 3D scene descriptions"
   - Temperature: 0.7
   - Tools: []

2. **Art Director**
   - System Prompt: "Evaluate scene composition and suggest improvements"
   - Temperature: 0.3
   - Tools: ["analyze_composition"]

3. **Decision: Quality OK?**
   - Condition: `quality_score > 0.8`
   - True: → Shader Agent
   - False: → Retry with Feedback

4. **Shader Agent**
   - System Prompt: "Generate PBR materials for scene objects"
   - Tools: ["create_material"]

5. **Physics Agent**
   - System Prompt: "Add collision meshes and physics properties"
   - Tools: ["generate_collider"]

---

### Example: Multi-Agent Review

**Goal:** Parallel code review from multiple expert agents

**Workflow Structure:**

```
┌─────────────┐
│ Code Input  │
└──────┬──────┘
       │
       ├────────────┬────────────┬────────────┐
       ▼            ▼            ▼            ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Security │ │Performance│ │ Style    │ │ Test     │
│ Agent    │ │ Agent     │ │ Agent    │ │ Coverage │
└────┬─────┘ └────┬──────┘ └────┬─────┘ └────┬─────┘
     │            │             │            │
     └────────────┴─────────────┴────────────┘
                  │
                  ▼
           ┌──────────────┐
           │ Merge Results│
           └──────┬───────┘
                  ▼
           ┌──────────────┐
           │ Final Report │
           └──────────────┘
```

**Node Configuration:**

1. **Parallel Node** (Root)
   - Branches: 4
   - Merge Strategy: "all"

2. **Security Agent**
   - System Prompt: "Identify security vulnerabilities"
   - Tools: ["analyze_security"]

3. **Performance Agent**
   - System Prompt: "Find optimization opportunities"
   - Tools: ["profile_code"]

4. **Style Agent**
   - System Prompt: "Check coding standards"
   - Tools: ["lint_code"]

5. **Test Coverage Agent**
   - System Prompt: "Analyze test coverage gaps"
   - Tools: ["measure_coverage"]

6. **Merge Results**
   - Merge Type: "object"
   - Output: `{ security: {...}, performance: {...}, style: {...}, coverage: {...} }`

---

## Advanced Topics

### Dynamic Workflows

Generate workflows programmatically:

```typescript
const createDynamicWorkflow = (agentCount: number) => {
  const nodes = [];
  const edges = [];

  for (let i = 0; i < agentCount; i++) {
    nodes.push({
      id: `agent_${i}`,
      type: 'agent',
      position: { x: i * 200, y: 100 },
      data: { agentId: `agent_${i}` }
    });

    if (i > 0) {
      edges.push({
        id: `edge_${i}`,
        source: `agent_${i - 1}`,
        target: `agent_${i}`
      });
    }
  }

  return { nodes, edges };
};
```

### Workflow Templates

Save common patterns as reusable templates:

```typescript
const templates = {
  'linear-pipeline': { /* 3-step linear workflow */ },
  'parallel-review': { /* Multi-agent parallel review */ },
  'iterative-refinement': { /* Loop-based refinement */ }
};
```

---

## Troubleshooting

**Problem:** Nodes won't connect

**Solution:** Ensure you're dragging from output handle (right) to input handle (left)

---

**Problem:** Workflow won't save

**Solution:** Check browser localStorage is enabled. See [Troubleshooting Guide](./troubleshooting.md#auto-save-not-working)

---

**Problem:** Exported workflow file is empty

**Solution:** Ensure workflow has at least one node. Check browser download permissions.

---

## Next Steps

- [Design Behavior Trees](./behavior-trees.md) for complex agent logic
- [Configure MCP Servers](./mcp-integration.md) to access external tools
- [Monitor Execution](./troubleshooting.md) with Event Monitor and Tool Call Graph

---

**Happy Workflow Building!**
