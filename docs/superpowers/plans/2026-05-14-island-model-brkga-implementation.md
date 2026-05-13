# Island-Model BRKGA Parallelization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `BRKGA` class with configurable island-model parallelization via `worker_threads`, preserving exact single-island behavior as the default.

**Architecture:** `BRKGA.solve()` becomes async (`Promise<VrpSolution>`). When `islands > 1`, it spawns island workers, orchestrates checkpointed evolution epochs, performs fully-connected elite migration between islands every `migrationInterval` generations, and returns the global best. When `islands === 1`, it runs the existing synchronous single-island path wrapped in a resolved Promise. All callers use `await` unconditionally.

**Tech Stack:** TypeScript 5.7, Node.js worker_threads, Mocha/Chai/tsx, strict ESLint

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/algorithms/brkga/BRKGA.ts` | Add island options, validation, extract `evolvePopulation`, make `solve()` async, add `solveIslands()` |
| Create | `src/algorithms/brkga/IslandMessenger.ts` | Message protocol between main thread and island workers |
| Modify | `src/worker.ts` | Add `island-brkga` worker type with checkpointed evolution; wrap normal BRKGA in async IIFE |
| Modify | `src/workerValidation.ts` | Validate `IslandWorkerData` fields |
| Modify | `src/index.ts` | `await brkga.solve()` in solver |
| Create | `tests/island-brkga.test.ts` | Island-model specific tests |
| Modify | `tests/algorithms.test.ts` | `await brkga.solve()` + async test functions |
| Modify | `tests/smoke.test.ts` | `await brkga.solve()` + async test functions |
| Modify | `tests/bugfixes.test.ts` | `await brkga.solve()` + async test functions where needed |
| Modify | `tests/typesafety.test.ts` | `await brkga.solve()` + async test functions where needed |
| Modify | `tests/edge-cases.test.ts` | `await brkga.solve()` + async test functions where needed |
| Modify | `tests/benchmarks.test.ts` | `await solver.solve()` already async — verify island options pass through |
| Modify | `README.md` | Document island-model options |

---

### Task 1: Add island options to BRKGAOptions and validation

**Files:**
- Modify: `src/algorithms/brkga/BRKGA.ts`

**Step 1: Add island fields to `BRKGAOptions`**

In `src/algorithms/brkga/BRKGA.ts`, in the `BRKGAOptions` interface (after `onProgress`), add:

```typescript
  /** Number of parallel island populations (default: 1 = single-island) */
  islands?: number;
  /** Generations between migrations (default: 50) */
  migrationInterval?: number;
  /** Fraction of each island that emigrates (default: 0.05) */
  migrantFraction?: number;
```

**Step 2: Add class properties and validation**

Add class property declarations before the constructor:

```typescript
  protected readonly islands: number;
  protected readonly migrationInterval: number;
  protected readonly migrantFraction: number;
```

Add validation in the constructor after the warmStartProportion block:

```typescript
    if (options.islands !== undefined && options.islands < 1) {
      throw new ValidationError('islands must be a positive integer');
    }
    if (options.migrationInterval !== undefined && options.migrationInterval < 1) {
      throw new ValidationError('migrationInterval must be a positive integer');
    }
    if (options.migrantFraction !== undefined && (options.migrantFraction <= 0 || options.migrantFraction >= 1)) {
      throw new ValidationError('migrantFraction must be between 0 and 1 (exclusive)');
    }
```

Add initialization after `this.onProgress = ...`:

```typescript
    this.islands = options.islands ?? 1;
    this.migrationInterval = options.migrationInterval ?? 50;
    this.migrantFraction = options.migrantFraction ?? 0.05;
```

**Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/algorithms/brkga/BRKGA.ts
git commit -m "feat(brkga): add island-model options to BRKGAOptions and validation"
```

---

### Task 2: Create IslandMessenger helper

**Files:**
- Create: `src/algorithms/brkga/IslandMessenger.ts`

**Step 1: Write IslandMessenger.ts**

