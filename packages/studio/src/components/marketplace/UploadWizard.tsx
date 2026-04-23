/**
 * Content Upload Wizard
 * Multi-step wizard for uploading content to the marketplace
 */

import { useState, useCallback } from 'react';
import { X, Upload, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { ContentType, CONTENT_TYPE_METADATA, ContentUpload } from '@/lib/marketplace/types';
import { useUpload } from '@/lib/marketplace/hooks';
import { StudioEvents } from '@/lib/analytics';
import { useDaemonJobs, type DaemonProfile, type DaemonProjectDNA } from '@/hooks/useDaemonJobs';
import { OperationsSurfacePanel } from '@/components/daemon/OperationsSurfacePanel';
import { logger } from '@/lib/logger';
import { inferProjectDNA } from '@/lib/marketplace/projectDNAInference';
import { TypeSelectionStep } from './TypeSelectionStep';
import { FileUploadStep } from './FileUploadStep';
import { AnalysisStep } from './AnalysisStep';
import { ThumbnailStep } from './ThumbnailStep';
import { MetadataStep } from './MetadataStep';
import { DaemonConfigStep } from './DaemonConfigStep';
import { PreviewStep } from './PreviewStep';
import { SubmitStep } from './SubmitStep';

interface UploadWizardProps {
  onClose: () => void;
  onSuccess?: (contentId: string) => void;
  remixFrom?: {
    id: string;
    name: string;
    description: string;
    type: ContentType;
    thumbnailUrl?: string;
    author: { name: string };
  };
}

type WizardStep =
  | 'type'
  | 'file'
  | 'analysis'
  | 'thumbnail'
  | 'metadata'
  | 'daemon'
  | 'preview'
  | 'submit';

export function UploadWizard({ onClose, onSuccess, remixFrom }: UploadWizardProps) {
  const isRemix = !!remixFrom;
  const [currentStep, setCurrentStep] = useState<WizardStep>(isRemix ? 'file' : 'type');
  const [selectedType, setSelectedType] = useState<ContentType | null>(remixFrom?.type || null);
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [projectDNA, setProjectDNA] = useState<DaemonProjectDNA | null>(null);
  const [enableDaemon, setEnableDaemon] = useState(true);
  const [daemonProfile, setDaemonProfile] = useState<DaemonProfile>('balanced');
  const [daemonJobId, setDaemonJobId] = useState<string | null>(null);
  const [showOperationsSurface, setShowOperationsSurface] = useState(false);
  const [metadata, setMetadata] = useState({
    name: remixFrom ? `${remixFrom.name} (Remix)` : '',
    description: remixFrom
      ? `Remix of "${remixFrom.name}" by ${remixFrom.author.name}\n\n${remixFrom.description}`
      : '',
    category: '',
    tags: remixFrom ? ['remix'] : ([] as string[]),
    license: 'MIT' as const,
    version: '1.0.0',
    remixOf: remixFrom?.id,
  });

  const { upload, uploading, progress } = useUpload();
  const { createJob, creating: creatingDaemonJob, error: daemonJobError } = useDaemonJobs();

  const steps: WizardStep[] = [
    'type',
    'file',
    'analysis',
    'thumbnail',
    'metadata',
    'daemon',
    'preview',
    'submit',
  ];
  const currentStepIndex = steps.indexOf(currentStep);

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 'type':
        return selectedType !== null;
      case 'file':
        return contentFile !== null;
      case 'thumbnail':
        return thumbnailFile !== null;
      case 'analysis':
        return projectDNA !== null;
      case 'metadata':
        return (
          metadata.name.trim() !== '' &&
          metadata.description.trim() !== '' &&
          metadata.category !== ''
        );
      case 'daemon':
        return !enableDaemon || !!daemonProfile;
      case 'preview':
        return true;
      default:
        return false;
    }
  }, [currentStep, selectedType, contentFile, thumbnailFile, metadata]);

  const handleNext = () => {
    if (currentStep === 'file' && contentFile) {
      const detected = inferProjectDNA(contentFile);
      setProjectDNA(detected);
      setDaemonProfile(detected.recommendedProfile);
    }

    if (canProceed() && currentStepIndex < steps.length - 1) {
      setCurrentStep(steps[currentStepIndex + 1]);
    }
  };

  const handlePrevious = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(steps[currentStepIndex - 1]);
    }
  };

  const handleSubmit = async () => {
    if (!selectedType || !contentFile) return;

    try {
      const uploadData: ContentUpload = {
        type: selectedType,
        name: metadata.name,
        description: metadata.description,
        category: metadata.category,
        tags: metadata.tags,
        license: metadata.license,
        version: metadata.version,
        content: contentFile,
        thumbnail: thumbnailFile || undefined,
      };

      const result = await upload(uploadData);
      StudioEvents.marketplacePublish(selectedType);

      if (enableDaemon && projectDNA) {
        const daemonJob = await createJob({
          projectId: result.id,
          profile: daemonProfile,
          projectDna: projectDNA,
        });
        setDaemonJobId(daemonJob.id);
      }

      setCurrentStep('submit');

      // Wait 2 seconds to show success message, then close
      setTimeout(() => {
        onSuccess?.(result.id);
        onClose();
      }, 2000);
    } catch (error) {
      logger.error('Upload failed:', error);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setContentFile(file);
  };

  const handleThumbnailSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setThumbnailFile(file);
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>, type: 'content' | 'thumbnail') => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) {
        if (type === 'content') {
          setContentFile(file);
        } else {
          setThumbnailFile(file);
        }
      }
    },
    []
  );

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl rounded-xl border border-studio-border bg-studio-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-studio-border px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-studio-text">
              {isRemix ? '🎨 Remix Content' : 'Upload Content'}
            </h2>
            <p className="text-xs text-studio-muted">
              {isRemix && `Remixing "${remixFrom?.name}" • `}
              Step {currentStepIndex + 1} of {steps.length}
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close upload wizard"
            aria-label="Close upload wizard"
            className="rounded-lg p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="bg-studio-surface px-6 py-2">
          <progress
            className="h-1 w-full overflow-hidden rounded bg-studio-surface [&::-webkit-progress-bar]:bg-studio-surface [&::-webkit-progress-value]:bg-studio-accent [&::-moz-progress-bar]:bg-studio-accent"
            value={currentStepIndex + 1}
            max={steps.length}
            aria-label="Upload wizard progress"
          />
        </div>

        {/* Step Content */}
        <div className="p-6">
          {currentStep === 'type' && (
            <TypeSelectionStep
              selectedType={selectedType}
              onChangeType={setSelectedType}
            />
          )}

          {currentStep === 'file' && (
            <FileUploadStep
              contentFile={contentFile}
              projectDNA={projectDNA}
              onChangeFile={(file) => {
                setContentFile(file);
                const dna = inferProjectDNA(file);
                setProjectDNA(dna);
                setDaemonProfile(dna.recommendedProfile);
              }}
              onProjectDNADetected={(dna) => {
                setProjectDNA(dna);
                setDaemonProfile(dna.recommendedProfile);
              }}
            />
          )}

          {currentStep === 'analysis' && (
            <AnalysisStep projectDNA={projectDNA} />
          )}

          {currentStep === 'thumbnail' && (
            <ThumbnailStep
              thumbnailFile={thumbnailFile}
              onChangeThumbnail={setThumbnailFile}
            />
          )}

          {currentStep === 'metadata' && (
            <MetadataStep
              metadata={metadata}
              onChangeMetadata={(key, value) => {
                setMetadata({ ...metadata, [key]: value });
              }}
            />
          )}

          {currentStep === 'daemon' && (
            <DaemonConfigStep
              enableDaemon={enableDaemon}
              daemonProfile={daemonProfile}
              onChangeEnableDaemon={setEnableDaemon}
              onChangeDaemonProfile={setDaemonProfile}
            />
          )}

          {currentStep === 'preview' && (
            <PreviewStep
              selectedType={selectedType}
              contentFile={contentFile}
              thumbnailFile={thumbnailFile}
              metadata={metadata}
              projectDNA={projectDNA}
              enableDaemon={enableDaemon}
              daemonProfile={daemonProfile}
            />
          )}

          {currentStep === 'submit' && (
            <SubmitStep
              uploading={uploading}
              progress={progress}
              daemonJobId={daemonJobId}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-studio-border px-6 py-4">
          <button
            onClick={handlePrevious}
            disabled={currentStepIndex === 0 || uploading}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-medium text-studio-muted transition hover:text-studio-text disabled:opacity-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Previous
          </button>

          <div className="flex gap-2">
            {currentStep !== 'preview' && currentStep !== 'submit' && (
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className="flex items-center gap-2 rounded-lg bg-studio-accent px-4 py-2 text-xs font-medium text-white transition hover:bg-studio-accent/80 disabled:opacity-50"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            )}

            {currentStep === 'preview' && (
              <button
                onClick={handleSubmit}
                disabled={uploading}
                className="flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-600 disabled:opacity-50"
              >
                <Upload className="h-4 w-4" />
                Submit for Review
              </button>
            )}
          </div>
        </div>
      </div>

      {showOperationsSurface && (
        <OperationsSurfacePanel onClose={() => setShowOperationsSurface(false)} />
      )}
    </div>
  );
}
