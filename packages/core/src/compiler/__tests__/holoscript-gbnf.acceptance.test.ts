/**
 * The whole-program grammar guard, checked against the language instead of by substring.
 *
 * A grammar handed to a local model is worth something only when (1) the programs we
 * teach are in its language and (2) everything in its language parses. Both are checked
 * here with a real GBNF reader (gbnf-matcher.ts): the quickstart scenes and the 14
 * author_holo reference answers must be accepted, junk must be refused, and hundreds of
 * programs sampled from the grammar must parse with zero errors under parseHolo and the
 * strict layer. The reserved property-name lists are re-measured against the parser.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  generateHoloScriptGbnf,
  holoScriptGrammarForPreset,
  RESERVED_GROUP_NAMES,
  RESERVED_PROPERTY_NAMES,
} from '../holoscript-gbnf';
import { parseHolo, tokenizeHoloSource } from '../../parser/HoloCompositionParser';
import { KEYWORDS, PRIMITIVE_SHAPES } from '../../parser/composition/tokens';
import { analyze } from '../../../strict/holo_strict.mjs';
import { gbnfAccepts, parseGbnf, referencedRules, sampleGbnf, seededRandom } from './gbnf-matcher';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..');
const grammar = parseGbnf(generateHoloScriptGbnf());

interface Diagnostic {
  code: string;
  severity: string;
  message: string;
}

/** Parse errors plus strict-layer errors (warnings such as an unknown trait name are allowed). */
function errorsOf(source: string): string[] {
  const parsed = parseHolo(source);
  const parseErrors = (parsed.errors ?? []).map((e) => `parse: ${e.message}`);
  if (!parsed.success && parseErrors.length === 0) parseErrors.push('parse: success=false');
  const strict = analyze(source, { tokenizeHoloSource, parseHolo, traitIds: new Set<string>() });
  const strictErrors = (strict.diagnostics as Diagnostic[])
    .filter((d) => d.severity === 'error')
    .map((d) => `${d.code}: ${d.message}`);
  return [...parseErrors, ...strictErrors];
}

const QUICKSTART = [
  '1-floating-cyan-orb.holo',
  '1-floating-cyan-orb.refreshed.holo',
  '2-red-cube-teal-button.holo',
  '3-ball-ramp-with-bouncy-spheres.holo',
  '4-networked-spheres.holo',
  '5-color-button-panel.holo',
];

// The `reference` answers of the 14 author_holo rows in ai-ecosystem
// research/holoai-academy-v0/brittney-edge-coding-benchmark.v0.jsonl (sha256 b848749f…),
// copied verbatim. A model held to the grammar must still be able to write each of them.
const REFERENCE_ANSWERS: Record<string, string> = {
  'hc-01': 'composition "Beacon" {\n  object "lamp" {\n    brightness: 0.8\n  }\n}',
  'hc-02':
    'composition "Room" {\n  spatial_group "walls" {\n    object "north" {\n      material: "brick"\n    }\n    object "south" {\n      material: "brick"\n    }\n  }\n}',
  'hc-03':
    'composition "Playground" {\n  object "ball" {\n    @grabbable\n    @glowing\n    geometry: "sphere"\n  }\n}',
  'hc-04': 'composition "Yard" {\n  object "wall" {\n    material: "brick"\n  }\n}',
  'hc-05':
    'composition "Gallery" {\n  template "ArtPiece" {\n    @hoverable\n    @billboard\n  }\n  object "piece1" using "ArtPiece" {\n    geometry: "plane"\n  }\n}',
  'hc-06':
    'composition "Foyer" {\n  trigger "doorbell" {\n    on: "press"\n    emit: "door.ring"\n  }\n  object "door" {\n    @on_event("door.ring")\n    geometry: "cube"\n  }\n}',
  'hc-07':
    'composition "Scoreboard" {\n  template "Board" {\n    state {\n      score: 0\n      label: "idle"\n    }\n  }\n}',
  'hc-08':
    'composition "Library" {\n  spatial_group "shelf" {\n    origin: [0, 1, -2]\n    object "bookA" {\n      geometry: "cube"\n    }\n    object "bookB" {\n      geometry: "cube"\n    }\n  }\n}',
  'hc-09':
    'composition "Night" {\n  environment {\n    backgroundColor: "#0a0a12"\n    ambient_light: 0.4\n  }\n  object "ground" {\n    geometry: "plane"\n  }\n}',
  'hc-10':
    'composition "Pulse" {\n  object "orb" {\n    geometry: "sphere"\n    animation "fadeIn" {\n      property: "opacity"\n      from: 0\n      to: 0.95\n      duration: 500\n      easing: "easeOutCubic"\n    }\n  }\n}',
  'hc-11':
    'composition "Plant" {\n  template "TempSensor" {\n    @sensor\n    behavior "IoTSensor" { protocol: "MQTT", qos: 1, samplingHz: 0.5 }\n  }\n}',
  'hc-12':
    'composition "Stage" {\n  object "prop" {\n    geometry: "cube"\n    position: [0, 1.4, -2.2]\n    scale: [2, 2, 1]\n  }\n}',
  'hc-13':
    'composition "Notes" {\n  // marker anchors the demo\n  object "marker" {\n    geometry: "sphere"\n  }\n}',
  'hc-14':
    'composition "Portal" {\n  state_machine "door" {\n    initial: "closed"\n    state "closed" { on: { open: "opened" } }\n    state "opened" { on: { close: "closed" } }\n  }\n}',
};

