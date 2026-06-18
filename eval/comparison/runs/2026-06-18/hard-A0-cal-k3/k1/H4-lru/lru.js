module.exports = function createLRU(cap) {
  const map = new Map();
  let head = null;
  let tail = null;

  class Node {
    constructor(key, val) {
      this.key = key;
      this.val = val;
      this.prev = null;
      this.next = null;
    }
  }

  function moveToFront(node) {
    if (node === head) return;

    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === tail) tail = node.prev;

    node.prev = null;
    node.next = head;
    if (head) head.prev = node;
    head = node;
    if (!tail) tail = node;
  }

  return {
    get(k) {
      if (!map.has(k)) return undefined;
      const node = map.get(k);
      moveToFront(node);
      return node.val;
    },
    put(k, v) {
      if (map.has(k)) {
        const node = map.get(k);
        node.val = v;
        moveToFront(node);
      } else {
        const node = new Node(k, v);
        map.set(k, node);

        if (head) head.prev = node;
        node.next = head;
        head = node;
        if (!tail) tail = node;

        if (map.size > cap) {
          map.delete(tail.key);
          if (tail.prev) {
            tail.prev.next = null;
            tail = tail.prev;
          } else {
            head = tail = null;
          }
        }
      }
    }
  };
};
