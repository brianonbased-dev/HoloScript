import { createHash } from 'crypto';
import { CompilerBase, type BaseCompilerOptions } from './CompilerBase';
import type { HoloComposition, HoloObjectDecl, HoloValue } from '../parser/HoloCompositionTypes';

export type FMUMode = 'co-simulation' | 'model-exchange' | 'both';
export type FMUScalarType = 'Real' | 'Integer' | 'Boolean' | 'String';
export type FMUCausality = 'input' | 'output' | 'parameter' | 'local' | 'independent';
export type FMUVariability = 'continuous' | 'discrete' | 'fixed' | 'tunable' | 'constant';

export interface FMUPort {
  name: string;
  type: FMUScalarType;
  causality: FMUCausality;
  variability: FMUVariability;
  valueReference: number;
  description?: string;
  start?: number | string | boolean;
}

export interface FMUCompilerOptions extends BaseCompilerOptions {
  mode?: FMUMode;
  modelIdentifier?: string;
  generationTool?: string;
  includeSourceBundle?: boolean;
  includeCompositionJson?: boolean;
}

export interface FMUManifest {
  fmiVersion: '3.0';
  modelName: string;
  modelIdentifier: string;
  mode: FMUMode;
  guid: string;
  generationTool: string;
  ports: FMUPort[];
  sourceObjectCount: number;
  provenance: {
    composition: string;
    compositionHash: string;
    compiler: 'FMUCompiler';
  };
}

export interface FMUCompileResult {
  kind: 'holoscript-fmi3-source-bundle';
  target: 'fmu';
  manifest: FMUManifest;
  files: Record<string, string>;
}

export interface AbsorbFMUInput {
  modelDescriptionXml?: string;
  manifest?: Partial<FMUManifest>;
  source?: string;
  name?: string;
}

export interface AbsorbFMUResult {
  kind: 'holoscript-fmu-import';
  composition: HoloComposition;
  traitConfig: {
    source: string;
    fmiVersion: string;
    modelIdentifier: string;
    mode: FMUMode;
    inputs: FMUPort[];
    outputs: FMUPort[];
    parameters: FMUPort[];
  };
}

type PortSeed = Omit<FMUPort, 'valueReference' | 'variability' | 'type'> &
  Partial<Pick<FMUPort, 'valueReference' | 'variability' | 'type'>>;

const DEFAULT_OPTIONS: Required<Omit<FMUCompilerOptions, 'provenanceHash' | 'docsOptions'>> = {
  mode: 'both',
  modelIdentifier: '',
  generationTool: 'HoloScript FMUCompiler',
  includeSourceBundle: true,
  includeCompositionJson: true,
  generateDocs: false,
};

export class FMUCompiler extends CompilerBase {
  protected readonly compilerName = 'FMUCompiler';
  private readonly options: Required<Omit<FMUCompilerOptions, 'provenanceHash' | 'docsOptions'>> &
    Pick<FMUCompilerOptions, 'provenanceHash' | 'docsOptions'>;

  constructor(options: FMUCompilerOptions = {}) {
    super();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  compile(composition: HoloComposition, agentToken?: string, outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);
    return JSON.stringify(this.compileToBundle(composition), null, 2);
  }

  compileToFiles(composition: HoloComposition, agentToken?: string): Record<string, string> {
    this.validateCompilerAccess(agentToken);
    return this.compileToBundle(composition).files;
  }

  compileToBundle(composition: HoloComposition): FMUCompileResult {
    const manifest = this.createManifest(composition);
    const compositionJson = JSON.stringify(composition, null, 2);
    const files: Record<string, string> = {
      'modelDescription.xml': this.renderModelDescription(manifest),
      'resources/holoscript-fmu-manifest.json': JSON.stringify(manifest, null, 2),
      'resources/cael-coupling-contract.json': JSON.stringify(
        this.renderCAELContract(manifest),
        null,
        2
      ),
      'README.md': this.renderReadme(manifest),
    };

    if (this.options.includeSourceBundle) {
      files['sources/holoscript_fmu.c'] = this.renderSourceShim(manifest);
      files['binaries/README.md'] =
        'Build the generated sources with an FMI 3.0 C API toolchain to produce platform binaries.';
    }

    if (this.options.includeCompositionJson) {
      files['resources/holoscript-composition.json'] = compositionJson;
    }

    return { kind: 'holoscript-fmi3-source-bundle', target: 'fmu', manifest, files };
  }

