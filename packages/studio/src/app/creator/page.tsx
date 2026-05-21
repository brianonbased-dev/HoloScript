import { CreatorMode } from '@/components/creator';
import { getSession } from '@/lib/api-auth';
import { SignInView } from '@/components/auth/SignInView';

async function getSessionWithFirstViewportTimeout() {
  return await Promise.race([
    getSession(),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), 1500);
    }),
  ]);
}

export default async function CreatorPage() {
  const session = await getSessionWithFirstViewportTimeout();
  if (!session?.user?.id) {
    return <SignInView />;
  }

  return <CreatorMode />;
}
