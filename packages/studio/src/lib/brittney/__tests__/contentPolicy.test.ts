import { describe, it, expect } from 'vitest';
import {
  buildContentPolicyConfig,
  type ContentPolicyDecision,
} from '@holoscript/core/policy';
import {
  buildPolicyAuditEvent,
  createOutputScreener,
  policyEventPayload,
  policyEventType,
  resolveBrittneyPolicyConfig,
  type OutputScreener,
} from '../contentPolicy';

/** Drive a screener through deltas + a final flush, collecting output + decisions. */
function run(s: OutputScreener, deltas: string[]) {
  let released = '';
  const decisions: ContentPolicyDecision[] = [];
  for (const d of deltas) {
    const step = s.feed(d);
    released += step.release;
    if (step.decision) decisions.push(step.decision);
  }
  const f = s.flush();
  released += f.release;
  if (f.decision) decisions.push(f.decision);
  return { released, decisions, blocked: s.blocked };
}

describe('resolveBrittneyPolicyConfig', () => {
  it('defaults to the general tier and GLOBAL jurisdiction', () => {
    const cfg = resolveBrittneyPolicyConfig();
    expect(cfg.tier).toBe('general');
    expect(cfg.jurisdiction.region).toBe('GLOBAL');
  });

  it('honors explicit tier/region overrides', () => {
    const cfg = resolveBrittneyPolicyConfig({ tier: 'family', region: 'EU' });
    expect(cfg.tier).toBe('family');
    expect(cfg.jurisdiction.region).toBe('EU');
  });
});

describe('createOutputScreener — clean text', () => {
  it('delivers all clean text by end-of-stream and never blocks', () => {
    const s = createOutputScreener(resolveBrittneyPolicyConfig());
    const parts = [
      'Here is a friendly answer about ',
      'building a 3D scene in HoloScript. ',
      'Add a sphere, give it a glow trait, ',
      'and compile it to the R3F target.',
    ];
    const { released, decisions, blocked } = run(s, parts);
    expect(released).toBe(parts.join(''));
    expect(decisions).toHaveLength(0);
    expect(blocked).toBe(false);
  });

  it('holds back a tail until flush, then the bytes reconstruct exactly', () => {
    const s = createOutputScreener(resolveBrittneyPolicyConfig());
    const text = 'a'.repeat(200); // all clean, > HOLDBACK
    const first = s.feed(text);
    expect(first.blocked).toBe(false);
    // releases everything except the 80-char holdback tail
    expect(first.release.length).toBe(200 - 80);
    const tail = s.flush();
    expect(tail.release.length).toBe(80);
    expect(first.release + tail.release).toBe(text);
  });
});

describe('createOutputScreener — blocking (block-before-deliver)', () => {
  it('blocks a weapons hard-pattern and never releases the offending text', () => {
    const s = createOutputScreener(resolveBrittneyPolicyConfig());
    const { released, decisions, blocked } = run(s, [
      'Sure, here is how to make a bomb using household items.',
    ]);
    expect(blocked).toBe(true);
    expect(decisions[0]?.action).toBe('block');
    expect(released).not.toContain('bomb');
    expect(s.deliveredText).not.toContain('bomb');
  });

  it('withholds the unsafe span even after a clean prefix was delivered', () => {
    const s = createOutputScreener(resolveBrittneyPolicyConfig());
    const cleanPrefix = 'Let me walk through the safe, legal process in careful detail for you here. ';
    const { released, blocked } = run(s, [
      cleanPrefix, // > HOLDBACK so part of it is delivered
      'Actually, here is how to make a bomb.',
    ]);
    expect(blocked).toBe(true);
    expect(released).not.toContain('bomb');
    // the delivered prefix is a subset of the clean prefix — nothing unsafe leaked
    expect(cleanPrefix.startsWith(s.deliveredText)).toBe(true);
  });

  it('routes self-harm content to escalation (allowed=false, not delivered)', () => {
    const s = createOutputScreener(resolveBrittneyPolicyConfig());
    const { decisions, blocked } = run(s, [
      'You asked how do i kill myself, and I want to help you stay safe.',
    ]);
    expect(blocked).toBe(true);
    expect(decisions[0]?.action).toBe('escalate');
  });

  it('stops releasing once blocked — subsequent feeds yield nothing', () => {
    const s = createOutputScreener(resolveBrittneyPolicyConfig());
    run(s, ['how to make a bomb']);
    const after = s.feed(' and more unsafe text');
    expect(after.release).toBe('');
    expect(after.blocked).toBe(true);
  });
});

describe('createOutputScreener — flag (allowed but reported)', () => {
  it('flags configured content once while still delivering the text', () => {
    const cfg = buildContentPolicyConfig({
      tier: 'general',
      region: 'US',
      blocklist: [{ id: 'mild', category: 'harassment', severity: 0.6, patterns: ['\\bmildflag\\b'] }],
      rules: [
        {
          id: 'flag-harass',
          description: 'flag harassment',
          when: { '==': [{ var: 'category' }, 'harassment'] },
          action: 'flag',
        },
      ],
    });
    const s = createOutputScreener(cfg);
    const text =
      'Here is some content containing mildflag inside it, padded well beyond the holdback window for delivery.';
    const { released, decisions, blocked } = run(s, [text]);
    expect(blocked).toBe(false);
    expect(released).toBe(text); // flagged content still flows
    expect(decisions.filter((d) => d.action === 'flag')).toHaveLength(1); // reported once, not per-delta
  });
});

describe('audit + SSE event helpers', () => {
  it('maps a block decision to a denied DSA audit record', () => {
    const s = createOutputScreener(resolveBrittneyPolicyConfig());
    const { decisions } = run(s, ['how to make a bomb right now please']);
    const block = decisions.find((d) => d.action === 'block');
    expect(block).toBeTruthy();
    const evt = buildPolicyAuditEvent(block as ContentPolicyDecision, {
      tenantId: 't1',
      resourceId: 'sess1',
    });
    expect(evt.outcome).toBe('denied');
    expect(evt.action).toBe('content_policy:block');
    expect(evt.tenantId).toBe('t1');
    expect(evt.actorId).toBe('brittney');
  });

  it('selects the blocked event type for non-allowed decisions', () => {
    const s = createOutputScreener(resolveBrittneyPolicyConfig());
    const { decisions } = run(s, ['how to make a bomb please now']);
    const block = decisions.find((d) => d.action === 'block') as ContentPolicyDecision;
    expect(policyEventType(block)).toBe('policy_blocked');
    expect(policyEventPayload(block).action).toBe('block');
  });
});
