FRONTEND_PORT     := 4200
DEFAULT_GRPC_PORT := 4317
DEFAULT_HTTP_PORT := 8080

# PowerShell script run by `make stop`. It is passed through an environment
# variable and evaluated with Invoke-Expression so the recipe line contains no
# `$` and therefore behaves the same under cmd.exe and sh.
define WINDOWS_STOP_SCRIPT
foreach ($$port in '$(STOP_PORTS)' -split ' ') { $$ids = @(Get-NetTCPConnection -LocalPort $$port -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique); if ($$ids.Count -eq 0) { Write-Host ('port {0}: nothing listening' -f $$port); continue }; foreach ($$id in $$ids) { try { Stop-Process -Id $$id -Force -ErrorAction Stop; Write-Host ('port {0}: stopped PID {1}' -f $$port, $$id) } catch { Write-Host ('port {0}: could not stop PID {1}' -f $$port, $$id) } } }
endef

# PowerShell script run by `make strider-gc`, passed the same way as
# WINDOWS_STOP_SCRIPT. Echoes the server's output and copies it to a
# timestamped file under logs/ (StreamWriter rather than Tee-Object, which
# writes UTF-16 under Windows PowerShell 5.1).
define WINDOWS_GC_SCRIPT
$$env:GODEBUG = 'gctrace=1'; New-Item -ItemType Directory -Force logs | Out-Null; $$log = Join-Path (Get-Location) ('logs/gc-{0}.log' -f (Get-Date -Format 'yyyyMMdd-HHmmss')); Write-Host ('writing GC trace to {0}' -f $$log); $$w = New-Object IO.StreamWriter $$log; $$w.AutoFlush = $$true; try { & '$(BINARY)' 2>&1 | ForEach-Object { $$l = "$$_"; Write-Host $$l; $$w.WriteLine($$l) } } finally { $$w.Dispose() }
endef

ifeq ($(OS),Windows_NT)
    EXT      := .exe
    MKDIR    := if not exist bin mkdir bin
    RUN_TEST  = start /B "" "$(BINARY)" & timeout /t 2 /nobreak >nul & "$(POPULATE)"
    RUN_ALL  := start /B "" go run ./cmd/main.go & cd strider-ui && npm start
    RUN_ALL_BIN = start /B "" "$(BINARY)" & cd strider-ui && npm start
    RUN_GC    = powershell -NoProfile -Command "(Get-Item Env:WINDOWS_GC_SCRIPT).Value | Invoke-Expression"
    STOP_ALL  = powershell -NoProfile -Command "(Get-Item Env:WINDOWS_STOP_SCRIPT).Value | Invoke-Expression"
else
    EXT      :=
    MKDIR    := mkdir -p bin
    RUN_TEST  = $(BINARY) & sleep 2 && $(POPULATE); wait
    RUN_ALL  := go run ./cmd/main.go & cd strider-ui && npm start
    RUN_ALL_BIN = $(BINARY) & cd strider-ui && npm start
    RUN_GC    = mkdir -p logs && log=logs/gc-$$(date +%Y%m%d-%H%M%S).log && echo "writing GC trace to $$log" && GODEBUG=gctrace=1 $(BINARY) 2>&1 | tee "$$log"
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

.PHONY: build run run-test docker-up strider strider-bin strider-gc stop

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

## Build the backend, then run the binary in the background and start the frontend.
strider-bin: build
	$(RUN_ALL_BIN)

## Run only the backend with a GC trace line (heap sizes, pause times) on every collection.
## Output is shown in the console and also saved to logs/gc-<timestamp>.log.
## Runs the built binary rather than `go run`, so the Go toolchain's own GCs don't show up in the trace.
strider-gc: build
	@$(RUN_GC)

## Stop whatever is listening on the frontend, gRPC and HTTP ports.
stop:
	@$(STOP_ALL)

test:
	go run ./cmd/populate/main.go