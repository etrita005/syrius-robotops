# System Logs Module - Test Cases

> Based on the requirements (`system_logs_requirements.md`) and design (`system_logs_design.md`). All test cases below assume the backend is running and the `src/backend/logs/` directory is populated unless stated otherwise.

---

## 1. File listing

### TC-SL-001: List log files (happy path)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | `logs/` contains `app.1.log` and `app.2.log`, both with valid JSON-Lines content; `app.2.log` is the active file |
| Input | `GET /api/system-logs/files` |
| Expected Status | 200 |
| Expected Response | `{ files: LogFileInfo[] }` containing both files; each entry has `name`, `size > 0`, `mtime`, `firstTs`, `lastTs`; exactly one entry has `isActive === true` and it is `app.2.log` |

### TC-SL-002: List log files (empty directory)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | `logs/` exists but is empty |
| Input | `GET /api/system-logs/files` |
| Expected Status | 200 |
| Expected Response | `{ files: [] }` |

### TC-SL-003: List log files (directory missing)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | `logs/` does not exist on disk |
| Input | `GET /api/system-logs/files` |
| Expected Status | 200 |
| Expected Response | `{ files: [] }` (no error) |

### TC-SL-004: List log files (ignores non-matching names)

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | `logs/` contains `app.1.log`, `app.log.bak`, `notes.txt`, `app.abc.log` |
| Input | `GET /api/system-logs/files` |
| Expected Status | 200 |
| Expected Response | Only `app.1.log` is returned |

### TC-SL-005: First/last timestamps parsed correctly

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | `app.1.log` has first line `time` `2026-06-07T10:00:00.000Z` and last line `time` `2026-06-07T11:00:00.000Z` |
| Input | `GET /api/system-logs/files` |
| Expected Status | 200 |
| Expected Response | The entry for `app.1.log` has `firstTs === "2026-06-07T10:00:00.000Z"` and `lastTs === "2026-06-07T11:00:00.000Z"` |

### TC-SL-006: First/last timestamps absent when unparseable

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | `app.1.log` contains only non-JSON lines |
| Input | `GET /api/system-logs/files` |
| Expected Status | 200 |
| Expected Response | The entry for `app.1.log` omits `firstTs` and `lastTs` (or sets them to `undefined`) |

---

## 2. Module listing

### TC-SL-010: List modules (happy path)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Recent log files contain entries with `module` values `App`, `TaskFlowEngine`, `SshCommand`, and one entry without `module` field |
| Input | `GET /api/system-logs/modules` |
| Expected Status | 200 |
| Expected Response | `{ modules: string[] }` containing at least `App`, `TaskFlowEngine`, `SshCommand`, `(none)`, plus the static known module list; sorted alphabetically |

### TC-SL-011: List modules (empty logs)

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | `logs/` is empty |
| Input | `GET /api/system-logs/modules` |
| Expected Status | 200 |
| Expected Response | `{ modules: [...staticKnownModules, "(none)"] }` (static list still returned) |

### TC-SL-012: Module list caching

| Item | Value |
|------|-------|
| Priority | Low |
| Precondition | First call has returned at time T |
| Input | Second `GET /api/system-logs/modules` within 30 seconds |
| Expected Result | Returns within < 50ms; backend log shows cache hit |

---

## 3. Query (time range, paging, filters)

### TC-SL-020: Default query window (no params)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Logs spanning the last 24 hours exist |
| Input | `GET /api/system-logs/query` |
| Expected Status | 200 |
| Expected Response | All returned entries have `time` within `[now - 30min, now]`; default order is descending |

### TC-SL-021: Explicit time window

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Logs spanning 2026-06-07 09:00 to 12:00 UTC exist |
| Input | `GET /api/system-logs/query?from=2026-06-07T10:00:00Z&to=2026-06-07T11:00:00Z` |
| Expected Status | 200 |
| Expected Response | All entries have `time` within the requested window; no entries outside |

### TC-SL-022: Cross-file aggregation

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | The requested window spans entries that live in both `app.1.log` and `app.2.log` |
| Input | `GET /api/system-logs/query?from=<windowSpan>&to=<windowSpan>&order=asc` |
| Expected Status | 200 |
| Expected Response | Entries from both files are returned, sorted ascending by `time`, with no duplicates and no gaps |

### TC-SL-023: Cursor pagination

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | The requested window contains > 1000 matching entries |
| Input | 1. `GET /api/system-logs/query?from=...&to=...&limit=500` → capture `nextCursor` 2. `GET /api/system-logs/query?from=...&to=...&limit=500&cursor=<nextCursor>` |
| Expected Result | First call returns 500 entries and `truncated: true` with `nextCursor`; second call returns the next batch with no overlap with the first |

