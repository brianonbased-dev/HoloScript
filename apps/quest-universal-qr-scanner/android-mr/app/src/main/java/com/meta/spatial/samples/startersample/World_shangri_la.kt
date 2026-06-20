package com.meta.spatial.samples.startersample

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
 * @generated from worlds/shangri-la.holo by the quest compiler (compile_to_quest, world scene).
 * DO NOT EDIT — change the world in worlds/shangri-la.holo and recompile.
 * Authored in HoloScript, compiled to Meta Spatial SDK entities (geometry -> mesh, color -> Material,
 * position/rotation/scale -> Transform, behavior -> a per-frame WorldAnimated the WorldRenderer ticks).
 */
object World_shangri_la {
  const val displayName = "Shangri La"

  fun build(): WorldBuild {
    val w = WorldBuild()
    // skybox surround (environment.backgroundColor) — occludes passthrough.
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://skybox"), hittable = MeshCollision.NoCollision),
                Material().apply { baseColor = Color4(0.0471f, 0.1647f, 0.2f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "GroundBase" (plane)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-35.0f, -0.05f, -35.0f), Vector3(35.0f, 0.05f, 35.0f)),
                Material().apply { baseColor = Color4(0.0706f, 0.1922f, 0.2275f, 1.0f) },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "Terrace1" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-13.0f, -0.15f, -13.0f), Vector3(13.0f, 0.15f, 13.0f)),
                Material().apply { baseColor = Color4(0.0863f, 0.2314f, 0.251f, 1.0f) },
                Transform(Pose(Vector3(0.0f, 0.15f, 10.0f))),
            )
        )
    )
    // object "Terrace2" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-8.0f, -0.2f, -8.0f), Vector3(8.0f, 0.2f, 8.0f)),
                Material().apply { baseColor = Color4(0.1059f, 0.2706f, 0.2902f, 1.0f) },
                Transform(Pose(Vector3(0.0f, 0.4f, 12.0f))),
            )
        )
    )
    // object "TempleBase" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-3.25f, -0.6f, -3.25f), Vector3(3.25f, 0.6f, 3.25f)),
                Material().apply { baseColor = Color4(0.3569f, 0.2902f, 0.2235f, 1.0f) },
                Transform(Pose(Vector3(0.0f, 1.0f, 13.0f))),
            )
        )
    )
    // object "TempleBody" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-2.2f, -1.3f, -2.2f), Vector3(2.2f, 1.3f, 2.2f)),
                Material().apply { baseColor = Color4(0.4784f, 0.3765f, 0.2824f, 1.0f) },
                Transform(Pose(Vector3(0.0f, 2.8f, 13.0f))),
            )
        )
    )
    // object "TempleRoof" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-2.8f, -0.3f, -2.8f), Vector3(2.8f, 0.3f, 2.8f)),
                Material().apply { baseColor = Color4(0.7098f, 0.5255f, 0.2471f, 1.0f) },
                Transform(Pose(Vector3(0.0f, 4.4f, 13.0f))),
            )
        )
    )
    // object "TempleTier2" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-1.7f, -0.25f, -1.7f), Vector3(1.7f, 0.25f, 1.7f)),
                Material().apply { baseColor = Color4(0.7608f, 0.5765f, 0.2471f, 1.0f) },
                Transform(Pose(Vector3(0.0f, 5.2f, 13.0f))),
            )
        )
    )
    // object "TempleSpire" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.25f, -0.8f, -0.25f), Vector3(0.25f, 0.8f, 0.25f)),
                Material().apply { baseColor = Color4(0.9059f, 0.7608f, 0.3647f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 6.2f, 13.0f))),
            )
        )
    )
    // object "TempleOrb" (sphere, behavior: float)
    val o8 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.5f),
                Material().apply { baseColor = Color4(1.0f, 0.8902f, 0.6039f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 7.4f, 13.0f))),
            )
        )
    w.entities.add(o8)
    w.animated.add(
        WorldAnimated(
            o8,
            "float",
            Vector3(0.0f, 7.4f, 13.0f),
            1.1f,
            0.25f,
            2.0f,
            Vector3(0.0f, 7.4f, 13.0f),
        )
    )
    // object "GateL" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.4f, -1.6f, -0.4f), Vector3(0.4f, 1.6f, 0.4f)),
                Material().apply { baseColor = Color4(0.4196f, 0.3373f, 0.251f, 1.0f) },
                Transform(Pose(Vector3(-4.5f, 1.6f, 4.0f))),
            )
        )
    )
    // object "GateR" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.4f, -1.6f, -0.4f), Vector3(0.4f, 1.6f, 0.4f)),
                Material().apply { baseColor = Color4(0.4196f, 0.3373f, 0.251f, 1.0f) },
                Transform(Pose(Vector3(4.5f, 1.6f, 4.0f))),
            )
        )
    )
    // object "GateLTop" (sphere)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.35f),
                Material().apply { baseColor = Color4(1.0f, 0.8118f, 0.4784f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-4.5f, 3.5f, 4.0f))),
            )
        )
    )
    // object "GateRTop" (sphere)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.35f),
                Material().apply { baseColor = Color4(1.0f, 0.8118f, 0.4784f, 1.0f); unlit = true },
                Transform(Pose(Vector3(4.5f, 3.5f, 4.0f))),
            )
        )
    )
    // object "PillarNW" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.35f, -1.8f, -0.35f), Vector3(0.35f, 1.8f, 0.35f)),
                Material().apply { baseColor = Color4(0.3725f, 0.298f, 0.2235f, 1.0f) },
                Transform(Pose(Vector3(-7.0f, 1.8f, 13.0f))),
            )
        )
    )
    // object "PillarNE" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.35f, -1.8f, -0.35f), Vector3(0.35f, 1.8f, 0.35f)),
                Material().apply { baseColor = Color4(0.3725f, 0.298f, 0.2235f, 1.0f) },
                Transform(Pose(Vector3(7.0f, 1.8f, 13.0f))),
            )
        )
    )
    // object "Guardian" (sphere, behavior: orbit)
    val o15 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.4f),
                Material().apply { baseColor = Color4(0.498f, 0.9059f, 1.0f, 1.0f); unlit = true },
                Transform(Pose(Vector3(6.0f, 3.2f, 13.0f))),
            )
        )
    w.entities.add(o15)
    w.animated.add(
        WorldAnimated(
            o15,
            "orbit",
            Vector3(6.0f, 3.2f, 13.0f),
            0.45f,
            0.2f,
            6.5f,
            Vector3(0.0f, 3.2f, 13.0f),
        )
    )
    // object "WheelL1" (cylinder, behavior: spin)
    val o16 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.45f, -0.6f, -0.45f), Vector3(0.45f, 0.6f, 0.45f)),
                Material().apply { baseColor = Color4(0.6588f, 0.451f, 0.1804f, 1.0f) },
                Transform(Pose(Vector3(-3.0f, 1.3f, 7.0f))),
            )
        )
    w.entities.add(o16)
    w.animated.add(
        WorldAnimated(
            o16,
            "spin",
            Vector3(-3.0f, 1.3f, 7.0f),
            55.0f,
            0.2f,
            2.0f,
            Vector3(-3.0f, 1.3f, 7.0f),
        )
    )
    // object "WheelR1" (cylinder, behavior: spin)
    val o17 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.45f, -0.6f, -0.45f), Vector3(0.45f, 0.6f, 0.45f)),
                Material().apply { baseColor = Color4(0.6588f, 0.451f, 0.1804f, 1.0f) },
                Transform(Pose(Vector3(3.0f, 1.3f, 7.0f))),
            )
        )
    w.entities.add(o17)
    w.animated.add(
        WorldAnimated(
            o17,
            "spin",
            Vector3(3.0f, 1.3f, 7.0f),
            55.0f,
            0.2f,
            2.0f,
            Vector3(3.0f, 1.3f, 7.0f),
        )
    )
    // object "WheelL2" (cylinder, behavior: spin)
    val o18 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.45f, -0.6f, -0.45f), Vector3(0.45f, 0.6f, 0.45f)),
                Material().apply { baseColor = Color4(0.6902f, 0.4863f, 0.2f, 1.0f) },
                Transform(Pose(Vector3(-3.0f, 1.3f, 10.0f))),
            )
        )
    w.entities.add(o18)
    w.animated.add(
        WorldAnimated(
            o18,
            "spin",
            Vector3(-3.0f, 1.3f, 10.0f),
            48.0f,
            0.2f,
            2.0f,
            Vector3(-3.0f, 1.3f, 10.0f),
        )
    )
    // object "WheelR2" (cylinder, behavior: spin)
    val o19 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.45f, -0.6f, -0.45f), Vector3(0.45f, 0.6f, 0.45f)),
                Material().apply { baseColor = Color4(0.6902f, 0.4863f, 0.2f, 1.0f) },
                Transform(Pose(Vector3(3.0f, 1.3f, 10.0f))),
            )
        )
    w.entities.add(o19)
    w.animated.add(
        WorldAnimated(
            o19,
            "spin",
            Vector3(3.0f, 1.3f, 10.0f),
            48.0f,
            0.2f,
            2.0f,
            Vector3(3.0f, 1.3f, 10.0f),
        )
    )
    // object "LanternA" (box, behavior: bob)
    val o20 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.2f, -0.25f, -0.2f), Vector3(0.2f, 0.25f, 0.2f)),
                Material().apply { baseColor = Color4(1.0f, 0.6157f, 0.3608f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-2.2f, 2.6f, 6.0f))),
            )
        )
    w.entities.add(o20)
    w.animated.add(
        WorldAnimated(
            o20,
            "bob",
            Vector3(-2.2f, 2.6f, 6.0f),
            1.6f,
            0.22f,
            2.0f,
            Vector3(-2.2f, 2.6f, 6.0f),
        )
    )
    // object "LanternB" (box, behavior: bob)
    val o21 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.2f, -0.25f, -0.2f), Vector3(0.2f, 0.25f, 0.2f)),
                Material().apply { baseColor = Color4(1.0f, 0.6902f, 0.4196f, 1.0f); unlit = true },
                Transform(Pose(Vector3(2.2f, 3.0f, 6.5f))),
            )
        )
    w.entities.add(o21)
    w.animated.add(
        WorldAnimated(
            o21,
            "bob",
            Vector3(2.2f, 3.0f, 6.5f),
            1.3f,
            0.28f,
            2.0f,
            Vector3(2.2f, 3.0f, 6.5f),
        )
    )
    // object "LanternC" (box, behavior: bob)
    val o22 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.175f, -0.225f, -0.175f), Vector3(0.175f, 0.225f, 0.175f)),
                Material().apply { baseColor = Color4(1.0f, 0.7608f, 0.4902f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-1.4f, 3.4f, 9.0f))),
            )
        )
    w.entities.add(o22)
    w.animated.add(
        WorldAnimated(
            o22,
            "bob",
            Vector3(-1.4f, 3.4f, 9.0f),
            1.9f,
            0.2f,
            2.0f,
            Vector3(-1.4f, 3.4f, 9.0f),
        )
    )
    // object "LanternD" (box, behavior: bob)
    val o23 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.175f, -0.225f, -0.175f), Vector3(0.175f, 0.225f, 0.175f)),
                Material().apply { baseColor = Color4(1.0f, 0.6157f, 0.3608f, 1.0f); unlit = true },
                Transform(Pose(Vector3(1.6f, 2.9f, 9.5f))),
            )
        )
    w.entities.add(o23)
    w.animated.add(
        WorldAnimated(
            o23,
            "bob",
            Vector3(1.6f, 2.9f, 9.5f),
            1.5f,
            0.26f,
            2.0f,
            Vector3(1.6f, 2.9f, 9.5f),
        )
    )
    // object "SpiritA" (sphere, behavior: float)
    val o24 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.225f),
                Material().apply { baseColor = Color4(0.6039f, 1.0f, 0.8157f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-5.0f, 2.4f, 9.0f))),
            )
        )
    w.entities.add(o24)
    w.animated.add(
        WorldAnimated(
            o24,
            "float",
            Vector3(-5.0f, 2.4f, 9.0f),
            1.2f,
            0.35f,
            2.0f,
            Vector3(-5.0f, 2.4f, 9.0f),
        )
    )
    // object "SpiritB" (sphere, behavior: float)
    val o25 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.2f),
                Material().apply { baseColor = Color4(0.498f, 0.9059f, 1.0f, 1.0f); unlit = true },
                Transform(Pose(Vector3(5.0f, 2.8f, 10.0f))),
            )
        )
    w.entities.add(o25)
    w.animated.add(
        WorldAnimated(
            o25,
            "float",
            Vector3(5.0f, 2.8f, 10.0f),
            1.0f,
            0.4f,
            2.0f,
            Vector3(5.0f, 2.8f, 10.0f),
        )
    )
    // object "SpiritC" (sphere, behavior: float)
    val o26 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.25f),
                Material().apply { baseColor = Color4(0.7882f, 0.702f, 1.0f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 3.2f, 4.0f))),
            )
        )
    w.entities.add(o26)
    w.animated.add(
        WorldAnimated(
            o26,
            "float",
            Vector3(0.0f, 3.2f, 4.0f),
            0.9f,
            0.3f,
            2.0f,
            Vector3(0.0f, 3.2f, 4.0f),
        )
    )
    // object "FallL" (box, behavior: sway)
    val o27 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.25f, -3.0f, -0.1f), Vector3(0.25f, 3.0f, 0.1f)),
                Material().apply { baseColor = Color4(0.4353f, 0.8157f, 0.9098f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-2.5f, 4.5f, 18.0f))),
            )
        )
    w.entities.add(o27)
    w.animated.add(
        WorldAnimated(
            o27,
            "sway",
            Vector3(-2.5f, 4.5f, 18.0f),
            1.4f,
            6.0f,
            2.0f,
            Vector3(-2.5f, 4.5f, 18.0f),
        )
    )
    // object "FallR" (box, behavior: sway)
    val o28 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.25f, -3.0f, -0.1f), Vector3(0.25f, 3.0f, 0.1f)),
                Material().apply { baseColor = Color4(0.4353f, 0.8157f, 0.9098f, 1.0f); unlit = true },
                Transform(Pose(Vector3(2.5f, 4.5f, 18.0f))),
            )
        )
    w.entities.add(o28)
    w.animated.add(
        WorldAnimated(
            o28,
            "sway",
            Vector3(2.5f, 4.5f, 18.0f),
            1.2f,
            7.0f,
            2.0f,
            Vector3(2.5f, 4.5f, 18.0f),
        )
    )
    return w
  }
}
