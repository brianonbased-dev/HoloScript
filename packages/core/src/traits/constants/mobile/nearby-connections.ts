/**
 * Nearby Connections Traits (M.010.16)
 *
 * Multi-device mesh networking for shared AR without a server.
 * Google Nearby Connections API — BLE+WiFi discovery and P2P data.
 * Combined with Loro CRDT for conflict-free state sync.
 *
 * Categories:
 *   - Discovery (find nearby devices, advertise)
 *   - Mesh (form network, manage connections)
 *   - Sync (P2P state replication via CRDT)
 */
export const NEARBY_CONNECTIONS_TRAITS = [
  // --- Discovery ---
  'nearby_discover', // discover nearby devices running same .holo scene
  'nearby_advertise', // advertise this device as joinable
  'nearby_auto_connect', // automatically connect when same scene detected

  // --- Mesh ---
  'nearby_mesh', // form local mesh network (star or mesh topology)
  'nearby_max_peers', // maximum number of connected peers
  'nearby_bandwidth', // connection strategy: HIGH_BANDWIDTH or LOW_POWER

  // --- Sync ---
  'nearby_p2p_sync', // sync .holo scene state P2P via Loro CRDT
  'nearby_broadcast', // broadcast events to all connected peers
  'nearby_spatial_anchor_share', // share spatial anchors between nearby devices
] as const;

export type NearbyConnectionsTraitName = (typeof NEARBY_CONNECTIONS_TRAITS)[number];
