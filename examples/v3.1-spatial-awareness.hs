/**
 * Spatial Context Awareness Example (v3.1)
 * 
 * Demonstrates HoloScript's spatial awareness system:
 * - Entity tracking in 3D space
 * - Spatial zones with behaviors
 * - Proximity detection
 * - Location-based agent choreography
 * 
 * @version 3.1.0
 */

composition "SpatialAwarenessDemo" {
  // World configuration
  config {
    spatial: {
      world_bounds: [[-100, 0, -100], [100, 50, 100]]
      grid_size: 5
      update_rate: 60
      partitioning: "octree"
    }
  }

  // ==========================================================================
  // ZONE DEFINITIONS
  // ==========================================================================

  // Safe zone - players spawn here
  zone "SafeZone" {
    shape: "box"
    bounds: [[-10, 0, -10], [10, 5, 10]]
    type: "safe"
    properties: {
      pvp_enabled: false
      healing_rate: 5
      respawn_point: [0, 1, 0]
    }
  }

  // Combat arena - PvP enabled
  zone "CombatArena" {
    shape: "cylinder"
    center: [50, 0, 50]
    radius: 30
    height: 10
    type: "combat"
    properties: {
      pvp_enabled: true
      damage_multiplier: 1.5
      respawn_delay: 5000
    }
  }

  // Treasure room - guarded area
  zone "TreasureRoom" {
    shape: "sphere"
    center: [-50, 5, -50]
    radius: 15
    type: "treasure"
    properties: {
      access_level: "key_required"
      guards_enabled: true
      loot_table: "legendary"
    }
  }

  // Danger zone - environmental hazard
  zone "DangerZone" {
    shape: "box"
    bounds: [[30, 0, -40], [60, 3, -20]]
    type: "hazard"
    properties: {
      damage_per_second: 10
      effect: "poison"
      warning_distance: 5
    }
  }

  // ==========================================================================
  // SPATIAL AGENTS
  // ==========================================================================

  // Player agent with spatial awareness
  template "PlayerAgent" {
    @agent {
      type: "player"
      capabilities: ["movement", "combat", "interaction"]
    }
    
    @spatialAwareness {
      update_frequency: 60
      detection_radius: 20
      track_entities: true
      track_agents: true
      track_zones: true
      layers: [
        { name: "immediate", radius: 3 },
        { name: "nearby", radius: 10 },
        { name: "distant", radius: 20 }
      ]
    }
    
    state {
      position: [0, 1, 0]
      rotation: [0, 0, 0]
      health: 100
      current_zone: null
      nearby_entities: []
      is_in_combat: false
    }

    // Zone enter handler
    on zoneEnter(zone) {
      this.state.current_zone = zone.id
      
      switch (zone.type) {
        case "safe":
          this.state.is_in_combat = false
          startHealing(zone.properties.healing_rate)
          break
        case "combat":
          notify("Entering combat zone - PvP enabled!")
          break
        case "hazard":
          startEnvironmentalDamage(zone.properties.damage_per_second)
          break
        case "treasure":
          if (!hasKey("treasure_key")) {
            eject(zone.properties.respawn_point || [0, 1, 0])
            notify("You need a key to enter!")
          }
          break
      }
    }

    // Zone exit handler  
    on zoneExit(zone) {
      if (zone.type == "safe") {
        stopHealing()
      }
      if (zone.type == "hazard") {
        stopEnvironmentalDamage()
      }
    }

    // Proximity handler
    on entityNearby(entity, layer) {
      if (layer == "immediate") {
        if (entity.type == "enemy" && this.state.current_zone?.pvp_enabled) {
          enterCombat(entity)
        }
        if (entity.type == "item") {
          showPickupPrompt(entity)
        }
      }
    }

    // Entity left proximity
    on entityLeft(entity, layer) {
      if (entity.type == "enemy" && layer == "nearby") {
        exitCombat()
      }
    }
  }

  // Guard agent - patrols treasure room
  template "GuardAgent" {
    @agent {
      type: "guard"
      capabilities: ["patrol", "combat", "alert"]
    }
    
    @spatialAwareness {
      detection_radius: 15
      track_agents: true
      alert_on: ["player", "intruder"]
    }
    
    @patrol {
      zone: "TreasureRoom"
      waypoints: [
        [-45, 1, -55],
        [-55, 1, -55],
        [-55, 1, -45],
        [-45, 1, -45]
      ]
      speed: 2
      pause_at_waypoints: 3000
    }
    
    state {
      mode: "patrol"
      alert_level: 0
      target: null
    }

    // Detect intruders
    on entityNearby(entity, layer) {
      if (entity.type == "player" && !entity.hasAccess) {
        this.state.mode = "alert"
        this.state.alert_level = 2
        this.state.target = entity.id
        
        // Alert other guards
        broadcast("guard_channel", {
          type: "intruder_detected",
          location: entity.position,
          intruder: entity.id
        })
        
        // Move to intercept
        moveTo(entity.position)
        engageTarget(entity)
      }
    }

    on entityLeft(entity, layer) {
      if (entity.id == this.state.target) {
        this.state.mode = "search"
        searchArea(entity.last_known_position)
      }
    }

    // Handle guard alerts
    on channel.message("guard_channel", msg) {
      if (msg.type == "intruder_detected") {
        this.state.alert_level = 1
        moveToSupport(msg.location)
      }
    }
  }

  // Collector agent - gathers resources
  template "CollectorAgent" {
    @agent {
      type: "collector"
      capabilities: ["pathfinding", "collection"]
    }
    
    @spatialAwareness {
      detection_radius: 30
      track_entities: true
      filter: { type: "resource" }
    }
    
    state {
      inventory: []
      target_resource: null
      collecting: false
    }

    // Find and collect resources
    action collectResources() {
      // Query for resources in range
      const resources = spatial.queryRadius({
        center: this.state.position,
        radius: 30,
        filter: { type: "resource", collected: false }
      })
      
      if (resources.length > 0) {
        // Find nearest
        const nearest = resources.sort((a, b) => 
          distance(this.state.position, a.position) -
          distance(this.state.position, b.position)
        )[0]
        
        this.state.target_resource = nearest.id
        await moveTo(nearest.position)
        await collect(nearest)
        this.state.inventory.push(nearest)
      }
    }

    on entityNearby(entity, layer) {
      if (entity.type == "resource" && !this.state.collecting) {
        this.collectResources()
      }
    }
  }

  // ==========================================================================
  // SPATIAL QUERIES EXAMPLE
  // ==========================================================================

  template "SpatialQueryDemo" {
    @agent {
      type: "query-demo"
    }
    
    @spatialAwareness {
      detection_radius: 50
    }

    // Demonstrate various spatial queries
    action runQueries() {
      // Ray cast - what's in front?
      const rayHits = spatial.rayCast({
        origin: this.state.position,
        direction: this.state.forward,
        maxDistance: 100
      })
      log("Ray hits:", rayHits.map(h => h.entity.id))
      
      // Box query - what's in this area?
      const inBox = spatial.queryBox({
        min: [0, 0, 0],
        max: [20, 10, 20]
      })
      log("In box:", inBox.length, "entities")
      
      // Frustum query - what's visible?
      const visible = spatial.queryFrustum({
        position: this.state.position,
        forward: this.state.forward,
        fov: 90,
        far: 50
      })
      log("Visible:", visible.length, "entities")
      
      // Path query - how to get there?
      const path = spatial.findPath({
        from: this.state.position,
        to: [50, 0, 50],
        avoidZones: ["hazard"]
      })
      log("Path:", path.waypoints.length, "waypoints")
      
      // Zone query - what zone is this?
      const zone = spatial.getZoneAt([50, 1, 50])
      log("Zone at [50,1,50]:", zone?.id)
    }
  }

  // ==========================================================================
  // WAYPOINTS FOR NAVIGATION
  // ==========================================================================

  waypoints "patrol_route" [
    [0, 1, 10],
    [10, 1, 10],
    [10, 1, 0],
    [10, 1, -10],
    [0, 1, -10],
    [-10, 1, -10],
    [-10, 1, 0],
    [-10, 1, 10]
  ]

  // ==========================================================================
  // INSTANTIATE ENTITIES
  // ==========================================================================

  object "Player1" using "PlayerAgent" {
    position: [0, 1, 0]
  }

  object "Guard1" using "GuardAgent" {
    position: [-45, 1, -50]
  }

  object "Guard2" using "GuardAgent" {
    position: [-55, 1, -50]
  }

  object "Collector1" using "CollectorAgent" {
    position: [20, 1, 20]
  }

  // Spawn some resources
  spawn_group "Resources" {
    template: "ResourceNode"
    count: 20
    zone: "SafeZone" // Spawn in safe zone
    properties: {
      type: "resource"
      value: random(10, 100)
    }
  }
}
