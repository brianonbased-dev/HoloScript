import { describe, expect, it } from 'vitest';
import { parseArgs } from '../args';

describe('agent tooling commands', () => {
  it('parses graph-status command', () => {
    const opts = parseArgs(['graph-status', '--json']);

    expect(opts.command).toBe('graph-status');
    expect(opts.json).toBe(true);
  });

  it('parses impact-analysis command with scan dir', () => {
    const opts = parseArgs(['impact-analysis', 'src/cli.ts', '--dir', 'packages/cli/src']);

    expect(opts.command).toBe('impact-analysis');
    expect(opts.input).toBe('src/cli.ts');
    expect(opts.queryDir).toBe('packages/cli/src');
  });

  it('parses impact as an impact-analysis alias', () => {
    const opts = parseArgs(['impact', 'src/cli.ts', '--dir', 'packages/cli/src']);

    expect(opts.command).toBe('impact');
    expect(opts.input).toBe('src/cli.ts');
    expect(opts.queryDir).toBe('packages/cli/src');
  });

  it('parses twin-earth-status command', () => {
    const opts = parseArgs(['twin-earth-status', '--json']);

    expect(opts.command).toBe('twin-earth-status');
    expect(opts.json).toBe(true);
  });

  it('parses twin-earth-contract command', () => {
    const opts = parseArgs(['twin-earth-contract', '--json']);

    expect(opts.command).toBe('twin-earth-contract');
    expect(opts.json).toBe(true);
  });
});
