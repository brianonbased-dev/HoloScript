import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'HoloScript Studio',
  description: 'Create 3D scenes with AI — no coding required. 2000+ composable traits, 17 compilation targets, real-time collaboration.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_STUDIO_URL || 'https://studio.holoscript.net'),
  viewport: {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
  openGraph: {
    title: 'HoloScript Studio',
    description: 'Create 3D scenes with AI — no coding required. 2000+ composable traits, 17 compilation targets.',
    siteName: 'HoloScript Studio',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HoloScript Studio',
    description: 'Create 3D scenes with AI — no coding required.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-studio-bg text-studio-text antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
