/**
 * Binary Serializer
 *
 * High-performance binary serialization for scene graphs.
 * Uses a compact binary format with structure-of-arrays layout.
 *
 * @module export
 * @version 3.3.0
 */

import {
  ISceneGraph,
  ISceneNode,
  ITransform,
  IVector3,
  IQuaternion,
  IMaterial,
  ITexture,
  IMesh,
  IMeshPrimitive,
  IAnimation,
  type AttributeType,
  type PrimitiveMode,
  createEmptySceneGraph,
} from './SceneGraph';

// ============================================================================
// Constants
// ============================================================================

/** Binary format magic number: 'HLO3' */
const MAGIC = 0x484c4f33;

/** Current binary format version */
const VERSION = 1;

/** Chunk type identifiers */
const ChunkType = {
  HEADER: 0x01,
  METADATA: 0x02,
  NODES: 0x03,
  TRANSFORMS: 0x04,
  MATERIALS: 0x05,
  TEXTURES: 0x06,
  MESHES: 0x07,
  ANIMATIONS: 0x08,
  BUFFERS: 0x09,
  STRINGS: 0x0a,
  COMPONENTS: 0x0b,
} as const;

/** Pre-computed CRC32 lookup table (IEEE 802.3 polynomial) */
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  CRC32_TABLE[i] = crc >>> 0;
}

