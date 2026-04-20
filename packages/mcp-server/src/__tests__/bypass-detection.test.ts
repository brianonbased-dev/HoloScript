import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  analyzeXForwardedFor,
  checkRateLimitBypass,
  ipv4Subnet24,
  resetBypassDetectionForTests,
} from '../security/bypass-detection';

describe('bypass-detection', () => {
  beforeEach(() => {
    resetBypassDetectionForTests();
    process.env.BYPASS_SUBNET_IP_THRESHOLD = '2';
    process.env.BYPASS_TOKEN_DIVERSITY_THRESHOLD = '4';
  });

  afterEach(() => {
    delete process.env.BYPASS_SUBNET_IP_THRESHOLD;
    delete process.env.BYPASS_TOKEN_DIVERSITY_THRESHOLD;
    resetBypassDetectionForTests();
  });

  it('ipv4Subnet24', () => {
    expect(ipv4Subnet24('192.168.1.5')).toBe('192.168.1.0/24');
    expect(ipv4Subnet24('::1')).toBeNull();
  });

  it('flags long XFF chains', () => {
    const xff = Array.from({ length: 8 }, (_, i) => `10.0.0.${i}`).join(', ');
    expect(analyzeXForwardedFor(xff, '203.0.113.1').suspicious).toBe(true);
  });

  it('flags private left hop with public TCP peer', () => {
    expect(analyzeXForwardedFor('10.0.0.1, 203.0.113.9', '203.0.113.2').suspicious).toBe(true);
  });

  it('blocks subnet when too many unique IPs hit same tool', async () => {
    for (let i = 1; i <= 2; i++) {
      const r = await checkRateLimitBypass({
        toolName: 'parse_hs',
        directIp: `10.1.2.${i}`,
        bearerToken: `tok-${i}-xxxxxxxx`,
      });
      expect(r.allowed).toBe(true);
    }
    const blocked = await checkRateLimitBypass({
      toolName: 'parse_hs',
      directIp: '10.1.2.3',
      bearerToken: 'tok-3-yyyyyyyy',
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('subnet_rate_bypass_suspected');
  });

  it('blocks many distinct tokens from same IP', async () => {
    for (let i = 0; i < 4; i++) {
      await checkRateLimitBypass({
        toolName: 'compile_holoscript',
        directIp: '198.51.100.9',
        bearerToken: `distinct-token-${i}-secret`,
      });
    }
    const r = await checkRateLimitBypass({
      toolName: 'compile_holoscript',
      directIp: '198.51.100.9',
      bearerToken: 'distinct-token-99-secret',
    });
    expect(r.allowed).toBe(false);
    expect(r.reason).toBe('token_rotation_burst');
  });
});
