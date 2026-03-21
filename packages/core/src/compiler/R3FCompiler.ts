import { HSPlusAST, ASTNode, HSPlusDirective, VRTraitName } from '../types';
import { TraitCompositor } from '../traits/visual/TraitCompositor';
// Side-effect import: registers all preset visuals into the registry
import '../traits/visual';
import {
  compileDomainBlocks,
  compileMaterialBlock,
  compilePhysicsBlock,
  compileParticleBlock,
  compilePostProcessingBlock,
  compileAudioSourceBlock,
  compileWeatherBlock,
  materialToR3F,
  physicsToR3F,
  particlesToR3F,
  postProcessingToR3F,
  audioSourceToR3F,
  weatherToR3F,
} from './DomainBlockCompilerMixin';
import { getRBAC, ResourceType } from './identity/AgentRBAC';
import { UnauthorizedCompilerAccessError } from './CompilerBase';
import { WorkflowStep } from './identity/AgentIdentity';
import { ASTNodePool } from './ObjectPool';

// OOM fix: Pre-allocation reduced from 20K to 0 (demand-allocated).
// The pool is used (acquire at compileNode, compileComposition, compileLight)
// but 20K × ~80 bytes = ~1.6MB pre-allocated upfront was wasteful.
// Nodes are created on first acquire() and recycled via release().
const r3fNodePool = new ASTNodePool<R3FNode>(
  () => ({ type: '', props: {} }),
  (node) => {
    node.type = '';
    node.id = undefined;
    node.props = {};
    node.children = undefined;
    node.traits = undefined;
    node.directives = undefined;
    node.assetMaturity = undefined;
  },
  0 // Was 20000 — demand-allocate instead of pre-allocating
);

export interface R3FNode {
  type: string;
  id?: string;
  props: Record<string, any>;
  children?: R3FNode[];
  traits?: Map<VRTraitName, Record<string, unknown>>;
  directives?: HSPlusDirective[];
  /**
   * Asset maturity stage in the Draft→Mesh→Simulation pipeline.
   * - 'draft': Geometric primitive (shape-as-pixel), used for blockout AND collision proxy
   * - 'mesh': Imported/generated mesh with LOD, still iterating
   * - 'final': Production-ready asset with full materials and optimized LOD chain
   * Defaults to 'mesh' for backward compatibility.
   */
  assetMaturity?: 'draft' | 'mesh' | 'final';
}

/**
 * Material presets mapping surface names to Three.js PBR properties.
 */
