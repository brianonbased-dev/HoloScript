#!/usr/bin/env node
/**
 * HoloShell Reconstruction Technology Plan
 *
 * Offline, research-backed planner for the native camera -> HoloMap -> HoloGram
 * chain. It does not install or invoke external backends; it records which
 * technology path should be tried next from the evidence in a workflow receipt.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chainReceipt, sha256Bytes, sha256Text, stageReceipt, withHash } from './holoshell/chain/receipts.mjs';

export const VERSION = '0.1.0';
export const RECEIPT_VERSION = 'holoshell-reconstruction-tech-plan/v1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_DATE = new Date().toISOString().slice(0, 10);

export const SOURCES = [
  {
    id: 'opencv-aruco',
    title: 'OpenCV ArUco marker detection',
    url: 'https://docs.opencv.org/4.x/d5/dae/tutorial_aruco_detection.html',
    finding:
      'Synthetic square fiducials provide known corners and ids; OpenCV documents camera-loop detection and pose estimation with solvePnP.',
  },
  {
    id: 'opencv-calib3d',
    title: 'OpenCV camera calibration and 3D reconstruction',
    url: 'https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html',
    finding:
      'Camera matrices, distortion coefficients, stereo rectification, and pose solve routines are the native calibration substrate.',
  },
  {
    id: 'apriltag',
    title: 'AprilTag visual fiducial system',
    url: 'https://april.eecs.umich.edu/software/apriltag',
    finding:
      'AprilTag targets are printable, portable, robust across lighting/view angle, and compute 3D position, orientation, and identity.',
  },
  {
    id: 'colmap',
    title: 'COLMAP SfM and MVS',
    url: 'https://colmap.github.io/tutorial.html',
    finding:
      'COLMAP is the offline baseline for feature extraction, matching, sparse reconstruction, dense reconstruction, and meshing.',
  },
  {
    id: 'openmvs',
    title: 'OpenMVS dense reconstruction',
    url: 'https://github.com/cdcseacave/openMVS',
    finding:
      'OpenMVS consumes poses plus sparse point clouds and produces dense point clouds, meshes, refinement, and texturing.',
  },
  {
    id: 'orb-slam3',
    title: 'ORB-SLAM3',
    url: 'https://github.com/UZ-SLAMLab/ORB_SLAM3',
    finding:
      'ORB-SLAM3 is a real-time visual, visual-inertial, and multi-map SLAM library for monocular, stereo, and RGB-D cameras.',
  },
  {
    id: 'rtabmap',
    title: 'RTAB-Map',
    url: 'https://introlab.github.io/rtabmap/',
    finding:
      'RTAB-Map is a real-time appearance-based mapping stack suitable when the capture path can provide RGB-D, stereo, or odometry.',
  },
  {
    id: 'arcore-depth',
    title: 'ARCore Depth API',
    url: 'https://developers.google.com/ar/develop/depth',
    finding:
      'ARCore depth creates depth images from motion and available sensors; Google notes best accuracy from roughly 0.5m to 5m.',
  },
  {
    id: 'arkit-scene-depth',
    title: 'ARKit scene depth point cloud',
    url: 'https://developer.apple.com/documentation/arkit/displaying-a-point-cloud-using-scene-depth',
    finding:
      'ARKit exposes scene-depth point cloud data on supported devices, making mobile depth a first-class capture backend.',
  },
  {
    id: 'looking-glass-quilt',
    title: 'Looking Glass quilt images',
    url: 'https://lfdocs.lookingglassfactory.com/keyconcepts/quilts',
    finding:
      'Quilts are tiled light-field view images; the current HoloGram preview already matches this intermediate output shape.',
  },
  {
    id: 'apple-mvhevc',
    title: 'Apple MV-HEVC spatial video conversion',
    url: 'https://developer.apple.com/documentation/avfoundation/converting-side-by-side-3d-video-to-multiview-hevc-and-spatial-video',
    finding:
      'Apple documents MV-HEVC output as layered left/right views with optional spatial metadata for visionOS spatial video.',
  },
  {
    id: 'gaussian-splatting',
    title: '3D Gaussian Splatting for Real-Time Radiance Field Rendering',
    url: 'https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/',
    finding:
      'Gaussian splatting is a photorealistic rendering backend candidate once HoloMap can emit calibrated camera poses and images.',
  },
];

const STACK = [
  {
    id: 'fiducial-calibration',
    phase: 'capture-calibration',
    backend: 'OpenCV ChArUco/ArUco plus AprilTag',
    sourceRefs: ['opencv-aruco', 'opencv-calib3d', 'apriltag'],
    nativeFit: 'excellent',
    mobileFit: 'excellent',
    licenseRisk: 'low-to-medium',
    implementation:
      'Use the generated printable fiducial board, detect ids/corners in the untouched control frame, then solve camera pose before HoloMap.',
    why:
      'Inferior cameras need known geometry first. Fiducials convert a fuzzy live image into measurable corners, ids, pose, and reprojection error.',
  },
  {
    id: 'batch-sfm-mvs',
    phase: 'offline-reconstruction',
    backend: 'COLMAP sparse SfM plus OpenMVS dense mesh',
    sourceRefs: ['colmap', 'openmvs'],
    nativeFit: 'good',
    mobileFit: 'postprocess',
    licenseRisk: 'medium',
    implementation:
      'Export kept frames plus optional fiducial poses to a COLMAP workspace, run sparse reconstruction, then hand poses/sparse cloud to OpenMVS for dense mesh.',
    why:
      'This is the classic offline quality ladder when live low-res HoloMap points are not detailed enough.',
  },
  {
    id: 'realtime-slam',
    phase: 'live-reconstruction',
    backend: 'ORB-SLAM3 or RTAB-Map adapter',
    sourceRefs: ['orb-slam3', 'rtabmap'],
    nativeFit: 'medium',
    mobileFit: 'medium',
    licenseRisk: 'high-for-closed-distribution',
    implementation:
      'Add an optional native bridge that streams frames, intrinsics, and IMU/depth when available; consume poses as HoloMap anchors.',
    why:
      'Live HoloMap wants persistent tracking. SLAM backends provide camera pose continuity, loop closure, and map reuse when inputs are stable.',
  },
  {
    id: 'mobile-native-depth',
    phase: 'mobile-capture',
    backend: 'ARCore Depth and ARKit scene depth',
    sourceRefs: ['arcore-depth', 'arkit-scene-depth'],
    nativeFit: 'not-for-laptop',
    mobileFit: 'excellent',
    licenseRisk: 'platform-sdk',
    implementation:
      'Define a HoloMap mobile ingest contract for RGB frame, depth map, confidence, intrinsics, and device pose; keep the laptop workflow as the degraded baseline.',
    why:
      'Mobile devices can give depth and pose directly. If the bad laptop camera works, native mobile depth should become the easy path.',
  },
  {
    id: 'quilt-lightfield',
    phase: 'hologram-preview',
    backend: 'Looking Glass-style quilt',
    sourceRefs: ['looking-glass-quilt'],
    nativeFit: 'current',
    mobileFit: 'preview',
    licenseRisk: 'low',
    implementation:
      'Keep deterministic quilt generation as the inspection layer and quality gate before vendor-specific display/export formats.',
    why:
      'The quilt is already a concrete multi-view artifact; it is the fastest way to inspect parallax and view consistency.',
  },
  {
    id: 'mvhevc-spatial-export',
    phase: 'hologram-export',
    backend: 'Apple AVFoundation MV-HEVC',
    sourceRefs: ['apple-mvhevc'],
    nativeFit: 'mac-export-required',
    mobileFit: 'excellent-on-apple',
    licenseRisk: 'platform-sdk',
    implementation:
      'Use the existing quilt or stereo layers to produce MV-HEVC with left/right layer ids and spatial metadata once camera baseline/FOV are known.',
    why:
      'This is the proper Apple Vision Pro export leg, separate from the current inspection quilt.',
  },
  {
    id: 'radiance-field-render',
    phase: 'photoreal-render',
    backend: '3D Gaussian Splatting',
    sourceRefs: ['gaussian-splatting'],
    nativeFit: 'research',
    mobileFit: 'viewer',
    licenseRisk: 'research-to-product-review',
    implementation:
      'After calibrated poses exist, export RGB frames plus poses to a splat trainer; re-import splats as a HoloGram render backend.',
    why:
      'Splatting is the high-quality visual target, but it should come after pose calibration rather than before capture truth is established.',
  },
];

function rel(path) {
  return relative(REPO_ROOT, resolve(path)).replaceAll('\\', '/');
}

function defaultOutput(date) {
  return join('.scratch', 'holoshell-tech-plan', date, 'reconstruction-tech-plan-receipt.json');
}

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    workflow: undefined,
    out: undefined,
    selfTest: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--date') args.date = argv[++i];
    else if (arg === '--workflow') args.workflow = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else if (arg === '--self-test' || arg === 'self-test') args.selfTest = true;
    else if (arg === '--help' || arg === '-h' || arg === 'help') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function printHelp() {
  process.stdout.write(`HoloShell Reconstruction Technology Plan ${VERSION}

Usage:
  node scripts/holoshell-reconstruction-tech-plan.mjs --workflow low-camera-workflow.json [--out receipt.json]
  node scripts/holoshell-reconstruction-tech-plan.mjs --self-test

Notes:
  - Emits an offline, research-backed planner receipt.
  - Does not install, launch, or trust external reconstruction tools.
  - Intended to travel inside the low-camera workflow receipt as the next-backend ladder.
`);
}

function readJson(path) {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, path), 'utf8'));
}

function writeJson(path, value) {
  const absolute = resolve(REPO_ROOT, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  return absolute;
}

function fileHash(path) {
  const absolute = resolve(REPO_ROOT, path);
  if (!existsSync(absolute)) return undefined;
  return `sha256:${sha256Bytes(readFileSync(absolute))}`;
}

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function scoreFromSignals(stack, signals) {
  let score = 0.3;
  if (stack.id === 'fiducial-calibration') {
    score += 0.34;
    if (signals.hasFiducialBoard) score += 0.04;
    if (signals.hasGeneratedTarget && !signals.targetDetectedInFrame) score += 0.12;
    if (signals.rawEdgeEnergy < 0.06) score += 0.08;
    if (signals.rawQualityScore < 0.8) score += 0.05;
  }
  if (stack.id === 'batch-sfm-mvs') {
    score += 0.22;
    if (signals.frameCount < 12) score -= 0.08;
    if (signals.quiltQualityScore < 0.7) score += 0.14;
    if (signals.pointCount >= 1500) score += 0.04;
  }
  if (stack.id === 'realtime-slam') {
    score += 0.14;
    if (signals.frameCount >= 8) score += 0.06;
    if (signals.rawEdgeEnergy < 0.04) score -= 0.05;
  }
  if (stack.id === 'mobile-native-depth') {
    score += 0.2;
    if (signals.rawQualityScore < 0.8) score += 0.05;
  }
  if (stack.id === 'quilt-lightfield') {
    score += 0.24;
    if (signals.quiltQualityScore >= 0.8) score += 0.14;
  }
  if (stack.id === 'mvhevc-spatial-export') {
    score += 0.1;
    if (signals.quiltQualityScore >= 0.8) score += 0.08;
    if (!signals.hasCalibratedPose) score -= 0.08;
  }
  if (stack.id === 'radiance-field-render') {
    score += 0.08;
    if (signals.hasCalibratedPose) score += 0.12;
    if (signals.frameCount < 20) score -= 0.06;
  }
  return Number(clamp01(score).toFixed(6));
}

function classifyPriority(score) {
  if (score >= 0.75) return 'now';
  if (score >= 0.55) return 'next';
  if (score >= 0.38) return 'parked';
  return 'research';
}

function signalsFromWorkflow(workflow) {
  const rawQuality = workflow?.control?.frame?.rawQuality ?? workflow?.sweep?.control?.frame?.rawQuality ?? {};
  const renderQuality = workflow?.render?.quality ?? workflow?.quality ?? {};
  const recoveredMarkerCount = Number(
    workflow?.targetDetection?.detection?.recoveredMarkerCount ??
      workflow?.targetDetection?.detection?.fiducialMarkers?.length ??
      0
  );
  return {
    workflowStatus: workflow?.status,
    hasGeneratedTarget: Boolean(workflow?.target?.pngHash),
    targetProfile: workflow?.target?.profile ?? workflow?.capturePlan?.targetProfile,
    hasFiducialBoard:
      workflow?.target?.profile === 'fiducial-board' ||
      workflow?.capturePlan?.targetProfile === 'fiducial-board' ||
      Number(workflow?.target?.markerCount ?? 0) >= 4,
    targetDetectionStatus: workflow?.targetDetection?.detection?.status ?? workflow?.targetDetection?.status,
    targetDetectedInFrame:
      workflow?.targetDetection?.detection?.status === 'detected' || workflow?.targetDetection?.status === 'detected',
    recoveredMarkerCount,
    hasFiducialMarkerCorners:
      recoveredMarkerCount >= 4 || workflow?.targetDetection?.detection?.poseSolveInputReady === true,
    hasCalibratedPose: Boolean(workflow?.calibration?.pose?.status === 'pass'),
    frameCount: workflow?.capturePlan?.frames ?? workflow?.sweep?.capturedFrameCount ?? 0,
    pointCount: workflow?.render?.pointCount ?? workflow?.sweep?.pointCount ?? 0,
    rawQualityScore: Number(rawQuality.score ?? 0),
    rawEdgeEnergy: Number(rawQuality.edgeEnergy ?? 0),
    rawContrast: Number(rawQuality.contrast ?? 0),
    quiltQualityScore: Number(renderQuality.score ?? 0),
    quiltQualityGrade: renderQuality.grade,
    winningPreprocess: workflow?.sweep?.winner?.mode,
  };
}

function buildRecommendations(signals) {
  return STACK
    .map((stack) => {
      const priorityScore = scoreFromSignals(stack, signals);
      return {
        ...stack,
        priorityScore,
        priority: classifyPriority(priorityScore),
      };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore || a.id.localeCompare(b.id));
}

function buildNextActions(recommendations, signals) {
  const top = recommendations[0];
  const actions = [];
  if (!signals.targetDetectionStatus) {
    actions.push({
      id: 'detect-generated-target-in-control-frame',
      owner: 'holoshell',
      priority: 'now',
      action:
        'Add a target-in-frame analyzer that decodes the untouched camera JPEG and scores checkerboard/fiducial visibility before reconstruction.',
      doneWhen:
        'Workflow receipt contains targetDetection with detected corner count, reprojection-ready corner coordinates, and honest fail-closed status.',
    });
  } else if (!signals.targetDetectedInFrame) {
    actions.push({
      id: 'place-target-in-camera-view',
      owner: 'operator',
      priority: 'now',
      action:
        'Put the generated target in the native camera view and rerun the low-camera workflow so calibration evidence comes from the untouched control frame.',
      doneWhen:
        'targetDetection.detection.status is detected and the receipt contains non-empty bounds corner candidates.',
    });
  }
  if (top?.id === 'fiducial-calibration' || signals.rawQualityScore < 0.8) {
    if (signals.hasFiducialBoard) {
      if (signals.hasFiducialMarkerCorners) {
        actions.push({
          id: 'solve-fiducial-board-pose',
          owner: 'holomap',
          priority: 'now',
          action:
            'Use recovered HoloShell marker ids/corners plus generated board coordinates to estimate camera pose and record reprojection error.',
          doneWhen:
            'A calibration receipt records camera intrinsics assumptions, pose, reprojection error, and still fails closed when marker coverage is insufficient.',
        });
      } else {
        actions.push({
          id: 'recover-fiducial-marker-corners',
          owner: 'holoshell',
          priority: 'now',
          action:
            'Implement the native marker-corner detector for the HoloShell fiducial-board dictionary and run it against the untouched control frame.',
          doneWhen:
            'A targetDetection receipt carries marker ids and four image-space corners per marker while calibrationReady remains false until pose solve lands.',
        });
      }
    } else {
      actions.push({
        id: 'replace-chart-with-fiducial-board',
        owner: 'holoshell',
        priority: 'now',
        action:
          'Generate an ArUco/AprilTag/ChArUco printable board variant and attach board metrics to the control target receipt.',
        doneWhen:
          'A native detector can recover marker ids/corners from a control frame without preprocessing.',
      });
    }
  }
  actions.push({
    id: 'define-external-backend-contract',
    owner: 'holomap',
    priority: 'next',
    action:
      'Create a HoloMap backend contract for frame folder, intrinsics, optional fiducial poses, sparse cloud, dense mesh, and replay fingerprint.',
    doneWhen:
      'COLMAP/OpenMVS, ORB-SLAM3/RTAB-Map, and mobile depth adapters can all emit the same HoloMap bridge schema.',
  });
  actions.push({
    id: 'keep-quilt-as-inspection-gate',
    owner: 'hologram',
    priority: 'next',
    action:
      'Keep quilt preview quality as the pre-export gate; only start MV-HEVC once pose/baseline/FOV metadata is known.',
    doneWhen:
      'MV-HEVC export receipts reference a passing quilt receipt plus calibrated spatial metadata.',
  });
  return actions;
}

export function buildTechnologyPlan({ workflowReceipt, workflowPath } = {}) {
  const workflow = workflowReceipt ?? {};
  const signals = signalsFromWorkflow(workflow);
  const recommendations = buildRecommendations(signals);
  const nextActions = buildNextActions(recommendations, signals);
  const sourceIds = new Set(recommendations.flatMap((recommendation) => recommendation.sourceRefs));
  const usedSources = SOURCES.filter((source) => sourceIds.has(source.id));
  return {
    planVersion: VERSION,
    workflowPath: workflowPath ? rel(workflowPath) : undefined,
    workflowHash: workflowPath ? fileHash(workflowPath) : workflow?.hash,
    signals,
    recommendedNow: recommendations.filter((recommendation) => recommendation.priority === 'now').map((recommendation) => recommendation.id),
    recommendations,
    nextActions,
    sources: usedSources,
    honestScope:
      'Research-backed planner only. It ranks external/native technology candidates but does not prove those backends are installed or successful.',
  };
}

export function validateReceipt(receipt) {
  const errors = [];
  if (!receipt || typeof receipt !== 'object') errors.push('receipt must be an object');
  if (receipt.schemaVersion !== RECEIPT_VERSION) errors.push('schemaVersion mismatch');
  if (receipt.status !== 'pass') errors.push('status must be pass');
  if (!receipt.hash?.startsWith('sha256:')) errors.push('hash missing');
  if (!receipt.plan?.workflowHash?.startsWith('sha256:') && receipt.plan?.workflowPath) errors.push('workflow hash missing');
  if (!Array.isArray(receipt.plan?.recommendations) || receipt.plan.recommendations.length < 6) {
    errors.push('recommendations missing');
  }
  if (!Array.isArray(receipt.plan?.sources) || receipt.plan.sources.length < 6) errors.push('sources missing');
  if (!Array.isArray(receipt.plan?.nextActions) || receipt.plan.nextActions.length < 3) errors.push('next actions missing');
  if (!receipt.plan?.recommendations?.some((recommendation) => recommendation.id === 'fiducial-calibration')) {
    errors.push('fiducial calibration recommendation missing');
  }
  if (!receipt.chain?.receipt?.hash?.startsWith('sha256:')) errors.push('chain receipt hash missing');
  return errors;
}

export function buildReceipt({ workflowReceipt, workflowPath, out }) {
  const plan = buildTechnologyPlan({ workflowReceipt, workflowPath });
  const stage = stageReceipt({
    name: 'plan.reconstruction-technology',
    input: {
      workflowPath: plan.workflowPath,
      workflowHash: plan.workflowHash,
      signals: plan.signals,
    },
    output: {
      recommendedNow: plan.recommendedNow,
      topRecommendation: plan.recommendations[0]?.id,
      sourceCount: plan.sources.length,
      nextActionCount: plan.nextActions.length,
    },
    metrics: {
      recommendationCount: plan.recommendations.length,
      sourceCount: plan.sources.length,
      rawQualityScore: plan.signals.rawQualityScore,
      quiltQualityScore: plan.signals.quiltQualityScore,
    },
    honestScope:
      'Ranks alternative reconstruction and hologram output technologies from current receipt evidence and static researched sources.',
  });
  const chain = {
    receipt: chainReceipt({
      name: 'holoshell-reconstruction-tech-plan',
      stages: [stage],
      metrics: {
        status: 'pass',
        topRecommendation: plan.recommendations[0]?.id,
      },
      honestScope:
        'Single-stage planning chain. It is advisory until a backend adapter produces its own receipt.',
    }),
    stages: [stage],
  };
  const receipt = withHash({
    id: `holoshell-reconstruction-tech-plan-${sha256Text(JSON.stringify(plan)).slice(0, 12)}`,
    schemaVersion: RECEIPT_VERSION,
    status: 'pass',
    action: 'rank-native-holomap-hologram-technology-alternatives',
    generatedAt: new Date().toISOString(),
    plan,
    chain,
    outputPath: out ? rel(out) : undefined,
  });
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(`Invalid reconstruction tech plan receipt: ${errors.join('; ')}`);
  return receipt;
}

export async function selfTest() {
  const workflowReceipt = withHash({
    schemaVersion: 'holoshell-low-camera-workflow/v1',
    status: 'pass',
    capturePlan: { frames: 2, width: 64, height: 48, geometricTarget: true, targetProfile: 'fiducial-board' },
    target: { profile: 'fiducial-board', pngHash: 'sha256:' + '1'.repeat(64), markerCount: 9 },
    control: {
      frame: {
        rawQuality: { score: 0.71, contrast: 0.22, edgeEnergy: 0.048 },
      },
    },
    sweep: { winner: { mode: 'luma-clahe' }, pointCount: 2048 },
    render: { pointCount: 2048, quality: { score: 0.82, grade: 'good' } },
  });
  const receipt = buildReceipt({ workflowReceipt });
  const errors = validateReceipt(receipt);
  if (errors.length > 0) throw new Error(errors.join('; '));
  if (receipt.plan.recommendations[0].id !== 'fiducial-calibration') {
    throw new Error(`Unexpected top recommendation: ${receipt.plan.recommendations[0].id}`);
  }
  return receipt;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }
  if (args.selfTest) {
    const receipt = await selfTest();
    process.stdout.write(`holoshell-reconstruction-tech-plan self-test PASS ${receipt.hash}\n`);
    return;
  }
  if (!args.workflow) throw new Error('--workflow is required unless --self-test is used');
  const workflowPath = resolve(REPO_ROOT, args.workflow);
  const outPath = resolve(REPO_ROOT, args.out ?? defaultOutput(args.date));
  const workflowReceipt = readJson(workflowPath);
  const receipt = buildReceipt({ workflowReceipt, workflowPath, out: outPath });
  writeJson(outPath, receipt);
  process.stdout.write(`${JSON.stringify({
    status: receipt.status,
    receiptPath: receipt.outputPath,
    topRecommendation: receipt.plan.recommendations[0]?.id,
    recommendedNow: receipt.plan.recommendedNow,
    nextActions: receipt.plan.nextActions.map((action) => action.id),
  }, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('holoshell-reconstruction-tech-plan.mjs')) {
  main().catch((error) => {
    process.stderr.write(`holoshell-reconstruction-tech-plan FAIL: ${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  });
}
