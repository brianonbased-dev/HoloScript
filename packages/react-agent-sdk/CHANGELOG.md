# Changelog

All notable changes to @hololand/react-agent-sdk will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-01-XX (Initial Release)

### Added

#### Core Hooks
- `useAgent` - Initialize agent with identity/RBAC from Phase 1
- `useTask` - Execute agent tasks with automatic retry and cancellation
- `useTaskStatus` - Monitor long-running task progress with real-time updates
- `useAgentMetrics` - Real-time agent metrics (circuit breaker state, success rate, latency)
- `useCircuitBreaker` - Access circuit breaker state from Phase 2
- `useDegradedMode` - Global degraded mode status monitoring

#### Components
- `<AgentProvider>` - Context provider for agent configuration
- `<TaskMonitor>` - Visual task progress indicator with logs and phase info
- `<CircuitBreakerStatus>` - Circuit state visualization with metrics
- `<AgentMetricsDashboard>` - Real-time metrics display with auto-refresh
- `<AgentErrorBoundary>` - Error boundary for agent failures
- `<SuspenseTask>` - React Suspense integration for async tasks

#### Features
- **Circuit Breaker** - Automatic failure detection and recovery
  - Configurable threshold, timeout, and window size
  - Three states: closed, open, half-open
  - Reset functionality
- **Exponential Backoff** - Intelligent retry with exponential delays
  - Configurable base delay and max delay
  - Jitter for thundering herd prevention
  - Attempt tracking
- **TypeScript Support** - Full type safety with automatic inference
  - Generic types for task results
  - Comprehensive type definitions
  - IntelliSense support
- **SSR Compatible** - Works with Next.js, Remix, and other frameworks
  - Client-side only execution
  - Conditional rendering support
- **Error Handling** - Multiple layers of error management
  - Hook-level error states
  - Error boundaries
  - Custom fallback components
- **Progress Tracking** - Real-time task monitoring
  - Progress percentage
  - Phase information (uAA2++ protocol)
  - Estimated time remaining
  - Task logs

#### Documentation
- Comprehensive README with examples
- API documentation for all hooks and components
- Migration guide from imperative to declarative
- 11+ usage examples:
  1. Basic usage
  2. With provider configuration
  3. Task monitoring
  4. Circuit breaker integration
  5. Metrics dashboard
  6. Error boundary
  7. Suspense integration
  8. Degraded mode handling
  9. Multi-agent coordination
  10. Custom retry logic
  11. Next.js SSR compatibility

#### Testing
- Vitest test suite
- Circuit breaker unit tests
- Hook tests with React Testing Library
- Test setup and utilities

#### Storybook
- Component stories for visual testing
- Interactive documentation
- TaskMonitor stories
- CircuitBreakerStatus stories
- AgentMetricsDashboard stories

### Architecture

- **Circuit Breaker Pattern** - Prevents cascading failures
- **Exponential Backoff** - Intelligent retry strategy
- **Context API** - Global configuration management
- **Zustand** - Lightweight state management (internal)
- **React 18+** - Modern React features (Suspense, Concurrent)

### Dependencies

- `@holoscript/core` - Core agent framework
- `zustand` - State management
- React 18+ (peer dependency)

### Development Tools

- TypeScript 5.9
- Vite/Vitest for testing
- Storybook 7 for component development
- tsup for building

## [Unreleased]

### Planned Features

- WebSocket support for real-time updates
- Request caching and deduplication
- Optimistic updates
- Offline support with queue
- DevTools browser extension
- Performance metrics dashboard
- Rate limiting
- Request batching
- GraphQL integration
- Additional examples and tutorials

---

[0.1.0]: https://github.com/brianonbased-dev/Holoscript/releases/tag/@hololand/react-agent-sdk@0.1.0
