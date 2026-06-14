# Algorithm Optimization Plan

## Phase 1: Correctness Fixes

### 1.1 `removeCustomerFromRoutes` — cross-route D+P removal
**File:** `src/algorithms/alns/operators.ts:24-26`
**Issue:** When delivery and pickup are on different routes, removing the delivery sets `removedAny = true` but removing the pickup (on a different route) does not. Also, if only pickup is found (delivery already removed), `removedAny` stays `false`.
**Fix:** Add `removedAny = true` to the `else if (pIndex !== -1)` branch.

### 1.2 `evaluateMakespanWithRoute` — cross-route resource propagation
**File:** `src/core/Solution.ts:268-278`
**Issue:** When evaluating a modified route, the new deliveries update `resourceReadyTimes`, which can affect pickup times on OTHER routes. The current code ignores this, using stale `nodeTimes` for other routes.
**Fix:** 
- Add a `routeDependsOnResources(routeIndex, updatedReadyTimes)` method
- After evaluating the new route, re-evaluate any route whose pickups depend on the updated resources
- Also fix `evaluateMakespanWithTwoRoutes` (lines 283-311) with the same propagation logic

### 1.3 `Decoder.encode` — wrong vehicle index mapping
**File:** `src/algorithms/brkga/Decoder.ts:223`
**Issue:** `assignments[customerIndex] = rIdx / solution.routes.length` maps route index to [0,1) using route count as denominator, but `getVehicleAssignment` uses `vehicles.length` as denominator. With 4 routes and 10 vehicles, route 3 maps to vehicle 7 instead of vehicle 3.
**Fix:** Change to `assignments[customerIndex] = rIdx / this.problem.vehicles.length`

### 1.4 ALNS segment boundary off-by-one
**File:** `src/algorithms/alns/ALNS.ts:190`
**Issue:** `if (i > 0 && i % this.segmentSize === 0)` — first segment processes 51 iterations instead of 50.
**Fix:** Change to `if (i > 0 && (i + 1) % this.segmentSize === 0)`

---

## Phase 2: Performance Optimizations

### 2.1 Avoid route cloning in insertion inner loops
**Files:** `src/algorithms/alns/operators.ts:314-357` and `388-490`
**Issue:** `greedyInsertion` and `regretInsertion` call `route.clone()` (O(n)) + 2x `splice` (O(n)) + `evaluateMakespanWithRoute` (O(n)) for every (route, dPos, pPos) combination: O(v × n³) per customer.
**Fix:** Add `evaluateInsertionDelta(routeIndex, customer, dPos, pPos)` to `VrpSolution` that computes the makespan change without cloning — compute additional travel time directly from node distances. This reduces O(n) per position to O(1).

### 2.2 Remove redundant `calculateSchedule()` calls
**Files:** `src/algorithms/alns/operators.ts:355` and `488`
**Issue:** Both `greedyInsertion` and `regretInsertion` call `calculateSchedule()` at the end, but the ALNS main loop (ALNS.ts:168) also calls it on the returned solution.
**Fix:** Remove the final `calculateSchedule()` calls from both insertion operators.

### 2.3 Cache route load state in `wouldExceedCapacity`
**File:** `src/algorithms/brkga/Decoder.ts:139-160`
**Issue:** `wouldExceedCapacity` iterates the entire route (O(L)) to compute load state, called ~3000 times per decode call.
**Fix:** Maintain `currentLoad` and `minLoad` arrays indexed by route index, updated incrementally when nodes are added. Cache these during the multi-pass loop instead of recalculating.

### 2.4 Topological sort in `calculateSchedule`
**File:** `src/core/Solution.ts:81-185`
**Issue:** The while loop can iterate up to 1000 times, re-processing all routes each iteration, even when only a few routes have dependency chains.
**Fix:** 
- Build a dependency graph from resourceReadyTimes-based edges
- Process routes in dependency order (topological sort)
- Track dirty routes via a Set, only re-process affected routes

### 2.5 Use precomputed distance matrix in operators
**File:** `src/algorithms/alns/operators.ts` (Shaw, Cluster, Proximity operators)
**Issue:** Operators compute `Math.hypot` for distance calculations instead of using the precomputed `problem.getDistance()` which is O(1) matrix lookup.
**Fix:** Replace `Math.hypot(n1.x - n2.x, n1.y - n2.y)` with `problem.getDistance(nodeA, nodeB)` in all operators and `calculateRelatedness`.

### 2.6 Exploit symmetry in `calculateDistanceMatrix`
**File:** `src/core/Problem.ts:189-207`
**Issue:** Computes both `matrix[i][j]` and `matrix[j][i]` separately.
**Fix:** Compute only upper triangle and mirror.

### 2.7 Partial sort in `worst` removal
**File:** `src/algorithms/alns/operators.ts:74`
**Issue:** Sorts all n customers O(n log n) but only needs top k (k << n).
**Fix:** Use a partial sort or selection algorithm for O(n + k log k).

