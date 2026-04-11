// @vitest-environment jsdom
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ContentTypeFilter } from '../ContentTypeFilter';

describe('ContentTypeFilter', () => {
  it('renders without crashing', () => {
    const { container } = render(<ContentTypeFilter selectedTypes={[]} onChange={() => {}} />);
    expect(container).toBeTruthy();
  });
});
