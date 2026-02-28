# HoloScript Studio - AI Orchestration System

**Visual AI orchestration for the spatial computing era**

HoloScript Studio provides a comprehensive visual orchestration system for designing, executing, and monitoring AI agent workflows. Build complex multi-agent systems through intuitive node-based editors, connect to external tools via MCP (Model Context Protocol), and visualize real-time agent execution.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Core Components](#core-components)
- [Key Features](#key-features)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Use Cases](#use-cases)

---

## Overview

The HoloScript Studio orchestration system enables you to:

- **Design Workflows Visually** - Build agent workflows using drag-and-drop node graphs
- **Create Behavior Trees** - Design complex AI behaviors with hierarchical tree structures
- **Connect to MCP Servers** - Access external tools and services through Model Context Protocol
- **Monitor Agent Communication** - Track real-time events between agents
- **Visualize Tool Execution** - See tool call sequences and performance metrics
- **Orchestrate Agent Ensembles** - Coordinate multiple specialized AI agents

All components feature auto-save, keyboard shortcuts, export functionality, and error boundaries for a production-ready experience.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    HoloScript Studio                            │
│                  Orchestration System                           │
└─────────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
    ┌─────▼─────┐      ┌──────▼──────┐     ┌─────▼─────┐
    │  Design   │      │  Execute    │     │  Monitor  │
    │  Layer    │      │  Layer      │     │  Layer    │
    └───────────┘      └─────────────┘     └───────────┘
          │                   │                   │
    ┌─────┴──────┐      ┌─────┴─────┐      ┌─────┴─────┐
    │ Workflow   │      │  MCP      │      │  Event    │
    │ Editor     │      │  Client   │      │  Monitor  │
    ├────────────┤      ├───────────┤      ├───────────┤
    │ Behavior   │      │  Agent    │      │  Tool     │
    │ Tree       │      │  Ensemble │      │  Call     │
    │ Editor     │      │           │      │  Graph    │
    └────────────┘      └───────────┘      └───────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ Orchestration     │
                    │ Store (Zustand)   │
                    └───────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ localStorage       │
                    │ (Persistence)      │
                    └────────────────────┘
```

### Data Flow

1. **User Input** → Visual editors (Workflow, Behavior Tree)
2. **Design Data** → Orchestration Store (centralized state)
3. **Persistence** → Auto-save to localStorage every 2 seconds
4. **Execution** → MCP Client sends requests to external servers
5. **Events** → Agent Event Bus tracks communication
6. **Monitoring** → Real-time visualization of execution state

---

## Core Components

HoloScript Studio provides **6 orchestration panels**, each designed for a specific aspect of AI workflow management:

### 1. MCP Server Config Panel

**Purpose:** Connect to external tools and services via Model Context Protocol

- Configure MCP server connections
- Browse available tools from connected servers
- Test tool calls with visual form builder
- Monitor server health and response times
- Manage API keys and authentication

**Keyboard Shortcut:** `Ctrl+M`

[→ Learn more in MCP Integration Guide](./mcp-integration.md)

---

### 2. Agent Orchestration Graph Editor

**Purpose:** Design multi-agent workflows using visual node graphs

- Create agent nodes with custom configurations
- Connect tool nodes from MCP servers
- Design decision flows and parallel execution
- Visualize data flow between nodes
- Export workflows as JSON or TypeScript

**Keyboard Shortcut:** `Ctrl+Shift+W`

[→ Learn more in Workflow Guide](./workflows.md)

---

### 3. Behavior Tree Visual Editor

**Purpose:** Design hierarchical AI behaviors using behavior trees

- Build control flow with Sequence, Selector, Parallel nodes
- Define actions and conditions
- Create reusable behavior subtrees
- Export to DSL code for runtime execution
- Test behavior execution paths

**Keyboard Shortcut:** `Ctrl+B`

[→ Learn more in Behavior Tree Guide](./behavior-trees.md)

---

### 4. Agent Event Monitor Panel

**Purpose:** Monitor real-time communication between AI agents

- View live event stream with timestamps
- Filter events by topic or sender
- Pause/resume event capture
- Export event logs as CSV or JSON
- Track message delivery and routing

**Keyboard Shortcut:** `Ctrl+E`

[→ Learn more in Workflow Guide](./workflows.md#monitoring-execution)

---

### 5. Tool Call Graph Visualizer

**Purpose:** Track and visualize tool execution sequences

- Monitor tool call success/error rates
- View execution duration and performance
- Inspect arguments and results
- Track which agent triggered each call
- Display real-time execution statistics

**Keyboard Shortcut:** `Ctrl+Shift+T`

[→ Learn more in MCP Integration Guide](./mcp-integration.md#monitoring-tool-calls)

---

### 6. Desktop Agent Ensemble

**Purpose:** 2D visualization of spatial agent coordination

- View agent positions and relationships
- Drag agents to reposition
- Monitor agent activity status
- Synchronized with VR agent system
- Track multi-agent collaboration

**Keyboard Shortcut:** `Ctrl+Shift+A`

[→ Learn more in Workflow Guide](./workflows.md#agent-ensemble)

---

## Key Features

### Auto-Save & Persistence

All orchestration data automatically saves to localStorage every 2 seconds:

- Workflows and behavior trees
- MCP server configurations
- Agent ensemble positions
- Event monitor filters

**Implementation:** `useOrchestrationAutoSave` hook

---

### Keyboard Shortcuts

Global keyboard shortcuts for quick panel access:

| Shortcut | Action |
|----------|--------|
| `Ctrl+M` | Toggle MCP Server Config |
| `Ctrl+Shift+W` | Toggle Workflow Editor |
| `Ctrl+B` | Toggle Behavior Tree Editor |
| `Ctrl+E` | Toggle Event Monitor |
| `Ctrl+Shift+T` | Toggle Tool Call Graph |
| `Ctrl+Shift+A` | Toggle Agent Ensemble |

[→ Complete shortcuts reference](./keyboard-shortcuts.md)

---

### Export Functionality

Export your orchestration data in multiple formats:

**Workflows:**
- JSON format (data interchange)
- TypeScript modules (code integration)

**Behavior Trees:**
- JSON format with full tree structure

**Event Logs:**
- CSV format (Excel-compatible)
- JSON format (data analysis)

**Implementation:** `src/lib/exporters.ts`

---

### Error Boundaries

Each orchestration component is wrapped in React Error Boundaries:

- Graceful failure handling
- Component-level isolation
- Recovery without full app reload
- Error reporting to console

**Implementation:** `ErrorBoundary` wrapper component

---

## Quick Start

### 1. Open MCP Server Config

Press `Ctrl+M` or click the MCP icon in the toolbar.

The default orchestrator at `http://localhost:5567` will auto-configure.

### 2. Test a Tool

1. Select a server from the server list
2. Browse available tools in the tool browser
3. Click a tool to open the tester
4. Fill in parameters and click "Test Tool"

### 3. Create Your First Workflow

Press `Ctrl+Shift+W` to open the Workflow Editor.

1. Click "+ Agent" to add an agent node
2. Configure the agent's system prompt and tools
3. Add more nodes and connect them
4. Click "Save" to persist your workflow

### 4. Monitor Execution

Press `Ctrl+E` to open the Event Monitor and `Ctrl+Shift+T` for the Tool Call Graph.

Watch real-time agent communication and tool execution as your workflow runs.

---

## Documentation

### Detailed Guides

- [Agent Workflow Guide](./workflows.md) - Complete workflow creation tutorial
- [Behavior Tree Guide](./behavior-trees.md) - Behavior tree design patterns
- [MCP Integration Guide](./mcp-integration.md) - Connect to external tools
- [Keyboard Shortcuts Reference](./keyboard-shortcuts.md) - All shortcuts
- [Troubleshooting Guide](./troubleshooting.md) - Common issues & solutions

### API Documentation

- **Orchestration Store:** `src/lib/orchestrationStore.ts`
- **MCP Client:** `src/lib/mcpClient.ts`
- **Export Functions:** `src/lib/exporters.ts`
- **Auto-Save Hook:** `src/hooks/useOrchestrationAutoSave.ts`
- **Keyboard Hook:** `src/hooks/useOrchestrationKeyboard.ts`

---

## Use Cases

### Scene Generation Pipeline

Build a multi-stage workflow that:
1. Takes user prompt
2. Brittney agent generates scene description
3. Art Director agent creates visual specifications
4. Shader agent generates materials
5. Physics agent adds collision meshes

[→ See example workflow](./workflows.md#example-scene-optimizer-workflow)

---

### Multi-Agent Code Review

Create a parallel review workflow where:
- Security agent checks for vulnerabilities
- Performance agent analyzes optimization opportunities
- Style agent enforces coding standards
- Results merge into final report

[→ See example workflow](./workflows.md#example-multi-agent-review)

---

### Intelligent NPC Behavior

Design behavior trees for game characters:
- Patrol state with waypoint navigation
- Combat state with target selection
- Resource gathering with priority logic
- Fallback behaviors for error handling

[→ See example behavior tree](./behavior-trees.md#example-agent-patrol-behavior)

---

## Next Steps

1. **Explore the Workflow Guide** - Learn to build complex agent workflows
2. **Configure MCP Servers** - Connect to external tools and APIs
3. **Design Behavior Trees** - Create reusable AI behavior patterns
4. **Monitor Execution** - Track agent performance and debugging

---

## Support

For issues, questions, or feature requests:

- Check the [Troubleshooting Guide](./troubleshooting.md)
- Review component source code in `src/components/orchestration/`
- Test export functions with `src/lib/exporters.test.ts`

---

**Happy Orchestrating!**

Built with HoloScript Studio for the spatial computing era.
