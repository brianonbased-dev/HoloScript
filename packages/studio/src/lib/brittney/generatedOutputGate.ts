import { parseHolo, type HoloComposition } from '@holoscript/core';

import { validateHoloOutput, type ValidationResult } from './holoValidator';

// Studio type-checks @holoscript/core against its built declarations, where `scenes` and a
// group's nested `groups` come through untyped. These are the fields this gate reads, as the
// parser builds them (HoloScene and HoloSpatialGroup in core's HoloCompositionTypes.ts).
interface SceneShape {
  name: string;
  objects?: unknown[];
}

interface SpatialGroupShape {
  name: string;
  objects?: unknown[];
  lights?: unknown[];
  groups?: SpatialGroupShape[];
}

export interface CorePrimitiveSummary {
  objects: number;
  /** Objects inside scenes. */
  sceneObjects: number;
  /** Reported only: a scene is a container, and its objects are counted in sceneObjects. */
  scenes: number;
  lights: number;
  shapes: number;
  /** Reported only: a spatial group is a container, and its content is counted below. */
  spatialGroups: number;
  /** Objects and lights inside spatial groups, nested groups included. */
  spatialGroupContent: number;
  /** Reported only: a template is a definition; an object using it counts as an object. */
  templates: number;
  terrainBlocks: number;
  domainBlocks: number;
  total: number;
}

type PrimitiveCounts = Omit<CorePrimitiveSummary, 'total'>;

// Only these fields add up to `total`. Counting containers and definitions let a page block
// next to `scene "Empty" {}` through with zero 3D content, so scenes, spatialGroups and
// templates are reported but never counted. A new field stays out of `total` until it is
// listed here.
const COUNTED_FIELDS = [
  'objects',
  'sceneObjects',
  'lights',
  'shapes',
  'spatialGroupContent',
  'terrainBlocks',
  'domainBlocks',
] as const satisfies ReadonlyArray<keyof PrimitiveCounts>;

export interface GeneratedOutputValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  structural: ValidationResult;
  corePrimitives: CorePrimitiveSummary;
  ast?: HoloComposition;
}

export function validateGeneratedHoloOutput(code: string): GeneratedOutputValidation {
  const structural = validateHoloOutput(code);
  const corePrimitives = emptyPrimitiveSummary();
  const warnings = [...structural.warnings];

  if (!structural.valid) {
    return {
      valid: false,
      errors: [...structural.errors],
      warnings,
      structural,
      corePrimitives,
    };
  }

  const parsed = parseHolo(code, { tolerant: false, strict: true });
  warnings.push(...formatParserMessages(parsed.warnings ?? []));

  if (!parsed.success || !parsed.ast) {
    return {
      valid: false,
      errors: formatParserMessages(parsed.errors ?? ['Generated HoloScript failed to parse']),
      warnings,
      structural,
      corePrimitives,
    };
  }

  const parsedCorePrimitives = summarizeCorePrimitives(parsed.ast);
  for (const keyword of customBlockKeywords(parsed.ast)) {
    warnings.push(`"${keyword}" parsed as a 'custom' block, which does not count as scene content`);
  }
  warnings.push(...emptyContainerWarnings(parsed.ast));
  if (parsedCorePrimitives.total === 0) {
    return {
      valid: false,
      errors: ['Generated HoloScript parsed but produced no core scene/world primitives'],
      warnings,
      structural,
      corePrimitives: parsedCorePrimitives,
      ast: parsed.ast,
    };
  }

  return {
    valid: true,
    errors: [],
    warnings,
    structural,
    corePrimitives: parsedCorePrimitives,
    ast: parsed.ast,
  };
}

export function summarizeCorePrimitives(ast: HoloComposition): CorePrimitiveSummary {
  const scenes = scenesOf(ast);
  const spatialGroups = spatialGroupsOf(ast);
  const counts: PrimitiveCounts = {
    objects: ast.objects?.length ?? 0,
    sceneObjects: scenes.reduce((sum, scene) => sum + sceneObjectCount(scene), 0),
    scenes: scenes.length,
    lights: ast.lights?.length ?? 0,
    shapes: ast.shapes?.length ?? 0,
    spatialGroups: spatialGroups.length,
    spatialGroupContent: spatialGroups.reduce((sum, group) => sum + spatialGroupContent(group), 0),
    templates: ast.templates?.length ?? 0,
    terrainBlocks: ast.terrains?.length ?? 0,
    domainBlocks: (ast.domainBlocks ?? []).filter(isCoreDomainBlock).length,
  };

  return {
    ...counts,
    total: COUNTED_FIELDS.reduce((sum, field) => sum + counts[field], 0),
  };
}

function scenesOf(ast: HoloComposition): SceneShape[] {
  return (ast.scenes ?? []) as SceneShape[];
}

function spatialGroupsOf(ast: HoloComposition): SpatialGroupShape[] {
  return (ast.spatialGroups ?? []) as SpatialGroupShape[];
}

function sceneObjectCount(scene: SceneShape): number {
  return scene.objects?.length ?? 0;
}

// The parser keeps a group's lights on the group, not in the composition's `lights`, so they
// are counted here; a light counts the same inside a group as outside one.
function spatialGroupContent(group: SpatialGroupShape): number {
  const own = (group.objects?.length ?? 0) + (group.lights?.length ?? 0);
  return (group.groups ?? []).reduce((sum, nested) => sum + spatialGroupContent(nested), own);
}

// Names each scene or spatial group that holds nothing counted, so a rejection says which
// container was empty. Inside an empty group, only the outermost one is named.
function emptyContainerWarnings(ast: HoloComposition): string[] {
  const warnings = scenesOf(ast)
    .filter((scene) => sceneObjectCount(scene) === 0)
    .map((scene) => `scene "${scene.name}" has no objects, so it does not count as scene content`);
  const visit = (groups: SpatialGroupShape[]): void => {
    for (const group of groups) {
      if (spatialGroupContent(group) === 0) {
        warnings.push(
          `spatial_group "${group.name}" has no objects or lights, so it does not count as scene content`
        );
      } else {
        visit(group.groups ?? []);
      }
    }
  };
  visit(spatialGroupsOf(ast));
  return [...new Set(warnings)];
}

// The parser keeps any `word "Name" { ... }` block as domain 'custom' ("any user-defined
// block keyword") so drifted files still parse. A web page's `hero "Landing" { ... }` is one.
// It is not core scene content; counting it let surface-only output through this gate.
// real_estate also parses as 'custom', and nothing downstream gives it any other meaning.
function isCoreDomainBlock(block: { domain: string }): boolean {
  return block.domain !== 'custom';
}

function customBlockKeywords(ast: HoloComposition): string[] {
  const blocks = (ast.domainBlocks ?? []) as Array<{ domain: string; keyword: string }>;
  const keywords = blocks
    .filter((block) => !isCoreDomainBlock(block))
    .map((block) => block.keyword);
  return [...new Set(keywords)];
}

function emptyPrimitiveSummary(): CorePrimitiveSummary {
  return {
    objects: 0,
    sceneObjects: 0,
    scenes: 0,
    lights: 0,
    shapes: 0,
    spatialGroups: 0,
    spatialGroupContent: 0,
    templates: 0,
    terrainBlocks: 0,
    domainBlocks: 0,
    total: 0,
  };
}

function formatParserMessages(
  messages: Array<{ message: string; loc?: { line: number; column: number } } | string>
): string[] {
  return messages.map((message) => {
    if (typeof message === 'string') return message;
    const loc = message.loc ? ` at ${message.loc.line}:${message.loc.column}` : '';
    return `${message.message}${loc}`;
  });
}
