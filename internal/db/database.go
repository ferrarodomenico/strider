package db

import (
	"context"
	"fmt"
	"iter"
	"log/slog"
	"os"
	"strconv"
	"strider/internal/event"
	"strider/internal/traces"
	"strings"
	"sync"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
)

const (
	dbURLVar         = "DB_URL"
	flushIntervalVar = "FLUSH_INTERVAL"
	maxBufSizeVar    = "MAX_BUFFER_SIZE"
	mockDataVar      = "MOCK_DATA"
	dbTimeoutVar     = "DB_TIMEOUT"
)

const (
	defaultFlushInterval = 10 * time.Second
	defaultMaxBufSize    = 10_000
	defaultTimeout       = 1 * time.Minute
)

type OrderByField string
type Direction string

const (
	OrderByStartTime  OrderByField = "start_time"
	OrderByDurationNs OrderByField = "duration_ns"
	OrderBySpanCount  OrderByField = "span_count"
)

const (
	Asc  Direction = "ASC"
	Desc Direction = "DESC"
)

type DB struct {
	conn         clickhouse.Conn
	mu           sync.Mutex
	buf          []traces.Span
	interval     time.Duration
	maxBufSize   int
	timeout      time.Duration
	EventEmitter *event.EventEmitter
}

func New() (*DB, error) {
	url := os.Getenv(dbURLVar)
	if url == "" {
		return nil, fmt.Errorf("%s env var not set", dbURLVar)
	}

	mockValue, mockPresent := os.LookupEnv(mockDataVar)
	seedMock, err := parseMockData(mockValue, mockPresent)
	if err != nil {
		return nil, err
	}

	timeout := defaultTimeout
	if v := os.Getenv(dbTimeoutVar); v != "" {
		if parsed, err := time.ParseDuration(v); err == nil {
			timeout = parsed
		}
	}

	opts, err := clickhouse.ParseDSN(url)
	if err != nil {
		return nil, fmt.Errorf("parse clickhouse dsn: %w", err)
	}

	opts.DialTimeout = timeout
	opts.ReadTimeout = timeout

	conn, err := clickhouse.Open(opts)
	if err != nil {
		return nil, fmt.Errorf("open clickhouse connection: %w", err)
	}

	if err := conn.Ping(context.Background()); err != nil {
		return nil, fmt.Errorf("ping clickhouse: %w", err)
	}

	interval := defaultFlushInterval
	if v := os.Getenv(flushIntervalVar); v != "" {
		if parsed, err := time.ParseDuration(v); err == nil {
			interval = parsed
		}
	}

	maxBufSize := defaultMaxBufSize
	if v := os.Getenv(maxBufSizeVar); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil {
			maxBufSize = parsed
		}
	}

	d := &DB{
		conn:         conn,
		interval:     interval,
		maxBufSize:   maxBufSize,
		timeout:      timeout,
		EventEmitter: event.NewEventEmitter(),
	}

	if err := d.migrate(context.Background()); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	if seedMock {
		if err := d.seedMockData(context.Background()); err != nil {
			return nil, fmt.Errorf("seed mock data: %w", err)
		}
	}

	return d, nil
}

// parseMockData interprets the MOCK_DATA env var. An unset variable means false;
// a set variable (even an empty one) must be a value strconv.ParseBool accepts.
func parseMockData(value string, present bool) (bool, error) {
	if !present {
		return false, nil
	}
	seed, err := strconv.ParseBool(value)
	if err != nil {
		return false, fmt.Errorf("invalid %s %q: %w", mockDataVar, value, err)
	}
	return seed, nil
}

func (d *DB) Close() error {
	return d.conn.Close()
}

const createSpansTable = `
	CREATE TABLE IF NOT EXISTS spans (
		trace_id            String,
		span_id             String,
		parent_span_id      String,
		service_name        LowCardinality(String),
		name                String,
		kind                Int32,
		start_time          DateTime64(9),
		duration_ns         UInt64,
		status_code         Int32,
		status_message      String,
		attributes          Map(String, String),
		resource_attributes Map(String, String),
		ts                  UInt32 DEFAULT toUnixTimestamp(now())
	) ENGINE = MergeTree()
	ORDER BY (service_name, start_time, trace_id, span_id)
	`