// What Qwen3-4B wrote for two author_holo tasks WITHOUT the grammar (Jetson, temperature 0,
// 2026-10-09). Both parse; an earlier grammar refused them (no child objects in a
// template, no quoted inline-object keys), and held to it the model wrote
// `objectref: "ScoreDisplay"` for the first and dropped a state from the second.
const UNCONSTRAINED_QWEN: Record<string, string> = {
  'hc-07':
    'composition "Scoreboard" {\n  template "Board" {\n    state {\n      score: 0\n      label: "idle"\n    }\n    object "ScoreDisplay" {\n      @pointable\n      @hoverable\n      geometry: "text"\n      position: [0, 1.5, 0]\n      scale: 0.5\n      material: { baseColor: "#ffffff", roughness: 0.8, metallic: 0.0 }\n      text: "Score: {score}"\n    }\n    object "StatusLabel" {\n      @pointable\n      @hoverable\n      geometry: "text"\n      position: [0, 0.5, 0]\n      scale: 0.5\n      material: { baseColor: "#ffffff", roughness: 0.8, metallic: 0.0 }\n      text: "Label: {label}"\n    }\n  }\n}',
  'hc-14':
    'composition "Portal" {\n  object "Door" {\n    @collidable\n    @physics\n    @state_machine {\n      initial: "closed"\n      states: {\n        "closed": {\n          transitions: {\n            "open": { condition: "triggered", action: "set state to \'opened\'" }\n          }\n        },\n        "opened": {\n          transitions: {\n            "close": { condition: "triggered", action: "set state to \'closed\'" }\n          }\n        }\n      }\n    }\n    geometry: "plane"\n    position: [0, 1, 0]\n    scale: [2, 0.5, 2]\n    material: { baseColor: "#333333", roughness: 0.8, metallic: 0.1 }\n  }\n}',
};

