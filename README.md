# VRP-RPD Solver (arXiv:2602.23685v2)

A JavaScript implementation of the **Vehicle Routing Problem with Resource-Constrained Pickup and Delivery (VRP-RPD)** solver, based on the research paper "A Two-Stage Metaheuristic for the Vehicle Routing Problem with Resource-Constrained Pickup and Delivery".

## Features
- **Two-Stage Metaheuristic**: Combines Adaptive Large Neighborhood Search (ALNS) and Biased Random-Key Genetic Algorithm (BRKGA).
- **Resource Constraints**: Handles temporal dependencies where a resource must be delivered, processed, and then picked up (potentially by a different vehicle).
- **Multi-pass Decoder**: Efficiently schedules operations while respecting precedence and vehicle capacities.
- **Premium Interactive Demo**: Visualize routes and solver progress in real-time.

## Installation
```bash
npm install
```

## Usage
```javascript
import { VRP_RPD_Solver, Problem, Node, Customer, Vehicle } from './src/index.js';

// Define nodes, customers, and vehicles
const nodes = { ... };
const customers = [ ... ];
const vehicles = [ ... ];

const problem = new Problem(nodes, customers, vehicles, depotNodeId);
const solver = new VRP_RPD_Solver(problem);

const solution = await solver.solve({
  alnsIterations: 200,
  populationSize: 100,
  maxGenerations: 100
});

console.log(`Optimized Makespan: ${solution.makespan}`);
```

## Demo
To run the interactive demo:
```bash
npm run dev
```
Navigate to the URL shown in the terminal (usually `http://localhost:5173/`).

## Core Logic
The solver uses a global makespan calculation that iteratively updates arrival times at each node until convergence, ensuring all resource-readiness constraints are satisfied.

- **ALNS**: Uses removal (Random, Shaw) and insertion (Greedy) operators with adaptive weights.
- **BRKGA**: Uses random keys to define operation priorities and vehicle preferences, decoded via a multi-pass heuristic.

## License
MIT