// createTraceSummaryTable stores one summary per trace.
//
// trace_summary_mv runs once per INSERT block, so a trace whose spans arrive in several
// inserts produces several partial rows. AggregatingMergeTree combines them on merge (and
// at read time with FINAL) using the function declared on each column:
//
//   - span_count: sum, so partial counts add up to the total.
//   - root fields: max. Partial rows without the root span carry the type default (” or 0,
//     the anyIf default), so the max is always the root's value.
const createTraceSummaryTable = `
	CREATE TABLE IF NOT EXISTS trace_summary (
		trace_id     String,
		root_name    SimpleAggregateFunction(max, String),
		service_name SimpleAggregateFunction(max, String),
		start_time   SimpleAggregateFunction(max, DateTime64(9)),
		duration_ns  SimpleAggregateFunction(max, UInt64),
		span_count   SimpleAggregateFunction(sum, UInt64),
		ts           SimpleAggregateFunction(max, UInt32)
	) ENGINE = AggregatingMergeTree()
	ORDER BY (trace_id)
	`

const createTraceSummaryMV = `
	CREATE MATERIALIZED VIEW IF NOT EXISTS trace_summary_mv
	TO trace_summary
	AS
	SELECT
		trace_id,
		anyIf(name, parent_span_id = '')         AS root_name,
		anyIf(service_name, parent_span_id = '') AS service_name,
		anyIf(start_time, parent_span_id = '')   AS start_time,
		anyIf(duration_ns, parent_span_id = '')  AS duration_ns,
		count(*)                                  AS span_count,
		max(ts)                                   AS ts
	FROM spans
	GROUP BY trace_id
	`

func (d *DB) migrate(ctx context.Context) error {
	if err := d.conn.Exec(ctx, createSpansTable); err != nil {
		return fmt.Errorf("create spans table: %w", err)
	}
	if err := d.conn.Exec(ctx, createTraceSummaryTable); err != nil {
		return fmt.Errorf("create trace_summary table: %w", err)
	}
	if err := d.conn.Exec(ctx, createTraceSummaryMV); err != nil {
		return fmt.Errorf("create trace_summary mv: %w", err)
	}
	return nil
}

// Enqueue appends spans to the in-memory buffer. If the buffer exceeds
// maxBufSize after the append, it is flushed immediately so memory is bounded.
// Safe for concurrent use.
func (d *DB) Enqueue(spans []traces.Span) {
	if len(spans) == 0 {
		return
	}
	d.mu.Lock()
	d.buf = append(d.buf, spans...)
	overflow := len(d.buf) >= d.maxBufSize
	d.mu.Unlock()

	if overflow {
		d.flush(context.Background())
	}
}

// Start runs the periodic flush loop, blocking until ctx is cancelled.
// A final flush is performed on shutdown so no buffered spans are lost.
// Intended to be run in a goroutine: go db.Start(ctx).
func (d *DB) Start(ctx context.Context) {
	ticker := time.NewTicker(d.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			d.flush(ctx)
		case <-ctx.Done():
			d.flush(context.Background())
			return
		}
	}
}

// flush drains the buffer and writes the collected spans to ClickHouse.
// The slice is reinitialised after draining so future appends start fresh.
func (d *DB) flush(ctx context.Context) {
	d.mu.Lock()
	pending := d.buf
	d.buf = nil
	d.mu.Unlock()

	if len(pending) == 0 {
		return
	}

	if err := d.saveSpans(ctx, pending); err != nil {
		slog.Error("span flush failed", "spans", len(pending), "err", err)
	}
}

// saveSpans writes spans to ClickHouse using the columnar batch API: one typed slice per
// column, appended in a single call each. This avoids the per-row reflection of
// AppendStruct and matches the native protocol, which is columnar.
func (d *DB) saveSpans(ctx context.Context, spans []traces.Span) error {
	batch, err := d.conn.PrepareBatch(ctx, "INSERT INTO spans ("+spans[0].Columns()+")")
	if err != nil {
		return fmt.Errorf("prepare batch: %w", err)
	}

	n := len(spans)
	var (
		traceIDs      = make([]string, n)
		spanIDs       = make([]string, n)
		parentIDs     = make([]string, n)
		serviceNames  = make([]string, n)
		names         = make([]string, n)
		kinds         = make([]int32, n)
		startTimes    = make([]time.Time, n)
		durations     = make([]uint64, n)
		statusCodes   = make([]int32, n)
		statusMsgs    = make([]string, n)
		attributes    = make([]map[string]string, n)
		resourceAttrs = make([]map[string]string, n)
		tsCol         = make([]uint32, n)
	)
	// One ingestion timestamp per batch; trace_summary_mv takes max(ts) per trace.
	now := uint32(time.Now().Unix())
	for i := range spans {
		s := &spans[i]
		traceIDs[i] = s.TraceId
		spanIDs[i] = s.SpanId
		parentIDs[i] = s.ParentSpanId
		serviceNames[i] = s.ServiceName
		names[i] = s.Name
		kinds[i] = s.Kind
		startTimes[i] = s.StartTime
		durations[i] = s.DurationNs
		statusCodes[i] = s.StatusCode
		statusMsgs[i] = s.StatusMessage
		attributes[i] = s.Attributes
		resourceAttrs[i] = s.ResourceAttributes
		tsCol[i] = now
	}

	// Same order as traces.Span.Columns().
	columns := []any{
		traceIDs, spanIDs, parentIDs, serviceNames, names, kinds,
		startTimes, durations, statusCodes, statusMsgs, attributes, resourceAttrs, tsCol,
	}
	for i, col := range columns {
		if err := batch.Column(i).Append(col); err != nil {
			return fmt.Errorf("append column %d: %w", i, err)
		}
	}

	batchSendErr := batch.Send()
	if batchSendErr == nil {
		d.EventEmitter.Emit() // Notify listeners that new spans have been saved.
	}
	return batchSendErr
}

