# VRP-RPD TypeScript Package Modernization Design

**Date:** 2026-05-13
**Scope:** Infrastructure, algorithm correctness, code quality, and test coverage for the VRP-RPD solver.

---

## 1. Overview

Transform the existing VRP-RPD repository into a production-grade TypeScript-first package with minimal configuration, strong typing, automated tooling, clean developer experience, and publish-ready infrastructure. Preserve all existing business logic, keep Jest for testing, and improve algorithm correctness and code quality per the Google TypeScript Style Guide.

---

## 2. Goals

- Zero-config onboarding: clone → install → start coding.
- ESM-first with clean `exports` map and optional CJS fallback.
- Rollup + TypeScript for typed builds, declaration files, source maps, and tree-shakable output.
- Strict ESLint with TypeScript awareness and import/order validation.
- Jest + c8 for testing and coverage with enforced thresholds.
- Typedoc for automated API documentation.
- GitHub Actions CI/CD with automated testing, linting, and npm publish on tag push.
- Correctness fixes for the most critical algorithm gaps (Decoder, BRKGA chromosome size, operator deduplication).
- Naming conventions aligned with Google TS Style Guide.
- Typed error hierarchy for testability and downstream handling.
- Comprehensive test coverage including edge cases and property-style invariants.

---

## 3. Non-Goals

- No GPU acceleration (out of scope).
- No migration from Jest to Mocha/Chai (explicitly excluded by user).
- No full 4n chromosome multi-pass decoder rewrite beyond the critical `canScheduleCustomer` fix.
- No Prettier addition unless explicitly requested later.
- No benchmark validation against paper instances (out of scope for this infrastructure pass).

---

## 4. Architecture

### 4.1 Build Pipeline

```
src/  →  tsc (type-check + .d.ts)  →  Rollup (bundle ESM + CJS)  →  dist/
```

- `tsc` runs first for type-checking and `.d.ts` generation.
- Rollup bundles ESM (`dist/index.mjs`) and CJS (`dist/index.cjs`) with source maps.
- `rollup-plugin-dts` bundles declarations into a single `dist/index.d.ts`.

### 4.2 Package Exports

```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "engines": { "node": ">=18" }
}
```

### 4.3 Tooling Stack

| Concern         | Tool                     |
|-----------------|--------------------------|
| Language        | TypeScript 5.7+          |
| Module format   | ESM-first (Node `type: module`) |
| Bundler         | Rollup 4.x               |
| Type checker    | `tsc`                    |
| Linter          | ESLint 9.x flat config   |
| Test runner     | Jest 30.x + ts-jest      |
| Coverage        | c8                       |
| Docs            | Typedoc                  |
| CI/CD           | GitHub Actions           |

---

## 5. File Structure (Post-Migration)

```
├── src/
│   ├── index.ts
│   ├── errors.ts                 # ValidationError, InfeasibleSolutionError, AlgorithmConvergenceError
│   ├── core/
│   │   ├── Problem.ts            # VrpProblem, LocationNode, Customer, Vehicle (with aliases)
│   │   ├── Solution.ts           # VrpSolution, Route
│   │   ├── MultiDepotProblem.ts
│   │   ├── TrafficAwareProblem.ts
│   │   ├── ResourceTransfer.ts
│   │   ├── VehicleWithCapabilities.ts
│   │   └── SolutionWithTransfers.ts
│   ├── algorithms/
│   │   ├── alns/
│   │   │   ├── ALNS.ts
│   │   │   ├── operators.ts    # deduplicated removal helpers
│   │   │   └── TransferAwareOperators.ts
│   │   └── brkga/
│   │       ├── BRKGA.ts        # 4n chromosome fix
│   │       └── Decoder.ts       # canScheduleCustomer implementation
│   ├── analytics/
│   ├── export/
│   ├── worker.ts
│   └── workerValidation.ts
├── tests/
│   ├── core.test.ts
│   ├── algorithms.test.ts
│   ├── errors.test.ts
│   └── edge-cases.test.ts
├── docs/
│   └── api/                    # Typedoc output
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── publish.yml
├── tsconfig.json
├── tsconfig.test.json
├── rollup.config.mjs
├── eslint.config.mjs
├── jest.config.json
├── c8.config.json
├── typedoc.json
├── package.json
└── README.md
```

---

## 6. Configuration Files

