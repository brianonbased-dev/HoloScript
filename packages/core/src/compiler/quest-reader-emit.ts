/**
 * HoloScript -> Meta Quest real-world text reader emitter.
 *
 * This is a bounded bridge lowering. Product behavior and policy are collected from the existing
 * sovereign trait vocabulary: @passthrough_camera, @document_ocr, @magnifiable,
 * @speech_synthesis, @vocabulary_register, @translation, @spatial_panel, @consent_gate, and
 * @onboarding. Kotlin owns only Horizon OS, Camera2, ML Kit, Android TTS/clipboard/intents, and
 * Meta Spatial SDK calls.
 */
import type { HoloComposition, HoloObjectTrait, HoloValue } from '../parser/HoloCompositionTypes';

type Obj = Record<string, HoloValue>;
type LearningSourceKind = 'article' | 'image' | 'video';

interface QuestReaderVocabularyEntry {
  term: string;
  category: string;
  definition: string;
  relationships: string[];
  allergenNotice: string;
}

interface QuestReaderLearningSource {
  kind: LearningSourceKind;
  label: string;
  host: string;
  path: string;
}
const vstr = (value: HoloValue | undefined, fallback: string): string =>
  typeof value === 'string' ? value : fallback;
const vnum = (value: HoloValue | undefined, fallback: number): number =>
  typeof value === 'number' ? value : fallback;
const vbool = (value: HoloValue | undefined, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;
const vobj = (value: HoloValue | undefined): Obj =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Obj) : {};
const varr = (value: HoloValue | undefined): HoloValue[] => (Array.isArray(value) ? value : []);

export interface QuestReaderFeatures {
  packageName: string;
  appName: string;
  versionCode: number;
  versionName: string;
  iconBackground: string;
  iconPrimary: string;
  iconAccent: string;
  panelX: number;
  panelY: number;
  panelZ: number;
  panelWidth: number;
  panelHeight: number;
  followDistance: number;
  permission: string;
  cameraSource: number;
  cameraPosition: number;
  frameWidth: number;
  frameHeight: number;
  previewDownscale: number;
  ocrEngine: string;
  ocrIntervalMs: number;
  centerCropFraction: number;
  minTextChars: number;
  localOnly: boolean;
  discardFrames: boolean;
  logTextValues: boolean;
  minMagnification: number;
  maxMagnification: number;
  speechBackend: string;
  speechLanguage: string;
  speechRate: number;
  speechPitch: number;
  title: string;
  tagline: string;
  aimTip: string;
  privacyNote: string;
  enableAction: string;
  scanAction: string;
  copyAction: string;
  speakAction: string;
  explainAction: string;
  translateAction: string;
  sourceAction: string;
  sourceNotice: string;
  translationNote: string;
  consentExplicit: boolean;
  consentPurpose: string;
  learningConsentExplicit: boolean;
  learningConsentPurpose: string;
  vocabularyEntries: QuestReaderVocabularyEntry[];
  relationshipMode: string;
  allergenDisclaimer: string;
  learningSources: QuestReaderLearningSource[];
  openSources: string;
  shareTerm: string;
  translationProvider: string;
  translationSourceLanguage: string;
  translationTargetLanguages: string[];
  translationModelDownload: string;
  translationDownloadNetwork: string;
  translationLocalOnly: boolean;
  translationLogTextValues: boolean;
}

function defaults(): QuestReaderFeatures {
  return {
    packageName: 'net.holoscript.holoread',
    appName: 'HoloRead',
    versionCode: 1,
    versionName: '0.1.0',
    iconBackground: '#0B1020',
    iconPrimary: '#67E8F9',
    iconAccent: '#F8FAFC',
    panelX: 0,
    panelY: 1.3,
    panelZ: 1.5,
    panelWidth: 1.3,
    panelHeight: 1.15,
    followDistance: 1.2,
    permission: 'horizonos.permission.HEADSET_CAMERA',
    cameraSource: 0,
    cameraPosition: 0,
    frameWidth: 1280,
    frameHeight: 1280,
    previewDownscale: 4,
    ocrEngine: '',
    ocrIntervalMs: 600,
    centerCropFraction: 0.72,
    minTextChars: 2,
    localOnly: true,
    discardFrames: true,
    logTextValues: false,
    minMagnification: 1,
    maxMagnification: 3,
    speechBackend: '',
    speechLanguage: 'en-US',
    speechRate: 1,
    speechPitch: 0,
    title: 'HoloRead',
    tagline: 'Read real-world text without leaving mixed reality',
    aimTip: 'Large, well-lit text works best.',
    privacyNote: 'Recognition runs on-device. Frames and text are not transmitted or saved.',
    enableAction: 'Enable camera',
    scanAction: 'Read text',
    copyAction: 'Copy',
    speakAction: 'Listen',
    explainAction: 'Explain',
    translateAction: 'Translate',
    sourceAction: 'Sources',
    sourceNotice: 'Opening a source shares only the selected term with your browser.',
    translationNote: 'Translation stays on-device after its language model is downloaded.',
    consentExplicit: false,
    consentPurpose: '',
    learningConsentExplicit: false,
    learningConsentPurpose: '',
    vocabularyEntries: [],
    relationshipMode: '',
    allergenDisclaimer: '',
    learningSources: [],
    openSources: '',
    shareTerm: '',
    translationProvider: '',
    translationSourceLanguage: '',
    translationTargetLanguages: [],
    translationModelDownload: '',
    translationDownloadNetwork: '',
    translationLocalOnly: true,
    translationLogTextValues: false,
  };
}

export function isQuestReader(composition?: HoloComposition): boolean {
  return (composition?.objects ?? []).some((object) =>
    (object.traits ?? []).some((trait) => trait.name === 'document_ocr')
  );
}

