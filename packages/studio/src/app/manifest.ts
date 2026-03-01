import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'HoloScript Studio',
    short_name: 'HoloScript',
    description: 'Create 3D scenes with AI — no coding required',
    start_url: '/',
    display: 'standalone',
    background_color: '#0d0d14',
    theme_color: '#3b82f6',
    orientation: 'any',
    categories: ['design', 'developer tools', 'creativity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    screenshots: [
      {
        src: '/screenshot-wide.png',
        sizes: '1280x720',
        type: 'image/png',
        // @ts-expect-error -- Next.js types don't include form_factor yet
        form_factor: 'wide',
        label: 'HoloScript Studio editor workspace',
      },
    ],
  };
}
