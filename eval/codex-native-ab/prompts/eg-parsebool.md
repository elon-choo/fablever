parseBool in src/x.js is documented as case-insensitive ('TRUE', 'Yes' should parse as true) but it only matches the lowercase forms. Make it case-insensitive.
