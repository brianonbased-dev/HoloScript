/**
 * `.holo` scene -> HoloMeaning containment IR.
 *
 * This adapter deliberately lives in `@holoscript/core`: core owns the canonical
 * `.holo` parser and already depends downward on the parser-independent
 * `@holoscript/meaning` stratum. HoloMeaning must not import a surface parser.
 */

import type {
  UAALContainmentIR,
  UAALContainmentQuery,
  UAALContainmentRelation,
  UAALSemanticEntity,
} from '@holoscript/meaning';
import { hsiSourceTextDigest } from '../compiler/HSIIRTypes';
import { parseHoloStrict } from '../parser/HoloCompositionParser';
import type {
  HoloComposition,
  HoloNode,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloValue,
} from '../parser/HoloCompositionTypes';

const FORMAT = '.holo' as const;
const PARSER = 'HoloCompositionParser' as const;
const SEMANTIC_PROPERTY_KEYS = new Set([
  'id',
  'semantic_id',
  'semanticId',
  'kind',
  'role',
  'label',
  'opaque',
  'blocks',
  'blocks_unknown',
  'blocksUnknown',
  'type',
]);

export type HoloContainmentPerceptionErrorCode =
  | 'invalid-source'
  | 'unsupported-import'
  | 'unsupported-template'
  | 'unsupported-dynamic-containment'
  | 'unsupported-platform-constraint'
  | 'duplicate-semantic-id'
  | 'invalid-semantic-property'
  | 'conflicting-semantic-property'
  | 'unknown-query-entity';

export class HoloContainmentPerceptionError extends Error {
  readonly code: HoloContainmentPerceptionErrorCode;

  constructor(code: HoloContainmentPerceptionErrorCode, message: string) {
    super(message);
    this.name = 'HoloContainmentPerceptionError';
    this.code = code;
  }
}

export interface HoloContainmentPerceptionOptions {
  /** Stable source name recorded on the IR and every perceived node/edge. */
  sourceId?: string;
  /**
   * Optional query to attach to the IR. The perceiver never guesses which
   * agent/object pair the caller intends to ask about.
   */
  query?: UAALContainmentQuery;
}

export interface HoloContainmentSourceRef {
  format: typeof FORMAT;
  parser: typeof PARSER;
  composition: string;
  sourceDigest: string;
  sourceId?: string;
  path: string;
  line?: number;
  column?: number;
}

export interface HoloContainmentPerceptionMetadata {
  format: typeof FORMAT;
  parser: typeof PARSER;
  composition: string;
  sourceDigest: string;
  sourceId?: string;
}

export type HoloPerceivedSemanticEntity = UAALSemanticEntity & {
  source: HoloContainmentSourceRef;
};

export type HoloPerceivedContainmentRelation = UAALContainmentRelation & {
  source: HoloContainmentSourceRef;
};

export type HoloPerceivedContainmentIR = UAALContainmentIR & {
  entities: HoloPerceivedSemanticEntity[];
  containment: HoloPerceivedContainmentRelation[];
  perception: HoloContainmentPerceptionMetadata;
};

interface PerceptionState {
  composition: HoloComposition;
  options: HoloContainmentPerceptionOptions;
  sourceDigest: string;
  entities: HoloPerceivedSemanticEntity[];
  containment: HoloPerceivedContainmentRelation[];
  entityPathById: Map<string, string>;
}

/**
 * Parse canonical `.holo` source and lower its concrete scene containment into
 * the shared HoloMeaning IR.
 *
 * Parse failures and ambiguous duplicate semantic IDs fail closed. Missing
 * `opaque` is intentionally NOT defaulted: its absence is the third
 * (unstated/unknown) state consumed by `resolveOcclusion` and `resolveAccess`.
 */