---

## Phase 3: Algorithm Improvements

### 3.1 Adaptive cooling rate
**File:** `src/algorithms/alns/ALNS.ts`
**Issue:** Default cooling rate 0.9998 drops temperature from 100→90.5 in 500 iterations — barely any cooling.
**Fix:** Compute rate from iteration budget: `coolingRate = exp(ln(minTemp / maxTemp) / maxIterations)`. Default: `minTemp = 0.1`, `maxTemp = initialTemp * 2` (auto-scaled).

### 3.2 Reheat on stagnation
**File:** `src/algorithms/alns/ALNS.ts`
**Issue:** No reheat mechanism — algorithm can't escape local optima in late iterations.
**Fix:** Track stagnation counter; after `stagnationLimit` iterations without improvement, `temp = Math.min(temp * 2, initialTemp)`.

### 3.3 Adaptive destruction size
**File:** `src/algorithms/alns/ALNS.ts:161-163`
**Issue:** Static 10-40% uniform random range.
**Fix:** Decrease over run: `minDestroy = 0.1 * (1 - progress * 0.5)`, `maxDestroy = 0.4 * (1 - progress * 0.5)`.

### 3.4 Restart from best solution
**File:** `src/algorithms/alns/ALNS.ts`
**Issue:** `currentSolution` can wander arbitrarily far from `bestSolution` after accepting worse solutions.
**Fix:** Every `restartInterval` iterations without improvement, reset `currentSolution = bestSolution.clone()`.

### 3.5 BRKGA adaptive elite/mutant fractions
**File:** `src/algorithms/brkga/BRKGA.ts:229-238`
**Issue:** Fixed elite(15%)/mutant(10%) ratios never change over the run.
**Fix:** `mutantFraction = 0.2 - 0.15 * (gen / maxGen)`, `eliteFraction = 0.1 + 0.1 * (gen / maxGen)`.

### 3.6 BRKGA restart on stagnation
**File:** `src/algorithms/brkga/BRKGA.ts:299-305`
**Issue:** Stagnation terminates the algorithm instead of restarting the population.
**Fix:** Replace bottom 50% with random individuals and reset stagnation counter instead of breaking.

---

## Phase 4: New Tests (~40 test cases)

### 4.1 ALNS operator unit tests (`tests/algorithms/operators.test.ts`)
- Each removal operator: given known solution, remove k customers, verify `removed` length and solution structure
- `greedyInsertion`: cheapest position chosen correctly
- Each regret-k: regret values computed correctly in controlled scenario

### 4.2 BRKGA evolution tests (`tests/algorithms/brkga-evolution.test.ts`)
- `crossover` with prob=1 (all elite), prob=0 (all non-elite), prob=0.5 (mixed)
- `mutateChromosome` with rate=0 (no change), rate=1 (all changed)
- `evolvePopulation`: elite/mutant/crossover counts correct, elite preserved

### 4.3 Decoder tests (`tests/algorithms/decoder.test.ts`)
- Multi-pass iteration count
- Capacity spillover to alternative vehicles
- Force-fallback path (no-progress case)
- `encode(decode(chromosome))` round-trip consistency
- Warm-start encoding fidelity

### 4.4 Transfer operator tests (`tests/transfer.test.ts`)
- `TransferAwareRemovalOperators`
- `VehicleFleetManager` state transitions (addVehicle, updateVehicleState)
- Hub concurrency with overlapping transfers

### 4.5 Analytics tests (`tests/analytics.test.ts`)
- `RouteAnalytics`: utilization, wait times, load over time, compare, summary
- `SolutionComparator`: metrics, Pareto front, report generation

### 4.6 Parallel solver tests (`tests/parallel.test.ts`)
- `solveParallel` returns feasible solution
- Worker error propagation
- Worker exit code handling
- Timeout during parallel solve

### 4.7 Additions to existing test files
- Island migration correctness (>2 islands, migrant count verification)
- `selectOperator` weight distribution statistics
- Stagnation detection
- Warm-start encoding correctness

---

## Phase 5: Test Infrastructure

### 5.1 Create `tests/helpers.ts`
- `createBasicProblem()` — 2 customer, 1 vehicle
- `createTwoVehicleProblem()` — 2 customer, 2 vehicle with distinct costs
- `createTimeWindowProblem()` — customer with tight time windows
- `createTransferProblem()` — 2 vehicle, 1 hub
- `assertFeasible(solution)` — assertion helper
- `createDeterministicRng(seed)` — seedable PRNG for reproducibility

---

## Execution Order

1. Phase 1 (correctness) — all 4 fixes, no test changes needed
2. Phase 5 (test helpers) — shared factories
3. Phase 4 (tests) — validate correctness and prevent regressions
4. Phase 2 (performance) — big perf wins, validated by tests
5. Phase 3 (algorithms) — quality improvements, validated by tests

Each step is verified by running `npm test` before moving to the next.
