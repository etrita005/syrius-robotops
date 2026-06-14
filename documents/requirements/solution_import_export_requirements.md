# Solution Import/Export — Requirements Specification

> **Parent Module**: Solution Management (`documents/requirements/solution_management_requirements.md`)
> **Status**: Draft — for review

---

## 1. Overview

This document defines requirements for the Solution Import/Export feature, which enables FAE personnel to transfer solution configurations (robots, maps, configs, upgrade package references, diagnostics, logs) between workstations or share them with colleagues.

The feature extends the existing Solution Management module (FR-SOL-012, FR-SOL-013) with user-facing UI, progress feedback, conflict resolution, and HTTP-based file transfer suitable for a browser environment.

---

## 2. Current State (Gap Analysis)

| Capability | Backend | Frontend API | Frontend UI | Status |
|---|---|---|---|---|
| Export to ZIP | `SolutionService.exportSolution()` writes to server disk | `solutionApi.exportSolution(id)` exists | Icon-only button, no feedback, no download | **Incomplete** |
| Import from ZIP | `SolutionService.importSolution()` reads from server disk | `solutionApi.importSolution(zipPath, targetPath)` exists | No UI element | **Missing** |
| File download | Not implemented (writes to `data/` dir) | Not implemented | Not implemented | **Missing** |
| File upload | Not implemented (reads from server `zipPath`) | Not implemented | Not implemented | **Missing** |
| Progress tracking | Not implemented | Not implemented | Not implemented | **Missing** |
| Conflict resolution | Not implemented | Not implemented | Not implemented | **Missing** |
| ZIP pre-validation | Not implemented | Not implemented | Not implemented | **Missing** |
| Cancel support | Not implemented | Not implemented | Not implemented | **Missing** |
| Artifact refCount sync | Not implemented | Not implemented | Not implemented | **Missing** |

---

## 3. Functional Requirements

### 3.1 Export Solution

**FR-EXP-001**: System MUST allow users to export a solution as a ZIP archive via the browser.

- User triggers export from the solution selector page (per-solution "Export" button).
- The ZIP archive is streamed from the backend to the browser as an HTTP download (`Content-Type: application/zip`, `Content-Disposition: attachment`).
- Archive filename format: `{solution-name-slug}-v{version}-{timestamp}.zip`.
- Archive contains the full `v1/solutions/{id}/` directory tree (all JSON resources serialized with 2-space indentation).
- The frontend receives the file via browser download mechanism (no server-side file path needed).

**FR-EXP-002**: System MUST display export progress feedback.

- A modal or inline progress indicator shows export state: "Preparing archive...", progress percentage, "Finalizing...", "Download starting...".
- The progress indicator includes a Cancel button to abort the export.
- On success, a toast notification confirms "Solution '{name}' exported successfully."
- On failure, an error toast displays the reason.

**FR-EXP-003**: Export MUST be streamed to avoid memory exhaustion.

- Backend uses `archiver` with streaming (pipes ObjectStore reads directly to HTTP response).
- Archive must never be fully loaded into memory (NF-SOL-002 applies).
- Large solutions (1+ GB) must export without crashing.

**FR-EXP-004**: Export MUST be cancellable.

- The operation accepts an `AbortSignal`. On abort, the archive stream is destroyed.
- Partially written data (if any) is cleaned up.

### 3.2 Import Solution

**FR-IMP-001**: System MUST allow users to import a solution from a ZIP file via the browser.

- A global "Import solution" button is present on the solution selector page (alongside "Create solution").
- Clicking it opens the Import modal.

**FR-IMP-002**: The Import modal MUST support browser file selection (drag-and-drop or file picker).

- User can drag a `.zip` file onto a drop zone or click to browse files.
- Only `.zip` files are accepted.
- After file selection, the system performs pre-validation before importing.

**FR-IMP-003**: System MUST pre-validate the ZIP structure before writing data.

- Validation checks:
  - ZIP contains at least one `.json` entry under a valid solution directory path.
  - A `meta.json` entry exists at the solution root level.
  - `meta.json` content is valid JSON conforming to `SolutionMeta` schema.
- If validation fails, the import is aborted with a clear error message: "The selected file is not a valid solution archive."
- Pre-validation does NOT extract all files; it reads only the central directory and necessary metadata entries.

**FR-IMP-004**: System MUST handle solution ID conflicts during import.

- If a solution with the same ID already exists, the user is presented with three options:
  1. **Overwrite**: Delete the existing solution and import the new one. Warns that all existing data will be lost.
  2. **Rename**: Auto-generate a new unique ID for the imported solution. The original name is preserved.
  3. **Cancel**: Abort the import.
- If the user chooses Rename, the new ID follows the standard generation rule (`{slugified-name}-{nanoid(6)}`).
- If no conflict exists, import proceeds directly without confirmation.

**FR-IMP-005**: System MUST display import progress feedback.

- A modal or inline progress indicator shows: "Validating archive...", "Importing resources... (X/Y)", "Finalizing...".
- The progress indicator includes a Cancel button.
- On success, a toast confirms "Solution '{name}' imported successfully." and the solution is auto-activated.
- On failure, an error toast displays the reason.

**FR-IMP-006**: System MUST clean up on import failure.

- If import fails partway through, any partially written solution data is deleted to prevent corrupted solutions.
- The solution list is not updated with incomplete data.

**FR-IMP-007**: Imported solutions MUST automatically appear in the solution list and be auto-activated.

- After successful import, the solution list is refreshed.
- The imported solution becomes the active solution (consistent with FR-SOL-005 / UI-SOL-005).

**FR-IMP-008**: Import MUST handle artifact references.

