/**
 * Tenant Provisioning Pipeline — .hs Process Example
 *
 * Demonstrates multi-tenant provisioning as a sequential 7-stage
 * process. When a new organization requests a tenant, the pipeline
 * validates the request, creates an isolated namespace, configures
 * isolation boundaries, initializes RBAC roles, deploys resources,
 * runs health checks, and activates the tenant.
 *
 * This is inherently SEQUENTIAL — you cannot configure isolation
 * before creating the namespace, and you cannot activate before
 * health checks pass. Each stage depends on the previous one.
 *
 * Uses: TenantTrait, RBAC roles/permissions
 * Complements: 01-tenant-isolation.holo (declares tenant config)
 *              02-rbac-permissions.holo (declares role definitions)
 * This file:   Implements the provisioning PROCESS end-to-end.
 *
 * @version 5.0.0
 * @format .hs (process)
 */

environment {
  skybox: "studio"
  ambient_light: 0.7
}

// ============================================================================
// STAGE 1: REQUEST VALIDATOR — validate tenant request parameters
// ============================================================================

object "request_validator" {
  geometry: "cylinder"
  color: "#42a5f5"
  position: { x: -12, y: 1, z: 0 }
  scale: { x: 0.5, y: 0.6, z: 0.5 }

  state {
    validating: false
    request_queue: []
    valid_tiers: ["free", "starter", "professional", "enterprise"]
    valid_isolation_levels: ["shared", "namespace", "dedicated"]
    total_validated: 0
    total_rejected: 0
  }

  // Pull next request from the provisioning queue
  function validate_next() {
    const request = dequeue_provisioning_request()
    if (!request) return   // no pending requests

    state.validating = true

    const errors = []

    // Check 1: Tenant name is valid (alphanumeric, 3-64 chars)
    if (!request.tenant_name || request.tenant_name.length < 3 || request.tenant_name.length > 64) {
      errors.push("tenant_name must be 3-64 characters")
    }
    if (request.tenant_name && !matches_pattern(request.tenant_name, "^[a-zA-Z0-9_-]+$")) {
      errors.push("tenant_name contains invalid characters")
    }

    // Check 2: Tier is valid
    if (!state.valid_tiers.includes(request.tier)) {
      errors.push("invalid tier: " + request.tier + " (valid: " + state.valid_tiers.join(", ") + ")")
    }

    // Check 3: Isolation level is valid and compatible with tier
    if (!state.valid_isolation_levels.includes(request.isolation_level)) {
      errors.push("invalid isolation_level: " + request.isolation_level)
    }
    if (request.tier == "free" && request.isolation_level == "dedicated") {
      errors.push("free tier does not support dedicated isolation")
    }

    // Check 4: Contact email is present
    if (!request.contact_email || !matches_pattern(request.contact_email, ".+@.+\\..+")) {
      errors.push("valid contact_email is required")
    }

    // Check 5: Tenant name is not already taken
    const existing = lookup_tenant(request.tenant_name)
    if (existing) {
      errors.push("tenant_name '" + request.tenant_name + "' is already in use")
    }

    state.validating = false

    if (errors.length > 0) {
      state.total_rejected += 1
      emit("request_rejected", {
        tenant_name: request.tenant_name,
        errors: errors,
        timestamp: current_time()
      })
    } else {
      state.total_validated += 1
      emit("request_validated", {
        tenant_id: generate_uuid(),
        tenant_name: request.tenant_name,
        tier: request.tier,
        isolation_level: request.isolation_level,
        contact_email: request.contact_email,
        requested_at: request.timestamp,
        validated_at: current_time()
      })
    }
  }

  on_error(err) {
    state.validating = false
    emit("validation_error", { error: err.message })
  }
}

// ============================================================================
// STAGE 2: NAMESPACE CREATOR — create isolated namespace with prefix
// ============================================================================

object "namespace_creator" {
  geometry: "cube"
  color: "#7e57c2"
  position: { x: -8, y: 1, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    creating: false
    namespace_prefix: "hs_tenant_"
    total_created: 0
  }

