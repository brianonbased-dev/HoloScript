/**
 * ContributionSynthesizer — Production Tests
 */
import { describe, it, expect } from 'vitest';
import { ContributionSynthesizer } from '../ContributionSynthesizer';
import type { IHiveContribution, IHiveSession } from '@holoscript/core';

function make(cfg = {}) {
  return new ContributionSynthesizer(cfg);
}

let _id = 0;
function c(type: IHiveContribution['type'], content: string, confidence = 0.8): IHiveContribution {
  return { id: `c${++_id}`, agentId: 'a1', type, content, confidence, timestamp: Date.now() };
}
function session(contribs: IHiveContribution[]): IHiveSession {
  return {
    id: 'sess',
    topic: 't',
    goal: 'g',
    initiator: 'a1',
    status: 'active',
    participants: ['a1'],
    contributions: contribs,
  };
}

describe('ContributionSynthesizer — defaults', () => {
  it('constructs without args', () => expect(() => make()).not.toThrow());
  it('default minConfidenceThreshold=0.3', () => {
    // contributions with confidence < 0.3 should be filtered
    const s = make();
    const sess = session([c('idea', 'low', 0.1), c('idea', 'ok', 0.5)]);
    const r = s.synthesize(sess);
    expect(r.metadata.totalContributions).toBe(2);
    expect(r.metadata.ideaCount).toBe(1); // only 1 passes threshold
  });
});

describe('ContributionSynthesizer — synthesize with empty session', () => {
  it('empty session returns zero result', () => {
    const s = make();
    const r = s.synthesize(session([]));
    expect(r.synthesizedContent).toBe('');
    expect(r.confidence).toBe(0);
    expect(r.metadata.totalContributions).toBe(0);
  });
});

describe('ContributionSynthesizer — method selection', () => {
  it('hierarchical when solutions present', () => {
    const s = make();
    const sess = session([c('solution', 'use redis'), c('idea', 'try caching')]);
    expect(s.synthesize(sess).synthesisMethod).toBe('hierarchical');
  });
  it('consensus when no solutions but has consensus items', () => {
    const s = make({ preferSolutions: false });
    const sess = session([c('consensus', 'agreed on approach')]);
    expect(s.synthesize(sess).synthesisMethod).toBe('consensus');
  });
  it('weighted when 3+ ideas and no solutions/consensus', () => {
    const s = make();
    const sess = session([c('idea', 'idea1'), c('idea', 'idea2'), c('idea', 'idea3')]);
    expect(s.synthesize(sess).synthesisMethod).toBe('weighted');
  });
  it('merge default when 1-2 ideas', () => {
    const s = make();
    const sess = session([c('idea', 'one idea')]);
    expect(s.synthesize(sess).synthesisMethod).toBe('merge');
  });
});

describe('ContributionSynthesizer — hierarchical synthesis', () => {
  it('content includes solution section', () => {
    const s = make();
    const sess = session([c('solution', 'deploy redis cluster'), c('idea', 'optimize queries')]);
    expect(s.synthesize(sess).synthesizedContent).toContain('Solutions');
  });
  it('sources contain solution contribution ids', () => {
    const sol = c('solution', 'use redis');
    const s = make();
    const r = s.synthesize(session([sol]));
    expect(r.sourceContributions).toContain(sol.id);
  });
  it('critiques section included when includeCritiques=true', () => {
    const s = make({ includeCritiques: true });
    const sess = session([c('solution', 'a sol'), c('critique', 'careful with latency')]);
    expect(s.synthesize(sess).synthesizedContent).toContain('Considerations');
  });
  it('critiques excluded when includeCritiques=false', () => {
    const s = make({ includeCritiques: false });
    const sess = session([c('solution', 'deploy'), c('critique', 'latency risk')]);
    const content = s.synthesize(sess).synthesizedContent;
    expect(content).not.toContain('Considerations');
  });
  it('solutions sorted by confidence (highest first)', () => {
    const low = c('solution', 'lower confidence', 0.4);
    const high = c('solution', 'higher confidence', 0.9);
    const s = make();
    const content = s.synthesize(session([low, high])).synthesizedContent;
    expect(content.indexOf('higher confidence')).toBeLessThan(content.indexOf('lower confidence'));
  });
});

describe('ContributionSynthesizer — consensus synthesis', () => {
  it('content includes Collective Consensus header', () => {
    const s = make({ preferSolutions: false });
    const sess = session([c('consensus', 'all agree on microservices')]);
    expect(s.synthesize(sess).synthesizedContent).toContain('Collective Consensus');
  });
  it('confidence is average of included items', () => {
    const s = make({ preferSolutions: false });
    const sess = session([c('consensus', 'agree', 0.6), c('consensus', 'also agree', 0.8)]);
    const r = s.synthesize(sess);
    expect(r.confidence).toBeCloseTo(0.7, 5);
  });
});

describe('ContributionSynthesizer — weighted synthesis', () => {
  it('content includes Weighted Synthesis header', () => {
    const s = make();
    const sess = session([c('idea', 'i1'), c('idea', 'i2'), c('idea', 'i3')]);
    expect(s.synthesize(sess).synthesizedContent).toContain('Weighted Synthesis');
  });
  it('shows confidence percentage for each idea', () => {
    const s = make();
    const sess = session([c('idea', 'i1', 0.8), c('idea', 'i2', 0.8), c('idea', 'i3', 0.8)]);
    expect(s.synthesize(sess).synthesizedContent).toContain('80%');
  });
  it('maxSourcesPerSynthesis respected', () => {
    const s = make({ maxSourcesPerSynthesis: 2 });
    const sess = session([c('idea', 'i1'), c('idea', 'i2'), c('idea', 'i3'), c('idea', 'i4')]);
    expect(s.synthesize(sess).sourceContributions).toHaveLength(2);
  });
});

