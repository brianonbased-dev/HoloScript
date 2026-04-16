/**
 * GLTF 2.0 Exporter
 *
 * Converts HoloScript scene graphs to GLTF/GLB format
 */

import type {
  ISceneGraph,
  ISceneNode,
  IMaterial,
  ITexture,
  IMesh,
  IAnimation,
  ISkin,
  ITransform,
  IMeshComponent,
  ICameraComponent,
} from '../SceneGraph';

import { isMeshComponent, isCameraComponent } from '../SceneGraph';

import {
  type IGLTFDocument,
  type IGLTFNode,
  type IGLTFMesh,
  type IGLTFMeshPrimitive,
  type IGLTFMaterial,
  type IGLTFTexture,
  type IGLTFImage,
  type IGLTFSampler,
  type IGLTFAnimation,
  type IGLTFAnimationChannel,
  type IGLTFAnimationSampler,
  type IGLTFSkin,
  type IGLTFCamera,
  type IGLTFAccessor,
  type IGLTFBufferView,
  type IGLTFExportOptions,
  type IGLTFExportResult,
  type IGLTFExportStats,
  type IGLTFPBRMetallicRoughness,
  GLTFComponentType,
  type GLTFAccessorType,
  GLTFPrimitiveMode,
  GLTFBufferViewTarget,
  GLTFMagFilter,
  GLTFMinFilter,
  GLTFWrapMode,
  createEmptyGLTFDocument,
  validateGLTFDocument,
} from './GLTFTypes';

import { AdvancedCompression } from '../compression/AdvancedCompression';
import type { CompressionStats } from '../compression/CompressionTypes';
import type { IUSDZExportOptions, IUSDZExportResult } from '../usdz/USDTypes';

export class GLTFExporter {
  private options: Required<IGLTFExportOptions>;
  private document!: IGLTFDocument;
  private bufferData: ArrayBuffer[] = [];
  private bufferOffset = 0;
  private nodeIndexMap = new Map<string, number>();
  private meshIndexMap = new Map<string, number>();
  private materialIndexMap = new Map<string, number>();
  private textureIndexMap = new Map<string, number>();
  private imageIndexMap = new Map<string, number>();
  private accessorIndexMap = new Map<string, number>();
  private bufferViewIndexMap = new Map<string, number>();
  private compressionStats?: CompressionStats;

  private static readonly DEFAULT_OPTIONS: Required<IGLTFExportOptions> = {
    binary: true,
    embedTextures: true,
    compression: 'none',
    includeAnimations: true,
    includeCameras: true,
    extensions: [],
    prettyPrint: false,
    generator: 'HoloScript GLTFExporter',
    copyright: '',
    minVersion: '',
  };

  constructor(options: IGLTFExportOptions = {}) {
    this.options = { ...GLTFExporter.DEFAULT_OPTIONS, ...options };
  }

  async export(sceneGraph: ISceneGraph): Promise<IGLTFExportResult> {
    const startTime = performance.now();
    this.reset();
    this.document = createEmptyGLTFDocument(this.options.generator);
    if (this.options.copyright) this.document.asset.copyright = this.options.copyright;
    if (this.options.minVersion) this.document.asset.minVersion = this.options.minVersion;

    this.exportTextures(sceneGraph);
    this.exportMaterials(sceneGraph);
    this.exportMeshes(sceneGraph);

    const rootNodeIndex = this.exportNode(sceneGraph.root, sceneGraph);
    this.document.scenes = [
      { name: sceneGraph.metadata.name, nodes: rootNodeIndex !== undefined ? [rootNodeIndex] : [] },
    ];
    this.document.scene = 0;

    if (this.options.includeAnimations) this.exportAnimations(sceneGraph);
    this.exportSkins(sceneGraph);
    this.finalizeBuffers();
    this.cleanupDocument();
    if (this.options.extensions.length > 0) this.document.extensionsUsed = this.options.extensions;

    // Apply advanced compression if enabled
    if (this.options.compression !== 'none') {
      await this.applyCompression();
    }

    const errors = validateGLTFDocument(this.document);
    if (errors.length > 0) console.warn('GLTF validation warnings:', errors);

    const endTime = performance.now();
    const stats = this.calculateStats(endTime - startTime);
    const resources = new Map<string, ArrayBuffer>();

    if (this.options.binary) {
      const glb = this.buildGLB();
      stats.glbSize = glb.byteLength;
      return { document: this.document, glb, resources, stats };
    } else {
      const json = JSON.stringify(this.document, null, this.options.prettyPrint ? 2 : undefined);
      stats.jsonSize = new TextEncoder().encode(json).length;
      return { document: this.document, json, resources, stats };
    }
  }

