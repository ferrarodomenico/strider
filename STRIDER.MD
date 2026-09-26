# Strider — Recap architetturale (aggiornato)

## Obiettivo del progetto

Backend di observability leggero, OTel-native, in Go singolo binario + ClickHouse.
Si colloca concettualmente tra Jaeger (troppo minimale: solo trace, query scarse) e lo
stack Grafana LGTM (troppo pesante/complesso per un ambiente di sviluppo locale).

**Scopo primario: progetto di apprendimento** (Go, concorrenza, ClickHouse, protocolli
OTLP), non un prodotto destinato a sostituire soluzioni esistenti in produzione (in prod
si userà New Relic). Riferimento di mercato più vicino: SigNoz, Uptrace — validano che
l'idea "Go + ClickHouse + OTel nativo" è un pattern reale, non solo un'ipotesi.

**Scope attuale: solo traces.** Metrics è pianificato ma deliberatamente rimandato.

**Approccio scelto per l'implementazione gRPC:** soluzione custom (server gRPC scritto a
mano, tipi protobuf grezzi da `go.opentelemetry.io/proto/otlp`), NON la libreria
`go.opentelemetry.io/collector/receiver/otlpreceiver`. Motivo: quest'ultima nasconde il
protobuf grezzo dietro l'astrazione `pdata`/`consumer.Traces` del Collector — comoda ma
toglie proprio l'apprendimento di gRPC/protobuf che è tra gli obiettivi del progetto.

---

## Come funziona il flusso dati (end-to-end)

```
App instrumentata (OTel SDK / Java agent)
      │  OTLP su gRPC, porta 4317 (persistent TCP/HTTP2)
      │  Un batch per chiamata Export: max ~512 span (default SDK,
      │  maxExportBatchSize), inviato ogni ~5s (scheduledDelayMillis)
      │  o quando il buffer client-side si riempie
      ▼
grpc.Server (Go) — TraceServiceServer registrato
      │  chiamata unaria Export(ctx, *ExportTraceServiceRequest)
      │  deserializzazione protobuf GIÀ fatta da grpc-go, prima
      │  che il codice applicativo venga eseguito
      │  ogni chiamata Export gira su una goroutine propria,
      │  gestita automaticamente da grpc-go — concorrenza "gratis"
      ▼
traces.Export() handler — sottile: per ogni ResourceSpans chiama
      flatten(), poi passa []Span a Batcher.Add()
      ▼
Batcher (channel bufferizzato + singolo consumer)
      │  vedi sezione dedicata sotto per il dettaglio pieno
      ▼
Saver (interfaccia) — oggi: mock (stampa/log). Domani: scrittura
      su ClickHouse via PrepareBatch/Append/Send, sincrona
      ▼
(futuro) query/ layer — SELECT per trace_id, buildTree in memoria
      │  HTTP: JSON per risposte piccole, NDJSON streaming per grandi
      ▼
Frontend (Angular) — riceve albero già costruito, solo rendering
```

---

## Dettaglio: conversione OTLP → riga (`flatten`)

**Stato: in scrittura manuale dall'utente, con supporto.**

Input: `*tracepb.ResourceSpans` (package `go.opentelemetry.io/proto/otlp/trace/v1`),
struttura annidata su 3 livelli:
```
ResourceSpans (Resource: attributi condivisi, es. service.name)
  └── ScopeSpans[] (Scope: libreria di strumentazione)
        └── Spans[] (span veri e propri)
```
Output: `[]Span` piatto, una riga per span, con tutte le info copiate dentro (niente
riferimenti impliciti a livelli superiori — ClickHouse lavora bene con righe
indipendenti, non con dati annidati).

### Import necessari in flatten.go
```go
import (
    tracepb  "go.opentelemetry.io/proto/otlp/trace/v1"   // ResourceSpans, ScopeSpans, Span, Status
    commonpb "go.opentelemetry.io/proto/otlp/common/v1"  // KeyValue, AnyValue
    "encoding/hex"
)
```
(`collector/trace/v1`/`coltracepb` NON serve qui — serve solo in `handler.go`, dove si
riceve `*ExportTraceServiceRequest` per intero.)

