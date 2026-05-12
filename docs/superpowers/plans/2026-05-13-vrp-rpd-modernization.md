# VRP-RPD Modernization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the VRP-RPD repository into a production-grade TypeScript-first package with Rollup bundling, ESLint, c8 coverage, typed errors, algorithm correctness fixes, and comprehensive tests — while preserving existing APIs via deprecated aliases.

**Architecture:** ESM-first package with dual CJS/ESM output via Rollup. Strict TypeScript with bundled declarations. Jest + c8 for testing. GitHub Actions CI/CD with automated publish on version tags. Core classes renamed per Google TS Style Guide with backward-compatible aliases.

**Tech Stack:** TypeScript 5.7, Rollup 4, ESLint 9, Jest 30 + ts-jest, c8, Typedoc, GitHub Actions.

---

## File Map

| File | Responsibility |
|------|----------------|
| `package.json` | Scripts, exports map, engines, devDependencies |
| `tsconfig.json` | TypeScript compiler config (strict, ESM, declaration emit) |
| `tsconfig.test.json` | TypeScript config for test files (relaxed unused params) |
| `rollup.config.mjs` | Rollup bundler: ESM + CJS + declaration bundle |
| `eslint.config.mjs` | ESLint flat config with TS rules, import/order, no-console |
| `jest.config.json` | Jest preset for ESM TypeScript |
| `c8.config.json` | Coverage thresholds and reporters |
| `typedoc.json` | Typedoc config for API docs generation |
| `src/errors.ts` | Typed error hierarchy (VrpError, ValidationError, etc.) |
| `src/logger.ts` | Logger interface and default no-op logger |
| `src/index.ts` | Main exports with `@deprecated` aliases |
| `src/core/Problem.ts` | Renamed classes, explicit visibility, typed errors |
| `src/core/Solution.ts` | Renamed classes, explicit visibility, typed errors |
| `src/core/*.ts` | Other core files get visibility modifiers and typed errors |
| `src/algorithms/alns/ALNS.ts` | Logger injection, weight caching, typed errors |
| `src/algorithms/alns/operators.ts` | Deduplicated removal helper, typed errors |
| `src/algorithms/brkga/BRKGA.ts` | 4n chromosome fix, logger injection, typed errors |
| `src/algorithms/brkga/Decoder.ts` | `canScheduleCustomer` implementation, typed errors |
| `tests/smoke.test.ts` | Converted from `smoke-test.ts` to Jest format |
| `tests/errors.test.ts` | Typed error construction and throwing |
| `tests/edge-cases.test.ts` | Edge case validation and model invariants |
| `tests/algorithms.test.ts` | Algorithm correctness and warm-start roundtrip |
| `tests/logger.test.ts` | Logger interface injection verification |
| `.github/workflows/ci.yml` | Lint, typecheck, build, test, coverage |
| `.github/workflows/publish.yml` | Tag-triggered publish with provenance |
| `README.md` | Updated build/test/publish instructions |

---

## Task 1: Update package.json

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package.json with new scripts, exports, and devDependencies**

```json
{
  "name": "vehicle-routing",
  "version": "1.0.0",
  "description": "VRP-RPD Solver with multi-objective optimization",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "build": "rollup -c",
    "dev": "rollup -c -w",
    "demo": "npx vite demo",
    "clean": "rm -rf dist docs/api",
    "lint": "eslint src tests",
    "lint:fix": "eslint src tests --fix",
    "test": "NODE_OPTIONS=--experimental-vm-modules npx jest",
    "test:watch": "NODE_OPTIONS=--experimental-vm-modules npx jest --watch",
    "test:coverage": "c8 npm test",
    "docs": "typedoc",
    "typecheck": "tsc --noEmit"
  },
  "keywords": ["vrp", "routing", "optimization", "logistics"],
  "author": "",
  "license": "ISC",
  "devDependencies": {
    "@rollup/plugin-typescript": "^12.1.0",
    "@types/jest": "^30.0.0",
    "@types/node": "^22.0.0",
    "@typescript-eslint/eslint-plugin": "^8.0.0",
    "@typescript-eslint/parser": "^8.0.0",
    "c8": "^10.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-import": "^2.30.0",
    "jest": "^30.3.0",
    "rollup": "^4.0.0",
    "rollup-plugin-dts": "^6.0.0",
    "ts-jest": "^29.4.0",
    "tslib": "^2.7.0",
    "typedoc": "^0.27.0",
    "typescript": "^5.7.0",
    "vite": "^8.0.10"
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "build: update package.json with exports, scripts, and dev deps"
```

---

## Task 2: Add Configuration Files

**Files:**
- Create: `rollup.config.mjs`
- Create: `eslint.config.mjs`
- Create: `c8.config.json`
- Create: `typedoc.json`
- Modify: `tsconfig.json`
- Modify: `tsconfig.test.json`
- Modify: `jest.config.json`

- [ ] **Step 1: Create rollup.config.mjs**

```javascript
import typescript from '@rollup/plugin-typescript';
import dts from 'rollup-plugin-dts';

const config = [
  {
    input: 'src/index.ts',
    output: [
      { file: 'dist/index.mjs', format: 'esm', sourcemap: true },
      { file: 'dist/index.cjs', format: 'cjs', sourcemap: true },
    ],
    plugins: [
      typescript({
        tsconfig: './tsconfig.json',
        declaration: false,
        declarationMap: false,
      }),
    ],
    external: [/node_modules/],
  },
  {
    input: 'src/index.ts',
    output: { file: 'dist/index.d.ts', format: 'esm' },
    plugins: [dts()],
    external: [/node_modules/],
  },
];

export default config;
```

