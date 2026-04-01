import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatCard } from '../components/StatCard';

describe('StatCard', () => {
  it('renders title and formatted number value', () => {
    render(<StatCard title="Total Sales" value={1234} format="number" />);
    expect(screen.getByText('Total Sales')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('formats USD values', () => {
    render(<StatCard title="Revenue" value={99500} format="usd" />);
    expect(screen.getByText('$99,500')).toBeInTheDocument();
  });

  it('formats ETH values', () => {
    render(<StatCard title="Balance" value={1.5} format="eth" />);
    expect(screen.getByText('1.5000 ETH')).toBeInTheDocument();
  });

  it('shows positive trend with + prefix', () => {
    render(<StatCard title="Users" value={500} format="number" trend={12.3} />);
    expect(screen.getByText('+12.3%')).toBeInTheDocument();
    expect(screen.getByText('vs last period')).toBeInTheDocument();
  });

  it('shows negative trend without + prefix', () => {
    render(<StatCard title="Users" value={500} format="number" trend={-5.1} />);
    expect(screen.getByText('-5.1%')).toBeInTheDocument();
  });

  it('renders loading skeleton when loading', () => {
    const { container } = render(
      <StatCard title="Users" value={0} format="number" loading />
    );
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    // Should not render the value text when loading
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('does not render trend section when trend is undefined', () => {
    render(<StatCard title="Users" value={100} format="number" />);
    expect(screen.queryByText('vs last period')).not.toBeInTheDocument();
  });
});
