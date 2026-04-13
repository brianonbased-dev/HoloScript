# HoloScript Studio V6.0 — Architectural Overview & Changes

Based on the recent changes, documents (`VISION_V6.md`, `PAGES_ARCHITECTURE.md`, `INTEGRATION_HUB.md`), and workspace structure, here is a comprehensive breakdown of the v6.0 restructuring.

## 1. The V6.0 Vision: "The Great Refinement"

HoloScript V6.0 shifts focus from building new foundational paradigms to **stabilizing, optimizing, and decoupling** the V1-V5 stack into a production-grade ecosystem.

- **Pillar I (Hardening the Core Engine):** Zero-allocation compiler execution paths, 100% test coverage for pure CPU logic.
- **Pillar II (Trait Reiteration):** Optimizing and deeply documenting the existing traits (see [NUMBERS.md](../../NUMBERS.md) for current count) to ensure seamless interaction (physics, AI, networking) without edge-case crashes.
- **Pillar III (Maturing Autonomous Systems):** Productionizing the agentic mesh and autonomous economics, adding OpenTelemetry tracing.
- **Pillar IV (Sovereign Mesh):** Extreme scalability through Kubernetes & Edge, physical world unification (Robotics/IoT), and integrating the unified uAAL reasoning VM.

## 2. Decoupling the Monolith: `studio-api` & Frontend Architecture

The monolithic application has been decisively split to adhere to microservice limits and optimize deployment bounds.

- **Two Dedicated Frontend Apps:**
  - `@holoscript/studio` (Port 3100) — The primary IDE, playground, and spatial scene creation.
  - `@holoscript/marketplace-web` (Port 3000) — A standalone traits marketplace with Web3 wallet interactions.
- **The `studio-api` Microservice:**
  - It has been decoupled into `services/studio-api` as a **headless Next.js API Gateway**.
  - It purges monolithic backend logic, acting as an event router and proxy to external services (Neon, AWS S3, Stripe) and internal services (`mcp-orchestrator`, `absorb-service`, `render-service`).

## 3. The Studio Integration Hub & Connectors

A key feature of V6 Studio is the unified **Integration Hub**, which allows users to interact with third-party platforms directly from the IDE without context switching.

- **Zustand Connector Store:** Handles connection states, UI configuration forms, and a Server-Sent Events (SSE) activity stream for real-time remote logs.
- **Connector Packages:**
  - `@holoscript/connector-core`: Base definitions, `ServiceConnector`, and MCP Registrar.
  - `@holoscript/connector-github`: Octokit integration, PRs, issues, Gists. Future integration of OAuth Device Flow.
  - `@holoscript/connector-railway`: Infrastructure management, rate-limiting handlers with exponential backoff.
  - `@holoscript/connector-upstash`: Handles Redis (scene caching), Vector (semantic composition embeddings), and QStash (nightly compilations).
  - `@holoscript/connector-appstore`: Apple/Google metadata management and Webhook build status integration.
  - `@holoscript/connector-vscode` (Planned): Bidirectional sync and MCP HttpServer definitions.

## 4. Federated Microservices & Packages Mesh

The Studio relies strongly on the **MCP Orchestrator** to handle service discovery. Rather than doing heavy processing on the frontend or a single monolithic backend, V6 routes tasks to specialized microservices:

- `services/llm-service`: Manages Brittney (AI assistant), prompt libraries, and AST generation.
- `services/export-api`: Handles cross-compilation (glTF, USD, Android, URDF).
- `services/render-service`: Deals with headless WebGL rendering, texture/material generation.
- **Heavyweight UI Component Splitting:** The main Create IDE uses heavy dependencies (`@react-three/fiber`, `monaco-editor`, Rapier physics engine). V6 employs aggressive dynamic Next.js imports to ensure rapid initial load times for the IDE.

## Summary

HoloScript V6 pushes the platform toward an **Enterprise Microservice Topology**. The frontend IDE relies on a localized Zustand hub to coordinate external connectors, while delegating intensive processing queries directly to the newly isolated `studio-api` headless API, which proxies to a mesh of specialized services and language toolchains via the MCP protocol.
