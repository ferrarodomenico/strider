package db

import (
	"strings"
	"testing"
)

func TestParseMockData(t *testing.T) {
	tests := []struct {
		name    string
		value   string
		present bool
		want    bool
		wantErr bool
	}{
		{name: "unset is false", value: "", present: false, want: false},
		{name: "empty string is invalid", value: "", present: true, wantErr: true},
		{name: "true", value: "true", present: true, want: true},
		{name: "1", value: "1", present: true, want: true},
		{name: "false", value: "false", present: true, want: false},
		{name: "0", value: "0", present: true, want: false},
		{name: "TRUE", value: "TRUE", present: true, want: true},
		{name: "yes is invalid", value: "yes", present: true, wantErr: true},
		{name: "abc is invalid", value: "abc", present: true, wantErr: true},
		{name: "leading space is invalid", value: " true", present: true, wantErr: true},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := parseMockData(tc.value, tc.present)
			if (err != nil) != tc.wantErr {
				t.Fatalf("parseMockData(%q, %v) error = %v, wantErr %v", tc.value, tc.present, err, tc.wantErr)
			}
			if got != tc.want {
				t.Errorf("parseMockData(%q, %v) = %v, want %v", tc.value, tc.present, got, tc.want)
			}
		})
	}
}

func TestParseMockDataErrorNamesVariableAndValue(t *testing.T) {
	_, err := parseMockData("abc", true)
	if err == nil {
		t.Fatal("expected an error")
	}
	for _, want := range []string{mockDataVar, `"abc"`} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q does not contain %s", err, want)
		}
	}
}