export function collectQuestReaderFeatures(composition: HoloComposition): QuestReaderFeatures {
  const features = defaults();
  const environment = composition.environment?.properties ?? [];
  features.packageName = vstr(
    environment.find((property) => property.key === 'package')?.value as HoloValue,
    features.packageName
  );
  const version = vobj(
    environment.find((property) => property.key === 'version')?.value as HoloValue
  );
  features.versionCode = vnum(version.code, features.versionCode);
  features.versionName = vstr(version.name, features.versionName);
  const icon = vobj(environment.find((property) => property.key === 'icon')?.value as HoloValue);
  features.iconBackground = vstr(icon.background, features.iconBackground);
  features.iconPrimary = vstr(icon.primary, features.iconPrimary);
  features.iconAccent = vstr(icon.accent, features.iconAccent);

  for (const object of composition.objects ?? []) {
    for (const trait of (object.traits ?? []) as HoloObjectTrait[]) {
      const config: Obj = trait.config ?? {};
      switch (trait.name) {
        case 'passthrough_camera':
          features.permission = vstr(config.permission, features.permission);
          features.cameraSource = vnum(config.camera_source, features.cameraSource);
          features.cameraPosition = vnum(config.camera_position, features.cameraPosition);
          features.frameWidth = vnum(config.frame_width, features.frameWidth);
          features.frameHeight = vnum(config.frame_height, features.frameHeight);
          features.previewDownscale = vnum(config.preview_downscale, features.previewDownscale);
          break;
        case 'document_ocr':
          features.ocrEngine = vstr(config.engine, features.ocrEngine);
          features.ocrIntervalMs = vnum(config.interval_ms, features.ocrIntervalMs);
          features.centerCropFraction = vnum(
            config.center_crop_fraction,
            features.centerCropFraction
          );
          features.minTextChars = vnum(config.min_text_chars, features.minTextChars);
          features.localOnly = vbool(config.local_only, features.localOnly);
          features.discardFrames = vbool(config.discard_frames, features.discardFrames);
          features.logTextValues = vbool(config.log_text_values, features.logTextValues);
          if (vstr(config.output_format, 'text') !== 'text') {
            throw new Error(
              'quest-reader-emit: Quest reader v1 requires @document_ocr.output_format="text"'
            );
          }
          break;
        case 'magnifiable':
          features.minMagnification = vnum(config.min_scale, features.minMagnification);
          features.maxMagnification = vnum(config.max_scale, features.maxMagnification);
          break;
        case 'speech_synthesis':
          features.speechBackend = vstr(config.backend, features.speechBackend);
          features.speechLanguage = vstr(config.language, features.speechLanguage);
          features.speechRate = vnum(config.speed, features.speechRate);
          features.speechPitch = vnum(config.pitch, features.speechPitch);
          break;
        case 'vocabulary_register':
          features.relationshipMode = vstr(config.relationship_mode, features.relationshipMode);
          features.allergenDisclaimer = vstr(
            config.allergen_disclaimer,
            features.allergenDisclaimer
          );
          features.vocabularyEntries = varr(config.seed_entries).map((value) => {
            const entry = vobj(value);
            return {
              term: vstr(entry.term, ''),
              category: vstr(entry.category, ''),
              definition: vstr(entry.definition, ''),
              relationships: varr(entry.relationships).filter(
                (relationship): relationship is string => typeof relationship === 'string'
              ),
              allergenNotice: vstr(entry.allergen_notice, ''),
            };
          });
          features.learningSources = varr(config.source_templates).map((value) => {
            const source = vobj(value);
            return {
              kind: vstr(source.kind, '') as LearningSourceKind,
              label: vstr(source.label, ''),
              host: vstr(source.host, ''),
              path: vstr(source.path, ''),
            };
          });
          features.openSources = vstr(config.open_sources, features.openSources);
          features.shareTerm = vstr(config.share_term, features.shareTerm);
          break;
        case 'translation':
          features.translationProvider = vstr(config.provider, features.translationProvider);
          features.translationSourceLanguage = vstr(
            config.source_language,
            features.translationSourceLanguage
          );
          features.translationTargetLanguages = varr(config.target_languages).filter(
            (language): language is string => typeof language === 'string'
          );
          features.translationModelDownload = vstr(
            config.model_download,
            features.translationModelDownload
          );
          features.translationDownloadNetwork = vstr(
            config.download_network,
            features.translationDownloadNetwork
          );
          features.translationLocalOnly = vbool(config.local_only, features.translationLocalOnly);
          features.translationLogTextValues = vbool(
            config.log_text_values,
            features.translationLogTextValues
          );
          break;
        case 'spatial_panel': {
          const place = vobj(config.place);
          const size = vobj(config.size);
          features.panelX = vnum(place.x, features.panelX);
          features.panelY = vnum(place.y, features.panelY);
          features.panelZ = vnum(place.z, features.panelZ);
          features.panelWidth = vnum(size.width, features.panelWidth);
          features.panelHeight = vnum(size.height, features.panelHeight);
          features.followDistance = vnum(config.follow_distance, features.followDistance);
          features.appName = vstr(config.title, features.appName);
          break;
        }
        case 'consent_gate': {
          const scopes = varr(config.scope).filter(
            (scope): scope is string => typeof scope === 'string'
          );
          if (scopes.includes('camera_processing')) {
            features.consentExplicit = vbool(config.require_explicit, false);
            features.consentPurpose = vstr(config.purpose, '');
          }
          if (
            scopes.includes('translation_model_download') &&
            scopes.includes('external_learning_sources')
          ) {
            features.learningConsentExplicit = vbool(config.require_explicit, false);
            features.learningConsentPurpose = vstr(config.purpose, '');
          }
          break;
        }
        case 'onboarding':
          features.title = vstr(config.title, features.title);
          features.tagline = vstr(config.tagline, features.tagline);
          features.aimTip = vstr(config.aim_tip, features.aimTip);
          features.privacyNote = vstr(config.privacy_note, features.privacyNote);
          features.enableAction = vstr(config.start_action, features.enableAction);
          features.scanAction = vstr(config.scan_action, features.scanAction);
          features.copyAction = vstr(config.copy_action, features.copyAction);
          features.speakAction = vstr(config.speak_action, features.speakAction);
          features.explainAction = vstr(config.explain_action, features.explainAction);
          features.translateAction = vstr(config.translate_action, features.translateAction);
          features.sourceAction = vstr(config.source_action, features.sourceAction);
          features.sourceNotice = vstr(config.source_notice, features.sourceNotice);
          features.translationNote = vstr(config.translation_note, features.translationNote);
          break;
      }
    }
  }
  validateFeatures(features);
  return features;
}

function validateFeatures(features: QuestReaderFeatures): void {
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(features.packageName)) {
    throw new Error(`quest-reader-emit: invalid Android package "${features.packageName}"`);
  }
  if (features.ocrEngine !== 'mlkit_bundled') {
    throw new Error(
      'quest-reader-emit: Quest v1 supports only @document_ocr.engine="mlkit_bundled"'
    );
  }
  if (!features.localOnly || !features.discardFrames || features.logTextValues) {
    throw new Error(
      'quest-reader-emit: Quest OCR must be local_only, discard_frames, and log_text_values=false'
    );
  }
  if (!features.consentExplicit || features.consentPurpose.trim().length === 0) {
    throw new Error(
      'quest-reader-emit: camera_processing requires explicit consent and a non-empty purpose'
    );
  }
  if (features.speechBackend !== 'android_tts') {
    throw new Error(
      'quest-reader-emit: Quest v1 supports only @speech_synthesis.backend="android_tts"'
    );
  }
  if (
    !Number.isFinite(features.ocrIntervalMs) ||
    features.ocrIntervalMs < 250 ||
    features.ocrIntervalMs > 5000
  ) {
    throw new Error('quest-reader-emit: OCR interval must be between 250 and 5000 ms');
  }
  if (
    !Number.isFinite(features.centerCropFraction) ||
    features.centerCropFraction < 0.2 ||
    features.centerCropFraction > 1
  ) {
    throw new Error('quest-reader-emit: center_crop_fraction must be between 0.2 and 1.0');
  }
  if (
    !Number.isFinite(features.maxMagnification) ||
    features.maxMagnification < features.minMagnification ||
    features.maxMagnification > 8
  ) {
    throw new Error('quest-reader-emit: invalid magnification bounds');
  }
  if (
    features.relationshipMode !== 'menu_ingredient_graph' ||
    features.vocabularyEntries.length === 0 ||
    features.allergenDisclaimer.trim().length === 0
  ) {
    throw new Error(
      'quest-reader-emit: @vocabulary_register requires menu_ingredient_graph entries and an allergen disclaimer'
    );
  }
  const terms = new Set<string>();
  for (const entry of features.vocabularyEntries) {
    const term = entry.term.trim().toLocaleLowerCase('en-US');
    if (
      term.length === 0 ||
      entry.category.trim().length === 0 ||
      entry.definition.trim().length === 0 ||
      entry.relationships.length === 0 ||
      entry.allergenNotice.trim().length === 0
    ) {
      throw new Error('quest-reader-emit: every vocabulary entry requires complete context');
    }
    if (terms.has(term)) {
      throw new Error(`quest-reader-emit: duplicate vocabulary term "${entry.term}"`);
    }
    terms.add(term);
  }
  const approvedSources = new Map<LearningSourceKind, string>([
    ['article', 'en.wikipedia.org'],
    ['image', 'commons.wikimedia.org'],
    ['video', 'www.youtube.com'],
  ]);
  if (
    features.learningSources.length !== approvedSources.size ||
    features.openSources !== 'external_browser' ||
    features.shareTerm !== 'explicit_user_action' ||
    !features.learningConsentExplicit ||
    features.learningConsentPurpose.trim().length === 0
  ) {
    throw new Error(
      'quest-reader-emit: learning sources require one approved source per kind, an external browser, and explicit term sharing'
    );
  }
  for (const source of features.learningSources) {
    if (approvedSources.get(source.kind) !== source.host) {
      throw new Error(`quest-reader-emit: unapproved learning source host "${source.host}"`);
    }
    if (
      source.label.trim().length === 0 ||
      !source.path.startsWith('/') ||
      !source.path.includes('{term}')
    ) {
      throw new Error('quest-reader-emit: invalid learning source template');
    }
  }
  const supportedTranslationTargets = new Set(['en', 'es', 'fr', 'de', 'it', 'ja', 'ko', 'zh']);
  if (
    features.translationProvider !== 'mlkit_on_device' ||
    features.translationSourceLanguage !== 'auto' ||
    features.translationModelDownload !== 'explicit_user_action' ||
    features.translationDownloadNetwork !== 'wifi' ||
    !features.translationLocalOnly ||
    features.translationLogTextValues ||
    features.translationTargetLanguages.length === 0 ||
    features.translationTargetLanguages.some(
      (language) => !supportedTranslationTargets.has(language)
    )
  ) {
    throw new Error(
      'quest-reader-emit: translation must be local ML Kit, auto-detected, explicit, Wi-Fi-only, and use supported targets'
    );
  }
}

const kotlinString = (value: string): string =>
  '"' +
  value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n') +
  '"';
