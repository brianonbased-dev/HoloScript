/**
 * HoloScript -> GBNF grammar generator.
 *
 * Emits a llama.cpp GBNF grammar that constrains a local model's DECODING so it
 * can only produce syntactically-valid HoloScript. This is validity-by-
 * construction pushed down to the token level: paired with `@llama_serve { grammar:
 * "holoscript" }` the compiler writes this grammar into the server bundle and the
 * launch command gains `--grammar-file`, and the MCP generators pass it per request
 * to the local-llm provider, so a 4B local model on the sovereign fleet emits a
 * parseable `.holo` program every time instead of "usually parseable" prose.
 *
 * Two roots:
 *   - `composition` (default): ONE whole program, `composition "Name" { ... }`, the
 *     root the generator prompt teaches. Inside it: objects (with `using "Template"`),
 *     templates, spatial groups, triggers, environment, lights, post-processing
 *     effects, state machines, material blocks and primitives; inside those, traits,
 *     properties, `state { }`, `behavior "X" { }` and `animation "x" { }` blocks;
 *     values include inline objects (`material: { baseColor: "#ff6b6b" }`), traits may
 *     carry a settings block (`@grabbable { hand: "both" }`), and line breaks and `//`
 *     comments go between items; a block header and a `key: value` stay on one line,
 *     because the parser refuses a line break there in several block kinds. A state
 *     machine's states list `transitions: [ { target: "b" event: "go" } ]` in the one
 *     shape its parser takes. Every quickstart scene (examples/quickstart/*.holo), every
 *     author_holo reference answer of the edge coding benchmark and the two whole
 *     programs written for the generator prompt (Workshop, Crossing) are accepted.
 *     Every program the grammar can produce
 *     is built to parse with zero errors under parseHolo and the strict layer, and
 *     holoscript-gbnf.acceptance.test.ts checks that two ways: it samples 400 programs
 *     on every run (20,000 parsed with 0 errors on 2026-10-09), and it re-measures every
 *     excluded property name, state-machine key, transition key and trait name against
 *     the parser, failing when the grammar and the parser disagree.
 *   - `definitions`: the first subset, root-less top-level definitions (keyword
 *     objects, material blocks, primitives). Kept byte-identical for the
 *     `holoscript-subset` preset so receipts that name it can be re-derived. Do NOT
 *     use it for generation: it lets line breaks, commas and traits land where the
 *     parser refuses them, and 740 of 1000 programs sampled from it fail to parse
 *     (measured 2026-10-09 with gbnf-matcher.ts against parseHolo + the strict layer).
 *
 * The terminals follow the PRODUCTION lexer (packages/core/src/parser/composition/
 * lexer.ts + tokens.ts), NOT the more permissive tree-sitter grammar:
 *   - number = `-?[0-9]+(\.[0-9]+)?`  (NO exponent, NO leading dot)
 *   - string = "..." with the escape set the lexer accepts (\" \\ \' \n \t \r)
 *   - identifiers = `[A-Za-z_][A-Za-z0-9_]*`  (cannot start with a digit)
 *   - hex colors are authored as QUOTED strings (`base_color: "#5d4037"`) — the
 *     conformance-accepted form — so `value` covers them without a bare-# rule.
 *
 * Property names are identifiers MINUS the keywords the parser refuses in that
 * position (see {@link RESERVED_PROPERTY_NAMES}); a model held to the grammar can
 * therefore never write `object: 1` or `if: true` where the parser would choke.
 * `.hs` control-flow logic is out of scope.
 */

/** Options for {@link generateHoloScriptGbnf} — defaults are a useful, parser-valid grammar. */
export interface HoloScriptGbnfOptions {
  /**
   * `composition` (default): one whole `composition "Name" { ... }` program.
   * `definitions`: the root-less first subset (top-level objects / materials / primitives).
   */
  root?: 'composition' | 'definitions';
  /** Keyword-object head keywords (each requires a name), e.g. `object "Name" { }`. */
  objectKeywords?: readonly string[];
  /** Primitive shape keywords (optional id), e.g. `cube { }`. */
  primitiveShapes?: readonly string[];
  /** Material-family block keywords, e.g. `material "Stone" @advanced_pbr { }`. */
  materialKeywords?: readonly string[];
  /**
   * Require at least one definition: one top-level definition (`definitions`) or one
   * member inside the composition (`composition`). Default true — an empty document is
   * not a useful constrained generation.
   */
  requireDefinition?: boolean;
}