  private exportNode(node: ISceneNode, sceneGraph: ISceneGraph): number | undefined {
    if (!node) return undefined;
    const gltfNode: IGLTFNode = { name: node.name };
    if (node.transform) this.applyTransform(gltfNode, node.transform);

    const meshComp = (node.components || []).find((c) => isMeshComponent(c)) as
      | IMeshComponent
      | undefined;
    if (meshComp && meshComp.meshRef) {
      const meshIndex = this.meshIndexMap.get(meshComp.meshRef);
      if (meshIndex !== undefined) gltfNode.mesh = meshIndex;
    }

    if (this.options.includeCameras) {
      const cameraComp = (node.components || []).find((c) => isCameraComponent(c)) as
        | ICameraComponent
        | undefined;
      if (cameraComp) gltfNode.camera = this.exportCamera(cameraComp);
    }

    if (node.children && node.children.length > 0) {
      const childIndices: number[] = [];
      for (const child of node.children) {
        const childIndex = this.exportNode(child, sceneGraph);
        if (childIndex !== undefined) childIndices.push(childIndex);
      }
      if (childIndices.length > 0) gltfNode.children = childIndices;
    }

    if (node.metadata && Object.keys(node.metadata).length > 0) {
      gltfNode.extras = node.metadata as Record<string, unknown>;
    }

    const nodeIndex = this.document.nodes!.length;
    this.document.nodes!.push(gltfNode);
    this.nodeIndexMap.set(node.id, nodeIndex);
    return nodeIndex;
  }

  private exportMeshes(sceneGraph: ISceneGraph): void {
    for (const mesh of sceneGraph.meshes || []) this.exportMesh(mesh, sceneGraph);
  }

  private exportMesh(mesh: IMesh, sceneGraph: ISceneGraph): number {
    const existingIndex = this.meshIndexMap.get(mesh.id);
    if (existingIndex !== undefined) return existingIndex;

    const primitives: IGLTFMeshPrimitive[] = [];
    for (const primitive of mesh.primitives) {
      const gltfPrimitive: IGLTFMeshPrimitive = {
        attributes: {},
        mode: this.getPrimitiveMode(primitive.mode),
      };

      for (const [attrName, accessorIdx] of Object.entries(primitive.attributes)) {
        if (accessorIdx !== undefined) {
          gltfPrimitive.attributes[attrName] = this.exportAccessor(
            accessorIdx as number,
            sceneGraph
          );
        }
      }

      if (primitive.indices !== undefined) {
        gltfPrimitive.indices = this.exportAccessor(primitive.indices, sceneGraph);
      }

      if (primitive.materialRef) {
        const materialIndex = this.materialIndexMap.get(primitive.materialRef);
        if (materialIndex !== undefined) gltfPrimitive.material = materialIndex;
      }

      primitives.push(gltfPrimitive);
    }

    const gltfMesh: IGLTFMesh = { name: mesh.name, primitives };
    if (mesh.morphWeights && mesh.morphWeights.length > 0) gltfMesh.weights = mesh.morphWeights;

    const meshIndex = this.document.meshes!.length;
    this.document.meshes!.push(gltfMesh);
    this.meshIndexMap.set(mesh.id, meshIndex);
    return meshIndex;
  }

