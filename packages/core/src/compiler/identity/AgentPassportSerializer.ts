/**
 * HoloScript Agent Passport Binary Serializer
 *
 * CBOR-inspired binary codec for compact Agent Passport serialization.
 *
 * Binary Format Layout:
 * ┌──────────────────────────────────────────────────────────────┐
 * │ HEADER (12 bytes)                                           │
 * │ ├─ Magic: "HSAP" (4 bytes)                                  │
 * │ ├─ Version: uint8 (1 byte)                                  │
 * │ ├─ Flags: uint8 (1 byte)                                    │
 * │ ├─ Section Count: uint16 BE (2 bytes)                       │
 * │ └─ Total Size: uint32 BE (4 bytes)                          │
 * ├──────────────────────────────────────────────────────────────┤
 * │ SECTION TABLE (N * 8 bytes)                                 │
 * │ ├─ Section Type: uint8 (1 byte)                             │
 * │ ├─ Reserved: uint8 (1 byte)                                 │
 * │ ├─ Section Offset: uint32 BE (4 bytes)                      │
 * │ └─ Section Length: uint16 BE (2 bytes) [or uint32 if large] │
 * ├──────────────────────────────────────────────────────────────┤
 * │ SECTION DATA (variable)                                     │
 * │ ├─ DID_IDENTITY section                                     │
 * │ ├─ STATE_WAL section                                        │
 * │ ├─ COMPRESSED_MEMORY section                                │
 * │ ├─ PERMISSIONS section                                      │
 * │ ├─ DELEGATION section                                       │
 * │ └─ SIGNATURE section                                        │
 * └──────────────────────────────────────────────────────────────┘
 *
 * Each section uses a type-length-value (TLV) encoding for fields.
 * Strings are UTF-8 encoded with uint16 BE length prefix.
 * Arrays use uint16 BE count prefix followed by elements.
 *
 * @version 1.0.0
 */

import { readJson } from '../../errors/safeJsonParse';
import {
  type AgentPassport,
  type AgentDIDDocument,
  type AgentStateSnapshot,
  type CompressedMemory,
  type CompressedWisdom,
  type CompressedPattern,
  type CompressedGotcha,
  type WALEntry,
  type DIDVerificationMethod,
  type DIDServiceEndpoint,
  type DIDVersion,
  PASSPORT_MAGIC,
  PASSPORT_FORMAT_VERSION,
  MAX_PASSPORT_SIZE,
  PassportSection,
  MemoryEntryType,
  WALOperation,
} from './AgentPassport';
import type { CapabilityToken } from './CapabilityToken';
import { AgentRole, AgentPermission, WorkflowStep } from './AgentIdentity';

// ============================================================================
// BINARY ENCODING PRIMITIVES
// ============================================================================

/**
 * Growable binary buffer for building passport binary data
 */
class BinaryWriter {
  private buffer: Buffer;
  private offset: number;

  constructor(initialSize: number = 4096) {
    this.buffer = Buffer.alloc(initialSize);
    this.offset = 0;
  }

  /** Ensure capacity for additional bytes */
  private ensureCapacity(additionalBytes: number): void {
    const required = this.offset + additionalBytes;
    if (required > this.buffer.length) {
      const newSize = Math.max(this.buffer.length * 2, required);
      const newBuffer = Buffer.alloc(newSize);
      this.buffer.copy(newBuffer);
      this.buffer = newBuffer;
    }
  }

  /** Write a single byte (uint8) */
  writeUint8(value: number): void {
    this.ensureCapacity(1);
    this.buffer.writeUInt8(value & 0xff, this.offset);
    this.offset += 1;
  }

  /** Write uint16 big-endian */
  writeUint16(value: number): void {
    this.ensureCapacity(2);
    this.buffer.writeUInt16BE(value & 0xffff, this.offset);
    this.offset += 2;
  }

  /** Write uint32 big-endian */
  writeUint32(value: number): void {
    this.ensureCapacity(4);
    this.buffer.writeUInt32BE(value >>> 0, this.offset);
    this.offset += 4;
  }

