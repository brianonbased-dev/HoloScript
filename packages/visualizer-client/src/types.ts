export interface OrbData {
  id: string;
  name: string;
  position: [number, number, number];
  properties: Record<string, any>;
  hologram?: {
    color?: string;
    size?: number;
    shape?: 'sphere' | 'cube';
    glow?: boolean;
  };
  traits?: string[];
  [key: string]: any;
}
