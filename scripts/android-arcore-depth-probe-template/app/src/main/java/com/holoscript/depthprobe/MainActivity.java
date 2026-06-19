package com.holoscript.depthprobe;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.media.Image;
import android.opengl.GLES11Ext;
import android.opengl.GLES20;
import android.opengl.GLSurfaceView;
import android.os.Bundle;
import android.os.SystemClock;
import android.util.Log;
import android.util.Size;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import com.google.ar.core.ArCoreApk;
import com.google.ar.core.Camera;
import com.google.ar.core.CameraConfig;
import com.google.ar.core.CameraConfigFilter;
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
import java.util.List;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/**
 * HoloMap ARCore high-quality room-sweep probe (v3).
 *
 * Uses the S23's highest-resolution ARCore camera config and banks FULL-RES JPEG
 * frames (not a 160x90 inline downsample). Each kept frame must pass a sharpness
 * gate (variance-of-Laplacian) and a depth-coverage gate, and is spaced by motion.
 * Outputs to external files dir for easy adb pull:
 *   <ext>/sweep/frames/frame_NNN.jpg   (full-res RGB, the training supervision)
 *   <ext>/sweep/manifest.json          (per-frame pose + intrinsics + depth + scores)
 */
public final class MainActivity extends Activity implements GLSurfaceView.Renderer {
    private static final String TAG = "HoloMapDepthProbe";
    private static final int CAMERA_PERMISSION_REQUEST = 1001;
    private static final int DEPTH_W = 160, DEPTH_H = 90;        // depth sample (init only)
    private static final float MIN_DEPTH_COVERAGE = 0.12f;
    private static final double MIN_SHARPNESS = 120.0;           // var-of-Laplacian; reject blur
    private static final int TARGET_FRAMES = 40;
    private static final float MIN_MOVE_M = 0.05f;
    private static final long MIN_CAPTURE_INTERVAL_MS = 400L;
    private static final long MAX_CAPTURE_MS = 180000L;

    private GLSurfaceView surfaceView;
    private TextView hintText, statusText;
    private ProgressBar progress;

    private Session session;
    private boolean installRequested;
    private int cameraTextureId = -1;
    private final BackgroundRenderer background = new BackgroundRenderer();

    private long startedAtMs, lastCaptureMs;
    private int frameAttempts;
    private float[] lastPose;
    private JSONObject intrinsicsJson;
    private int camImgW, camImgH;
    private final JSONArray frames = new JSONArray();
    private File sweepDir, framesDir;
    private volatile boolean finishRequested;
    private final AtomicBoolean wroteReceipt = new AtomicBoolean(false);
    private String lastError = "starting";
    private double lastSharp = 0;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        sweepDir = new File(getExternalFilesDir(null), "sweep");
        framesDir = new File(sweepDir, "frames");
        deleteRec(sweepDir);
        framesDir.mkdirs();

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
        hintText.setText("Sweep slowly — hold steady for sharp frames");
        statusText = new TextView(this);
        statusText.setTextColor(0xFF8EE6C0);
        statusText.setTextSize(15);
        statusText.setText("Starting high-res camera…");
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setMax(TARGET_FRAMES);
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

    @Override protected void onPause() { surfaceView.onPause(); if (session != null) session.pause(); super.onPause(); }
    @Override protected void onDestroy() { if (session != null) { session.close(); session = null; } super.onDestroy(); }

    @Override
    public void onRequestPermissionsResult(int rc, String[] p, int[] g) {
        super.onRequestPermissionsResult(rc, p, g);
        if (rc == CAMERA_PERMISSION_REQUEST) {
            if (g.length > 0 && g[0] == PackageManager.PERMISSION_GRANTED) { ensureSession(); surfaceView.onResume(); }
            else writeBlocked("camera-permission-denied");
        }
    }

