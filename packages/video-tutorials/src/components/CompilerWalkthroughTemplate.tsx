/**
 * Reusable template for all HoloScript compiler walkthrough videos.
 * Each compiler composition imports its data and passes it to this component.
 *
 * Structure:
 *   Title card (3s) → .holo input steps → compiler call → output steps → summary (5s)
 */
import React from 'react';
import {
  AbsoluteFill,
  Sequence,
  useVideoConfig,
  useCurrentFrame,
  interpolate,
  Easing,
} from 'remotion';
import { TitleCard } from './TitleCard';
import { CodeStep } from './CodeStep';
import { theme } from '../utils/theme';

export interface CodeLine {
  content: string;
  highlight?: boolean;
  dim?: boolean;
  annotation?: string;
  type?: 'added' | 'removed' | 'normal';
}

export interface WalkthroughStep {
  title: string;
  description: string;
  lines: CodeLine[];
  language?: string;
}

export interface CompilerWalkthroughData {
  compilerTarget: string;
  subtitle?: string;
  outputLanguage: string;
  holoSteps: WalkthroughStep[];
  outputSteps: WalkthroughStep[];
  summaryItems?: string[];
  tag?: string;
}

// ─── Summary Slide ────────────────────────────────────────────────────────────

const SummarySlide: React.FC<{ target: string; items: string[] }> = ({ target, items }) => {
  const frame = useCurrentFrame();
  const base = interpolate(frame, [0, 20], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.ease),
  });

  return (
    <AbsoluteFill
      style={{
        background: theme.bg,
        padding: theme.padding,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 40,
        fontFamily: theme.titleFont,
        opacity: base,
      }}
    >
      <h2 style={{ color: theme.text, fontSize: 48, fontWeight: 700, margin: 0 }}>
        That's the full pipeline
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {items.map((text, i) => {
          const isLast = i === items.length - 1;
          return (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 24,
                opacity: interpolate(frame, [i * 8, i * 8 + 15], [0, 1], {
                  extrapolateRight: 'clamp',
                }),
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  background: isLast ? theme.accent : theme.accentDim,
                  border: `2px solid ${theme.accentGlow}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: theme.text,
                  fontFamily: theme.font,
                  fontWeight: 700,
                  fontSize: 18,
                  flexShrink: 0,
                }}
              >
                {isLast ? '→' : i + 1}
              </div>
              <span
                style={{
                  color: isLast ? theme.accent : theme.text,
                  fontSize: 28,
                  fontWeight: isLast ? 600 : 400,
                }}
              >
                {text}
              </span>
            </div>
          );
        })}
      </div>
      <div
        style={{
          padding: '20px 28px',
          background: theme.surface,
          borderRadius: theme.borderRadius,
          border: `1px solid ${theme.accentGlow}44`,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          fontFamily: theme.font,
          fontSize: 20,
          color: theme.textMuted,
          marginTop: 8,
        }}
      >
        <span style={{ color: theme.success }}>▶</span>
        <span>npx holoscript compile scene.holo --target {target.toLowerCase().split(' ')[0]}</span>
      </div>
    </AbsoluteFill>
  );
};

// ─── Template ────────────────────────────────────────────────────────────────

export const CompilerWalkthroughTemplate: React.FC<CompilerWalkthroughData> = ({
  compilerTarget,
  subtitle,
  outputLanguage,
  holoSteps,
  outputSteps,
  summaryItems,
  tag = 'Compiler Demo',
}) => {
  const { fps } = useVideoConfig();
  const TITLE = fps * 3;
  const STEP = fps * 6;
  const SUMMARY = fps * 5;
  const allSteps = [...holoSteps, ...outputSteps];

  const defaultSummary = [
    'Write a .holo scene',
    `Call ${compilerTarget.split(' ')[0]}Compiler.compile(composition)`,
    `Get production-ready ${outputLanguage} output`,
    'Works with all 17 other targets too',
  ];

  return (
    <AbsoluteFill>
      <Sequence from={0} durationInFrames={TITLE}>
        <TitleCard
          title="HoloScript →"
          compilerTarget={compilerTarget}
          subtitle={subtitle ?? `From .holo scene to ${outputLanguage} in seconds`}
          tag={tag}
        />
      </Sequence>

      {allSteps.map((step, i) => (
        <Sequence key={i} from={TITLE + i * STEP} durationInFrames={STEP}>
          <CodeStep
            title={step.title}
            description={step.description}
            language={step.language ?? (i < holoSteps.length ? 'holo' : outputLanguage)}
            lines={step.lines}
            stepNumber={i + 1}
            totalSteps={allSteps.length}
          />
        </Sequence>
      ))}

      <Sequence from={TITLE + allSteps.length * STEP} durationInFrames={SUMMARY}>
        <SummarySlide target={compilerTarget} items={summaryItems ?? defaultSummary} />
      </Sequence>
    </AbsoluteFill>
  );
};

/** Compute total durationInFrames for a given data set at 30fps */
export function walkthroughDuration(data: CompilerWalkthroughData, fps = 30): number {
  return fps * 3 + (data.holoSteps.length + data.outputSteps.length) * fps * 6 + fps * 5;
}
