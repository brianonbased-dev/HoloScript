/**
 * DaimonSeedCompiler - compile a portable seed recipe, never the runtime "soul".
 *
 * The emitted DaimonSeed IR is a deterministic JSON recipe: field priors,
 * composition priors, shared JSON-Logic threshold predicate, provenance refs,
 * and custody/export semantics. Runtime-only state such as the realized
 * composition, observation path, and soul is deliberately not serialized.
 */

import { createHash } from 'crypto';
import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloValue,
} from '../parser/HoloCompositionTypes';
import { evaluateJsonLogic, matchesRule, type JsonLogicRule } from '../policy/jsonLogic';

export type DaimonSeedSchemaVersion = 'holoscript.daimon-seed.v0.1.0';

export interface DaimonFieldPriors {
  tensorSchema: string;
  shape: number[];
  dtype: string;
  weightsRef: string;
}

export interface DaimonSeedThresholdRuntime {
  id: 'ContentPolicyGate.jsonLogic';
  source: 'packages/core/src/policy/jsonLogic.ts';
  operators: 'shared-json-logic-subset';
}

export interface DaimonSeedThresholdPreview {
  facts: Record<string, unknown>;
  result: unknown;
  passed: boolean;
}

export interface DaimonCompositionPriors {
  traitVocabulary: string[];
  initialWeights: Record<string, number>;
}

export interface DaimonSeedIR {
  schemaVersion: DaimonSeedSchemaVersion;
  kind: 'DaimonSeed';
  seedId: string;
  domainSpecHash: string;
  fieldPriors: DaimonFieldPriors;
  thresholdFn: JsonLogicRule;
  thresholdRuntime: DaimonSeedThresholdRuntime;
  thresholdPreview: DaimonSeedThresholdPreview;
  compositionPriors: DaimonCompositionPriors;
  provenanceChainRef: string;
  emergenceContractRef: string;
  reproducibility: {
    withinNoiseFloor: boolean;
    deterministicDigest: string;
    noiseFloorRef?: string;
  };
  fidelityContract: {
    metric: 'exportFidelity';
    formula: '1 - div(runtime,download)/noise_floor';
    divergence: 'rootMeanSquare';
    lowFidelityVerdict: 'forbidden_theater';
    receiptRequired: true;
  };
  hysteresisExp2: {
    coefficient: 'div(A,B)/div(A,A_prime)';
    orderedArm: 'A: original observation order';
    shuffledArm: 'B: same observation set, shuffled order';
    rerunArm: 'A_prime: same seed, same order rerun';
    diagnosticRule: 'path-dependence real iff coefficient > 1 and plateaus above noise floor';
    diffContentArm: 'upper-bound scale only, non-diagnostic';
  };
  custody: {
    ownedObject: 'lossless_recipe';
    weightsOwnership: 'not_owned';
    runtimeOnly: ['realizedComposition', 'observationPath', 'soul'];
    note: 'compile the seed, receipt the emergence, never serialize the soul';
  };
  source: {
    compositionName: string;
    objectCount: number;
    traitCount: number;
  };
}

export interface DaimonSeedCompilerOptions {
  seedId?: string;
  domainSpecHash?: string;
  fieldPriors?: Partial<DaimonFieldPriors>;
  thresholdFn?: JsonLogicRule;
  thresholdFacts?: Record<string, unknown>;
  initialWeights?: Record<string, number>;
  provenanceChainRef?: string;
  emergenceContractRef?: string;
  noiseFloorRef?: string;
}

export interface ExportFidelityInput {
  runtimeVector: readonly number[];
  downloadedVector: readonly number[];
  noiseFloor: number;
}

export interface ExportFidelityResult {
  divergence: number;
  noiseFloor: number;
  exportFidelity: number;
  forbiddenTheater: boolean;
}

export interface HysteresisExp2Input {
  ordered: readonly number[];
  shuffled: readonly number[];
  rerun: readonly number[];
  coefficientSeries?: readonly number[];
  coefficientThreshold?: number;
  plateauTolerance?: number;
}

export interface HysteresisExp2Result {
  sameSeedNoiseFloor: number;
  sameSetDivergence: number;
  hysteresisCoefficient: number;
  plateaued: boolean;
  pathDependenceReal: boolean;
  diagnostic: 'path-dependent' | 'noise-floor' | 'not-plateaued';
}

const SCHEMA_VERSION: DaimonSeedSchemaVersion = 'holoscript.daimon-seed.v0.1.0';

const DEFAULT_THRESHOLD_FACTS = {
  emergenceCredit: 0.01,
  custodyScore: 1,
  measuredValueIndependence: 0.5,
};

