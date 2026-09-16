import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { findIndustryVertical, INDUSTRY_VERTICAL_SLUGS } from '@/lib/industry-verticals';

import { IndustryPortal } from './IndustryPortal';

/**
 * `/industry/[vertical]` — the industry portal, at an address of its own.
 *
 * This page used to live at `src/app/(industry)/[vertical]/page.tsx`. Route
 * group parentheses add no URL segment, so it registered `/[vertical]` at the
 * ROOT and answered every unmatched single-segment path with HTTP 200 — see
 * `@/lib/industry-verticals` for the census and the reasoning behind the move.
 *
 * This is a server component for one reason: it can refuse. A slug that names
 * no declared vertical calls `notFound()`, which renders `app/not-found.tsx`
 * with a real 404 status. The portal body stays a client component
 * (`IndustryPortal`) because it drives the renderer and the resizable panels.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ vertical: string }>;
}): Promise<Metadata> {
  const { vertical: slug } = await params;
  const vertical = findIndustryVertical(slug);

  if (!vertical) {
    return { title: 'Page not found — HoloScript Studio' };
  }

  return {
    title: `${vertical.title} — HoloScript Studio`,
    description: vertical.description,
  };
}

/**
 * Pre-declare the known slugs so Next knows these addresses exist. Rendering
 * stays dynamic; this is the list, not a build-time freeze.
 */
export function generateStaticParams(): Array<{ vertical: string }> {
  return INDUSTRY_VERTICAL_SLUGS.map((vertical) => ({ vertical }));
}

export default async function IndustryPortalPage({
  params,
}: {
  params: Promise<{ vertical: string }>;
}) {
  const { vertical: slug } = await params;
  const vertical = findIndustryVertical(slug);

  // A vertical we do not serve is not an address. Say so, with a 404.
  if (!vertical) notFound();

  return <IndustryPortal vertical={vertical} />;
}
