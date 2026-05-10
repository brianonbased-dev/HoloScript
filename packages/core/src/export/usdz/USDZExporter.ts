/**
 * USDZ Exporter
 *
 * Exports HoloScript scene graphs to USDZ format for Apple Vision Pro and AR Quick Look.
 * Converts GLTF intermediate representation to USD, applies MaterialX materials,
 * and packages into USDZ archive.
 *
 * @module export/usdz
 * @version 1.0.0
 */

import type { ISceneGraph, IMaterial, IMesh, IAnimation, IAnimationChannel, IAnimationSampler, ISceneNode, ITransform, IComponent, ITextureRef, IBuffer, IBufferView, IAccessor } from '../SceneGraph';
import type {
  IGLTFExportResult,
  IGLTFDocument,
  IGLTFNode,
  IGLTFMesh,
  IGLTFMeshPrimitive,
  IGLTFAccessor,
  IGLTFBufferView,
  IGLTFBuffer,
  IGLTFMaterial,
  IGLTFPBRMetallicRoughness,
  IGLTFAnimation,
  IGLTFAnimationChannel,
  IGLTFAnimationSampler,
  GLTFComponentType,
  GLTFAccessorType,
  GLTFPrimitiveMode,
} from '../gltf/GLTFTypes';
import type {
  IUSDStage,
  IUSDPrim,
  IUSDMesh,
  IUSDMaterial,
  IUSDShader,
  IUSDAttribute,
  IUSDXformOp,
  IUSDZPackage,
  IUSDZFileEntry,
  IARQuickLookMetadata,
  IGLTFToUSDMaterialMapping,
  IUSDPreviewSurfaceInputs,
} from './USDTypes';
import {
  createUSDXform,
  createUSDPreviewSurfaceMaterial,
  quaternionToEuler,
  sanitizeUSDName,
} from './USDTypes';
import type { USDAttributeType } from './USDTypes';

// ============================================================================
// Export Types (re-exported from USDTypes to break cycle with GLTFExporter)
// ============================================================================

export type { IUSDZExportOptions, IUSDZExportResult, IUSDZExportStats } from './USDTypes';
import type { IUSDZExportOptions, IUSDZExportResult, IUSDZExportStats } from './USDTypes';

// ============================================================================
// USDZExporter Class
// ============================================================================

export class USDZExporter {
  private options: Required<IUSDZExportOptions>;
  private stage!: IUSDStage;
  private primCounter = 0;
  private materialMap = new Map<string, string>(); // materialId -> USD path
  private meshMap = new Map<string, string>(); // meshId -> USD path
  private nodePrimMap = new Map<string, IUSDPrim>(); // nodeId -> USD prim
  private sceneGraphAccessorData = new Map<number, number[]>(); // accessorIndex -> flat data
  private textureFiles: IUSDZFileEntry[] = [];

  private static readonly DEFAULT_OPTIONS: Required<IUSDZExportOptions> = {
    includeAudio: false,
    lookAtCamera: false,
    placementMode: 'floor',
    materialQuality: 'standard',
    includeAnimations: true,
    realityComposerMode: false,
    metersPerUnit: 1.0,
    upAxis: 'Y',
    enableOcclusion: true,
    allowContentScaling: true,
    canonicalCameraDistance: 2.5,
  };

  constructor(options: IUSDZExportOptions = {}) {
    this.options = { ...USDZExporter.DEFAULT_OPTIONS, ...options };
  }

  /**
   * Export scene graph to USDZ format
   * Returns ArrayBuffer containing .usdz package
   */
  async export(sceneGraph: ISceneGraph): Promise<IUSDZExportResult> {
    const startTime = performance.now();

    // Reset state
    this.reset();

    // Step 1: Create USD stage
    this.stage = this.createStage(sceneGraph);

    // Step 2: Convert scene hierarchy
    await this.convertSceneGraph(sceneGraph);

    // Step 3: Add AR metadata
    if (this.options.lookAtCamera || this.options.placementMode) {
      this.addARMetadata();
    }

    // Step 4: Package USDZ
    const usdzBuffer = await this.packageUSDZ();

    const endTime = performance.now();
    const stats = this.calculateStats(usdzBuffer.byteLength, endTime - startTime);

    return {
      usdz: usdzBuffer,
      stage: this.stage,
      stats,
    };
  }

  /**
   * Convert from GLTF intermediate representation
   */
  async convertFromGLTF(gltfResult: IGLTFExportResult): Promise<ArrayBuffer> {
    const sceneGraph = this.gltfToSceneGraph(gltfResult);
    const result = await this.export(sceneGraph);
    return result.usdz;
  }

  // ========================================================================
  // Private Methods - GLTF Bridge
  // ========================================================================

