/**
 * @fileoverview Verification service for authors and traits
 * @module marketplace-api/VerificationService
 */

import { createHash, randomBytes } from 'crypto';
import type { VerificationStatus, VerificationEvidence } from './types.js';

// =============================================================================
// VERIFICATION LEVELS
// =============================================================================

/**
 * Verification badge levels
 */
export type VerificationLevel = 'none' | 'basic' | 'verified' | 'trusted' | 'official';

/**
 * Requirements for each verification level
 */
export const VERIFICATION_REQUIREMENTS: Record<VerificationLevel, string[]> = {
  none: [],
  basic: ['email'],
  verified: ['email', 'github'],
  trusted: ['email', 'github', 'domain'],
  official: ['email', 'github', 'domain', 'manual'],
};

/**
 * Badge icons for each level
 */
export const VERIFICATION_BADGES: Record<VerificationLevel, string> = {
  none: '',
  basic: '✓',
  verified: '✓✓',
  trusted: '⭐',
  official: '🏆',
};

// =============================================================================
// VERIFICATION SERVICE
// =============================================================================

/**
 * Service for verifying authors and traits
 */
export class VerificationService {
  private pendingVerifications: Map<string, PendingVerification> = new Map();
  private verifiedEntities: Map<string, VerificationRecord> = new Map();
  private emailCodes: Map<string, { code: string; expiresAt: Date }> = new Map();

  // Mock email sender (would be real in production)
  private emailSender?: (to: string, subject: string, body: string) => Promise<void>;

  constructor(
    options: { emailSender?: (to: string, subject: string, body: string) => Promise<void> } = {}
  ) {
    this.emailSender = options.emailSender;
  }

  /**
   * Start email verification
   */
  async startEmailVerification(
    userId: string,
    email: string
  ): Promise<{ sent: boolean; expiresIn: number }> {
    const code = randomBytes(3).toString('hex').toUpperCase();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    this.emailCodes.set(userId, { code, expiresAt });

    if (this.emailSender) {
      await this.emailSender(
        email,
        'Verify your HoloScript Marketplace account',
        `Your verification code is: ${code}\n\nThis code expires in 30 minutes.`
      );
    }

    return { sent: true, expiresIn: 30 * 60 };
  }

  /**
   * Verify email with code
   */
  async verifyEmail(userId: string, code: string): Promise<boolean> {
    const stored = this.emailCodes.get(userId);
    if (!stored) {
      return false;
    }

    if (new Date() > stored.expiresAt) {
      this.emailCodes.delete(userId);
      return false;
    }

    if (stored.code !== code.toUpperCase()) {
      return false;
    }

    // Email verified
    this.emailCodes.delete(userId);
    await this.recordEvidence(userId, { type: 'email', value: 'verified', verified: true });
    return true;
  }

  /**
   * Start GitHub verification via OAuth
   */
  async startGitHubVerification(userId: string): Promise<{ authUrl: string; state: string }> {
    const state = randomBytes(16).toString('hex');

    // Store state for verification
    this.pendingVerifications.set(state, {
      userId,
      type: 'github',
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });

    // Mock OAuth URL (would be real GitHub OAuth in production)
    const authUrl = `https://github.com/login/oauth/authorize?client_id=mock&state=${state}&scope=read:user`;

    return { authUrl, state };
  }

  /**
   * Complete GitHub verification with OAuth callback
   */
  async completeGitHubVerification(state: string, githubUsername: string): Promise<boolean> {
    const pending = this.pendingVerifications.get(state);
    if (!pending || pending.type !== 'github') {
      return false;
    }

    if (new Date() > pending.expiresAt) {
      this.pendingVerifications.delete(state);
      return false;
    }

    // GitHub verified
    this.pendingVerifications.delete(state);
    await this.recordEvidence(pending.userId, {
      type: 'github',
      value: githubUsername,
      verified: true,
    });

    return true;
  }

  /**
   * Start domain verification
   */
  async startDomainVerification(
    userId: string,
    domain: string
  ): Promise<{ method: 'dns' | 'file'; value: string }> {
    const verificationToken = createHash('sha256')
      .update(`${userId}:${domain}:${Date.now()}`)
      .digest('hex')
      .slice(0, 32);

    this.pendingVerifications.set(`domain:${userId}:${domain}`, {
      userId,
      type: 'domain',
      domain,
      token: verificationToken,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    });

    return {
      method: 'dns',
      value: `holoscript-verify=${verificationToken}`,
    };
  }

