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
 * @generated from worlds/hololand.holo by the quest compiler (compile_to_quest, world scene).
 * DO NOT EDIT — change the world in worlds/hololand.holo and recompile.
 * The world is authored in HoloScript and compiled to Meta Spatial SDK entities (geometry → mesh,
 * color → Material, position/rotation/scale → Transform).
 */
object World_hololand {
  const val displayName = "Holo Land"

  fun build(): MutableList<Entity> {
    val e = mutableListOf<Entity>()
    // skybox surround (environment.backgroundColor) — occludes passthrough.
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://skybox"), hittable = MeshCollision.NoCollision),
                Material().apply { baseColor = Color4(0.0392f, 0.0902f, 0.1882f, 1.0f); unlit = true },
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
                Material().apply { baseColor = Color4(0.0549f, 0.1412f, 0.2588f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 0.0f, 0.0f))),
            )
        )
    )
    // object "Monument" (box)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.65f, -1.7f, -0.65f), Vector3(0.65f, 1.7f, 0.65f)),
                Material().apply { baseColor = Color4(0.1137f, 0.3059f, 0.8471f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 1.7f, 6.0f))),
            )
        )
    )
    // object "MonumentOrb" (sphere)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.65f),
                Material().apply { baseColor = Color4(0.2196f, 0.7412f, 0.9725f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 3.9f, 6.0f))),
            )
        )
    )
    // object "PillarNW" (box)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.35f, -1.1f, -0.35f), Vector3(0.35f, 1.1f, 0.35f)),
                Material().apply { baseColor = Color4(0.1451f, 0.3882f, 0.9216f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-5.0f, 1.1f, -5.0f))),
            )
        )
    )
    // object "PillarNE" (box)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.35f, -1.1f, -0.35f), Vector3(0.35f, 1.1f, 0.35f)),
                Material().apply { baseColor = Color4(0.1451f, 0.3882f, 0.9216f, 1.0f); unlit = true },
                Transform(Pose(Vector3(5.0f, 1.1f, -5.0f))),
            )
        )
    )
    // object "PillarW" (box)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.35f, -1.4f, -0.35f), Vector3(0.35f, 1.4f, 0.35f)),
                Material().apply { baseColor = Color4(0.2314f, 0.5098f, 0.9647f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-6.5f, 1.4f, 1.5f))),
            )
        )
    )
    // object "PillarE" (box)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-0.35f, -1.4f, -0.35f), Vector3(0.35f, 1.4f, 0.35f)),
                Material().apply { baseColor = Color4(0.2314f, 0.5098f, 0.9647f, 1.0f); unlit = true },
                Transform(Pose(Vector3(6.5f, 1.4f, 1.5f))),
            )
        )
    )
    // object "OrbTeal" (sphere)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.4f),
                Material().apply { baseColor = Color4(0.2039f, 0.8275f, 0.6f, 1.0f); unlit = true },
                Transform(Pose(Vector3(-3.4f, 1.6f, 3.2f))),
            )
        )
    )
    // object "OrbPink" (sphere)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.35f),
                Material().apply { baseColor = Color4(0.9569f, 0.4471f, 0.7137f, 1.0f); unlit = true },
                Transform(Pose(Vector3(3.4f, 1.9f, 3.2f))),
            )
        )
    )
    // object "OrbAmber" (sphere)
    e.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://sphere")),
                Sphere(0.45f),
                Material().apply { baseColor = Color4(0.9843f, 0.749f, 0.1412f, 1.0f); unlit = true },
                Transform(Pose(Vector3(0.0f, 2.4f, -4.5f))),
            )
        )
    )
    return e
  }
}
