export function parseServicePort(value: string | undefined, fallback = 8000): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error('Service port must be a numeric TCP port.');
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error('Service port must be between 1 and 65535.');
  }
  return parsed;
}
