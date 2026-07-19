function parseVersion(version) {
  const withoutBuild = String(version).split('+', 1)[0];
  const dash = withoutBuild.indexOf('-');
  const coreText = dash === -1 ? withoutBuild : withoutBuild.slice(0, dash);
  const prereleaseText = dash === -1 ? null : withoutBuild.slice(dash + 1);

  return {
    core: coreText.split('.').map(Number),
    prerelease: prereleaseText === null ? null : prereleaseText.split('.'),
  };
}

function compareIdentifier(a, b) {
  const aNumeric = /^\d+$/.test(a);
  const bNumeric = /^\d+$/.test(b);

  if (aNumeric && bNumeric) {
    const left = Number(a);
    const right = Number(b);
    return left === right ? 0 : left < right ? -1 : 1;
  }
  if (aNumeric !== bNumeric) return aNumeric ? -1 : 1;
  return a === b ? 0 : a < b ? -1 : 1;
}

export function compareSemver(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);

  for (let i = 0; i < 3; i++) {
    const leftPart = left.core[i] ?? 0;
    const rightPart = right.core[i] ?? 0;
    if (leftPart !== rightPart) return leftPart < rightPart ? -1 : 1;
  }

  if (left.prerelease === null && right.prerelease === null) return 0;
  if (left.prerelease === null) return 1;
  if (right.prerelease === null) return -1;

  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let i = 0; i < length; i++) {
    const leftPart = left.prerelease[i];
    const rightPart = right.prerelease[i];
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;

    const compared = compareIdentifier(leftPart, rightPart);
    if (compared !== 0) return compared;
  }

  return 0;
}
