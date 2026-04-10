/**
 * Template generator for HoloMesh team room configuration.
 *
 * Each scaffolded project gets a team room with 4 agent slots and a task
 * board seeded from Absorb scan findings.
 */

import type { ScaffoldDNA } from '../scaffolder';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentSlot {
  role: string;
  name: string;
  description: string;
  capabilities: string[];
}

export interface BoardItem {
  id: string;
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  source: string;
  status: 'open' | 'in-progress' | 'done';
}

export interface TeamRoomConfig {
  roomId: string;
  projectName: string;
  agents: AgentSlot[];
  board: BoardItem[];
  settings: {
    autoAssign: boolean;
    maxConcurrentAgents: number;
    notifyOnComplete: boolean;
  };
}

// ─── Agent slot definitions ─────────────────────────────────────────────────

function defaultAgentSlots(): AgentSlot[] {
  return [
    {
      role: 'orchestrator',
      name: 'Brittney',
      description: 'Project orchestrator — plans work, delegates tasks, tracks progress',
      capabilities: ['planning', 'delegation', 'progress-tracking', 'prioritization'],
    },
    {
      role: 'daemon',
      name: 'Daemon',
      description: 'Self-improvement agent — runs scans, fixes issues, maintains quality',
      capabilities: ['scanning', 'auto-fix', 'test-generation', 'refactoring'],
    },
    {
      role: 'knowledge',
      name: 'Absorb',
      description: 'Codebase intelligence — answers questions, maps dependencies, finds patterns',
      capabilities: ['search', 'graph-analysis', 'impact-assessment', 'pattern-detection'],
    },
    {
      role: 'oracle',
      name: 'Oracle',
      description: 'Decision support — resolves ambiguity, provides context, prevents stalls',
      capabilities: ['decision-trees', 'context-retrieval', 'convention-lookup', 'history'],
    },
  ];
}

// ─── Board seeding ──────────────────────────────────────────────────────────

function generateBoardId(): string {
  return `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function seedBoard(dna: ScaffoldDNA): BoardItem[] {
  const items: BoardItem[] = [];

  // Always start with initial scan
  items.push({
    id: generateBoardId(),
    title: 'Complete initial Absorb scan and review findings',
    priority: 'high',
    source: 'scaffold',
    status: 'open',
  });

  // Test coverage items
  if (dna.testCoverage < 20) {
    items.push({
      id: generateBoardId(),
      title: `Increase test coverage from ${dna.testCoverage}% to 30%`,
      priority: 'critical',
      source: 'absorb-scan',
      status: 'open',
    });
  } else if (dna.testCoverage < 50) {
    items.push({
      id: generateBoardId(),
      title: `Improve test coverage from ${dna.testCoverage}% — target 60%`,
      priority: 'medium',
      source: 'absorb-scan',
      status: 'open',
    });
  }

  // Code health items
  if (dna.codeHealthScore < 5) {
    items.push({
      id: generateBoardId(),
      title: `Address code health issues (score: ${dna.codeHealthScore}/10)`,
      priority: 'high',
      source: 'absorb-scan',
      status: 'open',
    });
  }

  // Documentation
  items.push({
    id: generateBoardId(),
    title: 'Review and update README.md',
    priority: 'medium',
    source: 'scaffold',
    status: 'open',
  });

  // CI/CD check
  if (!dna.techStack.includes('ci')) {
    items.push({
      id: generateBoardId(),
      title: 'Set up CI/CD pipeline (GitHub Actions recommended)',
      priority: 'medium',
      source: 'scaffold',
      status: 'open',
    });
  }

  // Trait and compilation targets
  if (dna.traits.length > 0) {
    items.push({
      id: generateBoardId(),
      title: `Explore suggested traits: ${dna.traits.slice(0, 3).join(', ')}`,
      priority: 'low',
      source: 'brittney-suggestion',
      status: 'open',
    });
  }

  if (dna.compilationTargets.length > 0) {
    items.push({
      id: generateBoardId(),
      title: `Explore compilation targets: ${dna.compilationTargets.slice(0, 3).join(', ')}`,
      priority: 'low',
      source: 'brittney-suggestion',
      status: 'open',
    });
  }

  return items;
}

// ─── Room ID generation ─────────────────────────────────────────────────────

function generateRoomId(projectName: string): string {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `room-${slug}-${suffix}`;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function generateTeamRoomConfig(dna: ScaffoldDNA): TeamRoomConfig {
  return {
    roomId: generateRoomId(dna.name),
    projectName: dna.name,
    agents: defaultAgentSlots(),
    board: seedBoard(dna),
    settings: {
      autoAssign: true,
      maxConcurrentAgents: 2,
      notifyOnComplete: true,
    },
  };
}
