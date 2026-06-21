/**
 * @fileoverview Compile-time Authority effect enforcement for elevated traits.
 *
 * This adapter promotes selected runtime safety checks into the existing effect
 * checker without enabling the full safety pass for every legacy compiler path.
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloValue,
  SourceRange,
} from '../../parser/HoloCompositionTypes';
import { EFFECTS_BY_CATEGORY, type EffectViolation, type VREffect } from '../../types/effects';
import { EffectChecker, type EffectASTNode, type ModuleEffectCheckResult } from './EffectChecker';

export const SANDBOX_AUTHORITY_TRAIT = '@sandbox_execution';
export const REQUIRED_SANDBOX_AUTHORITY_EFFECT: VREffect = 'authority:world';

const AUTHORITY_EFFECTS = new Set<VREffect>(EFFECTS_BY_CATEGORY.authority);
const DECLARED_EFFECT_KEYS = ['effects', 'declaredEffects', 'declared_effects'] as const;
export interface AuthorityEffectCheckOptions {
  moduleId?: string;
}

export interface AuthorityEffectCheckResult {
  passed: boolean;
  nodes: EffectASTNode[];
  violations: EffectViolation[];
  moduleResult: ModuleEffectCheckResult;
}

interface TraitOwner {
  name: string;
  traits?: HoloObjectTrait[];
  children?: HoloObjectDecl[];
  loc?: SourceRange;
}

interface CompositionWithRootTraits extends HoloComposition {
  traits?: HoloObjectTrait[];
}

export class CompileTimeAuthorityEffectError extends Error {
  readonly violations: EffectViolation[];
  readonly nodes: EffectASTNode[];

  constructor(result: AuthorityEffectCheckResult, moduleId: string) {
    super(formatAuthorityFailure(result, moduleId));
    this.name = 'CompileTimeAuthorityEffectError';
    this.violations = result.violations;
    this.nodes = result.nodes;
  }
}

export function checkAuthorityEffects(
  composition: HoloComposition,
  options: AuthorityEffectCheckOptions = {}
): AuthorityEffectCheckResult {
  const moduleId = options.moduleId ?? composition.name ?? 'unknown';
  const nodes = collectAuthorityEffectNodes(composition);
  const checker = new EffectChecker({
    undeclaredSeverity: 'error',
    ignoredCategories: ['io'],
    unusedDeclaredSeverity: 'info',
  });
  const moduleResult = checker.checkModule(nodes, moduleId);

  return {
    passed: moduleResult.passed,
    nodes,
    violations: moduleResult.violations,
    moduleResult,
  };
}

export function assertAuthorityEffects(
  composition: HoloComposition,
  options: AuthorityEffectCheckOptions = {}
): void {
  const result = checkAuthorityEffects(composition, options);
  if (!result.passed) {
    throw new CompileTimeAuthorityEffectError(
      result,
      options.moduleId ?? composition.name ?? 'unknown'
    );
  }
}

export function collectAuthorityEffectNodes(composition: HoloComposition): EffectASTNode[] {
  const nodes: EffectASTNode[] = [];
  const rootTraits = (composition as CompositionWithRootTraits).traits ?? [];

  collectFromOwner({ name: composition.name ?? 'Composition', traits: rootTraits }, nodes);

  for (const template of composition.templates ?? []) {
    collectFromOwner(template, nodes);
  }

  for (const object of composition.objects ?? []) {
    collectFromOwner(object, nodes);
  }

  return nodes;
}

function collectFromOwner(owner: TraitOwner, nodes: EffectASTNode[]): void {
  const traits = owner.traits ?? [];

  for (const trait of traits) {
    if (!isSandboxExecutionTrait(trait)) continue;

    const reasons = elevatedSandboxReasons(trait);
    if (reasons.length === 0) continue;

    nodes.push({
      type: 'object',
      name: `${owner.name}.${normalizeTraitName(trait.name)}`,
      traits: [SANDBOX_AUTHORITY_TRAIT],
      calls: [],
      declaredEffects: collectDeclaredAuthorityEffects(traits, trait),
      inferredEffects: [REQUIRED_SANDBOX_AUTHORITY_EFFECT],
      effectSources: {
        [REQUIRED_SANDBOX_AUTHORITY_EFFECT]: [`@sandbox_execution ${reasons.join(' + ')}`],
      },
      line: trait.loc?.start.line ?? owner.loc?.start.line,
      column: trait.loc?.start.column ?? owner.loc?.start.column,
    });
  }

  for (const child of owner.children ?? []) {
    collectFromOwner(child, nodes);
  }
}

function isSandboxExecutionTrait(trait: HoloObjectTrait): boolean {
  return normalizeTraitName(trait.name) === 'sandbox_execution';
}

function elevatedSandboxReasons(trait: HoloObjectTrait): string[] {
  const reasons: string[] = [];
  const config = trait.config ?? {};

  const permissions = asRecord(config.permissions);
  if (config.allow_native_modules === true && isElevatedPermission(permissions?.filesystem)) {
    reasons.push('allow_native_modules=true', 'permissions.filesystem=all');
  }

  return reasons;
}

function collectDeclaredAuthorityEffects(
  traits: HoloObjectTrait[],
  sandboxTrait: HoloObjectTrait
): VREffect[] {
  const declared = new Set<VREffect>();
  const add = (value: unknown): void => {
    for (const effect of authorityEffectsFrom(value)) {
      declared.add(effect);
    }
  };

  for (const key of DECLARED_EFFECT_KEYS) {
    add(sandboxTrait.config?.[key]);
    add(sandboxTrait.params?.[key]);
  }

  for (const trait of traits) {
    if (normalizeTraitName(trait.name) !== 'effects') continue;

    add(trait.args);
    add(trait.config);
    add(trait.params);
  }

  return [...declared];
}

function authorityEffectsFrom(value: unknown): VREffect[] {
  if (typeof value === 'string') {
    return AUTHORITY_EFFECTS.has(value as VREffect) ? [value as VREffect] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => authorityEffectsFrom(item));
  }

  const record = asRecord(value);
  if (!record) return [];

  const effects: VREffect[] = [];
  for (const key of DECLARED_EFFECT_KEYS) {
    effects.push(...authorityEffectsFrom(record[key]));
  }

  effects.push(...authorityEffectsFrom(record.effect));
  effects.push(...authorityEffectsFrom(record.value));
  effects.push(...authorityEffectsFrom(record.values));

  const authority = record.authority;
  if (typeof authority === 'string') {
    effects.push(...authorityEffectsFrom(`authority:${authority}`));
  } else if (Array.isArray(authority)) {
    for (const item of authority) {
      if (typeof item === 'string') {
        effects.push(...authorityEffectsFrom(`authority:${item}`));
      } else {
        effects.push(...authorityEffectsFrom(item));
      }
    }
  }

  return effects;
}

function isElevatedPermission(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;

  const normalized = value.toLowerCase();
  return normalized === 'all' || normalized === 'host' || normalized === 'native';
}

function asRecord(value: HoloValue | unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeTraitName(name: string): string {
  return name
    .replace(/^@/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/-/g, '_')
    .toLowerCase();
}

function formatAuthorityFailure(result: AuthorityEffectCheckResult, moduleId: string): string {
  const errors = result.violations.filter((violation) => violation.severity === 'error');
  const details = errors
    .map((violation) => {
      const source = violation.source.functionName ?? 'sandbox_execution';
      return `${source}: ${violation.message}`;
    })
    .join('; ');

  return [
    `Compile-time Authority effect check failed for ${moduleId}.`,
    details,
    `Declare @authority { effects: ["${REQUIRED_SANDBOX_AUTHORITY_EFFECT}"] } or effects: ["${REQUIRED_SANDBOX_AUTHORITY_EFFECT}"] for elevated @sandbox_execution.`,
  ]
    .filter(Boolean)
    .join(' ');
}
