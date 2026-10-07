package server

import (
	"encoding/json"
	"iter"
	"log/slog"
	"net/http"

	"strider/internal/db"
)

const contentTypeNDJSON = "application/x-ndjson"

// listKind selects which DB list query handleFindAll dispatches to.
type listKind int

const (
	kindTraces listKind = iota
	kindSpans
)

// streamNDJSON writes each row of seq to w as newline-delimited JSON
// (application/x-ndjson), flushing after every row. It is the one stream loop shared
// by every list endpoint.
//
//   - Error before any row is written -> 500 plain text; no NDJSON header is set.
//   - Error after the first row -> logged via slog; the stream closes with no more bytes.
//   - Zero rows and no error -> empty 200 with the NDJSON content-type.
func streamNDJSON[T any](w http.ResponseWriter, r *http.Request, seq iter.Seq2[T, error]) {
	flusher, _ := w.(http.Flusher)
	enc := json.NewEncoder(w)
	wroteHeader := false

	for row, err := range seq {
		if err != nil {
			if !wroteHeader {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			slog.Error("stream ndjson", "err", err)
			return
		}

		if !wroteHeader {
			w.Header().Set("Content-Type", contentTypeNDJSON)
			w.WriteHeader(http.StatusOK)
			wroteHeader = true
		}

		if err := enc.Encode(row); err != nil {
			slog.Error("encode ndjson row", "err", err)
			return
		}
		if flusher != nil {
			flusher.Flush()
		}
	}

	// No rows and no error: commit an empty 200 NDJSON response.
	if !wroteHeader {
		w.Header().Set("Content-Type", contentTypeNDJSON)
		w.WriteHeader(http.StatusOK)
	}
}

// handleFindAll serves a streaming NDJSON list endpoint. kind selects the DB query
// (traces vs spans); both branches share the streamNDJSON loop and the same query
// parameters (orderBy, direction, condition).
func handleFindAll(d *db.DB, kind listKind) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		query := r.URL.Query()
		orderBy := db.OrderByField(query.Get("orderBy"))
		direction := db.Direction(query.Get("direction"))
		condition := query.Get("condition")
		ctx := r.Context()

		switch kind {
		case kindTraces:
			streamNDJSON(w, r, d.FindAllTraces(ctx, orderBy, direction, condition))
		case kindSpans:
			streamNDJSON(w, r, d.FindAllSpans(ctx, orderBy, direction, condition))
		}
	}
}

func handleFindTraceById(d *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		trace, err := d.FindByTraceId(r.Context(), id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if trace.TraceId == "" {
			http.Error(w, "trace not found", http.StatusNotFound)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(trace)
	}
}