const DEFAULT_THRESHOLD_FN: JsonLogicRule = {
  and: [
    { '>=': [{ var: 'emergenceCredit' }, 0.01] },
    { '>=': [{ var: 'custodyScore' }, 1] },
    { '>=': [{ var: 'measuredValueIndependence' }, 0.5] },
  ],
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function sha256Hex(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function assertEqualLength(a: readonly number[], b: readonly number[], label: string): void {
  if (a.length === 0 || b.length === 0) {
    throw new Error(`${label} requires non-empty vectors`);
  }
  if (a.length !== b.length) {
    throw new Error(`${label} requires equal-length vectors (${a.length} !== ${b.length})`);
  }
}

function rootMeanSquareDivergence(a: readonly number[], b: readonly number[]): number {
  assertEqualLength(a, b, 'divergence');
  const sum = a.reduce((acc, value, index) => {
    const delta = value - b[index]!;
    return acc + delta * delta;
  }, 0);
  return Math.sqrt(sum / a.length);
}

function isPlateaued(series: readonly number[], tolerance: number): boolean {
  if (series.length < 3) return false;
  const last = series[series.length - 1]!;
  const prev = series[series.length - 2]!;
  const prior = series[series.length - 3]!;
  const denom = Math.max(1, Math.abs(last));
  return Math.abs(last - prev) / denom <= tolerance && Math.abs(prev - prior) / denom <= tolerance;
}

function normalizeTraitName(trait: string | HoloObjectTrait): string {
  return typeof trait === 'string' ? trait : trait.name;
}

function primitiveValue(value: HoloValue): HoloValue | string {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => primitiveValue(item)) as HoloValue;
  }
  return stableStringify(value);
}

