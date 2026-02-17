/**
 * HoloScript Package Certification Badge
 *
 * Generates and validates certification badges for certified packages.
 * Badges are issued as signed JSON tokens + rendered SVG graphics.
 */

import crypto from 'crypto';
import type { CertificationLevel, CertificationResult } from './Checker.js';

// ============================================================================
// Badge Types
// ============================================================================

export interface CertificationBadge {
  /** Package name, e.g. "@studio/vr-buttons" */
  packageName: string;
  /** Package version that was certified */
  version: string;
  /** Certification level achieved */
  level: CertificationLevel;
  /** Overall score (0-100) */
  score: number;
  /** ISO8601 timestamp when badge was issued */
  issuedAt: string;
  /** ISO8601 timestamp when badge expires (1 year) */
  expiresAt: string;
  /** SHA-256 fingerprint of (packageName + version + level + issuedAt) */
  fingerprint: string;
  /** HMAC-SHA256 signature (requires secret key in production) */
  signature: string;
}

export interface BadgeVerificationResult {
  valid: boolean;
  reason?: string;
  badge?: CertificationBadge;
}

// ============================================================================
// Badge Generation
// ============================================================================

const BADGE_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year

/**
 * Issue a new certification badge from a CertificationResult.
 */
export function issueBadge(
  packageName: string,
  version: string,
  result: CertificationResult,
  signingSecret = 'holoscript-badge-secret'
): CertificationBadge | null {
  if (!result.certified || !result.level) {
    return null;
  }

  const issuedAt = (result.certifiedAt ?? new Date()).toISOString();
  const expiresAt = new Date(
    (result.certifiedAt ?? new Date()).getTime() + BADGE_TTL_MS
  ).toISOString();

  const fingerprint = computeFingerprint(packageName, version, result.level, issuedAt);
  const signature = computeSignature(fingerprint, signingSecret);

  return {
    packageName,
    version,
    level: result.level,
    score: Math.round(result.score),
    issuedAt,
    expiresAt,
    fingerprint,
    signature,
  };
}

/**
 * Verify a badge's integrity and expiry.
 */
