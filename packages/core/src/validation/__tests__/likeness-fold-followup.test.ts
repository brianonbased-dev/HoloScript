/**
 * Follow-up (Language/Mapping): avatar_embodiment and the tracking series' runtime lookups fold
 * trait spellings with likenessTraitName, the same folding as HS1006; and lip_sync / lipsync are
 * one trait whose exempt live sources are both microphone and live_mic, whatever the spelling.
 */
import { describe, expect, it } from 'vitest';
import { validateCanonicalSource } from '../CanonicalSourceValidator';
import { likenessTraitName, SOURCE_GATED_TRACKING } from '../LikenessCheck';
import { carriesRealLikeness } from '../../traits/AvatarLikeness';
import { carriesLikenessOrTracking } from '../../traits/LikenessShareGrant';
// @ts-expect-error -- plain .mjs without types
import { analyze } from '../../../strict/holo_strict.mjs';
import * as parser from '../../parser/index';

const hs1011 = (src: string) =>
  validateCanonicalSource({ source: src, surface: 'holo' }).errors.filter((e) => e.code === 'HS1011').length;
const obj = (body: string) => `object "Ava" {\n${body}\n}\n`;

describe('avatar_embodiment spellings fold (likenessTraitName)', () => {
  it.each(['avatar_embodiment', 'AvatarEmbodiment', 'avatarembodiment', 'AVATAR_EMBODIMENT', 'avatar__embodiment'])(
    '@%s(tracking_source: "playback") is gated',
    (t) => {
      expect(likenessTraitName(t)).toBe('avatar_embodiment');
      expect(hs1011(obj(`  @${t}(tracking_source: "playback")`))).toBe(1);
      expect(hs1011(obj(`  @${t}(tracking_source: "headset")`))).toBe(0);
    }
  );
  it.each(['FaceMesh', 'facemesh', 'FACE_MESH', 'face__mesh'])(
    'a sibling @%s makes an ai-driven avatar a real likeness (static + runtime)',
    (t) => {
      expect(carriesRealLikeness([t])).toBe(true);
      // face_mesh itself is gated too, so expect 2 findings: the trait and the avatar.
      expect(hs1011(obj(`  @${t}\n  @avatar_embodiment(tracking_source: "ai")`))).toBe(2);
    }
  );
  it('a synthetic ai avatar stays exempt', () => {
    expect(carriesRealLikeness(['avatar_embodiment', 'Hologram'])).toBe(false);
    expect(hs1011(obj('  @avatar_embodiment(tracking_source: "ai")'))).toBe(0);
  });
  it.each(['FaceTracking', 'facetracking', 'BodyTracking', 'LipSync', 'LIPSYNC', 'VoicePrint', 'bodyscan', 'AvatarEmbodiment'])(
    'runtime share-grant keying sees @%s',
    (t) => {
      expect(carriesLikenessOrTracking({ traits: [t] })).toBe(true);
    }
  );
  it('strict places an avatar_embodiment finding at its own @ (any spelling)', () => {
    const deps = {
      tokenizeHoloSource: parser.tokenizeHoloSource,
      parseHolo: parser.parseHolo,
      isKnownTrait: parser.isKnownTrait,
      declaredTraitNames: parser.declaredTraitNames,
      checkLikeness: parser.checkLikeness,
      likenessTraitName: parser.likenessTraitName,
      likenessSources: { ...parser.LIKENESS_SOURCES, ...parser.SOURCE_GATED_TRACKING, avatar_embodiment: 'body' },
    };
    const src = 'composition "C" {\n  object "Ava" {\n    @AvatarEmbodiment(tracking_source: "remote")\n  }\n}\n';
    const d = analyze(src, deps).diagnostics.filter((x: { code: string }) => x.code === 'HS1011');
    expect(d.length).toBe(1);
    expect([d[0].line, d[0].column]).toEqual([3, 5]);
  });
});

describe('lip_sync / lipsync: one trait, both live sources (Mapping nit)', () => {
  it('both spellings exempt microphone and live_mic', () => {
    expect(SOURCE_GATED_TRACKING.lip_sync.live).toEqual(['microphone', 'live_mic']);
    expect(SOURCE_GATED_TRACKING.lipsync.live).toEqual(['microphone', 'live_mic']);
  });
  it.each(['lip_sync', 'lipsync', 'LipSync', 'LIPSYNC', 'lipSync', 'Lip_Sync', 'lip__sync'])(
    '@%s: microphone and live_mic are exempt; a recording or no source is gated',
    (t) => {
      expect(hs1011(obj(`  @${t}(source: "microphone")`))).toBe(0);
      expect(hs1011(obj(`  @${t}(source: "live_mic")`))).toBe(0);
      expect(hs1011(obj(`  @${t}(source: "recording")`))).toBe(1);
      expect(hs1011(obj(`  @${t}`))).toBe(1);
    }
  );
});
