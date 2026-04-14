'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { getDefaultConfig, RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit';
import { createConfig, http, WagmiProvider } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import '@rainbow-me/rainbowkit/styles.css';

const fallbackConfig = createConfig({
  chains: [base, baseSepolia],
  ssr: true,
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ReturnType<typeof getDefaultConfig> | typeof fallbackConfig>(
    fallbackConfig
  );
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    setConfig(
      getDefaultConfig({
        appName: 'HoloScript Marketplace',
        projectId: 'holoscript-marketplace-dev-id',
        chains: [base, baseSepolia],
        ssr: false,
      })
    );
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#10b981',
            accentColorForeground: 'white',
            borderRadius: 'medium',
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
