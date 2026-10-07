package db

import (
	"context"
	"fmt"
	"iter"
	"log/slog"
	"os"
	"strconv"
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
)

const (
	defaultFlushInterval = 10 * time.Second
	defaultMaxBufSize    = 10_000
	defaultTimeout       = 5 * time.Second
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
	conn       clickhouse.Conn
	mu         sync.Mutex
	buf        []traces.Span
	interval   time.Duration
	maxBufSize int
	timeout    time.Duration
}

func New() (*DB, error) {
	url := os.Getenv(dbURLVar)
	if url == "" {
		return nil, fmt.Errorf("%s env var not set", dbURLVar)
	}

	timeout := defaultTimeout
	if v := os.Getenv("DB_TIMEOUT"); v != "" {
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
		conn:       conn,
		interval:   interval,
		maxBufSize: maxBufSize,
		timeout:    timeout,
	}

	if err := d.migrate(context.Background()); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return d, nil
}

func (d *DB) Close() error {
	return d.conn.Close()
}

func (d *DB) migrate(ctx context.Context) error {
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
			resource_attributes Map(String, String)
		) ENGINE = MergeTree()
		ORDER BY (service_name, start_time, trace_id, span_id)
		`
	const createTraceSummaryTable = `
		CREATE TABLE IF NOT EXISTS trace_summary (
			trace_id     String,
			root_name    String,
			service_name LowCardinality(String),
			start_time   DateTime64(9),
			duration_ns  UInt64,
			span_count   UInt64
		) ENGINE = ReplacingMergeTree()
		ORDER BY (trace_id)
		TTL toDateTime(start_time) + INTERVAL 7 DAY
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
			count(*)                                  AS span_count
		FROM spans
		GROUP BY trace_id
		`
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

func (d *DB) saveSpans(ctx context.Context, spans []traces.Span) error {
	batch, err := d.conn.PrepareBatch(ctx, "INSERT INTO spans")
	if err != nil {
		return fmt.Errorf("prepare batch: %w", err)
	}

	for _, s := range spans {
		if err := batch.AppendStruct(&s); err != nil {
			return fmt.Errorf("append span %s: %w", s.SpanId, err)
		}
	}

	return batch.Send()
}

// findAll streams rows of T from the query built by buildListQuery. Iteration stops
// early when the caller breaks. Errors are yielded as the second value, after which
// the iterator yields no further values.
func findAll[T any](
	ctx context.Context,
	d *DB,
	prefix string,
	orderBy OrderByField,
	direction Direction,
	condition string,
) iter.Seq2[T, error] {
	return func(yield func(T, error) bool) {
		var zero T
		q := d.buildListQuery(prefix, orderBy, direction, condition)

		rows, err := d.conn.Query(ctx, q)
		if err != nil {
			yield(zero, fmt.Errorf("query: %w", err))
			return
		}
		defer rows.Close()

		for rows.Next() {
			var row T
			if err := rows.ScanStruct(&row); err != nil {
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

// FindAllTraces streams trace summaries one by one. Iteration stops early when
// the caller breaks. Errors are yielded as the second value, after which the
// iterator yields no further values.
func (d *DB) FindAllTraces(
	ctx context.Context,
	orderBy OrderByField,
	direction Direction,
	condition string,
) iter.Seq2[traces.TraceSummary, error] {
	return findAll[traces.TraceSummary](
		ctx, d, `SELECT * FROM trace_summary FINAL `, orderBy, direction, condition,
	)
}

// FindAllSpans streams span summaries one by one. Iteration stops early when the
// caller breaks. Errors are yielded as the second value, after which the iterator
// yields no further values. OrderBySpanCount is normalized to OrderByStartTime
// because span_count is not a column on the spans table.
func (d *DB) FindAllSpans(
	ctx context.Context,
	orderBy OrderByField,
	direction Direction,
	condition string,
) iter.Seq2[traces.SpanSummary, error] {
	if orderBy == OrderBySpanCount {
		orderBy = OrderByStartTime
	}
	return findAll[traces.SpanSummary](
		ctx, d,
		`SELECT trace_id, span_id, service_name, name, kind, start_time, duration_ns, status_code FROM spans `,
		orderBy, direction, condition,
	)
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
) string {
	if orderBy == "" {
		orderBy = OrderByStartTime
	}
	if direction == "" {
		direction = Desc
	}
	return prefix + d.buildWhere(condition) +
		` ORDER BY ` + string(orderBy) + ` ` + string(direction)
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
