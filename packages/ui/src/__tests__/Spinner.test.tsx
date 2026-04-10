import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Spinner } from '../components/Spinner';

describe('Spinner', () => {
  it('renders an SVG element', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
  });

  it('applies animate-spin class', () => {
    const { container } = render(<Spinner />);
    const svg = container.querySelector('svg');
    expect(svg?.className.baseVal).toContain('animate-spin');
  });

  it('applies sm size class', () => {
    const { container } = render(<Spinner size="sm" />);
    const svg = container.querySelector('svg');
    expect(svg?.className.baseVal).toContain('h-4');
    expect(svg?.className.baseVal).toContain('w-4');
  });

  it('applies lg size class', () => {
    const { container } = render(<Spinner size="lg" />);
    const svg = container.querySelector('svg');
    expect(svg?.className.baseVal).toContain('h-8');
    expect(svg?.className.baseVal).toContain('w-8');
  });

  it('merges custom className', () => {
    const { container } = render(<Spinner className="text-blue-500" />);
    const svg = container.querySelector('svg');
    expect(svg?.className.baseVal).toContain('text-blue-500');
  });
});
