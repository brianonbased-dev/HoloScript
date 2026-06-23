package net.holoscript.qrscanner

import android.net.Uri
import com.meta.spatial.core.Color4
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
import com.meta.spatial.splat.Splat
import com.meta.spatial.splat.SpatialSDKExperimentalSplatAPI
import com.meta.spatial.toolkit.Box
import com.meta.spatial.toolkit.Material
import com.meta.spatial.toolkit.Mesh
import com.meta.spatial.toolkit.MeshCollision
import com.meta.spatial.toolkit.Sphere
import com.meta.spatial.toolkit.Transform

/*
 * @generated from worlds/s23-capture.holo by the quest compiler (compile_to_quest, world scene).
 * DO NOT EDIT — change the world in worlds/s23-capture.holo and recompile.
 * Authored in HoloScript, compiled to Meta Spatial SDK entities (geometry -> mesh, color -> Material,
 * position/rotation/scale -> Transform, behavior -> a per-frame WorldAnimated the WorldRenderer ticks).
 */
@OptIn(SpatialSDKExperimentalSplatAPI::class)
object World_s23_capture {
  const val displayName = "S23Capture"

  fun build(): WorldBuild {
    val w = WorldBuild()
    // skybox surround (environment.backgroundColor) — occludes passthrough.
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://skybox"), hittable = MeshCollision.NoCollision),
                Material().apply { baseColor = Color4(0.0431f, 0.0549f, 0.0784f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "Ground" (plane)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-12.0f, -0.05f, -12.0f), Vector3(12.0f, 0.05f, 12.0f)),
                Material().apply { baseColor = Color4(0.0706f, 0.0824f, 0.1098f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "Capture" (splat: s23-scene.spz)
    w.entities.add(
        Entity.create(
            listOf(
                Splat(Uri.parse("apk:///splats/s23-scene.spz")),
                Transform(Pose(Vector3(0.0f, 1.5f, -6.0f))),
            )
        )
    )
    return w
  }
}
