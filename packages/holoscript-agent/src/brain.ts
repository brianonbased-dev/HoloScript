import { readFile } from 'node:fs/promises';
import type { RuntimeBrainConfig } from './types.js';

export async function loadBrain(
  brainPath: string,
  scopeTier: 'cold' | 'warm' | 'hot' = 'warm'
): Promise<RuntimeBrainConfig> {
  const systemPrompt = await readFile(brainPath, 'utf8');
  const { domain, capabilityTags } = extractIdentity(systemPrompt);
  return { brainPath, systemPrompt, capabilityTags, domain, scopeTier };
}

function extractIdentity(brain: string): { domain: string; capabilityTags: string[] } {
  const identityBlock = sliceNamedBlock(brain, 'identity');
  if (!identityBlock) return { domain: 'unknown', capabilityTags: [] };
  const domain = scalarField(identityBlock, 'domain') ?? 'unknown';
  const capabilityTags = listField(identityBlock, 'capability_tags') ?? [];
  return { domain, capabilityTags };
}

function sliceNamedBlock(src: string, name: string): string | undefined {
  // Accept both `identity {` and `identity: {` — brain compositions in
  // .ai-ecosystem use both forms (lean-theorist + antigravity-hot use the
  // colon variant; security-auditor + others use the bare form). Without
  // both-form tolerance the colon-form brains parse to empty
  // capability_tags, breaking task scoring entirely (silent claim-blackhole
  // observed 2026-04-25 on W01 H200 lean-theorist).
  const re = new RegExp(`\\b${name}\\s*:?\\s*\\{`, 'g');
  const match = re.exec(src);
  if (!match) return undefined;
  const headerEnd = match.index + match[0].length; // position just past the `{`
  let depth = 1;
  for (let i = headerEnd; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(headerEnd, i);
    }
  }
  return undefined;
}

function scalarField(block: string, key: string): string | undefined {
  const idx = block.indexOf(`${key}:`);
  if (idx < 0) return undefined;
  const after = block.slice(idx + key.length + 1).trimStart();
  if (after.startsWith('"')) {
    const end = after.indexOf('"', 1);
    if (end > 0) return after.slice(1, end);
  }
  const eol = after.indexOf('\n');
  return after.slice(0, eol < 0 ? undefined : eol).trim();
}

function listField(block: string, key: string): string[] | undefined {
  const idx = block.indexOf(`${key}:`);
  if (idx < 0) return undefined;
  const after = block.slice(idx + key.length + 1).trimStart();
  if (!after.startsWith('[')) return undefined;
  let depth = 0;
  let end = -1;
  for (let i = 0; i < after.length; i++) {
    if (after[i] === '[') depth++;
    else if (after[i] === ']') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return undefined;
  const inner = after.slice(1, end);
  return inner
    .split(',')
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter((s) => s.length > 0);
}
