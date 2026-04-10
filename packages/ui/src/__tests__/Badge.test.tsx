import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../components/Badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('applies default variant class', () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText('Default');
    expect(badge.className).toContain('bg-emerald-500/20');
  });

  it('applies destructive variant class', () => {
    render(<Badge variant="destructive">Error</Badge>);
    const badge = screen.getByText('Error');
    expect(badge.className).toContain('bg-red-500/20');
  });

  it('applies outline variant class', () => {
    render(<Badge variant="outline">Draft</Badge>);
    const badge = screen.getByText('Draft');
    expect(badge.className).toContain('border-slate-700');
  });

  it('merges custom className', () => {
    render(<Badge className="extra">Custom</Badge>);
    const badge = screen.getByText('Custom');
    expect(badge.className).toContain('extra');
  });
});
