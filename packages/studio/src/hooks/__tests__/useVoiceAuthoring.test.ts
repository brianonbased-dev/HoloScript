// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

const mockParse = vi.fn();
vi.mock('@holoscript/core', () => ({
  HoloCompositionParser: class {
    parse(source: string) {
      return mockParse(source);
    }
  },
}));

class MockRecognition {
  lang = 'en-US';
  continuous = false;
  interimResults = false;
  onresult: ((e: any) => void) | null = null;
  onerror: ((e: any) => void) | null = null;
  onend: (() => void) | null = null;

  start() {
    // no-op, tests dispatch results manually
  }

  stop() {
    // no-op
  }
}

function installSpeechMock() {
  (window as any).webkitSpeechRecognition = MockRecognition;
}

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { useVoiceAuthoring } from '../useVoiceAuthoring';

describe('useVoiceAuthoring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installSpeechMock();
  });

  it('transitions to ready when parser validation succeeds', async () => {
    mockParse.mockReturnValue({ ast: {}, errors: [] });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        holoSource: 'composition "Scene" {}',
        modelLatencyMs: 10,
        retried: false,
      }),
    });

    let created: MockRecognition | null = null;
    (window as any).webkitSpeechRecognition = class extends MockRecognition {
      constructor() {
        super();
        created = this;
      }
    };

    const { result } = renderHook(() => useVoiceAuthoring());

    act(() => {
      result.current.start();
    });

    expect(created).not.toBeNull();

    act(() => {
      created!.onresult?.({
        resultIndex: 0,
        results: {
          0: { 0: { transcript: 'build a scene', confidence: 0.9 }, isFinal: true },
          length: 1,
        },
      });
    });

    await waitFor(() => {
      expect(result.current.state).toBe('ready');
    });

    expect(result.current.holoSource).toBe('composition "Scene" {}');
    expect(mockFetch).toHaveBeenCalled();
    expect(mockParse).toHaveBeenCalledWith('composition "Scene" {}');
  });

  it('transitions to error when parser reports errors', async () => {
    mockParse.mockReturnValue({ errors: [{ message: 'unexpected token' }] });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        holoSource: 'composition ???',
        modelLatencyMs: 10,
        retried: true,
      }),
    });

    let created: MockRecognition | null = null;
    (window as any).webkitSpeechRecognition = class extends MockRecognition {
      constructor() {
        super();
        created = this;
      }
    };

    const { result } = renderHook(() => useVoiceAuthoring());

    act(() => {
      result.current.start();
    });

    act(() => {
      created!.onresult?.({
        resultIndex: 0,
        results: {
          0: { 0: { transcript: 'bad scene', confidence: 0.9 }, isFinal: true },
          length: 1,
        },
      });
    });

    await waitFor(() => {
      expect(result.current.state).toBe('error');
    });

    expect(result.current.lastError?.kind).toBe('parse-failed-after-retry');
  });
});
