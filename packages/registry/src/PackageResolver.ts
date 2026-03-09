import type { PackageVersion } from './PackageManifest.js';
import type { LocalRegistry } from './LocalRegistry.js';

function parseVersion(v: string): [number, number, number] {
  const parts = v.split('.').map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export class PackageResolver {
  constructor(private registry: LocalRegistry) {}

  resolve(name: string, range: string): PackageVersion | null {
    const matching = this.getMatchingVersions(name, range);
    return matching[0] ?? null;
  }

  satisfies(version: string, range: string): boolean {
    if (range === '*') return true;
    const [major, minor, patch] = parseVersion(version);
    if (range.startsWith('^')) {
      const [rMajor, rMinor, rPatch] = parseVersion(range.slice(1));
      if (major !== rMajor) return false;
      if (minor > rMinor) return true;
      if (minor < rMinor) return false;
      return patch >= rPatch;
    }
    if (range.startsWith('~')) {
      const [rMajor, rMinor, rPatch] = parseVersion(range.slice(1));
      if (major !== rMajor || minor !== rMinor) return false;
      return patch >= rPatch;
    }
    const [rMajor, rMinor, rPatch] = parseVersion(range);
    return major === rMajor && minor === rMinor && patch === rPatch;
  }

  getMatchingVersions(name: string, range: string): PackageVersion[] {
    const pkg = this.registry.getPackage(name);
    if (!pkg) return [];
    if (range === '*') {
      const latest = this.registry.getVersion(name, pkg.latest);
      return latest ? [latest] : [];
    }
    const matching = pkg.versions.filter((v) => this.satisfies(v.version, range));
    matching.sort((a, b) => {
      const [aMaj, aMin, aPat] = parseVersion(a.version);
      const [bMaj, bMin, bPat] = parseVersion(b.version);
      if (bMaj !== aMaj) return bMaj - aMaj;
      if (bMin !== aMin) return bMin - aMin;
      return bPat - aPat;
    });
    return matching;
  }
}