```typescript
import type { Worker } from 'worker_threads';

import type { Chromosome } from './Decoder.js';
import type { Individual } from './BRKGA.js';

export interface IslandCheckpointMessage {
  type: 'checkpoint';
  islandId: number;
  generation: number;
  population: Individual[];
}

export interface IslandFinishMessage {
  type: 'finish';
  islandId: number;
  bestIndividual: Individual;
}

export type IslandWorkerMessage = IslandCheckpointMessage | IslandFinishMessage;

export interface EvolveCommand {
  type: 'evolve';
  generations: number;
}

export interface InjectCommand {
  type: 'inject';
  migrants: Chromosome[];
}

export interface FinishCommand {
  type: 'finish';
}

export type IslandCommand = EvolveCommand | InjectCommand | FinishCommand;

/**
 * Sends a command to a worker and awaits its response.
 */
export function sendCommand(worker: Worker, cmd: IslandCommand): Promise<IslandWorkerMessage> {
  return new Promise((resolve, reject) => {
    const onMessage = (msg: unknown) => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      resolve(msg as IslandWorkerMessage);
    };
    const onError = (err: Error) => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      reject(err);
    };
    const onExit = (code: number) => {
      worker.off('message', onMessage);
      worker.off('error', onError);
      worker.off('exit', onExit);
      reject(new Error(`Worker exited with code ${code}`));
    };
    worker.on('message', onMessage);
    worker.on('error', onError);
    worker.on('exit', onExit);
    worker.postMessage(cmd);
  });
}
```

**Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/algorithms/brkga/IslandMessenger.ts
git commit -m "feat(brkga): add IslandMessenger for worker communication protocol"
```

---

### Task 3: Extract `evolvePopulation` and make `solve()` async

**Files:**
- Modify: `src/algorithms/brkga/BRKGA.ts`

**Step 1: Extract evolution loop into `evolvePopulation`**

Add a new protected method after `crossover()`:

```typescript
  /**
   * Evolves one generation of the population.
   * @param population - Current population (already evaluated and sorted)
   * @returns Next generation population
   */
  evolvePopulation(population: Individual[]): Individual[] {
    const nextPopulation: Individual[] = [];

    // Elite preservation
    const eliteCount = Math.floor(this.populationSize * this.eliteFraction);
    for (let i = 0; i < eliteCount; i++) {
      const elite = population[i];
      if (elite) {
        nextPopulation.push({ ...elite });
      }
    }

    // Mutants (random individuals)
    const mutantCount = Math.floor(this.populationSize * this.mutantFraction);
    for (let i = 0; i < mutantCount; i++) {
      nextPopulation.push(this.randomIndividual());
    }

    // Crossover (biased: always one elite parent)
    const crossoverCount = this.populationSize - nextPopulation.length;
    for (let i = 0; i < crossoverCount; i++) {
      const eliteParent = population[Math.floor(Math.random() * eliteCount)];
      const nonEliteParent =
        population[
          eliteCount + Math.floor(Math.random() * (this.populationSize - eliteCount))
        ];
      if (eliteParent && nonEliteParent) {
        nextPopulation.push(this.crossover(eliteParent, nonEliteParent));
      }
    }

    return nextPopulation;
  }
```

**Step 2: Replace inline evolution in `solve()`**

In `solve()`, replace the entire `// Evolve` block (from `const nextPopulation` through `population = nextPopulation;`) with:

```typescript
      population = this.evolvePopulation(population);
```

**Step 3: Make `solve()` async**

Change the signature from `solve(): VrpSolution` to `async solve(): Promise<VrpSolution>`.

At the beginning of `solve()`, after `const startTime = Date.now();`, add the island branch:

```typescript
    if (this.islands > 1) {
      return this.solveIslands(startTime);
    }
```

The existing single-island path stays exactly as-is (it now runs inside an async function, but all its logic is synchronous). The `return` at the end of `solve()` becomes `return solution;` inside the async function, which automatically wraps it in a resolved Promise.

**Step 4: Verify typecheck**

```bash
npm run typecheck
```

Expected: No errors.

**Step 5: Commit**

```bash
git add src/algorithms/brkga/BRKGA.ts
git commit -m "refactor(brkga): extract evolvePopulation, make solve() async, add island branch"
```

---

### Task 4: Implement `solveIslands()` orchestration

**Files:**
- Modify: `src/algorithms/brkga/BRKGA.ts`

**Step 1: Add `solveIslands()` method**

Add this protected method at the end of the `BRKGA` class (before the closing `}`):