  function create_namespace(validated) {
    state.creating = true

    // Generate namespace with prefix
    const namespace = state.namespace_prefix + validated.tenant_name.toLowerCase()

    // Create the namespace in the system
    const ns_result = system_create_namespace(namespace)

    if (!ns_result.success) {
      state.creating = false
      emit("namespace_failed", {
        tenant_id: validated.tenant_id,
        namespace: namespace,
        error: ns_result.error
      })
      return
    }

    // Configure namespace boundaries
    set_namespace_config(namespace, {
      owner_tenant_id: validated.tenant_id,
      created_at: current_time(),
      tier: validated.tier,
      // Prevent cross-namespace data leakage
      allow_cross_namespace_queries: false,
      allow_cross_namespace_writes: false
    })

    state.total_created += 1
    state.creating = false

    emit("namespace_created", {
      tenant_id: validated.tenant_id,
      tenant_name: validated.tenant_name,
      namespace: namespace,
      tier: validated.tier,
      isolation_level: validated.isolation_level,
      contact_email: validated.contact_email,
      created_at: current_time()
    })
  }
}

// ============================================================================
// STAGE 3: ISOLATION CONFIGURATOR — set up isolation based on tier
// ============================================================================

object "isolation_configurator" {
  geometry: "octahedron"
  color: "#ff7043"
  position: { x: -4, y: 1, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    configuring: false
    isolation_configs: {
      shared: {
        compute_pool: "shared",
        network_isolation: false,
        storage_encryption: "shared_key",
        max_scenes: 3,
        max_agents_per_scene: 10
      },
      namespace: {
        compute_pool: "shared",
        network_isolation: true,
        storage_encryption: "per_tenant_key",
        max_scenes: 20,
        max_agents_per_scene: 50
      },
      dedicated: {
        compute_pool: "dedicated",
        network_isolation: true,
        storage_encryption: "per_tenant_key_hsm",
        max_scenes: 100,
        max_agents_per_scene: 500
      }
    }
  }

  function configure(ns_data) {
    state.configuring = true

    const config = state.isolation_configs[ns_data.isolation_level]
    if (!config) {
      state.configuring = false
      emit("isolation_failed", {
        tenant_id: ns_data.tenant_id,
        reason: "unknown_isolation_level"
      })
      return
    }

    // Apply compute pool assignment
    const pool_result = assign_compute_pool(ns_data.namespace, config.compute_pool)
    if (!pool_result.success) {
      state.configuring = false
      emit("isolation_failed", {
        tenant_id: ns_data.tenant_id,
        reason: "compute_pool_unavailable",
        error: pool_result.error
      })
      return
    }

    // Configure network isolation
    if (config.network_isolation) {
      create_network_boundary(ns_data.namespace, {
        allow_inbound: ["portal_relay", "health_check"],
        block_cross_tenant: true
      })
    }

    // Set up storage encryption
    const encryption_result = configure_storage_encryption(
      ns_data.namespace,
      config.storage_encryption
    )

    // Set scene and agent limits
    set_namespace_limits(ns_data.namespace, {
      max_scenes: config.max_scenes,
      max_agents_per_scene: config.max_agents_per_scene
    })

    state.configuring = false

    emit("isolation_configured", {
      tenant_id: ns_data.tenant_id,
      tenant_name: ns_data.tenant_name,
      namespace: ns_data.namespace,
      tier: ns_data.tier,
      isolation_level: ns_data.isolation_level,
      contact_email: ns_data.contact_email,
      config_applied: config,
      configured_at: current_time()
    })
  }
}

// ============================================================================
// STAGE 4: RBAC INITIALIZER — create default roles and permissions
// ============================================================================

object "rbac_initializer" {
  geometry: "capsule"
  color: "#26a69a"
  position: { x: 0, y: 1, z: 0 }
  scale: { x: 0.4, y: 0.7, z: 0.4 }

