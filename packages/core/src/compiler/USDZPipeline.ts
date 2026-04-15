/**
 * USDZ Pipeline for HoloScript
 *
 * Generates USD ASCII (.usda) files from HoloScript compositions.
 * USDA files can be converted to USDZ using Apple's usdz_converter or
 * Python's pxr library.
 *
 * Pipeline: HoloScript AST → USDA (text) → usdz_converter → .usdz
 *
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloValue,
} from '../parser/HoloCompositionTypes';
import {
  compileDomainBlocks,
  compileMaterialBlock,
  compilePhysicsBlock,
  compileParticleBlock,
  compilePostProcessingBlock,
  compileAudioSourceBlock,
  compileWeatherBlock,
  materialToUSD,
  particlesToUSD,
  postProcessingToUSD,
  audioSourceToUSD,
  weatherToUSD,
  compileNarrativeBlock,
  narrativeToUSDA,
  compilePaymentBlock,
  paymentToUSDA,
  compileHealthcareBlock,
  healthcareToUSDA,
  compileRoboticsBlock,
  roboticsToUSDA,
  compileIoTBlock,
  iotToUSDA,
  compileDataVizBlock,
  datavizToUSDA,
  compileEducationBlock,
  educationToUSDA,
  compileMusicBlock,
  musicToUSDA,
  compileArchitectureBlock,
  architectureToUSDA,
  compileWeb3Block,
  web3ToUSDA,
  compileProceduralBlock,
  proceduralToUSDA,
  compileRenderingBlock,
  renderingToUSDA,
  compileNavigationBlock,
  navigationToUSDA,
  compileInputBlock,
  inputToUSDA,
} from './DomainBlockCompilerMixin';
import { MATERIAL_PRESETS } from './R3FCompiler';

function presetString(p: Record<string, unknown>, k: string): string | undefined {
  const v = p[k];
  return typeof v === 'string' ? v : undefined;
}

function presetNumber(p: Record<string, unknown>, k: string): number | undefined {
  const v = p[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function presetBoolean(p: Record<string, unknown>, k: string): boolean | undefined {
  const v = p[k];
  return typeof v === 'boolean' ? v : undefined;
}

// =============================================================================
// TYPES
// =============================================================================

export interface USDZPipelineOptions {
  /** Default up axis (Y or Z) */
  upAxis?: 'Y' | 'Z';
  /** Meters per unit */
  metersPerUnit?: number;
  /** Include animations */
  includeAnimations?: boolean;
  /** Export materials */
  exportMaterials?: boolean;
  /** Default material */
  defaultMaterial?: string;
  /** Pre-loaded texture image data keyed by path/name (PNG or JPEG bytes) */
  textureData?: Record<string, Uint8Array>;
}

export interface USDMaterial {
  name: string;
  baseColor?: [number, number, number];
  metallic?: number;
  roughness?: number;
  emissiveColor?: [number, number, number];
  emissiveIntensity?: number;
  opacity?: number;
  ior?: number;
  // Advanced PBR
  clearcoat?: number;
  clearcoatRoughness?: number;
  transmission?: number;
  thickness?: number;
  attenuationColor?: [number, number, number];
  attenuationDistance?: number;
  sheen?: number;
  sheenRoughness?: number;
  sheenColor?: [number, number, number];
  iridescence?: number;
  iridescenceIOR?: number;
  anisotropy?: number;
  anisotropyRotation?: number;
  // Texture references
  textureMaps?: Record<string, string>;
}

export interface USDGeometry {
  type: 'sphere' | 'cube' | 'cylinder' | 'cone' | 'plane' | 'mesh';
  radius?: number;
  size?: [number, number, number];
  height?: number;
  /** Custom mesh data */
  points?: number[][];
  faceVertexCounts?: number[];
  faceVertexIndices?: number[];
}

export interface USDXform {
  name: string;
  translation?: [number, number, number];
  rotation?: [number, number, number]; // Euler angles in degrees
  scale?: [number, number, number];
  geometry?: USDGeometry;
  material?: string;
  children?: USDXform[];
}

export interface USDADocument {
  header: string;
  stage: string;
  materials: string;
  prims: string;
}

// =============================================================================
// USDZ PIPELINE
// =============================================================================

export class USDZPipeline {
  private options: Required<USDZPipelineOptions>;
  private materials: Map<string, USDMaterial> = new Map();
  private indentLevel: number = 0;

  constructor(options: USDZPipelineOptions = {}) {
    this.options = {
      upAxis: options.upAxis ?? 'Y',
      metersPerUnit: options.metersPerUnit ?? 1.0,
      includeAnimations: options.includeAnimations ?? false,
      exportMaterials: options.exportMaterials ?? true,
      defaultMaterial: options.defaultMaterial ?? 'DefaultMaterial',
      textureData: options.textureData ?? {},
    };
  }

  /**
   * Generate USDA from a HoloScript composition
   */
  generateUSDA(composition: HoloComposition): string {
    this.materials.clear();
    this.indentLevel = 0;

    const doc = this.buildDocument(composition);

    return [doc.header, doc.stage, doc.materials, doc.prims].join('\n\n');
  }

