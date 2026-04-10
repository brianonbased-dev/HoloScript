/**
 * English (en) locale — HoloScript Studio
 *
 * Keys follow dot-notation namespaces:
 *   common.*          Buttons, labels used everywhere
 *   errors.*          User-facing error messages
 *   nav.*             Navigation labels
 *   ai.*              AI panel labels
 *   assets.*          Asset management
 *   publish.*         Publish / share flow
 *   settings.*        Settings page
 *   workspace.*       Workspace panel
 *   collab.*          Collaboration features
 *   materials.*       Material editor
 *   particles.*       Particle system panel
 *   physics.*         Physics panel
 *   audio.*           Audio panel
 *   registry.*        Registry panel
 *   holomesh.*        HoloMesh section
 *   wizard.*          Onboarding wizards
 *   templates.*       Template gallery
 *   export.*          Export pipeline
 *   share.*           Share panel
 *   remote.*          Remote / QR panel
 *   marketplace.*     Agent marketplace
 *   operations.*      Operations hub
 *   environment.*     Environment panel
 *   lod.*             LOD panel
 *   shader.*          Shader editor
 *   nodes.*           Node graph editor
 *   scenarios.*       Scenarios
 *   character.*       Character studio
 */

const en = {
  // ── Common ────────────────────────────────────────────────────────────────
  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.remove': 'Remove',
  'common.apply': 'Apply',
  'common.confirm': 'Confirm',
  'common.reset': 'Reset',
  'common.create': 'Create',
  'common.search': 'Search',
  'common.filter': 'Filter',
  'common.loading': 'Loading…',
  'common.saving': 'Saving…',
  'common.saved': 'Saved',
  'common.copy': 'Copy',
  'common.copied': 'Copied!',
  'common.paste': 'Paste',
  'common.upload': 'Upload',
  'common.download': 'Download',
  'common.preview': 'Preview',
  'common.publish': 'Publish',
  'common.share': 'Share',
  'common.deploy': 'Deploy',
  'common.run': 'Run',
  'common.stop': 'Stop',
  'common.retry': 'Retry',
  'common.select': 'Select',
  'common.selectAll': 'Select All',
  'common.clear': 'Clear',
  'common.refresh': 'Refresh',
  'common.back': 'Back',
  'common.next': 'Next',
  'common.finish': 'Finish',
  'common.skip': 'Skip',
  'common.continue': 'Continue',
  'common.submit': 'Submit',
  'common.import': 'Import',
  'common.export': 'Export',
  'common.generate': 'Generate',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.ok': 'OK',
  'common.open': 'Open',
  'common.openInNew': 'Open in new tab',
  'common.noResults': 'No results found',
  'common.noItems': 'No items',
  'common.optional': 'Optional',
  'common.required': 'Required',
  'common.unknown': 'Unknown',
  'common.none': 'None',

  // ── Errors ────────────────────────────────────────────────────────────────
  'errors.generic': 'Something went wrong. Please try again.',
  'errors.network': 'Network error. Check your connection and retry.',
  'errors.unauthorized': 'You are not authorised to perform this action.',
  'errors.notFound': 'The requested resource was not found.',
  'errors.timeout': 'The request timed out. Please try again.',
  'errors.validation': 'Please check the form and fix any errors.',
  'errors.uploadFailed': 'Upload failed. Please try again.',
  'errors.saveFailed': 'Save failed. Please try again.',
  'errors.loadFailed': 'Failed to load. Please refresh.',
  'errors.generationFailed': 'Generation failed: {{reason}}',
  'errors.compilationFailed': 'Compilation failed: {{reason}}',
  'errors.deployFailed': 'Deployment failed: {{reason}}',

  // ── Navigation ────────────────────────────────────────────────────────────
  'nav.home': 'Home',
  'nav.workspace': 'Workspace',
  'nav.projects': 'Projects',
  'nav.templates': 'Templates',
  'nav.registry': 'Registry',
  'nav.integrations': 'Integrations',
  'nav.operations': 'Operations',
  'nav.pipeline': 'Pipeline',
  'nav.settings': 'Settings',
  'nav.holomesh': 'HoloMesh',
  'nav.scenarios': 'Scenarios',
  'nav.character': 'Character Studio',
  'nav.admin': 'Admin',
  'nav.signIn': 'Sign In',
  'nav.signOut': 'Sign Out',

  // ── AI ────────────────────────────────────────────────────────────────────
  'ai.title': 'AI Assistant',
  'ai.materialGenerator.title': 'AI Material Generator',
  'ai.materialGenerator.prompt.placeholder': 'Describe the material you want…',
  'ai.materialGenerator.generate': 'Generate Material',
  'ai.materialGenerator.applyToSelected': 'Apply to Selected',
  'ai.sceneGenerator.title': 'AI Scene Generator',
  'ai.sceneGenerator.prompt.placeholder': 'Describe your scene…',
  'ai.sceneGenerator.generate': 'Generate Scene',
  'ai.promptLibrary.title': 'Prompt Library',
  'ai.promptLibrary.save': 'Save Prompt',
  'ai.promptLibrary.noPrompts': 'No saved prompts yet',
  'ai.status.thinking': 'Thinking…',
  'ai.status.generating': 'Generating…',
  'ai.status.done': 'Done',
  'ai.status.idle': 'Ready',

  // ── Assets ────────────────────────────────────────────────────────────────
  'assets.title': 'Assets',
  'assets.upload': 'Upload Asset',
  'assets.drag': 'Drag and drop files here',
  'assets.dragOr': 'Drag files here or',
  'assets.browse': 'browse',
  'assets.pack.title': 'Asset Pack',
  'assets.pack.install': 'Install Pack',
  'assets.pack.installed': 'Installed',
  'assets.noAssets': 'No assets yet',

  // ── Publish ───────────────────────────────────────────────────────────────
  'publish.title': 'Publish',
  'publish.modal.title': 'Publish Project',
  'publish.modal.name.label': 'Project Name',
  'publish.modal.description.label': 'Description',
  'publish.modal.visibility.label': 'Visibility',
  'publish.modal.visibility.public': 'Public',
  'publish.modal.visibility.private': 'Private',
  'publish.publishing': 'Publishing…',
  'publish.success': 'Published successfully!',
  'publish.failed': 'Publish failed',
  'publish.viewLive': 'View Live',

  // ── Settings ──────────────────────────────────────────────────────────────
  'settings.title': 'Settings',
  'settings.apiKeys.title': 'API Keys',
  'settings.apiKeys.add': 'Add Key',
  'settings.apiKeys.noKeys': 'No API keys configured',
  'settings.profile.title': 'Profile',
  'settings.theme.title': 'Theme',
  'settings.theme.light': 'Light',
  'settings.theme.dark': 'Dark',
  'settings.theme.system': 'System',
  'settings.language.title': 'Language',
  'settings.saving': 'Saving settings…',
  'settings.saved': 'Settings saved',

  // ── Workspace ─────────────────────────────────────────────────────────────
  'workspace.title': 'Workspace',
  'workspace.newProject': 'New Project',
  'workspace.noProjects': 'No projects yet',
  'workspace.skills.title': 'Skills',

  // ── Collaboration ─────────────────────────────────────────────────────────
  'collab.connected': 'Connected',
  'collab.disconnected': 'Disconnected',
  'collab.connecting': 'Connecting…',
  'collab.collaborators': '{{count}} collaborator',
  'collab.collaborators_plural': '{{count}} collaborators',
  'collab.share.title': 'Share for Collaboration',
  'collab.share.copyLink': 'Copy Link',

  // ── Materials ─────────────────────────────────────────────────────────────
  'materials.title': 'Materials',
  'materials.add': 'Add Material',
  'materials.name': 'Material Name',
  'materials.type': 'Type',
  'materials.noMaterials': 'No materials',

  // ── Particles ─────────────────────────────────────────────────────────────
  'particles.title': 'Particle System',
  'particles.add': 'Add Emitter',
  'particles.count': 'Particle Count',
  'particles.lifetime': 'Lifetime',

  // ── Physics ──────────────────────────────────────────────────────────────
  'physics.title': 'Physics',
  'physics.gravity': 'Gravity',
  'physics.collider': 'Collider',
  'physics.mass': 'Mass',
  'physics.restitution': 'Restitution',

  // ── Audio ────────────────────────────────────────────────────────────────
  'audio.title': 'Audio',
  'audio.upload': 'Upload Audio',
  'audio.play': 'Play',
  'audio.pause': 'Pause',
  'audio.volume': 'Volume',
  'audio.loop': 'Loop',

  // ── Registry ─────────────────────────────────────────────────────────────
  'registry.title': 'Registry',
  'registry.publish': 'Publish to Registry',
  'registry.search.placeholder': 'Search registry…',
  'registry.noResults': 'No registry entries found',

  // ── HoloMesh ─────────────────────────────────────────────────────────────
  'holomesh.title': 'HoloMesh',
  'holomesh.contribute': 'Contribute',
  'holomesh.dashboard': 'Dashboard',
  'holomesh.onboard': 'Get Started',
  'holomesh.knowledge.wisdom': 'Wisdom',
  'holomesh.knowledge.pattern': 'Pattern',
  'holomesh.knowledge.gotcha': 'Gotcha',

  // ── Wizards ──────────────────────────────────────────────────────────────
  'wizard.quickstart.title': 'Quick Start',
  'wizard.quickstart.welcome': 'Welcome to HoloScript Studio',
  'wizard.importRepo.title': 'Import Repository',
  'wizard.importRepo.url.label': 'Repository URL',
  'wizard.importRepo.url.placeholder': 'https://github.com/org/repo',
  'wizard.studioSetup.title': 'Studio Setup',
  'wizard.workspaceCreation.title': 'Create Workspace',
  'wizard.step': 'Step {{current}} of {{total}}',

  // ── Templates ────────────────────────────────────────────────────────────
  'templates.title': 'Templates',
  'templates.apply': 'Use Template',
  'templates.noTemplates': 'No templates available',
  'templates.meme.title': 'Meme Templates',
  'templates.example.title': 'Example Gallery',

  // ── Export ───────────────────────────────────────────────────────────────
  'export.title': 'Export',
  'export.pipeline.title': 'Export Pipeline',
  'export.format': 'Format',
  'export.target': 'Target',
  'export.exporting': 'Exporting…',
  'export.success': 'Export complete',
  'export.failed': 'Export failed',

  // ── Share ────────────────────────────────────────────────────────────────
  'share.title': 'Share',
  'share.link.label': 'Share Link',
  'share.link.copy': 'Copy Link',
  'share.embed.label': 'Embed Code',
  'share.embed.copy': 'Copy Embed Code',
  'share.qr.title': 'QR Code',

  // ── Remote ───────────────────────────────────────────────────────────────
  'remote.title': 'Remote Control',
  'remote.qr.title': 'Scan to Connect',
  'remote.connected': 'Device connected',
  'remote.waiting': 'Waiting for connection…',

  // ── Marketplace ──────────────────────────────────────────────────────────
  'marketplace.title': 'Agent Marketplace',
  'marketplace.search.placeholder': 'Search agents…',
  'marketplace.install': 'Install',
  'marketplace.installed': 'Installed',
  'marketplace.noResults': 'No agents found',

  // ── Operations ───────────────────────────────────────────────────────────
  'operations.title': 'Operations',
  'operations.jobs': 'Jobs',
  'operations.metrics': 'Metrics',
  'operations.daemon': 'Daemon',
  'operations.noJobs': 'No active jobs',

  // ── Environment ──────────────────────────────────────────────────────────
  'environment.title': 'Environment',
  'environment.skybox': 'Skybox',
  'environment.fog': 'Fog',
  'environment.lighting': 'Lighting',

  // ── LOD ──────────────────────────────────────────────────────────────────
  'lod.title': 'Level of Detail',
  'lod.add': 'Add LOD Level',
  'lod.distance': 'Distance',

  // ── Shader ───────────────────────────────────────────────────────────────
  'shader.title': 'Shader Editor',
  'shader.compile': 'Compile',
  'shader.compiling': 'Compiling…',
  'shader.copyCode': 'Copy Code',

  // ── Node Graph ───────────────────────────────────────────────────────────
  'nodes.title': 'Node Graph',
  'nodes.addNode': 'Add Node',
  'nodes.deleteNode': 'Delete Node',
  'nodes.noNodes': 'Add a node to get started',

  // ── Scenarios ────────────────────────────────────────────────────────────
  'scenarios.title': 'Scenarios',
  'scenarios.create': 'Create Scenario',
  'scenarios.noScenarios': 'No scenarios yet',

  // ── Character ────────────────────────────────────────────────────────────
  'character.title': 'Character Studio',
  'character.generate': 'Generate Character',
  'character.generating': 'Generating…',
  'character.noCharacters': 'No characters yet',
} as const;

export type LocaleKeys = keyof typeof en;

export default en;
