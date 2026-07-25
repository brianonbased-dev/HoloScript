import {
  HoloCompositionParser,
  tokenizeHoloSource,
  type HoloSourceToken,
} from '@holoscript/core/parser';
import {
  HEADLESS_EXPERIMENT_HASH_ALGORITHM,
  canonicalizeHeadlessValue,
  hashHeadlessValue,
  type HeadlessExperimentVerificationResult,
} from '@holoscript/engine/runtime';

export const PURE_HOLO_WORLD_PROJECTION = 'holoscript-cli-pure-world-projection-v1' as const;
export const DETERMINISTIC_HOLO_WORLD_PROJECTION =
  'holoscript-core-parser-static-object-projection-v2' as const;
export const HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA =
  'holoscript.holo-world-projection-provenance.v2' as const;
export const HOLO_WORLD_PROJECTION_COVERAGE =
  'static-object-declarations-no-lifecycle-v1' as const;

const MAX_WORLD_SOURCE_BYTES = 256 * 1024;
const MAX_WORLD_PROVENANCE_BYTES = 4 * 1024;
const MAX_WORLD_OBJECTS = 2_048;
const MAX_WORLD_NESTING_DEPTH = 64;
const MAX_STATIC_VALUE_DEPTH = 32;
const MAX_WORLD_PROJECTED_BYTES = 8 * 1024 * 1024;
const MAX_WORLD_PROJECTED_NODES = 500_000;
const MAX_WORLD_PROJECTED_STRUCTURE_DEPTH = 96;
const HOLO_WORLD_PROJECTION_PARSER =
  '@holoscript/core/HoloCompositionParser.parse' as const;
const HOLO_WORLD_PROJECTION_PARSER_OPTIONS = Object.freeze({
  locations: true,
  tolerant: false,
  strict: false,
} as const);
const STATIC_PROJECTION_TOKEN_TYPES = new Set([
  'AT',
  'BOOLEAN',
  'COLON',
  'COMMA',
  'COMPOSITION',
  'EOF',
  'IDENTIFIER',
  'LBRACE',
  'LBRACKET',
  'MATERIAL',
  'NEWLINE',
  'NULL',
  'NUMBER',
  'OBJECT',
  'RBRACE',
  'RBRACKET',
  'SHAPE',
  'SPATIAL_GROUP',
  'STRING',
  'TEMPLATE',
  'USING',
]);

interface HeadlessSceneNode extends Record<string, unknown> {
  type?: unknown;
  id?: unknown;
  name?: unknown;
  template?: unknown;
  groupPath?: unknown;
  properties?: unknown;
  traits?: unknown;
  directives?: unknown;
  children?: unknown;
}

export interface HoloWorldProjectionProvenance {
  schema: typeof HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA;
  engine: typeof DETERMINISTIC_HOLO_WORLD_PROJECTION;
  hashAlgorithm: typeof HEADLESS_EXPERIMENT_HASH_ALGORITHM;
  sourceHash: string;
  coverage: typeof HOLO_WORLD_PROJECTION_COVERAGE;
  parser: {
    implementation: typeof HOLO_WORLD_PROJECTION_PARSER;
    options: {
      locations: true;
      tolerant: false;
      strict: false;
    };
  };
  result: {
    sceneHash: string;
    posePhysicsHash: string;
    objectCount: number;
  };
  provenanceCommitment: string;
}

export interface HoloWorldProjectionExecution {
  scene: Record<string, unknown>;
  posePhysics: Record<string, unknown>;
  provenance: HoloWorldProjectionProvenance;
}

export interface HoloWorldProjectionVerificationOptions {
  expectedSource: string;
  expectedScene?: unknown;
  expectedPosePhysics?: unknown;
}

interface HoloParseErrorLike {
  message?: unknown;
  code?: unknown;
  loc?: { line?: unknown };
}

function fail(message: string): never {
  throw new Error(`Holo world projection: ${message}`);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function assertProjectedSize(value: unknown, label: string): void {
  const stack: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let nodeCount = 0;
  let stringCodeUnits = 0;

  while (stack.length > 0) {
    const current = stack.pop()!;
    nodeCount += 1;
    if (nodeCount > MAX_WORLD_PROJECTED_NODES) {
      fail(`${label} exceeds ${MAX_WORLD_PROJECTED_NODES} value nodes`);
    }
    if (current.depth > MAX_WORLD_PROJECTED_STRUCTURE_DEPTH) {
      fail(
        `${label} structure exceeds depth ${MAX_WORLD_PROJECTED_STRUCTURE_DEPTH}`
      );
    }
    if (typeof current.value === 'string') {
      stringCodeUnits += current.value.length;
    } else if (
      current.value === null ||
      typeof current.value === 'boolean'
    ) {
      // JSON scalar.
    } else if (
      typeof current.value === 'number' &&
      Number.isFinite(current.value)
    ) {
      // JSON scalar.
    } else if (Array.isArray(current.value)) {
      if (
        nodeCount + stack.length + current.value.length >
        MAX_WORLD_PROJECTED_NODES
      ) {
        fail(`${label} exceeds ${MAX_WORLD_PROJECTED_NODES} value nodes`);
      }
      for (const entry of current.value) {
        stack.push({ value: entry, depth: current.depth + 1 });
      }
    } else if (isRecord(current.value)) {
      for (const key in current.value) {
        if (!Object.prototype.hasOwnProperty.call(current.value, key)) continue;
        if (nodeCount + stack.length + 1 > MAX_WORLD_PROJECTED_NODES) {
          fail(`${label} exceeds ${MAX_WORLD_PROJECTED_NODES} value nodes`);
        }
        stringCodeUnits += key.length;
        stack.push({ value: current.value[key], depth: current.depth + 1 });
      }
    } else {
      fail(`${label} must contain only finite JSON values`);
    }
    if (stringCodeUnits > MAX_WORLD_PROJECTED_BYTES) {
      fail(`${label} exceeds ${MAX_WORLD_PROJECTED_BYTES} string code units`);
    }
  }

  if (byteLength(canonicalizeHeadlessValue(value)) > MAX_WORLD_PROJECTED_BYTES) {
    fail(`${label} exceeds ${MAX_WORLD_PROJECTED_BYTES} bytes`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function assertExactKeys(value: unknown, expected: readonly string[], label: string): void {
  if (!isRecord(value)) fail(`${label} must be an object`);
  const allowed = new Set(expected);
  let actualCount = 0;
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    actualCount += 1;
    if (actualCount > expected.length || !allowed.has(key)) {
      fail(`${label} fields do not match the sealed contract`);
    }
  }
  if (
    actualCount !== expected.length ||
    expected.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    fail(`${label} fields do not match the sealed contract`);
  }
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length !== 64 ||
    !/^[a-f0-9]{64}$/.test(value)
  ) {
    fail(`${label} must be a lowercase SHA-256 digest`);
  }
}

function formatParserDiagnostics(diagnostics: HoloParseErrorLike[]): string {
  return diagnostics
    .map((diagnostic) => {
      const line =
        typeof diagnostic.loc?.line === 'number' ? `line ${diagnostic.loc.line}: ` : '';
      const code = typeof diagnostic.code === 'string' ? `[${diagnostic.code}] ` : '';
      return `${line}${code}${String(diagnostic.message ?? 'unknown parser diagnostic')}`;
    })
    .join('; ');
}

function propertyListToRecord(properties: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const property of Array.isArray(properties) ? properties : []) {
    const entry = asRecord(property);
    if (typeof entry.key === 'string') {
      result[entry.key] = entry.value;
    }
  }
  return result;
}

function stateBlockToRecord(state: unknown): Record<string, unknown> {
  return propertyListToRecord(asRecord(state).properties);
}

function normalizePhysicsAliasLayer(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const normalized = { ...properties };
  const massKg = properties.massKg ?? properties.mass_kg ?? properties.mass;
  const shape = properties.shape ?? properties.geometry;
  if (massKg !== undefined) normalized.massKg = massKg;
  if (shape !== undefined) normalized.shape = shape;
  return normalized;
}

function normalizeHeadlessScenePropertyAliases(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const normalized = { ...properties };
  if (normalized.geometry === undefined && normalized.shape !== undefined) {
    normalized.geometry = normalized.shape;
  }
  const massKg = normalized.massKg ?? normalized.mass_kg ?? normalized.mass;
  if (massKg !== undefined) normalized.massKg = massKg;
  return normalized;
}

export function normalizeHeadlessSceneProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const normalized = normalizeHeadlessScenePropertyAliases(properties);
  const material = asRecord(normalized.material);

  if (typeof normalized.geometry === 'string') {
    normalized.geometry = normalized.geometry.toLowerCase();
  }

  for (const key of ['color', 'roughness', 'opacity', 'transparent'] as const) {
    if (normalized[key] === undefined && material[key] !== undefined) {
      normalized[key] = material[key];
    }
  }

  if (normalized.metallic === undefined && material.metalness !== undefined) {
    normalized.metallic = material.metalness;
  }

  if (typeof normalized.scale === 'number' && Number.isFinite(normalized.scale)) {
    normalized.scale = [normalized.scale, normalized.scale, normalized.scale];
  }

  if (normalized.scale === undefined && typeof normalized.radius === 'number') {
    const diameter = normalized.radius * 2;
    normalized.scale =
      ['capsule', 'cone', 'cylinder'].includes(String(normalized.geometry)) &&
      typeof normalized.height === 'number'
        ? [diameter, normalized.height, diameter]
        : [diameter, diameter, diameter];
  }

  if (
    normalized.scale === undefined &&
    (typeof normalized.width === 'number' ||
      typeof normalized.height === 'number' ||
      typeof normalized.depth === 'number')
  ) {
    normalized.scale = [
      normalized.width ?? 1,
      normalized.height ?? 1,
      normalized.depth ?? 1,
    ];
  }

  delete normalized.__templateRef;
  return normalized;
}

