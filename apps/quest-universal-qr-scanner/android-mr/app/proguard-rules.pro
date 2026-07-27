# @generated from scanner.holo by the quest compiler — edit the spec, not here.
#
# Meta Spatial SDK references Horizon OS framework classes that are present on Quest at runtime.
# R8 cannot resolve them against the public Android SDK, so suppress only those platform warnings.
-dontwarn horizonos.app.container.**
-dontwarn vros.os.**

# Meta's native libraries register JNI methods by their Java class and method names.
# Preserve only that external ABI while allowing unrelated SDK code to be optimized away.
-keepclasseswithmembers,includedescriptorclasses class com.meta.spatial.** {
    native <methods>;
}

# Meta native code also invokes Java callback methods whose names begin with native.
-keepclassmembers,includedescriptorclasses class com.meta.spatial.** {
    *** native*(...);
}

# Meta ISDK locates Spatial SDK Android resource classes with reflection.
-keep class com.meta.spatial.**.R { *; }
-keep class com.meta.spatial.**.R$* { *; }

# Meta ISDK also resolves Toolkit and ISDK component types by class name.
-keep class com.meta.spatial.toolkit.** { *; }
-keep class com.meta.spatial.isdk.** { *; }
