import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import {
  FRAME_ALLOW_ALL_TOOLS,
  describeFrameKeyLookalike,
  frameKeyLookalike,
} from '@holoscript/agent-protocol';
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
      throw new Error(`[brain] @posture cycle: ${[...seen, target].join(' -> ')}`);
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
    // Strip HTML comments before the text becomes prompt. A posture file's
    // maintainer notes address whoever EDITS it, not the model, and shipping
    // them verbatim was measured at 521 chars / ~132 tokens — 26% of the
    // payload — including, absurdly, the note telling maintainers to keep such
    // notes in a comment. The bench's drift check already normalizes this way;
    // the loader has to agree or the two disagree about what the posture IS.
    const body = text.replace(/<!--[\s\S]*?-->/g, '').trimEnd();
    out.push(await resolveSharedPosture(body, target, [...seen, target], depth + 1));
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
    frameDeclaration: extractFrameDeclaration(raw, brainPath),
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

// ─── Frame reader (G15, proposals/Agent_Frame_Tool_Allowlist_v1.md) ──────────
//
// The frame this reader builds is what the agent sends with every MCP tool
// call, and this package is core-free, so it cannot call the canonical parser.
// It reads only the brain's structured part, never its free-text prompt; it
// finds each `frame_declaration` written in code, never in a comment or a
// string; and it tokenizes just enough .hsplus to read each block's keys and
// list entries. It must read what the canonical parser reads. Where it cannot
// tell what the author wrote, it narrows the frame and never widens it: every
// header it finds is sent as a frame, at worst one that permits no tool, and a
// key that looks like a frame key but is not one stops the brain from loading.
// The cases every reader must agree on are shared in
// packages/agent-protocol/src/__tests__/fixtures/frame-allowlist-cases.json.

/**
 * The first line of a brain's structured part, matched at COLUMN 0; the free
 * text above it is the brain's prompt. This is the rule of core's
 * AGENT_BRAIN_SECTION_START and blankAgentBrainPreamble (PR #481): keep the
 * two in step. extractSystemPromptPreamble cuts the prompt with this pattern.
 */
const BRAIN_SECTION_START =
  /^(#brain|#version|#target|#mode|identity\s*\{|state\s*\{|computed\s*\{|traits\s*\[|capabilities\s*\{|directives\s*\{|behavior\s)/;

/** A token of the frame reader: enough .hsplus to find keys and list entries. */
type FrameToken = { kind: 'word' | 'string' | 'punct'; text: string } | { kind: 'newline' };

/** A top-level value in a frame block. */
type FrameValue = { list: string[] } | { scalar: string } | { other: true };

const OPENERS = new Set(['{', '(', '[']);
const CLOSER_OF: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
const NAME_CHAR = /[A-Za-z0-9_$]/;

/**
 * Parse the brain's `@frame_declaration` into the transport-safe protocol
 * contract. An omitted `allowed_tools` is sent as `["*"]` (every tool); a
 * written list means exactly what it names, so `[]` is no tool; a written value
 * that is not a list, a block this reader cannot read, or a header with no
 * block after it permits no tool. When the brain names more than one frame, the
 * agent gets only the tools every one of them permits. A frame holding a key
 * that looks like a frame key but is not one (`allowedTools`) refuses the brain.
 */
function extractFrameDeclaration(
  brain: string,
  brainPath: string
): FrameDeclarationContract | undefined {
  const frames = frameHeaderEnds(brain, structuredPartStart(brain)).map((end) =>
    frameAfterHeader(brain, end, brainPath)
  );
  return frames.length === 0 ? undefined : frames.reduce(narrowFrames);
}

/**
 * Where a brain's code begins, as core's parser reads it after PR #481: the
 * start of the first line that opens a section at column 0. Everything above
 * it is the prompt, so a frame shown there as an example is not the brain's
 * frame: it can neither narrow a real frame nor give a frameless brain one. A
 * brain with no such line has no prompt to skip, and the whole file is read,
 * so a frame is never dropped for want of one.
 */
function structuredPartStart(src: string): number {
  let at = 0;
  for (const line of src.split('\n')) {
    if (BRAIN_SECTION_START.test(line)) return at;
    at += line.length + 1;
  }
  return 0;
}

/**
 * The index just past each `frame_declaration` written in code from `from` on:
 * not inside a comment or a string, and not part of a longer name. A block
 * comment may span lines; a string ends on its own line. A comment or quote
 * that never closes is read as code, so it cannot hide a header. Reading text
 * that was not code can only add a frame, and frames only narrow each other.
 */
function frameHeaderEnds(src: string, from: number): number[] {
  const ends: number[] = [];
  let i = from;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') {
      const eol = src.indexOf('\n', i);
      i = eol < 0 ? src.length : eol;
    } else if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? i + 2 : end + 2;
    } else if (ch === '"' || ch === "'") {
      const close = closingQuote(src, i);
      i = close < 0 ? i + 1 : close + 1;
    } else if (NAME_CHAR.test(ch)) {
      let end = i;
      while (end < src.length && NAME_CHAR.test(src[end])) end++;
      if (src.slice(i, end) === 'frame_declaration') ends.push(end);
      i = end;
    } else {
      i++;
    }
  }
  return ends;
}

