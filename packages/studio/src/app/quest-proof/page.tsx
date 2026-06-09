import { redirect } from 'next/navigation';

/**
 * /quest-proof — N3 cut-over (2026-06-09).
 *
 * The Founder Console is now HoloScript-native end-to-end. The .tsx panel
 * (QuestProofPanel.tsx) has been deleted. Traffic is redirected to the
 * HoloScript-authored console at /quest-proof/native, which compiles
 * founder-console.holo via Native2DCompiler {format:html} and serves it
 * as hydration-free HTML — structurally immune to the Next app-router
 * hydration bug that broke the tunnelled .tsx console.
 *
 * Design: research/2026-06-02_founder-prevetted-approval-gate-and-native-console.md (N3)
 * Journalist receipt: VERIFIED 2026-06-09 — route test 1/1 passed, live @fetch binding
 * confirmed, no React root on the response, APIs intact.
 */
export default function QuestProofPage() {
  redirect('/quest-proof/native');
}