  private createManifest(composition: HoloComposition): FMUManifest {
    const compositionHash = digest(JSON.stringify(composition));
    const modelIdentifier =
      this.options.modelIdentifier || sanitizeIdentifier(composition.name || 'HoloScriptFMU');
    const ports = this.collectPorts(composition);

    return {
      fmiVersion: '3.0',
      modelName: composition.name || 'HoloScriptFMU',
      modelIdentifier,
      mode: this.options.mode,
      guid: this.options.provenanceHash || digest(`${modelIdentifier}:${compositionHash}`),
      generationTool: this.options.generationTool,
      ports,
      sourceObjectCount: flattenObjects(composition.objects ?? []).length,
      provenance: {
        composition: composition.name || 'Composition',
        compositionHash,
        compiler: 'FMUCompiler',
      },
    };
  }

  private collectPorts(composition: HoloComposition): FMUPort[] {
    const seeds: PortSeed[] = [
      {
        name: 'time',
        causality: 'independent',
        variability: 'continuous',
        type: 'Real',
        description: 'FMI simulation time',
      },
    ];

    for (const obj of flattenObjects(composition.objects ?? [])) {
      const fmuConfig = this.getTraitConfig(obj, 'fmu') ?? this.getTraitConfig(obj, 'fmu_port');
      seeds.push(...this.portsFromFMUConfig(obj, fmuConfig));

      if (hasTrait(obj, 'physics') || hasTrait(obj, 'rigidbody')) {
        seeds.push(
          this.port(
            `${obj.name}.input.force`,
            'input',
            'continuous',
            'Real',
            'External force input'
          ),
          this.port(
            `${obj.name}.output.state`,
            'output',
            'continuous',
            'Real',
            'Physics state output'
          ),
          this.port(
            `${obj.name}.parameter.mass`,
            'parameter',
            'fixed',
            'Real',
            'Mass parameter',
            getNumber(fmuConfig, 'mass', 1)
          )
        );
      }

      if (hasTrait(obj, 'thermal') || hasTrait(obj, 'thermal_simulation')) {
        seeds.push(
          this.port(
            `${obj.name}.input.heat_flux`,
            'input',
            'continuous',
            'Real',
            'Thermal flux input'
          ),
          this.port(
            `${obj.name}.output.temperature`,
            'output',
            'continuous',
            'Real',
            'Temperature output'
          )
        );
      }

      if (hasTrait(obj, 'structural') || hasTrait(obj, 'structural_fem')) {
        seeds.push(
          this.port(
            `${obj.name}.input.load`,
            'input',
            'continuous',
            'Real',
            'Structural load input'
          ),
          this.port(
            `${obj.name}.output.displacement`,
            'output',
            'continuous',
            'Real',
            'Displacement output'
          )
        );
      }

      if (hasTrait(obj, 'hydraulic') || hasTrait(obj, 'hydraulic_pipe')) {
        seeds.push(
          this.port(
            `${obj.name}.input.pressure`,
            'input',
            'continuous',
            'Real',
            'Hydraulic pressure input'
          ),
          this.port(
            `${obj.name}.output.flow`,
            'output',
            'continuous',
            'Real',
            'Hydraulic flow output'
          )
        );
      }
    }

    return seeds.map((seed, index) => ({
      type: seed.type ?? 'Real',
      variability: seed.variability ?? 'continuous',
      valueReference: seed.valueReference ?? index + 1,
      ...seed,
    }));
  }

  private portsFromFMUConfig(obj: HoloObjectDecl, config?: Record<string, HoloValue>): PortSeed[] {
    if (!config) return [];
    return [
      ...coercePortList(config.inputs, 'input', obj.name),
      ...coercePortList(config.outputs, 'output', obj.name),
      ...coercePortList(config.parameters, 'parameter', obj.name),
      ...coercePortList(config.ports, 'local', obj.name),
    ];
  }

  private getTraitConfig(obj: HoloObjectDecl, name: string): Record<string, HoloValue> | undefined {
    const trait = (obj.traits ?? []).find((t) => t.name === name || t.name === `@${name}`);
    return trait?.config ?? trait?.params;
  }

  private port(
    name: string,
    causality: FMUCausality,
    variability: FMUVariability,
    type: FMUScalarType,
    description: string,
    start?: number | string | boolean
  ): PortSeed {
    return { name, causality, variability, type, description, start };
  }

