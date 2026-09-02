// @vitest-environment jsdom
/**
 * The check we watch fail.
 *
 * `liveProof.native.tsx` is @generated from `panels/liveProof.holo`, where the
 * verdict declares the faults it must catch. The compiler already refuses to build
 * a claim that survives its own declared faults — this test covers the other half:
 * that a PERSON can drive the failure and see it, without reading code.
 *
 * That is the whole differentiator (CG-772). A verdict you are asked to trust is
 * decoration; a verdict you have personally watched go red is evidence. So the
 * assertions below are deliberately written against what a human sees on screen —
 * the words "holds" and "FALSIFIED", and buttons labelled in plain English — not
 * against internal state.
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, within } from '@testing-library/react';

import LiveProofComponent from '../liveProof.native';

const VERDICT = /Structural margin (holds|FALSIFIED)/;

describe('live proof — a non-developer can watch the check fail', () => {
  it('starts green, so there is something to watch break', () => {
    render(<LiveProofComponent />);
    expect(screen.getByText('✓ Structural margin holds')).toBeInTheDocument();
  });

  it('offers every declared fault as a plain-English button', () => {
    render(<LiveProofComponent />);
    const buttons = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((t) => t.startsWith('Break it:'));
    expect(buttons).toHaveLength(3);
    expect(buttons.join(' | ')).toContain('loaded past what it can hold');
  });

  it('flips to FALSIFIED when a person presses a fault, and back when they undo it', () => {
    render(<LiveProofComponent />);

    fireEvent.click(screen.getByText(/^Break it: a beam loaded past/));
    expect(screen.getByText('✗ Structural margin FALSIFIED')).toBeInTheDocument();
    expect(screen.queryByText('✓ Structural margin holds')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Put it back'));
    expect(screen.getByText('✓ Structural margin holds')).toBeInTheDocument();
  });

  it('every declared fault actually turns the verdict red on screen', () => {
    render(<LiveProofComponent />);
    const faultLabels = screen
      .getAllByRole('button')
      .filter((b) => (b.textContent ?? '').startsWith('Break it:'));

    for (const button of faultLabels) {
      fireEvent.click(button);
      expect(screen.getByText(VERDICT).textContent).toContain('FALSIFIED');
      fireEvent.click(screen.getByText('Put it back'));
      expect(screen.getByText(VERDICT).textContent).toContain('holds');
    }
  });

  it('dragging the load past the margin falsifies it in-band', () => {
    const { container } = render(<LiveProofComponent />);
    const slider = container.querySelector('input[type="range"]');
    expect(slider).not.toBeNull();

    // capacity 200, factor 1.5 -> anything above 133.3 kN must fail.
    fireEvent.change(slider as Element, { target: { value: '180' } });
    expect(screen.getByText(VERDICT).textContent).toContain('FALSIFIED');

    fireEvent.change(slider as Element, { target: { value: '100' } });
    expect(screen.getByText(VERDICT).textContent).toContain('holds');
  });

  it('states in plain language that it was broken on purpose, and how many ways', () => {
    render(<LiveProofComponent />);
    expect(screen.getByText(/Broken on purpose 3 ways when this was built/)).toBeInTheDocument();
    expect(screen.getByText(/the check caught all of them/)).toBeInTheDocument();
  });

  it('carries a machine-readable receipt of what was broken', () => {
    const { container } = render(<LiveProofComponent />);
    const holder = container.querySelector('[data-proof-faults]');
    expect(holder).not.toBeNull();

    const receipt = JSON.parse(holder!.getAttribute('data-proof-faults') as string);
    expect(receipt).toHaveLength(3);
    expect(receipt.every((r: { because: string }) => r.because.length > 0)).toBe(true);
  });

  it('claims fault-tested rather than self-referential', () => {
    const { container } = render(<LiveProofComponent />);
    const holder = container.querySelector('[data-proof-independence]');
    expect(holder?.getAttribute('data-proof-independence')).toBe('fault-tested');
  });

  it('keeps the verdict and its controls in one region', () => {
    const { container } = render(<LiveProofComponent />);
    const region = container.querySelector('[data-proof-faults]') as HTMLElement;
    expect(within(region).getByText(VERDICT)).toBeInTheDocument();
  });
});