const floatLiteral = (value: number): string =>
  Number.isInteger(value) ? `${value}.0f` : `${value}f`;
const xmlEscape = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export function emitQuestReaderFiles(composition: HoloComposition): Record<string, string> {
  const features = collectQuestReaderFeatures(composition);
  const sourceDirectory = `app/src/main/java/${features.packageName.replace(/\./g, '/')}`;
  return {
    [`${sourceDirectory}/ReaderContent.kt`]: emitReaderContent(features),
    [`${sourceDirectory}/TextRecognizer.kt`]: emitTextRecognizer(features),
    [`${sourceDirectory}/PassthroughCameraController.kt`]: emitCameraController(features),
    [`${sourceDirectory}/ContextEngine.kt`]: emitContextEngine(features),
    [`${sourceDirectory}/TranslationController.kt`]: emitTranslationController(features),
    [`${sourceDirectory}/LearningSourceRouter.kt`]: emitLearningSourceRouter(features),
    [`${sourceDirectory}/ReaderPanel.kt`]: emitReaderPanel(features),
    [`${sourceDirectory}/ReaderActivity.kt`]: emitReaderActivity(features),
    [`app/src/test/java/${features.packageName.replace(/\./g, '/')}/ContextEngineTest.kt`]:
      emitContextEngineTest(features),
    'app/src/main/res/values/strings.xml': emitStrings(features),
    'app/src/main/res/values/styles.xml': emitStyles(),
    'app/src/main/res/values/ids.xml': emitIds(),
    'app/src/main/res/drawable/ic_launcher.xml': emitIcon(features),
    'app/build.gradle.kts': emitBuildGradle(features),
    'app/proguard-rules.pro': emitProguard(),
    'app/src/main/AndroidManifest.xml': emitManifest(features),
  };
}

function emitReaderContent(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo by QuestCompiler. DO NOT EDIT.
package ${features.packageName}

object ReaderContent {
  const val appName = ${kotlinString(features.appName)}
  const val title = ${kotlinString(features.title)}
  const val tagline = ${kotlinString(features.tagline)}
  const val aimTip = ${kotlinString(features.aimTip)}
  const val privacyNote = ${kotlinString(features.privacyNote)}
  const val enableAction = ${kotlinString(features.enableAction)}
  const val scanAction = ${kotlinString(features.scanAction)}
  const val copyAction = ${kotlinString(features.copyAction)}
  const val speakAction = ${kotlinString(features.speakAction)}
  const val explainAction = ${kotlinString(features.explainAction)}
  const val translateAction = ${kotlinString(features.translateAction)}
  const val sourceAction = ${kotlinString(features.sourceAction)}
  const val sourceNotice = ${kotlinString(features.sourceNotice)}
  const val translationNote = ${kotlinString(features.translationNote)}
  const val allergenDisclaimer = ${kotlinString(features.allergenDisclaimer)}
  const val minTextChars = ${Math.floor(features.minTextChars)}
  const val minMagnification = ${floatLiteral(features.minMagnification)}
  const val maxMagnification = ${floatLiteral(features.maxMagnification)}
  const val speechLanguage = ${kotlinString(features.speechLanguage)}
  const val speechRate = ${floatLiteral(features.speechRate)}
  const val speechPitch = ${floatLiteral(1 + features.speechPitch)}
  const val panelX = ${floatLiteral(features.panelX)}
  const val panelY = ${floatLiteral(features.panelY)}
  const val panelZ = ${floatLiteral(features.panelZ)}
  val targetLanguages = listOf(${features.translationTargetLanguages
    .map((language) => kotlinString(language))
    .join(', ')})
}
`;
}

function emitTextRecognizer(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo @document_ocr(engine="mlkit_bundled"). DO NOT EDIT.
package ${features.packageName}

import android.graphics.Bitmap
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

class TextRecognizer : AutoCloseable {
  private val client = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

  fun recognize(
      bitmap: Bitmap,
      onResult: (String) -> Unit,
      onError: (String) -> Unit,
  ) {
    val image = InputImage.fromBitmap(bitmap, 0)
    client.process(image)
        .addOnSuccessListener { result -> onResult(result.text.trim()) }
        .addOnFailureListener { error -> onError(error.message ?: "Text recognition failed") }
  }

  override fun close() {
    client.close()
  }
}
`;
}

function emitContextEngine(features: QuestReaderFeatures): string {
  const entries = features.vocabularyEntries
    .map(
      (entry) => `    VocabularyEntry(
        term = ${kotlinString(entry.term)},
        category = ${kotlinString(entry.category)},
        definition = ${kotlinString(entry.definition)},
        relationships = listOf(${entry.relationships
          .map((relationship) => kotlinString(relationship))
          .join(', ')}),
        allergenNotice = ${kotlinString(entry.allergenNotice)},
    )`
    )
    .join(',\n');

  return `// @generated from reader.holo @vocabulary_register. DO NOT EDIT.
package ${features.packageName}

import java.util.Locale

data class VocabularyEntry(
    val term: String,
    val category: String,
    val definition: String,
    val relationships: List<String>,
    val allergenNotice: String,
)

object ContextEngine {
  const val allergenDisclaimer = ${kotlinString(features.allergenDisclaimer)}
  private val entries =
      listOf(
${entries}
      )

  fun findTerms(text: String): List<String> {
    val known = entries.filter { containsTerm(text, it.term) }.map { it.term }
    val words =
        normalized(text)
            .split(' ')
            .asSequence()
            .filter { it.length >= 3 }
            .filterNot { it in STOP_WORDS }
            .distinct()
            .take(12)
            .toList()
    return (known + words).distinct().take(12)
  }

  fun explain(term: String): VocabularyEntry? =
      entries.firstOrNull { normalized(it.term) == normalized(term) }

  fun analyzeMenu(text: String): List<VocabularyEntry> =
      entries.filter { containsTerm(text, it.term) }

  private fun containsTerm(text: String, term: String): Boolean =
      (" " + normalized(text) + " ").contains(" " + normalized(term) + " ")

  private fun normalized(value: String): String =
      value
          .lowercase(Locale.ROOT)
          .replace(Regex("[^\\\\p{L}\\\\p{M}\\\\p{N}]+"), " ")
          .trim()
          .replace(Regex("\\\\s+"), " ")

  private val STOP_WORDS =
      setOf("and", "the", "with", "from", "for", "your", "this", "that", "are", "our")
}
`;
}

function emitTranslationController(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo @translation(provider="mlkit_on_device"). DO NOT EDIT.
package ${features.packageName}

import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.nl.languageid.LanguageIdentification
import com.google.mlkit.nl.languageid.LanguageIdentifier
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions

class TranslationController : AutoCloseable {
  private val languageIdentifier: LanguageIdentifier = LanguageIdentification.getClient()
  private var activeTranslator: Translator? = null

  fun translate(
      text: String,
      targetTag: String,
      onStatus: (String) -> Unit,
      onSuccess: (String) -> Unit,
      onError: (String) -> Unit,
  ) {
    if (text.isBlank()) {
      onError("There is no recognized text to translate")
      return
    }
    if (targetTag !in ReaderContent.targetLanguages) {
      onError("That translation language is not allowed by this HoloScript program")
      return
    }
    languageIdentifier
        .identifyLanguage(text)
        .addOnSuccessListener { identifiedTag ->
          val sourceTag = if (identifiedTag == "und") "en" else identifiedTag
          val sourceLanguage = TranslateLanguage.fromLanguageTag(sourceTag)
          val targetLanguage = TranslateLanguage.fromLanguageTag(targetTag)
          if (sourceLanguage == null || targetLanguage == null) {
            onError("This language pair is not supported on this device")
          } else if (sourceLanguage == targetLanguage) {
            onStatus("The text is already in the selected language")
            onSuccess(text)
          } else {
            translateWithModel(text, sourceLanguage, targetLanguage, onStatus, onSuccess, onError)
          }
        }
        .addOnFailureListener { onError("Language detection failed") }
  }

  private fun translateWithModel(
      text: String,
      sourceLanguage: String,
      targetLanguage: String,
      onStatus: (String) -> Unit,
      onSuccess: (String) -> Unit,
      onError: (String) -> Unit,
  ) {
    activeTranslator?.close()
    val options =
        TranslatorOptions.Builder()
            .setSourceLanguage(sourceLanguage)
            .setTargetLanguage(targetLanguage)
            .build()
    val translator = Translation.getClient(options)
    activeTranslator = translator
    val conditions = DownloadConditions.Builder().requireWifi().build()
    onStatus("Preparing an on-device language model over Wi-Fi")
    translator
        .downloadModelIfNeeded(conditions)
        .addOnSuccessListener {
          onStatus("Translating on device")
          translator
              .translate(text)
              .addOnSuccessListener { translated ->
                onSuccess(translated)
                release(translator)
              }
              .addOnFailureListener {
                onError("Translation failed")
                release(translator)
              }
        }
        .addOnFailureListener {
          onError("Language model download failed. Connect to Wi-Fi and try again.")
          release(translator)
        }
  }

  private fun release(translator: Translator) {
    translator.close()
    if (activeTranslator === translator) activeTranslator = null
  }

  override fun close() {
    languageIdentifier.close()
    activeTranslator?.close()
    activeTranslator = null
  }
}
`;
}

function emitContextEngineTest(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo @vocabulary_register acceptance contract. DO NOT EDIT.
package ${features.packageName}

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ContextEngineTest {
  @Test
  fun menuTermsConnectToIngredientContext() {
    val terms = ContextEngine.findTerms("Ramen with tahini")
    val insights = ContextEngine.analyzeMenu("Ramen with tahini")

    assertTrue(terms.contains("ramen"))
    assertTrue(terms.contains("tahini"))
    assertEquals(listOf("ramen", "tahini"), insights.map { it.term })
    assertTrue(insights.first().relationships.isNotEmpty())
  }

  @Test
  fun unknownWordsAbstainLocally() {
    assertEquals(null, ContextEngine.explain("not-a-menu-term"))
  }
}
`;
}