export const MATERIAL_PRESETS: Record<string, Record<string, unknown>> = {
  plastic: { roughness: 0.5, metalness: 0.0, clearcoat: 0.1 },
  metal: { roughness: 0.2, metalness: 1.0 },
  chrome: { roughness: 0.05, metalness: 1.0, envMapIntensity: 1.5 },
  gold: { roughness: 0.3, metalness: 1.0, color: '#ffd700' },
  copper: { roughness: 0.4, metalness: 1.0, color: '#b87333' },
  glass: {
    roughness: 0.0,
    metalness: 0.0,
    transmission: 0.95,
    ior: 1.5,
    thickness: 0.5,
    transparent: true,
  },
  crystal: {
    roughness: 0.0,
    metalness: 0.1,
    transmission: 0.9,
    ior: 2.0,
    iridescence: 1.0,
    iridescenceIOR: 1.3,
  },
  wood: { roughness: 0.8, metalness: 0.0 },
  fabric: {
    roughness: 0.95,
    metalness: 0.0,
    sheen: 0.5,
    sheenRoughness: 0.8,
    sheenColor: '#ffffff',
  },
  rubber: { roughness: 0.9, metalness: 0.0 },
  leather: {
    roughness: 0.7,
    metalness: 0.0,
    sheen: 0.3,
    sheenRoughness: 0.6,
    sheenColor: '#3d2b1f',
  },
  water: {
    roughness: 0.0,
    metalness: 0.0,
    transmission: 0.9,
    ior: 1.33,
    transparent: true,
    color: '#006994',
  },
  emissive: { roughness: 0.5, metalness: 0.0, emissiveIntensity: 2.0 },
  hologram: {
    roughness: 0.0,
    metalness: 0.3,
    transparent: true,
    opacity: 0.6,
    emissiveIntensity: 1.0,
  },
  stone: { roughness: 0.85, metalness: 0.0, color: '#808080' },
  marble: { roughness: 0.15, metalness: 0.0, color: '#F0EDE6', envMapIntensity: 0.8 },
  shiny: { roughness: 0.05, metalness: 0.3, envMapIntensity: 1.5, clearcoat: 0.8 },
  neon: {
    roughness: 0.0,
    metalness: 0.0,
    emissiveIntensity: 3.0,
    transparent: true,
    opacity: 0.9,
  },
  toon: { roughness: 1.0, metalness: 0.0 },
  wireframe: { roughness: 0.5, metalness: 0.5, wireframe: true },
  velvet: {
    roughness: 1.0,
    metalness: 0.0,
    sheen: 1.0,
    sheenRoughness: 0.8,
    sheenColor: '#ffffff',
    clearcoat: 0.3,
  },
  xray: { roughness: 0.0, metalness: 0.0, transparent: true, opacity: 0.3, emissiveIntensity: 0.5 },
  gradient: { roughness: 0.5, metalness: 0.0 },
  matte: { roughness: 1.0, metalness: 0.0 },

  // ===========================================================================
  // REALISTIC FABRICS — differentiated by sheen, roughness, and anisotropy
  // ===========================================================================
  cotton: {
    roughness: 0.95,
    metalness: 0.0,
    sheen: 0.6,
    sheenRoughness: 0.9,
    sheenColor: '#ffffff',
  },
  polyester: {
    roughness: 0.7,
    metalness: 0.0,
    sheen: 0.8,
    sheenRoughness: 0.4,
    sheenColor: '#e8e8e8',
  },
  silk: {
    roughness: 0.3,
    metalness: 0.0,
    sheen: 1.0,
    sheenRoughness: 0.2,
    sheenColor: '#fffaf0',
    anisotropy: 0.8,
    anisotropyRotation: 0,
  },
  satin: {
    roughness: 0.25,
    metalness: 0.0,
    sheen: 0.9,
    sheenRoughness: 0.15,
    sheenColor: '#fff5ee',
    anisotropy: 0.6,
    anisotropyRotation: 0,
  },
  linen: {
    roughness: 0.9,
    metalness: 0.0,
    sheen: 0.4,
    sheenRoughness: 0.85,
    sheenColor: '#f5f0e8',
  },
  wool: {
    roughness: 1.0,
    metalness: 0.0,
    sheen: 0.7,
    sheenRoughness: 1.0,
    sheenColor: '#e8dcc8',
  },
  denim: {
    roughness: 0.85,
    metalness: 0.0,
    color: '#2b4570',
    sheen: 0.5,
    sheenRoughness: 0.7,
    sheenColor: '#4a6fa5',
  },
  canvas: {
    roughness: 0.95,
    metalness: 0.0,
    color: '#c8b88a',
    sheen: 0.3,
    sheenRoughness: 0.9,
    sheenColor: '#d4c9a8',
  },
  burlap: {
    roughness: 1.0,
    metalness: 0.0,
    color: '#8b7355',
    sheen: 0.2,
    sheenRoughness: 1.0,
    sheenColor: '#a08060',
  },

  // ===========================================================================
  // SKIN & ORGANIC — differentiated by subsurface scattering
  // ===========================================================================
  skin: {
    roughness: 0.5,
    metalness: 0.0,
    color: '#e8b89d',
    thickness: 0.8,
    attenuationColor: '#cc4422',
    attenuationDistance: 0.5,
  },
  skin_dark: {
    roughness: 0.45,
    metalness: 0.0,
    color: '#8d5524',
    thickness: 1.0,
    attenuationColor: '#661111',
    attenuationDistance: 0.3,
  },
  // Dragon / creature material presets
  dragon_bone: {
    roughness: 0.35,
    metalness: 0.15,
    color: '#e8dcc8',
  },
  dragon_leather: {
    roughness: 0.8,
    metalness: 0.0,
    color: '#5c3a21',
  },
  dragon_scale: {
    roughness: 0.25,
    metalness: 0.4,
    color: '#1a0d3d',
  },
  obsidian: {
    roughness: 0.05,
    metalness: 0.1,
    color: '#0d0d0d',
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.2,
  },
  skin_pale: {
    roughness: 0.55,
    metalness: 0.0,
    color: '#fde0c8',
    thickness: 0.6,
    attenuationColor: '#ee5533',
    attenuationDistance: 0.6,
  },
  candle_wax: {
    roughness: 0.7,
    metalness: 0.0,
    color: '#fff8dc',
    thickness: 2.0,
    attenuationColor: '#ffaa44',
    attenuationDistance: 0.3,
    transmission: 0.15,
  },
  jade: {
    roughness: 0.2,
    metalness: 0.0,
    color: '#00a86b',
    thickness: 1.5,
    attenuationColor: '#004d32',
    attenuationDistance: 1.0,
    transmission: 0.1,
  },
  milk: {
    roughness: 0.3,
    metalness: 0.0,
    color: '#fdfff5',
    thickness: 1.0,
    attenuationColor: '#fff5d6',
    attenuationDistance: 0.2,
    transmission: 0.6,
    ior: 1.35,
  },
  leaf: {
    roughness: 0.6,
    metalness: 0.0,
    color: '#228b22',
    thickness: 0.3,
    attenuationColor: '#44cc22',
    attenuationDistance: 0.5,
  },
  honey: {
    roughness: 0.1,
    metalness: 0.0,
    color: '#eb9605',
    thickness: 1.5,
    attenuationColor: '#cc6600',
    attenuationDistance: 0.4,
    transmission: 0.7,
    ior: 1.5,
  },

  // ===========================================================================
  // MUD & EARTH — differentiated by roughness, color, and subtle properties
  // ===========================================================================
  clay_mud: {
    roughness: 0.95,
    metalness: 0.0,
    color: '#8b4513',
    thickness: 0.5,
    attenuationColor: '#663311',
    attenuationDistance: 0.8,
  },
  sandy_mud: {
    roughness: 0.85,
    metalness: 0.02,
    color: '#c2a66b',
  },
  wet_mud: {
    roughness: 0.4,
    metalness: 0.0,
    color: '#3d2b1f',
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
  },
  dry_earth: {
    roughness: 1.0,
    metalness: 0.0,
    color: '#9b7653',
  },
  peat: {
    roughness: 0.9,
    metalness: 0.0,
    color: '#2d1f0e',
  },
  red_clay: {
    roughness: 0.95,
    metalness: 0.0,
    color: '#cc4b2e',
    thickness: 0.4,
    attenuationColor: '#993322',
    attenuationDistance: 0.6,
  },
  volcanic_ash: {
    roughness: 0.8,
    metalness: 0.05,
    color: '#3c3c3c',
  },
  wet_sand: {
    roughness: 0.6,
    metalness: 0.02,
    color: '#c2b280',
    clearcoat: 0.3,
    clearcoatRoughness: 0.4,
  },
  dry_sand: {
    roughness: 0.95,
    metalness: 0.02,
    color: '#e0cc8e',
  },

  // ===========================================================================
  // METALS (BRUSHED/ANISOTROPIC) — directional roughness
  // ===========================================================================
  brushed_steel: {
    roughness: 0.35,
    metalness: 1.0,
    color: '#c0c0c0',
    anisotropy: 0.7,
    anisotropyRotation: 0,
  },
  brushed_aluminum: {
    roughness: 0.3,
    metalness: 1.0,
    color: '#d0d0d0',
    anisotropy: 0.8,
    anisotropyRotation: 0,
  },
  brushed_copper: {
    roughness: 0.35,
    metalness: 1.0,
    color: '#b87333',
    anisotropy: 0.6,
    anisotropyRotation: 0,
  },
  cast_iron: {
    roughness: 0.7,
    metalness: 0.9,
    color: '#3a3a3a',
  },
  bronze: {
    roughness: 0.45,
    metalness: 1.0,
    color: '#cd7f32',
  },
  silver: {
    roughness: 0.15,
    metalness: 1.0,
    color: '#c0c0c0',
    envMapIntensity: 1.3,
  },
  platinum: {
    roughness: 0.2,
    metalness: 1.0,
    color: '#e5e4e2',
    envMapIntensity: 1.2,
  },
  rust: {
    roughness: 0.9,
    metalness: 0.3,
    color: '#8b3a15',
  },

  // ===========================================================================
  // HAIR & FIBERS — anisotropy-driven
  // ===========================================================================
  hair_dark: {
    roughness: 0.35,
    metalness: 0.0,
    color: '#1a1209',
    anisotropy: 1.0,
    anisotropyRotation: Math.PI / 2,
    sheen: 0.3,
    sheenRoughness: 0.3,
    sheenColor: '#2a2219',
  },
  hair_blonde: {
    roughness: 0.3,
    metalness: 0.0,
    color: '#c8a55a',
    anisotropy: 1.0,
    anisotropyRotation: Math.PI / 2,
    sheen: 0.4,
    sheenRoughness: 0.25,
    sheenColor: '#d4b86a',
  },
  hair_red: {
    roughness: 0.35,
    metalness: 0.0,
    color: '#8b3a15',
    anisotropy: 1.0,
    anisotropyRotation: Math.PI / 2,
    sheen: 0.35,
    sheenRoughness: 0.3,
    sheenColor: '#a04520',
  },

  // ===========================================================================
  // WET SURFACES — clearcoat simulates water film
  // ===========================================================================
  wet_stone: {
    roughness: 0.3,
    metalness: 0.0,
    color: '#606060',
    clearcoat: 0.8,
    clearcoatRoughness: 0.1,
  },
  wet_wood: {
    roughness: 0.4,
    metalness: 0.0,
    color: '#5a3a1a',
    clearcoat: 0.7,
    clearcoatRoughness: 0.15,
  },
  wet_concrete: {
    roughness: 0.5,
    metalness: 0.0,
    color: '#707070',
    clearcoat: 0.5,
    clearcoatRoughness: 0.2,
  },

  // ===========================================================================
  // FOOD & ORGANIC — SSS-heavy
  // ===========================================================================
  fruit: {
    roughness: 0.4,
    metalness: 0.0,
    color: '#ff4444',
    thickness: 0.8,
    attenuationColor: '#cc2200',
    attenuationDistance: 0.5,
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
  },
  cheese: {
    roughness: 0.7,
    metalness: 0.0,
    color: '#ffc125',
    thickness: 1.2,
    attenuationColor: '#cc9900',
    attenuationDistance: 0.4,
  },
  bread: {
    roughness: 0.95,
    metalness: 0.0,
    color: '#c4a35a',
    thickness: 0.3,
    attenuationColor: '#8b6914',
    attenuationDistance: 0.8,
  },
  chocolate: {
    roughness: 0.5,
    metalness: 0.0,
    color: '#3b1e08',
    clearcoat: 0.2,
    clearcoatRoughness: 0.3,
  },

  // ===========================================================================
  // COATED SURFACES — clearcoat-driven
  // ===========================================================================
  car_paint: {
    roughness: 0.1,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.05,
  },
  lacquer: {
    roughness: 0.05,
    metalness: 0.0,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
  },
  varnished_wood: {
    roughness: 0.3,
    metalness: 0.0,
    color: '#8b5e3c',
    clearcoat: 0.9,
    clearcoatRoughness: 0.1,
  },
  glazed_ceramic: {
    roughness: 0.15,
    metalness: 0.0,
    color: '#f0ede6',
    clearcoat: 0.8,
    clearcoatRoughness: 0.05,
  },
  enamel: {
    roughness: 0.1,
    metalness: 0.0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.03,
  },

  // ===========================================================================
  // IRIDESCENT — thin-film interference
  // ===========================================================================
  soap_bubble: {
    roughness: 0.0,
    metalness: 0.0,
    transmission: 0.9,
    ior: 1.33,
    transparent: true,
    opacity: 0.3,
    iridescence: 1.0,
    iridescenceIOR: 1.5,
  },
  oil_slick: {
    roughness: 0.0,
    metalness: 0.1,
    color: '#1a1a2e',
    iridescence: 1.0,
    iridescenceIOR: 1.8,
  },
  beetle_shell: {
    roughness: 0.2,
    metalness: 0.3,
    color: '#0a3d0a',
    iridescence: 0.8,
    iridescenceIOR: 1.6,
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
  },
  pearl: {
    roughness: 0.15,
    metalness: 0.0,
    color: '#fdeef4',
    iridescence: 0.6,
    iridescenceIOR: 1.3,
    sheen: 0.3,
    sheenRoughness: 0.2,
    sheenColor: '#fff0f5',
  },
  abalone: {
    roughness: 0.1,
    metalness: 0.1,
    color: '#e0f0e8',
    iridescence: 1.0,
    iridescenceIOR: 1.5,
  },

  // ===========================================================================
  // GEMSTONES — transmission + IOR + iridescence
  // ===========================================================================
  diamond: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#ffffff',
    transmission: 0.95,
    ior: 2.417,
    thickness: 0.5,
    transparent: true,
  },
  ruby: {
    roughness: 0.05,
    metalness: 0.0,
    color: '#e0115f',
    transmission: 0.4,
    ior: 1.76,
    thickness: 1.0,
  },
  sapphire: {
    roughness: 0.05,
    metalness: 0.0,
    color: '#0f52ba',
    transmission: 0.4,
    ior: 1.77,
    thickness: 1.0,
  },
  emerald: {
    roughness: 0.1,
    metalness: 0.0,
    color: '#50c878',
    transmission: 0.3,
    ior: 1.57,
    thickness: 1.2,
  },
  amber: {
    roughness: 0.1,
    metalness: 0.0,
    color: '#ffbf00',
    transmission: 0.6,
    ior: 1.55,
    thickness: 2.0,
    transparent: true,
    attenuationColor: '#cc6600',
    attenuationDistance: 1.0,
  },
  opal: {
    roughness: 0.15,
    metalness: 0.0,
    color: '#e8e0d0',
    iridescence: 0.9,
    iridescenceIOR: 1.45,
    transmission: 0.1,
    ior: 1.45,
  },
  amethyst: {
    roughness: 0.05,
    metalness: 0.0,
    color: '#9966cc',
    transmission: 0.5,
    ior: 1.54,
    thickness: 1.0,
    transparent: true,
  },
  topaz: {
    roughness: 0.02,
    metalness: 0.0,
    color: '#ffc87c',
    transmission: 0.7,
    ior: 1.63,
    thickness: 0.8,
    transparent: true,
  },
  turquoise: {
    roughness: 0.6,
    metalness: 0.0,
    color: '#40e0d0',
  },
  lapis_lazuli: {
    roughness: 0.4,
    metalness: 0.0,
    color: '#26619c',
    clearcoat: 0.3,
    clearcoatRoughness: 0.1,
  },

  // ===========================================================================
  // MORE METALS — extended metallic palette
  // ===========================================================================
  titanium: {
    roughness: 0.25,
    metalness: 1.0,
    color: '#878681',
  },
  tungsten: {
    roughness: 0.3,
    metalness: 1.0,
    color: '#696969',
  },
  tin: {
    roughness: 0.35,
    metalness: 1.0,
    color: '#b0b0b0',
    envMapIntensity: 0.8,
  },
  lead: {
    roughness: 0.6,
    metalness: 0.9,
    color: '#595959',
  },
  brass: {
    roughness: 0.35,
    metalness: 1.0,
    color: '#b5a642',
  },
  wrought_iron: {
    roughness: 0.7,
    metalness: 0.85,
    color: '#2c2c2c',
  },
  mercury: {
    roughness: 0.0,
    metalness: 1.0,
    color: '#d4d4d4',
    envMapIntensity: 2.0,
  },

  // ===========================================================================
  // NATURAL / WEATHER — environmental surfaces
  // ===========================================================================
  snow: {
    roughness: 0.8,
    metalness: 0.0,
    color: '#f0f8ff',
    thickness: 0.5,
    attenuationColor: '#c8e0ff',
    attenuationDistance: 2.0,
  },
  fresh_snow: {
    roughness: 0.6,
    metalness: 0.0,
    color: '#ffffff',
    sheen: 0.3,
    sheenRoughness: 0.5,
    sheenColor: '#e8f0ff',
  },
  frost: {
    roughness: 0.3,
    metalness: 0.0,
    color: '#e8f4f8',
    transmission: 0.15,
    ior: 1.31,
    clearcoat: 0.4,
    clearcoatRoughness: 0.1,
  },
  ice: {
    roughness: 0.1,
    metalness: 0.0,
    color: '#d6eaf8',
    transmission: 0.8,
    ior: 1.31,
    transparent: true,
  },
  moss: {
    roughness: 1.0,
    metalness: 0.0,
    color: '#4a7c3f',
    sheen: 0.2,
    sheenRoughness: 1.0,
    sheenColor: '#5a9c4f',
  },
  lichen: {
    roughness: 0.9,
    metalness: 0.0,
    color: '#8fa37a',
  },
  bark: {
    roughness: 0.95,
    metalness: 0.0,
    color: '#5c4033',
  },
  dried_leaves: {
    roughness: 0.9,
    metalness: 0.0,
    color: '#8b6914',
    thickness: 0.1,
    attenuationColor: '#664400',
    attenuationDistance: 0.3,
  },

  // ===========================================================================
  // AGED / WEATHERED — patina, tarnish, wear
  // ===========================================================================
  patina: {
    roughness: 0.6,
    metalness: 0.4,
    color: '#4a9c7e',
  },
  tarnished_silver: {
    roughness: 0.5,
    metalness: 0.7,
    color: '#8a8a7a',
  },
  aged_bronze: {
    roughness: 0.55,
    metalness: 0.6,
    color: '#6b8e5a',
  },
  weathered_wood: {
    roughness: 0.95,
    metalness: 0.0,
    color: '#8a8070',
  },
  cracked_paint: {
    roughness: 0.8,
    metalness: 0.0,
    color: '#c8c0b0',
  },
  oxidized_copper: {
    roughness: 0.65,
    metalness: 0.5,
    color: '#2e8b57',
  },

  // ===========================================================================
  // CONSTRUCTION — architectural materials
  // ===========================================================================
  asphalt: {
    roughness: 0.9,
    metalness: 0.0,
    color: '#3a3a3a',
  },
  cement: {
    roughness: 0.85,
    metalness: 0.0,
    color: '#a0a0a0',
  },
  tile_ceramic: {
    roughness: 0.2,
    metalness: 0.0,
    color: '#e8e0d0',
    clearcoat: 0.6,
    clearcoatRoughness: 0.05,
  },
  tile_porcelain: {
    roughness: 0.1,
    metalness: 0.0,
    color: '#f5f5f5',
    clearcoat: 0.8,
    clearcoatRoughness: 0.02,
  },
  linoleum: {
    roughness: 0.6,
    metalness: 0.0,
    color: '#c0b090',
    clearcoat: 0.2,
    clearcoatRoughness: 0.3,
  },
  drywall: {
    roughness: 1.0,
    metalness: 0.0,
    color: '#f0ece0',
  },
  rebar: {
    roughness: 0.6,
    metalness: 0.9,
    color: '#5a4a3a',
  },
  stucco: {
    roughness: 0.95,
    metalness: 0.0,
    color: '#e8dcc8',
  },
  gravel: {
    roughness: 1.0,
    metalness: 0.02,
    color: '#8a8070',
  },

  // ===========================================================================
  // LEATHER VARIANTS — sheen + clearcoat differentiation
  // ===========================================================================
  suede: {
    roughness: 1.0,
    metalness: 0.0,
    color: '#8b6914',
    sheen: 0.6,
    sheenRoughness: 1.0,
    sheenColor: '#a07828',
  },
  patent_leather: {
    roughness: 0.05,
    metalness: 0.0,
    color: '#1a1a1a',
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
  },
  distressed_leather: {
    roughness: 0.8,
    metalness: 0.0,
    color: '#5a3a1a',
    sheen: 0.15,
    sheenRoughness: 0.8,
    sheenColor: '#4a3010',
  },
  nubuck: {
    roughness: 0.95,
    metalness: 0.0,
    color: '#c8a882',
    sheen: 0.5,
    sheenRoughness: 0.9,
    sheenColor: '#d4b892',
  },

  // ===========================================================================
  // RUBBER VARIANTS
  // ===========================================================================
  tire_rubber: {
    roughness: 0.85,
    metalness: 0.0,
    color: '#1a1a1a',
  },
  silicone: {
    roughness: 0.6,
    metalness: 0.0,
    color: '#e0e0e0',
    thickness: 0.5,
    attenuationColor: '#cccccc',
    attenuationDistance: 1.0,
    transmission: 0.05,
  },
  latex: {
    roughness: 0.3,
    metalness: 0.0,
    color: '#ffefd5',
    clearcoat: 0.5,
    clearcoatRoughness: 0.1,
    thickness: 0.3,
    attenuationColor: '#ffcc88',
    attenuationDistance: 0.5,
  },
  eraser: {
    roughness: 0.95,
    metalness: 0.0,
    color: '#ff6b81',
  },

  // ===========================================================================
  // LIQUIDS — transmission + animated surface hints
  // ===========================================================================
  lava: {
    roughness: 0.8,
    metalness: 0.0,
    color: '#ff4400',
    emissive: '#ff2200',
    emissiveIntensity: 3.0,
  },
  blood: {
    roughness: 0.2,
    metalness: 0.0,
    color: '#8b0000',
    clearcoat: 0.7,
    clearcoatRoughness: 0.05,
    thickness: 1.0,
    attenuationColor: '#440000',
    attenuationDistance: 0.3,
  },
  oil_liquid: {
    roughness: 0.05,
    metalness: 0.0,
    color: '#1a1a0a',
    clearcoat: 0.9,
    clearcoatRoughness: 0.02,
  },
  molten_metal: {
    roughness: 0.15,
    metalness: 0.8,
    color: '#ff8c00',
    emissive: '#ff6600',
    emissiveIntensity: 5.0,
  },
  syrup: {
    roughness: 0.1,
    metalness: 0.0,
    color: '#8b4513',
    transmission: 0.4,
    ior: 1.49,
    thickness: 2.0,
    attenuationColor: '#663300',
    attenuationDistance: 0.5,
  },

  // ===========================================================================
  // BLACKBODY / THERMAL — temperature-driven emission
  // ===========================================================================
  heated_metal_low: {
    roughness: 0.5,
    metalness: 0.9,
    color: '#4a4a4a',
    emissive: '#ff1a00',
    emissiveIntensity: 1.5,
  },
  heated_metal_mid: {
    roughness: 0.4,
    metalness: 0.8,
    color: '#5a5a5a',
    emissive: '#ff6600',
    emissiveIntensity: 3.0,
  },
  heated_metal_hot: {
    roughness: 0.3,
    metalness: 0.7,
    color: '#6a6a6a',
    emissive: '#ffcc00',
    emissiveIntensity: 5.0,
  },
  heated_metal_white: {
    roughness: 0.2,
    metalness: 0.6,
    color: '#8a8a8a',
    emissive: '#ffffff',
    emissiveIntensity: 8.0,
  },
  ember: {
    roughness: 0.9,
    metalness: 0.0,
    color: '#2a0a00',
    emissive: '#ff4400',
    emissiveIntensity: 2.0,
  },
  coal: {
    roughness: 0.85,
    metalness: 0.0,
    color: '#1a1a1a',
    emissive: '#cc2200',
    emissiveIntensity: 0.5,
  },

  // ===========================================================================
  // SPECIAL EFFECTS — sparkle, glow, energy
  // ===========================================================================
  glitter: {
    roughness: 0.2,
    metalness: 0.8,
    color: '#ffd700',
    envMapIntensity: 2.0,
  },
  sequin: {
    roughness: 0.05,
    metalness: 1.0,
    envMapIntensity: 2.5,
    iridescence: 0.3,
  },
  mica: {
    roughness: 0.3,
    metalness: 0.2,
    color: '#c8b888',
    iridescence: 0.4,
    iridescenceIOR: 1.58,
    sheen: 0.2,
    sheenRoughness: 0.3,
    sheenColor: '#d4c498',
  },
  fluorescent_green: {
    roughness: 0.5,
    metalness: 0.0,
    color: '#39ff14',
    emissive: '#39ff14',
    emissiveIntensity: 1.5,
  },
  fluorescent_orange: {
    roughness: 0.5,
    metalness: 0.0,
    color: '#ff6700',
    emissive: '#ff6700',
    emissiveIntensity: 1.5,
  },
  fluorescent_pink: {
    roughness: 0.5,
    metalness: 0.0,
    color: '#ff1493',
    emissive: '#ff1493',
    emissiveIntensity: 1.5,
  },
  glow_in_dark: {
    roughness: 0.7,
    metalness: 0.0,
    color: '#2a3a2a',
    emissive: '#44ff44',
    emissiveIntensity: 0.8,
  },
  plasma: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#4400ff',
    emissive: '#8844ff',
    emissiveIntensity: 4.0,
    transparent: true,
    opacity: 0.7,
  },
  energy_field: {
    roughness: 0.0,
    metalness: 0.0,
    emissive: '#00ccff',
    emissiveIntensity: 3.0,
    transparent: true,
    opacity: 0.4,
    transmission: 0.6,
  },
  force_field: {
    roughness: 0.0,
    metalness: 0.0,
    emissive: '#00ff88',
    emissiveIntensity: 2.0,
    transparent: true,
    opacity: 0.2,
    iridescence: 0.8,
    iridescenceIOR: 1.5,
  },

  // ===========================================================================
  // RETROREFLECTIVE — safety, signage
  // ===========================================================================
  safety_vest: {
    roughness: 0.6,
    metalness: 0.0,
    color: '#ccff00',
    emissive: '#ccff00',
    emissiveIntensity: 0.3,
  },
  road_sign: {
    roughness: 0.4,
    metalness: 0.1,
    color: '#ffffff',
    envMapIntensity: 1.8,
    emissive: '#ffffff',
    emissiveIntensity: 0.2,
  },
  reflective_tape: {
    roughness: 0.2,
    metalness: 0.3,
    color: '#e0e0e0',
    envMapIntensity: 2.5,
  },

  // ===========================================================================
  // MISC — everything else in the real world
  // ===========================================================================
  chalkboard: {
    roughness: 0.9,
    metalness: 0.0,
    color: '#2a3a2a',
  },
  chalk: {
    roughness: 1.0,
    metalness: 0.0,
    color: '#ffffff',
  },
  charcoal: {
    roughness: 0.9,
    metalness: 0.0,
    color: '#1a1a1a',
  },
  cork: {
    roughness: 0.95,
    metalness: 0.0,
    color: '#b88a50',
  },
  felt: {
    roughness: 1.0,
    metalness: 0.0,
    color: '#5a8a5a',
    sheen: 0.4,
    sheenRoughness: 1.0,
    sheenColor: '#6a9a6a',
  },
  sponge: {
    roughness: 1.0,
    metalness: 0.0,
    color: '#e8c840',
  },
  porcelain: {
    roughness: 0.1,
    metalness: 0.0,
    color: '#f8f4f0',
    clearcoat: 0.7,
    clearcoatRoughness: 0.02,
  },
  terracotta: {
    roughness: 0.85,
    metalness: 0.0,
    color: '#cc6644',
  },
  concrete_polished: {
    roughness: 0.3,
    metalness: 0.0,
    color: '#a0a0a0',
    clearcoat: 0.3,
    clearcoatRoughness: 0.15,
  },
  rope: {
    roughness: 1.0,
    metalness: 0.0,
    color: '#c4a35a',
    sheen: 0.2,
    sheenRoughness: 1.0,
    sheenColor: '#b89848',
  },
  wicker: {
    roughness: 0.9,
    metalness: 0.0,
    color: '#a08050',
  },
  parchment: {
    roughness: 0.8,
    metalness: 0.0,
    color: '#f0e6c8',
    thickness: 0.1,
    attenuationColor: '#d4c0a0',
    attenuationDistance: 0.2,
  },

  // ===========================================================================
  // ANIMATED MATERIALS — time-driven surface effects (wired to scene.time)
  // These set metadata flags that the runtime uses to drive animated shaders.
  // ===========================================================================
  flowing_water: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#006994',
    transmission: 0.85,
    ior: 1.33,
    transparent: true,
    _animated: { pattern: 'flow', speed: 0.8, amplitude: 0.3 },
  },
  rippling_water: {
    roughness: 0.05,
    metalness: 0.0,
    color: '#005577',
    transmission: 0.8,
    ior: 1.33,
    transparent: true,
    _animated: { pattern: 'ripple', speed: 1.0, amplitude: 0.4 },
  },
  flickering_fire: {
    roughness: 0.8,
    metalness: 0.0,
    color: '#ff4400',
    emissive: '#ff2200',
    emissiveIntensity: 3.0,
    _animated: { pattern: 'flicker', speed: 3.0, amplitude: 0.6 },
  },
  pulsing_glow: {
    roughness: 0.5,
    metalness: 0.0,
    emissive: '#00ff88',
    emissiveIntensity: 2.0,
    _animated: { pattern: 'pulse', speed: 1.5, amplitude: 0.5 },
  },
  breathing_light: {
    roughness: 0.3,
    metalness: 0.0,
    emissive: '#4488ff',
    emissiveIntensity: 1.5,
    _animated: { pattern: 'breathe', speed: 0.5, amplitude: 0.8 },
  },
  scrolling_lava: {
    roughness: 0.8,
    metalness: 0.0,
    color: '#ff4400',
    emissive: '#ff2200',
    emissiveIntensity: 4.0,
    _animated: { pattern: 'scroll', speed: 0.3, amplitude: 1.0 },
  },
  waving_grass: {
    roughness: 0.9,
    metalness: 0.0,
    color: '#228b22',
    sheen: 0.2,
    sheenRoughness: 0.8,
    sheenColor: '#44cc22',
    _animated: { pattern: 'wave', speed: 0.8, amplitude: 0.2 },
  },
  flickering_neon: {
    roughness: 0.0,
    metalness: 0.0,
    emissive: '#ff00ff',
    emissiveIntensity: 3.5,
    transparent: true,
    opacity: 0.9,
    _animated: { pattern: 'flicker', speed: 5.0, amplitude: 0.4 },
  },
  pulsing_crystal: {
    roughness: 0.0,
    metalness: 0.1,
    transmission: 0.8,
    ior: 2.0,
    iridescence: 0.8,
    iridescenceIOR: 1.3,
    emissive: '#8844ff',
    emissiveIntensity: 1.0,
    _animated: { pattern: 'pulse', speed: 0.8, amplitude: 0.6 },
  },
  animated_hologram: {
    roughness: 0.0,
    metalness: 0.3,
    transparent: true,
    opacity: 0.5,
    emissive: '#00ccff',
    emissiveIntensity: 1.5,
    _animated: { pattern: 'scroll', speed: 1.5, amplitude: 0.3 },
  },
  boiling_surface: {
    roughness: 0.7,
    metalness: 0.0,
    color: '#cc4400',
    emissive: '#ff6600',
    emissiveIntensity: 2.0,
    _animated: { pattern: 'noise', speed: 2.0, amplitude: 0.5 },
  },
  shimmer_heat: {
    roughness: 0.0,
    metalness: 0.0,
    transparent: true,
    opacity: 0.15,
    _animated: { pattern: 'wave', speed: 2.0, amplitude: 0.1 },
  },

  // ===========================================================================
  // VOLUMETRIC MATERIALS — metadata for ray-marched volume rendering
  // These presets describe volumetric phenomena; the runtime renders them via
  // a ray marching pass on a bounding box/sphere geometry.
  // ===========================================================================
  fog: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#c0c0c0',
    transparent: true,
    opacity: 0.3,
    _volumetric: { type: 'fog', density: 0.3, scattering: 0.8, absorption: 0.05 },
  },
  dense_fog: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#a0a0a0',
    transparent: true,
    opacity: 0.5,
    _volumetric: { type: 'fog', density: 0.7, scattering: 0.9, absorption: 0.1 },
  },
  smoke: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#404040',
    transparent: true,
    opacity: 0.4,
    _volumetric: {
      type: 'smoke',
      density: 0.5,
      scattering: 0.3,
      absorption: 0.4,
      riseSpeed: 0.5,
      turbulence: 0.6,
    },
  },
  campfire_smoke: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#505050',
    transparent: true,
    opacity: 0.35,
    _volumetric: {
      type: 'smoke',
      density: 0.4,
      scattering: 0.25,
      absorption: 0.5,
      riseSpeed: 0.8,
      turbulence: 0.4,
    },
  },
  fire_volume: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#ff4400',
    emissive: '#ff2200',
    emissiveIntensity: 4.0,
    transparent: true,
    opacity: 0.7,
    _volumetric: {
      type: 'fire',
      density: 0.6,
      scattering: 0.1,
      absorption: 0.2,
      riseSpeed: 1.2,
      turbulence: 0.7,
      temperature: 2500,
    },
  },
  candle_flame: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#ffaa33',
    emissive: '#ff8800',
    emissiveIntensity: 3.0,
    transparent: true,
    opacity: 0.6,
    _volumetric: {
      type: 'fire',
      density: 0.4,
      scattering: 0.05,
      absorption: 0.1,
      riseSpeed: 0.3,
      turbulence: 0.2,
      temperature: 1800,
    },
  },
  clouds: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#ffffff',
    transparent: true,
    opacity: 0.6,
    _volumetric: {
      type: 'clouds',
      density: 0.4,
      scattering: 0.95,
      absorption: 0.02,
      noiseScale: 2.0,
      octaves: 6,
    },
  },
  storm_clouds: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#3a3a4a',
    transparent: true,
    opacity: 0.8,
    _volumetric: {
      type: 'clouds',
      density: 0.7,
      scattering: 0.6,
      absorption: 0.15,
      noiseScale: 1.5,
      octaves: 6,
    },
  },
  dust_motes: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#c8b888',
    transparent: true,
    opacity: 0.15,
    _volumetric: { type: 'dust', density: 0.1, scattering: 0.5, absorption: 0.02 },
  },
  mist: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#e0e8f0',
    transparent: true,
    opacity: 0.25,
    _volumetric: {
      type: 'mist',
      density: 0.2,
      scattering: 0.85,
      absorption: 0.03,
      heightFalloff: 1.5,
    },
  },
  steam: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#e8e8e8',
    transparent: true,
    opacity: 0.3,
    _volumetric: {
      type: 'steam',
      density: 0.35,
      scattering: 0.7,
      absorption: 0.05,
      riseSpeed: 1.0,
      turbulence: 0.3,
    },
  },
  aurora_borealis: {
    roughness: 0.0,
    metalness: 0.0,
    emissive: '#00ff88',
    emissiveIntensity: 2.0,
    transparent: true,
    opacity: 0.3,
    _volumetric: {
      type: 'aurora',
      density: 0.15,
      scattering: 0.1,
      absorption: 0.01,
      emissionIntensity: 2.0,
    },
  },
  nebula: {
    roughness: 0.0,
    metalness: 0.0,
    emissive: '#ff44aa',
    emissiveIntensity: 1.5,
    transparent: true,
    opacity: 0.4,
    _volumetric: {
      type: 'nebula',
      density: 0.25,
      scattering: 0.3,
      absorption: 0.05,
      emissionIntensity: 1.5,
      noiseScale: 1.0,
    },
  },
  underwater_caustics: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#003366',
    transparent: true,
    opacity: 0.2,
    _volumetric: { type: 'underwater', density: 0.15, scattering: 0.6, absorption: 0.1 },
  },
  god_rays: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#ffffd0',
    transparent: true,
    opacity: 0.15,
    emissive: '#ffff88',
    emissiveIntensity: 0.5,
    _volumetric: { type: 'god_rays', density: 0.1, scattering: 0.9, absorption: 0.01 },
  },
  neon_gas: {
    roughness: 0.0,
    metalness: 0.0,
    emissive: '#ff4400',
    emissiveIntensity: 3.0,
    transparent: true,
    opacity: 0.5,
    _volumetric: {
      type: 'neon_gas',
      density: 0.3,
      scattering: 0.2,
      absorption: 0.05,
      emissionIntensity: 3.0,
    },
  },
  explosion: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#ff6600',
    emissive: '#ff4400',
    emissiveIntensity: 6.0,
    transparent: true,
    opacity: 0.8,
    _volumetric: {
      type: 'fire',
      density: 0.8,
      scattering: 0.15,
      absorption: 0.3,
      riseSpeed: 2.0,
      turbulence: 1.0,
      temperature: 4000,
    },
  },
  toxic_gas: {
    roughness: 0.0,
    metalness: 0.0,
    color: '#44cc00',
    emissive: '#33aa00',
    emissiveIntensity: 1.0,
    transparent: true,
    opacity: 0.35,
    _volumetric: {
      type: 'smoke',
      density: 0.3,
      scattering: 0.4,
      absorption: 0.2,
      riseSpeed: 0.2,
      turbulence: 0.3,
    },
  },
  magical_mist: {
    roughness: 0.0,
    metalness: 0.0,
    emissive: '#8844ff',
    emissiveIntensity: 1.5,
    transparent: true,
    opacity: 0.3,
    iridescence: 0.6,
    iridescenceIOR: 1.5,
    _volumetric: {
      type: 'mist',
      density: 0.2,
      scattering: 0.5,
      absorption: 0.03,
      emissionIntensity: 1.5,
    },
  },
  // --- Architectural & Natural Stone ---
  brick: { roughness: 0.9, metalness: 0.0, color: '#a6523c' },
  concrete: { roughness: 0.88, metalness: 0.0, color: '#8a8a8a' },
  granite: { roughness: 0.6, metalness: 0.0, color: '#666670' },
  sandstone: { roughness: 0.85, metalness: 0.0, color: '#cca66e' },
  slate: { roughness: 0.7, metalness: 0.0, color: '#3f4450' },
  adobe: { roughness: 0.95, metalness: 0.0, color: '#bf9160' },
  plaster: { roughness: 0.82, metalness: 0.0, color: '#ebe8de' },
  // --- Plant & Cellulose ---
  bamboo: { roughness: 0.65, metalness: 0.0, color: '#b3a84d' },
  paper: { roughness: 0.9, metalness: 0.0, color: '#f3f0e5' },
  cardboard: { roughness: 0.88, metalness: 0.0, color: '#b88c58' },
  // --- Organic & Animal ---
  bone: { roughness: 0.7, metalness: 0.0, color: '#e0d4b5' },
  ivory: { roughness: 0.35, metalness: 0.0, color: '#f0e8c5', envMapIntensity: 0.4 },
  coral: { roughness: 0.75, metalness: 0.0, color: '#f2614d' },
  shell: {
    roughness: 0.25,
    metalness: 0.05,
    color: '#f5ede0',
    iridescence: 0.8,
    iridescenceIOR: 1.5,
    envMapIntensity: 0.6,
  },
  thatch: { roughness: 0.95, metalness: 0.0, color: '#c0a84a' },
  // --- Synthetic & Engineered ---
  resin: {
    roughness: 0.08,
    metalness: 0.0,
    transmission: 0.75,
    ior: 1.5,
    color: '#e8c46a',
    transparent: true,
    opacity: 0.88,
  },
  foam: { roughness: 0.95, metalness: 0.0, color: '#f0f0f0' },
  composite: { roughness: 0.5, metalness: 0.25, color: '#333338' },
  carbon_fiber: {
    roughness: 0.28,
    metalness: 0.6,
    color: '#111114',
    envMapIntensity: 1.2,
    clearcoat: 0.6,
    clearcoatRoughness: 0.1,
  },
  kevlar: { roughness: 0.82, metalness: 0.0, color: '#ccbb66' },
  fiberglass: {
    roughness: 0.3,
    metalness: 0.05,
    transmission: 0.4,
    ior: 1.45,
    color: '#e0ede0',
    transparent: true,
    opacity: 0.92,
  },
  stained_glass: {
    roughness: 0.05,
    metalness: 0.0,
    transmission: 0.85,
    ior: 1.52,
    color: '#cc44ff',
    transparent: true,
    opacity: 0.75,
    thickness: 0.3,
  },
};

