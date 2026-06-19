package com.holoscript.depthprobe;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.Image;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Camera;
import com.google.ar.core.CameraIntrinsics;
import com.google.ar.core.Config;
import com.google.ar.core.Coordinates2d;
import com.google.ar.core.Frame;
import com.google.ar.core.Pose;
import com.google.ar.core.Session;
import com.google.ar.core.TrackingState;
import com.google.ar.core.exceptions.CameraNotAvailableException;
import com.google.ar.core.exceptions.NotYetAvailableException;
import com.google.ar.core.exceptions.UnavailableException;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * HoloMap ARCore room-sweep probe.
 *
 * A real on-device capture interface: live camera viewfinder + status overlay
 * (depth coverage, frames captured, elapsed) + a Finish button. Captures MANY
 * coverage-gated, posed depth+color frames across a slow sweep so the host can
 * merge them (via each frame's camera pose) into a dense room reconstruction.
 */
public final class MainActivity extends Activity implements GLSurfaceView.Renderer {
    private static final String TAG = "HoloMapDepthProbe";
    private static final int CAMERA_PERMISSION_REQUEST = 1001;
    private static final int SAMPLE_WIDTH = 160;
    private static final int SAMPLE_HEIGHT = 90;
    private static final float MIN_DEPTH_COVERAGE = 0.12f;
    private static final int TARGET_FRAMES = 40;
    private static final float MIN_MOVE_M = 0.04f;          // spatial spacing between kept frames
    private static final long MIN_CAPTURE_INTERVAL_MS = 350L;
    private static final long MAX_CAPTURE_MS = 150000L;      // run much longer — up to 2.5 min

    // UI
    private GLSurfaceView surfaceView;
    private TextView hintText;
    private TextView statusText;
    private ProgressBar progress;

    // ARCore
    private Session session;
    private boolean installRequested;
    private int cameraTextureId = -1;
    private final BackgroundRenderer background = new BackgroundRenderer();

    // capture state
    private long startedAtMs;
    private long lastCaptureMs;
    private int frameAttempts;
    private float[] lastPose;
    private JSONObject intrinsicsJson;
    private int sampleColorFormat;
    private final JSONArray frames = new JSONArray();
    private volatile boolean finishRequested;
    private final AtomicBoolean wroteReceipt = new AtomicBoolean(false);
    private String lastError = "starting";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);

        surfaceView = new GLSurfaceView(this);
        surfaceView.setEGLContextClientVersion(2);
        surfaceView.setPreserveEGLContextOnPause(true);
        surfaceView.setRenderer(this);
        surfaceView.setRenderMode(GLSurfaceView.RENDERMODE_CONTINUOUSLY);
        root.addView(surfaceView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));

        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.VERTICAL);
        top.setBackgroundColor(0xBB0A0E16);
        top.setPadding(40, 64, 40, 32);
        hintText = new TextView(this);
        hintText.setTextColor(Color.WHITE);
        hintText.setTextSize(22);
        hintText.setText("Slowly sweep the room — keep moving");
        statusText = new TextView(this);
        statusText.setTextColor(0xFF8EE6C0);
        statusText.setTextSize(16);
        statusText.setText("Starting ARCore…");
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(TARGET_FRAMES);
        progress.setProgress(0);
        top.addView(hintText);
        top.addView(statusText);
        top.addView(progress, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        FrameLayout.LayoutParams topLp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        topLp.gravity = Gravity.TOP;
        root.addView(top, topLp);

        Button finishBtn = new Button(this);
        finishBtn.setText("FINISH & SAVE");
        finishBtn.setTextSize(18);
        finishBtn.setPadding(48, 24, 48, 24);
        finishBtn.setOnClickListener(new View.OnClickListener() {
            @Override public void onClick(View v) { finishRequested = true; }
        });
        FrameLayout.LayoutParams btnLp = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT);
        btnLp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        btnLp.bottomMargin = 96;
        root.addView(finishBtn, btnLp);

        setContentView(root);
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
        if (session != null) { session.close(); session = null; }
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
        background.init(cameraTextureId);
        if (session != null) session.setCameraTextureName(cameraTextureId);
    }

    @Override
    public void onSurfaceChanged(GL10 gl, int width, int height) {
        GLES20.glViewport(0, 0, width, height);
        if (session != null) {
            int rotation = getWindowManager().getDefaultDisplay().getRotation();
            session.setDisplayGeometry(rotation, width, height);
        }
    }

    @Override
    public void onDrawFrame(GL10 gl) {
        GLES20.glClearColor(0f, 0f, 0f, 1f);
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT | GLES20.GL_DEPTH_BUFFER_BIT);
        if (session == null || cameraTextureId <= 0 || wroteReceipt.get()) return;
        frameAttempts++;
        try {
            session.setCameraTextureName(cameraTextureId);
            Frame frame = session.update();
            background.draw(frame);           // live viewfinder
            handleFrame(frame);
        } catch (CameraNotAvailableException e) {
            writeBlockedReceipt("camera-not-available:" + safe(e.getMessage()));
        } catch (Throwable t) {
            lastError = safe(t.getClass().getSimpleName() + ":" + t.getMessage());
        }
    }

    private void handleFrame(Frame frame) throws Exception {
        long now = SystemClock.elapsedRealtime();
        long elapsed = now - startedAtMs;
        Camera cam = frame.getCamera();
        if (cam.getTrackingState() != TrackingState.TRACKING) {
            setStatus("Move slowly to start tracking…", elapsed);
            maybeFinish(now, false);
            return;
        }

        Image depthImage = null;
        Image cameraImage = null;
        try {
            try {
                depthImage = frame.acquireDepthImage16Bits();
            } catch (NotYetAvailableException e) {
                setStatus("Resolving depth — keep moving", elapsed);
                maybeFinish(now, false);
                return;
            }

            float coverage = depthCoverage(depthImage);
            if (coverage < MIN_DEPTH_COVERAGE) {
                setStatus(String.format(Locale.US, "Depth converging… %d%%", (int) (coverage * 100)), elapsed);
                maybeFinish(now, false);
                return;
            }

            float[] pose = new float[16];
            cam.getPose().toMatrix(pose, 0);
            boolean moved = lastPose == null || translation(pose, lastPose) >= MIN_MOVE_M;
            boolean spaced = now - lastCaptureMs >= MIN_CAPTURE_INTERVAL_MS;

            if (moved && spaced && frames.length() < TARGET_FRAMES) {
                try {
                    cameraImage = frame.acquireCameraImage();
                } catch (NotYetAvailableException e) {
                    maybeFinish(now, false);
                    return;
                }
                appendFrame(frame, cam, depthImage, cameraImage, pose, coverage);
                lastPose = pose;
                lastCaptureMs = now;
            }
            int n = frames.length();
            setStatus(String.format(Locale.US, "Captured %d / %d frames — sweep wider", n, TARGET_FRAMES), elapsed);
            runOnUiThread(new Runnable() { @Override public void run() { progress.setProgress(n); } });
            maybeFinish(now, false);
        } finally {
            if (cameraImage != null) cameraImage.close();
            if (depthImage != null) depthImage.close();
        }
    }

    private void maybeFinish(long now, boolean force) {
        if (wroteReceipt.get()) return;
        boolean done = force || finishRequested
            || frames.length() >= TARGET_FRAMES
            || (now - startedAtMs >= MAX_CAPTURE_MS);
        if (!done) return;
        if (frames.length() > 0) {
            writeSweepReceipt();
        } else if (now - startedAtMs >= MAX_CAPTURE_MS || finishRequested) {
            writeBlockedReceipt("no-converged-frames:last=" + lastError);
        }
    }

    private void appendFrame(Frame frame, Camera cam, Image depthImage, Image cameraImage, float[] pose, float coverage)
        throws Exception {
        if (intrinsicsJson == null) {
            CameraIntrinsics in = cam.getImageIntrinsics();
            int[] dim = in.getImageDimensions();
            float[] f = in.getFocalLength();
            float[] pp = in.getPrincipalPoint();
            intrinsicsJson = new JSONObject()
                .put("imageWidth", dim[0]).put("imageHeight", dim[1])
                .put("fx", f[0]).put("fy", f[1]).put("cx", pp[0]).put("cy", pp[1])
                .put("source", "arcore-camera-image-intrinsics");
            sampleColorFormat = cameraImage.getFormat();
        }
        int[] rgb = sampleCameraColorAsRgb(cameraImage, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        int[] depth = sampleDepthMillimeters(depthImage, SAMPLE_WIDTH, SAMPLE_HEIGHT);
        JSONObject f = new JSONObject()
            .put("index", frames.length())
            .put("timestampNs", frame.getTimestamp())
            .put("depthCoverage", round4(coverage))
            .put("cameraTransformColumnMajor4x4", toJsonArray(pose))
            .put("rgb", toJsonArray(rgb))
            .put("depthMillimeters", toJsonArray(depth));
        frames.put(f);
    }

    private void writeSweepReceipt() {
        try {
            JSONObject receipt = new JSONObject();
            receipt.put("schemaVersion", "holomap-android-arcore-depth-sweep/v1");
            receipt.put("status", "pass");
            receipt.put("deviceModel", android.os.Build.MODEL);
            receipt.put("manufacturer", android.os.Build.MANUFACTURER);
            receipt.put("androidRelease", android.os.Build.VERSION.RELEASE);
            receipt.put("androidSdk", android.os.Build.VERSION.SDK_INT);
            receipt.put("frameAttempts", frameAttempts);
            receipt.put("frameCount", frames.length());
            receipt.put("durationMs", SystemClock.elapsedRealtime() - startedAtMs);
            receipt.put("sample", new JSONObject()
                .put("width", SAMPLE_WIDTH).put("height", SAMPLE_HEIGHT)
                .put("stride", 3).put("colorSpace", "rgb-yuv420-converted")
                .put("cameraImageFormat", sampleColorFormat));
            receipt.put("intrinsics", intrinsicsJson);
            receipt.put("frames", frames);
            receipt.put("honestScope", "Native ARCore room sweep: " + frames.length()
                + " coverage-gated, motion-spaced, posed depth+color frames for host-side"
                + " pose-merged reconstruction.");
            writeReceipt(receipt, "sweep pass");
        } catch (Exception e) {
            Log.e(TAG, "writeSweepReceipt failed", e);
        }
    }

    // ---- sampling helpers ----

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
                int dst = (oy * outWidth + ox) * 3;
                rgb[dst] = clamp8((int) (yf + 1.402f * vf));
                rgb[dst + 1] = clamp8((int) (yf - 0.344136f * uf - 0.714136f * vf));
                rgb[dst + 2] = clamp8((int) (yf + 1.772f * uf));
            }
        }
        return rgb;
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
                depth[y * outWidth + x] = buffer.getShort(srcY * rowStride + srcX * pixelStride) & 0xFFFF;
            }
        }
        return depth;
    }

    private float depthCoverage(Image depthImage) {
        Image.Plane plane = depthImage.getPlanes()[0];
        ByteBuffer buffer = plane.getBuffer().duplicate().order(ByteOrder.LITTLE_ENDIAN);
        int rowStride = plane.getRowStride(), pixelStride = plane.getPixelStride();
        int w = depthImage.getWidth(), h = depthImage.getHeight();
        if (w == 0 || h == 0) return 0f;
        int nonzero = 0;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                if ((buffer.getShort(y * rowStride + x * pixelStride) & 0xFFFF) > 0) nonzero++;
            }
        }
        return (float) nonzero / (w * h);
    }

    private static float translation(float[] a, float[] b) {
        float dx = a[12] - b[12], dy = a[13] - b[13], dz = a[14] - b[14];
        return (float) Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    private static int clamp8(int v) { return v < 0 ? 0 : (v > 255 ? 255 : v); }
    private static double round4(float v) { return Double.parseDouble(String.format(Locale.US, "%.4f", v)); }

    private JSONArray toJsonArray(int[] values) {
        JSONArray a = new JSONArray();
        for (int v : values) a.put(v);
        return a;
    }
    private JSONArray toJsonArray(float[] values) throws Exception {
        JSONArray a = new JSONArray();
        for (float v : values) a.put(Double.parseDouble(String.format(Locale.US, "%.7f", v)));
        return a;
    }

    private void setStatus(final String s, final long elapsedMs) {
        final String line = s + "   ·   " + (elapsedMs / 1000) + "s";
        runOnUiThread(new Runnable() { @Override public void run() { if (statusText != null) statusText.setText(line); } });
    }

    private void writeBlockedReceipt(String reason) {
        try {
            JSONObject receipt = new JSONObject();
            receipt.put("schemaVersion", "holomap-android-arcore-depth-sweep/v1");
            receipt.put("status", "blocked");
            receipt.put("blockedReason", reason);
            receipt.put("frameAttempts", frameAttempts);
            receipt.put("frameCount", frames.length());
            receipt.put("deviceModel", android.os.Build.MODEL);
            receipt.put("honestScope", "Native ARCore room sweep did not capture any converged frames.");
            writeReceipt(receipt, "blocked:" + reason);
        } catch (Exception e) {
            Log.e(TAG, "writeBlockedReceipt failed", e);
        }
    }

    private void writeReceipt(JSONObject receipt, String label) throws Exception {
        if (!wroteReceipt.compareAndSet(false, true)) return;
        File out = new File(getFilesDir(), "holomap-arcore-depth-frame.json");
        try (FileOutputStream stream = new FileOutputStream(out)) {
            stream.write(receipt.toString().getBytes(StandardCharsets.UTF_8));
            stream.write('\n');
        }
        Log.i(TAG, "HOLOMAP_DEPTH_PROBE_RESULT=" + receipt.getString("status") + " (" + label + ") path=" + out.getAbsolutePath());
        runOnUiThread(new Runnable() {
            @Override public void run() {
                if (hintText != null) hintText.setText("Saved — " + frames.length() + " frames. You can close this.");
                finish();
            }
        });
    }

    private String safe(String text) {
        return text == null ? "" : text.replace('\n', ' ').replace('\r', ' ');
    }

    // ---- camera background (live viewfinder) ----

    private static final class BackgroundRenderer {
        private static final float[] NDC_QUAD = { -1f, -1f, +1f, -1f, -1f, +1f, +1f, +1f };
        private FloatBuffer ndcBuffer;
        private FloatBuffer texBuffer;
        private int program;
        private int aPosition;
        private int aTexCoord;
        private int uTexture;
        private int textureId;
        private boolean texInit;

        void init(int texId) {
            this.textureId = texId;
            ndcBuffer = floatBuffer(NDC_QUAD);
            texBuffer = floatBuffer(new float[8]);
            String vs = "attribute vec4 a_Position;\nattribute vec2 a_TexCoord;\nvarying vec2 v_TexCoord;\n"
                + "void main(){ gl_Position = a_Position; v_TexCoord = a_TexCoord; }";
            String fs = "#extension GL_OES_EGL_image_external : require\nprecision mediump float;\n"
                + "varying vec2 v_TexCoord;\nuniform samplerExternalOES u_Texture;\n"
                + "void main(){ gl_FragColor = texture2D(u_Texture, v_TexCoord); }";
            int v = compile(GLES20.GL_VERTEX_SHADER, vs);
            int f = compile(GLES20.GL_FRAGMENT_SHADER, fs);
            program = GLES20.glCreateProgram();
            GLES20.glAttachShader(program, v);
            GLES20.glAttachShader(program, f);
            GLES20.glLinkProgram(program);
            aPosition = GLES20.glGetAttribLocation(program, "a_Position");
            aTexCoord = GLES20.glGetAttribLocation(program, "a_TexCoord");
            uTexture = GLES20.glGetUniformLocation(program, "u_Texture");
        }

        void draw(Frame frame) {
            if (frame.hasDisplayGeometryChanged() || !texInit) {
                frame.transformCoordinates2d(
                    Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES, ndcBuffer,
                    Coordinates2d.TEXTURE_NORMALIZED, texBuffer);
                texInit = true;
            }
            if (program == 0) return;
            GLES20.glDisable(GLES20.GL_DEPTH_TEST);
            GLES20.glDepthMask(false);
            GLES20.glUseProgram(program);
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0);
            GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, textureId);
            GLES20.glUniform1i(uTexture, 0);
            ndcBuffer.position(0);
            texBuffer.position(0);
            GLES20.glVertexAttribPointer(aPosition, 2, GLES20.GL_FLOAT, false, 0, ndcBuffer);
            GLES20.glVertexAttribPointer(aTexCoord, 2, GLES20.GL_FLOAT, false, 0, texBuffer);
            GLES20.glEnableVertexAttribArray(aPosition);
            GLES20.glEnableVertexAttribArray(aTexCoord);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
            GLES20.glDisableVertexAttribArray(aPosition);
            GLES20.glDisableVertexAttribArray(aTexCoord);
            GLES20.glDepthMask(true);
            GLES20.glEnable(GLES20.GL_DEPTH_TEST);
        }

        private static int compile(int type, String src) {
            int s = GLES20.glCreateShader(type);
            GLES20.glShaderSource(s, src);
            GLES20.glCompileShader(s);
            return s;
        }

        private static FloatBuffer floatBuffer(float[] data) {
            ByteBuffer bb = ByteBuffer.allocateDirect(data.length * 4);
            bb.order(ByteOrder.nativeOrder());
            FloatBuffer fb = bb.asFloatBuffer();
            fb.put(data);
            fb.position(0);
            return fb;
        }
    }
}
