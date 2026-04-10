import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'HoloScript Trait Marketplace',
  description: 'Discover, share, and install HoloScript traits for your 3D experiences',
  keywords: ['holoscript', 'traits', 'marketplace', '3D', 'XR', 'WebXR'],
  authors: [{ name: 'HoloScript Team' }],
  openGraph: {
    title: 'HoloScript Trait Marketplace',
    description: 'Discover, share, and install HoloScript traits for your 3D experiences',
    type: 'website',
    locale: 'en_US',
    siteName: 'HoloScript Marketplace',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  );
}
