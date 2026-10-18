# Strider UI

An Angular 22 frontend for the [Strider](https://github.com/domenico.a.ferraro/strider) distributed-tracing service. The UX is inspired by New Relic and Jaeger: a live-streaming explore view for traces and spans, and a waterfall detail view for diagnosing individual traces.

---

## Features

### Explore view (landing page)

- **Mode toggle** — switch between Traces, Spans, and Stats; Traces and Spans have their own column set and re-issue the backend request. The mode is stored in the `?mode=traces|spans|stats` URL parameter.
- **Stats tab** — a lazy-loaded [Chart.js](https://www.chartjs.org/) line chart of trace counts over time, from `GET /traces/count`. Controls: interval (number plus minute, hour, or day unit; default 1 hour), optional start and end (defaults: 1 year ago and now), and Apply. Invalid input shows an inline validation message and sends no request. The tab has loading, empty, and error states.
- **Sort** — choose any sortable field and toggle ASC / DESC direction.
- **Dual-mode filtering**
  - Raw condition: type a SQL WHERE fragment directly (e.g. `service_name = 'api-gateway'`).
  - Query builder: select field → operator → value with a guided UI. Fields: `service_name`, `name`, `duration_ns`, `status_code`, `kind`, `start_time`. `kind` and `status_code` render as friendly dropdowns (OTEL labels). `start_time` offers quick-range presets plus a datetime picker. Supported operators include the full set: `=`, `!=`, `<`, `>`, `LIKE` (and range-aware variants for `start_time`). Each condition after the first has its own AND/OR toggle.
  - Duration is entered in milliseconds (labeled "Duration (ms)") and converted to nanoseconds before being sent to the backend.
- **Collapsible filter panel** — the filter/query block collapses into a single panel (collapsed by default) to maximize vertical space for results. The Traces/Spans toggle and sort controls remain always visible.
- **Refresh button** — re-runs the current query or stream without navigating away.
- **Live NDJSON streaming** — results appear as they arrive from the backend. A live indicator shows stream activity. A cancel button aborts the in-flight request. Streaming stops automatically at 10,000 rows (hard cap).
- **CDK virtual scrolling** — the result table uses `@angular/cdk` `*cdkVirtualFor`; only visible rows are in the DOM regardless of row count.
- **Single-location error display** — errors appear in the status bar directly below the filters.
- **Full empty, loading, and error states** on every view.

### Trace-detail waterfall view (`/traces/:id`)

- **Waterfall / Gantt chart** — each span is a proportionally sized bar on a shared time axis.
- **Span tree** — spans are displayed in parent → child hierarchy; forest topologies (multiple roots) and orphan spans are both handled correctly.
- **Expand / collapse** — individual subtrees can be opened or closed.
- **Span-detail panel** — clicking a span opens a side panel showing all span attributes and resource attributes.
- **Back button** — returns to the results list with mode (including Stats), sort, filter, and loaded rows preserved.
- **Deep-link highlight** — navigating from the explore view (clicking a span row) passes the `span_id` as a query param; the target span is automatically selected and scrolled into view.

### Design system

Dark theme: background `#0d0d0f`, accent `#7c3aed` (deep royal purple), primary text `#ededf0`, surfaces `#18181b` / `#1f1f23`. Solid dark background (no grid or gradient). Staggered CSS page-load entry animation (plays once per app load). Header includes an SVG logo placeholder to the left of the "Strider" wordmark. Display typeface: Clash Display (variable woff2, self-hosted). Monospace typeface: Commit Mono (OTF, self-hosted).

---

## Architecture overview

| Layer | What it does |
|---|---|
| `App` shell | Persistent chrome (header, background layers, `<router-outlet>`). Entry animation runs once. |
| `ExploreStore` | Root-singleton signal store. Survives navigation; Back restores mode / sort / filter / rows. |
| `TraceDetailStore` | Per-view signal store, destroyed on navigation away. |
| `NdjsonStreamService` | `fetch` + `ReadableStream` + `TextDecoder` for incremental NDJSON lines. `AbortController` for cancel. `HttpClient` is used only for the single non-streamed `GET /traces/{id}`. |
| `core/util` | Pure functions: `formatDuration`, SQL-condition compiler, waterfall geometry math, span-tree flatten. |
| `core/mappers` | Pure functions: normalize mixed-case wire JSON (`PascalCase` trace-detail response, `snake_case` list responses) into camelCase app models. |

**Angular specifics:** standalone components, `OnPush` change detection, zoneless (`provideZonelessChangeDetection()`), signals-only state (no NgRx), new control flow (`@if` / `@for` / `@switch`), strict TypeScript + strict templates.

---

## Backend contract

The UI consumes a Go HTTP service. Run it on `http://localhost:8080`.

| Endpoint | Method | Response | Notes |
|---|---|---|---|
| `/traces` | GET | NDJSON stream | Params: `orderBy`, `direction`, `condition` |
| `/spans` | GET | NDJSON stream | Params: `orderBy`, `direction`, `condition` |
| `/traces/{id}` | GET | Single JSON object | Full trace forest, not streamed |
| `/traces/count` | GET | JSON array of `{start_time, count}` | Params: `interval` (Go duration, min `1s`), `start`, `end` (RFC3339). Used by the Stats tab. See the [backend README](../README.md#get-tracescount) |

- `orderBy`: `start_time`, `duration_ns`, `span_count` (`span_count` is traces-only).
- `direction`: `ASC` or `DESC` (backend default: `DESC`).
- `condition`: raw SQL WHERE fragment — the backend prepends `WHERE`.
- Durations are in **nanoseconds** (uint64).
- The backend has no authentication or CORS headers; the dev proxy handles the latter in development.
- gRPC on `:4317` is ingest-only and is never called by the UI.

**JSON field names:** list endpoints use `snake_case`. The `GET /traces/{id}` response uses `PascalCase` outer keys (`TraceId`, `RootName`, `ServiceName`, `StartTime`, `DurationNs`, `Roots`) with `snake_case` inside each `Span` object. The mapper layer normalizes both to camelCase before any component sees them.

---

## Dev setup

### Prerequisites

- Node.js (LTS)
- Angular CLI 22: `npm install -g @angular/cli`
- The Strider Go backend (see the parent repo)

### Font files

Clash Display ships as `public/fonts/ClashDisplay-Variable.woff2` and is included in this repo.

Commit Mono ships as OTF (`public/fonts/CommitMono-Regular.otf`, `public/fonts/CommitMono-Bold.otf`). The stylesheet has woff2 paths pre-wired; to enable woff2 rendering (smaller, faster), drop `CommitMono-Regular.woff2` and `CommitMono-Bold.woff2` into `public/fonts/`. If any font file is missing the app falls back to a system grotesque / mono stack. See `public/fonts/README.md` for details.

### Install

```bash
npm install
```

### Run

1. Start the Go backend on `:8080`. To seed ~1,000 spans for development:
   ```bash
   MOCK_DATA=true go run ./cmd/strider
   ```
2. Start the Angular dev server (proxies `/traces` and `/spans` to `:8080` via `proxy.conf.json`):
   ```bash
   npm start
   ```
3. Open `http://localhost:4200`.

### Build

```bash
npm run build
```

Output goes to `dist/`.

### Test

```bash
npm test
```

Runs 154 unit tests with Vitest + jsdom. Pure-function core logic (mappers, duration util, SQL compiler, waterfall math) is tested without TestBed.

> **Note:** CDK virtual-scroll DOM windowing is not exercised by jsdom. Confirm correct rendering with a browser or Playwright smoke test after any changes to the result-list component.

---

## Known limitations / tech debt

The following items were accepted as deferred tech debt after QA and are recorded here so they are not lost.

1. **Reactive-contract smell in `ndjson-stream.service.ts`** — the service mutates signals and calls `AbortController.abort()` inside a `_rows.update()` callback. This works but violates the expected contract that `update()` callbacks are pure.
2. **Duplicated row-cap logic in `ndjson-stream.service.ts`** — the 10,000-row cap check is repeated across the batch path and the trailing-line path. Both enforce the same constant (`STREAM_ROW_CAP`) but the logic is not shared.

3. **Duplicated HTTP error util and styles in the Stats tab** — `features/explore/stats/stats-http-error.util.ts` and the Stats stylesheets repeat logic and styles that exist elsewhere in the app. Consolidation is deferred.

Additionally, the raw manual-condition filter passes the user's input directly to the backend as a SQL WHERE fragment. This is intentional for the local, auth-free deployment context. Any multi-user or public deployment must add server-side sanitisation before that parameter reaches the database.
