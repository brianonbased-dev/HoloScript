import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HoloScript — describe it once, run it on every device',
  description:
    'HoloScript turns one description into a running experience across the web, mobile, XR, and agents. This site is built in HoloScript.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://holoscript.net'),
  openGraph: {
    title: 'HoloScript — describe it once, run it on every device',
    description:
      'One description compiles to web, mobile, XR, and agents. The front door is itself a HoloScript composition.',
    siteName: 'HoloScript',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'HoloScript — describe it once, run it on every device',
    description: 'One description compiles to web, mobile, XR, and agents.',
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
