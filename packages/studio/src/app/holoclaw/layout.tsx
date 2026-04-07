import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HoloClaw — Redirecting to Teams',
  description: 'HoloClaw is now integrated into the Teams workspace',
};

export default function HoloclawLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