/**
 * The default subset. Object keywords + primitive shapes are drawn from the parser
 * token SSOT (tokens.ts KEYWORDS 'OBJECT' entries + PRIMITIVE_SHAPES); kept as a
 * curated list here so the generator has no runtime dependency on the lexer and
 * stays a pure, testable string builder. Widen via options when the subset grows.
 */
export const DEFAULT_OBJECT_KEYWORDS = ['object', 'entity', 'instanced_object', 'orb'] as const;
export const DEFAULT_PRIMITIVE_SHAPES = [
  'cube',
  'box',
  'sphere',
  'cylinder',
  'cone',
  'torus',
  'plane',
  'capsule',
  'circle',
  'text',
] as const;
export const DEFAULT_MATERIAL_KEYWORDS = ['material'] as const;

/**
 * Lexer keywords the parser refuses as a property name inside an object, template,
 * environment, light, trigger, state, behavior, animation, state machine, effect or
 * inline-object body (`if: 1` in a template, `object: 1` in an object). Measured
 * against the parser, not guessed: holoscript-gbnf.acceptance.test.ts re-measures every
 * lexer keyword in every one of those positions and fails when this list and the
 * parser disagree in either direction, so a new lexer keyword shows up there first.
 * It is one list for all those positions, their union: a word the parser refuses in any
 * of them is left out of all of them, so in some positions the grammar is narrower than
 * the parser (never wider). The other reserved lists below work the same way.
 */
// prettier-ignore
export const RESERVED_PROPERTY_NAMES = [
  'async', 'await', 'break', 'case', 'catch', 'const', 'default', 'dungeon_instance',
  'else', 'entity', 'enum', 'execute', 'export', 'export_config', 'extends', 'false',
  'finally', 'for', 'function', 'game_trigger', 'if', 'in', 'input', 'instanced_object',
  'interface', 'let', 'loot_table', 'metadata', 'metanorm', 'migrate', 'module',
  'movement_path', 'new', 'norm', 'null', 'object', 'of', 'orb', 'particle_system',
  'particles', 'reaction_trigger', 'scene', 'sim_contract', 'spatial_agent', 'spawn_point',
  'struct', 'sub_orb', 'switch', 'throw', 'tool_slot', 'true', 'try', 'ui_button',
  'ui_chart', 'ui_gauge', 'ui_image', 'ui_input', 'ui_panel', 'ui_slider',
  'ui_status_indicator', 'ui_text', 'ui_value', 'var', 'while', 'world_chunk',
  'world_layer', 'world_shard',
] as const;

/**
 * The further keywords the parser refuses as a property name inside a spatial group,
 * as a named trait argument, or as a post-processing effect name (`emit: 1` in a group).
 * Those positions exclude {@link RESERVED_PROPERTY_NAMES} plus these. `emit` and `from`
 * stay legal elsewhere: a trigger's `emit:` and an animation's `from:` parse fine.
 */
// prettier-ignore
export const RESERVED_GROUP_NAMES = [
  'achievement', 'action', 'animate', 'composition', 'element', 'emit', 'from', 'light',
  'node', 'on_error', 'return', 'spatial_container', 'spatial_group', 'state_machine',
  'talent_tree', 'template', 'theme',
] as const;

/**
 * Keys a state machine's parser reads itself, so they take only its own shapes: in the
 * machine body `states`, `transitions` and `listen` (`input` is a keyword, already in
 * {@link RESERVED_PROPERTY_NAMES}); in a state `actions`, `enter`,
 * `entry`, `exit`, `transitions`, the five `blend` spellings (one of two words each), and
 * `onDamage` / `onTimeout`, which read statements up to the state's `}` and so swallow the
 * next property (measured: `transitions: 1`, `enter: 1` and `blend: 1` are errors). The
 * grammar leaves them out of state-machine property names and writes a state's
 * `transitions:` itself, in the one shape the parser takes (see `state-transitions`).
 */
