/**
 * QuestCompiler HoloRead tracer slice.
 *
 * Parses the real product composition and proves that the existing semantic seams become a
 * privacy-first native Quest reader. The generated Android bridge is allowed to contain platform
 * APIs; product behavior and policy must remain derived from reader.holo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QuestCompiler } from '../QuestCompiler';
import { HoloCompositionParser } from '../../parser/HoloCompositionParser';

const READER_HOLO = join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  '..',
  'apps',
  'quest-real-world-reader',
  'reader.holo'
);

describe('QuestCompiler HoloRead native trait dispatch', () => {
  const source = readFileSync(READER_HOLO, 'utf8');
  const parsed = new HoloCompositionParser().parse(source);

  it('parses the HoloScript product source', () => {
    expect(parsed.success).toBe(true);
    expect(parsed.errors ?? []).toHaveLength(0);
  });

  it('emits the reader application instead of the QR application', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const keys = Object.keys(out);

    expect(keys.some((key) => key.endsWith('ReaderContent.kt'))).toBe(true);
    expect(keys.some((key) => key.endsWith('TextRecognizer.kt'))).toBe(true);
    expect(keys.some((key) => key.endsWith('PassthroughCameraController.kt'))).toBe(true);
    expect(keys.some((key) => key.endsWith('ReaderPanel.kt'))).toBe(true);
    expect(keys.some((key) => key.endsWith('ReaderActivity.kt'))).toBe(true);
    expect(keys.some((key) => key.endsWith('ContextEngine.kt'))).toBe(true);
    expect(keys.some((key) => key.endsWith('TranslationController.kt'))).toBe(true);
    expect(keys.some((key) => key.endsWith('LearningSourceRouter.kt'))).toBe(true);
    expect(keys.some((key) => key.endsWith('ContextEngineTest.kt'))).toBe(true);
    expect(
      keys.every((key) => key.includes('net/holoscript/holoread') || !key.endsWith('.kt'))
    ).toBe(true);
    expect(keys.some((key) => key.endsWith('QrDecoder.kt'))).toBe(false);
  });

  it('bundles offline OCR and permits network only for explicit translation model downloads', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const gradle = valueEnding(out, 'app/build.gradle.kts');
    const manifest = valueEnding(out, 'AndroidManifest.xml');

    expect(gradle).toContain('implementation("com.google.mlkit:text-recognition:16.0.1")');
    expect(gradle).toContain('implementation("com.google.mlkit:language-id:17.0.6")');
    expect(gradle).toContain('implementation("com.google.mlkit:translate:17.0.3")');
    expect(gradle).not.toContain('play-services-mlkit-text-recognition');
    expect(gradle).not.toContain('meta.spatial.sdk.hotreload');
    expect(gradle).not.toContain('meta.spatial.sdk.datamodelinspector');
    expect(gradle).not.toContain('meta.spatial.sdk.ovrmetrics');
    expect(manifest).toContain('horizonos.permission.HEADSET_CAMERA');
    expect(manifest).toContain('android:name="oculus.software.handtracking"');
    expect(manifest).toContain('android:name="com.oculus.permission.HAND_TRACKING"');
    expect(manifest).toContain('android:name="com.oculus.handtracking.version"');
    expect(manifest).toContain('<uses-permission android:name="android.permission.INTERNET" />');
  });

  it('lowers one-shot OCR, magnification, speech, and privacy values from traits', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const recognizer = valueEnding(out, 'TextRecognizer.kt');
    const controller = valueEnding(out, 'PassthroughCameraController.kt');
    const content = valueEnding(out, 'ReaderContent.kt');
    const panel = valueEnding(out, 'ReaderPanel.kt');
    const activity = valueEnding(out, 'ReaderActivity.kt');

    expect(recognizer).toContain(
      'TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)'
    );
    expect(recognizer).toContain('InputImage.fromBitmap');
    expect(controller).toContain('fun requestRecognition()');
    expect(controller).toContain('private const val OCR_INTERVAL_MS = 600L');
    expect(controller).toContain('private const val CENTER_CROP_FRACTION = 0.72f');
    expect(controller).not.toContain('writeBytes');
    expect(controller).not.toMatch(/Log\.[A-Za-z]+\([^)]*\$text/);
    expect(content).toContain('const val minTextChars = 2');
    expect(content).toContain('const val maxMagnification = 3.0f');
    expect(content).toContain('const val speechLanguage = "en-US"');
    expect(panel).toContain('ReaderState.onCopy?.invoke(text)');
    expect(panel).toContain('ReaderState.onSpeak?.invoke(text)');
    expect(activity).toContain('TextToSpeech');
    expect(activity).toContain('ClipData.newPlainText("HoloRead", text)');
    expect(activity).not.toContain('HttpURLConnection');
    expect(activity).not.toContain('URL(');
  });

  it('lowers local word, menu, and ingredient context from @vocabulary_register', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const context = valueEnding(out, 'ContextEngine.kt');
    const panel = valueEnding(out, 'ReaderPanel.kt');

    expect(context).toContain('data class VocabularyEntry');
    expect(context).toContain('term = "aioli"');
    expect(context).toContain('term = "ramen"');
    expect(context).toContain('fun findTerms(text: String)');
    expect(context).toContain('fun explain(term: String)');
    expect(context).toContain('fun analyzeMenu(text: String)');
    expect(context).toContain('Recipes and preparation vary.');
    expect(panel).toContain('ReaderState.onExplain?.invoke(term)');
    expect(panel).toContain('Ingredients vary');
    expect(panel).not.toContain('safe to eat');
  });

  it('uses explicit, on-device translation with auto language identification', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const translation = valueEnding(out, 'TranslationController.kt');
    const panel = valueEnding(out, 'ReaderPanel.kt');
    const activity = valueEnding(out, 'ReaderActivity.kt');

    expect(translation).toContain('LanguageIdentification.getClient()');
    expect(translation).toContain('TranslateLanguage.fromLanguageTag');
    expect(translation).toContain('DownloadConditions.Builder().requireWifi().build()');
    expect(translation).toContain('downloadModelIfNeeded');
    expect(translation).toContain('translator.close()');
    expect(panel).toContain('ReaderState.onTranslate?.invoke');
    expect(activity).toContain('lifecycle.fireTranslationRequested()');
    expect(activity).not.toMatch(/Log\.[A-Za-z]+\([^)]*recognizedText/);
  });

  it('opens allowlisted learning sources externally and shares only a selected term', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const sources = valueEnding(out, 'LearningSourceRouter.kt');
    const panel = valueEnding(out, 'ReaderPanel.kt');
    const activity = valueEnding(out, 'ReaderActivity.kt');

    expect(sources).toContain('"en.wikipedia.org"');
    expect(sources).toContain('"commons.wikimedia.org"');
    expect(sources).toContain('"www.youtube.com"');
    expect(sources).toContain('require(host in ALLOWED_HOSTS)');
    expect(sources).toContain('Uri.Builder()');
    expect(activity).toContain('Intent(Intent.ACTION_VIEW, uri)');
    expect(activity).not.toContain('WebView');
    expect(panel).toContain('ReaderState.selectedTerm');
    expect(panel).not.toContain('onOpenSource?.invoke(kind, ReaderState.recognizedText)');
  });

  it('fails closed when HoloScript names an untrusted learning-source host', () => {
    const unsafe = source.replace('host: "www.youtube.com"', 'host: "video.attacker.example"');
    const unsafeParsed = new HoloCompositionParser().parse(unsafe);
    expect(unsafeParsed.success).toBe(true);
    expect(() => new QuestCompiler().compile(unsafeParsed.ast!, '')).toThrow(
      /unapproved learning source host/
    );
  });

  it('fails closed when translation is not local and explicitly user-triggered', () => {
    const unsafe = source.replace(
      'model_download: "explicit_user_action"\n      download_network: "wifi"\n      local_only: true',
      'model_download: "automatic"\n      download_network: "wifi"\n      local_only: false'
    );
    const unsafeParsed = new HoloCompositionParser().parse(unsafe);
    expect(unsafeParsed.success).toBe(true);
    expect(() => new QuestCompiler().compile(unsafeParsed.ast!, '')).toThrow(
      /translation must be local ML Kit/
    );
  });

  it('carries package, version, and app identity from reader.holo', () => {
    const out = new QuestCompiler().compile(parsed.ast!, '');
    const gradle = valueEnding(out, 'app/build.gradle.kts');
    const manifest = valueEnding(out, 'AndroidManifest.xml');
    const strings = valueEnding(out, 'strings.xml');

    expect(gradle).toContain('namespace = "net.holoscript.holoread"');
    expect(gradle).toContain('applicationId = "net.holoscript.holoread"');
    expect(gradle).toContain('versionCode = 2');
    expect(gradle).toContain('versionName = "0.2.0"');
    expect(manifest).toContain('android:name="net.holoscript.holoread.ReaderActivity"');
    expect(strings).toContain('<string name="app_name">HoloRead</string>');
  });
});

function valueEnding(out: Record<string, string>, suffix: string): string {
  const key = Object.keys(out).find((candidate) => candidate.endsWith(suffix));
  expect(key, `missing emitted ${suffix}`).toBeDefined();
  return out[key!];
}