function emitLearningSourceRouter(features: QuestReaderFeatures): string {
  const templates = features.learningSources
    .map((source) => {
      const [path, queryString = ''] = source.path.split('?', 2);
      const query = Array.from(new URLSearchParams(queryString).entries())
        .map(([key, value]) => `${kotlinString(key)} to ${kotlinString(value.replace(/\+/g, ' '))}`)
        .join(', ');
      return `    SourceTemplate(
        kind = ${kotlinString(source.kind)},
        label = ${kotlinString(source.label)},
        host = ${kotlinString(source.host)},
        path = ${kotlinString(path)},
        query = listOf(${query}),
    )`;
    })
    .join(',\n');
  const hosts = features.learningSources.map((source) => kotlinString(source.host)).join(', ');

  return `// @generated from reader.holo trusted source templates. DO NOT EDIT.
package ${features.packageName}

import android.net.Uri

data class LearningSource(val kind: String, val label: String, val uri: Uri)

private data class SourceTemplate(
    val kind: String,
    val label: String,
    val host: String,
    val path: String,
    val query: List<Pair<String, String>>,
)

object LearningSourceRouter {
  private val ALLOWED_HOSTS = setOf(${hosts})
  private val templates =
      listOf(
${templates}
      )

  fun sourcesFor(term: String): List<LearningSource> {
    require(term.isNotBlank()) { "A selected term is required" }
    return templates.map { template ->
      LearningSource(template.kind, template.label, buildUri(template, term))
    }
  }

  fun uriFor(kind: String, term: String): Uri =
      sourcesFor(term).firstOrNull { it.kind == kind }?.uri
          ?: error("Unknown learning source kind")

  private fun buildUri(template: SourceTemplate, term: String): Uri {
    val host = template.host.lowercase()
    require(host in ALLOWED_HOSTS) { "Learning source host is not allowed" }
    val builder = Uri.Builder().scheme("https").authority(host).path(template.path)
    template.query.forEach { (key, value) ->
      builder.appendQueryParameter(key, value.replace("{term}", term))
    }
    return builder.build()
  }
}
`;
}

