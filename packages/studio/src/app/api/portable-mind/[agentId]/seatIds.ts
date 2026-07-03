import { createHash } from 'node:crypto';
import { homedir, hostname } from 'node:os';

export function seatIdCandidatesForAgent(
  agentId: string,
  env: NodeJS.ProcessEnv = process.env
): string[] {
  const suffix = envSuffix(agentId);
  const fp = env.PORTABLE_MIND_MACHINE_FINGERPRINT ?? machineFingerprint();
  return uniqueStrings([
    env[`PORTABLE_MIND_SEAT_ID_${suffix}`],
    env.PORTABLE_MIND_SEAT_ID,
    env[`HOLOSCRIPT_AGENT_SEAT_ID_${suffix}`],
    env.HOLOSCRIPT_AGENT_SEAT_ID,
    `holoscript-${agentId}-${fp}-x402`,
    `${agentId}-${fp}-x402`,
    `${agentId}-x402`,
    agentId,
  ]);
}

function envSuffix(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '');
}

function machineFingerprint(): string {
  return createHash('sha256')
    .update(hostname() + homedir())
    .digest('hex')
    .slice(0, 8);
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [
    ...new Set(values.map((value) => value?.trim()).filter((value): value is string => !!value)),
  ];
}