  private renderModelDescription(manifest: FMUManifest): string {
    const capabilities = [
      manifest.mode === 'model-exchange'
        ? ''
        : `<CoSimulation modelIdentifier="${manifest.modelIdentifier}"/>`,
      manifest.mode === 'co-simulation'
        ? ''
        : `<ModelExchange modelIdentifier="${manifest.modelIdentifier}"/>`,
    ]
      .filter(Boolean)
      .join('\n  ');

    const variables = manifest.ports
      .map(
        (port) =>
          `    <${port.type} name="${escapeXml(port.name)}" valueReference="${port.valueReference}" causality="${port.causality}" variability="${port.variability}"${formatStart(port.start)}${formatDescription(port.description)}/>`
      )
      .join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<fmiModelDescription fmiVersion="3.0" modelName="${escapeXml(manifest.modelName)}" instantiationToken="${manifest.guid}" generationTool="${escapeXml(manifest.generationTool)}">
  ${capabilities}
  <ModelVariables>
${variables}
  </ModelVariables>
  <Annotations>
    <Tool name="HoloScript">
      <Annotation type="cael-coupling-provenance" hash="${manifest.provenance.compositionHash}"/>
    </Tool>
  </Annotations>
</fmiModelDescription>
`;
  }

  private renderCAELContract(manifest: FMUManifest): Record<string, unknown> {
    return {
      kind: 'cael-fmu-coupling-contract',
      fmiVersion: manifest.fmiVersion,
      modelIdentifier: manifest.modelIdentifier,
      couplingStep: {
        requires: manifest.ports.filter((p) => p.causality === 'input').map((p) => p.name),
        produces: manifest.ports.filter((p) => p.causality === 'output').map((p) => p.name),
        receiptHash: digest(`${manifest.guid}:${manifest.ports.map((p) => p.name).join('|')}`),
      },
      provenance: manifest.provenance,
    };
  }

  private renderReadme(manifest: FMUManifest): string {
    return `# ${manifest.modelName} FMU bundle

FMI version: ${manifest.fmiVersion}
Mode: ${manifest.mode}
Model identifier: ${manifest.modelIdentifier}

This bundle contains a HoloScript-generated FMI 3.0 source package shape with modelDescription.xml, typed scalar ports, and a CAEL coupling contract for provenance receipts.
`;
  }

  private renderSourceShim(manifest: FMUManifest): string {
    return `/* Generated by HoloScript FMUCompiler for FMI 3.0. */
#include "fmi3Functions.h"

const char* holoscript_fmu_model_identifier = "${manifest.modelIdentifier}";
const char* holoscript_fmu_provenance_hash = "${manifest.provenance.compositionHash}";
`;
  }
}

export function compileToFMU(
  composition: HoloComposition,
  options: FMUCompilerOptions = {}
): FMUCompileResult {
  return new FMUCompiler(options).compileToBundle(composition);
}

export function absorbFMU(input: AbsorbFMUInput): AbsorbFMUResult {
  const manifest = input.manifest ?? {};
  const xml = input.modelDescriptionXml ?? '';
  const modelName =
    input.name ??
    manifest.modelName ??
    readXmlAttr(xml, 'fmiModelDescription', 'modelName') ??
    'ImportedFMU';
  const modelIdentifier =
    manifest.modelIdentifier ??
    readXmlAttr(xml, 'CoSimulation', 'modelIdentifier') ??
    readXmlAttr(xml, 'ModelExchange', 'modelIdentifier') ??
    sanitizeIdentifier(modelName);
  const mode = inferMode(xml, manifest.mode);
  const ports = manifest.ports ?? readPortsFromModelDescription(xml);
  const inputs = ports.filter((p) => p.causality === 'input');
  const outputs = ports.filter((p) => p.causality === 'output');
  const parameters = ports.filter((p) => p.causality === 'parameter');
  const traitConfig = {
    source: input.source ?? `${modelIdentifier}.fmu`,
    fmiVersion:
      manifest.fmiVersion ?? readXmlAttr(xml, 'fmiModelDescription', 'fmiVersion') ?? '3.0',
    modelIdentifier,
    mode,
    inputs,
    outputs,
    parameters,
  };
  const compositionTraitConfig = toHoloFMUTraitConfig(traitConfig);

  return {
    kind: 'holoscript-fmu-import',
    traitConfig,
    composition: {
      type: 'Composition',
      name: `${modelName}Wrapper`,
      templates: [],
      objects: [
        {
          type: 'Object',
          name: modelName,
          properties: [],
          traits: [{ type: 'ObjectTrait', name: 'fmu', config: compositionTraitConfig }],
        },
      ],
      spatialGroups: [],
      lights: [],
      imports: [],
      timelines: [],
      audio: [],
      zones: [],
      transitions: [],
      conditionals: [],
      iterators: [],
      npcs: [],
      quests: [],
      abilities: [],
      dialogues: [],
      stateMachines: [],
      achievements: [],
      talentTrees: [],
      shapes: [],
    },
  };
}

function toHoloFMUTraitConfig(config: AbsorbFMUResult['traitConfig']): Record<string, HoloValue> {
  return {
    source: config.source,
    fmiVersion: config.fmiVersion,
    modelIdentifier: config.modelIdentifier,
    mode: config.mode,
    inputs: config.inputs.map(portToHoloValue),
    outputs: config.outputs.map(portToHoloValue),
    parameters: config.parameters.map(portToHoloValue),
  };
}

function portToHoloValue(port: FMUPort): Record<string, HoloValue> {
  const value: Record<string, HoloValue> = {
    name: port.name,
    type: port.type,
    causality: port.causality,
    variability: port.variability,
    valueReference: port.valueReference,
  };

  if (port.description !== undefined) value.description = port.description;
  if (port.start !== undefined) value.start = port.start;
  return value;
}

function flattenObjects(objects: HoloObjectDecl[]): HoloObjectDecl[] {
  return objects.flatMap((obj) => [obj, ...flattenObjects(obj.children ?? [])]);
}

function hasTrait(obj: HoloObjectDecl, name: string): boolean {
  return (obj.traits ?? []).some((trait) => trait.name === name || trait.name === `@${name}`);
}

function coercePortList(
  value: HoloValue | undefined,
  causality: FMUCausality,
  objectName: string
): PortSeed[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (typeof entry === 'string') {
      return [{ name: `${objectName}.${causality}.${entry}`, causality }];
    }
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && !('__bind' in entry)) {
      const record = entry as Record<string, HoloValue>;
      const name = typeof record.name === 'string' ? record.name : `port_${index + 1}`;
      return [
        {
          name: name.includes('.') ? name : `${objectName}.${causality}.${name}`,
          causality: coerceCausality(record.causality, causality),
          variability: coerceVariability(record.variability, causality),
          type: coerceScalarType(record.type),
          start: coerceStart(record.start),
          description: typeof record.description === 'string' ? record.description : undefined,
        },
      ];
    }
    return [];
  });
}

function readPortsFromModelDescription(xml: string): FMUPort[] {
  const ports: FMUPort[] = [];
  const variablePattern = /<(Real|Integer|Boolean|String)\b([^/>]*?)(?:\/>|>[\s\S]*?<\/\1>)/g;
  let match: RegExpExecArray | null;
  let valueReference = 1;
  while ((match = variablePattern.exec(xml))) {
    const type = match[1] as FMUScalarType;
    const attrs = parseAttrs(match[2] ?? '');
    ports.push({
      name: attrs.name ?? `port_${valueReference}`,
      type,
      causality: coerceCausality(attrs.causality, 'local'),
      variability: coerceVariability(attrs.variability),
      valueReference: Number(attrs.valueReference ?? valueReference),
      description: attrs.description,
      start: parseStart(attrs.start, type),
    });
    valueReference += 1;
  }
  return ports;
}

function parseAttrs(text: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of text.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
    attrs[match[1]] = match[2];
  }
  return attrs;
}

function readXmlAttr(xml: string, tag: string, attr: string): string | undefined {
  const match = xml.match(new RegExp(`<${tag}\\b([^>]*)>`, 'i'));
  return match ? parseAttrs(match[1] ?? '')[attr] : undefined;
}

function inferMode(xml: string, mode?: FMUMode): FMUMode {
  if (mode) return mode;
  const hasCosim = /<CoSimulation\b/i.test(xml);
  const hasModelExchange = /<ModelExchange\b/i.test(xml);
  if (hasCosim && hasModelExchange) return 'both';
  if (hasModelExchange) return 'model-exchange';
  return 'co-simulation';
}

function coerceScalarType(value: HoloValue | string | undefined): FMUScalarType {
  return value === 'Integer' || value === 'Boolean' || value === 'String' ? value : 'Real';
}

function coerceCausality(
  value: HoloValue | string | undefined,
  fallback: FMUCausality
): FMUCausality {
  return value === 'input' || value === 'output' || value === 'parameter' || value === 'independent'
    ? value
    : value === 'local'
      ? 'local'
      : fallback;
}

function coerceVariability(
  value: HoloValue | string | undefined,
  causality: FMUCausality = 'local'
): FMUVariability {
  return value === 'discrete' || value === 'fixed' || value === 'tunable' || value === 'constant'
    ? value
    : causality === 'parameter'
      ? 'fixed'
      : 'continuous';
}

function coerceStart(value: HoloValue | undefined): number | string | boolean | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? value
    : undefined;
}

function parseStart(
  value: string | undefined,
  type: FMUScalarType
): number | string | boolean | undefined {
  if (value === undefined) return undefined;
  if (type === 'Boolean') return value === 'true';
  if (type === 'String') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function getNumber(
  config: Record<string, HoloValue> | undefined,
  key: string,
  fallback: number
): number {
  const value = config?.[key];
  return typeof value === 'number' ? value : fallback;
}

function formatStart(value: number | string | boolean | undefined): string {
  return value === undefined ? '' : ` start="${escapeXml(String(value))}"`;
}

function formatDescription(value: string | undefined): string {
  return value ? ` description="${escapeXml(value)}"` : '';
}

function sanitizeIdentifier(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, '_').replace(/^[^A-Za-z_]/, '_$&');
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
