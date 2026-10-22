# OpsReport Studio — Build & Test Command Reference

**Document Identifier:** CMD-REF-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 9 of 45 (Repository Initialization, Development Environment & Build Configuration)  
**Status:** Authoritative Build & Test Command Guide  
**Last Updated:** 2026-10-19

---

## 1. Quick Command Summary

| Command                | Lifecycle Phase    | Action Performed                                                                    | Expected Exit Code       |
| :--------------------- | :----------------- | :---------------------------------------------------------------------------------- | :----------------------- |
| `npm run dev`          | Development        | Boots Vite dev server & launches Electron desktop shell with HMR.                   | 0 (Active process)       |
| `npm run typecheck`    | Quality Gate       | Runs `tsc --noEmit` across `tsconfig.node.json` and `tsconfig.web.json`.            | 0                        |
| `npm run build`        | Build              | Compiles TypeScript and bundles React + Electron into `dist/` and `dist-electron/`. | 0                        |
| `npm test`             | Testing            | Runs Vitest automated test suites in terminal.                                      | 0 (All tests pass)       |
| `npm run test:smoke`   | Smoke Verification | Executes `tests/smoke/foundation.test.ts` for foundation readiness.                 | 0 (All smoke tests pass) |
| `npm run format:check` | Code Style         | Validates file formatting compliance with Prettier.                                 | 0                        |
| `npm run format:write` | Code Style         | Auto-formats source code in `src/` and `tests/`.                                    | 0                        |

---

## 2. Command Details & Operational Execution

### 2.1 `npm run dev` (Interactive Desktop Launch)

- **What it does:**
  1. Starts Vite on local port `5173`.
  2. Compiles `src/main/index.ts` and `src/preload/index.ts` in watch mode via `vite-plugin-electron`.
  3. Spawns the Electron desktop application window pointing to `http://localhost:5173`.
- **When to use:** During active development of UI views, form components, or main process IPC handlers.
- **Exit behavior:** Terminate with `Ctrl+C` in the shell or close the Electron desktop window.

### 2.2 `npm run typecheck` (Static Type Verification)

- **What it does:**
  - Invokes the TypeScript compiler in no-emit mode (`tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json`).
  - Concurrently validates `tsconfig.node.json` (Main, Preload, Config) and `tsconfig.web.json` (React Renderer).
- **When to use:** Mandatory pre-commit gate to guarantee zero `any` leaks, zero broken imports, and strict type safety.

### 2.3 `npm run build` (Production Compilation)

- **What it does:**
  1. Executes `npm run typecheck` to assert zero type errors.
  2. Runs `vite build` to bundle React frontend assets into `dist/`.
  3. Bundles Electron main process into `dist-electron/main/index.js` and preload into `dist-electron/preload/index.mjs`.
- **Output Artifacts:**
  - `dist/index.html` + `dist/assets/*.js` (Minified client bundles).
  - `dist-electron/main/index.js` (Compiled main process).
  - `dist-electron/preload/index.mjs` (Compiled preload bridge).

### 2.4 `npm run test:smoke` (Foundation Verification)

- **What it does:** Executes the automated foundation test suite (`tests/smoke/foundation.test.ts`) using Vitest.
- **Verified Conditions:**
  - Package manifest properties and required npm scripts.
  - Entry points exist (`index.html`, `main.tsx`, `main/index.ts`, `preload/index.ts`).
  - Strict Content Security Policy without `'unsafe-eval'`.
  - Electron sandboxing and context isolation enabled.
  - Solution-style TypeScript references configured.
  - Git ignore rules protecting operational reports and databases.

---

## 3. Failure Troubleshooting

### TypeScript Build Errors

```
Error: TS2307: Cannot find module '../shared/types.ts'
```

- **Remedy:** Ensure `tsconfig.node.json` and `tsconfig.web.json` have `"allowImportingTsExtensions": true` or omit extensions if compiling with bundler resolution.

### Electron Launch Failures

```
Error: Cannot find module 'dist-electron/preload/index.mjs'
```

- **Remedy:** Run `npm run build` first to ensure the preload script has been compiled into `dist-electron/preload/`.
