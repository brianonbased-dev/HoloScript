import { redirect } from 'next/navigation';

/**
 * HoloClaw — Deprecated standalone route.
 * The HoloClaw execution engine has been integrated as a tab inside /teams/[id].
 * Automatically redirecting to /teams.
 */
export default function HoloClawRedirect() {
  redirect('/teams');
}