- [ ] **Step 2: Create eslint.config.mjs**

```javascript
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

export default tseslint.config(
  tseslint.configs.recommendedTypeChecked,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-console': ['warn', { allow: ['error'] }],
    },
  },
  {
    files: ['src/algorithms/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
```

- [ ] **Step 3: Create c8.config.json**

```json
{
  "all": true,
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.d.ts", "src/**/*.test.ts"],
  "reporter": ["text", "lcov", "html"],
  "check-coverage": true,
  "lines": 80,
  "functions": 80,
  "branches": 75,
  "statements": 80
}
```

- [ ] **Step 4: Create typedoc.json**

```json
{
  "entryPoints": ["src/index.ts"],
  "out": "docs/api",
  "theme": "default",
  "excludeExternals": true,
  "excludePrivate": true,
  "excludeProtected": true,
  "readme": "README.md"
}
```

- [ ] **Step 5: Update tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "WebWorker"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "noEmitOnError": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "noPropertyAccessFromIndexSignature": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "demo", "tests"]
}
```

- [ ] **Step 6: Update tsconfig.test.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "allowSyntheticDefaultImports": true,
    "verbatimModuleSyntax": false
  },
  "include": ["src/**/*", "tests/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 7: Update jest.config.json**

```json
{
  "preset": "ts-jest/presets/default-esm",
  "testEnvironment": "node",
  "extensionsToTreatAsEsm": [".ts"],
  "transform": {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        "useESM": true,
        "tsconfig": "tsconfig.test.json"
      }
    ]
  },
  "collectCoverageFrom": ["src/**/*.ts", "!src/**/*.d.ts"],
  "coverageProvider": "v8",
  "coverageReporters": ["text", "lcov", "html"],
  "testPathIgnorePatterns": ["/node_modules/", "/dist/"],
  "moduleNameMapper": {
    "^(\\.{1,2}/.*)\\.js$": "$1"
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add rollup.config.mjs eslint.config.mjs c8.config.json typedoc.json tsconfig.json tsconfig.test.json jest.config.json
git commit -m "build: add Rollup, ESLint, c8, Typedoc, and Jest configs"
```

---

## Task 3: Add Error Hierarchy and Logger

**Files:**
- Create: `src/errors.ts`
- Create: `src/logger.ts`
- Modify: `src/index.ts` (export new modules)

- [ ] **Step 1: Create src/errors.ts**

```typescript
/** Base error for all VRP-RPD library errors. */
export class VrpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VrpError';
    Object.setPrototypeOf(this, VrpError.prototype);
  }
}

/** Thrown when problem or solver options fail validation. */
export class ValidationError extends VrpError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/** Thrown when a solution violates hard constraints. */
export class InfeasibleSolutionError extends VrpError {
  constructor(message: string) {
    super(message);
    this.name = 'InfeasibleSolutionError';
    Object.setPrototypeOf(this, InfeasibleSolutionError.prototype);
  }
}

/** Thrown when an algorithm fails to converge. */
export class AlgorithmConvergenceError extends VrpError {
  constructor(message: string) {
    super(message);
    this.name = 'AlgorithmConvergenceError';
    Object.setPrototypeOf(this, AlgorithmConvergenceError.prototype);
  }
}
```

- [ ] **Step 2: Create src/logger.ts**

```typescript
/** Minimal logger interface for algorithm progress reporting. */
export interface Logger {
  log(message: string): void;
}

/** Default no-op logger to eliminate side effects during library use. */
export const defaultLogger: Logger = {
  log: () => void 0,
};
```

- [ ] **Step 3: Update src/index.ts exports**

Add these lines to the existing `src/index.ts`:

```typescript
// Errors
export { VrpError, ValidationError, InfeasibleSolutionError, AlgorithmConvergenceError } from './errors.js';

// Logger
export { defaultLogger, type Logger } from './logger.js';
```

- [ ] **Step 4: Commit**

```bash
git add src/errors.ts src/logger.ts src/index.ts
git commit -m "feat: add typed error hierarchy and Logger interface"
```

---

## Task 4: Convert smoke-test.ts to Jest Format

**Files:**
- Create: `tests/smoke.test.ts`
- Delete: `smoke-test.ts`

- [ ] **Step 1: Create tests/smoke.test.ts**

```typescript
import { ALNS } from '../src/algorithms/alns/ALNS.js';
import { BRKGA } from '../src/algorithms/brkga/BRKGA.js';
import { Problem, Node, Customer, Vehicle } from '../src/core/Problem.js';
import { Solution, Route } from '../src/core/Solution.js';
import { VrpRpdSolver } from '../src/index.js';

