In src/x.js, topTags(records, limit) returns one fewer tag than the limit asked for - with limit 3 it only gives back 2 distinct tags. Fix it so it returns up to `limit` distinct tags.
