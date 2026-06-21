// Legacy plain-Android (ARCore) reference — project settings (hand-maintained scaffold; NOT @generated).
// The app module source (app/src + app/build.gradle.kts) IS @generated from scene.holo.
pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
    // Sceneform maintained fork (com.gorisse.thomas:sceneform) is on JitPack.
    maven { url = uri("https://jitpack.io") }
  }
}

rootProject.name = "AndroidReference"

include(":app")
