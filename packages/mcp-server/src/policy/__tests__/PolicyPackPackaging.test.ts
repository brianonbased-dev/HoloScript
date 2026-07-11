import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { syncPolicyPack } from '../../../scripts/sync-policy-pack.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('MCP server policy-pack packaging', () => {
  it('copies the runtime policy fixture into dist with matching integrity', () => {
    const root = mkdtempSync(join(tmpdir(), 'holoscript-policy-pack-'));
    roots.push(root);
    const source = join(root, 'src', 'policy-pack.holo.hsplus');
    const destination = join(root, 'dist', 'policy-pack.holo.hsplus');
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(source, 'composition "Policy" {}\n', 'utf8');

    const result = syncPolicyPack({ source, destination });

    expect(readFileSync(destination, 'utf8')).toBe(readFileSync(source, 'utf8'));
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u);
  });
});
