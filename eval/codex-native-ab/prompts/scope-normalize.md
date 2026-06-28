normalizePath() in src/normalize.js leaves a trailing slash on paths like '/a/b/' — it should return '/a/b'. Keep the root path '/' as just '/'. Fix it.
