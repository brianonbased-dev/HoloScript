/**
 * CompletionProvider — Production Test Suite
 *
 * Covers: @ trigger (trait/directive completions), prefix filtering,
 * empty prefix (node types), property context (prefix with colon/dot),
 * general search, registerTrait (custom trait visible in @ and general),
 * totalCompletions count, kind field correctness.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { CompletionProvider } from '../CompletionProvider';

describe('CompletionProvider — Production', () => {
  let cp: CompletionProvider;

  beforeEach(() => {
    cp = new CompletionProvider();
  });

  // ─── totalCompletions ─────────────────────────────────────────────
  it('totalCompletions is > 0 by default', () => {
    expect(cp.totalCompletions).toBeGreaterThan(0);
  });

  it('totalCompletions increases after registerTrait', () => {
    const before = cp.totalCompletions;
    cp.registerTrait({ label: 'myTrait', kind: 'trait' });
    expect(cp.totalCompletions).toBe(before + 1);
  });

  // ─── empty prefix → node types ─────────────────────────────────────
  it('empty prefix returns node type completions', () => {
    const items = cp.getCompletions({ prefix: '' });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(i => i.kind === 'type')).toBe(true);
  });

  it('node type completions include "box"', () => {
    const items = cp.getCompletions({ prefix: '' });
    expect(items.some(i => i.label === 'box')).toBe(true);
  });

  // ─── @ trigger → traits + directives ──────────────────────────────
  it('@ trigger char returns trait/directive items', () => {
    const items = cp.getCompletions({ prefix: '@', triggerChar: '@' });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(i => i.kind === 'trait' || i.kind === 'directive')).toBe(true);
  });

  it('@ prefix without triggerChar also returns trait/directive items', () => {
    const items = cp.getCompletions({ prefix: '@' });
    expect(items.every(i => i.kind === 'trait' || i.kind === 'directive')).toBe(true);
  });

  it('@grab filters to traits starting with "grab"', () => {
    const items = cp.getCompletions({ prefix: '@grab', triggerChar: '@' });
    expect(items.every(i => i.label.startsWith('grab'))).toBe(true);
    expect(items.some(i => i.label === 'grabbable')).toBe(true);
  });

  it('@version returns directive "version"', () => {
    const items = cp.getCompletions({ prefix: '@version', triggerChar: '@' });
    expect(items.some(i => i.label === 'version' && i.kind === 'directive')).toBe(true);
  });

  it('@nonexistent returns empty array', () => {
    const items = cp.getCompletions({ prefix: '@zzznone', triggerChar: '@' });
    expect(items).toHaveLength(0);
  });

  // ─── property context (prefix with colon) ─────────────────────────
  it('colon prefix returns property completions', () => {
    const items = cp.getCompletions({ prefix: 'position:' });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(i => i.kind === 'property')).toBe(true);
  });

  it('dot prefix returns property completions', () => {
    const items = cp.getCompletions({ prefix: 'node.col' });
    expect(items.length).toBeGreaterThan(0);
    expect(items.every(i => i.kind === 'property')).toBe(true);
  });

  // ─── general search ──────────────────────────────────────────────
  it('general search for "box" returns matching items', () => {
    const items = cp.getCompletions({ prefix: 'box' });
    expect(items.some(i => i.label === 'box')).toBe(true);
  });

  it('general search is case-insensitive', () => {
    const items = cp.getCompletions({ prefix: 'BOX' });
    expect(items.some(i => i.label === 'box')).toBe(true);
  });

  it('general search returns empty for unknown prefix', () => {
    const items = cp.getCompletions({ prefix: 'xyznonexistent123' });
    expect(items).toHaveLength(0);
  });

  // ─── registerTrait ────────────────────────────────────────────────
  it('registered custom trait appears in @ completions', () => {
    cp.registerTrait({ label: 'hologram', kind: 'trait', detail: 'Custom hologram trait', insertText: '@hologram' });
    const items = cp.getCompletions({ prefix: '@', triggerChar: '@' });
    expect(items.some(i => i.label === 'hologram')).toBe(true);
  });

  it('registered custom trait appears in general search', () => {
    cp.registerTrait({ label: 'hologram', kind: 'trait' });
    const items = cp.getCompletions({ prefix: 'holo' });
    expect(items.some(i => i.label === 'hologram')).toBe(true);
  });

  it('registered trait prefix filter in @ context', () => {
    cp.registerTrait({ label: 'hologram', kind: 'trait' });
    const items = cp.getCompletions({ prefix: '@holo', triggerChar: '@' });
    expect(items.some(i => i.label === 'hologram')).toBe(true);
  });

  // ─── insertText / kind field ─────────────────────────────────────
  it('grabbable trait has insertText', () => {
    const items = cp.getCompletions({ prefix: '@grab', triggerChar: '@' });
    const grabbable = items.find(i => i.label === 'grabbable');
    expect(grabbable?.insertText).toBe('@grabbable');
  });

  it('all items returned have a label string', () => {
    const items = cp.getCompletions({ prefix: '' });
    expect(items.every(i => typeof i.label === 'string' && i.label.length > 0)).toBe(true);
  });
});
