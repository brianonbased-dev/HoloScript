/**
 * Yjs adapter for benchmarks
 */

import * as Y from 'yjs';
import type { CRDTAdapter } from '../types.js';

export class YjsAdapter implements CRDTAdapter {
  name = 'yjs';
  private doc: Y.Doc;
  private text: Y.Text | null = null;
  private map: Y.Map<any> | null = null;
  private array: Y.Array<string> | null = null;
  private mode: 'text' | 'counter' | 'set' = 'text';

  constructor() {
    this.doc = new Y.Doc();
  }

  setText(value: string): void {
    if (!this.text) {
      this.text = this.doc.getText('benchmark');
    }
    this.mode = 'text';
    this.text.delete(0, this.text.length);
    this.text.insert(0, value);
  }

  getText(): string | null {
    return this.text?.toString() ?? null;
  }

  increment(amount: number = 1): void {
    if (!this.map) {
      this.map = this.doc.getMap('benchmark');
    }
    this.mode = 'counter';
    const current = (this.map.get('counter') as number) ?? 0;
    this.map.set('counter', current + amount);
  }

  getCount(): number {
    return (this.map?.get('counter') as number) ?? 0;
  }

  add(value: string): void {
    if (!this.array) {
      this.array = this.doc.getArray('benchmark');
    }
    this.mode = 'set';
    // Yjs Array doesn't have native set semantics, simulate with array
    if (!this.array.toArray().includes(value)) {
      this.array.push([value]);
    }
  }

  remove(value: string): void {
    if (!this.array) return;
    const index = this.array.toArray().indexOf(value);
    if (index !== -1) {
      this.array.delete(index, 1);
    }
  }

  has(value: string): boolean {
    return this.array?.toArray().includes(value) ?? false;
  }

  size(): number {
    // For set semantics, count unique values
    return new Set(this.array?.toArray() ?? []).size;
  }

  serialize(): Uint8Array {
    return Y.encodeStateAsUpdate(this.doc);
  }

  deserialize(data: Uint8Array): void {
    Y.applyUpdate(this.doc, data);
  }

  getMemoryUsage(): number {
    return this.serialize().byteLength;
  }

  destroy(): void {
    this.doc.destroy();
  }
}
