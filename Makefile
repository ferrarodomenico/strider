ifeq ($(OS),Windows_NT)
    EXT      := .exe
    MKDIR    := if not exist bin mkdir bin
    RUN_TEST := start /B "" "$(BINARY)" & timeout /t 2 /nobreak >nul & "$(POPULATE)"
else
    EXT      :=
    MKDIR    := mkdir -p bin
    RUN_TEST := $(BINARY) & sleep 2 && $(POPULATE); wait
endif

BINARY   := bin/strider$(EXT)
POPULATE := bin/populate$(EXT)

-include .env
export

.PHONY: build run run-test docker-up strider

build:
	$(MKDIR)
	go build -o $(BINARY) ./cmd
	go build -o $(POPULATE) ./cmd/populate

docker-up:
	docker compose up -d

## Start the server.
run: build
	$(BINARY)

## Start ClickHouse, then run the server in the background and populate the DB with test data.
run-test: build docker-up
	$(RUN_TEST)

strider:
	go run ./cmd/main.go

test:
	go run ./cmd/populate/main.go