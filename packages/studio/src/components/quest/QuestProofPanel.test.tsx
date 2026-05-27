// @vitest-environment jsdom

import '@testing-library/jest-dom';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  countReceipts,
  latestReceiptsByPage,
  proofPathWithRunId,
  QuestProofPanel,
  type ReceiptSummary,
} from './QuestProofPanel';

const receipts: ReceiptSummary[] = [
  {
    receivedAt: '2026-05-22T16:00:00.000Z',
    pageId: 'quest-probe',
    status: 'OK',
    label: 'WebXR immersive-vr',
    detail: 'supported',
  },
  {
    receivedAt: '2026-05-22T16:05:00.000Z',
    pageId: 'create',
    status: 'WARN',
    label: 'Create manual headset proof',
    detail: 'first viewport held for editor stability',
  },
  {
    receivedAt: '2026-05-22T16:08:00.000Z',
    pageId: 'creator',
    status: 'INFO',
    label: 'Creator guarded fallback opened from dashboard',
    detail: 'auth required',
  },
];

const RECEIPT_BODY = {
  ok: true,
  count: receipts.length,
  path: 'C:/repo/.bench-logs/format-stress/quest-run/quest-proof/receipts.jsonl',
  receipts,
};
const INBOX_BODY = { ok: true, items: [] };
const BOARD_BODY = {
  ok: true,
  board: {
    tasks: [
      { id: 'task_board_1', title: 'Build console tile', status: 'open', priority: 2 },
      { id: 'task_board_2', title: 'Fix auth', status: 'claimed', priority: 3 },
    ],
  },
};
const NEXT_ACTIONS_BODY = {
  ok: true,
  actions: [
    {
      id: 'proposed:task_wire_test',
      label: 'Wire the tap-chip strip',
      intent: '[wire][studio] Wire the tap-chip strip',
      actionType: 'code' as const,
      status: 'proposed' as const,
      taskId: 'task_wire_test',
      priority: 2,
      reversible: true,
      href: '/holomesh/team/team_test/board',
    },
    {
      id: 'proposed:task_deploy_test',
      label: 'Deploy studio to Railway',
      intent: 'Deploy studio to Railway',
      actionType: 'code' as const,
      status: 'proposed' as const,
      taskId: 'task_deploy_test',
      priority: 3,
      reversible: false,
      href: '/holomesh/team/team_test/board',
    },
  ],
};

/** Return a fresh Response per call so .json() can be called once per response. */
function mockReceiptFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      let body: unknown = RECEIPT_BODY;
      if (typeof url === 'string' && url.includes('next-actions')) body = NEXT_ACTIONS_BODY;
      else if (typeof url === 'string' && url.includes('inbox')) body = INBOX_BODY;
      else if (typeof url === 'string' && url.includes('board')) body = BOARD_BODY;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    })
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('QuestProofPanel helpers', () => {
  it('keeps proof run ids on normal, prefixed, and query-string paths', () => {
    expect(proofPathWithRunId('/quest-probe', 'quest run', '/t/tunnel-1')).toBe(
      '/t/tunnel-1/quest-probe?runId=quest%20run'
    );
    expect(
      proofPathWithRunId('/quest-proof/unavailable?target=%2Fcreate', 'quest-run', '/live')
    ).toBe('/live/quest-proof/unavailable?target=%2Fcreate&runId=quest-run');
  });

  it('summarizes latest receipts by page and status', () => {
    expect(countReceipts(receipts)).toEqual({ OK: 1, WARN: 1, FAIL: 0, INFO: 1 });
    expect(latestReceiptsByPage(receipts).create.detail).toBe(
      'first viewport held for editor stability'
    );
  });
});

