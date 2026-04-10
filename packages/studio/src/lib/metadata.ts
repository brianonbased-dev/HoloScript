import type { Metadata } from 'next';

const SITE_NAME = 'HoloScript Studio';
const BASE_URL = process.env.NEXT_PUBLIC_STUDIO_URL || 'https://studio.holoscript.net';

export function studioMetadata(title: string, description: string): Metadata {
  const fullTitle = `${title} — ${SITE_NAME}`;
  return {
    title: fullTitle,
    description,
    openGraph: {
      title: fullTitle,
      description,
      siteName: SITE_NAME,
      type: 'website',
      url: BASE_URL,
    },
    twitter: {
      card: 'summary_large_image',
      title: fullTitle,
      description,
    },
  };
}
