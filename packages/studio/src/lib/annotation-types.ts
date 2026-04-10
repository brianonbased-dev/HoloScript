export interface StoredAnnotation {
  id: string;
  x: number;
  y: number;
  comment: string;
  element: string;
  elementPath: string;
  timestamp: number;
  selectedText?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  nearbyText?: string;
  cssClasses?: string;
  reactComponents?: string;
  sourceFile?: string;
  fullPath?: string;
  accessibility?: string;
  kind?: 'feedback' | 'placement' | 'rearrange';
  intent?: 'fix' | 'change' | 'question' | 'approve';
  severity?: 'blocking' | 'important' | 'suggestion';
  status?: 'pending' | 'acknowledged' | 'resolved' | 'dismissed';
  url?: string;
  resolvedAt?: string;
  resolvedBy?: 'human' | 'agent';
  placement?: {
    componentType: string;
    width: number;
    height: number;
    scrollY: number;
    text?: string;
  };
  rearrange?: {
    selector: string;
    label: string;
    tagName: string;
    originalRect: { x: number; y: number; width: number; height: number };
    currentRect: { x: number; y: number; width: number; height: number };
  };
}

export interface AnnotationSession {
  id: string;
  createdAt: string;
  updatedAt: string;
  route: string;
  annotations: StoredAnnotation[];
  metadata?: {
    userAgent?: string;
    viewport?: { width: number; height: number };
    theme?: 'dark' | 'light';
  };
}