function emitCameraController(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo @passthrough_camera + @document_ocr. DO NOT EDIT.
package ${features.packageName}

import android.content.Context
import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CaptureRequest
import android.media.Image
import android.media.ImageReader
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import java.util.concurrent.atomic.AtomicBoolean

class PassthroughCameraController(
    context: Context,
    private val onPreview: (Bitmap) -> Unit,
    private val onCaptureReady: () -> Unit,
    private val onRecognized: (String) -> Unit,
    private val onError: (String) -> Unit,
) {
  companion object {
    private const val TAG = "HoloReadCamera"
    private const val KEY_CAMERA_SOURCE = "com.meta.extra_metadata.camera_source"
    private const val KEY_CAMERA_POSITION = "com.meta.extra_metadata.position"
    private const val CAMERA_SOURCE = ${features.cameraSource}
    private const val CAMERA_POSITION = ${features.cameraPosition}
    private const val OCR_INTERVAL_MS = ${Math.floor(features.ocrIntervalMs)}L
    private const val CENTER_CROP_FRACTION = ${floatLiteral(features.centerCropFraction)}
    private const val PREVIEW_DOWNSCALE = ${Math.floor(features.previewDownscale)}
    private const val FALLBACK_WIDTH = ${Math.floor(features.frameWidth)}
    private const val FALLBACK_HEIGHT = ${Math.floor(features.frameHeight)}
  }

  private val cameraManager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
  private val recognizer = TextRecognizer()
  private val recognitionRequested = AtomicBoolean(false)
  private val recognitionInFlight = AtomicBoolean(false)
  private var thread: HandlerThread? = null
  private var handler: Handler? = null
  private var device: CameraDevice? = null
  private var session: CameraCaptureSession? = null
  private var reader: ImageReader? = null
  private var captureWidth = FALLBACK_WIDTH
  private var captureHeight = FALLBACK_HEIGHT
  private var lastRecognitionMs = 0L
  private var lastPreviewMs = 0L

  fun requestRecognition(): Boolean {
    if (recognitionInFlight.get()) return false
    return recognitionRequested.compareAndSet(false, true)
  }

  fun start() {
    thread = HandlerThread("holoread-camera").also { it.start() }
    handler = Handler(thread!!.looper)
    val cameraId = selectPassthroughCameraId()
    if (cameraId == null) {
      onError("No passthrough camera found. HoloRead requires Quest 3 or Quest 3S.")
      return
    }
    pickLargestYuvSize(cameraId)?.let { size ->
      captureWidth = size.width
      captureHeight = size.height
    }
    openCamera(cameraId)
  }

  private fun pickLargestYuvSize(cameraId: String): Size? =
      try {
        cameraManager.getCameraCharacteristics(cameraId)
            .get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
            ?.getOutputSizes(ImageFormat.YUV_420_888)
            ?.maxByOrNull { size -> size.width.toLong() * size.height }
      } catch (error: Exception) {
        Log.w(TAG, "Camera size query failed; using declared fallback", error)
        null
      }

  private fun selectPassthroughCameraId(): String? {
    var sourceMatch: String? = null
    for (id in cameraManager.cameraIdList) {
      val characteristics = cameraManager.getCameraCharacteristics(id)
      val source = readVendorByte(characteristics, KEY_CAMERA_SOURCE)
      val position = readVendorByte(characteristics, KEY_CAMERA_POSITION)
      if (source?.toInt() == CAMERA_SOURCE) {
        if (sourceMatch == null) sourceMatch = id
        if (position?.toInt() == CAMERA_POSITION) return id
      }
    }
    return sourceMatch
        ?: cameraManager.cameraIdList.firstOrNull { id ->
          cameraManager.getCameraCharacteristics(id)
              .get(CameraCharacteristics.LENS_FACING) == CameraCharacteristics.LENS_FACING_BACK
        }
        ?: cameraManager.cameraIdList.firstOrNull()
  }

  private fun readVendorByte(
      characteristics: CameraCharacteristics,
      name: String,
  ): Byte? =
      try {
        characteristics.get(CameraCharacteristics.Key(name, Byte::class.javaObjectType))
      } catch (_: IllegalArgumentException) {
        null
      }

  @Suppress("MissingPermission")
  private fun openCamera(cameraId: String) {
    reader =
        ImageReader.newInstance(captureWidth, captureHeight, ImageFormat.YUV_420_888, 2).apply {
          setOnImageAvailableListener({ source -> onFrame(source) }, handler)
        }
    cameraManager.openCamera(
        cameraId,
        object : CameraDevice.StateCallback() {
          override fun onOpened(camera: CameraDevice) {
            device = camera
            createSession(camera)
          }
          override fun onDisconnected(camera: CameraDevice) {
            camera.close()
            device = null
          }
          override fun onError(camera: CameraDevice, error: Int) {
            onError("Camera error " + error)
            camera.close()
            device = null
          }
        },
        handler,
    )
  }

  private fun createSession(camera: CameraDevice) {
    val surface = reader!!.surface
    camera.createCaptureSession(
        listOf(surface),
        object : CameraCaptureSession.StateCallback() {
          override fun onConfigured(configured: CameraCaptureSession) {
            session = configured
            val request =
                camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                  addTarget(surface)
                  set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF)
                }
            configured.setRepeatingRequest(request.build(), null, handler)
          }
          override fun onConfigureFailed(configured: CameraCaptureSession) {
            onError("Could not configure the passthrough camera")
          }
        },
        handler,
    )
  }

  private fun onFrame(source: ImageReader) {
    val image: Image = source.acquireLatestImage() ?: return
    try {
      val packedY = packYPlane(image)
      val now = System.currentTimeMillis()
      if (now - lastPreviewMs >= 100L) {
        lastPreviewMs = now
        onPreview(buildPreview(packedY, image.width, image.height))
      }
      if (!recognitionRequested.get() || recognitionInFlight.get()) return
      if (now - lastRecognitionMs < OCR_INTERVAL_MS) return
      if (!recognitionRequested.compareAndSet(true, false)) return
      recognitionInFlight.set(true)
      lastRecognitionMs = now
      onCaptureReady()
      val crop = buildCenterCrop(packedY, image.width, image.height)
      recognizer.recognize(
          crop,
          onResult = { text ->
            crop.recycle()
            recognitionInFlight.set(false)
            onRecognized(text)
          },
          onError = { message ->
            crop.recycle()
            recognitionInFlight.set(false)
            onError(message)
          },
      )
    } catch (error: Exception) {
      recognitionRequested.set(false)
      recognitionInFlight.set(false)
      onError("Camera frame processing failed")
      Log.w(TAG, "Camera frame processing failed", error)
    } finally {
      image.close()
    }
  }

  private fun packYPlane(image: Image): ByteArray {
    val plane = image.planes[0]
    val buffer = plane.buffer
    val width = image.width
    val height = image.height
    val rowStride = plane.rowStride
    val output = ByteArray(width * height)
    val row = ByteArray(rowStride)
    var destination = 0
    for (index in 0 until height) {
      buffer.position(index * rowStride)
      val count = minOf(rowStride, buffer.remaining())
      buffer.get(row, 0, count)
      System.arraycopy(row, 0, output, destination, width)
      destination += width
    }
    return output
  }

  private fun buildPreview(y: ByteArray, width: Int, height: Int): Bitmap {
    val step = maxOf(1, PREVIEW_DOWNSCALE)
    val previewWidth = maxOf(1, width / step)
    val previewHeight = maxOf(1, height / step)
    val pixels = IntArray(previewWidth * previewHeight)
    var destination = 0
    for (row in 0 until previewHeight) {
      val sourceRow = row * step * width
      for (column in 0 until previewWidth) {
        val value = y[sourceRow + column * step].toInt() and 0xff
        pixels[destination++] =
            (0xff shl 24) or (value shl 16) or (value shl 8) or value
      }
    }
    return Bitmap.createBitmap(
        pixels,
        previewWidth,
        previewHeight,
        Bitmap.Config.ARGB_8888,
    )
  }

  private fun buildCenterCrop(y: ByteArray, width: Int, height: Int): Bitmap {
    val cropWidth = maxOf(1, (width * CENTER_CROP_FRACTION).toInt())
    val cropHeight = maxOf(1, (height * CENTER_CROP_FRACTION).toInt())
    val left = (width - cropWidth) / 2
    val top = (height - cropHeight) / 2
    val pixels = IntArray(cropWidth * cropHeight)
    var destination = 0
    for (row in 0 until cropHeight) {
      val sourceRow = (top + row) * width + left
      for (column in 0 until cropWidth) {
        val value = y[sourceRow + column].toInt() and 0xff
        pixels[destination++] =
            (0xff shl 24) or (value shl 16) or (value shl 8) or value
      }
    }
    return Bitmap.createBitmap(pixels, cropWidth, cropHeight, Bitmap.Config.ARGB_8888)
  }

  fun stop() {
    recognitionRequested.set(false)
    recognitionInFlight.set(false)
    try {
      session?.stopRepeating()
    } catch (_: Exception) {}
    session?.close()
    session = null
    device?.close()
    device = null
    reader?.close()
    reader = null
    recognizer.close()
    thread?.quitSafely()
    thread = null
    handler = null
  }
}
`;
}

function emitReaderPanel(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo UI, @magnifiable, and @speech_synthesis. DO NOT EDIT.
package ${features.packageName}

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meta.spatial.uiset.theme.LocalColorScheme
import com.meta.spatial.uiset.theme.SpatialTheme
import com.meta.spatial.uiset.theme.darkSpatialColorScheme

enum class ReaderScreen { CONSENT, READY, WORKING, RESULT, ERROR }

object ReaderState {
  var screen by mutableStateOf(ReaderScreen.CONSENT)
  var status by mutableStateOf("Camera access is off")
  var preview by mutableStateOf<ImageBitmap?>(null)
  var recognizedText by mutableStateOf("")
  var magnification by mutableFloatStateOf(ReaderContent.minMagnification)
  var contextTerms by mutableStateOf<List<String>>(emptyList())
  var selectedTerm by mutableStateOf("")
  var explanation by mutableStateOf("")
  var menuInsights by mutableStateOf<List<VocabularyEntry>>(emptyList())
  var selectedTargetLanguage by mutableStateOf("es")
  var translatedText by mutableStateOf("")
  var translationStatus by mutableStateOf("")
  var onEnable: (() -> Unit)? = null
  var onRead: (() -> Unit)? = null
  var onCopy: ((String) -> Unit)? = null
  var onSpeak: ((String) -> Unit)? = null
  var onExplain: ((String) -> Unit)? = null
  var onTranslate: ((String, String) -> Unit)? = null
  var onOpenSource: ((String, String) -> Unit)? = null

  fun updatePreview(bitmap: Bitmap) {
    preview = bitmap.asImageBitmap()
  }
}

@Composable
fun ReaderPanel() {
  SpatialTheme(colorScheme = darkSpatialColorScheme()) {
    Column(
        modifier =
            Modifier.fillMaxSize()
                .clip(SpatialTheme.shapes.large)
                .background(brush = LocalColorScheme.current.panel)
                .verticalScroll(rememberScrollState())
                .padding(34.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Top,
    ) {
      Text(
          ReaderContent.title,
          fontSize = 34.sp,
          fontWeight = FontWeight.Bold,
          color = Color(0xFF67E8F9),
      )
      Spacer(Modifier.size(8.dp))
      Text(ReaderContent.tagline, fontSize = 18.sp, textAlign = TextAlign.Center)
      Spacer(Modifier.size(20.dp))
      when (ReaderState.screen) {
        ReaderScreen.CONSENT -> ConsentScreen()
        ReaderScreen.READY -> CaptureScreen(working = false)
        ReaderScreen.WORKING -> CaptureScreen(working = true)
        ReaderScreen.RESULT -> ResultScreen()
        ReaderScreen.ERROR -> ErrorScreen()
      }
    }
  }
}

@Composable
private fun ConsentScreen() {
  Text(ReaderContent.privacyNote, fontSize = 18.sp, textAlign = TextAlign.Center)
  Spacer(Modifier.size(14.dp))
  Text(ReaderContent.aimTip, fontSize = 16.sp, textAlign = TextAlign.Center)
  Spacer(Modifier.size(24.dp))
  Button(onClick = { ReaderState.onEnable?.invoke() }) { Text(ReaderContent.enableAction) }
}

@Composable
private fun CaptureScreen(working: Boolean) {
  Box(
      modifier =
          Modifier.fillMaxWidth()
              .height(330.dp)
              .clip(RoundedCornerShape(18.dp))
              .background(Color.Black)
              .border(3.dp, Color(0xFF67E8F9), RoundedCornerShape(18.dp)),
      contentAlignment = Alignment.Center,
  ) {
    ReaderState.preview?.let { preview ->
      Image(
          bitmap = preview,
          contentDescription = "Passthrough text targeting preview",
          modifier = Modifier.fillMaxSize(),
          contentScale = ContentScale.Crop,
      )
    }
    Box(
        modifier =
            Modifier.fillMaxWidth(0.72f)
                .height(230.dp)
                .border(2.dp, Color.White, RoundedCornerShape(10.dp))
    )
  }
  Spacer(Modifier.size(14.dp))
  Text(
      if (working) "Reading on device..." else ReaderState.status,
      fontSize = 17.sp,
      textAlign = TextAlign.Center,
  )
  Spacer(Modifier.size(16.dp))
  Button(enabled = !working, onClick = { ReaderState.onRead?.invoke() }) {
    Text(ReaderContent.scanAction)
  }
}

@Composable
private fun ResultScreen() {
  Text(
      ReaderState.recognizedText,
      modifier = Modifier.fillMaxWidth(),
      fontSize = (24f * ReaderState.magnification).sp,
      lineHeight = (30f * ReaderState.magnification).sp,
      textAlign = TextAlign.Start,
  )
  Spacer(Modifier.size(20.dp))
  val text = ReaderState.recognizedText
  Row(
      modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
      horizontalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    Button(onClick = { ReaderState.onCopy?.invoke(text) }) { Text(ReaderContent.copyAction) }
    Button(onClick = { ReaderState.onSpeak?.invoke(text) }) { Text(ReaderContent.speakAction) }
    Button(
        enabled = ReaderState.magnification < ReaderContent.maxMagnification,
        onClick = {
          ReaderState.magnification =
              minOf(ReaderContent.maxMagnification, ReaderState.magnification + 0.5f)
        },
    ) {
      Text("Bigger")
    }
    Button(
        enabled = ReaderState.magnification > ReaderContent.minMagnification,
        onClick = {
          ReaderState.magnification =
              maxOf(ReaderContent.minMagnification, ReaderState.magnification - 0.5f)
        },
    ) {
      Text("Smaller")
    }
  }
  Spacer(Modifier.size(12.dp))
  Text(
      "Words and context",
      modifier = Modifier.fillMaxWidth(),
      fontSize = 21.sp,
      fontWeight = FontWeight.Bold,
  )
  Spacer(Modifier.size(8.dp))
  Row(
      modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    ReaderState.contextTerms.forEach { term ->
      Button(
          onClick = {
            ReaderState.selectedTerm = term
            ReaderState.onExplain?.invoke(term)
          }
      ) {
        Text(term)
      }
    }
  }
  if (ReaderState.selectedTerm.isNotBlank()) {
    Spacer(Modifier.size(10.dp))
    Text(
        ReaderState.selectedTerm,
        modifier = Modifier.fillMaxWidth(),
        fontSize = 20.sp,
        fontWeight = FontWeight.Bold,
        color = Color(0xFF67E8F9),
    )
    Text(
        ReaderState.explanation,
        modifier = Modifier.fillMaxWidth(),
        fontSize = 17.sp,
    )
    Spacer(Modifier.size(8.dp))
    Text(
        ReaderContent.sourceNotice,
        modifier = Modifier.fillMaxWidth(),
        fontSize = 14.sp,
    )
    Spacer(Modifier.size(6.dp))
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      Button(
          onClick = {
            ReaderState.onOpenSource?.invoke("article", ReaderState.selectedTerm)
          }
      ) {
        Text("Article")
      }
      Button(
          onClick = {
            ReaderState.onOpenSource?.invoke("image", ReaderState.selectedTerm)
          }
      ) {
        Text("Images")
      }
      Button(
          onClick = {
            ReaderState.onOpenSource?.invoke("video", ReaderState.selectedTerm)
          }
      ) {
        Text("Video")
      }
    }
  }
  if (ReaderState.menuInsights.isNotEmpty()) {
    Spacer(Modifier.size(16.dp))
    Text(
        "Menu connections",
        modifier = Modifier.fillMaxWidth(),
        fontSize = 21.sp,
        fontWeight = FontWeight.Bold,
    )
    ReaderState.menuInsights.forEach { entry ->
      Spacer(Modifier.size(8.dp))
      Text(
          entry.term + " · " + entry.category,
          modifier = Modifier.fillMaxWidth(),
          fontSize = 18.sp,
          fontWeight = FontWeight.Bold,
      )
      Text(entry.definition, modifier = Modifier.fillMaxWidth(), fontSize = 16.sp)
      Text(
          "How it connects: " + entry.relationships.joinToString("; "),
          modifier = Modifier.fillMaxWidth(),
          fontSize = 15.sp,
      )
      Text(
          entry.allergenNotice,
          modifier = Modifier.fillMaxWidth(),
          fontSize = 15.sp,
          color = Color(0xFFFBBF24),
      )
    }
    Spacer(Modifier.size(8.dp))
    Text(
        "Ingredients vary. " + ReaderContent.allergenDisclaimer,
        modifier = Modifier.fillMaxWidth(),
        fontSize = 14.sp,
        color = Color(0xFFFBBF24),
    )
  }
  Spacer(Modifier.size(16.dp))
  Text(
      ReaderContent.translateAction,
      modifier = Modifier.fillMaxWidth(),
      fontSize = 21.sp,
      fontWeight = FontWeight.Bold,
  )
  Text(ReaderContent.translationNote, modifier = Modifier.fillMaxWidth(), fontSize = 14.sp)
  Spacer(Modifier.size(8.dp))
  Row(
      modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
  ) {
    ReaderContent.targetLanguages.forEach { language ->
      Button(onClick = { ReaderState.selectedTargetLanguage = language }) {
        Text(languageLabel(language))
      }
    }
  }
  Spacer(Modifier.size(8.dp))
  Button(
      onClick = {
        ReaderState.onTranslate?.invoke(text, ReaderState.selectedTargetLanguage)
      }
  ) {
    Text(ReaderContent.translateAction + " to " + languageLabel(ReaderState.selectedTargetLanguage))
  }
  if (ReaderState.translationStatus.isNotBlank()) {
    Spacer(Modifier.size(8.dp))
    Text(ReaderState.translationStatus, modifier = Modifier.fillMaxWidth(), fontSize = 15.sp)
  }
  if (ReaderState.translatedText.isNotBlank()) {
    Spacer(Modifier.size(8.dp))
    Text(
        ReaderState.translatedText,
        modifier = Modifier.fillMaxWidth(),
        fontSize = 20.sp,
        lineHeight = 26.sp,
    )
  }
  Spacer(Modifier.size(16.dp))
  Button(onClick = { ReaderState.onRead?.invoke() }) { Text("Read again") }
}

private fun languageLabel(tag: String): String =
    when (tag) {
      "en" -> "English"
      "es" -> "Spanish"
      "fr" -> "French"
      "de" -> "German"
      "it" -> "Italian"
      "ja" -> "Japanese"
      "ko" -> "Korean"
      "zh" -> "Chinese"
      else -> tag
    }

@Composable
private fun ErrorScreen() {
  Text(ReaderState.status, fontSize = 19.sp, textAlign = TextAlign.Center)
  Spacer(Modifier.size(18.dp))
  Button(onClick = { ReaderState.onRead?.invoke() }) { Text("Try again") }
}
`;
}