// countBucketsSQL counts traces per UTC bucket of @interval_s seconds.
//
// The inner query yields one row per trace with its root start, limited to [@start, @end].
// trace_summary_mv writes one row per INSERT block, so until background merges combine
// them, a trace whose spans arrived in several inserts has several partial rows; a partial
// row without the root span carries the zero start_time (anyIf default). The epoch filter
// drops those rows and GROUP BY trace_id dedupes the rest, so the result is the same
// whether or not the parts have been merged yet, without relying on FINAL. Consequence: a
// trace whose root span never reached trace_summary is not counted.
//
// INTERVAL n SECOND in UTC is aligned to multiples of n since the Unix epoch (1h -> :00,
// 24h -> UTC midnight), so the fill STEP lands on bucket starts. WITH FILL deliberately
// has no FROM/TO: only the gaps between the first and last non-empty bucket are filled,
// and no rows in means no rows out.
const countBucketsSQL = `
	SELECT
		toStartOfInterval(toDateTime(trace_start, 'UTC'), INTERVAL @interval_s SECOND, 'UTC') AS bucket_start,
		count() AS trace_count
	FROM (
		SELECT trace_id, min(start_time) AS trace_start
		FROM trace_summary
		WHERE start_time > toDateTime64(0, 9, 'UTC')
		  AND start_time >= @start
		  AND start_time <= @end
		GROUP BY trace_id
	)
	GROUP BY bucket_start
	ORDER BY bucket_start ASC
	WITH FILL STEP INTERVAL @interval_s SECOND`

// CountByInterval returns trace counts per bucket, in ascending order.
//
// Only traces whose start is in [start, end] (inclusive) are counted. Empty buckets between
// the first and the last bucket that contain data are zero-filled. No bucket is returned
// before the first or after the last bucket that contains data, whatever start and end are.
//
// Buckets are UTC and aligned to trace start times (multiples of the interval since the Unix
// epoch), not to start. Each trace counts once, at its root span's start time. A trace with
// no root span in trace_summary has no known start, so it is not counted.
//
// It returns an empty, non-nil slice when no trace matches.
//
// Preconditions, both enforced by the caller: interval >= time.Second (a sub-second
// remainder is truncated), and start is before end.
func (d *DB) CountByInterval(ctx context.Context, interval time.Duration, start, end time.Time) ([]traces.TracesOverInterval, error) {
	buckets := []traces.TracesOverInterval{}
	err := d.conn.Select(ctx, &buckets, countBucketsSQL,
		clickhouse.Named("interval_s", intervalSeconds(interval)),
		clickhouse.DateNamed("start", start.UTC(), clickhouse.NanoSeconds),
		clickhouse.DateNamed("end", end.UTC(), clickhouse.NanoSeconds),
	)
	if err != nil {
		return nil, fmt.Errorf("count by interval: %w", err)
	}

	return buckets, nil
}

// intervalSeconds converts a duration to whole seconds for INTERVAL n SECOND (truncates).
func intervalSeconds(interval time.Duration) int64 {
	return int64(interval / time.Second)
}

// findAll streams rows from table, scanning each one into row. The same row is
// reused for every result: a yielded value is only valid until the next
// iteration. Iteration stops early when the caller breaks. Errors are yielded as
// the second value, after which the iterator yields no further values.
func findAll[T traces.Scannable](
	ctx context.Context,
	d *DB,
	row T,
	table string,
	final bool,
	orderBy OrderByField,
	direction Direction,
	condition string,
	limit uint32,
) iter.Seq2[T, error] {
	return func(yield func(T, error) bool) {
		var zero T
		fields, ptrs := row.Columns()

		from := table
		if final {
			from += " FINAL"
		}
		prefix := "SELECT " + fields + " FROM " + from + " "
		q := d.buildListQuery(prefix, orderBy, direction, condition, limit)

		rows, err := d.conn.Query(ctx, q)
		if err != nil {
			yield(zero, fmt.Errorf("query: %w", err))
			return
		}
		defer rows.Close()

		for rows.Next() {
			if err := rows.Scan(ptrs...); err != nil {
				yield(zero, fmt.Errorf("scan: %w", err))
				return
			}
			if !yield(row, nil) {
				return
			}
		}

		if err := rows.Err(); err != nil {
			yield(zero, fmt.Errorf("rows: %w", err))
		}
	}
}

