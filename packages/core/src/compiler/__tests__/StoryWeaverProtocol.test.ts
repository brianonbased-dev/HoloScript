import { describe, it, expect } from 'vitest';
import {
  compileNarrativeBlock,
  narrativeToUnity,
  narrativeToGodot,
  narrativeToVRChat,
  narrativeToR3F,
  narrativeToUSDA,
} from '../DomainBlockCompilerMixin';
import type { HoloDomainBlock } from '../../parser/HoloCompositionTypes';

function makeNarrativeBlock(overrides: Partial<HoloDomainBlock> = {}): HoloDomainBlock {
  return {
    type: 'DomainBlock',
    domain: 'narrative',
    keyword: 'narrative',
    name: 'Tutorial',
    traits: ['storyweaver'],
    properties: {},
    children: [],
    ...overrides,
  } as HoloDomainBlock;
}

function makeChapterChild(name: string, props: Record<string, any> = {}, children: any[] = []) {
  return {
    type: 'DomainBlock',
    domain: 'narrative',
    keyword: 'chapter',
    name,
    traits: [],
    properties: props,
    children,
  };
}

function makeDialogueLine(text: string, speaker?: string, emotion?: string) {
  return {
    type: 'DomainBlock',
    keyword: 'line',
    name: text,
    traits: [],
    properties: {
      text,
      ...(speaker ? { speaker } : {}),
      ...(emotion ? { emotion } : {}),
    },
    children: [],
  };
}

function makeChoice(text: string, nextChapter?: string, condition?: string) {
  return {
    type: 'DomainBlock',
    keyword: 'choice',
    name: text,
    traits: [],
    properties: {
      text,
      ...(nextChapter ? { next: nextChapter } : {}),
      ...(condition ? { condition } : {}),
    },
    children: [],
  };
}

function makeCutsceneAction(keyword: string, target?: string, duration?: number) {
  return {
    type: 'DomainBlock',
    keyword,
    name: target || '',
    traits: [],
    properties: {
      ...(target ? { target } : {}),
      ...(duration ? { duration } : {}),
    },
    children: [],
  };
}