    private void ensureSession() {
        if (session != null || wroteReceipt.get()) return;
        try {
            ArCoreApk.InstallStatus st = ArCoreApk.getInstance().requestInstall(this, !installRequested);
            if (st == ArCoreApk.InstallStatus.INSTALL_REQUESTED) { installRequested = true; return; }
            session = new Session(this);

            // pick the highest-resolution CPU camera config the device offers
            CameraConfigFilter filter = new CameraConfigFilter(session);
            List<CameraConfig> configs = session.getSupportedCameraConfigs(filter);
            CameraConfig best = null; int bestArea = 0;
            for (CameraConfig cc : configs) {
                Size sz = cc.getImageSize();
                int area = sz.getWidth() * sz.getHeight();
                if (area > bestArea) { bestArea = area; best = cc; }
            }
            if (best != null) { session.setCameraConfig(best); camImgW = best.getImageSize().getWidth(); camImgH = best.getImageSize().getHeight(); }

            Config config = new Config(session);
            if (!session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) { writeBlocked("depth-mode-not-supported"); return; }
            config.setDepthMode(Config.DepthMode.AUTOMATIC);
            config.setFocusMode(Config.FocusMode.AUTO);
            session.configure(config);
            session.resume();
            if (cameraTextureId > 0) session.setCameraTextureName(cameraTextureId);
        } catch (UnavailableException | CameraNotAvailableException e) {
            writeBlocked("arcore-unavailable:" + safe(e.getMessage()));
        }
    }

