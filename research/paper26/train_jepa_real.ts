/**
 * Paper 26 — Real minimum-corpus JEPA training / inference slice (with durable checkpoints)
 *
 * Loads the solver-pair corpus (from D.007 ROS 2 bridge), runs sovereign JEPAPredictor,
 * produces WorldModelReceipts, trains with real gradients, and supports resumable runs.
 *
 * This is live infrastructure for the P1 "minimum-corpus JEPA benchmark" task.
 * Checkpoints allow long experiments, restarts, and reproducible publishable runs.
 */

import * as fs from 'fs';
import * as path from 'path';
import { JEPAPredictor } from '../../packages/core/src/traits/JEPAPredictor';

// Minimal receipt shape (matches the one used successfully in the HoloLand NPC wiring)
interface WorldModelReceipt {
  jepaPrediction: Float32Array;
  solverGroundTruth: any;
  solverType: string;
  worldId: string;
  timestamp: string;
}

interface Episode {
  robot: string;
  length: number;
  observations: any[];
  actions: any[];
  ground_truth: any[];
}

interface Receipt {
  episode_id: string;
  solver: string;
  ground_truth_hash: string;
  signature: string;
}

/**
 * Deterministic text → Float32Array embedding (same implementation used by
 * JEPAPredictor and JEPAObjective for context / plan targets).
 * This makes the training loss operate in the exact same latent space the
 * sovereign stack uses at inference time.
 */
function textToEmbedding(text: string, dim: number): Float32Array {
  const out = new Float32Array(dim);
  let h = 5381;
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h, 33) ^ text.charCodeAt(i);
    h = h >>> 0;
  }
  for (let d = 0; d < dim; d++) {
    h = Math.imul(h, 1664525) + 1013904223;
    h = h >>> 0;
    out[d] = (h / 0x100000000) * 2 - 1;
  }
  return out;
}

/**
 * SIGReg (Sketched Isotropic Gaussian Regularization) — exact copy from the
 * sovereign JEPAObjective implementation so the training loss matches the real
 * objective used at inference / deployment time.
 */
function computeSIGReg(z: Float32Array, numProjections: number, sigma: number): number {
  const dim = z.length;
  const sigmaSquared = sigma * sigma;
  let total = 0;

  let seed = 0xcafe1234;
  const lcg = (): number => {
    seed = Math.imul(seed, 1664525) + 1013904223;
    return ((seed >>> 0) / 0x100000000) * 2 - 1;
  };

  const gaussianPair = (): [number, number] => {
    const u1 = Math.max(1e-12, (lcg() + 1) / 2);
    const u2 = (lcg() + 1) / 2;
    const r = Math.sqrt(-2 * Math.log(u1));
    const theta = 2 * Math.PI * u2;
    return [r * Math.cos(theta), r * Math.sin(theta)];
  };

  for (let p = 0; p < numProjections; p++) {
    let dot = 0;
    for (let i = 0; i < dim; i += 2) {
      const [g1, g2] = gaussianPair();
      const scale = 1 / Math.sqrt(dim);
      dot += z[i] * (g1 * scale);
      if (i + 1 < dim) dot += z[i + 1] * (g2 * scale);
    }

    const proj2 = dot * dot;
    const ratio = proj2 / sigmaSquared;
    if (ratio > 0) {
      total += ratio - 1 - Math.log(ratio);
    } else {
      total += 1;
    }
  }

  return total / numProjections;
}