  /**
   * Generate a binary USDZ (uncompressed ZIP with 64-byte alignment)
   * containing the USDA file and any embedded texture data.
   */
  generateUSDZ(composition: HoloComposition): Uint8Array {
    const usda = this.generateUSDA(composition);
    const usdaBytes = new TextEncoder().encode(usda);
    const usdaName = `${this.sanitizeName(composition.name)}.usda`;

    const files: Array<{ name: string; data: Uint8Array }> = [{ name: usdaName, data: usdaBytes }];

    // Add texture files
    if (this.options.textureData) {
      for (const [path, data] of Object.entries(this.options.textureData)) {
        if (data && data.length > 0) {
          const texPath = path.startsWith('textures/') ? path : `textures/${path}`;
          files.push({ name: texPath, data });
        }
      }
    }

    return USDZPipeline.createUncompressedZip(files);
  }

  /**
   * Create an uncompressed ZIP with 64-byte aligned file data.
   * USDZ requires uncompressed storage and 64-byte alignment per Apple spec.
   */
  private static createUncompressedZip(
    files: Array<{ name: string; data: Uint8Array }>
  ): Uint8Array {
    const localHeaders: Array<{
      offset: number;
      nameBytes: Uint8Array;
      crc: number;
      size: number;
    }> = [];
    const chunks: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
      const nameBytes = new TextEncoder().encode(file.name);
      const crc = USDZPipeline.crc32(file.data);

      // Local file header (30 bytes + name + extra)
      const headerSize = 30 + nameBytes.length;
      // Calculate padding for 64-byte alignment of data
      const paddingNeeded = (64 - ((offset + headerSize) % 64)) % 64;
      const extraField = new Uint8Array(paddingNeeded);

      const header = new Uint8Array(30 + nameBytes.length + paddingNeeded);
      const view = new DataView(header.buffer);

      // Local file header signature
      view.setUint32(0, 0x04034b50, true);
      // Version needed to extract
      view.setUint16(4, 20, true);
      // General purpose bit flag
      view.setUint16(6, 0, true);
      // Compression method (0 = store)
      view.setUint16(8, 0, true);
      // Last mod time/date
      view.setUint16(10, 0, true);
      view.setUint16(12, 0, true);
      // CRC-32
      view.setUint32(14, crc, true);
      // Compressed size
      view.setUint32(18, file.data.length, true);
      // Uncompressed size
      view.setUint32(22, file.data.length, true);
      // File name length
      view.setUint16(26, nameBytes.length, true);
      // Extra field length
      view.setUint16(28, paddingNeeded, true);
      // File name
      header.set(nameBytes, 30);
      // Extra field (padding)
      header.set(extraField, 30 + nameBytes.length);

      localHeaders.push({ offset, nameBytes, crc, size: file.data.length });
      chunks.push(header);
      chunks.push(file.data);
      offset += header.length + file.data.length;
    }

    // Central directory
    const centralDirOffset = offset;
    for (let i = 0; i < files.length; i++) {
      const { nameBytes, crc, size } = localHeaders[i];
      const localOffset = localHeaders[i].offset;

      const entry = new Uint8Array(46 + nameBytes.length);
      const view = new DataView(entry.buffer);

      // Central directory file header signature
      view.setUint32(0, 0x02014b50, true);
      // Version made by
      view.setUint16(4, 20, true);
      // Version needed to extract
      view.setUint16(6, 20, true);
      // Flags
      view.setUint16(8, 0, true);
      // Compression method
      view.setUint16(10, 0, true);
      // Last mod time/date
      view.setUint16(12, 0, true);
      view.setUint16(14, 0, true);
      // CRC-32
      view.setUint32(16, crc, true);
      // Compressed size
      view.setUint32(20, size, true);
      // Uncompressed size
      view.setUint32(24, size, true);
      // File name length
      view.setUint16(28, nameBytes.length, true);
      // Extra field length
      view.setUint16(30, 0, true);
      // File comment length
      view.setUint16(32, 0, true);
      // Disk number start
      view.setUint16(34, 0, true);
      // Internal file attributes
      view.setUint16(36, 0, true);
      // External file attributes
      view.setUint32(38, 0, true);
      // Relative offset of local header
      view.setUint32(42, localOffset, true);
      // File name
      entry.set(nameBytes, 46);

      chunks.push(entry);
      offset += entry.length;
    }

    const centralDirSize = offset - centralDirOffset;

    // End of central directory record
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    // Signature
    eocdView.setUint32(0, 0x06054b50, true);
    // Disk number
    eocdView.setUint16(4, 0, true);
    // Disk where central dir starts
    eocdView.setUint16(6, 0, true);
    // Number of central dir records on this disk
    eocdView.setUint16(8, files.length, true);
    // Total number of central dir records
    eocdView.setUint16(10, files.length, true);
    // Size of central directory
    eocdView.setUint32(12, centralDirSize, true);
    // Offset of central directory
    eocdView.setUint32(16, centralDirOffset, true);
    // Comment length
    eocdView.setUint16(20, 0, true);

    chunks.push(eocd);
    offset += eocd.length;

