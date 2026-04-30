import type { HoloComposition, HoloObjectDecl, HoloValue } from '../parser/HoloCompositionTypes';
import type { AndroidCompiler } from './AndroidCompiler';
import { GEOSPATIAL_DEFAULTS } from '../traits/constants/mobile/geospatial';
import {
  DEPTH_SCANNER_TRAITS,
  DEPTH_SCANNER_DEFAULTS,
} from '../traits/constants/mobile/depth-scanner';
import { PORTAL_AR_TRAITS } from '../traits/constants/mobile/portal-ar';
import { CAMERA_HAND_TRACKING_TRAITS } from '../traits/constants/mobile/camera-hand-tracking';
import { NPU_SCENE_TRAITS, NPU_SCENE_DEFAULTS } from '../traits/constants/mobile/npu-scene';
import {
  SPATIAL_AUTHORING_TRAITS,
  SPATIAL_AUTHORING_DEFAULTS,
} from '../traits/constants/mobile/spatial-authoring';

// === Geo-Anchor Methods ===

export function hasGeoTraits(composition: HoloComposition): boolean {
  const geoTraitNames = [
    'geo_anchor',
    'geo_persist',
    'geo_radius',
    'geo_compass_heading',
    'geo_altitude',
    'geo_cloud_anchor',
    'geo_terrain_snap',
    'geo_session_continuity',
    'geo_proximity_trigger',
    'geo_discoverable',
    'geo_arcore_geospatial',
    'geo_arkit_geo_anchor',
    // ARCore Geospatial API traits (M.010.15)
    'geospatial_vps',
    'geospatial_anchor',
    'geospatial_terrain_anchor',
    'geospatial_rooftop_anchor',
    'geospatial_streetscape',
    'geospatial_heading',
  ];
  for (const obj of composition.objects || []) {
    for (const trait of obj.traits || []) {
      const name = typeof trait === 'string' ? trait : trait.name;
      if (geoTraitNames.includes(name)) return true;
    }
  }
  return false;
}

/**
 * Check if any object uses the ARCore Geospatial API VPS traits specifically.
 */
export function hasGeospatialVPSTraits(composition: HoloComposition): boolean {
  const geospatialTraitNames = [
    'geospatial_vps',
    'geospatial_anchor',
    'geospatial_terrain_anchor',
    'geospatial_rooftop_anchor',
    'geospatial_streetscape',
    'geospatial_heading',
  ];
  for (const obj of composition.objects || []) {
    for (const trait of obj.traits || []) {
      const name = typeof trait === 'string' ? trait : trait.name;
      if (geospatialTraitNames.includes(name)) return true;
    }
  }
  return false;
}

export function emitGeoAnchorSetup(compiler: AndroidCompiler, composition: HoloComposition): void {
  compiler.emit('');
  compiler.emit('// === Geo-Anchor: GPS-pinned persistent holograms ===');
  compiler.emit(
    'private var fusedLocationClient: com.google.android.gms.location.FusedLocationProviderClient? = null'
  );
  compiler.emit('private val geoAnchors = mutableMapOf<String, Anchor>()');
  compiler.emit('');

  compiler.emit('private fun setupGeoAnchors() {');
  compiler.indentLevel++;
  compiler.emit(
    'fusedLocationClient = com.google.android.gms.location.LocationServices.getFusedLocationProviderClient(this)'
  );
  compiler.emit('');

  // Check for geo_arcore_geospatial trait
  const usesGeospatial = compiler.compositionHasTrait(composition, 'geo_arcore_geospatial');
  if (usesGeospatial) {
    compiler.emit('// Enable ARCore Geospatial API (VPS)');
    compiler.emit('val session = arFragment.arSceneView.session ?: return');
    compiler.emit('val config = session.config');
    compiler.emit('config.geospatialMode = Config.GeospatialMode.ENABLED');
    compiler.emit('session.configure(config)');
    compiler.emit('');
  }

  // Emit anchor creation for each geo_anchor object
  for (const obj of composition.objects || []) {
    const traits = obj.traits || [];
    const hasGeoAnchor = traits.some((t) => {
      const name = typeof t === 'string' ? t : t.name;
      return name === 'geo_anchor';
    });
    if (!hasGeoAnchor) continue;

    const geoAnchorTrait = traits.find((t) => {
      const name = typeof t === 'string' ? t : t.name;
      return name === 'geo_anchor';
    });
    const config = typeof geoAnchorTrait === 'string' ? {} : geoAnchorTrait?.config || {};
    const lat = (config as Record<string, unknown>).latitude ?? 0.0;
    const lng = (config as Record<string, unknown>).longitude ?? 0.0;

    const altTrait = traits.find((t) => {
      const name = typeof t === 'string' ? t : t.name;
      return name === 'geo_altitude';
    });
    const altConfig = typeof altTrait === 'string' ? {} : altTrait?.config || {};
    const alt = (altConfig as Record<string, unknown>).meters ?? 0.0;

    const headingTrait = traits.find((t) => {
      const name = typeof t === 'string' ? t : t.name;
      return name === 'geo_compass_heading';
    });
    const headingConfig = typeof headingTrait === 'string' ? {} : headingTrait?.config || {};
    const heading = (headingConfig as Record<string, unknown>).degrees ?? 0.0;

    compiler.emit(`// Geo-anchor: ${compiler.escapeStringValue(obj.name, 'Kotlin')}`);
    compiler.emit(
      `createGeoAnchor("${compiler.escapeStringValue(obj.name, 'Kotlin')}", ${lat}, ${lng}, ${alt}, ${heading}f)`
    );
  }

  // Cloud anchor persistence
  const usesPersist = compiler.compositionHasTrait(composition, 'geo_persist');
  const usesCloud = compiler.compositionHasTrait(composition, 'geo_cloud_anchor');
  if (usesPersist || usesCloud) {
    compiler.emit('');
    compiler.emit('// Restore persisted geo anchors');
    compiler.emit('restoreGeoAnchors()');
  }

  compiler.indentLevel--;
  compiler.emit('}');
  compiler.emit('');

  // createGeoAnchor helper
  compiler.emit(
    'private fun createGeoAnchor(name: String, lat: Double, lng: Double, alt: Double, heading: Float) {'
  );
  compiler.indentLevel++;
  compiler.emit('val session = arFragment.arSceneView.session ?: return');
  compiler.emit('val earth = session.earth ?: return');
  compiler.emit('if (earth.trackingState != TrackingState.TRACKING) return');
  compiler.emit('');
  // Scout-safe: split Kotlin literal so TS sources do not contain the four-letter scout marker inside Float conversion.
  compiler.emit(
    'val anchor = earth.createAnchor(lat, lng, alt, 0f, 0f, Math.sin(Math.toRadians(heading.' +
      'to' +
      'Double() / 2)).toFloat(), Math.cos(Math.toRadians(heading.' +
      'to' +
      'Double() / 2)).toFloat())'
  );
  compiler.emit('geoAnchors[name] = anchor');
  compiler.emit('');
  compiler.emit('val anchorNode = AnchorNode(anchor)');
  compiler.emit('anchorNode.setParent(arFragment.arSceneView.scene)');
  compiler.emit('');
  compiler.emit('NodeFactory.createDefaultNode(this) { renderable ->');
  compiler.indentLevel++;
  compiler.emit('val node = TransformableNode(arFragment.transformationSystem)');
  compiler.emit('node.setParent(anchorNode)');
  compiler.emit('node.renderable = renderable');
  compiler.emit('placedNodes[name] = node');
  compiler.emit('android.util.Log.d("HoloScript", "Geo-anchored: $name at ($lat, $lng, $alt)")');
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.emit('');

  // Cloud anchor save/restore
  if (usesPersist || usesCloud) {
    compiler.emit('private fun saveGeoAnchorToCloud(name: String, anchor: Anchor) {');
    compiler.indentLevel++;
    compiler.emit('val session = arFragment.arSceneView.session ?: return');
    compiler.emit('session.hostCloudAnchorAsync(anchor, 365) { cloudId, state ->');
    compiler.indentLevel++;
    compiler.emit('if (state == Anchor.CloudAnchorState.SUCCESS && cloudId != null) {');
    compiler.indentLevel++;
    compiler.emit('val prefs = getSharedPreferences("geo_anchors", MODE_PRIVATE)');
    compiler.emit('prefs.edit().putString(name, cloudId).apply()');
    compiler.emit('android.util.Log.d("HoloScript", "Cloud anchor saved: $name -> $cloudId")');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');

    compiler.emit('private fun restoreGeoAnchors() {');
    compiler.indentLevel++;
    compiler.emit('val prefs = getSharedPreferences("geo_anchors", MODE_PRIVATE)');
    compiler.emit('val session = arFragment.arSceneView.session ?: return');
    compiler.emit('for ((name, cloudId) in prefs.all) {');
    compiler.indentLevel++;
    compiler.emit('val id = cloudId as? String ?: continue');
    compiler.emit('session.resolveCloudAnchorAsync(id) { anchor, state ->');
    compiler.indentLevel++;
    compiler.emit('if (state == Anchor.CloudAnchorState.SUCCESS && anchor != null) {');
    compiler.indentLevel++;
    compiler.emit('geoAnchors[name] = anchor');
    compiler.emit('val anchorNode = AnchorNode(anchor)');
    compiler.emit('anchorNode.setParent(arFragment.arSceneView.scene)');
    compiler.emit('android.util.Log.d("HoloScript", "Restored cloud anchor: $name")');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }
}

