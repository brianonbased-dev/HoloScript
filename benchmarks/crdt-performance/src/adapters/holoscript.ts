/**
 * @holoscript/crdt adapter for benchmarks
 */

import { LWWRegister, ORSet, GCounter, createTestSigner, type DIDSigner } from '@holoscript/crdt';
import type { CRDTAdapter } from '../types.js';

export class HoloScriptCRDTAdapter implements CRDTAdapter {
  name = 'holoscript';
  private signer: DIDSigner;
  private register: LWWRegister<string> | null = null;
  private counter: GCounter | null = null;
  private set: ORSet<string> | null = null;
  private mode: 'register' | 'counter' | 'set' = 'register';

  constructor() {
    this.signer = createTestSigner('did:test:benchmark-actor');
  }

  async setText(value: string): Promise<void> {
    if (!this.register) {
      this.register = new LWWRegister<string>('benchmark-register', this.signer);
    }
    this.mode = 'register';
    await this.register.set(value);
  }

  getText(): string | null {
    return this.register?.get() ?? null;
  }

  async increment(amount: number = 1): Promise<void> {
    if (!this.counter) {
      this.counter = new GCounter('benchmark-counter', this.signer);
    }
    this.mode = 'counter';
    await this.counter.increment(amount);
  }

  getCount(): number {
    return this.counter?.value() ?? 0;
  }

  async add(value: string): Promise<void> {
    if (!this.set) {
      this.set = new ORSet<string>('benchmark-set', this.signer);
    }
    this.mode = 'set';
    await this.set.add(value);
  }

  async remove(value: string): Promise<void> {
    if (!this.set) return;
    await this.set.remove(value);
  }

  has(value: string): boolean {
    return this.set?.has(value) ?? false;
  }

  size(): number {
    return this.set?.size() ?? 0;
  }

  serialize(): string {
    if (this.mode === 'register' && this.register) {
      return this.register.serialize();
    } else if (this.mode === 'counter' && this.counter) {
      return this.counter.serialize();
    } else if (this.mode === 'set' && this.set) {
      return this.set.serialize();
    }
    return '{}';
  }

  deserialize(data: string): void {
    if (this.mode === 'register') {
      this.register = LWWRegister.deserialize('benchmark-register', this.signer, data);
    } else if (this.mode === 'counter') {
      this.counter = GCounter.deserialize('benchmark-counter', this.signer, data);
    } else if (this.mode === 'set') {
      this.set = ORSet.deserialize('benchmark-set', this.signer, data);
    }
  }

  getMemoryUsage(): number {
    const serialized = this.serialize();
    return new Blob([serialized]).size;
  }

  destroy(): void {
    this.register = null;
    this.counter = null;
    this.set = null;
  }
}
