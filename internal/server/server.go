package server

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"time"

	"strider/internal/db"
	"strider/internal/traces"

	collectortracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"
	"google.golang.org/grpc"
)

const (
	EnvGRPCAddr = "GRPC_ADDR"
	EnvHTTPAddr = "HTTP_ADDR"

	DefaultGRPCAddr = ":4317"
	DefaultHTTPAddr = ":8080"

	shutdownTimeout = 5 * time.Second
)

// EnvAddr returns the value of envVar, or fallback when it is unset/empty.
func EnvAddr(envVar, fallback string) string {
	if v := os.Getenv(envVar); v != "" {
		return v
	}
	return fallback
}

// StartGRPC binds a TCP listener on addr and serves the OTLP TraceService in a
// background goroutine. The listener is bound before returning, so the returned
// address is immediately dialable. The returned shutdown func gracefully stops
// the server and blocks until the listener is closed.
func StartGRPC(database *db.DB, addr string) (string, func(), error) {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return "", nil, fmt.Errorf("grpc listen on %s: %w", addr, err)
	}

	srv := grpc.NewServer()
	collectortracepb.RegisterTraceServiceServer(srv, traces.NewHandler(database.Enqueue))

	go func() {
		slog.Info("grpc listening", "addr", lis.Addr().String())
		if err := srv.Serve(lis); err != nil {
			slog.Error("grpc serve", "err", err)
		}
	}()

	return lis.Addr().String(), srv.GracefulStop, nil
}

// StartHTTP binds a TCP listener on addr and serves the trace query API in a
// background goroutine. The listener is bound before returning, so the returned
// address is immediately reachable. The returned shutdown func gracefully stops
// the server and blocks until the listener is closed.
func StartHTTP(database *db.DB, addr string) (string, func(), error) {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return "", nil, fmt.Errorf("http listen on %s: %w", addr, err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /traces", handleFindAll(database, kindTraces))
	mux.HandleFunc("GET /traces/{id}", handleFindTraceById(database))
	mux.HandleFunc("GET /spans", handleFindAll(database, kindSpans))

	srv := &http.Server{Handler: mux}

	go func() {
		slog.Info("http listening", "addr", lis.Addr().String())
		if err := srv.Serve(lis); err != nil && err != http.ErrServerClosed {
			slog.Error("http serve", "err", err)
		}
	}()

	shutdown := func() {
		ctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		defer cancel()
		_ = srv.Shutdown(ctx)
	}

	return lis.Addr().String(), shutdown, nil
}