### TC-SL-024: Level filter

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Logs contain a mix of `info`, `warn`, `error` entries |
| Input | `GET /api/system-logs/query?levels=warn,error` |
| Expected Status | 200 |
| Expected Response | Every returned entry has `level` in `{ "warn", "error" }`; no `info` entries |

### TC-SL-025: Module filter

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Logs contain entries with `module` values `App`, `TaskFlowEngine`, and some without `module` |
| Input | `GET /api/system-logs/query?modules=TaskFlowEngine` |
| Expected Status | 200 |
| Expected Response | Every returned entry has `module === "TaskFlowEngine"` |

### TC-SL-026: Module filter with `(none)`

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | Logs contain entries both with and without `module` field |
| Input | `GET /api/system-logs/query?modules=(none)` (URL-encoded as `%28none%29`) |
| Expected Status | 200 |
| Expected Response | Every returned entry has no `module` field |

### TC-SL-027: Keyword search

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Logs contain at least one entry with `msg` `"Robot upgrade started"` |
| Input | `GET /api/system-logs/query?q=upgrade` |
| Expected Status | 200 |
| Expected Response | All returned entries have `msg` matching (case-insensitive) the substring `upgrade` |

### TC-SL-028: Combined filters

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Logs vary in level, module, and msg |
| Input | `GET /api/system-logs/query?levels=error&modules=SshCommand&q=timeout` |
| Expected Status | 200 |
| Expected Response | All entries satisfy all three filters simultaneously |

### TC-SL-029: Empty time window

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | No logs exist within a future window |
| Input | `GET /api/system-logs/query?from=2099-01-01T00:00:00Z&to=2099-01-02T00:00:00Z` |
| Expected Status | 200 |
| Expected Response | `{ entries: [], truncated: false, parseErrorCount: 0 }` |

### TC-SL-030: Invalid `from` format

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | None |
| Input | `GET /api/system-logs/query?from=yesterday` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LOG_QUERY", message: <contains "from"> }` |

### TC-SL-031: `from` later than `to`

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | None |
| Input | `GET /api/system-logs/query?from=2026-06-07T12:00:00Z&to=2026-06-07T10:00:00Z` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LOG_QUERY", message: <contains "from > to"> }` |

### TC-SL-032: `limit` exceeds max

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | None |
| Input | `GET /api/system-logs/query?limit=10000` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LOG_QUERY", message: <contains "limit"> }` |

### TC-SL-033: Unknown `level` value

| Item | Value |
|------|-------|
| Priority | Low |
| Precondition | None |
| Input | `GET /api/system-logs/query?levels=verbose` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LOG_QUERY", message: <contains "levels"> }` |

### TC-SL-034: Order ascending

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | At least 5 matching entries |
| Input | `GET /api/system-logs/query?order=asc&limit=5` |
| Expected Status | 200 |
| Expected Response | Returned entries' `time` values are non-decreasing |

### TC-SL-035: Unparseable lines do not stop query

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Active log file contains 1 malformed line (not JSON) among valid lines |
| Input | `GET /api/system-logs/query` |
| Expected Status | 200 |
| Expected Response | Valid entries returned successfully; `parseErrorCount >= 1` |

### TC-SL-036: Early-exit optimization (functional check)

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | `app.1.log` is 500 MB and contains entries only from 2020 (well before the requested window) |
| Input | `GET /api/system-logs/query?from=2026-06-07T10:00:00Z&to=2026-06-07T11:00:00Z` |
| Expected Result | Query completes in < 1s (early exit triggered before fully scanning `app.1.log`) |

---

## 4. Bundle download

### TC-SL-040: Bundle download (happy path)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | `app.1.log` and `app.2.log` both intersect the requested window |
| Input | `POST /api/system-logs/download` with `{ from: "2026-06-07T10:00:00Z", to: "2026-06-07T11:00:00Z" }` |
| Expected Status | 200 |
| Expected Headers | `Content-Type: application/zip`; `Content-Disposition: attachment; filename="robotops-logs-20260607100000-20260607110000.zip"` |
| Expected Body | A valid zip containing `manifest.json`, `app.1.log`, `app.2.log`; archived files are byte-identical to the originals |

### TC-SL-041: Bundle manifest content

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Same as TC-SL-040 |
| Input | Same as TC-SL-040 |
| Expected Result | After extracting, `manifest.json` parses as JSON with `requestedFrom`, `requestedTo`, `generatedAt`, `studioVersion`, and a `files[]` array whose entries match the included files (name, size, mtime, firstTs, lastTs) |

