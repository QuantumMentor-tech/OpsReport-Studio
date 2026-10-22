# OpsReport Studio — TypeScript Standards & Coding Conventions

**Document Identifier:** STD-TS-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 10 of 45 (TypeScript Standards, Shared Types & Error-Handling Foundation)  
**Lifecycle Phase:** Phase 3 — Project Foundation & Application Shell  
**Date:** 2026-10-19  
**Status:** Authoritative Engineering Standard  
**Target Audience:** Engineering Team & AI Coding Agents

---

## 1. Core Principles & Strictness Baseline

All source code in OpsReport Studio must adhere to strict type-safety invariants to prevent runtime exceptions, undefined value propagation, and memory leaks.

### 1.1 Compiler Configuration Baseline

TypeScript compiler configuration is partitioned into two specialized project configurations governed by `tsconfig.json`:

1. `tsconfig.node.json`: Configured for Node.js ES2022 runtimes (Electron Main Process, Preload, Background Worker, and Test Harnesses).
2. `tsconfig.web.json`: Configured for browser DOM ES2022 runtimes (React Renderer).

Both configurations enforce:

- `"strict": true` (includes `noImplicitAny`, `strictNullChecks`, `strictFunctionTypes`, `strictBindCallApply`, `strictPropertyInitialization`, `noImplicitThis`, and `useUnknownInCatchVariables`).
- `"noImplicitOverride": true` (enforces explicit `override` keyword when subclassing).
- `"noUnusedLocals": true` and `"noUnusedParameters": true` (prohibits unreferenced variables and parameters).
- `"noFallthroughCasesInSwitch": true` (prevents accidental fallthrough bugs in state machine switch statements).
- `"noEmit": true` (type checking only; Vite handles optimized asset emission).

---

## 2. Identifier & Naming Conventions

| Entity                     | Convention          | Examples                                            | Rationale                                                                                   |
| :------------------------- | :------------------ | :-------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **Interfaces / Types**     | `PascalCase`        | `AppMetadata`, `ReportSession`, `SerializableError` | Clear visual distinction from runtime values.                                               |
| **Branded Types**          | `PascalCase` (Noun) | `StationId`, `TemplateId`, `ReportSessionId`        | Eliminates primitive obsession.                                                             |
| **Classes**                | `PascalCase`        | `AppError`, `TemplateManager`                       | Standard OOP convention.                                                                    |
| **Functions / Methods**    | `camelCase`         | `normalizeError()`, `toStationId()`, `unwrapOr()`   | Standard JavaScript verb/predicate convention.                                              |
| **Variables / Properties** | `camelCase`         | `userMessage`, `isOperational`, `operationId`       | Readability and camelCase JSON serialization.                                               |
| **Constants (Module)**     | `UPPER_SNAKE_CASE`  | `DEFAULT_USER_MESSAGES`, `SENSITIVE_KEY_PATTERN`    | Reserved exclusively for fixed immutable module-level constants.                            |
| **Files (Modules)**        | `kebab-case.ts`     | `error-codes.ts`, `normalize-error.ts`, `result.ts` | Cross-platform filesystem compatibility (case-insensitive Windows vs case-sensitive Linux). |
| **React Components**       | `PascalCase.tsx`    | `App.tsx`, `ReportCard.tsx`                         | Standard React JSX file convention.                                                         |

---

## 3. Semantic Branded Identifiers

OpsReport Studio avoids plain `string` identifiers for domain entities. Domain IDs must use the `Brand<T, B>` nominal type pattern declared in `src/shared/types/identifiers.ts`:

```typescript
// Declaration in src/shared/types/identifiers.ts
export type StationId = Brand<string, 'StationId'>;
export type TemplateId = Brand<string, 'TemplateId'>;

// Usage in Service Signatures:
function lookupStation(id: StationId): StationRecord;
```

### Compiler Invariant

Passing a `TemplateId` to a function expecting a `StationId` causes a compile-time type error:

```typescript
const templateId = toTemplateId('TMPL-01');
lookupStation(templateId);
// ❌ Error TS2345: Argument of type 'TemplateId' is not assignable to parameter of type 'StationId'.
```

Use the explicit constructor helpers (`toStationId(str)`, `toTemplateId(str)`) to safely validate and cast primitive strings at system boundaries.

---

## 4. Null, Undefined & The `any` Policy

### 4.1 Strict `any` Prohibition

- The `any` type is **strictly prohibited** in all domain, shared, service, and UI code.
- Use `unknown` for values from untrusted boundaries (IPC inputs, file reads, caught exceptions, external libraries).
- Narrow `unknown` using explicit type guards (`typeof`, `instanceof`, or custom type predicates) before consuming properties.

### 4.2 Explicit Nullability

- Do **not** use the non-null assertion operator (`!`) to silence compiler warnings.
- If a value can be absent, type it explicitly as `T | null` or `T | undefined`.
- Handle absent states using optional chaining (`?.`), nullish coalescing (`??`), or early return guards.

```typescript
// ❌ FORBIDDEN: Unsafe non-null assertion
const stationName = stations.find(s => s.id === id)!.name;

// ✅ APPROVED: Explicit handling
const station = stations.find(s => s.id === id);
if (!station) {
  throw new AppError({ code: ErrorCode.INVALID_STATION_REFERENCE });
}
const stationName = station.name;
```

---

## 5. Result Pattern for Asynchronous & Domain Operations

For operations with expected business or environmental failure modes (file parsing, validation, database reads), prefer the discriminated `Result<T, E>` pattern (`src/shared/types/result.ts`) over uncaught throwing:

```typescript
import { Ok, Err, type Result } from '@shared';

function parseTemplateHeader(buffer: Buffer): Result<TemplateHeader, AppError> {
  if (buffer.length < 16) {
    return Err(new AppError({ code: ErrorCode.TEMPLATE_MALFORMED }));
  }
  return Ok(extractedHeader);
}
```

Caller functions handle both branches cleanly without `try / catch`:

```typescript
const result = parseTemplateHeader(data);
if (result.ok) {
  processHeader(result.value);
} else {
  displayAlert(result.error.userMessage);
}
```

---

## 6. Import & Export Hygiene

1. **Explicit Exports:** Avoid `export default` for utilities, types, and services. Prefer named exports to ensure refactoring safety and IDE auto-import accuracy. (Default export is permitted only for React lazy components and configuration files).
2. **Type-Only Imports:** Use `import type { ... }` when importing types and interfaces to enable bundler tree-shaking and eliminate circular dependency runtime overhead.
3. **Module Aliases:**
   - `@shared` → Maps to `src/shared/`
   - `@renderer` → Maps to `src/renderer/`
   - `@/` → Maps to `src/`

---

## 7. Mandatory Rules for AI Coding Agents & Contributors

Future development steps must adhere to the following rules:

1. **Reuse Existing Shared Types:** Do not redeclare `AppError`, `ErrorCode`, `Result`, `StationId`, or `AppMetadata` in feature-specific directories.
2. **Single Source of Truth:** All cross-module contracts must reside under `src/shared/`.
3. **Never Suppress Strictness Globally:** Do not disable `strict`, `noUnusedLocals`, or `noImplicitOverride` in `tsconfig` files to bypass compilation errors.
4. **Never Leak Raw Internal Exceptions to the UI:** Always pass caught errors through `normalizeError()` or `toSerializableError()`.
5. **Format on Save:** Ensure Prettier (`npm run format:write`) and ESLint (`npm run lint`) pass cleanly before declaring any task complete.
