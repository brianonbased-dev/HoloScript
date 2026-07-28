/**
 * Visual projection contract for remixable HoloScript plugins.
 *
 * HoloScript owns the semantic base projection: scene slots, object mappings,
 * panels, interaction verbs, remix prompts, and receipt hooks. Downstream
 * consumers such as Hololand can render this as a polished world without
 * redefining the source plugin's meaning.
 */

export const VISUAL_PROJECTION_SCHEMA_VERSION = 'holoscript.visual.projection.v1' as const;

export type VisualProjectionSchemaVersion = typeof VISUAL_PROJECTION_SCHEMA_VERSION;

export type VisualProjectionViewport = '2d' | '3d' | 'xr' | 'ar' | 'vr' | 'hologram';

export type VisualProjectionSceneTemplate =
  | 'blank'
  | 'map'
  | 'gallery'
  | 'dashboard'
  | 'evidence-room'
  | 'training-room'
  | 'operator-room'
  | 'simulation-lab'
  | 'custom';

export type VisualProjectionPrimitive =
  | 'anchor'
  | 'avatar'
  | 'badge'
  | 'card'
  | 'chart'
  | 'control'
  | 'graph'
  | 'heatmap'
  | 'layer'
  | 'panel'
  | 'path'
  | 'point'
  | 'receipt'
  | 'room'
  | 'table'
  | 'timeline'
  | 'zone'
  | (string & {});

export type VisualProjectionValue =
  | string
  | number
  | boolean
  | null
  | VisualProjectionValue[]
  | { [key: string]: VisualProjectionValue };

export interface VisualProjectionScene {
  id: string;
  template: VisualProjectionSceneTemplate;
  title: string;
  viewport: VisualProjectionViewport[];
  description?: string;
  slots?: string[];
  defaultCamera?: {
    position?: [number, number, number];
    target?: [number, number, number];
  };
}

export interface VisualProjectionObjectMapping {
  id: string;
  sourceTrait: string;
  visualRole: string;
  primitive: VisualProjectionPrimitive;
  label?: string;
  slots?: string[];
  affordances?: string[];
  defaultState?: Record<string, VisualProjectionValue>;
}

export interface VisualProjectionPanelMapping {
  id: string;
  title: string;
  layout: 'compact' | 'detail' | 'timeline' | 'table' | 'graph' | 'map' | 'custom';
  source?: string;
  fields?: string[];
}

export interface VisualProjectionInteraction {
  verb: string;
  label: string;
  target: string;
  agentAction?: string;
  humanAction?: string;
  receiptKey?: string;
}

export interface VisualProjectionRemixPrompt {
  id: string;
  audience: 'agent' | 'builder' | 'operator' | 'designer' | 'anyone';
  prompt: string;
  guardrails?: string[];
}

export interface VisualProjectionReceiptHook {
  id: string;
  event: string;
  writes: string[];
  description?: string;
}

export interface VisualProjectionManifest {
  schemaVersion: VisualProjectionSchemaVersion;
  pluginId: string;
  projectionId: string;
  displayName: string;
  sourcePackage?: string;
  summary: string;
  defaultScene: VisualProjectionScene;
  objectMappings: VisualProjectionObjectMapping[];
  panelMappings: VisualProjectionPanelMapping[];
  interactions: VisualProjectionInteraction[];
  remixPrompts: VisualProjectionRemixPrompt[];
  receiptHooks?: VisualProjectionReceiptHook[];
  consumerHints?: {
    hololandPluginId?: string;
    preferredRuntime?: VisualProjectionViewport[];
    notes?: string[];
  };
}

export interface VisualProjectionValidationIssue {
  path: string;
  message: string;
}

export interface VisualProjectionValidationResult {
  valid: boolean;
  errors: VisualProjectionValidationIssue[];
  warnings: VisualProjectionValidationIssue[];
}

export interface VisualRemixSeed {
  projectionId: string;
  pluginId: string;
  summary: string;
  scene: VisualProjectionScene;
  objects: VisualProjectionObjectMapping[];
  panels: VisualProjectionPanelMapping[];
  interactions: VisualProjectionInteraction[];
  remixPrompts: VisualProjectionRemixPrompt[];
}