```typescript
  protected async solveIslands(startTime: number): Promise<VrpSolution> {
    const { Worker } = await import('worker_threads');
    const { resolve } = await import('path');
    const { sendCommand } = await import('./IslandMessenger.js');

    const islandPopulationSize = Math.max(10, Math.floor(this.populationSize / this.islands));
    const islandMaxGenerations = this.maxGenerations;
    const workerPath = resolve(process.cwd(), 'dist', 'worker.js');

    const workers: Worker[] = [];

    for (let i = 0; i < this.islands; i++) {
      const worker = new Worker(workerPath, {
        workerData: {
          nodes: this.problem.nodes,
          customers: this.problem.customers,
          vehicles: this.problem.vehicles,
          depotNodeId: this.problem.depotNodeId,
          type: 'island-brkga',
          islandId: i,
          options: {
            populationSize: islandPopulationSize,
            eliteFraction: this.eliteFraction,
            mutantFraction: this.mutantFraction,
            crossoverProb: this.crossoverProb,
            maxGenerations: islandMaxGenerations,
            islandPopulationSize,
            islandMaxGenerations,
            migrationInterval: this.migrationInterval,
            warmStartSolution: this.warmStartSolution,
            warmStartProportion: this.warmStartProportion,
            maxTimeMs: this.maxTimeMs,
          },
        },
      });
      workers.push(worker);
    }

    let globalBest: Individual | null = null;
    let generation = 0;

    try {
      // Initial checkpoint (generation 0)
      await Promise.all(
        workers.map(w => sendCommand(w, { type: 'evolve', generations: 0 })),
      );

      while (generation < this.maxGenerations) {
        // Global timeout check
        if (this.maxTimeMs > 0 && Date.now() - startTime >= this.maxTimeMs) {
          this.logger.log('Island BRKGA stopping early (global timeout)');
          break;
        }

        // Evolve one migration interval
        const evolveResults = await Promise.all(
          workers.map(w =>
            sendCommand(w, { type: 'evolve', generations: this.migrationInterval }),
          ),
        );

        // Collect populations and update global best
        const populations: Individual[][] = [];
        for (const result of evolveResults) {
          if (result.type === 'checkpoint') {
            populations.push(result.population);
            const islandBest = result.population[0] ?? null;
            if (
              islandBest &&
              (globalBest === null ||
                (islandBest.fitness !== null && islandBest.fitness < (globalBest.fitness ?? Infinity)))
            ) {
              globalBest = {
                chromosome: {
                  priorities: [...islandBest.chromosome.priorities],
                  assignments: [...islandBest.chromosome.assignments],
                  dependencies: [...islandBest.chromosome.dependencies],
                  transfers: [...islandBest.chromosome.transfers],
                },
                fitness: islandBest.fitness,
                solution: islandBest.solution?.clone() ?? null,
              };
            }
          }
        }

        generation += this.migrationInterval;

        // Progress callback
        if (this.onProgress && generation % 100 === 0) {
          this.onProgress({
            generation,
            maxGenerations: this.maxGenerations,
            bestMakespan: globalBest?.fitness ?? Infinity,
            populationSize: this.populationSize,
          });
        }

        if (generation >= this.maxGenerations) break;

        // Migration: collect elites
        const migrantCount = Math.max(1, Math.floor(islandPopulationSize * this.migrantFraction));
        const allMigrants: Chromosome[] = [];
        for (const pop of populations) {
          for (let i = 0; i < migrantCount; i++) {
            const donor = pop[i];
            if (donor) {
              allMigrants.push({
                priorities: [...donor.chromosome.priorities],
                assignments: [...donor.chromosome.assignments],
                dependencies: [...donor.chromosome.dependencies],
                transfers: [...donor.chromosome.transfers],
              });
            }
          }
        }

        // Shuffle migrants
        for (let i = allMigrants.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [allMigrants[i], allMigrants[j]] = [allMigrants[j]!, allMigrants[i]!];
        }

        // Distribute to islands (round-robin slices)
        const migrantsPerIsland = Math.max(1, Math.floor(allMigrants.length / this.islands));
        const injectPromises: Promise<unknown>[] = [];
        for (let i = 0; i < this.islands; i++) {
          const startIdx = i * migrantsPerIsland;
          const slice = allMigrants.slice(startIdx, startIdx + migrantsPerIsland);
          injectPromises.push(sendCommand(workers[i]!, { type: 'inject', migrants: slice }));
        }
        await Promise.all(injectPromises);
      }

      // Finish: get best from each island
      const finishResults = await Promise.all(
        workers.map(w => sendCommand(w, { type: 'finish' })),
      );

      for (const result of finishResults) {
        if (result.type === 'finish' && result.bestIndividual) {
          const ind = result.bestIndividual;
          if (
            globalBest === null ||
            (ind.fitness !== null && ind.fitness < (globalBest.fitness ?? Infinity))
          ) {
            globalBest = ind;
          }
        }
      }
    } catch (err) {
      this.logger.log(
        `Island BRKGA worker failed: ${err instanceof Error ? err.message : String(err)}. Falling back to single-island.`,
      );
      for (const w of workers) {
        w.terminate().catch(() => {});
      }
      // Fallback to single-island
      return this.runSingleIsland(startTime);
    }

    // Terminate workers
    for (const w of workers) {
      w.terminate().catch(() => {});
    }

    return (
      globalBest?.solution ?? this.decoder.decode(this.randomIndividual().chromosome)
    );
  }
```

