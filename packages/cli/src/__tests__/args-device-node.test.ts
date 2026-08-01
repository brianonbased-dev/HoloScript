import { describe, expect, it } from 'vitest';

import { parseArgs } from '../args';

describe('node device command parsing', () => {
  it('parses a public device plan request', () => {
    expect(
      parseArgs([
        'node',
        'plan',
        'examples/edge/public-holon-node.holo',
        '--device',
        'jetson-orin',
        '--json',
      ])
    ).toMatchObject({
      command: 'node',
      subcommand: 'plan',
      input: 'examples/edge/public-holon-node.holo',
      device: 'jetson-orin',
      json: true,
    });
  });
});