  private gltfToSceneGraph(gltfResult: IGLTFExportResult): ISceneGraph {
    const doc = gltfResult.document;

    // Extract binary buffer data from GLB or resources
    const buffers = this.extractGLTFBuffers(gltfResult);

    // Map GLTF buffers -> SceneGraph buffers
    const sgBuffers: IBuffer[] = buffers.map((data, i) => ({
      id: `buf_${i}`,
      byteLength: data.byteLength,
      data,
    }));

    // Map GLTF bufferViews -> SceneGraph bufferViews
    const sgBufferViews: IBufferView[] = (doc.bufferViews || []).map((bv, i) => ({
      id: `bv_${i}`,
      bufferIndex: bv.buffer,
      byteOffset: bv.byteOffset || 0,
      byteLength: bv.byteLength,
      byteStride: bv.byteStride,
      target:
        bv.target === 34962
          ? 'arrayBuffer'
          : bv.target === 34963
            ? 'elementArrayBuffer'
            : undefined,
    }));

    // Map GLTF accessors -> SceneGraph accessors
    const componentTypeMap: Record<number, string> = {
      5120: 'byte',
      5121: 'ubyte',
      5122: 'short',
      5123: 'ushort',
      5125: 'uint',
      5126: 'float',
    };
    const accessorTypeMap: Record<string, string> = {
      SCALAR: 'scalar',
      VEC2: 'vec2',
      VEC3: 'vec3',
      VEC4: 'vec4',
      MAT2: 'mat2',
      MAT3: 'mat3',
      MAT4: 'mat4',
    };
    const sgAccessors: IAccessor[] = (doc.accessors || []).map((acc, i) => ({
      id: `acc_${i}`,
      bufferViewIndex: acc.bufferView !== undefined ? acc.bufferView : 0,
      byteOffset: acc.byteOffset || 0,
      componentType: (componentTypeMap[acc.componentType] || 'float') as IAccessor['componentType'],
      type: (accessorTypeMap[acc.type] || 'scalar') as IAccessor['type'],
      count: acc.count,
      normalized: acc.normalized || false,
      min: acc.min,
      max: acc.max,
    }));

    // Map GLTF meshes -> SceneGraph meshes
    const sgMeshes: IMesh[] = (doc.meshes || []).map((mesh, i) => ({
      id: `mesh_${i}`,
      name: mesh.name || `Mesh_${i}`,
      primitives: mesh.primitives.map((prim) => ({
        attributes: { ...prim.attributes } as Record<string, number>,
        indices: prim.indices,
        mode: this.mapGLTFPrimitiveMode(prim.mode) as import('../SceneGraph').PrimitiveMode,
        materialRef: prim.material !== undefined ? `mat_${prim.material}` : undefined,
      })),
      bounds: { min: [0, 0, 0], max: [1, 1, 1] },
    }));

    // Map GLTF materials -> SceneGraph materials
    const sgMaterials: IMaterial[] = (doc.materials || []).map((mat, i) => {
      const pbr = mat.pbrMetallicRoughness;
      return {
        id: `mat_${i}`,
        name: mat.name || `Material_${i}`,
        type: 'pbr',
        doubleSided: mat.doubleSided || false,
        alphaMode: (mat.alphaMode?.toLowerCase() || 'opaque') as 'opaque' | 'mask' | 'blend',
        alphaCutoff: mat.alphaCutoff ?? 0.5,
        baseColor: (pbr?.baseColorFactor || [1, 1, 1, 1]) as [number, number, number, number],
        metallic: pbr?.metallicFactor ?? 0,
        roughness: pbr?.roughnessFactor ?? 0.5,
        emissiveColor: (mat.emissiveFactor || [0, 0, 0]) as [number, number, number],
        emissiveIntensity: 1,
        normalScale: mat.normalTexture?.scale ?? 1,
        occlusionStrength: mat.occlusionTexture?.strength ?? 1,
        baseColorTexture: pbr?.baseColorTexture
          ? this.mapGLTFTextureRef(pbr.baseColorTexture.index, pbr.baseColorTexture.texCoord || 0)
          : undefined,
        normalTexture: mat.normalTexture
          ? this.mapGLTFTextureRef(mat.normalTexture.index, mat.normalTexture.texCoord || 0)
          : undefined,
        occlusionTexture: mat.occlusionTexture
          ? this.mapGLTFTextureRef(mat.occlusionTexture.index, mat.occlusionTexture.texCoord || 0)
          : undefined,
        emissiveTexture: mat.emissiveTexture
          ? this.mapGLTFTextureRef(mat.emissiveTexture.index, mat.emissiveTexture.texCoord || 0)
          : undefined,
        metallicRoughnessTexture: pbr?.metallicRoughnessTexture
          ? this.mapGLTFTextureRef(pbr.metallicRoughnessTexture.index, pbr.metallicRoughnessTexture.texCoord || 0)
          : undefined,
      };
    });

    // Map GLTF nodes -> SceneGraph nodes
    const nodeIdMap = new Map<number, string>();
    const buildNode = (gltfNode: IGLTFNode, index: number): ISceneNode => {
      const id = `node_${index}`;
      nodeIdMap.set(index, id);
      const children: ISceneNode[] = (gltfNode.children || []).map((ci) =>
        buildNode(doc.nodes![ci], ci)
      );
      const components: IComponent[] = [];
      if (gltfNode.mesh !== undefined) {
        components.push({
          type: 'mesh',
          meshRef: `mesh_${gltfNode.mesh}`,
          materialRefs: [],
          castShadows: true,
          receiveShadows: true,
          enabled: true,
          properties: {},
        } as IComponent);
      }
      return {
        id,
        name: gltfNode.name || `Node_${index}`,
        type: 'object',
        transform: {
          position: (gltfNode.translation || [0, 0, 0]) as [number, number, number],
          rotation: gltfNode.rotation
            ? {
                x: gltfNode.rotation[0],
                y: gltfNode.rotation[1],
                z: gltfNode.rotation[2],
                w: gltfNode.rotation[3],
              }
            : { x: 0, y: 0, z: 0, w: 1 },
          scale: (gltfNode.scale || [1, 1, 1]) as [number, number, number],
        },
        children,
        components,
        active: true,
        layers: 1,
        tags: [],
        metadata: {},
      };
    };

    const scene = doc.scenes?.[doc.scene ?? 0];
    const rootChildren = (scene?.nodes || []).map((ni) => buildNode(doc.nodes![ni], ni));
    const root: ISceneNode = {
      id: 'root',
      name: 'Root',
      type: 'group',
      transform: {
        position: [0, 0, 0],
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: [1, 1, 1],
      },
      children: rootChildren,
      components: [],
      active: true,
      layers: 1,
      tags: [],
      metadata: {},
    };

    // Map GLTF animations -> SceneGraph animations
    const sgAnimations: IAnimation[] = (doc.animations || []).map((anim, i) => {
      const channels = anim.channels.map((ch) => ({
        targetNode: nodeIdMap.get(ch.target.node!) || `node_${ch.target.node}`,
        targetPath: ch.target.path as 'translation' | 'rotation' | 'scale' | 'weights',
        samplerIndex: ch.sampler,
      }));
      const samplers = anim.samplers.map((s) => ({
        inputBufferView: s.input,
        outputBufferView: s.output,
        interpolation: (s.interpolation?.toLowerCase() || 'linear') as import('../SceneGraph').AnimationInterpolation,
      }));
      return {
        id: `anim_${i}`,
        name: anim.name || `Animation_${i}`,
        duration: 0,
        channels,
        samplers,
      };
    });

    return {
      version: '3.3.0',
      generator: 'HoloScript USDZExporter (GLTF bridge)',
      metadata: {
        name: 'GLTFImport',
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        tags: [],
        properties: {},
      },
      root,
      materials: sgMaterials,
      textures: [],
      meshes: sgMeshes,
      buffers: sgBuffers,
      bufferViews: sgBufferViews,
      accessors: sgAccessors,
      animations: sgAnimations,
      skins: [],
      extensions: {},
      extras: {},
    };
  }