/** The index of the quote closing the string that opens at `src[open]`, on its line, or -1. */
function closingQuote(src: string, open: number): number {
  for (let j = open + 1; j < src.length && src[j] !== '\n'; j++) {
    if (src[j] === '\\') j++;
    else if (src[j] === src[open]) return j;
  }
  return -1;
}

/** Skip spaces, line breaks and comments from `i`. A block comment that never closes stays. */
function skipSpaceAndComments(src: string, i: number): number {
  while (i < src.length) {
    if (/\s/.test(src[i])) {
      i++;
    } else if (src[i] === '/' && src[i + 1] === '/') {
      const eol = src.indexOf('\n', i);
      i = eol < 0 ? src.length : eol;
    } else if (src[i] === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) return i;
      i = end + 2;
    } else {
      return i;
    }
  }
  return i;
}

/**
 * The frame a header declares: the block after it, past spaces, line breaks,
 * comments and an optional colon. A header with no block this reader can read
 * still declares a frame, one that permits no tool. The reader cannot tell what
 * the author wrote there, so it narrows, and it never drops the frame, which
 * would leave the agent every tool.
 */
function frameAfterHeader(
  src: string,
  headerEnd: number,
  brainPath: string
): FrameDeclarationContract {
  let at = skipSpaceAndComments(src, headerEnd);
  if (src[at] === ':') at = skipSpaceAndComments(src, at + 1);
  const opensBlock = src[at] === '{' || src[at] === '(';
  return frameFromBlock(opensBlock ? tokenizeFrameBlock(src, at) : undefined, brainPath);
}

/**
 * This loader reads frames with @holoscript/agent-protocol, which it loads from
 * that package's build. A build from before G15 lacks these exports, and every
 * frame would then be sent as [undefined]; stop loudly instead.
 */
function requireFrameProtocol(): void {
  if (
    typeof FRAME_ALLOW_ALL_TOOLS !== 'string' ||
    typeof frameKeyLookalike !== 'function' ||
    typeof describeFrameKeyLookalike !== 'function'
  ) {
    throw new Error(
      '[brain] @holoscript/agent-protocol is older than this agent, so a frame cannot be read ' +
        '(FRAME_ALLOW_ALL_TOOLS or frameKeyLookalike is missing). Rebuild it first: ' +
        'pnpm --filter @holoscript/agent-protocol build'
    );
  }
}

/**
 * Tokenize the bracketed block that opens at `src[open]`, through its matching
 * close. Comments are skipped and strings decoded, so brackets, keys and
 * entries are only ever read from code. Returns undefined when the block never
 * closes, its brackets do not match, or a string or block comment never ends.
 */
function tokenizeFrameBlock(src: string, open: number): FrameToken[] | undefined {
  const tokens: FrameToken[] = [];
  const closers: string[] = [];
  const word = /[\w$.-]+/y;
  let i = open;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\n') {
      tokens.push({ kind: 'newline' });
      i++;
    } else if (/\s/.test(ch)) {
      i++;
    } else if (ch === '/' && src[i + 1] === '/') {
      const eol = src.indexOf('\n', i);
      i = eol < 0 ? src.length : eol;
    } else if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) return undefined;
      i = end + 2;
    } else if (ch === '"' || ch === "'") {
      let text = '';
      let j = i + 1;
      while (j < src.length && src[j] !== ch && src[j] !== '\n') {
        if (src[j] === '\\' && j + 1 < src.length) j++;
        text += src[j];
        j++;
      }
      if (src[j] !== ch) return undefined;
      tokens.push({ kind: 'string', text });
      i = j + 1;
    } else if (OPENERS.has(ch)) {
      closers.push(CLOSER_OF[ch]);
      tokens.push({ kind: 'punct', text: ch });
      i++;
    } else if (ch === '}' || ch === ')' || ch === ']') {
      if (closers.pop() !== ch) return undefined;
      tokens.push({ kind: 'punct', text: ch });
      i++;
      if (closers.length === 0) return tokens;
    } else {
      word.lastIndex = i;
      const match = word.exec(src);
      const text = match ? match[0] : ch;
      tokens.push({ kind: match ? 'word' : 'punct', text });
      i += text.length;
    }
  }
  return undefined;
}

