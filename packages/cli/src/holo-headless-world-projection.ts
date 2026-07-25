import { HoloCompositionParser } from '@holoscript/core/parser';
import {
  HEADLESS_EXPERIMENT_HASH_ALGORITHM,
  canonicalizeHeadlessValue,
  hashHeadlessValue,
  type HeadlessExperimentVerificationResult,
} from '@holoscript/engine/runtime';

export const PURE_HOLO_WORLD_PROJECTION = 'holoscript-cli-pure-world-projection-v1' as const;
export const DETERMINISTIC_HOLO_WORLD_PROJECTION =
  'holoscript-core-parser-headless-world-projection-v1' as const;
export const HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA =
  'holoscript.holo-world-projection-provenance.v1' as const;

const MAX_WORLD_SOURCE_BYTES = 256 * 1024;
const MAX_WORLD_PROVENANCE_BYTES = 4 * 1024;
const HOLO_WORLD_PROJECTION_PARSER =
  '@holoscript/core/HoloCompositionParser.parse' as const;
const HOLO_WORLD_PROJECTION_PARSER_OPTIONS = Object.freeze({
  locations: true,
  tolerant: false,
  strict: false,
} as const);

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
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (canonicalizeHeadlessValue(actual) !== canonicalizeHeadlessValue(required)) {
    fail(`${label} fields do not match the sealed contract`);
  }
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
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

export function normalizeHeadlessSceneProperties(
  properties: Record<string, unknown>
): Record<string, unknown> {
  const normalized = { ...properties };
  const material = asRecord(normalized.material);

  for (const key of ['color', 'roughness', 'opacity', 'transparent'] as const) {
    if (normalized[key] === undefined && material[key] !== undefined) {
      normalized[key] = material[key];
    }
  }

  if (normalized.metallic === undefined && material.metalness !== undefined) {
    normalized.metallic = material.metalness;
  }

  if (normalized.scale === undefined && typeof normalized.radius === 'number') {
    const diameter = normalized.radius * 2;
    normalized.scale = [diameter, diameter, diameter];
  }

  if (
    normalized.scale === undefined &&
    (typeof normalized.width === 'number' || typeof normalized.height === 'number')
  ) {
    normalized.scale = [normalized.width ?? 1, 1, normalized.height ?? 1];
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
      const config = { ...asRecord(entry.config) };
      if (Array.isArray(entry.args) && entry.args.length > 0) {
        config.args = entry.args;
      }
      traits.set(entry.name, config);
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
  const properties = normalizeHeadlessSceneProperties({
    ...propertyListToRecord(template?.properties),
    ...propertyListToRecord(entry.properties),
  });
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

export function headlessAstToSceneReceipt(ast: unknown): Record<string, unknown> {
  const root = asRecord(asRecord(ast).root);
  const objects: Record<string, unknown>[] = [];
  const nodeId = (node: Record<string, unknown>) =>
    String(node.id || node.name || node.type || `node-${objects.length}`);

  const visit = (nodeValue: unknown, parentId: string | null, path: string[]) => {
    const node = asRecord(nodeValue);
    if (!node.type) return;
    const id = nodeId(node);
    const nextPath = [...path, id];
    const properties = asRecord(node.properties);
    const traits = traitNamesFromHeadlessNode(node);
    const physicsConfig =
      node.traits instanceof Map
        ? asRecord(node.traits.get('physics'))
        : asRecord(properties.physics);
    const groupPath = Array.isArray(node.groupPath) ? node.groupPath.map(String) : [];

    objects.push({
      id,
      type: String(node.type),
      name: typeof node.name === 'string' ? node.name : null,
      template: typeof node.template === 'string' ? node.template : null,
      parentId,
      path: nextPath,
      groupPath,
      traits,
      properties,
      transform: {
        position: properties.position ?? node.position ?? null,
        rotation: properties.rotation ?? node.rotation ?? null,
        scale: properties.scale ?? node.scale ?? null,
      },
      physics: {
        collidable: traits.includes('collidable') || Boolean(properties.collidable),
        kinematic: physicsConfig.kinematic ?? properties.kinematic ?? traits.includes('static'),
        massKg:
          physicsConfig.massKg ??
          physicsConfig.mass ??
          properties.massKg ??
          properties.mass ??
          null,
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
    rootId: typeof root.id === 'string' ? root.id : null,
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
    mode: 'headless-scene-state',
    complete: true,
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
  if (byteLength(source) > MAX_WORLD_SOURCE_BYTES) {
    fail(`source exceeds ${MAX_WORLD_SOURCE_BYTES} bytes`);
  }

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

  const ast = holoCompositionToHeadlessAst(parseResult.ast);
  const scene = headlessAstToSceneReceipt(ast);
  const posePhysics = buildHeadlessPosePhysicsReceipt(scene);
  const preimage: Omit<HoloWorldProjectionProvenance, 'provenanceCommitment'> = {
    schema: HOLO_WORLD_PROJECTION_PROVENANCE_SCHEMA,
    engine: DETERMINISTIC_HOLO_WORLD_PROJECTION,
    hashAlgorithm: HEADLESS_EXPERIMENT_HASH_ALGORITHM,
    sourceHash: hashHeadlessValue(source),
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
    const canonicalInput = canonicalizeHeadlessValue(input);
    if (byteLength(canonicalInput) > MAX_WORLD_PROVENANCE_BYTES) {
      fail(`provenance exceeds ${MAX_WORLD_PROVENANCE_BYTES} bytes`);
    }
    assertExactKeys(
      input,
      [
        'schema',
        'engine',
        'hashAlgorithm',
        'sourceHash',
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
      provenance.hashAlgorithm !== HEADLESS_EXPERIMENT_HASH_ALGORITHM
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
      canonicalizeHeadlessValue(provenance.parser.options) !==
        canonicalizeHeadlessValue(HOLO_WORLD_PROJECTION_PARSER_OPTIONS)
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
    if (provenance.provenanceCommitment !== hashHeadlessValue(provenancePreimage(provenance))) {
      fail('provenance commitment mismatch');
    }
    if (!options || typeof options.expectedSource !== 'string') {
      fail('source-backed verification requires the expected .holo source');
    }

    const observed = executeHoloWorldProjection(options.expectedSource);
    if (
      options.expectedScene !== undefined &&
      canonicalizeHeadlessValue(observed.scene) !==
        canonicalizeHeadlessValue(options.expectedScene)
    ) {
      fail('source-backed scene projection differs from the sealed execution');
    }
    if (
      options.expectedPosePhysics !== undefined &&
      canonicalizeHeadlessValue(observed.posePhysics) !==
        canonicalizeHeadlessValue(options.expectedPosePhysics)
    ) {
      fail('source-backed pose/physics projection differs from the sealed execution');
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
