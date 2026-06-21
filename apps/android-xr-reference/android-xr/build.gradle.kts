// Root project — supplies plugin versions for the @generated app/build.gradle.kts.
// The @generated app module declares plugins by id with NO version; this root declares the
// versions (apply false) so a multi-module resolve works. Hand-maintained scaffold (NOT @generated).
plugins {
  // AGP 8.9.1+ required by the alpha15 Jetpack XR libraries (AAR metadata gate); needs gradle 8.11.1+.
  id("com.android.application") version "8.9.1" apply false
  id("org.jetbrains.kotlin.android") version "2.0.21" apply false
  id("org.jetbrains.kotlin.plugin.compose") version "2.0.21" apply false
}
