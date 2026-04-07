import { redirect } from 'next/navigation';

/**
 * HoloDaemon — Deprecated standalone route.
 * Daemon monitoring is now part of the HoloClaw tab inside /teams/[id].
 * Automatically redirecting to /teams.
 */
export default function HoloDaemonRedirect() {
  redirect('/teams');
}