  private exportMaterials(sceneGraph: ISceneGraph): void {
    for (const material of sceneGraph.materials || []) this.exportMaterial(material);
  }

  private exportMaterial(material: IMaterial): number {
    const existingIndex = this.materialIndexMap.get(material.id);
    if (existingIndex !== undefined) return existingIndex;

    const gltfMaterial: IGLTFMaterial = {
      name: material.name,
      doubleSided: material.doubleSided,
      alphaMode: material.alphaMode?.toUpperCase() as 'OPAQUE' | 'MASK' | 'BLEND',
      alphaCutoff: material.alphaMode === 'mask' ? material.alphaCutoff : undefined,
    };

    const pbr: IGLTFPBRMetallicRoughness = {};
    if (material.baseColor)
      pbr.baseColorFactor = material.baseColor as [number, number, number, number];
    if (material.metallic !== undefined) pbr.metallicFactor = material.metallic;
    if (material.roughness !== undefined) pbr.roughnessFactor = material.roughness;

    if (material.baseColorTexture) {
      const textureIndex = this.textureIndexMap.get(material.baseColorTexture.id);
      if (textureIndex !== undefined) {
        pbr.baseColorTexture = {
          index: textureIndex,
          texCoord: material.baseColorTexture.uvChannel,
        };
      }
    }

    if (material.metallicRoughnessTexture) {
      const textureIndex = this.textureIndexMap.get(material.metallicRoughnessTexture.id);
      if (textureIndex !== undefined) {
        pbr.metallicRoughnessTexture = {
          index: textureIndex,
          texCoord: material.metallicRoughnessTexture.uvChannel,
        };
      }
    }

    if (Object.keys(pbr).length > 0) gltfMaterial.pbrMetallicRoughness = pbr;

    if (material.normalTexture) {
      const textureIndex = this.textureIndexMap.get(material.normalTexture.id);
      if (textureIndex !== undefined) {
        gltfMaterial.normalTexture = {
          index: textureIndex,
          texCoord: material.normalTexture.uvChannel,
          scale: material.normalScale,
        };
      }
    }

    if (material.occlusionTexture) {
      const textureIndex = this.textureIndexMap.get(material.occlusionTexture.id);
      if (textureIndex !== undefined) {
        gltfMaterial.occlusionTexture = {
          index: textureIndex,
          texCoord: material.occlusionTexture.uvChannel,
          strength: material.occlusionStrength,
        };
      }
    }

    if (material.emissiveTexture) {
      const textureIndex = this.textureIndexMap.get(material.emissiveTexture.id);
      if (textureIndex !== undefined) {
        gltfMaterial.emissiveTexture = {
          index: textureIndex,
          texCoord: material.emissiveTexture.uvChannel,
        };
      }
    }

    if (material.emissiveColor)
      gltfMaterial.emissiveFactor = material.emissiveColor as [number, number, number];

    const materialIndex = this.document.materials!.length;
    this.document.materials!.push(gltfMaterial);
    this.materialIndexMap.set(material.id, materialIndex);
    return materialIndex;
  }

  private exportTextures(sceneGraph: ISceneGraph): void {
    for (const texture of sceneGraph.textures || []) this.exportTexture(texture, sceneGraph);
  }

  private exportTexture(texture: ITexture, sceneGraph: ISceneGraph): number {
    const existingIndex = this.textureIndexMap.get(texture.id);
    if (existingIndex !== undefined) return existingIndex;

    const imageIndex = this.exportImage(texture, sceneGraph);
    const samplerIndex = this.exportSampler(texture);

    const gltfTexture: IGLTFTexture = {
      name: texture.name,
      source: imageIndex,
      sampler: samplerIndex,
    };
    const textureIndex = this.document.textures!.length;
    this.document.textures!.push(gltfTexture);
    this.textureIndexMap.set(texture.id, textureIndex);
    return textureIndex;
  }

