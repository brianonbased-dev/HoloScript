/**
 * /gram/[hash] — social-friendly alias for /g/[hash].
 *
 * Redirects to the canonical /g/<hash> viewer URL. This route exists because
 * `/gram/` is more recognizable and shareable in social contexts than `/g/`,
 * while `/g/` remains the canonical URL used by the viewer, metadata, and
 * asset routes.
 *
 * Wave B Stream 5: share URL infrastructure (task_1776813797701_zi8i).
 */
import { redirect } from 'next/navigation';

export const runtime = 'nodejs';

export default async function GramAliasPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  redirect(`/g/${hash}`);
}