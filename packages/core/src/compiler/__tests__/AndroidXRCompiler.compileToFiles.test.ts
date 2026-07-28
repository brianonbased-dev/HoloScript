import { describe, it, expect } from 'vitest';
import { AndroidXRCompiler } from '../AndroidXRCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

/**
 * Unit tests for the path-keyed adapter (compileToFiles) that lets the Quest-style
 * golden-diff gate apply to Android XR. The adapter maps AndroidXRCompileResult's
 * named fields onto the on-disk Android project layout.
 */
function minimalComposition(): HoloComposition {
  return {
    name: 'AdapterTest',
    objects: [{ name: 'cube', traits: [{ name: 'hand_tracking' }], properties: [] }],
  } as unknown as HoloComposition;
}

describe('AndroidXRCompiler.compileToFiles', () => {
  it('returns a path-keyed map with the standard Android project layout', () => {
    const compiler = new AndroidXRCompiler({
      packageName: 'net.holoscript.androidxr',
      activityName: 'GeneratedXRActivity',
    });
    const files = compiler.compileToFiles(minimalComposition(), '');
    const keys = Object.keys(files).sort();
    expect(keys).toEqual(
      [
        'app/build.gradle.kts',
        'app/src/main/AndroidManifest.xml',
        'app/src/main/java/net/holoscript/androidxr/GeneratedXRActivity.kt',
        'app/src/main/java/net/holoscript/androidxr/XRNodeFactory.kt',
        'app/src/main/java/net/holoscript/androidxr/XRSceneState.kt',
      ].sort()
    );
  });

  it('derives the java source path from the package name', () => {
    const compiler = new AndroidXRCompiler({ packageName: 'com.example.foo' });
    const files = compiler.compileToFiles(minimalComposition(), '');
    expect(Object.keys(files)).toContain('app/src/main/java/com/example/foo/XRSceneState.kt');
  });

  it('uses the configured activity name for the activity file path', () => {
    const compiler = new AndroidXRCompiler({
      packageName: 'net.holoscript.androidxr',
      activityName: 'MyXrActivity',
    });
    const files = compiler.compileToFiles(minimalComposition(), '');
    expect(Object.keys(files)).toContain(
      'app/src/main/java/net/holoscript/androidxr/MyXrActivity.kt'
    );
  });

  it('emits a GlimmerComponents file in glasses mode', () => {
    const compiler = new AndroidXRCompiler({
      packageName: 'net.holoscript.androidxr',
      formFactor: 'glasses',
    });
    const files = compiler.compileToFiles(minimalComposition(), '');
    expect(Object.keys(files)).toContain(
      'app/src/main/java/net/holoscript/androidxr/GlimmerComponents.kt'
    );
  });

  it('every value is non-empty source text', () => {
    const compiler = new AndroidXRCompiler({ packageName: 'net.holoscript.androidxr' });
    const files = compiler.compileToFiles(minimalComposition(), '');
    for (const [rel, content] of Object.entries(files)) {
      expect(content, rel).toBeTruthy();
      expect(content!.length, rel).toBeGreaterThan(0);
    }
  });
});