  private exportImage(texture: ITexture, sceneGraph: ISceneGraph): number {
    const existingIndex = this.imageIndexMap.get(texture.id);
    if (existingIndex !== undefined) return existingIndex;

    const gltfImage: IGLTFImage = { name: texture.name };

    if (texture.sourceType === 'bufferView' && texture.bufferViewIndex !== undefined) {
      gltfImage.bufferView = this.exportBufferView(texture.bufferViewIndex, sceneGraph);
      gltfImage.mimeType = texture.mimeType;
    } else if (texture.sourceType === 'dataUri' || texture.sourceType === 'uri') {
      gltfImage.uri = texture.source;
    }

    const imageIndex = this.document.images!.length;
    this.document.images!.push(gltfImage);
    this.imageIndexMap.set(texture.id, imageIndex);
    return imageIndex;
  }

  private exportSampler(texture: ITexture): number {
    const sampler: IGLTFSampler = {
      magFilter: this.getMagFilter(texture.magFilter),
      minFilter: this.getMinFilter(texture.minFilter),
      wrapS: this.getWrapMode(texture.wrapS),
      wrapT: this.getWrapMode(texture.wrapT),
    };
    const samplerIndex = this.document.samplers!.length;
    this.document.samplers!.push(sampler);
    return samplerIndex;
  }

  private exportAnimations(sceneGraph: ISceneGraph): void {
    for (const animation of sceneGraph.animations || [])
      this.exportAnimation(animation, sceneGraph);
  }

  private exportAnimation(animation: IAnimation, sceneGraph: ISceneGraph): number {
    const channels: IGLTFAnimationChannel[] = [];
    const samplers: IGLTFAnimationSampler[] = [];

    for (const channel of animation.channels || []) {
      const nodeIndex = this.nodeIndexMap.get(channel.targetNode);
      if (nodeIndex === undefined) continue;

      const sampler = animation.samplers[channel.samplerIndex];
      if (!sampler) continue;

      const inputAccessor = this.exportAccessor(sampler.inputBufferView, sceneGraph);
      const outputAccessor = this.exportAccessor(sampler.outputBufferView, sceneGraph);

      const gltfSamplerIndex = samplers.length;
      samplers.push({
        input: inputAccessor,
        output: outputAccessor,
        interpolation: sampler.interpolation?.toUpperCase() as 'LINEAR' | 'STEP' | 'CUBICSPLINE',
      });

      channels.push({
        sampler: gltfSamplerIndex,
        target: {
          node: nodeIndex,
          path: channel.targetPath as 'translation' | 'rotation' | 'scale' | 'weights',
        },
      });
    }

    const gltfAnimation: IGLTFAnimation = { name: animation.name, channels, samplers };
    const animationIndex = this.document.animations!.length;
    this.document.animations!.push(gltfAnimation);
    return animationIndex;
  }

  private exportSkins(sceneGraph: ISceneGraph): void {
    for (const skin of sceneGraph.skins || []) this.exportSkin(skin, sceneGraph);
  }

  private exportSkin(skin: ISkin, _sceneGraph: ISceneGraph): number {
    const jointIndices: number[] = [];
    const inverseBindMatrices: number[] = [];

    for (const joint of skin.joints || []) {
      const nodeIndex = this.nodeIndexMap.get(joint.nodeId);
      if (nodeIndex !== undefined) {
        jointIndices.push(nodeIndex);
        if (joint.inverseBindMatrix && joint.inverseBindMatrix.length === 16) {
          inverseBindMatrices.push(...joint.inverseBindMatrix);
        }
      }
    }

    const gltfSkin: IGLTFSkin = { name: skin.name, joints: jointIndices };

    if (skin.skeletonRoot) {
      const skeletonIndex = this.nodeIndexMap.get(skin.skeletonRoot);
      if (skeletonIndex !== undefined) gltfSkin.skeleton = skeletonIndex;
    }

    if (inverseBindMatrices.length > 0) {
      gltfSkin.inverseBindMatrices = this.createAccessorFromData(
        `${skin.id}_ibm`,
        new Float32Array(inverseBindMatrices),
        'MAT4',
        GLTFComponentType.FLOAT
      );
    }

    const skinIndex = this.document.skins!.length;
    this.document.skins!.push(gltfSkin);
    return skinIndex;
  }

