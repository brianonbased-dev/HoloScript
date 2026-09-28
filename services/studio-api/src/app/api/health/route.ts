import { NextResponse } from 'next/server';
import {
  resolveOwnedLocalProvider,
  type ResolvedSovereignProvider,
} from '@holoscript/llm-provider';
import { getStudioPersistenceProbe } from '../../../lib/studio-dev-persistence';
import { logLocalModelFailure } from '../../../lib/local-model-failure';

const CALLER = 'studio-api /api/health';

/**
 * GET /api/health
 *
 * Returns { local: { provider, reachable, models? }, persistence }.
 *   local.provider   the local model server the generate routes use: 'holoserve'
 *                    (HOLOSERVE_URL) or 'holollama' (HOLOLLAMA_URL), or 'none' when
 *                    neither is set.
 *   local.reachable  true when that server answers its health check.
 *   local.models     ids from its /v1/models; left out when that list cannot be read.
 *   local.error      only when the configured server cannot be used here (a public
 *                    address, or a parity-pinned model). Generic text: the resolver's own
 *                    message goes to the server log, since it can name the host.
 *
 * D.117: HoloLlama replaced Ollama, so the old `ollama` and `models` fields are gone.
 * Nothing read them: Studio's client (packages/studio/src/lib/api.ts) reads Studio's own
 * /api/health, not this service's.
 */
export async function GET() {
  const persistence = getStudioPersistenceProbe();

  let local: ResolvedSovereignProvider | null;
  try {
    local = resolveOwnedLocalProvider({ caller: CALLER });
  } catch (err) {
    // Configured but unusable, e.g. a public HOLOLLAMA_URL, or a model parity-pinned to
    // HoloServe. The routes refuse it too, so it is not reachable for them.
    logLocalModelFailure(CALLER, err);
    return NextResponse.json({
      local: {
        provider: configuredProvider(),
        reachable: false,
        error: 'configured but cannot be used here; the server log says why',
      },
      persistence,
    });
  }
  if (!local) {
    return NextResponse.json({ local: { provider: 'none', reachable: false }, persistence });
  }

  const health = await local.provider.healthCheck().catch(() => ({ ok: false }));
  const models = health.ok ? await listModels(local.providerName) : undefined;
  return NextResponse.json({
    local: { provider: local.providerName, reachable: health.ok, ...(models ? { models } : {}) },
    persistence,
  });
}

/** Which server the env names (HoloServe wins, as in the resolver). */
function configuredProvider(): 'holoserve' | 'holollama' {
  return process.env.HOLOSERVE_URL || process.env.HOLOSERVE_ENDPOINT ? 'holoserve' : 'holollama';
}

/** The configured base URL, read with the same names the resolver reads. */
function ownedBaseUrl(providerName: string): string | undefined {
  const url =
    providerName === 'holoserve'
      ? process.env.HOLOSERVE_URL || process.env.HOLOSERVE_ENDPOINT
      : process.env.HOLOLLAMA_URL || process.env.HOLOLLAMA_ENDPOINT;
  return url?.replace(/\/+$/, '').replace(/\/v1$/, '');
}

/** One short GET of <base>/v1/models. Any failure (auth, 404, timeout) just omits the list. */
async function listModels(providerName: string): Promise<string[] | undefined> {
  const base = ownedBaseUrl(providerName);
  if (!base) return undefined;
  try {
    const res = await fetch(`${base}/v1/models`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { data?: Array<{ id?: unknown }> };
    if (!Array.isArray(data.data)) return undefined;
    return data.data.map((m) => m?.id).filter((id): id is string => typeof id === 'string');
  } catch {
    return undefined;
  }
}
