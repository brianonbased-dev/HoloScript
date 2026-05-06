import { CreatorMode } from '@/components/creator';
import { getSession } from '@/lib/api-auth';
import { redirect } from 'next/navigation';

export default async function CreatorPage() {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect('/auth/signin?callbackUrl=%2Fcreator');
  }

  return <CreatorMode />;
}
