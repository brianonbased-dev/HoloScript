import type { HoloComposition, HoloDomainBlock, HoloValue } from '../parser/HoloCompositionTypes';
import type { ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import { CompilerBase, createTestCompilerToken } from './CompilerBase';

export const PCG_GRAPH_SCHEMA = 'holoscript-pcg-graph-v1' as const;

export type PCGGraphNodeKind =
  | 'surface'
  | 'density_filter'
  | 'slope_mask'
  | 'scatter'
  | 'snap_to_terrain'
  | 'output'
  | 'custom';

export type PCGPortType = 'surface' | 'scalar-field' | 'point-set' | 'asset';

export interface PCGGraphPort {
  name: string;
  type: PCGPortType;
  direction: 'input' | 'output';
  required?: boolean;
}

export interface PCGGraphNode {
  id: string;
  kind: PCGGraphNodeKind;
  label: string;
  inputs: PCGGraphPort[];
  outputs: PCGGraphPort[];
  properties: Record<string, unknown>;
  gpu?: boolean;
}

export interface PCGGraphEdge {
  from: {
    node: string;
    port: string;
  };
  to: {
    node: string;
    port: string;
  };
  type: PCGPortType;
}

export interface PCGGraphIR {
  schema: typeof PCG_GRAPH_SCHEMA;
  name: string;
  seed?: number;
  nodes: PCGGraphNode[];
  edges: PCGGraphEdge[];
  gpuEvaluation: {
    enabled: boolean;
    dispatchHint: string;
    deterministicSeed?: number;
  };
  metadata: {
    sourceBlocks: string[];
    target: 'unreal-pcg-xml';
  };
}

export interface PCGGraphCompileResult {
  graph: PCGGraphIR;
  unrealXml: string;
  gpuEvalPlan: string;
  diagnostics: string[];
}

export interface PCGGraphCompileOptions {
  name?: string;
  gpuEvaluation?: boolean;
  seed?: number;
}

interface ExplicitNodeSpec {
  id?: unknown;
  kind?: unknown;
  type?: unknown;
  label?: unknown;
  properties?: unknown;
  gpu?: unknown;
}

const NODE_PORTS: Record<PCGGraphNodeKind, { inputs: PCGGraphPort[]; outputs: PCGGraphPort[] }> = {
  surface: {
    inputs: [],
    outputs: [{ name: 'surface', type: 'surface', direction: 'output' }],
  },
  density_filter: {
    inputs: [{ name: 'surface', type: 'surface', direction: 'input', required: true }],
    outputs: [{ name: 'density', type: 'scalar-field', direction: 'output' }],
  },
  slope_mask: {
    inputs: [
      { name: 'density', type: 'scalar-field', direction: 'input', required: true },
      { name: 'surface', type: 'surface', direction: 'input' },
    ],
    outputs: [{ name: 'mask', type: 'scalar-field', direction: 'output' }],
  },
  scatter: {
    inputs: [
      { name: 'mask', type: 'scalar-field', direction: 'input', required: true },
      { name: 'mesh', type: 'asset', direction: 'input' },
    ],
    outputs: [{ name: 'points', type: 'point-set', direction: 'output' }],
  },
  snap_to_terrain: {
    inputs: [
      { name: 'points', type: 'point-set', direction: 'input', required: true },
      { name: 'surface', type: 'surface', direction: 'input' },
    ],
    outputs: [{ name: 'instances', type: 'point-set', direction: 'output' }],
  },
  output: {
    inputs: [{ name: 'instances', type: 'point-set', direction: 'input', required: true }],
    outputs: [],
  },
  custom: {
    inputs: [{ name: 'input', type: 'point-set', direction: 'input' }],
    outputs: [{ name: 'output', type: 'point-set', direction: 'output' }],
  },
};

const UNREAL_NODE_CLASSES: Record<PCGGraphNodeKind, string> = {
  surface: '/Script/PCG.PCGSurfaceSampler',
  density_filter: '/Script/PCG.PCGDensityFilter',
  slope_mask: '/Script/PCG.PCGSlopeFilter',
  scatter: '/Script/PCG.PCGStaticMeshSpawner',
  snap_to_terrain: '/Script/PCG.PCGProjection',
  output: '/Script/PCG.PCGOutput',
  custom: '/Script/PCG.PCGBlueprintElement',
};

function clonePorts(ports: PCGGraphPort[]): PCGGraphPort[] {
  return ports.map((port) => ({ ...port }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function holoValueToUnknown(value: HoloValue | undefined): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => holoValueToUnknown(entry));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, holoValueToUnknown(entry as HoloValue)])
    );
  }

  return value;
}

