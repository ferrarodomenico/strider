package server

import (
	"context"
	"errors"
	"net"
	"strconv"
	"strings"
	"testing"
	"time"

	"strider/internal/db"

	collectortracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	resourcepb "go.opentelemetry.io/proto/otlp/resource/v1"
	tracepb "go.opentelemetry.io/proto/otlp/trace/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

const (
	eightMiB            = 8 * mebibyte
	exportRPCTimeout    = 10 * time.Second
	paddingAttributeKey = "padding"
	maxSizingAttempts   = 4
	loopbackEphemeral   = "127.0.0.1:0"
)

// setProcessEnv sets BOTH receive-limit vars via t.Setenv ("" for missing keys), so the developer's
// shell environment can never leak into a test. Callers cannot use t.Parallel.
func (e envMap) setProcessEnv(t *testing.T) {
	t.Helper()
	t.Setenv(envGRPCMaxRecvEnabled, e[envGRPCMaxRecvEnabled])
	t.Setenv(envGRPCMaxRecvSize, e[envGRPCMaxRecvSize])
}

// startTestGRPC runs the production StartGRPC(&db.DB{}, loopbackEphemeral) and returns a client.
// Why the zero-value DB is safe: every test request carries no spans, so traces.Handler calls
// database.Enqueue with an empty slice, which returns before touching ClickHouse.
func startTestGRPC(t *testing.T) collectortracepb.TraceServiceClient {
	t.Helper()
	addr, shutdown, err := StartGRPC(&db.DB{}, loopbackEphemeral)
	if err != nil {
		t.Fatalf("StartGRPC error: %v", err)
	}
	// Registered first so it runs last: the client closes before GracefulStop.
	t.Cleanup(shutdown)

	conn, err := grpc.NewClient(addr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		t.Fatalf("grpc.NewClient error: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return collectortracepb.NewTraceServiceClient(conn)
}

// paddedExportRequest builds one ResourceSpans whose Resource has a single string attribute of
// paddingLen bytes, and no ScopeSpans (span-less on purpose).
func paddedExportRequest(paddingLen int) *collectortracepb.ExportTraceServiceRequest {
	padding := &commonpb.KeyValue{
		Key:   paddingAttributeKey,
		Value: &commonpb.AnyValue{Value: &commonpb.AnyValue_StringValue{StringValue: strings.Repeat("x", paddingLen)}},
	}
	return &collectortracepb.ExportTraceServiceRequest{
		ResourceSpans: []*tracepb.ResourceSpans{
			{Resource: &resourcepb.Resource{Attributes: []*commonpb.KeyValue{padding}}},
		},
	}
}

// exportRequestOfSize returns a request whose proto.Size is exactly size bytes. It converges in
// two iterations at every test size, because the nested length prefixes keep the same varint width.
func exportRequestOfSize(t *testing.T, size int) *collectortracepb.ExportTraceServiceRequest {
	t.Helper()
	paddingLen := size
	for attempt := 0; attempt < maxSizingAttempts && paddingLen >= 0; attempt++ {
		req := paddedExportRequest(paddingLen)
		got := proto.Size(req)
		if got == size {
			return req
		}
		paddingLen += size - got
	}
	t.Fatalf("cannot build an export request of exactly %d bytes", size)
	return nil
}

// exportStatusCode sends req and returns the resulting gRPC status code (codes.OK on success).
func exportStatusCode(t *testing.T, client collectortracepb.TraceServiceClient, req *collectortracepb.ExportTraceServiceRequest) codes.Code {
	t.Helper()
	ctx, cancel := context.WithTimeout(t.Context(), exportRPCTimeout)
	defer cancel()
	_, err := client.Export(ctx, req)
	return status.Code(err)
}

func TestStartGRPCRecvLimit(t *testing.T) {
	enabledWith1MB := envMap{envGRPCMaxRecvEnabled: "true", envGRPCMaxRecvSize: "1MB"}
	tests := []struct {
		name        string
		env         envMap
		requestSize int
		wantCode    codes.Code
	}{
		// 8 MiB is above gRPC's 4 MiB server default, so this row fails if grpc.MaxRecvMsgSize is not applied.
		{"no vars, 8 MiB accepted", envMap{}, eightMiB, codes.OK},
		{"disabled with 1MB, 8 MiB accepted", envMap{envGRPCMaxRecvEnabled: "false", envGRPCMaxRecvSize: "1MB"}, eightMiB, codes.OK},
		{"enabled default 100MB, 8 MiB accepted", envMap{envGRPCMaxRecvEnabled: "true"}, eightMiB, codes.OK},
		{"enabled 1MB, smaller accepted", enabledWith1MB, mebibyte - 1, codes.OK},
		{"enabled 1MB, exactly the limit accepted", enabledWith1MB, mebibyte, codes.OK},
		{"enabled 1MB, one byte over rejected", enabledWith1MB, mebibyte + 1, codes.ResourceExhausted},
		{"enabled 1MB, 8 MiB rejected", enabledWith1MB, eightMiB, codes.ResourceExhausted},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			tc.env.setProcessEnv(t)
			client := startTestGRPC(t)

			got := exportStatusCode(t, client, exportRequestOfSize(t, tc.requestSize))
			if got != tc.wantCode {
				t.Errorf("Export of %d bytes returned %v, want %v", tc.requestSize, got, tc.wantCode)
			}
		})
	}
}

func TestStartGRPCRejectsInvalidConfigBeforeListening(t *testing.T) {
	held, err := net.Listen("tcp", loopbackEphemeral)
	if err != nil {
		t.Fatalf("net.Listen error: %v", err)
	}
	t.Cleanup(func() { _ = held.Close() })

	tests := []struct {
		env          envMap
		wantSentinel error
		wantVar      string
		wantValue    string
	}{
		{envMap{envGRPCMaxRecvEnabled: "maybe", envGRPCMaxRecvSize: "1MB"}, errInvalidRecvLimitEnabled, envGRPCMaxRecvEnabled, "maybe"},
		{envMap{envGRPCMaxRecvEnabled: "true", envGRPCMaxRecvSize: "abc"}, errInvalidByteSizeSyntax, envGRPCMaxRecvSize, "abc"},
		{envMap{envGRPCMaxRecvEnabled: "true", envGRPCMaxRecvSize: "3GB"}, errByteSizeOutOfRange, envGRPCMaxRecvSize, "3GB"},
	}
	for _, tc := range tests {
		t.Run(tc.wantVar+"="+tc.wantValue, func(t *testing.T) {
			tc.env.setProcessEnv(t)

			addr, shutdown, err := StartGRPC(nil, held.Addr().String())
			if shutdown != nil {
				t.Cleanup(shutdown)
			}

			// An implementation that listened first would fail with "address already in use" on the
			// held port and not match the sentinel, so this proves validation precedes binding.
			if !errors.Is(err, tc.wantSentinel) {
				t.Fatalf("StartGRPC error = %v, want %v", err, tc.wantSentinel)
			}
			assertMentions(t, err, tc.wantVar, strconv.Quote(tc.wantValue))
			if addr != "" || shutdown != nil {
				t.Errorf("StartGRPC returned addr %q and shutdown set=%v, want zero values", addr, shutdown != nil)
			}
		})
	}
}
