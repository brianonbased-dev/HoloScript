package com.holoscript.depthprobe;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.media.Image;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Camera;
import com.google.ar.core.CameraIntrinsics;
import com.google.ar.core.Config;
import com.google.ar.core.Frame;
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.exceptions.CameraNotAvailableException;
import com.google.ar.core.exceptions.NotYetAvailableException;
import com.google.ar.core.exceptions.UnavailableException;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

public final class MainActivity extends Activity implements GLSurfaceView.Renderer {
    private static final String TAG = "HoloMapDepthProbe";
    private static final int CAMERA_PERMISSION_REQUEST = 1001;
    // Full native depth resolution (ARCore DEPTH16 is ~160x90 on the S23) — no longer
    // throwing away ~4.7x of the depth map by downsampling to 64x48.
    private static final int SAMPLE_WIDTH = 160;
    private static final int SAMPLE_HEIGHT = 90;
    private static final int MAX_FRAME_ATTEMPTS = 900;
    private static final long MAX_CAPTURE_MS = 45000L;
    // ROOT-CAUSE FIX: ARCore depth-from-motion (the S23 has no ToF sensor) returns an
    // empty/all-zero depth image until parallax converges. The old probe wrote its
    // receipt on the FIRST available depth frame (~1s in) — always empty. Gate on real
    // coverage so we only capture a converged frame.
    private static final float MIN_DEPTH_COVERAGE = 0.12f;

