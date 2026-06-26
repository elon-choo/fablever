#!/usr/bin/env node
'use strict';
// fake-judge.js — a CONTENT-based blind judge (no position bias): prefers the option that cites evidence
// (a backticked command / "Verified" / "passes"). Reads {optionA,optionB} JSON on stdin, prints {winner}.
const fs = require('fs');
let d = {}; try { d = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (_) {}
const ev = s => /`[^`]+`|verified|passes|exit code 0/i.test(String(s || ''));
const a = ev(d.optionA), b = ev(d.optionB);
const winner = a && !b ? 'A' : b && !a ? 'B' : 'tie';
process.stdout.write(JSON.stringify({ winner }));
