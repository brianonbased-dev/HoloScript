import { redirect } from 'next/navigation';

/**
 * Redirect: /holomesh/contribute -> /agents/me?tab=contribute
 * Old route preserved for backward compatibility.
 */
export default function HolomeshContributeRedirect() {
  redirect('/agents/me?tab=contribute');
}
