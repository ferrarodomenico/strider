package server

import (
	"errors"
	"strconv"
	"strings"
	"testing"
)

const (
	kelvinSignKB     = "1KB"
	fullwidthOne     = "１"
	defaultLimitSize = 104857600
)

// envMap fakes the environment; a missing key reads as "", exactly like an unset variable via os.Getenv.
type envMap map[string]string

func (e envMap) getenv(key string) string { return e[key] }

type byteSizeErrorCase struct {
	raw     string
	wantErr error
}

// ac25InvalidSizes is the spec's AC25 list verbatim; shared by the parser and resolver tests.
var ac25InvalidSizes = []byteSizeErrorCase{
	{"0", errByteSizeOutOfRange}, {"-5", errInvalidByteSizeSyntax}, {"0MB", errByteSizeOutOfRange},
	{"0.5", errByteSizeOutOfRange}, {"0.0000001KB", errByteSizeOutOfRange}, {"3GB", errByteSizeOutOfRange},
	{"2GB", errByteSizeOutOfRange}, {"2147483648", errByteSizeOutOfRange}, {"abc", errInvalidByteSizeSyntax},
	{"MB", errInvalidByteSizeSyntax}, {"10XB", errInvalidByteSizeSyntax}, {"1 MB", errInvalidByteSizeSyntax},
	{"1.", errInvalidByteSizeSyntax}, {".5MB", errInvalidByteSizeSyntax},
}

var derivedInvalidSizes = []byteSizeErrorCase{
	{"", errInvalidByteSizeSyntax}, {" 1MB", errInvalidByteSizeSyntax}, {"1MB ", errInvalidByteSizeSyntax},
	{"1MB\r", errInvalidByteSizeSyntax}, {"+5", errInvalidByteSizeSyntax}, {"1e3", errInvalidByteSizeSyntax},
	{"1_000", errInvalidByteSizeSyntax}, {"1,5MB", errInvalidByteSizeSyntax}, {"1.2.3", errInvalidByteSizeSyntax},
	{"1..5", errInvalidByteSizeSyntax}, {"1.MB", errInvalidByteSizeSyntax}, {"100B", errInvalidByteSizeSyntax},
	{"1KBKB", errInvalidByteSizeSyntax}, {"0x10", errInvalidByteSizeSyntax}, {fullwidthOne, errInvalidByteSizeSyntax},
	{kelvinSignKB, errInvalidByteSizeSyntax},
	{"0.0", errByteSizeOutOfRange}, {"0000", errByteSizeOutOfRange}, {"2097152KB", errByteSizeOutOfRange},
	{"2048MB", errByteSizeOutOfRange}, {"4294967297", errByteSizeOutOfRange},
	{"18446744073709551617", errByteSizeOutOfRange}, {"99999999999999999999999999GB", errByteSizeOutOfRange},
}

func TestParseByteSizeValid(t *testing.T) {
	tests := []struct {
		raw  string
		want int
	}{
		{"100MB", defaultLimitSize}, {"100mb", defaultLimitSize}, {"100MiB", defaultLimitSize},
		{"1KB", 1024}, {"1KiB", 1024}, {"1kib", 1024},
		{"1GB", 1073741824}, {"4096", 4096}, {"1", 1}, {"2147483647", 2147483647},
		{"1.5MB", 1572864}, {"1.5", 1},
		{"1Gib", 1073741824}, {"1gIB", 1073741824}, {"1Mb", 1048576},
		{"0001KB", 1024}, {"1.0", 1}, {"1.999", 1}, {"1.15MB", 1205862},
		{"0.0009765625KB", 1},
		{"0.000000000931322574615478515625GB", 1},
		{"1.99999999999999999", 1},
		{"0.99999999999999999KB", 1023},
		{"2147483647.9999999999", 2147483647},
		{"1.9999999995343387126922607421875GB", 2147483647},
		{"1.999999999GB", 2147483646},
		{"2097151KB", 2147482624},
		{"2047MB", 2146435072},
	}
	for _, tc := range tests {
		t.Run(tc.raw, func(t *testing.T) {
			got, err := parseByteSize(tc.raw)
			if err != nil {
				t.Fatalf("parseByteSize(%q) error: %v", tc.raw, err)
			}
			if got != tc.want {
				t.Errorf("parseByteSize(%q) = %d, want %d", tc.raw, got, tc.want)
			}
		})
	}
}

func TestParseByteSizeInvalid(t *testing.T) {
	tests := append(append([]byteSizeErrorCase{}, ac25InvalidSizes...), derivedInvalidSizes...)
	for _, tc := range tests {
		t.Run(strconv.Quote(tc.raw), func(t *testing.T) {
			got, err := parseByteSize(tc.raw)
			if got != 0 {
				t.Errorf("parseByteSize(%q) = %d, want 0", tc.raw, got)
			}
			if !errors.Is(err, tc.wantErr) {
				t.Errorf("parseByteSize(%q) error = %v, want %v", tc.raw, err, tc.wantErr)
			}
		})
	}
}

func TestParseRecvLimitEnabled(t *testing.T) {
	tests := []struct {
		raw  string
		want bool
	}{
		{"1", true}, {"t", true}, {"T", true}, {"TRUE", true}, {"true", true}, {"True", true},
		{"0", false}, {"f", false}, {"F", false}, {"FALSE", false}, {"false", false}, {"False", false},
		{"", false},
	}
	for _, tc := range tests {
		t.Run(strconv.Quote(tc.raw), func(t *testing.T) {
			got, err := parseRecvLimitEnabled(tc.raw)
			if err != nil {
				t.Fatalf("parseRecvLimitEnabled(%q) error: %v", tc.raw, err)
			}
			if got != tc.want {
				t.Errorf("parseRecvLimitEnabled(%q) = %v, want %v", tc.raw, got, tc.want)
			}
		})
	}
}

