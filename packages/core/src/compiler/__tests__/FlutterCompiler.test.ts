import { describe, expect, it, vi } from 'vitest';

import { FlutterCompiler } from '../FlutterCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', () => ({
  getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  ResourceType: { AST: 'AST', CODE: 'CODE', OUTPUT: 'OUTPUT' },
}));

function compositionWithObjects(objects: HoloObjectDecl[]): HoloComposition {
  return {
    type: 'Composition',
    name: 'FlutterVideoScene',
    templates: [],
    objects,
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
  };
}

function videoObject(extra: Partial<HoloObjectDecl> = {}): HoloObjectDecl {
  return {
    type: 'ObjectDecl',
    name: 'video',
    properties: [{ type: 'ObjectProperty', key: 'type', value: 'video' }],
    traits: [],
    ...extra,
  };
}

describe('FlutterCompiler video output', () => {
  it('emits video_player imports and a generated player for URL videos', () => {
    const compiler = new FlutterCompiler();
    const result = compiler.compile(
      compositionWithObjects([
        videoObject({
          name: 'intro',
          properties: [
            { type: 'ObjectProperty', key: 'type', value: 'video' },
            { type: 'ObjectProperty', key: 'src', value: 'https://example.com/intro.mp4' },
            { type: 'ObjectProperty', key: 'autoplay', value: true },
            { type: 'ObjectProperty', key: 'loop', value: true },
            { type: 'ObjectProperty', key: 'muted', value: true },
            { type: 'ObjectProperty', key: 'aspectRatio', value: 1.5 },
          ],
        }),
      ]),
      '',
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain(`import 'package:video_player/video_player.dart';`);
    expect(result.code).toContain('class HoloVideoPlayer extends StatefulWidget');
    expect(result.code).toContain(
      `HoloVideoPlayer(url: 'https://example.com/intro.mp4', autoplay: true, loop: true, muted: true, aspectRatio: 1.5)`,
    );
    expect(result.code).toContain('VideoPlayerController.networkUrl(Uri.parse(widget.url!))');
    expect(result.code).not.toContain('TODO: video_player package');
    expect(result.warnings).toContain(
      'Flutter video output requires the video_player package in pubspec.yaml',
    );
  });

  it('accepts asset-backed video sources from the @video trait', () => {
    const compiler = new FlutterCompiler();
    const result = compiler.compile(
      compositionWithObjects([
        videoObject({
          name: 'local_intro',
          traits: [
            {
              type: 'ObjectTrait',
              name: 'video',
              config: { asset: 'assets/intro.mp4', loop: true },
            },
          ],
        }),
      ]),
      '',
    );

    expect(result.success).toBe(true);
    expect(result.code).toContain(`HoloVideoPlayer(asset: 'assets/intro.mp4', loop: true)`);
    expect(result.code).toContain('VideoPlayerController.asset(widget.asset!)');
  });

  it('keeps source-less videos honest with a warning and placeholder', () => {
    const compiler = new FlutterCompiler();
    const result = compiler.compile(compositionWithObjects([videoObject({ name: 'empty_video' })]), '');

    expect(result.success).toBe(true);
    expect(result.code).toContain('Placeholder(');
    expect(result.code).not.toContain('TODO: video_player package');
    expect(result.warnings).toContain("Video object 'empty_video' has no source; emitted placeholder");
  });
});
