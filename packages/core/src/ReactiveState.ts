/**
 * Reactive State System for HoloScript
 */

import type { HoloScriptValue, ReactiveState as IReactiveState } from './types';
import { evaluateExpressionText } from './runtime/runtime-expression';

/** What an expression may call besides any function its context holds: pure built-ins only. */
const ROOT_PROVIDED: Readonly<Record<string, unknown>> = Object.freeze({
  Math,
  Number,
  String,
  Boolean,
  parseInt,
  parseFloat,
  isNaN,
  isFinite,
  JSON,
});

export class ReactiveState implements IReactiveState {
  private state: Record<string, HoloScriptValue>;
  private proxy: Record<string, HoloScriptValue>;
  private subscribers: Set<(state: Record<string, HoloScriptValue>) => void> = new Set();

  constructor(initialState: Record<string, HoloScriptValue> = {}) {
    this.state = { ...initialState };
    this.proxy = this.createReactiveProxy(this.state);
  }

  private createReactiveProxy(
    target: Record<string, HoloScriptValue>
  ): Record<string, HoloScriptValue> {
    const self = this;
    return new Proxy(target, {
      get(obj, key) {
        const val = obj[key as string];
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          return self.createReactiveProxy(val as Record<string, HoloScriptValue>);
        }
        return val;
      },
      set(obj, key, value) {
        const oldVal = obj[key as string];
        obj[key as string] = value;
        if (oldVal !== value) {
          self.notify();
        }
        return true;
      },
    });
  }

  get(key: string): HoloScriptValue {
    return this.proxy[key];
  }

  set(key: string, value: HoloScriptValue): void {
    this.proxy[key] = value;
  }

  has(key: string): boolean {
    return this.proxy[key] !== undefined;
  }

  update(updates: Record<string, HoloScriptValue>): void {
    Object.assign(this.proxy, updates);
  }

  subscribe(callback: (state: Record<string, HoloScriptValue>) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  getSnapshot(): Record<string, HoloScriptValue> {
    return { ...this.state };
  }

  getProxy(): Record<string, HoloScriptValue> {
    return this.proxy;
  }

  private notify() {
    this.subscribers.forEach((cb) => cb(this.getSnapshot()));
  }
}

export class ExpressionEvaluator {
  private context: Record<string, unknown>;

  constructor(context: Record<string, unknown> = {}) {
    this.context = context;
  }

  evaluate(expression: string): unknown {
    if (typeof expression !== 'string') return expression;

    // If it's a template string with ${}, we need to interpolate
    if (expression.includes('${')) {
      // Special case: if the whole string is just one interpolation, return raw value
      // Use trim() to allow spaces like " ${ count } "
      const trimmed = expression.trim();
      const match = trimmed.match(/^\$\{([^}]+)\}$/);
      if (match) {
        return this.evaluate(match[1]);
      }
      return this.interpolate(expression);
    }

    // Parsed by the HoloScript parser and interpreted (runtime/runtime-expression.ts);
    // never evaluated as JavaScript. Text that is not an expression, or that names
    // something the context does not hold, comes back unchanged as a plain string
    // value (as `.hs` config values such as "postgresql+pgvector" rely on); a host
    // name or anything else refused yields undefined.
    try {
      return evaluateExpressionText(expression, this.context, ROOT_PROVIDED, 'text');
    } catch (_e) {
      // A provided function (JSON.parse, ...) threw: treat it as a plain string value.
      return expression;
    }
  }

  private interpolate(str: string): string {
    return str.replace(/\$\{([^}]+)\}/g, (_, expr) => {
      const val = this.evaluate(expr);
      return val !== undefined ? String(val) : '';
    });
  }

  updateContext(updates: Record<string, unknown>): void {
    Object.assign(this.context, updates);
  }

  setContext(context: Record<string, unknown>): void {
    this.context = { ...context };
  }
}

export function createState(initial: Record<string, HoloScriptValue> = {}): ReactiveState {
  return new ReactiveState(initial);
}
