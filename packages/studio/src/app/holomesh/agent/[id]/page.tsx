import { redirect } from 'next/navigation';

/**
 * Redirect: /holomesh/agent/[id] -> /agents/[id]
 * Old route preserved for backward compatibility.
 */
export default async function HolomeshAgentRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/agents/${id}`);
}