export const ENVIRONMENT_PRESETS: Record<string, Record<string, unknown>> = {
  forest_sunset: {
    background: true,
    envPreset: 'sunset',
    fog: { color: '#ff9966', near: 10, far: 100 },
    ground: { color: '#2d5a27' },
    lighting: {
      ambient: { color: '#ffa366', intensity: 0.3 },
      directional: { color: '#ff7700', intensity: 1.5, position: [10, 20, 5], shadows: true },
    },
  },
  cyberpunk_city: {
    background: true,
    envPreset: 'night',
    fog: { color: '#0a0020', near: 5, far: 60 },
    ground: { color: '#1a1a2e' },
    lighting: {
      ambient: { color: '#220044', intensity: 0.2 },
      directional: { color: '#ff00ff', intensity: 0.5, position: [5, 15, 5], shadows: true },
      points: [
        { color: '#00ffff', intensity: 3, position: [-5, 3, -5], distance: 15 },
        { color: '#ff00ff', intensity: 3, position: [5, 3, 5], distance: 15 },
      ],
    },
    postprocessing: { bloom: { intensity: 1.5, luminanceThreshold: 0.1 } },
  },
  space_void: {
    background: true,
    envPreset: 'night',
    lighting: {
      ambient: { color: '#111133', intensity: 0.1 },
      directional: { color: '#ffffff', intensity: 0.5, position: [0, 10, 0], shadows: false },
    },
  },
  studio: {
    background: true,
    envPreset: 'studio',
    ground: { color: '#cccccc' },
    lighting: {
      ambient: { color: '#ffffff', intensity: 0.4 },
      directional: { color: '#ffffff', intensity: 1.0, position: [5, 10, 5], shadows: true },
    },
  },
  underwater: {
    background: true,
    envPreset: 'dawn',
    fog: { color: '#003366', near: 2, far: 40 },
    ground: { color: '#1a3a4a' },
    lighting: {
      ambient: { color: '#004488', intensity: 0.3 },
      directional: { color: '#66aacc', intensity: 0.8, position: [0, 20, 0], shadows: true },
    },
  },
  desert: {
    background: true,
    envPreset: 'sunset',
    fog: { color: '#d4a574', near: 20, far: 150 },
    ground: { color: '#c4a35a' },
    lighting: {
      ambient: { color: '#f5deb3', intensity: 0.4 },
      directional: { color: '#ffffcc', intensity: 2.0, position: [15, 30, 10], shadows: true },
    },
  },
};