function normalizeProperties(block: HoloDomainBlock): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(block.properties ?? {}).map(([key, value]) => [key, holoValueToUnknown(value)])
  );
}

function coerceNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function coerceString(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  return fallback;
}

function coerceBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
  }

  return false;
}

function safeId(input: unknown, fallback: string): string {
  const raw = typeof input === 'string' && input.trim() ? input : fallback;
  const id = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return id || fallback;
}

function normalizeKind(value: unknown): PCGGraphNodeKind {
  const normalized =
    typeof value === 'string'
      ? value
          .trim()
          .toLowerCase()
          .replace(/[-\s]+/g, '_')
      : '';

  switch (normalized) {
    case 'surface':
    case 'terrain':
    case 'terrain_surface':
      return 'surface';
    case 'density':
    case 'density_filter':
      return 'density_filter';
    case 'slope':
    case 'slope_mask':
      return 'slope_mask';
    case 'scatter':
    case 'mesh_scatter':
      return 'scatter';
    case 'snap':
    case 'snap_to_terrain':
    case 'project_to_terrain':
      return 'snap_to_terrain';
    case 'output':
    case 'instances':
      return 'output';
    default:
      return 'custom';
  }
}

function hasGpuHint(block: HoloDomainBlock, props: Record<string, unknown>): boolean {
  return (
    coerceBoolean(props.gpu) ||
    coerceBoolean(props.gpu_eval) ||
    coerceBoolean(props.gpu_evaluation) ||
    (block.traits ?? []).some((trait) => trait.toLowerCase().includes('gpu'))
  );
}