**Step 2: Add `runSingleIsland()` helper**

Add a protected method that runs the existing single-island logic:

```typescript
  protected runSingleIsland(startTime: number): VrpSolution {
    let population = this.initializePopulation();
    let bestIndividual: Individual | null = null;
    let generationsWithoutImprovement = 0;
    const maxStagnantGenerations = Math.floor(this.maxGenerations * 0.1);

    for (let g = 0; g < this.maxGenerations; g++) {
      if (this.maxTimeMs > 0 && Date.now() - startTime >= this.maxTimeMs) {
        this.logger.log(`BRKGA stopped early after ${g} generations (timeout)`);
        break;
      }

      for (const ind of population) {
        if (ind.fitness === null) {
          const solution = this.decoder.decode(ind.chromosome);
          ind.fitness = solution.isFeasible() ? solution.makespan : Infinity;
          ind.solution = solution;
        }
      }

      population.sort((a, b) => (a.fitness ?? Infinity) - (b.fitness ?? Infinity));

      const top = population[0];
      const topFitness = top?.fitness ?? Infinity;
      if (
        !bestIndividual ||
        (bestIndividual.fitness !== null && topFitness < bestIndividual.fitness)
      ) {
        if (!top) continue;
        bestIndividual = {
          chromosome: {
            priorities: [...top.chromosome.priorities],
            assignments: [...top.chromosome.assignments],
            dependencies: [...top.chromosome.dependencies],
            transfers: [...top.chromosome.transfers],
          },
          fitness: top.fitness,
          solution: top.solution?.clone() ?? null,
        };
        generationsWithoutImprovement = 0;
      } else {
        generationsWithoutImprovement++;
      }

      if (generationsWithoutImprovement >= maxStagnantGenerations) {
        break;
      }

      population = this.evolvePopulation(population);

      if (this.onProgress && g % 100 === 0) {
        this.onProgress({
          generation: g,
          maxGenerations: this.maxGenerations,
          bestMakespan: bestIndividual.fitness ?? Infinity,
          populationSize: this.populationSize,
        });
      }

      if (g % 10 === 0) {
        this.logger.log(
          `BRKGA Gen ${g}: Best makespan = ${(bestIndividual.fitness ?? Infinity).toFixed(2)}`,
        );
      }
    }

    return (
      bestIndividual?.solution ?? this.decoder.decode(this.randomIndividual().chromosome)
    );
  }
```

Then simplify the existing `solve()` single-island path to just call `runSingleIsland`:

```typescript
  async solve(): Promise<VrpSolution> {
    const startTime = Date.now();
    if (this.islands > 1) {
      return this.solveIslands(startTime);
    }
    return this.runSingleIsland(startTime);
  }
```

**Step 3: Verify typecheck**

```bash
npm run typecheck
```

Expected: No errors.

**Step 4: Commit**

```bash
git add src/algorithms/brkga/BRKGA.ts
git commit -m "feat(brkga): implement island-model solveIslands orchestration and runSingleIsland helper"
```

---