describe('StoryWeaver Protocol', () => {
  // =========== compileNarrativeBlock ===========

  it('extracts chapters from nested children', () => {
    const block = makeNarrativeBlock({
      children: [
        makeChapterChild('Arrival', { trigger: 'player_enters("SpawnZone")' }),
        makeChapterChild('Exploration', { on_complete: 'Battle' }),
      ] as any,
    });
    const compiled = compileNarrativeBlock(block);
    expect(compiled.name).toBe('Tutorial');
    expect(compiled.chapters).toHaveLength(2);
    expect(compiled.chapters[0].name).toBe('Arrival');
    expect(compiled.chapters[0].trigger).toBe('player_enters("SpawnZone")');
    expect(compiled.chapters[1].onComplete).toBe('Battle');
  });

  it('extracts dialogue lines with speaker and emotion', () => {
    const block = makeNarrativeBlock({
      children: [
        makeChapterChild('Intro', {}, [
          makeDialogueLine('Welcome to Hololand.', 'Brittney', 'friendly'),
          makeDialogueLine('Follow me.', 'Brittney', 'excited'),
        ]),
      ] as any,
    });
    const compiled = compileNarrativeBlock(block);
    const chapter = compiled.chapters[0];
    expect(chapter.dialogueLines).toHaveLength(2);
    expect(chapter.dialogueLines![0].speaker).toBe('Brittney');
    expect(chapter.dialogueLines![0].text).toBe('Welcome to Hololand.');
    expect(chapter.dialogueLines![0].emotion).toBe('friendly');
    expect(chapter.dialogueLines![1].emotion).toBe('excited');
  });

  it('extracts choice nodes with conditions', () => {
    const block = makeNarrativeBlock({
      children: [
        makeChapterChild('Crossroads', {}, [
          makeChoice('Go left', 'LeftPath'),
          makeChoice('Go right', 'RightPath', 'has_key'),
        ]),
      ] as any,
    });
    const compiled = compileNarrativeBlock(block);
    const chapter = compiled.chapters[0];
    expect(chapter.choices).toHaveLength(2);
    expect(chapter.choices![0].text).toBe('Go left');
    expect(chapter.choices![0].nextChapter).toBe('LeftPath');
    expect(chapter.choices![1].condition).toBe('has_key');
  });

  it('detects branching type when choices are present', () => {
    const block = makeNarrativeBlock({
      children: [
        makeChapterChild('Fork', {}, [
          makeChoice('Option A', 'ChapterA'),
          makeChoice('Option B', 'ChapterB'),
        ]),
      ] as any,
    });
    const compiled = compileNarrativeBlock(block);
    expect(compiled.type).toBe('branching');
  });

  it('detects linear type when no choices are present', () => {
    const block = makeNarrativeBlock({
      children: [
        makeChapterChild('Start', { on_complete: 'End' }, [makeDialogueLine('Hello.')]),
        makeChapterChild('End'),
      ] as any,
    });
    const compiled = compileNarrativeBlock(block);
    expect(compiled.type).toBe('linear');
  });

  it('preserves trigger expressions', () => {
    const block = makeNarrativeBlock({
      children: [makeChapterChild('Boss', { trigger: 'health_below(0.5)' })] as any,
    });
    const compiled = compileNarrativeBlock(block);
    expect(compiled.chapters[0].trigger).toBe('health_below(0.5)');
  });

  it('returns sensible defaults for empty narrative', () => {
    const block = makeNarrativeBlock();
    const compiled = compileNarrativeBlock(block);
    expect(compiled.name).toBe('Tutorial');
    expect(compiled.type).toBe('linear');
    expect(compiled.chapters).toHaveLength(0);
  });

  it('extracts cutscene actions', () => {
    const block = makeNarrativeBlock({
      children: [
        makeChapterChild('Cinematic', {}, [
          makeCutsceneAction('camera', 'main_camera', 3),
          makeCutsceneAction('wait', undefined, 2),
          makeCutsceneAction('audio', 'bgm_epic', 0),
        ]),
      ] as any,
    });
    const compiled = compileNarrativeBlock(block);
    const chapter = compiled.chapters[0];
    expect(chapter.cutsceneActions).toHaveLength(3);
    expect(chapter.cutsceneActions![0].type).toBe('camera_move');
    expect(chapter.cutsceneActions![0].duration).toBe(3);
    expect(chapter.cutsceneActions![1].type).toBe('wait');
    expect(chapter.cutsceneActions![2].type).toBe('audio');
  });

  it('handles dialogue_tree keyword as virtual chapter', () => {
    const block = makeNarrativeBlock({
      children: [
        {
          type: 'DomainBlock',
          domain: 'narrative',
          keyword: 'dialogue_tree',
          name: 'greeting',
          traits: [],
          properties: {},
          children: [makeDialogueLine('Hi there!', 'NPC'), makeChoice('Tell me more', 'Details')],
        },
      ] as any,
    });
    const compiled = compileNarrativeBlock(block);
    expect(compiled.chapters).toHaveLength(1);
    expect(compiled.chapters[0].name).toBe('greeting');
    expect(compiled.chapters[0].dialogueLines).toHaveLength(1);
    expect(compiled.chapters[0].choices).toHaveLength(1);
    expect(compiled.type).toBe('branching');
  });

  // =========== narrativeToUnity ===========

  it('generates C# ScriptableObject code', () => {
    const compiled = compileNarrativeBlock(
      makeNarrativeBlock({
        children: [
          makeChapterChild('Arrival', { trigger: 'player_enters("spawn")' }, [
            makeDialogueLine('Welcome!', 'Guide', 'friendly'),
          ]),
        ] as any,
      })
    );
    const code = narrativeToUnity(compiled);
    expect(code).toContain('CreateAssetMenu');
    expect(code).toContain('ScriptableObject');
    expect(code).toContain('TutorialNarrative');
    expect(code).toContain('trigger = "player_enters');
    expect(code).toContain('speaker = "Guide"');
    expect(code).toContain('emotion = "friendly"');
  });

  // =========== narrativeToGodot ===========

  it('generates GDScript with signal-based flow', () => {
    const compiled = compileNarrativeBlock(
      makeNarrativeBlock({
        children: [
          makeChapterChild('Arrival', { on_complete: 'Exploration' }, [
            makeDialogueLine('Welcome!', 'Guide'),
          ]),
        ] as any,
      })
    );
    const code = narrativeToGodot(compiled);
    expect(code).toContain('extends Node');
    expect(code).toContain('signal chapter_complete');
    expect(code).toContain('signal dialogue_line');
    expect(code).toContain('func advance_chapter');
    expect(code).toContain('"on_complete": "Exploration"');
    expect(code).toContain('"speaker": "Guide"');
  });

  // =========== narrativeToVRChat ===========

  it('generates UdonSharp with synced chapter state', () => {
    const compiled = compileNarrativeBlock(
      makeNarrativeBlock({
        children: [
          makeChapterChild('Arrival', {}, [makeDialogueLine('Welcome!', 'NPC')]),
          makeChapterChild('Battle'),
        ] as any,
      })
    );
    const code = narrativeToVRChat(compiled);
    expect(code).toContain('UdonSharpBehaviour');
    expect(code).toContain('[UdonSynced]');
    expect(code).toContain('currentChapter');
    expect(code).toContain('"Arrival"');
    expect(code).toContain('"Battle"');
    expect(code).toContain('RequestSerialization');
    expect(code).toContain('OnDeserialization');
  });

  // =========== narrativeToR3F ===========

  it('generates React-compatible narrative state', () => {
    const compiled = compileNarrativeBlock(
      makeNarrativeBlock({
        properties: { start_chapter: 'Arrival' },
        children: [
          makeChapterChild('Arrival', { on_complete: 'End' }, [makeDialogueLine('Hello!', 'Bot')]),
        ] as any,
      })
    );
    const code = narrativeToR3F(compiled);
    expect(code).toContain('export const TutorialNarrativeData');
    expect(code).toContain('startChapter: "Arrival"');
    expect(code).toContain('onComplete: "End"');
    expect(code).toContain('speaker: "Bot"');
    expect(code).toContain('text: "Hello!"');
  });

  // =========== narrativeToUSDA ===========

  it('generates USD customData annotations', () => {
    const compiled = compileNarrativeBlock(
      makeNarrativeBlock({
        children: [
          makeChapterChild('Arrival', { trigger: 'proximity(5)' }, [
            makeDialogueLine('Welcome!', 'Guide'),
            makeChoice('Continue', 'Next'),
          ]),
        ] as any,
      })
    );
    const usda = narrativeToUSDA(compiled);
    expect(usda).toContain('def Scope "Narrative_Tutorial"');
    expect(usda).toContain('holoscript:narrativeType');
    expect(usda).toContain('Chapter_Arrival');
    expect(usda).toContain('holoscript:trigger = "proximity(5)"');
    expect(usda).toContain('Dialogue_0');
    expect(usda).toContain('holoscript:speaker = "Guide"');
    expect(usda).toContain('Choice_0');
    expect(usda).toContain('holoscript:nextChapter = "Next"');
  });
});