function hasText(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function pushRequiredString(
  errors: VisualProjectionValidationIssue[],
  path: string,
  value: string | undefined
): void {
  if (!hasText(value)) {
    errors.push({ path, message: 'Expected a non-empty string.' });
  }
}

function checkUniqueIds(
  errors: VisualProjectionValidationIssue[],
  path: string,
  values: ReadonlyArray<{ id: string }>
): void {
  const seen = new Set<string>();
  for (const item of values) {
    if (seen.has(item.id)) {
      errors.push({ path, message: `Duplicate id "${item.id}".` });
    }
    seen.add(item.id);
  }
}

export function validateVisualProjectionManifest(
  manifest: VisualProjectionManifest
): VisualProjectionValidationResult {
  const errors: VisualProjectionValidationIssue[] = [];
  const warnings: VisualProjectionValidationIssue[] = [];

  if (manifest.schemaVersion !== VISUAL_PROJECTION_SCHEMA_VERSION) {
    errors.push({
      path: 'schemaVersion',
      message: `Expected ${VISUAL_PROJECTION_SCHEMA_VERSION}.`,
    });
  }

  pushRequiredString(errors, 'pluginId', manifest.pluginId);
  pushRequiredString(errors, 'projectionId', manifest.projectionId);
  pushRequiredString(errors, 'displayName', manifest.displayName);
  pushRequiredString(errors, 'summary', manifest.summary);
  pushRequiredString(errors, 'defaultScene.id', manifest.defaultScene?.id);
  pushRequiredString(errors, 'defaultScene.title', manifest.defaultScene?.title);

  if (
    !Array.isArray(manifest.defaultScene?.viewport) ||
    manifest.defaultScene.viewport.length === 0
  ) {
    errors.push({
      path: 'defaultScene.viewport',
      message: 'Expected at least one target viewport.',
    });
  }

  if (!Array.isArray(manifest.objectMappings) || manifest.objectMappings.length === 0) {
    errors.push({
      path: 'objectMappings',
      message: 'Expected at least one object mapping.',
    });
  } else {
    checkUniqueIds(errors, 'objectMappings', manifest.objectMappings);
    for (const [index, mapping] of manifest.objectMappings.entries()) {
      pushRequiredString(errors, `objectMappings.${index}.id`, mapping.id);
      pushRequiredString(errors, `objectMappings.${index}.sourceTrait`, mapping.sourceTrait);
      pushRequiredString(errors, `objectMappings.${index}.visualRole`, mapping.visualRole);
      pushRequiredString(errors, `objectMappings.${index}.primitive`, mapping.primitive);
    }
  }

  if (!Array.isArray(manifest.panelMappings)) {
    errors.push({ path: 'panelMappings', message: 'Expected an array.' });
  } else {
    checkUniqueIds(errors, 'panelMappings', manifest.panelMappings);
  }

  if (!Array.isArray(manifest.interactions) || manifest.interactions.length === 0) {
    errors.push({
      path: 'interactions',
      message: 'Expected at least one interaction verb.',
    });
  } else {
    const targets = new Set<string>([
      'scene',
      ...manifest.objectMappings.map((mapping) => mapping.id),
      ...manifest.panelMappings.map((mapping) => mapping.id),
    ]);
    for (const [index, interaction] of manifest.interactions.entries()) {
      pushRequiredString(errors, `interactions.${index}.verb`, interaction.verb);
      pushRequiredString(errors, `interactions.${index}.label`, interaction.label);
      pushRequiredString(errors, `interactions.${index}.target`, interaction.target);
      if (hasText(interaction.target) && !targets.has(interaction.target)) {
        warnings.push({
          path: `interactions.${index}.target`,
          message: `Target "${interaction.target}" is not a declared object, panel, or scene.`,
        });
      }
    }
  }

  if (!Array.isArray(manifest.remixPrompts) || manifest.remixPrompts.length === 0) {
    errors.push({
      path: 'remixPrompts',
      message: 'Expected at least one remix prompt for agents or builders.',
    });
  } else {
    checkUniqueIds(errors, 'remixPrompts', manifest.remixPrompts);
    for (const [index, prompt] of manifest.remixPrompts.entries()) {
      pushRequiredString(errors, `remixPrompts.${index}.id`, prompt.id);
      pushRequiredString(errors, `remixPrompts.${index}.prompt`, prompt.prompt);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function assertVisualProjectionManifest(manifest: VisualProjectionManifest): void {
  const result = validateVisualProjectionManifest(manifest);
  if (!result.valid) {
    const detail = result.errors.map((issue) => `${issue.path}: ${issue.message}`).join('\n');
    throw new Error(`Invalid visual projection manifest:\n${detail}`);
  }
}

export function createVisualRemixSeed(manifest: VisualProjectionManifest): VisualRemixSeed {
  assertVisualProjectionManifest(manifest);
  return {
    projectionId: manifest.projectionId,
    pluginId: manifest.pluginId,
    summary: manifest.summary,
    scene: manifest.defaultScene,
    objects: [...manifest.objectMappings],
    panels: [...manifest.panelMappings],
    interactions: [...manifest.interactions],
    remixPrompts: [...manifest.remixPrompts],
  };
}
