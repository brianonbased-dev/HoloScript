// Shared compile config for the Android XR reference app.
//
// Both the generator (generate-native.mts) and the golden-diff gate
// (scripts/holo-ci/check-android-xr-emit-matches-reference.mts) import these so the emitted
// output and the gate's expectation can never diverge on package/activity naming.
export const ANDROID_XR_PACKAGE = 'net.holoscript.androidxr';
export const ANDROID_XR_ACTIVITY = 'GeneratedXRActivity';
