import type { HoloComposition, HoloObjectDecl, HoloValue } from '../parser/HoloCompositionTypes';
import type { AndroidCompiler } from './AndroidCompiler';
import { toKotlinColor } from './AndroidKotlinHelpers';
import { hasGeoTraits, hasGeospatialVPSTraits } from './AndroidFeatureGenerators';

// =============================================================================
// compile_to_android — SceneView (Apache 2.0) Compose-native AR target.
//
// Retargeted OFF the EOL Sceneform fork (com.gorisse.thomas.sceneform, archived)
// ONTO SceneView 4.18.0 (io.github.sceneview, Apache 2.0, actively maintained).
// The proven-green device reference lives at apps/android-reference/ (built with
// the local ad-hoc toolchain and run on a Galaxy S23 — live ARCore session +
// Filament renderer). These generators reproduce that reference: regenerate via
// apps/android-reference/generate-native.mts, gated by
// scripts/holo-ci/check-android-emit-matches-reference.mts (byte-diff) and
// scripts/holo-ci/check-android-build-verify.mts (real gradle build).
//
// SceneView's declarative `ARScene { }` model means there is NO ArFragment, NO
// R.layout, NO imperative NodeFactory and NO SceneState ViewModel — nodes are
// composables (CubeNode / SphereNode / CylinderNode) placed inside the scene
// lambda. generateStateFile / generateNodeFactoryFile therefore emit nothing.
//
// Wave 1 (this code) is the BASE render path. The feature-trait emitters
// (geo-anchor, geospatial VPS, depth scan, portal AR, hand tracking, authoring,
// haptic, …) in AndroidFeatureGenerators / AndroidPeripheralGenerators remain
// Sceneform-coupled and are a separate wave-2 SceneView port; the base activity
// no longer wires them. The manifest still emits geo location permissions when a
// geo trait is present (permission strings are SDK-agnostic).
// =============================================================================

type Geometry = 'cube' | 'sphere' | 'cylinder';

/** Render a number as a Kotlin Float literal (e.g. 0.2 → "0.2f", -1 → "-1f"). */
function toKotlinFloatLiteral(value: unknown, fallback: number): string {
  const numeric = typeof value === 'number' ? value : Number(value);
  const resolved = Number.isFinite(numeric) ? numeric : fallback;
  return `${resolved}f`;
}

/** Classify an object's mesh/geometry into a SceneView node kind (default cube). */
function geometryOf(compiler: AndroidCompiler, obj: HoloObjectDecl): Geometry {
  const raw =
    compiler.findObjProp(obj, 'geometry') ??
    compiler.findObjProp(obj, 'mesh') ??
    compiler.findObjProp(obj, 'type') ??
    'cube';
  const g = String(raw).toLowerCase();
  if (g === 'sphere') return 'sphere';
  if (g === 'cylinder') return 'cylinder';
  // box / cube / anything unrecognised → cube (the safe renderable default).
  return 'cube';
}

const NAMED_COMPOSE_COLORS: Record<string, string> = {
  red: 'Color(0xFFFF0000)',
  green: 'Color(0xFF00FF00)',
  blue: 'Color(0xFF2196F3)',
  white: 'Color(0xFFFFFFFF)',
  black: 'Color(0xFF000000)',
  yellow: 'Color(0xFFFFEB3B)',
  cyan: 'Color(0xFF00BCD4)',
  magenta: 'Color(0xFFE91E63)',
  orange: 'Color(0xFFFF9800)',
};

/** Neutral default when an object declares no color. */
const DEFAULT_COMPOSE_COLOR = 'Color(0xFF4488FF)';

/**
 * Convert a HoloValue colour to a Jetpack-Compose `Color(0x........)` literal for
 * SceneView's `materialLoader.createColorInstance(...)`.
 */
function toComposeColor(value: HoloValue | undefined): string {
  if (typeof value === 'string') {
    if (value.startsWith('#')) return toKotlinColor(value);
    return NAMED_COMPOSE_COLORS[value.toLowerCase()] ?? DEFAULT_COMPOSE_COLOR;
  }
  if (Array.isArray(value) && value.length >= 3) {
    const nums = value as number[];
    const [r, g, b, a = 1] = nums;
    const ch = (n: number) =>
      Math.max(0, Math.min(255, Math.round(n * 255)))
        .toString(16)
        .padStart(2, '0')
        .toUpperCase();
    return `Color(0x${ch(a)}${ch(r)}${ch(g)}${ch(b)})`;
  }
  return DEFAULT_COMPOSE_COLOR;
}

