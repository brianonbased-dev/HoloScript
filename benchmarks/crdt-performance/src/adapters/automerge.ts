/**
 * Automerge adapter for benchmarks
 */

import * as A from '@automerge/automerge';
import type { CRDTAdapter } from '../types.js';

interface AutomergeDoc {
  text?: string;
  counter?: number;
  set?: string[];
}

export class AutomergeAdapter implements CRDTAdapter {
  name = 'automerge';
  private doc: A.Doc<AutomergeDoc>;
  private mode: 'text' | 'counter' | 'set' = 'text';

  constructor() {
    this.doc = A.init<AutomergeDoc>();
  }

  setText(value: string): void {
    this.mode = 'text';
    this.doc = A.change(this.doc, doc => {
      doc.text = value;
    });
  }

  getText(): string | null {
    return this.doc.text ?? null;
  }

  increment(amount: number = 1): void {
    this.mode = 'counter';
    this.doc = A.change(this.doc, doc => {
      doc.counter = (doc.counter ?? 0) + amount;
    });
  }

  getCount(): number {
    return this.doc.counter ?? 0;
  }

  add(value: string): void {
    this.mode = 'set';
    this.doc = A.change(this.doc, doc => {
      if (!doc.set) doc.set = [];
      if (!doc.set.includes(value)) {
        doc.set.push(value);
      }
    });
  }

  remove(value: string): void {
    this.doc = A.change(this.doc, doc => {
      if (!doc.set) return;
      const index = doc.set.indexOf(value);
      if (index !== -1) {
        doc.set.splice(index, 1);
      }
    });
  }

  has(value: string): boolean {
    return this.doc.set?.includes(value) ?? false;
  }

  size(): number {
    return new Set(this.doc.set ?? []).size;
  }

  serialize(): Uint8Array {
    return A.save(this.doc);
  }

  deserialize(data: Uint8Array): void {
    this.doc = A.load<AutomergeDoc>(data);
  }

  getMemoryUsage(): number {
    return this.serialize().byteLength;
  }

  destroy(): void {
    // Automerge docs are immutable, no cleanup needed
  }
}
