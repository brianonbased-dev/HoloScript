/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */
// @generated from scanner.holo by the quest compiler — edit the spec, not here.

import java.io.FileInputStream
import java.util.Properties

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.jetbrains.kotlin.android)
  alias(libs.plugins.meta.spatial.plugin)
  alias(libs.plugins.compose.compiler)
}

// Signing: read from keystore.properties (gitignored) OR env vars (CI). Never commit a keystore (F.106).
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
  if (keystorePropsFile.exists()) FileInputStream(keystorePropsFile).use { load(it) }
}
fun signingValue(propKey: String, envKey: String): String? =
  keystoreProps.getProperty(propKey) ?: System.getenv(envKey)

android {
  namespace = "net.holoscript.qrscanner"
  //noinspection GradleDependency
  compileSdk = 34

  defaultConfig {
    applicationId = "net.holoscript.qrscanner"
    minSdk = 34
    // HorizonOS is Android 14 (API level 34)
    //noinspection OldTargetApi,ExpiredTargetSdkVersion
    targetSdk = 34
    versionCode = 2
    versionName = "1.0.1"

    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

    // Update the ndkVersion to the right version for your app
    // ndkVersion = "27.0.12077973"

    // Quest is arm64 ONLY — package only arm64-v8a so 32-bit (armeabi-v7a) and x86/x86_64 native
    // libs from dependencies are stripped. A 32-bit binary fails store review (VRC.Quest.Packaging.6:
    // all Quest APKs must be 64-bit). Without this filter the .so from the Spatial SDK / deps ship
    // every ABI and the upload validator rejects the APK.
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
      // Meta's release scanner inspects every bundled class, including unreachable code in
      // transitive SDK dependencies. R8 removes that dead bytecode and reduces the release APK.
      isMinifyEnabled = true
      isShrinkResources = true
      proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
      val rel = signingConfigs.getByName("release")
      if (rel.storeFile != null) signingConfig = rel
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

//noinspection UseTomlInstead
dependencies {
  implementation(libs.androidx.core.ktx)
  testImplementation(libs.junit)
  androidTestImplementation(libs.androidx.junit)
  androidTestImplementation(libs.androidx.espresso.core)

  // compose
  implementation(libs.androidx.activity.compose)
  implementation(platform(libs.androidx.compose.bom))
  implementation(libs.androidx.ui)
  implementation(libs.androidx.ui.graphics)
  implementation(libs.androidx.material3)
  implementation(libs.androidx.ui.tooling.preview)
  debugImplementation(libs.androidx.ui.tooling)

  // QR decode — pure-Java ZXing (GMS-free; Quest has no Google Play Services)
  implementation("com.google.zxing:core:3.5.3")

  // Meta Spatial SDK libs
  implementation(libs.meta.spatial.sdk.base)
  implementation(libs.meta.spatial.sdk.compose)
  implementation(libs.meta.spatial.sdk.ovrmetrics)
  implementation(libs.meta.spatial.sdk.toolkit)
  implementation(libs.meta.spatial.sdk.vr)
  implementation(libs.meta.spatial.sdk.isdk)
  implementation(libs.meta.spatial.sdk.castinputforward)
  implementation(libs.meta.spatial.sdk.hotreload)
  implementation(libs.meta.spatial.sdk.datamodelinspector)
  implementation(libs.meta.spatial.sdk.uiset)
  // Gaussian splatting — Meta's native Splat component (.spz/.ply, ≤150k splats on Quest 3).
  implementation(libs.meta.spatial.sdk.splat)
}

spatial {
  // No Spatial Editor scene export — the scanner builds its UI programmatically (passthrough MR
  // + a Compose panel placed via Entity.create(Panel + Transform)), so it needs no .metaspatial
  // CLI export. This keeps the build CLI-free (the Spatial Editor desktop app is not installed here).
  allowUsageDataCollection.set(true)
}