/** `Position(x = …f, y = …f, z = …f)` from a [x,y,z] position prop. */
function toPosition(value: HoloValue | undefined): string {
  const c = Array.isArray(value) && value.length >= 3 ? (value as number[]) : [0, 0, 0];
  return `Position(x = ${toKotlinFloatLiteral(c[0], 0)}, y = ${toKotlinFloatLiteral(
    c[1],
    0
  )}, z = ${toKotlinFloatLiteral(c[2], 0)})`;
}

/** First scalar component of a scale prop (number or vector). */
function scaleScalar(value: HoloValue | undefined, fallback: number): number {
  if (typeof value === 'number') return value;
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'number') {
    return value[0] as number;
  }
  return fallback;
}

/** Cube `size = Size(…)` from a scalar or [x,y,z] scale (Size(v) is uniform). */
function toCubeSize(value: HoloValue | undefined): string {
  if (Array.isArray(value) && value.length >= 3) {
    const n = value as number[];
    return `Size(${toKotlinFloatLiteral(n[0], 0.1)}, ${toKotlinFloatLiteral(
      n[1],
      0.1
    )}, ${toKotlinFloatLiteral(n[2], 0.1)})`;
  }
  return `Size(${toKotlinFloatLiteral(scaleScalar(value, 0.1), 0.1)})`;
}

/** Emit one SceneView node composable for a HoloScript object inside ARScene { }. */
function emitObjectNode(compiler: AndroidCompiler, obj: HoloObjectDecl): void {
  const geom = geometryOf(compiler, obj);
  const colorExpr = toComposeColor(compiler.findObjProp(obj, 'color'));
  const position = toPosition(compiler.findObjProp(obj, 'position'));
  const scale = compiler.findObjProp(obj, 'scale');
  // Escape the name even inside a // comment: an unescaped newline or quote-sequence in a
  // hostile object name would otherwise break out of the comment (CWE-94, FlowLevel hardening).
  const safeName = compiler.escapeStringValue(obj.name as string, 'Kotlin');

  compiler.emit(`// ${safeName} — geometry: ${geom}`);
  if (geom === 'sphere') {
    compiler.emit('SphereNode(');
    compiler.indentLevel++;
    compiler.emit(`radius = ${toKotlinFloatLiteral(scaleScalar(scale, 0.05), 0.05)},`);
    compiler.emit(`materialInstance = materialLoader.createColorInstance(${colorExpr}),`);
    compiler.emit(`position = ${position},`);
    compiler.indentLevel--;
    compiler.emit(')');
  } else if (geom === 'cylinder') {
    compiler.emit('CylinderNode(');
    compiler.indentLevel++;
    compiler.emit(`radius = ${toKotlinFloatLiteral(scaleScalar(scale, 0.05), 0.05)},`);
    compiler.emit(`length = ${toKotlinFloatLiteral(scaleScalar(scale, 0.1) * 2, 0.2)},`);
    compiler.emit(`materialInstance = materialLoader.createColorInstance(${colorExpr}),`);
    compiler.emit(`position = ${position},`);
    compiler.indentLevel--;
    compiler.emit(')');
  } else {
    compiler.emit('CubeNode(');
    compiler.indentLevel++;
    compiler.emit(`size = ${toCubeSize(scale)},`);
    compiler.emit(`materialInstance = materialLoader.createColorInstance(${colorExpr}),`);
    compiler.emit(`position = ${position},`);
    compiler.indentLevel--;
    compiler.emit(')');
  }
}