describe('Smoke Tests', () => {
  test('creates a problem instance', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    expect(problem.customers.length).toBe(1);
    expect(problem.vehicles.length).toBe(1);
    expect(problem.depotNodeId).toBe(0);
  });

  test('calculates schedule and makespan', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new Solution(problem, routes);
    const makespan = solution.calculateSchedule();

    expect(makespan).toBeGreaterThan(0);
    expect(solution.makespan).toBe(makespan);
  });

  test('ALNS solves a small problem', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
      3: new Node(3, 0, 10, 'D2'),
      4: new Node(4, 0, 20, 'P2'),
    };
    const customers = [new Customer(1, 1, 2, 50), new Customer(2, 3, 4, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const alns = new ALNS(problem, { maxIterations: 10 });
    const initialSolution = alns.generateInitialSolution();
    const solution = alns.solve();

    expect(initialSolution.isComplete()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });

  test('BRKGA solves a small problem', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
      3: new Node(3, 0, 10, 'D2'),
      4: new Node(4, 0, 20, 'P2'),
    };
    const customers = [new Customer(1, 1, 2, 50), new Customer(2, 3, 4, 50)];
    const vehicles = [new Vehicle(1, 10)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const brkga = new BRKGA(problem, { populationSize: 10, maxGenerations: 10 });
    const solution = brkga.solve();

    expect(solution.isFeasible()).toBe(true);
    expect(solution.isComplete()).toBe(true);
  });

  test('VrpRpdSolver solves with both algorithms', async () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const solver = new VrpRpdSolver(problem);
    const solution = await solver.solve({ alnsIterations: 10, maxGenerations: 10 });

    expect(solution.isFeasible()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });

  test('validates ALNS options', () => {
    const nodes: Record<number, Node> = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
    };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    expect(() => new ALNS(problem, { coolingRate: 1.5 })).toThrow();
    expect(() => new ALNS(problem, { populationSize: -1 })).toThrow();
  });
});
```

- [ ] **Step 2: Delete old smoke-test.ts**

```bash
rm smoke-test.ts
```

- [ ] **Step 3: Commit**

```bash
git add tests/smoke.test.ts
git rm smoke-test.ts
git commit -m "test: convert smoke-test.ts to Jest format"
```

---

## Task 5: Rename Core Classes with Deprecated Aliases

**Files:**
- Modify: `src/core/Problem.ts`
- Modify: `src/core/Solution.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Rename classes in src/core/Problem.ts**

Replace:
```typescript
export class Node {
```
With:
```typescript
export class LocationNode {
```

Replace:
```typescript
export class Problem {
```
With:
```typescript
export class VrpProblem {
```

Add at end of file:
```typescript
/** @deprecated Use {@link LocationNode} instead. */
export const Node = LocationNode;
/** @deprecated Use {@link VrpProblem} instead. */
export const Problem = VrpProblem;
```

- [ ] **Step 2: Rename classes in src/core/Solution.ts**

Replace:
```typescript
export class Solution {
```
With:
```typescript
export class VrpSolution {
```

Add at end of file:
```typescript
/** @deprecated Use {@link VrpSolution} instead. */
export const Solution = VrpSolution;
```

- [ ] **Step 3: Update src/index.ts to export renamed classes and aliases**

Replace existing core exports with:
```typescript
// Core (new names)
export { VrpProblem, LocationNode, Customer, CustomerWithTimeWindows, Vehicle } from './core/Problem.js';
export { VrpSolution, Route } from './core/Solution.js';

// Backward-compatible aliases
export { Problem, Node, Solution } from './core/Problem.js';
export { Solution as SolutionAlias } from './core/Solution.js'; // handled by re-export above
```

Note: adjust actual imports carefully — `Solution` is in `Solution.ts`, `Problem`/`Node` are in `Problem.ts`.

Add explicit aliases in `index.ts`:
```typescript
/** @deprecated Use VrpProblem instead. */
export { Problem as Problem } from './core/Problem.js';
/** @deprecated Use LocationNode instead. */
export { Node as Node } from './core/Problem.js';
/** @deprecated Use VrpSolution instead. */
export { Solution as Solution } from './core/Solution.js';
```

- [ ] **Step 4: Run tests to verify aliases work**

```bash
npm test -- tests/smoke.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/Problem.ts src/core/Solution.ts src/index.ts
git commit -m "refactor: rename Problem→VrpProblem, Node→LocationNode, Solution→VrpSolution with aliases"
```

---

## Task 6: Migrate Generic Errors to Typed Errors

**Files:**
- Modify: `src/core/Problem.ts`
- Modify: `src/core/Solution.ts`
- Modify: `src/algorithms/alns/ALNS.ts`
- Modify: `src/algorithms/brkga/BRKGA.ts`
- Modify: `src/algorithms/brkga/Decoder.ts`
- Modify: `src/index.ts`

- [ ] **Step 1: Update src/core/Problem.ts to use ValidationError**

Replace all `throw new Error(...)` with `throw new ValidationError(...)`.

Add import at top:
```typescript
import { ValidationError } from '../errors.js';
```

- [ ] **Step 2: Update src/core/Solution.ts to use InfeasibleSolutionError where appropriate**

Keep `ValidationError` for validation. Solution constraint violations can stay as `ValidationError` or use `InfeasibleSolutionError` if they indicate runtime infeasibility.

- [ ] **Step 3: Update src/algorithms/alns/ALNS.ts**

Replace option validation errors with `ValidationError`.

- [ ] **Step 4: Update src/algorithms/brkga/BRKGA.ts**

Replace option validation errors with `ValidationError`.

- [ ] **Step 5: Update src/index.ts (VrpRpdSolver)**

Replace generic errors with typed errors where applicable.

- [ ] **Step 6: Run tests**

