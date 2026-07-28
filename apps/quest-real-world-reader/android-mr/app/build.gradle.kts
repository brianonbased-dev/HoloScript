// @generated from reader.holo by QuestCompiler. DO NOT EDIT.
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
  namespace = "net.holoscript.holoread"
  compileSdk = 34
  defaultConfig {
    applicationId = "net.holoscript.holoread"
    minSdk = 34
    targetSdk = 34
    versionCode = 2
    versionName = "0.2.0"
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