export function generateActivityFile(
  compiler: AndroidCompiler,
  composition: HoloComposition
): string {
  compiler.lines = [];
  compiler.indentLevel = 0;

  const pkg = compiler.options.packageName;
  const cls = compiler.options.className;
  const objects = composition.objects ?? [];

  // Which node kinds appear → conditional imports (empty scene → a default cube).
  const geoms = new Set<Geometry>(objects.map((o) => geometryOf(compiler, o)));
  if (objects.length === 0) geoms.add('cube');

  compiler.emit('// Auto-generated by HoloScript AndroidCompiler');
  compiler.emit(
    `// Source: composition "${compiler.escapeStringValue(composition.name as string, 'Kotlin')}"`
  );
  compiler.emit('// Do not edit manually — regenerate from .holo (apps/android-reference/generate-native.mts)');
  compiler.emit('//');
  compiler.emit('// SceneView (Apache 2.0) Compose-native AR. Declarative ARScene { } with one node per');
  compiler.emit('// HoloScript object — no ArFragment, no R.layout, no NodeFactory/ViewModel.');
  compiler.emit('');
  compiler.emit(`package ${pkg}`);
  compiler.emit('');
  compiler.emit('import android.os.Bundle');
  compiler.emit('import androidx.activity.ComponentActivity');
  compiler.emit('import androidx.activity.compose.setContent');
  compiler.emit('import androidx.compose.foundation.layout.fillMaxSize');
  compiler.emit('import androidx.compose.ui.Modifier');
  compiler.emit('import androidx.compose.ui.graphics.Color');
  compiler.emit('import io.github.sceneview.ar.ARScene');
  compiler.emit('import io.github.sceneview.ar.rememberARCameraNode');
  compiler.emit('import io.github.sceneview.math.Position');
  if (geoms.has('cube')) compiler.emit('import io.github.sceneview.math.Size');
  if (geoms.has('cube')) compiler.emit('import io.github.sceneview.node.CubeNode');
  if (geoms.has('cylinder')) compiler.emit('import io.github.sceneview.node.CylinderNode');
  if (geoms.has('sphere')) compiler.emit('import io.github.sceneview.node.SphereNode');
  compiler.emit('import io.github.sceneview.rememberEngine');
  compiler.emit('import io.github.sceneview.rememberMaterialLoader');
  compiler.emit('');

  compiler.emit(`class ${cls}Activity : ComponentActivity() {`);
  compiler.indentLevel++;
  compiler.emit('override fun onCreate(savedInstanceState: Bundle?) {');
  compiler.indentLevel++;
  compiler.emit('super.onCreate(savedInstanceState)');
  compiler.emit('setContent {');
  compiler.indentLevel++;
  compiler.emit('val engine = rememberEngine()');
  compiler.emit('val materialLoader = rememberMaterialLoader(engine)');
  compiler.emit('val cameraNode = rememberARCameraNode(engine)');
  compiler.emit('');
  compiler.emit('ARScene(');
  compiler.indentLevel++;
  compiler.emit('modifier = Modifier.fillMaxSize(),');
  compiler.emit('engine = engine,');
  compiler.emit('cameraNode = cameraNode,');
  compiler.emit('materialLoader = materialLoader,');
  compiler.emit('planeRenderer = true,');
  compiler.indentLevel--;
  compiler.emit(') {');
  compiler.indentLevel++;
  if (objects.length) {
    objects.forEach((obj, i) => {
      if (i > 0) compiler.emit('');
      emitObjectNode(compiler, obj);
    });
  } else {
    compiler.emit('// No objects in composition — default placeholder cube at 1m.');
    compiler.emit('CubeNode(');
    compiler.indentLevel++;
    compiler.emit('size = Size(0.1f),');
    compiler.emit(`materialInstance = materialLoader.createColorInstance(${DEFAULT_COMPOSE_COLOR}),`);
    compiler.emit('position = Position(x = 0f, y = 0f, z = -1f),');
    compiler.indentLevel--;
    compiler.emit(')');
  }
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.indentLevel--; // setContent
  compiler.emit('}');
  compiler.indentLevel--; // onCreate
  compiler.emit('}');
  compiler.indentLevel--; // class
  compiler.emit('}');

  return compiler.lines.join('\n') + '\n';
}

/**
 * SceneView's declarative `ARScene { }` keeps node state in the composable tree,
 * so the Sceneform `SceneState : ViewModel` is dissolved. Emit nothing.
 */
