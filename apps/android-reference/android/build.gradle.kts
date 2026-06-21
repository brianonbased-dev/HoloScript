// Root project — supplies plugin versions for the @generated app/build.gradle.kts.
// The @generated app module declares plugins by id with NO version; this root declares the
// versions (apply false) so a multi-module resolve works. Hand-maintained scaffold (NOT @generated).
//
// NOTE: the generated app/build.gradle.kts sets `buildFeatures { compose true }` but does NOT
// declare the Kotlin compose-compiler plugin, so on Kotlin 2.x the Compose build fails. That is a
// known codegen blocker tracked in apps/android-reference/README.md — the root scaffold declares
// the compose plugin apply-false so the fix only needs the emitter to add the plugin id.
// Toolchain bumped for SceneView 4.18.0 (Apache 2.0, Compose-native AR). Hand-maintained scaffold.
plugins {
  id("com.android.application") version "8.9.1" apply false
  // Kotlin 2.3.21 — SceneView 4.18.0 ships metadata binary v2.3.0 + kotlin-stdlib 2.3.21;
  // a 2.1.0 compiler cannot read its forward-version metadata. The compose-compiler plugin
  // is versioned in lockstep with the Kotlin plugin (since Kotlin 2.0), so both move together.
  id("org.jetbrains.kotlin.android") version "2.3.21" apply false
  id("org.jetbrains.kotlin.plugin.compose") version "2.3.21" apply false
}