    @Override
    public void onSurfaceCreated(GL10 gl, EGLConfig c) {
        int[] t = new int[1];
        GLES20.glGenTextures(1, t, 0);
        cameraTextureId = t[0];
        GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, cameraTextureId);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_S, GLES20.GL_CLAMP_TO_EDGE);
        GLES20.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES20.GL_TEXTURE_WRAP_T, GLES20.GL_CLAMP_TO_EDGE);
        background.init(cameraTextureId);
        if (session != null) session.setCameraTextureName(cameraTextureId);
    }

    @Override
    public void onSurfaceChanged(GL10 gl, int w, int h) {
        GLES20.glViewport(0, 0, w, h);
        if (session != null) session.setDisplayGeometry(getWindowManager().getDefaultDisplay().getRotation(), w, h);
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
            background.draw(frame);
            handleFrame(frame);
        } catch (CameraNotAvailableException e) {
            writeBlocked("camera-not-available:" + safe(e.getMessage()));
        } catch (Throwable t) {
            lastError = safe(t.getClass().getSimpleName() + ":" + t.getMessage());
        }
    }

    private void handleFrame(Frame frame) throws Exception {
        long now = SystemClock.elapsedRealtime(), elapsed = now - startedAtMs;
        Camera cam = frame.getCamera();
        if (cam.getTrackingState() != TrackingState.TRACKING) { setStatus("Move to start tracking…", elapsed); maybeFinish(now); return; }

        Image depth = null, color = null;
        try {
            try { depth = frame.acquireDepthImage16Bits(); }
            catch (NotYetAvailableException e) { setStatus("Resolving depth — keep moving", elapsed); maybeFinish(now); return; }
            float cov = depthCoverage(depth);
            if (cov < MIN_DEPTH_COVERAGE) { setStatus(String.format(Locale.US, "Depth converging… %d%%", (int)(cov*100)), elapsed); maybeFinish(now); return; }

            float[] pose = new float[16]; cam.getPose().toMatrix(pose, 0);
            boolean moved = lastPose == null || translation(pose, lastPose) >= MIN_MOVE_M;
            boolean spaced = now - lastCaptureMs >= MIN_CAPTURE_INTERVAL_MS;
            if (!(moved && spaced) || frames.length() >= TARGET_FRAMES) { setStatus(String.format(Locale.US, "%d/%d frames — move to a new view", frames.length(), TARGET_FRAMES), elapsed); maybeFinish(now); return; }

            try { color = frame.acquireCameraImage(); }
            catch (NotYetAvailableException e) { maybeFinish(now); return; }

            double sharp = sharpness(color);
            lastSharp = sharp;
            if (sharp < MIN_SHARPNESS) { setStatus(String.format(Locale.US, "Too blurry (%.0f) — hold steady", sharp), elapsed); return; }

            bankFrame(frame, cam, depth, color, pose, cov, sharp);
            lastPose = pose; lastCaptureMs = now;
            final int n = frames.length();
            setStatus(String.format(Locale.US, "Banked %d/%d  sharp %.0f  cov %d%%", n, TARGET_FRAMES, sharp, (int)(cov*100)), elapsed);
            runOnUiThread(new Runnable() { @Override public void run() { progress.setProgress(n); } });
            maybeFinish(now);
        } finally {
            if (color != null) color.close();
            if (depth != null) depth.close();
        }
    }

    private void bankFrame(Frame frame, Camera cam, Image depth, Image color, float[] pose, float cov, double sharp) throws Exception {
        if (intrinsicsJson == null) {
            CameraIntrinsics in = cam.getImageIntrinsics();
            int[] dim = in.getImageDimensions(); float[] f = in.getFocalLength(); float[] pp = in.getPrincipalPoint();
            intrinsicsJson = new JSONObject().put("imageWidth", dim[0]).put("imageHeight", dim[1])
                .put("fx", f[0]).put("fy", f[1]).put("cx", pp[0]).put("cy", pp[1]).put("source", "arcore-camera-image-intrinsics");
            camImgW = dim[0]; camImgH = dim[1];
        }
        int idx = frames.length();
        String jpegName = String.format(Locale.US, "frame_%03d.jpg", idx);
        saveJpeg(color, new File(framesDir, jpegName));      // FULL-RES supervision frame
        int[] depthMM = sampleDepth(depth, DEPTH_W, DEPTH_H); // low-res depth for init
        frames.put(new JSONObject()
            .put("index", idx).put("timestampNs", frame.getTimestamp())
            .put("jpeg", "frames/" + jpegName)
            .put("depthCoverage", round4((float) cov)).put("sharpness", Math.round(sharp))
            .put("cameraTransformColumnMajor4x4", toJsonArray(pose))
            .put("depthWidth", DEPTH_W).put("depthHeight", DEPTH_H)
            .put("depthMillimeters", toJsonArray(depthMM)));
    }

    private void maybeFinish(long now) {
        if (wroteReceipt.get()) return;
        boolean done = finishRequested || frames.length() >= TARGET_FRAMES || (now - startedAtMs >= MAX_CAPTURE_MS);
        if (!done) return;
        if (frames.length() > 0) writeManifest();
        else if (finishRequested || now - startedAtMs >= MAX_CAPTURE_MS) writeBlocked("no-quality-frames:last=" + lastError);
    }

    private void writeManifest() {
        try {
            JSONObject m = new JSONObject();
            m.put("schemaVersion", "holomap-arcore-hq-sweep/v1");
            m.put("status", "pass");
            m.put("deviceModel", android.os.Build.MODEL);
            m.put("frameCount", frames.length());
            m.put("durationMs", SystemClock.elapsedRealtime() - startedAtMs);
            m.put("cameraImage", new JSONObject().put("width", camImgW).put("height", camImgH).put("format", "jpeg"));
            m.put("intrinsics", intrinsicsJson);
            m.put("frames", frames);
            m.put("honestScope", "Full-resolution (" + camImgW + "x" + camImgH + ") sharpness-gated JPEG frames + "
                + "ARCore pose + low-res depth for init; " + frames.length() + " banked frames for host-side validation then 3DGS training.");
            File out = new File(sweepDir, "manifest.json");
            try (FileOutputStream s = new FileOutputStream(out)) { s.write(m.toString().getBytes(StandardCharsets.UTF_8)); }
            // also a tiny status receipt at the legacy path so existing pulls see completion
            try (FileOutputStream s = new FileOutputStream(new File(getFilesDir(), "holomap-arcore-depth-frame.json"))) {
                s.write(new JSONObject().put("status", "pass").put("schemaVersion", "holomap-arcore-hq-sweep/v1")
                    .put("frameCount", frames.length()).put("manifest", out.getAbsolutePath()).toString().getBytes(StandardCharsets.UTF_8));
            }
            finalizeUi("Saved " + frames.length() + " full-res frames.");
        } catch (Exception e) { Log.e(TAG, "writeManifest failed", e); }
    }

    // ---- imaging helpers ----

    private void saveJpeg(Image image, File out) throws Exception {
        byte[] nv21 = yuv420ToNv21(image);
        YuvImage yuv = new YuvImage(nv21, ImageFormat.NV21, image.getWidth(), image.getHeight(), null);
        try (FileOutputStream fos = new FileOutputStream(out)) {
            yuv.compressToJpeg(new Rect(0, 0, image.getWidth(), image.getHeight()), 92, fos);
        }
    }

    private byte[] yuv420ToNv21(Image image) {
        int w = image.getWidth(), h = image.getHeight();
        Image.Plane[] p = image.getPlanes();
        byte[] nv21 = new byte[w * h * 3 / 2];
        ByteBuffer yb = p[0].getBuffer(); int yRow = p[0].getRowStride(), yPix = p[0].getPixelStride();
        int o = 0;
        for (int r = 0; r < h; r++) { int base = r * yRow; for (int c = 0; c < w; c++) nv21[o++] = yb.get(base + c * yPix); }
        ByteBuffer ub = p[1].getBuffer(), vb = p[2].getBuffer();
        int uRow = p[1].getRowStride(), uPix = p[1].getPixelStride(), vRow = p[2].getRowStride(), vPix = p[2].getPixelStride();
        int cw = w / 2, ch = h / 2;
        for (int r = 0; r < ch; r++) { int ub0 = r * uRow, vb0 = r * vRow;
            for (int c = 0; c < cw; c++) { nv21[o++] = vb.get(vb0 + c * vPix); nv21[o++] = ub.get(ub0 + c * uPix); } }
        return nv21;
    }

    private double sharpness(Image image) {
        Image.Plane y = image.getPlanes()[0];
        ByteBuffer b = y.getBuffer(); int row = y.getRowStride(), pix = y.getPixelStride(), w = image.getWidth(), h = image.getHeight();
        int step = Math.max(2, w / 320);
        double sum = 0, sum2 = 0; int n = 0;
        for (int yy = step; yy < h - step; yy += step) for (int xx = step; xx < w - step; xx += step) {
            int c = b.get(yy * row + xx * pix) & 0xFF;
            int up = b.get((yy - step) * row + xx * pix) & 0xFF, dn = b.get((yy + step) * row + xx * pix) & 0xFF;
            int lf = b.get(yy * row + (xx - step) * pix) & 0xFF, rt = b.get(yy * row + (xx + step) * pix) & 0xFF;
            double lap = 4.0 * c - up - dn - lf - rt; sum += lap; sum2 += lap * lap; n++;
        }
        if (n == 0) return 0; double mean = sum / n; return sum2 / n - mean * mean;
    }

    private int[] sampleDepth(Image image, int ow, int oh) {
        Image.Plane p = image.getPlanes()[0];
        ByteBuffer b = p.getBuffer().duplicate().order(ByteOrder.LITTLE_ENDIAN);
        int row = p.getRowStride(), pix = p.getPixelStride();
        int[] d = new int[ow * oh];
        for (int y = 0; y < oh; y++) { int sy = Math.min(image.getHeight() - 1, (int)(((y + 0.5f) * image.getHeight()) / oh));
            for (int x = 0; x < ow; x++) { int sx = Math.min(image.getWidth() - 1, (int)(((x + 0.5f) * image.getWidth()) / ow));
                d[y * ow + x] = b.getShort(sy * row + sx * pix) & 0xFFFF; } }
        return d;
    }

    private float depthCoverage(Image d) {
        Image.Plane p = d.getPlanes()[0];
        ByteBuffer b = p.getBuffer().duplicate().order(ByteOrder.LITTLE_ENDIAN);
        int row = p.getRowStride(), pix = p.getPixelStride(), w = d.getWidth(), h = d.getHeight();
        if (w == 0 || h == 0) return 0;
        int nz = 0;
        for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) if ((b.getShort(y * row + x * pix) & 0xFFFF) > 0) nz++;
        return (float) nz / (w * h);
    }

    private static float translation(float[] a, float[] b) {
        float dx = a[12]-b[12], dy = a[13]-b[13], dz = a[14]-b[14]; return (float) Math.sqrt(dx*dx+dy*dy+dz*dz);
    }
    private static double round4(float v) { return Double.parseDouble(String.format(Locale.US, "%.4f", v)); }
    private JSONArray toJsonArray(int[] v) { JSONArray a = new JSONArray(); for (int x : v) a.put(x); return a; }
    private JSONArray toJsonArray(float[] v) throws Exception { JSONArray a = new JSONArray(); for (float x : v) a.put(Double.parseDouble(String.format(Locale.US, "%.7f", x))); return a; }

    private void setStatus(final String s, final long ms) {
        final String line = s + "   ·   " + (ms / 1000) + "s";
        runOnUiThread(new Runnable() { @Override public void run() { if (statusText != null) statusText.setText(line); } });
    }
    private void finalizeUi(final String msg) {
        if (!wroteReceipt.compareAndSet(false, true)) return;
        runOnUiThread(new Runnable() { @Override public void run() { if (hintText != null) hintText.setText(msg + " You can close this."); finish(); } });
    }
    private void writeBlocked(String reason) {
        try {
            JSONObject m = new JSONObject().put("schemaVersion", "holomap-arcore-hq-sweep/v1").put("status", "blocked")
                .put("blockedReason", reason).put("frameCount", frames.length()).put("deviceModel", android.os.Build.MODEL);
            try (FileOutputStream s = new FileOutputStream(new File(getFilesDir(), "holomap-arcore-depth-frame.json"))) { s.write(m.toString().getBytes(StandardCharsets.UTF_8)); }
            finalizeUi("Blocked: " + reason + ".");
        } catch (Exception e) { Log.e(TAG, "writeBlocked failed", e); }
    }

    private static void deleteRec(File f) { if (f == null || !f.exists()) return; if (f.isDirectory()) { File[] ch = f.listFiles(); if (ch != null) for (File c : ch) deleteRec(c); } f.delete(); }
    private String safe(String t) { return t == null ? "" : t.replace('\n', ' ').replace('\r', ' '); }

    // ---- camera background (live viewfinder) ----
    private static final class BackgroundRenderer {
        private static final float[] NDC = { -1f,-1f, 1f,-1f, -1f,1f, 1f,1f };
        private FloatBuffer ndc, tex; private int program, aPos, aTex, uTex, texId; private boolean texInit;
        void init(int t) {
            texId = t; ndc = fb(NDC); tex = fb(new float[8]);
            int v = sh(GLES20.GL_VERTEX_SHADER, "attribute vec4 a_Position;attribute vec2 a_Tex;varying vec2 v;void main(){gl_Position=a_Position;v=a_Tex;}");
            int f = sh(GLES20.GL_FRAGMENT_SHADER, "#extension GL_OES_EGL_image_external:require\nprecision mediump float;varying vec2 v;uniform samplerExternalOES s;void main(){gl_FragColor=texture2D(s,v);}");
            program = GLES20.glCreateProgram(); GLES20.glAttachShader(program, v); GLES20.glAttachShader(program, f); GLES20.glLinkProgram(program);
            aPos = GLES20.glGetAttribLocation(program, "a_Position"); aTex = GLES20.glGetAttribLocation(program, "a_Tex"); uTex = GLES20.glGetUniformLocation(program, "s");
        }
        void draw(Frame frame) {
            if (frame.hasDisplayGeometryChanged() || !texInit) { frame.transformCoordinates2d(Coordinates2d.OPENGL_NORMALIZED_DEVICE_COORDINATES, ndc, Coordinates2d.TEXTURE_NORMALIZED, tex); texInit = true; }
            if (program == 0) return;
            GLES20.glDisable(GLES20.GL_DEPTH_TEST); GLES20.glDepthMask(false); GLES20.glUseProgram(program);
            GLES20.glActiveTexture(GLES20.GL_TEXTURE0); GLES20.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, texId); GLES20.glUniform1i(uTex, 0);
            ndc.position(0); tex.position(0);
            GLES20.glVertexAttribPointer(aPos, 2, GLES20.GL_FLOAT, false, 0, ndc); GLES20.glVertexAttribPointer(aTex, 2, GLES20.GL_FLOAT, false, 0, tex);
            GLES20.glEnableVertexAttribArray(aPos); GLES20.glEnableVertexAttribArray(aTex);
            GLES20.glDrawArrays(GLES20.GL_TRIANGLE_STRIP, 0, 4);
            GLES20.glDisableVertexAttribArray(aPos); GLES20.glDisableVertexAttribArray(aTex);
            GLES20.glDepthMask(true); GLES20.glEnable(GLES20.GL_DEPTH_TEST);
        }
        private static int sh(int type, String src) { int s = GLES20.glCreateShader(type); GLES20.glShaderSource(s, src); GLES20.glCompileShader(s); return s; }
        private static FloatBuffer fb(float[] d) { ByteBuffer b = ByteBuffer.allocateDirect(d.length * 4); b.order(ByteOrder.nativeOrder()); FloatBuffer f = b.asFloatBuffer(); f.put(d); f.position(0); return f; }
    }
}
