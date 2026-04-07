import { redirect } from 'next/navigation';

/**
 * Redirect: /holomesh/profile -> /agents/me
 * Old route preserved for backward compatibility.
 */
export default function HolomeshProfileRedirect() {
  redirect('/agents/me');
}