### Task 5: Extend worker.ts with island-brkga type

**Files:**
- Modify: `src/worker.ts`

**Step 1: Add Chromosome import**

At the top of `src/worker.ts`, add:
```typescript
import type { Chromosome } from './algorithms/brkga/Decoder.js';
```

**Step 2: Wrap the existing try/catch in an async IIFE**

The current `src/worker.ts` has synchronous top-level code:
```typescript
try {
  let solution: VrpSolution;
  if (data.type === 'ALNS') { ... }
  else { ... }
  parentPort?.postMessage(result);
} catch (err) { ... }
```

Change it to an async IIFE:
```typescript
(async () => {
  try {
    let solution: VrpSolution;
    if (data.type === 'ALNS') { ... }
    else { ... }
    parentPort?.postMessage(result);
  } catch (err) {
    ...
  }
})();
```

And change `const brkga = new BRKGA(problem, data.options); solution = brkga.solve();` to `solution = await brkga.solve();`.

**Step 3: Add island-brkga handling before the ALNS/BRKGA branch**

Inside the async IIFE, before the `if (data.type === 'ALNS')` block, add:

```typescript
  // Island-model BRKGA: runs checkpointed epochs until commanded to finish
  if (data.type === 'island-brkga') {
    const { BRKGA } = await import('./algorithms/brkga/BRKGA.js');
    const brkga = new BRKGA(problem, data.options);
    const islandPopulationSize = data.options.islandPopulationSize ?? 10;
    const islandMaxGenerations = data.options.islandMaxGenerations ?? 100;
    const migrationInterval = data.options.migrationInterval ?? 50;

    let population = brkga.initializePopulation();
    let generation = 0;

    const evaluate = () => {
      for (const ind of population) {
        if (ind.fitness === null) {
          const solution = brkga.decoder.decode(ind.chromosome);
          ind.fitness = solution.isFeasible() ? solution.makespan : Infinity;
          ind.solution = solution;
        }
      }
      population.sort((a, b) => (a.fitness ?? Infinity) - (b.fitness ?? Infinity));
    };

    evaluate();

    const messageHandler = (msg: unknown) => {
      const cmd = msg as { type: string; generations?: number; migrants?: Chromosome[] };
      if (cmd.type === 'evolve') {
        const gens = cmd.generations ?? migrationInterval;
        for (let g = 0; g < gens && generation < islandMaxGenerations; g++, generation++) {
          population = brkga.evolvePopulation(population);
          evaluate();
        }
        parentPort?.postMessage({
          type: 'checkpoint',
          islandId: data.islandId,
          generation,
          population,
        });
      } else if (cmd.type === 'inject') {
        const migrants = cmd.migrants ?? [];
        const replaceCount = Math.min(migrants.length, population.length);
        for (let i = 0; i < replaceCount; i++) {
          const targetIdx = population.length - 1 - i;
          population[targetIdx] = {
            chromosome: migrants[i]!,
            fitness: null,
            solution: null,
          };
        }
        parentPort?.postMessage({ type: 'checkpoint', islandId: data.islandId, generation, population });
      } else if (cmd.type === 'finish') {
        evaluate();
        const best = population[0];
        parentPort?.postMessage({
          type: 'finish',
          islandId: data.islandId,
          bestIndividual: best ?? null,
        });
        parentPort?.off('message', messageHandler);
      }
    };

    parentPort?.on('message', messageHandler);
    parentPort?.postMessage({ type: 'checkpoint', islandId: data.islandId, generation, population });
    return;
  }
```

**Step 4: Verify typecheck**

```bash
npm run typecheck
```

Expected: No errors.

**Step 5: Commit**

```bash
git add src/worker.ts
git commit -m "feat(worker): add island-brkga worker type and async IIFE wrapper"
```

---

### Task 6: Extend workerValidation.ts

**Files:**
- Modify: `src/workerValidation.ts`

**Step 1: Add island-brkga validation**

In `validateWorkerData`, after existing type checks, add:

