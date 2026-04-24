/**
 * PropertyGrid — Type-aware property editors for the inspector
 *
 * Provides typed editing of component properties with undo integration,
 * multi-select batch editing, and custom property descriptors.
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export type PropertyType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'color'
  | 'vector3'
  | 'enum'
  | 'asset'
  | 'object';

export interface PropertyDescriptor {
  key: string;
  type: PropertyType;
  label?: string;
  defaultValue?: unknown;
  min?: number;
  max?: number;
  step?: number;
  enumValues?: string[];
  readonly?: boolean;
  group?: string;
  tooltip?: string;
}

export interface PropertyChange {
  targetId: string;
  key: string;
  oldValue: unknown;
  newValue: unknown;
  timestamp: number;
}

export interface PropertyGroupConfig {
  name: string;
  collapsed: boolean;
  order: number;
}

// =============================================================================
// PROPERTY GRID
// =============================================================================

export class PropertyGrid {
  private descriptors: Map<string, PropertyDescriptor[]> = new Map();
  private values: Map<string, Record<string, unknown>> = new Map();
  private changeHistory: PropertyChange[] = [];
  private groups: Map<string, PropertyGroupConfig> = new Map();
  private maxHistorySize: number = 100;

  private syncLegacyNumericAliases(target: Record<string, unknown>): void {
    // Backward compat for legacy callers/tests expecting vec-like [0]/[1]/[2]
    if ('x' in target && !('0' in target)) {
      Object.defineProperty(target, '0', { value: target.x, writable: true, enumerable: false });
    }
    if ('y' in target && !('1' in target)) {
      Object.defineProperty(target, '1', { value: target.y, writable: true, enumerable: false });
    }
    if ('z' in target && !('2' in target)) {
      Object.defineProperty(target, '2', { value: target.z, writable: true, enumerable: false });
    }

    if ('x' in target && '0' in target) (target as Record<number, unknown>)[0] = target.x;
    if ('y' in target && '1' in target) (target as Record<number, unknown>)[1] = target.y;
    if ('z' in target && '2' in target) (target as Record<number, unknown>)[2] = target.z;
  }

  /**
   * Register property descriptors for a component type
   */
  registerDescriptors(componentType: string, descriptors: PropertyDescriptor[]): void {
    this.descriptors.set(componentType, descriptors);
  }

  /**
   * Get descriptors for a component type
   */
  getDescriptors(componentType: string): PropertyDescriptor[] {
    return this.descriptors.get(componentType) || [];
  }

  /**
   * Set values for a specific target (entity/component)
   */
  setValues(targetId: string, values: Record<string, unknown>): void {
    const snapshot = { ...values };
    this.syncLegacyNumericAliases(snapshot);
    this.values.set(targetId, snapshot);
  }

  /**
   * Get current values for a target
   */
  getValues(targetId: string): Record<string, unknown> | undefined {
    return this.values.get(targetId);
  }

  /**
   * Set a single property value with history tracking
   */
  setValue(targetId: string, key: string, newValue: unknown): void {
    const target = this.values.get(targetId);
    if (!target) return;

    const oldValue = target[key];

    this.changeHistory.push({
      targetId,
      key,
      oldValue,
      newValue,
      timestamp: Date.now(),
    });

    if (this.changeHistory.length > this.maxHistorySize) {
      this.changeHistory.shift();
    }

    target[key] = newValue;
    this.syncLegacyNumericAliases(target);
  }

  /**
   * Batch edit: apply same property change to multiple targets
   */
  batchSetValue(targetIds: string[], key: string, newValue: unknown): number {
    let count = 0;
    for (const id of targetIds) {
      const target = this.values.get(id);
      if (target) {
        this.setValue(id, key, newValue);
        count++;
      }
    }
    return count;
  }

  /**
   * Undo the last property change
   */
  undo(): PropertyChange | undefined {
    const change = this.changeHistory.pop();
    if (!change) return undefined;

    const target = this.values.get(change.targetId);
    if (target) {
      target[change.key] = change.oldValue;
      this.syncLegacyNumericAliases(target);
    }
    return change;
  }

  /**
   * Get number of changes in history
   */
  getHistoryCount(): number {
    return this.changeHistory.length;
  }

  /**
   * Configure a property group
   */
  configureGroup(name: string, config: Partial<PropertyGroupConfig>): void {
    const existing = this.groups.get(name) || { name, collapsed: false, order: 0 };
    this.groups.set(name, { ...existing, ...config, name });
  }

  /**
   * Toggle group collapsed state
   */
  toggleGroup(name: string): void {
    const group = this.groups.get(name);
    if (group) {
      group.collapsed = !group.collapsed;
    }
  }

  /**
   * Get group config
   */
  getGroup(name: string): PropertyGroupConfig | undefined {
    return this.groups.get(name);
  }

  /**
   * Get all descriptors organized by group
   */
  getGroupedDescriptors(componentType: string): Map<string, PropertyDescriptor[]> {
    const descs = this.getDescriptors(componentType);
    const grouped = new Map<string, PropertyDescriptor[]>();

    for (const desc of descs) {
      const group = desc.group || 'General';
      if (!grouped.has(group)) {
        grouped.set(group, []);
      }
      grouped.get(group)!.push(desc);
    }

    return grouped;
  }

  /**
   * Validate a property value against its descriptor
   */
  validate(descriptor: PropertyDescriptor, value: unknown): { valid: boolean; error?: string } {
    if (descriptor.readonly) {
      return { valid: false, error: 'Property is readonly' };
    }

    switch (descriptor.type) {
      case 'number': {
        if (typeof value !== 'number') return { valid: false, error: 'Expected number' };
        if (descriptor.min !== undefined && value < descriptor.min)
          return { valid: false, error: `Value below minimum ${descriptor.min}` };
        if (descriptor.max !== undefined && value > descriptor.max)
          return { valid: false, error: `Value above maximum ${descriptor.max}` };
        return { valid: true };
      }
      case 'string':
        return typeof value === 'string'
          ? { valid: true }
          : { valid: false, error: 'Expected string' };
      case 'boolean':
        return typeof value === 'boolean'
          ? { valid: true }
          : { valid: false, error: 'Expected boolean' };
      case 'enum':
        if (descriptor.enumValues && !descriptor.enumValues.includes(value as string))
          return {
            valid: false,
            error: `Value must be one of: ${descriptor.enumValues.join(', ')}`,
          };
        return { valid: true };
      default:
        return { valid: true };
    }
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.descriptors.clear();
    this.values.clear();
    this.changeHistory = [];
    this.groups.clear();
  }
}
