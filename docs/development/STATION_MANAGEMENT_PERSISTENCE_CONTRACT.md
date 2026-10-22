# OpsReport Studio — Station Management & Persistence Integration Contract

**Document Identifier:** CTR-STN-PERSIST-001  
**Project ID:** stationops-reporter  
**Approved Product Name:** OpsReport Studio  
**Lifecycle Step:** Step 14 of 45 (Station Management, Station Ordering & Configuration Editor)  
**Status:** Approved Technical Contract  
**Last Updated:** 2026-10-20

---

## 1. Overview & Architectural Boundaries

This contract establishes the formal communication, persistence, ordering, and validation boundaries for Station Management in OpsReport Studio.

In adherence to Step 6 module boundaries and Step 13 persistence architecture:

1. **Renderer Process (Sandboxed):** Interacts exclusively through `IStationClient` and the context-isolated Electron IPC bridge (`window.opsreport.stations`). Direct SQLite driver imports or filesystem calls in the renderer are strictly forbidden.
2. **Main Process (Node.js/Electron):** Maintains the singleton `DatabaseManager` and `StationRepository`, executes parameterized SQLite statements with WAL mode and foreign-key enforcement, and serializes outcomes into discriminated `Result<T, SerializableError>`.
3. **Database Layer (SQLite v3.45+):** Enforces primary-key uniqueness (`station_id`), non-empty name check constraints, positive contiguous display orders (`display_order >= 1`), and transactional atomicity.

---

## 2. IPC Communication Channels & Method Contracts

All renderer-to-main IPC interactions are mediated over predefined, sandboxed channels:

| IPC Channel          | Direction        | Input Payload                                  | Return Type                                        | Architectural Responsibility                                                             |
| :------------------- | :--------------- | :--------------------------------------------- | :------------------------------------------------- | :--------------------------------------------------------------------------------------- |
| `stations:get-all`   | Renderer -> Main | `options?: { activeOnly?: boolean }`           | `Result<StationRecord[], SerializableError>`       | Retrieves stations strictly ordered by `display_order ASC, created_at ASC`.              |
| `stations:get-by-id` | Renderer -> Main | `stationId: string`                            | `Result<StationRecord \| null, SerializableError>` | Retrieves a single station by stable branded identifier.                                 |
| `stations:create`    | Renderer -> Main | `input: CreateStationInput`                    | `Result<StationRecord, SerializableError>`         | Validates name, allocates next contiguous ordinal position, and inserts row.             |
| `stations:update`    | Renderer -> Main | `stationId: string, input: UpdateStationInput` | `Result<StationRecord, SerializableError>`         | Validates name uniqueness and updates permitted station properties.                      |
| `stations:delete`    | Renderer -> Main | `stationId: string`                            | `Result<boolean, SerializableError>`               | Atomically deletes record and re-indexes remaining stations to contiguous 1..N sequence. |
| `stations:reorder`   | Renderer -> Main | `orderedIds: string[]`                         | `Result<StationRecord[], SerializableError>`       | Executes atomic transactional display order reassignment for provided sequence.          |
| `stations:get-count` | Renderer -> Main | `activeOnly?: boolean`                         | `Result<number, SerializableError>`                | Returns count of stations in the database.                                               |

---

## 3. Data Integrity & Ordering Invariants

### 3.1 Contiguous Ordinality Invariant (`display_order`)

- Every station record must have `display_order >= 1`.
- For any set of $N$ configured stations, the sequence of `display_order` values must equal $\{1, 2, \dots, N\}$ exactly.
- Insertion allocates position $N + 1$ by default.
- Deletion re-indexes all remaining stations $(1, 2, \dots, N-1)$ inside an immediate SQLite transaction.
- Reordering updates all $N$ positions $(1, 2, \dots, N)$ within a single atomic transaction. Intermediate states or duplicate sequence numbers are never exposed outside the transaction.

### 3.2 Name Uniqueness Invariant (`station_name`)

- Station names must be between 1 and 150 characters after trimming.
- Names must be case-insensitively unique:
  $$\text{LOWER}(\text{TRIM}(A.\text{station\_name})) \neq \text{LOWER}(\text{TRIM}(B.\text{station\_name})) \quad \forall A \neq B$$
- Enforced both at the client service boundary and inside `StationRepository` queries.

### 3.3 Stable Identity Invariant (`station_id`)

- Station identifiers (`StationId`) are immutable nominal keys (e.g. `STN-A1B2C3D4`).
- Ordinary name edits, facility code updates, active toggles, and operational reordering **never** alter the `station_id`.
- Historical reports, draft sessions, and field mappings will reference `station_id` to guarantee that station renames never break historical links.

---

## 4. UI/UX Interaction Standards

1. **Deterministic Display:** Stations are always rendered in ascending `display_order`. Alphabetical sorting is strictly prohibited as it scrambles operational report tables.
2. **Accessible Reordering Controls:**
   - Explicit Move Up (▲) and Move Down (▼) buttons provided on each row.
   - Screen-reader accessible: `aria-label="Move {StationName} up in sequence"`.
   - Bound disablement: Move Up disabled at position #1; Move Down disabled at position #N.
   - Concurrency locking: Reorder buttons are disabled while an in-flight save is processing (`isSaving === true`).
3. **Safe Deletion Protocol:**
   - Deletion requires an explicit confirmation modal explaining that remaining stations will be re-indexed.
   - If an operational station is decommissioned temporarily, users are guided to use the **Disable** toggle (`is_active = 0`) instead of hard deletion.
4. **Truthful Empty State:**
   - New installations start with zero station records.
   - No mock, placeholder, or fabricated stations are seeded.
   - An explicit, clear call-to-action (`Add First Station`) guides the operator to configure the genuine operational sequence.
