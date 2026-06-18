module.exports = function compare(a, b) {
  const aParts = a.split('-');
  const bParts = b.split('-');

  const aVersion = aParts[0].split('.').map(Number);
  const bVersion = bParts[0].split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (aVersion[i] !== bVersion[i]) {
      return aVersion[i] < bVersion[i] ? -1 : 1;
    }
  }

  const aHasPrerelease = aParts.length > 1;
  const bHasPrerelease = bParts.length > 1;

  if (aHasPrerelease !== bHasPrerelease) {
    return aHasPrerelease ? -1 : 1;
  }

  if (!aHasPrerelease) {
    return 0;
  }

  const aPrerelease = aParts[1].split('.');
  const bPrerelease = bParts[1].split('.');

  for (let i = 0; i < Math.max(aPrerelease.length, bPrerelease.length); i++) {
    const aId = aPrerelease[i];
    const bId = bPrerelease[i];

    if (aId === undefined) return -1;
    if (bId === undefined) return 1;

    const aIsNum = /^\d+$/.test(aId);
    const bIsNum = /^\d+$/.test(bId);

    if (aIsNum && bIsNum) {
      const aNum = Number(aId);
      const bNum = Number(bId);
      if (aNum !== bNum) return aNum < bNum ? -1 : 1;
    } else if (aIsNum) {
      return -1;
    } else if (bIsNum) {
      return 1;
    } else {
      if (aId !== bId) return aId < bId ? -1 : 1;
    }
  }

  return 0;
};
