/**
 * MCP Critic Handler
 *
 * LLM-backed critique engine for the holo_critic MCP tool.
 * Wraps the /critic skill protocol into a structured, programmatic interface.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createProviderManager, type LLMProviderName } from '@holoscript/llm-provider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CriticInput {
  target: string;
  content?: string;
  mode?: 'code' | 'pitch' | 'full';
  context?: string;
}

export interface CriticFinding {
  category: 'Critical' | 'Serious' | 'Annoying' | 'Nitpick';
  issue: string;
  why: string;
  fix: string;
  evidence?: string;
}

export interface CriticPitchLine {
  lineOrClaim: string;
  challenge: string;
  betterVersion: string;
}

export interface CriticPitchClaim {
  claim: string;
  whatsMissing: string;
  howToProve: string;
}

export interface CriticResult {
  verdict: 'NOT_READY' | 'FRAGILE' | 'ADEQUATE' | 'WOULD_LAND';
  summary: string;
  findings: CriticFinding[];
  pitchExtras?: {
    linesThatWillGetChallenged?: CriticPitchLine[];
    claimsWithoutEvidence?: CriticPitchClaim[];
    skepticView?: string;
    whatWouldMakeItUndeniable?: string[];
  };
  meta: {
    target: string;
    mode: string;
    provider?: LLMProviderName;
    attemptedProviders: LLMProviderName[];
    rawOutput?: string;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUILTIN_TARGETS = new Set([
  'file',
  'pitch',
  'demo',
  'architecture',
  'tests',
  'docs',
  'studio',
  'absorb',
  'holomesh',
  'infra',
  'full',
  'code',
]);

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
// System Prompt — distilled from ~/.claude/skills/critic/SKILL.md
// ---------------------------------------------------------------------------

const CRITIC_SYSTEM_PROMPT = `You are the harshest, most honest critic in the HoloScript ecosystem.
Your job is to find everything that's not good enough and document exactly how it could be better.
You are not mean — you are precise. You don't insult — you diagnose.
You never soften the truth and you never offer encouragement.

RULES:
1. Never say "good job", "this is solid", or "nice work". If something is adequate, skip it. Only speak when something falls short.
2. Every criticism must have three parts:
   - What's wrong — specific, with evidence (file path, line number, metric, or quote)
   - Why it matters — who gets hurt, what breaks, what impression it gives
   - What good looks like — a concrete, actionable description of the fix. Not vague. Not "improve this". Exact.
3. Grade on an absolute scale, not relative. The question is: would this survive contact with a paying customer, a skeptical investor, a tenured professor, or a competing product?
4. Assume the audience is hostile. Every claim will be challenged. Every demo will fail at the worst moment. Every doc will be read by someone looking for reasons to say no.
5. Prioritize by embarrassment risk. What would make the founder look foolish on stage? What would make an investor close their laptop? What would make a professor say "this isn't ready"? Those come first.

OUTPUT FORMAT — You MUST return ONLY valid JSON. No markdown, no prose outside the JSON.

{
  "verdict": "NOT_READY" | "FRAGILE" | "ADEQUATE" | "WOULD_LAND",
  "summary": "One brutally honest sentence summarizing the overall assessment.",
  "findings": [
    {
      "category": "Critical" | "Serious" | "Annoying" | "Nitpick",
      "issue": "What's wrong — specific with evidence",
      "why": "Why it matters",
      "fix": "What good looks like — concrete and actionable",
      "evidence": "Optional: file:line or direct quote"
    }
  ]
}

For pitch mode, ALSO include these keys at the top level (sibling to verdict/summary/findings):
  "linesThatWillGetChallenged": [ { "lineOrClaim": "...", "challenge": "...", "betterVersion": "..." } ],
  "claimsWithoutEvidence": [ { "claim": "...", "whatsMissing": "...", "howToProve": "..." } ],
  "skepticView": "3-5 sentences from the perspective of the most skeptical person in the room",
  "whatWouldMakeItUndeniable": [ "specific, actionable list items" ]

VERDICT DEFINITIONS:
- NOT_READY: Would embarrass you if shown to the target audience today.
- FRAGILE: Would survive a polite review but collapses under scrutiny.
- ADEQUATE: Meets the bar. Not exciting, not embarrassing.
- WOULD_LAND: A skeptical investor would write a check, a professor would stake their curriculum on it, a customer would pay.

If there are no issues in a category, omit that category entirely rather than including empty arrays.`;

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handleCriticTool(args: Record<string, unknown>): Promise<CriticResult> {
  const target = (args.target as string) ?? '';
  let content = (args.content as string) ?? '';
  const mode = ((args.mode as string) ?? 'code') as 'code' | 'pitch' | 'full';
  const context = (args.context as string) ?? '';

  // If target looks like a file path and is not a builtin mode, read the file
  let resolvedTarget = target;
  if (!BUILTIN_TARGETS.has(target.toLowerCase())) {
    const maybePath = path.resolve(target);
    if (fs.existsSync(maybePath)) {
      try {
        content = fs.readFileSync(maybePath, 'utf-8');
        resolvedTarget = `file:${target}`;
      } catch {
        // leave content as-is if unreadable
      }
    }
  }

  if (!content && !BUILTIN_TARGETS.has(target.toLowerCase())) {
    throw new Error(
      `holo_critic: target "${target}" is not a builtin mode and no readable file was found, and no content was provided.`
    );
  }

  // Build user prompt
  const userPrompt = buildCriticPrompt(resolvedTarget, content, mode, context);

  // Call LLM
  const llmResult = await tryCompleteWithAI({
    messages: [
      { role: 'system', content: CRITIC_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    maxTokens: 4096,
    temperature: 0.3,
  });

  // Parse structured output
  const parsed = parseCriticOutput(llmResult.content);

  return {
    verdict: parsed.verdict,
    summary: parsed.summary,
    findings: parsed.findings,
    pitchExtras: parsed.pitchExtras,
    meta: {
      target: resolvedTarget,
      mode,
      provider: llmResult.provider,
      attemptedProviders: llmResult.attemptedProviders,
      rawOutput: llmResult.content,
    },
  };
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildCriticPrompt(
  target: string,
  content: string,
  mode: 'code' | 'pitch' | 'full',
  context: string
): string {
  const parts: string[] = [];

  parts.push(`CRITIQUE TARGET: ${target}`);

  if (context) {
    parts.push(`CONTEXT: ${context}`);
  }

  // Determine output mode instruction
  if (mode === 'pitch') {
    parts.push('MODE: pitch');
    parts.push(
      'Return the pitch critique format: VERDICT + findings + linesThatWillGetChallenged + claimsWithoutEvidence + skepticView + whatWouldMakeItUndeniable.'
    );
  } else if (mode === 'full') {
    parts.push('MODE: full');
    parts.push(
      'Return the union of code critique AND pitch critique formats. Be exhaustive.'
    );
  } else {
    parts.push('MODE: code');
    parts.push('Return the code/architecture critique format: VERDICT + findings only.');
  }

  if (content) {
    parts.push('');
    parts.push('--- CONTENT TO CRITIQUE ---');
    parts.push(content);
    parts.push('--- END CONTENT ---');
  } else {
    parts.push('');
    parts.push(
      `No specific content provided. Critique the general state of "${target}" in the HoloScript ecosystem based on your knowledge.`
    );
  }

  parts.push('');
  parts.push('Remember: return ONLY valid JSON matching the schema in your system prompt.');

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// LLM completion with fallback
// ---------------------------------------------------------------------------

async function tryCompleteWithAI(request: {
  messages: Array<{ role: string; content: string }>;
  maxTokens: number;
  temperature: number;
}): Promise<{ content: string; provider: LLMProviderName | undefined; attemptedProviders: LLMProviderName[] }> {
  let manager;

  try {
    manager = createProviderManager();
  } catch {
    return {
      content: JSON.stringify({
        verdict: 'NOT_READY',
        summary: 'No LLM providers are configured. Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or another supported provider.',
        findings: [
          {
            category: 'Critical',
            issue: 'holo_critic requires a configured LLM provider.',
            why: 'The critic tool is LLM-backed and cannot run without an API key.',
            fix: 'Set ANTHROPIC_API_KEY or OPENAI_API_KEY in the environment, or start a local LLM server.',
          },
        ],
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
      const result = await provider.complete(request as import('@holoscript/llm-provider').LLMCompletionRequest);
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
      verdict: 'NOT_READY',
      summary: `All LLM providers failed after trying ${attemptedProviders.join(', ')}.`,
      findings: [
        {
          category: 'Critical',
          issue: 'holo_critic could not reach any LLM provider.',
          why: 'Every registered provider returned an error or is misconfigured.',
          fix: 'Check API keys, network connectivity, and provider status.',
        },
      ],
    }),
    provider: undefined,
    attemptedProviders,
  };
}

// ---------------------------------------------------------------------------
// Output parser
// ---------------------------------------------------------------------------

function parseCriticOutput(raw: string): {
  verdict: CriticResult['verdict'];
  summary: string;
  findings: CriticFinding[];
  pitchExtras?: CriticResult['pitchExtras'];
} {
  const fallback: CriticResult['verdict'] = 'NOT_READY';

  // Try strict JSON extraction
  let jsonText = raw.trim();

  // Strip markdown fences if present
  const fenced = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (fenced) {
    jsonText = fenced[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonText);

    const verdict = normalizeVerdict(parsed.verdict);
    const summary = typeof parsed.summary === 'string' ? parsed.summary : 'No summary provided.';
    const findings = Array.isArray(parsed.findings)
      ? parsed.findings.map(normalizeFinding).filter(Boolean) as CriticFinding[]
      : [];

    const pitchExtras: CriticResult['pitchExtras'] = {};

    if (Array.isArray(parsed.linesThatWillGetChallenged)) {
      pitchExtras.linesThatWillGetChallenged = parsed.linesThatWillGetChallenged
        .map((l: any) => ({
          lineOrClaim: String(l.lineOrClaim ?? l.line ?? ''),
          challenge: String(l.challenge ?? ''),
          betterVersion: String(l.betterVersion ?? l.better ?? ''),
        }))
        .filter((l: any) => l.lineOrClaim);
    }

    if (Array.isArray(parsed.claimsWithoutEvidence)) {
      pitchExtras.claimsWithoutEvidence = parsed.claimsWithoutEvidence
        .map((c: any) => ({
          claim: String(c.claim ?? ''),
          whatsMissing: String(c.whatsMissing ?? c.whats_missing ?? ''),
          howToProve: String(c.howToProve ?? c.how_to_prove ?? ''),
        }))
        .filter((c: any) => c.claim);
    }

    if (typeof parsed.skepticView === 'string' && parsed.skepticView.trim()) {
      pitchExtras.skepticView = parsed.skepticView.trim();
    }

    if (Array.isArray(parsed.whatWouldMakeItUndeniable)) {
      pitchExtras.whatWouldMakeItUndeniable = parsed.whatWouldMakeItUndeniable
        .map(String)
        .filter(Boolean);
    }

    return {
      verdict,
      summary,
      findings,
      ...(Object.keys(pitchExtras).length > 0 ? { pitchExtras } : {}),
    };
  } catch {
    // JSON parse failed — attempt heuristic extraction
    return heuristicParse(raw, fallback);
  }
}

function normalizeVerdict(v: unknown): CriticResult['verdict'] {
  const s = String(v).toUpperCase().replace(/\s/g, '_');
  if (s.includes('NOT_READY') || s === 'NOTREADY') return 'NOT_READY';
  if (s === 'FRAGILE') return 'FRAGILE';
  if (s === 'ADEQUATE') return 'ADEQUATE';
  if (s === 'WOULD_LAND' || s === 'WOULDLAND') return 'WOULD_LAND';
  return 'NOT_READY';
}

function normalizeFinding(f: unknown): CriticFinding | null {
  if (!f || typeof f !== 'object') return null;
  const obj = f as Record<string, unknown>;

  const category = normalizeCategory(obj.category);
  const issue = String(obj.issue ?? obj.Issue ?? '');
  const why = String(obj.why ?? obj.Why ?? '');
  const fix = String(obj.fix ?? obj.Fix ?? '');
  const evidence = String(obj.evidence ?? obj.Evidence ?? '');

  if (!issue) return null;

  return {
    category,
    issue,
    why,
    fix,
    ...(evidence ? { evidence } : {}),
  };
}

function normalizeCategory(c: unknown): CriticFinding['category'] {
  const s = String(c).toLowerCase();
  if (s.includes('critical')) return 'Critical';
  if (s.includes('serious')) return 'Serious';
  if (s.includes('annoy')) return 'Annoying';
  if (s.includes('nit')) return 'Nitpick';
  return 'Annoying';
}

function heuristicParse(
  raw: string,
  fallbackVerdict: CriticResult['verdict']
): {
  verdict: CriticResult['verdict'];
  summary: string;
  findings: CriticFinding[];
} {
  const findings: CriticFinding[] = [];

  // Extract verdict from markdown header
  const verdictMatch = raw.match(/VERDICT[:\s]+(NOT READY|FRAGILE|ADEQUATE|WOULD LAND|WOULDN'T SHIP)/i);
  const verdict = verdictMatch ? normalizeVerdict(verdictMatch[1]) : fallbackVerdict;

  // Extract findings from markdown sections
  const sections = [
    { pattern: /###?\s*Critical[\s\S]*?(?=###?\s*(Serious|Annoying|Nitpick|Lines that|Claims|What a skeptic|What would|$))/i, category: 'Critical' as const },
    { pattern: /###?\s*Serious[\s\S]*?(?=###?\s*(Critical|Annoying|Nitpick|Lines that|Claims|What a skeptic|What would|$))/i, category: 'Serious' as const },
    { pattern: /###?\s*Annoying[\s\S]*?(?=###?\s*(Critical|Serious|Nitpick|Lines that|Claims|What a skeptic|What would|$))/i, category: 'Annoying' as const },
    { pattern: /###?\s*Nitpick[\s\S]*?(?=###?\s*(Critical|Serious|Annoying|Lines that|Claims|What a skeptic|What would|$))/i, category: 'Nitpick' as const },
  ];

  for (const section of sections) {
    const match = raw.match(section.pattern);
    if (match) {
      const lines = match[0].split('\n');
      for (const line of lines) {
        const issueMatch = line.match(/^\s*\d+\.\s*\*\*([^*]+)\*\*/);
        if (issueMatch) {
          findings.push({
            category: section.category,
            issue: issueMatch[1].trim(),
            why: 'Extracted from heuristic parse — see raw output for full context.',
            fix: 'See raw output for full context.',
          });
        }
      }
    }
  }

  // Summary
  const summaryMatch = raw.match(/##?\s*Summary[\s\S]*?(?=\n##?\s|$)/i);
  const summary = summaryMatch
    ? summaryMatch[0].replace(/##?\s*Summary\s*/i, '').trim()
    : 'Heuristic parse — see raw output for full critique.';

  return { verdict, summary, findings };
}
