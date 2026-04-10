/**
 * Quota Manager
 *
 * Production-grade usage quota tracking with daily and monthly periods.
 * Supports per-key usage tracking with automatic period rotation.
 *
 * @version 9.4.0
 * @Sprint Sprint 9: Rate Limiting & Quotas
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for quota limits.
 * Use -1 for unlimited quotas.
 */
export interface QuotaConfig {
  daily: {
    parseOperations: number;
    compileOperations: number;
    generateOperations: number;
  };
  monthly: {
    totalBytes: number;
    apiCalls: number;
  };
}

/**
 * Supported quota operation types.
 */
export type QuotaOperation =
  | 'parseOperations'
  | 'compileOperations'
  | 'generateOperations'
  | 'totalBytes'
  | 'apiCalls';

/**
 * Result of a quota check.
 */
export interface QuotaResult {
  /** Whether the operation is within quota */
  allowed: boolean;
  /** Current usage for the operation */
  currentUsage: number;
  /** The configured limit (-1 = unlimited) */
  limit: number;
  /** Remaining quota (Infinity if unlimited) */
  remaining: number;
  /** When the quota period resets (ISO string) */
  resetsAt: string;
}

/**
 * Full usage snapshot for a key.
 */
export interface UsageSnapshot {
  key: string;
  daily: {
    parseOperations: number;
    compileOperations: number;
    generateOperations: number;
    periodStart: string;
  };
  monthly: {
    totalBytes: number;
    apiCalls: number;
    periodStart: string;
  };
}

// =============================================================================
// INTERNAL USAGE STATE
// =============================================================================

interface DailyUsage {
  parseOperations: number;
  compileOperations: number;
  generateOperations: number;
  periodStart: number; // Timestamp of the start of the current day (UTC midnight)
}

interface MonthlyUsage {
  totalBytes: number;
  apiCalls: number;
  periodStart: number; // Timestamp of the start of the current month (UTC 1st midnight)
}

interface KeyUsage {
  daily: DailyUsage;
  monthly: MonthlyUsage;
}

// =============================================================================
// QUOTA MANAGER
// =============================================================================

/**
 * Manages usage quotas per key with automatic daily/monthly period rotation.
 *
 * Daily quotas cover: parseOperations, compileOperations, generateOperations
 * Monthly quotas cover: totalBytes, apiCalls
 *
 * A limit of -1 means unlimited.
 */
export class QuotaManager {
  private readonly config: QuotaConfig;
  private readonly usage: Map<string, KeyUsage> = new Map();

  constructor(config: QuotaConfig) {
    this.config = structuredClone(config);
  }

  /**
   * Get the configuration for this quota manager.
   */
  getConfig(): Readonly<QuotaConfig> {
    return structuredClone(this.config);
  }

  /**
   * Check whether an operation is within quota for a key.
   * Does NOT record any usage.
   *
   * @param key - The quota key (e.g., user ID, API key)
   * @param operation - The operation type to check
   * @param count - Number of units to check (default: 1)
   */
  checkQuota(key: string, operation: QuotaOperation, count: number = 1): QuotaResult {
    const keyUsage = this.getOrCreateUsage(key);
    this.rotatePeriods(keyUsage);

    const { currentUsage, limit, period } = this.getOperationInfo(keyUsage, operation);
    const isUnlimited = limit === -1;
    const allowed = isUnlimited || currentUsage + count <= limit;
    const remaining = isUnlimited ? Infinity : Math.max(0, limit - currentUsage);
    const resetsAt = this.getResetTime(keyUsage, period);

    return {
      allowed,
      currentUsage,
      limit,
      remaining,
      resetsAt,
    };
  }

  /**
   * Record usage for an operation. Returns the quota result after recording.
   * If the usage would exceed the quota, it is NOT recorded and the result shows allowed: false.
   *
   * @param key - The quota key
   * @param operation - The operation type
   * @param count - Number of units to record (default: 1)
   */
  recordUsage(key: string, operation: QuotaOperation, count: number = 1): QuotaResult {
    const keyUsage = this.getOrCreateUsage(key);
    this.rotatePeriods(keyUsage);

    const { currentUsage, limit, period } = this.getOperationInfo(keyUsage, operation);
    const isUnlimited = limit === -1;
    const allowed = isUnlimited || currentUsage + count <= limit;

    if (allowed) {
      this.addUsage(keyUsage, operation, count);
    }

    const newUsage = allowed ? currentUsage + count : currentUsage;
    const remaining = isUnlimited ? Infinity : Math.max(0, limit - newUsage);
    const resetsAt = this.getResetTime(keyUsage, period);

    return {
      allowed,
      currentUsage: newUsage,
      limit,
      remaining,
      resetsAt,
    };
  }

  /**
   * Get the full usage snapshot for a key.
   */
  getUsage(key: string): UsageSnapshot {
    const keyUsage = this.usage.get(key);
    if (!keyUsage) {
      return {
        key,
        daily: {
          parseOperations: 0,
          compileOperations: 0,
          generateOperations: 0,
          periodStart: new Date(QuotaManager.getDayStart(Date.now())).toISOString(),
        },
        monthly: {
          totalBytes: 0,
          apiCalls: 0,
          periodStart: new Date(QuotaManager.getMonthStart(Date.now())).toISOString(),
        },
      };
    }

    this.rotatePeriods(keyUsage);

    return {
      key,
      daily: {
        parseOperations: keyUsage.daily.parseOperations,
        compileOperations: keyUsage.daily.compileOperations,
        generateOperations: keyUsage.daily.generateOperations,
        periodStart: new Date(keyUsage.daily.periodStart).toISOString(),
      },
      monthly: {
        totalBytes: keyUsage.monthly.totalBytes,
        apiCalls: keyUsage.monthly.apiCalls,
        periodStart: new Date(keyUsage.monthly.periodStart).toISOString(),
      },
    };
  }

