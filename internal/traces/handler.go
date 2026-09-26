package traces

func flatten(rs ResourceSpan) []Span {
	var spans []Span
	for _, span := range rs.Spans {
		spans = append(spans, span)
	}
	return spans
}
