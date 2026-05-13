# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **CLI** - Command-line solver with JSON input/output (`vrp-solver`)
- **Solution serialization** - `serialize()` and `deserialize()` on `VrpSolution`
- **Solver capabilities** - `maxTimeMs`, `targetMakespan`, progress callbacks
- **Benchmark tests** - Performance and scalability validation
- TypeScript conversion with strict mode enabled
- Multi-objective optimization support (Pareto fronts)
- Time Windows (VRPTW) support via `CustomerWithTimeWindows` class
- Multi-depot problem support via `MultiDepotProblem` class
- Traffic-aware routing via `TrafficAwareProblem` and `TrafficModel` classes
- Inter-vehicle resource transfer via `TransferHub` and `TransferManager`
- Vehicle capabilities system via `VehicleWithCapabilities` and `VehicleFleetManager`
- Route analytics dashboard (`RouteAnalytics` class)
- Solution comparison tool (`SolutionComparator` class)
- GIS export functionality (GeoJSON, KML, CSV) via `GISExporter`
- Transfer-aware ALNS operators
- Island-model BRKGA parallelization via `worker_threads` with configurable islands, migration intervals, and elite exchange

### Changed
- BRKGA decoder rewritten as multi-pass (delivery-first, then pickup after processing time)
- BRKGA chromosome expanded to 4n structure (π, σ, α, β)
- ALNS wired with all 6 destroy + 4 repair operators from paper
- Warm-start enabled by default (15% of BRKGA population seeded from ALNS)
- Per-vehicle depot support in `calculateSchedule()`
- `getTravelTime()` virtual method for `TrafficAwareProblem` override
- Converted entire codebase from JavaScript to TypeScript
- Updated ALNS default parameters to paper specs
- Enhanced `Solution` class with multi-objective tracking

### Deprecated
- `Problem` alias (use `VrpProblem`)
- `Node` alias (use `LocationNode`)
- `Solution` alias (use `VrpSolution`)
- JavaScript source files (`.js` → `.ts`)

### Fixed
- BRKGA timeout and progress callback support
- Type safety issues with indexed access
- Undefined handling in operator functions
- ESLint 9 flat config with zero warnings
- All `any` types removed from source and tests
- Template expression type safety

### Removed
- Old JavaScript test files
- 7 suppressed ESLint rules (now fully enabled)

### Security
- Added strict TypeScript configuration for type safety
- Input validation on all problem constructors

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
