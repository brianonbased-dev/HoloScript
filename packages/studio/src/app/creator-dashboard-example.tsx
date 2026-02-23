'use client';

/**
 * Example integration of Film3D Creator Dashboard
 * This file demonstrates how to use the CreatorDashboard component in a Next.js page
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CreatorDashboard } from '../components/CreatorDashboard';
import { useState } from 'react';

// Create a client instance (in a real app, this should be at the app root level)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function CreatorDashboardPage() {
  // In production, get this from wallet connection or auth
  const [walletAddress] = useState('0x1234567890abcdef');

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-gray-900">
        {/* Optional: Add a header or navigation here */}
        <CreatorDashboard
          address={walletAddress}
          refetchInterval={30000} // Refresh every 30 seconds
        />
      </div>
    </QueryClientProvider>
  );
}

/**
 * Alternative: App-level setup with React Query Provider
 *
 * In your app/layout.tsx or _app.tsx:
 *
 * import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
 *
 * const queryClient = new QueryClient();
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html lang="en">
 *       <body>
 *         <QueryClientProvider client={queryClient}>
 *           {children}
 *         </QueryClientProvider>
 *       </body>
 *     </html>
 *   );
 * }
 *
 * Then in your page:
 *
 * import { CreatorDashboard } from '@/components/CreatorDashboard';
 *
 * export default function DashboardPage() {
 *   const address = useWallet(); // Your wallet connection hook
 *   return <CreatorDashboard address={address} />;
 * }
 */