### TC-SL-042: Bundle with no matching files

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | No log files intersect the requested window |
| Input | `POST /api/system-logs/download` with a future window |
| Expected Status | 200 |
| Expected Body | A zip containing only `manifest.json`; `files: []` in the manifest |

### TC-SL-043: Bundle with missing `from`

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | None |
| Input | `POST /api/system-logs/download` with `{ to: "2026-06-07T11:00:00Z" }` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LOG_QUERY", message: <contains "from"> }` |

### TC-SL-044: Bundle with invalid time format

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | None |
| Input | `POST /api/system-logs/download` with `{ from: "yesterday", to: "today" }` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LOG_QUERY" }` |

### TC-SL-045: Bundle includes active file unchanged

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | `app.2.log` is the active file and Pino is still appending to it |
| Input | `POST /api/system-logs/download` with a window covering `app.2.log` |
| Expected Result | The `app.2.log` inside the zip is a consistent prefix of the file (size matches the manifest entry); Pino continues appending unaffected |

### TC-SL-046: Bundle filename uses requested timestamps

| Item | Value |
|------|-------|
| Priority | Low |
| Precondition | None |
| Input | Same as TC-SL-040 |
| Expected Result | `Content-Disposition` filename matches pattern `robotops-logs-YYYYMMDDHHmmss-YYYYMMDDHHmmss.zip` derived from `from`/`to` |

---

## 5. Single file download

### TC-SL-050: Download single file (happy path)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | `app.1.log` exists |
| Input | `GET /api/system-logs/files/app.1.log/download` |
| Expected Status | 200 |
| Expected Headers | `Content-Type: application/octet-stream`; `Content-Disposition: attachment; filename="app.1.log"` |
| Expected Body | Byte-identical to the file on disk at the moment the request arrived |

### TC-SL-051: Download single file (not found)

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | `app.99.log` does not exist |
| Input | `GET /api/system-logs/files/app.99.log/download` |
| Expected Status | 404 |
| Expected Response | `{ error: "LOG_FILE_NOT_FOUND" }` |

### TC-SL-052: Download with invalid filename

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | None |
| Input | `GET /api/system-logs/files/notes.txt/download` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LOG_FILE_NAME" }` |

### TC-SL-053: Download active file (concurrent with appends)

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | `app.2.log` is the active file; Pino is actively writing to it |
| Input | `GET /api/system-logs/files/app.2.log/download` |
| Expected Result | Downloaded content length equals the file size at trigger time; Pino's subsequent appends are not included; Pino writes continue without error |

---

## 6. Security: path traversal

### TC-SL-060: Path traversal with `..`

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | None |
| Input | `GET /api/system-logs/files/..%2F..%2Fetc%2Fpasswd/download` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LOG_FILE_NAME" }` |

### TC-SL-061: Path traversal with absolute path

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | None |
| Input | `GET /api/system-logs/files/%2Fetc%2Fpasswd/download` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LOG_FILE_NAME" }` |

### TC-SL-062: Filename with backslash

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | None |
| Input | `GET /api/system-logs/files/app.1.log%5C..%5Capp.1.log/download` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LOG_FILE_NAME" }` |

### TC-SL-063: Filename with null byte

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | None |
| Input | `GET /api/system-logs/files/app.1.log%00.txt/download` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LOG_FILE_NAME" }` |

### TC-SL-064: Filename with trailing log extension lookalike

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | None |
| Input | `GET /api/system-logs/files/app.1.log.bak/download` |
| Expected Status | 400 |
| Expected Response | `{ error: "INVALID_LOG_FILE_NAME" }` |

---

## 7. Non-interference with Pino

### TC-SL-070: Query does not modify log files

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Capture SHA-256 of `app.1.log` before test |
| Input | Run `GET /api/system-logs/query?from=...&to=...` 10 times in succession |
| Expected Result | SHA-256 of `app.1.log` after the test is unchanged; file mtime is unchanged |

### TC-SL-071: Bundle download does not modify log files

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Capture SHA-256 of all log files before test |
| Input | `POST /api/system-logs/download` with a wide window |
| Expected Result | SHA-256 of all files unchanged; no new files appear in `logs/`; no files deleted |

### TC-SL-072: Backend logging continues during download

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | Pino is actively writing log lines (e.g., a background task is running) |
| Input | Trigger a large bundle download while logging is active |
| Expected Result | Pino write throughput is not blocked; new log lines continue to appear in the active file; the bundled active file may be a shorter prefix of the eventual file (acceptable) |