// Geometry types that compile to <mesh> with a specific child geometry
const MESH_TYPES = new Set([
  'orb',
  'sphere',
  'cube',
  'box',
  'cylinder',
  'pyramid',
  'cone',
  'plane',
  'torus',
  'ring',
  'capsule',
  'object',
  'avatar',
  'dna',
  'gaussian_splat',
  'splat',
  'nerf',
  'volumetric_video',
  // Procedural geometry types (hull/spline/membrane/blob/metaball)
  'hull',
  'spline',
  'membrane',
  'blob',
  'metaball',
]);

/**
 * UI Component presets for @react-three/uikit mapping.
 * Maps HoloScript UI components to uikit component configurations.
 */
export const UI_COMPONENT_PRESETS: Record<
  string,
  { component: string; defaultProps: Record<string, unknown> }
> = {
  UIPanel: {
    component: 'Container', // @react-three/uikit Container
    defaultProps: {
      flexDirection: 'column',
      padding: 16,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      borderRadius: 8,
    },
  },
  UIText: {
    component: 'Text', // @react-three/uikit Text
    defaultProps: {
      fontSize: 16,
      color: 'white',
    },
  },
  UIButton: {
    component: 'Button', // Custom button using Container with hover
    defaultProps: {
      padding: 12,
      paddingX: 24,
      backgroundColor: '#4a90d9',
      borderRadius: 4,
      cursor: 'pointer',
    },
  },
  UISlider: {
    component: 'Slider', // Custom slider implementation
    defaultProps: {
      width: 200,
      height: 20,
      trackColor: '#333',
      fillColor: '#4a90d9',
      thumbSize: 16,
    },
  },
  UIInput: {
    component: 'Input', // @react-three/uikit Input
    defaultProps: {
      width: 200,
      padding: 8,
      backgroundColor: '#222',
      borderColor: '#444',
      borderWidth: 1,
      borderRadius: 4,
      color: 'white',
    },
  },
  UIImage: {
    component: 'Image', // @react-three/uikit Image
    defaultProps: {
      objectFit: 'contain',
    },
  },
  UIChart: {
    component: 'Chart', // Custom chart component
    defaultProps: {
      width: 300,
      height: 200,
      backgroundColor: '#1a1a2e',
    },
  },
  UIGauge: {
    component: 'Gauge', // Custom gauge component
    defaultProps: {
      size: 100,
      strokeWidth: 8,
      trackColor: '#333',
      fillColor: '#4a90d9',
    },
  },
};

/**
 * R3FCompiler
 *
 * Translates HoloScript AST into R3F node trees for React Three Fiber rendering.
 * Handles both HSPlusAST (from HoloScriptPlusParser) and HoloComposition AST
 * (from HoloCompositionParser/.holo files).
 */
/** Quality tier controls particle counts, shader complexity, and LOD. */
export type QualityTier = 'low' | 'med' | 'high' | 'ultra';

export interface R3FCompilerOptions {
  /** Quality tier (default: 'high') */
  qualityTier?: QualityTier;
  /** Inject default ambient + directional light (default: true) */
  defaultLighting?: boolean;
}

/** Scale factors per quality tier for runtime tuning. */
export const QUALITY_TIER_SCALES: Record<QualityTier, {
  particleScale: number;
  lodLevel: 'draft' | 'mesh' | 'final';
  maxLights: number;
  shadowMapSize: number;
  shaderComplexity: 'basic' | 'standard' | 'physical';
}> = {
  low:   { particleScale: 0.25, lodLevel: 'draft', maxLights: 2,  shadowMapSize: 512,  shaderComplexity: 'basic' },
  med:   { particleScale: 0.6,  lodLevel: 'mesh',  maxLights: 4,  shadowMapSize: 1024, shaderComplexity: 'standard' },
  high:  { particleScale: 1.0,  lodLevel: 'final', maxLights: 8,  shadowMapSize: 2048, shaderComplexity: 'physical' },
  ultra: { particleScale: 1.5,  lodLevel: 'final', maxLights: 16, shadowMapSize: 4096, shaderComplexity: 'physical' },
};

export class R3FCompiler {
  // ─── Options & Quality Tier ────────────────────────────────────────────

  public readonly qualityTier: QualityTier;
  public readonly tierScales: typeof QUALITY_TIER_SCALES[QualityTier];
  private readonly _defaultLighting: boolean;

  constructor(options: R3FCompilerOptions = {}) {
    this.qualityTier = options.qualityTier ?? 'high';
    this.tierScales = QUALITY_TIER_SCALES[this.qualityTier];
    this._defaultLighting = options.defaultLighting ?? true;
  }

  // ─── RBAC Enforcement ─────────────────────────────────────────────────

  private readonly compilerName = 'R3FCompiler';
  private rbac = getRBAC();

  /**
   * Validate agent permissions before compilation.
   * Skips validation when no token is provided (backwards compatibility).
   *
   * Checks:
   * 1. AST read access (can the agent read AST?)
   * 2. Code generation access (can the agent generate code?)
   * 3. Output path scope (if outputPath provided)
   *
   * @param agentToken - Agent JWT token (optional for backwards compat)
   * @param outputPath - Optional output file path for scope validation
   * @throws UnauthorizedCompilerAccessError if token is provided but invalid/unauthorized
   */
  private validateCompilerAccess(agentToken?: string, outputPath?: string): void {
    if (!agentToken) return; // Skip validation when no token provided

    // Validate AST read access
    const astDecision = this.rbac.checkAccess({
      token: agentToken,
      resourceType: ResourceType.AST,
      operation: 'read',
      expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    });
    if (!astDecision.allowed) {
      throw new UnauthorizedCompilerAccessError(astDecision, 'AST access', this.compilerName);
    }

    // Validate code generation access
    const codeDecision = this.rbac.checkAccess({
      token: agentToken,
      resourceType: ResourceType.CODE,
      operation: 'write',
      expectedWorkflowStep: WorkflowStep.GENERATE_ASSEMBLY,
    });
    if (!codeDecision.allowed) {
      throw new UnauthorizedCompilerAccessError(codeDecision, 'code generation', this.compilerName);
    }

    // Validate output path scope (if provided)
    if (outputPath) {
      const outputDecision = this.rbac.checkAccess({
        token: agentToken,
        resourceType: ResourceType.OUTPUT,
        operation: 'write',
        resourcePath: outputPath,
        expectedWorkflowStep: WorkflowStep.SERIALIZE,
      });
      if (!outputDecision.allowed) {
        throw new UnauthorizedCompilerAccessError(
          outputDecision,
          `output write to '${outputPath}'`,
          this.compilerName
        );
      }
    }
  }

  // ─── Spread Expansion Utility ─────────────────────────────────────────

  /**
   * Expands spread expressions in a properties object.
   * Spreads are stored with keys like `__spread_0`, `__spread_1` and have
   * the structure: { type: 'spread', argument: <value> }
   *
   * @param props - The properties object potentially containing spreads
   * @param context - Optional context for resolving references (templates, state)
   * @returns A new object with spreads expanded and merged
   */
  private expandSpreads(
    props: Record<string, unknown>,
    context?: { templates?: Map<string, Record<string, unknown>>; state?: Record<string, unknown> }
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const spreadKeys: string[] = [];

    // First pass: collect spread keys and non-spread properties
    for (const [key, value] of Object.entries(props)) {
      if (key.startsWith('__spread_')) {
        spreadKeys.push(key);
      } else if (value && typeof value === 'object' && (value as Record<string, unknown>).type === 'spread') {
        // Handle spread stored as a regular property value
        spreadKeys.push(key);
      } else {
        // Recursively expand spreads in nested objects
        if (
          value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          !('__ref' in value) &&
          !('__expr' in value)
        ) {
          result[key] = this.expandSpreads(value as Record<string, unknown>, context);
        } else if (Array.isArray(value)) {
          // Handle arrays - expand spreads within array items
          result[key] = this.expandArraySpreads(value, context);
        } else {
          result[key] = value;
        }
      }
    }

    // Second pass: expand and merge spreads in order
    for (const spreadKey of spreadKeys) {
      const spreadValue = props[spreadKey];
      if (spreadValue && typeof spreadValue === 'object' && (spreadValue as Record<string, unknown>).type === 'spread') {
        const resolved = this.resolveSpreadArgument((spreadValue as Record<string, unknown>).argument, context);
        if (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
          // Merge spread properties - spread comes first, explicit props override
          Object.assign(result, this.expandSpreads(resolved as Record<string, unknown>, context));
        }
      }
    }

    // Re-apply non-spread properties to ensure they override spread values
    for (const [key, value] of Object.entries(props)) {
      if (
        !key.startsWith('__spread_') &&
        !(value && typeof value === 'object' && (value as Record<string, unknown>).type === 'spread')
      ) {
        if (
          value &&
          typeof value === 'object' &&
          !Array.isArray(value) &&
          !('__ref' in value) &&
          !('__expr' in value)
        ) {
          result[key] = this.expandSpreads(value as Record<string, unknown>, context);
        } else if (Array.isArray(value)) {
          result[key] = this.expandArraySpreads(value, context);
        } else {
          result[key] = value;
        }
      }
    }

    return result;
  }

  /**
   * Expands spread expressions within an array.
   * Spread elements have { type: 'spread', argument: <value> }
   */
  private expandArraySpreads(
    arr: unknown[],
    context?: { templates?: Map<string, Record<string, unknown>>; state?: Record<string, unknown> }
  ): unknown[] {
    const result: unknown[] = [];

    for (const item of arr) {
      if (item && typeof item === 'object' && (item as Record<string, unknown>).type === 'spread') {
        const resolved = this.resolveSpreadArgument((item as Record<string, unknown>).argument, context);
        if (Array.isArray(resolved)) {
          result.push(...resolved);
        } else if (resolved !== undefined && resolved !== null) {
          // If spread target isn't an array, just include it as-is
          result.push(resolved);
        }
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        // Recursively expand spreads in nested objects
        result.push(this.expandSpreads(item as Record<string, unknown>, context));
      } else {
        result.push(item);
      }
    }

    return result;
  }

  /**
   * Resolves a spread argument to its value.
   * Handles: direct values, __ref references, template references
   */
  private resolveSpreadArgument(
    argument: unknown,
    context?: { templates?: Map<string, Record<string, unknown>>; state?: Record<string, unknown> }
  ): unknown {
    if (argument === null || argument === undefined) {
      return undefined;
    }

    // Direct object/array value
    if (typeof argument === 'object' && !('__ref' in argument)) {
      return argument;
    }

    // Reference: { __ref: 'path.to.value' }
    if (typeof argument === 'object' && '__ref' in argument) {
      const ref = argument.__ref as string;

      // Try to resolve from templates
      if (context?.templates) {
        const template = context.templates.get(ref);
        if (template) {
          return template.properties || template;
        }
      }

      // Try to resolve from state
      if (context?.state && ref in context.state) {
        return context.state[ref];
      }

      // Try dotted path resolution in state
      if (context?.state && ref.includes('.')) {
        const parts = ref.split('.');
        let value: any = context.state;
        for (const part of parts) {
          if (value && typeof value === 'object' && part in value) {
            value = value[part];
          } else {
            value = undefined;
            break;
          }
        }
        if (value !== undefined) {
          return value;
        }
      }

      // Return the reference as-is for runtime resolution
      return argument;
    }

    // String reference (template name)
    if (typeof argument === 'string') {
      if (context?.templates) {
        const template = context.templates.get(argument);
        if (template) {
          return template.properties || template;
        }
      }
      // Return as reference for runtime resolution
      return { __ref: argument };
    }

    return argument;
  }

