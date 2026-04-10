import { redirect } from 'next/navigation';

/**
 * Redirect: /holomesh/team/[id] -> /teams/[id]
 * Old route preserved for backward compatibility.
 */
export default async function HolomeshTeamRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/teams/${id}`);
}
