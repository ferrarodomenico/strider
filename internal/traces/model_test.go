package traces

import (
	"encoding/json"
	"testing"
	"time"
)

// TestTraceSummaryJSONTags verifies AC 13: all six fields marshal with snake_case keys.
func TestTraceSummaryJSONTags(t *testing.T) {
	ts := TraceSummary{
		TraceId:     "abc123",
		RootName:    "root",
		ServiceName: "svc",
		StartTime:   time.Unix(1700000000, 0).UTC(),
		DurationNs:  999,
		SpanCount:   7,
	}

	b, err := json.Marshal(ts)
	if err != nil {
		t.Fatalf("json.Marshal failed: %v", err)
	}
	raw := string(b)

	wantKeys := []string{
		`"trace_id"`,
		`"root_name"`,
		`"service_name"`,
		`"start_time"`,
		`"duration_ns"`,
		`"span_count"`,
	}
	bannedKeys := []string{
		`"TraceId"`,
		`"RootName"`,
		`"ServiceName"`,
		`"StartTime"`,
		`"DurationNs"`,
		`"SpanCount"`,
	}

	for _, k := range wantKeys {
		if !containsStr(raw, k) {
			t.Errorf("expected key %s in JSON output %s", k, raw)
		}
	}
	for _, k := range bannedKeys {
		if containsStr(raw, k) {
			t.Errorf("unexpected PascalCase key %s in JSON output %s", k, raw)
		}
	}
}

// TestTraceSummaryJSONRoundTrip verifies that marshal→unmarshal preserves all six values.
func TestTraceSummaryJSONRoundTrip(t *testing.T) {
	want := TraceSummary{
		TraceId:     "deadbeef",
		RootName:    "my-root",
		ServiceName: "my-svc",
		StartTime:   time.Unix(1700000000, 0).UTC(),
		DurationNs:  12345,
		SpanCount:   3,
	}

	b, err := json.Marshal(want)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	var got TraceSummary
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("json.Unmarshal: %v", err)
	}

	if got.TraceId != want.TraceId {
		t.Errorf("TraceId: got %q want %q", got.TraceId, want.TraceId)
	}
	if got.RootName != want.RootName {
		t.Errorf("RootName: got %q want %q", got.RootName, want.RootName)
	}
	if got.ServiceName != want.ServiceName {
		t.Errorf("ServiceName: got %q want %q", got.ServiceName, want.ServiceName)
	}
	if !got.StartTime.Equal(want.StartTime) {
		t.Errorf("StartTime: got %v want %v", got.StartTime, want.StartTime)
	}
	if got.DurationNs != want.DurationNs {
		t.Errorf("DurationNs: got %d want %d", got.DurationNs, want.DurationNs)
	}
	if got.SpanCount != want.SpanCount {
		t.Errorf("SpanCount: got %d want %d", got.SpanCount, want.SpanCount)
	}
}

func containsStr(s, sub string) bool {
	return len(s) >= len(sub) && func() bool {
		for i := 0; i <= len(s)-len(sub); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	}()
}
