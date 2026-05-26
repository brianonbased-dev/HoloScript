// @vitest-environment jsdom
/**
 * Console design-system contract (D.066): every interactive target is >=64px
 * and nothing depends on hover. Failing-if-broken: a component under 64px, or
 * any hover-only affordance in the module source, fails this suite.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, cleanup, screen } from '@testing-library/react';
import { tokens } from '../tokens';
import { TapTarget } from '../primitives';
import { ActionTile } from '../ActionTile';
import { ActionChip } from '../ActionChip';
import { StatusStrip } from '../StatusStrip';
import { SayOrType } from '../SayOrType';

afterEach(cleanup);

/** Inline numeric minHeight renders as "<n>px"; parse and assert >= 64. */
function tapMinPx(el: HTMLElement): number {
  return parseInt(el.style.minHeight || '0', 10);
}

describe('console tokens', () => {
  it('declares a >=64px tap minimum', () => {
    expect(tokens.tap.min).toBeGreaterThanOrEqual(64);
  });
});

describe('every interactive primitive is >=64px tap size', () => {
  it('TapTarget (Tap/Click)', () => {
    render(
      <TapTarget onTap={() => {}} testId="tt">
        Go
      </TapTarget>
    );
    expect(tapMinPx(screen.getByTestId('tt'))).toBeGreaterThanOrEqual(64);
  });

  it('ActionTile primary action', () => {
    render(<ActionTile label="Open the proof" href="https://x.test" testId="tile" />);
    expect(tapMinPx(screen.getByTestId('tile-action'))).toBeGreaterThanOrEqual(64);
  });

  it('ActionChip reversible (one-tap approve)', () => {
    render(<ActionChip label="Add a test" reversible onApprove={() => {}} testId="chip" />);
    expect(tapMinPx(screen.getByTestId('chip'))).toBeGreaterThanOrEqual(64);
  });

  it('ActionChip gated (navigate to review)', () => {
    render(<ActionChip label="Deploy" reversible={false} href="https://x.test" testId="chip2" />);
    expect(tapMinPx(screen.getByTestId('chip2'))).toBeGreaterThanOrEqual(64);
  });

  it('StatusStrip interactive cell', () => {
    render(<StatusStrip cells={[{ label: 'OK', value: 3, tone: 'ok', onTap: () => {} }]} testId="strip" />);
    const cell = screen.getByLabelText('OK: 3');
    expect(tapMinPx(cell)).toBeGreaterThanOrEqual(64);
  });

  it('SayOrType talk, input, and send all meet the minimum', () => {
    render(<SayOrType onSubmit={() => {}} onTalk={() => {}} testId="say" />);
    expect(tapMinPx(screen.getByTestId('say-talk'))).toBeGreaterThanOrEqual(64);
    expect(tapMinPx(screen.getByTestId('say-input'))).toBeGreaterThanOrEqual(64);
    expect(tapMinPx(screen.getByTestId('say-send'))).toBeGreaterThanOrEqual(64);
  });
});

describe('zero hover-dependence (D.066)', () => {
  it('no console component uses a hover affordance', () => {
    const dir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const files = readdirSync(dir).filter((f) => /\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(resolve(dir, f), 'utf8');
      if (/onMouseEnter|onMouseOver|onMouseLeave|:hover/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