  // ─── HSPlusAST Compilation ────────────────────────────────────────────

  public compile(ast: HSPlusAST, agentToken?: string, outputPath?: string): R3FNode {
    this.validateCompilerAccess(agentToken, outputPath);

    const root = this.compileNode(ast.root as ASTNode);

    if (this.hasPostProcessing(root)) {
      root.children?.unshift({
        type: 'EffectComposer',
        props: {},
        children: this.extractPostProcessingNodes(root),
      });
    }

    this.injectDefaultLighting(root);

    // v4.2: Compile domain blocks (materials, physics, particles, post-fx, audio, weather)
    const domainBlocks = ((ast as unknown as Record<string, unknown>).domainBlocks ?? []) as Array<Record<string, unknown>>;
    if (domainBlocks.length > 0) {
      const compiled = compileDomainBlocks(domainBlocks as unknown as import('../parser/HoloCompositionTypes').HoloDomainBlock[], {
        material: (block) => {
          const mat = compileMaterialBlock(block);
          return {
            type: 'DomainBlockOutput',
            props: { __raw: materialToR3F(mat, this.tierScales), __domain: 'material', __name: mat.name },
            children: [],
          } as R3FNode;
        },
        physics: (block) => {
          const phys = compilePhysicsBlock(block);
          return {
            type: 'DomainBlockOutput',
            props: {
              __raw: physicsToR3F(phys),
              __domain: 'physics',
              __name: phys.name || phys.keyword,
            },
            children: [],
          } as R3FNode;
        },
        vfx: (block) => {
          const ps = compileParticleBlock(block);
          return {
            type: 'DomainBlockOutput',
            props: { __raw: particlesToR3F(ps, this.tierScales), __domain: 'vfx', __name: ps.name },
            children: [],
          } as R3FNode;
        },
        postfx: (block) => {
          const pp = compilePostProcessingBlock(block);
          return {
            type: 'DomainBlockOutput',
            props: {
              __raw: postProcessingToR3F(pp),
              __domain: 'postfx',
              __name: pp.name || 'PostProcessing',
            },
            children: [],
          } as R3FNode;
        },
        audio: (block) => {
          const audio = compileAudioSourceBlock(block);
          return {
            type: 'DomainBlockOutput',
            props: { __raw: audioSourceToR3F(audio), __domain: 'audio', __name: audio.name },
            children: [],
          } as R3FNode;
        },
        weather: (block) => {
          const weather = compileWeatherBlock(block);
          return {
            type: 'DomainBlockOutput',
            props: {
              __raw: weatherToR3F(weather),
              __domain: 'weather',
              __name: weather.name || 'Weather',
            },
            children: [],
          } as R3FNode;
        },
      });
      if (!root.children) root.children = [];
      for (const c of compiled) {
        if (typeof c === 'object') root.children.push(c as R3FNode);
      }
    }

    return root;
  }

  private createNode(type: string, props: Record<string, unknown> = {}, id?: string): R3FNode {
    const node = r3fNodePool.acquire();
    node.type = type;
    node.id = id;
    node.props = props;
    node.children = [];
    node.traits = new Map();
    node.directives = [];
    return node;
  }

  public compileNode(node: ASTNode): R3FNode {
    // Dispatch to dedicated methods for rich node types
    if (node.type === 'system') {
      return this.compileSystemNode(node as unknown as Record<string, unknown>);
    }
    if (node.type === 'component') {
      return this.compileComponentNode(node as unknown as Record<string, unknown>);
    }

    const rawProps = (node as unknown as Record<string, unknown>).properties as Record<string, unknown> || {};
    const type = this.mapType(node.type, rawProps);

    const r3fNode = r3fNodePool.acquire();
    r3fNode.type = type;
    r3fNode.id = (node as unknown as Record<string, unknown>).id as string || (node as unknown as Record<string, unknown>).name as string;
    r3fNode.props = this.compileProperties(node, rawProps);
    r3fNode.children = [];
    r3fNode.traits = new Map();
    r3fNode.directives = node.directives || [];

    if (node.directives) {
      for (const directive of node.directives) {
        if (directive.type === 'trait') {
          r3fNode.traits?.set(directive.name as VRTraitName, directive.config as Record<string, unknown>);
        }
      }
    }

    const enhanced = node as unknown as Record<string, unknown>;
    if (enhanced.graphics) {
      this.applyGraphicsConfig(r3fNode, enhanced.graphics as Record<string, unknown>);
    }

    if (enhanced.children && Array.isArray(enhanced.children)) {
      r3fNode.children = (enhanced.children as ASTNode[]).map((child: ASTNode) => this.compileNode(child));
    }

    return r3fNode;
  }

  // ─── HoloComposition Compilation (.holo files) ────────────────────────

  public compileComposition(composition: Record<string, unknown>, agentToken?: string, outputPath?: string): R3FNode {
    this.validateCompilerAccess(agentToken, outputPath);

    const root = r3fNodePool.acquire();
    root.type = 'group';
    root.id = composition.name as string | undefined;
    root.props = {};
    root.children = [];
    root.traits = new Map();
    root.directives = [];

    // Build template map for trait merging
    const templateMap = new Map<string, Record<string, unknown>>();
    if (Array.isArray(composition.templates)) {
      for (const tmpl of composition.templates as Record<string, unknown>[]) {
        templateMap.set(tmpl.name as string, tmpl);
      }
    }

    // Process children array from parser output (CompositionNode).
    // The parser puts all child declarations (systems, components,
    // templates, objects, etc.) into a flat children array.
    // We extract templates into the templateMap first, then compile
    // all other children via compileChildNode dispatch.
    if (composition.children && Array.isArray(composition.children)) {
      // First pass: collect templates into templateMap
      for (const child of composition.children) {
        if (child.type === 'template' && child.name) {
          templateMap.set(child.name, child);
        }
      }
      // Second pass: compile all children
      for (const child of composition.children) {
        root.children!.push(this.compileChildNode(child, templateMap));
      }
    }

    if (composition.environment) {
      root.children!.push(...this.compileEnvironmentBlock(composition.environment));
    }

    // Compile first-class light blocks
    if (Array.isArray(composition.lights)) {
      for (const light of composition.lights as Record<string, unknown>[]) {
        root.children!.push(this.compileLightBlock(light));
      }
    }

    if (Array.isArray(composition.objects)) {
      for (const obj of composition.objects as Record<string, unknown>[]) {
        root.children!.push(this.compileObjectDecl(obj, templateMap));
      }
    }

    if (Array.isArray(composition.spatialGroups)) {
      for (const group of composition.spatialGroups as Record<string, unknown>[]) {
        root.children!.push(this.compileSpatialGroup(group, templateMap));
      }
    }

    // Compile timelines
    if (Array.isArray(composition.timelines)) {
      for (const timeline of composition.timelines as Record<string, unknown>[]) {
        root.children!.push(this.compileTimelineBlock(timeline));
      }
    }

    // Compile audio blocks
    if (Array.isArray(composition.audio)) {
      for (const audio of composition.audio as Record<string, unknown>[]) {
        root.children!.push(this.compileAudioBlock(audio));
      }
    }

    // Compile zones
    if (Array.isArray(composition.zones)) {
      for (const zone of composition.zones as Record<string, unknown>[]) {
        root.children!.push(this.compileZoneBlock(zone));
      }
    }

    // Compile UI overlay
    if (composition.ui) {
      root.children!.push(this.compileUIBlock(composition.ui));
    }

    // Compile transitions
    if (Array.isArray(composition.transitions)) {
      for (const transition of composition.transitions as Record<string, unknown>[]) {
        root.children!.push(this.compileTransitionBlock(transition));
      }
    }

    // Compile conditional blocks
    if (Array.isArray(composition.conditionals)) {
      for (const cond of composition.conditionals as Record<string, unknown>[]) {
        root.children!.push(this.compileConditionalBlock(cond, templateMap));
      }
    }

    // Compile for-each blocks
    if (Array.isArray(composition.iterators)) {
      for (const iter of composition.iterators as Record<string, unknown>[]) {
        root.children!.push(this.compileForEachBlock(iter, templateMap));
      }
    }

    // Compile first-class camera block
    if (composition.camera) {
      root.children!.push(this.compileCameraBlock(composition.camera as Record<string, unknown>));
    }

    // Compile first-class effects block OR auto-detect post-processing
    if (composition.effects) {
      root.children!.unshift(this.compileEffectsBlock(composition.effects as Record<string, unknown>));
    } else if (this.hasPostProcessing(root)) {
      root.children!.unshift({
        type: 'EffectComposer',
        props: {},
        children: this.extractPostProcessingNodes(root),
      });
    }

    this.injectDefaultLighting(root);
    return root;
  }

  private compileLightBlock(light: Record<string, unknown>): R3FNode {
    const lightMapping: Record<string, string> = {
      directional: 'directionalLight',
      point: 'pointLight',
      spot: 'spotLight',
      hemisphere: 'hemisphereLight',
      ambient: 'ambientLight',
      area: 'rectAreaLight',
    };
    const type = lightMapping[light.lightType] || 'directionalLight';
    const props: Record<string, unknown> = {};

    if (Array.isArray(light.properties)) {
      for (const prop of light.properties as Record<string, unknown>[]) {
        const key = prop.key as string;
        const value = prop.value;
        if (key === 'cast_shadow' || key === 'castShadow') {
          props.castShadow = value;
        } else if (key === 'ground_color' || key === 'groundColor') {
          props.groundColor = value;
        } else if (key === 'shadow_map_size') {
          props['shadow-mapSize'] = Array.isArray(value) ? value : [value, value];
        } else {
          props[key] = value;
        }
      }
    }

    // Default castShadow for directional/spot
    if (
      (light.lightType === 'directional' || light.lightType === 'spot') &&
      props.castShadow === undefined
    ) {
      props.castShadow = true;
    }

    const r3fNode = r3fNodePool.acquire();
    r3fNode.type = type;
    r3fNode.id = light.name as string | undefined;
    r3fNode.props = props;
    r3fNode.children = [];
    r3fNode.traits = new Map();
    r3fNode.directives = [];
    return r3fNode;
  }

  private compileEffectsBlock(effects: Record<string, unknown>): R3FNode {
    const children: R3FNode[] = [];
    if (Array.isArray(effects.effects)) {
      for (const effect of effects.effects as Record<string, unknown>[]) {
        const effectMapping: Record<string, string> = {
          bloom: 'Bloom',
          ssao: 'SSAO',
          vignette: 'Vignette',
          dof: 'DepthOfField',
          chromatic_aberration: 'ChromaticAberration',
          tone_mapping: 'ToneMapping',
          noise: 'Noise',
        };
        const effectType = effect.effectType as string;
        const type = effectMapping[effectType] || effectType;
        children.push(this.createNode(type, { ...(effect.properties as Record<string, unknown> || {}) }));
      }
    }
    const composer = this.createNode('EffectComposer', {});
    composer.children = children;
    return composer;
  }

  private compileCameraBlock(camera: Record<string, unknown>): R3FNode {
    const props: Record<string, unknown> = {};
    if (Array.isArray(camera.properties)) {
      for (const prop of camera.properties as Record<string, unknown>[]) {
        if (prop.key === 'field_of_view' || prop.key === 'fov') {
          props.fov = prop.value;
        } else if (prop.key === 'look_at' || prop.key === 'lookAt') {
          props.lookAt = prop.value;
        } else {
          props[prop.key as string] = prop.value;
        }
      }
    }
    props.cameraType = camera.cameraType;
    return this.createNode('Camera', props, '__camera');
  }

  private compileEnvironmentBlock(env: any): R3FNode[] {
    const nodes: R3FNode[] = [];
    const envProps: Record<string, any> = {};

    if (env.properties) {
      for (const prop of env.properties) {
        envProps[prop.key] = prop.value;
      }
    }

    // Environment preset (skybox or preset name)
    const presetName = envProps.skybox || envProps.preset;
    if (presetName) {
      const preset = ENVIRONMENT_PRESETS[presetName];
      if (preset) {
        nodes.push(this.createNode('Environment', { background: true, preset: preset.envPreset || presetName }));

        const lighting = preset.lighting as Record<string, Record<string, unknown>> | undefined;
        if (lighting?.ambient) {
          nodes.push(this.createNode('ambientLight', {
            color: lighting.ambient.color,
            intensity: lighting.ambient.intensity,
          }));
        }
        if (lighting?.directional) {
          const dl = lighting.directional;
          nodes.push(this.createNode('directionalLight', {
            color: dl.color,
            intensity: dl.intensity,
            position: dl.position,
            castShadow: dl.shadows !== false,
            'shadow-mapSize': [2048, 2048],
          }));
        }
        if (Array.isArray(lighting?.points)) {
          for (const pl of (lighting!.points as unknown[]) as Record<string, unknown>[]) {
            nodes.push(this.createNode('pointLight', {
              color: pl.color,
              intensity: pl.intensity,
              position: pl.position,
              distance: pl.distance,
            }));
          }
        }
        if (preset.fog) {
          nodes.push(this.createNode('fog', {
            attach: 'fog',
            color: preset.fog.color,
            near: preset.fog.near,
            far: preset.fog.far,
          }));
        }
        if (preset.ground) {
          nodes.push(this.createNode('mesh', {
            hsType: 'plane',
            rotation: [-Math.PI / 2, 0, 0],
            position: [0, -0.01, 0],
            receiveShadow: true,
            args: [200, 200],
            color: preset.ground.color,
            materialProps: { roughness: 0.8, metalness: 0.0 },
          }, '__ground'));
        }
      } else {
        nodes.push(this.createNode('Environment', { background: true, preset: presetName }));
      }
    }

    // Explicit ambient_light
    if (envProps.ambient_light !== undefined) {
      nodes.push(this.createNode('ambientLight', {
        intensity: typeof envProps.ambient_light === 'number' ? envProps.ambient_light : 0.5,
      }));
    }

    // Explicit fog
    if (envProps.fog && typeof envProps.fog === 'object') {
      nodes.push(this.createNode('fog', {
        attach: 'fog',
        color: envProps.fog.color || '#cccccc',
        near: envProps.fog.near || 10,
        far: envProps.fog.far || 100,
      }));
    }

    return nodes;
  }

