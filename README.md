# Strider

A tracing backend that receives OpenTelemetry spans via gRPC and exposes an HTTP query API backed by ClickHouse.

## Architecture

| Package | Responsibility |
|---|---|
| `internal/db` | ClickHouse connection, buffered span ingestion, trace queries |
| `internal/traces` | Domain types (`Span`, `Trace`, `TraceSummary`) and gRPC handler |
| `internal/server` | HTTP and gRPC server bootstrap (`StartHTTP`, `StartGRPC`) and HTTP handlers |
| `cmd` | Main entrypoint — reads config, starts servers, handles shutdown |
| `cmd/populate` | Smoke-test harness — boots servers in-process, inserts sample data, asserts both HTTP endpoints |

## Prerequisites

- Go 1.23+
- Docker (for ClickHouse)

## Running

**Start ClickHouse:**

```
make docker-up
```

**Build and run the server:**

```
make run
```

The server reads its listen addresses from environment variables. When unset, defaults apply.

| Variable | Default | Purpose |
|---|---|---|
| `GRPC_ADDR` | `:4317` | OTLP gRPC ingestion |
| `HTTP_ADDR` | `:8080` | HTTP query API |
| `DB_URL` | — | ClickHouse connection URL |
| `FLUSH_INTERVAL` | `10s` | How often buffered spans are flushed to ClickHouse |
| `MAX_BUFFER_SIZE` | `10000` | Max spans buffered before a forced flush |

The server shuts down gracefully on SIGINT or SIGTERM.

## HTTP API

### GET /traces

Returns all trace summaries as NDJSON (`Content-Type: application/x-ndjson`). Each line is one complete JSON object representing a `TraceSummary`. The response streams rows as they arrive from ClickHouse; the client can begin processing lines before the full result set is received.

**Query parameters:**

| Parameter | Type | Description |
|---|---|---|
| `orderBy` | string | Column to sort by (`start_time`, `duration_ns`, `span_count`) |
| `direction` | string | Sort direction (`ASC`, `DESC`) |
| `condition` | string | SQL filter expression appended as a WHERE clause |

> **Non-production caveat:** `orderBy`, `direction`, and `condition` are interpolated directly into SQL. This is an accepted trade-off for a non-production tool (ClickHouse rejects multi-statement queries; the query is a read-only SELECT with a timeout). Do not expose this endpoint on a public network.

**Response behavior:**

- HTTP 200 + NDJSON body when results exist.
- HTTP 200 + empty body when the table is empty.
- HTTP 500 + error message when a query error occurs before any row is written.
- When a query error occurs after rows have already been written, the stream stops and the status remains 200 (already committed); the client receives a partial but valid NDJSON stream.

**TraceSummary fields:**

| JSON key | Type | Description |
|---|---|---|
| `trace_id` | string | Hex-encoded trace identifier |
| `root_name` | string | Name of the root span |
| `service_name` | string | Service that produced the root span |
| `start_time` | string (RFC3339) | Start time of the trace |
| `duration_ns` | number | Total trace duration in nanoseconds |
| `span_count` | number | Number of spans in the trace |

**Example (streaming response):**

```
{"trace_id":"abc123","root_name":"GET /api","service_name":"frontend","start_time":"2026-10-04T12:00:00Z","duration_ns":1500000,"span_count":3}
{"trace_id":"def456","root_name":"POST /order","service_name":"checkout","start_time":"2026-10-04T12:00:01Z","duration_ns":800000,"span_count":2}
```

### GET /traces/{id}

Returns the full trace for the given `trace_id` as JSON. Returns HTTP 404 when no trace matches.

## Smoke test

`cmd/populate` is a self-contained integration harness. It boots both servers on ephemeral loopback ports (no external server required), inserts sample traces, then asserts both endpoints and exits 0 on success or 1 on failure.

```
make run-test
```

Or directly after `make docker-up`:

```
go run ./cmd/populate
```

Output logs `PASS` or `FAIL` for each check:

- `GET /traces` — expects HTTP 200 and at least 4 NDJSON lines.
- `GET /traces/{id}` — expects HTTP 200 and a matching `trace_id` in the decoded response.
