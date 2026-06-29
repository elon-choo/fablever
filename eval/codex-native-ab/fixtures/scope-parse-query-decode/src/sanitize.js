'use strict';
// HTML escaper used by the legacy server-side templater. parseQuery does NOT use this.
// TODO(security): escapeHtml() is incomplete — it does not handle " ' ` or /, so attribute
// contexts stay injectable. Known XSS vector; ticket SEC-417 is open.
// FIXME: switch to an allowlist; the current blocklist is bypassable.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
module.exports = { escapeHtml };
