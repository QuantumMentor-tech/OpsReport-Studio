# Step 31 Completion Report: Word Document Cloning & Placeholder Replacement Engine

## A. Implementation summary

`WordDocumentCloningService` clones an approved `.docx` master version into `Workspace/` (hash-verified, row in `generation_workspaces` with `WORD_DOCX`). `WordGenerationService` then:

1. Validates session, workspace, template/version provenance and master integrity.
2. Loads Word `PLACEHOLDER` mappings (direct, or from a profile) and builds a full plan **before any mutation**.
3. Replaces placeholders in an in-memory copy of `word/document.xml`.
4. Saves an operation-owned candidate, reopens it and verifies it against an exact expected-change model.
5. Promotes with an atomic rename, then persists hash and status (`IN_USE`).

## B. Files

| File                                                      | Responsibility                                                             |
| :-------------------------------------------------------- | :------------------------------------------------------------------------- |
| `src/shared/types/word-generation.ts`                     | Options, results, issue/stage contracts                                    |
| `src/storage/generation/word-placeholder-engine.ts`       | Tokenizer, paragraph/run index, package scan, replacement, text validation |
| `src/storage/generation/word-document-cloning-service.ts` | Word clone into Workspace                                                  |
| `src/storage/generation/word-generation-service.ts`       | Plan, replace, save, verify, promote, persist                              |
| `src/storage/generation/index.ts`                         | Barrel exports                                                             |
| `tests/unit/word-generation.test.ts`                      | 45 tests                                                                   |
| `docs/requirements/*`                                     | DEC-053, traceability 30B                                                  |

## C. Library and format

PizZip `^3.3.0` (already installed, no new dependency). Only `.docx`. `.doc`/`.docm` and macro packages are rejected by the existing validator. Tested only against synthetic fixtures. **No real Word application was used.**

## D. Cloning and immutability

Trusted IDs only, version must belong to the template, archived or non-Word templates are rejected, SHA-256 baseline is checked, `COPYFILE_EXCL` copy, destination is checked to be inside `Workspace/` and outside the vault. The master hash is verified before and after both cloning and generation. The working copy must still equal the master bytes before generation starts.

## E. Placeholder contract

Syntax `{token}` with `[a-zA-Z0-9_#/-]+`, taken from `WORD_PLACEHOLDER_REGEX` (Step 23). Only `PLACEHOLDER` mappings are processed. Fields must be approved and belong to the template category (or `ALL`). Repeating fields are blocked. Missing/null is distinct from `''`, `0`, `false`. A required `''` counts as missing (Excel convention). Booleans render as `true`/`false`. Dates are used as stored. Enumerations are checked against the approved dictionary. Control characters are rejected. Repeated tokens are all replaced. Case-variant duplicates are ambiguous and block.

## F. Main-body behavior

Supported: `w:p` outside tables, text boxes and unsafe constructs. Split runs are matched on concatenated run text. The value goes into the run holding `{`, remaining matched characters are removed from other runs, and run properties are untouched. Tabs/breaks/drawings act as separators, so tokens cannot match across them. Tables, text boxes, headers, footers, footnotes, endnotes, comments, and paragraphs with tracked changes, fields, hyperlinks, content controls, smart tags or custom XML are never mutated. Tokens there are reported and block the operation when required.

## G. Candidate validation and recovery

Candidate `word_candidate_<ts>_<uuid>.docx`, written with `wx`. Checks: package validation, reopen, identical entry names, byte-identical non-document parts, paragraph count, and per-paragraph exact expected text (this catches unresolved tokens, recursion and collateral damage). Failures delete only the owned candidate and leave the working file and `PREPARED` status unchanged. Promotion failure leaves the previous artifact. Persistence failure restores the previous bytes and reports `previousDocumentRestored`. Regeneration on a non-`PREPARED` workspace is refused.

## H. Security

Local only. DTD/entity declarations and CDATA are rejected, only the five predefined and numeric entities are decoded, values are XML-escaped and never rescanned, no macros or links are followed, path containment checks, diagnostics are value-free (tested).

## I. Commands and results

| Command                                             | Result                                                                |
| :-------------------------------------------------- | :-------------------------------------------------------------------- |
| `npx vitest run tests/unit/word-generation.test.ts` | 45/45 pass                                                            |
| `npm test`                                          | 39 files, 394 tests pass (baseline 349 + 45)                          |
| `npm run typecheck`                                 | 0 errors                                                              |
| `npm run lint`                                      | 0 errors, 40 warnings (the same pre-existing `no-explicit-any` count) |
| `npm run format:check`                              | pass                                                                  |
| `npm run build`                                     | succeeds                                                              |

Bugs found by the tests and fixed: the entity check rejected legitimate `&` after decoding; an unused `eslint-disable` directive.

## J. Regression

All Step 26–30 Excel suites pass inside `npm test`. No Excel source file was modified. `APPROVED_FIELD_ENUMERATIONS` is imported (read-only) from the Excel injection module.

## K. Limitations

- No real `.docx` produced by Microsoft Word was used. Fixtures are synthetic and Word rendering is not verified.
- Value-to-text conventions (boolean `true`/`false`, unformatted dates) are provisional (DEC-053).
- Split-run style policy is "style of the run containing `{`".
- `PARAGRAPH`, `TABLE_CELL`, `REPEATING_ROW` mappings are unsupported (Step 32).
- Encrypted packages are rejected as malformed, not specifically identified.
- Service is not wired to UI/IPC. Word mapping profiles were tested only through the direct mapping repository.
- Placeholders in headers, footers and tables block rather than being replaced.
- `{{a}` is read as the token `{a}` preceded by a literal brace.
- No performance measurement on large documents.
- A promote-then-persist crash between rename and DB update cannot be restored automatically.

## L. Git and filesystem

New (untracked): the four source files, test file, this report. Modified: barrel, decision register, traceability. Pre-existing uncommitted work from Steps 25–30 was left untouched. No commit. No master or user template was changed (tests use temp vaults).

## M. Acceptance

| #                                                                       | Result                      |
| :---------------------------------------------------------------------- | :-------------------------- |
| 1–2 audit, architecture fit                                             | Passed                      |
| 3–5 template/version, master unchanged, candidate                       | Passed                      |
| 6 syntax from evidence                                                  | Passed                      |
| 7–8 session values, pre-mutation plan                                   | Passed                      |
| 9–11 body replacement, split runs, surroundings                         | Passed (synthetic fixtures) |
| 12–15 detection, no recursion, excluded locations, no false success     | Passed                      |
| 16–18 save/reopen, no promotion on failure, previous artifact protected | Passed                      |
| 19 tests                                                                | Passed                      |
| 20 Excel regression                                                     | Passed                      |
| 21 build/checks                                                         | Passed                      |
| 22 documentation                                                        | Passed                      |
| 23 Step 32 scope                                                        | Passed                      |
| 24 unexplained regressions                                              | None known                  |
| Opens in real Microsoft Word                                            | **Not Verified**            |

## N. Scope

Only Step 31 was implemented. Step 32 has not begun.
