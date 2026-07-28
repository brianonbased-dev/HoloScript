/**
 * Reusable language-validity guard for corpus rows and eval gates.
 *
 * Raw parser `success` flags have been observed to lie. This guard treats a
 * source as valid only when:
 *   1. the parser reports zero errors,
 *   2. the verdict is invariant with and without one trailing newline, and
 *   3. the AST preserves the source-level semantic node count where we can
 *      cheaply infer that count.
 */

const SOURCE_KEYWORDS = {
  '.holo': [
    'composition',
    'object',
    'template',
    'environment',
    'state',
    'material',
    'light',
    'timeline',
    'audio',
    'zone',
    'ui',
    'npc',
    'quest',
    'ability',
    'dialogue',
    'state_machine',
    'spatial_group',
    'domain_block',
    'data_source',
    'team_agent',
    'shape',
    'terrain',
    'trigger',
    'spawn_point',
    'spawn_group',
    'waypoint_set',
    'constraint',
    'policy_pack',
    'world_chunk',
    'world_layer',
    'dungeon_instance',
    'world_shard',
    'movement_path',
    'reaction_trigger',
    'loot_table',
  ],
  '.hsplus': [
    'component',
    'entity',
    'object',
    'orb',
    'cube',
    'sphere',
    'cylinder',
    'plane',
    'torus',
    'mesh',
    'model',
    'avatar',
    'agent',
    'system',
    'world',
    'scene',
    'state',
    'action',
    'event',
    'handler',
    'template',
    'npc',
    'quest',
    'ability',
    'dialogue',
    'state_machine',
    'stateMachine',
    'spatial_group',
    'spatialGroup',
    'data_source',
    'dataSource',
    'timeline',
    'audio',
    'zone',
    'ui',
    'light',
    'material',
  ],
  '.hs': [],
};

const AST_TYPES = {
  '.holo': new Set([
    'composition',
    'object',
    'template',
    'environment',
    'state',
    'domainblock',
    'light',
    'timeline',
    'audio',
    'zone',
    'ui',
    'npc',
    'quest',
    'ability',
    'dialogue',
    'statemachine',
    'spatialgroup',
    'shape',
    'terrain',
    'trigger',
    'spawnpoint',
    'spawngroup',
    'waypointset',
    'constraint',
    'policypack',
    'worldchunk',
    'worldlayer',
    'dungeoninstance',
    'worldshard',
    'movementpath',
    'reactiontrigger',
    'loottable',
  ]),
  '.hsplus': new Set([
    'component',
    'entity',
    'object',
    'orb',
    'cube',
    'sphere',
    'cylinder',
    'plane',
    'torus',
    'mesh',
    'model',
    'avatar',
    'agent',
    'system',
    'world',
    'scene',
    'state',
    'action',
    'event',
    'handler',
    'template',
    'npc',
    'quest',
    'ability',
    'dialogue',
    'statemachine',
    'spatialgroup',
    'datasource',
    'timeline',
    'audio',
    'zone',
    'ui',
    'light',
    'material',
  ]),
  '.hs': new Set(),
};

export class HoloValidityError extends Error {
  constructor(details) {
    super(formatGuardFailure(details));
    this.name = 'HoloValidityError';
    this.details = details;
  }
}

export async function assertReallyValid(source, format, options = {}) {
  const details = await checkReallyValid(source, format, options);
  if (!details.ok) {
    throw new HoloValidityError(details);
  }
  return details;
}

