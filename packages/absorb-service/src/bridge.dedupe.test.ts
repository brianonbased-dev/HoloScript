import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  onAbsorbComplete,
  type AbsorbCompletionEvent,
  type PipelineTriggerConfig,
} from './bridge';

describe('onAbsorbComplete', () => {
  const event: AbsorbCompletionEvent = {
    projectPath: '/repo/demo',
    stats: {
      filesProcessed: 12,
      patternsDetected: 3,
      technologiesFound: ['typescript'],
      confidence: 0.85,
    },
  };

  const config: PipelineTriggerConfig = {
    mode: 'continuous',
    targetProject: '',
    autoStart: true,
    notifyOnComplete: false,
  };

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'pipeline_test' }),
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not POST twice for the same project within the dedupe window', async () => {
    const r1 = await onAbsorbComplete(event, config);
    const r2 = await onAbsorbComplete(event, config);
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
