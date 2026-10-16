import { localDisplayToIso } from './datetime.util';
import { quoteString } from './query-builder.util';

const DATE_TIME_LITERAL = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/;
// A single-quoted SQL string literal; supports \' and '' escapes.
const QUOTED_LITERAL = /'(?:[^'\\]|\\.|'')*'/g;
const LIKE_KEYWORD_BEFORE = /\b(?:I?LIKE)\s*$/i;
const ALREADY_WRAPPED_BEFORE = /\bparseDateTime64BestEffort\s*\(\s*$/i;
const DATE_TIME_PRECISION = 9;

const toWrappedDateTime = (localDisplay: string): string | null => {
  try {
    return `parseDateTime64BestEffort(${quoteString(localDisplayToIso(localDisplay))}, ${DATE_TIME_PRECISION})`;
  } catch {
    return null;
  }
};

const shouldStayLiteral = (precedingText: string): boolean =>
  LIKE_KEYWORD_BEFORE.test(precedingText) || ALREADY_WRAPPED_BEFORE.test(precedingText);

// Rewrites quoted local date-time literals into ClickHouse parseDateTime64BestEffort(...)
// calls with a UTC ISO value. Intended to run only right before the condition is sent.
export function resolveDateLiterals(condition: string): string {
  return condition.replace(QUOTED_LITERAL, (literal, offset: number) => {
    const content = literal.slice(1, -1);
    if (!DATE_TIME_LITERAL.test(content)) return literal;
    if (shouldStayLiteral(condition.slice(0, offset))) return literal;
    return toWrappedDateTime(content) ?? literal;
  });
}
