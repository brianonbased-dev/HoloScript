import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UncertaintyIndicator } from '../components/UncertaintyIndicator';

describe('UncertaintyIndicator', () => {
  describe('input shapes', () => {
    it('renders confidence value as percent in ring (default variant)', () => {
      render(<UncertaintyIndicator confidence={0.78} />);
      const el = screen.getByRole('img');
      expect(el.getAttribute('aria-label')).toContain('78% confidence');
    });

    it('inverts uncertainty value (low uncertainty = high confidence)', () => {
      render(<UncertaintyIndicator uncertainty={0.1} />);
      const el = screen.getByRole('img');
      // 1 - 0.1 = 0.9 = 90%
      expect(el.getAttribute('aria-label')).toContain('90% confidence');
    });

    it('scales severity 0-100 to confidence (low severity = high confidence)', () => {
      render(<UncertaintyIndicator severity={20} />);
      const el = screen.getByRole('img');
      // 1 - 20/100 = 0.8 = 80%
      expect(el.getAttribute('aria-label')).toContain('80% confidence');
    });

    it('treats severity 100 as zero confidence', () => {
      render(<UncertaintyIndicator severity={100} />);
      const el = screen.getByRole('img');
      expect(el.getAttribute('aria-label')).toContain('0% confidence');
    });

    it('clamps confidence values above 1', () => {
      render(<UncertaintyIndicator confidence={1.5} />);
      const el = screen.getByRole('img');
      expect(el.getAttribute('aria-label')).toContain('100% confidence');
    });

    it('clamps confidence values below 0', () => {
      render(<UncertaintyIndicator confidence={-0.2} />);
      const el = screen.getByRole('img');
      expect(el.getAttribute('aria-label')).toContain('0% confidence');
    });

    it('renders unknown state when no input is provided', () => {
      render(<UncertaintyIndicator />);
      const el = screen.getByRole('img');
      expect(el.getAttribute('aria-label')).toContain('unknown');
    });

    it('renders unknown state for NaN', () => {
      render(<UncertaintyIndicator confidence={NaN} />);
      const el = screen.getByRole('img');
      expect(el.getAttribute('aria-label')).toContain('unknown');
    });
  });

  describe('level labels', () => {
    it('labels >= 0.9 as Very High', () => {
      render(<UncertaintyIndicator confidence={0.95} />);
      expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Very High');
    });

    it('labels [0.75, 0.9) as High', () => {
      render(<UncertaintyIndicator confidence={0.8} />);
      expect(screen.getByRole('img').getAttribute('aria-label')).toContain('High');
    });

    it('labels [0.6, 0.75) as Moderate', () => {
      render(<UncertaintyIndicator confidence={0.65} />);
      expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Moderate');
    });

    it('labels [0.4, 0.6) as Low', () => {
      render(<UncertaintyIndicator confidence={0.5} />);
      expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Low');
    });

    it('labels < 0.4 as Very Low', () => {
      render(<UncertaintyIndicator confidence={0.2} />);
      expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Very Low');
    });
  });

  describe('accessibility', () => {
    it('always renders role="img" with aria-label', () => {
      render(<UncertaintyIndicator confidence={0.5} />);
      const el = screen.getByRole('img');
      expect(el).toBeInTheDocument();
      expect(el.getAttribute('aria-label')).toBeTruthy();
    });

    it('prefixes aria-label with provided label', () => {
      render(<UncertaintyIndicator confidence={0.7} label="Model agreement" />);
      const el = screen.getByRole('img');
      expect(el.getAttribute('aria-label')).toContain('Model agreement');
      expect(el.getAttribute('aria-label')).toContain('70% confidence');
    });

    it('marks decorative SVG and text spans aria-hidden', () => {
      const { container } = render(<UncertaintyIndicator confidence={0.5} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('ring variant', () => {
    it('renders SVG with two circles (background + value ring)', () => {
      const { container } = render(<UncertaintyIndicator confidence={0.6} />);
      const circles = container.querySelectorAll('svg circle');
      expect(circles.length).toBe(2);
    });

    it('uses provided size for the SVG', () => {
      const { container } = render(<UncertaintyIndicator confidence={0.6} size={40} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('40');
      expect(svg?.getAttribute('height')).toBe('40');
    });

    it('renders custom children inside the ring instead of percent text', () => {
      render(
        <UncertaintyIndicator confidence={0.6}>
          <span data-testid="child">A</span>
        </UncertaintyIndicator>
      );
      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('full-confidence ring has zero stroke-dashoffset', () => {
      const { container } = render(<UncertaintyIndicator confidence={1} />);
      const valueRing = container.querySelectorAll('svg circle')[1];
      expect(Number(valueRing.getAttribute('stroke-dashoffset'))).toBeCloseTo(0, 5);
    });
  });

  describe('badge variant', () => {
    it('renders percent text and level label', () => {
      render(<UncertaintyIndicator confidence={0.78} variant="badge" />);
      const el = screen.getByRole('img');
      expect(el.textContent).toContain('78%');
      expect(el.textContent?.toLowerCase()).toContain('high');
    });

    it('shows em-dash and "unknown" for missing value', () => {
      render(<UncertaintyIndicator variant="badge" />);
      const el = screen.getByRole('img');
      expect(el.textContent).toContain('—');
      expect(el.textContent?.toLowerCase()).toContain('unknown');
    });
  });

  describe('dot variant', () => {
    it('renders a sized dot with role="img"', () => {
      render(<UncertaintyIndicator confidence={0.6} variant="dot" size={12} />);
      const el = screen.getByRole('img');
      expect(el.style.width).toBe('12px');
      expect(el.style.height).toBe('12px');
    });

    it('uses default size of 8 when not specified', () => {
      render(<UncertaintyIndicator confidence={0.6} variant="dot" />);
      const el = screen.getByRole('img');
      expect(el.style.width).toBe('8px');
    });
  });

  describe('color tiers', () => {
    it('uses emerald tier for very high confidence', () => {
      const { container } = render(<UncertaintyIndicator confidence={0.95} variant="badge" />);
      const el = container.firstChild as HTMLElement;
      expect(el.className).toContain('emerald');
    });

    it('uses red tier for very low confidence', () => {
      const { container } = render(<UncertaintyIndicator confidence={0.1} variant="badge" />);
      const el = container.firstChild as HTMLElement;
      expect(el.className).toContain('red');
    });

    it('uses neutral slate tier for unknown', () => {
      const { container } = render(<UncertaintyIndicator variant="badge" />);
      const el = container.firstChild as HTMLElement;
      expect(el.className).toContain('slate');
    });
  });

  describe('className passthrough', () => {
    it('merges custom className', () => {
      const { container } = render(
        <UncertaintyIndicator confidence={0.5} className="custom-class" />
      );
      const el = container.firstChild as HTMLElement;
      expect(el.className).toContain('custom-class');
    });
  });
});