describe('QuestProofPanel', () => {
  it('renders current receipt summaries and guard-backed fallback links', async () => {
    window.history.pushState({}, '', '/quest-proof?runId=quest-run');
    mockReceiptFetch();

    render(<QuestProofPanel />);

    expect(await screen.findByText(/Latest INFO from creator/)).toBeInTheDocument();
    expect(
      screen.getByText(/Latest receipt: OK - WebXR immersive-vr: supported/)
    ).toBeInTheDocument();
    expect(screen.getAllByText('Guarded fallback')).toHaveLength(3);

    const creatorLaunch = screen.getByRole('link', {
      name: 'Open guarded fallback for Creator',
    });
    expect(creatorLaunch).toHaveAttribute('href', '/creator?runId=quest-run');

    const explicitFallbacks = screen.getAllByRole('link', {
      name: 'Open explicit fallback',
    });
    expect(explicitFallbacks[0].getAttribute('href')).toContain(
      '/quest-proof/unavailable?target=%2Fcreator'
    );
    expect(explicitFallbacks[0].getAttribute('href')).toContain('runId=quest-run');

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const receiptCall = vi.mocked(globalThis.fetch).mock.calls.find((c) =>
      String(c[0]).includes('/api/quest-proof?runId=')
    );
    expect(receiptCall).toBeDefined();
  });

  it('FAILING-IF-BROKEN (N2): next-actions chip strip renders on the Console', async () => {
    window.history.pushState({}, '', '/quest-proof?runId=quest-run');
    mockReceiptFetch();
    render(<QuestProofPanel />);

    // Wait for the strip to appear (polled via 6s interval; mock resolves immediately).
    const strip = await screen.findByTestId('next-actions', {}, { timeout: 10000 });
    expect(strip).toBeInTheDocument();

    // Reversible chip appears as an Approve button (TapTarget renders <button>).
    const approveBtn = await screen.findByRole('button', { name: /Approve: Wire the tap-chip strip/ }, { timeout: 10000 });
    expect(approveBtn).toBeInTheDocument();
    // Gated (irreversible) chip renders as a navigation link (review path).
    const reviewLink = await screen.findByRole('link', { name: /Review: Deploy studio to Railway/ }, { timeout: 10000 });
    expect(reviewLink).toBeInTheDocument();
  }, 15000);

  it('SAFETY (N2/D.044): irreversible chip does NOT render as an approve button', async () => {
    window.history.pushState({}, '', '/quest-proof?runId=quest-run');
    mockReceiptFetch();
    render(<QuestProofPanel />);

    // Wait for chips to appear
    await screen.findByTestId('next-actions', {}, { timeout: 10000 });
    // The deploy chip must NOT be an Approve button (it's gated — D.044).
    const allButtons = screen.queryAllByRole('button', { name: /Approve: Deploy studio/ });
    expect(allButtons).toHaveLength(0);
    // It must appear as a link (review path, not one-tap auto).
    const reviewLink = screen.getByRole('link', { name: /Review: Deploy studio to Railway/ });
    expect(reviewLink).toBeInTheDocument();
  }, 15000);

  it('FAILING-IF-BROKEN (Slice C): board tile renders live team board on the Console', async () => {
    window.history.pushState({}, '', '/quest-proof?runId=quest-run');
    mockReceiptFetch();
    render(<QuestProofPanel />);

    const tile = await screen.findByTestId('board-tile', {}, { timeout: 10000 });
    expect(tile).toBeInTheDocument();
    expect(tile).toHaveTextContent('Build console tile');
    expect(tile).toHaveTextContent('Fix auth');

    // Assert the board API was actually called (not hardcoded).
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    const boardCall = vi.mocked(globalThis.fetch).mock.calls.find((c) =>
      String(c[0]).includes('/api/quest-proof/board')
    );
    expect(boardCall).toBeDefined();
  }, 15000);

  it('FAILING-IF-BROKEN (Slice C): Decide All POST mutates task state via the decide API', async () => {
    window.history.pushState({}, '', '/quest-proof?runId=quest-run');
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      let body: unknown = RECEIPT_BODY;
      if (typeof url === 'string' && url.includes('next-actions')) body = NEXT_ACTIONS_BODY;
      else if (typeof url === 'string' && url.includes('inbox')) body = INBOX_BODY;
      else if (typeof url === 'string' && url.includes('board')) body = BOARD_BODY;
      else if (typeof url === 'string' && url.includes('decide')) {
        body = { ok: true, results: [{ taskId: 'task_board_1', ok: true, status: 200 }] };
      }
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<QuestProofPanel />);

    const tile = await screen.findByTestId('board-tile', {}, { timeout: 10000 });
    const decideBtn = await screen.findByRole('button', { name: /Decide All/ }, { timeout: 10000 });
    expect(decideBtn).toBeInTheDocument();

    decideBtn.click();

    await waitFor(() => {
      const decideCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/quest-proof/decide'));
      expect(decideCall).toBeDefined();
    });

    const decideCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/api/quest-proof/decide'));
    const init = decideCall?.[1] as RequestInit;
    expect(init?.method).toBe('POST');
    const body = JSON.parse((init?.body as string) ?? '{}');
    expect(body.taskIds).toContain('task_board_1');
    expect(body.action).toBe('done');
  }, 15000);
});