function getBlockSeed(
  blocks: HoloDomainBlock[],
  options: PCGGraphCompileOptions
): number | undefined {
  if (typeof options.seed === 'number' && Number.isFinite(options.seed)) {
    return options.seed;
  }

  for (const block of blocks) {
    const props = normalizeProperties(block);
    const seed = props.seed;
    if (typeof seed === 'number' && Number.isFinite(seed)) {
      return seed;
    }

    if (typeof seed === 'string') {
      const parsed = Number(seed);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

function makeNode(
  id: string,
  kind: PCGGraphNodeKind,
  label: string,
  properties: Record<string, unknown>,
  gpu: boolean
): PCGGraphNode {
  const ports = NODE_PORTS[kind] ?? NODE_PORTS.custom;
  return {
    id,
    kind,
    label,
    inputs: clonePorts(ports.inputs),
    outputs: clonePorts(ports.outputs),
    properties,
    gpu,
  };
}

function firstOutputOfType(node: PCGGraphNode, type: PCGPortType): PCGGraphPort | undefined {
  return node.outputs.find((port) => port.type === type) ?? node.outputs[0];
}

function firstInputOfType(node: PCGGraphNode, type: PCGPortType): PCGGraphPort | undefined {
  return node.inputs.find((port) => port.type === type) ?? node.inputs[0];
}

function connect(
  nodes: PCGGraphNode[],
  fromId: string,
  toId: string,
  preferredType?: PCGPortType
): PCGGraphEdge | undefined {
  const from = nodes.find((node) => node.id === fromId);
  const to = nodes.find((node) => node.id === toId);
  if (!from || !to || from.outputs.length === 0 || to.inputs.length === 0) {
    return undefined;
  }

  const output =
    preferredType !== undefined
      ? firstOutputOfType(from, preferredType)
      : from.outputs.find((port) => to.inputs.some((input) => input.type === port.type));
  const input =
    output !== undefined
      ? firstInputOfType(to, output.type)
      : preferredType !== undefined
        ? firstInputOfType(to, preferredType)
        : to.inputs[0];

  if (!output || !input) {
    return undefined;
  }

  return {
    from: { node: from.id, port: output.name },
    to: { node: to.id, port: input.name },
    type: output.type,
  };
}

function buildExplicitNodes(
  block: HoloDomainBlock,
  props: Record<string, unknown>,
  blockIndex: number
): { nodes: PCGGraphNode[]; edges: PCGGraphEdge[] } | undefined {
  const rawNodes = props.nodes;
  if (!Array.isArray(rawNodes) || rawNodes.length === 0) {
    return undefined;
  }

  const gpu = hasGpuHint(block, props);
  const prefix = safeId(block.name ?? block.keyword, `pcg_${blockIndex + 1}`);
  const operators = rawNodes.filter(isRecord).map((rawNode, nodeIndex) => {
    const spec = rawNode as ExplicitNodeSpec;
    const kind = normalizeKind(spec.kind ?? spec.type);
    const id = safeId(spec.id, `${prefix}_${kind}_${nodeIndex + 1}`);
    const label = coerceString(spec.label, `${kind} ${nodeIndex + 1}`);
    const nodeProps = isRecord(spec.properties) ? (spec.properties as Record<string, unknown>) : {};
    return makeNode(id, kind, label, nodeProps, gpu || coerceBoolean(spec.gpu));
  });

  if (operators.length === 0) {
    return undefined;
  }

  const nodes = [
    makeNode(
      `${prefix}_surface`,
      'surface',
      'Terrain Surface',
      { terrain: coerceString(props.terrain, 'Landscape') },
      gpu
    ),
    ...operators,
  ];

  const edges: PCGGraphEdge[] = [];
  const first = operators[0];
  const surfaceEdge = connect(nodes, `${prefix}_surface`, first.id, 'surface');
  if (surfaceEdge) {
    edges.push(surfaceEdge);
  }

  for (let index = 0; index < operators.length - 1; index += 1) {
    const edge = connect(nodes, operators[index].id, operators[index + 1].id);
    if (edge) {
      edges.push(edge);
    }
  }

  return { nodes, edges };
}

function buildScatterChain(
  block: HoloDomainBlock,
  props: Record<string, unknown>,
  blockIndex: number
): {
  nodes: PCGGraphNode[];
  edges: PCGGraphEdge[];
} {
  const prefix = safeId(block.name ?? block.keyword, `scatter_${blockIndex + 1}`);
  const gpu = hasGpuHint(block, props);
  const density = coerceNumber(props.density, 1);
  const terrain = coerceString(props.terrain ?? props.terrain_ref, 'Landscape');

  const nodes = [
    makeNode(
      `${prefix}_surface`,
      'surface',
      'Terrain Surface',
      { terrain, bounds: props.bounds ?? 'composition' },
      gpu
    ),
    makeNode(
      `${prefix}_density_filter`,
      'density_filter',
      'Density Filter',
      {
        density,
        min_density: coerceNumber(props.min_density ?? props.density_min, 0),
        max_density: coerceNumber(props.max_density ?? props.density_max, density),
      },
      gpu
    ),
    makeNode(
      `${prefix}_slope_mask`,
      'slope_mask',
      'Slope Mask',
      {
        min_slope: coerceNumber(props.min_slope, 0),
        max_slope: coerceNumber(props.max_slope ?? props.slope, 45),
      },
      gpu
    ),
    makeNode(
      `${prefix}_scatter`,
      'scatter',
      'Scatter Mesh',
      {
        source_mesh: coerceString(
          props.source_mesh ?? props.mesh ?? props.source,
          'StaticMesh/DefaultFoliage'
        ),
        count: coerceNumber(props.count, Math.max(1, Math.round(density * 1000))),
        scale_range: props.scale_range ?? [1, 1],
        seed: props.seed,
      },
      gpu
    ),
    makeNode(
      `${prefix}_snap_to_terrain`,
      'snap_to_terrain',
      'Snap To Terrain',
      {
        terrain,
        snap_mode: 'project_to_surface',
      },
      gpu
    ),
    makeNode(`${prefix}_output`, 'output', 'PCG Instances', { output_attribute: 'instances' }, gpu),
  ];

  const edgeSpecs: Array<[string, string, PCGPortType]> = [
    [`${prefix}_surface`, `${prefix}_density_filter`, 'surface'],
    [`${prefix}_density_filter`, `${prefix}_slope_mask`, 'scalar-field'],
    [`${prefix}_slope_mask`, `${prefix}_scatter`, 'scalar-field'],
    [`${prefix}_scatter`, `${prefix}_snap_to_terrain`, 'point-set'],
    [`${prefix}_snap_to_terrain`, `${prefix}_output`, 'point-set'],
  ];

  return {
    nodes,
    edges: edgeSpecs
      .map(([from, to, type]) => connect(nodes, from, to, type))
      .filter((edge): edge is PCGGraphEdge => edge !== undefined),
  };
}

function sourceBlockName(block: HoloDomainBlock): string {
  return [block.domain, block.keyword, block.name].filter(Boolean).join(':');
}

export function compilePCGGraphFromBlocks(
  blocks: HoloDomainBlock[],
  options: PCGGraphCompileOptions = {}
): { graph: PCGGraphIR; diagnostics: string[] } {
  const proceduralBlocks = blocks.filter(
    (block) => block.domain === 'procedural' || block.keyword === 'pcg_graph'
  );
  const diagnostics: string[] = [];
  const seed = getBlockSeed(proceduralBlocks, options);
  const gpuEnabled =
    options.gpuEvaluation === true ||
    proceduralBlocks.some((block) => hasGpuHint(block, normalizeProperties(block)));
  const graphName =
    options.name ??
    (proceduralBlocks[0]?.name ? `${proceduralBlocks[0].name}PCG` : 'HoloScriptPCGGraph');

  const nodes: PCGGraphNode[] = [];
  const edges: PCGGraphEdge[] = [];

  proceduralBlocks.forEach((block, blockIndex) => {
    const props = normalizeProperties(block);
    const explicitGraph = buildExplicitNodes(block, props, blockIndex);
    const fragment = explicitGraph ?? buildScatterChain(block, props, blockIndex);

    nodes.push(...fragment.nodes);
    edges.push(...fragment.edges);

    if (explicitGraph) {
      diagnostics.push(`Compiled ${sourceBlockName(block)} as explicit PCG operator graph.`);
    } else {
      diagnostics.push(
        `Expanded ${sourceBlockName(block)} into density_filter -> slope_mask -> scatter -> snap_to_terrain.`
      );
    }
  });

  if (proceduralBlocks.length === 0) {
    diagnostics.push('No procedural domain blocks were found; emitted an empty PCG graph.');
  }

  const graph: PCGGraphIR = {
    schema: PCG_GRAPH_SCHEMA,
    name: graphName,
    seed,
    nodes,
    edges,
    gpuEvaluation: {
      enabled: gpuEnabled,
      dispatchHint: gpuEnabled
        ? 'webgpu-compatible spatial-operator kernel with deterministic scatter seed'
        : 'cpu-reference spatial-operator evaluation',
      deterministicSeed: seed,
    },
    metadata: {
      sourceBlocks: proceduralBlocks.map(sourceBlockName),
      target: 'unreal-pcg-xml',
    },
  };

  return { graph, diagnostics };
}

function xmlEscape(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function emitPorts(kind: 'Input' | 'Output', ports: PCGGraphPort[]): string[] {
  return ports.map(
    (port) =>
      `      <${kind} name="${xmlEscape(port.name)}" type="${xmlEscape(port.type)}" required="${port.required === true ? 'true' : 'false'}" />`
  );
}

export function pcgGraphToUnrealXml(graph: PCGGraphIR): string {
  const lines = [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<HoloScriptPCGGraph version="1" schema="${PCG_GRAPH_SCHEMA}" target="UnrealPCG" name="${xmlEscape(graph.name)}">`,
    `  <GPUEvaluation enabled="${graph.gpuEvaluation.enabled ? 'true' : 'false'}" dispatchHint="${xmlEscape(graph.gpuEvaluation.dispatchHint)}"${graph.gpuEvaluation.deterministicSeed !== undefined ? ` deterministicSeed="${xmlEscape(graph.gpuEvaluation.deterministicSeed)}"` : ''} />`,
    '  <Nodes>',
  ];

  for (const node of graph.nodes) {
    lines.push(
      `    <Node id="${xmlEscape(node.id)}" type="${xmlEscape(node.kind)}" class="${xmlEscape(UNREAL_NODE_CLASSES[node.kind])}" label="${xmlEscape(node.label)}" gpu="${node.gpu === true ? 'true' : 'false'}">`
    );
    lines.push(...emitPorts('Input', node.inputs));
    lines.push(...emitPorts('Output', node.outputs));

    for (const [name, value] of Object.entries(node.properties)) {
      if (value !== undefined) {
        lines.push(`      <Property name="${xmlEscape(name)}" value="${xmlEscape(value)}" />`);
      }
    }

    lines.push('    </Node>');
  }

  lines.push('  </Nodes>', '  <Edges>');

  for (const edge of graph.edges) {
    lines.push(
      `    <Edge fromNode="${xmlEscape(edge.from.node)}" fromPort="${xmlEscape(edge.from.port)}" toNode="${xmlEscape(edge.to.node)}" toPort="${xmlEscape(edge.to.port)}" type="${xmlEscape(edge.type)}" />`
    );
  }

  lines.push('  </Edges>', '</HoloScriptPCGGraph>');
  return lines.join('\n');
}

function gpuPlanForGraph(graph: PCGGraphIR): string {
  const operators = graph.nodes
    .filter((node) => node.kind !== 'surface' && node.kind !== 'output')
    .map((node) => `${node.id}:${node.kind}`)
    .join(' -> ');

  return [
    `# ${graph.name} GPU Evaluation Plan`,
    '',
    `- Enabled: ${graph.gpuEvaluation.enabled ? 'yes' : 'no'}`,
    `- Dispatch hint: ${graph.gpuEvaluation.dispatchHint}`,
    `- Deterministic seed: ${graph.gpuEvaluation.deterministicSeed ?? 'unset'}`,
    `- Operator chain: ${operators || 'empty graph'}`,
  ].join('\n');
}

export class PCGGraphCompiler extends CompilerBase {
  protected readonly compilerName = 'PCGGraphCompiler';
  private readonly pcgOptions: PCGGraphCompileOptions;

  constructor(options: PCGGraphCompileOptions = {}) {
    super();
    this.pcgOptions = options;
  }

  protected getRequiredCapability(): ANSCapabilityPathValue {
    return '/compile/pcg-graph' as ANSCapabilityPathValue;
  }

  compileDetailed(
    composition: HoloComposition,
    options: PCGGraphCompileOptions = {}
  ): PCGGraphCompileResult {
    const mergedOptions = { ...this.pcgOptions, ...options };
    const { graph, diagnostics } = compilePCGGraphFromBlocks(composition.domainBlocks ?? [], {
      name: mergedOptions.name ?? `${composition.name ?? 'HoloScript'}PCG`,
      gpuEvaluation: mergedOptions.gpuEvaluation,
      seed: mergedOptions.seed,
    });

    return {
      graph,
      unrealXml: pcgGraphToUnrealXml(graph),
      gpuEvalPlan: gpuPlanForGraph(graph),
      diagnostics,
    };
  }

  compile(composition: HoloComposition, agentToken: string = '', outputPath?: string): string {
    this.validateCompilerAccess(agentToken, outputPath);
    const result = this.compileDetailed(composition);

    return [
      `<!-- HoloScript PCG graph export: ${result.graph.nodes.length} nodes, ${result.graph.edges.length} edges -->`,
      `<!-- GPU evaluation: ${result.graph.gpuEvaluation.enabled ? 'enabled' : 'disabled'} -->`,
      result.unrealXml,
    ].join('\n');
  }

  compileToFiles(
    composition: HoloComposition,
    agentToken: string = createTestCompilerToken()
  ): Record<string, string> {
    this.validateCompilerAccess(agentToken);
    const result = this.compileDetailed(composition);
    const base = safeId(result.graph.name, 'holoscript_pcg_graph');

    return {
      [`pcg/${base}.pcg.xml`]: result.unrealXml,
      [`pcg/${base}.gpu-plan.md`]: result.gpuEvalPlan,
      [`pcg/${base}.graph.json`]: JSON.stringify(result.graph, null, 2),
    };
  }
}

export function compileToPCGGraph(
  composition: HoloComposition,
  options: PCGGraphCompileOptions = {}
): PCGGraphCompileResult {
  return new PCGGraphCompiler(options).compileDetailed(composition, options);
}
