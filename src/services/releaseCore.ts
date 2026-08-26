export type UpdateLevel = 'optional' | 'recommended' | 'required';

export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const b = right.split('.').map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function requiresNativeUpgrade(currentVersion: string, minimumVersion: string | null): boolean {
  return Boolean(minimumVersion && compareVersions(currentVersion, minimumVersion) < 0);
}