function computeCRC32(data: Uint8Array, start: number, length: number): number {
  let crc = 0xffffffff;
  const end = start + length;
  for (let i = start; i < end; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// ============================================================================
// Types
// ============================================================================

/**
 * Binary encoding options
 */
export interface IBinaryEncoderOptions {
  /** Use little endian (default: true) */
  littleEndian?: boolean;

  /** Compress strings with dictionary */
  compressStrings?: boolean;

  /** Quantize floats (bits: 16, 24, or 32) */
  floatPrecision?: 16 | 24 | 32;

  /** Align chunks to boundaries */
  chunkAlignment?: number;
}

/**
 * Binary decoding options
 */
export interface IBinaryDecoderOptions {
  /** Validate checksums */
  validateChecksums?: boolean;

  /** Strict mode */
  strict?: boolean;
}

/**
 * Chunk header
 */
interface _IChunkHeader {
  type: number;
  size: number;
  flags: number;
  checksum: number;
}

/**
 * String table for efficient string storage
 */
class StringTable {
  private strings: string[] = [];
  private indexMap = new Map<string, number>();

  /**
   * Add a string and return its index
   */
  add(str: string): number {
    const existing = this.indexMap.get(str);
    if (existing !== undefined) {
      return existing;
    }
    const index = this.strings.length;
    this.strings.push(str);
    this.indexMap.set(str, index);
    return index;
  }

  /**
   * Get string by index
   */
  get(index: number): string {
    return this.strings[index] ?? '';
  }

  /**
   * Get all strings
   */
  getAll(): string[] {
    return this.strings;
  }

  /**
   * Get string count
   */
  get size(): number {
    return this.strings.length;
  }

  /**
   * Clear the table
   */
  clear(): void {
    this.strings = [];
    this.indexMap.clear();
  }

  /**
   * Load strings from array
   */
  load(strings: string[]): void {
    this.strings = strings;
    this.indexMap.clear();
    for (let i = 0; i < strings.length; i++) {
      this.indexMap.set(strings[i], i);
    }
  }
}

// ============================================================================
// Binary Writer
// ============================================================================

/**
 * Low-level binary data writer
 */
export class BinaryWriter {
  private buffer: ArrayBuffer;
  private view: DataView;
  private offset = 0;
  private littleEndian: boolean;

  constructor(initialSize = 1024 * 1024, littleEndian = true) {
    this.buffer = new ArrayBuffer(initialSize);
    this.view = new DataView(this.buffer);
    this.littleEndian = littleEndian;
  }

  /**
   * Ensure capacity for additional bytes
   */
  private ensureCapacity(additionalBytes: number): void {
    const required = this.offset + additionalBytes;
    if (required > this.buffer.byteLength) {
      // Double the buffer size
      const newSize = Math.max(this.buffer.byteLength * 2, required);
      const newBuffer = new ArrayBuffer(newSize);
      new Uint8Array(newBuffer).set(new Uint8Array(this.buffer));
      this.buffer = newBuffer;
      this.view = new DataView(this.buffer);
    }
  }

  /**
   * Write unsigned 8-bit integer
   */
  writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.view.setUint8(this.offset, value);
    this.offset += 1;
  }

  /**
   * Write unsigned 16-bit integer
   */
  writeUint16(value: number): void {
    this.ensureCapacity(2);
    this.view.setUint16(this.offset, value, this.littleEndian);
    this.offset += 2;
  }

  /**
   * Write unsigned 32-bit integer
   */
  writeUint32(value: number): void {
    this.ensureCapacity(4);
    this.view.setUint32(this.offset, value, this.littleEndian);
    this.offset += 4;
  }

  /**
   * Write signed 32-bit integer
   */
  writeInt32(value: number): void {
    this.ensureCapacity(4);
    this.view.setInt32(this.offset, value, this.littleEndian);
    this.offset += 4;
  }

  /**
   * Write 32-bit float
   */
  writeFloat32(value: number): void {
    this.ensureCapacity(4);
    this.view.setFloat32(this.offset, value, this.littleEndian);
    this.offset += 4;
  }

  /**
   * Write 64-bit float
   */
  writeFloat64(value: number): void {
    this.ensureCapacity(8);
    this.view.setFloat64(this.offset, value, this.littleEndian);
    this.offset += 8;
  }

  /**
   * Write a 3D vector
   */
  writeVector3(v: IVector3): void {
    this.writeFloat32(v.x);
    this.writeFloat32(v.y);
    this.writeFloat32(v.z);
  }

  /**
   * Write a quaternion
   */
  writeQuaternion(q: IQuaternion): void {
    this.writeFloat32(q.x);
    this.writeFloat32(q.y);
    this.writeFloat32(q.z);
    this.writeFloat32(q.w);
  }

  /**
   * Write a transform
   */
  writeTransform(t: ITransform): void {
    this.writeVector3(t.position);
    this.writeQuaternion(t.rotation);
    this.writeVector3(t.scale);
  }

  /**
   * Write a UTF-8 string (length-prefixed)
   */
  writeString(str: string): void {
    const bytes = new TextEncoder().encode(str);
    this.writeUint32(bytes.length);
    this.ensureCapacity(bytes.length);
    new Uint8Array(this.buffer, this.offset, bytes.length).set(bytes);
    this.offset += bytes.length;
  }

  /**
   * Write raw bytes
   */
  writeBytes(data: ArrayBuffer | Uint8Array): void {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    this.writeUint32(bytes.length);
    this.ensureCapacity(bytes.length);
    new Uint8Array(this.buffer, this.offset, bytes.length).set(bytes);
    this.offset += bytes.length;
  }

  /**
   * Write boolean
   */
  writeBoolean(value: boolean): void {
    this.writeUint8(value ? 1 : 0);
  }

  /**
   * Write string index (2 bytes)
   */
  writeStringIndex(index: number): void {
    this.writeUint16(index);
  }

  /**
   * Align offset to boundary
   */
  align(boundary: number): void {
    const padding = (boundary - (this.offset % boundary)) % boundary;
    this.ensureCapacity(padding);
    this.offset += padding;
  }

  /**
   * Get current offset
   */
  getOffset(): number {
    return this.offset;
  }

  /**
   * Set offset (for patching)
   */
  setOffset(offset: number): void {
    this.offset = offset;
  }

  /**
   * Patch a uint32 at a specific offset
   */
  patchUint32(offset: number, value: number): void {
    this.view.setUint32(offset, value, this.littleEndian);
  }

  /**
   * Get a Uint8Array view of the current buffer contents
   */
  getUint8View(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /**
   * Get the final buffer (trimmed to actual size)
   */
  getBuffer(): ArrayBuffer {
    return this.buffer.slice(0, this.offset);
  }
}

// ============================================================================
// Binary Reader
// ============================================================================

/**
 * Low-level binary data reader
 */
export class BinaryReader {
  private view: DataView;
  private offset = 0;
  private littleEndian: boolean;

  constructor(buffer: ArrayBuffer, littleEndian = true) {
    this.view = new DataView(buffer);
    this.littleEndian = littleEndian;
  }

  /**
   * Read unsigned 8-bit integer
   */
  readUint8(): number {
    const value = this.view.getUint8(this.offset);
    this.offset += 1;
    return value;
  }

  /**
   * Read unsigned 16-bit integer
   */
  readUint16(): number {
    const value = this.view.getUint16(this.offset, this.littleEndian);
    this.offset += 2;
    return value;
  }

  /**
   * Read unsigned 32-bit integer
   */
  readUint32(): number {
    const value = this.view.getUint32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  /**
   * Read signed 32-bit integer
   */
  readInt32(): number {
    const value = this.view.getInt32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  /**
   * Read 32-bit float
   */
  readFloat32(): number {
    const value = this.view.getFloat32(this.offset, this.littleEndian);
    this.offset += 4;
    return value;
  }

  /**
   * Read 64-bit float
   */
  readFloat64(): number {
    const value = this.view.getFloat64(this.offset, this.littleEndian);
    this.offset += 8;
    return value;
  }

  /**
   * Read a 3D vector
   */
  readVector3(): IVector3 {
    return {
      x: this.readFloat32(),
      y: this.readFloat32(),
      z: this.readFloat32(),
    };
  }

  /**
   * Read a quaternion
   */
  readQuaternion(): IQuaternion {
    return {
      x: this.readFloat32(),
      y: this.readFloat32(),
      z: this.readFloat32(),
      w: this.readFloat32(),
    };
  }

  /**
   * Read a transform
   */
  readTransform(): ITransform {
    return {
      position: this.readVector3(),
      rotation: this.readQuaternion(),
      scale: this.readVector3(),
    };
  }

  /**
   * Read a UTF-8 string (length-prefixed)
   */
  readString(): string {
    const length = this.readUint32();
    const bytes = new Uint8Array(this.view.buffer, this.offset, length);
    this.offset += length;
    return new TextDecoder().decode(bytes);
  }

  /**
   * Read raw bytes
   */
  readBytes(): ArrayBuffer {
    const length = this.readUint32();
    const bytes = this.view.buffer.slice(this.offset, this.offset + length) as ArrayBuffer;
    this.offset += length;
    return bytes;
  }

  /**
   * Read boolean
   */
  readBoolean(): boolean {
    return this.readUint8() !== 0;
  }

  /**
   * Read string index (2 bytes)
   */
  readStringIndex(): number {
    return this.readUint16();
  }

  /**
   * Align offset to boundary
   */
  align(boundary: number): void {
    const padding = (boundary - (this.offset % boundary)) % boundary;
    this.offset += padding;
  }

  /**
   * Get current offset
   */
  getOffset(): number {
    return this.offset;
  }

  /**
   * Set offset
   */
  setOffset(offset: number): void {
    this.offset = offset;
  }

  /**
   * Check if at end of buffer
   */
  isEOF(): boolean {
    return this.offset >= this.view.byteLength;
  }

  /**
   * Get remaining bytes
   */
  remaining(): number {
    return this.view.byteLength - this.offset;
  }
}

// ============================================================================
// Binary Serializer
// ============================================================================

/**
 * High-performance binary serializer for scene graphs
 */
export class BinarySerializer {
  private options: IBinaryEncoderOptions;
  private stringTable = new StringTable();

  constructor(options: IBinaryEncoderOptions = {}) {
    this.options = {
      littleEndian: true,
      compressStrings: true,
      floatPrecision: 32,
      chunkAlignment: 4,
      ...options,
    };
  }

  /**
   * Encode a scene graph to binary
   */
  encode(sceneGraph: ISceneGraph): ArrayBuffer {
    this.stringTable.clear();
    const writer = new BinaryWriter(1024 * 1024, this.options.littleEndian);

    // Collect all strings first
    this.collectStrings(sceneGraph);

    // Write file header
    writer.writeUint32(MAGIC);
    writer.writeUint32(VERSION);
    writer.writeUint32(0); // Placeholder for total size
    writer.writeUint32(0); // Placeholder for chunk count

    const _chunkCountOffset = writer.getOffset() - 4;
    let chunkCount = 0;

    // Write string table chunk
    this.writeStringTableChunk(writer);
    chunkCount++;

    // Write metadata chunk
    this.writeMetadataChunk(writer, sceneGraph);
    chunkCount++;

    // Write nodes chunk
    this.writeNodesChunk(writer, sceneGraph);
    chunkCount++;

    // Write materials chunk
    if (sceneGraph.materials.length > 0) {
      this.writeMaterialsChunk(writer, sceneGraph.materials);
      chunkCount++;
    }

    // Write textures chunk
    if (sceneGraph.textures.length > 0) {
      this.writeTexturesChunk(writer, sceneGraph.textures);
      chunkCount++;
    }

    // Write meshes chunk
    if (sceneGraph.meshes.length > 0) {
      this.writeMeshesChunk(writer, sceneGraph.meshes);
      chunkCount++;
    }

    // Write animations chunk
    if (sceneGraph.animations.length > 0) {
      this.writeAnimationsChunk(writer, sceneGraph.animations);
      chunkCount++;
    }

    // Write buffers chunk
    if (sceneGraph.buffers.length > 0) {
      this.writeBuffersChunk(writer, sceneGraph.buffers);
      chunkCount++;
    }

    // Patch header with final values
    const totalSize = writer.getOffset();
    writer.patchUint32(8, totalSize);
    writer.patchUint32(12, chunkCount);

    return writer.getBuffer();
  }

  /**
   * Decode a scene graph from binary
   */
  decode(buffer: ArrayBuffer, options: IBinaryDecoderOptions = {}): ISceneGraph {
    const reader = new BinaryReader(buffer, this.options.littleEndian);

    // Read file header
    const magic = reader.readUint32();
    if (magic !== MAGIC) {
      throw new Error('Invalid binary scene: wrong magic number');
    }

    const version = reader.readUint32();
    if (version > VERSION) {
      throw new Error(`Unsupported binary version: ${version}`);
    }

    const _totalSize = reader.readUint32();
    const chunkCount = reader.readUint32();

    // Initialize scene graph
    const sceneGraph = createEmptySceneGraph('Untitled');

    // Read chunks
    for (let i = 0; i < chunkCount; i++) {
      this.readChunk(reader, sceneGraph, buffer, options);
    }

    return sceneGraph;
  }

  // ============================================================================
  // Private: String Collection
  // ============================================================================

  private collectStrings(sceneGraph: ISceneGraph): void {
    // Collect from metadata
    this.stringTable.add(sceneGraph.metadata.name);
    if (sceneGraph.metadata.description) {
      this.stringTable.add(sceneGraph.metadata.description);
    }
    if (sceneGraph.metadata.author) {
      this.stringTable.add(sceneGraph.metadata.author);
    }

    // Collect from nodes
    this.collectNodeStrings(sceneGraph.root);

    // Collect from materials
    for (const material of sceneGraph.materials) {
      this.stringTable.add(material.id);
      this.stringTable.add(material.name);
    }

    // Collect from textures
    for (const texture of sceneGraph.textures) {
      this.stringTable.add(texture.id);
      this.stringTable.add(texture.name);
      this.stringTable.add(texture.source);
    }

    // Collect from meshes
    for (const mesh of sceneGraph.meshes) {
      this.stringTable.add(mesh.id);
      this.stringTable.add(mesh.name);
    }

    // Collect from animations
    for (const animation of sceneGraph.animations) {
      this.stringTable.add(animation.id);
      this.stringTable.add(animation.name);
    }
  }

  private collectNodeStrings(node: ISceneNode): void {
    this.stringTable.add(node.id);
    this.stringTable.add(node.name);
    this.stringTable.add(node.type);
    for (const tag of node.tags) {
      this.stringTable.add(tag);
    }
    if (node.prefabRef) {
      this.stringTable.add(node.prefabRef);
    }
    for (const child of node.children) {
      this.collectNodeStrings(child);
    }
  }

  // ============================================================================
  // Private: Chunk Writers
  // ============================================================================

  private writeChunkHeader(writer: BinaryWriter, type: number, flags = 0): number {
    const headerOffset = writer.getOffset();
    writer.writeUint32(type);
    writer.writeUint32(0); // Placeholder for size
    writer.writeUint32(flags);
    writer.writeUint32(0); // Placeholder for checksum
    return headerOffset;
  }

  private finalizeChunk(writer: BinaryWriter, headerOffset: number): void {
    const endOffset = writer.getOffset();
    const size = endOffset - headerOffset - 16; // Exclude header
    writer.patchUint32(headerOffset + 4, size);
    // CRC32 over chunk data (after 16-byte header)
    const dataStart = headerOffset + 16;
    const checksum = computeCRC32(writer.getUint8View(), dataStart, size);
    writer.patchUint32(headerOffset + 12, checksum);
    writer.align(this.options.chunkAlignment!);
  }

  private writeStringTableChunk(writer: BinaryWriter): void {
    const headerOffset = this.writeChunkHeader(writer, ChunkType.STRINGS);

    const strings = this.stringTable.getAll();
    writer.writeUint32(strings.length);
    for (const str of strings) {
      writer.writeString(str);
    }

    this.finalizeChunk(writer, headerOffset);
  }

  private writeMetadataChunk(writer: BinaryWriter, sceneGraph: ISceneGraph): void {
    const headerOffset = this.writeChunkHeader(writer, ChunkType.METADATA);

    const meta = sceneGraph.metadata;
    writer.writeStringIndex(this.stringTable.add(meta.name));
    writer.writeString(meta.description ?? '');
    writer.writeString(meta.author ?? '');
    writer.writeString(meta.license ?? '');
    writer.writeString(meta.createdAt);
    writer.writeString(meta.modifiedAt);

    // Tags
    writer.writeUint16(meta.tags.length);
    for (const tag of meta.tags) {
      writer.writeStringIndex(this.stringTable.add(tag));
    }

    this.finalizeChunk(writer, headerOffset);
  }

  private writeNodesChunk(writer: BinaryWriter, sceneGraph: ISceneGraph): void {
    const headerOffset = this.writeChunkHeader(writer, ChunkType.NODES);

    // Flatten node hierarchy for efficient storage
    const nodes: ISceneNode[] = [];
    const parentIndices: number[] = [];
    this.flattenNodes(sceneGraph.root, nodes, parentIndices, -1);

    writer.writeUint32(nodes.length);
    for (let i = 0; i < nodes.length; i++) {
      this.writeNode(writer, nodes[i], parentIndices[i]);
    }

    this.finalizeChunk(writer, headerOffset);
  }

  private flattenNodes(
    node: ISceneNode,
    nodes: ISceneNode[],
    parentIndices: number[],
    parentIndex: number
  ): void {
    const myIndex = nodes.length;
    nodes.push(node);
    parentIndices.push(parentIndex);

    for (const child of node.children) {
      this.flattenNodes(child, nodes, parentIndices, myIndex);
    }
  }

  private writeNode(writer: BinaryWriter, node: ISceneNode, parentIndex: number): void {
    writer.writeStringIndex(this.stringTable.add(node.id));
    writer.writeStringIndex(this.stringTable.add(node.name));
    writer.writeStringIndex(this.stringTable.add(node.type));
    writer.writeInt32(parentIndex);
    writer.writeTransform(node.transform);
    writer.writeBoolean(node.active);
    writer.writeUint32(node.layers);

    // Tags
    writer.writeUint16(node.tags.length);
    for (const tag of node.tags) {
      writer.writeStringIndex(this.stringTable.add(tag));
    }

    // Components (simplified - just count for now)
    writer.writeUint16(node.components.length);
    // Full component serialization would go here

    // Prefab reference
    writer.writeBoolean(!!node.prefabRef);
    if (node.prefabRef) {
      writer.writeStringIndex(this.stringTable.add(node.prefabRef));
    }
  }

  private writeMaterialsChunk(writer: BinaryWriter, materials: IMaterial[]): void {
    const headerOffset = this.writeChunkHeader(writer, ChunkType.MATERIALS);

    writer.writeUint32(materials.length);
    for (const material of materials) {
      writer.writeStringIndex(this.stringTable.add(material.id));
      writer.writeStringIndex(this.stringTable.add(material.name));
      writer.writeUint8(material.type === 'pbr' ? 0 : material.type === 'unlit' ? 1 : 2);
      writer.writeBoolean(material.doubleSided);
      writer.writeUint8(
        material.alphaMode === 'opaque' ? 0 : material.alphaMode === 'mask' ? 1 : 2
      );
      writer.writeFloat32(material.alphaCutoff);

      // Base color
      writer.writeFloat32(material.baseColor[0]);
      writer.writeFloat32(material.baseColor[1]);
      writer.writeFloat32(material.baseColor[2]);
      writer.writeFloat32(material.baseColor[3]);

      // PBR factors
      writer.writeFloat32(material.metallic);
      writer.writeFloat32(material.roughness);
      writer.writeFloat32(material.normalScale);
      writer.writeFloat32(material.occlusionStrength);

      // Emissive
      writer.writeFloat32(material.emissiveColor[0]);
      writer.writeFloat32(material.emissiveColor[1]);
      writer.writeFloat32(material.emissiveColor[2]);
      writer.writeFloat32(material.emissiveIntensity);

      // Texture references (simplified)
      writer.writeBoolean(!!material.baseColorTexture);
      writer.writeBoolean(!!material.metallicRoughnessTexture);
      writer.writeBoolean(!!material.normalTexture);
      writer.writeBoolean(!!material.occlusionTexture);
      writer.writeBoolean(!!material.emissiveTexture);
    }

    this.finalizeChunk(writer, headerOffset);
  }

  private writeTexturesChunk(writer: BinaryWriter, textures: ITexture[]): void {
    const headerOffset = this.writeChunkHeader(writer, ChunkType.TEXTURES);

    writer.writeUint32(textures.length);
    for (const texture of textures) {
      writer.writeStringIndex(this.stringTable.add(texture.id));
      writer.writeStringIndex(this.stringTable.add(texture.name));
      writer.writeStringIndex(this.stringTable.add(texture.source));
      writer.writeUint16(texture.width);
      writer.writeUint16(texture.height);
      writer.writeBoolean(texture.generateMipmaps);
      writer.writeBoolean(texture.srgb);
    }

    this.finalizeChunk(writer, headerOffset);
  }

  private writeMeshesChunk(writer: BinaryWriter, meshes: IMesh[]): void {
    const headerOffset = this.writeChunkHeader(writer, ChunkType.MESHES);

    writer.writeUint32(meshes.length);
    for (const mesh of meshes) {
      writer.writeStringIndex(this.stringTable.add(mesh.id));
      writer.writeStringIndex(this.stringTable.add(mesh.name));

      // Bounds
      writer.writeVector3(mesh.bounds.min);
      writer.writeVector3(mesh.bounds.max);

      // Primitives
      writer.writeUint16(mesh.primitives.length);
      for (const primitive of mesh.primitives) {
        writer.writeUint8(primitive.mode === 'triangles' ? 4 : primitive.mode === 'lines' ? 1 : 0);
        writer.writeBoolean(!!primitive.materialRef);
        if (primitive.materialRef) {
          writer.writeStringIndex(this.stringTable.add(primitive.materialRef));
        }
      }
    }

    this.finalizeChunk(writer, headerOffset);
  }

  private writeAnimationsChunk(writer: BinaryWriter, animations: IAnimation[]): void {
    const headerOffset = this.writeChunkHeader(writer, ChunkType.ANIMATIONS);

    writer.writeUint32(animations.length);
    for (const animation of animations) {
      writer.writeStringIndex(this.stringTable.add(animation.id));
      writer.writeStringIndex(this.stringTable.add(animation.name));
      writer.writeFloat32(animation.duration);
      writer.writeUint16(animation.channels.length);
      writer.writeUint16(animation.samplers.length);
    }

    this.finalizeChunk(writer, headerOffset);
  }

  private writeBuffersChunk(
    writer: BinaryWriter,
    buffers: { id: string; byteLength: number; data?: ArrayBuffer }[]
  ): void {
    const headerOffset = this.writeChunkHeader(writer, ChunkType.BUFFERS);

    writer.writeUint32(buffers.length);
    for (const buffer of buffers) {
      writer.writeStringIndex(this.stringTable.add(buffer.id));
      writer.writeUint32(buffer.byteLength);
      if (buffer.data) {
        writer.writeBytes(buffer.data);
      } else {
        writer.writeUint32(0); // No embedded data
      }
    }

    this.finalizeChunk(writer, headerOffset);
  }

  // ============================================================================
  // Private: Chunk Readers
  // ============================================================================

  private readChunk(
    reader: BinaryReader,
    sceneGraph: ISceneGraph,
    buffer?: ArrayBuffer,
    decodeOptions?: IBinaryDecoderOptions
  ): void {
    const headerOffset = reader.getOffset();
    const type = reader.readUint32();
    const size = reader.readUint32();
    const _flags = reader.readUint32();
    const checksum = reader.readUint32();

    // Validate CRC32 checksum if requested
    if (decodeOptions?.validateChecksums && buffer) {
      const dataStart = headerOffset + 16;
      const expected = computeCRC32(new Uint8Array(buffer), dataStart, size);
      if (checksum !== expected) {
        throw new Error(
          `Chunk checksum mismatch at offset ${headerOffset}: expected 0x${expected.toString(16)}, got 0x${checksum.toString(16)}`
        );
      }
    }

    const startOffset = reader.getOffset();

    switch (type) {
      case ChunkType.STRINGS:
        this.readStringTableChunk(reader);
        break;
      case ChunkType.METADATA:
        this.readMetadataChunk(reader, sceneGraph);
        break;
      case ChunkType.NODES:
        this.readNodesChunk(reader, sceneGraph);
        break;
      case ChunkType.MATERIALS:
        this.readMaterialsChunk(reader, sceneGraph);
        break;
      case ChunkType.TEXTURES:
        this.readTexturesChunk(reader, sceneGraph);
        break;
      case ChunkType.MESHES:
        this.readMeshesChunk(reader, sceneGraph);
        break;
      case ChunkType.ANIMATIONS:
        this.readAnimationsChunk(reader, sceneGraph);
        break;
      case ChunkType.BUFFERS:
        this.readBuffersChunk(reader, sceneGraph);
        break;
      default:
        // Skip unknown chunks
        reader.setOffset(startOffset + size);
    }

    // Align to chunk boundary
    reader.align(this.options.chunkAlignment!);
  }

  private readStringTableChunk(reader: BinaryReader): void {
    const count = reader.readUint32();
    const strings: string[] = [];
    for (let i = 0; i < count; i++) {
      strings.push(reader.readString());
    }
    this.stringTable.load(strings);
  }

  private readMetadataChunk(reader: BinaryReader, sceneGraph: ISceneGraph): void {
    sceneGraph.metadata.name = this.stringTable.get(reader.readStringIndex());
    sceneGraph.metadata.description = reader.readString() || undefined;
    sceneGraph.metadata.author = reader.readString() || undefined;
    sceneGraph.metadata.license = reader.readString() || undefined;
    sceneGraph.metadata.createdAt = reader.readString();
    sceneGraph.metadata.modifiedAt = reader.readString();

    const tagCount = reader.readUint16();
    sceneGraph.metadata.tags = [];
    for (let i = 0; i < tagCount; i++) {
      sceneGraph.metadata.tags.push(this.stringTable.get(reader.readStringIndex()));
    }
  }

  private readNodesChunk(reader: BinaryReader, sceneGraph: ISceneGraph): void {
    const count = reader.readUint32();
    const nodes: ISceneNode[] = [];
    const parentIndices: number[] = [];

    for (let i = 0; i < count; i++) {
      const { node, parentIndex } = this.readNode(reader);
      nodes.push(node);
      parentIndices.push(parentIndex);
    }

    // Rebuild hierarchy
    if (nodes.length > 0) {
      sceneGraph.root = nodes[0];
      for (let i = 1; i < nodes.length; i++) {
        const parentIndex = parentIndices[i];
        if (parentIndex >= 0 && parentIndex < nodes.length) {
          nodes[parentIndex].children.push(nodes[i]);
        }
      }
    }
  }

  private readNode(reader: BinaryReader): { node: ISceneNode; parentIndex: number } {
    const id = this.stringTable.get(reader.readStringIndex());
    const name = this.stringTable.get(reader.readStringIndex());
    const type = this.stringTable.get(reader.readStringIndex()) as ISceneNode['type'];
    const parentIndex = reader.readInt32();
    const transform = reader.readTransform();
    const active = reader.readBoolean();
    const layers = reader.readUint32();

    const tagCount = reader.readUint16();
    const tags: string[] = [];
    for (let i = 0; i < tagCount; i++) {
      tags.push(this.stringTable.get(reader.readStringIndex()));
    }

    const _componentCount = reader.readUint16();
    // Skip component data for now

    const hasPrefabRef = reader.readBoolean();
    const prefabRef = hasPrefabRef ? this.stringTable.get(reader.readStringIndex()) : undefined;

    return {
      node: {
        id,
        name,
        type,
        transform,
        active,
        layers,
        tags,
        children: [],
        components: [],
        metadata: {},
        prefabRef,
      },
      parentIndex,
    };
  }

  private readMaterialsChunk(reader: BinaryReader, sceneGraph: ISceneGraph): void {
    const count = reader.readUint32();
    for (let i = 0; i < count; i++) {
      const id = this.stringTable.get(reader.readStringIndex());
      const name = this.stringTable.get(reader.readStringIndex());
      const typeCode = reader.readUint8();
      const type = typeCode === 0 ? 'pbr' : typeCode === 1 ? 'unlit' : 'custom';
      const doubleSided = reader.readBoolean();
      const alphaModeCode = reader.readUint8();
      const alphaMode = alphaModeCode === 0 ? 'opaque' : alphaModeCode === 1 ? 'mask' : 'blend';
      const alphaCutoff = reader.readFloat32();

      const baseColor: [number, number, number, number] = [
        reader.readFloat32(),
        reader.readFloat32(),
        reader.readFloat32(),
        reader.readFloat32(),
      ];

      const metallic = reader.readFloat32();
      const roughness = reader.readFloat32();
      const normalScale = reader.readFloat32();
      const occlusionStrength = reader.readFloat32();

      const emissiveColor: [number, number, number] = [
        reader.readFloat32(),
        reader.readFloat32(),
        reader.readFloat32(),
      ];
      const emissiveIntensity = reader.readFloat32();

      // Texture flags
      reader.readBoolean(); // baseColorTexture
      reader.readBoolean(); // metallicRoughnessTexture
      reader.readBoolean(); // normalTexture
      reader.readBoolean(); // occlusionTexture
      reader.readBoolean(); // emissiveTexture

      sceneGraph.materials.push({
        id,
        name,
        type,
        doubleSided,
        alphaMode,
        alphaCutoff,
        baseColor,
        metallic,
        roughness,
        normalScale,
        occlusionStrength,
        emissiveColor,
        emissiveIntensity,
      });
    }
  }

  private readTexturesChunk(reader: BinaryReader, sceneGraph: ISceneGraph): void {
    const count = reader.readUint32();
    for (let i = 0; i < count; i++) {
      const id = this.stringTable.get(reader.readStringIndex());
      const name = this.stringTable.get(reader.readStringIndex());
      const source = this.stringTable.get(reader.readStringIndex());
      const width = reader.readUint16();
      const height = reader.readUint16();
      const generateMipmaps = reader.readBoolean();
      const srgb = reader.readBoolean();

      sceneGraph.textures.push({
        id,
        name,
        source,
        sourceType: 'uri',
        mimeType: 'image/png',
        width,
        height,
        wrapS: 'repeat',
        wrapT: 'repeat',
        minFilter: 'linear',
        magFilter: 'linear',
        generateMipmaps,
        srgb,
      });
    }
  }

  private readMeshesChunk(reader: BinaryReader, sceneGraph: ISceneGraph): void {
    const count = reader.readUint32();
    for (let i = 0; i < count; i++) {
      const id = this.stringTable.get(reader.readStringIndex());
      const name = this.stringTable.get(reader.readStringIndex());
      const boundsMin = reader.readVector3();
      const boundsMax = reader.readVector3();

      const primitiveCount = reader.readUint16();
      const primitives: IMeshPrimitive[] = [];
      for (let j = 0; j < primitiveCount; j++) {
        const modeCode = reader.readUint8();
        const mode: PrimitiveMode =
          modeCode === 4 ? 'triangles' : modeCode === 1 ? 'lines' : 'points';
        const hasMaterialRef = reader.readBoolean();
        const materialRef = hasMaterialRef
          ? this.stringTable.get(reader.readStringIndex())
          : undefined;

        primitives.push({
          attributes: {} as Record<AttributeType, number>,
          mode,
          materialRef,
        });
      }

      sceneGraph.meshes.push({
        id,
        name,
        primitives,
        bounds: { min: boundsMin, max: boundsMax },
      });
    }
  }

  private readAnimationsChunk(reader: BinaryReader, sceneGraph: ISceneGraph): void {
    const count = reader.readUint32();
    for (let i = 0; i < count; i++) {
      const id = this.stringTable.get(reader.readStringIndex());
      const name = this.stringTable.get(reader.readStringIndex());
      const duration = reader.readFloat32();
      const _channelCount = reader.readUint16();
      const _samplerCount = reader.readUint16();

      sceneGraph.animations.push({
        id,
        name,
        duration,
        channels: [],
        samplers: [],
      });
    }
  }

  private readBuffersChunk(reader: BinaryReader, sceneGraph: ISceneGraph): void {
    const count = reader.readUint32();
    for (let i = 0; i < count; i++) {
      const id = this.stringTable.get(reader.readStringIndex());
      const byteLength = reader.readUint32();
      const dataLength = reader.readUint32();
      let data: ArrayBuffer | undefined;
      if (dataLength > 0) {
        data = reader.readBytes();
      }

      sceneGraph.buffers.push({
        id,
        byteLength,
        data,
      });
    }
  }
}
