/**
 * Trait-Vertical Mappings for HoloScript LSP
 *
 * Maps 15 industry verticals to recommended trait sets. Each vertical
 * defines which HoloScript traits are most relevant for that domain,
 * along with relevance scores and documentation snippets explaining
 * why each trait matters for the given vertical.
 *
 * Used by TraitRecommendationProvider to offer context-aware trait
 * completions when the composition's metadata.category or metadata.tags
 * indicate a specific industry focus.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TraitRecommendation {
  /** Trait annotation name (e.g., "@hand_tracked") */
  trait: string;
  /** Relevance score for this vertical (0.0 - 1.0, higher = more relevant) */
  relevance: number;
  /** Short rationale explaining why this trait matters for the vertical */
  rationale: string;
  /** Key config properties to highlight in completion documentation */
  configHint: string;
}

export interface VerticalMapping {
  /** Machine-readable vertical identifier */
  id: string;
  /** Human-readable display name */
  displayName: string;
  /** Brief description of the vertical */
  description: string;
  /** Tags that may appear in metadata.tags to match this vertical */
  matchTags: string[];
  /** Ordered list of trait recommendations (highest relevance first) */
  traits: TraitRecommendation[];
}

// ---------------------------------------------------------------------------
// Vertical Definitions
// ---------------------------------------------------------------------------