function emitReaderActivity(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo + reader-lifecycle.hsplus bridge contract. DO NOT EDIT.
package ${features.packageName}

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.tts.TextToSpeech
import androidx.compose.ui.platform.ComposeView
import com.meta.spatial.compose.ComposeFeature
import com.meta.spatial.compose.ComposeViewPanelRegistration
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.SpatialFeature
import com.meta.spatial.core.Vector3
import com.meta.spatial.runtime.ReferenceSpace
import com.meta.spatial.toolkit.AppSystemActivity
import com.meta.spatial.toolkit.DpPerMeterDisplayOptions
import com.meta.spatial.toolkit.Panel
import com.meta.spatial.toolkit.PanelRegistration
import com.meta.spatial.toolkit.PanelStyleOptions
import com.meta.spatial.toolkit.QuadShapeOptions
import com.meta.spatial.toolkit.Transform
import com.meta.spatial.toolkit.UIPanelSettings
import com.meta.spatial.vr.VRFeature
import java.util.Locale

class ReaderActivity : AppSystemActivity(), TextToSpeech.OnInitListener {
  private val cameraPermission = ${kotlinString(features.permission)}
  private var controller: PassthroughCameraController? = null
  private var panelEntity: Entity? = null
  private var smoothPose: Pose? = null
  private var sceneReady = false
  private var textToSpeech: TextToSpeech? = null
  private var speechReady = false
  private val translationController = TranslationController()
  private val lifecycle = ReaderLifecycleMachine()

  override fun registerFeatures(): List<SpatialFeature> =
      listOf(VRFeature(this), ComposeFeature())

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    textToSpeech = TextToSpeech(this, this)
    ReaderState.onEnable = {
      if (hasCameraPermission()) startReader()
      else requestPermissions(arrayOf(cameraPermission), REQUEST_CAMERA)
    }
    ReaderState.onRead = {
      val transition = lifecycle.fireScanRequested()
      if (transition?.to != ReaderLifecycleMachine.State.CAPTURING) {
        ReaderState.status = "A recognition pass is already running"
      } else if (controller?.requestRecognition() == true) {
        ReaderState.screen = ReaderScreen.WORKING
        ReaderState.status = "Capturing requested frame"
      } else {
        lifecycle.fireRecognitionFailed()
        ReaderState.screen = ReaderScreen.ERROR
        ReaderState.status = "Camera is not ready"
      }
    }
    ReaderState.onCopy = { text ->
      val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
      clipboard.setPrimaryClip(ClipData.newPlainText("HoloRead", text))
      ReaderState.status = "Copied"
    }
    ReaderState.onSpeak = { text ->
      if (speechReady) {
        textToSpeech?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "holoread-result")
      } else {
        ReaderState.status = "Speech is not ready"
      }
    }
    ReaderState.onExplain = { term ->
      val transition = lifecycle.fireContextRequested()
      if (transition?.to == ReaderLifecycleMachine.State.EXPLAINING) {
        val entry = ContextEngine.explain(term)
        ReaderState.selectedTerm = term
        ReaderState.explanation =
            if (entry == null) {
              "No local definition is available yet. Open a trusted source to learn more."
            } else {
              entry.definition + " How it connects: " + entry.relationships.joinToString("; ")
            }
        if (entry == null) lifecycle.fireContextFailed() else lifecycle.fireContextReady()
      }
    }
    ReaderState.onTranslate = { text, targetLanguage ->
      val transition = lifecycle.fireTranslationRequested()
      if (transition?.to != ReaderLifecycleMachine.State.TRANSLATING) {
        ReaderState.translationStatus = "Finish the current action before translating"
      } else {
        ReaderState.translatedText = ""
        translationController.translate(
            text = text,
            targetTag = targetLanguage,
            onStatus = { message ->
              runOnUiThread { ReaderState.translationStatus = message }
            },
            onSuccess = { translated ->
              runOnUiThread {
                lifecycle.fireTranslationSucceeded()
                ReaderState.translatedText = translated
                ReaderState.translationStatus = "Translated on device"
              }
            },
            onError = { message ->
              runOnUiThread {
                lifecycle.fireTranslationFailed()
                ReaderState.translationStatus = message
              }
            },
        )
      }
    }
    ReaderState.onOpenSource = { kind, term ->
      try {
        val uri = LearningSourceRouter.uriFor(kind, term)
        val intent = Intent(Intent.ACTION_VIEW, uri)
        if (intent.resolveActivity(packageManager) == null) {
          ReaderState.status = "No external browser is available"
        } else {
          startActivity(intent)
        }
      } catch (_: IllegalArgumentException) {
        ReaderState.status = "That learning source is not allowed"
      }
    }
  }

  override fun onInit(status: Int) {
    if (status != TextToSpeech.SUCCESS) {
      speechReady = false
      return
    }
    val languageTag = Locale.forLanguageTag(ReaderContent.speechLanguage)
    val languageStatus = textToSpeech?.setLanguage(languageTag) ?: TextToSpeech.ERROR
    speechReady =
        languageStatus != TextToSpeech.LANG_MISSING_DATA &&
            languageStatus != TextToSpeech.LANG_NOT_SUPPORTED
    textToSpeech?.setSpeechRate(ReaderContent.speechRate)
    textToSpeech?.setPitch(ReaderContent.speechPitch)
  }

  override fun onSceneReady() {
    super.onSceneReady()
    scene.setReferenceSpace(ReferenceSpace.LOCAL_FLOOR)
    scene.enablePassthrough(true)
    if (panelEntity == null) {
      panelEntity =
          Entity.create(
              listOf(
                  Panel(R.id.panel),
                  Transform(
                      Pose(
                          Vector3(
                              ReaderContent.panelX,
                              ReaderContent.panelY,
                              ReaderContent.panelZ,
                          )
                      )
                  ),
              )
          )
    }
    sceneReady = true
  }

  override fun onSceneTick() {
    super.onSceneTick()
    if (!sceneReady || !hasWindowFocus()) return
    val panel = panelEntity ?: return
    val target = scene.getViewerPose().times(Pose(Vector3(0f, 0f, FOLLOW_DISTANCE)))
    val current = smoothPose
    val next =
        if (current == null) {
          target
        } else {
          val position =
              Vector3(
                  current.t.x + (target.t.x - current.t.x) * HEAD_LOCK_SMOOTHING,
                  current.t.y + (target.t.y - current.t.y) * HEAD_LOCK_SMOOTHING,
                  current.t.z + (target.t.z - current.t.z) * HEAD_LOCK_SMOOTHING,
              )
          Pose(position, target.q)
        }
    smoothPose = next
    panel.setComponents(Transform(next))
  }

  private fun startReader() {
    if (!sceneReady || controller != null) return
    controller =
        PassthroughCameraController(
                context = this,
                onPreview = { bitmap ->
                  runOnUiThread {
                    ReaderState.updatePreview(bitmap)
                    if (ReaderState.screen == ReaderScreen.CONSENT) {
                      ReaderState.screen = ReaderScreen.READY
                    }
                    ReaderState.status = "Place text inside the frame"
                  }
                },
                onCaptureReady = {
                  runOnUiThread {
                    lifecycle.fireCaptureReady()
                    ReaderState.screen = ReaderScreen.WORKING
                  }
                },
                onRecognized = { text ->
                  runOnUiThread {
                    if (text.length >= ReaderContent.minTextChars) {
                      lifecycle.fireRecognitionSucceeded()
                      ReaderState.recognizedText = text
                      ReaderState.magnification = ReaderContent.minMagnification
                      ReaderState.contextTerms = ContextEngine.findTerms(text)
                      ReaderState.menuInsights = ContextEngine.analyzeMenu(text)
                      ReaderState.selectedTerm = ReaderState.contextTerms.firstOrNull().orEmpty()
                      ReaderState.explanation =
                          ContextEngine.explain(ReaderState.selectedTerm)?.let { entry ->
                            entry.definition +
                                " How it connects: " +
                                entry.relationships.joinToString("; ")
                          } ?: "Select a word to see local context or open a trusted source."
                      ReaderState.translatedText = ""
                      ReaderState.translationStatus = ""
                      ReaderState.screen = ReaderScreen.RESULT
                      ReaderState.status = "Text recognized"
                    } else {
                      lifecycle.fireRecognitionFailed()
                      ReaderState.screen = ReaderScreen.ERROR
                      ReaderState.status = "No readable text found. Move closer or improve lighting."
                    }
                  }
                },
                onError = { message ->
                  runOnUiThread {
                    lifecycle.fireRecognitionFailed()
                    ReaderState.screen = ReaderScreen.ERROR
                    ReaderState.status = message
                  }
                },
            )
            .also { it.start() }
  }

  private fun hasCameraPermission(): Boolean =
      checkSelfPermission(cameraPermission) == PackageManager.PERMISSION_GRANTED

  override fun onRequestPermissionsResult(
      requestCode: Int,
      permissions: Array<out String>,
      grantResults: IntArray,
  ) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    if (requestCode == REQUEST_CAMERA &&
        grantResults.isNotEmpty() &&
        grantResults[0] == PackageManager.PERMISSION_GRANTED) {
      startReader()
    } else if (requestCode == REQUEST_CAMERA) {
      ReaderState.screen = ReaderScreen.ERROR
      ReaderState.status = "Camera permission denied. Enable Headset cameras in Quest Settings."
    }
  }

  override fun onSpatialShutdown() {
    controller?.stop()
    controller = null
    textToSpeech?.stop()
    textToSpeech?.shutdown()
    textToSpeech = null
    translationController.close()
    super.onSpatialShutdown()
  }

  override fun registerPanels(): List<PanelRegistration> =
      listOf(
          ComposeViewPanelRegistration(
              R.id.panel,
              composeViewCreator = { _, context ->
                ComposeView(context).apply { setContent { ReaderPanel() } }
              },
              settingsCreator = {
                UIPanelSettings(
                    shape =
                        QuadShapeOptions(
                            width = ${floatLiteral(features.panelWidth)},
                            height = ${floatLiteral(features.panelHeight)},
                        ),
                    style =
                        PanelStyleOptions(
                            themeResourceId = R.style.PanelAppThemeTransparent
                        ),
                    display = DpPerMeterDisplayOptions(),
                )
              },
          )
      )

  companion object {
    private const val REQUEST_CAMERA = 201
    private const val FOLLOW_DISTANCE = ${floatLiteral(features.followDistance)}
    private const val HEAD_LOCK_SMOOTHING = 0.2f
  }
}
`;
}

function emitStrings(features: QuestReaderFeatures): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<!-- @generated from reader.holo by QuestCompiler. -->
<resources>
  <string name="app_name">${xmlEscape(features.appName)}</string>
</resources>
`;
}

