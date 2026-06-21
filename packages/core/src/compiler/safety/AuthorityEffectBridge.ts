import type { ASTNode } from '../../types';
import { EFFECTS_BY_CATEGORY, type VREffect } from '../../types/effects';
import type { EffectASTNode } from './EffectChecker';

const AUTHORITY_WORLD_EFFECT: VREffect = 'authority:world';
const KNOWN_EFFECTS = new Set<VREffect>(Object.values(EFFECTS_BY_CATEGORY).flat());

type UnknownRecord = Record<string, unknown>;

export interface AuthorityEffectBridgeOptions {
  file?: string;
}

export function extractAuthorityEffectNodes(
  nodes: ASTNode[],
  options: AuthorityEffectBridgeOptions = {}
): EffectASTNode[] {
  const effectNodes: EffectASTNode[] = [];

  for (const node of nodes) {
    visitNode(node, effectNodes, options);
  }

  return effectNodes;
}

function visitNode(
  node: ASTNode,
  effectNodes: EffectASTNode[],
  options: AuthorityEffectBridgeOptions
): void {
  const traitConfigs = collectTraitConfigs(node);
  const sandboxConfig = traitConfigs.get('sandbox_execution');

  if (sandboxConfig && sandboxRequiresWorldAuthority(sandboxConfig)) {
    effectNodes.push({
      type: node.type,
      name: nodeName(node),
      traits: ['@sandbox_execution'],
      calls: [],
      declaredEffects: extractDeclaredEffects(node, traitConfigs),
      inferredEffects: [AUTHORITY_WORLD_EFFECT],
      effectSources: {
        [AUTHORITY_WORLD_EFFECT]: [
          '@sandbox_execution allow_native_modules=true with permissions.filesystem="all"',
        ],
      },
      line: sourceLine(node),
      column: sourceColumn(node),
      file: options.file,
    });
  }

  for (const child of childNodes(node)) {
    visitNode(child, effectNodes, options);
  }
}

function collectTraitConfigs(node: ASTNode): Map<string, UnknownRecord> {
  const configs = new Map<string, UnknownRecord>();

  if (node.traits instanceof Map) {
    for (const [name, config] of node.traits) {
      if (isRecord(config)) {
        configs.set(normalizeTraitName(String(name)), config);
      }
    }
  }

  for (const directive of directiveRecords(node)) {
    if (directive.type === 'trait' && typeof directive.name === 'string') {
      configs.set(normalizeTraitName(directive.name), directiveConfig(directive));
    }
  }

  return configs;
}

function extractDeclaredEffects(
  node: ASTNode,
  traitConfigs: Map<string, UnknownRecord>
): VREffect[] {
  const effects = new Set<VREffect>();
  const record = node as unknown as UnknownRecord;

  for (const effect of readEffects(record.declaredEffects)) {
    effects.add(effect);
  }

  for (const directive of directiveRecords(node)) {
    if (directive.type === 'authority') {
      for (const effect of readEffectsFromRecord(directiveConfig(directive))) {
        effects.add(effect);
      }
    }

    if (
      directive.type === 'trait' &&
      typeof directive.name === 'string' &&
      isEffectDeclarationTrait(directive.name)
    ) {
      for (const effect of readEffectsFromRecord(directiveConfig(directive))) {
        effects.add(effect);
      }
    }
  }

  for (const [name, config] of traitConfigs) {
    if (isEffectDeclarationTrait(name) || name === 'authority') {
      for (const effect of readEffectsFromRecord(config)) {
        effects.add(effect);
      }
    }
  }

  return [...effects];
}

function sandboxRequiresWorldAuthority(config: UnknownRecord): boolean {
  const permissions = asRecord(config.permissions);
  const filesystemValue = permissions?.filesystem;
  const filesystem = typeof filesystemValue === 'string' ? filesystemValue : '';

  return asBoolean(config.allow_native_modules) && filesystem.toLowerCase() === 'all';
}

function readEffectsFromRecord(record: UnknownRecord): VREffect[] {
  return [
    ...readEffects(record.effect),
    ...readEffects(record.effects),
    ...readEffects(record.allow),
    ...readEffects(record.declaredEffects),
    ...readEffects(record.authority_effects),
    ...readEffects(record.authorityEffects),
  ];
}

function readEffects(value: unknown): VREffect[] {
  if (typeof value === 'string') {
    return isVREffect(value) ? [value] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => readEffects(entry));
  }

  return [];
}

function isVREffect(value: string): value is VREffect {
  return KNOWN_EFFECTS.has(value as VREffect);
}

function isEffectDeclarationTrait(name: string): boolean {
  const normalized = normalizeTraitName(name);
  return (
    normalized === 'effect' ||
    normalized === 'effects' ||
    normalized === 'authority_effect' ||
    normalized === 'authority_effects'
  );
}

function directiveRecords(node: ASTNode): UnknownRecord[] {
  const record = node as unknown as UnknownRecord;
  const directives = record.directives;

  if (!Array.isArray(directives)) {
    return [];
  }

  return directives.filter(isRecord);
}

function directiveConfig(directive: UnknownRecord): UnknownRecord {
  const config = isRecord(directive.config) ? directive.config : {};
  const topLevel: UnknownRecord = {};

  for (const [key, value] of Object.entries(directive)) {
    if (key !== 'type' && key !== 'name' && key !== 'config') {
      topLevel[key] = value;
    }
  }

  return { ...topLevel, ...config };
}

function childNodes(node: ASTNode): ASTNode[] {
  const record = node as unknown as UnknownRecord;
  const children: ASTNode[] = [];

  for (const key of ['children', 'body']) {
    const value = record[key];
    if (!Array.isArray(value)) {
      continue;
    }

    for (const child of value) {
      if (isAstNodeLike(child)) {
        children.push(child);
      }
    }
  }

  return children;
}

function nodeName(node: ASTNode): string {
  const record = node as unknown as UnknownRecord;
  const value = record.name || record.id || record.label;
  return typeof value === 'string' ? value : '<anonymous>';
}

function sourceLine(node: ASTNode): number | undefined {
  const record = node as unknown as UnknownRecord;

  if (typeof record.line === 'number') {
    return record.line;
  }

  if (Array.isArray(record.position) && typeof record.position[0] === 'number') {
    return record.position[0];
  }

  const loc = asRecord(record.loc);
  const start = asRecord(loc?.start);
  if (typeof start?.line === 'number') {
    return start.line;
  }

  return undefined;
}

function sourceColumn(node: ASTNode): number | undefined {
  const record = node as unknown as UnknownRecord;

  if (typeof record.column === 'number') {
    return record.column;
  }

  if (Array.isArray(record.position) && typeof record.position[1] === 'number') {
    return record.position[1];
  }

  const loc = asRecord(record.loc);
  const start = asRecord(loc?.start);
  if (typeof start?.column === 'number') {
    return start.column;
  }

  return undefined;
}

function normalizeTraitName(name: string): string {
  return name.startsWith('@') ? name.slice(1) : name;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === 'true';
}

function asRecord(value: unknown): UnknownRecord | undefined {
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAstNodeLike(value: unknown): value is ASTNode {
  return isRecord(value) && typeof value.type === 'string';
}
