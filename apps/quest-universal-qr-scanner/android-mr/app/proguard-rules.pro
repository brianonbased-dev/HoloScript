# @generated from scanner.holo by the quest compiler — edit the spec, not here.
#
# Meta Spatial SDK references Horizon OS framework classes that are present on Quest at runtime.
# R8 cannot resolve them against the public Android SDK, so suppress only those platform warnings.
-dontwarn horizonos.app.container.**
-dontwarn vros.os.**

# Meta's native libraries register JNI methods by their Java class and method names.
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

# Native Scene/ISDK constructs these types from JNI on every frame. R8 dropping the
# constructors SIGABRTs onSceneTick and Quest dumps the user back to Home.
-keep class com.meta.spatial.core.** { *; }
-keep class com.meta.spatial.runtime.** { *; }

# ZXing uses DecodeHintType as map keys. R8 renaming those enums makes every QR read return null.
-keep class com.google.zxing.** { *; }
