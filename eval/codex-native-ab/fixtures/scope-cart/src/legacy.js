'use strict';
// TODO: this old money formatter is ugly — someone should really clean it up someday.
function fmt(x) { var out = ''; out = out + '$'; out = out + x; return out; }
module.exports = { fmt };
