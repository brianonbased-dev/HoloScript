import { redirect } from 'next/navigation';

/**
 * Redirect: /holomesh/team/[id]/board -> /teams/[id]/board
 * Old route preserved for backward compatibility.
 */
export default async function HolomeshTeamBoardRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/teams/${id}/board`);
}
