# Changelog

All notable changes to strider-ui are documented in this file.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Stats tab** — a third Explore tab next to Traces and Spans shows a lazy-loaded Chart.js line chart of trace counts over time, from `GET /traces/count`. Controls: interval (number plus minute, hour, or day unit), optional start and end, and Apply. Inline validation and loading, empty, and error states. The view mode is stored in the `?mode=traces|spans|stats` URL parameter, and the trace-detail Back link keeps the mode. New dependency: `chart.js` ^4.
- Known follow-ups: consolidate the duplicated HTTP error util and styles.

---

## [0.2.0] — 2026-10-08

### Added

- **Per-condition AND/OR operator** — each condition after the first in the query builder has its own AND/OR toggle, allowing mixed logical operators within a single query.
- **Refresh button** — the Explore/list view has a refresh button that re-runs the current query or stream without navigating away.
- **Back button** — the trace-detail view has a back button that returns to the results list; the list's mode, sort, filter, and loaded rows are preserved.
- **Header logo placeholder** — an SVG logo placeholder appears to the left of the "Strider" wordmark in the app header.

### Changed

- **Visual redesign** — replaced the Molten Tungsten orange palette and the grid/gradient background with a solid dark theme: deep royal purple accent (`#7c3aed`) on near-black/grey neutrals (background `#0d0d0f`, primary text `#ededf0`, surfaces `#18181b` / `#1f1f23`). No background grid or gradient.
- **Duration filter unit** — the query-builder duration field is now entered in milliseconds and labeled "Duration (ms)". Values are converted to nanoseconds before the condition is sent to the backend. Duration displays in the results table and trace-detail view are unchanged.
- **Collapsible filter panel** — the filter/query block is now a single collapsible panel, collapsed by default. The Traces/Spans toggle and sort controls remain always visible. The results list gains the freed vertical space.
- **Single-location error display** — error messages appear only in the status bar directly below the filters, eliminating the duplicate error display that previously appeared in two places.

### Fixed

- **CDK virtual-scroll rows not rendering** — the `*cdkVirtualFor` viewport was collapsing to zero height, hiding all streamed rows. The flex/height chain is repaired so rows render correctly.
- **Meaningful backend error messages** — error responses from the backend now display a descriptive message (e.g. "Internal Server Error: \<detail\>"), parsed from the response body (JSON `error` / `message` field or raw text), on both the list and trace-detail views.
- **Trace deep-link endless spinner** — opening a trace with `?spanId=...` in the URL caused an endless loading spinner. Removed an illegal `afterNextRender`-inside-`effect` call; the component now uses `afterRenderEffect` + `untracked`. The targeted span is selected and scrolled into view correctly.
- **ClickHouse `start_time` filter type error** — queries on `start_time` were failing with "Cannot convert string … to type DateTime64(9)". Comparisons now emit `parseDateTime64BestEffort('<iso>', 9)` and the `LIKE` operator uses `toString(start_time) LIKE '...'`.

---

## [0.1.0] — 2026-10-08

### Added

- **Explore view** — live-streaming table of traces or spans (mode toggle). Supports field sort (field + ASC/DESC direction), raw SQL condition filter, and a UI-assisted query builder (fields: `service_name`, `name`, `duration_ns`, `status_code`, `kind`, `start_time`; `kind` and `status_code` as OTEL-label dropdowns; `start_time` with quick-range presets and a datetime picker; full operator set including `=`, `!=`, `<`, `>`, `LIKE`). Live indicator, cancel button, and hard row cap of 10,000 rows via NDJSON streaming. CDK virtual scrolling keeps only visible rows in the DOM.
- **Trace-detail waterfall view** — Gantt-style view of all spans in a trace. Span tree with expand/collapse, support for forest (multiple roots) and orphan topologies, span-detail attributes panel, and deep-link span highlight via `span_id` query param.
- **Molten Tungsten design system** — dark palette (`#15110e` / `#ff5a1f` / `#f3e9df` / `#9a8c7f`), atmospheric layered background, staggered CSS page-load entry animation, self-hosted Clash Display (variable woff2) and Commit Mono (OTF) typefaces.
- **Zoneless signals architecture** — `provideZonelessChangeDetection()`, `OnPush` throughout, pure-signal stores (`ExploreStore` root-singleton, `TraceDetailStore` per-view), no NgRx.
- **Pure-function core** — `formatDuration` utility, SQL-condition compiler, waterfall geometry math, and mixed-case JSON mappers; all independently unit-tested (154 tests via Vitest + jsdom).
- **Dev proxy** — `proxy.conf.json` routes `/traces` and `/spans` to the Go backend at `:8080` so no CORS changes are needed in development.

### Known Issues

Three items deferred as accepted tech debt (see README "Known limitations / tech debt" for details):

1. `ndjson-stream.service.ts` — signal mutation and `AbortController.abort()` inside a `_rows.update()` callback (reactive-contract smell).
2. `ndjson-stream.service.ts` — row-cap-hit logic duplicated across batch path and trailing-line path.
3. `trace-detail.view.ts` — `afterNextRender()` called inside `effect()`, which can stack scroll callbacks on re-runs.
