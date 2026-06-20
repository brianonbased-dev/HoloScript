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
 * @generated from worlds/aurora.holo by the quest compiler (compile_to_quest, world scene).
 * DO NOT EDIT — change the world in worlds/aurora.holo and recompile.
 * The world is authored in HoloScript and compiled to Meta Spatial SDK entities (geometry → mesh,
 * color → Material, position/rotation/scale → Transform).
 */
object World_aurora {
  const val displayName = "Aurora Fields"

  fun build(): MutableList<Entity> {
    val e = mutableListOf<Entity>()
    // skybox surround (environment.backgroundColor) — occludes passthrough.
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://skybox"), hittable = MeshCollision.NoCollision),
                Material().apply { baseColor = Color4(0.0863f, 0.0392f, 0.1804f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "Ground" (plane)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-22.0f, -0.05f, -22.0f), Vector3(22.0f, 0.05f, 22.0f)),
                Material().apply { baseColor = Color4(0.1412f, 0.0627f, 0.2745f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "SpireA" (box)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.25f, -2.2f, -0.25f), Vector3(0.25f, 2.2f, 0.25f)),
                Material().apply { baseColor = Color4(0.6588f, 0.3333f, 0.9686f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-4.0f, 2.2f, 5.0f))),
            )
        )
    )
    // object "SpireB" (box)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.25f, -3.0f, -0.25f), Vector3(0.25f, 3.0f, 0.25f)),
                Material().apply { baseColor = Color4(0.7529f, 0.5176f, 0.9882f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-1.4f, 3.0f, 6.5f))),
            )
        )
    )
    // object "SpireC" (box)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.25f, -2.6f, -0.25f), Vector3(0.25f, 2.6f, 0.25f)),
                Material().apply { baseColor = Color4(0.9098f, 0.4745f, 0.9765f, 1.0f); unlit = true },
                Transform(Pose(Vector3(1.4f, 2.6f, 6.5f))),
            )
        )
    )
    // object "SpireD" (box)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.25f, -2.0f, -0.25f), Vector3(0.25f, 2.0f, 0.25f)),
                Material().apply { baseColor = Color4(0.6588f, 0.3333f, 0.9686f, 1.0f); unlit = true },
                Transform(Pose(Vector3(4.0f, 2.0f, 5.0f))),
            )
        )
    )
    // object "OrbCyan" (sphere)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.4f),
                Material().apply { baseColor = Color4(0.1333f, 0.8275f, 0.9333f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-3.0f, 2.6f, 2.5f))),
            )
        )
    )
    // object "OrbMint" (sphere)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.35f),
                Material().apply { baseColor = Color4(0.3686f, 0.9176f, 0.8314f, 1.0f); unlit = true },
                Transform(Pose(Vector3(3.0f, 3.1f, 2.5f))),
            )
        )
    )
    // object "OrbRose" (sphere)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.5f),
                Material().apply { baseColor = Color4(0.9843f, 0.4431f, 0.5216f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 1.8f, -4.0f))),
            )
        )
    )
    return e
  }
}
