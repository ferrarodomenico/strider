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
| `MOCK_DATA` | `false` | Seeds mock traces on startup when `true`. Accepts Go `strconv.ParseBool` values (`1`, `t`, `T`, `TRUE`, `true`, `True`, `0`, `f`, `F`, `FALSE`, `false`, `False`); unset means `false`. An empty or invalid value makes Strider exit with a non-zero code before connecting to ClickHouse. |
| `GRPC_MAX_RECV_ENABLED` | `false` | Enables the OTLP gRPC receive-size limit. Accepts Go `strconv.ParseBool` values (`1`, `t`, `T`, `TRUE`, `true`, `True`, `0`, `f`, `F`, `FALSE`, `false`, `False`); empty means `false`. While `false` there is no limit (messages up to 2,147,483,647 bytes are accepted). |
| `GRPC_MAX_RECV_SIZE` | `100MB` | Largest gRPC message accepted when `GRPC_MAX_RECV_ENABLED=true`; ignored otherwise. See [gRPC receive limit](#grpc-receive-limit). |

### gRPC receive limit

`GRPC_MAX_RECV_SIZE` has the format `<number>[unit]`:

- `<number>` is digits or digits.digits (`100`, `1.5`), with no sign and no spaces. `-5`, `1 MB`, `1.` and `.5MB` are rejected.
- Units are case-insensitive and 1024-based: `KB`/`KiB` = 1,024 bytes, `MB`/`MiB` = 1,048,576 bytes, `GB`/`GiB` = 1,073,741,824 bytes. No unit means bytes.
- Decimals are floored to whole bytes: `1.5MB` = 1,572,864 bytes; `1.5` = 1 byte.
- After flooring, the value must be between 1 and 2,147,483,647 bytes inclusive, so `0.5` and `2GB` are rejected. `2047MB` is the largest whole-MB value.
- Empty means `100MB` (104,857,600 bytes).

An invalid `GRPC_MAX_RECV_ENABLED`, or an invalid `GRPC_MAX_RECV_SIZE` while the limit is enabled, makes Strider exit with a non-zero code before any listener is bound. The error names the variable and the value.

A message larger than the limit is rejected with gRPC status `RESOURCE_EXHAUSTED`; a message exactly at the limit is accepted. The limit applies to receiving only. The HTTP API is unaffected. `cmd/populate` applies the same variables.

> **Memory caveat:** with the limit disabled (the default), a single Export request can make Strider allocate up to ~2 GiB, more once decoded. Set `GRPC_MAX_RECV_ENABLED=true` whenever the gRPC port is reachable by untrusted clients.

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

### GET /traces/count

Returns the number of traces per time bucket as a JSON array, in ascending bucket order.

**Query parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `interval` | Go duration (`30m`, `1h`, `24h`) | `1h` | Bucket width. Minimum `1s`; truncated to whole seconds. |
| `start` | RFC3339 | now minus 1 year | Inclusive lower bound on trace start time. |
| `end` | RFC3339 | now | Inclusive upper bound on trace start time. |

**Response fields (one object per bucket):**

| JSON key | Type | Description |
|---|---|---|
| `start_time` | string (RFC3339, UTC) | Start of the bucket |
| `count` | number | Traces that started in the bucket |

**Behavior:**

- Each trace counts once, at its root span's start time. Traces without a root span are not counted.
- Buckets are UTC and aligned to multiples of `interval` since the Unix epoch, not to `start`.
- Buckets with no traces are zero-filled only between the first and last bucket that contain data. No bucket appears before the first or after the last data bucket.
- HTTP 200 + `[]` when no trace matches.
- HTTP 400 when `start`, `end`, or `interval` is unparsable, `interval` is under `1s`, or `start` is not before `end`.
- HTTP 500 when the query fails.

**Example:**

```
GET /traces/count?interval=1h&start=2026-10-16T00:00:00Z&end=2026-10-16T03:00:00Z

[{"start_time":"2026-10-16T00:00:00Z","count":4},{"start_time":"2026-10-16T01:00:00Z","count":0},{"start_time":"2026-10-16T02:00:00Z","count":7}]
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
