/**
 * SLA Burn-Rate Alerting (P.008.04)
 *
 * Google SRE-style error-budget burn-rate tracker.
 *
 * Model:
 * - A 30-day error budget is consumed by bad events (errors, latency violations,
 *   downtime, etc.).
 * - The "burn rate" is the ratio of current consumption speed to the speed that
 *   would exactly exhaust the budget at the end of the window.
 *   burn_rate = (bad_events_in_window / window_seconds) /
 *               (total_budget / budget_window_seconds)
 *
 * - A burn rate of 1.0 means you are on track to exactly exhaust the budget.
 * - A burn rate > 1.0 means you will exhaust the budget early.
 *
 * Alerting thresholds (1-hour look-back window):
 *   warn  = 3x  (exhaust in ~10 hours if sustained)
 *   ticket = 6x  (exhaust in ~5 hours if sustained)
 *   page  = 14x (exhaust in ~2 hours if sustained)
 *
 * Also tracks a 5-minute rapid window for spike detection.
 */

export interface BurnRateWindow {
  /** Window duration in seconds */
  durationSeconds: number;
  /** Number of bad events (errors, violations, etc.) observed in the window */
  badEvents: number;
  /** Total valid events in the window (bad + good) */
  totalEvents: number;
}

export interface BurnRateBudget {
  /** Total allowed bad events over the full budget period */
  totalBudget: number;
  /** Budget period in seconds (typically 30 days = 2_592_000) */
  budgetPeriodSeconds: number;
}

export type BurnRateSeverity = 'ok' | 'warn' | 'ticket' | 'page';

export interface BurnRateResult {
  /** The calculated burn rate (1.0 = on track to exactly exhaust budget) */
  burnRate: number;
  /** How many hours of budget remain at current burn rate (Infinity if 0) */
  hoursRemaining: number;
  /** Alert severity based on 1h burn-rate thresholds */
  severity: BurnRateSeverity;
  /** Which window triggered the alert (1h or 5m) */
  triggeringWindow: '1h' | '5m';
  /** Human-readable summary */
  summary: string;
}

const WARN_THRESHOLD = 3;
const TICKET_THRESHOLD = 6;
const PAGE_THRESHOLD = 14;

const ONE_HOUR_SECONDS = 3_600;
const FIVE_MINUTES_SECONDS = 300;

/**
 * Calculate burn rate for a single window.
 *
 * burn_rate = (bad_rate_in_window) / (budget_rate)
 * where budget_rate = totalBudget / budgetPeriodSeconds
 */
export function calculateBurnRate(
  window: BurnRateWindow,
  budget: BurnRateBudget
): number {
  if (budget.totalBudget <= 0 || budget.budgetPeriodSeconds <= 0) {
    return 0;
  }
  if (window.durationSeconds <= 0) {
    return 0;
  }

  const badRateInWindow = window.badEvents / window.durationSeconds;
  const budgetRate = budget.totalBudget / budget.budgetPeriodSeconds;

  if (budgetRate === 0) {
    return 0;
  }

  return badRateInWindow / budgetRate;
}

/**
 * Determine severity from a burn rate value.
 */
export function severityFromBurnRate(burnRate: number): BurnRateSeverity {
  if (burnRate >= PAGE_THRESHOLD) return 'page';
  if (burnRate >= TICKET_THRESHOLD) return 'ticket';
  if (burnRate >= WARN_THRESHOLD) return 'warn';
  return 'ok';
}

/**
 * Estimate hours remaining before budget exhaustion at the given burn rate.
 *
 * hours = (budgetPeriodSeconds / 3600) / burn_rate
 */
export function hoursRemaining(
  burnRate: number,
  budgetPeriodSeconds: number
): number {
  if (burnRate <= 0 || !Number.isFinite(burnRate)) {
    return Infinity;
  }
  const budgetHours = budgetPeriodSeconds / ONE_HOUR_SECONDS;
  return budgetHours / burnRate;
}

/**
 * Evaluate both 1h and 5m windows and return the highest-severity result.
 *
 * The 5m window is used for rapid spike detection; if it fires a higher severity
 * than the 1h window, it wins. Otherwise the 1h window governs.
 */
export function evaluateBurnRate(
  window1h: BurnRateWindow,
  window5m: BurnRateWindow,
  budget: BurnRateBudget
): BurnRateResult {
  const burn1h = calculateBurnRate(window1h, budget);
  const burn5m = calculateBurnRate(window5m, budget);

  const sev1h = severityFromBurnRate(burn1h);
  const sev5m = severityFromBurnRate(burn5m);

  const severityRank: Record<BurnRateSeverity, number> = {
    ok: 0,
    warn: 1,
    ticket: 2,
    page: 3,
  };

  const use5m = severityRank[sev5m] > severityRank[sev1h];
  const burnRate = use5m ? burn5m : burn1h;
  const severity = use5m ? sev5m : sev1h;
  const triggeringWindow = use5m ? '5m' : '1h';

  const hrs = hoursRemaining(burnRate, budget.budgetPeriodSeconds);
  const hrsText = Number.isFinite(hrs) ? `${hrs.toFixed(1)}h` : '∞';

  const summary =
    severity === 'ok'
      ? `Burn rate ${burnRate.toFixed(2)}x — budget healthy (${hrsText} remaining).`
      : `Burn rate ${burnRate.toFixed(2)}x (${triggeringWindow} window) — ${severity.toUpperCase()} triggered. Budget exhausts in ~${hrsText} if sustained.`;

  return {
    burnRate,
    hoursRemaining: hrs,
    severity,
    triggeringWindow,
    summary,
  };
}

/**
 * Convenience: create a standard 30-day error budget.
 */
export function createMonthlyBudget(
  monthlyEvents: number,
  sloPercent: number
): BurnRateBudget {
  const allowedBadEvents = Math.round(monthlyEvents * (1 - sloPercent / 100));
  return {
    totalBudget: allowedBadEvents,
    budgetPeriodSeconds: 30 * 24 * ONE_HOUR_SECONDS,
  };
}
