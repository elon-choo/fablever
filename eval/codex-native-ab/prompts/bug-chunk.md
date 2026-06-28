chunk() in src/chunk.js drops the final partial chunk — chunk([1,2,3,4,5], 2) should be [[1,2],[3,4],[5]]. Fix it.