function emitStyles(): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<!-- @generated by QuestCompiler. -->
<resources>
  <style name="Theme.Transparent" parent="android:Theme">
    <item name="android:windowIsTranslucent">true</item>
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:windowContentOverlay">@null</item>
    <item name="android:windowNoTitle">true</item>
    <item name="android:backgroundDimEnabled">false</item>
  </style>
  <style name="PanelAppThemeTransparent" parent="android:Theme">
    <item name="android:windowIsTranslucent">true</item>
    <item name="android:windowBackground">@android:color/transparent</item>
    <item name="android:windowContentOverlay">@null</item>
    <item name="android:windowNoTitle">true</item>
    <item name="android:backgroundDimEnabled">false</item>
  </style>
</resources>
`;
}

function emitIds(): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<!-- @generated by QuestCompiler. -->
<resources>
  <item type="id" name="panel" />
</resources>
`;
}

function emitIcon(features: QuestReaderFeatures): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<!-- @generated from reader.holo environment.icon by QuestCompiler. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
  <path android:fillColor="${features.iconBackground}" android:pathData="M0,0h108v108h-108z" />
  <path android:fillColor="${features.iconPrimary}" android:pathData="M18,22h72v10h-72z M18,44h58v10h-58z M18,66h68v10h-68z" />
  <path android:fillColor="${features.iconAccent}" android:pathData="M82,43h8v33h-8z M72,54h28v8h-28z" />