  private exportCamera(camera: ICameraComponent): number {
    const gltfCamera: IGLTFCamera = {
      name: camera.properties?.name as string | undefined,
      type: camera.cameraType === 'orthographic' ? 'orthographic' : 'perspective',
    };

    if (camera.cameraType === 'orthographic') {
      gltfCamera.orthographic = {
        xmag: camera.orthoSize || 1,
        ymag: camera.orthoSize || 1,
        zfar: camera.far || 1000,
        znear: camera.near || 0.1,
      };
    } else {
      gltfCamera.perspective = {
        yfov: ((camera.fov || 60) * Math.PI) / 180,
        znear: camera.near || 0.1,
        zfar: camera.far,
        aspectRatio: camera.aspectRatio,
      };
    }

    const cameraIndex = this.document.cameras!.length;
    this.document.cameras!.push(gltfCamera);
    return cameraIndex;
  }

  private exportAccessor(accessorIdx: number, sceneGraph: ISceneGraph): number {
    const key = `sg_accessor_${accessorIdx}`;
    const existingIndex = this.accessorIndexMap.get(key);
    if (existingIndex !== undefined) return existingIndex;

    const srcAccessor = sceneGraph.accessors[accessorIdx];
    if (!srcAccessor) throw new Error(`Accessor index ${accessorIdx} not found in scene graph`);

    const gltfBufViewIdx = this.exportBufferView(srcAccessor.bufferViewIndex, sceneGraph);
    const componentType = this.mapComponentType(srcAccessor.componentType);
    const type = srcAccessor.type.toUpperCase() as GLTFAccessorType;

    const accessor: IGLTFAccessor = {
      name: srcAccessor.id,
      bufferView: gltfBufViewIdx,
      byteOffset: srcAccessor.byteOffset,
      componentType,
      count: srcAccessor.count,
      type,
      normalized: srcAccessor.normalized,
    };

    if (srcAccessor.min) accessor.min = srcAccessor.min;
    if (srcAccessor.max) accessor.max = srcAccessor.max;

    const gltfAccessorIndex = this.document.accessors!.length;
    this.document.accessors!.push(accessor);
    this.accessorIndexMap.set(key, gltfAccessorIndex);
    return gltfAccessorIndex;
  }

