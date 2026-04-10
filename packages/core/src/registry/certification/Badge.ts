/**
 * HoloScript Certification Badge System
 *
 * Generates and validates certification badges for packages.
 */

import { createHmac } from 'crypto';
import type { CertificationResult } from './CertificationChecker';

/**
 * Badge display format
 */
export type BadgeFormat = 'text' | 'markdown' | 'html' | 'svg' | 'json';

/**
 * Badge style
 */
export type BadgeStyle = 'flat' | 'flat-square' | 'plastic' | 'for-the-badge';

/**
 * Badge options
 */
export interface BadgeOptions {
  format: BadgeFormat;
  style?: BadgeStyle;
  includeExpiry?: boolean;
  includeGrade?: boolean;
}

/**
 * Certificate data stored in registry
 */
export interface Certificate {
  id: string;
  packageName: string;
  packageVersion: string;
  issuedAt: string;
  expiresAt: string;
  grade: 'A' | 'B';
  score: number;
  issuer: string;
  signature?: string;
}

/**
 * Badge generator for certified packages
 */
const SIGNING_KEY = process.env.HOLOSCRIPT_CERT_KEY || 'holoscript-registry-default-signing-key';

export class BadgeGenerator {
  private readonly baseUrl = 'https://registry.holoscript.net';

  /**
   * Generate a badge for a certification result
   */
  generateBadge(result: CertificationResult, options: BadgeOptions): string {
    if (!result.certified) {
      return this.generateNotCertifiedBadge(options);
    }

    switch (options.format) {
      case 'text':
        return this.generateTextBadge(result, options);
      case 'markdown':
        return this.generateMarkdownBadge(result, options);
      case 'html':
        return this.generateHtmlBadge(result, options);
      case 'svg':
        return this.generateSvgBadge(result, options);
      case 'json':
        return this.generateJsonBadge(result);
      default:
        return this.generateTextBadge(result, options);
    }
  }

  /**
   * Generate a badge URL for shields.io style badges
   */
  generateBadgeUrl(packageName: string, options: { style?: BadgeStyle } = {}): string {
    const style = options.style || 'flat';
    const encodedName = encodeURIComponent(packageName);
    return `${this.baseUrl}/badge/${encodedName}.svg?style=${style}`;
  }

  /**
   * Verify a certificate is valid
   */
  verifyCertificate(certificate: Certificate): {
    valid: boolean;
    reason?: string;
  } {
    // Check expiry
    const now = new Date();
    const expiresAt = new Date(certificate.expiresAt);

    if (now > expiresAt) {
      return { valid: false, reason: 'Certificate has expired' };
    }

    // Check grade
    if (certificate.grade !== 'A' && certificate.grade !== 'B') {
      return { valid: false, reason: 'Invalid grade for certification' };
    }

    // Verify HMAC-SHA256 signature
    if (certificate.signature) {
      if (!this.verifySignature(certificate)) {
        return { valid: false, reason: 'Invalid signature' };
      }
    }

    return { valid: true };
  }

  /**
   * Compute HMAC-SHA256 signature for a certificate.
   */
  signCertificate(certificate: Certificate): string {
    const data = `${certificate.id}:${certificate.packageName}:${certificate.packageVersion}:${certificate.issuedAt}:${certificate.expiresAt}:${certificate.grade}:${certificate.score}`;
    return createHmac('sha256', SIGNING_KEY).update(data).digest('hex');
  }

  /**
   * Verify a certificate's HMAC-SHA256 signature.
   */
  private verifySignature(certificate: Certificate): boolean {
    const expected = this.signCertificate(certificate);
    return certificate.signature === expected;
  }

  /**
   * Create a certificate from certification result
   */
  createCertificate(result: CertificationResult): Certificate | null {
    if (!result.certified || !result.certificateId) {
      return null;
    }

    return {
      id: result.certificateId,
      packageName: result.packageName,
      packageVersion: result.packageVersion,
      issuedAt: result.timestamp,
      expiresAt: result.expiresAt || this.calculateExpiry(),
      grade: result.grade as 'A' | 'B',
      score: result.score,
      issuer: 'HoloScript Registry',
    };
  }

  // Private badge generators

  private generateTextBadge(result: CertificationResult, options: BadgeOptions): string {
    const lines = [
      '┌─────────────────────────────────────────┐',
      '│  ✓ HoloScript Certified                 │',
      '│                                         │',
      `│  ${this.padRight(result.packageName, 36)}│`,
      `│  Version: ${this.padRight(result.packageVersion, 27)}│`,
    ];

    if (options.includeGrade) {
      lines.push(`│  Grade: ${this.padRight(result.grade, 29)}│`);
    }

    lines.push(`│  Certified: ${this.padRight(this.formatDate(result.timestamp), 25)}│`);

    if (options.includeExpiry && result.expiresAt) {
      lines.push(`│  Expires: ${this.padRight(this.formatDate(result.expiresAt), 27)}│`);
    }

    lines.push('└─────────────────────────────────────────┘');

    return lines.join('\n');
  }

