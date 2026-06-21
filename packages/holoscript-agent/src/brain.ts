import { readFile } from 'node:fs/promises';
import type { OnTaskAction, RuntimeBrainConfig } from './types.js';

export async function loadBrain(
  brainPath: string,
  scopeTier: 'cold' | 'warm' | 'hot' = 'warm'
): Promise<RuntimeBrainConfig> {
  const raw = await readFile(brainPath, 'utf8');
  const { domain, capabilityTags, requires, prefers, avoids } = extractIdentity(raw);
  // For .hsplus brains: the file begins with a free-text instruction block
  // (the actual system prompt for the LLM) followed by HoloScript structured
  // sections (#version, #target, identity {}, state {}, etc.). Sending the
  // full file bloats the context by ~1500+ tokens of metadata the LLM does
  // not need and — on constrained-context local models (qwen3:4b, num_ctx=2048)
  // — causes the CRITICAL tool-calling rules to be truncated before the model
  // sees them, resulting in plain-text replies with no tool calls.
  // Extract only the preamble: everything before the first HoloScript directive.
  const systemPrompt = extractSystemPromptPreamble(raw);
  return {
    brainPath,
    systemPrompt,
    capabilityTags,
    domain,
    scopeTier,
    requires,
    prefers,
    avoids,
    reflect: extractReflect(raw),
    onTaskActions: extractOnTaskActions(raw),
  };
}

/**
 * Extract the brain's `reflect` cognitive verb (W.736) if it declares one, e.g.
 *   reflect { of: "the produced artifact", criteria: "valid HoloScript", escalate_on_fail: true }
 * Returns the evaluation criteria + whether a failed self-evaluation escalates to
 * the fleet (the `local_first` directive). Absent → undefined (no reflect gate).
 * Uses sliceNamedBlock so both `reflect {` and `reflect: {` forms parse, mirroring
 * identity. This is the one cognitive verb the lightweight runner can execute with
 * just its LLM provider (no engine/trait runtime) — recall/rag_query/plan need
 * trait-backed stores and run in the core/engine path, not here.
 */
function extractReflect(brain: string): { criteria: string; escalateOnFail: boolean } | undefined {
  const block = sliceNamedBlock(brain, 'reflect');
  if (block === undefined) return undefined;
  const criteria =
    scalarField(block, 'criteria') ??
    scalarField(block, 'scorer') ??
    scalarField(block, 'of') ??
    'correctness, completeness, and valid HoloScript syntax';
  const escRaw =
    scalarField(block, 'escalate_on_fail') ??
    scalarField(block, 'escalateOnFail') ??
    scalarField(block, 'escalate');
  // escRaw may be `true` or `true, nextField...` (unquoted scalar runs to the
  // segment end) — take the first comma-delimited token before comparing.
  return { criteria, escalateOnFail: (escRaw ?? '').split(',')[0].trim().toLowerCase() === 'true' };
}

/**
 * Extract the free-text instruction preamble from a .hsplus brain file.
 * Stops at the first line that begins a HoloScript structured section:
 * `#version`, `#target`, `#mode`, or a block keyword (`identity {`,
 * `state {`, `computed {`, `traits [`, `capabilities {`, `directives {`,
 * `behavior `). Falls back to the full file content for plain-text brains
 * (no HoloScript sections detected).
 */
function extractSystemPromptPreamble(src: string): string {
  const lines = src.split('\n');
  const BLOCK_START = /^(#version|#target|#mode|identity\s*\{|state\s*\{|computed\s*\{|traits\s*\[|capabilities\s*\{|directives\s*\{|behavior\s)/;
  let cutLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (BLOCK_START.test(lines[i].trim())) {
      cutLine = i;
      break;
    }
  }
  if (cutLine <= 0) return src; // no HoloScript sections — whole file is prompt
  return lines.slice(0, cutLine).join('\n').trimEnd();
}

function extractIdentity(brain: string): {
  domain: string;
  capabilityTags: string[];
  requires: string[];
  prefers: string[];
  avoids: string[];
} {
  const identityBlock = sliceNamedBlock(brain, 'identity');
  if (!identityBlock) {
    // No identity block — open routing (backward-compatible default).
    // Brains without explicit requires/prefers/avoids match any provider.
    return { domain: 'unknown', capabilityTags: [], requires: [], prefers: [], avoids: [] };
  }
  const domain = scalarField(identityBlock, 'domain') ?? 'unknown';
  const capabilityTags = listField(identityBlock, 'capability_tags') ?? [];
  // Universal+segregated routing fields (founder ruling 2026-05-06): brains
  // declare capability requirements as data; router matches against the
  // provider's `capabilities` manifest at session start. Empty (omitted) =
  // open routing — preserves today's behavior for unmigrated brains.
  const requires = listField(identityBlock, 'requires') ?? [];
  const prefers = listField(identityBlock, 'prefers') ?? [];
  const avoids = listField(identityBlock, 'avoids') ?? [];
  return { domain, capabilityTags, requires, prefers, avoids };
}

