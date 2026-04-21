// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import {
  MotivationStackPanel,
  MOTIVATION_STACK_DEMO,
  type MotivationSignal,
} from '../MotivationStackPanel';

describe('MotivationStackPanel', () => {
  it('renders sorted signals and provenance', () => {
    const signals: MotivationSignal[] = [
      { id: 'a', label: 'Low', value: 0.2, source: 'src:a' },
      { id: 'b', label: 'High', value: 0.9, source: 'src:b' },
    ];
    render(<MotivationStackPanel signals={signals} title="Test stack" />);

    expect(screen.getByRole('region', { name: 'Test stack' })).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
    expect(screen.getByText('Low')).toBeTruthy();
    expect(screen.getByText('src:b')).toBeTruthy();
    expect(screen.getByText('src:a')).toBeTruthy();
  });

  it('shows empty state when no signals', () => {
    render(<MotivationStackPanel signals={[]} />);
    expect(screen.getByText('No motivation signals.')).toBeTruthy();
  });

  it('demo fixture has expected ids', () => {
    const ids = new Set(MOTIVATION_STACK_DEMO.map((s) => s.id));
    expect(ids.has('autonomy')).toBe(true);
    expect(ids.has('competence')).toBe(true);
    expect(MOTIVATION_STACK_DEMO.length).toBeGreaterThanOrEqual(4);
  });
});
