'use client';

/**
 * BrittneyVoiceFrontDoor — N4 voice front-door wrapper for the next-actions section.
 *
 * Wraps the "Next — anticipated moves" tile in QuestProofPanel and adds a
 * voice modality button. When the founder taps the mic button:
 *   1. Brittney reads: "Here are your next three: 1. Fix the parser. …
 *      Say the number or name to approve."
 *   2. ASR listens for a spoken ordinal or label prefix.
 *   3. On match: fires the same `onApprove(action)` callback the tap chips use
 *      — the safety gate (reversible / 403 irreversible) is identical to N3.
 *
 * Designed to be dropped into QuestProofPanel in place of the existing
 * `nextActions.length > 0` tile:
 *
 *   <BrittneyVoiceFrontDoor actions={nextActions} onApprove={approveAction}
 *     approvingId={approvingId} approvedIds={approvedIds} />
 *
 * Falls back gracefully when the Web Speech APIs are absent (the tile renders
 * without the mic button, behaving exactly as before N4).
 */

import { useCallback } from 'react';
import { ActionChip, TapTarget, tokens } from '../console';
import { useBrittneyVoiceActions } from '../../hooks/useBrittneyVoiceActions';
import type { ProposedAction } from '../../app/api/quest-proof/next-actions/nextActions';

export interface BrittneyVoiceFrontDoorProps {
  actions: ProposedAction[];
  /** Called when a tap OR a voice selection resolves to an action. */
  onApprove: (action: ProposedAction) => void;
  /** ID of the action currently mid-approval (shows spinner on its chip). */
  approvingId: string | null;
  /** IDs of actions that have just been approved (show confirmed state). */
  approvedIds: Record<string, true>;
}

export function BrittneyVoiceFrontDoor({
  actions,
  onApprove,
  approvingId,
  approvedIds,
}: BrittneyVoiceFrontDoorProps) {
  const { isSpeaking, isListening, isSupported, speakAndListen, cancel, lastTranscript } =
    useBrittneyVoiceActions({ onApprove });

  const handleMic = useCallback(() => {
    if (isSpeaking || isListening) {
      cancel();
    } else {
      speakAndListen(actions);
    }
  }, [isSpeaking, isListening, cancel, speakAndListen, actions]);

  if (actions.length === 0) return null;

  const voiceActive = isSpeaking || isListening;
  const micLabel = isSpeaking ? 'Speaking…' : isListening ? 'Listening…' : 'Ask Brittney';

  return (
    <div
      data-testid="next-actions-voice"
      style={{
        marginTop: 16,
        border: `1px solid ${voiceActive ? tokens.color.accent : tokens.color.success}`,
        borderRadius: tokens.radius.md,
        background: voiceActive ? '#0d1b3a' : '#0c1f14',
        padding: tokens.space.md,
        transition: 'border-color 0.2s, background 0.2s',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: tokens.space.sm,
          marginBottom: tokens.space.sm,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: tokens.space.sm }}>
          <span
            style={{ color: voiceActive ? '#60a5fa' : tokens.color.successText, fontWeight: tokens.weight.heavy, fontSize: tokens.font.tile }}
          >
            Next
          </span>
          <span style={{ color: tokens.color.textDim, fontSize: tokens.font.body }}>
            {voiceActive ? micLabel : 'anticipated moves — tap or say to act'}
          </span>
        </div>

        {/* Mic button — only rendered when Web Speech is available */}
        {isSupported && (
          <TapTarget
            onTap={handleMic}
            ariaLabel={voiceActive ? 'Stop Brittney voice' : 'Ask Brittney to read actions aloud'}
            testId="brittney-voice-mic"
            style={{
              background: voiceActive ? tokens.color.accent : tokens.color.surface,
              border: `1px solid ${voiceActive ? tokens.color.accent : tokens.color.border}`,
              color: tokens.color.text,
              minWidth: 130,
              justifyContent: 'center',
              fontSize: tokens.font.body,
            }}
          >
            {voiceActive ? '⏹ Stop' : '🎙 Ask Brittney'}
          </TapTarget>
        )}
      </div>

      {/* Action chips — same as the existing next-actions tile */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: tokens.space.sm }}>
        {actions.map((a) => (
          <ActionChip
            key={a.id}
            label={a.label}
            reversible={a.reversible}
            href={a.href}
            busy={approvingId === a.id}
            approved={approvedIds[a.id] === true}
            onApprove={() => onApprove(a)}
            onReview={() => {
              // Irreversible chip: navigate to review
              if (a.href) window.open(a.href, '_blank', 'noopener,noreferrer');
            }}
            testId={`next-action-${a.taskId}`}
          />
        ))}
      </div>

      {/* Last transcript echo — visible only during / just after voice flow */}
      {lastTranscript && voiceActive && (
        <div
          data-testid="brittney-last-transcript"
          style={{
            marginTop: tokens.space.sm,
            color: tokens.color.textDim,
            fontSize: tokens.font.label,
            fontFamily: 'monospace',
          }}
        >
          heard: &ldquo;{lastTranscript}&rdquo;
        </div>
      )}
    </div>
  );
}
