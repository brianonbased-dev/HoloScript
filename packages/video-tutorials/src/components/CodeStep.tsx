import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { theme } from '../utils/theme';

interface CodeLine {
  content: string;
  highlight?: boolean;
  dim?: boolean;
  annotation?: string;
  type?: 'added' | 'removed' | 'normal';
}

interface CodeStepProps {
  title: string;
  description?: string;
  language?: string;
  lines: CodeLine[];
  stepNumber?: number;
  totalSteps?: number;
  showLineNumbers?: boolean;
}

const COLORS: Record<string, string> = {
  keyword: theme.accent,
  string: '#a5d6ff',
  number: '#79c0ff',
  comment: theme.textFaint,
  identifier: theme.text,
  property: '#ffa657',
  type: '#ff7b72',
  punctuation: theme.textMuted,
};

function tokenizeLine(line: string): { text: string; color: string }[] {
  // Simplified HoloScript tokenizer for visual presentation
  const tokens: { text: string; color: string }[] = [];

  const patterns: [RegExp, string][] = [
    [
      /^(scene|object|mesh|material|light|camera|traits|position|rotation|scale|import|export|const|let|type|interface|extends|implements|new|return|if|else|for|while|function|async|await)\b/,
      'keyword',
    ],
    [
      /^(Plane|Sphere|Cube|Cylinder|Torus|Capsule|Cone|DirectionalLight|PointLight|SpotLight|PerspectiveCamera|StandardMaterial|PBRMaterial)\b/,
      'type',
    ],
    [/^"[^"]*"|^'[^']*'/, 'string'],
    [/^#[0-9a-fA-F]{3,8}/, 'string'],
    [/^\/\/.*/, 'comment'],
    [/^[0-9]+\.?[0-9]*/, 'number'],
    [/^\[|\]|\{|\}|\(|\)|:|,|;|=|\./, 'punctuation'],
    [/^[a-zA-Z_][a-zA-Z0-9_]*/, 'identifier'],
    [/^\s+/, 'punctuation'],
  ];

  let remaining = line;
  while (remaining.length > 0) {
    let matched = false;
    for (const [pattern, colorKey] of patterns) {
      const match = remaining.match(pattern);
      if (match) {
        tokens.push({
          text: match[0],
          color: COLORS[colorKey] ?? theme.text,
        });
        remaining = remaining.slice(match[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      tokens.push({ text: remaining[0], color: theme.text });
      remaining = remaining.slice(1);
    }
  }

  return tokens;
}

export const CodeStep: React.FC<CodeStepProps> = ({
  title,
  description,
  language = 'holo',
  lines,
  stepNumber,
  totalSteps,
  showLineNumbers = true,
}) => {
  const frame = useCurrentFrame();

  const panelOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.ease),
  });

  const titleY = interpolate(frame, [0, 20], [24, 0], {
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.back(1.1)),
  });

  return (
    <AbsoluteFill
      style={{
        background: theme.bg,
        padding: theme.padding,
        display: 'flex',
        flexDirection: 'column',
        gap: 28,
        fontFamily: theme.titleFont,
      }}
    >
      {/* Header */}
      <div
        style={{
          opacity: panelOpacity,
          transform: `translateY(${titleY}px)`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <h2
            style={{
              color: theme.text,
              fontSize: 40,
              fontWeight: 600,
              margin: 0,
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h2>
          {stepNumber && totalSteps && (
            <span
              style={{
                color: theme.textMuted,
                fontSize: 18,
                fontFamily: theme.font,
              }}
            >
              {stepNumber} / {totalSteps}
            </span>
          )}
        </div>
        {description && (
          <p
            style={{
              color: theme.textMuted,
              fontSize: 22,
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {description}
          </p>
        )}
      </div>

      {/* Code panel */}
      <div
        style={{
          opacity: panelOpacity,
          flex: 1,
          background: theme.surface,
          borderRadius: theme.borderRadius,
          border: `1px solid ${theme.surfaceElevated}`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Tab bar */}
        <div
          style={{
            background: theme.surfaceElevated,
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            borderBottom: `1px solid ${theme.bg}`,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            {['#f85149', '#d29922', '#3fb950'].map((c) => (
              <div
                key={c}
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: c,
                  opacity: 0.7,
                }}
              />
            ))}
          </div>
          <span
            style={{
              color: theme.textMuted,
              fontSize: 14,
              fontFamily: theme.font,
            }}
          >
            scene.{language}
          </span>
        </div>

        {/* Code content */}
        <div
          style={{
            padding: theme.codePadding,
            flex: 1,
            fontFamily: theme.font,
            fontSize: 22,
            lineHeight: 1.7,
            overflowY: 'hidden',
          }}
        >
          {lines.map((line, i) => {
            const lineDelay = Math.min(i * 2, 30);
            const lineOpacity = interpolate(frame, [lineDelay, lineDelay + 12], [0, 1], {
              extrapolateRight: 'clamp',
              easing: Easing.out(Easing.ease),
            });
            const lineX = interpolate(frame, [lineDelay, lineDelay + 12], [16, 0], {
              extrapolateRight: 'clamp',
              easing: Easing.out(Easing.ease),
            });

            const bgColor =
              line.type === 'added'
                ? `${theme.success}1a`
                : line.type === 'removed'
                  ? `${theme.error}1a`
                  : line.highlight
                    ? `${theme.accent}15`
                    : 'transparent';

            const lineOpacityFinal = line.dim ? 0.35 : lineOpacity;
            const tokens = tokenizeLine(line.content);

            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  opacity: lineOpacityFinal,
                  transform: `translateX(${lineX}px)`,
                  background: bgColor,
                  borderRadius: 4,
                  padding: '1px 8px',
                  marginLeft: -8,
                  position: 'relative',
                }}
              >
                {/* Line number */}
                {showLineNumbers && (
                  <span
                    style={{
                      color: theme.textFaint,
                      minWidth: 40,
                      userSelect: 'none',
                      textAlign: 'right',
                      paddingRight: 20,
                      fontSize: 18,
                    }}
                  >
                    {i + 1}
                  </span>
                )}

                {/* Added/removed indicator */}
                {line.type === 'added' && (
                  <span style={{ color: theme.success, paddingRight: 8 }}>+</span>
                )}
                {line.type === 'removed' && (
                  <span style={{ color: theme.error, paddingRight: 8 }}>−</span>
                )}

                {/* Syntax highlighted tokens */}
                <span>
                  {tokens.map((tok, j) => (
                    <span key={j} style={{ color: tok.color }}>
                      {tok.text}
                    </span>
                  ))}
                </span>

                {/* Inline annotation */}
                {line.annotation && (
                  <span
                    style={{
                      marginLeft: 24,
                      color: theme.accent,
                      fontSize: 16,
                      opacity: 0.85,
                      fontStyle: 'italic',
                    }}
                  >
                    ← {line.annotation}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