### TC-SL-073: No Pino configuration mutation

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Capture `LOG_LEVEL` env and effective `rootLogger.level` before test |
| Input | Use any combination of System Logs APIs |
| Expected Result | `rootLogger.level` is unchanged; `pino-roll` size/max settings are unchanged |

---

## 8. Frontend integration

### TC-SL-080: Top-nav entry visible

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | App loaded |
| Input | Observe the top header navigation |
| Expected Result | "System Logs" appears as a top-nav item alongside "Solutions" and "Artifacts" |

### TC-SL-081: Default view loads last 30 minutes

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Recent logs exist |
| Input | Click "System Logs" in the header |
| Expected Result | The page loads and displays log entries from the last 30 minutes, sorted newest first; time range picker shows "Last 30 minutes" |

### TC-SL-082: Filter change re-queries

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Page loaded with default query |
| Input | Toggle off `info` level in the level filter |
| Expected Result | Within ~500ms (debounced 300ms), the entry table refreshes and contains no `info` entries |

### TC-SL-083: Infinite scroll loads next page

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | The current query has `truncated: true` |
| Input | Scroll the entry table to the bottom |
| Expected Result | The next batch of entries is fetched via the cursor and appended; no duplicates with the existing list |

### TC-SL-084: Entry detail drawer

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | Entry table has entries |
| Input | Click an entry row |
| Expected Result | A detail drawer opens showing the full JSON of the entry, including `extra` fields |

### TC-SL-085: Bundle download triggers browser save

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | Page loaded |
| Input | Click "Download zip" with the current time window |
| Expected Result | Browser saves a file named `robotops-logs-...zip`; opening it shows `manifest.json` and the included log files |

### TC-SL-086: Single file download

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | File list shows at least one file |
| Input | Click the "Download" button on the row for `app.1.log` |
| Expected Result | Browser saves `app.1.log` byte-identical to the file on disk |

### TC-SL-087: Parse error notification

| Item | Value |
|------|-------|
| Priority | Low |
| Precondition | Query response has `parseErrorCount > 0` |
| Input | Observe the page after the query returns |
| Expected Result | An inline notification appears above the entry table stating how many lines failed to parse |

### TC-SL-088: Refresh button reloads all data

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | System Logs page is open with "Last 30 min" time window active; file list and module list are populated |
| Input | Click the "Refresh" button in the toolbar |
| Expected Result | (1) File list re-fetches (may show new files); (2) Module list re-fetches; (3) Log entries re-queried with updated timestamps (from/to shifted to current now); (4) Filter settings remain unchanged; (5) Button shows loading state during refresh |

### TC-SL-089: Refresh with custom absolute time window

| Item | Value |
|------|-------|
| Priority | Low |
| Precondition | User has set a custom absolute time window (e.g. "2026-06-01 08:00" to "2026-06-01 12:00") |
| Input | Click the "Refresh" button |
| Expected Result | Log entries are re-queried with the same absolute timestamps (not shifted to now); file list and module list are refreshed |

---

## 9. Performance benchmarks

### TC-SL-090: Default 30-minute query latency

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | Active file is under 50 MB |
| Input | `GET /api/system-logs/query` 10 times |
| Expected Result | Median latency < 500ms; p95 < 1s |

### TC-SL-091: Cross-2-file 500MB query latency

| Item | Value |
|------|-------|
| Priority | Low |
| Precondition | `app.1.log` and `app.2.log` are both ~500 MB and intersect the window |
| Input | `GET /api/system-logs/query?from=...&to=...&limit=500` |
| Expected Result | Latency < 2s |

### TC-SL-092: Bundle download startup latency

| Item | Value |
|------|-------|
| Priority | Low |
| Precondition | 5 files of ~500 MB each, all intersect the window |
| Input | `POST /api/system-logs/download` |
| Expected Result | First byte received within 1s; download proceeds at disk-bound throughput; backend memory does not grow proportional to total size |

---

## 10. Cross-cutting / regression

### TC-SL-100: Other modules unaffected

| Item | Value |
|------|-------|
| Priority | High |
| Precondition | All existing APIs (`/api/solutions`, `/api/artifacts`, `/api/objects`, `/api/memstore`, `/api/sse`, `/api/flows`) are functional before the test |
| Input | Run a full suite of existing module smoke tests after System Logs is integrated |
| Expected Result | All pre-existing APIs continue to return the same responses; no regression in functionality or performance |

### TC-SL-101: `archiver` dependency installed cleanly

| Item | Value |
|------|-------|
| Priority | Medium |
| Precondition | Fresh `npm install` in `src/backend` |
| Input | Build the backend |
| Expected Result | Build succeeds; no missing types; bundle size increase is acceptable |