// prettier-ignore
export const RESERVED_MACHINE_NAMES = [
  'actions', 'blend', 'blendMode', 'blendType', 'blend_mode', 'blend_type', 'enter', 'entry',
  'exit', 'listen', 'onDamage', 'onTimeout', 'states', 'transitions',
] as const;

/** GBNF alternation of quoted literals: ["a","b"] -> `"a" | "b"`. Empty -> a never-matching rule. */
function literalAlternation(values: readonly string[]): string {
  const unique = [...new Set(values.filter((v) => v.length > 0))];
  if (unique.length === 0) return '"\\u0000"'; // unreachable literal — keeps the grammar well-formed
  return unique.map((v) => `"${v}"`).join(' | ');
}

const IDENT_START = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz';
const IDENT_CONTINUE = `0123456789${IDENT_START}`;

/** A GBNF character class holding exactly `chars` (ASCII identifier characters), as ranges. */
function charClass(chars: Iterable<string>): string {
  const codes = [...new Set(chars)].map((c) => c.charCodeAt(0)).sort((a, b) => a - b);
  let out = '';
  for (let i = 0; i < codes.length;) {
    let j = i;
    while (j + 1 < codes.length && codes[j + 1] === codes[j] + 1) j++;
    const from = String.fromCharCode(codes[i]);
    const to = String.fromCharCode(codes[j]);
    out += j - i >= 2 ? `${from}-${to}` : j === i ? from : `${from}${to}`;
    i = j + 1;
  }
  return `[${out}]`;
}

interface TrieNode {
  end: boolean;
  children: Map<string, TrieNode>;
}

/**
 * GBNF rules for "an identifier that is none of `words`": a trie of the excluded words
 * where, at every node, the identifier may stop (unless the prefix is itself excluded),
 * continue along the trie, or leave it on any other identifier character and then run
 * free. The lexer looks keywords up in lower case (`KEYWORDS[value.toLowerCase()]`), so
 * `Object` and `VAR` are excluded too: each trie step accepts both cases of its letter.
 * Deterministic (no two alternatives start with the same character), so it costs
 * llama.cpp one stack per step. One rule per first letter keeps lines readable.
 */
function identExcluding(ruleName: string, words: readonly string[]): string[] {
  const root: TrieNode = { end: false, children: new Map() };
  for (const word of [...new Set(words.map((w) => w.toLowerCase()))].sort()) {
    let node = root;
    for (const ch of word) {
      let next = node.children.get(ch);
      if (!next) {
        next = { end: false, children: new Map() };
        node.children.set(ch, next);
      }
      node = next;
    }
    node.end = true;
  }

  // Both cases of a trie letter: `[oO]`; a digit or `_` is itself.
  const step = (ch: string) => charClass(new Set([ch, ch.toUpperCase()]));
  const freeOf = (alphabet: string, node: TrieNode) =>
    [...alphabet].filter((c) => !node.children.has(c.toLowerCase()));

  const expr = (node: TrieNode): string => {
    const alternatives: string[] = [];
    alternatives.push(`${charClass(freeOf(IDENT_CONTINUE, node))} ident-tail`);
    for (const [ch, child] of node.children) alternatives.push(`${step(ch)} ${expr(child)}`);
    const body = alternatives.join(' | ');
    // The identifier may end here unless what has been read so far is an excluded word.
    return node.end ? `(${body})` : `(${body})?`;
  };

  const rules: string[] = [];
  const heads: string[] = [];
  heads.push(`${charClass(freeOf(IDENT_START, root))} ident-tail`);
  for (const [ch, child] of root.children) {
    heads.push(`${ruleName}-${ch}`);
    rules.push(`${ruleName}-${ch} ::= ${step(ch)} ${expr(child)}`);
  }
  return [`${ruleName} ::= ${heads.join(' | ')}`, ...rules];
}