</vector>
`;
}

function emitBuildGradle(features: QuestReaderFeatures): string {
  return `// @generated from reader.holo by QuestCompiler. DO NOT EDIT.
import java.io.FileInputStream
import java.util.Properties

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.jetbrains.kotlin.android)
  alias(libs.plugins.meta.spatial.plugin)
  alias(libs.plugins.compose.compiler)
}

val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
  if (keystorePropsFile.exists()) FileInputStream(keystorePropsFile).use { load(it) }
}
fun signingValue(propKey: String, envKey: String): String? =
    keystoreProps.getProperty(propKey) ?: System.getenv(envKey)

android {
  namespace = "${features.packageName}"
  compileSdk = 34
  defaultConfig {
    applicationId = "${features.packageName}"
    minSdk = 34
    targetSdk = 34
    versionCode = ${Math.floor(features.versionCode)}
    versionName = "${features.versionName}"
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    ndk { abiFilters += "arm64-v8a" }
  }
  packaging { resources.excludes.add("META-INF/LICENSE") }
  signingConfigs {
    create("release") {
      val storePath = signingValue("storeFile", "KEYSTORE_FILE")
      if (storePath != null) {
        storeFile = file(storePath)
        storePassword = signingValue("storePassword", "KEYSTORE_PASSWORD")
        keyAlias = signingValue("keyAlias", "KEY_ALIAS")
        keyPassword = signingValue("keyPassword", "KEY_PASSWORD")
      }
    }
  }
  lint {
    abortOnError = false
    checkReleaseBuilds = true
  }
  buildTypes {
    release {
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      val releaseSigning = signingConfigs.getByName("release")
      if (releaseSigning.storeFile != null) signingConfig = releaseSigning
    }
  }
  buildFeatures {
    compose = true
    buildConfig = true
  }
  composeOptions { kotlinCompilerExtensionVersion = "1.5.15" }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  kotlinOptions { jvmTarget = "17" }
}

dependencies {
  implementation(libs.androidx.core.ktx)
  testImplementation(libs.junit)
  androidTestImplementation(libs.androidx.junit)
  androidTestImplementation(libs.androidx.espresso.core)
  implementation(libs.androidx.activity.compose)
  implementation(platform(libs.androidx.compose.bom))
  implementation(libs.androidx.ui)
  implementation(libs.androidx.ui.graphics)
  implementation(libs.androidx.material3)
  implementation(libs.androidx.ui.tooling.preview)
  debugImplementation(libs.androidx.ui.tooling)

  // Bundled model: no Google Play Services, account, network, or first-run model download.
  implementation("com.google.mlkit:text-recognition:16.0.1")
  // Language identification is bundled; translation models download only after the user taps.
  implementation("com.google.mlkit:language-id:17.0.6")
  implementation("com.google.mlkit:translate:17.0.3")

  implementation(libs.meta.spatial.sdk.base)
  implementation(libs.meta.spatial.sdk.compose)
  implementation(libs.meta.spatial.sdk.toolkit)
  implementation(libs.meta.spatial.sdk.vr)
  implementation(libs.meta.spatial.sdk.isdk)
  implementation(libs.meta.spatial.sdk.uiset)
}

spatial {
  allowUsageDataCollection.set(false)
}
`;
}

function emitProguard(): string {
  return `# @generated by QuestCompiler.
-dontwarn horizonos.app.container.**
-dontwarn vros.os.**
-keepclasseswithmembers,includedescriptorclasses class com.meta.spatial.** {
    native <methods>;
}
-keepclassmembers,includedescriptorclasses class com.meta.spatial.** {
    *** native*(...);
}
-keep class com.meta.spatial.**.R { *; }
-keep class com.meta.spatial.**.R$* { *; }
-keep class com.meta.spatial.toolkit.** { *; }
-keep class com.meta.spatial.isdk.** { *; }
`;
}

function emitManifest(features: QuestReaderFeatures): string {
  return `<?xml version="1.0" encoding="utf-8" ?>
<!-- @generated from reader.holo privacy and device declarations by QuestCompiler. -->
<manifest
    xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:horizonos="http://schemas.horizonos/sdk"
    xmlns:tools="http://schemas.android.com/tools"
    android:versionCode="${Math.floor(features.versionCode)}"
    android:versionName="${xmlEscape(features.versionName)}"
    android:installLocation="auto">

  <horizonos:uses-horizonos-sdk horizonos:minSdkVersion="74" horizonos:targetSdkVersion="74" />
  <uses-feature android:name="android.hardware.vr.headtracking" android:required="true" />
  <uses-feature android:name="oculus.software.handtracking" android:required="false" />
  <uses-feature android:name="com.oculus.feature.PASSTHROUGH" android:required="true" />
  <uses-feature android:name="android.hardware.camera2.any" android:required="true" />
  <uses-feature android:glEsVersion="0x00030001" />
  <uses-permission android:name="com.oculus.permission.HAND_TRACKING" />
  <uses-permission android:name="${xmlEscape(features.permission)}" />

  <!-- Internet is used only for an explicit on-device translation-model download. Learning
       sources open in the external browser; HoloRead performs no article, image, or video fetch. -->
  <uses-permission android:name="android.permission.INTERNET" />
  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" tools:node="remove" />
  <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" tools:node="remove" />
  <uses-permission android:name="android.permission.READ_MEDIA_AUDIO" tools:node="remove" />
  <uses-permission android:name="android.permission.READ_MEDIA_VIDEO" tools:node="remove" />
  <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" tools:node="remove" />

  <application
      android:allowBackup="false"
      android:usesCleartextTraffic="false"
      android:icon="@drawable/ic_launcher"
      android:label="@string/app_name">
    <meta-data android:name="com.oculus.supportedDevices" android:value="quest3|quest3s" />
    <meta-data android:name="com.oculus.handtracking.version" android:value="V2.0" />
    <meta-data android:name="com.oculus.vr.focusaware" android:value="true" />
    <uses-native-library android:name="libossdk.oculus.so" android:required="true" />
    <activity
        android:name="${features.packageName}.ReaderActivity"
        android:launchMode="singleTask"
        android:screenOrientation="landscape"
        android:excludeFromRecents="true"
        android:configChanges="screenSize|screenLayout|orientation|keyboardHidden|keyboard|navigation|uiMode"
        android:exported="true">
      <intent-filter>
        <action android:name="android.intent.action.MAIN" />
        <category android:name="com.oculus.intent.category.VR" />
        <category android:name="android.intent.category.LAUNCHER" />
      </intent-filter>
    </activity>
  </application>
</manifest>
`;
}
