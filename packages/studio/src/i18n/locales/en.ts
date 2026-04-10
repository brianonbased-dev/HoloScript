/** English translations — default locale for HoloScript Studio */
const en = {
  studio: {
    title: 'HoloScript Studio',
    tagline: 'Create 3D scenes with AI',
    loading: 'Loading Studio...',
  },
  nav: {
    home: 'Home',
    create: 'Create',
    projects: 'Projects',
    workspace: 'Workspace',
    templates: 'Templates',
    registry: 'Registry',
    settings: 'Settings',
    signIn: 'Sign In',
    signOut: 'Sign Out',
  },
  editor: {
    loading: 'Loading editor...',
    viewport: 'Loading 3D viewport...',
    nodeGraph: 'Loading node graph...',
    shader: 'Loading shader editor...',
    timeline: 'Loading timeline...',
    compile: 'Compile',
    export: 'Export',
    share: 'Share',
    save: 'Save',
    undo: 'Undo',
    redo: 'Redo',
  },
  errors: {
    generic: 'Something went wrong',
    webgl: 'WebGL Context Lost',
    shader: 'Shader Compilation Error',
    network: 'Network Error',
    auth: 'Authentication Required',
    tryAgain: 'Try Again',
    backHome: 'Back to Home',
    autoSaved: 'Your work has been auto-saved.',
  },
  auth: {
    signIn: 'Sign in to HoloScript Studio',
    continueWith: 'Continue with {provider}',
    error: 'An error occurred. Try again.',
  },
  holomesh: {
    title: 'HoloMesh',
    connecting: 'Connecting to HoloMesh...',
    unreachable: 'HoloMesh Unreachable',
  },
  absorb: {
    title: 'Absorb Intelligence',
    loading: 'Loading Absorb Intelligence...',
  },
  workspace: {
    title: 'Workspace',
    loading: 'Loading Workspace...',
  },
  projects: {
    title: 'Projects',
    loading: 'Loading Projects...',
  },
} as const;

export default en;