func TestParseRecvLimitEnabledInvalid(t *testing.T) {
	for _, raw := range []string{"maybe", "yes", "on", "2", "tRuE", " true", "true ", "true\r"} {
		t.Run(strconv.Quote(raw), func(t *testing.T) {
			got, err := parseRecvLimitEnabled(raw)
			if got {
				t.Errorf("parseRecvLimitEnabled(%q) = true, want false", raw)
			}
			if !errors.Is(err, errInvalidRecvLimitEnabled) {
				t.Errorf("parseRecvLimitEnabled(%q) error = %v, want %v", raw, err, errInvalidRecvLimitEnabled)
			}
		})
	}
}

func TestResolveMaxRecvMsgSize(t *testing.T) {
	tests := []struct {
		name string
		env  envMap
		want int
	}{
		{"nothing set", envMap{}, unlimitedRecvMsgSize},
		{"enabled empty", envMap{envGRPCMaxRecvEnabled: ""}, unlimitedRecvMsgSize},
		{"disabled", envMap{envGRPCMaxRecvEnabled: "false"}, unlimitedRecvMsgSize},
		{"disabled ignores valid size", envMap{envGRPCMaxRecvEnabled: "false", envGRPCMaxRecvSize: "1MB"}, unlimitedRecvMsgSize},
		{"disabled ignores invalid size", envMap{envGRPCMaxRecvEnabled: "false", envGRPCMaxRecvSize: "abc"}, unlimitedRecvMsgSize},
		{"unset enabled ignores invalid size", envMap{envGRPCMaxRecvSize: "abc"}, unlimitedRecvMsgSize},
		{"zero enabled ignores negative size", envMap{envGRPCMaxRecvEnabled: "0", envGRPCMaxRecvSize: "-5"}, unlimitedRecvMsgSize},
		{"enabled size unset", envMap{envGRPCMaxRecvEnabled: "true"}, defaultLimitSize},
		{"enabled size empty", envMap{envGRPCMaxRecvEnabled: "true", envGRPCMaxRecvSize: ""}, defaultLimitSize},
		{"enabled 1MB", envMap{envGRPCMaxRecvEnabled: "true", envGRPCMaxRecvSize: "1MB"}, 1048576},
		{"enabled 1 and 1KB", envMap{envGRPCMaxRecvEnabled: "1", envGRPCMaxRecvSize: "1KB"}, 1024},
		{"enabled TRUE 1.5MB", envMap{envGRPCMaxRecvEnabled: "TRUE", envGRPCMaxRecvSize: "1.5MB"}, 1572864},
		{"enabled t max", envMap{envGRPCMaxRecvEnabled: "t", envGRPCMaxRecvSize: "2147483647"}, 2147483647},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := resolveMaxRecvMsgSize(tc.env.getenv)
			if err != nil {
				t.Fatalf("resolveMaxRecvMsgSize error: %v", err)
			}
			if got != tc.want {
				t.Errorf("resolveMaxRecvMsgSize = %d, want %d", got, tc.want)
			}
		})
	}
}

func TestResolveMaxRecvMsgSizeRejectsInvalidEnabled(t *testing.T) {
	tests := []envMap{
		{envGRPCMaxRecvEnabled: "maybe"},
		{envGRPCMaxRecvEnabled: "maybe", envGRPCMaxRecvSize: "abc"},
		{envGRPCMaxRecvEnabled: "maybe", envGRPCMaxRecvSize: "1MB"},
		{envGRPCMaxRecvEnabled: "yes"},
		{envGRPCMaxRecvEnabled: " true"},
	}
	for _, env := range tests {
		value := env[envGRPCMaxRecvEnabled]
		t.Run(strconv.Quote(value)+"/"+strconv.Quote(env[envGRPCMaxRecvSize]), func(t *testing.T) {
			got, err := resolveMaxRecvMsgSize(env.getenv)
			if got != 0 {
				t.Errorf("resolveMaxRecvMsgSize = %d, want 0", got)
			}
			if !errors.Is(err, errInvalidRecvLimitEnabled) {
				t.Fatalf("error = %v, want %v", err, errInvalidRecvLimitEnabled)
			}
			assertMentions(t, err, envGRPCMaxRecvEnabled, strconv.Quote(value))
			if strings.Contains(err.Error(), envGRPCMaxRecvSize) {
				t.Errorf("error %q must not mention %s", err, envGRPCMaxRecvSize)
			}
		})
	}
}

func TestResolveMaxRecvMsgSizeRejectsInvalidSize(t *testing.T) {
	for _, tc := range ac25InvalidSizes {
		t.Run(strconv.Quote(tc.raw), func(t *testing.T) {
			env := envMap{envGRPCMaxRecvEnabled: "true", envGRPCMaxRecvSize: tc.raw}
			got, err := resolveMaxRecvMsgSize(env.getenv)
			if got != 0 {
				t.Errorf("resolveMaxRecvMsgSize = %d, want 0", got)
			}
			if !errors.Is(err, tc.wantErr) {
				t.Fatalf("error = %v, want %v", err, tc.wantErr)
			}
			assertMentions(t, err, envGRPCMaxRecvSize, strconv.Quote(tc.raw))
		})
	}
}

// assertMentions fails the test unless the error message contains every fragment.
func assertMentions(t *testing.T, err error, fragments ...string) {
	t.Helper()
	for _, fragment := range fragments {
		if !strings.Contains(err.Error(), fragment) {
			t.Errorf("error %q does not contain %q", err, fragment)
		}
	}
}
