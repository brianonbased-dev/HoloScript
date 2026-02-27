/**
 * Shader Templates
 *
 * Pre-built node graph templates for common shader patterns.
 * Templates can be instantiated to quickly create complex effects.
 *
 * Categories:
 * - Lighting (Fresnel, Normal Mapping, etc.)
 * - Texturing (Triplanar, Parallax Occlusion)
 * - Animation (Vertex displacement, Waves)
 * - VFX (Dissolve, Holographic scan lines)
 */

import { ShaderGraph } from '@/lib/shaderGraph';
import type { ISerializedShaderGraph } from '@/lib/shaderGraph';

// ============================================================================
// Types
// ============================================================================

/**
 * Template category
 */
export type TemplateCategory = 'lighting' | 'texturing' | 'animation' | 'vfx' | 'utility';

/**
 * Shader template
 */
export interface ShaderTemplate {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  complexity: 'simple' | 'medium' | 'advanced';
  nodeCount: number;
  thumbnail?: string;
  graph: ISerializedShaderGraph;
}

// ============================================================================
// Template Library
// ============================================================================

export class ShaderTemplateLibrary {
  private templates: Map<string, ShaderTemplate> = new Map();

  constructor() {
    this.loadTemplates();
  }

  /**
   * Load all built-in templates
   */
  private loadTemplates(): void {
    const templates = [
      this.createFresnelRimLight(),
      this.createNormalMapping(),
      this.createParallaxOcclusion(),
      this.createTriplanarProjection(),
      this.createVertexWind(),
      this.createWaterWaves(),
      this.createDissolveEffect(),
      this.createHolographicScanLines(),
      this.createProceduralMarble(),
      this.createCaustics(),
      this.createScreenSpaceReflection(),
      this.createVolumetricFog(),
    ];

    for (const template of templates) {
      this.templates.set(template.id, template);
    }
  }

  /**
   * Get all templates
   */
  getAllTemplates(category?: TemplateCategory): ShaderTemplate[] {
    const all = Array.from(this.templates.values());
    return category ? all.filter((t) => t.category === category) : all;
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): ShaderTemplate | null {
    return this.templates.get(id) ?? null;
  }

