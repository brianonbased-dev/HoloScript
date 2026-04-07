import type { ProjectDNA } from '@/lib/stores/workspaceStore';

export interface SeededFile {
  path: string;
  content: string;
}

/**
 * Generates the uAA2++ agentic ecosystem files for a newly imported repository.
 * This ensures any local agents (Claude/Cursor) acting on the repo follow
 * strict HoloMesh orchestration rules and context limits.
 */
export function generateWorkspaceSeed(repoName: string, dna: ProjectDNA): SeededFile[] {
  const files: SeededFile[] = [];

  // 1. NORTH_STAR.md
  files.push({
    path: '.claude/NORTH_STAR.md',
    content: `# NORTH_STAR - ${repoName}

## Primary Objective
Maintain production stability and act as the local node for the HoloScript uAA2++ Mesh.

## Core Directives
1. **GraphRAG-First:** Always execute \`holo_query_codebase\` before making architectural modifications.
2. **Explicit Staging:** NEVER use \`git add -A\`. Stage files explicitly.
3. **Sovereignty Boundary:** Do not modify the underlying engine physics unless authorized via Sovereign Approval.
4. **Context Loop:** You must COMPRESS and GROW your local \`MEMORY.md\` upon completing isolated tasks.

## Local Daemon Profile
Assigned Daemon: **${dna.recommendedProfile}**
Running Mode: **${dna.recommendedMode}**
Repository DNA: ${dna.kind.toUpperCase()} (${dna.languages.join(', ')})
`
  });

  // 2. MEMORY.md
  files.push({
    path: 'MEMORY.md',
    content: `# Workspace Memory Ledger

> This file acts as the persistent storage for local AI agents executing in this workspace.

## System State
- **Active Feature:** Workspace Bootstrapping
- **Health:** Stable
- **Unresolved Tech Debt:** None

## W/P/G (Wisdom, Patterns, Gotchas)
*Agents must append to this section when completing tasks.*

### W.001 - ${repoName} Structure
- Scanned ${dna.languages.length} languages and identified ${dna.frameworks.length} frameworks.
- Primary interaction vector matches the \`${dna.kind}\` topological pattern.

### P.001 - Agent Execution
- Local actions should follow the defined \`absorb-orchestrator-funnel.md\` workflow.
`
  });

  // 3. AGENTS.md (Dynamic based on repo DNA)
  files.push({
    path: 'AGENTS.md',
    content: `# AGENTS.md -- Configuration
> AAIF-compliant agent configuration for ${repoName}

## Repository Overview
- **DNA Match:** ${dna.kind}
- **Confidence:** ${Math.round(dna.confidence * 100)}%
- **Shape:** ${dna.repoShape}

## Foundative Frameworks Detected
${dna.frameworks.map(f => `- ${f}`).join('\n')}

## Security Rules
- ${dna.kind === 'spatial' ? 'WARNING: Do not place heavy Neural Net execution directly in the VR render loop (11.1ms timeout limit).' : 'Standard process guardrails active.'}
${dna.riskSignals.map(r => `- RISK: ${r}`).join('\n')}
`
  });

  // 4. Workflow definition
  files.push({
    path: '.agent/workflows/absorb-orchestrator-funnel.md',
    content: `---
description: Ensure local mesh telemetry and safe job execution
---
# Absorb & Orchestrator Funnel

1. Run \`bolo_graph_status\` to verify local knowledge cache.
2. Claim task from Holomesh board (if remote).
3. Execute localized code changes.
4. Summarize changes into \`MEMORY.md\` and run GraphRAG sync.
`
  });

  return files;
}
