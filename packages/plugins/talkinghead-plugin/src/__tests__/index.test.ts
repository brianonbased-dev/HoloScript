import { describe, it, expect } from 'vitest';
import { mapTalkingHead } from '../index';

describe('talkinghead-plugin stub', () => {
  it('computes coverage fraction', () => {
    const r = mapTalkingHead({
      clip_id: 'hello',
      duration_ms: 1000,
      visemes: [
        { viseme: 'aa', t_start_ms: 0, t_end_ms: 200 },
        { viseme: 'E', t_start_ms: 200, t_end_ms: 500 },
      ],
    });
    expect(r.viseme_count).toBe(2);
    expect(r.coverage).toBeCloseTo(0.5);
  });

  it('warns on overlapping visemes', () => {
    const r = mapTalkingHead({
      clip_id: 'bad',
      duration_ms: 1000,
      visemes: [
        { viseme: 'aa', t_start_ms: 0, t_end_ms: 300 },
        { viseme: 'E', t_start_ms: 200, t_end_ms: 500 },
      ],
    });
    expect(r.warnings.some((w) => w.includes('overlap'))).toBe(true);
  });

  it('warns on non-positive duration visemes', () => {
    const r = mapTalkingHead({
      clip_id: 'bad',
      duration_ms: 500,
      visemes: [{ viseme: 'sil', t_start_ms: 100, t_end_ms: 100 }],
    });
    expect(r.warnings.some((w) => w.includes('non-positive'))).toBe(true);
  });
});