    // Concatenate all chunks
    const result = new Uint8Array(offset);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }

    return result;
  }

  /**
   * Compute CRC-32 checksum for ZIP entries
   */
  private static crc32(data: Uint8Array): number {
    // Build CRC lookup table on first call
    if (!USDZPipeline._crc32Table) {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) {
          c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[i] = c;
      }
      USDZPipeline._crc32Table = table;
    }

    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
      crc = USDZPipeline._crc32Table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }
  private static _crc32Table: Uint32Array | null = null;

  /**
   * Build the complete USDA document
   */
  private buildDocument(composition: HoloComposition): USDADocument {
    // Collect materials from objects
    this.collectMaterials(composition);

    const header = this.generateHeader(composition.name);
    const stage = this.generateStageMetadata();
    const materials = this.options.exportMaterials ? this.generateMaterials() : '';
    const prims = this.generatePrims(composition);
    const domainBlocksOutput = this.generateDomainBlocks(composition);

    return {
      header,
      stage,
      materials: domainBlocksOutput ? `${materials}\n\n${domainBlocksOutput}` : materials,
      prims,
    };
  }

  /**
   * Generate USDA header
   */
  private generateHeader(name: string): string {
    return `#usda 1.0
(
    defaultPrim = "${this.sanitizeName(name)}"
    doc = "Generated by HoloScript USDZPipeline"
    metersPerUnit = ${this.options.metersPerUnit}
    upAxis = "${this.options.upAxis}"
)`;
  }

  /**
   * Generate stage metadata
   */
  private generateStageMetadata(): string {
    const lines: string[] = [];
    lines.push('# Stage Configuration');
    lines.push(`# Up Axis: ${this.options.upAxis}`);
    lines.push(`# Meters Per Unit: ${this.options.metersPerUnit}`);
    return lines.join('\n');
  }

  /**
   * Collect all materials from composition
   */
  private collectMaterials(composition: HoloComposition): void {
    // Add default material
    this.materials.set(this.options.defaultMaterial, {
      name: this.options.defaultMaterial,
      baseColor: [0.8, 0.8, 0.8],
      metallic: 0,
      roughness: 0.5,
    });

    // Collect from objects
    if (composition.objects) {
      for (const obj of composition.objects) {
        this.collectMaterialsFromObject(obj);
      }
    }

    // Collect from spatial groups
    if (composition.spatialGroups) {
      for (const group of composition.spatialGroups) {
        this.collectMaterialsFromGroup(group);
      }
    }
  }

  /**
   * Collect materials from a single object
   */
  private collectMaterialsFromObject(obj: HoloObjectDecl): void {
    const color = this.findProp(obj, 'color');
    const material = this.findProp(obj, 'material');
    const materialPreset = this.findProp(obj, 'materialPreset');
    const surface = this.findProp(obj, 'surface');

    if (color || material || materialPreset || surface) {
      const matName = `Material_${this.sanitizeName(obj.name)}`;
      const mat: USDMaterial = { name: matName };

      // 1. Named material preset (e.g., material: "glass")
      const presetName =
        typeof material === 'string'
          ? material
          : typeof materialPreset === 'string'
            ? materialPreset
            : undefined;
      if (presetName && MATERIAL_PRESETS[presetName]) {
        const preset = MATERIAL_PRESETS[presetName] as Record<string, unknown>;
        const colorStr = presetString(preset, 'color');
        if (colorStr) mat.baseColor = this.hexToRGB(colorStr);
        const metal = presetNumber(preset, 'metalness');
        if (metal !== undefined) mat.metallic = metal;
        const rough = presetNumber(preset, 'roughness');
        if (rough !== undefined) mat.roughness = rough;
        const op = presetNumber(preset, 'opacity');
        if (op !== undefined) mat.opacity = op;
        const emissiveStr = presetString(preset, 'emissive');
        if (emissiveStr) mat.emissiveColor = this.hexToRGB(emissiveStr);
        const emissiveInt = presetNumber(preset, 'emissiveIntensity');
        if (emissiveInt !== undefined) mat.emissiveIntensity = emissiveInt;
        const trans = presetNumber(preset, 'transmission');
        if (trans !== undefined) mat.transmission = trans;
        const ior = presetNumber(preset, 'ior');
        if (ior !== undefined) mat.ior = ior;
        const thick = presetNumber(preset, 'thickness');
        if (thick !== undefined) mat.thickness = thick;
        const cc = presetNumber(preset, 'clearcoat');
        if (cc !== undefined) mat.clearcoat = cc;
        const ccr = presetNumber(preset, 'clearcoatRoughness');
        if (ccr !== undefined) mat.clearcoatRoughness = ccr;
        const sheen = presetNumber(preset, 'sheen');
        if (sheen !== undefined) mat.sheen = sheen;
        const sheenR = presetNumber(preset, 'sheenRoughness');
        if (sheenR !== undefined) mat.sheenRoughness = sheenR;
        const sheenColorStr = presetString(preset, 'sheenColor');
        if (sheenColorStr) mat.sheenColor = this.hexToRGB(sheenColorStr);
        const irid = presetNumber(preset, 'iridescence');
        if (irid !== undefined) mat.iridescence = irid;
        const iridIor = presetNumber(preset, 'iridescenceIOR');
        if (iridIor !== undefined) mat.iridescenceIOR = iridIor;
        const aniso = presetNumber(preset, 'anisotropy');
        if (aniso !== undefined) mat.anisotropy = aniso;
        const anisoRot = presetNumber(preset, 'anisotropyRotation');
        if (anisoRot !== undefined) mat.anisotropyRotation = anisoRot;
        const attColorStr = presetString(preset, 'attenuationColor');
        if (attColorStr) mat.attenuationColor = this.hexToRGB(attColorStr);
        const attDist = presetNumber(preset, 'attenuationDistance');
        if (attDist !== undefined) mat.attenuationDistance = attDist;
        if (presetBoolean(preset, 'transparent') && mat.opacity === undefined) mat.opacity = 0.99;
      }

      // 2. Direct color override
      if (typeof color === 'string') {
        mat.baseColor = this.hexToRGB(color);
      } else if (Array.isArray(color)) {
        mat.baseColor = color as [number, number, number];
      }

      // 3. Material object (inline material definition)
      if (typeof material === 'object' && material !== null) {
        const m = material as Record<string, unknown>;
        if (m.color) mat.baseColor = this.parseColor(m.color);
        if (typeof m.metalness === 'number') mat.metallic = m.metalness;
        if (typeof m.roughness === 'number') mat.roughness = m.roughness;
        if (m.emissive) mat.emissiveColor = this.parseColor(m.emissive);
        if (typeof m.opacity === 'number') mat.opacity = m.opacity;
        if (typeof m.clearcoat === 'number') mat.clearcoat = m.clearcoat;
        if (typeof m.clearcoatRoughness === 'number') mat.clearcoatRoughness = m.clearcoatRoughness;
        if (typeof m.transmission === 'number') mat.transmission = m.transmission;
        if (typeof m.ior === 'number') mat.ior = m.ior;
        if (typeof m.thickness === 'number') mat.thickness = m.thickness;
      }

      // 4. Legacy surface presets (backward compatibility)
      if (surface === 'metal') {
        mat.metallic = 1.0;
        mat.roughness = 0.2;
      } else if (surface === 'glass') {
        mat.opacity = 0.1;
        mat.roughness = 0.0;
        mat.ior = 1.5;
        mat.transmission = 0.95;
      } else if (surface === 'plastic') {
        mat.metallic = 0;
        mat.roughness = 0.5;
      } else if (surface === 'emissive' || surface === 'hologram') {
        mat.emissiveColor = mat.baseColor || [1, 1, 1];
      }

      // 5. Collect texture maps from object properties
      const textureMaps: Record<string, string> = {};
      for (const prop of obj.properties || []) {
        if (
          typeof prop.value === 'string' &&
          (prop.key.endsWith('Map') || prop.key.endsWith('_map'))
        ) {
          if (!prop.value.startsWith('#') && !prop.value.startsWith('rgb')) {
            textureMaps[prop.key] = prop.value;
          }
        }
      }
      if (Object.keys(textureMaps).length > 0) {
        mat.textureMaps = textureMaps;
      }

      this.materials.set(matName, mat);
    }

    // Recurse into children
    if (obj.children) {
      for (const child of obj.children) {
        this.collectMaterialsFromObject(child);
      }
    }
  }

  /**
   * Collect materials from spatial group
   */
  private collectMaterialsFromGroup(group: HoloSpatialGroup): void {
    for (const obj of group.objects) {
      this.collectMaterialsFromObject(obj);
    }
    if (group.groups) {
      for (const sub of group.groups) {
        this.collectMaterialsFromGroup(sub);
      }
    }
  }

  // Texture channel mapping: HoloScript → USD UsdPreviewSurface input name
  private static readonly TEXTURE_CHANNEL_MAP: Record<
    string,
    { input: string; type: 'color3f' | 'float' | 'normal3f' }
  > = {
    albedo_map: { input: 'diffuseColor', type: 'color3f' },
    baseColorMap: { input: 'diffuseColor', type: 'color3f' },
    normal_map: { input: 'normal', type: 'normal3f' },
    normalMap: { input: 'normal', type: 'normal3f' },
    roughness_map: { input: 'roughness', type: 'float' },
    roughnessMap: { input: 'roughness', type: 'float' },
    metallic_map: { input: 'metallic', type: 'float' },
    metallicMap: { input: 'metallic', type: 'float' },
    ao_map: { input: 'occlusion', type: 'float' },
    occlusionMap: { input: 'occlusion', type: 'float' },
    ambientOcclusionMap: { input: 'occlusion', type: 'float' },
    emission_map: { input: 'emissiveColor', type: 'color3f' },
    emissiveMap: { input: 'emissiveColor', type: 'color3f' },
    displacement_map: { input: 'displacement', type: 'float' },
    displacementMap: { input: 'displacement', type: 'float' },
    heightMap: { input: 'displacement', type: 'float' },
  };

  /**
   * Generate all materials
   */
  private generateMaterials(): string {
    const lines: string[] = [];
    lines.push('# Materials');

    for (const [name, mat] of this.materials) {
      lines.push('');
      lines.push(`def Material "${name}"`);
      lines.push('{');

      // Surface shader output connection
      lines.push(`    token outputs:surface.connect = </${name}/PBRShader.outputs:surface>`);
      lines.push('');

      // Resolve texture connections
      const textureConnections = this.resolveTextureConnections(mat);

      // PBR Shader
      lines.push(`    def Shader "PBRShader"`);
      lines.push('    {');
      lines.push('        uniform token info:id = "UsdPreviewSurface"');

      // diffuseColor — may be connected to texture
      if (textureConnections.has('diffuseColor')) {
        lines.push(
          `        color3f inputs:diffuseColor.connect = </${name}/${textureConnections.get('diffuseColor')}.outputs:rgb>`
        );
      } else if (mat.baseColor) {
        lines.push(
          `        color3f inputs:diffuseColor = (${mat.baseColor[0]}, ${mat.baseColor[1]}, ${mat.baseColor[2]})`
        );
      }

      // metallic — may be connected to texture
      if (textureConnections.has('metallic')) {
        lines.push(
          `        float inputs:metallic.connect = </${name}/${textureConnections.get('metallic')}.outputs:r>`
        );
      } else {
        lines.push(`        float inputs:metallic = ${mat.metallic ?? 0}`);
      }

      // roughness — may be connected to texture
      if (textureConnections.has('roughness')) {
        lines.push(
          `        float inputs:roughness.connect = </${name}/${textureConnections.get('roughness')}.outputs:r>`
        );
      } else {
        lines.push(`        float inputs:roughness = ${mat.roughness ?? 0.5}`);
      }

      // emissiveColor — scale by emissiveIntensity (USD has no separate intensity)
      if (textureConnections.has('emissiveColor')) {
        lines.push(
          `        color3f inputs:emissiveColor.connect = </${name}/${textureConnections.get('emissiveColor')}.outputs:rgb>`
        );
      } else if (mat.emissiveColor) {
        const intensity = mat.emissiveIntensity ?? 1;
        const scaled: [number, number, number] = [
          Math.min(1, mat.emissiveColor[0] * intensity),
          Math.min(1, mat.emissiveColor[1] * intensity),
          Math.min(1, mat.emissiveColor[2] * intensity),
        ];
        lines.push(
          `        color3f inputs:emissiveColor = (${scaled[0]}, ${scaled[1]}, ${scaled[2]})`
        );
      }

      // opacity
      if (mat.opacity !== undefined && mat.opacity < 1) {
        lines.push(`        float inputs:opacity = ${mat.opacity}`);
      }
      if (mat.transmission && mat.transmission > 0) {
        lines.push(`        float inputs:opacityThreshold = 0`);
      }

      // ior
      if (mat.ior !== undefined) {
        lines.push(`        float inputs:ior = ${mat.ior}`);
      }

      // clearcoat (native UsdPreviewSurface)
      if (mat.clearcoat !== undefined && mat.clearcoat > 0) {
        lines.push(`        float inputs:clearcoat = ${mat.clearcoat}`);
      }
      if (mat.clearcoatRoughness !== undefined && mat.clearcoat && mat.clearcoat > 0) {
        lines.push(`        float inputs:clearcoatRoughness = ${mat.clearcoatRoughness}`);
      }

      // normal — may be connected to texture
      if (textureConnections.has('normal')) {
        lines.push(
          `        normal3f inputs:normal.connect = </${name}/${textureConnections.get('normal')}.outputs:rgb>`
        );
      }

      // occlusion — may be connected to texture
      if (textureConnections.has('occlusion')) {
        lines.push(
          `        float inputs:occlusion.connect = </${name}/${textureConnections.get('occlusion')}.outputs:r>`
        );
      }

      // displacement — may be connected to texture
      if (textureConnections.has('displacement')) {
        lines.push(
          `        float inputs:displacement.connect = </${name}/${textureConnections.get('displacement')}.outputs:r>`
        );
      }

      lines.push('        token outputs:surface');
      lines.push('    }');

      // Generate texture reader nodes
      if (mat.textureMaps && Object.keys(mat.textureMaps).length > 0) {
        lines.push('');
        lines.push(...this.generateTextureReaders(name, mat));
      }

      // Metadata comments for properties not natively supported by UsdPreviewSurface
      if (mat.transmission && mat.transmission > 0) {
        lines.push(`    # HoloScript:transmission = ${mat.transmission}`);
      }
      if (mat.thickness && mat.thickness > 0) {
        lines.push(`    # HoloScript:thickness = ${mat.thickness}`);
      }
      if (mat.attenuationColor) {
        lines.push(
          `    # HoloScript:attenuationColor = (${mat.attenuationColor[0]}, ${mat.attenuationColor[1]}, ${mat.attenuationColor[2]})`
        );
      }
      if (mat.attenuationDistance !== undefined) {
        lines.push(`    # HoloScript:attenuationDistance = ${mat.attenuationDistance}`);
      }
      if (mat.sheen && mat.sheen > 0) {
        lines.push(`    # HoloScript:sheen = ${mat.sheen}`);
        if (mat.sheenRoughness !== undefined)
          lines.push(`    # HoloScript:sheenRoughness = ${mat.sheenRoughness}`);
        if (mat.sheenColor)
          lines.push(
            `    # HoloScript:sheenColor = (${mat.sheenColor[0]}, ${mat.sheenColor[1]}, ${mat.sheenColor[2]})`
          );
      }
      if (mat.iridescence && mat.iridescence > 0) {
        lines.push(`    # HoloScript:iridescence = ${mat.iridescence}`);
        if (mat.iridescenceIOR !== undefined)
          lines.push(`    # HoloScript:iridescenceIOR = ${mat.iridescenceIOR}`);
      }
      if (mat.anisotropy && mat.anisotropy > 0) {
        lines.push(`    # HoloScript:anisotropy = ${mat.anisotropy}`);
        if (mat.anisotropyRotation !== undefined)
          lines.push(`    # HoloScript:anisotropyRotation = ${mat.anisotropyRotation}`);
      }

      lines.push('}');
    }

    return lines.join('\n');
  }

  /**
   * Resolve which PBR inputs should be connected to textures
   */
  private resolveTextureConnections(mat: USDMaterial): Map<string, string> {
    const connections = new Map<string, string>();
    if (!mat.textureMaps) return connections;

    for (const [channel] of Object.entries(mat.textureMaps)) {
      const mapping = USDZPipeline.TEXTURE_CHANNEL_MAP[channel];
      if (mapping && !connections.has(mapping.input)) {
        const readerName = `${mapping.input}Texture`;
        connections.set(mapping.input, readerName);
      }
    }
    return connections;
  }

  /**
   * Generate UsdUVTexture reader nodes for material textures
   */
  private generateTextureReaders(matName: string, mat: USDMaterial): string[] {
    const lines: string[] = [];
    if (!mat.textureMaps) return lines;

    // ST reader (shared across all textures)
    lines.push(`    def Shader "stReader"`);
    lines.push('    {');
    lines.push('        uniform token info:id = "UsdPrimvarReader_float2"');
    lines.push('        token inputs:varname = "st"');
    lines.push('        float2 outputs:result');
    lines.push('    }');

    const emitted = new Set<string>();
    for (const [channel, path] of Object.entries(mat.textureMaps)) {
      const mapping = USDZPipeline.TEXTURE_CHANNEL_MAP[channel];
      if (!mapping || emitted.has(mapping.input)) continue;
      emitted.add(mapping.input);

      const readerName = `${mapping.input}Texture`;
      const texPath = path.startsWith('textures/') ? path : `textures/${path}`;

      lines.push('');
      lines.push(`    def Shader "${readerName}"`);
      lines.push('    {');
      lines.push('        uniform token info:id = "UsdUVTexture"');
      lines.push(`        asset inputs:file = @${texPath}@`);
      lines.push(`        float2 inputs:st.connect = </${matName}/stReader.outputs:result>`);

      if (mapping.type === 'color3f' || mapping.type === 'normal3f') {
        lines.push('        color3f outputs:rgb');
      } else {
        lines.push('        float outputs:r');
      }

      lines.push('    }');
    }

    return lines;
  }

  /**
   * Generate all prims (scene hierarchy)
   */
  private generatePrims(composition: HoloComposition): string {
    const lines: string[] = [];
    const rootName = this.sanitizeName(composition.name);

    lines.push('# Scene Hierarchy');
    lines.push('');
    lines.push(`def Xform "${rootName}" (`);
    lines.push('    kind = "assembly"');
    lines.push(')');
    lines.push('{');

    this.indentLevel = 1;

    // Generate objects
    if (composition.objects) {
      for (const obj of composition.objects) {
        lines.push(...this.generateObjectPrim(obj, rootName));
      }
    }

    // Generate spatial groups
    if (composition.spatialGroups) {
      for (const group of composition.spatialGroups) {
        lines.push(...this.generateGroupPrim(group, rootName));
      }
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Generate a single object prim
   */
  private generateObjectPrim(obj: HoloObjectDecl, parentPath: string): string[] {
    const lines: string[] = [];
    const name = this.sanitizeName(obj.name);
    const indent = '    '.repeat(this.indentLevel);
    const primPath = `${parentPath}/${name}`;

    const mesh = this.findProp(obj, 'mesh') || this.findProp(obj, 'type') || 'cube';
    const position = this.findProp(obj, 'position') as number[] | undefined;
    const rotation = this.findProp(obj, 'rotation') as number[] | undefined;
    const scale = this.findProp(obj, 'scale');
    const model = this.findProp(obj, 'model') || this.findProp(obj, 'src');

    lines.push('');
    lines.push(`${indent}def Xform "${name}"`);
    lines.push(`${indent}{`);

    // Transform
    if (position) {
      lines.push(
        `${indent}    double3 xformOp:translate = (${position[0]}, ${position[1]}, ${position[2]})`
      );
    }

    if (rotation) {
      // Convert degrees to radians for USD
      lines.push(
        `${indent}    float3 xformOp:rotateXYZ = (${rotation[0]}, ${rotation[1]}, ${rotation[2]})`
      );
    }

    if (scale) {
      if (Array.isArray(scale)) {
        lines.push(`${indent}    float3 xformOp:scale = (${scale[0]}, ${scale[1]}, ${scale[2]})`);
      } else {
        lines.push(`${indent}    float3 xformOp:scale = (${scale}, ${scale}, ${scale})`);
      }
    }

    const ops: string[] = [];
    if (position) ops.push('"xformOp:translate"');
    if (rotation) ops.push('"xformOp:rotateXYZ"');
    if (scale) ops.push('"xformOp:scale"');
    if (ops.length > 0) {
      lines.push(`${indent}    uniform token[] xformOpOrder = [${ops.join(', ')}]`);
    }

    // Reference external model
    if (model) {
      lines.push(`${indent}    # External model reference: ${model}`);
      lines.push(
        `${indent}    # prepend references = @${model}@</DefaultPrim> (requires asset bundling)`
      );
    } else {
      // Generate geometry
      lines.push(...this.generateGeometry(mesh as string, obj, indent + '    '));
    }

    // Material binding
    const matName = `Material_${name}`;
    if (this.materials.has(matName)) {
      lines.push(`${indent}    rel material:binding = </${matName}>`);
    } else {
      lines.push(`${indent}    rel material:binding = </${this.options.defaultMaterial}>`);
    }

    // Children
    if (obj.children) {
      this.indentLevel++;
      for (const child of obj.children) {
        lines.push(...this.generateObjectPrim(child, primPath));
      }
      this.indentLevel--;
    }

    lines.push(`${indent}}`);

    return lines;
  }

  /**
   * Generate geometry prim
   */
  private generateGeometry(meshType: string, obj: HoloObjectDecl, indent: string): string[] {
    const lines: string[] = [];
    const size = this.findProp(obj, 'size');
    const radius = (this.findProp(obj, 'radius') as number) ?? 0.5;

    switch (meshType) {
      case 'sphere':
        lines.push(`${indent}def Sphere "Geometry"`);
        lines.push(`${indent}{`);
        lines.push(`${indent}    double radius = ${radius}`);
        lines.push(`${indent}}`);
        break;

      case 'cube':
      case 'box':
        const boxSize = Array.isArray(size) ? size : [1, 1, 1];
        lines.push(`${indent}def Cube "Geometry"`);
        lines.push(`${indent}{`);
        lines.push(`${indent}    double size = ${Math.max(...(boxSize as number[]))}`);
        lines.push(`${indent}}`);
        break;

      case 'cylinder':
        const cylRadius = radius;
        const cylHeight = Array.isArray(size) ? (size as number[])[1] : 1;
        lines.push(`${indent}def Cylinder "Geometry"`);
        lines.push(`${indent}{`);
        lines.push(`${indent}    double height = ${cylHeight}`);
        lines.push(`${indent}    double radius = ${cylRadius}`);
        lines.push(`${indent}}`);
        break;

      case 'cone':
        const coneRadius = radius;
        const coneHeight = Array.isArray(size) ? (size as number[])[1] : 1;
        lines.push(`${indent}def Cone "Geometry"`);
        lines.push(`${indent}{`);
        lines.push(`${indent}    double height = ${coneHeight}`);
        lines.push(`${indent}    double radius = ${coneRadius}`);
        lines.push(`${indent}}`);
        break;

      case 'plane':
        const planeSize = typeof size === 'number' ? size : 1;
        lines.push(`${indent}def Mesh "Geometry"`);
        lines.push(`${indent}{`);
        lines.push(`${indent}    int[] faceVertexCounts = [4]`);
        lines.push(`${indent}    int[] faceVertexIndices = [0, 1, 2, 3]`);
        const half = planeSize / 2;
        lines.push(
          `${indent}    point3f[] points = [(${-half}, 0, ${-half}), (${half}, 0, ${-half}), (${half}, 0, ${half}), (${-half}, 0, ${half})]`
        );
        lines.push(`${indent}}`);
        break;

      case 'text':
        // Text requires mesh generation or font support
        const text = this.findProp(obj, 'text') || 'Text';
        lines.push(`${indent}# Text: "${text}" — requires font rasterization`);
        lines.push(`${indent}# Use MeshResource.generateText in RealityKit`);
        break;

      default:
        lines.push(`${indent}# Unsupported geometry type: ${meshType}`);
        lines.push(`${indent}def Cube "Geometry"`);
        lines.push(`${indent}{`);
        lines.push(`${indent}    double size = 1.0`);
        lines.push(`${indent}}`);
    }

    return lines;
  }

  /**
   * Generate spatial group prim
   */
  private generateGroupPrim(group: HoloSpatialGroup, parentPath: string): string[] {
    const lines: string[] = [];
    const name = this.sanitizeName(group.name);
    const indent = '    '.repeat(this.indentLevel);
    const primPath = `${parentPath}/${name}`;

    lines.push('');
    lines.push(`${indent}def Xform "${name}"`);
    lines.push(`${indent}{`);

    const position = group.properties.find((p) => p.key === 'position')?.value as
      | number[]
      | undefined;
    if (position) {
      lines.push(
        `${indent}    double3 xformOp:translate = (${position[0]}, ${position[1]}, ${position[2]})`
      );
      lines.push(`${indent}    uniform token[] xformOpOrder = ["xformOp:translate"]`);
    }

    this.indentLevel++;
    for (const obj of group.objects) {
      lines.push(...this.generateObjectPrim(obj, primPath));
    }

    if (group.groups) {
      for (const sub of group.groups) {
        lines.push(...this.generateGroupPrim(sub, primPath));
      }
    }
    this.indentLevel--;

    lines.push(`${indent}}`);

    return lines;
  }

  // =============================================================================
  // HELPERS
  // =============================================================================

  private findProp(obj: HoloObjectDecl, key: string): HoloValue | undefined {
    return obj.properties?.find((p) => p.key === key)?.value;
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1');
  }

  private hexToRGB(hex: string): [number, number, number] {
    const h = hex.startsWith('#') ? hex.slice(1) : hex;
    const r = parseInt(h.substring(0, 2), 16) / 255;
    const g = parseInt(h.substring(2, 4), 16) / 255;
    const b = parseInt(h.substring(4, 6), 16) / 255;
    return [r, g, b];
  }

  private parseColor(value: unknown): [number, number, number] {
    if (typeof value === 'string') {
      return this.hexToRGB(value);
    }
    if (Array.isArray(value) && value.length >= 3) {
      return [value[0], value[1], value[2]];
    }
    return [1, 1, 1];
  }

  /**
   * v4.2: Generate USD domain blocks (materials, physics, particles, post-fx, audio, weather)
   */
  private generateDomainBlocks(composition: HoloComposition): string {
    const domainBlocks = composition.domainBlocks ?? [];
    if (domainBlocks.length === 0) return '';

    const compiled = compileDomainBlocks(
      domainBlocks,
      {
        material: (block) => {
          const mat = compileMaterialBlock(block);
          return materialToUSD(mat);
        },
        physics: (block) => {
          const phys = compilePhysicsBlock(block);
          return `# Physics: ${phys.keyword} "${phys.name || ''}" — ${JSON.stringify(phys.properties)}`;
        },
        vfx: (block) => {
          const ps = compileParticleBlock(block);
          return particlesToUSD(ps);
        },
        postfx: (block) => {
          const pp = compilePostProcessingBlock(block);
          return postProcessingToUSD(pp);
        },
        audio: (block) => {
          const audio = compileAudioSourceBlock(block);
          return audioSourceToUSD(audio);
        },
        weather: (block) => {
          const weather = compileWeatherBlock(block);
          return weatherToUSD(weather);
        },
        narrative: (block) => {
          const narr = compileNarrativeBlock(block);
          return narrativeToUSDA(narr);
        },
        payment: (block) => {
          const pay = compilePaymentBlock(block);
          return paymentToUSDA(pay);
        },
        healthcare: (block) => {
          const h = compileHealthcareBlock(block);
          return healthcareToUSDA(h);
        },
        robotics: (block) => {
          const r = compileRoboticsBlock(block);
          return roboticsToUSDA(r);
        },
        iot: (block) => iotToUSDA(compileIoTBlock(block)),
        dataviz: (block) => datavizToUSDA(compileDataVizBlock(block)),
        education: (block) => educationToUSDA(compileEducationBlock(block)),
        music: (block) => musicToUSDA(compileMusicBlock(block)),
        architecture: (block) => architectureToUSDA(compileArchitectureBlock(block)),
        web3: (block) => web3ToUSDA(compileWeb3Block(block)),
        procedural: (block) => proceduralToUSDA(compileProceduralBlock(block)),
        rendering: (block) => renderingToUSDA(compileRenderingBlock(block)),
        navigation: (block) => navigationToUSDA(compileNavigationBlock(block)),
        input: (block) => inputToUSDA(compileInputBlock(block)),
      },
      (block) => `# Domain block: ${block.domain}/${block.keyword} "${block.name}"`
    );

    return `# === v4.2 Domain Blocks ===\n${compiled.join('\n\n')}`;
  }
}

// =============================================================================
// EXPORT FUNCTIONS
// =============================================================================

/**
 * Generate USDA from composition
 */
export function generateUSDA(composition: HoloComposition, options?: USDZPipelineOptions): string {
  const pipeline = new USDZPipeline(options);
  return pipeline.generateUSDA(composition);
}

/**
 * Generate binary USDZ from composition
 */
export function generateUSDZ(
  composition: HoloComposition,
  options?: USDZPipelineOptions
): Uint8Array {
  const pipeline = new USDZPipeline(options);
  return pipeline.generateUSDZ(composition);
}

/**
 * Generate conversion command for usdz_converter
 */
export function getUSDZConversionCommand(usdaPath: string, usdzPath: string): string {
  return `xcrun usdz_converter "${usdaPath}" "${usdzPath}"`;
}

/**
 * Generate Python script for USD conversion
 */
export function getPythonConversionScript(usdaPath: string, usdzPath: string): string {
  return `#!/usr/bin/env python3
from pxr import Usd, UsdUtils

# Convert USDA to USDZ
stage = Usd.Stage.Open("${usdaPath}")
UsdUtils.CreateNewUsdzPackage("${usdaPath}", "${usdzPath}")
print(f"Converted {usdaPath} to {usdzPath}")
`;
}
