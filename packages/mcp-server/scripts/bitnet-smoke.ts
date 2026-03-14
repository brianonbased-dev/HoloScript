type GenerateSceneResult = {
  code?: string;
  source?: 'ai' | 'heuristic';
  provider?: string;
  attemptedProviders?: string[];
  stats?: { lines?: number };
};

type HandlerModuleShape = {
  handleTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  default?: {
    handleTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  };
};

async function isBitNetReachable(baseUrl: string): Promise<boolean> {
  const normalized = baseUrl.replace(/\/$/, '');

  try {
    const health = await fetch(`${normalized}/health`, { signal: AbortSignal.timeout(2500) });
    if (health.ok) return true;
  } catch {
    // Try fallback endpoint below
  }

  try {
    const models = await fetch(`${normalized}/v1/models`, { signal: AbortSignal.timeout(2500) });
    return models.ok;
  } catch {
    return false;
  }
}

async function main() {
  const baseUrl = process.env.BITNET_BASE_URL ?? 'http://localhost:8080';
  const reachable = await isBitNetReachable(baseUrl);

  // Tell createProviderManager() where the local server is.
  // Without HOLOSCRIPT_LOCAL_LLM_URL set, local-llm is not registered (prevents 120s CPU hang).
  process.env.HOLOSCRIPT_LOCAL_LLM_URL = baseUrl;
  // Force local-llm selection for deterministic smoke behavior.
  // To test real bitnet.cpp, set HOLOSCRIPT_BITNET_URL and HOLOSCRIPT_MCP_AI_PROVIDER=bitnet
  process.env.HOLOSCRIPT_MCP_AI_PROVIDER = 'local-llm';

  const handlersModule = (await import('../src/handlers')) as HandlerModuleShape;
  const handleTool = handlersModule.handleTool ?? handlersModule.default?.handleTool;

  if (!handleTool) {
    console.error('BitNet smoke failed: handlers.handleTool is unavailable.');
    process.exit(1);
  }

  const result = (await handleTool('generate_scene', {
    description: 'a minimal room with one cube',
    features: ['logic'],
  })) as GenerateSceneResult;

  const hasCode = typeof result.code === 'string' && result.code.trim().length > 0;

  if (!hasCode) {
    console.error('Local LLM smoke failed: generate_scene returned no code.');
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  if (reachable) {
    const aiFromLocal = result.source === 'ai' && result.provider === 'local-llm';
    if (!aiFromLocal) {
      console.error('Local LLM smoke failed: server is reachable but generate_scene did not use ai/local-llm.');
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }
  } else {
    if (result.source !== 'heuristic') {
      console.error('Local LLM smoke failed: server unreachable but generate_scene did not fall back to heuristic.');
      console.error(JSON.stringify(result, null, 2));
      process.exit(1);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        bitnetReachable: reachable,
        source: result.source,
        provider: result.provider,
        attemptedProviders: result.attemptedProviders ?? [],
        lines: result.stats?.lines,
      },
      null,
      2
    )
  );
}

void main();
