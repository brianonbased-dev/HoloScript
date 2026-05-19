export type BrainCachingScope = 'team-board' | 'agent-role' | 'scene-local';

export type BrainCacheCapability =
  | 'provider-prompt-cache'
  | 'service-managed-cache'
  | 'local-prefix-cache'
  | 'none';

export type BrainCacheUsage = 'shared-prefix' | 'role-overlay' | 'scene-turn';

export interface BrainCachingContext {
  sceneContext?: string | null;
  providerName?: string | null;
  model?: string | null;
}

export interface BrainCachingRecommendation {
  scope: BrainCachingScope;
  capability: BrainCacheCapability;
  usage: BrainCacheUsage;
  stablePrefix: string;
  expectedReuseRate: number;
  declaration: string;
  reason: string;
}

const TEAM_BOARD_REUSE = 0.82;
const AGENT_ROLE_REUSE = 0.68;
const SCENE_LOCAL_REUSE = 0.42;

export function buildBrainCachingRecommendation(
  input: BrainCachingContext = {}
): BrainCachingRecommendation {
  const scope = inferBrainCachingScope(input.sceneContext);
  const capability = inferBrainCacheCapability(input.providerName, input.model);
  const usage = usageForScope(scope);
  const expectedReuseRate = expectedReuseRateForScope(scope);
  const stablePrefix = stablePrefixForScope(scope);
  const reason = reasonForRecommendation(scope, capability);
  const declaration = formatCachingDeclaration({
    stablePrefix,
    expectedReuseRate,
    capability,
    usage,
  });

  return {
    scope,
    capability,
    usage,
    stablePrefix,
    expectedReuseRate,
    declaration,
    reason,
  };
}

export function buildBrainCachingPromptBlock(input: BrainCachingContext = {}): string {
  const recommendation = buildBrainCachingRecommendation(input);
  const capabilityLine =
    recommendation.capability === 'none'
      ? 'Selected provider/model does not expose a durable prompt-cache receipt; still declare intended reuse so the runtime can route or warn.'
      : `Selected provider/model cache capability: ${recommendation.capability}.`;

  return `

--- Brittney Brain Caching ---
When authoring a new Brittney brain, agent brain, or long-lived HoloScript brain composition, auto-generate an @caching declaration near the brain/agent root.
Recommended declaration for this turn:
${recommendation.declaration}
Scope: ${recommendation.scope}; usage: ${recommendation.usage}; expectedReuseRate: ${recommendation.expectedReuseRate.toFixed(2)}.
${capabilityLine}
Reason: ${recommendation.reason}`;
}

export function inferBrainCachingScope(sceneContext: string | null | undefined): BrainCachingScope {
  const text = String(sceneContext ?? '').toLowerCase();
  if (
    text.includes('--- team board ---') ||
    text.includes('team-board') ||
    text.includes('team board') ||
    text.includes('board snapshot') ||
    text.includes('tasks:')
  ) {
    return 'team-board';
  }
  if (
    text.includes('--- agent sessions ---') ||
    text.includes('per-agent') ||
    text.includes('agent role') ||
    text.includes('role overlay') ||
    text.includes('daemon agent') ||
    text.includes('mission=')
  ) {
    return 'agent-role';
  }
  return 'scene-local';
}

export function inferBrainCacheCapability(
  providerName: string | null | undefined,
  model: string | null | undefined
): BrainCacheCapability {
  const provider = String(providerName ?? '').toLowerCase();
  const modelName = String(model ?? '').toLowerCase();

  if (provider === 'anthropic') return 'provider-prompt-cache';
  if (provider === 'cloud') return 'service-managed-cache';
  if (provider === 'ollama' || modelName.includes('local') || modelName.includes('qwen')) {
    return 'local-prefix-cache';
  }
  return 'none';
}

function usageForScope(scope: BrainCachingScope): BrainCacheUsage {
  if (scope === 'team-board') return 'shared-prefix';
  if (scope === 'agent-role') return 'role-overlay';
  return 'scene-turn';
}

function expectedReuseRateForScope(scope: BrainCachingScope): number {
  if (scope === 'team-board') return TEAM_BOARD_REUSE;
  if (scope === 'agent-role') return AGENT_ROLE_REUSE;
  return SCENE_LOCAL_REUSE;
}

function stablePrefixForScope(scope: BrainCachingScope): string {
  if (scope === 'team-board') return 'team-board';
  if (scope === 'agent-role') return 'agent-role';
  return 'scene-context';
}

function reasonForRecommendation(
  scope: BrainCachingScope,
  capability: BrainCacheCapability
): string {
  if (scope === 'team-board') {
    return 'Team-board context changes slowly and is reused across many Brittney turns and agent reviews.';
  }
  if (scope === 'agent-role') {
    return 'Per-agent role overlays are stable within a work session and should be cached separately from the changing task payload.';
  }
  if (capability === 'none') {
    return 'Scene-only turns have lower reuse, but the declaration preserves intent for future cache-capable providers.';
  }
  return 'Scene context has moderate short-term reuse during iterative authoring.';
}

function formatCachingDeclaration(input: {
  stablePrefix: string;
  expectedReuseRate: number;
  capability: BrainCacheCapability;
  usage: BrainCacheUsage;
}): string {
  return `@caching { stablePrefix: "${input.stablePrefix}", expectedReuseRate: ${input.expectedReuseRate.toFixed(
    2
  )}, cacheCapability: "${input.capability}", cacheUsage: "${input.usage}" }`;
}
