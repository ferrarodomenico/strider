package db

import (
	"context"
	"fmt"
	"iter"
	"log/slog"
	"os"
	"strconv"
	"sync"
	"time"

	"strider/internal/traces"

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
)

type DB struct {
	conn       clickhouse.Conn
	mu         sync.Mutex
	buf        []traces.Span
	interval   time.Duration
	maxBufSize int
}

func New() (*DB, error) {
	url := os.Getenv(dbURLVar)
	if url == "" {
		return nil, fmt.Errorf("%s env var not set", dbURLVar)
	}

	opts, err := clickhouse.ParseDSN(url)
	if err != nil {
		return nil, fmt.Errorf("parse clickhouse dsn: %w", err)
	}

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
	}

	if err := d.migrate(context.Background()); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return d, nil
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
    resource_attributes Map(String, String)
) ENGINE = MergeTree()
ORDER BY (service_name, start_time, trace_id, span_id)
`

func (d *DB) migrate(ctx context.Context) error {
	return d.conn.Exec(ctx, createSpansTable)
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

// SpanField identifies which column FindById searches by.
type SpanField string

const (
	ByTraceId SpanField = "trace_id"
	BySpanId  SpanField = "span_id"
)

// FindAll streams all spans one by one. Iteration stops early when
// the caller breaks. Errors are yielded as the second value.
func (d *DB) FindAll(ctx context.Context) iter.Seq2[traces.SpanSummary, error] {
	return func(yield func(traces.SpanSummary, error) bool) {
		const q = `SELECT trace_id, span_id, service_name, name, kind, start_time, duration_ns, status_code FROM spans`
		rows, err := d.conn.Query(ctx, q)
		if err != nil {
			yield(traces.SpanSummary{}, fmt.Errorf("query: %w", err))
			return
		}
		defer rows.Close()

		for rows.Next() {
			var s traces.SpanSummary
			if err := rows.ScanStruct(&s); err != nil {
				yield(traces.SpanSummary{}, fmt.Errorf("scan: %w", err))
				return
			}
			if !yield(s, nil) {
				return
			}
		}

		if err := rows.Err(); err != nil {
			yield(traces.SpanSummary{}, fmt.Errorf("rows: %w", err))
		}
	}
}

// FindById returns all spans matching id in the given field.
func (d *DB) FindById(ctx context.Context, id string, field SpanField) ([]traces.Span, error) {
	q := fmt.Sprintf(`SELECT * FROM spans WHERE %s = ?`, field)

	var result []traces.Span
	if err := d.conn.Select(ctx, &result, q, id); err != nil {
		return nil, fmt.Errorf("query: %w", err)
	}

	return result, nil
}
