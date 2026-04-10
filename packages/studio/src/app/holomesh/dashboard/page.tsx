import { redirect } from 'next/navigation';

/**
 * Redirect: /holomesh/dashboard -> /agents/me?tab=dashboard
 * Old route preserved for backward compatibility.
 */
export default function HolomeshDashboardRedirect() {
  redirect('/agents/me?tab=dashboard');
}
