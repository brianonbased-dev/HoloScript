import { redirect } from 'next/navigation';

/**
 * Redirect: /holomesh/onboard -> /agents/me
 * Onboarding is folded into the agent profile page.
 * Old route preserved for backward compatibility.
 */
export default function HolomeshOnboardRedirect() {
  redirect('/agents/me');
}
