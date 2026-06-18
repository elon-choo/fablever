module.exports = function topoSort(nodes, edges) {
  const inDegree = {};
  const adjList = {};

  // Initialize in-degree and adjacency list for all nodes
  for (const node of nodes) {
    inDegree[node] = 0;
    adjList[node] = [];
  }

  // Build the graph from edges
  for (const [a, b] of edges) {
    adjList[a].push(b);
    inDegree[b]++;
  }

  // Find all nodes with in-degree 0
  const queue = [];
  for (const node of nodes) {
    if (inDegree[node] === 0) {
      queue.push(node);
    }
  }

  const result = [];
  while (queue.length > 0) {
    const node = queue.shift();
    result.push(node);

    // Reduce in-degree for all neighbors
    for (const neighbor of adjList[node]) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If not all nodes were processed, a cycle exists
  if (result.length !== nodes.length) {
    throw new Error('Cycle detected in graph');
  }

  return result;
};