  private exportBufferView(bufferViewIdx: number, sceneGraph: ISceneGraph): number {
    const key = `sg_bufview_${bufferViewIdx}`;
    const existingIndex = this.bufferViewIndexMap.get(key);
    if (existingIndex !== undefined) return existingIndex;

    const srcBufView = sceneGraph.bufferViews[bufferViewIdx];
    if (!srcBufView) throw new Error(`BufferView index ${bufferViewIdx} not found in scene graph`);

    const srcBuffer = sceneGraph.buffers[srcBufView.bufferIndex];
    if (!srcBuffer || !srcBuffer.data) {
      const bufferView: IGLTFBufferView = {
        buffer: 0,
        byteOffset: this.bufferOffset,
        byteLength: srcBufView.byteLength,
      };
      if (srcBufView.byteStride) bufferView.byteStride = srcBufView.byteStride;
      if (srcBufView.target === 'elementArrayBuffer')
        bufferView.target = GLTFBufferViewTarget.ELEMENT_ARRAY_BUFFER;
      else if (srcBufView.target === 'arrayBuffer')
        bufferView.target = GLTFBufferViewTarget.ARRAY_BUFFER;

      const bufferViewIndex = this.document.bufferViews!.length;
      this.document.bufferViews!.push(bufferView);
      this.bufferViewIndexMap.set(key, bufferViewIndex);
      return bufferViewIndex;
    }

    const slice = srcBuffer.data.slice(
      srcBufView.byteOffset,
      srcBufView.byteOffset + srcBufView.byteLength
    ) as ArrayBuffer;
    const bufferView: IGLTFBufferView = {
      buffer: 0,
      byteOffset: this.bufferOffset,
      byteLength: slice.byteLength,
    };
    if (srcBufView.byteStride) bufferView.byteStride = srcBufView.byteStride;
    if (srcBufView.target === 'elementArrayBuffer')
      bufferView.target = GLTFBufferViewTarget.ELEMENT_ARRAY_BUFFER;
    else if (srcBufView.target === 'arrayBuffer')
      bufferView.target = GLTFBufferViewTarget.ARRAY_BUFFER;

    this.bufferData.push(slice);
    this.bufferOffset += slice.byteLength;
    const padding = (4 - (this.bufferOffset % 4)) % 4;
    if (padding > 0) {
      this.bufferData.push(new ArrayBuffer(padding));
      this.bufferOffset += padding;
    }

    const bufferViewIndex = this.document.bufferViews!.length;
    this.document.bufferViews!.push(bufferView);
    this.bufferViewIndexMap.set(key, bufferViewIndex);
    return bufferViewIndex;
  }

  private createAccessorFromData(
    name: string,
    data: Float32Array | Uint16Array | Uint32Array,
    type: GLTFAccessorType,
    componentType: GLTFComponentType
  ): number {
    const buffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    ) as ArrayBuffer as ArrayBuffer;
    const bufferView: IGLTFBufferView = {
      buffer: 0,
      byteOffset: this.bufferOffset,
      byteLength: buffer.byteLength,
    };
    this.bufferData.push(buffer);
    this.bufferOffset += buffer.byteLength;
    const padding = (4 - (this.bufferOffset % 4)) % 4;
    if (padding > 0) {
      this.bufferData.push(new ArrayBuffer(padding));
      this.bufferOffset += padding;
    }

