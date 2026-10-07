package db

import (
	"testing"
)

// buildWhere is a method on *DB but uses no DB fields — zero-value DB is fine.
// AC 6: non-empty condition without WHERE prefix → "WHERE <condition>"
// AC 7: empty condition → no WHERE clause
func TestBuildWhere(t *testing.T) {
	d := &DB{} // zero value — buildWhere reads no DB fields

	tests := []struct {
		name      string
		condition string
		want      string
	}{
		{
			name:      "empty condition produces no WHERE clause",
			condition: "",
			want:      "",
		},
		{
			name:      "non-empty condition without WHERE prefix gets WHERE prepended",
			condition: "service_name = 'frontend'",
			want:      "WHERE service_name = 'frontend'",
		},
		{
			name:      "condition already has WHERE prefix is returned unchanged",
			condition: "WHERE service_name = 'api'",
			want:      "WHERE service_name = 'api'",
		},
		{
			name:      "condition starts with WHERE but no space is treated as having WHERE prefix",
			// strings.HasPrefix("WHEREfoo", "WHERE") == true so it is NOT re-prefixed
			condition: "WHEREservice_name = 'x'",
			want:      "WHEREservice_name = 'x'",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := d.buildWhere(tc.condition)
			if got != tc.want {
				t.Errorf("buildWhere(%q) = %q, want %q", tc.condition, got, tc.want)
			}
		})
	}
}
