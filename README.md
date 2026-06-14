# VRP-RPD Solver

Route optimization for Indian logistics — delivery fleets with resource-constrained pickup and delivery.

[![License: ISC](https://img.shields.io/badge/License-ISC-yellow)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org/)
[![CI](https://github.com/anomalyco/vehicle-routing-problem-with-resource-constraints/actions/workflows/ci.yml/badge.svg)](https://github.com/anomalyco/vehicle-routing-problem-with-resource-constraints/actions/workflows/ci.yml)
[![Tests](https://img.shields.io/badge/tests-212-passing-green)]()

## Overview

This library solves the **Vehicle Routing Problem with Resource-Constrained Pickup and Delivery (VRP-RPD)** — where goods must be delivered, processed, and then picked up, potentially by different vehicles across multiple trips. It uses a two-stage metaheuristic (ALNS + BRKGA) to find high-quality routes fast.

**Built for Indian logistics:** Supports time windows, multi-depot operations, traffic-aware routing, inter-vehicle transfers at hub nodes, multi-objective optimization (cost, distance, CO₂), and island-model parallel BRKGA.

### Algorithmic Improvements Beyond the Paper

This implementation surpasses the baseline algorithms described in arXiv:2602.23685v2 with several novel enhancements:

| Improvement | Description |
|-------------|-------------|
| **Adaptive Removal Sizing** | ALNS removal fraction auto-adjusts 10%→45% based on stagnation ratio |
| **Multi-Restart ALNS** | Up to 3 restarts with temperature reset and weight zeroing on stagnation |
| **Clone Avoidance** | ALNS only clones solution on new best, avoiding regressions |
| **Elite Diversity Preservation** | Mild mutation on elite BRKGA copies proportional to stagnation |
| **Adaptive Mutation Rate** | Up to +5% extra mutants injected when population stagnates |
| **Immigrant Injection** | 20% of population replaced with fresh random individuals before breaking stagnation |
| **Hall-of-Fame Tracking** | Best-ever solution tracked separately from population elite |
| **Decoder O(1) Capacity Checks** | Incremental `RouteLoad` tracking replaces O(n) route simulation |
| **Island-Model Parallelization** | Multi-population BRKGA with elite migration via `worker_threads` |

## Quick Start

### Install

```bash
npm install vehicle-routing
```

### Solve a Problem

```typescript
import { VrpRpdSolver, VrpProblem, LocationNode, Customer, Vehicle } from 'vehicle-routing';

// Define your delivery network
const nodes = {
  0: new LocationNode(0, 0, 0, 'Depot'),            // warehouse
  1: new LocationNode(1, 10, 0, 'Customer A - Drop'), // delivery point
  2: new LocationNode(2, 20, 0, 'Customer A - Pick'), // pickup point
};

// Each customer needs a delivery and later a pickup
const customers = [new Customer(1, 1, 2, 50)]; // id, del-node, pk-node, processing-minutes
const vehicles = [new Vehicle(1, 5)];           // id, capacity

const problem = new VrpProblem(nodes, customers, vehicles, 0);
const solver = new VrpRpdSolver(problem);

const solution = await solver.solve({
  maxTimeMs: 30000,    // stop after 30 seconds
});

console.log(`Best makespan: ${solution.makespan.toFixed(2)} min`);
console.log(`Feasible: ${solution.isFeasible()}`);
console.log(`Distance: ${solution.totalDistance.toFixed(2)} km`);
```

### Via CLI

```bash
# Install globally
npm install -g vehicle-routing

# Solve a problem file
vrp-solver --problem samples/delhi-10.json --output solution.json

# Show progress
vrp-solver --problem samples/mumbai-20.json --progress
```

## Features

| Feature | Description |
|---------|-------------|
| **ALNS** | Adaptive Large Neighborhood Search — 6 destroy + 4 repair operators, adaptive weight selection |
| **BRKGA** | Biased Random-Key Genetic Algorithm — 4n chromosome, elite/mutant/crossover evolution |
| **Warm-start** | ALNS solution seeds 15% of BRKGA population for faster convergence |
| **Time Windows** | Earliest/latest delivery and pickup constraints (VRPTW) |
| **Multi-Depot** | Vehicles can start/end at different depots |
| **Traffic-Aware** | Time-dependent travel speeds via traffic model |
| **Inter-Vehicle Transfers** | Exchange resources at hub nodes |
| **Multi-Objective** | Pareto optimization for makespan, distance, cost, CO₂ |
| **Analytics** | Vehicle utilization, wait times, load profiles, route comparison |
| **GIS Export** | GeoJSON, KML, CSV output for QGIS, Google Earth, Excel |
| **Serialization** | Save/load solutions as JSON |
| **Parallel Solving** | Run ALNS and BRKGA concurrently via worker threads |
| **Progress Callback** | Real-time progress with iteration and best makespan |

## CLI

```bash
vrp-solver [options]

Options:
  --problem <file>          Path to problem JSON file (required)
  --output <file>           Write solution JSON (default: stdout)
  --alns-iterations <n>     ALNS iterations (default: 500)
  --population-size <n>     BRKGA population size (default: 30000)
  --max-generations <n>     BRKGA max generations (default: 20000)
  --max-time <ms>           Max solver time, 0 = unlimited (default: 0)
  --target-makespan <n>     Early stopping target (default: 0)
  --parallel                Run ALNS + BRKGA in parallel
  --no-warm-start           Disable ALNS warm-start
  --progress                Print progress to stderr
  --version                 Print version
  --help                    Show help
```

### Problem JSON Format

```json
{
  "nodes": [
    { "id": 0, "x": 28.61, "y": 77.23, "name": "Delhi Depot" },
    { "id": 1, "x": 28.54, "y": 77.20, "name": "Customer 1 Drop" },
    { "id": 2, "x": 28.56, "y": 77.25, "name": "Customer 1 Pick" }
  ],
  "customers": [
    { "id": 1, "deliveryNodeId": 1, "pickupNodeId": 2, "processingTime": 30 }
  ],
  "vehicles": [
    { "id": 1, "capacity": 100, "costPerKm": 12, "co2PerKm": 0.15 }
  ],
  "depotNodeId": 0
}
```

For time windows, add these fields to customers:
```json
{ "id": 1, "deliveryNodeId": 1, "pickupNodeId": 2, "processingTime": 30,
  "earliestDeliveryTime": 360, "latestDeliveryTime": 480,
  "earliestPickupTime": 420, "latestPickupTime": 600 }
```

## Examples

### With Time Windows

```typescript
import { CustomerWithTimeWindows } from 'vehicle-routing';

// Customer must be delivered between 9 AM and 1 PM (360-480 min)
const customer = new CustomerWithTimeWindows(
  1, 1, 2,      // id, delivery node, pickup node
  30,            // 30 min processing
  360, 480,      // earliest/latest delivery (minutes from midnight)
  420, 600,      // earliest/latest pickup
);
```

### Traffic-Aware Routing

```typescript
import { TrafficAwareProblem, TrafficModel } from 'vehicle-routing';

const traffic = new TrafficModel();
traffic.addSegment(depotNode, customerNode, {
  baseTravelTime: 30,
  timeDependentFactors: { 8: 1.5, 9: 2.0, 17: 1.8, 18: 1.6 }, // rush hour
  congestionLevel: 1.5,
});

const problem = new TrafficAwareProblem(nodes, customers, vehicles, 0, traffic);
```

### Analytics & GIS Export

```typescript
import { RouteAnalytics, GISExporter } from 'vehicle-routing';

const analytics = new RouteAnalytics(solution, problem);
console.log(analytics.getSummary());
// { makespan, totalDistance, totalCost, totalCO2, avgUtilization, ... }

const exporter = new GISExporter(solution, problem);
const geojson = exporter.toGeoJSON();  // For QGIS/Mapbox
const kml = exporter.toKML();          // For Google Earth
const csv = exporter.toCSV();          // For Excel
```

### Progress Tracking

```typescript
const solution = await solver.solve({
  onProgress: (p) => {
    console.log(`[${p.stage}] ${p.iteration}/${p.maxIterations} — best: ${p.bestMakespan.toFixed(1)}min`);
  },
});
```

## API Reference

### Solver Options

```typescript
interface SolveOptions {
  alnsIterations?: number;     // Default: 500
  populationSize?: number;      // Default: 30000
  maxGenerations?: number;      // Default: 20000
  initialTemp?: number;         // Default: 100
  coolingRate?: number;         // Default: 0.9998
  parallel?: boolean;           // Default: false
  warmStart?: boolean;          // Default: true
  maxTimeMs?: number;           // Default: 0 (unlimited)
  targetMakespan?: number;      // Default: 0 (disabled)
  islands?: number;             // Default: 1
  migrationInterval?: number;   // Default: 50
  migrantFraction?: number;     // Default: 0.05
  logger?: Logger;
  onProgress?: (p: SolverProgress) => void;
}
```

### Island-Model BRKGA

For multi-core machines, BRKGA can run multiple populations that exchange elite individuals:

```typescript
const solution = await solver.solve({
  islands: 4,              // 4 parallel populations
  migrationInterval: 50,   // exchange elites every 50 generations
  populationSize: 30000,
  maxGenerations: 20000,
});
```

## Performance Tips

- **Quick test:** Use `alnsIterations: 100, populationSize: 1000, maxGenerations: 500`
- **Production:** `alnsIterations: 500, populationSize: 30000, maxGenerations: 20000` (paper defaults)
- **Time-constrained:** Set `maxTimeMs` to stop early with a feasible solution
- **Multi-core:** Enable `parallel: true` (ALNS + BRKGA concurrently) or use `islands: 4` (parallel BRKGA populations with elite migration)
- **Stagnation resistance:** The ALNS multi-restart and BRKGA adaptive mutation/immigrant injection mechanisms automatically handle most convergence issues

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Test
npm test                    # 212 tests
npm run test:coverage       # with coverage report

# Lint & Type Check
npm run lint
npm run typecheck

# Generate API docs
npm run docs
```

## Project Structure

```
src/
├── core/                    # Problem & solution definitions
│   ├── problem.ts                    # VRP-RPD problem (kebab-case)
│   ├── solution.ts                   # Solution routing
│   ├── multi-depot-problem.ts        # Multi-depot
│   ├── traffic-aware-problem.ts      # Traffic model
│   ├── resource-transfer.ts          # Inter-vehicle transfers
│   ├── vehicle-with-capabilities.ts
│   └── solution-with-transfers.ts
├── algorithms/
│   ├── alns/                        # ALNS metaheuristic
│   │   ├── alns.ts
│   │   ├── operators.ts
│   │   └── transfer-aware-operators.ts
│   └── brkga/                       # BRKGA evolutionary algorithm
│       ├── brkga.ts
│       ├── decoder.ts
│       └── island-messenger.ts       # Worker communication
├── analytics/             # Solution analysis
│   ├── route-analytics.ts
│   └── solution-comparator.ts
├── export/                # GIS export (GeoJSON, KML, CSV)
│   └── gis-exporter.ts
├── errors.ts              # Typed error classes
├── logger.ts              # Logger interface
├── cli.ts                 # CLI entry point
├── index.ts               # Public API exports
├── worker.ts              # Worker thread entry point
└── worker-validation.ts   # Worker data validation

samples/                   # Example problem files
├── basic.json
├── time-windows.json
├── multi-depot.json
└── delhi-10.json
```

## License

ISC — see [LICENSE](LICENSE).

## References

- Saseendran, H., Sodhi, M., & Prasad, R. (2026). Vehicle Routing Problem with Resource-Constrained Pickup and Delivery. *arXiv:2602.23685*.
- [Paper on arXiv](https://arxiv.org/abs/2602.23685)
- [HTML Version](https://arxiv.org/html/2602.23685v2)