  /** Write float64 big-endian */
  writeFloat64(value: number): void {
    this.ensureCapacity(8);
    this.buffer.writeDoubleBE(value, this.offset);
    this.offset += 8;
  }

  /** Write a length-prefixed UTF-8 string (uint16 length + bytes) */
  writeString(value: string): void {
    const encoded = Buffer.from(value, 'utf8');
    if (encoded.length > 65535) {
      throw new Error(`String too long for uint16 length prefix: ${encoded.length} bytes`);
    }
    this.writeUint16(encoded.length);
    this.ensureCapacity(encoded.length);
    encoded.copy(this.buffer, this.offset);
    this.offset += encoded.length;
  }

  /** Write raw bytes */
  writeBytes(data: Uint8Array | Buffer): void {
    this.ensureCapacity(data.length);
    if (data instanceof Buffer) {
      data.copy(this.buffer, this.offset);
    } else {
      Buffer.from(data).copy(this.buffer, this.offset);
    }
    this.offset += data.length;
  }

  /** Write a length-prefixed byte array (uint32 length + bytes) */
  writeLengthPrefixedBytes(data: Uint8Array | Buffer): void {
    this.writeUint32(data.length);
    this.writeBytes(data);
  }

  /** Get current write position */
  getOffset(): number {
    return this.offset;
  }

  /** Set value at specific position (for back-patching) */
  setUint32At(position: number, value: number): void {
    this.buffer.writeUInt32BE(value >>> 0, position);
  }

  /** Set uint16 at specific position */
  setUint16At(position: number, value: number): void {
    this.buffer.writeUInt16BE(value & 0xffff, position);
  }

  /** Get the final buffer (trimmed to actual data) */
  toBuffer(): Buffer {
    return this.buffer.subarray(0, this.offset);
  }
}

/**
 * Binary reader for parsing passport binary data
 */
class BinaryReader {
  private buffer: Buffer;
  private offset: number;
  private readonly length: number;

  constructor(data: Buffer | Uint8Array) {
    this.buffer = data instanceof Buffer ? data : Buffer.from(data);
    this.offset = 0;
    this.length = this.buffer.length;
  }

  /** Check if enough bytes remain */
  private checkBounds(needed: number): void {
    if (this.offset + needed > this.length) {
      throw new Error(
        `Buffer underflow: need ${needed} bytes at offset ${this.offset}, ` +
          `but only ${this.length - this.offset} remain`
      );
    }
  }

  /** Read uint8 */
  readUint8(): number {
    this.checkBounds(1);
    const value = this.buffer.readUInt8(this.offset);
    this.offset += 1;
    return value;
  }

  /** Read uint16 big-endian */
  readUint16(): number {
    this.checkBounds(2);
    const value = this.buffer.readUInt16BE(this.offset);
    this.offset += 2;
    return value;
  }

  /** Read uint32 big-endian */
  readUint32(): number {
    this.checkBounds(4);
    const value = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }

  /** Read float64 big-endian */
  readFloat64(): number {
    this.checkBounds(8);
    const value = this.buffer.readDoubleBE(this.offset);
    this.offset += 8;
    return value;
  }