  /**
   * Reset all daily quotas for all keys.
   */
  resetDaily(): void {
    for (const keyUsage of this.usage.values()) {
      keyUsage.daily.parseOperations = 0;
      keyUsage.daily.compileOperations = 0;
      keyUsage.daily.generateOperations = 0;
      keyUsage.daily.periodStart = QuotaManager.getDayStart(Date.now());
    }
  }

  /**
   * Reset all monthly quotas for all keys.
   */
  resetMonthly(): void {
    for (const keyUsage of this.usage.values()) {
      keyUsage.monthly.totalBytes = 0;
      keyUsage.monthly.apiCalls = 0;
      keyUsage.monthly.periodStart = QuotaManager.getMonthStart(Date.now());
    }
  }

  /**
   * Remove all tracked usage.
   */
  resetAll(): void {
    this.usage.clear();
  }

  /**
   * Remove usage for a specific key.
   */
  resetKey(key: string): void {
    this.usage.delete(key);
  }

  /**
   * Get the number of tracked keys.
   */
  get size(): number {
    return this.usage.size;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private getOrCreateUsage(key: string): KeyUsage {
    let keyUsage = this.usage.get(key);
    if (!keyUsage) {
      const now = Date.now();
      keyUsage = {
        daily: {
          parseOperations: 0,
          compileOperations: 0,
          generateOperations: 0,
          periodStart: QuotaManager.getDayStart(now),
        },
        monthly: {
          totalBytes: 0,
          apiCalls: 0,
          periodStart: QuotaManager.getMonthStart(now),
        },
      };
      this.usage.set(key, keyUsage);
    }
    return keyUsage;
  }

  private rotatePeriods(keyUsage: KeyUsage): void {
    const now = Date.now();
    const currentDayStart = QuotaManager.getDayStart(now);
    const currentMonthStart = QuotaManager.getMonthStart(now);

    // Rotate daily period if the day has changed
    if (keyUsage.daily.periodStart < currentDayStart) {
      keyUsage.daily.parseOperations = 0;
      keyUsage.daily.compileOperations = 0;
      keyUsage.daily.generateOperations = 0;
      keyUsage.daily.periodStart = currentDayStart;
    }

    // Rotate monthly period if the month has changed
    if (keyUsage.monthly.periodStart < currentMonthStart) {
      keyUsage.monthly.totalBytes = 0;
      keyUsage.monthly.apiCalls = 0;
      keyUsage.monthly.periodStart = currentMonthStart;
    }
  }

  private getOperationInfo(
    keyUsage: KeyUsage,
    operation: QuotaOperation
  ): { currentUsage: number; limit: number; period: 'daily' | 'monthly' } {
    switch (operation) {
      case 'parseOperations':
        return {
          currentUsage: keyUsage.daily.parseOperations,
          limit: this.config.daily.parseOperations,
          period: 'daily',
        };
      case 'compileOperations':
        return {
          currentUsage: keyUsage.daily.compileOperations,
          limit: this.config.daily.compileOperations,
          period: 'daily',
        };
      case 'generateOperations':
        return {
          currentUsage: keyUsage.daily.generateOperations,
          limit: this.config.daily.generateOperations,
          period: 'daily',
        };
      case 'totalBytes':
        return {
          currentUsage: keyUsage.monthly.totalBytes,
          limit: this.config.monthly.totalBytes,
          period: 'monthly',
        };
      case 'apiCalls':
        return {
          currentUsage: keyUsage.monthly.apiCalls,
          limit: this.config.monthly.apiCalls,
          period: 'monthly',
        };
      default:
        throw new Error(`Unknown quota operation: ${operation}`);
    }
  }

  private addUsage(keyUsage: KeyUsage, operation: QuotaOperation, count: number): void {
    switch (operation) {
      case 'parseOperations':
        keyUsage.daily.parseOperations += count;
        break;
      case 'compileOperations':
        keyUsage.daily.compileOperations += count;
        break;
      case 'generateOperations':
        keyUsage.daily.generateOperations += count;
        break;
      case 'totalBytes':
        keyUsage.monthly.totalBytes += count;
        break;
      case 'apiCalls':
        keyUsage.monthly.apiCalls += count;
        break;
    }
  }

  private getResetTime(keyUsage: KeyUsage, period: 'daily' | 'monthly'): string {
    if (period === 'daily') {
      return new Date(keyUsage.daily.periodStart + 86_400_000).toISOString();
    }
    // Monthly: get next month's start
    const date = new Date(keyUsage.monthly.periodStart);
    date.setUTCMonth(date.getUTCMonth() + 1);
    return date.toISOString();
  }

  /**
   * Get the UTC midnight timestamp for the start of the day containing `timestamp`.
   */
  static getDayStart(timestamp: number): number {
    const date = new Date(timestamp);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }

  /**
   * Get the UTC midnight timestamp for the 1st of the month containing `timestamp`.
   */
  static getMonthStart(timestamp: number): number {
    const date = new Date(timestamp);
    date.setUTCDate(1);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime();
  }
}