  state {
    initializing: false
    // Default role definitions aligned with RBAC trait
    default_roles: {
      owner: {
        permissions: {
          scenes: ["create", "read", "update", "delete", "execute"],
          traits: ["create", "read", "update", "delete", "execute"],
          assets: ["create", "read", "update", "delete"],
          analytics: ["create", "read", "update", "delete"],
          system: ["create", "read", "update", "delete", "execute"]
        }
      },
      admin: {
        permissions: {
          scenes: ["create", "read", "update", "delete", "execute"],
          traits: ["create", "read", "update", "delete"],
          assets: ["create", "read", "update", "delete"],
          analytics: ["read", "update"],
          system: ["read"]
        }
      },
      editor: {
        permissions: {
          scenes: ["read", "update"],
          traits: ["read", "update"],
          assets: ["create", "read", "update"],
          analytics: ["read"],
          system: []
        }
      },
      viewer: {
        permissions: {
          scenes: ["read"],
          traits: ["read"],
          assets: ["read"],
          analytics: ["read"],
          system: []
        }
      },
      spectator: {
        permissions: {
          scenes: ["read"],
          traits: [],
          assets: [],
          analytics: [],
          system: []
        }
      }
    }
  }

  function initialize_rbac(isolation_data) {
    state.initializing = true

    const namespace = isolation_data.namespace

    // Create each role in the namespace
    for (const role_name in state.default_roles) {
      const role = state.default_roles[role_name]

      const result = create_role(namespace, {
        name: role_name,
        permissions: role.permissions,
        created_at: current_time()
      })

      if (!result.success) {
        state.initializing = false
        emit("rbac_failed", {
          tenant_id: isolation_data.tenant_id,
          role: role_name,
          error: result.error
        })
        return
      }
    }

    // Assign the requesting user as owner
    assign_role(namespace, isolation_data.contact_email, "owner")

    state.initializing = false

    emit("rbac_initialized", {
      tenant_id: isolation_data.tenant_id,
      tenant_name: isolation_data.tenant_name,
      namespace: namespace,
      tier: isolation_data.tier,
      contact_email: isolation_data.contact_email,
      roles_created: object_keys(state.default_roles),
      owner_assigned: isolation_data.contact_email,
      initialized_at: current_time()
    })
  }
}

// ============================================================================
// STAGE 5: RESOURCE DEPLOYER — allocate compute, storage, network quotas
// ============================================================================

object "resource_deployer" {
  geometry: "torus"
  color: "#ffa726"
  position: { x: 4, y: 1, z: 0 }
  scale: { x: 0.5, y: 0.3, z: 0.5 }

  state {
    deploying: false
    // Resource quotas per tier
    tier_quotas: {
      free: {
        compute_units: 2,
        storage_gb: 1,
        bandwidth_mbps: 10,
        api_calls_per_hour: 100
      },
      starter: {
        compute_units: 8,
        storage_gb: 10,
        bandwidth_mbps: 50,
        api_calls_per_hour: 1000
      },
      professional: {
        compute_units: 32,
        storage_gb: 100,
        bandwidth_mbps: 200,
        api_calls_per_hour: 10000
      },
      enterprise: {
        compute_units: 128,
        storage_gb: 1000,
        bandwidth_mbps: 1000,
        api_calls_per_hour: 100000
      }
    }
  }

  function deploy(rbac_data) {
    state.deploying = true

    const quota = state.tier_quotas[rbac_data.tier]
    if (!quota) {
      state.deploying = false
      emit("deploy_failed", {
        tenant_id: rbac_data.tenant_id,
        reason: "unknown_tier"
      })
      return
    }

    // Allocate compute units
    const compute = allocate_compute(rbac_data.namespace, quota.compute_units)
    if (!compute.success) {
      state.deploying = false
      emit("deploy_failed", {
        tenant_id: rbac_data.tenant_id,
        reason: "compute_allocation_failed",
        error: compute.error
      })
      return
    }

    // Allocate storage
    const storage = allocate_storage(rbac_data.namespace, quota.storage_gb)

    // Configure network bandwidth
    const network = configure_bandwidth(rbac_data.namespace, quota.bandwidth_mbps)

    // Set API rate limits
    const rate_limit = set_rate_limit(rbac_data.namespace, quota.api_calls_per_hour)

    // Create default scene for the tenant
    const default_scene = create_scene(rbac_data.namespace, {
      scene_id: rbac_data.tenant_name + "_default",
      scene_name: rbac_data.tenant_name + " Default Scene",
      max_agents: state.tier_quotas[rbac_data.tier].compute_units * 4
    })

    state.deploying = false

    emit("resources_deployed", {
      tenant_id: rbac_data.tenant_id,
      tenant_name: rbac_data.tenant_name,
      namespace: rbac_data.namespace,
      tier: rbac_data.tier,
      contact_email: rbac_data.contact_email,
      quotas: quota,
      default_scene_id: default_scene.scene_id,
      deployed_at: current_time()
    })
  }
}

