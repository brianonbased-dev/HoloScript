import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'HoloScript Studio',
  description:
    'Point it at your data. Get a spatial experience on every device with HoloScript Studio and live MCP tools.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_STUDIO_URL || 'https://holoscript.studio'),
  openGraph: {
    title: 'HoloScript Studio',
    description:
      'Point it at your data. Get a spatial experience on every device with HoloScript Studio.',
    siteName: 'HoloScript Studio',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HoloScript Studio',
    description: 'Point it at your data. Get a spatial experience on every device.',
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
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
