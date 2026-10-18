# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added — Stats tab: traces over interval

- `strider-ui` has a new "Stats" tab next to Traces and Spans. The view mode is stored in the `?mode=traces|spans|stats` URL parameter, and the trace-detail Back link keeps the mode.
- The Stats tab shows a lazy-loaded Chart.js line chart of trace counts over time. Controls: interval (number plus minute, hour, or day unit), optional start and end, and Apply. The tab has inline validation and loading, empty, and error states. New dependency: `chart.js` ^4.
- `GET /traces/count?interval=<go duration>&start=<RFC3339>&end=<RFC3339>` returns a JSON array of `{start_time, count}` buckets. Defaults are interval `1h`, start now minus 1 year, and end now. An unparsable `start`, `end`, or `interval`, an `interval` under 1s, or `start` not before `end` returns 400.
- `DB.CountByInterval` fixed: it counts each trace once by `trace_id` using its earliest real `start_time`, skips traces with no root span, buckets in UTC with `INTERVAL n SECOND` (the interval is truncated to whole seconds), and filters `start_time >= start AND start_time <= end`. It zero-fills only gaps between data buckets (`WITH FILL STEP` without `FROM`/`TO`).
- Known follow-ups: integration test for `CountByInterval`; clamping of start, end, and bucket count; consolidating the duplicated HTTP error util and styles in `strider-ui`.

### Added — Streaming `GET /traces` (NDJSON)

- `GET /traces` now streams results as NDJSON (`Content-Type: application/x-ndjson`), one `TraceSummary` JSON object per line. The response begins flowing immediately; the client does not wait for the full result set.
- `TraceSummary` JSON keys are now snake_case (`trace_id`, `root_name`, `service_name`, `start_time`, `duration_ns`, `span_count`).
- `DB.FindAllTraces` now returns `iter.Seq2[traces.TraceSummary, error]` (was a buffered `[]TraceSummary`), mirroring the existing `DB.FindAll` iterator.
- `DB.FindAll` refactored internally to reuse `buildWhere`; behavior is unchanged.
- New `internal/server` package (`StartGRPC`, `StartHTTP`) extracts server bootstrap from `cmd/main.go` so both `cmd/main` and `cmd/populate` share the same wiring without duplication.
- `cmd/populate` rewritten as a self-contained smoke-test harness: boots gRPC and HTTP servers in-process on ephemeral loopback ports, inserts sample traces, asserts `GET /traces` (>= 4 NDJSON lines) and `GET /traces/{id}` (matching `trace_id`), logs PASS/FAIL per check, and exits 0 on success or 1 on any failure.