### Checklist campi da convertire
- `trace_id`, `span_id`, `parent_span_id`: `[]byte` → stringa esadecimale via
  `hex.EncodeToString`. Funzione totale, **non può fallire, nessun error return** —
  ogni sequenza di byte (anche vuota) ha una rappresentazione hex valida. Per uno span
  radice, `parent_span_id` arriva come `[]byte{}` (non `nil`) → `hex.EncodeToString`
  produce `""` senza problemi: stringa vuota = "è la radice", non un errore.
- `service_name`: letto da `rs.Resource.Attributes` (3 livelli sopra lo span) e
  **copiato in basso** su ogni riga generata da quel `ResourceSpans`.
- `duration_ns`: calcolato come `end_time_unix_nano - start_time_unix_nano` — OTLP non
  lo manda già pronto, solo i due timestamp assoluti.
- `status_code`/`status_message`: dentro `span.Status`, che è un puntatore — usare i
  getter generati (`span.GetStatus().GetCode()`) per evitare panic su nil, invece di
  accesso diretto al campo.
- `kind`: campo diretto (`span.Kind`), per ora tenuto come intero grezzo.
- `attributes` (sia dello span che della resource): `[]*commonpb.KeyValue` con valore
  `oneof` (string/int/double/bool/array/kvlist) → `map[string]string`. Richiede una
  funzione di stringify dedicata per tipo; array/kvlist annidati per ora ignorati o
  restituiti come stringa vuota (decisione rimandabile, non bloccante).

### Filosofia di error handling in flatten
`flatten` deve restare **una funzione totale**: sempre produce una riga per ogni span
trovato, con default sensati (stringa vuota, durata zero) per campi mancanti o
malformati, invece di interrompersi con un errore a metà batch. Un singolo attributo
malformato non deve far perdere gli altri 511 span nello stesso `Export`. Di
conseguenza: **nessun `error` return da `flatten`** — è puro, deterministico, senza
side-effect (input `*tracepb.ResourceSpans`, output `[]Span`), il che lo rende anche
facile da testare senza mock.

### Cosa NON fa flatten
- Non aspetta il trace completo — OTel non manda mai un trace intero in un colpo solo
  (i figli finiscono ed esportano prima del genitore, spesso da processi diversi in
  momenti diversi). `flatten` tratta ogni span indipendentemente.
- Non fa validazione semantica profonda (solo protobuf garantisce correttezza
  *strutturale* dei tipi, non lunghezza di trace_id/span_id, coerenza temporale, ecc.).
- Non tocca channel, batcher o storage.

---

## Dettaglio: gestione salvataggio — Batcher (decisione finale, con storia del ragionamento)

**Stato: bozza scritta (vedi `batcher.go` prodotto in conversazione), da rivedere
insieme al resto quando si riprende.**

### Perché serve un batching qualsiasi (non salvare riga per riga)
Ogni `INSERT` su ClickHouse crea una nuova "parte" su disco, fusa poi in background con
le altre. Troppi insert piccoli e ravvicinati sovraccaricano il merge in background →
errore "Too many parts" sotto carico sostenuto. Regola pratica: restare ragionevolmente
sotto ~1 insert/secondo per tabella sotto carico.

### Percorso decisionale (per capire il "perché", non solo il "cosa")
1. **Prima ipotesi: slice + mutex**, con salvataggio a intervallo/soglia. Funziona, ma
   richiede sincronizzazione esplicita perché più goroutine (una per ogni `Export` in
   arrivo, gestite automaticamente da grpc-go) scriverebbero sullo stesso slice
   condiviso — data race reale se non protetto (rilevabile con `go test -race`).
2. **Alternativa proposta: channel invece del mutex.** Principio Go: "non comunicare
   condividendo memoria, condividi memoria comunicando" — un solo consumer riceve dal
   channel e possiede lo slice di accumulo, nessun altro lo tocca → **nessun mutex
   necessario**, non perché sia un singleton, ma perché è l'unico proprietario dei dati.
3. **Dubbio sollevato: "channel gestisce solo un elemento alla volta, niente TakeN".**
   Chiarito: questo non limita la precisione dell'accumulo — lo slice interno (`buf`)
   dentro la goroutine consumer accumula comunque **span per span**, con precisione
   esatta; il channel trasporta solo un batch (`[]Span`) alla volta dal produttore al
   consumatore, ma `buf` fa l'append vero e proprio. La possibilità di un batch di
   salvataggio piccolo (anche 1 span) è dovuta al **trigger a tempo** (ticker), non al
   channel — accade identicamente anche con slice+mutex, è voluto: garantisce che i
   dati non restino invisibili a lungo sotto basso traffico.
