# Agent Protocol (uAA2++)

**Framework for autonomous AI agent lifecycle management.** Standardizes agent initialization, planning, execution, verification, and completion across HoloScript platforms.

## Overview

The Agent Protocol implements the **uAA2++ 7-phase framework** for AI agents to understand, build, and modify HoloScript scenes.

### 7 Phases

| Phase | Purpose | Agent Role |
|-------|---------|------------|
| **Initialize** | Load context, authenticate | Prepare workspace |
| **Discover** | Find tools, parse capabilities | Map available MCP servers |
| **Understand** | Analyze requirements, plan | Create execution strategy |
| **Execute** | Run tools, generate code | Build HoloScript compositions |
| **Verify** | Validate output, test | Check for errors |
| **Report** | Document changes, log | Summarize work |
| **Affirm** | Confirm completion, handoff | Mark task done |

## Installation

```bash
npm install @holoscript/agent-protocol
```

## Quick Start

```typescript
import { AgentProtocol } from '@holoscript/agent-protocol';

const agent = new AgentProtocol({
  workspace: '/path/to/project',
  mcpServers: ['holoscript-language', 'brittney-ai'],
  model: 'claude-3-5-sonnet'
});

// Execute full protocol
const result = await agent.executePhases({
  goal: 'Create an interactive marketplace scene',
  userInstructions: 'Include NPC vendors, trading logic, and networking'
});

console.log(result.createdFiles);    // Generated .holo files
console.log(result.executionLog);    // Phase-by-phase details
```

## Phase API

### Phase 1: Initialize

```typescript
const context = await agent.initialize({
  workspace: './my-project',
  cache: true,                           // Use cached codebase graph if <24h old
  authentication: { token: process.env.GITHUB_TOKEN }
});

console.log(context.packageCount);       // 59 packages discovered
console.log(context.cacheAge);           // '5 hours old'
console.log(context.availableTools);     // List of MCP tools
```

### Phase 2: Discover

```typescript
const discovery = await agent.discover();

console.log(discovery.mcpServers);       // Connected servers
console.log(discovery.tools);            // [{ name, description, params }]
console.log(discovery.traits);           // [{ name, category, description }]
console.log(discovery.compilers);        // [{ target, version }]
```

### Phase 3: Understand

```typescript
const plan = await agent.understand({
  userGoal: 'Build a team-based multiplayer arena',
  constraints: {
    platforms: ['WebGPU', 'VRChat', 'Godot'],
    performanceBudget: '60fps',
    maxFileSize: '50KB'
  }
});

console.log(plan.strategy);              // Execution steps
console.log(plan.traits);                // Recommended traits
console.log(plan.estimatedComplexity);   // 'moderate'
```

### Phase 4: Execute

```typescript
const execution = await agent.execute(plan, {
  onProgress: (phase, percent) => console.log(`${phase}: ${percent}%`),
  dryRun: false                          // Set true to preview only
});

console.log(execution.createdFiles);     // ['arena.holo', 'team-logic.hs']
console.log(execution.executionTime);    // 'ms'
console.log(execution.errors);           // Any issues encountered
```

### Phase 5: Verify

```typescript
const validation = await agent.verify(execution.files);

console.log(validation.syntaxValid);     // true
console.log(validation.traitsUsed);      // Validated against registry
console.log(validation.warnings);        // ['High memory usage on compile']
console.log(validation.security);        // Security audit results
```

### Phase 6: Report

```typescript
const report = await agent.report({
  format: 'markdown',                    // or 'json', 'html'
  includeMetrics: true,
  includeExecutionLog: true
});

console.log(report.markdown);            // Full report as markdown
// Saves to ./AGENT_EXECUTION_REPORT.md
```

### Phase 7: Affirm

```typescript
const affirmation = await agent.affirm({
  completionStatus: 'success',
  nextSteps: 'User should test in Preview',
  handoffTarget: 'user-review'           // or 'auto-deployment', etc.
});

console.log(affirmation.taskComplete);   // true
console.log(affirmation.estimateQuality);// 0-1 confidence score
```

## Complete Workflow Example

```typescript
import { AgentProtocol } from '@holoscript/agent-protocol';

async function buildScene() {
  const agent = new AgentProtocol({ workspace: './game' });
  
  try {
    // Initialize
    const context = await agent.initialize();
    console.log(`Found ${context.packageCount} packages`);
    
    // Discover available tools
    const discovery = await agent.discover();
    console.log(`${discovery.tools.length} tools available`);
    
    // Plan approach
    const plan = await agent.understand({
      userGoal: 'Create a cooperative dungeon crawler game'
    });
    
    // Execute plan
    const execution = await agent.execute(plan);
    console.log(`Generated ${execution.createdFiles.length} files`);
    
    // Validate
    const validation = await agent.verify(execution.files);
    if (!validation.syntaxValid) throw validation.errors;
    
    // Document
    const report = await agent.report();
    
    // Handoff
    await agent.affirm({
      completionStatus: 'success',
      nextSteps: 'Test in Preview or VRChat'
    });
    
    return execution.createdFiles;
  } catch (error) {
    console.error('Agent execution failed:', error);
    throw error;
  }
}

buildScene();
```

## Configuration

```typescript
interface AgentProtocolConfig {
  workspace: string;                     // Project directory
  mcpServers: string[];                 // E.g. ['holoscript-language']
  model: string;                        // 'claude-3-5-sonnet', etc.
  cacheMode: 'use' | 'force' | 'skip';  // Cache strategy
  maxTokens: number;                    // Token budget per phase
  timeout: number;                      // Per-phase timeout (ms)
  dryRun: boolean;                      // Preview only
  verbose: boolean;                     // Debug output
}
```

## Environment Variables

```bash
HOLOSCRIPT_WORKSPACE=/path/to/project
HOLOSCRIPT_MODEL=claude-3-5-sonnet
MCP_SERVERS=holoscript-language,brittney-ai
AGENT_TOKEN=***
GITHUB_TOKEN=***
```

## Extending Agent Protocol

### Custom Phase

```typescript
class CustomAgent extends AgentProtocol {
  async customPhase() {
    console.log('Running custom phase...');
    // Custom logic
  }
}
```

### Custom Tool

```typescript
agent.registerTool({
  name: 'my-custom-tool',
  description: 'Does something special',
  execute: async (params) => {
    return { result: 'success' };
  }
});
```

## Error Handling

```typescript
try {
  await agent.executePhases(options);
} catch (error) {
  if (error.phase === 'Execute') {
    console.error('Generation failed:', error.message);
  } else if (error.phase === 'Verify') {
    console.error('Validation failed:', error.details);
  }
}
```

## Best Practices

1. **Cache the codebase graph** — Use `cache: true` unless files change
2. **Set reasonable timeouts** — 30-60s per phase is typical
3. **Enable verbose mode** during debugging
4. **Use dry-run first** for complex workflows
5. **Handle errors gracefully** — Agent phases can fail independently
6. **Monitor token usage** — Set `maxTokens` to avoid overruns

## See Also

- [UAAL VM](../packages/uaal.md) — Universal Autonomous Agent Language runtime
- [MCP Server](../packages/mcp-server.md) — Tool discovery and registration
- [CLI](../packages/cli.md) — Command-line interface for agents
