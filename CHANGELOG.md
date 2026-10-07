# Changelog

All notable changes to this project are documented here.

## [Unreleased]

### Added — Streaming `GET /traces` (NDJSON)

- `GET /traces` now streams results as NDJSON (`Content-Type: application/x-ndjson`), one `TraceSummary` JSON object per line. The response begins flowing immediately; the client does not wait for the full result set.
- `TraceSummary` JSON keys are now snake_case (`trace_id`, `root_name`, `service_name`, `start_time`, `duration_ns`, `span_count`).
- `DB.FindAllTraces` now returns `iter.Seq2[traces.TraceSummary, error]` (was a buffered `[]TraceSummary`), mirroring the existing `DB.FindAll` iterator.
- `DB.FindAll` refactored internally to reuse `buildWhere`; behavior is unchanged.
- New `internal/server` package (`StartGRPC`, `StartHTTP`) extracts server bootstrap from `cmd/main.go` so both `cmd/main` and `cmd/populate` share the same wiring without duplication.
- `cmd/populate` rewritten as a self-contained smoke-test harness: boots gRPC and HTTP servers in-process on ephemeral loopback ports, inserts sample traces, asserts `GET /traces` (>= 4 NDJSON lines) and `GET /traces/{id}` (matching `trace_id`), logs PASS/FAIL per check, and exits 0 on success or 1 on any failure.
