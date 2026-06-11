'use client';

/**
 * /absorb — redirected to /create?intake=repo
 *
 * The Absorb intake flow (unauthenticated landing + project creation) is now
 * served from /create with the intake=repo search param.
 *
 * The authenticated Absorb dashboard (credits, projects, agents, daemon-ops,
 * tools) has been preserved in AbsorbDashboard — see handoff note: this
 * content needs a permanent home in /settings or /projects once the Settings
 * tab shell (integrations/credits) is in place (A4 phase next steps).
 * The components in ./components/ are NOT deleted.
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
