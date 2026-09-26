package traces

import (
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1" // ResourceSpans, ScopeSpans, Span, Status
	// commonpb "go.opentelemetry.io/proto/otlp/common/v1"   // KeyValue, AnyValue (per gli attributi)
)

func flatten(rs *tracepb.ResourceSpans) []Span {
	var spans []Span
	for _, span := range rs. {
		spans = append(spans, span)
	}
	return spans
}