export function verifyBadge(
  badge: CertificationBadge,
  signingSecret = 'holoscript-badge-secret'
): BadgeVerificationResult {
  // Check expiry
  if (new Date(badge.expiresAt) < new Date()) {
    return { valid: false, reason: 'Badge has expired' };
  }

  // Verify fingerprint
  const expectedFingerprint = computeFingerprint(
    badge.packageName,
    badge.version,
    badge.level,
    badge.issuedAt
  );
  if (!crypto.timingSafeEqual(
    Buffer.from(badge.fingerprint, 'hex'),
    Buffer.from(expectedFingerprint, 'hex')
  )) {
    return { valid: false, reason: 'Fingerprint mismatch — badge may be tampered' };
  }

  // Verify signature
  const expectedSignature = computeSignature(badge.fingerprint, signingSecret);
  if (!crypto.timingSafeEqual(
    Buffer.from(badge.signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  )) {
    return { valid: false, reason: 'Signature invalid — badge may be forged' };
  }

  return { valid: true, badge };
}

// ============================================================================
// SVG Generation
// ============================================================================

const LEVEL_COLORS: Record<CertificationLevel, { bg: string; text: string; border: string }> = {
  bronze:   { bg: '#CD7F32', text: '#fff', border: '#a0622a' },
  silver:   { bg: '#C0C0C0', text: '#333', border: '#a0a0a0' },
  gold:     { bg: '#FFD700', text: '#333', border: '#c8a800' },
  platinum: { bg: '#E5E4E2', text: '#333', border: '#b0b0b0' },
};

const LEVEL_ICONS: Record<CertificationLevel, string> = {
  bronze:   '🥉',
  silver:   '🥈',
  gold:     '🥇',
  platinum: '💎',
};

/**
 * Generate a badge SVG string suitable for embedding in READMEs or websites.
 */
export function generateBadgeSVG(badge: CertificationBadge): string {
  const colors = LEVEL_COLORS[badge.level];
  const icon = LEVEL_ICONS[badge.level];
  const levelLabel = badge.level.charAt(0).toUpperCase() + badge.level.slice(1);
  const shortPkg = badge.packageName.length > 24
    ? '…' + badge.packageName.slice(-21)
    : badge.packageName;
  const expiryYear = new Date(badge.expiresAt).getFullYear();

  return `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="80" viewBox="0 0 200 80">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${colors.bg}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${colors.border}" stop-opacity="1"/>
    </linearGradient>
  </defs>
  <!-- Background -->
  <rect x="1" y="1" width="198" height="78" rx="8" ry="8"
    fill="url(#bg)" stroke="${colors.border}" stroke-width="1.5"/>
  <!-- Top bar: HoloScript brand -->
  <rect x="1" y="1" width="198" height="24" rx="8" ry="8" fill="#1a1a2e"/>
  <rect x="1" y="14" width="198" height="10" fill="#1a1a2e"/>
  <text x="100" y="17" font-family="system-ui,sans-serif" font-size="11" font-weight="bold"
    fill="#00d4ff" text-anchor="middle">✓ HoloScript Certified</text>
  <!-- Package name -->
  <text x="100" y="41" font-family="monospace,sans-serif" font-size="10"
    fill="${colors.text}" text-anchor="middle" font-weight="bold">${escapeXml(shortPkg)}</text>
  <!-- Level badge -->
  <text x="100" y="58" font-family="system-ui,sans-serif" font-size="14" font-weight="bold"
    fill="${colors.text}" text-anchor="middle">${icon} ${levelLabel}</text>
  <!-- Score + expiry -->
  <text x="100" y="72" font-family="system-ui,sans-serif" font-size="9"
    fill="${colors.text}" text-anchor="middle" opacity="0.8">
    Score: ${badge.score}/100 · Expires ${expiryYear}
  </text>
</svg>`;
}

/**
 * Generate a compact Markdown shield badge (shields.io compatible URL).
 * Returns a markdown string: ![HoloScript Certified](url)
 */
export function generateMarkdownBadge(badge: CertificationBadge): string {
  const levelLabel = badge.level.charAt(0).toUpperCase() + badge.level.slice(1);
  const colors: Record<CertificationLevel, string> = {
    bronze: 'CD7F32',
    silver: 'C0C0C0',
    gold: 'FFD700',
    platinum: 'E5E4E2',
  };
  const color = colors[badge.level];
  const label = encodeURIComponent('HoloScript');
  const message = encodeURIComponent(`Certified ${levelLabel}`);
  return `![HoloScript Certified](https://img.shields.io/badge/${label}-${message}-${color}?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA2NCA2NCI+PC9zdmc+)`;
}

// ============================================================================
// Badge Store (in-memory for testing; swap for DB in production)
// ============================================================================

const _store = new Map<string, CertificationBadge>();

function badgeKey(packageName: string, version: string): string {
  return `${packageName}@${version}`;
}

export function storeBadge(badge: CertificationBadge): void {
  _store.set(badgeKey(badge.packageName, badge.version), badge);
}

export function getBadge(packageName: string, version: string): CertificationBadge | undefined {
  return _store.get(badgeKey(packageName, version));
}

export function listBadges(): CertificationBadge[] {
  return Array.from(_store.values());
}

export function revokeBadge(packageName: string, version: string): boolean {
  return _store.delete(badgeKey(packageName, version));
}

export function isActivelyCertified(packageName: string, version: string): boolean {
  const badge = getBadge(packageName, version);
  if (!badge) return false;
  return new Date(badge.expiresAt) > new Date();
}

// ============================================================================
// Helpers
// ============================================================================

function computeFingerprint(
  packageName: string,
  version: string,
  level: CertificationLevel,
  issuedAt: string
): string {
  return crypto
    .createHash('sha256')
    .update(`${packageName}:${version}:${level}:${issuedAt}`)
    .digest('hex');
}

function computeSignature(fingerprint: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(fingerprint)
    .digest('hex');
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
