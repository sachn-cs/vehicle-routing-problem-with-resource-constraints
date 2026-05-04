# VRP-RPD Solver

> ⚠️ **Disclaimer:** This is an independent re-implementation based on the research paper "Vehicle Routing Problem with Resource-Constrained Pickup and Delivery" (arXiv:2602.23685v2). The authors of this code are **not affiliated** with the paper authors (Harishjitu Saseendran, Manbir Sodhi, Romesh Prasad, University of Rhode Island). This implementation is for educational purposes and has not been validated against the paper's published results.

## Status

⚠️ **Experimental** - This implementation has known gaps compared to the paper specification. See [IMPLEMENTATION_REVIEW.md](./IMPLEMENTATION_REVIEW.md) for details.

[![CI](https://github.com/yourusername/vrp-rpd/actions/workflows/ci.yml/badge.svg)](../../actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![License: ISC](https://img.shields.io/badge/License-ISC-yellow)](LICENSE)

## Overview

A TypeScript implementation of the **Vehicle Routing Problem with Resource-Constrained Pickup and Delivery (VRP-RPD)** solver. This library provides tools for solving routing problems where resources must be delivered, processed autonomously, and then picked up—potentially by different vehicles.

## Paper Reference

This implementation is based on:

> Saseendran, H., Sodhi, M., & Prasad, R. (2026). Vehicle Routing Problem with Resource-Constrained Pickup and Delivery. *arXiv:2602.23685 [math.OC]*. https://arxiv.org/abs/2602.23685

**Key differences from paper:**
- CPU-based (no GPU acceleration)
- Simplified chromosome structure (2n vs 4n)
- Different ALNS operator scores and parameters
- No warm-start from ALNS to BRKGA

See [IMPLEMENTATION_REVIEW.md](./IMPLEMENTATION_REVIEW.md) for a complete comparison.

## Installation

```bash
npm install
```

## Quick Start

```typescript
import { VrpRpdSolver, Problem, Node, Customer, Vehicle } from './src/index.js';

// Define problem
const nodes = {
  0: new Node(0, 0, 0, 'Depot'),
  1: new Node(1, 10, 0, 'D1'),
  2: new Node(2, 20, 0, 'P1'),
};

const customers = [new Customer(1, 1, 2, 50)]; // id, delivery, pickup, processingTime
const vehicles = [new Vehicle(0, 5)]; // id, capacity

const problem = new Problem(nodes, customers, vehicles, 0);
const solver = new VrpRpdSolver(problem);

// Solve
const solution = await solver.solve({
  alnsIterations: 200,
  populationSize: 100,
  maxGenerations: 100,
  parallel: true, // Run ALNS and BRKGA concurrently
});

console.log(`Makespan: ${solution.makespan.toFixed(2)}`);
console.log(`Feasible: ${solution.isFeasible()}`);
```

## Features

### Core Algorithms
- **ALNS** (Adaptive Large Neighborhood Search) with adaptive operator selection
- **BRKGA** (Biased Random-Key Genetic Algorithm) with elite preservation
- **Parallel solving** - Run both algorithms concurrently

### Extensions (Not in original paper)
- **Time Windows (VRPTW)** - Earliest/latest arrival constraints
- **Multi-Depot** - Vehicles starting/ending at different locations
- **Traffic-Aware** - Time-dependent travel times
- **Inter-Vehicle Transfers** - Resource exchange at hub nodes
- **Multi-Objective** - Pareto optimization for distance, cost, CO2
- **Analytics** - Vehicle utilization, wait times, load profiles
- **GIS Export** - GeoJSON, KML, CSV output

## Usage Examples

### With Time Windows

```typescript
import { CustomerWithTimeWindows } from './src/index.js';

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

### With Resource Transfers

```typescript
import {
  SolutionWithTransfers,
  ProblemWithTransfers,
  TransferHub,
  VehicleWithCapabilities,
} from './src/index.js';

const hubs = [new TransferHub(5, 10, 10, 'Hub', 2, 5)];
const vehicles = [
  new VehicleWithCapabilities(0, 5, ['standard'], true, true, 10),
  new VehicleWithCapabilities(1, 5, ['standard'], true, true, 10),
];

const problem = new ProblemWithTransfers(nodes, customers, vehicles, 0, hubs);
const solution = new SolutionWithTransfers(problem, routes, hubs, vehicles);

// Schedule transfer between vehicles
solution.scheduleTransfer(5, 0, 1, 1, 15); // hub, from, to, amount, time
```

### Analytics & Export

```typescript
import { RouteAnalytics, GISExporter } from './src/index.js';

const analytics = new RouteAnalytics(solution, problem);
const summary = analytics.getSummary();
console.log(summary);

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

# Start demo (Vite dev server)
npm run dev
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
└── index.ts                   # Main exports
```

## Known Issues

### Correctness
- [ ] ALNS parameters differ from paper (cooling rate, operator scores)
- [ ] BRKGA chromosome structure simplified (2n vs 4n)
- [ ] No multi-pass decoder for temporal dependencies
- [ ] No warm-start from ALNS to BRKGA

### Performance
- [ ] CPU-only (no GPU acceleration)
- [ ] Small default population sizes
- [ ] No island model parallelization

### Reliability
- [ ] Limited test coverage
- [ ] No benchmark validation
- [ ] No numerical stability checks

See [IMPLEMENTATION_REVIEW.md](./IMPLEMENTATION_REVIEW.md) for a complete audit.

## Contributing

Contributions are welcome! Areas of interest:
1. Implementing missing ALNS operators (Critical Path, Shaw removal)
2. Expanding BRKGA chromosome to 4n structure
3. Multi-pass decoder implementation
4. GPU acceleration via WebGPU
5. Benchmark instance validation

## License

ISC

## References

- **Paper:** https://arxiv.org/abs/2602.23685
- **HTML Version:** https://arxiv.org/html/2602.23685v2
- **Authors' GitHub:** https://github.com/Harishjitu/vrp-rpd
