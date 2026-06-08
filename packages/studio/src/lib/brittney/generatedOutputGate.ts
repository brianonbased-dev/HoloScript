import { parseHolo, type HoloComposition } from '@holoscript/core';

import { validateHoloOutput, type ValidationResult } from './holoValidator';

export interface CorePrimitiveSummary {
  objects: number;
  sceneObjects: number;
  scenes: number;
  lights: number;
  shapes: number;
  spatialGroups: number;
  templates: number;
  terrainBlocks: number;
  domainBlocks: number;
  total: number;
}

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
  const objects = ast.objects?.length ?? 0;
  const sceneObjects = ((ast.scenes ?? []) as Array<{ objects?: unknown[] }>).reduce(
    (sum: number, scene) => sum + (scene.objects?.length ?? 0),
    0
  );
  const summary: Omit<CorePrimitiveSummary, 'total'> = {
    objects,
    sceneObjects,
    scenes: ast.scenes?.length ?? 0,
    lights: ast.lights?.length ?? 0,
    shapes: ast.shapes?.length ?? 0,
    spatialGroups: ast.spatialGroups?.length ?? 0,
    templates: ast.templates?.length ?? 0,
    terrainBlocks: ast.terrains?.length ?? 0,
    domainBlocks: ast.domainBlocks?.length ?? 0,
  };

  return {
    ...summary,
    total: Object.values(summary).reduce((sum, count) => sum + count, 0),
  };
}

function emptyPrimitiveSummary(): CorePrimitiveSummary {
  return {
    objects: 0,
    sceneObjects: 0,
    scenes: 0,
    lights: 0,
    shapes: 0,
    spatialGroups: 0,
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
