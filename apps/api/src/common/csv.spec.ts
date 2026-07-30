import { toCsv } from './csv';

interface Row {
  name: string;
  amount: number;
  note: string | null;
}

describe('toCsv', () => {
  it('renders a header row followed by one row per item', () => {
    const rows: Row[] = [{ name: 'Asha', amount: 100, note: 'ok' }];
    const csv = toCsv(rows, [
      { header: 'Name', value: (r) => r.name },
      { header: 'Amount', value: (r) => r.amount },
      { header: 'Note', value: (r) => r.note },
    ]);

    expect(csv).toBe('Name,Amount,Note\r\nAsha,100,ok\r\n');
  });

  it('quotes a field containing a comma', () => {
    const csv = toCsv([{ name: 'Smith, Jones', amount: 1, note: null }] as Row[], [
      { header: 'Name', value: (r) => r.name },
    ]);
    expect(csv).toContain('"Smith, Jones"');
  });

  it('quotes and doubles an embedded quote', () => {
    const csv = toCsv([{ name: 'Say "hi"', amount: 1, note: null }] as Row[], [
      { header: 'Name', value: (r) => r.name },
    ]);
    expect(csv).toContain('"Say ""hi"""');
  });

  it('quotes a field containing a newline', () => {
    const csv = toCsv([{ name: 'line1\nline2', amount: 1, note: null }] as Row[], [
      { header: 'Name', value: (r) => r.name },
    ]);
    expect(csv).toContain('"line1\nline2"');
  });

  it('renders null/undefined values as empty fields, not the string "null"', () => {
    const csv = toCsv([{ name: 'x', amount: 1, note: null }] as Row[], [
      { header: 'Note', value: (r) => r.note },
    ]);
    expect(csv).toBe('Note\r\n\r\n');
  });

  it('renders a header-only CSV for an empty row set', () => {
    const csv = toCsv([] as Row[], [{ header: 'Name', value: (r) => r.name }]);
    expect(csv).toBe('Name\r\n');
  });

  it('leaves an unremarkable field unquoted', () => {
    const csv = toCsv([{ name: 'Asha', amount: 1, note: null }] as Row[], [
      { header: 'Name', value: (r) => r.name },
    ]);
    expect(csv).toBe('Name\r\nAsha\r\n');
  });
});