/** The root-less first subset — byte-identical to the grammar this file emitted before `root`. */
function definitionsGrammar(options: HoloScriptGbnfOptions): string {
  const objectKeywords = options.objectKeywords ?? DEFAULT_OBJECT_KEYWORDS;
  const primitiveShapes = options.primitiveShapes ?? DEFAULT_PRIMITIVE_SHAPES;
  const materialKeywords = options.materialKeywords ?? DEFAULT_MATERIAL_KEYWORDS;
  const requireDefinition = options.requireDefinition ?? true;

  const rootRepeat = requireDefinition ? '(def ws)+' : '(def ws)*';

  return [
    '# HoloScript constrained subset — generated by generateHoloScriptGbnf().',
    '# Constrains a llama.cpp model to emit syntactically-valid HoloScript',
    '# (keyword objects, primitive objects, material blocks; @traits + key:value',
    '# properties over number/string/boolean/null/array values). Terminals follow',
    '# the production lexer (composition/lexer.ts), not the looser tree-sitter grammar.',
    '',
    `root ::= ws ${rootRepeat}`,
    'def ::= object | material | primitive',
    '',
    'object ::= object-kw sp string ws traits block',
    'material ::= material-kw sp string ws traits block',
    'primitive ::= prim-shape (sp obj-id)? ws block',
    '',
    `object-kw ::= ${literalAlternation(objectKeywords)}`,
    `material-kw ::= ${literalAlternation(materialKeywords)}`,
    `prim-shape ::= ${literalAlternation(primitiveShapes)}`,
    'obj-id ::= string | ("#" ident) | ident',
    '',
    'block ::= "{" ws (member ws)* "}"',
    'member ::= trait | property',
    'traits ::= (trait ws)*',
    '',
    'trait ::= "@" ident trait-args?',
    'trait-args ::= "(" ws (arg (ws "," ws arg)*)? ws ")"',
    'arg ::= (ident ws ":" ws)? value',
    '',
    'property ::= ident ws ":" ws value (ws ",")?',
    '',
    'value ::= number | string | boolean | null | array',
    'array ::= "[" ws (value (ws "," ws value)*)? ws "]"',
    '',
    'number ::= "-"? [0-9]+ ("." [0-9]+)?',
    'boolean ::= "true" | "false"',
    'null ::= "null"',
    'string ::= "\\"" str-char* "\\""',
    'str-char ::= [^"\\\\] | escape',
    'escape ::= "\\\\" ( "\\"" | "\\\\" | "\'" | "n" | "t" | "r" )',
    'ident ::= [a-zA-Z_] [a-zA-Z0-9_]*',
    '',
    'sp ::= [ \\t]+',
    'ws ::= [ \\t\\n\\r]*',
    '',
  ].join('\n');
}

