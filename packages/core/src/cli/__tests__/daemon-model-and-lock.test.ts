import { describe, expect, it } from 'vitest';
import {
  resolveDaemonModel,
  shouldReclaimDaemonLock,
  isPidAlive,
} from '../daemon-model-and-lock';

describe('resolveDaemonModel', () => {
  it('keeps an explicit --model and does not rewrite it to the provider default', () => {
    expect(
      resolveDaemonModel({
        modelExplicit: true,
        cliModel: 'qwen3:4b-instruct',
        envModel: 'qwen3:4b-instruct-2507',
        providerDefault: 'qwen3:4b-instruct-2507',
      })
    ).toBe('qwen3:4b-instruct');
  });

  it('keeps HOLODAEMON_MODEL when --model is omitted instead of appending a default suffix', () => {
    expect(
      resolveDaemonModel({
        modelExplicit: false,
        envModel: 'qwen3:4b-instruct',
        providerDefault: 'qwen3:4b-instruct-2507',
      })
    ).toBe('qwen3:4b-instruct');
  });

  it('uses the provider default only when neither flag nor env selected a model', () => {
    expect(
      resolveDaemonModel({
        modelExplicit: false,
        envModel: '  ',
        providerDefault: 'qwen3:4b-instruct-2507',
      })
    ).toBe('qwen3:4b-instruct-2507');
  });
});

describe('shouldReclaimDaemonLock', () => {
  it('reclaims a fresh-heartbeat lock whose PID is dead', () => {
    expect(
      shouldReclaimDaemonLock({ pid: 999_999_999, heartbeat: Date.now() }, Date.now(), 120_000)
    ).toBe(true);
  });

  it('keeps a fresh lock owned by this live process', () => {
    expect(
      shouldReclaimDaemonLock({ pid: process.pid, heartbeat: Date.now() }, Date.now(), 120_000)
    ).toBe(false);
    expect(isPidAlive(process.pid)).toBe(true);
  });

  it('reclaims when heartbeat is stale even if the pid field looks live', () => {
    expect(
      shouldReclaimDaemonLock(
        { pid: process.pid, heartbeat: Date.now() - 121_000 },
        Date.now(),
        120_000
      )
    ).toBe(true);
  });
});
