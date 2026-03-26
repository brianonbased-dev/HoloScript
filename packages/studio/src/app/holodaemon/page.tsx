import { redirect } from 'next/navigation';

/**
 * HoloDaemon — Deprecated standalone route.
 * The Daemon WebGL control surface has been merged natively into the Absorb Workspace.
 * Automatically redirecting to /absorb to enforce dogfooding.
 */
export default function HoloDaemonRedirect() {
  redirect('/absorb');
}