/** One whole `composition "Name" { ... }` program. */
function compositionGrammar(options: HoloScriptGbnfOptions): string {
  const objectKeywords = options.objectKeywords ?? DEFAULT_OBJECT_KEYWORDS;
  const primitiveShapes = options.primitiveShapes ?? DEFAULT_PRIMITIVE_SHAPES;
  const materialKeywords = options.materialKeywords ?? DEFAULT_MATERIAL_KEYWORDS;
  const requireDefinition = options.requireDefinition ?? true;

  // Items inside a block are separated by at least one whitespace or comment, so two
  // items can never fuse into one token (`@m` + `Nd: 1` would lex as the trait `@mNd`).
  const items = (rule: string) => `(${rule} (wsp ${rule})*)?`;
  const members = requireDefinition ? 'member (wsp member)*' : items('member');

  return [
    '# HoloScript whole-program grammar — generated by generateHoloScriptGbnf().',
    '# Constrains a llama.cpp model to emit ONE `composition "Name" { ... }` program',
    '# that parses with zero errors. Terminals follow the production lexer',
    '# (composition/lexer.ts); property names exclude the keywords the parser',
    '# refuses there. Line breaks and `//` comments go between items (ws, wsp); a',
    '# header (`light "Sun" {`) and a property (`key: value`) stay on one line (hs),',
    '# because the parser refuses a line break there in several block kinds.',
    '',
    'root ::= ws composition ws',
    `composition ::= "composition" sp string hs "{" ws ${members} ws "}"`,
    'member ::= object | template | group | trigger | environment | light | post-processing | state-machine | material | primitive',
    '',
    `object ::= object-kw sp string (sp "using" sp string)? (sp header-trait)* hs "{" ws ${items('object-item')} ws "}"`,
    // Child objects nest in objects and templates. Measured 2026-10-09: held to a grammar
    // without them, Qwen3-4B wrote `objectref: "ScoreDisplay"` where it meant a child object.
    // A child is always `object` (one level down the parser reads `orb "x"` as a property
    // name) and carries its traits in its body: inside a template the parser refuses
    // `object "c" @g(1) {`, and a `using` grandchild of `object "c" @m {`.
    'object-item ::= trait | property | animation | state-block | behavior | child-object',
    `child-object ::= "object" sp string (sp "using" sp string)? hs "{" ws ${items('object-item')} ws "}"`,
    `template ::= "template" sp string hs "{" ws ${items('template-item')} ws "}"`,
    // In a template body `@version` is the schema version and takes only `(N)`.
    'template-item ::= template-trait | property | animation | state-block | behavior | child-object',
    'template-trait ::= "@" trait-name (trait-args | hs props)? | "@version(" [0-9]+ ")"',
    `group ::= "spatial_group" sp string hs "{" ws ${items('group-item')} ws "}"`,
    'group-item ::= group-property | object | group',
    'trigger ::= "trigger" sp string hs props',
    'environment ::= "environment" hs props',
    'light ::= "light" (sp string)? hs props',
    // An effect is a block (`bloom { intensity: 0.3 }`) or a property
    // (`bloom: { intensity: 0.3 }`, `tone_mapping: "aces"`); commas between them are optional.
    'post-processing ::= "post_processing" hs "{" ws (effect (effect-sep effect)*)? ws "}"',
    'effect ::= group-name hs props | group-property',
    'effect-sep ::= wsp | ws "," ws',
    // A state machine needs a non-empty name; the parser refuses `state_machine ""`.
    `state-machine ::= "state_machine" sp "\\"" str-char+ "\\"" hs "{" ws ${items('machine-item')} ws "}"`,
    'machine-item ::= machine-property | machine-state',
    'machine-property ::= machine-name hs ":" hs value (hs ",")?',
    `machine-state ::= "state" sp string hs "{" ws ${items('state-item')} ws "}"`,
    'state-item ::= machine-property | state-transitions',
    // A state's transitions are blocks whose pairs are separated by whitespace, never by
    // commas (`{ target: "b", event: "go" }` is an error); a comma may follow a block on
    // the same line (`}` then a line break then `,` is an error).
    'state-transitions ::= "transitions" hs ":" hs "[" ws (transition (transition-sep transition)* (hs ",")?)? ws "]"',
    'transition-sep ::= wsp | hs "," ws',
    `transition ::= "{" ws ${items('transition-pair')} ws "}"`,
    // `from` takes only a string (the parser lower-cases it; `from: 1` throws), so the
    // names exclude it with the other group keywords and it is written here.
    'transition-pair ::= group-name hs ":" hs value | "from" hs ":" hs string',
    'animation ::= "animation" sp string hs props',
    'state-block ::= "state" hs props',
    'behavior ::= "behavior" sp string hs props',
    // Primitive and material bodies refuse the group-position keywords too
    // (`cube { emit: 1 }` is "Unexpected token in primitive object: EMIT").
    `material ::= material-kw sp string (sp header-trait)* hs "{" ws ${items('trait-or-body-property')} ws "}"`,
    `primitive ::= prim-shape (sp string)? hs "{" ws ${items('trait-or-body-property')} ws "}"`,
    'trait-or-body-property ::= trait | body-property',
    'body-property ::= group-name hs ":" hs value (hs ",")?',
    '',
    `object-kw ::= ${literalAlternation(objectKeywords)}`,
    `material-kw ::= ${literalAlternation(materialKeywords)}`,
    `prim-shape ::= ${literalAlternation(primitiveShapes)}`,
    '',
    `props ::= "{" ws ${items('property')} ws "}"`,
    'property ::= name hs ":" hs value (hs ",")?',
    // A spatial group refuses a comma after a property (`origin: [0, 1, 0],`).
    'group-property ::= group-name hs ":" hs value',
    '',
    '# A trait in a body may carry a settings block (`@grabbable { hand: "both" }`);',
    '# before an object body (`object "X" @grabbable {`) the brace is the body.',
    'trait ::= "@" ident (trait-args | hs props)?',
    'header-trait ::= "@" ident trait-args?',
    'trait-args ::= "(" ws (arg (hs "," ws arg)*)? ws ")"',
    'arg ::= (group-name hs ":" hs)? value',
    '',
    'value ::= number | string | boolean | null | array | inline-object',
    'array ::= "[" ws (value (ws "," ws value)*)? ws "]"',
    'inline-object ::= "{" ws (pair (ws "," ws pair)*)? ws "}"',
    // An inline-object key may be quoted (`{ "closed": { ... } }`); held to bare names only,
    // Qwen3-4B dropped a state it had written quoted.
    'pair ::= (name | string) hs ":" hs value',
    '',
    'number ::= "-"? [0-9]+ ("." [0-9]+)?',
    'boolean ::= "true" | "false"',
    'null ::= "null"',
    'string ::= "\\"" str-char* "\\""',
    'str-char ::= [^"\\\\\\n\\r] | escape',
    'escape ::= "\\\\" ( "\\"" | "\\\\" | "\'" | "n" | "t" | "r" )',
    'ident ::= [a-zA-Z_] ident-tail',
    'ident-tail ::= [a-zA-Z0-9_]*',
    '',
    '# Property names: identifiers minus the keywords the parser refuses there.',
    ...identExcluding('name', RESERVED_PROPERTY_NAMES),
    '',
    '# Group property, trait-argument and effect names exclude a few more.',
    ...identExcluding('group-name', [...RESERVED_PROPERTY_NAMES, ...RESERVED_GROUP_NAMES]),
    '',
    '# State-machine property names exclude the keys its parser reads itself.',
    ...identExcluding('machine-name', [...RESERVED_PROPERTY_NAMES, ...RESERVED_MACHINE_NAMES]),
    '',
    '# Template trait names: any identifier but `version` (written as `@version(N)`).',
    ...identExcluding('trait-name', ['version']),
    '',
    'sp ::= [ \\t]+',
    'hs ::= [ \\t]*',
    'ws ::= ([ \\t\\n\\r] | comment)*',
    'wsp ::= ([ \\t\\n\\r] | comment)+',
    'comment ::= "//" [^\\n]* "\\n"',
    '',
  ].join('\n');
}

