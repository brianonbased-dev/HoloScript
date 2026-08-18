// @vitest-environment jsdom
/**
 * twinProof is the first shipped panel to earn `verified` — the claim's inputs
 * are twin-anchored (altitude → entity craft-1) AND its declared fault was
 * watched failing at build time. This test covers the human half, in the same
 * voice as liveProof.render.test.tsx: a person can watch the verdict break and
 * put it back, and the verified anchor is visible on the rendered surface —
 * not asserted from internal state.
 *
 * (Authored to complete a teammate's in-flight verified-tier demo: the panel
 * and its regenerated registry were built by the prior live-proof session;
 * this file adds the missing render coverage so the work can land.)
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/react';

import TwinProofComponent from '../twinProof.native';

describe('twin proof — the verified rung, watchable by a non-developer', () => {
  it('starts green, so there is something to watch break', () => {
    render(<TwinProofComponent />);
    expect(screen.getByText('✓ Craft below ceiling holds')).toBeInTheDocument();
  });

  it('carries the verified tier and the anchor naming its twin', () => {
    const { container } = render(<TwinProofComponent />);
    const verdict = container.querySelector('[data-proof-independence]');
    expect(verdict).not.toBeNull();
    expect(verdict).toHaveAttribute('data-proof-independence', 'verified');
    const anchors = verdict?.getAttribute('data-proof-anchors') ?? '';
    expect(anchors).toContain('altitude');
    expect(anchors).toContain('craft-1');
  });

  it('flips to FALSIFIED when a person presses the declared fault, and undo restores', () => {
    render(<TwinProofComponent />);
    fireEvent.click(screen.getByText(/^Break it: a craft far above its ceiling/));
    expect(screen.getByText('✗ Craft below ceiling FALSIFIED')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Put it back'));
    expect(screen.getByText('✓ Craft below ceiling holds')).toBeInTheDocument();
  });
});
