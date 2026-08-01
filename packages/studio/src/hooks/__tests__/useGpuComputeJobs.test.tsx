// @vitest-environment jsdom

import React from 'react';
import '@testing-library/jest-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GpuJobsComponent } from '@/components/panels/native/gpuJobs.native';
import { GpuComputeTeamProvider } from '../useGpuComputeJobs';

const TEAM_ID = 'team-gpu-test';
const JOB_ID = `sha256:${'a'.repeat(64)}`;
const RECEIPT_ID = `sha256:${'b'.repeat(64)}`;

function publicJob(state = 'preflighted', receiptId = RECEIPT_ID) {
  return {
    schemaVersion: 'holoscript.compute-job-public-response.v1',
    verificationScope: 'durable_job_state_only',
    jobId: JOB_ID,
    attempt: 1,
    state,
    jobReceiptId: receiptId,
    providerReservation: 'not_asserted',
    execution: 'not_asserted',
  };
}

function renderSurface() {
  return render(
    <GpuComputeTeamProvider teamId={TEAM_ID}>
      <GpuJobsComponent />
    </GpuComputeTeamProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HoloScript-native GPU Jobs fragment', () => {
  it('renders the durable-state boundary and compiler-authored source editor', () => {
    renderSurface();

    expect(screen.getByText('GPU JOBS')).toBeInTheDocument();
    expect(screen.getByText('Verification: durable job state only')).toBeInTheDocument();
    expect(screen.getByText('Provider reservation: not asserted')).toBeInTheDocument();
    expect(screen.getByText('Execution evidence: not asserted')).toBeInTheDocument();
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toContain('@compute');
  });

  it('submits, refreshes, and cancels through the user-bound Studio proxy', async () => {
    const nextReceipt = `sha256:${'c'.repeat(64)}`;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(publicJob()))
      .mockResolvedValueOnce(Response.json(publicJob('queued', nextReceipt)))
      .mockResolvedValueOnce(Response.json(publicJob('cancelled', `sha256:${'d'.repeat(64)}`)));
    vi.stubGlobal('fetch', fetchMock);
    renderSurface();

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('preflighted')).toBeInTheDocument();
    const submitInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const submitBody = JSON.parse(String(submitInit.body)) as Record<string, unknown>;
    expect(submitBody).toMatchObject({ teamId: TEAM_ID });
    expect(submitBody.sourceText).toEqual(expect.stringContaining('@compute'));
    expect(submitBody.idempotencyKey).toEqual(expect.stringMatching(/^gpu-submit-/));

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(await screen.findByText('queued')).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(
      `/api/agents/fleet/compute/jobs/${encodeURIComponent(JOB_ID)}`
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByText('cancelled')).toBeInTheDocument();
    const cancelInit = fetchMock.mock.calls[2]?.[1] as RequestInit;
    expect(JSON.parse(String(cancelInit.body))).toMatchObject({
      teamId: TEAM_ID,
      attempt: 1,
      expectedJobReceiptId: nextReceipt,
    });
  });

  it('reuses the same submit key after a committed readback uncertainty', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          {
            error: 'committed_readback_failed',
            committed: true,
            retry_with_same_idempotency_key: true,
          },
          { status: 503 }
        )
      )
      .mockResolvedValueOnce(Response.json(publicJob()));
    vi.stubGlobal('fetch', fetchMock);
    renderSurface();

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('committed_readback_failed')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Updating durable job state...')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('preflighted')).toBeInTheDocument();

    const first = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      idempotencyKey: string;
    };
    const second = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)) as {
      idempotencyKey: string;
    };
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it('reuses the same submit key after an unclassified server failure', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ error: 'compute_service_unavailable' }, { status: 503 })
      )
      .mockResolvedValueOnce(Response.json(publicJob()));
    vi.stubGlobal('fetch', fetchMock);
    renderSurface();

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('compute_service_unavailable')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Updating durable job state...')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('preflighted')).toBeInTheDocument();

    const first = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as {
      idempotencyKey: string;
    };
    const second = JSON.parse(String((fetchMock.mock.calls[1]?.[1] as RequestInit).body)) as {
      idempotencyKey: string;
    };
    expect(second.idempotencyKey).toBe(first.idempotencyKey);
  });

  it('fails closed on a malformed successful upstream projection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(Response.json({ state: 'running' }))
    );
    renderSurface();

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(await screen.findByText('compute_response_invalid')).toBeInTheDocument();
    expect(screen.queryByText('running')).toBeNull();
  });
});
