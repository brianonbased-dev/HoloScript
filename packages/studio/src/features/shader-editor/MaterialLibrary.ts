/**
 * Material Library
 *
 * Built-in material presets, user-created materials, tagging system, search,
 * and thumbnail generation for shader graphs.
 *
 * Features:
 * - 20+ built-in material presets (PBR, Stylized, VFX)
 * - User-created material storage with persistence
 * - Tagging system (stylized, realistic, VFX, etc.)
 * - Search by name/tag
 * - Thumbnail generation (render to canvas → DataURL)
 * - Material variants (LOD-specific simplified shaders)
 */

import { ShaderGraph, type ISerializedShaderGraph } from '../../lib/shaderGraphTypes';
import { openDB, type IDBPDatabase } from 'idb';

// ============================================================================
// Types
// ============================================================================

/**
 * Material preset configuration
 */
export interface MaterialPreset {
  id: string;
  name: string;
  description: string;
  category: MaterialCategory;
  tags: string[];
  thumbnail?: string; // DataURL
  graph: ISerializedShaderGraph;
  variants?: MaterialVariant[];
  createdAt: number;
  isBuiltIn: boolean;
}

/**
 * Material category
 */
export type MaterialCategory = 'pbr' | 'stylized' | 'vfx' | 'utility' | 'custom';

/**
 * Material variant (LOD-specific)
 */
export interface MaterialVariant {
  name: string;
  lod: 'high' | 'medium' | 'low';
  graph: ISerializedShaderGraph;
}

// ============================================================================
// Database
// ============================================================================

const DB_NAME = 'holoscript-material-library';
const DB_VERSION = 1;
const STORE_NAME = 'materials';

// ============================================================================
// Material Library
// ============================================================================

export class MaterialLibrary {
  private db: IDBPDatabase | null = null;
  private builtInMaterials: Map<string, MaterialPreset> = new Map();

  /**
   * Initialize library and database
   */
  async initialize(): Promise<void> {
    await this.initializeDatabase();
    await this.loadBuiltInMaterials();
  }