- During import, the system scans imported sub-resources for artifact references (`artifactId` + `purpose` fields).
- For each valid reference (artifact exists in global artifact store), increment the artifact's `refCount`.
- For each invalid reference (artifact does not exist), record it and warn the user after import: "N artifact references could not be resolved. Please re-upload the referenced artifacts."
- The import succeeds even if some artifact references are unresolved (the solution still works, just with broken references).

### 3.3 Common Requirements

**FR-IO-001**: Both export and import MUST be accessible from the Solution Selector page.

- Export: per-solution button on each solution card.
- Import: global button in the page header area, next to "Create solution".

**FR-IO-002**: Both operations MUST tolerate network interruptions with retry (3 attempts, exponential backoff).

- Applies to the HTTP request/response lifecycle.
- Streaming operations may not retry mid-stream; retry applies at the request level.

**FR-IO-003**: Progress indication MUST follow Carbon Design System patterns.

- Use `ProgressBar` or `InlineLoading` components.
- Cancel buttons use Carbon `Button` with `kind="ghost"` or `kind="danger--ghost"`.

---

## 4. Error Handling

| Error Code | Trigger | User Message |
|---|---|---|
| `EXPORT_FAILED` | Backend export stream fails | "Export failed: {reason}. Please try again." |
| `IMPORT_INVALID_ARCHIVE` | ZIP structure validation fails | "The selected file is not a valid solution archive." |
| `IMPORT_ID_COLLISION` | User selects "Cancel" on conflict dialog | "Import cancelled due to ID conflict." |
| `IMPORT_FAILED` | Import write operations fail | "Import failed: {reason}. No data was modified." |
| `IMPORT_PARTIAL_REFERENCES` | Some artifact references unresolvable | "Solution imported, but {n} artifact reference(s) are unresolved." |
| `UPLOAD_TOO_LARGE` | ZIP file exceeds server limit (e.g., 2 GB) | "The archive is too large. Maximum size is {limit}." |
| `UNSUPPORTED_FILE_TYPE` | User selects a non-ZIP file | "Only .zip files are supported." |

---

## 5. UI/UX Requirements

**UI-EXP-001**: The Export button on solution cards MUST show a loading state while export is in progress (spinner icon replacing the Export icon).

**UI-EXP-002**: Export progress MUST be shown in a non-blocking manner (toast with progress bar or small inline modal). It should NOT block the entire UI.

**UI-EXP-003**: After export completes, the browser MUST trigger a file download of the ZIP archive.

**UI-IMP-001**: The Import modal MUST include:
- A file drop zone with visual feedback (highlighted border on drag-over).
- A "Browse files" button as fallback.
- Display of selected file name and size after selection.
- Validation result (success/error) before user confirms import.

**UI-IMP-002**: The conflict resolution dialog MUST:
- Show the conflicting solution name and ID.
- Present three options as radio buttons or buttons: Overwrite (danger), Rename (recommended), Cancel.
- Include a warning text for the Overwrite option about data loss.

**UI-IMP-003**: Import progress MUST be shown in a modal with:
- Current step indicator (Validating / Importing / Finalizing).
- Overall progress bar with percentage.
- "X of Y resources imported" counter.
- Cancel button.

**UI-IMP-004**: After successful import, the user MUST be navigated to the main workspace with the new solution active. A success toast MUST appear.

**UI-IMP-005**: The empty state message on the solution selector page MUST mention import: "Create or import a solution to get started."

---

## 6. Use Cases

### UC-EXP-01: Export a solution

| Field | Value |
|---|---|
| Actor | FAE |
| Precondition | Solution exists |
| Postcondition | ZIP file downloaded to local machine |
| Main Flow | 1. FAE clicks Export icon on solution card. 2. System shows progress indicator. 3. System streams ZIP and triggers browser download. 4. System shows success toast. |
| Alternate Flow | Export fails: system shows error toast. FAE can cancel during export. |

### UC-IMP-01: Import a solution (no conflict)

| Field | Value |
|---|---|
| Actor | FAE |
| Precondition | No ID conflict with imported solution |
| Postcondition | New solution appears in list, activated |
| Main Flow | 1. FAE clicks "Import solution". 2. Modal opens. 3. FAE drags/drops or browses a .zip file. 4. System validates archive. 5. System imports resources. 6. System auto-activates solution. 7. User is navigated to workspace. |

### UC-IMP-02: Import a solution (with ID conflict — rename)

| Field | Value |
|---|---|
| Actor | FAE |
| Precondition | Solution with same ID exists |
| Postcondition | New solution with auto-generated ID appears in list, activated |
| Main Flow | 1-4 same as UC-IMP-01. 5. System detects ID conflict. 6. User chooses "Rename". 7. System generates new ID. 8. System imports resources with new ID. 9. System auto-activates. |

### UC-IMP-03: Import a solution (with ID conflict — overwrite)

| Field | Value |
|---|---|
| Actor | FAE |
| Precondition | Solution with same ID exists |
| Postcondition | Existing solution replaced by imported one |
| Main Flow | 1-4 same as UC-IMP-01. 5. System detects ID conflict. 6. User chooses "Overwrite". 7. System deletes existing solution (with artifact refCount cleanup). 8. System imports new solution. 9. System auto-activates. |

---

## 7. Non-Functional Requirements

**NF-EXP-001**: Export streaming download latency (time from click to first byte received) MUST be under 3 seconds for solutions under 100 MB.

**NF-EXP-002**: Export MUST NOT block the UI. Other operations (robot viewing, task listing) remain functional during export.

**NF-IMP-001**: ZIP validation MUST complete within 2 seconds for archives under 500 MB.

**NF-IMP-002**: Import throughput MUST be at least 10 MB/s on standard SSD hardware.

**NF-IO-001**: Maximum archive size for import: 2 GB (configurable server-side limit).

**NF-IO-002**: Both operations MUST log structured events via Pino logger for audit trail.