export function generateStateFile(
  _compiler: AndroidCompiler,
  _composition: HoloComposition
): string {
  return '';
}

/**
 * SceneView builds nodes declaratively (CubeNode / SphereNode / …) inside the
 * scene lambda, so the Sceneform `NodeFactory` (MaterialFactory/ShapeFactory
 * futures) is dissolved. Emit nothing.
 */
export function generateNodeFactoryFile(
  _compiler: AndroidCompiler,
  _composition: HoloComposition
): string {
  return '';
}

export function generateManifestFile(
  compiler: AndroidCompiler,
  composition: HoloComposition
): string {
  const cls = compiler.options.className;
  const hasGeo = hasGeoTraits(composition);
  const hasGeospatialVPS = hasGeospatialVPSTraits(composition);

  const geoPermissions =
    hasGeo || hasGeospatialVPS
      ? `
    <!-- Geo-Anchor: Location permissions -->
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />`
      : '';

  const geospatialApiKeyMeta = hasGeospatialVPS
    ? `
        <!-- ARCore Geospatial API key (replace with your key from Google Cloud Console) -->
        <meta-data android:name="com.google.android.ar.API_KEY" android:value="\${GEOSPATIAL_API_KEY}" />`
    : '';

  return `<?xml version="1.0" encoding="utf-8"?>
<!-- Auto-generated by HoloScript AndroidCompiler -->
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    xmlns:tools="http://schemas.android.com/tools">

    <!-- AR Required -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera.ar" android:required="true" />

    <!-- ARCore Required -->
    <uses-feature android:glEsVersion="0x00030000" android:required="true" />${geoPermissions}

    <application
        android:allowBackup="true"
        android:label="${compiler.escapeStringValue(composition.name as string, 'XML')}"
        android:supportsRtl="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar">

        <!-- ARCore metadata. SceneView's arsceneview AAR declares com.google.ar.core as
             "optional"; this app requires AR, so override the merged value. -->
        <meta-data android:name="com.google.ar.core" android:value="required"
            tools:replace="android:value" />${geospatialApiKeyMeta}

        <activity
            android:name=".${cls}Activity"
            android:exported="true"
            android:configChanges="orientation|screenSize"
            android:screenOrientation="locked">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`;
}

export function generateBuildGradle(
  compiler: AndroidCompiler,
  composition: HoloComposition
): string {
  const pkg = compiler.options.packageName;
  const minSdk = compiler.options.minSdk;
  // SceneView 4.18.0 pulls androidx.core 1.18.0, which refuses to compile below API 36, so 36 is
  // the floor for both compile and target SDK. A higher requested targetSdk flows through.
  const sdk = Math.max(36, compiler.options.targetSdk);

  return `// Auto-generated by HoloScript AndroidCompiler
// Source: ${compiler.escapeStringValue(composition.name as string, 'Kotlin')}
//
// SceneView (Apache 2.0) Compose-native AR target — replaces the EOL Sceneform fork.
// compileSdk/targetSdk floor at 36: SceneView 4.18.0 pulls androidx.core 1.18.0, which refuses
// to compile below API 36 and requires Android Gradle Plugin 8.9.1+ and Kotlin 2.3.21 (both
// declared in the hand-maintained root build.gradle.kts scaffold).

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "${pkg}"
    compileSdk = ${sdk}

    defaultConfig {
        applicationId = "${pkg}"
        minSdk = ${minSdk}
        targetSdk = ${sdk}
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }
}

// Kotlin 2.3 removed the kotlinOptions { jvmTarget = "17" } DSL (now a hard error);
// the JVM target moves to the top-level compilerOptions DSL.
kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-compose:1.9.3")

    // Jetpack Compose (BOM matches SceneView 4.18.0's compose surface)
    implementation(platform("androidx.compose:compose-bom:2024.09.03"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.foundation:foundation")
    implementation("androidx.compose.material3:material3")

    // SceneView (Apache 2.0) — Compose-native AR; pulls io.github.sceneview:sceneview + ARCore 1.54.0
    // transitively. Replaces the EOL Sceneform fork. No ArFragment / no R.layout (Compose-native).
    implementation("io.github.sceneview:arsceneview:4.18.0")
}`;
}
