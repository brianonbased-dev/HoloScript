/**
 * M7 Social/Marketplace — utility and logic tests
 *
 * Tests pure functions extracted from M7 components:
 * - timeAgo: relative time formatting (SharePanel)
 * - formatCount: number abbreviation (ContentCard)
 * - formatFileSize: byte formatting (ContentCard)
 * - Avatar initials: name → initials (CollabBar)
 */
import { describe, it, expect } from 'vitest';

// ── timeAgo (from SharePanel.tsx, lines 16-24) ──────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

describe('timeAgo', () => {
  it('returns "just now" for current time', () => {
    expect(timeAgo(new Date().toISOString())).toBe('just now');
  });

  it('returns minutes for recent', () => {
    const d = new Date(Date.now() - 5 * 60_000);
    expect(timeAgo(d.toISOString())).toBe('5m ago');
  });

  it('returns hours for older', () => {
    const d = new Date(Date.now() - 3 * 60 * 60_000);
    expect(timeAgo(d.toISOString())).toBe('3h ago');
  });

  it('returns days for old', () => {
    const d = new Date(Date.now() - 48 * 60 * 60_000);
    expect(timeAgo(d.toISOString())).toBe('2d ago');
  });
});

// ── formatCount (from ContentCard.tsx, lines 38-43) ──────────────────

function formatCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

describe('formatCount', () => {
  it('returns plain number below 1000', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
  });

  it('returns K format at exactly 1000', () => {
    expect(formatCount(1000)).toBe('1.0K');
  });

  it('returns K format for large numbers', () => {
    expect(formatCount(1500)).toBe('1.5K');
    expect(formatCount(10000)).toBe('10.0K');
    expect(formatCount(123456)).toBe('123.5K');
  });
});

// ── formatFileSize (from ContentCard.tsx, lines 46-51) ───────────────

function formatFileSize(bytes?: number): string | null {
  if (!bytes) return null;
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

describe('formatFileSize', () => {
  it('returns null for undefined/0', () => {
    expect(formatFileSize(undefined)).toBeNull();
    expect(formatFileSize(0)).toBeNull();
  });

  it('formats bytes', () => {
    expect(formatFileSize(512)).toBe('512B');
  });

  it('formats kilobytes', () => {
    expect(formatFileSize(2048)).toBe('2.0KB');
    expect(formatFileSize(1536)).toBe('1.5KB');
  });

  it('formats megabytes', () => {
    expect(formatFileSize(1048576)).toBe('1.0MB');
    expect(formatFileSize(5242880)).toBe('5.0MB');
  });
});

// ── Avatar initials (from CollabBar.tsx, lines 20-24) ────────────────

function avatarInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

describe('Avatar initials', () => {
  it('extracts two-letter initials from full name', () => {
    expect(avatarInitials('John Doe')).toBe('JD');
  });

  it('uses single initial for one word', () => {
    expect(avatarInitials('Alice')).toBe('A');
  });

  it('takes only first two words', () => {
    expect(avatarInitials('John Michael Doe')).toBe('JM');
  });

  it('handles empty string', () => {
    expect(avatarInitials('')).toBe('');
  });

  it('handles lowercase', () => {
    expect(avatarInitials('bob smith')).toBe('BS');
  });
});