export async function checkReallyValid(source, format, options = {}) {
  const normalizedFormat = normalizeFormat(format);
  const parse = options.parseContent ?? parseWithLiveToolParser;
  const primary = await parseAndSummarize(parse, source, normalizedFormat);
  const withoutTrailingNewline = source.replace(/\n+$/u, '');
  const withTrailingNewline = `${withoutTrailingNewline}\n`;
  const noFinalNewline = await parseAndSummarize(parse, withoutTrailingNewline, normalizedFormat);
  const oneFinalNewline = await parseAndSummarize(parse, withTrailingNewline, normalizedFormat);

  const sourceNodeCount = countSourceDeclarations(source, normalizedFormat);
  const diagnostics = [];

  if (primary.threw) {
    diagnostics.push({
      code: 'parse-exception',
      message: `Parser threw: ${primary.exception}`,
    });
  }

  if (primary.errors.length > 0) {
    diagnostics.push({
      code: 'parse-errors',
      message: `Parser reported ${primary.errors.length} error(s).`,
      errors: primary.errors,
    });
  }

  const noFinalOk = isZeroErrorParse(noFinalNewline);
  const oneFinalOk = isZeroErrorParse(oneFinalNewline);
  if (noFinalOk !== oneFinalOk) {
    diagnostics.push({
      code: 'newline-verdict-drift',
      message: 'Parse verdict changes when a single trailing newline is added or removed.',
      withoutTrailingNewline: summarizeParse(noFinalNewline),
      withTrailingNewline: summarizeParse(oneFinalNewline),
    });
  }

  if (noFinalOk && oneFinalOk && noFinalNewline.astNodeCount !== oneFinalNewline.astNodeCount) {
    diagnostics.push({
      code: 'newline-node-count-drift',
      message:
        'AST semantic node count changes when a single trailing newline is added or removed.',
      withoutTrailingNewlineAstNodeCount: noFinalNewline.astNodeCount,
      withTrailingNewlineAstNodeCount: oneFinalNewline.astNodeCount,
    });
  }

  if (sourceNodeCount.count > 0 && primary.astNodeCount < sourceNodeCount.count) {
    diagnostics.push({
      code: 'node-count-loss',
      message:
        `AST kept ${primary.astNodeCount} semantic node(s), but source declares at least ` +
        `${sourceNodeCount.count}.`,
      sourceNodeCount,
      astNodeCount: primary.astNodeCount,
    });
  }

  // Advisory trait prop-schema (enum/type) diagnostics. SEPARATE from `diagnostics`
  // and deliberately NOT folded into `ok` — this surface reports, it never gates.
  const { semanticDiagnostics, semanticDiagnosticsUnavailable } = await computeSemanticDiagnostics(
    normalizedFormat,
    primary.ast,
    options
  );

  return {
    ok: diagnostics.length === 0,
    format: normalizedFormat,
    diagnostics,
    semanticDiagnostics,
    semanticDiagnosticsUnavailable,
    primary: summarizeParse(primary),
    newlineInvariant: noFinalOk === oneFinalOk,
    nodeCountFidelity: sourceNodeCount.count === 0 || primary.astNodeCount >= sourceNodeCount.count,
    sourceNodeCount,
    astNodeCount: primary.astNodeCount,
    withoutTrailingNewline: summarizeParse(noFinalNewline),
    withTrailingNewline: summarizeParse(oneFinalNewline),
  };
}

export function countSourceDeclarations(source, format) {
  const normalizedFormat = normalizeFormat(format);
  const keywords = SOURCE_KEYWORDS[normalizedFormat] ?? [];
  if (keywords.length === 0) {
    return { count: 0, byKeyword: {} };
  }

  const scrubbed = stripCommentsAndStrings(source);
  const alternatives = keywords
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  const pattern = new RegExp(`(?:^|[\\n;{}])\\s*(${alternatives})\\b`, 'g');
  const byKeyword = {};
  let count = 0;
  let match;
  while ((match = pattern.exec(scrubbed)) !== null) {
    const keyword = match[1];
    byKeyword[keyword] = (byKeyword[keyword] ?? 0) + 1;
    count++;
  }
  return { count, byKeyword };
}

export function countAstSemanticNodes(ast, format) {
  const normalizedFormat = normalizeFormat(format);
  const semanticTypes = AST_TYPES[normalizedFormat] ?? new Set();
  if (!ast || semanticTypes.size === 0) {
    return { count: 0, byType: {} };
  }

  const visited = new WeakSet();
  const counted = new Set();
  const byType = {};
  let count = 0;

  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (visited.has(value)) return;
    visited.add(value);

    const nodeType = semanticTypeForNode(value, semanticTypes);
    if (nodeType) {
      const key = semanticNodeKey(value, nodeType);
      if (!counted.has(key)) {
        counted.add(key);
        byType[nodeType] = (byType[nodeType] ?? 0) + 1;
        count++;
      }
    }

    for (const [key, child] of Object.entries(value)) {
      if (key === 'parent' || key === 'provenance') continue;
      if (Array.isArray(child)) {
        for (const item of child) visit(item);
      } else {
        visit(child);
      }
    }
  };

  visit(ast);
  return { count, byType };
}