/**
 * Generate a llama.cpp GBNF grammar constraining output to HoloScript: by default one
 * whole `composition` program, or the root-less first subset with `root: 'definitions'`.
 * The result is deterministic (stable rule order) so it hashes and diffs cleanly.
 */
export function generateHoloScriptGbnf(options: HoloScriptGbnfOptions = {}): string {
  return (options.root ?? 'composition') === 'definitions'
    ? definitionsGrammar(options)
    : compositionGrammar(options);
}

/**
 * The canonical preset names accepted by `@llama_serve { grammar: "<preset>" }`:
 * `holoscript` is the whole-program grammar; `holoscript-subset` is the root-less first
 * subset, kept only to re-derive receipts that name it (its output often fails to parse).
 */
export const HOLOSCRIPT_GRAMMAR_PRESETS = ['holoscript', 'holoscript-subset'] as const;
export type HoloScriptGrammarPreset = (typeof HOLOSCRIPT_GRAMMAR_PRESETS)[number];

/** True when a `grammar:` value names a built-in HoloScript GBNF preset (vs an inline grammar). */
export function isHoloScriptGrammarPreset(value: string): value is HoloScriptGrammarPreset {
  return (HOLOSCRIPT_GRAMMAR_PRESETS as readonly string[]).includes(value);
}

/** The GBNF a preset names, and the bundle path it is written to. */
export function holoScriptGrammarForPreset(preset: HoloScriptGrammarPreset): {
  path: string;
  content: string;
} {
  return preset === 'holoscript-subset'
    ? {
        path: 'grammars/holoscript-subset.gbnf',
        content: generateHoloScriptGbnf({ root: 'definitions' }),
      }
    : { path: 'grammars/holoscript.gbnf', content: generateHoloScriptGbnf() };
}
