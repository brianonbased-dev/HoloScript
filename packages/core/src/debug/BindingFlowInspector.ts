import { logger } from '../logger';

export interface BindingInfo {
  id: string;
  sourceId: string;
  targetId: string;
  property: string;
  expression: string;
  lastValue: unknown;
  updateCount: number;
}

/**
 * BindingFlowInspector - Visualizes data flow between objects
 */
export class BindingFlowInspector {
  private bindings: Map<string, BindingInfo> = new Map();
  private enabled: boolean = false;

  /**
   * Register a new data binding
   */
  public registerBinding(
    sourceId: string,
    targetId: string,
    property: string,
    expression: string
  ): string {
    const id = `${sourceId}->${targetId}:${property}`;
    this.bindings.set(id, {
      id,
      sourceId,
      targetId,
      property,
      expression,
      lastValue: undefined,
      updateCount: 0,
    });
    return id;
  }

  /**
   * Track an update to a binding
   */
  public trackUpdate(bindingId: string, value: unknown): void {
    if (!this.enabled) return;

    const binding = this.bindings.get(bindingId);
    if (binding) {
      binding.lastValue = value;
      binding.updateCount++;
      logger.debug(`[BindingFlow] Update ${bindingId}: ${JSON.stringify(value)}`);
    }
  }

  /**
   * Get all active bindings
   */
  public getActiveBindings(): BindingInfo[] {
    return Array.from(this.bindings.values());
  }

  /**
   * Get bindings for a specific target
   */
  public getTargetBindings(targetId: string): BindingInfo[] {
    return this.getActiveBindings().filter((b) => b.targetId === targetId);
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Reset all counters
   */
  public resetStats(): void {
    for (const binding of this.bindings.values()) {
      binding.updateCount = 0;
    }
  }
}

export const bindingFlowInspector = new BindingFlowInspector();
