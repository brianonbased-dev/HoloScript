import type { ExternalSymbolDefinition } from './types';

function shortStableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function makeSymbolObjectId(sym: ExternalSymbolDefinition): string {
  const owner = sym.owner ? `${sym.owner}.` : '';
  const label = `${owner}${sym.name}`;
  const site = `${sym.filePath}:${sym.line ?? 0}:${sym.type}:${sym.visibility}`;
  return `${label}__${shortStableHash(site)}`;
}

export function sanitizeHoloId(value: string): string {
  return value.replace(/[\\\/]/g, '/').replace(/[^a-zA-Z0-9_\-\/\.]/g, '_');
}
