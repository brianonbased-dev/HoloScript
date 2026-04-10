/**
 * Deep merge utility for configuration objects
 */

export function mergeConfigs<T extends Record<string, unknown>>(base: T, extension: Partial<T>): T {
  const result = { ...base };

  for (const key in extension) {
    const baseValue = base[key];
    const extensionValue = extension[key];

    if (extensionValue === undefined) continue;

    if (
      isObject(baseValue) &&
      isObject(extensionValue) &&
      !Array.isArray(baseValue) &&
      !Array.isArray(extensionValue)
    ) {
      (result as Record<string, unknown>)[key] = mergeConfigs(baseValue, extensionValue);
    } else {
      (result as Record<string, unknown>)[key] = extensionValue;
    }
  }

  return result;
}

function isObject(item: unknown): item is Record<string, unknown> {
  return item != null && typeof item === 'object' && !Array.isArray(item);
}
