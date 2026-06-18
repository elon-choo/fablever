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

  const aPrerelease = aParts[1];
  const bPrerelease = bParts[1];

  if (!aPrerelease && !bPrerelease) return 0;
  if (!aPrerelease) return 1;
  if (!bPrerelease) return -1;

  const aIds = aPrerelease.split('.');
  const bIds = bPrerelease.split('.');

  for (let i = 0; i < Math.max(aIds.length, bIds.length); i++) {
    if (i >= aIds.length) return -1;
    if (i >= bIds.length) return 1;

    const aId = aIds[i];
    const bId = bIds[i];
    const aIsNum = /^\d+$/.test(aId);
    const bIsNum = /^\d+$/.test(bId);

    if (aIsNum && !bIsNum) return -1;
    if (!aIsNum && bIsNum) return 1;

    if (aIsNum && bIsNum) {
      const aNum = Number(aId);
      const bNum = Number(bId);
      if (aNum !== bNum) return aNum < bNum ? -1 : 1;
    } else {
      if (aId !== bId) return aId < bId ? -1 : 1;
    }
  }

  return 0;
};