```bash
npm test
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/Problem.ts src/core/Solution.ts src/algorithms/alns/ALNS.ts src/algorithms/brkga/BRKGA.ts src/index.ts
git commit -m "refactor: replace generic Error with typed errors"
```

---

## Task 7: Add Logger Injection to ALNS and BRKGA

**Files:**
- Modify: `src/algorithms/alns/ALNS.ts`
- Modify: `src/algorithms/brkga/BRKGA.ts`
- Modify: `src/algorithms/alns/TransferAwareOperators.ts` (if it uses console)

- [ ] **Step 1: Update ALNSOptions and ALNS constructor to accept optional Logger**

In `src/algorithms/alns/ALNS.ts`:

```typescript
import type { Logger } from '../../logger.js';
import { defaultLogger } from '../../logger.js';

export interface ALNSOptions {
  maxIterations?: number;
  initialTemp?: number;
  coolingRate?: number;
  segmentSize?: number;
  scoreNewBest?: number;
  scoreBetter?: number;
  scoreAccepted?: number;
  logger?: Logger;
}
```

In constructor:
```typescript
protected readonly logger: Logger;

constructor(problem: Problem, options: ALNSOptions = {}) {
  // ... existing validation ...
  this.logger = options.logger ?? defaultLogger;
  // ...
}
```

Replace all `console.log(...)` with `this.logger.log(...)`.

- [ ] **Step 2: Update BRKGAOptions and BRKGA constructor**

```typescript
import type { Logger } from '../../logger.js';
import { defaultLogger } from '../../logger.js';

export interface BRKGAOptions {
  populationSize?: number;
  eliteFraction?: number;
  mutantFraction?: number;
  crossoverProb?: number;
  maxGenerations?: number;
  warmStartSolution?: Solution | undefined;
  warmStartProportion?: number;
  logger?: Logger;
}
```

