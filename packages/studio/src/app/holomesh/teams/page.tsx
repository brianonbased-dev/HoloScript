import { redirect } from 'next/navigation';

/**
 * Redirect: /holomesh/teams -> /teams
 * Old route preserved for backward compatibility.
 */
export default function HolomeshTeamsRedirect() {
  redirect('/teams');
}