```typescript
  if (data.type === 'island-brkga') {
    if (typeof data.islandId !== 'number' || data.islandId < 0 || !Number.isInteger(data.islandId)) {
      return 'islandId must be a non-negative integer';
    }
    if (typeof data.islandPopulationSize !== 'number' || data.islandPopulationSize < 1 || !Number.isInteger(data.islandPopulationSize)) {
      return 'islandPopulationSize must be a positive integer';
    }
    if (typeof data.islandMaxGenerations !== 'number' || data.islandMaxGenerations < 1 || !Number.isInteger(data.islandMaxGenerations)) {
      return 'islandMaxGenerations must be a positive integer';
    }
    if (typeof data.migrationInterval !== 'number' || data.migrationInterval < 1 || !Number.isInteger(data.migrationInterval)) {
      return 'migrationInterval must be a positive integer';
    }
  }
```

**Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/workerValidation.ts
git commit -m "feat(worker): validate island-brkga worker data fields"
```

---

### Task 7: Update VrpRpdSolver to await BRKGA.solve()

**Files:**
- Modify: `src/index.ts`

**Step 1: Update BRKGA call in VrpRpdSolver.solve()**

In `src/index.ts`, find the line:
```typescript
const brkgaSolution = brkga.solve();
```

Change to:
```typescript
const brkgaSolution = await brkga.solve();
```

**Step 2: Verify typecheck**

```bash
npm run typecheck
```

Expected: No errors.

**Step 3: Commit**

```bash
git add src/index.ts
git commit -m "fix(index): await async BRKGA.solve() in solver"
```

---

### Task 8: Update existing tests to await BRKGA.solve()

**Files:**
- Modify: `tests/algorithms.test.ts`
- Modify: `tests/smoke.test.ts`
- Modify: `tests/bugfixes.test.ts`
- Modify: `tests/typesafety.test.ts`
- Modify: `tests/edge-cases.test.ts`

**Step 1: Find all direct BRKGA.solve() calls**

```bash
grep -n 'brkga.solve()\|new BRKGA' tests/*.ts
```

**Step 2: Update each test file**

For each test function that calls `brkga.solve()` or `new BRKGA(...).solve()`, make the test function `async` and add `await` before the call.

Examples of changes needed:

In `tests/algorithms.test.ts`:
```typescript
// Before
test('BRKGA warm-start roundtrip preserves feasibility', () => {
  ...
  const solution = brkga.solve();
  ...
});

// After
it('BRKGA warm-start roundtrip preserves feasibility', async () => {
  ...
  const solution = await brkga.solve();
  ...
});
```

Apply this pattern to all test files with direct BRKGA.solve() calls. Use `grep` to find them all:

```bash
grep -n '\.solve()' tests/*.ts | grep -i brkga
```

**Step 3: Run tests**

```bash
npm test
```

Expected: All existing tests pass (115 tests).

**Step 4: Commit**

```bash
git add tests/
git commit -m "test: update all BRKGA.solve() calls to await async solve()"
```

---

### Task 9: Create island-brkga tests

**Files:**
- Create: `tests/island-brkga.test.ts`

**Step 1: Write test file**

```typescript
import { expect } from 'chai';

import { BRKGA } from '../src/algorithms/brkga/BRKGA.js';
import { VrpProblem, LocationNode, Customer, Vehicle } from '../src/core/Problem.js';

const makeProblem = () => {
  const nodes = {
    0: new LocationNode(0, 0, 0, 'Depot'),
    1: new LocationNode(1, 10, 0, 'D1'),
    2: new LocationNode(2, 20, 0, 'P1'),
    3: new LocationNode(3, 0, 10, 'D2'),
    4: new LocationNode(4, 0, 20, 'P2'),
  };
  const customers = [new Customer(1, 1, 2, 50), new Customer(2, 3, 4, 50)];
  const vehicles = [new Vehicle(1, 10)];
  return new VrpProblem(nodes, customers, vehicles, 0);
};

describe('Island-Model BRKGA', () => {
  it('single-island fallback produces feasible solution', async () => {
    const problem = makeProblem();
    const brkga = new BRKGA(problem, { islands: 1, populationSize: 10, maxGenerations: 10 });
    const solution = await brkga.solve();
    expect(solution.isComplete()).to.be.true;
    expect(solution.isFeasible()).to.be.true;
    expect(solution.makespan).to.be.greaterThan(0);
  });

  it('two-island model produces feasible solution', async () => {
    const problem = makeProblem();
    const brkga = new BRKGA(problem, {
      islands: 2,
      populationSize: 20,
      maxGenerations: 30,
      migrationInterval: 10,
      migrantFraction: 0.1,
    });
    const solution = await brkga.solve();
    expect(solution.isComplete()).to.be.true;
    expect(solution.isFeasible()).to.be.true;
    expect(solution.makespan).to.be.greaterThan(0);
  });

  it('validates invalid island options', () => {
    const problem = makeProblem();
    expect(() => new BRKGA(problem, { islands: 0 })).to.throw('islands must be a positive integer');
    expect(() => new BRKGA(problem, { islands: -1 })).to.throw('islands must be a positive integer');
    expect(() => new BRKGA(problem, { migrationInterval: 0 })).to.throw('migrationInterval must be a positive integer');
    expect(() => new BRKGA(problem, { migrantFraction: 1.0 })).to.throw('migrantFraction must be between 0 and 1');
  });

  it('respects maxTimeMs with islands', async () => {
    const problem = makeProblem();
    const brkga = new BRKGA(problem, {
      islands: 2,
      populationSize: 20,
      maxGenerations: 500,
      maxTimeMs: 300,
    });
    const start = Date.now();
    const solution = await brkga.solve();
    const elapsed = Date.now() - start;
    expect(elapsed).to.be.lessThan(2000);
    expect(solution.isComplete()).to.be.true;
  });

  it('warm-start works with islands', async () => {
    const problem = makeProblem();
    const { ALNS } = await import('../src/algorithms/alns/ALNS.js');
    const alns = new ALNS(problem, { maxIterations: 5 });
    const warmStart = alns.solve();

    const brkga = new BRKGA(problem, {
      islands: 2,
      populationSize: 20,
      maxGenerations: 20,
      warmStartSolution: warmStart,
      warmStartProportion: 0.15,
    });
    const solution = await brkga.solve();
    expect(solution.isComplete()).to.be.true;
    expect(solution.isFeasible()).to.be.true;
  });
});
```

**Step 2: Run island tests**

```bash
npx mocha tests/island-brkga.test.ts
```

Expected: All 5 tests pass.

**Step 3: Commit**

```bash
git add tests/island-brkga.test.ts
git commit -m "test: add island-model BRKGA tests"
```

---

### Task 10: Update README.md with island-model documentation

**Files:**
- Modify: `README.md`

**Step 1: Add island-model section**

After the existing `SolveOptions` interface in README.md, add:

```markdown
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
```

**Step 2: Update the SolveOptions interface docs**

Add the three new fields to the `SolveOptions` interface docs.

**Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document island-model BRKGA options"
```

---

### Task 11: Full validation

**Files:**
- None (validation only)

**Step 1: Run validation suite**

```bash
npm run clean
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
```

**Step 2: Verify CLI still works**

```bash
node dist/cli.mjs --help
```

Expected: Shows CLI help.

**Step 3: Commit if any fixes needed**

If any step fails, fix and commit.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: implement island-model BRKGA parallelization"
```

---

## Self-Review

### Spec Coverage Check

| Spec Requirement | Task |
|------------------|------|
| Add island options to BRKGAOptions | Task 1 |
| Validate island options | Task 1 |
| Create IslandMessenger | Task 2 |
| Extract evolvePopulation | Task 3 |
| Make solve() async | Task 3 |
| Implement solveIslands orchestration | Task 4 |
| Add runSingleIsland helper | Task 4 |
| Extend worker.ts with island-brkga | Task 5 |
| Extend workerValidation.ts | Task 6 |
| Update VrpRpdSolver to await | Task 7 |
| Update existing tests | Task 8 |
| Add island-brkga tests | Task 9 |
| Document in README | Task 10 |
| Full validation | Task 11 |

**Gaps:** None.

### Placeholder Scan

- No "TBD", "TODO", "implement later", "fill in details" found.
- All code blocks contain actual content.
- No vague directives.

### Type Consistency

- `BRKGA.solve()` returns `Promise<VrpSolution>` everywhere.
- `IslandMessenger` types use `Individual` and `Chromosome` consistently.
- Worker message types match between `IslandMessenger.ts` and `worker.ts`.
- `solveIslands()` and `runSingleIsland()` both return `VrpSolution` (the former via Promise).

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-14-island-model-brkga-implementation.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
