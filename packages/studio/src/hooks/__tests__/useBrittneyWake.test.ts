// @vitest-environment jsdom
/**
 * useBrittneyWake — opening the panel wakes Brittney; while she wakes the panel says
 * "waking up" with the time left (never an error) and notices on its own when she is ready.
 */
import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  READY_NOTICE_MS,
  WAKE_GIVE_UP_MS,
  WAKE_POLL_MS,
  useBrittneyWake,
  wakeNoticeText,
} from '../useBrittneyWake';

function warmFetch(...answers: Array<{ status: number; body?: unknown }>) {
  const queue = [...answers];
  return vi.fn(async (_url: string, _init?: RequestInit) => {
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status });
  });
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useBrittneyWake', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('wakes Brittney when the panel opens for a signed-in person', async () => {
    const fetchMock = warmFetch({ status: 200, body: { status: 'waking', etaSeconds: 1200 } });
    const { result } = renderHook(() => useBrittneyWake(true, fetchMock as typeof fetch));
    await flush();
    expect(fetchMock).toHaveBeenCalledWith('/api/brittney/warm', { method: 'POST' });
    expect(result.current.state.phase).toBe('waking');
    expect(result.current.state.etaSeconds).toBe(1200);
  });

  it('does nothing for a signed-out visitor', async () => {
    const fetchMock = warmFetch({ status: 200, body: { status: 'waking', etaSeconds: 1200 } });
    renderHook(() => useBrittneyWake(false, fetchMock as typeof fetch));
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stays quiet when she is already awake', async () => {
    const fetchMock = warmFetch({ status: 200, body: { status: 'warm', etaSeconds: 1200 } });
    const { result } = renderHook(() => useBrittneyWake(true, fetchMock as typeof fetch));
    await flush();
    expect(result.current.state.phase).toBe('idle');
  });

  it('keeps asking every couple of minutes, then says ready, then clears the notice', async () => {
    const fetchMock = warmFetch(
      { status: 200, body: { status: 'waking', etaSeconds: 1200 } },
      { status: 429, body: { status: 'rate_limited' } },
      { status: 200, body: { status: 'waking', etaSeconds: 1200 } },
      { status: 200, body: { status: 'warm', etaSeconds: 1200 } }
    );
    const { result } = renderHook(() => useBrittneyWake(true, fetchMock as typeof fetch));
    await flush();
    for (let i = 0; i < 3; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(WAKE_POLL_MS);
      });
    }
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(result.current.state.phase).toBe('ready');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(READY_NOTICE_MS);
    });
    expect(result.current.state.phase).toBe('idle');
  });

  it('a chat turn that found her cold enters the waking state', async () => {
    const fetchMock = warmFetch({ status: 200, body: { status: 'warm' } });
    const { result } = renderHook(() => useBrittneyWake(true, fetchMock as typeof fetch));
    await flush();
    act(() => result.current.markWaking(600));
    expect(result.current.state.phase).toBe('waking');
    expect(result.current.state.etaSeconds).toBe(600);
  });

  it('gives up kindly instead of polling forever', async () => {
    const fetchMock = warmFetch({ status: 200, body: { status: 'waking', etaSeconds: 1200 } });
    const { result } = renderHook(() => useBrittneyWake(true, fetchMock as typeof fetch));
    await flush();
    const polls = Math.ceil(WAKE_GIVE_UP_MS / WAKE_POLL_MS) + 1;
    for (let i = 0; i < polls; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(WAKE_POLL_MS);
      });
    }
    expect(result.current.state.phase).toBe('slow');
    const calls = fetchMock.mock.calls.length;
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(WAKE_POLL_MS);
      });
    }
    expect(fetchMock.mock.calls.length).toBe(calls);
  });
});

describe('wakeNoticeText', () => {
  const start = 1_000_000;
  const waking = { phase: 'waking' as const, etaSeconds: 20 * 60, startedAt: start };

  it('says how long, in plain words, and never "error"', () => {
    const text = wakeNoticeText(waking, start, false)!;
    expect(text).toContain('Brittney is waking up');
    expect(text).toContain('about 20 minutes');
    expect(text).not.toMatch(/error|sorry/i);
  });

  it('counts down, and promises a held message will go out by itself', () => {
    expect(wakeNoticeText(waking, start + 19.5 * 60_000, true)).toBe(
      'Brittney is waking up — about 1 minute. Your message will send by itself when she is ready.'
    );
  });

  it('says ready, and nothing when idle', () => {
    expect(wakeNoticeText({ ...waking, phase: 'ready' }, start, false)).toBe('Brittney is ready.');
    expect(wakeNoticeText({ phase: 'idle', etaSeconds: 0, startedAt: 0 }, start, false)).toBeNull();
  });
});
