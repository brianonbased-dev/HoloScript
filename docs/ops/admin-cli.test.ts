import { describe, it, expect } from 'vitest';
import {
  renderDashboard,
  mockOpsStatus,
  mockLb,
  joinBase,
} from './admin-cli';

describe('P.008.05 admin-cli (ops dashboard)', () => {
  it('renders regions, circuit breakers, and LB block', () => {
    const out = renderDashboard(mockOpsStatus(), mockLb(), null, 80);
    expect(out).toContain('us-west');
    expect(out).toContain('unity');
    expect(out).toContain('open');
    expect(out).toContain('normalized:');
    expect(out).toContain('us-west=0.450');
  });

  it('joinBase strips trailing slashes', () => {
    expect(joinBase('http://x:3000/')).toBe('http://x:3000');
  });
});
