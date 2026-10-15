package db

import (
	"context"
	"fmt"
	"math/rand"
	"strider/internal/traces"
	"time"
)

// seedMockData inserts ~1 000 spans spread across realistic traces.
// Traces model a small e-commerce platform:
//
//	api-gateway → auth-service, order-service, payment-service, notification-service
//	Each service may also hit user-service or make a "db.query" child span.
func (d *DB) seedMockData(ctx context.Context) error {
	rng := rand.New(rand.NewSource(42))
	now := time.Now()

	scenarios := []mockScenario{
		{name: "POST /orders", rootSvc: "api-gateway", targetSvc: "order-service", errorRate: 0.05},
		{name: "GET /orders/{id}", rootSvc: "api-gateway", targetSvc: "order-service", errorRate: 0.02},
		{name: "POST /payments", rootSvc: "api-gateway", targetSvc: "payment-service", errorRate: 0.10},
		{name: "GET /users/{id}", rootSvc: "api-gateway", targetSvc: "user-service", errorRate: 0.01},
		{name: "POST /auth/login", rootSvc: "api-gateway", targetSvc: "auth-service", errorRate: 0.08},
	}

	var allSpans []traces.Span
	// ~50 traces × ~20 spans ≈ 1 000 spans
	for i := 0; i < 50; i++ {
		sc := scenarios[rng.Intn(len(scenarios))]
		// spread traces evenly over the last 24 hours
		traceStart := now.Add(-time.Duration(i) * 29 * time.Minute)
		allSpans = append(allSpans, buildMockTrace(rng, sc, traceStart)...)
	}

	if err := d.saveSpans(ctx, allSpans); err != nil {
		return fmt.Errorf("seed mock spans: %w", err)
	}
	return nil
}

type mockScenario struct {
	name      string
	rootSvc   string
	targetSvc string
	errorRate float64
}

func buildMockTrace(rng *rand.Rand, sc mockScenario, start time.Time) []traces.Span {
	traceId := newMockID(rng)
	isError := rng.Float64() < sc.errorRate

	var spans []traces.Span

	// root: api-gateway handler
	rootId := newMockID(rng)
	rootDur := mockJitter(rng, 80*time.Millisecond, 200*time.Millisecond)
	rootStatus := int32(1) // OK
	if isError {
		rootStatus = 2 // ERROR
	}
	spans = append(spans, mockSpan(traceId, rootId, "", sc.rootSvc, sc.name, 2 /*server*/, start, rootDur, rootStatus, ""))

	// auth check (always present)
	authId := newMockID(rng)
	authStart := start.Add(mockJitter(rng, 1*time.Millisecond, 5*time.Millisecond))
	authDur := mockJitter(rng, 4*time.Millisecond, 15*time.Millisecond)
	spans = append(spans, mockSpan(traceId, authId, rootId, "auth-service", "ValidateToken", 3 /*client*/, authStart, authDur, 1, ""))
	spans = append(spans, mockSpan(traceId, newMockID(rng), authId, "auth-service", "db.query SELECT sessions", 1 /*internal*/, authStart.Add(2*time.Millisecond), authDur-4*time.Millisecond, 1, ""))

	// downstream call to target service
	downId := newMockID(rng)
	downStart := authStart.Add(authDur + mockJitter(rng, 1*time.Millisecond, 3*time.Millisecond))
	downDur := mockJitter(rng, 20*time.Millisecond, 120*time.Millisecond)
	downStatus := int32(1)
	downMsg := ""
	if isError {
		downStatus = 2
		downMsg = "internal error"
	}
	spans = append(spans, mockSpan(traceId, downId, rootId, sc.targetSvc, "handle "+sc.name, 2, downStart, downDur, downStatus, downMsg))

	// DB query inside target service
	dbId := newMockID(rng)
	dbStart := downStart.Add(mockJitter(rng, 2*time.Millisecond, 8*time.Millisecond))
	dbDur := mockJitter(rng, 5*time.Millisecond, 40*time.Millisecond)
	spans = append(spans, mockSpan(traceId, dbId, downId, sc.targetSvc, "db.query", 1, dbStart, dbDur, 1, ""))

	// optional second DB call (cache miss path)
	if rng.Float64() < 0.4 {
		spans = append(spans, mockSpan(traceId, newMockID(rng), downId, sc.targetSvc, "db.query SELECT cache", 1, dbStart.Add(dbDur+time.Millisecond), mockJitter(rng, 3*time.Millisecond, 10*time.Millisecond), 1, ""))
	}

	// user-service lookup (sometimes)
	if rng.Float64() < 0.5 {
		uStart := downStart.Add(dbDur + mockJitter(rng, 1*time.Millisecond, 4*time.Millisecond))
		uDur := mockJitter(rng, 6*time.Millisecond, 25*time.Millisecond)
		uId := newMockID(rng)
		spans = append(spans, mockSpan(traceId, uId, downId, "user-service", "GetUser", 3, uStart, uDur, 1, ""))
		spans = append(spans, mockSpan(traceId, newMockID(rng), uId, "user-service", "db.query SELECT users", 1, uStart.Add(2*time.Millisecond), uDur-3*time.Millisecond, 1, ""))
	}

	// notification fan-out (write operations only, no error propagation)
	if sc.name == "POST /orders" || sc.name == "POST /payments" {
		nStart := downStart.Add(downDur - mockJitter(rng, 1*time.Millisecond, 5*time.Millisecond))
		spans = append(spans, mockSpan(traceId, newMockID(rng), downId, "notification-service", "SendEmail", 3, nStart, mockJitter(rng, 10*time.Millisecond, 30*time.Millisecond), 1, ""))
	}

	// background reconciler span (orphan root, detached from main call tree)
	if rng.Float64() < 0.2 {
		rStart := start.Add(mockJitter(rng, 50*time.Millisecond, 150*time.Millisecond))
		spans = append(spans, mockSpan(traceId, newMockID(rng), "", "order-service", "reconcile.run", 1, rStart, mockJitter(rng, 30*time.Millisecond, 80*time.Millisecond), 1, ""))
	}

	return spans
}

func mockJitter(rng *rand.Rand, lo, hi time.Duration) time.Duration {
	return lo + time.Duration(rng.Int63n(int64(hi-lo)))
}

func newMockID(rng *rand.Rand) string {
	b := make([]byte, 8)
	rng.Read(b) //nolint:gosec
	return fmt.Sprintf("%x", b)
}

func mockSpan(
	traceId, spanId, parentId, svc, name string,
	kind int,
	start time.Time,
	dur time.Duration,
	statusCode int32,
	statusMsg string,
) traces.Span {
	return traces.Span{
		TraceId:       traceId,
		SpanId:        spanId,
		ParentSpanId:  parentId,
		ServiceName:   svc,
		Name:          name,
		Kind:          int32(kind),
		StartTime:     start,
		DurationNs:    uint64(dur),
		StatusCode:    statusCode,
		StatusMessage: statusMsg,
		Attributes:    map[string]string{},
		ResourceAttributes: map[string]string{
			"service.name": svc,
		},
	}
}
