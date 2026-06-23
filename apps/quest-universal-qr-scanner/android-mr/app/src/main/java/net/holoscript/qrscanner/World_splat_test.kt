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
 * @generated from worlds/splat-test.holo by the quest compiler (compile_to_quest, world scene).
 * DO NOT EDIT — change the world in worlds/splat-test.holo and recompile.
 * Authored in HoloScript, compiled to Meta Spatial SDK entities (geometry -> mesh, color -> Material,
 * position/rotation/scale -> Transform, behavior -> a per-frame WorldAnimated the WorldRenderer ticks).
 */
@OptIn(SpatialSDKExperimentalSplatAPI::class)
object World_splat_test {
  const val displayName = "Splat Test"

  fun build(): WorldBuild {
    val w = WorldBuild()
    // skybox surround (environment.backgroundColor) — occludes passthrough.
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://skybox"), hittable = MeshCollision.NoCollision),
                Material().apply { baseColor = Color4(0.0392f, 0.0392f, 0.0706f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "Ground" (plane)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-10.0f, -0.05f, -10.0f), Vector3(10.0f, 0.05f, 10.0f)),
                Material().apply { baseColor = Color4(0.0824f, 0.0824f, 0.1216f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "TestOrb" (splat: test-orb.spz)
    w.entities.add(
        Entity.create(
            listOf(
                Splat(Uri.parse("apk:///splats/test-orb.spz")),
                Transform(Pose(Vector3(0.0f, 1.4f, -2.2f))),
            )
        )
    )
    return w
  }
}
