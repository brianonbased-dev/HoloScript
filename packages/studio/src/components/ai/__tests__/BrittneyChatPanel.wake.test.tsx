// @vitest-environment jsdom
/**
 * Brittney's panel when her box is asleep (founder 2026-10-08: she is no longer always-on).
 * Opening the panel wakes her and says "waking up" with the time left; a message sent while
 * she wakes is held — no "Sorry, I hit an error" bubble.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  warmStatus: 'waking' as string,
  streamCalls: 0,
  history: {
    history: [],
    addMessage: () => {},
    clearHistory: () => {},
    isLoaded: true,
    conversations: [],
    activeConversationId: null,
    newConversation: () => {},
    selectConversation: async () => {},
    renameConversation: async () => {},
    archiveConversation: async () => {},
    adoptConversation: () => {},
    enqueueUpload: () => {},
  },
  voice: {
    isListening: false,
    isSupported: false,
    transcript: '',
    interimTranscript: '',
    startListening: () => {},
    stopListening: () => {},
    clearTranscript: () => {},
  },
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/create' }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated', data: { user: { id: 'u1' } } }),
  signIn: () => {},
}));
vi.mock('katex/dist/katex.min.css', () => ({}));
vi.mock('@holoscript/r3f-renderer', () => ({ HologramMcpContentRenderer: () => null }));
vi.mock('@holoscript/core', () => ({ detectHologramContent: () => null }));
vi.mock('@/hooks/useUnifiedBrittneyHistory', () => ({
  useUnifiedBrittneyHistory: () => h.history,
}));
vi.mock('@/hooks/useBrittneyVoice', () => ({ useAssistantVoice: () => h.voice }));
vi.mock('@/lib/brittney', () => ({
  buildRichContext: () => '',
  executeTool: async () => ({ success: true, message: 'ok' }),
  SimulationToolExecutor: class {},
  // The chat route's answer when her box is cold: `warming`, then the old plain error.
  streamAssistant: async function* () {
    h.streamCalls++;
    yield { type: 'warming', payload: { etaSeconds: 1200, message: 'SOVEREIGN_WARMING: waking' } };
    yield { type: 'error', payload: 'SOVEREIGN_WARMING: waking' };
    yield { type: 'done', payload: null };
  },
}));

import { BrittneyChatPanel } from '../BrittneyChatPanel';

describe('BrittneyChatPanel while Brittney wakes', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    h.streamCalls = 0;
    fetchMock = vi.fn(async (url: string) => {
      if (url === '/api/brittney/warm') {
        return new Response(JSON.stringify({ status: h.warmStatus, etaSeconds: 1200 }), {
          status: 200,
        });
      }
      return new Response('{}', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('opening the panel wakes her and says "waking up", not an error', async () => {
    h.warmStatus = 'waking';
    render(<BrittneyChatPanel />);
    const notice = await screen.findByTestId('brittney-wake-notice');
    expect(fetchMock).toHaveBeenCalledWith('/api/brittney/warm', { method: 'POST' });
    expect(notice.textContent).toContain('Brittney is waking up — about 20 minutes');
    expect(screen.queryByText(/hit an error/i)).toBeNull();
  });

  it('shows no notice when she is already awake', async () => {
    h.warmStatus = 'warm';
    render(<BrittneyChatPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/brittney/warm', expect.anything()));
    expect(screen.queryByTestId('brittney-wake-notice')).toBeNull();
  });

  it('a message sent while she is asleep is held, with a kind notice instead of an error', async () => {
    h.warmStatus = 'warm';
    render(<BrittneyChatPanel />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'make a red cube' } });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Send message to assistant'));
    });

    const notice = await screen.findByTestId('brittney-wake-notice');
    expect(notice.textContent).toContain('Brittney is waking up');
    expect(notice.textContent).toContain('Your message will send by itself');
    expect(h.streamCalls).toBe(1);
    expect(screen.getByText('make a red cube')).toBeTruthy();
    expect(screen.queryByText(/hit an error/i)).toBeNull();
    expect(screen.queryByText(/SOVEREIGN_WARMING/)).toBeNull();
  });
});