/** Index just past the value at `tokens[i]`: a whole bracketed group, or one token. */
function skipFrameValue(tokens: FrameToken[], i: number): number {
  const first = tokens[i];
  if (first.kind !== 'punct' || !OPENERS.has(first.text)) return i + 1;
  let depth = 0;
  for (let k = i; k < tokens.length; k++) {
    const t = tokens[k];
    if (t.kind !== 'punct') continue;
    if (OPENERS.has(t.text)) depth++;
    else if (t.text === '}' || t.text === ')' || t.text === ']') {
      depth--;
      if (depth === 0) return k + 1;
    }
  }
  return tokens.length;
}

/**
 * Read a frame block's top-level `key: value` (or `key = value`) entries. A
 * later key wins, as in the canonical parser; a key written with no value holds
 * no list. Only string entries count in a list: `[read]` and `[*]` name no tool.
 */
function readFrameEntries(tokens: FrameToken[]): Map<string, FrameValue> {
  const entries = new Map<string, FrameValue>();
  const close = tokens.length - 1; // tokens[0] opens the block, tokens[close] closes it
  let i = 1;
  while (i < close) {
    const key = tokens[i];
    if (key.kind !== 'word' && key.kind !== 'string') {
      i = skipFrameValue(tokens, i);
      continue;
    }
    const sep = tokens[i + 1];
    if (sep.kind !== 'punct' || (sep.text !== ':' && sep.text !== '=')) {
      entries.set(key.text, { other: true });
      i += 1;
      continue;
    }
    let j = i + 2;
    while (j < close && tokens[j].kind === 'newline') j++;
    const value = tokens[j];
    const next = skipFrameValue(tokens, j);
    if (value.kind === 'punct' && value.text === '[') {
      const list: string[] = [];
      let depth = 0;
      for (let k = j; k < next; k++) {
        const t = tokens[k];
        if (t.kind === 'punct' && OPENERS.has(t.text)) depth++;
        else if (t.kind === 'punct' && (t.text === '}' || t.text === ')' || t.text === ']'))
          depth--;
        else if (t.kind === 'string' && depth === 1) list.push(t.text);
      }
      entries.set(key.text, { list });
    } else if (value.kind === 'string' || value.kind === 'word') {
      entries.set(key.text, { scalar: value.text });
    } else {
      entries.set(key.text, { other: true });
    }
    i = next;
  }
  return entries;
}

/**
 * The frame a tokenized block declares. A missing block, or one this reader
 * could not read, permits no tool. A key that looks like a frame key but is not
 * one refuses the brain, as the canonical parser and the Rust reader refuse it.
 */
function frameFromBlock(
  tokens: FrameToken[] | undefined,
  brainPath: string
): FrameDeclarationContract {
  requireFrameProtocol();
  const entries = tokens ? readFrameEntries(tokens) : new Map<string, FrameValue>();
  for (const written of entries.keys()) {
    const meant = frameKeyLookalike(written);
    if (meant) {
      throw new Error(`[brain] ${brainPath}: ${describeFrameKeyLookalike({ written, meant })}`);
    }
  }
  const scalar = (key: string): string | undefined => {
    const value = entries.get(key);
    return value && 'scalar' in value ? value.scalar : undefined;
  };
  const tier = (key: string): FrameTier => {
    const parsed = Number(scalar(key));
    return parsed === 0 || parsed === 1 || parsed === 2 || parsed === 3 ? parsed : 2;
  };
  const allowed = entries.get('allowed_tools');
  const denied = entries.get('denied_domains');
  return {
    domain: scalar('domain') ?? '*',
    horizon: scalar('horizon') ?? '',
    capability_tier: tier('capability_tier'),
    trust_tier: tier('trust_tier'),
    allowed_tools:
      tokens === undefined
        ? []
        : allowed === undefined
          ? [FRAME_ALLOW_ALL_TOOLS]
          : 'list' in allowed
            ? allowed.list
            : [],
    denied_domains: denied && 'list' in denied ? denied.list : [],
  };
}

/** Two frames combined so the result permits only what both permit; the rest comes from the first. */
function narrowFrames(
  a: FrameDeclarationContract,
  b: FrameDeclarationContract
): FrameDeclarationContract {
  const everyTool = (tools: string[]): boolean => tools.includes(FRAME_ALLOW_ALL_TOOLS);
  const allowed_tools = everyTool(a.allowed_tools)
    ? [...b.allowed_tools]
    : everyTool(b.allowed_tools)
      ? [...a.allowed_tools]
      : a.allowed_tools.filter((tool) => b.allowed_tools.includes(tool));
  return {
    ...a,
    allowed_tools,
    denied_domains: [...new Set([...a.denied_domains, ...b.denied_domains])],
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
  let cutLine = -1;
  for (let i = 0; i < lines.length; i++) {
    if (BRAIN_SECTION_START.test(lines[i].trim())) {
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
