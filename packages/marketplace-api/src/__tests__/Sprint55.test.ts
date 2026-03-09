/**
 * Sprint 55 — @marketplace-api acceptance tests
 * Covers: parseVersionRequirement, satisfies, compareVersions, getLatestVersion,
 *         VerificationService (email/github/domain/source), RateLimiter, SpamDetector
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseVersionRequirement,
  satisfies,
  compareVersions,
  getLatestVersion,
} from '../DependencyResolver.js';
import {
  VerificationService,
  RateLimiter,
  SpamDetector,
  VERIFICATION_REQUIREMENTS,
  VERIFICATION_BADGES,
} from '../VerificationService.js';

// ═══════════════════════════════════════════════
// parseVersionRequirement
// ═══════════════════════════════════════════════
describe('parseVersionRequirement', () => {
  it('is a function', () => {
    expect(typeof parseVersionRequirement).toBe('function');
  });

  it('returns tag for "latest"', () => {
    const result = parseVersionRequirement('latest');
    expect(result.type).toBe('tag');
    expect(result.value).toBe('latest');
  });

  it('returns tag for "next"', () => {
    expect(parseVersionRequirement('next').type).toBe('tag');
  });

  it('returns tag for "beta"', () => {
    expect(parseVersionRequirement('beta').type).toBe('tag');
  });

  it('returns exact for valid semver', () => {
    const result = parseVersionRequirement('1.2.3');
    expect(result.type).toBe('exact');
    expect(result.value).toBe('1.2.3');
  });

  it('returns range for caret range', () => {
    const result = parseVersionRequirement('^1.2.3');
    expect(result.type).toBe('range');
    expect(result.value).toBe('^1.2.3');
  });

  it('returns range for tilde range', () => {
    const result = parseVersionRequirement('~1.2.3');
    expect(result.type).toBe('range');
  });

  it('returns range for wildcard', () => {
    const result = parseVersionRequirement('*');
    expect(result.type).toBe('range');
  });

  it('returns range for >= constraint', () => {
    const result = parseVersionRequirement('>=2.0.0');
    expect(result.type).toBe('range');
  });
});

// ═══════════════════════════════════════════════
// satisfies
// ═══════════════════════════════════════════════
describe('satisfies', () => {
  it('is a function', () => {
    expect(typeof satisfies).toBe('function');
  });

  it('wildcard satisfies any version', () => {
    expect(satisfies('1.0.0', '*')).toBe(true);
  });

  it('"latest" satisfies any version', () => {
    expect(satisfies('3.5.2', 'latest')).toBe(true);
  });

  it('exact version satisfies itself', () => {
    expect(satisfies('2.0.0', '2.0.0')).toBe(true);
  });

  it('version outside range returns false', () => {
    expect(satisfies('3.0.0', '^2.0.0')).toBe(false);
  });

  it('caret range matches compatible minor/patch', () => {
    expect(satisfies('1.5.3', '^1.0.0')).toBe(true);
  });

  it('tilde range matches patch only', () => {
    expect(satisfies('1.2.9', '~1.2.0')).toBe(true);
    expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// compareVersions
// ═══════════════════════════════════════════════
describe('compareVersions', () => {
  it('is a function', () => {
    expect(typeof compareVersions).toBe('function');
  });

  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
  });

  it('returns 1 when first is greater', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
  });

  it('returns -1 when first is less', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
  });

  it('compares minor versions correctly', () => {
    expect(compareVersions('1.5.0', '1.3.0')).toBe(1);
  });

  it('compares patch versions correctly', () => {
    expect(compareVersions('1.0.2', '1.0.10')).toBe(-1);
  });
});

// ═══════════════════════════════════════════════
// getLatestVersion
// ═══════════════════════════════════════════════
describe('getLatestVersion', () => {
  it('is a function', () => {
    expect(typeof getLatestVersion).toBe('function');
  });

  it('returns null for empty array', () => {
    expect(getLatestVersion([])).toBeNull();
  });

  it('returns null for invalid versions', () => {
    expect(getLatestVersion(['not-a-version', 'also-not'])).toBeNull();
  });

  it('returns single valid version', () => {
    expect(getLatestVersion(['1.0.0'])).toBe('1.0.0');
  });

  it('returns highest from multiple versions', () => {
    expect(getLatestVersion(['1.0.0', '2.0.0', '1.5.0'])).toBe('2.0.0');
  });

  it('ignores invalid versions in mixed list', () => {
    expect(getLatestVersion(['1.0.0', 'bad', '0.9.0'])).toBe('1.0.0');
  });
});

// ═══════════════════════════════════════════════
// VERIFICATION_REQUIREMENTS and VERIFICATION_BADGES
// ═══════════════════════════════════════════════
describe('VERIFICATION_REQUIREMENTS', () => {
  it('none requires nothing', () => {
    expect(VERIFICATION_REQUIREMENTS.none).toEqual([]);
  });

  it('basic requires email', () => {
    expect(VERIFICATION_REQUIREMENTS.basic).toContain('email');
  });

  it('verified requires email and github', () => {
    expect(VERIFICATION_REQUIREMENTS.verified).toContain('email');
    expect(VERIFICATION_REQUIREMENTS.verified).toContain('github');
  });

  it('trusted adds domain requirement', () => {
    expect(VERIFICATION_REQUIREMENTS.trusted).toContain('domain');
  });

  it('official adds manual requirement', () => {
    expect(VERIFICATION_REQUIREMENTS.official).toContain('manual');
  });
});

describe('VERIFICATION_BADGES', () => {
  it('none has empty badge', () => {
    expect(VERIFICATION_BADGES.none).toBe('');
  });

  it('basic has a checkmark', () => {
    expect(VERIFICATION_BADGES.basic).toBeTruthy();
  });

  it('all levels have badge entries', () => {
    for (const level of ['none', 'basic', 'verified', 'trusted', 'official'] as const) {
      expect(level in VERIFICATION_BADGES).toBe(true);
    }
  });
});

// ═══════════════════════════════════════════════
// VerificationService
// ═══════════════════════════════════════════════
describe('VerificationService', () => {
  let svc: VerificationService;

  beforeEach(() => {
    svc = new VerificationService();
  });

  it('creates instance without options', () => {
    expect(svc).toBeDefined();
  });

  // ── getVerificationStatus (unverified user) ──
  it('unverified user has level "none"', async () => {
    const status = await svc.getVerificationStatus('user-x');
    expect(status.verified).toBe(false);
    expect(status.level).toBe('none');
  });

  // ── startEmailVerification ──
  it('startEmailVerification returns sent and expiresIn', async () => {
    const result = await svc.startEmailVerification('u1', 'test@example.com');
    expect(result.sent).toBe(true);
    expect(result.expiresIn).toBe(30 * 60);
  });

  // ── verifyEmail ──
  it('verifyEmail with wrong code returns false', async () => {
    await svc.startEmailVerification('u1', 'test@example.com');
    expect(await svc.verifyEmail('u1', 'XXXXXX')).toBe(false);
  });

  it('verifyEmail for unknown user returns false', async () => {
    expect(await svc.verifyEmail('unknown', 'ABCDEF')).toBe(false);
  });

  it('after email verification, level is "basic"', async () => {
    // Use emailSender to capture code
    let capturedCode = '';
    const svcWithCapture = new VerificationService({
      emailSender: async (_to, _subject, body) => {
        const match = body.match(/code is: ([A-F0-9]+)/);
        if (match) capturedCode = match[1];
      },
    });
    await svcWithCapture.startEmailVerification('u2', 'user@example.com');
    const verified = await svcWithCapture.verifyEmail('u2', capturedCode);
    expect(verified).toBe(true);
    const status = await svcWithCapture.getVerificationStatus('u2');
    expect(status.level).toBe('basic');
  });

  // ── startGitHubVerification ──
  it('startGitHubVerification returns authUrl and state', async () => {
    const result = await svc.startGitHubVerification('u3');
    expect(result.authUrl).toContain('github.com');
    expect(result.state).toBeTruthy();
  });

  // ── completeGitHubVerification ──
  it('completeGitHubVerification with invalid state returns false', async () => {
    expect(await svc.completeGitHubVerification('bad-state', 'alice')).toBe(false);
  });

  it('valid GitHub verification flow', async () => {
    const { state } = await svc.startGitHubVerification('u4');
    const result = await svc.completeGitHubVerification(state, 'alice-gh');
    expect(result).toBe(true);
  });

  // ── startDomainVerification ──
  it('startDomainVerification returns DNS method and token', async () => {
    const result = await svc.startDomainVerification('u5', 'example.com');
    expect(result.method).toBe('dns');
    expect(result.value).toContain('holoscript-verify=');
  });

  // ── checkDomainVerification ──
  it('checkDomainVerification after start returns true', async () => {
    await svc.startDomainVerification('u6', 'mysite.com');
    const verified = await svc.checkDomainVerification('u6', 'mysite.com');
    expect(verified).toBe(true);
  });

  it('checkDomainVerification without start returns false', async () => {
    expect(await svc.checkDomainVerification('u99', 'nosuchsite.com')).toBe(false);
  });

  // ── meetsRequirements ──
  it('unverified user does not meet basic requirement', async () => {
    expect(await svc.meetsRequirements('u-fresh', 'basic')).toBe(false);
  });

  it('unverified user meets "none" requirement', async () => {
    expect(await svc.meetsRequirements('u-fresh', 'none')).toBe(true);
  });

  // ── verifyTraitSource ──
  it('safe code returns safe:true', async () => {
    const result = await svc.verifyTraitSource(
      'export function greet(name) { return "Hello " + name; }'
    );
    expect(result.safe).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('eval() is flagged as unsafe', async () => {
    const result = await svc.verifyTraitSource('eval("dangerous code")');
    expect(result.safe).toBe(false);
    expect(result.issues.some((i) => i.includes('eval'))).toBe(true);
  });

  it('Function constructor is flagged as unsafe', async () => {
    const result = await svc.verifyTraitSource('new Function("return 1")');
    expect(result.safe).toBe(false);
  });

  it('fetch triggers a warning, not an error', async () => {
    const result = await svc.verifyTraitSource('fetch("https://api.example.com")');
    expect(result.safe).toBe(true); // warnings don't make it unsafe
    expect(result.warnings.some((w) => w.includes('Network'))).toBe(true);
  });

  it('returns sha256 hash', async () => {
    const result = await svc.verifyTraitSource('const x = 1;');
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// ═══════════════════════════════════════════════
// RateLimiter
// ═══════════════════════════════════════════════
describe('RateLimiter', () => {
  it('creates with defaults', () => {
    const rl = new RateLimiter();
    expect(rl).toBeDefined();
  });

  it('allows first request', () => {
    const rl = new RateLimiter(60_000, 10);
    expect(rl.isAllowed('user-1')).toBe(true);
  });

  it('allows requests up to the limit', () => {
    const rl = new RateLimiter(60_000, 3);
    expect(rl.isAllowed('u')).toBe(true);
    expect(rl.isAllowed('u')).toBe(true);
    expect(rl.isAllowed('u')).toBe(true);
  });

  it('blocks request over limit', () => {
    const rl = new RateLimiter(60_000, 2);
    rl.isAllowed('u');
    rl.isAllowed('u');
    expect(rl.isAllowed('u')).toBe(false);
  });

  it('getRemaining decrements with each request', () => {
    const rl = new RateLimiter(60_000, 5);
    rl.isAllowed('u');
    rl.isAllowed('u');
    expect(rl.getRemaining('u')).toBe(3);
  });

  it('getRemaining for unknown key returns max', () => {
    const rl = new RateLimiter(60_000, 5);
    expect(rl.getRemaining('new-user')).toBe(5);
  });

  it('reset clears requests and allows again', () => {
    const rl = new RateLimiter(60_000, 1);
    rl.isAllowed('u');
    expect(rl.isAllowed('u')).toBe(false);
    rl.reset('u');
    expect(rl.isAllowed('u')).toBe(true);
  });

  it('different keys are independent', () => {
    const rl = new RateLimiter(60_000, 1);
    rl.isAllowed('a');
    expect(rl.isAllowed('b')).toBe(true);
  });

  it('getResetTime returns 0 for unused key', () => {
    const rl = new RateLimiter(60_000, 5);
    expect(rl.getResetTime('unseen')).toBe(0);
  });

  it('getResetTime is positive after request', () => {
    const rl = new RateLimiter(60_000, 5);
    rl.isAllowed('u');
    expect(rl.getResetTime('u')).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════
// SpamDetector
// ═══════════════════════════════════════════════
describe('SpamDetector', () => {
  let detector: SpamDetector;

  beforeEach(() => {
    detector = new SpamDetector();
  });

  it('creates instance', () => {
    expect(detector).toBeDefined();
  });

  it('normal content is not spam', () => {
    const result = detector.isSpam('u1', 'This is a great trait for my VR project!');
    expect(result.isSpam).toBe(false);
  });

  it('content under 10 chars is spam', () => {
    const result = detector.isSpam('u1', 'ok');
    expect(result.isSpam).toBe(true);
    expect(result.reason).toContain('short');
  });

  it('duplicate content within session is spam', () => {
    const content = 'This trait is absolutely amazing for XR development!';
    detector.isSpam('u1', content);
    const result = detector.isSpam('u1', content);
    expect(result.isSpam).toBe(true);
    expect(result.reason).toContain('Duplicate');
  });

  it('different users can post same content', () => {
    const content = 'This trait is absolutely amazing for XR development!';
    detector.isSpam('u1', content);
    const result = detector.isSpam('u2', content);
    expect(result.isSpam).toBe(false);
  });

  it('spam pattern "buy now" is detected', () => {
    const result = detector.isSpam('u1', 'This is great! Buy now for the best deals ever!!');
    expect(result.isSpam).toBe(true);
  });

  it('repeated characters are detected as spam', () => {
    const result = detector.isSpam('u1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(result.isSpam).toBe(true);
  });

  it('URL pattern triggers spam', () => {
    const result = detector.isSpam('u1', 'Check this out http://example.com/something cool');
    expect(result.isSpam).toBe(true);
  });

  it('isSpam result has isSpam boolean', () => {
    const result = detector.isSpam('u1', 'Great package, very useful for my project indeed.');
    expect(typeof result.isSpam).toBe('boolean');
  });
});
