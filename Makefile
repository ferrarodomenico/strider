FRONTEND_PORT     := 4200
DEFAULT_GRPC_PORT := 4317
DEFAULT_HTTP_PORT := 8080

# PowerShell script run by `make stop`. It is passed through an environment
# variable and evaluated with Invoke-Expression so the recipe line contains no
# `$` and therefore behaves the same under cmd.exe and sh.
define WINDOWS_STOP_SCRIPT
foreach ($$port in '$(STOP_PORTS)' -split ' ') { $$ids = @(Get-NetTCPConnection -LocalPort $$port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); if ($$ids.Count -eq 0) { Write-Host ('port {0}: nothing listening' -f $$port); continue }; foreach ($$id in $$ids) { try { Stop-Process -Id $$id -Force -ErrorAction Stop; Write-Host ('port {0}: stopped PID {1}' -f $$port, $$id) } catch { Write-Host ('port {0}: could not stop PID {1}' -f $$port, $$id) } } }
endef

ifeq ($(OS),Windows_NT)
    EXT      := .exe
    MKDIR    := if not exist bin mkdir bin
    RUN_TEST := start /B "" "$(BINARY)" & timeout /t 2 /nobreak >nul & "$(POPULATE)"
    RUN_ALL  := start /B "" go run ./cmd/main.go & cd strider-ui && npm start
    STOP_ALL  = powershell -NoProfile -Command "(Get-Item Env:WINDOWS_STOP_SCRIPT).Value | Invoke-Expression"
else
    EXT      :=
    MKDIR    := mkdir -p bin
    RUN_TEST := $(BINARY) & sleep 2 && $(POPULATE); wait
    RUN_ALL  := go run ./cmd/main.go & cd strider-ui && npm start
    STOP_ALL  = for port in $(STOP_PORTS); do pids=$$(lsof -ti tcp:$$port -sTCP:LISTEN); if [ -z "$$pids" ]; then echo "port $$port: nothing listening"; continue; fi; for pid in $$pids; do if kill $$pid 2>/dev/null; then echo "port $$port: stopped PID $$pid"; else echo "port $$port: could not stop PID $$pid"; fi; done; done
endif

BINARY   := bin/strider$(EXT)
POPULATE := bin/populate$(EXT)

-include .env
export

# Port is the part of an address after its last ':' (":4317", "127.0.0.1:4317").
GRPC_PORT  := $(or $(lastword $(subst :, ,$(GRPC_ADDR))),$(DEFAULT_GRPC_PORT))
HTTP_PORT  := $(or $(lastword $(subst :, ,$(HTTP_ADDR))),$(DEFAULT_HTTP_PORT))
STOP_PORTS  = $(sort $(FRONTEND_PORT) $(GRPC_PORT) $(HTTP_PORT))

.PHONY: build run run-test docker-up strider stop

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
	$(RUN_ALL)

## Stop whatever is listening on the frontend, gRPC and HTTP ports.
stop:
	@$(STOP_ALL)

test:
	go run ./cmd/populate/main.go