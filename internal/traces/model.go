package traces

import (
	"fmt"
	"strconv"
	"time"

	"encoding/hex"

	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
)

type SpanInterface interface {
	TraceId() string
	SpanId() string
	ParentSpanId() string
	ServiceName() string
	Name() string
	Kind() int32
	StartTime() time.Time
	DurationNs() uint64
	StatusCode() int32
	StatusMessage() string
	Attributes() map[string]string
	ResourceAttributes() map[string]string
	SubSpans() []*Span
}

type Trace struct {
	TraceId     string
	RootName    string
	ServiceName string
	StartTime   time.Time
	DurationNs  uint64
	Roots       []*SpanNode
}

type TraceSummary struct {
	TraceId     string    `json:"trace_id" ch:"trace_id"`
	RootName    string    `json:"root_name" ch:"root_name"`
	ServiceName string    `json:"service_name" ch:"service_name"`
	StartTime   time.Time `json:"start_time" ch:"start_time"`
	DurationNs  uint64    `json:"duration_ns" ch:"duration_ns"`
	SpanCount   uint64    `json:"span_count" ch:"span_count"`
}

type Span struct {
	TraceId            string            `json:"trace_id" ch:"trace_id"            `
	SpanId             string            `json:"span_id" ch:"span_id"             `
	ParentSpanId       string            `json:"parent_span_id" ch:"parent_span_id"      `
	ServiceName        string            `json:"service_name" ch:"service_name"        `
	Name               string            `json:"name" ch:"name"                `
	Kind               int32             `json:"kind" ch:"kind"                `
	StartTime          time.Time         `json:"start_time" ch:"start_time"          `
	DurationNs         uint64            `json:"duration_ns" ch:"duration_ns"         `
	StatusCode         int32             `json:"status_code" ch:"status_code"         `
	StatusMessage      string            `json:"status_message" ch:"status_message"      `
	Attributes         map[string]string `json:"attributes" ch:"attributes"          `
	ResourceAttributes map[string]string `json:"resource_attributes" ch:"resource_attributes" `
}

type SpanNode struct {
	Span     Span
	SubSpans []*SpanNode
}

type SpanSummary struct {
	TraceId     string    `json:"trace_id" ch:"trace_id"`
	SpanId      string    `json:"span_id" ch:"span_id"`
	ServiceName string    `json:"service_name" ch:"service_name"`
	Name        string    `json:"name" ch:"name"`
	Kind        int32     `json:"kind" ch:"kind"`
	StartTime   time.Time `json:"start_time" ch:"start_time"`
	DurationNs  uint64    `json:"duration_ns" ch:"duration_ns"`
	StatusCode  int32     `json:"status_code" ch:"status_code"`
}

func NewSpan(span *tracepb.Span, serviceName string, resourceAttrs map[string]string) Span {
	var statusCode int32
	var statusMessage string
	if span.Status != nil {
		statusCode = int32(span.Status.Code)
		statusMessage = span.Status.Message
	}

	return Span{
		TraceId:            encodeToString(span.TraceId),
		SpanId:             encodeToString(span.SpanId),
		ParentSpanId:       encodeToString(span.ParentSpanId),
		ServiceName:        serviceName,
		Name:               span.Name,
		Kind:               int32(span.Kind),
		StartTime:          time.Unix(0, int64(span.StartTimeUnixNano)),
		DurationNs:         span.EndTimeUnixNano - span.StartTimeUnixNano,
		StatusCode:         statusCode,
		StatusMessage:      statusMessage,
		Attributes:         extractAttributes(span.Attributes),
		ResourceAttributes: resourceAttrs,
	}
}

func encodeToString(src []byte) string {
	if src == nil {
		return ""
	}
	return hex.EncodeToString(src)
}

func extractAttributes(kvs []*commonpb.KeyValue) map[string]string {
	if len(kvs) == 0 {
		return nil
	}
	attrs := make(map[string]string, len(kvs))
	for _, kv := range kvs {
		if kv != nil {
			attrs[kv.Key] = anyValueToString(kv.Value)
		}
	}
	return attrs
}

func anyValueToString(v *commonpb.AnyValue) string {
	if v == nil {
		return ""
	}
	switch val := v.Value.(type) {
	case *commonpb.AnyValue_StringValue:
		return val.StringValue
	case *commonpb.AnyValue_IntValue:
		return strconv.FormatInt(val.IntValue, 10)
	case *commonpb.AnyValue_DoubleValue:
		return strconv.FormatFloat(val.DoubleValue, 'f', -1, 64)
	case *commonpb.AnyValue_BoolValue:
		return strconv.FormatBool(val.BoolValue)
	default:
		return fmt.Sprintf("%v", v)
	}
}
