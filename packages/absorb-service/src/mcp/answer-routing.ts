/**
 * Answer-model routing for holo_ask_codebase.
 *
 * Founder (2026-10-05): the answer model runs on "whatever hardware the user has
 * registered through studio or holoshell and what they're willing to spend for
 * cloud agents if they don't have the hardware". No hard-wired address.
 *
 * Order tried, first answer wins:
 *   1. local-device — a registered device on this machine that is serving now
 *   2. fleet-device — a registered device on the owner's local network
 *   3. configured   — whatever the canonical resolver (resolveSovereignProviderAsync)
 *                     hands out under the spend consent the owner already configured:
 *                     the Vast serving fleet only with VAST_API_KEY, hosted / frontier
 *                     APIs only with HOLO_ALLOW_HOSTED_BRIDGE=1 / HOLO_ALLOW_FRONTIER_FALLBACK=1,
 *                     plus HOLOSERVE_URL / HOLOLLAMA_URL / HOLO_LLM_FLEET_BRAIN when set.
 *                     Its empty-config default (HoloLlama at 127.0.0.1:18080) is NOT
 *                     taken: that address is just a guess, and step 1 already probed
 *                     every registered device.
 *   4. nothing answered → the caller returns the extractive, retrieval-only answer.
 *
 * Every attempt is recorded so the response can say who answered and why the
 * earlier choices did not. Devices are only routed to — never started or stopped.
 */

import type { LLMProvider } from '../engine/GraphRAGEngine';
import { codeReadAllowed } from './code-read-access';

export type AnswerRouteKind =
  | 'explicit-endpoint'
  | 'explicit-provider'
  | 'local-device'
  | 'fleet-device'
  | 'configured'
  | 'paid'
  | 'retrieval-only';

/** Who produced the answer (or that nothing did). Safe to show: no secrets, no keys. */
export interface AnsweredBy {
  kind: AnswerRouteKind;
  /** Registry handle of the device, when a registered device answered. */
  device?: string;
  capability?: string;
  endpoint?: string;
  model?: string;
  /** Resolver provider name for the configured / paid step. */
  provider?: string;
  /** Resolver step label (native | vast-oss-coding | hosted-*). */
  step?: string;
  /** Plain-language one-liner. */
  summary: string;
}

export interface AnswerRouteAttempt {
  kind: AnswerRouteKind;
  target: string;
  outcome: 'answered' | 'failed' | 'skipped';
  reason?: string;
}

export interface RoutedAnswerProvider extends LLMProvider {
  /** Set after a successful complete(); null until then or when every route failed. */
  answeredBy(): AnsweredBy | null;
  attempts(): AnswerRouteAttempt[];
}

export interface RoutedAnswerOptions {
  /** Model override, passed to the configured/paid step only (a device serves its own model). */
  model?: string;
  /** BYOK Anthropic key for the resolver's gated frontier step. */
  anthropicKey?: string | null;
  /** Registry directory override (tests). */
  registryDir?: string;
  /** Device probe timeout. Default 1500 ms. */
  probeTimeoutMs?: number;
  /** Per-route completion timeout. Default 120 s. */
  completionTimeoutMs?: number;
}

const PAID_PROVIDERS = new Set(['fleet', 'cloud', 'anthropic', 'xai', 'openai', 'vast-oss-coding']);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '[endpoint]';
  }
}

function isLoopback(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host.startsWith('127.') || host === '[::1]';
  } catch {
    return false;
  }
}

/** True when the resolver landed on its empty-config HoloLlama guess, not on anything configured. */
function isEmptyConfigDefault(providerName: string): boolean {
  return (
    providerName === 'holollama' &&
    !process.env.HOLOLLAMA_URL?.trim() &&
    !process.env.HOLOLLAMA_ENDPOINT?.trim()
  );
}

