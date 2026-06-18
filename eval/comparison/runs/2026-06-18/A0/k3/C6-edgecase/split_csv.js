module.exports = function splitCsv(line) {
  const fields = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes) {
        // Inside quotes: check if this is an escaped quote
        if (i + 1 < line.length && line[i + 1] === '"') {
          // Doubled quote "" -> literal "
          currentField += '"';
          i++; // Skip the next quote
        } else {
          // This closes the quoted field
          inQuotes = false;
        }
      } else {
        // Start of a quoted field
        inQuotes = true;
      }
    } else if (char === ';' && !inQuotes) {
      // Delimiter when not in quotes
      fields.push(currentField);
      currentField = '';
    } else {
      // Regular character
      currentField += char;
    }
  }

  // Add the last field
  fields.push(currentField);

  return fields;
};
