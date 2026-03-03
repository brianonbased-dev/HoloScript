/**
 * Content Upload Wizard
 * Multi-step wizard for uploading content to the marketplace
 */

import { useState, useCallback } from 'react';
import { X, Upload, Image, FileText, Eye, CheckCircle, ArrowRight, ArrowLeft } from 'lucide-react';
import { ContentType, CONTENT_TYPE_METADATA, ContentUpload } from '@/lib/marketplace/types';
import { useUpload } from '@/lib/marketplace/hooks';

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

type WizardStep = 'type' | 'file' | 'thumbnail' | 'metadata' | 'preview' | 'submit';

export function UploadWizard({ onClose, onSuccess, remixFrom }: UploadWizardProps) {
  const isRemix = !!remixFrom;
  const [currentStep, setCurrentStep] = useState<WizardStep>(isRemix ? 'file' : 'type');
  const [selectedType, setSelectedType] = useState<ContentType | null>(remixFrom?.type || null);
  const [contentFile, setContentFile] = useState<File | null>(null);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [metadata, setMetadata] = useState({
    name: remixFrom ? `${remixFrom.name} (Remix)` : '',
    description: remixFrom ? `Remix of "${remixFrom.name}" by ${remixFrom.author.name}\n\n${remixFrom.description}` : '',
    category: '',
    tags: remixFrom ? ['remix'] : [] as string[],
    license: 'MIT' as const,
    version: '1.0.0',
    remixOf: remixFrom?.id,
  });

  const { upload, uploading, progress } = useUpload();

  const steps: WizardStep[] = ['type', 'file', 'thumbnail', 'metadata', 'preview', 'submit'];
  const currentStepIndex = steps.indexOf(currentStep);

  const canProceed = useCallback(() => {
    switch (currentStep) {
      case 'type':
        return selectedType !== null;
      case 'file':
        return contentFile !== null;
      case 'thumbnail':
        return thumbnailFile !== null;
      case 'metadata':
        return metadata.name.trim() !== '' && metadata.description.trim() !== '' && metadata.category !== '';
      case 'preview':
        return true;
      default:
        return false;
    }
  }, [currentStep, selectedType, contentFile, thumbnailFile, metadata]);

  const handleNext = () => {
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
      setCurrentStep('submit');

      // Wait 2 seconds to show success message, then close
      setTimeout(() => {
        onSuccess?.(result.id);
        onClose();
      }, 2000);
    } catch (error) {
      console.error('Upload failed:', error);
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

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, type: 'content' | 'thumbnail') => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      if (type === 'content') {
        setContentFile(file);
      } else {
        setThumbnailFile(file);
      }
    }
  }, []);

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
            className="rounded-lg p-2 text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="h-1 bg-studio-surface">
          <div
            className="h-full bg-studio-accent transition-all duration-300"
            style={{ width: `${((currentStepIndex + 1) / steps.length) * 100}%` }}
          />
        </div>

        {/* Step Content */}
        <div className="p-6">
          {/* Step 1: Content Type Selection */}
          {currentStep === 'type' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-studio-text">Select Content Type</h3>
              <div className="grid grid-cols-3 gap-3">
                {Object.entries(CONTENT_TYPE_METADATA).map(([type, meta]) => {
                  const Icon = meta.icon as any;
                  const isSelected = selectedType === type;

                  return (
                    <button
                      key={type}
                      onClick={() => setSelectedType(type as ContentType)}
                      className={`flex flex-col items-center gap-2 rounded-lg border p-4 transition ${
                        isSelected
                          ? 'border-studio-accent bg-studio-accent/10 text-studio-accent'
                          : 'border-studio-border bg-studio-surface text-studio-muted hover:border-studio-accent/40 hover:text-studio-text'
                      }`}
                    >
                      <Icon className="h-6 w-6" />
                      <span className="text-xs font-medium">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: File Upload */}
          {currentStep === 'file' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-studio-text">Upload File</h3>
              <div
                onDrop={(e) => handleDrop(e, 'content')}
                onDragOver={handleDragOver}
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-studio-border bg-studio-surface p-12 transition hover:border-studio-accent/40"
              >
                <Upload className="h-12 w-12 text-studio-muted" />
                <p className="mt-4 text-sm font-medium text-studio-text">
                  {contentFile ? contentFile.name : 'Drag & drop file or click to browse'}
                </p>
                <p className="mt-1 text-xs text-studio-muted">
                  {selectedType && `Accepted: ${CONTENT_TYPE_METADATA[selectedType].fileExtension}`}
                </p>
                <input
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="content-file"
                  accept={selectedType ? CONTENT_TYPE_METADATA[selectedType].fileExtension : '*'}
                />
                <label
                  htmlFor="content-file"
                  className="mt-4 cursor-pointer rounded-lg bg-studio-accent px-4 py-2 text-xs font-medium text-white transition hover:bg-studio-accent/80"
                >
                  Choose File
                </label>
              </div>
            </div>
          )}

          {/* Step 3: Thumbnail Upload */}
          {currentStep === 'thumbnail' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-studio-text">Upload Thumbnail</h3>
              <div
                onDrop={(e) => handleDrop(e, 'thumbnail')}
                onDragOver={handleDragOver}
                className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-studio-border bg-studio-surface p-12 transition hover:border-studio-accent/40"
              >
                {thumbnailFile ? (
                  <img
                    src={URL.createObjectURL(thumbnailFile)}
                    alt="Thumbnail preview"
                    className="h-48 w-48 rounded-lg object-cover"
                  />
                ) : (
                  <>
                    <Image className="h-12 w-12 text-studio-muted" />
                    <p className="mt-4 text-sm font-medium text-studio-text">
                      Drag & drop thumbnail or click to browse
                    </p>
                    <p className="mt-1 text-xs text-studio-muted">
                      Recommended: 800x600px, PNG or JPG
                    </p>
                  </>
                )}
                <input
                  type="file"
                  onChange={handleThumbnailSelect}
                  className="hidden"
                  id="thumbnail-file"
                  accept="image/png,image/jpeg"
                />
                <label
                  htmlFor="thumbnail-file"
                  className="mt-4 cursor-pointer rounded-lg bg-studio-accent px-4 py-2 text-xs font-medium text-white transition hover:bg-studio-accent/80"
                >
                  Choose Thumbnail
                </label>
              </div>
            </div>
          )}

          {/* Step 4: Metadata Form */}
          {currentStep === 'metadata' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-studio-text">Content Details</h3>

              <div>
                <label className="mb-1 block text-xs font-medium text-studio-muted">
                  Title *
                </label>
                <input
                  type="text"
                  value={metadata.name}
                  onChange={(e) => setMetadata({ ...metadata, name: e.target.value })}
                  className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text outline-none focus:border-studio-accent"
                  placeholder="Enter content title"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-studio-muted">
                  Description *
                </label>
                <textarea
                  value={metadata.description}
                  onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                  className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text outline-none focus:border-studio-accent"
                  placeholder="Describe your content"
                  rows={4}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-studio-muted">
                    Category *
                  </label>
                  <select
                    value={metadata.category}
                    onChange={(e) => setMetadata({ ...metadata, category: e.target.value })}
                    className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text outline-none focus:border-studio-accent"
                  >
                    <option value="">Select category</option>
                    <optgroup label="AI Skills & Configs">
                      <option value="ai-skills">AI Skills</option>
                      <option value="agent-configs">Agent Configs</option>
                      <option value="mcp-bundles">MCP Bundles</option>
                    </optgroup>
                    <optgroup label="AI Orchestration">
                      <option value="ai-workflows">AI Workflows</option>
                      <option value="behavior-trees">Behavior Trees</option>
                    </optgroup>
                    <optgroup label="3D Content">
                      <option value="scenes">3D Scenes</option>
                      <option value="characters">Characters</option>
                      <option value="models">3D Models</option>
                      <option value="materials">Materials</option>
                    </optgroup>
                    <optgroup label="Media">
                      <option value="animations">Animations</option>
                      <option value="audio">Audio</option>
                      <option value="music">Music</option>
                    </optgroup>
                    <optgroup label="XR">
                      <option value="vr-environments">VR Environments</option>
                      <option value="ar-experiences">AR Experiences</option>
                    </optgroup>
                    <optgroup label="Development">
                      <option value="plugins">Plugins</option>
                      <option value="scripts">Scripts</option>
                      <option value="presets">Presets</option>
                    </optgroup>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-studio-muted">
                    License *
                  </label>
                  <select
                    value={metadata.license}
                    onChange={(e) => setMetadata({ ...metadata, license: e.target.value as any })}
                    className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text outline-none focus:border-studio-accent"
                  >
                    <option value="MIT">MIT</option>
                    <option value="CC0">CC0 (Public Domain)</option>
                    <option value="CC-BY">CC-BY</option>
                    <option value="CC-BY-SA">CC-BY-SA</option>
                    <option value="Commercial">Commercial</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-studio-muted">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={metadata.tags.join(', ')}
                  onChange={(e) => setMetadata({
                    ...metadata,
                    tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)
                  })}
                  className="w-full rounded-lg border border-studio-border bg-studio-surface px-3 py-2 text-sm text-studio-text outline-none focus:border-studio-accent"
                  placeholder="e.g., vr, animation, beginner-friendly"
                />
              </div>
            </div>
          )}

          {/* Step 5: Preview */}
          {currentStep === 'preview' && (
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-studio-text">Preview</h3>
              <div className="rounded-lg border border-studio-border bg-studio-surface p-4">
                <div className="flex gap-4">
                  {thumbnailFile && (
                    <img
                      src={URL.createObjectURL(thumbnailFile)}
                      alt={metadata.name}
                      className="h-32 w-32 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-studio-text">{metadata.name}</h4>
                    <p className="mt-1 text-xs text-studio-muted">{metadata.description}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {metadata.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-studio-accent/20 px-2 py-0.5 text-[10px] text-studio-accent"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-4 text-xs text-studio-muted">
                      <span>License: {metadata.license}</span>
                      <span>Category: {metadata.category}</span>
                      {contentFile && <span>Size: {(contentFile.size / 1024).toFixed(1)} KB</span>}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 6: Submitting */}
          {currentStep === 'submit' && (
            <div className="flex flex-col items-center justify-center py-12">
              {uploading ? (
                <>
                  <div className="h-16 w-16 animate-spin rounded-full border-4 border-studio-border border-t-studio-accent" />
                  <p className="mt-4 text-sm font-medium text-studio-text">
                    Uploading... {progress}%
                  </p>
                </>
              ) : (
                <>
                  <CheckCircle className="h-16 w-16 text-green-500" />
                  <p className="mt-4 text-sm font-medium text-studio-text">
                    Content uploaded successfully!
                  </p>
                  <p className="mt-1 text-xs text-studio-muted">
                    Your content is now pending moderation.
                  </p>
                </>
              )}
            </div>
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
    </div>
  );
}
