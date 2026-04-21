# README vertical epics (optional backlog)

**Board:** `task_1776384389518_ui1q` (planner role)  
**Source of truth for gaps:** `README.md` → **Honest gaps** table (infrastructure exists; domain plugin / UX layer missing).

This file **does not** schedule work — it gives **one epic slug + scope note per gap** so each row can spawn a dedicated HoloMesh child task when prioritized.

| Epic slug | README gap | Closest existing (from README) | Split guidance (child task scope) |
|-----------|------------|--------------------------------|-----------------------------------|
| `epic-geolocation-gis-domain` | Geolocation / GIS | `GeospatialAnchorTrait`, `RooftopAnchorTrait` | Map tiles, GIS ingest/export, layers; may extend `@holoscript/plugin-geolocation-gis`. |
| `epic-calendar-scheduling-ui` | Calendar / Scheduling | `@cron`, `@scheduler`, `@task_queue` | User-facing calendar views, reminders, ICS — **not** just job runners. |
| `epic-crm-workflows` | CRM | `@tenant`, `@session`, `@analytics` | Pipelines, contacts, deals — opinionated CRM traits + Studio panels. |
| `epic-inventory-domain` | Inventory | `@database`, `@data_transform` | SKUs, reservations, stock rules — domain types + traits. |
| `epic-logistics-shipping` | Logistics / Shipping | `SCMCompiler` | Rate shopping, labels, carrier traits on top of SCM. |
| `epic-real-estate-domain` | Real Estate | Spatial rendering + `@digital_twin` | Listings, parcels, tours — vertical plugin + comps. |
| `epic-agriculture-vertical` | Agriculture | `@iot_sensor`, `@digital_twin`, `@telemetry` | Crop models, zones, compliance — thin domain on IoT base. |
| `epic-energy-utilities-vertical` | Energy / Utilities | same IoT base | Meters, demand response, outage maps — thin domain on IoT base. |
| `epic-legal-contracts-workflow` | Legal / Contracts | `@approval`, `@audit_log`, `@consent_management` | Matter/case workflows, redlines, e-sign handoff hooks. |
| `epic-government-civic` | Government / Civic | `@audit_log`, `@rbac`, `@gdpr` | Permit/civic service patterns; heavy compliance — scope **public-sector review** before claims. |

## Process

1. Founder / PM **picks one epic** when a vertical is funded.  
2. Create **one HoloMesh child task** per epic (title: `[Epic] <epic slug> — …`).  
3. Close the epic when a **domain plugin pack** (traits + examples + README for that vertical) lands; infrastructure-only changes do not close the gap.

## Related

- Plugin system: `packages/plugins/` + `packages/plugins/domain-plugin-template/`
- Honest gaps narrative: `README.md` (Honest gaps)
