# VR Reality (VRR) Compiler — Digital Twins

Compiles HoloScript to **1:1 geo-synced digital twin environments** delivered as browser-native WebXR. The VRR compiler bridges spatial computing and the real world: a `.holo` file becomes a live, interactive mirror of a real physical location.

## Overview

The VRR compiler (`--target vrr`) is HoloScript's most ambitious output target — it generates WebXR scenes that are:

- **Geo-synced** — positioned to real-world GPS coordinates
- **1:1 scale** — centimeter-accurate to the physical environment
- **Live-data-fed** — weather, traffic, IoT sensors, crowd density
- **Browser-native** — no app store, no install, WebXR in Chrome/Edge

The reference implementation is **Phoenix downtown**: a navigable 1:1 digital twin of the Phoenix, AZ city core runnable in a VR headset browser.

```bash
holoscript compile city.holo --target vrr --output ./twin/
```

## Output Structure

```
twin/
  index.html           # WebXR entry point
  scene.gltf           # Geo-referenced 3D scene
  layers/
    buildings.glb      # OSM-sourced geometry
    terrain.glb        # Elevation mesh
    roads.glb          # Navigable road network
    iot-overlay.json   # Live sensor positions
  tiles/               # Streaming tile cache
  data/
    weather.json       # Live weather feed config
    traffic.json       # Traffic API config
```

## Composition Structure

```holo
composition "PhoenixDowntown" {
  environment {
    geo_anchor: { lat: 33.4484, lon: -112.0740, alt: 331 }
    scale: "1:1"
    data_feeds: ["openweathermap", "here-traffic", "iot-mesh"]
  }

  spatial_group "CityCore" {
    terrain {
      source: "usgs-elevation"
      resolution: "1m"
    }

    buildings {
      source: "osm"
      lod: [50, 200, 1000]  // LOD switch distances in meters
    }

    roads {
      source: "openstreetmap"
      @navigable
    }
  }

  layer "IoTOverlay" {
    @iot_sensor
    @digital_twin
    source: "hololand-mesh"
    refresh_rate: 5hz
  }

  logic {
    on_user_enter {
      load_live_data()
      start_feeds()
    }
  }
}
```

## Live Data Integration

| Data Source           | Default Feed          | Trait           |
| --------------------- | --------------------- | --------------- |
| Weather (temp, wind)  | OpenWeatherMap API    | `@iot_sensor`   |
| Traffic density       | HERE / TomTom         | `@digital_twin` |
| Air quality (AQI)     | OpenAQ                | `@telemetry`    |
| Build occupancy       | IoT sensor mesh       | `@mqtt_bridge`  |
| Pedestrian flow       | Computer vision feeds | `@telemetry`    |
| Transit (buses, rail) | GTFS real-time        | `@digital_twin` |

## Compiler Options

| Option             | Default      | Description                              |
| ------------------ | ------------ | ---------------------------------------- |
| `--vrr-geo`        | required     | `lat,lon,alt` of scene origin            |
| `--vrr-radius`     | 500          | Radius in metres to load                 |
| `--vrr-sources`    | osm,usgs     | Geometry sources (comma-separated)       |
| `--vrr-lod`        | 50,200,500   | LOD switch distances (metres)            |
| `--vrr-feeds`      | none         | Live data feed IDs (comma-separated)     |
| `--vrr-tile-size`  | 256          | Streaming tile size (metres)             |
| `--vrr-webxr-mode` | immersive-vr | `immersive-vr`, `immersive-ar`, `inline` |

## Use Cases

- **Urban planning** — architects walk city plans at 1:1 scale
- **Emergency simulation** — first-responder training in real building layouts
- **Retail analytics** — foot-traffic heatmaps overlaid on real stores
- **Infrastructure monitoring** — IoT sensors visible in spatial context
- **Tourism** — remote visitors explore real places in VR
- **Hololand platform** — the foundational layer for all Hololand experiences

## See Also

- [Hololand Integration](/integrations/hololand) — Runtime platform for VRR scenes
- [IoT/DTDL](/compilers/iot/dtdl) — Azure Digital Twin connection
- [OpenXR Spatial Entities](/compilers/openxr-spatial) — AR world anchoring
