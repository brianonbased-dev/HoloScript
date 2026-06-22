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
    // object "Terrace" (box)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-10.0f, -0.2f, -10.0f), Vector3(10.0f, 0.2f, 10.0f)),
                Material().apply { baseColor = Color4(0.0863f, 0.2314f, 0.251f, 1.0f) },
                Transform(Pose(Vector3(0.0f, 0.2f, 12.0f))),
            )
        )
    )
    // object "Temple" (temple.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/temple.glb")),
                Transform(Pose(Vector3(0.0f, 0.4f, 13.0f))),
            )
        )
    )
    // object "GateMain" (gate.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/gate.glb")),
                Transform(Pose(Vector3(0.0f, 0.0f, 5.0f))),
            )
        )
    )
    // object "CliffL" (cliff.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/cliff.glb")),
                Transform(Pose(Vector3(-7.5f, 0.0f, 13.0f))),
            )
        )
    )
    // object "CliffR" (cliff.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/cliff.glb")),
                Transform(Pose(Vector3(7.5f, 0.0f, 15.0f))),
            )
        )
    )
    // object "CliffBack" (cliff.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/cliff.glb")),
                Transform(Pose(Vector3(-2.5f, 0.0f, 20.0f))),
            )
        )
    )
    // object "LotusA" (lotus.glb, behavior: bob)
    val o7 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/lotus.glb")),
                Transform(Pose(Vector3(-3.4f, 0.45f, 8.0f))),
            )
        )
    w.entities.add(o7)
    w.animated.add(
        WorldAnimated(
            o7,
            "bob",
            Vector3(-3.4f, 0.45f, 8.0f),
            0.9f,
            0.07f,
            2.0f,
            Vector3(-3.4f, 0.45f, 8.0f),
        )
    )
    // object "LotusB" (lotus.glb, behavior: bob)
    val o8 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/lotus.glb")),
                Transform(Pose(Vector3(3.4f, 0.45f, 9.5f))),
            )
        )
    w.entities.add(o8)
    w.animated.add(
        WorldAnimated(
            o8,
            "bob",
            Vector3(3.4f, 0.45f, 9.5f),
            0.7f,
            0.09f,
            2.0f,
            Vector3(3.4f, 0.45f, 9.5f),
        )
    )
    // object "HoloSpire" (holo_spire.glb, behavior: bob)
    val o9 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/holo_spire.glb")),
                Transform(Pose(Vector3(0.0f, 0.9f, 7.0f))),
            )
        )
    w.entities.add(o9)
    w.animated.add(
        WorldAnimated(
            o9,
            "bob",
            Vector3(0.0f, 0.9f, 7.0f),
            0.5f,
            0.08f,
            2.0f,
            Vector3(0.0f, 0.9f, 7.0f),
        )
    )
    // object "Brittney" (sphere, behavior: float) @agent brittney
    val o10 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.25f),
                Material().apply { baseColor = Color4(1.0f, 0.8275f, 0.6039f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-1.8f, 1.4f, 6.0f))),
            )
        )
    w.entities.add(o10)
    w.animated.add(
        WorldAnimated(
            o10,
            "float",
            Vector3(-1.8f, 1.4f, 6.0f),
            1.0f,
            0.25f,
            2.0f,
            Vector3(-1.8f, 1.4f, 6.0f),
        )
    )
    // object "Guardian" (sphere, behavior: orbit)
    val o11 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.35f),
                Material().apply { baseColor = Color4(0.498f, 0.9059f, 1.0f, 1.0f); unlit = true },
                Transform(Pose(Vector3(6.0f, 3.4f, 13.0f))),
            )
        )
    w.entities.add(o11)
    w.animated.add(
        WorldAnimated(
            o11,
            "orbit",
            Vector3(6.0f, 3.4f, 13.0f),
            0.45f,
            0.2f,
            6.5f,
            Vector3(0.0f, 3.4f, 13.0f),
        )
    )
    // object "LanternA" (box, behavior: bob)
    val o12 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.2f, -0.25f, -0.2f), Vector3(0.2f, 0.25f, 0.2f)),
                Material().apply { baseColor = Color4(1.0f, 0.6157f, 0.3608f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-2.4f, 2.6f, 6.0f))),
            )
        )
    w.entities.add(o12)
    w.animated.add(
        WorldAnimated(
            o12,
            "bob",
            Vector3(-2.4f, 2.6f, 6.0f),
            1.6f,
            0.22f,
            2.0f,
            Vector3(-2.4f, 2.6f, 6.0f),
        )
    )
    // object "LanternB" (box, behavior: bob)
    val o13 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.2f, -0.25f, -0.2f), Vector3(0.2f, 0.25f, 0.2f)),
                Material().apply { baseColor = Color4(1.0f, 0.6902f, 0.4196f, 1.0f); unlit = true },
                Transform(Pose(Vector3(2.4f, 3.0f, 6.5f))),
            )
        )
    w.entities.add(o13)
    w.animated.add(
        WorldAnimated(
            o13,
            "bob",
            Vector3(2.4f, 3.0f, 6.5f),
            1.3f,
            0.28f,
            2.0f,
            Vector3(2.4f, 3.0f, 6.5f),
        )
    )
    // object "LanternC" (box, behavior: bob)
    val o14 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.175f, -0.225f, -0.175f), Vector3(0.175f, 0.225f, 0.175f)),
                Material().apply { baseColor = Color4(1.0f, 0.7608f, 0.4902f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-1.4f, 3.4f, 9.5f))),
            )
        )
    w.entities.add(o14)
    w.animated.add(
        WorldAnimated(
            o14,
            "bob",
            Vector3(-1.4f, 3.4f, 9.5f),
            1.9f,
            0.2f,
            2.0f,
            Vector3(-1.4f, 3.4f, 9.5f),
        )
    )
    // object "SpiritA" (sphere, behavior: float)
    val o15 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.2f),
                Material().apply { baseColor = Color4(0.6039f, 1.0f, 0.8157f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-5.0f, 2.4f, 9.0f))),
            )
        )
    w.entities.add(o15)
    w.animated.add(
        WorldAnimated(
            o15,
            "float",
            Vector3(-5.0f, 2.4f, 9.0f),
            1.2f,
            0.35f,
            2.0f,
            Vector3(-5.0f, 2.4f, 9.0f),
        )
    )
    // object "SpiritB" (sphere, behavior: float)
    val o16 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.2f),
                Material().apply { baseColor = Color4(0.498f, 0.9059f, 1.0f, 1.0f); unlit = true },
                Transform(Pose(Vector3(5.0f, 2.8f, 10.0f))),
            )
        )
    w.entities.add(o16)
    w.animated.add(
        WorldAnimated(
            o16,
            "float",
            Vector3(5.0f, 2.8f, 10.0f),
            1.0f,
            0.4f,
            2.0f,
            Vector3(5.0f, 2.8f, 10.0f),
        )
    )
    // object "SpiritC" (sphere, behavior: float)
    val o17 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.225f),
                Material().apply { baseColor = Color4(0.7882f, 0.702f, 1.0f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 3.0f, 4.0f))),
            )
        )
    w.entities.add(o17)
    w.animated.add(
        WorldAnimated(
            o17,
            "float",
            Vector3(0.0f, 3.0f, 4.0f),
            0.9f,
            0.3f,
            2.0f,
            Vector3(0.0f, 3.0f, 4.0f),
        )
    )
    return w
  }
}