describe('whole-program HoloScript grammar (composition root)', () => {
  it.each(Object.entries(UNCONSTRAINED_QWEN))(
    'accepts what Qwen3-4B wrote unconstrained for %s',
    (_id, source) => {
      expect(errorsOf(source)).toEqual([]);
      expect(gbnfAccepts(grammar, source)).toBe(true);
    }
  );

  it('is well-formed: every referenced rule is defined and every rule is reachable', () => {
    const referenced = referencedRules(grammar);
    for (const name of referenced) expect(grammar.has(name), `undefined rule ${name}`).toBe(true);
    for (const name of grammar.keys()) {
      if (name !== 'root') expect(referenced.has(name), `unreachable rule ${name}`).toBe(true);
    }
  });

  it.each(QUICKSTART)('accepts examples/quickstart/%s', (file) => {
    const source = readFileSync(join(repoRoot, 'examples', 'quickstart', file), 'utf8');
    expect(errorsOf(source)).toEqual([]);
    expect(gbnfAccepts(grammar, source)).toBe(true);
  });

  it.each(Object.entries(REFERENCE_ANSWERS))(
    'accepts benchmark reference answer %s',
    (_id, source) => {
      expect(errorsOf(source)).toEqual([]);
      expect(gbnfAccepts(grammar, source)).toBe(true);
    }
  );

  const NEGATIVES: Record<string, string> = {
    prose: 'Here is your scene: a red cube on a table.',
    JSON: '{"composition": "Room", "objects": [{"name": "cube"}]}',
    'empty input': '',
    'a root-less object': 'object "Cube" {\n  geometry: "cube"\n}',
    'two roots': 'composition "A" {\n  object "a" {}\n}\ncomposition "B" {\n  object "b" {}\n}',
    'a markdown fence': '```holo\ncomposition "A" {\n  object "a" {}\n}\n```',
    'prose after the program': 'composition "A" {\n  object "a" {}\n}\nThat is the scene.',
    'an empty composition': 'composition "A" {\n}',
    'a nameless composition': 'composition {\n  object "a" {}\n}',
    '`object` as a property name': 'composition "A" {\n  object "a" {\n    object: 1\n  }\n}',
    '`if` as a template property': 'composition "A" {\n  template "T" {\n    if: true\n  }\n}',
    // The lexer looks keywords up in lower case, so these are keywords too.
    '`Object` as a property name': 'composition "A" {\n  object "a" {\n    Object: 1\n  }\n}',
    '`VAR` in an environment': 'composition "A" {\n  environment {\n    VAR: 1\n  }\n}',
    // The parser refuses a line break here in several block kinds.
    'a line break between a property and its value':
      'composition "A" {\n  object "a" {\n    x:\n 1\n  }\n}',
    'a line break before a light body': 'composition "A" {\n  light "L"\n  {\n    x: 1\n  }\n}',
    'a comma after a group property':
      'composition "A" {\n  spatial_group "g" {\n    origin: [0, 1, 0],\n  }\n}',
    // `@m` then `Nd: 1` with no space between would lex as the trait `@mNd`.
    'a trait fused to the next property': 'composition "A" {\n  object "a" {\n    @mNd: 1\n  }\n}',
    'an unnamed state machine': 'composition "A" {\n  state_machine "" {\n    initial: "a"\n  }\n}',
    '`emit` as a group property': 'composition "A" {\n  spatial_group "g" {\n    emit: 1\n  }\n}',
    'an exponent number': 'composition "A" {\n  object "a" {\n    x: 1e3\n  }\n}',
    'an unterminated string': 'composition "A" {\n  object "a" {\n    x: "open\n  }\n}',
    'a named environment': 'composition "A" {\n  environment "e" {\n    x: 1\n  }\n}',
  };
  it.each(Object.entries(NEGATIVES))('refuses %s', (_label, source) => {
    expect(gbnfAccepts(grammar, source)).toBe(false);
  });

  it('every one of 400 programs sampled from the grammar parses with zero errors', () => {
    const failures: string[] = [];
    let accepted = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const program = sampleGbnf(grammar, seededRandom(seed));
      if (gbnfAccepts(grammar, program)) accepted++;
      const errors = errorsOf(program);
      if (errors.length) failures.push(`seed ${seed}: ${errors[0]}\n${program}`);
    }
    // The reader agrees with the sampler, or the acceptance checks above prove nothing.
    expect(accepted).toBe(400);
    expect(failures.slice(0, 3)).toEqual([]);
  }, 120_000);

  it('the reserved property names are exactly the keywords the parser refuses there', () => {
    const words = [...new Set([...Object.keys(KEYWORDS), ...PRIMITIVE_SHAPES])];
    const at = (body: string) => `composition "C" {\n${body}\n}`;
    const propertyPositions: Array<(k: string) => string> = [
      (k) => at(`  object "o" {\n    ${k}: 1\n  }`),
      (k) => at(`  template "T" {\n    ${k}: 1\n  }`),
      (k) => at(`  environment {\n    ${k}: 1\n  }`),
      (k) => at(`  light "L" {\n    ${k}: 1\n  }`),
      (k) => at(`  trigger "t" {\n    ${k}: 1\n  }`),
      (k) => at(`  template "T" {\n    state {\n      ${k}: 1\n    }\n  }`),
      (k) => at(`  template "T" {\n    behavior "B" {\n      ${k}: 1\n    }\n  }`),
      (k) => at(`  object "o" {\n    animation "a" {\n      ${k}: 1\n    }\n  }`),
      (k) => at(`  state_machine "d" {\n    ${k}: 1\n  }`),
      (k) => at(`  state_machine "d" {\n    state "s" {\n      ${k}: 1\n    }\n  }`),
      (k) => at(`  post_processing {\n    bloom {\n      ${k}: 1\n    }\n  }`),
      (k) => at(`  object "o" {\n    m: { ${k}: 1 }\n  }`),
    ];
    const groupPositions: Array<(k: string) => string> = [
      (k) => at(`  spatial_group "g" {\n    ${k}: 1\n  }`),
      (k) => at(`  object "o" {\n    @physics(${k}: 1)\n  }`),
      (k) => at(`  post_processing {\n    ${k} {\n      a: 1\n    }\n  }`),
    ];
    const refused = (positions: Array<(k: string) => string>) =>
      words.filter((k) => positions.some((mk) => errorsOf(mk(k)).length > 0)).sort();

    const property = refused(propertyPositions);
    expect(property).toEqual([...RESERVED_PROPERTY_NAMES].sort());
    const group = refused(groupPositions).filter((k) => !property.includes(k));
    expect(group).toEqual([...RESERVED_GROUP_NAMES].sort());
  }, 120_000);
});

describe('grammar presets', () => {
  it('`holoscript` is the whole-program grammar', () => {
    const { path, content } = holoScriptGrammarForPreset('holoscript');
    expect(path).toBe('grammars/holoscript.gbnf');
    expect(content).toBe(generateHoloScriptGbnf());
    expect(content).toContain('root ::= ws composition ws');
  });

  it('`holoscript-subset` is the root-less first subset, byte-identical to the grammar before the composition root', () => {
    const { path, content } = holoScriptGrammarForPreset('holoscript-subset');
    expect(path).toBe('grammars/holoscript-subset.gbnf');
    expect(createHash('sha256').update(content).digest('hex')).toBe(
      '902d2c9ecfc3783f95b38c1da79be8fa657ef733638cecbeee359824427d743a'
    );
  });
});
