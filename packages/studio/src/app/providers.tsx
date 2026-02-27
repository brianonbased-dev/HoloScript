'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
<<<<<<< HEAD
import { useGlobalHotkeys } from '../hooks/useGlobalHotkeys';

export function Providers({ children }: { children: ReactNode }) {
  useGlobalHotkeys();
  
=======

export function Providers({ children }: { children: ReactNode }) {
>>>>>>> feature/docs-examples-misc
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