  private extractGLTFBuffers(gltfResult: IGLTFExportResult): ArrayBuffer[] {
    const doc = gltfResult.document;
    if (gltfResult.glb) {
      const binChunk = this.extractGLBBinChunk(gltfResult.glb);
      if (binChunk) return [binChunk];
    }
    const buffers: ArrayBuffer[] = [];
    for (const buffer of doc.buffers || []) {
      if (buffer.uri) {
        const resource = gltfResult.resources.get(buffer.uri);
        if (resource) {
          buffers.push(resource);
          continue;
        }
      }
      // Empty placeholder if data unavailable
      buffers.push(new ArrayBuffer(buffer.byteLength));
    }
    return buffers;
  }

  private extractGLBBinChunk(glb: ArrayBuffer): ArrayBuffer | undefined {
    const view = new DataView(glb);
    const magic = view.getUint32(0, true);
    if (magic !== 0x46546c67) return undefined;
    const version = view.getUint32(4, true);
    if (version !== 2) return undefined;
    const length = view.getUint32(8, true);
    let offset = 12;
    while (offset < length) {
      const chunkLength = view.getUint32(offset, true);
      const chunkType = view.getUint32(offset + 4, true);
      offset += 8;
      if (chunkType === 0x004e4942) {
        return glb.slice(offset, offset + chunkLength);
      }
      offset += chunkLength;
    }
    return undefined;
  }

  private mapGLTFPrimitiveMode(mode?: number): string {
    const modes = ['points', 'lines', 'lineLoop', 'lineStrip', 'triangles', 'triangleStrip', 'triangleFan'];
    return modes[mode ?? 4] || 'triangles';
  }

  private mapGLTFTextureRef(index: number, uvChannel: number): ITextureRef {
    return {
      id: `tex_${index}`,
      uvChannel,
      offset: { u: 0, v: 0 },
      scale: { u: 1, v: 1 },
      rotation: 0,
    };
  }

  // ========================================================================
  // Private Methods - Stage Creation
  // ========================================================================

  private createStage(sceneGraph: ISceneGraph): IUSDStage {
    return {
      metadata: {
        version: '0.10.0',
        upAxis: this.options.upAxis,
        metersPerUnit: this.options.metersPerUnit,
        comment: `Generated by ${sceneGraph.generator || 'HoloScript USDZExporter'}`,
      },
      defaultPrim: 'Root',
      prims: [],
      customLayerData: {
        creator: sceneGraph.generator,
        holoscriptVersion: sceneGraph.version,
      },
    };
  }

  private async convertSceneGraph(sceneGraph: ISceneGraph): Promise<void> {
    // Cache accessor data for animation sampling
    this.cacheAccessorData(sceneGraph);

    // Create root prim
    const rootPrim = createUSDXform('Root', '/Root');
    this.stage.prims.push(rootPrim);

    // Convert materials first (needed for mesh references)
    await this.convertMaterials(sceneGraph.materials || []);

    // Convert meshes
    await this.convertMeshes(sceneGraph.meshes || [], sceneGraph);

    // Convert scene hierarchy
    this.convertNode(sceneGraph.root, rootPrim, sceneGraph);

    // Convert animations if enabled
    if (this.options.includeAnimations && sceneGraph.animations?.length) {
      this.convertAnimations(sceneGraph.animations);
    }
  }

