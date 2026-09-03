import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import type { FrameDeclarationContract, FrameTier } from '@holoscript/agent-protocol';
import type { OnTaskAction, RuntimeBrainConfig } from './types.js';

/**
 * `@posture "./relative/path"` — pull shared operating posture into a brain's
 * system prompt.
 *
 * Why this exists: doctrine reached the markdown agent families through one
 * shared file plus a pointer per family contract, and reached the sovereign
 * fleet not at all — 44 `.hsplus` brains, none of them carrying shared posture,
 * because a brain is a single self-contained file with no way to reference one.
 * Copying posture into every brain is the alternative, and it is worse: N copies
 * that drift apart and go stale together.
 *
 * Deliberately NOT `@import`. That directive already exists in the `.hsplus`
 * grammar for TypeScript companion modules, is gated behind
 * `enableTypeScriptImports`, and is never resolved on this runtime path. Reusing
 * its spelling for a different meaning would make a brain that looks resolved
 * but is not.
 *
 * The line must sit in the preamble — the free text before the first HoloScript
 * block — because that is the part that becomes the system prompt. Each
 * directive is replaced in place by the referenced file's text, so posture lands
 * exactly where the brain author put it rather than always at the top.
 */
const POSTURE_DIRECTIVE = /^@posture\s+["']([^"']+)["']\s*$/;
const MAX_POSTURE_DEPTH = 4;

/**
 * Resolve `@posture` directives inside an already-extracted preamble.
 *
 * Throws rather than degrading. A declared-but-unresolvable posture is an
 * operator saying "this seat needs this posture" and the runtime silently
 * booting without it — the exact silent-inert failure this feature exists to
 * end. A brain with no directive is untouched and cannot fail here.
 */
async function resolveSharedPosture(
  preamble: string,
  sourcePath: string,
  seen: readonly string[] = [],
  depth = 0
): Promise<string> {
  if (!POSTURE_DIRECTIVE.test(preamble) && !preamble.includes('@posture')) return preamble;
  if (depth > MAX_POSTURE_DEPTH) {
    throw new Error(
      `[brain] @posture nesting deeper than ${MAX_POSTURE_DEPTH} levels, starting at ${seen[0] ?? sourcePath}`
    );
  }

  const lines = preamble.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const match = POSTURE_DIRECTIVE.exec(line.trim());
    if (!match) {
      out.push(line);
      continue;
    }
    const ref = match[1];
    if (isAbsolute(ref)) {
      throw new Error(
        `[brain] @posture "${ref}" in ${sourcePath} must be a relative path — absolute paths are not portable across seats.`
      );
    }
    const target = resolvePath(dirname(sourcePath), ref);
    if (seen.includes(target)) {
      throw new Error(
        `[brain] @posture cycle: ${[...seen, target].join(' -> ')}`
      );
    }
    let text: string;
    try {
      text = await readFile(target, 'utf8');
    } catch (cause) {
      const why = cause instanceof Error ? cause.message : String(cause);
      throw new Error(
        `[brain] @posture "${ref}" in ${sourcePath} does not resolve (looked at ${target}). ` +
          `A seat must not boot without posture it declared. Cause: ${why}`
      );
    }
    out.push(await resolveSharedPosture(text.trimEnd(), target, [...seen, target], depth + 1));
  }
  return out.join('\n');
}

export async function loadBrain(
  brainPath: string,
  scopeTier: 'cold' | 'warm' | 'hot' = 'warm'
): Promise<RuntimeBrainConfig> {
  const raw = await readFile(brainPath, 'utf8');
  const document = adaptRuntimeBrainDocument(raw);
  // For .hsplus brains: the file begins with a free-text instruction block
  // (the actual system prompt for the LLM) followed by HoloScript structured
  // sections (#version, #target, identity {}, state {}, etc.). Sending the
  // full file bloats the context by ~1500+ tokens of metadata the LLM does
  // not need and — on constrained-context local models (qwen3:4b, num_ctx=2048)
  // — causes the CRITICAL tool-calling rules to be truncated before the model
  // sees them, resulting in plain-text replies with no tool calls.
  // Extract only the preamble: everything before the first HoloScript directive.
  // Then resolve any `@posture` include so shared operating posture reaches the
  // live system prompt instead of sitting in a file no seat ever loads.
  const systemPrompt = await resolveSharedPosture(extractSystemPromptPreamble(raw), brainPath);
  return {
    brainPath,
    systemPrompt,
    capabilityTags: document.identity.capabilityTags,
    domain: document.identity.domain,
    scopeTier,
    frameDeclaration: extractFrameDeclaration(raw),
    requires: document.identity.requires,
    prefers: document.identity.prefers,
    avoids: document.identity.avoids,
    reflect: extractReflect(raw),
    onTaskActions: document.onTaskActions,
    idle: extractIdleDirective(raw),
  };
}

interface RuntimeBrainDocument {
  identity: {
    domain: string;
    capabilityTags: string[];
    requires: string[];
    prefers: string[];
    avoids: string[];
  };
  onTaskActions: OnTaskAction[];
}

