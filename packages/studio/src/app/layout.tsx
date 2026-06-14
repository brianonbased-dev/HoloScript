import type { Metadata } from 'next';
import { Providers } from './providers';
import { AppShell } from '@/components/layout/AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: 'HoloScript Studio',
  description:
    'Build your own game or app with no coding — keep your data and own what you make. HoloScript Studio, with live MCP tools.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_STUDIO_URL || 'https://holoscript.studio'),
  openGraph: {
    title: 'HoloScript Studio',
    description:
      'Build your own game or app with no coding — keep your data and own what you make. HoloScript Studio.',
    siteName: 'HoloScript Studio',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HoloScript Studio',
    description: 'Build your own game or app — no code, own your data, no lock-in.',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-studio-bg text-studio-text antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