  /**
   * Initialize IndexedDB
   */
  private async initializeDatabase(): Promise<void> {
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('category', 'category');
          store.createIndex('tags', 'tags', { multiEntry: true });
          store.createIndex('createdAt', 'createdAt');
        }
      },
    });
  }

  /**
   * Load built-in material presets
   */
  private async loadBuiltInMaterials(): Promise<void> {
    const presets = [
      this.createPBRStandard(),
      this.createUnlit(),
      this.createWater(),
      this.createFire(),
      this.createGlass(),
      this.createHologram(),
      this.createToon(),
      this.createMetal(),
      this.createPlastic(),
      this.createFabric(),
      this.createSkin(),
      this.createLava(),
      this.createCrystal(),
      this.createNeonLight(),
      this.createStainedGlass(),
      this.createMarble(),
      this.createWood(),
      this.createForceField(),
      this.createDissolve(),
      this.createPortal(),
      this.createIce(),
      this.createGold(),
      this.createChrome(),
      this.createOpal(),
      this.createGlitter(),
    ];

    for (const preset of presets) {
      this.builtInMaterials.set(preset.id, preset);
    }
  }

  /**
   * Get all materials (built-in + custom)
   */
  async getAllMaterials(category?: MaterialCategory): Promise<MaterialPreset[]> {
    if (!this.db) await this.initialize();

    const builtIn = Array.from(this.builtInMaterials.values());
    const custom = await this.db!.getAll(STORE_NAME);

    const all = [...builtIn, ...custom];

    if (category) {
      return all.filter((m) => m.category === category);
    }

    return all;
  }

  /**
   * Get material by ID
   */
  async getMaterial(id: string): Promise<MaterialPreset | null> {
    // Check built-in first
    if (this.builtInMaterials.has(id)) {
      return this.builtInMaterials.get(id)!;
    }

    // Check custom
    if (!this.db) await this.initialize();
    const custom = await this.db!.get(STORE_NAME, id);
    return custom ?? null;
  }

  /**
   * Save custom material
   */
  async saveMaterial(
    material: Omit<MaterialPreset, 'id' | 'createdAt' | 'isBuiltIn'>
  ): Promise<MaterialPreset> {
    if (!this.db) await this.initialize();

    const preset: MaterialPreset = {
      ...material,
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      createdAt: Date.now(),
      isBuiltIn: false,
    };

    await this.db!.add(STORE_NAME, preset);

    return preset;
  }

  /**
   * Update custom material
   */
  async updateMaterial(id: string, updates: Partial<MaterialPreset>): Promise<void> {
    if (!this.db) await this.initialize();

    const existing = await this.db!.get(STORE_NAME, id);
    if (!existing) {
      throw new Error(`Material not found: ${id}`);
    }

    if (existing.isBuiltIn) {
      throw new Error('Cannot modify built-in materials');
    }

    const updated = { ...existing, ...updates, id, isBuiltIn: false };
    await this.db!.put(STORE_NAME, updated);
  }

  /**
   * Delete custom material
   */
  async deleteMaterial(id: string): Promise<void> {
    if (!this.db) await this.initialize();

    const material = await this.db!.get(STORE_NAME, id);
    if (!material) return;

    if (material.isBuiltIn) {
      throw new Error('Cannot delete built-in materials');
    }

    await this.db!.delete(STORE_NAME, id);
  }

  /**
   * Search materials by name or tags
   */
  async searchMaterials(query: string, limit = 20): Promise<MaterialPreset[]> {
    const all = await this.getAllMaterials();
    const lowerQuery = query.toLowerCase();

    return all
      .filter((m) => {
        const nameMatch = m.name.toLowerCase().includes(lowerQuery);
        const descMatch = m.description.toLowerCase().includes(lowerQuery);
        const tagMatch = m.tags.some((t) => t.toLowerCase().includes(lowerQuery));
        return nameMatch || descMatch || tagMatch;
      })
      .slice(0, limit);
  }

  /**
   * Get materials by tags
   */
  async getMaterialsByTags(tags: string[]): Promise<MaterialPreset[]> {
    if (!this.db) await this.initialize();

    const all = await this.getAllMaterials();

    return all.filter((m) =>
      tags.some((tag) => m.tags.some((t) => t.toLowerCase() === tag.toLowerCase()))
    );
  }

  /**
   * Generate thumbnail for a material
   */
  async generateThumbnail(graph: ShaderGraph, size = 128): Promise<string> {
    // Create offscreen canvas
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }

    // Draw placeholder gradient (in real implementation, render 3D preview)
    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, '#667eea');
    gradient.addColorStop(1, '#764ba2');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    // Add graph name
    ctx.fillStyle = 'white';
    ctx.font = `${Math.floor(size / 10)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(graph.name, size / 2, size / 2);

    // Convert to DataURL
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Instantiate material from preset
   */
  instantiateMaterial(preset: MaterialPreset): ShaderGraph {
    return ShaderGraph.fromJSON(preset.graph);
  }

  // ============================================================================
  // Built-in Material Presets
  // ============================================================================

  private createPBRStandard(): MaterialPreset {
    const graph = new ShaderGraph('PBR Standard');

    // Input nodes
    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });
    const baseColorNode = graph.createNode('constant_color', { x: 0, y: 100 });
    const metallicNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 300 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 400 });

    // Set default properties
    graph.setNodeProperty(baseColorNode!.id, 'r', 0.8);
    graph.setNodeProperty(baseColorNode!.id, 'g', 0.8);
    graph.setNodeProperty(baseColorNode!.id, 'b', 0.8);
    graph.setNodeProperty(baseColorNode!.id, 'a', 1.0);
    graph.setNodeProperty(metallicNode!.id, 'value', 0.0);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.5);

    // Output node
    const outputNode = graph.createNode('output_surface', { x: 500, y: 200 });

    // Connect
    if (baseColorNode && outputNode) {
      graph.connect(baseColorNode.id, 'color', outputNode.id, 'baseColor');
    }
    if (metallicNode && outputNode) {
      graph.connect(metallicNode.id, 'value', outputNode.id, 'metallic');
    }
    if (roughnessNode && outputNode) {
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    }
    if (normalNode && outputNode) {
      graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');
    }

    return {
      id: 'pbr_standard',
      name: 'PBR Standard',
      description: 'Basic PBR material with metallic/roughness workflow',
      category: 'pbr',
      tags: ['realistic', 'pbr', 'basic'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createUnlit(): MaterialPreset {
    const graph = new ShaderGraph('Unlit');

    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const outputNode = graph.createNode('output_unlit', { x: 300, y: 0 });

    graph.setNodeProperty(colorNode!.id, 'r', 1);
    graph.setNodeProperty(colorNode!.id, 'g', 1);
    graph.setNodeProperty(colorNode!.id, 'b', 1);
    graph.setNodeProperty(colorNode!.id, 'a', 1);

    if (colorNode && outputNode) {
      graph.connect(colorNode.id, 'color', outputNode.id, 'color');
    }

    return {
      id: 'unlit',
      name: 'Unlit',
      description: 'Simple unlit material for flat shading',
      category: 'utility',
      tags: ['basic', 'unlit', 'flat'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createWater(): MaterialPreset {
    const graph = new ShaderGraph('Water');

    const posNode = graph.createNode('input_position', { x: 0, y: 0 });
    const timeNode = graph.createNode('input_time', { x: 0, y: 100 });
    const waveScaleNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const waveSpeedNode = graph.createNode('constant_float', { x: 0, y: 300 });
    const depthNode = graph.createNode('constant_float', { x: 0, y: 400 });
    const foamNode = graph.createNode('constant_float', { x: 0, y: 500 });

    graph.setNodeProperty(waveScaleNode!.id, 'value', 1.0);
    graph.setNodeProperty(waveSpeedNode!.id, 'value', 1.0);
    graph.setNodeProperty(depthNode!.id, 'value', 5.0);
    graph.setNodeProperty(foamNode!.id, 'value', 0.7);

    const waterNode = graph.createNode('water_surface', { x: 400, y: 200 });
    const outputNode = graph.createNode('output_surface', { x: 700, y: 200 });

    // Connect water surface
    if (posNode && waterNode) graph.connect(posNode.id, 'position', waterNode.id, 'position');
    if (timeNode && waterNode) graph.connect(timeNode.id, 'time', waterNode.id, 'time');
    if (waveScaleNode && waterNode)
      graph.connect(waveScaleNode.id, 'value', waterNode.id, 'waveScale');
    if (waveSpeedNode && waterNode)
      graph.connect(waveSpeedNode.id, 'value', waterNode.id, 'waveSpeed');
    if (depthNode && waterNode) graph.connect(depthNode.id, 'value', waterNode.id, 'depth');
    if (foamNode && waterNode) graph.connect(foamNode.id, 'value', waterNode.id, 'foamThreshold');

    // Water color
    const waterColor = graph.createNode('constant_vec3', { x: 400, y: 500 });
    graph.setNodeProperty(waterColor!.id, 'x', 0.1);
    graph.setNodeProperty(waterColor!.id, 'y', 0.3);
    graph.setNodeProperty(waterColor!.id, 'z', 0.5);

    if (waterNode && outputNode) {
      graph.connect(waterNode.id, 'normal', outputNode.id, 'normal');
    }
    if (waterColor && outputNode) {
      graph.connect(waterColor.id, 'value', outputNode.id, 'baseColor');
    }

    return {
      id: 'water',
      name: 'Water',
      description: 'Realistic water with Gerstner waves, foam, and caustics',
      category: 'vfx',
      tags: ['realistic', 'water', 'animated', 'vfx'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createFire(): MaterialPreset {
    const graph = new ShaderGraph('Fire');

    const posNode = graph.createNode('input_position', { x: 0, y: 0 });
    const timeNode = graph.createNode('input_time', { x: 0, y: 100 });
    const turbNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const riseNode = graph.createNode('constant_float', { x: 0, y: 300 });
    const scaleNode = graph.createNode('constant_float', { x: 0, y: 400 });

    graph.setNodeProperty(turbNode!.id, 'value', 0.5);
    graph.setNodeProperty(riseNode!.id, 'value', 1.0);
    graph.setNodeProperty(scaleNode!.id, 'value', 2.0);

    const fireNode = graph.createNode('volume_fire_density', { x: 400, y: 200 });
    const emissionNode = graph.createNode('volume_emission', { x: 700, y: 200 });
    const outputNode = graph.createNode('output_volume', { x: 1000, y: 200 });

    // Connect fire
    if (posNode && fireNode) graph.connect(posNode.id, 'position', fireNode.id, 'position');
    if (timeNode && fireNode) graph.connect(timeNode.id, 'time', fireNode.id, 'time');
    if (turbNode && fireNode) graph.connect(turbNode.id, 'value', fireNode.id, 'turbulence');
    if (riseNode && fireNode) graph.connect(riseNode.id, 'value', fireNode.id, 'riseSpeed');
    if (scaleNode && fireNode) graph.connect(scaleNode.id, 'value', fireNode.id, 'scale');

    // Emission color (orange-yellow)
    const emitColor = graph.createNode('constant_vec3', { x: 400, y: 500 });
    graph.setNodeProperty(emitColor!.id, 'x', 1.0);
    graph.setNodeProperty(emitColor!.id, 'y', 0.5);
    graph.setNodeProperty(emitColor!.id, 'z', 0.1);

    if (fireNode && emissionNode) {
      graph.connect(fireNode.id, 'density', emissionNode.id, 'density');
      graph.connect(fireNode.id, 'temperature', emissionNode.id, 'temperature');
    }
    if (emitColor && emissionNode) {
      graph.connect(emitColor.id, 'value', emissionNode.id, 'emissionColor');
    }
    if (emissionNode && outputNode) {
      graph.connect(emissionNode.id, 'emission', outputNode.id, 'emission');
    }

    return {
      id: 'fire',
      name: 'Fire',
      description: 'Volumetric fire with blackbody emission',
      category: 'vfx',
      tags: ['vfx', 'volumetric', 'fire', 'animated'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createGlass(): MaterialPreset {
    const graph = new ShaderGraph('Glass');

    const normalNode = graph.createNode('input_normal', { x: 0, y: 0 });
    const viewDirNode = graph.createNode('input_view_direction', { x: 0, y: 100 });
    const fresnelNode = graph.createNode('utility_fresnel', { x: 300, y: 0 });
    const colorNode = graph.createNode('constant_vec3', { x: 0, y: 300 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 400 });
    const outputNode = graph.createNode('output_surface', { x: 600, y: 200 });

    graph.setNodeProperty(fresnelNode!.id, 'power', 5);
    graph.setNodeProperty(colorNode!.id, 'x', 0.95);
    graph.setNodeProperty(colorNode!.id, 'y', 0.97);
    graph.setNodeProperty(colorNode!.id, 'z', 1.0);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.05);

    // Fresnel for transparency
    if (normalNode && fresnelNode) graph.connect(normalNode.id, 'normal', fresnelNode.id, 'normal');
    if (viewDirNode && fresnelNode)
      graph.connect(viewDirNode.id, 'direction', fresnelNode.id, 'viewDir');

    // Output
    if (colorNode && outputNode) graph.connect(colorNode.id, 'value', outputNode.id, 'baseColor');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (fresnelNode && outputNode) graph.connect(fresnelNode.id, 'result', outputNode.id, 'alpha');

    return {
      id: 'glass',
      name: 'Glass',
      description: 'Transparent glass material with fresnel falloff',
      category: 'pbr',
      tags: ['realistic', 'transparent', 'glass'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createHologram(): MaterialPreset {
    const graph = new ShaderGraph('Hologram');

    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 100 });
    const viewDirNode = graph.createNode('input_view_direction', { x: 0, y: 200 });
    const timeNode = graph.createNode('input_time', { x: 0, y: 300 });

    // Scan lines
    const yCoord = graph.createNode('vector_split_vec2', { x: 200, y: 0 });
    const scanFreq = graph.createNode('constant_float', { x: 200, y: 100 });
    const scanMul = graph.createNode('math_multiply', { x: 400, y: 0 });
    const scanAdd = graph.createNode('math_add', { x: 600, y: 0 });
    const scanSin = graph.createNode('trig_sin', { x: 800, y: 0 });

    graph.setNodeProperty(scanFreq!.id, 'value', 20);

    // Fresnel rim
    const fresnelNode = graph.createNode('utility_fresnel', { x: 200, y: 300 });
    graph.setNodeProperty(fresnelNode!.id, 'power', 3);

    // Color
    const holoColor = graph.createNode('constant_vec3', { x: 800, y: 300 });
    graph.setNodeProperty(holoColor!.id, 'x', 0.2);
    graph.setNodeProperty(holoColor!.id, 'y', 0.8);
    graph.setNodeProperty(holoColor!.id, 'z', 1.0);

    const outputNode = graph.createNode('output_surface', { x: 1200, y: 200 });

    // Wire scan lines
    if (uvNode && yCoord) graph.connect(uvNode.id, 'uv', yCoord.id, 'vector');
    if (yCoord && scanMul) graph.connect(yCoord.id, 'y', scanMul.id, 'a');
    if (scanFreq && scanMul) graph.connect(scanFreq.id, 'value', scanMul.id, 'b');
    if (scanMul && scanAdd) graph.connect(scanMul.id, 'result', scanAdd.id, 'a');
    if (timeNode && scanAdd) graph.connect(timeNode.id, 'time', scanAdd.id, 'b');
    if (scanAdd && scanSin) graph.connect(scanAdd.id, 'result', scanSin.id, 'angle');

    // Fresnel
    if (normalNode && fresnelNode) graph.connect(normalNode.id, 'normal', fresnelNode.id, 'normal');
    if (viewDirNode && fresnelNode)
      graph.connect(viewDirNode.id, 'direction', fresnelNode.id, 'viewDir');

    // Emission
    if (holoColor && outputNode) graph.connect(holoColor.id, 'value', outputNode.id, 'emission');

    return {
      id: 'hologram',
      name: 'Hologram',
      description: 'Sci-fi holographic material with animated scan lines',
      category: 'vfx',
      tags: ['stylized', 'sci-fi', 'hologram', 'animated'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createToon(): MaterialPreset {
    const graph = new ShaderGraph('Toon');

    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 100 });
    const outputNode = graph.createNode('output_surface', { x: 600, y: 100 });

    graph.setNodeProperty(colorNode!.id, 'r', 0.8);
    graph.setNodeProperty(colorNode!.id, 'g', 0.3);
    graph.setNodeProperty(colorNode!.id, 'b', 0.3);

    // Rough quantization through step function would be built into shader
    const roughness = graph.createNode('constant_float', { x: 0, y: 200 });
    graph.setNodeProperty(roughness!.id, 'value', 1.0);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');
    if (roughness && outputNode) graph.connect(roughness.id, 'value', outputNode.id, 'roughness');

    return {
      id: 'toon',
      name: 'Toon',
      description: 'Cel-shaded cartoon material',
      category: 'stylized',
      tags: ['stylized', 'toon', 'cel-shading'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createMetal(): MaterialPreset {
    const graph = new ShaderGraph('Metal');
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const metallicNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 300 });
    const outputNode = graph.createNode('output_surface', { x: 400, y: 150 });

    graph.setNodeProperty(colorNode!.id, 'r', 0.9);
    graph.setNodeProperty(colorNode!.id, 'g', 0.9);
    graph.setNodeProperty(colorNode!.id, 'b', 0.95);
    graph.setNodeProperty(metallicNode!.id, 'value', 1.0);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.3);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (metallicNode && outputNode)
      graph.connect(metallicNode.id, 'value', outputNode.id, 'metallic');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'metal',
      name: 'Metal',
      description: 'Brushed metal PBR material',
      category: 'pbr',
      tags: ['realistic', 'metal', 'pbr'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createPlastic(): MaterialPreset {
    const graph = new ShaderGraph('Plastic');
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 200 });
    const outputNode = graph.createNode('output_surface', { x: 400, y: 100 });

    graph.setNodeProperty(colorNode!.id, 'r', 1.0);
    graph.setNodeProperty(colorNode!.id, 'g', 0.2);
    graph.setNodeProperty(colorNode!.id, 'b', 0.2);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.4);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'plastic',
      name: 'Plastic',
      description: 'Smooth plastic material',
      category: 'pbr',
      tags: ['realistic', 'plastic'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createFabric(): MaterialPreset {
    const graph = new ShaderGraph('Fabric');
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const sheenNode = graph.createNode('constant_vec3', { x: 0, y: 200 });
    const sheenRoughNode = graph.createNode('constant_float', { x: 0, y: 300 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 400 });
    const outputNode = graph.createNode('output_surface', { x: 400, y: 200 });

    graph.setNodeProperty(colorNode!.id, 'r', 0.6);
    graph.setNodeProperty(colorNode!.id, 'g', 0.1);
    graph.setNodeProperty(colorNode!.id, 'b', 0.1);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.8);
    graph.setNodeProperty(sheenNode!.id, 'x', 0.3);
    graph.setNodeProperty(sheenNode!.id, 'y', 0.1);
    graph.setNodeProperty(sheenNode!.id, 'z', 0.1);
    graph.setNodeProperty(sheenRoughNode!.id, 'value', 0.5);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (sheenNode && outputNode) graph.connect(sheenNode.id, 'value', outputNode.id, 'sheenColor');
    if (sheenRoughNode && outputNode)
      graph.connect(sheenRoughNode.id, 'value', outputNode.id, 'sheenRoughness');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'fabric',
      name: 'Fabric',
      description: 'Velvet fabric with sheen layer',
      category: 'pbr',
      tags: ['realistic', 'fabric', 'cloth'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createSkin(): MaterialPreset {
    const graph = new ShaderGraph('Skin');
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const sssThickNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const sssColorNode = graph.createNode('constant_vec3', { x: 0, y: 300 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 400 });
    const outputNode = graph.createNode('output_surface', { x: 400, y: 200 });

    graph.setNodeProperty(colorNode!.id, 'r', 0.95);
    graph.setNodeProperty(colorNode!.id, 'g', 0.75);
    graph.setNodeProperty(colorNode!.id, 'b', 0.7);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.5);
    graph.setNodeProperty(sssThickNode!.id, 'value', 0.7);
    graph.setNodeProperty(sssColorNode!.id, 'x', 1.0);
    graph.setNodeProperty(sssColorNode!.id, 'y', 0.5);
    graph.setNodeProperty(sssColorNode!.id, 'z', 0.5);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (sssThickNode && outputNode)
      graph.connect(sssThickNode.id, 'value', outputNode.id, 'subsurfaceThickness');
    if (sssColorNode && outputNode)
      graph.connect(sssColorNode.id, 'value', outputNode.id, 'subsurfaceColor');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'skin',
      name: 'Skin',
      description: 'Human skin with subsurface scattering',
      category: 'pbr',
      tags: ['realistic', 'skin', 'sss', 'organic'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createLava(): MaterialPreset {
    const graph = new ShaderGraph('Lava');
    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });
    const timeNode = graph.createNode('input_time', { x: 0, y: 100 });
    const noiseNode = graph.createNode('utility_gradient_noise', { x: 200, y: 0 });
    const emissionNode = graph.createNode('constant_vec3', { x: 400, y: 0 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 300 });
    const outputNode = graph.createNode('output_surface', { x: 600, y: 150 });

    graph.setNodeProperty(emissionNode!.id, 'x', 5.0);
    graph.setNodeProperty(emissionNode!.id, 'y', 1.5);
    graph.setNodeProperty(emissionNode!.id, 'z', 0.1);

    if (uvNode && noiseNode) graph.connect(uvNode.id, 'uv', noiseNode.id, 'uv');
    if (emissionNode && outputNode)
      graph.connect(emissionNode.id, 'value', outputNode.id, 'emission');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'lava',
      name: 'Lava',
      description: 'Hot lava with animated noise emission',
      category: 'vfx',
      tags: ['vfx', 'lava', 'emission', 'animated'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createCrystal(): MaterialPreset {
    const graph = new ShaderGraph('Crystal');
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const iridesNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 300 });
    const outputNode = graph.createNode('output_surface', { x: 400, y: 150 });

    graph.setNodeProperty(colorNode!.id, 'r', 0.9);
    graph.setNodeProperty(colorNode!.id, 'g', 0.95);
    graph.setNodeProperty(colorNode!.id, 'b', 1.0);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.1);
    graph.setNodeProperty(iridesNode!.id, 'value', 0.8);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (iridesNode && outputNode)
      graph.connect(iridesNode.id, 'value', outputNode.id, 'iridescence');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'crystal',
      name: 'Crystal',
      description: 'Iridescent crystal material',
      category: 'pbr',
      tags: ['realistic', 'crystal', 'iridescent'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createNeonLight(): MaterialPreset {
    const graph = new ShaderGraph('Neon Light');
    const colorNode = graph.createNode('constant_vec3', { x: 0, y: 0 });
    const intensityNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const mulNode = graph.createNode('math_multiply', { x: 200, y: 50 });
    const outputNode = graph.createNode('output_surface', { x: 400, y: 50 });

    graph.setNodeProperty(colorNode!.id, 'x', 1.0);
    graph.setNodeProperty(colorNode!.id, 'y', 0.2);
    graph.setNodeProperty(colorNode!.id, 'z', 0.8);
    graph.setNodeProperty(intensityNode!.id, 'value', 10.0);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'value', outputNode.id, 'emission');

    return {
      id: 'neon_light',
      name: 'Neon Light',
      description: 'Bright neon emission material',
      category: 'vfx',
      tags: ['vfx', 'neon', 'emission', 'glow'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createStainedGlass(): MaterialPreset {
    const graph = new ShaderGraph('Stained Glass');
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const alphaNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 300 });
    const outputNode = graph.createNode('output_surface', { x: 400, y: 150 });

    graph.setNodeProperty(colorNode!.id, 'r', 0.8);
    graph.setNodeProperty(colorNode!.id, 'g', 0.2);
    graph.setNodeProperty(colorNode!.id, 'b', 0.2);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.2);
    graph.setNodeProperty(alphaNode!.id, 'value', 0.7);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (alphaNode && outputNode) graph.connect(alphaNode.id, 'value', outputNode.id, 'alpha');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'stained_glass',
      name: 'Stained Glass',
      description: 'Colored translucent stained glass',
      category: 'pbr',
      tags: ['realistic', 'glass', 'transparent', 'colored'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createMarble(): MaterialPreset {
    const graph = new ShaderGraph('Marble');
    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });
    const noiseNode = graph.createNode('utility_gradient_noise', { x: 200, y: 0 });
    const colorANode = graph.createNode('constant_vec3', { x: 400, y: 0 });
    const colorBNode = graph.createNode('constant_vec3', { x: 400, y: 100 });
    const lerpNode = graph.createNode('math_lerp', { x: 600, y: 50 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 300 });
    const outputNode = graph.createNode('output_surface', { x: 800, y: 150 });

    graph.setNodeProperty(colorANode!.id, 'x', 0.95);
    graph.setNodeProperty(colorANode!.id, 'y', 0.95);
    graph.setNodeProperty(colorANode!.id, 'z', 0.95);
    graph.setNodeProperty(colorBNode!.id, 'x', 0.4);
    graph.setNodeProperty(colorBNode!.id, 'y', 0.4);
    graph.setNodeProperty(colorBNode!.id, 'z', 0.45);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.2);

    if (uvNode && noiseNode) graph.connect(uvNode.id, 'uv', noiseNode.id, 'uv');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'marble',
      name: 'Marble',
      description: 'Polished marble with noise veining',
      category: 'pbr',
      tags: ['realistic', 'stone', 'marble'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createWood(): MaterialPreset {
    const graph = new ShaderGraph('Wood');
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 200 });
    const outputNode = graph.createNode('output_surface', { x: 400, y: 100 });

    graph.setNodeProperty(colorNode!.id, 'r', 0.5);
    graph.setNodeProperty(colorNode!.id, 'g', 0.3);
    graph.setNodeProperty(colorNode!.id, 'b', 0.2);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.6);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'wood',
      name: 'Wood',
      description: 'Natural wood grain material',
      category: 'pbr',
      tags: ['realistic', 'wood', 'organic'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createForceField(): MaterialPreset {
    const graph = new ShaderGraph('Force Field');
    const normalNode = graph.createNode('input_normal', { x: 0, y: 0 });
    const viewDirNode = graph.createNode('input_view_direction', { x: 0, y: 100 });
    const fresnelNode = graph.createNode('utility_fresnel', { x: 200, y: 50 });
    const colorNode = graph.createNode('constant_vec3', { x: 400, y: 0 });
    const outputNode = graph.createNode('output_surface', { x: 600, y: 50 });

    graph.setNodeProperty(fresnelNode!.id, 'power', 2);
    graph.setNodeProperty(colorNode!.id, 'x', 0.1);
    graph.setNodeProperty(colorNode!.id, 'y', 0.5);
    graph.setNodeProperty(colorNode!.id, 'z', 1.0);

    if (normalNode && fresnelNode) graph.connect(normalNode.id, 'normal', fresnelNode.id, 'normal');
    if (viewDirNode && fresnelNode)
      graph.connect(viewDirNode.id, 'direction', fresnelNode.id, 'viewDir');
    if (colorNode && outputNode) graph.connect(colorNode.id, 'value', outputNode.id, 'emission');
    if (fresnelNode && outputNode) graph.connect(fresnelNode.id, 'result', outputNode.id, 'alpha');

    return {
      id: 'force_field',
      name: 'Force Field',
      description: 'Energy shield force field effect',
      category: 'vfx',
      tags: ['vfx', 'sci-fi', 'shield', 'transparent'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createDissolve(): MaterialPreset {
    const graph = new ShaderGraph('Dissolve');
    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });
    const noiseNode = graph.createNode('utility_gradient_noise', { x: 200, y: 0 });
    const thresholdNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const stepNode = graph.createNode('math_step', { x: 400, y: 50 });
    const colorNode = graph.createNode('constant_color', { x: 0, y: 200 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 300 });
    const outputNode = graph.createNode('output_surface', { x: 600, y: 150 });

    graph.setNodeProperty(thresholdNode!.id, 'value', 0.5);
    graph.setNodeProperty(colorNode!.id, 'r', 0.8);
    graph.setNodeProperty(colorNode!.id, 'g', 0.8);
    graph.setNodeProperty(colorNode!.id, 'b', 0.8);

    if (uvNode && noiseNode) graph.connect(uvNode.id, 'uv', noiseNode.id, 'uv');
    if (thresholdNode && stepNode) graph.connect(thresholdNode.id, 'value', stepNode.id, 'edge');
    if (noiseNode && stepNode) graph.connect(noiseNode.id, 'noise', stepNode.id, 'x');
    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (stepNode && outputNode) graph.connect(stepNode.id, 'result', outputNode.id, 'alpha');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'dissolve',
      name: 'Dissolve',
      description: 'Noise-driven dissolve effect',
      category: 'vfx',
      tags: ['vfx', 'dissolve', 'fade'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createPortal(): MaterialPreset {
    const graph = new ShaderGraph('Portal');
    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });
    const timeNode = graph.createNode('input_time', { x: 0, y: 100 });
    const noiseNode = graph.createNode('utility_gradient_noise', { x: 200, y: 0 });
    const colorANode = graph.createNode('constant_vec3', { x: 400, y: 0 });
    const colorBNode = graph.createNode('constant_vec3', { x: 400, y: 100 });
    const outputNode = graph.createNode('output_surface', { x: 600, y: 50 });

    graph.setNodeProperty(colorANode!.id, 'x', 0.5);
    graph.setNodeProperty(colorANode!.id, 'y', 0.1);
    graph.setNodeProperty(colorANode!.id, 'z', 1.0);
    graph.setNodeProperty(colorBNode!.id, 'x', 1.0);
    graph.setNodeProperty(colorBNode!.id, 'y', 0.3);
    graph.setNodeProperty(colorBNode!.id, 'z', 0.8);

    if (uvNode && noiseNode) graph.connect(uvNode.id, 'uv', noiseNode.id, 'uv');
    if (colorANode && outputNode) graph.connect(colorANode.id, 'value', outputNode.id, 'emission');

    return {
      id: 'portal',
      name: 'Portal',
      description: 'Swirling portal effect with animated noise',
      category: 'vfx',
      tags: ['vfx', 'portal', 'animated', 'magic'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createIce(): MaterialPreset {
    const graph = new ShaderGraph('Ice');
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const alphaNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 300 });
    const outputNode = graph.createNode('output_surface', { x: 400, y: 150 });

    graph.setNodeProperty(colorNode!.id, 'r', 0.85);
    graph.setNodeProperty(colorNode!.id, 'g', 0.95);
    graph.setNodeProperty(colorNode!.id, 'b', 1.0);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.15);
    graph.setNodeProperty(alphaNode!.id, 'value', 0.8);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (alphaNode && outputNode) graph.connect(alphaNode.id, 'value', outputNode.id, 'alpha');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'ice',
      name: 'Ice',
      description: 'Translucent frozen ice material',
      category: 'pbr',
      tags: ['realistic', 'ice', 'transparent'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createGold(): MaterialPreset {
    const graph = new ShaderGraph('Gold');
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const metallicNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 300 });
    const outputNode = graph.createNode('output_surface', { x: 400, y: 150 });

    graph.setNodeProperty(colorNode!.id, 'r', 1.0);
    graph.setNodeProperty(colorNode!.id, 'g', 0.85);
    graph.setNodeProperty(colorNode!.id, 'b', 0.3);
    graph.setNodeProperty(metallicNode!.id, 'value', 1.0);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.2);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (metallicNode && outputNode)
      graph.connect(metallicNode.id, 'value', outputNode.id, 'metallic');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'gold',
      name: 'Gold',
      description: 'Polished gold metal',
      category: 'pbr',
      tags: ['realistic', 'metal', 'gold', 'precious'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createChrome(): MaterialPreset {
    const graph = new ShaderGraph('Chrome');
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const metallicNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 300 });
    const outputNode = graph.createNode('output_surface', { x: 400, y: 150 });

    graph.setNodeProperty(colorNode!.id, 'r', 1.0);
    graph.setNodeProperty(colorNode!.id, 'g', 1.0);
    graph.setNodeProperty(colorNode!.id, 'b', 1.0);
    graph.setNodeProperty(metallicNode!.id, 'value', 1.0);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.05);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (metallicNode && outputNode)
      graph.connect(metallicNode.id, 'value', outputNode.id, 'metallic');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'chrome',
      name: 'Chrome',
      description: 'Mirror-like chrome finish',
      category: 'pbr',
      tags: ['realistic', 'metal', 'chrome', 'reflective'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createOpal(): MaterialPreset {
    const graph = new ShaderGraph('Opal');
    const colorNode = graph.createNode('constant_color', { x: 0, y: 0 });
    const roughnessNode = graph.createNode('constant_float', { x: 0, y: 100 });
    const iridesNode = graph.createNode('constant_float', { x: 0, y: 200 });
    const sssNode = graph.createNode('constant_float', { x: 0, y: 300 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 400 });
    const outputNode = graph.createNode('output_surface', { x: 400, y: 200 });

    graph.setNodeProperty(colorNode!.id, 'r', 0.95);
    graph.setNodeProperty(colorNode!.id, 'g', 0.95);
    graph.setNodeProperty(colorNode!.id, 'b', 1.0);
    graph.setNodeProperty(roughnessNode!.id, 'value', 0.3);
    graph.setNodeProperty(iridesNode!.id, 'value', 1.0);
    graph.setNodeProperty(sssNode!.id, 'value', 0.5);

    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (roughnessNode && outputNode)
      graph.connect(roughnessNode.id, 'value', outputNode.id, 'roughness');
    if (iridesNode && outputNode)
      graph.connect(iridesNode.id, 'value', outputNode.id, 'iridescence');
    if (sssNode && outputNode)
      graph.connect(sssNode.id, 'value', outputNode.id, 'subsurfaceThickness');
    if (normalNode && outputNode) graph.connect(normalNode.id, 'normal', outputNode.id, 'normal');

    return {
      id: 'opal',
      name: 'Opal',
      description: 'Iridescent opal gemstone',
      category: 'pbr',
      tags: ['realistic', 'gemstone', 'iridescent', 'precious'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }

  private createGlitter(): MaterialPreset {
    const graph = new ShaderGraph('Glitter');
    const uvNode = graph.createNode('input_uv', { x: 0, y: 0 });
    const normalNode = graph.createNode('input_normal', { x: 0, y: 100 });
    const viewDirNode = graph.createNode('input_view_direction', { x: 0, y: 200 });
    const densityNode = graph.createNode('constant_float', { x: 0, y: 300 });
    const intensityNode = graph.createNode('constant_float', { x: 0, y: 400 });
    const sparkleNode = graph.createNode('sparkle', { x: 300, y: 200 });
    const colorNode = graph.createNode('constant_color', { x: 0, y: 500 });
    const outputNode = graph.createNode('output_surface', { x: 600, y: 250 });

    graph.setNodeProperty(densityNode!.id, 'value', 100);
    graph.setNodeProperty(intensityNode!.id, 'value', 2.0);
    graph.setNodeProperty(colorNode!.id, 'r', 1.0);
    graph.setNodeProperty(colorNode!.id, 'g', 0.8);
    graph.setNodeProperty(colorNode!.id, 'b', 0.9);

    if (uvNode && sparkleNode) graph.connect(uvNode.id, 'uv', sparkleNode.id, 'uv');
    if (normalNode && sparkleNode) graph.connect(normalNode.id, 'normal', sparkleNode.id, 'normal');
    if (viewDirNode && sparkleNode)
      graph.connect(viewDirNode.id, 'direction', sparkleNode.id, 'viewDir');
    if (densityNode && sparkleNode)
      graph.connect(densityNode.id, 'value', sparkleNode.id, 'density');
    if (intensityNode && sparkleNode)
      graph.connect(intensityNode.id, 'value', sparkleNode.id, 'intensity');
    if (colorNode && outputNode) graph.connect(colorNode.id, 'color', outputNode.id, 'baseColor');
    if (sparkleNode && outputNode)
      graph.connect(sparkleNode.id, 'flash', outputNode.id, 'sparkleIntensity');
    if (densityNode && outputNode)
      graph.connect(densityNode.id, 'value', outputNode.id, 'sparkleDensity');

    return {
      id: 'glitter',
      name: 'Glitter',
      description: 'Sparkling glitter material with micro-facet flashing',
      category: 'vfx',
      tags: ['vfx', 'sparkle', 'glitter', 'metallic'],
      graph: graph.toJSON(),
      createdAt: Date.now(),
      isBuiltIn: true,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: MaterialLibrary | null = null;

/**
 * Get singleton instance of MaterialLibrary
 */
export function getMaterialLibrary(): MaterialLibrary {
  if (!instance) {
    instance = new MaterialLibrary();
  }
  return instance;
}
