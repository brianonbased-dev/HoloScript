import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { CheckoutModal } from '../components/CheckoutModal';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();
const mockConfig = createConfig({
  chains: [mainnet],
  transports: { [mainnet.id]: http() },
});

const mockTrait = {
  id: 'test-trait',
  name: 'Test Trait',
  version: '1.0.0',
  description: 'Test description',
  author: { id: 'a1', name: 'Test Author', verified: true },
  category: 'ui' as const,
  platforms: ['web' as const],
  verified: true,
  deprecated: false,
  downloads: 0,
  weeklyDownloads: 0,
  rating: 0,
  ratingCount: 0,
  updatedAt: new Date(),
};

describe('CheckoutModal', () => {
  it('does not render when isOpen is false', () => {
    const { container } = render(
      <WagmiProvider config={mockConfig}>
        <QueryClientProvider client={queryClient}>
          <CheckoutModal trait={mockTrait} isOpen={false} onClose={vi.fn()} onSuccess={vi.fn()} />
        </QueryClientProvider>
      </WagmiProvider>
    );
    expect(container.firstChild).toBeNull();
  });
});
