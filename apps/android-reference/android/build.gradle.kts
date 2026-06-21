// Root project — supplies plugin versions for the @generated app/build.gradle.kts.
// The @generated app module declares plugins by id with NO version; this root declares the
// versions (apply false) so a multi-module resolve works. Hand-maintained scaffold (NOT @generated).
//
// NOTE: the generated app/build.gradle.kts sets `buildFeatures { compose true }` but does NOT
// declare the Kotlin compose-compiler plugin, so on Kotlin 2.x the Compose build fails. That is a
// known codegen blocker tracked in apps/android-reference/README.md — the root scaffold declares
// the compose plugin apply-false so the fix only needs the emitter to add the plugin id.
plugins {
  id("com.android.application") version "8.5.2" apply false
  id("org.jetbrains.kotlin.android") version "2.0.20" apply false
  id("org.jetbrains.kotlin.plugin.compose") version "2.0.20" apply false
}
