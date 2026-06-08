import { NextResponse } from 'next/server';
import { HOLO_DAEMON_MISSIONS } from '@/lib/daemon/agentProfiles';

/**
 * GET /api/agents/fleet/schedules
 *
 * Returns the declared mission profiles with their schedule cadences so
 * Studio can display them in FleetPanel without importing server-only modules
 * into a client component.
 */
export async function GET() {
  const schedules = HOLO_DAEMON_MISSIONS.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    skills: m.defaultSkills,
    schedules: m.schedules,
  }));
  return NextResponse.json({ schedules });
}
