import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'HoloScript Studio',
  description: 'Create 3D scenes with AI — no coding required',
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
