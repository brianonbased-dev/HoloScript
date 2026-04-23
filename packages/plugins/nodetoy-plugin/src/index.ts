/**
 * @holoscript/nodetoy-plugin — NodeToy shader-graph bridge stub.
 *
 * Research: ai-ecosystem/research/2026-04-24_nodetoy-nodes-holoscript-shader-trait-map.md
 * Universal-IR matrix: docs/universal-ir-coverage.md (shader-graph column)
 *
 * Status: STUB. Full node-graph traversal + WGSL/GLSL compile path is
 * future work; current scope maps the top-level node family to @shader
 * trait declarations.
 */

export interface NodeToyNode {
  id: string;
  family: 'pbr' | 'noise' | 'texture' | 'math' | 'output' | 'input';
  inputs?: Record<string, string>; // ref to other node.id
  params?: Record<string, number | number[] | string>;
}

export interface NodeToyGraph {
  name: string;
  nodes: NodeToyNode[];
  output_node_id: string;
}

export interface HoloShaderEmission {
  trait: { kind: '@shader'; target_id: string; params: Record<string, unknown> };
  node_count: number;
  by_family: Record<string, number>;
  validation_errors: string[];
}

export function mapNodeToyToShader(g: NodeToyGraph): HoloShaderEmission {
  const by_family: Record<string, number> = {};
  for (const n of g.nodes) {
    by_family[n.family] = (by_family[n.family] ?? 0) + 1;
  }
  const validation_errors: string[] = [];
  const ids = new Set(g.nodes.map((n) => n.id));
  if (!ids.has(g.output_node_id)) {
    validation_errors.push(`output_node_id '${g.output_node_id}' not in graph`);
  }
  for (const n of g.nodes) {
    for (const [port, ref] of Object.entries(n.inputs ?? {})) {
      if (!ids.has(ref)) {
        validation_errors.push(`node '${n.id}' input '${port}' refs missing node '${ref}'`);
      }
    }
  }
  return {
    trait: {
      kind: '@shader',
      target_id: g.name,
      params: { output: g.output_node_id, family_mix: by_family },
    },
    node_count: g.nodes.length,
    by_family,
    validation_errors,
  };
}
