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

function mockReceiptFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          count: receipts.length,
          path: 'C:/repo/.bench-logs/format-stress/quest-run/quest-proof/receipts.jsonl',
          receipts,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )
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
    expect(vi.mocked(globalThis.fetch).mock.calls[0]?.[0]).toBe('/api/quest-proof?runId=quest-run');
  });
});
