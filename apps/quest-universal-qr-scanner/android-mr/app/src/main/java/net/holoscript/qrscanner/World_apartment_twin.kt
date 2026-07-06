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
 * @generated from worlds/apartment-twin.holo by the quest compiler (compile_to_quest, world scene).
 * DO NOT EDIT — change the world in worlds/apartment-twin.holo and recompile.
 * Authored in HoloScript, compiled to Meta Spatial SDK entities (geometry -> mesh, color -> Material,
 * position/rotation/scale -> Transform, behavior -> a per-frame WorldAnimated the WorldRenderer ticks).
 */
object World_apartment_twin {
  const val displayName = "Apartment Twin"

  fun build(): WorldBuild {
    val w = WorldBuild()
    // skybox surround (environment.backgroundColor) — occludes passthrough.
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://skybox"), hittable = MeshCollision.NoCollision),
                Material().apply { baseColor = Color4(0.0627f, 0.0784f, 0.1098f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "CoordinateFrame_LocalFloor" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.09f, -0.03f, -0.09f), Vector3(0.09f, 0.03f, 0.09f)),
                Material().apply { baseColor = Color4(0.9725f, 0.9804f, 0.9882f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(0.0f, 0.03f, 0.0f))),
            )
        )
    )
    // object "Surface_FloorPlane" (plane)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-3.2f, -0.05f, -2.6f), Vector3(3.2f, 0.05f, 2.6f)),
                Material().apply { baseColor = Color4(0.1843f, 0.2157f, 0.2706f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "Surface_NorthWall" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-3.2f, -1.35f, -0.04f), Vector3(3.2f, 1.35f, 0.04f)),
                Material().apply { baseColor = Color4(0.2118f, 0.2588f, 0.3373f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(0.0f, 1.35f, -2.6f))),
            )
        )
    )
    // object "Surface_EastWall" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.04f, -1.35f, -2.6f), Vector3(0.04f, 1.35f, 2.6f)),
                Material().apply { baseColor = Color4(0.2f, 0.2549f, 0.3333f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(3.2f, 1.35f, 0.0f))),
            )
        )
    )
    // object "Surface_WindowWall" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.04f, -1.35f, -1.55f), Vector3(0.04f, 1.35f, 1.55f)),
                Material().apply { baseColor = Color4(0.1608f, 0.2078f, 0.2824f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(-3.2f, 1.35f, 0.3f))),
            )
        )
    )
    // object "Zone_LivingWorkspace" (plane)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-1.3f, -0.05f, -1.05f), Vector3(1.3f, 0.05f, 1.05f)),
                Material().apply { baseColor = Color4(0.1137f, 0.3059f, 0.8471f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(-1.25f, 0.025f, -0.85f))),
            )
        )
    )
    // object "Zone_PortalPath" (plane)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.95f, -0.05f, -1.55f), Vector3(0.95f, 0.05f, 1.55f)),
                Material().apply { baseColor = Color4(0.0588f, 0.4627f, 0.4314f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(1.15f, 0.03f, -0.25f))),
            )
        )
    )
    // object "Zone_DeviceBench" (plane)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-1.4f, -0.05f, -0.575f), Vector3(1.4f, 0.05f, 0.575f)),
                Material().apply { baseColor = Color4(0.4863f, 0.2275f, 0.9294f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(-1.6f, 0.035f, 1.45f))),
            )
        )
    )
    // object "Anchor_EntryThreshold" (sphere)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.08f),
                Material().apply { baseColor = Color4(0.9608f, 0.6196f, 0.0431f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.18f, 2.35f))),
            )
        )
    )
    // object "Anchor_WorkSurface" (sphere)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.07f),
                Material().apply { baseColor = Color4(0.1333f, 0.7725f, 0.3686f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-1.75f, 0.82f, -0.72f))),
            )
        )
    )
    // object "Anchor_QRPortal" (sphere, behavior: bob)
    val o10 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.09f),
                Material().apply { baseColor = Color4(0.2196f, 0.7412f, 0.9725f, 1.0f); unlit = true },
                Transform(Pose(Vector3(1.1f, 1.28f, -1.95f))),
            )
        )
    w.entities.add(o10)
    w.animated.add(
        WorldAnimated(
            o10,
            "bob",
            Vector3(1.1f, 1.28f, -1.95f),
            0.7f,
            0.08f,
            2.0f,
            Vector3(1.1f, 1.28f, -1.95f),
        )
    )
    // object "ReconstructionAsset_PrivateCapture" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-2.9f, -1.15f, -2.3f), Vector3(2.9f, 1.15f, 2.3f)),
                Material().apply { baseColor = Color4(0.2784f, 0.3333f, 0.4118f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(0.0f, 1.15f, 0.0f))),
            )
        )
    )
    // object "FallbackRoomShell" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-3.175f, -1.2f, -2.575f), Vector3(3.175f, 1.2f, 2.575f)),
                Material().apply { baseColor = Color4(0.1216f, 0.1608f, 0.2157f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(0.0f, 1.2f, 0.0f))),
            )
        )
    )
    return w
  }
}
