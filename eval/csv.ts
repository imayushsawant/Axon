/** RFC 4180-ish CSV helpers. Prompts may contain commas, quotes, and newlines. */

export function parseCsv(text: string): Record<string, string>[] {
  const input = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = splitCsvRows(input);
  if (rows.length === 0) {
    return [];
  }
  const header = rows[0]!.map((cell) => cell.trim());
  const records: Record<string, string>[] = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = rows[i]!;
    if (cells.length === 1 && cells[0] === "") {
      continue;
    }
    const record: Record<string, string> = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c]!;
      if (key === "") {
        continue;
      }
      record[key] = cells[c] ?? "";
    }
    records.push(record);
  }
  return records;
}

export function stringifyCsv(rows: Record<string, string>[], columns: string[]): string {
  const lines = [columns.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(columns.map((col) => escapeCsvField(row[col] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

export function stringifyCsvRow(row: Record<string, string>, columns: string[]): string {
  return columns.map((col) => escapeCsvField(row[col] ?? "")).join(",") + "\n";
}

export function completedRowIndexes(outputText: string): Set<number> {
  const done = new Set<number>();
  if (outputText.trim() === "") {
    return done;
  }
  for (const record of parseCsv(outputText)) {
    const n = Number(record.row_index);
    if (Number.isInteger(n)) {
      done.add(n);
    }
  }
  return done;
}

export function csvHeaderLine(columns: string[]): string {
  return columns.map(escapeCsvField).join(",") + "\n";
}

export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function splitCsvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }

  if (inQuotes) {
    throw new Error("Unterminated quoted CSV field");
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
