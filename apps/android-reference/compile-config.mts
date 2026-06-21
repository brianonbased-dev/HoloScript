// Shared compile config for the legacy plain-Android (ARCore) reference app.
//
// Both the generator (generate-native.mts) and the golden-diff gate
// (scripts/holo-ci/check-android-emit-matches-reference.mts) import these so the emitted
// output and the gate's expectation can never diverge on package/class naming.
export const ANDROID_PACKAGE = 'net.holoscript.android';
export const ANDROID_CLASS = 'GeneratedARScene';
