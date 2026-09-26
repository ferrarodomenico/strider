package traces

import (
	"encoding/hex"
	"time"

	tracepb "go.opentelemetry.io/proto/otlp/trace/v1" // ResourceSpans, ScopeSpans, Span, Status
	// commonpb "go.opentelemetry.io/proto/otlp/common/v1"   // KeyValue, AnyValue (per gli attributi)
)

type Span struct {
	TraceId            string
	SpanId             string
	ParentSpanId       string
	ServiceName        string
	Name               string
	Kind               int8
	StartTime          time.Time
	DurationNs         uint64
	StatusCode         int8
	StatusMessage      string
	Attributes         map[string]string
	ResourceAttributes map[string]string
}

func newSpan(span *tracepb.Span, serviceName string) Span {
	return Span{
		TraceId:            encodeToString(span.TraceId),
		SpanId:             encodeToString(span.SpanId),
		ParentSpanId:       encodeToString(span.ParentSpanId),
		ServiceName:        serviceName,
		Name:               span.Name,
		Kind:               span.Kind,
		StartTime:          span.StartTime,
		DurationNs:         span.DurationNs,
		StatusCode:         span.StatusCode,
		StatusMessage:      span.StatusMessage,
		Attributes:         span.Attributes,
		ResourceAttributes: span.ResourceAttributes,
	}
}

type Trace map[string]Span

func encodeToString(src []byte) string {
	if src == nil {
		return ""
	}
	return hex.EncodeToString(src)
}
