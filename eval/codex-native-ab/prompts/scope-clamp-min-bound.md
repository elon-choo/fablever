clamp in src/clamp.js returns the wrong bound for values below the minimum — clamp(-5, 0, 10) returns 10 instead of 0. Fix it.
