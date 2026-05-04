# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- TypeScript conversion with strict mode enabled
- Multi-objective optimization support (Pareto fronts)
- Time Windows (VRPTW) support via `CustomerWithTimeWindows` class
- Multi-deot problem support via `MultiDepotProblem` class
- Traffic-aware routing via `TrafficAwareProblem` and `TrafficModel` classes
- Inter-vehicle resource transfer via `TransferHub` and `TransferManager`
- Vehicle capabilities system via `VehicleWithCapabilities` and `VehicleFleetManager`
- Route analytics dashboard (`RouteAnalytics` class)
- Solution comparison tool (`SolutionComparator` class)
- GIS export functionality (GeoJSON, KML, CSV) via `GISExporter`
- Transfer-aware ALNS operators

### Changed
- Converted entire codebase from JavaScript to TypeScript
- Updated ALNS default parameters
- Enhanced `Solution` class with multi-objective tracking

### Deprecated
- JavaScript source files (`.js` → `.ts`)

### Fixed
- Type safety issues with indexed access
- Undefined handling in operator functions

### Removed
- Old JavaScript test files

### Security
- Added strict TypeScript configuration for type safety

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
- ALNS parameters differ from paper specifications
- BRKGA chromosome structure simplified (2n vs 4n)
- No GPU acceleration
- No warm-start from ALNS to BRKGA
- Decoder does not implement multi-pass logic from paper

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