  /**
   * Instantiate template as a shader graph
   */
  instantiate(templateId: string): ShaderGraph | null {
    const template = this.templates.get(templateId);
    if (!template) return null;

    const graph = ShaderGraph.fromJSON(template.graph);
    // Generate new IDs to avoid conflicts
    graph.id = `graph_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return graph;
  }

  /**
   * Search templates
   */
  search(query: string): ShaderTemplate[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.templates.values()).filter((t) => {
      const nameMatch = t.name.toLowerCase().includes(lowerQuery);
      const descMatch = t.description.toLowerCase().includes(lowerQuery);
      const tagMatch = t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery));
      return nameMatch || descMatch || tagMatch;
    });
  }

  // ============================================================================
  // Template Definitions
  // ============================================================================

  private createFresnelRimLight(): ShaderTemplate {
    const graph = new ShaderGraph('Fresnel Rim Light');
    graph.description = 'Rim lighting effect using fresnel';

    // Input nodes
    const normalNode = graph.createNode('input_normal', { x: 0, y: 0 });
    const viewDirNode = graph.createNode('input_view_direction', { x: 0, y: 100 });

    // Fresnel calculation
    const fresnelNode = graph.createNode('utility_fresnel', { x: 300, y: 50 });
    graph.setNodeProperty(fresnelNode!.id, 'power', 3);

    // Rim color
    const rimColorNode = graph.createNode('constant_vec3', { x: 300, y: 200 });
    graph.setNodeProperty(rimColorNode!.id, 'x', 1.0);
    graph.setNodeProperty(rimColorNode!.id, 'y', 0.8);
    graph.setNodeProperty(rimColorNode!.id, 'z', 0.5);

    // Intensity control
    const intensityNode = graph.createNode('constant_float', { x: 300, y: 300 });
    graph.setNodeProperty(intensityNode!.id, 'value', 2.0);

    // Multiply fresnel * color * intensity
    const mul1 = graph.createNode('math_multiply', { x: 600, y: 100 });
    const mul2 = graph.createNode('math_multiply', { x: 800, y: 150 });

    // Output
    const outputNode = graph.createNode('output_surface', { x: 1000, y: 150 });

    // Connect
    if (normalNode && fresnelNode) graph.connect(normalNode.id, 'normal', fresnelNode.id, 'normal');
    if (viewDirNode && fresnelNode) graph.connect(viewDirNode.id, 'direction', fresnelNode.id, 'viewDir');

    return {
      id: 'fresnel_rim_light',
      name: 'Fresnel Rim Light',
      description: 'Edge glow effect perfect for highlighting silhouettes',
      category: 'lighting',
      tags: ['fresnel', 'rim-light', 'glow', 'edge-detection'],
      complexity: 'simple',
      nodeCount: graph.nodes.size,
      graph: graph.toJSON(),
    };
  }

  private createNormalMapping(): ShaderTemplate {
    const graph = new ShaderGraph('Normal Mapping');
    graph.description = 'Tangent-space normal mapping for surface detail';

    // UV input
    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });

    // Normal texture sample (placeholder - would use actual texture node)
    const normalTexNode = graph.createNode('texture_sample', { x: 300, y: 0 });

    // Convert from [0,1] to [-1,1]
    const offsetNode = graph.createNode('constant_vec3', { x: 300, y: 150 });
    graph.setNodeProperty(offsetNode!.id, 'x', -0.5);
    graph.setNodeProperty(offsetNode!.id, 'y', -0.5);
    graph.setNodeProperty(offsetNode!.id, 'z', -0.5);

    const scaleNode = graph.createNode('constant_float', { x: 300, y: 250 });
    graph.setNodeProperty(scaleNode!.id, 'value', 2.0);

    // Output
    const outputNode = graph.createNode('output_surface', { x: 800, y: 100 });

    if (uvNode && normalTexNode) graph.connect(uvNode.id, 'uv', normalTexNode.id, 'uv');

    return {
      id: 'normal_mapping',
      name: 'Normal Mapping',
      description: 'Add surface detail using normal maps',
      category: 'texturing',
      tags: ['normal-map', 'detail', 'bump'],
      complexity: 'medium',
      nodeCount: graph.nodes.size,
      graph: graph.toJSON(),
    };
  }

  private createParallaxOcclusion(): ShaderTemplate {
    const graph = new ShaderGraph('Parallax Occlusion Mapping');
    graph.description = 'Depth illusion using parallax occlusion mapping';

    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });
    const viewDirNode = graph.createNode('input_view_direction', { x: 0, y: 100 });
    const heightScaleNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const layersNode = graph.createNode('constant_float', { x: 0, y: 300 });

    graph.setNodeProperty(heightScaleNode!.id, 'value', 0.05);
    graph.setNodeProperty(layersNode!.id, 'value', 32);

    const pomNode = graph.createNode('parallax_occlusion', { x: 400, y: 100 });

    const outputNode = graph.createNode('output_surface', { x: 700, y: 100 });

    if (uvNode && pomNode) graph.connect(uvNode.id, 'uv', pomNode.id, 'uv');
    if (viewDirNode && pomNode) graph.connect(viewDirNode.id, 'direction', pomNode.id, 'viewDir');
    if (heightScaleNode && pomNode) graph.connect(heightScaleNode.id, 'value', pomNode.id, 'heightScale');
    if (layersNode && pomNode) graph.connect(layersNode.id, 'value', pomNode.id, 'numLayers');

    return {
      id: 'parallax_occlusion',
      name: 'Parallax Occlusion Mapping',
      description: 'Steep parallax for realistic depth without extra geometry',
      category: 'texturing',
      tags: ['parallax', 'depth', 'displacement', 'advanced'],
      complexity: 'advanced',
      nodeCount: graph.nodes.size,
      graph: graph.toJSON(),
    };
  }

  private createTriplanarProjection(): ShaderTemplate {
    const graph = new ShaderGraph('Triplanar Projection');
    graph.description = 'World-space triplanar texture projection';

    const posNode = graph.createNode('input_position', { x: 0, y: 0 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 100 });

    // Scale
    const scaleNode = graph.createNode('constant_float', { x: 0, y: 200 });
    graph.setNodeProperty(scaleNode!.id, 'value', 1.0);

    // Would implement full triplanar projection with blending
    const outputNode = graph.createNode('output_surface', { x: 800, y: 100 });

    return {
      id: 'triplanar_projection',
      name: 'Triplanar Projection',
      description: 'Seamless texture projection without UVs',
      category: 'texturing',
      tags: ['triplanar', 'world-space', 'procedural'],
      complexity: 'medium',
      nodeCount: graph.nodes.size,
      graph: graph.toJSON(),
    };
  }

  private createVertexWind(): ShaderTemplate {
    const graph = new ShaderGraph('Vertex Wind Animation');
    graph.description = 'Procedural wind animation for foliage';

    const posNode = graph.createNode('input_position', { x: 0, y: 0 });
    const timeNode = graph.createNode('input_time', { x: 0, y: 100 });

    // Wind parameters
    const windStrengthNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const windSpeedNode = graph.createNode('constant_float', { x: 0, y: 300 });
    const windFreqNode = graph.createNode('constant_float', { x: 0, y: 400 });

    graph.setNodeProperty(windStrengthNode!.id, 'value', 0.5);
    graph.setNodeProperty(windSpeedNode!.id, 'value', 1.0);
    graph.setNodeProperty(windFreqNode!.id, 'value', 2.0);

    // Sine wave
    const mulNode = graph.createNode('math_multiply', { x: 300, y: 150 });
    const addNode = graph.createNode('math_add', { x: 500, y: 150 });
    const sinNode = graph.createNode('trig_sin', { x: 700, y: 150 });

    // Offset vector
    const offsetNode = graph.createNode('vector_make_vec3', { x: 900, y: 200 });

    // Output
    const outputNode = graph.createNode('output_vertex_offset', { x: 1100, y: 200 });

    // Connect
    if (timeNode && mulNode) graph.connect(timeNode.id, 'time', mulNode.id, 'a');
    if (windSpeedNode && mulNode) graph.connect(windSpeedNode.id, 'value', mulNode.id, 'b');
    if (posNode && addNode) {
      // Extract x position for frequency variation
    }
    if (mulNode && sinNode) graph.connect(mulNode.id, 'result', sinNode.id, 'angle');

    return {
      id: 'vertex_wind',
      name: 'Vertex Wind Animation',
      description: 'Procedural wind sway for vegetation',
      category: 'animation',
      tags: ['wind', 'vertex-animation', 'foliage', 'procedural'],
      complexity: 'medium',
      nodeCount: graph.nodes.size,
      graph: graph.toJSON(),
    };
  }

  private createWaterWaves(): ShaderTemplate {
    const graph = new ShaderGraph('Water Waves');
    graph.description = 'Gerstner wave animation for water surfaces';

    const posNode = graph.createNode('input_position', { x: 0, y: 0 });
    const timeNode = graph.createNode('input_time', { x: 0, y: 100 });
    const scaleNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const speedNode = graph.createNode('constant_float', { x: 0, y: 300 });
    const depthNode = graph.createNode('constant_float', { x: 0, y: 400 });
    const foamNode = graph.createNode('constant_float', { x: 0, y: 500 });

    graph.setNodeProperty(scaleNode!.id, 'value', 1.0);
    graph.setNodeProperty(speedNode!.id, 'value', 1.0);
    graph.setNodeProperty(depthNode!.id, 'value', 5.0);
    graph.setNodeProperty(foamNode!.id, 'value', 0.7);

    const waterNode = graph.createNode('water_surface', { x: 400, y: 200 });
    const outputNode = graph.createNode('output_vertex_offset', { x: 700, y: 200 });

    if (posNode && waterNode) graph.connect(posNode.id, 'position', waterNode.id, 'position');
    if (timeNode && waterNode) graph.connect(timeNode.id, 'time', waterNode.id, 'time');
    if (scaleNode && waterNode) graph.connect(scaleNode.id, 'value', waterNode.id, 'waveScale');
    if (speedNode && waterNode) graph.connect(speedNode.id, 'value', waterNode.id, 'waveSpeed');
    if (waterNode && outputNode) graph.connect(waterNode.id, 'displacement', outputNode.id, 'offset');

    return {
      id: 'water_waves',
      name: 'Water Waves',
      description: 'Realistic Gerstner wave displacement',
      category: 'animation',
      tags: ['water', 'waves', 'gerstner', 'displacement'],
      complexity: 'medium',
      nodeCount: graph.nodes.size,
      graph: graph.toJSON(),
    };
  }

  private createDissolveEffect(): ShaderTemplate {
    const graph = new ShaderGraph('Dissolve Effect');
    graph.description = 'Noise-based dissolve with edge glow';

    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });
    const noiseNode = graph.createNode('utility_gradient_noise', { x: 200, y: 0 });

    // Dissolve progress
    const progressNode = graph.createNode('constant_float', { x: 0, y: 150 });
    graph.setNodeProperty(progressNode!.id, 'value', 0.5);

    // Threshold
    const stepNode = graph.createNode('math_step', { x: 400, y: 50 });

    // Edge detection
    const edgeThreshNode = graph.createNode('constant_float', { x: 400, y: 200 });
    graph.setNodeProperty(edgeThreshNode!.id, 'value', 0.1);

    const subtractNode = graph.createNode('math_subtract', { x: 600, y: 150 });
    const edgeStepNode = graph.createNode('math_step', { x: 800, y: 150 });

    // Edge color (glow)
    const edgeColorNode = graph.createNode('constant_vec3', { x: 600, y: 300 });
    graph.setNodeProperty(edgeColorNode!.id, 'x', 1.0);
    graph.setNodeProperty(edgeColorNode!.id, 'y', 0.5);
    graph.setNodeProperty(edgeColorNode!.id, 'z', 0.0);

    const outputNode = graph.createNode('output_surface', { x: 1000, y: 200 });

    // Connect
    if (uvNode && noiseNode) graph.connect(uvNode.id, 'uv', noiseNode.id, 'uv');
    if (progressNode && stepNode) graph.connect(progressNode.id, 'value', stepNode.id, 'edge');
    if (noiseNode && stepNode) graph.connect(noiseNode.id, 'noise', stepNode.id, 'x');
    if (stepNode && outputNode) graph.connect(stepNode.id, 'result', outputNode.id, 'alpha');
    if (edgeColorNode && outputNode) graph.connect(edgeColorNode.id, 'value', outputNode.id, 'emission');

    return {
      id: 'dissolve_effect',
      name: 'Dissolve Effect',
      description: 'Animated dissolve with edge glow',
      category: 'vfx',
      tags: ['dissolve', 'fade', 'vfx', 'animated'],
      complexity: 'medium',
      nodeCount: graph.nodes.size,
      graph: graph.toJSON(),
    };
  }

  private createHolographicScanLines(): ShaderTemplate {
    const graph = new ShaderGraph('Holographic Scan Lines');
    graph.description = 'Sci-fi hologram with animated scan lines';

    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });
    const timeNode = graph.createNode('input_time', { x: 0, y: 100 });

    // Extract Y coordinate
    const splitNode = graph.createNode('vector_split_vec2', { x: 200, y: 0 });

    // Scan line frequency
    const freqNode = graph.createNode('constant_float', { x: 200, y: 150 });
    graph.setNodeProperty(freqNode!.id, 'value', 20);

    // Multiply Y * freq + time
    const mulNode = graph.createNode('math_multiply', { x: 400, y: 50 });
    const addNode = graph.createNode('math_add', { x: 600, y: 50 });
    const sinNode = graph.createNode('trig_sin', { x: 800, y: 50 });

    // Scan line intensity
    const intensityNode = graph.createNode('constant_float', { x: 800, y: 200 });
    graph.setNodeProperty(intensityNode!.id, 'value', 0.3);

    const finalMulNode = graph.createNode('math_multiply', { x: 1000, y: 100 });

    // Fresnel for edge glow
    const normalNode = graph.createNode('input_normal', { x: 0, y: 300 });
    const viewDirNode = graph.createNode('input_view_direction', { x: 0, y: 400 });
    const fresnelNode = graph.createNode('utility_fresnel', { x: 300, y: 350 });
    graph.setNodeProperty(fresnelNode!.id, 'power', 2);

    // Hologram color
    const colorNode = graph.createNode('constant_vec3', { x: 1000, y: 300 });
    graph.setNodeProperty(colorNode!.id, 'x', 0.2);
    graph.setNodeProperty(colorNode!.id, 'y', 0.8);
    graph.setNodeProperty(colorNode!.id, 'z', 1.0);

    const outputNode = graph.createNode('output_surface', { x: 1200, y: 200 });

    // Connect
    if (uvNode && splitNode) graph.connect(uvNode.id, 'uv', splitNode.id, 'vector');
    if (splitNode && mulNode) graph.connect(splitNode.id, 'y', mulNode.id, 'a');
    if (freqNode && mulNode) graph.connect(freqNode.id, 'value', mulNode.id, 'b');
    if (mulNode && addNode) graph.connect(mulNode.id, 'result', addNode.id, 'a');
    if (timeNode && addNode) graph.connect(timeNode.id, 'time', addNode.id, 'b');
    if (addNode && sinNode) graph.connect(addNode.id, 'result', sinNode.id, 'angle');
    if (sinNode && finalMulNode) graph.connect(sinNode.id, 'result', finalMulNode.id, 'a');
    if (intensityNode && finalMulNode) graph.connect(intensityNode.id, 'value', finalMulNode.id, 'b');

    if (normalNode && fresnelNode) graph.connect(normalNode.id, 'normal', fresnelNode.id, 'normal');
    if (viewDirNode && fresnelNode) graph.connect(viewDirNode.id, 'direction', fresnelNode.id, 'viewDir');

    if (colorNode && outputNode) graph.connect(colorNode.id, 'value', outputNode.id, 'emission');
    if (fresnelNode && outputNode) graph.connect(fresnelNode.id, 'result', outputNode.id, 'alpha');

    return {
      id: 'holographic_scan_lines',
      name: 'Holographic Scan Lines',
      description: 'Animated scan lines for hologram effects',
      category: 'vfx',
      tags: ['hologram', 'sci-fi', 'scan-lines', 'animated'],
      complexity: 'medium',
      nodeCount: graph.nodes.size,
      graph: graph.toJSON(),
    };
  }

  private createProceduralMarble(): ShaderTemplate {
    const graph = new ShaderGraph('Procedural Marble');
    graph.description = 'Marble pattern using layered noise';

    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });

    // Scale UV
    const scaleNode = graph.createNode('constant_vec2', { x: 0, y: 100 });
    graph.setNodeProperty(scaleNode!.id, 'x', 3.0);
    graph.setNodeProperty(scaleNode!.id, 'y', 3.0);

    const mulNode = graph.createNode('vector_make_vec2', { x: 200, y: 50 });

    // Multi-octave noise
    const noise1Node = graph.createNode('utility_gradient_noise', { x: 400, y: 0 });
    const noise2Node = graph.createNode('utility_gradient_noise', { x: 400, y: 100 });
    const noise3Node = graph.createNode('utility_gradient_noise', { x: 400, y: 200 });

    // Combine noise layers
    const addNode = graph.createNode('math_add', { x: 600, y: 50 });
    const add2Node = graph.createNode('math_add', { x: 800, y: 100 });

    // Color A (light marble)
    const colorANode = graph.createNode('constant_vec3', { x: 800, y: 250 });
    graph.setNodeProperty(colorANode!.id, 'x', 0.95);
    graph.setNodeProperty(colorANode!.id, 'y', 0.95);
    graph.setNodeProperty(colorANode!.id, 'z', 0.95);

    // Color B (dark veins)
    const colorBNode = graph.createNode('constant_vec3', { x: 800, y: 350 });
    graph.setNodeProperty(colorBNode!.id, 'x', 0.4);
    graph.setNodeProperty(colorBNode!.id, 'y', 0.4);
    graph.setNodeProperty(colorBNode!.id, 'z', 0.45);

    const outputNode = graph.createNode('output_surface', { x: 1100, y: 200 });

    if (uvNode && noise1Node) graph.connect(uvNode.id, 'uv', noise1Node.id, 'uv');
    if (uvNode && noise2Node) graph.connect(uvNode.id, 'uv', noise2Node.id, 'uv');
    if (uvNode && noise3Node) graph.connect(uvNode.id, 'uv', noise3Node.id, 'uv');

    return {
      id: 'procedural_marble',
      name: 'Procedural Marble',
      description: 'Marble veining using FBM noise',
      category: 'texturing',
      tags: ['procedural', 'marble', 'noise', 'stone'],
      complexity: 'medium',
      nodeCount: graph.nodes.size,
      graph: graph.toJSON(),
    };
  }

  private createCaustics(): ShaderTemplate {
    const graph = new ShaderGraph('Caustics');
    graph.description = 'Underwater caustic light patterns';

    const posNode = graph.createNode('input_position', { x: 0, y: 0 });
    const timeNode = graph.createNode('input_time', { x: 0, y: 100 });
    const scaleNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const speedNode = graph.createNode('constant_float', { x: 0, y: 300 });
    const intensityNode = graph.createNode('constant_float', { x: 0, y: 400 });
    const colorNode = graph.createNode('constant_vec3', { x: 0, y: 500 });

    graph.setNodeProperty(scaleNode!.id, 'value', 2.0);
    graph.setNodeProperty(speedNode!.id, 'value', 1.0);
    graph.setNodeProperty(intensityNode!.id, 'value', 2.0);
    graph.setNodeProperty(colorNode!.id, 'x', 0.2);
    graph.setNodeProperty(colorNode!.id, 'y', 0.5);
    graph.setNodeProperty(colorNode!.id, 'z', 0.8);

    const causticsNode = graph.createNode('caustics', { x: 400, y: 200 });
    const outputNode = graph.createNode('output_surface', { x: 700, y: 200 });

    if (posNode && causticsNode) graph.connect(posNode.id, 'position', causticsNode.id, 'position');
    if (timeNode && causticsNode) graph.connect(timeNode.id, 'time', causticsNode.id, 'time');
    if (scaleNode && causticsNode) graph.connect(scaleNode.id, 'value', causticsNode.id, 'scale');
    if (speedNode && causticsNode) graph.connect(speedNode.id, 'value', causticsNode.id, 'speed');
    if (intensityNode && causticsNode) graph.connect(intensityNode.id, 'value', causticsNode.id, 'intensity');
    if (colorNode && causticsNode) graph.connect(colorNode.id, 'value', causticsNode.id, 'color');

    if (causticsNode && outputNode) graph.connect(causticsNode.id, 'caustic', outputNode.id, 'emission');

    return {
      id: 'caustics',
      name: 'Caustics',
      description: 'Underwater light caustic patterns',
      category: 'vfx',
      tags: ['caustics', 'underwater', 'water', 'light'],
      complexity: 'advanced',
      nodeCount: graph.nodes.size,
      graph: graph.toJSON(),
    };
  }

  private createScreenSpaceReflection(): ShaderTemplate {
    const graph = new ShaderGraph('Screen Space Reflection');
    graph.description = 'SSR for reflective surfaces';

    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 100 });
    const viewDirNode = graph.createNode('input_view_direction', { x: 0, y: 200 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 300 });
    const stepsNode = graph.createNode('constant_float', { x: 0, y: 400 });
    const stepSizeNode = graph.createNode('constant_float', { x: 0, y: 500 });

    graph.setNodeProperty(roughnessNode!.id, 'value', 0.1);
    graph.setNodeProperty(stepsNode!.id, 'value', 64);
    graph.setNodeProperty(stepSizeNode!.id, 'value', 0.02);

    const ssrNode = graph.createNode('screen_space_reflection', { x: 400, y: 250 });
    const outputNode = graph.createNode('output_surface', { x: 700, y: 250 });

    if (uvNode && ssrNode) graph.connect(uvNode.id, 'uv', ssrNode.id, 'uv');
    if (normalNode && ssrNode) graph.connect(normalNode.id, 'normal', ssrNode.id, 'normal');
    if (viewDirNode && ssrNode) graph.connect(viewDirNode.id, 'direction', ssrNode.id, 'viewDir');
    if (roughnessNode && ssrNode) graph.connect(roughnessNode.id, 'value', ssrNode.id, 'roughness');
    if (stepsNode && ssrNode) graph.connect(stepsNode.id, 'value', ssrNode.id, 'maxSteps');
    if (stepSizeNode && ssrNode) graph.connect(stepSizeNode.id, 'value', ssrNode.id, 'stepSize');

    return {
      id: 'screen_space_reflection',
      name: 'Screen Space Reflection',
      description: 'Ray-marched SSR for mirror-like surfaces',
      category: 'lighting',
      tags: ['ssr', 'reflection', 'advanced', 'ray-marching'],
      complexity: 'advanced',
      nodeCount: graph.nodes.size,
      graph: graph.toJSON(),
    };
  }

  private createVolumetricFog(): ShaderTemplate {
    const graph = new ShaderGraph('Volumetric Fog');
    graph.description = 'Height-based volumetric fog';

    const posNode = graph.createNode('input_position', { x: 0, y: 0 });
    const groundNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const densityNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const falloffNode = graph.createNode('constant_float', { x: 0, y: 300 });

    graph.setNodeProperty(groundNode!.id, 'value', 0);
    graph.setNodeProperty(densityNode!.id, 'value', 0.5);
    graph.setNodeProperty(falloffNode!.id, 'value', 2.0);

    const fogNode = graph.createNode('volume_height_fog', { x: 400, y: 150 });
    const colorNode = graph.createNode('constant_vec3', { x: 400, y: 350 });

    graph.setNodeProperty(colorNode!.id, 'x', 0.7);
    graph.setNodeProperty(colorNode!.id, 'y', 0.8);
    graph.setNodeProperty(colorNode!.id, 'z', 0.9);

    const outputNode = graph.createNode('output_volume', { x: 700, y: 200 });

    if (posNode && fogNode) graph.connect(posNode.id, 'position', fogNode.id, 'position');
    if (groundNode && fogNode) graph.connect(groundNode.id, 'value', fogNode.id, 'groundLevel');
    if (densityNode && fogNode) graph.connect(densityNode.id, 'value', fogNode.id, 'density');
    if (falloffNode && fogNode) graph.connect(falloffNode.id, 'value', fogNode.id, 'falloff');

    if (fogNode && outputNode) graph.connect(fogNode.id, 'density', outputNode.id, 'density');
    if (colorNode && outputNode) graph.connect(colorNode.id, 'value', outputNode.id, 'color');

    return {
      id: 'volumetric_fog',
      name: 'Volumetric Fog',
      description: 'Exponential height fog for atmospheric depth',
      category: 'vfx',
      tags: ['volumetric', 'fog', 'atmosphere', 'depth'],
      complexity: 'medium',
      nodeCount: graph.nodes.size,
      graph: graph.toJSON(),
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: ShaderTemplateLibrary | null = null;

/**
 * Get singleton instance of ShaderTemplateLibrary
 */
export function getShaderTemplateLibrary(): ShaderTemplateLibrary {
  if (!instance) {
    instance = new ShaderTemplateLibrary();
  }
  return instance;
}
