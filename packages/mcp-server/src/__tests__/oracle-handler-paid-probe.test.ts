/**
 * Probe: holo_oracle_consult must not open a Knowledge Store section from a
 * premium row the caller is not entitled to, when the only match is hidden
 * paid text.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleOracleConsult } from '../oracle-handler';

const PROBE_TOKEN = 'xylophonequartz9f3a';
const PROBE_PHRASE = `${PROBE_TOKEN} paidprobe`;
const PREMIUM_ID = 'entry_oracle_consult_paid_probe';

function premiumRow(authorId: string) {
  return {
    id: PREMIUM_ID,
    type: 'wisdom',
    content: `${PROBE_PHRASE} ${'lead in prose that is freely readable. '.repeat(12)}`,
    domain: 'general',
    metadata: { price: 25, authorId },
  };
}

function freeRow() {
  return {
    id: 'entry_oracle_consult_free_keep',
    type: 'wisdom',
    content: 'ordinary free note with no overlap',
    domain: 'general',
    metadata: { price: 0, authorId: 'someone-else' },
  };
}

function leak(text: string) {
  return {
    hasId: text.includes(PREMIUM_ID),
    hasToken: text.includes(PROBE_TOKEN),
    hasPaidProbe: text.includes('paidprobe'),
  };
}

describe('paid probe: oracle consult', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.HOLOSCRIPT_API_KEY;
  });

  it('paid probe: handleOracleConsult drops a hidden-body premium row before the Knowledge Store section', async () => {
    process.env.HOLOSCRIPT_API_KEY = 'probe-oracle-key';
    const rows = { current: [premiumRow('author-not-caller')] };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => ({
        ok: true,
        json: async () => ({ results: rows.current }),
      }))
    );

    const hiddenOnly = await handleOracleConsult({ question: 'guidance about quartz lamps' });
    const hiddenText = hiddenOnly.content.map((part) => part.text).join('\n');
    expect(hiddenText).not.toContain('## Knowledge Store');
    expect(leak(hiddenText)).toEqual({ hasId: false, hasToken: false, hasPaidProbe: false });

    rows.current = [premiumRow('author-not-caller'), freeRow()];
    const mixed = await handleOracleConsult({ question: 'guidance about quartz lamps' });
    const mixedText = mixed.content.map((part) => part.text).join('\n');
    expect(mixedText).toContain('ordinary free note with no overlap');
    expect(mixedText).toContain('## Knowledge Store');
    expect(leak(mixedText)).toEqual({ hasId: false, hasToken: false, hasPaidProbe: false });

    rows.current = [premiumRow('probe-oracle-author')];
    const author = await handleOracleConsult({
      question: 'guidance about quartz lamps',
      __authAgentId: 'probe-oracle-author',
    });
    const authorText = author.content.map((part) => part.text).join('\n');
    expect(authorText).toContain(PREMIUM_ID);
    expect(authorText).toContain(PROBE_PHRASE);
  });
});
