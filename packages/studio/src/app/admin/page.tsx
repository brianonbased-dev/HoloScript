import { redirect } from 'next/navigation';

/**
 * /admin → /operations (Admin tab)
 *
 * The admin console is now hosted inside /operations. This redirect
 * preserves any external links to /admin and routes them to the
 * consolidated founder operate surface.
 */
export default function AdminPage() {
  redirect('/operations');
}
