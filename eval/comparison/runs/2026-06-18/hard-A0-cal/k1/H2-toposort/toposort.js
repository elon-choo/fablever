module.exports = function topoSort(nodes, edges) {
  const inDegree = new Map();
  const adjList = new Map();

  for (const node of nodes) {
    inDegree.set(node, 0);
    adjList.set(node, []);
  }

  for (const [a, b] of edges) {
    adjList.get(a).push(b);
    inDegree.set(b, (inDegree.get(b) || 0) + 1);
  }

  const queue = [];
  for (const node of nodes) {
    if (inDegree.get(node) === 0) {
      queue.push(node);
    }
  }

  const result = [];
  while (queue.length > 0) {
    const node = queue.shift();
    result.push(node);

    for (const neighbor of adjList.get(node)) {
      inDegree.set(neighbor, inDegree.get(neighbor) - 1);
      if (inDegree.get(neighbor) === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (result.length !== nodes.length) {
    throw new Error('Cycle detected in graph');
  }

  return result;
};