  private compileObjectDecl(obj: Record<string, unknown>, templateMap?: Map<string, Record<string, unknown>>): R3FNode {
    const props: Record<string, unknown> = {};
    let geometryType = 'cube';

    // Merge template traits onto the object if it uses a template
    if (obj.template && templateMap) {
      const tmpl = templateMap.get(obj.template);
      if (tmpl) {
        // Merge template traits (object's own traits take precedence)
        if (tmpl.traits && Array.isArray(tmpl.traits)) {
          const existingTraitNames = new Set((obj.traits as Array<Record<string, unknown>> || []).map((t: Record<string, unknown>) => t.name));
          obj.traits = [
            ...tmpl.traits.filter((t: Record<string, unknown>) => !existingTraitNames.has(t.name as string)),
            ...(obj.traits || []),
          ];
        }
        // Merge template properties (object's own properties take precedence)
        if (tmpl.properties && Array.isArray(tmpl.properties)) {
          const existingKeys = new Set((obj.properties as Array<Record<string, unknown>> || []).map((p: Record<string, unknown>) => p.key));
          const mergedProps = tmpl.properties
            .filter((p: Record<string, unknown>) => !existingKeys.has(p.key as string))
            .map((p: Record<string, unknown>) => ({ type: 'ObjectProperty', key: p.key, value: p.value }));
          obj.properties = [...mergedProps, ...(obj.properties || [])];
        }
      }
    }

    // Expand spread expressions in properties (for HoloComposition format)
    if (obj.properties && Array.isArray(obj.properties)) {
      const expandedProperties: unknown[] = [];
      for (const prop of obj.properties) {
        // Handle spread properties: { type: 'spread', target: 'TemplateName' }
        if (prop && prop.type === 'spread') {
          const resolved = this.resolveSpreadArgument(prop.target || prop.argument, {
            templates: templateMap,
          });
          if (resolved && typeof resolved === 'object' && !Array.isArray(resolved)) {
            // Convert resolved object to property array format
            for (const [key, value] of Object.entries(resolved)) {
              expandedProperties.push({ key, value });
            }
          } else if (Array.isArray(resolved)) {
            // If it's already a property array
            expandedProperties.push(...resolved);
          }
        } else {
          expandedProperties.push(prop);
        }
      }
      obj.properties = expandedProperties;
    }

    if (obj.properties) {
      for (const prop of obj.properties) {
        const key = prop.key;
        const value = prop.value;

        if (key === 'geometry' || key === 'mesh') {
          geometryType = value;
        } else if (key === 'type') {
          // Special types override geometry determination
          if (['text', 'sparkles', 'portal', 'audio'].includes(value)) {
            geometryType = value;
          } else if (
            ['directional', 'point', 'spot', 'hemisphere', 'ambient', 'area'].includes(value)
          ) {
            // Light-type shorthand: type: "directional" implies a light
            geometryType = 'light';
            props.lightType = value;
          } else {
            props[key] = value;
          }
        } else if (key === 'light_type') {
          props.lightType = value;
        } else if (key === 'position' && Array.isArray(value)) {
          props.position = value;
        } else if (key === 'rotation' && Array.isArray(value)) {
          props.rotation = value;
        } else if (key === 'scale') {
          props.scale = Array.isArray(value) ? value : [value, value, value];
        } else if (key === 'color') {
          props.color = value;
        } else if (key === 'src' || key === 'model') {
          props.src = value;
          geometryType = 'model';
        } else if (key === 'text') {
          props.children = this.resolveValue(value);
          props.text = this.resolveValue(value);
        } else if (key === 'font_size') {
          props.fontSize = value;
        } else if (key === 'material') {
          if (typeof value === 'string' && MATERIAL_PRESETS[value]) {
            props.materialProps = { ...MATERIAL_PRESETS[value], ...props.materialProps };
          } else if (typeof value === 'object') {
            // Handle material objects with a preset key: { preset: "glass", color: "#aaddff" }
            if (value.preset && MATERIAL_PRESETS[value.preset]) {
              const { preset: _, ...rest } = value;
              props.materialProps = {
                ...MATERIAL_PRESETS[value.preset],
                ...rest,
                ...props.materialProps,
              };
            } else {
              props.materialProps = { ...props.materialProps, ...value };
            }
          }
        } else if (key === 'roughness' || key === 'metalness' || key === 'metallic') {
          props.materialProps = props.materialProps || {};
          props.materialProps[key === 'metallic' ? 'metalness' : key] = value;
        } else if (key === 'opacity') {
          props.materialProps = props.materialProps || {};
          props.materialProps.opacity = value;
          props.materialProps.transparent = value < 1;
        } else if (key === 'emissive') {
          props.materialProps = { ...props.materialProps, emissive: value };
        } else if (key === 'emissiveIntensity' || key === 'emissive_intensity') {
          props.materialProps = { ...props.materialProps, emissiveIntensity: value };
        } else if (key === 'size') {
          if (Array.isArray(value)) {
            props.args = value;
          }
          props.size = value;
        } else if (key === 'radius') {
          props.size = value * 2;
        } else if (key === 'intensity') {
          props.intensity = value;
        } else if (key === 'cast_shadow' || key === 'castShadow') {
          props.castShadow = value;
        } else if (key === 'receiveShadow' || key === 'receive_shadow') {
          props.receiveShadow = value;
        } else if (key === 'visible') {
          props[key] = value;
        } else if (key === 'maturity') {
          // Explicit asset maturity override: maturity: "draft" | "mesh" | "final"
          props.maturityOverride = value;
        } else if (key === 'promoteUrl' || key === 'promote_url') {
          // GLTF URL for draft→mesh promotion
          props.promoteUrl = value;
        } else if (key === 'collisionShape' || key === 'collision_shape') {
          // Explicit collision proxy shape override
          props.collisionShape = value;
        } else {
          props[key] = this.resolveValue(value);
        }
      }
    }

    // Apply traits from .holo format
    if (obj.traits && Array.isArray(obj.traits)) {
      for (const trait of obj.traits) {
        const name = trait.name;
        if (name === 'grabbable') {
          props.castShadow = true;
          props.grabbable = trait.config || true;
          if (!props.rigidBody) props.rigidBody = { type: 'dynamic' };
          if (!props.collider) props.collider = { type: 'auto' };
        } else if (name === 'hoverable') {
          props.hoverable = trait.config || true;
        } else if (name === 'collidable') {
          const bodyType = trait.config?.type || 'fixed';
          props.rigidBody = { type: bodyType };
          props.collider = { type: 'auto' };
          props.castShadow = true;
          props.receiveShadow = true;
        } else if (name === 'animated') {
          props.animated = trait.config || true;
        } else if (name === 'positional' || name === 'spatial_audio') {
          props.spatial = true;
        } else if (name === 'shadow') {
          props.castShadow = true;
          if (trait.config?.mapSize)
            props['shadow-mapSize'] = [trait.config.mapSize, trait.config.mapSize];
        } else if (name === 'material') {
          const presetName = trait.config?.preset;
          if (presetName && MATERIAL_PRESETS[presetName]) {
            const { preset: _, ...rest } = trait.config;
            props.materialProps = {
              ...MATERIAL_PRESETS[presetName],
              ...rest,
              ...props.materialProps,
            };
          } else {
            props.materialProps = { ...props.materialProps, ...trait.config };
          }
        } else if (name === 'networked') {
          props.networked = trait.config || true;
        } else if (name === 'moldable') {
          props.moldable = trait.config || true;
        } else if (name === 'stretchable') {
          props.stretchable = trait.config || true;
        } else if (name === 'bloom') {
          props.bloom = trait.config || { intensity: 1.0 };
        } else if (name === 'physics') {
          if (!props.rigidBody) props.rigidBody = { type: 'dynamic' };
          if (!props.collider) props.collider = { type: 'auto' };
          if (trait.config) Object.assign(props.rigidBody, trait.config);
        } else if (name === 'portal') {
          props.portal = trait.config || true;
        } else if (name === 'attach') {
          props.attach = trait.config || true;
        } else if (name === 'orbit') {
          props.orbit = trait.config || true;
        } else if (name === 'look_at') {
          props.lookAtTarget = trait.config || true;
        } else if (name === 'follow') {
          props.follow = trait.config || true;
        }
        // ── Environment Understanding ─────────────────────────────
        else if (name === 'plane_detection') {
          props.planeDetection = trait.config || { mode: 'all' };
        } else if (name === 'mesh_detection') {
          props.meshDetection = trait.config || { classification: true };
        } else if (name === 'anchor') {
          props.anchor = trait.config || { type: 'spatial' };
        } else if (name === 'persistent_anchor') {
          props.persistentAnchor = trait.config || { storage: 'local' };
        } else if (name === 'shared_anchor') {
          props.sharedAnchor = trait.config || { authority: 'creator' };
        } else if (name === 'occlusion') {
          props.occlusionMode = trait.config?.mode || 'environment';
          props.occlusion = trait.config || true;
        } else if (name === 'light_estimation') {
          props.lightEstimation = trait.config || { auto_apply: true };
        } else if (name === 'geospatial') {
          props.geospatial = trait.config || true;
        }
        // ── Gaussian Splatting & Volumetric ───────────────────────
        else if (name === 'gaussian_splat') {
          props.gaussianSplat = trait.config || true;
        } else if (name === 'nerf') {
          props.nerf = trait.config || true;
        } else if (name === 'volumetric_video') {
          props.volumetricVideo = trait.config || true;
        } else if (name === 'point_cloud') {
          props.pointCloud = trait.config || true;
        } else if (name === 'photogrammetry') {
          props.photogrammetry = trait.config || true;
        }
        // ── Physics Expansion ─────────────────────────────────────
        else if (name === 'cloth') {
          props.cloth = trait.config || { stiffness: 0.8 };
          if (!props.rigidBody) props.rigidBody = { type: 'dynamic' };
        } else if (name === 'fluid') {
          props.fluid = trait.config || { viscosity: 0.01 };
          props.__gapsComponents = props.__gapsComponents || [];
          (props.__gapsComponents as string[]).push('FluidRenderer');
        } else if (name === 'soft_body') {
          props.softBody = trait.config || { elasticity: 0.5 };
          if (!props.rigidBody) props.rigidBody = { type: 'dynamic' };
        } else if (name === 'rope') {
          props.rope = trait.config || { segments: 20 };
        } else if (name === 'chain') {
          props.chain = trait.config || { link_count: 20 };
        } else if (name === 'wind') {
          props.wind = trait.config || { strength: 5.0 };
        } else if (name === 'buoyancy') {
          props.buoyancy = trait.config || { water_level: 0 };
        } else if (name === 'destruction') {
          props.destruction = trait.config || { health: 100 };
          if (!props.rigidBody) props.rigidBody = { type: 'dynamic' };
          if (!props.collider) props.collider = { type: 'auto' };
        }
        // ── GAPS Physics Expansion (Phase 2-4) ───────────────────
        else if (name === 'soft_body_pro') {
          props.softBodyPro = trait.config || { tear_threshold: 0.5 };
          if (!props.rigidBody) props.rigidBody = { type: 'dynamic' };
        } else if (name === 'crowd_sim') {
          props.crowdSim = trait.config || { max_agents: 1000 };
        } else if (name === 'deformable_terrain') {
          props.deformableTerrain = trait.config || { resolution: 256 };
        } else if (name === 'volumetric_clouds') {
          props.volumetricClouds = trait.config || { coverage: 0.5 };
          // Emit CloudRenderer as sibling for weather visuals
          props.__gapsComponents = props.__gapsComponents || [];
          (props.__gapsComponents as string[]).push('CloudRenderer');
        } else if (name === 'god_rays') {
          props.godRays = trait.config || { intensity: 1.0 };
          props.__gapsComponents = props.__gapsComponents || [];
          (props.__gapsComponents as string[]).push('GodRaysEffect');
        }
        // ── GAPS Multiplayer & Social ────────────────────────────
        else if (name === 'spatial_voice') {
          props.spatialVoice = trait.config || { max_distance: 30 };
          props.spatial = true;
        } else if (name === 'ai_companion') {
          props.aiCompanion = trait.config || { personality: 'friendly' };
        } else if (name === 'moderation') {
          props.moderation = trait.config || { sensitivity: 'medium' };
        } else if (name === 'anti_grief') {
          props.antiGrief = trait.config || { detection_window: 30 };
        } else if (name === 'world_state') {
          props.worldState = trait.config || { sync_rate: 10 };
        } else if (name === 'token_gated') {
          props.tokenGated = trait.config || { token_contract: '', min_balance: 1 };
        }
        // ── Advanced Spatial Audio ────────────────────────────────
        else if (name === 'ambisonics') {
          props.ambisonics = trait.config || { order: 1 };
          props.spatial = true;
        } else if (name === 'hrtf') {
          props.hrtf = trait.config || true;
          props.spatial = true;
        } else if (name === 'reverb_zone') {
          props.reverbZone = trait.config || { preset: 'room' };
        } else if (name === 'audio_occlusion') {
          props.audioOcclusion = trait.config || true;
        } else if (name === 'audio_portal') {
          props.audioPortal = trait.config || true;
        } else if (name === 'head_tracked_audio') {
          props.headTrackedAudio = trait.config || true;
          props.spatial = true;
        }
        // ── Accessibility ─────────────────────────────────────────
        else if (name === 'accessible') {
          props.accessible = trait.config || { role: 'generic' };
        } else if (name === 'alt_text') {
          props.altText = trait.config?.text || '';
        } else if (name === 'magnifiable') {
          props.magnifiable = trait.config || { max_scale: 3.0 };
        } else if (name === 'high_contrast') {
          props.highContrast = trait.config || { mode: 'outline' };
        } else if (name === 'motion_reduced') {
          props.motionReduced = trait.config || true;
          if (props.animated) props.animated = false;
        }
        // ── WebGPU Compute ────────────────────────────────────────
        else if (name === 'compute') {
          props.compute = trait.config || true;
        } else if (name === 'gpu_particle') {
          props.gpuParticle = trait.config || { count: 10000 };
        } else if (name === 'gpu_physics') {
          props.gpuPhysics = trait.config || true;
        }
        // ── Digital Twin & IoT ────────────────────────────────────
        else if (name === 'digital_twin') {
          props.digitalTwin = trait.config || true;
        } else if (name === 'sensor') {
          props.sensor = trait.config || true;
        } else if (name === 'data_binding') {
          props.dataBinding = trait.config || true;
        }
        // ── Autonomous Agents ─────────────────────────────────────
        else if (name === 'behavior_tree') {
          props.behaviorTree = trait.config || true;
        } else if (name === 'llm_agent') {
          props.llmAgent = trait.config || true;
        } else if (name === 'neural_link') {
          props.neuralLink = trait.config || { model: 'brittney-v4.gguf', temperature: 0.7 };
        } else if (name === 'perception') {
          props.perception = trait.config || { sight_range: 20 };
        } else if (name === 'patrol') {
          props.patrol = trait.config || true;
        }
        // ── Co-Presence ───────────────────────────────────────────
        else if (name === 'co_located') {
          props.coLocated = trait.config || true;
        } else if (name === 'shared_world') {
          props.sharedWorld = trait.config || true;
        } else if (name === 'voice_proximity') {
          props.voiceProximity = trait.config || { max_distance: 20 };
          props.spatial = true;
        }
        // ── V43 AI/XR Traits ─────────────────────────────────────
        else if (name === 'spatial_persona') {
          props.spatialPersona = trait.config || { style: 'realistic' };
        } else if (name === 'shareplay') {
          props.sharePlay = trait.config || { activity_type: 'custom' };
        } else if (name === 'object_tracking') {
          props.objectTracking = trait.config || true;
        } else if (name === 'scene_reconstruction') {
          props.sceneReconstruction = trait.config || { mode: 'mesh' };
        } else if (name === 'eye_tracked') {
          props.eyeTracked = true;
        } else if (name === 'eye_hand_fusion') {
          props.eyeHandFusion = true;
        } else if (name === 'controlnet') {
          props.controlNet = trait.config || { model: 'canny' };
        } else if (name === 'ai_texture_gen') {
          props.aiTextureGen = trait.config || { style: 'photorealistic' };
        } else if (name === 'diffusion_realtime') {
          props.diffusionRealtime = trait.config || { backend: 'cuda' };
        } else if (name === 'ai_upscaling') {
          props.aiUpscaling = trait.config || { factor: 2 };
        } else if (name === 'ai_inpainting') {
          props.aiInpainting = trait.config || true;
        } else if (name === 'neural_forge') {
          props.neuralForge = trait.config || true;
        } else if (name === 'embedding_search') {
          props.embeddingSearch = trait.config || { dimensions: 1536 };
        } else if (name === 'ai_npc_brain') {
          props.aiNpcBrain = trait.config || { model: 'llm' };
        } else if (name === 'vector_db') {
          props.vectorDb = trait.config || true;
        } else if (name === 'vision' || name === 'ai_vision') {
          props.vision = trait.config || { task: 'detection' };
        } else if (name === 'spatial_awareness') {
          props.spatialAwareness = trait.config || true;
        } else if (name === 'neural_animation') {
          props.neuralAnimation = trait.config || { style: 'motion_matching' };
        }
        // ── Draft Pipeline ────────────────────────────────────────
        else if (name === 'draft') {
          props.draftMode = true;
          props.draftShape = trait.config?.shape || 'box';
          props.draftColor = trait.config?.color || '#88aaff';
          props.draftOpacity = trait.config?.opacity ?? 1.0;
          props.draftWireframe = trait.config?.wireframe || false;
          if (trait.config?.collision !== false) {
            if (!props.rigidBody) props.rigidBody = { type: 'fixed' };
            if (!props.collider) props.collider = { type: 'auto' };
          }
        }
        // ── Fallthrough: pass trait config as prop ────────────────
        else {
          props[name] = trait.config || true;
        }
      }
    }

    // ── Batch composition: apply multi-trait visual rules ────────────
    // Uses TraitCompositor for layer-ordered merge with suppression,
    // requirement, additive, and multi-trait merge rules.
    if (obj.traits && Array.isArray(obj.traits)) {
      const traitNames = (obj.traits as Array<Record<string, unknown>>).map((t: Record<string, unknown>) => t.name as string);
      const compositor = new TraitCompositor();
      const composedMaterial = compositor.compose(traitNames);
      if (Object.keys(composedMaterial).length > 0) {
        props.materialProps = { ...props.materialProps, ...composedMaterial };
      }
    }

    // Determine node type
    let type: string;
    if (geometryType === 'model' && props.src) {
      type = 'gltfModel';
    } else if (geometryType === 'light') {
      const lightType = props.lightType || props.type || 'directional';
      const lightMapping: Record<string, string> = {
        directional: 'directionalLight',
        point: 'pointLight',
        spot: 'spotLight',
        hemisphere: 'hemisphereLight',
        ambient: 'ambientLight',
        area: 'rectAreaLight',
      };
      type = lightMapping[lightType] || 'directionalLight';
      delete props.lightType;
    } else if (geometryType === 'text') {
      type = 'Text';
    } else if (geometryType === 'sparkles') {
      type = 'Sparkles';
    } else if (geometryType === 'portal') {
      type = 'Portal';
    } else {
      type = 'mesh';
      props.hsType = geometryType;
      if (!props.args) {
        const size = typeof props.size === 'number' ? props.size : 1;
        props.args = this.getGeometryArgs(geometryType, { size });
      }
    }

    const r3fNode = this.createNode(type, props, obj.name);

    // Set asset maturity from @draft trait or explicit maturity property
    if (props.draftMode) {
      r3fNode.assetMaturity = 'draft';
    } else if (props.maturityOverride) {
      const m = props.maturityOverride;
      if (m === 'draft' || m === 'mesh' || m === 'final') {
        r3fNode.assetMaturity = m;
      }
    }

    if (obj.children) {
      for (const child of obj.children) {
        r3fNode.children!.push(this.compileObjectDecl(child));
      }
    }

    // ── GAPS: inject renderer components for physics/weather traits ──
    if (props.__gapsComponents && Array.isArray(props.__gapsComponents)) {
      for (const componentType of props.__gapsComponents as string[]) {
        const componentProps: Record<string, unknown> = {};

        if (componentType === 'CloudRenderer' && props.volumetricClouds) {
          const vc = props.volumetricClouds as Record<string, unknown>;
          componentProps.coverage = vc.coverage ?? 0.5;
          componentProps.altitude = vc.altitude ?? 500;
          componentProps.windOffset = vc.wind ?? [0, 0, 0];
          componentProps.layers = vc.layers ?? 3;
        } else if (componentType === 'GodRaysEffect' && props.godRays) {
          const gr = props.godRays as Record<string, unknown>;
          componentProps.intensity = gr.intensity ?? 1.0;
          componentProps.decay = gr.decay ?? 0.96;
          componentProps.lightColor = gr.color ?? '#fffde7';
        } else if (componentType === 'FluidRenderer' && props.fluid) {
          const fl = props.fluid as Record<string, unknown>;
          componentProps.color = fl.color ?? '#1a6fc4';
          componentProps.particleSize = fl.particle_radius ?? 0.02;
          componentProps.renderMode = fl.render_mode ?? 'points';
        }

        r3fNode.children!.push(
          this.createNode(componentType, componentProps, `${obj.name}-${componentType}`),
        );
      }
      delete props.__gapsComponents;
    }

    return r3fNode;
  }