### 6.1 `tsconfig.json`
- Keep strict settings.
- `module: "ESNext"`, `moduleResolution: "Bundler"` (to align with Rollup).
- `outDir: "./dist"`, `rootDir: "./src"`.
- `declaration: true`, `declarationMap: true`, `sourceMap: true`.
- `noEmitOnError: true` for CI safety.
- Preserve `.js` extensions in TS source imports (required for ESM); `moduleResolution: "Bundler"` handles these correctly.

### 6.2 `rollup.config.mjs`
- Inputs:
  - Main: `src/index.ts` → `dist/index.mjs` + `dist/index.cjs`
  - Worker: `src/worker.ts` → `dist/worker.mjs` + `dist/worker.cjs` (preserves Worker threading for parallel solve)
- Plugins: `@rollup/plugin-typescript` (or `rollup-plugin-ts`), `rollup-plugin-dts` for declarations.
- External: all `dependencies` and `peerDependencies` from `package.json`.
- Worker path resolution: `VrpRpdSolver` resolves worker path via `import.meta.url` in ESM builds and `__dirname` in CJS builds, falling back to `process.cwd()` for compatibility.

### 6.3 `eslint.config.mjs`
- `@typescript-eslint/recommended-type-checked`
- `@typescript-eslint/strict-type-checked`
- `import/order` validation
- `@typescript-eslint/consistent-type-imports: error`
- `no-console: error` in all files *except* `src/algorithms/**/*` (algorithm progress logging is replaced with a `Logger` interface; see Section 7.7)

### 6.4 `jest.config.json`
- `preset: "ts-jest/presets/default-esm"`
- `extensionsToTreatAsEsm: [".ts"]`
- `coverageProvider: "v8"` (for c8 compatibility)
- `collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts"]`

### 6.5 `c8.config.json`
- Thresholds:
  - `lines: 80`
  - `functions: 80`
  - `branches: 75`
  - `statements: 80`

---

## 7. Algorithm & Code Quality Improvements

### 7.1 Naming Conventions (Google TS Guide)
- `Problem` → `VrpProblem`
- `Solution` → `VrpSolution`
- `Node` → `LocationNode`
- Keep old names as `@deprecated` re-exports in `index.ts` for backward compatibility.
- Explicit visibility modifiers on all class members.
- Remove non-null assertions where feasible.

### 7.2 Error Hierarchy (`src/errors.ts`)
```typescript
export class VrpError extends Error {}
export class ValidationError extends VrpError {}
export class InfeasibleSolutionError extends VrpError {}
export class AlgorithmConvergenceError extends VrpError {}
```
Replace all generic `throw new Error(...)` in core and algorithms with typed errors.

### 7.3 Operator Deduplication (`src/algorithms/alns/operators.ts`)
Extract `removeCustomerFromRoutes(solution: Solution, customer: Customer): void` to replace the duplicated splicing logic in all six removal operators.

### 7.4 Decoder Fix (`src/algorithms/brkga/Decoder.ts`)
Implement `canScheduleCustomer`:
- A customer's pickup can only be scheduled if its delivery is already in a route.
- The delivery must have occurred and processing time elapsed (checked via `nodeTimes` and `resourceReadyTimes`).

### 7.5 BRKGA Chromosome Fix (`src/algorithms/brkga/BRKGA.ts`)
- Set `chromosomeSize = 4 * problem.customers.length`.
- Update `randomIndividual`, `crossover`, `mutateChromosome` to operate on `4n` genes.
- Ensure `Decoder` reads all four segments correctly.

### 7.6 ALNS Optimizations
- Cache `weights.reduce` sum in `selectOperator` or build a cumulative distribution.
- Simplify `updateWeights` with early-continue instead of deep `if` chains.
- Note: `Math.random()` is not seedable, making unit tests non-deterministic. Document this limitation; do not introduce a seedable PRNG in this pass (out of scope), but mark it as a future improvement.

### 7.7 Logger Interface
Replace direct `console.log` calls in `ALNS` and `BRKGA` with a minimal `Logger` interface:

```typescript
export interface Logger {
  log(message: string): void;
}
export const defaultLogger: Logger = { log: () => {} };
```

Accept an optional `logger` parameter in solver constructors. This eliminates side effects during library use and makes testing easier (inject a spy logger to verify messages).

---

## 8. Testing Strategy

### 8.1 Coverage Targets
- Core models: 100% branch coverage.
- Algorithms: 80%+ line coverage.
- Error handling: all custom errors thrown and caught.

