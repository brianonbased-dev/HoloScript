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
    // object "PineL1" (pine.glb, behavior: sway)
    val o10 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine.glb")),
                Transform(Pose(Vector3(-9.5f, 0.4f, 9.0f))),
            )
        )
    w.entities.add(o10)
    w.animated.add(
        WorldAnimated(
            o10,
            "sway",
            Vector3(-9.5f, 0.4f, 9.0f),
            0.5f,
            0.04f,
            2.0f,
            Vector3(-9.5f, 0.4f, 9.0f),
        )
    )
    // object "PineL2" (pine2.glb, behavior: sway)
    val o11 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine2.glb")),
                Transform(Pose(Vector3(-11.0f, 0.4f, 13.0f))),
            )
        )
    w.entities.add(o11)
    w.animated.add(
        WorldAnimated(
            o11,
            "sway",
            Vector3(-11.0f, 0.4f, 13.0f),
            0.6f,
            0.05f,
            2.0f,
            Vector3(-11.0f, 0.4f, 13.0f),
        )
    )
    // object "PineL3" (pine.glb, behavior: sway)
    val o12 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine.glb")),
                Transform(Pose(Vector3(-10.0f, 0.4f, 17.0f))),
            )
        )
    w.entities.add(o12)
    w.animated.add(
        WorldAnimated(
            o12,
            "sway",
            Vector3(-10.0f, 0.4f, 17.0f),
            0.45f,
            0.04f,
            2.0f,
            Vector3(-10.0f, 0.4f, 17.0f),
        )
    )
    // object "PineL4" (pine3.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine3.glb")),
                Transform(Pose(Vector3(-8.0f, 0.4f, 11.0f))),
            )
        )
    )
    // object "PineL5" (pine3.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine3.glb")),
                Transform(Pose(Vector3(-12.0f, 0.4f, 16.0f))),
            )
        )
    )
    // object "PineR1" (pine.glb, behavior: sway)
    val o15 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine.glb")),
                Transform(Pose(Vector3(9.5f, 0.4f, 10.0f))),
            )
        )
    w.entities.add(o15)
    w.animated.add(
        WorldAnimated(
            o15,
            "sway",
            Vector3(9.5f, 0.4f, 10.0f),
            0.55f,
            0.04f,
            2.0f,
            Vector3(9.5f, 0.4f, 10.0f),
        )
    )
    // object "PineR2" (pine2.glb, behavior: sway)
    val o16 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine2.glb")),
                Transform(Pose(Vector3(11.0f, 0.4f, 14.0f))),
            )
        )
    w.entities.add(o16)
    w.animated.add(
        WorldAnimated(
            o16,
            "sway",
            Vector3(11.0f, 0.4f, 14.0f),
            0.5f,
            0.05f,
            2.0f,
            Vector3(11.0f, 0.4f, 14.0f),
        )
    )
    // object "PineR3" (pine.glb, behavior: sway)
    val o17 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine.glb")),
                Transform(Pose(Vector3(10.5f, 0.4f, 18.0f))),
            )
        )
    w.entities.add(o17)
    w.animated.add(
        WorldAnimated(
            o17,
            "sway",
            Vector3(10.5f, 0.4f, 18.0f),
            0.48f,
            0.04f,
            2.0f,
            Vector3(10.5f, 0.4f, 18.0f),
        )
    )
    // object "PineR4" (pine3.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine3.glb")),
                Transform(Pose(Vector3(8.5f, 0.4f, 12.0f))),
            )
        )
    )
    // object "PineR5" (pine3.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine3.glb")),
                Transform(Pose(Vector3(12.0f, 0.4f, 17.0f))),
            )
        )
    )
    // object "PineB1" (pine2.glb, behavior: sway)
    val o20 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine2.glb")),
                Transform(Pose(Vector3(-4.5f, 0.4f, 22.0f))),
            )
        )
    w.entities.add(o20)
    w.animated.add(
        WorldAnimated(
            o20,
            "sway",
            Vector3(-4.5f, 0.4f, 22.0f),
            0.5f,
            0.05f,
            2.0f,
            Vector3(-4.5f, 0.4f, 22.0f),
        )
    )
    // object "PineB2" (pine.glb, behavior: sway)
    val o21 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine.glb")),
                Transform(Pose(Vector3(2.0f, 0.4f, 23.0f))),
            )
        )
    w.entities.add(o21)
    w.animated.add(
        WorldAnimated(
            o21,
            "sway",
            Vector3(2.0f, 0.4f, 23.0f),
            0.46f,
            0.04f,
            2.0f,
            Vector3(2.0f, 0.4f, 23.0f),
        )
    )
    // object "PineB3" (pine3.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/pine3.glb")),
                Transform(Pose(Vector3(5.0f, 0.4f, 21.0f))),
            )
        )
    )
    // object "OakL1" (broadleaf.glb, behavior: sway)
    val o23 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/broadleaf.glb")),
                Transform(Pose(Vector3(-6.0f, 0.4f, 6.0f))),
            )
        )
    w.entities.add(o23)
    w.animated.add(
        WorldAnimated(
            o23,
            "sway",
            Vector3(-6.0f, 0.4f, 6.0f),
            0.4f,
            0.05f,
            2.0f,
            Vector3(-6.0f, 0.4f, 6.0f),
        )
    )
    // object "OakL2" (broadleaf2.glb, behavior: sway)
    val o24 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/broadleaf2.glb")),
                Transform(Pose(Vector3(-13.0f, 0.4f, 10.0f))),
            )
        )
    w.entities.add(o24)
    w.animated.add(
        WorldAnimated(
            o24,
            "sway",
            Vector3(-13.0f, 0.4f, 10.0f),
            0.35f,
            0.06f,
            2.0f,
            Vector3(-13.0f, 0.4f, 10.0f),
        )
    )
    // object "OakR1" (broadleaf.glb, behavior: sway)
    val o25 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/broadleaf.glb")),
                Transform(Pose(Vector3(6.0f, 0.4f, 6.5f))),
            )
        )
    w.entities.add(o25)
    w.animated.add(
        WorldAnimated(
            o25,
            "sway",
            Vector3(6.0f, 0.4f, 6.5f),
            0.42f,
            0.05f,
            2.0f,
            Vector3(6.0f, 0.4f, 6.5f),
        )
    )
    // object "OakR2" (broadleaf2.glb, behavior: sway)
    val o26 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/broadleaf2.glb")),
                Transform(Pose(Vector3(13.0f, 0.4f, 11.0f))),
            )
        )
    w.entities.add(o26)
    w.animated.add(
        WorldAnimated(
            o26,
            "sway",
            Vector3(13.0f, 0.4f, 11.0f),
            0.36f,
            0.06f,
            2.0f,
            Vector3(13.0f, 0.4f, 11.0f),
        )
    )
    // object "OakFront" (broadleaf.glb, behavior: sway)
    val o27 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/broadleaf.glb")),
                Transform(Pose(Vector3(-3.5f, 0.4f, 2.0f))),
            )
        )
    w.entities.add(o27)
    w.animated.add(
        WorldAnimated(
            o27,
            "sway",
            Vector3(-3.5f, 0.4f, 2.0f),
            0.4f,
            0.05f,
            2.0f,
            Vector3(-3.5f, 0.4f, 2.0f),
        )
    )
    // object "OakBack" (broadleaf2.glb, behavior: sway)
    val o28 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/broadleaf2.glb")),
                Transform(Pose(Vector3(-1.0f, 0.4f, 24.0f))),
            )
        )
    w.entities.add(o28)
    w.animated.add(
        WorldAnimated(
            o28,
            "sway",
            Vector3(-1.0f, 0.4f, 24.0f),
            0.33f,
            0.06f,
            2.0f,
            Vector3(-1.0f, 0.4f, 24.0f),
        )
    )
    // object "GrassA" (grass_patch.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/grass_patch.glb")),
                Transform(Pose(Vector3(-4.0f, 0.4f, 5.0f))),
            )
        )
    )
    // object "GrassB" (grass_patch.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/grass_patch.glb")),
                Transform(Pose(Vector3(-1.0f, 0.4f, 7.0f))),
            )
        )
    )
    // object "GrassC" (grass_patch2.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/grass_patch2.glb")),
                Transform(Pose(Vector3(2.5f, 0.4f, 6.0f))),
            )
        )
    )
    // object "GrassD" (grass_patch.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/grass_patch.glb")),
                Transform(Pose(Vector3(4.5f, 0.4f, 9.0f))),
            )
        )
    )
    // object "GrassE" (grass_patch2.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/grass_patch2.glb")),
                Transform(Pose(Vector3(-4.5f, 0.4f, 11.0f))),
            )
        )
    )
    // object "GrassF" (grass_patch.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/grass_patch.glb")),
                Transform(Pose(Vector3(0.0f, 0.4f, 11.0f))),
            )
        )
    )
    // object "GrassG" (grass_patch.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/grass_patch.glb")),
                Transform(Pose(Vector3(4.0f, 0.4f, 13.0f))),
            )
        )
    )
    // object "GrassH" (grass_patch2.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/grass_patch2.glb")),
                Transform(Pose(Vector3(-3.0f, 0.4f, 16.0f))),
            )
        )
    )
    // object "GrassI" (grass_patch.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/grass_patch.glb")),
                Transform(Pose(Vector3(2.5f, 0.4f, 17.0f))),
            )
        )
    )
    // object "GrassJ" (grass_patch.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/grass_patch.glb")),
                Transform(Pose(Vector3(-1.0f, 0.4f, 3.0f))),
            )
        )
    )
    // object "GrassK" (grass_patch2.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/grass_patch2.glb")),
                Transform(Pose(Vector3(6.0f, 0.4f, 4.0f))),
            )
        )
    )
    // object "GrassL" (grass_patch.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/grass_patch.glb")),
                Transform(Pose(Vector3(-6.5f, 0.4f, 4.0f))),
            )
        )
    )
    // object "RockA" (rock_cluster.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/rock_cluster.glb")),
                Transform(Pose(Vector3(-5.5f, 0.4f, 9.0f))),
            )
        )
    )
    // object "RockB" (rock_cluster.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/rock_cluster.glb")),
                Transform(Pose(Vector3(5.5f, 0.4f, 11.0f))),
            )
        )
    )
    // object "RockC" (rock_cluster.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/rock_cluster.glb")),
                Transform(Pose(Vector3(-8.5f, 0.4f, 15.0f))),
            )
        )
    )
    // object "RockD" (rock_cluster.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/rock_cluster.glb")),
                Transform(Pose(Vector3(7.0f, 0.4f, 7.0f))),
            )
        )
    )
    // object "RockE" (rock_cluster.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/rock_cluster.glb")),
                Transform(Pose(Vector3(1.5f, 0.4f, 20.0f))),
            )
        )
    )
    // object "BushA" (bush.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/bush.glb")),
                Transform(Pose(Vector3(-2.5f, 0.4f, 4.0f))),
            )
        )
    )
    // object "BushB" (bush.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/bush.glb")),
                Transform(Pose(Vector3(3.0f, 0.4f, 4.5f))),
            )
        )
    )
    // object "BushC" (bush.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/bush.glb")),
                Transform(Pose(Vector3(-6.0f, 0.4f, 12.0f))),
            )
        )
    )
    // object "BushD" (bush.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/bush.glb")),
                Transform(Pose(Vector3(6.5f, 0.4f, 14.0f))),
            )
        )
    )
    // object "BushE" (bush.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/bush.glb")),
                Transform(Pose(Vector3(-3.5f, 0.4f, 19.0f))),
            )
        )
    )
    // object "BushF" (bush.glb)
    w.entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("apk:///models/bush.glb")),
                Transform(Pose(Vector3(4.0f, 0.4f, 19.5f))),
            )
        )
    )
    // object "Brittney" (sphere, behavior: float) @agent brittney
    val o52 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.25f),
                Material().apply { baseColor = Color4(1.0f, 0.8275f, 0.6039f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-1.8f, 1.4f, 6.0f))),
            )
        )
    w.entities.add(o52)
    w.animated.add(
        WorldAnimated(
            o52,
            "float",
            Vector3(-1.8f, 1.4f, 6.0f),
            1.0f,
            0.25f,
            2.0f,
            Vector3(-1.8f, 1.4f, 6.0f),
        )
    )
    // object "Guardian" (sphere, behavior: orbit)
    val o53 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.35f),
                Material().apply { baseColor = Color4(0.498f, 0.9059f, 1.0f, 1.0f); unlit = true },
                Transform(Pose(Vector3(6.0f, 3.4f, 13.0f))),
            )
        )
    w.entities.add(o53)
    w.animated.add(
        WorldAnimated(
            o53,
            "orbit",
            Vector3(6.0f, 3.4f, 13.0f),
            0.45f,
            0.2f,
            6.5f,
            Vector3(0.0f, 3.4f, 13.0f),
        )
    )
    // object "LanternA" (box, behavior: bob)
    val o54 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.2f, -0.25f, -0.2f), Vector3(0.2f, 0.25f, 0.2f)),
                Material().apply { baseColor = Color4(1.0f, 0.6157f, 0.3608f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-2.4f, 2.6f, 6.0f))),
            )
        )
    w.entities.add(o54)
    w.animated.add(
        WorldAnimated(
            o54,
            "bob",
            Vector3(-2.4f, 2.6f, 6.0f),
            1.6f,
            0.22f,
            2.0f,
            Vector3(-2.4f, 2.6f, 6.0f),
        )
    )
    // object "LanternB" (box, behavior: bob)
    val o55 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.2f, -0.25f, -0.2f), Vector3(0.2f, 0.25f, 0.2f)),
                Material().apply { baseColor = Color4(1.0f, 0.6902f, 0.4196f, 1.0f); unlit = true },
                Transform(Pose(Vector3(2.4f, 3.0f, 6.5f))),
            )
        )
    w.entities.add(o55)
    w.animated.add(
        WorldAnimated(
            o55,
            "bob",
            Vector3(2.4f, 3.0f, 6.5f),
            1.3f,
            0.28f,
            2.0f,
            Vector3(2.4f, 3.0f, 6.5f),
        )
    )
    // object "LanternC" (box, behavior: bob)
    val o56 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.175f, -0.225f, -0.175f), Vector3(0.175f, 0.225f, 0.175f)),
                Material().apply { baseColor = Color4(1.0f, 0.7608f, 0.4902f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-1.4f, 3.4f, 9.5f))),
            )
        )
    w.entities.add(o56)
    w.animated.add(
        WorldAnimated(
            o56,
            "bob",
            Vector3(-1.4f, 3.4f, 9.5f),
            1.9f,
            0.2f,
            2.0f,
            Vector3(-1.4f, 3.4f, 9.5f),
        )
    )
    // object "SpiritA" (sphere, behavior: float)
    val o57 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.2f),
                Material().apply { baseColor = Color4(0.6039f, 1.0f, 0.8157f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-5.0f, 2.4f, 9.0f))),
            )
        )
    w.entities.add(o57)
    w.animated.add(
        WorldAnimated(
            o57,
            "float",
            Vector3(-5.0f, 2.4f, 9.0f),
            1.2f,
            0.35f,
            2.0f,
            Vector3(-5.0f, 2.4f, 9.0f),
        )
    )
    // object "SpiritB" (sphere, behavior: float)
    val o58 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.2f),
                Material().apply { baseColor = Color4(0.498f, 0.9059f, 1.0f, 1.0f); unlit = true },
                Transform(Pose(Vector3(5.0f, 2.8f, 10.0f))),
            )
        )
    w.entities.add(o58)
    w.animated.add(
        WorldAnimated(
            o58,
            "float",
            Vector3(5.0f, 2.8f, 10.0f),
            1.0f,
            0.4f,
            2.0f,
            Vector3(5.0f, 2.8f, 10.0f),
        )
    )
    // object "SpiritC" (sphere, behavior: float)
    val o59 =
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.225f),
                Material().apply { baseColor = Color4(0.7882f, 0.702f, 1.0f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 3.0f, 4.0f))),
            )
        )
    w.entities.add(o59)
    w.animated.add(
        WorldAnimated(
            o59,
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
