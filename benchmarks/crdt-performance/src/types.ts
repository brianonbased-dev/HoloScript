/**
 * Common types and interfaces for CRDT performance benchmarks
 */

export interface BenchmarkResult {
  name: string;
  library: 'holoscript' | 'yjs' | 'automerge';
  operation: string;
  avgTime: number;
  minTime: number;
  maxTime: number;
  ops: number;
  samples: number;
  hz: number;
  margin: number;
}

export interface MemoryResult {
  name: string;
  library: 'holoscript' | 'yjs' | 'automerge';
  operationCount: number;
  heapUsed: number;
  heapTotal: number;
  external: number;
  arrayBuffers: number;
}

export interface SerializationResult {
  name: string;
  library: 'holoscript' | 'yjs' | 'automerge';
  operationCount: number;
  serializedSize: number;
  serializeTime: number;
  deserializeTime: number;
}

export interface MergeResult {
  name: string;
  library: 'holoscript' | 'yjs' | 'automerge';
  concurrentEdits: number;
  mergeTime: number;
  conflicts: number;
  resolved: boolean;
}

export interface SigningResult {
  name: string;
  operation: string;
  signTime: number;
  verifyTime: number;
  operationCount: number;
}

export interface CRDTAdapter {
  name: string;

  // Text/Register operations
  setText(value: string): Promise<void> | void;
  getText(): string | null;

  // Counter operations
  increment(amount?: number): Promise<void> | void;
  getCount(): number;

  // Set operations
  add(value: string): Promise<void> | void;
  remove(value: string): Promise<void> | void;
  has(value: string): boolean;
  size(): number;

  // Serialization
  serialize(): Uint8Array | string;
  deserialize(data: Uint8Array | string): void;

  // Memory
  getMemoryUsage(): number;

  // Cleanup
  destroy(): void;
}

export interface TestDataset {
  small: string[]; // 1K operations
  medium: string[]; // 10K operations
  large: string[]; // 100K operations
}
