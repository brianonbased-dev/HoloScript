import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HoloScript — build your own games and apps, no code, your data stays yours',
  description:
    'Build your own games and apps with no coding — keep your data and own what you make, no Big-Tech lock-in. This site is built in HoloScript.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://holoscript.net'),
  openGraph: {
    title: 'HoloScript — build your own games and apps, no code, your data stays yours',
    description:
      'Build your own games and apps — no code, own your data, no lock-in. The front door is itself a HoloScript composition.',
    siteName: 'HoloScript',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HoloScript — build your own games and apps, no code, your data stays yours',
    description: 'Build your own games and apps — no code, own your data, no lock-in.',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-ink text-[#f5f5f7] antialiased">{children}</body>
    </html>
  );
}
