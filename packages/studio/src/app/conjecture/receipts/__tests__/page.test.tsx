// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

import ConjectureReceiptsPage from '../page';
import type { StudioConjectureReceiptsResponse } from '@/types/conjectureReceipts';

const response: StudioConjectureReceiptsResponse = {
  ok: true,
  generatedAt: '2026-05-23T00:00:00.000Z',
  receiptDir: '.scratch/conjecture',
  runCount: 1,
  pointCount: 2,
  runs: [],
  points: [
    {
      id: 'run:survivor',
      runId: 'run',
      suite: 'generated-geometry-family',
      scenarioId: 'generated-geometry.regular-polygon-sheet-family',
      role: 'survivor',
      status: 'survived',
      gateState: 'survived',
      receiptKey: 'conjecture.v1-sha-survivor',
      claimId: 'C.SURVIVOR',
      claimStatement: 'A generated candidate survives.',
      candidateCount: 1,
      counterexampleCount: 0,
      candidateSummaries: [
        {
          candidateId: 'regular-polygon-sheet-3',
          family: 'regular-polygon-sheet',
          status: 'survived',
          parameters: { sides: 3 },
          geometryHash: 'geo-1',
          failedProbeIds: [],
        },
      ],
      primaryCounterexample: null,
      receipt: { receiptKey: 'conjecture.v1-sha-survivor' },
      replayable: false,
      x: 0,
      y: 1,
    },
    {
      id: 'run:falsifier',
      runId: 'run',
      suite: 'generated-geometry-family',
      scenarioId: 'generated-geometry.collapsing-triangle-sweep',
      role: 'falsifier',
      status: 'falsified',
      gateState: 'falsified',
      receiptKey: 'conjecture.v1-sha-falsifier',
      claimId: 'C.FALSIFIER',
      claimStatement: 'A generated candidate fails.',
      candidateCount: 1,
      counterexampleCount: 1,
      candidateSummaries: [
        {
          candidateId: 'collapsing-triangle-0',
          family: 'collapsing-triangle',
          status: 'falsified',
          parameters: { apexHeight: 0 },
          geometryHash: 'geo-2',
          failedProbeIds: ['geometry.non_degenerate'],
        },
      ],
      primaryCounterexample: null,
      receipt: { receiptKey: 'conjecture.v1-sha-falsifier' },
      replayable: true,
      x: 1,
      y: -1,
    },
  ],
};

describe('/conjecture/receipts page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/replay')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                ok: true,
                replayedAt: '2026-05-23T00:01:00.000Z',
                suite: 'generated-geometry-family',
                sourcePath: '.scratch/conjecture/studio-replay.json',
                targetReceiptKey: 'conjecture.v1-sha-falsifier',
                matched: true,
                counterexampleMatched: true,
                replayReceiptKey: 'conjecture.v1-sha-falsifier',
                point: response.points[1],
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify(response), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      })
    );
  });

  it('renders real API receipt points and opens the selected receipt', async () => {
    render(<ConjectureReceiptsPage />);

    expect(await screen.findByText('Conjecture Receipt Manifold')).toBeInTheDocument();
    expect(screen.getByText('C.SURVIVOR')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /C\.FALSIFIER Falsified/ }));
    expect(screen.getByText('C.FALSIFIER')).toBeInTheDocument();
    expect(screen.getByText('geometry.non_degenerate')).toBeInTheDocument();
  });

  it('replays falsified receipts through the API', async () => {
    render(<ConjectureReceiptsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /C\.FALSIFIER Falsified/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Replay to fail' }));

    await waitFor(() => {
      expect(screen.getByText('Counterexample reproduced')).toBeInTheDocument();
    });
  });
});