export const VERTICAL_MAPPINGS: VerticalMapping[] = [
  // =========================================================================
  // 1. Healthcare
  // =========================================================================
  {
    id: 'healthcare',
    displayName: 'Healthcare',
    description: 'Medical training, surgical simulation, patient rehabilitation, and health data visualization.',
    matchTags: ['healthcare', 'medical', 'health', 'surgical', 'rehabilitation', 'therapy', 'clinical', 'hospital', 'patient'],
    traits: [
      { trait: '@hand_tracked', relevance: 1.0, rationale: 'Precise hand tracking for surgical simulation and medical tool manipulation.', configHint: 'solver: "fabrik", precision: "high"' },
      { trait: '@haptic', relevance: 0.95, rationale: 'Tactile feedback for tissue palpation, needle insertion, and instrument handling.', configHint: 'intensity: 0.8, pattern: "pulse"' },
      { trait: '@anchor', relevance: 0.9, rationale: 'Anchors medical models and anatomical overlays to real-world surfaces in AR.', configHint: 'type: "surface", persistent: true' },
      { trait: '@accessible', relevance: 0.9, rationale: 'WCAG compliance for medical applications; screen reader and subtitle support.', configHint: 'screenReader: true, subtitles: true, highContrast: true' },
      { trait: '@ik', relevance: 0.85, rationale: 'Inverse kinematics for realistic avatar arm/hand positioning during procedures.', configHint: 'solver: "two-bone", iterations: 20' },
      { trait: '@voice_input', relevance: 0.8, rationale: 'Hands-free voice commands during sterile procedures.', configHint: 'continuous: true, language: "en-US"' },
      { trait: '@networked', relevance: 0.75, rationale: 'Multi-user collaboration for remote surgical consultation and training.', configHint: 'owner: "server", syncRate: 30' },
      { trait: '@trigger', relevance: 0.7, rationale: 'Spatial zones for step-by-step procedural guidance.', configHint: 'shape: "sphere", radius: 0.5' },
      { trait: '@material', relevance: 0.65, rationale: 'Realistic tissue and organ rendering with subsurface scattering.', configHint: 'type: "standard", transparent: true' },
      { trait: '@skeleton', relevance: 0.6, rationale: 'Anatomical skeleton visualization and animation for education.', configHint: 'armature: "humanoid"' },
    ],
  },

  // =========================================================================
  // 2. Education
  // =========================================================================
  {
    id: 'education',
    displayName: 'Education',
    description: 'Virtual classrooms, interactive lessons, 3D visualizations, and collaborative learning.',
    matchTags: ['education', 'learning', 'classroom', 'school', 'university', 'training', 'tutorial', 'lesson', 'academic'],
    traits: [
      { trait: '@voice_input', relevance: 1.0, rationale: 'Voice interaction for Q&A, answer recognition, and hands-free navigation.', configHint: 'language: "en-US", continuous: true' },
      { trait: '@voice_output', relevance: 0.95, rationale: 'Text-to-speech for narration, instructions, and accessibility.', configHint: 'rate: 0.9, volume: 1.0' },
      { trait: '@networked', relevance: 0.9, rationale: 'Multi-student collaborative environments and shared whiteboards.', configHint: 'owner: "server", syncRate: 20' },
      { trait: '@dialog', relevance: 0.85, rationale: 'Structured dialog trees for guided lessons and interactive quizzes.', configHint: 'autoAdvance: false, typewriterSpeed: 30' },
      { trait: '@animation', relevance: 0.85, rationale: 'Animated diagrams and step-by-step process visualization.', configHint: 'loop: true, easing: "easeInOut"' },
      { trait: '@accessible', relevance: 0.8, rationale: 'Inclusive design for diverse learners with different abilities.', configHint: 'screenReader: true, subtitles: true' },
      { trait: '@anchor', relevance: 0.75, rationale: 'AR overlays for textbook augmentation and lab simulations.', configHint: 'type: "image", persistent: false' },
      { trait: '@ai_driver', relevance: 0.7, rationale: 'AI tutors that adapt to student questions and learning pace.', configHint: 'model: "gpt-4", temperature: 0.5' },
      { trait: '@lobby', relevance: 0.65, rationale: 'Classroom session management and student grouping.', configHint: 'maxPlayers: 30, isPublic: false' },
      { trait: '@material', relevance: 0.6, rationale: 'Visual differentiation of interactive vs. static objects.', configHint: 'emissive: [0.2, 0.5, 1.0]' },
    ],
  },

  // =========================================================================
  // 3. Retail / E-Commerce
  // =========================================================================
  {
    id: 'retail',
    displayName: 'Retail & E-Commerce',
    description: 'Virtual showrooms, product configurators, AR try-on, and immersive shopping.',
    matchTags: ['retail', 'ecommerce', 'e-commerce', 'shopping', 'store', 'product', 'showroom', 'try-on', 'fashion'],
    traits: [
      { trait: '@hand_tracked', relevance: 1.0, rationale: 'Natural product interaction: pick up, rotate, inspect items.', configHint: 'precision: "medium"' },
      { trait: '@material', relevance: 0.95, rationale: 'Photorealistic product rendering with accurate PBR materials.', configHint: 'type: "standard", metalness: 0.9, roughness: 0.1' },
      { trait: '@anchor', relevance: 0.9, rationale: 'AR placement of furniture and products in the user\'s real environment.', configHint: 'type: "surface", persistent: true' },
      { trait: '@animation', relevance: 0.85, rationale: 'Product turntable animations and feature highlight transitions.', configHint: 'loop: true, duration: 3.0' },
      { trait: '@lighting', relevance: 0.8, rationale: 'Studio-quality lighting for product showcase and material accuracy.', configHint: 'type: "spot", castShadow: true' },
      { trait: '@lod', relevance: 0.8, rationale: 'Level-of-detail for large catalogs with many 3D products.', configHint: 'distances: [5, 15, 30]' },
      { trait: '@morph', relevance: 0.75, rationale: 'Color/style variants via morph targets for customizable products.', configHint: 'targets: ["color_red", "color_blue"]' },
      { trait: '@trigger', relevance: 0.7, rationale: 'Proximity-based product info pop-ups and recommendations.', configHint: 'shape: "sphere", radius: 2.0' },
      { trait: '@voice_input', relevance: 0.65, rationale: 'Voice search and hands-free shopping assistant.', configHint: 'language: "en-US"' },
      { trait: '@networked', relevance: 0.6, rationale: 'Social shopping: browse and discuss products with friends.', configHint: 'syncRate: 15' },
    ],
  },

  // =========================================================================
  // 4. Gaming
  // =========================================================================
  {
    id: 'gaming',
    displayName: 'Gaming',
    description: 'VR/AR games, multiplayer experiences, combat systems, and interactive worlds.',
    matchTags: ['gaming', 'game', 'multiplayer', 'pvp', 'rpg', 'fps', 'adventure', 'action', 'puzzle', 'arcade'],
    traits: [
      { trait: '@rigidbody', relevance: 1.0, rationale: 'Core physics for projectiles, player movement, and destructibles.', configHint: 'type: "dynamic", mass: 1.0' },
      { trait: '@networked', relevance: 0.95, rationale: 'Real-time multiplayer state sync for competitive and cooperative play.', configHint: 'owner: "server", syncRate: 30, priority: "high"' },
      { trait: '@character', relevance: 0.95, rationale: 'Player/NPC character controller with movement, jumping, and collision.', configHint: 'moveSpeed: 6.0, jumpForce: 8.0' },
      { trait: '@trigger', relevance: 0.9, rationale: 'Checkpoints, traps, loot zones, and area-of-effect regions.', configHint: 'shape: "sphere", layer: "player"' },
      { trait: '@skeleton', relevance: 0.85, rationale: 'Character animations: idle, walk, run, attack, death.', configHint: 'armature: "humanoid_rig"' },
      { trait: '@lobby', relevance: 0.85, rationale: 'Matchmaking, room management, and player sessions.', configHint: 'maxPlayers: 8, gameMode: "deathmatch"' },
      { trait: '@ai_driver', relevance: 0.8, rationale: 'Intelligent NPC enemies and quest givers with dynamic dialog.', configHint: 'temperature: 0.8, memory: true' },
      { trait: '@joint', relevance: 0.75, rationale: 'Destructible environments, doors, drawbridges, and mechanisms.', configHint: 'type: "hinge", breakForce: 500' },
      { trait: '@animation', relevance: 0.7, rationale: 'Object animations for collectibles, traps, and environmental storytelling.', configHint: 'loop: true, easing: "easeInOut"' },
      { trait: '@dialog', relevance: 0.65, rationale: 'Branching dialog trees for quests and NPC interactions.', configHint: 'startNode: "greeting"' },
    ],
  },

  // =========================================================================
  // 5. Architecture & Construction
  // =========================================================================
  {
    id: 'architecture',
    displayName: 'Architecture & Construction',
    description: 'Building walkthroughs, BIM visualization, construction planning, and design review.',
    matchTags: ['architecture', 'construction', 'building', 'bim', 'design', 'interior', 'floor-plan', 'blueprint', 'cad'],
    traits: [
      { trait: '@anchor', relevance: 1.0, rationale: 'Place architectural models at real-world scale on construction sites.', configHint: 'type: "surface", persistent: true' },
      { trait: '@material', relevance: 0.95, rationale: 'Accurate material representation for finishes, flooring, and facades.', configHint: 'type: "standard", map: "texture.jpg"' },
      { trait: '@lighting', relevance: 0.9, rationale: 'Daylight simulation and interior lighting design preview.', configHint: 'type: "directional", castShadow: true' },
      { trait: '@lod', relevance: 0.85, rationale: 'Level-of-detail for large building models with many components.', configHint: 'distances: [10, 50, 100, 200]' },
      { trait: '@hand_tracked', relevance: 0.8, rationale: 'Natural interaction for moving furniture, opening doors, adjusting elements.', configHint: 'precision: "medium"' },
      { trait: '@networked', relevance: 0.8, rationale: 'Multi-stakeholder design review sessions with real-time annotation.', configHint: 'owner: "shared", syncRate: 20' },
      { trait: '@trigger', relevance: 0.75, rationale: 'Room-entry triggers for automatic info overlays and measurements.', configHint: 'shape: "box", size: [5, 3, 5]' },
      { trait: '@rendering', relevance: 0.7, rationale: 'Custom render order for transparent glass, wireframe overlays.', configHint: 'transparent: true, renderOrder: 100' },
      { trait: '@animation', relevance: 0.65, rationale: 'Construction sequence animations showing build phases.', configHint: 'duration: 10.0, easing: "linear"' },
      { trait: '@voice_input', relevance: 0.6, rationale: 'Voice commands for navigating rooms and toggling layers.', configHint: 'continuous: false' },
    ],
  },

  // =========================================================================
  // 6. Manufacturing & Industrial
  // =========================================================================
  {
    id: 'manufacturing',
    displayName: 'Manufacturing & Industrial',
    description: 'Factory simulation, assembly training, digital twins, and equipment maintenance.',
    matchTags: ['manufacturing', 'industrial', 'factory', 'assembly', 'maintenance', 'digital-twin', 'iot', 'production'],
    traits: [
      { trait: '@hand_tracked', relevance: 1.0, rationale: 'Precise hand tracking for assembly practice and tool operation.', configHint: 'precision: "high"' },
      { trait: '@haptic', relevance: 0.95, rationale: 'Force feedback for torque simulation and snap-fit assembly steps.', configHint: 'intensity: 0.9, pattern: "click"' },
      { trait: '@joint', relevance: 0.9, rationale: 'Mechanical joints for hinges, sliders, and articulated machinery.', configHint: 'type: "hinge", axis: [0, 1, 0]' },
      { trait: '@rigidbody', relevance: 0.85, rationale: 'Physics for parts interaction, gravity, and collision detection.', configHint: 'type: "dynamic", mass: 5.0' },
      { trait: '@ik', relevance: 0.85, rationale: 'Robot arm IK for robotic assembly line simulation.', configHint: 'solver: "ccd", iterations: 15' },
      { trait: '@trigger', relevance: 0.8, rationale: 'Safety zone detection and step-by-step assembly guidance zones.', configHint: 'shape: "box", layer: "safety"' },
      { trait: '@networked', relevance: 0.75, rationale: 'Remote expert guidance and collaborative troubleshooting.', configHint: 'owner: "shared", syncRate: 20' },
      { trait: '@animation', relevance: 0.7, rationale: 'Step-by-step assembly/disassembly instruction animations.', configHint: 'autoplay: false, easing: "linear"' },
      { trait: '@voice_input', relevance: 0.7, rationale: 'Hands-free operation when wearing safety gloves.', configHint: 'continuous: true' },
      { trait: '@anchor', relevance: 0.65, rationale: 'AR overlays on real equipment for maintenance instructions.', configHint: 'type: "surface", persistent: true' },
    ],
  },

  // =========================================================================
  // 7. Entertainment & Media
  // =========================================================================
  {
    id: 'entertainment',
    displayName: 'Entertainment & Media',
    description: 'Virtual concerts, immersive cinema, themed experiences, and interactive storytelling.',
    matchTags: ['entertainment', 'media', 'concert', 'cinema', 'movie', 'music', 'show', 'theater', 'performance', 'event'],
    traits: [
      { trait: '@animation', relevance: 1.0, rationale: 'Choreographed animations for performances and cinematic sequences.', configHint: 'loop: false, duration: 120.0' },
      { trait: '@lighting', relevance: 0.95, rationale: 'Dynamic stage lighting, spotlights, and mood effects.', configHint: 'type: "spot", color: [1, 0.5, 0.8]' },
      { trait: '@shader', relevance: 0.9, rationale: 'Custom visual effects: holograms, particle screens, volumetric fog.', configHint: 'fragment: "shaders/volumetric.frag"' },
      { trait: '@networked', relevance: 0.9, rationale: 'Large-scale multiplayer events with thousands of concurrent viewers.', configHint: 'owner: "server", syncRate: 10, priority: "high"' },
      { trait: '@voice_output', relevance: 0.85, rationale: 'Narration, character dialog, and AI-generated commentary.', configHint: 'voice: "en-US-GuyNeural"' },
      { trait: '@skeleton', relevance: 0.8, rationale: 'Character and performer skeletal animation for mocap playback.', configHint: 'armature: "humanoid_rig"' },
      { trait: '@morph', relevance: 0.75, rationale: 'Facial expressions and lip sync for virtual performers.', configHint: 'targets: ["smile", "blink_l", "blink_r"]' },
      { trait: '@trigger', relevance: 0.7, rationale: 'Audience interaction zones for voting, cheering, and participation.', configHint: 'shape: "box", size: [20, 5, 20]' },
      { trait: '@lobby', relevance: 0.65, rationale: 'Event session management and capacity control.', configHint: 'maxPlayers: 100, isPublic: true' },
      { trait: '@material', relevance: 0.6, rationale: 'Emissive materials for screens, signage, and glowing props.', configHint: 'emissive: [1, 1, 1], emissiveIntensity: 5.0' },
    ],
  },

  // =========================================================================
  // 8. Real Estate
  // =========================================================================
  {
    id: 'real-estate',
    displayName: 'Real Estate',
    description: 'Virtual property tours, staged homes, neighborhood previews, and remote viewings.',
    matchTags: ['real-estate', 'realestate', 'property', 'home', 'house', 'apartment', 'tour', 'staging', 'realtor'],
    traits: [
      { trait: '@lighting', relevance: 1.0, rationale: 'Natural daylight simulation to showcase rooms at different times.', configHint: 'type: "directional", castShadow: true, intensity: 1.5' },
      { trait: '@material', relevance: 0.95, rationale: 'Photorealistic surfaces for flooring, countertops, and finishes.', configHint: 'type: "standard", roughness: 0.3' },
      { trait: '@anchor', relevance: 0.9, rationale: 'AR furniture placement to visualize empty rooms furnished.', configHint: 'type: "surface", persistent: true' },
      { trait: '@lod', relevance: 0.85, rationale: 'Optimized rendering for full-house tours with many detailed rooms.', configHint: 'distances: [5, 15, 30]' },
      { trait: '@trigger', relevance: 0.8, rationale: 'Room-by-room info cards triggered on entry during virtual tours.', configHint: 'shape: "box", size: [4, 3, 4]' },
      { trait: '@voice_output', relevance: 0.8, rationale: 'AI-narrated property descriptions as the viewer explores.', configHint: 'rate: 0.9' },
      { trait: '@animation', relevance: 0.75, rationale: 'Door opening, curtain drawing, and daylight cycling animations.', configHint: 'easing: "easeInOut"' },
      { trait: '@networked', relevance: 0.7, rationale: 'Real-time co-viewing with real estate agent and buyers.', configHint: 'owner: "shared", syncRate: 15' },
      { trait: '@rendering', relevance: 0.65, rationale: 'High-quality shadow and reflection settings for interior realism.', configHint: 'castShadow: true, receiveShadow: true' },
      { trait: '@hand_tracked', relevance: 0.6, rationale: 'Open doors, drawers, and interact with fixtures during tours.', configHint: 'precision: "medium"' },
    ],
  },

  // =========================================================================
  // 9. Fitness & Sports
  // =========================================================================
  {
    id: 'fitness',
    displayName: 'Fitness & Sports',
    description: 'VR workouts, sports training, motion analysis, and performance coaching.',
    matchTags: ['fitness', 'sports', 'workout', 'exercise', 'gym', 'athletic', 'training', 'yoga', 'boxing', 'dance'],
    traits: [
      { trait: '@hand_tracked', relevance: 1.0, rationale: 'Track hand/arm movements for exercise form analysis.', configHint: 'precision: "high"' },
      { trait: '@skeleton', relevance: 0.95, rationale: 'Full-body skeleton tracking for pose estimation and correction.', configHint: 'armature: "humanoid"' },
      { trait: '@ik', relevance: 0.9, rationale: 'Mirror avatar that matches user body positions in real time.', configHint: 'solver: "full-body", iterations: 15' },
      { trait: '@haptic', relevance: 0.85, rationale: 'Rhythm feedback for beat-based workouts and timing cues.', configHint: 'pattern: "pulse", intensity: 0.7' },
      { trait: '@character', relevance: 0.8, rationale: 'Player avatar controller for VR movement-based games.', configHint: 'moveSpeed: 3.0' },
      { trait: '@voice_output', relevance: 0.8, rationale: 'AI coaching instructions and motivational prompts.', configHint: 'rate: 1.1, pitch: 1.0' },
      { trait: '@trigger', relevance: 0.75, rationale: 'Target zones for punch/kick accuracy and score regions.', configHint: 'shape: "sphere", radius: 0.3' },
      { trait: '@animation', relevance: 0.7, rationale: 'Instructor demonstration animations for proper form.', configHint: 'loop: true' },
      { trait: '@networked', relevance: 0.65, rationale: 'Competitive multiplayer workouts and leaderboards.', configHint: 'syncRate: 20' },
      { trait: '@rigidbody', relevance: 0.6, rationale: 'Physics for punching bags, balls, and interactive equipment.', configHint: 'type: "dynamic", mass: 2.0' },
    ],
  },

  // =========================================================================
  // 10. Social / Metaverse
  // =========================================================================
  {
    id: 'social',
    displayName: 'Social & Metaverse',
    description: 'Social VR spaces, virtual meetups, avatar customization, and community hubs.',
    matchTags: ['social', 'metaverse', 'community', 'avatar', 'meetup', 'chat', 'hangout', 'virtual-world', 'vr-chat'],
    traits: [
      { trait: '@networked', relevance: 1.0, rationale: 'Core requirement: real-time multi-user presence and interaction.', configHint: 'owner: "client", syncRate: 30, interpolate: true' },
      { trait: '@skeleton', relevance: 0.95, rationale: 'Avatar body animation for expressive social presence.', configHint: 'armature: "humanoid_rig"' },
      { trait: '@morph', relevance: 0.9, rationale: 'Facial expressions and lip sync for avatar communication.', configHint: 'targets: ["smile", "frown", "blink_l", "blink_r"]' },
      { trait: '@hand_tracked', relevance: 0.9, rationale: 'Hand gestures for waving, pointing, and object interaction.', configHint: 'precision: "medium"' },
      { trait: '@voice_input', relevance: 0.85, rationale: 'Spatial voice chat for natural conversation.', configHint: 'continuous: true' },
      { trait: '@lobby', relevance: 0.85, rationale: 'Room creation, friend invites, and session management.', configHint: 'maxPlayers: 20, isPublic: true' },
      { trait: '@ik', relevance: 0.8, rationale: 'Full-body IK for avatar seated poses and hand placement.', configHint: 'solver: "full-body"' },
      { trait: '@material', relevance: 0.7, rationale: 'Avatar customization with varied material appearances.', configHint: 'color: [0.8, 0.6, 0.4]' },
      { trait: '@trigger', relevance: 0.65, rationale: 'Social zones: dance floors, stages, private areas.', configHint: 'shape: "box"' },
      { trait: '@animation', relevance: 0.6, rationale: 'Emote animations and gesture library for self-expression.', configHint: 'autoplay: false' },
    ],
  },

  // =========================================================================
  // 11. Art & Museums
  // =========================================================================
  {
    id: 'art',
    displayName: 'Art & Museums',
    description: 'Virtual galleries, museum tours, interactive exhibitions, and art creation tools.',
    matchTags: ['art', 'museum', 'gallery', 'exhibition', 'sculpture', 'painting', 'curator', 'installation', 'creative'],
    traits: [
      { trait: '@lighting', relevance: 1.0, rationale: 'Gallery-grade lighting for accurate artwork presentation.', configHint: 'type: "spot", color: [1, 0.97, 0.92], castShadow: true' },
      { trait: '@material', relevance: 0.95, rationale: 'Faithful material reproduction for canvas texture, metal, glass.', configHint: 'type: "standard", roughness: 0.8' },
      { trait: '@artwork_metadata', relevance: 0.9, rationale: 'Artwork info cards with title, artist, year, and description.', configHint: 'interaction_type: "inspect"' },
      { trait: '@voice_output', relevance: 0.85, rationale: 'Audio guide narration for exhibits and artwork descriptions.', configHint: 'voice: "en-US-GuyNeural", rate: 0.85' },
      { trait: '@trigger', relevance: 0.85, rationale: 'Proximity triggers for automatic audio guide and info display.', configHint: 'shape: "sphere", radius: 2.0' },
      { trait: '@anchor', relevance: 0.8, rationale: 'AR placement of artworks in the viewer\'s physical space.', configHint: 'type: "wall", persistent: true' },
      { trait: '@animation', relevance: 0.75, rationale: 'Interactive kinetic art and time-lapse creation replays.', configHint: 'loop: true, easing: "easeInOut"' },
      { trait: '@hand_tracked', relevance: 0.7, rationale: 'Sculpting tools and interactive art creation in VR.', configHint: 'precision: "high"' },
      { trait: '@networked', relevance: 0.65, rationale: 'Guided group tours with a curator avatar.', configHint: 'owner: "server", syncRate: 15' },
      { trait: '@lod', relevance: 0.6, rationale: 'Optimized rendering for large galleries with many high-res works.', configHint: 'distances: [3, 10, 25]' },
    ],
  },

  // =========================================================================
  // 12. Automotive
  // =========================================================================
  {
    id: 'automotive',
    displayName: 'Automotive',
    description: 'Vehicle configurators, showrooms, driving simulation, and maintenance training.',
    matchTags: ['automotive', 'car', 'vehicle', 'driving', 'automobile', 'showroom', 'configurator', 'motor'],
    traits: [
      { trait: '@material', relevance: 1.0, rationale: 'Automotive paint, chrome, leather, and glass rendering.', configHint: 'metalness: 0.95, roughness: 0.05, color: [0.8, 0, 0]' },
      { trait: '@lighting', relevance: 0.95, rationale: 'HDRI environment lighting for accurate vehicle reflections.', configHint: 'type: "area", intensity: 2.0, castShadow: true' },
      { trait: '@animation', relevance: 0.9, rationale: 'Door opening, hood lifting, trunk, and convertible top animations.', configHint: 'easing: "easeInOut", duration: 1.5' },
      { trait: '@joint', relevance: 0.85, rationale: 'Hinge joints for doors, steering wheel, and suspension.', configHint: 'type: "hinge", axis: [0, 1, 0]' },
      { trait: '@hand_tracked', relevance: 0.85, rationale: 'Open doors, adjust mirrors, interact with dashboard controls.', configHint: 'precision: "medium"' },
      { trait: '@rigidbody', relevance: 0.8, rationale: 'Vehicle physics for driving simulation and crash testing.', configHint: 'type: "dynamic", mass: 1500' },
      { trait: '@morph', relevance: 0.75, rationale: 'Color and trim variants for vehicle configuration.', configHint: 'targets: ["color_variant_1", "trim_sport"]' },
      { trait: '@lod', relevance: 0.7, rationale: 'Multi-LOD for detailed exterior/interior vs. distant views.', configHint: 'distances: [5, 20, 50]' },
      { trait: '@anchor', relevance: 0.65, rationale: 'AR placement of vehicle in customer\'s driveway or garage.', configHint: 'type: "surface", persistent: true' },
      { trait: '@voice_input', relevance: 0.6, rationale: 'Voice commands for configuration: "Show red exterior" / "Open trunk".', configHint: 'language: "en-US"' },
    ],
  },

  // =========================================================================
  // 13. Aerospace & Defense
  // =========================================================================
  {
    id: 'aerospace',
    displayName: 'Aerospace & Defense',
    description: 'Flight simulation, mission planning, equipment training, and cockpit interfaces.',
    matchTags: ['aerospace', 'defense', 'military', 'aviation', 'flight', 'cockpit', 'simulation', 'drone', 'satellite'],
    traits: [
      { trait: '@rigidbody', relevance: 1.0, rationale: 'Flight dynamics, ballistics, and zero-gravity simulation.', configHint: 'type: "dynamic", gravityScale: 0' },
      { trait: '@hand_tracked', relevance: 0.95, rationale: 'Cockpit instrument interaction and equipment handling.', configHint: 'precision: "high"' },
      { trait: '@haptic', relevance: 0.9, rationale: 'Control stick force feedback and switch tactile response.', configHint: 'intensity: 1.0, pattern: "constant"' },
      { trait: '@ik', relevance: 0.85, rationale: 'Seated pilot IK for reach analysis and cockpit ergonomics.', configHint: 'solver: "two-bone"' },
      { trait: '@networked', relevance: 0.85, rationale: 'Multi-crew simulation and coordinated mission planning.', configHint: 'owner: "server", syncRate: 30, priority: "high"' },
      { trait: '@voice_input', relevance: 0.8, rationale: 'Voice-activated cockpit commands and radio communication.', configHint: 'continuous: true, confidenceThreshold: 0.9' },
      { trait: '@trigger', relevance: 0.75, rationale: 'Airspace zones, waypoints, and restricted area boundaries.', configHint: 'shape: "sphere", radius: 500' },
      { trait: '@shader', relevance: 0.7, rationale: 'HUD overlays, radar displays, and targeting reticles.', configHint: 'fragment: "shaders/hud.frag"' },
      { trait: '@joint', relevance: 0.7, rationale: 'Control surfaces, landing gear, and articulated mechanisms.', configHint: 'type: "hinge", maxLimit: 30' },
      { trait: '@animation', relevance: 0.65, rationale: 'Landing gear deployment, flap extension, and missile sequences.', configHint: 'autoplay: false' },
    ],
  },

  // =========================================================================
  // 14. Tourism & Hospitality
  // =========================================================================
  {
    id: 'tourism',
    displayName: 'Tourism & Hospitality',
    description: 'Virtual travel, hotel previews, destination exploration, and cultural heritage.',
    matchTags: ['tourism', 'hospitality', 'travel', 'hotel', 'destination', 'heritage', 'sightseeing', 'vacation', 'resort'],
    traits: [
      { trait: '@voice_output', relevance: 1.0, rationale: 'Multilingual tour guide narration for landmarks and sites.', configHint: 'rate: 0.9, volume: 1.0' },
      { trait: '@lighting', relevance: 0.95, rationale: 'Golden hour, sunset, and nighttime atmosphere for destinations.', configHint: 'type: "directional", color: [1, 0.85, 0.6]' },
      { trait: '@trigger', relevance: 0.9, rationale: 'Point-of-interest triggers as visitors approach landmarks.', configHint: 'shape: "sphere", radius: 5.0' },
      { trait: '@material', relevance: 0.85, rationale: 'Photorealistic environment materials for authentic location feel.', configHint: 'type: "standard"' },
      { trait: '@animation', relevance: 0.85, rationale: 'Ambient animations: waves, birds, clouds, and flag movement.', configHint: 'loop: true, easing: "linear"' },
      { trait: '@lod', relevance: 0.8, rationale: 'Large-scale terrain and cityscape level-of-detail management.', configHint: 'distances: [50, 150, 500, 1000]' },
      { trait: '@anchor', relevance: 0.75, rationale: 'AR overlays on real landmarks with historical information.', configHint: 'type: "geo", persistent: false' },
      { trait: '@npc_behavior', relevance: 0.7, rationale: 'Virtual tour guide NPCs that lead groups through sites.', configHint: 'interaction_radius: 5, greeting: "Welcome!"' },
      { trait: '@networked', relevance: 0.65, rationale: 'Group virtual tours with shared guide experience.', configHint: 'owner: "server", syncRate: 15' },
      { trait: '@voice_input', relevance: 0.6, rationale: 'Voice questions for interactive tour guide responses.', configHint: 'language: "en-US"' },
    ],
  },

  // =========================================================================
  // 15. Robotics & IoT
  // =========================================================================
  {
    id: 'robotics',
    displayName: 'Robotics & IoT',
    description: 'Robot simulation, sensor visualization, digital twins, and teleoperation interfaces.',
    matchTags: ['robotics', 'iot', 'robot', 'sensor', 'teleoperation', 'ros', 'drone', 'automation', 'actuator', 'digital-twin'],
    traits: [
      { trait: '@ik', relevance: 1.0, rationale: 'Robot arm inverse kinematics for joint-space control simulation.', configHint: 'solver: "ccd", iterations: 30, tolerance: 0.0001' },
      { trait: '@joint', relevance: 0.95, rationale: 'Articulated joints for robot arms, grippers, and actuators.', configHint: 'type: "hinge", axis: [0, 0, 1]' },
      { trait: '@rigidbody', relevance: 0.9, rationale: 'Physics simulation for object manipulation and collision avoidance.', configHint: 'type: "kinematic"' },
      { trait: '@hand_tracked', relevance: 0.85, rationale: 'Teleoperation: map human hand movements to robot end-effectors.', configHint: 'precision: "high"' },
      { trait: '@networked', relevance: 0.85, rationale: 'Real-time data streaming between robot and digital twin.', configHint: 'owner: "server", syncRate: 60, priority: "high"' },
      { trait: '@trigger', relevance: 0.8, rationale: 'Workspace boundaries, safety zones, and collision warning regions.', configHint: 'shape: "box", layer: "safety"' },
      { trait: '@shader', relevance: 0.7, rationale: 'Sensor data visualization: point clouds, depth maps, heat maps.', configHint: 'fragment: "shaders/pointcloud.frag"' },
      { trait: '@animation', relevance: 0.65, rationale: 'Pre-programmed motion paths and trajectory visualization.', configHint: 'autoplay: false, easing: "linear"' },
      { trait: '@haptic', relevance: 0.65, rationale: 'Force feedback for teleoperated grasping and manipulation.', configHint: 'intensity: 0.8' },
      { trait: '@anchor', relevance: 0.6, rationale: 'AR overlay of digital twin on physical robot for alignment.', configHint: 'type: "marker", persistent: true' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Lookup Helpers
// ---------------------------------------------------------------------------

/** Map of vertical ID to its mapping for O(1) lookup */
const verticalById = new Map<string, VerticalMapping>(
  VERTICAL_MAPPINGS.map((v) => [v.id, v]),
);

/** Flattened tag-to-vertical index for fast tag matching */
const tagToVerticals = new Map<string, VerticalMapping[]>();
for (const v of VERTICAL_MAPPINGS) {
  for (const tag of v.matchTags) {
    const existing = tagToVerticals.get(tag) || [];
    existing.push(v);
    tagToVerticals.set(tag, existing);
  }
}

/**
 * Look up a vertical by its exact ID (e.g., "healthcare").
 */
export function getVerticalById(id: string): VerticalMapping | undefined {
  return verticalById.get(id.toLowerCase());
}

/**
 * Find matching verticals from a list of tags.
 * Returns unique verticals sorted by the number of matching tags (most matches first).
 */
export function findVerticalsByTags(tags: string[]): VerticalMapping[] {
  const matchCounts = new Map<string, { vertical: VerticalMapping; count: number }>();

  for (const tag of tags) {
    const normalised = tag.toLowerCase().replace(/\s+/g, '-');
    const matches = tagToVerticals.get(normalised);
    if (matches) {
      for (const v of matches) {
        const existing = matchCounts.get(v.id);
        if (existing) {
          existing.count++;
        } else {
          matchCounts.set(v.id, { vertical: v, count: 1 });
        }
      }
    }
  }

  return Array.from(matchCounts.values())
    .sort((a, b) => b.count - a.count)
    .map((entry) => entry.vertical);
}

/**
 * Get all available vertical IDs.
 */
export function getAllVerticalIds(): string[] {
  return VERTICAL_MAPPINGS.map((v) => v.id);
}

/**
 * Get all available vertical display names with their IDs.
 */
export function getAllVerticals(): Array<{ id: string; displayName: string }> {
  return VERTICAL_MAPPINGS.map((v) => ({ id: v.id, displayName: v.displayName }));
}