function traitListsToMap(...traitLists: unknown[]): Map<string, Record<string, unknown>> {
  const traits = new Map<string, Record<string, unknown>>();

  for (const traitList of traitLists) {
    for (const trait of Array.isArray(traitList) ? traitList : []) {
      const entry = asRecord(trait);
      if (typeof entry.name !== 'string') continue;
      const rawConfig = { ...asRecord(entry.config) };
      const config =
        entry.name === 'physics'
          ? normalizePhysicsAliasLayer(rawConfig)
          : rawConfig;
      if (Array.isArray(entry.args) && entry.args.length > 0) {
        config.args = entry.args;
      }
      traits.set(entry.name, {
        ...traits.get(entry.name),
        ...config,
      });
    }
  }

  return traits;
}

function holoTemplateMap(composition: unknown): Map<string, Record<string, unknown>> {
  const templates = new Map<string, Record<string, unknown>>();
  const root = asRecord(composition);
  for (const template of Array.isArray(root.templates) ? root.templates : []) {
    const entry = asRecord(template);
    if (typeof entry.name === 'string') {
      templates.set(entry.name, entry);
    }
  }
  return templates;
}

function hasProjectedContent(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

const STATIC_PROJECTION_LIFECYCLE_KEYS = new Set([
  'action',
  'actions',
  'animate',
  'animated',
  'animation',
  'animations',
  'async',
  'await',
  'behavior',
  'behaviors',
  'behavior_tree',
  'behaviortree',
  'call',
  'condition',
  'conditional',
  'conditionals',
  'else',
  'emit',
  'event',
  'event_handler',
  'eventhandler',
  'events',
  'for',
  'foreach',
  'function',
  'functions',
  'handler',
  'handlers',
  'if',
  'iterator',
  'iterators',
  'lifecycle',
  'logic',
  'loop',
  'method',
  'methods',
  'on',
  'parallel',
  'reaction',
  'reactions',
  'schedule',
  'scheduler',
  'script',
  'scripts',
  'sequence',
  'state',
  'state_machine',
  'statemachine',
  'task',
  'tasks',
  'timeline',
  'timelines',
  'timer',
  'timers',
  'transition',
  'transitions',
  'trigger',
  'triggers',
  'update',
  'while',
]);

const STATIC_PROJECTION_PROPERTY_KEYS = new Set([
  'alpha_map',
  'ambient_light',
  'angle',
  'angular_damping',
  'ao_map',
  'asset',
  'cast_shadow',
  'cast_shadows',
  'center',
  'clearcoat',
  'clearcoat_roughness',
  'collidable',
  'collision_group',
  'collision_mask',
  'color',
  'decay',
  'depth',
  'description',
  'directional_light',
  'emission_color',
  'emission_intensity',
  'emissive',
  'emissive_color',
  'emissive_map',
  'env_map',
  'env_map_intensity',
  'friction',
  'geometry',
  'gravity',
  'height',
  'hemisphere_light',
  'id',
  'intensity',
  'ior',
  'kinematic',
  'linear_damping',
  'map',
  'mass',
  'mass_kg',
  'material',
  'metallic',
  'metalness',
  'metalness_map',
  'model',
  'name',
  'normal_map',
  'normal_scale',
  'opacity',
  'penumbra',
  'physics',
  'point_light',
  'position',
  'quaternion',
  'radius',
  'range',
  'receive_shadow',
  'representation',
  'restitution',
  'rotation',
  'roughness',
  'roughness_map',
  'scale',
  'shape',
  'side',
  'sleep_threshold',
  'spot_light',
  'static',
  'target',
  'texture',
  'thickness',
  'transmission',
  'transparent',
  'type',
  'uri',
  'url',
  'visible',
  'width',
  'x',
  'y',
  'z',
  'w',
]);

const STATIC_PROJECTION_TRAIT_NAMES = new Set([
  'collidable',
  'emissive',
  'physics',
  'static',
]);

function normalizeStaticIdentifier(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase();
}

function isLifecyclePropertyKey(key: string): boolean {
  const lowered = key.toLowerCase();
  const normalized = normalizeStaticIdentifier(key);
  return (
    STATIC_PROJECTION_LIFECYCLE_KEYS.has(lowered) ||
    STATIC_PROJECTION_LIFECYCLE_KEYS.has(normalized) ||
    lowered.startsWith('on_') ||
    normalized.startsWith('on_')
  );
}

function isStaticPropertyKey(key: string): boolean {
  return (
    key === normalizeStaticIdentifier(key) &&
    STATIC_PROJECTION_PROPERTY_KEYS.has(key)
  );
}

function isStaticTraitName(name: string): boolean {
  return (
    name === normalizeStaticIdentifier(name) &&
    STATIC_PROJECTION_TRAIT_NAMES.has(name)
  );
}

function assertNoSkippedHoloCharacters(source: string): void {
  const singleCharacterTokens = new Set('{}[]():,.=+-*/<>!@#;?');
  let index = 0;

  while (index < source.length) {
    const current = source[index];
    const next = source[index + 1];

    if (
      current === ' ' ||
      current === '\t' ||
      current === '\r' ||
      current === '\n'
    ) {
      index += 1;
      continue;
    }
    if (current === '/' && next === '/') {
      index += 2;
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (current === '/' && next === '*') {
      index += 2;
      let closed = false;
      while (index < source.length) {
        if (source[index] === '*' && source[index + 1] === '/') {
          index += 2;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) fail('source contains an unterminated block comment');
      continue;
    }
    if (current === '"' || current === "'") {
      const quote = current;
      index += 1;
      let closed = false;
      while (index < source.length) {
        if (source[index] === '\\') {
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          closed = true;
          break;
        }
        index += 1;
      }
      if (!closed) fail('source contains an unterminated string');
      continue;
    }
    if (/[A-Za-z_]/.test(current)) {
      index += 1;
      while (index < source.length && /[A-Za-z0-9_]/.test(source[index])) {
        index += 1;
      }
      continue;
    }
    if (/[0-9]/.test(current)) {
      index += 1;
      while (index < source.length && /[0-9]/.test(source[index])) index += 1;
      if (
        source[index] === '.' &&
        index + 1 < source.length &&
        /[0-9]/.test(source[index + 1])
      ) {
        index += 1;
        while (index < source.length && /[0-9]/.test(source[index])) index += 1;
      }
      continue;
    }
    if (current === '&' || current === '|') {
      if (next !== current) {
        fail(`source contains unknown character ${JSON.stringify(current)} at offset ${index}`);
      }
      index += 2;
      continue;
    }
    if (singleCharacterTokens.has(current)) {
      index += 1;
      continue;
    }
    fail(`source contains unknown character ${JSON.stringify(current)} at offset ${index}`);
  }
}

class StaticProjectionTokenParser {
  private readonly tokens: HoloSourceToken[];
  private position = 0;
  private objectCount = 0;

  constructor(tokens: HoloSourceToken[]) {
    this.tokens = tokens.filter((token) => token.type !== 'NEWLINE');
  }

  parse(): void {
    this.expect('COMPOSITION', 'an explicit composition');
    this.expectName('composition');
    this.expect('LBRACE', 'composition body');
    while (!this.check('RBRACE')) {
      this.parseRootDeclaration();
    }
    this.expect('RBRACE', 'composition body');
    this.expect('EOF', 'end of source');
  }

  private current(): HoloSourceToken {
    return (
      this.tokens[this.position] ?? {
        type: 'EOF',
        value: '',
        line: 0,
        column: 0,
      }
    );
  }

  private check(type: string): boolean {
    return this.current().type === type;
  }

  private match(type: string): boolean {
    if (!this.check(type)) return false;
    this.position += 1;
    return true;
  }

  private expect(type: string, label: string): HoloSourceToken {
    const token = this.current();
    if (token.type !== type) {
      fail(
        `${label} expected ${type}, received ${token.type} (${JSON.stringify(token.value)}) at ${token.line}:${token.column}`
      );
    }
    this.position += 1;
    return token;
  }

  private expectName(label: string): HoloSourceToken {
    const token = this.current();
    if (token.type !== 'STRING' && token.type !== 'IDENTIFIER') {
      fail(
        `${label} name must be a string or identifier, received ${token.type} at ${token.line}:${token.column}`
      );
    }
    this.position += 1;
    return token;
  }

  private parseRootDeclaration(): void {
    if (this.check('TEMPLATE')) {
      this.parseTemplate();
      return;
    }
    if (this.check('OBJECT')) {
      this.parseObject(1);
      return;
    }
    if (this.check('SPATIAL_GROUP')) {
      this.parseSpatialGroup(1);
      return;
    }
    const token = this.current();
    fail(
      `root token ${token.type} (${JSON.stringify(token.value)}) is not a static declaration`
    );
  }

  private parseTemplate(): void {
    this.expect('TEMPLATE', 'template');
    const name = this.expectName('template').value;
    const propertyNames = new Set<string>();
    const traitNames = new Set<string>();
    this.expect('LBRACE', `template ${name}`);
    while (!this.check('RBRACE')) {
      if (this.check('AT')) {
        this.rememberTrait(
          traitNames,
          this.parseTrait(`template ${name}`, true),
          `template ${name}`
        );
      } else {
        this.rememberProperty(
          propertyNames,
          this.parseProperty(`template ${name}`),
          `template ${name}`
        );
      }
    }
    this.expect('RBRACE', `template ${name}`);
  }

  private parseObject(depth: number): void {
    if (depth > MAX_WORLD_NESTING_DEPTH) {
      fail(`object nesting exceeds ${MAX_WORLD_NESTING_DEPTH}`);
    }
    this.objectCount += 1;
    if (this.objectCount > MAX_WORLD_OBJECTS) {
      fail(`object count exceeds ${MAX_WORLD_OBJECTS}`);
    }
    this.expect('OBJECT', 'object');
    const name = this.expectName('object').value;
    const propertyNames = new Set<string>();
    const traitNames = new Set<string>();
    if (this.match('USING')) this.expectName(`object ${name} template`);
    while (this.check('AT')) {
      this.rememberTrait(
        traitNames,
        this.parseTrait(`object ${name}`, false),
        `object ${name}`
      );
    }
    this.expect('LBRACE', `object ${name}`);
    while (!this.check('RBRACE')) {
      if (this.check('OBJECT')) {
        this.parseObject(depth + 1);
      } else if (this.check('AT')) {
        this.rememberTrait(
          traitNames,
          this.parseTrait(`object ${name}`, true),
          `object ${name}`
        );
      } else {
        this.rememberProperty(
          propertyNames,
          this.parseProperty(`object ${name}`),
          `object ${name}`
        );
      }
    }
    this.expect('RBRACE', `object ${name}`);
  }

  private parseSpatialGroup(depth: number): void {
    if (depth > MAX_WORLD_NESTING_DEPTH) {
      fail(`spatial-group nesting exceeds ${MAX_WORLD_NESTING_DEPTH}`);
    }
    this.expect('SPATIAL_GROUP', 'spatial group');
    const name = this.expectName('spatial group').value;
    this.expect('LBRACE', `spatial group ${name}`);
    while (!this.check('RBRACE')) {
      if (this.check('OBJECT')) {
        this.parseObject(depth + 1);
      } else if (this.check('SPATIAL_GROUP')) {
        this.parseSpatialGroup(depth + 1);
      } else {
        const token = this.current();
        fail(
          `spatial group ${name} cannot contain ${token.type} (${JSON.stringify(token.value)})`
        );
      }
    }
    this.expect('RBRACE', `spatial group ${name}`);
  }

  private parseTrait(label: string, allowConfig: boolean): string {
    this.expect('AT', `${label} trait`);
    const name = this.expect('IDENTIFIER', `${label} trait name`).value;
    if (!isStaticTraitName(name)) {
      fail(`${label} uses trait ${name} outside the static trait profile`);
    }
    if (allowConfig && this.check('LBRACE')) {
      this.parseRecord(`${label} trait ${name}`, 1);
    }
    return name;
  }

  private parseProperty(label: string, valueDepth = 0): string {
    const token = this.current();
    if (!['IDENTIFIER', 'MATERIAL', 'SHAPE'].includes(token.type)) {
      fail(
        `${label} expected a static property, received ${token.type} (${JSON.stringify(token.value)})`
      );
    }
    if (!isStaticPropertyKey(token.value)) {
      fail(`${label} uses property ${token.value} outside the static property profile`);
    }
    this.position += 1;
    if (this.match('COLON')) {
      this.parseValue(`${label}.${token.value}`, valueDepth);
      return token.value;
    }
    if (this.check('LBRACE')) {
      this.parseRecord(`${label}.${token.value}`, valueDepth + 1);
      return token.value;
    }
    fail(`${label}.${token.value} must use ':' or a static record block`);
  }

  private parseRecord(label: string, depth: number): void {
    if (depth > MAX_STATIC_VALUE_DEPTH) {
      fail(`${label} value nesting exceeds ${MAX_STATIC_VALUE_DEPTH}`);
    }
    const propertyNames = new Set<string>();
    this.expect('LBRACE', label);
    while (!this.check('RBRACE')) {
      this.rememberProperty(
        propertyNames,
        this.parseProperty(label, depth),
        label
      );
      this.match('COMMA');
    }
    this.expect('RBRACE', label);
  }

  private parseValue(label: string, depth: number): void {
    const token = this.current();
    if (['STRING', 'NUMBER', 'BOOLEAN', 'NULL', 'IDENTIFIER'].includes(token.type)) {
      this.position += 1;
      return;
    }
    if (this.match('MINUS')) {
      this.expect('NUMBER', `${label} negative numeric literal`);
      return;
    }
    if (this.match('LBRACKET')) {
      const arrayDepth = depth + 1;
      if (arrayDepth > MAX_STATIC_VALUE_DEPTH) {
        fail(`${label} value nesting exceeds ${MAX_STATIC_VALUE_DEPTH}`);
      }
      if (!this.check('RBRACKET')) {
        this.parseValue(`${label}[0]`, arrayDepth);
        let index = 1;
        while (this.match('COMMA')) {
          this.parseValue(`${label}[${index}]`, arrayDepth);
          index += 1;
        }
      }
      this.expect('RBRACKET', `${label} array`);
      return;
    }
    if (this.check('LBRACE')) {
      this.parseRecord(label, depth + 1);
      return;
    }
    fail(
      `${label} expected a static literal, received ${token.type} (${JSON.stringify(token.value)})`
    );
  }

  private rememberProperty(
    propertyNames: Set<string>,
    propertyName: string,
    label: string
  ): void {
    if (propertyNames.has(propertyName)) {
      fail(`${label} repeats static property ${propertyName}`);
    }
    propertyNames.add(propertyName);
  }

  private rememberTrait(
    traitNames: Set<string>,
    traitName: string,
    label: string
  ): void {
    if (traitNames.has(traitName)) {
      fail(`${label} repeats static trait ${traitName}`);
    }
    traitNames.add(traitName);
  }
}

function assertStaticProjectionSource(source: string): void {
  assertNoSkippedHoloCharacters(source);
  const tokens = tokenizeHoloSource(source);
  const significantToken = (start: number, direction: -1 | 1) => {
    let index = start;
    while (index >= 0 && index < tokens.length) {
      if (tokens[index].type !== 'NEWLINE') return tokens[index];
      index += direction;
    }
    return undefined;
  };

  for (const [index, token] of tokens.entries()) {
    if (token.type === 'MINUS') {
      const previous = significantToken(index - 1, -1);
      const next = significantToken(index + 1, 1);
      if (
        next?.type === 'NUMBER' &&
        previous &&
        ['COLON', 'COMMA', 'LBRACKET'].includes(previous.type)
      ) {
        continue;
      }
    }
    if (!STATIC_PROJECTION_TOKEN_TYPES.has(token.type)) {
      fail(
        `source token ${token.type} (${JSON.stringify(token.value)}) is outside ${HOLO_WORLD_PROJECTION_COVERAGE}`
      );
    }
    if (token.type === 'IDENTIFIER' && isLifecyclePropertyKey(token.value)) {
      fail(
        `source token ${token.value} is outside ${HOLO_WORLD_PROJECTION_COVERAGE}`
      );
    }
  }
  new StaticProjectionTokenParser(tokens).parse();
}

function assertStaticPropertyValue(
  value: unknown,
  label: string,
  depth = 0
): void {
  if (depth > MAX_STATIC_VALUE_DEPTH) {
    fail(`${label} value nesting exceeds ${MAX_STATIC_VALUE_DEPTH}`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertStaticPropertyValue(entry, `${label}[${index}]`, depth + 1)
    );
    return;
  }
  if (!isRecord(value)) return;

  if (typeof value.type === 'string' && isLifecyclePropertyKey(value.type)) {
    fail(`${label} contains lifecycle value type ${String(value.type)}`);
  }

  for (const [key, candidate] of Object.entries(value)) {
    if (isLifecyclePropertyKey(key)) {
      fail(`${label} contains lifecycle property ${key}`);
    }
    if (!isStaticPropertyKey(key)) {
      fail(`${label} contains property ${key} outside the static property profile`);
    }
    assertStaticPropertyValue(candidate, `${label}.${key}`, depth + 1);
  }
}

function assertStaticPropertyList(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) fail(`${label} must be a property list`);

  value.forEach((property, index) => {
    const entry = asRecord(property);
    if (
      !['ObjectProperty', 'TemplateProperty'].includes(String(entry.type)) ||
      typeof entry.key !== 'string'
    ) {
      fail(`${label}[${index}] is not a static object property`);
    }
    if (isLifecyclePropertyKey(entry.key)) {
      fail(`${label}[${index}] uses lifecycle property ${entry.key}`);
    }
    if (!isStaticPropertyKey(entry.key)) {
      fail(`${label}[${index}] uses property ${entry.key} outside the static property profile`);
    }
    if (
      normalizeStaticIdentifier(entry.key) === 'type' &&
      typeof entry.value === 'string' &&
      isLifecyclePropertyKey(entry.value)
    ) {
      fail(`${label}[${index}] marks lifecycle type ${entry.value}`);
    }
    if (entry.key === 'physics' && !isRecord(entry.value)) {
      fail(`${label}[${index}].physics must be an object`);
    }
    if (['radius', 'width', 'height', 'depth'].includes(entry.key)) {
      assertOptionalFiniteNumber(entry.value, `${label}[${index}].${entry.key}`);
    }
    if (entry.key === 'scale' && typeof entry.value === 'number') {
      assertOptionalFiniteNumber(entry.value, `${label}[${index}].scale`);
    } else if (['position', 'rotation', 'scale'].includes(entry.key)) {
      assertOptionalFiniteVector(
        entry.value,
        ['x', 'y', 'z'],
        `${label}[${index}].${entry.key}`
      );
    }
    if (entry.key === 'quaternion') {
      assertOptionalFiniteVector(
        entry.value,
        ['x', 'y', 'z', 'w'],
        `${label}[${index}].quaternion`
      );
    }
    assertStaticPropertyValue(entry.value, `${label}[${index}].${entry.key}`);
  });
}

function assertStaticTraitDescriptor(value: unknown, label: string): void {
  const entry = asRecord(value);
  if (typeof entry.name !== 'string' || entry.name.length === 0) {
    fail(`${label} must name a trait`);
  }
  if (isLifecyclePropertyKey(entry.name)) {
    fail(`${label} uses lifecycle trait ${entry.name}`);
  }
  if (!isStaticTraitName(entry.name)) {
    fail(`${label} uses trait ${entry.name} outside the static trait profile`);
  }
  assertStaticPropertyValue(entry.config, `${label}.config`);
  assertStaticPropertyValue(entry.args, `${label}.args`);
}

function assertStaticTraitList(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  if (!Array.isArray(value)) fail(`${label} must be a trait list`);
  value.forEach((trait, index) =>
    assertStaticTraitDescriptor(trait, `${label}[${index}]`)
  );
}

function assertOnlyStaticObjectFields(
  value: unknown,
  allowed: readonly string[],
  label: string
): Record<string, unknown> {
  const record = asRecord(value);
  if (Object.keys(record).length === 0) fail(`${label} must be an object`);
  const allowedFields = new Set(allowed);
  for (const [key, candidate] of Object.entries(record)) {
    if (!allowedFields.has(key) && hasProjectedContent(candidate)) {
      fail(`${label} uses unsupported construct ${key}`);
    }
  }
  return record;
}

function assertTraitOnlyDirectives(value: unknown, label: string): void {
  for (const [index, directive] of (Array.isArray(value) ? value : []).entries()) {
    const entry = asRecord(directive);
    if (entry.type !== 'trait' || typeof entry.name !== 'string') {
      fail(`${label} directive ${index} is outside the admitted trait subset`);
    }
    assertStaticTraitDescriptor(entry, `${label}.directives[${index}]`);
  }
}

function assertStaticObjectDeclaration(
  value: unknown,
  templateNames: ReadonlySet<string>,
  label: string
): void {
  const object = assertOnlyStaticObjectFields(
    value,
    [
      'type',
      'declarationKind',
      'name',
      'template',
      'properties',
      'traits',
      'directives',
      'children',
      'loc',
    ],
    label
  );
  if (typeof object.name !== 'string' || object.name.length === 0) {
    fail(`${label} must have a non-empty name`);
  }
  if (object.template !== undefined && object.template !== null) {
    if (typeof object.template !== 'string' || !templateNames.has(object.template)) {
      fail(`${label} references an unknown template`);
    }
  }
  assertStaticPropertyList(object.properties, `${label}.properties`);
  assertStaticTraitList(object.traits, `${label}.traits`);
  assertTraitOnlyDirectives(object.directives, label);
  for (const [index, child] of (
    Array.isArray(object.children) ? object.children : []
  ).entries()) {
    assertStaticObjectDeclaration(child, templateNames, `${label}.children[${index}]`);
  }
}

function assertStaticSpatialGroup(
  value: unknown,
  templateNames: ReadonlySet<string>,
  label: string
): void {
  const group = assertOnlyStaticObjectFields(
    value,
    ['type', 'name', 'objects', 'groups', 'loc'],
    label
  );
  if (typeof group.name !== 'string' || group.name.length === 0) {
    fail(`${label} must have a non-empty name`);
  }
  for (const [index, object] of (Array.isArray(group.objects) ? group.objects : []).entries()) {
    assertStaticObjectDeclaration(object, templateNames, `${label}.objects[${index}]`);
  }
  for (const [index, child] of (Array.isArray(group.groups) ? group.groups : []).entries()) {
    assertStaticSpatialGroup(child, templateNames, `${label}.groups[${index}]`);
  }
}

function assertStaticObjectProjectionAdmission(composition: unknown): void {
  const root = asRecord(composition);
  const allowedRootFields = new Set([
    'type',
    'name',
    'templates',
    'objects',
    'spatialGroups',
    'imports',
    'loc',
  ]);
  for (const [key, value] of Object.entries(root)) {
    if (!allowedRootFields.has(key) && hasProjectedContent(value)) {
      fail(`root construct ${key} is outside ${HOLO_WORLD_PROJECTION_COVERAGE}`);
    }
  }

  const templates = Array.isArray(root.templates) ? root.templates : [];
  const templateNames = new Set<string>();
  templates.forEach((value, index) => {
    const template = assertOnlyStaticObjectFields(
      value,
      ['type', 'name', 'properties', 'traits', 'directives', 'loc'],
      `template[${index}]`
    );
    if (typeof template.name !== 'string' || template.name.length === 0) {
      fail(`template[${index}] must have a non-empty name`);
    }
    if (templateNames.has(template.name)) {
      fail(`duplicate template name ${template.name}`);
    }
    templateNames.add(template.name);
    assertStaticPropertyList(template.properties, `template[${index}].properties`);
    assertStaticTraitList(template.traits, `template[${index}].traits`);
    assertTraitOnlyDirectives(template.directives, `template[${index}]`);
  });

  for (const [index, object] of (
    Array.isArray(root.objects) ? root.objects : []
  ).entries()) {
    assertStaticObjectDeclaration(object, templateNames, `object[${index}]`);
  }
  for (const [index, group] of (
    Array.isArray(root.spatialGroups) ? root.spatialGroups : []
  ).entries()) {
    assertStaticSpatialGroup(group, templateNames, `spatialGroup[${index}]`);
  }
}

function holoObjectToHeadlessNode(
  object: unknown,
  templates: Map<string, Record<string, unknown>>,
  groupPath: string[] = []
): HeadlessSceneNode | null {
  const entry = asRecord(object);
  const name = typeof entry.name === 'string' ? entry.name : undefined;
  if (!name) return null;

  const templateName = typeof entry.template === 'string' ? entry.template : undefined;
  const template = templateName ? templates.get(templateName) : undefined;
  const templateProperties = normalizeHeadlessScenePropertyAliases(
    propertyListToRecord(template?.properties)
  );
  const objectProperties = normalizeHeadlessScenePropertyAliases(
    propertyListToRecord(entry.properties)
  );
  const mergedProperties = {
    ...templateProperties,
    ...objectProperties,
  };
  if (isRecord(templateProperties.physics) || isRecord(objectProperties.physics)) {
    mergedProperties.physics = {
      ...normalizePhysicsAliasLayer(asRecord(templateProperties.physics)),
      ...normalizePhysicsAliasLayer(asRecord(objectProperties.physics)),
    };
  }
  const properties = normalizeHeadlessSceneProperties(mergedProperties);
  const stateBlock = stateBlockToRecord(entry.state);
  const directives = [
    ...(Array.isArray(template?.directives) ? template.directives : []),
    ...(Array.isArray(entry.directives) ? entry.directives : []),
  ];
  const children = (Array.isArray(entry.children) ? entry.children : [])
    .map((child) => holoObjectToHeadlessNode(child, templates, groupPath))
    .filter((child): child is HeadlessSceneNode => child !== null);
  const node: HeadlessSceneNode = {
    type: typeof entry.declarationKind === 'string' ? entry.declarationKind : 'object',
    id: name,
    name,
    template: templateName ?? null,
    groupPath,
    properties,
    traits: traitListsToMap(template?.traits, entry.traits),
    directives,
    children,
  };

  if (Object.keys(stateBlock).length > 0) {
    node.stateBlock = stateBlock;
  }

  return node;
}

function collectHoloHeadlessNodes(composition: unknown): HeadlessSceneNode[] {
  const root = asRecord(composition);
  const templates = holoTemplateMap(root);
  const nodes: HeadlessSceneNode[] = [];
  const addObjects = (objects: unknown, groupPath: string[] = []) => {
    for (const object of Array.isArray(objects) ? objects : []) {
      const node = holoObjectToHeadlessNode(object, templates, groupPath);
      if (node) nodes.push(node);
    }
  };
  const visitGroup = (group: unknown, groupPath: string[] = []) => {
    const entry = asRecord(group);
    const nextPath = typeof entry.name === 'string' ? [...groupPath, entry.name] : groupPath;
    addObjects(entry.objects, nextPath);
    for (const child of Array.isArray(entry.groups) ? entry.groups : []) {
      visitGroup(child, nextPath);
    }
  };

  addObjects(root.objects);
  for (const group of Array.isArray(root.spatialGroups) ? root.spatialGroups : []) {
    visitGroup(group);
  }
  for (const conditional of Array.isArray(root.conditionals) ? root.conditionals : []) {
    const entry = asRecord(conditional);
    addObjects(entry.objects);
    addObjects(entry.elseObjects);
    for (const group of Array.isArray(entry.spatialGroups) ? entry.spatialGroups : []) {
      visitGroup(group);
    }
    for (const group of Array.isArray(entry.elseSpatialGroups) ? entry.elseSpatialGroups : []) {
      visitGroup(group);
    }
  }
  for (const iterator of Array.isArray(root.iterators) ? root.iterators : []) {
    const entry = asRecord(iterator);
    addObjects(entry.objects);
    for (const group of Array.isArray(entry.spatialGroups) ? entry.spatialGroups : []) {
      visitGroup(group);
    }
  }
  for (const world of Array.isArray(root.worlds) ? root.worlds : []) {
    const entry = asRecord(world);
    const worldPath = typeof entry.name === 'string' ? [entry.name] : ['world'];
    addObjects(entry.children, worldPath);
  }

  return nodes;
}

export function holoCompositionToHeadlessAst(composition: unknown): Record<string, unknown> {
  const root = asRecord(composition);
  const children = collectHoloHeadlessNodes(root);
  const stateBody = stateBlockToRecord(root.state);
  return {
    type: 'Program',
    root: {
      type: 'scene',
      id: 'root',
      name: typeof root.name === 'string' ? root.name : 'root',
      children,
      directives:
        Object.keys(stateBody).length > 0
          ? [
              {
                type: 'state',
                body: stateBody,
              },
            ]
          : [],
    },
    imports: Array.isArray(root.imports) ? root.imports : [],
    body: children,
  };
}

function traitNamesFromHeadlessNode(node: Record<string, unknown>): string[] {
  if (node.traits instanceof Map) {
    return [...node.traits.keys()].map(String).sort();
  }
  if (Array.isArray(node.traits)) {
    return node.traits
      .map((trait) => {
        const entry = asRecord(trait);
        return typeof entry.name === 'string' ? entry.name : null;
      })
      .filter((name): name is string => name !== null)
      .sort();
  }
  return [];
}

function assertOptionalPhysicsBoolean(value: unknown, label: string): void {
  if (value !== undefined && value !== null && typeof value !== 'boolean') {
    fail(`${label} must be a boolean`);
  }
}

function assertOptionalPhysicsNumber(value: unknown, label: string): void {
  if (
    value !== undefined &&
    value !== null &&
    (typeof value !== 'number' || !Number.isFinite(value))
  ) {
    fail(`${label} must be a finite number`);
  }
}

function assertOptionalPhysicsString(value: unknown, label: string): void {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    fail(`${label} must be a string`);
  }
}

function assertOptionalFiniteNumber(value: unknown, label: string): void {
  if (
    value !== undefined &&
    value !== null &&
    (typeof value !== 'number' || !Number.isFinite(value))
  ) {
    fail(`${label} must be a finite number`);
  }
}

function assertOptionalFiniteVector(
  value: unknown,
  axes: readonly string[],
  label: string
): void {
  if (value === undefined || value === null) return;
  if (
    Array.isArray(value) &&
    value.length === axes.length &&
    value.every((component) => typeof component === 'number' && Number.isFinite(component))
  ) {
    return;
  }
  if (
    isRecord(value) &&
    canonicalizeHeadlessValue(Object.keys(value).sort()) ===
      canonicalizeHeadlessValue([...axes].sort()) &&
    axes.every(
      (axis) => typeof value[axis] === 'number' && Number.isFinite(value[axis])
    )
  ) {
    return;
  }
  fail(`${label} must be a finite ${axes.length}-component vector`);
}

export function headlessAstToSceneReceipt(ast: unknown): Record<string, unknown> {
  const root = asRecord(asRecord(ast).root);
  const objects: Record<string, unknown>[] = [];
  const rootId = typeof root.id === 'string' ? root.id : null;
  const seenIds = new Set<string>(rootId === null ? [] : [rootId]);
  const nodeId = (node: Record<string, unknown>) =>
    String(node.id || node.name || node.type || `node-${objects.length}`);

  const visit = (nodeValue: unknown, parentId: string | null, path: string[]) => {
    if (path.length + 1 > MAX_WORLD_NESTING_DEPTH) {
      fail(`object nesting exceeds ${MAX_WORLD_NESTING_DEPTH}`);
    }
    if (objects.length >= MAX_WORLD_OBJECTS) {
      fail(`object count exceeds ${MAX_WORLD_OBJECTS}`);
    }
    const node = asRecord(nodeValue);
    if (!node.type) return;
    const id = nodeId(node);
    if (seenIds.has(id)) {
      fail(`duplicate object id ${id}`);
    }
    seenIds.add(id);
    const nextPath = [...path, id];
    const properties = asRecord(node.properties);
    const traits = traitNamesFromHeadlessNode(node);
    if (
      Object.prototype.hasOwnProperty.call(properties, 'physics') &&
      !isRecord(properties.physics)
    ) {
      fail(`${id}.physics must be an object`);
    }
    for (const dimension of ['radius', 'width', 'height', 'depth'] as const) {
      assertOptionalFiniteNumber(properties[dimension], `${id}.${dimension}`);
    }
    const positionValue = properties.position ?? node.position ?? null;
    const rotationValue = properties.rotation ?? node.rotation ?? null;
    const scaleValue = properties.scale ?? node.scale ?? null;
    const quaternionValue = properties.quaternion ?? node.quaternion ?? null;
    assertOptionalFiniteVector(positionValue, ['x', 'y', 'z'], `${id}.position`);
    assertOptionalFiniteVector(rotationValue, ['x', 'y', 'z'], `${id}.rotation`);
    assertOptionalFiniteVector(scaleValue, ['x', 'y', 'z'], `${id}.scale`);
    assertOptionalFiniteVector(
      quaternionValue,
      ['x', 'y', 'z', 'w'],
      `${id}.quaternion`
    );
    const physicsConfig =
      node.traits instanceof Map
        ? {
            ...asRecord(properties.physics),
            ...asRecord(node.traits.get('physics')),
          }
        : asRecord(properties.physics);
    const groupPath = Array.isArray(node.groupPath) ? node.groupPath.map(String) : [];
    const physicsBooleanFields = [
      ['physics.collidable', physicsConfig.collidable],
      ['physics.kinematic', physicsConfig.kinematic],
      ['physics.static', physicsConfig.static],
      ['collidable', properties.collidable],
      ['kinematic', properties.kinematic],
      ['static', properties.static],
    ] as const;
    const physicsNumberFields = [
      ['physics.massKg', physicsConfig.massKg],
      ['physics.mass_kg', physicsConfig.mass_kg],
      ['physics.mass', physicsConfig.mass],
      ['physics.friction', physicsConfig.friction],
      ['physics.restitution', physicsConfig.restitution],
      ['massKg', properties.massKg],
      ['mass_kg', properties.mass_kg],
      ['mass', properties.mass],
      ['friction', properties.friction],
      ['restitution', properties.restitution],
    ] as const;
    const physicsStringFields = [
      ['physics.geometry', physicsConfig.geometry],
      ['physics.shape', physicsConfig.shape],
      ['geometry', properties.geometry],
      ['shape', properties.shape],
    ] as const;
    physicsBooleanFields.forEach(([label, value]) =>
      assertOptionalPhysicsBoolean(value, `${id}.${label}`)
    );
    physicsNumberFields.forEach(([label, value]) =>
      assertOptionalPhysicsNumber(value, `${id}.${label}`)
    );
    physicsStringFields.forEach(([label, value]) =>
      assertOptionalPhysicsString(value, `${id}.${label}`)
    );

    const collidableValue = physicsConfig.collidable ?? properties.collidable;
    const staticValue =
      traits.includes('static') ||
      physicsConfig.static === true ||
      properties.static === true;
    const kinematicValue =
      staticValue ||
      (physicsConfig.kinematic ?? properties.kinematic ?? false);
    const massValue =
      physicsConfig.massKg ??
      physicsConfig.mass_kg ??
      physicsConfig.mass ??
      properties.massKg ??
      properties.mass_kg ??
      properties.mass ??
      null;
    const frictionValue = physicsConfig.friction ?? properties.friction ?? null;
    const restitutionValue =
      physicsConfig.restitution ?? properties.restitution ?? null;
    const geometryValue =
      physicsConfig.shape ??
      physicsConfig.geometry ??
      properties.geometry ??
      properties.shape ??
      null;

    objects.push({
      id,
      type: String(node.type),
      name: typeof node.name === 'string' ? node.name : null,
      template: typeof node.template === 'string' ? node.template : null,
      parentId,
      path: nextPath,
      groupPath,
      traits,
      traitConfigs:
        node.traits instanceof Map
          ? Object.fromEntries(
              [...node.traits.entries()].map(([name, config]) => [
                name,
                asRecord(config),
              ])
            )
          : {},
      properties,
      transform: {
        position: positionValue,
        rotation: rotationValue,
        scale: scaleValue,
        quaternion: quaternionValue,
      },
      physics: {
        declarationOnly: true,
        collidable:
          traits.includes('collidable') ||
          Boolean(collidableValue),
        kinematic: kinematicValue,
        massKg: massValue,
        friction: frictionValue,
        restitution: restitutionValue,
        geometry:
          typeof geometryValue === 'string'
            ? geometryValue.toLowerCase()
            : geometryValue,
      },
    });

    for (const child of Array.isArray(node.children) ? node.children : []) {
      visit(child, id, nextPath);
    }
  };

  for (const child of Array.isArray(root.children) ? root.children : []) {
    visit(child, null, []);
  }

  return {
    schema: 'holoscript-headless-scene-receipt-v1',
    source: 'CLIHeadlessAstBridge',
    coverage: HOLO_WORLD_PROJECTION_COVERAGE,
    rootId,
    objectCount: objects.length,
    objects,
  };
}

export function buildHeadlessPosePhysicsReceipt(
  sceneReceipt: unknown
): Record<string, unknown> {
  const scene = asRecord(sceneReceipt);
  const objects = Array.isArray(scene.objects) ? scene.objects : [];

  return {
    schema: 'holoscript-headless-pose-physics-receipt-v1',
    mode: 'authored-static-object-declarations',
    coverage: HOLO_WORLD_PROJECTION_COVERAGE,
    complete: false,
    physicsExecutionClaimed: false,
    objectCount: typeof scene.objectCount === 'number' ? scene.objectCount : objects.length,
    bodies: objects.map((object) => {
      const entry = asRecord(object);
      return {
        id: entry.id,
        type: entry.type,
        parentId: entry.parentId ?? null,
        template: entry.template ?? null,
        transform: entry.transform ?? {},
        physics: entry.physics ?? {},
        traits: Array.isArray(entry.traits) ? entry.traits : [],
      };
    }),
  };
}

function provenancePreimage(
  provenance: HoloWorldProjectionProvenance
): Omit<HoloWorldProjectionProvenance, 'provenanceCommitment'> {
  const { provenanceCommitment: _provenanceCommitment, ...preimage } = provenance;
  return preimage;
}

export function executeHoloWorldProjection(source: string): HoloWorldProjectionExecution {
  if (typeof source !== 'string') fail('source must be a string');
  if (
    source.length > MAX_WORLD_SOURCE_BYTES ||
    byteLength(source) > MAX_WORLD_SOURCE_BYTES
  ) {
    fail(`source exceeds ${MAX_WORLD_SOURCE_BYTES} bytes`);
  }

  // Bound source structure before invoking the recursive composition parser.
  assertStaticProjectionSource(source);
  const parseResult = new HoloCompositionParser(HOLO_WORLD_PROJECTION_PARSER_OPTIONS).parse(source);
  if (!parseResult.success) {
    fail(`parser reported errors: ${formatParserDiagnostics(parseResult.errors)}`);
  }
  if (parseResult.warnings.length > 0) {
    fail(`parser reported warnings: ${formatParserDiagnostics(parseResult.warnings)}`);
  }
  const parsedRoot = asRecord(parseResult.ast);
  if (Array.isArray(parsedRoot.imports) && parsedRoot.imports.length > 0) {
    fail('imports are not admitted by the single-source deterministic projector');
  }
  assertStaticObjectProjectionAdmission(parseResult.ast);

  const ast = holoCompositionToHeadlessAst(parseResult.ast);
  const scene = headlessAstToSceneReceipt(ast);
  const posePhysics = buildHeadlessPosePhysicsReceipt(scene);
  assertProjectedSize(scene, 'scene projection');
  assertProjectedSize(posePhysics, 'pose/physics projection');
  const preimage: Omit<HoloWorldProjectionProvenance, 'provenanceCommitment'> = {
    schema: HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA,
    engine: DETERMINISTIC_HOLO_WORLD_PROJECTION,
    hashAlgorithm: HEADLESS_EXPERIMENT_HASH_ALGORITHM,
    sourceHash: hashHeadlessValue(source),
    coverage: HOLO_WORLD_PROJECTION_COVERAGE,
    parser: {
      implementation: HOLO_WORLD_PROJECTION_PARSER,
      options: {
        locations: true,
        tolerant: false,
        strict: false,
      },
    },
    result: {
      sceneHash: hashHeadlessValue(scene),
      posePhysicsHash: hashHeadlessValue(posePhysics),
      objectCount: Array.isArray(scene.objects) ? scene.objects.length : 0,
    },
  };
  const provenance: HoloWorldProjectionProvenance = {
    ...preimage,
    provenanceCommitment: hashHeadlessValue(preimage),
  };
  if (byteLength(canonicalizeHeadlessValue(provenance)) > MAX_WORLD_PROVENANCE_BYTES) {
    fail(`provenance exceeds ${MAX_WORLD_PROVENANCE_BYTES} bytes`);
  }
  return { scene, posePhysics, provenance };
}

export function verifyHoloWorldProjectionProvenance(
  input: unknown,
  options: HoloWorldProjectionVerificationOptions
): HeadlessExperimentVerificationResult {
  try {
    assertExactKeys(
      input,
      [
        'schema',
        'engine',
        'hashAlgorithm',
        'sourceHash',
        'coverage',
        'parser',
        'result',
        'provenanceCommitment',
      ],
      'provenance'
    );
    const provenance = input as HoloWorldProjectionProvenance;
    if (
      provenance.schema !== HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA ||
      provenance.engine !== DETERMINISTIC_HOLO_WORLD_PROJECTION ||
      provenance.hashAlgorithm !== HEADLESS_EXPERIMENT_HASH_ALGORITHM ||
      provenance.coverage !== HOLO_WORLD_PROJECTION_COVERAGE
    ) {
      fail('provenance identity mismatch');
    }
    assertExactKeys(provenance.parser, ['implementation', 'options'], 'parser provenance');
    assertExactKeys(
      provenance.parser.options,
      ['locations', 'tolerant', 'strict'],
      'parser options'
    );
    if (
      provenance.parser.implementation !== HOLO_WORLD_PROJECTION_PARSER ||
      provenance.parser.options.locations !== true ||
      provenance.parser.options.tolerant !== false ||
      provenance.parser.options.strict !== false
    ) {
      fail('parser identity or options mismatch');
    }
    assertExactKeys(
      provenance.result,
      ['sceneHash', 'posePhysicsHash', 'objectCount'],
      'provenance result'
    );
    assertSha256(provenance.sourceHash, 'sourceHash');
    assertSha256(provenance.result.sceneHash, 'result.sceneHash');
    assertSha256(provenance.result.posePhysicsHash, 'result.posePhysicsHash');
    if (!Number.isSafeInteger(provenance.result.objectCount) || provenance.result.objectCount < 0) {
      fail('result.objectCount must be a non-negative safe integer');
    }
    assertSha256(provenance.provenanceCommitment, 'provenanceCommitment');
    const canonicalInput = canonicalizeHeadlessValue(provenance);
    if (byteLength(canonicalInput) > MAX_WORLD_PROVENANCE_BYTES) {
      fail(`provenance exceeds ${MAX_WORLD_PROVENANCE_BYTES} bytes`);
    }
    if (provenance.provenanceCommitment !== hashHeadlessValue(provenancePreimage(provenance))) {
      fail('provenance commitment mismatch');
    }
    if (!options || typeof options.expectedSource !== 'string') {
      fail('source-backed verification requires the expected .holo source');
    }

    const observed = executeHoloWorldProjection(options.expectedSource);
    if (options.expectedScene !== undefined) {
      assertProjectedSize(options.expectedScene, 'expected scene projection');
      if (
        canonicalizeHeadlessValue(observed.scene) !==
        canonicalizeHeadlessValue(options.expectedScene)
      ) {
        fail('source-backed scene projection differs from the sealed execution');
      }
    }
    if (options.expectedPosePhysics !== undefined) {
      assertProjectedSize(
        options.expectedPosePhysics,
        'expected pose/physics projection'
      );
      if (
        canonicalizeHeadlessValue(observed.posePhysics) !==
        canonicalizeHeadlessValue(options.expectedPosePhysics)
      ) {
        fail('source-backed pose/physics projection differs from the sealed execution');
      }
    }
    if (canonicalizeHeadlessValue(observed.provenance) !== canonicalInput) {
      fail('world source replay differs from the sealed projection provenance');
    }
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}
