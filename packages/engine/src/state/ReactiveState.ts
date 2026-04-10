/**
 * Minimal reactive proxy helper for engine ECS internals.
 *
 * Note: This is intentionally lightweight and only provides the `reactive`
 * API shape consumed by `ecs/World.ts`.
 */

export function reactive<T extends object>(
  target: T,
  onMutation?: (target: T, key: string | symbol, value: unknown, oldValue: unknown) => void
): T {
  return new Proxy(target, {
    get(obj, key: string | symbol) {
      const value = Reflect.get(obj, key);
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        return reactive(value as T, onMutation);
      }
      return value;
    },

    set(obj, key: string | symbol, value: unknown) {
      const oldValue = Reflect.get(obj, key);
      const result = Reflect.set(obj, key, value);
      if (oldValue !== value && onMutation) {
        onMutation(obj as T, key, value, oldValue);
      }
      return result;
    },
  });
}

