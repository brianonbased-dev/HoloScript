export type DaemonProvider = 'anthropic' | 'xai' | 'openai' | 'ollama';
export type DaemonToolProfile = 'claude-hsplus' | 'grok-hsplus' | 'standard';

export interface DaemonPromptContext {
  provider: DaemonProvider;
  toolProfile: DaemonToolProfile;
  modelStyleGuide: string;
  toolGuide: string;
}

export type DaemonPromptAction = 'coverage' | 'docs' | 'typefix';

const HOLOSCRIPT_IDENTITY = [
  'HoloScript is an AI-native declarative semantic specification language.',
  'Core model: entities + composable traits (2,000+ across many categories).',
  'Formats: .holo (scene), .hs (behavior), .hsplus (typed logic).',
  'Compiler model: deterministic parser -> AST -> validator -> target output.',
].join(' ');

const HOLOSCRIPT_WISDOM = [
  'Traits declare WHAT; compilers decide HOW per target.',
  'Everything is an entity; avoid artificial frontend/backend splits in reasoning.',
  'Prefer semantic intent over syntax tricks; preserve declarative composition boundaries.',
].join(' ');

const HOLOSCRIPT_GOTCHAS = [
  'Target capabilities vary; keep fixes portable unless target constraints are explicit.',
  'Avoid invalid trait combinations and hidden imperative rewrites.',
  'When uncertain, choose minimally invasive edits and preserve compile determinism.',
].join(' ');

function modelStyleGuideFor(provider: DaemonProvider): string {
  switch (provider) {
    case 'xai':
      return [
        'Model profile: xAI Grok.',
        'Prefer compact, explicit .hsplus-compatible edits and deterministic patching.',
        'Avoid speculative refactors; preserve trait semantics exactly.',
      ].join(' ');
    case 'openai':
      return [
        'Model profile: OpenAI chat model.',
        'Prefer strict JSON patch output and minimal textual variation for repeatability.',
      ].join(' ');
    case 'ollama':
      return [
        'Model profile: local Ollama model.',
        'Keep patches conservative and simple to maximize local model reliability.',
      ].join(' ');
    case 'anthropic':
    default:
      return [
        'Model profile: Anthropic Claude.',
        'Use high-precision reasoning but return only constrained, minimal edits.',
      ].join(' ');
  }
}

function toolGuideFor(toolProfile: DaemonToolProfile): string {
  if (toolProfile === 'grok-hsplus') {
    return [
      'Tool profile: grok-hsplus.',
      'Assume downstream tooling prefers explicit command primitives (rg, pnpm, tsc, vitest) and deterministic JSON patch output.',
      'When proposing changes, favor compact .hsplus-compatible patterns and avoid hidden abstractions.',
    ].join(' ');
  }

  if (toolProfile === 'claude-hsplus') {
    return [
      'Tool profile: claude-hsplus.',
      'Assume downstream tooling favors semantic precision and conservative edits with strong type-context awareness.',
      'When proposing changes, preserve readability and explicit trait semantics in .hsplus.',
    ].join(' ');
  }

  return [
    'Tool profile: standard.',
    'Use portable, provider-agnostic fixes and strict JSON patch format.',
  ].join(' ');
}

export function buildDaemonPromptContext(
  provider: DaemonProvider = 'anthropic',
  toolProfile: DaemonToolProfile = 'standard'
): DaemonPromptContext {
  return {
    provider,
    toolProfile,
    modelStyleGuide: modelStyleGuideFor(provider),
    toolGuide: toolGuideFor(toolProfile),
  };
}

export function getDaemonSystemPrompt(
  action: DaemonPromptAction,
  context: DaemonPromptContext
): string {
  const { modelStyleGuide, toolGuide, toolProfile } = context;
  const repoContext = [HOLOSCRIPT_IDENTITY, HOLOSCRIPT_WISDOM, HOLOSCRIPT_GOTCHAS].join(' ');

  if (action === 'coverage') {
    const profileAddendum =
      toolProfile === 'grok-hsplus'
        ? 'Prefer table-driven tests and explicit assertion blocks.'
        : toolProfile === 'claude-hsplus'
          ? 'Prefer intention-revealing test names and clear fixture setup.'
          : 'Prefer deterministic tests with minimal fixture noise.';

    return [
      'You are a TypeScript testing expert. Generate a comprehensive test file for the given source.',
      repoContext,
      modelStyleGuide,
      toolGuide,
      profileAddendum,
      'Use vitest (import { describe, it, expect, vi } from "vitest").',
      'Mock external dependencies with vi.mock(). Test exported functions and classes.',
      'Return ONLY the complete test file content. No markdown fences, no explanations.',
    ].join(' ');
  }

  if (action === 'docs') {
    const profileAddendum =
      toolProfile === 'grok-hsplus'
        ? 'Keep comments concise and operational; avoid narrative prose.'
        : toolProfile === 'claude-hsplus'
          ? 'Use clear intent-focused explanations and precise terminology.'
          : 'Keep comments practical and concise.';

    return [
      'You are a TypeScript documentation expert. Add JSDoc comments to all exported symbols.',
      repoContext,
      modelStyleGuide,
      toolGuide,
      profileAddendum,
      'Include @param, @returns, @throws, and @example where appropriate.',
      'Return ONLY the complete file content with added JSDoc. No markdown fences, no explanations.',
      'Do NOT change any code logic — only add documentation comments.',
    ].join(' ');
  }

  const typefixAddendum =
    toolProfile === 'grok-hsplus'
      ? 'Prefer low-ceremony fixes and direct substitutions that preserve compile determinism.'
      : toolProfile === 'claude-hsplus'
        ? 'Prefer semantically precise type repairs with explicit reasoning and minimal surface change.'
        : 'Prefer conservative, compile-safe type repairs.';

  return [
    'You are a TypeScript expert fixing type errors in a large monorepo.',
    'This is HoloScript — a DSL for VR/AR with traits, compilers, and parsers.',
    repoContext,
    modelStyleGuide,
    toolGuide,
    typefixAddendum,
    '',
    'RULES — violations cause automatic rejection:',
    '1. NEVER delete functions, classes, or code blocks to eliminate errors',
    '2. NEVER use "as any" — use proper type annotations instead',
    '3. NEVER remove or change export statements',
    '4. NEVER restructure, refactor, or rename anything',
    '5. Each patch "old" field must match the file EXACTLY (including whitespace/indentation)',
    '6. Keep patches minimal — change only what fixes the specific type error',
    '',
    'Think through each error: what type is expected vs actual? What is the minimal fix?',
    'Common fixes: add missing type annotations, fix import paths, add missing properties,',
    'update generic parameters, add null checks, fix return types.',
    '',
    'Respond with ONLY valid JSON (no markdown fences):',
    '{',
    '  "analysis": "Brief reasoning about each error and your fix strategy",',
    '  "patches": [',
    '    { "old": "exact text to find in file", "new": "replacement text" }',
    '  ]',
    '}',
    '',
    'If you cannot fix an error safely, omit it and explain in analysis.',
    'If no errors can be fixed safely, return: {"analysis": "...", "patches": []}',
  ].join('\n');
}
