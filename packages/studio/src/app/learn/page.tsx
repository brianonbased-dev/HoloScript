import { redirect } from 'next/navigation';

// GAP-1.4: /learn redirects to the Academy app.
// When Academy is integrated into Studio, this becomes a real page.
const ACADEMY_URL = process.env.NEXT_PUBLIC_ACADEMY_URL || 'http://localhost:3102';

export default function LearnPage() {
  redirect(`${ACADEMY_URL}/learn`);
}
