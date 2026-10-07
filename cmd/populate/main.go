package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"time"

	"strider/internal/db"
	"strider/internal/server"
	"strider/internal/traces"
)

func main() {
	os.Exit(run())
}

func run() int {
	database, err := db.New()
	if err != nil {
		slog.Error("init db", "err", err)
		return 1
	}
	defer database.Close()

	// Boot both servers on ephemeral loopback ports so populate never collides
	// with a running main server or a parallel populate run.
	if _, grpcShutdown, err := server.StartGRPC(database, "127.0.0.1:0"); err != nil {
		slog.Error("start grpc", "err", err)
		return 1
	} else {
		defer grpcShutdown()
	}

	httpAddr, httpShutdown, err := server.StartHTTP(database, "127.0.0.1:0")
	if err != nil {
		slog.Error("start http", "err", err)
		return 1
	}
	defer httpShutdown()

	baseURL := "http://" + httpAddr

	// Populate, then flush synchronously so trace_summary is queryable.
	spans := generateSpans()
	database.Enqueue(spans)
	flushCtx, cancel := context.WithCancel(context.Background())
	cancel()
	database.Start(flushCtx) // cancelled ctx => immediate, synchronous final flush
	slog.Info("populated", "spans", len(spans))

	generated := traceIdSet(spans)
	spanIds := spanIdSet(spans)

	// Check A -> traceId used by Check B.
	traceID, ok := checkListTraces(baseURL, generated)
	if !ok {
		return 1
	}
	if !checkGetTrace(baseURL, traceID) {
		return 1
	}
	if !checkListSpans(baseURL, spanIds) {
		return 1
	}
	return 0
}

func traceIdSet(spans []traces.Span) map[string]struct{} {
	ids := make(map[string]struct{})
	for _, s := range spans {
		ids[s.TraceId] = struct{}{}
	}
	return ids
}

func spanIdSet(spans []traces.Span) map[string]struct{} {
	ids := make(map[string]struct{})
	for _, s := range spans {
		ids[s.SpanId] = struct{}{}
	}
	return ids
}

func checkListTraces(baseURL string, generated map[string]struct{}) (string, bool) {
	const name = "GET /traces"
	const minExpectedTraces = 4

	resp, err := http.Get(baseURL + "/traces")
	if err != nil {
		slog.Error("FAIL", "check", name, "err", err)
		return "", false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		slog.Error("FAIL", "check", name, "status", resp.StatusCode)
		return "", false
	}

	var firstID string
	lines := 0
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		var ts traces.TraceSummary
		if err := json.Unmarshal(scanner.Bytes(), &ts); err != nil {
			slog.Error("FAIL", "check", name, "line", lines+1, "err", err)
			return "", false
		}
		if lines == 0 {
			firstID = ts.TraceId
		}
		lines++
	}
	if err := scanner.Err(); err != nil {
		slog.Error("FAIL", "check", name, "err", err)
		return "", false
	}
	if lines < minExpectedTraces {
		slog.Error("FAIL", "check", name, "reason", "too few lines", "got", lines, "want", minExpectedTraces)
		return "", false
	}
	if _, found := generated[firstID]; !found {
		slog.Error("FAIL", "check", name, "reason", "trace_id not among generated", "trace_id", firstID)
		return "", false
	}

	slog.Info("PASS", "check", name, "lines", lines)
	return firstID, true
}

func checkGetTrace(baseURL, traceID string) bool {
	const name = "GET /traces/{id}"

	resp, err := http.Get(baseURL + "/traces/" + traceID)
	if err != nil {
		slog.Error("FAIL", "check", name, "err", err)
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		slog.Error("FAIL", "check", name, "status", resp.StatusCode)
		return false
	}

	var trace traces.Trace
	if err := json.NewDecoder(resp.Body).Decode(&trace); err != nil {
		slog.Error("FAIL", "check", name, "err", err)
		return false
	}
	if trace.TraceId != traceID {
		slog.Error("FAIL", "check", name, "want", traceID, "got", trace.TraceId)
		return false
	}

	slog.Info("PASS", "check", name, "trace_id", traceID)
	return true
}

