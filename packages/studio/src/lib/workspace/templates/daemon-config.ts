/**
 * Template generator for daemon configuration.
 *
 * Configures the self-improvement daemon with provider rotation,
 * focus areas derived from Absorb health score, and budget caps by tier.
 */

import type { ScaffoldDNA } from '../scaffolder';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DaemonProvider {
  name: string;
  model: string;
  weight: number;
}

export interface DaemonFocus {
  area: string;
  priority: number;
  reason: string;
}

export interface DaemonConfig {
  enabled: boolean;
  providers: DaemonProvider[];
  focusAreas: DaemonFocus[];
  budgetCap: number;
  scanInterval: number;
  maxConcurrentTasks: number;
  autoCommit: boolean;
  safeMode: boolean;
}

// ─── Focus area derivation ──────────────────────────────────────────────────

function deriveFocusAreas(dna: ScaffoldDNA): DaemonFocus[] {
  const areas: DaemonFocus[] = [];

  // Low test coverage → focus on tests
  if (dna.testCoverage < 30) {
    areas.push({
      area: 'test-coverage',
      priority: 1,
      reason: `Test coverage at ${dna.testCoverage}% — critical gap`,
    });
  } else if (dna.testCoverage < 60) {
    areas.push({
      area: 'test-coverage',
      priority: 3,
      reason: `Test coverage at ${dna.testCoverage}% — moderate gap`,
    });
  }

  // Low health score → focus on code quality
  if (dna.codeHealthScore < 4) {
    areas.push({
      area: 'code-quality',
      priority: 1,
      reason: `Health score ${dna.codeHealthScore}/10 — needs structural improvements`,
    });
  } else if (dna.codeHealthScore < 6) {
    areas.push({
      area: 'code-quality',
      priority: 2,
      reason: `Health score ${dna.codeHealthScore}/10 — some cleanup needed`,
    });
  }

  // TypeScript without strict → focus on type safety
  if (dna.techStack.includes('typescript') && dna.codeHealthScore < 7) {
    areas.push({
      area: 'type-safety',
      priority: 2,
      reason: 'TypeScript project — tighten types and eliminate any casts',
    });
  }

  // Documentation gap
  areas.push({
    area: 'documentation',
    priority: 4,
    reason: 'Keep docs in sync with code changes',
  });

  // Always include TODO cleanup
  areas.push({
    area: 'todo-cleanup',
    priority: 5,
    reason: 'Periodically address TODO/FIXME markers',
  });

  // Sort by priority
  areas.sort((a, b) => a.priority - b.priority);

  return areas;
}

// ─── Provider rotation ──────────────────────────────────────────────────────

function defaultProviders(): DaemonProvider[] {
  return [
    { name: 'claude', model: 'claude-sonnet-4-20250514', weight: 0.5 },
    { name: 'openai', model: 'gpt-4o', weight: 0.3 },
    { name: 'grok', model: 'grok-3', weight: 0.2 },
  ];
}

// ─── Budget by tier ─────────────────────────────────────────────────────────

type UserTier = 'free' | 'pro' | 'enterprise';

function budgetForTier(tier: UserTier): number {
  switch (tier) {
    case 'free':
      return 1;
    case 'pro':
      return 10;
    case 'enterprise':
      return 50;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function generateDaemonConfig(
  dna: ScaffoldDNA,
  tier: UserTier = 'free',
): DaemonConfig {
  return {
    enabled: true,
    providers: defaultProviders(),
    focusAreas: deriveFocusAreas(dna),
    budgetCap: budgetForTier(tier),
    scanInterval: 15,
    maxConcurrentTasks: 1,
    autoCommit: false,
    safeMode: true,
  };
}
