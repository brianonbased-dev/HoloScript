/**
 * MCP Premortem Handler
 *
 * LLM-backed pre-mortem engine for the holo_premortem MCP tool.
 * Wraps the /premortem skill protocol into a structured, programmatic interface.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { createProviderManager, type LLMProviderName, type MessageRole } from '@holoscript/llm-provider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PremortemFailureStory {
  name: string;
  whatHappened: string;
  why: string;
  whenWeKnew: string;
  whatItCost: string;
}

export interface PremortemEarlyWarningSign {
  signal: string;
  failure: string;
  threshold: string;
  checkFrequency: string;
}

export interface PremortemHiddenAssumption {
  assumption: string;
  whyHidden: string;
  cascadeIfWrong: string;
  howToVerify: string;
}

export interface PremortemIrreducibleRisk {
  risk: string;
  consequenceIfAccepted: string;
}

export interface PremortemResult {
  verdict: 'SOUND' | 'PROCEED_WITH_CAUTION' | 'RESTRUCTURE_REQUIRED' | 'FATAL_FLAW';
  summary: string;
  failureStories: {
    mostLikely: PremortemFailureStory;
    mostDangerous: PremortemFailureStory;
  };
  earlyWarningSigns: PremortemEarlyWarningSign[];
  hiddenAssumption: PremortemHiddenAssumption;
  revisedPlan: string;
  irreducibleRisks: PremortemIrreducibleRisk[];
  meta: {
    target: string;
    provider?: LLMProviderName;
    attemptedProviders: LLMProviderName[];
    rawOutput?: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUILTIN_TARGETS = new Set(['this']);

const AI_PROVIDER_PRIORITY: readonly LLMProviderName[] = [
  'anthropic',
  'openai',
  'gemini',
  'local-llm',
  'bitnet',
  'mock',
];

function getAIProviderOrder(registeredProviders: LLMProviderName[]): LLMProviderName[] {
  const forcedProvider = process.env.HOLOSCRIPT_MCP_AI_PROVIDER as LLMProviderName | undefined;

  if (forcedProvider && registeredProviders.includes(forcedProvider)) {
    return [
      forcedProvider,
      ...AI_PROVIDER_PRIORITY.filter(
        (provider) => provider !== forcedProvider && registeredProviders.includes(provider)
      ),
    ];
  }

  return AI_PROVIDER_PRIORITY.filter((provider) => registeredProviders.includes(provider));
}

// ---------------------------------------------------------------------------
// System Prompt — distilled from ~/.claude/skills/premortem/SKILL.md
// ---------------------------------------------------------------------------

const PREMORTEM_SYSTEM_PROMPT = `You are a battle-scarred engineer who has already watched this plan die.
You are not cautious. You are not a risk register. You are a coroner who examined the body and wrote the story of exactly how it happened — then came back in time to tell the planner.

**Your voice:** Specific. Concrete. Not theoretical. "Here is how it broke, here is what we saw before it broke, and here is the one thing we were wrong about that made all the difference."

**Your audience:** The person about to execute the plan. They don't need encouragement. They need to see the failure they're currently choosing.

## Core Rules

1. **You are writing failure stories, not risk lists.** Write the narrative of how the plan dies.
2. **Most likely ≠ most dangerous.** Surface both: the boring friction failure AND the silent catastrophic one.
3. **The hidden assumption is singular.** Find the ONE belief that, if wrong, collapses the entire plan.
4. **The revised plan closes gaps.** Restructure so the identified failure modes can't happen. If you can't, say so explicitly.
5. **No silver linings.** Don't reassure. If the plan is sound, the absence of fatal findings proves it.
6. **Ground in evidence.** Cite files, commits, metrics, or specific technical details where possible.

## Output Format — You MUST return ONLY valid JSON. No markdown, no prose outside the JSON.

{
  "verdict": "SOUND" | "PROCEED_WITH_CAUTION" | "RESTRUCTURE_REQUIRED" | "FATAL_FLAW",
  "summary": "One brutally honest sentence summarizing the overall assessment.",
  "failureStories": {
    "mostLikely": {
      "name": "Short name for the failure",
      "whatHappened": "2-3 sentences telling the story of how it broke",
      "why": "Root cause — one sentence",
      "whenWeKnew": "The signal that was visible before it broke",
      "whatItCost": "Quantified impact — time, money, trust, users, momentum"
    },
    "mostDangerous": {
      "name": "Short name for the silent failure",
      "whatHappened": "2-3 sentences telling the story of how it broke silently",
      "why": "Root cause — one sentence",
      "whenWeKnew": "The signal that was visible before it broke, or 'We didn't — that's what made it dangerous'",
      "whatItCost": "Quantified impact — usually larger than the most likely failure"
    }
  },
  "earlyWarningSigns": [
    { "signal": "Concrete observable", "failure": "Which failure it precedes", "threshold": "When to act", "checkFrequency": "How often to check" }
  ],
  "hiddenAssumption": {
    "assumption": "One sentence stating the belief",
    "whyHidden": "Why smart people don't question it",
    "cascadeIfWrong": "The cascade — not just 'the plan fails' but how it fails",
    "howToVerify": "One concrete test you could run RIGHT NOW to check"
  },
  "revisedPlan": "The plan rewritten with gaps closed. Structural changes, not bolted mitigations. If a failure mode is irreducible, say so explicitly.",
  "irreducibleRisks": [
    { "risk": "Failure mode that can't be closed by restructuring", "consequenceIfAccepted": "Specific consequence the executor must accept to proceed" }
  ]
}

VERDICT DEFINITIONS:
- SOUND: No fatal findings. The plan is genuinely solid.
- PROCEED_WITH_CAUTION: The plan works but has sharp edges that need monitoring.
- RESTRUCTURE_REQUIRED: The plan has fatal flaws that can be fixed with structural changes.
- FATAL_FLAW: The plan rests on a false assumption or an irreducible risk that makes it unviable.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function looksLikePath(str: string): boolean {
  return (
    /^[a-zA-Z]:[\\/]/.test(str) ||
    str.startsWith('/') ||
    str.startsWith('\\') ||
    str.startsWith('./') ||
    str.startsWith('../') ||
    str.startsWith('~/')
  );
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handlePremortemTool(args: Record<string, unknown>): Promise<PremortemResult> {
  const target = (args.target as string) ?? '';
  let content = (args.content as string) ?? '';
  const context = (args.context as string) ?? '';

  let resolvedTarget = target;

  // Resolve builtin target 'this'
  if (target.toLowerCase() === 'this') {
    const modeDirective = readModeDirective();
    if (modeDirective) {
      content = modeDirective;
      resolvedTarget = 'this:mode-directive';
    } else {
      // Fallback: use target as-is (will likely be short, but that's fine)
      content = target;
      resolvedTarget = 'this:unresolved';
    }
  } else if (!BUILTIN_TARGETS.has(target.toLowerCase())) {
    // Try reading as file path
    const maybePath = path.resolve(target);
    if (fs.existsSync(maybePath)) {
      try {
        content = fs.readFileSync(maybePath, 'utf-8');
        resolvedTarget = `file:${target}`;
      } catch {
        // leave content as-is if unreadable
      }
    } else if (looksLikePath(target)) {
      throw new Error(
        `holo_premortem: target "${target}" looks like a file path but no readable file was found.`
      );
    } else {
      // Not a file path — treat target as the plan text itself
      content = target;
      resolvedTarget = target;
    }
  }

  if (!content) {
    throw new Error(
      `holo_premortem: target "${target}" is not a builtin mode and no readable file was found, and no content was provided.`
    );
  }

  // Build user prompt
  const userPrompt = buildPremortemPrompt(resolvedTarget, content, context);

  // Call LLM
  const llmResult = await tryCompleteWithAI({
    messages: [
      { role: 'system', content: PREMORTEM_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 4096,
    temperature: 0.3,
  });

  // Parse structured output
  const parsed = parsePremortemOutput(llmResult.content);

  return {
    verdict: parsed.verdict,
    summary: parsed.summary,
    failureStories: parsed.failureStories,
    earlyWarningSigns: parsed.earlyWarningSigns,
    hiddenAssumption: parsed.hiddenAssumption,
    revisedPlan: parsed.revisedPlan,
    irreducibleRisks: parsed.irreducibleRisks,
    meta: {
      target: resolvedTarget,
      provider: llmResult.provider,
      attemptedProviders: llmResult.attemptedProviders,
      rawOutput: llmResult.content,
    },
  };
}

// ---------------------------------------------------------------------------
// Input resolution helpers
// ---------------------------------------------------------------------------

function readModeDirective(): string | undefined {
  const tmpDir = process.env.TMPDIR || process.env.TEMP || os.tmpdir();
  const modePath = path.join(tmpDir, 'holomesh-mode-directive.md');
  try {
    if (fs.existsSync(modePath)) {
      return fs.readFileSync(modePath, 'utf-8');
    }
  } catch {
    // ignore
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildPremortemPrompt(
  target: string,
  content: string,
  context: string
): string {
  const parts: string[] = [];

  parts.push(`PRE-MORTEM TARGET: ${target}`);

  if (context) {
    parts.push(`CONTEXT: ${context}`);
  }

  parts.push('');
  parts.push('--- PLAN TO PRE-MORTEM ---');
  parts.push(content);
  parts.push('--- END PLAN ---');

  parts.push('');
  parts.push(
    'Travel 6 months into the future. The plan above has been executed. It failed. ' +
      'Write the failure story, find the hidden assumption, and return the revised plan. ' +
      'Return ONLY valid JSON matching the schema in your system prompt.'
  );

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// LLM completion with fallback
// ---------------------------------------------------------------------------

async function tryCompleteWithAI(request: {
  messages: Array<{ role: MessageRole; content: string }>;
  maxTokens: number;
  temperature: number;
}): Promise<{ content: string; provider: LLMProviderName | undefined; attemptedProviders: LLMProviderName[] }> {
  let manager;

  try {
    manager = createProviderManager();
  } catch {
    return {
      content: JSON.stringify({
        verdict: 'FATAL_FLAW',
        summary: 'No LLM providers are configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or another supported provider.',
        failureStories: {
          mostLikely: {
            name: 'Missing LLM provider',
            whatHappened: 'The premortem tool was invoked but no LLM provider was available to analyze the plan.',
            why: 'No API keys or local LLM server configured.',
            whenWeKnew: 'At invocation time.',
            whatItCost: 'The pre-mortem analysis could not be performed.',
          },
          mostDangerous: {
            name: 'Blind execution',
            whatHappened: 'The plan proceeds without pre-mortem analysis because the tool cannot reach any LLM.',
            why: 'Infrastructure dependency on LLM provider was not verified before relying on the tool.',
            whenWeKnew: 'At invocation time.',
            whatItCost: 'Unknown risks in the plan remain unexamined.',
          },
        },
        earlyWarningSigns: [],
        hiddenAssumption: {
          assumption: 'The LLM provider is always available.',
          whyHidden: 'It usually works in development.',
          cascadeIfWrong: 'All LLM-backed tools fail silently or return degraded output.',
          howToVerify: 'Check that ANTHROPIC_API_KEY or OPENAI_API_KEY is set in the environment.',
        },
        revisedPlan: 'Configure an LLM provider before relying on holo_premortem.',
        irreducibleRisks: [],
      }),
      provider: undefined,
      attemptedProviders: [],
    };
  }

  const attemptedProviders: LLMProviderName[] = [];

  for (const providerName of getAIProviderOrder(manager.getRegisteredProviders())) {
    const provider = manager.getProvider(providerName);
    if (!provider) continue;

    attemptedProviders.push(providerName);

    try {
      const result = await provider.complete(request);
      return {
        content: result.content,
        provider: providerName,
        attemptedProviders: [...attemptedProviders],
      };
    } catch {
      // Fall through to next provider
    }
  }

  return {
    content: JSON.stringify({
      verdict: 'FATAL_FLAW',
      summary: `All LLM providers failed after trying ${attemptedProviders.join(', ')}.`,
      failureStories: {
        mostLikely: {
          name: 'LLM provider outage',
          whatHappened: 'Every configured LLM provider returned an error or timed out.',
          why: 'Network issues, API key exhaustion, or provider downtime.',
          whenWeKnew: 'At invocation time.',
          whatItCost: 'The pre-mortem analysis could not be performed.',
        },
        mostDangerous: {
          name: 'Cascading tool failure',
          whatHappened: 'If this tool fails, other LLM-backed tools may also be failing undetected.',
          why: 'Shared dependency on external LLM providers without circuit breakers.',
          whenWeKnew: 'At invocation time.',
          whatItCost: 'Degraded automation across the ecosystem.',
        },
      },
      earlyWarningSigns: [],
      hiddenAssumption: {
        assumption: 'At least one LLM provider is reachable.',
        whyHidden: 'It is usually true in normal operations.',
        cascadeIfWrong: 'All LLM-backed analysis tools return degraded output.',
        howToVerify: 'Run a health check on configured LLM providers before critical operations.',
      },
      revisedPlan: 'Add circuit breaker and fallback logic for LLM provider failures; consider local-llm as a backup.',
      irreducibleRisks: [],
    }),
    provider: undefined,
    attemptedProviders,
  };
}

// ---------------------------------------------------------------------------
// Output parser
// ---------------------------------------------------------------------------

function parsePremortemOutput(raw: string): Omit<PremortemResult, 'meta'> {
  // Try strict JSON extraction
  let jsonText = raw.trim();

  // Strip markdown fences if present
  const fenced = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) {
    jsonText = fenced[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonText);

    return {
      verdict: normalizeVerdict(parsed.verdict),
      summary: typeof parsed.summary === 'string' ? parsed.summary : 'No summary provided.',
      failureStories: normalizeFailureStories(parsed.failureStories),
      earlyWarningSigns: normalizeEarlyWarningSigns(parsed.earlyWarningSigns),
      hiddenAssumption: normalizeHiddenAssumption(parsed.hiddenAssumption),
      revisedPlan: typeof parsed.revisedPlan === 'string' ? parsed.revisedPlan : '',
      irreducibleRisks: normalizeIrreducibleRisks(parsed.irreducibleRisks),
    };
  } catch {
    // JSON parse failed — attempt heuristic extraction
    return heuristicParse(raw);
  }
}

function normalizeVerdict(v: unknown): PremortemResult['verdict'] {
  const s = String(v).toUpperCase().replace(/\s/g, '_');
  if (s === 'SOUND') return 'SOUND';
  if (s === 'PROCEED_WITH_CAUTION' || s === 'PROCEEDWITHCAUTION') return 'PROCEED_WITH_CAUTION';
  if (s === 'RESTRUCTURE_REQUIRED' || s === 'RESTRUCTUREREQUIRED') return 'RESTRUCTURE_REQUIRED';
  if (s === 'FATAL_FLAW' || s === 'FATALFLAW') return 'FATAL_FLAW';
  return 'PROCEED_WITH_CAUTION';
}

function normalizeFailureStories(v: unknown): PremortemResult['failureStories'] {
  const fallback = (name: string): PremortemFailureStory => ({
    name,
    whatHappened: 'No specific failure story was extracted.',
    why: 'The LLM output did not contain a structured failure story.',
    whenWeKnew: 'Unknown.',
    whatItCost: 'Unknown.',
  });

  if (!v || typeof v !== 'object') {
    return { mostLikely: fallback('Most likely failure'), mostDangerous: fallback('Most dangerous failure') };
  }

  const obj = v as Record<string, unknown>;
  return {
    mostLikely: normalizeFailureStory(obj.mostLikely, 'Most likely failure'),
    mostDangerous: normalizeFailureStory(obj.mostDangerous, 'Most dangerous failure'),
  };
}

function normalizeFailureStory(v: unknown, defaultName: string): PremortemFailureStory {
  if (!v || typeof v !== 'object') {
    return {
      name: defaultName,
      whatHappened: 'No specific failure story was extracted.',
      why: 'The LLM output did not contain a structured failure story.',
      whenWeKnew: 'Unknown.',
      whatItCost: 'Unknown.',
    };
  }
  const obj = v as Record<string, unknown>;
  return {
    name: String(obj.name ?? defaultName),
    whatHappened: String(obj.whatHappened ?? obj.what_happened ?? ''),
    why: String(obj.why ?? ''),
    whenWeKnew: String(obj.whenWeKnew ?? obj.when_we_knew ?? ''),
    whatItCost: String(obj.whatItCost ?? obj.what_it_cost ?? ''),
  };
}

function normalizeEarlyWarningSigns(v: unknown): PremortemEarlyWarningSign[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      return {
        signal: String(obj.signal ?? ''),
        failure: String(obj.failure ?? ''),
        threshold: String(obj.threshold ?? ''),
        checkFrequency: String(obj.checkFrequency ?? obj.check_frequency ?? ''),
      };
    })
    .filter((item): item is PremortemEarlyWarningSign => item !== null && item.signal.length > 0);
}

function normalizeHiddenAssumption(v: unknown): PremortemHiddenAssumption {
  if (!v || typeof v !== 'object') {
    return {
      assumption: 'No hidden assumption was identified.',
      whyHidden: 'The LLM output did not contain a structured hidden assumption.',
      cascadeIfWrong: 'Unknown.',
      howToVerify: 'Re-run the pre-mortem with a more detailed plan.',
    };
  }
  const obj = v as Record<string, unknown>;
  return {
    assumption: String(obj.assumption ?? ''),
    whyHidden: String(obj.whyHidden ?? obj.why_hidden ?? ''),
    cascadeIfWrong: String(obj.cascadeIfWrong ?? obj.cascade_if_wrong ?? ''),
    howToVerify: String(obj.howToVerify ?? obj.how_to_verify ?? ''),
  };
}

function normalizeIrreducibleRisks(v: unknown): PremortemIrreducibleRisk[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const obj = item as Record<string, unknown>;
      return {
        risk: String(obj.risk ?? ''),
        consequenceIfAccepted: String(obj.consequenceIfAccepted ?? obj.consequence_if_accepted ?? ''),
      };
    })
    .filter((item): item is PremortemIrreducibleRisk => item !== null && item.risk.length > 0);
}

function heuristicParse(raw: string): Omit<PremortemResult, 'meta'> {
  const fallback = (name: string): PremortemFailureStory => ({
    name,
    whatHappened: 'Heuristic parse — see raw output for full context.',
    why: 'Heuristic parse — see raw output for full context.',
    whenWeKnew: 'Heuristic parse — see raw output for full context.',
    whatItCost: 'Heuristic parse — see raw output for full context.',
  });

  // Extract verdict from markdown header
  const verdictMatch = raw.match(/VERDICT[:\s]+(SOUND|PROCEED WITH CAUTION|RESTRUCTURE REQUIRED|FATAL FLAW)/i);
  const verdict = verdictMatch ? normalizeVerdict(verdictMatch[1]) : 'PROCEED_WITH_CAUTION';

  // Summary
  const summaryMatch = raw.match(/##?\s*Summary[\s\S]*?(?=\n##?\s|$)/i);
  const summary = summaryMatch
    ? summaryMatch[0].replace(/##?\s*Summary\s*/i, '').trim()
    : 'Heuristic parse — see raw output for full pre-mortem.';

  return {
    verdict,
    summary,
    failureStories: {
      mostLikely: fallback('Most likely failure'),
      mostDangerous: fallback('Most dangerous failure'),
    },
    earlyWarningSigns: [],
    hiddenAssumption: {
      assumption: 'Heuristic parse — see raw output for full context.',
      whyHidden: 'Heuristic parse — see raw output for full context.',
      cascadeIfWrong: 'Heuristic parse — see raw output for full context.',
      howToVerify: 'Heuristic parse — see raw output for full context.',
    },
    revisedPlan: 'Heuristic parse — see raw output for full context.',
    irreducibleRisks: [],
  };
}
