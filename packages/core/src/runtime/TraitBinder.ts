import type { TraitHandler } from '../traits/TraitTypes';
import { TraitComposer } from '../compiler/TraitComposer';

type ConfigRecord = Record<string, unknown>;

export class TraitBinder {
  private handlers = new Map<string, TraitHandler<ConfigRecord>>();
  private composer = new TraitComposer();

  register(name: string, handler: TraitHandler<ConfigRecord>): void {
    this.handlers.set(name, handler);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  resolve(name: string): TraitHandler<ConfigRecord> | undefined {
    return this.handlers.get(name);
  }

  registerComposed(name: string, sources: string[]): string[] {
    const result = this.composer.compose(name, this.handlers, sources);
    this.handlers.set(name, result.handler);
    return result.warnings;
  }
}