  private generateMarkdownBadge(result: CertificationResult, options: BadgeOptions): string {
    const badgeUrl = this.generateBadgeUrl(result.packageName, { style: options.style });
    const profileUrl = `${this.baseUrl}/packages/${encodeURIComponent(result.packageName)}`;

    let markdown = `[![HoloScript Certified](${badgeUrl})](${profileUrl})\n\n`;

    markdown += `**${result.packageName}** v${result.packageVersion}\n\n`;
    markdown += `- ✓ Certified: ${this.formatDate(result.timestamp)}\n`;

    if (options.includeGrade) {
      markdown += `- Grade: **${result.grade}** (${result.score}/${result.maxScore})\n`;
    }

    if (options.includeExpiry && result.expiresAt) {
      markdown += `- Expires: ${this.formatDate(result.expiresAt)}\n`;
    }

    markdown += `- Certificate ID: \`${result.certificateId}\`\n`;

    return markdown;
  }

  private generateHtmlBadge(result: CertificationResult, options: BadgeOptions): string {
    const badgeUrl = this.generateBadgeUrl(result.packageName, { style: options.style });
    const profileUrl = `${this.baseUrl}/packages/${encodeURIComponent(result.packageName)}`;

    return `
<div class="holoscript-badge">
  <a href="${profileUrl}" target="_blank" rel="noopener">
    <img src="${badgeUrl}" alt="HoloScript Certified" />
  </a>
  <div class="badge-details">
    <strong>${this.escapeHtml(result.packageName)}</strong>
    <span>v${this.escapeHtml(result.packageVersion)}</span>
    ${options.includeGrade ? `<span class="grade grade-${result.grade.toLowerCase()}">Grade ${result.grade}</span>` : ''}
  </div>
</div>`.trim();
  }

  private generateSvgBadge(result: CertificationResult, _options: BadgeOptions): string {
    const width = 180;
    const height = 20;
    const labelWidth = 80;
    const labelText = 'HoloScript';
    const statusText = `Certified ${result.grade}`;
    const labelColor = '#555';
    const statusColor = result.grade === 'A' ? '#4c1' : '#97CA00';

    return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <linearGradient id="b" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="a">
    <rect width="${width}" height="${height}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#a)">
    <rect width="${labelWidth}" height="${height}" fill="${labelColor}"/>
    <rect x="${labelWidth}" width="${width - labelWidth}" height="${height}" fill="${statusColor}"/>
    <rect width="${width}" height="${height}" fill="url(#b)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11">
    <text x="${labelWidth / 2}" y="15" fill="#010101" fill-opacity=".3">${labelText}</text>
    <text x="${labelWidth / 2}" y="14">${labelText}</text>
    <text x="${labelWidth + (width - labelWidth) / 2}" y="15" fill="#010101" fill-opacity=".3">${statusText}</text>
    <text x="${labelWidth + (width - labelWidth) / 2}" y="14">${statusText}</text>
  </g>
</svg>`.trim();
  }

  private generateJsonBadge(result: CertificationResult): string {
    return JSON.stringify(
      {
        schemaVersion: 1,
        label: 'HoloScript',
        message: result.certified ? `Certified ${result.grade}` : 'Not Certified',
        color: result.certified ? (result.grade === 'A' ? 'brightgreen' : 'green') : 'red',
        isError: !result.certified,
        namedLogo: 'holoscript',
        logoColor: 'white',
        style: 'flat',
        cacheSeconds: 3600,
      },
      null,
      2
    );
  }

  private generateNotCertifiedBadge(options: BadgeOptions): string {
    switch (options.format) {
      case 'text':
        return `
┌─────────────────────────────────────────┐
│  ✗ Not Certified                        │
│                                         │
│  This package has not been certified.   │
│  Run: holoscript certify                │
└─────────────────────────────────────────┘`.trim();

      case 'markdown':
        return `![Not Certified](https://img.shields.io/badge/HoloScript-Not%20Certified-red)`;

      case 'html':
        return `<span class="holoscript-badge not-certified">Not Certified</span>`;

      case 'svg':
        return `
<svg xmlns="http://www.w3.org/2000/svg" width="140" height="20">
  <rect width="140" height="20" rx="3" fill="#e05d44"/>
  <text x="70" y="14" fill="#fff" text-anchor="middle" font-family="sans-serif" font-size="11">Not Certified</text>
</svg>`.trim();

      case 'json':
        return JSON.stringify({ certified: false, message: 'Not Certified' });

      default:
        return 'Not Certified';
    }
  }

  // Helpers

  private padRight(str: string, length: number): string {
    return str.length >= length ? str.substring(0, length) : str + ' '.repeat(length - str.length);
  }

  private formatDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toISOString().split('T')[0];
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private calculateExpiry(): string {
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 1);
    return expiry.toISOString();
  }
}

/**
 * Create a badge generator instance
 */
export function createBadgeGenerator(): BadgeGenerator {
  return new BadgeGenerator();
}

/**
 * Default badge generator instance
 */
export const defaultBadgeGenerator = createBadgeGenerator();
