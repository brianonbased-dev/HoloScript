import { redirect } from 'next/navigation';

/**
 * /absorb/admin → /operations (Absorb tab)
 *
 * The absorb admin panel is now hosted inside /operations. This redirect
 * preserves any external links and routes them to the consolidated
 * founder operate surface.
 */
export default function AbsorbAdminPage() {
  redirect('/operations');
}
