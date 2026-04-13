/**
 * BadgeGenerator — Production Tests
 *
 * Covers all badge formats (text/markdown/html/svg/json), not-certified path,
 * HMAC signing, certificate verification (valid/expired/tampered), createCertificate.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  BadgeGenerator,
  createBadgeGenerator,
  defaultBadgeGenerator,
  type Certificate,
} from '@holoscript/core';
import type { CertificationResult } from '@holoscript/core';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FUTURE = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
const PAST = new Date(Date.now() - 100).toISOString();

function certifiedResult(grade: 'A' | 'B' = 'A'): CertificationResult {
  return {
    packageName: '@test/awesome',
    packageVersion: '2.0.0',
    timestamp: new Date().toISOString(),
    certified: true,
    score: 95,
    maxScore: 100,
    grade,
    checks: [],
    summary: { passed: 15, failed: 0, warnings: 2, skipped: 0 },
    certificateId: 'CERT-abc12345',
    expiresAt: FUTURE,
  };
}

function uncertifiedResult(): CertificationResult {
  return {
    packageName: '@test/bad',
    packageVersion: '0.1.0',
    timestamp: new Date().toISOString(),
    certified: false,
    score: 20,
    maxScore: 100,
    grade: 'F',
    checks: [],
    summary: { passed: 5, failed: 10, warnings: 2, skipped: 0 },
  };
}

function baseCertificate(overrides: Partial<Certificate> = {}): Certificate {
  return {
    id: 'CERT-abc12345',
    packageName: '@test/awesome',
    packageVersion: '2.0.0',
    issuedAt: new Date().toISOString(),
    expiresAt: FUTURE,
    grade: 'A',
    score: 95,
    issuer: 'HoloScript Registry',
    ...overrides,
  };
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('BadgeGenerator — construction', () => {
  it('createBadgeGenerator() returns instance', () => {
    expect(createBadgeGenerator()).toBeInstanceOf(BadgeGenerator);
  });
  it('defaultBadgeGenerator is a BadgeGenerator', () => {
    expect(defaultBadgeGenerator).toBeInstanceOf(BadgeGenerator);
  });
});

// ─── generateBadge: not certified ─────────────────────────────────────────────

describe('BadgeGenerator — generateBadge: not certified', () => {
  let gen: BadgeGenerator;
  beforeEach(() => {
    gen = new BadgeGenerator();
  });

  it('text format: not certified contains "Not Certified"', () => {
    const b = gen.generateBadge(uncertifiedResult(), { format: 'text' });
    expect(b).toContain('Not Certified');
  });
  it('markdown format: not certified contains shields.io red badge', () => {
    const b = gen.generateBadge(uncertifiedResult(), { format: 'markdown' });
    expect(b).toContain('Not%20Certified');
  });
  it('html format: not certified contains not-certified class', () => {
    const b = gen.generateBadge(uncertifiedResult(), { format: 'html' });
    expect(b).toContain('not-certified');
  });
  it('svg format: not certified contains red fill and Not Certified text', () => {
    const b = gen.generateBadge(uncertifiedResult(), { format: 'svg' });
    expect(b).toContain('#e05d44');
    expect(b).toContain('Not Certified');
  });
  it('json format: not certified contains certified=false', () => {
    const b = gen.generateBadge(uncertifiedResult(), { format: 'json' });
    const parsed = JSON.parse(b);
    expect(parsed.certified).toBe(false);
  });
});

// ─── generateBadge: certified — text ──────────────────────────────────────────

describe('BadgeGenerator — generateBadge: text', () => {
  let gen: BadgeGenerator;
  beforeEach(() => {
    gen = new BadgeGenerator();
  });

  it('contains package name', () => {
    const b = gen.generateBadge(certifiedResult(), { format: 'text' });
    expect(b).toContain('@test/awesome');
  });
  it('contains version', () => {
    const b = gen.generateBadge(certifiedResult(), { format: 'text' });
    expect(b).toContain('2.0.0');
  });
  it('includes grade when includeGrade=true', () => {
    const b = gen.generateBadge(certifiedResult('B'), { format: 'text', includeGrade: true });
    expect(b).toContain('Grade');
  });
  it('includes expiry when includeExpiry=true', () => {
    const b = gen.generateBadge(certifiedResult(), { format: 'text', includeExpiry: true });
    expect(b).toContain('Expires');
  });
  it('does not includes grade when includeGrade=false', () => {
    const b = gen.generateBadge(certifiedResult(), { format: 'text', includeGrade: false });
    // Only the box top/bottom border markers
    expect(b).not.toContain('Grade:');
  });
});

// ─── generateBadge: certified — markdown ─────────────────────────────────────

describe('BadgeGenerator — generateBadge: markdown', () => {
  let gen: BadgeGenerator;
  beforeEach(() => {
    gen = new BadgeGenerator();
  });

  it('contains img markdown for badge URL', () => {
    const b = gen.generateBadge(certifiedResult(), { format: 'markdown' });
    expect(b).toContain('[![HoloScript Certified]');
  });
  it('contains package name in bold', () => {
    const b = gen.generateBadge(certifiedResult(), { format: 'markdown' });
    expect(b).toContain('**@test/awesome**');
  });
  it('contains certificateId', () => {
    const b = gen.generateBadge(certifiedResult(), { format: 'markdown' });
    expect(b).toContain('CERT-abc12345');
  });
  it('grade visible when includeGrade=true', () => {
    const b = gen.generateBadge(certifiedResult('B'), { format: 'markdown', includeGrade: true });
    expect(b).toContain('Grade:');
  });
});

// ─── generateBadge: certified — html ─────────────────────────────────────────

describe('BadgeGenerator — generateBadge: html', () => {
  let gen: BadgeGenerator;
  beforeEach(() => {
    gen = new BadgeGenerator();
  });

  it('contains holoscript-badge class', () => {
    const b = gen.generateBadge(certifiedResult(), { format: 'html' });
    expect(b).toContain('holoscript-badge');
  });
  it('contains escaped package name', () => {
    const b = gen.generateBadge(certifiedResult(), { format: 'html' });
    // name contains @ which doesn't need escaping
    expect(b).toContain('@test/awesome');
  });
  it('contains grade class when includeGrade=true', () => {
    const b = gen.generateBadge(certifiedResult('A'), { format: 'html', includeGrade: true });
    expect(b).toContain('grade-a');
  });
});

// ─── generateBadge: certified — svg ──────────────────────────────────────────

describe('BadgeGenerator — generateBadge: svg', () => {
  let gen: BadgeGenerator;
  beforeEach(() => {
    gen = new BadgeGenerator();
  });

  it('is valid SVG (contains <svg)', () => {
    const b = gen.generateBadge(certifiedResult(), { format: 'svg' });
    expect(b).toContain('<svg');
    expect(b).toContain('</svg>');
  });
  it('grade A uses green fill #4c1', () => {
    const b = gen.generateBadge(certifiedResult('A'), { format: 'svg' });
    expect(b).toContain('#4c1');
  });
  it('grade B uses #97CA00 fill', () => {
    const b = gen.generateBadge(certifiedResult('B'), { format: 'svg' });
    expect(b).toContain('#97CA00');
  });
  it('contains Certified in status text', () => {
    const b = gen.generateBadge(certifiedResult(), { format: 'svg' });
    expect(b).toContain('Certified');
  });
});

// ─── generateBadge: certified — json ─────────────────────────────────────────

describe('BadgeGenerator — generateBadge: json', () => {
  let gen: BadgeGenerator;
  beforeEach(() => {
    gen = new BadgeGenerator();
  });

  it('is valid JSON', () => {
    const b = gen.generateBadge(certifiedResult(), { format: 'json' });
    expect(() => JSON.parse(b)).not.toThrow();
  });
  it('isError=false for certified', () => {
    const parsed = JSON.parse(gen.generateBadge(certifiedResult(), { format: 'json' }));
    expect(parsed.isError).toBe(false);
  });
  it('color is brightgreen for grade A', () => {
    const parsed = JSON.parse(gen.generateBadge(certifiedResult('A'), { format: 'json' }));
    expect(parsed.color).toBe('brightgreen');
  });
  it('color is green for grade B', () => {
    const parsed = JSON.parse(gen.generateBadge(certifiedResult('B'), { format: 'json' }));
    expect(parsed.color).toBe('green');
  });
  it('schemaVersion is 1', () => {
    const parsed = JSON.parse(gen.generateBadge(certifiedResult(), { format: 'json' }));
    expect(parsed.schemaVersion).toBe(1);
  });
});

// ─── generateBadgeUrl ─────────────────────────────────────────────────────────

describe('BadgeGenerator — generateBadgeUrl', () => {
  let gen: BadgeGenerator;
  beforeEach(() => {
    gen = new BadgeGenerator();
  });

  it('returns https URL ending in .svg', () => {
    const url = gen.generateBadgeUrl('@test/pkg');
    expect(url).toMatch(/^https:\/\//);
    expect(url).toContain('.svg');
  });
  it('encodes special chars in package name', () => {
    const url = gen.generateBadgeUrl('@test/widget');
    expect(url).toContain('%40test%2Fwidget');
  });
  it('default style is flat', () => {
    expect(gen.generateBadgeUrl('pkg')).toContain('style=flat');
  });
  it('style=plastic is reflected in URL', () => {
    expect(gen.generateBadgeUrl('pkg', { style: 'plastic' })).toContain('style=plastic');
  });
});

// ─── signCertificate / verifyCertificate ─────────────────────────────────────

describe('BadgeGenerator — signing', () => {
  let gen: BadgeGenerator;
  beforeEach(() => {
    gen = new BadgeGenerator();
  });

  it('signCertificate returns a non-empty hex string', () => {
    const sig = gen.signCertificate(baseCertificate());
    expect(sig).toBeTruthy();
    expect(sig).toMatch(/^[0-9a-f]+$/);
  });
  it('same certificate => same signature (deterministic)', () => {
    const cert = baseCertificate();
    expect(gen.signCertificate(cert)).toBe(gen.signCertificate(cert));
  });
  it('different packageName => different signature', () => {
    const a = gen.signCertificate(baseCertificate({ packageName: 'pkg-a' }));
    const b = gen.signCertificate(baseCertificate({ packageName: 'pkg-b' }));
    expect(a).not.toBe(b);
  });
  it('valid cert with correct signature → valid=true', () => {
    const cert = baseCertificate();
    cert.signature = gen.signCertificate(cert);
    expect(gen.verifyCertificate(cert).valid).toBe(true);
  });
  it('tampered signature → valid=false, reason contains "Invalid signature"', () => {
    const cert = baseCertificate({ signature: 'deadbeef' });
    const result = gen.verifyCertificate(cert);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('signature');
  });
  it('expired certificate → valid=false, reason contains "expired"', () => {
    const cert = baseCertificate({ expiresAt: PAST });
    const result = gen.verifyCertificate(cert);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });
  it('no signature field → passes (signature optional)', () => {
    const cert = baseCertificate();
    delete cert.signature;
    expect(gen.verifyCertificate(cert).valid).toBe(true);
  });
});

// ─── createCertificate ────────────────────────────────────────────────────────

describe('BadgeGenerator — createCertificate', () => {
  let gen: BadgeGenerator;
  beforeEach(() => {
    gen = new BadgeGenerator();
  });

  it('returns Certificate for certified result', () => {
    const cert = gen.createCertificate(certifiedResult());
    expect(cert).not.toBeNull();
    expect(cert!.packageName).toBe('@test/awesome');
  });
  it('returns null for uncertified result', () => {
    expect(gen.createCertificate(uncertifiedResult())).toBeNull();
  });
  it('returns null when no certificateId', () => {
    const result = { ...certifiedResult(), certificateId: undefined };
    expect(gen.createCertificate(result)).toBeNull();
  });
  it('issuer is HoloScript Registry', () => {
    const cert = gen.createCertificate(certifiedResult());
    expect(cert!.issuer).toBe('HoloScript Registry');
  });
  it('grade is preserved from result', () => {
    const certB = gen.createCertificate(certifiedResult('B'));
    expect(certB!.grade).toBe('B');
  });
});
