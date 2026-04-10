// Minimal WebXR ambient declarations for phased rendering extraction builds.
// These keep engine DTS generation unblocked while rendering sources are migrated.

export {};

declare global {
  interface XRSession {
    [key: string]: unknown;
  }

  interface XRReferenceSpace {
    [key: string]: unknown;
  }

  interface XRView {
    [key: string]: unknown;
  }

  interface XRFrame {
    // duplicate/conflict:     session: XRSession;
    getViewerPose(referenceSpace: XRReferenceSpace): {
      views: XRView[];
    } | null;
    [key: string]: unknown;
  }
}