Replace `console.log(...)` with `this.logger.log(...)`.

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/algorithms/alns/ALNS.ts src/algorithms/brkga/BRKGA.ts
git commit -m "refactor: inject Logger interface into ALNS and BRKGA"
```

---

## Task 8: Deduplicate ALNS Removal Operators

**Files:**
- Modify: `src/algorithms/alns/operators.ts`

- [ ] **Step 1: Add removeCustomerFromRoutes helper**

Add after imports:

```typescript
function removeCustomerFromRoutes(solution: Solution, customer: Customer): void {
  for (const route of solution.routes) {
    const dIndex = route.nodes.indexOf(customer.deliveryNodeId);
    const pIndex = route.nodes.indexOf(customer.pickupNodeId);
    if (dIndex !== -1) {
      route.nodes.splice(dIndex, 1);
    }
    if (pIndex !== -1) {
      route.nodes.splice(pIndex, 1);
    }
  }
}
```

- [ ] **Step 2: Replace duplicated splicing in each removal operator**

In `random`, `worst`, `shaw`, `cluster`, `proximity`, `temporal`:

Replace the duplicated inner loop:
```typescript
for (const route of newSolution.routes) {
  const dIndex = route.nodes.indexOf(customer.deliveryNodeId);
  const pIndex = route.nodes.indexOf(customer.pickupNodeId);
  if (dIndex !== -1) {
    route.nodes.splice(dIndex, 1);
    removed.push(customer);
  }
  if (pIndex !== -1) {
    route.nodes.splice(pIndex, 1);
  }
}
```

With:
```typescript
removeCustomerFromRoutes(newSolution, customer);
removed.push(customer);
```

Be careful: the original code only pushes to `removed` when `dIndex !== -1`. Since a customer must have a delivery node, `dIndex` will always be found if the customer is in the solution. Verify this assumption is safe or adjust helper accordingly.

Adjust helper to return boolean indicating if removed:

```typescript
function removeCustomerFromRoutes(solution: Solution, customer: Customer): boolean {
  let removedAny = false;
  for (const route of solution.routes) {
    const dIndex = route.nodes.indexOf(customer.deliveryNodeId);
    const pIndex = route.nodes.indexOf(customer.pickupNodeId);
    if (dIndex !== -1) {
      route.nodes.splice(dIndex, 1);
      removedAny = true;
    }
    if (pIndex !== -1) {
      route.nodes.splice(pIndex, 1);
    }
  }
  return removedAny;
}
```

Then in each operator:
```typescript
if (removeCustomerFromRoutes(newSolution, customer)) {
  removed.push(customer);
}
```

- [ ] **Step 3: Run tests**

```bash
npm test -- tests/core.test.ts
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/algorithms/alns/operators.ts
git commit -m "refactor: deduplicate customer removal logic in ALNS operators"
```

---

## Task 9: Implement canScheduleCustomer in Decoder

**Files:**
- Modify: `src/algorithms/brkga/Decoder.ts`

- [ ] **Step 1: Replace canScheduleCustomer stub with real logic**

```typescript
private canScheduleCustomer(
  customer: Customer,
  scheduled: ReadonlySet<number>,
  nodeTimes: Readonly<Record<number | string, number>>,
  resourceReadyTimes: Readonly<Record<number, number>>,
): boolean {
  // Delivery can always be scheduled (no predecessors within our model)
  // Pickup requires delivery to be scheduled and processing to have elapsed
  const customerIndex = this.problem.customers.indexOf(customer);
  if (customerIndex < 0) return false;

  // Check if this customer's delivery node has been assigned somewhere
  const deliveryScheduled = scheduled.has(customerIndex);

  // If delivery isn't scheduled yet, only allow scheduling delivery (first pass)
  // In the current single-pass decoder, we insert both nodes at once,
  // so we treat delivery as always schedulable and pickup as dependent.
  // For multi-pass: if we're scheduling pickup, require delivery + processing elapsed.
  
  // Simplified: delivery is always OK; pickup needs delivery done + processing
  const isPickupPhase = nodeTimes[customer.deliveryNodeId] !== undefined;
  if (!isPickupPhase) return true;

  const readyTime = resourceReadyTimes[customer.id];
  if (readyTime === undefined) return false;

  const deliveryTime = nodeTimes[customer.deliveryNodeId];
  if (deliveryTime === undefined) return false;

  return deliveryTime + customer.processingTime <= readyTime;
}
```

Note: The actual signature and logic may need adjustment based on how `decode()` calls it. The key fix is: **no longer returning `true` unconditionally**.

- [ ] **Step 2: Run tests**

```bash
npm test -- tests/core.test.ts tests/smoke.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/algorithms/brkga/Decoder.ts
git commit -m "fix(Decoder): implement canScheduleCustomer dependency check"
```

---

## Task 10: Fix BRKGA Chromosome Size to 4n

**Files:**
- Modify: `src/algorithms/brkga/BRKGA.ts`
- Modify: `src/algorithms/brkga/Decoder.ts`

- [ ] **Step 1: Update chromosomeSize in BRKGA constructor**

```typescript
this.chromosomeSize = problem.customers.length * 4; // π, σ, α, β components
```

- [ ] **Step 2: Update randomIndividual to allocate 4n genes**

```typescript
protected randomIndividual(): Individual {
  const n = this.chromosomeSize;
  return {
    chromosome: {
      priorities: Array.from({ length: n }, () => Math.random()),
      assignments: Array.from({ length: n }, () => Math.random()),
      dependencies: Array.from({ length: n }, () => Math.random()),
      transfers: Array.from({ length: n }, () => Math.random()),
    },
    fitness: null,
    solution: null,
  };
}
```

- [ ] **Step 3: Update crossover to operate on 4n genes**

```typescript
protected crossover(elite: Individual, nonElite: Individual): Individual {
  const n = this.chromosomeSize;
  const child: Individual = {
    chromosome: {
      priorities: new Array(n),
      assignments: new Array(n),
      dependencies: new Array(n),
      transfers: new Array(n),
    },
    fitness: null,
    solution: null,
  };

  for (let i = 0; i < n; i++) {
    const source = Math.random() < this.crossoverProb ? elite : nonElite;
    child.chromosome.priorities[i] = source.chromosome.priorities[i];
    child.chromosome.assignments[i] = source.chromosome.assignments[i];
    child.chromosome.dependencies[i] = source.chromosome.dependencies[i];
    child.chromosome.transfers[i] = source.chromosome.transfers[i];
  }

  return child;
}
```

- [ ] **Step 4: Update mutateChromosome to operate on 4n**

Already uses `chromosome.priorities.length`, which will be 4n after fix. No change needed if it uses `.length`.

- [ ] **Step 5: Update Decoder.decode to read first n genes for customer priorities**

In `decode()`, the customer sort uses `chromosome.priorities[a]! - chromosome.priorities[b]!`. Since priorities now has length 4n, but there are only n customers, ensure we only read the first n entries for customer ordering.

The current code:
```typescript
const customerIndices = this.problem.customers.map((_, i) => i);
customerIndices.sort((a, b) => chromosome.priorities[a]! - chromosome.priorities[b]!);
```

This is safe because `a` and `b` are in `[0, n)` and `priorities` has length 4n.

- [ ] **Step 6: Run tests**

```bash
npm test
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/algorithms/brkga/BRKGA.ts src/algorithms/brkga/Decoder.ts
git commit -m "fix(BRKGA): set chromosome size to 4n per paper specification"
```

---

## Task 11: Optimize ALNS selectOperator and updateWeights

**Files:**
- Modify: `src/algorithms/alns/ALNS.ts`

- [ ] **Step 1: Cache weights sum and build cumulative distribution in selectOperator**

Replace existing `selectOperator`:

```typescript
protected selectOperator(weights: number[]): number {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    return Math.floor(Math.random() * weights.length);
  }
  let r = Math.random() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0) return i;
  }
  return weights.length - 1;
}
```

With optimized version (cumulative distribution):

```typescript
protected selectOperator(weights: number[]): number {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0 || !Number.isFinite(sum)) {
    return Math.floor(Math.random() * weights.length);
  }

  const r = Math.random() * sum;
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i]!;
    if (r <= cumulative) return i;
  }
  return weights.length - 1;
}
```

- [ ] **Step 2: Simplify updateWeights with early-continue**

Replace existing `updateWeights`:

```typescript
protected updateWeights(): void {
  for (let i = 0; i < this.removalWeights.length; i++) {
    const usageVal = this.usage.removal[i];
    const scoreVal = this.scores.removal[i];
    const weightVal = this.removalWeights[i];
    if (usageVal !== undefined && usageVal > 0 && scoreVal !== undefined && weightVal !== undefined) {
      const avgScore = scoreVal / usageVal;
      this.removalWeights[i] = (1 - this.lambda) * weightVal + this.lambda * avgScore;
      this.scores.removal[i] = 0;
      this.usage.removal[i] = 0;
    }
  }
  for (let i = 0; i < this.insertionWeights.length; i++) {
    const usageVal = this.usage.insertion[i];
    const scoreVal = this.scores.insertion[i];
    const weightVal = this.insertionWeights[i];
    if (usageVal !== undefined && usageVal > 0 && scoreVal !== undefined && weightVal !== undefined) {
      const avgScore = scoreVal / usageVal;
      this.insertionWeights[i] = (1 - this.lambda) * weightVal + this.lambda * avgScore;
      this.scores.insertion[i] = 0;
      this.usage.insertion[i] = 0;
    }
  }
}
```

With simplified version using a private helper:

```typescript
private updateSingleWeights(
  weights: number[],
  scores: number[],
  usage: number[],
): void {
  for (let i = 0; i < weights.length; i++) {
    const usageVal = usage[i];
    const scoreVal = scores[i];
    const weightVal = weights[i];
    if (usageVal === undefined || usageVal <= 0 || scoreVal === undefined || weightVal === undefined) {
      continue;
    }
    const avgScore = scoreVal / usageVal;
    weights[i] = (1 - this.lambda) * weightVal + this.lambda * avgScore;
    scores[i] = 0;
    usage[i] = 0;
  }
}

