/**
 * UIDataBinding — Reactive model → view bindings with formatters
 *
 * @version 1.0.0
 */

export type BindingDirection = 'one-way' | 'two-way';
export type Formatter = (value: unknown) => string;

export interface DataBinding {
  id: string;
  modelPath: string;
  widgetId: string;
  widgetProperty: string;
  direction: BindingDirection;
  formatter?: Formatter;
}

export class UIDataBinding {
  private bindings: Map<string, DataBinding> = new Map();
  private model: Record<string, unknown> = {};
  private changeListeners: Map<string, Array<(value: unknown, old: unknown) => void>> = new Map();
  private nextId: number = 0;

  /**
   * Set a model value
   */
  set(path: string, value: unknown): void {
    const old = this.model[path];
    this.model[path] = value;
    const listeners = this.changeListeners.get(path);
    if (listeners) for (const cb of listeners) cb(value, old);
  }

  get<T = unknown>(path: string): T | undefined {
    return this.model[path] as T | undefined;
  }

  /**
   * Bind a model path to a widget property
   */
  bind(
    modelPath: string,
    widgetId: string,
    widgetProperty: string,
    direction: BindingDirection = 'one-way',
    formatter?: Formatter
  ): DataBinding {
    const id = `binding_${this.nextId++}`;
    const binding: DataBinding = { id, modelPath, widgetId, widgetProperty, direction, formatter };
    this.bindings.set(id, binding);
    return binding;
  }

  /**
   * Remove a binding
   */
  unbind(id: string): boolean {
    return this.bindings.delete(id);
  }

  /**
   * Resolve the display value for a binding
   */
  resolve(bindingId: string): string | null {
    const binding = this.bindings.get(bindingId);
    if (!binding) return null;
    const raw = this.model[binding.modelPath];
    if (binding.formatter) return binding.formatter(raw);
    return raw !== undefined ? String(raw) : '';
  }

  /**
   * Get all bindings for a widget
   */
  getBindingsForWidget(widgetId: string): DataBinding[] {
    return [...this.bindings.values()].filter((b) => b.widgetId === widgetId);
  }

  /**
   * Get all bindings for a model path
   */
  getBindingsForPath(path: string): DataBinding[] {
    return [...this.bindings.values()].filter((b) => b.modelPath === path);
  }

  /**
   * Listen for model changes
   */
  onChange(path: string, callback: (value: unknown, old: unknown) => void): void {
    if (!this.changeListeners.has(path)) this.changeListeners.set(path, []);
    this.changeListeners.get(path)!.push(callback);
  }

  /**
   * Propagate all bindings — returns resolved values keyed by binding id
   */
  propagate(): Map<string, string | null> {
    const result = new Map<string, string | null>();
    for (const [id] of this.bindings) {
      result.set(id, this.resolve(id));
    }
    return result;
  }

  getBindingCount(): number {
    return this.bindings.size;
  }
  getModel(): Record<string, unknown> {
    return { ...this.model };
  }
}
