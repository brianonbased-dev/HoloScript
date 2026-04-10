import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseHolo } from '../HoloCompositionParser';

const EXAMPLES_DIR = join(__dirname, '..', 'examples', 'dead-tokens');

describe('dead token example files', () => {
  it('parses terrain example', () => {
    const source = readFileSync(join(EXAMPLES_DIR, 'terrain.holo'), 'utf8');
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.terrains?.[0]?.name).toBe('Mountains');
  });

  it('parses constraint example', () => {
    const source = readFileSync(join(EXAMPLES_DIR, 'constraint.holo'), 'utf8');
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.constraints?.[0]?.name).toBe('LookAt');
  });

  it('parses spawn_group example', () => {
    const source = readFileSync(join(EXAMPLES_DIR, 'spawn-group.holo'), 'utf8');
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.spawnGroups?.[0]?.name).toBe('Enemies');
  });

  it('parses norm example', () => {
    const source = readFileSync(join(EXAMPLES_DIR, 'norm.holo'), 'utf8');
    const result = parseHolo(source);
    expect(result.success).toBe(true);
    expect(result.ast?.norms?.[0]?.name).toBe('NoSpamming');
  });
});