// FindAllTraces streams trace summaries one by one. FINAL combines the partial rows
// written by trace_summary_mv (see createTraceSummaryTable), so each trace appears once
// with its total span_count. The yielded pointer is reused: it is only valid until the
// next iteration. Iteration stops early when the caller breaks. Errors are yielded as the
// second value, after which the iterator yields no further values.
func (d *DB) FindAllTraces(
	ctx context.Context,
	orderBy OrderByField,
	direction Direction,
	condition string,
	limit uint32,
) iter.Seq2[*traces.TraceSummary, error] {
	return findAll(ctx, d, &traces.TraceSummary{}, "trace_summary", true,
		orderBy, direction, condition, limit)
}

// FindAllSpans streams span summaries one by one. The yielded pointer is reused:
// it is only valid until the next iteration. Iteration stops early when the
// caller breaks. Errors are yielded as the second value, after which the
// iterator yields no further values. OrderBySpanCount is normalized to
// OrderByStartTime because span_count is not a column on the spans table.
func (d *DB) FindAllSpans(
	ctx context.Context,
	orderBy OrderByField,
	direction Direction,
	condition string,
	limit uint32,
) iter.Seq2[*traces.SpanSummary, error] {
	if orderBy == OrderBySpanCount {
		orderBy = OrderByStartTime
	}
	return findAll(ctx, d, &traces.SpanSummary{}, "spans", false,
		orderBy, direction, condition, limit)
}

// FindByTraceId fetches all spans for the given trace id and assembles them
// into a Trace tree. Returns a zero-value Trace (empty TraceId) when no spans exist.
func (d *DB) FindByTraceId(ctx context.Context, traceId string) (traces.Trace, error) {
	var spans []traces.Span
	if err := d.conn.Select(ctx, &spans,
		`SELECT * FROM spans WHERE trace_id = ?`, traceId); err != nil {
		return traces.Trace{}, fmt.Errorf("query spans: %w", err)
	}
	return buildTrace(spans), nil
}

func (d *DB) buildWhere(condition string) string {
	if condition == "" {
		return ""
	}
	if !strings.HasPrefix(condition, "WHERE") {
		condition = "WHERE " + condition
	}
	return condition
}

// buildListQuery composes the full SELECT for a streaming list query: the caller's
// prefix, the optional WHERE clause from condition, and an ORDER BY clause. Empty
// orderBy and direction fall back to the start_time / DESC defaults.
func (d *DB) buildListQuery(
	prefix string,
	orderBy OrderByField,
	direction Direction,
	condition string,
	limit uint32,
) string {
	if orderBy == "" {
		orderBy = OrderByStartTime
	}
	if direction == "" {
		direction = Desc
	}
	query := prefix + d.buildWhere(condition) +
		` ORDER BY ` + string(orderBy) + ` ` + string(direction)
	if limit > 0 {
		query += ` LIMIT ` + strconv.Itoa(int(limit))
	}
	return query
}

func buildTrace(spans []traces.Span) traces.Trace {
	// pass 1: index by spanId
	nodes := make(map[string]*traces.SpanNode, len(spans))
	for i := range spans {
		nodes[spans[i].SpanId] = &traces.SpanNode{Span: spans[i]}
	}

	// pass 2: wire tree and extract trace metadata
	t := traces.Trace{}
	var earliestRoot *traces.Span

	for _, node := range nodes {
		s := node.Span

		if t.TraceId == "" {
			t.TraceId = s.TraceId
		}
		if t.StartTime.IsZero() || s.StartTime.Before(t.StartTime) {
			t.StartTime = s.StartTime
		}

		if s.ParentSpanId == "" {
			t.Roots = append(t.Roots, node)
			if earliestRoot == nil || s.StartTime.Before(earliestRoot.StartTime) {
				earliestRoot = &node.Span
			}
		} else if parent, ok := nodes[s.ParentSpanId]; ok {
			parent.SubSpans = append(parent.SubSpans, node)
		} else {
			t.Roots = append(t.Roots, node)
		}
	}

	if earliestRoot != nil {
		t.RootName = earliestRoot.Name
		t.ServiceName = earliestRoot.ServiceName
		t.DurationNs = earliestRoot.DurationNs
	}

	return t
}
