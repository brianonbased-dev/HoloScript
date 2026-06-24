'use client';

/**
 * /absorb — redirected to /create?intake=repo
 *
 * The Absorb intake flow (unauthenticated landing + project creation) is now
 * served from /create with the intake=repo search param.
 *
 * Dashboard tab disposition (A4 re-homing, 2026-06-24):
 *
 *   credits     → /settings?tab=credits  (CreditBalanceCard + PricingTab added
 *                  as 4th tab in SettingsView — billing belongs in Settings)
 *
 *   projects    → /create?intake=repo   (this redirect covers it)
 *
 *   agents      → RETIRED: overlaps /workspace/agents which is a real,
 *                  functional page managing agent manifests
 *
 *   daemon-ops  → RETIRED: workbench-style ops with no distinct re-home;
 *                  D.101 freeze prohibits new peripheral routes
 *
 *   tools       → RETIRED: absorb-project-scoped (query/render/diff); no
 *                  parent host without the absorb dashboard
 *
 * The components in ./components/ are kept for /settings?tab=credits reuse.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AbsorbPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/create?intake=repo');
  }, [router]);

  return null;
}
