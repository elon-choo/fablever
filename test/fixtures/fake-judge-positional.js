#!/usr/bin/env node
'use strict';
// fake-judge-positional.js — a POSITION-biased judge: always prefers whichever option is shown FIRST (A).
// The harness's order-swapping must catch this as inconsistent, not let it decide a contrast.
const fs = require('fs');
try { fs.readFileSync(0, 'utf8'); } catch (_) {}
process.stdout.write(JSON.stringify({ winner: 'A' }));
