/**
 * A small, dependency-free CSV serializer (RFC 4180 quoting).
 *
 * No library needed at this app's scale — the entire "feature" is a handful of
 * escaping rules, and pulling in a package for that would just be another line
 * in the dependency audit for something ten lines can do correctly.
 */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/** Quotes a field only when it needs it, doubling any embedded quote. */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv<T>(rows: T[], columns: Array<CsvColumn<T>>): string {
  const header = columns.map((column) => escapeCsvField(column.header)).join(',');

  const lines = rows.map((row) =>
    columns
      .map((column) => {
        const value = column.value(row);
        return escapeCsvField(value === null || value === undefined ? '' : String(value));
      })
      .join(','),
  );

  // CRLF per RFC 4180; Excel in particular is more forgiving of this than LF.
  return [header, ...lines].join('\r\n') + '\r\n';
}
