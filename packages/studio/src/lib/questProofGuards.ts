export const QUEST_PROOF_GUARDS = new Map<string, string>([
  ['/creator', 'Creator requires an authenticated desktop session before headset proof.'],
  [
    '/create',
    'Create loads the full editor workbench and is not stable enough for Quest proof sweeps yet.',
  ],
  [
    '/playground/locomotion',
    'Locomotion preview is not promoted for headset proof until its first viewport is deterministic.',
  ],
]);

export function questProofGuardReason(pathname: string): string | undefined {
  return QUEST_PROOF_GUARDS.get(pathname);
}
