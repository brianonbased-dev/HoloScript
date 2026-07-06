package net.holoscript.qrscanner

import android.net.Uri
import com.meta.spatial.core.Color4
import com.meta.spatial.core.Entity
import com.meta.spatial.core.Pose
import com.meta.spatial.core.Quaternion
import com.meta.spatial.core.Vector3
import com.meta.spatial.toolkit.Box
import com.meta.spatial.toolkit.Material
import com.meta.spatial.toolkit.Mesh
import com.meta.spatial.toolkit.MeshCollision
import com.meta.spatial.toolkit.Sphere
import com.meta.spatial.toolkit.Transform

/*
 * @generated from worlds/apartment-signal-hunt.holo by the quest compiler (compile_to_quest, world scene).
 * DO NOT EDIT — change the world in worlds/apartment-signal-hunt.holo and recompile.
 * Authored in HoloScript, compiled to Meta Spatial SDK entities (geometry -> mesh, color -> Material,
 * position/rotation/scale -> Transform, behavior -> a per-frame WorldAnimated the WorldRenderer ticks).
 */
object World_apartment_signal_hunt {
  const val displayName = "Apartment Signal Hunt"

  fun build(): WorldBuild {
    val w = WorldBuild()
    // skybox surround (environment.backgroundColor) — occludes passthrough.
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://skybox"), hittable = MeshCollision.NoCollision),
                Material().apply { baseColor = Color4(0.0588f, 0.0902f, 0.1647f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "GameFloor" (plane)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-3.2f, -0.05f, -2.6f), Vector3(3.2f, 0.05f, 2.6f)),
                Material().apply { baseColor = Color4(0.0902f, 0.1255f, 0.2f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "Beacon_EntryThreshold" (sphere, behavior: bob)
    val o1 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.14f),
                Material().apply { baseColor = Color4(0.9608f, 0.6196f, 0.0431f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.45f, 2.35f))),
            )
        )
    w.entities.add(o1)
    w.animated.add(
        WorldAnimated(
            o1,
            "bob",
            Vector3(0.0f, 0.45f, 2.35f),
            0.9f,
            0.1f,
            2.0f,
            Vector3(0.0f, 0.45f, 2.35f),
        )
    )
    // object "Beacon_WorkSurface" (sphere, behavior: bob)
    val o2 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.12f),
                Material().apply { baseColor = Color4(0.1333f, 0.7725f, 0.3686f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-1.75f, 1.05f, -0.72f))),
            )
        )
    w.entities.add(o2)
    w.animated.add(
        WorldAnimated(
            o2,
            "bob",
            Vector3(-1.75f, 1.05f, -0.72f),
            1.1f,
            0.08f,
            2.0f,
            Vector3(-1.75f, 1.05f, -0.72f),
        )
    )
    // object "Beacon_QRPortal" (sphere, behavior: orbit)
    val o3 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.15f),
                Material().apply { baseColor = Color4(0.2196f, 0.7412f, 0.9725f, 1.0f); unlit = true },
                Transform(Pose(Vector3(1.1f, 1.45f, -1.95f))),
            )
        )
    w.entities.add(o3)
    w.animated.add(
        WorldAnimated(
            o3,
            "orbit",
            Vector3(1.1f, 1.45f, -1.95f),
            0.75f,
            0.2f,
            0.22f,
            Vector3(1.1f, 1.3f, -1.95f),
        )
    )
    // object "Rule_Sequence" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.02f, -0.02f, -0.02f), Vector3(0.02f, 0.02f, 0.02f)),
                Material().apply { baseColor = Color4(0.0667f, 0.0941f, 0.1529f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(0.0f, -0.25f, 0.0f))),
            )
        )
    )
    // object "Rule_Timer" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.02f, -0.02f, -0.02f), Vector3(0.02f, 0.02f, 0.02f)),
                Material().apply { baseColor = Color4(0.0667f, 0.0941f, 0.1529f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(0.08f, -0.25f, 0.0f))),
            )
        )
    )
    // object "Rule_CompletionReceipt" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.02f, -0.02f, -0.02f), Vector3(0.02f, 0.02f, 0.02f)),
                Material().apply { baseColor = Color4(0.0667f, 0.0941f, 0.1529f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(-0.08f, -0.25f, 0.0f))),
            )
        )
    )
    // object "CompletionMarker" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.45f, -0.06f, -0.45f), Vector3(0.45f, 0.06f, 0.45f)),
                Material().apply { baseColor = Color4(0.0549f, 0.6471f, 0.9137f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(1.1f, 0.08f, -1.95f))),
            )
        )
    )
    return w
  }
}