// ============================================================================
// STAGE 6: HEALTH CHECKER — verify all resources, run smoke tests
// ============================================================================

object "health_checker" {
  geometry: "icosahedron"
  color: "#66bb6a"
  position: { x: 8, y: 1, z: 0 }
  scale: { x: 0.5, y: 0.5, z: 0.5 }

  state {
    checking: false
    check_timeout: 10000        // 10 seconds per check
    checks_passed: 0
    checks_failed: 0
  }

  function check(deployed) {
    state.checking = true

    const checks = []

    // Check 1: Namespace is accessible
    const ns_check = ping_namespace(deployed.namespace, state.check_timeout)
    checks.push({
      name: "namespace_accessible",
      passed: ns_check.success,
      latency_ms: ns_check.latency_ms,
      error: ns_check.error
    })

    // Check 2: Compute resources are provisioned
    const compute_check = verify_compute(deployed.namespace)
    checks.push({
      name: "compute_provisioned",
      passed: compute_check.success,
      allocated: compute_check.units,
      error: compute_check.error
    })

    // Check 3: Storage is writable
    const storage_check = test_storage_write(deployed.namespace)
    checks.push({
      name: "storage_writable",
      passed: storage_check.success,
      error: storage_check.error
    })

    // Check 4: RBAC is functional (test owner permission)
    const rbac_check = test_rbac(deployed.namespace, deployed.contact_email, "scenes", "create")
    checks.push({
      name: "rbac_functional",
      passed: rbac_check.success,
      error: rbac_check.error
    })

    // Check 5: Default scene loads
    const scene_check = test_scene_load(deployed.namespace, deployed.default_scene_id)
    checks.push({
      name: "default_scene_loads",
      passed: scene_check.success,
      load_time_ms: scene_check.load_time_ms,
      error: scene_check.error
    })

    // Check 6: Network connectivity
    const net_check = test_network(deployed.namespace)
    checks.push({
      name: "network_connectivity",
      passed: net_check.success,
      bandwidth_mbps: net_check.measured_bandwidth,
      error: net_check.error
    })

    const all_passed = checks.every(c => c.passed)
    const failed_checks = checks.filter(c => !c.passed)

    if (all_passed) state.checks_passed += 1
    else state.checks_failed += 1

    state.checking = false

    if (all_passed) {
      emit("health_passed", {
        tenant_id: deployed.tenant_id,
        tenant_name: deployed.tenant_name,
        namespace: deployed.namespace,
        tier: deployed.tier,
        contact_email: deployed.contact_email,
        checks: checks,
        all_passed: true,
        checked_at: current_time()
      })
    } else {
      emit("health_failed", {
        tenant_id: deployed.tenant_id,
        tenant_name: deployed.tenant_name,
        checks: checks,
        failed_checks: failed_checks,
        all_passed: false
      })
    }
  }
}

// ============================================================================
// STAGE 7: ACTIVATION AGENT — mark tenant active, send notification
// ============================================================================

object "activation_agent" {
  geometry: "sphere"
  color: "#4caf50"
  position: { x: 12, y: 1, z: 0 }
  scale: { x: 0.6, y: 0.6, z: 0.6 }

  state {
    activating: false
    total_activated: 0
  }

  function activate(health_data) {
    state.activating = true

    // Set tenant status to active
    const status_result = set_tenant_status(health_data.namespace, {
      tenant_id: health_data.tenant_id,
      status: "active",
      activated_at: current_time()
    })

    if (!status_result.success) {
      state.activating = false
      emit("activation_failed", {
        tenant_id: health_data.tenant_id,
        error: status_result.error
      })
      return
    }

    // Send welcome notification to tenant owner
    send_notification(health_data.contact_email, {
      type: "tenant_activated",
      subject: "Your HoloScript tenant is ready",
      body: "Tenant '" + health_data.tenant_name + "' (" + health_data.tier + " tier) is now active. "
          + "Your namespace: " + health_data.namespace + ". "
          + "Default scene: " + health_data.tenant_name + "_default. "
          + "You have been assigned the Owner role with full permissions."
    })

    // Generate provisioning summary
    const summary = {
      tenant_id: health_data.tenant_id,
      tenant_name: health_data.tenant_name,
      namespace: health_data.namespace,
      tier: health_data.tier,
      status: "active",
      owner: health_data.contact_email,
      health_checks: health_data.checks.length,
      all_checks_passed: health_data.all_passed,
      activated_at: current_time(),
      provisioning_duration_ms: current_time() - health_data.tenant_id.created_at
    }

    state.total_activated += 1
    state.activating = false

    emit("tenant_activated", summary)
  }