    private GLSurfaceView surfaceView;
    private Session session;
    private boolean installRequested;
    private int cameraTextureId = -1;
    private int frameAttempts;
    private long startedAtMs;
    private float bestDepthCoverage = 0f;
    private String lastDepthError = "not-started";
    private final AtomicBoolean wroteReceipt = new AtomicBoolean(false);

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        surfaceView = new GLSurfaceView(this);
        surfaceView.setEGLContextClientVersion(2);
        surfaceView.setPreserveEGLContextOnPause(true);
        surfaceView.setRenderer(this);
        surfaceView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
        setContentView(surfaceView);
        startedAtMs = SystemClock.elapsedRealtime();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[] { Manifest.permission.CAMERA }, CAMERA_PERMISSION_REQUEST);
            return;
        }
        ensureSession();
        surfaceView.onResume();
    }

    @Override
    protected void onPause() {
        surfaceView.onPause();
        if (session != null) session.pause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (session != null) {
            session.close();
            session = null;
        }
        super.onDestroy();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == CAMERA_PERMISSION_REQUEST) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                ensureSession();
                surfaceView.onResume();
            } else {
                writeBlockedReceipt("camera-permission-denied");
            }
        }
    }

    private void ensureSession() {
        if (session != null || wroteReceipt.get()) return;
        try {
            ArCoreApk.InstallStatus installStatus =
                ArCoreApk.getInstance().requestInstall(this, !installRequested);
            if (installStatus == ArCoreApk.InstallStatus.INSTALL_REQUESTED) {
                installRequested = true;
                return;
            }

            session = new Session(this);
            Config config = new Config(session);
            if (!session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {
                writeBlockedReceipt("depth-mode-automatic-not-supported");
                return;
            }
            config.setDepthMode(Config.DepthMode.AUTOMATIC);
            config.setFocusMode(Config.FocusMode.AUTO);
            session.configure(config);
            session.resume();
            if (cameraTextureId > 0) session.setCameraTextureName(cameraTextureId);
        } catch (UnavailableException | CameraNotAvailableException e) {
            writeBlockedReceipt("arcore-session-unavailable:" + safe(e.getMessage()));
        }
    }

    @Override
    public void onSurfaceCreated(GL10 gl, EGLConfig config) {
        int[] textures = new int[1];
        GLES20.glGenTextures(1, textures, 0);
        cameraTextureId = textures[0];
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTextureId);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        if (session != null) session.setCameraTextureName(cameraTextureId);
    }

    @Override
    public void onSurfaceChanged(GL10 gl, int width, int height) {
        GLES20.glViewport(0, 0, width, height);
    }

    @Override
    public void onDrawFrame(GL10 gl) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        if (session == null || cameraTextureId <= 0 || wroteReceipt.get()) return;
        frameAttempts++;
        try {
            session.setCameraTextureName(cameraTextureId);
            Frame frame = session.update();
            captureFrame(frame);
        } catch (CameraNotAvailableException e) {
            writeBlockedReceipt("camera-not-available:" + safe(e.getMessage()));
        } catch (Throwable t) {
            lastDepthError = safe(t.getClass().getSimpleName() + ":" + t.getMessage());
        }

        long elapsed = SystemClock.elapsedRealtime() - startedAtMs;
        if (!wroteReceipt.get() && (frameAttempts >= MAX_FRAME_ATTEMPTS || elapsed >= MAX_CAPTURE_MS)) {
            writeBlockedReceipt("depth-frame-timeout:last=" + lastDepthError
                + ":bestCoverage=" + String.format(Locale.US, "%.3f", bestDepthCoverage));
        }
    }

    private void captureFrame(Frame frame) throws Exception {
        Image depthImage = null;
        Image cameraImage = null;
        Image confidenceImage = null;
        try {
            try {
                depthImage = frame.acquireDepthImage16Bits();
            } catch (NotYetAvailableException e) {
                lastDepthError = "depth-not-yet-available";
                return;
            }

            // Coverage gate — keep capturing until ARCore depth-from-motion has resolved
            // real geometry. Without this we capture the first (empty) frame and quit.
            float coverage = depthCoverage(depthImage);
            bestDepthCoverage = Math.max(bestDepthCoverage, coverage);
            long elapsedMs = SystemClock.elapsedRealtime() - startedAtMs;
            boolean timedOut = elapsedMs >= MAX_CAPTURE_MS || frameAttempts >= MAX_FRAME_ATTEMPTS;
            if (coverage < MIN_DEPTH_COVERAGE && !timedOut) {
                lastDepthError = "depth-converging:coverage=" + String.format(Locale.US, "%.3f", coverage);
                return; // keep moving the phone — depth still resolving
            }

            try {
                cameraImage = frame.acquireCameraImage();
            } catch (NotYetAvailableException e) {
                lastDepthError = "camera-image-not-yet-available";
                return;
            }

            try {
                confidenceImage = frame.acquireRawDepthConfidenceImage();
            } catch (Throwable ignored) {
                confidenceImage = null;
            }

            JSONObject receipt = buildPassReceipt(frame, depthImage, cameraImage, confidenceImage);
            writeReceipt(receipt);
        } finally {
            if (confidenceImage != null) confidenceImage.close();
            if (cameraImage != null) cameraImage.close();
            if (depthImage != null) depthImage.close();
        }
    }

    private JSONObject buildPassReceipt(Frame frame, Image depthImage, Image cameraImage, Image confidenceImage)
        throws Exception {
        Camera camera = frame.getCamera();
        CameraIntrinsics intrinsics = camera.getImageIntrinsics();
        int[] imageDimensions = intrinsics.getImageDimensions();
        float[] focalLength = intrinsics.getFocalLength();
        float[] principalPoint = intrinsics.getPrincipalPoint();
        float[] poseMatrix = new float[16];
        Pose pose = camera.getPose();
        pose.toMatrix(poseMatrix, 0);

        int[] rgb = sampleCameraColorAsRgb(cameraImage, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        int[] depth = sampleDepthMillimeters(depthImage, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        int[] confidence = confidenceImage == null
            ? null
            : sampleConfidence(confidenceImage, SAMPLE_WIDTH, SAMPLE_HEIGHT);

        JSONObject receipt = new JSONObject();
        receipt.put("schemaVersion", "holomap-android-arcore-depth-frame/v1");
        receipt.put("status", "pass");
        receipt.put("deviceModel", android.os.Build.MODEL);
        receipt.put("manufacturer", android.os.Build.MANUFACTURER);
        receipt.put("androidRelease", android.os.Build.VERSION.RELEASE);
        receipt.put("androidSdk", android.os.Build.VERSION.SDK_INT);
        receipt.put("arcorePackage", "com.google.ar.core");
        receipt.put("frameAttempts", frameAttempts);
        receipt.put("depthCoverage", Double.parseDouble(String.format(Locale.US, "%.4f", bestDepthCoverage)));
        receipt.put("timestampNs", frame.getTimestamp());
        receipt.put("sample", new JSONObject()
            .put("width", SAMPLE_WIDTH)
            .put("height", SAMPLE_HEIGHT)
            .put("stride", 3)
            .put("colorSpace", "rgb-yuv420-converted")
            .put("rgb", toJsonArray(rgb))
            .put("depthMillimeters", toJsonArray(depth))
            .put("rawDepthConfidence", confidence == null ? JSONObject.NULL : toJsonArray(confidence)));
        receipt.put("cameraImage", new JSONObject()
            .put("width", cameraImage.getWidth())
            .put("height", cameraImage.getHeight())
            .put("format", cameraImage.getFormat()));
        receipt.put("depthImage16Bits", new JSONObject()
            .put("width", depthImage.getWidth())
            .put("height", depthImage.getHeight())
            .put("format", depthImage.getFormat())
            .put("planePixelStride", depthImage.getPlanes()[0].getPixelStride())
            .put("planeRowStride", depthImage.getPlanes()[0].getRowStride()));
        receipt.put("intrinsics", new JSONObject()
            .put("imageWidth", imageDimensions[0])
            .put("imageHeight", imageDimensions[1])
            .put("fx", focalLength[0])
            .put("fy", focalLength[1])
            .put("cx", principalPoint[0])
            .put("cy", principalPoint[1])
            .put("source", "arcore-camera-image-intrinsics"));
        receipt.put("cameraTransformColumnMajor4x4", toJsonArray(poseMatrix));
        receipt.put("hashes", new JSONObject()
            .put("sampleRgbSha256", sha256(rgb))
            .put("sampleDepthSha256", sha256(depth)));
        receipt.put("honestScope", "Native ARCore Session captured a coverage-gated converged "
            + "depth frame plus a full-color YUV->RGB camera image; sample is "
            + SAMPLE_WIDTH + "x" + SAMPLE_HEIGHT + " for ADB transport.");
        return receipt;
    }

    // Full-color sampler: YUV_420_888 -> RGB (BT.601). The old probe only read the Y
    // (luma) plane and produced grayscale; real color needs the U/V chroma planes.
    private int[] sampleCameraColorAsRgb(Image image, int outWidth, int outHeight) {
        Image.Plane[] planes = image.getPlanes();
        ByteBuffer yBuf = planes[0].getBuffer().duplicate();
        ByteBuffer uBuf = planes[1].getBuffer().duplicate();
        ByteBuffer vBuf = planes[2].getBuffer().duplicate();
        int yRow = planes[0].getRowStride(), yPix = planes[0].getPixelStride();
        int uRow = planes[1].getRowStride(), uPix = planes[1].getPixelStride();
        int vRow = planes[2].getRowStride(), vPix = planes[2].getPixelStride();
        int w = image.getWidth(), h = image.getHeight();
        int[] rgb = new int[outWidth * outHeight * 3];
        for (int oy = 0; oy < outHeight; oy++) {
            int sy = Math.min(h - 1, (int) (((oy + 0.5f) * h) / outHeight));
            for (int ox = 0; ox < outWidth; ox++) {
                int sx = Math.min(w - 1, (int) (((ox + 0.5f) * w) / outWidth));
                int yy = yBuf.get(sy * yRow + sx * yPix) & 0xFF;
                int uvX = sx / 2, uvY = sy / 2;
                int uu = uBuf.get(uvY * uRow + uvX * uPix) & 0xFF;
                int vv = vBuf.get(uvY * vRow + uvX * vPix) & 0xFF;
                float yf = yy, uf = uu - 128f, vf = vv - 128f;
                int r = clamp8((int) (yf + 1.402f * vf));
                int g = clamp8((int) (yf - 0.344136f * uf - 0.714136f * vf));
                int b = clamp8((int) (yf + 1.772f * uf));
                int dst = (oy * outWidth + ox) * 3;
                rgb[dst] = r;
                rgb[dst + 1] = g;
                rgb[dst + 2] = b;
            }
        }
        return rgb;
    }

    private static int clamp8(int v) {
        return v < 0 ? 0 : (v > 255 ? 255 : v);
    }

    // Fraction of depth pixels with a non-zero (resolved) range.
    private float depthCoverage(Image depthImage) {
        Image.Plane plane = depthImage.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer().duplicate().order(ByteOrder.LITTLE_ENDIAN);
        int rowStride = plane.getRowStride();
        int pixelStride = plane.getPixelStride();
        int w = depthImage.getWidth(), h = depthImage.getHeight();
        if (w == 0 || h == 0) return 0f;
        int nonzero = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int d = buffer.getShort(y * rowStride + x * pixelStride) & 0xFFFF;
                if (d > 0) nonzero++;
            }
        }
        return (float) nonzero / (w * h);
    }

    private int[] sampleDepthMillimeters(Image image, int outWidth, int outHeight) {
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer().duplicate().order(ByteOrder.LITTLE_ENDIAN);
        int rowStride = plane.getRowStride();
        int pixelStride = plane.getPixelStride();
        int[] depth = new int[outWidth * outHeight];
        for (int y = 0; y < outHeight; y++) {
            int srcY = Math.min(image.getHeight() - 1, (int) (((y + 0.5f) * image.getHeight()) / outHeight));
            for (int x = 0; x < outWidth; x++) {
                int srcX = Math.min(image.getWidth() - 1, (int) (((x + 0.5f) * image.getWidth()) / outWidth));
                int offset = srcY * rowStride + srcX * pixelStride;
                depth[y * outWidth + x] = buffer.getShort(offset) & 0xFFFF;
            }
        }
        return depth;
    }

    private int[] sampleConfidence(Image image, int outWidth, int outHeight) {
        Image.Plane plane = image.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer().duplicate();
        int rowStride = plane.getRowStride();
        int pixelStride = plane.getPixelStride();
        int[] confidence = new int[outWidth * outHeight];
        for (int y = 0; y < outHeight; y++) {
            int srcY = Math.min(image.getHeight() - 1, (int) (((y + 0.5f) * image.getHeight()) / outHeight));
            for (int x = 0; x < outWidth; x++) {
                int srcX = Math.min(image.getWidth() - 1, (int) (((x + 0.5f) * image.getWidth()) / outWidth));
                int offset = srcY * rowStride + srcX * pixelStride;
                confidence[y * outWidth + x] = buffer.get(offset) & 0xFF;
            }
        }
        return confidence;
    }

    private JSONArray toJsonArray(int[] values) {
        JSONArray array = new JSONArray();
        for (int value : values) array.put(value);
        return array;
    }

    private JSONArray toJsonArray(float[] values) throws Exception {
        JSONArray array = new JSONArray();
        for (float value : values) array.put(Double.parseDouble(String.format(Locale.US, "%.7f", value)));
        return array;
    }

    private String sha256(int[] values) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        ByteBuffer buffer = ByteBuffer.allocate(values.length * 4).order(ByteOrder.LITTLE_ENDIAN);
        for (int value : values) buffer.putInt(value);
        byte[] hash = digest.digest(buffer.array());
        StringBuilder out = new StringBuilder("sha256:");
        for (byte b : hash) out.append(String.format(Locale.US, "%02x", b));
        return out.toString();
    }

    private void writeBlockedReceipt(String reason) {
        try {
            JSONObject receipt = new JSONObject();
            receipt.put("schemaVersion", "holomap-android-arcore-depth-frame/v1");
            receipt.put("status", "blocked");
            receipt.put("blockedReason", reason);
            receipt.put("frameAttempts", frameAttempts);
            receipt.put("deviceModel", android.os.Build.MODEL);
            receipt.put("honestScope", "Native ARCore depth-frame proof did not acquire a converged depth frame.");
            writeReceipt(receipt);
        } catch (Exception e) {
            Log.e(TAG, "Failed to write blocked receipt", e);
        }
    }

    private void writeReceipt(JSONObject receipt) throws Exception {
        if (!wroteReceipt.compareAndSet(false, true)) return;
        File out = new File(getFilesDir(), "holomap-arcore-depth-frame.json");
        try (FileOutputStream stream = new FileOutputStream(out)) {
            stream.write(receipt.toString(2).getBytes(StandardCharsets.UTF_8));
            stream.write('\n');
        }
        Log.i(TAG, "HOLOMAP_DEPTH_PROBE_RESULT=" + receipt.getString("status") + " path=" + out.getAbsolutePath());
        runOnUiThread(this::finish);
    }

    private String safe(String text) {
        return text == null ? "" : text.replace('\n', ' ').replace('\r', ' ');
    }
}