/**
 * One typed adapter for the edge package's core-free runtime projection.
 *
 * The canonical parser owns the complete `.hsplus` AST. This package remains a
 * small edge runtime, so it projects only the identity and on-task fields it
 * executes. Both projections share one balanced-block scan and one KV decoder
 * instead of maintaining field-specific extractors.
 */
function adaptRuntimeBrainDocument(brain: string): RuntimeBrainDocument {
  const identityConfig = parseKVBlock(sliceNamedBlock(brain, 'identity') ?? '');
  const strings = (key: string): string[] =>
    Array.isArray(identityConfig[key])
      ? (identityConfig[key] as unknown[]).filter(
          (value): value is string => typeof value === 'string'
        )
      : [];

  return {
    identity: {
      domain: typeof identityConfig.domain === 'string' ? identityConfig.domain : 'unknown',
      capabilityTags: strings('capability_tags'),
      requires: strings('requires'),
      prefers: strings('prefers'),
      avoids: strings('avoids'),
    },
    onTaskActions: parseOnTaskActions(sliceNamedBlock(brain, 'on_task') ?? ''),
  };
}

/** Parse an authored frame into the transport-safe protocol contract. */
function extractFrameDeclaration(brain: string): FrameDeclarationContract | undefined {
  const block = sliceNamedBlock(brain, 'frame_declaration');
  if (block === undefined) return undefined;

  const tier = (key: string): FrameTier => {
    const parsed = Number((scalarField(block, key) ?? '2').split(',')[0].trim());
    return parsed === 0 || parsed === 1 || parsed === 2 || parsed === 3 ? parsed : 2;
  };

  return {
    domain: scalarField(block, 'domain') ?? '*',
    horizon: scalarField(block, 'horizon') ?? '',
    capability_tier: tier('capability_tier'),
    trust_tier: tier('trust_tier'),
    allowed_tools: listField(block, 'allowed_tools') ?? [],
    denied_domains: listField(block, 'denied_domains') ?? [],
  };
}

/**
 * Extract the brain's `behavior on_idle { … }` self-direction block (founder 2026-06-23).
 * Mirrors extractReflect's sliceNamedBlock + scalarField approach — no new parser primitives.
 *   behavior on_idle {
 *     directive: "Find and fix a small edge in the HoloScript grammar/compilers/traits."
 *     fileBoard: true
 *     maxTools: 8
 *   }
 * `directive` is required (a brain with on_idle but no directive parses to undefined → the
 * runner keeps the prior no-claimable-task behavior). fileBoard defaults true, maxTools 8.
 * Absent block → undefined → runner is unchanged (opt-in, backward-compatible).
 */
function extractIdleDirective(
  brain: string
): { directive: string; fileBoard: boolean; maxTools: number } | undefined {
  const block = sliceNamedBlock(brain, 'on_idle');
  if (block === undefined) return undefined;
  const directive = scalarField(block, 'directive');
  if (!directive) return undefined;
  const fileBoardRaw = scalarField(block, 'fileBoard') ?? scalarField(block, 'file_board');
  // Unquoted scalars run to the segment end; take the first comma-delimited token.
  const fileBoard = (fileBoardRaw ?? 'true').split(',')[0].trim().toLowerCase() !== 'false';
  const maxToolsRaw = scalarField(block, 'maxTools') ?? scalarField(block, 'max_tools');
  const maxToolsNum = Number((maxToolsRaw ?? '8').split(',')[0].trim());
  const maxTools = Number.isFinite(maxToolsNum) && maxToolsNum > 0 ? Math.floor(maxToolsNum) : 8;
  return { directive, fileBoard, maxTools };
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
  const BLOCK_START =
    /^(#brain|#version|#target|#mode|identity\s*\{|state\s*\{|computed\s*\{|traits\s*\[|capabilities\s*\{|directives\s*\{|behavior\s)/;
  let cutLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (BLOCK_START.test(lines[i].trim())) {
      cutLine = i;
      break;
    }
  }
  if (cutLine < 0) return src; // no HoloScript sections — whole file is prompt
  return lines.slice(0, cutLine).join('\n').trimEnd();
}

/**
 * Parse the `behavior on_task { … }` block into an ordered sequence of
 * cognitive verb calls (Phase 2.1). Each verb's config is extracted with a
 * lightweight typed projection — no full parser dependency. Only verbs whose
 * keys match known cognitive verbs are included; unknown keywords are skipped.
 *
 * AgentRunner now passes the parsed sequence to augmentWithOnTaskCognition,
 * the Phase 2.2 edge executor for `llm_call`, `rag_query`, `recall`, `plan`,
 * `ask_peer`, `council`, and `discover`. `reflect` is still extracted
 * separately via extractReflect because it runs as the post-artifact gate.
 */
function parseOnTaskActions(block: string): OnTaskAction[] {
  if (!block) return [];

  const VERBS: OnTaskAction['verb'][] = [
    'recall',
    'rag_query',
    'llm_call',
    'plan',
    'reflect',
    'ask_peer',
    'council',
    'discover',
  ];
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
