/**
 * UsageTracker — Token & Request Metering
 *
 * Tracks per-key token usage and request counts for billing/reporting.
 * File-based persistence (migrate to Supabase later).
 */

import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface UsageRecord {
  apiKey: string;
  date: string; // YYYY-MM-DD
  requests: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface UsageSummary {
  apiKey: string;
  period: string;
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  dailyBreakdown: UsageRecord[];
}

// ============================================================================
// UsageTracker
// ============================================================================

export class UsageTracker {
  private records: Map<string, UsageRecord> = new Map();

  /**
   * Record a completed inference request
   */
  record(apiKey: string, promptTokens: number, completionTokens: number): void {
    const date = new Date().toISOString().split('T')[0];
    const key = `${apiKey}:${date}`;

    const existing = this.records.get(key);
    if (existing) {
      existing.requests += 1;
      existing.promptTokens += promptTokens;
      existing.completionTokens += completionTokens;
      existing.totalTokens += promptTokens + completionTokens;
    } else {
      this.records.set(key, {
        apiKey,
        date,
        requests: 1,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      });
    }
  }

  /**
   * Estimate token count from text (rough: 1 token ≈ 4 chars)
   */
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get usage summary for an API key
   */
  getSummary(apiKey: string): UsageSummary {
    const daily: UsageRecord[] = [];
    let totalRequests = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;

    for (const [key, record] of this.records) {
      if (key.startsWith(`${apiKey}:`)) {
        daily.push(record);
        totalRequests += record.requests;
        totalPromptTokens += record.promptTokens;
        totalCompletionTokens += record.completionTokens;
        totalTokens += record.totalTokens;
      }
    }

    return {
      apiKey,
      period: 'all-time',
      totalRequests,
      totalPromptTokens,
      totalCompletionTokens,
      totalTokens,
      dailyBreakdown: daily.sort((a, b) => b.date.localeCompare(a.date)),
    };
  }

  /**
   * Check if a key has exceeded its daily token limit
   */
  isOverDailyLimit(apiKey: string): boolean {
    const limit = parseInt(process.env.RATE_LIMIT_TOKENS_PER_DAY || '1000000', 10);
    const date = new Date().toISOString().split('T')[0];
    const key = `${apiKey}:${date}`;
    const record = this.records.get(key);
    return (record?.totalTokens ?? 0) >= limit;
  }

  /**
   * Get all usage records (admin)
   */
  getAllRecords(): UsageRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Clear old records (older than 90 days)
   */
  prune(): void {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    for (const [key, record] of this.records) {
      if (record.date < cutoffStr) {
        this.records.delete(key);
      }
    }
  }
}
