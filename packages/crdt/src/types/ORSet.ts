/**
 * Observed-Remove Set CRDT
 *
 * A set that supports add/remove operations with full causal consistency.
 * Uses unique tags to distinguish different add operations, ensuring that
 * concurrent adds are preserved even if an element was previously removed.
 *
 * @version 1.0.0
 */

import type { DIDSigner, SignedOperation } from '../auth/DIDSigner';
import { CRDTOperationType } from '../auth/DIDSigner';
import { v4 as uuidv4 } from 'uuid';

/**
 * Unique tag for each add operation
 */
interface AddTag {
  /** Operation ID that added this element */
  operationId: string;

  /** Actor DID that added this element */
  actorDid: string;

  /** Timestamp when added */
  timestamp: number;
}

/**
 * OR-Set element with associated add/remove tags
 */
interface ORSetElement<T> {
  /** The element value */
  value: T;

  /** Set of add tags (operations that added this element) */
  addTags: Set<string>; // operationId strings

  /** Set of remove tags (operations that removed this element) */
  removeTags: Set<string>; // operationId strings

  /** Metadata for each tag */
  tagMetadata: Map<string, AddTag>;
}

/**
 * Observed-Remove Set CRDT
 *
 * Implements an OR-Set where an element is in the set if it has at least
 * one add tag that hasn't been removed. This ensures that:
 * - Concurrent adds are preserved
 * - Remove-wins for observed adds
 * - Re-adding after remove is supported
 *
 * Properties:
 * - Strong Eventual Consistency: All replicas converge
 * - Add-biased: Concurrent add/remove → add wins
 * - Authenticated: All operations signed with DID
 */
export class ORSet<T> {
  private crdtId: string;
  private signer: DIDSigner;
  private elements: Map<string, ORSetElement<T>> = new Map();

  constructor(crdtId: string, signer: DIDSigner) {
    this.crdtId = crdtId;
    this.signer = signer;
  }

  /**
   * Add element to set (local operation)
   *
   * Creates a new unique tag for this add operation. Even if the element
   * was previously removed, this creates a new tag, allowing re-addition.
   */
  async add(value: T): Promise<SignedOperation> {
    const tag = uuidv4();
    const operation = this.signer.createOperation(CRDTOperationType.OR_SET_ADD, this.crdtId, {
      value,
      tag,
    });

    // Apply locally
    this.applyAdd(value, tag, operation.timestamp, operation.actorDid, operation.id);

    // Sign and return
    return await this.signer.signOperation(operation);
  }

  /**
   * Remove element from set (local operation)
   *
   * Removes all current add tags for this element. Concurrent adds with
   * tags we haven't observed yet will be preserved.
   */
  async remove(value: T): Promise<SignedOperation | null> {
    const key = this.keyForValue(value);
    const element = this.elements.get(key);

    if (!element) {
      // Element not in set, nothing to remove
      return null;
    }

    // Collect all current add tags (observed adds)
    const observedTags = Array.from(element.addTags);

    const operation = this.signer.createOperation(CRDTOperationType.OR_SET_REMOVE, this.crdtId, {
      value,
      observedTags,
    });

    // Apply locally
    this.applyRemove(value, observedTags);

    // Sign and return
    return await this.signer.signOperation(operation);
  }

  /**
   * Check if element is in set
   *
   * An element is in the set if it has at least one add tag that
   * hasn't been removed.
   */
  has(value: T): boolean {
    const key = this.keyForValue(value);
    const element = this.elements.get(key);

    if (!element) return false;

    // Element is in set if any add tag hasn't been removed
    for (const addTag of element.addTags) {
      if (!element.removeTags.has(addTag)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get all elements in set
   */
  values(): T[] {
    const result: T[] = [];

    for (const element of this.elements.values()) {
      if (this.isElementPresent(element)) {
        result.push(element.value);
      }
    }

    return result;
  }

  /**
   * Get set size
   */
  size(): number {
    let count = 0;

    for (const element of this.elements.values()) {
      if (this.isElementPresent(element)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Apply remote add operation
   */
  applyRemoteAdd(
    value: T,
    tag: string,
    timestamp: number,
    actorDid: string,
    operationId: string
  ): void {
    this.applyAdd(value, tag, timestamp, actorDid, operationId);
  }

  /**
   * Apply remote remove operation
   */
  applyRemoteRemove(value: T, observedTags: string[]): void {
    this.applyRemove(value, observedTags);
  }

  /**
   * Internal: Apply add operation
   */
  private applyAdd(
    value: T,
    tag: string,
    timestamp: number,
    actorDid: string,
    operationId: string
  ): void {
    const key = this.keyForValue(value);
    let element = this.elements.get(key);

    if (!element) {
      element = {
        value,
        addTags: new Set(),
        removeTags: new Set(),
        tagMetadata: new Map(),
      };
      this.elements.set(key, element);
    }

    // Add new tag
    element.addTags.add(tag);
    element.tagMetadata.set(tag, {
      operationId,
      actorDid,
      timestamp,
    });
  }

  /**
   * Internal: Apply remove operation
   */
  private applyRemove(value: T, observedTags: string[]): void {
    const key = this.keyForValue(value);
    const element = this.elements.get(key);

    if (!element) return;

    // Mark all observed tags as removed
    for (const tag of observedTags) {
      element.removeTags.add(tag);
    }

    // Cleanup: If all tags are removed, we can garbage collect this element
    // (but keep it for tombstone purposes in production)
  }

  /**
   * Check if element is present (has unremoved add tags)
   */
  private isElementPresent(element: ORSetElement<T>): boolean {
    for (const addTag of element.addTags) {
      if (!element.removeTags.has(addTag)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Create deterministic key for value
   */
  private keyForValue(value: T): string {
    return JSON.stringify(value);
  }

  /**
   * Get CRDT instance ID
   */
  getCRDTId(): string {
    return this.crdtId;
  }

  /**
   * Serialize set state
   */
  serialize(): string {
    const state = Array.from(this.elements.entries()).map(([key, element]) => ({
      key,
      value: element.value,
      addTags: Array.from(element.addTags),
      removeTags: Array.from(element.removeTags),
      tagMetadata: Array.from(element.tagMetadata.entries()),
    }));

    return JSON.stringify(state);
  }

  /**
   * Deserialize set state
   */
  static deserialize<T>(crdtId: string, signer: DIDSigner, serialized: string): ORSet<T> {
    const set = new ORSet<T>(crdtId, signer);

    const state = JSON.parse(serialized) as Array<{
      key: string;
      value: T;
      addTags: string[];
      removeTags: string[];
      tagMetadata: Array<[string, AddTag]>;
    }>;

    for (const item of state) {
      const element: ORSetElement<T> = {
        value: item.value,
        addTags: new Set(item.addTags),
        removeTags: new Set(item.removeTags),
        tagMetadata: new Map(item.tagMetadata),
      };
      set.elements.set(item.key, element);
    }

    return set;
  }
}
