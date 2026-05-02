# VRP-RPD Solver TODO & Issues List

This list identifies current limitations, technical debt, and planned enhancements for the Vehicle Routing Problem with Resource-Constrained Pickup and Delivery (VRP-RPD) implementation.

## 🔴 Critical Issues (Bugs & Architectural Flaws)
- [ ] **Heterogeneous Fleet Support**: `Solution.checkCapacity` incorrectly assumes all vehicles share the same capacity as `vehicles[0]`. It should look up the specific capacity for the vehicle assigned to the route.
- [ ] **BRKGA Capacity Enforcement**: The `Decoder.js` has a placeholder capacity check (lines 68-72) that doesn't actually reroute or penalize over-capacity assignments, leading to potentially infeasible chromosomes staying in the population.
- [ ] **ALNS Weight Update Typo**: Ensure the division-by-zero check and usage tracking in `ALNS.updateWeights` are robust across all edge cases.

## 🟡 Algorithmic Enhancements
- [ ] **Advanced Removal Operators**: Implement `WorstCostRemoval` and `ClusterRemoval` (Neighbor) to improve ALNS exploration.
- [ ] **Parallel ALNS Scaling**: Update `VRP_RPD_Solver.solveParallel` to run multiple ALNS instances with different random seeds across available CPU cores, rather than just one ALNS and one BRKGA.
- [ ] **Multi-pass Decoder Optimization**: Improve the greedy choice in `Decoder.js` to consider the distance-to-node instead of just priority-rank when multiple operations are ready.
- [ ] **Local Search Post-Processing**: Add a 2-opt or 3-opt local search phase after ALNS/BRKGA to polish final routes.

## 🟢 Code Quality & DX (Developer Experience)
- [ ] **Logging Interface**: Replace `console.log` with a configurable logger (e.g., `loguru`-style for JS or a simple callback) so library users can control output.
- [ ] **Input Validation**: Add a `Problem.validate()` method to check for duplicate node IDs, negative coordinates, or missing pickup/delivery pairs.
- [ ] **TypeScript Migration**: Convert core logic to TypeScript for better type safety, especially for complex objects like `Problem` and `Solution`.
- [ ] **Distance Metrics**: Allow users to provide a custom distance function or select between Euclidean, Manhattan, and Great Circle.

## 🔵 Documentation & Testing
- [ ] **Worker Thread Testing**: Add Jest tests for `worker.js` and parallel message passing.
- [ ] **Benchmark Suite**: Integrate a benchmarking script to compare performance against standard VRPLIB/TSPLIB instances.
- [ ] **Demo UI Polish**: 
    - [ ] Add error boundaries to handle solver crashes.
    - [ ] Visualize the "Resource Ready Time" as a progress bar or timeline on nodes.
    - [ ] Allow importing problem instances via JSON.
- [ ] **Package Exports**: Add `exports` field to `package.json` for proper ESM/CJS compatibility.
