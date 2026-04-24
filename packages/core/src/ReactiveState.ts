/**
 * Reactive State System for HoloScript
 */

import type { HoloScriptValue, ReactiveState as IReactiveState } from './types';

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
    const copy = { ...this.state } as Record<string | number, HoloScriptValue>;
    const values = Object.values(this.state);
    values.forEach((v, i) => { copy[i] = v; });
    return copy as Record<string, HoloScriptValue>;
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

    // Security: Block dangerous patterns including prototype-chain escape vectors.
    // This blocklist is defense-in-depth — for AI-generated expressions always use
    // @holoscript/security-sandbox instead of evaluating inline.
    const dangerousPatterns = [
      /\beval\s*\(/,
      /\brequire\s*\(/,
      /\bimport\s*\(/,
      /\bprocess\b/,
      /\bglobalThis?\b/,
      /\b__dirname\b/,
      /\b__filename\b/,
      /\bfs\b/,
      /\bchild_process\b/,
      // Prototype chain / constructor escape
      /\bconstructor\b/,
      /\b__proto__\b/,
      /\bprototype\b/,
      /\bObject\s*\.\s*(create|definePropert|getProto|assign|setProto)/,
      /\bReflect\b/,
      /\bProxy\b/,
      /\bFunction\b/,
      /\barguments\b/,
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(expression)) {
        // Security: blocked dangerous expression pattern
        return undefined;
      }
    }

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

    const keys = Object.keys(this.context);
    const values = Object.values(this.context);

    try {
      // "use strict" prevents `this` from resolving to the global object.
      // .call(null, ...) binds an explicit null `this` to eliminate the global scope.
      const fn = new Function(...keys, `"use strict"; return (${expression});`);
      return fn.call(null, ...values);
    } catch (_e) {
      // Not an expression — return as a plain string value
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