export async function createRoutedAnswerProvider(
  options: RoutedAnswerOptions = {}
): Promise<RoutedAnswerProvider> {
  const llm = await import('@holoscript/llm-provider');
  const attempts: AnswerRouteAttempt[] = [];
  let answered: AnsweredBy | null = null;
  const completionTimeoutMs = options.completionTimeoutMs ?? 120_000;

  return {
    answeredBy: () => answered,
    attempts: () => [...attempts],
    async complete(request) {
      attempts.length = 0;
      answered = null;
      const messages = request.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }));

      // 1 + 2 — registered devices that are up, local before fleet.
      const probe = await llm.probeRegisteredInferenceDevices({
        registryDir: options.registryDir,
        timeoutMs: options.probeTimeoutMs ?? 1500,
      });
      for (const skip of probe.skipped) {
        attempts.push({
          kind: isLoopback(skip.endpoint) ? 'local-device' : 'fleet-device',
          target: `${skip.handle}/${skip.capabilityId}`,
          outcome: 'skipped',
          reason: skip.reason,
        });
      }
      for (const route of probe.routes) {
        const kind: AnswerRouteKind = route.tier === 'local' ? 'local-device' : 'fleet-device';
        const target = `${route.handle}/${route.capabilityId}`;
        try {
          const adapter = new llm.LocalLLMAdapter({
            baseURL: route.baseURL,
            model: route.model,
            nativeOllamaApi: false,
            timeoutMs: completionTimeoutMs,
            maxRetries: 0,
            // inferenceProxy left unset: the adapter sends the proxy bearer only to
            // the holo-inference-proxy port, never to other registered servers.
          });
          const response = await adapter.complete({ messages }, route.model);
          attempts.push({ kind, target, outcome: 'answered' });
          answered = {
            kind,
            device: route.handle,
            provider: route.backend === 'pytorch-holo' ? 'holoserve' : 'holollama',
            capability: route.capabilityId,
            endpoint: redactUrl(route.baseURL),
            model: route.model,
            summary:
              `Answered by ${route.model} on your registered device "${route.handle}"` +
              (route.tier === 'local' ? ' (this computer).' : ' (on your local network).'),
          };
          return { content: response.content };
        } catch (err) {
          attempts.push({ kind, target, outcome: 'failed', reason: errorMessage(err) });
        }
      }

      // 3 — the canonical resolver under the owner's configured spend consent.
      // Only for the server's own operator (the callers allowed to read code:
      // stdio, loopback local custody, admin). Its consent is server-wide env,
      // so on a hosted server any tenant would otherwise spend the operator's
      // paid routes, and a Vast route probe bumps demand even when nothing
      // answers (claude4's review, 2026-10-08).
      if (!codeReadAllowed()) {
        attempts.push({
          kind: 'paid',
          target: 'resolver',
          outcome: 'skipped',
          reason: "the server's configured and paid routes answer only its operator",
        });
        throw new Error(`no answer model reachable — ${describeAttempts(attempts)}`);
      }
      try {
        const resolved = await llm.resolveSovereignProviderAsync({
          caller: 'holo_ask_codebase',
          anthropicKey: options.anthropicKey ?? null,
          model: options.model,
          timeoutMs: completionTimeoutMs,
          maxRetries: 0,
        });
        if (isEmptyConfigDefault(resolved.providerName)) {
          attempts.push({
            kind: 'paid',
            target: 'resolver',
            outcome: 'skipped',
            reason:
              'no paid route is configured (no VAST_API_KEY, and hosted/frontier opt-in is off)',
          });
        } else {
          const paid =
            PAID_PROVIDERS.has(resolved.providerName) ||
            (resolved.step !== undefined && resolved.step.startsWith('hosted-'));
          const kind: AnswerRouteKind = paid ? 'paid' : 'configured';
          const target = resolved.providerName;
          try {
            const response = await resolved.provider.complete(
              { messages, maxTokens: resolved.maxTokens },
              resolved.model
            );
            attempts.push({ kind, target, outcome: 'answered' });
            answered = {
              kind,
              provider: resolved.providerName,
              model: resolved.model,
              ...(resolved.step ? { step: resolved.step } : {}),
              summary: paid
                ? `Answered by ${resolved.model} through ${resolved.providerName}, a paid route the server's operator allowed.`
                : `Answered by ${resolved.model} through ${resolved.providerName}, as configured.`,
            };
            return { content: response.content };
          } catch (err) {
            attempts.push({ kind, target, outcome: 'failed', reason: errorMessage(err) });
          }
        }
      } catch (err) {
        attempts.push({
          kind: 'paid',
          target: 'resolver',
          outcome: 'skipped',
          reason: errorMessage(err),
        });
      }

      throw new Error(`no answer model reachable — ${describeAttempts(attempts)}`);
    },
  };
}

/** One line naming each route and what happened, for the retrieval-only fallbackReason. */
export function describeAttempts(attempts: AnswerRouteAttempt[]): string {
  if (attempts.length === 0) return 'no registered device serves a text model';
  return attempts
    .map((a) => `${a.target}: ${a.outcome}${a.reason ? ` (${a.reason})` : ''}`)
    .join('; ');
}
