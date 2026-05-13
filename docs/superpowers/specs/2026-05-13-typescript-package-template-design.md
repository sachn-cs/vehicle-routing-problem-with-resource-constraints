# TypeScript-First Package Template Migration Design

**Date:** 2026-05-13
**Topic:** Transform repository to zero-config TypeScript-first package template
**Approach:** Config Consolidation + Test Migration (Approach A)

## Goals

- Zero-config onboarding: clone → `npm install` → start coding
- Preserve all existing business logic and source files
- Replace Jest with Mocha + Chai + tsx for a lighter, zero-config test experience
- Consolidate configuration files to reduce root directory clutter
- Maintain ESM-first architecture with dual CJS/ESM output
- Keep strict TypeScript, ESLint, c8 coverage, Typedoc docs, and GitHub Actions CI/CD

## Non-Goals

- No source file renames (e.g., `src/` stays `src/`)
- No changes to algorithm implementations or core logic
- No switching from Typedoc to JSDoc
- No switching from ESLint to StandardJS
- No adding Babel (not needed with TypeScript + Rollup)

## Test Framework Migration

### Remove
- `jest`
- `ts-jest`
- `@types/jest`
- `jest.config.json`

### Add
- `mocha`
- `chai`
- `@types/mocha`
- `@types/chai`
- `tsx`

### Strategy
- Use `tsx` to run TypeScript tests directly without pre-compilation.
- Mocha's `describe` / `test` / `it` syntax is identical to Jest's, so test structure is preserved.
- Rewrite assertions from Jest matchers to Chai assertions:
  - `expect(x).toBe(y)` → `expect(x).to.equal(y)`
  - `expect(x).toBeCloseTo(y, n)` → `expect(x).to.be.closeTo(y, 1e-n)`
  - `expect(x).toBeGreaterThan(y)` → `expect(x).to.be.greaterThan(y)`
  - `expect(fn).toThrow(msg)` → `expect(fn).to.throw(msg)`
  - `expect(x).toBe(true)` → `expect(x).to.be.true`
  - `expect(x).toBe(false)` → `expect(x).to.be.false`
- Test files: ~10 files under `tests/`.

### Mocha Configuration
- Add a minimal `.mocharc.json`:
  ```json
  {
    "extension": ["ts"],
    "spec": "tests/**/*.test.ts",
    "require": "tsx",
    "watch-files": ["src/**/*.ts", "tests/**/*.ts"]
  }
  ```

## Configuration Consolidation

### tsconfig.json
- Remove `tsconfig.test.json`.
- Update `tsconfig.json` to include both `src/` and `tests/`.
- Keep `strict: true` and all strict flags.
- Relax `noUnusedLocals` and `noUnusedParameters` for tests via comment or keep them on (tests should be clean too).
- Set `rootDir: "."` and `outDir: "./dist"`.

### c8
- Remove `c8.config.json`.
- Move all c8 settings into `package.json` under `"c8"` key (already partially there).

### ESLint
- Keep `eslint.config.mjs` (flat config is modern and minimal).
- Remove any Jest-specific ESLint plugins or envs if present.
- Simplify rules slightly if any are redundant with `typescript-eslint` strict presets.

### Rollup
- Keep `rollup.config.mjs` as-is. It already produces ESM + CJS + d.ts bundles with source maps.
- No Babel needed.

## Package Scripts

All required scripts exist; only `test` scripts change:

```json
{
  "build": "rollup -c",
  "dev": "rollup -c -w",
  "clean": "rm -rf dist docs/api",
  "lint": "eslint src tests",
  "lint:fix": "eslint src tests --fix",
  "test": "mocha",
  "test:watch": "mocha --watch",
  "test:coverage": "c8 mocha",
  "docs": "typedoc",
  "docs:md": "typedoc --plugin typedoc-plugin-markdown --out docs/md",
  "typecheck": "tsc --noEmit"
}
```

## Documentation

- Keep `typedoc.json` for HTML API docs.
- Add `typedoc-plugin-markdown` for markdown output.
- Add `docs:md` script.

## CI/CD

### `.github/workflows/ci.yml`
- Update test step to run `npm run test:coverage` (which now runs `c8 mocha`).
- Remove any Jest-specific env vars (e.g., `NODE_OPTIONS=--experimental-vm-modules`).
- Keep matrix testing on Node 18.x, 20.x, 22.x.
- Keep lint, typecheck, build jobs as-is.

### `.github/workflows/publish.yml`
- No changes needed.

## Migration Order

1. **Dependencies**
   - `npm uninstall jest ts-jest @types/jest`
   - `npm install -D mocha chai @types/mocha @types/chai tsx`
   - `npm install -D typedoc-plugin-markdown`

2. **Configuration**
   - Remove `jest.config.json`, `c8.config.json`, `tsconfig.test.json`.
   - Update `tsconfig.json` to include `tests/`.
   - Move c8 config into `package.json`.
   - Add `.mocharc.json`.
   - Update `package.json` scripts.

3. **Tests**
   - Rewrite all `tests/*.test.ts` files from Jest assertions to Chai assertions.

4. **CI**
   - Update `.github/workflows/ci.yml`.

5. **Validation**
   - `npm run typecheck`
   - `npm run lint`
   - `npm test`
   - `npm run test:coverage`
   - `npm run build`
   - `npm run docs`

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| tsx compatibility with Node worker threads | Test `worker.ts` and parallel solving after migration |
| Chai assertion syntax differences | Mechanical search/replace with careful review |
| Coverage thresholds not met | c8 config stays identical; thresholds unchanged |
| tsconfig include changes break build | Keep `include` scoped to src for build; tests only for typecheck/test |

## Validation Checklist

- [ ] All tests pass with Mocha
- [ ] Coverage report generates with c8
- [ ] TypeScript compiles with zero errors
- [ ] ESLint passes with zero errors
- [ ] Rollup builds ESM + CJS + d.ts bundles
- [ ] CLI works (`npm run build && node dist/cli.mjs --help`)
- [ ] Docs generate (HTML + markdown)
- [ ] CI workflow passes on all Node versions
