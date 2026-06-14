# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Island-model BRKGA** - Multi-population parallel evolution via `worker_threads` with `IslandMessenger` for elite migration between islands
- **CLI** - Command-line solver with JSON input/output (`vrp-solver`)
- **Solution serialization** - `serialize()` and `deserialize()` on `VrpSolution`
- **Solver capabilities** - `maxTimeMs`, `targetMakespan`, progress callbacks
- **Benchmark tests** - Performance and scalability validation
- **Decoder optimization** - O(n)→O(1) capacity checks with incremental `RouteLoad` tracking, precomputed vehicle assignments, single-pass pickup scheduling
- **ALNS improvements** - Adaptive removal sizing (10%→45% fraction based on stagnation), multi-restart (up to 3 restarts with temperature reset), clone avoidance
- **BRKGA improvements** - Elite diversity preservation (mild mutation on elite copies), adaptive mutation rate (up to +5% extra mutants when stagnant), periodic immigrant injection (20% population replacement), hall-of-fame tracking
- **Multi-objective optimization** - Pareto front support for makespan, distance, cost, CO₂
- **Time Windows (VRPTW)** - Earliest/latest delivery and pickup constraints via `CustomerWithTimeWindows`
- **Multi-depot problem** - Vehicles start/end at different depots via `MultiDepotProblem` + `Depot`
- **Traffic-aware routing** - Time-dependent travel speeds via `TrafficAwareProblem` + `TrafficModel`
- **Inter-vehicle resource transfer** - Hub-based exchanges via `TransferHub`, `TransferManager`, `VehicleWithCapabilities`
- **Route analytics** - Vehicle utilization, wait times, load profiles via `RouteAnalytics`
- **Solution comparison** - Pareto-ranking with dominance frontier via `SolutionComparator`
- **GIS export** - GeoJSON, KML, CSV output via `GISExporter`
- **Transfer-aware ALNS operators** - Dedicated destroy/repair for transfer operations
- **Typed errors** - `VrpError`, `ValidationError`, `InfeasibleSolutionError`, `AlgorithmConvergenceError`
- **Logger interface** - Pluggable logging via `Logger` interface with `defaultLogger`
- **CI/CD pipeline** - GitHub Actions with lint/typecheck/test/build/publish workflows
- **Verification tests** - 5 algorithm correctness tests + 2 decoder benchmark tests (212 total)

### Changed
- **Test framework** - Migrated from Jest to Mocha + Chai + tsx for module-native ESM support
- **ESLint** - Migrated to flat config (`eslint.config.mjs`) with `@typescript-eslint` strict rules at `error` level
- **TypeScript** - Strict mode with `noUncheckedIndexedAccess`, `noImplicitReturns`, `exactOptionalPropertyTypes`
- BRKGA decoder rewritten as multi-pass (delivery-first, then pickup after processing time)
- BRKGA chromosome expanded to 4n structure (π, σ, α, β)
- ALNS wired with all 6 destroy + 4 repair operators from paper
- Warm-start enabled by default (15% of BRKGA population seeded from ALNS)
- Per-vehicle depot support in `calculateSchedule()`
- `getTravelTime()` virtual method for `TrafficAwareProblem` override
- Converted entire codebase from JavaScript to TypeScript
- Updated ALNS default parameters to paper specs
- Enhanced `Solution` class with multi-objective tracking
- `VrpRpdSolver` accepts optional `Logger` in constructor
- Rollup build produces ESM + CJS + `.d.ts` type declarations
- File names renamed to kebab-case per Google TypeScript Style Guide

### Deprecated
- `Problem` alias (use `VrpProblem`)
- `Node` alias (use `LocationNode`)
- `Solution` alias (use `VrpSolution`)
- JavaScript source files (`.js` → `.ts`)

### Removed
- All `eslint-disable` comments (0 suppressed rules)
- All `as` type assertions from source code
- All non-null assertions (`!`) from source code
- All `Array()` constructor usage (replaced with `Array.from`)
- Redundant `public` on class body members (18 occurrences)
- Empty `.catch(() => {})` handlers (5 occurrences)
- `Object.keys() + as` pattern (replaced with typed key arrays)
- Old JavaScript source and test files (`.js`)
- 7 previously suppressed ESLint rules (now fully enabled)
- Jest configuration and dependencies
- Migration scripts

### Fixed
- BRKGA timeout and progress callback support
- Type safety issues with indexed access
- Undefined handling in operator functions
- ESLint 9 flat config with zero warnings
- All `any` types removed from source and tests
- Template expression type safety
- Decoder chromosome size corrected to 4n per paper specification
- ALNS operator index-shift bug (remove higher-index customers first)
- Stale fitness after elite diversity mutation (reset to `null` for re-evaluation)
- Stagnation detection now resets weights and temperature on multi-restart
- Google TypeScript Style Guide compliance (zero violations)

### Security
- Added strict TypeScript configuration for type safety
- Input validation on all problem constructors
- CI with explicit least-privilege permissions and provenance

---

## [1.0.0] - 2026-05-04

### Added
- Initial TypeScript implementation
- ALNS algorithm with 3 removal and 2 insertion operators
- BRKGA algorithm with 2n chromosome structure
- Basic VRP-RPD problem definition
- Solution feasibility checking
- Parallel solving via worker threads
- Interactive demo application

### Known Issues
- No GPU acceleration

---

## [0.1.0] - 2026-03-xx

### Added
- Original JavaScript implementation
- Basic ALNS and BRKGA algorithms
- Demo application

---

## Paper Reference

This implementation is based on:
> Saseendran, H., Sodhi, M., & Prasad, R. (2026). 
> Vehicle Routing Problem with Resource-Constrained Pickup and Delivery. 
> arXiv:2602.23685 [math.OC]

**Important:** This is an independent re-implementation. The authors of this code are not affiliated with the paper authors. See README.md for disclaimer.

---

## Version History

| Version | Date | Notes |
|---------|------|-------|
| 1.0.0 | 2026-05-04 | TypeScript conversion |
| 0.1.0 | 2026-03-xx | Initial JavaScript |
