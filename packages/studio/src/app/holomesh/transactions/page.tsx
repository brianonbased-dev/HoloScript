import { redirect } from 'next/navigation';

/**
 * Redirect: /holomesh/transactions -> /agents/me?tab=transactions
 * Old route preserved for backward compatibility.
 */
export default function HolomeshTransactionsRedirect() {
  redirect('/agents/me?tab=transactions');
}
