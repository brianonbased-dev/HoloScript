// @vitest-environment jsdom
/**
 * The home page's idea box goes straight to Brittney.
 *
 * Until 2026-09-28 an idea typed there reached /create as a prefilled
 * describe-it panel, which draws the same template for any idea, and Brittney
 * never saw it. Now /create stores the idea in createModeStore and opens her
 * chat, and the panel sends it as the person's message, once, into the active
 * conversation after that conversation's history has loaded.
 *
 * The panel is rendered for real; only what it talks to is faked: the stream
 * to /api/brittney (captured here), the saved-conversation hook, sign-in, and
 * the context fetches.
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  sent: [] as Array<Array<{ role: string; content: string }>>,
  history: {
    isLoaded: true,
    threadKey: 'thread-1',
    saved: [] as Array<{ role: string; content: string; timestamp: number }>,
  },
}));

vi.mock('next/navigation', () => ({ usePathname: () => '/create' }));
vi.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated', data: { user: { id: 'person-1' } } }),
  signIn: vi.fn(),
}));
vi.mock('@holoscript/r3f-renderer', () => ({ HologramMcpContentRenderer: () => null }));
vi.mock('@/hooks/useUnifiedBrittneyHistory', () => ({
  useUnifiedBrittneyHistory: () => ({
    scope: 'workspace-1',
    threadKey: h.history.threadKey,
    history: h.history.saved,
    addMessage: vi.fn(),
    clearHistory: vi.fn(),
    isLoaded: h.history.isLoaded,
    conversations: [],
    activeConversationId: null,
    newConversation: vi.fn(),
    selectConversation: vi.fn(),
    renameConversation: vi.fn(),
    archiveConversation: vi.fn(),
    adoptConversation: vi.fn(),
    enqueueUpload: vi.fn(),
  }),
}));
vi.mock('@/lib/brittney/BrittneySession', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/brittney/BrittneySession')>()),
  streamAssistant: (history: Array<{ role: string; content: string }>) => {
    h.sent.push(history.map((m) => ({ role: m.role, content: String(m.content) })));
    return (async function* () {
      yield { type: 'text', payload: 'Building your garden.' };
      yield { type: 'done', payload: null };
    })();
  },
}));

import { BrittneyChatPanel } from '../BrittneyChatPanel';
import { useCreateModeStore } from '@/components/create/createModeStore';

const IDEA = 'A rose garden with a stone fountain in the middle';

beforeEach(() => {
  h.sent.length = 0;
  h.history.isLoaded = true;
  h.history.threadKey = 'thread-1';
  h.history.saved = [];
  useCreateModeStore.setState({ landingPrompt: '' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }))
  );
  // jsdom has no layout; the panel scrolls its message list into view.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the idea from the home page goes straight to Brittney', () => {
  it('hands the idea over once: whoever takes it clears it', () => {
    useCreateModeStore.getState().setLandingPrompt(IDEA);
    expect(useCreateModeStore.getState().takeLandingPrompt()).toBe(IDEA);
    expect(useCreateModeStore.getState().takeLandingPrompt()).toBe('');
    expect(useCreateModeStore.getState().landingPrompt).toBe('');
  });

  it('sends the idea to Brittney as the person’s message, once', async () => {
    useCreateModeStore.getState().setLandingPrompt(IDEA);
    const view = render(<BrittneyChatPanel />);

    await waitFor(() => expect(h.sent).toHaveLength(1));
    expect(h.sent[0].at(-1)).toEqual({ role: 'user', content: IDEA });
    expect(useCreateModeStore.getState().landingPrompt).toBe('');

    // A re-render, or the panel mounting again, does not send it a second time.
    view.rerender(<BrittneyChatPanel />);
    view.unmount();
    render(<BrittneyChatPanel />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(h.sent).toHaveLength(1);
  });

  it('waits for the conversation’s history, and sends the idea with it', async () => {
    h.history.isLoaded = false;
    h.history.saved = [
      { role: 'user', content: 'Make me a castle', timestamp: 1 },
      { role: 'assistant', content: 'Here is your castle.', timestamp: 2 },
    ];
    useCreateModeStore.getState().setLandingPrompt(IDEA);
    const view = render(<BrittneyChatPanel />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(h.sent).toHaveLength(0);
    expect(useCreateModeStore.getState().landingPrompt).toBe(IDEA);

    h.history.isLoaded = true;
    view.rerender(<BrittneyChatPanel />);
    await waitFor(() => expect(h.sent).toHaveLength(1));
    expect(h.sent[0]).toEqual([
      { role: 'user', content: 'Make me a castle' },
      { role: 'assistant', content: 'Here is your castle.' },
      { role: 'user', content: IDEA },
    ]);
  });

  it('sends nothing when no idea is waiting', async () => {
    render(<BrittneyChatPanel />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(h.sent).toHaveLength(0);
  });

  // The idea shares the send path with typing (sendText), so the typed path is
  // pinned here too: a message typed into the box still goes to Brittney.
  it('still sends what the person types and sends with the button', async () => {
    const view = render(<BrittneyChatPanel />);
    const box = view.getByLabelText('Message assistant') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Add a bench by the fountain' } });
    fireEvent.click(view.getByLabelText('Send message to assistant'));

    await waitFor(() => expect(h.sent).toHaveLength(1));
    expect(h.sent[0].at(-1)).toEqual({ role: 'user', content: 'Add a bench by the fountain' });
  });
});
