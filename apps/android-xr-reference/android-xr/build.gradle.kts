// Root project — supplies plugin versions for the @generated app/build.gradle.kts.
// The @generated app module declares plugins by id with NO version; this root declares the
// versions (apply false) so a multi-module resolve works. Hand-maintained scaffold (NOT @generated).
plugins {
  id("com.android.application") version "8.5.2" apply false
  id("org.jetbrains.kotlin.android") version "2.0.20" apply false
  id("org.jetbrains.kotlin.plugin.compose") version "2.0.20" apply false
}