  /**
   * Compile a SystemNode into an R3FNode.
   *
   * Systems are logical containers with state, actions, lifecycle hooks,
   * and optionally child objects/UI. In the R3F tree, a system compiles
   * to a group node annotated with its rich metadata (state, actions,
   * hooks) so the runtime/renderer can wire up behavior.
   */
  private compileSystemNode(node: Record<string, unknown>, templateMap?: Map<string, Record<string, unknown>>): R3FNode {
    const props: Record<string, unknown> = {};

    // Preserve system metadata for runtime
    if (node.state) {
      props.systemState = node.state;
    }
    if (node.actions) {
      props.systemActions = node.actions;
    }
    if (node.hooks) {
      props.systemHooks = node.hooks;
    }

    // Copy regular properties
    if (node.properties && typeof node.properties === 'object') {
      for (const [key, value] of Object.entries(node.properties)) {
        props[key] = value;
      }
    }

    const r3fNode = this.createNode('System', props, node.id || node.name);
    if (node.directives) {
      r3fNode.directives = node.directives;
    }

    // Add trait directives
    if (node.directives) {
      for (const d of node.directives) {
        if (d.type === 'trait') {
          r3fNode.traits?.set(d.name, d.config || {});
        }
      }
    }

    // Compile nested children (objects, templates, etc.)
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        r3fNode.children!.push(this.compileChildNode(child, templateMap));
      }
    }

    // Compile embedded UI nodes as children
    if (node.ui && Array.isArray(node.ui)) {
      for (const uiNode of node.ui) {
        r3fNode.children!.push(this.compileNode(uiNode));
      }
    }

    return r3fNode;
  }

  /**
   * Compile a ComponentNode into an R3FNode.
   *
   * Components are UI-focused containers with props, state, actions,
   * and render/UI blocks. They compile to a group node annotated with
   * component metadata for the runtime.
   */
  private compileComponentNode(node: Record<string, unknown>, templateMap?: Map<string, Record<string, unknown>>): R3FNode {
    const props: Record<string, any> = {};

    // Preserve component metadata for runtime
    if (node.props) {
      props.componentProps = node.props;
    }
    if (node.state) {
      props.componentState = node.state;
    }
    if (node.actions) {
      props.componentActions = node.actions;
    }
    if (node.hooks) {
      props.componentHooks = node.hooks;
    }

    // Copy regular properties
    if (node.properties && typeof node.properties === 'object') {
      for (const [key, value] of Object.entries(node.properties)) {
        props[key] = value;
      }
    }

    const r3fNode = this.createNode('Component', props, node.id || node.name);
    if (node.directives) {
      r3fNode.directives = node.directives;
    }

    // Add trait directives
    if (node.directives) {
      for (const d of node.directives) {
        if (d.type === 'trait') {
          r3fNode.traits?.set(d.name, d.config || {});
        }
      }
    }

    // Compile nested children
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        r3fNode.children!.push(this.compileChildNode(child, templateMap));
      }
    }

    // Compile embedded UI nodes as children
    if (node.ui && Array.isArray(node.ui)) {
      for (const uiNode of node.ui) {
        r3fNode.children!.push(this.compileNode(uiNode));
      }
    }

    return r3fNode;
  }

  /**
   * Dispatch a child node to the appropriate compile method based on its type.
   * Used by compileSystemNode, compileComponentNode, and compileComposition
   * when processing the parser's children array.
   */
  private compileChildNode(child: Record<string, unknown>, templateMap?: Map<string, Record<string, unknown>>): R3FNode {
    switch (child.type) {
      case 'system':
        return this.compileSystemNode(child, templateMap);
      case 'component':
        return this.compileComponentNode(child, templateMap);
      case 'object':
        return this.compileObjectDecl(child, templateMap);
      case 'template':
        // Templates are type definitions, not visual elements.
        // Compile as a group containing their children, and add
        // to the templateMap for object declarations to reference.
        if (templateMap && child.name) {
          templateMap.set(child.name, child);
        }
        return this.compileTemplateNode(child, templateMap);
      case 'spatial_group':
        return this.compileSpatialGroup(child, templateMap);
      default:
        return this.compileNode(child);
    }
  }

  /**
   * Compile a template node. Templates define reusable types.
   * In the R3F tree, they compile to an empty group (they're not
   * rendered directly — objects "using" them inherit their properties).
   */
  private compileTemplateNode(node: Record<string, unknown>, _templateMap?: Map<string, Record<string, unknown>>): R3FNode {
    const props: Record<string, any> = {};

    // Preserve template metadata
    if (node.state || node.properties?.state) {
      props.templateState = node.state || node.properties?.state;
    }
    if (node.properties) {
      for (const [key, value] of Object.entries(node.properties)) {
        if (key !== 'state') {
          props[key] = value;
        }
      }
    }

    return this.createNode('Template', props, node.name);
  }

  private compileSpatialGroup(group: Record<string, unknown>, templateMap?: Map<string, Record<string, unknown>>): R3FNode {
    const props: Record<string, any> = {};
    if (group.properties) {
      for (const prop of group.properties) {
        if (prop.key === 'position') props.position = prop.value;
        else if (prop.key === 'rotation') props.rotation = prop.value;
        else if (prop.key === 'scale')
          props.scale = Array.isArray(prop.value)
            ? prop.value
            : [prop.value, prop.value, prop.value];
      }
    }

    const node = this.createNode('group', props, group.name);

    if (group.objects) {
      for (const obj of group.objects)
        node.children!.push(this.compileObjectDecl(obj, templateMap));
    }
    if (group.groups) {
      for (const sub of group.groups)
        node.children!.push(this.compileSpatialGroup(sub, templateMap));
    }

    return node;
  }

  private compileTimelineBlock(timeline: any): R3FNode {
    const entries: R3FNode[] = [];
    if (timeline.entries) {
      for (const entry of timeline.entries) {
        const action = entry.action;
        const entryProps: Record<string, any> = { time: entry.time, actionKind: action.kind };
        if (action.kind === 'animate') {
          entryProps.target = action.target;
          entryProps.properties = action.properties;
        } else if (action.kind === 'emit') {
          entryProps.event = action.event;
          if (action.data !== undefined) entryProps.data = action.data;
        } else if (action.kind === 'call') {
          entryProps.method = action.method;
          if (action.args) entryProps.args = action.args;
        }
        entries.push(this.createNode('TimelineEntry', entryProps));
      }
    }
    const timelineNode = this.createNode('Timeline', { autoplay: timeline.autoplay, loop: timeline.loop }, timeline.name);
    timelineNode.children = entries;
    return timelineNode;
  }

  private compileAudioBlock(audio: Record<string, unknown>): R3FNode {
    const props: Record<string, any> = {};
    if (audio.properties) {
      for (const prop of audio.properties) {
        if (prop.key === 'src' || prop.key === 'source') {
          props.src = prop.value;
        } else if (prop.key === 'rolloff') {
          props.rolloffFactor = prop.value;
        } else {
          props[prop.key] = prop.value;
        }
      }
    }
    return this.createNode('Audio', props, audio.name);
  }

  private compileZoneBlock(zone: Record<string, unknown>): R3FNode {
    const props: Record<string, any> = {};
    if (zone.properties) {
      for (const prop of zone.properties) {
        props[prop.key] = prop.value;
      }
    }
    // Attach handlers as props
    if (zone.handlers && zone.handlers.length > 0) {
      props.handlers = (zone.handlers as Array<Record<string, unknown>>).map((h: Record<string, unknown>) => ({
        event: h.event,
        parameters: h.parameters,
        body: h.body,
      }));
    }
    return this.createNode('Zone', props, zone.name);
  }

  private compileUIBlock(ui: Record<string, unknown>): R3FNode {
    const children: R3FNode[] = [];
    if (ui.elements) {
      for (const el of ui.elements) {
        const elProps: Record<string, any> = {};
        if (el.properties) {
          for (const prop of el.properties) {
            if (prop.key === 'font_size') {
              elProps.fontSize = prop.value;
            } else {
              elProps[prop.key] = this.resolveValue(prop.value);
            }
          }
        }
        children.push(this.createNode('UIElement', elProps, el.name));
      }
    }
    const uiNode = this.createNode('UI', {}, '__ui');
    uiNode.children = children;
    return uiNode;
  }

  private compileTransitionBlock(transition: Record<string, unknown>): R3FNode {
    const props: Record<string, any> = {};
    if (transition.properties) {
      for (const prop of transition.properties) {
        props[prop.key] = prop.value;
      }
    }
    return this.createNode('Transition', props, transition.name);
  }

  private compileConditionalBlock(cond: Record<string, unknown>, templateMap?: Map<string, Record<string, unknown>>): R3FNode {
    const children: R3FNode[] = [];
    if (cond.objects) {
      for (const obj of cond.objects) children.push(this.compileObjectDecl(obj, templateMap));
    }
    if (cond.spatialGroups) {
      for (const g of cond.spatialGroups) children.push(this.compileSpatialGroup(g, templateMap));
    }

    const elseChildren: R3FNode[] = [];
    if (cond.elseObjects) {
      for (const obj of cond.elseObjects)
        elseChildren.push(this.compileObjectDecl(obj, templateMap));
    }
    if (cond.elseSpatialGroups) {
      for (const g of cond.elseSpatialGroups)
        elseChildren.push(this.compileSpatialGroup(g, templateMap));
    }

    const conditionalNode = this.createNode('ConditionalGroup', {
      condition: cond.condition,
      elseChildren: elseChildren.length > 0 ? elseChildren : undefined,
    });
    conditionalNode.children = children;
    return conditionalNode;
  }

  private compileForEachBlock(iter: Record<string, unknown>, templateMap?: Map<string, Record<string, unknown>>): R3FNode {
    const templateChildren: R3FNode[] = [];
    if (iter.objects) {
      for (const obj of iter.objects)
        templateChildren.push(this.compileObjectDecl(obj, templateMap));
    }
    if (iter.spatialGroups) {
      for (const g of iter.spatialGroups)
        templateChildren.push(this.compileSpatialGroup(g, templateMap));
    }

    const forEachNode = this.createNode('ForEachGroup', { variable: iter.variable, iterable: iter.iterable });
    forEachNode.children = templateChildren;
    return forEachNode;
  }

  /**
   * Resolve a property value, converting bind expressions into runtime-reactive markers.
   */
  private resolveValue(value: unknown): unknown {
    if (value && typeof value === 'object' && value.__bind) {
      return { __bind: true, source: value.source, transform: value.transform };
    }
    return value;
  }

  // ─── Shared Helpers ───────────────────────────────────────────────────

  private injectDefaultLighting(root: R3FNode): void {
    if (!this._defaultLighting) return;
    if (!this.treeHasLights(root)) {
      const shadowSize = this.tierScales.shadowMapSize;
      root.children?.unshift(
        this.createNode('ambientLight', { intensity: 0.4, color: '#ffffff' }),
        this.createNode('directionalLight', {
          intensity: 1.0,
          position: [5, 10, 5],
          castShadow: true,
          'shadow-mapSize': [shadowSize, shadowSize],
          color: '#ffffff',
        })
      );
    }
  }

  private treeHasLights(node: R3FNode): boolean {
    if (node.type.toLowerCase().includes('light')) return true;
    return node.children?.some((c) => this.treeHasLights(c)) || false;
  }

  private hasPostProcessing(node: R3FNode): boolean {
    if (node.traits?.has('bloom' as VRTraitName) || node.traits?.has('postprocessing' as VRTraitName)) return true;
    if (node.props.bloom) return true;
    return node.children?.some((c) => this.hasPostProcessing(c)) || false;
  }

  private extractPostProcessingNodes(node: R3FNode): R3FNode[] {
    const effects: R3FNode[] = [];

    const ppTrait = node.traits?.get('postprocessing' as VRTraitName);
    if (ppTrait) {
      if (ppTrait.bloom) effects.push(this.createNode('Bloom', ppTrait.bloom));
      if (ppTrait.ssao) effects.push(this.createNode('SSAO', ppTrait.ssao));
      if (ppTrait.vignette) effects.push(this.createNode('Vignette', ppTrait.vignette));
    }
    if (node.props.bloom) {
      effects.push(
        this.createNode(
          'Bloom',
          typeof node.props.bloom === 'object' ? node.props.bloom : { intensity: 1.0 }
        )
      );
    }

    node.children?.forEach((child) => effects.push(...this.extractPostProcessingNodes(child)));
    return effects;
  }

  private mapType(type: string, props: Record<string, any>): string {
    if (type === 'environment') {
      if (props.name && ENVIRONMENT_PRESETS[props.name]) {
        Object.assign(props, ENVIRONMENT_PRESETS[props.name]);
      }
      return 'Environment';
    }

    if (type === 'light') {
      const lightType = props.type || 'directional';
      const lightMapping: Record<string, string> = {
        directional: 'directionalLight',
        point: 'pointLight',
        spot: 'spotLight',
        hemisphere: 'hemisphereLight',
        ambient: 'ambientLight',
        area: 'rectAreaLight',
      };
      return lightMapping[lightType] || 'directionalLight';
    }

    if (type === 'portal') return 'Portal';
    if (type === 'sparkles') return 'Sparkles';

    // Mesh types — set hsType so renderer knows which geometry to create
    if (MESH_TYPES.has(type)) {
      props.hsType = type;
      return 'mesh';
    }

    const mapping: Record<string, string> = {
      ambient_light: 'ambientLight',
      model: 'gltfModel',
      audio: 'positionalAudio',
      composition: 'group',
      scale: 'group',
      focus: 'group',
      spatial_agent: 'SpatialAgent',
      spatial_container: 'group',
      ui_panel: 'UIPanel',
      ui_text: 'UIText',
      ui_button: 'UIButton',
      ui_slider: 'UISlider',
      ui_input: 'UIInput',
      ui_image: 'UIImage',
      ui_chart: 'UIChart',
      ui_gauge: 'UIGauge',
      ui_value: 'UIValue',
      ui_status_indicator: 'UIStatusIndicator',
      tool_slot: 'ToolSlot',
      behavior: 'group',
      system: 'System',
      component: 'Component',
      avatar: 'Avatar',
      dna: 'DNA',
      gaussian_splat: 'GaussianSplat',
      splat: 'GaussianSplat',
      nerf: 'NeRF',
      volumetric_video: 'VolumetricVideo',
    };
    return mapping[type] || type;
  }

  private compileProperties(node: ASTNode, rawProps: Record<string, any>): Record<string, any> {
    // Expand spread expressions first
    const expandedProps = this.expandSpreads(rawProps);
    const props: Record<string, any> = { ...expandedProps };

    if (node.position) {
      props.position = [node.position.x, node.position.y, node.position.z];
    }
    if (rawProps.position && Array.isArray(rawProps.position)) {
      props.position = rawProps.position;
    }

    if (node.hologram) {
      const h = node.hologram;
      if (h.color) props.color = h.color;
      if (MESH_TYPES.has(node.type)) {
        props.args = this.getGeometryArgs(node.type, h);
        props.hsType = node.type;
      }
    }

    if (rawProps.scale !== undefined && !props.scale) {
      props.scale = Array.isArray(rawProps.scale)
        ? rawProps.scale
        : [rawProps.scale, rawProps.scale, rawProps.scale];
    }

    if (rawProps.geometry && !props.hsType) {
      props.hsType = rawProps.geometry;
      props.args = this.getGeometryArgs(rawProps.geometry, { size: rawProps.size || 1 });
    }

    if (
      rawProps.material &&
      typeof rawProps.material === 'string' &&
      MATERIAL_PRESETS[rawProps.material]
    ) {
      props.materialProps = { ...MATERIAL_PRESETS[rawProps.material], ...props.materialProps };
    }

    if (node.directives) {
      for (const d of node.directives) {
        if (d.type === 'trait') {
          if (d.name === 'grabbable') {
            props.castShadow = true;
            props.grabbable = d.config || true;
            if (!props.rigidBody) props.rigidBody = { type: 'dynamic' };
            if (!props.collider) props.collider = { type: 'auto' };
          } else if ((d.name as string) === 'animated') {
            props.animated = d.config || true;
          } else if ((d.name as string) === 'spatial_audio' || (d.name as string) === 'voice') {
            props.spatial = true;
          } else if (d.name === 'networked') {
            props.networked = d.config || true;
          } else if (d.name === ('moldable' as VRTraitName)) {
            props.moldable = d.config || true;
          } else if (d.name === ('stretchable' as VRTraitName)) {
            props.stretchable = d.config || true;
          } else if (d.name === ('ai_driven' as VRTraitName)) {
            props.ai_driven = d.config || true;
          } else if (d.name === ('dialogue' as VRTraitName)) {
            props.dialogue = d.config || true;
          } else if (d.name === ('gesture' as VRTraitName)) {
            props.gesture = d.config || true;
          } else if (d.name === ('haptic' as VRTraitName)) {
            props.haptic = d.config || true;
          } else if (d.name === ('avatar_embodiment' as VRTraitName)) {
            props.avatarEmbodiment = d.config || true;
          } else if (d.name === ('lip_sync' as VRTraitName)) {
            props.lipSync = d.config || true;
          } else if (d.name === ('emotion_directive' as VRTraitName)) {
            props.emotionDirective = d.config || true;
          } else if (d.name === ('stt' as VRTraitName)) {
            props.stt = d.config || true;
          } else if (d.name === ('tts' as VRTraitName)) {
            props.tts = d.config || true;
          } else if (d.name === ('generate' as VRTraitName)) {
            props.generate = d.config;
          } else if (d.name === 'skeleton') {
            props.skeleton = d.config || true;
          } else if (d.name === 'body') {
            props.body = d.config || true;
          } else if (d.name === 'gaussian_splat') {
            props.gaussianSplat = d.config || true;
          } else if (d.name === 'nerf') {
            props.nerf = d.config || true;
          } else if (d.name === 'volumetric_video') {
            props.volumetricVideo = d.config || true;
          }
        }
      }
    }

    delete props.type;
    delete props.geometry;
    return props;
  }

  private applyGraphicsConfig(r3fNode: R3FNode, graphics: Record<string, unknown>): void {
    if (graphics.material) {
      const m = graphics.material;
      const materialProps: Record<string, any> = {};

      if (m.preset && MATERIAL_PRESETS[m.preset]) {
        Object.assign(materialProps, MATERIAL_PRESETS[m.preset]);
      }
      if (m.type === 'pbr' && m.pbr) {
        if (m.pbr.baseColor) materialProps.color = this.mapColor(m.pbr.baseColor);
        if (m.pbr.metallic !== undefined) materialProps.metalness = m.pbr.metallic;
        if (m.pbr.roughness !== undefined) materialProps.roughness = m.pbr.roughness;
        if (m.pbr.emission) materialProps.emissive = this.mapColor(m.pbr.emission);
        if (m.pbr.emissionStrength) materialProps.emissiveIntensity = m.pbr.emissionStrength;
        if (m.pbr.clearcoat !== undefined) materialProps.clearcoat = m.pbr.clearcoat;
        if (m.pbr.transmission !== undefined) materialProps.transmission = m.pbr.transmission;
        if (m.pbr.ior !== undefined) materialProps.ior = m.pbr.ior;
        if (m.pbr.iridescence !== undefined) materialProps.iridescence = m.pbr.iridescence;
      }

      r3fNode.props.materialProps = { ...r3fNode.props.materialProps, ...materialProps };
    }

    if (graphics.lighting) {
      const l = graphics.lighting;
      if (r3fNode.type.toLowerCase().includes('light')) {
        if (l.shadows) r3fNode.props.castShadow = true;
        if (l.intensity !== undefined) r3fNode.props.intensity = l.intensity;
        if (l.color) r3fNode.props.color = this.mapColor(l.color);
      }
      if (r3fNode.type === 'Environment' && l.preset) {
        r3fNode.props.preset = l.preset;
      }
    }

    if (graphics.networked) {
      r3fNode.props.networked = graphics.networked;
    }
  }

  private mapColor(c: string | number | Record<string, number>): string {
    if (typeof c === 'string') return c;
    if (typeof c === 'number') return `#${c.toString(16).padStart(6, '0')}`;
    if (c.r !== undefined) {
      const r = c.r > 1 ? c.r : Math.floor(c.r * 255);
      const g = c.g > 1 ? c.g : Math.floor(c.g * 255);
      const b = c.b > 1 ? c.b : Math.floor(c.b * 255);
      return `rgb(${r}, ${g}, ${b})`;
    }
    return '#ffffff';
  }

  private getGeometryArgs(type: string, hologram: Record<string, unknown>): unknown[] {
    const size = hologram.size || 1;
    switch (type) {
      case 'sphere':
      case 'orb':
        return [size * 0.5, 32, 32];
      case 'cube':
      case 'box':
        return [size, size, size];
      case 'cylinder':
        return [size * 0.5, size * 0.5, size, 32];
      case 'pyramid':
      case 'cone':
        return [size * 0.5, 0, size, 4];
      case 'plane':
        return [size, size];
      case 'torus':
        return [size * 0.5, size * 0.15, 16, 32];
      case 'ring':
        return [size * 0.3, size * 0.5, 32];
      case 'capsule':
        return [size * 0.3, size * 0.5, 4, 16];
      default:
        return [size, size, size];
    }
  }
}