    const bufferViewIndex = this.document.bufferViews!.length;
    this.document.bufferViews!.push(bufferView);
    const count = data.length / this.getComponentCount(type);
    const accessor: IGLTFAccessor = {
      name,
      bufferView: bufferViewIndex,
      byteOffset: 0,
      componentType,
      count,
      type,
    };
    const accessorIndex = this.document.accessors!.length;
    this.document.accessors!.push(accessor);
    return accessorIndex;
  }

  private applyTransform(node: IGLTFNode, transform: ITransform): void {
    const hasTranslation =
      transform.position[0] !== 0 || transform.position[1] !== 0 || transform.position[2] !== 0;
    const hasRotation =
      transform.rotation.x !== 0 ||
      transform.rotation.y !== 0 ||
      transform.rotation.z !== 0 ||
      transform.rotation.w !== 1;
    const hasScale = transform.scale[0] !== 1 || transform.scale[1] !== 1 || transform.scale[2] !== 1;

    if (hasTranslation)
      node.translation = [transform.position[0], transform.position[1], transform.position[2]];
    if (hasRotation)
      node.rotation = [
        transform.rotation.x,
        transform.rotation.y,
        transform.rotation.z,
        transform.rotation.w,
      ];
    if (hasScale) node.scale = [transform.scale[0], transform.scale[1], transform.scale[2]];
  }

  private reset(): void {
    this.bufferData = [];
    this.bufferOffset = 0;
    this.nodeIndexMap.clear();
    this.meshIndexMap.clear();
    this.materialIndexMap.clear();
    this.textureIndexMap.clear();
    this.imageIndexMap.clear();
    this.accessorIndexMap.clear();
    this.bufferViewIndexMap.clear();
  }

  private finalizeBuffers(): void {
    if (this.bufferOffset === 0) return;
    this.document.buffers = [{ byteLength: this.bufferOffset }];
  }

  private cleanupDocument(): void {
    const doc = this.document;
    if (doc.scenes?.length === 0) delete doc.scenes;
    if (doc.nodes?.length === 0) delete doc.nodes;
    if (doc.meshes?.length === 0) delete doc.meshes;
    if (doc.accessors?.length === 0) delete doc.accessors;
    if (doc.bufferViews?.length === 0) delete doc.bufferViews;
    if (doc.buffers?.length === 0) delete doc.buffers;
    if (doc.materials?.length === 0) delete doc.materials;
    if (doc.textures?.length === 0) delete doc.textures;
    if (doc.images?.length === 0) delete doc.images;
    if (doc.samplers?.length === 0) delete doc.samplers;
    if (doc.animations?.length === 0) delete doc.animations;
    if (doc.skins?.length === 0) delete doc.skins;
    if (doc.cameras?.length === 0) delete doc.cameras;
  }

  private calculateStats(exportTime: number): IGLTFExportStats {
    return {
      nodeCount: this.document.nodes?.length || 0,
      meshCount: this.document.meshes?.length || 0,
      materialCount: this.document.materials?.length || 0,
      textureCount: this.document.textures?.length || 0,
      animationCount: this.document.animations?.length || 0,
      bufferSize: this.bufferOffset,
      jsonSize: 0,
      glbSize: 0,
      exportTime,
    };
  }

  private buildGLB(): ArrayBuffer {
    const jsonString = JSON.stringify(this.document);
    const jsonBytes = new TextEncoder().encode(jsonString);
    const jsonPadding = (4 - (jsonBytes.length % 4)) % 4;
    const jsonChunkLength = jsonBytes.length + jsonPadding;
    const binData = this.concatenateBuffers();
    const binPadding = (4 - (binData.byteLength % 4)) % 4;
    const binChunkLength = binData.byteLength + binPadding;
    const headerSize = 12;
    const jsonChunkHeaderSize = 8;
    const binChunkHeaderSize = binData.byteLength > 0 ? 8 : 0;
    const totalSize =
      headerSize +
      jsonChunkHeaderSize +
      jsonChunkLength +
      (binData.byteLength > 0 ? binChunkHeaderSize + binChunkLength : 0);

    const glb = new ArrayBuffer(totalSize);
    const view = new DataView(glb);
    const bytes = new Uint8Array(glb);
    let offset = 0;

    view.setUint32(offset, 0x46546c67, true);
    offset += 4;
    view.setUint32(offset, 2, true);
    offset += 4;
    view.setUint32(offset, totalSize, true);
    offset += 4;
    view.setUint32(offset, jsonChunkLength, true);
    offset += 4;
    view.setUint32(offset, 0x4e4f534a, true);
    offset += 4;
    bytes.set(jsonBytes, offset);
    offset += jsonBytes.length;
    for (let i = 0; i < jsonPadding; i++) bytes[offset++] = 0x20;

    if (binData.byteLength > 0) {
      view.setUint32(offset, binChunkLength, true);
      offset += 4;
      view.setUint32(offset, 0x004e4942, true);
      offset += 4;
      bytes.set(new Uint8Array(binData), offset);
      offset += binData.byteLength;
      for (let i = 0; i < binPadding; i++) bytes[offset++] = 0x00;
    }

    return glb;
  }

  private concatenateBuffers(): ArrayBuffer {
    if (this.bufferData.length === 0) return new ArrayBuffer(0);
    const result = new ArrayBuffer(this.bufferOffset);
    const bytes = new Uint8Array(result);
    let offset = 0;
    for (const buffer of this.bufferData) {
      bytes.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }
    return result;
  }

  private mapComponentType(type: string): GLTFComponentType {
    switch (type) {
      case 'byte':
        return GLTFComponentType.BYTE;
      case 'ubyte':
        return GLTFComponentType.UNSIGNED_BYTE;
      case 'short':
        return GLTFComponentType.SHORT;
      case 'ushort':
        return GLTFComponentType.UNSIGNED_SHORT;
      case 'uint':
        return GLTFComponentType.UNSIGNED_INT;
      case 'float':
      default:
        return GLTFComponentType.FLOAT;
    }
  }

  private getPrimitiveMode(mode?: string): GLTFPrimitiveMode {
    switch (mode) {
      case 'points':
        return GLTFPrimitiveMode.POINTS;
      case 'lines':
        return GLTFPrimitiveMode.LINES;
      case 'lineLoop':
        return GLTFPrimitiveMode.LINE_LOOP;
      case 'lineStrip':
        return GLTFPrimitiveMode.LINE_STRIP;
      case 'triangleStrip':
        return GLTFPrimitiveMode.TRIANGLE_STRIP;
      case 'triangleFan':
        return GLTFPrimitiveMode.TRIANGLE_FAN;
      case 'triangles':
      default:
        return GLTFPrimitiveMode.TRIANGLES;
    }
  }

  private getMagFilter(filter?: string): GLTFMagFilter {
    switch (filter) {
      case 'nearest':
        return GLTFMagFilter.NEAREST;
      case 'linear':
      default:
        return GLTFMagFilter.LINEAR;
    }
  }

  private getMinFilter(filter?: string): GLTFMinFilter {
    switch (filter) {
      case 'nearest':
        return GLTFMinFilter.NEAREST;
      case 'linear':
        return GLTFMinFilter.LINEAR;
      case 'trilinear':
      default:
        return GLTFMinFilter.LINEAR_MIPMAP_LINEAR;
    }
  }

  private getWrapMode(wrap?: string): GLTFWrapMode {
    switch (wrap) {
      case 'clamp':
        return GLTFWrapMode.CLAMP_TO_EDGE;
      case 'mirror':
        return GLTFWrapMode.MIRRORED_REPEAT;
      case 'repeat':
      default:
        return GLTFWrapMode.REPEAT;
    }
  }

  private getComponentCount(type: GLTFAccessorType): number {
    switch (type) {
      case 'SCALAR':
        return 1;
      case 'VEC2':
        return 2;
      case 'VEC3':
        return 3;
      case 'VEC4':
        return 4;
      case 'MAT2':
        return 4;
      case 'MAT3':
        return 9;
      case 'MAT4':
        return 16;
    }
  }

  /**
   * Apply advanced compression to the GLTF document
   */
  private async applyCompression(): Promise<void> {
    const compressionType = this.options.compression;

    // Create compression options based on export options
    const compressor = new AdvancedCompression({
      compressTextures: true,
      textureFormat: 'ktx2',
      textureQuality: 75,
      qualityPreset: 'balanced',
      compressMeshes: compressionType === 'draco' || compressionType === 'meshopt',
      dracoLevel: 7,
      positionBits: 14,
      normalBits: 10,
      uvBits: 12,
      colorBits: 10,
      generateMipmaps: true,
    });

    // Compress the document
    this.document = await compressor.compress(this.document);

    // Store compression stats
    this.compressionStats = compressor.getStats();

    // Log compression report in development
  }

  /**
   * Get compression statistics
   */
  getCompressionStats(): CompressionStats | undefined {
    return this.compressionStats;
  }

  /**
   * Export scene graph to USDZ format for Apple Vision Pro
   * Converts to GLTF first, then to USD
   */
  async exportToUSDZ(
    sceneGraph: ISceneGraph,
    options?: IUSDZExportOptions
  ): Promise<IUSDZExportResult> {
    // Dynamic import to avoid circular dependency — only the class constructor
    // is loaded at runtime; types come from USDTypes (no cycle).
    const { USDZExporter } = await import('../usdz/USDZExporter');

    // Create USDZ exporter with options
    const usdzExporter = new USDZExporter(options);

    // Export directly from scene graph
    return usdzExporter.export(sceneGraph);
  }
}