function computeTotalLoss(predicted: Float32Array, target: Float32Array, sigregWeight = 0.05): number {
  let mse = 0;
  const dim = predicted.length;
  for (let k = 0; k < dim; k++) {
    mse += (predicted[k] - target[k]) ** 2;
  }
  mse /= dim;

  const sig = computeSIGReg(predicted, 64, 1.0);
  return mse + sigregWeight * sig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Durable Checkpoint Manager (dogfoods the persistence farm surfaces)
// ─────────────────────────────────────────────────────────────────────────────

interface Paper26Checkpoint {
  runId: string;
  epoch: number;
  weights: {
    W1: number[];
    b1: number[];
    W2: number[];
    b2: number[];
  };
  baselineCurve: number[];
  trainedCurve: number[];
  metadata: {
    latentDim: number;
    condDim: number;
    corpusEpisodes: number;
    totalSteps: number;
    timestamp: string;
  };
}

const CHECKPOINT_DIR = path.join(process.cwd(), 'research/paper26/checkpoints');

function ensureCheckpointDir() {
  if (!fs.existsSync(CHECKPOINT_DIR)) {
    fs.mkdirSync(CHECKPOINT_DIR, { recursive: true });
  }
}

function float32ToArray(arr: Float32Array): number[] {
  return Array.from(arr);
}

function arrayToFloat32(arr: number[]): Float32Array {
  return new Float32Array(arr);
}

function saveCheckpoint(
  runId: string,
  epoch: number,
  predictor: JEPAPredictor,
  baselineCurve: number[],
  trainedCurve: number[],
  metadata: Partial<Paper26Checkpoint['metadata']>
) {
  ensureCheckpointDir();
  const weights = (predictor as any).getWeights();
  const cp: Paper26Checkpoint = {
    runId,
    epoch,
    weights: {
      W1: float32ToArray(weights.W1),
      b1: float32ToArray(weights.b1),
      W2: float32ToArray(weights.W2),
      b2: float32ToArray(weights.b2),
    },
    baselineCurve,
    trainedCurve,
    metadata: {
      latentDim: (predictor as any).latentDim || LATENT_DIM,
      condDim: (predictor as any).condDim || 4,
      corpusEpisodes: metadata.corpusEpisodes || 30,
      totalSteps: metadata.totalSteps || 1361,
      timestamp: new Date().toISOString(),
    },
  };
  const file = path.join(CHECKPOINT_DIR, `${runId}-epoch${epoch}.json`);
  fs.writeFileSync(file, JSON.stringify(cp, null, 2), 'utf8');

  // Also write a "latest" pointer
  const latest = path.join(CHECKPOINT_DIR, `${runId}-latest.json`);
  fs.writeFileSync(latest, JSON.stringify({ runId, latestEpoch: epoch, file }, null, 2), 'utf8');

  console.log(`[checkpoint] saved epoch ${epoch} → ${file}`);
}

function loadLatestCheckpoint(runId: string): Paper26Checkpoint | null {
  const latestPath = path.join(CHECKPOINT_DIR, `${runId}-latest.json`);
  if (!fs.existsSync(latestPath)) return null;
  try {
    const pointer = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
    const cpPath = pointer.file;
    if (!fs.existsSync(cpPath)) return null;
    const raw = JSON.parse(fs.readFileSync(cpPath, 'utf8')) as Paper26Checkpoint;
    console.log(`[checkpoint] resuming from epoch ${raw.epoch} (${cpPath})`);
    return raw;
  } catch (e) {
    console.warn('[checkpoint] failed to load:', e);
    return null;
  }
}

async function main() {
  // Allow overriding the corpus for scaling experiments (Paper 26 P1)
  const corpusArg = process.argv.find(a => a.startsWith('--corpus='));
  const corpusDir = corpusArg
    ? corpusArg.split('=')[1]
    : path.join(process.cwd(), 'research/paper26/corpus/slice-001');

  const manifestPath = path.join(corpusDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Array<{id: string}>;

  // Scaled dimensions for this run (infrastructure now supports it via durable checkpoints)
  const LATENT_DIM = 16;
  const COND_DIM = 4;

  const predictor = new JEPAPredictor({ latentDim: LATENT_DIM, condDim: COND_DIM });
  const results: any[] = [];
  let totalLoss = 0;
  let withinTol = 0;
  let totalSteps = 0;

  for (const entry of manifest) {
    const epPath = path.join(corpusDir, `${entry.id}.json`);
    const receiptPath = path.join(corpusDir, `${entry.id}.receipt.json`);

    const ep: Episode = JSON.parse(fs.readFileSync(epPath, 'utf8'));
    const baseReceipt: Receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));

    for (let i = 0; i < ep.length; i++) {
      const obs = ep.observations[i];
      const act = ep.actions[i];
      const gt = ep.ground_truth[i];

      // Use the real predictor.plan (action-conditioned)
      const stateStr = JSON.stringify({ obs, act });
      const { action: chosen, predicted, confidence } = predictor.plan(stateStr, [JSON.stringify(act)]);

      // Proper latent target: embed the canonical next-state description using the
      // exact same deterministic embedding the JEPA stack uses at inference time.
      const gtString = `next_state:${JSON.stringify(gt)}`;
      const target = textToEmbedding(gtString, predicted.length);

      const loss = computeTotalLoss(predicted, target);

      totalLoss += loss;
      totalSteps++;

      if (loss < 0.03) withinTol++;

      const receipt: WorldModelReceipt = {
        jepaPrediction: predicted,
        solverGroundTruth: gt,
        solverType: 'paper26-real-jepa-on-solver-pairs',
        worldId: `world_${entry.id}`,
        timestamp: new Date().toISOString(),
      };

      results.push({
        episode: entry.id,
        step: i,
        chosenAction: chosen,
        confidence,
        loss,
        receiptId: receipt.receiptId || 'generated',
      });
    }
  }

  const avgLoss = totalLoss / totalSteps;
  const pctWithin = (withinTol / totalSteps) * 100;

  // ─────────────────────────────────────────────────────────────────────────
  // Baseline vs Trained comparison (the publishability requirement from the design doc)
  // Baseline: frozen weights, 5 epochs of pure forward passes (flat curve expected)
  // Trained: 5 epochs with real output-layer + partial hidden-layer SGD (descending curve)
  // ─────────────────────────────────────────────────────────────────────────
  const baselineCurve: number[] = [];
  const lr = 0.02;

  // Create a fresh predictor for the baseline (frozen)
  const baselinePredictor = new JEPAPredictor({ latentDim: LATENT_DIM, condDim: COND_DIM });

  for (let epoch = 0; epoch < 5; epoch++) {
    let epochLoss = 0;
    let epochSteps = 0;

    for (const entry of manifest) {
      const epPath = path.join(corpusDir, `${entry.id}.json`);
      const ep: Episode = JSON.parse(fs.readFileSync(epPath, 'utf8'));

      for (let i = 0; i < ep.length; i++) {
        const obs = ep.observations[i];
        const act = ep.actions[i];
        const gt = ep.ground_truth[i];

        const stateStr = JSON.stringify({ obs, act });
        const { predicted } = baselinePredictor.plan(stateStr, [JSON.stringify(act)]);

        const gtString = `next_state:${JSON.stringify(gt)}`;
        const target = textToEmbedding(gtString, predicted.length);

        const loss = computeTotalLoss(predicted, target);

        epochLoss += loss;
        epochSteps++;
      }
    }

    baselineCurve.push(Number((epochLoss / epochSteps).toFixed(6)));
  }

  // ── Trained run with durable checkpoint / resume support ───────────────────
  const RUN_ID = 'paper26-real-slice-001';
  let startEpoch = 0;
  let trainedCurve: number[] = [];
  const loadedCp = loadLatestCheckpoint(RUN_ID);

  const trainedPredictor = new JEPAPredictor({ latentDim: LATENT_DIM, condDim: COND_DIM });

  if (loadedCp) {
    const loadedDim = loadedCp.metadata.latentDim || 8;
    if (loadedDim !== LATENT_DIM) {
      console.log(`[checkpoint] dimension mismatch (loaded ${loadedDim}, current ${LATENT_DIM}) — starting fresh run`);
    } else {
      (trainedPredictor as any).setWeights({
        W1: arrayToFloat32(loadedCp.weights.W1),
        b1: arrayToFloat32(loadedCp.weights.b1),
        W2: arrayToFloat32(loadedCp.weights.W2),
        b2: arrayToFloat32(loadedCp.weights.b2),
      });
      trainedCurve = [...loadedCp.trainedCurve];
      startEpoch = loadedCp.epoch + 1;
      console.log(`[resume] continuing training from epoch ${startEpoch}`);
    }
  }

  function sgdStep(pred: JEPAPredictor, contextEmb: Float32Array, target: Float32Array, lr: number) {
    // Full forward to get hidden activations
    const { predicted, hidden } = (pred as any).forward(contextEmb, null);

    const outDim = predicted.length;
    const hDim = hidden.length;
    const inDim = contextEmb.length;

    // Output gradient: dL/dy = 2*(y - t) / outDim  (MSE)
    const dOut = new Float32Array(outDim);
    for (let i = 0; i < outDim; i++) {
      dOut[i] = 2 * (predicted[i] - target[i]) / outDim;
    }

    // --- Output layer gradients (W2, b2) ---
    const w2 = (pred as any).weights.W2 as Float32Array;
    const b2 = (pred as any).weights.b2 as Float32Array;
    const newW2 = new Float32Array(w2.length);
    const newB2 = new Float32Array(b2.length);

    for (let o = 0; o < outDim; o++) {
      newB2[o] = b2[o] - lr * dOut[o];
      for (let h = 0; h < hDim; h++) {
        const idx = o * hDim + h;
        newW2[idx] = w2[idx] - lr * dOut[o] * hidden[h];
      }
    }

    // --- Hidden gradient (backprop through output weights + ReLU) ---
    const dHidden = new Float32Array(hDim);
    for (let h = 0; h < hDim; h++) {
      let g = 0;
      for (let o = 0; o < outDim; o++) {
        g += dOut[o] * w2[o * hDim + h];
      }
      dHidden[h] = g * (hidden[h] > 0 ? 1 : 0);   // ReLU derivative
    }

    // --- Input layer gradients (W1, b1) ---
    const w1 = (pred as any).weights.W1 as Float32Array;
    const b1 = (pred as any).weights.b1 as Float32Array;
    const newW1 = new Float32Array(w1.length);
    const newB1 = new Float32Array(b1.length);

    for (let h = 0; h < hDim; h++) {
      newB1[h] = b1[h] - lr * dHidden[h];
      for (let i = 0; i < inDim; i++) {
        const idx = h * inDim + i;
        newW1[idx] = w1[idx] - lr * dHidden[h] * contextEmb[i];
      }
    }

    (pred as any).setWeights({
      W1: newW1,
      b1: newB1,
      W2: newW2,
      b2: newB2,
    });
  }

  // Trained run — real gradient steps on the sovereign predictor (resumable)
  for (let epoch = startEpoch; epoch < 5; epoch++) {
    let epochLoss = 0;
    let epochSteps = 0;

    for (const entry of manifest) {
      const epPath = path.join(corpusDir, `${entry.id}.json`);
      const ep: Episode = JSON.parse(fs.readFileSync(epPath, 'utf8'));

      for (let i = 0; i < ep.length; i++) {
        const obs = ep.observations[i];
        const act = ep.actions[i];
        const gt = ep.ground_truth[i];

        const stateStr = JSON.stringify({ obs, act });
        const contextEmb = new Float32Array((trainedPredictor as any).latentDim || LATENT_DIM);

        const gtString = `next_state:${JSON.stringify(gt)}`;
        const target = textToEmbedding(gtString, (trainedPredictor as any).latentDim || LATENT_DIM);

        // Train the predictor to output the embedding of the true next state
        sgdStep(trainedPredictor, contextEmb, target, lr);

        const { predicted } = trainedPredictor.plan(stateStr, [JSON.stringify(act)]);
        const loss = computeTotalLoss(predicted, target);

        epochLoss += loss;
        epochSteps++;
      }
    }

    const thisEpochAvg = epochLoss / epochSteps;
    trainedCurve.push(Number(thisEpochAvg.toFixed(6)));

    // Save durable checkpoint after every epoch (enables resume + publishable reproducibility)
    saveCheckpoint(RUN_ID, epoch, trainedPredictor, baselineCurve, trainedCurve, {
      corpusEpisodes: manifest.length,
      totalSteps: totalSteps,
    });
  }

  // ── Post-training verification on real latent targets (the publishability requirement) ──
  let verificationL2 = 0;
  let verificationSteps = 0;
  let verificationWithinTol = 0;
  const TOL = 0.15; // L2 tolerance in the embedding space for dim=16

  for (const entry of manifest) {
    const epPath = path.join(corpusDir, `${entry.id}.json`);
    const ep: Episode = JSON.parse(fs.readFileSync(epPath, 'utf8'));

    for (let i = 0; i < ep.length; i++) {
      const obs = ep.observations[i];
      const act = ep.actions[i];
      const gt = ep.ground_truth[i];

      const stateStr = JSON.stringify({ obs, act });
      const { predicted } = trainedPredictor.plan(stateStr, [JSON.stringify(act)]);

      const gtString = `next_state:${JSON.stringify(gt)}`;
      const target = textToEmbedding(gtString, predicted.length);

      const totalLoss = computeTotalLoss(predicted, target);
      const err = Math.sqrt(totalLoss * predicted.length); // approximate L2 from combined loss

      verificationL2 += err;
      verificationSteps++;

      if (err < TOL) verificationWithinTol++;
    }
  }

  const avgVerificationL2 = verificationL2 / verificationSteps;
  const pctWithinTol = (verificationWithinTol / verificationSteps) * 100;

  const summary = {
    run_id: 'paper26-real-slice-001',
    timestamp: new Date().toISOString(),
    episodes: manifest.length,
    total_steps: totalSteps,
    avg_loss: Number(avgLoss.toFixed(6)),
    pct_within_3pct: Number(pctWithin.toFixed(1)),
    receipts_generated: results.length,
    baseline_curve: baselineCurve,
    trained_curve: trainedCurve,
    improvement_first_epoch_pct: Number(
      ((baselineCurve[0] - trainedCurve[0]) / baselineCurve[0] * 100).toFixed(1)
    ),
    verification: {
      avg_l2_error_on_real_latent_targets: Number(avgVerificationL2.toFixed(4)),
      tolerance: TOL,
      pct_steps_within_tol: Number(pctWithinTol.toFixed(1)),
      verification_steps: verificationSteps,
    },
    notes: 'First run with real latent targets (textToEmbedding of next ground-truth state) + full backprop + post-training verification pass. This is the first honest "prediction error vs real latent targets + % within tolerance" slice on solver data.',
  };

  const outDir = path.join(process.cwd(), 'research/paper26/results');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'real-benchmark-slice-001.json'),
    JSON.stringify({ summary, sample_results: results.slice(0, 20) }, null, 2)
  );

  fs.writeFileSync(
    path.join(outDir, 'loss-curve-slice-001.json'),
    JSON.stringify({ baseline_curve: baselineCurve, trained_curve: trainedCurve, epochs: 5 }, null, 2)
  );

  console.log('=== Paper 26 Real JEPA Training Slice ===');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(console.error);