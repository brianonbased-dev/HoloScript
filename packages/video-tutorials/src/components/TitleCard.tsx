import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";
import { theme } from "../utils/theme";

interface TitleCardProps {
  title: string;
  subtitle?: string;
  tag?: string;
  compilerTarget?: string;
}

export const TitleCard: React.FC<TitleCardProps> = ({
  title,
  subtitle,
  tag,
  compilerTarget,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });

  const titleY = interpolate(frame, [0, fps * 0.5], [40, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.back(1.2)),
  });

  const subtitleOpacity = interpolate(frame, [fps * 0.4, fps * 0.9], [0, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.ease),
  });

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at 50% 60%, ${theme.accentDim} 0%, ${theme.bg} 70%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        fontFamily: theme.titleFont,
      }}
    >
      {/* Animated grid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(${theme.accentDim} 1px, transparent 1px),
            linear-gradient(90deg, ${theme.accentDim} 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          opacity: 0.4,
        }}
      />

      {/* HoloScript wordmark */}
      <div
        style={{
          opacity,
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 8,
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: theme.accent,
            boxShadow: `0 0 16px ${theme.accent}`,
          }}
        />
        <span
          style={{
            color: theme.textMuted,
            fontSize: 18,
            letterSpacing: "0.15em",
            textTransform: "uppercase",
          }}
        >
          HoloScript
        </span>
        {tag && (
          <>
            <span style={{ color: theme.textFaint }}>·</span>
            <span
              style={{
                color: theme.accent,
                fontSize: 14,
                background: theme.accentDim,
                padding: "2px 10px",
                borderRadius: 100,
                border: `1px solid ${theme.accentGlow}44`,
              }}
            >
              {tag}
            </span>
          </>
        )}
      </div>

      {/* Main title */}
      <h1
        style={{
          color: theme.text,
          fontSize: 72,
          fontWeight: 700,
          textAlign: "center",
          letterSpacing: "-0.02em",
          lineHeight: 1.1,
          margin: 0,
          opacity,
          transform: `translateY(${titleY}px)`,
          maxWidth: 1400,
          padding: "0 80px",
        }}
      >
        {compilerTarget ? (
          <>
            {title}{" "}
            <span style={{ color: theme.accent }}>{compilerTarget}</span>
          </>
        ) : (
          title
        )}
      </h1>

      {/* Subtitle */}
      {subtitle && (
        <p
          style={{
            color: theme.textMuted,
            fontSize: 28,
            textAlign: "center",
            margin: 0,
            opacity: subtitleOpacity,
            maxWidth: 900,
          }}
        >
          {subtitle}
        </p>
      )}

      {/* Bottom line */}
      <div
        style={{
          position: "absolute",
          bottom: 48,
          opacity: subtitleOpacity,
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: theme.textFaint,
          fontSize: 16,
          fontFamily: theme.font,
        }}
      >
        <span>github.com/brianonbased-dev/HoloScript</span>
        <span>·</span>
        <span style={{ color: theme.success }}>holoscript.dev</span>
      </div>
    </AbsoluteFill>
  );
};
