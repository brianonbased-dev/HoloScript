import { describe, expect, it } from 'vitest';
import {
  ABSORB_PROGRESS_CONTRACT_VERSION,
  toAbsorbProgressContractEvent,
} from '../absorbStreamContract';

describe('toAbsorbProgressContractEvent', () => {
  it('normalizes explicit progress and absorb type', () => {
    const event = toAbsorbProgressContractEvent({
      type: 'absorb_progress',
      progress: 42,
      message: 'Parsing files',
      jobId: 'job-1',
    });

    expect(event).toEqual({
      contract: ABSORB_PROGRESS_CONTRACT_VERSION,
      phase: 'absorbing',
      progress: 42,
      message: 'Parsing files',
      jobId: 'job-1',
      rawType: 'absorb_progress',
    });
  });

  it('maps done-like events to complete with 100 progress', () => {
    const event = toAbsorbProgressContractEvent({ type: 'completed' });

    expect(event?.phase).toBe('complete');
    expect(event?.progress).toBe(100);
  });

  it('maps fractional progress to percentage', () => {
    const event = toAbsorbProgressContractEvent({
      event: 'indexing',
      progress: 0.5,
    });

    expect(event?.phase).toBe('indexing');
    expect(event?.progress).toBe(50);
  });

  it('maps error payloads and uses error text as message', () => {
    const event = toAbsorbProgressContractEvent({
      status: 'failed',
      error: 'Connection dropped',
    });

    expect(event?.phase).toBe('error');
    expect(event?.message).toBe('Connection dropped');
  });

  it('returns null for invalid payload', () => {
    expect(toAbsorbProgressContractEvent(null)).toBeNull();
    expect(toAbsorbProgressContractEvent('bad')).toBeNull();
  });
});
