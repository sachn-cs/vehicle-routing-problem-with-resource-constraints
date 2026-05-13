# VRP-RPD Solver

> **Disclaimer:** This is an independent re-implementation based on the research paper "Vehicle Routing Problem with Resource-Constrained Pickup and Delivery" (arXiv:2602.23685v2). The authors of this code are **not affiliated** with the paper authors (Harishjitu Saseendran, Manbir Sodhi, Romesh Prasad, University of Rhode Island). This implementation is for educational purposes and has not been validated against the paper's published results.

## Status

**Production-ready** - Core algorithms implemented, fully typed, lint-clean, and tested.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow)](LICENSE)

## Overview

A TypeScript implementation of the **Vehicle Routing Problem with Resource-Constrained Pickup and Delivery (VRP-RPD)** solver. This library provides tools for solving routing problems where resources must be delivered, processed autonomously, and then picked up—potentially by different vehicles.

## Paper Reference

This implementation is based on:

> Saseendran, H., Sodhi, M., & Prasad, R. (2026). Vehicle Routing Problem with Resource-Constrained Pickup and Delivery. *arXiv:2602.23685 [math.OC]*. https://arxiv.org/abs/2602.23685

**Key differences from paper:**
- CPU-based (no GPU acceleration)

## Installation

```bash
npm install
```

## Quick Start

```typescript
import { VrpRpdSolver, VrpProblem, LocationNode, Customer, Vehicle } from 'vehicle-routing';

// Define problem
const nodes = {
  0: new LocationNode(0, 0, 0, 'Depot'),
  1: new LocationNode(1, 10, 0, 'D1'),
  2: new LocationNode(2, 20, 0, 'P1'),
};

const customers = [new Customer(1, 1, 2, 50)]; // id, delivery, pickup, processingTime
const vehicles = [new Vehicle(1, 5)]; // id, capacity

const problem = new VrpProblem(nodes, customers, vehicles, 0);
const solver = new VrpRpdSolver(problem);

// Solve
const solution = await solver.solve({
  alnsIterations: 500,
  populationSize: 30000,
  maxGenerations: 20000,
  parallel: false,
  warmStart: true, // ALNS seeds BRKGA
  maxTimeMs: 60000, // 60 second timeout
});

console.log(`Makespan: ${solution.makespan.toFixed(2)}`);
console.log(`Feasible: ${solution.isFeasible()}`);
console.log(`Distance: ${solution.totalDistance.toFixed(2)}`);
```

## CLI Usage

The package includes a command-line solver for batch processing.

```bash
# Build first
npm run build

# Solve a problem JSON
npx vrp-solver --problem problem.json --output solution.json

# With options
npx vrp-solver \
  --problem problem.json \
  --alns-iterations 500 \
  --population-size 1000 \
  --max-generations 500 \
  --max-time 30000 \
  --progress
```

### Problem JSON Format

```json
{
  "nodes": [
    { "id": 0, "x": 0, "y": 0, "name": "Depot" },
    { "id": 1, "x": 10, "y": 0, "name": "Delivery 1" },
    { "id": 2, "x": 20, "y": 0, "name": "Pickup 1" }
  ],
  "customers": [
    { "id": 1, "deliveryNodeId": 1, "pickupNodeId": 2, "processingTime": 5 }
  ],
  "vehicles": [
    { "id": 1, "capacity": 10, "costPerKm": 1, "co2PerKm": 0.1 }
  ],
  "depotNodeId": 0
}
```

## Features

### Core Algorithms
- **ALNS** (Adaptive Large Neighborhood Search) with 6 destroy + 4 repair operators
- **BRKGA** (Biased Random-Key Genetic Algorithm) with 4n chromosome (π, σ, α, β)
- **Multi-pass decoder** - Delivery-first scheduling with capacity checks and processing-time-aware pickup scheduling
- **Warm-start** - ALNS seeds 15% of BRKGA population
- **Parallel solving** - Run ALNS and BRKGA concurrently via worker threads
- **Early stopping** - Target makespan and timeout support

### Extensions
- **Time Windows (VRPTW)** - Earliest/latest arrival constraints
- **Multi-Depot** - Vehicles starting/ending at different locations
- **Traffic-Aware** - Time-dependent travel times via virtual `getTravelTime()`
- **Inter-Vehicle Transfers** - Resource exchange at hub nodes
- **Multi-Objective** - Pareto optimization for distance, cost, CO2
- **Analytics** - Vehicle utilization, wait times, load profiles
- **GIS Export** - GeoJSON, KML, CSV output
- **Serialization** - Save/load solutions as JSON

## Solver Options