### 8.2 New Test Files
- `tests/edge-cases.test.ts`: empty inputs, duplicate IDs, negative values, time window violations, single-customer trivial cases.
- `tests/errors.test.ts`: typed error construction and throwing.
- `tests/algorithms.test.ts`: ALNS operator stats, BRKGA warm-start roundtrip, Decoder dependency scheduling.
- `tests/logger.test.ts`: verify `Logger` interface injection captures log output.

### 8.3 Existing Test File Changes
- `tests/core.test.ts`: expand to cover capacity edge cases (capacity=1, capacity=Infinity), zero-distance nodes, and `clone()` independence.
- `tests/typesafety.test.ts` and `tests/security.test.ts`: keep but ensure they pass under strict ESLint rules.
- `smoke-test.ts`: move to `tests/smoke.test.ts` and convert to Jest test format so it runs in CI.

### 8.3 Property-Style Invariants
- `clone()` produces independent deep copies.
- `calculateSchedule()` is idempotent.
- `isFeasible()` implies `isComplete()` + `checkCapacity()` + `checkTimeWindows()`.
- `VrpRpdSolver.solve()` returns feasible solutions for both `parallel: true` and `parallel: false`.

---

## 9. CI/CD Workflows

### 9.1 `ci.yml`
- Matrix: Node 18.x, 20.x, 22.x.
- Jobs:
  1. **lint**: `npm run lint` (zero tolerance; remove `continue-on-error`).
  2. **typecheck**: `npm run typecheck` (fast fail).
  3. **test**: `npm run test` + `npm run test:coverage` (zero tolerance; remove `continue-on-error`).
  4. **build**: `npm run build`, then upload `dist/` artifact for downstream publish job.

### 9.2 `publish.yml`
- Trigger: `on.push.tags: ["v*"]`.
- Steps:
  1. Run full CI pipeline (lint, typecheck, test, build).
  2. Download build artifacts.
  3. Verify `CHANGELOG.md` contains the tag version.
  4. `npm publish --provenance` (requires `NPM_TOKEN` repository secret).

---

## 10. Migration Order

1. Update `package.json` with new scripts, exports, engines, and dev dependencies.
   - Keep `demo` script for Vite (`"demo": "npx vite demo"`).
   - Rename old `"dev": "npx vite demo"` to `"demo"`; new `"dev": "rollup -c -w"`.
2. Add configuration files: `rollup.config.mjs`, `eslint.config.mjs`, `c8.config.json`, `typedoc.json`.
3. Update `tsconfig.json` and `jest.config.json`. Keep `tsconfig.test.json` aligned.
4. Move `smoke-test.ts` to `tests/smoke.test.ts` and rewrite as Jest tests.
5. Add `src/errors.ts` and migrate existing `throw new Error` calls.
6. Introduce `Logger` interface and replace `console.log` in ALNS/BRKGA.
7. Rename core classes with `@deprecated` aliases.
8. Deduplicate ALNS operators and fix `Decoder.canScheduleCustomer`.
9. Fix BRKGA chromosome size.
10. Expand tests and verify coverage thresholds.
11. Update GitHub Actions workflows.
12. Generate docs and validate build output.

---

## 11. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Renaming classes breaks external consumers | Keep `@deprecated` aliases in `index.ts`. |
| BRKGA chromosome size change affects behavior | Add integration tests verifying feasibility post-fix. |
| ESLint strict rules flag existing code | Enable incrementally; fix or suppress only with justification. |
| Rollup bundling breaks Worker path resolution | Resolve worker path relative to `import.meta.url` in ESM builds; build worker as separate entry point. |
| Demo breakage from script renaming | Add explicit `"demo"` script preserving Vite behavior; document in README. |
| Test flakiness from `Math.random()` in algorithms | Document non-determinism in tests; mark seedable PRNG as future work. |
| ESM/CJS dual-package hazards | Ensure `exports` map points both formats to same logical entry; use `rollup-plugin-dts` for unified types. |

---

## 12. Validation Checklist

- [ ] `npm run build` produces `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.ts`.
- [ ] `npm run typecheck` passes with zero errors.
- [ ] `npm run lint` passes with zero errors.
- [ ] `npm test` passes.
- [ ] `npm run test:coverage` meets c8 thresholds.
- [ ] `npm run docs` generates Typedoc output in `docs/api/`.
- [ ] CI workflow passes on Node 18, 20, 22.
- [ ] Publish workflow triggers on version tag.
- [ ] All existing API consumers compile without changes (backward-compatible aliases).
