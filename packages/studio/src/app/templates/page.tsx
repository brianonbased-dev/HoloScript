import { redirect } from 'next/navigation';

/**
 * Redirect: /templates -> /start
 * Templates content has been folded into the /start wizard's scenario step.
 * Old route preserved for backward compatibility.
 */
export default function TemplatesRedirect() {
  redirect('/start');
}