  /**
   * Check domain verification
   */
  async checkDomainVerification(userId: string, domain: string): Promise<boolean> {
    const pending = this.pendingVerifications.get(`domain:${userId}:${domain}`);
    if (!pending || pending.type !== 'domain') {
      return false;
    }

    // In production, would actually check DNS TXT record
    // For now, just mark as verified if pending exists
    const verified = true; // Would check DNS here

    if (verified) {
      this.pendingVerifications.delete(`domain:${userId}:${domain}`);
      await this.recordEvidence(userId, {
        type: 'domain',
        value: domain,
        verified: true,
      });
    }

    return verified;
  }

  /**
   * Request manual verification (for official status)
   */
  async requestManualVerification(
    userId: string,
    evidence: string
  ): Promise<{ requestId: string }> {
    const requestId = randomBytes(8).toString('hex');

    this.pendingVerifications.set(`manual:${requestId}`, {
      userId,
      type: 'manual',
      evidence,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    return { requestId };
  }

  /**
   * Approve manual verification (admin only)
   */
  async approveManualVerification(requestId: string, approvedBy: string): Promise<boolean> {
    const pending = this.pendingVerifications.get(`manual:${requestId}`);
    if (!pending || pending.type !== 'manual') {
      return false;
    }

    this.pendingVerifications.delete(`manual:${requestId}`);
    await this.recordEvidence(pending.userId, {
      type: 'manual',
      value: `Approved by ${approvedBy}`,
      verified: true,
    });

    return true;
  }

  /**
   * Record verification evidence
   */
  private async recordEvidence(userId: string, evidence: VerificationEvidence): Promise<void> {
    let record = this.verifiedEntities.get(userId);
    if (!record) {
      record = {
        userId,
        evidence: [],
        level: 'none',
        verifiedAt: undefined,
      };
      this.verifiedEntities.set(userId, record);
    }

    // Add or update evidence
    const existingIndex = record.evidence.findIndex((e) => e.type === evidence.type);
    if (existingIndex >= 0) {
      record.evidence[existingIndex] = evidence;
    } else {
      record.evidence.push(evidence);
    }

    // Update level based on evidence
    record.level = this.calculateLevel(record.evidence);
    if (record.level !== 'none') {
      record.verifiedAt = new Date();
    }
  }

  /**
   * Calculate verification level from evidence
   */
  private calculateLevel(evidence: VerificationEvidence[]): VerificationLevel {
    const verifiedTypes = new Set(evidence.filter((e) => e.verified).map((e) => e.type));

    if (
      verifiedTypes.has('email') &&
      verifiedTypes.has('github') &&
      verifiedTypes.has('domain') &&
      verifiedTypes.has('manual')
    ) {
      return 'official';
    }

    if (verifiedTypes.has('email') && verifiedTypes.has('github') && verifiedTypes.has('domain')) {
      return 'trusted';
    }

    if (verifiedTypes.has('email') && verifiedTypes.has('github')) {
      return 'verified';
    }

    if (verifiedTypes.has('email')) {
      return 'basic';
    }

    return 'none';
  }

  /**
   * Get verification status for an entity
   */
  async getVerificationStatus(userId: string): Promise<VerificationStatus> {
    const record = this.verifiedEntities.get(userId);

    if (!record) {
      return {
        verified: false,
        level: 'none',
      };
    }

    return {
      verified: record.level !== 'none',
      verifiedAt: record.verifiedAt,
      badge: VERIFICATION_BADGES[record.level],
      level: record.level,
    };
  }

  /**
   * Get all evidence for a user
   */
  async getEvidence(userId: string): Promise<VerificationEvidence[]> {
    return this.verifiedEntities.get(userId)?.evidence ?? [];
  }

  /**
   * Check if author meets minimum verification requirements
   */
  async meetsRequirements(userId: string, requiredLevel: VerificationLevel): Promise<boolean> {
    const status = await this.getVerificationStatus(userId);
    const levels: VerificationLevel[] = ['none', 'basic', 'verified', 'trusted', 'official'];
    const currentIndex = levels.indexOf(status.level ?? 'none');
    const requiredIndex = levels.indexOf(requiredLevel);
    return currentIndex >= requiredIndex;
  }

  /**
   * Verify a trait's source code for security
   */
  async verifyTraitSource(source: string): Promise<TraitSourceVerification> {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for potentially dangerous patterns
    const dangerousPatterns = [
      { pattern: /eval\s*\(/, message: 'Use of eval() detected' },
      { pattern: /Function\s*\(/, message: 'Use of Function constructor detected' },
      { pattern: /fetch\s*\(/, message: 'Network requests detected', warning: true },
      { pattern: /WebSocket/, message: 'WebSocket usage detected', warning: true },
      { pattern: /localStorage|sessionStorage/, message: 'Storage access detected', warning: true },
      { pattern: /document\.cookie/, message: 'Cookie access detected' },
      { pattern: /innerHTML\s*=/, message: 'innerHTML assignment detected', warning: true },
      { pattern: /__proto__|prototype\[/, message: 'Prototype modification detected' },
    ];

    for (const { pattern, message, warning } of dangerousPatterns) {
      if (pattern.test(source)) {
        if (warning) {
          warnings.push(message);
        } else {
          issues.push(message);
        }
      }
    }

    // Check code size
    if (source.length > 1_000_000) {
      warnings.push('Large source file (>1MB)');
    }

    // Check for minified code (suspicious)
    const avgLineLength = source.length / (source.split('\n').length || 1);
    if (avgLineLength > 500) {
      warnings.push('Possibly minified or obfuscated code');
    }

    return {
      safe: issues.length === 0,
      issues,
      warnings,
      hash: createHash('sha256').update(source).digest('hex'),
    };
  }
}

// =============================================================================
// TYPES
// =============================================================================

interface PendingVerification {
  userId: string;
  type: 'email' | 'github' | 'domain' | 'manual';
  domain?: string;
  token?: string;
  evidence?: string;
  startedAt: Date;
  expiresAt: Date;
}

interface VerificationRecord {
  userId: string;
  evidence: VerificationEvidence[];
  level: VerificationLevel;
  verifiedAt?: Date;
}

interface TraitSourceVerification {
  safe: boolean;
  issues: string[];
  warnings: string[];
  hash: string;
}

// =============================================================================
// ABUSE PREVENTION
// =============================================================================

/**
 * Rate limiter with sliding window
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60_000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  /**
   * Check if request is allowed
   */
  isAllowed(key: string): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing requests in window
    let requests = this.requests.get(key) ?? [];
    requests = requests.filter((t) => t > windowStart);

    if (requests.length >= this.maxRequests) {
      return false;
    }

    // Add this request
    requests.push(now);
    this.requests.set(key, requests);

    return true;
  }

  /**
   * Get remaining requests
   */
  getRemaining(key: string): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    const requests = (this.requests.get(key) ?? []).filter((t) => t > windowStart);
    return Math.max(0, this.maxRequests - requests.length);
  }

  /**
   * Get time until reset
   */
  getResetTime(key: string): number {
    const requests = this.requests.get(key) ?? [];
    if (requests.length === 0) {
      return 0;
    }
    const oldest = Math.min(...requests);
    return Math.max(0, oldest + this.windowMs - Date.now());
  }

  /**
   * Clear requests for a key
   */
  reset(key: string): void {
    this.requests.delete(key);
  }
}

/**
 * Spam detection for reviews and comments
 */
export class SpamDetector {
  private recentContent: Map<string, { content: string; timestamp: number }[]> = new Map();

  /**
   * Check if content is likely spam
   */
  isSpam(userId: string, content: string): { isSpam: boolean; reason?: string } {
    // Check for duplicate content
    const recent = this.recentContent.get(userId) ?? [];
    const duplicate = recent.find((r) => this.similarity(r.content, content) > 0.9);
    if (duplicate) {
      return { isSpam: true, reason: 'Duplicate content' };
    }

    // Check for too frequent posts
    const oneMinuteAgo = Date.now() - 60_000;
    const recentCount = recent.filter((r) => r.timestamp > oneMinuteAgo).length;
    if (recentCount >= 5) {
      return { isSpam: true, reason: 'Too many posts in short time' };
    }

    // Check content quality
    if (content.length < 10) {
      return { isSpam: true, reason: 'Content too short' };
    }

    // Check for spam patterns
    const spamPatterns = [
      /buy now|click here|free money|make \$\d+/i,
      /(.)\1{10,}/, // Repeated characters
      /https?:\/\/[^\s]+/g, // Multiple URLs
    ];

    for (const pattern of spamPatterns) {
      if (pattern.test(content)) {
        return { isSpam: true, reason: 'Spam pattern detected' };
      }
    }

    // Record content
    recent.push({ content, timestamp: Date.now() });
    // Keep only last 20 items
    this.recentContent.set(userId, recent.slice(-20));

    return { isSpam: false };
  }

  /**
   * Simple similarity check
   */
  private similarity(a: string, b: string): number {
    const aLower = a.toLowerCase();
    const bLower = b.toLowerCase();
    if (aLower === bLower) return 1;

    const longer = aLower.length > bLower.length ? aLower : bLower;
    const shorter = aLower.length > bLower.length ? bLower : aLower;

    if (longer.length === 0) return 1;

    let matches = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) matches++;
    }

    return matches / longer.length;
  }
}
