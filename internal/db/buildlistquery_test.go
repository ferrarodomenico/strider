package db

import (
	"testing"
)

// buildListQuery is a method on *DB but uses no DB fields — zero-value DB is fine.
// AC5: orderBy = OrderByDurationNs → ORDER BY duration_ns
// AC6: empty orderBy → ORDER BY start_time
// AC7: empty direction → ORDER BY <field> DESC
// AC8: empty condition → no WHERE; non-empty condition → WHERE present
func TestBuildListQuery(t *testing.T) {
	d := &DB{} // zero value — buildListQuery reads no DB fields

	const tracesPrefix = `SELECT * FROM trace_summary FINAL `
	const spansPrefix = `SELECT trace_id, span_id, service_name, name, kind, start_time, duration_ns, status_code FROM spans `

	tests := []struct {
		name      string
		prefix    string
		orderBy   OrderByField
		direction Direction
		condition string
		want      string
	}{
		{
			name:      "empty orderBy defaults to start_time",
			prefix:    tracesPrefix,
			orderBy:   "",
			direction: Desc,
			condition: "",
			want:      tracesPrefix + ` ORDER BY start_time DESC`,
		},
		{
			name:      "empty direction defaults to DESC",
			prefix:    tracesPrefix,
			orderBy:   OrderByStartTime,
			direction: "",
			condition: "",
			want:      tracesPrefix + ` ORDER BY start_time DESC`,
		},
		{
			name:      "orderBy duration_ns renders correctly",
			prefix:    spansPrefix,
			orderBy:   OrderByDurationNs,
			direction: Asc,
			condition: "",
			want:      spansPrefix + ` ORDER BY duration_ns ASC`,
		},
		{
			name:      "orderBy start_time renders correctly",
			prefix:    spansPrefix,
			orderBy:   OrderByStartTime,
			direction: Desc,
			condition: "",
			want:      spansPrefix + ` ORDER BY start_time DESC`,
		},
		{
			name:      "empty condition produces no WHERE clause",
			prefix:    tracesPrefix,
			orderBy:   OrderByStartTime,
			direction: Desc,
			condition: "",
			want:      tracesPrefix + ` ORDER BY start_time DESC`,
		},
		{
			name:      "non-empty condition includes WHERE clause",
			prefix:    spansPrefix,
			orderBy:   OrderByStartTime,
			direction: Desc,
			condition: "service_name = 'frontend'",
			want:      spansPrefix + `WHERE service_name = 'frontend' ORDER BY start_time DESC`,
		},
		{
			name:      "condition already prefixed with WHERE is not double-prefixed",
			prefix:    tracesPrefix,
			orderBy:   OrderByStartTime,
			direction: Desc,
			condition: "WHERE service_name = 'api'",
			want:      tracesPrefix + `WHERE service_name = 'api' ORDER BY start_time DESC`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := d.buildListQuery(tc.prefix, tc.orderBy, tc.direction, tc.condition)
			if got != tc.want {
				t.Errorf("buildListQuery(%q, %q, %q, %q)\n got  %q\n want %q",
					tc.prefix, tc.orderBy, tc.direction, tc.condition, got, tc.want)
			}
		})
	}
}
