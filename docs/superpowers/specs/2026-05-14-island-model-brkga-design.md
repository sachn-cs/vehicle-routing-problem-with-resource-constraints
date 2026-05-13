# Island-Model BRKGA Parallelization Design

**Date:** 2026-05-14
**Topic:** Add island-model parallelization to the existing BRKGA algorithm
**Approach:** Extend existing `BRKGA` class with configurable multi-island evolution via worker threads

## Goals

- Add island-model BRKGA parallelization as an opt-in extension to the existing `BRKGA` class.
- Preserve exact single-island behavior when `islands = 1` (default).
- Leverage existing `worker_threads` infrastructure with minimal re-architecture.
- Achieve meaningful speedup and solution-quality improvement on multi-core machines.

## Non-Goals

- No GPU acceleration (still CPU-only).
- No changes to ALNS, Decoder, or problem/solution models.
- No changes to the existing parallel ALNS+BRKGA solver flow (`VrpRpdSolver.solveParallel`).
- No topology beyond fully-connected (for this iteration).

## Architecture

### Overview

The existing `BRKGA` class runs a single population synchronously. We extend it with three new options:

- `islands?: number` — Number of parallel populations (default: 1).
- `migrationInterval?: number` — Generations between migrations (default: 50).
- `migrantFraction?: number` — Fraction of each island's population that emigrates (default: 0.05).

When `islands > 1`, the `solve()` method:

1. Splits `populationSize` equally among islands (`islandPopulationSize = floor(populationSize / islands)`, minimum 10).
2. Spawns `islands` worker threads via `worker.ts`.
3. Each worker evolves independently for `migrationInterval` generations.
4. Workers post their full population to the main thread.
5. Main thread extracts elites from each island, shuffles them, and redistributes them to replace the worst individuals on every other island (fully-connected migration).
6. Steps 3–5 repeat until `maxGenerations` or timeout.
7. Workers post their best solution. Main thread picks the global best, terminates workers, and returns.

If a worker crashes, the main thread falls back to single-island BRKGA on the main thread with a warning.

### Data Flow

```
Main Thread                                    Worker Thread (×islands)
───────────                                    ───────────────────────
spawn worker with islandId, params   ──────▶  reconstruct problem
                                         ◀────  ready

for each migration epoch:
  send "evolve N generations"            ─────▶  run N generations
                                         ◀────  post full population

  migrate elites between islands
  send "inject migrants" + chromosomes   ─────▶  replace worst with migrants
                                         ◀────  ack

final epoch:
  send "finish"                          ─────▶  return best individual
                                         ◀────  best solution

collect global best, terminate workers
```

### Component Breakdown

| Component | Responsibility |
|-----------|--------------|
| `BRKGA` (extended) | Validates options, decides single vs multi-island path, orchestrates workers, performs migration, returns global best. |
| `IslandWorkerData` | Extends `WorkerData` with `islandId`, `islandPopulationSize`, `islandMaxGenerations`, `migrationInterval`, `migrantFraction`, `warmStartChromosomes`. |
| `worker.ts` (extended) | Handles new `island-brkga` type: reconstructs problem, initializes population (with optional warm-start), evolves in checkpointed epochs, responds to migrate/finish commands. |
| `IslandMessenger` (new helper) | Encapsulates `postMessage` / `on('message')` protocol between main thread and island workers. Reduces coupling in `BRKGA`. |

### Migration Protocol (Fully-Connected)

1. For each island, sort population by fitness and select top `ceil(islandPopulationSize * migrantFraction)` individuals as **emigrants**.
2. Collect all emigrants into a single pool.
3. Shuffle the pool randomly.
4. For each island, replace its worst individuals (same count as emigrants taken) with a slice from the shuffled pool.
5. Ensure no island receives back its own emigrants (if pool is large enough). If pool is small, deduplicate by fitness.

### Worker Message Protocol

