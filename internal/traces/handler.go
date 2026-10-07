package traces

import (
	"context"

	collectortracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
)

// Handler implements the OTLP gRPC TraceService.
// It takes an enqueue func to decouple from the db package and avoid import cycles.
type Handler struct {
	collectortracepb.UnimplementedTraceServiceServer
	enqueue func([]Span)
}

func NewHandler(enqueue func([]Span)) *Handler {
	return &Handler{enqueue: enqueue}
}

func (h *Handler) Export(_ context.Context, req *collectortracepb.ExportTraceServiceRequest) (*collectortracepb.ExportTraceServiceResponse, error) {
	for _, rs := range req.ResourceSpans {
		h.enqueue(flatten(rs))
	}
	return &collectortracepb.ExportTraceServiceResponse{}, nil
}

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
