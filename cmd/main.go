package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"strider/internal/db"
	"strider/internal/server"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	database, err := db.New()
	if err != nil {
		slog.Error("init db", "err", err)
		os.Exit(1)
	}
	defer database.Close()

	go database.Start(ctx)

	_, grpcShutdown, err := server.StartGRPC(database, server.EnvAddr(server.EnvGRPCAddr, server.DefaultGRPCAddr))
	if err != nil {
		slog.Error("start grpc", "err", err)
		os.Exit(1)
	}

	_, httpShutdown, err := server.StartHTTP(database, server.EnvAddr(server.EnvHTTPAddr, server.DefaultHTTPAddr))
	if err != nil {
		slog.Error("start http", "err", err)
		grpcShutdown()
		os.Exit(1)
	}

	<-ctx.Done()
	grpcShutdown()
	httpShutdown()
}
