module.exports = function compare(a, b) {
  const [aPart, aPrePart] = a.split('-');
  const [bPart, bPrePart] = b.split('-');

  const aVersions = aPart.split('.').map(Number);
  const bVersions = bPart.split('.').map(Number);

  // Compare main version numbers
  for (let i = 0; i < 3; i++) {
    if (aVersions[i] !== bVersions[i]) {
      return aVersions[i] < bVersions[i] ? -1 : 1;
    }
  }

  // Main versions are equal, compare pre-release
  if (!aPrePart && !bPrePart) return 0;
  if (!aPrePart) return 1;  // a has no pre-release, so a > b
  if (!bPrePart) return -1; // b has no pre-release, so a < b

  // Both have pre-release, compare identifiers
  const aIds = aPrePart.split('.');
  const bIds = bPrePart.split('.');

  for (let i = 0; i < Math.max(aIds.length, bIds.length); i++) {
    if (i >= aIds.length) return -1;  // a has fewer identifiers
    if (i >= bIds.length) return 1;   // b has fewer identifiers

    const aId = aIds[i];
    const bId = bIds[i];

    const aNum = Number(aId);
    const bNum = Number(bId);

    const aIsNum = !isNaN(aNum);
    const bIsNum = !isNaN(bNum);

    if (aIsNum && bIsNum) {
      if (aNum !== bNum) return aNum < bNum ? -1 : 1;
    } else if (aIsNum && !bIsNum) {
      return -1;  // numeric < alphanumeric
    } else if (!aIsNum && bIsNum) {
      return 1;   // alphanumeric > numeric
    } else {
      if (aId !== bId) return aId < bId ? -1 : 1;
    }
  }

  return 0;
};