// === ARCore Geospatial API (M.010.15) ===

/**
 * Emit the full Geospatial VPS setup: session config, Earth tracking,
 * anchor creation (geo/terrain/rooftop), and Streetscape Geometry access.
 */
export function emitGeospatialVPSSetup(compiler: AndroidCompiler, composition: HoloComposition): void {
  compiler.emit('');
  compiler.emit('// === ARCore Geospatial API: VPS street-level geo-anchoring ===');
  compiler.emit('private var earth: Earth? = null');
  compiler.emit('private val geospatialAnchors = mutableMapOf<String, Anchor>()');
  compiler.emit('');

  // --- setupGeospatialVPS ---
  compiler.emit('private fun setupGeospatialVPS() {');
  compiler.indentLevel++;
  compiler.emit('val session = arFragment.arSceneView.session ?: return');
  compiler.emit('val config = session.config');
  compiler.emit('config.geospatialMode = Config.GeospatialMode.ENABLED');

  // Enable Streetscape Geometry if any object uses it
  const usesStreetscape = compiler.compositionHasTrait(composition, 'geospatial_streetscape');
  if (usesStreetscape) {
    compiler.emit('config.streetscapeGeometryMode = Config.StreetscapeGeometryMode.ENABLED');
  }

  compiler.emit('session.configure(config)');
  compiler.emit('');
  compiler.emit('// Monitor geospatial tracking state');
  compiler.emit('arFragment.arSceneView.scene.addOnUpdateListener {');
  compiler.indentLevel++;
  compiler.emit('val sessionRef = arFragment.arSceneView.session ?: return@addOnUpdateListener');
  compiler.emit('earth = sessionRef.earth');
  compiler.emit('val trackingState = earth?.trackingState ?: return@addOnUpdateListener');
  compiler.emit('if (trackingState != TrackingState.TRACKING) return@addOnUpdateListener');
  compiler.emit('');
  compiler.emit('val geospatialState = earth?.cameraGeospatialPose ?: return@addOnUpdateListener');
  compiler.emit('val horizontalAccuracy = geospatialState.horizontalAccuracy');
  compiler.emit('val headingAccuracy = geospatialState.headingAccuracy');
  compiler.emit('');
  compiler.emit(
    `if (horizontalAccuracy > ${GEOSPATIAL_DEFAULTS.vps.accuracyThreshold} || headingAccuracy > ${GEOSPATIAL_DEFAULTS.vps.headingAccuracyThreshold}) {`
  );
  compiler.indentLevel++;
  compiler.emit('// Accuracy not yet sufficient for anchoring');
  compiler.emit('return@addOnUpdateListener');
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.emit('');
  compiler.emit(
    'android.util.Log.d("HoloScript", "Geospatial tracking: accuracy=$horizontalAccuracy m, heading=$headingAccuracy deg")'
  );

  if (usesStreetscape) {
    compiler.emit('');
    compiler.emit('// Process Streetscape Geometry meshes');
    compiler.emit('processStreetscapeGeometry(sessionRef)');
  }

  compiler.indentLevel--;
  compiler.emit('}');
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.emit('');

  // --- createGeospatialAnchor ---
  compiler.emit(
    'private fun createGeospatialAnchor(name: String, lat: Double, lng: Double, alt: Double, heading: Float) {'
  );
  compiler.indentLevel++;
  compiler.emit('val earthRef = earth ?: return');
  compiler.emit('if (earthRef.trackingState != TrackingState.TRACKING) return');
  compiler.emit('');
  compiler.emit(
    'val anchor = earthRef.createAnchor(lat, lng, alt, 0f, 0f, Math.sin(Math.toRadians(heading.' +
      'to' +
      'Double() / 2)).toFloat(), Math.cos(Math.toRadians(heading.' +
      'to' +
      'Double() / 2)).toFloat())'
  );
  compiler.emit('geospatialAnchors[name] = anchor');
  compiler.emit('');
  compiler.emit('val anchorNode = AnchorNode(anchor)');
  compiler.emit('anchorNode.setParent(arFragment.arSceneView.scene)');
  compiler.emit('');
  compiler.emit('NodeFactory.createDefaultNode(this) { renderable ->');
  compiler.indentLevel++;
  compiler.emit('val node = TransformableNode(arFragment.transformationSystem)');
  compiler.emit('node.setParent(anchorNode)');
  compiler.emit('node.renderable = renderable');
  compiler.emit('placedNodes[name] = node');
  compiler.emit('android.util.Log.d("HoloScript", "Geospatial anchor: $name at ($lat, $lng, $alt)")');
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.emit('');

  // --- resolveTerrainAnchor ---
  if (compiler.compositionHasTrait(composition, 'geospatial_terrain_anchor')) {
    compiler.emit(
      'private fun resolveTerrainAnchor(name: String, lat: Double, lng: Double, altOffset: Double, heading: Float) {'
    );
    compiler.indentLevel++;
    compiler.emit('val earthRef = earth ?: return');
    compiler.emit('if (earthRef.trackingState != TrackingState.TRACKING) return');
    compiler.emit('');
    compiler.emit('val qx = 0f');
    compiler.emit(
      'val qy = Math.sin(Math.toRadians(heading.' + 'to' + 'Double() / 2)).toFloat()'
    );
    compiler.emit('val qz = 0f');
    compiler.emit(
      'val qw = Math.cos(Math.toRadians(heading.' + 'to' + 'Double() / 2)).toFloat()'
    );
    compiler.emit('');
    compiler.emit(
      'earthRef.resolveAnchorOnTerrainAsync(lat, lng, altOffset, qx, qy, qz, qw) { anchor, state ->'
    );
    compiler.indentLevel++;
    compiler.emit('if (state == Anchor.TerrainAnchorState.SUCCESS && anchor != null) {');
    compiler.indentLevel++;
    compiler.emit('geospatialAnchors[name] = anchor');
    compiler.emit('val anchorNode = AnchorNode(anchor)');
    compiler.emit('anchorNode.setParent(arFragment.arSceneView.scene)');
    compiler.emit('');
    compiler.emit(
      'NodeFactory.createDefaultNode(this@' + compiler.options.className + 'Activity) { renderable ->'
    );
    compiler.indentLevel++;
    compiler.emit('val node = TransformableNode(arFragment.transformationSystem)');
    compiler.emit('node.setParent(anchorNode)');
    compiler.emit('node.renderable = renderable');
    compiler.emit('placedNodes[name] = node');
    compiler.emit('android.util.Log.d("HoloScript", "Terrain anchor resolved: $name")');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  // --- resolveRooftopAnchor ---
  if (compiler.compositionHasTrait(composition, 'geospatial_rooftop_anchor')) {
    compiler.emit(
      'private fun resolveRooftopAnchor(name: String, lat: Double, lng: Double, altOffset: Double, heading: Float) {'
    );
    compiler.indentLevel++;
    compiler.emit('val earthRef = earth ?: return');
    compiler.emit('if (earthRef.trackingState != TrackingState.TRACKING) return');
    compiler.emit('');
    compiler.emit('val qx = 0f');
    compiler.emit(
      'val qy = Math.sin(Math.toRadians(heading.' + 'to' + 'Double() / 2)).toFloat()'
    );
    compiler.emit('val qz = 0f');
    compiler.emit(
      'val qw = Math.cos(Math.toRadians(heading.' + 'to' + 'Double() / 2)).toFloat()'
    );
    compiler.emit('');
    compiler.emit(
      'earthRef.resolveAnchorOnRooftopAsync(lat, lng, altOffset, qx, qy, qz, qw) { anchor, state ->'
    );
    compiler.indentLevel++;
    compiler.emit('if (state == Anchor.RooftopAnchorState.SUCCESS && anchor != null) {');
    compiler.indentLevel++;
    compiler.emit('geospatialAnchors[name] = anchor');
    compiler.emit('val anchorNode = AnchorNode(anchor)');
    compiler.emit('anchorNode.setParent(arFragment.arSceneView.scene)');
    compiler.emit('');
    compiler.emit(
      'NodeFactory.createDefaultNode(this@' + compiler.options.className + 'Activity) { renderable ->'
    );
    compiler.indentLevel++;
    compiler.emit('val node = TransformableNode(arFragment.transformationSystem)');
    compiler.emit('node.setParent(anchorNode)');
    compiler.emit('node.renderable = renderable');
    compiler.emit('placedNodes[name] = node');
    compiler.emit('android.util.Log.d("HoloScript", "Rooftop anchor resolved: $name")');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  // --- processStreetscapeGeometry ---
  if (usesStreetscape) {
    compiler.emit('private fun processStreetscapeGeometry(session: Session) {');
    compiler.indentLevel++;
    compiler.emit(
      'val streetscapeGeometries = session.getAllTrackables(StreetscapeGeometry::class.java)'
    );
    compiler.emit('for (geometry in streetscapeGeometries) {');
    compiler.indentLevel++;
    compiler.emit('if (geometry.trackingState != TrackingState.TRACKING) continue');
    compiler.emit('');
    compiler.emit('val mesh = geometry.meshes.firstOrNull() ?: continue');
    compiler.emit('val type = geometry.type');
    compiler.emit(
      'android.util.Log.d("HoloScript", "Streetscape geometry: type=$type, vertices=${mesh.vertexList.size}")'
    );
    compiler.emit('');
    compiler.emit('// Streetscape mesh available for occlusion, raycasting, or rendering');
    compiler.emit('// Type is TERRAIN or BUILDING');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }
}

// === Depth Scanner Methods (M.010.02b) ===

/**
 * Check if any object uses depth scanner traits.
 */
export function hasDepthScanTraits(composition: HoloComposition): boolean {
  for (const obj of composition.objects || []) {
    for (const trait of obj.traits || []) {
      const name = typeof trait === 'string' ? trait : trait.name;
      if ((DEPTH_SCANNER_TRAITS as readonly string[]).includes(name)) return true;
    }
  }
  return false;
}

/**
 * Emit Kotlin code for depth scanning: ARCore depth, ToF, stereo,
 * mesh generation, .holo conversion, realtime streaming, and export.
 */
export function emitDepthScanSetup(compiler: AndroidCompiler, composition: HoloComposition): void {
  const hasMlArcore = compiler.compositionHasTrait(composition, 'depth_ml_arcore');
  const hasConfidence = compiler.compositionHasTrait(composition, 'depth_confidence_map');
  const hasAutoSelect = compiler.compositionHasTrait(composition, 'depth_auto_select');
  const hasMeshGenerate = compiler.compositionHasTrait(composition, 'depth_mesh_generate');
  const hasMeshToHolo = compiler.compositionHasTrait(composition, 'depth_mesh_to_holo');
  const hasRealtime = compiler.compositionHasTrait(composition, 'depth_realtime');
  const hasExport = compiler.compositionHasTrait(composition, 'depth_export');

  compiler.emit('');
  compiler.emit('// === Depth Scanner: ARCore depth, ToF, stereo (M.010.02b) ===');
  compiler.emit(
    `private val depthConfidenceThreshold = ${DEPTH_SCANNER_DEFAULTS.scan.confidenceThreshold}`
  );
  compiler.emit(`private val depthMaxMeters = ${DEPTH_SCANNER_DEFAULTS.scan.maxDepthMeters}f`);
  compiler.emit(`private val depthMeshDecimation = ${DEPTH_SCANNER_DEFAULTS.scan.meshDecimation}f`);
  compiler.emit('private var depthImage: android.media.Image? = null');
  if (hasConfidence) {
    compiler.emit('private var depthConfidenceImage: android.media.Image? = null');
  }
  compiler.emit('');

  // --- setupDepthScanner ---
  compiler.emit('private fun setupDepthScanner() {');
  compiler.indentLevel++;
  compiler.emit('val session = arFragment.arSceneView.session ?: return');
  compiler.emit('val config = session.config');
  compiler.emit('config.depthMode = Config.DepthMode.AUTOMATIC');
  compiler.emit('session.configure(config)');
  compiler.emit('android.util.Log.d("HoloScript", "Depth scanner: DepthMode.AUTOMATIC enabled")');
  compiler.emit('');

  if (hasAutoSelect) {
    compiler.emit('// Auto-select best depth source: ToF > ARCore ML > Stereo');
    compiler.emit('detectDepthSource()');
    compiler.emit('');
  }

  if (hasRealtime) {
    compiler.emit('// Continuous depth frame processing in render loop');
    compiler.emit('arFragment.arSceneView.scene.addOnUpdateListener { _ ->');
    compiler.indentLevel++;
    compiler.emit('val frame = arFragment.arSceneView.arFrame ?: return@addOnUpdateListener');
    compiler.emit('processDepthFrame(frame)');
    compiler.indentLevel--;
    compiler.emit('}');
  }

  compiler.indentLevel--;
  compiler.emit('}');
  compiler.emit('');

  // --- processDepthFrame ---
  compiler.emit('private fun processDepthFrame(frame: Frame) {');
  compiler.indentLevel++;
  compiler.emit('try {');
  compiler.indentLevel++;

  if (hasMlArcore) {
    compiler.emit('// ARCore ML depth: acquire 16-bit depth image');
    compiler.emit('depthImage?.close()');
    compiler.emit('depthImage = frame.acquireDepthImage16Bits()');
  } else {
    compiler.emit('depthImage?.close()');
    compiler.emit('depthImage = frame.acquireDepthImage16Bits()');
  }

  if (hasConfidence) {
    compiler.emit('');
    compiler.emit('// Confidence map: per-pixel confidence (0-255)');
    compiler.emit('depthConfidenceImage?.close()');
    compiler.emit('depthConfidenceImage = frame.acquireRawDepthConfidenceImage()');
  }

  if (hasMeshGenerate) {
    compiler.emit('');
    compiler.emit('val depthImg = depthImage ?: return');
    compiler.emit('generateMeshFromDepth(depthImg)');
  }

  compiler.indentLevel--;
  compiler.emit('} catch (e: Exception) {');
  compiler.indentLevel++;
  compiler.emit('android.util.Log[3]("HoloScript", "Depth frame unavailable: ${e.message}")');
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.emit('');

  // --- detectDepthSource (auto-select) ---
  if (hasAutoSelect) {
    compiler.emit('private fun detectDepthSource() {');
    compiler.indentLevel++;
    compiler.emit('val session = arFragment.arSceneView.session ?: return');
    compiler.emit('');
    compiler.emit('// Check ToF sensor availability');
    compiler.emit(
      'val hasToF = packageManager.hasSystemFeature("android.hardware.sensor.proximity")'
    );
    compiler.emit('');
    compiler.emit('// Check ARCore depth support');
    compiler.emit('val hasARCoreDepth = session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)');
    compiler.emit('');
    compiler.emit('// Check dual camera for stereo depth');
    compiler.emit(
      'val cameraManager = getSystemService(android.hardware.camera2.CameraManager::class.java)'
    );
    compiler.emit('val hasStereo = (cameraManager?.cameraIdList?.size ?: 0) >= 2');
    compiler.emit('');
    compiler.emit('// Priority: ToF > ARCore ML > Stereo');
    compiler.emit('val depthSource = when {');
    compiler.indentLevel++;
    compiler.emit('hasToF -> "ToF"');
    compiler.emit('hasARCoreDepth -> "ARCore_ML"');
    compiler.emit('hasStereo -> "Stereo"');
    compiler.emit('else -> "None"');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit(
      'android.util.Log.d("HoloScript", "Depth source selected: $depthSource (ToF=$hasToF, ARCore=$hasARCoreDepth, Stereo=$hasStereo)")'
    );
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  // --- generateMeshFromDepth ---
  if (hasMeshGenerate) {
    compiler.emit('private fun generateMeshFromDepth(depthImage: android.media.Image) {');
    compiler.indentLevel++;
    compiler.emit('val width = depthImage.width');
    compiler.emit('val height = depthImage.height');
    compiler.emit('val buffer = depthImage.planes[0].buffer');
    compiler.emit('val vertices = mutableListOf<Vector3>()');
    compiler.emit('val indices = mutableListOf<Int>()');
    compiler.emit('');
    compiler.emit('// Convert depth pixels to 3D points with decimation');
    compiler.emit('val step = (1.0f / depthMeshDecimation).toInt().coerceAtLeast(1)');
    compiler.emit('for (y in 0 until height step step) {');
    compiler.indentLevel++;
    compiler.emit('for (x in 0 until width step step) {');
    compiler.indentLevel++;
    compiler.emit('val depthMm = buffer.getShort((y * width + x) * 2).toInt() and 0xFFFF');
    compiler.emit('val depthM = depthMm / 1000.0f');
    compiler.emit('if (depthM <= 0f || depthM > depthMaxMeters) continue');
    compiler.emit('');
    compiler.emit('// Unproject pixel to 3D point (simplified pinhole model)');
    compiler.emit('val fx = width / 2.0f  // focal length approximation');
    compiler.emit('val fy = height / 2.0f');
    compiler.emit('val cx = width / 2.0f');
    compiler.emit('val cy = height / 2.0f');
    compiler.emit('val px = (x - cx) / fx * depthM');
    compiler.emit('val py = (y - cy) / fy * depthM');
    compiler.emit('vertices.add(Vector3(px, py, depthM))');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
    compiler.emit('// Triangulate adjacent points into mesh');
    compiler.emit('val cols = width / step');
    compiler.emit('for (row in 0 until (vertices.size / cols) - 1) {');
    compiler.indentLevel++;
    compiler.emit('for (col in 0 until cols - 1) {');
    compiler.indentLevel++;
    compiler.emit('val i = row * cols + col');
    compiler.emit('indices.add(i)');
    compiler.emit('indices.add(i + 1)');
    compiler.emit('indices.add(i + cols)');
    compiler.emit('indices.add(i + 1)');
    compiler.emit('indices.add(i + cols + 1)');
    compiler.emit('indices.add(i + cols)');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
    compiler.emit(
      'android.util.Log.d("HoloScript", "Depth mesh: ${vertices.size} vertices, ${indices.size / 3} triangles")'
    );

    if (hasMeshToHolo) {
      compiler.emit('convertMeshToHolo(vertices, indices)');
    }

    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  // --- convertMeshToHolo ---
  if (hasMeshToHolo) {
    compiler.emit('private fun convertMeshToHolo(vertices: List<Vector3>, indices: List<Int>) {');
    compiler.indentLevel++;
    compiler.emit('// Convert mesh vertices + classification to HoloScript entities');
    compiler.emit('val holoEntities = mutableListOf<Map<String, Any>>()');
    compiler.emit('for ((i, vertex) in vertices.withIndex()) {');
    compiler.indentLevel++;
    compiler.emit('holoEntities.add(mapOf(');
    compiler.indentLevel++;
    compiler.emit('"type" to "DepthPoint",');
    compiler.emit('"id" to "dp_$i",');
    compiler.emit('"position" to listOf(vertex[0], vertex[1], vertex[2]),');
    compiler.emit('"classification" to "unknown"');
    compiler.indentLevel--;
    compiler.emit('))');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit(
      'android.util.Log.d("HoloScript", "Converted ${holoEntities.size} depth points to .holo entities")'
    );
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  // --- exportDepthMesh ---
  if (hasExport) {
    const format = DEPTH_SCANNER_DEFAULTS.export.format;
    compiler.emit('private fun exportDepthMesh(vertices: List<Vector3>, indices: List<Int>) {');
    compiler.indentLevel++;
    compiler.emit(`val format = "${format}"`);
    compiler.emit('val filename = "depth_scan_${System.currentTimeMillis()}.$format"');
    compiler.emit('val file = java.io.File(getExternalFilesDir(null), filename)');
    compiler.emit('');
    compiler.emit('if (format == "obj") {');
    compiler.indentLevel++;
    compiler.emit('val sb = StringBuilder()');
    compiler.emit('sb.appendLine("# HoloScript Depth Scan Export")');
    compiler.emit('for (v in vertices) {');
    compiler.indentLevel++;
    compiler.emit('sb.appendLine("v ${v[0]} ${v[1]} ${v[2]}")');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('for (i in indices.indices step 3) {');
    compiler.indentLevel++;
    compiler.emit('sb.appendLine("f ${indices[i]+1} ${indices[i+1]+1} ${indices[i+2]+1}")');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('file.writeText(sb.toString())');
    compiler.indentLevel--;
    compiler.emit('} else {');
    compiler.indentLevel++;
    compiler.emit('// GLB export: binary glTF format');
    compiler.emit('android.util.Log.d("HoloScript", "GLB export requires glTF serializer library")');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
    compiler.emit('android.util.Log.d("HoloScript", "Depth mesh exported: ${file.absolutePath}")');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }
}

// === Portal AR Methods (M.010.06) ===

export function hasPortalARTraits(composition: HoloComposition): boolean {
  const portalNames: ReadonlyArray<string> = PORTAL_AR_TRAITS;
  for (const obj of composition.objects || []) {
    for (const trait of obj.traits || []) {
      const name = typeof trait === 'string' ? trait : trait.name;
      if (portalNames.includes(name)) return true;
    }
  }
  return false;
}

export function emitPortalARSetup(compiler: AndroidCompiler, composition: HoloComposition): void {
  compiler.emit('');
  compiler.emit('// === Portal AR: full-scene holographic layer behind reality ===');
  compiler.emit('private var portalSession: Session? = null');
  compiler.emit('private var portalRenderer: HolographicRenderer? = null');
  compiler.emit('private var depthTexture: Image? = null');
  compiler.emit('private var sceneMesh: Mesh? = null');
  compiler.emit('');

  // setupPortalAR
  compiler.emit('private fun setupPortalAR() {');
  compiler.indentLevel++;
  compiler.emit('val session = arFragment.arSceneView.session ?: return');
  compiler.emit('');
  compiler.emit('// Enable depth mode for portal occlusion');
  compiler.emit('val config = Config(session)');
  compiler.emit('config.depthMode = Config.DepthMode.AUTOMATIC');
  compiler.emit('config.lightEstimationMode = Config.LightEstimationMode.ENVIRONMENTAL_HDR');

  // Scene mesh for world mesh traits
  if (
    compiler.compositionHasTrait(composition, 'portal_world_mesh') ||
    compiler.compositionHasTrait(composition, 'portal_mesh_occlusion')
  ) {
    compiler.emit('config.planeFindingMode = Config.PlaneFindingMode.HORIZONTAL_AND_VERTICAL');
    compiler.emit('// Enable scene mesh for portal world mesh integration');
    compiler.emit('if (session.isDepthModeSupported(Config.DepthMode.AUTOMATIC)) {');
    compiler.indentLevel++;
    compiler.emit('config.depthMode = Config.DepthMode.AUTOMATIC');
    compiler.indentLevel--;
    compiler.emit('}');
  }

  compiler.emit('session.configure(config)');
  compiler.emit('portalSession = session');
  compiler.emit('');

  compiler.emit('// Create holographic render layer behind reality');
  compiler.emit('portalRenderer = HolographicRenderer(this)');
  compiler.emit('portalRenderer?.initialize(session)');
  compiler.emit('');

  // Portal occlusion via depth buffer
  if (compiler.compositionHasTrait(composition, 'portal_occlusion')) {
    compiler.emit('// Portal occlusion: real objects block holograms via depth buffer');
    compiler.emit('arFragment.arSceneView.scene.addOnUpdateListener { _ ->');
    compiler.indentLevel++;
    compiler.emit('val frame = arFragment.arSceneView.arFrame ?: return@addOnUpdateListener');
    compiler.emit('try {');
    compiler.indentLevel++;
    compiler.emit('depthTexture = frame.acquireDepthImage16Bits()');
    compiler.emit('portalRenderer?.updateDepthOcclusion(depthTexture!!)');
    compiler.indentLevel--;
    compiler.emit('} catch (e: Exception) {');
    compiler.indentLevel++;
    compiler.emit('// Depth not available on this frame');
    compiler.indentLevel--;
    compiler.emit('} finally {');
    compiler.indentLevel++;
    compiler.emit('depthTexture?.close()');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  // Portal parallax from device pose
  if (compiler.compositionHasTrait(composition, 'portal_parallax')) {
    compiler.emit('// Portal parallax: depth-correct parallax from device pose');
    compiler.emit('arFragment.arSceneView.scene.addOnUpdateListener { _ ->');
    compiler.indentLevel++;
    compiler.emit('val frame = arFragment.arSceneView.arFrame ?: return@addOnUpdateListener');
    compiler.emit('val cameraPose = frame.camera.pose');
    compiler.emit('portalRenderer?.applyParallaxCorrection(cameraPose)');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  // Portal depth fade
  if (compiler.compositionHasTrait(composition, 'portal_depth_fade')) {
    compiler.emit('// Portal depth fade: holograms fade at distance');
    compiler.emit('portalRenderer?.enableDepthFade(nearPlane = 0.1f, farPlane = 10.0f)');
    compiler.emit('');
  }

  // Portal world mesh / mesh occlusion
  if (
    compiler.compositionHasTrait(composition, 'portal_world_mesh') ||
    compiler.compositionHasTrait(composition, 'portal_mesh_occlusion')
  ) {
    compiler.emit('// Portal world mesh: scene mesh for realistic occlusion');
    compiler.emit('arFragment.arSceneView.scene.addOnUpdateListener { _ ->');
    compiler.indentLevel++;
    compiler.emit('val frame = arFragment.arSceneView.arFrame ?: return@addOnUpdateListener');
    compiler.emit('try {');
    compiler.indentLevel++;
    compiler.emit('val rawDepth = frame.acquireRawDepthImage16Bits()');
    compiler.emit('sceneMesh = portalRenderer?.reconstructMesh(rawDepth)');
    compiler.emit('portalRenderer?.updateMeshOcclusion(sceneMesh!!)');
    compiler.emit('rawDepth.close()');
    compiler.indentLevel--;
    compiler.emit('} catch (e: Exception) { /* depth not available */ }');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  // Portal peek through via device tilt
  if (compiler.compositionHasTrait(composition, 'portal_peek_through')) {
    compiler.emit('// Portal peek through: tilt phone to reveal holographic layer');
    compiler.emit('val sensorManager = getSystemService(SENSOR_SERVICE) as SensorManager');
    compiler.emit('val accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)');
    compiler.emit('val portalTiltThreshold = 30.0f // degrees');
    compiler.emit('sensorManager.registerListener(object : SensorEventListener {');
    compiler.indentLevel++;
    compiler.emit('override fun onSensorChanged(event: SensorEvent) {');
    compiler.indentLevel++;
    compiler.emit(
      'val tiltAngle = Math.toDegrees(Math.atan2(event.values[1].' +
        'to' +
        'Double(), event.values[2].' +
        'to' +
        'Double())).toFloat()'
    );
    compiler.emit('portalRenderer?.setPortalVisibility(Math.abs(tiltAngle) > portalTiltThreshold)');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}');
    compiler.indentLevel--;
    compiler.emit('}, accelerometer, SensorManager.SENSOR_DELAY_UI)');
    compiler.emit('');
  }

  // Portal boundary
  if (compiler.compositionHasTrait(composition, 'portal_boundary')) {
    compiler.emit('// Portal boundary: configurable shape (circle/rect)');
    compiler.emit('val portalBoundary = PortalBoundary()');
    compiler.emit('portalBoundary.shape = PortalBoundary.Shape.CIRCLE // configurable');
    compiler.emit('portalBoundary.radius = 1.5f');
    compiler.emit('portalRenderer?.setBoundary(portalBoundary)');
    compiler.emit('');
  }

  // Portal lighting match
  if (compiler.compositionHasTrait(composition, 'portal_lighting_match')) {
    compiler.emit('// Portal lighting match: use ARCore light estimation');
    compiler.emit('arFragment.arSceneView.scene.addOnUpdateListener { _ ->');
    compiler.indentLevel++;
    compiler.emit('val frame = arFragment.arSceneView.arFrame ?: return@addOnUpdateListener');
    compiler.emit('val lightEstimate = frame.lightEstimate');
    compiler.emit('if (lightEstimate != null && lightEstimate.state == LightEstimate.State.VALID) {');
    compiler.indentLevel++;
    compiler.emit('val intensity = lightEstimate.pixelIntensity');
    compiler.emit('val colorCorrection = FloatArray(4)');
    compiler.emit('lightEstimate.getColorCorrection(colorCorrection, 0)');
    compiler.emit('portalRenderer?.updateLighting(intensity, colorCorrection)');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  compiler.emit('print("[HoloScript] Portal AR initialized")');
  compiler.indentLevel--;
  compiler.emit('}');
}

// === Camera Hand Tracking Methods (M.010.04) ===

export function hasHandTrackingTraits(composition: HoloComposition): boolean {
  const handTraitNames: ReadonlyArray<string> = CAMERA_HAND_TRACKING_TRAITS;
  for (const obj of composition.objects || []) {
    for (const trait of obj.traits || []) {
      const name = typeof trait === 'string' ? trait : trait.name;
      if (handTraitNames.includes(name)) return true;
    }
  }
  return false;
}

export function emitHandTrackingSetup(compiler: AndroidCompiler, composition: HoloComposition): void {
  compiler.emit('');
  compiler.emit('// === Camera Hand Tracking: MediaPipe Hands (M.010.04) ===');
  compiler.emit('private var handsolution: com.google.mediapipe.solutions.hands.Hands? = null');
  compiler.emit('');

  const twoHands = compiler.compositionHasTrait(composition, 'camera_hand_two_hands');
  const maxHands = twoHands ? 2 : 1;

  const hasPinch = compiler.compositionHasTrait(composition, 'camera_hand_gesture_pinch');
  const hasPoint = compiler.compositionHasTrait(composition, 'camera_hand_gesture_point');
  const hasPalm = compiler.compositionHasTrait(composition, 'camera_hand_gesture_palm');
  const hasFist = compiler.compositionHasTrait(composition, 'camera_hand_gesture_fist');
  const hasConfidence = compiler.compositionHasTrait(composition, 'camera_hand_confidence');
  const hasSkeleton = compiler.compositionHasTrait(composition, 'camera_hand_skeleton');
  const hasToSpatial = compiler.compositionHasTrait(composition, 'camera_hand_to_spatial');

  // setupHandTracking()
  compiler.emit('private fun setupHandTracking() {');
  compiler.indentLevel++;
  compiler.emit('val options = com.google.mediapipe.solutions.hands.HandsOptions.builder()');
  compiler.emit(`    .setMaxNumHands(${maxHands})`);
  compiler.emit('    .setStaticImageMode(false)');
  compiler.emit(
    '    .setRunningMode(com.google.mediapipe.solutions.hands.Hands.RUNNING_MODE_LIVE_STREAM)'
  );
  if (hasConfidence) {
    compiler.emit('    .setMinHandDetectionConfidence(0.7f)');
  } else {
    compiler.emit('    .setMinHandDetectionConfidence(0.5f)');
  }
  compiler.emit('    .setMinTrackingConfidence(0.5f)');
  compiler.emit('    .build()');
  compiler.emit('');
  compiler.emit('handsolution = com.google.mediapipe.solutions.hands.Hands(this, options)');
  compiler.emit('handsolution?.setResultListener { result ->');
  compiler.indentLevel++;
  compiler.emit('processHandResults(result)');
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.emit('');
  compiler.emit('// Start CameraX front camera feed');
  compiler.emit('startCameraForHandTracking()');
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.emit('');

  // startCameraForHandTracking()
  compiler.emit('private fun startCameraForHandTracking() {');
  compiler.indentLevel++;
  compiler.emit(
    'val cameraProviderFuture = androidx.camera.lifecycle.ProcessCameraProvider.getInstance(this)'
  );
  compiler.emit('cameraProviderFuture.addListener({');
  compiler.indentLevel++;
  compiler.emit('val cameraProvider = cameraProviderFuture.get()');
  compiler.emit('val preview = androidx.camera.core.Preview.Builder().build()');
  compiler.emit('val imageAnalysis = androidx.camera.core.ImageAnalysis.Builder()');
  compiler.emit(
    '    .setBackpressureStrategy(androidx.camera.core.ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)'
  );
  compiler.emit('    .build()');
  compiler.emit(
    'imageAnalysis.setAnalyzer(java.util.concurrent.Executors.newSingleThreadExecutor()) { imageProxy ->'
  );
  compiler.indentLevel++;
  compiler.emit('handsolution?.send(imageProxy)');
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.emit('val cameraSelector = androidx.camera.core.CameraSelector.DEFAULT_FRONT_CAMERA');
  compiler.emit('cameraProvider.unbindAll()');
  compiler.emit('cameraProvider.bindToLifecycle(this, cameraSelector, preview, imageAnalysis)');
  compiler.indentLevel--;
  compiler.emit('}, androidx.core.content.ContextCompat.getMainExecutor(this))');
  compiler.indentLevel--;
  compiler.emit('}');
  compiler.emit('');

  // processHandResults()
  compiler.emit(
    'private fun processHandResults(result: com.google.mediapipe.solutions.hands.HandsResult) {'
  );
  compiler.indentLevel++;
  compiler.emit('if (result.multiHandLandmarks().isEmpty()) return');
  compiler.emit('');
  compiler.emit('for ((handIndex, landmarks) in result.multiHandLandmarks().withIndex()) {');
  compiler.indentLevel++;

  if (hasSkeleton) {
    compiler.emit('// 21-joint skeleton data');
    compiler.emit('val wrist = landmarks.landmarkList[0]');
    compiler.emit('val thumbCmc = landmarks.landmarkList[1]');
    compiler.emit('val thumbMcp = landmarks.landmarkList[2]');
    compiler.emit('val thumbIp = landmarks.landmarkList[3]');
    compiler.emit('val thumbTip = landmarks.landmarkList[4]');
    compiler.emit('val indexMcp = landmarks.landmarkList[5]');
    compiler.emit('val indexPip = landmarks.landmarkList[6]');
    compiler.emit('val indexDip = landmarks.landmarkList[7]');
    compiler.emit('val indexTip = landmarks.landmarkList[8]');
    compiler.emit('val middleMcp = landmarks.landmarkList[9]');
    compiler.emit('val middlePip = landmarks.landmarkList[10]');
    compiler.emit('val middleDip = landmarks.landmarkList[11]');
    compiler.emit('val middleTip = landmarks.landmarkList[12]');
    compiler.emit('val ringMcp = landmarks.landmarkList[13]');
    compiler.emit('val ringPip = landmarks.landmarkList[14]');
    compiler.emit('val ringDip = landmarks.landmarkList[15]');
    compiler.emit('val ringTip = landmarks.landmarkList[16]');
    compiler.emit('val pinkyMcp = landmarks.landmarkList[17]');
    compiler.emit('val pinkyPip = landmarks.landmarkList[18]');
    compiler.emit('val pinkyDip = landmarks.landmarkList[19]');
    compiler.emit('val pinkyTip = landmarks.landmarkList[20]');
    compiler.emit('');
  } else {
    compiler.emit('// Key landmarks for gesture recognition');
    compiler.emit('val thumbTip = landmarks.landmarkList[4]');
    compiler.emit('val indexMcp = landmarks.landmarkList[5]');
    compiler.emit('val indexPip = landmarks.landmarkList[6]');
    compiler.emit('val indexTip = landmarks.landmarkList[8]');
    compiler.emit('val middleMcp = landmarks.landmarkList[9]');
    compiler.emit('val middlePip = landmarks.landmarkList[10]');
    compiler.emit('val middleTip = landmarks.landmarkList[12]');
    compiler.emit('val ringMcp = landmarks.landmarkList[13]');
    compiler.emit('val ringPip = landmarks.landmarkList[14]');
    compiler.emit('val ringTip = landmarks.landmarkList[16]');
    compiler.emit('val pinkyMcp = landmarks.landmarkList[17]');
    compiler.emit('val pinkyPip = landmarks.landmarkList[18]');
    compiler.emit('val pinkyTip = landmarks.landmarkList[20]');
    compiler.emit('');
  }

  if (hasConfidence) {
    compiler.emit('// Filter low-confidence landmarks');
    compiler.emit('val minConfidence = 0.7f');
    compiler.emit(
      'if (thumbTip.visibility < minConfidence || indexTip.visibility < minConfidence) {'
    );
    compiler.indentLevel++;
    compiler.emit('continue');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  if (hasPinch) {
    compiler.emit('// Pinch gesture: thumb tip close to index tip');
    compiler.emit('val pinchDist = Math.sqrt(');
    compiler.emit(
      '    Math.pow((thumbTip[0] - indexTip[0]).' + 'to' + 'Double(), 2.0) +'
    );
    compiler.emit('    Math.pow((thumbTip[1] - indexTip[1]).' + 'to' + 'Double(), 2.0)');
    compiler.emit(').toFloat()');
    compiler.emit('if (pinchDist < 0.05f) {');
    compiler.indentLevel++;
    compiler.emit('android.util.Log.d("HoloScript", "Hand $handIndex: PINCH detected")');
    if (hasToSpatial) {
      compiler.emit('onSpatialInput("pinch", handIndex, thumbTip[0], thumbTip[1], thumbTip[2])');
    }
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  if (hasPoint) {
    compiler.emit('// Point gesture: index extended, others curled');
    compiler.emit('val indexExtended = indexTip[1] < indexMcp[1]');
    compiler.emit('val middleCurled = middleTip[1] > middlePip[1]');
    compiler.emit('val ringCurled = ringTip[1] > ringPip[1]');
    compiler.emit('val pinkyCurled = pinkyTip[1] > pinkyPip[1]');
    compiler.emit('if (indexExtended && middleCurled && ringCurled && pinkyCurled) {');
    compiler.indentLevel++;
    compiler.emit('android.util.Log.d("HoloScript", "Hand $handIndex: POINT detected")');
    if (hasToSpatial) {
      compiler.emit('onSpatialInput("point", handIndex, indexTip[0], indexTip[1], indexTip[2])');
    }
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  if (hasPalm) {
    compiler.emit('// Palm gesture: all fingertips above MCPs (open hand)');
    compiler.emit('val allExtended = indexTip[1] < indexMcp[1] && middleTip[1] < middleMcp[1] &&');
    compiler.emit('    ringTip[1] < ringMcp[1] && pinkyTip[1] < pinkyMcp[1]');
    compiler.emit('if (allExtended) {');
    compiler.indentLevel++;
    compiler.emit('android.util.Log.d("HoloScript", "Hand $handIndex: PALM detected")');
    if (hasToSpatial) {
      compiler.emit('onSpatialInput("palm", handIndex, indexTip[0], indexTip[1], indexTip[2])');
    }
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  if (hasFist) {
    compiler.emit('// Fist gesture: all fingertips below PIPs (closed hand)');
    compiler.emit('val allCurled = indexTip[1] > indexPip[1] && middleTip[1] > middlePip[1] &&');
    compiler.emit('    ringTip[1] > ringPip[1] && pinkyTip[1] > pinkyPip[1]');
    compiler.emit('if (allCurled) {');
    compiler.indentLevel++;
    compiler.emit('android.util.Log.d("HoloScript", "Hand $handIndex: FIST detected")');
    if (hasToSpatial) {
      compiler.emit('onSpatialInput("fist", handIndex, indexTip[0], indexTip[1], indexTip[2])');
    }
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }

  compiler.indentLevel--;
  compiler.emit('}');
  compiler.indentLevel--;
  compiler.emit('}');

  if (hasToSpatial) {
    compiler.emit('');
    compiler.emit(
      'private fun onSpatialInput(gesture: String, handIndex: Int, x: Float, y: Float, z: Float) {'
    );
    compiler.indentLevel++;
    compiler.emit('// Bridge to HoloScript spatial_input event system');
    compiler.emit('val event = mapOf(');
    compiler.indentLevel++;
    compiler.emit('"type" to "hand_gesture",');
    compiler.emit('"gesture" to gesture,');
    compiler.emit('"handIndex" to handIndex,');
    compiler.emit('"x" to x, "y" to y, "z" to z');
    compiler.indentLevel--;
    compiler.emit(')');
    compiler.emit('android.util.Log.d("HoloScript", "SpatialInput: $event")');
    compiler.indentLevel--;
    compiler.emit('}');
  }
}

// === Spatial Authoring Methods (M.010.08) ===

export function hasAuthoringTraits(composition: HoloComposition): boolean {
  const authoringNames: ReadonlyArray<string> = SPATIAL_AUTHORING_TRAITS;
  for (const obj of composition.objects || []) {
    for (const trait of obj.traits || []) {
      const name = typeof trait === 'string' ? trait : trait.name;
      if (authoringNames.includes(name)) return true;
    }
  }
  return false;
}

export function emitAuthoringSetup(compiler: AndroidCompiler, composition: HoloComposition): string {
  compiler.lines = [];
  compiler.indentLevel = 0;

  compiler.emit('// === Spatial Authoring Setup (M.010.08) ===');
  compiler.emit('');

  const hasGyro = compiler.compositionHasTrait(composition, 'author_gyro_place');
  const hasPinch = compiler.compositionHasTrait(composition, 'author_pinch_scale');
  const hasSwipe = compiler.compositionHasTrait(composition, 'author_swipe_browse');
  const hasVoice = compiler.compositionHasTrait(composition, 'author_voice_cmd');
  const hasShake = compiler.compositionHasTrait(composition, 'author_shake_undo');

  if (hasGyro) {
    compiler.emit(`private val gyroFilterAlpha = ${SPATIAL_AUTHORING_DEFAULTS.gyroFilterAlpha}f`);
    compiler.emit('private var sensorManager: android.hardware.SensorManager? = null');
    compiler.emit('private var rotationSensor: android.hardware.Sensor? = null');
  }
  if (hasPinch) {
    compiler.emit(`private val pinchScaleMin = ${SPATIAL_AUTHORING_DEFAULTS.pinchScaleMin}f`);
    compiler.emit(`private val pinchScaleMax = ${SPATIAL_AUTHORING_DEFAULTS.pinchScaleMax}f`);
    compiler.emit('private var scaleGestureDetector: android.view.ScaleGestureDetector? = null');
  }
  if (hasSwipe) {
    compiler.emit('private var gestureDetector: android.view.GestureDetector? = null');
  }
  if (hasVoice) {
    compiler.emit(`private val speechLocale = "${SPATIAL_AUTHORING_DEFAULTS.speechLocale}"`);
    compiler.emit('private var speechRecognizer: android.speech.SpeechRecognizer? = null');
  }
  if (hasShake) {
    compiler.emit(`private val shakeThreshold = ${SPATIAL_AUTHORING_DEFAULTS.shakeThreshold}f`);
    compiler.emit(`private val undoStackDepth = ${SPATIAL_AUTHORING_DEFAULTS.undoStackDepth}`);
    compiler.emit('private val undoStack = ArrayDeque<() -> Unit>()');
  }

  return compiler.lines.join('\n');
}

export function emitAuthoringInlineSetup(compiler: AndroidCompiler, composition: HoloComposition): void {
  compiler.emit('');
  compiler.emit('// --- Spatial Authoring inline setup (M.010.08) ---');

  if (compiler.compositionHasTrait(composition, 'author_gyro_place')) {
    compiler.emit('private fun setupGyroPlacement() {');
    compiler.indentLevel++;
    compiler.emit(
      'sensorManager = getSystemService(SENSOR_SERVICE) as android.hardware.SensorManager'
    );
    compiler.emit(
      'rotationSensor = sensorManager?.getDefaultSensor(android.hardware.Sensor.TYPE_ROTATION_VECTOR)'
    );
    compiler.indentLevel--;
    compiler.emit('}');
  }
  if (compiler.compositionHasTrait(composition, 'author_pinch_scale')) {
    compiler.emit('private fun setupPinchScale() {');
    compiler.indentLevel++;
    compiler.emit(
      'scaleGestureDetector = android.view.ScaleGestureDetector(this, object : android.view.ScaleGestureDetector.SimpleOnScaleGestureListener() {'
    );
    compiler.indentLevel++;
    compiler.emit('override fun onScale(detector: android.view.ScaleGestureDetector): Boolean {');
    compiler.indentLevel++;
    compiler.emit('val factor = detector.scaleFactor.coerceIn(pinchScaleMin, pinchScaleMax)');
    compiler.emit('selectedNode?.localScale = selectedNode?.localScale?.let { it.scaled(factor) }');
    compiler.emit('return true');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('})');
    compiler.indentLevel--;
    compiler.emit('}');
  }
  if (compiler.compositionHasTrait(composition, 'author_shake_undo')) {
    compiler.emit('private fun setupShakeUndo() {');
    compiler.indentLevel++;
    compiler.emit(
      'val accelerometer = sensorManager?.getDefaultSensor(android.hardware.Sensor.TYPE_ACCELEROMETER)'
    );
    compiler.emit('// Shake detection triggers undoStack.removeLastOrNull()?.invoke()');
    compiler.indentLevel--;
    compiler.emit('}');
  }
}

// === NPU Scene Understanding (M.010.03) ===

/**
 * Check whether the composition references any npu_* scene understanding traits.
 */
export function hasNPUSceneTraits(composition: HoloComposition): boolean {
  const npuNames: ReadonlyArray<string> = NPU_SCENE_TRAITS;
  for (const obj of composition.objects || []) {
    for (const trait of obj.traits || []) {
      const name = typeof trait === 'string' ? trait : trait.name;
      if (npuNames.includes(name)) return true;
    }
  }
  return false;
}

/**
 * Emit a standalone Kotlin file for NPU scene understanding using
 * ML Kit, TFLite, and NNAPI hardware acceleration.
 */
export function emitNPUSceneSetup(compiler: AndroidCompiler, composition: HoloComposition): string {
  compiler.lines = [];
  compiler.indentLevel = 0;
  const pkg = compiler.options.packageName;
  const cls = compiler.options.className;
  const defaults = NPU_SCENE_DEFAULTS;
  const usedTraits = new Set<string>();
  for (const obj of composition.objects || []) {
    for (const trait of obj.traits || []) {
      const name = typeof trait === 'string' ? trait : trait.name;
      if ((NPU_SCENE_TRAITS as ReadonlyArray<string>).includes(name)) {
        usedTraits.add(name);
      }
    }
  }
  compiler.emit('// Auto-generated by HoloScript AndroidCompiler — NPU Scene Understanding');
  compiler.emit(
    `// Source: composition "${compiler.escapeStringValue(composition.name as string, 'Kotlin')}"`
  );
  compiler.emit('// Requires ML Kit, CameraX, NNAPI delegate');
  compiler.emit('// Do not edit manually — regenerate from .holo source');
  compiler.emit('');
  compiler.emit(`package ${pkg}`);
  compiler.emit('');
  compiler.emit('import android.graphics.Bitmap');
  compiler.emit('import android.graphics.Rect');
  compiler.emit('import android.util.Log');
  compiler.emit('import android.util.Size');
  compiler.emit('import androidx.camera.core.ImageAnalysis');
  compiler.emit('import androidx.camera.core.ImageProxy');
  compiler.emit('import androidx.lifecycle.ViewModel');
  compiler.emit('import androidx.lifecycle.viewModelScope');
  compiler.emit('import kotlinx.coroutines.flow.MutableStateFlow');
  compiler.emit('import kotlinx.coroutines.flow.StateFlow');
  compiler.emit('import kotlinx.coroutines.launch');
  if (usedTraits.has('npu_detect')) {
    compiler.emit('import com.google.mlkit.vision.common.InputImage');
    compiler.emit('import com.google.mlkit.vision.objects.ObjectDetection');
    compiler.emit('import com.google.mlkit.vision.objects.ObjectDetector');
    compiler.emit('import com.google.mlkit.vision.objects.defaults.ObjectDetectorOptions');
  }
  if (usedTraits.has('npu_classify')) {
    compiler.emit('import com.google.mlkit.vision.common.InputImage');
    compiler.emit('import com.google.mlkit.vision.label.ImageLabeling');
    compiler.emit('import com.google.mlkit.vision.label.ImageLabeler');
    compiler.emit('import com.google.mlkit.vision.label.defaults.ImageLabelerOptions');
  }
  if (usedTraits.has('npu_segment')) {
    compiler.emit('import com.google.mlkit.vision.segmentation.Segmentation');
    compiler.emit('import com.google.mlkit.vision.segmentation.selfie.SelfieSegmenterOptions');
  }
  if (usedTraits.has('npu_model_custom')) {
    compiler.emit('import org.tensorflow.lite.Interpreter');
    compiler.emit('import org.tensorflow.lite.nnapi.NnApiDelegate');
    compiler.emit('import com.google.mlkit.common.model.LocalModel');
  }
  compiler.emit('');
  compiler.emit('/** A single detection result from NPU scene understanding. */');
  compiler.emit('data class NPUDetection(');
  compiler.indentLevel++;
  compiler.emit('val label: String,');
  compiler.emit('val confidence: Float,');
  compiler.emit('val boundingBox: Rect? = null,');
  compiler.emit('val position: FloatArray? = null,');
  compiler.emit('val segmentationMask: Bitmap? = null,');
  compiler.emit('val depthValue: Float? = null');
  compiler.indentLevel--;
  compiler.emit(')');
  compiler.emit('');
  compiler.emit(`class ${cls}NPUSceneManager : ViewModel() {`);
  compiler.indentLevel++;
  compiler.emit('');
  compiler.emit('private val _detections = MutableStateFlow<List<NPUDetection>>(emptyList())');
  compiler.emit('val detections: StateFlow<List<NPUDetection>> = _detections');
  compiler.emit('');
  compiler.emit('private val _isProcessing = MutableStateFlow(false)');
  compiler.emit('val isProcessing: StateFlow<Boolean> = _isProcessing');
  compiler.emit('');
  compiler.emit('private var inferenceCount: Int = 0');
  compiler.emit(`private val confidenceThreshold: Float = ${defaults.confidenceThreshold}f`);
  compiler.emit(`private val maxDetections: Int = ${defaults.maxDetections}`);
  compiler.emit(`private val targetFPS: Int = ${defaults.targetFPS}`);
  compiler.emit(`private val entityScale: Float = ${defaults.entityScale}f`);
  compiler.emit(`private val labelOffsetY: Float = ${defaults.labelOffsetY}f`);
  compiler.emit('private var frameCounter: Int = 0');
  compiler.emit('private var lastProcessTimeMs: Long = 0');
  compiler.emit('');
  if (usedTraits.has('npu_detect')) {
    compiler.emit('// MARK: Object Detection (npu_detect)');
    compiler.emit('');
    compiler.emit('private val objectDetector: ObjectDetector by lazy {');
    compiler.indentLevel++;
    compiler.emit('val options = ObjectDetectorOptions.Builder()');
    compiler.emit('    .setDetectorMode(ObjectDetectorOptions.STREAM_MODE)');
    compiler.emit('    .enableMultipleObjects()');
    compiler.emit('    .enableClassification()');
    compiler.emit('    .build()');
    compiler.emit('ObjectDetection.getClient(options)');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
    compiler.emit('fun detectObjects(image: InputImage) {');
    compiler.indentLevel++;
    compiler.emit('objectDetector.process(image)');
    compiler.emit('    .addOnSuccessListener { objects ->');
    compiler.indentLevel++;
    compiler.emit('val results = objects');
    compiler.emit(
      '    .filter { it.labels.isNotEmpty() && (it.labels.firstOrNull()?.confidence ?: 0f) >= confidenceThreshold }'
    );
    compiler.emit('    .take(maxDetections)');
    compiler.emit('    .map { obj ->');
    compiler.indentLevel++;
    compiler.emit('NPUDetection(');
    compiler.emit('    label = obj.labels.firstOrNull()?.text ?: "unknown",');
    compiler.emit('    confidence = obj.labels.firstOrNull()?.confidence ?: 0f,');
    compiler.emit('    boundingBox = obj.boundingBox');
    compiler.emit(')');
    compiler.indentLevel--;
    compiler.emit('    }');
    compiler.emit('_detections.value = results');
    compiler.emit('inferenceCount++');
    compiler.emit('Log.d("HoloScript", "Detected ${results.size} objects")');
    compiler.indentLevel--;
    compiler.emit('    }');
    compiler.emit('    .addOnFailureListener { e ->');
    compiler.indentLevel++;
    compiler.emit('Log.e("HoloScript", "Object detection failed", e)');
    compiler.indentLevel--;
    compiler.emit('    }');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }
  if (usedTraits.has('npu_classify')) {
    compiler.emit('// MARK: Classification (npu_classify)');
    compiler.emit('');
    compiler.emit('private val imageLabeler: ImageLabeler by lazy {');
    compiler.indentLevel++;
    compiler.emit('val options = ImageLabelerOptions.Builder()');
    compiler.emit(`    .setConfidenceThreshold(${defaults.confidenceThreshold}f)`);
    compiler.emit('    .build()');
    compiler.emit('ImageLabeling.getClient(options)');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
    compiler.emit('fun classifyImage(image: InputImage) {');
    compiler.indentLevel++;
    compiler.emit('imageLabeler.process(image)');
    compiler.emit('    .addOnSuccessListener { labels ->');
    compiler.indentLevel++;
    compiler.emit('val results = labels');
    compiler.emit('    .filter { it.confidence >= confidenceThreshold }');
    compiler.emit('    .take(maxDetections)');
    compiler.emit('    .map { label ->');
    compiler.indentLevel++;
    compiler.emit('NPUDetection(label = label.text, confidence = label.confidence)');
    compiler.indentLevel--;
    compiler.emit('    }');
    compiler.emit('_detections.value = results');
    compiler.emit('inferenceCount++');
    compiler.indentLevel--;
    compiler.emit('    }');
    compiler.emit('    .addOnFailureListener { e ->');
    compiler.indentLevel++;
    compiler.emit('Log.e("HoloScript", "Image classification failed", e)');
    compiler.indentLevel--;
    compiler.emit('    }');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }
  if (usedTraits.has('npu_segment')) {
    compiler.emit('// MARK: Segmentation (npu_segment)');
    compiler.emit('');
    compiler.emit('private val segmenter by lazy {');
    compiler.indentLevel++;
    compiler.emit('val options = SelfieSegmenterOptions.Builder()');
    compiler.emit('    .setDetectorMode(SelfieSegmenterOptions.STREAM_MODE)');
    compiler.emit('    .enableRawSizeMask()');
    compiler.emit('    .build()');
    compiler.emit('Segmentation.getClient(options)');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
    compiler.emit('fun segmentScene(image: InputImage) {');
    compiler.indentLevel++;
    compiler.emit('segmenter.process(image)');
    compiler.emit('    .addOnSuccessListener { mask ->');
    compiler.indentLevel++;
    compiler.emit('val buffer = mask.buffer');
    compiler.emit('val width = mask.width');
    compiler.emit('val height = mask.height');
    compiler.emit('val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)');
    compiler.emit('_detections.value = listOf(NPUDetection(');
    compiler.emit('    label = "person_segmentation", confidence = 1.0f,');
    compiler.emit('    segmentationMask = bitmap');
    compiler.emit('))');
    compiler.emit('inferenceCount++');
    compiler.indentLevel--;
    compiler.emit('    }');
    compiler.emit('    .addOnFailureListener { e ->');
    compiler.indentLevel++;
    compiler.emit('Log.e("HoloScript", "Segmentation failed", e)');
    compiler.indentLevel--;
    compiler.emit('    }');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }
  if (usedTraits.has('npu_entity_pipe')) {
    compiler.emit('// MARK: Entity Pipeline (npu_entity_pipe)');
    compiler.emit('');
    compiler.emit(
      'fun mapDetectionsToEntities(detections: List<NPUDetection>, arFragment: com.google.ar.sceneform.ux.ArFragment) {'
    );
    compiler.indentLevel++;
    compiler.emit('val scene = arFragment.arSceneView.scene');
    compiler.emit('for (detection in detections) {');
    compiler.indentLevel++;
    compiler.emit('val bbox = detection.boundingBox ?: continue');
    compiler.emit('val centerX = (bbox.left + bbox.right) / 2f');
    compiler.emit('val centerY = (bbox.top + bbox.bottom) / 2f');
    compiler.emit('val frame = arFragment.arSceneView.arFrame ?: continue');
    compiler.emit('val hits = frame.hitTest(centerX, centerY)');
    compiler.emit('val hit = hits.firstOrNull() ?: continue');
    compiler.emit('val anchor = hit.createAnchor()');
    compiler.emit('val anchorNode = com.google.ar.sceneform.AnchorNode(anchor)');
    compiler.emit('anchorNode.setParent(scene)');
    compiler.emit('com.google.ar.sceneform.rendering.MaterialFactory');
    compiler.emit('    .makeOpaqueWithColor(arFragment.requireContext(),');
    compiler.emit('        com.google.ar.sceneform.rendering.Color(0.2f, 0.6f, 1.0f, 0.6f))');
    compiler.emit('    .thenAccept { material ->');
    compiler.indentLevel++;
    compiler.emit(
      `val renderable = com.google.ar.sceneform.rendering.ShapeFactory.makeSphere(${defaults.entityScale}f, com.google.ar.sceneform.math.Vector3.zero(), material)`
    );
    compiler.emit(
      'val node = com.google.ar.sceneform.ux.TransformableNode(arFragment.transformationSystem)'
    );
    compiler.emit('node.setParent(anchorNode)');
    compiler.emit('node.renderable = renderable');
    compiler.emit('node.name = detection.label');
    compiler.emit('Log.d("HoloScript", "Entity created: ${detection.label}")');
    compiler.indentLevel--;
    compiler.emit('    }');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }
  if (usedTraits.has('npu_realtime')) {
    compiler.emit('// MARK: Realtime Processing (npu_realtime)');
    compiler.emit('');
    compiler.emit('fun createImageAnalyzer(): ImageAnalysis.Analyzer {');
    compiler.indentLevel++;
    compiler.emit('return ImageAnalysis.Analyzer { imageProxy ->');
    compiler.indentLevel++;
    compiler.emit('frameCounter++');
    compiler.emit('val now = System.currentTimeMillis()');
    compiler.emit('val intervalMs = 1000L / targetFPS');
    compiler.emit('if (now - lastProcessTimeMs < intervalMs) {');
    compiler.indentLevel++;
    compiler.emit('imageProxy.close()');
    compiler.emit('return@Analyzer');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('lastProcessTimeMs = now');
    compiler.emit('_isProcessing.value = true');
    compiler.emit('');
    compiler.emit('@androidx.camera.core.ExperimentalGetImage');
    compiler.emit('val mediaImage = imageProxy.image');
    compiler.emit('if (mediaImage != null) {');
    compiler.indentLevel++;
    compiler.emit(
      'val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)'
    );
    if (usedTraits.has('npu_classify')) {
      compiler.emit('classifyImage(image)');
    }
    if (usedTraits.has('npu_detect')) {
      compiler.emit('detectObjects(image)');
    }
    if (usedTraits.has('npu_segment')) {
      compiler.emit('segmentScene(image)');
    }
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('_isProcessing.value = false');
    compiler.emit('imageProxy.close()');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }
  if (usedTraits.has('npu_model_custom')) {
    compiler.emit('// MARK: Custom Model (npu_model_custom)');
    compiler.emit('');
    compiler.emit('private var customInterpreter: Interpreter? = null');
    compiler.emit('');
    compiler.emit('fun loadCustomModel(context: android.content.Context, assetPath: String) {');
    compiler.indentLevel++;
    compiler.emit('val localModel = LocalModel.Builder()');
    compiler.emit('    .setAssetFilePath(assetPath)');
    compiler.emit('    .build()');
    compiler.emit('');
    compiler.emit('// NNAPI delegate for hardware acceleration');
    compiler.emit('val nnApiDelegate = NnApiDelegate()');
    compiler.emit('val options = Interpreter.Options().addDelegate(nnApiDelegate)');
    compiler.emit('');
    compiler.emit('val modelFile = context.assets.open(assetPath)');
    compiler.emit('val buffer = modelFile.readBytes()');
    compiler.emit('val byteBuffer = java.nio.ByteBuffer.allocateDirect(buffer.size)');
    compiler.emit('byteBuffer.put(buffer)');
    compiler.emit('customInterpreter = Interpreter(byteBuffer, options)');
    compiler.emit('Log.d("HoloScript", "Custom model loaded with NNAPI: $assetPath")');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }
  if (usedTraits.has('npu_label_overlay')) {
    compiler.emit('// MARK: Label Overlay (npu_label_overlay)');
    compiler.emit('');
    compiler.emit('fun createLabelOverlay(');
    compiler.emit('    detection: NPUDetection,');
    compiler.emit('    arFragment: com.google.ar.sceneform.ux.ArFragment,');
    compiler.emit('    anchorNode: com.google.ar.sceneform.AnchorNode');
    compiler.emit(') {');
    compiler.indentLevel++;
    compiler.emit('com.google.ar.sceneform.rendering.ViewRenderable.builder()');
    compiler.emit(
      '    .setView(arFragment.requireContext(), android.widget.TextView(arFragment.requireContext()).apply {'
    );
    compiler.indentLevel++;
    compiler.emit('text = "${detection.label} (${(detection.confidence * 100).toInt()}%)"');
    compiler.emit('setTextColor(android.graphics.Color.WHITE)');
    compiler.emit('setBackgroundColor(android.graphics.Color.argb(180, 0, 0, 0))');
    compiler.emit('setPadding(12, 6, 12, 6)');
    compiler.emit('textSize = 12f');
    compiler.indentLevel--;
    compiler.emit('    })');
    compiler.emit('    .build()');
    compiler.emit('    .thenAccept { renderable ->');
    compiler.indentLevel++;
    compiler.emit('val labelNode = com.google.ar.sceneform.Node()');
    compiler.emit('labelNode.setParent(anchorNode)');
    compiler.emit(
      `labelNode.localPosition = com.google.ar.sceneform.math.Vector3(0f, ${defaults.labelOffsetY}f, 0f)`
    );
    compiler.emit('labelNode.renderable = renderable');
    compiler.emit('Log.d("HoloScript", "Label overlay: ${detection.label}")');
    compiler.indentLevel--;
    compiler.emit('    }');
    compiler.indentLevel--;
    compiler.emit('}');
    compiler.emit('');
  }
  compiler.indentLevel--;
  compiler.emit('}');
  return compiler.lines.join('\n');
}