```typescript
// Worker → Main
interface IslandCheckpointMessage {
  type: 'checkpoint';
  islandId: number;
  generation: number;
  population: Individual[]; // serialized
}

interface IslandFinishMessage {
  type: 'finish';
  islandId: number;
  bestIndividual: Individual;
}

// Main → Worker
interface EvolveCommand {
  type: 'evolve';
  generations: number;
}

interface InjectCommand {
  type: 'inject';
  migrants: Chromosome[];
}

interface FinishCommand {
  type: 'finish';
}
```

### Fallback Behavior

- `islands <= 1`: Existing synchronous single-island path. Zero code path changes.
- `islands > 1` but `os.cpus().length < islands`: Warn and proceed (OS will time-slice).
- Worker crash / exit code !== 0: Main thread catches via `worker.on('error')` / `worker.on('exit')`. If any island fails, log warning, terminate remaining workers, and fall back to single-island BRKGA on the main thread with original options.
- Timeout: `maxTimeMs` is still respected. Each worker receives the same `maxTimeMs`. The main thread also enforces a global timer and sends `FinishCommand` to all workers if exceeded.

## Configuration

```typescript
export interface BRKGAOptions {
  // ... existing options ...
  islands?: number;            // Default: 1
  migrationInterval?: number;  // Default: 50
  migrantFraction?: number;    // Default: 0.05
}
```

Validation rules:
- `islands` must be a positive integer. `islands <= 1` disables island mode.
- `migrationInterval` must be a positive integer and `<= maxGenerations`.
- `migrantFraction` must be between 0 and 1 (exclusive).
- `islandPopulationSize = floor(populationSize / islands)`. If `< 10`, warn and clamp to `10`.

## Testing Strategy

| Test | Description |
|------|-------------|
| Single-island fallback | `solve({ islands: 1 })` produces identical results to pre-change behavior. |
| Two-island convergence | `solve({ islands: 2, populationSize: 20, maxGenerations: 30 })` returns a feasible complete solution. |
| Migration correctness | Mock migration by running 2 islands with `migrationInterval = 10` and verifying that after migration, island populations contain chromosomes from the other island. |
| Worker crash fallback | Simulate a worker crash (e.g., by sending invalid data to one worker) and verify main thread falls back to single-island gracefully. |
| Timeout with islands | `maxTimeMs = 500` with islands stops all workers within ~1000ms and returns a solution. |
| Warm-start with islands | `warmStartSolution` propagates to all islands; each island receives a mutated copy. |
| Validation errors | Invalid `islands`, `migrationInterval`, `migrantFraction` throw `ValidationError`. |

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Worker serialization overhead slows down small problems | Island mode only beneficial for large populations. For small problems (`populationSize < 100`), single-island is faster. The design does not auto-force islands. |
| Message-passing bottleneck at every migration | Keep `migrationInterval` reasonably high (default 50). Serialize only chromosomes, not full `VrpSolution` objects. Workers re-decode after injection. |
| Non-determinism from worker scheduling | Acceptable for metaheuristics. Document that island-model results may vary between runs. |
| `worker_threads` not available in some environments | Node.js 18+ guarantees `worker_threads`. Browser builds would need a separate discussion. Not in scope. |

## Files to Create or Modify

| Action | File | Reason |
|--------|------|--------|
| Modify | `src/algorithms/brkga/BRKGA.ts` | Add island options, orchestration logic, migration |
| Modify | `src/worker.ts` | Add `island-brkga` worker type |
| Modify | `src/workerValidation.ts` | Validate `IslandWorkerData` |
| Create | `src/algorithms/brkga/IslandMessenger.ts` | Message protocol helper |
| Modify | `src/index.ts` | Export new types if needed |
| Create | `tests/island-brkga.test.ts` | Island-model specific tests |
| Modify | `tests/typesafety.test.ts` | Add `IslandWorkerData` type checks if applicable |
| Modify | `README.md` | Document island-model options |