4. **Dubbio su channel unbuffered vs bufferizzato.** Con channel unbuffered, un invio
   riesce solo se il consumer è ESATTAMENTE al `select` in quell'istante — non durante
   `flush()` (mentre `Save()` scrive su ClickHouse, es. 10-50ms). In quella finestra,
   qualsiasi `Export` concorrente verrebbe scartato anche a basso traffico, solo per
   la sincronia del timing. **Decisione finale: channel bufferizzato**, con capacità
   piccola (indicativamente 16-32 slot, non un numero critico) — sufficiente ad
   assorbire la finestra di un flush, non a "gestire l'overload" (quello lo fa comunque
   la policy di drop esplicito, indipendentemente dalla dimensione del buffer).
5. **Conclusione:** channel bufferizzato (assorbe la finestra di flush, tubo di
   consegna produttori→consumatore) + slice `buf` interno alla goroutine consumer
   (accumulo preciso span-per-span, decide quando salvare) — le due cose non sono in
   competizione, hanno scopi diversi e complementari.

### Struttura finale del Batcher
- `Add(spans []Span)`: chiamata dagli handler `Export` (goroutine multiple e
  concorrenti). **Mai bloccante** — `select` con `default`: se il channel bufferizzato
  ha spazio, invio riuscito e si prosegue subito; se pieno, scarto immediato con
  contatore/log. Nessun booleano di ritorno da un invio su channel: dentro un `select`,
  il runtime valuta se l'operazione può avvenire subito senza bloccarsi — se sì la
  esegue davvero e sceglie quel case, se no passa al `default`, tutto nello stesso
  istante, senza mai attendere.
- `run()`: **unica goroutine consumer**, letta dal channel in un loop `select` con due
  case — ricezione dal channel (accumula in `buf`, flush se `len(buf) >= maxSize`) e
  ticker (flush periodico anche se la soglia non è raggiunta, garantendo visibilità
  sotto basso traffico). I due trigger sono in OR, non in AND.