async function parseAndSummarize(parse, source, format) {
  try {
    const result = await parse(source, format);
    const errors = normalizeErrors(result);
    const ast = result?.ast ?? result?.root ?? null;
    const astNodes = countAstSemanticNodes(ast, format);
    return {
      threw: false,
      successFlag: result?.success,
      errors,
      errorCount: errors.length,
      ast,
      astNodeCount: astNodes.count,
      astNodeTypes: astNodes.byType,
    };
  } catch (err) {
    return {
      threw: true,
      successFlag: false,
      errors: [{ message: err instanceof Error ? err.message : String(err) }],
      errorCount: 1,
      exception: err instanceof Error ? err.message : String(err),
      ast: null,
      astNodeCount: 0,
      astNodeTypes: {},
    };
  }
}

async function parseWithLiveToolParser(source, format) {
  if (format === '.holo') {
    const { HoloCompositionParser } = await import('@holoscript/core');
    return new HoloCompositionParser().parse(source);
  }
  if (format === '.hsplus') {
    const { HoloScriptPlusParser } = await import('@holoscript/core');
    return new HoloScriptPlusParser().parse(source);
  }
  if (format === '.hs') {
    const { parsePipeline, HoloScriptCodeParser } = await import('@holoscript/core');
    const contentNoComments = source.replace(/\/\/[^\n]*/g, '');
    const isPipeline = /^[ \t]*pipeline\s+["']?\w/m.test(contentNoComments);
    if (isPipeline) return parsePipeline(source);
    return new HoloScriptCodeParser().parse(source);
  }
  throw new Error(`Unsupported HoloScript format: ${format}`);
}

// -----------------------------------------------------------------------------
// Advisory semantic (trait prop-schema) diagnostics — .holo only, ignored by `ok`.
// -----------------------------------------------------------------------------
// The confabulation prop-schema validator (per-trait enum/type) is resolved from
// @holoscript/core's dist and built ONCE: checkReallyValid parses 3x per row and runs
// across the whole corpus, so a per-call ~1080-schema construction is forbidden. If the
// dist predates the ConfabulationValidator / DERIVED_TRAIT_CONFLICTS exports, the resolver
// yields { unavailable: 'core-dist-stale' } and we never call `new undefined()`. Traits in
// DERIVED_TRAIT_CONFLICTS are suppressed: their derived schema was resolved by a
// .holo-vs-.holo coin flip and may hold the wrong enum set.
let confabValidatorPromise;

async function resolveConfabValidator() {
  if (!confabValidatorPromise) {
    confabValidatorPromise = (async () => {
      try {
        const core = await import('@holoscript/core');
        const ConfabulationValidator = core?.ConfabulationValidator;
        const conflicts = core?.DERIVED_TRAIT_CONFLICTS;
        if (typeof ConfabulationValidator !== 'function' || !Array.isArray(conflicts)) {
          return { unavailable: 'core-dist-stale' };
        }
        const validator = new ConfabulationValidator({
          includeDerivedSchemas: true,
          validatePrerequisites: false,
          validateConflicts: false,
        });
        return { validator, conflictedTraits: new Set(conflicts) };
      } catch {
        return { unavailable: 'core-dist-stale' };
      }
    })();
  }
  return confabValidatorPromise;
}

async function computeSemanticDiagnostics(normalizedFormat, ast, options) {
  // .holo-only ceiling: needs a real parsed AST from the live core parser. The Rust shadow
  // path passes options.parseContent and yields ast:null, so it is excluded here.
  if (normalizedFormat !== '.holo' || !ast || options.parseContent) {
    return { semanticDiagnostics: [], semanticDiagnosticsUnavailable: undefined };
  }
  const confab = await resolveConfabValidator();
  if (confab.unavailable) {
    return { semanticDiagnostics: [], semanticDiagnosticsUnavailable: confab.unavailable };
  }
  try {
    const result = confab.validator.validateComposition(ast);
    const semanticDiagnostics = [];
    for (const err of result.errors ?? []) {
      if (err.traitName && confab.conflictedTraits.has(err.traitName)) continue;
      semanticDiagnostics.push({
        code: String(err.code),
        message: err.message,
        traitName: err.traitName,
        suggestion: err.suggestion,
      });
    }
    return { semanticDiagnostics, semanticDiagnosticsUnavailable: undefined };
  } catch {
    // Advisory only — a prop-schema check failure must never break the guard verdict.
    return { semanticDiagnostics: [], semanticDiagnosticsUnavailable: undefined };
  }
}

function normalizeErrors(result) {
  if (Array.isArray(result?.errors)) {
    return result.errors.map((error) =>
      typeof error === 'string'
        ? { message: error }
        : { ...error, message: error?.message ? String(error.message) : String(error) }
    );
  }
  if (result?.success === false) {
    return [{ message: 'Parser returned success:false without an errors array.' }];
  }
  if (typeof result?.error === 'string') {
    return [{ message: result.error }];
  }
  return [];
}

function isZeroErrorParse(parseSummary) {
  return !parseSummary.threw && parseSummary.errors.length === 0;
}

function summarizeParse(parseSummary) {
  return {
    threw: parseSummary.threw,
    successFlag: parseSummary.successFlag,
    errorCount: parseSummary.errors.length,
    errors: parseSummary.errors.slice(0, 5),
    astNodeCount: parseSummary.astNodeCount,
    astNodeTypes: parseSummary.astNodeTypes,
  };
}

function semanticTypeForNode(node, semanticTypes) {
  if (typeof node.type !== 'string') return null;
  const normalizedType = normalizeType(node.type);
  if (semanticTypes.has(normalizedType)) return normalizedType;
  if (normalizedType === 'domainblock' && typeof node.keyword === 'string') {
    const keywordType = normalizeType(node.keyword);
    if (semanticTypes.has(keywordType)) return keywordType;
  }
  return null;
}

function semanticNodeKey(node, nodeType) {
  const loc = node.loc;
  const start = loc?.start ? `${loc.start.line ?? '?'}:${loc.start.column ?? '?'}` : '?:?';
  const end = loc?.end ? `${loc.end.line ?? '?'}:${loc.end.column ?? '?'}` : '?:?';
  const name = node.name ?? node.id ?? node.keyword ?? '';
  return `${nodeType}:${name}:${start}:${end}`;
}

function normalizeFormat(format) {
  if (!format) throw new Error('HoloScript format is required.');
  const withDot = String(format).startsWith('.') ? String(format) : `.${format}`;
  if (!(withDot in SOURCE_KEYWORDS)) {
    throw new Error(`Unsupported HoloScript format: ${format}`);
  }
  return withDot;
}

function normalizeType(type) {
  return String(type).replace(/[_-]/g, '').toLowerCase();
}

function stripCommentsAndStrings(source) {
  let out = '';
  let state = 'normal';
  let quote = '';
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (state === 'line-comment') {
      if (ch === '\n') {
        state = 'normal';
        out += '\n';
      } else {
        out += ' ';
      }
      continue;
    }

    if (state === 'block-comment') {
      if (ch === '*' && next === '/') {
        out += '  ';
        i++;
        state = 'normal';
      } else {
        out += ch === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (state === 'string') {
      if (escaped) {
        escaped = false;
        out += ch === '\n' ? '\n' : ' ';
      } else if (ch === '\\') {
        escaped = true;
        out += ' ';
      } else if (ch === quote) {
        state = 'normal';
        quote = '';
        out += ' ';
      } else {
        out += ch === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (ch === '/' && next === '/') {
      out += '  ';
      i++;
      state = 'line-comment';
      continue;
    }
    if (ch === '/' && next === '*') {
      out += '  ';
      i++;
      state = 'block-comment';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      state = 'string';
      quote = ch;
      out += ' ';
      continue;
    }
    out += ch;
  }

  return out;
}

function formatGuardFailure(details) {
  const codes = details.diagnostics.map((d) => d.code).join(', ') || 'unknown';
  return `HoloScript source is not really valid (${codes}).`;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
