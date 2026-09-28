package traces

import (
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
)

func flatten(rs *tracepb.ResourceSpans) []Span {
	var serviceName string
	var resourceAttrs map[string]string

	if rs.Resource != nil {
		resourceAttrs = extractAttributes(rs.Resource.Attributes)
		serviceName = resourceAttrs["service.name"]
	}

	var spans []Span
	for _, ss := range rs.ScopeSpans {
		for _, span := range ss.Spans {
			spans = append(spans, NewSpan(span, serviceName, resourceAttrs))
		}
	}
	return spans
}

func buildTrees(spans []Span) map[string][]*Span {
	// index all spans by id
	byId := make(map[string]*Span, len(spans))
	for i := range spans {
		byId[spans[i].SpanId] = &spans[i]
	}

	// collect root spans (no parent, or parent not in this batch) per trace
	roots := make(map[string][]*Span)
	for i := range spans {
		s := &spans[i]
		if s.ParentSpanId == "" {
			roots[s.TraceId] = append(roots[s.TraceId], s)
			continue
		}
		parent, ok := byId[s.ParentSpanId]
		if !ok {
			// orphan: parent missing from batch, treat as root
			roots[s.TraceId] = append(roots[s.TraceId], s)
			continue
		}
		parent.SubSpans = append(parent.SubSpans, s)
	}

	return roots // map[traceId] -> slice of root spans for that trace
}