- `flush(buf *[]Span)`: **volutamente sincrono** (nessun `go` davanti a `Save`) — mai
  due `Save()` concorrenti sullo stesso Saver/connessione ClickHouse. Fa uno
  swap-and-release: assegna `toSave := *buf`, poi **rialloca** `*buf` con `make(...)`
  nuovo (non `buf[:0]`, che riutilizzerebbe lo stesso array sottostante e romperebbe
  l'invariante "toSave non cambia più una volta passato a Save"). Il flush sincrono non
  blocca `Add()` — quello continua ad accettare dati nel buffer del channel finché
  `run()` non torna libero.
- Errori di `Save()`: per ora solo log, nessun retry/dead-letter — limitazione nota e
  accettata per la fase attuale, da rivedere solo se diventa un problema osservato.

### Policy di scarto (drop) — accettata come compromesso
Se un servizio produce così tanti span da saturare capacità di accumulo/salvataggio, il
problema è di volume complessivo, non della singola traccia persa — scartare sotto un
picco anomalo è accettabile per un sistema che deve reggere, non fermarsi. **Condizione
necessaria perché questo compromesso sia valido: lo scarto deve essere visibile**
(contatore/log), mai silenzioso — altrimenti non è un compromesso accettabile, è un
bug nascosto.

### `Saver` — interfaccia, non dipendenza diretta
```go
type Saver interface {
    Save(ctx context.Context, spans []Span) error
}
```
Oggi: mock (log/stampa). Domani: `ClickHouseSaver` con `PrepareBatch`/`Append`/`Send`
sincrono — **niente `AsyncInsert` lato ClickHouse sommato al batching lato Go**, per
evitare due finestre di perdita dati indipendenti in sequenza. Il Batcher non cambia
in nessuno dei due casi.

### Istanziazione (non un vero "singleton" in senso Go)
Una sola istanza creata in `main`, passata esplicitamente (dependency injection) agli
handler gRPC — non stato globale, per restare testabile senza dover resettare nulla
tra i test.

---

## Struttura del progetto (Go)

```
strider/
  cmd/
    strider/
      main.go              // SOLO wiring: crea Batcher, Saver, grpc server, registra handler
  internal/
    traces/
      handler.go            // TraceServiceServer.Export — sottile: per ogni ResourceSpans, flatten() poi Batcher.Add()
      model.go                // struct Span (dominio ingest, una riga = uno span) — GIÀ SCRITTO dall'utente
      flatten.go                // ResourceSpans → []Span — IN SCRITTURA dall'utente
      batcher.go                 // Batcher, Saver interface — bozza scritta, vedi sopra
      store.go                     // FUTURO: ClickHouseSaver (PrepareBatch/Append/Send)
      flatten_test.go                 // test co-locati (convenzione Go, no cartella /tests)
      batcher_test.go
    clickhouse/
      conn.go                          // FUTURO: connessione condivisa, riusabile da metrics/ in futuro
    query/                               // FUTURO — non ancora implementato
      tree.go                             // Trace{ID, Root}, SpanNode{Span, Children}, buildTree()
  go.mod
```

Regole seguite:
- `internal/` per tutto: Strider è un binario, non una libreria da importare altrove.
- Test co-locati nello stesso package del codice testato.
- Niente package `util`/`common`/`helpers` — ogni funzione appartiene al package della
  fase a cui si riferisce (ingest, query, storage).
- Modelli di dominio separati per fase: `Span` (ingest) ≠ `Trace`/`SpanNode`
  (query-time, ricostruito da righe già salvate via `buildTree`, non ancora scritto).

---

## Dipendenze (solo ingest, persistenza esclusa per ora)

```bash
go mod init github.com/<utente>/strider
go get google.golang.org/grpc
go get go.opentelemetry.io/proto/otlp
```
- `google.golang.org/grpc` — server gRPC, gestione HTTP/2, dispatch per path/servizio
- `go.opentelemetry.io/proto/otlp` — tipi generati dallo schema OTLP condiviso da tutti
  i linguaggi (stesso `.proto` genera sia lo stub Java nell'agent OTel sia questo
  pacchetto Go — compatibilità strutturale by design, non serve "adattare" i dati):
  - `collector/trace/v1` → `ExportTraceServiceRequest`, `TraceServiceServer` (solo in `handler.go`)
  - `trace/v1` → `ResourceSpans`, `Span`, `Status` (in `flatten.go`)
  - `common/v1` → `KeyValue`, `AnyValue` (in `flatten.go`)
- `google.golang.org/protobuf` (transitiva, raramente importata direttamente)
- `encoding/hex` (stdlib) — conversione trace_id/span_id in stringa

Da aggiungere più avanti: `clickhouse-go` (driver con supporto batch nativo via
`PrepareBatch`), router HTTP per il query layer.

---

## Concetti Go chiariti durante la progettazione (utili da ricordare)

- **Interfacce strutturali (implicite), non dichiarative.** `TraceServiceServer` non si
  "implementa" esplicitamente come in Java — basta avere il metodo con la firma giusta
  (`Export(context.Context, *ExportTraceServiceRequest) (*ExportTraceServiceResponse, error)`).
  `UnimplementedTraceServiceServer` va embeddato per restare compatibili se OTel
  aggiunge metodi al servizio in futuro.
- **`select`/`default` su invio a channel non ritorna un booleano.** Il runtime valuta,
  per ogni case di comunicazione, se può avvenire subito senza bloccarsi; se sì lo
  esegue davvero (quel case è "scelto"), se no passa al `default` — non è "provo e poi
  mi dici l'esito", è "verifico la fattibilità e agisco", nello stesso istante.
- **`Export` non significa "salva".** È il nome del metodo RPC dal punto di vista del
  client (esporta dati verso l'esterno) — cosa fa il server con i dati è arbitrario e
  deciso nel corpo dell'handler.
- **Niente JOIN necessario per ricostruire un trace.** Tutti gli span di un trace
  stanno nella stessa tabella con lo stesso `trace_id` — basta un
  `SELECT * WHERE trace_id = ... ORDER BY start_time`. La ricostruzione ad albero (via
  `parent_span_id`) avviene in memoria nel backend Go, non in SQL né nel frontend.
- **`Trace` non ha dati intrinseci propri** — OTLP stesso non ha un concetto di
  "Trace", solo `Span` con un `trace_id` condiviso. Tutto ciò che sembra "del trace"
  (durata totale, servizi coinvolti, presenza di errori) è calcolato aggregando gli
  span. Un `type Traces map[string][]Span` con metodi (`GroupByTraceID`, `BuildTree`)
  è il named type adatto per questo, ma appartiene al query layer, non a `model.go`.

---

## Schema ClickHouse (target, per quando si arriva alla persistenza)

```sql
CREATE TABLE traces (
    trace_id            FixedString(32),
    span_id             FixedString(16),
    parent_span_id      FixedString(16),
    service_name        LowCardinality(String),
    span_name           String,
    kind                Int8,
    start_time          DateTime64(9),
    duration_ns         UInt64,
    status_code         Int8,
    status_message      String,
    attributes          Map(String, String),
    resource_attributes Map(String, String)
) ENGINE = MergeTree
PARTITION BY toDate(start_time)
ORDER BY (service_name, span_name, start_time)
TTL toDateTime(start_time) + INTERVAL 7 DAY
SETTINGS index_granularity = 8192;

CREATE TABLE trace_id_lookup (
    trace_id     FixedString(32),
    date         Date,
    service_name LowCardinality(String)
) ENGINE = MergeTree
ORDER BY trace_id
TTL date + INTERVAL 7 DAY;

CREATE MATERIALIZED VIEW trace_id_lookup_mv
TO trace_id_lookup AS
SELECT trace_id, toDate(start_time) AS date, service_name FROM traces;
```

---

## Configurazione lato client (Spring, per i test)

Approccio consigliato: **OpenTelemetry Java agent** (auto-instrumentazione, zero
codice), non il bridge Micrometer nativo di Spring (default: OTLP/HTTP porta 4318, non
gRPC 4317).

```bash
java -javaagent:opentelemetry-javaagent.jar \
     -Dotel.service.name=my-app \
     -Dotel.exporter.otlp.endpoint=http://localhost:4317 \
     -Dotel.exporter.otlp.protocol=grpc \
     -Dotel.traces.exporter=otlp \
     -jar myapp.jar
```
Un solo endpoint base è sufficiente anche per le metriche in futuro: l'agent crea
exporter separati per trace/metrics che chiamano servizi gRPC diversi sullo stesso
indirizzo — nessun conflitto, il routing è gestito da gRPC stesso in base al path del
servizio, cablato nel codice generato dell'exporter (non configurabile né da scrivere).

---

## Roadmap a stadi (build order deciso)

1. ✅ Architettura e schema decisi
2. ✅ `model.go` (struct `Span`) scritto
3. **IN CORSO** — `flatten.go`, scritto manualmente dall'utente con supporto
4. Bozza `batcher.go` prodotta — da rivedere/integrare quando si riprende
5. `handler.go`: collegare `Export` → `flatten` → `Batcher.Add`, con `Saver` mock
6. Verificare end-to-end con dati mockati nel `main` (niente ClickHouse ancora)
7. `internal/clickhouse` + `store.go`: `ClickHouseSaver` reale
8. Query layer: endpoint HTTP semplice (JSON), poi `buildTree` per singolo trace
9. Streaming NDJSON per risultati grandi (`http.Flusher`)
10. (Opzionale/dopo) Metrics: stesso pattern, handler/model/flatten/batcher/store separati
11. (Opzionale, bassa priorità) Frontend Angular — solo dopo che il backend è
    verificabile via curl/CLI

## Stato attuale dettagliato

- `model.go`: scritto (contenuto non incollato in questa conversazione — verificare che
  i campi combacino con la checklist di `flatten` sopra).
- `flatten.go`: in scrittura manuale dall'utente. Decisioni prese: uso di
  `hex.EncodeToString` per gli ID, funzione totale senza error return, service_name
  copiato dalla Resource, duration calcolata. Ancora da decidere/scrivere: funzione di
  conversione attributi (`attrsToMap`/`stringifyValue`), se separata o inline.
- `batcher.go`: bozza completa fornita (channel bufferizzato + `buf` interno + flush
  sincrono + drop esplicito con log), da rivedere insieme quando si riprende.
- `handler.go`, `store.go`, `query/`: non ancora iniziati.