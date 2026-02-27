/**
 * characterStore.test.ts
 *
 * Unit tests for the CharacterStore Zustand slice in src/lib/store.ts
 * Tests every action, state transition, and invariant.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCharacterStore } from '@/lib/store';

// Reset store between tests
function resetStore() {
  useCharacterStore.setState({
    glbUrl: null,
    boneNames: [],
    selectedBoneIndex: null,
    showSkeleton: true,
    isRecording: false,
    recordedClips: [],
    activeClipId: null,
    builtinAnimations: [],
    activeBuiltinAnimation: null,
  });
}

const SAMPLE_CLIP = {
  id: 'clip-001',
  name: 'Walk Cycle',
  duration: 2000,
  frames: [],
};

describe('CharacterStore — initial state', () => {
  beforeEach(resetStore);

  it('starts with no model loaded', () => {
    expect(useCharacterStore.getState().glbUrl).toBeNull();
  });

  it('starts with empty bone list', () => {
    expect(useCharacterStore.getState().boneNames).toEqual([]);
  });

  it('starts with no bone selected', () => {
    expect(useCharacterStore.getState().selectedBoneIndex).toBeNull();
  });

  it('starts with skeleton visible', () => {
    expect(useCharacterStore.getState().showSkeleton).toBe(true);
  });

  it('starts not recording', () => {
    expect(useCharacterStore.getState().isRecording).toBe(false);
  });

  it('starts with no recorded clips', () => {
    expect(useCharacterStore.getState().recordedClips).toEqual([]);
  });

  it('starts with no active clip', () => {
    expect(useCharacterStore.getState().activeClipId).toBeNull();
  });

  it('starts with no built-in animations', () => {
    expect(useCharacterStore.getState().builtinAnimations).toEqual([]);
  });

  it('starts with no active built-in animation', () => {
    expect(useCharacterStore.getState().activeBuiltinAnimation).toBeNull();
  });
});

describe('CharacterStore — setGlbUrl', () => {
  beforeEach(resetStore);

  it('sets the glbUrl', () => {
    useCharacterStore.getState().setGlbUrl('blob:http://localhost/abc');
    expect(useCharacterStore.getState().glbUrl).toBe('blob:http://localhost/abc');
  });

  it('resets boneNames when URL changes', () => {
    useCharacterStore.setState({ boneNames: ['Hips', 'Spine'] });
    useCharacterStore.getState().setGlbUrl('blob:http://localhost/new');
    expect(useCharacterStore.getState().boneNames).toEqual([]);
  });

  it('resets selectedBoneIndex when URL changes', () => {
    useCharacterStore.setState({ selectedBoneIndex: 3 });
    useCharacterStore.getState().setGlbUrl('blob:http://localhost/new');
    expect(useCharacterStore.getState().selectedBoneIndex).toBeNull();
  });

  it('resets builtinAnimations when URL changes', () => {
    useCharacterStore.setState({ builtinAnimations: [{ name: 'Idle', duration: 2000 }] });
    useCharacterStore.getState().setGlbUrl('blob:http://localhost/new');
    expect(useCharacterStore.getState().builtinAnimations).toEqual([]);
  });

  it('resets activeBuiltinAnimation when URL changes', () => {
    useCharacterStore.setState({ activeBuiltinAnimation: 'Idle' });
    useCharacterStore.getState().setGlbUrl('blob:http://localhost/new');
    expect(useCharacterStore.getState().activeBuiltinAnimation).toBeNull();
  });

  it('accepts null to unload model', () => {
    useCharacterStore.setState({ glbUrl: 'blob:existing' });
    useCharacterStore.getState().setGlbUrl(null);
    expect(useCharacterStore.getState().glbUrl).toBeNull();
  });
});

describe('CharacterStore — setBoneNames', () => {
  beforeEach(resetStore);

  it('sets bone names array', () => {
    useCharacterStore.getState().setBoneNames(['Hips', 'Spine', 'Head']);
    expect(useCharacterStore.getState().boneNames).toEqual(['Hips', 'Spine', 'Head']);
  });

  it('overwrites previous bone names', () => {
    useCharacterStore.getState().setBoneNames(['A', 'B']);
    useCharacterStore.getState().setBoneNames(['X', 'Y', 'Z']);
    expect(useCharacterStore.getState().boneNames).toEqual(['X', 'Y', 'Z']);
  });

  it('accepts empty array', () => {
    useCharacterStore.getState().setBoneNames(['Hips']);
    useCharacterStore.getState().setBoneNames([]);
    expect(useCharacterStore.getState().boneNames).toEqual([]);
  });
});

describe('CharacterStore — setSelectedBoneIndex', () => {
  beforeEach(resetStore);

  it('sets selected bone index', () => {
    useCharacterStore.getState().setSelectedBoneIndex(3);
    expect(useCharacterStore.getState().selectedBoneIndex).toBe(3);
  });

  it('accepts 0 as a valid index', () => {
    useCharacterStore.getState().setSelectedBoneIndex(0);
    expect(useCharacterStore.getState().selectedBoneIndex).toBe(0);
  });

  it('accepts null to deselect', () => {
    useCharacterStore.getState().setSelectedBoneIndex(5);
    useCharacterStore.getState().setSelectedBoneIndex(null);
    expect(useCharacterStore.getState().selectedBoneIndex).toBeNull();
  });
});

describe('CharacterStore — setShowSkeleton', () => {
  beforeEach(resetStore);

  it('hides the skeleton', () => {
    useCharacterStore.getState().setShowSkeleton(false);
    expect(useCharacterStore.getState().showSkeleton).toBe(false);
  });

  it('shows the skeleton', () => {
    useCharacterStore.setState({ showSkeleton: false });
    useCharacterStore.getState().setShowSkeleton(true);
    expect(useCharacterStore.getState().showSkeleton).toBe(true);
  });
});

describe('CharacterStore — recording state', () => {
  beforeEach(resetStore);

  it('setIsRecording toggles recording on', () => {
    useCharacterStore.getState().setIsRecording(true);
    expect(useCharacterStore.getState().isRecording).toBe(true);
  });

  it('setIsRecording toggles recording off', () => {
    useCharacterStore.setState({ isRecording: true });
    useCharacterStore.getState().setIsRecording(false);
    expect(useCharacterStore.getState().isRecording).toBe(false);
  });
});

describe('CharacterStore — recorded clips', () => {
  beforeEach(resetStore);

  it('addRecordedClip appends a clip', () => {
    useCharacterStore.getState().addRecordedClip(SAMPLE_CLIP);
    expect(useCharacterStore.getState().recordedClips).toHaveLength(1);
    expect(useCharacterStore.getState().recordedClips[0].id).toBe('clip-001');
  });

  it('addRecordedClip appends multiple clips', () => {
    useCharacterStore.getState().addRecordedClip({ ...SAMPLE_CLIP, id: 'c1' });
    useCharacterStore.getState().addRecordedClip({ ...SAMPLE_CLIP, id: 'c2' });
    expect(useCharacterStore.getState().recordedClips).toHaveLength(2);
  });

  it('removeRecordedClip removes by id', () => {
    useCharacterStore.getState().addRecordedClip({ ...SAMPLE_CLIP, id: 'remove-me' });
    useCharacterStore.getState().addRecordedClip({ ...SAMPLE_CLIP, id: 'keep-me' });
    useCharacterStore.getState().removeRecordedClip('remove-me');
    const clips = useCharacterStore.getState().recordedClips;
    expect(clips).toHaveLength(1);
    expect(clips[0].id).toBe('keep-me');
  });

  it('removeRecordedClip is a no-op for unknown id', () => {
    useCharacterStore.getState().addRecordedClip(SAMPLE_CLIP);
    useCharacterStore.getState().removeRecordedClip('nonexistent');
    expect(useCharacterStore.getState().recordedClips).toHaveLength(1);
  });

  it('renameRecordedClip updates the name', () => {
    useCharacterStore.getState().addRecordedClip(SAMPLE_CLIP);
    useCharacterStore.getState().renameRecordedClip('clip-001', 'Run Cycle');
    expect(useCharacterStore.getState().recordedClips[0].name).toBe('Run Cycle');
  });

  it('renameRecordedClip only updates the matching clip', () => {
    useCharacterStore.getState().addRecordedClip({ ...SAMPLE_CLIP, id: 'c1', name: 'First' });
    useCharacterStore.getState().addRecordedClip({ ...SAMPLE_CLIP, id: 'c2', name: 'Second' });
    useCharacterStore.getState().renameRecordedClip('c1', 'Updated');
    const clips = useCharacterStore.getState().recordedClips;
    expect(clips[0].name).toBe('Updated');
    expect(clips[1].name).toBe('Second');
  });

  it('renameRecordedClip is a no-op for unknown id', () => {
    useCharacterStore.getState().addRecordedClip(SAMPLE_CLIP);
    useCharacterStore.getState().renameRecordedClip('no-such-id', 'New Name');
    expect(useCharacterStore.getState().recordedClips[0].name).toBe('Walk Cycle');
  });
});

describe('CharacterStore — active clip', () => {
  beforeEach(resetStore);

  it('setActiveClipId sets the active clip', () => {
    useCharacterStore.getState().setActiveClipId('clip-001');
    expect(useCharacterStore.getState().activeClipId).toBe('clip-001');
  });

  it('setActiveClipId accepts null to stop playback', () => {
    useCharacterStore.setState({ activeClipId: 'clip-001' });
    useCharacterStore.getState().setActiveClipId(null);
    expect(useCharacterStore.getState().activeClipId).toBeNull();
  });
});

describe('CharacterStore — built-in animations', () => {
  beforeEach(resetStore);

  const ANIMS = [
    { name: 'Idle', duration: 2000 },
    { name: 'Walk', duration: 1000 },
    { name: 'Run',  duration: 800 },
  ];

  it('setBuiltinAnimations stores the list', () => {
    useCharacterStore.getState().setBuiltinAnimations(ANIMS);
    expect(useCharacterStore.getState().builtinAnimations).toHaveLength(3);
  });

  it('setBuiltinAnimations overwrites previous list', () => {
    useCharacterStore.getState().setBuiltinAnimations(ANIMS);
    useCharacterStore.getState().setBuiltinAnimations([{ name: 'Jump', duration: 500 }]);
    expect(useCharacterStore.getState().builtinAnimations).toHaveLength(1);
    expect(useCharacterStore.getState().builtinAnimations[0].name).toBe('Jump');
  });

  it('setActiveBuiltinAnimation sets the active animation', () => {
    useCharacterStore.getState().setActiveBuiltinAnimation('Idle');
    expect(useCharacterStore.getState().activeBuiltinAnimation).toBe('Idle');
  });

  it('setActiveBuiltinAnimation accepts null to stop', () => {
    useCharacterStore.setState({ activeBuiltinAnimation: 'Walk' });
    useCharacterStore.getState().setActiveBuiltinAnimation(null);
    expect(useCharacterStore.getState().activeBuiltinAnimation).toBeNull();
  });
});
