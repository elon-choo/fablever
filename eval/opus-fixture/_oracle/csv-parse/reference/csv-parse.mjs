export function parseCsv(text) {
  if (text === '') return [];

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r' || text[i + 1] !== '\n') {
      field += char;
    }
  }

  if (row.length > 0 || field.length > 0 || !text.endsWith('\n')) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}
