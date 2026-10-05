/**
 * runWatchMode reports a refused chunk instead of a build (task 9a7o). Before 2026-09-29 the
 * incremental parser dropped a refused chunk with no error, and this loop printed "Built". No
 * CLI command calls runWatchMode today (see WatchCommand.ts), so no user saw that message.
 * The file watcher and the file read are replaced so no file system is touched.
 */
import { EventEmitter } from 'node:events';
import { beforeAll, describe, expect, test, vi } from 'vitest';

const state = vi.hoisted(() => ({ watchers: [] as EventEmitter[], source: '' }));

vi.mock('../Watcher', async () => {
  const { EventEmitter: Emitter } = await import('node:events');
  return {
    FileWatcher: class extends Emitter {
      constructor() {
        super();
        state.watchers.push(this);
      }
      async start(): Promise<void> {}
      async stop(): Promise<void> {}
    },
  };
});

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
  readFile: vi.fn(async () => state.source),
}));

const REFUSED = `orb "Before" {
  color: "blue"
}

orb "Lamp" {
  color: "red"
  function glow(): i32 {
    return missing(1)
  }
}

orb "After" {
  color: "green"
}
`;

async function watchOnce(source: string) {
  const { runWatchMode } = await import('../WatchCommand');
  const { WatchReporter } = await import('../Reporter');
  const built = vi.spyOn(WatchReporter.prototype, 'built').mockImplementation(() => {});
  const errors = vi.spyOn(WatchReporter.prototype, 'errors').mockImplementation(() => {});
  vi.spyOn(WatchReporter.prototype, 'watching').mockImplementation(() => {});
  vi.spyOn(WatchReporter.prototype, 'changed').mockImplementation(() => {});
  state.source = source;
  await runWatchMode({ include: ['**/*.hsplus'], noColor: true });
  const watcher = state.watchers[state.watchers.length - 1];
  watcher.emit('change', [{ type: 'change', filePath: '/project/lamp.hsplus' }]);
  await vi.waitFor(() => expect(built.mock.calls.length + errors.mock.calls.length).toBe(1));
  return { built, errors };
}

describe('runWatchMode (task 9a7o)', () => {
  // The first import transforms @holoscript/core's barrel, which took about 55 s on a cold run
  // in review: setup cost, given its own allowance rather than the 30 s each test gets.
  beforeAll(async () => {
    await import('../WatchCommand');
    await import('../Reporter');
  }, 300_000);

  test('a refused chunk is reported as an error with its position, not as a build', async () => {
    const { built, errors } = await watchOnce(REFUSED);
    expect(built).not.toHaveBeenCalled();
    const reported = errors.mock.calls[0][0].errors ?? [];
    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatch(/^8:12 HS-NAME-002 .*unknown function `missing`/);
    vi.restoreAllMocks();
  });

  test('a file whose chunks all parse is reported as built', async () => {
    const { built, errors } = await watchOnce(REFUSED.replace('return missing(1)', 'return 1'));
    expect(errors).not.toHaveBeenCalled();
    expect(built).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