  /** Read length-prefixed UTF-8 string */
  readString(): string {
    const length = this.readUint16();
    this.checkBounds(length);
    const value = this.buffer.toString('utf8', this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  /** Read raw bytes */
  readBytes(length: number): Buffer {
    this.checkBounds(length);
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return Buffer.from(value);
  }

  /** Read length-prefixed byte array */
  readLengthPrefixedBytes(): Buffer {
    const length = this.readUint32();
    return this.readBytes(length);
  }

  /** Get current read position */
  getOffset(): number {
    return this.offset;
  }

  /** Set read position */
  setOffset(offset: number): void {
    if (offset > this.length) {
      throw new Error(`Cannot set offset ${offset} beyond buffer length ${this.length}`);
    }
    this.offset = offset;
  }

  /** Check if there are more bytes to read */
  hasRemaining(): boolean {
    return this.offset < this.length;
  }

  /** Get remaining byte count */
  remaining(): number {
    return this.length - this.offset;
  }
}

// ============================================================================
// SERIALIZATION FLAGS
// ============================================================================

/** Bitfield flags for the header */
export enum PassportFlags {
  /** Passport is signed */
  SIGNED = 0x01,
  /** Memory section is deflate-compressed */
  MEMORY_COMPRESSED = 0x02,
  /** WAL entries included */
  HAS_WAL_ENTRIES = 0x04,
  /** Delegation chain included (legacy) */
  HAS_DELEGATION = 0x08,
  /** UCAN capability delegation chain included */
  HAS_CAPABILITY_DELEGATION = 0x10,
  /** DID v2 format */
  DID_V2 = 0x20,
}

// ============================================================================
// SERIALIZER
// ============================================================================

/**
 * Serialize an AgentPassport to compact binary format
 *
 * @param passport - The passport to serialize
 * @returns Binary representation as Buffer
 * @throws Error if passport exceeds MAX_PASSPORT_SIZE
 */
export function serializePassport(passport: AgentPassport): Buffer {
  const writer = new BinaryWriter(8192);

  // Calculate flags
  let flags = 0;
  if (passport.signature) flags |= PassportFlags.SIGNED;
  if (passport.stateSnapshot.walEntries.length > 0) flags |= PassportFlags.HAS_WAL_ENTRIES;
  if (passport.delegationChain.length > 0) flags |= PassportFlags.HAS_DELEGATION;
  if (passport.capabilityDelegationChain && passport.capabilityDelegationChain.length > 0) {
    flags |= PassportFlags.HAS_CAPABILITY_DELEGATION;
  }
  if ((passport.didVersion || 1) === 2) flags |= PassportFlags.DID_V2;

  // Determine sections
  const sections: PassportSection[] = [
    PassportSection.DID_IDENTITY,
    PassportSection.STATE_WAL,
    PassportSection.COMPRESSED_MEMORY,
    PassportSection.PERMISSIONS,
  ];
  // Always include DID_VERSION section for v2 passports (or when didVersion is explicitly set)
  if (passport.didVersion !== undefined) {
    sections.push(PassportSection.DID_VERSION);
  }
  if (passport.delegationChain.length > 0) {
    sections.push(PassportSection.DELEGATION);
  }
  if (passport.capabilityDelegationChain && passport.capabilityDelegationChain.length > 0) {
    sections.push(PassportSection.CAPABILITY_DELEGATION);
  }
  if (passport.signature) {
    sections.push(PassportSection.SIGNATURE);
  }

  // ---- HEADER (12 bytes) ----
  writer.writeBytes(PASSPORT_MAGIC); // 4 bytes: "HSAP"
  writer.writeUint8(passport.version); // 1 byte: version
  writer.writeUint8(flags); // 1 byte: flags
  writer.writeUint16(sections.length); // 2 bytes: section count
  const totalSizeOffset = writer.getOffset();
  writer.writeUint32(0); // 4 bytes: total size (back-patched)

  // ---- SECTION TABLE ----
  // Reserve space for section table (8 bytes per section)
  const sectionTableStart = writer.getOffset();
  for (let i = 0; i < sections.length; i++) {
    writer.writeUint8(0); // section type
    writer.writeUint8(0); // reserved
    writer.writeUint32(0); // offset (back-patched)
    writer.writeUint16(0); // length (back-patched, only lower 16 bits)
  }

  // ---- SECTION DATA ----
  const sectionData: Array<{ type: PassportSection; offset: number; length: number }> = [];

  // Timestamps (shared across format)
  const dataStart = writer.getOffset();

  // Write issuedAt and expiresAt at the start of data
  writer.writeFloat64(passport.issuedAt);
  writer.writeFloat64(passport.expiresAt);
  writer.writeString(passport.workflowStep);

  // Section: DID_IDENTITY
  const didOffset = writer.getOffset();
  serializeDIDDocument(writer, passport.did);
  sectionData.push({
    type: PassportSection.DID_IDENTITY,
    offset: didOffset,
    length: writer.getOffset() - didOffset,
  });

  // Section: STATE_WAL
  const walOffset = writer.getOffset();
  serializeStateSnapshot(writer, passport.stateSnapshot);
  sectionData.push({
    type: PassportSection.STATE_WAL,
    offset: walOffset,
    length: writer.getOffset() - walOffset,
  });

  // Section: COMPRESSED_MEMORY
  const memOffset = writer.getOffset();
  serializeCompressedMemory(writer, passport.memory);
  sectionData.push({
    type: PassportSection.COMPRESSED_MEMORY,
    offset: memOffset,
    length: writer.getOffset() - memOffset,
  });

  // Section: PERMISSIONS
  const permOffset = writer.getOffset();
  serializePermissions(writer, passport.permissions);
  sectionData.push({
    type: PassportSection.PERMISSIONS,
    offset: permOffset,
    length: writer.getOffset() - permOffset,
  });

  // Section: DID_VERSION (optional, present for v2+ or when explicitly set)
  if (passport.didVersion !== undefined) {
    const dvOffset = writer.getOffset();
    writer.writeUint8(passport.didVersion);
    sectionData.push({
      type: PassportSection.DID_VERSION,
      offset: dvOffset,
      length: writer.getOffset() - dvOffset,
    });
  }

  // Section: DELEGATION (optional, legacy)
  if (passport.delegationChain.length > 0) {
    const delOffset = writer.getOffset();
    serializeDelegationChain(writer, passport.delegationChain);
    sectionData.push({
      type: PassportSection.DELEGATION,
      offset: delOffset,
      length: writer.getOffset() - delOffset,
    });
  }

  // Section: CAPABILITY_DELEGATION (optional, UCAN chain)
  if (passport.capabilityDelegationChain && passport.capabilityDelegationChain.length > 0) {
    const capDelOffset = writer.getOffset();
    serializeCapabilityDelegationChain(writer, passport.capabilityDelegationChain);
    sectionData.push({
      type: PassportSection.CAPABILITY_DELEGATION,
      offset: capDelOffset,
      length: writer.getOffset() - capDelOffset,
    });
  }

  // Section: SIGNATURE (optional)
  if (passport.signature) {
    const sigOffset = writer.getOffset();
    writer.writeString(passport.signingKeyId || '');
    writer.writeLengthPrefixedBytes(passport.signature);
    sectionData.push({
      type: PassportSection.SIGNATURE,
      offset: sigOffset,
      length: writer.getOffset() - sigOffset,
    });
  }

  // ---- BACK-PATCH ----
  // Total size
  const totalSize = writer.getOffset();
  writer.setUint32At(totalSizeOffset, totalSize);

  // Section table entries
  for (let i = 0; i < sectionData.length; i++) {
    const entryOffset = sectionTableStart + i * 8;
    const section = sectionData[i];
    // Use setters at specific positions to back-patch
    writer.setUint16At(entryOffset, (section.type << 8) | 0x00); // type + reserved
    writer.setUint32At(entryOffset + 2, section.offset);
    writer.setUint16At(entryOffset + 6, Math.min(section.length, 0xffff));
  }

  const result = writer.toBuffer();

  if (result.length > MAX_PASSPORT_SIZE) {
    throw new Error(
      `Serialized passport exceeds maximum size: ${result.length} > ${MAX_PASSPORT_SIZE}`
    );
  }

  return result;
}

// ============================================================================
// SECTION SERIALIZERS
// ============================================================================

function serializeDIDDocument(writer: BinaryWriter, did: AgentDIDDocument): void {
  writer.writeString(did.id);
  writer.writeString(did.agentRole);

  // Context array
  writer.writeUint16(did.context.length);
  for (const ctx of did.context) {
    writer.writeString(ctx);
  }

  // Verification methods
  writer.writeUint16(did.verificationMethod.length);
  for (const vm of did.verificationMethod) {
    writer.writeString(vm.id);
    writer.writeString(vm.type);
    writer.writeString(vm.controller);
    writer.writeString(vm.publicKeyMultibase);
  }

  // Authentication references
  writer.writeUint16(did.authentication.length);
  for (const auth of did.authentication) {
    writer.writeString(auth);
  }

  // Assertion method references
  writer.writeUint16(did.assertionMethod.length);
  for (const am of did.assertionMethod) {
    writer.writeString(am);
  }

  // Services (optional)
  const services = did.service || [];
  writer.writeUint16(services.length);
  for (const svc of services) {
    writer.writeString(svc.id);
    writer.writeString(svc.type);
    writer.writeString(svc.serviceEndpoint);
  }

  // Capability delegation references (v2)
  const capDel = did.capabilityDelegation || [];
  writer.writeUint16(capDel.length);
  for (const ref of capDel) {
    writer.writeString(ref);
  }

  // Capability invocation references (v2)
  const capInv = did.capabilityInvocation || [];
  writer.writeUint16(capInv.length);
  for (const ref of capInv) {
    writer.writeString(ref);
  }

  // Timestamps
  writer.writeString(did.created);
  writer.writeString(did.updated);

  // Agent checksum
  writer.writeString(did.agentChecksum.hash);
  writer.writeString(did.agentChecksum.algorithm);
  writer.writeString(did.agentChecksum.calculatedAt);
  writer.writeString(did.agentChecksum.label);
}

function serializeStateSnapshot(writer: BinaryWriter, snapshot: AgentStateSnapshot): void {
  writer.writeString(snapshot.agentId);
  writer.writeString(snapshot.currentPhase);
  writer.writeUint32(snapshot.cycleNumber);
  writer.writeString(snapshot.checkpointHash);
  writer.writeFloat64(snapshot.snapshotTimestamp);

  // Metrics
  writer.writeUint32(snapshot.metrics.phasesCompleted);
  writer.writeUint32(snapshot.metrics.totalCycles);
  writer.writeFloat64(snapshot.metrics.efficiencyScore);
  writer.writeUint32(snapshot.metrics.tokenUsage);

  // WAL entries
  writer.writeUint16(snapshot.walEntries.length);
  for (const entry of snapshot.walEntries) {
    writer.writeUint32(entry.sequence);
    writer.writeFloat64(entry.timestamp);
    writer.writeUint8(entry.operation);
    writer.writeString(entry.key);
    writer.writeLengthPrefixedBytes(entry.value);
    writer.writeString(entry.previousHash);
  }
}

function serializeCompressedMemory(writer: BinaryWriter, memory: CompressedMemory): void {
  // Memory header
  writer.writeFloat64(memory.compressionRatio);
  writer.writeUint32(memory.originalSizeBytes);
  writer.writeUint32(memory.compressedSizeBytes);

  // Wisdom entries
  writer.writeUint16(memory.wisdom.length);
  for (const w of memory.wisdom) {
    writer.writeUint8(MemoryEntryType.WISDOM);
    writer.writeString(w.id);
    writer.writeString(w.content);
    writer.writeString(w.domain);
    writer.writeUint8(Math.round(w.confidence * 255));
    writer.writeFloat64(w.timestamp);
  }

  // Pattern entries
  writer.writeUint16(memory.patterns.length);
  for (const p of memory.patterns) {
    writer.writeUint8(MemoryEntryType.PATTERN);
    writer.writeString(p.id);
    writer.writeString(p.name);
    writer.writeString(p.domain);
    writer.writeUint8(Math.round(p.confidence * 255));
    writer.writeUint32(p.usageCount);
    writer.writeString(p.template);
  }

  // Gotcha entries
  writer.writeUint16(memory.gotchas.length);
  for (const g of memory.gotchas) {
    writer.writeUint8(MemoryEntryType.GOTCHA);
    writer.writeString(g.id);
    writer.writeString(g.trigger);
    writer.writeString(g.avoidance);
    writer.writeString(g.severity);
    writer.writeUint32(g.occurrenceCount);
  }
}

function serializePermissions(writer: BinaryWriter, permissions: AgentPermission[]): void {
  writer.writeUint16(permissions.length);
  for (const perm of permissions) {
    writer.writeString(perm);
  }
}

function serializeDelegationChain(writer: BinaryWriter, chain: AgentRole[]): void {
  writer.writeUint16(chain.length);
  for (const role of chain) {
    writer.writeString(role);
  }
}

/**
 * Serialize UCAN capability delegation chain.
 *
 * Each CapabilityToken is serialized as a JSON string since the token
 * structure is complex and self-contained (header + payload + signature + raw).
 * This avoids duplicating the UCAN wire format in our binary codec.
 */
function serializeCapabilityDelegationChain(writer: BinaryWriter, chain: CapabilityToken[]): void {
  writer.writeUint16(chain.length);
  for (const token of chain) {
    // Serialize the full token as a JSON string
    writer.writeString(JSON.stringify(token));
  }
}

// ============================================================================
// DESERIALIZER
// ============================================================================

/**
 * Deserialize an AgentPassport from binary format
 *
 * @param data - Binary passport data
 * @returns Deserialized AgentPassport
 * @throws Error if data is malformed or corrupted
 */
export function deserializePassport(data: Buffer | Uint8Array): AgentPassport {
  const reader = new BinaryReader(data);

  // ---- HEADER ----
  const magic = reader.readBytes(4);
  if (
    magic[0] !== PASSPORT_MAGIC[0] ||
    magic[1] !== PASSPORT_MAGIC[1] ||
    magic[2] !== PASSPORT_MAGIC[2] ||
    magic[3] !== PASSPORT_MAGIC[3]
  ) {
    throw new Error('Invalid passport magic bytes: expected HSAP');
  }

  const version = reader.readUint8();
  if (version !== PASSPORT_FORMAT_VERSION) {
    throw new Error(`Unsupported passport version: ${version}`);
  }

  const flags = reader.readUint8();
  const sectionCount = reader.readUint16();
  const _totalSize = reader.readUint32();

  // ---- SECTION TABLE ----
  const sectionTable: Array<{ type: number; offset: number; length: number }> = [];
  for (let i = 0; i < sectionCount; i++) {
    const typeAndReserved = reader.readUint16();
    const type = (typeAndReserved >> 8) & 0xff;
    const offset = reader.readUint32();
    const length = reader.readUint16();
    sectionTable.push({ type, offset, length });
  }

  // ---- SHARED DATA ----
  const issuedAt = reader.readFloat64();
  const expiresAt = reader.readFloat64();
  const workflowStep = reader.readString() as WorkflowStep;

  // ---- SECTION DATA ----
  let did: AgentDIDDocument | undefined;
  let stateSnapshot: AgentStateSnapshot | undefined;
  let memory: CompressedMemory | undefined;
  let permissions: AgentPermission[] = [];
  let delegationChain: AgentRole[] = [];
  let capabilityDelegationChain: CapabilityToken[] | undefined;
  let didVersion: DIDVersion | undefined;
  let signature: Uint8Array | undefined;
  let signingKeyId: string | undefined;

  for (const section of sectionTable) {
    reader.setOffset(section.offset);

    switch (section.type) {
      case PassportSection.DID_IDENTITY:
        did = deserializeDIDDocument(reader);
        break;
      case PassportSection.STATE_WAL:
        stateSnapshot = deserializeStateSnapshot(reader);
        break;
      case PassportSection.COMPRESSED_MEMORY:
        memory = deserializeCompressedMemory(reader);
        break;
      case PassportSection.PERMISSIONS:
        permissions = deserializePermissions(reader);
        break;
      case PassportSection.DELEGATION:
        delegationChain = deserializeDelegationChain(reader);
        break;
      case PassportSection.CAPABILITY_DELEGATION:
        capabilityDelegationChain = deserializeCapabilityDelegationChain(reader);
        break;
      case PassportSection.DID_VERSION:
        didVersion = reader.readUint8() as DIDVersion;
        break;
      case PassportSection.SIGNATURE:
        signingKeyId = reader.readString();
        signature = new Uint8Array(reader.readLengthPrefixedBytes());
        break;
      default:
        // Skip unknown sections for forward compatibility
        break;
    }
  }

  if (!did) throw new Error('[AgentPassport] Missing DID_IDENTITY section. Expected "--- DID_IDENTITY ---" followed by "did:holoscript:<key>".');
  if (!stateSnapshot) throw new Error('[AgentPassport] Missing STATE_WAL section. Expected "--- STATE_WAL ---" followed by base64 state data.');
  if (!memory) throw new Error('[AgentPassport] Missing COMPRESSED_MEMORY section. Expected "--- COMPRESSED_MEMORY ---" followed by compressed data.');

  const passport: AgentPassport = {
    version,
    did,
    stateSnapshot,
    memory,
    permissions,
    delegationChain,
    workflowStep,
    issuedAt,
    expiresAt,
  };

  if (didVersion !== undefined) {
    passport.didVersion = didVersion;
  }

  if (capabilityDelegationChain && capabilityDelegationChain.length > 0) {
    passport.capabilityDelegationChain = capabilityDelegationChain;
  }

  if (signature) {
    passport.signature = signature;
    passport.signingKeyId = signingKeyId;
  }

  return passport;
}

// ============================================================================
// SECTION DESERIALIZERS
// ============================================================================

function deserializeDIDDocument(reader: BinaryReader): AgentDIDDocument {
  const id = reader.readString();
  const agentRole = reader.readString() as AgentRole;

  // Context
  const contextCount = reader.readUint16();
  const context: string[] = [];
  for (let i = 0; i < contextCount; i++) {
    context.push(reader.readString());
  }

  // Verification methods
  const vmCount = reader.readUint16();
  const verificationMethod: DIDVerificationMethod[] = [];
  for (let i = 0; i < vmCount; i++) {
    const vmId = reader.readString();
    const vmType = reader.readString() as 'Ed25519VerificationKey2020';
    const controller = reader.readString();
    const publicKeyMultibase = reader.readString();
    verificationMethod.push({
      id: vmId,
      type: vmType,
      controller,
      publicKeyMultibase,
    });
  }

  // Authentication
  const authCount = reader.readUint16();
  const authentication: string[] = [];
  for (let i = 0; i < authCount; i++) {
    authentication.push(reader.readString());
  }

  // Assertion methods
  const amCount = reader.readUint16();
  const assertionMethod: string[] = [];
  for (let i = 0; i < amCount; i++) {
    assertionMethod.push(reader.readString());
  }

  // Services
  const svcCount = reader.readUint16();
  const service: DIDServiceEndpoint[] = [];
  for (let i = 0; i < svcCount; i++) {
    service.push({
      id: reader.readString(),
      type: reader.readString(),
      serviceEndpoint: reader.readString(),
    });
  }

  // Capability delegation references (v2)
  const capDelCount = reader.readUint16();
  const capabilityDelegation: string[] = [];
  for (let i = 0; i < capDelCount; i++) {
    capabilityDelegation.push(reader.readString());
  }

  // Capability invocation references (v2)
  const capInvCount = reader.readUint16();
  const capabilityInvocation: string[] = [];
  for (let i = 0; i < capInvCount; i++) {
    capabilityInvocation.push(reader.readString());
  }

  // Timestamps
  const created = reader.readString();
  const updated = reader.readString();

  // Agent checksum
  const checksumHash = reader.readString();
  const checksumAlgorithm = reader.readString() as 'sha256';
  const checksumCalculatedAt = reader.readString();
  const checksumLabel = reader.readString();
  const agentChecksum = {
    hash: checksumHash,
    algorithm: checksumAlgorithm,
    calculatedAt: checksumCalculatedAt,
    label: checksumLabel,
  };

  return {
    id,
    context,
    verificationMethod,
    authentication,
    assertionMethod,
    capabilityDelegation: capabilityDelegation.length > 0 ? capabilityDelegation : undefined,
    capabilityInvocation: capabilityInvocation.length > 0 ? capabilityInvocation : undefined,
    service: service.length > 0 ? service : undefined,
    created,
    updated,
    agentRole,
    agentChecksum,
  };
}

function deserializeStateSnapshot(reader: BinaryReader): AgentStateSnapshot {
  const agentId = reader.readString();
  const currentPhase = reader.readString();
  const cycleNumber = reader.readUint32();
  const checkpointHash = reader.readString();
  const snapshotTimestamp = reader.readFloat64();

  // Metrics
  const metrics = {
    phasesCompleted: reader.readUint32(),
    totalCycles: reader.readUint32(),
    efficiencyScore: reader.readFloat64(),
    tokenUsage: reader.readUint32(),
  };

  // WAL entries
  const walCount = reader.readUint16();
  const walEntries: WALEntry[] = [];
  for (let i = 0; i < walCount; i++) {
    walEntries.push({
      sequence: reader.readUint32(),
      timestamp: reader.readFloat64(),
      operation: reader.readUint8() as WALOperation,
      key: reader.readString(),
      value: new Uint8Array(reader.readLengthPrefixedBytes()),
      previousHash: reader.readString(),
    });
  }

  return {
    agentId,
    currentPhase,
    cycleNumber,
    walEntries,
    checkpointHash,
    snapshotTimestamp,
    metrics,
  };
}

function deserializeCompressedMemory(reader: BinaryReader): CompressedMemory {
  const compressionRatio = reader.readFloat64();
  const originalSizeBytes = reader.readUint32();
  const compressedSizeBytes = reader.readUint32();

  // Wisdom
  const wisdomCount = reader.readUint16();
  const wisdom: CompressedWisdom[] = [];
  for (let i = 0; i < wisdomCount; i++) {
    const _entryType = reader.readUint8(); // MemoryEntryType.WISDOM
    wisdom.push({
      id: reader.readString(),
      content: reader.readString(),
      domain: reader.readString(),
      confidence: reader.readUint8() / 255,
      timestamp: reader.readFloat64(),
    });
  }

  // Patterns
  const patternCount = reader.readUint16();
  const patterns: CompressedPattern[] = [];
  for (let i = 0; i < patternCount; i++) {
    const _entryType = reader.readUint8(); // MemoryEntryType.PATTERN
    patterns.push({
      id: reader.readString(),
      name: reader.readString(),
      domain: reader.readString(),
      confidence: reader.readUint8() / 255,
      usageCount: reader.readUint32(),
      template: reader.readString(),
    });
  }

  // Gotchas
  const gotchaCount = reader.readUint16();
  const gotchas: CompressedGotcha[] = [];
  for (let i = 0; i < gotchaCount; i++) {
    const _entryType = reader.readUint8(); // MemoryEntryType.GOTCHA
    gotchas.push({
      id: reader.readString(),
      trigger: reader.readString(),
      avoidance: reader.readString(),
      severity: reader.readString() as CompressedGotcha['severity'],
      occurrenceCount: reader.readUint32(),
    });
  }

  return {
    wisdom,
    patterns,
    gotchas,
    compressionRatio,
    originalSizeBytes,
    compressedSizeBytes,
  };
}

function deserializePermissions(reader: BinaryReader): AgentPermission[] {
  const count = reader.readUint16();
  const permissions: AgentPermission[] = [];
  for (let i = 0; i < count; i++) {
    permissions.push(reader.readString() as AgentPermission);
  }
  return permissions;
}

function deserializeDelegationChain(reader: BinaryReader): AgentRole[] {
  const count = reader.readUint16();
  const chain: AgentRole[] = [];
  for (let i = 0; i < count; i++) {
    chain.push(reader.readString() as AgentRole);
  }
  return chain;
}

function deserializeCapabilityDelegationChain(reader: BinaryReader): CapabilityToken[] {
  const count = reader.readUint16();
  const chain: CapabilityToken[] = [];
  for (let i = 0; i < count; i++) {
    const jsonStr = reader.readString();
    chain.push(readJson(jsonStr) as CapabilityToken);
  }
  return chain;
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Calculate the binary size reduction compared to JSON
 *
 * @returns Object with JSON size, binary size, and compression ratio
 */
export function calculateSizeReduction(passport: AgentPassport): {
  jsonSize: number;
  binarySize: number;
  reductionPercent: number;
} {
  const jsonSize = Buffer.byteLength(JSON.stringify(passport), 'utf8');
  const binarySize = serializePassport(passport).length;
  const reductionPercent = ((jsonSize - binarySize) / jsonSize) * 100;

  return { jsonSize, binarySize, reductionPercent };
}

/**
 * Quick check if a buffer looks like a valid passport binary
 */
export function isPassportBinary(data: Buffer | Uint8Array): boolean {
  if (data.length < 12) return false;
  return (
    data[0] === PASSPORT_MAGIC[0] &&
    data[1] === PASSPORT_MAGIC[1] &&
    data[2] === PASSPORT_MAGIC[2] &&
    data[3] === PASSPORT_MAGIC[3]
  );
}