export function perceiveContainmentIR(
  source: string,
  options: HoloContainmentPerceptionOptions = {}
): HoloPerceivedContainmentIR {
  if (
    options.sourceId !== undefined &&
    (typeof options.sourceId !== 'string' || options.sourceId.trim().length === 0)
  ) {
    fail(
      'invalid-semantic-property',
      'Containment perception sourceId must be a non-empty string when provided'
    );
  }

  let composition: HoloComposition;
  try {
    composition = parseHoloStrict(source);
  } catch (error) {
    fail(
      'invalid-source',
      `Cannot perceive containment from invalid .holo source: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return perceiveContainmentAST(composition, options, hsiSourceTextDigest(source));
}

function perceiveContainmentAST(
  composition: HoloComposition,
  options: HoloContainmentPerceptionOptions,
  sourceDigest: string
): HoloPerceivedContainmentIR {
  if (composition.imports.length > 0) {
    fail(
      'unsupported-import',
      'Cannot perceive a complete containment IR while .holo imports remain unresolved'
    );
  }

  const conditionals = composition.conditionals || [];
  const iterators = composition.iterators || [];
  if (conditionals.length > 0 || iterators.length > 0) {
    fail(
      'unsupported-dynamic-containment',
      'Cannot perceive a complete containment IR while .holo conditionals or iterators can change scene membership'
    );
  }

  const state: PerceptionState = {
    composition,
    options,
    sourceDigest,
    entities: [],
    containment: [],
    entityPathById: new Map(),
  };

  const compositionId = syntheticId('composition', composition.name);
  addStructuralEntity(
    state,
    compositionId,
    'region',
    `composition[${composition.name}]`,
    composition,
    'transparent'
  );

  for (const object of composition.objects || []) {
    perceiveObject(state, object, compositionId, `composition[${composition.name}]`);
  }

  for (const scene of composition.scenes || []) {
    const scenePath = `composition[${composition.name}]/scene[${scene.name}]`;
    const sceneId = syntheticId('scene', scene.name);
    addStructuralEntity(state, sceneId, 'region', scenePath, scene, 'separate-scene');
    addContainment(state, sceneId, compositionId, scenePath, scene);
    for (const object of scene.objects || []) {
      perceiveObject(state, object, sceneId, scenePath);
    }
  }

  for (const group of composition.spatialGroups || []) {
    perceiveGroup(state, group, compositionId, `composition[${composition.name}]`);
  }

  validateQuery(state, options.query);

  const ir: HoloPerceivedContainmentIR = {
    entities: state.entities,
    containment: state.containment,
    perception: {
      format: FORMAT,
      parser: PARSER,
      composition: composition.name,
      sourceDigest,
      ...(options.sourceId ? { sourceId: options.sourceId } : {}),
    },
  };
  if (options.query) ir.query = { ...options.query };
  return ir;
}

function perceiveGroup(
  state: PerceptionState,
  group: HoloSpatialGroup,
  parentId: string,
  parentPath: string
): void {
  const path = `${parentPath}/spatial_group[${group.name}]`;
  rejectPlatformConstraint(group.platformConstraint, path);
  const propertyMap = propertiesByKey(group.properties || [], path);
  const id =
    stringProperty(propertyMap, ['semantic_id', 'semanticId', 'id'], path) ??
    group.id ??
    syntheticId('group', path);
  const kind = semanticKind(propertyMap, path) ?? 'region';
  const label = stringProperty(propertyMap, ['label'], path) ?? group.name;
  const entity: HoloPerceivedSemanticEntity = {
    id,
    kind,
    label,
    // A spatial group is structurally transparent unless the author states
    // otherwise. Unlike composition/scene nodes, its properties are authored
    // and therefore must not be overwritten.
    opaque: booleanProperty(propertyMap, ['opaque'], path) ?? false,
    blocks: stringArrayProperty(propertyMap, ['blocks'], path) ?? [],
    source: sourceRef(state, path, group),
  };
  const blocksUnknown = stringArrayProperty(propertyMap, ['blocks_unknown', 'blocksUnknown'], path);
  if (blocksUnknown !== undefined) entity.blocks_unknown = blocksUnknown;
  assertBlockingStatesDoNotConflict(entity.blocks, blocksUnknown, path);

  addEntity(state, entity, path);
  addContainment(state, id, parentId, path, group);

  for (const object of group.objects || []) {
    perceiveObject(state, object, id, path);
  }
  for (const childGroup of group.groups || []) {
    perceiveGroup(state, childGroup, id, path);
  }
}

function perceiveObject(
  state: PerceptionState,
  object: HoloObjectDecl,
  parentId: string,
  parentPath: string
): void {
  const path = `${parentPath}/object[${object.name}]`;
  rejectPlatformConstraint(object.platformConstraint, path);
  if (object.template) {
    fail(
      'unsupported-template',
      `Cannot perceive ${path}: template "${object.template}" must be expanded before containment meaning can be complete`
    );
  }

  const propertyMap = propertiesByKey(object.properties || [], path);
  const id =
    stringProperty(propertyMap, ['semantic_id', 'semanticId', 'id'], path) ??
    object.id ??
    object.name;
  const kind = semanticKind(propertyMap, path) ?? inferredObjectKind(object, propertyMap, path);
  const label = stringProperty(propertyMap, ['label'], path) ?? object.name;
  const entity: HoloPerceivedSemanticEntity = {
    id,
    kind,
    label,
    source: sourceRef(state, path, object),
  };

  const opaque = booleanProperty(propertyMap, ['opaque'], path);
  if (opaque !== undefined) entity.opaque = opaque;

  const blocks = stringArrayProperty(propertyMap, ['blocks'], path);
  if (blocks !== undefined) entity.blocks = blocks;

  const blocksUnknown = stringArrayProperty(propertyMap, ['blocks_unknown', 'blocksUnknown'], path);
  if (blocksUnknown !== undefined) entity.blocks_unknown = blocksUnknown;

  assertBlockingStatesDoNotConflict(blocks, blocksUnknown, path);

  addEntity(state, entity, path);
  addContainment(state, id, parentId, path, object);

  for (const child of object.children || []) {
    perceiveObject(state, child, id, path);
  }
}

function addStructuralEntity(
  state: PerceptionState,
  id: string,
  kind: string,
  path: string,
  node: HoloNode,
  boundary: 'transparent' | 'separate-scene'
): void {
  const entity: HoloPerceivedSemanticEntity = {
    id,
    kind,
    label: id,
    source: sourceRef(state, path, node),
  };
  if (boundary === 'transparent') {
    entity.opaque = false;
    entity.blocks = [];
  } else {
    // Named scenes are distinct world contexts unless a future expansion step
    // proves co-presence. Missing opacity makes visual queries abstain, while
    // audible blocking is explicitly unknown. Same-scene queries stop at
    // their shared scene ancestor before inspecting this boundary.
    entity.blocks_unknown = ['audible'];
  }
  addEntity(state, entity, path);
}

function addEntity(
  state: PerceptionState,
  entity: HoloPerceivedSemanticEntity,
  path: string
): void {
  if (entity.id.trim().length === 0) {
    fail(
      'invalid-semantic-property',
      `Invalid containment meaning at ${path}: semantic id must be non-empty`
    );
  }
  const previousPath = state.entityPathById.get(entity.id);
  if (previousPath) {
    fail(
      'duplicate-semantic-id',
      `Ambiguous containment meaning: semantic id "${entity.id}" occurs at both ${previousPath} and ${path}`
    );
  }
  state.entityPathById.set(entity.id, path);
  state.entities.push(entity);
}

function addContainment(
  state: PerceptionState,
  inner: string,
  outer: string,
  path: string,
  node: HoloNode
): void {
  state.containment.push({
    inner,
    outer,
    source: sourceRef(state, path, node),
  });
}

function sourceRef(state: PerceptionState, path: string, node: HoloNode): HoloContainmentSourceRef {
  const start = node.loc?.start;
  return {
    format: FORMAT,
    parser: PARSER,
    composition: state.composition.name,
    sourceDigest: state.sourceDigest,
    ...(state.options.sourceId ? { sourceId: state.options.sourceId } : {}),
    path,
    ...(start ? { line: start.line, column: start.column } : {}),
  };
}

function syntheticId(kind: 'composition' | 'scene' | 'group', name: string): string {
  return `holo:${kind}:${name}`;
}

function propertiesByKey(
  properties: Array<{ key: string; value: HoloValue }>,
  path: string
): Map<string, HoloValue> {
  const result = new Map<string, HoloValue>();
  for (const property of properties) {
    if (SEMANTIC_PROPERTY_KEYS.has(property.key) && result.has(property.key)) {
      fail(
        'conflicting-semantic-property',
        `Invalid containment meaning at ${path}: semantic property "${property.key}" is declared more than once`
      );
    }
    result.set(property.key, property.value);
  }
  return result;
}

function propertyValue(
  properties: Map<string, HoloValue>,
  keys: string[],
  path: string
): HoloValue | undefined {
  const present = keys.filter((key) => properties.has(key));
  if (present.length > 1) {
    fail(
      'conflicting-semantic-property',
      `Invalid containment meaning at ${path}: aliases ${present.join(', ')} cannot be declared together`
    );
  }
  return present.length === 1 ? properties.get(present[0]) : undefined;
}

function stringProperty(
  properties: Map<string, HoloValue>,
  keys: string[],
  path: string
): string | undefined {
  const value = propertyValue(properties, keys, path);
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || value.trim().length === 0) {
    fail(
      'invalid-semantic-property',
      `Invalid containment meaning at ${path}: ${keys[0]} must be a non-empty string`
    );
  }
  return value;
}

function booleanProperty(
  properties: Map<string, HoloValue>,
  keys: string[],
  path: string
): boolean | undefined {
  const value = propertyValue(properties, keys, path);
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    fail(
      'invalid-semantic-property',
      `Invalid containment meaning at ${path}: ${keys[0]} must be true or false`
    );
  }
  return value;
}

function stringArrayProperty(
  properties: Map<string, HoloValue>,
  keys: string[],
  path: string
): string[] | undefined {
  const value = propertyValue(properties, keys, path);
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    fail(
      'invalid-semantic-property',
      `Invalid containment meaning at ${path}: ${keys[0]} must be an array of non-empty strings`
    );
  }
  return [...new Set(value as string[])];
}

function inferredObjectKind(
  object: HoloObjectDecl,
  properties: Map<string, HoloValue>,
  path: string
): string {
  const declarationType = stringProperty(properties, ['type'], path);
  if (declarationType === 'spatial_agent') return 'agent';
  return object.children?.length ? 'container' : 'object';
}

function semanticKind(properties: Map<string, HoloValue>, path: string): string | undefined {
  const declaredKind = stringProperty(properties, ['kind'], path);
  const declaredRole = stringProperty(properties, ['role'], path);
  if (declaredKind && declaredRole && declaredKind !== declaredRole) {
    fail(
      'conflicting-semantic-property',
      `Invalid containment meaning at ${path}: kind "${declaredKind}" conflicts with role "${declaredRole}"`
    );
  }
  return declaredKind ?? declaredRole;
}

function assertBlockingStatesDoNotConflict(
  blocks: string[] | undefined,
  blocksUnknown: string[] | undefined,
  path: string
): void {
  if (!blocks || !blocksUnknown) return;
  const overlap = blocks.filter((modality) => blocksUnknown.includes(modality));
  if (overlap.length > 0) {
    fail(
      'conflicting-semantic-property',
      `Invalid containment meaning at ${path}: ${overlap.join(', ')} cannot appear in both blocks and blocks_unknown`
    );
  }
}

function rejectPlatformConstraint(constraint: unknown, path: string): void {
  if (constraint !== undefined) {
    fail(
      'unsupported-platform-constraint',
      `Cannot perceive ${path}: platform-dependent containment requires an explicit target platform`
    );
  }
}

function validateQuery(state: PerceptionState, query: UAALContainmentQuery | undefined): void {
  if (!query) return;
  for (const [role, id] of [
    ['agent', query.agent],
    ['object', query.object],
  ] as const) {
    if (id !== undefined && (typeof id !== 'string' || id.trim().length === 0)) {
      fail(
        'invalid-semantic-property',
        `Containment query ${role} must be a non-empty semantic id`
      );
    }
    if (id && !state.entityPathById.has(id)) {
      fail(
        'unknown-query-entity',
        `Containment query ${role} "${id}" is not present in the perceived .holo scene`
      );
    }
  }
}

function fail(code: HoloContainmentPerceptionErrorCode, message: string): never {
  throw new HoloContainmentPerceptionError(code, message);
}
