'use client';

import { useState } from 'react';
import { tokens } from './tokens';
import { TapTarget } from './primitives';

/**
 * <SayOrType> — the Talk + Type-conversational primitives in one bar
 * (generalizes the Message→Task box). The human SAYS it (voice affordance,
 * Brittney) or TYPES it conversationally — never a command. There is no command
 * syntax, no slash, no file path. Submitting hands the free-text intent up; the
 * agent turns it into action.
 */
export interface SayOrTypeProps {
  placeholder?: string;
  /** Called with the conversational text when the human submits. */
  onSubmit: (text: string) => void;
  /** Called when the human taps the talk affordance (voice capture). */
  onTalk?: () => void;
  submitLabel?: string;
  busy?: boolean;
  testId?: string;
}

export function SayOrType({
  placeholder = 'Say or type what you want…',
  onSubmit,
  onTalk,
  submitLabel = 'Send',
  busy,
  testId,
}: SayOrTypeProps) {
  const [text, setText] = useState('');
  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    onSubmit(t);
    setText('');
  };
  return (
    <div
      data-testid={testId}
      style={{ display: 'flex', gap: tokens.space.sm, alignItems: 'stretch', flexWrap: 'wrap' }}
    >
      {onTalk ? (
        <TapTarget
          onTap={onTalk}
          ariaLabel="Talk"
          testId={testId ? `${testId}-talk` : undefined}
          style={{
            background: tokens.color.surface,
            border: `1px solid ${tokens.color.accent}`,
            color: tokens.color.text,
            minWidth: tokens.tap.min,
            justifyContent: 'center',
          }}
        >
          🎙 Talk
        </TapTarget>
      ) : null}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder={placeholder}
        aria-label="Say or type"
        data-testid={testId ? `${testId}-input` : undefined}
        style={{
          flex: 1,
          minWidth: 160,
          minHeight: tokens.tap.min,
          padding: `${tokens.space.sm}px ${tokens.space.md}px`,
          borderRadius: tokens.radius.sm,
          background: tokens.color.bg,
          color: tokens.color.text,
          border: `1px solid ${tokens.color.border}`,
          fontSize: tokens.font.chip,
        }}
      />
      <TapTarget
        onTap={submit}
        disabled={busy || text.trim().length === 0}
        ariaLabel={submitLabel}
        testId={testId ? `${testId}-send` : undefined}
        style={{
          background: tokens.color.success,
          border: `1px solid ${tokens.color.success}`,
          color: '#fff',
          minWidth: 88,
          justifyContent: 'center',
        }}
      >
        {submitLabel}
      </TapTarget>
    </div>
  );
}