/**
 * Parse the `behavior on_task { … }` block into an ordered sequence of
 * cognitive verb calls (Phase 2.1). Each verb's config is extracted with a
 * lightweight regex KV parser — no full parser dependency. Only verbs whose
 * keys match known cognitive verbs are included; unknown keywords are skipped.
 *
 * Currently wired in AgentRunner: `llm_call` (prompt augmentation) and
 * `reflect` (extracted separately by extractReflect via sliceNamedBlock).
 * Future verbs (`recall`, `rag_query`, `plan`) are parsed so they appear in
 * the returned sequence but are logged-and-deferred by the runner until
 * Phase 2.2 (trait-backed stores, see idea-seeds.md).
 */
function extractOnTaskActions(brain: string): OnTaskAction[] {
  // `sliceNamedBlock` with 'on_task' matches `on_task {` inside `behavior on_task {`
  const block = sliceNamedBlock(brain, 'on_task');
  if (!block) return [];

  const VERBS: OnTaskAction['verb'][] = ['recall', 'rag_query', 'llm_call', 'plan', 'reflect', 'ask_peer'];
  const entries: Array<OnTaskAction & { _pos: number }> = [];

  for (const verb of VERBS) {
    const re = new RegExp(`\\b${verb}\\s*\\{`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(block)) !== null) {
      const start = m.index + m[0].length;
      let depth = 1;
      let end = -1;
      for (let i = start; i < block.length; i++) {
        if (block[i] === '{') depth++;
        else if (block[i] === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end < 0) continue;
      entries.push({ verb, config: parseKVBlock(block.slice(start, end)), _pos: m.index });
    }
  }

  // Sort by authored position so verbs execute in the order the brain declared them.
  return entries.sort((a, b) => a._pos - b._pos).map(({ _pos: _ignored, ...rest }) => rest);
}

/** Lightweight key-value extractor for cognitive verb config blocks. */
function parseKVBlock(block: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // String: key: "value"
  const strRe = /\b(\w+)\s*:\s*"([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = strRe.exec(block)) !== null) out[m[1]] = m[2];
  // Array: key: ["a", "b"] — must run before bool/num to claim the array form of limit etc.
  const arrRe = /\b(\w+)\s*:\s*\[([^\]]*)\]/g;
  while ((m = arrRe.exec(block)) !== null) {
    out[m[1]] = m[2]
      .split(',')
      .map((s) => s.trim().replace(/^["']|["']$/g, ''))
      .filter((s) => s.length > 0);
  }
  // Boolean: key: true | false (only when not already set by string/array)
  const boolRe = /\b(\w+)\s*:\s*(true|false)\b/g;
  while ((m = boolRe.exec(block)) !== null) {
    if (!(m[1] in out)) out[m[1]] = m[2] === 'true';
  }
  // Number: key: 123 or key: -0.5 (only when not already set)
  const numRe = /\b(\w+)\s*:\s*(-?\d+(?:\.\d+)?)\b/g;
  while ((m = numRe.exec(block)) !== null) {
    if (!(m[1] in out)) out[m[1]] = parseFloat(m[2]);
  }
  return out;
}

function sliceNamedBlock(src: string, name: string): string | undefined {
  // Accept both `identity {` and `identity: {` — brain compositions in
  // .ai-ecosystem use both forms (lean-theorist + antigravity-hot use the
  // colon variant; security-auditor + others use the bare form). Without
  // both-form tolerance the colon-form brains parse to empty
  // capability_tags, breaking task scoring entirely (silent claim-blackhole
  // observed 2026-04-25 on W01 H200 lean-theorist).
  const re = new RegExp(`\\b${name}\\s*:?\\s*\\{`, 'g');
  const match = re.exec(src);
  if (!match) return undefined;
  const headerEnd = match.index + match[0].length; // position just past the `{`
  let depth = 1;
  for (let i = headerEnd; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(headerEnd, i);
    }
  }
  return undefined;
}

function scalarField(block: string, key: string): string | undefined {
  const idx = block.indexOf(`${key}:`);
  if (idx < 0) return undefined;
  const after = block.slice(idx + key.length + 1).trimStart();
  if (after.startsWith('"')) {
    const end = after.indexOf('"', 1);
    if (end > 0) return after.slice(1, end);
  }
  const eol = after.indexOf('\n');
  return after.slice(0, eol < 0 ? undefined : eol).trim();
}

function listField(block: string, key: string): string[] | undefined {
  const idx = block.indexOf(`${key}:`);
  if (idx < 0) return undefined;
  const after = block.slice(idx + key.length + 1).trimStart();
  if (!after.startsWith('[')) return undefined;
  let depth = 0;
  let end = -1;
  for (let i = 0; i < after.length; i++) {
    if (after[i] === '[') depth++;
    else if (after[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return undefined;
  const inner = after.slice(1, end);
  return inner
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter((s) => s.length > 0);
}
