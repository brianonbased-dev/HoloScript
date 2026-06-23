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
 * @generated from worlds/aurora.holo by the quest compiler (compile_to_quest, world scene).
 * DO NOT EDIT — change the world in worlds/aurora.holo and recompile.
 * Authored in HoloScript, compiled to Meta Spatial SDK entities (geometry -> mesh, color -> Material,
 * position/rotation/scale -> Transform, behavior -> a per-frame WorldAnimated the WorldRenderer ticks).
 */
object World_aurora {
  const val displayName = "Aurora Fields"

  fun build(): WorldBuild {
    val w = WorldBuild()
    // skybox surround (environment.backgroundColor) — occludes passthrough.
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://skybox"), hittable = MeshCollision.NoCollision),
                Material().apply { baseColor = Color4(0.0863f, 0.0392f, 0.1804f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "Ground" (plane)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-22.0f, -0.05f, -22.0f), Vector3(22.0f, 0.05f, 22.0f)),
                Material().apply { baseColor = Color4(0.1412f, 0.0627f, 0.2745f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "SpireA" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.25f, -2.2f, -0.25f), Vector3(0.25f, 2.2f, 0.25f)),
                Material().apply { baseColor = Color4(0.6588f, 0.3333f, 0.9686f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(-4.0f, 2.2f, 5.0f))),
            )
        )
    )
    // object "SpireB" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.25f, -3.0f, -0.25f), Vector3(0.25f, 3.0f, 0.25f)),
                Material().apply { baseColor = Color4(0.7529f, 0.5176f, 0.9882f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(-1.4f, 3.0f, 6.5f))),
            )
        )
    )
    // object "SpireC" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.25f, -2.6f, -0.25f), Vector3(0.25f, 2.6f, 0.25f)),
                Material().apply { baseColor = Color4(0.9098f, 0.4745f, 0.9765f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(1.4f, 2.6f, 6.5f))),
            )
        )
    )
    // object "SpireD" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.25f, -2.0f, -0.25f), Vector3(0.25f, 2.0f, 0.25f)),
                Material().apply { baseColor = Color4(0.6588f, 0.3333f, 0.9686f, 1.0f); roughness = 0.85f; metallic = 0.0f },
                Transform(Pose(Vector3(4.0f, 2.0f, 5.0f))),
            )
        )
    )
    // object "OrbCyan" (sphere, behavior: float)
    val o5 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.4f),
                Material().apply { baseColor = Color4(0.1333f, 0.8275f, 0.9333f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-3.0f, 2.6f, 2.5f))),
            )
        )
    w.entities.add(o5)
    w.animated.add(
        WorldAnimated(
            o5,
            "float",
            Vector3(-3.0f, 2.6f, 2.5f),
            1.1f,
            0.35f,
            2.0f,
            Vector3(-3.0f, 2.6f, 2.5f),
        )
    )
    // object "OrbMint" (sphere, behavior: bob)
    val o6 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.35f),
                Material().apply { baseColor = Color4(0.3686f, 0.9176f, 0.8314f, 1.0f); unlit = true },
                Transform(Pose(Vector3(3.0f, 3.1f, 2.5f))),
            )
        )
    w.entities.add(o6)
    w.animated.add(
        WorldAnimated(
            o6,
            "bob",
            Vector3(3.0f, 3.1f, 2.5f),
            1.4f,
            0.3f,
            2.0f,
            Vector3(3.0f, 3.1f, 2.5f),
        )
    )
    // object "OrbRose" (sphere, behavior: float)
    val o7 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.5f),
                Material().apply { baseColor = Color4(0.9843f, 0.4431f, 0.5216f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 1.8f, -4.0f))),
            )
        )
    w.entities.add(o7)
    w.animated.add(
        WorldAnimated(
            o7,
            "float",
            Vector3(0.0f, 1.8f, -4.0f),
            0.9f,
            0.4f,
            2.0f,
            Vector3(0.0f, 1.8f, -4.0f),
        )
    )
    // object "Wisp" (sphere, behavior: orbit)
    val o8 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.25f),
                Material().apply { baseColor = Color4(0.9137f, 0.8353f, 1.0f, 1.0f); unlit = true },
                Transform(Pose(Vector3(4.0f, 3.4f, 6.0f))),
            )
        )
    w.entities.add(o8)
    w.animated.add(
        WorldAnimated(
            o8,
            "orbit",
            Vector3(4.0f, 3.4f, 6.0f),
            0.5f,
            0.2f,
            5.5f,
            Vector3(0.0f, 3.4f, 6.0f),
        )
    )
    return w
  }
}
