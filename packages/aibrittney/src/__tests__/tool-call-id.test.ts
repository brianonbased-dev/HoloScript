import { describe, it, expect } from 'vitest';
import { mintToolCallId } from '../tool-call-id.js';

// Exactly what the strictest chat templates (Mistral / Devstral / Nemo) accept.
const NINE_ALNUM = /^[A-Za-z0-9]{9}$/;

describe('mintToolCallId', () => {
  it('mints exactly 9 alphanumeric characters, unique across 1000 draws', () => {
    const ids = Array.from({ length: 1000 }, () => mintToolCallId());
    for (const id of ids) expect(id).toMatch(NINE_ALNUM);
    expect(new Set(ids).size).toBe(1000);
  });

  it('skips an id this process already issued', () => {
    expect(mintToolCallId(() => 'AAAAAAAAB')).toBe('AAAAAAAAB');
    const draws = ['AAAAAAAAB', 'AAAAAAAAB', 'AAAAAAAAC'];
    expect(mintToolCallId(() => draws.shift() ?? 'ZZZZZZZZZ')).toBe('AAAAAAAAC');
  });

  it('gives up loudly when the generator never yields a fresh id', () => {
    expect(mintToolCallId(() => 'QQQQQQQQQ')).toBe('QQQQQQQQQ');
    expect(() => mintToolCallId(() => 'QQQQQQQQQ')).toThrow(/no unused id/);
  });
});