func checkListSpans(baseURL string, generatedSpanIds map[string]struct{}) bool {
	const name = "GET /spans"

	resp, err := http.Get(baseURL + "/spans")
	if err != nil {
		slog.Error("FAIL", "check", name, "err", err)
		return false
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		slog.Error("FAIL", "check", name, "status", resp.StatusCode)
		return false
	}

	found := make(map[string]struct{}, len(generatedSpanIds))
	lines := 0
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		var ss traces.SpanSummary
		if err := json.Unmarshal(scanner.Bytes(), &ss); err != nil {
			slog.Error("FAIL", "check", name, "line", lines+1, "err", err)
			return false
		}
		if _, ok := generatedSpanIds[ss.SpanId]; ok {
			found[ss.SpanId] = struct{}{}
		}
		lines++
	}
	if err := scanner.Err(); err != nil {
		slog.Error("FAIL", "check", name, "err", err)
		return false
	}
	if len(found) < len(generatedSpanIds) {
		slog.Error("FAIL", "check", name, "reason", "not all generated spans returned", "got", len(found), "want", len(generatedSpanIds))
		return false
	}

	slog.Info("PASS", "check", name, "lines", lines)
	return true
}

// generateSpans produces a small set of realistic traces across three services.
func generateSpans() []traces.Span {
	now := time.Now()
	var spans []traces.Span

	type traceSpec struct {
		service    string
		name       string
		durationMs int64
		attrs      map[string]string
	}

	traceTemplates := [][]traceSpec{
		// Trace 1: frontend → api → db
		{
			{service: "frontend", name: "GET /users", durationMs: 120, attrs: map[string]string{"http.method": "GET", "http.route": "/users", "http.status_code": "200"}},
			{service: "api", name: "users.list", durationMs: 80, attrs: map[string]string{"rpc.method": "ListUsers"}},
			{service: "database", name: "SELECT users", durationMs: 30, attrs: map[string]string{"db.system": "clickhouse", "db.statement": "SELECT * FROM users"}},
		},
		// Trace 2: frontend → api (auth flow)
		{
			{service: "frontend", name: "POST /login", durationMs: 95, attrs: map[string]string{"http.method": "POST", "http.route": "/login", "http.status_code": "200"}},
			{service: "api", name: "auth.login", durationMs: 60, attrs: map[string]string{"rpc.method": "Login"}},
		},
		// Trace 3: frontend → api → db (single item fetch)
		{
			{service: "frontend", name: "GET /users/42", durationMs: 55, attrs: map[string]string{"http.method": "GET", "http.route": "/users/:id", "http.status_code": "200"}},
			{service: "api", name: "users.get", durationMs: 40, attrs: map[string]string{"rpc.method": "GetUser"}},
			{service: "database", name: "SELECT user", durationMs: 12, attrs: map[string]string{"db.system": "clickhouse", "db.statement": "SELECT * FROM users WHERE id = ?"}},
		},
		// Trace 4: background job
		{
			{service: "worker", name: "job.process", durationMs: 300, attrs: map[string]string{"job.type": "email_digest"}},
			{service: "database", name: "SELECT pending_jobs", durationMs: 20, attrs: map[string]string{"db.system": "clickhouse"}},
			{service: "worker", name: "email.send", durationMs: 250, attrs: map[string]string{"email.recipient_count": "42"}},
		},
	}

	resourceAttrs := func(service string) map[string]string {
		return map[string]string{
			"service.name":    service,
			"service.version": "1.0.0",
			"deployment.env":  "test",
		}
	}

	for _, tmpl := range traceTemplates {
		traceID := randHex(16)
		cursor := now

		// first span is the root; each subsequent one is a child of the previous
		parentID := ""
		for _, spec := range tmpl {
			spanID := randHex(8)
			dur := time.Duration(spec.durationMs) * time.Millisecond
			spans = append(spans, traces.Span{
				TraceId:            traceID,
				SpanId:             spanID,
				ParentSpanId:       parentID,
				ServiceName:        spec.service,
				Name:               spec.name,
				Kind:               1,
				StartTime:          cursor,
				DurationNs:         uint64(dur.Nanoseconds()),
				StatusCode:         1,
				Attributes:         spec.attrs,
				ResourceAttributes: resourceAttrs(spec.service),
			})
			parentID = spanID
			cursor = cursor.Add(2 * time.Millisecond) // small offset so children start after parent
		}

		now = now.Add(-500 * time.Millisecond) // space traces apart in time
	}

	return spans
}

func randHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return hex.EncodeToString(b)
}
