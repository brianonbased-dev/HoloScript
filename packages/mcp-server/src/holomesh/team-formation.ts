/**
 * Team Formation Service
 *
 * Forms task-specific agent teams by scoring a roster against a capability
 * requirement. Used by the `holo_team_form` MCP tool.
 *
 * Lifted from uaa2-service TeamFormationService. The HoloScript version is
 * roster-source-agnostic: callers pass a `RosterAgent[]` (typically from the
 * HoloMesh `/team/:id/members` endpoint) and the service returns a ranked
 * `FormedTeam` with gap analysis.
 *
 * Aligns with P.GOLD.003 (uncoordinated agent collaboration): the output is a
 * recommendation, not a binding assignment — agents can converge on the
 * proposed team without an explicit coordination protocol.
 */

// =============================================================================
// TYPES
// =============================================================================

export interface RosterAgent {
  agentId: string;
  agentName: string;
  capabilities: string[];
  specializationScore?: number; // 0..1
  performanceScore?: number; // 0..1
  active?: boolean;
}

export interface TeamRequirement {
  taskId: string;
  taskType: string;
  requiredCapabilities: string[];
  preferredCapabilities?: string[];
  teamSize?: number;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}

export interface TeamMember {
  agentId: string;
  agentName: string;
  role: string;
  capabilities: string[];
  specializationScore: number;
  performanceScore: number;
  complementarityScore: number;
}

export interface FormedTeam {
  teamId: string;
  requirementId: string;
  members: TeamMember[];
  overallScore: number;
  capabilityCoverage: number;
  complementarity: number;
  gaps: string[];
  strengths: string[];
  recommendations: string[];
  formedAt: number;
  status: 'proposed' | 'partial' | 'unfillable';
}

export interface TeamFormationConfig {
  maxTeamSize: number;
  minTeamSize: number;
  preferComplementary: boolean;
  considerPerformance: boolean;
  considerSpecialization: boolean;
  requireActiveAgents: boolean;
}

export const DEFAULT_FORMATION_CONFIG: TeamFormationConfig = {
  maxTeamSize: 8,
  minTeamSize: 1,
  preferComplementary: true,
  considerPerformance: true,
  considerSpecialization: true,
  requireActiveAgents: true,
};

// =============================================================================
// SCORING
// =============================================================================

function capabilityOverlap(agent: RosterAgent, required: string[]): { hits: string[]; misses: string[] } {
  const agentSet = new Set(agent.capabilities.map((c) => c.toLowerCase()));
  const hits: string[] = [];
  const misses: string[] = [];
  for (const cap of required) {
    if (agentSet.has(cap.toLowerCase())) hits.push(cap);
    else misses.push(cap);
  }
  return { hits, misses };
}

function scoreAgent(agent: RosterAgent, req: TeamRequirement, alreadyCovered: Set<string>, config: TeamFormationConfig): number {
  const { hits: requiredHits } = capabilityOverlap(agent, req.requiredCapabilities);
  const preferredHits = req.preferredCapabilities
    ? capabilityOverlap(agent, req.preferredCapabilities).hits
    : [];

  let score = requiredHits.length * 3 + preferredHits.length * 1;

  if (config.preferComplementary) {
    const newCoverage = requiredHits.filter((c) => !alreadyCovered.has(c.toLowerCase())).length;
    score += newCoverage * 2;
  }

  if (config.considerSpecialization && agent.specializationScore !== undefined) {
    score += agent.specializationScore * 2;
  }

  if (config.considerPerformance && agent.performanceScore !== undefined) {
    score += agent.performanceScore * 2;
  }

  return score;
}

function deriveRole(agent: RosterAgent, requiredHits: string[]): string {
  if (requiredHits.length === 0) return 'generalist';
  // Pick the capability the agent most distinctly carries.
  return requiredHits[0];
}

let teamCounter = 0;
function makeTeamId(): string {
  teamCounter++;
  return `team_${Date.now().toString(36)}_${teamCounter}`;
}

// =============================================================================
// PUBLIC API
// =============================================================================

export function formTeam(
  req: TeamRequirement,
  roster: RosterAgent[],
  configOverrides: Partial<TeamFormationConfig> = {}
): FormedTeam {
  const config: TeamFormationConfig = { ...DEFAULT_FORMATION_CONFIG, ...configOverrides };

  const eligible = config.requireActiveAgents
    ? roster.filter((a) => a.active !== false)
    : roster.slice();

  const targetSize = Math.max(
    config.minTeamSize,
    Math.min(config.maxTeamSize, req.teamSize ?? config.maxTeamSize)
  );

  const covered = new Set<string>();
  const selected: TeamMember[] = [];

  while (selected.length < targetSize) {
    const remaining = eligible.filter((a) => !selected.some((m) => m.agentId === a.agentId));
    if (remaining.length === 0) break;

    let best: { agent: RosterAgent; score: number } | null = null;
    for (const agent of remaining) {
      const s = scoreAgent(agent, req, covered, config);
      if (!best || s > best.score) best = { agent, score: s };
    }
    if (!best || best.score <= 0) break;

    const { hits: requiredHits } = capabilityOverlap(best.agent, req.requiredCapabilities);
    for (const cap of requiredHits) covered.add(cap.toLowerCase());

    selected.push({
      agentId: best.agent.agentId,
      agentName: best.agent.agentName,
      role: deriveRole(best.agent, requiredHits),
      capabilities: best.agent.capabilities,
      specializationScore: best.agent.specializationScore ?? 0,
      performanceScore: best.agent.performanceScore ?? 0,
      complementarityScore: requiredHits.length / Math.max(1, req.requiredCapabilities.length),
    });
  }

  const coverage = req.requiredCapabilities.length === 0
    ? 1
    : covered.size / req.requiredCapabilities.length;
  const gaps = req.requiredCapabilities.filter((c) => !covered.has(c.toLowerCase()));
  const strengths = Array.from(covered);

  const recommendations: string[] = [];
  if (gaps.length > 0) {
    recommendations.push(`Cover gaps: ${gaps.join(', ')} via recruit or upskill.`);
  }
  if (selected.length < (req.teamSize ?? targetSize)) {
    recommendations.push(`Team underfilled (${selected.length}/${req.teamSize ?? targetSize}). Expand roster or relax requirements.`);
  }
  if (selected.length > 0 && coverage === 1) {
    recommendations.push('All required capabilities covered. Consider pairing for redundancy on critical roles.');
  }

  const complementarity = selected.length > 0
    ? selected.reduce((s, m) => s + m.complementarityScore, 0) / selected.length
    : 0;

  let status: FormedTeam['status'] = 'proposed';
  if (selected.length === 0) status = 'unfillable';
  else if (coverage < 1) status = 'partial';

  const overallScore = coverage * 0.6 + complementarity * 0.4;

  return {
    teamId: makeTeamId(),
    requirementId: req.taskId,
    members: selected,
    overallScore,
    capabilityCoverage: coverage,
    complementarity,
    gaps,
    strengths,
    recommendations,
    formedAt: Date.now(),
    status,
  };
}
