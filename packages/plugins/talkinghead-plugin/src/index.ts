/**
 * @holoscript/talkinghead-plugin — TalkingHead WebXR lip-sync bridge stub.
 *
 * Research: ai-ecosystem/research/2026-04-*_talkinghead*.md + memory/talkinghead-*.md
 * Universal-IR matrix: docs/universal-ir-coverage.md (lipsync column)
 *
 * Status: STUB. WebAudio analysis + viseme-timing extraction is future work.
 * Scope covers viseme track schema + mapping to @lipsync + @expression traits.
 */

export type Viseme = 'aa' | 'E' | 'I' | 'O' | 'U' | 'PP' | 'FF' | 'TH' | 'DD' | 'kk' | 'CH' | 'SS' | 'nn' | 'RR' | 'sil';

export interface VisemeEvent {
  viseme: Viseme;
  t_start_ms: number;
  t_end_ms: number;
  intensity?: number; // 0..1 for emphasis
}

export interface TalkingHeadInput {
  clip_id: string;
  duration_ms: number;
  visemes: VisemeEvent[];
  audio_uri?: string;
}

export interface HoloLipsyncEmission {
  lipsync: { kind: '@lipsync'; target_id: string; params: Record<string, unknown> };
  viseme_count: number;
  coverage: number; // 0..1 fraction of duration with a viseme event
  warnings: string[];
}

export function mapTalkingHead(input: TalkingHeadInput): HoloLipsyncEmission {
  const warnings: string[] = [];
  let covered_ms = 0;
  const sorted = [...input.visemes].sort((a, b) => a.t_start_ms - b.t_start_ms);
  for (let i = 0; i < sorted.length; i++) {
    const v = sorted[i];
    if (v.t_end_ms <= v.t_start_ms) {
      warnings.push(`viseme ${i} has non-positive duration`);
      continue;
    }
    covered_ms += v.t_end_ms - v.t_start_ms;
    if (i > 0 && sorted[i - 1].t_end_ms > v.t_start_ms) {
      warnings.push(`visemes ${i - 1} and ${i} overlap`);
    }
  }
  const coverage = input.duration_ms > 0 ? covered_ms / input.duration_ms : 0;
  return {
    lipsync: {
      kind: '@lipsync',
      target_id: input.clip_id,
      params: {
        duration_ms: input.duration_ms,
        viseme_events: sorted,
        audio_uri: input.audio_uri,
      },
    },
    viseme_count: sorted.length,
    coverage,
    warnings,
  };
}