describe('ContributionSynthesizer — merge synthesis', () => {
  it('content includes Merged Contributions header', () => {
    const s = make();
    const sess = session([c('idea', 'single idea')]);
    expect(s.synthesize(sess).synthesizedContent).toContain('Merged Contributions');
  });
  it('sources contain all included contribution ids', () => {
    const i1 = c('idea', 'first');
    const i2 = c('critique', 'second');
    const s = make();
    const r = s.synthesize(session([i1, i2]));
    expect(r.sourceContributions).toContain(i1.id);
    expect(r.sourceContributions).toContain(i2.id);
  });
});

describe('ContributionSynthesizer — synthesizeSubset', () => {
  it('synthesizes list of contribs directly', () => {
    const s = make();
    const items = [c('idea', 'subset1'), c('idea', 'subset2'), c('idea', 'subset3')];
    const r = s.synthesizeSubset(items);
    expect(r.metadata.totalContributions).toBe(3);
  });
  it('empty subset → empty result', () => {
    const r = make().synthesizeSubset([]);
    expect(r.synthesizedContent).toBe('');
    expect(r.confidence).toBe(0);
  });
});

describe('ContributionSynthesizer — merge()', () => {
  it('returns merged contribution with synthesizer agentId', () => {
    const s = make();
    const merged = s.merge(c('idea', 'idea A'), c('idea', 'idea B'));
    expect(merged.agentId).toBe('synthesizer');
  });
  it('merged content contains both originals', () => {
    const s = make();
    const merged = s.merge(c('idea', 'alpha approach'), c('critique', 'beta concern'));
    expect(merged.content).toContain('alpha approach');
    expect(merged.content).toContain('beta concern');
  });
  it('merged confidence is average + 0.05 bonus, capped at 1', () => {
    const s = make();
    const m = s.merge(c('idea', 'x', 0.6), c('idea', 'y', 0.8));
    expect(m.confidence).toBeCloseTo(0.75, 5); // (0.6+0.8)/2 + 0.05 = 0.75
  });
  it('merged confidence capped at 1', () => {
    const s = make();
    const m = s.merge(c('solution', 'x', 1.0), c('solution', 'y', 1.0));
    expect(m.confidence).toBe(1);
  });
  it('higher type wins (solution > idea)', () => {
    const s = make();
    const m = s.merge(c('idea', 'x'), c('solution', 'y'));
    expect(m.type).toBe('solution');
  });
  it('same type preserved', () => {
    const s = make();
    expect(s.merge(c('critique', 'a'), c('critique', 'b')).type).toBe('critique');
  });
  it('merged id contains both source ids', () => {
    const a = c('idea', 'a');
    const b = c('idea', 'b');
    const s = make();
    const m = s.merge(a, b);
    expect(m.id).toContain(a.id);
    expect(m.id).toContain(b.id);
  });
});

describe('ContributionSynthesizer — findSimilar()', () => {
  it('excludes self', () => {
    const s = make();
    const target = c('idea', 'machine learning optimization');
    const result = s.findSimilar(target, [target]);
    expect(result).toHaveLength(0);
  });
  it('finds high-overlap contributions', () => {
    const s = make();
    const target = c('idea', 'implement machine learning model training');
    const similar = c('idea', 'implement machine learning model pipeline');
    const different = c('idea', 'buy groceries from store');
    const result = s.findSimilar(target, [target, similar, different]);
    expect(result).toContainEqual(similar);
    expect(result).not.toContainEqual(different);
  });
  it('custom threshold excludes below-threshold', () => {
    const s = make();
    const target = c('idea', 'abc def ghi');
    const partial = c('idea', 'abc xyz');
    const result = s.findSimilar(target, [target, partial], 0.9);
    expect(result).toHaveLength(0); // partial has low jaccard
  });
  it('empty candidates returns empty', () => {
    const s = make();
    const target = c('idea', 'any content');
    expect(s.findSimilar(target, [])).toHaveLength(0);
  });
});

describe('ContributionSynthesizer — metadata', () => {
  it('keyThemes extracts top words', () => {
    const s = make();
    const sess = session([
      c('idea', 'redis caching redis performance redis'),
      c('solution', 'redis cluster redis'),
    ]);
    const r = s.synthesize(sess);
    expect(r.metadata.keyThemes).toContain('redis');
  });
  it('averageConfidence correct', () => {
    const s = make();
    const sess = session([c('idea', 'x', 0.6), c('idea', 'y', 0.8)]);
    const r = s.synthesize(sess);
    expect(r.metadata.averageConfidence).toBeCloseTo(0.7, 5);
  });
  it('type counts correct', () => {
    const s = make();
    const sess = session([
      c('idea', 'a'),
      c('idea', 'b'),
      c('critique', 'c'),
      c('solution', 'd'),
      c('consensus', 'e'),
    ]);
    const r = s.synthesize(sess);
    expect(r.metadata.ideaCount).toBe(2);
    expect(r.metadata.critiqueCount).toBe(1);
    expect(r.metadata.solutionCount).toBe(1);
    expect(r.metadata.consensusCount).toBe(1);
  });
});
