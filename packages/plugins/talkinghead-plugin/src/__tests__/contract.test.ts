/**
 * @holoscript/talkinghead-plugin — ADAPTER CONTRACT TEST
 *
 * Universal-IR coverage row 14 (TalkingHead WebXR lipsync).
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { mapTalkingHead, type TalkingHeadInput } from '../index';

function fixture(overrides: Partial<TalkingHeadInput> = {}): TalkingHeadInput {
  return {
    clip_id: 'hello',
    duration_ms: 1000,
    visemes: [
      { viseme: 'aa', t_start_ms: 0, t_end_ms: 200 },
      { viseme: 'E', t_start_ms: 200, t_end_ms: 500 },
      { viseme: 'O', t_start_ms: 500, t_end_ms: 800 },
    ],
    ...overrides,
  };
}

describe('CONTRACT: talkinghead-plugin adapter', () => {
  it('exposes mapTalkingHead at stable public path', () => {
    expect(typeof mod.mapTalkingHead).toBe('function');
  });

  it('lipsync.kind is @lipsync and target_id preserves clip_id', () => {
    const r = mapTalkingHead(fixture());
    expect(r.lipsync.kind).toBe('@lipsync');
    expect(r.lipsync.target_id).toBe('hello');
  });

  it('viseme_count equals input.visemes.length', () => {
    expect(mapTalkingHead(fixture()).viseme_count).toBe(3);
  });

  it('coverage is in [0, 1]', () => {
    const r = mapTalkingHead(fixture());
    expect(r.coverage).toBeGreaterThanOrEqual(0);
    expect(r.coverage).toBeLessThanOrEqual(1);
  });

  it('coverage = covered_ms / duration_ms', () => {
    // Fixture has 200 + 300 + 300 = 800 covered over 1000 total = 0.8
    expect(mapTalkingHead(fixture()).coverage).toBeCloseTo(0.8);
  });

  it('overlapping visemes produce a warning', () => {
    const r = mapTalkingHead({
      clip_id: 'bad',
      duration_ms: 1000,
      visemes: [
        { viseme: 'aa', t_start_ms: 0, t_end_ms: 300 },
        { viseme: 'E', t_start_ms: 200, t_end_ms: 500 },
      ],
    });
    expect(r.warnings.some((w) => /overlap/.test(w))).toBe(true);
  });

  it('non-positive viseme duration produces a warning + is skipped from coverage', () => {
    const r = mapTalkingHead({
      clip_id: 'bad',
      duration_ms: 500,
      visemes: [{ viseme: 'sil', t_start_ms: 100, t_end_ms: 100 }],
    });
    expect(r.warnings.some((w) => /non-positive/.test(w))).toBe(true);
    expect(r.coverage).toBe(0);
  });

  it('visemes are sorted by t_start_ms in emitted params', () => {
    const r = mapTalkingHead({
      clip_id: 'unordered',
      duration_ms: 1000,
      visemes: [
        { viseme: 'O', t_start_ms: 500, t_end_ms: 700 },
        { viseme: 'aa', t_start_ms: 0, t_end_ms: 200 },
      ],
    });
    const sorted = r.lipsync.params.viseme_events as Array<{ t_start_ms: number }>;
    expect(sorted[0].t_start_ms).toBeLessThanOrEqual(sorted[1].t_start_ms);
  });

  it('duration_ms=0 → coverage=0 (no divide-by-zero)', () => {
    const r = mapTalkingHead({ clip_id: 'empty', duration_ms: 0, visemes: [] });
    expect(r.coverage).toBe(0);
  });

  it('empty visemes list → viseme_count=0, no throw', () => {
    expect(() => mapTalkingHead(fixture({ visemes: [] }))).not.toThrow();
    const r = mapTalkingHead(fixture({ visemes: [] }));
    expect(r.viseme_count).toBe(0);
  });
});
