// Android XR reference — project settings (hand-maintained scaffold; NOT @generated).
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
  }
}

rootProject.name = "AndroidXrReference"

include(":app")
