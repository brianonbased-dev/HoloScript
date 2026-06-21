import type { AgentGenesisPlan } from './agentGenesis';
import { registerNeedsKeyTrait, type SecretResolver } from '@holoscript/secrets-broker';

/**
 * Fleet Autospawn — the wired path for multi-agent autospawn (D.053 gap #4).
 *
 * buildAgentGenesisPlan produces a DECLARATIVE plan: each agent carries an
 * `autospawn` flag, but nothing acted on it — the flag was written to
 * agent-genesis.json / fleet/autospawn.yml and only health-checked for file
 * presence. This module executes the plan: it registers every autospawn:true
 * agent so the declared fleet actually comes up.
 *
 * The per-soul companion (the daimōn face) is spawned separately as a
 * ConversationDaemon (provisionUser.startDaemon), so it is excluded here by
 * default to avoid a double-spawn — this module brings up the resident ops crew
 * (holoheal, secret-custodian, fleet-auditor, and the signal-gated agents).
 *
 * The registrar is injected so the executor stays pure and unit-testable; the
 * provisioning pipeline supplies the orchestrator-backed implementation.
 */

export interface FleetAgentRegistration {
  /** Stable registration name: `${workspaceId}:${missionProfile}` */
  name: string;
  type: 'daemon';
  missionProfile: string;
  /** Mission skills surfaced as capabilities for discovery/routing */
  capabilities: string[];
  /** The soul this fleet is scoped to (HoloMesh agentId, else workspaceId) */
  ownerId: string;
  metadata: Record<string, unknown>;
}

export type FleetAgentRegistrar = (agent: FleetAgentRegistration) => Promise<void>;

interface NeedsKeyTraitRegistrar {
  registerTrait(name: string, handler: unknown): void;
}

export interface FleetNeedsKeyRuntimeBinding {
  registrar: NeedsKeyTraitRegistrar;
  resolver: SecretResolver;
}

export interface AutospawnedAgentRecord {
  agentId: string;
  missionProfile: string;
  priority: number;
}

export interface FleetAutospawnResult {
  /** Agents registered this run, highest priority first */
  spawned: AutospawnedAgentRecord[];
  /** Mission profiles present in the plan but NOT autospawned (autospawn:false) */
  deferred: string[];
  /** Mission profiles intentionally excluded (e.g. companion, spawned elsewhere) */
  excluded: string[];
}

export interface AutospawnGenesisFleetInput {
  plan: AgentGenesisPlan;
  ownerId: string;
  workspaceId: string;
  repoUrl?: string;
  register: FleetAgentRegistrar;
  /** Optional runtime boot hook for fleet seats that execute HoloScript traits. */
  needsKeyRuntime?: FleetNeedsKeyRuntimeBinding;
  /** Missions handled outside the fleet path. Default: the companion face. */
  excludeMissions?: string[];
}

/**
 * Execute the autospawn set of an agent-genesis plan. Registers every
 * autospawn:true agent (except excluded missions) in descending priority order.
 * Returns a report of what came up, what was deferred (autospawn:false), and
 * what was excluded.
 */
export async function autospawnGenesisFleet(
  input: AutospawnGenesisFleetInput
): Promise<FleetAutospawnResult> {
  const excluded = new Set(input.excludeMissions ?? ['companion']);
  const needsKeyOwnerId = input.ownerId.trim() || null;

  if (input.needsKeyRuntime) {
    registerNeedsKeyTrait(input.needsKeyRuntime.registrar, {
      resolver: input.needsKeyRuntime.resolver,
      authenticatedOwnerId: needsKeyOwnerId,
    });
  }

  const targets = input.plan.agents
    .filter((agent) => agent.autospawn && !excluded.has(agent.missionProfile))
    .sort((a, b) => b.priority - a.priority);

  const spawned: AutospawnedAgentRecord[] = [];
  for (const agent of targets) {
    const name = `${input.workspaceId}:${agent.missionProfile}`;
    await input.register({
      name,
      type: 'daemon',
      missionProfile: agent.missionProfile,
      capabilities: agent.daemonAgent.skills,
      ownerId: input.ownerId,
      metadata: {
        workspaceId: input.workspaceId,
        repoUrl: input.repoUrl,
        priority: agent.priority,
        authorityRefs: agent.daemonAgent.authorityRefs,
        schedules: agent.daemonAgent.schedules,
        autospawn: true,
        needsKeyTrait: {
          name: 'needs_key',
          ownerId: needsKeyOwnerId,
          source: 'fleet-seat-initialization',
        },
      },
    });
    spawned.push({
      agentId: name,
      missionProfile: agent.missionProfile,
      priority: agent.priority,
    });
  }

  const deferred = input.plan.agents
    .filter((agent) => !agent.autospawn)
    .map((agent) => agent.missionProfile);

  return { spawned, deferred, excluded: Array.from(excluded) };
}