  on_error(err) {
    state.activating = false
    emit("activation_error", { error: err.message })
  }
}

// ============================================================================
// PROVISIONING DASHBOARD — visual progress indicator
// ============================================================================

object "provisioning_dashboard" {
  geometry: "cube"
  color: "#263238"
  position: { x: 0, y: 4, z: -4 }
  scale: { x: 18, y: 2, z: 0.1 }

  state {
    current_stage: "idle"
    tenants_provisioned: 0
    tenants_failed: 0
  }

  function set_stage(stage_name) {
    state.current_stage = stage_name
    if (stage_name == "validating") color = "#42a5f5"
    if (stage_name == "creating_namespace") color = "#7e57c2"
    if (stage_name == "configuring_isolation") color = "#ff7043"
    if (stage_name == "initializing_rbac") color = "#26a69a"
    if (stage_name == "deploying_resources") color = "#ffa726"
    if (stage_name == "health_checking") color = "#66bb6a"
    if (stage_name == "activated") {
      color = "#00e676"
      state.tenants_provisioned += 1
    }
    if (stage_name == "failed") {
      color = "#f44336"
      state.tenants_failed += 1
    }
  }
}

// ============================================================================
// CONNECTIONS — wiring the provisioning pipeline
// ============================================================================
// 7-stage sequential pipeline: validate -> namespace -> isolation ->
// RBAC -> resources -> health -> activate

// Stage 1 -> Stage 2
connect request_validator.request_validated -> namespace_creator.create_namespace

// Stage 2 -> Stage 3
connect namespace_creator.namespace_created -> isolation_configurator.configure

// Stage 3 -> Stage 4
connect isolation_configurator.isolation_configured -> rbac_initializer.initialize_rbac

// Stage 4 -> Stage 5
connect rbac_initializer.rbac_initialized -> resource_deployer.deploy

// Stage 5 -> Stage 6
connect resource_deployer.resources_deployed -> health_checker.check

// Stage 6 -> Stage 7
connect health_checker.health_passed -> activation_agent.activate

// Dashboard progress tracking
connect request_validator.request_validated -> provisioning_dashboard.set_stage("validating")
connect namespace_creator.namespace_created -> provisioning_dashboard.set_stage("creating_namespace")
connect isolation_configurator.isolation_configured -> provisioning_dashboard.set_stage("configuring_isolation")
connect rbac_initializer.rbac_initialized -> provisioning_dashboard.set_stage("initializing_rbac")
connect resource_deployer.resources_deployed -> provisioning_dashboard.set_stage("deploying_resources")
connect health_checker.health_passed -> provisioning_dashboard.set_stage("health_checking")
connect activation_agent.tenant_activated -> provisioning_dashboard.set_stage("activated")

// Error paths
connect request_validator.request_rejected -> provisioning_dashboard.set_stage("failed")
connect namespace_creator.namespace_failed -> provisioning_dashboard.set_stage("failed")
connect isolation_configurator.isolation_failed -> provisioning_dashboard.set_stage("failed")
connect rbac_initializer.rbac_failed -> provisioning_dashboard.set_stage("failed")
connect resource_deployer.deploy_failed -> provisioning_dashboard.set_stage("failed")
connect health_checker.health_failed -> provisioning_dashboard.set_stage("failed")
connect activation_agent.activation_failed -> provisioning_dashboard.set_stage("failed")

// ============================================================================
// EXECUTION — process provisioning requests continuously
// ============================================================================

// Continuously process the provisioning queue
execute request_validator.validate_next() repeat forever
