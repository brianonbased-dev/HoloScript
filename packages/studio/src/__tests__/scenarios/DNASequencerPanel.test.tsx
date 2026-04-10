// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DNASequencerPanel } from '../../industry/scenarios/DNASequencerPanel';

describe('DNASequencerPanel', () => {
  it('renders without crashing', () => {
    // If the component has heavy requirements (e.g. providers, store state),
    // we use a simple shallow or context-wrapped render.
    // For now, this is a structural smoke test that asserts it binds properly.
    const { container } = render(<DNASequencerPanel />);
    expect(container).toBeTruthy();
  });
});
