import { useState, useCallback, useMemo } from 'react';
import type { 
  SyntheticDataConfig, 
  CameraConfig, 
  LightingConfig, 
  AugmentationConfig, 
  BatchConfig, 
  GenerationProgress,
  AugmentationType
} from './types';
import { 
  DEFAULT_CAMERA, 
  DEFAULT_LIGHTING, 
  DEFAULT_AUGMENTATION, 
  DEFAULT_BATCH 
} from './constants';

export function useSyntheticData(
  onGenerate?: (config: SyntheticDataConfig) => void,
  onExportConfig?: (config: SyntheticDataConfig) => void
) {
  const [camera, setCamera] = useState<CameraConfig>(DEFAULT_CAMERA);
  const [lighting, setLighting] = useState<LightingConfig>(DEFAULT_LIGHTING);
  const [augmentation, setAugmentation] = useState<AugmentationConfig>(DEFAULT_AUGMENTATION);
  const [batch, setBatch] = useState<BatchConfig>(DEFAULT_BATCH);
  
  const [progress, setProgress] = useState<GenerationProgress>({
    status: 'idle',
    current: 0,
    total: 0,
    elapsedMs: 0,
    estimatedRemainingMs: 0,
    errors: [],
  });

  const [activeTab, setActiveTab] = useState<'camera' | 'lighting' | 'augmentation' | 'batch'>('camera');

  // Config assembly
  const config = useMemo<SyntheticDataConfig>(
    () => ({ camera, lighting, augmentation, batch }),
    [camera, lighting, augmentation, batch]
  );

  // Computed data
  const splitSummary = useMemo(() => {
    const total = batch.totalImages;
    return {
      train: Math.round(total * batch.trainSplit),
      val: Math.round(total * batch.valSplit),
      test: Math.round(total * batch.testSplit),
    };
  }, [batch]);

  const estimatedSize = useMemo(() => {
    const [w, h] = batch.resolution;
    const bytesPerImage = w * h * 3; // RGB
    const totalBytes = bytesPerImage * batch.totalImages;
    const withAnnotations = totalBytes * 1.15; // ~15% overhead for annotations
    const multiplier =
      1 +
      (batch.includeDepth ? 0.33 : 0) +
      (batch.includeNormals ? 0.33 : 0) +
      (batch.includeSegmentation ? 0.15 : 0);
    const total = withAnnotations * multiplier;
    if (total >= 1_073_741_824) return `${(total / 1_073_741_824).toFixed(1)} GB`;
    return `${(total / 1_048_576).toFixed(0)} MB`;
  }, [batch]);

  // Generation simulation
  const handleGenerate = useCallback(() => {
    if (progress.status === 'generating') return;

    setProgress({
      status: 'generating',
      current: 0,
      total: batch.totalImages,
      elapsedMs: 0,
      estimatedRemainingMs: batch.totalImages * 50,
      errors: [],
    });

    onGenerate?.(config);

    // Simulated progress
    const start = Date.now();
    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev.current + Math.ceil(batch.totalImages / 20);
        if (next >= batch.totalImages) {
          clearInterval(interval);
          return {
            ...prev,
            status: 'complete',
            current: batch.totalImages,
            elapsedMs: Date.now() - start,
            estimatedRemainingMs: 0,
          };
        }
        const elapsed = Date.now() - start;
        const rate = next / elapsed;
        return {
          ...prev,
          current: next,
          elapsedMs: elapsed,
          estimatedRemainingMs: Math.round((batch.totalImages - next) / rate),
        };
      });
    }, 250);
  }, [batch.totalImages, config, onGenerate, progress.status]);

  const handleExport = useCallback(() => {
    onExportConfig?.(config);
  }, [config, onExportConfig]);

  // Augmentation toggles
  const toggleAugType = useCallback((type: AugmentationType) => {
    setAugmentation((prev) => ({
      ...prev,
      types: prev.types.includes(type)
        ? prev.types.filter((t) => t !== type)
        : [...prev.types, type],
    }));
  }, []);

  return {
    camera, setCamera,
    lighting, setLighting,
    augmentation, setAugmentation,
    batch, setBatch,
    progress,
    activeTab, setActiveTab,
    splitSummary,
    estimatedSize,
    handleGenerate,
    handleExport,
    toggleAugType
  };
}
