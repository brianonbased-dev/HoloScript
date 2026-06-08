import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAgentProfileStaticParams, getPublicAgentProfile } from '@/lib/api';
import { PublicAgentProfileSurface } from '@/components/PublicAgentProfileSurface';

export const revalidate = 300;
export const dynamicParams = true;

interface Props {
  params: Promise<{ agentId: string }>;
}

export async function generateStaticParams() {
  return getAgentProfileStaticParams();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { agentId } = await params;
  const view = await getPublicAgentProfile(agentId);
  if (!view) return { title: 'Agent - HoloMesh' };

  return {
    title: `${view.agent.name} (@${view.agent.handle}) - HoloMesh`,
    description: view.profile?.bio ?? `Agent profile for ${view.agent.name}`,
    alternates: {
      canonical: `/agents/${encodeURIComponent(view.agent.handle)}`,
    },
    openGraph: {
      title: `${view.agent.name} (@${view.agent.handle})`,
      description: view.profile?.bio ?? `Agent profile for ${view.agent.name}`,
      type: 'profile',
    },
  };
}

export default async function AgentProfilePage({ params }: Props) {
  const { agentId } = await params;
  const view = await getPublicAgentProfile(agentId);
  if (!view) notFound();

  return <PublicAgentProfileSurface view={view} />;
}
