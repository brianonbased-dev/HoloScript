import { ReactNode } from 'react';

// Require dynamic execution so the /store route is not statically skipped during SSG
export const dynamic = 'force-dynamic';

export default function StoreLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
