/**
 * Automerge adapter for benchmarks
 */

import * as A from '@automerge/automerge';
import type { CRDTAdapter } from '../types.js';

/**
 * Document structure for Automerge CRDT operations.
 * Supports text, counter, and set data types for comprehensive benchmarking.
 */
interface AutomergeDoc {
  /** Text content for string-based operations */
  text?: string;
  /** Numeric counter for increment operations */
  counter?: number;
  /** Set of unique strings for collection operations */
  set?: string[];
}

/**
 * Automerge CRDT adapter for performance benchmarking.
 * Provides text, counter, and set operations using Automerge's conflict-free
 * replicated data type implementation.
 */
export class AutomergeAdapter implements CRDTAdapter {
  /** Adapter name for benchmark identification */
  name = 'automerge';
  
  /** Automerge document instance */
  private doc: A.Doc<AutomergeDoc>;
  
  /** Current operation mode for tracking data type usage */
  private mode: 'text' | 'counter' | 'set' = 'text';

  /**
   * Initialize a new Automerge adapter with an empty document.
   */
  constructor() {
    this.doc = A.init<AutomergeDoc>();
  }

  /**
   * Set text content in the document.
   * @param value - The text value to store
   */
  setText(value: string): void {
    this.mode = 'text';
    this.doc = A.change(this.doc, (doc) => {
      doc.text = value;
    });
  }

  /**
   * Get the current text content from the document.
   * @returns The stored text value, or null if not set
   */
  getText(): string | null {
    return this.doc.text ?? null;
  }

  /**
   * Increment the counter by the specified amount.
   * @param amount - The amount to increment by (default: 1)
   */
  increment(amount: number = 1): void {
    this.mode = 'counter';
    this.doc = A.change(this.doc, (doc) => {
      doc.counter = (doc.counter ?? 0) + amount;
    });
  }

  /**
   * Get the current counter value.
   * @returns The current counter value, or 0 if not set
   */
  getCount(): number {
    return this.doc.counter ?? 0;
  }

  /**
   * Add a value to the set.
   * @param value - The string value to add
   */
  add(value: string): void {
    this.mode = 'set';
    this.doc = A.change(this.doc, (doc) => {
      if (!doc.set) doc.set = [];
      if (!doc.set.includes(value)) {
        doc.set.push(value);
      }
    });
  }

  /**
   * Remove a value from the set.
   * @param value - The string value to remove
   */
  remove(value: string): void {
    this.doc = A.change(this.doc, (doc) => {
      if (!doc.set) return;
      const index = doc.set.indexOf(value);
      if (index !== -1) {
        doc.set.splice(index, 1);
      }
    });
  }

  /**
   * Check if the set contains a specific value.
   * @param value - The string value to check for
   * @returns True if the value exists in the set
   */
  has(value: string): boolean {
    return this.doc.set?.includes(value) ?? false;
  }

  /**
   * Get the number of unique values in the set.
   * @returns The size of the set
   */
  size(): number {
    return new Set(this.doc.set ?? []).size;
  }

  /**
   * Serialize the document to binary format.
   * @returns Binary representation of the document
   */
  serialize(): Uint8Array {
    return A.save(this.doc);
  }

  /**
   * Deserialize a document from binary format.
   * @param data - Binary data to deserialize
   */
  deserialize(data: Uint8Array): void {
    this.doc = A.load<AutomergeDoc>(data);
  }

  /**
   * Get the memory usage of the document in bytes.
   * @returns Size of the serialized document in bytes
   */
  getMemoryUsage(): number {
    return this.serialize().byteLength;
  }

  /**
   * Clean up resources. Automerge documents are immutable,
   * so no cleanup is needed.
   */
  destroy(): void {
    // Automerge docs are immutable, no cleanup needed
  }
}
