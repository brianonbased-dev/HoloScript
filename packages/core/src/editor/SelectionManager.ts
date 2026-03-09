import { trigger, track } from '../state/ReactiveState';
import { Entity } from '../ecs/World';

/**
 * SelectionManager
 *
 * Manages the set of currently selected entities in the editor.
 * Implements manual reactivity for Set operations since standard reactive() proxy
 * does not support Set methods out of the box.
 */
export class SelectionManager {
  private _selected: Set<Entity> = new Set();

  // We use the Set instance itself as the dependency target

  constructor() {}

  /**
   * Get the selected set. Accessing this tracks dependency.
   */
  get selected(): ReadonlySet<Entity> {
    track(this._selected, 'value');
    return this._selected;
  }

  /**
   * Select an entity.
   * @param entity The entity to select.
   * @param additive If true, adds to current selection. If false, replaces selection.
   */
  select(entity: Entity, additive: boolean = false): void {
    let changed = false;
    if (!additive) {
      if (this._selected.size !== 1 || !this._selected.has(entity)) {
        this._selected.clear();
        this._selected.add(entity);
        changed = true;
      }
    } else {
      if (!this._selected.has(entity)) {
        this._selected.add(entity);
        changed = true;
      }
    }

    if (changed) {
      trigger(this._selected, 'value');
    }
  }

  /**
   * Deselect an entity.
   */
  deselect(entity: Entity): void {
    if (this._selected.has(entity)) {
      this._selected.delete(entity);
      trigger(this._selected, 'value');
    }
  }

  /**
   * Toggle selection state of an entity.
   */
  toggle(entity: Entity): void {
    if (this._selected.has(entity)) {
      this._selected.delete(entity);
    } else {
      this._selected.add(entity);
    }
    trigger(this._selected, 'value');
  }

  /**
   * Clear all selection.
   */
  clear(): void {
    if (this._selected.size > 0) {
      this._selected.clear();
      trigger(this._selected, 'value');
    }
  }

  /**
   * Check if an entity is selected.
   */
  isSelected(entity: Entity): boolean {
    track(this._selected, 'value'); // Track if checking specific membership?
    // Ideally should track specific key, but for Set usually we track whole set or size.
    // For simplicity, track 'value'.
    return this._selected.has(entity);
  }

  /**
   * Get the primary selection (first item, or last added).
   * Useful for inspector to focus on one object.
   */
  get primary(): Entity | undefined {
    track(this._selected, 'value');
    // Sets preserve insertion order in JS
    let last: Entity | undefined;
    for (const e of this._selected) {
      last = e;
    }
    return last;
  }
}