function normalizeObject(obj: HoloObjectDecl): Record<string, unknown> {
  return {
    name: obj.name,
    traits: (obj.traits ?? []).map(normalizeTraitName).sort(),
    properties: (obj.properties ?? [])
      .map((property) => ({ key: property.key, value: primitiveValue(property.value) }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    children: (obj.children ?? [])
      .map(normalizeObject)
      .sort((a, b) => String(a['name']).localeCompare(String(b['name']))),
  };
}

function collectObjects(composition: HoloComposition): HoloObjectDecl[] {
  const objects: HoloObjectDecl[] = [];
  const visit = (obj: HoloObjectDecl): void => {
    objects.push(obj);
    for (const child of obj.children ?? []) visit(child);
  };
  for (const obj of composition.objects ?? []) visit(obj);
  for (const group of composition.spatialGroups ?? []) {
    for (const obj of group.objects ?? []) visit(obj);
  }
  return objects;
}

function collectTraitVocabulary(objects: readonly HoloObjectDecl[]): string[] {
  const names = new Set<string>();
  for (const obj of objects) {
    for (const trait of obj.traits ?? []) {
      names.add(normalizeTraitName(trait));
    }
  }
  return [...names].sort();
}

function buildDomainSpec(composition: HoloComposition): Record<string, unknown> {
  return {
    compositionName: composition.name,
    metadata: composition.metadata ?? {},
    objects: (composition.objects ?? [])
      .map(normalizeObject)
      .sort((a, b) => String(a['name']).localeCompare(String(b['name']))),
    spatialGroups: (composition.spatialGroups ?? [])
      .map((group) => ({
        name: group.name,
        objects: (group.objects ?? [])
          .map(normalizeObject)
          .sort((a, b) => String(a['name']).localeCompare(String(b['name']))),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function computeExportFidelity(input: ExportFidelityInput): ExportFidelityResult {
  if (!(input.noiseFloor > 0)) {
    throw new Error(`export fidelity requires noiseFloor > 0 (got ${input.noiseFloor})`);
  }
  const divergence = rootMeanSquareDivergence(input.runtimeVector, input.downloadedVector);
  const exportFidelity = clamp01(1 - divergence / input.noiseFloor);
  return {
    divergence,
    noiseFloor: input.noiseFloor,
    exportFidelity,
    forbiddenTheater: exportFidelity <= 0,
  };
}

export function runHysteresisExp2(input: HysteresisExp2Input): HysteresisExp2Result {
  const threshold = input.coefficientThreshold ?? 1;
  const plateauTolerance = input.plateauTolerance ?? 0.05;
  const sameSeedNoiseFloor = rootMeanSquareDivergence(input.ordered, input.rerun);
  const sameSetDivergence = rootMeanSquareDivergence(input.ordered, input.shuffled);
  const denominator = Math.max(sameSeedNoiseFloor, Number.EPSILON);
  const hysteresisCoefficient = sameSetDivergence / denominator;
  const series =
    input.coefficientSeries ?? [hysteresisCoefficient, hysteresisCoefficient, hysteresisCoefficient];
  const plateaued = isPlateaued(series, plateauTolerance);
  const pathDependenceReal = hysteresisCoefficient > threshold && plateaued;
  const diagnostic = pathDependenceReal
    ? 'path-dependent'
    : !plateaued
      ? 'not-plateaued'
      : 'noise-floor';

  return {
    sameSeedNoiseFloor,
    sameSetDivergence,
    hysteresisCoefficient,
    plateaued,
    pathDependenceReal,
    diagnostic,
  };
}

export class DaimonSeedCompiler extends CompilerBase {
  protected readonly compilerName = 'DaimonSeedCompiler';
  private readonly options: DaimonSeedCompilerOptions;

  constructor(options: DaimonSeedCompilerOptions = {}) {
    super();
    this.options = options;
  }

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.DAIMON_SEED;
  }

  compile(composition: HoloComposition, agentToken?: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);
    const seed = this.compileSeed(composition);
    return JSON.stringify(seed, null, 2);
  }

  override compileToFiles(composition: HoloComposition, agentToken = ''): Record<string, string> {
    return { [this.defaultOutputFileName()]: this.compile(composition, agentToken) };
  }

  protected override defaultOutputFileName(): string {
    return 'daimon-seed.json';
  }

  private compileSeed(composition: HoloComposition): DaimonSeedIR {
    const objects = collectObjects(composition);
    const traitVocabulary = collectTraitVocabulary(objects);
    const domainSpecHash =
      this.options.domainSpecHash ?? `sha256:${sha256Hex(buildDomainSpec(composition))}`;
    const seedId = this.options.seedId ?? `daimon:${domainSpecHash.slice(-16)}`;
    const thresholdFn = this.options.thresholdFn ?? DEFAULT_THRESHOLD_FN;
    const thresholdFacts = this.options.thresholdFacts ?? DEFAULT_THRESHOLD_FACTS;
    const thresholdPreview: DaimonSeedThresholdPreview = {
      facts: thresholdFacts,
      result: evaluateJsonLogic(thresholdFn, thresholdFacts),
      passed: matchesRule(thresholdFn, thresholdFacts),
    };
    const initialWeights = this.buildInitialWeights(traitVocabulary);
    const seedWithoutDigest = {
      schemaVersion: SCHEMA_VERSION,
      kind: 'DaimonSeed' as const,
      seedId,
      domainSpecHash,
      fieldPriors: this.buildFieldPriors(traitVocabulary.length),
      thresholdFn,
      thresholdRuntime: {
        id: 'ContentPolicyGate.jsonLogic' as const,
        source: 'packages/core/src/policy/jsonLogic.ts' as const,
        operators: 'shared-json-logic-subset' as const,
      },
      thresholdPreview,
      compositionPriors: {
        traitVocabulary,
        initialWeights,
      },
      provenanceChainRef: this.options.provenanceChainRef ?? 'provenance-chain:required',
      emergenceContractRef: this.options.emergenceContractRef ?? 'emergence-contract:required',
      reproducibility: {
        withinNoiseFloor: true,
        ...(this.options.noiseFloorRef ? { noiseFloorRef: this.options.noiseFloorRef } : {}),
      },
      fidelityContract: {
        metric: 'exportFidelity' as const,
        formula: '1 - div(runtime,download)/noise_floor' as const,
        divergence: 'rootMeanSquare' as const,
        lowFidelityVerdict: 'forbidden_theater' as const,
        receiptRequired: true as const,
      },
      hysteresisExp2: {
        coefficient: 'div(A,B)/div(A,A_prime)' as const,
        orderedArm: 'A: original observation order' as const,
        shuffledArm: 'B: same observation set, shuffled order' as const,
        rerunArm: 'A_prime: same seed, same order rerun' as const,
        diagnosticRule:
          'path-dependence real iff coefficient > 1 and plateaus above noise floor' as const,
        diffContentArm: 'upper-bound scale only, non-diagnostic' as const,
      },
      custody: {
        ownedObject: 'lossless_recipe' as const,
        weightsOwnership: 'not_owned' as const,
        runtimeOnly: ['realizedComposition', 'observationPath', 'soul'] as [
          'realizedComposition',
          'observationPath',
          'soul',
        ],
        note: 'compile the seed, receipt the emergence, never serialize the soul' as const,
      },
      source: {
        compositionName: composition.name,
        objectCount: objects.length,
        traitCount: traitVocabulary.length,
      },
    };
    const deterministicDigest = `sha256:${sha256Hex(seedWithoutDigest)}`;

    return {
      ...seedWithoutDigest,
      reproducibility: {
        ...seedWithoutDigest.reproducibility,
        deterministicDigest,
      },
    };
  }

  private buildFieldPriors(traitCount: number): DaimonFieldPriors {
    const priors = this.options.fieldPriors ?? {};
    return {
      tensorSchema: priors.tensorSchema ?? 'trait-prior-vector/v1',
      shape: priors.shape ?? [Math.max(traitCount, 1)],
      dtype: priors.dtype ?? 'float32',
      weightsRef: priors.weightsRef ?? 'weights:not-serialized',
    };
  }

  private buildInitialWeights(traitVocabulary: readonly string[]): Record<string, number> {
    const out: Record<string, number> = {};
    for (const trait of traitVocabulary) {
      const configured = this.options.initialWeights?.[trait];
      out[trait] = typeof configured === 'number' && Number.isFinite(configured) ? configured : 1;
    }
    return out;
  }
}

export function createDaimonSeedCompiler(options?: DaimonSeedCompilerOptions): DaimonSeedCompiler {
  return new DaimonSeedCompiler(options);
}

export default DaimonSeedCompiler;