```typescript
interface SolveOptions {
  alnsIterations?: number;    // Default: 500
  populationSize?: number;     // Default: 30000
  maxGenerations?: number;     // Default: 20000
  initialTemp?: number;        // Default: 100
  coolingRate?: number;        // Default: 0.9998
  parallel?: boolean;          // Default: false
  warmStart?: boolean;         // Default: true
  maxTimeMs?: number;          // Default: 0 (unlimited)
  targetMakespan?: number;     // Default: 0 (disabled)
  islands?: number;            // Default: 1 (single-island)
  migrationInterval?: number;  // Default: 50
  migrantFraction?: number;    // Default: 0.05
  logger?: Logger;             // Custom logger
  onProgress?: (progress: SolverProgress) => void;
}
```

### Island-Model BRKGA

For multi-core machines, BRKGA can run multiple independent populations (islands) that periodically exchange elite individuals. This often improves solution quality and convergence speed.

```typescript
const solution = await solver.solve({
  islands: 4,              // Number of parallel populations (default: 1)
  migrationInterval: 50,   // Generations between migrations (default: 50)
  migrantFraction: 0.05,   // Fraction of elites that emigrate (default: 0.05)
  populationSize: 30000,
  maxGenerations: 20000,
});
```

- `islands: 1` disables island mode (single population, default).
- Each island receives `populationSize / islands` individuals.
- Migration uses fully-connected topology: elites from all islands are pooled, shuffled, and redistributed.
- If a worker crashes, the solver falls back to single-island BRKGA.

### Progress Callback

```typescript
const solution = await solver.solve({
  onProgress: (progress) => {
    console.log(
      `[${progress.stage}] Iteration ${progress.iteration}/${progress.maxIterations}, ` +
      `Best makespan: ${progress.bestMakespan.toFixed(2)}, ` +
      `Elapsed: ${progress.elapsedMs}ms`
    );
  },
});
```

## Usage Examples

### With Time Windows

```typescript
import { CustomerWithTimeWindows } from 'vehicle-routing';

const customers = [
  new CustomerWithTimeWindows(
    1,      // id
    1, 2,   // delivery/pickup nodes
    50,     // processing time
    0, 100, // earliest/latest delivery
    60, 200 // earliest/latest pickup
  ),
];
```

### Serialization

```typescript
// Save solution
const serialized = solution.serialize();
writeFileSync('solution.json', JSON.stringify(serialized));

// Load solution
const data = JSON.parse(readFileSync('solution.json', 'utf-8'));
const restored = VrpSolution.deserialize(data, problem);
```

### Analytics & Export

```typescript
import { RouteAnalytics, GISExporter } from 'vehicle-routing';

const analytics = new RouteAnalytics(solution, problem);
const summary = analytics.getSummary();

const exporter = new GISExporter(solution, problem);
const geojson = exporter.toGeoJSON(); // For QGIS/ArcGIS
const kml = exporter.toKML();         // For Google Earth
```

## Development

```bash
# Build TypeScript
npm run build

# Run tests
npm test

# Run with coverage
npm run test:coverage

# Lint
npm run lint

# Type check
npm run typecheck

# Generate API docs
npm run docs
```

## Project Structure

```
src/
├── core/                      # Problem and solution definitions
│   ├── Problem.ts             # Base VRP-RPD problem
│   ├── Solution.ts            # Solution representation
│   ├── MultiDepotProblem.ts   # Multi-depot extension
│   ├── TrafficAwareProblem.ts # Traffic-aware extension
│   ├── ResourceTransfer.ts    # Inter-vehicle transfers
│   ├── VehicleWithCapabilities.ts
│   └── SolutionWithTransfers.ts
├── algorithms/
│   ├── alns/                  # ALNS metaheuristic
│   │   ├── ALNS.ts
│   │   ├── operators.ts
│   │   └── TransferAwareOperators.ts
│   └── brkga/                 # BRKGA evolutionary algorithm
│       ├── BRKGA.ts
│       └── Decoder.ts
├── analytics/                 # Solution analysis
│   ├── RouteAnalytics.ts
│   └── SolutionComparator.ts
├── export/                    # GIS and reporting
│   └── GISExporter.ts
├── cli.ts                     # CLI entry point
└── index.ts                   # Main exports
```

## Testing

The project has comprehensive test coverage:

- **Unit tests** - Core models, algorithms, edge cases
- **Security tests** - Input validation, sanitization
- **Type safety tests** - Compile-time correctness
- **Benchmarks** - Performance and scalability validation

```bash
npm test
# Test Suites: 10 passed, 115 tests total
```

## Known Limitations

- CPU-only (no GPU acceleration)
- No island-model BRKGA parallelization
- Limited to Euclidean distance (custom distance matrices not yet supported)

## Contributing

Contributions are welcome! Areas of interest:
1. GPU acceleration via WebGPU/CUDA
2. Island-model BRKGA
3. Benchmark instance validation against published results
4. Custom distance matrix support

## License

ISC

## References

- **Paper:** https://arxiv.org/abs/2602.23685
- **HTML Version:** https://arxiv.org/html/2602.23685v2
- **Authors' GitHub:** https://github.com/Harishjitu/vrp-rpd
