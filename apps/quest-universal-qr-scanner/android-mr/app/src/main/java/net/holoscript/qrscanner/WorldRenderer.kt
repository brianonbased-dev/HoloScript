/*
 * @generated from scanner.holo by the quest compiler (compile_to_quest, surface: immersive_mr).
 * DO NOT EDIT — change the app in scanner.holo and recompile.
 *
 * Renders + simulates the world the visitor is immersed in. A scanned world id resolves to a real
 * HoloScript world compiled to Meta (worlds/<id>.holo -> the Worlds registry -> a WorldBuild of
 * entities + per-frame WorldAnimated descriptors), or a themed procedural fallback for an unbundled
 * id. Each frame, tick() drives the animated objects (spin / orbit / bob / float / sway) — that is
 * the simulation / character-action layer. A skybox entity occludes passthrough; that, plus
 * enablePassthrough(false) in the activity, is what makes "entering a world" replace the real room.
 */
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
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.sin

class WorldRenderer {
  private val entities = mutableListOf<Entity>()
  private val animated = mutableListOf<WorldAnimated>()
  private var t0 = 0L

  /** Enter the world [worldId]: a real HoloScript world compiled to Meta (worlds/<id>.holo -> the
   *  Worlds registry) if one is bundled, else a themed procedural fallback. Idempotent. */
  fun enter(worldId: String) {
    leave()
    val build = Worlds.build(worldId)
    if (build != null) {
      entities.addAll(build.entities) // compiled from worlds/<id>.holo by the quest target
      animated.addAll(build.animated)
    } else {
      buildProcedural(worldId)
    }
    t0 = System.nanoTime()
  }

  /** Per-frame simulation — drives the animated objects (called from the activity's onSceneTick). */
  fun tick() {
    if (animated.isEmpty()) return
    val t = (System.nanoTime() - t0) / 1_000_000_000.0f
    for (a in animated) {
      val pose =
          when (a.behavior) {
            "spin" -> Pose(a.base, Quaternion(0f, (t * a.speed) % 360f, 0f))
            "bob" -> Pose(Vector3(a.base.x, a.base.y + a.amp * sin(t * a.speed), a.base.z))
            "float" ->
                Pose(
                    Vector3(a.base.x, a.base.y + a.amp * sin(t * a.speed), a.base.z),
                    Quaternion(0f, (t * a.speed * 14f) % 360f, 0f),
                )
            "orbit" -> {
              val ang = t * a.speed
              Pose(Vector3(a.center.x + cos(ang) * a.radius, a.base.y, a.center.z + sin(ang) * a.radius))
            }
            "sway" -> Pose(a.base, Quaternion(0f, 0f, a.amp * sin(t * a.speed)))
            else -> Pose(a.base)
          }
      a.entity.setComponents(Transform(pose))
    }
  }

  /** Fallback world for an id with no bundled HoloScript composition — themed by the id's hash. */
  private fun buildProcedural(seedName: String) {
    val seed = abs(seedName.hashCode())
    val accent = PALETTE[seed % PALETTE.size]
    val accent2 = PALETTE[(seed / 7 + 3) % PALETTE.size]

    // Skybox surround (deep themed tint) — occludes passthrough so the real room disappears.
    entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://skybox"), hittable = MeshCollision.NoCollision),
                Material().apply {
                  baseColor = accent.scaled(0.22f)
                  unlit = true
                },
                Transform(Pose(Vector3(0f, 0f, 0f))),
            )
        )
    )

    // Ground slab.
    entities.add(
        Entity.create(
            listOf(
                Mesh(Uri.parse("mesh://box")),
                Box(Vector3(-25f, -0.1f, -25f), Vector3(25f, 0f, 25f)),
                Material().apply {
                  baseColor = accent.scaled(0.4f)
                  unlit = true
                },
                Transform(Pose(Vector3(0f, 0f, 0f))),
            )
        )
    )

    // Landmark ring — alternating floating spheres and ground pillars, around the user.
    val count = 6 + seed % 4
    for (i in 0 until count) {
      val ang = (i.toFloat() / count) * 6.2831855f + (seed % 360) * 0.0174533f
      val radius = 3.5f + (i % 3) * 1.4f
      val x = cos(ang) * radius
      val z = sin(ang) * radius
      val color = if (i % 2 == 0) accent else accent2
      if (i % 2 == 0) {
        val rad = 0.5f + ((seed shr (i % 12)) % 5) * 0.13f
        entities.add(
            Entity.create(
                listOf(
                    Mesh(Uri.parse("mesh://sphere")),
                    Sphere(rad),
                    Material().apply {
                      baseColor = color
                      unlit = true
                    },
                    Transform(Pose(Vector3(x, 1.0f + (i % 3) * 0.6f, z))),
                )
            )
        )
      } else {
        val h = 1.6f + ((seed shr (i % 12)) % 6) * 0.45f
        entities.add(
            Entity.create(
                listOf(
                    Mesh(Uri.parse("mesh://box")),
                    Box(Vector3(-0.4f, 0f, -0.4f), Vector3(0.4f, h, 0.4f)),
                    Material().apply {
                      baseColor = color.scaled(0.85f)
                      unlit = true
                    },
                    Transform(Pose(Vector3(x, 0f, z))),
                )
            )
        )
      }
    }
  }

  /** Remove all world entities + animation (restores passthrough once the skybox is gone). */
  fun leave() {
    entities.forEach { it.destroy() }
    entities.clear()
    animated.clear()
  }

  val isActive: Boolean
    get() = entities.isNotEmpty()

  companion object {
    private val PALETTE =
        listOf(
            Color4(0.05f, 0.65f, 0.91f, 1f),
            Color4(0.55f, 0.36f, 0.96f, 1f),
            Color4(0.06f, 0.73f, 0.51f, 1f),
            Color4(0.96f, 0.62f, 0.07f, 1f),
            Color4(0.94f, 0.27f, 0.27f, 1f),
            Color4(0.93f, 0.28f, 0.60f, 1f),
        )
  }
}

/** One animated world object — driven each frame by WorldRenderer.tick() (the simulation layer). */
data class WorldAnimated(
    val entity: Entity,
    val behavior: String,
    val base: Vector3,
    val speed: Float,
    val amp: Float,
    val radius: Float,
    val center: Vector3,
)

/** The result of building a compiled HoloScript world: static entities + animated descriptors. */
class WorldBuild {
  val entities = mutableListOf<Entity>()
  val animated = mutableListOf<WorldAnimated>()
}

private fun Color4.scaled(f: Float): Color4 = Color4(red * f, green * f, blue * f, 1f)
