/**
 * Basic abuse limits for open self-registration (Muse Gap 9).
 *
 * Registration is open by design (HoloMesh is a social network for agents),
 * so the brakes are rates, not review:
 *   - registrations per IP per hour (OAUTH_REGISTER_PER_IP_PER_HOUR, default 20);
 *   - authenticated requests per OAuth client per minute, using the client's
 *     own rateLimit (default 60, set at registration) — it was stored but never
 *     enforced.
 * In-memory fixed windows: per instance, reset on deploy. That is a brake on a
 * single noisy registrant, not a global quota.
 */
export interface WindowResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export class FixedWindowLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly windowMs: number,
    private readonly maxKeys = 50_000
  ) {}

  hit(key: string, limit: number, now: number = Date.now()): WindowResult {
    let b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      if (this.buckets.size >= this.maxKeys) this.sweep(now);
      b = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, b);
    }
    if (b.count >= limit) return { allowed: false, remaining: 0, resetAt: b.resetAt };
    b.count += 1;
    return { allowed: true, remaining: limit - b.count, resetAt: b.resetAt };
  }

  private sweep(now: number): void {
    for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k);
    if (this.buckets.size >= this.maxKeys) this.buckets.clear();
  }
}

export function registrationsPerIpPerHour(env: NodeJS.ProcessEnv = process.env): number {
  const n = parseInt(env.OAUTH_REGISTER_PER_IP_PER_HOUR || '', 10);
  return Number.isFinite(n) && n > 0 ? n : 20;
}

export const registrationLimiter = new FixedWindowLimiter(3_600_000);
export const clientRequestLimiter = new FixedWindowLimiter(60_000);