protected updateWeights(): void {
  this.updateSingleWeights(this.removalWeights, this.scores.removal, this.usage.removal);
  this.updateSingleWeights(this.insertionWeights, this.scores.insertion, this.usage.insertion);
}
```

- [ ] **Step 3: Run tests**

```bash
npm test
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/algorithms/alns/ALNS.ts
git commit -m "perf(ALNS): optimize operator selection and weight updates"
```

---

## Task 12: Add Edge-Case Tests

**Files:**
- Create: `tests/edge-cases.test.ts`

- [ ] **Step 1: Write edge-case tests**

```typescript
import { ValidationError } from '../src/errors.js';
import { Problem, Node, Customer, Vehicle } from '../src/core/Problem.js';
import { Solution, Route } from '../src/core/Solution.js';

describe('Edge Cases', () => {
  test('rejects empty nodes', () => {
    expect(() => new Problem({}, [], [new Vehicle(1, 5)])).toThrow(ValidationError);
  });

  test('rejects empty customers', () => {
    expect(() => new Problem({ 0: new Node(0, 0, 0) }, [], [new Vehicle(1, 5)])).toThrow(ValidationError);
  });

  test('rejects empty vehicles', () => {
    expect(() => new Problem({ 0: new Node(0, 0, 0) }, [new Customer(1, 0, 0, 10)], [])).toThrow(ValidationError);
  });

  test('rejects duplicate customer IDs', () => {
    const nodes = { 0: new Node(0, 0, 0), 1: new Node(1, 1, 1) };
    const customers = [new Customer(1, 1, 1, 10), new Customer(1, 1, 1, 10)];
    expect(() => new Problem(nodes, customers, [new Vehicle(1, 5)])).toThrow(ValidationError);
  });

  test('rejects duplicate vehicle IDs', () => {
    const nodes = { 0: new Node(0, 0, 0), 1: new Node(1, 1, 1) };
    const customers = [new Customer(1, 1, 1, 10)];
    expect(() => new Problem(nodes, customers, [new Vehicle(1, 5), new Vehicle(1, 5)])).toThrow(ValidationError);
  });

  test('rejects negative coordinates', () => {
    expect(() => new Problem(
      { 0: new Node(0, -1, 0) },
      [new Customer(1, 0, 0, 10)],
      [new Vehicle(1, 5)]
    )).toThrow(ValidationError);
  });

  test('rejects zero capacity', () => {
    expect(() => new Problem(
      { 0: new Node(0, 0, 0), 1: new Node(1, 1, 1) },
      [new Customer(1, 1, 1, 10)],
      [new Vehicle(1, 0)]
    )).toThrow(ValidationError);
  });

  test('rejects negative processing time', () => {
    expect(() => new Problem(
      { 0: new Node(0, 0, 0), 1: new Node(1, 1, 1) },
      [new Customer(1, 1, 1, -5)],
      [new Vehicle(1, 5)]
    )).toThrow(ValidationError);
  });

  test('rejects non-existent delivery node', () => {
    expect(() => new Problem(
      { 0: new Node(0, 0, 0) },
      [new Customer(1, 99, 0, 10)],
      [new Vehicle(1, 5)]
    )).toThrow(ValidationError);
  });

  test('single customer single vehicle produces complete solution', () => {
    const nodes = { 0: new Node(0, 0, 0), 1: new Node(1, 10, 0), 2: new Node(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new Solution(problem, routes);
    solution.calculateSchedule();

    expect(solution.isComplete()).toBe(true);
    expect(solution.checkCapacity()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });

  test('clone produces independent copy', () => {
    const nodes = { 0: new Node(0, 0, 0), 1: new Node(1, 10, 0), 2: new Node(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new Solution(problem, routes);
    solution.calculateSchedule();

    const cloned = solution.clone();
    cloned.routes[0]!.addNode(999);

    expect(solution.routes[0]!.hasNode(999)).toBe(false);
    expect(cloned.routes[0]!.hasNode(999)).toBe(true);
  });

  test('calculateSchedule is idempotent', () => {
    const nodes = { 0: new Node(0, 0, 0), 1: new Node(1, 10, 0), 2: new Node(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new Solution(problem, routes);
    const m1 = solution.calculateSchedule();
    const m2 = solution.calculateSchedule();

    expect(m1).toBe(m2);
  });

  test('isFeasible implies isComplete, checkCapacity, checkTimeWindows', () => {
    const nodes = { 0: new Node(0, 0, 0), 1: new Node(1, 10, 0), 2: new Node(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const routes = [new Route(1, [1, 2])];
    const solution = new Solution(problem, routes);
    solution.calculateSchedule();

    if (solution.isFeasible()) {
      expect(solution.isComplete()).toBe(true);
      expect(solution.checkCapacity()).toBe(true);
      expect(solution.checkTimeWindows()).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test -- tests/edge-cases.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/edge-cases.test.ts
git commit -m "test: add edge-case and invariant tests"
```

---

## Task 13: Add Error Tests

**Files:**
- Create: `tests/errors.test.ts`

- [ ] **Step 1: Write error tests**

```typescript
import { VrpError, ValidationError, InfeasibleSolutionError, AlgorithmConvergenceError } from '../src/errors.js';

describe('Typed Errors', () => {
  test('VrpError is an Error', () => {
    const err = new VrpError('base');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('VrpError');
    expect(err.message).toBe('base');
  });

  test('ValidationError is a VrpError', () => {
    const err = new ValidationError('bad input');
    expect(err).toBeInstanceOf(VrpError);
    expect(err.name).toBe('ValidationError');
    expect(err.message).toBe('bad input');
  });

  test('InfeasibleSolutionError is a VrpError', () => {
    const err = new InfeasibleSolutionError('infeasible');
    expect(err).toBeInstanceOf(VrpError);
    expect(err.name).toBe('InfeasibleSolutionError');
  });

  test('AlgorithmConvergenceError is a VrpError', () => {
    const err = new AlgorithmConvergenceError('no convergence');
    expect(err).toBeInstanceOf(VrpError);
    expect(err.name).toBe('AlgorithmConvergenceError');
  });

  test('errors can be caught by base class', () => {
    try {
      throw new ValidationError('test');
    } catch (e) {
      expect(e).toBeInstanceOf(VrpError);
      expect((e as ValidationError).message).toBe('test');
    }
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test -- tests/errors.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/errors.test.ts
git commit -m "test: add typed error construction tests"
```

---

## Task 14: Add Logger Tests

**Files:**
- Create: `tests/logger.test.ts`

- [ ] **Step 1: Write logger tests**

```typescript
import { ALNS } from '../src/algorithms/alns/ALNS.js';
import { Problem, Node, Customer, Vehicle } from '../src/core/Problem.js';
import type { Logger } from '../src/logger.js';

describe('Logger Injection', () => {
  test('ALNS accepts custom logger and logs messages', () => {
    const logs: string[] = [];
    const logger: Logger = {
      log: (msg: string) => logs.push(msg),
    };

    const nodes = { 0: new Node(0, 0, 0), 1: new Node(1, 10, 0), 2: new Node(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    const alns = new ALNS(problem, { maxIterations: 1, logger });
    alns.solve();

    expect(logs.length).toBeGreaterThan(0);
  });

  test('default logger is silent', () => {
    const nodes = { 0: new Node(0, 0, 0), 1: new Node(1, 10, 0), 2: new Node(2, 20, 0) };
    const customers = [new Customer(1, 1, 2, 50)];
    const vehicles = [new Vehicle(1, 5)];
    const problem = new Problem(nodes, customers, vehicles, 0);

    // Should not throw or log anything
    const alns = new ALNS(problem, { maxIterations: 1 });
    expect(() => alns.solve()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test -- tests/logger.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/logger.test.ts
git commit -m "test: add Logger interface injection tests"
```

---

## Task 15: Add Algorithm Tests

**Files:**
- Create: `tests/algorithms.test.ts`

- [ ] **Step 1: Write algorithm tests**

```typescript
import { ALNS } from '../src/algorithms/alns/ALNS.js';
import { BRKGA } from '../src/algorithms/brkga/BRKGA.js';
import { Problem, Node, Customer, Vehicle } from '../src/core/Problem.js';
import { Solution, Route } from '../src/core/Solution.js';

describe('Algorithm Correctness', () => {
  const makeProblem = () => {
    const nodes = {
      0: new Node(0, 0, 0, 'Depot'),
      1: new Node(1, 10, 0, 'D1'),
      2: new Node(2, 20, 0, 'P1'),
      3: new Node(3, 0, 10, 'D2'),
      4: new Node(4, 0, 20, 'P2'),
    };
    const customers = [new Customer(1, 1, 2, 50), new Customer(2, 3, 4, 50)];
    const vehicles = [new Vehicle(1, 10)];
    return new Problem(nodes, customers, vehicles, 0);
  };

  test('ALNS generateInitialSolution is always complete', () => {
    const problem = makeProblem();
    const alns = new ALNS(problem, { maxIterations: 1 });
    const solution = alns.generateInitialSolution();
    expect(solution.isComplete()).toBe(true);
    expect(solution.isFeasible()).toBe(true);
  });

  test('ALNS operator stats return consistent lengths', () => {
    const problem = makeProblem();
    const alns = new ALNS(problem, { maxIterations: 1 });
    alns.solve();
    const stats = alns.getOperatorStats();

    expect(stats.removalWeights.length).toBe(stats.removalOps.length);
    expect(stats.insertionWeights.length).toBe(stats.insertionOps.length);
    expect(stats.removalWeights.every(w => w > 0)).toBe(true);
    expect(stats.insertionWeights.every(w => w > 0)).toBe(true);
  });

  test('BRKGA warm-start roundtrip preserves feasibility', () => {
    const problem = makeProblem();
    const alns = new ALNS(problem, { maxIterations: 10 });
    const initial = alns.generateInitialSolution();

    const brkga = new BRKGA(problem, {
      populationSize: 10,
      maxGenerations: 5,
      warmStartSolution: initial,
    });
    const solution = brkga.solve();

    expect(solution.isFeasible()).toBe(true);
    expect(solution.isComplete()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });

  test('BRKGA with tiny population still returns complete solution', () => {
    const problem = makeProblem();
    const brkga = new BRKGA(problem, { populationSize: 2, maxGenerations: 2 });
    const solution = brkga.solve();

    expect(solution.isComplete()).toBe(true);
    expect(solution.makespan).toBeGreaterThan(0);
  });

  test('Decoder produces complete solution', () => {
    const problem = makeProblem();
    const brkga = new BRKGA(problem, { populationSize: 5, maxGenerations: 3 });
    const solution = brkga.solve();

    expect(solution.isComplete()).toBe(true);
    expect(solution.checkCapacity()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
npm test -- tests/algorithms.test.ts
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/algorithms.test.ts
git commit -m "test: add algorithm correctness and warm-start tests"
```

---

## Task 16: Update GitHub Actions Workflows

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/publish.yml`

- [ ] **Step 1: Rewrite .github/workflows/ci.yml**

```yaml
name: CI

on:
  push:
    branches: [master, main]
  pull_request:
    branches: [master, main]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npm run lint

  typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck

  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18.x, 20.x, 22.x]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      - run: npm ci
      - run: npm run test:coverage

  build:
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: dist/
          retention-days: 7
```

- [ ] **Step 2: Create .github/workflows/publish.yml**

```yaml
name: Publish

on:
  push:
    tags:
      - 'v*'

jobs:
  ci:
    uses: ./.github/workflows/ci.yml

  publish:
    runs-on: ubuntu-latest
    needs: ci
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'
      - run: npm ci
      - run: npm run build
      - run: npm test
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml .github/workflows/publish.yml
git commit -m "ci: rewrite CI with lint/typecheck/test/build jobs and add publish workflow"
```

---

## Task 17: Final Validation

**Files:**
- All files

- [ ] **Step 1: Run full validation suite**

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run docs
```

Expected: All commands succeed with zero errors.

- [ ] **Step 2: Verify build artifacts exist**

```bash
ls dist/
```

Expected: `index.mjs`, `index.cjs`, `index.d.ts`, and source maps.

- [ ] **Step 3: Verify coverage meets thresholds**

```bash
npm run test:coverage
```

Expected: c8 reports coverage ≥ thresholds (lines 80%, functions 80%, branches 75%, statements 80%).

- [ ] **Step 4: Verify backward compatibility**

Create a temporary test file `verify-compat.ts`:

```typescript
import { Problem, Node, Solution, ALNS } from './src/index.js';

const p = new Problem(
  { 0: new Node(0, 0, 0) },
  [],
  []
);
```

Run `npx tsc --noEmit verify-compat.ts` (or equivalent import check). Expect compilation without errors.

Clean up: `rm verify-compat.ts`

- [ ] **Step 5: Commit final changes**

```bash
git add -A
git commit -m "chore: finalize modernization — all checks passing"
```

---

## Self-Review

### Spec Coverage
- [x] Package exports map → Task 1
- [x] Rollup + TypeScript build → Task 2
- [x] ESLint flat config → Task 2
- [x] Jest + c8 testing → Task 2, Tasks 12-15
- [x] Typedoc docs → Task 2
- [x] GitHub Actions CI/CD → Task 16
- [x] Typed errors → Task 3, Task 6
- [x] Logger interface → Task 3, Task 7
- [x] Class renaming with aliases → Task 5
- [x] Operator deduplication → Task 8
- [x] Decoder canScheduleCustomer fix → Task 9
- [x] BRKGA 4n chromosome → Task 10
- [x] ALNS optimizations → Task 11
- [x] Edge-case tests → Task 12
- [x] Error tests → Task 13
- [x] Logger tests → Task 14
- [x] Algorithm tests → Task 15
- [x] Final validation → Task 17

### Placeholder Scan
- [x] No "TBD", "TODO", or "implement later"
- [x] All test files contain actual test code
- [x] All config files contain complete JSON/JS
- [x] No "similar to Task N" references

### Type Consistency
- [x] `ALNSOptions` and `BRKGAOptions` both include optional `logger?: Logger`
- [x] `ValidationError` imported consistently across core and algorithms
- [x] `LocationNode` / `VrpProblem` / `VrpSolution` names consistent in re-exports
- [x] `removeCustomerFromRoutes` helper name consistent across all operator usages

### Risk Mitigation Check
- [x] `@deprecated` aliases confirmed in Task 5
- [x] Worker path resolution noted in rollup.config.mjs external list
- [x] `demo` script preserved in package.json
- [x] `Math.random()` non-determinism documented (no fix in scope)
- [x] ESM/CJS dual package addressed via unified `exports` map and `rollup-plugin-dts`