  private cacheAccessorData(sceneGraph: ISceneGraph): void {
    for (let i = 0; i < (sceneGraph.accessors || []).length; i++) {
      const data = this.extractAccessorData(i, sceneGraph);
      this.sceneGraphAccessorData.set(i, data);
    }
  }

  // ========================================================================
  // Private Methods - Node Conversion
  // ========================================================================

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Deep nested scene graph node access
  private convertNode(node: any, parentPrim: IUSDPrim, sceneGraph: ISceneGraph, depth = 0): void {
    if (!node || depth > 100) return; // Prevent infinite recursion

    const nodeName = sanitizeUSDName(node.name || `Node_${this.primCounter++}`);
    const nodePath = `${parentPrim.path}/${nodeName}`;

    // Create Xform prim for node
    const xformPrim = createUSDXform(nodeName, nodePath);

    // Track mapping for animation targeting
    if (node.id) {
      this.nodePrimMap.set(node.id, xformPrim);
    }

    // Add transform
    if (node.transform) {
      this.addTransform(xformPrim, node.transform);
    }

    // Add to parent
    if (!parentPrim.children) parentPrim.children = [];
    parentPrim.children.push(xformPrim);

    // Check for mesh component
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meshComp = node.components?.find((c: any) => c.type === 'mesh');
    if (meshComp?.meshRef) {
      const meshPath = this.meshMap.get(meshComp.meshRef);
      if (meshPath) {
        // Create reference to mesh
        xformPrim.relationships = [
          {
            name: 'mesh',
            targets: [meshPath],
          },
        ];
      }
    }

    // Process children
    if (node.children?.length) {
      for (const child of node.children) {
        this.convertNode(child, xformPrim, sceneGraph, depth + 1);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Deep nested transform object access (position[0]/y/z, rotation[0]/y/z/w, scale[0]/y/z)
  private addTransform(prim: IUSDPrim, transform: any): void {
    const ops: IUSDXformOp[] = [];

    // Translation
    if (transform.position) {
      ops.push({
        type: 'translate',
        value: [transform.position[0], transform.position[1], transform.position[2]],
      });
    }

    // Rotation (quaternion to Euler)
    if (transform.rotation) {
      const euler = quaternionToEuler([
        transform.rotation[0],
        transform.rotation[1],
        transform.rotation[2],
        transform.rotation[3],
      ]);
      ops.push({
        type: 'rotateXYZ',
        value: euler,
      });
    }

    // Scale
    if (transform.scale) {
      ops.push({
        type: 'scale',
        value: [transform.scale[0], transform.scale[1], transform.scale[2]],
      });
    }

    // Store as attributes
    if (ops.length > 0) {
      prim.attributes.push({
        name: 'xformOpOrder',
        type: 'token[]' as USDAttributeType,
        value: ops.map((op) => `xformOp:${op.type}`),
      });

      for (const op of ops) {
        prim.attributes.push({
          name: `xformOp:${op.type}`,
          type: this.getXformOpType(op.type),
          value: op.value,
        });
      }
    }
  }

  private getXformOpType(opType: string): USDAttributeType {
    switch (opType) {
      case 'translate':
        return 'float3';
      case 'rotateXYZ':
        return 'float3';
      case 'rotateX':
      case 'rotateY':
      case 'rotateZ':
        return 'float';
      case 'scale':
        return 'float3';
      case 'transform':
        return 'matrix4d';
      default:
        return 'float3';
    }
  }

  // ========================================================================
  // Private Methods - Material Conversion
  // ========================================================================

  private async convertMaterials(materials: IMaterial[]): Promise<void> {
    for (const material of materials) {
      await this.convertMaterial(material);
    }
  }

  private async convertMaterial(material: IMaterial): Promise<void> {
    const matName = sanitizeUSDName(material.name || `Material_${this.primCounter++}`);
    const matPath = `/Root/Materials/${matName}`;

    // Map GLTF PBR to USD Preview Surface
    const mapping = this.createMaterialMapping(material);

    const inputs: Partial<IUSDPreviewSurfaceInputs> = {
      diffuseColor: mapping.baseColor.slice(0, 3), // RGB only
      metallic: mapping.metallic,
      roughness: mapping.roughness,
      emissiveColor: mapping.emissive,
    };

    // Handle opacity
    if (material.alphaMode === 'blend' || material.alphaMode === 'mask') {
      inputs.opacity = mapping.baseColor[3]; // Alpha channel
      if (material.alphaMode === 'mask') {
        inputs.opacityThreshold = mapping.alphaCutoff || 0.5;
      }
    }

    const usdMaterial = createUSDPreviewSurfaceMaterial(matName, matPath, inputs);

    // Handle textures
    if (mapping.baseColorTexture) {
      await this.addTextureToMaterial(usdMaterial, 'diffuseColor', mapping.baseColorTexture);
    }

    if (mapping.normalTexture) {
      await this.addTextureToMaterial(usdMaterial, 'normal', mapping.normalTexture);
    }

    if (mapping.occlusionTexture) {
      await this.addTextureToMaterial(usdMaterial, 'occlusion', mapping.occlusionTexture);
    }

    // Add to stage
    if (!this.stage.prims[0].children) this.stage.prims[0].children = [];

    // Create Materials scope if it doesn't exist
    let materialsScope = this.stage.prims[0].children.find((p) => p.name === 'Materials');
    if (!materialsScope) {
      materialsScope = {
        path: '/Root/Materials',
        type: 'Scope',
        name: 'Materials',
        attributes: [],
        children: [],
      };
      this.stage.prims[0].children.push(materialsScope);
    }

    materialsScope.children!.push(usdMaterial);
    this.materialMap.set(material.id, matPath);
  }

  private createMaterialMapping(material: IMaterial): IGLTFToUSDMaterialMapping {
    return {
      baseColor: material.baseColor || [1, 1, 1, 1],
      metallic: material.metallic ?? 0,
      roughness: material.roughness ?? 0.5,
      emissive: material.emissiveColor || [0, 0, 0],
      alphaMode: material.alphaMode,
      alphaCutoff: material.alphaCutoff,
    };
  }

  private async addTextureToMaterial(
    material: IUSDMaterial,
    inputName: string,
    textureRef: string
  ): Promise<void> {
    // For now, store texture reference
    // In full implementation, we'd create UsdUVTexture shader nodes
    const shader = material.children?.[0] as IUSDShader;
    if (shader?.inputs) {
      shader.inputs.push({
        name: inputName,
        type: 'asset',
        value: { path: textureRef },
      });
    }
  }

  // ========================================================================
  // Private Methods - Mesh Conversion
  // ========================================================================

  private async convertMeshes(meshes: IMesh[], sceneGraph: ISceneGraph): Promise<void> {
    for (const mesh of meshes) {
      await this.convertMesh(mesh, sceneGraph);
    }
  }

  private async convertMesh(mesh: IMesh, sceneGraph: ISceneGraph): Promise<void> {
    const meshName = sanitizeUSDName(mesh.name || `Mesh_${this.primCounter++}`);
    const meshPath = `/Root/Geometry/${meshName}`;

    // Create Geometry scope if needed
    let geometryScope = this.stage.prims[0].children?.find((p) => p.name === 'Geometry');
    if (!geometryScope) {
      geometryScope = {
        path: '/Root/Geometry',
        type: 'Scope',
        name: 'Geometry',
        attributes: [],
        children: [],
      };
      if (!this.stage.prims[0].children) this.stage.prims[0].children = [];
      this.stage.prims[0].children.push(geometryScope);
    }

    // Convert each primitive
    for (let i = 0; i < mesh.primitives.length; i++) {
      const primitive = mesh.primitives[i];
      const primName = mesh.primitives.length > 1 ? `${meshName}_${i}` : meshName;
      const primPath = mesh.primitives.length > 1 ? `${meshPath}_${i}` : meshPath;

      const usdMesh = await this.convertMeshPrimitive(primitive, primName, primPath, sceneGraph);

      geometryScope.children!.push(usdMesh);
      this.meshMap.set(mesh.id, primPath);
    }
  }

  private async convertMeshPrimitive(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Deep nested mesh primitive access (attributes.POSITION, etc.)
    primitive: any,
    name: string,
    path: string,
    sceneGraph: ISceneGraph
  ): Promise<IUSDMesh> {
    // Extract vertex data from accessors
    const positions = this.extractAccessorData(primitive.attributes.POSITION, sceneGraph);
    const normals = primitive.attributes.NORMAL
      ? this.extractAccessorData(primitive.attributes.NORMAL, sceneGraph)
      : undefined;
    const uvs = primitive.attributes.TEXCOORD_0
      ? this.extractAccessorData(primitive.attributes.TEXCOORD_0, sceneGraph)
      : undefined;

    const indices =
      primitive.indices !== undefined
        ? this.extractAccessorData(primitive.indices, sceneGraph)
        : undefined;

    // Build face data
    const { faceVertexCounts, faceVertexIndices } = this.buildFaceData(
      indices,
      positions.length / 3
    );

    const usdMesh: IUSDMesh = {
      path,
      type: 'Mesh',
      name,
      attributes: [],
      faceVertexCounts,
      faceVertexIndices,
      points: positions,
    };

    // Add normals
    if (normals) {
      usdMesh.normals = normals;
      usdMesh.attributes.push({
        name: 'primvars:normals',
        type: 'normal3f[]',
        value: normals,
      });
      usdMesh.attributes.push({
        name: 'primvars:normals:interpolation',
        type: 'token',
        value: 'vertex',
      });
    }

    // Add UVs
    if (uvs) {
      usdMesh.primvars = [
        {
          name: 'st',
          type: 'texCoord2f[]',
          interpolation: 'vertex',
          values: uvs,
        },
      ];
    }

    // Add material binding
    if (primitive.materialRef) {
      const matPath = this.materialMap.get(primitive.materialRef);
      if (matPath) {
        usdMesh.relationships = [
          {
            name: 'material:binding',
            targets: [matPath],
          },
        ];
      }
    }

    return usdMesh;
  }

  private extractAccessorData(accessorIndex: number, sceneGraph: ISceneGraph): number[] {
    const accessor = sceneGraph.accessors[accessorIndex];
    if (!accessor) return [];

    const bufferView = sceneGraph.bufferViews[accessor.bufferViewIndex];
    const buffer = sceneGraph.buffers[bufferView.bufferIndex];

    if (!buffer.data) return [];

    // Extract typed array based on component type
    const arrayView = this.getTypedArray(
      buffer.data,
      bufferView.byteOffset + accessor.byteOffset,
      accessor.count * this.getComponentCount(accessor.type),
      accessor.componentType
    );

    return Array.from(arrayView);
  }

  private getTypedArray(
    buffer: ArrayBuffer,
    offset: number,
    length: number,
    componentType: string
  ): Float32Array | Uint16Array | Uint32Array {
    switch (componentType) {
      case 'float':
        return new Float32Array(buffer, offset, length);
      case 'ushort':
        return new Uint16Array(buffer, offset, length);
      case 'uint':
        return new Uint32Array(buffer, offset, length);
      default:
        return new Float32Array(buffer, offset, length);
    }
  }

  private getComponentCount(type: string): number {
    switch (type.toLowerCase()) {
      case 'scalar':
        return 1;
      case 'vec2':
        return 2;
      case 'vec3':
        return 3;
      case 'vec4':
        return 4;
      case 'mat2':
        return 4;
      case 'mat3':
        return 9;
      case 'mat4':
        return 16;
      default:
        return 1;
    }
  }

  private buildFaceData(
    indices: number[] | undefined,
    vertexCount: number
  ): { faceVertexCounts: number[]; faceVertexIndices: number[] } {
    if (indices && indices.length > 0) {
      // Indexed geometry - assume triangles
      const faceCount = Math.floor(indices.length / 3);
      return {
        faceVertexCounts: new Array(faceCount).fill(3),
        faceVertexIndices: indices,
      };
    } else if (vertexCount > 0) {
      // Non-indexed geometry
      const faceCount = Math.floor(vertexCount / 3);
      return {
        faceVertexCounts: new Array(faceCount).fill(3),
        faceVertexIndices: Array.from({ length: vertexCount }, (_, i) => i),
      };
    } else {
      // Empty mesh
      return {
        faceVertexCounts: [],
        faceVertexIndices: [],
      };
    }
  }

  // ========================================================================
  // Private Methods - Animation Conversion
  // ========================================================================

  private convertAnimations(animations: IAnimation[]): void {
    for (const animation of animations) {
      this.convertAnimation(animation);
    }
  }

  private convertAnimation(animation: IAnimation): void {
    // Group channels by target node for efficient prim updates
    const channelsByNode = new Map<string, IAnimationChannel[]>();
    for (const channel of animation.channels) {
      const list = channelsByNode.get(channel.targetNode) || [];
      list.push(channel);
      channelsByNode.set(channel.targetNode, list);
    }

    for (const [nodeId, channels] of Array.from(channelsByNode.entries())) {
      const prim = this.nodePrimMap.get(nodeId);
      if (!prim) continue;

      for (const channel of channels) {
        this.applyAnimationChannel(prim, channel, animation.samplers);
      }
    }
  }

  private applyAnimationChannel(
    prim: IUSDPrim,
    channel: IAnimationChannel,
    samplers: IAnimationSampler[]
  ): void {
    const sampler = samplers[channel.samplerIndex];
    if (!sampler) return;

    // Extract time and value data from buffer views
    const times = this.extractAccessorDataFlat(sampler.inputBufferView);
    const values = this.extractAccessorDataFlat(sampler.outputBufferView);
    if (times.length === 0 || values.length === 0) return;

    const timeSamples = new Map<number, number[]>();

    switch (channel.targetPath) {
      case 'translation': {
        for (let i = 0; i < times.length; i++) {
          timeSamples.set(times[i], [values[i * 3], values[i * 3 + 1], values[i * 3 + 2]]);
        }
        this.setXformOpTimeSamples(prim, 'xformOp:translate', 'float3', timeSamples);
        break;
      }
      case 'rotation': {
        for (let i = 0; i < times.length; i++) {
          const qx = values[i * 4];
          const qy = values[i * 4 + 1];
          const qz = values[i * 4 + 2];
          const qw = values[i * 4 + 3];
          const euler = quaternionToEuler([qx, qy, qz, qw]);
          timeSamples.set(times[i], euler);
        }
        this.setXformOpTimeSamples(prim, 'xformOp:rotateXYZ', 'float3', timeSamples);
        break;
      }
      case 'scale': {
        for (let i = 0; i < times.length; i++) {
          timeSamples.set(times[i], [values[i * 3], values[i * 3 + 1], values[i * 3 + 2]]);
        }
        this.setXformOpTimeSamples(prim, 'xformOp:scale', 'float3', timeSamples);
        break;
      }
      case 'weights': {
        // Morph target weights not yet supported in USDZ serialization
        console.warn(`Morph target animation not yet supported for ${prim.name}`);
        break;
      }
    }
  }

  private extractAccessorDataFlat(accessorIndex: number): number[] {
    // Reuse existing accessor extraction logic when scene graph context is available
    // This path is used during animation conversion after scene graph has been
    // processed into the stage. We look up the original data via the stage's
    // internal structures, but for animation channels the data is already in the
    // scene graph accessors. Since convertAnimations is called during
    // convertSceneGraph before packaging, the sceneGraph is not stored as a
    // field. To resolve this, we read animation data from a lightweight snapshot.
    //
    // Practical fix: store a reference to the current scene graph during export.
    return this.sceneGraphAccessorData.get(accessorIndex) || [];
  }

  private setXformOpTimeSamples(
    prim: IUSDPrim,
    opName: string,
    type: USDAttributeType,
    timeSamples: Map<number, number[]>
  ): void {
    // Find existing attribute or create new one
    let attr = prim.attributes.find((a) => a.name === opName);
    if (!attr) {
      attr = { name: opName, type, value: timeSamples.values().next().value || [] };
      prim.attributes.push(attr);
    }
    attr.timeSamples = timeSamples;
  }

  // ========================================================================
  // Private Methods - AR Metadata
  // ========================================================================

  private addARMetadata(): void {
    const metadata: IARQuickLookMetadata = {
      arBehaviors: {
        allowsContentScaling: this.options.allowContentScaling,
        hasLookAtCamera: this.options.lookAtCamera,
        initialPlacementMode: this.options.placementMode,
        enableOcclusion: this.options.enableOcclusion,
      },
      canonicalCameraDistance: this.options.canonicalCameraDistance,
    };

    // Store as custom layer data
    if (!this.stage.customLayerData) this.stage.customLayerData = {};
    this.stage.customLayerData.arQuickLook = metadata;

    // Also add as root prim metadata
    if (this.stage.prims[0]) {
      if (!this.stage.prims[0].metadata) this.stage.prims[0].metadata = {};
      this.stage.prims[0].metadata.arQuickLook = metadata;
    }
  }

  // ========================================================================
  // Private Methods - USDZ Packaging
  // ========================================================================

  private async packageUSDZ(): Promise<ArrayBuffer> {
    // Serialize USD to USDA (ASCII) or USDC (binary)
    const usdContent = this.serializeUSD(this.stage);

    const mainFile: IUSDZFileEntry = {
      path: 'scene.usda',
      data: new TextEncoder().encode(usdContent).buffer,
      mimeType: 'text/plain',
    };

    // Create USDZ package (uncompressed ZIP)
    const package_: IUSDZPackage = {
      mainFile,
      files: this.textureFiles,
    };

    return this.createZipArchive(package_);
  }

  private serializeUSD(stage: IUSDStage): string {
    const lines: string[] = [];

    // Header
    lines.push('#usda 1.0');
    lines.push('(');
    if (stage.defaultPrim) {
      lines.push(`    defaultPrim = "${stage.defaultPrim}"`);
    }
    if (stage.metadata.upAxis) {
      lines.push(`    upAxis = "${stage.metadata.upAxis}"`);
    }
    if (stage.metadata.metersPerUnit) {
      lines.push(`    metersPerUnit = ${stage.metadata.metersPerUnit}`);
    }
    lines.push(')');
    lines.push('');

    // Prims
    for (const prim of stage.prims) {
      this.serializePrim(prim, lines, 0);
    }

    return lines.join('\n');
  }

  private serializePrim(prim: IUSDPrim, lines: string[], indent: number): void {
    const ind = '    '.repeat(indent);

    lines.push(`${ind}def ${prim.type} "${prim.name}"`);
    lines.push(`${ind}{`);

    // Attributes
    for (const attr of prim.attributes) {
      this.serializeAttribute(attr, lines, indent + 1);
    }

    // Relationships
    if (prim.relationships) {
      for (const rel of prim.relationships) {
        const relInd = '    '.repeat(indent + 1);
        const targets = rel.targets.map((t) => `<${t}>`).join(', ');
        lines.push(`${relInd}rel ${rel.name} = [${targets}]`);
      }
    }

    // Children
    if (prim.children) {
      for (const child of prim.children) {
        lines.push('');
        this.serializePrim(child, lines, indent + 1);
      }
    }

    lines.push(`${ind}}`);
  }

  private serializeAttribute(attr: IUSDAttribute, lines: string[], indent: number): void {
    const ind = '    '.repeat(indent);

    if (attr.timeSamples && attr.timeSamples.size > 0) {
      // Time-sampled attribute (animation)
      lines.push(`${ind}${attr.type} ${attr.name}.timeSamples = {`);
      for (const [time, sample] of Array.from(attr.timeSamples.entries())) {
        const serializedSample = this.serializeValue(sample, attr.type);
        lines.push(`${ind}    ${time}: ${serializedSample},`);
      }
      lines.push(`${ind}}`);
    } else {
      const value = this.serializeValue(attr.value, attr.type);
      lines.push(`${ind}${attr.type} ${attr.name} = ${value}`);
    }
  }

  private serializeValue(value: unknown, type: string): string {
    if (Array.isArray(value)) {
      if (type.includes('[]')) {
        // Array type
        return `[${value.map((v) => this.serializeScalar(v, type.replace('[]', ''))).join(', ')}]`;
      } else {
        // Tuple type (e.g., float3)
        return `(${value.join(', ')})`;
      }
    } else if (typeof value === 'string') {
      return `"${value}"`;
    } else if (typeof value === 'object' && value !== null && 'path' in value) {
      // Asset path
      return `@${(value as { path: string }).path}@`;
    } else {
      return String(value);
    }
  }

  private serializeScalar(value: unknown, _type: string): string {
    if (typeof value === 'string') {
      return `"${value}"`;
    }
    return String(value);
  }

  private async createZipArchive(package_: IUSDZPackage): Promise<ArrayBuffer> {
    // Simple uncompressed ZIP implementation
    // USDZ requires uncompressed ZIP format

    const files = [package_.mainFile, ...package_.files];

    // Calculate total size
    let totalSize = 0;
    const fileEntries: Array<{
      name: string;
      data: ArrayBuffer;
      offset: number;
    }> = [];

    // Local file headers + central directory
    const localHeaderSize = 30; // Fixed size
    const centralHeaderSize = 46;
    const endCentralSize = 22;

    for (const file of files) {
      const nameBytes = new TextEncoder().encode(file.path);
      fileEntries.push({
        name: file.path,
        data: file.data,
        offset: totalSize,
      });
      totalSize += localHeaderSize + nameBytes.length + file.data.byteLength;
    }

    const centralDirOffset = totalSize;
    let centralDirSize = 0;
    for (const entry of fileEntries) {
      const nameBytes = new TextEncoder().encode(entry.name);
      centralDirSize += centralHeaderSize + nameBytes.length;
    }

    totalSize += centralDirSize + endCentralSize;

    // Create buffer
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const bytes = new Uint8Array(buffer);
    let offset = 0;

    // Write local file headers and data
    for (const entry of fileEntries) {
      const nameBytes = new TextEncoder().encode(entry.name);

      // Local file header
      view.setUint32(offset, 0x04034b50, true); // Signature
      view.setUint16(offset + 4, 20, true); // Version needed
      view.setUint16(offset + 6, 0, true); // Flags
      view.setUint16(offset + 8, 0, true); // Compression (0 = none)
      view.setUint16(offset + 10, 0, true); // Mod time
      view.setUint16(offset + 12, 0, true); // Mod date
      view.setUint32(offset + 14, 0, true); // CRC32 (skip for now)
      view.setUint32(offset + 18, entry.data.byteLength, true); // Compressed size
      view.setUint32(offset + 22, entry.data.byteLength, true); // Uncompressed size
      view.setUint16(offset + 26, nameBytes.length, true); // Filename length
      view.setUint16(offset + 28, 0, true); // Extra field length
      offset += 30;

      // Filename
      bytes.set(nameBytes, offset);
      offset += nameBytes.length;

      // File data
      bytes.set(new Uint8Array(entry.data), offset);
      offset += entry.data.byteLength;
    }

    // Write central directory
    for (const entry of fileEntries) {
      const nameBytes = new TextEncoder().encode(entry.name);

      view.setUint32(offset, 0x02014b50, true); // Signature
      view.setUint16(offset + 4, 20, true); // Version made by
      view.setUint16(offset + 6, 20, true); // Version needed
      view.setUint16(offset + 8, 0, true); // Flags
      view.setUint16(offset + 10, 0, true); // Compression
      view.setUint16(offset + 12, 0, true); // Mod time
      view.setUint16(offset + 14, 0, true); // Mod date
      view.setUint32(offset + 16, 0, true); // CRC32
      view.setUint32(offset + 20, entry.data.byteLength, true); // Compressed size
      view.setUint32(offset + 24, entry.data.byteLength, true); // Uncompressed size
      view.setUint16(offset + 28, nameBytes.length, true); // Filename length
      view.setUint16(offset + 30, 0, true); // Extra field length
      view.setUint16(offset + 32, 0, true); // Comment length
      view.setUint16(offset + 34, 0, true); // Disk number
      view.setUint16(offset + 36, 0, true); // Internal attributes
      view.setUint32(offset + 38, 0, true); // External attributes
      view.setUint32(offset + 42, entry.offset, true); // Local header offset
      offset += 46;

      bytes.set(nameBytes, offset);
      offset += nameBytes.length;
    }

    // End of central directory
    view.setUint32(offset, 0x06054b50, true); // Signature
    view.setUint16(offset + 4, 0, true); // Disk number
    view.setUint16(offset + 6, 0, true); // Central dir disk
    view.setUint16(offset + 8, fileEntries.length, true); // Entries on disk
    view.setUint16(offset + 10, fileEntries.length, true); // Total entries
    view.setUint32(offset + 12, centralDirSize, true); // Central dir size
    view.setUint32(offset + 16, centralDirOffset, true); // Central dir offset
    view.setUint16(offset + 20, 0, true); // Comment length

    return buffer;
  }

  // ========================================================================
  // Private Methods - Utilities
  // ========================================================================

  private reset(): void {
    this.primCounter = 0;
    this.materialMap.clear();
    this.meshMap.clear();
    this.nodePrimMap.clear();
    this.sceneGraphAccessorData.clear();
    this.textureFiles = [];
  }

  private calculateStats(usdzSize: number, exportTime: number): IUSDZExportStats {
    let primCount = 0;
    let meshCount = 0;
    let materialCount = 0;

    const countPrims = (prim: IUSDPrim) => {
      primCount++;
      if (prim.type === 'Mesh') meshCount++;
      if (prim.type === 'Material') materialCount++;
      if (prim.children) {
        for (const child of prim.children) countPrims(child);
      }
    };

    for (const prim of this.stage.prims) {
      countPrims(prim);
    }

    return {
      primCount,
      meshCount,
      materialCount,
      textureCount: this.textureFiles.length,
      fileCount: 1 + this.textureFiles.length,
      usdzSize,
      exportTime,
    };
  }
}
